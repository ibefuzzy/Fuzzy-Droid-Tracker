// v1.19.0 🌐 Live Friends: live-sync.js (main.js's rules) and requirements.js's live-code helpers.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const ls = require('../live-sync.js');
const { loadShared } = require('./helpers/load-shared');
const s = loadShared();

test('share IDs: 12 base62 chars, all different; secret keys: 43 base64url chars', () => {
  const ids = new Set();
  for(let i = 0; i < 2000; i++){
    const id = ls.makeShareId(crypto.randomBytes);
    assert.match(id, /^[A-Za-z0-9]{12}$/);
    ids.add(id);
  }
  assert.strictEqual(ids.size, 2000);
  const key = ls.makeSecretKey(crypto.randomBytes);
  assert.match(key, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(ls.isIdentity({ id: 'k7Qm2xZp9RaB', key }));
  assert.ok(!ls.isIdentity({ id: 'short', key }));
  assert.ok(!ls.isIdentity(null));
});

test('share IDs have no bias toward the first letters (bytes >= 248 are skipped)', () => {
  let n = 0;
  const bytes = () => Buffer.from(Array.from({ length: 16 }, () => n++ % 256));
  const id = ls.makeShareId(bytes);
  assert.strictEqual(id.length, 12);
  // a source of only 248..255 must never be used
  let calls = 0;
  const bad = () => { calls++; return calls > 3 ? crypto.randomBytes(16) : Buffer.alloc(16, 250); };
  assert.match(ls.makeShareId(bad), /^[A-Za-z0-9]{12}$/);
});

test('saves wait for marks to settle, keep 2 minutes apart, and respect a server retry time', () => {
  const now = 1e12;
  assert.strictEqual(ls.saveDelay(0, 0, now), ls.SAVE_SETTLE_MS);
  assert.strictEqual(ls.saveDelay(now - 30e3, 0, now), ls.SAVE_GAP_MS - 30e3);
  assert.strictEqual(ls.saveDelay(now - 10 * 60e3, 0, now), ls.SAVE_SETTLE_MS);
  assert.strictEqual(ls.saveDelay(0, now + 5 * 60e3, now), 5 * 60e3);
});

test('save outcomes: ok, too soon, busy, taken ID, offline, refused', () => {
  const now = 1e12;
  assert.deepStrictEqual(ls.saveOutcome(200, null, now), { state: 'ok' });
  assert.deepStrictEqual(ls.saveOutcome(429, '30', now), { state: 'saving', retryAt: now + 31e3 });
  assert.strictEqual(ls.saveOutcome(503, null, now).state, 'busy');
  assert.strictEqual(ls.saveOutcome(403, null, now).state, 'newId');
  assert.deepStrictEqual(ls.saveOutcome(0, null, now), { state: 'offline', retryAt: now + ls.RETRY_OFFLINE_MS });
  assert.strictEqual(ls.saveOutcome(500, null, now).state, 'offline');
  assert.strictEqual(ls.saveOutcome(400, null, now).state, 'error');
});

const CODE = s.encodeFriendCode({ name: 'Kaz', cycle: 3, level: 21, owned: {}, time: Date.UTC(2026, 9, 4) });
const A = 'k7Qm2xZp9RaB', B = 'Zz9yX8wV7uT6';

test('server answers are checked: only asked IDs, only code-shaped codes, size-capped', () => {
  const text = JSON.stringify({ friends: { [A]: { code: CODE, updatedAt: 5 }, [B]: { code: '<img onerror=x>', updatedAt: 5 }, other: { code: CODE, updatedAt: 5 } } });
  assert.deepStrictEqual(ls.parseFriendsResponse(text, [A, B]), { [A]: { code: CODE, updatedAt: 5 } });
  assert.strictEqual(ls.parseFriendsResponse('not json', [A]), null);
  assert.strictEqual(ls.parseFriendsResponse('x'.repeat(ls.MAX_RESPONSE_BYTES + 1), [A]), null);
  assert.deepStrictEqual(ls.parseFriendsResponse(JSON.stringify({ friends: { __proto__: { code: CODE, updatedAt: 1 } } }), ['__proto__']), {});
});

test('merging a fetch: found -> ok, missing -> gone (keeps the last code), added meanwhile -> untouched', () => {
  const list = [{ id: A, code: null, updatedAt: null, state: 'new' }, { id: B, code: CODE, updatedAt: 1, state: 'ok' }, { id: 'Cc1Cc1Cc1Cc1', code: null, updatedAt: null, state: 'new' }];
  const r = ls.mergeFetched(list, { [A]: { code: CODE, updatedAt: 9 } }, [A, B]);
  assert.ok(r.changed);
  assert.deepStrictEqual(r.list[0], { id: A, code: CODE, updatedAt: 9, state: 'ok' });
  assert.deepStrictEqual(r.list[1], { id: B, code: CODE, updatedAt: 1, state: 'gone' });
  assert.deepStrictEqual(r.list[2], list[2]);
  assert.ok(!ls.mergeFetched(r.list, { [A]: { code: CODE, updatedAt: 9 } }, [A, B]).changed);
});

test('parseLiveCode reads live codes and live links, nothing else', () => {
  assert.strictEqual(s.parseLiveCode('FDTL1.' + A), A);
  assert.strictEqual(s.parseLiveCode('  FDTL1.' + A + '\n'), A);
  assert.strictEqual(s.parseLiveCode('https://ibefuzzy.github.io/tracker/#live=' + A), A);
  assert.strictEqual(s.parseLiveCode(CODE), null);
  assert.strictEqual(s.parseLiveCode('FDTL1.short'), null);
  assert.strictEqual(s.parseLiveCode('FDTL1.' + A + '"><b>'), null);
  assert.strictEqual(s.parseLiveCode(null), null);
});

test('cleanLiveFriends keeps valid entries once, drops junk, caps at 30', () => {
  const out = s.cleanLiveFriends([{ id: A, code: CODE, updatedAt: 3, state: 'ok' }, { id: A }, { id: 'bad' }, null,
    { id: B, code: '<script>', updatedAt: 'x', state: 'weird' }]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out)), [{ id: A, code: CODE, updatedAt: 3, state: 'ok' }, { id: B, code: null, updatedAt: null, state: 'new' }]);
  const many = Array.from({ length: 40 }, (_, i) => ({ id: 'abcdefghij' + String(i).padStart(2, '0') }));
  assert.strictEqual(s.cleanLiveFriends(many).length, 30);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.cleanLiveFriends('nope'))), []);
});

test('main.js: Live is off by default, and no window can read or write the secret key', () => {
  const fs = require('node:fs'), path = require('node:path');
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /\n\s*liveFriends: false,/);
  assert.match(main, /ipcMain\.handle\('store:get', \(evt, key\)=> \(key !== LIVE_IDENTITY && /);
  assert.match(main, /ipcMain\.handle\('store:set', \(evt, key, value\)=>\{\s*if\(key === LIVE_IDENTITY\) return false;/);
  // the key goes only into the Authorization header (PUT, DELETE) and back into the store
  assert.strictEqual((main.match(/idn\.key/g) || []).length, 3);
  assert.match(main, /headers\.Authorization = 'Bearer ' \+ opts\.key/);
});

test('readCapped reads small answers and refuses oversized ones without buffering them', async () => {
  assert.strictEqual(await ls.readCapped(new Response('{"friends":{}}'), 100), '{"friends":{}}');
  assert.strictEqual(await ls.readCapped(new Response('x'.repeat(101)), 100), '');
  let pulled = 0;
  const endless = new ReadableStream({ pull(c){ pulled++; c.enqueue(new Uint8Array(4096)); } });
  assert.strictEqual(await ls.readCapped(new Response(endless), ls.MAX_RESPONSE_BYTES), '');
  assert.ok(pulled < 10, 'stopped reading soon after the cap');
  assert.strictEqual(await ls.readCapped(new Response('ünïcode ✓'), 100), 'ünïcode ✓');
});

test('main.js never follows a redirect or sends cookies to the Friends server', () => {
  const fs = require('node:fs'), path = require('node:path');
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const call = main.slice(main.indexOf('net.fetch(liveSync.LIVE_SERVER'), main.indexOf('net.fetch(liveSync.LIVE_SERVER') + 300);
  assert.match(call, /redirect: 'error'/);
  assert.match(call, /credentials: 'omit'/);
  assert.match(main, /liveSync\.readCapped\(res, liveSync\.MAX_RESPONSE_BYTES\)/);
});

test('friends are checked every 90 s, and every 5 min once 4 checks in a row changed nothing', () => {
  assert.strictEqual(ls.pollDelay(0), 90e3);
  assert.strictEqual(ls.pollDelay(3), 90e3);
  assert.strictEqual(ls.pollDelay(4), 5 * 60e3);
  assert.strictEqual(ls.pollDelay(400), 5 * 60e3);
  const fs = require('node:fs'), path = require('node:path');
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.doesNotMatch(main, /setInterval\(liveFetchFriends/, 'polling reschedules itself (no fixed interval)');
  assert.match(main, /livePollSoon\(liveSync\.pollDelay\(live\.unchanged\)\)/);
});
