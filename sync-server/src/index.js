/**
 * Neatly Household sync server (Cloudflare Worker + D1).
 *
 * A household is shared by an invite key "<householdId>.<secret>". Anyone holding the key can
 * read and write that household, so the key is only ever shown to the person who shares it.
 * Each change carries the time it was made on the phone ("at"); the newest write wins.
 */
const TABLES = new Set(['household', 'departments', 'routines', 'tasks', 'occurrences', 'dayLogs', 'vacations', 'records', 'photos']);
const ORIGINS = ['https://rcourtneygrace.github.io', 'http://localhost:5173', 'http://localhost:5180'];
const PULL_LIMIT = 200;
const PULL_BYTES = 4_000_000;
const MAX_DATA = 1_900_000;

function cors(req) {
  const origin = req.headers.get('Origin') ?? '';
  const ok = ORIGINS.includes(origin) || /^http:\/\/(127\.0\.0\.1|(192\.168|10)\.[\d.]+):\d+$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } });
}

function randomHex(bytes) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time compare of two hex strings. */
function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorize(req, env) {
  const m = /^Bearer ([0-9a-f]{32})\.([0-9a-f]{64})$/.exec(req.headers.get('Authorization') ?? '');
  if (!m) return null;
  const row = await env.DB.prepare('SELECT secret_hash FROM households WHERE id = ?').bind(m[1]).first();
  if (!row || !same(row.secret_hash, await sha256(m[2]))) return null;
  return m[1];
}

async function createHousehold(req, env) {
  const id = randomHex(16);
  const secret = randomHex(32);
  await env.DB.prepare('INSERT INTO households (id, secret_hash, created_at) VALUES (?, ?, ?)')
    .bind(id, await sha256(secret), new Date().toISOString())
    .run();
  return json(req, { key: `${id}.${secret}` });
}

/** Push this phone's changes, then return everything newer than its cursor. */
async function sync(req, env, household) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'bad json' }, 400);
  }
  const changes = Array.isArray(body.changes) ? body.changes : [];
  const since = Number.isInteger(body.since) ? body.since : 0;

  const stmts = [];
  for (const c of changes) {
    if (!TABLES.has(c.tbl) || typeof c.id !== 'string' || typeof c.at !== 'string') continue;
    const data = c.deleted ? null : JSON.stringify(c.data ?? null);
    if (data && data.length > MAX_DATA) continue;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO rows (household, tbl, id, data, deleted, changed_at, seq)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT COALESCE(MAX(seq), 0) + 1 FROM rows WHERE household = ?1))
         ON CONFLICT (household, tbl, id) DO UPDATE SET
           data = excluded.data, deleted = excluded.deleted, changed_at = excluded.changed_at, seq = excluded.seq
         WHERE excluded.changed_at > rows.changed_at`,
      ).bind(household, c.tbl, c.id, data, c.deleted ? 1 : 0, c.at),
    );
  }
  // D1 runs a batch as one transaction
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));

  const { results } = await env.DB.prepare(
    'SELECT tbl, id, data, deleted, changed_at, seq FROM rows WHERE household = ? AND seq > ? ORDER BY seq LIMIT ?',
  )
    .bind(household, since, PULL_LIMIT)
    .all();
  const out = [];
  let bytes = 0;
  for (const r of results) {
    bytes += r.data ? r.data.length : 0;
    if (out.length && bytes > PULL_BYTES) break;
    out.push({ tbl: r.tbl, id: r.id, at: r.changed_at, deleted: !!r.deleted, data: r.data ? JSON.parse(r.data) : null, seq: r.seq });
  }
  const cursor = out.length ? out[out.length - 1].seq : since;
  return json(req, { changes: out, cursor, more: out.length < results.length || results.length === PULL_LIMIT });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const { pathname } = new URL(req.url);
    try {
      if (req.method === 'POST' && pathname === '/households') return await createHousehold(req, env);
      if (req.method === 'POST' && pathname === '/sync') {
        const household = await authorize(req, env);
        if (!household) return json(req, { error: 'not allowed' }, 401);
        return await sync(req, env, household);
      }
      return json(req, { error: 'not found' }, 404);
    } catch (err) {
      console.error(err);
      return json(req, { error: 'server error' }, 500);
    }
  },
};
