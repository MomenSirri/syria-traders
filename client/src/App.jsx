import { useEffect, useRef, useState } from "react";
import config from "../../shared/gameConfig.json";
import useMatch from "./hooks/useMatch";
import useResourceGains from "./hooks/useResourceGains";
import { playUiSound } from "./utils/sound";
import GameSetup from "./components/GameSetup";
import GameBoard from "./components/GameBoard";
import Sidebar from "./components/Sidebar";
import ActionBar from "./components/ActionBar";
import GameLog from "./components/GameLog";
import DiceDisplay from "./components/DiceDisplay";
import Lobby from "./components/Lobby";
import TableStatus from "./components/TableStatus";
import SeatHand from "./components/SeatHand";
import TradePanel from "./components/TradePanel";
import DevCardPanel from "./components/DevCardPanel";
import RobberPicker from "./components/RobberPicker";
import GameEffects from "./components/GameEffects";
import Icon from "./components/Icon";
import { fitTvViewport, onTvAddress } from "./utils/tvViewport";

export default function App() {
  const match = useMatch();
  const { game, media, busy, connection, act } = match;
  const [selectedAction, setSelectedAction] = useState(null);
  const [selectedSetupVertex, setSelectedSetupVertex] = useState(null);
  const [highlightedTileIds, setHighlightedTileIds] = useState([]);
  const [rolling, setRolling] = useState(false);
  const [help, setHelp] = useState(false);
  const [robberTile, setRobberTile] = useState(null);
  const rollTimer = useRef();
  const resourcePopups = useResourceGains(game?.gainEvents, game?.clockOffset);
  const current = game?.players[game.currentPlayerIndex];
  // A TV table screen watches the match; it never holds a seat or takes turns.
  const table = game?.viewer?.role === "table";
  const tvLayout = table || (!game && onTvAddress());
  useEffect(() => fitTvViewport(tvLayout), [tvLayout]);
  const myTurn = !table && (game?.mode !== "online" || current?.id === game?.viewer.playerId);
  const interactive = myTurn && !busy && connection === "live" && game?.status === "active";

  useEffect(() => {
    setSelectedAction(game?.mustMoveRobber ? "robber" : null);
    setRobberTile(null);
    setSelectedSetupVertex(null);
  }, [game?.id, game?.turn, game?.currentPlayerIndex, game?.phase, game?.mustMoveRobber]);
  // Road Building hands out free roads: show the road sites straight away.
  const freeRoads = myTurn ? game?.hints?.freeRoads || 0 : 0;
  useEffect(() => {
    if (freeRoads) setSelectedAction("road");
  }, [freeRoads]);
  useEffect(() => {
    if (
      !game?.visuals ||
      Date.now() + (game.clockOffset || 0) - Date.parse(game.visuals.at) > 2500
    ) {
      setHighlightedTileIds([]);
      return;
    }
    setHighlightedTileIds(game.visuals.producingTileIds || []);
    // Every screen tumbles its dice when anyone rolls, not only the roller's.
    if (["roll", "seven"].includes(game.visuals.kind)) setRolling(true);
    const timer = setTimeout(() => setHighlightedTileIds([]), 1800);
    const dice = setTimeout(() => setRolling(false), 650);
    return () => {
      clearTimeout(timer);
      clearTimeout(dice);
    };
  }, [game?.visuals?.flashId]);
  useEffect(() => () => clearTimeout(rollTimer.current), []);
  useEffect(() => {
    if (!help) return;
    const close = (event) => event.key === "Escape" && setHelp(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [help]);

  async function action(route, payload) {
    const success = await act(route, payload);
    if (success && match.soundEnabled) playUiSound("tap");
    return success;
  }
  // With several opponents on the territory, the roller chooses whom to rob first.
  function moveBandit(tileId) {
    if ((game.hints?.robberVictimsByTile?.[tileId] || []).length > 1) setRobberTile(tileId);
    else action("robber/move", { tileId });
  }
  async function roll() {
    setRolling(true);
    await action("roll");
    clearTimeout(rollTimer.current);
    rollTimer.current = setTimeout(() => setRolling(false), 650);
  }
  const warning = match.error || match.saveError;
  if (match.loading)
    return (
      <div className="loading-screen">
        <h1>Syria Traders</h1>
        <p>Opening the caravan routes...</p>
      </div>
    );
  if (!game)
    return (
      <GameSetup
        onCreateGame={match.create}
        onJoinGame={match.join}
        onWatchGame={match.watch}
        busy={busy}
        error={warning}
      />
    );
  if (game.phase === "lobby")
    return (
      <Lobby
        game={game}
        media={media}
        busy={busy || connection !== "live"}
        connection={connection}
        error={warning}
        onStart={() => act("start")}
        onLeave={match.leave}
      />
    );

  const winner = game.players.find((player) => player.id === game.winnerId);
  return (
    <div className="viewport-shell">
      <main
        className={`dashboard-16x9 ${table ? "table-view" : game.mode === "online" ? "seat-view" : ""}`}
      >
        <header className="dashboard-header">
          <div className="brand">
            <span className="eyebrow">{table ? "Table screen" : "A gathering of merchants"}</span>
            <h1>{config.gameTitle}</h1>
          </div>
          <div className="turn-status" style={{ "--player-color": current?.color }}>
            <span className="turn-dot" />
            <div>
              <span className="eyebrow">
                {winner
                  ? "The caravan has a winner"
                  : game.phase === "setup-placement"
                    ? `First settlements ${game.setup.step + 1}/${game.setup.totalSteps}`
                    : `Turn ${game.turn}`}
              </span>
              <strong>
                {winner
                  ? `${winner.name} wins!`
                  : `${current?.name}${myTurn ? " - your turn" : " is playing"}`}
              </strong>
            </div>
          </div>
          <DiceDisplay pair={game.lastDicePair} rolling={rolling} />
          <div className="session-status">
            <span className={`connection-dot ${connection}`} />
            {game.mode === "online" ? `Room ${game.roomCode}` : "Shared table"}
            <small>{connection === "live" ? "Saved on host" : "Reconnecting..."}</small>
          </div>
          <div className="header-actions">
            <button className="quiet-button" onClick={() => setHelp(true)}>
              <Icon name="help" />
              <span className="btn-label">How to play</span>
            </button>
            <button className="quiet-button" onClick={match.leave}>
              <Icon name="exit" />
              <span className="btn-label">{table ? "Close TV screen" : "New table"}</span>
            </button>
          </div>
        </header>
        {game.mode === "online" && !table && <SeatHand game={game} gains={resourcePopups} />}
        <aside className="dashboard-players">
          <Sidebar game={game} playerImages={media.playerImages} resourcePopups={resourcePopups} />
        </aside>
        <section className="dashboard-board">
          <TradePanel
            game={game}
            busy={busy || connection !== "live" || game.status !== "active"}
            onAction={action}
          />
          <DevCardPanel game={game} busy={!interactive} onAction={action} />
          {robberTile !== null && interactive && game.mustMoveRobber && (
            <RobberPicker
              game={game}
              tileId={robberTile}
              busy={!interactive}
              onPick={async (victimId) => {
                if (await action("robber/move", { tileId: robberTile, victimId }))
                  setRobberTile(null);
              }}
              onCancel={() => setRobberTile(null)}
            />
          )}
          <GameBoard
            game={game}
            selectedAction={selectedAction}
            selectedSetupVertex={selectedSetupVertex}
            interactive={interactive}
            highlightedTileIds={highlightedTileIds}
            hexTexturesByRegion={media.hexTexturesByRegion}
            onEdgeSelect={(edgeId) => action("build/road", { edgeId })}
            onVertexSelect={(vertexId) => action(`build/${selectedAction}`, { vertexId })}
            onTileSelect={moveBandit}
            onSetupVertexSelect={setSelectedSetupVertex}
            onSetupEdgeSelect={async (edgeId) => {
              if (await action("setup/place", { vertexId: selectedSetupVertex, edgeId }))
                setSelectedSetupVertex(null);
            }}
          />
          {table && winner && (
            <div className="table-winner" style={{ "--player-color": winner.color }}>
              <span className="eyebrow">The caravan has a winner</span>
              <strong>{winner.name}</strong>
              <span>{winner.score} points</span>
            </div>
          )}
          {warning && (
            <div className="error-banner" role="alert">
              {warning}
            </div>
          )}
          {connection !== "live" && (
            <div className="connection-banner">
              Connecting to the host. Moves will unlock when the connection returns.
            </div>
          )}
        </section>
        <section className="dashboard-log">
          <GameLog log={game.log} />
        </section>
        <section className="dashboard-actions">
          {table ? (
            <TableStatus game={game} currentPlayer={current} />
          ) : (
            <ActionBar
              game={game}
              currentPlayer={current}
              busy={!interactive}
              myTurn={myTurn}
              selectedAction={selectedAction}
              onSelectAction={setSelectedAction}
              onRoll={roll}
              onEndTurn={() => action("end-turn")}
              onBuyCard={() => action("dev/buy")}
              onTrade={(giveResource, getResource) =>
                action("trade/bank", { giveResource, getResource })
              }
              soundEnabled={match.soundEnabled}
              onToggleSound={() => match.setSoundEnabled((value) => !value)}
              selectedSetupVertex={selectedSetupVertex}
              onClearSetupVertex={() => setSelectedSetupVertex(null)}
            />
          )}
        </section>
        <GameEffects game={game} table={table} />
        {help && (
          <div className="modal-backdrop" onClick={() => setHelp(false)}>
            <section
              className="help-modal panel"
              role="dialog"
              aria-modal="true"
              aria-label="How to play"
              onClick={(event) => event.stopPropagation()}
            >
              <button className="quiet-button modal-close" onClick={() => setHelp(false)} autoFocus>
                <Icon name="close" />
                Close
              </button>
              <span className="eyebrow">Welcome to the table</span>
              <h2>Build a home. Open a route.</h2>
              <ol>
                <li>
                  Place two villages and roads. Placement order reverses for the second round; your
                  second village supplies starting resources.
                </li>
                <li>
                  Roll once each turn. Matching regions give one resource per village, two per city.
                  The bandit blocks its region.
                </li>
                <li>
                  Spend resources to build along your roads. Villages must be at least two edges
                  apart. Another player's settlement blocks a road connection.
                </li>
                <li>
                  Trade with the bank at 4:1. A village or city on a marked port grants 3:1, or 2:1
                  for that port's resource.
                </li>
                <li>
                  A seven automatically returns half of any hand over seven to the bank, chosen
                  randomly. Move the bandit to block any territory, then pick a player with a
                  village or city there and take one random card from them.
                </li>
                <li>
                  After rolling, buy a development card for 1 Wheat, 1 Sheep and 1 Stone. Play one
                  card a turn, but not on the turn you bought it: a Knight moves the bandit (three
                  knights earn the Largest Army, worth 2 points), Road Building gives two free
                  roads, Year of Plenty takes two resources, Monopoly collects one resource from
                  everyone. Victory Point cards stay hidden until they win.
                </li>
                <li>
                  Reach 10 points: villages are worth one, cities two. Each player has 15 roads, 5
                  villages and 4 cities.
                </li>
              </ol>
              <p>
                In network rooms, hands are private and only the active player can act. The host PC
                must stay running.
              </p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
