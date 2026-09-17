import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
import { hasPermission } from '../permissions/permissions.js';
import * as payrollService from '../services/payroll.service.js';

function buildRequester(req) {
  return {
    id: req.user.id,
    canViewAllPayroll: hasPermission(req.user.role, 'viewAllPayroll'),
  };
}

export const setSalaryStructure = asyncHandler(async (req, res) => {
  const structure = await payrollService.setSalaryStructure(Number(req.params.employeeId), req.body);
  res.status(201).json({ success: true, message: 'Salary structure saved', data: structure });
});

export const getSalaryStructure = asyncHandler(async (req, res) => {
  const requester = buildRequester(req);
  const structure = await payrollService.getSalaryStructure(Number(req.params.employeeId), requester);
  res.json({ success: true, message: 'Salary structure fetched', data: structure });
});

export const listDeductionRules = asyncHandler(async (req, res) => {
  const rules = await payrollService.listDeductionRules();
  res.json({ success: true, message: 'Deduction rules fetched', data: rules });
});

export const createDeductionRule = asyncHandler(async (req, res) => {
  const rule = await payrollService.createDeductionRule(req.body);
  res.status(201).json({ success: true, message: 'Deduction rule created', data: rule });
});

export const updateDeductionRule = asyncHandler(async (req, res) => {
  const rule = await payrollService.updateDeductionRuleById(Number(req.params.id), req.body);
  res.json({ success: true, message: 'Deduction rule updated', data: rule });
});

export const generate = asyncHandler(async (req, res) => {
  const { employeeId, month, year } = req.body;
  const payroll = await payrollService.generatePayroll(Number(employeeId), Number(month), Number(year));
  res.status(201).json({ success: true, message: 'Payroll generated', data: payroll });
});

export const generateBulk = asyncHandler(async (req, res) => {
  const { month, year } = req.body;
  const result = await payrollService.generatePayrollBulk(Number(month), Number(year));
  res.status(201).json({ success: true, message: 'Payroll generation completed', data: result });
});

export const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const requester = buildRequester(req);

  const result = await payrollService.listPayroll(requester, {
    ...pagination,
    employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    status: req.query.status,
  });
  res.json({ success: true, message: 'Payroll records fetched', data: result });
});

export const getById = asyncHandler(async (req, res) => {
  const requester = buildRequester(req);
  const payroll = await payrollService.getPayrollById(Number(req.params.id), requester);
  res.json({ success: true, message: 'Payroll record fetched', data: payroll });
});

export const finalize = asyncHandler(async (req, res) => {
  const payroll = await payrollService.finalizePayroll(Number(req.params.id));
  res.json({ success: true, message: 'Payroll finalized', data: payroll });
});

export const markPaid = asyncHandler(async (req, res) => {
  const payroll = await payrollService.markPayrollPaid(Number(req.params.id));
  res.json({ success: true, message: 'Payroll marked as paid', data: payroll });
});
