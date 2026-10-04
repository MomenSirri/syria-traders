import { useCallback, useEffect, useRef, useState } from "react";
import { anySignal, gameApi, watchMatch } from "../api/gameApi";
import { readSave, saveMatch, saveArtwork, clearSave } from "../utils/storage";

export default function useMatch() {
  const [game, setGame] = useState(null);
  const [token, setToken] = useState("");
  const [media, setMedia] = useState({ playerImages: {}, hexTexturesByRegion: {} });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState("connecting");
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const gameRef = useRef(null);
  const actionLock = useRef(false);

  useEffect(() => {
    const offline = () => setConnection("reconnecting");
    const online = () => setReconnectKey((key) => key + 1);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  const accept = useCallback((next) => {
    if (gameRef.current?.id === next.id && gameRef.current.revision > next.revision) return;
    const { media: artwork, ...snapshot } = next;
    // Use the host's clock for gain lifetimes, even on a phone with clock skew.
    snapshot.clockOffset = (next.serverTime || Date.now()) - Date.now();
    if (artwork) {
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
    const controller = new AbortController();
    let retryTimer,
      stream,
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
    const connect = async () => {
      if (controller.signal.aborted) return;
      setConnection("connecting");
      let linked;
      try {
        await refresh(0, true);
        stream = new AbortController();
        linked = anySignal([controller.signal, stream.signal]);
        await watchMatch(
          game.id,
          token,
          linked.signal,
          (revision) => {
            // Restart the stream after a failed refresh, even if no more moves arrive.
            if (revision > (gameRef.current?.revision || 0))
              refresh(revision).catch(() => {
                setConnection("reconnecting");
                stream.abort();
              });
          },
          () => setConnection("live"),
        );
      } catch (failure) {
        if (!controller.signal.aborted && [401, 404].includes(failure.status))
          setError(failure.message);
      }
      linked?.release();
      if (!controller.signal.aborted) {
        setConnection("reconnecting");
        retryTimer = setTimeout(connect, 2500);
      }
    };
    connect();
    return () => {
      controller.abort();
      stream?.abort();
      clearTimeout(retryTimer);
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
    if (actionLock.current || connection !== "live") return false;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      const current = gameRef.current;
      const playerId =
        current.mode === "online"
          ? current.viewer.playerId
          : current.players[current.currentPlayerIndex].id;
      const result = await gameApi.act(current, token, route, { playerId, ...body });
      accept(result.game);
      return true;
    } catch (failure) {
      setError(failure.message);
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
    connection,
    error,
    saveError,
    soundEnabled,
    setSoundEnabled,
    act,
    leave,
    create: (payload) => enter(() => gameApi.create(payload)),
    join: (code, payload) => enter(() => gameApi.join(code, payload)),
    watch: (code) => enter(() => gameApi.watch(code)),
  };
}
