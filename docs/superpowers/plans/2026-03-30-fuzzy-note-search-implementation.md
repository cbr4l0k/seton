# Fuzzy Note Search Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `FTS5`-backed fuzzy note search across note bodies and text/url tags, with highlighted matches and keyboard result navigation in the notes panel.

**Architecture:** Keep recent-note loading in `bootstrap_workspace` for the empty state, and add a dedicated Tauri search command for query-driven results. Maintain an `FTS5` index in SQLite as derived state from notes plus searchable capture contexts, then render search results in the existing notes panel with frontend-managed query and active-row state.

**Tech Stack:** React + TypeScript, Vitest + React Testing Library, Tauri commands, Rust + `sqlx`/SQLite `FTS5`, `jj`.

---

## Planned File Structure

- `docs/superpowers/specs/2026-03-30-fuzzy-note-search-design.md`
  Approved design reference for issue `#4`.
- `src-tauri/migrations/0002_note_search_fts.sql`
  Creates the derived `FTS5` table for note search.
- `src-tauri/src/domain/note.rs`
  Domain types for search results and matched tag data.
- `src-tauri/src/db/repository.rs`
  Builds indexed text, keeps the `FTS5` table synchronized, and queries ranked search results.
- `src-tauri/src/commands/workspace.rs`
  Adds the search command and DTO mappings.
- `src-tauri/src/lib.rs`
  Registers the new Tauri command.
- `src/lib/types.ts`
  Frontend DTOs for search results and highlight-bearing tags.
- `src/lib/tauri.ts`
  Typed `searchNotes` bridge to the backend.
- `src/App.tsx`
  Search query/result state, request lifecycle, active result index, and note-opening integration.
- `src/components/HistoryPanel.tsx`
  Search input, highlighted result rendering, and keyboard navigation within the notes panel.
- `src/styles/app.css`
  Search field, active result, and match highlighting styles.
- `src/__tests__/app-shell.test.tsx`
  Notes-panel search rendering and keyboard behavior coverage.
- `src/__tests__/editor-flow.test.tsx`
  Search request/open-result integration coverage.

## Chunk 1: Backend Search Index

### Task 1: Add failing Rust tests for repository search indexing

**Files:**
- Modify: `src-tauri/src/db/repository.rs`
- Test: `src-tauri/src/db/repository.rs`

- [ ] **Step 1: Write the failing tests**

```rust
#[tokio::test]
async fn search_notes_matches_body_text_and_tags() {
    let repo = seeded_repository().await;
    save_note_with_text_and_url_contexts(&repo).await;

    let results = repo.search_notes("cipher".into(), 10).await.unwrap();

    assert_eq!(results[0].id, "note-body-hit");
    assert!(results.iter().any(|item| item.matched_tags.iter().any(|tag| tag.text.contains("https://cipher.example"))));
}

#[tokio::test]
async fn search_notes_excludes_deleted_notes() {
    let repo = seeded_repository().await;
    let note = save_note_for_search(&repo).await;
    repo.delete_note(note.id.clone()).await.unwrap();

    let results = repo.search_notes("seed".into(), 10).await.unwrap();

    assert!(results.is_empty());
}
```

- [ ] **Step 2: Run the focused Rust test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml db::repository::tests::search_notes_matches_body_text_and_tags`
Expected: FAIL because the repository has no `FTS5` index or search API yet.

- [ ] **Step 3: Implement the minimal search index**

Implementation notes:
- Add migration `0002_note_search_fts.sql` creating `note_search` as an `FTS5` table keyed by note id.
- Add helpers that derive searchable tag text from text/url capture contexts only.
- Update `save_note` to upsert the `FTS5` row after note and contexts are persisted.
- Update `delete_note` to remove the derived `FTS5` row.

- [ ] **Step 4: Re-run the focused Rust test and then the backend test file**

Run: `cargo test --manifest-path src-tauri/Cargo.toml db::repository::tests::search_notes_matches_body_text_and_tags`
Expected: PASS.

Run: `cargo test --manifest-path src-tauri/Cargo.toml db::repository::tests`
Expected: PASS.

- [ ] **Step 5: Checkpoint the backend index work**

```bash
jj describe -m "feat: add FTS5 note search index #4"
```

## Chunk 2: Backend Search Command

### Task 2: Add failing command tests for ranked search payloads

**Files:**
- Modify: `src-tauri/src/commands/workspace.rs`
- Modify: `src-tauri/src/domain/note.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/commands/workspace.rs`

- [ ] **Step 1: Write the failing tests**

```rust
#[tokio::test]
async fn search_notes_returns_ranked_results_with_highlighted_tags() {
    let state = seeded_state_with_searchable_notes().await;

    let results = search_notes_with_state(&state, "crypto".into()).await.unwrap();

    assert!(!results.is_empty());
    assert!(results[0].preview.contains("<mark>") || results[0].matched_tags.iter().any(|tag| tag.contains("<mark>")));
}
```

- [ ] **Step 2: Run the focused Rust test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml commands::workspace::tests::search_notes_returns_ranked_results_with_highlighted_tags`
Expected: FAIL because the command and DTOs do not exist.

- [ ] **Step 3: Implement the command surface**

Implementation notes:
- Add `NoteSearchResult` domain types carrying preview fragment, matched tags, and timestamps.
- Expose `search_notes` / `search_notes_with_state`.
- Register the command in `src-tauri/src/lib.rs`.
- Use `highlight()`/`snippet()` in SQL so the frontend receives ready-to-render fragments.

- [ ] **Step 4: Re-run the focused Rust test and command test module**

Run: `cargo test --manifest-path src-tauri/Cargo.toml commands::workspace::tests::search_notes_returns_ranked_results_with_highlighted_tags`
Expected: PASS.

Run: `cargo test --manifest-path src-tauri/Cargo.toml commands::workspace::tests`
Expected: PASS.

- [ ] **Step 5: Checkpoint the command surface**

```bash
jj describe -m "feat: expose note search command #4"
```

## Chunk 3: Frontend Search State

### Task 3: Add failing UI tests for query-driven note search

**Files:**
- Modify: `src/__tests__/app-shell.test.tsx`
- Modify: `src/__tests__/editor-flow.test.tsx`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/tauri.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
test("notes panel renders a search field and requests matches", async () => {
  mockBootstrapWorkspace.mockResolvedValue(makeWorkspacePayload());
  mockSearchNotes.mockResolvedValue([
    { id: "note-1", preview: "A <mark>crypto</mark> note", matchedTags: [], lastOpenedAt: null, updatedAt: "2026-03-30T10:00:00Z" },
  ]);

  render(<App />);
  fireEvent.keyDown(window, { key: "ArrowDown" });
  fireEvent.change(await screen.findByLabelText("Search notes"), { target: { value: "crypto" } });

  expect(mockSearchNotes).toHaveBeenCalledWith("crypto");
  expect(await screen.findByText("crypto", { selector: "mark" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused UI test to verify it fails**

Run: `npm run test -- --run src/__tests__/app-shell.test.tsx`
Expected: FAIL because the frontend has no search bridge or state.

- [ ] **Step 3: Implement minimal frontend search plumbing**

Implementation notes:
- Add `searchNotes(query: string)` in `src/lib/tauri.ts`.
- Add DTOs for results and matched tags in `src/lib/types.ts`.
- In `App`, track `searchQuery`, `searchResults`, and `activeSearchIndex`.
- When the query becomes empty, clear search results and fall back to recent history.

- [ ] **Step 4: Re-run the focused UI test and the two frontend test files**

Run: `npm run test -- --run src/__tests__/app-shell.test.tsx`
Expected: PASS.

Run: `npm run test -- --run src/__tests__/app-shell.test.tsx src/__tests__/editor-flow.test.tsx`
Expected: PASS unless rendering work in the next chunk is still pending.

- [ ] **Step 5: Checkpoint the frontend plumbing**

```bash
jj describe -m "feat: wire note search state into app shell #4"
```

## Chunk 4: Notes Panel Search UX

### Task 4: Add failing UI tests for keyboard navigation and opening search results

**Files:**
- Modify: `src/__tests__/app-shell.test.tsx`
- Modify: `src/__tests__/editor-flow.test.tsx`
- Modify: `src/components/HistoryPanel.tsx`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Write the failing tests**

```tsx
test("up down and enter navigate and open search results from the notes panel", async () => {
  mockBootstrapWorkspace.mockResolvedValue(makeWorkspacePayload());
  mockSearchNotes.mockResolvedValue([
    { id: "note-a", preview: "<mark>Crypto</mark> A", matchedTags: [], lastOpenedAt: null, updatedAt: "2026-03-29T10:00:00Z" },
    { id: "note-b", preview: "<mark>Crypto</mark> B", matchedTags: [], lastOpenedAt: null, updatedAt: "2026-03-28T10:00:00Z" },
  ]);
  mockOpenNote.mockResolvedValue(makeSavedNoteDetail());

  render(<App />);
  fireEvent.keyDown(window, { key: "ArrowDown" });
  fireEvent.change(await screen.findByLabelText("Search notes"), { target: { value: "crypto" } });
  fireEvent.keyDown(screen.getByLabelText("Search notes"), { key: "ArrowDown" });
  fireEvent.keyDown(screen.getByLabelText("Search notes"), { key: "Enter" });

  expect(mockOpenNote).toHaveBeenCalledWith("note-b");
});
```

- [ ] **Step 2: Run the focused UI test to verify it fails**

Run: `npm run test -- --run src/__tests__/editor-flow.test.tsx`
Expected: FAIL because the notes panel does not yet intercept arrow keys for result selection.

- [ ] **Step 3: Implement rendering and interaction in `HistoryPanel.tsx`**

Implementation notes:
- Add the search input in the panel header.
- Render either recent notes or search results depending on whether `searchQuery` is empty.
- Use `dangerouslySetInnerHTML` only if needed and keep the highlight source limited to backend-provided markup.
- Keep active-row state visually obvious and synchronized with `App`.
- Ensure arrow keys in the search input do not bubble into workspace navigation while results are visible.

- [ ] **Step 4: Re-run the focused UI test and all frontend tests**

Run: `npm run test -- --run src/__tests__/editor-flow.test.tsx`
Expected: PASS.

Run: `npm run test -- --run src/__tests__/app-shell.test.tsx src/__tests__/editor-flow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Checkpoint the notes panel UX**

```bash
jj describe -m "feat: add searchable notes panel interactions #4"
```

## Chunk 5: Full Verification

### Task 5: Run end-to-end verification before completion

**Files:**
- Modify: `src-tauri/src/db/repository.rs`
- Modify: `src-tauri/src/commands/workspace.rs`
- Modify: `src/components/HistoryPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Run the full frontend test suite**

Run: `npm run test -- --run`
Expected: PASS.

- [ ] **Step 2: Run the full Rust test suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 3: Review the `jj` diff**

Run: `jj diff`
Expected: Search feature changes only, tied to issue `#4`.

- [ ] **Step 4: Final checkpoint message**

```bash
jj describe -m "feat: add fuzzy note search across notes and tags #4"
```
