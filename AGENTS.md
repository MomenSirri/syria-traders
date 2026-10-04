# AGENTS.md

Syria Traders: a LAN multiplayer trading game. React + plain CSS client (`client/`, Vite), Express server (`server/`), shared rules data in `shared/gameConfig.json`. See README.md for rules, API and code map.

## Setup

- Node.js 24 (`.nvmrc`). Three npm projects, three lockfiles; install all with `npm run install:ci`.
- Browser tests need Chromium for the pinned Playwright: `npm run browsers:install` (add `--with-deps` on a fresh Linux image).

## Checks before a PR

```sh
npm test                    # node:test, server + client logic
npm run build               # client build into client/dist
npm run test:browser        # Playwright smoke, needs the build; HTTPS like local play
HTTPS=0 npm run test:browser  # same checks over plain HTTP (cloud preview mode)
```

CI (`.github/workflows/ci.yml`) runs all four on Node 24.

## Running

- Local/LAN play: `npm start` serves HTTPS on 8443 with a self-signed cert in `certs/`. `run-game.bat` depends on this; keep it working.
- Cloud preview: `npm run start:preview` builds, then serves plain HTTP on `0.0.0.0:8080` for a proxy that terminates TLS. Override with `PORT`, `LISTEN_HOST`, `HTTPS`.
- Vite dev: `npm run dev` (5173). `DEV_HOST`, `DEV_PORT`, `DEV_ALLOWED_HOSTS` (comma-separated preview domains), and `HTTPS`/`PORT` to match the API server.

## Rules for changes

- Keep the stack: React, plain CSS (no CSS frameworks), Express, no new runtime services.
- The server is authoritative. Game rules live in `server/src/game/`; the client only renders and sends intents.
- Never send opponents' hands or private gain events to other players (`sessions.js` `view`). Network actions must stay token-authenticated and revision-checked.
- Saved games must keep loading: don't rename or drop fields in `server/data/*.json` or the `syria_traders_*` browser storage keys without a migration.
- LAN play must keep working: server binds `0.0.0.0` by default and the lobby invite uses the host's LAN IP.
- Never commit or deploy publicly: no credentials, `.env`, `certs/`, `*.pem`, `server/data/` saves, or `test-results/`.
