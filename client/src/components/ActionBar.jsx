import { useState } from "react";
import ResourceIcon from "./ResourceIcon";

function ActionIcon({ kind }) {
  const paths = {
    road: "M4 20L10 4h4l6 16M12 5v3m0 3v3m0 3v3",
    village: "M3 11l9-8 9 8M6 9v12h12V9M10 21v-7h4v7",
    city: "M3 21V9h7v12M10 21V3h11v18M13 7h5m-5 4h5m-5 4h5",
    roll: "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2M8 8h.01M16 16h.01M12 12h.01",
    end: "M4 12h16m-6-6 6 6-6 6",
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
export default function ActionBar({
  game,
  currentPlayer,
  busy,
  myTurn,
  selectedAction,
  onSelectAction,
  onRoll,
  onEndTurn,
  onTrade,
  soundEnabled,
  onToggleSound,
  selectedSetupVertex,
  onClearSetupVertex,
}) {
  const [give, setGive] = useState("wood");
  const [receive, setReceive] = useState("wheat");
  const hints = game.hints || {};
  const rate = hints.tradeRates?.[give] || 4;
  const costs = (
    <div className="build-cost-inline">
      {Object.entries(game.settings.buildingCosts).map(([building, cost]) => (
        <span key={building}>
          <b>{building}</b>
          {Object.entries(cost).map(([resource, amount]) => (
            <span key={resource} title={`${amount} ${resource}`}>
              <ResourceIcon resource={resource} size={15} />
              {amount}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
  if (game.phase === "setup-placement")
    return (
      <section className="action-bar-panel panel">
        <div className="setup-banner-row">
          <div>
            <span className="eyebrow">Establish your first routes</span>
            <p>
              <strong>{currentPlayer.name}</strong>:{" "}
              {myTurn
                ? selectedSetupVertex === null
                  ? "choose a glowing village site."
                  : "choose a road beside your selected site."
                : "is placing a village and road."}
            </p>
          </div>
          {selectedSetupVertex !== null && (
            <button className="secondary-btn" disabled={busy} onClick={onClearSetupVertex}>
              Change site
            </button>
          )}
          <button className="quiet-button" onClick={onToggleSound}>
            Sound {soundEnabled ? "on" : "off"}
          </button>
        </div>
        {costs}
      </section>
    );
  return (
    <section className="action-bar-panel panel">
      <div className="action-button-row">
        <button
          className="icon-action-btn primary"
          onClick={onRoll}
          disabled={busy || !hints.canRoll}
        >
          <ActionIcon kind="roll" />
          Roll dice
        </button>
        {[
          ["road", "Road", hints.validRoadEdges],
          ["village", "Village", hints.validVillageVertices],
          ["city", "City", hints.validCityVertices],
        ].map(([key, label, positions]) => (
          <button
            key={key}
            className={`icon-action-btn ${selectedAction === key ? "selected" : ""}`}
            disabled={busy || !positions?.length}
            onClick={() => onSelectAction(selectedAction === key ? null : key)}
            title={
              positions?.length
                ? `${positions.length} legal positions`
                : "Roll first, then gather the required resources and connect a legal site."
            }
          >
            <ActionIcon kind={key} />
            {label}
          </button>
        ))}
        <button
          className="icon-action-btn end-turn"
          onClick={onEndTurn}
          disabled={busy || !hints.canEndTurn}
        >
          End turn
          <ActionIcon kind="end" />
        </button>
        <button className="quiet-button sound-button" onClick={onToggleSound}>
          Sound {soundEnabled ? "on" : "off"}
        </button>
      </div>
      <div className="action-lower-row">
        <div className="inline-trade">
          <b>Bank {rate}:1</b>
          <select
            aria-label="Resource to give"
            value={give}
            onChange={(event) => setGive(event.target.value)}
          >
            {game.settings.resources.map((resource) => (
              <option key={resource} value={resource}>
                {resource}
              </option>
            ))}
          </select>
          <span>for</span>
          <select
            aria-label="Resource to receive"
            value={receive}
            onChange={(event) => setReceive(event.target.value)}
          >
            {game.settings.resources.map((resource) => (
              <option key={resource} value={resource}>
                {resource}
              </option>
            ))}
          </select>
          <button
            className="small-action-btn"
            disabled={
              busy ||
              !hints.canEndTurn ||
              give === receive ||
              (currentPlayer.resources?.[give] || 0) < rate ||
              !game.bank[receive]
            }
            onClick={() => onTrade(give, receive)}
          >
            Trade
          </button>
        </div>
        <span className="action-note">
          {game.winnerId
            ? "The match is complete."
            : !myTurn
              ? `Waiting for ${currentPlayer.name}`
              : game.mustMoveRobber
                ? "Move the bandit to a different territory."
                : !game.turnHasRolled
                  ? "Roll to start your turn."
                  : "Build, trade, or pass the dice."}
        </span>
      </div>
      {costs}
    </section>
  );
}
