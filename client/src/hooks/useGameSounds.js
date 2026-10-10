import { useEffect, useRef } from "react";
import { playTableSound, unlockAudio } from "../utils/sound";

const FRESH_MS = 4000;
const pieces = (game) =>
  game.players.reduce(
    (sum, player) => sum + player.roads.length + player.villages.length + player.cities.length,
    0,
  );

// Plays a sound for what just happened at the table: dice, payouts, a seven, a
// steal, trades, builds, cards, awards, the win and reactions. It compares each
// new state with the last one, so loading or reconnecting stays quiet.
export default function useGameSounds(game, reactions, enabled) {
  const last = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    unlockAudio();
    window.addEventListener("keydown", unlockAudio);
    window.addEventListener("pointerdown", unlockAudio);
    return () => {
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("pointerdown", unlockAudio);
    };
  }, [enabled]);

  useEffect(() => {
    if (!game) {
      last.current = null;
      return;
    }
    const before = last.current;
    const now = {
      id: game.id,
      flashId: game.visuals?.flashId,
      pieces: pieces(game),
      longestRoadId: game.longestRoadId,
      largestArmyId: game.largestArmyId,
      winnerId: game.winnerId,
      turn: game.turn,
    };
    last.current = now;
    if (!enabled || !before || before.id !== now.id) return;
    if (now.winnerId && !before.winnerId) return playTableSound("win");

    const visuals = game.visuals;
    const fresh =
      visuals && Date.now() + (game.clockOffset || 0) - Date.parse(visuals.at) < FRESH_MS;
    if (fresh && now.flashId !== before.flashId) {
      const kind = visuals.kind;
      if (kind === "order-roll") playTableSound("dice");
      else if (kind === "roll") {
        playTableSound("dice");
        if (visuals.resourceDeltas?.length || visuals.producingTileIds?.length)
          playTableSound("coins", 650);
      } else if (kind === "seven") {
        playTableSound("dice");
        playTableSound("seven", 500);
      } else if (kind === "steal") playTableSound("steal");
      else if (kind === "trade") playTableSound("trade");
      else if (kind === "devbuy") playTableSound("card");
      else if (kind === "devplay") playTableSound(visuals.card === "knight" ? "knight" : "card");
    }
    if (now.pieces > before.pieces) playTableSound("build");
    const award =
      (now.longestRoadId && now.longestRoadId !== before.longestRoadId) ||
      (now.largestArmyId && now.largestArmyId !== before.largestArmyId);
    if (award) playTableSound("award", 450);
    if (now.turn !== before.turn && game.phase === "main") playTableSound("turn", 200);
  }, [game, enabled]);

  const newest = reactions.at(-1)?.id;
  useEffect(() => {
    if (newest && enabled) playTableSound("pop");
  }, [newest]);
}
