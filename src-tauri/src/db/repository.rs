use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::ffi::OsStr;
use std::future::Future;
use std::path::Path;
use std::pin::Pin;
use std::sync::Arc;

use chrono::Utc;
use reqwest::header::CONTENT_TYPE;
use sha2::{Digest, Sha256};
use sqlx::{QueryBuilder, Sqlite, SqlitePool};
use uuid::Uuid;

use crate::app_state::AppPaths;
use crate::domain::capture_context::{CaptureContext, CaptureContextInput, CaptureContextKind};
use crate::domain::note::{AnalysisStatus, MatchedTag, NoteDetail, NoteSearchResult, RecentNote};

#[derive(Clone)]
pub struct NoteRepository {
    pool: SqlitePool,
    paths: AppPaths,
    url_title_fetcher: Arc<dyn UrlTitleFetcher>,
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
pub struct EditableTextContext {
    pub id: String,
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

#[derive(Clone, Debug)]
pub struct UrlLabelLookup {
    pub url: String,
    pub display_label: Option<String>,
    pub status: String,
}

impl NoteRepository {
    pub fn new(pool: SqlitePool, paths: AppPaths) -> Self {
        Self::new_with_url_title_fetcher(pool, paths, Arc::new(HttpUrlTitleFetcher::default()))
    }

    pub(crate) fn new_with_url_title_fetcher(
        pool: SqlitePool,
        paths: AppPaths,
        url_title_fetcher: Arc<dyn UrlTitleFetcher>,
    ) -> Self {
        Self {
            pool,
            paths,
            url_title_fetcher,
        }
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

        let mut urls_to_enqueue = BTreeSet::new();

        for context in &input.capture_contexts {
            let persisted = persist_capture_context(
                &self.paths,
                &mut *tx,
                &note_id,
                context,
            )
                .await
                .map_err(|err| err.to_string())?;

            sqlx::query(
                "INSERT INTO capture_contexts (
                    id, note_id, context_type, text_context_id, text_value, url_value, url_label, url_title_status, url_title_error, url_title_fetched_at, source_path, managed_path, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&persisted.id)
            .bind(&persisted.note_id)
            .bind(context_kind_as_str(&persisted.kind))
            .bind(persisted.text_context_id.as_deref())
            .bind(persisted.text_value.as_deref())
            .bind(persisted.url_value.as_deref())
            .bind(persisted.display_label.as_deref())
            .bind(persisted.url_title_status.as_deref())
            .bind(persisted.url_title_error.as_deref())
            .bind(persisted.url_title_fetched_at.as_deref())
            .bind(persisted.source_path.as_deref())
            .bind(persisted.managed_path.as_deref())
            .bind(&persisted.created_at)
            .bind(&persisted.updated_at)
            .execute(&mut *tx)
            .await
            .map_err(|err| err.to_string())?;

            if matches!(persisted.kind, CaptureContextKind::Url)
                && matches!(
                    persisted.url_title_status.as_deref(),
                    Some("pending") | Some("failed")
                )
            {
                if let Some(url) = persisted.url_value.clone() {
                    urls_to_enqueue.insert(url);
                }
            }
        }

        for url in urls_to_enqueue {
            enqueue_url_title_job(&mut *tx, &url, UrlTitleJobStatus::Pending).await?;
        }

        upsert_note_search_index(&mut *tx, &note_id, body).await?;

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
            "SELECT
                capture_contexts.id,
                capture_contexts.note_id,
                capture_contexts.context_type,
                capture_contexts.text_context_id,
                COALESCE(text_contexts.label, capture_contexts.text_value) AS text_value,
                capture_contexts.url_value,
                capture_contexts.url_label,
                capture_contexts.url_title_status,
                capture_contexts.url_title_error,
                capture_contexts.url_title_fetched_at,
                capture_contexts.source_path,
                capture_contexts.managed_path,
                capture_contexts.created_at,
                capture_contexts.updated_at
             FROM capture_contexts
             LEFT JOIN text_contexts ON text_contexts.id = capture_contexts.text_context_id
             WHERE note_id = ?
             ORDER BY capture_contexts.created_at ASC, capture_contexts.id ASC",
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
        let rows = sqlx::query_as::<_, RecentNoteRow>(
            "SELECT id, body, last_opened_at, updated_at
             FROM notes
             ORDER BY COALESCE(last_opened_at, updated_at) DESC, updated_at DESC
             LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|err| err.to_string())?;

        let note_ids = rows.iter().map(|row| row.id.clone()).collect::<Vec<_>>();
        let text_context_labels = self.load_note_text_context_labels(&note_ids).await?;

        Ok(rows
            .into_iter()
            .map(|row| RecentNote {
                text_context_labels: text_context_labels.get(&row.id).cloned().unwrap_or_default(),
                id: row.id,
                preview: preview_text(&row.body),
                last_opened_at: row.last_opened_at,
                updated_at: row.updated_at,
            })
            .collect::<Vec<_>>())
    }

    pub async fn delete_note(&self, note_id: String) -> Result<(), String> {
        sqlx::query("DELETE FROM note_search WHERE note_id = ?")
            .bind(&note_id)
            .execute(&self.pool)
            .await
            .map_err(|err| err.to_string())?;

        sqlx::query("DELETE FROM notes WHERE id = ?")
            .bind(note_id)
            .execute(&self.pool)
            .await
            .map_err(|err| err.to_string())?;

        Ok(())
    }

    pub async fn search_notes(
        &self,
        query: String,
        limit: i64,
    ) -> Result<Vec<NoteSearchResult>, String> {
        let Some(match_query) = build_fts_match_query(&query) else {
            return Ok(Vec::new());
        };

        let rows = sqlx::query_as::<_, NoteSearchRow>(
            "SELECT
                notes.id,
                notes.body,
                COALESCE(
                    NULLIF(snippet(note_search, 1, '<mark>', '</mark>', '...', 18), ''),
                    ''
                ) AS preview,
                notes.last_opened_at,
                notes.updated_at,
                highlight(note_search, 2, '<mark>', '</mark>') AS highlighted_tags
             FROM note_search
             JOIN notes ON notes.id = note_search.note_id
             WHERE note_search MATCH ?
             ORDER BY bm25(note_search), COALESCE(notes.last_opened_at, notes.updated_at) DESC, notes.id ASC
             LIMIT ?",
        )
        .bind(match_query)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|err| err.to_string())?;

        let note_ids = rows.iter().map(|row| row.id.clone()).collect::<Vec<_>>();
        let text_context_labels = self.load_note_text_context_labels(&note_ids).await?;

        Ok(rows
            .into_iter()
            .map(|row| {
                let note_id = row.id.clone();
                row.into_domain(text_context_labels.get(&note_id).cloned().unwrap_or_default())
            })
            .collect::<Vec<_>>())
    }

    async fn load_note_text_context_labels(
        &self,
        note_ids: &[String],
    ) -> Result<HashMap<String, Vec<String>>, String> {
        if note_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let mut query = QueryBuilder::<Sqlite>::new(
            "SELECT
                capture_contexts.note_id,
                COALESCE(text_contexts.label, capture_contexts.text_value) AS text_value
             FROM capture_contexts
             LEFT JOIN text_contexts ON text_contexts.id = capture_contexts.text_context_id
             WHERE capture_contexts.context_type = 'text'
               AND capture_contexts.note_id IN (",
        );

        {
            let mut separated = query.separated(", ");
            for note_id in note_ids {
                separated.push_bind(note_id);
            }
        }

        query.push(")");

        let rows = query
            .build_query_as::<TextContextRow>()
            .fetch_all(&self.pool)
            .await
            .map_err(|err| err.to_string())?;

        let mut grouped = HashMap::<String, Vec<String>>::new();
        let mut seen = HashMap::<String, HashSet<String>>::new();

        for row in rows {
            let Some((label, normalized_label)) = normalized_text_label(row.text_value.as_deref()) else {
                continue;
            };

            if seen
                .entry(row.note_id.clone())
                .or_default()
                .insert(normalized_label)
            {
                grouped.entry(row.note_id).or_default().push(label);
            }
        }

        Ok(grouped)
    }

    pub async fn list_text_context_suggestion_data(
        &self,
    ) -> Result<TextContextSuggestionData, String> {
        let rows = self.load_text_context_rows().await?;
        let mut contexts: BTreeMap<String, KnownTextContextSummary> = BTreeMap::new();
        let mut note_contexts: HashMap<String, BTreeSet<String>> = HashMap::new();

        for row in rows {
            let Some((label, normalized_label)) = normalized_text_label(row.text_value.as_deref())
            else {
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
            .map(
                |((left_normalized, right_normalized), use_count)| TextContextRelationship {
                    left: contexts
                        .get(&left_normalized)
                        .map(|summary| summary.label.clone())
                        .unwrap_or(left_normalized),
                    right: contexts
                        .get(&right_normalized)
                        .map(|summary| summary.label.clone())
                        .unwrap_or(right_normalized),
                    use_count,
                },
            )
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

    pub async fn list_text_context_relationships(
        &self,
    ) -> Result<Vec<TextContextRelationship>, String> {
        self.list_text_context_suggestion_data()
            .await
            .map(|data| data.text_context_relationships)
    }

    pub async fn list_editable_text_contexts(&self) -> Result<Vec<EditableTextContext>, String> {
        sqlx::query_as::<_, EditableTextContextRow>(
            "SELECT
                text_contexts.id,
                text_contexts.label,
                text_contexts.normalized_label,
                COUNT(capture_contexts.id) AS use_count
             FROM text_contexts
             LEFT JOIN capture_contexts ON capture_contexts.text_context_id = text_contexts.id
             GROUP BY text_contexts.id, text_contexts.label, text_contexts.normalized_label
             ORDER BY COUNT(capture_contexts.id) DESC, text_contexts.normalized_label ASC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|err| err.to_string())?
        .into_iter()
        .map(EditableTextContextRow::into_domain)
        .collect::<Result<Vec<_>, _>>()
    }

    pub async fn rename_text_context(
        &self,
        text_context_id: String,
        next_label: String,
    ) -> Result<(), String> {
        let trimmed = next_label.trim();
        if trimmed.is_empty() {
            return Err("text context label cannot be empty".into());
        }

        let normalized_label = trimmed.to_lowercase();
        let mut tx = self.pool.begin().await.map_err(|err| err.to_string())?;

        let existing_duplicate: Option<String> = sqlx::query_scalar(
            "SELECT id FROM text_contexts WHERE normalized_label = ? AND id != ?",
        )
        .bind(&normalized_label)
        .bind(&text_context_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|err| err.to_string())?;

        if existing_duplicate.is_some() {
            return Err("a text context with that label already exists".into());
        }

        let updated_rows = sqlx::query(
            "UPDATE text_contexts
             SET label = ?, normalized_label = ?, updated_at = ?
             WHERE id = ?",
        )
        .bind(trimmed)
        .bind(&normalized_label)
        .bind(now_timestamp())
        .bind(&text_context_id)
        .execute(&mut *tx)
        .await
        .map_err(|err| err.to_string())?
        .rows_affected();

        if updated_rows == 0 {
            return Err("text context not found".into());
        }

        let affected_notes: Vec<(String, String)> = sqlx::query_as(
            "SELECT notes.id, notes.body
             FROM notes
             JOIN capture_contexts ON capture_contexts.note_id = notes.id
             WHERE capture_contexts.text_context_id = ?
             GROUP BY notes.id, notes.body",
        )
        .bind(&text_context_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(|err| err.to_string())?;

        for (note_id, body) in affected_notes {
            upsert_note_search_index(&mut *tx, &note_id, &body).await?;
        }

        tx.commit().await.map_err(|err| err.to_string())
    }

    pub async fn refresh_failed_url_titles(&self) -> Result<(), String> {
        self.enqueue_url_title_refresh(UrlTitleRefreshScope::Failed).await
    }

    pub async fn refresh_all_url_titles(&self) -> Result<(), String> {
        self.enqueue_url_title_refresh(UrlTitleRefreshScope::All).await
    }

    pub async fn process_next_url_title_job(&self) -> Result<bool, String> {
        let mut tx = self.pool.begin().await.map_err(|err| err.to_string())?;
        let job_url: Option<String> = sqlx::query_scalar(
            "SELECT url
             FROM url_title_jobs
             WHERE status = 'pending'
             ORDER BY scheduled_at ASC, url ASC
             LIMIT 1",
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|err| err.to_string())?;

        let Some(url) = job_url else {
            tx.rollback().await.map_err(|err| err.to_string())?;
            return Ok(false);
        };

        sqlx::query(
            "UPDATE url_title_jobs
             SET status = ?,
                 started_at = ?,
                 attempt_count = attempt_count + 1,
                 updated_at = ?
             WHERE url = ?",
        )
        .bind(UrlTitleJobStatus::InProgress.as_str())
        .bind(now_timestamp())
        .bind(now_timestamp())
        .bind(&url)
        .execute(&mut *tx)
        .await
        .map_err(|err| err.to_string())?;
        tx.commit().await.map_err(|err| err.to_string())?;

        let metadata = fetch_url_metadata(&*self.url_title_fetcher, &url).await;
        let mut tx = self.pool.begin().await.map_err(|err| err.to_string())?;
        apply_url_metadata_to_existing_contexts(&mut *tx, &url, &metadata).await?;
        let job_status = if metadata.status == UrlTitleStatus::Failed {
            UrlTitleJobStatus::Failed
        } else {
            UrlTitleJobStatus::Completed
        };
        finalize_url_title_job(&mut *tx, &url, job_status, metadata.error.as_deref()).await?;

        let affected_notes: Vec<(String, String)> = sqlx::query_as(
            "SELECT notes.id, notes.body
             FROM notes
             JOIN capture_contexts ON capture_contexts.note_id = notes.id
             WHERE capture_contexts.context_type = 'url'
               AND capture_contexts.url_value = ?
             GROUP BY notes.id, notes.body",
        )
        .bind(&url)
        .fetch_all(&mut *tx)
        .await
        .map_err(|err| err.to_string())?;

        for (note_id, body) in affected_notes {
            upsert_note_search_index(&mut *tx, &note_id, &body).await?;
        }

        tx.commit().await.map_err(|err| err.to_string())?;
        Ok(true)
    }

    pub async fn lookup_url_labels(&self, urls: Vec<String>) -> Result<Vec<UrlLabelLookup>, String> {
        let mut results = Vec::new();

        for url in urls {
            let row: Option<(Option<String>, Option<String>)> = sqlx::query_as(
                "SELECT url_label, url_title_status
                 FROM capture_contexts
                 WHERE context_type = 'url'
                   AND url_value = ?
                 ORDER BY COALESCE(url_title_fetched_at, updated_at) DESC, id DESC
                 LIMIT 1",
            )
            .bind(&url)
            .fetch_optional(&self.pool)
            .await
            .map_err(|err| err.to_string())?;

            if let Some((display_label, status)) = row {
                results.push(UrlLabelLookup {
                    url,
                    display_label,
                    status: status.unwrap_or_else(|| "pending".into()),
                });
            }
        }

        Ok(results)
    }

    pub async fn export_notes_markdown(&self, note_ids: Vec<String>) -> Result<String, String> {
        if note_ids.is_empty() {
            return Err("at least one note must be selected".into());
        }

        let mut query = QueryBuilder::<Sqlite>::new("SELECT id, body FROM notes WHERE id IN (");
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
                "SELECT
                    capture_contexts.id,
                    capture_contexts.note_id,
                    capture_contexts.context_type,
                    capture_contexts.text_context_id,
                    COALESCE(text_contexts.label, capture_contexts.text_value) AS text_value,
                    capture_contexts.url_value,
                    capture_contexts.url_label,
                    capture_contexts.url_title_status,
                    capture_contexts.url_title_error,
                    capture_contexts.url_title_fetched_at,
                    capture_contexts.source_path,
                    capture_contexts.managed_path,
                    capture_contexts.created_at,
                    capture_contexts.updated_at
                 FROM capture_contexts
                 LEFT JOIN text_contexts ON text_contexts.id = capture_contexts.text_context_id
                 WHERE note_id = ?
                 ORDER BY capture_contexts.created_at ASC, capture_contexts.id ASC",
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
            "SELECT
                capture_contexts.note_id,
                COALESCE(text_contexts.label, capture_contexts.text_value) AS text_value
             FROM capture_contexts
             LEFT JOIN text_contexts ON text_contexts.id = capture_contexts.text_context_id
             WHERE context_type = 'text'
             ORDER BY capture_contexts.created_at ASC, capture_contexts.id ASC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|err| err.to_string())
    }

    async fn enqueue_url_title_refresh(&self, scope: UrlTitleRefreshScope) -> Result<(), String> {
        let mut tx = self.pool.begin().await.map_err(|err| err.to_string())?;
        let rows: Vec<(String,)> = sqlx::query_as(match scope {
            UrlTitleRefreshScope::Failed => {
                "SELECT DISTINCT url_value
                 FROM capture_contexts
                 WHERE context_type = 'url'
                   AND url_value IS NOT NULL
                   AND COALESCE(url_title_status, '') = 'failed'"
            }
            UrlTitleRefreshScope::All => {
                "SELECT DISTINCT url_value
                 FROM capture_contexts
                 WHERE context_type = 'url'
                   AND url_value IS NOT NULL"
            }
        })
        .fetch_all(&mut *tx)
        .await
        .map_err(|err| err.to_string())?;

        for (url,) in rows {
            enqueue_url_title_job(&mut *tx, &url, UrlTitleJobStatus::Pending).await?;
            sqlx::query(
                "UPDATE capture_contexts
                 SET url_title_status = 'pending',
                     url_title_error = NULL,
                     updated_at = ?
                 WHERE context_type = 'url' AND url_value = ?",
            )
            .bind(now_timestamp())
            .bind(&url)
            .execute(&mut *tx)
            .await
            .map_err(|err| err.to_string())?;
        }

        tx.commit().await.map_err(|err| err.to_string())
    }
}

#[derive(Clone, Copy)]
enum UrlTitleRefreshScope {
    Failed,
    All,
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
    text_context_id: Option<String>,
    text_value: Option<String>,
    url_value: Option<String>,
    url_label: Option<String>,
    url_title_status: Option<String>,
    url_title_error: Option<String>,
    url_title_fetched_at: Option<String>,
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
            text_context_id: self.text_context_id,
            text_value: self.text_value,
            url_value: self.url_value,
            display_label: self.url_label,
            url_title_status: self.url_title_status,
            url_title_error: self.url_title_error,
            url_title_fetched_at: self.url_title_fetched_at,
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

#[derive(sqlx::FromRow)]
struct EditableTextContextRow {
    id: String,
    label: String,
    normalized_label: String,
    use_count: i64,
}

impl EditableTextContextRow {
    fn into_domain(self) -> Result<EditableTextContext, String> {
        Ok(EditableTextContext {
            id: self.id,
            label: self.label,
            normalized_label: self.normalized_label,
            use_count: self.use_count,
        })
    }
}

struct KnownTextContextSummary {
    label: String,
    normalized_label: String,
    use_count: i64,
}

#[derive(sqlx::FromRow)]
struct NoteSearchRow {
    id: String,
    body: String,
    preview: String,
    last_opened_at: Option<String>,
    updated_at: String,
    highlighted_tags: String,
}

impl NoteSearchRow {
    fn into_domain(self, text_context_labels: Vec<String>) -> NoteSearchResult {
        NoteSearchResult {
            id: self.id,
            preview: if self.preview.trim().is_empty() {
                preview_text(&self.body)
            } else {
                self.preview
            },
            last_opened_at: self.last_opened_at,
            updated_at: self.updated_at,
            matched_tags: parse_highlighted_tags(&self.highlighted_tags),
            text_context_labels,
        }
    }
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
        "url" => format!(
            "- {}",
            context.url_label.unwrap_or_else(|| context.url_value.unwrap_or_default())
        ),
        "image" => format!(
            "- image: {}",
            context
                .managed_path
                .or(context.source_path)
                .and_then(|path| Path::new(&path)
                    .file_name()
                    .and_then(OsStr::to_str)
                    .map(str::to_string))
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

async fn upsert_note_search_index(
    connection: &mut sqlx::SqliteConnection,
    note_id: &str,
    body: &str,
) -> Result<(), String> {
    let tags = searchable_tag_text(connection, note_id).await?;

    sqlx::query("DELETE FROM note_search WHERE note_id = ?")
        .bind(note_id)
        .execute(&mut *connection)
        .await
        .map_err(|err| err.to_string())?;

    sqlx::query("INSERT INTO note_search (note_id, body, tags) VALUES (?, ?, ?)")
        .bind(note_id)
        .bind(body)
        .bind(tags)
        .execute(&mut *connection)
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

async fn searchable_tag_text(
    connection: &mut sqlx::SqliteConnection,
    note_id: &str,
) -> Result<String, String> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT
            CASE
                WHEN capture_contexts.context_type = 'text' THEN trim(COALESCE(text_contexts.label, capture_contexts.text_value, ''))
                WHEN capture_contexts.context_type = 'url' THEN trim(COALESCE(capture_contexts.url_label, capture_contexts.url_value, ''))
                ELSE ''
            END AS value
         FROM capture_contexts
         LEFT JOIN text_contexts ON text_contexts.id = capture_contexts.text_context_id
         WHERE capture_contexts.note_id = ?
           AND capture_contexts.context_type IN ('text', 'url')
         ORDER BY capture_contexts.created_at ASC, capture_contexts.id ASC",
    )
    .bind(note_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|err| err.to_string())?;

    Ok(rows
        .into_iter()
        .map(|(value,)| value)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(" ||| "))
}

fn build_fts_match_query(query: &str) -> Option<String> {
    let tokens = query
        .split(|character: char| !character.is_alphanumeric())
        .filter(|token| !token.is_empty())
        .map(|token| format!("\"{}\"*", token.replace('"', "\"\"")))
        .collect::<Vec<_>>();

    if tokens.is_empty() {
        None
    } else {
        Some(tokens.join(" "))
    }
}

fn parse_highlighted_tags(value: &str) -> Vec<MatchedTag> {
    value
        .split(" ||| ")
        .filter_map(|tag| {
            let trimmed = tag.trim();
            if trimmed.is_empty() || !trimmed.contains("<mark>") {
                return None;
            }

            Some(MatchedTag {
                text: trimmed.to_string(),
            })
        })
        .collect()
}

async fn persist_capture_context(
    paths: &AppPaths,
    connection: &mut sqlx::SqliteConnection,
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
            text_context_id: Some(find_or_create_text_context(connection, text.trim()).await?),
            text_value: None,
            url_value: None,
            display_label: None,
            url_title_status: None,
            url_title_error: None,
            url_title_fetched_at: None,
            source_path: None,
            managed_path: None,
            created_at: now.clone(),
            updated_at: now,
        },
        CaptureContextInput::Url { url } => {
            let trimmed_url = url.trim().to_string();
            let metadata = match find_existing_url_metadata(connection, &trimmed_url).await? {
                Some(existing) if matches!(
                    existing.status,
                    UrlTitleStatus::Resolved | UrlTitleStatus::EmptyTitle | UrlTitleStatus::NonHtml
                ) => existing,
                _ => pending_url_title_metadata(),
            };

            CaptureContext {
                id,
                note_id: note_id.to_string(),
                kind: CaptureContextKind::Url,
                text_context_id: None,
                text_value: None,
                url_value: Some(trimmed_url),
                display_label: metadata.display_label,
                url_title_status: Some(metadata.status.as_str().to_string()),
                url_title_error: metadata.error,
                url_title_fetched_at: metadata.fetched_at,
                source_path: None,
                managed_path: None,
                created_at: now.clone(),
                updated_at: now,
            }
        }
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
                text_context_id: None,
                text_value: None,
                url_value: None,
                display_label: None,
                url_title_status: None,
                url_title_error: None,
                url_title_fetched_at: None,
                source_path: Some(source_path.clone()),
                managed_path: Some(managed_path.display().to_string()),
                created_at: now.clone(),
                updated_at: now,
            }
        }
    };

    Ok(context)
}

async fn find_or_create_text_context(
    connection: &mut sqlx::SqliteConnection,
    label: &str,
) -> Result<String, std::io::Error> {
    let trimmed = label.trim();
    let normalized_label = trimmed.to_lowercase();

    if let Some(existing_id) =
        sqlx::query_scalar::<_, String>("SELECT id FROM text_contexts WHERE normalized_label = ?")
            .bind(&normalized_label)
            .fetch_optional(&mut *connection)
            .await
            .map_err(sqlx_to_io)?
    {
        return Ok(existing_id);
    }

    let id = Uuid::new_v4().to_string();
    let now = now_timestamp();

    sqlx::query(
        "INSERT INTO text_contexts (id, label, normalized_label, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(trimmed)
    .bind(&normalized_label)
    .bind(&now)
    .bind(&now)
    .execute(&mut *connection)
    .await
    .map_err(sqlx_to_io)?;

    Ok(id)
}

fn sqlx_to_io(error: sqlx::Error) -> std::io::Error {
    std::io::Error::other(error.to_string())
}

fn pending_url_title_metadata() -> UrlTitleMetadata {
    UrlTitleMetadata {
        display_label: None,
        status: UrlTitleStatus::Pending,
        error: None,
        fetched_at: None,
    }
}

fn parse_html_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let title_start = lower.find("<title")?;
    let content_start = lower[title_start..].find('>')? + title_start + 1;
    let title_end = lower[content_start..].find("</title>")? + content_start;
    let title = html[content_start..title_end].trim();

    if title.is_empty() {
        None
    } else {
        Some(title.split_whitespace().collect::<Vec<_>>().join(" "))
    }
}

async fn find_existing_url_metadata(
    connection: &mut sqlx::SqliteConnection,
    url: &str,
) -> Result<Option<UrlTitleMetadata>, std::io::Error> {
    let row: Option<(Option<String>, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT url_label, url_title_status, url_title_error, url_title_fetched_at
         FROM capture_contexts
         WHERE context_type = 'url'
           AND url_value = ?
           AND url_title_status IS NOT NULL
         ORDER BY COALESCE(url_title_fetched_at, updated_at) DESC, id DESC
         LIMIT 1",
    )
    .bind(url)
    .fetch_optional(&mut *connection)
    .await
    .map_err(sqlx_to_io)?;

    Ok(row.and_then(|(display_label, status, error, fetched_at)| {
        Some(UrlTitleMetadata {
            display_label,
            status: UrlTitleStatus::from_db(status.as_deref()?)?,
            error,
            fetched_at,
        })
    }))
}

async fn apply_url_metadata_to_existing_contexts(
    connection: &mut sqlx::SqliteConnection,
    url: &str,
    metadata: &UrlTitleMetadata,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE capture_contexts
         SET url_label = ?, url_title_status = ?, url_title_error = ?, url_title_fetched_at = ?, updated_at = ?
         WHERE context_type = 'url' AND url_value = ?",
    )
    .bind(metadata.display_label.as_deref())
    .bind(metadata.status.as_str())
    .bind(metadata.error.as_deref())
    .bind(metadata.fetched_at.as_deref())
    .bind(now_timestamp())
    .bind(url)
    .execute(&mut *connection)
    .await
    .map_err(|err| err.to_string())?;

    Ok(())
}

async fn enqueue_url_title_job(
    connection: &mut sqlx::SqliteConnection,
    url: &str,
    status: UrlTitleJobStatus,
) -> Result<(), String> {
    let now = now_timestamp();

    sqlx::query(
        "INSERT INTO url_title_jobs (
            url, status, attempt_count, last_error, scheduled_at, started_at, finished_at, created_at, updated_at
         ) VALUES (?, ?, 0, NULL, ?, NULL, NULL, ?, ?)
         ON CONFLICT(url) DO UPDATE SET
            status = excluded.status,
            last_error = NULL,
            scheduled_at = excluded.scheduled_at,
            started_at = NULL,
            finished_at = NULL,
            updated_at = excluded.updated_at",
    )
    .bind(url)
    .bind(status.as_str())
    .bind(&now)
    .bind(&now)
    .bind(&now)
    .execute(&mut *connection)
    .await
    .map_err(|err| err.to_string())?;

    Ok(())
}

async fn finalize_url_title_job(
    connection: &mut sqlx::SqliteConnection,
    url: &str,
    status: UrlTitleJobStatus,
    last_error: Option<&str>,
) -> Result<(), String> {
    let now = now_timestamp();

    sqlx::query(
        "UPDATE url_title_jobs
         SET status = ?, last_error = ?, finished_at = ?, updated_at = ?
         WHERE url = ?",
    )
    .bind(status.as_str())
    .bind(last_error)
    .bind(&now)
    .bind(&now)
    .bind(url)
    .execute(&mut *connection)
    .await
    .map_err(|err| err.to_string())?;

    Ok(())
}

async fn fetch_url_metadata(fetcher: &dyn UrlTitleFetcher, url: &str) -> UrlTitleMetadata {
    let fetched_at = now_timestamp();

    match fetcher.fetch(url).await {
        UrlTitleFetchResult::Resolved(title) => UrlTitleMetadata {
            display_label: Some(title),
            status: UrlTitleStatus::Resolved,
            error: None,
            fetched_at: Some(fetched_at),
        },
        UrlTitleFetchResult::EmptyTitle => UrlTitleMetadata {
            display_label: None,
            status: UrlTitleStatus::EmptyTitle,
            error: None,
            fetched_at: Some(fetched_at),
        },
        UrlTitleFetchResult::NonHtml => UrlTitleMetadata {
            display_label: None,
            status: UrlTitleStatus::NonHtml,
            error: None,
            fetched_at: Some(fetched_at),
        },
        UrlTitleFetchResult::Failed(error) => UrlTitleMetadata {
            display_label: None,
            status: UrlTitleStatus::Failed,
            error: Some(error),
            fetched_at: Some(fetched_at),
        },
    }
}

#[derive(Clone)]
struct UrlTitleMetadata {
    display_label: Option<String>,
    status: UrlTitleStatus,
    error: Option<String>,
    fetched_at: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum UrlTitleStatus {
    Pending,
    Resolved,
    EmptyTitle,
    NonHtml,
    Failed,
}

impl UrlTitleStatus {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Resolved => "resolved",
            Self::EmptyTitle => "empty_title",
            Self::NonHtml => "non_html",
            Self::Failed => "failed",
        }
    }

    fn from_db(value: &str) -> Option<Self> {
        match value {
            "pending" => Some(Self::Pending),
            "resolved" => Some(Self::Resolved),
            "empty_title" => Some(Self::EmptyTitle),
            "non_html" => Some(Self::NonHtml),
            "failed" => Some(Self::Failed),
            _ => None,
        }
    }
}

#[derive(Clone, Copy)]
enum UrlTitleJobStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}

impl UrlTitleJobStatus {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::InProgress => "in_progress",
            Self::Completed => "completed",
            Self::Failed => "failed",
        }
    }
}

pub(crate) enum UrlTitleFetchResult {
    Resolved(String),
    EmptyTitle,
    NonHtml,
    Failed(String),
}

pub(crate) type UrlTitleFetchFuture<'a> =
    Pin<Box<dyn Future<Output = UrlTitleFetchResult> + Send + 'a>>;

pub(crate) trait UrlTitleFetcher: Send + Sync {
    fn fetch<'a>(&'a self, url: &'a str) -> UrlTitleFetchFuture<'a>;
}

#[derive(Default)]
struct HttpUrlTitleFetcher {
    client: reqwest::Client,
}

impl UrlTitleFetcher for HttpUrlTitleFetcher {
    fn fetch<'a>(&'a self, url: &'a str) -> UrlTitleFetchFuture<'a> {
        Box::pin(async move {
            let response = match self.client.get(url).send().await {
                Ok(response) => response,
                Err(error) => return UrlTitleFetchResult::Failed(error.to_string()),
            };

            let is_html = response
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .map(|value| value.to_ascii_lowercase().contains("text/html"))
                .unwrap_or(false);
            if !is_html {
                return UrlTitleFetchResult::NonHtml;
            }

            let html = match response.text().await {
                Ok(html) => html,
                Err(error) => return UrlTitleFetchResult::Failed(error.to_string()),
            };

            match parse_html_title(&html) {
                Some(title) => UrlTitleFetchResult::Resolved(title),
                None => UrlTitleFetchResult::EmptyTitle,
            }
        })
    }
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
    use std::collections::VecDeque;
    use std::fs;
    use std::sync::{Arc, Mutex};

    use tempfile::TempDir;

    use crate::app_state::build_app_paths;
    use crate::db::schema::connect;
    use crate::domain::capture_context::CaptureContextInput;

    use super::{NoteRepository, SaveNoteInput, UrlTitleFetchFuture, UrlTitleFetchResult, UrlTitleFetcher};

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
    async fn save_note_enqueues_pending_url_title_jobs_without_fetching_inline() {
        let repo = test_repo_with_url_fetcher(vec![]).await;
        let saved = repo
            .save_note(SaveNoteInput {
                note_id: None,
                body: "URL note".into(),
                capture_contexts: vec![CaptureContextInput::Url {
                    url: "https://example.com/article".into(),
                }],
                request_analysis: false,
            })
            .await
            .unwrap();

        let row: (Option<String>, String) = sqlx::query_as(
            "SELECT url_label, url_title_status FROM capture_contexts WHERE note_id = ?",
        )
        .bind(&saved.id)
        .fetch_one(&repo.pool)
        .await
        .unwrap();

        assert_eq!(row.0, None);
        assert_eq!(row.1, "pending");

        let job_row: (String, i64) = sqlx::query_as(
            "SELECT status, attempt_count FROM url_title_jobs WHERE url = ?",
        )
        .bind("https://example.com/article")
        .fetch_one(&repo.pool)
        .await
        .unwrap();

        assert_eq!(job_row.0, "pending");
        assert_eq!(job_row.1, 0);
    }

    #[tokio::test]
    async fn reuses_existing_url_title_metadata_for_duplicate_urls() {
        let repo = test_repo_with_url_fetcher(vec![UrlTitleFetchResult::Resolved("Example Article".into())]).await;
        repo.save_note(SaveNoteInput {
            note_id: Some("first-note".into()),
            body: "First".into(),
            capture_contexts: vec![CaptureContextInput::Url {
                url: "https://example.com/article".into(),
            }],
            request_analysis: false,
        })
        .await
        .unwrap();
        repo.process_next_url_title_job().await.unwrap();

        let saved = repo
            .save_note(SaveNoteInput {
                note_id: Some("second-note".into()),
                body: "Second".into(),
                capture_contexts: vec![CaptureContextInput::Url {
                    url: "https://example.com/article".into(),
                }],
                request_analysis: false,
            })
            .await
            .unwrap();

        let url_context = saved
            .capture_contexts
            .into_iter()
            .find(|context| matches!(context.kind, crate::domain::capture_context::CaptureContextKind::Url))
            .unwrap();

        assert_eq!(url_context.display_label.as_deref(), Some("Example Article"));
    }

    #[tokio::test]
    async fn refresh_failed_url_titles_only_updates_failed_urls() {
        let repo = test_repo_with_url_fetcher(vec![
            UrlTitleFetchResult::Failed("timeout".into()),
            UrlTitleFetchResult::Resolved("Recovered Title".into()),
        ])
        .await;

        repo.save_note(SaveNoteInput {
            note_id: Some("failed-note".into()),
            body: "Failed".into(),
            capture_contexts: vec![CaptureContextInput::Url {
                url: "https://example.com/failed".into(),
            }],
            request_analysis: false,
        })
        .await
        .unwrap();

        repo.process_next_url_title_job().await.unwrap();
        repo.refresh_failed_url_titles().await.unwrap();
        repo.process_next_url_title_job().await.unwrap();

        let row: (Option<String>, String) = sqlx::query_as(
            "SELECT url_label, url_title_status FROM capture_contexts WHERE note_id = ?",
        )
        .bind("failed-note")
        .fetch_one(&repo.pool)
        .await
        .unwrap();

        assert_eq!(row.0.as_deref(), Some("Recovered Title"));
        assert_eq!(row.1, "resolved");
    }

    #[tokio::test]
    async fn refresh_all_url_titles_replaces_existing_labels() {
        let repo = test_repo_with_url_fetcher(vec![
            UrlTitleFetchResult::Resolved("Old Title".into()),
            UrlTitleFetchResult::Resolved("New Title".into()),
        ])
        .await;

        repo.save_note(SaveNoteInput {
            note_id: Some("refresh-note".into()),
            body: "Refresh".into(),
            capture_contexts: vec![CaptureContextInput::Url {
                url: "https://example.com/refresh".into(),
            }],
            request_analysis: false,
        })
        .await
        .unwrap();

        repo.process_next_url_title_job().await.unwrap();
        repo.refresh_all_url_titles().await.unwrap();
        repo.process_next_url_title_job().await.unwrap();

        let row: (Option<String>, String) = sqlx::query_as(
            "SELECT url_label, url_title_status FROM capture_contexts WHERE note_id = ?",
        )
        .bind("refresh-note")
        .fetch_one(&repo.pool)
        .await
        .unwrap();

        assert_eq!(row.0.as_deref(), Some("New Title"));
        assert_eq!(row.1, "resolved");
    }

    #[tokio::test]
    async fn processing_queued_url_title_job_updates_saved_contexts() {
        let repo = test_repo_with_url_fetcher(vec![UrlTitleFetchResult::Resolved("Example Article".into())]).await;
        let saved = repo
            .save_note(SaveNoteInput {
                note_id: Some("queued-note".into()),
                body: "Queued".into(),
                capture_contexts: vec![CaptureContextInput::Url {
                    url: "https://example.com/article".into(),
                }],
                request_analysis: false,
            })
            .await
            .unwrap();

        assert_eq!(saved.capture_contexts[0].display_label, None);
        repo.process_next_url_title_job().await.unwrap();

        let row: (Option<String>, String) = sqlx::query_as(
            "SELECT url_label, url_title_status FROM capture_contexts WHERE note_id = ?",
        )
        .bind("queued-note")
        .fetch_one(&repo.pool)
        .await
        .unwrap();

        assert_eq!(row.0.as_deref(), Some("Example Article"));
        assert_eq!(row.1, "resolved");
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

    #[tokio::test]
    async fn shared_text_contexts_are_reused_across_notes() {
        let repo = test_repo().await;

        let first = repo
            .save_note(SaveNoteInput {
                note_id: Some("note-one".into()),
                body: "First".into(),
                capture_contexts: vec![CaptureContextInput::Text {
                    text: "Cryptography".into(),
                }],
                request_analysis: false,
            })
            .await
            .unwrap();
        let second = repo
            .save_note(SaveNoteInput {
                note_id: Some("note-two".into()),
                body: "Second".into(),
                capture_contexts: vec![CaptureContextInput::Text {
                    text: "cryptography ".into(),
                }],
                request_analysis: false,
            })
            .await
            .unwrap();

        let text_context_rows: Vec<(String, String, String)> =
            sqlx::query_as("SELECT id, label, normalized_label FROM text_contexts")
                .fetch_all(&repo.pool)
                .await
                .unwrap();
        assert_eq!(text_context_rows.len(), 1);
        assert_eq!(text_context_rows[0].1, "Cryptography");
        assert_eq!(text_context_rows[0].2, "cryptography");

        let first_refs: Vec<Option<String>> =
            sqlx::query_scalar("SELECT text_context_id FROM capture_contexts WHERE note_id = ?")
                .bind(&first.id)
                .fetch_all(&repo.pool)
                .await
                .unwrap();
        let second_refs: Vec<Option<String>> =
            sqlx::query_scalar("SELECT text_context_id FROM capture_contexts WHERE note_id = ?")
                .bind(&second.id)
                .fetch_all(&repo.pool)
                .await
                .unwrap();

        assert_eq!(first_refs.len(), 1);
        assert_eq!(second_refs.len(), 1);
        assert_eq!(first_refs[0], second_refs[0]);
    }

    #[tokio::test]
    async fn rename_text_context_updates_all_references_and_search_data() {
        let repo = test_repo().await;

        repo.save_note(SaveNoteInput {
            note_id: Some("note-one".into()),
            body: "Shared note one".into(),
            capture_contexts: vec![CaptureContextInput::Text {
                text: "Cryptography".into(),
            }],
            request_analysis: false,
        })
        .await
        .unwrap();
        repo.save_note(SaveNoteInput {
            note_id: Some("note-two".into()),
            body: "Shared note two".into(),
            capture_contexts: vec![CaptureContextInput::Text {
                text: "cryptography".into(),
            }],
            request_analysis: false,
        })
        .await
        .unwrap();

        let context_id: String =
            sqlx::query_scalar("SELECT id FROM text_contexts WHERE normalized_label = 'cryptography'")
                .fetch_one(&repo.pool)
                .await
                .unwrap();

        repo.rename_text_context(context_id, "Applied cryptography".into())
            .await
            .unwrap();

        let renamed = repo.list_known_text_contexts().await.unwrap();
        assert_eq!(renamed.len(), 1);
        assert_eq!(renamed[0].label, "Applied cryptography");
        assert_eq!(renamed[0].normalized_label, "applied cryptography");
        assert_eq!(renamed[0].use_count, 2);

        let reopened = repo.get_note("note-one".into()).await.unwrap().unwrap();
        assert_eq!(reopened.capture_contexts[0].text_value.as_deref(), Some("Applied cryptography"));

        let results = repo.search_notes("applied".into(), 10).await.unwrap();
        assert_eq!(results.len(), 2);
        assert!(results
            .iter()
            .all(|item| item.matched_tags.iter().any(|tag| tag.text.contains("Applied"))));
    }

    #[tokio::test]
    async fn rename_text_context_rejects_duplicate_normalized_label() {
        let repo = test_repo().await;

        repo.save_note(SaveNoteInput {
            note_id: None,
            body: "One".into(),
            capture_contexts: vec![CaptureContextInput::Text {
                text: "Cryptography".into(),
            }],
            request_analysis: false,
        })
        .await
        .unwrap();
        repo.save_note(SaveNoteInput {
            note_id: None,
            body: "Two".into(),
            capture_contexts: vec![CaptureContextInput::Text {
                text: "Number Theory".into(),
            }],
            request_analysis: false,
        })
        .await
        .unwrap();

        let context_id: String =
            sqlx::query_scalar("SELECT id FROM text_contexts WHERE normalized_label = 'cryptography'")
                .fetch_one(&repo.pool)
                .await
                .unwrap();

        let error = repo
            .rename_text_context(context_id, " number theory ".into())
            .await
            .unwrap_err();

        assert!(error.contains("already exists"));
    }

    #[tokio::test]
    async fn search_notes_matches_body_text_and_tags() {
        let repo = test_repo().await;
        repo.save_note(SaveNoteInput {
            note_id: Some("note-body-hit".into()),
            body: "Practical cipher notes for study".into(),
            capture_contexts: vec![
                CaptureContextInput::Text {
                    text: "classical cryptography".into(),
                },
                CaptureContextInput::Url {
                    url: "https://cipher.example/reference".into(),
                },
            ],
            request_analysis: false,
        })
        .await
        .unwrap();
        repo.save_note(SaveNoteInput {
            note_id: Some("note-no-hit".into()),
            body: "Combinatorics reminder".into(),
            capture_contexts: vec![CaptureContextInput::Text {
                text: "graph theory".into(),
            }],
            request_analysis: false,
        })
        .await
        .unwrap();

        let results = repo.search_notes("cipher".into(), 10).await.unwrap();

        assert_eq!(results[0].id, "note-body-hit");
        assert!(results[0].preview.contains("mark"));
        assert!(results[0]
            .matched_tags
            .iter()
            .any(|tag| tag.text.contains("cipher")));
    }

    #[tokio::test]
    async fn search_notes_excludes_deleted_notes() {
        let repo = test_repo().await;
        let note = repo
            .save_note(SaveNoteInput {
                note_id: Some("note-delete".into()),
                body: "Seed search note".into(),
                capture_contexts: vec![CaptureContextInput::Text {
                    text: "seed".into(),
                }],
                request_analysis: false,
            })
            .await
            .unwrap();

        repo.delete_note(note.id).await.unwrap();

        let results = repo.search_notes("seed".into(), 10).await.unwrap();

        assert!(results.is_empty());
    }

    async fn test_repo() -> NoteRepository {
        test_repo_with_url_fetcher(vec![UrlTitleFetchResult::Failed("network disabled".into())]).await
    }

    async fn test_repo_with_url_fetcher(results: Vec<UrlTitleFetchResult>) -> NoteRepository {
        let temp = TempDir::new().unwrap();
        let root = temp.keep();
        let paths = build_app_paths(&root);
        fs::create_dir_all(&paths.images_dir).unwrap();
        let pool = connect(&paths).await.unwrap();

        NoteRepository::new_with_url_title_fetcher(pool, paths, Arc::new(StubUrlTitleFetcher::new(results)))
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

    struct StubUrlTitleFetcher {
        results: Mutex<VecDeque<UrlTitleFetchResult>>,
    }

    impl StubUrlTitleFetcher {
        fn new(results: Vec<UrlTitleFetchResult>) -> Self {
            Self {
                results: Mutex::new(results.into()),
            }
        }
    }

    impl UrlTitleFetcher for StubUrlTitleFetcher {
        fn fetch<'a>(&'a self, _url: &'a str) -> UrlTitleFetchFuture<'a> {
            Box::pin(async move {
                self.results
                    .lock()
                    .unwrap()
                    .pop_front()
                    .unwrap_or(UrlTitleFetchResult::Failed("missing stub response".into()))
            })
        }
    }
}
