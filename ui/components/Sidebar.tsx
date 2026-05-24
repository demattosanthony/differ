import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type {
  ChangeSectionId,
  DiffData,
  DiffFile,
  DiffSection,
  ProjectFilesData,
  PullRequestContextData,
} from "../types";

export type SidebarScope = "changes" | "files";
export type SidebarActivity = "files" | "changes" | "review";

type SidebarProps = {
  data: DiffData | null;
  pullRequestContext: PullRequestContextData | null;
  pullRequestStatus: "idle" | "loading" | "error";
  projectData: ProjectFilesData | null;
  compareLabel: string;
  scope: SidebarScope;
  activity: SidebarActivity;
  projectExpandedPaths: string[];
  projectDirectories: string[];
  onProjectExpandedPathsChange: (paths: string[]) => void;
  onCollapseProjectFolders: () => void;
  onActivityChange: (activity: SidebarActivity) => void;
  files: DiffFile[];
  projectFiles: string[];
  activePath: string | null;
  activeChange?: ChangeSectionId | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelectFile: (path: string, change?: ChangeSectionId) => void;
  onOpenSettings: () => void;
};

const fileTreeItemHeight = 24;

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
  "--trees-item-padding-x-override": "5px",
  "--trees-item-margin-x-override": "0px",
  "--trees-border-radius-override": "5px",
  "--trees-level-gap-override": "6px",
  "--trees-item-row-gap-override": "2px",
  "--trees-padding-inline-override": "8px",
} satisfies React.CSSProperties & Record<string, string>;

const fileTreeUnsafeCSS = `
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
`;

const sidebarPanelWidthStorageKey = "differ-sidebar-panel-width";
const defaultSidebarPanelWidth = 292;
const minSidebarPanelWidth = 224;
const maxSidebarPanelWidth = 640;
const minContentWidth = 360;
const activityRailWidth = 48;

export function Sidebar({
  data,
  pullRequestContext,
  pullRequestStatus,
  projectData,
  compareLabel,
  scope,
  activity,
  projectExpandedPaths,
  projectDirectories,
  onProjectExpandedPathsChange,
  onCollapseProjectFolders,
  onActivityChange,
  files,
  projectFiles,
  activePath,
  activeChange,
  query,
  onQueryChange,
  onSelectFile,
  onOpenSettings,
}: SidebarProps) {
  const sidebarShellRef = useRef<HTMLDivElement | null>(null);
  const resizeHandleRef = useRef<HTMLDivElement | null>(null);
  const initialSidebarPanelWidth = useMemo(getInitialSidebarPanelWidth, []);
  const [sidebarPanelWidth, setSidebarPanelWidth] = useState(initialSidebarPanelWidth.display);
  const panelWidthRef = useRef(sidebarPanelWidth);
  const preferredPanelWidthRef = useRef(initialSidebarPanelWidth.preferred);
  const changedPaths = useMemo(() => files.map((file) => file.path), [files]);
  const paths = useMemo(() => {
    if (scope === "files") return projectFiles;
    const needle = query.trim().toLowerCase();
    if (!needle) return changedPaths;
    return changedPaths.filter((filePath) => filePath.toLowerCase().includes(needle));
  }, [changedPaths, projectFiles, query, scope]);
  const isSectionedChanges = scope === "changes" && activity === "changes" && Boolean(data?.sections);
  const filteredSections = useMemo(() => {
    if (!isSectionedChanges) return [];
    return (data?.sections ?? []).map((section) => ({
      ...section,
      files: filterFiles(section.files, query),
    }));
  }, [data?.sections, isSectionedChanges, query]);
  const treePaths = useMemo(() => (isSectionedChanges ? [] : paths), [isSectionedChanges, paths]);
  const expandedPaths = useMemo(() => {
    if (isSectionedChanges) return [];
    if (scope === "changes") return getDirectoryPaths(treePaths);
    return query.trim() ? projectDirectories : projectExpandedPaths;
  }, [isSectionedChanges, projectDirectories, projectExpandedPaths, query, scope, treePaths]);
  const filesByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const pathSet = useMemo(() => new Set(treePaths), [treePaths]);
  const pathSetRef = useRef(pathSet);
  const filesByPathRef = useRef(filesByPath);
  const scopeRef = useRef(scope);
  const onSelectFileRef = useRef(onSelectFile);
  const syncingSelectionRef = useRef(false);
  pathSetRef.current = pathSet;
  filesByPathRef.current = filesByPath;
  scopeRef.current = scope;
  onSelectFileRef.current = onSelectFile;

  const applySidebarPanelWidth = useCallback((width: number) => {
    const nextWidth = clampSidebarPanelWidth(width);
    panelWidthRef.current = nextWidth;
    sidebarShellRef.current?.style.setProperty("--sidebar-panel-width", `${nextWidth}px`);
    resizeHandleRef.current?.setAttribute("aria-valuenow", String(Math.round(nextWidth)));
    return nextWidth;
  }, []);

  const commitSidebarPanelWidth = useCallback((width: number) => {
    const preferredWidth = clampPreferredSidebarPanelWidth(width);
    preferredPanelWidthRef.current = preferredWidth;
    const currentWidth = panelWidthRef.current;
    const nextWidth = applySidebarPanelWidth(preferredWidth);
    if (nextWidth !== currentWidth) setSidebarPanelWidth(nextWidth);
    if (typeof window !== "undefined") {
      localStorage.setItem(sidebarPanelWidthStorageKey, String(preferredWidth));
    }
  }, [applySidebarPanelWidth]);

  const startSidebarResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startWidth = panelWidthRef.current;
    let frame = 0;
    let pendingWidth = startWidth;

    const updateWidth = () => {
      frame = 0;
      applySidebarPanelWidth(pendingWidth);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      pendingWidth = startWidth + moveEvent.clientX - startX;
      if (frame) return;
      frame = requestAnimationFrame(updateWidth);
    };

    const finishResize = () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      document.body.classList.remove("resizing-sidebar");
      commitSidebarPanelWidth(panelWidthRef.current);
    };

    document.body.classList.add("resizing-sidebar");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
  }, [applySidebarPanelWidth, commitSidebarPanelWidth]);

  const handleResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16;
    let nextWidth: number | null = null;

    if (event.key === "ArrowLeft") nextWidth = panelWidthRef.current - step;
    if (event.key === "ArrowRight") nextWidth = panelWidthRef.current + step;
    if (event.key === "Home") nextWidth = minSidebarPanelWidth;
    if (event.key === "End") nextWidth = getSidebarPanelMaxWidth();

    if (nextWidth === null) return;
    event.preventDefault();
    commitSidebarPanelWidth(nextWidth);
  }, [commitSidebarPanelWidth]);

  useEffect(() => {
    const handleWindowResize = () => {
      const nextWidth = clampSidebarPanelWidth(preferredPanelWidthRef.current);
      if (nextWidth === panelWidthRef.current) return;
      applySidebarPanelWidth(preferredPanelWidthRef.current);
      setSidebarPanelWidth(nextWidth);
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [applySidebarPanelWidth]);

  const { model } = useFileTree({
    density: "compact",
    itemHeight: fileTreeItemHeight,
    flattenEmptyDirectories: false,
    initialExpansion: "closed",
    initialExpandedPaths: expandedPaths,
    initialSelectedPaths: activePath ? [activePath] : [],
    paths: treePaths,
    fileTreeSearchMode: "hide-non-matches",
    unsafeCSS: fileTreeUnsafeCSS,
    renderRowDecoration: ({ item }) => {
      if (scopeRef.current === "files") return null;
      if (item.kind !== "file") return null;
      const file = filesByPathRef.current.get(item.path);
      if (!file) return null;
      return { text: `+${file.additions} -${file.deletions}` };
    },
    onSelectionChange: (selectedPaths) => {
      if (syncingSelectionRef.current) return;
      const selectedPath = selectedPaths[0];
      if (!selectedPath || !pathSetRef.current.has(selectedPath)) return;
      if (scopeRef.current === "files" && selectedPath.endsWith("/")) return;
      onSelectFileRef.current(selectedPath);
    },
  });

  useEffect(() => {
    model.resetPaths(treePaths, {
      initialExpandedPaths: expandedPaths,
    });
  }, [expandedPaths, model, treePaths]);

  useEffect(() => {
    model.setSearch(query.trim() || null);
  }, [model, query]);

  useEffect(() => {
    if (isSectionedChanges) return;
    syncingSelectionRef.current = true;
    try {
      for (const selectedPath of model.getSelectedPaths()) {
        if (selectedPath !== activePath) model.getItem(selectedPath)?.deselect();
      }
      if (!activePath) return;
      const item = model.getItem(activePath);
      if (!item || item.isDirectory()) return;
      if (!item.isSelected()) item.select();
      model.scrollToPath(activePath, { focus: false, offset: "nearest" });
    } finally {
      syncingSelectionRef.current = false;
    }
  }, [activePath, isSectionedChanges, model, treePaths]);

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

  const emptyMessage = getEmptyMessage({ activity, data, files, paths, projectData, projectFiles, scope });

  return (
    <div
      className="sidebar-shell"
      ref={sidebarShellRef}
      style={{ "--sidebar-panel-width": `${sidebarPanelWidth}px` } as React.CSSProperties}
    >
      <aside className="activity-rail" aria-label="Primary views">
        <div className="rail-logo" aria-hidden="true">D</div>
        <nav className="activity-nav" aria-label="Primary views">
          <ActivityButton
            activity="files"
            active={activity === "files"}
            label="Files"
            onClick={onActivityChange}
          />
          <ActivityButton
            activity="changes"
            active={activity === "changes"}
            label="Working Changes"
            onClick={onActivityChange}
          />
          <ActivityButton
            activity="review"
            active={activity === "review"}
            label="Branch Review"
            onClick={onActivityChange}
          />
        </nav>
        <button type="button" className="activity-button rail-settings" aria-label="Settings" onClick={onOpenSettings}>
          <ActivityIcon activity="settings" />
        </button>
      </aside>

      <aside className="filelist">
        <div className="sidebar-head">
          <div className="sidebar-heading">
            <div className="sidebar-title-row">
              <div className="sidebar-title">{getActivityTitle(activity)}</div>
              {scope === "files" ? (
                <button
                  type="button"
                  className="sidebar-icon-button"
                  aria-label="Collapse all folders"
                  title="Collapse all folders"
                  disabled={projectExpandedPaths.length === 0}
                  onClick={onCollapseProjectFolders}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M4 6.5h12" />
                    <path d="M6.5 10h7" />
                    <path d="M8.5 13.5h3" />
                    <path d="M7 3.5 10 1l3 2.5" />
                  </svg>
                </button>
              ) : null}
            </div>
            <div className="sidebar-context">
              <span>{data?.repo.name ?? "Loading"}</span>
              <span className="context-separator">/</span>
              <span className="compare-value">{getActivityContext(activity, compareLabel)}</span>
            </div>
          </div>
          {scope === "changes" ? (
            <div className="summary">
              <span>{data?.summary.files ?? 0} {activity === "changes" ? "changes" : "files"}</span>
              <span className="add">+{data?.summary.additions ?? 0}</span>
              <span className="del">-{data?.summary.deletions ?? 0}</span>
            </div>
          ) : null}
          {activity === "review" ? (
            <PullRequestSummary context={pullRequestContext} status={pullRequestStatus} />
          ) : null}
          <input
            className="search"
            placeholder={getSearchPlaceholder(activity)}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
        <div className="sidebar-tree">
          {isSectionedChanges ? (
            <ChangeSections
              sections={filteredSections}
              activePath={activePath}
              activeChange={activeChange}
              query={query}
              onSelectFile={onSelectFile}
            />
          ) : paths.length === 0 ? (
            <div className="empty centered">{emptyMessage}</div>
          ) : (
            <FileTree
              className="diff-file-tree"
              model={model}
              style={fileTreeStyle}
            />
          )}
        </div>
      </aside>
      <div
        ref={resizeHandleRef}
        className="sidebar-resize-handle"
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemin={minSidebarPanelWidth}
        aria-valuemax={maxSidebarPanelWidth}
        aria-valuenow={Math.round(sidebarPanelWidth)}
        tabIndex={0}
        title="Resize sidebar"
        onPointerDown={startSidebarResize}
        onKeyDown={handleResizeKeyDown}
      />
    </div>
  );
}

function PullRequestSummary({
  context,
  status,
}: {
  context: PullRequestContextData | null;
  status: "idle" | "loading" | "error";
}) {
  if (status === "loading") {
    return <div className="pr-summary muted">Loading pull request…</div>;
  }

  if (status === "error") {
    return <div className="pr-summary muted">Unable to load pull request</div>;
  }

  if (!context?.repository) {
    return <div className="pr-summary muted">No GitHub remote</div>;
  }

  if (!context.pullRequest) {
    return <div className="pr-summary muted">No open PR for {context.currentBranch ?? "this branch"}</div>;
  }

  return (
    <div className="pr-summary">
      <div className="pr-title">
        <span className="pr-number">#{context.pullRequest.number}</span>
        <span>{context.pullRequest.title}</span>
      </div>
      <div className="pr-meta">
        <span>{context.pullRequest.author ?? "unknown"}</span>
        <span>{context.files.length} files</span>
        <span>{context.pullRequest.baseRef} &lt;- {context.pullRequest.headRef}</span>
      </div>
    </div>
  );
}

function ActivityButton({
  activity,
  active,
  label,
  onClick,
}: {
  activity: SidebarActivity;
  active: boolean;
  label: string;
  onClick: (activity: SidebarActivity) => void;
}) {
  return (
    <button
      type="button"
      className={`activity-button ${active ? "active" : ""}`}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={() => onClick(activity)}
    >
      <ActivityIcon activity={activity} />
    </button>
  );
}

function ActivityIcon({ activity }: { activity: SidebarActivity | "settings" }) {
  if (activity === "files") {
    return (
      <svg viewBox="0 0 24 24" className="activity-icon" aria-hidden="true">
        <path d="M4 5.5h5l1.8 2H20v11H4z" />
        <path d="M4 9h16" />
      </svg>
    );
  }

  if (activity === "changes") {
    return (
      <svg viewBox="0 0 24 24" className="activity-icon" aria-hidden="true">
        <path d="M6 3.5h8l4 4v13H6z" />
        <path d="M14 3.5v4h4" />
        <path d="M9 11h5" />
        <path d="M11.5 8.5v5" />
        <path d="M9 16.5h6" />
      </svg>
    );
  }

  if (activity === "review") {
    return (
      <svg viewBox="0 0 24 24" className="activity-icon" aria-hidden="true">
        <circle cx="7" cy="6" r="2" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="12" r="2" />
        <path d="M7 8v8" />
        <path d="M7 10h3.5a4 4 0 0 1 4 4v2" />
        <path d="M14.5 12H17" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="activity-icon" aria-hidden="true">
      <path d="M10.2 4h3.6l.6 2.1a7.3 7.3 0 0 1 1.5.9l2.1-.7 1.8 3.1-1.6 1.4a7 7 0 0 1 0 1.8l1.6 1.4-1.8 3.1-2.1-.7a7.3 7.3 0 0 1-1.5.9l-.6 2.1h-3.6l-.6-2.1a7.3 7.3 0 0 1-1.5-.9l-2.1.7-1.8-3.1 1.6-1.4a7 7 0 0 1 0-1.8L4.2 9.4 6 6.3l2.1.7a7.3 7.3 0 0 1 1.5-.9z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function ChangeSections({
  sections,
  activePath,
  activeChange,
  query,
  onSelectFile,
}: {
  sections: DiffSection[];
  activePath: string | null;
  activeChange?: ChangeSectionId | null;
  query: string;
  onSelectFile: (path: string, change?: ChangeSectionId) => void;
}) {
  if (!sections.some((section) => section.summary.files > 0)) {
    return <div className="empty centered">No changes</div>;
  }

  return (
    <div className="change-sections">
      {sections.map((section) => (
        <ChangeSectionTree
          key={section.id}
          section={section}
          activePath={activeChange === section.id ? activePath : null}
          query={query}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  );
}

function ChangeSectionTree({
  section,
  activePath,
  query,
  onSelectFile,
}: {
  section: DiffSection;
  activePath: string | null;
  query: string;
  onSelectFile: (path: string, change?: ChangeSectionId) => void;
}) {
  const paths = useMemo(() => section.files.map((file) => file.path), [section.files]);
  const expandedPaths = useMemo(() => getDirectoryPaths(paths), [paths]);
  const treeHeight = Math.max(fileTreeItemHeight, Math.min(360, (paths.length + expandedPaths.length) * fileTreeItemHeight));
  const pathSet = useMemo(() => new Set(paths), [paths]);
  const filesByPath = useMemo(() => new Map(section.files.map((file) => [file.path, file])), [section.files]);
  const pathSetRef = useRef(pathSet);
  const filesByPathRef = useRef(filesByPath);
  const onSelectFileRef = useRef(onSelectFile);
  const syncingSelectionRef = useRef(false);
  pathSetRef.current = pathSet;
  filesByPathRef.current = filesByPath;
  onSelectFileRef.current = onSelectFile;
  const { model } = useFileTree({
    density: "compact",
    itemHeight: fileTreeItemHeight,
    flattenEmptyDirectories: true,
    initialExpansion: "closed",
    initialExpandedPaths: expandedPaths,
    initialSelectedPaths: activePath ? [activePath] : [],
    paths,
    fileTreeSearchMode: "hide-non-matches",
    unsafeCSS: fileTreeUnsafeCSS,
    renderRowDecoration: ({ item }) => {
      if (item.kind !== "file") return null;
      const file = filesByPathRef.current.get(item.path);
      if (!file) return null;
      return { text: `+${file.additions} -${file.deletions}` };
    },
    onSelectionChange: (selectedPaths) => {
      if (syncingSelectionRef.current) return;
      const selectedPath = selectedPaths[0];
      if (!selectedPath || !pathSetRef.current.has(selectedPath)) return;
      onSelectFileRef.current(selectedPath, section.id);
    },
  });

  useEffect(() => {
    model.resetPaths(paths, { initialExpandedPaths: expandedPaths });
  }, [expandedPaths, model, paths]);

  useEffect(() => {
    model.setSearch(query.trim() || null);
  }, [model, query]);

  useEffect(() => {
    syncingSelectionRef.current = true;
    try {
      for (const selectedPath of model.getSelectedPaths()) {
        if (selectedPath !== activePath) model.getItem(selectedPath)?.deselect();
      }
      if (!activePath) return;
      const item = model.getItem(activePath);
      if (!item || item.isDirectory()) return;
      if (!item.isSelected()) item.select();
      model.scrollToPath(activePath, { focus: false, offset: "nearest" });
    } finally {
      syncingSelectionRef.current = false;
    }
  }, [activePath, model, paths]);

  return (
    <section className="change-section">
      <div className="change-section-header">
        <span>{section.title}</span>
        <span className="change-section-summary">
          {section.summary.files}
          <span className="add">+{section.summary.additions}</span>
          <span className="del">-{section.summary.deletions}</span>
        </span>
      </div>
      {paths.length === 0 ? (
        <div className="section-empty">{query.trim() ? "No matching files" : "No changes"}</div>
      ) : (
        <div className="change-section-tree">
          <FileTree className="diff-file-tree" model={model} style={{ ...fileTreeStyle, height: `${treeHeight}px` }} />
        </div>
      )}
    </section>
  );
}

function getActivityTitle(activity: SidebarActivity) {
  if (activity === "files") return "Files";
  if (activity === "review") return "Branch Review";
  return "Changes";
}

function getActivityContext(activity: SidebarActivity, compareLabel: string) {
  if (activity === "files") return "Project";
  if (activity === "review") return compareLabel;
  return "Working Tree";
}

function getSearchPlaceholder(activity: SidebarActivity) {
  if (activity === "files") return "Filter files";
  if (activity === "review") return "Filter review";
  return "Filter changes";
}

function getInitialSidebarPanelWidth() {
  if (typeof window === "undefined") {
    return {
      preferred: defaultSidebarPanelWidth,
      display: defaultSidebarPanelWidth,
    };
  }
  const stored = localStorage.getItem(sidebarPanelWidthStorageKey);
  if (stored === null) {
    return {
      preferred: defaultSidebarPanelWidth,
      display: clampSidebarPanelWidth(defaultSidebarPanelWidth),
    };
  }
  const parsed = Number(stored);
  const preferred = clampPreferredSidebarPanelWidth(Number.isFinite(parsed) ? parsed : defaultSidebarPanelWidth);
  return {
    preferred,
    display: clampSidebarPanelWidth(preferred),
  };
}

function clampPreferredSidebarPanelWidth(width: number) {
  return Math.round(Math.min(maxSidebarPanelWidth, Math.max(minSidebarPanelWidth, width)));
}

function clampSidebarPanelWidth(width: number) {
  return Math.round(Math.min(getSidebarPanelMaxWidth(), Math.max(minSidebarPanelWidth, width)));
}

function getSidebarPanelMaxWidth() {
  if (typeof window === "undefined") return maxSidebarPanelWidth;
  return Math.max(minSidebarPanelWidth, Math.min(maxSidebarPanelWidth, window.innerWidth - activityRailWidth - minContentWidth));
}

function filterFiles(files: DiffFile[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return files;
  return files.filter((file) => file.path.toLowerCase().includes(needle));
}

function getEmptyMessage({
  activity,
  data,
  files,
  paths,
  projectData,
  projectFiles,
  scope,
}: {
  activity: SidebarActivity;
  data: DiffData | null;
  files: DiffFile[];
  paths: string[];
  projectData: ProjectFilesData | null;
  projectFiles: string[];
  scope: SidebarScope;
}) {
  if (scope === "changes") {
    if (!data) return "Loading changes…";
    if (!data.files.length) return activity === "review" ? "No review changes" : "No changes";
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
