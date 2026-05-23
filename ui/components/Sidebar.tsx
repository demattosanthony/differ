import React, { useEffect, useMemo, useRef } from "react";
import { FileTree, useFileTree, useFileTreeSelection } from "@pierre/trees/react";
import type { CompareMode, CompareSpec, DiffData, DiffFile, ProjectFilesData } from "../types";

export type SidebarScope = "changes" | "files";

type SidebarProps = {
  data: DiffData | null;
  projectData: ProjectFilesData | null;
  compareLabel: string;
  compare: CompareSpec;
  scope: SidebarScope;
  projectExpandedPaths: string[];
  projectDirectories: string[];
  onProjectExpandedPathsChange: (paths: string[]) => void;
  onScopeChange: (scope: SidebarScope) => void;
  onCompareModeChange: (mode: CompareMode) => void;
  files: DiffFile[];
  projectFiles: string[];
  activePath: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelectFile: (path: string) => void;
  onOpenSettings: () => void;
};

const fileTreeStyle = {
  backgroundColor: "var(--sidebar-bg)",
  color: "var(--text)",
  colorScheme: "inherit",
  height: "100%",
  "--trees-bg-override": "var(--sidebar-bg)",
  "--trees-bg-muted-override": "var(--panel)",
  "--trees-fg-override": "var(--text)",
  "--trees-fg-muted-override": "var(--muted)",
  "--trees-accent-override": "var(--folder)",
  "--trees-border-color-override": "var(--tree-border)",
  "--trees-indent-guide-bg-override": "var(--tree-border)",
  "--trees-focus-ring-color-override": "var(--selection-border)",
  "--trees-selected-bg-override": "color-mix(in srgb, var(--selection) 72%, transparent)",
  "--trees-selected-fg-override": "var(--title)",
  "--trees-selected-focused-border-color-override": "var(--selection-border)",
  "--trees-scrollbar-thumb-override": "var(--line)",
  "--trees-font-family-override": '"IBM Plex Sans", "Helvetica Neue", sans-serif',
  "--trees-font-size-override": "13px",
  "--trees-item-padding-x-override": "6px",
  "--trees-item-margin-x-override": "0px",
  "--trees-border-radius-override": "5px",
  "--trees-level-gap-override": "12px",
} satisfies React.CSSProperties & Record<string, string>;

export function Sidebar({
  data,
  projectData,
  compareLabel,
  compare,
  scope,
  projectExpandedPaths,
  projectDirectories,
  onProjectExpandedPathsChange,
  onScopeChange,
  onCompareModeChange,
  files,
  projectFiles,
  activePath,
  query,
  onQueryChange,
  onSelectFile,
  onOpenSettings,
}: SidebarProps) {
  const changedPaths = useMemo(() => files.map((file) => file.path), [files]);
  const paths = useMemo(() => {
    if (scope === "files") return projectFiles;
    const needle = query.trim().toLowerCase();
    if (!needle) return changedPaths;
    return changedPaths.filter((filePath) => filePath.toLowerCase().includes(needle));
  }, [changedPaths, projectFiles, query, scope]);
  const expandedPaths = useMemo(() => {
    if (scope === "changes") return getDirectoryPaths(paths);
    return query.trim() ? projectDirectories : projectExpandedPaths;
  }, [paths, projectDirectories, projectExpandedPaths, query, scope]);
  const filesByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const pathSet = useMemo(() => new Set(paths), [paths]);
  const filesByPathRef = useRef(filesByPath);
  filesByPathRef.current = filesByPath;
  const { model } = useFileTree({
    flattenEmptyDirectories: true,
    initialExpansion: "closed",
    initialExpandedPaths: expandedPaths,
    initialSelectedPaths: activePath ? [activePath] : [],
    paths,
    fileTreeSearchMode: "hide-non-matches",
    unsafeCSS: `
      :host {
        color: var(--trees-fg) !important;
        background: var(--trees-bg) !important;
      }

      [data-file-tree-virtualized-wrapper="true"],
      [data-file-tree-virtualized-root="true"],
      [data-file-tree-virtualized-scroll="true"],
      [data-file-tree-virtualized-list="true"],
      [data-file-tree-virtualized-sticky="true"],
      [role="tree"] {
        background: var(--trees-bg) !important;
      }

      [data-type="item"] {
        color: var(--trees-fg);
        background: var(--trees-bg) !important;
      }

      [data-type="item"]:hover:not([data-item-selected="true"]) {
        background: var(--trees-bg-muted) !important;
      }

      [data-item-selected="true"] {
        background: var(--trees-selected-bg) !important;
      }

      [data-item-type="folder"] > [data-item-section="icon"] {
        color: var(--trees-accent);
      }

      [data-item-type="folder"] > [data-item-section="content"] {
        color: var(--trees-fg);
        font-weight: 500;
      }

      [data-item-section="decoration"] {
        color: var(--trees-fg-muted);
        font-size: 11px;
        white-space: nowrap;
      }

      [data-item-selected="true"] [data-item-section="decoration"] {
        color: var(--trees-selected-fg);
      }
    `,
    renderRowDecoration: ({ item }) => {
      if (item.kind !== "file") return null;
      const file = filesByPathRef.current.get(item.path);
      if (!file) return null;
      return { text: `+${file.additions} -${file.deletions}` };
    },
  });
  const selectedPaths = useFileTreeSelection(model);

  useEffect(() => {
    model.resetPaths(paths, {
      initialExpandedPaths: expandedPaths,
    });
  }, [expandedPaths, model, paths]);

  useEffect(() => {
    model.setSearch(query.trim() || null);
  }, [model, query]);

  useEffect(() => {
    if (!activePath) return;
    const item = model.getItem(activePath);
    if (!item || item.isDirectory()) return;
    item.select();
    model.scrollToPath(activePath, { focus: false, offset: "nearest" });
  }, [activePath, model, paths]);

  useEffect(() => {
    const selectedPath = selectedPaths[0];
    if (!selectedPath || !pathSet.has(selectedPath)) return;
    if (scope === "files" && selectedPath.endsWith("/")) return;
    onSelectFile(selectedPath);
  }, [onSelectFile, pathSet, scope, selectedPaths]);

  useEffect(() => {
    if (scope !== "files") return;
    if (query.trim()) return;
    const syncExpandedPaths = () => {
      const expanded = projectDirectories.filter((dir) => {
        const item = model.getItem(dir);
        return item?.isDirectory() && "isExpanded" in item ? item.isExpanded() : false;
      });
      onProjectExpandedPathsChange(expanded);
    };
    return model.subscribe(syncExpandedPaths);
  }, [model, onProjectExpandedPathsChange, projectDirectories, query, scope]);

  const emptyMessage = getEmptyMessage({ data, files, paths, projectData, projectFiles, scope });

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
        </div>
        <div className="summary">
          <span>{data?.summary.files ?? 0} files</span>
          <span className="add">+{data?.summary.additions ?? 0}</span>
          <span className="del">-{data?.summary.deletions ?? 0}</span>
        </div>
        <div className="scope-tabs" role="tablist" aria-label="Sidebar scope">
          <button
            type="button"
            role="tab"
            aria-selected={scope === "changes"}
            className={`tab ${scope === "changes" ? "active" : ""}`}
            onClick={() => onScopeChange("changes")}
          >
            <span>Changes</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === "files"}
            className={`tab ${scope === "files" ? "active" : ""}`}
            onClick={() => onScopeChange("files")}
          >
            <span>Files</span>
          </button>
        </div>
        <input
          className="search"
          placeholder={scope === "changes" ? "Filter changes" : "Filter files"}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div className="sidebar-tree">
        {paths.length === 0 ? (
          <div className="empty centered">{emptyMessage}</div>
        ) : (
          <FileTree
            className="diff-file-tree"
            model={model}
            style={fileTreeStyle}
          />
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

function getEmptyMessage({
  data,
  files,
  paths,
  projectData,
  projectFiles,
  scope,
}: {
  data: DiffData | null;
  files: DiffFile[];
  paths: string[];
  projectData: ProjectFilesData | null;
  projectFiles: string[];
  scope: SidebarScope;
}) {
  if (scope === "changes") {
    if (!data) return "Loading changes…";
    if (!data.files.length) return "No changes";
    if (!files.length || !paths.length) return "No matching files";
    return "";
  }

  if (!projectData) return "Loading files…";
  if (!projectFiles.length) return "No files";
  if (!paths.length) return "No matching files";
  return "";
}

function getDirectoryPaths(paths: string[]) {
  const dirs = new Set<string>();
  for (const filePath of paths) {
    const normalized = filePath.endsWith("/") ? filePath.slice(0, -1) : filePath;
    const segments = normalized.split("/");
    const limit = filePath.endsWith("/") ? segments.length + 1 : segments.length;
    for (let index = 1; index < limit; index += 1) {
      dirs.add(`${segments.slice(0, index).join("/")}/`);
    }
  }
  return Array.from(dirs);
}
