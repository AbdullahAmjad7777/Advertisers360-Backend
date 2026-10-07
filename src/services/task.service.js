import { ApiError } from '../utils/ApiError.js';
import { hasPermission } from '../permissions/permissions.js';
import { resolveShiftDate } from '../utils/shift.js';
import { getOfficeHours } from './settings.service.js';
import { getVisibleEmployees } from './visibility.service.js';
import {
  findTaskById,
  findTasks,
  insertTask,
  updateTaskFields,
  setTaskCompleted,
  deleteTask,
  findAssignableEmployee,
} from '../models/task.model.js';

const ASSIGNABLE_ROLES = new Set(['employee', 'manager']);

async function assertAssignable(employeeId) {
  const employee = await findAssignableEmployee(employeeId);
  if (!employee || employee.is_active !== 1) {
    throw new ApiError(422, 'The selected assignee does not exist or is inactive');
  }
  if (!ASSIGNABLE_ROLES.has(employee.role_name)) {
    throw new ApiError(422, 'Tasks can only be assigned to employees or the manager');
  }
}

// Defaults a missing due date to the shift currently in progress, so a task
// created at 1:00 AM is due on the shift that started the previous evening.
async function defaultDueDate() {
  const { officeStartTime, officeEndTime } = await getOfficeHours();
  return resolveShiftDate(officeStartTime, officeEndTime, new Date());
}

// The CEO assigns tasks to anyone (employees or the manager). Everyone else
// can only add a task for themselves: whatever assignedTo they send, it's
// forced to their own id. Self-added tasks show up for the CEO and the
// manager, and count toward check-out like any other task due that shift.
export async function createTask(user, { title, description, assignedTo, dueDate }) {
  if (!hasPermission(user.role, 'manageTasks')) {
    if (!hasPermission(user.role, 'addOwnTasks')) {
      throw new ApiError(403, 'You do not have permission to add tasks');
    }
    assignedTo = user.id;
  }
  if (!assignedTo) throw new ApiError(422, 'assignedTo is required');
  const creatorId = user.id;
  await assertAssignable(assignedTo);
  const id = await insertTask({
    title,
    description,
    assignedTo,
    assignedBy: creatorId,
    dueDate: dueDate ?? (await defaultDueDate()),
  });
  return findTaskById(id);
}

// The CEO sees every task (optionally filtered). The manager sees their own
// by default, or with scope=team every employee's (+ their own); a filter
// outside that set returns nothing. Employees only ever see their own.
export async function listTasks(user, { assignedTo, status, from, to, scope }) {
  if (hasPermission(user.role, 'manageTasks')) {
    return findTasks({ assignedTo, status, from, to });
  }
  if (scope === 'team' && hasPermission(user.role, 'viewTeamRecords')) {
    const teamIds = (await getVisibleEmployees(user)).map((p) => p.id);
    const ids = assignedTo ? teamIds.filter((id) => id === assignedTo) : teamIds;
    return findTasks({ assignedToIn: ids, status, from, to });
  }
  return findTasks({ assignedTo: user.id, status, from, to });
}

export async function updateTask(id, fields) {
  const existing = await findTaskById(id);
  if (!existing) throw new ApiError(404, 'Task not found');

  const next = {
    title: fields.title ?? existing.title,
    description: fields.description !== undefined ? fields.description : existing.description,
    assignedTo: fields.assignedTo ?? existing.assigned_to,
    dueDate: fields.dueDate ?? existing.due_date,
  };
  if (next.assignedTo !== existing.assigned_to) await assertAssignable(next.assignedTo);

  await updateTaskFields(id, next);
  return findTaskById(id);
}

// Only the assignee ticks their own task. Enforced here, not just by the
// UI hiding the checkbox.
export async function setCompletion(user, id, completed) {
  const existing = await findTaskById(id);
  if (!existing) throw new ApiError(404, 'Task not found');
  if (existing.assigned_to !== user.id) {
    throw new ApiError(403, 'Only the person this task is assigned to can mark it complete');
  }
  await setTaskCompleted(id, completed);
  return findTaskById(id);
}

// The CEO can delete any task; anyone else only a task they added for
// themselves (not one the CEO assigned them).
export async function removeTask(user, id) {
  const existing = await findTaskById(id);
  if (!existing) throw new ApiError(404, 'Task not found');
  const isOwnSelfAdded = existing.assigned_by === user.id && existing.assigned_to === user.id;
  if (!hasPermission(user.role, 'manageTasks') && !isOwnSelfAdded) {
    throw new ApiError(403, 'You can only delete tasks you added yourself');
  }
  await deleteTask(id);
  return existing;
}
