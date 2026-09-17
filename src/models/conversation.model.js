import { pool } from '../config/db.js';

export async function insertConversation(connection, { isGroup, name, createdBy }) {
  const [result] = await connection.query(
    `INSERT INTO conversations (is_group, name, created_by) VALUES (?, ?, ?)`,
    [isGroup ? 1 : 0, name ?? null, createdBy],
  );
  return result.insertId;
}

export async function addParticipants(connection, conversationId, employeeIds) {
  const values = employeeIds.map((employeeId) => [conversationId, employeeId]);
  await connection.query(
    `INSERT INTO conversation_participants (conversation_id, employee_id) VALUES ?`,
    [values],
  );
}

export async function findOneOnOneConversation(employeeIdA, employeeIdB) {
  const [rows] = await pool.query(
    `SELECT cp1.conversation_id AS id
     FROM conversation_participants cp1
     JOIN conversation_participants cp2
       ON cp2.conversation_id = cp1.conversation_id AND cp2.employee_id = ?
     JOIN conversations c ON c.id = cp1.conversation_id
     WHERE cp1.employee_id = ? AND c.is_group = 0
       AND (SELECT COUNT(*) FROM conversation_participants cp3 WHERE cp3.conversation_id = cp1.conversation_id) = 2
     LIMIT 1`,
    [employeeIdB, employeeIdA],
  );
  return rows[0]?.id ?? null;
}

export async function findConversationById(id) {
  const [rows] = await pool.query(`SELECT * FROM conversations WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function isParticipant(conversationId, employeeId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND employee_id = ? LIMIT 1`,
    [conversationId, employeeId],
  );
  return rows.length > 0;
}

export async function findParticipantIds(conversationId) {
  const [rows] = await pool.query(
    `SELECT employee_id FROM conversation_participants WHERE conversation_id = ?`,
    [conversationId],
  );
  return rows.map((row) => row.employee_id);
}

export async function findConversationsPaginated(employeeId, { limit, offset }) {
  const [rows] = await pool.query(
    `SELECT c.id, c.is_group, c.name, c.created_by, c.created_at,
            lm.id AS last_message_id, lm.content AS last_message_content,
            lm.attachment_path AS last_message_attachment_path,
            lm.sent_at AS last_message_sent_at, lm.sender_id AS last_message_sender_id,
            (SELECT COUNT(*) FROM messages m2
              WHERE m2.conversation_id = c.id AND m2.sender_id != ? AND m2.is_deleted = 0
                AND NOT EXISTS (
                  SELECT 1 FROM message_read_receipts r
                  WHERE r.message_id = m2.id AND r.employee_id = ?
                )
            ) AS unread_count
     FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.employee_id = ?
     LEFT JOIN messages lm ON lm.id = (
       SELECT m.id FROM messages m
       WHERE m.conversation_id = c.id AND m.is_deleted = 0
       ORDER BY m.sent_at DESC LIMIT 1
     )
     ORDER BY COALESCE(lm.sent_at, c.created_at) DESC
     LIMIT ? OFFSET ?`,
    [employeeId, employeeId, employeeId, limit, offset],
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM conversation_participants WHERE employee_id = ?`,
    [employeeId],
  );

  return { rows, total: countRows[0].total };
}

export async function findParticipantsForConversations(conversationIds) {
  if (conversationIds.length === 0) return [];
  const [rows] = await pool.query(
    `SELECT cp.conversation_id, e.id AS employee_id, e.full_name, e.employee_code
     FROM conversation_participants cp
     JOIN employees e ON e.id = cp.employee_id
     WHERE cp.conversation_id IN (?)`,
    [conversationIds],
  );
  return rows;
}
