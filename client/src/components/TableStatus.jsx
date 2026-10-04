import ResourceIcon from "./ResourceIcon";

const LABELS = { wheat: "Wheat", wood: "Wood", stone: "Stone", brick: "Clay", sheep: "Sheep" };

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
        <span className="eyebrow">
          {winner ? "Match complete" : "Played from each merchant's phone"}
        </span>
        <p>{message}</p>
      </div>
      <div className="table-bank" aria-label="Cards left in the bank">
        <span className="eyebrow">Bank</span>
        {game.settings.resources.map((resource) => (
          <span key={resource} title={`${LABELS[resource]} left in the bank`}>
            <ResourceIcon resource={resource} size={20} />
            <b>{game.bank[resource]}</b>
          </span>
        ))}
      </div>
      <div className="table-hands" aria-label="Cards in each hand">
        <span className="eyebrow">Hands</span>
        {game.players.map((player) => (
          <span key={player.id} style={{ "--player-color": player.color }}>
            <i />
            {player.name} <b>{player.resourceTotal}</b>
          </span>
        ))}
      </div>
    </section>
  );
}
