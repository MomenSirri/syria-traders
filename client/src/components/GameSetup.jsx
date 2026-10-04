import { useEffect, useRef, useState } from "react";
import config from "../../../shared/gameConfig.json";
import { prepareImage } from "../utils/images";
import { DEFAULT_ASSET_BY_RESOURCE, presetMapById } from "../config/hexPresets";

const PRESETS = presetMapById();
const DRAFT_KEY = "syria_traders_setup_v2";
// ?room=CODE opens the join form; adding &tv=1 opens it as a TV table screen.
function linkedMode() {
  const params = new URLSearchParams(location.search);
  return params.has("tv") ? "tv" : params.has("room") ? "join" : null;
}
const defaults = () => ({
  mode: linkedMode() || "local",
  names: ["Nour", "Yazan"],
  avatars: ["", ""],
  regionOrder: shuffled(config.regions.map((region) => region.name)),
  numberOrder: [...config.numberTokens],
  harborOrder: [...config.harborTypes],
  hexTexturesByRegion: {},
  balanced: true,
});
function initial() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    const draft = saved?.regionOrder?.length === 19 ? { ...defaults(), ...saved } : defaults();
    if (linkedMode()) draft.mode = linkedMode();
    return draft;
  } catch {
    return defaults();
  }
}
function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
const rows = [-2, -1, 0, 1, 2].map((r) =>
  config.boardLayout.map((coord, index) => ({ ...coord, index })).filter((coord) => coord.r === r),
);
const regions = Object.fromEntries(config.regions.map((region) => [region.name, region]));

export default function GameSetup({ onCreateGame, onJoinGame, onWatchGame, busy, error }) {
  const [draft, setDraft] = useState(initial);
  const [selected, setSelected] = useState(0);
  const [swapFrom, setSwapFrom] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [room, setRoom] = useState(new URLSearchParams(location.search).get("room") || "");
  const [localError, setLocalError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [artTarget, setArtTarget] = useState(null);
  const inputRef = useRef();
  const update = (values) => setDraft((current) => ({ ...current, ...values }));
  const network = draft.mode !== "local";
  const tv = draft.mode === "tv";
  // A TV either opens a new room (and arranges its map) or shows an existing one.
  const viewing = draft.mode === "join" || (tv && room.trim() !== "");
  const regionName = draft.regionOrder[selected];
  const region = regions[regionName];
  const texture = (name) =>
    draft.hexTexturesByRegion[name] ||
    PRESETS[DEFAULT_ASSET_BY_RESOURCE[regions[name].resource]]?.url;

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      setLocalError("Browser storage is full. Remove some custom photos before continuing.");
    }
  }, [draft]);

  async function upload(file) {
    if (!file) return;
    setUploading(true);
    setLocalError("");
    try {
      const data = await prepareImage(file, artTarget?.type === "avatar");
      setDraft((current) =>
        artTarget.type === "avatar"
          ? {
              ...current,
              avatars: current.avatars.map((value, i) => (i === artTarget.index ? data : value)),
            }
          : {
              ...current,
              hexTexturesByRegion: { ...current.hexTexturesByRegion, [artTarget.name]: data },
            },
      );
    } catch (failure) {
      setLocalError(failure.message);
    } finally {
      setUploading(false);
    }
  }
  function chooseImage(target) {
    setArtTarget(target);
    inputRef.current.click();
  }
  function swap(from, to) {
    if (from === null || from === to) return;
    const order = [...draft.regionOrder];
    [order[from], order[to]] = [order[to], order[from]];
    update({ regionOrder: order });
    setSwapFrom(null);
    setSelected(to);
  }
  function submit(event) {
    event.preventDefault();
    if (tv) {
      if (room.trim()) onWatchGame(room);
      else
        onCreateGame({
          mode: "online",
          tableHost: true,
          playerNames: [],
          playerProfiles: [],
          regionOrder: draft.regionOrder,
          numberOrder: draft.balanced ? null : draft.numberOrder,
          harborOrder: draft.harborOrder,
          hexTexturesByRegion: draft.hexTexturesByRegion,
        });
      return;
    }
    const names = (network ? draft.names.slice(0, 1) : draft.names).map((name) => name.trim());
    if (
      names.some((name) => !name) ||
      new Set(names.map((name) => name.toLowerCase())).size !== names.length
    ) {
      setLocalError("Give every player a different name.");
      return;
    }
    if (draft.mode === "join") {
      onJoinGame(room, { name: names[0], avatar: draft.avatars[0] });
      return;
    }
    onCreateGame({
      mode: draft.mode,
      playerNames: names,
      playerProfiles: names.map((_, i) => ({ avatar: draft.avatars[i] })),
      regionOrder: draft.regionOrder,
      numberOrder: draft.balanced ? null : draft.numberOrder,
      harborOrder: draft.harborOrder,
      hexTexturesByRegion: draft.hexTexturesByRegion,
    });
  }
  const productiveIndex =
    draft.regionOrder.slice(0, selected + 1).filter((name) => regions[name].resource !== "desert")
      .length - 1;
  function changeNumber(value) {
    const order = [...draft.numberOrder];
    const other = order.findIndex((token) => token === Number(value));
    [order[productiveIndex], order[other]] = [order[other], order[productiveIndex]];
    update({ numberOrder: order, balanced: false });
  }
  return (
    <div className="setup-screen-shell">
      <main className="setup-dashboard">
        <header className="setup-header">
          <div>
            <span className="eyebrow">From the coast to the caravan roads</span>
            <h1>Syria Traders</h1>
          </div>
          <p>Gather your people. Arrange your world. Begin your story.</p>
          <span className="edition-badge">Syrian edition</span>
        </header>
        <form className="setup-grid" onSubmit={submit}>
          <section className="setup-card setup-form-card">
            <span className="eyebrow">01 / Your table</span>
            <h2>Who is joining?</h2>
            <div className="mode-tabs">
              {[
                ["local", "One device"],
                ["online", "Host room"],
                ["join", "Join room"],
                ["tv", "TV screen"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={draft.mode === value ? "selected" : ""}
                  onClick={() => update({ mode: value })}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="muted">
              {tv
                ? "Show the whole table on a big screen. Players join and play on their own phones; their hands never appear here."
                : network
                  ? "Each player joins from their own browser. Your resource hand stays private."
                  : "Pass the screen between 2 to 4 players. Everyone's hand is visible."}
            </p>
            {!tv && (
              <div className="setup-player-list">
                {(network ? draft.names.slice(0, 1) : draft.names).map((name, index) => (
                  <article className="setup-player-card" key={index}>
                    <button
                      type="button"
                      className="setup-avatar"
                      title="Upload player photo"
                      aria-label={`Upload photo for player ${index + 1}`}
                      disabled={uploading}
                      onClick={() => chooseImage({ type: "avatar", index })}
                    >
                      {draft.avatars[index] ? (
                        <img src={draft.avatars[index]} alt="" />
                      ) : (
                        name[0]?.toUpperCase() || "?"
                      )}
                      <span className="avatar-edit">+</span>
                    </button>
                    <label>
                      <span>Player {index + 1}</span>
                      <input
                        value={name}
                        maxLength={24}
                        aria-label={`Player ${index + 1} name`}
                        onChange={(event) =>
                          update({
                            names: draft.names.map((value, i) =>
                              i === index ? event.target.value : value,
                            ),
                          })
                        }
                      />
                    </label>
                    {!network && draft.names.length > 2 && (
                      <button
                        type="button"
                        className="quiet-button remove-player"
                        aria-label={`Remove player ${index + 1}`}
                        onClick={() =>
                          update({
                            names: draft.names.filter((_, i) => i !== index),
                            avatars: draft.avatars.filter((_, i) => i !== index),
                          })
                        }
                      >
                        x
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
            {!network && draft.names.length < 4 && (
              <button
                type="button"
                className="secondary-btn"
                onClick={() =>
                  update({ names: [...draft.names, ""], avatars: [...draft.avatars, ""] })
                }
              >
                + Add player
              </button>
            )}
            <p className="muted">
              {tv
                ? "Leave the room code empty to open a new room on this screen, or enter one to show a room that already exists."
                : "Click a portrait to upload a photo. Profiles and map art lock when you start."}
            </p>
            {(draft.mode === "join" || tv) && (
              <label className="room-field">
                {tv ? "Room code (optional)" : "Room code"}
                <input
                  value={room}
                  placeholder="A1B2C3"
                  maxLength={6}
                  required={!tv}
                  onChange={(event) => setRoom(event.target.value.toUpperCase())}
                />
              </label>
            )}
            <div className="setup-submit">
              <button type="submit" className="primary-btn" disabled={busy || uploading}>
                {busy
                  ? "Opening your table..."
                  : uploading
                    ? "Preparing photo..."
                    : tv
                      ? room.trim()
                        ? "Show this room on the TV"
                        : "Open a room on this TV"
                      : draft.mode === "online"
                        ? "Create a room"
                        : draft.mode === "join"
                          ? "Join the table"
                          : "Begin the journey"}
              </button>
              {(localError || error) && (
                <p role="alert" className="setup-error">
                  {localError || error}
                </p>
              )}
            </div>
          </section>
          <section className="setup-card map-arrangement-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">02 / The territories</span>
                <h2>A world to make your own</h2>
              </div>
              <button
                type="button"
                className="secondary-btn"
                disabled={viewing}
                onClick={() =>
                  update({
                    regionOrder: shuffled(draft.regionOrder),
                    numberOrder: shuffled(config.numberTokens),
                    harborOrder: shuffled(config.harborTypes),
                    balanced: true,
                  })
                }
              >
                Shuffle map
              </button>
            </div>
            <p className="muted">
              {viewing
                ? "The host prepares the map for everyone."
                : swapFrom !== null
                  ? "Choose another territory to exchange its position."
                  : "Drag territories to rearrange. Select one to change its artwork."}
            </p>
            <div className="arrangement-rows">
              {rows.map((row, i) => (
                <div className="arrangement-row" key={i}>
                  {row.map(({ index }) => {
                    const name = draft.regionOrder[index];
                    return (
                      <button
                        key={index}
                        type="button"
                        draggable={!viewing}
                        disabled={viewing}
                        aria-label={`Customize ${name}`}
                        className={`arrangement-tile ${selected === index ? "selected" : ""}`}
                        onClick={() =>
                          swapFrom !== null ? swap(swapFrom, index) : setSelected(index)
                        }
                        onDragStart={(event) => {
                          setDragIndex(index);
                          event.dataTransfer.setData("text/plain", String(index));
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          swap(dragIndex, index);
                          setDragIndex(null);
                        }}
                        onDragEnd={() => setDragIndex(null)}
                      >
                        <img src={texture(name)} alt="" draggable="false" />
                        <span>{name}</span>
                        <small>{regions[name].resource}</small>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="map-settings">
              <label>
                <input
                  type="checkbox"
                  checked={draft.balanced}
                  disabled={viewing}
                  onChange={(event) => update({ balanced: event.target.checked })}
                />{" "}
                Balanced dice numbers
              </label>
              <span>19 territories / 9 ports / 10 points to win</span>
            </div>
            <p className="muted">
              Balanced numbers keep high-production 6 and 8 tokens apart. The sea ring is added when
              the match begins.
            </p>
          </section>
          <section className="setup-card texture-studio">
            <span className="eyebrow">03 / Your Syrian edition</span>
            <h2>{regionName}</h2>
            <p className="muted">{region.flavor}</p>
            <div className="texture-preview">
              <img src={texture(regionName)} alt={`${regionName} terrain preview`} />
            </div>
            <span className="resource-badge">{config.resourceLabels[region.resource]}</span>
            <button
              type="button"
              className="secondary-btn"
              disabled={uploading || viewing}
              onClick={() => chooseImage({ type: "hex", name: regionName })}
            >
              Upload territory photo
            </button>
            <button
              type="button"
              className="quiet-button"
              disabled={viewing}
              onClick={() => {
                const next = { ...draft.hexTexturesByRegion };
                delete next[regionName];
                update({ hexTexturesByRegion: next });
              }}
            >
              Restore illustration
            </button>
            <button
              type="button"
              className="secondary-btn"
              disabled={viewing}
              onClick={() => setSwapFrom(swapFrom === null ? selected : null)}
            >
              {swapFrom === null ? "Swap this territory" : "Cancel swap"}
            </button>
            {!draft.balanced && region.resource !== "desert" && (
              <label>
                Number token
                <select
                  value={draft.numberOrder[productiveIndex]}
                  onChange={(event) => changeNumber(event.target.value)}
                >
                  {[2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map((number) => (
                    <option key={number}>{number}</option>
                  ))}
                </select>
              </label>
            )}
            <p className="muted">
              Original terrain illustrations are included. Uploaded photos are cropped and resized
              for fast play, then shared with your room.
            </p>
          </section>
        </form>
        <input
          ref={inputRef}
          className="hidden-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            upload(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <footer className="setup-footer">
          <span>Made for friends, trade, and a little friendly rivalry.</span>
          <span>Setup is saved in this browser.</span>
        </footer>
      </main>
    </div>
  );
}
