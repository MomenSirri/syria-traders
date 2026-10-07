const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const entry = path.join(__dirname, "../src/index.js");

// Starts the real entry point on a free port and resolves with the URL it announces.
function startServer(env) {
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      PORT: "0",
      GAME_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "syria-traders-start-")),
      OPEN_BROWSER: "0",
      TV_PORT: "off",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const ready = new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/ready: (\S+)/);
      if (match) resolve({ url: match[1], output: () => output });
    });
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("exit", (code) => reject(new Error(`Server exited (${code}): ${output}`)));
  });
  return { child, ready };
}

function getHealth(url) {
  const client = url.startsWith("https:") ? https : http;
  return new Promise((resolve, reject) =>
    client
      .get(`${url}/api/health`, { rejectUnauthorized: false }, (response) => {
        let body = "";
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
      })
      .on("error", reject),
  );
}

async function withServer(env, check) {
  const { child, ready } = startServer(env);
  try {
    await check(await ready);
  } finally {
    child.kill();
  }
}

test("HTTPS=0 serves plain HTTP on the configured host for cloud previews", () =>
  withServer({ HTTPS: "0", LISTEN_HOST: "127.0.0.1" }, async ({ url, output }) => {
    assert.match(url, /^http:\/\/localhost:\d+$/);
    assert.deepEqual(await getHealth(url.replace("localhost", "127.0.0.1")), {
      status: 200,
      body: { ok: true, service: "syria-traders-server" },
    });
    assert.doesNotMatch(output(), /Local network/);
  }));

test("HTTPS stays the default for local and LAN play", () =>
  withServer({ HTTPS: "", LISTEN_HOST: "" }, async ({ url }) => {
    assert.match(url, /^https:\/\/localhost:\d+$/);
    assert.equal((await getHealth(url)).status, 200);
  }));

// A stand-in for the tailscale command: it records every call and answers like a
// signed-in PC with Funnel approved.
function fakeTailscale() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "syria-traders-tailscale-"));
  const calls = path.join(dir, "calls.log");
  const bin = path.join(dir, "tailscale");
  fs.writeFileSync(
    bin,
    `#!/bin/sh
echo "$@" >> "${calls}"
if [ "$1" = status ]; then
  echo '{"BackendState":"Running","Self":{"DNSName":"game-pc.tail1234.ts.net."}}'
fi
`,
    { mode: 0o755 },
  );
  return { bin, calls: () => (fs.existsSync(calls) ? fs.readFileSync(calls, "utf8") : "") };
}

async function until(check) {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(check());
}

test("ONLINE=1 opens a Tailscale Funnel link, invites use it, and stopping closes it", async (t) => {
  if (process.platform === "win32") return t.skip("uses a shell-script stand-in");
  const tailscale = fakeTailscale();
  const { child, ready } = startServer({
    ONLINE: "1",
    TAILSCALE: tailscale.bin,
    HTTPS: "",
    LISTEN_HOST: "127.0.0.1",
  });
  const { url, output } = await ready;
  try {
    const port = url.split(":").pop();
    await until(() => output().includes("https://game-pc.tail1234.ts.net"));
    assert.match(tailscale.calls(), new RegExp(`funnel --bg https\\+insecure://localhost:${port}`));
    const room = await new Promise((resolve, reject) => {
      const request = https.request(
        `https://127.0.0.1:${port}/api/games`,
        {
          method: "POST",
          rejectUnauthorized: false,
          headers: { "Content-Type": "application/json" },
        },
        (response) => {
          let body = "";
          response.on("data", (chunk) => (body += chunk));
          response.on("end", () => resolve(JSON.parse(body)));
        },
      );
      request.on("error", reject);
      request.end(JSON.stringify({ mode: "online", playerNames: ["Momen"] }));
    });
    assert.equal(room.game.hostPorts.public, "https://game-pc.tail1234.ts.net");
  } finally {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await exited;
  }
  assert.match(tailscale.calls(), /funnel reset/);
});

test("ONLINE=1 without Tailscale still serves the game and says how to fix it", () =>
  withServer(
    { ONLINE: "1", TAILSCALE: "/nonexistent/tailscale", HTTPS: "0", LISTEN_HOST: "127.0.0.1" },
    async ({ url, output }) => {
      await until(() => output().includes("Tailscale is not installed"));
      assert.equal((await getHealth(url.replace("localhost", "127.0.0.1"))).status, 200);
    },
  ));
