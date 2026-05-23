import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import type { CompareMode, CompareSpec, DiffFile } from "./types";
import { themes, type ThemeId, type DiffViewMode } from "./themes";
import { useSelectedFile } from "./hooks/useSelectedFile";
import { useDiffData } from "./hooks/useDiffData";
import { useCompareOverride } from "./hooks/useCompareOverride";
import { useFileDiff } from "./hooks/useFileDiff";
import { useProjectFiles } from "./hooks/useProjectFiles";
import { useSourceFile } from "./hooks/useSourceFile";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { useTheme } from "./hooks/useTheme";
import { Sidebar, type SidebarScope } from "./components/Sidebar";
import { DiffView } from "./components/DiffView";
import { SourceView } from "./components/SourceView";
import { SettingsModal } from "./components/SettingsModal";

function App() {
  const defaultThemeId: ThemeId = typeof window === "undefined" ? "vscode-dark" : "gruvbox-dark-soft";
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
  const [sidebarScope, setSidebarScope] = useLocalStorageState<SidebarScope>("differ-sidebar-scope", "changes", {
    deserialize: (value) => (value === "files" ? "files" : "changes"),
  });
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null);
  const [expandedProjectDirs, setExpandedProjectDirs] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { compareOverride, setCompareOverride, resetCompareOverride, hasCompareOverride } = useCompareOverride();
  const { data, refreshToken } = useDiffData({ themeId, compare: compareOverride });
  const [selected, setSelected] = useSelectedFile(data?.files ?? []);
  const active = data?.files.find((file) => file.path === selected) ?? data?.files[0] ?? null;
  const repoRoot = data?.repo.root ?? null;
  const requestedProjectDirs = useMemo(() => {
    const activeProjectFile = selectedProjectPath ?? active?.path ?? "";
    const activeDirs = activeProjectFile ? getAncestorDirs(activeProjectFile) : [];
    return uniquePaths([...expandedProjectDirs, ...activeDirs]);
  }, [active?.path, expandedProjectDirs, selectedProjectPath]);
  const { data: projectData } = useProjectFiles({
    compare: compareOverride,
    expandedDirs: requestedProjectDirs,
    query: sidebarScope === "files" ? query : "",
    refreshToken,
  });
  const projectPaths = projectData?.paths ?? [];
  const projectFiles = useMemo(() => projectPaths.filter((filePath) => !filePath.endsWith("/")), [projectPaths]);
  const activeProjectPath = selectedProjectPath ?? active?.path ?? projectFiles[0] ?? null;
  const activeProjectHasDiff = Boolean(activeProjectPath && data?.files.some((file) => file.path === activeProjectPath));
  const { diff: activeDiff, status: activeDiffStatus } = useFileDiff({
    enabled: sidebarScope === "changes" && Boolean(active?.path),
    filePath: active?.path ?? null,
    themeId,
    compare: compareOverride,
    full: showFullFile,
    refreshToken,
  });
  const { data: activeSource, status: activeSourceStatus } = useSourceFile({
    enabled: sidebarScope === "files" && Boolean(activeProjectPath),
    filePath: activeProjectPath,
    themeId,
    compare: compareOverride,
    refreshToken,
  });

  useTheme(themeId);

  const files = useMemo<DiffFile[]>(() => data?.files ?? [], [data]);

  const compareDisplay: CompareSpec = data?.compare ?? compareOverride ?? { mode: "working" };
  const compareLabel = useMemo(() => formatCompareLabel(compareDisplay), [compareDisplay]);
  const emptyDiffMessage = data ? (data.files.length ? "No matching files" : "No changes") : "Loading diff…";

  useEffect(() => {
    if (!repoRoot || typeof window === "undefined") return;
    const raw = localStorage.getItem(getProjectTreeStorageKey(repoRoot));
    if (!raw) {
      setExpandedProjectDirs([]);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setExpandedProjectDirs(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
    } catch {
      setExpandedProjectDirs([]);
    }
  }, [repoRoot]);

  useEffect(() => {
    if (!repoRoot || typeof window === "undefined") return;
    localStorage.setItem(getProjectTreeStorageKey(repoRoot), JSON.stringify(expandedProjectDirs));
  }, [expandedProjectDirs, repoRoot]);

  useEffect(() => {
    if (sidebarScope !== "files" || !projectFiles.length) return;
    setSelectedProjectPath((previous) => {
      if (previous && projectFiles.includes(previous)) return previous;
      if (active?.path && projectFiles.includes(active.path)) return active.path;
      return projectFiles[0] ?? null;
    });
  }, [active?.path, projectFiles, sidebarScope]);

  const handleCompareModeChange = (mode: CompareMode) => {
    if (mode === "working") {
      setCompareOverride({ mode: "working" });
      return;
    }
    const base = compareDisplay.mode === "range" ? compareDisplay.base ?? undefined : undefined;
    const head = compareDisplay.mode === "range" ? compareDisplay.head ?? undefined : undefined;
    setCompareOverride({ mode: "range", base, head });
  };

  const showProjectFile = (path: string | null) => {
    if (path) setSelectedProjectPath(path);
    setSidebarScope("files");
  };

  const showDiffFile = (path: string | null) => {
    if (path) setSelected(path);
    setSidebarScope("changes");
  };

  const handleProjectExpandedPathsChange = useCallback((paths: string[]) => {
    setExpandedProjectDirs((previous) => {
      const next = uniquePaths(paths);
      return pathsEqual(previous, next) ? previous : next;
    });
  }, []);

  return (
    <div className="page">
      <main className="layout">
        <Sidebar
          data={data}
          projectData={projectData}
          compareLabel={compareLabel}
          compare={compareDisplay}
          scope={sidebarScope}
          projectExpandedPaths={requestedProjectDirs}
          projectDirectories={projectData?.directories ?? []}
          onProjectExpandedPathsChange={handleProjectExpandedPathsChange}
          onScopeChange={(scope) => {
            if (scope === "files" && !selectedProjectPath && active?.path) {
              setSelectedProjectPath(active.path);
            }
            setSidebarScope(scope);
          }}
          onCompareModeChange={handleCompareModeChange}
          files={files}
          projectFiles={projectPaths}
          activePath={sidebarScope === "changes" ? active?.path ?? null : activeProjectPath}
          query={query}
          onQueryChange={setQuery}
          onSelectFile={sidebarScope === "changes" ? setSelected : setSelectedProjectPath}
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
            onShowInFiles={() => showProjectFile(active?.path ?? null)}
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

function pathsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getProjectTreeStorageKey(repoRoot: string) {
  return `differ-project-tree:${repoRoot}`;
}
