import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import * as invitationController from '../controllers/invitation.controller.js';

const router = Router();

router.use(authenticateToken, requirePermission('manageEmployees'));

router.post(
  '/',
  [body('email').isEmail().withMessage('A valid email is required')],
  validateRequest,
  invitationController.invite,
);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['pending', 'completed', 'revoked']),
  ],
  validateRequest,
  invitationController.list,
);

router.post(
  '/:id/resend',
  [param('id').isInt({ min: 1 }).withMessage('Invalid invitation id')],
  validateRequest,
  invitationController.resend,
);

router.delete(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid invitation id')],
  validateRequest,
  invitationController.revoke,
);

export default router;
