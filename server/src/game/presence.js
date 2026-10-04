const store = require("./gameStore");

// Who is holding a live stream right now. Kept in memory only: it is never saved
// and never changes a match. A seat that was connected and has had no stream for
// a few seconds is "away"; the others see a marker and its turn simply waits.
const AWAY_MS = Number(process.env.AWAY_MS || 4000);
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
  const seat = seats.get(id) || { streams: 0, away: false, timer: null };
  seats.set(id, seat);
  seat.streams += 1;
  clearTimeout(seat.timer);
  if (seat.away) {
    seat.away = false;
    changed(gameId);
  }
}

function leave(gameId, playerId) {
  const seat = seats.get(key(gameId, playerId));
  if (!seat) return;
  seat.streams = Math.max(0, seat.streams - 1);
  if (seat.streams) return;
  // A short blip (a retry, a page refresh, a tab switch) is not worth announcing.
  clearTimeout(seat.timer);
  seat.timer = setTimeout(() => {
    seat.away = true;
    changed(gameId);
  }, AWAY_MS);
  seat.timer.unref();
}

const isOnline = (gameId, playerId) => Boolean(seats.get(key(gameId, playerId))?.streams);
const isAway = (gameId, playerId) => Boolean(seats.get(key(gameId, playerId))?.away);
const version = (gameId) => versions.get(gameId) || 0;

module.exports = { join, leave, isOnline, isAway, version };
