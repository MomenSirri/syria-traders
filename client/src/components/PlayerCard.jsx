import { memo } from "react";
import AnimatedNumber from "./AnimatedNumber";
import ResourceIcon from "./ResourceIcon";
import "../styles/PlayerCard.css";

// Small glyphs for the TV's stat tiles: the same house shapes as the board pieces,
// a road, and a fan of three cards for the hidden hand.
const STAT_ICONS = {
  road: (
    <path d="M5 19 19 5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
  ),
  home: <path d="M5 21V12L12 5l7 7v9Z" fill="currentColor" />,
  city: <path d="M2 21V12l5-5 5 5V9l5-5 5 5v12Z" fill="currentColor" />,
  hand: (
    <g stroke="currentColor" strokeWidth="1.6" fill="#1b4a3a">
      <rect x="3" y="6" width="9" height="13" rx="1.5" transform="rotate(-14 7.5 12.5)" />
      <rect x="12" y="6" width="9" height="13" rx="1.5" transform="rotate(14 16.5 12.5)" />
      <rect x="7.5" y="4" width="9" height="13" rx="1.5" />
    </g>
  ),
};
function StatIcon({ kind }) {
  return (
    <svg className={`stat-icon stat-icon-${kind}`} viewBox="0 0 24 24" aria-hidden="true">
      {STAT_ICONS[kind]}
    </svg>
  );
}

const LABELS = { wheat: "Wheat", wood: "Wood", stone: "Stone", brick: "Clay", sheep: "Sheep" };
export default memo(function PlayerCard({
  player,
  resources,
  image,
  active,
  yours,
  gains,
  setupCount,
  largestArmy,
  longestRoad,
}) {
  const devCount = player.devCardCount ?? player.devCards?.length ?? 0;
  return (
    <article
      className={`player-card ${active ? "active-player" : ""} ${yours ? "your-seat" : ""} ${player.away ? "away-player" : ""}`}
      style={{ "--player-color": player.color }}
      data-player-id={player.id}
      aria-label={`${player.name}${active ? ", active player" : ""}`}
    >
      <header className="player-header">
        <div className="player-avatar">
          {image ? (
            <img src={image} alt={`${player.name}'s portrait`} />
          ) : (
            <span>
              {player.name
                .split(" ")
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase()}
            </span>
          )}
        </div>
        <div className="player-title-block">
          <h3 title={player.name}>{player.name}</h3>
          <span className="player-state">
            {player.away
              ? "Reconnecting..."
              : active
                ? "Playing now"
                : yours
                  ? "Your seat"
                  : "Merchant"}
          </span>
        </div>
        <div className="player-score">
          <strong>{player.score}</strong>
          <span>pts</span>
        </div>
      </header>
      <div className="player-structure-row">
        <span title={`Roads (longest run ${player.longestRoad || 0})`}>
          <span className="stat-label">
            <StatIcon kind="road" />
            Roads
          </span>{" "}
          <b>{player.roads.length}</b>
        </span>
        <span title="Villages">
          <span className="stat-label">
            <StatIcon kind="home" />
            Homes
          </span>{" "}
          <b>{player.villages.length}</b>
        </span>
        <span title="Cities">
          <span className="stat-label">
            <StatIcon kind="city" />
            Cities
          </span>{" "}
          <b>{player.cities.length}</b>
        </span>
        {!player.resources && (
          <span className="structure-hand" title="Resource cards in hand (private)">
            <span className="stat-label">
              <StatIcon kind="hand" />
              Hand
            </span>{" "}
            <b>{player.resourceTotal}</b>
          </span>
        )}
      </div>
      {(devCount > 0 || player.knightsPlayed > 0 || largestArmy || longestRoad) && (
        <div className="player-dev-row">
          <span title="Development cards in hand">
            <i className="dev-mini" aria-hidden="true" />
            Cards <b>{devCount}</b>
          </span>
          <span title="Knights played">
            Knights <b>{player.knightsPlayed || 0}</b>
          </span>
          {largestArmy && (
            <em className="army-badge">
              <span className="badge-long">Largest </span>Army +2
            </em>
          )}
          {longestRoad && (
            <em className="army-badge road-badge">
              <span className="badge-long">Longest </span>Road +2
            </em>
          )}
        </div>
      )}
      {player.resources ? (
        <div className="player-resources">
          {resources.map((resource) => {
            const gain = gains.find((entry) => entry.resource === resource);
            return (
              <div className="resource-row" key={resource}>
                <div className={`resource-icon-cell resource-${resource}`}>
                  <ResourceIcon resource={resource} size={20} />
                </div>
                <span className="resource-name-cell">{LABELS[resource]}</span>
                <div className="resource-amount-cell">
                  <strong>
                    <AnimatedNumber value={player.resources[resource]} />
                  </strong>
                  {gain && (
                    <span
                      key={gain.at}
                      role="status"
                      aria-label={`Gained ${gain.amount} ${LABELS[resource]}`}
                      className={`resource-popup ${gain.fading ? "resource-popup-fading" : ""}`}
                    >
                      <span>+{gain.amount}</span>
                      <ResourceIcon resource={resource} size={14} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="private-hand">
          <div className="card-fan">
            <i />
            <i />
            <i />
          </div>
          <strong>
            {player.resourceTotal} {player.resourceTotal === 1 ? "card" : "cards"}
          </strong>
          <span>Private resource hand</span>
        </div>
      )}
      <footer className="player-card-footer">
        <span>
          {setupCount !== undefined
            ? `${setupCount}/2 starting homes`
            : `${Math.max(0, 10 - player.score)} points to victory`}
        </span>
        <div className="score-track">
          <i style={{ width: `${Math.min(100, player.score * 10)}%` }} />
        </div>
      </footer>
    </article>
  );
});
