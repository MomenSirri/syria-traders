import { useMemo } from "react";
import { DEFAULT_ASSET_BY_RESOURCE, presetMapById } from "../config/hexPresets";
import ResourceIcon from "./ResourceIcon";
const PRESETS = presetMapById();
const SIZE = 90;
const CORNERS = [-30, 30, 90, 150, 210, 270];
const corners = (center) =>
  CORNERS.map((angle) => ({
    x: center.x + SIZE * Math.cos((angle * Math.PI) / 180),
    y: center.y + SIZE * Math.sin((angle * Math.PI) / 180),
  }));
const points = (vertices) => vertices.map((v) => `${v.x},${v.y}`).join(" ");
function labelLines(name) {
  if (name.length <= 12) return [name];
  const words = name.split(" ");
  return [words.slice(0, -1).join(" "), words.at(-1)];
}
function keyboard(event, callback) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    callback();
  }
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
}) {
  const board = game.board;
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
  const hint = !interactive
    ? game.winnerId
      ? "A journey well played. Start a new table whenever you are ready."
      : "The table is waiting for the active player."
    : setup
      ? selectedSetupVertex === null
        ? "Choose a glowing site for your village."
        : "Connect your village with one glowing road."
      : selectedAction === "robber"
        ? "Choose a new region for the bandit."
        : selectedAction
          ? `Choose a highlighted place for your ${selectedAction}.`
          : "Follow the coast. Build a route. Reach 10 points.";
  return (
    <section className="board-panel">
      <div className="board-caption">
        <span className="eyebrow">The caravan coast</span>
        <span>19 territories / 9 harbors</span>
      </div>
      <div className="board-stage">
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
            {tiles.map((tile) => (
              <clipPath key={tile.id} id={`hex-clip-${tile.id}`}>
                <polygon points={points(tile.vertexIds.map((id) => vertices[id]))} />
              </clipPath>
            ))}
          </defs>
          <g className="sea-layer">
            {seaTiles.map((sea) => (
              <g key={sea.id} className="sea-tile">
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
              const lines = labelLines(tile.region),
                target = validTiles.has(tile.id);
              const texture =
                hexTexturesByRegion[tile.region] ||
                PRESETS[DEFAULT_ASSET_BY_RESOURCE[tile.resource]]?.url;
              return (
                <g
                  key={tile.id}
                  className={`tile-group ${target ? "robber-target" : ""} ${highlightedTileIds.includes(tile.id) ? "producing-tile" : ""}`}
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
                  />
                  <polygon
                    className="tile-outline"
                    points={points(tile.vertexIds.map((id) => vertices[id]))}
                    fill="none"
                  />
                  <g transform={`translate(${tile.center.x - 12},${tile.center.y - 66})`}>
                    <ResourceIcon resource={tile.resource} size={24} />
                  </g>
                  <rect
                    className="tile-label-bg"
                    x={tile.center.x - 73}
                    y={tile.center.y - 30}
                    width="146"
                    height={lines.length === 1 ? 30 : 48}
                    rx="6"
                  />
                  <text
                    x={tile.center.x}
                    y={tile.center.y - 8}
                    textAnchor="middle"
                    className="tile-name"
                  >
                    {lines.map((line, i) => (
                      <tspan key={line} x={tile.center.x} dy={i ? 21 : 0}>
                        {line}
                      </tspan>
                    ))}
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
                        y={tile.center.y + 50}
                        textAnchor="middle"
                        className="token-text"
                      >
                        {tile.numberToken}
                      </text>
                    </g>
                  )}
                  {robberTileId === tile.id && (
                    <g
                      className="robber-marker"
                      transform={`translate(${tile.center.x + 35},${tile.center.y - 62})`}
                    >
                      <circle r="16" />
                      <text y="6" textAnchor="middle">
                        B
                      </text>
                      <title>Bandit blocks production</title>
                    </g>
                  )}
                  <title>{`${tile.region}: ${tile.flavor} Produces ${tile.resource}.`}</title>
                </g>
              );
            })}
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
                      strokeWidth={owner ? 12 : 8}
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
                chosen = selectedSetupVertex === vertex.id;
              const select = () =>
                setup ? onSetupVertexSelect(vertex.id) : onVertexSelect(vertex.id);
              return (
                <g
                  key={vertex.id}
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
                    <path
                      transform={`translate(${vertex.x},${vertex.y})`}
                      d={
                        vertex.building === "city"
                          ? "M-14 12V-8h10V-17H8v9h8v20Z"
                          : "M-12 11V-3L0-15 12-3v14Z"
                      }
                      fill={owner.color}
                      stroke="#fff6df"
                      strokeWidth="3"
                      className="building-piece"
                    />
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
      </div>
      <p className="board-hint">{hint}</p>
    </section>
  );
}
