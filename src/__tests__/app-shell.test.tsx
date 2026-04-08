import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import App from "../App";
import departureMonoFontUrl from "../assets/fonts/DepartureMono-Regular.woff2?url";
import { bootstrapWorkspace, filterNotesByTextContexts, searchNotes } from "../lib/tauri";

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
  filterNotesByTextContexts: vi.fn().mockResolvedValue([]),
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

test("graph panel keeps details scrollable without reordering graph items", async () => {
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
  expect(nodeLabels).toEqual([
    "elliptic curves",
    "cryptography",
    "distributed systems",
    "number theory",
  ]);

  const edgeLabels = within(graphPanel).getAllByTestId("concept-edge-label").map((edge) => edge.textContent);
  expect(edgeLabels).toEqual([
    "cryptography <> number theory",
    "cryptography <> elliptic curves",
    "distributed systems <> number theory",
  ]);
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

  fireEvent.click(await screen.findByRole("button", { name: "Focus cryptography" }));

  const graphPanel = screen.getByLabelText("Concept Graph panel");
  expect(within(graphPanel).getByText("Focused: cryptography")).toBeInTheDocument();

  fireEvent.keyDown(window, { key: "ArrowDown" });
  expect(within(notesPanel).queryByText("Filtered by cryptography")).not.toBeInTheDocument();
  expect(within(notesPanel).getByLabelText("Select Systems note")).toBeChecked();
  expect(within(notesPanel).getByLabelText("Select Cryptography note")).not.toBeChecked();
  expect(within(notesPanel).getByLabelText("Select Elliptic note")).not.toBeChecked();

  fireEvent.keyDown(window, { key: "ArrowLeft" });
  await act(async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Filter notes by cryptography" }));
  });

  expect(notesPanel).toHaveAttribute("data-active", "true");
  expect(within(notesPanel).getByText("Filtered by cryptography")).toBeInTheDocument();
  expect(within(notesPanel).queryByText("Systems note")).not.toBeInTheDocument();
  expect(await within(notesPanel).findByLabelText("Select Cryptography note")).not.toBeChecked();
  expect(within(notesPanel).getByLabelText("Select Elliptic note")).not.toBeChecked();
  expect(within(notesPanel).getByRole("button", { name: "Export selected" })).toBeEnabled();

  fireEvent.keyDown(window, { key: "ArrowLeft" });
  fireEvent.click(await screen.findByRole("button", { name: "Focus cryptography <> number theory" }));
  expect(within(graphPanel).getByText("Focused: cryptography + number theory")).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Filter notes by cryptography and number theory" }));
  });
  expect(within(notesPanel).getByText("Filtered by cryptography + number theory")).toBeInTheDocument();
  expect(await within(notesPanel).findByLabelText("Select Cryptography note")).not.toBeChecked();
  expect(within(notesPanel).queryByText("Elliptic note")).not.toBeInTheDocument();
  expect(within(notesPanel).queryByText("Systems note")).not.toBeInTheDocument();
  expect(within(notesPanel).getByRole("button", { name: "Export selected" })).toBeEnabled();

  fireEvent.click(within(notesPanel).getByRole("button", { name: "Clear graph filter" }));

  expect(within(notesPanel).queryByText("Filtered by cryptography + number theory")).not.toBeInTheDocument();
  expect(within(graphPanel).getByText("Focused: cryptography + number theory")).toBeInTheDocument();
  expect(within(notesPanel).getByText("Systems note")).toBeInTheDocument();
  expect(within(notesPanel).getByLabelText("Select Cryptography note")).not.toBeChecked();
  expect(within(notesPanel).getByLabelText("Select Elliptic note")).not.toBeChecked();
  expect(within(notesPanel).getByLabelText("Select Systems note")).toBeChecked();
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
  fireEvent.click(await screen.findByRole("button", { name: "Filter notes by how to download the images" }));

  const notesPanel = screen.getByLabelText("Notes panel");
  expect(notesPanel).toHaveAttribute("data-active", "true");
  expect(filterNotesByTextContexts).toHaveBeenCalledWith(["how to download the images"]);
});
