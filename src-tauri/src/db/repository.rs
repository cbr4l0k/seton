use std::ffi::OsStr;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::Path;

use chrono::Utc;
use sha2::{Digest, Sha256};
use sqlx::{QueryBuilder, Sqlite, SqlitePool};
use uuid::Uuid;

use crate::app_state::AppPaths;
use crate::domain::capture_context::{CaptureContext, CaptureContextInput, CaptureContextKind};
use crate::domain::note::{AnalysisStatus, NoteDetail, RecentNote};

#[derive(Clone)]
pub struct NoteRepository {
    pool: SqlitePool,
    paths: AppPaths,
}

pub struct SaveNoteInput {
    pub note_id: Option<String>,
    pub body: String,
    pub capture_contexts: Vec<CaptureContextInput>,
    pub request_analysis: bool,
}

#[derive(Clone, Debug)]
pub struct KnownTextContext {
    pub label: String,
    pub normalized_label: String,
    pub use_count: i64,
}

#[derive(Clone, Debug)]
pub struct TextContextRelationship {
    pub left: String,
    pub right: String,
    pub use_count: i64,
}

pub struct TextContextSuggestionData {
    pub known_text_contexts: Vec<KnownTextContext>,
    pub text_context_relationships: Vec<TextContextRelationship>,
}

impl NoteRepository {
    pub fn new(pool: SqlitePool, paths: AppPaths) -> Self {
        Self { pool, paths }
    }

    pub async fn save_note(&self, input: SaveNoteInput) -> Result<NoteDetail, String> {
        let body = input.body.trim();
        if body.is_empty() {
            return Err("note body cannot be empty".into());
        }

        let note_id = input
            .note_id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let now = now_timestamp();
        let analysis_status = if input.request_analysis {
            AnalysisStatus::Requested
        } else {
            AnalysisStatus::NotRequested
        };
        let analysis_requested_at = input.request_analysis.then(|| now.clone());
        let content_hash = compute_content_hash(body, &input.capture_contexts);

        let mut tx = self.pool.begin().await.map_err(|err| err.to_string())?;
        let existing_created_at: Option<String> =
            sqlx::query_scalar("SELECT created_at FROM notes WHERE id = ?")
                .bind(&note_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|err| err.to_string())?;

        if existing_created_at.is_some() {
            sqlx::query(
                "UPDATE notes
                 SET body = ?, content_hash = ?, analysis_status = ?, analysis_requested_at = ?, updated_at = ?
                 WHERE id = ?",
            )
            .bind(body)
            .bind(&content_hash)
            .bind(analysis_status.as_str())
            .bind(analysis_requested_at.as_deref())
            .bind(&now)
            .bind(&note_id)
            .execute(&mut *tx)
            .await
            .map_err(|err| err.to_string())?;

            sqlx::query("DELETE FROM capture_contexts WHERE note_id = ?")
                .bind(&note_id)
                .execute(&mut *tx)
                .await
                .map_err(|err| err.to_string())?;
        } else {
            sqlx::query(
                "INSERT INTO notes (
                    id, body, content_hash, analysis_status, analysis_requested_at, last_opened_at, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)",
            )
            .bind(&note_id)
            .bind(body)
            .bind(&content_hash)
            .bind(analysis_status.as_str())
            .bind(analysis_requested_at.as_deref())
            .bind(&now)
            .bind(&now)
            .execute(&mut *tx)
            .await
            .map_err(|err| err.to_string())?;
        }

        for context in &input.capture_contexts {
            let persisted = persist_capture_context(&self.paths, &note_id, context)
                .await
                .map_err(|err| err.to_string())?;

            sqlx::query(
                "INSERT INTO capture_contexts (
                    id, note_id, context_type, text_value, url_value, source_path, managed_path, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&persisted.id)
            .bind(&persisted.note_id)
            .bind(context_kind_as_str(&persisted.kind))
            .bind(persisted.text_value.as_deref())
            .bind(persisted.url_value.as_deref())
            .bind(persisted.source_path.as_deref())
            .bind(persisted.managed_path.as_deref())
            .bind(&persisted.created_at)
            .bind(&persisted.updated_at)
            .execute(&mut *tx)
            .await
            .map_err(|err| err.to_string())?;
        }

        tx.commit().await.map_err(|err| err.to_string())?;

        self.get_note(note_id)
            .await?
            .ok_or_else(|| "saved note could not be reloaded".to_string())
    }

    pub async fn get_note(&self, note_id: String) -> Result<Option<NoteDetail>, String> {
        let note = sqlx::query_as::<_, NoteRow>(
            "SELECT id, body, content_hash, analysis_status, analysis_requested_at, last_opened_at, created_at, updated_at
             FROM notes WHERE id = ?",
        )
        .bind(&note_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|err| err.to_string())?;

        let Some(note) = note else {
            return Ok(None);
        };

        let capture_contexts = sqlx::query_as::<_, CaptureContextRow>(
            "SELECT id, note_id, context_type, text_value, url_value, source_path, managed_path, created_at, updated_at
             FROM capture_contexts
             WHERE note_id = ?
             ORDER BY created_at ASC, id ASC",
        )
        .bind(&note_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|err| err.to_string())?
        .into_iter()
        .map(CaptureContextRow::into_domain)
        .collect::<Result<Vec<_>, _>>()?;

        Ok(Some(NoteDetail {
            id: note.id,
            body: note.body,
            content_hash: note.content_hash,
            analysis_status: parse_analysis_status(&note.analysis_status)?,
            analysis_requested_at: note.analysis_requested_at,
            last_opened_at: note.last_opened_at,
            created_at: note.created_at,
            updated_at: note.updated_at,
            capture_contexts,
        }))
    }

    pub async fn open_note(&self, note_id: String) -> Result<Option<NoteDetail>, String> {
        let now = now_timestamp();

        sqlx::query("UPDATE notes SET last_opened_at = ?, updated_at = updated_at WHERE id = ?")
            .bind(&now)
            .bind(&note_id)
            .execute(&self.pool)
            .await
            .map_err(|err| err.to_string())?;

        self.get_note(note_id).await
    }

    pub async fn list_recent_notes(&self, limit: i64) -> Result<Vec<RecentNote>, String> {
        sqlx::query_as::<_, RecentNoteRow>(
            "SELECT id, body, last_opened_at, updated_at
             FROM notes
             ORDER BY COALESCE(last_opened_at, updated_at) DESC, updated_at DESC
             LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|err| err.to_string())?
        .into_iter()
        .map(|row| RecentNote {
            id: row.id,
            preview: preview_text(&row.body),
            last_opened_at: row.last_opened_at,
            updated_at: row.updated_at,
        })
        .collect::<Vec<_>>()
        .pipe(Ok)
    }

    pub async fn delete_note(&self, note_id: String) -> Result<(), String> {
        sqlx::query("DELETE FROM notes WHERE id = ?")
            .bind(note_id)
            .execute(&self.pool)
            .await
            .map_err(|err| err.to_string())?;

        Ok(())
    }

    pub async fn list_text_context_suggestion_data(
        &self,
    ) -> Result<TextContextSuggestionData, String> {
        let rows = self.load_text_context_rows().await?;
        let mut contexts: BTreeMap<String, KnownTextContextSummary> = BTreeMap::new();
        let mut note_contexts: HashMap<String, BTreeSet<String>> = HashMap::new();

        for row in rows {
            let Some((label, normalized_label)) = normalized_text_label(row.text_value.as_deref()) else {
                continue;
            };

            contexts
                .entry(normalized_label.clone())
                .and_modify(|entry| {
                    entry.use_count += 1;
                })
                .or_insert_with(|| KnownTextContextSummary {
                    label,
                    normalized_label: normalized_label.clone(),
                    use_count: 1,
                });

            note_contexts
                .entry(row.note_id)
                .or_default()
                .insert(normalized_label);
        }

        let mut known_text_contexts = contexts
            .values()
            .map(|summary| KnownTextContext {
                label: summary.label.clone(),
                normalized_label: summary.normalized_label.clone(),
                use_count: summary.use_count,
            })
            .collect::<Vec<_>>();

        known_text_contexts.sort_by(|left, right| {
            right
                .use_count
                .cmp(&left.use_count)
                .then_with(|| left.normalized_label.cmp(&right.normalized_label))
        });

        let mut pair_counts: BTreeMap<(String, String), i64> = BTreeMap::new();

        for normalized_labels in note_contexts.into_values() {
            let labels = normalized_labels.into_iter().collect::<Vec<_>>();
            for left_index in 0..labels.len() {
                for right_index in (left_index + 1)..labels.len() {
                    let left = labels[left_index].clone();
                    let right = labels[right_index].clone();
                    *pair_counts.entry((left, right)).or_insert(0) += 1;
                }
            }
        }

        let mut text_context_relationships = pair_counts
            .into_iter()
            .map(|((left_normalized, right_normalized), use_count)| TextContextRelationship {
                left: contexts
                    .get(&left_normalized)
                    .map(|summary| summary.label.clone())
                    .unwrap_or(left_normalized),
                right: contexts
                    .get(&right_normalized)
                    .map(|summary| summary.label.clone())
                    .unwrap_or(right_normalized),
                use_count,
            })
            .collect::<Vec<_>>();

        text_context_relationships.sort_by(|left, right| {
            right
                .use_count
                .cmp(&left.use_count)
                .then_with(|| left.left.cmp(&right.left))
                .then_with(|| left.right.cmp(&right.right))
        });

        Ok(TextContextSuggestionData {
            known_text_contexts,
            text_context_relationships,
        })
    }

    pub async fn list_known_text_contexts(&self) -> Result<Vec<KnownTextContext>, String> {
        self.list_text_context_suggestion_data()
            .await
            .map(|data| data.known_text_contexts)
    }

    pub async fn list_text_context_relationships(&self) -> Result<Vec<TextContextRelationship>, String> {
        self.list_text_context_suggestion_data()
            .await
            .map(|data| data.text_context_relationships)
    }

    pub async fn export_notes_markdown(&self, note_ids: Vec<String>) -> Result<String, String> {
        if note_ids.is_empty() {
            return Err("at least one note must be selected".into());
        }

        let mut query = QueryBuilder::<Sqlite>::new(
            "SELECT id, body FROM notes WHERE id IN (",
        );
        let mut separated = query.separated(", ");

        for note_id in note_ids {
            separated.push_bind(note_id);
        }

        separated.push_unseparated(") ORDER BY created_at ASC, id ASC");

        let rows: Vec<ExportNoteRow> = query
            .build_query_as()
            .fetch_all(&self.pool)
            .await
            .map_err(|err| err.to_string())?;

        let mut rendered_notes = Vec::with_capacity(rows.len());

        for row in rows {
            let capture_contexts = sqlx::query_as::<_, CaptureContextRow>(
                "SELECT id, note_id, context_type, text_value, url_value, source_path, managed_path, created_at, updated_at
                 FROM capture_contexts
                 WHERE note_id = ?
                 ORDER BY created_at ASC, id ASC",
            )
            .bind(&row.id)
            .fetch_all(&self.pool)
            .await
            .map_err(|err| err.to_string())?;

            rendered_notes.push(render_export_note(row.body, capture_contexts));
        }

        Ok(rendered_notes.join("\n\n---\n\n"))
    }

    async fn load_text_context_rows(&self) -> Result<Vec<TextContextRow>, String> {
        sqlx::query_as::<_, TextContextRow>(
            "SELECT note_id, text_value
             FROM capture_contexts
             WHERE context_type = 'text'
             ORDER BY created_at ASC, id ASC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|err| err.to_string())
    }
}

#[derive(sqlx::FromRow)]
struct NoteRow {
    id: String,
    body: String,
    content_hash: String,
    analysis_status: String,
    analysis_requested_at: Option<String>,
    last_opened_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(sqlx::FromRow)]
struct CaptureContextRow {
    id: String,
    note_id: String,
    context_type: String,
    text_value: Option<String>,
    url_value: Option<String>,
    source_path: Option<String>,
    managed_path: Option<String>,
    created_at: String,
    updated_at: String,
}

impl CaptureContextRow {
    fn into_domain(self) -> Result<CaptureContext, String> {
        Ok(CaptureContext {
            id: self.id,
            note_id: self.note_id,
            kind: parse_context_kind(&self.context_type)?,
            text_value: self.text_value,
            url_value: self.url_value,
            source_path: self.source_path,
            managed_path: self.managed_path,
            created_at: self.created_at,
            updated_at: self.updated_at,
        })
    }
}

#[derive(sqlx::FromRow)]
struct RecentNoteRow {
    id: String,
    body: String,
    last_opened_at: Option<String>,
    updated_at: String,
}

#[derive(sqlx::FromRow)]
struct ExportNoteRow {
    id: String,
    body: String,
}

#[derive(sqlx::FromRow)]
struct TextContextRow {
    note_id: String,
    text_value: Option<String>,
}

struct KnownTextContextSummary {
    label: String,
    normalized_label: String,
    use_count: i64,
}

fn render_export_note(body: String, capture_contexts: Vec<CaptureContextRow>) -> String {
    if capture_contexts.is_empty() {
        return body;
    }

    let context_lines = capture_contexts
        .into_iter()
        .map(export_context_label)
        .collect::<Vec<_>>()
        .join("\n");

    format!("Context:\n{context_lines}\n\n{body}")
}

fn export_context_label(context: CaptureContextRow) -> String {
    match context.context_type.as_str() {
        "text" => format!("- {}", context.text_value.unwrap_or_default()),
        "url" => format!("- {}", context.url_value.unwrap_or_default()),
        "image" => format!(
            "- image: {}",
            context
                .managed_path
                .or(context.source_path)
                .and_then(|path| Path::new(&path).file_name().and_then(OsStr::to_str).map(str::to_string))
                .unwrap_or_else(|| "image".to_string())
        ),
        _ => "- context".to_string(),
    }
}

fn normalized_text_label(value: Option<&str>) -> Option<(String, String)> {
    let trimmed = value?.trim();
    if trimmed.is_empty() {
        return None;
    }

    Some((trimmed.to_string(), trimmed.to_lowercase()))
}

async fn persist_capture_context(
    paths: &AppPaths,
    note_id: &str,
    input: &CaptureContextInput,
) -> Result<CaptureContext, std::io::Error> {
    let now = now_timestamp();
    let id = Uuid::new_v4().to_string();

    let context = match input {
        CaptureContextInput::Text { text } => CaptureContext {
            id,
            note_id: note_id.to_string(),
            kind: CaptureContextKind::Text,
            text_value: Some(text.trim().to_string()),
            url_value: None,
            source_path: None,
            managed_path: None,
            created_at: now.clone(),
            updated_at: now,
        },
        CaptureContextInput::Url { url } => CaptureContext {
            id,
            note_id: note_id.to_string(),
            kind: CaptureContextKind::Url,
            text_value: None,
            url_value: Some(url.trim().to_string()),
            source_path: None,
            managed_path: None,
            created_at: now.clone(),
            updated_at: now,
        },
        CaptureContextInput::Image { source_path } => {
            let source = Path::new(source_path);
            let extension = source.extension().and_then(OsStr::to_str).unwrap_or("bin");
            let managed_path = paths
                .images_dir
                .join(format!("{}.{}", Uuid::new_v4(), extension));

            std::fs::copy(source, &managed_path)?;

            CaptureContext {
                id,
                note_id: note_id.to_string(),
                kind: CaptureContextKind::Image,
                text_value: None,
                url_value: None,
                source_path: Some(source_path.clone()),
                managed_path: Some(managed_path.display().to_string()),
                created_at: now.clone(),
                updated_at: now,
            }
        }
    };

    Ok(context)
}

fn now_timestamp() -> String {
    Utc::now().to_rfc3339()
}

fn compute_content_hash(body: &str, capture_contexts: &[CaptureContextInput]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(body.as_bytes());

    for context in capture_contexts {
        match context {
            CaptureContextInput::Text { text } => {
                hasher.update(b"text:");
                hasher.update(text.trim().as_bytes());
            }
            CaptureContextInput::Url { url } => {
                hasher.update(b"url:");
                hasher.update(url.trim().as_bytes());
            }
            CaptureContextInput::Image { source_path } => {
                hasher.update(b"image:");
                hasher.update(source_path.as_bytes());
            }
        }
    }

    format!("{:x}", hasher.finalize())
}

fn preview_text(body: &str) -> String {
    let trimmed = body.trim();
    let preview = trimmed.chars().take(80).collect::<String>();
    if trimmed.chars().count() > 80 {
        format!("{preview}...")
    } else {
        preview
    }
}

fn parse_analysis_status(value: &str) -> Result<AnalysisStatus, String> {
    match value {
        "not_requested" => Ok(AnalysisStatus::NotRequested),
        "requested" => Ok(AnalysisStatus::Requested),
        other => Err(format!("unknown analysis status: {other}")),
    }
}

fn parse_context_kind(value: &str) -> Result<CaptureContextKind, String> {
    match value {
        "text" => Ok(CaptureContextKind::Text),
        "url" => Ok(CaptureContextKind::Url),
        "image" => Ok(CaptureContextKind::Image),
        other => Err(format!("unknown capture context type: {other}")),
    }
}

fn context_kind_as_str(kind: &CaptureContextKind) -> &'static str {
    match kind {
        CaptureContextKind::Text => "text",
        CaptureContextKind::Url => "url",
        CaptureContextKind::Image => "image",
    }
}

trait Pipe: Sized {
    fn pipe<T>(self, f: impl FnOnce(Self) -> T) -> T {
        f(self)
    }
}

impl<T> Pipe for T {}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::TempDir;

    use crate::app_state::build_app_paths;
    use crate::db::schema::connect;
    use crate::domain::capture_context::CaptureContextInput;

    use super::{NoteRepository, SaveNoteInput};

    #[tokio::test]
    async fn saves_note_with_text_and_url_contexts() {
        let repo = test_repo().await;
        let saved = repo
            .save_note(SaveNoteInput {
                note_id: None,
                body: "A durable note".into(),
                capture_contexts: vec![
                    CaptureContextInput::Text {
                        text: "crypto 2nd homework".into(),
                    },
                    CaptureContextInput::Url {
                        url: "https://example.com".into(),
                    },
                ],
                request_analysis: false,
            })
            .await
            .unwrap();

        let reopened = repo.get_note(saved.id).await.unwrap().unwrap();
        assert_eq!(reopened.body, "A durable note");
        assert_eq!(reopened.capture_contexts.len(), 2);
        assert_eq!(reopened.analysis_status.as_str(), "not_requested");
    }

    #[tokio::test]
    async fn copies_image_contexts_into_managed_storage() {
        let repo = test_repo().await;
        let saved = repo
            .save_note(SaveNoteInput {
                note_id: None,
                body: "Image note".into(),
                capture_contexts: vec![CaptureContextInput::Image {
                    source_path: fixture_png_path(),
                }],
                request_analysis: false,
            })
            .await
            .unwrap();

        let image = saved
            .capture_contexts
            .into_iter()
            .find(|item| item.is_image())
            .unwrap();
        assert!(std::path::Path::new(image.managed_path().unwrap()).exists());
    }

    #[tokio::test]
    async fn exports_selected_notes_in_created_order() {
        let repo = test_repo().await;
        let newer = repo
            .save_note(SaveNoteInput {
                note_id: None,
                body: "Newer note".into(),
                capture_contexts: vec![CaptureContextInput::Url {
                    url: "https://example.com/newer".into(),
                }],
                request_analysis: false,
            })
            .await
            .unwrap();
        let older = repo
            .save_note(SaveNoteInput {
                note_id: None,
                body: "Older note".into(),
                capture_contexts: vec![
                    CaptureContextInput::Text {
                        text: "crypto 2nd homework".into(),
                    },
                    CaptureContextInput::Url {
                        url: "https://example.com/older".into(),
                    },
                ],
                request_analysis: false,
            })
            .await
            .unwrap();

        sqlx::query("UPDATE notes SET created_at = ? WHERE id = ?")
            .bind("2026-03-20T09:00:00Z")
            .bind(&older.id)
            .execute(&repo.pool)
            .await
            .unwrap();
        sqlx::query("UPDATE notes SET created_at = ? WHERE id = ?")
            .bind("2026-03-21T09:00:00Z")
            .bind(&newer.id)
            .execute(&repo.pool)
            .await
            .unwrap();

        let markdown = repo
            .export_notes_markdown(vec![newer.id, older.id])
            .await
            .unwrap();

        assert_eq!(
            markdown,
            "Context:\n- crypto 2nd homework\n- https://example.com/older\n\nOlder note\n\n---\n\nContext:\n- https://example.com/newer\n\nNewer note"
        );
    }

    #[tokio::test]
    async fn exports_notes_by_created_order_not_edit_order() {
        let repo = test_repo().await;
        let older = repo
            .save_note(SaveNoteInput {
                note_id: None,
                body: "Older original".into(),
                capture_contexts: vec![],
                request_analysis: false,
            })
            .await
            .unwrap();
        let newer = repo
            .save_note(SaveNoteInput {
                note_id: None,
                body: "Newer original".into(),
                capture_contexts: vec![CaptureContextInput::Text {
                    text: "newer context".into(),
                }],
                request_analysis: false,
            })
            .await
            .unwrap();

        sqlx::query("UPDATE notes SET created_at = ? WHERE id = ?")
            .bind("2026-03-20T09:00:00Z")
            .bind(&older.id)
            .execute(&repo.pool)
            .await
            .unwrap();
        sqlx::query("UPDATE notes SET created_at = ? WHERE id = ?")
            .bind("2026-03-21T09:00:00Z")
            .bind(&newer.id)
            .execute(&repo.pool)
            .await
            .unwrap();

        repo.save_note(SaveNoteInput {
            note_id: Some(older.id.clone()),
            body: "Older edited later".into(),
            capture_contexts: vec![CaptureContextInput::Text {
                text: "older context".into(),
            }],
            request_analysis: false,
        })
        .await
        .unwrap();

        let markdown = repo
            .export_notes_markdown(vec![newer.id, older.id])
            .await
            .unwrap();

        assert_eq!(
            markdown,
            "Context:\n- older context\n\nOlder edited later\n\n---\n\nContext:\n- newer context\n\nNewer original"
        );
    }

    #[tokio::test]
    async fn lists_deduplicated_text_contexts_with_use_counts() {
        let repo = test_repo().await;
        repo.save_note(SaveNoteInput {
            note_id: None,
            body: "One".into(),
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
        repo.save_note(SaveNoteInput {
            note_id: None,
            body: "Two".into(),
            capture_contexts: vec![
                CaptureContextInput::Text {
                    text: "Cryptography ".into(),
                },
                CaptureContextInput::Text {
                    text: "geometry".into(),
                },
            ],
            request_analysis: false,
        })
        .await
        .unwrap();

        let contexts = repo.list_known_text_contexts().await.unwrap();

        assert_eq!(contexts[0].label, "cryptography");
        assert_eq!(contexts[0].normalized_label, "cryptography");
        assert_eq!(contexts[0].use_count, 2);
    }

    #[tokio::test]
    async fn lists_text_context_relationships_from_unique_labels_per_note() {
        let repo = test_repo().await;
        repo.save_note(SaveNoteInput {
            note_id: None,
            body: "One".into(),
            capture_contexts: vec![
                CaptureContextInput::Text {
                    text: "cryptography".into(),
                },
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
        repo.save_note(SaveNoteInput {
            note_id: None,
            body: "Two".into(),
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

        let relationships = repo.list_text_context_relationships().await.unwrap();

        assert!(relationships.iter().any(|relationship| {
            relationship.left == "cryptography"
                && relationship.right == "number theory"
                && relationship.use_count == 2
        }));
    }

    async fn test_repo() -> NoteRepository {
        let temp = TempDir::new().unwrap();
        let root = temp.keep();
        let paths = build_app_paths(&root);
        fs::create_dir_all(&paths.images_dir).unwrap();
        let pool = connect(&paths).await.unwrap();

        NoteRepository::new(pool, paths)
    }

    fn fixture_png_path() -> String {
        let temp = TempDir::new().unwrap();
        let root = temp.keep();
        let path = root.join("fixture.png");

        fs::write(
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
}
