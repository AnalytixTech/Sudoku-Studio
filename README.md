# Sudoku Studio

A React + TypeScript Sudoku app: eight grid variants (4×4 to 9×9, standard and
jigsaw), a step-by-step logical solver that explains its reasoning, a photo/OCR
solver, daily challenges, and 1v1 online battles.

## Running locally

```bash
npm install
npm run dev      # app on http://localhost:5173
npm run relay    # battle relay on ws://localhost:8787  (second terminal)
```

The relay is only needed for 1v1 battles. Everything else works without it.

To try a battle on one machine, open the app, click **1v1 Battle**, then paste
the room link into a second browser profile or an incognito window — a normal
second tab shares storage and would be treated as the same player.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server for the app |
| `npm run relay` | Battle relay (WebSocket) on port 8787 |
| `npm run build` | Typecheck, then build the app to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |

## Architecture

The app is entirely client-side; `localStorage` holds stats, XP, themes and
puzzle progress. There is no application backend.

- `src/sudoku.ts` — grid geometry for every variant, including jigsaw region
  maps that are randomly rotated/reflected per game.
- `src/lib/generator.ts` — fills a solution, then digs clues while verifying
  the puzzle stays uniquely solvable.
- `src/lib/solver.ts` — human-technique solver (singles → pairs → pointing →
  box-line → triples → X-Wing → Y-Wing → Swordfish, then guided trial). Every
  step carries prose explaining the deduction. Fully variant-aware: geometry is
  derived from the `VariantConfig` passed in.
- `src/lib/ocr.ts` — computer-vision pipeline feeding tesseract.js: Otsu
  binarization, grid-line detection, per-cell adaptive thresholding, then
  topological post-correction of the OCR result.
- `server/index.js` — the battle relay. See below.

## 1v1 battles

Battles run over a WebSocket relay in `server/index.js`. The relay is
deliberately dumb: it holds no game state and decides nothing, it only copies
each message to the other player in the same room. The **host client stays
authoritative** — it generates the puzzle and broadcasts it in `START_MATCH`.

The protocol (`src/lib/multiplayer.ts`) is transport-agnostic, so the relay can
be swapped for a managed realtime service without touching game code.

Two things worth knowing if you change this:

- The relay **never echoes a message back to its sender**. Each client applies
  its own actions locally and treats every inbound message as the opponent's.
- A room holds **two players**. A third connection is accepted and then closed
  with code `4409`, which the client shows as "This room already has two
  players".

The client reconnects automatically with backoff, and queues anything sent
while offline, so a dropped connection does not end a match.

## Installable app (PWA)

The build emits a web app manifest and a service worker (`vite-plugin-pwa`), so
the app can be installed to a home screen or desktop and works offline. Puzzle
generation, the solver and all stats are client-side, so offline play is the
full single-player experience — only 1v1 battles need the network.

The service worker uses `registerType: 'prompt'` rather than `autoUpdate`: the
in-progress puzzle lives in React state, so a silent reload would discard the
player's board. When a new version is deployed, `UpdatePrompt` offers a Reload
button and waits.

Runtime caching covers the Google Fonts files and the tesseract.js wasm/language
data, so the photo solver keeps working offline once it has been used once.

Service workers only register over HTTPS (or `localhost`). `npm run dev` leaves
the service worker off so you are not editing against stale cached assets — use
`npm run build && npm run preview` to exercise the installable build.

### Icons

`public/icon.svg` is the source of truth: a 3×3 grid with the centre cell
solved, drawn in the same indigo gradient as the in-app logo. The numeral is the
Orbitron 900 glyph converted to an outline `<path>`, so the artwork needs no
font at render time — a favicon does not inherit the page's webfonts.

| File | Used for |
| --- | --- |
| `icon.svg` | Vector master for the full mark |
| `favicon.svg` | Browser tab — a lone numeral, since the grid is illegible at 16px |
| `favicon-16/32.png` | Tab fallback for browsers without SVG favicon support |
| `apple-touch-icon.png` | iOS home screen (iOS does not accept SVG here) |
| `pwa-192/512.png` | Manifest icons (`purpose: any`) |
| `pwa-maskable-512.png` | Manifest `purpose: maskable` — full bleed, so Android's circle/squircle crop has colour to the edge |

The PNGs are generated from the SVG sources. Manifest and `apple-touch-icon`
entries must be raster, which is why both formats ship.

## Deploying

This needs **two** deploys, because the app is static but the relay is a
long-lived process.

### 1. The app → Netlify or Vercel

`netlify.toml` and `vercel.json` are both committed; either host builds with
`npm run build` and publishes `dist/`.

### 2. The relay → a Node host

> **Netlify and Vercel cannot host the relay.** Their functions are serverless
> and terminate per request, so they cannot hold a WebSocket open. The relay
> needs a host that keeps a process running: Render, Railway, Fly.io, Cloud
> Run, or any VPS.

`render.yaml` deploys it to Render as-is; the `Dockerfile` works on any
container host. Both start `node server/index.js` and expose `/health`.

Relay environment variables:

| Variable | Purpose |
| --- | --- |
| `PORT` | Listen port (most hosts set this for you; defaults to 8787) |
| `ALLOWED_ORIGINS` | Comma-separated origins allowed to connect. Unset = any. Set this to your app's URL in production. |

### 3. Point the app at the relay

Set `VITE_WS_URL` on Netlify/Vercel to the relay's public URL, then redeploy:

```ini
VITE_WS_URL=wss://your-relay.onrender.com
```

Use `wss://`, not `ws://` — browsers block insecure WebSockets from an HTTPS
page. `VITE_` variables are inlined at build time, so changing it requires a
rebuild.

If instead you reverse-proxy the relay at `/ws` on the app's own domain, leave
`VITE_WS_URL` unset and the client derives the URL from `window.location`.

On free tiers that sleep when idle (Render's included), the first connection
after a quiet period can take 30–60s while the service wakes. The client keeps
retrying, so the lobby recovers on its own.
