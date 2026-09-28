import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
import { hasPermission } from '../permissions/permissions.js';
import * as employeeService from '../services/employee.service.js';

export const create = asyncHandler(async (req, res) => {
  const employee = await employeeService.createEmployee(req.body);
  res.status(201).json({ success: true, message: 'Employee created', data: employee });
});

export const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const status = ['active', 'inactive', 'all'].includes(req.query.status) ? req.query.status : 'active';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  const result = await employeeService.listEmployees({ ...pagination, search, status });
  res.json({ success: true, message: 'Employees fetched', data: result });
});

export const getById = asyncHandler(async (req, res) => {
  const requester = {
    id: req.user.id,
    canViewAllEmployees: hasPermission(req.user.role, 'viewAllEmployees'),
  };
  const employee = await employeeService.getEmployeeById(Number(req.params.id), requester);
  res.json({ success: true, message: 'Employee fetched', data: employee });
});

export const update = asyncHandler(async (req, res) => {
  const employee = await employeeService.updateEmployeeById(Number(req.params.id), req.body);
  res.json({ success: true, message: 'Employee updated', data: employee });
});

export const deactivate = asyncHandler(async (req, res) => {
  const employee = await employeeService.deactivateEmployeeById(Number(req.params.id), req.user.id);
  res.json({ success: true, message: 'Employee deleted', data: employee });
});

export const revokeSession = asyncHandler(async (req, res) => {
  const employee = await employeeService.revokeEmployeeSession(
    Number(req.params.id),
    req.user.id,
    req.app.get('io'),
  );
  res.json({ success: true, message: 'Session reset', data: employee });
});
