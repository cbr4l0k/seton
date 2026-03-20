import { useState } from "react";

import { basename } from "../lib/path";
import { pickImageFile } from "../lib/tauri";

export type DraftCaptureContext =
  | { id: string; kind: "text"; value: string }
  | { id: string; kind: "url"; value: string }
  | { id: string; kind: "image"; sourcePath: string | null; label: string };

type CaptureContextEditorProps = {
  active: boolean;
  contexts: DraftCaptureContext[];
  onChange: (contexts: DraftCaptureContext[]) => void;
};

const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

export function CaptureContextEditor({ active, contexts, onChange }: CaptureContextEditorProps) {
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const value = draft.trim();
    if (!value) {
      return;
    }

    onChange(
      appendUniqueContext(contexts, {
        id: crypto.randomUUID(),
        kind: URL_PATTERN.test(value) ? "url" : "text",
        value,
      }),
    );
    setDraft("");
  }

  async function addImageContext() {
    const sourcePath = await pickImageFile();
    if (!sourcePath) {
      return;
    }

    onChange(
      appendUniqueContext(contexts, {
        id: crypto.randomUUID(),
        kind: "image",
        sourcePath,
        label: basename(sourcePath),
      }),
    );
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const items = Array.from(event.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) {
      return;
    }

    event.preventDefault();
    const file = imageItem.getAsFile();
    onChange(
      appendUniqueContext(contexts, {
        id: crypto.randomUUID(),
        kind: "image",
        sourcePath: null,
        label: file?.name || "Pasted image",
      }),
    );
  }

  function removeContext(id: string) {
    onChange(contexts.filter((context) => context.id !== id));
  }

  return (
    <section className="capture-contexts">
      <div className="capture-contexts__composer">
        <input
          aria-label="Context input"
          className="capture-contexts__input"
          disabled={!active}
          placeholder="context or url"
          value={draft}
          onBlur={commitDraft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraft();
            }
          }}
          onPaste={handlePaste}
        />

        <button
          aria-label="Add image"
          className="capture-contexts__image-button"
          disabled={!active}
          type="button"
          onClick={() => void addImageContext()}
        >
          image
        </button>
      </div>

      {contexts.length > 0 ? (
        <div className="capture-contexts__list">
          {contexts.map((context) => (
            <button
              key={context.id}
              className={`context-chip context-chip--${context.kind}`}
              disabled={!active}
              type="button"
              onClick={() => removeContext(context.id)}
            >
              {"value" in context ? context.value : context.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function appendUniqueContext(
  contexts: DraftCaptureContext[],
  candidate: DraftCaptureContext,
) {
  const key = contextKey(candidate);
  if (contexts.some((context) => contextKey(context) === key)) {
    return contexts;
  }

  return [...contexts, candidate];
}

function contextKey(context: DraftCaptureContext) {
  if (context.kind === "image") {
    return `image:${(context.sourcePath ?? context.label).trim().toLowerCase()}`;
  }

  return `${context.kind}:${context.value.trim().toLowerCase()}`;
}
