# Cross-View Selection Rules Design

**Date:** 2026-04-08

## Goal

Document the current interaction rules for issue `#23` so note selection, graph focus, graph filtering, and cleared state have one explicit contract before the left panel is replaced by the real graph library integration.

## Current State

The shared cross-view state now lives in [src/App.tsx](/home/cbr4l0k/Documents/projects/seton/src/App.tsx), but the behavior has been introduced incrementally across multiple steps:

- note checkbox selection drives related-node highlighting in the left panel
- graph focus and graph filtering are separate concepts
- graph filtering can fetch notes outside the recent-history bootstrap payload
- the notes panel now shows loading and empty states for graph-driven filtering

The missing piece is an explicit description of how these states are supposed to interact.

## Shared State Model

`App` owns three distinct cross-view concepts:

1. `crossViewSelection`
   This represents explicit note selection. It is the source of truth for:
   - checked note rows in the bottom panel
   - export targeting
   - note-linked highlight state in the left panel

2. `graphFocus`
   This represents the currently focused graph node or edge. It is presentation state for the left panel and does not, by itself, select notes or change export targets.

3. `graphFilter`
   This represents an explicit request to show only notes that match a graph node or edge. It controls note retrieval and note-list visibility, but it does not change note checkbox selection.

These three states must remain separate even when they refer to the same logical text contexts.

## Interaction Rules

### Selecting Notes

Selecting or unselecting notes in the bottom panel:

- updates `crossViewSelection.noteIds`
- recomputes related text-context labels for left-panel highlighting
- does not create or clear `graphFocus`
- does not create or clear `graphFilter`

This preserves the rule that note selection is a note-owned action.

### Focusing Graph Items

Clicking a node or edge label in the left panel:

- updates `graphFocus`
- does not modify `crossViewSelection`
- does not modify export targeting
- does not change which notes are visible

This preserves the rule that graph click means focus, not selection.

### Filtering From Graph Items

Using the explicit `filter` control on a node or edge:

- updates `graphFilter`
- triggers note retrieval for the selected text context or relationship
- can replace the visible note list with matching notes
- does not automatically check those notes
- does not modify `crossViewSelection`

This preserves the rule that filtering is explicit and separate from note targeting.

### Clearing State

Clearing graph filter:

- removes `graphFilter`
- clears graph-filter loading/result state
- restores the default recent/search-driven note list
- preserves note checkbox selection
- preserves `graphFocus`

Clearing note selection through note checkboxes:

- updates `crossViewSelection`
- removes related highlight state in the left panel when no selected note remains
- does not clear `graphFocus`
- does not clear `graphFilter`

## Export Contract

Export continues to use only `crossViewSelection.noteIds`.

Graph focus alone never changes export targeting. Graph filtering alone never changes export targeting. If the product later wants graph-driven export targeting, that should be added as a separate explicit action rather than overloaded onto graph click or graph filter.

## Why This Split Matters

This rule set avoids the earlier UX failure mode where clicking a graph item silently behaved like note selection. It also keeps the future Cytoscape migration cleaner because the graph library only needs to emit:

- focus events
- explicit filter events

The graph component does not need to own note selection semantics.

## Remaining Work For Issue #23

This design documents the current contract, but it does not complete the issue by itself. Remaining work still includes:

- deciding whether left-view interactions should gain an explicit export-targeting action
- revalidating these rules once the real graph library is integrated
- replacing the temporary DOM-based left panel with the chosen graph library implementation
