const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const config = require("../../../shared/gameConfig.json");
const store = require("./gameStore");
const { generateBoard } = require("./boardGenerator");
const {
  clone,
  resourceTemplate,
  hasEnoughResources,
  spendResources,
  getResourceTotal,
  randomItem,
} = require("./helpers");
const {
  canPlaceInitialVillage,
  canPlaceRoad,
  canPlaceVillage,
  canUpgradeCity,
  getValidRoadIds,
  getValidVillageIds,
  getValidCityIds,
  getTradeRates,
} = require("./rules");

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeNames(playerNames = []) {
  if (!Array.isArray(playerNames)) throw createError("Player names must be a list.");
  const names = playerNames.map((name) => (typeof name === "string" ? name.trim() : ""));
  if (names.some((name) => !name || name.length > 24))
    throw createError("Names must be 1 to 24 characters.");
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length)
    throw createError("Use a different name for each player.");
  return names;
}

function arraySignature(values) {
  return [...values]
    .map((entry) => String(entry))
    .sort()
    .join("|");
}

function normalizeRegionOrder(regionOrder) {
  if (!regionOrder) {
    return null;
  }
  if (!Array.isArray(regionOrder)) {
    throw createError("regionOrder must be an array of region names.");
  }
  if (regionOrder.length !== config.regions.length) {
    throw createError(`regionOrder must include ${config.regions.length} regions.`);
  }

  const knownNames = new Set(config.regions.map((region) => region.name));
  const usedNames = new Set();

  const normalized = regionOrder.map((name) => String(name || "").trim());
  normalized.forEach((name) => {
    if (!knownNames.has(name)) {
      throw createError(`Unknown region in arrangement: ${name}`);
    }
    if (usedNames.has(name)) {
      throw createError(`Duplicate region in arrangement: ${name}`);
    }
    usedNames.add(name);
  });

  return normalized;
}

function normalizeNumberOrder(numberOrder) {
  if (!numberOrder) {
    return null;
  }
  if (!Array.isArray(numberOrder)) {
    throw createError("numberOrder must be an array.");
  }
  if (numberOrder.length !== config.numberTokens.length) {
    throw createError(`numberOrder must include ${config.numberTokens.length} tokens.`);
  }

  const normalized = numberOrder.map((token) => Number(token));
  if (normalized.some((token) => Number.isNaN(token))) {
    throw createError("numberOrder contains invalid values.");
  }

  if (arraySignature(normalized) !== arraySignature(config.numberTokens)) {
    throw createError("numberOrder must contain the same token values as the default set.");
  }

  return normalized;
}

function normalizeHarborOrder(harborOrder) {
  if (!harborOrder) {
    return null;
  }
  if (!Array.isArray(harborOrder)) {
    throw createError("harborOrder must be an array.");
  }
  if (harborOrder.length !== config.harborTypes.length) {
    throw createError(`harborOrder must include ${config.harborTypes.length} harbor labels.`);
  }

  const normalized = harborOrder.map((value) => String(value || "").trim());
  if (arraySignature(normalized) !== arraySignature(config.harborTypes)) {
    throw createError("harborOrder must contain the same harbor labels as the default set.");
  }

  return normalized;
}

function createPlayer(name, index) {
  return {
    id: uuidv4(),
    name,
    color: config.playerColors[index % config.playerColors.length],
    resources: resourceTemplate(0),
    roads: [],
    villages: [],
    cities: [],
    score: 0,
  };
}

function setVisualFeedback(game, { producingTileIds = [], resourceDeltas = [] } = {}) {
  game.visuals = {
    flashId: uuidv4(),
    at: new Date().toISOString(),
    producingTileIds,
    resourceDeltas,
  };
}

function addLog(game, message, type = "info") {
  game.log.push({
    id: uuidv4(),
    at: new Date().toISOString(),
    type,
    message,
  });

  if (game.log.length > 180) {
    game.log = game.log.slice(-180);
  }
}

function getGameOrThrow(gameId) {
  const game = store.getGame(gameId);
  if (!game) {
    throw createError("Game not found.", 404);
  }
  return game;
}

function getCurrentPlayer(game) {
  return game.players[game.currentPlayerIndex];
}

function getPlayerOrThrow(game, playerId) {
  const player = game.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw createError("Player not found in this game.");
  }
  return player;
}

function setCurrentPlayerById(game, playerId) {
  const nextIndex = game.players.findIndex((player) => player.id === playerId);
  if (nextIndex < 0) {
    throw createError("Setup flow is out of sync.");
  }
  game.currentPlayerIndex = nextIndex;
}

function assertActiveGame(game) {
  if (game.status !== "active") {
    throw createError("The game is not active yet.");
  }
}

function assertMainPhase(game) {
  if (game.phase !== "main") {
    throw createError("Finish setup placement before main actions.");
  }
}

function assertPlayersTurn(game, playerId) {
  const currentPlayer = getCurrentPlayer(game);
  if (!currentPlayer || currentPlayer.id !== playerId) {
    throw createError("It is not this player's turn.");
  }
}

function assertSetupTurn(game, playerId) {
  if (game.phase !== "setup-placement") {
    throw createError("Setup placement phase is not active.");
  }
  const expectedPlayerId = game.setup.order[game.setup.step];
  if (expectedPlayerId !== playerId) {
    throw createError("Wait for your setup turn.");
  }
}

function assertActionPhase(game) {
  if (!game.turnHasRolled) {
    throw createError("Roll the dice before building or trading.");
  }
  if (game.mustMoveRobber) {
    throw createError("Move the bandit first because a 7 was rolled.");
  }
}

function transferFromBank(game, player, resource, amount) {
  const available = game.bank[resource] || 0;
  const transferAmount = Math.min(available, amount);
  if (transferAmount <= 0) {
    return 0;
  }
  game.bank[resource] -= transferAmount;
  player.resources[resource] += transferAmount;
  return transferAmount;
}

function initializeSetupFlow(game) {
  const firstRound = game.players.map((player) => player.id);
  const reverseRound = [...firstRound].reverse();
  const order = [...firstRound, ...reverseRound];
  const placementsByPlayer = {};
  firstRound.forEach((playerId) => {
    placementsByPlayer[playerId] = 0;
  });

  game.setup = {
    order,
    step: 0,
    totalSteps: order.length,
    placementsByPlayer,
  };

  setCurrentPlayerById(game, game.setup.order[0]);
}

function initializeActiveMatch(game) {
  game.board = generateBoard({
    regionOrder: game.regionOrder,
    numberOrder: game.numberOrder,
    harborOrder: game.harborOrder,
  });
  game.bank = clone(config.startingBank);
  game.status = "active";
  game.phase = "setup-placement";
  game.turn = 0;
  game.currentPlayerIndex = 0;
  game.turnHasRolled = false;
  game.lastDiceRoll = null;
  game.lastDicePair = null;
  game.mustMoveRobber = false;
  game.winnerId = null;
  setVisualFeedback(game, { producingTileIds: [], resourceDeltas: [] });

  initializeSetupFlow(game);

  const startingPlayer = getCurrentPlayer(game);
  addLog(
    game,
    "Map arranged. Setup phase begins: each player places two villages and two roads.",
    "setup",
  );
  addLog(
    game,
    `Setup turn 1/${game.setup.totalSteps}: ${startingPlayer.name} places a village and a road.`,
    "setup",
  );
}

function checkWinner(game, player) {
  if (player.score >= config.winPoints) {
    game.status = "finished";
    game.winnerId = player.id;
    addLog(game, `${player.name} reaches ${player.score} points and wins the match!`, "win");
  }
}

function distributeResources(game, diceTotal) {
  const gainByPlayer = new Map();
  const producingTileIds = new Set();
  const claims = [];

  game.board.tiles.forEach((tile) => {
    if (
      tile.numberToken !== diceTotal ||
      tile.id === game.board.robberTileId ||
      tile.resource === "desert"
    ) {
      return;
    }

    tile.vertexIds.forEach((vertexId) => {
      const vertex = game.board.vertices[vertexId];
      if (!vertex.ownerId || !vertex.building) {
        return;
      }

      const owner = game.players.find((player) => player.id === vertex.ownerId);
      if (!owner) {
        return;
      }

      const amount = vertex.building === "city" ? 2 : 1;
      claims.push({ owner, tile, amount });
    });
  });

  // Resolve each resource together; tile iteration order must not favor one player.
  for (const resource of config.resources) {
    const requests = claims.filter((claim) => claim.tile.resource === resource);
    const demand = requests.reduce((total, claim) => total + claim.amount, 0);
    if (demand > game.bank[resource]) {
      addLog(
        game,
        `The bank cannot cover all ${config.resourceLabels[resource]} claims; none is distributed this roll.`,
      );
      continue;
    }
    for (const { owner, tile, amount } of requests) {
      const moved = transferFromBank(game, owner, resource, amount);
      producingTileIds.add(tile.id);
      if (!gainByPlayer.has(owner.id)) gainByPlayer.set(owner.id, resourceTemplate(0));
      gainByPlayer.get(owner.id)[resource] += moved;
    }
  }

  if (!gainByPlayer.size) {
    addLog(game, "No settlements produced resources on this roll.");
    setVisualFeedback(game, { producingTileIds: [], resourceDeltas: [] });
    return;
  }

  const resourceDeltas = [];

  gainByPlayer.forEach((resourceGain, playerId) => {
    const player = game.players.find((entry) => entry.id === playerId);
    const summary = Object.entries(resourceGain)
      .filter(([, amount]) => amount > 0)
      .map(([resource, amount]) => `${amount} ${config.resourceLabels[resource]}`)
      .join(", ");

    addLog(game, `${player.name} receives ${summary}.`);

    Object.entries(resourceGain).forEach(([resource, amount]) => {
      if (amount > 0) {
        resourceDeltas.push({ playerId, resource, amount });
      }
    });
  });

  setVisualFeedback(game, {
    producingTileIds: [...producingTileIds],
    resourceDeltas,
  });
}

function getRobberVictim(game, tileId, robberPlayerId) {
  const tile = game.board.tiles[tileId];
  const adjacentOwners = new Set();

  tile.vertexIds.forEach((vertexId) => {
    const vertex = game.board.vertices[vertexId];
    if (vertex.ownerId && vertex.ownerId !== robberPlayerId) {
      adjacentOwners.add(vertex.ownerId);
    }
  });

  const candidates = [...adjacentOwners]
    .map((ownerId) => game.players.find((player) => player.id === ownerId))
    .filter((player) => player && getResourceTotal(player.resources) > 0);

  return randomItem(candidates);
}

function stealRandomResource(fromPlayer, toPlayer) {
  const availableResources = config.resources.flatMap((resource) =>
    Array(fromPlayer.resources[resource]).fill(resource),
  );
  const chosen = randomItem(availableResources);
  if (!chosen) {
    return null;
  }

  fromPlayer.resources[chosen] -= 1;
  toPlayer.resources[chosen] += 1;
  return chosen;
}

function grantSecondPlacementResources(game, player, vertex) {
  const gained = resourceTemplate(0);
  const resourceDeltas = [];

  vertex.adjacentTiles.forEach((tileId) => {
    const tile = game.board.tiles[tileId];
    if (!tile || tile.resource === "desert") {
      return;
    }
    const moved = transferFromBank(game, player, tile.resource, 1);
    if (moved > 0) {
      gained[tile.resource] += moved;
      resourceDeltas.push({ playerId: player.id, resource: tile.resource, amount: moved });
    }
  });

  const summary = Object.entries(gained)
    .filter(([, amount]) => amount > 0)
    .map(([resource, amount]) => `${amount} ${config.resourceLabels[resource]}`)
    .join(", ");

  if (summary) {
    addLog(
      game,
      `${player.name} gains starting resources from second placement: ${summary}.`,
      "setup",
    );
  }

  return resourceDeltas;
}

function canPlaceSetupRoad(game, vertexId, edgeId) {
  const edge = game.board.edges[edgeId];
  if (!edge || edge.ownerId) {
    return false;
  }
  return edge.v1 === vertexId || edge.v2 === vertexId;
}

function advanceSetupFlow(game) {
  game.setup.step += 1;

  if (game.setup.step >= game.setup.totalSteps) {
    game.phase = "main";
    game.turn = 1;
    game.turnHasRolled = false;
    game.lastDiceRoll = null;
    game.lastDicePair = null;
    game.mustMoveRobber = false;
    game.currentPlayerIndex = 0;
    addLog(game, `Setup complete. ${game.players[0].name} begins turn 1.`, "setup");
    return;
  }

  const nextPlayerId = game.setup.order[game.setup.step];
  setCurrentPlayerById(game, nextPlayerId);
  const nextPlayer = getCurrentPlayer(game);
  addLog(
    game,
    `Setup turn ${game.setup.step + 1}/${game.setup.totalSteps}: ${nextPlayer.name} places a village and a road.`,
    "setup",
  );
}

function buildHints(game) {
  if (game.status !== "active") {
    return null;
  }

  if (game.phase === "setup-placement") {
    const validSetupVertices = game.board.vertices
      .filter((vertex) => canPlaceInitialVillage(game, vertex.id))
      .map((vertex) => vertex.id);

    const setupRoadOptionsByVertex = {};
    validSetupVertices.forEach((vertexId) => {
      setupRoadOptionsByVertex[vertexId] = game.board.vertices[vertexId].adjacentEdges.filter(
        (edgeId) => !game.board.edges[edgeId].ownerId,
      );
    });

    return {
      phase: "setup-placement",
      setup: {
        step: game.setup.step,
        totalSteps: game.setup.totalSteps,
        currentPlayerId: game.setup.order[game.setup.step],
        placementsByPlayer: game.setup.placementsByPlayer,
      },
      validSetupVertices,
      setupRoadOptionsByVertex,
      canRoll: false,
      canEndTurn: false,
      mustMoveRobber: false,
      validRoadEdges: [],
      validVillageVertices: [],
      validCityVertices: [],
      validRobberTiles: [],
    };
  }

  const currentPlayer = getCurrentPlayer(game);
  const actionPhase = game.turnHasRolled && !game.mustMoveRobber;
  const canAffordRoad = hasEnoughResources(currentPlayer.resources, config.buildingCosts.road);
  const canAffordVillage = hasEnoughResources(
    currentPlayer.resources,
    config.buildingCosts.village,
  );
  const canAffordCity = hasEnoughResources(currentPlayer.resources, config.buildingCosts.city);

  return {
    phase: "main",
    canRoll: !game.turnHasRolled && !game.mustMoveRobber && game.status === "active",
    canEndTurn: actionPhase,
    tradeRates: getTradeRates(game, currentPlayer),
    mustMoveRobber: game.mustMoveRobber,
    validRoadEdges: actionPhase && canAffordRoad ? getValidRoadIds(game, currentPlayer) : [],
    validVillageVertices:
      actionPhase && canAffordVillage ? getValidVillageIds(game, currentPlayer) : [],
    validCityVertices: actionPhase && canAffordCity ? getValidCityIds(game, currentPlayer) : [],
    validRobberTiles: game.mustMoveRobber
      ? game.board.tiles
          .filter((tile) => tile.id !== game.board.robberTileId)
          .map((tile) => tile.id)
      : [],
  };
}

function serializeGame(game) {
  const setupSummary =
    game.phase === "setup-placement"
      ? {
          step: game.setup.step,
          totalSteps: game.setup.totalSteps,
          currentPlayerId: game.setup.order[game.setup.step],
          placementsByPlayer: game.setup.placementsByPlayer,
        }
      : {
          completed: true,
          totalSteps: game.setup?.totalSteps || game.players.length * 2,
        };

  return {
    id: game.id,
    mode: game.mode || "local",
    roomCode: game.roomCode,
    hostPlayerId: game.hostPlayerId,
    revision: game.revision || 0,
    serverTime: Date.now(),
    gainEvents: game.gainEvents || [],
    status: game.status,
    phase: game.phase,
    createdAt: game.createdAt,
    maxPlayers: game.maxPlayers,
    turn: game.turn,
    currentPlayerIndex: game.currentPlayerIndex,
    turnHasRolled: game.turnHasRolled,
    lastDiceRoll: game.lastDiceRoll,
    lastDicePair: game.lastDicePair,
    mustMoveRobber: game.mustMoveRobber,
    winnerId: game.winnerId,
    setup: setupSummary,
    settings: {
      title: config.gameTitle,
      winPoints: config.winPoints,
      resources: config.resources,
      resourceLabels: config.resourceLabels,
      bankTradeRate: config.bankTradeRate,
      buildingCosts: config.buildingCosts,
      regions: config.regions,
      boardLayout: config.boardLayout,
      numberTokens: config.numberTokens,
      harborTypes: config.harborTypes,
    },
    players: game.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      resources: player.resources,
      roads: player.roads,
      villages: player.villages,
      cities: player.cities,
      score: player.score,
      resourceTotal: getResourceTotal(player.resources),
    })),
    board: game.board,
    bank: game.bank,
    log: game.log.slice(-100),
    visuals: game.visuals,
    hints: buildHints(game),
  };
}

function createGame({
  playerNames = [],
  maxPlayers = config.maxPlayers,
  regionOrder = null,
  numberOrder = null,
  harborOrder = null,
  mode = "local",
} = {}) {
  const boundedMaxPlayers = Number(maxPlayers);
  if (
    !Number.isInteger(boundedMaxPlayers) ||
    boundedMaxPlayers < config.minPlayers ||
    boundedMaxPlayers > config.maxPlayers
  ) {
    throw createError("Choose a maximum of 2, 3 or 4 players.");
  }
  const names = normalizeNames(playerNames);
  const normalizedOrder = normalizeRegionOrder(regionOrder);
  const normalizedNumberOrder = normalizeNumberOrder(numberOrder);
  const normalizedHarborOrder = normalizeHarborOrder(harborOrder);

  if (names.length < 1) {
    throw createError("Provide at least one player name.");
  }
  if (names.length > boundedMaxPlayers) {
    throw createError(`Maximum player count is ${boundedMaxPlayers}.`);
  }

  const game = {
    id: uuidv4(),
    mode: mode === "online" ? "online" : "local",
    createdAt: new Date().toISOString(),
    maxPlayers: boundedMaxPlayers,
    status: "lobby",
    phase: "lobby",
    players: names.map((name, index) => createPlayer(name, index)),
    board: null,
    bank: clone(config.startingBank),
    turn: 0,
    currentPlayerIndex: 0,
    turnHasRolled: false,
    lastDiceRoll: null,
    lastDicePair: null,
    mustMoveRobber: false,
    winnerId: null,
    log: [],
    setup: null,
    regionOrder: normalizedOrder,
    numberOrder: normalizedNumberOrder,
    harborOrder: normalizedHarborOrder,
    visuals: {
      flashId: uuidv4(),
      at: new Date().toISOString(),
      producingTileIds: [],
      resourceDeltas: [],
    },
  };

  addLog(game, "Game lobby created.");
  if (normalizedOrder) {
    addLog(game, "Custom map arrangement locked in.", "setup");
  }
  if (normalizedNumberOrder) {
    addLog(game, "Custom number-token arrangement locked in.", "setup");
  }
  if (normalizedHarborOrder) {
    addLog(game, "Custom harbor arrangement locked in.", "setup");
  }

  if (game.mode === "local" && game.players.length >= config.minPlayers) {
    initializeActiveMatch(game);
  } else {
    addLog(game, "Waiting for at least 2 players to start.");
  }

  store.saveGame(game);
  return serializeGame(game);
}

function joinGame(gameId, { name }) {
  const game = getGameOrThrow(gameId);
  if (game.status !== "lobby") {
    throw createError("Cannot join: the game already started.");
  }
  if (game.players.length >= game.maxPlayers) {
    throw createError("Game is full.");
  }

  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName || cleanName.length > 24) {
    throw createError("Player name is required to join.");
  }

  if (game.players.some((player) => player.name.toLowerCase() === cleanName.toLowerCase())) {
    throw createError("Choose a different name. This one is already in use.");
  }

  const freeColorIndex = config.playerColors.findIndex(
    (color) => !game.players.some((player) => player.color === color),
  );
  const player = createPlayer(cleanName, freeColorIndex);
  game.players.push(player);
  addLog(game, `${player.name} joined the lobby.`, "setup");

  if (game.mode === "local" && game.players.length >= config.minPlayers) {
    initializeActiveMatch(game);
  }

  store.saveGame(game);
  return serializeGame(game);
}

function getGameState(gameId) {
  return serializeGame(getGameOrThrow(gameId));
}

function startGame(gameId) {
  const game = getGameOrThrow(gameId);
  if (game.phase !== "lobby") throw createError("This match has already started.");
  if (game.players.length < 2) throw createError("At least two players must join first.");
  initializeActiveMatch(game);
  store.saveGame(game);
  return serializeGame(game);
}

function placeSetup(gameId, { playerId, vertexId, edgeId }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  assertSetupTurn(game, playerId);

  const player = getPlayerOrThrow(game, playerId);
  const parsedVertexId = Number(vertexId);
  const parsedEdgeId = Number(edgeId);

  if (!canPlaceInitialVillage(game, parsedVertexId)) {
    throw createError("Illegal setup village placement.");
  }
  if (!canPlaceSetupRoad(game, parsedVertexId, parsedEdgeId)) {
    throw createError("Setup road must connect to the chosen new village.");
  }

  const vertex = game.board.vertices[parsedVertexId];
  vertex.ownerId = player.id;
  vertex.building = "village";
  player.villages.push(parsedVertexId);
  player.score += 1;

  const edge = game.board.edges[parsedEdgeId];
  edge.ownerId = player.id;
  player.roads.push(parsedEdgeId);

  game.setup.placementsByPlayer[player.id] += 1;

  const nearbyRegion = game.board.tiles[vertex.adjacentTiles[0]]?.region || "the map";
  addLog(
    game,
    `${player.name} placed a setup village near ${nearbyRegion} and connected a road.`,
    "setup",
  );

  let setupResourceDeltas = [];
  if (game.setup.placementsByPlayer[player.id] === 2) {
    setupResourceDeltas = grantSecondPlacementResources(game, player, vertex);
  }

  setVisualFeedback(game, {
    producingTileIds: [],
    resourceDeltas: setupResourceDeltas,
  });

  advanceSetupFlow(game);

  store.saveGame(game);
  return serializeGame(game);
}

function rollDice(gameId, { playerId }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  assertMainPhase(game);
  if (game.status === "finished") {
    throw createError("Game is already finished.");
  }
  assertPlayersTurn(game, playerId);

  if (game.turnHasRolled) {
    throw createError("Dice already rolled this turn.");
  }

  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const total = d1 + d2;

  game.lastDiceRoll = total;
  game.lastDicePair = [d1, d2];
  game.turnHasRolled = true;

  const currentPlayer = getCurrentPlayer(game);
  addLog(game, `${currentPlayer.name} rolled ${d1} + ${d2} = ${total}.`);

  if (total === 7) {
    // Automatic, card-weighted discards keep casual rooms moving.
    for (const player of game.players) {
      const count = getResourceTotal(player.resources);
      if (count <= 7) continue;
      const discard = Math.floor(count / 2);
      for (let i = 0; i < discard; i += 1) {
        const cards = config.resources.flatMap((resource) =>
          Array(player.resources[resource]).fill(resource),
        );
        const resource = randomItem(cards);
        player.resources[resource] -= 1;
        game.bank[resource] += 1;
      }
      addLog(
        game,
        `${player.name} returned ${discard} random cards to the bank (hand over seven).`,
      );
    }
    game.mustMoveRobber = true;
    addLog(game, "The bandit awakens. Move it to a new region.");
    setVisualFeedback(game, { producingTileIds: [], resourceDeltas: [] });
  } else {
    distributeResources(game, total);
  }

  store.saveGame(game);
  return serializeGame(game);
}

function buildRoad(gameId, { playerId, edgeId }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  assertMainPhase(game);
  assertPlayersTurn(game, playerId);
  assertActionPhase(game);

  const player = getPlayerOrThrow(game, playerId);
  const cost = config.buildingCosts.road;

  if (!hasEnoughResources(player.resources, cost)) {
    throw createError("Not enough resources to build a road.");
  }
  if (!canPlaceRoad(game, player, Number(edgeId))) {
    throw createError("Illegal road placement.");
  }

  spendResources(player.resources, game.bank, cost);
  game.board.edges[Number(edgeId)].ownerId = player.id;
  player.roads.push(Number(edgeId));

  addLog(game, `${player.name} built a road.`);
  store.saveGame(game);
  return serializeGame(game);
}

function buildVillage(gameId, { playerId, vertexId }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  assertMainPhase(game);
  assertPlayersTurn(game, playerId);
  assertActionPhase(game);

  const player = getPlayerOrThrow(game, playerId);
  const cost = config.buildingCosts.village;

  if (!hasEnoughResources(player.resources, cost)) {
    throw createError("Not enough resources to build a village.");
  }
  if (!canPlaceVillage(game, player, Number(vertexId))) {
    throw createError("Illegal village placement.");
  }

  spendResources(player.resources, game.bank, cost);
  const vertex = game.board.vertices[Number(vertexId)];
  vertex.ownerId = player.id;
  vertex.building = "village";
  player.villages.push(Number(vertexId));
  player.score += 1;

  const nearbyRegion = game.board.tiles[vertex.adjacentTiles[0]]?.region || "the map";
  addLog(game, `${player.name} founded a village near ${nearbyRegion}.`);

  checkWinner(game, player);
  store.saveGame(game);
  return serializeGame(game);
}

function upgradeCity(gameId, { playerId, vertexId }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  assertMainPhase(game);
  assertPlayersTurn(game, playerId);
  assertActionPhase(game);

  const player = getPlayerOrThrow(game, playerId);
  const cost = config.buildingCosts.city;

  if (!hasEnoughResources(player.resources, cost)) {
    throw createError("Not enough resources to upgrade to a city.");
  }
  if (!canUpgradeCity(game, player, Number(vertexId))) {
    throw createError("Choose one of your villages to upgrade.");
  }

  spendResources(player.resources, game.bank, cost);
  const vertex = game.board.vertices[Number(vertexId)];
  vertex.building = "city";

  player.villages = player.villages.filter((id) => id !== Number(vertexId));
  player.cities.push(Number(vertexId));
  player.score += 1;

  addLog(game, `${player.name} upgraded a village into a city.`);
  checkWinner(game, player);

  store.saveGame(game);
  return serializeGame(game);
}

function tradeWithBank(gameId, { playerId, giveResource, getResource }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  assertMainPhase(game);
  assertPlayersTurn(game, playerId);
  assertActionPhase(game);

  if (!config.resources.includes(giveResource) || !config.resources.includes(getResource)) {
    throw createError("Invalid trade resources.");
  }
  if (giveResource === getResource) {
    throw createError("Trade resources must be different.");
  }

  const player = getPlayerOrThrow(game, playerId);
  const giveAmount = getTradeRates(game, player)[giveResource];
  if ((player.resources[giveResource] || 0) < giveAmount) {
    throw createError(`Need ${giveAmount} ${config.resourceLabels[giveResource]} for bank trade.`);
  }
  if ((game.bank[getResource] || 0) < 1) {
    throw createError(`Bank is out of ${config.resourceLabels[getResource]}.`);
  }

  player.resources[giveResource] -= giveAmount;
  game.bank[giveResource] += giveAmount;

  player.resources[getResource] += 1;
  game.bank[getResource] -= 1;

  addLog(
    game,
    `${player.name} traded ${giveAmount} ${config.resourceLabels[giveResource]} for 1 ${config.resourceLabels[getResource]}.`,
  );

  store.saveGame(game);
  return serializeGame(game);
}

function moveRobber(gameId, { playerId, tileId }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  assertMainPhase(game);
  assertPlayersTurn(game, playerId);

  if (!game.turnHasRolled || !game.mustMoveRobber) {
    throw createError("The bandit can only move after rolling a 7.");
  }

  const nextTileId = Number(tileId);
  const tile = game.board.tiles[nextTileId];
  if (!tile) {
    throw createError("Invalid tile for robber movement.");
  }
  if (nextTileId === game.board.robberTileId) {
    throw createError("Choose a different tile.");
  }

  game.board.robberTileId = nextTileId;
  game.mustMoveRobber = false;

  const robberPlayer = getPlayerOrThrow(game, playerId);
  addLog(game, `${robberPlayer.name} moved the bandit to ${tile.region}.`);

  const victim = getRobberVictim(game, nextTileId, playerId);
  if (victim) {
    const stolenResource = stealRandomResource(victim, robberPlayer);
    if (stolenResource) {
      addLog(game, `${robberPlayer.name} stole one card from ${victim.name}.`);
    }
  } else {
    addLog(game, "No resources could be stolen from adjacent opponents.");
  }

  store.saveGame(game);
  return serializeGame(game);
}

function endTurn(gameId, { playerId }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  assertMainPhase(game);
  assertPlayersTurn(game, playerId);

  if (!game.turnHasRolled) {
    throw createError("Roll the dice before ending your turn.");
  }
  if (game.mustMoveRobber) {
    throw createError("Move the bandit before ending your turn.");
  }
  if (game.status === "finished") {
    throw createError("Game already finished.");
  }

  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  game.turn += 1;
  game.turnHasRolled = false;
  game.lastDiceRoll = null;
  game.lastDicePair = null;

  const nextPlayer = getCurrentPlayer(game);
  addLog(game, `Turn ${game.turn}: ${nextPlayer.name}'s turn starts.`);

  store.saveGame(game);
  return serializeGame(game);
}

function getSampleMatchData() {
  const samplePath = path.join(__dirname, "../../mock/sample-match.json");
  return JSON.parse(fs.readFileSync(samplePath, "utf8"));
}

module.exports = {
  startGame,
  createGame,
  joinGame,
  getGameState,
  placeSetup,
  rollDice,
  buildRoad,
  buildVillage,
  upgradeCity,
  tradeWithBank,
  moveRobber,
  endTurn,
  getSampleMatchData,
};
