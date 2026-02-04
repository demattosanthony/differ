import React, { useEffect, useMemo, useState } from "react";
import type { DiffFile, DiffLine } from "../types";
import type { ReviewThread } from "../types/pr";
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
  allowFullFile: boolean;
  commentThreads?: ReviewThread[];
  canComment?: boolean;
  onAddComment?: (input: {
    path: string;
    line: number;
    side: "LEFT" | "RIGHT";
    position?: number;
    body: string;
    reviewId?: number | null;
  }) => Promise<void>;
  onReplyComment?: (input: { commentId: number; body: string }) => Promise<void>;
  onEditComment?: (input: { commentId: number; body: string }) => Promise<void>;
  onDeleteComment?: (commentId: number) => Promise<void>;
  currentUserLogin?: string | null;
  reviewPendingId?: number | null;
  onStartReview?: () => Promise<number | null | undefined>;
  pendingCommentIds?: Set<number>;
};

type Row = { line: DiffLine; oldNumber: number | null; newNumber: number | null; position: number };
type SplitSideRow = {
  type: "add" | "del" | "context";
  number: number | null;
  position: number;
  content: string;
  html?: string;
};

const parseHunkHeader = (header: string) => {
  const match = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (!match) return { oldStart: 0, newStart: 0 };
  return { oldStart: Number(match[1]), newStart: Number(match[2]) };
};

const marker = (type: SplitCellType) => (type === "add" ? "+" : type === "del" ? "-" : " ");

const renderContent = (content: string, html?: string) =>
  html ? <span className="content" dangerouslySetInnerHTML={{ __html: html }} /> : <span className="content">{content}</span>;

const buildRows = (hunkLines: DiffLine[], header: string, positionStart: number): Row[] => {
  const { oldStart, newStart } = parseHunkHeader(header);
  let oldLine = oldStart;
  let newLine = newStart;

  return hunkLines.map((line, index) => {
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

    return { line, oldNumber, newNumber, position: positionStart + index + 1 };
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

const ModeToggle = ({
  active,
  onToggle,
  disabled,
}: {
  active: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
}) => (
  <div className="mode-toggle" role="tablist" aria-label="View mode">
    <button
      type="button"
      role="tab"
      aria-selected={!active}
      className={`tab ${!active ? "active" : ""}`}
      onClick={() => onToggle(false)}
      disabled={disabled}
    >
      Diff
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`tab ${active ? "active" : ""}`}
      onClick={() => onToggle(true)}
      disabled={disabled}
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
  allowFullFile,
  commentThreads = [],
  canComment = false,
  onAddComment,
  onReplyComment,
  onEditComment,
  onDeleteComment,
  currentUserLogin = null,
  reviewPendingId = null,
  onStartReview,
  pendingCommentIds,
}: DiffViewProps) {
  const [draftLine, setDraftLine] = useState<{
    line: number;
    side: "LEFT" | "RIGHT";
    position: number;
  } | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");

  const threadLookup = useMemo(() => {
    const map = new Map<string, ReviewThread[]>();
    for (const thread of commentThreads) {
      if (!thread.line) continue;
      const key = `${thread.path}::${thread.side}:${thread.line}`;
      const list = map.get(key) ?? [];
      list.push(thread);
      map.set(key, list);
    }
    return map;
  }, [commentThreads]);

  useEffect(() => {
    setDraftLine(null);
    setDraftBody("");
    setReplyingTo(null);
    setReplyBody("");
    setEditingId(null);
    setEditBody("");
  }, [file?.path]);

  const toggleDraft = (line: number, side: "LEFT" | "RIGHT", position: number) => {
    setDraftLine((prev) =>
      prev && prev.line === line && prev.side === side ? null : { line, side, position }
    );
    setDraftBody("");
  };

  if (!file) {
    return (
      <section className="diff-view">
        <div className="empty centered">{emptyMessage}</div>
      </section>
    );
  }

  const activePath = file.path;

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
            <ModeToggle active={showFullFile} onToggle={onToggleFullFile} disabled={!allowFullFile} />
            <ViewTabs viewMode={viewMode} onChange={onViewModeChange} />
          </div>
        </div>
        {showFullFile && fullFileStatus !== "idle" ? (
          <div className="empty centered">
            {fullFileStatus === "loading" ? "Loading full context…" : "Unable to load full context."}
          </div>
        ) : (
          file.hunks.map((hunk, index) => {
            const positionOffset = file.hunks
              .slice(0, index)
              .reduce((acc, item) => acc + item.lines.length, 0);
            const rows = buildRows(hunk.lines, hunk.header, positionOffset);

          if (viewMode === "stacked") {
            return (
              <div key={`${file.path}-${index}`} className="hunk">
                <div className="hunk-lines">
                  {rows.map((row, lineIndex) => {
                    const displayNumber = row.line.type === "del" ? row.oldNumber : row.newNumber;
                    const side = row.line.type === "del" ? "LEFT" : "RIGHT";
                    const lineNumber = row.line.type === "del" ? row.oldNumber : row.newNumber;
                    const lineThreads =
                      lineNumber != null ? threadLookup.get(`${activePath}::${side}:${lineNumber}`) : undefined;
                    const canLineComment = canComment && lineNumber != null;
                    const isActive = draftLine?.line === lineNumber && draftLine?.side === side;
                    return (
                      <div
                        key={lineIndex}
                        className={`line ${row.line.type} ${isActive ? "comment-active" : ""}`}
                      >
                        {canLineComment ? (
                          <button
                            type="button"
                            className="line-num line-num-button"
                            onClick={() => toggleDraft(lineNumber!, side, row.position)}
                            aria-label={`Comment on line ${displayNumber}`}
                          >
                            {displayNumber ?? ""}
                          </button>
                        ) : (
                          <span className="line-num">{displayNumber ?? ""}</span>
                        )}
                        <span className="marker">{marker(row.line.type)}</span>
                        {renderContent(row.line.content, row.line.html)}
                        {canLineComment ? (
                          <button
                            type="button"
                            className="comment-action"
                            onClick={() => toggleDraft(lineNumber!, side, row.position)}
                            aria-label="Add comment"
                          >
                            +
                          </button>
                        ) : null}
                        {lineThreads?.length ? (
                          <span className="comment-count">{lineThreads.length}</span>
                        ) : null}
                        {draftLine && draftLine.line === lineNumber && draftLine.side === side ? (
                          <div className="comment-draft">
                            <textarea
                              className="comment-input"
                              rows={3}
                              value={draftBody}
                              onChange={(event) => setDraftBody(event.target.value)}
                              placeholder="Add a comment"
                            />
                            <div className="comment-actions">
                              <button type="button" className="comment-cancel" onClick={() => setDraftLine(null)}>
                                Cancel
                              </button>
                              {reviewPendingId ? null : (
                                <button
                                  type="button"
                                  className="comment-submit ghost"
                                  onClick={async () => {
                                    if (!onStartReview || !draftLine) return;
                                    const reviewId = await onStartReview();
                                    if (!reviewId) return;
                                    await onAddComment?.({
                                      path: activePath,
                                      line: draftLine.line,
                                      side: draftLine.side,
                                      position: draftLine.position,
                                      body: draftBody,
                                      reviewId,
                                    });
                                    setDraftLine(null);
                                    setDraftBody("");
                                  }}
                                  disabled={!draftBody.trim()}
                                >
                                  Start review
                                </button>
                              )}
                              <button
                                type="button"
                                className="comment-submit"
                                onClick={async () => {
                                  if (!onAddComment || !draftLine) return;
                                  await onAddComment({
                                    path: activePath,
                                    line: draftLine.line,
                                    side: draftLine.side,
                                    position: draftLine.position,
                                    body: draftBody,
                                    reviewId: reviewPendingId ?? undefined,
                                  });
                                  setDraftLine(null);
                                  setDraftBody("");
                                }}
                                disabled={!draftBody.trim()}
                              >
                                {reviewPendingId ? "Add to review" : "Add comment"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {lineThreads?.map((thread) => (
                          <CommentThread
                            key={thread.id}
                            thread={thread}
                            canReply={canComment}
                            canEdit={Boolean(currentUserLogin)}
                            currentUserLogin={currentUserLogin}
                            editingId={editingId}
                            editBody={editBody}
                            setEditingId={setEditingId}
                            setEditBody={setEditBody}
                            onEdit={onEditComment}
                            onDelete={onDeleteComment}
                            pendingCommentIds={pendingCommentIds}
                            onReply={onReplyComment}
                            replyingTo={replyingTo}
                            setReplyingTo={setReplyingTo}
                            replyBody={replyBody}
                            setReplyBody={setReplyBody}
                          />
                        ))}
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
              position: row.position,
              content: row.line.content,
              html: row.line.html,
            }));
          const rightRows: SplitSideRow[] = rows
            .filter((row) => row.line.type !== "del")
            .map((row) => ({
              type: row.line.type,
              number: row.newNumber,
              position: row.position,
              content: row.line.content,
              html: row.line.html,
            }));

          return (
            <div key={`${file.path}-${index}`} className="hunk">
              <div className="split-columns">
                <div className="split-pane">
                  {leftRows.map((row, lineIndex) => {
                    const lineThreads =
                      row.number != null ? threadLookup.get(`${activePath}::LEFT:${row.number}`) : undefined;
                    const canLineComment = canComment && row.number != null && row.type === "del";
                    const isActive = draftLine?.line === row.number && draftLine?.side === "LEFT";
                    return (
                      <div
                        key={lineIndex}
                        className={`split-line ${row.type} ${isActive ? "comment-active" : ""}`}
                      >
                        {canLineComment ? (
                          <button
                            type="button"
                            className="line-num line-num-button"
                            onClick={() => toggleDraft(row.number!, "LEFT", row.position)}
                            aria-label={`Comment on line ${row.number}`}
                          >
                            {row.number ?? ""}
                          </button>
                        ) : (
                          <span className="line-num">{row.number ?? ""}</span>
                        )}
                        <span className="marker">{marker(row.type)}</span>
                        {renderContent(row.content, row.html)}
                        {canLineComment ? (
                          <button
                            type="button"
                            className="comment-action"
                            onClick={() => toggleDraft(row.number!, "LEFT", row.position)}
                            aria-label="Add comment"
                          >
                            +
                          </button>
                        ) : null}
                        {lineThreads?.length ? (
                          <span className="comment-count">{lineThreads.length}</span>
                        ) : null}
                        {draftLine && draftLine.line === row.number && draftLine.side === "LEFT" ? (
                          <div className="comment-draft">
                            <textarea
                              className="comment-input"
                              rows={3}
                              value={draftBody}
                              onChange={(event) => setDraftBody(event.target.value)}
                              placeholder="Add a comment"
                            />
                            <div className="comment-actions">
                              <button type="button" className="comment-cancel" onClick={() => setDraftLine(null)}>
                                Cancel
                              </button>
                              {reviewPendingId ? null : (
                                <button
                                  type="button"
                                  className="comment-submit ghost"
                                  onClick={async () => {
                                    if (!onStartReview || !draftLine) return;
                                    const reviewId = await onStartReview();
                                    if (!reviewId) return;
                                    await onAddComment?.({
                                      path: activePath,
                                      line: draftLine.line,
                                      side: draftLine.side,
                                      position: draftLine.position,
                                      body: draftBody,
                                      reviewId,
                                    });
                                    setDraftLine(null);
                                    setDraftBody("");
                                  }}
                                  disabled={!draftBody.trim()}
                                >
                                  Start review
                                </button>
                              )}
                              <button
                                type="button"
                                className="comment-submit"
                                onClick={async () => {
                                  if (!onAddComment || !draftLine) return;
                                  await onAddComment({
                                    path: activePath,
                                    line: draftLine.line,
                                    side: draftLine.side,
                                    position: draftLine.position,
                                    body: draftBody,
                                    reviewId: reviewPendingId ?? undefined,
                                  });
                                  setDraftLine(null);
                                  setDraftBody("");
                                }}
                                disabled={!draftBody.trim()}
                              >
                                {reviewPendingId ? "Add to review" : "Add comment"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {lineThreads?.map((thread) => (
                          <CommentThread
                            key={thread.id}
                            thread={thread}
                            canReply={canComment}
                            canEdit={Boolean(currentUserLogin)}
                            currentUserLogin={currentUserLogin}
                            editingId={editingId}
                            editBody={editBody}
                            setEditingId={setEditingId}
                            setEditBody={setEditBody}
                            onEdit={onEditComment}
                            onDelete={onDeleteComment}
                            pendingCommentIds={pendingCommentIds}
                            onReply={onReplyComment}
                            replyingTo={replyingTo}
                            setReplyingTo={setReplyingTo}
                            replyBody={replyBody}
                            setReplyBody={setReplyBody}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div className="split-pane">
                  {rightRows.map((row, lineIndex) => {
                    const lineThreads =
                      row.number != null ? threadLookup.get(`${activePath}::RIGHT:${row.number}`) : undefined;
                    const canLineComment = canComment && row.number != null;
                    const isActive = draftLine?.line === row.number && draftLine?.side === "RIGHT";
                    return (
                      <div
                        key={lineIndex}
                        className={`split-line ${row.type} ${isActive ? "comment-active" : ""}`}
                      >
                        {canLineComment ? (
                          <button
                            type="button"
                            className="line-num line-num-button"
                            onClick={() => toggleDraft(row.number!, "RIGHT", row.position)}
                            aria-label={`Comment on line ${row.number}`}
                          >
                            {row.number ?? ""}
                          </button>
                        ) : (
                          <span className="line-num">{row.number ?? ""}</span>
                        )}
                        <span className="marker">{marker(row.type)}</span>
                        {renderContent(row.content, row.html)}
                        {canLineComment ? (
                          <button
                            type="button"
                            className="comment-action"
                            onClick={() => toggleDraft(row.number!, "RIGHT", row.position)}
                            aria-label="Add comment"
                          >
                            +
                          </button>
                        ) : null}
                        {lineThreads?.length ? (
                          <span className="comment-count">{lineThreads.length}</span>
                        ) : null}
                        {draftLine && draftLine.line === row.number && draftLine.side === "RIGHT" ? (
                          <div className="comment-draft">
                            <textarea
                              className="comment-input"
                              rows={3}
                              value={draftBody}
                              onChange={(event) => setDraftBody(event.target.value)}
                              placeholder="Add a comment"
                            />
                            <div className="comment-actions">
                              <button type="button" className="comment-cancel" onClick={() => setDraftLine(null)}>
                                Cancel
                              </button>
                              {reviewPendingId ? null : (
                                <button
                                  type="button"
                                  className="comment-submit ghost"
                                  onClick={async () => {
                                    if (!onStartReview || !draftLine) return;
                                    const reviewId = await onStartReview();
                                    if (!reviewId) return;
                                    await onAddComment?.({
                                      path: activePath,
                                      line: draftLine.line,
                                      side: draftLine.side,
                                      position: draftLine.position,
                                      body: draftBody,
                                      reviewId,
                                    });
                                    setDraftLine(null);
                                    setDraftBody("");
                                  }}
                                  disabled={!draftBody.trim()}
                                >
                                  Start review
                                </button>
                              )}
                              <button
                                type="button"
                                className="comment-submit"
                                onClick={async () => {
                                  if (!onAddComment || !draftLine) return;
                                  await onAddComment({
                                    path: activePath,
                                    line: draftLine.line,
                                    side: draftLine.side,
                                    position: draftLine.position,
                                    body: draftBody,
                                    reviewId: reviewPendingId ?? undefined,
                                  });
                                  setDraftLine(null);
                                  setDraftBody("");
                                }}
                                disabled={!draftBody.trim()}
                              >
                                {reviewPendingId ? "Add to review" : "Add comment"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {lineThreads?.map((thread) => (
                          <CommentThread
                            key={thread.id}
                            thread={thread}
                            canReply={canComment}
                            canEdit={Boolean(currentUserLogin)}
                            currentUserLogin={currentUserLogin}
                            editingId={editingId}
                            editBody={editBody}
                            setEditingId={setEditingId}
                            setEditBody={setEditBody}
                            onEdit={onEditComment}
                            onDelete={onDeleteComment}
                            pendingCommentIds={pendingCommentIds}
                            onReply={onReplyComment}
                            replyingTo={replyingTo}
                            setReplyingTo={setReplyingTo}
                            replyBody={replyBody}
                            setReplyBody={setReplyBody}
                          />
                        ))}
                      </div>
                    );
                  })}
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

function CommentThread({
  thread,
  canReply,
  canEdit,
  currentUserLogin,
  editingId,
  editBody,
  setEditingId,
  setEditBody,
  onEdit,
  onDelete,
  onReply,
  pendingCommentIds,
  replyingTo,
  setReplyingTo,
  replyBody,
  setReplyBody,
}: {
  thread: ReviewThread;
  canReply: boolean;
  canEdit: boolean;
  currentUserLogin: string | null;
  editingId: number | null;
  editBody: string;
  setEditingId: (value: number | null) => void;
  setEditBody: (value: string) => void;
  onEdit?: (input: { commentId: number; body: string }) => Promise<void>;
  onDelete?: (commentId: number) => Promise<void>;
  onReply?: (input: { commentId: number; body: string }) => Promise<void>;
  pendingCommentIds?: Set<number>;
  replyingTo: number | null;
  setReplyingTo: (value: number | null) => void;
  replyBody: string;
  setReplyBody: (value: string) => void;
}) {
  return (
    <div className="comment-thread">
      {thread.comments.map((comment) => {
        const isEditing = editingId === comment.id;
        const isDraft = comment.id < 0 || (pendingCommentIds?.has(comment.id) ?? false);
        const canEditComment = canEdit && currentUserLogin && comment.user.login === currentUserLogin;
        return (
          <div key={comment.id} className="comment">
            <div className="comment-meta">
              {comment.user.avatarUrl ? (
                <img src={comment.user.avatarUrl} alt={comment.user.login} className="comment-avatar" />
              ) : null}
              <span className="comment-author">{comment.user.login}</span>
              <span className="comment-time">{new Date(comment.createdAt).toLocaleString()}</span>
              {isDraft ? <span className="comment-draft-pill">Draft</span> : null}
              {canEditComment ? (
                <div className="comment-tools">
                  <button
                    type="button"
                    className="comment-tool"
                    onClick={() => {
                      setEditingId(comment.id);
                      setEditBody(comment.body);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="comment-tool"
                    onClick={() => onDelete?.(comment.id)}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
            {isEditing ? (
              <div className="comment-edit">
                <textarea
                  className="comment-input"
                  rows={2}
                  value={editBody}
                  onChange={(event) => setEditBody(event.target.value)}
                />
                <div className="comment-actions">
                  <button type="button" className="comment-cancel" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="comment-submit"
                    disabled={!editBody.trim()}
                    onClick={async () => {
                      if (!onEdit) return;
                      await onEdit({ commentId: comment.id, body: editBody });
                      setEditingId(null);
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="comment-body">{comment.body}</div>
            )}
          </div>
        );
      })}
      {canReply ? (
        <div className="comment-reply">
          {replyingTo === thread.id ? (
            <>
              <textarea
                className="comment-input"
                rows={2}
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                placeholder="Reply"
              />
              <div className="comment-actions">
                <button type="button" className="comment-cancel" onClick={() => setReplyingTo(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="comment-submit"
                  disabled={!replyBody.trim()}
                  onClick={async () => {
                    if (!onReply) return;
                    await onReply({ commentId: thread.id, body: replyBody });
                    setReplyingTo(null);
                    setReplyBody("");
                  }}
                >
                  Reply
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="comment-reply-button" onClick={() => setReplyingTo(thread.id)}>
              Reply
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
