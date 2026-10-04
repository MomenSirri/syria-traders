# Syria Traders

An original Syrian-inspired resource, trading, and settlement game. React, plain CSS, Node.js, Express, and an SVG board. Supports 2-4 people sharing a screen or joining a room from separate browsers on the same local network.

## Start Playing (Windows)

Install **Node.js 24 or newer**, then double-click **run-game.bat**. It installs missing dependencies, builds the latest UI, starts HTTPS, and opens **https://localhost:8443**. Keep its window open while playing; Ctrl+C stops the host.

The certificate is self-signed. A warning is expected on your own host and your friends' devices. Verify the address belongs to your host PC before proceeding. No certificate trust or firewall settings are changed automatically. Stop any previous game/dev server first if port 8443 is busy.

Port 8443 now serves both the built game and API. Rebuilding on launch prevents accidentally serving an older screen.

### Play With Friends on Your Network

1. Choose **Host room**, enter your name, customize the map, and create the room.
2. Copy the lobby invite. It uses the host's LAN IP instead of `localhost`. If several adapters exist, select your Wi-Fi/Ethernet address, not a VPN/virtual adapter.
3. Friends open the link on the same network, enter their names, and choose **Join the table**. They may need to accept the local certificate warning.
4. Allow Node.js on **Private networks** in Windows Firewall if prompted. Do not disable the firewall. Guest Wi-Fi/client isolation can prevent devices reaching each other.
5. Wait for 2-4 players, then the host presses **Start the match**. Joining does not auto-start the room at two players.

Each browser has its own player seat and private hand. Only the active player can act. To test several players on one PC, use separate profiles/incognito contexts, not tabs sharing browser storage. Keep the host PC awake and its server running. This is trusted-LAN multiplayer, not public internet matchmaking.

Leaving a lobby frees your seat. If the host leaves, the next player becomes host. An empty room closes. After a match starts, seats cannot be removed or reassigned.

## Development

```sh
npm install
npm run install:all
npm run dev
```

Open **https://localhost:5173** for Vite hot reload. `/api` is proxied to the HTTPS backend on port 8443. Other devices can use `https://HOST_LAN_IP:5173` too.

Browser storage is origin-specific: ports 5173 and 8443, `localhost`, and a LAN IP each have separate saved seats. Use the same address to resume a match.

For the built app without the launcher:

```sh
npm run build
npm start
```

Server options: `PORT` (default 8443), `LISTEN_HOST` (default `0.0.0.0`, all interfaces for LAN play), `HTTPS` (default on; `HTTPS=0` serves plain HTTP), `GAME_DATA_DIR` (default `server/data`), optional comma-separated `ALLOWED_ORIGINS` for a separately hosted frontend. Same-origin is the default. `VITE_API_BASE_URL` is an optional client build-time override. Do not expose this development server directly to the public internet.

### Cloud Preview

For a cloud workspace whose preview proxy already provides HTTPS:

```sh
npm run start:preview
```

It builds, then serves plain HTTP on `0.0.0.0:8080`. `PORT`, `LISTEN_HOST` and `HTTPS` override those defaults. For Vite hot reload behind a preview proxy, set `HTTPS=0`, `DEV_PORT` and `DEV_ALLOWED_HOSTS` (comma-separated preview domains) before `npm run dev`. Local play, `npm start` and `run-game.bat` are unchanged and still use HTTPS on 8443.

## Rules and Feedback

- Setup is separate from play. Add names/photos, reorder 19 territories, upload terrain, randomize map/ports, or manually swap number tokens. Balanced numbers keep adjacent 6/8 tiles apart.
- Place a village and adjacent road, then reverse player order for the second placement. Your second village grants starting resources.
- Roll once per turn. Matching regions produce one resource per village, two per city, unless blocked by the bandit.
- Build along your own network. Villages must be at least two edges apart. An opponent's settlement blocks road continuation. Limits: 15 roads, 5 villages, 4 cities per player.
- Bank trades cost four identical cards. Occupy a port endpoint for 3:1 on any resource or 2:1 on its specific resource. Piers show the exact port sites.
- On seven, hands over seven cards automatically discard half (rounded down), randomly selected. Move the bandit, then steal a random card from an eligible adjacent opponent. Automatic discard is a deliberate simplified rule.
- If the bank cannot fulfill all claims for a resource on a roll, nobody receives that resource. Other resources still pay normally.
- First to 10 points wins. Villages are worth 1; cities 2. No development cards, longest-road bonuses, AI players, or player-to-player trades yet.

Gain badges stay beside resource counts for **30 seconds**, fade over 700 ms, then clear. Simultaneous resources use separate rows. Repeated gains aggregate while each event retains its expiry. Dice production also briefly lights up producing tiles. Uploaded art locks after setup.

## Saves and Recovery

The **server is authoritative**, including shared-screen games. Every accepted move writes `server/data/<game-id>.json` using a temporary file and atomic rename. The server reloads these files on restart.

The browser stores its seat token and latest permitted snapshot under `syria_traders_save_v1`. Artwork is separate under `syria_traders_art_v2`, avoiding large photo writes on every move. Setup drafts use `syria_traders_setup_v2` until a match is successfully created/joined; then the redundant draft is removed to make room for the finalized art. Refresh reconnects the saved seat and fetches the latest revision. Moves lock during disconnection and reconnect automatically.

Back up `server/data` to preserve games. Browser data is also needed for player access. **New table** forgets this browser's seat after confirmation; clearing browser data does the same. Account-based seat recovery is not implemented. Do not share save files or seat tokens.

Pre-upgrade browser snapshots without a session cannot safely be imported as network games. They are not automatically removed; setup warns that a new match will replace the browser save. Existing server files are not deleted.

## Layout and Performance

- Letterboxed 16:9 desktop dashboard (widths 1200px and above). No main-page scrolling at tested desktop sizes; the log has its own permanent scrollbar.
- Four players use a 2x2 grid instead of four squeezed vertical cards. Resource rows are at least 24px with 8px gaps. Gain badges have a reserved gutter.
- Smaller/portrait devices reflow and allow page scrolling. Readability takes priority over forcing a desktop layout onto a phone.
- The SVG board fits its actual bounds. Labels, tokens, roads, and keyboard-accessible build targets scale together.
- Original local SVG illustrations replace unrelated external photos. Custom images are cropped/resized before upload. Included illustrations are not documentary photos of the regions.
- Server-sent events send tiny revision notices instead of constant full-state polling. Artwork is sent on initial sync/lobby changes, not each move.
- Request timeouts, duplicate-click locks, revision checks, and player authentication guard actions. Opponent resource breakdowns never leave the server in network rooms.

## Code Map

```text
client/
  public/terrain/            Original resource illustrations
  src/
    App.jsx                 Setup/lobby/game routing
    api/gameApi.js          Authenticated requests and live stream
    components/
      GameSetup.jsx         Names, avatars, map arrangement, custom art
      Lobby.jsx             Invitations, seats, host-controlled start
      GameBoard.jsx         SVG map, ports, placement targets
      PlayerCard.jsx        Avatar, score, aligned rows, gain badges
      Sidebar.jsx           Player grid
      ActionBar.jsx         Dice/build/trade controls and costs
      DiceDisplay.jsx       Graphical dice
      AnimatedNumber.jsx    Resource count transition
      GameLog.jsx           Scrollable history
      ResourceIcon.jsx      Original vector icons
    hooks/
      useMatch.js           Save/load, reconnect, guarded actions
      useResourceGains.js   Badge expiry and aggregation
    styles/
      index.css             Theme and shared elements
      app.css               Dashboard, board, setup, responsive layout
      PlayerCard.css        Card and resource layout
    utils/
      storage.js            Session snapshot and artwork cache
      images.js             Photo validation, resize, URL cleanup
  test/feedback.test.mjs
server/
  src/
    index.js                HTTPS, LAN URLs, optional browser launch
    app.js                  API and built frontend hosting
    routes/gameRoutes.js    Protected actions and SSE
    game/
      boardGenerator.js     Geometry and coastal ports
      gameService.js        Turn flow, production, building, scoring
      rules.js              Placement and harbor discounts
      sessions.js           Seats, authorization, private game views
      gameStore.js          Atomic disk saves and revision events
  test/game.test.js
  data/                     Generated saves (ignored)
shared/gameConfig.json      Regions, resources, colors, costs, tokens
scripts/
  create-terrain.cjs         Regenerate original SVG art
  browser-smoke.cjs          Isolated multi-browser acceptance tests
run-game.bat                Windows play launcher
```

The generator shares rounded corners between neighboring tiles, then creates edges and adjacency lists. The 19 land tiles have **54 vertices and 72 edges**, surrounded by 18 sea hexes. Nine ports attach to distinct coastal edge pairs. Rules operate on these IDs, not screen coordinates. Near-zero coordinates are normalized so floating-point `-0` cannot split a shared corner.

## API

`POST /api/games` creates a match and returns a game plus secret seat token. `POST /api/games/:id/join` joins an unstarted network room using its ID or six-character code.

The following routes require `Authorization: Bearer <token>`. Mutations also require `X-Game-Revision: <latest revision>`; stale moves return 409 and must be retried after refresh.

- `GET /api/games/:id` (add `?media=1` for artwork)
- `GET /api/games/:id/events` (SSE revisions)
- `POST /api/games/:id/start` (host only)
- `POST /api/games/:id/leave` (before start; own seat only)
- `POST /api/games/:id/setup/place`
- `POST /api/games/:id/roll`
- `POST /api/games/:id/build/road`
- `POST /api/games/:id/build/village`
- `POST /api/games/:id/build/city`
- `POST /api/games/:id/trade/bank`
- `POST /api/games/:id/robber/move`
- `POST /api/games/:id/end-turn`

`GET /api/health` is public. Network actions can only name the authenticated player. In shared-screen mode, one local session controls all seats.

## Verification

```sh
npm test
npm run build
```

Node tests cover topology, placement for 2/3/4 players, production, shortages, robber/discards, road blocking, ports, limits, victory, disk reload, authorization, stale actions, SSE, popup timing, and save helpers.

Playwright is a pinned dev dependency. Installed Chrome/Edge is used automatically on Windows; otherwise install its matching Chromium once with `npm run browsers:install`. Then:

```sh
npm run build
npm run test:browser
HTTPS=0 npm run test:browser   # same checks in cloud preview (HTTP) mode
```

GitHub Actions runs the Node tests, build and both browser runs on Node 24 for every pull request.

Optional `CHROME_PATH` selects a browser executable; `PLAYWRIGHT_MODULE` selects an existing Playwright installation. Tests launch an isolated HTTPS host with separate data in `test-results`, drive four independent browser contexts, verify layouts and refresh/restart recovery, and save screenshots. They do not use your real saved matches.
