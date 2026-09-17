-- 010_location_restriction_toggle
-- CEO/manager can now switch office-location enforcement on/off from the
-- app instead of it always being hardcoded on. Defaults to enabled (1) so
-- existing behavior is unchanged until someone explicitly turns it off.

ALTER TABLE company_settings
  ADD COLUMN location_restriction_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER office_end_time;
