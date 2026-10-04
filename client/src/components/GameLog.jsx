function GameLog({ log }) {
  const entries = [...log].reverse();

  return (
    <section className="panel log-panel">
      <h2>Game Log</h2>
      <ul className="log-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <span className={`log-tag log-${entry.type}`}>{entry.type}</span>
            <span className="log-message">{entry.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default GameLog;
