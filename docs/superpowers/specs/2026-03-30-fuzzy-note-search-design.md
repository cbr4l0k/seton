# Fuzzy Note Search Design

**Date:** 2026-03-30

## Goal

Add fast fuzzy note search to the notes panel so users can retrieve notes by note content or tags, not only by recency. Search should use SQLite `FTS5`, highlight matched fragments, and support keyboard selection with `ArrowUp`, `ArrowDown`, and `Enter`.

## Current State

The notes panel in [src/components/HistoryPanel.tsx](/home/cbr4l0k/Documents/projects/seton/src/components/HistoryPanel.tsx) renders a static recent-notes list provided by `bootstrap_workspace`. The backend in [src-tauri/src/db/repository.rs](/home/cbr4l0k/Documents/projects/seton/src-tauri/src/db/repository.rs) only exposes recent-note retrieval ordered by `last_opened_at` / `updated_at`.

The app has no searchable note index, no note-tag search path, and no keyboard cursor inside the notes list beyond the existing panel-level spatial navigation in [src/hooks/useSpatialNavigation.ts](/home/cbr4l0k/Documents/projects/seton/src/hooks/useSpatialNavigation.ts).

## Product Behavior

The bottom notes panel should gain a search input above the list.

When the search input is empty:

- the panel continues to show the current recent-notes list
- existing open, delete, select, and export behaviors remain available

When the search input contains text:

- the app runs a backend search over note body text plus note tags
- results appear in one blended list
- ordering is driven by `FTS5` relevance first, with recency as a deterministic tiebreaker
- each result shows a note preview, matched tag chips when relevant, and visible highlighting for matched substrings
- `ArrowDown` and `ArrowUp` move an active result row
- `Enter` opens the active result
- clicking a result still opens it

This should optimize for retrieval speed rather than exact title matching. Users should be able to find notes by approximate body phrases, context labels, or URLs saved as note tags.

## Search Scope

Search indexing should include:

- note body text
- text capture-context values
- URL capture-context values

Image capture contexts should remain out of scope for full-text matching because there is no textual payload beyond file paths, and surfacing local file paths in search would be noisy.

## Data Model

The database should add an `FTS5` virtual table that stores one searchable document per note. That indexed document should contain:

- note id
- note body
- concatenated searchable tag text derived from text and URL capture contexts

The canonical note and capture-context tables remain the source of truth. The `FTS5` table is a derived index that must stay in sync whenever a note is inserted, updated, or deleted.

Search query results should return a new DTO shaped for the notes panel, for example:

- note id
- preview text
- updated timestamp
- optional last-opened timestamp
- matched searchable tags
- match spans or fragment strings needed for UI highlighting

The existing recent-note payload should remain available for the empty-search state.

## Ranking

Queries should use SQLite `FTS5` ranking via `bm25()`.

Sorting rules:

1. better `bm25()` score first
2. more recently opened/updated note first when scores are equal
3. note id as a final deterministic tiebreaker if needed

This keeps the list blended instead of splitting it into “recent” and “older” sections, while still making recently useful notes win ties between similarly relevant matches.

## Highlighting

The backend should use `highlight()` and/or `snippet()` to produce display fragments that identify matched parts of the note preview and tag text. The frontend should render those fragments with semantic markup instead of attempting to reconstruct fuzzy matches on the client.

The UI should highlight:

- matched terms in the visible note preview
- matched text/url tag chips when those values contributed to the hit

Highlight rendering should degrade safely when a result has a rank but no compact snippet for one surface; the note should still be shown and remain openable.

## UI And Interaction

The notes panel should remain a single compact surface. The new search input should sit in the header area without adding a second modal or overlay.

Interaction rules:

- moving focus into the notes panel should make the search input reachable immediately
- while the search input is focused, `ArrowUp` and `ArrowDown` should navigate the result list instead of triggering workspace panel navigation
- `Enter` should open the active result when search results are visible
- `Escape` should keep the existing global behavior unless a more specific notes-panel interaction needs to consume it
- checkbox selection and delete/export controls should continue to work in the empty-search list

To avoid visual congestion, search results should reuse the existing notes-row layout as much as possible. The main additions are the input, active-row styling, and inline highlighted fragments/tag chips.

## Architecture

### Backend

Add migration support for the `FTS5` table and repository helpers to:

- build indexed text from a note plus its searchable capture contexts
- upsert the index entry during `save_note`
- remove the index entry during `delete_note`
- query ranked search results from a new repository search method

Expose the search through a dedicated Tauri command rather than overloading `bootstrap_workspace`, because search should be query-driven and reusable.

### Frontend

Add a `searchNotes` bridge in [src/lib/tauri.ts](/home/cbr4l0k/Documents/projects/seton/src/lib/tauri.ts) and corresponding types in [src/lib/types.ts](/home/cbr4l0k/Documents/projects/seton/src/lib/types.ts).

`App` should own:

- current search query
- fetched search results
- active search-result index
- loading/error reset behavior when query changes or a note opens

`HistoryPanel` should own rendering and local keyboard wiring for the active row, while receiving query/results state and callbacks from `App`.

## Testing

The implementation should follow TDD.

Backend tests should cover:

- indexing note body plus text/url capture contexts
- updating the index when a note is edited
- removing deleted notes from the search index
- ranking and returning matches for both body text and tags

Frontend tests should cover:

- rendering the search input in the notes panel
- issuing search requests when the query changes
- showing highlighted body/tag matches
- keyboard result navigation with `ArrowUp` / `ArrowDown`
- opening the active note with `Enter`
- preserving existing recent-list controls when search is empty

## Non-Goals

- semantic search or embeddings
- OCR for image capture contexts
- multi-panel search UI
- advanced boolean query syntax exposed directly to users
