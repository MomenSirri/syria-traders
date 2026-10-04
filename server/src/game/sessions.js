const { randomBytes, createHash } = require("node:crypto");
const store = require("./gameStore");
const service = require("./gameService");
const config = require("../../../shared/gameConfig.json");
const { networkInterfaces } = require("node:os");

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}
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
  for (const region of config.regions) {
    const value = payload.hexTexturesByRegion?.[region.name];
    if (value) hexTexturesByRegion[region.name] = image(value);
  }
  return { playerImages, hexTexturesByRegion };
}

// Table screens (a TV showing the shared board) hold a session without a seat.
// Player sessions keep their original shape so older saves still authenticate.
const isTable = (session) => session?.role === "table";

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
  // The table screen shows the invite link, so it needs the host's LAN addresses.
  if ((session.host || table) && game.mode === "online") {
    result.hostAddresses = Object.values(networkInterfaces())
      .flat()
      .filter((entry) => entry.family === "IPv4" && !entry.internal)
      .map((entry) => entry.address);
  }
  if (game.mode === "online") {
    // Opponent hands and private gain events never leave the server.
    result.players = result.players.map((player) =>
      ownId && player.id === ownId ? player : { ...player, resources: null },
    );
    result.gainEvents = result.gainEvents
      .map((event) => ({
        ...event,
        gains: event.gains.filter((gain) => ownId && gain.playerId === ownId),
      }))
      .filter((event) => event.gains.length);
    if (result.visuals)
      result.visuals = {
        ...result.visuals,
        resourceDeltas: result.visuals.resourceDeltas.filter(
          (gain) => ownId && gain.playerId === ownId,
        ),
      };
    if (!ownId || game.players[game.currentPlayerIndex]?.id !== ownId) result.hints = null;
  }
  if (includeMedia) result.media = game.media || { playerImages: {}, hexTexturesByRegion: {} };
  return result;
}

function create(payload) {
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
  game.hostPlayerId = game.players[0]?.id || null;
  const { token, session } = tableHost
    ? issue(game, null, true, "table")
    : issue(game, game.hostPlayerId, true);
  return { game: view(game, session, true), token };
}

// Open a read-only table screen (for example a TV) for an existing network room.
function watch(id) {
  const game = store.getGame(id);
  if (!game || game.mode !== "online" || game.status === "closed")
    fail("Network room not found.", 404);
  // Reopening the screen should not grow the save forever: keep a few recent ones.
  const watchers = (game.sessions || []).filter((seat) => isTable(seat) && !seat.host);
  const stale = new Set(watchers.slice(0, Math.max(0, watchers.length - 7)));
  game.sessions = (game.sessions || []).filter((seat) => !stale.has(seat));
  const { token, session } = issue(game, null, false, "table");
  return { game: view(store.getGame(game.id), session, true), token };
}

function join(id, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    fail("A player name is required.");
  const game = store.getGame(id);
  if (!game || game.mode !== "online") fail("Network room not found.", 404);
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
