use serde::Serialize;

use crate::app_state::AppState;
use crate::db::repository::SaveNoteInput;
use crate::domain::capture_context::{CaptureContext, CaptureContextInput};
use crate::domain::note::{NoteDetail, RecentNote};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePayload {
    pub history: Vec<RecentNoteDto>,
    pub placeholders: Vec<PlaceholderPanelDto>,
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
pub struct CaptureContextDto {
    pub id: String,
    pub kind: String,
    pub text_value: Option<String>,
    pub url_value: Option<String>,
    pub source_path: Option<String>,
    pub managed_path: Option<String>,
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
pub async fn delete_note(
    state: tauri::State<'_, AppState>,
    note_id: String,
) -> Result<(), String> {
    state.repository.delete_note(note_id).await
}

pub async fn bootstrap_workspace_with_state(state: &AppState) -> Result<WorkspacePayload, String> {
    let history = state.repository.list_recent_notes(12).await?;

    Ok(WorkspacePayload {
        history: history.into_iter().map(RecentNoteDto::from).collect(),
        placeholders: placeholder_panels(),
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
            source_path: value.source_path,
            managed_path: value.managed_path,
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

#[cfg(test)]
mod tests {
    use tempfile::TempDir;

    use crate::app_state::{build_app_paths, AppState};
    use crate::db::repository::SaveNoteInput;
    use crate::db::schema::connect;
    use crate::domain::capture_context::CaptureContextInput;

    use super::bootstrap_workspace_with_state;

    #[tokio::test]
    async fn bootstrap_workspace_returns_recent_notes() {
        let state = seeded_state_with_recent_note().await;
        let payload = bootstrap_workspace_with_state(&state).await.unwrap();

        assert_eq!(payload.history.len(), 1);
        assert_eq!(payload.history[0].preview, "Seed note");
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
                note_id: None,
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
}
