import type { Language } from "../lib/i18n";

type ExportPanelProps = {
  note: string;
  onCopy: () => void;
  onDownload: () => void;
  copyStatus: string;
  language: Language;
};

export function ExportPanel({
  note,
  onCopy,
  onDownload,
  copyStatus,
  language,
}: ExportPanelProps) {
  return (
    <section className="panel export-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{language === "zh" ? "导出" : "Export"}</p>
          <h2>
            {language === "zh"
              ? "带证据的战术结论"
              : "Evidence-backed tactical note"}
          </h2>
        </div>
        <div className="export-actions">
          <button type="button" onClick={onCopy}>
            {language === "zh" ? "复制结论" : "Copy note"}
          </button>
          <button type="button" className="ghost-button" onClick={onDownload}>
            {language === "zh" ? "下载 .md" : "Download .md"}
          </button>
        </div>
      </div>
      <p className="panel-copy">
        {language === "zh"
          ? "导出当前战术结论，同时保留当前证据集和对比锁定条件。"
          : "Export the current tactical conclusion together with the evidence set and comparison lock."}
        {copyStatus ? ` ${copyStatus}` : ""}
      </p>
      <textarea value={note} readOnly className="note-preview" />
    </section>
  );
}
