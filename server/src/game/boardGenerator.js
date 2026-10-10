const config = require("../../../shared/gameConfig.json");
const { shuffle } = require("./helpers");

const SQRT_3 = Math.sqrt(3);
const HEX_SIZE = 90;
const CORNER_ANGLES = [-30, 30, 90, 150, 210, 270];
const NEIGHBOR_STEPS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

// The classic 19-hex map seats up to four; the 30-hex map is used by 5 and 6
// player rooms, and 7 or 8 players play on 44 hexes. The host picks the tiles:
// Syria only, Tunisia only, or both mixed. Every match draws its regions from that
// set by resource, so each map size always has the same resource mix. A set too
// small for a map (or, on the 44-hex map, Syria's 11 unpainted regions) can't be
// picked. Saves without a board size are classic; saves without tiles use the default.
const MAP_TILES = ["syria", "tunisia", "mix"];
const TUNISIA = config.extraLargeBoard.extraRegions;
const SYRIA = [...config.regions, ...config.largeBoard.extraRegions];
const ALL_REGIONS = [...SYRIA, ...TUNISIA];
const tally = (regions) =>
  regions.reduce((counts, { resource }) => ({ ...counts, [resource]: (counts[resource] || 0) + 1 }), {});
const defaultMapTiles = (size) => (size === "xl" ? "mix" : "syria");
const layouts = {
  standard: config,
  large: config.largeBoard,
  xl: config.extraLargeBoard,
};
const tileCounts = {
  standard: tally(config.regions),
  large: tally(SYRIA),
  xl: config.extraLargeBoard.tileCounts,
};
function tilePool(size, tiles) {
  if (tiles === "tunisia") return TUNISIA;
  // Mixed maps use only painted tiles: the classic Syrian regions and Tunisia.
  if (tiles === "mix") return [...config.regions, ...TUNISIA];
  return size === "standard" ? config.regions : size === "large" ? SYRIA : [];
}
// Why this tile set can't fill a map of this size, or null when it can.
function mapTilesProblem(size, tiles) {
  if (!MAP_TILES.includes(tiles)) return "Choose Syria, Tunisia or both for the map.";
  const have = tally(tilePool(size, tiles));
  const short = Object.entries(tileCounts[size]).find(([res, n]) => (have[res] || 0) < n);
  if (!short) return null;
  const country = tiles === "syria" ? "Syria" : "Tunisia";
  return `${country} alone doesn't have enough tiles for this map.`;
}

function boardSpec(size = "standard", tiles = defaultMapTiles(size)) {
  if (size !== "large" && size !== "xl") size = "standard";
  if (mapTilesProblem(size, tiles)) tiles = defaultMapTiles(size);
  const layout = layouts[size];
  return {
    size,
    tiles,
    boardLayout: layout.boardLayout,
    // The regions this map can use; each match draws `draw` of them by resource.
    regions: tilePool(size, tiles),
    draw: tileCounts[size],
    numberTokens: layout.numberTokens,
    harborTypes: layout.harborTypes,
  };
}

// The regions one match plays with: a random draw by resource from the map's set.
function drawRegions(spec) {
  return Object.entries(spec.draw).flatMap(([resource, count]) =>
    shuffle(spec.regions.filter((region) => region.resource === resource)).slice(0, count),
  );
}

// Why a list of region names cannot fill this map, or null when it can.
function regionSetProblem(names, spec) {
  if (names.length !== spec.boardLayout.length)
    return `must include ${spec.boardLayout.length} regions`;
  const known = new Map(spec.regions.map((region) => [region.name, region]));
  const outside = names.find((name) => !known.has(name));
  if (outside !== undefined) return `cannot use ${outside} on this map`;
  if (new Set(names).size !== names.length) return "repeats a region";
  for (const [resource, count] of Object.entries(spec.draw)) {
    if (names.filter((name) => known.get(name).resource === resource).length !== count)
      return `needs ${count} ${resource} regions`;
  }
  return null;
}

const boardSizeFor = (maxPlayers) =>
  maxPlayers > 6 ? "xl" : maxPlayers > 4 ? "large" : "standard";

function axialToPixel(q, r) {
  return {
    x: HEX_SIZE * SQRT_3 * (q + r / 2),
    y: HEX_SIZE * 1.5 * r,
  };
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

function resolveRegions(regionOrder, spec) {
  if (!Array.isArray(regionOrder) || !regionOrder.length) {
    return shuffle(drawRegions(spec));
  }

  const problem = regionSetProblem(regionOrder.map((name) => String(name || "").trim()), spec);
  if (problem) throw new Error(`regionOrder ${problem}.`);

  const knownRegionsByName = new Map(spec.regions.map((region) => [region.name, region]));
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

function resolveNumberTokens(numberOrder, spec) {
  if (!Array.isArray(numberOrder) || !numberOrder.length) {
    return shuffle(spec.numberTokens);
  }

  if (numberOrder.length !== spec.numberTokens.length) {
    throw new Error(`numberOrder must include exactly ${spec.numberTokens.length} tokens.`);
  }

  if (arraySignature(numberOrder) !== arraySignature(spec.numberTokens)) {
    throw new Error("numberOrder must use the same token values as the configured number tokens.");
  }

  return numberOrder.map((token) => Number(token));
}

function resolveHarbors(harborOrder, spec) {
  if (!Array.isArray(harborOrder) || !harborOrder.length) {
    return shuffle(spec.harborTypes);
  }

  if (harborOrder.length !== spec.harborTypes.length) {
    throw new Error(`harborOrder must include exactly ${spec.harborTypes.length} harbors.`);
  }

  if (arraySignature(harborOrder) !== arraySignature(spec.harborTypes)) {
    throw new Error("harborOrder must use the same harbor labels as the configured harbor set.");
  }

  return harborOrder.map((entry) => String(entry));
}

// Every water hex touching the land, ordered around the island's middle.
function buildSeaRing(layout) {
  const land = new Set(layout.map(({ q, r }) => `${q},${r}`));
  const seen = new Set();
  const ring = [];
  layout.forEach(({ q, r }) =>
    NEIGHBOR_STEPS.forEach(([dq, dr]) => {
      const key = `${q + dq},${r + dr}`;
      if (land.has(key) || seen.has(key)) return;
      seen.add(key);
      ring.push({ q: q + dq, r: r + dr, center: axialToPixel(q + dq, r + dr) });
    }),
  );
  const middle = layout
    .map(({ q, r }) => axialToPixel(q, r))
    .reduce(
      (sum, point) => ({ x: sum.x + point.x / layout.length, y: sum.y + point.y / layout.length }),
      {
        x: 0,
        y: 0,
      },
    );
  ring.forEach((entry) => {
    const angle = Math.atan2(entry.center.y - middle.y, entry.center.x - middle.x);
    // Round so the classic ring keeps its original order despite float noise.
    entry.angle = Number(angle.toFixed(6));
  });
  return ring.sort((a, b) => a.angle - b.angle);
}

// Harbors sit on every other water hex when there is room, spread evenly otherwise.
function harborSlots(seaCount, harborCount) {
  return Array.from({ length: harborCount }, (_, i) => Math.round((i * seaCount) / harborCount));
}

function generateBoard(options = {}) {
  const spec = boardSpec(options.boardSize, options.mapTiles);
  const positions = [...spec.boardLayout];
  const regions = resolveRegions(options.regionOrder, spec);
  const numberTokens = resolveNumberTokens(options.numberOrder, spec);
  const harborTypes = resolveHarbors(options.harborOrder, spec);
  const seaRing = buildSeaRing(positions);
  const slots = harborSlots(seaRing.length, harborTypes.length);

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
    const harborSlot = slots.indexOf(seaIndex);
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
      const nextTokens = shuffle(spec.numberTokens);
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
  boardSpec,
  ALL_REGIONS,
  MAP_TILES,
  boardSizeFor,
  defaultMapTiles,
  drawRegions,
  mapTilesProblem,
  generateBoard,
  regionSetProblem,
};
