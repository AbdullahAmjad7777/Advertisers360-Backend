-- 025_breaks_tasks_late_grace
-- Break tracking, CEO-assigned tasks (which gate check-out), and the late
-- grace period moving from the LATE_GRACE_MINUTES env var into the editable
-- settings row so the CEO can change it from the app.
--
-- Breaks and tasks are keyed by SHIFT date (same as attendance.attendance_date),
-- not calendar date: the shift runs 18:00 -> 03:00, so a break or task at
-- 01:00 on the 8th belongs to the shift that started on the 7th.

-- Company shift is 6:00 PM -> 3:00 AM (next day); late after 6:15 PM.
UPDATE company_settings
SET office_start_time = '18:00:00', office_end_time = '03:00:00'
WHERE id = 1;

ALTER TABLE company_settings
  ADD COLUMN late_grace_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 15 AFTER office_end_time;

CREATE TABLE attendance_breaks (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id       BIGINT UNSIGNED NOT NULL,
    attendance_id     BIGINT UNSIGNED NOT NULL,
    shift_date        DATE NOT NULL,
    break_start       DATETIME NOT NULL,
    break_end         DATETIME NULL,
    duration_seconds  INT UNSIGNED NULL,          -- set when the break ends
    -- 1 while the break is open, NULL once ended. The unique key below then
    -- allows at most one open break per employee, even under a double-click
    -- race (NULLs never collide in a UNIQUE index).
    open_flag         TINYINT AS (IF(break_end IS NULL, 1, NULL)) STORED,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (attendance_id) REFERENCES attendance(id),
    UNIQUE KEY uq_breaks_one_open_per_employee (employee_id, open_flag)
) ENGINE=InnoDB;

CREATE INDEX idx_breaks_employee_shift ON attendance_breaks(employee_id, shift_date);
CREATE INDEX idx_breaks_attendance ON attendance_breaks(attendance_id);

CREATE TABLE tasks (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title         VARCHAR(200) NOT NULL,
    description   TEXT NULL,
    assigned_to   BIGINT UNSIGNED NOT NULL,
    assigned_by   BIGINT UNSIGNED NULL,
    due_date      DATE NOT NULL,                  -- a shift date
    is_completed  TINYINT(1) NOT NULL DEFAULT 0,
    completed_at  DATETIME NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to) REFERENCES employees(id),
    FOREIGN KEY (assigned_by) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE INDEX idx_tasks_assignee_open ON tasks(assigned_to, is_completed, due_date);
