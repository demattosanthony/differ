import { useEffect, useState } from "react";
import type { PullRequestContextData } from "../../shared/types";

type PullRequestContextState = {
  data: PullRequestContextData | null;
  status: "idle" | "loading" | "error";
};

type PullRequestContextOptions = {
  enabled: boolean;
};

export function usePullRequestContext({ enabled }: PullRequestContextOptions): PullRequestContextState {
  const [data, setData] = useState<PullRequestContextData | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    fetch("/api/github/pr-context", { signal: controller.signal })
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
  }, [enabled]);

  return { data, status };
}
