type HistoryItem = {
  id: string;
  preview: string;
  updatedAt: string;
};

type HistoryPanelProps = {
  items: HistoryItem[];
  active: boolean;
  selectedNoteIds: string[];
  onDelete: (noteId: string) => void;
  onExport: () => void;
  onOpen: (noteId: string) => void;
  onSelectionChange: (noteId: string, checked: boolean) => void;
};

export function HistoryPanel({
  items,
  active,
  selectedNoteIds,
  onDelete,
  onExport,
  onOpen,
  onSelectionChange,
}: HistoryPanelProps) {
  const selected = new Set(selectedNoteIds);

  return (
    <section
      aria-label="Notes panel"
      className="panel panel-bottom"
      data-active={active}
      data-size="capped"
    >
      <div className="history-header">
        <p className="panel-subtle-title">Notes</p>
        <button
          className="history-export"
          type="button"
          disabled={selected.size === 0}
          onClick={onExport}
        >
          Export selected
        </button>
      </div>
      {items.length > 0 ? (
        <div aria-label="Notes list" className="history-scroll-region" tabIndex={0}>
          <ul className="history-list">
            {items.map((item) => (
              <li key={item.id}>
                <div className="history-row">
                  <label className="history-select">
                    <input
                      aria-label={`Select ${item.preview}`}
                      checked={selected.has(item.id)}
                      type="checkbox"
                      onChange={(event) => onSelectionChange(item.id, event.target.checked)}
                    />
                  </label>
                  <button className="history-item" type="button" onClick={() => onOpen(item.id)}>
                    <span>{item.preview}</span>
                    <time>{item.updatedAt}</time>
                  </button>
                  <button
                    aria-label={`Delete ${item.preview}`}
                    className="history-delete"
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
