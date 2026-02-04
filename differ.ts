import fs from "fs";
import os from "os";
import path from "path";
import { startServer } from "./server";
import type { CompareSpec } from "./shared/types";

const args = Bun.argv.slice(2);
const getArg = (name: string) => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return args[index + 1];
};

const requestedPort = Number(getArg("port") ?? "4141");
const targetPath = getArg("path") ?? process.cwd();
const compare = resolveCompareArgs(getArg("compare"), getArg("base"), getArg("head"));
const pwaAppName = "Differ";
let cleanupRegistered = false;
let openedPwaApp = false;

const gitRoot = getGitRoot(targetPath);
if (!gitRoot) {
  console.error("differ: not a git repository (or any parent directory)");
  process.exit(1);
}

const { port } = await startServer({ repoRoot: gitRoot, port: requestedPort, compare });
const url = `http://localhost:${port}/`;
openBrowser(url, requestedPort);
console.log(`differ: ${url}`);

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

function openBrowser(url: string, expectedPort: number) {
  const platform = process.platform;
  const shouldTryPwa = shouldOpenInstalledPwa(url, expectedPort);
  if (shouldTryPwa && platform === "darwin") {
    if (openInstalledPwa(pwaAppName)) {
      openedPwaApp = true;
      registerAppWindowCleanup();
      return;
    }
  }
  openDefaultBrowser(url);
}

function openDefaultBrowser(url: string) {
  const platform = process.platform;
  if (platform === "darwin") {
    Bun.spawnSync(["open", url]);
    return;
  }
  if (platform === "win32") {
    Bun.spawnSync(["cmd", "/c", "start", "", url]);
    return;
  }
  Bun.spawnSync(["xdg-open", url]);
}

function shouldOpenInstalledPwa(url: string, expectedPort: number) {
  try {
    const currentPort = new URL(url).port;
    return currentPort === String(expectedPort);
  } catch {
    return false;
  }
}

function openInstalledPwa(appName: string) {
  const home = os.homedir();
  const candidates = [
    path.join(home, "Applications", `${appName}.app`),
    path.join(home, "Applications", "Chrome Apps", `${appName}.app`),
    `/Applications/${appName}.app`,
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const result = Bun.spawnSync(["open", candidate]);
    if (result.exitCode === 0) return true;
  }
  const result = Bun.spawnSync(["open", "-a", appName]);
  return result.exitCode === 0;
}

function closeInstalledPwa(appName: string) {
  if (process.platform !== "darwin") return;
  Bun.spawnSync(["osascript", "-e", `tell application "${appName}" to quit`]);
}

function registerAppWindowCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  const handleExit = () => {
    cleanupAppResources();
    process.exit(0);
  };
  process.once("SIGINT", handleExit);
  process.once("SIGTERM", handleExit);
  process.once("exit", () => cleanupAppResources());
}

function cleanupAppResources() {
  if (openedPwaApp) {
    closeInstalledPwa(pwaAppName);
    openedPwaApp = false;
  }
}
