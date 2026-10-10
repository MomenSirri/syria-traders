import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_ASSET_BY_RESOURCE, presetMapById, regionArtUrl } from "../config/hexPresets";
import ResourceIcon from "./ResourceIcon";
import config from "../../../shared/gameConfig.json";
const PRESETS = presetMapById();
const REGION_NAMES = new Set(
  [...config.regions, ...(config.largeBoard?.extraRegions ?? [])].map((region) => region.name),
);
const SIZE = 90;
const CORNERS = [-30, 30, 90, 150, 210, 270];
const corners = (center) =>
  CORNERS.map((angle) => ({
    x: center.x + SIZE * Math.cos((angle * Math.PI) / 180),
    y: center.y + SIZE * Math.sin((angle * Math.PI) / 180),
  }));
const points = (vertices) => vertices.map((v) => `${v.x},${v.y}`).join(" ");
// A small one-line name pill, so the territory painting stays the hero.
const labelWidth = (name) => Math.min(150, Math.round(name.length * 7.4 + 16));
function keyboard(event, callback) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    callback();
  }
}

// Pieces read as plain board-game buildings: a house for a village and two houses,
// one taller with windows, for a city.
const PIECES = {
  village: {
    body: "M-11 13V-1L0-12 11-1V13Z",
    windows: "M-2.5 5h5v8h-5Z M-7.5 0h4v4h-4Z M3.5 0h4v4h-4Z",
  },
  city: {
    body: "M-20 13V-3L-11-12-2-3V-8L7-17 16-8V13Z",
    windows:
      "M-13 5h5v8h-5Z M3-5h4v4h-4Z M9-5h4v4h-4Z M3 2h4v4h-4Z M9 2h4v4h-4Z M5.5 9h5v4h-5Z",
  },
};
const NO_FRESH = { edges: new Set(), vertices: new Set(), robber: false, serial: 0 };
// A build sends a tremor through the map: tiles near the new piece jolt away from it
// and the wave fades with distance. A road barely stirs the nearby tiles, a village
// shakes its neighbourhood, and a city rocks the whole map.
const QUAKES = {
  road: { push: 4, reach: 230, ms: 520 },
  village: { push: 9, reach: 420, ms: 760 },
  city: { push: 17, reach: 900, ms: 1100 },
};
function quakeFor(fresh, board) {
  if (!board || (!fresh.vertices.size && !fresh.edges.size)) return null;
  const built = [...fresh.vertices].map((id) => board.vertices[id]);
  const site =
    built.find((vertex) => vertex.building === "city") ||
    built.find((vertex) => vertex.building === "village");
  if (site) return { kind: site.building, x: site.x, y: site.y, serial: fresh.serial };
  const edge = board.edges[[...fresh.edges][0]];
  const a = board.vertices[edge.v1],
    b = board.vertices[edge.v2];
  return { kind: "road", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, serial: fresh.serial };
}
function quakeStyle(quake, center) {
  if (!quake) return undefined;
  const { push, reach, ms } = QUAKES[quake.kind];
  const dx = center.x - quake.x,
    dy = center.y - quake.y;
  const distance = Math.hypot(dx, dy);
  const strength = push * Math.max(0, 1 - distance / reach);
  if (strength < 0.5) return undefined;
  const unit = distance > 1 ? 1 / distance : 0;
  // Alternate two identical keyframes so a quick second build restarts the wave.
  return {
    "--qx": `${(dx * unit * strength).toFixed(2)}px`,
    "--qy": `${(dy * unit * strength + (unit ? 0 : -strength)).toFixed(2)}px`,
    animation: `tile-quake-${quake.serial % 2 ? "a" : "b"} ${ms}ms cubic-bezier(0.3, 0.7, 0.4, 1) ${Math.round(distance * 0.45)}ms both`,
  };
}
// Pieces that appeared since the last update get a short entrance animation.
function useFreshPieces(gameId, board) {
  const previous = useRef(null);
  const serial = useRef(0);
  const [fresh, setFresh] = useState(NO_FRESH);
  const roads = board ? board.edges.filter((e) => e.ownerId).map((e) => e.id) : [];
  const homes = board
    ? board.vertices.filter((v) => v.building).map((v) => `${v.id}:${v.building}`)
    : [];
  const key = `${gameId}|${roads.join(",")}|${homes.join(",")}|${board?.robberTileId}`;
  useEffect(() => {
    if (!board) return;
    const now = {
      gameId,
      roads: new Set(roads),
      homes: new Set(homes),
      robber: board.robberTileId,
    };
    const before = previous.current;
    previous.current = now;
    if (!before || before.gameId !== gameId) return;
    const next = {
      edges: new Set(roads.filter((id) => !before.roads.has(id))),
      vertices: new Set(
        homes
          .filter((entry) => !before.homes.has(entry))
          .map((entry) => Number(entry.split(":")[0])),
      ),
      robber: before.robber !== board.robberTileId,
      serial: serial.current + 1,
    };
    if (!next.edges.size && !next.vertices.size && !next.robber) return;
    serial.current = next.serial;
    setFresh(next);
    const timer = setTimeout(() => setFresh(NO_FRESH), 1600);
    return () => clearTimeout(timer);
  }, [key]);
  return fresh;
}

// Fireworks for the finale: each one rises, then bursts into sparks in the winner's
// colour and white. Positions and timings are fixed so every screen matches.
const BURSTS = [
  [18, 22, 0],
  [78, 18, 0.7],
  [50, 12, 1.3],
  [30, 55, 1.9],
  [70, 50, 2.4],
  [12, 70, 3.0],
  [88, 72, 3.5],
  [50, 40, 4.1],
];
const SPARKS = 22;
function Fireworks() {
  return (
    <div className="fireworks" aria-hidden="true">
      {BURSTS.map(([left, top, delay], burst) => (
        <div
          key={burst}
          className="firework"
          style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }}
        >
          <i className="firework-rocket" style={{ animationDelay: `${delay}s` }} />
          {Array.from({ length: SPARKS }, (_, spark) => (
            <i
              key={spark}
              className={`firework-spark ${spark % 3 === 0 ? "spark-white" : ""}`}
              style={{ "--angle": `${(360 / SPARKS) * spark}deg`, animationDelay: `${delay}s` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function GameBoard({
  game,
  selectedAction,
  selectedSetupVertex,
  onEdgeSelect,
  onVertexSelect,
  onTileSelect,
  onSetupVertexSelect,
  onSetupEdgeSelect,
  highlightedTileIds = [],
  hexTexturesByRegion = {},
  interactive,
  previewTileId = null,
}) {
  const board = game.board;
  const fresh = useFreshPieces(game.id, board);
  const quake = useMemo(() => quakeFor(fresh, board), [fresh]);
  const viewBox = useMemo(() => {
    if (!board) return "0 0 100 100";
    // Fit the actual outer corners instead of adding a large invisible margin.
    const all = [...board.vertices, ...board.seaTiles.flatMap((sea) => corners(sea.center))];
    const xs = all.map((v) => v.x),
      ys = all.map((v) => v.y);
    const x = Math.min(...xs) - 10,
      y = Math.min(...ys) - 10;
    return `${x} ${y} ${Math.max(...xs) - x + 10} ${Math.max(...ys) - y + 10}`;
  }, [board]);
  if (!board) return <section className="panel board-panel">Preparing the map...</section>;
  const { tiles, seaTiles, vertices, edges, robberTileId } = board;
  const hints = interactive ? game.hints || {} : {};
  const setup = game.phase === "setup-placement";
  const validVertices = new Set(
    setup
      ? hints.validSetupVertices
      : selectedAction === "city"
        ? hints.validCityVertices
        : selectedAction === "village"
          ? hints.validVillageVertices
          : [],
  );
  const validEdges = new Set(
    setup
      ? hints.setupRoadOptionsByVertex?.[selectedSetupVertex]
      : selectedAction === "road"
        ? hints.validRoadEdges
        : [],
  );
  const validTiles = new Set(selectedAction === "robber" ? hints.validRobberTiles : []);
  const owners = Object.fromEntries(game.players.map((player) => [player.id, player]));
  // Victory finale: the map goes dark, the winner's routes and buildings glow and
  // everyone else's fade away while fireworks go off over the board.
  const winner = owners[game.winnerId];
  const finale = (ownerId) =>
    !winner || !ownerId ? "" : ownerId === winner.id ? "winner-piece" : "faded-piece";
  const classes = (...names) => names.filter(Boolean).join(" ") || undefined;
  const hint = !interactive
    ? game.winnerId
      ? "A journey well played. Start a new table whenever you are ready."
      : `Waiting for ${game.players[game.currentPlayerIndex]?.name || "the active player"} to play.`
    : setup
      ? selectedSetupVertex === null
        ? "Choose a glowing site for your village."
        : "Connect your village with one glowing road."
      : selectedAction === "robber"
        ? hints.validRobberTiles?.length
          ? "Tap a new region for the bandit, then confirm."
          : "The bandit moves once big hands have returned their cards."
        : selectedAction
          ? `Choose a highlighted place for your ${selectedAction}.`
          : "Follow the coast. Build a route. Reach 10 points.";
  return (
    <section className={winner ? "board-panel finale-panel" : "board-panel"}>
      <div className="board-caption">
        <span className="eyebrow">The caravan coast</span>
        <span>
          {tiles.length} territories / {seaTiles.filter((sea) => sea.harbor).length} harbors
        </span>
      </div>
      <div
        className={classes(
          "board-stage",
          quake?.kind === "city" && `city-quake-${quake.serial % 2 ? "a" : "b"}`,
          winner && "finale",
        )}
        style={winner ? { "--winner-color": winner.color } : undefined}
      >
        <svg
          className="board-svg"
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label="Syria Traders interactive board"
        >
          <defs>
            <pattern id="sea-waves" width="42" height="28" patternUnits="userSpaceOnUse">
              <rect width="42" height="28" fill="#8cb7ba" />
              <path
                d="M-10 14 Q0 5 10 14T30 14T50 14"
                stroke="#f2ecdb"
                strokeOpacity=".23"
                fill="none"
                strokeWidth="2"
              />
            </pattern>
            {/* The bandit's territory: faded, darkened art under a dark hatch. */}
            <filter id="blocked-art" colorInterpolationFilters="sRGB">
              <feColorMatrix type="saturate" values="0.3" />
              <feComponentTransfer>
                <feFuncR type="linear" slope="0.7" />
                <feFuncG type="linear" slope="0.7" />
                <feFuncB type="linear" slope="0.7" />
              </feComponentTransfer>
            </filter>
            <pattern
              id="blocked-hatch"
              width="18"
              height="18"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="18" height="18" fill="#120c0a" fillOpacity=".18" />
              <rect width="4" height="18" fill="#000" fillOpacity=".18" />
            </pattern>
            {tiles.map((tile) => (
              <clipPath key={tile.id} id={`hex-clip-${tile.id}`}>
                <polygon points={points(tile.vertexIds.map((id) => vertices[id]))} />
              </clipPath>
            ))}
          </defs>
          <g className="sea-layer">
            {seaTiles.map((sea) => (
              <g key={sea.id} className="sea-tile" style={quakeStyle(quake, sea.center)}>
                <polygon points={points(corners(sea.center))} fill="url(#sea-waves)" />
                {sea.harbor && (
                  <g>
                    {sea.portVertexIds?.map((id) => (
                      <line
                        key={id}
                        x1={sea.center.x}
                        y1={sea.center.y}
                        x2={vertices[id].x}
                        y2={vertices[id].y}
                        className="harbor-pier"
                      />
                    ))}
                    <rect
                      x={sea.center.x - 46}
                      y={sea.center.y - 18}
                      width="92"
                      height="36"
                      rx="12"
                      className="harbor-label-bg"
                    />
                    <text
                      x={sea.center.x}
                      y={sea.center.y + 6}
                      textAnchor="middle"
                      className="harbor-label"
                    >
                      {sea.harbor === "3:1" ? "3:1 port" : `${sea.harbor} 2:1`}
                    </text>
                  </g>
                )}
              </g>
            ))}
          </g>
          <g className="tile-layer">
            {tiles.map((tile) => {
              const target = validTiles.has(tile.id);
              const blocked = robberTileId === tile.id;
              const texture =
                hexTexturesByRegion[tile.region] ||
                (REGION_NAMES.has(tile.region)
                  ? regionArtUrl(tile.region)
                  : PRESETS[DEFAULT_ASSET_BY_RESOURCE[tile.resource]]?.url);
              return (
                <g
                  key={tile.id}
                  data-tile-id={tile.id}
                  style={quakeStyle(quake, tile.center)}
                  className={`tile-group ${target ? "robber-target" : ""} ${blocked ? "blocked-tile" : ""} ${previewTileId === tile.id ? "robber-preview" : ""} ${highlightedTileIds.includes(tile.id) ? "producing-tile" : ""}`}
                  role={target ? "button" : undefined}
                  tabIndex={target ? 0 : undefined}
                  aria-label={target ? `Move bandit to ${tile.region}` : undefined}
                  onClick={() => target && onTileSelect(tile.id)}
                  onKeyDown={(event) => target && keyboard(event, () => onTileSelect(tile.id))}
                >
                  <polygon
                    points={points(tile.vertexIds.map((id) => vertices[id]))}
                    fill={tile.terrainColor}
                  />
                  <image
                    href={texture}
                    x={tile.center.x - SIZE}
                    y={tile.center.y - SIZE}
                    width={SIZE * 2}
                    height={SIZE * 2}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#hex-clip-${tile.id})`}
                    filter={blocked ? "url(#blocked-art)" : undefined}
                  />
                  {blocked && (
                    <polygon
                      className="blocked-shade"
                      points={points(tile.vertexIds.map((id) => vertices[id]))}
                      fill="url(#blocked-hatch)"
                    />
                  )}
                  <polygon
                    className="tile-outline"
                    points={points(tile.vertexIds.map((id) => vertices[id]))}
                    fill="none"
                  />
                  {tile.resource !== "desert" && (
                    <g className={`tile-resource resource-${tile.resource}`}>
                      <circle cx={tile.center.x} cy={tile.center.y - 53} r="16" />
                      <g transform={`translate(${tile.center.x - 11},${tile.center.y - 64})`}>
                        <ResourceIcon resource={tile.resource} size={22} />
                      </g>
                    </g>
                  )}
                  <rect
                    className="tile-label-bg"
                    x={tile.center.x - labelWidth(tile.region) / 2}
                    y={tile.center.y - 15}
                    width={labelWidth(tile.region)}
                    height="20"
                    rx="10"
                  />
                  <text
                    x={tile.center.x}
                    y={tile.center.y}
                    textAnchor="middle"
                    className="tile-name"
                  >
                    {tile.region}
                  </text>
                  {tile.numberToken && (
                    <g className={[6, 8].includes(tile.numberToken) ? "hot-token" : ""}>
                      <circle
                        className="number-token"
                        cx={tile.center.x}
                        cy={tile.center.y + 43}
                        r="21"
                      />
                      <text
                        x={tile.center.x}
                        y={tile.center.y + 49}
                        textAnchor="middle"
                        className="token-text"
                      >
                        {tile.numberToken}
                      </text>
                      <g className="token-pips" aria-hidden="true">
                        {Array.from({ length: 6 - Math.abs(7 - tile.numberToken) }, (_, i) => (
                          <circle
                            key={i}
                            cx={
                              tile.center.x + (i - (5 - Math.abs(7 - tile.numberToken)) / 2) * 5.5
                            }
                            cy={tile.center.y + 56}
                            r="2"
                          />
                        ))}
                      </g>
                    </g>
                  )}
                  <title>
                    {blocked
                      ? `${tile.region}: blocked by the bandit, produces nothing.`
                      : `${tile.region}: ${tile.flavor} Produces ${tile.resource}.`}
                  </title>
                </g>
              );
            })}
          </g>
          {/* The bandit's spot and its preview are drawn over every territory, so
              neighbouring outlines never cover their red borders. */}
          {[
            { tileId: robberTileId, kind: "blocked" },
            { tileId: previewTileId, kind: "preview" },
          ]
            .filter(({ tileId }) => tiles[tileId])
            .map(({ tileId, kind }) => {
              const tile = tiles[tileId];
              return (
                <g key={`${kind}-${tileId}`} className={`bandit-layer ${kind}-layer`}>
                  {/* Grey and white like a cordon: no player colour, so never a road. */}
                  <polygon
                    className="bandit-outline-base"
                    points={points(tile.vertexIds.map((id) => vertices[id]))}
                    fill="none"
                  />
                  <polygon
                    className="bandit-outline-dash"
                    points={points(tile.vertexIds.map((id) => vertices[id]))}
                    fill="none"
                  />
                  <g transform={`translate(${tile.center.x + 35},${tile.center.y - 62})`}>
                    <g
                      className={`robber-marker ${kind === "preview" ? "robber-ghost" : fresh.robber ? "robber-landing" : ""}`}
                    >
                      <circle r="16" />
                      <text y="6" textAnchor="middle">
                        B
                      </text>
                      <title>
                        {kind === "preview"
                          ? "The bandit will move here when you confirm"
                          : "Bandit blocks production"}
                      </title>
                    </g>
                  </g>
                </g>
              );
            })}
          {/* Every road's white edge sits under every coloured road, so a player's
              connected roads read as one smooth line with no seams at the turns. */}
          <g className="road-edge-layer">
            {edges
              .filter((edge) => edge.ownerId)
              .map((edge) => (
                <line
                  key={edge.id}
                  x1={vertices[edge.v1].x}
                  y1={vertices[edge.v1].y}
                  x2={vertices[edge.v2].x}
                  y2={vertices[edge.v2].y}
                  className={classes(
                    "road-edge",
                    fresh.edges.has(edge.id) && "fresh-piece",
                    finale(edge.ownerId),
                  )}
                />
              ))}
          </g>
          <g className="edge-layer">
            {edges.map((edge) => {
              const a = vertices[edge.v1],
                b = vertices[edge.v2],
                owner = owners[edge.ownerId],
                target = validEdges.has(edge.id);
              const select = () => (setup ? onSetupEdgeSelect(edge.id) : onEdgeSelect(edge.id));
              return (
                <g
                  key={edge.id}
                  className={classes(fresh.edges.has(edge.id) && "fresh-piece", finale(edge.ownerId))}
                  role={target ? "button" : undefined}
                  tabIndex={target ? 0 : undefined}
                  aria-label={target ? `Build road on edge ${edge.id}` : undefined}
                  onClick={() => target && select()}
                  onKeyDown={(event) => target && keyboard(event, select)}
                >
                  {(owner || target) && (
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={owner?.color || "#f9d576"}
                      strokeWidth={owner ? 11 : 8}
                      strokeLinecap="round"
                      className={target ? "hint-road" : "built-road"}
                    />
                  )}
                  {target && (
                    <>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="transparent"
                        strokeWidth="28"
                        className="board-target"
                      />
                      <circle
                        cx={(a.x + b.x) / 2}
                        cy={(a.y + b.y) / 2}
                        r="14"
                        fill="transparent"
                        className="board-target"
                      />
                    </>
                  )}
                </g>
              );
            })}
          </g>
          <g className="vertex-layer">
            {vertices.map((vertex) => {
              const owner = owners[vertex.ownerId],
                target = validVertices.has(vertex.id),
                chosen = selectedSetupVertex === vertex.id,
                piece = vertex.building === "city" ? PIECES.city : PIECES.village;
              const select = () =>
                setup ? onSetupVertexSelect(vertex.id) : onVertexSelect(vertex.id);
              return (
                <g
                  key={vertex.id}
                  className={classes(
                    fresh.vertices.has(vertex.id) && "fresh-piece",
                    finale(vertex.ownerId),
                  )}
                  role={target ? "button" : undefined}
                  tabIndex={target ? 0 : undefined}
                  aria-label={
                    target
                      ? `Place ${selectedAction === "city" ? "city" : "village"} at site ${vertex.id}`
                      : undefined
                  }
                  onClick={() => target && select()}
                  onKeyDown={(event) => target && keyboard(event, select)}
                >
                  {target && (
                    <circle
                      cx={vertex.x}
                      cy={vertex.y}
                      r={chosen ? 12 : 8}
                      className={chosen ? "selected-setup-vertex" : "hint-vertex"}
                    />
                  )}
                  {owner && (
                    <g
                      transform={`translate(${vertex.x},${vertex.y}) scale(1.25)`}
                      className="building-piece"
                    >
                      <path d={piece.body} className="piece-edge" />
                      <path d={piece.body} fill={owner.color} />
                      <path d={piece.windows} className="piece-windows" />
                    </g>
                  )}
                  {target && (
                    <circle
                      cx={vertex.x}
                      cy={vertex.y}
                      r="19"
                      fill="transparent"
                      className="board-target"
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {winner && <Fireworks />}
      </div>
      <p className="board-hint">{hint}</p>
    </section>
  );
}
