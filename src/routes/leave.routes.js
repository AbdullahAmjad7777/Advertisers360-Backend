import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import * as leaveController from '../controllers/leave.controller.js';

const router = Router();

router.use(authenticateToken);

router.get('/types', leaveController.types);

router.post(
  '/',
  requirePermission('requestOwnLeave'),
  [
    body('leaveTypeId').isInt({ min: 1 }).withMessage('leaveTypeId is required'),
    body('fromDate').isISO8601().withMessage('fromDate must be a valid date'),
    body('toDate').isISO8601().withMessage('toDate must be a valid date'),
    body('reason').optional().isString().isLength({ max: 500 }),
  ],
  validateRequest,
  leaveController.apply,
);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['pending', 'approved', 'rejected', 'cancelled']),
    query('employeeId').optional().isInt({ min: 1 }),
  ],
  validateRequest,
  leaveController.list,
);

router.get(
  '/balance/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid employee id'),
    query('year').optional().isInt({ min: 2000, max: 2100 }),
  ],
  validateRequest,
  leaveController.balance,
);

router.get(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid leave id')],
  validateRequest,
  leaveController.getById,
);

router.patch(
  '/:id/approve',
  requirePermission('approveLeaves'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid leave id')],
  validateRequest,
  leaveController.approve,
);

router.patch(
  '/:id/reject',
  requirePermission('approveLeaves'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid leave id')],
  validateRequest,
  leaveController.reject,
);

router.patch(
  '/:id/cancel',
  [param('id').isInt({ min: 1 }).withMessage('Invalid leave id')],
  validateRequest,
  leaveController.cancel,
);

export default router;
