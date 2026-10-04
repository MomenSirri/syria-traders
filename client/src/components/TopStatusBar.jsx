import DiceDisplay from "./DiceDisplay";

function TopStatusBar({ game, currentPlayer, rolling, onNewGame }) {
  const winner = game.players.find((player) => player.id === game.winnerId);
  const setupMode = game.phase === "setup-placement";

  return (
    <section className="top-status-bar">
      <div className="status-chip">
        <span className="status-label">Phase</span>
        <strong>{setupMode ? "Setup Placement" : "Main Match"}</strong>
      </div>

      <div className="status-chip active-chip">
        <span className="status-label">Active Player</span>
        <strong style={{ color: currentPlayer?.color }}>{currentPlayer?.name || "-"}</strong>
      </div>

      <div className="status-chip">
        <span className="status-label">Turn</span>
        <strong>{game.turn || 0}</strong>
      </div>

      <div className="status-chip dice-chip">
        <span className="status-label">Dice</span>
        <DiceDisplay pair={game.lastDicePair} rolling={rolling} />
      </div>

      <div className="status-chip">
        <span className="status-label">Goal</span>
        <strong>{game.settings.winPoints} points</strong>
      </div>

      <div className="status-chip">
        <span className="status-label">Result</span>
        <strong>{winner ? `${winner.name} won` : "In progress"}</strong>
      </div>

      <button type="button" className="new-game-btn" onClick={onNewGame}>
        New Match
      </button>
    </section>
  );
}

export default TopStatusBar;
