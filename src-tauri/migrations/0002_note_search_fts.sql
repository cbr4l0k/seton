CREATE VIRTUAL TABLE note_search USING fts5(
  note_id UNINDEXED,
  body,
  tags
);

INSERT INTO note_search (note_id, body, tags)
SELECT
  notes.id,
  notes.body,
  COALESCE(
    group_concat(
      CASE
        WHEN capture_contexts.context_type = 'text' THEN trim(COALESCE(capture_contexts.text_value, ''))
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
GROUP BY notes.id, notes.body;
