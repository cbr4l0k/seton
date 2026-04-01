import { act, fireEvent, render, screen } from "@testing-library/react";
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
