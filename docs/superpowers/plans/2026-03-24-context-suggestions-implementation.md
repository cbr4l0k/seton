# Context Suggestions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fuzzy text-context suggestions during note entry, with recommendation ranking influenced by already selected text context labels.

**Architecture:** Extend the Tauri bootstrap payload with a reusable text-context suggestion catalog and text-label co-occurrence metadata derived from saved notes. Keep ranking and interaction local in the React context editor so suggestions update live while typing, while the backend remains responsible for normalization, deduplication, and session refresh after save.

**Tech Stack:** React + TypeScript, Vitest + React Testing Library, Tauri commands, Rust + `sqlx` with SQLite, `jj` for checkpointing.

---

## Planned File Structure

- `docs/superpowers/specs/2026-03-24-context-suggestions-design.md`
  Approved design reference for issue `#5`.
- `src/lib/types.ts`
  Frontend DTO additions for known text contexts and co-occurrence metadata.
- `src/lib/tauri.ts`
  Typed wrappers continue to expose bootstrap and save payloads; no new command surface should be needed.
- `src/App.tsx`
  Holds suggestion-catalog state, populates it from bootstrap, and refreshes it after successful save.
- `src/components/CenterEditorPanel.tsx`
  Forwards suggestion-catalog props into the context editor.
- `src/components/CaptureContextEditor.tsx`
  Suggestion filtering, scoring, keyboard navigation, commit behavior, and draft-context deduplication.
- `src/styles/app.css`
  Compact visual treatment for the suggestion list and active suggestion state.
- `src/__tests__/editor-flow.test.tsx`
  End-to-end UI behavior coverage for fuzzy suggestions and recommendation boosting.
- `src/__tests__/app-shell.test.tsx`
  Bootstrap payload fixture updates so shell tests continue to compile after DTO expansion.
- `src-tauri/src/commands/workspace.rs`
  Bootstrap DTO changes and mapping from repository output to frontend payload.
- `src-tauri/src/db/repository.rs`
  Query and aggregation logic for deduplicated text labels and co-occurrence counts.

## Chunk 1: Backend Suggestion Catalog

### Task 1: Add failing Rust tests for bootstrap suggestion data

**Files:**
- Modify: `src-tauri/src/commands/workspace.rs`
- Modify: `src-tauri/src/db/repository.rs`
- Test: `src-tauri/src/commands/workspace.rs`

- [ ] **Step 1: Write the failing tests**

```rust
#[tokio::test]
async fn bootstrap_workspace_returns_known_text_contexts() {
    let state = seeded_state_with_text_contexts().await;
    let payload = bootstrap_workspace_with_state(&state).await.unwrap();

    assert_eq!(payload.known_text_contexts.len(), 2);
    assert_eq!(payload.known_text_contexts[0].label, "cryptography");
    assert_eq!(payload.known_text_contexts[0].use_count, 2);
}

#[tokio::test]
async fn bootstrap_workspace_excludes_url_and_image_contexts_from_known_text_contexts() {
    let state = seeded_state_with_mixed_contexts().await;
    let payload = bootstrap_workspace_with_state(&state).await.unwrap();

    assert!(payload.known_text_contexts.iter().all(|item| item.label != "https://example.com"));
}

#[tokio::test]
async fn bootstrap_workspace_returns_text_context_co_occurrence_counts() {
    let state = seeded_state_with_related_text_contexts().await;
    let payload = bootstrap_workspace_with_state(&state).await.unwrap();

    assert!(payload
        .text_context_relationships
        .iter()
        .any(|pair| pair.left == "cryptography" && pair.right == "number theory" && pair.use_count == 2));
}
```

- [ ] **Step 2: Run the Rust tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml commands::workspace::tests::bootstrap_workspace_returns_known_text_contexts`
Expected: FAIL because the bootstrap payload does not yet expose text-context suggestion data.

- [ ] **Step 3: Implement minimal repository aggregation and DTO mapping**

```rust
pub struct KnownTextContext {
    pub label: String,
    pub normalized_label: String,
    pub use_count: i64,
}

pub struct TextContextRelationship {
    pub left: String,
    pub right: String,
    pub use_count: i64,
}
```

Implementation notes:
- Derive text suggestions only from `capture_contexts` rows where `context_type = 'text'`.
- Normalize with the same trim + lowercase rule used for draft deduplication.
- Collapse duplicate labels by normalized form while preserving a stable representative label.
- Build co-occurrence counts per note using unique normalized labels only, so repeated identical labels on one note do not overcount relationships.
- Add `known_text_contexts` and `text_context_relationships` to `WorkspacePayload`.

- [ ] **Step 4: Re-run the focused Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml commands::workspace::tests::bootstrap_workspace_returns_known_text_contexts`
Expected: PASS.

Run: `cargo test --manifest-path src-tauri/Cargo.toml commands::workspace::tests::bootstrap_workspace_returns_text_context_co_occurrence_counts`
Expected: PASS.

- [ ] **Step 5: Record the backend checkpoint with `jj`**

```bash
jj describe -m "feat: add text context suggestion catalog to workspace bootstrap #5"
```

## Chunk 2: Frontend Suggestion Rendering And Ranking

### Task 2: Add failing UI tests for fuzzy suggestions and selected-label recommendations

**Files:**
- Modify: `src/__tests__/editor-flow.test.tsx`
- Modify: `src/__tests__/app-shell.test.tsx`
- Modify: `src/lib/types.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/CenterEditorPanel.tsx`
- Modify: `src/components/CaptureContextEditor.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
test("typing shows fuzzy text-context suggestions from prior labels", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [
      { label: "cryptography", normalizedLabel: "cryptography", useCount: 2 },
      { label: "number theory", normalizedLabel: "number theory", useCount: 1 },
    ],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "crypto" },
  });

  expect(await screen.findByRole("button", { name: "Suggest cryptography" })).toBeInTheDocument();
});

test("selected text labels boost related recommendations and exclude already selected labels", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [
      { label: "cryptography", normalizedLabel: "cryptography", useCount: 3 },
      { label: "number theory", normalizedLabel: "number theory", useCount: 3 },
      { label: "elliptic curves", normalizedLabel: "elliptic curves", useCount: 1 },
    ],
    textContextRelationships: [
      { left: "cryptography", right: "number theory", useCount: 3 },
      { left: "cryptography", right: "elliptic curves", useCount: 1 },
    ],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "cryptography" },
  });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });
  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "num" },
  });

  const suggestions = await screen.findAllByRole("button", { name: /Suggest / });
  expect(suggestions[0]).toHaveTextContent("number theory");
  expect(screen.queryByRole("button", { name: "Suggest cryptography" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused UI tests to verify they fail**

Run: `npm run test -- --run src/__tests__/editor-flow.test.tsx`
Expected: FAIL because bootstrap payload types and the context editor do not yet support suggestions.

- [ ] **Step 3: Implement minimal types and state wiring**

```ts
export type KnownTextContext = {
  label: string;
  normalizedLabel: string;
  useCount: number;
};

export type TextContextRelationship = {
  left: string;
  right: string;
  useCount: number;
};
```

Implementation notes:
- Add safe defaults in app bootstrap fallback paths so tests can supply empty arrays.
- Update existing test fixtures in `src/__tests__/app-shell.test.tsx` to include the new bootstrap payload fields.
- Refresh the suggestion catalog after a successful save by merging the saved draft’s text labels into in-memory state or by reloading bootstrap data once.
- Pass the suggestion catalog into `CaptureContextEditor` through `CenterEditorPanel`.

- [ ] **Step 4: Implement the suggestion list and scoring in `CaptureContextEditor.tsx`**

```tsx
const suggestions = rankTextContextSuggestions({
  draft,
  knownTextContexts,
  textContextRelationships,
  selectedTextContexts,
}).slice(0, 5);
```

Implementation notes:
- Only compute suggestions when the draft is non-empty and not a URL.
- Exclude already selected text labels using normalized comparisons.
- Make the first visible suggestion active by default.
- Support `ArrowDown` and `ArrowUp` for active-suggestion movement.
- When `Enter` is pressed and a suggestion is active, commit that suggestion instead of the raw draft.
- Keep URL and image flows unchanged.

- [ ] **Step 5: Re-run the focused UI tests**

Run: `npm run test -- --run src/__tests__/editor-flow.test.tsx`
Expected: PASS for the new suggestion tests and existing editor-flow tests.

- [ ] **Step 6: Record the frontend checkpoint with `jj`**

```bash
jj describe -m "feat: add fuzzy context suggestions to note entry #5"
```

## Chunk 3: Polish, Refresh, And Verification

### Task 3: Cover save-refresh behavior and finalize styling

**Files:**
- Modify: `src/__tests__/editor-flow.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/CaptureContextEditor.tsx`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Write the failing save-refresh test**

```tsx
test("newly saved text labels become available as suggestions for the next draft", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
  });
  mockSaveNote.mockResolvedValue({
    ...makeSavedNoteDetail(),
    body: "A note",
    captureContexts: [{ id: "ctx-1", kind: "text", textValue: "cryptography", urlValue: null, sourcePath: null, managedPath: null }],
  });

  render(<App />);

  fireEvent.change(screen.getByPlaceholderText("I'm thinking about..."), {
    target: { value: "A note" },
  });
  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "cryptography" },
  });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });
  fireEvent.keyDown(screen.getByPlaceholderText("I'm thinking about..."), {
    key: "Enter",
    ctrlKey: true,
  });

  await waitFor(() => expect(screen.getByPlaceholderText("I'm thinking about...")).toHaveValue(""));

  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "crypto" },
  });

  expect(await screen.findByRole("button", { name: "Suggest cryptography" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm run test -- --run src/__tests__/editor-flow.test.tsx -t "newly saved text labels become available as suggestions for the next draft"`
Expected: FAIL because the in-memory suggestion catalog is not refreshed after save yet.

- [ ] **Step 3: Implement the minimal refresh and styling changes**

Implementation notes:
- Update the app state after `save_note` so the just-saved text labels and their relationships are reflected immediately.
- Keep styling compact and aligned with existing chip/button visuals.
- Ensure inactive editors do not show suggestions.

- [ ] **Step 4: Run the full verification suite**

Run: `npm run test -- --run src/__tests__/editor-flow.test.tsx src/__tests__/app-shell.test.tsx`
Expected: PASS.

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Record the final verification checkpoint with `jj`**

```bash
jj describe -m "test: verify text context suggestions flow for note entry #5"
```
