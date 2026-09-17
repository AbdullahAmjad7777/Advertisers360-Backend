import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as lookupController from '../controllers/lookup.controller.js';

const router = Router();

router.use(authenticateToken);

router.get('/roles', lookupController.roles);
router.get('/departments', lookupController.departments);
router.get('/designations', lookupController.designations);

export default router;
