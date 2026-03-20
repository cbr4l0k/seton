import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import App from "../App";

const mockBootstrapWorkspace = vi.fn();
const mockDeleteNote = vi.fn();
const mockSaveNote = vi.fn();
const mockOpenNote = vi.fn();
const mockPickImageFile = vi.fn();

vi.mock("../lib/tauri", () => ({
  bootstrapWorkspace: () => mockBootstrapWorkspace(),
  deleteNote: (noteId: string) => mockDeleteNote(noteId),
  saveNote: (input: unknown) => mockSaveNote(input),
  openNote: (noteId: string) => mockOpenNote(noteId),
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
  mockSaveNote.mockReset();
  mockOpenNote.mockReset();
  mockPickImageFile.mockReset();
});

test("draft supports text, url, and image capture contexts", async () => {
  mockBootstrapWorkspace.mockResolvedValue({ history: [], placeholders: [] });
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
  mockBootstrapWorkspace.mockResolvedValue({ history: [], placeholders: [] });

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
  mockBootstrapWorkspace.mockResolvedValue({ history: [], placeholders: [] });
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
