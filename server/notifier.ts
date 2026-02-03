import { invalidateRepoCaches } from "./diffData";

export type DiffNotifier = {
  connect: () => Response;
  notify: () => void;
};

export function createDiffNotifier(repoRoot: string): DiffNotifier {
  const encoder = new TextEncoder();
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const pings = new Map<ReadableStreamDefaultController<Uint8Array>, ReturnType<typeof setInterval>>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

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

  const notify = () => {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      invalidateRepoCaches(repoRoot);
      broadcast(`event: diff\ndata: ${Date.now()}\n\n`);
    }, 150);
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
