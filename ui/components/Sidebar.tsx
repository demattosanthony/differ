import React from "react";
import type { DiffData, DiffFile } from "../types";
import type { TreeNode } from "../utils/tree";
import { FileIcon } from "./FileIcon";

type SidebarProps = {
  data: DiffData | null;
  files: DiffFile[];
  tree: TreeNode[];
  activePath: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  expanded: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  onOpenSettings: () => void;
};

export function Sidebar({
  data,
  files,
  tree,
  activePath,
  query,
  onQueryChange,
  expanded,
  onToggleDir,
  onSelectFile,
  onOpenSettings,
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
        </button>
      );
    });

  return (
    <aside className="filelist">
      <div className="sidebar-head">
        <div className="sidebar-top">
          <div className="repo-name">{data?.repo.name ?? "Loading"}</div>
        </div>
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
