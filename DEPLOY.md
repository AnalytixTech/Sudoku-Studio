# Deploying Sudoku Studio

Written for: whoever sets up the hosting — assumes Netlify and Supabase accounts
but no prior knowledge of this codebase.

## What runs where

| Piece | Host | Why |
| --- | --- | --- |
| Web app (static) | **Netlify** | Vite build output |
| Wallet API (`/api/*`) | **Netlify Functions** | Plain request/response, no persistent connections |
| Database + Auth | **Supabase** | Postgres + Google/email sign-in |
| Battle relay (WebSocket) | **A Node host** | Holds connections open — *cannot* run on Netlify |

> **The relay is the one thing Netlify cannot host.** Netlify Functions are
> serverless and terminate per request, so they cannot keep a WebSocket open.
> Everything else lives on Netlify. If you skip the relay, the whole app still
> works — only 1v1 battles are unavailable.

---

## 1. Supabase

### 1.1 Create the project

Create a project, pick a region near your players, and save the database
password.

### 1.2 Collect four values

From **Project Settings**:

| Value | Where | Used by |
| --- | --- | --- |
| Project URL | API → Project URL | app + API |
| `anon` public key | API → Project API keys | app |
| JWT secret | API → JWT Settings | API (verifies sign-ins) |
| Connection string | Database → Connection string → **URI** | API |

For the connection string use the **connection pooler** (port `6543`), not the
direct connection. Serverless functions open a new connection per cold start and
will exhaust a direct Postgres connection limit.

Replace `[YOUR-PASSWORD]` in the URI with the database password.

### 1.3 Enable sign-in providers

**Authentication → Providers**:

- **Google** — create an OAuth client in Google Cloud Console, paste the client
  id and secret into Supabase, and add Supabase's callback URL
  (`https://<project>.supabase.co/auth/v1/callback`) to the Google client's
  authorised redirect URIs.
- **Email** — enable magic links if you want sign-in without a Google account.

**Authentication → URL Configuration**: set **Site URL** to your Netlify domain,
and add it to **Redirect URLs**. OAuth will fail silently if this is missing.

### 1.4 Database schema and RLS

Nothing to run by hand. The API creates everything on first boot
(`server/api/db.js`), and every statement is `IF NOT EXISTS`, so it is safe to
run repeatedly.

**The tables are deliberately not in `public`.** They live in a `sudoku` schema
(override with `DB_SCHEMA`). This matters: Supabase exposes every table in
`public` through PostgREST using the **anon key, which ships inside the browser
bundle**. Wallet tables there would be readable — and writable — by anyone
holding a public key, bypassing the entire server-authoritative design. A schema
outside the exposed list is simply unreachable over the REST API.

On top of that, **RLS is enabled on all five tables with no policies attached**.
That is a deny-all default: even if the schema were later added to the exposed
list, PostgREST returns nothing. The API connects as the owner role, which
bypasses RLS, so it is unaffected.

Two rules to keep this intact:

- **Do not add the `sudoku` schema** to Settings → API → *Exposed schemas*.
- **Do not write RLS policies** on these tables. They are not meant to be
  client-reachable; a policy would only open a door. If you later add a table
  the browser *should* read directly, put it in `public` with its own policies
  and leave these alone.

To inspect data, use the SQL editor (which runs as the owner):

```sql
select * from sudoku.wallets order by updated_at desc limit 20;
-- reconcile any account: these two must be equal
select sum(delta_coins) from sudoku.ledger where user_id = 'u_...';
select coins from sudoku.wallets where user_id = 'u_...';
```

---

## 2. Netlify

### 2.1 Connect the repository

Build settings come from `netlify.toml`, so there is nothing to fill in:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

### 2.2 Environment variables

**Site configuration → Environment variables.**

Build-time (inlined into the bundle — safe to expose):

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase `anon` public key |
| `VITE_WS_URL` | `wss://your-relay-host` (set after step 3) |

Runtime, for the Function (**never** prefix these with `VITE_` — that would
publish them in the JavaScript bundle):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase pooler connection string |
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret |
| `ALLOWED_ORIGINS` | `https://your-site.netlify.app` |
| `NODE_ENV` | `production` |
| `DB_SCHEMA` | optional; defaults to `sudoku` |

`NODE_ENV=production` matters: it is what makes the development sign-in refuse
to run. Do **not** set `DEV_AUTH` in production.

### 2.3 Deploy and check

After the first deploy:

```bash
curl https://your-site.netlify.app/api/me
# {"error":"unauthorized"}   <- correct: the API is up and requires a session
```

A `404` means the `/api/*` redirect is not being applied; a `500` usually means
`DATABASE_URL` is wrong or the database is unreachable.

---

## 3. Battle relay

Only needed for 1v1 battles.

### 3.1 Deploy

`render.yaml` deploys it to Render as-is; the `Dockerfile` works on any
container host (Railway, Fly.io, Cloud Run, a VPS). Both run
`node server/index.js` and expose `/health`.

Environment for the relay:

| Variable | Value |
| --- | --- |
| `ALLOWED_ORIGINS` | `https://your-site.netlify.app` |
| `PORT` | usually set by the host |

Leave `DATABASE_URL` unset here — the relay does not need the wallet API, and
leaving it out means a database problem can never take battles down.

### 3.2 Point the app at it

Set `VITE_WS_URL` on Netlify to the relay's URL with the `wss://` scheme, then
**redeploy** — `VITE_` variables are baked in at build time, so changing one
without rebuilding has no effect.

Use `wss://`, not `ws://`. Browsers block insecure WebSockets from an HTTPS page.

On free tiers that sleep when idle, the first connection after a quiet period can
take 30–60s while the service wakes. The client retries with backoff, so the
lobby recovers on its own.

---

## 4. Verify

1. Load the site — the menu appears, and the app works signed out.
2. **Sign in** → the Account dialog shows your email, and the balance persists
   across a hard refresh.
3. Solve a puzzle → the coin balance rises, and rises again in a private window
   after signing in with the same account (proves the server, not the browser,
   owns the balance).
4. Open the site in two different browsers, start a battle in one and paste the
   room link into the other → both should show "Connected to battle server".
5. Install the app (browser install prompt), then go offline → it still loads and
   generates puzzles.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Sign-in redirects then lands signed out | Netlify URL missing from Supabase **Redirect URLs** |
| `/api/*` returns 404 | `netlify.toml` redirect not applied — confirm it deployed |
| API 500s on every call | `DATABASE_URL` wrong, or using the direct connection instead of the pooler |
| Balance resets on refresh | Signed out — that is expected; local play is per-device |
| Battles stuck "Connecting…" | `VITE_WS_URL` unset or set without rebuilding |
| Battles fail only in production | Relay's `ALLOWED_ORIGINS` does not include your site |
| Sign-in works locally but not deployed | `DEV_AUTH` was set in production, or `SUPABASE_JWT_SECRET` is missing |
| `permission denied for schema sudoku` | The connection string is not the owner role — use the URI from Database → Connection string, not a limited role |

## A note on cost

Supabase free projects pause after a period of inactivity, and paused projects
reject connections — which for a wallet holding purchased currency means an
outage. Move to a paid plan before taking real payments.
