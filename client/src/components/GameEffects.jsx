import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ResourceIcon from "./ResourceIcon";
import ResourceChip from "./ResourceChip";
import DiceDisplay from "./DiceDisplay";

const RESOURCE_LABELS = {
  wheat: "Wheat",
  wood: "Wood",
  stone: "Stone",
  brick: "Clay",
  sheep: "Sheep",
};
const FRESH_MS = 4000;
const FLIGHT_MS = 1200;
const BURST_MS = 3200;
const TOAST_MS = 3800;
let nextId = 0;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const centerOf = (element) => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, box };
};
// The visible card for a player: the phone's hand strip if shown, else the player card.
function targetFor(playerId) {
  const candidates = document.querySelectorAll(`[data-player-id="${playerId}"]`);
  return [...candidates].find((element) => element.getClientRects().length) || null;
}

// Short-lived animations: cards flying from tiles (or a trade partner) to players,
// gain bursts, a big dice roll and event toasts on the TV. Nothing here persists.
export default function GameEffects({ game, table }) {
  const [flights, setFlights] = useState([]);
  const [bursts, setBursts] = useState([]);
  const [dice, setDice] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [cardFlight, setCardFlight] = useState(null);
  const [cardPlay, setCardPlay] = useState(null);
  const lastLog = useRef(null);
  const timers = useRef([]);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const visuals = game.visuals;
  useEffect(() => {
    if (!visuals || Date.now() + (game.clockOffset || 0) - Date.parse(visuals.at) > FRESH_MS)
      return;
    if (table && ["roll", "seven", "order-roll"].includes(visuals.kind) && game.lastDicePair) {
      const roller = game.players.find((entry) => entry.id === visuals.playerId);
      const roll = {
        id: nextId++,
        pair: game.lastDicePair,
        seven: visuals.kind === "seven",
        // The opening rolls for turn order name who rolled; a 7 there is just a number.
        who: visuals.kind === "order-roll" ? roller : null,
      };
      setDice(roll);
      later(() => setDice((current) => (current?.id === roll.id ? null : current)), 2200);
    }
    const player = game.players.find((entry) => entry.id === visuals.playerId);
    if (table && visuals.kind === "devplay" && player) {
      const play = {
        id: nextId++,
        name: player.name,
        color: player.color,
        card: visuals.card,
        label: game.settings.developmentCardLabels?.[visuals.card] || "a card",
      };
      setCardPlay(play);
      later(() => setCardPlay((current) => (current?.id === play.id ? null : current)), 2600);
    }
    // A stolen card is named only to the thief and the victim.
    const stolen = visuals.kind === "steal" && visuals.resourceDeltas?.[0];
    if (!table && stolen && player) {
      const victim = game.players.find((entry) => entry.id === visuals.fromPlayerId);
      const label = RESOURCE_LABELS[stolen.resource];
      const viewerId = game.viewer?.playerId;
      const message =
        viewerId === player.id
          ? `You stole 1 ${label} from ${victim?.name}.`
          : viewerId === victim?.id
            ? `${player.name} stole your ${label}.`
            : `${player.name} stole 1 ${label} from ${victim?.name}.`;
      const toast = { id: `steal-${visuals.flashId}`, type: "steal", message };
      setToasts((current) => [...current, toast].slice(-2));
      later(() => setToasts((current) => current.filter((entry) => entry !== toast)), TOAST_MS);
    }
    // Wait a frame so freshly rendered cards and tiles have their final positions.
    const frame = requestAnimationFrame(() => {
      // A bought card flies face down from the deck to its new owner; a stolen one
      // flies face down from the victim to the thief for everyone who can't see it.
      const owner =
        (visuals.kind === "devbuy" || (visuals.kind === "steal" && !stolen)) &&
        player &&
        targetFor(player.id);
      const deck =
        visuals.kind === "steal"
          ? targetFor(visuals.fromPlayerId)
          : document.querySelector(".board-stage");
      if (owner && deck && !reducedMotion()) {
        const start = centerOf(deck);
        const end = centerOf(owner);
        const flight = {
          id: nextId++,
          color: player.color,
          x: start.x,
          y: start.y,
          dx: end.x - start.x,
          dy: end.y - start.y,
        };
        setCardFlight(flight);
        later(
          () => setCardFlight((current) => (current?.id === flight.id ? null : current)),
          FLIGHT_MS + 300,
        );
      }
      const newFlights = [];
      const newBursts = [];
      const perPlayer = {};
      for (const delta of visuals.resourceDeltas || []) {
        const target = targetFor(delta.playerId);
        if (!target) continue;
        const end = centerOf(target);
        const sources = (
          delta.fromPlayerId
            ? [targetFor(delta.fromPlayerId)]
            : (delta.tileIds || []).map((id) => document.querySelector(`[data-tile-id="${id}"]`))
        ).filter(Boolean);
        if (!sources.length) {
          const board = document.querySelector(".board-stage");
          if (board) sources.push(board);
        }
        const tokens = Math.min(delta.amount, 4);
        let delay = 0;
        if (!reducedMotion())
          sources.forEach((source) => {
            const start = centerOf(source);
            for (let i = 0; i < tokens; i++) {
              newFlights.push({
                id: nextId++,
                resource: delta.resource,
                x: start.x,
                y: start.y,
                dx: end.x - start.x + (i - (tokens - 1) / 2) * 14,
                dy: end.y - start.y,
                delay,
              });
              delay += 110;
            }
          });
        if (table) {
          // One burst per merchant, gathering every resource they gained, so
          // a four-resource payout reads as a single tidy row, not a stack.
          let burst = perPlayer[delta.playerId];
          if (!burst) {
            burst = perPlayer[delta.playerId] = {
              id: nextId++,
              items: [],
              color: game.players.find((player) => player.id === delta.playerId)?.color,
              x: end.box.left + end.box.width / 2,
              y: end.box.top + end.box.height * 0.55,
              delay: 0,
            };
            newBursts.push(burst);
          }
          burst.items.push({ resource: delta.resource, amount: delta.amount });
          burst.delay = Math.max(burst.delay, reducedMotion() ? 0 : FLIGHT_MS * 0.8 + delay);
        }
      }
      if (newFlights.length) {
        setFlights((current) => [...current, ...newFlights]);
        const ids = new Set(newFlights.map((flight) => flight.id));
        const longest = Math.max(...newFlights.map((flight) => flight.delay)) + FLIGHT_MS + 100;
        later(
          () => setFlights((current) => current.filter((flight) => !ids.has(flight.id))),
          longest,
        );
      }
      if (newBursts.length) {
        setBursts((current) => [...current, ...newBursts]);
        const ids = new Set(newBursts.map((burst) => burst.id));
        const longest = Math.max(...newBursts.map((burst) => burst.delay)) + BURST_MS + 100;
        later(() => setBursts((current) => current.filter((burst) => !ids.has(burst.id))), longest);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [visuals?.flashId]);

  // The TV announces each new log entry briefly; the log keeps the record.
  const newest = game.log.at(-1)?.id;
  useEffect(() => {
    if (!table) return;
    const seen = lastLog.current;
    lastLog.current = newest;
    if (!seen || seen === newest) return;
    const start = game.log.findIndex((entry) => entry.id === seen);
    const fresh = game.log.slice(start + 1).slice(-2);
    if (!fresh.length) return;
    setToasts((current) => [...current, ...fresh].slice(-2));
    const ids = new Set(fresh.map((entry) => entry.id));
    later(() => setToasts((current) => current.filter((entry) => !ids.has(entry.id))), TOAST_MS);
  }, [newest, table]);

  if (!flights.length && !bursts.length && !dice && !toasts.length && !cardFlight && !cardPlay)
    return null;
  // Dice and announcements sit over the middle of the board, not the whole screen.
  const stage = document.querySelector(".board-stage")?.getBoundingClientRect();
  const middle = stage
    ? { left: stage.left + stage.width / 2, top: stage.top + stage.height / 2 }
    : undefined;
  const upper = stage ? { left: stage.left + stage.width / 2, top: stage.top + 12 } : undefined;
  return createPortal(
    <div className="fx-layer" aria-hidden="true">
      {flights.map((flight) => (
        <span
          key={flight.id}
          className={`fx-token resource-${flight.resource}`}
          style={{
            left: flight.x,
            top: flight.y,
            "--dx": `${flight.dx}px`,
            "--dy": `${flight.dy}px`,
            animationDelay: `${flight.delay}ms`,
          }}
        >
          <ResourceIcon resource={flight.resource} size={30} />
        </span>
      ))}
      {bursts.map((burst) => (
        <span
          key={burst.id}
          className="fx-burst"
          style={{
            left: burst.x,
            top: burst.y,
            "--player-color": burst.color,
            animationDelay: `${burst.delay}ms`,
          }}
        >
          {burst.items.map((item) => (
            <span key={item.resource} className="fx-burst-item">
              +{item.amount}
              <ResourceChip resource={item.resource} size={22} />
            </span>
          ))}
        </span>
      ))}
      {dice && (
        <div
          className={`fx-dice ${dice.seven ? "fx-seven" : ""}`}
          key={dice.id}
          style={{ ...middle, ...(dice.who ? { "--player-color": dice.who.color } : {}) }}
        >
          {dice.who && <em className="fx-dice-who">{dice.who.name} rolls</em>}
          <DiceDisplay pair={dice.pair} rolling />
          <strong>{dice.pair[0] + dice.pair[1]}</strong>
          {dice.seven && <span>The bandit awakens!</span>}
        </div>
      )}
      {cardFlight && (
        <span
          key={cardFlight.id}
          className="fx-devcard"
          style={{
            left: cardFlight.x,
            top: cardFlight.y,
            "--dx": `${cardFlight.dx}px`,
            "--dy": `${cardFlight.dy}px`,
            "--player-color": cardFlight.color,
          }}
        />
      )}
      {cardPlay && (
        <div
          key={cardPlay.id}
          className={`fx-devplay dev-${cardPlay.card}`}
          style={{ ...middle, "--player-color": cardPlay.color }}
        >
          <span>{cardPlay.name} plays</span>
          <strong>{cardPlay.label}</strong>
        </div>
      )}
      {toasts.length > 0 && (
        <div className="fx-toasts" style={upper}>
          {[...toasts].reverse().map((entry) => (
            <p key={entry.id} className={`fx-toast fx-toast-${entry.type}`}>
              {entry.message}
            </p>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
