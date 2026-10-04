import { useState } from "react";

export default function Lobby({ game, media, busy, connection, error, onStart, onLeave }) {
  const [copied, setCopied] = useState(false);
  const [address, setAddress] = useState("");
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  const addresses = game.hostAddresses || [];
  const preferred = addresses.find((ip) => ip.startsWith("192.168.")) || addresses[0];
  const hostname = address || (local && preferred ? preferred : location.hostname);
  const link = `${location.protocol}//${hostname}${location.port ? `:${location.port}` : ""}/?room=${game.roomCode}`;
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
      <main className="lobby panel">
        <span className="eyebrow">Syria Traders / Network room</span>
        <h1>A place at the table.</h1>
        <p>Invite friends, then set out together.</p>
        <div className="room-code">
          <small>Room code</small>
          <strong>{game.roomCode}</strong>
          <button className="secondary-btn" onClick={copy}>
            {copied ? "Link copied" : "Copy invite link"}
          </button>
        </div>
        <p className="lobby-link">{link}</p>
        {local && addresses.length > 1 && (
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
        <p className="muted">
          Open the invite on the same Wi-Fi or wired network. The host must allow Node.js on private
          networks in Windows Firewall. If your PC has a VPN, choose its Wi-Fi or Ethernet address
          above.
        </p>
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
            Leave room
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
            <strong>Waiting for the host to start</strong>
          )}
        </div>
      </main>
    </div>
  );
}
