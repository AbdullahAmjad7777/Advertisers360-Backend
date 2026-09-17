-- 014_current_month_deduction_waiver
-- One-time cleanup: attendance records for August 2026 were affected by the
-- cross-midnight shift-date bug (fixed alongside this migration — see
-- shift.js/attendance.service.js), which caused employees who actually
-- worked to be auto-marked absent because their check-in landed under a
-- different shift date than the auto-mark job expected. Rather than
-- rewriting attendance history (which would misrepresent what actually
-- happened), this waives the ATTENDANCE-related payroll deductions
-- (absent penalty + late-day deduction) for this one month only — other
-- deductions (e.g. tax) are untouched. Going forward, normal deduction
-- logic applies again; nothing here changes future months.

CREATE TABLE payroll_deduction_waivers (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    month       TINYINT UNSIGNED NOT NULL,
    year        SMALLINT UNSIGNED NOT NULL,
    reason      VARCHAR(255) NOT NULL,
    created_by  BIGINT UNSIGNED NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_payroll_waiver_period (month, year),
    FOREIGN KEY (created_by) REFERENCES employees(id)
) ENGINE=InnoDB;

INSERT INTO payroll_deduction_waivers (month, year, reason) VALUES
(8, 2026, 'One-time cleanup: cross-midnight shift-date bug caused incorrect late/absent marks before the fix. Attendance-related deductions waived for this month only.');

-- Recompute any payroll rows already generated for the waived month so the
-- waiver applies retroactively to them too, not just future generations.
-- Only the 5% Income Tax rule (id=1, the sole non-attendance active
-- deduction rule at the time of this migration) is preserved.
UPDATE payroll
SET total_deductions = ROUND(gross_salary * 0.05, 2),
    net_salary = GREATEST(gross_salary - ROUND(gross_salary * 0.05, 2), 0),
    late_deduction_days = 0,
    late_deduction_amount = 0.00,
    late_deduction_breakdown = NULL
WHERE month = 8 AND year = 2026;
