-- 007_office_hours_and_late_deduction
-- Office start/end time move from hardcoded env vars to an editable DB
-- setting (single-row table) so CEO/manager can change it from the app
-- without a redeploy, and every place that used to read
-- OFFICE_START_TIME/OFFICE_END_TIME reads this instead.
--
-- Also adds structured "3 lates = 1 unpaid day" tracking to payroll so the
-- deduction has a transparent, reconstructable breakdown instead of just a
-- lump total.

CREATE TABLE company_settings (
    id                 TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
    office_start_time  TIME NOT NULL DEFAULT '17:00:00',
    office_end_time    TIME NOT NULL DEFAULT '02:00:00',
    updated_by         BIGINT UNSIGNED NULL,
    updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES employees(id)
) ENGINE=InnoDB;

-- Single settings row, convention-enforced at the application layer (always
-- upsert id=1) rather than a CHECK constraint, for compatibility with older
-- MySQL versions that silently ignore CHECK.
INSERT INTO company_settings (id, office_start_time, office_end_time)
VALUES (1, '17:00:00', '02:00:00');

ALTER TABLE payroll
  ADD COLUMN late_deduction_days INT NOT NULL DEFAULT 0 AFTER total_leave_days,
  ADD COLUMN late_deduction_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER total_deductions,
  ADD COLUMN late_deduction_breakdown JSON NULL AFTER late_deduction_amount;

-- The old flat "N pkr per late day" rule is superseded by the 3-lates-=
-- 1-unpaid-day logic computed directly in payroll generation; leaving both
-- active would double-penalize lateness.
UPDATE salary_deduction_rules SET is_active = 0 WHERE rule_type = 'late_penalty';
