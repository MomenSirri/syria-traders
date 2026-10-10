// Test helper: plays the opening roll for turn order so players keep their
// seating order (the first seat rolls 12, the next 10, and so on).
const service = require("../src/game/gameService");
const store = require("../src/game/gameStore");

function rollInOrder(gameId) {
  const original = Math.random;
  try {
    store.getGame(gameId).players.forEach((player, index) => {
      Math.random = () => (5 - index) / 6 + 0.01;
      service.rollForOrder(gameId, { playerId: player.id });
    });
  } finally {
    Math.random = original;
  }
  return service.getGameState(gameId);
}

module.exports = { rollInOrder };

// The same over the network: each phone rolls for itself, seat order kept.
async function rollEachPhone(api, gameId, tokenOf) {
  const anyToken = Object.values(tokenOf)[0];
  const original = Math.random;
  try {
    const { players } = store.getGame(gameId);
    for (const [index, player] of players.entries()) {
      Math.random = () => (5 - index) / 6 + 0.01;
      const rolled = await api(
        `/games/${gameId}/order/roll`,
        { playerId: player.id },
        tokenOf[player.id],
      );
      if (rolled.status !== 200) throw new Error(rolled.error);
    }
  } finally {
    Math.random = original;
  }
  return (await api(`/games/${gameId}`, null, anyToken)).game;
}

module.exports.rollEachPhone = rollEachPhone;
