import { Router } from 'express';
import multer from 'multer';
import { body, param } from 'express-validator';
import { validateRequest } from '../middleware/validate.js';
import { ApiError } from '../utils/ApiError.js';
import * as onboardingController from '../controllers/onboarding.controller.js';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB, profile picture only

// In-memory buffer, uploaded straight to UploadThing — same pattern as the
// chat-attachment upload routes.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new ApiError(422, 'Only image uploads are allowed'));
      return;
    }
    cb(null, true);
  },
});

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
  upload.single('profilePicture'),
  [
    tokenValidator,
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
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
  ],
  validateRequest,
  onboardingController.complete,
);

export default router;
