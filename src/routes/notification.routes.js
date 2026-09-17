import { Router } from 'express';
import { param } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import * as notificationController from '../controllers/notification.controller.js';

const router = Router();

router.use(authenticateToken);

router.get('/', notificationController.list);

router.patch(
  '/:id/read',
  [param('id').isInt({ min: 1 }).withMessage('Invalid notification id')],
  validateRequest,
  notificationController.markRead,
);

export default router;
