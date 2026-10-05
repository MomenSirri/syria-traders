// Counts recent attempts per key (an address, a room) in memory, so a guesser on
// the internet cannot walk through room codes or rejoin PINs. Nothing is saved.
const recent = new Map();

function count(key, windowMs) {
  const now = Date.now();
  const kept = (recent.get(key) || []).filter((at) => now - at < windowMs);
  if (kept.length) recent.set(key, kept);
  else recent.delete(key);
  return kept;
}

// Throws 429 once `key` has used up `max` attempts within `windowMs`.
function check(key, max, windowMs, message) {
  if (count(key, windowMs).length >= max)
    throw Object.assign(new Error(message), { statusCode: 429 });
}

function note(key, windowMs) {
  // Addresses that never come back would otherwise stay listed forever.
  if (recent.size > 5000)
    for (const [stale, times] of recent)
      if (Date.now() - times.at(-1) > 60 * 60000) recent.delete(stale);
  recent.set(key, [...count(key, windowMs), Date.now()]);
}

module.exports = { check, note };
