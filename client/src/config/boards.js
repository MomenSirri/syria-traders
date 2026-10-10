import config from "../../../shared/gameConfig.json";

// Mirrors boardSpec on the server: the classic 19-territory map seats up to
// four, 5 or 6 players play on the 30-territory map, and 7 or 8 players play
// 44 painted territories: the 19 classic Syrian ones plus 25 drawn from Tunisia.
export const boardSizeFor = (players) =>
  players > 6 ? "xl" : players > 4 ? "large" : "standard";

export function boardSpec(size) {
  if (size !== "large" && size !== "xl")
    return {
      size: "standard",
      boardLayout: config.boardLayout,
      regions: config.regions,
      numberTokens: config.numberTokens,
      harborTypes: config.harborTypes,
    };
  const large = config.largeBoard;
  const board = size === "xl" ? config.extraLargeBoard : large;
  return {
    size,
    boardLayout: board.boardLayout,
    regions: [
      ...config.regions,
      ...large.extraRegions,
      ...(size === "xl" ? board.extraRegions : []),
    ],
    numberTokens: board.numberTokens,
    harborTypes: board.harborTypes,
    ...(size === "xl"
      ? {
          // Only painted tiles: the classic Syrian regions, then a draw from Tunisia.
          fixedCount: config.regions.length,
          poolStart: config.regions.length + large.extraRegions.length,
          draw: board.drawPerMatch,
        }
      : {}),
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

// The regions one match plays with: every fixed region plus a random draw.
export function drawRegions(spec) {
  if (!spec.draw) return spec.regions;
  const pool = spec.regions.slice(spec.poolStart ?? spec.fixedCount);
  return [
    ...spec.regions.slice(0, spec.fixedCount),
    ...Object.entries(spec.draw).flatMap(([resource, count]) =>
      shuffled(pool.filter((region) => region.resource === resource)).slice(0, count),
    ),
  ];
}

// Whether a saved arrangement still fills this map (the server checks the same).
export function fillsMap(names, spec) {
  if (names.length !== spec.boardLayout.length || new Set(names).size !== names.length)
    return false;
  const known = new Map(spec.regions.map((region) => [region.name, region]));
  if (!names.every((name) => known.has(name))) return false;
  if (!spec.draw) return true;
  const fixed = new Set(spec.regions.slice(0, spec.fixedCount).map((region) => region.name));
  if ([...fixed].some((name) => !names.includes(name))) return false;
  const pool = new Set(spec.regions.slice(spec.poolStart ?? spec.fixedCount).map((r) => r.name));
  if (!names.every((name) => fixed.has(name) || pool.has(name))) return false;
  return Object.entries(spec.draw).every(
    ([resource, count]) =>
      names.filter((name) => !fixed.has(name) && known.get(name).resource === resource)
        .length === count,
  );
}
