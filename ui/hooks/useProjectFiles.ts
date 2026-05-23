import { useEffect, useState } from "react";
import type { CompareSpec, ProjectFilesData } from "../types";
import { appendCompareParams } from "../utils/compare";

type ProjectFilesState = {
  data: ProjectFilesData | null;
  status: "idle" | "loading" | "error";
};

type ProjectFilesOptions = {
  compare: CompareSpec | null;
  expandedDirs: string[];
  query: string;
  refreshToken?: number;
};

export function useProjectFiles({ compare, expandedDirs, query, refreshToken }: ProjectFilesOptions): ProjectFilesState {
  const [data, setData] = useState<ProjectFilesData | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const compareKey = compare ? `${compare.mode}:${compare.base ?? ""}:${compare.head ?? ""}` : "default";
  const expandedKey = expandedDirs.join("\0");
  const queryKey = query.trim().toLowerCase();

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    appendCompareParams(params, compare);
    for (const dir of expandedDirs) {
      params.append("dir", dir);
    }
    if (query.trim()) params.set("q", query.trim());

    setStatus("loading");
    fetch(`/api/project-files?${params.toString()}`, { signal: controller.signal })
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
  }, [compareKey, expandedKey, queryKey, refreshToken]);

  return { data, status };
}
