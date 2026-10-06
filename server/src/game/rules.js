function canPlaceInitialVillage(game, vertexId) {
  const vertex = game.board.vertices[vertexId];
  if (!vertex || vertex.ownerId) {
    return false;
  }

  return vertex.adjacentVertices.every((neighborId) => !game.board.vertices[neighborId].ownerId);
}

function canPlaceRoad(game, player, edgeId) {
  if (player.roads.length >= 15) return false;
  const edge = game.board.edges[edgeId];
  if (!edge || edge.ownerId) {
    return false;
  }

  const endpoints = [edge.v1, edge.v2];
  const touchesOwnSettlement = endpoints.some(
    (vertexId) => game.board.vertices[vertexId].ownerId === player.id,
  );
  const touchesOwnRoad = endpoints.some(
    (vertexId) =>
      !game.board.vertices[vertexId].ownerId &&
      game.board.vertices[vertexId].adjacentEdges.some(
        (adjacentEdgeId) => game.board.edges[adjacentEdgeId].ownerId === player.id,
      ),
  );

  return touchesOwnSettlement || touchesOwnRoad;
}

function canPlaceVillage(game, player, vertexId) {
  if (player.villages.length >= 5) return false;
  const vertex = game.board.vertices[vertexId];
  if (!vertex || vertex.ownerId) {
    return false;
  }

  const respectsDistanceRule = vertex.adjacentVertices.every(
    (neighborId) => !game.board.vertices[neighborId].ownerId,
  );

  if (!respectsDistanceRule) {
    return false;
  }

  return vertex.adjacentEdges.some((edgeId) => game.board.edges[edgeId].ownerId === player.id);
}

function canUpgradeCity(game, player, vertexId) {
  if (player.cities.length >= 4) return false;
  const vertex = game.board.vertices[vertexId];
  return Boolean(vertex && vertex.ownerId === player.id && vertex.building === "village");
}

function getValidRoadIds(game, player) {
  return game.board.edges
    .filter((edge) => canPlaceRoad(game, player, edge.id))
    .map((edge) => edge.id);
}

function getValidVillageIds(game, player) {
  return game.board.vertices
    .filter((vertex) => canPlaceVillage(game, player, vertex.id))
    .map((vertex) => vertex.id);
}

function getValidCityIds(game, player) {
  return game.board.vertices
    .filter((vertex) => canUpgradeCity(game, player, vertex.id))
    .map((vertex) => vertex.id);
}

function getTradeRates(game, player) {
  const rates = { wheat: 4, wood: 4, stone: 4, brick: 4, sheep: 4 };
  for (const sea of game.board?.seaTiles || []) {
    if (
      !sea.harbor ||
      !sea.portVertexIds?.some((id) => game.board.vertices[id].ownerId === player.id)
    )
      continue;
    if (sea.harbor === "3:1") {
      for (const key of Object.keys(rates)) rates[key] = Math.min(rates[key], 3);
    } else {
      const resource = sea.harbor.toLowerCase();
      if (resource in rates) rates[resource] = 2;
    }
  }
  return rates;
}

// The longest unbroken chain of a player's roads. An opponent's village or city
// cuts the chain where it stands; a road may not be walked twice.
function longestRoadLength(game, playerId) {
  const { edges, vertices } = game.board;
  const own = edges.filter((edge) => edge.ownerId === playerId);
  const cut = (vertexId) => vertices[vertexId].ownerId && vertices[vertexId].ownerId !== playerId;
  const used = new Set();
  let best = 0;
  const walk = (vertexId, length) => {
    if (length > best) best = length;
    if (length && cut(vertexId)) return;
    for (const edgeId of vertices[vertexId].adjacentEdges) {
      const edge = edges[edgeId];
      if (edge.ownerId !== playerId || used.has(edgeId)) continue;
      used.add(edgeId);
      walk(edge.v1 === vertexId ? edge.v2 : edge.v1, length + 1);
      used.delete(edgeId);
    }
  };
  for (const edge of own) {
    walk(edge.v1, 0);
    walk(edge.v2, 0);
  }
  return best;
}

module.exports = {
  longestRoadLength,
  getTradeRates,
  canPlaceInitialVillage,
  canPlaceRoad,
  canPlaceVillage,
  canUpgradeCity,
  getValidRoadIds,
  getValidVillageIds,
  getValidCityIds,
};
