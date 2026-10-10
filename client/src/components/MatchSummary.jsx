import { useEffect, useLayoutEffect, useRef, useState } from "react";

const HOT = { 6: "hot", 8: "hot", 5: "warm", 9: "warm", 7: "seven" };
// How often each total is expected per 36 rolls, for the faint guide marks.
const WAYS = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

// The end of a match: the winner, fun awards from the match, and how the dice fell.
// Everything here was already public at the table; no hand is revealed.
// It waits a few seconds so the victory finale on the map has the stage first.
export const FINALE_MS = 7000;
// The match in numbers, one column per public count.
const COLUMNS = [
  ["score", "Points"],
  ["roads", "Roads"],
  ["villages", "Homes"],
  ["cities", "Cities"],
  ["diceCards", "Dice cards"],
  ["trades", "Trades"],
  ["steals", "Steals"],
  ["knights", "Knights"],
];
export default function MatchSummary({ game, table }) {
  const [hidden, setHidden] = useState(false);
  const [waiting, setWaiting] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setWaiting(false), FINALE_MS);
    return () => clearTimeout(timer);
  }, []);
  // A TV can't scroll: shrink the whole summary until it fits the screen.
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!table || waiting) return undefined;
    const fit = () => {
      const panel = ref.current;
      if (!panel) return;
      const fixed = getComputedStyle(panel).position === "fixed";
      const room =
        (fixed ? window.innerHeight : panel.offsetParent?.clientHeight || window.innerHeight) *
        0.96;
      panel.style.maxHeight = "none";
      panel.style.zoom = 1;
      panel.style.zoom = Math.min(1, room / panel.scrollHeight);
    };
    fit();
    const later = setTimeout(fit, 1200);
    window.addEventListener("resize", fit);
    return () => {
      clearTimeout(later);
      window.removeEventListener("resize", fit);
    };
  }, [table, waiting]);
  const summary = game.summary;
  const winner = game.players.find((player) => player.id === game.winnerId);
  if (!summary || !winner || hidden || waiting) return null;
  const name = (id) => game.players.find((player) => player.id === id);
  const dice = Object.entries(summary.dice).map(([total, count]) => [Number(total), count]);
  const rolls = dice.reduce((sum, [, count]) => sum + count, 0);
  const rows = summary.players || [];
  const best = Object.fromEntries(
    COLUMNS.map(([key]) => [key, Math.max(0, ...rows.map((row) => row[key] || 0))]),
  );
  const most = Math.max(
    1,
    ...dice.map(([total, count]) => Math.max(count, (rolls * WAYS[total]) / 36)),
  );
  return (
    <section
      ref={ref}
      className={`match-summary panel ${table ? "on-table" : ""}`}
      style={{ "--player-color": winner.color }}
      aria-label="Match awards"
    >
      <header className="summary-winner">
        <span className="eyebrow">The caravan has a winner</span>
        <strong>{winner.name}</strong>
        <span>{winner.score} points</span>
        {summary.turns > 0 && (
          <small>
            {summary.turns} turns · {rolls} rolls
          </small>
        )}
      </header>
      {rows.length > 0 && (
        <div className="summary-table">
          <span className="eyebrow">The match in numbers</span>
          <table>
            <thead>
              <tr>
                <th scope="col">Merchant</th>
                {COLUMNS.map(([key, label]) => (
                  <th key={key} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.playerId} style={{ "--player-color": name(row.playerId)?.color }}>
                  <th scope="row">
                    <i className="summary-rank">{index + 1}</i>
                    {name(row.playerId)?.name}
                  </th>
                  {COLUMNS.map(([key]) => (
                    <td key={key} className={row[key] && row[key] === best[key] ? "best" : ""}>
                      {row[key] || 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="summary-columns">
        {summary.awards.length > 0 && (
          <ul className="summary-awards">
            {summary.awards.map((award) => (
              <li key={award.key} className={`award-${award.key}`}>
                <span className="eyebrow">{award.title}</span>
                <b>
                  {award.playerIds.map((id) => (
                    <span key={id} style={{ "--player-color": name(id)?.color }}>
                      {name(id)?.name}
                    </span>
                  ))}
                </b>
                <small>
                  {award.value} {award.unit}
                </small>
              </li>
            ))}
          </ul>
        )}
        {rolls > 0 && (
          <figure className="summary-dice">
            <figcaption>
              <span className="eyebrow">How the dice fell</span>
              <small>{rolls} rolls · the faint line is a fair-dice average</small>
            </figcaption>
            <div className="dice-bars" role="img" aria-label="Rolls for each total">
              {dice.map(([total, count]) => (
                <div key={total} className={`dice-bar ${HOT[total] || ""}`}>
                  <b>{count}</b>
                  <span className="dice-track">
                    <i style={{ height: `${(count / most) * 100}%` }} />
                    <em
                      style={{
                        bottom: `${((rolls * WAYS[total]) / 36 / most) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="dice-total">{total}</span>
                </div>
              ))}
            </div>
          </figure>
        )}
      </div>
      {!table && (
        <button className="quiet-button" onClick={() => setHidden(true)}>
          See the board
        </button>
      )}
    </section>
  );
}
