import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import * as attendanceController from '../controllers/attendance.controller.js';

const router = Router();

router.use(authenticateToken);

router.post('/check-in', attendanceController.checkIn);
router.post('/check-out', attendanceController.checkOut);

// The current/most-recently-open shift's record, resolved by shift date
// (not calendar date) — what the dashboard's check-in/check-out button
// should read instead of querying history by today's plain date, which
// stops matching once an overnight shift crosses midnight.
router.get('/me/current', attendanceController.currentStatus);

router.get(
  '/today',
  requirePermission('viewAllAttendance'),
  [query('page').optional().isInt({ min: 1 }), query('limit').optional().isInt({ min: 1, max: 100 })],
  validateRequest,
  attendanceController.today,
);

router.get(
  '/trend',
  [
    query('days').optional().isInt({ min: 1, max: 90 }),
    query('employeeId').optional().isInt({ min: 1 }),
  ],
  validateRequest,
  attendanceController.trend,
);

router.get(
  '/employee/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid employee id'),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('from').optional().isISO8601().withMessage('from must be a valid date'),
    query('to').optional().isISO8601().withMessage('to must be a valid date'),
  ],
  validateRequest,
  attendanceController.historyByEmployee,
);

router.patch(
  '/:id/correct',
  requirePermission('manageAttendance'),
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid attendance id'),
    body('checkInTime').optional({ nullable: true }).isISO8601().withMessage('checkInTime must be a valid datetime'),
    body('checkOutTime').optional({ nullable: true }).isISO8601().withMessage('checkOutTime must be a valid datetime'),
    body('status').optional().isIn(['present', 'late', 'absent', 'on_leave', 'half_day', 'holiday']),
    body('reason').optional({ nullable: true }).isString().isLength({ max: 255 }),
  ],
  validateRequest,
  attendanceController.correct,
);

router.get(
  '/:id/edit-log',
  requirePermission('manageAttendance'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid attendance id')],
  validateRequest,
  attendanceController.editLog,
);

export default router;
