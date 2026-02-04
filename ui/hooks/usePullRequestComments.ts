import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReviewComment, ReviewThread } from "../types/pr";

type PullRequestCommentsOptions = {
  enabled: boolean;
  number: number | null;
  githubToken: string | null;
};

const buildThreads = (comments: ReviewComment[]): ReviewThread[] => {
  const byId = new Map<number, ReviewComment>();
  const replies = new Map<number, ReviewComment[]>();

  for (const comment of comments) {
    byId.set(comment.id, comment);
    if (comment.inReplyToId) {
      const list = replies.get(comment.inReplyToId) ?? [];
      list.push(comment);
      replies.set(comment.inReplyToId, list);
    }
  }

  const threads: ReviewThread[] = [];
  for (const comment of comments) {
    if (comment.inReplyToId) continue;
    const threadReplies = replies.get(comment.id) ?? [];
    threads.push({
      id: comment.id,
      path: comment.path,
      line: comment.line,
      side: comment.side,
      comments: [comment, ...threadReplies].sort((a, b) => a.id - b.id),
    });
  }

  return threads;
};

export function usePullRequestComments({ enabled, number, githubToken }: PullRequestCommentsOptions) {
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!enabled || !number || !githubToken) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/github/pr-comments?number=${number}`, {
        headers: { "x-github-token": githubToken },
      });
      if (!response.ok) throw new Error("Failed to load comments");
      const data = (await response.json()) as ReviewComment[];
      setComments(data);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, number, githubToken]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    if (!enabled) setComments([]);
  }, [enabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!enabled || !number || !githubToken) return;
    const interval = window.setInterval(fetchComments, 20000);
    return () => window.clearInterval(interval);
  }, [enabled, number, githubToken, fetchComments]);

  const threads = useMemo(() => buildThreads(comments), [comments]);

  return { threads, loading, refresh: fetchComments };
}
