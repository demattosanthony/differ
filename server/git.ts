import type { CompareSpec } from "../shared/types";

type CompareInput = {
  mode?: string | null;
  base?: string | null;
  head?: string | null;
};

const getNullPath = () => (process.platform === "win32" ? "NUL" : "/dev/null");

export function runGit(cwd: string, args: string[]) {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "ignore",
  });
  return result.stdout.toString();
}

const listUntrackedFiles = (repoRoot: string) => {
  const output = runGit(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (!output) return [];
  return output.split("\0").filter(Boolean);
};

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
  const tracked = runGit(repoRoot, ["diff", "--no-color", "--patch", `--unified=${unified}`]);
  const untracked = listUntrackedFiles(repoRoot);
  if (!untracked.length) return tracked;
  const extra = untracked
    .map((filePath) =>
      runGit(repoRoot, [
        "diff",
        "--no-color",
        "--patch",
        `--unified=${unified}`,
        "--no-index",
        "--",
        getNullPath(),
        filePath,
      ])
    )
    .filter(Boolean)
    .join("\n");
  return [tracked, extra].filter(Boolean).join("\n");
}

export function getRangeDiff(repoRoot: string, compare: CompareSpec, unified: number) {
  const base = compare.base ?? getDefaultBase(repoRoot);
  const head = compare.head ?? "HEAD";
  return runGit(repoRoot, ["diff", "--no-color", "--patch", `--unified=${unified}`, `${base}...${head}`]);
}

export function getDiff(repoRoot: string, compare: CompareSpec, unified: number) {
  return compare.mode === "working" ? getWorkingDiff(repoRoot, unified) : getRangeDiff(repoRoot, compare, unified);
}

const getWorkingFileDiffPatch = (repoRoot: string, filePath: string, unified: number) => {
  const untracked = new Set(listUntrackedFiles(repoRoot));
  if (untracked.has(filePath)) {
    return runGit(repoRoot, [
      "diff",
      "--no-color",
      "--patch",
      `--unified=${unified}`,
      "--no-index",
      "--",
      getNullPath(),
      filePath,
    ]);
  }

  return runGit(repoRoot, ["diff", "--no-color", "--patch", `--unified=${unified}`, "--", filePath]);
};

const getRangeFileDiffPatch = (repoRoot: string, filePath: string, unified: number, compare: CompareSpec) => {
  const base = compare.base ?? getDefaultBase(repoRoot);
  const head = compare.head ?? "HEAD";
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
