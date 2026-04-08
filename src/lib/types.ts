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
  textContextLabels?: string[];
};

export type MatchedTag = {
  text: string;
};

export type NoteSearchResult = {
  id: string;
  preview: string;
  matchedTags: MatchedTag[];
  lastOpenedAt: string | null;
  updatedAt: string;
  textContextLabels?: string[];
};

export type KnownTextContext = {
  label: string;
  normalizedLabel: string;
  useCount: number;
};

export type TextContextRelationship = {
  left: string;
  right: string;
  useCount: number;
};

export type EditableTextContext = {
  id: string;
  label: string;
  normalizedLabel: string;
  useCount: number;
};

export type UrlLabelLookup = {
  url: string;
  displayLabel: string | null;
  status: "pending" | "resolved" | "empty_title" | "non_html" | "failed";
};

export type CaptureContext =
  | {
      id: string;
      kind: "text";
      textValue: string | null;
      urlValue: null;
      displayLabel?: null;
      sourcePath: null;
      managedPath: null;
    }
  | {
      id: string;
      kind: "url";
      textValue: null;
      urlValue: string | null;
      displayLabel: string | null;
      sourcePath: null;
      managedPath: null;
    }
  | {
      id: string;
      kind: "image";
      textValue: null;
      urlValue: null;
      displayLabel?: null;
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
  knownTextContexts: KnownTextContext[];
  textContextRelationships: TextContextRelationship[];
  editableTextContexts?: EditableTextContext[];
};
