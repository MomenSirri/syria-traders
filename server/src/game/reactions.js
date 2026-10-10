const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");
const config = require("../../../shared/gameConfig.json");

// Quick reactions (an emoji or a short line) from a player's phone. They are
// shown for a few seconds on every screen and never saved, so they don't
// change the match revision and can't get in the way of anyone's move.
const events = new EventEmitter();
events.setMaxListeners(200);
const GAP_MS = 1200;
const last = new Map();

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

function send(game, playerId, key) {
  if (game.mode !== "online") fail("Reactions are for network rooms.");
  if (!Object.hasOwn(config.reactions, key)) fail("Choose one of the reactions.");
  if (!game.players.some((player) => player.id === playerId)) fail("Player not found.", 404);
  const seat = `${game.id}:${playerId}`;
  const now = Date.now();
  if (now - (last.get(seat) || 0) < GAP_MS) fail("One reaction at a time.", 429);
  last.set(seat, now);
  const reaction = {
    id: randomUUID(),
    playerId,
    key,
    at: new Date(now).toISOString(),
  };
  events.emit(game.id, reaction);
  return reaction;
}

module.exports = { send, events };
