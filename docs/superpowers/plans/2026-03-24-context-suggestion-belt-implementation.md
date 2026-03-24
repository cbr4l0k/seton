# Context Suggestion Belt Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current suggestion interaction with a circular horizontal belt navigated by `ArrowLeft` and `ArrowRight`.

**Architecture:** Keep ranking logic intact, but change the suggestion interaction model in `CaptureContextEditor` from index-by-up/down and left/right panel navigation to a stable-identity horizontal rail. The active suggestion should persist by normalized label when the ranked list changes, otherwise reset to the first ranked suggestion, and the belt should wrap circularly on left/right.

**Tech Stack:** React, TypeScript, Vitest + React Testing Library, `jj`.

---

## Planned File Structure

- `docs/superpowers/specs/2026-03-24-context-suggestion-belt-design.md`
  Approved behavior reference for the belt interaction.
- `src/components/CaptureContextEditor.tsx`
  Owns belt navigation, active suggestion identity, and rail scrolling behavior.
- `src/components/CenterEditorPanel.tsx`
  Removes no-longer-needed position wiring if the context editor stops owning left/right panel jumps.
- `src/App.tsx`
  Removes no-longer-needed prop threading for context-input horizontal panel navigation.
- `src/styles/app.css`
  Styles the suggestions as a horizontal rail with centered active state.
- `src/__tests__/editor-flow.test.tsx`
  Replaces the old left/right navigation expectations with belt navigation tests.

## Chunk 1: Circular Suggestion Belt

### Task 1: Replace current arrow interaction with the horizontal suggestion belt

**Files:**
- Modify: `src/components/CaptureContextEditor.tsx`
- Modify: `src/components/CenterEditorPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/app.css`
- Modify: `src/__tests__/editor-flow.test.tsx`

- [ ] **Step 1: Write the failing frontend tests**

```tsx
test("ArrowRight advances to the next suggestion", async () => {
  renderWithCryptoSuggestions();
  fireEvent.change(screen.getByLabelText("Context input"), { target: { value: "crypto" } });

  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "ArrowRight" });

  expect(screen.getByRole("button", { name: "Suggest cryptoanalysis" })).toHaveAttribute("data-active", "true");
});

test("ArrowLeft wraps from the first suggestion to the last", async () => {
  renderWithCryptoSuggestions();
  fireEvent.change(screen.getByLabelText("Context input"), { target: { value: "crypto" } });

  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "ArrowLeft" });

  expect(screen.getByRole("button", { name: "Suggest cryptoanalysis" })).toHaveAttribute("data-active", "true");
});
```

Also replace the current tests that assert `ArrowLeft` and `ArrowRight` leave the context input for workspace panels.

- [ ] **Step 2: Run the focused frontend tests to verify they fail**

Run: `npm run test -- --run src/__tests__/editor-flow.test.tsx`
Expected: FAIL because left/right currently trigger panel movement and up/down still drive suggestion selection.

- [ ] **Step 3: Implement the minimal belt interaction**

Implementation notes:
- Remove `onPositionChange` from the context editor path if it is no longer needed.
- Track the active suggestion by `normalizedLabel`, not only by index.
- On suggestion-list refresh: keep the same active label if present, otherwise activate the first suggestion.
- Use `ArrowLeft` and `ArrowRight` to rotate through the visible suggestions circularly.
- Stop using `ArrowUp` and `ArrowDown` for suggestion selection.
- Keep `Enter` committing the active suggestion.
- Render suggestions in a horizontal scrollable rail and scroll the active item into view.

- [ ] **Step 4: Run verification commands**

Run: `npm run build`
Expected: PASS.

Run: `npm run test -- --run src/__tests__/app-shell.test.tsx src/__tests__/editor-flow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Record the checkpoint with `jj`**

```bash
jj describe -m "feat: add context suggestion belt navigation #5"
```
