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

function issue(game, playerId, host) {
  const token = randomBytes(32).toString("hex");
  const session = { playerId, host, tokenHash: hash(token) };
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
  result.viewer = { playerId: session.playerId, isHost: session.host };
  if (session.host && game.mode === "online") {
    result.hostAddresses = Object.values(networkInterfaces())
      .flat()
      .filter((entry) => entry.family === "IPv4" && !entry.internal)
      .map((entry) => entry.address);
  }
  if (game.mode === "online") {
    // Opponent hands and private gain events never leave the server.
    result.players = result.players.map((player) =>
      player.id === session.playerId ? player : { ...player, resources: null },
    );
    result.gainEvents = result.gainEvents.map((event) => ({
      ...event,
      gains: event.gains.filter((gain) => gain.playerId === session.playerId),
    }));
    if (result.visuals)
      result.visuals = {
        ...result.visuals,
        resourceDeltas: result.visuals.resourceDeltas.filter(
          (gain) => gain.playerId === session.playerId,
        ),
      };
    if (game.players[game.currentPlayerIndex]?.id !== session.playerId) result.hints = null;
  }
  if (includeMedia) result.media = game.media || { playerImages: {}, hexTexturesByRegion: {} };
  return result;
}

function create(payload) {
  if (!payload || typeof payload !== "object") fail("A setup is required.");
  if (!Array.isArray(payload.playerNames)) fail("Player names must be a list.");
  if (payload.mode && !["local", "online"].includes(payload.mode))
    fail("Choose local or online play.");
  if (payload.mode === "online" && payload.playerNames?.length !== 1)
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
  game.hostPlayerId = game.players[0].id;
  const { token, session } = issue(game, game.hostPlayerId, true);
  return { game: view(game, session, true), token };
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
  const { token, session } = issue(next, player.id, false);
  return { game: view(next, session, true), token };
}

function assertAction(game, session, body, revision) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("An action is required.");
  if (!Number.isInteger(Number(revision)) || Number(revision) !== game.revision)
    fail("The match changed. Your screen has been refreshed; please try again.", 409);
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
    .filter((seat) => seat.playerId !== session.playerId)
    .map((seat) => ({ ...seat, host: seat.playerId === game.hostPlayerId }));
  if (game.media?.playerImages) delete game.media.playerImages[session.playerId];
  if (!game.players.length) {
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

module.exports = { create, join, authenticate, view, assertAction, leaveLobby, fail };
