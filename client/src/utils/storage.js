export const SAVE_KEY = "syria_traders_save_v1";
const ART_KEY = "syria_traders_art_v2";

export function readSave() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  const saved = JSON.parse(raw);
  let art = null;
  // A damaged image cache must not discard a valid seat. The host will refill it.
  try {
    art = JSON.parse(localStorage.getItem(ART_KEY) || "null");
  } catch {
    /* Fetch artwork again on reconnect. */
  }
  return { ...saved, media: art?.gameId === saved.game?.id ? art.media : saved.media };
}

export function saveMatch(game, token, soundEnabled) {
  // Artwork is stored separately so every move doesn't serialize megabytes of photos.
  localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 2, game, token, soundEnabled }));
}

export function saveArtwork(gameId, media) {
  localStorage.setItem(ART_KEY, JSON.stringify({ gameId, media }));
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(ART_KEY);
}
