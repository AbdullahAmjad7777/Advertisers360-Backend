-- 001_create_screenshots_table
-- Desktop agent screen-capture uploads.

CREATE TABLE screenshots (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id   BIGINT UNSIGNED NOT NULL,
    file_path     VARCHAR(500) NOT NULL,
    captured_at   DATETIME NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE INDEX idx_screenshots_employee ON screenshots(employee_id);
CREATE INDEX idx_screenshots_captured_at ON screenshots(captured_at);
