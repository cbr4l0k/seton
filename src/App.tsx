import "./styles/app.css";
import { useEffect, useRef, useState } from "react";

import { CenterEditorPanel } from "./components/CenterEditorPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { PlaceholderPanel } from "./components/PlaceholderPanel";
import { WorkspaceCanvas } from "./components/WorkspaceCanvas";
import { useSpatialNavigation } from "./hooks/useSpatialNavigation";
import type { DraftCaptureContext } from "./components/CaptureContextEditor";
import { bootstrapWorkspace, deleteNote, openNote, saveNote } from "./lib/tauri";
import type { CaptureContext, RecentNote, SaveNoteRequest } from "./lib/types";

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
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [requestAnalysisAfterSave, setRequestAnalysisAfterSave] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    let cancelled = false;

    void bootstrapWorkspace().then((payload) => {
      if (cancelled) {
        return;
      }
      setHistoryItems(payload.history);
    }).catch(() => {
      if (!cancelled) {
        setHistoryItems([]);
      }
    });

    return () => {
      cancelled = true;
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
    syncLoadedSnapshot(detail.id, detail.body, nextContexts);
    setPosition("center");
  }

  async function handleDeleteNote(noteId: string) {
    await deleteNote(noteId);
    setHistoryItems((current) => current.filter((item) => item.id !== noteId));

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
    setToastMessage("saved");
    setPosition("center");
  }

  async function attemptSave() {
    if (!body.trim()) {
      return;
    }

    await commitSave(requestAnalysisAfterSave);
  }

  return (
    <WorkspaceCanvas position={position}>
      <button
        aria-label="Settings"
        className="settings-trigger"
        type="button"
        onClick={() => setSettingsOpen((open) => !open)}
      >
        settings
      </button>

      {settingsOpen ? (
        <div className="settings-popover">
          <label className="settings-option">
            <input
              checked={requestAnalysisAfterSave}
              type="checkbox"
              onChange={(event) => setRequestAnalysisAfterSave(event.target.checked)}
            />
            <span>Request analysis after save</span>
          </label>
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
        onBodyChange={setBody}
        onContextsChange={setContexts}
      />

      <PlaceholderPanel
        active={position === "right"}
        position="right"
        title="Insights"
      />

      <HistoryPanel
        active={position === "bottom"}
        items={historyItems}
        onDelete={(noteId) => void handleDeleteNote(noteId)}
        onOpen={(noteId) => void handleOpenNote(noteId)}
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
  const nextItem = {
    id: noteId,
    preview: body.trim().slice(0, 80) || "Untitled",
    lastOpenedAt: null,
    updatedAt: formatHistoryTimestamp(updatedAt),
  };

  return [nextItem, ...items.filter((item) => item.id !== noteId)];
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
