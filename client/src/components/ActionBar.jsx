import { useState } from "react";
import Icon from "./Icon";
import ResourceChip from "./ResourceChip";

const LABELS = { wheat: "Wheat", wood: "Wood", stone: "Stone", brick: "Clay", sheep: "Sheep" };
const waitingFor = (game) =>
  game.players
    .filter((player) => game.pendingDiscards?.[player.id] > 0)
    .map((player) => player.name)
    .join(" and ");
const BUILDINGS = { road: "Road", village: "Village", city: "City", development: "Card" };

export default function ActionBar({
  game,
  currentPlayer,
  busy,
  myTurn,
  selectedAction,
  onSelectAction,
  onRoll,
  onRollForOrder,
  orderBusy,
  onEndTurn,
  onTrade,
  onBuyCard,
  soundEnabled,
  onToggleSound,
  selectedSetupVertex,
  onClearSetupVertex,
}) {
  const [give, setGive] = useState("wood");
  const [receive, setReceive] = useState("wheat");
  const hints = game.hints || {};
  const rate = hints.tradeRates?.[give] || 4;
  const costText = (building) =>
    Object.entries(game.settings.buildingCosts[building] || {})
      .map(([resource, amount]) => `${amount} ${LABELS[resource]}`)
      .join(", ");
  const soundButton = (
    <button
      className="quiet-button sound-button"
      aria-pressed={soundEnabled}
      onClick={onToggleSound}
    >
      <Icon name={soundEnabled ? "soundOn" : "soundOff"} />
      Sound {soundEnabled ? "on" : "off"}
    </button>
  );
  const costs = (
    <div className="build-cost-inline">
      {Object.entries(game.settings.buildingCosts).map(([building, cost]) => (
        <span key={building}>
          <b>{BUILDINGS[building] || building}</b>
          {Object.entries(cost).map(([resource, amount]) => (
            <span key={resource} title={`${amount} ${resource}`}>
              <ResourceChip resource={resource} size={13} />
              {amount}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
  if (game.phase === "order-roll")
    return (
      <section className="action-bar-panel panel">
        <div className="setup-banner-row">
          <div>
            <span className="eyebrow">Who goes first?</span>
            <p>
              Everyone rolls the dice. The highest roll places the first village and takes the first
              turn.
            </p>
          </div>
          {soundButton}
        </div>
        {game.mode === "online" && game.orderRoll?.waiting.includes(game.viewer?.playerId) && (
          <button
            className="icon-action-btn primary order-roll-bar-button"
            disabled={orderBusy}
            onClick={onRollForOrder}
          >
            <Icon name="roll" />
            Roll the dice
          </button>
        )}
        {costs}
      </section>
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
          {soundButton}
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
          <Icon name="roll" />
          Roll dice
        </button>
        {[
          ["road", "Road", hints.validRoadEdges],
          ["village", "Village", hints.validVillageVertices],
          ["city", "City", hints.validCityVertices],
        ].map(([key, label, positions]) => (
          <button
            key={key}
            className={`icon-action-btn build-btn ${selectedAction === key ? "selected" : ""}`}
            disabled={busy || !positions?.length}
            aria-pressed={selectedAction === key}
            onClick={() => onSelectAction(selectedAction === key ? null : key)}
            title={
              positions?.length
                ? `${label} costs ${costText(key)}. ${positions.length} legal positions.`
                : `${label} costs ${costText(key)}. Roll first, then gather the resources and connect a legal site.`
            }
          >
            <Icon name={key} />
            <span className="btn-text">
              {label}
              <span className="btn-cost" aria-hidden="true">
                {Object.entries(game.settings.buildingCosts[key] || {}).map(
                  ([resource, amount]) => (
                    <span key={resource}>
                      <ResourceChip resource={resource} size={12} />
                      {amount}
                    </span>
                  ),
                )}
              </span>
            </span>
          </button>
        ))}
        <button
          className="icon-action-btn build-btn"
          disabled={busy || !hints.devCards?.canBuy}
          onClick={onBuyCard}
          title={
            game.devDeckCount
              ? `A development card costs ${costText("development")}. ${game.devDeckCount} left in the deck.`
              : "The development deck is empty."
          }
        >
          <Icon name="card" />
          <span className="btn-text">
            Card
            <span className="btn-cost" aria-hidden="true">
              {Object.entries(game.settings.buildingCosts.development || {}).map(
                ([resource, amount]) => (
                  <span key={resource}>
                    <ResourceChip resource={resource} size={12} />
                    {amount}
                  </span>
                ),
              )}
            </span>
          </span>
        </button>
        <button
          className="icon-action-btn end-turn"
          onClick={onEndTurn}
          disabled={busy || !hints.canEndTurn}
        >
          End turn
          <Icon name="end" />
        </button>
        {soundButton}
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
                {LABELS[resource]}
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
                {LABELS[resource]}
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
              : waitingFor(game)
                ? `Waiting for ${waitingFor(game)} to return cards.`
                : game.mustMoveRobber
                  ? "Move the bandit to a different territory."
                  : hints.freeRoads
                    ? `Place ${hints.freeRoads} free ${hints.freeRoads === 1 ? "road" : "roads"}.`
                    : !game.turnHasRolled
                      ? "Roll to start your turn."
                      : "Build, trade, or pass the dice."}
        </span>
      </div>
    </section>
  );
}
