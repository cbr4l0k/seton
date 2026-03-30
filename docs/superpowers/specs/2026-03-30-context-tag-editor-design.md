# Context Tag Editor Design

## Goal

Allow users to review and rename existing context tags from Settings, with each logical text tag stored once and reused across notes so a rename updates every note that references it.

## Current State

- Text context tags are stored directly on `capture_contexts.text_value`.
- The editor suggestion list is derived by aggregating saved text context labels at bootstrap time.
- Settings currently only exposes the "request analysis after save" toggle.

## Proposed Design

### Data model

- Add a shared `text_contexts` table with:
  - `id`
  - `label`
  - `normalized_label`
  - `created_at`
  - `updated_at`
- Extend `capture_contexts` with nullable `text_context_id`.
- Keep `text_value` during migration/backward compatibility, but new reads and writes for text contexts should resolve through `text_context_id`.
- URL and image capture contexts remain unchanged.

### Migration

- Create one `text_contexts` row per existing logical text tag, grouped by normalized label.
- Choose the canonical label from the earliest existing saved label for that normalized tag.
- Update existing `capture_contexts` text rows to point at the canonical `text_context_id`.
- Rebuild any note-search indexing queries so text tags come from the shared label.

### Repository behavior

- Saving a note with text contexts should upsert/find the matching shared `text_contexts` row by normalized label and store the foreign key on `capture_contexts`.
- Listing suggestion data should read from shared text contexts plus note relationships.
- Add a repository method to rename a shared text context:
  - trim input
  - reject empty label
  - normalize the new label
  - reject rename if another shared text context already exists for that normalized label
  - update `label` and `normalized_label`
  - refresh dependent search index rows for affected notes

### App/UI behavior

- Extend the bootstrap payload with editable shared text contexts.
- Add a Settings section that lists existing context tags and provides inline rename controls.
- Renaming a tag should call a new Tauri command, then reload workspace data so:
  - Settings shows the new name
  - editor suggestions update
  - reopened notes resolve text chips to the renamed shared label

### Testing

- Repository tests for:
  - migration/backfill into shared contexts
  - saving two notes with the same tag creates one shared text context
  - renaming a shared text context updates all references logically
  - duplicate-normalized renames are rejected
- Frontend tests for:
  - Settings renders the shared tag list
  - renaming a tag invokes the command and refreshes visible data
