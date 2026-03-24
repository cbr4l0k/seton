# Context Horizontal Navigation Design

**Date:** 2026-03-24

## Goal

Make the context input participate in workspace navigation so `ArrowLeft` always moves to the left panel and `ArrowRight` always moves to the right panel while that input is focused.

## Current State

Global spatial navigation ignores all arrow-panel movement when focus is inside editable elements in [`src/hooks/useSpatialNavigation.ts`](/home/cbr4l0k/Documents/projects/seton/src/hooks/useSpatialNavigation.ts). The context input in [`src/components/CaptureContextEditor.tsx`](/home/cbr4l0k/Documents/projects/seton/src/components/CaptureContextEditor.tsx) currently consumes `ArrowUp` and `ArrowDown` for suggestion selection, but `ArrowLeft` and `ArrowRight` remain normal text-cursor keys and cannot move the workspace.

## Product Behavior

When the context input is focused:

- `ArrowLeft` always moves workspace focus to the left panel
- `ArrowRight` always moves workspace focus to the right panel
- `ArrowUp` and `ArrowDown` continue to manage suggestion selection when suggestions are visible
- `Enter` behavior remains unchanged

This rule applies only to the context input. The main note textarea should keep its normal text-editing behavior.

## Architecture

Keep the change local to the context editor rather than broadening the global navigation hook.

- Pass workspace position control from [`src/App.tsx`](/home/cbr4l0k/Documents/projects/seton/src/App.tsx) through [`src/components/CenterEditorPanel.tsx`](/home/cbr4l0k/Documents/projects/seton/src/components/CenterEditorPanel.tsx) into [`src/components/CaptureContextEditor.tsx`](/home/cbr4l0k/Documents/projects/seton/src/components/CaptureContextEditor.tsx)
- Intercept `ArrowLeft` and `ArrowRight` in the context input key handler
- Prevent default text-cursor movement for those two keys and call the spatial navigation setter directly

## Testing

Add frontend tests covering:

- `ArrowLeft` from the context input activates the left panel
- `ArrowRight` from the context input activates the right panel
- existing suggestion navigation with `ArrowUp` and `ArrowDown` still works
- the note body textarea still does not navigate panels on arrow keys
