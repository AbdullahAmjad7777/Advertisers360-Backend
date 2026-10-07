import { ApiError } from '../utils/ApiError.js';
import { hasPermission } from '../permissions/permissions.js';
import { findActiveEmployeesByRoles } from '../models/visibility.model.js';

// Whose breaks / attendance stats / late counts / calendar a requester may
// see. One place so every team-wide endpoint applies the same rule:
//   CEO      -> every employee and the manager (the CEO doesn't do attendance)
//   manager  -> every employee, plus themselves
//   employee -> only themselves
export async function getVisibleEmployees(user) {
  if (hasPermission(user.role, 'viewManagerRecords')) {
    return findActiveEmployeesByRoles(['employee', 'manager']);
  }
  if (hasPermission(user.role, 'viewTeamRecords')) {
    return findActiveEmployeesByRoles(['employee'], user.id);
  }
  return findActiveEmployeesByRoles([], user.id);
}

// Resolves an optional ?employeeId= filter against what the requester may
// see. Returns the list of employees to report on.
export async function resolveEmployeeScope(user, employeeId) {
  const visible = await getVisibleEmployees(user);
  if (!employeeId) return visible;

  const match = visible.filter((e) => e.id === employeeId);
  if (match.length === 0) {
    throw new ApiError(403, "You do not have permission to view this person's records");
  }
  return match;
}
