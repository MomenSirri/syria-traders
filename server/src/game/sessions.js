const { randomBytes, createHash } = require("node:crypto");
const store = require("./gameStore");
const service = require("./gameService");
const { lanAddresses } = require("../utils/network");
const { boardSpec } = require("./boardGenerator");
const ports = require("../utils/ports");
const presence = require("./presence");
const attempts = require("../utils/attempts");

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}
// Limits for strangers on a public address. Joins count only when they fail, so a
// family rejoining after a dropped phone never meets them.
const MINUTE = 60000;
const LIMITS = {
  create: { max: 30, windowMs: 60 * MINUTE },
  wrongCode: { max: 10, windowMs: 10 * MINUTE },
  wrongPin: { max: 20, windowMs: 10 * MINUTE },
};
const SLOW_DOWN = "Too many wrong room codes or PINs from here. Wait a few minutes and try again.";
const newPin = () => String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, "0");

const hash = (token) => createHash("sha256").update(token).digest("hex");

function image(value) {
  if (!value) return "";
  if (
    typeof value !== "string" ||
    value.length > 160000 ||
    !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
  ) {
    fail("Use a JPEG, PNG or WebP image under 120 KB after resizing.");
  }
  return value;
}

function mediaFor(payload, players) {
  const playerImages = {};
  const hexTexturesByRegion = {};
  players.forEach((player, index) => {
    playerImages[player.id] = image(payload.playerProfiles?.[index]?.avatar);
  });
  // The large map includes every classic region plus its own.
  for (const region of boardSpec("large").regions) {
    const value = payload.hexTexturesByRegion?.[region.name];
    if (value) hexTexturesByRegion[region.name] = image(value);
  }
  return { playerImages, hexTexturesByRegion };
}

// Table screens (a TV showing the shared board) hold a session without a seat.
// Player sessions keep their original shape so older saves still authenticate.
const isTable = (session) => session?.role === "table";
const TABLE_ANIMATION_MS = 8000;
const MAX_SCREENS = 40;

function issue(game, playerId, host, role) {
  const token = randomBytes(32).toString("hex");
  const session = role
    ? { role, playerId: null, host, tokenHash: hash(token) }
    : { playerId, host, tokenHash: hash(token) };
  game.sessions = [...(game.sessions || []), session];
  store.saveGame(game);
  return { token, session };
}

function authenticate(id, token) {
  const game = store.getGame(id);
  if (!game) fail("Match not found on this server.", 404);
  const session = game.sessions?.find((entry) => entry.tokenHash === hash(token || ""));
  if (!session)
    fail("This browser has no player seat in that match. Join using its room code.", 401);
  // Rooms saved before rejoin PINs existed get one the first time a seat checks in.
  if (game.mode === "online" && !game.rejoinPin) {
    game.rejoinPin = newPin();
    store.saveGame(game);
  }
  return { game, session };
}

function view(game, session, includeMedia = false) {
  const result = service.getGameState(game.id);
  const table = isTable(session);
  // A table screen is nobody's seat: it sees exactly what every player can see.
  const ownId = table ? null : session.playerId;
  result.viewer = table
    ? { playerId: null, isHost: Boolean(session.host), role: "table" }
    : { playerId: session.playerId, isHost: session.host };
  // Seated players see the rejoin PIN so they can read it to someone who lost their seat.
  // Table screens never get it: anyone with the room code can open one.
  if (game.mode === "online" && !table) result.rejoinPin = game.rejoinPin || null;
  // The table screen shows the invite link, so it needs the host's LAN addresses.
  if ((session.host || table) && game.mode === "online") {
    result.hostAddresses = lanAddresses();
    // Phones are always invited to HTTPS; the TV address is shown to the host.
    result.hostPorts = { secure: ports.secure, tv: ports.tv };
    if (ports.publicUrl) result.hostPorts.public = ports.publicUrl;
  }
  if (game.mode === "online") {
    // Opponent hands and private gain events never leave the server.
    // "away" marks a seat whose phone has dropped; it is public and never saved.
    result.players = result.players.map((player) => ({
      ...(ownId && player.id === ownId ? player : { ...player, resources: null, devCards: null }),
      away: presence.isAway(game.id, player.id),
    }));
    result.gainEvents = result.gainEvents
      .map((event) => ({
        ...event,
        gains: event.gains.filter((gain) => ownId && gain.playerId === ownId),
      }))
      .filter((event) => event.gains.length);
    if (result.visuals) {
      // Players animate only their own gains. The table screen animates everyone's
      // public payout for a few seconds, then the amounts stop being sent at all.
      const fresh = Date.now() - Date.parse(result.visuals.at) < TABLE_ANIMATION_MS;
      result.visuals = {
        ...result.visuals,
        // A stolen card is private: only the thief and the victim see which one.
        resourceDeltas: result.visuals.resourceDeltas.filter((gain) =>
          gain.private
            ? ownId && (gain.playerId === ownId || gain.fromPlayerId === ownId)
            : table
              ? fresh
              : gain.playerId === ownId,
        ),
      };
    }
    if (!ownId || game.players[game.currentPlayerIndex]?.id !== ownId) result.hints = null;
  }
  if (includeMedia) result.media = game.media || { playerImages: {}, hexTexturesByRegion: {} };
  return result;
}

function create(payload, from = "") {
  attempts.check(
    `create:${from}`,
    LIMITS.create.max,
    LIMITS.create.windowMs,
    "Too many new rooms from here. Wait a while and try again.",
  );
  if (!payload || typeof payload !== "object") fail("A setup is required.");
  if (!Array.isArray(payload.playerNames)) fail("Player names must be a list.");
  if (payload.mode && !["local", "online"].includes(payload.mode))
    fail("Choose local or online play.");
  if (payload.tableHost !== undefined && typeof payload.tableHost !== "boolean")
    fail("Choose whether a table screen hosts the room.");
  const tableHost = payload.tableHost === true;
  if (tableHost && payload.mode !== "online") fail("Only network rooms can use a table screen.");
  if (tableHost && payload.playerNames?.length !== 0)
    fail("A table screen hosts the room without a seat. Players join from their phones.");
  if (!tableHost && payload.mode === "online" && payload.playerNames?.length !== 1)
    fail("Create a network room with one host name.");
  if (payload.mode !== "online" && payload.playerNames?.length < 2)
    fail("Add at least two local players.");
  // Validate artwork before creating any match.
  mediaFor(
    payload,
    (payload.playerNames || []).map((_, index) => ({ id: String(index) })),
  );
  const created = service.createGame(payload);
  const game = store.getGame(created.id);
  game.media = mediaFor(payload, game.players);
  do {
    game.roomCode = randomBytes(3).toString("hex").toUpperCase();
  } while (store.getGame(game.roomCode));
  if (game.mode === "online") game.rejoinPin = newPin();
  game.hostPlayerId = game.players[0]?.id || null;
  attempts.note(`create:${from}`, LIMITS.create.windowMs);
  const { token, session } = tableHost
    ? issue(game, null, true, "table")
    : issue(game, game.hostPlayerId, true);
  return { game: view(game, session, true), token };
}

// Open a read-only table screen (for example a TV) for an existing network room.
function watch(id, from = "") {
  const game = findRoom(id, from, (entry) => entry.status !== "closed");
  // Reopening the screen should not grow the save forever, but a room full of
  // spectators must not push the first screens out: keep plenty of recent ones.
  const watchers = (game.sessions || []).filter((seat) => isTable(seat) && !seat.host);
  const stale = new Set(watchers.slice(0, Math.max(0, watchers.length - (MAX_SCREENS - 1))));
  game.sessions = (game.sessions || []).filter((seat) => !stale.has(seat));
  const { token, session } = issue(game, null, false, "table");
  return { game: view(store.getGame(game.id), session, true), token };
}

// A phone that lost its saved seat (cleared browser, another browser, "New table")
// gets it back by entering the room code, the name it played with and the room PIN
// that every seated phone shows. Only a seat with no live connection can be taken,
// and the table log tells everyone.
function rejoin(game, payload, from) {
  const room = `pin:${game.id}`;
  attempts.check(
    room,
    LIMITS.wrongPin.max,
    LIMITS.wrongPin.windowMs,
    "Too many wrong PINs for this room. Wait a few minutes and try again.",
  );
  const name = typeof payload.name === "string" ? payload.name.trim().toLowerCase() : "";
  const player = game.players.find((entry) => entry.name.trim().toLowerCase() === name);
  const pin = typeof payload.pin === "string" ? payload.pin.trim() : "";
  // A room saved before PINs existed, and never opened since, rejoins by name alone.
  const pinned = !game.rejoinPin || pin === game.rejoinPin;
  if (!player || !pinned) {
    // The same answer for a wrong name and a wrong PIN, and no names are listed.
    attempts.note(room, LIMITS.wrongPin.windowMs);
    attempts.note(`code:${from}`, LIMITS.wrongCode.windowMs);
    fail(
      "This match has already started. To take your seat back, enter the name you played with and the room PIN. Any player still in the match sees the PIN next to the room code.",
      403,
    );
  }
  if (presence.isOnline(game.id, player.id))
    fail(`${player.name} is still connected on another device. Close the game there first.`, 409);
  const seats = game.sessions.filter((seat) => !isTable(seat) && seat.playerId === player.id);
  const host = seats.some((seat) => seat.host) || game.hostPlayerId === player.id;
  // Keep the newest old device working too, without growing the save forever.
  const stale = new Set(seats.slice(0, Math.max(0, seats.length - 2)));
  game.sessions = game.sessions.filter((seat) => !stale.has(seat));
  game.log.push({
    id: randomBytes(12).toString("hex"),
    at: new Date().toISOString(),
    type: "info",
    message: `${player.name} rejoined the table.`,
  });
  game.log = game.log.slice(-180);
  game.rejoinPin ||= newPin();
  const { token, session } = issue(game, player.id, host);
  return { game: view(store.getGame(game.id), session, true), token };
}

// Looks a room up by code, counting misses per address so codes can't be guessed.
function findRoom(id, from, usable = () => true) {
  attempts.check(`code:${from}`, LIMITS.wrongCode.max, LIMITS.wrongCode.windowMs, SLOW_DOWN);
  const game = store.getGame(id);
  if (!game || game.mode !== "online" || !usable(game)) {
    attempts.note(`code:${from}`, LIMITS.wrongCode.windowMs);
    fail("Network room not found.", 404);
  }
  return game;
}

function join(id, payload, from = "") {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    fail("A player name is required.");
  const game = findRoom(id, from);
  if (!["lobby", "closed"].includes(game.phase)) return rejoin(game, payload, from);
  const avatar = image(payload.avatar);
  service.joinGame(game.id, payload);
  const next = store.getGame(game.id);
  const player = next.players[next.players.length - 1];
  next.media.playerImages[player.id] = avatar;
  // In a room opened by a table screen, the first phone to join can also start it.
  const captain = !next.hostPlayerId;
  if (captain) next.hostPlayerId = player.id;
  const { token, session } = issue(next, player.id, captain);
  return { game: view(next, session, true), token };
}

function assertRevision(game, revision) {
  if (!Number.isInteger(Number(revision)) || Number(revision) !== game.revision)
    fail("The match changed. Your screen has been refreshed; please try again.", 409);
}

function assertAction(game, session, body, revision, checkRevision = true) {
  if (isTable(session)) fail("The table screen only shows the match. Play from a phone.", 403);
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("An action is required.");
  if (checkRevision) assertRevision(game, revision);
  if (game.mode === "online" && body.playerId !== session.playerId)
    fail("You can only act for your own player.", 403);
  for (const key of ["edgeId", "vertexId", "tileId"]) {
    if (key in body && (!Number.isInteger(body[key]) || body[key] < 0)) fail(`Invalid ${key}.`);
  }
}

function leaveLobby(game, session) {
  if (game.mode !== "online" || game.phase !== "lobby")
    fail("Seats can only be removed before a match starts.");
  const leaving = game.players.find((player) => player.id === session.playerId);
  game.players = game.players.filter((player) => player.id !== session.playerId);
  game.hostPlayerId = game.players[0]?.id || null;
  game.currentPlayerIndex = 0;
  game.sessions = game.sessions
    .filter((seat) => isTable(seat) || seat.playerId !== session.playerId)
    .map((seat) => (isTable(seat) ? seat : { ...seat, host: seat.playerId === game.hostPlayerId }));
  if (game.media?.playerImages) delete game.media.playerImages[session.playerId];
  // A room opened by a table screen stays open for new players.
  if (!game.players.length && !game.sessions.some((seat) => isTable(seat) && seat.host)) {
    game.status = "closed";
    game.phase = "closed";
  }
  game.log.push({
    id: randomBytes(12).toString("hex"),
    at: new Date().toISOString(),
    type: "setup",
    message: `${leaving.name} left the lobby.`,
  });
  game.log = game.log.slice(-180);
  store.saveGame(game);
}

// Disconnect a table screen. Its token stops working; seats are untouched.
function leaveTable(game, session) {
  game.sessions = game.sessions.filter((seat) => seat.tokenHash !== session.tokenHash);
  if (game.phase === "lobby" && !game.players.length && session.host) {
    game.status = "closed";
    game.phase = "closed";
  }
  store.saveGame(game);
}

module.exports = {
  create,
  join,
  watch,
  authenticate,
  view,
  assertAction,
  assertRevision,
  leaveLobby,
  leaveTable,
  isTable,
  fail,
};
