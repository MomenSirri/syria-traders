import config from "../../../shared/gameConfig.json";

// Mirrors boardSpec on the server: the classic 19-territory map seats up to
// four, and 5 or 6 players play on the 30-territory map.
export const boardSizeFor = (players) => (players > 4 ? "large" : "standard");

export function boardSpec(size) {
  if (size !== "large")
    return {
      size: "standard",
      boardLayout: config.boardLayout,
      regions: config.regions,
      numberTokens: config.numberTokens,
      harborTypes: config.harborTypes,
    };
  const large = config.largeBoard;
  return {
    size: "large",
    boardLayout: large.boardLayout,
    regions: [...config.regions, ...large.extraRegions],
    numberTokens: large.numberTokens,
    harborTypes: large.harborTypes,
  };
}
