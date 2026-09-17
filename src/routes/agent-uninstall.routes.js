import { Router } from 'express';
import * as agentUninstallController from '../controllers/agentUninstall.controller.js';

const router = Router();

// Deliberately mounted with NO authenticateToken (see app.js) and as its own
// router rather than a path inside agent.routes.js, which applies
// authenticateToken to every route via router.use(). That middleware
// requires the caller's employees row to still exist and be active — but by
// the time an agent needs to ask "should I uninstall?", the employee it
// belongs to has already been hard-deleted (see
// employee.service.js:deactivateEmployeeById). There would be no row left
// for a normal auth check to pass.
//
// Trust instead comes from the refresh token's JWT signature alone —
// verified ignoring expiry, specifically so a laptop that's been offline
// long enough for its 7-day refresh token to lapse (exactly the "forgotten
// machine" scenario this feature exists for) can still prove it's a real
// device this backend once issued a credential to. See
// verifyRefreshTokenIgnoringExpiry (utils/jwt.js) and
// agent.service.js:employeeIdFromRefreshToken for the full reasoning. What
// this buys the caller is strictly a read of its own pending-uninstall flag
// (check) or marking its own tombstone delivered (ack) — nothing it sends
// can ever cause that flag to become true; only an authenticated,
// requirePermission('manageEmployees')-gated delete (employee.routes.js)
// can do that.
router.post('/check', agentUninstallController.check);
router.post('/ack', agentUninstallController.ack);

export default router;
