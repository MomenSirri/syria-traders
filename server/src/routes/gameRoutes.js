const express = require("express");
const service = require("../game/gameService");
const sessions = require("../game/sessions");
const store = require("../game/gameStore");

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
  handle((req, res) => res.status(201).json(sessions.create(req.body))),
);
router.post(
  "/games/:gameId/join",
  handle((req, res) => res.json(sessions.join(req.params.gameId, req.body))),
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
    // Tiny revision notifications avoid repeatedly sending images or unchanged boards.
    const send = (revision) => res.write(`data: ${JSON.stringify({ revision })}\n\n`);
    send(req.game.revision);
    store.updates.on(req.game.id, send);
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
    res.on("close", () => {
      clearInterval(heartbeat);
      store.updates.off(req.game.id, send);
    });
  }),
);
router.post(
  "/games/:gameId/start",
  handle((req, res) => {
    if (!req.session.host) sessions.fail("Only the host can start the match.", 403);
    sessions.assertAction(
      req.game,
      req.session,
      { playerId: req.session.playerId },
      req.get("x-game-revision"),
    );
    service.startGame(req.game.id);
    res.json({ game: sessions.view(store.getGame(req.game.id), req.session, true) });
  }),
);
router.post(
  "/games/:gameId/leave",
  handle((req, res) => {
    sessions.assertAction(req.game, req.session, req.body, req.get("x-game-revision"));
    sessions.leaveLobby(req.game, req.session);
    res.json({ left: true });
  }),
);
for (const [route, action] of Object.entries({
  "setup/place": "placeSetup",
  roll: "rollDice",
  "build/road": "buildRoad",
  "build/village": "buildVillage",
  "build/city": "upgradeCity",
  "trade/bank": "tradeWithBank",
  "robber/move": "moveRobber",
  "end-turn": "endTurn",
})) {
  router.post(
    `/games/:gameId/${route}`,
    handle((req, res) => {
      sessions.assertAction(req.game, req.session, req.body, req.get("x-game-revision"));
      service[action](req.game.id, req.body);
      res.json({ game: sessions.view(store.getGame(req.game.id), req.session) });
    }),
  );
}

module.exports = router;
