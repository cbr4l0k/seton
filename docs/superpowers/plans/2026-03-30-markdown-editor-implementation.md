# Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the center `textarea` with a CodeMirror 6 Markdown editor while preserving desktop editing behavior and adding support for code block highlighting and LaTeX-style math rendering.

**Architecture:** First lock down shortcut behavior in the existing editor path so undo/redo and clipboard expectations are covered independently. Then introduce a focused CodeMirror wrapper component behind the existing center-panel draft interface, and finally add Markdown-oriented extensions plus rendering support for fenced code blocks and math without changing the current app styling.

**Tech Stack:** React, TypeScript, Vitest, CodeMirror 6, Markdown rendering libraries, Tauri

---

## Chunk 1: Protect Desktop Editing Behavior

### Task 1: Add failing shortcut regression coverage

**Files:**
- Modify: `src/__tests__/editor-flow.test.tsx`

- [ ] **Step 1: Write the failing test**

Add focused tests for editor keyboard behavior that distinguish save shortcuts from native editing shortcuts. Cover:
- `Ctrl+Enter` or `Cmd+Enter` still triggers save.
- `Ctrl+Z`, `Cmd+Z`, and `Ctrl+Shift+Z` are not intercepted by app-level handlers while the editor is focused.
- A focused editor history regression that demonstrates content can be changed, undone, and redone through the editing surface used in the app.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand src/__tests__/editor-flow.test.tsx`
Expected: FAIL because the current coverage does not protect the shortcut behavior required by issue `#1`.

- [ ] **Step 3: Write minimal implementation**

Adjust the existing app/editor keyboard handling so standard editing shortcuts are never swallowed while focus is inside an editable surface, without regressing save behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand src/__tests__/editor-flow.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
jj describe -m "test: protect editor keyboard shortcuts #1"
jj new
```

## Chunk 2: Replace Textarea With CodeMirror

### Task 2: Add failing component coverage for the editor wrapper

**Files:**
- Create: `src/components/MarkdownEditor.tsx`
- Modify: `src/components/CenterEditorPanel.tsx`
- Modify: `src/__tests__/editor-flow.test.tsx`

- [ ] **Step 1: Write the failing test**

Add tests proving the center editor still reflects draft body state, emits changes through `onBodyChange`, and can receive focus when the center panel becomes active after the textarea is removed.
Also add coverage proving pasted images still create image capture contexts after the textarea is removed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand src/__tests__/editor-flow.test.tsx`
Expected: FAIL because the CodeMirror wrapper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add a `MarkdownEditor` wrapper around CodeMirror 6 that:
- accepts `value`, `onChange`, `active`, and focus integration props
- preserves the current placeholder behavior
- reuses the existing center-panel styling hooks
- preserves the current pasted-image capture behavior exposed by `CenterEditorPanel`

Update `CenterEditorPanel` to render the wrapper instead of the native `textarea`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand src/__tests__/editor-flow.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: replace draft textarea with CodeMirror #1"
jj new
```

## Chunk 3: Add Markdown, Code, and Math Support

### Task 3: Add failing coverage for Markdown-focused authoring support

**Files:**
- Modify: `src/components/MarkdownEditor.tsx`
- Modify: `src/components/CenterEditorPanel.tsx`
- Modify: `src/styles/app.css`
- Modify: `src/__tests__/editor-flow.test.tsx`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Add tests that prove the editor initializes with Markdown-oriented configuration and preserves the current application chrome. Cover at least one regression around fenced code or math-oriented content remaining editable as plain Markdown source.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand src/__tests__/editor-flow.test.tsx`
Expected: FAIL because the Markdown-focused editor configuration is not present yet.

- [ ] **Step 3: Write minimal implementation**

Install and configure the CodeMirror packages needed for:
- core editor state/view/history
- Markdown language support
- syntax highlighting for fenced code blocks

Install and wire the free dependencies needed for source-first Markdown authoring support in the editor. Because the current scoped app surface does not yet include a dedicated Markdown preview, defer rendered math/code output UI and instead ensure the editor stack can accept and preserve Markdown, fenced code, and LaTeX-style math source without changing the current visual language.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand src/__tests__/editor-flow.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add markdown, code, and math editor support #1"
jj new
```

## Chunk 4: Final Verification

### Task 4: Run project verification

**Files:**
- Modify: `package.json`
- Modify: `src/App.tsx`
- Modify: `src/components/CenterEditorPanel.tsx`
- Create: `src/components/MarkdownEditor.tsx`
- Modify: `src/styles/app.css`
- Modify: `src/__tests__/editor-flow.test.tsx`

- [ ] **Step 1: Run focused frontend tests**

Run: `npm test -- --runInBand src/__tests__/editor-flow.test.tsx src/__tests__/app-shell.test.tsx`
Expected: PASS

- [ ] **Step 2: Run full frontend test suite**

Run: `npm test -- --runInBand`
Expected: PASS

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: PASS
