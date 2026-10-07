import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import * as taskController from '../controllers/task.controller.js';

const router = Router();

router.use(authenticateToken);

const idParam = param('id').isInt({ min: 1 }).withMessage('Invalid task id');

// Non-CEO callers are always narrowed to their own tasks in task.service.js.
router.get(
  '/',
  [
    query('assignedTo').optional().isInt({ min: 1 }),
    query('status').optional().isIn(['pending', 'completed', 'all']),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
  ],
  validateRequest,
  taskController.list,
);

router.post(
  '/',
  requirePermission('manageTasks'),
  [
    body('title').trim().notEmpty().isLength({ max: 200 }).withMessage('Title is required (max 200 characters)'),
    body('description').optional({ nullable: true }).isString().isLength({ max: 5000 }),
    body('assignedTo').isInt({ min: 1 }).withMessage('assignedTo is required'),
    body('dueDate').optional().isISO8601().withMessage('dueDate must be a valid date'),
  ],
  validateRequest,
  taskController.create,
);

router.patch(
  '/:id',
  requirePermission('manageTasks'),
  [
    idParam,
    body('title').optional().trim().notEmpty().isLength({ max: 200 }),
    body('description').optional({ nullable: true }).isString().isLength({ max: 5000 }),
    body('assignedTo').optional().isInt({ min: 1 }),
    body('dueDate').optional().isISO8601(),
  ],
  validateRequest,
  taskController.update,
);

// Assignee-only; enforced in task.service.js.
router.patch(
  '/:id/complete',
  [idParam, body('completed').isBoolean().toBoolean().withMessage('completed must be a boolean')],
  validateRequest,
  taskController.complete,
);

router.delete('/:id', requirePermission('manageTasks'), [idParam], validateRequest, taskController.remove);

export default router;
