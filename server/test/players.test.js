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
const {
  boardSpec,
  drawRegions,
  generateBoard,
  regionSetProblem,
} = require("../src/game/boardGenerator");
const config = require("../../shared/gameConfig.json");

const SIX = ["Nour", "Yazan", "Lina", "Omar", "Rana", "Sami"];
const EIGHT = [...SIX, "Amal", "Karim"];

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
  assert.throws(() => service.createGame({ playerNames: ["A", "B"], maxPlayers: 9 }), /2 to 8/);
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

test("the 7-8 player map uses only painted tiles: classic Syria plus 25 from Tunisia", () => {
  const spec = boardSpec("xl");
  const names = spec.regions.map((region) => region.name);
  assert.equal(new Set(names).size, 58, "Region names are unique");
  assert.deepEqual(
    names.slice(30),
    config.extraLargeBoard.extraRegions.map((region) => region.name),
  );
  const drawn = drawRegions(spec);
  assert.equal(drawn.length, 44);
  assert.equal(regionSetProblem(drawn.map((region) => region.name), spec), null);
  const productive = drawn.filter((region) => region.resource !== "desert").length;
  assert.equal(spec.numberTokens.length, productive, "One number token per productive region");
  // Every tile on this map has a painting; the large map's flat-art extras sit out.
  const art = (name) => `${name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}.webp`;
  const regionsDir = path.join(__dirname, "../../client/public/terrain/regions");
  const counts = {};
  for (const region of drawn) {
    assert.ok(fs.existsSync(path.join(regionsDir, art(region.name))), `${region.name} is painted`);
    counts[region.resource] = (counts[region.resource] || 0) + 1;
  }
  assert.deepEqual(counts, { wheat: 9, wood: 9, stone: 9, brick: 6, sheep: 8, desert: 3 });
  // Over many matches every Tunisian region gets its turn on the map.
  const seen = new Set();
  for (let i = 0; i < 200; i++) drawRegions(spec).forEach((region) => seen.add(region.name));
  assert.equal(seen.size, 47);
  const isWheat = (name) => spec.regions.find((r) => r.name === name).resource === "wheat";
  const flat = drawn.map((region) => region.name);
  flat[flat.findIndex((name, i) => i >= 19 && isWheat(name))] = "Qamishli";
  assert.match(regionSetProblem(flat, spec), /cannot use Qamishli/);
  // An arrangement must keep the drawn resource mix and every Syrian region.
  const swapped = drawn.map((region) => region.name);
  const spareWood = spec.regions
    .slice(30)
    .find((region) => region.resource === "wood" && !swapped.includes(region.name));
  const wheatIndex = swapped.findIndex(
    (name, i) => i >= 19 && spec.regions.find((r) => r.name === name).resource === "wheat",
  );
  swapped[wheatIndex] = spareWood.name;
  assert.match(regionSetProblem(swapped, spec), /wheat|wood/);
  assert.match(regionSetProblem([...swapped.slice(1), spareWood.name], spec), /fixed|repeats/);
  // The large map's hexes all stay, so the island only grows outward.
  const cells = new Set(spec.boardLayout.map(({ q, r }) => `${q},${r}`));
  assert.ok(boardSpec("large").boardLayout.every(({ q, r }) => cells.has(`${q},${r}`)));
  for (let i = 0; i < 20; i++) {
    const board = generateBoard({ boardSize: "xl" });
    assert.equal(board.tiles.length, 44);
    const harbors = board.seaTiles.filter((sea) => sea.harbor);
    assert.equal(harbors.length, 13);
    const piers = harbors.flatMap((sea) => sea.portVertexIds || []);
    assert.equal(new Set(piers).size, 26, "Every harbor has its own two coastal corners");
    assert.equal(board.tiles[board.robberTileId].resource, "desert");
    const hot = board.tiles.filter((tile) => [6, 8].includes(tile.numberToken));
    for (const a of hot)
      for (const b of hot)
        if (a !== b) assert.ok(!a.edgeIds.some((id) => b.edgeIds.includes(id)), "6/8 touch");
  }
});

test("eight players get distinct colours, the Tunisia map and a snake setup", () => {
  let game = service.createGame({ playerNames: EIGHT, maxPlayers: 8 });
  assert.equal(game.settings.boardSize, "xl");
  assert.equal(game.board.tiles.length, 44);
  assert.equal(new Set(game.players.map((player) => player.color)).size, 8);
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
  assert.deepEqual(order, [...EIGHT, ...[...EIGHT].reverse()]);
  assert.equal(game.phase, "main");
  // Seven players use the same map.
  assert.equal(
    service.createGame({ playerNames: EIGHT.slice(0, 7), maxPlayers: 7 }).settings.boardSize,
    "xl",
  );
});

test("an eight-seat room fills with phones, then turns away a ninth", () => {
  const tv = sessions.create({ mode: "online", tableHost: true, playerNames: [], maxPlayers: 8 });
  for (const name of EIGHT) sessions.join(tv.game.id, { name });
  assert.throws(() => sessions.join(tv.game.id, { name: "Late" }), /full/);
  const started = service.startGame(tv.game.id);
  assert.equal(started.board.tiles.length, 44);
  assert.equal(started.setup.totalSteps, 16);
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
