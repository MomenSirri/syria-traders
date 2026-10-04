import test from "node:test";
import assert from "node:assert/strict";
import { announceTab, shouldPark, shouldRestart, TAB_KEY, STALE_MS } from "../src/utils/tabs.js";

test("a tab that connects tells the browser's other tabs", () => {
  const written = [];
  announceTab({ setItem: (key, value) => written.push([key, value]) });
  assert.equal(written.length, 1);
  assert.equal(written[0][0], TAB_KEY);
  assert.doesNotThrow(() =>
    announceTab({
      setItem() {
        throw new Error("QuotaExceededError");
      },
    }),
  );
});
test("only a hidden tab gives up its live stream, and only for another game tab", () => {
  const other = { key: TAB_KEY, newValue: "1" };
  assert.equal(shouldPark(other, true), true);
  assert.equal(shouldPark(other, false), false, "A tab on screen keeps playing");
  assert.equal(shouldPark({ key: "syria_traders_save_v1", newValue: "{}" }, true), false);
  assert.equal(shouldPark({ key: TAB_KEY, newValue: null }, true), false);
});
test("a tab shown again reconnects at once if it was parked or its stream went quiet", () => {
  const now = 1000000;
  const fresh = { hidden: false, parked: false, lastBeat: now - 1000, now };
  assert.equal(shouldRestart(fresh), false, "A healthy stream is left alone");
  assert.equal(shouldRestart({ ...fresh, parked: true }), true);
  assert.equal(shouldRestart({ ...fresh, lastBeat: now - STALE_MS - 1 }), true);
  assert.equal(shouldRestart({ ...fresh, parked: true, hidden: true }), false);
});
