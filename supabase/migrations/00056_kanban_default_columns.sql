-- 1. Add is_default column
ALTER TABLE kanban_columns
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- 2. Mark existing columns whose name matches a default name
UPDATE kanban_columns
SET is_default = true
WHERE lower(trim(name)) IN ('to do', 'in progress', 'review', 'done');

-- 3. For boards that are still missing one or more default columns, insert them
WITH defaults(name, sort_order) AS (
  VALUES
    ('To Do',      10),
    ('In Progress',20),
    ('Review',     30),
    ('Done',       40)
),
boards AS (
  SELECT id AS board_id FROM kanban_boards
),
existing AS (
  SELECT board_id, lower(trim(name)) AS lname
  FROM kanban_columns
  WHERE is_default = true
),
missing AS (
  SELECT b.board_id, d.name, d.sort_order
  FROM boards b
  CROSS JOIN defaults d
  WHERE NOT EXISTS (
    SELECT 1 FROM existing e
    WHERE e.board_id = b.board_id
      AND e.lname = lower(d.name)
  )
)
INSERT INTO kanban_columns (board_id, name, sort_order, is_default)
SELECT board_id, name, sort_order, true
FROM missing;

-- 4. Creatives department gets DIFFERENT default columns matching tracker statuses
-- First, remove generic defaults from creatives team boards (if just inserted)
DELETE FROM kanban_columns
WHERE is_default = true
  AND board_id IN (
    SELECT b.id FROM kanban_boards b
    JOIN departments d ON d.id = b.department_id
    WHERE d.slug = 'creatives' AND b.scope = 'team'
  )
  AND lower(trim(name)) IN ('to do', 'in progress', 'review', 'done');

-- Then mark existing creatives columns that match tracker statuses
UPDATE kanban_columns
SET is_default = true
WHERE board_id IN (
  SELECT b.id FROM kanban_boards b
  JOIN departments d ON d.id = b.department_id
  WHERE d.slug = 'creatives' AND b.scope = 'team'
)
AND lower(trim(name)) IN ('idea', 'in production', 'submitted', 'approved', 'scheduled', 'published', 'archived');

-- Insert missing creatives-specific defaults
WITH creatives_defaults(name, sort_order) AS (
  VALUES
    ('Idea',          10),
    ('In Production', 20),
    ('Submitted',     30),
    ('Approved',      40),
    ('Scheduled',     50),
    ('Published',     60),
    ('Archived',      70)
),
creatives_boards AS (
  SELECT b.id AS board_id FROM kanban_boards b
  JOIN departments d ON d.id = b.department_id
  WHERE d.slug = 'creatives' AND b.scope = 'team'
),
creatives_existing AS (
  SELECT board_id, lower(trim(name)) AS lname
  FROM kanban_columns
  WHERE is_default = true
    AND board_id IN (SELECT board_id FROM creatives_boards)
),
creatives_missing AS (
  SELECT b.board_id, cd.name, cd.sort_order
  FROM creatives_boards b
  CROSS JOIN creatives_defaults cd
  WHERE NOT EXISTS (
    SELECT 1 FROM creatives_existing e
    WHERE e.board_id = b.board_id
      AND e.lname = lower(cd.name)
  )
)
INSERT INTO kanban_columns (board_id, name, sort_order, true)
SELECT board_id, name, sort_order, true
FROM creatives_missing;
