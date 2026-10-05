// v1.19.0: the live 👥 Friends Worker (worker/live-friends-worker.mjs), run against a real
// SQLite database (node:sqlite) behind a small D1-shaped wrapper.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');
const { loadShared } = require('./helpers/load-shared');

/** The parts of the D1 API the Worker uses: prepare().bind().first()/all()/run(), batch(). */
function fakeD1(){
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, args) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; }
  });
  return {
    raw: db,
    prepare: sql => stmt(sql, []),
    batch: async list => { db.exec('BEGIN'); try{ const out = []; for(const s of list) out.push(await s.run()); db.exec('COMMIT'); return out; } catch(e){ db.exec('ROLLBACK'); throw e; } }
  };
}

let worker, isWellFormedCode;
const s = loadShared();
const CODE = s.encodeFriendCode({ name: 'Kaz', cycle: 3, level: 21, owned: {}, time: Date.UTC(2026, 9, 4) });
const CODE2 = s.encodeFriendCode({ name: 'Kaz', cycle: 3, level: 22, owned: {}, time: Date.UTC(2026, 9, 4, 1) });
const ID = 'k7Qm2xZp9RaB', ID2 = 'Zz9yX8wV7uT6';
const KEY = 'A'.repeat(43), KEY2 = 'B'.repeat(43);

test.before(async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'live-friends-worker.mjs')).href);
  worker = mod.default; isWellFormedCode = mod.isWellFormedCode;
});

function call(env, method, p, { key, body, origin, headers } = {}){
  const h = {};
  if(key) h.Authorization = 'Bearer ' + key;
  if(origin) h.Origin = origin;
  if(body !== undefined) h['Content-Length'] = String(Buffer.byteLength(body));
  Object.assign(h, headers || {});
  return worker.fetch(new Request('https://live.example.workers.dev' + p, { method, headers: h, body }), env, { waitUntil: () => {} });
}
const put = (env, id, key, body) => call(env, 'PUT', '/p/' + id, { key, body });
const get = async (env, ids) => (await (await call(env, 'GET', '/p?ids=' + ids.join(','))).json()).friends;
function withClock(fn){
  const real = Date.now;
  let t = Date.UTC(2026, 9, 5, 12);
  Date.now = () => t;
  const advance = ms => { t += ms; };
  return Promise.resolve(fn(advance)).finally(() => { Date.now = real; });
}

test('a real friend code is well-formed; junk, cut-off and oversize text is not', () => {
  assert.ok(isWellFormedCode(CODE));
  assert.ok(!isWellFormedCode(CODE.slice(0, -2)));
  assert.ok(!isWellFormedCode('FDTP1.' + 'A'.repeat(300)));
  assert.ok(!isWellFormedCode('<script>alert(1)</script>'));
  assert.ok(!isWellFormedCode(CODE.replace('FDTP1.', 'FDTP2.')));
});

test('first PUT registers, the owner can update, anyone can read, a stranger cannot overwrite', () => withClock(async advance => {
  const env = { DB: fakeD1() };
  assert.strictEqual((await put(env, ID, KEY, CODE)).status, 200);
  assert.deepStrictEqual(Object.keys(await get(env, [ID, ID2])), [ID]);
  assert.strictEqual((await get(env, [ID]))[ID].code, CODE);
  advance(61e3);
  assert.strictEqual((await put(env, ID, KEY2, CODE2)).status, 403);
  assert.strictEqual((await put(env, ID, KEY, CODE2)).status, 200);
  assert.strictEqual((await get(env, [ID]))[ID].code, CODE2);
  // the key itself is never stored
  const row = env.DB.raw.prepare('SELECT * FROM players').get();
  assert.ok(!JSON.stringify(row).includes(KEY));
}));

test('one save per ID per minute', () => withClock(async advance => {
  const env = { DB: fakeD1() };
  assert.strictEqual((await put(env, ID, KEY, CODE)).status, 200);
  advance(30e3);
  const r = await put(env, ID, KEY, CODE2);
  assert.strictEqual(r.status, 429);
  assert.strictEqual(r.headers.get('Retry-After'), '30');
  advance(31e3);
  assert.strictEqual((await put(env, ID, KEY, CODE2)).status, 200);
}));

test('bad requests are refused before touching the database', () => withClock(async () => {
  const env = { DB: fakeD1() };
  assert.strictEqual((await put(env, ID, null, CODE)).status, 401);
  assert.strictEqual((await put(env, ID, 'short', CODE)).status, 401);
  assert.strictEqual((await put(env, ID, KEY, 'not a code')).status, 400);
  assert.strictEqual((await put(env, ID, KEY, 'x'.repeat(300))).status, 400);
  assert.strictEqual((await call(env, 'PUT', '/p/' + ID, { key: KEY, body: CODE, headers: { 'Content-Length': '0' } })).status, 400);
  assert.strictEqual((await put(env, 'short', KEY, CODE)).status, 404);
  assert.strictEqual((await call(env, 'GET', '/p?ids=')).status, 400);
  const many = Array.from({ length: 31 }, (_, i) => 'a'.repeat(10) + String(i).padStart(2, '0'));
  assert.strictEqual((await call(env, 'GET', '/p?ids=' + many.join(','))).status, 400);
  assert.strictEqual((await call(env, 'POST', '/p/' + ID, { key: KEY, body: CODE })).status, 404);
  assert.strictEqual(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM players').get().n, 0);
}));

const code = env => env.DB.raw.prepare('SELECT code FROM players WHERE id = ?').get(ID);

test('DELETE needs the key, hides the code at once, and keeps the ID reserved for its owner', () => withClock(async advance => {
  const env = { DB: fakeD1() };
  await put(env, ID, KEY, CODE);
  assert.strictEqual((await call(env, 'DELETE', '/p/' + ID, { key: KEY2 })).status, 403);
  assert.ok((await get(env, [ID]))[ID]);
  assert.strictEqual((await call(env, 'DELETE', '/p/' + ID, { key: KEY })).status, 200);
  assert.deepStrictEqual(await get(env, [ID]), {});
  assert.strictEqual(code(env).code, '', 'the code itself is gone from the database');
  assert.strictEqual((await call(env, 'DELETE', '/p/' + ID, { key: KEY })).status, 200, 'switching off twice is fine');
  advance(61e3);
  // security review 2026-10-05: someone who knows the live code can't take it over after a switch-off
  assert.strictEqual((await put(env, ID, KEY2, CODE2)).status, 403);
  assert.strictEqual((await put(env, ID, KEY, CODE)).status, 200, 'switching Live back on keeps the same live code');
  assert.strictEqual((await get(env, [ID]))[ID].code, CODE);
}));

test('a code not saved for 14 days is hidden, then blanked by the daily tidy; the ID stays its owner\'s for a year', () => withClock(async advance => {
  const env = { DB: fakeD1() };
  await put(env, ID, KEY, CODE);
  advance(15 * 86400e3);
  assert.deepStrictEqual(await get(env, [ID]), {}, 'hidden even before any tidy');
  await put(env, ID2, KEY2, CODE);                 // the first save of a new day (anyone's) tidies up
  assert.strictEqual(code(env).code, '', 'the stale code is blanked, not kept');
  assert.strictEqual((await put(env, ID, KEY2, CODE2)).status, 403, 'a stranger still can\'t take it');
  assert.strictEqual((await put(env, ID, KEY, CODE)).status, 200, 'the owner comes back after two weeks');
  assert.strictEqual((await get(env, [ID]))[ID].code, CODE);
}));

test('the daily tidy also runs when nobody new signs up (a plain save starts it)', () => withClock(async advance => {
  const env = { DB: fakeD1() };
  await put(env, ID, KEY, CODE);
  await put(env, ID2, KEY2, CODE);
  advance(15 * 86400e3);
  await put(env, ID2, KEY2, CODE2);                // an existing player's save, no new ID
  assert.strictEqual(code(env).code, '');
}));

test('an ID unused for a year is freed and can be registered again', () => withClock(async advance => {
  const env = { DB: fakeD1() };
  await put(env, ID, KEY, CODE);
  advance(366 * 86400e3);
  assert.strictEqual((await put(env, ID, KEY2, CODE2)).status, 200);
  assert.strictEqual((await put(env, ID2, KEY2, CODE)).status, 200);
  advance(86400e3);
  await put(env, ID2, KEY2, CODE2);                // tomorrow's tidy
  assert.strictEqual(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM players').get().n, 2);
  advance(366 * 86400e3);
  await put(env, 'Yy8xW7vU6tS5', KEY, CODE);        // a year later: the tidy deletes both old reservations
  assert.strictEqual(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM players').get().n, 1);
}));

test('new IDs are capped per day for everyone; existing players keep saving', () => withClock(async advance => {
  const env = { DB: fakeD1() };
  await put(env, ID, KEY, CODE);
  env.DB.raw.prepare('UPDATE daily SET n = 1000').run();
  const r = await put(env, ID2, KEY2, CODE);
  assert.strictEqual(r.status, 503);
  advance(61e3);
  assert.strictEqual((await put(env, ID, KEY, CODE2)).status, 200, 'existing players are not blocked by the cap');
}));

test('rows written per request stay small (the free plan counts them)', () => withClock(async advance => {
  const env = { DB: fakeD1() };
  await put(env, ID, KEY, CODE);
  const before = env.DB.raw.prepare('SELECT total_changes() AS n').get().n;
  advance(61e3);
  await put(env, ID, KEY, CODE2);                  // an update: one row
  advance(61e3);
  await call(env, 'DELETE', '/p/' + ID, { key: KEY });   // switch off: one row
  await call(env, 'DELETE', '/p/' + ID, { key: KEY });   // again: nothing to write
  assert.strictEqual(env.DB.raw.prepare('SELECT total_changes() AS n').get().n - before, 2);
}));

test('CORS: only the website gets an Allow-Origin, preflight works', () => withClock(async () => {
  const env = { DB: fakeD1() };
  const ok = await call(env, 'OPTIONS', '/p/' + ID, { origin: 'https://ibefuzzy.github.io' });
  assert.strictEqual(ok.status, 204);
  assert.strictEqual(ok.headers.get('Access-Control-Allow-Origin'), 'https://ibefuzzy.github.io');
  const evil = await call(env, 'GET', '/p?ids=' + ID, { origin: 'https://evil.example' });
  assert.strictEqual(evil.headers.get('Access-Control-Allow-Origin'), null);
}));
