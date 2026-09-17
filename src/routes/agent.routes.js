import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import * as agentController from '../controllers/agent.controller.js';

const router = Router();

router.use(authenticateToken);

// Manager/CEO only — each triggers a signal every agent picks up on its
// next poll cycle. Kept as separate individual endpoints (rather than one
// with a type in the body) so each action stays a simple, distinct
// audit-able event; "Fix All Agents Now" below just calls both at once.
router.post('/refresh-all', requirePermission('manageAttendance'), agentController.refreshAll);
router.post('/push-update', requirePermission('manageAttendance'), agentController.pushUpdate);
router.post('/fix-all', requirePermission('manageAttendance'), agentController.fixAll);

router.get(
  '/refresh-all/:requestId',
  requirePermission('manageAttendance'),
  [param('requestId').isInt({ min: 1 }).withMessage('Invalid request id')],
  validateRequest,
  agentController.progress,
);

router.get(
  '/fix-all/progress',
  requirePermission('manageAttendance'),
  [
    query('resyncRequestId').isInt({ min: 1 }).withMessage('resyncRequestId is required'),
    query('updateRequestId').isInt({ min: 1 }).withMessage('updateRequestId is required'),
  ],
  validateRequest,
  agentController.fixAllProgress,
);

// Deleted employees whose agent is still installed/offline — see
// agent-uninstall.routes.js for the endpoints the agent itself uses to
// actually receive and act on the instruction.
router.get('/pending-uninstalls', requirePermission('manageEmployees'), agentController.pendingUninstalls);

// "Mark as Resolved" — a CEO/manager manually confirming a stuck entry is
// handled (machine wiped, agent removed by hand, etc.) instead of it
// waiting forever on an ack that may never come.
router.post(
  '/pending-uninstalls/:employeeId/resolve',
  requirePermission('manageEmployees'),
  [param('employeeId').isInt({ min: 1 }).withMessage('Invalid employee id')],
  validateRequest,
  agentController.resolveUninstall,
);

// Below: called by the desktop agent itself (any authenticated employee,
// not permission-gated — an agent only ever acts on its own account).
router.get('/resync-status', agentController.resyncStatus);

router.post(
  '/resync-ack',
  [
    body('requestId').isInt({ min: 1 }).withMessage('requestId is required'),
    body('updateOutcome').optional({ nullable: true }).isIn(['updated', 'already_current']),
  ],
  validateRequest,
  agentController.ack,
);

export default router;
