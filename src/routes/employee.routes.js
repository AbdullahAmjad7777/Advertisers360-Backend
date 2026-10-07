import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import * as employeeController from '../controllers/employee.controller.js';
import { employeeFieldLengthValidators } from '../utils/fieldLimits.js';

const router = Router();

router.use(authenticateToken);

const createValidators = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().withMessage('A valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('phone').optional().isString(),
  body('cnicNumber').optional().isString(),
  body('gender').optional().isIn(['male', 'female', 'other']),
  body('dateOfBirth').optional().isISO8601().withMessage('dateOfBirth must be a valid date'),
  body('departmentId').optional().isInt({ min: 1 }),
  body('designationId').optional().isInt({ min: 1 }),
  body('roleId').isInt({ min: 1 }).withMessage('roleId is required'),
  body('managerId').optional().isInt({ min: 1 }),
  body('joinDate').isISO8601().withMessage('joinDate must be a valid date'),
  body('baseSalary').optional().isFloat({ min: 0 }),
  ...employeeFieldLengthValidators(['fullName', 'phone', 'cnicNumber']),
];

const updateValidators = [
  body('fullName').optional().trim().notEmpty(),
  body('email').optional().isEmail().withMessage('A valid email is required'),
  body('phone').optional().isString(),
  body('cnicNumber').optional().isString(),
  body('gender').optional().isIn(['male', 'female', 'other']),
  body('dateOfBirth').optional().isISO8601().withMessage('dateOfBirth must be a valid date'),
  body('departmentId').optional().isInt({ min: 1 }),
  body('designationId').optional().isInt({ min: 1 }),
  body('roleId').optional().isInt({ min: 1 }),
  body('managerId').optional().isInt({ min: 1 }),
  body('joinDate').optional().isISO8601().withMessage('joinDate must be a valid date'),
  body('baseSalary').optional().isFloat({ min: 0 }),
  body('shiftStartTime')
    .optional({ nullable: true })
    .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
    .withMessage('shiftStartTime must be in HH:MM:SS format'),
  body('shiftEndTime')
    .optional({ nullable: true })
    .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
    .withMessage('shiftEndTime must be in HH:MM:SS format'),
  ...employeeFieldLengthValidators(['fullName', 'phone', 'cnicNumber']),
];

router.post(
  '/',
  requirePermission('manageEmployees'),
  createValidators,
  validateRequest,
  employeeController.create,
);

router.get(
  '/',
  requirePermission('viewAllEmployees'),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['active', 'inactive', 'all']),
  ],
  validateRequest,
  employeeController.list,
);

router.get(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid employee id')],
  validateRequest,
  employeeController.getById,
);

router.patch(
  '/:id',
  requirePermission('manageEmployees'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid employee id'), ...updateValidators],
  validateRequest,
  employeeController.update,
);

router.delete(
  '/:id',
  requirePermission('manageEmployees'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid employee id')],
  validateRequest,
  employeeController.deactivate,
);

router.post(
  '/:id/revoke-session',
  requirePermission('manageEmployees'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid employee id')],
  validateRequest,
  employeeController.revokeSession,
);

// Body holds a password: never log it (errorHandler doesn't log bodies).
router.post(
  '/:id/reset-password',
  requirePermission('resetPasswords'),
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid employee id'),
    // bcrypt only uses the first 72 bytes, so longer passwords are rejected
    // instead of being silently truncated.
    body('newPassword')
      .isString()
      .isLength({ min: 8, max: 72 })
      .withMessage('Password must be 8-72 characters'),
    body('signOutEverywhere').optional().isBoolean().toBoolean(),
  ],
  validateRequest,
  employeeController.resetPassword,
);

export default router;
