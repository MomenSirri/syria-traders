const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

// AbortSignal.any and AbortSignal.timeout are missing from most smart-TV browsers,
// so combine signals by hand. The optional timeout aborts after `ms`; release()
// detaches from long-lived parent signals once the request is over.
export function anySignal(signals, ms) {
  const controller = new AbortController();
  const parents = signals.filter(Boolean);
  let timer;
  const release = () => {
    clearTimeout(timer);
    parents.forEach((parent) => parent.removeEventListener("abort", abort));
  };
  function abort() {
    release();
    controller.abort();
  }
  if (parents.some((parent) => parent.aborted)) abort();
  else {
    parents.forEach((parent) => parent.addEventListener("abort", abort));
    if (ms) timer = setTimeout(abort, ms);
  }
  return { signal: controller.signal, release };
}
// Older TV browsers ignore a fetch signal, so stop waiting when it aborts anyway.
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const stop = () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    if (signal.aborted) return stop();
    signal.addEventListener("abort", stop);
    promise.then(resolve, reject).then(() => signal.removeEventListener("abort", stop));
  });
}

export async function request(path, { token, revision, signal, ...options } = {}) {
  let response, data;
  const linked = anySignal([signal], 12000);
  try {
    response = await abortable(
      fetch(`${API_BASE}${path}`, {
        ...options,
        signal: linked.signal,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(revision !== undefined ? { "X-Game-Revision": String(revision) } : {}),
        },
      }),
      linked.signal,
    );
  } catch (failure) {
    if (signal?.aborted) throw failure;
    linked.release();
    throw new Error(
      "The host is not responding. Keep the host window open and check your network connection.",
    );
  }
  try {
    data = await abortable(response.json(), linked.signal);
  } catch {
    data = {};
  } finally {
    linked.release();
  }
  if (!response.ok)
    throw Object.assign(new Error(data.error || "Cannot reach the game server."), {
      status: response.status,
    });
  return data;
}

export const gameApi = {
  create: (payload) => request("/games", { method: "POST", body: JSON.stringify(payload) }),
  join: (code, payload) =>
    request(`/games/${encodeURIComponent(code.trim())}/join`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // Opens a read-only table screen (TV) for a network room.
  watch: (code) =>
    request(`/games/${encodeURIComponent(code.trim())}/table`, { method: "POST", body: "{}" }),
  get: (id, token, media = false, signal) =>
    request(`/games/${id}${media ? "?media=1" : ""}`, { token, signal }),
  act: (game, token, route, body) =>
    request(`/games/${game.id}/${route}`, {
      method: "POST",
      token,
      revision: game.revision,
      body: JSON.stringify(body),
    }),
  // Quick reactions skip the revision check: they never change the match.
  react: (game, token, body) =>
    request(`/games/${game.id}/react`, { method: "POST", token, body: JSON.stringify(body) }),
};

// A fetch-based SSE stream keeps the secret in a header, out of URLs and logs.
export async function watchMatch(id, token, signal, onRevision, onConnected, onBeat) {
  // A dead Wi-Fi connection can leave a TCP stream open. Missing three server
  // heartbeats aborts it so useMatch can establish a fresh connection.
  const heartbeat = new AbortController();
  const linked = anySignal([signal, heartbeat.signal]);
  const streamSignal = linked.signal;
  let timer = setTimeout(() => heartbeat.abort(), 45000);
  let reader;
  try {
    const response = await abortable(
      fetch(`${API_BASE}/games/${id}/events`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: streamSignal,
      }),
      streamSignal,
    );
    if (!response.ok)
      throw Object.assign(new Error("Live connection interrupted."), { status: response.status });
    onConnected();
    reader = response.body.getReader();
    // Cancelling the reader ends a stalled stream even where fetch ignores signals.
    streamSignal.addEventListener("abort", () => reader.cancel().catch(() => {}));
    const decoder = new TextDecoder();
    let buffer = "";
    while (!streamSignal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      clearTimeout(timer);
      timer = setTimeout(() => heartbeat.abort(), 45000);
      onBeat?.();
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (event.startsWith("data: ")) {
          const update = JSON.parse(event.slice(6));
          onRevision(update.revision, update.presence, update.reaction);
        }
      }
    }
  } finally {
    clearTimeout(timer);
    linked.release();
    reader?.releaseLock();
  }
}
