type HistoryItem = {
  id: string;
  preview: string;
  updatedAt: string;
};

type HistoryPanelProps = {
  items: HistoryItem[];
  active: boolean;
  onDelete: (noteId: string) => void;
  onOpen: (noteId: string) => void;
};

export function HistoryPanel({ items, active, onDelete, onOpen }: HistoryPanelProps) {
  return (
    <section
      aria-label="Notes panel"
      className="panel panel-bottom"
      data-active={active}
    >
      <p className="panel-subtle-title">Notes</p>
      {items.length > 0 ? (
        <ul className="history-list">
          {items.map((item) => (
            <li key={item.id}>
              <div className="history-row">
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
      ) : null}
    </section>
  );
}
