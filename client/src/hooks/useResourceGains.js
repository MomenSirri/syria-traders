import { useEffect, useState } from "react";

export const STICKY_MS = 6000;
export const FADE_MS = 700;

// Events carry server timestamps. Refresh/reconnect never restarts an old timer.
export function visibleGains(events, now) {
  const groups = new Map();
  for (const event of events || []) {
    const age = Math.max(0, now - event.at);
    if (age >= STICKY_MS + FADE_MS) continue;
    for (const gain of event.gains) {
      const key = `${gain.playerId}:${gain.resource}`;
      const previous = groups.get(key);
      groups.set(key, {
        ...gain,
        amount: gain.amount + (previous?.amount || 0),
        at: Math.max(event.at, previous?.at || 0),
        key,
      });
    }
  }
  return [...groups.values()].map((gain) => ({ ...gain, fading: now - gain.at >= STICKY_MS }));
}

export default function useResourceGains(events, clockOffset = 0) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now() + clockOffset);
  }, [events, clockOffset]);
  useEffect(() => {
    const current = Date.now() + clockOffset;
    // Schedule only the next expiry; no per-frame render loop or accumulating timers.
    const boundaries = (events || [])
      .flatMap((event) => [event.at + STICKY_MS, event.at + STICKY_MS + FADE_MS])
      .filter((time) => time > current);
    if (!boundaries.length) return;
    const timer = setTimeout(
      () => setNow(Date.now() + clockOffset),
      Math.min(...boundaries) - current + 5,
    );
    return () => clearTimeout(timer);
  }, [events, now, clockOffset]);
  return visibleGains(events, now);
}
