// A browser allows about six connections to the host, and every open game tab
// holds one for its live stream. Forgotten tabs used to use them all up, so moves
// could no longer reach the host. Tabs tell each other when they connect (a
// storage event reaches every other tab of this browser), and a tab nobody is
// looking at then gives its connection back until it is shown again.
export const TAB_KEY = "syria_traders_tab_v1";
// The host sends a heartbeat every 15 seconds. A stream silent for longer than
// this, on a screen that was just woken up, is treated as dead.
export const STALE_MS = 20000;

export function announceTab(storage) {
  try {
    storage.setItem(TAB_KEY, String(Date.now()));
  } catch {
    /* Private browsing or a full disk: this tab simply keeps its stream. */
  }
}

export const shouldPark = (event, hidden) =>
  hidden && event.key === TAB_KEY && Boolean(event.newValue);

// Called when the tab is shown, focused, or back online.
export const shouldRestart = ({ hidden, parked, lastBeat, now }) =>
  !hidden && (parked || now - lastBeat > STALE_MS);
