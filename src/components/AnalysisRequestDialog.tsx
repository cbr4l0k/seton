type AnalysisRequestDialogProps = {
  open: boolean;
  onSkip: () => void;
  onRequestLater: () => void;
};

export function AnalysisRequestDialog({
  open,
  onSkip,
  onRequestLater,
}: AnalysisRequestDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div aria-modal="true" className="dialog-panel" role="dialog">
        <p>Run analysis on this edited note later?</p>
        <div className="dialog-actions">
          <button type="button" onClick={onSkip}>
            Skip for now
          </button>
          <button type="button" onClick={onRequestLater}>
            Request analysis later
          </button>
        </div>
      </div>
    </div>
  );
}
