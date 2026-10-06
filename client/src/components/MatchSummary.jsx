import { useState } from "react";

const HOT = { 6: "hot", 8: "hot", 5: "warm", 9: "warm", 7: "seven" };
// How often each total is expected per 36 rolls, for the faint guide marks.
const WAYS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

// The end of a match: the winner, fun awards from the match, and how the dice fell.
// Everything here was already public at the table; no hand is revealed.
export default function MatchSummary({ game, table }) {
  const [hidden, setHidden] = useState(false);
  const summary = game.summary;
  const winner = game.players.find((player) => player.id === game.winnerId);
  if (!summary || !winner || hidden) return null;
  const name = (id) => game.players.find((player) => player.id === id);
  const dice = Object.entries(summary.dice).map(([total, count]) => [Number(total), count]);
  const rolls = dice.reduce((sum, [, count]) => sum + count, 0);
  const most = Math.max(
    1,
    ...dice.map(([total, count]) => Math.max(count, (rolls * WAYS[total]) / 36)),
  );
  return (
    <section
      className={`match-summary panel ${table ? "on-table" : ""}`}
      style={{ "--player-color": winner.color }}
      aria-label="Match awards"
    >
      <header className="summary-winner">
        <span className="eyebrow">The caravan has a winner</span>
        <strong>{winner.name}</strong>
        <span>{winner.score} points</span>
      </header>
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
                  <em style={{ bottom: `${((rolls * WAYS[total]) / 36 / most) * 100}%` }} />
                </span>
                <span className="dice-total">{total}</span>
              </div>
            ))}
          </div>
        </figure>
      )}
      {!table && (
        <button className="quiet-button" onClick={() => setHidden(true)}>
          See the board
        </button>
      )}
    </section>
  );
}
