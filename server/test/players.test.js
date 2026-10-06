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
const { boardSpec, generateBoard } = require("../src/game/boardGenerator");
const config = require("../../shared/gameConfig.json");

const SIX = ["Nour", "Yazan", "Lina", "Omar", "Rana", "Sami"];

test("the large map is a connected 30-territory island with 11 working harbors", () => {
  const spec = boardSpec("large");
  const names = spec.regions.map((region) => region.name);
  assert.equal(new Set(names).size, 30, "Region names are unique");
  const productive = spec.regions.filter((region) => region.resource !== "desert").length;
  assert.equal(spec.numberTokens.length, productive, "One number token per productive region");
  for (let i = 0; i < 20; i++) {
    const board = generateBoard({ boardSize: "large" });
    assert.equal(board.tiles.length, 30);
    assert.equal(board.vertices.length, 80);
    assert.equal(board.edges.length, 109);
    const harbors = board.seaTiles.filter((sea) => sea.harbor);
    assert.equal(harbors.length, 11);
    const piers = harbors.flatMap((sea) => sea.portVertexIds || []);
    assert.equal(new Set(piers).size, 22, "Every harbor has its own two coastal corners");
    assert.equal(board.tiles[board.robberTileId].resource, "desert");
    // Balanced numbers keep 6 and 8 apart on the large map too.
    const hot = board.tiles.filter((tile) => [6, 8].includes(tile.numberToken));
    for (const a of hot)
      for (const b of hot)
        if (a !== b) assert.ok(!a.edgeIds.some((id) => b.edgeIds.includes(id)), "6/8 touch");
  }
});

test("six players get distinct colours, the large map and a snake setup", () => {
  let game = service.createGame({ playerNames: SIX, maxPlayers: 6 });
  assert.equal(game.settings.boardSize, "large");
  assert.equal(game.board.tiles.length, 30);
  assert.equal(new Set(game.players.map((player) => player.color)).size, 6);
  const order = [];
  if (game.phase === "order-roll") game = rollInOrder(game.id);
  while (game.phase === "setup-placement") {
    const player = game.players[game.currentPlayerIndex];
    order.push(player.name);
    const vertexId = game.hints.validSetupVertices[0];
    game = service.placeSetup(game.id, {
      playerId: player.id,
      vertexId,
      edgeId: game.hints.setupRoadOptionsByVertex[vertexId][0],
    });
  }
  assert.deepEqual(order, [...SIX, ...[...SIX].reverse()]);
  assert.equal(game.phase, "main");
  assert.ok(game.players.every((player) => player.villages.length === 2));
});

test("player limits and map choice are validated", () => {
  assert.throws(() => service.createGame({ playerNames: ["A", "B"], maxPlayers: 7 }), /2 to 6/);
  assert.throws(
    () => service.createGame({ playerNames: [...SIX, "Extra"], maxPlayers: 6 }),
    /Maximum player count is 6/,
  );
  assert.throws(
    () => service.createGame({ playerNames: SIX, maxPlayers: 4 }),
    /Maximum player count is 4/,
  );
  // A classic arrangement cannot be sent for the large map, or the reverse.
  const classic = config.regions.map((region) => region.name);
  assert.throws(
    () => service.createGame({ playerNames: SIX, maxPlayers: 6, regionOrder: classic }),
    /30 regions/,
  );
  const large = boardSpec("large").regions.map((region) => region.name);
  assert.throws(
    () => service.createGame({ playerNames: ["A", "B"], regionOrder: large }),
    /19 regions/,
  );
  const custom = service.createGame({
    playerNames: SIX,
    maxPlayers: 6,
    regionOrder: large,
    numberOrder: config.largeBoard.numberTokens,
    harborOrder: config.largeBoard.harborTypes,
  });
  assert.deepEqual(
    custom.board.tiles.map((tile) => tile.region),
    large,
  );
  // Rooms default to four seats on the classic map, as before.
  const room = service.createGame({ mode: "online", playerNames: ["Host"] });
  assert.equal(room.maxPlayers, 4);
  assert.equal(room.settings.boardSize, "standard");
});

test("a six-seat room fills with phones, then turns away a seventh", () => {
  const tv = sessions.create({ mode: "online", tableHost: true, playerNames: [], maxPlayers: 6 });
  for (const name of SIX) sessions.join(tv.game.id, { name });
  assert.throws(() => sessions.join(tv.game.id, { name: "Late" }), /full/);
  const started = service.startGame(tv.game.id);
  assert.equal(started.board.tiles.length, 30);
  assert.equal(started.setup.totalSteps, 12);
});

test("saves from before board sizes still load and play on the classic map", () => {
  const created = service.createGame({ playerNames: ["Nour", "Yazan"] });
  const saved = store.getGame(created.id);
  delete saved.boardSize;
  store.saveGame(saved);
  const state = service.getGameState(created.id);
  assert.equal(state.settings.boardSize, "standard");
  assert.equal(state.settings.regions.length, 19);
  assert.equal(state.board.tiles.length, 19);
});

after(() => {
  if (path.basename(process.env.GAME_DATA_DIR).startsWith("syria-traders-test-"))
    fs.rmSync(process.env.GAME_DATA_DIR, { recursive: true, force: true });
});
