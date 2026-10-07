import { pool } from '../config/db.js';

const TASK_SELECT = `
  SELECT t.id, t.title, t.description, t.assigned_to, a.full_name AS assigned_to_name,
         a.employee_code AS assigned_to_code, t.assigned_by, b.full_name AS assigned_by_name,
         t.due_date, t.is_completed, t.completed_at, t.created_at, t.updated_at,
         (t.assigned_by = t.assigned_to) AS self_added
  FROM tasks t
  JOIN employees a ON a.id = t.assigned_to
  LEFT JOIN employees b ON b.id = t.assigned_by
`;

export async function findTaskById(id) {
  const [rows] = await pool.query(`${TASK_SELECT} WHERE t.id = ?`, [id]);
  return rows[0] ?? null;
}

// assignedToIn limits results to a set of people (the manager's team view);
// an empty array means nobody, not everybody.
export async function findTasks({ assignedTo, assignedToIn, status, from, to }) {
  const conditions = [];
  const params = [];
  if (assignedTo) {
    conditions.push('t.assigned_to = ?');
    params.push(assignedTo);
  }
  if (assignedToIn) {
    if (assignedToIn.length === 0) return [];
    conditions.push('t.assigned_to IN (?)');
    params.push(assignedToIn);
  }
  if (status === 'pending') conditions.push('t.is_completed = 0');
  if (status === 'completed') conditions.push('t.is_completed = 1');
  if (from) {
    conditions.push('t.due_date >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('t.due_date <= ?');
    params.push(to);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `${TASK_SELECT} ${where} ORDER BY t.is_completed ASC, t.due_date DESC, t.id DESC LIMIT 500`,
    params,
  );
  return rows;
}

// What blocks check-out: anything not done that was due on or before the
// shift being checked out of (so overdue tasks keep blocking).
export async function findPendingTasksDueBy(employeeId, shiftDate) {
  const [rows] = await pool.query(
    `SELECT id, title, due_date FROM tasks
     WHERE assigned_to = ? AND is_completed = 0 AND due_date <= ?
     ORDER BY due_date ASC, id ASC`,
    [employeeId, shiftDate],
  );
  return rows;
}

export async function insertTask({ title, description, assignedTo, assignedBy, dueDate }) {
  const [result] = await pool.query(
    `INSERT INTO tasks (title, description, assigned_to, assigned_by, due_date)
     VALUES (?, ?, ?, ?, ?)`,
    [title, description ?? null, assignedTo, assignedBy, dueDate],
  );
  return result.insertId;
}

export async function updateTaskFields(id, { title, description, assignedTo, dueDate }) {
  await pool.query(
    `UPDATE tasks SET title = ?, description = ?, assigned_to = ?, due_date = ? WHERE id = ?`,
    [title, description, assignedTo, dueDate, id],
  );
}

export async function setTaskCompleted(id, completed) {
  await pool.query(
    `UPDATE tasks SET is_completed = ?, completed_at = IF(?, NOW(), NULL) WHERE id = ?`,
    [completed ? 1 : 0, completed ? 1 : 0, id],
  );
}

export async function deleteTask(id) {
  await pool.query(`DELETE FROM tasks WHERE id = ?`, [id]);
}

export async function findAssignableEmployee(id) {
  const [rows] = await pool.query(
    `SELECT e.id, e.is_active, r.role_name
     FROM employees e JOIN roles r ON r.id = e.role_id
     WHERE e.id = ?`,
    [id],
  );
  return rows[0] ?? null;
}
