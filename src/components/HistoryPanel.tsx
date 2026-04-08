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

type VisibleHistoryItem = {
  id: string;
  preview: string;
  updatedAt: string;
  matchedTags: { text: string }[];
  openLabel: string;
  selectionLabel: string;
  deleteLabel: string;
};

type HistoryPanelProps = {
  searchQuery: string;
  searchResults: SearchResultItem[];
  activeSearchIndex: number;
  filterLabel?: string | null;
  items: HistoryItem[];
  active: boolean;
  selectedNoteIds: string[];
  onClearFilter?: () => void;
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
  filterLabel,
  items,
  active,
  selectedNoteIds,
  onClearFilter,
  onDelete,
  onExport,
  onOpen,
  onSearchQueryChange,
  onSearchActiveIndexChange,
  onSelectionChange,
}: HistoryPanelProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selected = new Set(selectedNoteIds);
  const showingSearchResults = searchQuery.trim().length > 0;
  const visibleItems: VisibleHistoryItem[] = showingSearchResults
    ? searchResults.map((item, index) => ({
        id: item.id,
        preview: item.preview,
        updatedAt: item.updatedAt,
        matchedTags: item.matchedTags,
        openLabel: `Open note ${index + 1}`,
        selectionLabel: `Select search result ${index + 1}`,
        deleteLabel: `Delete search result ${index + 1}`,
      }))
    : items.map((item) => ({
        id: item.id,
        preview: item.preview,
        updatedAt: item.updatedAt,
        matchedTags: [],
        openLabel: `Open note ${item.preview}`,
        selectionLabel: `Select ${item.preview}`,
        deleteLabel: `Delete ${item.preview}`,
      }));

  useEffect(() => {
    if (active) {
      searchInputRef.current?.focus();
    }
  }, [active]);

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (visibleItems.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      onSearchActiveIndexChange((activeSearchIndex + 1) % visibleItems.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      onSearchActiveIndexChange(
        (activeSearchIndex - 1 + visibleItems.length) % visibleItems.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const activeResult = visibleItems[activeSearchIndex] ?? visibleItems[0];
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
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </label>
        <button
          className="history-export"
          type="button"
          disabled={!active || selected.size === 0}
          onClick={onExport}
        >
          Export selected
        </button>
      </div>
      {filterLabel ? (
        <div className="history-filter">
          <span>{filterLabel}</span>
          <button
            aria-label="Clear graph filter"
            className="history-filter__clear"
            disabled={!active}
            type="button"
            onClick={onClearFilter}
          >
            clear
          </button>
        </div>
      ) : null}
      {visibleItems.length > 0 ? (
        <div aria-label="Notes list" className="history-scroll-region" tabIndex={active ? 0 : -1}>
          <ul className="history-list">
            {visibleItems.map((item, index) => (
              <li key={item.id}>
                <div className="history-row">
                  <label className="history-select">
                    <input
                      aria-label={item.selectionLabel}
                      checked={selected.has(item.id)}
                      disabled={!active}
                      type="checkbox"
                      onChange={(event) => onSelectionChange(item.id, event.target.checked)}
                    />
                  </label>
                  <button
                    aria-label={item.openLabel}
                    className="history-item"
                    data-active={active && index === activeSearchIndex}
                    disabled={!active}
                    type="button"
                    onMouseEnter={() => onSearchActiveIndexChange(index)}
                    onClick={() => onOpen(item.id)}
                  >
                    <span
                      className="history-item__content"
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
                  <button
                    aria-label={item.deleteLabel}
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
import { useEffect, useRef } from "react";
