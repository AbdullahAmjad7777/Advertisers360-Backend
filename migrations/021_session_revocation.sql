-- 021_session_revocation
-- CEO/Manager "force session refresh" action needs a way to invalidate an
-- employee's outstanding access/refresh JWTs instantly, without waiting out
-- their natural expiry (15m access / 7d refresh) — both are validated purely
-- by signature+expiry today, with no DB-backed revocation list. Bumping this
-- counter and embedding it in every newly-issued token lets authenticate()
-- and refreshAccessToken() reject any token minted before the bump on sight.
-- Defaults to 0 so every already-issued token (which predates this column
-- and carries no sessionEpoch claim) keeps working after this migration
-- runs — see auth.service.js's `payload.sessionEpoch ?? 0` comparison.

ALTER TABLE employees
  ADD COLUMN session_epoch INT NOT NULL DEFAULT 0 AFTER is_active;
