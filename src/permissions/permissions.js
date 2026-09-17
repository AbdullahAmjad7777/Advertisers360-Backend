// Central permission matrix. Add a new role by adding one entry here —
// no controller/route code should ever branch on role name directly.

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
};

export const ROLE_PERMISSIONS = {
  ceo: FULL_ACCESS,
  manager: FULL_ACCESS,
  employee: EMPLOYEE_ACCESS,
};

export function hasPermission(role, action) {
  return Boolean(ROLE_PERMISSIONS[role]?.[action]);
}

