import { useCallback, useEffect, useMemo, useState } from "react";

type PullRequestFileView = { path: string; viewed?: boolean };

type PullRequestFileViewsOptions = {
  enabled: boolean;
  number: number | null;
  githubToken: string | null;
};

export function usePullRequestFileViews({ enabled, number, githubToken }: PullRequestFileViewsOptions) {
  const [views, setViews] = useState<PullRequestFileView[]>([]);

  const fetchViews = useCallback(async () => {
    if (!enabled || !number || !githubToken) return;
    try {
      const response = await fetch(`/api/github/pr-files?number=${number}`, {
        headers: { "x-github-token": githubToken },
      });
      if (!response.ok) throw new Error("Failed to load file views");
      const data = (await response.json()) as PullRequestFileView[];
      setViews(data);
    } catch {
      setViews([]);
    }
  }, [enabled, number, githubToken]);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  useEffect(() => {
    if (!enabled) setViews([]);
  }, [enabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!enabled || !number || !githubToken) return;
    const interval = window.setInterval(fetchViews, 20000);
    return () => window.clearInterval(interval);
  }, [enabled, number, githubToken, fetchViews]);

  const viewMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const view of views) {
      if (typeof view.viewed === "boolean") map.set(view.path, view.viewed);
    }
    return map;
  }, [views]);

  return { viewMap, refresh: fetchViews };
}
