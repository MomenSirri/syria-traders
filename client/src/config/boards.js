import config from "../../../shared/gameConfig.json";

// Mirrors boardSpec on the server: the classic 19-territory map seats up to
// four, 5 or 6 players play on the 30-territory map, and 7 or 8 players on 44.
// The host picks the tiles (Syria, Tunisia or both); each match draws its regions
// from that set by resource, so every map size keeps the same resource mix.
export const boardSizeFor = (players) =>
  players > 6 ? "xl" : players > 4 ? "large" : "standard";

export const MAP_TILES = [
  ["syria", "Syria"],
  ["tunisia", "Tunisia"],
  ["mix", "Both"],
];
const TUNISIA = config.extraLargeBoard.extraRegions;
const SYRIA = [...config.regions, ...config.largeBoard.extraRegions];
export const ALL_REGIONS = [...SYRIA, ...TUNISIA];
const tally = (regions) =>
  regions.reduce(
    (counts, { resource }) => ({ ...counts, [resource]: (counts[resource] || 0) + 1 }),
    {},
  );
export const defaultMapTiles = (size) => (size === "xl" ? "mix" : "syria");
const layouts = { standard: config, large: config.largeBoard, xl: config.extraLargeBoard };
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
export function mapTilesProblem(size, tiles) {
  const have = tally(tilePool(size, tiles));
  const short = Object.entries(tileCounts[size]).some(([res, n]) => (have[res] || 0) < n);
  if (!short) return null;
  return `${tiles === "syria" ? "Syria" : "Tunisia"} alone doesn't have enough tiles for this map.`;
}

export function boardSpec(size, tiles = defaultMapTiles(size)) {
  if (size !== "large" && size !== "xl") size = "standard";
  if (mapTilesProblem(size, tiles)) tiles = defaultMapTiles(size);
  const layout = layouts[size];
  return {
    size,
    tiles,
    boardLayout: layout.boardLayout,
    regions: tilePool(size, tiles),
    draw: tileCounts[size],
    numberTokens: layout.numberTokens,
    harborTypes: layout.harborTypes,
  };
}

const shuffled = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

// The regions one match plays with: a random draw by resource from the map's set.
export function drawRegions(spec) {
  return Object.entries(spec.draw).flatMap(([resource, count]) =>
    shuffled(spec.regions.filter((region) => region.resource === resource)).slice(0, count),
  );
}

// Whether a saved arrangement still fills this map (the server checks the same).
export function fillsMap(names, spec) {
  if (names.length !== spec.boardLayout.length || new Set(names).size !== names.length)
    return false;
  const known = new Map(spec.regions.map((region) => [region.name, region]));
  if (!names.every((name) => known.has(name))) return false;
  return Object.entries(spec.draw).every(
    ([resource, count]) =>
      names.filter((name) => known.get(name).resource === resource).length === count,
  );
}
