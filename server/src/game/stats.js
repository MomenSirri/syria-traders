// Match statistics for the end-of-match awards. Everything counted here is
// public at the table already (the log names every steal, trade and roll), so
// the awards never reveal a hand. Saves from before statistics start counting
// from their next move.
const blank = () => ({
  diceCards: 0,
  sevens: 0,
  steals: 0,
  robbed: 0,
  returned: 0,
  trades: 0,
  bankTrades: 0,
});

function count(game, playerId, key, amount = 1) {
  game.stats ||= { dice: {}, players: {} };
  const entry = (game.stats.players[playerId] ||= blank());
  entry[key] = (entry[key] || 0) + amount;
}

function countRoll(game, total) {
  game.stats ||= { dice: {}, players: {} };
  game.stats.dice[total] = (game.stats.dice[total] || 0) + 1;
}

// Each award goes to whoever has the most; ties share it, and nobody gets an
// award for zero.
const AWARDS = [
  {
    key: "harvest",
    title: "Lucky harvest",
    unit: "cards from the dice",
    stat: "diceCards",
  },
  { key: "thief", title: "Master thief", unit: "cards stolen", stat: "steals" },
  { key: "robbed", title: "Most robbed", unit: "times robbed", stat: "robbed" },
  {
    key: "trader",
    title: "Trade king",
    unit: "trades with players",
    stat: "trades",
  },
  {
    key: "bandit",
    title: "Bandit's friend",
    unit: "sevens rolled",
    stat: "sevens",
  },
  {
    key: "road",
    title: "Road builder",
    unit: "roads in a row",
    stat: "longestRoad",
  },
  {
    key: "knight",
    title: "Knight commander",
    unit: "knights played",
    stat: "knightsPlayed",
  },
];

function awards(game, roadLengths) {
  const value = (player, stat) => {
    if (stat === "longestRoad") return roadLengths[player.id] || 0;
    if (stat === "knightsPlayed") return player.knightsPlayed || 0;
    return game.stats?.players?.[player.id]?.[stat] || 0;
  };
  const dice = {};
  for (let total = 2; total <= 12; total += 1) dice[total] = game.stats?.dice?.[total] || 0;
  return {
    dice,
    awards: AWARDS.map(({ stat, ...award }) => {
      const best = Math.max(0, ...game.players.map((player) => value(player, stat)));
      return {
        ...award,
        value: best,
        playerIds: best
          ? game.players.filter((player) => value(player, stat) === best).map((p) => p.id)
          : [],
      };
    }).filter((award) => award.playerIds.length),
  };
}

module.exports = { count, countRoll, awards };
