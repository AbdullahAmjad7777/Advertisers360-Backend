import { ApiError } from '../utils/ApiError.js';
import { hasPermission } from '../permissions/permissions.js';
import { resolveShiftDate } from '../utils/shift.js';
import { getOfficeHours } from './settings.service.js';
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

export async function createTask(creatorId, { title, description, assignedTo, dueDate }) {
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

// The CEO sees every task (optionally filtered); everyone else only ever
// sees tasks assigned to them, whatever filter they pass.
export async function listTasks(user, { assignedTo, status, from, to }) {
  const canManage = hasPermission(user.role, 'manageTasks');
  return findTasks({
    assignedTo: canManage ? assignedTo : user.id,
    status,
    from,
    to,
  });
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

export async function removeTask(id) {
  const existing = await findTaskById(id);
  if (!existing) throw new ApiError(404, 'Task not found');
  await deleteTask(id);
  return existing;
}
