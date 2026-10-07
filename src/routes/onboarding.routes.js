import { Router } from 'express';
import multer from 'multer';
import { body, param } from 'express-validator';
import { validateRequest } from '../middleware/validate.js';
import * as onboardingController from '../controllers/onboarding.controller.js';
import { employeeFieldLengthValidators } from '../utils/fieldLimits.js';

// The onboarding form is still sent as multipart/form-data; upload.none()
// parses its text fields and rejects any file part (profile pictures are no
// longer collected).
const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

// No authenticateToken on this router — an invitee has no account yet.
// The token itself (unguessable, single-use, short-lived) is the auth.
const tokenValidator = param('token').isHexadecimal().isLength({ min: 64, max: 64 });

router.get('/:token', [tokenValidator], validateRequest, onboardingController.getByToken);

router.get(
  '/:token/agent-status',
  [tokenValidator],
  validateRequest,
  onboardingController.getAgentStatus,
);

router.post(
  '/:token/complete',
  upload.none(),
  [
    tokenValidator,
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('password').isLength({ min: 8, max: 72 }).withMessage('Password must be 8-72 characters'),
    body('phone').optional().isString(),
    body('cnicNumber').optional().isString(),
    body('address').optional().isString(),
    body('emergencyContactName').optional().isString(),
    body('emergencyContactPhone').optional().isString(),
    body('emergencyContactRelation').optional().isString(),
    body('gender').optional().isIn(['male', 'female', 'other']),
    body('dateOfBirth').optional().isISO8601().withMessage('dateOfBirth must be a valid date'),
    body('departmentId').optional().isInt({ min: 1 }),
    body('designationId').optional().isInt({ min: 1 }),
    body('managerId').optional().isInt({ min: 1 }),
    body('bankName').optional().isString(),
    body('accountTitle').optional().isString(),
    body('accountNumber').optional().isString(),
    body('iban').optional().isString(),
    body('baseSalary').optional().isFloat({ min: 0 }),
    // Runs before the controller uploads the profile picture, so a too-long
    // field is rejected with a clear message and no orphaned upload.
    ...employeeFieldLengthValidators(),
  ],
  validateRequest,
  onboardingController.complete,
);

export default router;
