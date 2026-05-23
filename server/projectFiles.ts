import path from "path";
import { readdirSync, statSync } from "fs";
import { createHash } from "crypto";
import type { CompareSpec, ProjectFilesData, SourceFileData } from "../shared/types";
import type { ThemeId } from "../shared/themes";
import { getRangeParams, runGit } from "./git";
import { highlightSource } from "./highlight";

const maxSourceBytes = 256 * 1024;
const maxSearchResults = 500;
const fileListCache = new Map<string, { hash: string; data: ProjectFilesData }>();
const sourceCache = new Map<string, { hash: string; data: SourceFileData }>();

type TreeEntry = { kind: "directory" | "file"; path: string };
type ProjectTree = { paths: string[]; directories: string[]; searchLimited?: boolean };

export function getProjectFilesData(
  repoRoot: string,
  compare: CompareSpec,
  requestedDirs: string[] = [],
  query = ""
): ProjectFilesData {
  const normalizedDirs = normalizeRequestedDirs(requestedDirs);
  const normalizedQuery = query.trim().toLowerCase();
  const tree = normalizedQuery
    ? searchProjectPaths(repoRoot, compare, normalizedQuery)
    : listProjectTreePaths(repoRoot, compare, normalizedDirs);
  const hash = createHash("sha1")
    .update(tree.paths.join("\0"))
    .update(tree.directories.join("\0"))
    .update(tree.searchLimited ? "limited" : "")
    .digest("hex");
  const cacheKey = `${repoRoot}::${getCompareKey(compare)}:${normalizedDirs.join(",")}:${normalizedQuery}`;
  const cached = fileListCache.get(cacheKey);
  if (cached?.hash === hash) return cached.data;

  const data = {
    repo: { root: repoRoot, name: path.basename(repoRoot) },
    revision: hash,
    compare,
    paths: tree.paths,
    directories: tree.directories,
    searchLimited: tree.searchLimited,
  };
  fileListCache.set(cacheKey, { hash, data });
  return data;
}

export async function getSourceFile(
  repoRoot: string,
  requestedPath: string,
  themeId: ThemeId,
  compare: CompareSpec
): Promise<SourceFileData | null> {
  const filePath = normalizeRepoPath(requestedPath);
  if (!filePath) return null;

  const source = compare.mode === "working"
    ? await readWorkingSource(repoRoot, filePath)
    : await readRangeSource(repoRoot, filePath, compare);
  if (!source) return null;

  const hash = createHash("sha1")
    .update(`${source.size}:${source.truncated ? "1" : "0"}:`)
    .update(source.bytes)
    .digest("hex");
  const cacheKey = `${repoRoot}::${getCompareKey(compare)}:${themeId}:${filePath}`;
  const cached = sourceCache.get(cacheKey);
  if (cached?.hash === hash) return cached.data;

  const binary = isProbablyBinary(source.bytes);
  const lines = binary ? [] : await highlightSource(filePath, new TextDecoder().decode(source.bytes), themeId);
  const data = {
    path: filePath,
    size: source.size,
    truncated: source.truncated,
    binary,
    lines,
  };
  sourceCache.set(cacheKey, { hash, data });
  return data;
}

function listProjectTreePaths(repoRoot: string, compare: CompareSpec, requestedDirs: string[]): ProjectTree {
  const paths = new Set<string>();
  const directories = new Set<string>();
  const dirs = ["", ...requestedDirs];

  for (const dir of dirs) {
    const children = listDirectoryChildren(repoRoot, compare, dir);
    for (const child of children) {
      paths.add(child.path);
      if (child.kind !== "directory") continue;
      directories.add(child.path);

      const firstChild = listDirectoryChildren(repoRoot, compare, stripDirSlash(child.path))[0];
      if (!firstChild) continue;
      paths.add(firstChild.path);
      if (firstChild.kind === "directory") directories.add(firstChild.path);
    }
  }

  return {
    paths: Array.from(paths).sort(comparePaths),
    directories: Array.from(directories).sort(comparePaths),
  };
}

function searchProjectPaths(repoRoot: string, compare: CompareSpec, query: string): ProjectTree {
  const allFiles = compare.mode === "working" ? listWorkingFiles(repoRoot) : listRangeFiles(repoRoot, compare);
  const matches = allFiles.filter((filePath) => filePath.toLowerCase().includes(query));
  const limitedMatches = matches.slice(0, maxSearchResults);
  const paths = new Set<string>(limitedMatches);
  const directories = new Set<string>();

  for (const filePath of limitedMatches) {
    for (const dir of getAncestorDirs(filePath)) {
      paths.add(dir);
      directories.add(dir);
    }
  }

  return {
    paths: Array.from(paths).sort(comparePaths),
    directories: Array.from(directories).sort(comparePaths),
    searchLimited: matches.length > limitedMatches.length,
  };
}

function listDirectoryChildren(repoRoot: string, compare: CompareSpec, dir: string) {
  return compare.mode === "working"
    ? listWorkingDirectoryChildren(repoRoot, dir)
    : listRangeDirectoryChildren(repoRoot, compare, dir);
}

function listWorkingDirectoryChildren(repoRoot: string, dir: string) {
  const resolved = path.resolve(repoRoot, dir || ".");
  if (!isInsideRepoOrRoot(repoRoot, resolved)) return [];

  let entries;
  try {
    entries = readdirSync(resolved, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .map((entry) => {
      const entryPath = dir ? `${dir}/${entry.name}` : entry.name;
      const normalized = normalizeRepoPath(entryPath);
      if (!normalized || (!entry.isFile() && !entry.isDirectory())) return null;
      if (!isGitVisible(repoRoot, normalized)) return null;
      return {
        kind: entry.isDirectory() ? "directory" : "file",
        path: entry.isDirectory() ? `${normalized}/` : normalized,
      };
    })
    .filter((entry): entry is TreeEntry => Boolean(entry))
    .sort(compareTreeEntries);
}

function listRangeDirectoryChildren(repoRoot: string, compare: CompareSpec, dir: string) {
  const { head } = getRangeParams(repoRoot, compare);
  const treePath = dir ? `${dir}/` : "";
  const output = runGit(repoRoot, ["ls-tree", "-z", head, treePath]);
  return parseNullDelimited(output)
    .map(parseLsTreeEntry)
    .filter((entry): entry is TreeEntry => Boolean(entry))
    .sort(compareTreeEntries);
}

function parseLsTreeEntry(line: string) {
  const tabIndex = line.indexOf("\t");
  if (tabIndex === -1) return null;
  const meta = line.slice(0, tabIndex);
  const filePath = normalizeRepoPath(line.slice(tabIndex + 1));
  if (!filePath) return null;
  const kind = meta.includes(" tree ") ? "directory" : "file";
  return { kind, path: kind === "directory" ? `${filePath}/` : filePath } as TreeEntry;
}

function listWorkingFiles(repoRoot: string) {
  const output = runGit(repoRoot, ["ls-files", "-co", "--exclude-standard", "-z"]);
  const deletedOutput = runGit(repoRoot, ["ls-files", "-d", "-z"]);
  const deleted = new Set(parseNullDelimited(deletedOutput));
  return Array.from(new Set(parseNullDelimited(output)))
    .filter((filePath) => !deleted.has(filePath) && normalizeRepoPath(filePath))
    .sort(comparePaths);
}

function listRangeFiles(repoRoot: string, compare: CompareSpec) {
  const { head } = getRangeParams(repoRoot, compare);
  const output = runGit(repoRoot, ["ls-tree", "-r", "--name-only", "-z", head]);
  return parseNullDelimited(output)
    .filter((filePath) => normalizeRepoPath(filePath))
    .sort(comparePaths);
}

async function readWorkingSource(repoRoot: string, filePath: string) {
  const resolved = path.resolve(repoRoot, filePath);
  if (!isInsideRepo(repoRoot, resolved)) return null;

  let stat;
  try {
    stat = statSync(resolved);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  const size = stat.size;
  const bytes = new Uint8Array(await Bun.file(resolved).slice(0, maxSourceBytes).arrayBuffer());
  return { bytes, size, truncated: size > bytes.byteLength };
}

async function readRangeSource(repoRoot: string, filePath: string, compare: CompareSpec) {
  const { head } = getRangeParams(repoRoot, compare);
  const objectSpec = `${head}:${filePath}`;
  const sizeResult = runGit(repoRoot, ["cat-file", "-s", objectSpec]).trim();
  const size = Number(sizeResult);
  if (!Number.isFinite(size)) return null;

  const truncated = size > maxSourceBytes;
  const bytes = await readGitBlobPrefix(repoRoot, objectSpec, truncated);
  if (!bytes) return null;
  return { bytes, size, truncated };
}

async function readGitBlobPrefix(repoRoot: string, objectSpec: string, stopAfterLimit: boolean) {
  const child = Bun.spawn(["git", "cat-file", "blob", objectSpec], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "ignore",
  });
  const reader = child.stdout.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (total < maxSourceBytes) {
      const next = await reader.read();
      if (next.done) break;
      const remaining = maxSourceBytes - total;
      const chunk = next.value.length > remaining ? next.value.slice(0, remaining) : next.value;
      chunks.push(chunk);
      total += chunk.length;
      if (next.value.length > remaining || stopAfterLimit && total >= maxSourceBytes) {
        child.kill();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  const exitCode = await child.exited.catch(() => 1);
  if (exitCode !== 0 && total === 0) return null;
  return concatBytes(chunks, total);
}

function normalizeRepoPath(value: string) {
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  if (!normalized || normalized === "." || normalized.startsWith("/") || normalized.startsWith("../")) return null;
  if (normalized === ".git" || normalized.startsWith(".git/")) return null;
  return normalized;
}

function normalizeRequestedDirs(dirs: string[]) {
  return Array.from(new Set(dirs.map((dir) => normalizeDirPath(dir)).filter(Boolean) as string[])).sort(comparePaths);
}

function normalizeDirPath(value: string) {
  const normalized = normalizeRepoPath(stripDirSlash(value));
  return normalized ?? "";
}

function stripDirSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function getAncestorDirs(filePath: string) {
  const segments = filePath.split("/");
  const dirs: string[] = [];
  for (let index = 1; index < segments.length; index += 1) {
    dirs.push(`${segments.slice(0, index).join("/")}/`);
  }
  return dirs;
}

function isInsideRepo(repoRoot: string, resolvedPath: string) {
  const relative = path.relative(repoRoot, resolvedPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isInsideRepoOrRoot(repoRoot: string, resolvedPath: string) {
  return resolvedPath === repoRoot || isInsideRepo(repoRoot, resolvedPath);
}

function isGitVisible(repoRoot: string, filePath: string) {
  if (runGit(repoRoot, ["ls-files", "--error-unmatch", "--", filePath]).trim()) return true;
  const ignored = Bun.spawnSync(["git", "check-ignore", "-q", "--", filePath], {
    cwd: repoRoot,
    stdout: "ignore",
    stderr: "ignore",
  });
  return ignored.exitCode !== 0;
}

function parseNullDelimited(output: string) {
  return output.split("\0").filter(Boolean);
}

function comparePaths(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function compareTreeEntries(left: TreeEntry, right: TreeEntry) {
  if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
  return comparePaths(left.path, right.path);
}

function isProbablyBinary(bytes: Uint8Array) {
  const sampleLength = Math.min(bytes.byteLength, 8000);
  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] === 0) return true;
  }
  return false;
}

function concatBytes(chunks: Uint8Array[], total: number) {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function getCompareKey(compare: CompareSpec) {
  return compare.mode === "working" ? "working" : `range:${compare.base ?? ""}...${compare.head ?? ""}`;
}
