import AnimatedNumber from "./AnimatedNumber";
import ResourceIcon from "./ResourceIcon";

const LABELS = { wheat: "Wheat", wood: "Wood", stone: "Stone", brick: "Clay", sheep: "Sheep" };

// Phone-first strip of the viewer's own hand, kept beside the action buttons.
export default function SeatHand({ game, gains }) {
  const me = game.players.find((player) => player.id === game.viewer?.playerId);
  if (!me?.resources) return null;
  return (
    <section
      className="seat-hand panel"
      aria-label="Your hand"
      style={{ "--player-color": me.color }}
    >
      <div className="seat-hand-title">
        <span className="eyebrow">Your hand</span>
        <strong>
          {me.score} <small>pts</small>
        </strong>
      </div>
      <div className="seat-hand-cards">
        {game.settings.resources.map((resource) => {
          const gain = gains.find(
            (entry) => entry.playerId === me.id && entry.resource === resource,
          );
          return (
            <span key={resource} className={`seat-card resource-${resource}`}>
              <ResourceIcon resource={resource} size={22} />
              <b>
                <AnimatedNumber value={me.resources[resource]} />
              </b>
              <small>{LABELS[resource]}</small>
              {gain && <em className={gain.fading ? "fading" : ""}>+{gain.amount}</em>}
            </span>
          );
        })}
      </div>
    </section>
  );
}
