import path from "path";
import { readFileSync, statSync } from "fs";
import type { ChangeSectionId, CompareSpec } from "../shared/types";

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

export function getWorkingDiff(repoRoot: string, unified: number, change: ChangeSectionId = "unstaged") {
  const args = ["diff", "--no-color", "--patch", `--unified=${unified}`];
  if (change === "staged") args.push("--cached");
  const output = runGit(repoRoot, args);
  if (change === "staged") return output;
  return joinGitOutputs([output, ...getUntrackedFiles(repoRoot).map((filePath) => getUntrackedFileDiff(repoRoot, filePath, unified))]);
}

export function getRangeDiff(repoRoot: string, compare: CompareSpec, unified: number) {
  const { base, head } = getRangeParams(repoRoot, compare);
  return runGit(repoRoot, ["diff", "--no-color", "--patch", `--unified=${unified}`, `${base}...${head}`]);
}

export function getDiff(repoRoot: string, compare: CompareSpec, unified: number) {
  return compare.mode === "working" ? getWorkingDiff(repoRoot, unified) : getRangeDiff(repoRoot, compare, unified);
}

export const getWorkingNumstat = (repoRoot: string, change: ChangeSectionId = "unstaged") => {
  const args = ["diff", "--no-color", "--numstat"];
  if (change === "staged") args.push("--cached");
  const output = runGit(repoRoot, args);
  if (change === "staged") return output;
  return joinGitOutputs([output, ...getUntrackedFiles(repoRoot).map((filePath) => getUntrackedFileNumstat(repoRoot, filePath))]);
};

const getRangeNumstat = (repoRoot: string, compare: CompareSpec) => {
  const { base, head } = getRangeParams(repoRoot, compare);
  return runGit(repoRoot, ["diff", "--no-color", "--numstat", `${base}...${head}`]);
};

export function getDiffNumstat(repoRoot: string, compare: CompareSpec) {
  return compare.mode === "working" ? getWorkingNumstat(repoRoot) : getRangeNumstat(repoRoot, compare);
}

const getWorkingFileDiffPatch = (
  repoRoot: string,
  filePath: string,
  unified: number,
  change: ChangeSectionId = "unstaged"
) => {
  const args = ["diff", "--no-color", "--patch", `--unified=${unified}`];
  if (change === "staged") args.push("--cached");
  args.push("--", filePath);
  const output = runGit(repoRoot, args);
  if (change === "staged" || output.trim()) return output;
  return isUntrackedFile(repoRoot, filePath) ? getUntrackedFileDiff(repoRoot, filePath, unified) : output;
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

export function getFileDiffPatch(
  repoRoot: string,
  filePath: string,
  unified: number,
  compare: CompareSpec,
  change?: ChangeSectionId
) {
  return compare.mode === "working"
    ? getWorkingFileDiffPatch(repoRoot, filePath, unified, change)
    : getRangeFileDiffPatch(repoRoot, filePath, unified, compare);
}

function getUntrackedFiles(repoRoot: string) {
  return runGit(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean);
}

function isUntrackedFile(repoRoot: string, filePath: string) {
  return getUntrackedFiles(repoRoot).includes(filePath);
}

function getUntrackedFileDiff(repoRoot: string, filePath: string, unified: number) {
  return runGit(repoRoot, ["diff", "--no-index", "--no-color", "--patch", `--unified=${unified}`, "--", "/dev/null", filePath]);
}

function getUntrackedFileNumstat(repoRoot: string, filePath: string) {
  const resolved = path.resolve(repoRoot, filePath);
  if (!isInsideRepo(repoRoot, resolved)) return "";

  try {
    const stat = statSync(resolved);
    if (!stat.isFile()) return "";
    const bytes = readFileSync(resolved);
    if (isProbablyBinary(bytes)) return `-\t-\t${filePath}\n`;
    return `${countTextLines(bytes)}\t0\t${filePath}\n`;
  } catch {
    return "";
  }
}

function joinGitOutputs(outputs: string[]) {
  return outputs
    .filter((output) => output.trim())
    .map((output) => (output.endsWith("\n") ? output : `${output}\n`))
    .join("");
}

function isInsideRepo(repoRoot: string, resolvedPath: string) {
  const relative = path.relative(repoRoot, resolvedPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isProbablyBinary(bytes: Uint8Array) {
  const sampleLength = Math.min(bytes.byteLength, 8000);
  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] === 0) return true;
  }
  return false;
}

function countTextLines(bytes: Uint8Array) {
  if (bytes.byteLength === 0) return 0;

  let lines = 0;
  for (let index = 0; index < bytes.byteLength; index += 1) {
    if (bytes[index] === 10) lines += 1;
  }
  return bytes[bytes.byteLength - 1] === 10 ? lines : lines + 1;
}
