import type { CompareSpec } from "../shared/types";

type CompareInput = {
  mode?: string | null;
  base?: string | null;
  head?: string | null;
  number?: string | number | null;
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

export type RepoInfo = { owner: string; repo: string };

export function getOriginRepoInfo(repoRoot: string): RepoInfo | null {
  const remoteUrl = runGit(repoRoot, ["config", "--get", "remote.origin.url"]).trim();
  if (!remoteUrl) return null;

  const sshMatch = remoteUrl.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  const sshUrlMatch = remoteUrl.match(/^ssh:\/\/git@github\.com\/(.+?)\/(.+?)(?:\.git)?$/);
  if (sshUrlMatch) return { owner: sshUrlMatch[1], repo: sshUrlMatch[2] };

  try {
    const url = new URL(remoteUrl);
    if (url.hostname !== "github.com") return null;
    const [owner, repo] = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
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
  const prNumber = Number(input.number);
  if (mode === "working") {
    return { mode: "working" };
  }
  if (mode === "pr") {
    if (Number.isFinite(prNumber) && prNumber > 0) {
      return { mode: "pr", number: prNumber };
    }
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

export function getRangeDiff(repoRoot: string, compare: Extract<CompareSpec, { mode: "range" }>, unified: number) {
  const base = compare.base ?? getDefaultBase(repoRoot);
  const head = compare.head ?? "HEAD";
  return runGit(repoRoot, ["diff", "--no-color", "--patch", `--unified=${unified}`, `${base}...${head}`]);
}

export function getDiff(repoRoot: string, compare: CompareSpec, unified: number) {
  if (compare.mode === "working") return getWorkingDiff(repoRoot, unified);
  if (compare.mode === "range") return getRangeDiff(repoRoot, compare, unified);
  return "";
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

const getRangeFileDiffPatch = (
  repoRoot: string,
  filePath: string,
  unified: number,
  compare: Extract<CompareSpec, { mode: "range" }>
) => {
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
  if (compare.mode === "working") return getWorkingFileDiffPatch(repoRoot, filePath, unified);
  if (compare.mode === "range") return getRangeFileDiffPatch(repoRoot, filePath, unified, compare);
  return "";
}
