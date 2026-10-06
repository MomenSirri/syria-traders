import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const isEmoji = (text) => !/[a-z]/i.test(text);
// The player's card on this screen, so a reaction rises from whoever sent it.
function anchorFor(playerId) {
  const candidates = document.querySelectorAll(`.player-card[data-player-id="${playerId}"]`);
  const card = [...candidates].find((element) => element.getClientRects().length);
  if (!card) return null;
  const box = card.getBoundingClientRect();
  return { left: box.left + box.width / 2, top: box.top + box.height * 0.35 };
}

// A floating button on a seated phone opens the reaction tray. One tap sends.
export function ReactionButton({ reactions, onReact }) {
  const [open, setOpen] = useState(false);
  const [cooling, setCooling] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  const entries = Object.entries(reactions || {});
  if (!entries.length) return null;
  const send = (key) => {
    setOpen(false);
    setCooling(true);
    setTimeout(() => setCooling(false), 1200);
    onReact(key);
  };
  return (
    <div className="reaction-dock">
      {open && (
        <div className="reaction-tray panel" role="menu" aria-label="Send a reaction">
          <div className="reaction-emojis">
            {entries
              .filter(([, text]) => isEmoji(text))
              .map(([key, text]) => (
                <button key={key} role="menuitem" aria-label={key} onClick={() => send(key)}>
                  {text}
                </button>
              ))}
          </div>
          <div className="reaction-lines">
            {entries
              .filter(([, text]) => !isEmoji(text))
              .map(([key, text]) => (
                <button key={key} role="menuitem" onClick={() => send(key)}>
                  {text}
                </button>
              ))}
          </div>
        </div>
      )}
      <button
        className={`reaction-toggle ${open ? "open" : ""}`}
        aria-expanded={open}
        aria-label="Send a reaction to the table"
        disabled={cooling}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "✕" : "😀"}
      </button>
    </div>
  );
}

// Incoming reactions pop up over the sender's card (big on the TV), then fade.
export function ReactionLayer({ game, reactions, table }) {
  if (!reactions.length) return null;
  const texts = game.settings.reactions || {};
  return createPortal(
    <div className={`reaction-layer ${table ? "on-table" : ""}`} aria-live="polite">
      {reactions.map((reaction, index) => {
        const player = game.players.find((entry) => entry.id === reaction.playerId);
        const text = texts[reaction.key];
        if (!player || !text) return null;
        const anchor = anchorFor(player.id);
        const style = {
          "--player-color": player.color,
          // Quick reactions in a row fan out instead of covering each other.
          "--shift": `${((index % 3) - 1) * 34}px`,
          ...(anchor
            ? { left: anchor.left, top: anchor.top }
            : { left: "50%", bottom: `${12 + (index % 4) * 9}%` }),
        };
        return (
          <div
            key={reaction.id}
            className={`reaction-bubble ${isEmoji(text) ? "emoji" : "line"}`}
            style={style}
          >
            <span className="reaction-text">{text}</span>
            <small>{player.name}</small>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
