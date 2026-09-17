-- 009_invitation_fk_nullable
-- deleteEmployeeCascade hard-deletes employee rows (see its comment in
-- employee.model.js), but employee_invitations.invited_by was NOT NULL —
-- deleting the manager/CEO who sent an invitation would fail on that FK.
-- Made nullable so the cascade can clear it the same way it already clears
-- other "referenced by someone else's row" columns (leaves.approved_by etc).

ALTER TABLE employee_invitations
  MODIFY COLUMN invited_by BIGINT UNSIGNED NULL;
