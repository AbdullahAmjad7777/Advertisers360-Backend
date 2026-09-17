-- 012_seed_video_editor_department
-- Video editing wasn't part of the original department list seeded in
-- 004_seed_departments_and_designations, so the Add Employee / onboarding
-- forms had no option for it. Add it as its own department with a couple
-- of starter designations, same pattern as the original seed.

INSERT INTO departments (department_name, description) VALUES
('Video Editing', 'Video editing, motion graphics, and post-production for client campaigns');

INSERT INTO designations (designation_name, department_id)
SELECT 'Video Editor', id FROM departments WHERE department_name = 'Video Editing'
UNION ALL SELECT 'Senior Video Editor', id FROM departments WHERE department_name = 'Video Editing';
