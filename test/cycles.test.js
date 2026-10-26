'use strict';
/* Cycle 6 (v1.21.0, the 2026-10-10 Gonk weekend's "Path 6") and the cycle count.
   Until v1.21.0 the code said "5" in about fifteen places (wraps, range checks, the cycle
   pickers, friend codes, the Live Friends Worker). Now the count comes from droid-data.js
   through cycleTotal() / isCycleKey() in requirements.js. These tests keep it that way and pin
   Cycle 6's data to a second, independent source. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadShared } = require('./helpers/load-shared');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('CYCLES has cycles 1..cycleTotal() with no gaps, and cycleTotal() is 6', () => {
  const s = loadShared();
  assert.strictEqual(s.cycleTotal(), 6);
  assert.deepStrictEqual(Object.keys(s.CYCLES), ['1', '2', '3', '4', '5', '6']);
});

test('isCycleKey accepts the real cycles (numbers or store keys) and nothing else', () => {
  const s = loadShared();
  for (const c of [1, 2, 3, 4, 5, 6, '1', '6']) assert.ok(s.isCycleKey(c), `${c} should be a cycle`);
  for (const c of [0, 7, -1, 1.5, '06', ' 6', '6x', '', null, undefined, NaN, true, {}, []]) {
    assert.ok(!s.isCycleKey(c), `${JSON.stringify(c)} should not be a cycle`);
  }
});

test('next / previous cycle wrap at the last cycle, not at 5', () => {
  const s = loadShared();
  assert.strictEqual(s.nextCycleOf(5), 6);
  assert.strictEqual(s.nextCycleOf(6), 1);
  // tracker.html's own pair (Next / Previous cycle hotkeys, cycle-complete prompt)
  const html = read('tracker.html');
  assert.match(html, /function cycleAfter\(cycle\)\{ return \(cycle >= cycleTotal\(\)\) \? 1 : cycle \+ 1; \}/);
  assert.match(html, /function cycleBefore\(cycle\)\{ return \(cycle <= 1\) \? cycleTotal\(\) : cycle - 1; \}/);
});

test('every cycle picker in tracker.html lists exactly the cycles droid-data.js has', () => {
  const s = loadShared();
  const html = read('tracker.html');
  const want = Object.keys(s.CYCLES).map((c) => `${c}:Cycle ${c}`);
  for (const id of ['cycleSelect', 'reqCycleSelect', 'editorCycle']) {
    const m = new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
    assert.ok(m, `#${id} not found`);
    const got = [...m[1].matchAll(/<option value="(\d+)">([^<]*)<\/option>/g)].map((o) => `${o[1]}:${o[2]}`);
    assert.deepStrictEqual(got, want, `#${id}`);
  }
});

test('no "5 cycles" literal is left in the app code (frozen v1-migration lines excepted)', () => {
  const bad = [
    /\bcycle\s*[<>]=?\s*5\b/,      // cycle <= 5, cycle > 5, cycle >= 5
    /\bc\s*<=\s*5\s*;/,              // for(let c=1;c<=5;...
    /\[1-5\]/,                       // /^[1-5]$/
    /b\[3\]\s*>\s*5\b/,              // the Worker's cycle byte
  ];
  const files = ['requirements.js', 'main.js', 'tracker.html', 'overlay-controls.js', 'overlay.html',
    'declutter.html', 'rebirth-requirements-overlay.html', 'sneak-preview.html', 'rebirth-screen-read.js',
    'rebirth-level-detect.js', 'live-sync.js', 'worker/live-friends-worker.mjs'];
  const hits = [];
  for (const f of files) {
    read(f).split('\n').forEach((line, i) => {
      if (/frozen/.test(line)) return;
      if (bad.some((re) => re.test(line))) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepStrictEqual(hits, []);
});

/* Cycle 6 as tycoon-tools.com lists it (2026-10-25), in ITS slot order, which differs from
   DubTrackr's in some rows. droid-data.js follows DubTrackr's order (the same order the file
   has always used for cycles 1-5), so each level is compared as a set: same three droids, same
   tiers. tycoon-tools spells JO9-4MN with a zero ("J09-4MN"); that's folded below. */
const TYCOON_TOOLS_CYCLE_6 = [
  'B Gonk|B Mouse|B ID10', 'B Pit|B EG-58|B 2BB', 'B R3|B R4|B Roll-R', 'G EG-58|G R9|G B1 Security',
  'G Gonk|G R5|G Vect-Arm', 'D EG-58|D 2BB|B EGL', 'D R4|D R9|B KT', 'D B1 Security|D Nav-Ex|B MPH',
  'D Gonk|G EGL|G Strike-Orb', 'B Groundmech|B Trak-R|B Amp Walker', 'B B2 Super|B Haul-R|B R2',
  'R Gonk|G Groundmech|G Trak-R', 'G KT|G MPH|B Proto-Roller', 'D EGL|G B2 Super|B B2-RP',
  'D KT|D MPH|B J09-4MN', 'B PLNK|B BB9|G R7', 'R EGL|B Mecha-Droid|G J09-4MN', 'R KT|R MPH|G PLNK',
  'G Proto-Roller|D J09-4MN|D R7', 'R PLNK|R Mecha-Droid|R B2-RP', 'K Gonk|K EGL|K Haul-R',
  'K KT|K Groundmech|K R2', 'K MPH|K J09-4MN|K BB9', 'K PLNK|K Proto-Roller|B ECG', 'K R7|B IG|B Loadlifter',
  'G Mo-Trak|G ECG|D Drft-R', 'R Cyclens|R Snow Mouse|K Tri-Tek', 'X EGL|X J09-4MN|X BB9',
  'X KT|X PLNK|K IG', 'X MPH|X B2-RP|X Drft-R', 'K EG-58|S EGL|K Snow Mouse', 'X Trak-R|K Cyclens|X ECG',
  'S KT|X Cyclo-Grav|X Tri-Tek', 'S MPH|S Haul-R|X IG', 'S J09-4MN|S PLNK|S ECG', 'Y Gonk|Y EG-58|Y Roll-R',
  'Y EGL|Y R2|Y B2 Super', 'Y KT|Y MPH|Y Snow Mouse', 'Y J09-4MN|Y Cyclo-Grav|Y Tri-Tek', 'Y PLNK|Y ECG|Y Drft-R',
];

test('Cycle 6 matches a second source level by level (same droids and tiers)', () => {
  const s = loadShared();
  const key = (code, name) => code + ':' + s.normKey(name).replace(/^j0/, 'jo');
  assert.strictEqual(s.CYCLES[6].length, 40);
  s.CYCLES[6].forEach((row, i) => {
    const ours = Array.from(row, ([c, n]) => key(c, n)).sort();
    const theirs = TYCOON_TOOLS_CYCLE_6[i].split('|').map((x) => key(x[0], x.slice(2))).sort();
    assert.deepStrictEqual(ours, theirs, `Cycle 6 rebirth ${i + 1}`);
  });
});

test("Cycle 6's seven new droids are spelled one way and each has a class", () => {
  const s = loadShared();
  const NEW = { 'EG-58': 'Rare', EGL: 'Epic', KT: 'Epic', MPH: 'Epic', 'JO9-4MN': 'Legendary', PLNK: 'Legendary', ECG: 'Mythic' };
  const before = new Set();
  for (let c = 1; c <= 5; c++) s.CYCLES[c].forEach((row) => row.forEach(([, n]) => before.add(s.normKey(n))));
  const fresh = new Set();
  s.CYCLES[6].forEach((row) => row.forEach(([, n]) => { if (!before.has(s.normKey(n))) fresh.add(n); }));
  assert.deepStrictEqual([...fresh].sort(), Object.keys(NEW).sort());
  s.buildIndex();
  for (const [name, cls] of Object.entries(NEW)) assert.strictEqual(s.getDroidRarityClass(s.normKey(name)), cls, name);
  // every Cycle 6 droid has a class, so Safe to Retire and the tier filter cover them
  s.CYCLES[6].forEach((row) => row.forEach(([, n]) => assert.ok(s.getDroidRarityClass(s.normKey(n)), `${n} has no class`)));
});

test('a Cycle 6 friend code round-trips, and a cycle the data lacks is refused', () => {
  const s = loadShared();
  const owned = { kt: 3, ecg: 7, jo94mn: 2 };
  const code = s.encodeFriendCode({ name: 'Kaz', cycle: 6, level: 40, owned, time: Date.UTC(2026, 9, 25) });
  const back = s.decodeFriendCode(code);
  assert.strictEqual(back.cycle, 6);
  assert.strictEqual(back.level, 40);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(back.owned)), owned);
  // the same bytes with the cycle set to 7 (checksum fixed up) must not read
  const b = Uint8Array.from(atob(code.slice(6).replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
  b[3] = 7; b[b.length - 1] = b.slice(0, -1).reduce((x, y) => (x + y) & 255, 0);
  const bad = 'FDTP1.' + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.ok(s.decodeFriendCode(bad).error);
});

test('the Live Friends Worker accepts a Cycle 6 code', async () => {
  const s = loadShared();
  const { isWellFormedCode } = await import(pathToFileURL(path.join(ROOT, 'worker', 'live-friends-worker.mjs')).href);
  const code = s.encodeFriendCode({ name: 'Kaz', cycle: 6, level: 12, owned: {}, time: Date.UTC(2026, 9, 25) });
  assert.ok(isWellFormedCode(code));
});
