// Storage for the authoritative wallet.
//
// Production runs Postgres (DATABASE_URL). Tests run the same SQL against
// PGlite, an in-process Postgres build, so the queries that ship are the
// queries that were verified.

/**
 * Tables live in their own schema, NOT `public`.
 *
 * Supabase exposes every table in `public` through PostgREST using the anon
 * key, which ships in the browser bundle. Wallet tables there would be readable
 * and writable by anyone, bypassing the entire server-authoritative design.
 * A schema outside the exposed list is simply unreachable over the REST API.
 *
 * RLS is then enabled on every table with no policies attached -- a deny-all
 * default -- so even if the schema were later exposed, PostgREST returns
 * nothing. The API connects as the owner role, which bypasses RLS.
 */
export const SCHEMA = process.env.DB_SCHEMA || 'sudoku'

const DDL = `
CREATE SCHEMA IF NOT EXISTS ${SCHEMA};

CREATE TABLE IF NOT EXISTS ${SCHEMA}.users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ${SCHEMA}.wallets (
  user_id     TEXT PRIMARY KEY REFERENCES ${SCHEMA}.users(id) ON DELETE CASCADE,
  coins       INTEGER NOT NULL DEFAULT 0,
  xp          INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coins_non_negative CHECK (coins >= 0),
  CONSTRAINT xp_non_negative CHECK (xp >= 0)
);

-- Every balance change is a ledger row. The primary key is the caller's event
-- id, which makes replays no-ops: a retried request cannot pay out twice.
CREATE TABLE IF NOT EXISTS ${SCHEMA}.ledger (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES ${SCHEMA}.users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  reason       TEXT NOT NULL,
  delta_coins  INTEGER NOT NULL,
  delta_xp     INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_user_time ON ${SCHEMA}.ledger (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ${SCHEMA}.entitlements (
  user_id     TEXT NOT NULL REFERENCES ${SCHEMA}.users(id) ON DELETE CASCADE,
  item        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item)
);

CREATE TABLE IF NOT EXISTS ${SCHEMA}.sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES ${SCHEMA}.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON ${SCHEMA}.sessions (user_id);

ALTER TABLE ${SCHEMA}.users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${SCHEMA}.wallets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${SCHEMA}.ledger       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${SCHEMA}.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${SCHEMA}.sessions     ENABLE ROW LEVEL SECURITY;

-- Belt and braces: never grant the Supabase client roles anything here.
REVOKE ALL ON SCHEMA ${SCHEMA} FROM PUBLIC;
`

/**
 * @typedef {{ query(sql: string, params?: any[]): Promise<{rows: any[]}>,
 *             exec(sql: string): Promise<void>,
 *             tx<T>(fn: (c: any) => Promise<T>): Promise<T>,
 *             close(): Promise<void> }} Db
 */

/** Postgres via `pg`, for production. */
async function createPgDb(connectionString) {
  const { default: pg } = await import('pg')
  const pool = new pg.Pool({
    connectionString,
    // Managed Postgres almost always terminates TLS with its own cert.
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
    max: 5,
  })
  return {
    async query(sql, params = []) {
      return pool.query(sql, params)
    },
    async exec(sql) {
      await pool.query(sql)
    },
    async tx(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const out = await fn(client)
        await client.query('COMMIT')
        return out
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
    },
    async close() {
      await pool.end()
    },
  }
}

/** In-process Postgres, for tests. Same SQL, no server to provision. */
async function createMemoryDb() {
  const { PGlite } = await import('@electric-sql/pglite')
  const pglite = await PGlite.create()
  const conn = {
    query: (sql, params = []) => pglite.query(sql, params),
  }
  return {
    query: (sql, params = []) => pglite.query(sql, params),
    // Multi-statement SQL (the schema) needs exec, not query.
    exec: (sql) => pglite.exec(sql),
    async tx(fn) {
      await pglite.exec('BEGIN')
      try {
        const out = await fn(conn)
        await pglite.exec('COMMIT')
        return out
      } catch (e) {
        await pglite.exec('ROLLBACK')
        throw e
      }
    },
    async close() {
      await pglite.close()
    },
  }
}

/**
 * @param {string} [connectionString] DATABASE_URL; omit for the in-memory test db.
 * @returns {Promise<Db>}
 */
export async function openDb(connectionString = process.env.DATABASE_URL) {
  const db = connectionString ? await createPgDb(connectionString) : await createMemoryDb()
  await db.exec(DDL)
  return db
}

