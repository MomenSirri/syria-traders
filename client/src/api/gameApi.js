const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export async function request(path, { token, revision, signal, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(12000)])
        : AbortSignal.timeout(12000),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(revision !== undefined ? { "X-Game-Revision": String(revision) } : {}),
      },
    });
  } catch (failure) {
    if (signal?.aborted) throw failure;
    throw new Error(
      "The host is not responding. Keep the host window open and check your network connection.",
    );
  }
  const data = await response.json().catch(() => ({}));
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
};

// A fetch-based SSE stream keeps the secret in a header, out of URLs and logs.
export async function watchMatch(id, token, signal, onRevision, onConnected) {
  // A dead Wi-Fi connection can leave a TCP stream open. Missing three server
  // heartbeats aborts it so useMatch can establish a fresh connection.
  const heartbeat = new AbortController();
  const streamSignal = AbortSignal.any([signal, heartbeat.signal]);
  let timer = setTimeout(() => heartbeat.abort(), 45000);
  let reader;
  try {
    const response = await fetch(`${API_BASE}/games/${id}/events`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: streamSignal,
    });
    if (!response.ok)
      throw Object.assign(new Error("Live connection interrupted."), { status: response.status });
    onConnected();
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!streamSignal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      clearTimeout(timer);
      timer = setTimeout(() => heartbeat.abort(), 45000);
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (event.startsWith("data: ")) onRevision(JSON.parse(event.slice(6)).revision);
      }
    }
  } finally {
    clearTimeout(timer);
    reader?.releaseLock();
  }
}
