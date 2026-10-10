const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const config = require("../../../shared/gameConfig.json");
const store = require("./gameStore");
const { boardSpec, boardSizeFor, generateBoard } = require("./boardGenerator");
const {
  clone,
  resourceTemplate,
  hasEnoughResources,
  spendResources,
  getResourceTotal,
  randomItem,
  shuffle,
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
  longestRoadLength,
} = require("./rules");
const stats = require("./stats");

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

function normalizeRegionOrder(regionOrder, spec) {
  if (!regionOrder) {
    return null;
  }
  if (!Array.isArray(regionOrder)) {
    throw createError("regionOrder must be an array of region names.");
  }
  if (regionOrder.length !== spec.regions.length) {
    throw createError(`regionOrder must include ${spec.regions.length} regions.`);
  }

  const knownNames = new Set(spec.regions.map((region) => region.name));
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

function normalizeNumberOrder(numberOrder, spec) {
  if (!numberOrder) {
    return null;
  }
  if (!Array.isArray(numberOrder)) {
    throw createError("numberOrder must be an array.");
  }
  if (numberOrder.length !== spec.numberTokens.length) {
    throw createError(`numberOrder must include ${spec.numberTokens.length} tokens.`);
  }

  const normalized = numberOrder.map((token) => Number(token));
  if (normalized.some((token) => Number.isNaN(token))) {
    throw createError("numberOrder contains invalid values.");
  }

  if (arraySignature(normalized) !== arraySignature(spec.numberTokens)) {
    throw createError("numberOrder must contain the same token values as the default set.");
  }

  return normalized;
}

function normalizeHarborOrder(harborOrder, spec) {
  if (!harborOrder) {
    return null;
  }
  if (!Array.isArray(harborOrder)) {
    throw createError("harborOrder must be an array.");
  }
  if (harborOrder.length !== spec.harborTypes.length) {
    throw createError(`harborOrder must include ${spec.harborTypes.length} harbor labels.`);
  }

  const normalized = harborOrder.map((value) => String(value || "").trim());
  if (arraySignature(normalized) !== arraySignature(spec.harborTypes)) {
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

// Short-lived animation cues. kind: roll, seven, setup, trade, devbuy or devplay.
// Each delta names where its cards came from: tileIds for production,
// fromPlayerId for trades. Development-card cues name the player and, once a card
// is played (and so public), its type; a bought card's type is never included.
function setVisualFeedback(
  game,
  { producingTileIds = [], resourceDeltas = [], kind = "none", playerId, card, fromPlayerId } = {},
) {
  game.visuals = {
    flashId: uuidv4(),
    at: new Date().toISOString(),
    kind,
    producingTileIds,
    resourceDeltas,
    ...(playerId ? { playerId } : {}),
    ...(card ? { card } : {}),
    ...(fromPlayerId ? { fromPlayerId } : {}),
  };
}

// Development cards. The deck lives only on the server; players see their own
// cards, and everyone else sees how many each player holds.
const DEV_TYPES = Object.keys(config.developmentCards);
const devLabel = (type) => config.developmentCardLabels[type] || type;
function newDevDeck() {
  return shuffle(DEV_TYPES.flatMap((type) => Array(config.developmentCards[type]).fill(type)));
}
// Saves from before development cards get a full deck and empty hands on first use.
function devState(game) {
  if (!Array.isArray(game.devDeck)) game.devDeck = newDevDeck();
  for (const player of game.players) {
    if (!Array.isArray(player.devCards)) player.devCards = [];
    player.knightsPlayed ||= 0;
  }
  return game;
}
const hiddenPoints = (player) =>
  (player.devCards || []).filter((card) => card.type === "victoryPoint").length;

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
    boardSize: game.boardSize,
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
  game.trade = null;
  game.mustMoveRobber = false;
  game.winnerId = null;
  game.devDeck = newDevDeck();
  game.largestArmyId = null;
  game.longestRoadId = null;
  game.wishes = [];
  game.stats = { dice: {}, players: {} };
  game.freeRoads = null;
  game.devCardPlayedTurn = null;
  for (const player of game.players) {
    player.devCards = [];
    player.knightsPlayed = 0;
  }
  setVisualFeedback(game, { producingTileIds: [], resourceDeltas: [] });

  // Everyone rolls first; the highest roll places first and takes turn 1.
  game.phase = "order-roll";
  game.orderRoll = {
    groups: [game.players.map((player) => player.id)],
    rolls: {},
    since: new Date().toISOString(),
  };
  addLog(game, "Map arranged. Everyone rolls the dice: the highest roll goes first.", "setup");
}

// After this, any player may roll for someone who hasn't yet (asleep phone, gone for tea).
const ORDER_ROLL_WAIT_MS = Number(process.env.ORDER_ROLL_WAIT_MS || 30000);
const orderTotal = (pair) => pair[0] + pair[1];
// Players still to roll: everyone in a group that is still tied, who hasn't rolled this round.
function orderRollWaiting(game) {
  const { groups = [], rolls = {} } = game.orderRoll || {};
  return groups
    .filter((group) => group.length > 1)
    .flatMap((group) => group.filter((id) => !rolls[id]));
}

function rollForOrder(gameId, { playerId, forPlayerId }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  if (game.phase !== "order-roll") throw createError("The turn order is already decided.");
  const actor = getPlayerOrThrow(game, playerId);
  const target = getPlayerOrThrow(game, forPlayerId || playerId);
  if (!orderRollWaiting(game).includes(target.id)) {
    throw createError(`${target.name} has already rolled.`);
  }
  // A shared screen rolls for each player in turn; on phones everyone rolls for themselves.
  if (game.mode === "online" && target.id !== actor.id) {
    if (Date.now() - Date.parse(game.orderRoll.since) < ORDER_ROLL_WAIT_MS) {
      throw createError(`Give ${target.name} a moment to roll.`);
    }
  }

  const pair = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
  game.orderRoll.rolls[target.id] = pair;
  game.orderRoll.last = { playerId: target.id, pair };
  game.lastDicePair = pair;
  game.lastDiceRoll = orderTotal(pair);
  const helper =
    game.mode === "online" && target.id !== actor.id ? ` (rolled by ${actor.name})` : "";
  addLog(
    game,
    `${target.name} rolls ${pair[0]} + ${pair[1]} = ${orderTotal(pair)}${helper}.`,
    "setup",
  );
  setVisualFeedback(game, { kind: "order-roll", playerId: target.id });

  // Once a tied group has all rolled, split it by total; equal totals roll again.
  const groups = [];
  for (const group of game.orderRoll.groups) {
    if (group.length < 2 || group.some((id) => !game.orderRoll.rolls[id])) {
      groups.push(group);
      continue;
    }
    const totalOf = Object.fromEntries(
      group.map((id) => [id, orderTotal(game.orderRoll.rolls[id])]),
    );
    const totals = [...new Set(Object.values(totalOf))].sort((a, b) => b - a);
    for (const total of totals) {
      const tied = group.filter((id) => totalOf[id] === total);
      groups.push(tied);
      if (tied.length > 1) {
        const names = tied.map((id) => getPlayerOrThrow(game, id).name);
        addLog(game, `${names.join(" and ")} tie on ${total} and roll again.`, "setup");
        tied.forEach((id) => delete game.orderRoll.rolls[id]);
        game.orderRoll.since = new Date().toISOString();
      }
    }
  }
  game.orderRoll.groups = groups;

  if (groups.every((group) => group.length === 1)) {
    const order = groups.flat();
    game.players = order.map((id) => getPlayerOrThrow(game, id));
    game.orderRoll.order = order;
    const names = game.players.map((player) => player.name).join(", ");
    addLog(game, `Turn order: ${names}. Each places two villages and two roads.`, "setup");
    beginSetup(game);
  }

  store.saveGame(game);
  return serializeGame(game);
}

function beginSetup(game) {
  game.phase = "setup-placement";
  initializeSetupFlow(game);
  const startingPlayer = getCurrentPlayer(game);
  addLog(
    game,
    `Setup turn 1/${game.setup.totalSteps}: ${startingPlayer.name} places a village and a road.`,
    "setup",
  );
}

// Victory Point cards stay hidden until they win the game.
function checkWinner(game, player) {
  const hidden = hiddenPoints(player);
  if (player.score + hidden >= config.winPoints) {
    if (hidden) {
      player.score += hidden;
      player.devCards = player.devCards.filter((card) => card.type !== "victoryPoint");
      player.revealedVictoryPoints = hidden;
      addLog(
        game,
        `${player.name} reveals ${hidden} Victory Point card${hidden === 1 ? "" : "s"}.`,
        "win",
      );
    }
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
      if (!gainByPlayer.has(owner.id))
        gainByPlayer.set(owner.id, { gain: resourceTemplate(0), tiles: {} });
      const entry = gainByPlayer.get(owner.id);
      entry.gain[resource] += moved;
      stats.count(game, owner.id, "diceCards", moved);
      entry.tiles[resource] = [...new Set([...(entry.tiles[resource] || []), tile.id])];
    }
  }

  if (!gainByPlayer.size) {
    addLog(game, "No settlements produced resources on this roll.");
    setVisualFeedback(game, { producingTileIds: [], resourceDeltas: [], kind: "roll" });
    return;
  }

  const resourceDeltas = [];

  const names = [];
  gainByPlayer.forEach(({ gain, tiles }, playerId) => {
    names.push(game.players.find((entry) => entry.id === playerId).name);
    Object.entries(gain).forEach(([resource, amount]) => {
      if (amount > 0) {
        resourceDeltas.push({ playerId, resource, amount, tileIds: tiles[resource] });
      }
    });
  });
  // Amounts appear only as a brief animation; the lasting log keeps who was paid.
  addLog(game, `Resources paid out to ${names.join(" and ")}.`);

  setVisualFeedback(game, {
    producingTileIds: [...producingTileIds],
    resourceDeltas,
    kind: "roll",
  });
}

// Opponents with a village or city on the tile who hold at least one card.
function getRobberVictims(game, tileId, robberPlayerId) {
  const tile = game.board.tiles[tileId];
  const adjacentOwners = new Set();

  tile.vertexIds.forEach((vertexId) => {
    const vertex = game.board.vertices[vertexId];
    if (vertex.ownerId && vertex.ownerId !== robberPlayerId) {
      adjacentOwners.add(vertex.ownerId);
    }
  });

  return game.players.filter(
    (player) => adjacentOwners.has(player.id) && getResourceTotal(player.resources) > 0,
  );
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
  const resourceDeltas = [];

  vertex.adjacentTiles.forEach((tileId) => {
    const tile = game.board.tiles[tileId];
    if (!tile || tile.resource === "desert") {
      return;
    }
    const moved = transferFromBank(game, player, tile.resource, 1);
    if (moved > 0) {
      resourceDeltas.push({
        playerId: player.id,
        resource: tile.resource,
        amount: moved,
        tileIds: [tile.id],
      });
    }
  });

  if (resourceDeltas.length) {
    addLog(game, `${player.name} gains starting resources from their second village.`, "setup");
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

  if (game.phase === "order-roll") {
    return {
      phase: "order-roll",
      canRoll: false,
      canEndTurn: false,
      mustMoveRobber: false,
      validSetupVertices: [],
      setupRoadOptionsByVertex: {},
      validRoadEdges: [],
      validVillageVertices: [],
      validCityVertices: [],
      validRobberTiles: [],
    };
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
  // Road Building lets the player place free roads, even before rolling.
  const freeRoads =
    game.freeRoads?.playerId === currentPlayer.id && !game.mustMoveRobber
      ? game.freeRoads.count
      : 0;
  const cards = currentPlayer.devCards || [];
  const canPlayCard =
    game.status === "active" && !game.mustMoveRobber && game.devCardPlayedTurn !== game.turn;
  const playable = canPlayCard
    ? [
        ...new Set(
          cards
            .filter((card) => card.type !== "victoryPoint" && card.boughtTurn !== game.turn)
            .map((card) => card.type),
        ),
      ]
    : [];
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
    validRoadEdges:
      freeRoads || (actionPhase && canAffordRoad) ? getValidRoadIds(game, currentPlayer) : [],
    freeRoads,
    devCards: {
      canBuy:
        actionPhase &&
        (game.devDeck?.length ?? 1) > 0 &&
        hasEnoughResources(currentPlayer.resources, config.buildingCosts.development),
      playable,
    },
    validVillageVertices:
      actionPhase && canAffordVillage ? getValidVillageIds(game, currentPlayer) : [],
    validCityVertices: actionPhase && canAffordCity ? getValidCityIds(game, currentPlayer) : [],
    validRobberTiles:
      game.mustMoveRobber && !waitingDiscards(game).length
        ? game.board.tiles
            .filter((tile) => tile.id !== game.board.robberTileId)
            .map((tile) => tile.id)
        : [],
    // Who the bandit can steal from on each tile; the roller picks one.
    robberVictimsByTile:
      game.mustMoveRobber && !waitingDiscards(game).length
        ? Object.fromEntries(
            game.board.tiles
              .filter((tile) => tile.id !== game.board.robberTileId)
              .map((tile) => [tile.id, getRobberVictims(game, tile.id, currentPlayer.id)])
              .filter(([, victims]) => victims.length)
              .map(([id, victims]) => [id, victims.map((player) => player.id)]),
          )
        : {},
  };
}

function serializeGame(game) {
  const spec = boardSpec(game.boardSize);
  const roadLengths = game.board
    ? Object.fromEntries(
        game.players.map((player) => [player.id, longestRoadLength(game, player.id)]),
      )
    : {};
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
    // Public: how many cards each player still owes after a seven, never which.
    pendingDiscards: game.pendingDiscards || {},
    discardsSince: game.discardsSince || null,
    // The opening rolls are public: everyone watches who goes first.
    orderRoll:
      game.phase === "order-roll"
        ? { ...game.orderRoll, waiting: orderRollWaiting(game) }
        : game.orderRoll?.order
          ? { order: game.orderRoll.order, last: game.orderRoll.last }
          : null,
    winnerId: game.winnerId,
    setup: setupSummary,
    settings: {
      title: config.gameTitle,
      winPoints: config.winPoints,
      resources: config.resources,
      resourceLabels: config.resourceLabels,
      bankTradeRate: config.bankTradeRate,
      buildingCosts: config.buildingCosts,
      developmentCards: config.developmentCards,
      developmentCardLabels: config.developmentCardLabels,
      largestArmy: config.largestArmy,
      longestRoad: config.longestRoad,
      reactions: config.reactions,
      boardSize: spec.size,
      regions: spec.regions,
      boardLayout: spec.boardLayout,
      numberTokens: spec.numberTokens,
      harborTypes: spec.harborTypes,
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
      // Hidden from other players by sessions.view; only the count is public.
      devCards: player.devCards || [],
      devCardCount: (player.devCards || []).length,
      knightsPlayed: player.knightsPlayed || 0,
      longestRoad: roadLengths[player.id] || 0,
      ...(player.revealedVictoryPoints
        ? { revealedVictoryPoints: player.revealedVictoryPoints }
        : {}),
    })),
    devDeckCount: Array.isArray(game.devDeck)
      ? game.devDeck.length
      : Object.values(config.developmentCards).reduce((sum, count) => sum + count, 0),
    largestArmyId: game.largestArmyId || null,
    longestRoadId: game.longestRoadId || null,
    // Open "anyone have...?" requests from players waiting for their turn.
    wishes: game.status === "active" && game.phase === "main" ? game.wishes || [] : [],
    // End-of-match awards and the dice chart, once there is a winner.
    summary: game.winnerId ? stats.awards(game, roadLengths) : null,
    board: game.board,
    bank: game.bank,
    log: game.log.slice(-100),
    visuals: game.visuals,
    // Open trade requests are public; older saves have none.
    trade: game.status === "active" && game.phase === "main" ? game.trade || null : null,
    hints: buildHints(game),
  };
}

function createGame({
  playerNames = [],
  maxPlayers = 4,
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
    throw createError(`Choose a maximum of ${config.minPlayers} to ${config.maxPlayers} players.`);
  }
  const names = normalizeNames(playerNames);
  // Five and six players need the larger map.
  const spec = boardSpec(boardSizeFor(boundedMaxPlayers));
  const normalizedOrder = normalizeRegionOrder(regionOrder, spec);
  const normalizedNumberOrder = normalizeNumberOrder(numberOrder, spec);
  const normalizedHarborOrder = normalizeHarborOrder(harborOrder, spec);

  // A network room hosted by a table screen starts with no seats.
  if (names.length < 1 && mode !== "online") {
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
    boardSize: spec.size,
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
  updateLongestRoad(game);

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
    producingTileIds: setupResourceDeltas.flatMap((delta) => delta.tileIds),
    resourceDeltas: setupResourceDeltas,
    kind: "setup",
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
  if (game.mustMoveRobber) {
    throw createError("Move the bandit before rolling.");
  }

  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const total = d1 + d2;

  game.lastDiceRoll = total;
  game.lastDicePair = [d1, d2];
  game.turnHasRolled = true;

  const currentPlayer = getCurrentPlayer(game);
  addLog(game, `${currentPlayer.name} rolled ${d1} + ${d2} = ${total}.`);
  stats.countRoll(game, total);
  if (total === 7) stats.count(game, currentPlayer.id, "sevens");

  if (total === 7) {
    // Everyone holding more than seven cards chooses half of them to return,
    // on their own phone. The bandit waits until they all have.
    game.pendingDiscards = {};
    for (const player of game.players) {
      const count = getResourceTotal(player.resources);
      if (count <= 7) continue;
      const owed = Math.floor(count / 2);
      game.pendingDiscards[player.id] = owed;
      addLog(game, `${player.name} must return ${owed} cards to the bank (hand over seven).`);
    }
    game.discardsSince = Object.keys(game.pendingDiscards).length ? new Date().toISOString() : null;
    game.mustMoveRobber = true;
    addLog(game, "The bandit awakens. Move it to a new region.");
    setVisualFeedback(game, { producingTileIds: [], resourceDeltas: [], kind: "seven" });
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
  const free = game.freeRoads?.playerId === playerId && game.freeRoads.count > 0;
  if (free && game.mustMoveRobber) throw createError("Move the bandit first.");
  if (!free) assertActionPhase(game);

  const player = getPlayerOrThrow(game, playerId);
  const cost = config.buildingCosts.road;

  if (!free && !hasEnoughResources(player.resources, cost)) {
    throw createError("Not enough resources to build a road.");
  }
  if (!canPlaceRoad(game, player, Number(edgeId))) {
    throw createError("Illegal road placement.");
  }

  if (free) {
    game.freeRoads.count -= 1;
    if (!game.freeRoads.count) game.freeRoads = null;
  } else spendResources(player.resources, game.bank, cost);
  game.board.edges[Number(edgeId)].ownerId = player.id;
  player.roads.push(Number(edgeId));
  if (game.freeRoads && !getValidRoadIds(game, player).length) game.freeRoads = null;

  addLog(game, `${player.name} built a ${free ? "free " : ""}road.`);
  updateLongestRoad(game);
  checkWinner(game, player);
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
  updateLongestRoad(game);

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
  stats.count(game, player.id, "bankTrades");

  addLog(
    game,
    `${player.name} traded ${giveAmount} ${config.resourceLabels[giveResource]} for 1 ${config.resourceLabels[getResource]}.`,
  );

  store.saveGame(game);
  return serializeGame(game);
}

// Player-to-player trades: the active player asks for cards, others offer,
// and the active player accepts one offer. Offers are public, like at a real table.
const MAX_TRADE_CARDS = 4;
function tradeAmount(resource, amount) {
  if (!config.resources.includes(resource)) throw createError("Choose a resource to trade.");
  const count = Number(amount);
  if (!Number.isInteger(count) || count < 1 || count > MAX_TRADE_CARDS)
    throw createError(`Trade between 1 and ${MAX_TRADE_CARDS} cards.`);
  return count;
}
const cards = (amount, resource) => `${amount} ${config.resourceLabels[resource]}`;
function openTrade(game, requestId) {
  if (!game.trade || (requestId !== undefined && game.trade.id !== requestId))
    throw createError("That trade request has closed.", 409);
  return game.trade;
}

function requestTrade(gameId, { playerId, resource, amount }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  assertMainPhase(game);
  assertPlayersTurn(game, playerId);
  assertActionPhase(game);
  const count = tradeAmount(resource, amount);
  const player = getPlayerOrThrow(game, playerId);
  game.trade = { id: uuidv4(), playerId, want: { resource, amount: count }, offers: [] };
  addLog(game, `${player.name} asks the table for ${cards(count, resource)}.`, "trade");
  store.saveGame(game);
  return serializeGame(game);
}

function offerTrade(gameId, { playerId, requestId, resource, amount }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  assertMainPhase(game);
  const trade = openTrade(game, requestId);
  if (trade.playerId === playerId) throw createError("Wait for other players to make offers.");
  const player = getPlayerOrThrow(game, playerId);
  const count = tradeAmount(resource, amount);
  if (resource === trade.want.resource)
    throw createError("Ask for a different resource than the one you give.");
  if ((player.resources[trade.want.resource] || 0) < trade.want.amount)
    throw createError(`You need ${cards(trade.want.amount, trade.want.resource)} to offer.`);
  trade.offers = trade.offers.filter((offer) => offer.playerId !== playerId);
  trade.offers.push({ id: uuidv4(), playerId, ask: { resource, amount: count } });
  addLog(
    game,
    `${player.name} offers ${cards(trade.want.amount, trade.want.resource)} for ${cards(count, resource)}.`,
    "trade",
  );
  store.saveGame(game);
  return serializeGame(game);
}

function withdrawTradeOffer(gameId, { playerId, requestId }) {
  const game = getGameOrThrow(gameId);
  const trade = openTrade(game, requestId);
  if (!trade.offers.some((offer) => offer.playerId === playerId))
    throw createError("You have no offer on this request.");
  trade.offers = trade.offers.filter((offer) => offer.playerId !== playerId);
  addLog(game, `${getPlayerOrThrow(game, playerId).name} withdrew their offer.`, "trade");
  store.saveGame(game);
  return serializeGame(game);
}

function declineTradeOffer(gameId, { playerId, offerId }) {
  const game = getGameOrThrow(gameId);
  assertPlayersTurn(game, playerId);
  const trade = openTrade(game);
  const offer = trade.offers.find((entry) => entry.id === offerId);
  if (!offer) throw createError("That offer was withdrawn.", 409);
  trade.offers = trade.offers.filter((entry) => entry.id !== offerId);
  addLog(
    game,
    `${getPlayerOrThrow(game, playerId).name} declined ${getPlayerOrThrow(game, offer.playerId).name}'s offer.`,
    "trade",
  );
  store.saveGame(game);
  return serializeGame(game);
}

function cancelTrade(gameId, { playerId }) {
  const game = getGameOrThrow(gameId);
  assertPlayersTurn(game, playerId);
  openTrade(game);
  game.trade = null;
  addLog(game, `${getPlayerOrThrow(game, playerId).name} closed the trade request.`, "trade");
  store.saveGame(game);
  return serializeGame(game);
}

function acceptTradeOffer(gameId, { playerId, offerId }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  assertMainPhase(game);
  assertPlayersTurn(game, playerId);
  assertActionPhase(game);
  const trade = openTrade(game);
  const offer = trade.offers.find((entry) => entry.id === offerId);
  if (!offer) throw createError("That offer was withdrawn.", 409);
  const player = getPlayerOrThrow(game, playerId);
  const partner = getPlayerOrThrow(game, offer.playerId);
  const { want } = trade;
  const { ask } = offer;
  if ((player.resources[ask.resource] || 0) < ask.amount)
    throw createError(`You need ${cards(ask.amount, ask.resource)} to accept this offer.`);
  if ((partner.resources[want.resource] || 0) < want.amount)
    throw createError(`${partner.name} no longer has ${cards(want.amount, want.resource)}.`);
  player.resources[ask.resource] -= ask.amount;
  partner.resources[ask.resource] += ask.amount;
  partner.resources[want.resource] -= want.amount;
  player.resources[want.resource] += want.amount;
  game.trade = null;
  stats.count(game, player.id, "trades");
  stats.count(game, partner.id, "trades");
  setVisualFeedback(game, {
    producingTileIds: [],
    resourceDeltas: [
      {
        playerId: player.id,
        resource: want.resource,
        amount: want.amount,
        fromPlayerId: partner.id,
      },
      { playerId: partner.id, resource: ask.resource, amount: ask.amount, fromPlayerId: player.id },
    ],
    kind: "trade",
  });
  addLog(
    game,
    `${player.name} traded ${cards(ask.amount, ask.resource)} to ${partner.name} for ${cards(want.amount, want.resource)}.`,
    "trade",
  );
  store.saveGame(game);
  return serializeGame(game);
}

// "Anyone have...?" requests. Players waiting for their turn post what they
// need and what they give for it; whoever is playing can take it with one tap.
// At most one per player; it lasts until taken, withdrawn or their own turn.
function tradeSide(side) {
  if (!side || typeof side !== "object") throw createError("Choose cards to trade.");
  return { resource: side.resource, amount: tradeAmount(side.resource, side.amount) };
}

function postWish(gameId, { playerId, want, give }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  assertMainPhase(game);
  const player = getPlayerOrThrow(game, playerId);
  if (getCurrentPlayer(game).id === playerId)
    throw createError("It's your turn: ask the table with Trade with players.");
  const wanted = tradeSide(want);
  const given = tradeSide(give);
  if (wanted.resource === given.resource)
    throw createError("Ask for a different resource than the one you give.");
  if ((player.resources[given.resource] || 0) < given.amount)
    throw createError(`You need ${cards(given.amount, given.resource)} to offer.`);
  game.wishes = (game.wishes || []).filter((wish) => wish.playerId !== playerId);
  game.wishes.push({ id: uuidv4(), playerId, want: wanted, give: given });
  addLog(
    game,
    `${player.name} asks: anyone have ${cards(wanted.amount, wanted.resource)}? Gives ${cards(given.amount, given.resource)}.`,
    "trade",
  );
  store.saveGame(game);
  return serializeGame(game);
}

function withdrawWish(gameId, { playerId }) {
  const game = getGameOrThrow(gameId);
  if (!(game.wishes || []).some((wish) => wish.playerId === playerId))
    throw createError("You have no open request.", 409);
  game.wishes = game.wishes.filter((wish) => wish.playerId !== playerId);
  addLog(game, `${getPlayerOrThrow(game, playerId).name} took back their request.`, "trade");
  store.saveGame(game);
  return serializeGame(game);
}

function acceptWish(gameId, { playerId, wishId }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  assertMainPhase(game);
  assertPlayersTurn(game, playerId);
  assertActionPhase(game);
  const wish = (game.wishes || []).find((entry) => entry.id === wishId);
  if (!wish) throw createError("That request was taken back.", 409);
  const player = getPlayerOrThrow(game, playerId);
  const partner = getPlayerOrThrow(game, wish.playerId);
  const { want, give } = wish;
  if ((player.resources[want.resource] || 0) < want.amount)
    throw createError(`You need ${cards(want.amount, want.resource)} for this request.`);
  if ((partner.resources[give.resource] || 0) < give.amount)
    throw createError(`${partner.name} no longer has ${cards(give.amount, give.resource)}.`);
  player.resources[want.resource] -= want.amount;
  partner.resources[want.resource] += want.amount;
  partner.resources[give.resource] -= give.amount;
  player.resources[give.resource] += give.amount;
  game.wishes = game.wishes.filter((entry) => entry.id !== wishId);
  stats.count(game, player.id, "trades");
  stats.count(game, partner.id, "trades");
  setVisualFeedback(game, {
    producingTileIds: [],
    resourceDeltas: [
      {
        playerId: partner.id,
        resource: want.resource,
        amount: want.amount,
        fromPlayerId: player.id,
      },
      {
        playerId: player.id,
        resource: give.resource,
        amount: give.amount,
        fromPlayerId: partner.id,
      },
    ],
    kind: "trade",
  });
  addLog(
    game,
    `${player.name} gave ${partner.name} ${cards(want.amount, want.resource)} for ${cards(give.amount, give.resource)}.`,
    "trade",
  );
  store.saveGame(game);
  return serializeGame(game);
}

// A player who doesn't choose (a phone asleep, a player away) can't hold up the
// table forever: after this long the roller may return their cards at random.
const DISCARD_WAIT_MS = Number(process.env.DISCARD_WAIT_MS || 60000);
const waitingDiscards = (game) =>
  game.players.filter((player) => game.pendingDiscards?.[player.id] > 0);

function discardCards(gameId, { playerId, cards, forPlayerId }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  assertMainPhase(game);
  const actor = getPlayerOrThrow(game, playerId);
  const target = getPlayerOrThrow(game, forPlayerId || playerId);
  const owed = game.pendingDiscards?.[target.id] || 0;
  if (!owed) throw createError(`${target.name} has no cards to return.`);

  const returned = Object.fromEntries(config.resources.map((resource) => [resource, 0]));
  const forced = target.id !== actor.id;
  if (forced) {
    assertPlayersTurn(game, actor.id);
    if (Date.now() - Date.parse(game.discardsSince) < DISCARD_WAIT_MS) {
      throw createError(`Give ${target.name} a moment to choose their cards.`);
    }
    const hand = { ...target.resources };
    for (let i = 0; i < owed; i += 1) {
      const resource = randomItem(
        config.resources.flatMap((entry) => Array(hand[entry]).fill(entry)),
      );
      hand[resource] -= 1;
      returned[resource] += 1;
    }
  } else {
    if (!cards || typeof cards !== "object" || Array.isArray(cards)) {
      throw createError(`Choose ${owed} cards to return.`);
    }
    for (const [resource, amount] of Object.entries(cards)) {
      if (!config.resources.includes(resource) || !Number.isInteger(amount) || amount < 0) {
        throw createError("Choose cards from your hand to return.");
      }
      if (amount > target.resources[resource]) {
        throw createError(`You only have ${target.resources[resource]} ${resource}.`);
      }
      returned[resource] = amount;
    }
    const chosen = Object.values(returned).reduce((sum, amount) => sum + amount, 0);
    if (chosen !== owed) throw createError(`Choose exactly ${owed} cards to return.`);
  }

  for (const [resource, amount] of Object.entries(returned)) {
    target.resources[resource] -= amount;
    game.bank[resource] += amount;
  }
  delete game.pendingDiscards[target.id];
  stats.count(game, target.id, "returned", owed);
  if (!waitingDiscards(game).length) game.discardsSince = null;
  addLog(
    game,
    forced
      ? `${target.name} took too long; ${owed} random cards went back to the bank.`
      : `${target.name} returned ${owed} cards to the bank.`,
  );

  store.saveGame(game);
  return serializeGame(game);
}

function moveRobber(gameId, { playerId, tileId, victimId }) {
  const game = getGameOrThrow(gameId);
  assertActiveGame(game);
  assertMainPhase(game);
  assertPlayersTurn(game, playerId);

  if (!game.mustMoveRobber) {
    throw createError("The bandit can only move after a 7 or a Knight.");
  }
  const waiting = waitingDiscards(game);
  if (waiting.length) {
    throw createError(
      `Waiting for ${waiting.map((player) => player.name).join(" and ")} to return cards.`,
    );
  }

  const nextTileId = Number(tileId);
  const tile = game.board.tiles[nextTileId];
  if (!tile) {
    throw createError("Invalid tile for robber movement.");
  }
  if (nextTileId === game.board.robberTileId) {
    throw createError("Choose a different tile.");
  }

  const robberPlayer = getPlayerOrThrow(game, playerId);
  // The roller chooses whom to rob among the players on that territory.
  const victims = getRobberVictims(game, nextTileId, playerId);
  let victim = victims.length === 1 && !victimId ? victims[0] : null;
  if (victimId) {
    victim = victims.find((player) => player.id === victimId);
    if (!victim) throw createError("Choose a player with a village or city on that territory.");
  } else if (victims.length > 1) {
    throw createError("Choose who to steal from.");
  }

  game.board.robberTileId = nextTileId;
  game.mustMoveRobber = false;
  addLog(game, `${robberPlayer.name} moved the bandit to ${tile.region}.`);

  const stolenResource = victim && stealRandomResource(victim, robberPlayer);
  if (stolenResource) {
    addLog(game, `${robberPlayer.name} stole a card from ${victim.name}.`);
    stats.count(game, robberPlayer.id, "steals");
    stats.count(game, victim.id, "robbed");
    // Only the thief and the victim learn which card it was; see sessions.view.
    setVisualFeedback(game, {
      kind: "steal",
      playerId: robberPlayer.id,
      fromPlayerId: victim.id,
      resourceDeltas: [
        {
          playerId: robberPlayer.id,
          fromPlayerId: victim.id,
          resource: stolenResource,
          amount: 1,
          private: true,
        },
      ],
    });
  } else {
    addLog(game, "Nobody on that territory had a card to steal.");
  }

  store.saveGame(game);
  return serializeGame(game);
}

function buyDevelopmentCard(gameId, { playerId }) {
  const game = devState(getGameOrThrow(gameId));
  assertActiveGame(game);
  assertMainPhase(game);
  assertPlayersTurn(game, playerId);
  assertActionPhase(game);

  const player = getPlayerOrThrow(game, playerId);
  const cost = config.buildingCosts.development;
  if (!game.devDeck.length) throw createError("No development cards are left.");
  if (!hasEnoughResources(player.resources, cost)) {
    throw createError("A development card costs 1 Wheat, 1 Sheep and 1 Stone.");
  }

  spendResources(player.resources, game.bank, cost);
  const type = game.devDeck.pop();
  player.devCards.push({ id: uuidv4(), type, boughtTurn: game.turn });
  addLog(game, `${player.name} bought a development card.`);
  setVisualFeedback(game, { kind: "devbuy", playerId: player.id });
  checkWinner(game, player);

  store.saveGame(game);
  return serializeGame(game);
}

// Largest Army: the first to play 3 Knights, then whoever plays more than the holder.
function updateLargestArmy(game, player) {
  if (player.knightsPlayed < config.largestArmy.minKnights) return;
  const holder = game.players.find((entry) => entry.id === game.largestArmyId);
  if (holder === player || (holder && holder.knightsPlayed >= player.knightsPlayed)) return;
  if (holder) holder.score -= config.largestArmy.points;
  player.score += config.largestArmy.points;
  game.largestArmyId = player.id;
  addLog(
    game,
    `${player.name} now has the Largest Army (+${config.largestArmy.points} points)${
      holder ? `, taking it from ${holder.name}` : ""
    }.`,
    "win",
  );
}

// Longest Road: the first unbroken road of 5 or more, then whoever builds a
// longer one. A tie never takes it from the holder. If the holder's road is cut
// and several players now share the longest, nobody holds it until one pulls ahead.
function updateLongestRoad(game) {
  if (!game.board) return;
  const { minRoads, points } = config.longestRoad;
  const lengths = Object.fromEntries(
    game.players.map((player) => [player.id, longestRoadLength(game, player.id)]),
  );
  const top = Math.max(0, ...Object.values(lengths));
  const holder = game.players.find((entry) => entry.id === game.longestRoadId) || null;
  if (holder && lengths[holder.id] === top && top >= minRoads) return;
  const leaders = game.players.filter((player) => lengths[player.id] === top);
  const next = top >= minRoads && leaders.length === 1 ? leaders[0] : null;
  if (next === holder) return;
  if (holder) holder.score -= points;
  if (next) next.score += points;
  game.longestRoadId = next?.id || null;
  if (next)
    addLog(
      game,
      `${next.name} now has the Longest Road: ${top} roads in a row (+${points} points)${
        holder ? `, taking it from ${holder.name}` : ""
      }.`,
      "win",
    );
  else addLog(game, `${holder.name}'s road was cut: nobody holds the Longest Road now.`, "win");
}

function playDevelopmentCard(gameId, { playerId, type, resource, resources }) {
  const game = devState(getGameOrThrow(gameId));
  assertActiveGame(game);
  assertMainPhase(game);
  assertPlayersTurn(game, playerId);
  if (game.mustMoveRobber) throw createError("Move the bandit first.");
  if (!DEV_TYPES.includes(type)) throw createError("Choose a development card to play.");
  if (type === "victoryPoint") {
    throw createError("Victory Point cards count by themselves. Keep them hidden.");
  }
  if (game.devCardPlayedTurn === game.turn) {
    throw createError("Only one development card can be played each turn.");
  }

  const player = getPlayerOrThrow(game, playerId);
  const owned = player.devCards.filter((card) => card.type === type);
  const index = player.devCards.findIndex(
    (card) => card.type === type && card.boughtTurn !== game.turn,
  );
  if (index < 0) {
    throw createError(
      owned.length
        ? "A card bought this turn can be played from your next turn."
        : `You have no ${devLabel(type)} card.`,
    );
  }

  // Check the card's choices before using it up.
  const valid = (entry) => config.resources.includes(entry);
  if (type === "yearOfPlenty") {
    if (!Array.isArray(resources) || resources.length !== 2 || !resources.every(valid)) {
      throw createError("Choose two resources to take from the bank.");
    }
    for (const entry of new Set(resources)) {
      const wanted = resources.filter((value) => value === entry).length;
      if ((game.bank[entry] || 0) < wanted) {
        throw createError(`The bank does not have ${wanted} ${config.resourceLabels[entry]}.`);
      }
    }
  }
  if (type === "monopoly" && !valid(resource)) throw createError("Choose a resource to claim.");
  if (type === "roadBuilding" && !getValidRoadIds(game, player).length) {
    throw createError("You have no free road spot to build on.");
  }

  player.devCards.splice(index, 1);
  game.devCardPlayedTurn = game.turn;
  let resourceDeltas = [];

  if (type === "knight") {
    player.knightsPlayed += 1;
    game.mustMoveRobber = true;
    addLog(game, `${player.name} played a Knight. Move the bandit and steal a card.`);
    updateLargestArmy(game, player);
  } else if (type === "roadBuilding") {
    game.freeRoads = { playerId: player.id, count: Math.min(2, 15 - player.roads.length) };
    addLog(game, `${player.name} played Road Building: two free roads.`);
  } else if (type === "yearOfPlenty") {
    for (const entry of resources) transferFromBank(game, player, entry, 1);
    resourceDeltas = [...new Set(resources)].map((entry) => ({
      playerId: player.id,
      resource: entry,
      amount: resources.filter((value) => value === entry).length,
      tileIds: [],
    }));
    const taken = resourceDeltas.map((delta) => cards(delta.amount, delta.resource));
    addLog(game, `${player.name} played Year of Plenty and took ${taken.join(" and ")}.`);
  } else if (type === "monopoly") {
    let total = 0;
    for (const other of game.players) {
      const amount = other.id === player.id ? 0 : other.resources[resource];
      if (!amount) continue;
      other.resources[resource] = 0;
      player.resources[resource] += amount;
      total += amount;
      resourceDeltas.push({ playerId: player.id, resource, amount, fromPlayerId: other.id });
    }
    addLog(
      game,
      `${player.name} played Monopoly on ${config.resourceLabels[resource]} and collected ${total}.`,
    );
  }

  setVisualFeedback(game, { kind: "devplay", playerId: player.id, card: type, resourceDeltas });
  checkWinner(game, player);
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
  game.trade = null;
  game.freeRoads = null;

  const nextPlayer = getCurrentPlayer(game);
  addLog(game, `Turn ${game.turn}: ${nextPlayer.name}'s turn starts.`);
  // On their own turn a player asks the table directly instead.
  game.wishes = (game.wishes || []).filter((wish) => wish.playerId !== nextPlayer.id);
  // Points gained off-turn (an opponent cutting a rival's road) win at turn start.
  checkWinner(game, nextPlayer);

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
  rollForOrder,
  rollDice,
  buildRoad,
  buildVillage,
  upgradeCity,
  tradeWithBank,
  requestTrade,
  offerTrade,
  withdrawTradeOffer,
  declineTradeOffer,
  cancelTrade,
  acceptTradeOffer,
  postWish,
  withdrawWish,
  acceptWish,
  moveRobber,
  buyDevelopmentCard,
  discardCards,
  playDevelopmentCard,
  endTurn,
  getSampleMatchData,
};
