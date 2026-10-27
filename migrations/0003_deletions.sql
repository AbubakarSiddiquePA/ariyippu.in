CREATE TABLE IF NOT EXISTS deleted_articles(id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS media_deletions(cover TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('pending','done')), created_at TEXT NOT NULL, last_error TEXT);
