import path from "path";
import { ensureUiAssets } from "./assets";
import { createDiffNotifier } from "./notifier";
import { createRequestHandler } from "./router";
import { startRepoWatcher } from "./watch";
import type { CompareSpec } from "../shared/types";
import { normalizeCompare } from "./git";

type StartServerOptions = {
  repoRoot: string;
  port: number;
  compare?: CompareSpec;
};

export async function startServer({ repoRoot, port, compare }: StartServerOptions) {
  const runtimeDir = import.meta.dir;
  const isCompiledRuntime = runtimeDir.startsWith("/$bunfs/");
  const baseDir = isCompiledRuntime ? path.dirname(process.execPath) : path.dirname(runtimeDir);
  const uiDir = path.join(baseDir, "ui");
  const distDir = path.join(baseDir, ".differ-dist");
  const idleTimeout = 60;

  await ensureUiAssets({ uiDir, distDir, isCompiledRuntime });

  const notifier = createDiffNotifier(repoRoot);
  startRepoWatcher(repoRoot, notifier.notify);

  const defaultCompare = normalizeCompare(repoRoot, {
    mode: compare?.mode,
    base: compare?.base ?? null,
    head: compare?.head ?? null,
  });
  const fetch = createRequestHandler({ repoRoot, distDir, notifier, defaultCompare });
  let server;
  try {
    server = Bun.serve({
      port,
      idleTimeout,
      fetch,
    });
  } catch {
    server = Bun.serve({
      port: 0,
      idleTimeout,
      fetch,
    });
  }

  return { port: server.port };
}
