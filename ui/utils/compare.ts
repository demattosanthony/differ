import type { CompareSpec } from "../../shared/types";

export const normalizeCompareSpec = (compare: CompareSpec | null): CompareSpec | null => {
  if (!compare) return null;
  if (compare.mode === "working") return { mode: "working" };
  if (compare.mode === "pr") {
    const number = Number(compare.number);
    if (!Number.isFinite(number) || number <= 0) return null;
    return { mode: "pr", number };
  }
  const base = compare.base?.trim();
  const head = compare.head?.trim();
  return {
    mode: "range",
    base: base || undefined,
    head: head || undefined,
  };
};

export const appendCompareParams = (params: URLSearchParams, compare: CompareSpec | null) => {
  if (!compare) return;
  params.set("compare", compare.mode);
  if (compare.mode === "pr") {
    params.set("pr", String(compare.number));
    params.delete("base");
    params.delete("head");
    return;
  }
  if (compare.mode === "range") {
    if (compare.base) params.set("base", compare.base);
    else params.delete("base");
    if (compare.head) params.set("head", compare.head);
    else params.delete("head");
    return;
  }
  params.delete("base");
  params.delete("head");
};
