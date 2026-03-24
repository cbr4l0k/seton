import type { RefObject } from "react";
import type { KnownTextContext, TextContextRelationship } from "../lib/types";

import {
  CaptureContextEditor,
  type DraftCaptureContext,
} from "./CaptureContextEditor";

type CenterEditorPanelProps = {
  body: string;
  onBodyChange: (value: string) => void;
  contexts: DraftCaptureContext[];
  onContextsChange: (contexts: DraftCaptureContext[]) => void;
  knownTextContexts: KnownTextContext[];
  textContextRelationships: TextContextRelationship[];
  active: boolean;
  editorRef: RefObject<HTMLTextAreaElement>;
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
  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(event.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) {
      return;
    }

    event.preventDefault();
    const file = imageItem.getAsFile();
    const label = file?.name || "Pasted image";
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
      <textarea
        disabled={!active}
        ref={editorRef}
        autoFocus
        placeholder="I'm thinking about..."
        aria-label="Thought inbox editor"
        value={body}
        onChange={(event) => onBodyChange(event.target.value)}
        onPaste={handlePaste}
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
