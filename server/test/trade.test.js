const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.GAME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "syria-traders-test-"));
const store = require("../src/game/gameStore");
const service = require("../src/game/gameService");
const { rollInOrder } = require("./orderRoll");
const sessions = require("../src/game/sessions");
const app = require("../src/app");

const empty = () => ({ wheat: 0, wood: 0, stone: 0, brick: 0, sheep: 0 });
// A three-player match in its action phase with known hands.
function readyMatch(hands) {
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
const totals = (game) =>
  Object.keys(game.bank).map(
    (resource) =>
      game.bank[resource] + game.players.reduce((sum, p) => sum + p.resources[resource], 0),
  );

test("ask, offer, accept swaps cards between two players only", () => {
  const game = readyMatch([{ sheep: 2 }, { wood: 2 }, { wood: 1 }]);
  const [nour, yazan, lina] = game.players.map((player) => player.id);
  const before = totals(game);
  assert.throws(
    () => service.requestTrade(game.id, { playerId: yazan, resource: "wood", amount: 1 }),
    /not this player's turn/,
  );
  let state = service.requestTrade(game.id, { playerId: nour, resource: "wood", amount: 2 });
  const requestId = state.trade.id;
  assert.deepEqual(state.trade.want, { resource: "wood", amount: 2 });
  assert.throws(
    () => service.offerTrade(game.id, { playerId: lina, requestId, resource: "sheep", amount: 1 }),
    /need 2 Wood/,
  );
  assert.throws(
    () => service.offerTrade(game.id, { playerId: yazan, requestId, resource: "wood", amount: 1 }),
    /different resource/,
  );
  assert.throws(
    () =>
      service.offerTrade(game.id, {
        playerId: yazan,
        requestId: "old",
        resource: "sheep",
        amount: 1,
      }),
    /closed/,
  );
  assert.throws(
    () => service.offerTrade(game.id, { playerId: yazan, requestId, resource: "sheep", amount: 9 }),
    /between 1 and 4/,
  );
  state = service.offerTrade(game.id, { playerId: yazan, requestId, resource: "sheep", amount: 3 });
  // A second offer from the same player replaces the first.
  state = service.offerTrade(game.id, { playerId: yazan, requestId, resource: "sheep", amount: 1 });
  assert.equal(state.trade.offers.length, 1);
  const offerId = state.trade.offers[0].id;
  assert.throws(
    () => service.acceptTradeOffer(game.id, { playerId: yazan, offerId }),
    /not this player's turn/,
  );
  state = service.acceptTradeOffer(game.id, { playerId: nour, offerId });
  assert.equal(state.trade, null);
  const by = Object.fromEntries(state.players.map((p) => [p.id, p.resources]));
  assert.deepEqual(by[nour], { ...empty(), sheep: 1, wood: 2 });
  assert.deepEqual(by[yazan], { ...empty(), sheep: 1 });
  assert.deepEqual(by[lina], { ...empty(), wood: 1 });
  assert.deepEqual(totals(store.getGame(game.id)), before);
  assert.match(state.log.at(-1).message, /Nour traded 1 Sheep.* to Yazan for 2 Wood/);
});

test("accepting checks both hands; decline, withdraw, close and end turn clear offers", () => {
  const game = readyMatch([{ brick: 1 }, { wood: 1 }, { wood: 1 }]);
  const [nour, yazan, lina] = game.players.map((player) => player.id);
  let state = service.requestTrade(game.id, { playerId: nour, resource: "wood", amount: 1 });
  const requestId = state.trade.id;
  state = service.offerTrade(game.id, { playerId: yazan, requestId, resource: "stone", amount: 1 });
  state = service.offerTrade(game.id, { playerId: lina, requestId, resource: "brick", amount: 1 });
  const [stoneOffer, brickOffer] = state.trade.offers;
  assert.throws(
    () => service.acceptTradeOffer(game.id, { playerId: nour, offerId: stoneOffer.id }),
    /need 1 Stone/,
  );
  state = service.declineTradeOffer(game.id, { playerId: nour, offerId: stoneOffer.id });
  assert.deepEqual(
    state.trade.offers.map((offer) => offer.id),
    [brickOffer.id],
  );
  state = service.withdrawTradeOffer(game.id, { playerId: lina, requestId });
  assert.equal(state.trade.offers.length, 0);
  assert.throws(
    () => service.acceptTradeOffer(game.id, { playerId: nour, offerId: brickOffer.id }),
    /withdrawn/,
  );
  state = service.cancelTrade(game.id, { playerId: nour });
  assert.equal(state.trade, null);
  service.requestTrade(game.id, { playerId: nour, resource: "wood", amount: 1 });
  state = service.endTurn(game.id, { playerId: nour });
  assert.equal(state.trade, null);
  assert.throws(
    () =>
      service.requestTrade(game.id, { playerId: state.players[1].id, resource: "wood", amount: 1 }),
    /Roll the dice/,
  );
});

test("phones offer at once without revision clashes; the TV sees offers but not hands", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const api = async (route, body, token, revision) => {
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
  try {
    const host = sessions.create({ mode: "online", playerNames: ["Nour"] });
    const yazan = sessions.join(host.game.id, { name: "Yazan" });
    const lina = sessions.join(host.game.id, { name: "Lina" });
    const id = host.game.id;
    service.startGame(id);
    const setup = store.getGame(id);
    const ready = readyMatch([]);
    // Reuse a finished board, then give known hands to this network room.
    Object.assign(setup, {
      board: ready.board,
      phase: "main",
      status: "active",
      turn: 1,
      currentPlayerIndex: 0,
      turnHasRolled: true,
      mustMoveRobber: false,
    });
    setup.players[0].resources = { ...empty(), sheep: 2 };
    setup.players[1].resources = { ...empty(), wood: 1 };
    setup.players[2].resources = { ...empty(), wood: 1 };
    store.saveGame(setup);
    const tv = await api(`/games/${id}/table`, {});
    let state = (await api(`/games/${id}`, null, host.token)).game;
    const asked = await api(
      `/games/${id}/trade/request`,
      { playerId: state.viewer.playerId, resource: "wood", amount: 1 },
      host.token,
      state.revision,
    );
    assert.equal(asked.status, 200, asked.error);
    const requestId = asked.game.trade.id;
    // Both phones answer with the same stale revision; neither is rejected.
    const offers = await Promise.all(
      [yazan, lina].map((seat) =>
        api(
          `/games/${id}/trade/offer`,
          { playerId: seat.game.viewer.playerId, requestId, resource: "sheep", amount: 1 },
          seat.token,
          0,
        ),
      ),
    );
    assert.deepEqual(
      offers.map((result) => result.status),
      [200, 200],
    );
    const table = (await api(`/games/${id}`, null, tv.token)).game;
    assert.equal(table.trade.offers.length, 2);
    assert.ok(table.players.every((player) => player.resources === null));
    assert.equal(
      (
        await api(
          `/games/${id}/trade/offer`,
          { requestId, resource: "sheep", amount: 1 },
          tv.token,
          0,
        )
      ).status,
      403,
    );
    const forged = await api(
      `/games/${id}/trade/accept`,
      { playerId: state.viewer.playerId, offerId: table.trade.offers[0].id },
      yazan.token,
      0,
    );
    assert.equal(forged.status, 403);
    const accepted = await api(
      `/games/${id}/trade/accept`,
      { playerId: state.viewer.playerId, offerId: table.trade.offers[0].id },
      host.token,
      0,
    );
    assert.equal(accepted.status, 200, accepted.error);
    assert.equal(accepted.game.players[0].resources.wood, 1);
    assert.equal(accepted.game.players[1].resources, null, "Partner's hand stays private");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

after(() => {
  if (path.basename(process.env.GAME_DATA_DIR).startsWith("syria-traders-test-"))
    fs.rmSync(process.env.GAME_DATA_DIR, { recursive: true, force: true });
});
