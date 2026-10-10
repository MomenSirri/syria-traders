import { useCallback, useEffect, useRef, useState } from "react";
import { anySignal, gameApi, watchMatch } from "../api/gameApi";
import { readSave, saveMatch, saveArtwork, clearSave } from "../utils/storage";
import { announceTab, shouldPark, shouldRestart } from "../utils/tabs";

const REACTION_MS = 4500;

export default function useMatch() {
  const [game, setGame] = useState(null);
  const [token, setToken] = useState("");
  const [media, setMedia] = useState({ playerImages: {}, hexTexturesByRegion: {} });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState("connecting");
  // What the screen shows: a drop that heals within a moment never locks the table.
  const [shown, setShown] = useState("connecting");
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [stalled, setStalled] = useState(false);
  // True when this phone will not promise to keep its screen on.
  const [sleepy, setSleepy] = useState(false);
  // Reactions from the table, shown for a few seconds and never saved.
  const [reactions, setReactions] = useState([]);
  const gameRef = useRef(null);
  const actionLock = useRef(false);
  // A parked tab has handed its live stream to another tab of this browser.
  const parked = useRef(false);
  const lastBeat = useRef(Date.now());
  const artworkFor = useRef("");

  useEffect(() => {
    const offline = () => setConnection("reconnecting");
    const online = () => setReconnectKey((key) => key + 1);
    // A phone waking from sleep, or a tab coming back into view, reconnects at
    // once instead of waiting for the heartbeat to notice a dead stream.
    const wake = () => {
      const state = {
        hidden: document.hidden,
        parked: parked.current,
        lastBeat: lastBeat.current,
        now: Date.now(),
      };
      if (!shouldRestart(state)) return;
      parked.current = false;
      lastBeat.current = Date.now();
      setReconnectKey((key) => key + 1);
    };
    const yieldStream = (event) => {
      if (parked.current || !shouldPark(event, document.hidden)) return;
      parked.current = true;
      setReconnectKey((key) => key + 1);
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("storage", yieldStream);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.removeEventListener("focus", wake);
      window.removeEventListener("pageshow", wake);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("storage", yieldStream);
    };
  }, []);

  // Say more once a reconnect is taking long enough to worry about.
  const live = connection === "live";
  useEffect(() => {
    setStalled(false);
    if (live) return setShown("live");
    const grace = setTimeout(() => setShown("reconnecting"), 1500);
    const timer = setTimeout(() => setStalled(true), 8000);
    return () => {
      clearTimeout(grace);
      clearTimeout(timer);
    };
  }, [live]);

  // Keep a phone's screen on during a network match: a sleeping phone drops its seat's
  // connection. The lock is released by the browser when the tab is hidden, so ask again.
  const awake = Boolean(game?.id && game.mode === "online" && !game.winnerId);
  useEffect(() => {
    if (!awake) return;
    if (!navigator.wakeLock) return setSleepy(true);
    let lock,
      asking = false,
      done = false;
    const hold = () => {
      if (document.hidden || lock || asking) return;
      asking = true;
      navigator.wakeLock
        .request("screen")
        .then((granted) => {
          asking = false;
          if (done) return granted.release().catch(() => {});
          lock = granted;
          setSleepy(false);
          // The phone may take the lock back (low battery, a call): ask again.
          granted.addEventListener("release", () => {
            lock = null;
            if (!done) setTimeout(hold, 1000);
          });
        })
        .catch(() => {
          // Battery saver refuses the lock. Play continues; the banner explains drops.
          asking = false;
          if (!done) setSleepy(true);
        });
    };
    hold();
    // Some phones only grant the lock after a touch, so every tap asks again.
    document.addEventListener("visibilitychange", hold);
    document.addEventListener("pointerdown", hold);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", hold);
      document.removeEventListener("pointerdown", hold);
      lock?.release().catch(() => {});
      setSleepy(false);
    };
  }, [awake]);

  const accept = useCallback((next) => {
    if (gameRef.current?.id === next.id && gameRef.current.revision > next.revision) return;
    const { media: artwork, ...snapshot } = next;
    // Use the host's clock for gain lifetimes, even on a phone with clock skew.
    snapshot.clockOffset = (next.serverTime || Date.now()) - Date.now();
    if (artwork) {
      artworkFor.current = next.id;
      setMedia(artwork);
      try {
        saveArtwork(next.id, artwork);
      } catch {
        setSaveError("Photo storage is full. The server still has your match and photos.");
      }
    }
    gameRef.current = snapshot;
    setGame(snapshot);
  }, []);

  useEffect(() => {
    try {
      const saved = readSave();
      if (saved?.token && saved.game?.id) {
        gameRef.current = saved.game;
        setGame(saved.game);
        setToken(saved.token);
        if (saved.media) setMedia(saved.media);
        setSoundEnabled(Boolean(saved.soundEnabled));
      } else if (saved?.game)
        setError(
          "This older save has no network session. It remains in browser storage until you create a new match.",
        );
    } catch {
      setError("The browser save could not be read. You can create a new match.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!game || !token || loading) return;
    try {
      saveMatch(game, token, soundEnabled);
    } catch {
      setSaveError(
        "Browser storage is full or unavailable. Keep this tab open to retain your player session.",
      );
    }
  }, [game, token, loading, soundEnabled]);

  useEffect(() => {
    if (!game?.id || !token) return;
    if (parked.current) {
      setConnection("reconnecting");
      return;
    }
    // Two lines to the host. The live stream delivers moves instantly. The pulse is
    // a small request repeated every few seconds: it proves the host is reachable
    // and carries the same news, so a phone whose browser or Wi-Fi keeps cutting the
    // stream goes on playing instead of locking on "Reconnecting".
    const controller = new AbortController();
    let retryTimer,
      pulseTimer,
      stream,
      streaming = false,
      opened = 0,
      asking = false,
      pulses = true,
      failures = 0,
      presence,
      refreshing = false,
      requested = 0;
    const refresh = async (revision, includeMedia = false) => {
      requested = Math.max(requested, revision);
      if (refreshing) return;
      refreshing = true;
      try {
        do {
          const { game: next } = await gameApi.get(
            game.id,
            token,
            includeMedia || gameRef.current?.phase === "lobby",
            controller.signal,
          );
          if (!controller.signal.aborted) accept(next);
          includeMedia = false;
        } while (requested > (gameRef.current?.revision || 0) && !controller.signal.aborted);
      } finally {
        refreshing = false;
      }
    };
    const reached = () => {
      if (controller.signal.aborted) return;
      lastBeat.current = Date.now();
      setConnection("live");
    };
    const lost = (failure) => {
      if (controller.signal.aborted) return;
      if ([401, 404].includes(failure?.status)) setError(failure.message);
      setConnection("reconnecting");
    };
    // News from either line: fetch the match if it moved or a player came or went.
    const update = (revision, seen) => {
      const moved = presence !== undefined && seen !== presence;
      presence = seen;
      // Photos are fetched once; after that only the small game state.
      const art = artworkFor.current !== game.id;
      if (moved || art || revision > (gameRef.current?.revision || 0))
        return refresh(revision, art);
      return Promise.resolve();
    };
    const pulse = async () => {
      if (controller.signal.aborted || asking || !pulses) return;
      asking = true;
      try {
        const beat = await gameApi.pulse(game.id, token, controller.signal);
        await update(beat.revision, beat.presence);
        reached();
      } catch (failure) {
        // A host from before the pulse existed: rely on the stream alone, as before.
        if (failure.status === 404 && /route/i.test(failure.message)) pulses = false;
        // A stream that is still talking outvotes one slow answer.
        else if (!(streaming && Date.now() - lastBeat.current < 8000)) lost(failure);
      }
      asking = false;
      if (!controller.signal.aborted && pulses)
        pulseTimer = setTimeout(pulse, streaming ? 5000 : 1500);
    };
    const connect = async () => {
      if (controller.signal.aborted) return;
      let linked;
      try {
        stream = new AbortController();
        linked = anySignal([controller.signal, stream.signal]);
        await watchMatch(
          game.id,
          token,
          linked.signal,
          (revision, seen, reaction) => {
            if (reaction) {
              setReactions((current) => [...current.slice(-7), reaction]);
              setTimeout(
                () => setReactions((current) => current.filter((entry) => entry !== reaction)),
                REACTION_MS,
              );
            }
            // Restart the stream after a failed refresh, even if no more moves arrive.
            update(revision, seen).catch(() => stream.abort());
          },
          () => {
            streaming = true;
            opened = Date.now();
            reached();
            announceTab(localStorage);
            // A fresh stream may follow a host restart: read the match once in full.
            refresh(0, artworkFor.current !== game.id).catch(() => stream.abort());
          },
          () => (lastBeat.current = Date.now()),
        );
      } catch (failure) {
        if (!controller.signal.aborted && [401, 404].includes(failure.status))
          setError(failure.message);
      }
      linked?.release();
      if (controller.signal.aborted) return;
      // A stream that held for a while is reopened at once. One that keeps dying is
      // tried less and less often: the pulse carries the game in the meantime.
      failures = streaming && Date.now() - opened > 30000 ? 0 : failures + 1;
      streaming = false;
      if (pulses) {
        clearTimeout(pulseTimer);
        pulse();
      } else setConnection("reconnecting");
      retryTimer = setTimeout(connect, failures <= 1 ? 600 : failures <= 4 ? 2500 : 20000);
    };
    lastBeat.current = Date.now();
    refresh(0, artworkFor.current !== game.id).then(reached, lost);
    connect();
    pulseTimer = setTimeout(pulse, 1500);
    return () => {
      controller.abort();
      stream?.abort();
      clearTimeout(retryTimer);
      clearTimeout(pulseTimer);
    };
  }, [game?.id, token, accept, reconnectKey]);

  async function enter(operation) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await operation();
      // The finalized server match now owns these photos. Avoid keeping a second
      // full set in the setup draft and exhausting the browser's storage quota.
      try {
        localStorage.removeItem("syria_traders_setup_v2");
      } catch {
        /* Session saving reports unavailable storage. */
      }
      setToken(result.token);
      accept(result.game);
    } catch (failure) {
      setError(failure.message);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  async function act(route, body = {}) {
    if (actionLock.current || shown !== "live") return false;
    actionLock.current = true;
    setBusy(true);
    setError("");
    let attempt = 0;
    try {
      const current = gameRef.current;
      const playerId =
        current.mode === "online"
          ? current.viewer.playerId
          : current.players[current.currentPlayerIndex].id;
      let result;
      // A network blip retries the move. The revision check makes that safe: if the
      // first try did reach the host, the retry is refused and the screen refreshes.
      for (;;) {
        try {
          result = await gameApi.act(current, token, route, { playerId, ...body });
          break;
        } catch (failure) {
          if (failure.status || ++attempt > 2) throw failure;
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
      }
      accept(result.game);
      return true;
    } catch (failure) {
      setError(attempt && failure.status === 409 ? "" : failure.message);
      if (!failure.status) {
        setConnection("reconnecting");
        setReconnectKey((key) => key + 1);
      }
      if (failure.status === 409) {
        try {
          const result = await gameApi.get(game.id, token);
          accept(result.game);
        } catch {
          setConnection("reconnecting");
        }
      }
      return false;
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  // Fire and forget: a reaction that doesn't arrive is no loss, and it must
  // never hold up or block a move.
  async function react(key) {
    const current = gameRef.current;
    if (!current?.viewer?.playerId || shown !== "live") return;
    try {
      await gameApi.react(current, token, { playerId: current.viewer.playerId, reaction: key });
    } catch {
      /* Too fast, or the connection dropped: skip it. */
    }
  }

  async function leave() {
    if (actionLock.current) return;
    const current = gameRef.current;
    const lobby = current.phase === "lobby";
    const table = current.viewer?.role === "table";
    const message = table
      ? "Close the TV screen for this room? Players keep their seats, and you can reopen it with the room code."
      : lobby
        ? "Leave this room? Your seat will open up. If you are the host, the next player becomes host."
        : "Start a new table? This browser will forget its current seat and cannot rejoin it. The match stays on the host PC. Cancel to keep playing.";
    if (!window.confirm(message)) return;
    if (lobby || table) {
      actionLock.current = true;
      setBusy(true);
      try {
        await gameApi.act(current, token, "leave", { playerId: current.viewer.playerId });
      } catch (failure) {
        // A closed TV screen only needs to forget its token locally.
        if (table && [401, 404].includes(failure.status)) return forget();
        setError(failure.message);
        if (failure.status === 409) {
          try {
            accept((await gameApi.get(current.id, token)).game);
          } catch {
            /* Reconnect will retry. */
          }
        }
        return;
      } finally {
        actionLock.current = false;
        setBusy(false);
      }
    }
    forget();
  }

  function forget() {
    let clearError = "";
    try {
      clearSave();
    } catch {
      clearError = "Browser storage is unavailable; your previous saved seat may still be present.";
    }
    gameRef.current = null;
    setGame(null);
    setToken("");
    setError(clearError);
    setSaveError("");
    setMedia({ playerImages: {}, hexTexturesByRegion: {} });
  }

  return {
    game,
    media,
    loading,
    busy,
    connection: shown,
    stalled,
    sleepy,
    error,
    saveError,
    soundEnabled,
    setSoundEnabled,
    reactions,
    react,
    act,
    leave,
    create: (payload) => enter(() => gameApi.create(payload)),
    join: (code, payload) => enter(() => gameApi.join(code, payload)),
    watch: (code) => enter(() => gameApi.watch(code)),
  };
}
