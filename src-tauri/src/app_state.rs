use std::path::{Path, PathBuf};
use std::{fs, sync::Arc};

use tauri::{AppHandle, Manager, Runtime};
use tokio::time::{sleep, Duration};

use crate::db::repository::NoteRepository;
use crate::db::schema::connect;
use sqlx::SqlitePool;

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub db_path: PathBuf,
    pub images_dir: PathBuf,
}

#[derive(Clone)]
pub struct AppState {
    pub paths: Arc<AppPaths>,
    pub pool: SqlitePool,
    pub repository: NoteRepository,
}

impl AppState {
    pub fn initialize<R: Runtime>(app: &AppHandle<R>) -> Result<Self, Box<dyn std::error::Error>> {
        let app_data_dir = app.path().app_data_dir()?;
        let paths = build_app_paths(&app_data_dir);

        if let Some(parent) = paths.db_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::create_dir_all(&paths.images_dir)?;
        let pool = tauri::async_runtime::block_on(connect(&paths))?;
        let repository = NoteRepository::new(pool.clone(), paths.clone());
        spawn_url_title_worker(repository.clone());

        Ok(Self {
            paths: Arc::new(paths),
            pool,
            repository,
        })
    }

    pub fn from_parts(paths: AppPaths, pool: SqlitePool) -> Self {
        let repository = NoteRepository::new(pool.clone(), paths.clone());

        Self {
            paths: Arc::new(paths),
            pool,
            repository,
        }
    }
}

fn spawn_url_title_worker(repository: NoteRepository) {
    tauri::async_runtime::spawn(async move {
        loop {
            match repository.process_next_url_title_job().await {
                Ok(true) => {}
                Ok(false) => sleep(Duration::from_millis(250)).await,
                Err(error) => {
                    log::error!("url title worker failed: {error}");
                    sleep(Duration::from_millis(1000)).await;
                }
            }
        }
    });
}

pub fn build_app_paths(root: &Path) -> AppPaths {
    AppPaths {
        db_path: root.join("seton.sqlite"),
        images_dir: root.join("capture-contexts").join("images"),
    }
}

#[cfg(test)]
mod tests {
    use super::build_app_paths;
    use std::path::PathBuf;

    #[test]
    fn builds_db_path_under_app_data_dir() {
        let root = PathBuf::from("/tmp/seton-test");
        let paths = build_app_paths(&root);

        assert!(paths.db_path.ends_with("seton.sqlite"));
        assert!(paths.images_dir.ends_with("capture-contexts/images"));
    }
}
