import type { SourceFileData } from "../types";

type SourceViewProps = {
  file: SourceFileData | null;
  filePath: string | null;
  status: "idle" | "loading" | "error";
  hasDiff: boolean;
  onShowDiff: () => void;
};

export function SourceView({ file, filePath, status, hasDiff, onShowDiff }: SourceViewProps) {
  if (status !== "idle") {
    const message = status === "loading" ? "Loading file…" : "Unable to load file.";
    return (
      <section className="diff-view">
        <div className="empty centered">{message}</div>
      </section>
    );
  }

  if (!file) {
    return (
      <section className="diff-view">
        <div className="empty centered">{filePath ? "File not found" : "Select a file"}</div>
      </section>
    );
  }

  return (
    <section className="diff-view">
      <div className="diff-scroll">
        <div className="diff-header">
          <span className="file-title">{file.path}</span>
          <div className="diff-actions">
            {file.truncated ? <span className="source-note">Preview</span> : null}
            {hasDiff ? (
              <button type="button" className="tab" onClick={onShowDiff}>
                Diff
              </button>
            ) : null}
          </div>
        </div>
        {file.binary ? (
          <div className="empty centered">Binary file</div>
        ) : (
          <>
            {file.truncated ? (
              <div className="source-banner">Large file preview. Full size {formatBytes(file.size)}.</div>
            ) : null}
            <div className="source-lines">
              {file.lines.map((line) => (
                <div key={line.number} className="source-line">
                  <span className="line-num">{line.number}</span>
                  {line.html ? (
                    <span className="content" dangerouslySetInnerHTML={{ __html: line.html }} />
                  ) : (
                    <span className="content">{line.content}</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
