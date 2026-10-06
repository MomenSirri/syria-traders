import { useState } from "react";
import ResourceChip from "./ResourceChip";

const LABELS = { wheat: "Wheat", wood: "Wood", stone: "Stone", brick: "Clay", sheep: "Sheep" };
const cards = ({ resource, amount }) => (
  <span className="trade-cards">
    <ResourceChip resource={resource} size={14} />
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

// "Anyone have...?" requests from players waiting for their turn. Whoever is
// playing can take one with a single tap; its owner can take it back.
function Wishes({ game, busy, onAction, canTrade }) {
  const resources = game.settings.resources;
  const viewerId = game.viewer?.playerId;
  const table = game.viewer?.role === "table";
  const current = game.players[game.currentPlayerIndex];
  const me = game.players.find((player) => player.id === viewerId);
  const playing = viewerId && viewerId === current?.id;
  const wishes = game.wishes || [];
  const mine = wishes.find((wish) => wish.playerId === viewerId);
  const canWish = me && !table && !playing && game.status === "active";
  const [composing, setComposing] = useState(false);
  const [want, setWant] = useState({ resource: "wheat", amount: 1 });
  const [give, setGive] = useState({ resource: "brick", amount: 1 });
  const name = (id) => game.players.find((player) => player.id === id)?.name || "A player";
  if (!wishes.length && !canWish) return null;
  const offer =
    give.resource === want.resource
      ? { ...give, resource: resources.find((r) => r !== want.resource) }
      : give;
  const hasGive = (me?.resources?.[offer.resource] || 0) >= offer.amount;
  return (
    <div className="wish-section">
      {wishes.length > 0 && <span className="eyebrow">Anyone have...?</span>}
      {wishes.length > 0 && (
        <ul className="trade-offers wish-list">
          {wishes.map((wish) => {
            const own = wish.playerId === viewerId;
            const affordable = (me?.resources?.[wish.want.resource] || 0) >= wish.want.amount;
            return (
              <li key={wish.id}>
                <span>
                  <b>{own ? "You" : name(wish.playerId)}</b> {own ? "need" : "needs"}{" "}
                  {cards(wish.want)}, {own ? "give" : "gives"} {cards(wish.give)}
                </span>
                {playing && (
                  <button
                    className="small-action-btn"
                    disabled={busy || !canTrade || !affordable}
                    title={
                      !canTrade
                        ? "Roll first"
                        : affordable
                          ? ""
                          : `You need ${wish.want.amount} ${LABELS[wish.want.resource]}`
                    }
                    onClick={() => onAction("wish/accept", { wishId: wish.id })}
                  >
                    Give it
                  </button>
                )}
                {own && (
                  <button
                    className="quiet-button"
                    disabled={busy}
                    onClick={() => onAction("wish/withdraw")}
                  >
                    Take back
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canWish &&
        !mine &&
        (composing ? (
          <div className="trade-row wish-compose">
            <span>I need</span>
            <Picker resources={resources} value={want} onChange={setWant} label="Needed" />
            <span>for my</span>
            <Picker
              resources={resources}
              value={offer}
              onChange={setGive}
              exclude={want.resource}
              label="Given"
            />
            <button
              className="small-action-btn"
              disabled={busy || !hasGive}
              title={hasGive ? "" : `You need ${offer.amount} ${LABELS[offer.resource]}`}
              onClick={async () => {
                if (await onAction("wish/post", { want, give: offer })) setComposing(false);
              }}
            >
              Ask everyone
            </button>
            <button className="quiet-button" onClick={() => setComposing(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="quiet-button wish-open" onClick={() => setComposing(true)}>
            Anyone have a card I need?
          </button>
        ))}
    </div>
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

  const waiting = me && !table && !asking && game.status === "active";
  if (game.mode !== "online" || game.phase !== "main") return null;
  if (!trade && !canAsk && !game.wishes?.length && !waiting) return null;
  const wishes = <Wishes game={game} busy={busy} onAction={onAction} canTrade={canAsk} />;
  if (!trade)
    return (
      <section className="trade-panel panel" aria-label="Trade with players">
        <span className="eyebrow">Trade with players</span>
        {canAsk && (
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
        )}
        {wishes}
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
      {wishes}
    </section>
  );
}
