import { useState } from "react";
import QrCode from "./QrCode";
import Icon from "./Icon";

export default function Lobby({ game, media, busy, connection, error, onStart, onLeave }) {
  const [copied, setCopied] = useState(false);
  const [address, setAddress] = useState("");
  const table = game.viewer.role === "table";
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  const addresses = game.hostAddresses || [];
  const preferred = addresses.find((ip) => ip.startsWith("192.168.")) || addresses[0];
  const hostname = address || (local && preferred ? preferred : location.hostname);
  // Phones always join over HTTPS, even when this screen is on the TV's HTTP address.
  const ports = game.hostPorts || {};
  const securePort =
    location.protocol === "https:" ? location.port : String(ports.secure || location.port);
  // run-game-online.bat gives the host a public address; invites then work anywhere.
  const online = ports.public || null;
  const link = online
    ? `${online}/?room=${game.roomCode}`
    : `https://${hostname}${securePort ? `:${securePort}` : ""}/?room=${game.roomCode}`;
  const tvLink = ports.tv ? `http://${hostname}:${ports.tv}/tv` : null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="setup-screen-shell">
      <main className={`lobby panel ${table ? "table-lobby" : ""}`}>
        <span className="eyebrow">Syria Traders / {table ? "Table screen" : "Network room"}</span>
        <h1>{table ? "Join on your phone." : "A place at the table."}</h1>
        <p>
          {table
            ? `Scan the code or open the link${online ? "" : " on the same Wi-Fi"}. Your hand stays on your phone; this screen shows the shared table.`
            : "Invite friends, then set out together."}
        </p>
        <div className="lobby-invite">
          {table && <QrCode text={link} label={`QR code to join room ${game.roomCode}`} />}
          <div className="lobby-invite-details">
            <div className="room-code">
              <small>Room code</small>
              <strong>{game.roomCode}</strong>
              <button className="secondary-btn" onClick={copy}>
                <Icon name="copy" />
                {copied ? "Link copied" : "Copy invite link"}
              </button>
            </div>
            <p className="lobby-link">{link}</p>
            {local && !online && addresses.length > 1 && (
              <label className="invite-address">
                Host network address{" "}
                <select
                  value={hostname}
                  onChange={(event) => {
                    setAddress(event.target.value);
                    setCopied(false);
                  }}
                >
                  {addresses.map((ip) => (
                    <option key={ip}>{ip}</option>
                  ))}
                </select>
              </label>
            )}
            {online ? (
              <p className="muted">
                Online link: friends can open it from anywhere. It stops working when the game
                window on the host PC closes.
              </p>
            ) : (
              <p className="muted">
                Open the invite on the same Wi-Fi or wired network. The host must allow Node.js on
                private networks in Windows Firewall. If your PC has a VPN, choose its Wi-Fi or
                Ethernet address above.
              </p>
            )}
          </div>
        </div>
        {!table && (
          <p className="muted tv-hint">
            Playing around a TV?{" "}
            {tvLink ? (
              <>
                In the TV&apos;s own browser, open <b>{tvLink}</b>
              </>
            ) : (
              <>
                Open this site on it, choose <b>TV screen</b>
              </>
            )}{" "}
            and enter room code {game.roomCode}. It shows the board and scores, never anyone&apos;s
            hand.
          </p>
        )}
        <div className="lobby-players">
          {game.players.map((player) => (
            <article key={player.id} style={{ "--player-color": player.color }}>
              <div className="player-avatar">
                {media.playerImages[player.id] ? (
                  <img src={media.playerImages[player.id]} alt="" />
                ) : (
                  player.name[0].toUpperCase()
                )}
              </div>
              <strong>{player.name}</strong>
              <small>
                {player.id === game.hostPlayerId ? "Host" : "Joined"}
                {player.id === game.viewer.playerId ? " / You" : ""}
              </small>
            </article>
          ))}
          {Array.from({ length: game.maxPlayers - game.players.length }, (_, i) => (
            <article className="empty-seat" key={i}>
              <span>Open seat</span>
            </article>
          ))}
        </div>
        {error && (
          <p className="setup-error" role="alert">
            {error}
          </p>
        )}
        <div className="lobby-footer">
          <span>
            {game.players.length}/{game.maxPlayers} players / {connection}
          </span>
          <button className="quiet-button" onClick={onLeave}>
            {table ? "Close TV screen" : "Leave room"}
          </button>
          {game.viewer.isHost ? (
            <button
              className="primary-btn"
              disabled={busy || game.players.length < 2}
              onClick={onStart}
            >
              Start the match
            </button>
          ) : (
            <strong>
              {table && game.players.length < 2
                ? "Waiting for players to join"
                : "Waiting for the host to start"}
            </strong>
          )}
        </div>
      </main>
    </div>
  );
}
