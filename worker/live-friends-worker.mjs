/* Fuzzy's Droid Tracker: live 👥 Friends server (v1.19.0).
   A Cloudflare Worker (free plan) with one D1 database bound as `DB`. The whole file is
   pasted into the Cloudflare dashboard; it needs no build step. Not part of the exe.

   What it stores, per player who switched 🌐 Live on: a random share ID, the SHA-256 of
   their secret key (the key itself never leaves their PC), their friend code (the same
   text they could paste in Discord) and two times. No IPs, no accounts, nothing else.
   (Cloudflare's own Workers Logs are switched off for this Worker in the dashboard.)

   API
     GET    /p?ids=ID1,ID2,...   -> {friends:{ID:{code, updatedAt}}}  (unknown/blank/expired IDs are left out)
     PUT    /p/ID   body = friend code, header Authorization: Bearer KEY
                                 -> {ok:true, updatedAt}. The first PUT for an ID registers sha256(KEY);
                                    later ones must send the same KEY (403 otherwise).
     DELETE /p/ID   header Authorization: Bearer KEY -> {ok:true} (🌐 Live switched off: the code is blanked)
   An ID stays RESERVED for its key (security review, 2026-10-05): switching off or 14 days
   without a save only blanks the code (code = ''), so nobody who knows a live code can take
   it over and show friends something else under it. Reservations unused for a year are freed.
   Limits: one save per ID per minute (429), at most MAX_NEW_PER_DAY new IDs a day for
   everyone (503), codes <= 200 chars that are well-formed friend codes. The first save of
   each UTC day does the day's tidy-up. CORS only for the website; the app calls from its
   main process (CORS is not the lock here: every write needs the key). */

const ALLOWED_ORIGINS = ['https://ibefuzzy.github.io', 'http://localhost:5178', 'http://localhost:5179'];
const ID_RE = /^[A-Za-z0-9]{12}$/;
const CODE_RE = /^FDTP1\.[A-Za-z0-9_-]{16,194}$/;
const MAX_BODY = 256;
const MAX_IDS_PER_GET = 30;
const MIN_WRITE_GAP_MS = 60 * 1000;
const EXPIRE_MS = 14 * 86400 * 1000;           // a code not saved for 14 days is blanked
const RESERVE_MS = 365 * 86400 * 1000;         // an ID not saved for a year is freed
const MAX_NEW_PER_DAY = 1000;

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, key_hash TEXT NOT NULL, code TEXT NOT NULL, updated INTEGER NOT NULL, created INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, n INTEGER NOT NULL)'
];
const schemaReady = new WeakSet();               // once per database per Worker instance
async function ensureSchema(db){
  if(schemaReady.has(db)) return;
  await db.batch(SCHEMA.map(sql => db.prepare(sql)));
  schemaReady.add(db);
}

/** A friend code's shape (no droid data here, so not its contents): version 1, checksum, cycle 1-5, name length. */
export function isWellFormedCode(code){
  if(typeof code !== 'string' || !CODE_RE.test(code)) return false;
  let b;
  try{ b = Uint8Array.from(atob(code.slice(6).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
  catch(e){ return false; }
  if(b.length < 12 || b[0] !== 1 || b[3] < 1 || b[3] > 5 || b[9] > 24 || 10 + b[9] >= b.length - 1) return false;
  let sum = 0;
  for(let i = 0; i < b.length - 1; i++) sum = (sum + b[i]) & 255;
  return sum === b[b.length - 1];
}

async function sha256Hex(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function sameHex(a, b){                          // constant time for equal lengths
  if(a.length !== b.length) return false;
  let diff = 0;
  for(let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function corsHeaders(request){
  const origin = request.headers.get('Origin');
  if(!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' };
}
function json(request, status, body, extra){
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...corsHeaders(request), ...(extra || {}) } });
}
const fail = (request, status, error, extra) => json(request, status, { error }, extra);

function bearerKey(request){
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') || '');
  return m ? m[1] : null;
}

async function readCode(request){
  const len = Number(request.headers.get('Content-Length'));
  if(!(len > 0 && len <= MAX_BODY)) return null;   // no length, or too big: never read it
  const text = (await request.text()).trim();
  return text.length <= MAX_BODY && isWellFormedCode(text) ? text : null;
}

async function getFriends(request, env, url, now){
  const ids = [...new Set((url.searchParams.get('ids') || '').split(','))].filter(id => ID_RE.test(id));
  if(!ids.length || ids.length > MAX_IDS_PER_GET) return fail(request, 400, 'ids');
  const { results } = await env.DB.prepare('SELECT id, code, updated FROM players WHERE id IN (' + ids.map(() => '?').join(',') + ") AND code != '' AND updated >= ?")
    .bind(...ids, now - EXPIRE_MS).all();
  const friends = {};
  (results || []).forEach(r => { friends[r.id] = { code: r.code, updatedAt: r.updated }; });
  return json(request, 200, { friends });
}

// Once per UTC day (the first save of the day, whoever's): blank codes not saved for 14 days,
// free IDs not saved for a year, forget old day counters. GET already hides expired codes,
// so this is only about not KEEPING them.
const tidiedOn = new WeakMap();                  // database -> the day this Worker instance checked
async function tidyOncePerDay(env, ctx, now){
  const day = new Date(now).toISOString().slice(0, 10);
  if(tidiedOn.get(env.DB) === day) return;
  tidiedOn.set(env.DB, day);
  const first = await env.DB.prepare('INSERT INTO daily (day, n) VALUES (?, 0) ON CONFLICT(day) DO NOTHING').bind(day).run();
  if(!first.meta || first.meta.changes !== 1) return; // another instance did today's already
  const tidy = env.DB.batch([
    env.DB.prepare("UPDATE players SET code = '' WHERE code != '' AND updated < ?").bind(now - EXPIRE_MS),
    env.DB.prepare('DELETE FROM players WHERE updated < ?').bind(now - RESERVE_MS),
    env.DB.prepare('DELETE FROM daily WHERE day < ?').bind(new Date(now - 7 * 86400 * 1000).toISOString().slice(0, 10))
  ]).catch(() => {});                            // tomorrow's tidy catches up
  if(ctx && ctx.waitUntil) ctx.waitUntil(tidy); else await tidy;
}

async function putCode(request, env, ctx, id, now){
  const key = bearerKey(request);
  if(!key) return fail(request, 401, 'key');
  const code = await readCode(request);
  if(!code) return fail(request, 400, 'code');
  const keyHash = await sha256Hex(key);
  await tidyOncePerDay(env, ctx, now);
  const row = await env.DB.prepare('SELECT key_hash, updated FROM players WHERE id = ?').bind(id).first();
  if(row && row.updated >= now - RESERVE_MS){
    // a reserved ID (sharing, switched off, or blanked after 14 days): only its key may save, once a minute
    if(!sameHex(row.key_hash, keyHash)) return fail(request, 403, 'not yours');
    const wait = row.updated + MIN_WRITE_GAP_MS - now;
    if(wait > 0) return fail(request, 429, 'too soon', { 'Retry-After': String(Math.ceil(wait / 1000)) });
    const res = await env.DB.prepare('UPDATE players SET code = ?, updated = ? WHERE id = ? AND key_hash = ?').bind(code, now, id, keyHash).run();
    if(!res.meta || res.meta.changes !== 1) return fail(request, 409, 'retry');
    return json(request, 200, { ok: true, updatedAt: now });
  }
  // a new ID (or one unused for a year, which anyone may take again): count it against today's cap
  const day = new Date(now).toISOString().slice(0, 10);
  const counted = await env.DB.prepare('INSERT INTO daily (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1 WHERE n < ? RETURNING n')
    .bind(day, MAX_NEW_PER_DAY).first();
  if(!counted) return fail(request, 503, 'busy today', { 'Retry-After': '3600' });
  const ins = await env.DB.prepare('INSERT INTO players (id, key_hash, code, updated, created) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET key_hash = excluded.key_hash, code = excluded.code, updated = excluded.updated, created = excluded.created WHERE players.updated < ?')
    .bind(id, keyHash, code, now, now, now - RESERVE_MS).run();
  if(!ins.meta || ins.meta.changes !== 1) return fail(request, 403, 'not yours');  // someone registered it a moment ago
  return json(request, 200, { ok: true, updatedAt: now });
}

// 🌐 Live switched off: blank the code but keep the ID reserved for its key (see the top)
async function deleteCode(request, env, id){
  const key = bearerKey(request);
  if(!key) return fail(request, 401, 'key');
  const keyHash = await sha256Hex(key);
  const row = await env.DB.prepare('SELECT key_hash FROM players WHERE id = ?').bind(id).first();
  if(!row) return json(request, 200, { ok: true });
  if(!sameHex(row.key_hash, keyHash)) return fail(request, 403, 'not yours');
  await env.DB.prepare("UPDATE players SET code = '' WHERE id = ? AND key_hash = ? AND code != ''").bind(id, keyHash).run();
  return json(request, 200, { ok: true });
}

export default {
  async fetch(request, env, ctx){
    try{
      if(request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
      const url = new URL(request.url);
      if(url.pathname === '/' && request.method === 'GET') return json(request, 200, { ok: true, service: "Fuzzy's Droid Tracker live friends" });
      if(!env || !env.DB) return fail(request, 500, 'no database');
      await ensureSchema(env.DB);
      const now = Date.now();
      if(url.pathname === '/p' && request.method === 'GET') return await getFriends(request, env, url, now);
      const m = /^\/p\/([A-Za-z0-9]{12})$/.exec(url.pathname);
      if(m && request.method === 'PUT') return await putCode(request, env, ctx, m[1], now);
      if(m && request.method === 'DELETE') return await deleteCode(request, env, m[1]);
      return fail(request, 404, 'not found');
    }catch(e){
      return fail(request, 500, 'server error');
    }
  }
};
