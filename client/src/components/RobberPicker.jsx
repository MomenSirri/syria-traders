// After moving the bandit onto a territory with several opponents, the roller
// picks whom to rob. Cards are drawn at random, so only hand sizes are shown.
export default function RobberPicker({ game, tileId, busy, onPick, onCancel }) {
  const tile = game.board.tiles[tileId];
  const victims = (game.hints?.robberVictimsByTile?.[tileId] || [])
    .map((id) => game.players.find((player) => player.id === id))
    .filter(Boolean);
  return (
    <section className="robber-picker panel" role="dialog" aria-label="Choose who to rob">
      <span className="eyebrow">Bandit on {tile?.region}</span>
      <p>Take one random card from:</p>
      <div className="robber-victims">
        {victims.map((player) => {
          const cards = player.resourceTotal ?? 0;
          return (
            <button
              key={player.id}
              className="robber-victim"
              style={{ "--player-color": player.color }}
              disabled={busy}
              onClick={() => onPick(player.id)}
            >
              <b>{player.name}</b>
              <small>
                {cards} {cards === 1 ? "card" : "cards"}
              </small>
            </button>
          );
        })}
      </div>
      <button className="quiet-button" disabled={busy} onClick={onCancel}>
        Choose another territory
      </button>
    </section>
  );
}
