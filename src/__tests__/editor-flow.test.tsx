import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import App from "../App";

const mockBootstrapWorkspace = vi.fn();
const mockDeleteNote = vi.fn();
const mockExportNotesMarkdown = vi.fn();
const mockSaveNote = vi.fn();
const mockOpenNote = vi.fn();
const mockSearchNotes = vi.fn();
const mockPickImageFile = vi.fn();

vi.mock("../lib/tauri", () => ({
  bootstrapWorkspace: () => mockBootstrapWorkspace(),
  deleteNote: (noteId: string) => mockDeleteNote(noteId),
  exportNotesMarkdown: (noteIds: string[]) => mockExportNotesMarkdown(noteIds),
  saveNote: (input: unknown) => mockSaveNote(input),
  openNote: (noteId: string) => mockOpenNote(noteId),
  searchNotes: (query: string) => mockSearchNotes(query),
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
  expect(await screen.findByDisplayValue("Seed note")).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText("I'm thinking about..."), {
    target: { value: "Seed note changed" },
  });
  fireEvent.keyDown(screen.getByPlaceholderText("I'm thinking about..."), {
    key: "Enter",
    ctrlKey: true,
  });

  await waitFor(() => {
    expect(screen.getByPlaceholderText("I'm thinking about...")).toHaveValue("");
  });
  expect(await screen.findByText("saved")).toBeInTheDocument();
  expect(mockSaveNote).toHaveBeenCalledWith(expect.objectContaining({ requestAnalysis: true }));
});

beforeEach(() => {
  mockBootstrapWorkspace.mockReset();
  mockDeleteNote.mockReset();
  mockExportNotesMarkdown.mockReset();
  mockSaveNote.mockReset();
  mockOpenNote.mockReset();
  mockSearchNotes.mockReset();
  mockPickImageFile.mockReset();
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

  fireEvent.change(screen.getByPlaceholderText("I'm thinking about..."), {
    target: { value: "A note" },
  });
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

  render(<App />);

  fireEvent.change(screen.getByPlaceholderText("I'm thinking about..."), {
    target: { value: "A note" },
  });
  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "https://example.com" },
  });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });

  fireEvent.keyDown(screen.getByPlaceholderText("I'm thinking about..."), {
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
    expect(screen.getByPlaceholderText("I'm thinking about...")).toHaveValue("");
  });
  expect(screen.getByText("https://example.com")).toBeInTheDocument();
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
  fireEvent.click(screen.getByRole("button", { name: "Export selected" }));

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
  expect(await screen.findByDisplayValue("Seed note")).toBeInTheDocument();

  fireEvent.keyDown(screen.getByPlaceholderText("I'm thinking about..."), {
    key: "Enter",
    ctrlKey: true,
  });

  expect(mockSaveNote).not.toHaveBeenCalled();
  expect(screen.getByPlaceholderText("I'm thinking about...")).toHaveValue("");
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
  fireEvent.click(screen.getByRole("button", { name: "Export selected" }));
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

  fireEvent.change(screen.getByPlaceholderText("I'm thinking about..."), {
    target: { value: "A note" },
  });
  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "cryptography" },
  });
  fireEvent.keyDown(screen.getByLabelText("Context input"), { key: "Enter" });
  fireEvent.keyDown(screen.getByPlaceholderText("I'm thinking about..."), {
    key: "Enter",
    ctrlKey: true,
  });

  await waitFor(() => {
    expect(screen.getByPlaceholderText("I'm thinking about...")).toHaveValue("");
  });

  fireEvent.click(screen.getByText("cryptography"));
  fireEvent.change(screen.getByLabelText("Context input"), {
    target: { value: "crypto" },
  });

  expect(await screen.findByRole("button", { name: "Suggest cryptography" })).toBeInTheDocument();
});
