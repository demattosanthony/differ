import type { DiffFile, DiffLine } from "../types";
import type { DiffViewMode } from "../themes";

type SplitCellType = "add" | "del" | "context" | "empty";

type DiffViewProps = {
  file: DiffFile | null;
  emptyMessage: string;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  showFullFile: boolean;
  onToggleFullFile: (value: boolean) => void;
  fullFileStatus: "idle" | "loading" | "error";
};

type Row = { line: DiffLine; oldNumber: number | null; newNumber: number | null };
type SplitSideRow = { type: "add" | "del" | "context"; number: number | null; content: string; html?: string };

const parseHunkHeader = (header: string) => {
  const match = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (!match) return { oldStart: 0, newStart: 0 };
  return { oldStart: Number(match[1]), newStart: Number(match[2]) };
};

const marker = (type: SplitCellType) => (type === "add" ? "+" : type === "del" ? "-" : " ");

const renderContent = (content: string, html?: string) =>
  html ? <span className="content" dangerouslySetInnerHTML={{ __html: html }} /> : <span className="content">{content}</span>;

const buildRows = (hunkLines: DiffLine[], header: string): Row[] => {
  const { oldStart, newStart } = parseHunkHeader(header);
  let oldLine = oldStart;
  let newLine = newStart;

  return hunkLines.map((line) => {
    let oldNumber: number | null = null;
    let newNumber: number | null = null;

    if (line.type === "context") {
      oldNumber = oldLine;
      newNumber = newLine;
      oldLine += 1;
      newLine += 1;
    } else if (line.type === "del") {
      oldNumber = oldLine;
      oldLine += 1;
    } else {
      newNumber = newLine;
      newLine += 1;
    }

    return { line, oldNumber, newNumber };
  });
};

const ViewTabs = ({ viewMode, onChange }: { viewMode: DiffViewMode; onChange: (mode: DiffViewMode) => void }) => (
  <div className="view-tabs" role="tablist" aria-label="Diff layout">
    <button
      type="button"
      role="tab"
      aria-selected={viewMode === "split"}
      className={`tab ${viewMode === "split" ? "active" : ""}`}
      onClick={() => onChange("split")}
    >
      <span className="tab-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" className="icon">
          <path d="M3 4h6v12H3V4zm8 0h6v12h-6V4zm1 2v2h4V6h-4zm0 4v2h4v-2h-4zM4 6v2h4V6H4zm0 4v2h4v-2H4z" />
        </svg>
      </span>
      <span>Split</span>
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={viewMode === "stacked"}
      className={`tab ${viewMode === "stacked" ? "active" : ""}`}
      onClick={() => onChange("stacked")}
    >
      <span className="tab-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" className="icon">
          <path d="M4 4h12v4H4V4zm0 6h12v6H4v-6zm2 2v2h8v-2H6z" />
        </svg>
      </span>
      <span>Stacked</span>
    </button>
  </div>
);

const ModeToggle = ({ active, onToggle }: { active: boolean; onToggle: (value: boolean) => void }) => (
  <div className="mode-toggle" role="tablist" aria-label="View mode">
    <button
      type="button"
      role="tab"
      aria-selected={!active}
      className={`tab ${!active ? "active" : ""}`}
      onClick={() => onToggle(false)}
    >
      Diff
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`tab ${active ? "active" : ""}`}
      onClick={() => onToggle(true)}
    >
      File
    </button>
  </div>
);

export function DiffView({
  file,
  emptyMessage,
  viewMode,
  onViewModeChange,
  showFullFile,
  onToggleFullFile,
  fullFileStatus,
}: DiffViewProps) {
  if (!file) {
    return (
      <section className="diff-view">
        <div className="empty centered">{emptyMessage}</div>
      </section>
    );
  }

  return (
    <section className="diff-view">
      <div className="diff-scroll">
        <div className="diff-header">
          <span className="file-title">{file.path}</span>
          <div className="diff-actions">
            <span className="file-stats">
              <span className="add">+{file.additions}</span>
              <span className="del">-{file.deletions}</span>
            </span>
            <ModeToggle active={showFullFile} onToggle={onToggleFullFile} />
            <ViewTabs viewMode={viewMode} onChange={onViewModeChange} />
          </div>
        </div>
        {showFullFile && fullFileStatus !== "idle" ? (
          <div className="empty centered">
            {fullFileStatus === "loading" ? "Loading full context…" : "Unable to load full context."}
          </div>
        ) : (
          file.hunks.map((hunk, index) => {
            const rows = buildRows(hunk.lines, hunk.header);

          if (viewMode === "stacked") {
            return (
              <div key={`${file.path}-${index}`} className="hunk">
                <div className="hunk-lines">
                  {rows.map((row, lineIndex) => {
                    const displayNumber = row.line.type === "del" ? row.oldNumber : row.newNumber;
                    return (
                      <div key={lineIndex} className={`line ${row.line.type}`}>
                        <span className="line-num">{displayNumber ?? ""}</span>
                        <span className="marker">{marker(row.line.type)}</span>
                        {renderContent(row.line.content, row.line.html)}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          const leftRows: SplitSideRow[] = rows
            .filter((row) => row.line.type !== "add")
            .map((row) => ({
              type: row.line.type,
              number: row.oldNumber,
              content: row.line.content,
              html: row.line.html,
            }));
          const rightRows: SplitSideRow[] = rows
            .filter((row) => row.line.type !== "del")
            .map((row) => ({
              type: row.line.type,
              number: row.newNumber,
              content: row.line.content,
              html: row.line.html,
            }));

          return (
            <div key={`${file.path}-${index}`} className="hunk">
              <div className="split-columns">
                <div className="split-pane">
                  {leftRows.map((row, lineIndex) => (
                    <div key={lineIndex} className={`split-line ${row.type}`}>
                      <span className="line-num">{row.number ?? ""}</span>
                      <span className="marker">{marker(row.type)}</span>
                      {renderContent(row.content, row.html)}
                    </div>
                  ))}
                </div>
                <div className="split-pane">
                  {rightRows.map((row, lineIndex) => (
                    <div key={lineIndex} className={`split-line ${row.type}`}>
                      <span className="line-num">{row.number ?? ""}</span>
                      <span className="marker">{marker(row.type)}</span>
                      {renderContent(row.content, row.html)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
          })
        )}
      </div>
    </section>
  );
}
