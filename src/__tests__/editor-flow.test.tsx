import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import App from "../App";

type MarkdownEditorTestApi = {
  focus: () => void;
  getValue: () => string;
  redo: () => boolean;
  setValue: (value: string) => void;
  undo: () => boolean;
};

const mockBootstrapWorkspace = vi.fn();
const mockDeleteNote = vi.fn();
const mockExportNotesMarkdown = vi.fn();
const mockSaveNote = vi.fn();
const mockOpenNote = vi.fn();
const mockRenameTextContext = vi.fn();
const mockRefreshFailedUrlTitles = vi.fn();
const mockRefreshAllUrlTitles = vi.fn();
const mockLookupUrlLabels = vi.fn();
const mockSearchNotes = vi.fn();
const mockFilterNotesByTextContexts = vi.fn();
const mockPickImageFile = vi.fn();

vi.mock("../lib/tauri", () => ({
  bootstrapWorkspace: () => mockBootstrapWorkspace(),
  deleteNote: (noteId: string) => mockDeleteNote(noteId),
  exportNotesMarkdown: (noteIds: string[]) => mockExportNotesMarkdown(noteIds),
  renameTextContext: (textContextId: string, label: string) => mockRenameTextContext(textContextId, label),
  refreshFailedUrlTitles: () => mockRefreshFailedUrlTitles(),
  refreshAllUrlTitles: () => mockRefreshAllUrlTitles(),
  lookupUrlLabels: (urls: string[]) => mockLookupUrlLabels(urls),
  saveNote: (input: unknown) => mockSaveNote(input),
  openNote: (noteId: string) => mockOpenNote(noteId),
  searchNotes: (query: string) => mockSearchNotes(query),
  filterNotesByTextContexts: (labels: string[]) => mockFilterNotesByTextContexts(labels),
  pickImageFile: () => mockPickImageFile(),
}));

function makeWorkspacePayload() {
  return {
    history: [
      {
        id: "seed-note",
        preview: "Seed note",
        lastOpenedAt: null,
        updatedAt: "2026-03-21T10:00:00Z",
      },
    ],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
    editableTextContexts: [],
  };
}

function makeSavedNoteDetail() {
  return {
    id: "seed-note",
    body: "Seed note",
    contentHash: "hash-1",
    analysisStatus: "not_requested" as const,
    analysisRequestedAt: null,
    lastOpenedAt: "2026-03-21T10:00:00Z",
    createdAt: "2026-03-21T10:00:00Z",
    updatedAt: "2026-03-21T10:00:00Z",
    captureContexts: [],
  };
}

function getThoughtEditor() {
  return screen.getByRole("textbox", { name: "Thought inbox editor" }) as HTMLElement & {
    __markdownEditor?: MarkdownEditorTestApi;
  };
}

function getThoughtEditorApi() {
  const editor = getThoughtEditor();
  expect(editor.__markdownEditor).toBeDefined();
  return editor.__markdownEditor!;
}

function setThoughtEditorValue(value: string) {
  act(() => {
    getThoughtEditorApi().setValue(value);
  });
}

function expectThoughtEditorValue(value: string) {
  expect(getThoughtEditorApi().getValue()).toBe(value);
}

function undoThoughtEditor() {
  let result = false;
  act(() => {
    result = getThoughtEditorApi().undo();
  });
  return result;
}

test("settings can enable analysis requests and save resets to a fresh draft", async () => {
  mockBootstrapWorkspace.mockResolvedValue(makeWorkspacePayload());
  mockOpenNote.mockResolvedValue(makeSavedNoteDetail());
  mockSaveNote.mockResolvedValue({
    ...makeSavedNoteDetail(),
    body: "Seed note changed",
    analysisStatus: "requested" as const,
  });

  render(<App />);

  expect(await screen.findByText("Seed note")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByLabelText("Request analysis after save"));
  fireEvent.keyDown(window, { key: "ArrowDown" });
  fireEvent.click(screen.getByText("Seed note"));
  expect(mockOpenNote).toHaveBeenCalledWith("seed-note");
  await waitFor(() => {
    expectThoughtEditorValue("Seed note");
  });

  setThoughtEditorValue("Seed note changed");
  fireEvent.keyDown(getThoughtEditor(), {
    key: "Enter",
    ctrlKey: true,
  });

  await waitFor(() => {
    expectThoughtEditorValue("");
  });
  await waitFor(() => {
    expect(mockSaveNote).toHaveBeenCalledWith(expect.objectContaining({ requestAnalysis: true }));
  });
});

beforeEach(() => {
  mockBootstrapWorkspace.mockReset();
  mockDeleteNote.mockReset();
  mockExportNotesMarkdown.mockReset();
  mockSaveNote.mockReset();
  mockOpenNote.mockReset();
  mockRenameTextContext.mockReset();
  mockRefreshFailedUrlTitles.mockReset();
  mockRefreshAllUrlTitles.mockReset();
  mockLookupUrlLabels.mockReset();
  mockSearchNotes.mockReset();
  mockFilterNotesByTextContexts.mockReset();
  mockPickImageFile.mockReset();
  mockOpenNote.mockResolvedValue(makeSavedNoteDetail());
  mockFilterNotesByTextContexts.mockResolvedValue([]);
});

test("settings can rename a shared text context and refresh suggestions", async () => {
  mockBootstrapWorkspace
    .mockResolvedValueOnce({
      history: [],
      placeholders: [],
      knownTextContexts: [{ label: "Cryptography", normalizedLabel: "cryptography", useCount: 2 }],
      textContextRelationships: [],
      editableTextContexts: [
        { id: "ctx-1", label: "Cryptography", normalizedLabel: "cryptography", useCount: 2 },
      ],
    })
    .mockResolvedValueOnce({
      history: [],
      placeholders: [],
      knownTextContexts: [{ label: "Applied cryptography", normalizedLabel: "applied cryptography", useCount: 2 }],
      textContextRelationships: [],
      editableTextContexts: [
        {
          id: "ctx-1",
          label: "Applied cryptography",
          normalizedLabel: "applied cryptography",
          useCount: 2,
        },
      ],
    });
  mockRenameTextContext.mockResolvedValue(undefined);

  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
  fireEvent.change(await screen.findByDisplayValue("Cryptography"), {
    target: { value: "Applied cryptography" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save context tag Cryptography" }));

  await waitFor(() => {
    expect(mockRenameTextContext).toHaveBeenCalledWith("ctx-1", "Applied cryptography");
  });
  expect(await screen.findByDisplayValue("Applied cryptography")).toBeInTheDocument();
});

test("settings can retry failed and all saved url title fetches", async () => {
  mockBootstrapWorkspace.mockResolvedValue(makeWorkspacePayload());
  mockRefreshFailedUrlTitles.mockResolvedValue(undefined);
  mockRefreshAllUrlTitles.mockResolvedValue(undefined);

  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Retry failed URL titles" }));

  await waitFor(() => {
    expect(mockRefreshFailedUrlTitles).toHaveBeenCalledTimes(1);
  });

  fireEvent.click(screen.getByRole("button", { name: "Refetch all URL titles" }));
  await waitFor(() => {
    expect(mockRefreshAllUrlTitles).toHaveBeenCalledTimes(1);
  });
});

test("opened notes display the fetched title for url contexts", async () => {
  mockBootstrapWorkspace.mockResolvedValue(makeWorkspacePayload());
  mockOpenNote.mockResolvedValue({
    ...makeSavedNoteDetail(),
    captureContexts: [
      {
        id: "ctx-url-1",
        kind: "url",
        textValue: null,
        urlValue: "https://example.com/article",
        displayLabel: "Example Article",
        sourcePath: null,
        managedPath: null,
      },
    ],
  });

  render(<App />);

  expect(await screen.findByText("Seed note")).toBeInTheDocument();
  fireEvent.keyDown(window, { key: "ArrowDown" });
  fireEvent.click(screen.getByText("Seed note"));

  expect(await screen.findByText("Example Article")).toBeInTheDocument();
  expect(screen.queryByText("https://example.com/article")).not.toBeInTheDocument();
});

test("draft supports text, url, and image capture contexts", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
  });
  mockPickImageFile.mockResolvedValue("/tmp/context.png");

  render(<App />);

  setThoughtEditorValue("A note");
  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "crypto 2nd homework" },
  });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });
  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "https://example.com" },
  });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "Add image" }));

  expect(screen.getByText("crypto 2nd homework")).toBeInTheDocument();
  expect(screen.getByText("https://example.com")).toBeInTheDocument();
  expect(await screen.findByText("context.png")).toBeInTheDocument();
});

test("duplicate contexts are ignored", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "https://example.com" },
  });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });
  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "https://example.com" },
  });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });

  expect(screen.getAllByText("https://example.com")).toHaveLength(1);
});

test("saving a new note clears the body and preserves contexts for the next note", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
  });
  mockSaveNote.mockResolvedValue({
    ...makeSavedNoteDetail(),
    body: "A note",
    updatedAt: "2026-03-21T11:00:00Z",
  });
  mockLookupUrlLabels.mockResolvedValue([]);

  render(<App />);

  setThoughtEditorValue("A note");
  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "https://example.com" },
  });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });

  fireEvent.keyDown(getThoughtEditor(), {
    key: "Enter",
    ctrlKey: true,
  });

  expect(mockSaveNote).toHaveBeenCalledWith(
    expect.objectContaining({
      noteId: undefined,
      requestAnalysis: false,
    }),
  );
  await waitFor(() => {
    expectThoughtEditorValue("");
  });
  expect(screen.getByText("https://example.com")).toBeInTheDocument();
});

test("saved url contexts live-update after background title resolution", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
  });
  mockSaveNote.mockResolvedValue({
    ...makeSavedNoteDetail(),
    body: "A note",
    updatedAt: "2026-03-21T11:00:00Z",
  });
  mockLookupUrlLabels
    .mockResolvedValueOnce([
      { url: "https://example.com/article", displayLabel: null, status: "pending" },
    ])
    .mockResolvedValueOnce([
      { url: "https://example.com/article", displayLabel: "Example Article", status: "resolved" },
    ]);

  render(<App />);

  setThoughtEditorValue("A note");
  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "https://example.com/article" },
  });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });

  fireEvent.keyDown(getThoughtEditor(), {
    key: "Enter",
    ctrlKey: true,
  });

  await waitFor(() => {
    expectThoughtEditorValue("");
  });
  expect(screen.getByText("https://example.com/article")).toBeInTheDocument();

  await waitFor(() => {
    expect(mockLookupUrlLabels).toHaveBeenCalledWith(["https://example.com/article"]);
  });
  await waitFor(() => {
    expect(screen.getByText("Example Article")).toBeInTheDocument();
  });
});

test("ctrl enter on an empty draft clears preserved contexts", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
  });
  mockSaveNote.mockResolvedValue({
    ...makeSavedNoteDetail(),
    body: "A note",
    updatedAt: "2026-03-21T11:00:00Z",
  });

  render(<App />);

  setThoughtEditorValue("A note");
  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "https://example.com" },
  });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });

  fireEvent.keyDown(getThoughtEditor(), {
    key: "Enter",
    ctrlKey: true,
  });

  await waitFor(() => {
    expectThoughtEditorValue("");
  });
  expect(screen.getByText("https://example.com")).toBeInTheDocument();

  fireEvent.keyDown(getThoughtEditor(), {
    key: "Enter",
    ctrlKey: true,
  });

  await waitFor(() => {
    expect(screen.queryByText("https://example.com")).not.toBeInTheDocument();
  });
  expect(mockSaveNote).toHaveBeenCalledTimes(1);
});

test("history items can be deleted", async () => {
  mockBootstrapWorkspace.mockResolvedValue(makeWorkspacePayload());
  mockDeleteNote.mockResolvedValue(undefined);

  render(<App />);

  expect(await screen.findByText("Seed note")).toBeInTheDocument();
  fireEvent.keyDown(window, { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("button", { name: "Delete Seed note" }));

  expect(mockDeleteNote).toHaveBeenCalledWith("seed-note");
});

test("selected notes can be exported as markdown", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [
      {
        id: "older-note",
        preview: "Older note",
        lastOpenedAt: null,
        updatedAt: "2026-03-20T10:00:00Z",
      },
      {
        id: "newer-note",
        preview: "Newer note",
        lastOpenedAt: null,
        updatedAt: "2026-03-21T10:00:00Z",
      },
    ],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
  });
  mockExportNotesMarkdown.mockResolvedValue(undefined);

  render(<App />);

  expect(await screen.findByText("Older note")).toBeInTheDocument();

  fireEvent.keyDown(window, { key: "ArrowDown" });
  fireEvent.click(screen.getByLabelText("Select Older note"));
  fireEvent.click(screen.getByLabelText("Select Newer note"));
  fireEvent.click(screen.getByRole("button", { name: "Export checked notes" }));

  expect(mockExportNotesMarkdown).toHaveBeenCalledWith(["older-note", "newer-note"]);
});

test("up down and enter navigate and open recent notes from the notes panel", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [
      {
        id: "older-note",
        preview: "Older note",
        lastOpenedAt: null,
        updatedAt: "2026-03-20T10:00:00Z",
      },
      {
        id: "newer-note",
        preview: "Newer note",
        lastOpenedAt: null,
        updatedAt: "2026-03-21T10:00:00Z",
      },
    ],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
  });
  mockOpenNote.mockResolvedValue(makeSavedNoteDetail());

  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowDown" });
  const searchInput = await screen.findByLabelText("Search notes");
  fireEvent.keyDown(searchInput, { key: "ArrowDown" });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Open note Newer note" })).toHaveAttribute(
      "data-active",
      "true",
    );
  });
  fireEvent.keyDown(searchInput, { key: "Enter" });

  expect(mockOpenNote).toHaveBeenCalledWith("newer-note");
});

test("saving an opened note without changes clears the editor but does not call saveNote", async () => {
  mockBootstrapWorkspace.mockResolvedValue(makeWorkspacePayload());
  mockOpenNote.mockResolvedValue(makeSavedNoteDetail());

  render(<App />);

  expect(await screen.findByText("Seed note")).toBeInTheDocument();
  fireEvent.keyDown(window, { key: "ArrowDown" });
  fireEvent.click(screen.getByText("Seed note"));
  await waitFor(() => {
    expectThoughtEditorValue("Seed note");
  });

  fireEvent.keyDown(getThoughtEditor(), {
    key: "Enter",
    ctrlKey: true,
  });

  expect(mockSaveNote).not.toHaveBeenCalled();
  expectThoughtEditorValue("");
});

test("bootstrap history timestamps are displayed as dd.mm.yyyy", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [
      {
        id: "seed-note",
        preview: "Seed note",
        lastOpenedAt: null,
        updatedAt: "2026-03-24T14:34:40.785121340+00:00",
      },
    ],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
  });

  render(<App />);

  expect(await screen.findByText("24.03.2026")).toBeInTheDocument();
});

test("up down and enter navigate and open search results from the notes panel", async () => {
  mockBootstrapWorkspace.mockResolvedValue(makeWorkspacePayload());
  mockSearchNotes.mockResolvedValue([
    {
      id: "note-a",
      preview: "<mark>Crypto</mark> A",
      matchedTags: [],
      lastOpenedAt: null,
      updatedAt: "2026-03-29T10:00:00Z",
    },
    {
      id: "note-b",
      preview: "<mark>Crypto</mark> B",
      matchedTags: [],
      lastOpenedAt: null,
      updatedAt: "2026-03-28T10:00:00Z",
    },
  ]);
  mockOpenNote.mockResolvedValue(makeSavedNoteDetail());

  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowDown" });
  fireEvent.change(await screen.findByLabelText("Search notes"), {
    target: { value: "crypto" },
  });
  await screen.findByRole("button", { name: "Open note 2" });
  fireEvent.keyDown(screen.getByLabelText("Search notes"), { key: "ArrowDown" });
  fireEvent.keyDown(screen.getByLabelText("Search notes"), { key: "Enter" });

  expect(mockOpenNote).toHaveBeenCalledWith("note-b");
});

test("search results can still be selected exported and deleted", async () => {
  mockBootstrapWorkspace.mockResolvedValue(makeWorkspacePayload());
  mockSearchNotes.mockResolvedValue([
    {
      id: "note-a",
      preview: "<mark>Crypto</mark> A",
      matchedTags: [{ text: "algebra" }],
      lastOpenedAt: null,
      updatedAt: "2026-03-29T10:00:00Z",
    },
    {
      id: "note-b",
      preview: "<mark>Crypto</mark> B",
      matchedTags: [{ text: "geometry" }],
      lastOpenedAt: null,
      updatedAt: "2026-03-28T10:00:00Z",
    },
  ]);
  mockDeleteNote.mockResolvedValue(undefined);
  mockExportNotesMarkdown.mockResolvedValue(undefined);

  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowDown" });
  fireEvent.change(await screen.findByLabelText("Search notes"), {
    target: { value: "crypto" },
  });
  await screen.findByRole("button", { name: "Open note 2" });

  fireEvent.click(screen.getByLabelText("Select search result 1"));
  fireEvent.click(screen.getByLabelText("Select search result 2"));
  fireEvent.click(screen.getByRole("button", { name: "Export checked notes" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete search result 2" }));

  expect(mockExportNotesMarkdown).toHaveBeenCalledWith(["note-a", "note-b"]);
  expect(mockDeleteNote).toHaveBeenCalledWith("note-b");
});

test("ArrowRight advances from the create entry to the first suggestion, then to the next", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [
      { label: "cryptography", normalizedLabel: "cryptography", useCount: 2 },
      { label: "cryptoanalysis", normalizedLabel: "cryptoanalysis", useCount: 1 },
    ],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "crypto" },
  });

  const firstSuggestion = await screen.findByRole("button", { name: "Suggest cryptography" });
  const secondSuggestion = await screen.findByRole("button", { name: "Suggest cryptoanalysis" });
  expect(screen.getByRole("button", { name: "Create context: crypto" })).toHaveAttribute(
    "data-active",
    "true",
  );

  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "ArrowRight" });
  expect(firstSuggestion).toHaveAttribute("data-active", "true");

  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "ArrowRight" });
  expect(secondSuggestion).toHaveAttribute("data-active", "true");
});

test("the active suggestion stays in the left slot while neighbors rotate", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [
      { label: "cryptography", normalizedLabel: "cryptography", useCount: 5 },
      { label: "cryptoanalysis", normalizedLabel: "cryptoanalysis", useCount: 4 },
      { label: "cryptology", normalizedLabel: "cryptology", useCount: 3 },
      { label: "cryptonym", normalizedLabel: "cryptonym", useCount: 2 },
      { label: "encryption", normalizedLabel: "encryption", useCount: 1 },
    ],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "crypto" },
  });

  await screen.findByRole("button", { name: "Suggest cryptography" });
  // Create entry is default active; suggestions appear in natural order.
  expect(readSuggestionLabels()).toEqual([
    "cryptography",
    "cryptoanalysis",
    "cryptology",
    "cryptonym",
    "encryption",
  ]);
  expect(readActiveSuggestionLabel()).toBe(null);

  // Move to first suggestion.
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "ArrowRight" });
  expect(readSuggestionLabels()).toEqual([
    "cryptography",
    "cryptoanalysis",
    "cryptology",
    "cryptonym",
    "encryption",
  ]);
  expect(readActiveSuggestionLabel()).toBe("cryptography");

  // Move to second suggestion — belt rotates to keep it in the left slot.
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "ArrowRight" });
  expect(readSuggestionLabels()).toEqual([
    "cryptoanalysis",
    "cryptology",
    "cryptonym",
    "encryption",
    "cryptography",
  ]);
  expect(readActiveSuggestionLabel()).toBe("cryptoanalysis");
});

test("ArrowLeft wraps from the create entry to the last suggestion", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [
      { label: "cryptography", normalizedLabel: "cryptography", useCount: 2 },
      { label: "cryptoanalysis", normalizedLabel: "cryptoanalysis", useCount: 1 },
    ],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "crypto" },
  });

  const secondSuggestion = await screen.findByRole("button", { name: "Suggest cryptoanalysis" });
  // Create entry is default active; ArrowLeft wraps to the last suggestion.
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "ArrowLeft" });

  expect(secondSuggestion).toHaveAttribute("data-active", "true");
  expect(screen.getByLabelText("Concept Graph panel")).toHaveAttribute("data-active", "false");
});

test("typing shows fuzzy text-context suggestions from prior labels", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [
      { label: "cryptography", normalizedLabel: "cryptography", useCount: 2 },
      { label: "number theory", normalizedLabel: "number theory", useCount: 1 },
    ],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "crypto" },
  });

  expect(await screen.findByRole("button", { name: "Suggest cryptography" })).toBeInTheDocument();
});

test("editor exposes working undo and redo history controls", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
    editableTextContexts: [],
  });

  render(<App />);

  const editorApi = getThoughtEditorApi();
  editorApi.setValue("alpha");
  editorApi.setValue("alpha beta");

  expect(editorApi.getValue()).toBe("alpha beta");
  expect(editorApi.undo()).toBe(true);
  expect(editorApi.getValue()).toBe("alpha");
  expect(editorApi.redo()).toBe(true);
  expect(editorApi.getValue()).toBe("alpha beta");
});

test("saving a draft reset does not pollute undo history", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
    editableTextContexts: [],
  });
  mockSaveNote.mockResolvedValue({
    ...makeSavedNoteDetail(),
    body: "alpha beta",
    updatedAt: "2026-03-21T11:00:00Z",
  });

  render(<App />);

  setThoughtEditorValue("alpha beta");
  fireEvent.keyDown(getThoughtEditor(), {
    key: "Enter",
    ctrlKey: true,
  });

  await waitFor(() => {
    expectThoughtEditorValue("");
  });
  expect(undoThoughtEditor()).toBe(false);
  expectThoughtEditorValue("");
});

test("ctrl enter in notes search does not save the current draft", async () => {
  mockBootstrapWorkspace.mockResolvedValue(makeWorkspacePayload());
  mockSaveNote.mockResolvedValue({
    ...makeSavedNoteDetail(),
    body: "Draft body",
    updatedAt: "2026-03-21T11:00:00Z",
  });

  render(<App />);

  setThoughtEditorValue("Draft body");

  fireEvent.keyDown(window, { key: "ArrowDown" });
  const searchInput = await screen.findByLabelText("Search notes");
  searchInput.focus();
  fireEvent.keyDown(searchInput, {
    key: "Enter",
    ctrlKey: true,
  });

  expect(mockSaveNote).not.toHaveBeenCalled();
});

test("selected text labels boost related recommendations and exclude already selected labels", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [
      { label: "cryptography", normalizedLabel: "cryptography", useCount: 3 },
      { label: "number theory", normalizedLabel: "number theory", useCount: 3 },
      { label: "elliptic curves", normalizedLabel: "elliptic curves", useCount: 1 },
    ],
    textContextRelationships: [
      { left: "cryptography", right: "number theory", useCount: 3 },
      { left: "cryptography", right: "elliptic curves", useCount: 1 },
    ],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "cryptography" },
  });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });
  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "num" },
  });

  const suggestions = await screen.findAllByRole("button", { name: /Suggest / });
  expect(suggestions[0]).toHaveTextContent("number theory");
  expect(screen.queryByRole("button", { name: "Suggest cryptography" })).not.toBeInTheDocument();
});

test("pressing enter on a navigated suggestion commits it instead of the raw draft", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [{ label: "cryptography", normalizedLabel: "cryptography", useCount: 2 }],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "crypto" },
  });
  await screen.findByRole("button", { name: "Suggest cryptography" });
  // Navigate past the create entry to the matched suggestion.
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "ArrowRight" });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });

  expect(await screen.findByText("cryptography")).toBeInTheDocument();
  expect(screen.queryByText("crypto")).not.toBeInTheDocument();
});

test("left and right move the active suggestion and enter commits that selection", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [
      { label: "cryptography", normalizedLabel: "cryptography", useCount: 2 },
      { label: "cryptoanalysis", normalizedLabel: "cryptoanalysis", useCount: 1 },
    ],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "crypto" },
  });

  const firstSuggestion = await screen.findByRole("button", { name: "Suggest cryptography" });
  const secondSuggestion = await screen.findByRole("button", { name: "Suggest cryptoanalysis" });

  // Create entry is default active; navigate right twice to reach the second suggestion.
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "ArrowRight" });
  expect(firstSuggestion).toHaveAttribute("data-active", "true");
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "ArrowRight" });
  expect(secondSuggestion).toHaveAttribute("data-active", "true");

  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });

  expect(await screen.findByText("cryptoanalysis")).toBeInTheDocument();
  expect(screen.queryByText("cryptography")).not.toBeInTheDocument();
});

test("create entry appears first and is active by default when input has text", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [{ label: "cryptography", normalizedLabel: "cryptography", useCount: 1 }],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "crypto" },
  });

  await screen.findByRole("button", { name: "Suggest cryptography" });
  expect(screen.getByRole("button", { name: "Create context: crypto" })).toHaveAttribute(
    "data-active",
    "true",
  );
});

test("create entry updates in real time as the user types", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), { target: { value: "new topic" } });
  expect(await screen.findByRole("button", { name: "Create context: new topic" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Context input"), { target: { value: "new topic 2" } });
  expect(screen.getByRole("button", { name: "Create context: new topic 2" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Create context: new topic" })).not.toBeInTheDocument();
});

test("clicking create entry adds a new context with the typed label", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), { target: { value: "brand new" } });
  fireEvent.click(await screen.findByRole("button", { name: "Create context: brand new" }));

  expect(await screen.findByText("brand new")).toBeInTheDocument();
});

test("create entry is present even when typed value exactly matches an existing context", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [{ label: "cryptography", normalizedLabel: "cryptography", useCount: 1 }],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), { target: { value: "cryptography" } });

  await screen.findByRole("button", { name: "Suggest cryptography" });
  expect(screen.getByRole("button", { name: "Create context: cryptography" })).toBeInTheDocument();
});

test("ArrowRight wraps from the last suggestion back to the create entry", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [{ label: "cryptography", normalizedLabel: "cryptography", useCount: 1 }],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), { target: { value: "crypto" } });

  await screen.findByRole("button", { name: "Suggest cryptography" });
  // create → cryptography → wraps back to create
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "ArrowRight" });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "ArrowRight" });

  expect(screen.getByRole("button", { name: "Create context: crypto" })).toHaveAttribute(
    "data-active",
    "true",
  );
});

test("pressing Enter on the create entry commits the raw draft", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [{ label: "cryptography", normalizedLabel: "cryptography", useCount: 1 }],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), { target: { value: "crypto" } });
  // Create entry is default active — Enter immediately commits the raw draft.
  await screen.findByRole("button", { name: "Create context: crypto" });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });

  expect(await screen.findByText("crypto")).toBeInTheDocument();
  expect(screen.queryByText("cryptography")).not.toBeInTheDocument();
});

test("create entry appears with no matching suggestions", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), { target: { value: "brand new" } });

  expect(await screen.findByRole("button", { name: "Create context: brand new" })).toBeInTheDocument();
  expect(screen.queryAllByRole("button", { name: /Suggest / })).toHaveLength(0);
});

function readSuggestionLabels() {
  return screen
    .getAllByRole("button", { name: /Suggest / })
    .map((button) => button.textContent?.trim() ?? "");
}

function readActiveSuggestionLabel() {
  return (
    screen
      .getAllByRole("button", { name: /Suggest / })
      .find((button) => button.getAttribute("data-active") === "true")
      ?.textContent?.trim() ?? null
  );
}

test("clicking a suggestion commits it immediately", async () => {
  mockBootstrapWorkspace.mockResolvedValue({
    history: [],
    placeholders: [],
    knownTextContexts: [{ label: "cryptography", normalizedLabel: "cryptography", useCount: 2 }],
    textContextRelationships: [],
  });

  render(<App />);

  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "crypto" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Suggest cryptography" }));

  expect(await screen.findByText("cryptography")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Suggest cryptography" })).not.toBeInTheDocument();
});

test("newly saved text labels become available as suggestions for the next draft", async () => {
  mockBootstrapWorkspace
    .mockResolvedValueOnce({
      history: [],
      placeholders: [],
      knownTextContexts: [],
      textContextRelationships: [],
    })
    .mockResolvedValueOnce({
      history: [
        {
          id: "seed-note",
          preview: "A note",
          lastOpenedAt: null,
          updatedAt: "2026-03-21T11:00:00Z",
        },
      ],
      placeholders: [],
      knownTextContexts: [
        { label: "cryptography", normalizedLabel: "cryptography", useCount: 1 },
      ],
      textContextRelationships: [],
    });
  mockSaveNote.mockResolvedValue({
    ...makeSavedNoteDetail(),
    body: "A note",
    updatedAt: "2026-03-21T11:00:00Z",
    captureContexts: [
      {
        id: "ctx-1",
        kind: "text" as const,
        textValue: "cryptography",
        urlValue: null,
        sourcePath: null,
        managedPath: null,
      },
    ],
  });

  render(<App />);

  setThoughtEditorValue("A note");
  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "cryptography" },
  });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });
  fireEvent.keyDown(getThoughtEditor(), {
    key: "Enter",
    ctrlKey: true,
  });

  await waitFor(() => {
    expectThoughtEditorValue("");
  });

  fireEvent.click(screen.getByText("cryptography"));
  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "crypto" },
  });

  expect(await screen.findByRole("button", { name: "Suggest cryptography" })).toBeInTheDocument();
});
