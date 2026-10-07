// Central permission matrix. Add a new role by adding one entry here —
// no controller/route code should ever branch on role name directly.

// Shared by CEO and manager. The CEO-only extras (tasks, seeing the
// manager's own records, the late policy) are layered on top in CEO_ACCESS.
const FULL_ACCESS = {
  viewAllEmployees: true,
  manageEmployees: true,
  viewAllAttendance: true,
  manageAttendance: true,
  viewAllLoginActivity: true,
  approveLeaves: true,
  requestOwnLeave: true,
  viewAllPayroll: true,
  generatePayroll: true,
  receiveLoginAlerts: true,
  manageSettings: true,
  // Breaks, attendance %, leave/absence and late stats of every employee.
  viewTeamRecords: true,
  // The same records for the manager account too (not just employees).
  viewManagerRecords: false,
  manageTasks: false,
  // Close a missed check-out so the person can check in again. Who can be
  // unblocked is still scoped by viewTeamRecords/viewManagerRecords.
  unblockCheckIn: true,
  manageLatePolicy: false,
  // Set a new password for someone else. Whose password is still scoped by
  // viewTeamRecords/viewManagerRecords (manager -> employees, CEO -> also
  // the manager), and never your own.
  resetPasswords: true,
};

const CEO_ACCESS = {
  ...FULL_ACCESS,
  viewManagerRecords: true,
  manageTasks: true,
  manageLatePolicy: true,
};

const EMPLOYEE_ACCESS = {
  viewAllEmployees: false,
  manageEmployees: false,
  viewAllAttendance: false,
  manageAttendance: false,
  viewAllLoginActivity: false,
  approveLeaves: false,
  requestOwnLeave: true,
  viewAllPayroll: false,
  generatePayroll: false,
  receiveLoginAlerts: false,
  manageSettings: false,
  viewTeamRecords: false,
  viewManagerRecords: false,
  manageTasks: false,
  unblockCheckIn: false,
  manageLatePolicy: false,
  resetPasswords: false,
};

export const ROLE_PERMISSIONS = {
  ceo: CEO_ACCESS,
  manager: FULL_ACCESS,
  employee: EMPLOYEE_ACCESS,
};

export function hasPermission(role, action) {
  return Boolean(ROLE_PERMISSIONS[role]?.[action]);
}

