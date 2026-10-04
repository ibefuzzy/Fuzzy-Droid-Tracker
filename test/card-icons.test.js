'use strict';
/* Droid pictures (v1.18.0). Every window draws a slot's picture as CARD_ICONS[key] || ICONS[key],
   keyed 'cycle-level-slot' (card-icons-data.js / icons-data.js). Until v1.18.0, LO had no
   CARD_ICONS picture at all (gonk.tools has no LO), so its 6 slots fell back to ICONS' old
   screenshot crops, and two of those were the NEIGHBOURING slot's droid: 2-34-1 (LO Stellar)
   showed RIC, 1-8-1 (LO Gold) showed Hov-R. These tests keep that from coming back:
   - every real slot has its own CARD_ICONS picture (nothing falls back to the old crops), and
   - CARD_ICONS holds one picture per droid + rarity, never shared between two droids.
   A missing slot is filled by `node build-missing-card-icons.js` (local-only: it needs the
   Droidex cards in droid-cards/). */
const test = require('node:test');
const assert = require('node:assert');
const { loadShared } = require('./helpers/load-shared.js');

const s = loadShared(['droid-data.js', 'requirements.js', 'card-icons-data.js', 'icons-data.js']);
const CYCLES = s.CYCLES;
const CARD_ICONS = s.run('CARD_ICONS');
const ICONS = s.run('ICONS');
const realLevels = (c) => s.run('cycleRealLevelCount')(c);

// every real (non-placeholder) slot: { key, code, name }
const SLOTS = [];
for (const c of Object.keys(CYCLES)) {
  for (let l = 1; l <= realLevels(c); l++) {
    CYCLES[c][l - 1].forEach(([code, name], slot) => SLOTS.push({ key: `${c}-${l}-${slot}`, code, name }));
  }
}

test('every real droid slot has its own picture (no fallback to the old screenshot crops)', () => {
  assert.ok(SLOTS.length >= 600, `only ${SLOTS.length} slots found`);
  const missing = SLOTS.filter((x) => !CARD_ICONS[x.key]).map((x) => `${x.key} ${x.code} ${x.name}`);
  assert.deepStrictEqual(missing, [], 'run node build-missing-card-icons.js for these slots');
});

test('every picture is a base64 WebP', () => {
  for (const [k, v] of Object.entries(CARD_ICONS)) assert.match(v, /^UklGR/, `CARD_ICONS ${k}`);
  for (const [k, v] of Object.entries(ICONS)) assert.match(v, /^UklGR/, `ICONS ${k}`);
});

test('one picture per droid + rarity: every slot of the same droid at the same rarity shows the same picture', () => {
  const seen = new Map();
  for (const x of SLOTS) {
    const id = `${x.name} ${x.code}`;
    if (!seen.has(id)) { seen.set(id, x); continue; }
    const first = seen.get(id);
    assert.ok(CARD_ICONS[x.key] === CARD_ICONS[first.key], `${id}: ${x.key} differs from ${first.key}`);
  }
});

test("a picture is never shared by two different droids (a neighbour's picture in the wrong slot)", () => {
  const owner = new Map();
  for (const x of SLOTS) {
    const pic = CARD_ICONS[x.key];
    if (!pic) continue;
    if (!owner.has(pic)) { owner.set(pic, x); continue; }
    const o = owner.get(pic);
    assert.strictEqual(o.name, x.name, `${x.key} (${x.name}) shows the same picture as ${o.key} (${o.name})`);
  }
});

test('the picture files have no slots that droid-data.js does not have', () => {
  const keys = new Set(SLOTS.map((x) => x.key));
  // placeholder levels ('?') may keep their keys for later; anything else is a stale slot
  const isPlaceholder = (k) => { const [c, l] = k.split('-').map(Number); return l > realLevels(c) && l <= (CYCLES[c] || []).length; };
  assert.deepStrictEqual(Object.keys(CARD_ICONS).filter((k) => !keys.has(k) && !isPlaceholder(k)), []);
  assert.deepStrictEqual(Object.keys(ICONS).filter((k) => !keys.has(k) && !isPlaceholder(k)), []);
});

test('the two slots that showed the wrong droid now show LO, the same picture in both files', () => {
  for (const k of ['1-8-1', '2-34-1']) {
    const [c, l, slot] = k.split('-').map(Number);
    assert.strictEqual(CYCLES[c][l - 1][slot][1], 'LO', `${k} is LO in droid-data.js`);
    assert.strictEqual(ICONS[k], CARD_ICONS[k], `${k}: icons-data.js still holds the old crop`);
  }
  assert.notStrictEqual(CARD_ICONS['2-34-1'], CARD_ICONS['2-34-2'], "2-34-1 must not be RIC's picture");
  assert.notStrictEqual(CARD_ICONS['1-8-1'], CARD_ICONS['1-8-2'], "1-8-1 must not be Hov-R's picture");
});
