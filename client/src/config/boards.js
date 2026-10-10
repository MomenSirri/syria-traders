import config from "../../../shared/gameConfig.json";

// Mirrors boardSpec on the server: the classic 19-territory map seats up to
// four, 5 or 6 players play on the 30-territory map, and 7 or 8 players add
// Tunisian cities for 44 territories.
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
  };
}
