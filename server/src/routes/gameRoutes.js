const express = require("express");
const service = require("../game/gameService");
const sessions = require("../game/sessions");
const store = require("../game/gameStore");
const presence = require("../game/presence");
const reactions = require("../game/reactions");

const router = express.Router();

const handle = (fn) => (req, res, next) => {
  try {
    fn(req, res);
  } catch (error) {
    next(error);
  }
};
router.post(
  "/games",
  handle((req, res) => res.status(201).json(sessions.create(req.body, req.ip))),
);
router.post(
  "/games/:gameId/join",
  handle((req, res) => res.json(sessions.join(req.params.gameId, req.body, req.ip))),
);
router.post(
  "/games/:gameId/table",
  handle((req, res) => res.status(201).json(sessions.watch(req.params.gameId, req.ip))),
);
router.use("/games/:gameId", (req, _res, next) => {
  try {
    Object.assign(
      req,
      sessions.authenticate(req.params.gameId, req.get("authorization")?.replace(/^Bearer /, "")),
    );
    next();
  } catch (error) {
    next(error);
  }
});
router.get(
  "/games/:gameId",
  handle((req, res) => {
    res
      .set("Cache-Control", "no-store")
      .json({ game: sessions.view(req.game, req.session, req.query.media === "1") });
  }),
);
// The pulse is the lifeline: a tiny answer any phone can fetch, even one whose
// browser or network will not keep the live stream below open.
router.get(
  "/games/:gameId/pulse",
  handle((req, res) => {
    presence.seen(req.game.id, req.session.playerId);
    res.set("Cache-Control", "no-store").json({
      revision: req.game.revision,
      presence: presence.version(req.game.id),
    });
  }),
);
router.get(
  "/games/:gameId/events",
  handle((req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    // Notice a phone that vanished (sleep, Wi-Fi drop) instead of holding a dead socket.
    req.socket.setKeepAlive(true, 30000);
    const who = sessions.isTable(req.session)
      ? "TV screen"
      : req.game.players.find((player) => player.id === req.session.playerId)?.name || "A player";
    const note = (what) =>
      console.log(`[${new Date().toLocaleTimeString()}] Room ${req.game.roomCode}: ${who} ${what}`);
    if (req.game.mode === "online") note(`connected (${req.ip})`);
    // Tiny revision notifications avoid repeatedly sending images or unchanged boards.
    // A reaction rides the same stream; it never changes the match revision.
    const send = (revision, reaction) =>
      res.write(
        `data: ${JSON.stringify({ revision, presence: presence.version(req.game.id), reaction })}\n\n`,
      );
    const react = (reaction) => send(store.getRevision(req.game.id), reaction);
    // Joining first lets this stream's opening event carry the new presence number.
    presence.join(req.game.id, req.session.playerId);
    send(req.game.revision);
    store.updates.on(req.game.id, send);
    reactions.events.on(req.game.id, react);
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 5000);
    res.on("close", () => {
      clearInterval(heartbeat);
      store.updates.off(req.game.id, send);
      reactions.events.off(req.game.id, react);
      presence.leave(req.game.id, req.session.playerId);
      if (req.game.mode === "online") note("disconnected");
    });
  }),
);
router.post(
  "/games/:gameId/start",
  handle((req, res) => {
    if (!req.session.host) sessions.fail("Only the host can start the match.", 403);
    sessions.assertRevision(req.game, req.get("x-game-revision"));
    service.startGame(req.game.id);
    res.json({ game: sessions.view(store.getGame(req.game.id), req.session, true) });
  }),
);
router.post(
  "/games/:gameId/leave",
  handle((req, res) => {
    if (sessions.isTable(req.session)) {
      sessions.leaveTable(req.game, req.session);
      return res.json({ left: true });
    }
    sessions.assertAction(req.game, req.session, req.body, req.get("x-game-revision"));
    sessions.leaveLobby(req.game, req.session);
    res.json({ left: true });
  }),
);
// A reaction is public and short-lived: no revision check and nothing saved.
router.post(
  "/games/:gameId/react",
  handle((req, res) => {
    sessions.assertAction(req.game, req.session, req.body, undefined, false);
    res.json({ reaction: reactions.send(req.game, req.body.playerId, req.body.reaction) });
  }),
);
for (const [route, action] of Object.entries({
  "order/roll": "rollForOrder",
  "setup/place": "placeSetup",
  roll: "rollDice",
  "build/road": "buildRoad",
  "build/village": "buildVillage",
  "build/city": "upgradeCity",
  "trade/bank": "tradeWithBank",
  "trade/request": "requestTrade",
  "trade/offer": "offerTrade",
  "trade/withdraw": "withdrawTradeOffer",
  "trade/decline": "declineTradeOffer",
  "trade/cancel": "cancelTrade",
  "trade/accept": "acceptTradeOffer",
  "wish/post": "postWish",
  "wish/withdraw": "withdrawWish",
  "wish/accept": "acceptWish",
  "robber/move": "moveRobber",
  discard: "discardCards",
  "dev/buy": "buyDevelopmentCard",
  "dev/play": "playDevelopmentCard",
  "end-turn": "endTurn",
})) {
  router.post(
    `/games/:gameId/${route}`,
    handle((req, res) => {
      // Trade offers name the request or offer they answer, so several phones can
      // respond at once without tripping over each other's revisions.
      // Discards after a seven work the same way: each player returns their own,
      // and so do the opening rolls for turn order.
      // "Anyone have...?" requests come from players waiting for their turn, too.
      const named =
        (route.startsWith("trade/") && route !== "trade/bank") ||
        route.startsWith("wish/") ||
        route === "discard" ||
        route === "order/roll";
      sessions.assertAction(req.game, req.session, req.body, req.get("x-game-revision"), !named);
      service[action](req.game.id, req.body);
      res.json({ game: sessions.view(store.getGame(req.game.id), req.session) });
    }),
  );
}

module.exports = router;
