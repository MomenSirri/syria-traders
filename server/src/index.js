const fs = require("fs");
const http = require("http");
const https = require("https");
const { spawn } = require("node:child_process");
const app = require("./app");
const tvApp = require("./tvApp");
const ports = require("./utils/ports");
const { lanAddresses } = require("./utils/network");
const { ensureDevCertificates, getCertificatePaths } = require("./utils/certificates");
const funnel = require("./utils/funnel");

const PORT = Number(process.env.PORT || 8443);
const LISTEN_HOST = process.env.LISTEN_HOST || "0.0.0.0";
// HTTPS=0 serves plain HTTP for cloud previews whose proxy already terminates TLS.
const USE_HTTPS = !["0", "false", "off"].includes(String(process.env.HTTPS).toLowerCase());
const scheme = USE_HTTPS ? "https" : "http";
// Smart-TV browsers use this plain-HTTP port (TV_PORT=off turns it off).
const TV_PORT = process.env.TV_PORT === "off" ? null : Number(process.env.TV_PORT || 8080);
const listensOnLan = ["0.0.0.0", "::"].includes(LISTEN_HOST);

function createServer() {
  if (!USE_HTTPS) return http.createServer(app);
  ensureDevCertificates();
  const { keyPath, certPath } = getCertificatePaths();
  return https.createServer(
    { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
    app,
  );
}

const server = createServer();
server.listen(PORT, LISTEN_HOST, () => {
  const actualPort = server.address().port;
  if (USE_HTTPS) ports.secure = actualPort;
  const url = `${scheme}://localhost:${actualPort}`;
  console.log(`Syria Traders is ready: ${url}`);
  for (const address of listensOnLan ? lanAddresses() : [])
    console.log(`Local network: ${scheme}://${address}:${actualPort}`);
  console.log("Keep this window open while playing. Press Ctrl+C to stop.");
  if (process.env.ONLINE === "1") funnel.enable(actualPort, USE_HTTPS);
  if (process.env.OPEN_BROWSER === "1" && process.platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "", url], { windowsHide: true, stdio: "ignore" }).on(
      "error",
      () => console.log(`Open ${url} in your browser.`),
    );
  }
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${PORT} is already in use. Close the other game server, or choose a different PORT.`
      : error.message,
  );
  process.exitCode = 1;
});

if (TV_PORT !== null) {
  const tvServer = http.createServer(tvApp);
  tvServer.listen(TV_PORT, LISTEN_HOST, () => {
    ports.tv = tvServer.address().port;
    const [address = "localhost"] = lanAddresses();
    const line = "=".repeat(60);
    console.log(`\n${line}\n  TV: type this address in the TV's browser\n`);
    console.log(`      http://${address}:${ports.tv}/tv\n`);
    console.log(`  Phones: scan the QR code shown on the TV\n${line}\n`);
  });
  tvServer.on("error", (error) =>
    console.error(
      error.code === "EADDRINUSE"
        ? `TV port ${TV_PORT} is busy, so the smart-TV address is off. Set TV_PORT to another port.`
        : error.message,
    ),
  );
}
