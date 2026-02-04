import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import type { CompareMode, CompareSpec, DiffFile } from "./types";
import { themes, type ThemeId, type DiffViewMode } from "./themes";
import { buildTree, listDirPaths } from "./utils/tree";
import { useSelectedFile } from "./hooks/useSelectedFile";
import { useDiffData } from "./hooks/useDiffData";
import { useCompareOverride } from "./hooks/useCompareOverride";
import { useFullFileDiff } from "./hooks/useFullFileDiff";
import { useInstallPrompt } from "./hooks/useInstallPrompt";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { useServiceWorker } from "./hooks/useServiceWorker";
import { useTheme } from "./hooks/useTheme";
import { Sidebar } from "./components/Sidebar";
import { DiffView } from "./components/DiffView";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { compareOverride, setCompareOverride, resetCompareOverride, hasCompareOverride } = useCompareOverride();
  const data = useDiffData({ themeId, compare: compareOverride });
  const [selected, setSelected] = useSelectedFile(data?.files ?? []);
  const { showBanner, canInstall, isStandalone, promptInstall, dismissInstall } = useInstallPrompt();
  const active = data?.files.find((file) => file.path === selected) ?? data?.files[0] ?? null;
  const { diff: fullFileDiff, status: fullFileStatus } = useFullFileDiff({
    enabled: showFullFile,
    filePath: active?.path ?? null,
    themeId,
    compare: compareOverride,
    revision: data?.revision,
  });

  useTheme(themeId);
  useServiceWorker();

  const files = useMemo<DiffFile[]>(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return data.files;
    return data.files.filter((file) => file.path.toLowerCase().includes(needle));
  }, [data, query]);

  const tree = useMemo(() => buildTree(files), [files]);
  const compareDisplay: CompareSpec = data?.compare ?? compareOverride ?? { mode: "working" };
  const compareLabel = useMemo(() => formatCompareLabel(compareDisplay), [compareDisplay]);
  const emptyDiffMessage = data ? (data.files.length ? "No matching files" : "No changes") : "Loading diff…";

  useEffect(() => {
    setExpanded(new Set(listDirPaths(tree)));
  }, [tree]);

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleCompareModeChange = (mode: CompareMode) => {
    if (mode === "working") {
      setCompareOverride({ mode: "working" });
      return;
    }
    const base = compareDisplay.mode === "range" ? compareDisplay.base ?? undefined : undefined;
    const head = compareDisplay.mode === "range" ? compareDisplay.head ?? undefined : undefined;
    setCompareOverride({ mode: "range", base, head });
  };

  return (
    <div className="page">
      {showBanner && !isStandalone ? (
        <InstallBanner
          canInstall={canInstall}
          onInstall={promptInstall}
          onDismiss={dismissInstall}
        />
      ) : null}
      <main className="layout">
        <Sidebar
          data={data}
          compareLabel={compareLabel}
          compare={compareDisplay}
          onCompareModeChange={handleCompareModeChange}
          files={files}
          tree={tree}
          activePath={active?.path ?? null}
          query={query}
          onQueryChange={setQuery}
          expanded={expanded}
          onToggleDir={toggleDir}
          onSelectFile={setSelected}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <DiffView
          file={showFullFile ? fullFileDiff ?? active : active}
          emptyMessage={emptyDiffMessage}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          showFullFile={showFullFile}
          onToggleFullFile={setShowFullFile}
          fullFileStatus={fullFileStatus}
        />
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

function InstallBanner({
  canInstall,
  onInstall,
  onDismiss,
}: {
  canInstall: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="install-banner">
      <div className="install-copy">
        <div className="install-title">Install Differ</div>
        <div className="install-subtitle">
          {canInstall
            ? "Launch as a themed app window with one click."
            : "Use Chrome’s menu to install Differ to your desktop."}
        </div>
      </div>
      <div className="install-actions">
        <button className="install-button" onClick={onInstall} disabled={!canInstall}>
          Install
        </button>
        <button className="install-dismiss" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}

function formatCompareLabel(compare: CompareSpec) {
  if (!compare || compare.mode === "working") return "Working Tree";
  const base = compare.base?.trim() || "origin/HEAD";
  const head = compare.head?.trim() || "HEAD";
  return `${base}...${head}`;
}
