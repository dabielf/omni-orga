CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('one_shot', 'ongoing')),
  is_priority INTEGER NOT NULL DEFAULT 0 CHECK (is_priority IN (0, 1)),
  sort_order INTEGER NOT NULL,
  completed_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  source_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  history_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  notes TEXT NOT NULL DEFAULT '',
  is_repeatable INTEGER NOT NULL DEFAULT 0 CHECK (is_repeatable IN (0, 1)),
  sort_order INTEGER NOT NULL,
  today_order INTEGER,
  ideal_completion_date TEXT,
  deadline TEXT,
  scheduled_day TEXT,
  completed_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (parent_id IS NULL OR is_repeatable = 0),
  CHECK (ideal_completion_date IS NULL OR deadline IS NULL)
) STRICT;

CREATE TABLE task_goal_links (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, goal_id)
) STRICT;

CREATE TABLE task_external_links (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  url TEXT NOT NULL CHECK (length(trim(url)) > 0),
  PRIMARY KEY (task_id, position)
) STRICT;

CREATE TABLE goal_completion_changes (
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  replacement_goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  replacement_added INTEGER NOT NULL DEFAULT 0 CHECK (replacement_added IN (0, 1)),
  task_archived INTEGER NOT NULL DEFAULT 0 CHECK (task_archived IN (0, 1)),
  PRIMARY KEY (goal_id, task_id)
) STRICT;

CREATE TABLE goal_archive_links (
  archived_goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  linked_goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  replacement INTEGER NOT NULL DEFAULT 0 CHECK (replacement IN (0, 1)),
  PRIMARY KEY (archived_goal_id, task_id, linked_goal_id)
) STRICT;

CREATE TABLE goal_archive_archived_tasks (
  archived_goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (archived_goal_id, task_id)
) STRICT;

CREATE INDEX goals_parent_order ON goals(parent_id, sort_order);
CREATE INDEX tasks_parent_order ON tasks(parent_id, sort_order);
CREATE INDEX tasks_history ON tasks(history_id, completed_at);
CREATE INDEX tasks_scheduled ON tasks(scheduled_day, today_order);
CREATE INDEX task_goal_links_goal ON task_goal_links(goal_id, task_id);

CREATE TRIGGER task_goal_links_top_level_insert
BEFORE INSERT ON task_goal_links
WHEN (SELECT parent_id FROM tasks WHERE id = NEW.task_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'only top-level tasks can link to goals');
END;

CREATE TRIGGER task_goal_links_top_level_update
BEFORE UPDATE OF task_id ON task_goal_links
WHEN (SELECT parent_id FROM tasks WHERE id = NEW.task_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'only top-level tasks can link to goals');
END;
