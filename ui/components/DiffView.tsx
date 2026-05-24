import { useMemo, useState, type FormEvent } from "react";
import type {
  ChangeSectionId,
  DiffFile,
  DiffLineType,
  DiffReviewCoordinate,
  DiffSide,
  PullRequestReviewThread,
  PullRequestReviewThreadsData,
} from "../types";
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
  reviewThreads?: PullRequestReviewThread[];
  reviewThreadsStatus?: "idle" | "loading" | "error";
  pullRequestNumber?: number | null;
  onReviewThreadsChange?: (data: PullRequestReviewThreadsData) => void;
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

const getThreadKey = (path: string, side: DiffSide, line: number) => `${path}\0${side}\0${line}`;

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
  reviewThreads = [],
  reviewThreadsStatus = "idle",
  pullRequestNumber = null,
  onReviewThreadsChange,
}: DiffViewProps) {
  const reviewThreadsByCoordinate = useMemo(() => {
    const threadsByCoordinate = new Map<string, PullRequestReviewThread[]>();
    for (const thread of reviewThreads) {
      if (!thread.side || !thread.line) continue;
      const key = getThreadKey(thread.path, thread.side, thread.line);
      const threads = threadsByCoordinate.get(key) ?? [];
      threads.push(thread);
      threadsByCoordinate.set(key, threads);
    }
    return threadsByCoordinate;
  }, [reviewThreads]);

  const getReviewThreads = (path: string, coordinate?: DiffReviewCoordinate) => {
    if (!coordinate) return [];
    return reviewThreadsByCoordinate.get(getThreadKey(path, coordinate.side, coordinate.line)) ?? [];
  };

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
                    const threads = getReviewThreads(file.path, reviewCoordinate);
                    return (
                      <div key={lineIndex} className="line-block">
                        <div
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
                        <ReviewThreads
                          threads={threads}
                          status={reviewThreadsStatus}
                          pullRequestNumber={pullRequestNumber}
                          onReviewThreadsChange={onReviewThreadsChange}
                        />
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
                    <div key={lineIndex} className="line-block">
                      <div
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
                      <ReviewThreads
                        threads={getReviewThreads(file.path, row.reviewCoordinate)}
                        status={reviewThreadsStatus}
                        pullRequestNumber={pullRequestNumber}
                        onReviewThreadsChange={onReviewThreadsChange}
                      />
                    </div>
                  ))}
                </div>
                <div className="split-pane">
                  {rightRows.map((row, lineIndex) => (
                    <div key={lineIndex} className="line-block">
                      <div
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
                      <ReviewThreads
                        threads={getReviewThreads(file.path, row.reviewCoordinate)}
                        status={reviewThreadsStatus}
                        pullRequestNumber={pullRequestNumber}
                        onReviewThreadsChange={onReviewThreadsChange}
                      />
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

function ReviewThreads({
  threads,
  status,
  pullRequestNumber,
  onReviewThreadsChange,
}: {
  threads: PullRequestReviewThread[];
  status: "idle" | "loading" | "error";
  pullRequestNumber: number | null;
  onReviewThreadsChange?: (data: PullRequestReviewThreadsData) => void;
}) {
  if (!threads.length) return null;

  return (
    <div className="review-threads" data-review-thread-status={status}>
      {threads.map((thread) => (
        <div key={thread.id} className="review-thread">
          {thread.comments.map((comment) => (
            <article key={comment.id} className="review-comment">
              <div className="review-comment-header">
                <span>{comment.author ?? "unknown"}</span>
                {thread.outdated ? <span>Outdated</span> : null}
              </div>
              <div className="review-comment-body">{comment.body}</div>
            </article>
          ))}
          <ReviewReplyForm
            thread={thread}
            pullRequestNumber={pullRequestNumber}
            disabled={status === "loading" || !onReviewThreadsChange}
            onReviewThreadsChange={onReviewThreadsChange}
          />
        </div>
      ))}
    </div>
  );
}

function ReviewReplyForm({
  thread,
  pullRequestNumber,
  disabled,
  onReviewThreadsChange,
}: {
  thread: PullRequestReviewThread;
  pullRequestNumber: number | null;
  disabled: boolean;
  onReviewThreadsChange?: (data: PullRequestReviewThreadsData) => void;
}) {
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const rootCommentId = thread.comments[0]?.id ?? null;
  const canSubmit = Boolean(pullRequestNumber && rootCommentId && body.trim() && status !== "submitting" && !disabled);

  const submitReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!pullRequestNumber || !rootCommentId || !body.trim() || !onReviewThreadsChange) return;

    setStatus("submitting");
    try {
      const response = await fetch("/api/github/pr-review-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: pullRequestNumber,
          commentId: rootCommentId,
          body,
        }),
      });
      if (!response.ok) throw new Error("Reply failed");
      onReviewThreadsChange(await response.json());
      setBody("");
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  return (
    <form className="review-reply-form" onSubmit={submitReply}>
      <textarea
        className="review-reply-input"
        placeholder="Reply"
        value={body}
        disabled={disabled || status === "submitting"}
        rows={2}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="review-reply-actions">
        {status === "error" ? <span className="review-reply-error">Unable to reply</span> : null}
        <button type="submit" className="tab review-reply-submit" disabled={!canSubmit}>
          {status === "submitting" ? "Replying…" : "Reply"}
        </button>
      </div>
    </form>
  );
}

function getStatusMessage(status: "loading" | "error", showFullFile: boolean) {
  if (status === "loading") return showFullFile ? "Loading full context…" : "Loading diff…";
  return showFullFile ? "Unable to load full context." : "Unable to load diff.";
}

function formatChange(change: ChangeSectionId) {
  return change === "staged" ? "Staged" : "Unstaged";
}
