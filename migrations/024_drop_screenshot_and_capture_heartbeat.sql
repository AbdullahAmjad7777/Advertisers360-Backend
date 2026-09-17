-- Removes the employee screen-monitoring feature: the screenshots table and
-- the desktop agent's capture-health heartbeat columns on employees. Note
-- agent_last_seen_at (online/offline status) is NOT touched here — it's
-- updated independently by the resync-status poll (see agent.model.js's
-- touchAgentLastSeen), so online-status tracking is unaffected.
DROP TABLE IF EXISTS screenshots;

ALTER TABLE employees
  DROP COLUMN agent_version,
  DROP COLUMN agent_capturing,
  DROP COLUMN agent_last_capture_attempt_at,
  DROP COLUMN agent_last_capture_success_at,
  DROP COLUMN agent_last_capture_error;
