-- Re-run the default-column backfill from migration 00056.
-- Boards created between 00056 and this migration skipped the protected
-- default columns because the TS insert paths didn't set is_default=true,
-- so some users open the kanban page with no columns (or with only
-- deletable generic columns). This migration is idempotent — boards that
-- already have their defaults are untouched.
--
-- Rules:
--   • Creatives team boards get the tracker-status defaults
--     (Idea, In Production, Submitted, Approved, Scheduled, Published, Archived)
--   • Everyone else (personal, global, non-creatives team) gets the generic set
--     (To Do, In Progress, Review, Done)

-- 1. Mark any existing columns whose names match a default (handles
--    boards created by the TS paths without is_default).
UPDATE kanban_columns
SET is_default = true
WHERE is_default = false
  AND lower(trim(name)) IN ('to do', 'in progress', 'review', 'done');

-- 2. Insert missing generic defaults for boards that aren't creatives team boards.
WITH defaults(name, sort_order) AS (
  VALUES
    ('To Do',       10),
    ('In Progress', 20),
    ('Review',      30),
    ('Done',        40)
),
eligible_boards AS (
  SELECT b.id AS board_id
  FROM kanban_boards b
  LEFT JOIN departments d ON d.id = b.department_id
  WHERE NOT (d.slug = 'creatives' AND b.scope = 'team')
     OR d.slug IS NULL
),
existing AS (
  SELECT board_id, lower(trim(name)) AS lname
  FROM kanban_columns
  WHERE is_default = true
    AND board_id IN (SELECT board_id FROM eligible_boards)
),
missing AS (
  SELECT b.board_id, d.name, d.sort_order
  FROM eligible_boards b
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

-- 3. Creatives team boards: mark existing tracker-status columns, then insert missing.
UPDATE kanban_columns
SET is_default = true
WHERE is_default = false
  AND board_id IN (
    SELECT b.id FROM kanban_boards b
    JOIN departments d ON d.id = b.department_id
    WHERE d.slug = 'creatives' AND b.scope = 'team'
  )
  AND lower(trim(name)) IN ('idea', 'in production', 'submitted', 'approved', 'scheduled', 'published', 'archived');

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
INSERT INTO kanban_columns (board_id, name, sort_order, is_default)
SELECT board_id, name, sort_order, true
FROM creatives_missing;
