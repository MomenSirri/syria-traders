const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.GAME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "syria-traders-test-"));
const store = require("../src/game/gameStore");
const app = require("../src/app");
const sessions = require("../src/game/sessions");
const config = require("../../shared/gameConfig.json");

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
const read = async (id, token) => (await api(`/games/${id}?media=1`, null, token)).game;

// Fails if any resource breakdown (a hand, a gain or a delta) appears outside public fields.
function assertNoPrivateData(view) {
  assert.equal(view.viewer.role, "table");
  assert.equal(view.viewer.playerId, null);
  assert.equal(view.sessions, undefined);
  assert.equal(view.hints, null);
  assert.deepEqual(view.gainEvents, []);
  assert.deepEqual(view.visuals?.resourceDeltas || [], []);
  for (const player of view.players) {
    assert.equal(player.resources, null, `${player.name}'s hand reached the table`);
    assert.equal(typeof player.resourceTotal, "number");
  }
  const walk = (value, where) => {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value)) {
      const keys = Object.keys(value);
      if (config.resources.every((resource) => keys.includes(resource)))
        assert.fail(`Resource breakdown leaked at ${where}`);
      if ("resource" in value && "amount" in value) assert.fail(`Resource gain leaked at ${where}`);
    }
    for (const [key, child] of Object.entries(value)) walk(child, `${where}.${key}`);
  };
  // The bank and rules are public and intentionally list every resource.
  const { bank, settings, ...rest } = view;
  walk(rest, "game");
}
async function placeAll(id, tokens) {
  let state = await read(id, tokens[0]);
  while (state.phase === "setup-placement") {
    const active = state.players[state.currentPlayerIndex].id;
    let token;
    for (const candidate of tokens)
      if ((await read(id, candidate)).viewer.playerId === active) token = candidate;
    const mine = await read(id, token);
    const vertexId = mine.hints.validSetupVertices[0];
    const edgeId = mine.hints.setupRoadOptionsByVertex[vertexId][0];
    const result = await api(
      `/games/${id}/setup/place`,
      { playerId: active, vertexId, edgeId },
      token,
      mine.revision,
    );
    assert.equal(result.status, 200, result.error);
    state = result.game;
  }
  return state;
}

test("a TV can host a room without a seat, and the first phone can also start it", async () => {
  const tv = await api("/games", { mode: "online", tableHost: true, playerNames: [] });
  assert.equal(tv.status, 201, tv.error);
  assert.equal(tv.game.players.length, 0);
  assert.equal(tv.game.viewer.role, "table");
  assert.equal(tv.game.viewer.isHost, true);
  assert.ok(Array.isArray(tv.game.hostAddresses));
  const nour = await api(`/games/${tv.game.roomCode}/join`, { name: "Nour" });
  const yazan = await api(`/games/${tv.game.roomCode}/join`, { name: "Yazan" });
  assert.equal(nour.game.viewer.isHost, true, "First phone is the room captain");
  assert.equal(yazan.game.viewer.isHost, false);
  assert.equal(nour.game.hostPlayerId, nour.game.viewer.playerId);
  let state = await read(tv.game.id, tv.token);
  assert.equal(
    (await api(`/games/${state.id}/start`, {}, yazan.token, state.revision)).status,
    403,
  );
  const started = await api(`/games/${state.id}/start`, {}, tv.token, state.revision);
  assert.equal(started.status, 200, started.error);
  assert.equal(started.game.phase, "setup-placement");
  assertNoPrivateData(started.game);
});

test("the table view never carries hands, gains or move hints, and cannot act", async () => {
  const host = await api("/games", { mode: "online", playerNames: ["Amina"] });
  const omar = await api(`/games/${host.game.roomCode}/join`, { name: "Omar" });
  let state = await read(host.game.id, host.token);
  state = (await api(`/games/${state.id}/start`, {}, host.token, state.revision)).game;
  state = await placeAll(state.id, [host.token, omar.token]);
  assert.equal(state.phase, "main");

  // Join the TV after the match started; second placements have paid out cards.
  const tv = await api(`/games/${host.game.roomCode.toLowerCase()}/table`, {});
  assert.equal(tv.status, 201, tv.error);
  assert.equal(tv.game.viewer.isHost, false);
  assertNoPrivateData(tv.game);
  const amina = await read(state.id, host.token);
  assert.ok(
    amina.players.some((player) => player.resources),
    "Players still see their hand",
  );
  assert.ok(amina.gainEvents.length > 0);
  const view = await read(state.id, tv.token);
  assertNoPrivateData(view);
  assert.equal(view.board.tiles.length, 19);
  assert.equal(view.log.length, amina.log.length);
  assert.deepEqual(
    view.players.map((p) => [p.score, p.resourceTotal, p.villages]),
    amina.players.map((p) => [p.score, p.resourceTotal, p.villages]),
  );

  const active = view.players[view.currentPlayerIndex].id;
  for (const [route, body] of [
    ["roll", { playerId: active }],
    ["roll", {}],
    ["end-turn", { playerId: null }],
    ["trade/bank", { playerId: active, giveResource: "wood", getResource: "wheat" }],
    ["start", {}],
  ])
    assert.equal(
      (await api(`/games/${state.id}/${route}`, body, tv.token, view.revision)).status,
      403,
      route,
    );
  assert.equal((await read(state.id, tv.token)).revision, view.revision);

  const roll = await api(
    `/games/${state.id}/roll`,
    { playerId: active },
    host.token,
    view.revision,
  );
  const roller =
    roll.status === 200
      ? roll
      : await api(`/games/${state.id}/roll`, { playerId: active }, omar.token, view.revision);
  assert.equal(roller.status, 200, roller.error);
  assertNoPrivateData(await read(state.id, tv.token));
});

test("table screens leave cleanly and old player sessions keep working", async () => {
  const tv = await api("/games", { mode: "online", tableHost: true, playerNames: [] });
  const guest = await api(`/games/${tv.game.id}/join`, { name: "Guest" });
  const seat = sessions.authenticate(tv.game.id, guest.token);
  sessions.leaveLobby(seat.game, seat.session);
  assert.equal(store.getGame(tv.game.id).phase, "lobby", "TV-hosted room stays open");
  const late = await api(`/games/${tv.game.id}/join`, { name: "Late" });
  assert.equal(late.game.viewer.isHost, true, "Next phone becomes captain");
  const watcher = await api(`/games/${tv.game.id}/table`, {});
  assert.equal((await api(`/games/${tv.game.id}/leave`, {}, watcher.token, 0)).status, 200);
  assert.equal((await api(`/games/${tv.game.id}`, null, watcher.token)).status, 401);
  const lateSeat = sessions.authenticate(tv.game.id, late.token);
  sessions.leaveLobby(lateSeat.game, lateSeat.session);
  assert.equal((await api(`/games/${tv.game.id}/leave`, {}, tv.token, 0)).status, 200);
  assert.equal(store.getGame(tv.game.id).status, "closed");
  assert.equal((await api(`/games/${tv.game.id}/table`, {})).status, 404);

  // Saves written before table screens existed have sessions without a role.
  const host = sessions.create({ mode: "online", playerNames: ["Host"] });
  const game = store.getGame(host.game.id);
  game.sessions = game.sessions.map(({ playerId, host: isHost, tokenHash }) => ({
    playerId,
    host: isHost,
    tokenHash,
  }));
  store.saveGame(game);
  const restored = sessions.authenticate(host.game.id, host.token);
  assert.equal(sessions.isTable(restored.session), false);
  const view = sessions.view(restored.game, restored.session);
  assert.equal(view.viewer.playerId, host.game.viewer.playerId);
  assert.ok(view.players[0].resources);

  for (let i = 0; i < 12; i++) await api(`/games/${host.game.id}/table`, {});
  const tables = store.getGame(host.game.id).sessions.filter(sessions.isTable);
  assert.ok(tables.length <= 8, "Reopened TV screens don't accumulate in the save");
});

test("table hosting is validated", () => {
  assert.throws(
    () => sessions.create({ mode: "online", tableHost: true, playerNames: ["Nour"] }),
    /without a seat/,
  );
  assert.throws(
    () => sessions.create({ mode: "local", tableHost: true, playerNames: [] }),
    /Only network rooms/,
  );
  assert.throws(
    () => sessions.create({ mode: "online", tableHost: "yes", playerNames: [] }),
    /table screen/,
  );
  const local = sessions.create({ playerNames: ["Nour", "Yazan"] });
  assert.throws(() => sessions.watch(local.game.id), /not found/);
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (path.basename(process.env.GAME_DATA_DIR).startsWith("syria-traders-test-"))
    fs.rmSync(process.env.GAME_DATA_DIR, { recursive: true, force: true });
});
