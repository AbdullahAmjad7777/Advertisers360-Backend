-- Lets the desktop agent report its own screen-capture health back to the
-- server on every poll cycle, instead of failures only ever being visible in
-- a log file sitting on the employee's own machine. Without this, diagnosing
-- "checked in but no screenshots" required manually cross-referencing
-- attendance/resync-ack/screenshot timestamps per employee — this makes the
-- actual state (capturing or not, and why) directly visible on the dashboard.
ALTER TABLE employees
  ADD COLUMN agent_version VARCHAR(20) NULL AFTER agent_last_seen_at,
  ADD COLUMN agent_capturing TINYINT(1) NULL AFTER agent_version,
  ADD COLUMN agent_last_capture_attempt_at DATETIME NULL AFTER agent_capturing,
  ADD COLUMN agent_last_capture_success_at DATETIME NULL AFTER agent_last_capture_attempt_at,
  ADD COLUMN agent_last_capture_error VARCHAR(500) NULL AFTER agent_last_capture_success_at;
