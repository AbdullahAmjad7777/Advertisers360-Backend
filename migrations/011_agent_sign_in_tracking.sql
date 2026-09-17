-- 011_agent_sign_in_tracking
-- Onboarding step 2 (desktop-agent setup) needs a way to know whether the
-- new employee has actually signed into the desktop agent yet. Reuses the
-- existing /auth/agent-login endpoint's success path to stamp this — no
-- separate boolean needed, and the timestamp is useful on its own (e.g. for
-- support/debugging "did their agent ever connect").

ALTER TABLE employees
  ADD COLUMN agent_last_login_at DATETIME NULL AFTER profile_picture_url;
