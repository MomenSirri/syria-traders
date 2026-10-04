const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");

const directory = process.env.GAME_DATA_DIR || path.join(__dirname, "../../data");
const games = new Map();
const updates = new EventEmitter();
updates.setMaxListeners(100);
const copy = (value) => structuredClone(value);

fs.mkdirSync(directory, { recursive: true });
for (const file of fs.readdirSync(directory).filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))) {
  try {
    const game = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
    games.set(game.id, game);
  } catch (error) {
    console.error(`Could not load saved match ${file}: ${error.message}`);
  }
}

function saveGame(game) {
  const previous = games.get(game.id);
  game.revision = (previous?.revision || 0) + 1;
  game.updatedAt = new Date().toISOString();
  // Keep a short history so reconnecting clients don't miss resource gains.
  const gains = [];
  for (const player of game.players) {
    const before = previous?.players.find((entry) => entry.id === player.id);
    if (!before) continue;
    for (const [resource, amount] of Object.entries(player.resources)) {
      const delta = amount - (before.resources[resource] || 0);
      if (delta > 0) gains.push({ playerId: player.id, resource, amount: delta });
    }
  }
  game.gainEvents = (previous?.gainEvents || []).filter((event) => Date.now() - event.at < 120000);
  if (gains.length) game.gainEvents.push({ id: randomUUID(), at: Date.now(), gains });
  game.gainEvents = game.gainEvents.slice(-40);
  // Replace a complete snapshot atomically; don't partially overwrite a save.
  const target = path.join(directory, `${game.id}.json`);
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(game), { mode: 0o600 });
  fs.renameSync(`${target}.tmp`, target);
  games.set(game.id, copy(game));
  updates.emit(game.id, game.revision);
  return game;
}

function getGame(id) {
  const game =
    games.get(id) ||
    [...games.values()].find((entry) => entry.roomCode === String(id).toUpperCase());
  // Work on a copy: rejected actions cannot mutate a live match.
  return game ? copy(game) : undefined;
}

const getRevision = (id) => games.get(id)?.revision || 0;

module.exports = { saveGame, getGame, getRevision, updates };
