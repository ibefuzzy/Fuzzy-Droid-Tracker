// v1.16.0 👥 Friends: friend codes (requirements.js encodeFriendCode / decodeFriendCode).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadShared } = require('./helpers/load-shared');

function ownedThrough(s, cycle, level){
  const owned = {};
  s.CYCLES[cycle].slice(0, level).forEach(row => row.forEach(([code, name]) => {
    if (code === '?') return;
    const nk = s.normKey(name);
    owned[nk] = Math.max(owned[nk] ?? -1, s.rankOf(code));
  }));
  return owned;
}
const plain = o => JSON.parse(JSON.stringify(o));

test('a code round-trips name, cycle, rebirth, time and every logged droid', () => {
  const s = loadShared();
  s.buildIndex();
  const mine = ownedThrough(s, 3, 21);
  const time = Date.UTC(2026, 8, 30, 12, 34);
  const code = s.encodeFriendCode({ name: 'Kaz 🛸', cycle: 3, level: 21, owned: s.friendOwnedFromMine(mine), time });
  assert.ok(code.startsWith('FDTP1.'));
  assert.ok(code.length < 100, 'short enough to paste: ' + code.length);
  const f = s.decodeFriendCode(code);
  assert.strictEqual(f.error, undefined);
  assert.strictEqual(f.name, 'Kaz 🛸');
  assert.strictEqual(f.cycle, 3);
  assert.strictEqual(f.level, 21);
  assert.strictEqual(f.time, time);
  assert.deepStrictEqual(plain(s.friendOwnedRank(f.owned)), plain(mine));
});

test('a pasted website link works like the code', () => {
  const s = loadShared();
  const code = s.encodeFriendCode({ name: 'Nova', cycle: 1, level: 9, owned: {}, time: Date.now() });
  const f = s.decodeFriendCode('look: https://ibefuzzy.github.io/tracker/#friend=' + code + '  ');
  assert.strictEqual(f.name, 'Nova');
  assert.strictEqual(f.level, 9);
});

test('bad, cut-off and other-version codes are refused with a reason, never read wrong', () => {
  const s = loadShared();
  const code = s.encodeFriendCode({ name: 'Rex', cycle: 5, level: 33, owned: { r2: 3 }, time: Date.now() });
  assert.ok(s.decodeFriendCode('hello').error);
  assert.ok(s.decodeFriendCode('FDT1.abc').error);
  assert.match(s.decodeFriendCode(code.slice(0, -3)).error, /cut off|isn't/);
  const flipped = code.slice(0, 12) + (code[12] === 'A' ? 'B' : 'A') + code.slice(13);
  assert.ok(s.decodeFriendCode(flipped).error);
  // another droid-data.js: same layout, different fingerprint (checksum fixed up)
  const b = Buffer.from(code.slice(6).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  b[1] ^= 0xff;
  b[b.length - 1] = [...b.subarray(0, -1)].reduce((a, x) => (a + x) & 255, 0);
  const other = 'FDTP1.' + b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = s.decodeFriendCode(other);
  assert.match(r.error, /different version/);
  assert.strictEqual(r.name, 'Rex');
});

test('names are cleaned and kept short', () => {
  const s = loadShared();
  const code = s.encodeFriendCode({ name: '<b>A very very long player name</b>', cycle: 2, level: 0, owned: {}, time: Date.now() });
  const f = s.decodeFriendCode(code);
  assert.ok(!/[<>]/.test(f.name));
  assert.ok(f.name.length <= 16);
});

test('each side reads the other through its own renames/merges', () => {
  const sender = loadShared();
  // the sender merged a raw name into another spelling and logged it under the merged key
  sender.run('nameMerges["Gunrunner"] = "Gun-Runner"');
  sender.buildIndex();
  const mine = { [sender.normKey('Gun-Runner')]: 5 };
  const code = sender.encodeFriendCode({ name: 'S', cycle: 5, level: 6, owned: sender.friendOwnedFromMine(mine), time: Date.now() });

  const receiver = loadShared();
  receiver.buildIndex();
  const f = receiver.decodeFriendCode(code);
  assert.strictEqual(receiver.friendOwnedRank(f.owned)[receiver.normKey('Gunrunner')], 5);
});
