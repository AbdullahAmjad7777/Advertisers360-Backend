-- 016_attendance_edit_log
-- Lets a manager/CEO correct a wrong check-in/check-out (e.g. an employee
-- who accidentally checked out mid-shift) with a transparent audit trail of
-- who changed what and when, instead of editing the row silently.

CREATE TABLE attendance_edit_log (
    id                   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    attendance_id        BIGINT UNSIGNED NOT NULL,
    edited_by            BIGINT UNSIGNED NULL,
    old_check_in_time    DATETIME NULL,
    old_check_out_time   DATETIME NULL,
    old_status           ENUM('present','late','absent','on_leave','half_day','holiday') NULL,
    new_check_in_time    DATETIME NULL,
    new_check_out_time   DATETIME NULL,
    new_status           ENUM('present','late','absent','on_leave','half_day','holiday') NULL,
    reason               VARCHAR(255) NULL,
    edited_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (attendance_id) REFERENCES attendance(id),
    FOREIGN KEY (edited_by) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE INDEX idx_attendance_edit_log_attendance ON attendance_edit_log(attendance_id);
