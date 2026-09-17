import { pool } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { buildPaginationMeta } from '../utils/pagination.js';
import { findEmployeeDetailById } from '../models/employee.model.js';
import {
  findAllLeaveTypes,
  findLeaveTypeById,
  findOverlappingLeave,
  insertLeave,
  findLeaveDetailById,
  lockLeaveById,
  findLeavesPaginated,
  updateLeaveStatus,
  setLeaveCancelled,
  getOrCreateBalance,
  adjustBalanceUsed,
  findBalancesForEmployee,
} from '../models/leave.model.js';

function calculateTotalDays(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  const diffDays = Math.round((to - from) / (1000 * 60 * 60 * 24));
  return diffDays + 1;
}

function assertCanAccessEmployee(requester, employeeId) {
  const isSelf = requester.id === employeeId;
  if (!requester.canManageLeaves && !isSelf) {
    throw new ApiError(403, 'You do not have permission to view this employee\'s leave records');
  }
}

export async function listLeaveTypes() {
  return findAllLeaveTypes();
}

export async function applyForLeave(employeeId, { leaveTypeId, fromDate, toDate, reason }) {
  if (new Date(`${toDate}T00:00:00Z`) < new Date(`${fromDate}T00:00:00Z`)) {
    throw new ApiError(422, 'toDate must be on or after fromDate');
  }

  const leaveType = await findLeaveTypeById(leaveTypeId);
  if (!leaveType) {
    throw new ApiError(404, 'Leave type not found');
  }

  const overlapping = await findOverlappingLeave(employeeId, fromDate, toDate);
  if (overlapping) {
    throw new ApiError(409, 'You already have a pending or approved leave overlapping these dates');
  }

  const totalDays = calculateTotalDays(fromDate, toDate);
  const year = new Date(`${fromDate}T00:00:00Z`).getUTCFullYear();

  if (leaveType.is_paid) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const balance = await getOrCreateBalance(connection, employeeId, leaveTypeId, year, leaveType.default_annual_quota);
      if (balance.total_allotted - balance.used < totalDays) {
        throw new ApiError(409, 'Insufficient leave balance for this request');
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  const insertId = await insertLeave(employeeId, { leaveTypeId, fromDate, toDate, totalDays, reason });
  return findLeaveDetailById(insertId);
}

export async function listLeaves(requester, { page, limit, offset, status, employeeId }) {
  const filterEmployeeId = requester.canManageLeaves ? employeeId : requester.id;
  const { rows, total } = await findLeavesPaginated({ limit, offset, employeeId: filterEmployeeId, status });
  return { items: rows, pagination: buildPaginationMeta(page, limit, total) };
}

export async function getLeaveById(id, requester) {
  const leave = await findLeaveDetailById(id);
  if (!leave) {
    throw new ApiError(404, 'Leave request not found');
  }
  assertCanAccessEmployee(requester, leave.employee_id);
  return leave;
}

export async function approveLeave(leaveId, approverId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const leave = await lockLeaveById(connection, leaveId);
    if (!leave) {
      throw new ApiError(404, 'Leave request not found');
    }
    if (leave.status !== 'pending') {
      throw new ApiError(409, `Leave request has already been ${leave.status}`);
    }

    const leaveType = await findLeaveTypeById(leave.leave_type_id);
    const year = new Date(`${leave.from_date}T00:00:00Z`).getUTCFullYear();

    if (leaveType.is_paid) {
      const balance = await getOrCreateBalance(connection, leave.employee_id, leave.leave_type_id, year, leaveType.default_annual_quota);
      if (balance.total_allotted - balance.used < leave.total_days) {
        throw new ApiError(409, 'Employee no longer has sufficient leave balance for this request');
      }
      await adjustBalanceUsed(connection, balance.id, leave.total_days);
    }

    await updateLeaveStatus(connection, leaveId, { status: 'approved', approvedBy: approverId });
    await connection.commit();
    return findLeaveDetailById(leaveId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function rejectLeave(leaveId, approverId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const leave = await lockLeaveById(connection, leaveId);
    if (!leave) {
      throw new ApiError(404, 'Leave request not found');
    }
    if (leave.status !== 'pending') {
      throw new ApiError(409, `Leave request has already been ${leave.status}`);
    }

    await updateLeaveStatus(connection, leaveId, { status: 'rejected', approvedBy: approverId });
    await connection.commit();
    return findLeaveDetailById(leaveId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function cancelLeave(leaveId, requester) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const leave = await lockLeaveById(connection, leaveId);
    if (!leave) {
      throw new ApiError(404, 'Leave request not found');
    }
    assertCanAccessEmployee(requester, leave.employee_id);
    if (!['pending', 'approved'].includes(leave.status)) {
      throw new ApiError(409, `Leave request has already been ${leave.status}`);
    }

    if (leave.status === 'approved') {
      const leaveType = await findLeaveTypeById(leave.leave_type_id);
      const year = new Date(`${leave.from_date}T00:00:00Z`).getUTCFullYear();
      if (leaveType.is_paid) {
        const balance = await getOrCreateBalance(connection, leave.employee_id, leave.leave_type_id, year, leaveType.default_annual_quota);
        await adjustBalanceUsed(connection, balance.id, -leave.total_days);
      }
    }

    await setLeaveCancelled(connection, leaveId);
    await connection.commit();
    return findLeaveDetailById(leaveId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function getBalances(employeeId, year, requester) {
  assertCanAccessEmployee(requester, employeeId);

  const employee = await findEmployeeDetailById(employeeId);
  if (!employee) {
    throw new ApiError(404, 'Employee not found');
  }

  return findBalancesForEmployee(employeeId, year);
}
