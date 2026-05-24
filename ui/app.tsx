import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import type { ChangeSectionId, CompareSpec, DiffFile } from "./types";
import { themes, type ThemeId, type DiffViewMode } from "./themes";
import { useSelectedFile } from "./hooks/useSelectedFile";
import { useDiffData } from "./hooks/useDiffData";
import { useCompareOverride } from "./hooks/useCompareOverride";
import { useFileDiff } from "./hooks/useFileDiff";
import { useProjectFiles } from "./hooks/useProjectFiles";
import { usePullRequestContext } from "./hooks/usePullRequestContext";
import { usePullRequestReviewThreads } from "./hooks/usePullRequestReviewThreads";
import { useSourceFile } from "./hooks/useSourceFile";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { useTheme } from "./hooks/useTheme";
import { Sidebar, type SidebarActivity, type SidebarScope } from "./components/Sidebar";
import { DiffView } from "./components/DiffView";
import { SourceView } from "./components/SourceView";
import { SettingsModal } from "./components/SettingsModal";

const emptyDiffFiles: DiffFile[] = [];
const emptyProjectPaths: string[] = [];

function App() {
  const defaultThemeId: ThemeId = "vscode-dark";
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useLocalStorageState<DiffViewMode>("differ-view-mode", "stacked", {
    deserialize: (value) => (value === "split" ? "split" : "stacked"),
  });
  const [themeId, setThemeId] = useLocalStorageState<ThemeId>("differ-theme-id", defaultThemeId, {
    deserialize: (value) => (themes.some((theme) => theme.id === value) ? (value as ThemeId) : defaultThemeId),
  });
  const [showFullFile, setShowFullFile] = useLocalStorageState<boolean>("differ-full-file", false, {
    deserialize: (value) => value === "true",
  });
  const [sidebarActivity, setSidebarActivity] = useLocalStorageState<SidebarActivity>("differ-sidebar-activity", "changes", {
    deserialize: (value) => (value === "files" || value === "review" ? value : "changes"),
  });
  const sidebarScope: SidebarScope = sidebarActivity === "files" ? "files" : "changes";
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null);
  const [expandedProjectDirs, setExpandedProjectDirs] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pendingProjectRevealPathRef = useRef<string | null>(null);

  const { compareOverride, setCompareOverride, resetCompareOverride, hasCompareOverride } = useCompareOverride();
  const projectCompare = useMemo<CompareSpec>(() => ({ mode: "working" }), []);
  const { data, refreshToken } = useDiffData({ themeId, compare: compareOverride });
  const { data: pullRequestContext, status: pullRequestStatus } = usePullRequestContext({
    enabled: sidebarActivity === "review",
  });
  const { data: reviewThreadsData, status: reviewThreadsStatus } = usePullRequestReviewThreads({
    enabled: sidebarActivity === "review",
    pullRequestNumber: pullRequestContext?.pullRequest?.number ?? null,
  });
  const files = data?.files ?? emptyDiffFiles;
  const [selected, setSelected] = useSelectedFile(files);
  const active = files.find((file) => selected && matchesSelection(file, selected)) ?? files[0] ?? null;
  const repoRoot = data?.repo.root ?? null;
  const { data: projectData } = useProjectFiles({
    compare: projectCompare,
    expandedDirs: expandedProjectDirs,
    query: sidebarScope === "files" ? query : "",
    refreshToken,
  });
  const projectPaths = projectData?.paths ?? emptyProjectPaths;
  const projectFiles = useMemo(() => projectPaths.filter((filePath) => !filePath.endsWith("/")), [projectPaths]);
  const activeProjectPath = selectedProjectPath ?? active?.path ?? projectFiles[0] ?? null;
  const activeProjectHasDiff = Boolean(activeProjectPath && files.some((file) => file.path === activeProjectPath));
  const { diff: activeDiff, status: activeDiffStatus } = useFileDiff({
    enabled: sidebarScope === "changes" && Boolean(active?.path),
    filePath: active?.path ?? null,
    themeId,
    compare: compareOverride,
    change: active?.change ?? null,
    full: showFullFile,
    refreshToken,
  });
  const { data: activeSource, status: activeSourceStatus } = useSourceFile({
    enabled: sidebarScope === "files" && Boolean(activeProjectPath),
    filePath: activeProjectPath,
    themeId,
    compare: projectCompare,
    refreshToken,
  });

  useTheme(themeId);

  const compareDisplay: CompareSpec = data?.compare ?? compareOverride ?? { mode: "working" };
  const compareLabel = useMemo(() => formatCompareLabel(compareDisplay), [compareDisplay]);
  const emptyDiffMessage = data ? (files.length ? "No matching files" : "No changes") : "Loading diff…";

  useEffect(() => {
    if (!repoRoot || typeof window === "undefined") return;
    const raw = localStorage.getItem(getProjectTreeStorageKey(repoRoot));
    if (!raw) {
      setExpandedProjectDirs([]);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const savedPaths = Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
      setExpandedProjectDirs(normalizeSavedProjectDirs(savedPaths));
    } catch {
      setExpandedProjectDirs([]);
    }
  }, [repoRoot]);

  useEffect(() => {
    if (sidebarActivity !== "files" && compareOverride?.mode === "range") {
      setSidebarActivity("review");
      return;
    }

    if (sidebarActivity === "review" && compareOverride?.mode !== "range") {
      setCompareOverride({ mode: "range" });
    }
  }, []);

  useEffect(() => {
    if (!repoRoot || typeof window === "undefined") return;
    localStorage.setItem(getProjectTreeStorageKey(repoRoot), JSON.stringify(expandedProjectDirs));
  }, [expandedProjectDirs, repoRoot]);

  useEffect(() => {
    if (sidebarScope !== "files" || !projectFiles.length) return;
    setSelectedProjectPath((previous) => {
      if (previous && projectFiles.includes(previous)) {
        if (pendingProjectRevealPathRef.current === previous) pendingProjectRevealPathRef.current = null;
        return previous;
      }
      if (previous && previous === pendingProjectRevealPathRef.current) return previous;
      if (active?.path && projectFiles.includes(active.path)) return active.path;
      return projectFiles[0] ?? null;
    });
  }, [active?.path, projectFiles, sidebarScope]);

  const revealProjectFile = useCallback((path: string | null) => {
    if (!path) return;
    pendingProjectRevealPathRef.current = path;
    setSelectedProjectPath(path);
    setExpandedProjectDirs((previous) => {
      const next = uniquePaths([...previous, ...getAncestorDirs(path)]);
      return pathsEqual(previous, next) ? previous : next;
    });
  }, []);

  const selectProjectFile = useCallback((path: string) => {
    pendingProjectRevealPathRef.current = null;
    setSelectedProjectPath(path);
  }, []);

  const showProjectFile = useCallback((path: string | null) => {
    setQuery("");
    revealProjectFile(path);
    setSidebarActivity("files");
  }, [revealProjectFile, setSidebarActivity]);

  const showDiffFile = useCallback((path: string | null) => {
    if (path) setSelected(getSelectionForPath(files, path));
    setSidebarActivity(compareDisplay.mode === "range" ? "review" : "changes");
  }, [compareDisplay.mode, files, setSelected, setSidebarActivity]);

  const selectChangedFile = useCallback((path: string, change?: ChangeSectionId) => {
    setSelected(change ? { path, change } : getSelectionForPath(files, path));
  }, [files, setSelected]);

  const handleActivityChange = (activity: SidebarActivity) => {
    if (activity === "files") {
      setQuery("");
      if (active?.path) revealProjectFile(active.path);
      setSidebarActivity(activity);
      return;
    }

    if (activity === "changes") {
      setCompareOverride({ mode: "working" });
      setSidebarActivity(activity);
      return;
    }

    const base = compareDisplay.mode === "range" ? compareDisplay.base ?? undefined : undefined;
    const head = compareDisplay.mode === "range" ? compareDisplay.head ?? undefined : undefined;
    setCompareOverride({ mode: "range", base, head });
    setSidebarActivity(activity);
  };

  const handleProjectExpandedPathsChange = useCallback((paths: string[]) => {
    setExpandedProjectDirs((previous) => {
      const next = pruneCollapsedDescendants(previous, uniquePaths(paths));
      return pathsEqual(previous, next) ? previous : next;
    });
  }, []);

  const collapseProjectFolders = useCallback(() => {
    setExpandedProjectDirs((previous) => (previous.length ? [] : previous));
  }, []);

  return (
    <div className="page">
      <main className="layout">
        <Sidebar
          data={data}
          pullRequestContext={pullRequestContext}
          pullRequestStatus={pullRequestStatus}
          projectData={projectData}
          compareLabel={compareLabel}
          scope={sidebarScope}
          activity={sidebarActivity}
          projectExpandedPaths={expandedProjectDirs}
          projectDirectories={projectData?.directories ?? []}
          onProjectExpandedPathsChange={handleProjectExpandedPathsChange}
          onCollapseProjectFolders={collapseProjectFolders}
          onActivityChange={handleActivityChange}
          files={files}
          projectFiles={projectPaths}
          activePath={sidebarScope === "changes" ? active?.path ?? null : activeProjectPath}
          activeChange={active?.change ?? null}
          query={query}
          onQueryChange={setQuery}
          onSelectFile={sidebarScope === "changes" ? selectChangedFile : selectProjectFile}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {sidebarScope === "changes" ? (
          <DiffView
            file={activeDiff}
            emptyMessage={emptyDiffMessage}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            showFullFile={showFullFile}
            onToggleFullFile={setShowFullFile}
            fileStatus={activeDiffStatus}
            onShowInFiles={() => showProjectFile(activeDiff?.path ?? active?.path ?? null)}
            change={active?.change ?? null}
            reviewThreads={sidebarActivity === "review" ? reviewThreadsData?.threads ?? [] : []}
            reviewThreadsStatus={reviewThreadsStatus}
          />
        ) : (
          <SourceView
            file={activeSource}
            filePath={activeProjectPath}
            status={activeSourceStatus}
            hasDiff={activeProjectHasDiff}
            onShowDiff={() => showDiffFile(activeProjectPath)}
          />
        )}
      </main>
      <SettingsModal
        open={settingsOpen}
        themeId={themeId}
        compare={compareDisplay}
        compareOverridden={hasCompareOverride}
        onClose={() => setSettingsOpen(false)}
        onThemeChange={setThemeId}
        onCompareChange={setCompareOverride}
        onCompareReset={resetCompareOverride}
      />
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}

function formatCompareLabel(compare: CompareSpec) {
  if (!compare || compare.mode === "working") return "Working Tree";
  const base = compare.base?.trim() || "origin/HEAD";
  const head = compare.head?.trim() || "HEAD";
  return `${base}...${head}`;
}

function getAncestorDirs(filePath: string) {
  const segments = filePath.split("/");
  const dirs: string[] = [];
  for (let index = 1; index < segments.length; index += 1) {
    dirs.push(`${segments.slice(0, index).join("/")}/`);
  }
  return dirs;
}

function uniquePaths(paths: string[]) {
  return Array.from(new Set(paths)).sort();
}

function normalizeSavedProjectDirs(paths: string[]) {
  return uniquePaths(paths.flatMap((path) => getAncestorDirs(path.endsWith("/") ? path : `${path}/`)));
}

function pruneCollapsedDescendants(previous: string[], next: string[]) {
  const nextSet = new Set(next);
  const collapsed = previous.filter((path) => !nextSet.has(path));
  if (!collapsed.length) return next;
  return next.filter((path) => !collapsed.some((collapsedPath) => isDescendantPath(path, collapsedPath)));
}

function isDescendantPath(path: string, parentPath: string) {
  return path !== parentPath && path.startsWith(parentPath);
}

function pathsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getProjectTreeStorageKey(repoRoot: string) {
  return `differ-project-tree:${repoRoot}`;
}

function matchesSelection(file: DiffFile, selected: { path: string; change?: ChangeSectionId }) {
  if (file.path !== selected.path) return false;
  return selected.change ? file.change === selected.change : true;
}

function getSelectionForPath(files: DiffFile[], path: string) {
  const file = files.find((item) => item.path === path);
  if (!file) return { path };
  return file.change ? { path: file.path, change: file.change } : { path: file.path };
}
