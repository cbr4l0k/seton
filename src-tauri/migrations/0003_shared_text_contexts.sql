CREATE TABLE text_contexts (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX text_contexts_normalized_label_idx
  ON text_contexts(normalized_label);

ALTER TABLE capture_contexts
  ADD COLUMN text_context_id TEXT REFERENCES text_contexts(id) ON DELETE SET NULL;

INSERT INTO text_contexts (id, label, normalized_label, created_at, updated_at)
SELECT
  lower(hex(randomblob(16))),
  grouped.label,
  grouped.normalized_label,
  grouped.created_at,
  grouped.updated_at
FROM (
  SELECT
    lower(trim(text_value)) AS normalized_label,
    (
      SELECT trim(first_capture.text_value)
      FROM capture_contexts AS first_capture
      WHERE first_capture.context_type = 'text'
        AND trim(COALESCE(first_capture.text_value, '')) <> ''
        AND lower(trim(first_capture.text_value)) = lower(trim(capture_contexts.text_value))
      ORDER BY first_capture.created_at ASC, first_capture.id ASC
      LIMIT 1
    ) AS label,
    MIN(created_at) AS created_at,
    MAX(updated_at) AS updated_at
  FROM capture_contexts
  WHERE context_type = 'text'
    AND trim(COALESCE(text_value, '')) <> ''
  GROUP BY lower(trim(text_value))
) AS grouped;

UPDATE capture_contexts
SET text_context_id = (
  SELECT text_contexts.id
  FROM text_contexts
  WHERE text_contexts.normalized_label = lower(trim(capture_contexts.text_value))
)
WHERE context_type = 'text'
  AND trim(COALESCE(text_value, '')) <> '';

DELETE FROM note_search;

INSERT INTO note_search (note_id, body, tags)
SELECT
  notes.id,
  notes.body,
  COALESCE(
    group_concat(
      CASE
        WHEN capture_contexts.context_type = 'text' THEN trim(COALESCE(text_contexts.label, capture_contexts.text_value, ''))
        WHEN capture_contexts.context_type = 'url' THEN trim(COALESCE(capture_contexts.url_value, ''))
        ELSE NULL
      END,
      ' ||| '
    ),
    ''
  )
FROM notes
LEFT JOIN capture_contexts
  ON capture_contexts.note_id = notes.id
  AND capture_contexts.context_type IN ('text', 'url')
LEFT JOIN text_contexts
  ON text_contexts.id = capture_contexts.text_context_id
GROUP BY notes.id, notes.body;
