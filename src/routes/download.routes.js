import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  DOWNLOADS_DIR,
  DESKTOP_AGENT_FILENAME,
  DESKTOP_AGENT_MAC_FILENAME,
} from '../config/downloads.js';

const router = Router();

// Not gated behind authenticateToken: the installer itself isn't
// per-user data, and a plain <a href download> browser navigation
// can't attach an Authorization header anyway. The link is only
// surfaced to signed-in users on the Dashboard.
//
// ?platform=mac serves the .dmg build; anything else (including no query
// param) serves the Windows zip, since that's the platform this app was
// originally built for.
router.get(
  '/desktop-agent',
  asyncHandler(async (req, res) => {
    const isMac = req.query.platform === 'mac';
    const filename = isMac ? DESKTOP_AGENT_MAC_FILENAME : DESKTOP_AGENT_FILENAME;
    const filePath = path.join(DOWNLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      throw new ApiError(404, 'Desktop agent installer is not available yet');
    }
    res.download(filePath, filename);
  }),
);

export default router;
