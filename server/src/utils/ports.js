// The ports this host is listening on, so invite links can point phones at HTTPS
// even when the page was opened on the TV's plain-HTTP address.
// publicUrl is the online address while Tailscale Funnel is on (run-game-online.bat).
module.exports = { secure: null, tv: null, publicUrl: null };
