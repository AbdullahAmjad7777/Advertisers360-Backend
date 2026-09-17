import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import * as payrollController from '../controllers/payroll.controller.js';

const router = Router();

router.use(authenticateToken);

const salaryStructureValidators = [
  body('basicSalary').isFloat({ min: 0 }).withMessage('basicSalary is required'),
  body('houseRentAllowance').optional().isFloat({ min: 0 }),
  body('medicalAllowance').optional().isFloat({ min: 0 }),
  body('transportAllowance').optional().isFloat({ min: 0 }),
  body('otherAllowance').optional().isFloat({ min: 0 }),
  body('effectiveFrom').isISO8601().withMessage('effectiveFrom must be a valid date'),
];

router.post(
  '/salary-structure/:employeeId',
  requirePermission('generatePayroll'),
  [param('employeeId').isInt({ min: 1 }).withMessage('Invalid employee id'), ...salaryStructureValidators],
  validateRequest,
  payrollController.setSalaryStructure,
);

router.get(
  '/salary-structure/:employeeId',
  [param('employeeId').isInt({ min: 1 }).withMessage('Invalid employee id')],
  validateRequest,
  payrollController.getSalaryStructure,
);

router.get('/deduction-rules', requirePermission('generatePayroll'), payrollController.listDeductionRules);

router.post(
  '/deduction-rules',
  requirePermission('generatePayroll'),
  [
    body('ruleName').trim().notEmpty().withMessage('ruleName is required'),
    body('ruleType').isIn(['tax', 'provident_fund', 'late_penalty', 'absent_penalty', 'other']),
    body('percentageOrFixed').isIn(['percentage', 'fixed']),
    body('value').isFloat({ min: 0 }).withMessage('value is required'),
    body('isActive').optional().isBoolean(),
  ],
  validateRequest,
  payrollController.createDeductionRule,
);

router.patch(
  '/deduction-rules/:id',
  requirePermission('generatePayroll'),
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid rule id'),
    body('ruleName').optional().trim().notEmpty(),
    body('ruleType').optional().isIn(['tax', 'provident_fund', 'late_penalty', 'absent_penalty', 'other']),
    body('percentageOrFixed').optional().isIn(['percentage', 'fixed']),
    body('value').optional().isFloat({ min: 0 }),
    body('isActive').optional().isBoolean(),
  ],
  validateRequest,
  payrollController.updateDeductionRule,
);

router.post(
  '/generate',
  requirePermission('generatePayroll'),
  [
    body('employeeId').isInt({ min: 1 }).withMessage('employeeId is required'),
    body('month').isInt({ min: 1, max: 12 }).withMessage('month must be between 1 and 12'),
    body('year').isInt({ min: 2000, max: 2100 }).withMessage('year is required'),
  ],
  validateRequest,
  payrollController.generate,
);

router.post(
  '/generate-bulk',
  requirePermission('generatePayroll'),
  [
    body('month').isInt({ min: 1, max: 12 }).withMessage('month must be between 1 and 12'),
    body('year').isInt({ min: 2000, max: 2100 }).withMessage('year is required'),
  ],
  validateRequest,
  payrollController.generateBulk,
);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('employeeId').optional().isInt({ min: 1 }),
    query('month').optional().isInt({ min: 1, max: 12 }),
    query('year').optional().isInt({ min: 2000, max: 2100 }),
    query('status').optional().isIn(['draft', 'finalized', 'paid']),
  ],
  validateRequest,
  payrollController.list,
);

router.get(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid payroll id')],
  validateRequest,
  payrollController.getById,
);

router.patch(
  '/:id/finalize',
  requirePermission('generatePayroll'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid payroll id')],
  validateRequest,
  payrollController.finalize,
);

router.patch(
  '/:id/mark-paid',
  requirePermission('generatePayroll'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid payroll id')],
  validateRequest,
  payrollController.markPaid,
);

export default router;
