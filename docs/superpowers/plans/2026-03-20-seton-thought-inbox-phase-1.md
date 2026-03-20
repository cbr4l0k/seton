# Seton Thought Inbox Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable Seton desktop slice on `Tauri + Vite`: center note capture with text, URL, and image `capture_contexts`, recent-note history, placeholder adjacent panels, and edit flows that can request future analysis without running AI.

**Architecture:** Keep the app split into a React/Vite frontend and a Rust/Tauri core. The Rust side owns SQLite persistence, image import into app-managed storage, and typed commands; the React side owns the spatial shell, keyboard navigation, draft editing, and placeholder surfaces. Treat notes as canonical records, capture contexts as note-attached records, and analysis state as metadata only.

**Tech Stack:** Tauri v2-style desktop shell, Vite + React + TypeScript frontend, Vitest + React Testing Library, Rust + `sqlx` with SQLite, `@tauri-apps/plugin-dialog` for image picking.

---

## Current Repo Notes

- The approved product spec is [docs/superpowers/specs/2026-03-19-seton-product-roadmap-design.md](../specs/2026-03-19-seton-product-roadmap-design.md).
- The current visual wireframe lives in the untracked repo-root file `App.tsx`. Use it as a behavior and layout reference while implementing the React app under `src/`.
- There is no existing Vite or Tauri scaffold in the repo yet, so the first chunk establishes the runnable application baseline.

## Planned File Structure

- `package.json`
  Frontend scripts and dependencies for Vite, React, Vitest, and the Tauri CLI.
- `tsconfig.json`
  TypeScript compiler settings for the frontend.
- `tsconfig.node.json`
  Vite config TypeScript support.
- `vite.config.ts`
  React plugin and Vitest config.
- `index.html`
  Vite entry HTML.
- `src/main.tsx`
  React bootstrap.
- `src/App.tsx`
  Top-level app container, startup load, and high-level state wiring.
- `src/styles/app.css`
  Global styles and the migrated wireframe visuals.
- `src/lib/types.ts`
  Frontend DTOs matching Rust command payloads.
- `src/lib/tauri.ts`
  Typed wrappers around `invoke` and dialog usage.
- `src/hooks/useSpatialNavigation.ts`
  Arrow-key and `Escape` navigation between panels.
- `src/components/WorkspaceCanvas.tsx`
  Spatial layout container for center, bottom, left, right, and top panels.
- `src/components/CenterEditorPanel.tsx`
  Note body editor, save affordance, and focus handling.
- `src/components/CaptureContextEditor.tsx`
  Add, edit, remove, and preview text, URL, and image contexts in the center panel.
- `src/components/HistoryPanel.tsx`
  Recent notes list and reopen interaction.
- `src/components/PlaceholderPanel.tsx`
  Reusable placeholder rendering for graph, insights, and finished documents.
- `src/components/AnalysisRequestDialog.tsx`
  Prompt shown when an edited note or context changes and the user saves.
- `src/test/setup.ts`
  Vitest setup for DOM assertions.
- `src/__tests__/app-shell.test.tsx`
  Shell, navigation, and placeholder tests.
- `src/__tests__/editor-flow.test.tsx`
  Save, reopen, capture context, and analysis prompt tests.
- `src-tauri/Cargo.toml`
  Rust dependencies and Tauri config.
- `src-tauri/build.rs`
  Tauri build script.
- `src-tauri/tauri.conf.json`
  Tauri build and window config wired to Vite.
- `src-tauri/capabilities/default.json`
  Tauri capabilities, including dialog open permissions.
- `src-tauri/src/main.rs`
  Tauri application entry point.
- `src-tauri/src/lib.rs`
  Shared app bootstrap, state registration, and command registration.
- `src-tauri/src/app_state.rs`
  App directories, SQLite path resolution, and shared state initialization.
- `src-tauri/src/domain/mod.rs`
  Domain module exports.
- `src-tauri/src/domain/note.rs`
  Canonical note entities and analysis status.
- `src-tauri/src/domain/capture_context.rs`
  Capture context entities and input enums.
- `src-tauri/migrations/0001_initial.sql`
  Initial SQLite schema for notes and capture contexts.
- `src-tauri/src/db/mod.rs`
  Database module exports.
- `src-tauri/src/db/schema.rs`
  `sqlx` migration runner and pool bootstrap helpers.
- `src-tauri/src/db/repository.rs`
  Async save, update, list, and reopen note persistence logic.
- `src-tauri/src/commands/mod.rs`
  Command module exports.
- `src-tauri/src/commands/workspace.rs`
  Tauri command handlers and DTO mapping for startup, save, and reopen flows.
- `README.md`
  Local setup and verification commands once the app is runnable.

## Chunk 1: Foundation And Persistence

### Task 1: Bootstrap The Vite/React Frontend And Test Harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles/app.css`
- Create: `src/test/setup.ts`
- Test: `src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Create the frontend scaffold files and a failing shell test**

```tsx
// src/__tests__/app-shell.test.tsx
import { render, screen } from "@testing-library/react";
import App from "../App";

test("renders the Thought Inbox shell", () => {
  render(<App />);
  expect(screen.getByPlaceholderText("I'm thinking about...")).toBeInTheDocument();
  expect(screen.getByText("Notes")).toBeInTheDocument();
});
```

- [ ] **Step 2: Install frontend dependencies**

Run: `npm install`
Expected: `added ... packages` with no install errors.

- [ ] **Step 3: Run the shell test to verify it fails**

Run: `npm run test -- --run src/__tests__/app-shell.test.tsx`
Expected: FAIL because `src/App.tsx` is still missing the approved shell.

- [ ] **Step 4: Implement the minimal Vite frontend shell**

```tsx
// src/App.tsx
import "./styles/app.css";

export default function App() {
  return (
    <main className="app-shell">
      <section className="panel panel-center">
        <textarea placeholder="I'm thinking about..." />
      </section>
      <section className="panel panel-bottom">
        <h2>Notes</h2>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Re-run the frontend test**

Run: `npm run test -- --run src/__tests__/app-shell.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit the scaffold**

```bash
git add package.json tsconfig.json tsconfig.node.json vite.config.ts index.html src
git commit -m "feat: scaffold vite frontend for thought inbox"
```

### Task 2: Initialize The Tauri Shell And Shared Rust App State

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/app_state.rs`

- [ ] **Step 1: Write a failing Rust unit test for app-local path creation**

```rust
#[cfg(test)]
mod tests {
    use super::build_app_paths;
    use std::path::PathBuf;

    #[test]
    fn builds_db_path_under_app_data_dir() {
        let root = PathBuf::from("/tmp/seton-test");
        let paths = build_app_paths(&root);
        assert!(paths.db_path.ends_with("seton.sqlite"));
        assert!(paths.images_dir.ends_with("capture-contexts/images"));
    }
}
```

- [ ] **Step 2: Run the Rust test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml app_state::tests::builds_db_path_under_app_data_dir`
Expected: FAIL because the Tauri crate and app-state helper do not exist yet.

- [ ] **Step 3: Implement the Tauri shell and app-state bootstrap**

```rust
// src-tauri/src/app_state.rs
pub struct AppPaths {
    pub db_path: std::path::PathBuf,
    pub images_dir: std::path::PathBuf,
}

pub fn build_app_paths(root: &std::path::Path) -> AppPaths {
    AppPaths {
        db_path: root.join("seton.sqlite"),
        images_dir: root.join("capture-contexts").join("images"),
    }
}
```

Implementation notes:
- Use Tauri’s Vite integration layout: `src-tauri/` plus `tauri.conf.json`.
- Register `tauri_plugin_dialog`.
- Put `dialog:allow-open` in `src-tauri/capabilities/default.json`.
- Configure `beforeDevCommand` as `npm run dev` and `beforeBuildCommand` as `npm run build`.

- [ ] **Step 4: Verify the Rust shell builds**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Commit the Tauri baseline**

```bash
git add src-tauri
git commit -m "feat: add tauri shell and shared app state"
```

### Task 3: Implement SQLite Schema, Note Repository, And Image Import

**Files:**
- Create: `src-tauri/src/domain/mod.rs`
- Create: `src-tauri/src/domain/note.rs`
- Create: `src-tauri/src/domain/capture_context.rs`
- Create: `src-tauri/migrations/0001_initial.sql`
- Create: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/db/schema.rs`
- Create: `src-tauri/src/db/repository.rs`
- Modify: `src-tauri/src/app_state.rs`
- Test: `src-tauri/src/db/repository.rs`

- [ ] **Step 1: Write failing repository tests for save, reopen, and image copy**

```rust
#[tokio::test]
async fn saves_note_with_text_and_url_contexts() {
    let repo = test_repo().await;
    let saved = repo.save_note(SaveNoteInput {
        note_id: None,
        body: "A durable note".into(),
        capture_contexts: vec![
            CaptureContextInput::Text { text: "crypto 2nd homework".into() },
            CaptureContextInput::Url { url: "https://example.com".into() },
        ],
        request_analysis: false,
    }).await.unwrap();

    let reopened = repo.get_note(saved.id).await.unwrap().unwrap();
    assert_eq!(reopened.body, "A durable note");
    assert_eq!(reopened.capture_contexts.len(), 2);
    assert_eq!(reopened.analysis_status.as_str(), "not_requested");
}

#[tokio::test]
async fn copies_image_contexts_into_managed_storage() {
    let repo = test_repo().await;
    let saved = repo.save_note(SaveNoteInput {
        note_id: None,
        body: "Image note".into(),
        capture_contexts: vec![
            CaptureContextInput::Image { source_path: fixture_png_path() },
        ],
        request_analysis: false,
    }).await.unwrap();

    let image = saved.capture_contexts.into_iter().find(|item| item.is_image()).unwrap();
    assert!(std::path::Path::new(image.managed_path().unwrap()).exists());
}
```

- [ ] **Step 2: Run repository tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml repository::tests`
Expected: FAIL because the schema and repository are not implemented.

- [ ] **Step 3: Implement the schema and repository**

```sql
-- src-tauri/migrations/0001_initial.sql
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
```

Implementation notes:
- Use `sqlx::SqlitePool` directly on the Rust side.
- Run migrations at startup with `sqlx::migrate!()` from `src-tauri/src/db/schema.rs`.
- Hash `body` plus normalized context payloads when computing `content_hash`.
- Reject empty note bodies before insert/update.
- When an image context is saved, copy the selected file into the app-managed images directory and persist the managed path.
- Add a `list_recent_notes(limit)` repository method that returns preview text and timestamps for the history panel.
- Keep repository methods async and use `sqlx::query_as` / `sqlx::query` rather than adding an offline query-prepare workflow in Phase 1.

- [ ] **Step 4: Re-run the Rust repository tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml repository::tests`
Expected: PASS.

- [ ] **Step 5: Commit the persistence layer**

```bash
git add src-tauri/src/domain src-tauri/src/db src-tauri/src/app_state.rs
git add src-tauri/migrations
git commit -m "feat: persist notes and capture contexts with sqlx"
```

### Task 4: Expose Typed Tauri Commands For Workspace Bootstrap, Save, And Reopen

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/workspace.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/lib/types.ts`
- Create: `src/lib/tauri.ts`
- Test: `src-tauri/src/commands/workspace.rs`

- [ ] **Step 1: Write a failing Rust command-layer test for workspace bootstrap**

```rust
#[tokio::test]
async fn bootstrap_workspace_returns_recent_notes() {
    let state = seeded_state_with_recent_note().await;
    let payload = bootstrap_workspace(state).await.unwrap();
    assert_eq!(payload.history.len(), 1);
    assert_eq!(payload.history[0].preview, "Seed note");
}
```

- [ ] **Step 2: Run the command-layer tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml commands::workspace::tests`
Expected: FAIL because the commands are not implemented.

- [ ] **Step 3: Implement the Rust commands and typed frontend wrappers**

```rust
#[tauri::command]
pub async fn bootstrap_workspace(state: tauri::State<'_, AppState>) -> Result<WorkspacePayload, String> { /* ... */ }

#[tauri::command]
pub async fn save_note(state: tauri::State<'_, AppState>, input: SaveNoteRequest) -> Result<NoteDetailDto, String> { /* ... */ }

#[tauri::command]
pub async fn open_note(state: tauri::State<'_, AppState>, note_id: String) -> Result<NoteDetailDto, String> { /* ... */ }
```

```ts
// src/lib/tauri.ts
export async function bootstrapWorkspace(): Promise<WorkspacePayload> {
  return invoke("bootstrap_workspace");
}

export async function saveNote(input: SaveNoteRequest): Promise<NoteDetail> {
  return invoke("save_note", { input });
}

export async function openNote(noteId: string): Promise<NoteDetail> {
  return invoke("open_note", { noteId });
}
```

Implementation notes:
- `WorkspacePayload` should contain recent history plus static placeholder metadata for top/left/right panels.
- `SaveNoteRequest` should support both create and edit via an optional `noteId`.
- `open_note` must update `last_opened_at` before returning the note detail.

- [ ] **Step 4: Verify the command layer**

Run: `cargo test --manifest-path src-tauri/Cargo.toml commands::workspace::tests`
Expected: PASS.

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Commit the command layer**

```bash
git add src-tauri/src/commands src-tauri/src/lib.rs src/lib/types.ts src/lib/tauri.ts
git commit -m "feat: expose typed workspace commands to the frontend"
```

## Chunk 2: UI And Behavior

### Task 5: Migrate The Wireframe Into A Componentized Spatial Shell

**Files:**
- Modify: `src/App.tsx`
- Create: `src/hooks/useSpatialNavigation.ts`
- Create: `src/components/WorkspaceCanvas.tsx`
- Create: `src/components/HistoryPanel.tsx`
- Create: `src/components/PlaceholderPanel.tsx`
- Modify: `src/styles/app.css`
- Test: `src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Expand the frontend test to cover navigation and placeholders**

```tsx
test("arrow keys move between center and placeholder panels", async () => {
  render(<App />);
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("heading", { name: "Concept Graph" })).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.getByPlaceholderText("I'm thinking about...")).toHaveFocus();
});
```

- [ ] **Step 2: Run the shell tests to verify they fail**

Run: `npm run test -- --run src/__tests__/app-shell.test.tsx`
Expected: FAIL because the shell has not been decomposed into the spatial layout yet.

- [ ] **Step 3: Implement the componentized shell**

```tsx
// src/components/WorkspaceCanvas.tsx
export function WorkspaceCanvas({ position, children }: Props) {
  return (
    <div
      className="workspace-canvas"
      data-position={position}
    >
      {children}
    </div>
  );
}
```

Implementation notes:
- Preserve the center, bottom, left, right, and top layout from the wireframe.
- Move the raw keyboard event logic out of `App.tsx` into `useSpatialNavigation`.
- Keep the graph, insights, and documents surfaces visibly present but explicitly placeholder-only.
- Rewrite the styling into `src/styles/app.css` instead of introducing Tailwind to the Phase 1 stack.

- [ ] **Step 4: Re-run the shell tests**

Run: `npm run test -- --run src/__tests__/app-shell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit the shell migration**

```bash
git add src/App.tsx src/hooks/useSpatialNavigation.ts src/components/WorkspaceCanvas.tsx src/components/HistoryPanel.tsx src/components/PlaceholderPanel.tsx src/styles/app.css src/__tests__/app-shell.test.tsx
git commit -m "feat: migrate wireframe into spatial shell components"
```

### Task 6: Build The Center Composer And Capture Context Editor

**Files:**
- Create: `src/components/CenterEditorPanel.tsx`
- Create: `src/components/CaptureContextEditor.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/tauri.ts`
- Test: `src/__tests__/editor-flow.test.tsx`

- [ ] **Step 1: Write a failing frontend test for adding text, URL, and image contexts**

```tsx
test("draft supports text, url, and image capture contexts", async () => {
  mockDialogOpen("/tmp/context.png");
  render(<App />);

  await user.type(screen.getByPlaceholderText("I'm thinking about..."), "A note");
  await user.click(screen.getByRole("button", { name: "Add text context" }));
  await user.type(screen.getByLabelText("Text context"), "crypto 2nd homework");
  await user.click(screen.getByRole("button", { name: "Add URL context" }));
  await user.type(screen.getByLabelText("URL context"), "https://example.com");
  await user.click(screen.getByRole("button", { name: "Add image context" }));

  expect(screen.getByText("crypto 2nd homework")).toBeInTheDocument();
  expect(screen.getByText("https://example.com")).toBeInTheDocument();
  expect(screen.getByText("context.png")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the editor-flow test to verify it fails**

Run: `npm run test -- --run src/__tests__/editor-flow.test.tsx`
Expected: FAIL because the center panel only has the note textarea.

- [ ] **Step 3: Implement the composer and capture context UI**

```ts
export type DraftCaptureContext =
  | { kind: "text"; value: string }
  | { kind: "url"; value: string }
  | { kind: "image"; sourcePath: string; label: string };
```

Implementation notes:
- Keep the note body visually primary.
- Render contexts as note-attached inputs beneath the main composer, not as separate navigation panels.
- Use `@tauri-apps/plugin-dialog` to pick image files and store the selected source path in draft state until save.
- Validate URLs lightly on the client: allow blank draft rows while editing, but block save if a committed URL row is malformed.

- [ ] **Step 4: Re-run the editor-flow test**

Run: `npm run test -- --run src/__tests__/editor-flow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit the center editor**

```bash
git add src/components/CenterEditorPanel.tsx src/components/CaptureContextEditor.tsx src/App.tsx src/lib/tauri.ts src/__tests__/editor-flow.test.tsx
git commit -m "feat: add note composer and capture context editor"
```

### Task 7: Wire Save, History Reopen, And Analysis-Request-On-Edit

**Files:**
- Modify: `src/App.tsx`
- Create: `src/components/AnalysisRequestDialog.tsx`
- Modify: `src/components/HistoryPanel.tsx`
- Modify: `src/lib/tauri.ts`
- Test: `src/__tests__/editor-flow.test.tsx`

- [ ] **Step 1: Extend the frontend test for save, reopen, and edit analysis prompts**

```tsx
test("editing an existing note asks whether to request fresh analysis", async () => {
  mockBootstrapWorkspace(oneSavedNote());
  mockOpenNote(savedNoteDetail());
  mockSaveNote(updatedNoteDetail());

  render(<App />);
  await user.click(screen.getByText("Seed note"));
  await user.type(screen.getByPlaceholderText("I'm thinking about..."), " changed");
  await user.keyboard("{Control>}{Enter}{/Control}");

  expect(screen.getByText("Run analysis on this edited note later?")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Request analysis later" }));

  expect(mockSaveNote).toHaveBeenCalledWith(
    expect.objectContaining({ requestAnalysis: true })
  );
});
```

- [ ] **Step 2: Run the editor-flow test to verify it fails**

Run: `npm run test -- --run src/__tests__/editor-flow.test.tsx`
Expected: FAIL because save/open/edit flows are not wired to Tauri yet.

- [ ] **Step 3: Implement the end-to-end editor behavior**

```tsx
if (isEditingExistingNote && draftChangedSinceLoad) {
  setPendingSave({ requestAnalysis: null });
  setAnalysisDialogOpen(true);
  return;
}
```

Implementation notes:
- Load `bootstrapWorkspace()` on app start.
- `Ctrl+Enter` and `Cmd+Enter` should save from the center panel.
- Opening a history item must call `openNote(noteId)`, move the shell back to center, and hydrate both body and contexts.
- Only show the analysis dialog when editing an existing note and either the note body or any committed context changed.
- If the user chooses “skip”, save with `requestAnalysis: false`; if they choose “request later”, save with `requestAnalysis: true`.

- [ ] **Step 4: Re-run the editor-flow test**

Run: `npm run test -- --run src/__tests__/editor-flow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit the functional inbox flow**

```bash
git add src/App.tsx src/components/AnalysisRequestDialog.tsx src/components/HistoryPanel.tsx src/lib/tauri.ts src/__tests__/editor-flow.test.tsx
git commit -m "feat: wire note save reopen and analysis request flows"
```

### Task 8: Final Cleanup, Docs, And Verification

**Files:**
- Modify: `README.md`
- Delete: `App.tsx` once `src/App.tsx` fully replaces it
- Modify: `docs/superpowers/plans/2026-03-20-seton-thought-inbox-phase-1.md` only if execution revealed mismatches

- [ ] **Step 1: Update the README with local dev instructions**

````md
## Development

```bash
npm install
npm run tauri dev
```

## Tests

```bash
npm run test -- --run
cargo test --manifest-path src-tauri/Cargo.toml
```
````

- [ ] **Step 2: Remove the obsolete repo-root wireframe file**

Run: `rm App.tsx`
Expected: the repo root no longer contains the old standalone wireframe.

- [ ] **Step 3: Run the full verification suite**

Run: `npm run test -- --run`
Expected: PASS.

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

Run: `npm run build`
Expected: PASS and Vite outputs production assets.

Run: `npm run tauri dev`
Expected: Tauri window opens with center editor focused, placeholder side panels visible, note save/history/edit flows working.

- [ ] **Step 4: Commit the finished Phase 1 slice**

```bash
git add README.md package.json tsconfig.json tsconfig.node.json vite.config.ts index.html src src-tauri
git add -u
git commit -m "feat: deliver phase 1 thought inbox desktop app"
```

## Local Plan Review Notes

- This plan was reviewed locally against the approved spec for scope, file boundaries, and task granularity.
- Subagent-based chunk review was not run in this session because subagent delegation was not explicitly authorized by the user.

## Execution Order

1. Finish Chunk 1 completely so the app is runnable and persistence exists before deeper UI work.
2. Finish Chunk 2 in order, because each task depends on the previous one’s shell or data wiring.
3. Do not add AI extraction, graph interactions, OCR, URL enrichment, or document generation during this plan.

Plan complete and saved to `docs/superpowers/plans/2026-03-20-seton-thought-inbox-phase-1.md`. Ready to execute?
