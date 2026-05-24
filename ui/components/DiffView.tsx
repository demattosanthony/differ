import type { ChangeSectionId, DiffFile, DiffLineType, DiffReviewCoordinate, DiffSide } from "../types";
import type { DiffViewMode } from "../themes";

type SplitCellType = "add" | "del" | "context" | "empty";

type DiffViewProps = {
  file: DiffFile | null;
  emptyMessage: string;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  showFullFile: boolean;
  onToggleFullFile: (value: boolean) => void;
  fileStatus: "idle" | "loading" | "error";
  onShowInFiles: () => void;
  change?: ChangeSectionId | null;
};

type SplitSideRow = {
  type: DiffLineType;
  side: DiffSide;
  number: number | null;
  content: string;
  html?: string;
  diffPosition: number;
  reviewCoordinate?: DiffReviewCoordinate;
};

const marker = (type: SplitCellType) => (type === "add" ? "+" : type === "del" ? "-" : " ");

const renderContent = (content: string, html?: string) =>
  html ? <span className="content" dangerouslySetInnerHTML={{ __html: html }} /> : <span className="content">{content}</span>;

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
      Full
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
  fileStatus,
  onShowInFiles,
  change,
}: DiffViewProps) {
  if (fileStatus !== "idle") {
    return (
      <section className="diff-view">
        <div className="empty centered">{getStatusMessage(fileStatus, showFullFile)}</div>
      </section>
    );
  }

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
          <span className="file-title">
            {file.path}
            {change ? <span className="change-badge">{formatChange(change)}</span> : null}
          </span>
          <div className="diff-actions">
            <span className="file-stats">
              <span className="add">+{file.additions}</span>
              <span className="del">-{file.deletions}</span>
            </span>
            <ModeToggle active={showFullFile} onToggle={onToggleFullFile} />
            <button type="button" className="tab" onClick={onShowInFiles}>
              Files
            </button>
            <ViewTabs viewMode={viewMode} onChange={onViewModeChange} />
          </div>
        </div>
        {file.hunks.map((hunk, index) => {
          if (viewMode === "stacked") {
            return (
              <div key={`${file.path}-${index}`} className="hunk">
                <div className="hunk-lines">
                  {hunk.lines.map((line, lineIndex) => {
                    const displayNumber = line.type === "del" ? line.oldLineNumber : line.newLineNumber;
                    const reviewSide = line.type === "del" ? "LEFT" : "RIGHT";
                    const reviewCoordinate = line.reviewCoordinates[reviewSide];
                    return (
                      <div
                        key={lineIndex}
                        className={`line ${line.type}`}
                        data-review-path={file.path}
                        data-review-side={reviewSide}
                        data-review-line={reviewCoordinate?.line}
                        data-diff-position={line.diffPosition}
                      >
                        <span className="line-num">{displayNumber ?? ""}</span>
                        <span className="marker">{marker(line.type)}</span>
                        {renderContent(line.content, line.html)}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          const leftRows: SplitSideRow[] = hunk.lines
            .filter((line) => line.type !== "add")
            .map((line) => ({
              type: line.type,
              side: "LEFT",
              number: line.oldLineNumber,
              content: line.content,
              html: line.html,
              diffPosition: line.diffPosition,
              reviewCoordinate: line.reviewCoordinates.LEFT,
            }));
          const rightRows: SplitSideRow[] = hunk.lines
            .filter((line) => line.type !== "del")
            .map((line) => ({
              type: line.type,
              side: "RIGHT",
              number: line.newLineNumber,
              content: line.content,
              html: line.html,
              diffPosition: line.diffPosition,
              reviewCoordinate: line.reviewCoordinates.RIGHT,
            }));

          return (
            <div key={`${file.path}-${index}`} className="hunk">
              <div className="split-columns">
                <div className="split-pane">
                  {leftRows.map((row, lineIndex) => (
                    <div
                      key={lineIndex}
                      className={`split-line ${row.type}`}
                      data-review-path={file.path}
                      data-review-side={row.side}
                      data-review-line={row.reviewCoordinate?.line}
                      data-diff-position={row.diffPosition}
                    >
                      <span className="line-num">{row.number ?? ""}</span>
                      <span className="marker">{marker(row.type)}</span>
                      {renderContent(row.content, row.html)}
                    </div>
                  ))}
                </div>
                <div className="split-pane">
                  {rightRows.map((row, lineIndex) => (
                    <div
                      key={lineIndex}
                      className={`split-line ${row.type}`}
                      data-review-path={file.path}
                      data-review-side={row.side}
                      data-review-line={row.reviewCoordinate?.line}
                      data-diff-position={row.diffPosition}
                    >
                      <span className="line-num">{row.number ?? ""}</span>
                      <span className="marker">{marker(row.type)}</span>
                      {renderContent(row.content, row.html)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
          })}
      </div>
    </section>
  );
}

function getStatusMessage(status: "loading" | "error", showFullFile: boolean) {
  if (status === "loading") return showFullFile ? "Loading full context…" : "Loading diff…";
  return showFullFile ? "Unable to load full context." : "Unable to load diff.";
}

function formatChange(change: ChangeSectionId) {
  return change === "staged" ? "Staged" : "Unstaged";
}
