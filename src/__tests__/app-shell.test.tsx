import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import App from "../App";
import departureMonoFontUrl from "../assets/fonts/DepartureMono-Regular.woff2?url";
import { bootstrapWorkspace, filterNotesByTextContexts, searchNotes } from "../lib/tauri";

type MarkdownEditorTestApi = {
  focus: () => void;
};

const cytoscapeMock = vi.hoisted(() => {
  type Handler = (event: {
    target: {
      addClass?: (name: string) => void;
      data: (key?: string) => unknown;
      removeClass?: (name: string) => void;
      renderedPosition?: () => { x: number; y: number };
    };
  }) => void;
  const instances: Array<{
    handlers: Map<string, Handler>;
    elements: Array<{
      classes: Set<string>;
      data: Record<string, unknown>;
    }>;
    instance: Record<string, unknown>;
    options: Record<string, unknown>;
  }> = [];

  const factory = vi.fn((options: Record<string, unknown>) => {
    const handlers = new Map<string, Handler>();
    const currentElements = ((options.elements as Array<{ classes?: string; data: Record<string, unknown> }>) ?? []).map(
      (element) => ({
        classes: new Set((element.classes ?? "").split(" ").filter(Boolean)),
        data: element.data,
      }),
    );
    function createCollection() {
      const elementApis = currentElements.map((element) => ({
        addClass(name: string) {
          for (const className of name.split(" ")) {
            if (className) {
              element.classes.add(className);
            }
          }
        },
        data(requestedKey?: string) {
          return requestedKey ? element.data[requestedKey] : element.data;
        },
        removeClass(name: string) {
          for (const className of name.split(" ")) {
            if (className) {
              element.classes.delete(className);
            }
          }
        },
      }));

      return {
        [Symbol.iterator]: function* iterator() {
          yield* elementApis;
        },
        remove() {
          currentElements.length = 0;
          return this;
        },
        removeClass(name: string) {
          for (const elementApi of elementApis) {
            elementApi.removeClass(name);
          }
          return this;
        },
      };
    }
    const instance = {
      add: vi.fn((elements: Array<{ classes?: string; data: Record<string, unknown> }>) => {
        currentElements.push(
          ...elements.map((element) => ({
            classes: new Set((element.classes ?? "").split(" ").filter(Boolean)),
            data: element.data,
          })),
        );
      }),
      destroy: vi.fn(),
      elements: vi.fn(() => createCollection()),
      fit: vi.fn(),
      layout: vi.fn(() => ({ run: vi.fn() })),
      off: vi.fn(),
      on: vi.fn((eventName: string, selector: string | Handler, handler?: Handler) => {
        if (typeof selector === "string" && handler) {
          handlers.set(`${eventName}:${selector}`, handler);
          return instance;
        }

        if (typeof selector === "function") {
          handlers.set(eventName, selector);
        }

        return instance;
      }),
      resize: vi.fn(),
    };

    instances.push({ elements: currentElements, handlers, instance, options });
    return instance;
  });

  return {
    emitLast(key: string, data: Record<string, unknown>, renderedPosition?: { x: number; y: number }) {
      const record = instances.at(-1);
      if (!record) {
        throw new Error("No Cytoscape instance available");
      }

      const handler = record.handlers.get(key);
      if (!handler) {
        throw new Error(`No Cytoscape handler registered for ${key}`);
      }

      handler({
        target: {
          addClass() {},
          data(requestedKey?: string) {
            return requestedKey ? data[requestedKey] : data;
          },
          removeClass() {},
          renderedPosition() {
            return renderedPosition ?? { x: 0, y: 0 };
          },
        },
      });
    },
    factory,
    lastElements() {
      return instances.at(-1)?.elements.map((element) => ({
        classes: Array.from(element.classes).sort().join(" "),
        data: element.data,
      })) ?? [];
    },
    instanceCount() {
      return instances.length;
    },
    lastOptions() {
      return instances.at(-1)?.options ?? null;
    },
    reset() {
      instances.length = 0;
      factory.mockClear();
    },
  };
});

vi.mock("cytoscape", () => ({
  default: cytoscapeMock.factory,
}));

vi.mock("../lib/tauri", () => ({
  bootstrapWorkspace: vi.fn().mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
    editableTextContexts: [],
  }),
  deleteNote: vi.fn(),
  renameTextContext: vi.fn(),
  refreshFailedUrlTitles: vi.fn(),
  refreshAllUrlTitles: vi.fn(),
  lookupUrlLabels: vi.fn().mockResolvedValue([]),
  saveNote: vi.fn(),
  openNote: vi.fn(),
  searchNotes: vi.fn().mockResolvedValue([]),
  filterNotesByTextContexts: vi.fn().mockResolvedValue([]),
  pickImageFile: vi.fn(),
}));

beforeEach(() => {
  cytoscapeMock.reset();
  vi.mocked(bootstrapWorkspace).mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
    editableTextContexts: [],
  });
  vi.mocked(searchNotes).mockResolvedValue([]);
  vi.mocked(filterNotesByTextContexts).mockResolvedValue([]);
});

function getThoughtEditor() {
  return screen.getByRole("textbox", { name: "Thought inbox editor" }) as HTMLElement & {
    __markdownEditor?: MarkdownEditorTestApi;
  };
}

function focusThoughtEditor() {
  const editor = getThoughtEditor();
  act(() => {
    editor.__markdownEditor?.focus();
  });
  return editor;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function emitGraphNodeTap(label: string) {
  act(() => {
    cytoscapeMock.emitLast("tap:node", {
      kind: "text_context",
      label,
    });
  });
}

function emitGraphEdgeTap(left: string, right: string) {
  act(() => {
    cytoscapeMock.emitLast("tap:edge", {
      kind: "relationship",
      left,
      right,
    });
  });
}

function emitGraphNodeMouseOver(label: string, renderedPosition = { x: 120, y: 84 }) {
  act(() => {
    cytoscapeMock.emitLast(
      "mouseover:node",
      {
        hoverTitle: label,
        kind: "text_context",
        label,
      },
      renderedPosition,
    );
  });
}

function emitGraphNodeMouseOut(label: string) {
  act(() => {
    cytoscapeMock.emitLast("mouseout:node", {
      kind: "text_context",
      label,
    });
  });
}

test("renders the Thought Inbox shell", () => {
  render(<App />);
  expect(getThoughtEditor()).toBeInTheDocument();
  expect(screen.getByLabelText("Notes panel")).toHaveAttribute("data-active", "false");
});

test("renders workspace chrome without ambient layers", () => {
  render(<App />);

  expect(screen.getByRole("main")).toBeInTheDocument();
  expect(screen.queryByTestId("ambient-background")).not.toBeInTheDocument();
});

test("bundles Departure Mono from a local asset", () => {
  expect(departureMonoFontUrl).toContain("DepartureMono-Regular.woff2");
  expect(departureMonoFontUrl).not.toContain("https://departuremono.com/");
});

test("opens settings as a dedicated front panel", async () => {
  vi.mocked(bootstrapWorkspace).mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
    editableTextContexts: [
      { id: "ctx-1", label: "Cryptography", normalizedLabel: "cryptography", useCount: 2 },
    ],
  });

  render(<App />);

  fireEvent.click(screen.getByLabelText("Settings"));

  expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeInTheDocument();
  expect(screen.getByText("Workspace settings")).toBeInTheDocument();
  expect(await screen.findByDisplayValue("Cryptography")).toBeInTheDocument();
});

test("escape closes the settings dialog", async () => {
  vi.mocked(bootstrapWorkspace).mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
    editableTextContexts: [],
  });

  render(<App />);

  fireEvent.click(screen.getByLabelText("Settings"));
  expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeInTheDocument();

  fireEvent.keyDown(window, { key: "Escape" });

  expect(screen.queryByRole("dialog", { name: "Workspace settings" })).not.toBeInTheDocument();
});

test("arrow keys move between center and placeholder panels", () => {
  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowLeft" });
  expect(screen.getByLabelText("Concept Graph panel")).toHaveAttribute("data-active", "true");

  fireEvent.keyDown(window, { key: "ArrowDown" });
  expect(screen.getByLabelText("Notes panel")).toHaveAttribute("data-active", "true");

  fireEvent.keyDown(window, { key: "Escape" });
  expect(getThoughtEditor()).toHaveFocus();
});

test("arrow keys inside the editor do not navigate panels", () => {
  render(<App />);

  const editor = focusThoughtEditor();

  fireEvent.keyDown(editor, { key: "ArrowDown" });

  expect(screen.getByLabelText("Notes panel")).toHaveAttribute("data-active", "false");
  expect(editor).toHaveFocus();
});

test("escape inside the editor blurs before panel navigation resumes", () => {
  render(<App />);

  const editor = focusThoughtEditor();

  fireEvent.keyDown(editor, { key: "Escape" });
  expect(editor).not.toHaveFocus();

  fireEvent.keyDown(window, { key: "ArrowLeft" });
  expect(screen.getByLabelText("Concept Graph panel")).toHaveAttribute("data-active", "true");
});

test("bottom notes panel provides a focusable scroll region when notes overflow", async () => {
  vi.mocked(bootstrapWorkspace).mockResolvedValueOnce({
    history: Array.from({ length: 18 }, (_, index) => ({
      id: `note-${index}`,
      preview: `Overflow note ${index}`,
      lastOpenedAt: null,
      updatedAt: `2026-03-${String(index + 1).padStart(2, "0")}`,
    })),
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
    editableTextContexts: [],
  });

  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowDown" });

  const notesPanel = screen.getByLabelText("Notes panel");
  const scrollRegion = await screen.findByLabelText("Notes list");
  expect(notesPanel).toHaveAttribute("data-active", "true");
  expect(notesPanel).toHaveAttribute("data-size", "capped");
  expect(scrollRegion).toHaveAttribute("tabindex", "0");
});

test("inactive notes panel controls are removed from the tab order", async () => {
  vi.mocked(bootstrapWorkspace).mockResolvedValueOnce({
    history: [
      {
        id: "note-1",
        preview: "Focusable note",
        lastOpenedAt: null,
        updatedAt: "2026-03-24",
      },
    ],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
    editableTextContexts: [],
  });

  render(<App />);
  await screen.findByText("Focusable note");

  const notesPanel = screen.getByLabelText("Notes panel");
  const exportButton = notesPanel.querySelector<HTMLButtonElement>(".history-export");
  const scrollRegion = notesPanel.querySelector<HTMLDivElement>(".history-scroll-region");
  const checkbox = notesPanel.querySelector<HTMLInputElement>('input[aria-label="Select Focusable note"]');
  const openButton = notesPanel.querySelector<HTMLButtonElement>(".history-item");
  const deleteButton = notesPanel.querySelector<HTMLButtonElement>('button[aria-label="Delete Focusable note"]');

  expect(notesPanel).toHaveAttribute("data-active", "false");
  expect(exportButton).not.toBeNull();
  expect(scrollRegion).not.toBeNull();
  expect(checkbox).not.toBeNull();
  expect(openButton).not.toBeNull();
  expect(deleteButton).not.toBeNull();
  expect(exportButton).toBeDisabled();
  expect(scrollRegion).toHaveAttribute("tabindex", "-1");
  expect(checkbox).toBeDisabled();
  expect(openButton).toBeDisabled();
  expect(deleteButton).toBeDisabled();
});

test("notes panel renders a search field and requests matches", async () => {
  vi.mocked(bootstrapWorkspace).mockResolvedValueOnce({
    history: [
      {
        id: "note-1",
        preview: "Existing note",
        lastOpenedAt: null,
        updatedAt: "2026-03-24T10:00:00Z",
      },
    ],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
    editableTextContexts: [],
  });
  vi.mocked(searchNotes).mockResolvedValueOnce([
    {
      id: "note-1",
      preview: "A <mark>crypto</mark> note",
      matchedTags: [{ text: "<mark>crypto</mark>graphy" }],
      lastOpenedAt: null,
      updatedAt: "2026-03-30T10:00:00Z",
    },
  ]);

  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowDown" });
  fireEvent.change(await screen.findByLabelText("Search notes"), {
    target: { value: "crypto" },
  });

  expect(searchNotes).toHaveBeenCalledWith("crypto");
  expect((await screen.findAllByText("crypto", { selector: "mark" })).length).toBeGreaterThan(0);
});

test("activating the notes panel focuses the notes search input", async () => {
  vi.mocked(bootstrapWorkspace).mockResolvedValueOnce({
    history: [
      {
        id: "note-1",
        preview: "Existing note",
        lastOpenedAt: null,
        updatedAt: "2026-03-24T10:00:00Z",
      },
    ],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
    editableTextContexts: [],
  });

  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowDown" });

  expect(await screen.findByLabelText("Search notes")).toHaveFocus();
});

test("selecting notes highlights related graph nodes and edges in the left view", async () => {
  vi.mocked(bootstrapWorkspace).mockResolvedValueOnce({
    history: [
      {
        id: "note-1",
        preview: "Cryptography note",
        lastOpenedAt: null,
        updatedAt: "2026-04-08T10:00:00Z",
        textContextLabels: ["cryptography", "number theory"],
      },
    ],
    placeholders: [],
    knownTextContexts: [
      { label: "cryptography", normalizedLabel: "cryptography", useCount: 3 },
      { label: "number theory", normalizedLabel: "number theory", useCount: 2 },
      { label: "elliptic curves", normalizedLabel: "elliptic curves", useCount: 1 },
    ],
    textContextRelationships: [
      { left: "cryptography", right: "number theory", useCount: 2 },
      { left: "cryptography", right: "elliptic curves", useCount: 1 },
    ],
    editableTextContexts: [],
  });

  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowLeft" });

  const graphPanel = screen.getByLabelText("Concept Graph panel");
  expect(within(graphPanel).getByText("No note selection")).toBeInTheDocument();

  fireEvent.keyDown(window, { key: "ArrowDown" });
  fireEvent.click(await screen.findByLabelText("Select Cryptography note"));
  fireEvent.keyDown(window, { key: "ArrowLeft" });

  expect(within(graphPanel).getByText("2 note-linked contexts")).toBeInTheDocument();
  const elements = cytoscapeMock.lastElements();
  const cryptographyNode = elements.find((element) => element.data.label === "cryptography");
  const numberTheoryNode = elements.find((element) => element.data.label === "number theory");
  const ellipticNode = elements.find((element) => element.data.label === "elliptic curves");
  const cryptographyEdge = elements.find(
    (element) => element.data.left === "cryptography" && element.data.right === "number theory",
  );
  const ellipticEdge = elements.find(
    (element) => element.data.left === "cryptography" && element.data.right === "elliptic curves",
  );

  expect(cryptographyNode?.classes).toContain("is-related");
  expect(numberTheoryNode?.classes).toContain("is-related");
  expect(ellipticNode?.classes ?? "").not.toContain("is-related");
  expect(cryptographyEdge?.classes).toContain("is-related");
  expect(ellipticEdge?.classes ?? "").not.toContain("is-related");
});

test("graph panel mounts an interactive Cytoscape canvas with circular unlabeled nodes", async () => {
  vi.mocked(bootstrapWorkspace).mockResolvedValueOnce({
    history: [],
    placeholders: [],
    knownTextContexts: [
      { label: "elliptic curves", normalizedLabel: "elliptic curves", useCount: 1 },
      { label: "cryptography", normalizedLabel: "cryptography", useCount: 5 },
      { label: "distributed systems", normalizedLabel: "distributed systems", useCount: 2 },
      { label: "number theory", normalizedLabel: "number theory", useCount: 3 },
    ],
    textContextRelationships: [
      { left: "cryptography", right: "number theory", useCount: 4 },
      { left: "cryptography", right: "elliptic curves", useCount: 1 },
      { left: "distributed systems", right: "number theory", useCount: 1 },
    ],
    editableTextContexts: [],
  });

  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowLeft" });

  const graphPanel = screen.getByLabelText("Concept Graph panel");
  const scrollRegion = within(graphPanel).getByLabelText("Concept graph details");
  expect(scrollRegion).toHaveAttribute("tabindex", "0");
  expect(within(graphPanel).getByTestId("concept-graph-canvas")).toBeInTheDocument();

  await waitFor(() => {
    const options = cytoscapeMock.lastOptions() as {
      elements?: Array<{ data: Record<string, unknown> }>;
      style?: Array<{ selector: string; style: Record<string, string> }>;
      userPanningEnabled?: boolean;
      userZoomingEnabled?: boolean;
    } | null;

    expect(options?.elements).toHaveLength(7);
  });

  const options = cytoscapeMock.lastOptions() as {
    elements?: Array<{ data: Record<string, unknown> }>;
    layout?: Record<string, unknown>;
    minZoom?: number;
    style?: Array<{ selector: string; style: Record<string, string> }>;
    userPanningEnabled?: boolean;
    userZoomingEnabled?: boolean;
    wheelSensitivity?: number;
  } | null;
  expect(options?.elements?.filter((element) => element.data.kind === "text_context")).toHaveLength(4);
  expect(options?.elements?.filter((element) => element.data.kind === "relationship")).toHaveLength(3);
  expect(options?.userZoomingEnabled).toBe(true);
  expect(options?.userPanningEnabled).toBe(true);
  expect(options?.minZoom).toBe(0.08);
  expect(options?.wheelSensitivity).toBe(0.24);
  expect(options?.layout).toMatchObject({
    idealEdgeLength: 180,
    name: "cose",
    nodeOverlap: 64,
    padding: 32,
  });

  const cryptographyNode = options?.elements?.find((element) => element.data.label === "cryptography");
  expect(cryptographyNode?.data.degree).toBe(2);
  expect(cryptographyNode?.data.hoverTitle).toBe("cryptography");

  const nodeStyle = options?.style?.find((entry) => entry.selector === "node")?.style;
  const edgeStyle = options?.style?.find((entry) => entry.selector === "edge")?.style;
  expect(nodeStyle?.shape).toBe("ellipse");
  expect(nodeStyle?.label).toBe("");
  expect(nodeStyle?.width).toContain("mapData");
  expect(nodeStyle?.height).toContain("mapData");
  expect(edgeStyle?.["target-arrow-shape"]).toBeUndefined();

  expect(screen.queryByText("cryptography")).not.toBeInTheDocument();

  emitGraphNodeMouseOver("cryptography", { x: 160, y: 112 });
  expect(await screen.findByText("cryptography")).toBeInTheDocument();

  emitGraphNodeMouseOut("cryptography");
  expect(screen.queryByText("cryptography")).not.toBeInTheDocument();
});

test("graph focus stays separate from note selection and filtering", async () => {
  vi.mocked(bootstrapWorkspace).mockResolvedValueOnce({
    history: [
      {
        id: "note-1",
        preview: "Cryptography note",
        lastOpenedAt: null,
        updatedAt: "2026-04-08T10:00:00Z",
        textContextLabels: ["cryptography", "number theory"],
      },
      {
        id: "note-2",
        preview: "Systems note",
        lastOpenedAt: null,
        updatedAt: "2026-04-08T11:00:00Z",
        textContextLabels: ["distributed systems", "number theory"],
      },
      {
        id: "note-3",
        preview: "Elliptic note",
        lastOpenedAt: null,
        updatedAt: "2026-04-08T12:00:00Z",
        textContextLabels: ["cryptography", "elliptic curves"],
      },
    ],
    placeholders: [],
    knownTextContexts: [
      { label: "cryptography", normalizedLabel: "cryptography", useCount: 2 },
      { label: "number theory", normalizedLabel: "number theory", useCount: 2 },
      { label: "distributed systems", normalizedLabel: "distributed systems", useCount: 1 },
      { label: "elliptic curves", normalizedLabel: "elliptic curves", useCount: 1 },
    ],
    textContextRelationships: [
      { left: "cryptography", right: "number theory", useCount: 1 },
      { left: "cryptography", right: "elliptic curves", useCount: 1 },
      { left: "distributed systems", right: "number theory", useCount: 1 },
    ],
    editableTextContexts: [],
  });
  vi.mocked(filterNotesByTextContexts)
    .mockResolvedValueOnce([
      {
        id: "note-1",
        preview: "Cryptography note",
        lastOpenedAt: null,
        updatedAt: "2026-04-08T10:00:00Z",
        textContextLabels: ["cryptography", "number theory"],
      },
      {
        id: "note-3",
        preview: "Elliptic note",
        lastOpenedAt: null,
        updatedAt: "2026-04-08T12:00:00Z",
        textContextLabels: ["cryptography", "elliptic curves"],
      },
    ])
    .mockResolvedValueOnce([
      {
        id: "note-1",
        preview: "Cryptography note",
        lastOpenedAt: null,
        updatedAt: "2026-04-08T10:00:00Z",
        textContextLabels: ["cryptography", "number theory"],
      },
    ]);

  render(<App />);

  const notesPanel = screen.getByLabelText("Notes panel");

  fireEvent.keyDown(window, { key: "ArrowDown" });
  fireEvent.click(await screen.findByLabelText("Select Systems note"));
  fireEvent.keyDown(window, { key: "ArrowLeft" });

  emitGraphNodeTap("cryptography");

  const graphPanel = screen.getByLabelText("Concept Graph panel");
  expect(await within(graphPanel).findByText("Focused: cryptography")).toBeInTheDocument();

  fireEvent.keyDown(window, { key: "ArrowDown" });
  expect(within(notesPanel).queryByText("Filtered by cryptography")).not.toBeInTheDocument();
  expect(within(notesPanel).getByLabelText("Select Systems note")).toBeChecked();
  expect(within(notesPanel).getByLabelText("Select Cryptography note")).not.toBeChecked();
  expect(within(notesPanel).getByLabelText("Select Elliptic note")).not.toBeChecked();

  fireEvent.keyDown(window, { key: "ArrowLeft" });
  await act(async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Filter notes by focused graph item" }));
  });

  expect(notesPanel).toHaveAttribute("data-active", "true");
  expect(within(notesPanel).getByText("Filtered by cryptography")).toBeInTheDocument();
  expect(within(notesPanel).queryByText("Systems note")).not.toBeInTheDocument();
  expect(await within(notesPanel).findByLabelText("Select Cryptography note")).not.toBeChecked();
  expect(within(notesPanel).getByLabelText("Select Elliptic note")).not.toBeChecked();
  expect(within(notesPanel).getByRole("button", { name: "Export checked notes" })).toBeEnabled();

  fireEvent.keyDown(window, { key: "ArrowLeft" });
  emitGraphEdgeTap("cryptography", "number theory");
  expect(await within(graphPanel).findByText("Focused: cryptography + number theory")).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Filter notes by focused graph item" }));
  });
  expect(within(notesPanel).getByText("Filtered by cryptography + number theory")).toBeInTheDocument();
  expect(await within(notesPanel).findByLabelText("Select Cryptography note")).not.toBeChecked();
  expect(within(notesPanel).queryByText("Elliptic note")).not.toBeInTheDocument();
  expect(within(notesPanel).queryByText("Systems note")).not.toBeInTheDocument();
  expect(within(notesPanel).getByRole("button", { name: "Export checked notes" })).toBeEnabled();

  fireEvent.click(within(notesPanel).getByRole("button", { name: "Clear graph filter" }));

  expect(within(notesPanel).queryByText("Filtered by cryptography + number theory")).not.toBeInTheDocument();
  expect(within(graphPanel).getByText("Focused: cryptography + number theory")).toBeInTheDocument();
  expect(within(notesPanel).getByText("Systems note")).toBeInTheDocument();
  expect(within(notesPanel).getByLabelText("Select Cryptography note")).not.toBeChecked();
  expect(within(notesPanel).getByLabelText("Select Elliptic note")).not.toBeChecked();
  expect(within(notesPanel).getByLabelText("Select Systems note")).toBeChecked();
});

test("graph taps do not recreate the Cytoscape instance and reset the camera", async () => {
  vi.mocked(bootstrapWorkspace).mockResolvedValueOnce({
    history: [],
    placeholders: [],
    knownTextContexts: [
      { label: "cryptography", normalizedLabel: "cryptography", useCount: 2 },
      { label: "number theory", normalizedLabel: "number theory", useCount: 2 },
    ],
    textContextRelationships: [{ left: "cryptography", right: "number theory", useCount: 1 }],
    editableTextContexts: [],
  });

  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowLeft" });

  await waitFor(() => {
    expect(cytoscapeMock.lastElements()).toHaveLength(3);
  });
  const settledInstanceCount = cytoscapeMock.instanceCount();

  emitGraphNodeTap("cryptography");

  const graphPanel = screen.getByLabelText("Concept Graph panel");
  expect(await within(graphPanel).findByText("Focused: cryptography")).toBeInTheDocument();
  expect(cytoscapeMock.instanceCount()).toBe(settledInstanceCount);

  emitGraphEdgeTap("cryptography", "number theory");

  expect(await within(graphPanel).findByText("Focused: cryptography + number theory")).toBeInTheDocument();
  expect(cytoscapeMock.instanceCount()).toBe(settledInstanceCount);
});

test("graph filtering delegates note lookup to the text-context backend path", async () => {
  vi.mocked(bootstrapWorkspace).mockResolvedValueOnce({
    history: [
      {
        id: "recent-1",
        preview: "Recent note",
        lastOpenedAt: null,
        updatedAt: "2026-04-08T10:00:00Z",
        textContextLabels: ["cryptography"],
      },
    ],
    placeholders: [],
    knownTextContexts: [
      {
        label: "how to download the images",
        normalizedLabel: "how to download the images",
        useCount: 1,
      },
    ],
    textContextRelationships: [],
    editableTextContexts: [],
  });
  vi.mocked(filterNotesByTextContexts).mockResolvedValue([]);

  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowLeft" });
  emitGraphNodeTap("how to download the images");
  fireEvent.click(await screen.findByRole("button", { name: "Filter notes by focused graph item" }));

  const notesPanel = screen.getByLabelText("Notes panel");
  expect(notesPanel).toHaveAttribute("data-active", "true");
  expect(filterNotesByTextContexts).toHaveBeenCalledWith(["how to download the images"]);
});

test("graph filtering alone does not enable export", async () => {
  vi.mocked(bootstrapWorkspace).mockResolvedValueOnce({
    history: [
      {
        id: "recent-1",
        preview: "Recent note",
        lastOpenedAt: null,
        updatedAt: "2026-04-08T10:00:00Z",
        textContextLabels: ["cryptography"],
      },
    ],
    placeholders: [],
    knownTextContexts: [
      {
        label: "cryptography",
        normalizedLabel: "cryptography",
        useCount: 1,
      },
    ],
    textContextRelationships: [],
    editableTextContexts: [],
  });
  vi.mocked(filterNotesByTextContexts).mockResolvedValueOnce([
    {
      id: "note-1",
      preview: "Cryptography note",
      lastOpenedAt: null,
      updatedAt: "2026-04-08T10:00:00Z",
      textContextLabels: ["cryptography"],
    },
  ]);

  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowLeft" });
  emitGraphNodeTap("cryptography");
  fireEvent.click(await screen.findByRole("button", { name: "Filter notes by focused graph item" }));

  const notesPanel = screen.getByLabelText("Notes panel");
  expect(await within(notesPanel).findByText("Cryptography note")).toBeInTheDocument();
  expect(within(notesPanel).getByRole("button", { name: "Export checked notes" })).toBeDisabled();
  expect(within(notesPanel).getByLabelText("Select Cryptography note")).not.toBeChecked();
});

test("graph filtering shows a loading state while matching notes are loading", async () => {
  const pendingLookup = deferred<
    {
      id: string;
      preview: string;
      lastOpenedAt: string | null;
      updatedAt: string;
      textContextLabels?: string[];
    }[]
  >();

  vi.mocked(bootstrapWorkspace).mockResolvedValueOnce({
    history: [
      {
        id: "recent-note",
        preview: "Recent note still visible later",
        lastOpenedAt: null,
        updatedAt: "2026-04-08T10:00:00Z",
      },
    ],
    placeholders: [],
    knownTextContexts: [
      {
        label: "how to download the images",
        normalizedLabel: "how to download the images",
        useCount: 1,
      },
    ],
    textContextRelationships: [],
    editableTextContexts: [],
  });
  vi.mocked(filterNotesByTextContexts).mockReturnValueOnce(pendingLookup.promise);

  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowLeft" });
  emitGraphNodeTap("how to download the images");
  fireEvent.click(await screen.findByRole("button", { name: "Filter notes by focused graph item" }));

  expect(await screen.findByText("Loading notes for this graph filter...")).toBeInTheDocument();
  expect(screen.queryByLabelText("Notes list")).not.toBeInTheDocument();

  await act(async () => {
    pendingLookup.resolve([]);
    await pendingLookup.promise;
  });
});

test("graph filtering shows an empty state when no notes match", async () => {
  vi.mocked(bootstrapWorkspace).mockResolvedValueOnce({
    history: [
      {
        id: "recent-note",
        preview: "Recent note still visible later",
        lastOpenedAt: null,
        updatedAt: "2026-04-08T10:00:00Z",
      },
    ],
    placeholders: [],
    knownTextContexts: [
      {
        label: "black box image classification challenge",
        normalizedLabel: "black box image classification challenge",
        useCount: 1,
      },
    ],
    textContextRelationships: [],
    editableTextContexts: [],
  });
  vi.mocked(filterNotesByTextContexts).mockResolvedValueOnce([]);

  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowLeft" });
  emitGraphNodeTap("black box image classification challenge");
  fireEvent.click(await screen.findByRole("button", { name: "Filter notes by focused graph item" }));

  expect(await screen.findByText("No notes match this graph filter yet.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Notes list")).not.toBeInTheDocument();
});
