import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReviewComment } from "../types/pr";

type PullRequestReviewCommentsOptions = {
  enabled: boolean;
  number: number | null;
  reviewId: number | null;
  githubToken: string | null;
};

export function usePullRequestReviewComments({
  enabled,
  number,
  reviewId,
  githubToken,
}: PullRequestReviewCommentsOptions) {
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [optimistic, setOptimistic] = useState<ReviewComment[]>([]);

  const storageKey = useMemo(() => {
    if (!number || !reviewId) return null;
    return `differ-review-comments:${number}:${reviewId}`;
  }, [number, reviewId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storageKey) {
      setOptimistic([]);
      return;
    }
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      setOptimistic((prev) => prev);
      return;
    }
    try {
      const parsed = JSON.parse(stored) as ReviewComment[];
      setOptimistic((prev) => {
        if (!Array.isArray(parsed)) return prev;
        if (!prev.length) return parsed;
        const byId = new Map<number, ReviewComment>();
        for (const comment of parsed) byId.set(comment.id, comment);
        for (const comment of prev) byId.set(comment.id, comment);
        return Array.from(byId.values());
      });
    } catch {
      setOptimistic((prev) => prev);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(optimistic));
  }, [storageKey, optimistic]);

  const fetchComments = useCallback(async () => {
    if (!enabled || !number || !reviewId || !githubToken) return;
    try {
      const response = await fetch(
        `/api/github/pr-reviews/comments?number=${number}&reviewId=${reviewId}`,
        { headers: { "x-github-token": githubToken } }
      );
      if (!response.ok) throw new Error("Failed to load review comments");
      const data = (await response.json()) as ReviewComment[];
      setComments(data);
      setOptimistic((prev) => prev.filter((comment) => !data.some((item) => item.id === comment.id)));
    } catch {
      setComments([]);
    }
  }, [enabled, number, reviewId, githubToken]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!enabled || !number || !reviewId || !githubToken) return;
    const interval = window.setInterval(fetchComments, 20000);
    return () => window.clearInterval(interval);
  }, [enabled, number, reviewId, githubToken, fetchComments]);

  useEffect(() => {
    if (!enabled || !reviewId) setComments([]);
  }, [enabled, reviewId]);

  const merged = useMemo(() => {
    const byId = new Map<number, ReviewComment>();
    for (const comment of comments) byId.set(comment.id, comment);
    for (const comment of optimistic) {
      const existing = byId.get(comment.id);
      if (!existing) {
        byId.set(comment.id, comment);
        continue;
      }
      if ((existing.line == null || !existing.path) && comment.line != null) {
        byId.set(comment.id, {
          ...existing,
          path: existing.path || comment.path,
          line: existing.line ?? comment.line,
          side: existing.side || comment.side,
        });
      }
    }
    return Array.from(byId.values());
  }, [comments, optimistic]);

  const commentIds = useMemo(() => new Set(merged.map((comment) => comment.id)), [merged]);

  const addLocalComment = (comment: ReviewComment) => {
    setOptimistic((prev) => {
      if (prev.some((item) => item.id === comment.id)) return prev;
      return [...prev, comment];
    });
  };

  const replaceLocalComment = (localId: number, comment: ReviewComment) => {
    setOptimistic((prev) => {
      const existing = prev.find((item) => item.id === localId);
      const mergedComment = existing
        ? {
            ...comment,
            path: comment.path || existing.path,
            line: comment.line ?? existing.line,
            side: comment.side || existing.side,
          }
        : comment;
      return [...prev.filter((item) => item.id !== localId), mergedComment];
    });
  };

  const updateLocalComment = (commentId: number, body: string) => {
    setOptimistic((prev) => prev.map((comment) => (comment.id === commentId ? { ...comment, body } : comment)));
  };

  const removeLocalComment = (commentId: number) => {
    setOptimistic((prev) => prev.filter((comment) => comment.id !== commentId));
  };

  const clearLocalComments = () => {
    setOptimistic([]);
    if (typeof window !== "undefined" && storageKey) {
      localStorage.removeItem(storageKey);
    }
  };

  return {
    comments: merged,
    commentIds,
    addLocalComment,
    replaceLocalComment,
    updateLocalComment,
    removeLocalComment,
    clearLocalComments,
    refresh: fetchComments,
  };
}
