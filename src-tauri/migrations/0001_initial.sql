CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  analysis_status TEXT NOT NULL,
  analysis_requested_at TEXT,
  last_opened_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE capture_contexts (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  context_type TEXT NOT NULL,
  text_value TEXT,
  url_value TEXT,
  source_path TEXT,
  managed_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
);
