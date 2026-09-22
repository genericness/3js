self.onconnect = (event) => {
  const port = event.ports[0];
  port.start();

  port.onmessage = async (messageEvent) => {
    const msg = messageEvent.data;
    if (!msg || typeof msg !== "object" || msg.type !== "probe") return;
    const url = typeof msg.url === "string" ? msg.url : "";
    const chance = typeof msg.chance === "number" ? msg.chance : 0.8;
    const timeout = typeof msg.timeout === "number" ? msg.timeout : 4000;
    const use = await decide(url, chance, timeout);
    port.postMessage({ type: "result", use });
  };
};

/** @type {boolean | null} */
let decision = null;
/** @type {Promise<boolean> | null} */
let inflight = null;

function decide(url, chance, timeout) {
  if (decision !== null) return Promise.resolve(decision);
  if (inflight) return inflight;
  inflight = probe(url, chance, timeout).then((use) => {
    decision = use;
    inflight = null;
    return use;
  });
  return inflight;
}

async function probe(url, chance, timeout) {
  if (!url) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    await fetch(url, { mode: "no-cors", cache: "no-store", credentials: "omit", signal: controller.signal });
    return Math.random() < chance;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
