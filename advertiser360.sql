-- =====================================================================
-- ADVERTISER360 HRMS - MASTER LEVEL DATABASE SCHEMA
-- Designed for: 250+ current employees, scalable to 1,000,000+ records
-- Data retention: 50+ years safe (BIGINT IDs, proper indexing, soft delete)
-- Engine: InnoDB (supports foreign keys + transactions)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS advertiser360_hrms
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE advertiser360_hrms;

-- =====================================================================
-- GROUP 1: ORGANIZATION STRUCTURE
-- =====================================================================

-- 1. ROLES (system access levels)
CREATE TABLE roles (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    role_name     VARCHAR(50) NOT NULL UNIQUE,      -- e.g. admin, hr, manager, employee
    description   VARCHAR(255),
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. DEPARTMENTS
CREATE TABLE departments (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    department_name   VARCHAR(100) NOT NULL UNIQUE,
    description       VARCHAR(255),
    is_active         TINYINT(1) DEFAULT 1,          -- soft delete flag
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. DESIGNATIONS (job titles, e.g. Senior Developer, HR Executive)
CREATE TABLE designations (
    id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    designation_name   VARCHAR(100) NOT NULL,
    department_id      BIGINT UNSIGNED NOT NULL,
    is_active          TINYINT(1) DEFAULT 1,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

CREATE INDEX idx_designations_department ON designations(department_id);

-- =====================================================================
-- GROUP 2: EMPLOYEE CORE
-- =====================================================================

-- 4. EMPLOYEES (master table - everything connects here)
CREATE TABLE employees (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_code       VARCHAR(20) NOT NULL UNIQUE,     -- e.g. ADV360-0001
    full_name           VARCHAR(150) NOT NULL,
    email               VARCHAR(150) NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,           -- bcrypt/argon2 hash, never plain text
    phone               VARCHAR(20),
    cnic_number         VARCHAR(20) UNIQUE,
    gender              ENUM('male','female','other'),
    date_of_birth        DATE,
    department_id       BIGINT UNSIGNED,
    designation_id       BIGINT UNSIGNED,
    role_id              BIGINT UNSIGNED NOT NULL,
    manager_id           BIGINT UNSIGNED NULL,             -- self-reference: who they report to
    join_date            DATE NOT NULL,
    resign_date          DATE NULL,
    base_salary          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    is_active            TINYINT(1) DEFAULT 1,             -- soft delete instead of removing rows
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (designation_id) REFERENCES designations(id),
    FOREIGN KEY (role_id) REFERENCES roles(id),
    FOREIGN KEY (manager_id) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE INDEX idx_employees_department ON employees(department_id);
CREATE INDEX idx_employees_designation ON employees(designation_id);
CREATE INDEX idx_employees_manager ON employees(manager_id);
CREATE INDEX idx_employees_active ON employees(is_active);

-- 5. EMPLOYEE DOCUMENTS (CNIC, contract, degree scans - file paths only)
CREATE TABLE employee_documents (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id     BIGINT UNSIGNED NOT NULL,
    document_type    VARCHAR(50) NOT NULL,     -- cnic, contract, degree, experience_letter
    file_path         VARCHAR(500) NOT NULL,
    uploaded_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE INDEX idx_docs_employee ON employee_documents(employee_id);

-- 6. EMPLOYEE BANK DETAILS
CREATE TABLE employee_bank_details (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id        BIGINT UNSIGNED NOT NULL UNIQUE,
    bank_name           VARCHAR(100) NOT NULL,
    account_title        VARCHAR(150) NOT NULL,
    account_number        VARCHAR(50) NOT NULL,
    iban                    VARCHAR(50),
    created_at             DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

-- =====================================================================
-- GROUP 3: ATTENDANCE
-- =====================================================================

-- 7. HOLIDAYS (company calendar - checked before marking absent)
CREATE TABLE holidays (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    holiday_date    DATE NOT NULL UNIQUE,
    title            VARCHAR(150) NOT NULL,     -- e.g. Eid, Independence Day
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 8. ATTENDANCE (daily check-in/check-out - highest volume table)
CREATE TABLE attendance (
    id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id       BIGINT UNSIGNED NOT NULL,
    attendance_date    DATE NOT NULL,
    check_in_time        DATETIME NULL,
    check_out_time        DATETIME NULL,
    total_hours             DECIMAL(5,2) NULL,          -- calculated on checkout
    status                    ENUM('present','late','half_day','absent','on_leave','holiday') NOT NULL DEFAULT 'absent',
    ip_address                VARCHAR(45),                -- where check-in happened from
    created_at                 DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    UNIQUE KEY unique_employee_day (employee_id, attendance_date)   -- prevents duplicate check-in same day
) ENGINE=InnoDB;

CREATE INDEX idx_attendance_employee ON attendance(employee_id);
CREATE INDEX idx_attendance_date ON attendance(attendance_date);
CREATE INDEX idx_attendance_status ON attendance(status);

-- =====================================================================
-- GROUP 4: LEAVE MANAGEMENT
-- =====================================================================

-- 9. LEAVE TYPES (configurable - Casual, Sick, Paid, Unpaid)
CREATE TABLE leave_types (
    id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    type_name         VARCHAR(50) NOT NULL UNIQUE,
    default_annual_quota  INT NOT NULL DEFAULT 0,       -- e.g. 12 days/year
    is_paid                TINYINT(1) DEFAULT 1,
    created_at              DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 10. LEAVE BALANCES (per employee, per leave type, per year)
CREATE TABLE leave_balances (
    id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id       BIGINT UNSIGNED NOT NULL,
    leave_type_id       BIGINT UNSIGNED NOT NULL,
    year                  YEAR NOT NULL,
    total_allotted           INT NOT NULL DEFAULT 0,
    used                      INT NOT NULL DEFAULT 0,
    remaining                  INT GENERATED ALWAYS AS (total_allotted - used) STORED,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(id),
    UNIQUE KEY unique_balance (employee_id, leave_type_id, year)
) ENGINE=InnoDB;

-- 11. LEAVES (actual leave requests)
CREATE TABLE leaves (
    id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id       BIGINT UNSIGNED NOT NULL,
    leave_type_id       BIGINT UNSIGNED NOT NULL,
    from_date              DATE NOT NULL,
    to_date                  DATE NOT NULL,
    total_days                 INT NOT NULL,
    reason                       VARCHAR(500),
    status                        ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
    approved_by                    BIGINT UNSIGNED NULL,           -- employee_id of manager/HR who acted
    approved_at                       DATETIME NULL,
    created_at                          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(id),
    FOREIGN KEY (approved_by) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE INDEX idx_leaves_employee ON leaves(employee_id);
CREATE INDEX idx_leaves_status ON leaves(status);

-- =====================================================================
-- GROUP 5: PAYROLL
-- =====================================================================

-- 12. SALARY STRUCTURE (fixed setup per employee: basic + allowances)
CREATE TABLE salary_structure (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id           BIGINT UNSIGNED NOT NULL UNIQUE,
    basic_salary            DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    house_rent_allowance      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    medical_allowance             DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    transport_allowance              DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    other_allowance                     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    effective_from                        DATE NOT NULL,
    updated_at                               DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

-- 13. SALARY DEDUCTION RULES (tax, provident fund, late-coming penalty)
CREATE TABLE salary_deduction_rules (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    rule_name       VARCHAR(100) NOT NULL,
    rule_type         ENUM('tax','provident_fund','late_penalty','absent_penalty','other') NOT NULL,
    percentage_or_fixed   ENUM('percentage','fixed') NOT NULL,
    value                    DECIMAL(12,2) NOT NULL,
    is_active                  TINYINT(1) DEFAULT 1,
    created_at                   DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 14. PAYROLL (final monthly calculated salary - the actual result)
CREATE TABLE payroll (
    id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id          BIGINT UNSIGNED NOT NULL,
    month                  TINYINT UNSIGNED NOT NULL,       -- 1-12
    year                     YEAR NOT NULL,
    total_present_days         INT NOT NULL DEFAULT 0,
    total_absent_days             INT NOT NULL DEFAULT 0,
    total_leave_days                 INT NOT NULL DEFAULT 0,
    gross_salary                        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_deductions                       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    net_salary                                DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    status                                       ENUM('draft','finalized','paid') NOT NULL DEFAULT 'draft',
    generated_at                                    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    UNIQUE KEY unique_payroll_month (employee_id, month, year)
) ENGINE=InnoDB;

CREATE INDEX idx_payroll_employee ON payroll(employee_id);
CREATE INDEX idx_payroll_period ON payroll(year, month);

-- =====================================================================
-- GROUP 6: SYSTEM / SECURITY
-- =====================================================================

-- 15. LOGIN LOGS (who logged in, when, from where)
CREATE TABLE login_logs (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id      BIGINT UNSIGNED NOT NULL,
    login_time          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    logout_time            DATETIME NULL,
    ip_address                VARCHAR(45),
    device_info                  VARCHAR(255),
    status                          ENUM('success','failed') NOT NULL DEFAULT 'success',
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE INDEX idx_login_employee ON login_logs(employee_id);
CREATE INDEX idx_login_time ON login_logs(login_time);

-- 16. NOTIFICATIONS (CEO login alerts, leave status, salary generated, etc.)
CREATE TABLE notifications (
    id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    recipient_id       BIGINT UNSIGNED NOT NULL,       -- employee_id who receives it (e.g. CEO)
    type                  VARCHAR(50) NOT NULL,           -- login_alert, leave_approved, salary_generated, etc.
    message                  VARCHAR(500) NOT NULL,
    related_employee_id        BIGINT UNSIGNED NULL,       -- e.g. which employee logged in (for CEO alerts)
    is_read                       TINYINT(1) NOT NULL DEFAULT 0,
    created_at                      DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_at                            DATETIME NULL,
    FOREIGN KEY (recipient_id) REFERENCES employees(id),
    FOREIGN KEY (related_employee_id) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE INDEX idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX idx_notifications_unread ON notifications(recipient_id, is_read);

-- 17. AUDIT LOGS (who changed what, when - for compliance/security)
CREATE TABLE audit_logs (
    id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    performed_by       BIGINT UNSIGNED NOT NULL,        -- employee_id who made the change
    action_type          VARCHAR(50) NOT NULL,             -- create, update, delete
    table_name              VARCHAR(100) NOT NULL,
    record_id                  BIGINT UNSIGNED NOT NULL,
    old_value                     TEXT,
    new_value                        TEXT,
    created_at                          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (performed_by) REFERENCES employees(id)
) ENGINE=InnoDB;

CREATE INDEX idx_audit_performed_by ON audit_logs(performed_by);
CREATE INDEX idx_audit_table_record ON audit_logs(table_name, record_id);

-- =====================================================================
-- SEED DATA: Basic starter values (roles + default leave types)
-- =====================================================================

INSERT INTO roles (role_name, description) VALUES
('ceo', 'Full access - company owner/CEO'),
('admin', 'Full system administrator'),
('hr', 'HR manager - can manage employees, leaves, salary'),
('manager', 'Team manager - can approve leaves for own team'),
('employee', 'Regular employee - limited access to own data');

INSERT INTO leave_types (type_name, default_annual_quota, is_paid) VALUES
('Casual Leave', 12, 1),
('Sick Leave', 10, 1),
('Paid Leave', 14, 1),
('Unpaid Leave', 0, 0);

-- =====================================================================
-- END OF SCHEMA
-- =====================================================================