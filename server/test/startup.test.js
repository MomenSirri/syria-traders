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
