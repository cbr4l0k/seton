import type { Ref } from "react";
import type { KnownTextContext, TextContextRelationship } from "../lib/types";

import {
  CaptureContextEditor,
  type DraftCaptureContext,
} from "./CaptureContextEditor";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";

type CenterEditorPanelProps = {
  body: string;
  onBodyChange: (value: string) => void;
  contexts: DraftCaptureContext[];
  onContextsChange: (contexts: DraftCaptureContext[]) => void;
  knownTextContexts: KnownTextContext[];
  textContextRelationships: TextContextRelationship[];
  active: boolean;
  editorRef: Ref<MarkdownEditorHandle>;
};

export function CenterEditorPanel({
  body,
  onBodyChange,
  contexts,
  onContextsChange,
  knownTextContexts,
  textContextRelationships,
  active,
  editorRef,
}: CenterEditorPanelProps) {
  function handlePasteImage(label: string) {
    if (
      contexts.some(
        (context) =>
          context.kind === "image" &&
          (context.sourcePath ?? context.label).trim().toLowerCase() === label.trim().toLowerCase(),
      )
    ) {
      return;
    }

    onContextsChange([
      ...contexts,
      {
        id: crypto.randomUUID(),
        kind: "image",
        sourcePath: null,
        label,
      },
    ]);
  }

  return (
    <section
      aria-hidden={!active}
      className="panel panel-center"
      data-active={active}
      data-dimmed={!active}
    >
      <MarkdownEditor
        active={active}
        ariaLabel="Thought inbox editor"
        onChange={onBodyChange}
        onPasteImage={handlePasteImage}
        placeholder="I'm thinking about..."
        ref={editorRef}
        value={body}
      />

      <CaptureContextEditor
        active={active}
        contexts={contexts}
        knownTextContexts={knownTextContexts}
        onChange={onContextsChange}
        textContextRelationships={textContextRelationships}
      />
    </section>
  );
}
