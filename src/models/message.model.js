import { pool } from '../config/db.js';

// LEFT JOIN (not JOIN): a deleted employee's messages keep sender_id = NULL
// rather than disappearing from the conversation for other participants.
const MESSAGE_DETAIL_SELECT = `
  SELECT m.id, m.conversation_id, m.sender_id, COALESCE(e.full_name, 'Deleted User') AS sender_name,
         m.content, m.attachment_path, m.attachment_mime_type, m.sent_at, m.is_deleted
  FROM messages m
  LEFT JOIN employees e ON e.id = m.sender_id
`;

export async function insertMessage({ conversationId, senderId, content, attachmentPath, attachmentMimeType }) {
  const [result] = await pool.query(
    `INSERT INTO messages (conversation_id, sender_id, content, attachment_path, attachment_mime_type)
     VALUES (?, ?, ?, ?, ?)`,
    [conversationId, senderId, content ?? null, attachmentPath ?? null, attachmentMimeType ?? null],
  );
  return result.insertId;
}

export async function findMessageById(id) {
  const [rows] = await pool.query(`${MESSAGE_DETAIL_SELECT} WHERE m.id = ?`, [id]);
  return rows[0] ?? null;
}

export async function findMessagesPaginated({ conversationId, limit, offset }) {
  const [rows] = await pool.query(
    `${MESSAGE_DETAIL_SELECT}
     WHERE m.conversation_id = ? AND m.is_deleted = 0
     ORDER BY m.sent_at DESC
     LIMIT ? OFFSET ?`,
    [conversationId, limit, offset],
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ? AND is_deleted = 0`,
    [conversationId],
  );
  return { rows, total: countRows[0].total };
}

export async function insertReadReceipt(messageId, employeeId) {
  const [result] = await pool.query(
    `INSERT IGNORE INTO message_read_receipts (message_id, employee_id) VALUES (?, ?)`,
    [messageId, employeeId],
  );
  return result.affectedRows > 0;
}
