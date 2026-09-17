import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { AIVEN_CA_CERT } from './aiven-ca.js';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  // Separate from the SET time_zone hook below: this controls how the
  // *driver* serializes JS Date objects bound as query params into MySQL
  // DATETIME literals. It
  // defaults to 'local', i.e. the Node process's own OS timezone — which is
  // UTC on most cloud hosts and would silently reintroduce the same 5-hour
  // offset bug for any query that binds a Date object instead of using
  // SQL's NOW(). Pinning it to PKT keeps both paths consistent regardless
  // of what timezone the Node process itself happens to be running in.
  timezone: '+05:00',
  ssl: {
    ca: AIVEN_CA_CERT,
    rejectUnauthorized: true
  }
});

// The Aiven MySQL server's session time_zone defaults to SYSTEM (=UTC), so
// NOW()/CURRENT_TIMESTAMP() were writing UTC wall-clock into DATETIME
// columns (check_in_time, created_at, ...) while the app and its Pakistani
// users all reason in PKT (UTC+5). Pinning every pooled connection to a
// fixed +05:00 offset (Pakistan has no DST, so this never needs to change)
// makes NOW()/CURRENT_TIMESTAMP() return PKT directly — fixing every
// DEFAULT/ON UPDATE CURRENT_TIMESTAMP column across the schema at once,
// without touching each query individually.
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+05:00'");
});


export async function testConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}
