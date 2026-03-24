# Context Horizontal Navigation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the context input use `ArrowLeft` and `ArrowRight` to always move to the left and right workspace panels.

**Architecture:** Keep this behavior local to the context editor rather than changing the global spatial-navigation rules for every input. Pass the workspace position setter from `App` through `CenterEditorPanel` into `CaptureContextEditor`, where the context-input key handler can intercept left/right while preserving existing suggestion handling for up/down and leaving the main note textarea unchanged.

**Tech Stack:** React, TypeScript, Vitest + React Testing Library, `jj`.

---

## Planned File Structure

- `docs/superpowers/specs/2026-03-24-context-horizontal-navigation-design.md`
  Approved design reference for this navigation tweak.
- `src/App.tsx`
  Passes workspace position control into the center editor.
- `src/components/CenterEditorPanel.tsx`
  Threads the position setter down into the context editor.
- `src/components/CaptureContextEditor.tsx`
  Owns the context-input key handling for left/right panel movement.
- `src/__tests__/editor-flow.test.tsx`
  Adds coverage for left/right navigation from the context input.
- `src/__tests__/app-shell.test.tsx`
  Keeps the existing textarea navigation contract explicit.

## Chunk 1: Context Input Left/Right Navigation

### Task 1: Add focused tests and implement local horizontal navigation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/CenterEditorPanel.tsx`
- Modify: `src/components/CaptureContextEditor.tsx`
- Modify: `src/__tests__/editor-flow.test.tsx`
- Test: `src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Write the failing frontend tests**

```tsx
test("ArrowLeft from the context input activates the left panel", async () => {
  mockBootstrapWorkspace.mockResolvedValue(makeWorkspacePayload());
  render(<App />);

  const input = screen.getByLabelText("Context input");
  input.focus();
  fireEvent.keyDown(input, { key: "ArrowLeft" });

  expect(screen.getByLabelText("Concept Graph panel")).toHaveAttribute("data-active", "true");
});

test("ArrowRight from the context input activates the right panel", async () => {
  mockBootstrapWorkspace.mockResolvedValue(makeWorkspacePayload());
  render(<App />);

  const input = screen.getByLabelText("Context input");
  input.focus();
  fireEvent.keyDown(input, { key: "ArrowRight" });

  expect(screen.getByLabelText("Insights panel")).toHaveAttribute("data-active", "true");
});
```

- [ ] **Step 2: Run the focused test file to verify it fails**

Run: `npm run test -- --run src/__tests__/editor-flow.test.tsx`
Expected: FAIL because the context input does not yet move workspace position on left/right.

- [ ] **Step 3: Implement the minimal navigation wiring**

```tsx
if (event.key === "ArrowLeft") {
  event.preventDefault();
  setPosition("left");
  return;
}

if (event.key === "ArrowRight") {
  event.preventDefault();
  setPosition("right");
  return;
}
```

Implementation notes:
- Pass `setPosition` from `App` to `CenterEditorPanel`, then to `CaptureContextEditor`.
- Keep the left/right handling local to the context input only.
- Do not change the note textarea behavior or the global editable-target guard in `useSpatialNavigation`.
- Preserve the existing `ArrowUp` and `ArrowDown` suggestion behavior.

- [ ] **Step 4: Run verification commands**

Run: `npm run build`
Expected: PASS.

Run: `npm run test -- --run src/__tests__/app-shell.test.tsx src/__tests__/editor-flow.test.tsx`
Expected: PASS if the Vitest environment is healthy; otherwise capture the exact harness error.

- [ ] **Step 5: Record the checkpoint with `jj`**

```bash
jj describe -m "feat: add horizontal context navigation #5"
```
