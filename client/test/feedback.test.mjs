import test from "node:test";
import assert from "node:assert/strict";
import { visibleGains, STICKY_MS, FADE_MS } from "../src/hooks/useResourceGains.js";
import { readSave, saveMatch, saveArtwork, clearSave, SAVE_KEY } from "../src/utils/storage.js";

const event = (at, amount = 1, resource = "wheat") => ({
  at,
  gains: [{ playerId: "one", resource, amount }],
});
test("gains remain solid for 30 seconds, then fade and clear", () => {
  assert.equal(visibleGains([event(1000)], 1000 + STICKY_MS - 1)[0].fading, false);
  assert.equal(visibleGains([event(1000)], 1000 + STICKY_MS)[0].fading, true);
  assert.deepEqual(visibleGains([event(1000)], 1000 + STICKY_MS + FADE_MS), []);
});
test("simultaneous resources stay separate; repeated gains aggregate without losing their expiry", () => {
  const events = [event(1000), event(2000, 2), event(2000, 1, "wood")];
  const gains = visibleGains(events, 3000);
  assert.equal(gains.length, 2);
  assert.equal(gains[0].amount, 3);
  assert.equal(gains[1].resource, "wood");
  assert.equal(visibleGains(events, 31700)[0].amount, 2);
  assert.equal(visibleGains(events, 32000)[0].fading, true);
});
test("save/load keeps the exact match and seat; art is not rewritten for each move", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const game = {
    id: "test",
    turn: 10,
    currentPlayerIndex: 1,
    revision: 12,
    board: { tiles: [1, 2, 3] },
  };
  const media = { playerImages: { one: "photo" }, hexTexturesByRegion: { Hama: "terrain" } };
  saveArtwork(game.id, media);
  saveMatch(game, "secret", false);
  assert.deepEqual(readSave(), { version: 2, game, token: "secret", soundEnabled: false, media });
  assert.equal(values.get(SAVE_KEY).includes("terrain"), false);
  values.set("syria_traders_art_v2", "broken JSON");
  assert.equal(readSave().token, "secret");
  clearSave();
  assert.equal(readSave(), null);
  delete globalThis.localStorage;
});
