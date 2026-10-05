const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.GAME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "syria-traders-test-"));
process.env.AWAY_MS = "60";
const store = require("../src/game/gameStore");
const app = require("../src/app");

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
const read = async (id, token) => (await api(`/games/${id}`, null, token)).game;

// Opens the live event stream a browser holds, and collects the revisions it is told about.
async function watch(id, token) {
  const controller = new AbortController();
  const response = await fetch(`${base}/games/${id}/events`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  const revisions = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      for (const line of decoder.decode(value).split("\n"))
        if (line.startsWith("data: ")) revisions.push(JSON.parse(line.slice(6)).revision);
    }
  })().catch(() => {});
  const until = async (check) => {
    for (let i = 0; i < 100 && !check(); i++) await pause();
    assert.ok(check(), `Stream stopped at revisions ${revisions}`);
  };
  return { revisions, until, close: () => controller.abort() };
}
async function listeners(id, count) {
  for (let i = 0; i < 100 && store.updates.listenerCount(id) !== count; i++) await pause();
  assert.equal(store.updates.listenerCount(id), count);
}

async function mainPhase() {
  const host = await api("/games", { mode: "online", playerNames: ["Amina"] });
  const omar = await api(`/games/${host.game.roomCode}/join`, { name: "Omar" });
  let state = await read(host.game.id, host.token);
  state = (await api(`/games/${state.id}/start`, {}, host.token, state.revision)).game;
  while (state.phase === "setup-placement") {
    const active = state.players[state.currentPlayerIndex].id;
    const token = active === host.game.viewer.playerId ? host.token : omar.token;
    const mine = await read(state.id, token);
    const vertexId = mine.hints.validSetupVertices[0];
    const edgeId = mine.hints.setupRoadOptionsByVertex[vertexId][0];
    const placed = await api(
      `/games/${state.id}/setup/place`,
      { playerId: active, vertexId, edgeId },
      token,
      mine.revision,
    );
    assert.equal(placed.status, 200, placed.error);
    state = placed.game;
  }
  return { id: state.id, host, omar };
}

test("a player dropping mid-turn leaves the others connected and playing", async () => {
  const { id, host, omar } = await mainPhase();
  const [aminaStream, omarStream] = [await watch(id, host.token), await watch(id, omar.token)];
  await listeners(id, 2);
  omarStream.close();
  await listeners(id, 1);

  const before = await read(id, host.token);
  const activeId = before.players[before.currentPlayerIndex].id;
  const activeToken = activeId === host.game.viewer.playerId ? host.token : omar.token;
  const rolled = await api(
    `/games/${id}/roll`,
    { playerId: activeId },
    activeToken,
    before.revision,
  );
  assert.equal(rolled.status, 200, rolled.error);
  await aminaStream.until(() => aminaStream.revisions.includes(rolled.game.revision));
  aminaStream.close();
  await listeners(id, 0);
});

test("a reconnecting player gets the same seat and private hand back", async () => {
  const { id, host, omar } = await mainPhase();
  const seat = omar.game.viewer.playerId;
  const hand = (await read(id, omar.token)).players.find((player) => player.id === seat);
  assert.ok(
    Object.values(hand.resources).some((amount) => amount > 0),
    "Omar holds cards",
  );

  const first = await watch(id, omar.token);
  await first.until(() => first.revisions.length > 0);
  first.close();
  await listeners(id, 0);

  // The same saved token, as a phone uses after sleep or a page refresh.
  const again = await watch(id, omar.token);
  const state = await read(id, omar.token);
  await again.until(() => again.revisions.includes(state.revision));
  assert.equal(state.viewer.playerId, seat);
  const mine = state.players.find((player) => player.id === seat);
  assert.deepEqual(mine.resources, hand.resources);
  assert.ok(Array.isArray(mine.devCards));
  const other = state.players.find((player) => player.id !== seat);
  assert.equal(other.resources, null, "The opponent's hand stays private");
  assert.equal(other.devCards, null);
  // Amina's own view is untouched by Omar coming and going.
  assert.equal((await read(id, host.token)).viewer.playerId, host.game.viewer.playerId);
  again.close();
  await listeners(id, 0);
});

test("a dropped player is marked away for everyone, the match waits, and nothing is saved", async () => {
  const { id, host, omar } = await mainPhase();
  const seat = omar.game.viewer.playerId;
  const away = async (token) =>
    (await read(id, token)).players.find((player) => player.id === seat).away;
  const [aminaStream, omarStream] = [await watch(id, host.token), await watch(id, omar.token)];
  await listeners(id, 2);
  assert.equal(await away(host.token), false);
  const revision = (await read(id, host.token)).revision;

  omarStream.close();
  // Amina's screen is told to refresh although no move was made.
  await aminaStream.until(
    () => aminaStream.revisions.filter((seen) => seen === revision).length >= 2,
  );
  assert.equal(await away(host.token), true);
  const waiting = await read(id, host.token);
  assert.equal(waiting.revision, revision, "Presence never changes the match");
  assert.equal(waiting.status, "active");
  assert.equal(waiting.players.length, 2, "Nobody is removed");
  const saved = JSON.parse(fs.readFileSync(path.join(process.env.GAME_DATA_DIR, `${id}.json`)));
  assert.ok(saved.players.every((player) => !("away" in player)));

  const back = await watch(id, omar.token);
  await back.until(() => back.revisions.length > 0);
  assert.equal(await away(host.token), false);
  assert.equal((await read(id, omar.token)).viewer.playerId, seat);
  aminaStream.close();
  back.close();
  await listeners(id, 0);
});

test("a player who lost their saved seat rejoins a running match with name and room PIN", async () => {
  const { id, host, omar } = await mainPhase();
  const code = host.game.roomCode;
  const pin = host.game.rejoinPin;
  assert.match(pin, /^\d{4}$/);
  assert.equal(omar.game.rejoinPin, pin, "Every seat sees the PIN");
  const seat = omar.game.viewer.playerId;
  const hand = (await read(id, omar.token)).players.find((player) => player.id === seat);

  // A wrong name or a wrong PIN gets the same answer, and the names are not listed.
  const stranger = await api(`/games/${code}/join`, { name: "Zaid", pin });
  assert.equal(stranger.status, 403);
  assert.doesNotMatch(stranger.error, /Amina|Omar/);
  const guess = await api(`/games/${code}/join`, {
    name: "Omar",
    pin: pin === "0000" ? "1111" : "0000",
  });
  assert.equal(guess.status, 403);
  assert.equal(guess.error, stranger.error);
  assert.equal((await api(`/games/${code}/join`, { name: "Omar" })).status, 403);

  // While Omar's phone is connected, nobody else can take his seat.
  const live = await watch(id, omar.token);
  await listeners(id, 1);
  assert.equal((await api(`/games/${code}/join`, { name: "Omar", pin })).status, 409);
  live.close();
  await listeners(id, 0);

  const back = await api(`/games/${code.toLowerCase()}/join`, { name: " omar ", pin: ` ${pin} ` });
  assert.equal(back.status, 200, back.error);
  assert.notEqual(back.token, omar.token);
  assert.equal(back.game.viewer.playerId, seat);
  assert.equal(back.game.viewer.isHost, false);
  assert.equal(back.game.players.length, 2, "No new seat is created");
  const mine = back.game.players.find((player) => player.id === seat);
  assert.deepEqual(mine.resources, hand.resources);
  assert.equal(back.game.players.find((player) => player.id !== seat).resources, null);
  assert.match(back.game.log.at(-1).message, /Omar rejoined/);

  // The new token plays, and the host keeps their seat and host rights.
  const stream = await watch(id, back.token);
  await stream.until(() => stream.revisions.length > 0);
  stream.close();
  const hostBack = await api(`/games/${code}/join`, { name: "Amina", pin });
  assert.equal(hostBack.status, 200, hostBack.error);
  assert.equal(hostBack.game.viewer.isHost, true);
  assert.equal((await read(id, host.token)).viewer.playerId, host.game.viewer.playerId);
  await listeners(id, 0);
});

test("many tabs of one seat can come and go without leaving streams behind", async () => {
  const { id, host } = await mainPhase();
  const tabs = [];
  for (let i = 0; i < 8; i++) tabs.push(await watch(id, host.token));
  await listeners(id, 8);
  tabs.forEach((tab) => tab.close());
  await listeners(id, 0);
});

after(() => {
  server?.closeAllConnections();
  server?.close();
});
