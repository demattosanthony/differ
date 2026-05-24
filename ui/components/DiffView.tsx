import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  ChangeSectionId,
  DiffFile,
  DiffLineType,
  DiffReviewCoordinate,
  DiffSide,
  PullRequestReviewComment,
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

type NewReviewCommentTarget = {
  path: string;
  coordinate: DiffReviewCoordinate;
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
  const [newCommentTarget, setNewCommentTarget] = useState<NewReviewCommentTarget | null>(null);
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

  const canCreateComments = Boolean(pullRequestNumber && onReviewThreadsChange);
  const activeNewCommentKey = newCommentTarget
    ? getThreadKey(newCommentTarget.path, newCommentTarget.coordinate.side, newCommentTarget.coordinate.line)
    : null;

  useEffect(() => {
    const handleAddComment = (event: Event) => {
      const target = event instanceof CustomEvent ? event.detail : null;
      if (isNewReviewCommentTarget(target)) setNewCommentTarget(target);
    };
    window.addEventListener("differ:add-review-comment", handleAddComment);
    return () => window.removeEventListener("differ:add-review-comment", handleAddComment);
  }, []);

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
                    const commentTarget = reviewCoordinate ? { path: file.path, coordinate: reviewCoordinate } : null;
                    const commentTargetKey = commentTarget
                      ? getThreadKey(commentTarget.path, commentTarget.coordinate.side, commentTarget.coordinate.line)
                      : null;
                    return (
                      <div key={lineIndex} className="line-block">
                        <DiffLineRow
                          className={`line ${line.type}`}
                          path={file.path}
                          side={reviewSide}
                          line={reviewCoordinate?.line}
                          diffPosition={line.diffPosition}
                          canCreateComment={canCreateComments}
                          onCreateCommentTarget={commentTarget}
                        >
                          <span className="line-num">{displayNumber ?? ""}</span>
                          <span className="marker">{marker(line.type)}</span>
                          {renderContent(line.content, line.html)}
                        </DiffLineRow>
                        <ReviewThreads
                          threads={threads}
                          status={reviewThreadsStatus}
                          pullRequestNumber={pullRequestNumber}
                          onReviewThreadsChange={onReviewThreadsChange}
                        />
                        {commentTarget && commentTargetKey === activeNewCommentKey ? (
                          <NewReviewCommentForm
                            target={commentTarget}
                            pullRequestNumber={pullRequestNumber}
                            onCancel={() => setNewCommentTarget(null)}
                            onReviewThreadsChange={(data) => {
                              onReviewThreadsChange?.(data);
                              setNewCommentTarget(null);
                            }}
                          />
                        ) : null}
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
                    <SplitLineBlock
                      key={lineIndex}
                      row={row}
                      filePath={file.path}
                      activeNewCommentKey={activeNewCommentKey}
                      pullRequestNumber={pullRequestNumber}
                      onCancelNewComment={() => setNewCommentTarget(null)}
                      onReviewThreadsChange={(data) => {
                        onReviewThreadsChange?.(data);
                        setNewCommentTarget(null);
                      }}
                    >
                      <DiffLineRow
                        className={`split-line ${row.type}`}
                        path={file.path}
                        side={row.side}
                        line={row.reviewCoordinate?.line}
                        diffPosition={row.diffPosition}
                        canCreateComment={canCreateComments}
                        onCreateCommentTarget={
                          row.reviewCoordinate ? { path: file.path, coordinate: row.reviewCoordinate } : null
                        }
                      >
                        <span className="line-num">{row.number ?? ""}</span>
                        <span className="marker">{marker(row.type)}</span>
                        {renderContent(row.content, row.html)}
                      </DiffLineRow>
                      <ReviewThreads
                        threads={getReviewThreads(file.path, row.reviewCoordinate)}
                        status={reviewThreadsStatus}
                        pullRequestNumber={pullRequestNumber}
                        onReviewThreadsChange={onReviewThreadsChange}
                      />
                    </SplitLineBlock>
                  ))}
                </div>
                <div className="split-pane">
                  {rightRows.map((row, lineIndex) => (
                    <SplitLineBlock
                      key={lineIndex}
                      row={row}
                      filePath={file.path}
                      activeNewCommentKey={activeNewCommentKey}
                      pullRequestNumber={pullRequestNumber}
                      onCancelNewComment={() => setNewCommentTarget(null)}
                      onReviewThreadsChange={(data) => {
                        onReviewThreadsChange?.(data);
                        setNewCommentTarget(null);
                      }}
                    >
                      <DiffLineRow
                        className={`split-line ${row.type}`}
                        path={file.path}
                        side={row.side}
                        line={row.reviewCoordinate?.line}
                        diffPosition={row.diffPosition}
                        canCreateComment={canCreateComments}
                        onCreateCommentTarget={
                          row.reviewCoordinate ? { path: file.path, coordinate: row.reviewCoordinate } : null
                        }
                      >
                        <span className="line-num">{row.number ?? ""}</span>
                        <span className="marker">{marker(row.type)}</span>
                        {renderContent(row.content, row.html)}
                      </DiffLineRow>
                      <ReviewThreads
                        threads={getReviewThreads(file.path, row.reviewCoordinate)}
                        status={reviewThreadsStatus}
                        pullRequestNumber={pullRequestNumber}
                        onReviewThreadsChange={onReviewThreadsChange}
                      />
                    </SplitLineBlock>
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

function DiffLineRow({
  className,
  path,
  side,
  line,
  diffPosition,
  canCreateComment,
  onCreateCommentTarget,
  children,
}: {
  className: string;
  path: string;
  side: DiffSide;
  line?: number;
  diffPosition: number;
  canCreateComment: boolean;
  onCreateCommentTarget: NewReviewCommentTarget | null;
  children: ReactNode;
}) {
  return (
    <div
      className={`${className} reviewable-line`}
      data-review-path={path}
      data-review-side={side}
      data-review-line={line}
      data-diff-position={diffPosition}
    >
      {canCreateComment && onCreateCommentTarget ? (
        <button
          type="button"
          className="review-add-button"
          aria-label="Add comment"
          title="Add comment"
          onClick={() => window.dispatchEvent(new CustomEvent("differ:add-review-comment", { detail: onCreateCommentTarget }))}
        >
          +
        </button>
      ) : (
        <span className="review-add-spacer" aria-hidden="true" />
      )}
      {children}
    </div>
  );
}

function SplitLineBlock({
  row,
  filePath,
  activeNewCommentKey,
  pullRequestNumber,
  onCancelNewComment,
  onReviewThreadsChange,
  children,
}: {
  row: SplitSideRow;
  filePath: string;
  activeNewCommentKey: string | null;
  pullRequestNumber: number | null;
  onCancelNewComment: () => void;
  onReviewThreadsChange?: (data: PullRequestReviewThreadsData) => void;
  children: ReactNode;
}) {
  const target = row.reviewCoordinate ? { path: filePath, coordinate: row.reviewCoordinate } : null;
  const targetKey = target ? getThreadKey(target.path, target.coordinate.side, target.coordinate.line) : null;

  return (
    <div className="line-block">
      {children}
      {target && targetKey === activeNewCommentKey ? (
        <NewReviewCommentForm
          target={target}
          pullRequestNumber={pullRequestNumber}
          onCancel={onCancelNewComment}
          onReviewThreadsChange={onReviewThreadsChange}
        />
      ) : null}
    </div>
  );
}

function isNewReviewCommentTarget(value: unknown): value is NewReviewCommentTarget {
  if (!value || typeof value !== "object") return false;
  const target = value as NewReviewCommentTarget;
  return (
    typeof target.path === "string" &&
    Boolean(target.coordinate) &&
    (target.coordinate.side === "LEFT" || target.coordinate.side === "RIGHT") &&
    Number.isInteger(target.coordinate.line)
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
            <ReviewCommentCard
              key={comment.id}
              comment={comment}
              outdated={thread.outdated}
              pullRequestNumber={pullRequestNumber}
              disabled={status === "loading" || !onReviewThreadsChange}
              onReviewThreadsChange={onReviewThreadsChange}
            />
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

function ReviewCommentCard({
  comment,
  outdated,
  pullRequestNumber,
  disabled,
  onReviewThreadsChange,
}: {
  comment: PullRequestReviewComment;
  outdated: boolean;
  pullRequestNumber: number | null;
  disabled: boolean;
  onReviewThreadsChange?: (data: PullRequestReviewThreadsData) => void;
}) {
  const [draft, setDraft] = useState(comment.body);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "deleting">("idle");
  const canSave = Boolean(pullRequestNumber && draft.trim() && draft !== comment.body && status === "idle" && !disabled);
  const canMutate = Boolean(pullRequestNumber && status === "idle" && !disabled && onReviewThreadsChange);

  const saveComment = async () => {
    if (!pullRequestNumber || !draft.trim() || !onReviewThreadsChange) return;

    setStatus("saving");
    setError(null);
    try {
      onReviewThreadsChange(
        await mutateReviewComment("/api/github/pr-review-comments", "PATCH", {
          number: pullRequestNumber,
          commentId: comment.id,
          body: draft,
        })
      );
      setEditing(false);
      setConfirmDelete(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update");
    } finally {
      setStatus("idle");
    }
  };

  const deleteComment = async () => {
    if (!pullRequestNumber || !onReviewThreadsChange) return;

    setStatus("deleting");
    setError(null);
    try {
      onReviewThreadsChange(
        await mutateReviewComment("/api/github/pr-review-comments", "DELETE", {
          number: pullRequestNumber,
          commentId: comment.id,
        })
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to delete");
      setStatus("idle");
    }
  };

  return (
    <article className="review-comment">
      <div className="review-comment-header">
        <span>{comment.author ?? "unknown"}</span>
        {outdated ? <span>Outdated</span> : null}
        <div className="review-comment-actions">
          {editing ? (
            <button
              type="button"
              className="review-text-button"
              disabled={status !== "idle"}
              onClick={() => {
                setDraft(comment.body);
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          ) : (
            <button type="button" className="review-text-button" disabled={!canMutate} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          <button
            type="button"
            className="review-text-button danger"
            disabled={!canMutate}
            onClick={() => setConfirmDelete((value) => !value)}
          >
            Delete
          </button>
        </div>
      </div>
      {editing ? (
        <div className="review-edit-form">
          <textarea
            className="review-reply-input"
            value={draft}
            disabled={status !== "idle"}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="review-reply-actions">
            {error ? <span className="review-reply-error">{error}</span> : null}
            <button type="button" className="tab review-reply-submit" disabled={!canSave} onClick={saveComment}>
              {status === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div className="review-comment-body">{comment.body}</div>
      )}
      {confirmDelete ? (
        <div className="review-delete-confirm">
          <span>{error ?? "Delete this comment?"}</span>
          <button type="button" className="review-text-button" disabled={status !== "idle"} onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
          <button type="button" className="review-text-button danger" disabled={status !== "idle"} onClick={deleteComment}>
            {status === "deleting" ? "Deleting…" : "Delete"}
          </button>
        </div>
      ) : error && !editing ? (
        <div className="review-reply-error">{error}</div>
      ) : null}
    </article>
  );
}

function NewReviewCommentForm({
  target,
  pullRequestNumber,
  onCancel,
  onReviewThreadsChange,
}: {
  target: NewReviewCommentTarget;
  pullRequestNumber: number | null;
  onCancel: () => void;
  onReviewThreadsChange?: (data: PullRequestReviewThreadsData) => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const canSubmit = Boolean(pullRequestNumber && body.trim() && status !== "submitting" && onReviewThreadsChange);

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!pullRequestNumber || !body.trim() || !onReviewThreadsChange) return;

    setStatus("submitting");
    setError(null);
    try {
      onReviewThreadsChange(
        await mutateReviewComment("/api/github/pr-review-comments", "POST", {
          number: pullRequestNumber,
          path: target.path,
          side: target.coordinate.side,
          line: target.coordinate.line,
          body,
        })
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to comment");
      setStatus("idle");
    }
  };

  return (
    <form className="review-new-comment-form" onSubmit={submitComment}>
      <textarea
        className="review-reply-input"
        placeholder={`Comment on ${target.coordinate.side.toLowerCase()} line ${target.coordinate.line}`}
        value={body}
        disabled={status === "submitting"}
        rows={3}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="review-reply-actions">
        {error ? <span className="review-reply-error">{error}</span> : null}
        <button type="button" className="review-text-button" disabled={status === "submitting"} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="tab review-reply-submit" disabled={!canSubmit}>
          {status === "submitting" ? "Commenting…" : "Comment"}
        </button>
      </div>
    </form>
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
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const rootCommentId = thread.comments[0]?.id ?? null;
  const canSubmit = Boolean(pullRequestNumber && rootCommentId && body.trim() && status !== "submitting" && !disabled);

  const submitReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!pullRequestNumber || !rootCommentId || !body.trim() || !onReviewThreadsChange) return;

    setStatus("submitting");
    setError(null);
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
      if (!response.ok) throw new Error(await getResponseError(response, "Reply failed"));
      onReviewThreadsChange(await response.json());
      setBody("");
      setStatus("idle");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to reply");
      setStatus("idle");
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
        {error ? <span className="review-reply-error">{error}</span> : null}
        <button type="submit" className="tab review-reply-submit" disabled={!canSubmit}>
          {status === "submitting" ? "Replying…" : "Reply"}
        </button>
      </div>
    </form>
  );
}

async function mutateReviewComment(endpoint: string, method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await getResponseError(response, "Review comment mutation failed"));
  return (await response.json()) as PullRequestReviewThreadsData;
}

async function getResponseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

function getStatusMessage(status: "loading" | "error", showFullFile: boolean) {
  if (status === "loading") return showFullFile ? "Loading full context…" : "Loading diff…";
  return showFullFile ? "Unable to load full context." : "Unable to load diff.";
}

function formatChange(change: ChangeSectionId) {
  return change === "staged" ? "Staged" : "Unstaged";
}
