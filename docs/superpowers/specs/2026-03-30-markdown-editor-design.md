# Markdown Editor Design

## Goal

Replace the center `textarea` with an industry-tested Markdown editor that preserves expected desktop editing behavior first, while adding a path for fenced code highlighting and LaTeX-style math rendering.

## Current State

- The center editing surface is a native `textarea` in `src/components/CenterEditorPanel.tsx`.
- Draft body state, save/open behavior, and focus management are coordinated from `src/App.tsx`.
- The current UI styling already establishes the desired visual language for the center panel.
- The immediate user-visible regression is that desktop undo/redo shortcuts are not working reliably.

## Constraints

- Native-feeling desktop behavior is the highest priority.
- The app should use an existing editor rather than inventing a custom one.
- The current visual design should be preserved.
- Markdown authoring should stay source-first rather than moving to a fully custom rich-text editing model.

## Proposed Design

### Editor choice

- Adopt CodeMirror 6 for the center editor.
- Wrap CodeMirror in a focused React component that preserves the current `body`, `onBodyChange`, `active`, and focus-oriented integration points already used by `App`.
- Keep the editor model plain-text-first so keyboard shortcuts, selection behavior, clipboard behavior, and IME handling stay close to normal desktop expectations.

### Delivery order

#### Phase 1: Shortcut reliability

- Add frontend tests covering desktop save and editing shortcut behavior.
- Fix any app-level keyboard handling that interferes with native editing commands such as:
  - `Ctrl+Z`
  - `Ctrl+Shift+Z`
  - `Cmd+Z`
  - standard clipboard shortcuts
- Land this behavior before the editor migration so the regression is covered independently of CodeMirror adoption.

#### Phase 2: CodeMirror migration

- Replace the center `textarea` with a `CodeMirrorEditor` wrapper component.
- Keep save/open/reset flows unchanged from the perspective of `App`.
- Preserve focus behavior when the center panel becomes active.
- Preserve the current center panel styling by applying the existing typography, spacing, sizing, and panel chrome to the CodeMirror host.

#### Phase 3: Markdown rendering features

- Add Markdown language support in the editor.
- Support syntax-highlighted fenced code blocks through the editor or preview rendering pipeline.
- Support LaTeX-style math rendering through the Markdown rendering pipeline.
- Prefer rendering-heavy features in preview/output paths rather than inventing custom live rich-text behavior inside the editor surface.

## Architecture

### Frontend integration

- `src/components/CenterEditorPanel.tsx` will stop rendering the native `textarea` directly.
- A new editor wrapper component will own the CodeMirror instance lifecycle and synchronize document changes back to React state.
- `src/App.tsx` will continue to own the draft body and save/open orchestration, with only small adjustments for editor focus and key handling.

### Keyboard behavior

- Global key handlers must ignore standard editing shortcuts when focus is inside an editable control.
- Save shortcuts should continue to work, but only without breaking native undo/redo and clipboard behavior.
- Platform-standard CodeMirror history/keymaps should be used instead of custom undo/redo logic.

### Styling

- Reuse the current center panel CSS so the editor blends into the existing application shell.
- Avoid introducing a new editor theme that conflicts with the current app aesthetic.

## Testing

- Frontend tests for shortcut handling around the editor, especially save vs. native editing behavior.
- Frontend tests for draft editing and editor migration regression coverage.
- Targeted integration coverage that the center editor still updates `body` state and participates in the existing save flow.

## Out of Scope

- Building a custom editor.
- Switching to a WYSIWYG or block-based document editor.
- Redesigning the workspace layout or visual language.
