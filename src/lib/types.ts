export type PlaceholderPanel = {
  position: "top" | "left" | "right";
  title: string;
  description: string;
};

export type RecentNote = {
  id: string;
  preview: string;
  lastOpenedAt: string | null;
  updatedAt: string;
};

export type CaptureContext =
  | {
      id: string;
      kind: "text";
      textValue: string | null;
      urlValue: null;
      sourcePath: null;
      managedPath: null;
    }
  | {
      id: string;
      kind: "url";
      textValue: null;
      urlValue: string | null;
      sourcePath: null;
      managedPath: null;
    }
  | {
      id: string;
      kind: "image";
      textValue: null;
      urlValue: null;
      sourcePath: string | null;
      managedPath: string | null;
    };

export type NoteDetail = {
  id: string;
  body: string;
  contentHash: string;
  analysisStatus: "not_requested" | "requested";
  analysisRequestedAt: string | null;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
  captureContexts: CaptureContext[];
};

export type CaptureContextDraftInput =
  | { kind: "text"; text: string }
  | { kind: "url"; url: string }
  | { kind: "image"; sourcePath: string };

export type SaveNoteRequest = {
  noteId?: string;
  body: string;
  captureContexts: CaptureContextDraftInput[];
  requestAnalysis: boolean;
};

export type WorkspacePayload = {
  history: RecentNote[];
  placeholders: PlaceholderPanel[];
};
