import type { KnownTextContext, TextContextRelationship } from "../lib/types";

type ConceptGraphSelection = {
  noteIds: string[];
  textContextLabels: string[];
};

type ConceptGraphPanelProps = {
  active: boolean;
  knownTextContexts: KnownTextContext[];
  textContextRelationships: TextContextRelationship[];
  selection: ConceptGraphSelection;
};

export function ConceptGraphPanel({
  active,
  knownTextContexts,
  textContextRelationships,
  selection,
}: ConceptGraphPanelProps) {
  const relatedLabels = new Set(selection.textContextLabels.map(normalizeTextContextLabel));
  const selectedContextCount = selection.textContextLabels.length;
  const orderedTextContexts = [...knownTextContexts].sort((left, right) =>
    compareRelatedFirst(
      relatedLabels.has(normalizeTextContextLabel(left.label)),
      relatedLabels.has(normalizeTextContextLabel(right.label)),
    ),
  );
  const orderedRelationships = [...textContextRelationships].sort((left, right) =>
    compareRelatedFirst(
      isRelatedRelationship(left.left, left.right, relatedLabels),
      isRelatedRelationship(right.left, right.right, relatedLabels),
    ),
  );

  return (
    <section aria-label="Concept Graph panel" className="panel panel-left concept-graph-panel" data-active={active}>
      <div className="concept-graph-panel__header">
        <p className="panel-subtle-title">Concept Graph</p>
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
              {orderedTextContexts.length > 0 ? (
                orderedTextContexts.map((context) => {
                  const related = relatedLabels.has(normalizeTextContextLabel(context.label));

                  return (
                    <div
                      key={context.normalizedLabel}
                      className="concept-node"
                      data-related={related}
                    >
                      <span data-related={related} data-testid="concept-node-label">{context.label}</span>
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
              {orderedRelationships.length > 0 ? (
                orderedRelationships.map((relationship) => {
                  const related = isRelatedRelationship(relationship.left, relationship.right, relatedLabels);

                  return (
                    <div
                      key={`${relationship.left}-${relationship.right}`}
                      className="concept-edge"
                      data-related={related}
                    >
                      <span data-related={related} data-testid="concept-edge-label">
                        {relationship.left} {"<>"} {relationship.right}
                      </span>
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

function compareRelatedFirst(leftRelated: boolean, rightRelated: boolean) {
  if (leftRelated === rightRelated) {
    return 0;
  }

  return leftRelated ? -1 : 1;
}
