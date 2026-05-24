import { useEffect, useState } from "react";
import type { PullRequestReviewThreadsData } from "../../shared/types";

type PullRequestReviewThreadsState = {
  data: PullRequestReviewThreadsData | null;
  status: "idle" | "loading" | "error";
  setData: (data: PullRequestReviewThreadsData) => void;
};

type PullRequestReviewThreadsOptions = {
  enabled: boolean;
  pullRequestNumber: number | null;
};

export function usePullRequestReviewThreads({
  enabled,
  pullRequestNumber,
}: PullRequestReviewThreadsOptions): PullRequestReviewThreadsState {
  const [data, setData] = useState<PullRequestReviewThreadsData | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (!enabled || !pullRequestNumber) {
      setData(null);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ number: String(pullRequestNumber) });
    setStatus("loading");
    fetch(`/api/github/pr-review-threads?${params.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json) => {
        setData(json);
        setStatus("idle");
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setData(null);
        setStatus("error");
      });

    return () => controller.abort();
  }, [enabled, pullRequestNumber]);

  return { data, status, setData };
}
