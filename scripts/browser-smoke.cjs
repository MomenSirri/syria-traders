/* Browser acceptance tests. Run after npm run build. Uses an isolated data folder. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const net = require("node:net");
const https = require("node:https");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "test-results");
fs.mkdirSync(output, { recursive: true });
const dataDirectory = fs.mkdtempSync(path.join(output, "browser-matches-"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [];
const measurements = [];
let server, browser, port;

async function availablePort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
function health() {
  return new Promise((resolve) =>
    https
      .get(`https://localhost:${port}/api/health`, { rejectUnauthorized: false }, (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      })
      .on("error", () => resolve(false)),
  );
}
async function startServer() {
  server = spawn(process.execPath, ["server/src/index.js"], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, PORT: String(port), GAME_DATA_DIR: dataDirectory },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) =>
    fs.appendFileSync(path.join(output, "browser-server.log"), chunk),
  );
  server.stderr.on("data", (chunk) =>
    fs.appendFileSync(path.join(output, "browser-server.log"), chunk),
  );
  for (let i = 0; i < 80; i++) {
    if (await health()) return;
    if (server.exitCode !== null) throw new Error("Test server exited.");
    await delay(150);
  }
  throw new Error("Test server did not become ready.");
}
async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const closed = new Promise((resolve) => server.once("exit", resolve));
  server.kill();
  await closed;
}
async function snapshot(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("syria_traders_save_v1"))?.game);
}
async function settled(page, revision = 0) {
  await page.waitForFunction((previous) => {
    const game = JSON.parse(localStorage.getItem("syria_traders_save_v1"))?.game;
    return (
      game?.revision > previous &&
      Boolean(
        document.querySelector(".connection-dot.live") ||
          document.querySelector(".lobby-footer")?.textContent.includes("live"),
      )
    );
  }, revision);
}
async function pageFor(url, clockSkew = 0) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  if (clockSkew) await page.clock.install({ time: Date.now() + clockSkew });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  return page;
}
async function place(page) {
  const old = await snapshot(page);
  // Prefer productive sites; a legal desert-only coastal site grants no cards.
  const production = (id) =>
    old.board.vertices[id].adjacentTiles.filter(
      (tileId) => old.board.tiles[tileId].resource !== "desert",
    ).length;
  const site = [...old.hints.validSetupVertices].sort((a, b) => production(b) - production(a))[0];
  await page.getByRole("button", { name: `Place village at site ${site}`, exact: true }).click();
  await page
    .getByRole("button", { name: /^Build road on edge/ })
    .first()
    .click();
  await settled(page, old.revision);
}
async function checkLayout(page, width, height, filename) {
  await page.bringToFront();
  await page.setViewportSize({ width, height });
  // Wait for the counter transition, not an arbitrary page-load delay.
  await page.waitForFunction(() => {
    const game = JSON.parse(localStorage.getItem("syria_traders_save_v1")).game;
    return [...document.querySelectorAll(".player-card")].every((card, index) =>
      [...card.querySelectorAll(".resource-amount-cell > strong")].every(
        (count, r) =>
          Number(count.textContent) === game.players[index].resources[game.settings.resources[r]],
      ),
    );
  });
  await page.screenshot({ path: path.join(output, filename), fullPage: true });
  const result = await page.evaluate(() => {
    const dashboard = document.querySelector(".dashboard-16x9").getBoundingClientRect();
    const issues = [];
    for (const card of document.querySelectorAll(".player-card")) {
      const box = card.getBoundingClientRect();
      const footer = card.querySelector(".player-card-footer").getBoundingClientRect();
      if (footer.bottom > box.bottom - 3) issues.push("Card contents overflow vertically");
      const rows = [...card.querySelectorAll(".resource-row")].map((row) =>
        row.getBoundingClientRect(),
      );
      rows.forEach((row, i) => {
        if (row.height < 24) issues.push("Resource row is under 24px");
        if (i && row.top - rows[i - 1].bottom < 7.9) issues.push("Resource rows overlap");
      });
      for (const row of card.querySelectorAll(".resource-row")) {
        const name = row.querySelector(".resource-name-cell").getBoundingClientRect();
        const number = row.querySelector(".resource-amount-cell").getBoundingClientRect();
        if (name.right > number.right - 10) issues.push("Resource name overlaps value");
      }
    }
    const board = document.querySelector(".board-stage").getBoundingClientRect();
    const land = document.querySelector(".tile-layer").getBoundingClientRect();
    return {
      viewport: [innerWidth, innerHeight],
      dashboard: [dashboard.width, dashboard.height],
      board: [board.width, board.height],
      land: [land.width, land.height],
      pageOverflowX: document.documentElement.scrollWidth > innerWidth,
      pageOverflowY: document.documentElement.scrollHeight > innerHeight,
      issues,
    };
  });
  measurements.push(result);
  assert.deepEqual(result.issues, [], JSON.stringify(result));
  assert.equal(result.pageOverflowX, false, "Horizontal page overflow");
  if (width >= 1200) {
    assert.equal(result.pageOverflowY, false, "Desktop page scrolls");
    assert.ok(Math.abs(result.dashboard[0] / result.dashboard[1] - 16 / 9) < 0.005);
  }
}
(async () => {
  port = await availablePort();
  await startServer();
  const installed = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find((file) => file && fs.existsSync(file));
  browser = await chromium.launch({
    headless: true,
    ...(installed ? { executablePath: installed } : {}),
  });
  const base = `https://localhost:${port}`;
  const local = await pageFor(base);
  await local.getByRole("button", { name: "+ Add player", exact: true }).click();
  await local.getByLabel("Player 3 name").fill("Hala");
  await local.getByRole("button", { name: "+ Add player", exact: true }).click();
  await local.getByLabel("Player 4 name").fill("Sami");
  const photo = await local.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#6d916a";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#ead8ac";
    ctx.fillRect(12, 12, 40, 40);
    return c.toDataURL("image/png").split(",")[1];
  });
  const upload = {
    name: "test-photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(photo, "base64"),
  };
  await local.getByLabel("Upload photo for player 1").click();
  await local.locator("input[type=file]").setInputFiles(upload);
  await local.locator(".setup-avatar img").waitFor();
  await local.getByRole("button", { name: "Upload territory photo", exact: true }).click();
  await local.locator("input[type=file]").setInputFiles(upload);
  await local.waitForFunction(
    () =>
      Object.keys(JSON.parse(localStorage.getItem("syria_traders_setup_v2")).hexTexturesByRegion)
        .length === 1,
  );
  await local.screenshot({ path: path.join(output, "setup-1920.png") });
  await local.setViewportSize({ width: 1366, height: 768 });
  await local.screenshot({ path: path.join(output, "setup-1366.png") });
  const setupOverflows = await local
    .locator(".setup-card")
    .evaluateAll(
      (cards) =>
        cards.filter((card) =>
          [...card.children].some(
            (child) =>
              child.getBoundingClientRect().bottom > card.getBoundingClientRect().bottom - 4,
          ),
        ).length,
    );
  assert.equal(setupOverflows, 0, "Setup controls overflow their panel");
  await local.setViewportSize({ width: 1920, height: 1080 });
  await local.getByRole("button", { name: "Begin the journey" }).click();
  await settled(local);
  assert.equal(await local.locator("input[type=file]").count(), 0);
  assert.equal(await local.locator(".tile-layer .tile-group").count(), 19);
  assert.equal(await local.locator(".sea-tile").count(), 18);
  for (let i = 0; i < 8; i++) await place(local);
  assert.equal((await snapshot(local)).phase, "main");
  assert.equal(await local.locator(".player-header img").count(), 1);
  assert.ok((await local.locator(".resource-popup").count()) > 0);
  await checkLayout(local, 1920, 1080, "dashboard-1920.png");
  await checkLayout(local, 1366, 768, "dashboard-1366.png");
  await checkLayout(local, 1280, 720, "dashboard-1280.png");
  await checkLayout(local, 1920, 800, "dashboard-wide.png");
  await checkLayout(local, 2560, 1440, "dashboard-2560.png");
  await checkLayout(local, 390, 844, "dashboard-mobile.png");
  await local.setViewportSize({ width: 1920, height: 1080 });
  const saved = await snapshot(local);
  await local.reload();
  await settled(local);
  assert.equal((await snapshot(local)).revision, saved.revision);
  assert.equal(await local.locator(".player-header img").count(), 1);
  console.log("PASS local setup, photos, placements, desktop/mobile layouts and refresh");

  // Install a controlled clock before reload so the hook's timers use it.
  await local.clock.install();
  await local.reload();
  await settled(local);
  const lastGain = Math.max(...(await snapshot(local)).gainEvents.map((event) => event.at));
  await local.clock.fastForward(
    Math.max(0, lastGain + 29900 - (await local.evaluate(() => Date.now()))),
  );
  assert.ok((await local.locator(".resource-popup:not(.resource-popup-fading)").count()) > 0);
  await local.clock.fastForward(120);
  assert.ok((await local.locator(".resource-popup-fading").count()) > 0);
  await local.clock.fastForward(710);
  assert.equal(await local.locator(".resource-popup").count(), 0);
  console.log("PASS browser gain badges hold for 30 seconds and fade/clear");

  const host = await pageFor(base);
  await host.getByRole("button", { name: "Host room", exact: true }).click();
  await host.getByLabel("Player 1 name").fill("Amina");
  await host.getByRole("button", { name: "Create a room" }).click();
  await settled(host);
  const code = (await snapshot(host)).roomCode;
  const players = [host];
  for (const name of ["Omar", "Rana", "Fadi"]) {
    const guest = await pageFor(`${base}/?room=${code}`, name === "Fadi" ? 120000 : 0);
    await guest.getByLabel("Player 1 name").fill(name);
    await guest.getByRole("button", { name: "Join the table" }).click();
    await settled(guest);
    players.push(guest);
  }
  await host.waitForFunction(
    () => JSON.parse(localStorage.getItem("syria_traders_save_v1")).game.players.length === 4,
  );
  await host.screenshot({ path: path.join(output, "network-lobby.png") });
  await host.getByRole("button", { name: "Start the match" }).click();
  for (const page of players) await page.locator(".dashboard-16x9").waitFor();
  for (let i = 0; i < 8; i++) {
    const state = await snapshot(host);
    const activeId = state.players[state.currentPlayerIndex].id;
    const activePage = (
      await Promise.all(
        players.map(async (page) => ({ page, id: (await snapshot(page)).viewer.playerId })),
      )
    ).find((p) => p.id === activeId).page;
    await place(activePage);
    const revision = (await snapshot(activePage)).revision;
    for (const page of players)
      await page.waitForFunction(
        (revision) =>
          JSON.parse(localStorage.getItem("syria_traders_save_v1")).game.revision >= revision,
        revision,
      );
  }
  for (const page of players) {
    assert.equal(await page.locator(".private-hand").count(), 3);
    assert.equal(await page.locator(".player-resources").count(), 1);
    assert.ok(
      (await page.locator(".resource-popup").count()) > 0,
      "Recent resource badges must work even with a skewed device clock",
    );
  }
  await host.getByRole("button", { name: "Roll dice", exact: true }).click();
  await host.waitForFunction(
    () => JSON.parse(localStorage.getItem("syria_traders_save_v1")).game.turnHasRolled,
  );
  if ((await snapshot(host)).mustMoveRobber)
    await host
      .getByRole("button", { name: /^Move bandit to/ })
      .first()
      .click();
  await host.getByRole("button", { name: "End turn", exact: true }).click();
  for (const page of players)
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem("syria_traders_save_v1")).game.turn === 2,
    );
  assert.equal(
    await host.getByRole("button", { name: "Roll dice", exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await players[1].getByRole("button", { name: "Roll dice", exact: true }).isEnabled(),
    true,
  );
  await host.screenshot({ path: path.join(output, "network-dashboard.png") });
  console.log("PASS four independent browsers, private hands, live setup and turn change");

  const reconnected = players.map((page) =>
    page.waitForResponse(
      (response) => response.url().endsWith("/events") && response.status() === 200,
      { timeout: 20000 },
    ),
  );
  await stopServer();
  await startServer();
  await Promise.all(reconnected);
  await players[1].getByRole("button", { name: "Roll dice", exact: true }).click();
  for (const page of players)
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem("syria_traders_save_v1")).game.turnHasRolled,
    );
  console.log("PASS automatic reconnection after host restart, without refresh");
  for (const page of [local, ...players]) {
    await page.reload();
    await settled(page);
    assert.equal((await snapshot(page)).phase, "main");
  }
  assert.equal((await snapshot(players[1])).turn, 2);
  console.log("PASS complete host restart preserves matches, media and browser seats");

  // TV table screen: hosts a room without a seat; players use phones.
  const tvPayloads = [];
  const tv = await pageFor(base);
  tv.on("response", async (response) => {
    if (!/\/api\/games(\/|$)/.test(response.url()) || response.url().endsWith("/events")) return;
    tvPayloads.push(await response.json().catch(() => ({})));
  });
  await tv.getByRole("button", { name: "TV screen", exact: true }).click();
  await tv.getByRole("button", { name: "Open a room on this TV" }).click();
  await tv.locator(".table-lobby .qr-code").waitFor();
  const tvCode = (await snapshot(tv)).roomCode;
  const phones = [];
  for (const name of ["Nour", "Yazan"]) {
    const phone = await pageFor(`${base}/?room=${tvCode}`);
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.getByLabel("Player 1 name").fill(name);
    await phone.getByRole("button", { name: "Join the table" }).click();
    await phone.locator(".lobby").waitFor();
    phones.push(phone);
  }
  assert.equal(await phones[0].getByRole("button", { name: "Start the match" }).count(), 1);
  assert.equal(await phones[1].getByRole("button", { name: "Start the match" }).count(), 0);
  await tv.getByRole("button", { name: "Start the match" }).waitFor();
  await tv.screenshot({ path: path.join(output, "tv-lobby.png") });
  await tv.getByRole("button", { name: "Start the match" }).click();
  for (const page of [tv, ...phones]) await page.locator(".dashboard-16x9").waitFor();
  for (let i = 0; i < 4; i++) {
    const state = await snapshot(tv);
    const activeId = state.players[state.currentPlayerIndex].id;
    const phone = (
      await Promise.all(
        phones.map(async (page) => ({ page, id: (await snapshot(page)).viewer.playerId })),
      )
    ).find((entry) => entry.id === activeId).page;
    await place(phone);
    const revision = (await snapshot(phone)).revision;
    await tv.waitForFunction(
      (revision) =>
        JSON.parse(localStorage.getItem("syria_traders_save_v1")).game.revision >= revision,
      revision,
    );
  }
  const tvState = await snapshot(tv);
  assert.equal(tvState.phase, "main");
  assert.equal(tvState.viewer.role, "table");
  assert.ok(tvState.players.every((player) => player.resources === null));
  assert.ok(tvState.players.some((player) => player.resourceTotal > 0));
  assert.deepEqual(tvState.gainEvents, []);
  assert.equal(tvState.hints, null);
  for (const payload of tvPayloads) {
    assert.ok(payload.game, "TV request failed");
    assert.ok(payload.game.players.every((player) => player.resources === null));
    assert.deepEqual(payload.game.gainEvents, []);
  }
  assert.equal(await tv.locator(".resource-row").count(), 0);
  assert.equal(await tv.locator(".private-hand").count(), 2);
  assert.equal(await tv.getByRole("button", { name: "Roll dice" }).count(), 0);
  assert.equal(await tv.locator(".table-status").count(), 1);
  assert.equal(await tv.locator(".tile-layer .tile-group").count(), 19);
  await tv.screenshot({ path: path.join(output, "tv-dashboard.png") });
  for (const phone of phones) {
    await phone.locator(".seat-hand").waitFor();
    assert.equal(await phone.locator(".seat-card").count(), 5);
    assert.equal(await phone.locator(".player-resources").count(), 1);
    assert.equal(await phone.locator(".private-hand").count(), 1);
  }
  const overflow = await phones[0].evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert.equal(overflow, false, "Phone seat scrolls horizontally");
  await phones[0].screenshot({ path: path.join(output, "phone-seat.png"), fullPage: true });
  await tv.reload();
  await tv.locator(".table-status").waitFor();
  assert.equal((await snapshot(tv)).viewer.role, "table");
  console.log("PASS TV table screen hosts a room, hides every hand and reconnects as a table");

  // A TV can also show a room that a phone hosts, mid-match, from a link.
  const watcher = await pageFor(`${base}/?room=${code}&tv=1`);
  await watcher.getByRole("button", { name: "Show this room on the TV" }).click();
  await watcher.locator(".table-status").waitFor();
  const watched = await snapshot(watcher);
  assert.equal(watched.viewer.isHost, false);
  assert.equal(watched.players.length, 4);
  assert.ok(watched.players.every((player) => player.resources === null));
  watcher.once("dialog", (dialog) => dialog.accept());
  await watcher.getByRole("button", { name: "Close TV screen" }).click();
  await watcher.getByRole("button", { name: "TV screen", exact: true }).waitFor();
  console.log("PASS TV screen joins a phone-hosted match by link and closes cleanly");
  assert.deepEqual(errors, [], "Browser runtime errors");
  fs.writeFileSync(
    path.join(output, "layout-measurements.json"),
    JSON.stringify(measurements, null, 2),
  );
  console.log("Screenshots and measurements: test-results/");
})()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
    for (const [index, context] of (browser?.contexts() || []).entries()) {
      await context
        .pages()[0]
        ?.screenshot({ path: path.join(output, `failure-${index}.png`), fullPage: true })
        .catch(() => {});
    }
  })
  .finally(async () => {
    await browser?.close();
    await stopServer();
  });
