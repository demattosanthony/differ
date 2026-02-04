import React from "react";
import type { CompareMode, CompareSpec, DiffData, DiffFile } from "../types";
import type { TreeNode } from "../utils/tree";
import { FileIcon } from "./FileIcon";

type SidebarProps = {
  data: DiffData | null;
  compareLabel: string;
  compare: CompareSpec;
  onCompareModeChange: (mode: CompareMode) => void;
  files: DiffFile[];
  tree: TreeNode[];
  activePath: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  expanded: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  onOpenSettings: () => void;
  onToggleViewed?: (path: string, nextViewed: boolean) => void;
  canReview?: boolean;
  reviewPendingId?: number | null;
  reviewEvent?: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
  reviewBody?: string;
  reviewBusy?: boolean;
  onReviewBodyChange?: (value: string) => void;
  onReviewEventChange?: (value: "COMMENT" | "APPROVE" | "REQUEST_CHANGES") => void;
  onStartReview?: () => void;
  onSubmitReview?: () => void;
};

export function Sidebar({
  data,
  compareLabel,
  compare,
  onCompareModeChange,
  files,
  tree,
  activePath,
  query,
  onQueryChange,
  expanded,
  onToggleDir,
  onSelectFile,
  onOpenSettings,
  onToggleViewed,
  canReview = false,
  reviewPendingId = null,
  reviewEvent = "COMMENT",
  reviewBody = "",
  reviewBusy = false,
  onReviewBodyChange,
  onReviewEventChange,
  onStartReview,
  onSubmitReview,
}: SidebarProps) {
  const renderTree = (nodes: TreeNode[], depth = 0) =>
    nodes.map((node) => {
      if (node.type === "dir") {
        const isOpen = expanded.has(node.path);
        return (
          <div key={node.path} className="tree-node">
            <button
              type="button"
              className={`tree-row tree-dir ${isOpen ? "open" : ""}`}
              style={{ "--depth": depth } as React.CSSProperties}
              onClick={() => onToggleDir(node.path)}
            >
              <span className="tree-chevron" aria-hidden="true">
                <svg viewBox="0 0 16 16" className="icon">
                  <path d={isOpen ? "M4 6l4 4 4-4" : "M6 4l4 4-4 4"} />
                </svg>
              </span>
              <span className="tree-icon" aria-hidden="true">
                <FileIcon path={node.path} type="directory" expanded={isOpen} className="icon" />
              </span>
              <span className="tree-name">{node.name}</span>
            </button>
            {isOpen && <div className="tree-children">{renderTree(node.children, depth + 1)}</div>}
          </div>
        );
      }

      return (
        <button
          key={node.path}
          type="button"
          className={`tree-row tree-file ${node.path === activePath ? "active" : ""}`}
          style={{ "--depth": depth } as React.CSSProperties}
          onClick={() => onSelectFile(node.path)}
        >
          <span className="tree-chevron spacer" aria-hidden="true" />
          <span className="tree-icon" aria-hidden="true">
            <FileIcon path={node.path} type="file" className="icon" />
          </span>
          <span className="tree-name">{node.name}</span>
          <span className="file-stats">
            <span className="add">+{node.file.additions}</span>
            <span className="del">-{node.file.deletions}</span>
          </span>
          {typeof node.file.viewed === "boolean" && onToggleViewed ? (
            <span
              role="button"
              tabIndex={0}
              className={`viewed-toggle ${node.file.viewed ? "active" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleViewed(node.path, !node.file.viewed);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onToggleViewed(node.path, !node.file.viewed);
              }}
              aria-pressed={node.file.viewed}
            >
              ✓
            </span>
          ) : null}
        </button>
      );
    });

  return (
    <aside className="filelist">
      <div className="sidebar-head">
        <div className="sidebar-top">
          <div className="repo-name">{data?.repo.name ?? "Loading"}</div>
        </div>
        <div className="compare-context">
          <span className="compare-label">Compare</span>
          <span className="compare-value">{compareLabel}</span>
        </div>
        <div className="compare-tabs" role="tablist" aria-label="Compare mode">
          <button
            type="button"
            role="tab"
            aria-selected={compare.mode === "working"}
            className={`tab ${compare.mode === "working" ? "active" : ""}`}
            onClick={() => onCompareModeChange("working")}
          >
            Working
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={compare.mode === "range"}
            className={`tab ${compare.mode === "range" ? "active" : ""}`}
            onClick={() => onCompareModeChange("range")}
          >
            Branch
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={compare.mode === "pr"}
            className={`tab ${compare.mode === "pr" ? "active" : ""}`}
            onClick={() => onCompareModeChange("pr")}
          >
            PR
          </button>
        </div>
        {compare.mode === "pr" ? (
          <div className="pr-panel">
            <div className="pr-title">
              {data?.pr ? `PR #${data.pr.number}: ${data.pr.title}` : "Pull Request"}
            </div>
            {data?.pr?.headRef ? (
              <div className="pr-refs">{data.pr.baseRef} -&gt; {data.pr.headRef}</div>
            ) : null}
          </div>
        ) : null}
        <div className="summary">
          <span>{data?.summary.files ?? 0} files</span>
          <span className="add">+{data?.summary.additions ?? 0}</span>
          <span className="del">-{data?.summary.deletions ?? 0}</span>
        </div>
        <input
          className="search"
          placeholder="Filter files"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div className="sidebar-tree">
        {files.length === 0 ? (
          <div className="empty centered">
            {data ? (data.files.length ? "No matching files" : "No changes") : "Loading changes…"}
          </div>
        ) : (
          renderTree(tree)
        )}
      </div>
      {compare.mode === "pr" ? (
        <div className="review-panel">
          <div className="review-header">
            <span>Review</span>
            {reviewPendingId ? <span className="review-status">Pending #{reviewPendingId}</span> : null}
          </div>
          {canReview ? (
            <>
              <textarea
                className="review-input"
                rows={3}
                placeholder="Review summary"
                value={reviewBody}
                onChange={(event) => onReviewBodyChange?.(event.target.value)}
              />
              <div className="review-actions">
                <select
                  className="review-select"
                  value={reviewEvent}
                  onChange={(event) =>
                    onReviewEventChange?.(event.target.value as "COMMENT" | "APPROVE" | "REQUEST_CHANGES")
                  }
                >
                  <option value="COMMENT">Comment</option>
                  <option value="APPROVE">Approve</option>
                  <option value="REQUEST_CHANGES">Request changes</option>
                </select>
                {reviewPendingId ? (
                  <button
                    type="button"
                    className="review-submit"
                    onClick={onSubmitReview}
                    disabled={reviewBusy}
                  >
                    Submit
                  </button>
                ) : (
                  <button
                    type="button"
                    className="review-submit"
                    onClick={onStartReview}
                    disabled={reviewBusy}
                  >
                    Start review
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="review-hint">Add a GitHub token in Settings to review.</div>
          )}
        </div>
      ) : null}
      <div className="sidebar-footer">
        <button type="button" className="settings-button" onClick={onOpenSettings}>
          <span className="settings-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" className="icon">
              <path d="M8.6 2h2.8l.4 1.8a5.9 5.9 0 0 1 1.6.9l1.7-.7 2 2-1 1.6c.3.6.6 1.2.7 1.8l1.8.4v2.8l-1.8.4a5.9 5.9 0 0 1-.7 1.8l1 1.6-2 2-1.7-.7a5.9 5.9 0 0 1-1.6.9l-.4 1.8H8.6l-.4-1.8a5.9 5.9 0 0 1-1.6-.9l-1.7.7-2-2 1-1.6a5.9 5.9 0 0 1-.7-1.8l-1.8-.4V9.2l1.8-.4c.1-.6.4-1.2.7-1.8l-1-1.6 2-2 1.7.7c.5-.4 1-.7 1.6-.9L8.6 2zm1.4 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z" />
            </svg>
          </span>
          Settings
        </button>
      </div>
    </aside>
  );
}
