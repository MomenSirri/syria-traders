const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.GAME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "syria-traders-test-"));
const store = require("../src/game/gameStore");
const service = require("../src/game/gameService");
const sessions = require("../src/game/sessions");

// Each roll uses two Math.random calls, one per die: face n comes from (n - 1) / 6.
function rollAs(gameId, playerId, faces, extra = {}) {
  const original = Math.random;
  const queue = faces.map((face) => (face - 1) / 6 + 0.01);
  Math.random = () => queue.shift();
  try {
    return service.rollForOrder(gameId, { playerId, ...extra });
  } finally {
    Math.random = original;
  }
}
const ids = (game) => Object.fromEntries(game.players.map((player) => [player.name, player.id]));
const names = (game) => game.players.map((player) => player.name);

test("everyone rolls and the highest goes first, for placement and turn 1", () => {
  let game = service.createGame({ playerNames: ["Nour", "Yazan", "Lina"] });
  assert.equal(game.phase, "order-roll");
  assert.equal(game.hints.canRoll, false);
  assert.deepEqual(game.hints.validSetupVertices, []);
  const id = ids(game);
  assert.deepEqual(game.orderRoll.waiting, [id.Nour, id.Yazan, id.Lina]);
  assert.throws(
    () => service.placeSetup(game.id, { playerId: id.Nour, vertexId: 0, edgeId: 0 }),
    /Setup placement phase is not active/,
  );
  assert.throws(() => service.rollDice(game.id, { playerId: id.Nour }), /Finish setup/);

  game = rollAs(game.id, id.Nour, [2, 3]);
  assert.deepEqual(game.orderRoll.rolls[id.Nour], [2, 3]);
  assert.deepEqual(game.lastDicePair, [2, 3]);
  assert.equal(game.visuals.kind, "order-roll");
  assert.equal(game.visuals.playerId, id.Nour);
  assert.throws(() => rollAs(game.id, id.Nour, [6, 6]), /Nour has already rolled/);
  game = rollAs(game.id, id.Yazan, [1, 1]);
  game = rollAs(game.id, id.Lina, [6, 4]);

  assert.equal(game.phase, "setup-placement");
  assert.deepEqual(names(game), ["Lina", "Nour", "Yazan"]);
  assert.deepEqual(game.orderRoll.order, [id.Lina, id.Nour, id.Yazan]);
  assert.match(game.log.at(-2).message, /Turn order: Lina, Nour, Yazan\./);
  assert.throws(() => rollAs(game.id, id.Yazan, [6, 6]), /already decided/);

  // Placement snakes from the top roller and back; turn 1 belongs to them too.
  const order = [];
  while (game.phase === "setup-placement") {
    const vertexId = game.hints.validSetupVertices[0];
    order.push(game.players[game.currentPlayerIndex].name);
    game = service.placeSetup(game.id, {
      playerId: game.players[game.currentPlayerIndex].id,
      vertexId,
      edgeId: game.hints.setupRoadOptionsByVertex[vertexId][0],
    });
  }
  assert.deepEqual(order, ["Lina", "Nour", "Yazan", "Yazan", "Nour", "Lina"]);
  assert.equal(game.players[game.currentPlayerIndex].name, "Lina");
  assert.match(game.log.at(-1).message, /Lina begins turn 1/);
  // The opening rolls don't count toward the dice chart.
  assert.deepEqual(store.getGame(game.id).stats.dice, {});
});

test("tied players roll again among themselves and keep their place in the order", () => {
  let game = service.createGame({ playerNames: ["Nour", "Yazan", "Lina", "Sami"] });
  const id = ids(game);
  game = rollAs(game.id, id.Nour, [4, 4]);
  game = rollAs(game.id, id.Yazan, [5, 3]);
  game = rollAs(game.id, id.Lina, [2, 1]);
  game = rollAs(game.id, id.Sami, [6, 6]);
  assert.equal(game.phase, "order-roll");
  assert.match(game.log.at(-1).message, /Nour and Yazan tie on 8 and roll again/);
  assert.deepEqual(game.orderRoll.waiting, [id.Nour, id.Yazan]);
  assert.throws(() => rollAs(game.id, id.Lina, [6, 6]), /Lina has already rolled/);

  // A second tie rolls again; the lower rolls never jump above Sami's 12.
  game = rollAs(game.id, id.Yazan, [1, 2]);
  game = rollAs(game.id, id.Nour, [2, 1]);
  assert.deepEqual(game.orderRoll.waiting, [id.Nour, id.Yazan]);
  game = rollAs(game.id, id.Nour, [1, 1]);
  game = rollAs(game.id, id.Yazan, [3, 3]);
  assert.equal(game.phase, "setup-placement");
  assert.deepEqual(names(game), ["Sami", "Yazan", "Nour", "Lina"]);
});

test("on phones each player rolls their own dice; a slow one can be rolled for later", () => {
  const host = sessions.create({ mode: "online", playerNames: ["Nour"] });
  const yazan = sessions.join(host.game.id, { name: "Yazan" });
  const tv = sessions.watch(host.game.id);
  let game = service.startGame(host.game.id);
  assert.equal(game.phase, "order-roll");
  const id = ids(game);
  assert.throws(
    () => sessions.assertAction(game, sessions.authenticate(game.id, tv.token).session, {}),
    /table screen only shows/,
  );
  rollAs(game.id, id.Nour, [3, 3]);
  assert.throws(
    () => rollAs(game.id, id.Nour, [6, 6], { forPlayerId: id.Yazan }),
    /Give Yazan a moment to roll/,
  );
  const saved = store.getGame(game.id);
  saved.orderRoll.since = new Date(Date.now() - 31000).toISOString();
  store.saveGame(saved);
  game = rollAs(game.id, id.Nour, [6, 5], { forPlayerId: id.Yazan });
  assert.deepEqual(names(game), ["Yazan", "Nour"]);
  assert.match(
    game.log.find((entry) => /Yazan rolls/.test(entry.message)).message,
    /rolled by Nour/,
  );

  // The rolls are public: the TV sees them, and still no hands.
  const auth = sessions.authenticate(game.id, tv.token);
  const table = sessions.view(auth.game, auth.session);
  assert.deepEqual(table.orderRoll.order, [id.Yazan, id.Nour]);
  assert.ok(table.players.every((player) => player.resources === null));
});

test("a shared screen rolls for each player straight away", () => {
  let game = service.createGame({ playerNames: ["Nour", "Yazan"] });
  const id = ids(game);
  game = rollAs(game.id, id.Nour, [2, 2], { forPlayerId: id.Yazan });
  game = rollAs(game.id, id.Nour, [1, 2]);
  assert.deepEqual(names(game), ["Yazan", "Nour"]);
});

test("matches saved before the opening roll keep their order and play on", () => {
  let game = service.createGame({ playerNames: ["Nour", "Yazan"] });
  const id = ids(game);
  game = rollAs(game.id, id.Nour, [6, 6]);
  game = rollAs(game.id, id.Yazan, [1, 1]);
  const saved = store.getGame(game.id);
  delete saved.orderRoll;
  store.saveGame(saved);
  game = service.getGameState(game.id);
  assert.equal(game.orderRoll, null);
  assert.equal(game.phase, "setup-placement");
  const vertexId = game.hints.validSetupVertices[0];
  game = service.placeSetup(game.id, {
    playerId: id.Nour,
    vertexId,
    edgeId: game.hints.setupRoadOptionsByVertex[vertexId][0],
  });
  assert.equal(game.players[game.currentPlayerIndex].name, "Yazan");
});

after(() => fs.rmSync(process.env.GAME_DATA_DIR, { recursive: true, force: true }));
