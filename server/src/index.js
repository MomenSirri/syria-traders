const fs = require("fs");
const http = require("http");
const https = require("https");
const { spawn } = require("node:child_process");
const app = require("./app");
const tvApp = require("./tvApp");
const ports = require("./utils/ports");
const { lanAddresses } = require("./utils/network");
const { ensureDevCertificates, getCertificatePaths } = require("./utils/certificates");

const PORT = Number(process.env.PORT || 8443);
// Smart-TV browsers use this plain-HTTP port (TV_PORT=off turns it off).
const TV_PORT = process.env.TV_PORT === "off" ? null : Number(process.env.TV_PORT || 8080);

ensureDevCertificates();
const { keyPath, certPath } = getCertificatePaths();

const httpsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

const server = https.createServer(httpsOptions, app);
server.listen(PORT, "0.0.0.0", () => {
  const actualPort = server.address().port;
  ports.secure = actualPort;
  const url = `https://localhost:${actualPort}`;
  console.log(`Syria Traders is ready: ${url}`);
  for (const address of lanAddresses())
    console.log(`Local network: https://${address}:${actualPort}`);
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

if (TV_PORT !== null) {
  const tvServer = http.createServer(tvApp);
  tvServer.listen(TV_PORT, "0.0.0.0", () => {
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
