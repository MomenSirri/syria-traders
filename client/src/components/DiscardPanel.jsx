import { useEffect, useState } from "react";
import ResourceChip from "./ResourceChip";

const LABELS = { wheat: "Wheat", wood: "Wood", stone: "Stone", brick: "Clay", sheep: "Sheep" };
// Matches the server's DISCARD_WAIT_MS: after this the roller may hurry a player.
const WAIT_MS = 60000;

// After a seven, each player holding more than seven cards picks which half to
// return. Phones show the viewer's own choice; a shared screen asks each player
// in turn. The TV never sees this panel, only who the table is waiting for.
export default function DiscardPanel({ game, busy, onAction }) {
  const pending = game.pendingDiscards || {};
  const waiting = game.players.filter((player) => pending[player.id] > 0);
  const table = game.viewer?.role === "table";
  const online = game.mode === "online";
  const current = game.players[game.currentPlayerIndex];
  const holder = online
    ? waiting.find((player) => player.id === game.viewer?.playerId)
    : waiting[0];
  const owed = holder ? pending[holder.id] : 0;
  const [chosen, setChosen] = useState({});
  const [now, setNow] = useState(Date.now());
  useEffect(() => setChosen({}), [holder?.id, game.discardsSince]);
  const since = game.discardsSince ? Date.parse(game.discardsSince) : 0;
  const elapsed = now + (game.clockOffset || 0) - since;
  useEffect(() => {
    if (!since || elapsed >= WAIT_MS) return;
    const timer = setTimeout(() => setNow(Date.now()), WAIT_MS - elapsed + 200);
    return () => clearTimeout(timer);
  }, [since, elapsed >= WAIT_MS]);

  if (table || !waiting.length || game.status !== "active") return null;
  const rolling = !online || game.viewer?.playerId === current?.id;
  const others = waiting.filter((player) => player.id !== holder?.id);
  if (!holder && !rolling) return null;
  const total = Object.values(chosen).reduce((sum, amount) => sum + amount, 0);
  const change = (resource, step) =>
    setChosen((current) => {
      const next = Math.max(0, (current[resource] || 0) + step);
      return { ...current, [resource]: Math.min(next, holder.resources[resource]) };
    });

  return (
    <section
      className="discard-panel panel"
      role="dialog"
      aria-label={holder ? `${holder.name}: return ${owed} cards` : "Waiting for discards"}
      style={{ "--player-color": holder?.color }}
    >
      {holder ? (
        <>
          <span className="eyebrow">
            {online
              ? "A seven! Your hand is over seven"
              : `${holder.name}, your hand is over seven`}
          </span>
          <p>
            Choose <b>{owed}</b> cards to return to the bank.
          </p>
          <div className="discard-cards">
            {game.settings.resources
              .filter((resource) => holder.resources[resource] > 0)
              .map((resource) => {
                const picked = chosen[resource] || 0;
                return (
                  <div key={resource} className={`discard-card ${picked ? "picked" : ""}`}>
                    <ResourceChip resource={resource} size={20} />
                    <span>
                      {LABELS[resource]} <small>({holder.resources[resource]})</small>
                    </span>
                    <span className="discard-stepper">
                      <button
                        className="quiet-button"
                        aria-label={`Keep one more ${LABELS[resource]}`}
                        disabled={busy || !picked}
                        onClick={() => change(resource, -1)}
                      >
                        −
                      </button>
                      <b aria-label={`${picked} ${LABELS[resource]} to return`}>{picked}</b>
                      <button
                        className="quiet-button"
                        aria-label={`Return one ${LABELS[resource]}`}
                        disabled={busy || total >= owed || picked >= holder.resources[resource]}
                        onClick={() => change(resource, 1)}
                      >
                        +
                      </button>
                    </span>
                  </div>
                );
              })}
          </div>
          <button
            className="small-action-btn"
            disabled={busy || total !== owed}
            onClick={() => onAction("discard", { playerId: holder.id, cards: chosen })}
          >
            Return {total} of {owed} cards
          </button>
        </>
      ) : (
        <span className="eyebrow">A seven! The bandit waits</span>
      )}
      {others.length > 0 && (
        <ul className="discard-waiting">
          {others.map((player) => (
            <li key={player.id}>
              <span>
                Waiting for <b>{player.name}</b> to return {pending[player.id]} cards.
              </span>
              {rolling && online && (
                <button
                  className="quiet-button"
                  disabled={busy || elapsed < WAIT_MS}
                  title={elapsed < WAIT_MS ? "Available after a minute" : ""}
                  onClick={() =>
                    onAction("discard", { playerId: current.id, forPlayerId: player.id })
                  }
                >
                  Return at random
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
