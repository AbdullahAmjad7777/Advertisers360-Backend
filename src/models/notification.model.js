import { pool } from '../config/db.js';

export async function findByRecipientPaginated(recipientId, { limit, offset }) {
  const [rowsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, type, message, related_employee_id, is_read, created_at, read_at
       FROM notifications
       WHERE recipient_id = ?
       ORDER BY is_read ASC, created_at DESC
       LIMIT ? OFFSET ?`,
      [recipientId, limit, offset],
    ),
    pool.query(`SELECT COUNT(*) AS total FROM notifications WHERE recipient_id = ?`, [recipientId]),
  ]);

  return { rows: rowsResult[0], total: countResult[0][0].total };
}

export async function markAsRead(notificationId, recipientId) {
  const [result] = await pool.query(
    `UPDATE notifications
     SET is_read = 1, read_at = NOW()
     WHERE id = ? AND recipient_id = ?`,
    [notificationId, recipientId],
  );
  return result.affectedRows > 0;
}

export async function createBulkNotifications(notifications) {
  if (notifications.length === 0) return;

  const values = notifications.map((n) => [
    n.recipientId,
    n.type,
    n.message,
    n.relatedEmployeeId ?? null,
  ]);

  await pool.query(
    `INSERT INTO notifications (recipient_id, type, message, related_employee_id)
     VALUES ?`,
    [values],
  );
}
