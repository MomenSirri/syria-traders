const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.GAME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "syria-traders-test-"));
const tvApp = require("../src/tvApp");
const sessions = require("../src/game/sessions");
const ports = require("../src/utils/ports");

let server, base;
async function call(route, body, token, revision) {
  if (!server) {
    server = tvApp.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const response = await fetch(base + route, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(revision === undefined ? {} : { "X-Game-Revision": String(revision) }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { text };
  }
  return { status: response.status, ...json };
}

test("the plain-HTTP TV address serves table screens only, never a player seat", async () => {
  ports.secure = 8443;
  assert.equal((await call("/api/health")).status, 200);

  // Phones (whose tokens can act) are sent to HTTPS.
  const room = await call("/api/games", { mode: "online", playerNames: ["Host"] });
  assert.equal(room.status, 403);
  assert.match(room.error, /only for TV screens.*https:\/\/127\.0\.0\.1:8443/);

  const tv = await call("/api/games", { mode: "online", tableHost: true, playerNames: [] });
  assert.equal(tv.status, 201, tv.error);
  assert.equal(tv.game.viewer.role, "table");
  assert.deepEqual(tv.game.hostPorts, { secure: 8443, tv: null });
  assert.equal((await call(`/api/games/${tv.game.roomCode}/join`, { name: "Nour" })).status, 403);

  // Players join over HTTPS (called directly here); their tokens are refused on HTTP.
  const nour = sessions.join(tv.game.id, { name: "Nour" });
  sessions.join(tv.game.id, { name: "Yazan" });
  assert.equal((await call(`/api/games/${tv.game.id}`, null, nour.token)).status, 403);
  assert.equal((await call(`/api/games/${tv.game.id}/events`, null, nour.token)).status, 403);
  assert.equal(
    (await call(`/api/games/${tv.game.id}/leave`, {}, nour.token, 0)).status,
    403,
    "A player token cannot act here",
  );
  assert.equal((await call(`/api/games/${tv.game.id}`, null, "forged")).status, 401);

  // The TV that hosts the room can read it and start it.
  let view = await call(`/api/games/${tv.game.id}`, null, tv.token);
  assert.equal(view.status, 200, view.error);
  const started = await call(`/api/games/${tv.game.id}/start`, {}, tv.token, view.game.revision);
  assert.equal(started.status, 200, started.error);
  view = await call(`/api/games/${tv.game.id}`, null, tv.token);
  assert.ok(view.game.players.every((player) => player.resources === null));
  assert.equal(view.game.hints, null);

  // A second screen can watch by room code.
  const watcher = await call(`/api/games/${tv.game.roomCode}/table`, {});
  assert.equal(watcher.status, 201, watcher.error);
  assert.equal(watcher.game.viewer.role, "table");
});

after(async () => {
  ports.secure = null;
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (path.basename(process.env.GAME_DATA_DIR).startsWith("syria-traders-test-"))
    fs.rmSync(process.env.GAME_DATA_DIR, { recursive: true, force: true });
});
