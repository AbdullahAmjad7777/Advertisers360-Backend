import { Router } from 'express';
import { body } from 'express-validator';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import * as settingsController from '../controllers/settings.controller.js';

const router = Router();

router.use(authenticateToken);

// Every signed-in role needs to read office hours (attendance screens,
// late-count display); only CEO/manager can change them.
router.get('/office-hours', settingsController.getOfficeHours);

router.patch(
  '/office-hours',
  requirePermission('manageSettings'),
  [
    body('officeStartTime')
      .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
      .withMessage('officeStartTime must be in HH:MM:SS format'),
    body('officeEndTime')
      .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
      .withMessage('officeEndTime must be in HH:MM:SS format'),
  ],
  validateRequest,
  settingsController.updateOfficeHours,
);

// Unlike office hours (readable by every role for attendance screens), the
// location-restriction toggle itself is CEO/manager-only end to end — a
// regular employee has no legitimate reason to see whether it's on or off,
// let alone change it.
router.get(
  '/location-restriction',
  requirePermission('manageSettings'),
  settingsController.getLocationRestriction,
);

router.patch(
  '/location-restriction',
  requirePermission('manageSettings'),
  [body('enabled').isBoolean().withMessage('enabled must be a boolean')],
  validateRequest,
  settingsController.updateLocationRestriction,
);

export default router;
