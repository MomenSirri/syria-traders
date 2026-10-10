const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.GAME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "syria-traders-test-"));
const store = require("../src/game/gameStore");
const app = require("../src/app");

let server, base;
// `from` stands in for a visitor arriving through a tunnel on this PC.
async function api(route, body, { token, from } = {}) {
  if (!server) {
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  }
  const response = await fetch(base + route, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(from ? { "X-Forwarded-For": from } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, ...(await response.json()) };
}

async function startedRoom(from) {
  const host = await api("/games", { mode: "online", playerNames: ["Amina"] }, { from });
  const omar = await api(`/games/${host.game.roomCode}/join`, { name: "Omar" }, { from });
  const state = (await api(`/games/${host.game.id}`, null, { token: host.token })).game;
  const started = await fetch(`${base}/games/${state.id}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${host.token}`,
      "X-Game-Revision": String(state.revision),
    },
    body: "{}",
  });
  assert.equal(started.status, 200);
  return { host, omar, code: host.game.roomCode };
}

test("table screens never see the rejoin PIN", async () => {
  const { host, code } = await startedRoom("203.0.113.1");
  const screen = await api(`/games/${code}/table`, {}, { from: "203.0.113.1" });
  assert.equal(screen.status, 201, screen.error);
  assert.equal(screen.game.rejoinPin, undefined);
  assert.match(host.game.rejoinPin, /^\d{4}$/);
});

test("an address that keeps guessing room codes is slowed down", async () => {
  const { code } = await startedRoom("203.0.113.2");
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await api(`/games/ZZZZ${i}0/join`, { name: "Guess" }, { from: "198.51.100.7" })).status,
      404,
    );
  // Even the right code is refused for a while, from that address only.
  const blocked = await api(`/games/${code}/table`, {}, { from: "198.51.100.7" });
  assert.equal(blocked.status, 429);
  assert.equal((await api(`/games/${code}/table`, {}, { from: "198.51.100.8" })).status, 201);
});

test("a room stops taking PIN guesses from every address after 20 misses", async () => {
  const { host, code } = await startedRoom("203.0.113.3");
  const wrong = host.game.rejoinPin === "0000" ? "1111" : "0000";
  for (let i = 0; i < 20; i++) {
    const guess = await api(
      `/games/${code}/join`,
      { name: "Omar", pin: wrong },
      { from: `192.0.2.${i}` },
    );
    assert.equal(guess.status, 403);
  }
  const right = await api(
    `/games/${code}/join`,
    { name: "Omar", pin: host.game.rejoinPin },
    { from: "192.0.2.200" },
  );
  assert.equal(right.status, 429);
});

test("a room saved before PINs existed still lets a player rejoin, then gets a PIN", async () => {
  const { host, code } = await startedRoom("203.0.113.4");
  const old = store.getGame(host.game.id);
  delete old.rejoinPin;
  store.saveGame(old);
  const back = await api(`/games/${code}/join`, { name: "Omar" }, { from: "203.0.113.4" });
  assert.equal(back.status, 200, back.error);
  assert.match(back.game.rejoinPin, /^\d{4}$/);
  assert.equal(store.getGame(host.game.id).rejoinPin, back.game.rejoinPin);
});

test("an address can only open so many rooms an hour", async () => {
  for (let i = 0; i < 30; i++)
    assert.equal(
      (await api("/games", { mode: "online", playerNames: ["Host"] }, { from: "198.51.100.50" }))
        .status,
      201,
    );
  const more = await api(
    "/games",
    { mode: "online", playerNames: ["Host"] },
    { from: "198.51.100.50" },
  );
  assert.equal(more.status, 429);
  assert.equal(
    (await api("/games", { mode: "online", playerNames: ["Host"] }, { from: "198.51.100.51" }))
      .status,
    201,
  );
});

after(() => {
  server?.closeAllConnections();
  server?.close();
});
