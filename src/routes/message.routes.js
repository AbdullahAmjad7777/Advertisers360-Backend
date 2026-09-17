import { Router } from 'express';
import { param } from 'express-validator';
import { authenticateToken, authenticateTokenFlexible } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import * as messageController from '../controllers/message.controller.js';

const router = Router();

router.patch(
  '/:id/read',
  authenticateToken,
  [param('id').isInt({ min: 1 }).withMessage('Invalid message id')],
  validateRequest,
  messageController.markRead,
);

router.get(
  '/:id/attachment',
  authenticateTokenFlexible,
  [param('id').isInt({ min: 1 }).withMessage('Invalid message id')],
  validateRequest,
  messageController.getAttachment,
);

export default router;
