-- 003_close_stale_sessions_for_deactivated_employees
-- One-time cleanup: employees deactivated before the auth middleware started
-- enforcing is_active could still have an open (logout_time IS NULL) login
-- session on record. Close those out so login_logs stops showing them as
-- "currently logged in".

UPDATE login_logs ll
JOIN employees e ON e.id = ll.employee_id
SET ll.logout_time = NOW()
WHERE e.is_active = 0
  AND ll.status = 'success'
  AND ll.logout_time IS NULL;
