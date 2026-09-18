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

## Progression and economy

Two separate quantities, defined in `src/lib/economy.ts`:

- **Coins** — the spendable currency. Earned by solving; spent on hints, notes,
  auto-solve and continues.
- **XP** — only ever earned, and drives the player's **Level**. Spending never
  reduces it.

They were one number before, and the top bar and stats modal each showed a
different figure labelled "XP". Keeping them apart also means a future rewarded
ad can pay out coins without letting anyone buy progression.

| Earned | Coins | XP |
| --- | --- | --- |
| Win (easy → grand master) | 8 → 50 | 20 → 180 |
| Flawless solve (0 mistakes) | ×1.5 | — |
| Daily challenge | 25 + 2/streak day (max +20) | 100 |
| Battle win | 30 | 120 |
| Battle played | — | 25 |

| Spent | Coins |
| --- | --- |
| Hint | 15 |
| Auto-fill notes | 25 |
| Auto-solve | 60 |
| Continue after failing | 40 (first one each day is free) |

The rates are deliberately tight: roughly one win buys roughly one hint, so
using a helper is a real decision. Returning players are migrated from the old
single-XP balance, capped so nobody starts with enough to never choose again.

**Mistake limit.** Three mistakes fail a single-player or daily puzzle and open
the Game Over screen, which offers a continue. Battles are exempt — they are
already scored by points, and ending one on a mistake would hand the opponent
the win.

**Where ads fit.** The continue in `GameOverModal` is the natural rewarded-video
placement: the player actively wants something at that moment rather than being
interrupted. `credit(coins)` in `economy.ts` is the entry point for paying out a
reward. Avoid interstitials during a puzzle, and never during a battle — the
opponent's clock keeps running.

## Cosmetics

`src/lib/cosmetics.ts` defines what coins buy: **11 themes** (including
**Daylight**, the light mode), **4 numeral styles** and **4 win effects**,
browsed in the shop (🎨 Shop, on the menu and the in-game top bar). Three themes
and one of each other kind are free; the rest cost coins, and the premium tail
also requires a **Level**, which is what gives lifetime XP a purpose beyond a
number on the profile.

Everything is expressed as body classes — `theme-<id>` swaps the CSS variable
set, `digits-<id>` restyles board numerals, candidate pips and the keypad
together. Adding a theme means adding one variable block in `styles.css` and one
entry in `THEMES`; no component changes. Numeral styles beyond the default use
system font stacks so nothing extra has to download and they still work offline.

### Theming contract

Board surfaces are tokens, not hardcoded colours, so a theme can invert the
whole surface treatment rather than only recolouring it:

`--board-bg` · `--cell-bg` · `--cell-border` · `--cell-hover` · `--cell-shadow`
· `--given` · `--pip` · `--on-accent` · `--scrim` · `--crop-bg` ·
`--review-cell-bg` · `--review-cell-fg`

They default to the original dark values in `:root`, so the ten dark themes need
only the palette block. **Daylight** overrides the surface tokens too — a light
cell needs a soft lift instead of the dark inset shadow, and `--on-accent` flips
from near-black to white.

Every theme is contrast-checked across five pairings (user digits, givens,
candidate pips, dim text, and text on accent). All eleven pass WCAG AA; the
tightest is 4.94:1.

## Wallet security model

Read this before adding payments.

**Coins held in `localStorage` cannot be secured.** Anyone can open DevTools and
set the balance to anything. Obfuscation, checksums, encryption and HMAC signing
all fail the same way: the key or the check ships inside the bundle. Nothing in
this repo pretends otherwise.

That is tolerable only because local coins buy nothing that affects anyone else
— cosmetics are visible to their owner alone, helpers are single-player, and
battles use a separate score state that coins never touch. A player who edits
their balance is cheating themselves.

**It stops being tolerable the moment money is involved.** So `server/api/`
holds an authoritative wallet, and the rule that makes it worth having is:

> The client never states an amount. It reports an **event** — "won a hard
> puzzle, no mistakes, in 4m12s" — and the server prices it from
> `shared/economy.json`.

| Property | How |
| --- | --- |
| Accounts | Google Sign-In; the server verifies the ID token, the client never asserts identity |
| No minting | Amounts come from the server's own price table, never the request body |
| No double-payout | The ledger's primary key is the caller's event id, so retries are absorbed |
| No negative balances | A DB `CHECK` plus a `SELECT … FOR UPDATE` inside the transaction |
| Auditability | Every change is a ledger row, including the signup grant, so `sum(ledger) = balance` for every account |
| Bounded abuse | Per-hour earn cap, a per-event coin cap, and rejection of implausible events (a "win" faster than a human could type) |
| Purchases | Credited only by the server, in their own ledger kind, exempt from the gameplay rate limit |

Honest limit: **purchased** currency can be made airtight, **earned** currency
cannot. The client still reports that it solved a puzzle. Rate limits and
plausibility checks bound how fast a tampered client can inflate a balance;
eliminating it entirely would mean validating gameplay server-side, which is not
worth it for this game. Fraud on the money path is the part that actually costs
you, and that path is closed.

### Running the API

The wallet is optional — without `DATABASE_URL` the service runs as a pure
relay, so **battles keep working even if the database is down**.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string; enables the API |
| `GOOGLE_CLIENT_ID` | OAuth client id used to verify sign-in tokens |
| `ALLOWED_ORIGINS` | Locks both the API and the relay to your app's domain |
| `DEV_AUTH=1` | Local only — accepts `dev:someone@example.com` as an identity. Refuses to work when `NODE_ENV=production` |

Tests run the production SQL against [PGlite](https://pglite.dev) in-process, so
no database has to be provisioned to verify the wallet.

## Saving and resuming

The in-progress puzzle is autosaved to `localStorage` (`src/lib/persistence.ts`)
and offered as a **Continue** card on the menu. Board, notes, undo history,
timer and mistake count all survive a reload or the OS evicting a backgrounded
PWA. The whole `VariantConfig` is stored rather than just the variant id,
because jigsaw region maps are randomised per game and cannot be rebuilt from
the id alone. Battles are not saved: they are transient and depend on an
opponent.

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
