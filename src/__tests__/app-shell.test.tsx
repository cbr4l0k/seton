import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import App from "../App";
import departureMonoFontUrl from "../assets/fonts/DepartureMono-Regular.woff2?url";
import { bootstrapWorkspace, searchNotes } from "../lib/tauri";

type MarkdownEditorTestApi = {
  focus: () => void;
};

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
  pickImageFile: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(bootstrapWorkspace).mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
    editableTextContexts: [],
  });
  vi.mocked(searchNotes).mockResolvedValue([]);
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
  vi.mocked(bootstrapWorkspace).mockResolvedValueOnce({
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
  vi.mocked(bootstrapWorkspace).mockResolvedValueOnce({
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
  expect(within(graphPanel).getByText("cryptography")).toHaveAttribute("data-related", "true");
  expect(within(graphPanel).getByText("number theory")).toHaveAttribute("data-related", "true");
  expect(within(graphPanel).getByText("elliptic curves")).toHaveAttribute("data-related", "false");
  expect(within(graphPanel).getByText("cryptography <> number theory")).toHaveAttribute(
    "data-related",
    "true",
  );
  expect(within(graphPanel).getByText("cryptography <> elliptic curves")).toHaveAttribute(
    "data-related",
    "false",
  );
});

test("graph panel keeps details scrollable and surfaces related items first", async () => {
  vi.mocked(bootstrapWorkspace).mockResolvedValueOnce({
    history: [
      {
        id: "note-1",
        preview: "Focused note",
        lastOpenedAt: null,
        updatedAt: "2026-04-08T10:00:00Z",
        textContextLabels: ["cryptography", "number theory"],
      },
    ],
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

  fireEvent.keyDown(window, { key: "ArrowDown" });
  fireEvent.click(await screen.findByLabelText("Select Focused note"));
  fireEvent.keyDown(window, { key: "ArrowLeft" });

  const graphPanel = screen.getByLabelText("Concept Graph panel");
  const scrollRegion = within(graphPanel).getByLabelText("Concept graph details");
  expect(scrollRegion).toHaveAttribute("tabindex", "0");

  const nodeLabels = within(graphPanel).getAllByTestId("concept-node-label").map((node) => node.textContent);
  expect(nodeLabels.slice(0, 2)).toEqual(["cryptography", "number theory"]);

  const edgeLabels = within(graphPanel).getAllByTestId("concept-edge-label").map((edge) => edge.textContent);
  expect(edgeLabels[0]).toBe("cryptography <> number theory");
});
