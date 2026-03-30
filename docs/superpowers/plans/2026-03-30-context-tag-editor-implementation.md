# Context Tag Editor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings context tag editor backed by shared stored text contexts so renaming a tag updates every note that references it.

**Architecture:** Introduce a canonical `text_contexts` table and reference it from text `capture_contexts`, then expose shared tags through the workspace bootstrap payload and a rename command consumed by the Settings UI. Keep URL and image contexts unchanged, and preserve the existing suggestion and note-open flows by resolving display labels from the shared text context entity.

**Tech Stack:** React, TypeScript, Vitest, Tauri, Rust, SQLx, SQLite

---

## Chunk 1: Shared Text Context Persistence

### Task 1: Add failing repository coverage for shared tag storage

**Files:**
- Modify: `src-tauri/src/db/repository.rs`

- [ ] **Step 1: Write the failing test**

Add a repository test proving that saving two notes with the same text tag results in one canonical shared text context and both note contexts resolve through it.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test shared_text_context --manifest-path src-tauri/Cargo.toml`
Expected: FAIL because shared text context storage does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add the shared text context schema, migration, repository helpers, and read/write path changes needed for text contexts.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test shared_text_context --manifest-path src-tauri/Cargo.toml`
Expected: PASS

### Task 2: Add failing repository coverage for rename behavior

**Files:**
- Modify: `src-tauri/src/db/repository.rs`

- [ ] **Step 1: Write the failing test**

Add a repository test proving that renaming a shared text context changes the label seen by all referencing notes and suggestion data, and rejects duplicate normalized labels.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test rename_text_context --manifest-path src-tauri/Cargo.toml`
Expected: FAIL because the rename operation does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add the rename repository method and search-index refresh for affected notes.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test rename_text_context --manifest-path src-tauri/Cargo.toml`
Expected: PASS

## Chunk 2: Command and Type Surface

### Task 3: Add failing frontend/command contract coverage

**Files:**
- Modify: `src/__tests__/app-shell.test.tsx`
- Modify: `src/__tests__/editor-flow.test.tsx`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Write the failing test**

Add a test proving Settings lists existing shared tags and a rename action calls a new Tauri bridge function and refreshes workspace data.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand src/__tests__/app-shell.test.tsx src/__tests__/editor-flow.test.tsx`
Expected: FAIL because the tag editor UI and bridge function do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add TS types, a Tauri bridge function, Rust DTOs/commands, and workspace payload support for editable text contexts.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand src/__tests__/app-shell.test.tsx src/__tests__/editor-flow.test.tsx`
Expected: PASS

## Chunk 3: Settings UI

### Task 4: Add the Settings tag editor

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Write the failing test**

Extend Settings-focused UI coverage to exercise inline rename affordances and successful refresh.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand src/__tests__/app-shell.test.tsx src/__tests__/editor-flow.test.tsx`
Expected: FAIL because the UI affordance is not implemented yet.

- [ ] **Step 3: Write minimal implementation**

Add a Settings section for shared text contexts with inline edit state, save/cancel controls, and reload on success.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand src/__tests__/app-shell.test.tsx src/__tests__/editor-flow.test.tsx`
Expected: PASS

## Chunk 4: Final Verification

### Task 5: Run targeted verification

**Files:**
- Modify: `src-tauri/migrations/0003_shared_text_contexts.sql`
- Modify: `src-tauri/src/commands/workspace.rs`
- Modify: `src-tauri/src/db/repository.rs`
- Modify: `src/App.tsx`
- Modify: `src/lib/tauri.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/styles/app.css`
- Modify: `src/__tests__/app-shell.test.tsx`
- Modify: `src/__tests__/editor-flow.test.tsx`

- [ ] **Step 1: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS

- [ ] **Step 2: Run frontend tests**

Run: `npm test -- --runInBand src/__tests__/app-shell.test.tsx src/__tests__/editor-flow.test.tsx`
Expected: PASS
