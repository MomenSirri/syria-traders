const fs = require("fs");
const https = require("https");
const os = require("node:os");
const { spawn } = require("node:child_process");
const app = require("./app");
const { ensureDevCertificates, getCertificatePaths } = require("./utils/certificates");

const PORT = Number(process.env.PORT || 8443);

ensureDevCertificates();
const { keyPath, certPath } = getCertificatePaths();

const httpsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

const server = https.createServer(httpsOptions, app);
server.listen(PORT, "0.0.0.0", () => {
  const actualPort = server.address().port;
  const url = `https://localhost:${actualPort}`;
  console.log(`Syria Traders is ready: ${url}`);
  for (const address of Object.values(os.networkInterfaces()).flat()) {
    if (address.family === "IPv4" && !address.internal)
      console.log(`Local network: https://${address.address}:${actualPort}`);
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
