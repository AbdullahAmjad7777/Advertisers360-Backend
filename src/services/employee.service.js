import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta } from '../utils/pagination.js';
import { invalidateActiveStatusCache } from '../middleware/auth.js';
import { syncBasicSalaryFromEmployee } from '../models/payroll.model.js';
import {
  generateNextEmployeeCode,
  insertEmployee,
  findEmployeeDetailById,
  findEmployeesPaginated,
  updateEmployee,
  deleteEmployeeCascade,
  bumpSessionEpoch,
  updatePasswordHash,
  insertPasswordResetAudit,
} from '../models/employee.model.js';
import { createBulkNotifications } from '../models/notification.model.js';
import { resolveEmployeeScope } from './visibility.service.js';
import { insertUninstallRequest } from '../models/agent.model.js';
import { findRoleNameById, findOtherHoldersOfRole } from '../models/lookup.model.js';

const SALT_ROUNDS = 10;

// The company has exactly one CEO and one manager. Enforced here, on create
// and on role change, rather than only in the UI.
const SINGLE_HOLDER_ROLES = new Set(['ceo', 'manager']);

async function assertRoleAvailable(roleId, employeeId) {
  const roleName = await findRoleNameById(roleId);
  if (!roleName || !SINGLE_HOLDER_ROLES.has(roleName)) return;
  const holders = await findOtherHoldersOfRole(roleId, employeeId);
  if (holders.length > 0) {
    throw new ApiError(
      409,
      `There can only be one ${roleName === 'ceo' ? 'CEO' : 'manager'}. ${holders[0].full_name} already has this role.`,
      'ROLE_ALREADY_TAKEN',
    );
  }
}

export async function createEmployee(input) {
  await assertRoleAvailable(input.roleId, null);
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const employeeCode = await generateNextEmployeeCode(connection);
    const insertId = await insertEmployee(connection, {
      ...input,
      employeeCode,
      passwordHash,
    });
    await connection.commit();
    await syncBasicSalaryFromEmployee(insertId, input.baseSalary ?? 0, input.joinDate);
    return findEmployeeDetailById(insertId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function listEmployees({ page, limit, offset, search, status }) {
  const { rows, total } = await findEmployeesPaginated({ limit, offset, search, status });
  return { items: rows, pagination: buildPaginationMeta(page, limit, total) };
}

export async function getEmployeeById(id, requester) {
  const isSelf = requester.id === id;
  if (!requester.canViewAllEmployees && !isSelf) {
    throw new ApiError(403, 'You do not have permission to view this employee');
  }

  const employee = await findEmployeeDetailById(id);
  if (!employee) {
    throw new ApiError(404, 'Employee not found');
  }
  return employee;
}

export async function updateEmployeeById(id, fields) {
  const existing = await findEmployeeDetailById(id);
  if (!existing) {
    throw new ApiError(404, 'Employee not found');
  }

  if (fields.roleId !== undefined && Number(fields.roleId) !== existing.role_id) {
    await assertRoleAvailable(fields.roleId, id);
  }

  await updateEmployee(id, fields);

  if (Object.prototype.hasOwnProperty.call(fields, 'baseSalary')) {
    await syncBasicSalaryFromEmployee(id, fields.baseSalary ?? 0, existing.join_date);
  }

  return findEmployeeDetailById(id);
}

export async function deactivateEmployeeById(id, requesterId) {
  if (id === requesterId) {
    throw new ApiError(400, 'You cannot deactivate your own account');
  }

  const existing = await findEmployeeDetailById(id);
  if (!existing) {
    throw new ApiError(404, 'Employee not found');
  }

  const snapshot = { ...existing };

  // Recorded before the cascade delete below removes the employees row
  // entirely — this tombstone is what lets the desktop agent (and the
  // dashboard) still find out "this employee was deleted, uninstall
  // yourself" afterwards, including for an agent that's offline right now
  // and only reconnects days/weeks later. See 022_agent_uninstall.sql.
  await insertUninstallRequest({
    employeeId: id,
    employeeCode: existing.employee_code,
    fullName: existing.full_name,
    requestedBy: requesterId,
  });

  invalidateActiveStatusCache(id);
  await deleteEmployeeCascade(id);
  return snapshot;
}

// Forces the employee's web session (and desktop agent, which shares the
// same access/refresh token machinery) to drop and re-authenticate, without
// touching is_active. An open browser tab gets an instant push over its
// socket's `user:${id}` room; anything else (a closed tab, the desktop
// agent) falls back to the session_epoch check in authenticate()/
// refreshAccessToken() the next time it makes an API call — see
// middleware/auth.js and auth.service.js.
export async function revokeEmployeeSession(id, requesterId, io) {
  if (id === requesterId) {
    throw new ApiError(400, 'You cannot force-refresh your own session');
  }

  const existing = await findEmployeeDetailById(id);
  if (!existing) {
    throw new ApiError(404, 'Employee not found');
  }

  await bumpSessionEpoch(id);
  invalidateActiveStatusCache(id);

  io?.to(`user:${id}`).emit('force-logout', {
    message: 'Your session was reset by an admin. Please log in again.',
  });

  return existing;
}

// CEO/manager sets a new password for someone else (e.g. they forgot it).
// Scope comes from visibility.service: the manager can reset employees, the
// CEO employees and the manager; nobody can reset the CEO this way, and
// nobody can reset their own password here. The employee gets an in-app
// notification, and the reset is recorded in audit_logs (without the
// password). With signOutEverywhere, every existing web + desktop-agent
// session is ended too (same mechanism as revokeEmployeeSession).
export async function resetEmployeePassword(requester, id, { newPassword, signOutEverywhere }, io) {
  if (id === requester.id) {
    throw new ApiError(400, 'You cannot reset your own password here');
  }
  const existing = await findEmployeeDetailById(id);
  if (!existing) {
    throw new ApiError(404, 'Employee not found');
  }
  try {
    await resolveEmployeeScope(requester, id);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 403) {
      throw new ApiError(403, "You do not have permission to reset this person's password");
    }
    throw err;
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await updatePasswordHash(id, passwordHash);
  await insertPasswordResetAudit({
    performedBy: requester.id,
    employeeId: id,
    signedOutEverywhere: Boolean(signOutEverywhere),
  });

  if (signOutEverywhere) {
    await bumpSessionEpoch(id);
    invalidateActiveStatusCache(id);
    io?.to(`user:${id}`).emit('force-logout', {
      message: 'Your password was changed by an admin. Please log in with your new password.',
    });
  }

  await createBulkNotifications([
    {
      recipientId: id,
      type: 'password_reset',
      message: 'Your password was changed by your manager or the CEO. Ask them for the new password if you need it.',
      relatedEmployeeId: requester.id,
    },
  ]);

  return { id: existing.id, fullName: existing.full_name, signedOutEverywhere: Boolean(signOutEverywhere) };
}
