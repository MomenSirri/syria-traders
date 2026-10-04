const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.GAME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "syria-traders-test-"));
const store = require("../src/game/gameStore");
const service = require("../src/game/gameService");
const sessions = require("../src/game/sessions");

const empty = () => ({ wheat: 0, wood: 0, stone: 0, brick: 0, sheep: 0 });
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
// After a seven: the roller must move the bandit, and one territory has two
// opponents on it (and nobody else), each with a known hand.
function afterSeven(gameId, hands) {
  const saved = store.getGame(gameId);
  saved.players.forEach((player, index) => {
    for (const [resource, amount] of Object.entries(player.resources))
      saved.bank[resource] += amount;
    player.resources = { ...empty(), ...hands[index] };
    for (const [resource, amount] of Object.entries(player.resources))
      saved.bank[resource] -= amount;
  });
  const [, yazan, lina] = saved.players;
  const tile = saved.board.tiles.find((entry) => entry.id !== saved.board.robberTileId);
  tile.vertexIds.forEach((id, index) => {
    saved.board.vertices[id].ownerId = index === 0 ? yazan.id : index === 3 ? lina.id : null;
  });
  saved.turnHasRolled = true;
  saved.mustMoveRobber = true;
  store.saveGame(saved);
  return { tileId: tile.id, ids: saved.players.map((player) => player.id) };
}

test("on a seven the roller chooses which player on the territory to rob", () => {
  const game = finishSetup(service.createGame({ playerNames: ["Nour", "Yazan", "Lina"] }));
  const { tileId, ids } = afterSeven(game.id, [{}, { wheat: 2 }, { sheep: 3 }]);
  const [nour, yazan, lina] = ids;
  const state = service.getGameState(game.id);
  assert.deepEqual(state.hints.robberVictimsByTile[tileId], [yazan, lina]);

  assert.throws(() => service.moveRobber(game.id, { playerId: nour, tileId }), /Choose who/);
  assert.throws(
    () => service.moveRobber(game.id, { playerId: nour, tileId, victimId: nour }),
    /village or city on that territory/,
  );
  assert.equal(store.getGame(game.id).mustMoveRobber, true, "a refused move changes nothing");

  const after = service.moveRobber(game.id, { playerId: nour, tileId, victimId: lina });
  assert.equal(after.board.robberTileId, tileId);
  assert.equal(after.mustMoveRobber, false);
  assert.equal(after.players[2].resources.sheep, 2);
  assert.equal(after.players[0].resources.sheep, 1);
  assert.equal(after.players[1].resources.wheat, 2, "Yazan keeps his cards");
  assert.equal(after.log.at(-1).message, "Nour stole a card from Lina.");
  assert.equal(after.visuals.kind, "steal");
  assert.equal(after.visuals.fromPlayerId, lina);
});

test("a lone opponent is robbed without asking, and an empty hand is skipped", () => {
  const game = finishSetup(service.createGame({ playerNames: ["Nour", "Yazan", "Lina"] }));
  // Lina has no cards, so Yazan is the only one who can be robbed.
  const { tileId, ids } = afterSeven(game.id, [{}, { wood: 1 }, {}]);
  const [nour, yazan] = ids;
  assert.deepEqual(service.getGameState(game.id).hints.robberVictimsByTile[tileId], [yazan]);
  const after = service.moveRobber(game.id, { playerId: nour, tileId });
  assert.equal(after.players[0].resources.wood, 1);
  assert.equal(after.players[1].resources.wood, 0);

  // With nobody holding cards there, the bandit simply blocks the territory.
  const again = finishSetup(service.createGame({ playerNames: ["Nour", "Yazan", "Lina"] }));
  const empty = afterSeven(again.id, [{}, {}, {}]);
  assert.equal(service.getGameState(again.id).hints.robberVictimsByTile[empty.tileId], undefined);
  const blocked = service.moveRobber(again.id, { playerId: empty.ids[0], tileId: empty.tileId });
  assert.equal(blocked.log.at(-1).message, "Nobody on that territory had a card to steal.");
});

test("only the thief and the victim learn which card was stolen", () => {
  const host = sessions.create({ mode: "online", playerNames: ["Nour"] });
  const yazan = sessions.join(host.game.id, { name: "Yazan" });
  const lina = sessions.join(host.game.id, { name: "Lina" });
  service.startGame(host.game.id);
  const tv = sessions.watch(host.game.id);
  const game = finishSetup(service.getGameState(host.game.id));
  const { tileId, ids } = afterSeven(game.id, [{}, { wheat: 2 }, { stone: 1 }]);
  const thief = game.players[game.currentPlayerIndex].id;
  assert.equal(thief, ids[0]);
  service.moveRobber(game.id, { playerId: thief, tileId, victimId: ids[2] });
  const viewOf = (token) => {
    const auth = sessions.authenticate(game.id, token);
    return sessions.view(auth.game, auth.session);
  };
  const stolen = (view) => view.visuals.resourceDeltas.map((delta) => delta.resource);
  assert.deepEqual(stolen(viewOf(host.token)), ["stone"]);
  assert.deepEqual(stolen(viewOf(lina.token)), ["stone"]);
  assert.deepEqual(stolen(viewOf(yazan.token)), []);
  const table = viewOf(tv.token);
  assert.deepEqual(stolen(table), []);
  assert.equal(table.visuals.kind, "steal");
  assert.equal(table.visuals.fromPlayerId, ids[2]);
  assert.equal(table.log.at(-1).message, "Nour stole a card from Lina.");
  assert.deepEqual(table.gainEvents, []);
  assert.ok(table.players.every((player) => player.resources === null));
});

// A seven with Yazan holding 9 cards and Lina 10: each must return half.
function sevenWithBigHands() {
  const game = finishSetup(service.createGame({ playerNames: ["Nour", "Yazan", "Lina"] }));
  const saved = store.getGame(game.id);
  const hands = [{ wood: 2 }, { wheat: 5, sheep: 4 }, { stone: 6, brick: 4 }];
  saved.players.forEach((player, index) => {
    for (const [resource, amount] of Object.entries(player.resources))
      saved.bank[resource] += amount;
    player.resources = { ...empty(), ...hands[index] };
    for (const [resource, amount] of Object.entries(player.resources))
      saved.bank[resource] -= amount;
  });
  saved.turnHasRolled = false;
  saved.mustMoveRobber = false;
  store.saveGame(saved);
  const original = Math.random;
  let state;
  try {
    // Each die is floor(random * 6) + 1: 0.4 and 0.5 roll 3 + 4.
    let call = 0;
    Math.random = () => (call++ === 0 ? 0.4 : 0.5);
    state = service.rollDice(game.id, { playerId: saved.players[0].id });
  } finally {
    Math.random = original;
  }
  assert.equal(state.lastDiceRoll, 7);
  return { state, ids: saved.players.map((player) => player.id) };
}

test("on a seven, big hands choose which half of their cards to return", () => {
  const { state, ids } = sevenWithBigHands();
  const [nour, yazan, lina] = ids;
  assert.deepEqual(state.pendingDiscards, { [yazan]: 4, [lina]: 5 });
  assert.deepEqual(state.hints.validRobberTiles, [], "The bandit waits for the discards");
  assert.throws(
    () => service.moveRobber(state.id, { playerId: nour, tileId: 0 }),
    /Waiting for Yazan and Lina/,
  );
  assert.throws(() => service.discardCards(state.id, { playerId: nour, cards: {} }), /no cards/);
  assert.throws(
    () => service.discardCards(state.id, { playerId: yazan, cards: { wheat: 3 } }),
    /exactly 4/,
  );
  assert.throws(
    () => service.discardCards(state.id, { playerId: yazan, cards: { wheat: 6 } }),
    /only have 5/,
  );
  assert.throws(
    () => service.discardCards(state.id, { playerId: yazan, cards: { gold: 4 } }),
    /from your hand/,
  );
  let after = service.discardCards(state.id, {
    playerId: yazan,
    cards: { wheat: 1, sheep: 3 },
  });
  assert.deepEqual(after.players[1].resources, { ...empty(), wheat: 4, sheep: 1 });
  assert.deepEqual(after.pendingDiscards, { [lina]: 5 });
  assert.equal(after.log.at(-1).message, "Yazan returned 4 cards to the bank.");
  assert.throws(
    () => service.discardCards(state.id, { playerId: yazan, cards: { wheat: 4 } }),
    /no cards/,
  );
  after = service.discardCards(state.id, { playerId: lina, cards: { brick: 4, stone: 1 } });
  assert.deepEqual(after.pendingDiscards, {});
  assert.equal(after.discardsSince, null);
  assert.ok(after.hints.validRobberTiles.length > 0, "Now the bandit can move");
  assert.equal(after.bank.sheep, state.bank.sheep + 3, "Returned cards go to the bank");
  assert.equal(after.bank.brick, state.bank.brick + 4);
});

test("a player who never chooses can be discarded for at random after a wait", () => {
  const { state, ids } = sevenWithBigHands();
  const [nour, yazan, lina] = ids;
  assert.throws(
    () => service.discardCards(state.id, { playerId: nour, forPlayerId: yazan }),
    /a moment/,
  );
  assert.throws(
    () => service.discardCards(state.id, { playerId: lina, forPlayerId: yazan }),
    /turn/i,
    "Only the roller may hurry someone",
  );
  const saved = store.getGame(state.id);
  saved.discardsSince = new Date(Date.now() - 61000).toISOString();
  store.saveGame(saved);
  const after = service.discardCards(state.id, { playerId: nour, forPlayerId: yazan });
  assert.equal(
    Object.values(after.players[1].resources).reduce((a, b) => a + b, 0),
    5,
  );
  assert.match(after.log.at(-1).message, /Yazan took too long/);
  assert.deepEqual(after.pendingDiscards, { [lina]: 5 });
});
