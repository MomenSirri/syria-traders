const config = require("../../../shared/gameConfig.json");
const { shuffle } = require("./helpers");

const SQRT_3 = Math.sqrt(3);
const HEX_SIZE = 90;
const CORNER_ANGLES = [-30, 30, 90, 150, 210, 270];
const SEA_RADIUS = 3;
const HARBOR_SLOT_INDEXES = [0, 2, 4, 6, 8, 10, 12, 14, 16];

function axialToPixel(q, r) {
  return {
    x: HEX_SIZE * SQRT_3 * (q + r / 2),
    y: HEX_SIZE * 1.5 * r,
  };
}

function axialDistance(q, r) {
  const s = -q - r;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
}

function getCorner(center, index) {
  const angle = (Math.PI / 180) * CORNER_ANGLES[index];
  return {
    x: center.x + HEX_SIZE * Math.cos(angle),
    y: center.y + HEX_SIZE * Math.sin(angle),
  };
}

function toVertexKey(point) {
  // Trigonometry can produce tiny negative values at zero. Normalize them so
  // neighboring hexes share one corner instead of creating a duplicate corner.
  return `${Number(point.x.toFixed(4)) || 0}:${Number(point.y.toFixed(4)) || 0}`;
}

function toEdgeKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function arraySignature(values) {
  return [...values]
    .map((entry) => String(entry))
    .sort()
    .join("|");
}

function resolveRegions(regionOrder) {
  if (!Array.isArray(regionOrder) || !regionOrder.length) {
    return shuffle(config.regions);
  }

  if (regionOrder.length !== config.regions.length) {
    throw new Error(`regionOrder must include exactly ${config.regions.length} region names.`);
  }

  const knownRegionsByName = new Map(config.regions.map((region) => [region.name, region]));
  const usedNames = new Set();

  return regionOrder.map((name) => {
    const regionName = String(name || "").trim();
    if (!knownRegionsByName.has(regionName)) {
      throw new Error(`Unknown region in regionOrder: ${regionName}`);
    }
    if (usedNames.has(regionName)) {
      throw new Error(`Duplicate region in regionOrder: ${regionName}`);
    }
    usedNames.add(regionName);
    return knownRegionsByName.get(regionName);
  });
}

function resolveNumberTokens(numberOrder) {
  if (!Array.isArray(numberOrder) || !numberOrder.length) {
    return shuffle(config.numberTokens);
  }

  if (numberOrder.length !== config.numberTokens.length) {
    throw new Error(`numberOrder must include exactly ${config.numberTokens.length} tokens.`);
  }

  if (arraySignature(numberOrder) !== arraySignature(config.numberTokens)) {
    throw new Error("numberOrder must use the same token values as the configured number tokens.");
  }

  return numberOrder.map((token) => Number(token));
}

function resolveHarbors(harborOrder) {
  if (!Array.isArray(harborOrder) || !harborOrder.length) {
    return shuffle(config.harborTypes);
  }

  if (harborOrder.length !== config.harborTypes.length) {
    throw new Error(`harborOrder must include exactly ${config.harborTypes.length} harbors.`);
  }

  if (arraySignature(harborOrder) !== arraySignature(config.harborTypes)) {
    throw new Error("harborOrder must use the same harbor labels as the configured harbor set.");
  }

  return harborOrder.map((entry) => String(entry));
}

function buildSeaRing() {
  const ring = [];

  for (let q = -SEA_RADIUS; q <= SEA_RADIUS; q += 1) {
    for (let r = -SEA_RADIUS; r <= SEA_RADIUS; r += 1) {
      if (axialDistance(q, r) === SEA_RADIUS) {
        const center = axialToPixel(q, r);
        ring.push({
          q,
          r,
          center,
          angle: Math.atan2(center.y, center.x),
        });
      }
    }
  }

  return ring.sort((a, b) => a.angle - b.angle);
}

function generateBoard(options = {}) {
  const positions = [...config.boardLayout];
  const regions = resolveRegions(options.regionOrder);
  const numberTokens = resolveNumberTokens(options.numberOrder);
  const harborTypes = resolveHarbors(options.harborOrder);
  const seaRing = buildSeaRing();

  const tiles = [];
  const vertices = [];
  const edges = [];
  const seaTiles = [];

  const vertexByKey = new Map();
  const edgeByKey = new Map();

  let tokenIndex = 0;

  positions.forEach((axial, tileId) => {
    const region = regions[tileId];
    const center = axialToPixel(axial.q, axial.r);
    const vertexIds = [];
    const edgeIds = [];

    for (let cornerIndex = 0; cornerIndex < 6; cornerIndex += 1) {
      const point = getCorner(center, cornerIndex);
      const key = toVertexKey(point);
      let vertexId = vertexByKey.get(key);

      if (vertexId === undefined) {
        vertexId = vertices.length;
        vertexByKey.set(key, vertexId);
        vertices.push({
          id: vertexId,
          x: Number(point.x.toFixed(2)) || 0,
          y: Number(point.y.toFixed(2)) || 0,
          ownerId: null,
          building: null,
          adjacentTiles: [tileId],
          adjacentVertices: [],
          adjacentEdges: [],
        });
      } else {
        vertices[vertexId].adjacentTiles.push(tileId);
      }

      vertexIds.push(vertexId);
    }

    for (let edgeIndex = 0; edgeIndex < 6; edgeIndex += 1) {
      const a = vertexIds[edgeIndex];
      const b = vertexIds[(edgeIndex + 1) % 6];
      const key = toEdgeKey(a, b);
      let edgeId = edgeByKey.get(key);

      if (edgeId === undefined) {
        edgeId = edges.length;
        edgeByKey.set(key, edgeId);
        edges.push({
          id: edgeId,
          v1: a,
          v2: b,
          ownerId: null,
          adjacentTiles: [tileId],
        });
      } else {
        edges[edgeId].adjacentTiles.push(tileId);
      }

      edgeIds.push(edgeId);
    }

    const isDesert = region.resource === "desert";
    tiles.push({
      id: tileId,
      region: region.name,
      resource: region.resource,
      flavor: region.flavor,
      numberToken: isDesert ? null : numberTokens[tokenIndex++],
      terrainColor: config.resourceColors[region.resource],
      axial,
      center: {
        x: Number(center.x.toFixed(2)),
        y: Number(center.y.toFixed(2)),
      },
      vertexIds,
      edgeIds,
    });
  });

  seaRing.forEach((entry, seaIndex) => {
    const harborSlot = HARBOR_SLOT_INDEXES.indexOf(seaIndex);
    seaTiles.push({
      id: `sea-${seaIndex}`,
      axial: { q: entry.q, r: entry.r },
      center: {
        x: Number(entry.center.x.toFixed(2)),
        y: Number(entry.center.y.toFixed(2)),
      },
      terrainColor: config.resourceColors.sea,
      harbor: harborSlot >= 0 ? harborTypes[harborSlot] : null,
    });
  });

  const neighborSets = vertices.map(() => new Set());
  edges.forEach((edge) => {
    neighborSets[edge.v1].add(edge.v2);
    neighborSets[edge.v2].add(edge.v1);

    vertices[edge.v1].adjacentEdges.push(edge.id);
    vertices[edge.v2].adjacentEdges.push(edge.id);
  });

  vertices.forEach((vertex, index) => {
    vertex.adjacentVertices = [...neighborSets[index]];
    vertex.adjacentTiles = [...new Set(vertex.adjacentTiles)];
    vertex.adjacentEdges = [...new Set(vertex.adjacentEdges)];
  });

  const desertTile = tiles.find((tile) => tile.resource === "desert");

  // Each harbor connects to two real coastal vertices, shown as piers in the UI.
  const usedPortVertices = new Set();
  seaTiles
    .filter((sea) => sea.harbor)
    .forEach((sea) => {
      const coast = edges.filter(
        (edge) =>
          edge.adjacentTiles.length === 1 &&
          !usedPortVertices.has(edge.v1) &&
          !usedPortVertices.has(edge.v2),
      );
      const distance = (edge) => {
        const a = vertices[edge.v1],
          b = vertices[edge.v2];
        return Math.hypot((a.x + b.x) / 2 - sea.center.x, (a.y + b.y) / 2 - sea.center.y);
      };
      coast.sort((a, b) => distance(a) - distance(b));
      if (coast[0]) {
        sea.portVertexIds = [coast[0].v1, coast[0].v2];
        sea.portVertexIds.forEach((id) => usedPortVertices.add(id));
      }
    });

  if (!options.numberOrder) {
    const productive = tiles.filter((tile) => tile.resource !== "desert");
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const hot = tiles.filter((tile) => tile.numberToken === 6 || tile.numberToken === 8);
      if (
        !hot.some((a, i) =>
          hot.slice(i + 1).some((b) => a.edgeIds.some((id) => b.edgeIds.includes(id))),
        )
      )
        break;
      const nextTokens = shuffle(config.numberTokens);
      productive.forEach((tile, index) => {
        tile.numberToken = nextTokens[index];
      });
    }
  }

  return {
    tiles,
    seaTiles,
    vertices,
    edges,
    robberTileId: desertTile ? desertTile.id : 0,
  };
}

module.exports = {
  HEX_SIZE,
  generateBoard,
};
