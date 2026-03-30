type HistoryItem = {
  id: string;
  preview: string;
  updatedAt: string;
};

type SearchResultItem = {
  id: string;
  preview: string;
  updatedAt: string;
  matchedTags: { text: string }[];
};

type HistoryPanelProps = {
  searchQuery: string;
  searchResults: SearchResultItem[];
  activeSearchIndex: number;
  items: HistoryItem[];
  active: boolean;
  selectedNoteIds: string[];
  onDelete: (noteId: string) => void;
  onExport: () => void;
  onOpen: (noteId: string) => void;
  onSearchQueryChange: (value: string) => void;
  onSearchActiveIndexChange: (index: number) => void;
  onSelectionChange: (noteId: string, checked: boolean) => void;
};

export function HistoryPanel({
  searchQuery,
  searchResults,
  activeSearchIndex,
  items,
  active,
  selectedNoteIds,
  onDelete,
  onExport,
  onOpen,
  onSearchQueryChange,
  onSearchActiveIndexChange,
  onSelectionChange,
}: HistoryPanelProps) {
  const selected = new Set(selectedNoteIds);
  const showingSearchResults = searchQuery.trim().length > 0;

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showingSearchResults || searchResults.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      onSearchActiveIndexChange((activeSearchIndex + 1) % searchResults.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      onSearchActiveIndexChange(
        (activeSearchIndex - 1 + searchResults.length) % searchResults.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const activeResult = searchResults[activeSearchIndex] ?? searchResults[0];
      if (activeResult) {
        onOpen(activeResult.id);
      }
    }
  }

  return (
    <section
      aria-hidden={!active}
      aria-label="Notes panel"
      className="panel panel-bottom"
      data-active={active}
      data-size="capped"
    >
      <div className="history-header">
        <p className="panel-subtle-title">Notes</p>
        <label className="history-search">
          <span className="sr-only">Search notes</span>
          <input
            aria-label="Search notes"
            disabled={!active}
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </label>
        <button
          className="history-export"
          type="button"
          disabled={!active || selected.size === 0 || showingSearchResults}
          onClick={onExport}
        >
          Export selected
        </button>
      </div>
      {showingSearchResults ? (
        <div aria-label="Notes list" className="history-scroll-region" tabIndex={active ? 0 : -1}>
          <ul className="history-list">
            {searchResults.map((item, index) => (
              <li key={item.id}>
                <button
                  aria-label={`Open search result ${index + 1}`}
                  className="history-search-result"
                  data-active={active && index === activeSearchIndex}
                  disabled={!active}
                  type="button"
                  onMouseEnter={() => onSearchActiveIndexChange(index)}
                  onClick={() => onOpen(item.id)}
                >
                  <span
                    className="history-search-result__preview"
                    dangerouslySetInnerHTML={{ __html: item.preview }}
                  />
                  {item.matchedTags.length > 0 ? (
                    <span className="history-search-result__tags">
                      {item.matchedTags.map((tag) => (
                        <span
                          key={`${item.id}-${tag.text}`}
                          className="history-search-result__tag"
                          dangerouslySetInnerHTML={{ __html: tag.text }}
                        />
                      ))}
                    </span>
                  ) : null}
                  <time>{item.updatedAt}</time>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : items.length > 0 ? (
        <div aria-label="Notes list" className="history-scroll-region" tabIndex={active ? 0 : -1}>
          <ul className="history-list">
            {items.map((item) => (
              <li key={item.id}>
                <div className="history-row">
                  <label className="history-select">
                    <input
                      aria-label={`Select ${item.preview}`}
                      checked={selected.has(item.id)}
                      disabled={!active}
                      type="checkbox"
                      onChange={(event) => onSelectionChange(item.id, event.target.checked)}
                    />
                  </label>
                  <button
                    className="history-item"
                    disabled={!active}
                    type="button"
                    onClick={() => onOpen(item.id)}
                  >
                    <span>{item.preview}</span>
                    <time>{item.updatedAt}</time>
                  </button>
                  <button
                    aria-label={`Delete ${item.preview}`}
                    className="history-delete"
                    disabled={!active}
                    type="button"
                    onClick={() => onDelete(item.id)}
                  >
                    x
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
