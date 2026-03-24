# Context Suggestion Belt Design

**Date:** 2026-03-24

## Goal

Make text-context suggestions behave like a circular horizontal belt controlled by `ArrowLeft` and `ArrowRight`.

## Current State

The context input currently renders suggestions as a simple list in [`src/components/CaptureContextEditor.tsx`](/home/cbr4l0k/Documents/projects/seton/src/components/CaptureContextEditor.tsx). `ArrowUp` and `ArrowDown` move the active suggestion, `Enter` commits it, and the recent horizontal-navigation change makes `ArrowLeft` and `ArrowRight` leave the context input for workspace panels.

That does not match the intended interaction for suggestions.

## Product Behavior

When text suggestions are visible:

- `ArrowLeft` moves to the previous suggestion
- `ArrowRight` moves to the next suggestion
- the active suggestion wraps around, so moving past the last suggestion returns to the first and vice versa
- the active suggestion is visually centered in a horizontal suggestion rail
- neighboring suggestions remain visible on both sides when space allows
- if the list is longer than the available width, the rail scrolls so the active suggestion stays visible and centered as the user navigates
- `Enter` commits the active suggestion

When the ranked suggestion set changes because the user typed more text or the selected contexts changed:

- if the previously active suggestion is still present, it should remain active
- otherwise, the first suggestion in the refreshed ranking becomes active

When no suggestions are visible:

- `ArrowLeft` and `ArrowRight` should not trigger suggestion behavior
- the context input should no longer force horizontal panel navigation

`ArrowUp` and `ArrowDown` are no longer used for suggestion selection.

## Architecture

Keep the ranking logic unchanged and change only the interaction and presentation model around the ranked list.

- Keep one ranked linear list of suggestions in `CaptureContextEditor`
- Track the active suggestion by stable identity and derive the active index from the current ranked list
- Change keyboard handling so `ArrowLeft` and `ArrowRight` rotate the active index circularly
- Remove context-input-specific left/right panel navigation
- Render suggestions in a horizontal rail and scroll the active item into view when the active index changes

The rest of workspace spatial navigation should remain unchanged outside the context input.

## Testing

Add frontend tests covering:

- `ArrowRight` advances to the next suggestion
- `ArrowLeft` moves to the previous suggestion
- wrap-around from last to first and first to last
- `Enter` still commits the active suggestion
- left/right no longer leave the context input for workspace panels while suggestions are visible
