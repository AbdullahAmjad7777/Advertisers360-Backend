import { asyncHandler } from '../utils/asyncHandler.js';
import * as agentService from '../services/agent.service.js';

const REFRESH_COOKIE_NAME = 'refreshToken';

// The agent sends its persisted refresh token the same way it already does
// for /auth/refresh: as a raw `Cookie: refreshToken=<jwt>` header (see
// desktop-agent/src/api-client.js), parsed here by the same cookie-parser
// middleware app.js already installs globally.
export const check = asyncHandler(async (req, res) => {
  const result = await agentService.checkUninstall(req.cookies?.[REFRESH_COOKIE_NAME]);
  res.json({ success: true, message: 'Uninstall status checked', data: result });
});

export const ack = asyncHandler(async (req, res) => {
  await agentService.ackUninstall(req.cookies?.[REFRESH_COOKIE_NAME]);
  res.json({ success: true, message: 'Uninstall acknowledged' });
});
