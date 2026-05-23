import type { CompareSpec } from "../shared/types";

type CompareInput = {
  mode?: string | null;
  base?: string | null;
  head?: string | null;
};

export function runGit(cwd: string, args: string[]) {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "ignore",
  });
  return result.stdout.toString();
}

const hasRef = (repoRoot: string, ref: string) => {
  const resolved = runGit(repoRoot, ["rev-parse", "--verify", ref]).trim();
  return Boolean(resolved);
};

const getDefaultBase = (repoRoot: string) => {
  const originHead = runGit(repoRoot, ["symbolic-ref", "refs/remotes/origin/HEAD"]).trim();
  if (originHead) return originHead.replace(/^refs\/remotes\//, "");
  if (hasRef(repoRoot, "main")) return "main";
  if (hasRef(repoRoot, "master")) return "master";
  return "HEAD";
};

export const getRangeParams = (repoRoot: string, compare: CompareSpec) => {
  if (compare.mode === "range") {
    return {
      base: compare.base ?? getDefaultBase(repoRoot),
      head: compare.head ?? "HEAD",
    };
  }
  return { base: getDefaultBase(repoRoot), head: "HEAD" };
};

export function normalizeCompare(repoRoot: string, input: CompareInput): CompareSpec {
  const mode = input.mode?.trim() ?? "";
  const base = input.base?.trim() ?? "";
  const head = input.head?.trim() ?? "";
  if (mode === "working") {
    return { mode: "working" };
  }
  const wantsRange = mode === "range" || mode === "pr" || Boolean(base || head);

  if (!wantsRange) {
    return { mode: "working" };
  }

  return {
    mode: "range",
    base: base || getDefaultBase(repoRoot),
    head: head || "HEAD",
  };
}

export function getWorkingDiff(repoRoot: string, unified: number) {
  return runGit(repoRoot, ["diff", "--no-color", "--patch", `--unified=${unified}`]);
}

export function getRangeDiff(repoRoot: string, compare: CompareSpec, unified: number) {
  const { base, head } = getRangeParams(repoRoot, compare);
  return runGit(repoRoot, ["diff", "--no-color", "--patch", `--unified=${unified}`, `${base}...${head}`]);
}

export function getDiff(repoRoot: string, compare: CompareSpec, unified: number) {
  return compare.mode === "working" ? getWorkingDiff(repoRoot, unified) : getRangeDiff(repoRoot, compare, unified);
}

const getWorkingNumstat = (repoRoot: string) => {
  return runGit(repoRoot, ["diff", "--no-color", "--numstat"]);
};

const getRangeNumstat = (repoRoot: string, compare: CompareSpec) => {
  const { base, head } = getRangeParams(repoRoot, compare);
  return runGit(repoRoot, ["diff", "--no-color", "--numstat", `${base}...${head}`]);
};

export function getDiffNumstat(repoRoot: string, compare: CompareSpec) {
  return compare.mode === "working" ? getWorkingNumstat(repoRoot) : getRangeNumstat(repoRoot, compare);
}

const getWorkingFileDiffPatch = (repoRoot: string, filePath: string, unified: number) => {
  return runGit(repoRoot, ["diff", "--no-color", "--patch", `--unified=${unified}`, "--", filePath]);
};

const getRangeFileDiffPatch = (repoRoot: string, filePath: string, unified: number, compare: CompareSpec) => {
  const { base, head } = getRangeParams(repoRoot, compare);
  return runGit(repoRoot, [
    "diff",
    "--no-color",
    "--patch",
    `--unified=${unified}`,
    `${base}...${head}`,
    "--",
    filePath,
  ]);
};

export function getFileDiffPatch(repoRoot: string, filePath: string, unified: number, compare: CompareSpec) {
  return compare.mode === "working"
    ? getWorkingFileDiffPatch(repoRoot, filePath, unified)
    : getRangeFileDiffPatch(repoRoot, filePath, unified, compare);
}
