import { pool } from '../config/db.js';

// SELECT * rather than a column list: this row is read on every login, so
// it must not start failing when the code is deployed before a migration
// that adds a column (late_grace_minutes broke production login exactly
// that way). Callers default any column that isn't there yet.
export async function findCompanySettings() {
  const [rows] = await pool.query(`SELECT * FROM company_settings WHERE id = 1`);
  return rows[0] ?? null;
}

export async function updateCompanySettings({ officeStartTime, officeEndTime, updatedBy }) {
  await pool.query(
    `UPDATE company_settings
     SET office_start_time = ?, office_end_time = ?, updated_by = ?
     WHERE id = 1`,
    [officeStartTime, officeEndTime, updatedBy],
  );
  return findCompanySettings();
}

export async function updateLocationRestrictionEnabled({ enabled, updatedBy }) {
  await pool.query(
    `UPDATE company_settings
     SET location_restriction_enabled = ?, updated_by = ?
     WHERE id = 1`,
    [enabled ? 1 : 0, updatedBy],
  );
  return findCompanySettings();
}

export async function updateLateGraceMinutes({ minutes, updatedBy }) {
  await pool.query(
    `UPDATE company_settings
     SET late_grace_minutes = ?, updated_by = ?
     WHERE id = 1`,
    [minutes, updatedBy],
  );
  return findCompanySettings();
}
