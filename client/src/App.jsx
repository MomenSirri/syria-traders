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

export default function App() {
  const match = useMatch();
  const { game, media, busy, connection, act } = match;
  const [selectedAction, setSelectedAction] = useState(null);
  const [selectedSetupVertex, setSelectedSetupVertex] = useState(null);
  const [highlightedTileIds, setHighlightedTileIds] = useState([]);
  const [rolling, setRolling] = useState(false);
  const [help, setHelp] = useState(false);
  const rollTimer = useRef();
  const resourcePopups = useResourceGains(game?.gainEvents, game?.clockOffset);
  const current = game?.players[game.currentPlayerIndex];
  const myTurn = game?.mode !== "online" || current?.id === game?.viewer.playerId;
  const interactive = myTurn && !busy && connection === "live" && game?.status === "active";

  useEffect(() => {
    setSelectedAction(game?.mustMoveRobber ? "robber" : null);
    setSelectedSetupVertex(null);
  }, [game?.id, game?.turn, game?.currentPlayerIndex, game?.phase, game?.mustMoveRobber]);
  useEffect(() => {
    if (
      !game?.visuals ||
      Date.now() + (game.clockOffset || 0) - Date.parse(game.visuals.at) > 2500
    ) {
      setHighlightedTileIds([]);
      return;
    }
    setHighlightedTileIds(game.visuals.producingTileIds || []);
    const timer = setTimeout(() => setHighlightedTileIds([]), 1800);
    return () => clearTimeout(timer);
  }, [game?.visuals?.flashId]);
  useEffect(() => () => clearTimeout(rollTimer.current), []);

  async function action(route, payload) {
    const success = await act(route, payload);
    if (success && match.soundEnabled) playUiSound("tap");
    return success;
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
        maxPlayers={4}
        onCreateGame={match.create}
        onJoinGame={match.join}
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
      <main className="dashboard-16x9">
        <header className="dashboard-header">
          <div className="brand">
            <span className="eyebrow">A gathering of merchants</span>
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
          <button className="quiet-button" onClick={() => setHelp(true)}>
            How to play
          </button>
          <button className="quiet-button" onClick={match.leave}>
            New table
          </button>
        </header>
        <aside className="dashboard-players">
          <Sidebar game={game} playerImages={media.playerImages} resourcePopups={resourcePopups} />
        </aside>
        <section className="dashboard-board">
          <GameBoard
            game={game}
            selectedAction={selectedAction}
            selectedSetupVertex={selectedSetupVertex}
            interactive={interactive}
            highlightedTileIds={highlightedTileIds}
            hexTexturesByRegion={media.hexTexturesByRegion}
            onEdgeSelect={(edgeId) => action("build/road", { edgeId })}
            onVertexSelect={(vertexId) => action(`build/${selectedAction}`, { vertexId })}
            onTileSelect={(tileId) => action("robber/move", { tileId })}
            onSetupVertexSelect={setSelectedSetupVertex}
            onSetupEdgeSelect={async (edgeId) => {
              if (await action("setup/place", { vertexId: selectedSetupVertex, edgeId }))
                setSelectedSetupVertex(null);
            }}
          />
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
          <ActionBar
            game={game}
            currentPlayer={current}
            busy={!interactive}
            myTurn={myTurn}
            selectedAction={selectedAction}
            onSelectAction={setSelectedAction}
            onRoll={roll}
            onEndTurn={() => action("end-turn")}
            onTrade={(giveResource, getResource) =>
              action("trade/bank", { giveResource, getResource })
            }
            soundEnabled={match.soundEnabled}
            onToggleSound={() => match.setSoundEnabled((value) => !value)}
            selectedSetupVertex={selectedSetupVertex}
            onClearSetupVertex={() => setSelectedSetupVertex(null)}
          />
        </section>
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
                  randomly. Move the bandit and steal a random card from an adjacent opponent.
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
