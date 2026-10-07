import { Router } from 'express';
import { query } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import * as breakController from '../controllers/break.controller.js';

const router = Router();

router.use(authenticateToken);

router.post('/start', breakController.start);
router.post('/end', breakController.end);
router.get('/me/current', breakController.current);

// Scoped server-side in visibility.service.js: employees get only their
// own, the manager gets every employee, the CEO gets employees + manager.
router.get(
  '/',
  [
    query('employeeId').optional().isInt({ min: 1 }),
    query('from').optional().isISO8601().withMessage('from must be a valid date'),
    query('to').optional().isISO8601().withMessage('to must be a valid date'),
  ],
  validateRequest,
  breakController.history,
);

export default router;
