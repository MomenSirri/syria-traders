const express = require("express");
const app = require("./app");
const sessions = require("./game/sessions");
const ports = require("./utils/ports");

// A plain-HTTP address for smart-TV browsers, which often refuse the self-signed
// certificate. It serves the game, but only the read-only table screen can use the
// API here: player tokens can act, so phones are kept on the HTTPS address.
const tv = express();
tv.disable("x-powered-by");

function refuse(req) {
  const host = (req.get("host") || "").replace(/:\d+$/, "");
  const secure = ports.secure ? `https://${host}:${ports.secure}` : "the HTTPS address";
  sessions.fail(`This address is only for TV screens. Phones join at ${secure}.`, 403);
}

tv.use("/api", express.json({ limit: "4mb" }), (req, _res, next) => {
  try {
    const [resource, id, action, extra] = req.path.split("/").filter(Boolean);
    if (resource !== "games") return next();
    // Opening a room the TV hosts, or a TV view of an existing room, needs no token.
    if (!id) return req.method === "POST" && req.body?.tableHost === true ? next() : refuse(req);
    if (action === "join") refuse(req);
    if (action === "table" && !extra) return next();
    const token = req.get("authorization")?.replace(/^Bearer /, "");
    const { session } = sessions.authenticate(id, token);
    return sessions.isTable(session) ? next() : refuse(req);
  } catch (error) {
    next(error);
  }
});
tv.use(app);
tv.use((err, _req, res, _next) => {
  res.status(err.statusCode || err.status || 500).json({ error: err.message || "Server error." });
});

module.exports = tv;
