-- 019_agent_fix_all
-- Supports the combined "Fix All Agents Now" button (replaces the separate
-- "Refresh Agent Connections" / "Push Update Now" buttons with one click
-- that does both). Lets an ack optionally record what the agent actually
-- found when it checked for an update, so the dashboard can report "X
-- updated" vs "Y were already current" instead of just a flat ack count.

ALTER TABLE agent_resync_acks
  ADD COLUMN update_outcome ENUM('updated', 'already_current') NULL AFTER employee_id;
