-- 005_backfill_salary_structure_from_base_salary
-- salary_structure (which payroll generation actually reads) was a separate
-- table from employees.base_salary with no UI to populate it, so payroll
-- generation failed for every employee that only ever went through the
-- Add/Edit Employee form. Backfill one row per employee that's missing it,
-- using their existing base_salary as the basic salary.

INSERT INTO salary_structure
  (employee_id, basic_salary, house_rent_allowance, medical_allowance, transport_allowance, other_allowance, effective_from)
SELECT e.id, e.base_salary, 0, 0, 0, 0, COALESCE(e.join_date, CURDATE())
FROM employees e
LEFT JOIN salary_structure ss ON ss.employee_id = e.id
WHERE ss.employee_id IS NULL;
