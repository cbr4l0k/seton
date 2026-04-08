use serde::Serialize;
use tokio::fs;

use crate::app_state::AppState;
use crate::db::repository::{
    EditableTextContext, KnownTextContext, SaveNoteInput, TextContextRelationship,
    TextContextSuggestionData,
    UrlLabelLookup,
};
use crate::domain::capture_context::{CaptureContext, CaptureContextInput};
use crate::domain::note::{MatchedTag, NoteDetail, NoteSearchResult, RecentNote};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePayload {
    pub history: Vec<RecentNoteDto>,
    pub placeholders: Vec<PlaceholderPanelDto>,
    pub known_text_contexts: Vec<KnownTextContextDto>,
    pub text_context_relationships: Vec<TextContextRelationshipDto>,
    pub editable_text_contexts: Vec<EditableTextContextDto>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceholderPanelDto {
    pub position: String,
    pub title: String,
    pub description: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentNoteDto {
    pub id: String,
    pub preview: String,
    pub last_opened_at: Option<String>,
    pub updated_at: String,
    pub text_context_labels: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDetailDto {
    pub id: String,
    pub body: String,
    pub content_hash: String,
    pub analysis_status: String,
    pub analysis_requested_at: Option<String>,
    pub last_opened_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub capture_contexts: Vec<CaptureContextDto>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchedTagDto {
    pub text: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSearchResultDto {
    pub id: String,
    pub preview: String,
    pub last_opened_at: Option<String>,
    pub updated_at: String,
    pub matched_tags: Vec<MatchedTagDto>,
    pub text_context_labels: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureContextDto {
    pub id: String,
    pub kind: String,
    pub text_value: Option<String>,
    pub url_value: Option<String>,
    pub display_label: Option<String>,
    pub source_path: Option<String>,
    pub managed_path: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownTextContextDto {
    pub label: String,
    pub normalized_label: String,
    pub use_count: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextContextRelationshipDto {
    pub left: String,
    pub right: String,
    pub use_count: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditableTextContextDto {
    pub id: String,
    pub label: String,
    pub normalized_label: String,
    pub use_count: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlLabelLookupDto {
    pub url: String,
    pub display_label: Option<String>,
    pub status: String,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteRequest {
    pub note_id: Option<String>,
    pub body: String,
    pub capture_contexts: Vec<CaptureContextRequest>,
    pub request_analysis: bool,
}

#[derive(Clone, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CaptureContextRequest {
    Text { text: String },
    Url { url: String },
    Image { source_path: String },
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameTextContextRequest {
    pub text_context_id: String,
    pub label: String,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LookupUrlLabelsRequest {
    pub urls: Vec<String>,
}

#[tauri::command]
pub async fn bootstrap_workspace(
    state: tauri::State<'_, AppState>,
) -> Result<WorkspacePayload, String> {
    bootstrap_workspace_with_state(state.inner()).await
}

#[tauri::command]
pub async fn save_note(
    state: tauri::State<'_, AppState>,
    input: SaveNoteRequest,
) -> Result<NoteDetailDto, String> {
    save_note_with_state(state.inner(), input).await
}

#[tauri::command]
pub async fn open_note(
    state: tauri::State<'_, AppState>,
    note_id: String,
) -> Result<NoteDetailDto, String> {
    open_note_with_state(state.inner(), note_id).await
}

#[tauri::command]
pub async fn delete_note(state: tauri::State<'_, AppState>, note_id: String) -> Result<(), String> {
    state.repository.delete_note(note_id).await
}

#[tauri::command]
pub async fn search_notes(
    state: tauri::State<'_, AppState>,
    query: String,
) -> Result<Vec<NoteSearchResultDto>, String> {
    search_notes_with_state(state.inner(), query).await
}

#[tauri::command]
pub async fn rename_text_context(
    state: tauri::State<'_, AppState>,
    input: RenameTextContextRequest,
) -> Result<(), String> {
    state
        .repository
        .rename_text_context(input.text_context_id, input.label)
        .await
}

#[tauri::command]
pub async fn export_notes_markdown(
    state: tauri::State<'_, AppState>,
    note_ids: Vec<String>,
    destination_path: String,
) -> Result<(), String> {
    let markdown = state.repository.export_notes_markdown(note_ids).await?;
    fs::write(destination_path, markdown)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn refresh_failed_url_titles(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.repository.refresh_failed_url_titles().await
}

#[tauri::command]
pub async fn refresh_all_url_titles(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.repository.refresh_all_url_titles().await
}

#[tauri::command]
pub async fn lookup_url_labels(
    state: tauri::State<'_, AppState>,
    input: LookupUrlLabelsRequest,
) -> Result<Vec<UrlLabelLookupDto>, String> {
    state
        .repository
        .lookup_url_labels(input.urls)
        .await
        .map(|items| items.into_iter().map(UrlLabelLookupDto::from).collect())
}

pub async fn bootstrap_workspace_with_state(state: &AppState) -> Result<WorkspacePayload, String> {
    let history = state.repository.list_recent_notes(12).await?;
    let TextContextSuggestionData {
        known_text_contexts,
        text_context_relationships,
    } = state.repository.list_text_context_suggestion_data().await?;
    let editable_text_contexts = state.repository.list_editable_text_contexts().await?;

    Ok(WorkspacePayload {
        history: history.into_iter().map(RecentNoteDto::from).collect(),
        placeholders: placeholder_panels(),
        known_text_contexts: known_text_contexts
            .into_iter()
            .map(KnownTextContextDto::from)
            .collect(),
        text_context_relationships: text_context_relationships
            .into_iter()
            .map(TextContextRelationshipDto::from)
            .collect(),
        editable_text_contexts: editable_text_contexts
            .into_iter()
            .map(EditableTextContextDto::from)
            .collect(),
    })
}

pub async fn save_note_with_state(
    state: &AppState,
    input: SaveNoteRequest,
) -> Result<NoteDetailDto, String> {
    state
        .repository
        .save_note(SaveNoteInput {
            note_id: input.note_id,
            body: input.body,
            capture_contexts: input
                .capture_contexts
                .into_iter()
                .map(CaptureContextInput::from)
                .collect(),
            request_analysis: input.request_analysis,
        })
        .await
        .map(NoteDetailDto::from)
}

pub async fn open_note_with_state(
    state: &AppState,
    note_id: String,
) -> Result<NoteDetailDto, String> {
    state
        .repository
        .open_note(note_id)
        .await?
        .ok_or_else(|| "note not found".to_string())
        .map(NoteDetailDto::from)
}

pub async fn search_notes_with_state(
    state: &AppState,
    query: String,
) -> Result<Vec<NoteSearchResultDto>, String> {
    state
        .repository
        .search_notes(query, 24)
        .await
        .map(|results| results.into_iter().map(NoteSearchResultDto::from).collect())
}

fn placeholder_panels() -> Vec<PlaceholderPanelDto> {
    vec![
        PlaceholderPanelDto {
            position: "top".into(),
            title: "Finished Documents".into(),
            description: "Placeholder surface for drafts assembled from mature notes.".into(),
        },
        PlaceholderPanelDto {
            position: "left".into(),
            title: "Concept Graph".into(),
            description: "Placeholder surface for concept links and structure.".into(),
        },
        PlaceholderPanelDto {
            position: "right".into(),
            title: "Insights".into(),
            description: "Placeholder surface for future analysis output.".into(),
        },
    ]
}

impl From<RecentNote> for RecentNoteDto {
    fn from(value: RecentNote) -> Self {
        Self {
            id: value.id,
            preview: value.preview,
            last_opened_at: value.last_opened_at,
            updated_at: value.updated_at,
            text_context_labels: value.text_context_labels,
        }
    }
}

impl From<NoteDetail> for NoteDetailDto {
    fn from(value: NoteDetail) -> Self {
        Self {
            id: value.id,
            body: value.body,
            content_hash: value.content_hash,
            analysis_status: value.analysis_status.as_str().into(),
            analysis_requested_at: value.analysis_requested_at,
            last_opened_at: value.last_opened_at,
            created_at: value.created_at,
            updated_at: value.updated_at,
            capture_contexts: value
                .capture_contexts
                .into_iter()
                .map(CaptureContextDto::from)
                .collect(),
        }
    }
}

impl From<CaptureContext> for CaptureContextDto {
    fn from(value: CaptureContext) -> Self {
        Self {
            id: value.id,
            kind: match value.kind {
                crate::domain::capture_context::CaptureContextKind::Text => "text",
                crate::domain::capture_context::CaptureContextKind::Url => "url",
                crate::domain::capture_context::CaptureContextKind::Image => "image",
            }
            .into(),
            text_value: value.text_value,
            url_value: value.url_value,
            display_label: value.display_label,
            source_path: value.source_path,
            managed_path: value.managed_path,
        }
    }
}

impl From<MatchedTag> for MatchedTagDto {
    fn from(value: MatchedTag) -> Self {
        Self { text: value.text }
    }
}

impl From<UrlLabelLookup> for UrlLabelLookupDto {
    fn from(value: UrlLabelLookup) -> Self {
        Self {
            url: value.url,
            display_label: value.display_label,
            status: value.status,
        }
    }
}

impl From<EditableTextContext> for EditableTextContextDto {
    fn from(value: EditableTextContext) -> Self {
        Self {
            id: value.id,
            label: value.label,
            normalized_label: value.normalized_label,
            use_count: value.use_count,
        }
    }
}

impl From<NoteSearchResult> for NoteSearchResultDto {
    fn from(value: NoteSearchResult) -> Self {
        Self {
            id: value.id,
            preview: value.preview,
            last_opened_at: value.last_opened_at,
            updated_at: value.updated_at,
            matched_tags: value
                .matched_tags
                .into_iter()
                .map(MatchedTagDto::from)
                .collect(),
            text_context_labels: value.text_context_labels,
        }
    }
}

impl From<CaptureContextRequest> for CaptureContextInput {
    fn from(value: CaptureContextRequest) -> Self {
        match value {
            CaptureContextRequest::Text { text } => Self::Text { text },
            CaptureContextRequest::Url { url } => Self::Url { url },
            CaptureContextRequest::Image { source_path } => Self::Image { source_path },
        }
    }
}

impl From<KnownTextContext> for KnownTextContextDto {
    fn from(value: KnownTextContext) -> Self {
        Self {
            label: value.label,
            normalized_label: value.normalized_label,
            use_count: value.use_count,
        }
    }
}

impl From<TextContextRelationship> for TextContextRelationshipDto {
    fn from(value: TextContextRelationship) -> Self {
        Self {
            left: value.left,
            right: value.right,
            use_count: value.use_count,
        }
    }
}

#[cfg(test)]
mod tests {
    use tempfile::TempDir;

    use crate::app_state::{build_app_paths, AppState};
    use crate::db::repository::SaveNoteInput;
    use crate::db::schema::connect;
    use crate::domain::capture_context::CaptureContextInput;

    use super::{bootstrap_workspace_with_state, search_notes_with_state};

    #[tokio::test]
    async fn bootstrap_workspace_returns_recent_notes() {
        let state = seeded_state_with_recent_note().await;
        let payload = bootstrap_workspace_with_state(&state).await.unwrap();

        assert_eq!(payload.history.len(), 1);
        assert_eq!(payload.history[0].preview, "Seed note");
    }

    #[tokio::test]
    async fn bootstrap_workspace_returns_known_text_contexts() {
        let state = seeded_state_with_text_contexts().await;
        let payload = bootstrap_workspace_with_state(&state).await.unwrap();

        assert_eq!(payload.known_text_contexts.len(), 3);
        assert_eq!(payload.known_text_contexts[0].label, "cryptography");
        assert_eq!(payload.known_text_contexts[0].use_count, 2);
    }

    #[tokio::test]
    async fn bootstrap_workspace_excludes_url_and_image_contexts_from_known_text_contexts() {
        let state = seeded_state_with_mixed_contexts().await;
        let payload = bootstrap_workspace_with_state(&state).await.unwrap();

        assert!(payload
            .known_text_contexts
            .iter()
            .all(|item| item.label != "https://example.com" && item.label != "image.png"));
    }

    #[tokio::test]
    async fn bootstrap_workspace_returns_text_context_relationships() {
        let state = seeded_state_with_related_text_contexts().await;
        let payload = bootstrap_workspace_with_state(&state).await.unwrap();

        assert!(payload.text_context_relationships.iter().any(|pair| {
            pair.left == "cryptography" && pair.right == "number theory" && pair.use_count == 2
        }));
    }

    #[tokio::test]
    async fn search_notes_returns_ranked_results_with_highlighted_tags() {
        let state = seeded_state_with_recent_note().await;

        let results = search_notes_with_state(&state, "seed".into())
            .await
            .unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "seed-note");
        assert!(
            results[0].preview.contains("<mark>")
                || results[0]
                    .matched_tags
                    .iter()
                    .any(|tag| tag.text.contains("<mark>"))
        );
    }

    async fn seeded_state_with_recent_note() -> AppState {
        let temp = TempDir::new().unwrap();
        let root = temp.keep();
        let paths = build_app_paths(&root);
        std::fs::create_dir_all(&paths.images_dir).unwrap();
        let pool = connect(&paths).await.unwrap();
        let state = AppState::from_parts(paths, pool);

        state
            .repository
            .save_note(SaveNoteInput {
                note_id: Some("seed-note".into()),
                body: "Seed note".into(),
                capture_contexts: vec![CaptureContextInput::Text {
                    text: "Seed context".into(),
                }],
                request_analysis: false,
            })
            .await
            .unwrap();

        state
    }

    fn fixture_png_path() -> String {
        let temp = TempDir::new().unwrap();
        let root = temp.keep();
        let path = root.join("fixture.png");

        std::fs::write(
            &path,
            [
                137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0,
                1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248,
                15, 4, 0, 9, 251, 3, 253, 160, 77, 167, 219, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66,
                96, 130,
            ],
        )
        .unwrap();

        path.display().to_string()
    }

    async fn seeded_state_with_text_contexts() -> AppState {
        let temp = TempDir::new().unwrap();
        let root = temp.keep();
        let paths = build_app_paths(&root);
        std::fs::create_dir_all(&paths.images_dir).unwrap();
        let pool = connect(&paths).await.unwrap();
        let state = AppState::from_parts(paths, pool);

        state
            .repository
            .save_note(SaveNoteInput {
                note_id: None,
                body: "First note".into(),
                capture_contexts: vec![
                    CaptureContextInput::Text {
                        text: "cryptography".into(),
                    },
                    CaptureContextInput::Text {
                        text: "number theory".into(),
                    },
                ],
                request_analysis: false,
            })
            .await
            .unwrap();
        state
            .repository
            .save_note(SaveNoteInput {
                note_id: None,
                body: "Second note".into(),
                capture_contexts: vec![
                    CaptureContextInput::Text {
                        text: "cryptography".into(),
                    },
                    CaptureContextInput::Text {
                        text: "geometry".into(),
                    },
                ],
                request_analysis: false,
            })
            .await
            .unwrap();
        state
            .repository
            .save_note(SaveNoteInput {
                note_id: None,
                body: "Third note".into(),
                capture_contexts: vec![CaptureContextInput::Text {
                    text: "number theory".into(),
                }],
                request_analysis: false,
            })
            .await
            .unwrap();

        state
    }

    async fn seeded_state_with_mixed_contexts() -> AppState {
        let temp = TempDir::new().unwrap();
        let root = temp.keep();
        let paths = build_app_paths(&root);
        std::fs::create_dir_all(&paths.images_dir).unwrap();
        let pool = connect(&paths).await.unwrap();
        let state = AppState::from_parts(paths, pool);

        state
            .repository
            .save_note(SaveNoteInput {
                note_id: None,
                body: "Mixed note".into(),
                capture_contexts: vec![
                    CaptureContextInput::Text {
                        text: "cryptography".into(),
                    },
                    CaptureContextInput::Url {
                        url: "https://example.com".into(),
                    },
                    CaptureContextInput::Image {
                        source_path: fixture_png_path(),
                    },
                ],
                request_analysis: false,
            })
            .await
            .unwrap();

        state
    }

    async fn seeded_state_with_related_text_contexts() -> AppState {
        let temp = TempDir::new().unwrap();
        let root = temp.keep();
        let paths = build_app_paths(&root);
        std::fs::create_dir_all(&paths.images_dir).unwrap();
        let pool = connect(&paths).await.unwrap();
        let state = AppState::from_parts(paths, pool);

        state
            .repository
            .save_note(SaveNoteInput {
                note_id: None,
                body: "Related note one".into(),
                capture_contexts: vec![
                    CaptureContextInput::Text {
                        text: "cryptography".into(),
                    },
                    CaptureContextInput::Text {
                        text: "number theory".into(),
                    },
                ],
                request_analysis: false,
            })
            .await
            .unwrap();
        state
            .repository
            .save_note(SaveNoteInput {
                note_id: None,
                body: "Related note two".into(),
                capture_contexts: vec![
                    CaptureContextInput::Text {
                        text: "number theory".into(),
                    },
                    CaptureContextInput::Text {
                        text: "cryptography".into(),
                    },
                ],
                request_analysis: false,
            })
            .await
            .unwrap();

        state
    }
}
