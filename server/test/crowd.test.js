const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.GAME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "syria-traders-test-"));
const store = require("../src/game/gameStore");
const app = require("../src/app");
const { rollEachPhone } = require("./orderRoll");

const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
let server, base;
async function api(route, body, token, revision) {
  if (!server) {
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  }
  const response = await fetch(base + route, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(revision === undefined ? {} : { "X-Game-Revision": String(revision) }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, ...(await response.json()) };
}

// One device's live stream: remembers the newest revision it was told about.
async function watch(id, token) {
  const controller = new AbortController();
  const response = await fetch(`${base}/games/${id}/events`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  const stream = { latest: 0, closed: false, close: () => controller.abort() };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n"))
        if (line.startsWith("data: "))
          stream.latest = Math.max(stream.latest, JSON.parse(line.slice(6)).revision);
    }
    stream.closed = true;
  })().catch(() => (stream.closed = true));
  return stream;
}

test("six phones, twelve TV screens and extra tabs all stay connected through a match", async (t) => {
  const warnings = [];
  const onWarning = (warning) => warnings.push(warning.message);
  process.on("warning", onWarning);
  t.after(() => process.off("warning", onWarning));

  const names = ["Amina", "Omar", "Rana", "Fadi", "Lina", "Sami"];
  const host = await api("/games", { mode: "online", playerNames: [names[0]], maxPlayers: 6 });
  assert.equal(host.status, 201, host.error);
  const { id, roomCode } = host.game;
  const seats = [host];
  for (const name of names.slice(1)) {
    const joined = await api(`/games/${roomCode}/join`, { name });
    assert.equal(joined.status, 200, joined.error);
    seats.push(joined);
  }
  // A seventh person opening the link is turned away without disturbing anyone.
  assert.equal((await api(`/games/${roomCode}/join`, { name: "Late" })).status, 400);

  const screens = [];
  for (let i = 0; i < 12; i++) {
    const screen = await api(`/games/${roomCode}/table`, {});
    assert.equal(screen.status, 201, screen.error);
    screens.push(screen);
  }

  // Every phone holds three tabs and every screen one: 30 live streams on one room.
  const streams = [];
  for (const seat of seats)
    for (let tab = 0; tab < 3; tab++) streams.push(await watch(id, seat.token));
  for (const screen of screens) streams.push(await watch(id, screen.token));
  assert.equal(store.updates.listenerCount(id), 30);

  let state = (await api(`/games/${id}`, null, host.token)).game;
  state = (await api(`/games/${id}/start`, {}, host.token, state.revision)).game;
  assert.equal(state.phase, "order-roll");
  const tokenOf = Object.fromEntries(seats.map((seat) => [seat.game.viewer.playerId, seat.token]));
  state = await rollEachPhone(api, id, tokenOf);
  assert.equal(state.phase, "setup-placement");
  let moves = 0;
  while (state.phase === "setup-placement") {
    const active = state.players[state.currentPlayerIndex].id;
    const mine = (await api(`/games/${id}`, null, tokenOf[active])).game;
    const vertexId = mine.hints.validSetupVertices[0];
    const edgeId = mine.hints.setupRoadOptionsByVertex[vertexId][0];
    const placed = await api(
      `/games/${id}/setup/place`,
      { playerId: active, vertexId, edgeId },
      tokenOf[active],
      mine.revision,
    );
    assert.equal(placed.status, 200, placed.error);
    state = placed.game;
    moves += 1;
  }
  assert.equal(moves, 12);
  // Twelve people who only opened the link join the wrong way: nothing changes.
  const strangers = await Promise.all(
    Array.from({ length: 12 }, (_, i) => api(`/games/${roomCode}/join`, { name: `Guest ${i}` })),
  );
  assert.ok(strangers.every((reply) => reply.status === 400));

  for (let i = 0; i < 100 && streams.some((stream) => stream.latest < state.revision); i++)
    await pause();
  assert.equal(streams.filter((stream) => stream.latest === state.revision).length, 30);
  assert.equal(streams.filter((stream) => stream.closed).length, 0, "No stream was dropped");

  // Every device still holds its seat or screen, and hands stay private.
  for (const seat of seats) {
    const view = (await api(`/games/${id}`, null, seat.token)).game;
    assert.equal(view.viewer.playerId, seat.game.viewer.playerId);
    assert.equal(view.players.filter((player) => player.resources).length, 1);
    assert.ok(view.players.every((player) => !player.away));
  }
  for (const screen of screens) {
    const reply = await api(`/games/${id}`, null, screen.token);
    assert.equal(reply.status, 200, "An early TV screen lost its session");
    assert.ok(reply.game.players.every((player) => player.resources === null));
  }
  assert.deepEqual(warnings, []);

  streams.forEach((stream) => stream.close());
  for (let i = 0; i < 100 && store.updates.listenerCount(id); i++) await pause();
  assert.equal(store.updates.listenerCount(id), 0);
});

after(() => {
  server?.closeAllConnections();
  server?.close();
});
