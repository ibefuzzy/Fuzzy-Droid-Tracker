// Nova Crystals per rebirth (REBIRTH_CRYSTALS in droid-data.js, v1.16.0, a player's request):
// exactly the community chart, which starts at "19->20" (= Rebirth 20) and ends at 35;
// 36-40 give 300 each (the user, not on the chart).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadShared } = require('./helpers/load-shared');

const CHART = { 20: 5, 21: 10, 22: 15, 23: 20, 24: 25, 25: 40, 26: 50, 27: 60, 28: 70, 29: 80,
  30: 120, 31: 140, 32: 160, 33: 180, 34: 200, 35: 300, 36: 300, 37: 300, 38: 300, 39: 300, 40: 300 };

test('every rebirth 20-40 gives exactly the known amount; 1-19 show nothing', () => {
  const s = loadShared();
  assert.equal(s.REBIRTH_CRYSTALS.length, 40);
  for (let level = 1; level <= 40; level++) {
    assert.strictEqual(s.rebirthCrystalsFor(1, level), CHART[level] ?? null, 'Rebirth ' + level);
    assert.strictEqual(s.rebirthCrystalsFor(5, level), CHART[level] ?? null, 'the same in cycle 5');
  }
});
