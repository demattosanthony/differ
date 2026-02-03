import path from "path";
import { ensureUiAssets } from "./assets";
import { createDiffNotifier } from "./notifier";
import { createRequestHandler } from "./router";
import { startRepoWatcher } from "./watch";

export async function startServer({ repoRoot, port }: { repoRoot: string; port: number }) {
  const runtimeDir = import.meta.dir;
  const isCompiledRuntime = runtimeDir.startsWith("/$bunfs/");
  const baseDir = isCompiledRuntime ? path.dirname(process.execPath) : path.dirname(runtimeDir);
  const uiDir = path.join(baseDir, "ui");
  const distDir = path.join(baseDir, ".differ-dist");
  const idleTimeout = 60;

  await ensureUiAssets({ uiDir, distDir, isCompiledRuntime });

  const notifier = createDiffNotifier(repoRoot);
  startRepoWatcher(repoRoot, notifier.notify);

  const fetch = createRequestHandler({ repoRoot, distDir, notifier });
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
