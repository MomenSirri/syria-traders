import PlayerCard from "./PlayerCard";
export default function Sidebar({ game, resourcePopups = [], playerImages = {} }) {
  const currentId = game.players[game.currentPlayerIndex]?.id;
  return (
    <section className="players-panel panel">
      <div className="section-heading">
        <h2>The merchants</h2>
        <span className="eyebrow">{game.players.length} at the table</span>
      </div>
      <div className={`player-list players-${game.players.length}`}>
        {game.players.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            resources={game.settings.resources}
            image={playerImages[player.id]}
            active={player.id === currentId}
            yours={game.viewer?.playerId === player.id}
            largestArmy={game.largestArmyId === player.id}
            longestRoad={game.longestRoadId === player.id}
            gains={resourcePopups.filter((gain) => gain.playerId === player.id)}
            setupCount={
              game.phase === "setup-placement"
                ? game.setup.placementsByPlayer[player.id] || 0
                : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}
