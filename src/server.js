import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'node:http';
import app, { allowedOrigins } from './app.js';
import { testConnection } from './config/db.js';
import { scheduleAttendanceAutoMark } from './jobs/attendanceAutoMark.job.js';
import { createSocketServer } from './socket.js';

const PORT = process.env.PORT || 5000;

try {
  await testConnection();
  console.log('Connected to MySQL database');
} catch (err) {
  console.error('Failed to connect to MySQL database:', err.message);
  process.exit(1);
}

const httpServer = createServer(app);
const io = createSocketServer(httpServer, allowedOrigins);
app.set('io', io);

httpServer.listen(PORT, () => {
  console.log(`Advertisers360 HRMS API listening on port ${PORT}`);
});

scheduleAttendanceAutoMark();
