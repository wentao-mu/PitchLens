type ExportPanelProps = {
  note: string;
  onCopy: () => void;
  onDownload: () => void;
  copyStatus: string;
};

export function ExportPanel({
  note,
  onCopy,
  onDownload,
  copyStatus,
}: ExportPanelProps) {
  return (
    <section className="panel export-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Export</p>
          <h2>Evidence-backed tactical note</h2>
        </div>
        <div className="export-actions">
          <button type="button" onClick={onCopy}>
            Copy note
          </button>
          <button type="button" className="ghost-button" onClick={onDownload}>
            Download .md
          </button>
        </div>
      </div>
      <p className="panel-copy">
        Export the current tactical note with the active evidence set and comparison lock.
        {copyStatus ? ` ${copyStatus}` : ""}
      </p>
      <textarea value={note} readOnly className="note-preview" />
    </section>
  );
}
