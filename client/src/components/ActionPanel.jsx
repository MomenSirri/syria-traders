import { useState } from "react";
import ResourceIcon from "./ResourceIcon";

function ActionPanel({
  game,
  currentPlayer,
  selectedAction,
  onSelectAction,
  onRoll,
  onEndTurn,
  onTrade,
  busy,
  soundEnabled,
  onToggleSound,
  selectedSetupVertex,
  onClearSetupVertex,
}) {
  const hints = game.hints || {};
  const [giveResource, setGiveResource] = useState("wood");
  const [getResource, setGetResource] = useState("wheat");

  const canBuildPhase = hints.canEndTurn && !game.winnerId;
  const roadCount = hints.validRoadEdges?.length || 0;
  const villageCount = hints.validVillageVertices?.length || 0;
  const cityCount = hints.validCityVertices?.length || 0;

  function toggleAction(action) {
    if (selectedAction === action) {
      onSelectAction(null);
      return;
    }
    onSelectAction(action);
  }

  function handleTrade(event) {
    event.preventDefault();
    onTrade(giveResource, getResource);
  }

  if (game.phase === "setup-placement") {
    const setupStep = game.setup?.step ?? 0;
    const setupTotal = game.setup?.totalSteps ?? 0;

    return (
      <section className="panel action-panel">
        <h2>Setup Phase</h2>
        <p className="setup-instruction">
          Step {setupStep + 1}/{setupTotal}: <strong>{currentPlayer?.name}</strong> places one village and one road.
        </p>

        <p className="setup-instruction">
          1) Click a highlighted settlement point on the board.
          <br />
          2) Click one highlighted road edge attached to it.
        </p>

        {selectedSetupVertex !== null ? (
          <p className="setup-instruction selected-setup">
            Selected point: #{selectedSetupVertex}
            <button type="button" className="secondary-btn small-btn" onClick={onClearSetupVertex}>
              Clear Selection
            </button>
          </p>
        ) : null}

        <button type="button" className="secondary-btn" onClick={onToggleSound}>
          Sound: {soundEnabled ? "On" : "Off"}
        </button>
      </section>
    );
  }

  return (
    <section className="panel action-panel">
      <h2>Actions</h2>

      <div className="action-grid">
        <button type="button" className="primary-btn" onClick={onRoll} disabled={busy || !hints.canRoll}>
          Roll Dice
        </button>

        <button
          type="button"
          className={`secondary-btn ${selectedAction === "road" ? "selected" : ""}`}
          disabled={busy || !canBuildPhase || roadCount === 0}
          onClick={() => toggleAction("road")}
        >
          Build Road ({roadCount})
        </button>

        <button
          type="button"
          className={`secondary-btn ${selectedAction === "village" ? "selected" : ""}`}
          disabled={busy || !canBuildPhase || villageCount === 0}
          onClick={() => toggleAction("village")}
        >
          Build Village ({villageCount})
        </button>

        <button
          type="button"
          className={`secondary-btn ${selectedAction === "city" ? "selected" : ""}`}
          disabled={busy || !canBuildPhase || cityCount === 0}
          onClick={() => toggleAction("city")}
        >
          Upgrade To City ({cityCount})
        </button>

        <button type="button" className="secondary-btn" onClick={onEndTurn} disabled={busy || !hints.canEndTurn}>
          End Turn
        </button>

        <button type="button" className="secondary-btn" onClick={onToggleSound}>
          Sound: {soundEnabled ? "On" : "Off"}
        </button>
      </div>

      {hints.mustMoveRobber ? (
        <p className="action-note">Bandit move required: click a highlighted tile on the map.</p>
      ) : null}

      <form className="trade-form" onSubmit={handleTrade}>
        <h3>Bank Trade (4:1)</h3>
        <div className="trade-row">
          <label>
            Give
            <select value={giveResource} onChange={(event) => setGiveResource(event.target.value)}>
              {game.settings.resources.map((resource) => (
                <option key={`give-${resource}`} value={resource}>
                  {game.settings.resourceLabels[resource]}
                </option>
              ))}
            </select>
          </label>

          <label>
            Get
            <select value={getResource} onChange={(event) => setGetResource(event.target.value)}>
              {game.settings.resources.map((resource) => (
                <option key={`get-${resource}`} value={resource}>
                  {game.settings.resourceLabels[resource]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button type="submit" className="secondary-btn" disabled={busy || !canBuildPhase || giveResource === getResource}>
          Trade With Bank
        </button>
      </form>

      <div className="cost-list">
        <h3>Build Costs</h3>
        <div className="cost-item">
          <strong>Road:</strong>
          <span>
            <ResourceIcon resource="wood" /> 1
          </span>
          <span>
            <ResourceIcon resource="brick" /> 1
          </span>
        </div>
        <div className="cost-item">
          <strong>Village:</strong>
          <span>
            <ResourceIcon resource="wood" /> 1
          </span>
          <span>
            <ResourceIcon resource="brick" /> 1
          </span>
          <span>
            <ResourceIcon resource="wheat" /> 1
          </span>
          <span>
            <ResourceIcon resource="sheep" /> 1
          </span>
        </div>
        <div className="cost-item">
          <strong>City:</strong>
          <span>
            <ResourceIcon resource="wheat" /> 2
          </span>
          <span>
            <ResourceIcon resource="stone" /> 3
          </span>
        </div>
      </div>
    </section>
  );
}

export default ActionPanel;
