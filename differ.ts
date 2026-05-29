import path from "path";
import { readFileSync } from "fs";
import { startServer } from "./server";
import type { CompareSpec } from "./shared/types";

const args = Bun.argv.slice(2);
const internalPortlessChildFlag = "--portless-child";
const disablePortlessFlag = "--no-portless";

const getArg = (name: string) => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return args[index + 1];
};
const hasFlag = (name: string) => args.includes(`--${name}`);

const isPortlessChild = hasFlag("portless-child");
const shouldSkipPortless =
  isPortlessChild || hasFlag("no-portless") || Boolean(getArg("port")) || process.env.DIFFER_PORTLESS === "0";
const targetPath = getArg("path") ?? process.cwd();
const compare = resolveCompareArgs(getArg("compare"), getArg("base"), getArg("head"));

const gitRoot = getGitRoot(targetPath);
if (!gitRoot) {
  console.error("differ: not a git repository (or any parent directory)");
  process.exit(1);
}

if (!shouldSkipPortless && !process.env.PORTLESS_URL && canUsePortless()) {
  const projectName = getProjectName(gitRoot);
  const portlessName = `differ.${projectName}`;
  const command = getSelfCommand();
  const childArgs = [
    "run",
    "--name",
    portlessName,
    ...command,
    ...stripPortlessWrapperArgs(args),
    "--path",
    gitRoot,
    internalPortlessChildFlag,
  ];
  const child = Bun.spawn(["portless", ...childArgs], {
    cwd: gitRoot,
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(await child.exited);
}

const requestedPort = Number(getArg("port") ?? process.env.PORT ?? "4141");
const { port } = await startServer({ repoRoot: gitRoot, port: requestedPort, compare });
const url = process.env.PORTLESS_URL ?? `http://localhost:${port}/`;
console.log(`differ: serving ${url}`);

function resolveCompareArgs(compareArg?: string, baseArg?: string, headArg?: string): CompareSpec {
  const mode = compareArg?.trim();
  const base = baseArg?.trim();
  const head = headArg?.trim();

  if (mode && mode !== "working" && mode !== "range" && mode !== "pr") {
    console.error(`differ: unknown compare mode "${mode}" (use working, range, or pr)`);
    process.exit(1);
  }

  if (mode === "working") return { mode: "working" };

  const wantsRange = mode === "range" || mode === "pr" || Boolean(base || head);
  if (!wantsRange) return { mode: "working" };
  return { mode: "range", base: base || undefined, head: head || undefined };
}

function getGitRoot(cwd: string) {
  const result = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
    cwd,
    stdout: "pipe",
    stderr: "ignore",
  });
  if (result.exitCode !== 0) return null;
  return result.stdout.toString().trim();
}

function canUsePortless() {
  try {
    const result = Bun.spawnSync(["portless", "--version"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

function getProjectName(repoRoot: string) {
  const packageName = readPackageName(repoRoot);
  return sanitizeHostnameLabels(packageName ?? path.basename(repoRoot)) || "project";
}

function readPackageName(repoRoot: string) {
  const packageJsonPath = path.join(repoRoot, "package.json");
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: unknown };
    if (typeof packageJson.name !== "string") return null;
    return packageJson.name.split("/").pop() ?? null;
  } catch {
    return null;
  }
}

function sanitizeHostnameLabels(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/-+/g, "-")
    .split(".")
    .map((label) => label.replace(/^-+|-+$/g, "").slice(0, 63))
    .filter(Boolean)
    .join(".");
}

function stripPortlessWrapperArgs(values: string[]) {
  const stripped: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === internalPortlessChildFlag || value === disablePortlessFlag) continue;
    if (value === "--path") {
      index += 1;
      continue;
    }
    stripped.push(value);
  }
  return stripped;
}

function getSelfCommand() {
  if (isCompiledRuntime()) return [process.execPath];
  const entry = Bun.argv[1];
  return entry ? ["bun", "run", entry] : [process.execPath];
}

function isCompiledRuntime() {
  return import.meta.dir.startsWith("/$bunfs/");
}
