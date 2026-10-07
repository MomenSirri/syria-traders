const fs = require("node:fs");
const { spawn, execFileSync } = require("node:child_process");
const ports = require("./ports");

// Online play (ONLINE=1, used by run-game-online.bat): Tailscale Funnel gives this PC
// a public https address while the game runs, and is switched off when it stops.
const WINDOWS_PATH = "C:\\Program Files\\Tailscale\\tailscale.exe";
const line = "=".repeat(60);

function binary() {
  if (process.env.TAILSCALE) return process.env.TAILSCALE;
  if (process.platform === "win32" && fs.existsSync(WINDOWS_PATH)) return WINDOWS_PATH;
  return "tailscale";
}

const say = (...lines) =>
  console.log(`\n${line}\n${lines.map((text) => `  ${text}`).join("\n")}\n${line}\n`);

function run(args, onOutput) {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn(binary(), args, { windowsHide: true });
    const read = (chunk) => {
      output += chunk;
      onOutput?.(String(chunk));
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("error", (error) => resolve({ code: null, error, output }));
    child.on("close", (code) => resolve({ code, output }));
  });
}

let started = false;
function stop() {
  if (!started) return;
  started = false;
  try {
    execFileSync(binary(), ["funnel", "reset"], {
      stdio: "ignore",
      timeout: 8000,
      windowsHide: true,
    });
    console.log("Online link switched off.");
  } catch {
    console.log('Could not switch the online link off. Run "tailscale funnel reset" yourself.');
  }
}

async function start(port, secure) {
  const status = await run(["status", "--json"]);
  if (status.error)
    return say(
      "ONLINE LINK: Tailscale is not installed, so the game is only on your Wi-Fi.",
      "Install it from https://tailscale.com/download, sign in, then run",
      "run-game-online.bat again.",
    );
  let self;
  try {
    const parsed = JSON.parse(status.output);
    if (parsed.BackendState === "Running") self = parsed.Self;
  } catch {
    // Not signed in, or an old Tailscale without JSON status: handled below.
  }
  const name = self?.DNSName?.replace(/\.$/, "");
  if (!name)
    return say(
      "ONLINE LINK: Tailscale is not signed in, so the game is only on your Wi-Fi.",
      "Open Tailscale from the Start menu, sign in, then run run-game-online.bat again.",
    );
  const target = `${secure ? "https+insecure" : "http"}://localhost:${port}`;
  // The first time, Tailscale prints a link to approve Funnel and waits for it.
  started = true;
  const funnel = await run(["funnel", "--bg", target], (text) => {
    const approve = text.match(/https:\/\/login\.tailscale\.com\/\S+/);
    if (approve)
      say(
        "ONLINE LINK: approve Funnel once, in your browser:",
        approve[0],
        "The link appears here when it is approved.",
      );
  });
  if (funnel.code !== 0) {
    started = false;
    return say(
      "ONLINE LINK: Tailscale could not open it, so the game is only on your Wi-Fi.",
      ...funnel.output.trim().split("\n").slice(-3),
    );
  }
  ports.publicUrl = `https://${name}`;
  say(
    "ONLINE LINK for friends anywhere:",
    "",
    `    ${ports.publicUrl}`,
    "",
    "Host a room; its invite link and QR code use this address.",
    "Closing this window switches the online link off.",
  );
}

function enable(port, secure) {
  // Closing the window sends SIGHUP on Windows; Ctrl+C sends SIGINT.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"])
    process.on(signal, () => {
      stop();
      process.exit(0);
    });
  process.on("exit", stop);
  return start(port, secure).catch((error) =>
    console.error(`Online link failed: ${error.message}`),
  );
}

module.exports = { enable };
