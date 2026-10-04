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

module.exports = {
  getTradeRates,
  canPlaceInitialVillage,
  canPlaceRoad,
  canPlaceVillage,
  canUpgradeCity,
  getValidRoadIds,
  getValidVillageIds,
  getValidCityIds,
};
