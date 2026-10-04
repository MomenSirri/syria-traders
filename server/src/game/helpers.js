function shuffle(input) {
  const copy = [...input];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resourceTemplate(initial = 0) {
  return {
    wheat: initial,
    wood: initial,
    stone: initial,
    brick: initial,
    sheep: initial,
  };
}

function hasEnoughResources(resources, cost) {
  return Object.entries(cost).every(([resource, amount]) => (resources[resource] || 0) >= amount);
}

function spendResources(resources, bank, cost) {
  Object.entries(cost).forEach(([resource, amount]) => {
    resources[resource] -= amount;
    bank[resource] += amount;
  });
}

function getResourceTotal(resources) {
  return Object.values(resources).reduce((sum, value) => sum + value, 0);
}

function randomItem(list) {
  if (!list.length) {
    return null;
  }
  return list[Math.floor(Math.random() * list.length)];
}

module.exports = {
  shuffle,
  clone,
  resourceTemplate,
  hasEnoughResources,
  spendResources,
  getResourceTotal,
  randomItem,
};
