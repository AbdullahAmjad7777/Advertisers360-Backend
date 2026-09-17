import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import employeeRoutes from './routes/employee.routes.js';
import invitationRoutes from './routes/invitation.routes.js';
import onboardingRoutes from './routes/onboarding.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import leaveRoutes from './routes/leave.routes.js';
import payrollRoutes from './routes/payroll.routes.js';
import lookupRoutes from './routes/lookup.routes.js';
import downloadRoutes from './routes/download.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import messageRoutes from './routes/message.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import agentRoutes from './routes/agent.routes.js';
import agentUninstallRoutes from './routes/agent-uninstall.routes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { AGENT_UPDATES_DIR } from './config/downloads.js';

const app = express();

app.set('trust proxy', true);

export const allowedOrigins = (process.env.CLIENT_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Vite auto-increments to the next free port (5174, 5175, ...) whenever the
// previous one is already taken, so pinning LAN access to a fixed port list
// breaks as soon as that happens on another device. Any already-trusted LAN
// host (i.e. anything in CLIENT_ORIGIN that isn't localhost/127.0.0.1) is
// allowed on any port; localhost stays pinned to the configured ports since
// that's the same machine running this backend.
const wildcardPortHosts = new Set(
  allowedOrigins
    .filter((origin) => !origin.includes('localhost') && !origin.includes('127.0.0.1'))
    .map((origin) => origin.replace(/:\d+$/, '')),
);

function isAllowedOrigin(origin) {
  if (allowedOrigins.includes(origin)) return true;
  return wildcardPortHosts.has(origin.replace(/:\d+$/, ''));
}

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Requests with no Origin header (e.g. curl, server-to-server) are allowed through.
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      }
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Advertisers360 HRMS API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
// Mounted before /api/employees so its more specific prefix is matched
// first — otherwise employeeRoutes' GET /:id would swallow requests to
// /api/employees/invitations/*.
app.use('/api/employees/invitations', invitationRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/lookups', lookupRoutes);
app.use('/api/downloads', downloadRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/agent', agentRoutes);
// Separate top-level mount (not nested under /api/agent) so it never passes
// through agent.routes.js's router.use(authenticateToken) — see
// agent-uninstall.routes.js for why these two endpoints can't require that.
app.use('/api/agent-uninstall', agentUninstallRoutes);
// electron-updater's feed URL (see desktop-agent/package.json's "publish"
// config) — outside /api since it's a bare static file feed for the
// updater's own HTTP client, not an application API route.
app.use('/agent-updates', express.static(AGENT_UPDATES_DIR));

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
