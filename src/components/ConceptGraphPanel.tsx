import type { KnownTextContext, TextContextRelationship } from "../lib/types";

type ConceptGraphSelection = {
  noteIds: string[];
  textContextLabels: string[];
};

type ConceptGraphFilter =
  | { kind: "text_context"; label: string }
  | { kind: "relationship"; left: string; right: string };

type ConceptGraphPanelProps = {
  active: boolean;
  focusedItem: ConceptGraphFilter | null;
  knownTextContexts: KnownTextContext[];
  onFocusSelect: (filter: ConceptGraphFilter) => void;
  onFilterSelect: (filter: ConceptGraphFilter) => void;
  textContextRelationships: TextContextRelationship[];
  selection: ConceptGraphSelection;
};

export function ConceptGraphPanel({
  active,
  focusedItem,
  knownTextContexts,
  onFocusSelect,
  onFilterSelect,
  textContextRelationships,
  selection,
}: ConceptGraphPanelProps) {
  const relatedLabels = new Set(selection.textContextLabels.map(normalizeTextContextLabel));
  const selectedContextCount = selection.textContextLabels.length;

  return (
    <section aria-label="Concept Graph panel" className="panel panel-left concept-graph-panel" data-active={active}>
      <div className="concept-graph-panel__header">
        <p className="panel-subtle-title">Concept Graph</p>
        <p className="concept-graph-panel__status">
          {focusedItem ? `Focused: ${formatFocusLabel(focusedItem)}` : "No graph focus"}
        </p>
        <p className="concept-graph-panel__status">
          {selectedContextCount > 0 ? `${selectedContextCount} note-linked contexts` : "No note selection"}
        </p>
      </div>

      {active ? (
        <div aria-label="Concept graph details" className="concept-graph-panel__body" tabIndex={0}>
          <div className="concept-graph-panel__columns">
          <section aria-label="Concept graph nodes" className="concept-graph-panel__section">
            <p className="panel-subtle-title">Nodes</p>
            <div className="concept-graph-panel__list">
              {knownTextContexts.length > 0 ? (
                knownTextContexts.map((context) => {
                  const related = relatedLabels.has(normalizeTextContextLabel(context.label));
                  const focused =
                    focusedItem?.kind === "text_context" &&
                    normalizeTextContextLabel(focusedItem.label) === normalizeTextContextLabel(context.label);

                  return (
                    <div
                      key={context.normalizedLabel}
                      className="concept-node"
                      data-focused={focused}
                      data-related={related}
                    >
                      <div className="concept-graph-panel__actions">
                        <button
                          aria-label={`Filter notes by ${context.label}`}
                          className="concept-graph-panel__filter"
                          type="button"
                          onClick={() => onFilterSelect({ kind: "text_context", label: context.label })}
                        >
                          filter
                        </button>
                        <button
                          aria-label={`Focus ${context.label}`}
                          className="concept-graph-panel__action"
                          data-related={related}
                          data-testid="concept-node-label"
                          type="button"
                          onClick={() => onFocusSelect({ kind: "text_context", label: context.label })}
                        >
                          {context.label}
                        </button>
                      </div>
                      <span className="concept-node__count">{context.useCount}</span>
                    </div>
                  );
                })
              ) : (
                <p className="concept-graph-panel__empty">No context nodes yet.</p>
              )}
            </div>
          </section>

          <section aria-label="Concept graph edges" className="concept-graph-panel__section">
            <p className="panel-subtle-title">Edges</p>
            <div className="concept-graph-panel__list">
              {textContextRelationships.length > 0 ? (
                textContextRelationships.map((relationship) => {
                  const related = isRelatedRelationship(relationship.left, relationship.right, relatedLabels);
                  const focused =
                    focusedItem?.kind === "relationship" &&
                    normalizeTextContextLabel(focusedItem.left) === normalizeTextContextLabel(relationship.left) &&
                    normalizeTextContextLabel(focusedItem.right) === normalizeTextContextLabel(relationship.right);

                  return (
                    <div
                      key={`${relationship.left}-${relationship.right}`}
                      className="concept-edge"
                      data-focused={focused}
                      data-related={related}
                    >
                      <div className="concept-graph-panel__actions">
                        <button
                          aria-label={`Focus ${relationship.left} <> ${relationship.right}`}
                          className="concept-graph-panel__action"
                          data-related={related}
                          data-testid="concept-edge-label"
                          type="button"
                          onClick={() =>
                            onFocusSelect({
                              kind: "relationship",
                              left: relationship.left,
                              right: relationship.right,
                            })
                          }
                        >
                          {relationship.left} {"<>"} {relationship.right}
                        </button>
                        <button
                          aria-label={`Filter notes by ${relationship.left} and ${relationship.right}`}
                          className="concept-graph-panel__filter"
                          type="button"
                          onClick={() =>
                            onFilterSelect({
                              kind: "relationship",
                              left: relationship.left,
                              right: relationship.right,
                            })
                          }
                        >
                          filter
                        </button>
                      </div>
                      <span className="concept-edge__count">{relationship.useCount}</span>
                    </div>
                  );
                })
              ) : (
                <p className="concept-graph-panel__empty">No relationships yet.</p>
              )}
            </div>
          </section>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function normalizeTextContextLabel(value: string) {
  return value.trim().toLowerCase();
}

function isRelatedRelationship(left: string, right: string, relatedLabels: Set<string>) {
  return (
    relatedLabels.has(normalizeTextContextLabel(left)) &&
    relatedLabels.has(normalizeTextContextLabel(right))
  );
}

function formatFocusLabel(target: ConceptGraphFilter) {
  if (target.kind === "text_context") {
    return target.label;
  }

  return `${target.left} + ${target.right}`;
}
