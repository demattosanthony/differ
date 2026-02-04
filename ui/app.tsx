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
import { usePullRequestComments } from "./hooks/usePullRequestComments";
import { usePullRequestFileViews } from "./hooks/usePullRequestFileViews";
import { useServiceWorker } from "./hooks/useServiceWorker";
import { useTheme } from "./hooks/useTheme";
import { Sidebar } from "./components/Sidebar";
import { DiffView } from "./components/DiffView";
import { SettingsModal } from "./components/SettingsModal";

function App() {
  const defaultSidebarWidth = 320;
  const sidebarMin = 240;
  const sidebarMax = 560;
  const clampSidebarWidth = (value: number) => {
    const max = typeof window === "undefined" ? sidebarMax : Math.min(sidebarMax, window.innerWidth * 0.6);
    const safeMax = Math.max(sidebarMin, max);
    return Math.max(sidebarMin, Math.min(safeMax, value));
  };
  const defaultThemeId: ThemeId = typeof window === "undefined" ? "vscode-dark" : "gruvbox-dark-soft";
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useLocalStorageState<DiffViewMode>("differ-view-mode", "stacked", {
    deserialize: (value) => (value === "split" ? "split" : "stacked"),
  });
  const [sidebarWidth, setSidebarWidth] = useLocalStorageState<number>("differ-sidebar-width", defaultSidebarWidth, {
    deserialize: (value) => {
      const next = Number(value);
      return Number.isFinite(next) ? clampSidebarWidth(next) : defaultSidebarWidth;
    },
  });
  const [themeId, setThemeId] = useLocalStorageState<ThemeId>("differ-theme-id", defaultThemeId, {
    deserialize: (value) => (themes.some((theme) => theme.id === value) ? (value as ThemeId) : defaultThemeId),
  });
  const [showFullFile, setShowFullFile] = useLocalStorageState<boolean>("differ-full-file", false, {
    deserialize: (value) => value === "true",
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [githubToken, setGithubToken] = useLocalStorageState<string>("differ-github-token", "");
  const [prNumber, setPrNumber] = useLocalStorageState<number>("differ-pr-number", 0, {
    deserialize: (value) => Number(value) || 0,
  });
  const [reviewPendingId, setReviewPendingId] = useState<number | null>(null);
  const [reviewEvent, setReviewEvent] = useState<"COMMENT" | "APPROVE" | "REQUEST_CHANGES">("COMMENT");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [viewOverrides, setViewOverrides] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { compareOverride, setCompareOverride, resetCompareOverride, hasCompareOverride } = useCompareOverride();
  const data = useDiffData({ themeId, compare: compareOverride, githubToken: githubToken || null });
  const [selected, setSelected] = useSelectedFile(data?.files ?? []);
  const { showBanner, canInstall, isStandalone, promptInstall, dismissInstall } = useInstallPrompt();
  const active = data?.files.find((file) => file.path === selected) ?? data?.files[0] ?? null;

  useTheme(themeId);
  useServiceWorker();

  const compareDisplay: CompareSpec = data?.compare ?? compareOverride ?? { mode: "working" };
  const allowFullFile = compareDisplay.mode !== "pr" && data?.fullFileAvailable !== false;
  const { diff: fullFileDiff, status: fullFileStatus } = useFullFileDiff({
    enabled: showFullFile && allowFullFile,
    filePath: active?.path ?? null,
    themeId,
    compare: compareOverride,
    githubToken: githubToken || null,
    revision: data?.revision,
  });
  const isPrMode = compareDisplay.mode === "pr";
  const prNumberActive = compareDisplay.mode === "pr" ? compareDisplay.number : null;
  const canReview = Boolean(githubToken) && isPrMode;
  const { viewMap, refresh: refreshFileViews } = usePullRequestFileViews({
    enabled: isPrMode,
    number: prNumberActive,
    githubToken: githubToken || null,
  });
  const { threads, refresh: refreshComments } = usePullRequestComments({
    enabled: isPrMode,
    number: prNumberActive,
    githubToken: githubToken || null,
  });

  const files = useMemo<DiffFile[]>(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? data.files.filter((file) => file.path.toLowerCase().includes(needle))
      : data.files;
    return filtered.map((file) => {
      const override = viewOverrides[file.path];
      const viewed = override ?? viewMap.get(file.path) ?? file.viewed;
      return viewed === undefined ? file : { ...file, viewed };
    });
  }, [data, query, viewMap, viewOverrides]);

  const tree = useMemo(() => buildTree(files), [files]);
  const compareLabel = useMemo(() => formatCompareLabel(compareDisplay), [compareDisplay]);
  const emptyDiffMessage = data ? (data.files.length ? "No matching files" : "No changes") : "Loading diff…";

  useEffect(() => {
    setExpanded(new Set(listDirPaths(tree)));
  }, [tree]);

  useEffect(() => {
    if (showFullFile && !allowFullFile) setShowFullFile(false);
  }, [showFullFile, allowFullFile, setShowFullFile]);

  useEffect(() => {
    setReviewPendingId(null);
    setReviewEvent("COMMENT");
    setReviewBody("");
  }, [prNumberActive]);

  useEffect(() => {
    if (!isPrMode) setViewOverrides({});
  }, [isPrMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setSidebarWidth((value) => clampSidebarWidth(value));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [setSidebarWidth]);

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
    if (mode === "pr") {
      if (!prNumber) {
        setSettingsOpen(true);
        return;
      }
      setCompareOverride({ mode: "pr", number: prNumber });
      return;
    }
    const base = compareDisplay.mode === "range" ? compareDisplay.base ?? undefined : undefined;
    const head = compareDisplay.mode === "range" ? compareDisplay.head ?? undefined : undefined;
    setCompareOverride({ mode: "range", base, head });
  };

  const handleToggleViewed = async (path: string, nextViewed: boolean) => {
    if (!prNumberActive || !githubToken) return;
    setViewOverrides((prev) => ({ ...prev, [path]: nextViewed }));
    try {
      const params = new URLSearchParams({ number: String(prNumberActive), path });
      await fetch(`/api/github/pr-files/viewed?${params.toString()}`, {
        method: nextViewed ? "PUT" : "DELETE",
        headers: { "x-github-token": githubToken },
      });
    } finally {
      setViewOverrides((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
      refreshFileViews();
    }
  };

  const handleStartReview = async () => {
    if (!prNumberActive || !githubToken) return;
    setReviewBusy(true);
    try {
      const response = await fetch("/api/github/pr-reviews/start", {
        method: "POST",
        headers: { "x-github-token": githubToken, "Content-Type": "application/json" },
        body: JSON.stringify({ number: prNumberActive }),
      });
      if (!response.ok) throw new Error("Failed to start review");
      const data = await response.json();
      setReviewPendingId(data.id ?? null);
    } finally {
      setReviewBusy(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!prNumberActive || !githubToken || !reviewPendingId) return;
    setReviewBusy(true);
    try {
      const response = await fetch("/api/github/pr-reviews/submit", {
        method: "POST",
        headers: { "x-github-token": githubToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          number: prNumberActive,
          reviewId: reviewPendingId,
          event: reviewEvent,
          body: reviewBody,
        }),
      });
      if (!response.ok) throw new Error("Failed to submit review");
      setReviewPendingId(null);
      setReviewBody("");
      refreshComments();
    } finally {
      setReviewBusy(false);
    }
  };

  const handleAddComment = async (input: {
    path: string;
    line: number;
    side: "LEFT" | "RIGHT";
    body: string;
  }) => {
    if (!prNumberActive || !githubToken) return;
    await fetch("/api/github/pr-comments", {
      method: "POST",
      headers: { "x-github-token": githubToken, "Content-Type": "application/json" },
      body: JSON.stringify({ number: prNumberActive, ...input }),
    });
    refreshComments();
  };

  const handleReplyComment = async (input: { commentId: number; body: string }) => {
    if (!prNumberActive || !githubToken) return;
    await fetch("/api/github/pr-comments/reply", {
      method: "POST",
      headers: { "x-github-token": githubToken, "Content-Type": "application/json" },
      body: JSON.stringify({ number: prNumberActive, ...input }),
    });
    refreshComments();
  };

  const handleSidebarResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    let latest = startWidth;
    let frame = 0;

    const handleMove = (moveEvent: PointerEvent) => {
      latest = clampSidebarWidth(startWidth + moveEvent.clientX - startX);
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        setSidebarWidth(latest);
        frame = 0;
      });
    };

    const handleUp = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
        setSidebarWidth(latest);
      }
      document.body.classList.remove("resizing");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };

    document.body.classList.add("resizing");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
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
        <div className="sidebar-shell" style={{ width: sidebarWidth }}>
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
            onToggleViewed={handleToggleViewed}
            canReview={canReview}
            reviewPendingId={reviewPendingId}
            reviewEvent={reviewEvent}
            reviewBody={reviewBody}
            reviewBusy={reviewBusy}
            onReviewBodyChange={setReviewBody}
            onReviewEventChange={setReviewEvent}
            onStartReview={handleStartReview}
            onSubmitReview={handleSubmitReview}
          />
        </div>
        <div
          className="sidebar-resizer"
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          onPointerDown={handleSidebarResizeStart}
        />

        <DiffView
          file={showFullFile ? fullFileDiff ?? active : active}
          emptyMessage={emptyDiffMessage}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          showFullFile={showFullFile}
          onToggleFullFile={setShowFullFile}
          fullFileStatus={fullFileStatus}
          allowFullFile={allowFullFile}
          commentThreads={threads}
          canComment={canReview}
          onAddComment={handleAddComment}
          onReplyComment={handleReplyComment}
        />
      </main>
      <SettingsModal
        open={settingsOpen}
        themeId={themeId}
        compare={compareDisplay}
        compareOverridden={hasCompareOverride}
        githubToken={githubToken}
        prNumber={prNumber}
        onClose={() => setSettingsOpen(false)}
        onThemeChange={setThemeId}
        onCompareChange={setCompareOverride}
        onGitHubTokenChange={setGithubToken}
        onPrNumberChange={setPrNumber}
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
  if (compare.mode === "pr") return `PR #${compare.number}`;
  const base = compare.base?.trim() || "origin/HEAD";
  const head = compare.head?.trim() || "HEAD";
  return `${base}...${head}`;
}
