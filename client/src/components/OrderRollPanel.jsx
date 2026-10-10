import { useEffect, useState } from "react";
import DiceDisplay from "./DiceDisplay";

// Matches the server's ORDER_ROLL_WAIT_MS: after this anyone may roll for a slow player.
const WAIT_MS = 30000;
const PLACES = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

// Before the first village, everyone rolls: the highest roll goes first. Every
// screen shows the rolls; phones roll their own dice, a shared screen rolls for
// each player, and the TV only watches.
export default function OrderRollPanel({ game, busy, onAction }) {
  const roll = game.orderRoll;
  const [now, setNow] = useState(Date.now());
  const since = roll?.since ? Date.parse(roll.since) : 0;
  const elapsed = now + (game.clockOffset || 0) - since;
  useEffect(() => {
    if (!since || elapsed >= WAIT_MS) return;
    const timer = setTimeout(() => setNow(Date.now()), WAIT_MS - elapsed + 200);
    return () => clearTimeout(timer);
  }, [since, elapsed >= WAIT_MS]);
  if (game.phase !== "order-roll" || !roll) return null;

  const table = game.viewer?.role === "table";
  const online = game.mode === "online";
  const me = game.viewer?.playerId;
  const waiting = new Set(roll.waiting);
  // A settled player's place: everyone in the groups ahead of them goes first.
  const place = {};
  const tied = {};
  let ahead = 0;
  for (const group of roll.groups) {
    if (group.length === 1) place[group[0]] = ahead;
    // A smaller group than the whole table is a tie being rolled off.
    else if (group.length < game.players.length) group.forEach((id) => (tied[id] = true));
    ahead += group.length;
  }
  const mine = online && waiting.has(me);
  const players = [...game.players].sort((a, b) => (place[a.id] ?? 9) - (place[b.id] ?? 9));

  return (
    <section
      className={`order-roll-panel panel ${table ? "order-roll-tv" : ""}`}
      aria-label="Rolling for turn order"
    >
      <span className="eyebrow">Who goes first?</span>
      <p>Everyone rolls the dice. The highest roll places first and plays first.</p>
      <ul className="order-roll-list">
        {players.map((player) => {
          const pair = roll.rolls[player.id];
          const settled = place[player.id] !== undefined;
          const waits = waiting.has(player.id);
          // A shared screen rolls for everyone; a phone may help a slow player after a wait.
          const canHelp = !table && waits && (!online || (player.id !== me && elapsed >= WAIT_MS));
          return (
            <li
              key={player.id}
              className={`order-roll-row ${settled ? "settled" : ""} ${roll.last?.playerId === player.id ? "latest" : ""}`}
              style={{ "--player-color": player.color }}
            >
              <span className="order-roll-place">{settled ? PLACES[place[player.id]] : ""}</span>
              <span className="order-roll-name">
                {player.name}
                {online && player.id === me ? " (you)" : ""}
              </span>
              {pair ? (
                <DiceDisplay pair={pair} />
              ) : (
                <span className="order-roll-wait">
                  {tied[player.id] ? "Tied: roll again" : "Waiting to roll"}
                </span>
              )}
              {canHelp && (
                <button
                  className={online ? "quiet-button" : "small-action-btn"}
                  disabled={busy}
                  onClick={() => onAction("order/roll", { forPlayerId: player.id })}
                >
                  Roll for {player.name}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {mine && (
        <button
          className="primary-btn order-roll-button"
          disabled={busy}
          onClick={() => onAction("order/roll", {})}
        >
          Roll the dice
        </button>
      )}
    </section>
  );
}
