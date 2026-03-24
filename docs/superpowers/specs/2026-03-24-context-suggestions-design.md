# Context Suggestions Design

**Date:** 2026-03-24

## Goal

Add reusable text-context suggestions to note entry so users are nudged toward existing labels instead of creating near-duplicates. Suggestions should respond both to the text currently being typed and to the text context labels already selected on the draft note.

## Scope

This design applies only to text capture contexts. URL and image contexts keep their current behavior.

## Current State

The context composer in [`src/components/CaptureContextEditor.tsx`](/home/cbr4l0k/Documents/projects/seton/src/components/CaptureContextEditor.tsx) accepts free-form text, URL, and image inputs and commits them directly into the current draft. The frontend currently has no catalog of previously used text contexts, and the workspace bootstrap payload in [`src-tauri/src/commands/workspace.rs`](/home/cbr4l0k/Documents/projects/seton/src-tauri/src/commands/workspace.rs) only returns note history and placeholder panels.

As a result, users can create slightly different versions of the same label without any reuse prompts.

## Product Behavior

When the user types into the context input, the app should show text-context suggestions sourced from previously saved text contexts.

Suggestions should:

- appear only while the draft looks like a text label, not a URL
- exclude labels already selected on the current draft
- rank labels that closely match the current draft above weaker matches
- boost labels that have historically appeared together with the currently selected text labels
- allow the user to click or keyboard-commit a suggestion to add it as a normal text context chip

The feature should help the user stay consistent without forcing them into a fixed taxonomy. If no strong suggestion exists, the user can still save a new label exactly as typed.

## Data Model

The backend should extend the workspace bootstrap payload with a lightweight text-context suggestion catalog. A new collection should be added to the payload, for example `knownTextContexts`, containing deduplicated text labels plus simple usage metadata.

Each catalog item should include:

- the canonical text label as previously saved
- a normalized form used for matching and deduplication
- a usage count

The catalog should be built from saved text capture contexts only. URL and image contexts are excluded.

The backend should also derive co-occurrence information from notes so the frontend can boost labels that commonly appear with already selected text labels. This can be represented as a map keyed by normalized label pair, or as per-label related-label counts, depending on which is simpler to serialize and consume.

## Ranking

Suggestion ranking should be deterministic and local.

The frontend should score candidates using these signals:

1. Exact normalized match with the current draft
2. Prefix match
3. Substring match
4. Fuzzy character-order match for labels that are close but not contiguous
5. Co-occurrence boost when the candidate has appeared on saved notes alongside already selected text labels
6. Usage-count tie-breaker for equally relevant labels

The current draft remains the primary signal. Selected-label relationships should improve the ordering, not override obviously better textual matches.

## UI

The context composer should render a compact suggestion list directly beneath the input. It should visually align with the existing chip language instead of introducing a new heavy panel.

Expected interaction:

- typing updates suggestions live
- the top suggestion becomes active by default whenever the suggestion list opens or changes
- `ArrowDown` and `ArrowUp` move the active suggestion through the visible list
- pressing `Enter` with an active suggestion commits that suggestion
- pressing `Enter` without an active suggestion keeps the current behavior and commits the typed draft
- clicking a suggestion commits it immediately
- after commit, the input clears and suggestions close

Suggestions should disappear when:

- the input is empty
- the input is recognized as a URL
- there are no matching text suggestions
- the editor is inactive

## Architecture

### Backend

Add a repository query that loads text capture contexts across saved notes and produces:

- deduplicated text labels with counts
- text-label co-occurrence counts based on labels saved together on the same note

Expose that data through `bootstrap_workspace`.

This keeps persistence and normalization logic close to the database and avoids reconstructing global suggestion state from partial frontend data.

### Frontend

Store the returned suggestion catalog in app state after workspace bootstrap. Pass it into the center editor and context editor.

After `save_note` completes successfully, refresh the in-memory suggestion catalog so any newly created text label can be recommended immediately in the next draft without requiring an app restart.

The context editor should own:

- draft-input state
- candidate filtering and scoring
- suggestion-list visibility
- keyboard selection state

The editor should continue to own uniqueness checks for draft contexts so selecting a suggestion cannot create duplicate chips on the current note.

## Testing

The implementation should follow TDD.

Frontend tests should cover:

- showing fuzzy suggestions for previously used text labels
- excluding already selected labels
- boosting recommendations when selected labels imply a related label
- preserving existing URL behavior
- committing a suggestion by click and by keyboard

Backend tests should cover:

- returning deduplicated text-context labels from bootstrap data
- excluding URL and image contexts from the text suggestion catalog
- producing co-occurrence data from notes with multiple text labels

## Non-Goals

- renaming or merging existing saved labels
- suggesting URLs
- changing how image contexts are attached
- introducing server-side search endpoints for each keystroke
