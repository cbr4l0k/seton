import { useEffect, useState } from "react";

import type { KnownTextContext, TextContextRelationship } from "../lib/types";
import { basename } from "../lib/path";
import { pickImageFile } from "../lib/tauri";

export type DraftCaptureContext =
  | { id: string; kind: "text"; value: string }
  | { id: string; kind: "url"; value: string }
  | { id: string; kind: "image"; sourcePath: string | null; label: string };

type CaptureContextEditorProps = {
  active: boolean;
  contexts: DraftCaptureContext[];
  knownTextContexts: KnownTextContext[];
  onChange: (contexts: DraftCaptureContext[]) => void;
  textContextRelationships: TextContextRelationship[];
};

const URL_PATTERN = /^https?:\/\/[^\s]+$/i;
const MAX_SUGGESTIONS = 5;

export function CaptureContextEditor({
  active,
  contexts,
  knownTextContexts,
  onChange,
  textContextRelationships,
}: CaptureContextEditorProps) {
  const [draft, setDraft] = useState("");
  const [activeSuggestionLabel, setActiveSuggestionLabel] = useState<string | null>(null);

  const suggestions = active
    ? rankTextContextSuggestions({
        draft,
        knownTextContexts,
        selectedTextContexts: contexts
          .filter((context): context is Extract<DraftCaptureContext, { kind: "text" }> => context.kind === "text")
          .map((context) => context.value),
        textContextRelationships,
      }).slice(0, MAX_SUGGESTIONS)
    : [];
  const activeSuggestionIndex = suggestions.findIndex(
    (suggestion) => suggestion.normalizedLabel === activeSuggestionLabel,
  );
  const resolvedActiveSuggestionIndex = activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0;
  const activeSuggestion = suggestions[resolvedActiveSuggestionIndex];
  const renderedSuggestions = arrangeSuggestionsFromActive(suggestions, resolvedActiveSuggestionIndex);

  useEffect(() => {
    if (suggestions.length === 0) {
      setActiveSuggestionLabel(null);
      return;
    }

    if (
      activeSuggestionLabel &&
      suggestions.some((suggestion) => suggestion.normalizedLabel === activeSuggestionLabel)
    ) {
      return;
    }

    setActiveSuggestionLabel(suggestions[0].normalizedLabel);
  }, [activeSuggestionLabel, suggestions]);

  function commitDraft() {
    commitTextOrUrlContext(draft);
  }

  function commitTextOrUrlContext(rawValue: string) {
    const value = rawValue.trim();
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
    setActiveSuggestionLabel(null);
  }

  function commitSuggestion(label: string) {
    commitTextOrUrlContext(label);
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
            if (event.key === "ArrowLeft" && suggestions.length > 0) {
              event.preventDefault();
              const nextIndex =
                (resolvedActiveSuggestionIndex - 1 + suggestions.length) % suggestions.length;
              setActiveSuggestionLabel(suggestions[nextIndex].normalizedLabel);
              return;
            }

            if (event.key === "ArrowRight" && suggestions.length > 0) {
              event.preventDefault();
              const nextIndex = (resolvedActiveSuggestionIndex + 1) % suggestions.length;
              setActiveSuggestionLabel(suggestions[nextIndex].normalizedLabel);
              return;
            }

            if (event.key === "Enter") {
              event.preventDefault();
              if (activeSuggestion) {
                commitSuggestion(activeSuggestion.label);
                return;
              }

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

      {suggestions.length > 0 ? (
        <div aria-label="Context suggestions" className="capture-contexts__suggestions">
          {renderedSuggestions.map((suggestion) => (
            <button
              key={suggestion.normalizedLabel}
              aria-label={`Suggest ${suggestion.label}`}
              className="capture-contexts__suggestion"
              data-active={suggestion.normalizedLabel === activeSuggestion?.normalizedLabel}
              data-suggestion-label={suggestion.normalizedLabel}
              type="button"
              onClick={() => commitSuggestion(suggestion.label)}
              onMouseDown={(event) => event.preventDefault()}
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      ) : null}

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

function arrangeSuggestionsFromActive(
  suggestions: KnownTextContext[],
  activeIndex: number,
) {
  if (suggestions.length <= 1) {
    return suggestions;
  }

  return Array.from({ length: suggestions.length }, (_, offset) => {
    return suggestions[(activeIndex + offset) % suggestions.length];
  });
}

function rankTextContextSuggestions({
  draft,
  knownTextContexts,
  selectedTextContexts,
  textContextRelationships,
}: {
  draft: string;
  knownTextContexts: KnownTextContext[];
  selectedTextContexts: string[];
  textContextRelationships: TextContextRelationship[];
}) {
  const trimmedDraft = draft.trim();
  if (!trimmedDraft || URL_PATTERN.test(trimmedDraft)) {
    return [];
  }

  const normalizedDraft = trimmedDraft.toLowerCase();
  const selectedLabels = new Set(selectedTextContexts.map((value) => value.trim().toLowerCase()));
  const relationshipBoosts = buildRelationshipBoosts(textContextRelationships, selectedLabels);

  return knownTextContexts
    .filter((context) => !selectedLabels.has(context.normalizedLabel))
    .map((context) => {
      const baseScore = matchScore(normalizedDraft, context.normalizedLabel);
      return {
        ...context,
        score: baseScore + (relationshipBoosts.get(context.normalizedLabel) ?? 0),
        baseScore,
      };
    })
    .filter((context) => context.baseScore > 0)
    .sort((left, right) => {
      return (
        right.score - left.score ||
        right.useCount - left.useCount ||
        left.normalizedLabel.localeCompare(right.normalizedLabel)
      );
    })
    .map(({ baseScore: _baseScore, ...context }) => context);
}

function buildRelationshipBoosts(
  textContextRelationships: TextContextRelationship[],
  selectedLabels: Set<string>,
) {
  const boosts = new Map<string, number>();

  for (const relationship of textContextRelationships) {
    const left = relationship.left.trim().toLowerCase();
    const right = relationship.right.trim().toLowerCase();

    if (selectedLabels.has(left) && !selectedLabels.has(right)) {
      boosts.set(right, (boosts.get(right) ?? 0) + relationship.useCount * 10);
    }

    if (selectedLabels.has(right) && !selectedLabels.has(left)) {
      boosts.set(left, (boosts.get(left) ?? 0) + relationship.useCount * 10);
    }
  }

  return boosts;
}

function matchScore(draft: string, candidate: string) {
  if (candidate === draft) {
    return 1000;
  }

  if (candidate.startsWith(draft)) {
    return 700;
  }

  if (candidate.includes(draft)) {
    return 500;
  }

  if (isSubsequenceMatch(draft, candidate)) {
    return 300;
  }

  return 0;
}

function isSubsequenceMatch(query: string, candidate: string) {
  let queryIndex = 0;

  for (const char of candidate) {
    if (char === query[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === query.length) {
        return true;
      }
    }
  }

  return false;
}
