import { useState } from "react";
import ResourceIcon from "./ResourceIcon";

const LABELS = { wheat: "Wheat", wood: "Wood", stone: "Stone", brick: "Clay", sheep: "Sheep" };
const cards = ({ resource, amount }) => (
  <span className="trade-cards">
    <ResourceIcon resource={resource} size={16} />
    {amount} {LABELS[resource]}
  </span>
);

function Picker({ resources, value, onChange, exclude, label }) {
  return (
    <span className="trade-picker">
      <select
        aria-label={`${label} amount`}
        value={value.amount}
        onChange={(event) => onChange({ ...value, amount: Number(event.target.value) })}
      >
        {[1, 2, 3, 4].map((amount) => (
          <option key={amount}>{amount}</option>
        ))}
      </select>
      <select
        aria-label={`${label} resource`}
        value={value.resource}
        onChange={(event) => onChange({ ...value, resource: event.target.value })}
      >
        {resources
          .filter((resource) => resource !== exclude)
          .map((resource) => (
            <option key={resource} value={resource}>
              {LABELS[resource]}
            </option>
          ))}
      </select>
    </span>
  );
}

// Trading between players. The active player asks, others offer from their
// phones, and the active player accepts one. The TV shows it read-only.
export default function TradePanel({ game, busy, onAction }) {
  const resources = game.settings.resources;
  const trade = game.trade;
  const viewerId = game.viewer?.playerId;
  const table = game.viewer?.role === "table";
  const current = game.players[game.currentPlayerIndex];
  const me = game.players.find((player) => player.id === viewerId);
  const asking = viewerId && viewerId === current?.id;
  const canAsk =
    asking && game.phase === "main" && game.turnHasRolled && !game.mustMoveRobber && !game.winnerId;
  const [want, setWant] = useState({ resource: "wood", amount: 1 });
  const [ask, setAsk] = useState({ resource: "sheep", amount: 1 });
  const name = (id) => game.players.find((player) => player.id === id)?.name || "A player";

  if (game.mode !== "online" || game.phase !== "main" || (!trade && !canAsk)) return null;
  if (!trade)
    return (
      <section className="trade-panel panel" aria-label="Trade with players">
        <span className="eyebrow">Trade with players</span>
        <div className="trade-row">
          <span>Ask for</span>
          <Picker resources={resources} value={want} onChange={setWant} label="Wanted" />
          <button
            className="small-action-btn"
            disabled={busy}
            onClick={() => onAction("trade/request", want)}
          >
            Ask players
          </button>
        </div>
      </section>
    );

  const mine = trade.offers.find((offer) => offer.playerId === viewerId);
  const giveResource = trade.want.resource;
  const canGive = (me?.resources?.[giveResource] || 0) >= trade.want.amount;
  const offerAsk =
    ask.resource === giveResource
      ? { ...ask, resource: resources.find((r) => r !== giveResource) }
      : ask;
  return (
    <section className="trade-panel panel" aria-label="Trade with players" aria-live="polite">
      <span className="eyebrow">Trade with players</span>
      <p className="trade-request">
        <strong>{asking ? "You ask" : `${name(trade.playerId)} asks`}</strong> for{" "}
        {cards(trade.want)}
      </p>
      {trade.offers.length ? (
        <ul className="trade-offers">
          {trade.offers.map((offer) => {
            const affordable = (me?.resources?.[offer.ask.resource] || 0) >= offer.ask.amount;
            return (
              <li key={offer.id}>
                <span>
                  <b>{offer.playerId === viewerId ? "You" : name(offer.playerId)}</b>{" "}
                  {offer.playerId === viewerId ? "give" : "gives"} {cards(trade.want)} for{" "}
                  {cards(offer.ask)}
                </span>
                {asking && (
                  <span className="trade-buttons">
                    <button
                      className="small-action-btn"
                      disabled={busy || !affordable}
                      title={
                        affordable
                          ? ""
                          : `You need ${offer.ask.amount} ${LABELS[offer.ask.resource]}`
                      }
                      onClick={() => onAction("trade/accept", { offerId: offer.id })}
                    >
                      Accept
                    </button>
                    <button
                      className="quiet-button"
                      disabled={busy}
                      onClick={() => onAction("trade/decline", { offerId: offer.id })}
                    >
                      Decline
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">{asking || table ? "Waiting for offers..." : "No offers yet."}</p>
      )}
      {asking && (
        <button className="quiet-button" disabled={busy} onClick={() => onAction("trade/cancel")}>
          Close request
        </button>
      )}
      {!asking && !table && me && (
        <div className="trade-row">
          {mine ? (
            <button
              className="quiet-button"
              disabled={busy}
              onClick={() => onAction("trade/withdraw", { requestId: trade.id })}
            >
              Withdraw my offer
            </button>
          ) : canGive ? (
            <>
              <span>Give {cards(trade.want)} for</span>
              <Picker
                resources={resources}
                value={offerAsk}
                onChange={setAsk}
                exclude={giveResource}
                label="Asked"
              />
              <button
                className="small-action-btn"
                disabled={busy}
                onClick={() => onAction("trade/offer", { requestId: trade.id, ...offerAsk })}
              >
                Offer
              </button>
            </>
          ) : (
            <span className="muted">
              You need {trade.want.amount} {LABELS[giveResource]} to make an offer.
            </span>
          )}
        </div>
      )}
    </section>
  );
}
