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

export function getFileDiffPatch(repoRoot: string, filePath: string, unified: number) {
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
}
