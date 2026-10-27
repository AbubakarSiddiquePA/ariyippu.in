CREATE TABLE IF NOT EXISTS articles(id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,status TEXT NOT NULL CHECK(status IN ('draft','published')),data TEXT NOT NULL,updated_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS articles_status ON articles(status,updated_at);
