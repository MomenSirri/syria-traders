const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

process.env.GAME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "syria-traders-test-"));
const store = require("../src/game/gameStore");
const service = require("../src/game/gameService");
const rules = require("../src/game/rules");
const { generateBoard } = require("../src/game/boardGenerator");
const app = require("../src/app");
const sessions = require("../src/game/sessions");

function newGame(count = 2) {
  return service.createGame({ playerNames: ["Nour", "Yazan", "Lina", "Sami"].slice(0, count) });
}
function finishSetup(game) {
  while (game.phase === "setup-placement") {
    const vertexId = game.hints.validSetupVertices[0];
    game = service.placeSetup(game.id, {
      playerId: game.players[game.currentPlayerIndex].id,
      vertexId,
      edgeId: game.hints.setupRoadOptionsByVertex[vertexId][0],
    });
  }
  return game;
}
function conservation(game) {
  for (const resource of Object.keys(game.bank))
    assert.equal(
      game.bank[resource] + game.players.reduce((sum, p) => sum + p.resources[resource], 0),
      50,
    );
}

test("board topology, harbor anchors and balanced production", () => {
  for (let i = 0; i < 40; i++) {
    const b = generateBoard();
    assert.equal(b.tiles.length, 19);
    assert.equal(b.seaTiles.length, 18);
    assert.equal(b.vertices.length, 54);
    assert.equal(b.edges.length, 72);
    const hot = b.tiles.filter((tile) => [6, 8].includes(tile.numberToken));
    assert.ok(
      !hot.some((a, i) =>
        hot.slice(i + 1).some((other) => a.edgeIds.some((id) => other.edgeIds.includes(id))),
      ),
    );
    const ports = b.seaTiles.filter((sea) => sea.harbor);
    assert.equal(ports.length, 9);
    assert.equal(new Set(ports.flatMap((sea) => sea.portVertexIds)).size, 18);
  }
});

test("snake setup for 2, 3 and 4 players conserves resources", () => {
  for (const count of [2, 3, 4]) {
    let game = newGame(count);
    const order = [];
    while (game.phase === "setup-placement") {
      order.push(game.currentPlayerIndex);
      const vertexId = game.hints.validSetupVertices[0];
      game = service.placeSetup(game.id, {
        playerId: game.players[game.currentPlayerIndex].id,
        vertexId,
        edgeId: game.hints.setupRoadOptionsByVertex[vertexId][0],
      });
    }
    assert.deepEqual(
      order,
      [...Array(count).keys(), ...Array(count).keys()].map((value, i) =>
        i < count ? value : count - 1 - value,
      ),
    );
    assert.equal(game.turn, 1);
    game.players.forEach((player) => {
      assert.equal(player.score, 2);
      assert.equal(player.roads.length, 2);
    });
    conservation(game);
  }
});

test("opponent settlement blocks road continuation and piece limits are enforced", () => {
  const game = store.getGame(newGame().id),
    player = game.players[0],
    rival = game.players[1];
  const v = game.board.vertices.find((vertex) => vertex.adjacentEdges.length === 3);
  const [owned, candidate] = v.adjacentEdges;
  game.board.edges[owned].ownerId = player.id;
  assert.equal(rules.canPlaceRoad(game, player, candidate), true);
  v.ownerId = rival.id;
  v.building = "village";
  assert.equal(rules.canPlaceRoad(game, player, candidate), false);
  v.ownerId = null;
  player.roads = Array(15).fill(owned);
  assert.equal(rules.canPlaceRoad(game, player, candidate), false);
});

test("ports give resource-specific 2:1 and generic 3:1 discounts", () => {
  const game = store.getGame(newGame().id),
    player = game.players[0];
  const port = game.board.seaTiles.find((sea) => sea.harbor === "Wheat");
  game.board.vertices[port.portVertexIds[0]].ownerId = player.id;
  assert.equal(rules.getTradeRates(game, player).wheat, 2);
  assert.equal(rules.getTradeRates(game, player).wood, 4);
  const generic = game.board.seaTiles.find((sea) => sea.harbor === "3:1");
  game.board.vertices[generic.portVertexIds[0]].ownerId = player.id;
  assert.equal(rules.getTradeRates(game, player).wood, 3);
  assert.equal(rules.getTradeRates(game, player).wheat, 2);
});

test("city produces two; blocked tiles and bank shortages don't unfairly pay the first player", () => {
  for (const scenario of ["city", "bandit", "shortage"]) {
    const game = store.getGame(finishSetup(newGame()).id);
    game.board.vertices.forEach((v) => {
      v.ownerId = null;
      v.building = null;
    });
    game.board.tiles.forEach((tile) => {
      if (tile.resource !== "desert") tile.numberToken = 12;
    });
    const tile = game.board.tiles.find((t) => t.resource !== "desert");
    tile.numberToken = 4;
    for (const [index, id] of [tile.vertexIds[0], tile.vertexIds[3]].entries()) {
      game.board.vertices[id].ownerId = game.players[index].id;
      game.board.vertices[id].building = index ? "village" : "city";
    }
    if (scenario === "bandit") game.board.robberTileId = tile.id;
    if (scenario === "shortage") game.bank[tile.resource] = 2;
    store.saveGame(game);
    const before = game.players.map((p) => p.resources[tile.resource]);
    const original = Math.random;
    Math.random = () => 0.2;
    let result;
    try {
      result = service.rollDice(game.id, { playerId: game.players[0].id });
    } finally {
      Math.random = original;
    }
    assert.equal(result.lastDiceRoll, 4);
    assert.deepEqual(
      result.players.map((p, i) => p.resources[tile.resource] - before[i]),
      scenario === "city" ? [2, 1] : [0, 0],
    );
  }
});

test("seven makes large hands return half, blocks end turn, then theft records a gain", () => {
  let game = store.getGame(finishSetup(newGame()).id);
  game.players[1].resources = { wheat: 10, wood: 0, stone: 0, brick: 0, sheep: 0 };
  store.saveGame(game);
  let call = 0;
  const original = Math.random;
  Math.random = () => (call++ === 0 ? 0 : 0.999);
  try {
    game = service.rollDice(game.id, { playerId: game.players[0].id });
  } finally {
    Math.random = original;
  }
  assert.equal(game.lastDiceRoll, 7);
  assert.deepEqual(game.pendingDiscards, { [game.players[1].id]: 5 });
  game = service.discardCards(game.id, { playerId: game.players[1].id, cards: { wheat: 5 } });
  assert.equal(game.players[1].resources.wheat, 5);
  assert.throws(() => service.endTurn(game.id, { playerId: game.players[0].id }), /bandit/);
  const tile = game.board.tiles.find(
    (t) =>
      t.id !== game.board.robberTileId &&
      t.vertexIds.some((id) => game.board.vertices[id].ownerId === game.players[1].id),
  );
  game = service.moveRobber(game.id, { playerId: game.players[0].id, tileId: tile.id });
  assert.equal(game.mustMoveRobber, false);
  assert.ok(
    game.gainEvents
      .at(-1)
      .gains.some((g) => g.playerId === game.players[0].id && g.resource === "wheat"),
  );
});

test("winning city is worth two points and finished matches reject actions", () => {
  const game = store.getGame(finishSetup(newGame()).id),
    player = game.players[0];
  game.turnHasRolled = true;
  player.score = 9;
  player.resources.wheat = 2;
  player.resources.stone = 3;
  store.saveGame(game);
  const vertexId = player.villages[0];
  const result = service.upgradeCity(game.id, { playerId: player.id, vertexId });
  assert.equal(result.status, "finished");
  assert.equal(result.winnerId, player.id);
  assert.equal(result.players[0].score, 10);
  assert.throws(() => service.buildRoad(game.id, { playerId: player.id, edgeId: 0 }), /not active/);
});

test("snapshot survives a fresh Node process", () => {
  const game = finishSetup(newGame());
  const child = spawnSync(
    process.execPath,
    [
      "-e",
      `const s=require(${JSON.stringify(path.resolve(__dirname, "../src/game/gameStore"))});console.log(JSON.stringify(s.getGame(${JSON.stringify(game.id)})))`,
    ],
    { env: process.env, encoding: "utf8" },
  );
  assert.equal(child.status, 0, child.stderr);
  const restored = JSON.parse(child.stdout);
  assert.equal(restored.turn, game.turn);
  assert.deepEqual(restored.board, game.board);
  assert.deepEqual(
    restored.players,
    game.players.map(({ resourceTotal, devCardCount, ...p }) => p),
  );
});

test("lobby departures release seats, transfer hosting and revoke the old token", () => {
  const host = sessions.create({ mode: "online", playerNames: ["Host"] });
  const guest = sessions.join(host.game.id, { name: "Guest" });
  const third = sessions.join(host.game.id, { name: "Third" });
  const auth = sessions.authenticate(host.game.id, host.token);
  sessions.leaveLobby(auth.game, auth.session);
  assert.throws(() => sessions.authenticate(host.game.id, host.token), /no player seat/);
  const promoted = sessions.authenticate(host.game.id, guest.token);
  assert.equal(promoted.session.host, true);
  assert.equal(promoted.game.players.length, 2);
  const replacement = sessions.join(host.game.id, { name: "Replacement" });
  assert.equal(new Set(replacement.game.players.map((player) => player.color)).size, 3);
  for (const token of [guest.token, third.token, replacement.token]) {
    const seat = sessions.authenticate(host.game.id, token);
    sessions.leaveLobby(seat.game, seat.session);
  }
  assert.equal(store.getGame(host.game.id).status, "closed");
  assert.throws(() => sessions.join(host.game.id, { name: "Late" }), /already started/);
});

test("malformed creation payloads cannot produce partial matches", () => {
  assert.throws(() => sessions.create({ playerNames: "Nour" }), /must be a list/);
  assert.throws(
    () => sessions.create({ mode: "unknown", playerNames: ["Nour", "Yazan"] }),
    /local or online/,
  );
  assert.throws(() => service.createGame({ playerNames: ["Nour"], maxPlayers: 3.5 }), /maximum/);
  assert.throws(() => sessions.create({ playerNames: [{}, "Yazan"] }), /Names/);
});

test("network room lifecycle, live updates, private hands, forged and stale actions", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (route, body, token, revision) => {
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
  };
  const abort = new AbortController();
  try {
    const host = await request("/games", { mode: "online", playerNames: ["Host"] });
    assert.equal(host.status, 201);
    assert.equal(host.game.phase, "lobby");
    assert.equal((await request(`/games/${host.game.id}`)).status, 401);
    const stream = await fetch(base + `/games/${host.game.id}/events`, {
      headers: { Authorization: `Bearer ${host.token}` },
      signal: abort.signal,
    });
    const reader = stream.body.getReader();
    await reader.read();
    const guest = await request(`/games/${host.game.roomCode}/join`, { name: "Guest" });
    const third = await request(`/games/${host.game.roomCode}/join`, { name: "Third" });
    assert.equal(third.game.phase, "lobby");
    assert.equal(third.game.players.length, 3);
    const update = await reader.read();
    assert.match(new TextDecoder().decode(update.value), /revision/);
    let state = (await request(`/games/${host.game.id}`, null, host.token)).game;
    assert.equal(
      (await request(`/games/${state.id}/start`, {}, guest.token, state.revision)).status,
      403,
    );
    state = (await request(`/games/${state.id}/start`, {}, host.token, state.revision)).game;
    assert.equal(state.phase, "setup-placement");
    assert.equal(state.players[1].resources, null);
    assert.ok(state.players[0].resources);
    const vertexId = state.hints.validSetupVertices[0],
      edgeId = state.hints.setupRoadOptionsByVertex[vertexId][0];
    const body = { playerId: state.players[0].id, vertexId, edgeId };
    assert.equal(
      (await request(`/games/${state.id}/setup/place`, body, guest.token, state.revision)).status,
      403,
    );
    assert.equal(
      (
        await request(
          `/games/${state.id}/setup/place`,
          { ...body, vertexId: null },
          host.token,
          state.revision,
        )
      ).status,
      400,
    );
    const results = await Promise.all([
      request(`/games/${state.id}/setup/place`, body, host.token, state.revision),
      request(`/games/${state.id}/setup/place`, body, host.token, state.revision),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal((await request(`/games/${state.id}/join`, { name: "Late" })).status, 400);
    const viewed = (await request(`/games/${state.id}`, null, guest.token)).game;
    assert.ok(viewed.hints);
    assert.equal(viewed.players[0].resources, null);
    assert.equal(viewed.sessions, undefined);
  } finally {
    abort.abort();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

after(() => {
  // Delete only the unique test directory that this process created.
  if (path.basename(process.env.GAME_DATA_DIR).startsWith("syria-traders-test-"))
    fs.rmSync(process.env.GAME_DATA_DIR, { recursive: true, force: true });
});
