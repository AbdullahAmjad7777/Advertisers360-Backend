-- 015_per_employee_shift_override
-- Not every employee works the same shift as the company default in
-- company_settings. NULL (the default for everyone) means "use the
-- company-wide office hours" — only employees who actually need a
-- different schedule get these set, so most rows stay NULL forever.

ALTER TABLE employees
  ADD COLUMN shift_start_time TIME NULL AFTER base_salary,
  ADD COLUMN shift_end_time TIME NULL AFTER shift_start_time;
