import { pool } from '../config/db.js';

export async function findCompanySettings() {
  const [rows] = await pool.query(
    `SELECT office_start_time, office_end_time, location_restriction_enabled, updated_by, updated_at
     FROM company_settings WHERE id = 1`,
  );
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
