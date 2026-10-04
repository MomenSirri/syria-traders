const gameService = require("../game/gameService");

function handle(action, successCode = 200) {
  return (req, res, next) => {
    try {
      const payload = action(req);
      res.status(successCode).json({ game: payload });
    } catch (error) {
      next(error);
    }
  };
}

const createGame = handle((req) => gameService.createGame(req.body), 201);
const joinGame = handle((req) => gameService.joinGame(req.params.gameId, req.body));
const getGame = handle((req) => gameService.getGameState(req.params.gameId));
const placeSetup = handle((req) => gameService.placeSetup(req.params.gameId, req.body));
const rollDice = handle((req) => gameService.rollDice(req.params.gameId, req.body));
const buildRoad = handle((req) => gameService.buildRoad(req.params.gameId, req.body));
const buildVillage = handle((req) => gameService.buildVillage(req.params.gameId, req.body));
const buildCity = handle((req) => gameService.upgradeCity(req.params.gameId, req.body));
const tradeWithBank = handle((req) => gameService.tradeWithBank(req.params.gameId, req.body));
const moveRobber = handle((req) => gameService.moveRobber(req.params.gameId, req.body));
const endTurn = handle((req) => gameService.endTurn(req.params.gameId, req.body));

function getSampleMatch(_req, res, next) {
  try {
    res.json(gameService.getSampleMatchData());
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createGame,
  joinGame,
  getGame,
  placeSetup,
  rollDice,
  buildRoad,
  buildVillage,
  buildCity,
  tradeWithBank,
  moveRobber,
  endTurn,
  getSampleMatch,
};
