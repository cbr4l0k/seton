import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import App from "../App";
import departureMonoFontUrl from "../assets/fonts/DepartureMono-Regular.woff2?url";
import { bootstrapWorkspace } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  bootstrapWorkspace: vi.fn().mockResolvedValue({ history: [], placeholders: [] }),
  deleteNote: vi.fn(),
  saveNote: vi.fn(),
  openNote: vi.fn(),
  pickImageFile: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(bootstrapWorkspace).mockResolvedValue({ history: [], placeholders: [] });
});

test("renders the Thought Inbox shell", () => {
  render(<App />);
  expect(screen.getByPlaceholderText("I'm thinking about...")).toBeInTheDocument();
  expect(screen.getByLabelText("Notes panel")).toHaveAttribute("data-active", "false");
});

test("renders ambient shell layers and workspace chrome", () => {
  render(<App />);

  expect(screen.getByTestId("ambient-background")).toBeInTheDocument();
  expect(screen.getAllByTestId("ambient-ribbon")).toHaveLength(3);
  expect(screen.getAllByTestId("ambient-shape")).toHaveLength(2);
});

test("bundles Departure Mono from a local asset", () => {
  expect(departureMonoFontUrl).toContain("DepartureMono-Regular.woff2");
  expect(departureMonoFontUrl).not.toContain("https://departuremono.com/");
});

test("opens settings as a dedicated front panel", () => {
  render(<App />);

  fireEvent.click(screen.getByLabelText("Settings"));

  expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeInTheDocument();
  expect(screen.getByText("Workspace settings")).toBeInTheDocument();
});

test("arrow keys move between center and placeholder panels", () => {
  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowLeft" });
  expect(screen.getByLabelText("Concept Graph panel")).toHaveAttribute("data-active", "true");

  fireEvent.keyDown(window, { key: "ArrowDown" });
  expect(screen.getByLabelText("Notes panel")).toHaveAttribute("data-active", "true");

  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.getByPlaceholderText("I'm thinking about...")).toHaveFocus();
});

test("arrow keys inside the editor do not navigate panels", () => {
  render(<App />);

  const editor = screen.getByPlaceholderText("I'm thinking about...");
  editor.focus();

  fireEvent.keyDown(editor, { key: "ArrowDown" });

  expect(screen.getByLabelText("Notes panel")).toHaveAttribute("data-active", "false");
  expect(editor).toHaveFocus();
});

test("escape inside the editor blurs before panel navigation resumes", () => {
  render(<App />);

  const editor = screen.getByPlaceholderText("I'm thinking about...");
  editor.focus();

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
  });

  render(<App />);

  fireEvent.keyDown(window, { key: "ArrowDown" });

  const notesPanel = screen.getByLabelText("Notes panel");
  const scrollRegion = await screen.findByLabelText("Notes list");
  expect(notesPanel).toHaveAttribute("data-active", "true");
  expect(notesPanel).toHaveAttribute("data-size", "capped");
  expect(scrollRegion).toHaveAttribute("tabindex", "0");
});
