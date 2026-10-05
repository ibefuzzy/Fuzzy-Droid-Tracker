// v1.19.0 security review: what a hacked or fake Friends server could send. Friend codes built
// byte by byte (past the encoder's own cleaning) with hostile names must decode harmless, and
// hostile answers must never get past the app's checks.
const test = require('node:test');
const assert = require('node:assert');
const ls = require('../live-sync.js');
const { loadShared } = require('./helpers/load-shared');
const s = loadShared();

/** A well-formed friend code with any name bytes (up to 24) — what an attacker could publish. */
function rawCode(nameStr, cycle = 3, level = 21){
  const FP = s.run('FRIEND_FINGERPRINT'), N = s.run('FRIEND_DROIDS').length;
  const name = Buffer.from(nameStr, 'utf8');
  assert.ok(name.length <= 24, 'test name too long: ' + nameStr);
  const bytes = [1, FP >> 8, FP & 255, cycle, level, 0, 0, 0, 1, name.length, ...name];
  for(let i = 0; i < Math.ceil(N / 2); i++) bytes.push(0x12);
  bytes.push(bytes.reduce((a, b) => (a + b) & 255, 0));
  return 'FDTP1.' + Buffer.from(bytes).toString('base64url');
}

const HOSTILE = ['<img src=x onerror=a()>', '"><svg onload=alert(1)>', '&lt;b&gt;&amp;', 'a\u0000b\u001b[31mc\u007f', '</small><script>'];

test('hostile names in a well-formed code come out with no markup characters', () => {
  HOSTILE.forEach(n => {
    const f = s.decodeFriendCode(rawCode(n));
    assert.ok(!f.error, n + ': ' + f.error);
    assert.doesNotMatch(f.name, /[<>&"\u0000-\u001f]/, 'name kept a dangerous character: ' + JSON.stringify(f.name));
  });
});

test('a hostile server answer only ever yields asked-for IDs with code-shaped codes', () => {
  const A = 'k7Qm2xZp9RaB';
  const evil = JSON.stringify({ friends: {
    [A]: { code: rawCode('<img src=x onerror=a()>'), updatedAt: 1e308 },
    __proto__: { code: rawCode('x'), updatedAt: 1 },
    constructor: { code: rawCode('x'), updatedAt: 1 },
    ['<script>']: { code: '<script>alert(1)</script>', updatedAt: 1 } } });
  const out = ls.parseFriendsResponse(evil, [A]);
  assert.deepStrictEqual(Object.keys(out), [A]);
  assert.match(out[A].code, /^FDTP1\.[A-Za-z0-9_-]+$/);
  const shapes = ['<b>', '{"friends":[]}', '{"friends":null}', 'null', '[]', '{"friends":{"' + A + '":{"code":5,"updatedAt":"x"}}}'];
  shapes.forEach(t => { const r = ls.parseFriendsResponse(t, [A]); assert.ok(r === null || Object.keys(r).length === 0, t); });
  // what the stored list keeps from it is cleaned again before any page shows it
  const kept = s.cleanLiveFriends([{ id: A, code: out[A].code, updatedAt: out[A].updatedAt, state: 'ok' }, { id: '<b>x</b>xxxxxxx', code: null }]);
  assert.strictEqual(kept.length, 1);
});

test('the server cannot make the app hammer it: retry waits are clamped', () => {
  const now = 1e12;
  ['0', '1', '-5', 'abc', '', null, '0.001'].forEach(v => {
    const o = ls.saveOutcome(429, v, now);
    assert.ok(o.retryAt - now >= 30e3, 'Retry-After ' + JSON.stringify(v) + ' waited only ' + (o.retryAt - now) + ' ms');
  });
  assert.ok(ls.saveOutcome(429, '999999999', now).retryAt - now <= 3600e3, 'and never more than an hour');
  assert.ok(ls.saveOutcome(503, '1', now).retryAt - now >= 30e3);
});
