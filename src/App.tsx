import "./styles/app.css";
import { useEffect, useRef, useState } from "react";

import { CenterEditorPanel } from "./components/CenterEditorPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { PlaceholderPanel } from "./components/PlaceholderPanel";
import { WorkspaceCanvas } from "./components/WorkspaceCanvas";
import { useSpatialNavigation } from "./hooks/useSpatialNavigation";
import type { DraftCaptureContext } from "./components/CaptureContextEditor";
import {
  bootstrapWorkspace,
  deleteNote,
  exportNotesMarkdown,
  openNote,
  renameTextContext,
  saveNote,
  searchNotes,
} from "./lib/tauri";
import type {
  CaptureContext,
  EditableTextContext,
  KnownTextContext,
  NoteSearchResult,
  RecentNote,
  SaveNoteRequest,
  TextContextRelationship,
} from "./lib/types";

type LoadedDraftSnapshot = {
  noteId: string | null;
  body: string;
  contexts: DraftCaptureContext[];
};

export default function App() {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const { position, setPosition } = useSpatialNavigation();
  const [body, setBody] = useState("");
  const [contexts, setContexts] = useState<DraftCaptureContext[]>([]);
  const [historyItems, setHistoryItems] = useState<RecentNote[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NoteSearchResult[]>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [knownTextContexts, setKnownTextContexts] = useState<KnownTextContext[]>([]);
  const [textContextRelationships, setTextContextRelationships] = useState<TextContextRelationship[]>([]);
  const [editableTextContexts, setEditableTextContexts] = useState<EditableTextContext[]>([]);
  const [textContextDrafts, setTextContextDrafts] = useState<Record<string, string>>({});
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [requestAnalysisAfterSave, setRequestAnalysisAfterSave] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingTextContextId, setSavingTextContextId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const loadedSnapshot = useRef<LoadedDraftSnapshot>({
    noteId: null,
    body: "",
    contexts: [],
  });

  useEffect(() => {
    if (position === "center") {
      editorRef.current?.focus();
    }
  }, [position]);

  useEffect(() => {
    const cancellation = { current: false };

    void loadWorkspaceData(() => cancellation.current);

    return () => {
      cancellation.current = true;
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setToastMessage(null), 1400);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      setActiveSearchIndex(0);
      return;
    }

    let cancelled = false;

    void searchNotes(trimmedQuery)
      .then((results) => {
        if (cancelled) {
          return;
        }

        setSearchResults(results.map(formatSearchResult));
        setActiveSearchIndex(0);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setSearchResults([]);
        setActiveSearchIndex(0);
      });

    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      void attemptSave();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function syncLoadedSnapshot(nextNoteId: string | null, nextBody: string, nextContexts: DraftCaptureContext[]) {
    loadedSnapshot.current = {
      noteId: nextNoteId,
      body: nextBody,
      contexts: nextContexts,
    };
  }

  async function handleOpenNote(noteId: string) {
    const detail = await openNote(noteId);
    const nextContexts = detail.captureContexts.map(mapCaptureContextToDraft);

    setCurrentNoteId(detail.id);
    setBody(detail.body);
    setContexts(nextContexts);
    setSearchQuery("");
    setSearchResults([]);
    setActiveSearchIndex(0);
    syncLoadedSnapshot(detail.id, detail.body, nextContexts);
    setPosition("center");
  }

  async function handleDeleteNote(noteId: string) {
    await deleteNote(noteId);
    setHistoryItems((current) => current.filter((item) => item.id !== noteId));
    setSearchResults((current) => current.filter((item) => item.id !== noteId));
    setSelectedNoteIds((current) => current.filter((id) => id !== noteId));

    if (currentNoteId === noteId) {
      setCurrentNoteId(null);
      setBody("");
      syncLoadedSnapshot(null, "", contexts);
    }
  }

  function buildSavePayload(requestAnalysis: boolean) {
    const captureContexts = contexts.reduce<SaveNoteRequest["captureContexts"]>((all, context) => {
      all.push(...mapDraftContextToSaveInput(context));
      return all;
    }, []);

    return {
      noteId: currentNoteId ?? undefined,
      body,
      captureContexts,
      requestAnalysis,
    };
  }

  async function commitSave(requestAnalysis: boolean) {
    const preservedContexts = contexts;
    const detail = await saveNote(buildSavePayload(requestAnalysis));

    setHistoryItems((current) => upsertHistoryItem(current, detail.id, detail.body, detail.updatedAt));
    setCurrentNoteId(null);
    setBody("");
    setContexts(preservedContexts);
    syncLoadedSnapshot(null, "", preservedContexts);
    await loadWorkspaceData();
    setToastMessage("saved");
    setPosition("center");
  }

  async function loadWorkspaceData(isCancelled: () => boolean = () => false) {
    try {
      const payload = await bootstrapWorkspace();
      if (isCancelled()) {
        return;
      }

      setHistoryItems(payload.history.map(formatHistoryItem));
      setKnownTextContexts(payload.knownTextContexts ?? []);
      setTextContextRelationships(payload.textContextRelationships ?? []);
      setEditableTextContexts(payload.editableTextContexts ?? []);
      setTextContextDrafts(
        Object.fromEntries((payload.editableTextContexts ?? []).map((item) => [item.id, item.label])),
      );
    } catch {
      if (isCancelled()) {
        return;
      }

      setHistoryItems([]);
      setKnownTextContexts([]);
      setTextContextRelationships([]);
      setEditableTextContexts([]);
      setTextContextDrafts({});
    }
  }

  async function handleRenameTextContext(textContext: EditableTextContext) {
    const nextLabel = (textContextDrafts[textContext.id] ?? textContext.label).trim();
    if (!nextLabel || nextLabel === textContext.label) {
      return;
    }

    setSavingTextContextId(textContext.id);

    try {
      await renameTextContext(textContext.id, nextLabel);
      await loadWorkspaceData();
      setToastMessage("renamed");
    } finally {
      setSavingTextContextId(null);
    }
  }

  function isDraftUnchanged(): boolean {
    const snapshot = loadedSnapshot.current;
    return (
      currentNoteId === snapshot.noteId &&
      body === snapshot.body &&
      JSON.stringify(contexts) === JSON.stringify(snapshot.contexts)
    );
  }

  function clearEditor(options: { clearContexts?: boolean } = {}) {
    const nextContexts = options.clearContexts ? [] : contexts;
    setCurrentNoteId(null);
    setBody("");
    setContexts(nextContexts);
    syncLoadedSnapshot(null, "", nextContexts);
    setPosition("center");
  }

  async function attemptSave() {
    if (!body.trim()) {
      if (contexts.length > 0) {
        clearEditor({ clearContexts: true });
      }
      return;
    }

    if (isDraftUnchanged()) {
      clearEditor();
      return;
    }

    await commitSave(requestAnalysisAfterSave);
  }

  async function handleExportSelectedNotes() {
    const noteIds = [...selectedNoteIds];

    if (noteIds.length === 0) {
      return;
    }

    try {
      const exported = await exportNotesMarkdown(noteIds);
      if (exported) {
        setToastMessage("exported");
      }
    } catch {
      setToastMessage("export failed");
    }
  }

  function handleHistorySelectionChange(noteId: string, checked: boolean) {
    setSelectedNoteIds((current) => {
      if (checked) {
        return current.includes(noteId) ? current : [...current, noteId];
      }

      return current.filter((id) => id !== noteId);
    });
  }

  return (
    <WorkspaceCanvas position={position}>
      <button
        aria-label="Settings"
        className="settings-trigger"
        type="button"
        onClick={() => setSettingsOpen((open) => !open)}
      >
        <span aria-hidden="true" className="settings-trigger__glyph">✦</span>
      </button>

      {settingsOpen ? (
        <div className="settings-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}>
          <section
            aria-labelledby="settings-panel-title"
            aria-modal="true"
            className="settings-popover"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-popover__header">
              <p className="panel-subtle-title">Settings</p>
              <button
                aria-label="Close settings"
                className="settings-close"
                type="button"
                onClick={() => setSettingsOpen(false)}
              >
                x
              </button>
            </div>

            <h2 className="settings-popover__title" id="settings-panel-title">
              Workspace settings
            </h2>

            <div className="settings-grid">
              <section className="settings-column">
                <p className="panel-subtle-title">General</p>
                <label className="settings-option">
                  <input
                    checked={requestAnalysisAfterSave}
                    type="checkbox"
                    onChange={(event) => setRequestAnalysisAfterSave(event.target.checked)}
                  />
                  <span>Request analysis after save</span>
                </label>
              </section>

              <section className="settings-section">
                <div className="settings-section__header">
                  <p className="panel-subtle-title">Context tags</p>
                  <span className="settings-section__count">{editableTextContexts.length}</span>
                </div>

                {editableTextContexts.length > 0 ? (
                  <div className="settings-tag-list">
                    {editableTextContexts.map((textContext) => {
                      const draftValue = textContextDrafts[textContext.id] ?? textContext.label;
                      const saveDisabled =
                        savingTextContextId === textContext.id ||
                        draftValue.trim().length === 0 ||
                        draftValue.trim() === textContext.label;

                      return (
                        <div key={textContext.id} className="settings-tag-row">
                          <span className="settings-tag-meta">{textContext.useCount}</span>
                          <input
                            aria-label={`Context tag ${textContext.label}`}
                            className="settings-tag-input"
                            value={draftValue}
                            onChange={(event) =>
                              setTextContextDrafts((current) => ({
                                ...current,
                                [textContext.id]: event.target.value,
                              }))}
                          />
                          <button
                            aria-label={`Save context tag ${textContext.label}`}
                            className="settings-tag-save"
                            disabled={saveDisabled}
                            type="button"
                            onClick={() => void handleRenameTextContext(textContext)}
                          >
                            save
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="settings-empty">No saved context tags yet.</p>
                )}
              </section>
            </div>
          </section>
        </div>
      ) : null}

      <PlaceholderPanel
        active={position === "top"}
        position="top"
        title="Finished Documents"
      />

      <PlaceholderPanel
        active={position === "left"}
        position="left"
        title="Concept Graph"
      />

      <CenterEditorPanel
        active={position === "center"}
        body={body}
        contexts={contexts}
        editorRef={editorRef}
        knownTextContexts={knownTextContexts}
        onBodyChange={setBody}
        onContextsChange={setContexts}
        textContextRelationships={textContextRelationships}
      />

      <PlaceholderPanel
        active={position === "right"}
        position="right"
        title="Insights"
      />

      <HistoryPanel
        active={position === "bottom"}
        activeSearchIndex={activeSearchIndex}
        items={historyItems}
        onDelete={(noteId) => void handleDeleteNote(noteId)}
        onExport={() => void handleExportSelectedNotes()}
        onOpen={(noteId) => void handleOpenNote(noteId)}
        onSearchActiveIndexChange={setActiveSearchIndex}
        onSearchQueryChange={setSearchQuery}
        onSelectionChange={handleHistorySelectionChange}
        searchQuery={searchQuery}
        searchResults={searchResults}
        selectedNoteIds={selectedNoteIds}
      />

      {toastMessage ? <div className="save-toast">{toastMessage}</div> : null}
    </WorkspaceCanvas>
  );
}

function mapCaptureContextToDraft(context: CaptureContext): DraftCaptureContext {
  if (context.kind === "image") {
    return {
      id: context.id,
      kind: "image",
      sourcePath: context.sourcePath,
      label: context.managedPath?.split(/[\\/]/).pop() ?? context.sourcePath?.split(/[\\/]/).pop() ?? "image",
    };
  }

  return {
    id: context.id,
    kind: context.kind,
    value: context.kind === "url" ? context.urlValue ?? "" : context.textValue ?? "",
  };
}

function mapDraftContextToSaveInput(context: DraftCaptureContext) {
  type SaveCaptureContextInput = SaveNoteRequest["captureContexts"][number];

  if (context.kind === "image") {
    return context.sourcePath
      ? ([{ kind: "image", sourcePath: context.sourcePath }] satisfies SaveCaptureContextInput[])
      : [];
  }

  if (context.kind === "url") {
    return [{ kind: "url", url: context.value }] satisfies SaveCaptureContextInput[];
  }

  return [{ kind: "text", text: context.value }] satisfies SaveCaptureContextInput[];
}

function upsertHistoryItem(items: RecentNote[], noteId: string, body: string, updatedAt: string): RecentNote[] {
  const nextItem = formatHistoryItem({
    id: noteId,
    preview: body.trim().slice(0, 80) || "Untitled",
    lastOpenedAt: null,
    updatedAt,
  });

  return [nextItem, ...items.filter((item) => item.id !== noteId)];
}

function formatHistoryItem(item: RecentNote): RecentNote {
  return {
    ...item,
    updatedAt: formatHistoryTimestamp(item.updatedAt),
  };
}

function formatSearchResult(item: NoteSearchResult): NoteSearchResult {
  return {
    ...item,
    updatedAt: formatHistoryTimestamp(item.updatedAt),
  };
}

function formatHistoryTimestamp(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());

  return `${day}.${month}.${year}`;
}
