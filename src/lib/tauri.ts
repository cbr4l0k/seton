import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

import type { NoteDetail, NoteSearchResult, RecentNote, SaveNoteRequest, UrlLabelLookup, WorkspacePayload } from "./types";

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

export async function searchNotes(query: string): Promise<NoteSearchResult[]> {
  return invoke<NoteSearchResult[]>("search_notes", { query });
}

export async function filterNotesByTextContexts(labels: string[]): Promise<RecentNote[]> {
  return invoke<RecentNote[]>("filter_notes_by_text_contexts", {
    input: { labels },
  });
}

export async function renameTextContext(textContextId: string, label: string): Promise<void> {
  return invoke("rename_text_context", {
    input: {
      textContextId,
      label,
    },
  });
}

export async function exportNotesMarkdown(noteIds: string[]): Promise<boolean> {
  const destinationPath = await save({
    defaultPath: "seton-notes-export.md",
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });

  if (!destinationPath) {
    return false;
  }

  await invoke("export_notes_markdown", { noteIds, destinationPath });
  return true;
}

export async function refreshFailedUrlTitles(): Promise<void> {
  return invoke("refresh_failed_url_titles");
}

export async function refreshAllUrlTitles(): Promise<void> {
  return invoke("refresh_all_url_titles");
}

export async function lookupUrlLabels(urls: string[]): Promise<UrlLabelLookup[]> {
  return invoke("lookup_url_labels", {
    input: { urls },
  });
}

export async function pickImageFile(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });

  return typeof result === "string" ? result : null;
}
