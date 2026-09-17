import { Router } from 'express';
import { body } from 'express-validator';
import { validateRequest } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('A valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
    body('accuracy').optional().isFloat({ min: 0 }),
  ],
  validateRequest,
  authController.login,
);

// Desktop-agent only: email/password auth with no office-location check
// (the agent never has a location fix to send). See agentLogin() in
// auth.service.js for why this is a separate endpoint, not a flag on /login.
router.post(
  '/agent-login',
  [
    body('email').isEmail().withMessage('A valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validateRequest,
  authController.agentLogin,
);

router.post('/refresh', authController.refresh);
router.post('/logout', authenticateToken, authController.logout);
router.get('/me', authenticateToken, authController.me);

router.post(
  '/verify-location',
  authenticateToken,
  [
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
    body('accuracy').optional().isFloat({ min: 0 }),
  ],
  validateRequest,
  authController.verifyLocation,
);

export default router;
