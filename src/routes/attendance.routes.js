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

// Whether a missed check-out on an earlier shift is blocking check-in, so
// the dashboard can explain it before the employee even clicks.
router.get('/me/check-in-block', attendanceController.checkInBlock);

// The endpoints below are scoped per requester in visibility.service.js:
// employee -> self, manager -> all employees (+ self), CEO -> employees + manager.
router.get(
  '/stats',
  [
    query('month').optional().isInt({ min: 1, max: 12 }),
    query('year').optional().isInt({ min: 2000, max: 2100 }),
  ],
  validateRequest,
  attendanceController.stats,
);

router.get(
  '/late-summary',
  [
    query('month').optional().isInt({ min: 1, max: 12 }),
    query('year').optional().isInt({ min: 2000, max: 2100 }),
  ],
  validateRequest,
  attendanceController.lateSummary,
);

router.get('/missed-checkouts', requirePermission('unblockCheckIn'), attendanceController.missedCheckouts);

router.post(
  '/:id/close-missed-checkout',
  requirePermission('unblockCheckIn'),
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid attendance id'),
    body('checkOutTime').isISO8601().withMessage('checkOutTime must be a valid datetime'),
    body('reason').trim().notEmpty().isLength({ max: 200 }).withMessage('A reason is required'),
  ],
  validateRequest,
  attendanceController.closeMissedCheckout,
);

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
