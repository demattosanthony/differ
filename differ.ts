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

const gitRoot = getGitRoot(targetPath);
if (!gitRoot) {
  console.error("differ: not a git repository (or any parent directory)");
  process.exit(1);
}

const { port } = await startServer({ repoRoot: gitRoot, port: requestedPort, compare });
const url = `http://localhost:${port}/`;
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
