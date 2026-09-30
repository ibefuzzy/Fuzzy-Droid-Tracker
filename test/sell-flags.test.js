// v1.16.0 SELL flags (requirements.js sellFlagFor): the old Cycle 5 chart's colours.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadShared } = require('./helpers/load-shared');

function flagOf(s, cycle, name, level){
  const slot = s.CYCLES[cycle][level - 1].findIndex(d => d[1] === name);
  assert.notStrictEqual(slot, -1, name + ' is not at cycle ' + cycle + ' rebirth ' + level);
  return s.sellFlagFor(cycle, level, slot);
}

test('yellow SELL is exactly the old "last needed this cycle" rule, in every cycle', () => {
  const s = loadShared();
  s.buildIndex();
  for (let c = 1; c <= 5; c++) {
    const last = s.cycleLastNeededLevel(c);
    s.CYCLES[c].forEach((row, i) => row.forEach((d, slot) => {
      if (d[0] === '?') return;
      const f = s.sellFlagFor(c, i + 1, slot);
      const isLast = last[s.normKey(s.canonicalName(d[1]))] === i + 1;
      assert.strictEqual(!!(f && f.kind === 'yellow'), isLast, 'cycle ' + c + ' rebirth ' + (i + 1) + ' ' + d[1]);
    }));
  }
});

test('red / kyber: not needed again in this stretch, needed later at a higher rarity (Cycle 5 chart)', () => {
  const s = loadShared();
  s.buildIndex();
  assert.deepStrictEqual({ ...flagOf(s, 5, 'Gunrunner', 6) }, { kind: 'red', next: 22 });
  assert.deepStrictEqual({ ...flagOf(s, 5, 'B2-RP', 20) }, { kind: 'red', next: 23 });
  assert.deepStrictEqual({ ...flagOf(s, 5, 'R7', 20) }, { kind: 'red', next: 30 });
  assert.deepStrictEqual({ ...flagOf(s, 5, 'Amp Walker', 9) }, { kind: 'kyber', next: 31 });
  assert.deepStrictEqual({ ...flagOf(s, 5, 'Mouse', 1) }, { kind: 'kyber', next: 36 });
  assert.deepStrictEqual({ ...flagOf(s, 5, 'ID10', 1) }, { kind: 'yellow' });
});

test('no flag when it is needed again in the same stretch, or later at the same rarity', () => {
  const s = loadShared();
  s.buildIndex();
  assert.strictEqual(flagOf(s, 5, 'B2 Super', 13), null); // again at 15, same stretch (1-20)
  assert.strictEqual(flagOf(s, 5, 'R7', 30), null);       // Galactic at 30 and Galactic again at 33: keep it
});

test('flags follow name merges (the cache is rebuilt by buildIndex)', () => {
  const s = loadShared();
  s.buildIndex();
  const before = flagOf(s, 5, 'Gunrunner', 6);
  s.run('nameMerges["Gunrunner"] = "Gun Runner Merged"');
  s.buildIndex();
  assert.deepStrictEqual({ ...flagOf(s, 5, 'Gunrunner', 6) }, { ...before });
});
