import cytoscape, { type ElementDefinition, type StylesheetJson } from "cytoscape";
import { useEffect, useMemo, useRef, useState } from "react";

import type { KnownTextContext, TextContextRelationship } from "../lib/types";

type ConceptGraphSelection = {
  noteIds: string[];
  textContextLabels: string[];
};

type ConceptGraphFilter =
  | { kind: "text_context"; label: string }
  | { kind: "relationship"; left: string; right: string };

type GraphVisualState = {
  focusedItem: ConceptGraphFilter | null;
  relatedLabels: Set<string>;
};

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onFocusSelectRef = useRef(onFocusSelect);
  const [hoveredNode, setHoveredNode] = useState<{ label: string; x: number; y: number } | null>(null);
  const relatedLabels = useMemo(
    () => new Set(selection.textContextLabels.map(normalizeTextContextLabel)),
    [selection.textContextLabels],
  );
  const selectedContextCount = selection.textContextLabels.length;
  const graphElements = useMemo(
    () => buildGraphElements(knownTextContexts, textContextRelationships),
    [knownTextContexts, textContextRelationships],
  );
  const graphStructureKey = useMemo(
    () =>
      JSON.stringify({
        contexts: knownTextContexts.map((context) => context.normalizedLabel),
        relationships: textContextRelationships.map((relationship) => [
          normalizeTextContextLabel(relationship.left),
          normalizeTextContextLabel(relationship.right),
        ]),
      }),
    [knownTextContexts, textContextRelationships],
  );

  useEffect(() => {
    onFocusSelectRef.current = onFocusSelect;
  }, [onFocusSelect]);

  useEffect(() => {
    if (!active || !containerRef.current) {
      return;
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements: graphElements,
      layout: graphLayoutConfig,
      style: graphStylesheet,
      userPanningEnabled: true,
      userZoomingEnabled: true,
      minZoom: 0.08,
      maxZoom: 2.4,
      wheelSensitivity: 0.24,
    });
    cyRef.current = cy;

    cy.on("tap", "node", (event) => {
      const label = event.target.data("label");
      if (typeof label === "string") {
        onFocusSelectRef.current({ kind: "text_context", label });
      }
    });

    cy.on("tap", "edge", (event) => {
      const left = event.target.data("left");
      const right = event.target.data("right");

      if (typeof left === "string" && typeof right === "string") {
        onFocusSelectRef.current({ kind: "relationship", left, right });
      }
    });

    cy.on("mouseover", "node", (event) => {
      event.target.addClass?.("is-hovered");
      const label = event.target.data("hoverTitle");
      const position = event.target.renderedPosition?.();

      if (typeof label === "string" && position) {
        setHoveredNode({
          label,
          x: position.x,
          y: position.y,
        });
      }
    });
    cy.on("mouseout", "node", (event) => {
      event.target.removeClass?.("is-hovered");
      setHoveredNode(null);
    });
    cy.on("mouseover", "edge", (event) => {
      event.target.addClass?.("is-hovered");
    });
    cy.on("mouseout", "edge", (event) => {
      event.target.removeClass?.("is-hovered");
    });
    cy.on("pan zoom", () => {
      setHoveredNode(null);
    });

    return () => {
      cyRef.current = null;
      setHoveredNode(null);
      cy.destroy();
    };
  }, [active, graphElements]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!active || !cy) {
      return;
    }

    cy.elements().remove();
    cy.add(graphElements);
    cy.layout(graphLayoutConfig).run();
    cy.resize();
    cy.fit(undefined, graphLayoutConfig.padding);
  }, [active, graphElements, graphStructureKey]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!active || !cy) {
      return;
    }

    cy.elements().removeClass("is-related is-focused");

    for (const element of cy.elements()) {
      const kind = element.data("kind");

      if (kind === "text_context") {
        const label = normalizeTextContextLabel(String(element.data("label") ?? ""));
        if (relatedLabels.has(label)) {
          element.addClass("is-related");
        }

        const focused =
          focusedItem?.kind === "text_context" &&
          normalizeTextContextLabel(focusedItem.label) === label;
        if (focused) {
          element.addClass("is-focused");
        }
      }

      if (kind === "relationship") {
        const left = normalizeTextContextLabel(String(element.data("left") ?? ""));
        const right = normalizeTextContextLabel(String(element.data("right") ?? ""));
        if (relatedLabels.has(left) && relatedLabels.has(right)) {
          element.addClass("is-related");
        }

        const focused =
          focusedItem?.kind === "relationship" &&
          normalizeTextContextLabel(focusedItem.left) === left &&
          normalizeTextContextLabel(focusedItem.right) === right;
        if (focused) {
          element.addClass("is-focused");
        }
      }
    }
  }, [active, focusedItem, relatedLabels]);

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
          <div className="concept-graph-panel__toolbar">
            <button
              aria-label="Filter notes by focused graph item"
              className="concept-graph-panel__filter"
              disabled={!focusedItem}
              type="button"
              onClick={() => {
                if (focusedItem) {
                  onFilterSelect(focusedItem);
                }
              }}
            >
              filter focused item
            </button>
          </div>
          <div
            className="concept-graph-panel__canvas-shell"
          >
            <div
              ref={containerRef}
              aria-hidden={graphElements.length === 0}
              className="concept-graph-panel__canvas"
              data-testid="concept-graph-canvas"
            />
            {hoveredNode ? (
              <div
                className="concept-graph-panel__tooltip"
                role="tooltip"
                style={{
                  left: `${hoveredNode.x}px`,
                  top: `${hoveredNode.y}px`,
                }}
              >
                {hoveredNode.label}
              </div>
            ) : null}
          </div>
          {graphElements.length === 0 ? (
            <p className="concept-graph-panel__empty">No graph data yet.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function buildGraphElements(
  knownTextContexts: KnownTextContext[],
  textContextRelationships: TextContextRelationship[],
  visualState?: GraphVisualState,
): ElementDefinition[] {
  const degreeByLabel = buildRelationshipDegreeMap(textContextRelationships);

  return [
    ...knownTextContexts.map((context) => {
      const normalizedLabel = normalizeTextContextLabel(context.label);
      return {
        data: {
          id: `text_context:${context.normalizedLabel}`,
          degree: degreeByLabel.get(normalizedLabel) ?? 0,
          hoverTitle: context.label,
          kind: "text_context",
          label: context.label,
          useCount: context.useCount,
        },
        classes: buildGraphClasses({
          focused:
            visualState?.focusedItem?.kind === "text_context" &&
            normalizeTextContextLabel(visualState.focusedItem.label) ===
              normalizeTextContextLabel(context.label),
          related: visualState?.relatedLabels.has(normalizeTextContextLabel(context.label)) ?? false,
        }),
      } satisfies ElementDefinition;
    }),
    ...textContextRelationships.map((relationship) => {
      const left = normalizeTextContextLabel(relationship.left);
      const right = normalizeTextContextLabel(relationship.right);

      return {
        data: {
          id: `relationship:${left}::${right}`,
          kind: "relationship",
          label: `${relationship.left} <> ${relationship.right}`,
          left: relationship.left,
          right: relationship.right,
          source: `text_context:${left}`,
          target: `text_context:${right}`,
          useCount: relationship.useCount,
        },
        classes: buildGraphClasses({
          focused:
            visualState?.focusedItem?.kind === "relationship" &&
            normalizeTextContextLabel(visualState.focusedItem.left) === left &&
            normalizeTextContextLabel(visualState.focusedItem.right) === right,
          related:
            (visualState?.relatedLabels.has(left) ?? false) &&
            (visualState?.relatedLabels.has(right) ?? false),
        }),
      } satisfies ElementDefinition;
    }),
  ];
}

function buildRelationshipDegreeMap(textContextRelationships: TextContextRelationship[]) {
  const degreeByLabel = new Map<string, number>();

  for (const relationship of textContextRelationships) {
    const left = normalizeTextContextLabel(relationship.left);
    const right = normalizeTextContextLabel(relationship.right);

    degreeByLabel.set(left, (degreeByLabel.get(left) ?? 0) + 1);
    degreeByLabel.set(right, (degreeByLabel.get(right) ?? 0) + 1);
  }

  return degreeByLabel;
}

function buildGraphClasses({ related, focused }: { related: boolean; focused: boolean }) {
  return [related ? "is-related" : "", focused ? "is-focused" : ""].filter(Boolean).join(" ");
}

function normalizeTextContextLabel(value: string) {
  return value.trim().toLowerCase();
}

function formatFocusLabel(target: ConceptGraphFilter) {
  if (target.kind === "text_context") {
    return target.label;
  }

  return `${target.left} + ${target.right}`;
}

const graphStylesheet: StylesheetJson = [
  {
    selector: "node",
    style: {
      "background-color": "#d6d2c4",
      "border-color": "#7b7468",
      "border-width": "1",
      height: "mapData(degree, 0, 6, 22, 76)",
      label: "",
      shape: "ellipse",
      width: "mapData(degree, 0, 6, 22, 76)",
    },
  },
  {
    selector: "edge",
    style: {
      "curve-style": "haystack",
      "font-family": "Departure Mono, monospace",
      "font-size": "9",
      "line-color": "#b7b0a1",
      width: "2",
    },
  },
  {
    selector: ".is-related",
    style: {
      "background-color": "#a7d8bc",
      "border-color": "#238b63",
      color: "#16171a",
      "line-color": "#238b63",
      "target-arrow-color": "#238b63",
    },
  },
  {
    selector: ".is-focused",
    style: {
      "background-color": "#f4efe3",
      "border-color": "#16171a",
      "border-width": "2",
      color: "#16171a",
      "line-color": "#16171a",
      "target-arrow-color": "#16171a",
    },
  },
  {
    selector: "edge.is-focused",
    style: {
      width: "3",
    },
  },
  {
    selector: ".is-hovered",
    style: {
      "background-color": "#efe7d5",
      "line-color": "#5a5248",
      "target-arrow-color": "#5a5248",
    },
  },
];

const graphLayoutConfig = {
  animate: false,
  componentSpacing: 120,
  fit: true,
  gravity: 0.18,
  idealEdgeLength: 180,
  name: "cose" as const,
  nodeOverlap: 64,
  nodeRepulsion: 180000,
  numIter: 1600,
  padding: 32,
};
