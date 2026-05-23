import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import type { CompareMode, CompareSpec, DiffFile } from "./types";
import { themes, type ThemeId, type DiffViewMode } from "./themes";
import { useSelectedFile } from "./hooks/useSelectedFile";
import { useDiffData } from "./hooks/useDiffData";
import { useCompareOverride } from "./hooks/useCompareOverride";
import { useFileDiff } from "./hooks/useFileDiff";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
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

  const { compareOverride, setCompareOverride, resetCompareOverride, hasCompareOverride } = useCompareOverride();
  const { data, refreshToken } = useDiffData({ themeId, compare: compareOverride });
  const [selected, setSelected] = useSelectedFile(data?.files ?? []);
  const active = data?.files.find((file) => file.path === selected) ?? data?.files[0] ?? null;
  const { diff: activeDiff, status: activeDiffStatus } = useFileDiff({
    enabled: Boolean(active?.path),
    filePath: active?.path ?? null,
    themeId,
    compare: compareOverride,
    full: showFullFile,
    refreshToken,
  });

  useTheme(themeId);

  const files = useMemo<DiffFile[]>(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return data.files;
    return data.files.filter((file) => file.path.toLowerCase().includes(needle));
  }, [data, query]);

  const compareDisplay: CompareSpec = data?.compare ?? compareOverride ?? { mode: "working" };
  const compareLabel = useMemo(() => formatCompareLabel(compareDisplay), [compareDisplay]);
  const emptyDiffMessage = data ? (data.files.length ? "No matching files" : "No changes") : "Loading diff…";

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
      <main className="layout">
        <Sidebar
          data={data}
          compareLabel={compareLabel}
          compare={compareDisplay}
          onCompareModeChange={handleCompareModeChange}
          files={files}
          activePath={active?.path ?? null}
          query={query}
          onQueryChange={setQuery}
          onSelectFile={setSelected}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <DiffView
          file={activeDiff}
          emptyMessage={emptyDiffMessage}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          showFullFile={showFullFile}
          onToggleFullFile={setShowFullFile}
          fileStatus={activeDiffStatus}
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

function formatCompareLabel(compare: CompareSpec) {
  if (!compare || compare.mode === "working") return "Working Tree";
  const base = compare.base?.trim() || "origin/HEAD";
  const head = compare.head?.trim() || "HEAD";
  return `${base}...${head}`;
}
