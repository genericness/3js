/* Photon cloud API bridge — fetches run here so they stay off the page Network panel. */
self.onconnect = (event) => {
  const port = event.ports[0];
  port.start();
  /** @type {Map<number, AbortController>} */
  const controllers = new Map();

  port.onmessage = async (messageEvent) => {
    const msg = messageEvent.data;
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "abort") {
      const controller = controllers.get(msg.id);
      if (controller) {
        controller.abort();
        controllers.delete(msg.id);
      }
      return;
    }

    if (msg.type !== "fetch" && msg.type !== "ndjson") return;

    const id = msg.id;
    const controller = new AbortController();
    controllers.set(id, controller);

    try {
      const response = await fetch(msg.url, {
        method: msg.method || "GET",
        headers: msg.headers || undefined,
        body: msg.body ?? undefined,
        signal: controller.signal,
        keepalive: Boolean(msg.keepalive),
      });

      if (msg.type === "fetch") {
        const text = await response.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        port.postMessage({
          id,
          type: "fetch-result",
          ok: response.ok,
          status: response.status,
          json,
          text,
        });
        return;
      }

      if (!response.ok) {
        const text = await response.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        port.postMessage({
          id,
          type: "ndjson-error",
          status: response.status,
          json,
          text,
        });
        return;
      }

      if (!response.body) {
        port.postMessage({ id, type: "ndjson-done" });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            port.postMessage({ id, type: "ndjson-event", event: JSON.parse(trimmed) });
          } catch {
            /* skip malformed */
          }
        }
      }

      const tail = buffer.trim();
      if (tail) {
        try {
          port.postMessage({ id, type: "ndjson-event", event: JSON.parse(tail) });
        } catch {
          /* skip */
        }
      }
      port.postMessage({ id, type: "ndjson-done" });
    } catch (error) {
      const aborted =
        (error && typeof error === "object" && "name" in error && error.name === "AbortError") ||
        controller.signal.aborted;
      port.postMessage({
        id,
        type: "error",
        aborted: Boolean(aborted),
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      controllers.delete(id);
    }
  };
};
