import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { NoteDetail, SaveNoteRequest, WorkspacePayload } from "./types";

export async function bootstrapWorkspace(): Promise<WorkspacePayload> {
  return invoke<WorkspacePayload>("bootstrap_workspace");
}

export async function saveNote(input: SaveNoteRequest): Promise<NoteDetail> {
  return invoke<NoteDetail>("save_note", { input });
}

export async function openNote(noteId: string): Promise<NoteDetail> {
  return invoke<NoteDetail>("open_note", { noteId });
}

export async function deleteNote(noteId: string): Promise<void> {
  return invoke("delete_note", { noteId });
}

export async function pickImageFile(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });

  return typeof result === "string" ? result : null;
}
