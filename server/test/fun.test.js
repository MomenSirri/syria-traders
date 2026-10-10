const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.GAME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "syria-traders-test-"));
const store = require("../src/game/gameStore");
const service = require("../src/game/gameService");
const { rollInOrder } = require("./orderRoll");
const { longestRoadLength } = require("../src/game/rules");
const app = require("../src/app");

const empty = () => ({ wheat: 0, wood: 0, stone: 0, brick: 0, sheep: 0 });
// A three-player match in its action phase with known hands.
function readyMatch(hands = []) {
  let game = service.createGame({ playerNames: ["Nour", "Yazan", "Lina"] });
  if (game.phase === "order-roll") game = rollInOrder(game.id);
  while (game.phase === "setup-placement") {
    const vertexId = game.hints.validSetupVertices[0];
    game = service.placeSetup(game.id, {
      playerId: game.players[game.currentPlayerIndex].id,
      vertexId,
      edgeId: game.hints.setupRoadOptionsByVertex[vertexId][0],
    });
  }
  const saved = store.getGame(game.id);
  saved.players.forEach((player, index) => {
    for (const [resource, amount] of Object.entries(player.resources))
      saved.bank[resource] += amount;
    player.resources = { ...empty(), ...hands[index] };
    for (const [resource, amount] of Object.entries(player.resources))
      saved.bank[resource] -= amount;
  });
  saved.turnHasRolled = true;
  saved.mustMoveRobber = false;
  store.saveGame(saved);
  return store.getGame(game.id);
}

// A run of `length` free roads whose junctions are all empty, so nothing on the
// board touches it yet.
function freePath(game, length) {
  const { vertices, edges } = game.board;
  const clear = (id) =>
    !vertices[id].ownerId &&
    vertices[id].adjacentVertices.every((next) => !vertices[next].ownerId) &&
    vertices[id].adjacentEdges.every((edgeId) => !edges[edgeId].ownerId);
  const walk = (vertexId, path, seen) => {
    if (path.length === length) return path;
    for (const edgeId of vertices[vertexId].adjacentEdges) {
      const edge = edges[edgeId];
      const next = edge.v1 === vertexId ? edge.v2 : edge.v1;
      if (seen.has(next) || !clear(next)) continue;
      const found = walk(next, [...path, edgeId], new Set([...seen, next]));
      if (found) return found;
    }
    return null;
  };
  for (const vertex of vertices) {
    if (!clear(vertex.id)) continue;
    const found = walk(vertex.id, [], new Set([vertex.id]));
    if (found) return found;
  }
  throw new Error("No free path on this board.");
}
// Hand roads to a player directly, as if built earlier.
function giveRoads(saved, player, edgeIds) {
  for (const edgeId of edgeIds) {
    saved.board.edges[edgeId].ownerId = player.id;
    player.roads.push(edgeId);
  }
}
const shared = (game, a, b) => {
  const { v1, v2 } = game.board.edges[a];
  const other = game.board.edges[b];
  return [v1, v2].find((id) => id === other.v1 || id === other.v2);
};

test("longest road counts an unbroken run and an opponent's village cuts it", () => {
  const game = readyMatch();
  const saved = store.getGame(game.id);
  const [nour, yazan] = saved.players;
  const run = freePath(saved, 5);
  giveRoads(saved, nour, run);
  assert.equal(longestRoadLength(saved, nour.id), 5);
  // A village in the middle of the run splits it into 2 and 3.
  const middle = shared(saved, run[1], run[2]);
  saved.board.vertices[middle].ownerId = yazan.id;
  saved.board.vertices[middle].building = "village";
  assert.equal(longestRoadLength(saved, nour.id), 3);
  // The player's own village never cuts their road.
  saved.board.vertices[middle].ownerId = nour.id;
  assert.equal(longestRoadLength(saved, nour.id), 5);
});

test("Longest Road goes to the first run of 5, moves to a longer one, and wins", () => {
  const game = readyMatch([{ wood: 3, brick: 3 }]);
  let saved = store.getGame(game.id);
  const [nour, yazan] = saved.players;
  const run = freePath(saved, 7);
  // Pick Yazan's road now, well away from every road Nour will build.
  const scratch = structuredClone(saved);
  giveRoads(scratch, scratch.players[0], run);
  const other = freePath(scratch, 6);
  giveRoads(saved, nour, run.slice(0, 3));
  store.saveGame(saved);
  const scoreBefore = nour.score;
  let state = service.buildRoad(game.id, { playerId: nour.id, edgeId: run[3] });
  assert.equal(state.longestRoadId, null, "4 roads is not enough");
  state = service.buildRoad(game.id, { playerId: nour.id, edgeId: run[4] });
  assert.equal(state.longestRoadId, nour.id);
  assert.equal(state.players[0].score, scoreBefore + 2);
  assert.equal(state.players[0].longestRoad, 5);
  assert.match(state.log.at(-1).message, /Nour now has the Longest Road: 5 roads/);

  // Yazan builds a longer road elsewhere and takes it.
  saved = store.getGame(game.id);
  const yazanSaved = saved.players[1];
  giveRoads(saved, yazanSaved, other.slice(0, 5));
  saved.currentPlayerIndex = 1;
  yazanSaved.resources = { ...empty(), wood: 1, brick: 1 };
  store.saveGame(saved);
  const yazanBefore = yazanSaved.score;
  state = service.buildRoad(game.id, { playerId: yazan.id, edgeId: other[5] });
  assert.equal(state.longestRoadId, yazan.id);
  assert.equal(state.players[1].score, yazanBefore + 2);
  assert.equal(state.players[0].score, scoreBefore);
  assert.match(state.log.at(-1).message, /taking it from Nour/);

  // Building a sixth road ties Yazan; a tie never takes it from the holder.
  saved = store.getGame(game.id);
  saved.currentPlayerIndex = 0;
  store.saveGame(saved);
  state = service.buildRoad(game.id, { playerId: nour.id, edgeId: run[5] });
  assert.equal(state.longestRoadId, yazan.id);

  // A player who reaches 10 points with the bonus wins on the spot.
  saved = store.getGame(game.id);
  saved.players[0].score = 8;
  saved.players[0].resources = { ...empty(), wood: 1, brick: 1 };
  store.saveGame(saved);
  state = service.buildRoad(game.id, { playerId: nour.id, edgeId: run[6] });
  assert.equal(state.longestRoadId, nour.id);
  assert.equal(state.winnerId, nour.id);
  assert.equal(state.status, "finished");
});

test("a cut road loses Longest Road, and a tie for first leaves it unheld", () => {
  const game = readyMatch([{ wood: 1, brick: 1, wheat: 1, sheep: 1 }]);
  const saved = store.getGame(game.id);
  const [nour, yazan, lina] = saved.players;
  const yazanRun = freePath(saved, 6);
  giveRoads(saved, yazan, yazanRun);
  saved.longestRoadId = yazan.id;
  yazan.score += 2;
  // Two other players both have runs of 5.
  const linaRun = freePath(saved, 5);
  giveRoads(saved, lina, linaRun);
  const nourRun = freePath(saved, 5);
  giveRoads(saved, nour, nourRun);
  // Nour's road also reaches a free junction in the middle of Yazan's run.
  const middle = shared(saved, yazanRun[2], yazanRun[3]);
  const spur = saved.board.vertices[middle].adjacentEdges.find(
    (edgeId) => !saved.board.edges[edgeId].ownerId,
  );
  saved.board.edges[spur].ownerId = nour.id;
  nour.roads.push(spur);
  store.saveGame(saved);
  const yazanScore = yazan.score;
  const state = service.buildVillage(game.id, {
    playerId: nour.id,
    vertexId: middle,
  });
  assert.equal(state.players[1].longestRoad, 3);
  assert.equal(state.longestRoadId, null);
  assert.equal(state.players[1].score, yazanScore - 2);
  assert.match(
    state.log.map((entry) => entry.message).join("\n"),
    /Yazan's road was cut: nobody holds the Longest Road now/,
  );
});

test("matches saved before Longest Road, requests and awards still load and play", () => {
  const game = readyMatch([{ wood: 1, brick: 1 }]);
  const saved = store.getGame(game.id);
  delete saved.longestRoadId;
  delete saved.wishes;
  delete saved.stats;
  store.saveGame(saved);
  const state = service.getGameState(game.id);
  assert.equal(state.longestRoadId, null);
  assert.deepEqual(state.wishes, []);
  assert.equal(state.summary, null);
  const player = state.players[0];
  const edgeId = state.hints.validRoadEdges[0];
  const built = service.buildRoad(game.id, { playerId: player.id, edgeId });
  assert.equal(built.longestRoadId, null);
  const rolled = store.getGame(game.id);
  rolled.turnHasRolled = true;
  store.saveGame(rolled);
  service.endTurn(game.id, { playerId: player.id });
  service.rollDice(game.id, { playerId: state.players[1].id });
  assert.equal(
    Object.values(store.getGame(game.id).stats.dice).reduce((a, b) => a + b),
    1,
  );
});

test("a waiting player asks the table and whoever is playing takes it in one tap", () => {
  const game = readyMatch([{ wheat: 2 }, { brick: 1 }, { sheep: 1 }]);
  const [nour, yazan, lina] = game.players.map((player) => player.id);
  const want = { resource: "wheat", amount: 1 };
  assert.throws(
    () =>
      service.postWish(game.id, {
        playerId: nour,
        want,
        give: { resource: "brick", amount: 1 },
      }),
    /your turn/,
  );
  assert.throws(
    () =>
      service.postWish(game.id, {
        playerId: yazan,
        want,
        give: { resource: "sheep", amount: 1 },
      }),
    /need 1 Sheep/,
  );
  assert.throws(
    () =>
      service.postWish(game.id, {
        playerId: yazan,
        want,
        give: { resource: "wheat", amount: 1 },
      }),
    /different resource/,
  );
  assert.throws(
    () =>
      service.postWish(game.id, {
        playerId: yazan,
        want: { resource: "gold", amount: 1 },
        give: { resource: "brick", amount: 1 },
      }),
    /Choose a resource/,
  );
  let state = service.postWish(game.id, {
    playerId: yazan,
    want,
    give: { resource: "brick", amount: 1 },
  });
  state = service.postWish(game.id, {
    playerId: lina,
    want,
    give: { resource: "sheep", amount: 1 },
  });
  assert.equal(state.wishes.length, 2);
  assert.match(state.log.at(-1).message, /Lina asks: anyone have 1 Wheat\? Gives 1 Sheep/);
  // Posting again replaces the player's own request.
  state = service.postWish(game.id, {
    playerId: lina,
    want: { resource: "wheat", amount: 2 },
    give: { resource: "sheep", amount: 1 },
  });
  assert.equal(state.wishes.length, 2);
  const yazanWish = state.wishes.find((wish) => wish.playerId === yazan);
  assert.throws(
    () => service.acceptWish(game.id, { playerId: lina, wishId: yazanWish.id }),
    /not this player's turn/,
  );
  state = service.acceptWish(game.id, { playerId: nour, wishId: yazanWish.id });
  assert.deepEqual(state.players[0].resources, {
    ...empty(),
    wheat: 1,
    brick: 1,
  });
  assert.deepEqual(state.players[1].resources, { ...empty(), wheat: 1 });
  assert.equal(state.visuals.kind, "trade");
  assert.equal(state.wishes.length, 1);
  assert.throws(
    () => service.acceptWish(game.id, { playerId: nour, wishId: yazanWish.id }),
    /taken back/,
  );
  // Nour has only 1 Wheat left; Lina wants 2.
  const linaWish = state.wishes[0];
  assert.throws(
    () => service.acceptWish(game.id, { playerId: nour, wishId: linaWish.id }),
    /need 2 Wheat/,
  );
  state = service.withdrawWish(game.id, { playerId: lina });
  assert.deepEqual(state.wishes, []);
  // A request ends when its owner's own turn starts.
  service.postWish(game.id, {
    playerId: lina,
    want,
    give: { resource: "sheep", amount: 1 },
  });
  service.postWish(game.id, {
    playerId: yazan,
    want: { resource: "sheep", amount: 1 },
    give: { resource: "wheat", amount: 1 },
  });
  state = service.endTurn(game.id, { playerId: nour });
  assert.deepEqual(
    state.wishes.map((wish) => wish.playerId),
    [lina],
  );
});

test("the finished match lists awards and the dice chart, counting only public events", () => {
  const game = readyMatch([{ wheat: 1 }, { brick: 2 }, {}]);
  const [nour, yazan] = game.players.map((player) => player.id);
  service.postWish(game.id, {
    playerId: yazan,
    want: { resource: "wheat", amount: 1 },
    give: { resource: "brick", amount: 1 },
  });
  service.acceptWish(game.id, {
    playerId: nour,
    wishId: store.getGame(game.id).wishes[0].id,
  });
  const saved = store.getGame(game.id);
  saved.stats.dice = { 6: 3, 7: 2, 8: 1 };
  saved.stats.players[nour].steals = 2;
  saved.stats.players[yazan].robbed = 2;
  saved.stats.players[nour].diceCards = 9;
  saved.stats.players[yazan].diceCards = 9;
  saved.players[0].score = 9;
  saved.players[0].resources = {
    ...empty(),
    wood: 1,
    brick: 1,
    wheat: 1,
    sheep: 1,
  };
  store.saveGame(saved);
  assert.equal(service.getGameState(game.id).summary, null, "no awards before the end");
  const vertexId = service.getGameState(game.id).hints.validVillageVertices[0];
  if (vertexId === undefined) {
    // No legal village spot on this board: finish by a city instead.
    const finishing = store.getGame(game.id);
    finishing.players[0].resources = { ...empty(), wheat: 2, stone: 3 };
    store.saveGame(finishing);
  }
  const state =
    vertexId === undefined
      ? service.upgradeCity(game.id, {
          playerId: nour,
          vertexId: game.players[0].villages[0],
        })
      : service.buildVillage(game.id, { playerId: nour, vertexId });
  assert.equal(state.winnerId, nour);
  const { dice, awards } = state.summary;
  assert.equal(dice[6], 3);
  assert.equal(dice[2], 0);
  const award = (key) => awards.find((entry) => entry.key === key);
  assert.deepEqual(award("thief").playerIds, [nour]);
  assert.deepEqual(award("robbed").playerIds, [yazan]);
  assert.deepEqual(award("harvest").playerIds.sort(), [nour, yazan].sort(), "ties share");
  assert.equal(award("trader").value, 1);
  assert.equal(award("knight"), undefined, "no award for zero");
});

let server, base;
async function api(route, body, token) {
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
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, ...(await response.json()) };
}
after(() => server?.close());

test("reactions reach every screen live without changing the match", async () => {
  const host = await api("/games", { mode: "online", playerNames: ["Host"] });
  const id = host.game.id;
  const guest = await api(`/games/${host.game.roomCode}/join`, {
    name: "Guest",
  });
  const tv = await api(`/games/${host.game.roomCode}/table`, {});
  const before = (await api(`/games/${id}`, null, tv.token)).game.revision;

  const controller = new AbortController();
  const response = await fetch(`${base}/games/${id}/events`, {
    headers: { Authorization: `Bearer ${tv.token}` },
    signal: controller.signal,
  });
  const seen = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      for (const line of decoder.decode(value).split("\n"))
        if (line.startsWith("data: ")) seen.push(JSON.parse(line.slice(6)));
    }
  })().catch(() => {});

  const playerId = guest.game.viewer.playerId;
  const sent = await api(`/games/${id}/react`, { playerId, reaction: "laugh" }, guest.token);
  assert.equal(sent.status, 200);
  for (let i = 0; i < 100 && !seen.some((event) => event.reaction); i++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  const event = seen.find((entry) => entry.reaction);
  assert.equal(event.reaction.playerId, playerId);
  assert.equal(event.reaction.key, "laugh");
  assert.equal(event.revision, before);

  assert.equal(
    (await api(`/games/${id}/react`, { playerId, reaction: "laugh" }, guest.token)).status,
    429,
    "one reaction at a time",
  );
  const other = host.game.viewer.playerId;
  assert.equal(
    (await api(`/games/${id}/react`, { playerId: other, reaction: "gg" }, guest.token)).status,
    403,
    "only for your own seat",
  );
  assert.equal(
    (await api(`/games/${id}/react`, { playerId: other, reaction: "<script>" }, host.token)).status,
    400,
  );
  assert.equal(
    (await api(`/games/${id}/react`, { playerId: null, reaction: "gg" }, tv.token)).status,
    403,
    "the TV only watches",
  );
  assert.equal((await api(`/games/${id}`, null, tv.token)).game.revision, before);
  controller.abort();
});
