-- 022_agent_uninstall
-- CEO/manager "delete employee" now also has to get the desktop agent off
-- that employee's machine, with no action needed from the employee. The
-- catch: deleteEmployeeCascade (see employee.model.js) HARD-deletes the
-- employees row as part of that same action, so there's no surviving
-- employees row left to hang a "pending_uninstall" flag off of — especially
-- for the "agent is offline right now, deliver this whenever it next comes
-- online" case, which can be days or weeks later. This table is the
-- standalone tombstone that survives the employee row being gone:
-- employee_id/employee_code/full_name are a point-in-time snapshot (no FK
-- to employees — the whole point is this row outlives that one), so the
-- dashboard can still show "who" after the employee record itself is gone.
--
-- requested_by DOES reference employees(id) (nullified by
-- deleteEmployeeCascade like leaves.approved_by etc. if that manager/CEO is
-- later deleted too) since it's just "who clicked delete", not the subject
-- of the tombstone.

CREATE TABLE agent_uninstall_requests (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id   BIGINT UNSIGNED NOT NULL,
    employee_code VARCHAR(50) NOT NULL,
    full_name     VARCHAR(150) NOT NULL,
    requested_by  BIGINT UNSIGNED NULL,
    requested_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivered_at  DATETIME NULL,
    status        ENUM('pending', 'delivered') NOT NULL DEFAULT 'pending',
    UNIQUE KEY uq_agent_uninstall_employee (employee_id),
    FOREIGN KEY (requested_by) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE INDEX idx_agent_uninstall_status ON agent_uninstall_requests(status);
