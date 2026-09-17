-- 004_seed_departments_and_designations
-- The departments/designations tables were created but never seeded, so the
-- Add Employee form's Department/Designation dropdowns had no options to
-- show. Seed the departments that fit a digital marketing agency, plus a
-- starter designation per department so the form is usable end to end.

INSERT INTO departments (department_name, description) VALUES
('Social Media', 'Social media strategy, content scheduling, and community management'),
('SEO', 'Search engine optimization and organic growth'),
('Paid Ads / PPC', 'Paid search and paid social advertising campaigns'),
('Content', 'Copywriting, blogging, and content strategy'),
('Design / Creative', 'Graphic design, branding, and creative production'),
('Web Development', 'Website and application development'),
('Sales', 'Business development and client acquisition'),
('HR', 'Human resources and people operations'),
('Accounts / Finance', 'Accounting, invoicing, and financial operations'),
('Client Servicing', 'Account management and client relations'),
('Management', 'Executive and departmental management');

INSERT INTO designations (designation_name, department_id)
SELECT 'Social Media Executive', id FROM departments WHERE department_name = 'Social Media'
UNION ALL SELECT 'Social Media Manager', id FROM departments WHERE department_name = 'Social Media'
UNION ALL SELECT 'SEO Executive', id FROM departments WHERE department_name = 'SEO'
UNION ALL SELECT 'SEO Manager', id FROM departments WHERE department_name = 'SEO'
UNION ALL SELECT 'PPC Executive', id FROM departments WHERE department_name = 'Paid Ads / PPC'
UNION ALL SELECT 'Paid Ads Manager', id FROM departments WHERE department_name = 'Paid Ads / PPC'
UNION ALL SELECT 'Content Writer', id FROM departments WHERE department_name = 'Content'
UNION ALL SELECT 'Content Strategist', id FROM departments WHERE department_name = 'Content'
UNION ALL SELECT 'Graphic Designer', id FROM departments WHERE department_name = 'Design / Creative'
UNION ALL SELECT 'Creative Lead', id FROM departments WHERE department_name = 'Design / Creative'
UNION ALL SELECT 'Web Developer', id FROM departments WHERE department_name = 'Web Development'
UNION ALL SELECT 'Web Development Lead', id FROM departments WHERE department_name = 'Web Development'
UNION ALL SELECT 'Sales Executive', id FROM departments WHERE department_name = 'Sales'
UNION ALL SELECT 'Sales Manager', id FROM departments WHERE department_name = 'Sales'
UNION ALL SELECT 'HR Executive', id FROM departments WHERE department_name = 'HR'
UNION ALL SELECT 'HR Manager', id FROM departments WHERE department_name = 'HR'
UNION ALL SELECT 'Accountant', id FROM departments WHERE department_name = 'Accounts / Finance'
UNION ALL SELECT 'Finance Manager', id FROM departments WHERE department_name = 'Accounts / Finance'
UNION ALL SELECT 'Client Servicing Executive', id FROM departments WHERE department_name = 'Client Servicing'
UNION ALL SELECT 'Account Manager', id FROM departments WHERE department_name = 'Client Servicing'
UNION ALL SELECT 'Team Lead', id FROM departments WHERE department_name = 'Management'
UNION ALL SELECT 'Department Head', id FROM departments WHERE department_name = 'Management';
