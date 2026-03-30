use crate::domain::capture_context::CaptureContext;

#[derive(Clone, Debug)]
pub enum AnalysisStatus {
    NotRequested,
    Requested,
}

impl AnalysisStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NotRequested => "not_requested",
            Self::Requested => "requested",
        }
    }
}

#[derive(Clone, Debug)]
pub struct NoteDetail {
    pub id: String,
    pub body: String,
    pub content_hash: String,
    pub analysis_status: AnalysisStatus,
    pub analysis_requested_at: Option<String>,
    pub last_opened_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub capture_contexts: Vec<CaptureContext>,
}

#[derive(Clone, Debug)]
pub struct RecentNote {
    pub id: String,
    pub preview: String,
    pub last_opened_at: Option<String>,
    pub updated_at: String,
}

#[derive(Clone, Debug)]
pub struct MatchedTag {
    pub text: String,
}

#[derive(Clone, Debug)]
pub struct NoteSearchResult {
    pub id: String,
    pub preview: String,
    pub last_opened_at: Option<String>,
    pub updated_at: String,
    pub matched_tags: Vec<MatchedTag>,
}
