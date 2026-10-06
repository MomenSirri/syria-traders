const store = require("./gameStore");

// Who is in touch with the host right now. Kept in memory only: it is never saved
// and never changes a match. A seat is present while it holds a live stream or
// keeps asking for the pulse; one that has done neither for a few seconds is
// "away": the others see a marker and its turn simply waits.
const AWAY_MS = Number(process.env.AWAY_MS || 4000);
// A phone without a working stream asks for the pulse every second or two.
const PULSE_MS = Number(process.env.PULSE_MS || 7000);
const seats = new Map();
const versions = new Map();
const key = (gameId, playerId) => `${gameId}:${playerId}`;

function changed(gameId) {
  versions.set(gameId, (versions.get(gameId) || 0) + 1);
  // Streams repeat the current revision with a new presence number; screens refresh.
  store.updates.emit(gameId, store.getRevision(gameId));
}

function join(gameId, playerId) {
  if (!playerId) return;
  const id = key(gameId, playerId);
  const seat = seats.get(id) || { streams: 0, away: false, timer: null, seen: 0 };
  seats.set(id, seat);
  seat.streams += 1;
  clearTimeout(seat.timer);
  if (seat.away) {
    seat.away = false;
    changed(gameId);
  }
}

const pulsing = (seat) => Date.now() - seat.seen < PULSE_MS;

// Marks the seat away once it has neither a stream nor a recent pulse.
function expire(gameId, seat, delay) {
  clearTimeout(seat.timer);
  seat.timer = setTimeout(() => {
    if (seat.streams) return;
    if (pulsing(seat)) return expire(gameId, seat, PULSE_MS);
    seat.away = true;
    changed(gameId);
  }, delay);
  seat.timer.unref();
}

// A seat asked for the pulse: it is reachable even if its stream is not working.
function seen(gameId, playerId) {
  if (!playerId) return;
  const id = key(gameId, playerId);
  const seat = seats.get(id) || { streams: 0, away: false, timer: null, seen: 0 };
  seats.set(id, seat);
  seat.seen = Date.now();
  if (seat.away) {
    seat.away = false;
    changed(gameId);
  }
  if (!seat.streams) expire(gameId, seat, PULSE_MS);
}

function leave(gameId, playerId) {
  const seat = seats.get(key(gameId, playerId));
  if (!seat) return;
  seat.streams = Math.max(0, seat.streams - 1);
  if (seat.streams) return;
  // A short blip (a retry, a page refresh, a tab switch) is not worth announcing.
  expire(gameId, seat, AWAY_MS);
}

function isOnline(gameId, playerId) {
  const seat = seats.get(key(gameId, playerId));
  return Boolean(seat && (seat.streams || pulsing(seat)));
}
const isAway = (gameId, playerId) => Boolean(seats.get(key(gameId, playerId))?.away);
const version = (gameId) => versions.get(gameId) || 0;

module.exports = { join, leave, seen, isOnline, isAway, version };
