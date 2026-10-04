const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("node:os");
const { spawn } = require("node:child_process");
const app = require("./app");
const { ensureDevCertificates, getCertificatePaths } = require("./utils/certificates");

const PORT = Number(process.env.PORT || 8443);
const LISTEN_HOST = process.env.LISTEN_HOST || "0.0.0.0";
// HTTPS=0 serves plain HTTP for cloud previews whose proxy already terminates TLS.
const USE_HTTPS = !["0", "false", "off"].includes(String(process.env.HTTPS).toLowerCase());
const scheme = USE_HTTPS ? "https" : "http";

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
  const url = `${scheme}://localhost:${actualPort}`;
  console.log(`Syria Traders is ready: ${url}`);
  const listensOnLan = ["0.0.0.0", "::"].includes(LISTEN_HOST);
  for (const address of listensOnLan ? Object.values(os.networkInterfaces()).flat() : []) {
    if (address.family === "IPv4" && !address.internal)
      console.log(`Local network: ${scheme}://${address.address}:${actualPort}`);
  }
  console.log("Keep this window open while playing. Press Ctrl+C to stop.");
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
