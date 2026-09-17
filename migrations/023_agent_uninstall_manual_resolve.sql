-- 023_agent_uninstall_manual_resolve
-- Lets a CEO/manager manually clear a stuck "Deleted Employees — Agent
-- Still Installed" dashboard entry (e.g. they personally confirmed the
-- machine was wiped/the agent was removed by hand) instead of it sitting
-- there forever waiting for an ack that will never come.
--
-- resolved_by is nullable and separate from requested_by specifically so
-- the row keeps an honest audit trail: NULL means the agent genuinely
-- phoned home and acked its own uninstall (see agentUninstall.controller.js
-- :ack); a real employee id means a human overrode it manually — useful to
-- know if this list is ever wrong (agent silently failed to uninstall but
-- got marked resolved anyway).

ALTER TABLE agent_uninstall_requests
  ADD COLUMN resolved_by BIGINT UNSIGNED NULL AFTER delivered_at,
  ADD CONSTRAINT fk_agent_uninstall_resolved_by FOREIGN KEY (resolved_by) REFERENCES employees(id);
