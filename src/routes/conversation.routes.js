import { Router } from 'express';
import multer from 'multer';
import { body, param, query } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { ApiError } from '../utils/ApiError.js';
import { ALLOWED_ATTACHMENT_MIME_TYPES, MAX_ATTACHMENT_SIZE_BYTES } from '../config/chat-uploads.js';
import * as conversationController from '../controllers/conversation.controller.js';
import * as messageController from '../controllers/message.controller.js';

// In-memory buffer, not disk — the controller uploads the buffer straight to
// UploadThing rather than writing a local file first.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      cb(
        new ApiError(
          422,
          'Unsupported file type. Allowed: images, video, audio, PDF, DOCX, XLSX, ZIP',
        ),
      );
      return;
    }
    cb(null, true);
  },
});

const router = Router();

router.use(authenticateToken);

router.post(
  '/',
  [
    body('participantIds').isArray({ min: 1 }).withMessage('participantIds is required'),
    body('participantIds.*').isInt({ min: 1 }),
    body('isGroup').optional().isBoolean(),
    body('name').optional().isString().isLength({ max: 150 }),
  ],
  validateRequest,
  conversationController.create,
);

router.get(
  '/',
  [query('page').optional().isInt({ min: 1 }), query('limit').optional().isInt({ min: 1, max: 100 })],
  validateRequest,
  conversationController.list,
);

router.get(
  '/:id/messages',
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid conversation id'),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validateRequest,
  messageController.list,
);

router.post(
  '/:id/messages',
  upload.single('attachment'),
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid conversation id'),
    body('content').optional().isString().isLength({ max: 5000 }),
  ],
  validateRequest,
  messageController.create,
);

export default router;
