-- 017_agent_resync
-- Lets a manager/CEO push a "resync now" signal to every desktop agent
-- instead of asking each employee individually to reopen/re-login their
-- app. Agents already poll the backend every ~15s for attendance status
-- (see desktop-agent/src/attendance-poller.js) — that same poll now also
-- checks for a pending resync request and, if found, immediately restarts
-- its capture-status check and proactively refreshes its access token,
-- then acknowledges so the dashboard can show how many agents responded.
--
-- This can only reach agents that are still logged in (have a valid
-- session to poll with) — an agent whose refresh token has fully expired
-- has no credential left to authenticate with, so no signal (push or poll)
-- can reach it; only a human re-entering their password can recover that
-- one, which is why the tray notification on session expiry matters.

ALTER TABLE employees
  ADD COLUMN agent_last_seen_at DATETIME NULL AFTER agent_last_login_at;

CREATE TABLE agent_resync_requests (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    requested_by   BIGINT UNSIGNED NULL,
    requested_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requested_by) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE TABLE agent_resync_acks (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    request_id   BIGINT UNSIGNED NOT NULL,
    employee_id  BIGINT UNSIGNED NOT NULL,
    acked_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_resync_ack (request_id, employee_id),
    FOREIGN KEY (request_id) REFERENCES agent_resync_requests(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;
