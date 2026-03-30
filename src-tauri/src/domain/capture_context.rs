#[derive(Clone, Debug)]
pub enum CaptureContextInput {
    Text { text: String },
    Url { url: String },
    Image { source_path: String },
}

#[derive(Clone, Debug)]
pub enum CaptureContextKind {
    Text,
    Url,
    Image,
}

#[derive(Clone, Debug)]
pub struct CaptureContext {
    pub id: String,
    pub note_id: String,
    pub kind: CaptureContextKind,
    pub text_context_id: Option<String>,
    pub text_value: Option<String>,
    pub url_value: Option<String>,
    pub source_path: Option<String>,
    pub managed_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl CaptureContext {
    pub fn is_image(&self) -> bool {
        matches!(self.kind, CaptureContextKind::Image)
    }

    pub fn managed_path(&self) -> Option<&str> {
        self.managed_path.as_deref()
    }
}
