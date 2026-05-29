import { invalidateRepoCaches, invalidateRepoFileCache, invalidateRepoListCache } from "./diffData";

export type DiffNotifier = {
  connect: () => Response;
  notify: (changedPath: string | null) => void;
};

export function createDiffNotifier(repoRoot: string): DiffNotifier {
  const encoder = new TextEncoder();
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const pings = new Map<ReadableStreamDefaultController<Uint8Array>, ReturnType<typeof setInterval>>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingPaths = new Set<string>();
  let pendingAll = false;

  const cleanupClient = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    clients.delete(controller);
    const ping = pings.get(controller);
    if (ping) clearInterval(ping);
    pings.delete(controller);
  };

  const broadcast = (payload: string) => {
    for (const client of clients) {
      try {
        client.enqueue(encoder.encode(payload));
      } catch {
        cleanupClient(client);
      }
    }
  };

  const flush = () => {
    debounceTimer = null;
    const all = pendingAll;
    const paths = Array.from(pendingPaths);
    pendingAll = false;
    pendingPaths = new Set();

    if (all) {
      invalidateRepoCaches(repoRoot);
      broadcast(`event: diff\ndata: ${JSON.stringify({ all: true })}\n\n`);
      return;
    }

    // Working-tree edit: rebuild the file list, but only drop the diffs of the
    // files that actually changed so untouched files never re-render.
    invalidateRepoListCache(repoRoot);
    invalidateRepoFileCache(repoRoot, paths);
    broadcast(`event: diff\ndata: ${JSON.stringify({ paths })}\n\n`);
  };

  const notify = (changedPath: string | null) => {
    if (changedPath === null) pendingAll = true;
    else pendingPaths.add(changedPath);
    if (debounceTimer) return;
    debounceTimer = setTimeout(flush, 150);
  };

  const connect = () => {
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller;
        clients.add(controller);
        controller.enqueue(encoder.encode("event: ready\ndata: ok\n\n"));
        const ping = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            cleanupClient(controller);
          }
        }, 20000);
        pings.set(controller, ping);
      },
      cancel() {
        if (controllerRef) cleanupClient(controllerRef);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  };

  return { connect, notify };
}
