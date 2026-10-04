import { useState } from "react";
import ResourceChip from "./ResourceChip";

const LABELS = { wheat: "Wheat", wood: "Wood", stone: "Stone", brick: "Clay", sheep: "Sheep" };
const ORDER = ["knight", "roadBuilding", "yearOfPlenty", "monopoly", "victoryPoint"];
const EFFECTS = {
  knight: "Move the bandit and steal a card. Three knights earn the Largest Army.",
  roadBuilding: "Build two roads for free.",
  yearOfPlenty: "Take any two resources from the bank.",
  monopoly: "Name a resource. Every other player gives you all of theirs.",
  victoryPoint: "Worth one hidden point. It is revealed when it wins you the match.",
};

function ResourceSelect({ resources, value, onChange, label }) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {resources.map((resource) => (
        <option key={resource} value={resource}>
          {LABELS[resource]}
        </option>
      ))}
    </select>
  );
}

// The development cards in a player's own hand, with Play buttons on their turn.
// Phones show the viewer's cards; a shared screen shows the active player's.
// The TV never sees anyone's cards, only the counts on each player card.
export default function DevCardPanel({ game, busy, onAction }) {
  const [choosing, setChoosing] = useState(null);
  const [first, setFirst] = useState("wheat");
  const [second, setSecond] = useState("stone");
  const table = game.viewer?.role === "table";
  const current = game.players[game.currentPlayerIndex];
  const holder =
    game.mode === "online"
      ? game.players.find((player) => player.id === game.viewer?.playerId)
      : current;
  const hints = holder?.id === current?.id ? game.hints || {} : {};
  const playable = hints.devCards?.playable || [];
  const freeRoads = hints.freeRoads || 0;
  if (table || game.phase !== "main" || !holder?.devCards) return null;
  if (!holder.devCards.length && !freeRoads) return null;
  const labels = game.settings.developmentCardLabels || {};
  const resources = game.settings.resources;
  const groups = ORDER.map((type) => {
    const held = holder.devCards.filter((card) => card.type === type);
    return { type, count: held.length, fresh: held.filter((c) => c.boughtTurn === game.turn) };
  }).filter((group) => group.count);
  const play = async (type, extra = {}) => {
    if (await onAction("dev/play", { type, ...extra })) setChoosing(null);
  };

  return (
    <section
      className="dev-panel panel"
      aria-label={`${game.mode === "online" ? "Your" : `${holder.name}'s`} development cards`}
      style={{ "--player-color": holder.color }}
    >
      <span className="eyebrow">
        {game.mode === "online" ? "Your development cards" : `${holder.name}'s development cards`}
      </span>
      {freeRoads > 0 && (
        <p className="dev-note" role="status">
          Road Building: place {freeRoads} free {freeRoads === 1 ? "road" : "roads"} on the glowing
          edges.
        </p>
      )}
      <ul className="dev-cards">
        {groups.map(({ type, count, fresh }) => (
          <li key={type} className={`dev-card dev-${type}`}>
            <span className="dev-card-face" aria-hidden="true">
              {count}
            </span>
            <span className="dev-card-text">
              <b>
                {labels[type] || type}
                {count > 1 ? ` ×${count}` : ""}
              </b>
              <small>
                {EFFECTS[type]}
                {fresh.length && type !== "victoryPoint" && !playable.includes(type)
                  ? " Bought this turn, play it from your next turn."
                  : ""}
              </small>
            </span>
            {playable.includes(type) &&
              (type === "yearOfPlenty" || type === "monopoly" ? (
                <button
                  className="small-action-btn"
                  disabled={busy}
                  aria-expanded={choosing === type}
                  onClick={() => setChoosing(choosing === type ? null : type)}
                >
                  Play
                </button>
              ) : (
                <button className="small-action-btn" disabled={busy} onClick={() => play(type)}>
                  Play
                </button>
              ))}
          </li>
        ))}
      </ul>
      {choosing === "yearOfPlenty" && (
        <div className="trade-row dev-choice">
          <span>Take</span>
          <ResourceChip resource={first} size={14} />
          <ResourceSelect
            resources={resources}
            value={first}
            onChange={setFirst}
            label="First resource"
          />
          <span>and</span>
          <ResourceChip resource={second} size={14} />
          <ResourceSelect
            resources={resources}
            value={second}
            onChange={setSecond}
            label="Second resource"
          />
          <button
            className="small-action-btn"
            disabled={busy}
            onClick={() => play("yearOfPlenty", { resources: [first, second] })}
          >
            Take them
          </button>
        </div>
      )}
      {choosing === "monopoly" && (
        <div className="trade-row dev-choice">
          <span>Collect every</span>
          <ResourceChip resource={first} size={14} />
          <ResourceSelect
            resources={resources}
            value={first}
            onChange={setFirst}
            label="Resource to collect"
          />
          <button
            className="small-action-btn"
            disabled={busy}
            onClick={() => play("monopoly", { resource: first })}
          >
            Collect
          </button>
        </div>
      )}
    </section>
  );
}
