const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.GAME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "syria-traders-test-"));
const store = require("../src/game/gameStore");
const service = require("../src/game/gameService");
const sessions = require("../src/game/sessions");
const config = require("../../shared/gameConfig.json");

const empty = () => ({ wheat: 0, wood: 0, stone: 0, brick: 0, sheep: 0 });
const card = (type, boughtTurn = -1) => ({ id: `${type}-${Math.random()}`, type, boughtTurn });
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
// A three-player match on turn 1 with known hands and development cards.
function match({ hands = [], devCards = [], rolled = true } = {}, game = null) {
  game ||= finishSetup(service.createGame({ playerNames: ["Nour", "Yazan", "Lina"] }));
  const saved = store.getGame(game.id);
  saved.players.forEach((player, index) => {
    for (const [resource, amount] of Object.entries(player.resources))
      saved.bank[resource] += amount;
    player.resources = { ...empty(), ...hands[index] };
    for (const [resource, amount] of Object.entries(player.resources))
      saved.bank[resource] -= amount;
    player.devCards = devCards[index] || [];
  });
  saved.turnHasRolled = rolled;
  saved.mustMoveRobber = false;
  store.saveGame(saved);
  return store.getGame(game.id);
}
const ids = (game) => game.players.map((player) => player.id);
const cost = { wheat: 1, sheep: 1, stone: 1 };

test("the deck holds the standard 25 cards and a card costs wheat, sheep and stone", () => {
  const game = match({ hands: [cost] });
  const deck = store.getGame(game.id).devDeck;
  assert.equal(deck.length, 25);
  const count = (type) => deck.filter((entry) => entry === type).length;
  assert.deepEqual(
    ["knight", "victoryPoint", "roadBuilding", "yearOfPlenty", "monopoly"].map(count),
    [14, 5, 2, 2, 2],
  );
  const view = service.getGameState(game.id);
  assert.deepEqual(view.settings.buildingCosts.development, cost);
  const [nour] = ids(game);
  assert.equal(view.hints.devCards.canBuy, true);
  const bought = service.buyDevelopmentCard(game.id, { playerId: nour });
  assert.equal(bought.devDeckCount, 24);
  assert.equal(bought.players[0].devCardCount, 1);
  assert.deepEqual(bought.players[0].resources, empty());
  assert.equal(bought.bank.wheat, store.getGame(game.id).bank.wheat);
  assert.match(bought.log.at(-1).message, /Nour bought a development card\.$/);
  assert.equal(bought.visuals.kind, "devbuy");
  assert.equal(bought.visuals.card, undefined, "The bought card's type is never announced");
  assert.throws(() => service.buyDevelopmentCard(game.id, { playerId: nour }), /costs 1 Wheat/);
  // A card bought this turn waits until the next turn.
  const type = bought.players[0].devCards[0].type;
  if (type !== "victoryPoint")
    assert.throws(
      () => service.playDevelopmentCard(game.id, { playerId: nour, type, resource: "wood" }),
      /next turn/,
    );
});

test("buying needs a roll first, and only one card is played per turn", () => {
  const game = match({
    hands: [cost],
    devCards: [[card("monopoly"), card("yearOfPlenty")]],
    rolled: false,
  });
  const [nour] = ids(game);
  assert.throws(() => service.buyDevelopmentCard(game.id, { playerId: nour }), /Roll the dice/);
  service.playDevelopmentCard(game.id, { playerId: nour, type: "monopoly", resource: "wood" });
  assert.throws(
    () =>
      service.playDevelopmentCard(game.id, {
        playerId: nour,
        type: "yearOfPlenty",
        resources: ["wood", "wood"],
      }),
    /one development card/,
  );
  assert.throws(
    () => service.playDevelopmentCard(game.id, { playerId: ids(game)[1], type: "knight" }),
    /not this player's turn/,
  );
});

test("a Knight moves the bandit before rolling, and three Knights win the Largest Army", () => {
  const game = match({
    hands: [{}, { wood: 2 }],
    devCards: [[card("knight")], [card("knight"), card("knight"), card("knight"), card("knight")]],
    rolled: false,
  });
  const [nour, yazan] = ids(game);
  let state = service.playDevelopmentCard(game.id, { playerId: nour, type: "knight" });
  assert.equal(state.mustMoveRobber, true);
  assert.equal(state.hints.canRoll, false);
  assert.deepEqual(state.hints.devCards.playable, []);
  assert.throws(() => service.rollDice(game.id, { playerId: nour }), /Move the bandit/);
  const target = state.hints.validRobberTiles[0];
  state = service.moveRobber(game.id, { playerId: nour, tileId: target });
  assert.equal(state.mustMoveRobber, false);
  assert.equal(state.players[0].knightsPlayed, 1);
  state = service.rollDice(game.id, { playerId: nour });
  assert.equal(state.turnHasRolled, true);

  // Yazan plays three Knights over three turns and takes the Largest Army.
  const saved = store.getGame(game.id);
  saved.mustMoveRobber = false;
  saved.turnHasRolled = true;
  store.saveGame(saved);
  const scoreBefore = store.getGame(game.id).players[1].score;
  for (let i = 0; i < 3; i++) {
    const current = store.getGame(game.id);
    current.currentPlayerIndex = 1;
    current.turn += 1;
    current.mustMoveRobber = false;
    store.saveGame(current);
    state = service.playDevelopmentCard(game.id, { playerId: yazan, type: "knight" });
    state = service.moveRobber(game.id, {
      playerId: yazan,
      tileId: state.hints.validRobberTiles[0],
    });
  }
  assert.equal(state.largestArmyId, yazan);
  assert.equal(state.players[1].knightsPlayed, 3);
  assert.equal(state.players[1].score, scoreBefore + 2);
  assert.match(
    state.log.map((entry) => entry.message).join("\n"),
    /Yazan now has the Largest Army/,
  );
});

test("Road Building, Year of Plenty and Monopoly do what they say", () => {
  const game = match({
    hands: [{ wheat: 1 }, { wheat: 3, wood: 1 }, { wheat: 2 }],
    devCards: [[card("roadBuilding"), card("yearOfPlenty"), card("monopoly")]],
    rolled: false,
  });
  const [nour] = ids(game);
  const roads = game.players[0].roads.length;
  // Road Building: two free roads, even before rolling, and no cards spent.
  let state = service.playDevelopmentCard(game.id, { playerId: nour, type: "roadBuilding" });
  assert.equal(state.hints.freeRoads, 2);
  assert.ok(state.hints.validRoadEdges.length > 0);
  state = service.buildRoad(game.id, { playerId: nour, edgeId: state.hints.validRoadEdges[0] });
  state = service.buildRoad(game.id, { playerId: nour, edgeId: state.hints.validRoadEdges[0] });
  assert.equal(state.players[0].roads.length, roads + 2);
  assert.deepEqual(state.players[0].resources, { ...empty(), wheat: 1 });
  assert.equal(state.hints.freeRoads, 0);

  // Next turns: Year of Plenty, then Monopoly.
  const next = () => {
    const saved = store.getGame(game.id);
    saved.turn += 1;
    saved.currentPlayerIndex = 0;
    saved.turnHasRolled = true;
    store.saveGame(saved);
  };
  next();
  assert.throws(
    () =>
      service.playDevelopmentCard(game.id, {
        playerId: nour,
        type: "yearOfPlenty",
        resources: ["stone"],
      }),
    /two resources/,
  );
  state = service.playDevelopmentCard(game.id, {
    playerId: nour,
    type: "yearOfPlenty",
    resources: ["stone", "stone"],
  });
  assert.equal(state.players[0].resources.stone, 2);
  assert.equal(state.visuals.card, "yearOfPlenty");
  next();
  state = service.playDevelopmentCard(game.id, {
    playerId: nour,
    type: "monopoly",
    resource: "wheat",
  });
  assert.equal(state.players[0].resources.wheat, 6);
  assert.equal(state.players[1].resources.wheat, 0);
  assert.equal(state.players[2].resources.wheat, 0);
  assert.equal(state.players[1].resources.wood, 1);
  assert.match(state.log.at(-1).message, /Monopoly on Wheat and collected 5/);
  assert.deepEqual(
    state.visuals.resourceDeltas.map((delta) => delta.amount),
    [3, 2],
  );
});

test("Victory Point cards stay hidden until they win", () => {
  const game = match({
    devCards: [[card("victoryPoint"), card("victoryPoint")]],
  });
  const [nour] = ids(game);
  const saved = store.getGame(game.id);
  saved.players[0].score = config.winPoints - 3;
  saved.players[0].resources = { ...empty(), ...cost };
  saved.devDeck.push("victoryPoint");
  store.saveGame(saved);
  assert.throws(
    () => service.playDevelopmentCard(game.id, { playerId: nour, type: "victoryPoint" }),
    /count by themselves/,
  );
  assert.equal(service.getGameState(game.id).players[0].score, config.winPoints - 3);
  const state = service.buyDevelopmentCard(game.id, { playerId: nour });
  assert.equal(state.winnerId, nour);
  assert.equal(state.players[0].score, config.winPoints);
  assert.equal(state.players[0].revealedVictoryPoints, 3);
  assert.match(state.log.map((entry) => entry.message).join("\n"), /reveals 3 Victory Point/);
});

test("other players and the TV see how many cards you hold, never which", () => {
  const host = sessions.create({ mode: "online", playerNames: ["Nour"] });
  const guest = sessions.join(host.game.id, { name: "Yazan" });
  service.startGame(host.game.id);
  const tv = sessions.watch(host.game.id);
  let game = finishSetup(service.getGameState(host.game.id));
  game = match(
    { hands: [cost], devCards: [[card("monopoly")], [card("knight")]] },
    { ...game, players: game.players },
  );
  service.buyDevelopmentCard(game.id, { playerId: game.players[0].id });
  const viewOf = (token) => {
    const auth = sessions.authenticate(game.id, token);
    return sessions.view(auth.game, auth.session);
  };
  const mine = viewOf(host.token);
  assert.equal(mine.players[0].devCards.length, 2);
  assert.equal(mine.players[1].devCards, null);
  assert.equal(mine.players[1].devCardCount, 1);
  const theirs = viewOf(guest.token);
  assert.equal(theirs.players[0].devCards, null);
  assert.equal(theirs.players[0].devCardCount, 2);
  const table = viewOf(tv.token);
  assert.ok(table.players.every((player) => player.devCards === null));
  assert.equal(table.visuals.kind, "devbuy");
  assert.equal(JSON.stringify(table).includes('devDeck"'), false);
  assert.equal(table.devDeckCount, 24);
});

test("saves from before development cards get a full deck on first use", () => {
  const game = match({ hands: [cost] });
  const saved = store.getGame(game.id);
  delete saved.devDeck;
  delete saved.largestArmyId;
  for (const player of saved.players) {
    delete player.devCards;
    delete player.knightsPlayed;
  }
  store.saveGame(saved);
  const loaded = service.getGameState(game.id);
  assert.equal(loaded.devDeckCount, 25);
  assert.deepEqual(loaded.players[0].devCards, []);
  const state = service.buyDevelopmentCard(game.id, { playerId: loaded.players[0].id });
  assert.equal(state.devDeckCount, 24);
  assert.equal(state.players[0].devCardCount, 1);
});

after(() => {
  if (path.basename(process.env.GAME_DATA_DIR).startsWith("syria-traders-test-"))
    fs.rmSync(process.env.GAME_DATA_DIR, { recursive: true, force: true });
});
