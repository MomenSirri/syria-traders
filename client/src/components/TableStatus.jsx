import ResourceChip from "./ResourceChip";

const LABELS = { wheat: "Wheat", wood: "Wood", stone: "Stone", brick: "Clay", sheep: "Sheep" };
const BUILDINGS = { road: "Road", village: "Village", city: "City", development: "Card" };
const POINTS = { village: "1 pt", city: "2 pts" };
const costText = (cost) =>
  Object.entries(cost)
    .map(([resource, amount]) => `${amount} ${LABELS[resource]}`)
    .join(", ");

// The TV's action area: what the table is waiting for, plus public counts.
export default function TableStatus({ game, currentPlayer }) {
  const winner = game.players.find((player) => player.id === game.winnerId);
  const name = currentPlayer?.name;
  const message = winner
    ? `${winner.name} reaches ${winner.score} points and wins the match.`
    : game.phase === "setup-placement"
      ? `${name} is placing a village and road.`
      : game.mustMoveRobber
        ? `${name} is moving the bandit.`
        : !game.turnHasRolled
          ? `Waiting for ${name} to roll.`
          : `${name} is building and trading.`;
  return (
    <section className="action-bar-panel panel table-status" aria-live="polite">
      <div className="table-status-main" style={{ "--player-color": currentPlayer?.color }}>
        <span className="eyebrow">{winner ? "Match complete" : "Now playing"}</span>
        <p>{message}</p>
      </div>
      <div className="table-bank" aria-label="Cards left in the bank">
        <span className="eyebrow">Bank</span>
        <div className="table-bank-row">
          {game.settings.resources.map((resource) => (
            <span key={resource} title={`${game.bank[resource]} ${LABELS[resource]} left in the bank`}>
              <ResourceChip resource={resource} size={15} />
              <b>{game.bank[resource]}</b>
            </span>
          ))}
        </div>
      </div>
      <div className="table-costs" aria-label="Building costs">
        <span className="eyebrow">Costs</span>
        <ul>
          {Object.entries(game.settings.buildingCosts).map(([building, cost]) => (
            <li
              key={building}
              className="table-cost-row"
              aria-label={`${BUILDINGS[building] || building}: ${costText(cost)}`}
            >
              <b>
                {BUILDINGS[building] || building}
                {POINTS[building] && <em>{POINTS[building]}</em>}
                {building === "development" && game.devDeckCount !== undefined && (
                  <em>{game.devDeckCount} left</em>
                )}
              </b>
              <span className="cost-chips" aria-hidden="true">
                {Object.entries(cost).flatMap(([resource, amount]) =>
                  Array.from({ length: amount }, (_, i) => (
                    <ResourceChip key={`${resource}-${i}`} resource={resource} size={15} />
                  )),
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
