// Moving the bandit takes two steps so a mistaken tap can be changed: tapping a
// territory only previews it, and nothing happens until the player confirms here.
// With several opponents on it, picking whom to rob is the confirmation.
export default function RobberPicker({ game, tileId, busy, onPick, onCancel }) {
  const tile = game.board.tiles[tileId];
  const current = game.players[game.currentPlayerIndex];
  const victims = (game.hints?.robberVictimsByTile?.[tileId] || [])
    .map((id) => game.players.find((player) => player.id === id))
    .filter(Boolean);
  const ownHome = tile?.vertexIds.some((id) => game.board.vertices[id].ownerId === current?.id);
  return (
    <section className="robber-picker panel" role="dialog" aria-label="Confirm the bandit move">
      <span className="eyebrow">Move the bandit to {tile?.region}?</span>
      {ownHome && (
        <p className="robber-warning">
          You have a village or city here too: the bandit will block your own production.
        </p>
      )}
      {victims.length ? (
        <>
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
        </>
      ) : (
        <>
          <p>Nobody on this territory has a card to steal.</p>
          <button className="small-action-btn" disabled={busy} onClick={() => onPick()}>
            Move the bandit here
          </button>
        </>
      )}
      <button className="quiet-button" disabled={busy} onClick={onCancel}>
        Choose another territory
      </button>
    </section>
  );
}
