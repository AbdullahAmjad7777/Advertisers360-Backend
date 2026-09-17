-- 018_agent_update_push
-- Reuses the "refresh all agents" signal/ack plumbing from
-- 017_agent_resync.sql for a second, distinct purpose: letting a
-- manager/CEO push an immediate "check for app update now" signal instead
-- of waiting for an agent's periodic update check (every 4h, or once at
-- its own next startup). Same delivery mechanism (agent polls, sees a
-- newer request, acts, acks) — only the request_type tells the agent which
-- action to take on receipt.

ALTER TABLE agent_resync_requests
  ADD COLUMN request_type ENUM('resync', 'check_update') NOT NULL DEFAULT 'resync' AFTER requested_by;
