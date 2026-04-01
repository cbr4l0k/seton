ALTER TABLE capture_contexts
  ADD COLUMN url_label TEXT;

ALTER TABLE capture_contexts
  ADD COLUMN url_title_status TEXT;

ALTER TABLE capture_contexts
  ADD COLUMN url_title_error TEXT;

ALTER TABLE capture_contexts
  ADD COLUMN url_title_fetched_at TEXT;
