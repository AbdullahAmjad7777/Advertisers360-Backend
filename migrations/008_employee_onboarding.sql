-- 008_employee_onboarding
-- Employee self-onboarding: CEO/manager only supplies an email address, the
-- system emails a secure one-time link, and the employee fills in their own
-- profile. Adds the invitation table plus the extra employee-profile columns
-- that flow was collecting (address, profile picture, emergency contact)
-- that the old CEO-fills-everything form never had fields for.

CREATE TABLE employee_invitations (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(150) NOT NULL,
    -- SHA-256 hex digest of the raw token. The raw token only ever exists in
    -- the emailed link — if this table leaks, it can't be used to complete
    -- an invitation.
    token_hash      CHAR(64) NOT NULL UNIQUE,
    invited_by      BIGINT UNSIGNED NOT NULL,
    status          ENUM('pending','completed','revoked') NOT NULL DEFAULT 'pending',
    employee_id     BIGINT UNSIGNED NULL,
    expires_at      DATETIME NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME NULL,
    FOREIGN KEY (invited_by) REFERENCES employees(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE INDEX idx_invitations_email ON employee_invitations(email);
CREATE INDEX idx_invitations_status ON employee_invitations(status);

ALTER TABLE employees
  ADD COLUMN address                     VARCHAR(255) NULL AFTER cnic_number,
  ADD COLUMN profile_picture_url         VARCHAR(500) NULL AFTER address,
  ADD COLUMN emergency_contact_name      VARCHAR(150) NULL AFTER profile_picture_url,
  ADD COLUMN emergency_contact_phone     VARCHAR(20)  NULL AFTER emergency_contact_name,
  ADD COLUMN emergency_contact_relation  VARCHAR(50)  NULL AFTER emergency_contact_phone;
