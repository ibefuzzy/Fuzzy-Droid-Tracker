'use strict';
/* v1.18.1 "🎯 Next Droids Needed" (the HUD): nextNeededLevel() picks its top line. It starts at
   the line after the player's rebirth level, skips lines whose droids are all marked, and stops
   at the FIRST line still missing one. The user's rule: if rb25 is all marked but rb15 isn't,
   the list must stay on rb15, never jump to rb26. */
const test = require('node:test');
const assert = require('node:assert');
const { loadShared } = require('./helpers/load-shared.js');

function fresh() {
  const s = loadShared();
  s.buildIndex();
  return s;
}
// ownedRank that covers every droid of the given levels at exactly the rarity each line asks for
function marking(s, cycle, levels, owned = {}) {
  for (const l of levels) {
    for (const d of s.getLevelRequirements(cycle, l, owned)) {
      if (!(owned[d.nk] >= d.rank)) owned[d.nk] = d.rank;
    }
  }
  return owned;
}
const complete = (s, cycle, l, owned) => s.getLevelRequirements(cycle, l, owned).every((d) => d.owned);

test('nothing marked: the top line is the one after the rebirth level', () => {
  const s = fresh();
  assert.strictEqual(s.nextNeededLevel(1, 0, {}), 1);
  assert.strictEqual(s.nextNeededLevel(1, 10, {}), 11);
  assert.strictEqual(s.nextNeededLevel(1, -3, {}), 1); // bad input never goes below line 1
});

test('fully marked lines at the top are skipped, up to the first one still missing a droid', () => {
  const s = fresh();
  const owned = marking(s, 1, [1, 2, 3]);
  const first = s.nextNeededLevel(1, 0, owned);
  assert.ok(first >= 4, `lines 1-3 are done, got ${first}`);
  for (let l = 1; l < first; l++) assert.ok(complete(s, 1, l, owned), `skipped line ${l} must be fully marked`);
  assert.ok(!complete(s, 1, first, owned), `line ${first} must still be missing a droid`);
});

test("a finished later line never lets the list jump past an unfinished earlier one (rb25 done, rb15 not)", () => {
  const s = fresh();
  for (let c = 1; c <= 5; c++) {
    const owned = marking(s, c, [25]);
    assert.ok(complete(s, c, 25, owned));
    // marking rb25's droids can also cover a line before it, so the expected top is the first
    // unfinished line from 15 on; it has to be one of 15-24, never 26
    let expected = 15;
    while (complete(s, c, expected, owned)) expected++;
    assert.ok(expected < 25, `cycle ${c}: test setup, lines 15-24 can't all be covered by rb25's droids`);
    assert.strictEqual(s.nextNeededLevel(c, 14, owned), expected, `cycle ${c}`);
  }
});

test('lines below the rebirth level are never shown, even when unmarked', () => {
  const s = fresh();
  const owned = marking(s, 2, [21, 22]);
  const top = s.nextNeededLevel(2, 20, owned);
  assert.ok(top >= 23, `21-22 done, got ${top}`);
  assert.ok(top > 20);
});

test('a fully marked cycle stops on its last line; past the end it still wraps as before', () => {
  const s = fresh();
  const last = s.cycleRealLevelCount(3);
  const all = marking(s, 3, Array.from({ length: last }, (_, i) => i + 1));
  assert.strictEqual(s.nextNeededLevel(3, 0, all), last);
  assert.strictEqual(s.nextNeededLevel(3, last, {}), last + 1); // getUpcomingLevels then wraps to the next cycle
  const lines = s.getUpcomingLevels(3, s.nextNeededLevel(3, 0, all) - 1, all, 4);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(lines.map((b) => [b.cycle, b.level]))), [[3, last], [4, 1], [4, 2], [4, 3]]);
});
