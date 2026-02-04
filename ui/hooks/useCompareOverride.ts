import { useEffect, useState } from "react";
import type { CompareSpec } from "../../shared/types";
import { normalizeCompareSpec } from "../utils/compare";

const parseCompareMode = (value: string | null) => {
  if (value === "working") return "working";
  if (value === "range") return "range";
  if (value === "pr") return "pr";
  return null;
};

const readCompareOverrideFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const mode = parseCompareMode(params.get("compare"));
  const base = params.get("base") ?? undefined;
  const head = params.get("head") ?? undefined;
  const prNumber = params.get("pr") ?? undefined;
  if (!mode && !base && !head && !prNumber) return null;
  if (mode === "working") return { mode: "working" } as CompareSpec;
  if (mode === "pr") {
    return normalizeCompareSpec({ mode: "pr", number: Number(prNumber) });
  }
  return normalizeCompareSpec({ mode: "range", base, head });
};

const readCompareOverrideFromStorage = () => {
  const mode = parseCompareMode(localStorage.getItem("differ-compare-mode"));
  if (!mode) return null;
  if (mode === "working") return { mode: "working" } as CompareSpec;
  if (mode === "pr") {
    const storedNumber = localStorage.getItem("differ-compare-pr");
    return normalizeCompareSpec({ mode: "pr", number: Number(storedNumber) });
  }
  const base = localStorage.getItem("differ-compare-base") ?? undefined;
  const head = localStorage.getItem("differ-compare-head") ?? undefined;
  return normalizeCompareSpec({ mode: "range", base, head });
};

const writeCompareOverrideToUrl = (compare: CompareSpec | null) => {
  const url = new URL(window.location.href);
  if (!compare) {
    url.searchParams.delete("compare");
    url.searchParams.delete("base");
    url.searchParams.delete("head");
    url.searchParams.delete("pr");
    window.history.replaceState({}, "", url);
    return;
  }
  url.searchParams.set("compare", compare.mode);
  if (compare.mode === "pr") {
    url.searchParams.set("pr", String(compare.number));
    url.searchParams.delete("base");
    url.searchParams.delete("head");
  } else if (compare.mode === "range") {
    if (compare.base) url.searchParams.set("base", compare.base);
    else url.searchParams.delete("base");
    if (compare.head) url.searchParams.set("head", compare.head);
    else url.searchParams.delete("head");
  } else {
    url.searchParams.delete("base");
    url.searchParams.delete("head");
    url.searchParams.delete("pr");
  }
  window.history.replaceState({}, "", url);
};

const writeCompareOverrideToStorage = (compare: CompareSpec | null) => {
  if (!compare) {
    localStorage.removeItem("differ-compare-mode");
    localStorage.removeItem("differ-compare-base");
    localStorage.removeItem("differ-compare-head");
    localStorage.removeItem("differ-compare-pr");
    return;
  }
  localStorage.setItem("differ-compare-mode", compare.mode);
  if (compare.mode === "range") {
    localStorage.setItem("differ-compare-base", compare.base ?? "");
    localStorage.setItem("differ-compare-head", compare.head ?? "");
    localStorage.removeItem("differ-compare-pr");
    return;
  }
  if (compare.mode === "pr") {
    localStorage.setItem("differ-compare-pr", String(compare.number));
    localStorage.removeItem("differ-compare-base");
    localStorage.removeItem("differ-compare-head");
    return;
  }
  localStorage.removeItem("differ-compare-base");
  localStorage.removeItem("differ-compare-head");
  localStorage.removeItem("differ-compare-pr");
};

export function useCompareOverride() {
  const [compareOverride, setCompareOverrideState] = useState<CompareSpec | null>(() => {
    if (typeof window === "undefined") return null;
    return readCompareOverrideFromUrl() ?? readCompareOverrideFromStorage();
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    writeCompareOverrideToStorage(compareOverride);
    writeCompareOverrideToUrl(compareOverride);
  }, [compareOverride]);

  const setCompareOverride = (next: CompareSpec) => {
    setCompareOverrideState(normalizeCompareSpec(next));
  };

  const resetCompareOverride = () => setCompareOverrideState(null);

  return {
    compareOverride,
    setCompareOverride,
    resetCompareOverride,
    hasCompareOverride: compareOverride !== null,
  };
}
