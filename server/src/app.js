const express = require("express");
const cors = require("cors");
const path = require("node:path");
const fs = require("node:fs");
const gameRoutes = require("./routes/gameRoutes");

const app = express();

app.disable("x-powered-by");
// A tunnel on this PC (for example Tailscale Funnel) connects from loopback and names
// the real visitor in X-Forwarded-For. Anyone else's forwarded header is ignored.
app.set("trust proxy", "loopback");
if (process.env.ALLOWED_ORIGINS) app.use(cors({ origin: process.env.ALLOWED_ORIGINS.split(",") }));
app.use(express.json({ limit: "4mb" }));

app.get("/", (_req, res, next) => {
  if (fs.existsSync(path.join(__dirname, "../../client/dist/index.html"))) return next();
  res.type("html").send(`
    <h1>Syria Traders API</h1>
    <p>This port is for backend API routes.</p>
    <p>Open the game frontend at <a href="https://localhost:5173">https://localhost:5173</a></p>
    <p>Health check: <a href="/api/health">/api/health</a></p>
  `);
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "syria-traders-server" });
});

app.use("/api", gameRoutes);
app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));
const clientDist = path.join(__dirname, "../../client/dist");
app.use(
  express.static(clientDist, {
    maxAge: "1h",
    setHeaders: (res, file) => {
      if (file.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
    },
  }),
);
app.get("*", (_req, res) => {
  if (fs.existsSync(path.join(clientDist, "index.html")))
    res.sendFile(path.join(clientDist, "index.html"));
  else res.status(404).send("Build the client with npm run build, or open https://localhost:5173.");
});

app.use((err, _req, res, _next) => {
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    error: err.message || "Unexpected server error.",
  });
});

module.exports = app;
