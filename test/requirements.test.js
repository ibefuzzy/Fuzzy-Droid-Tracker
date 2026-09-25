/* Regression tests for the shared requirement logic (requirements.js) run
   against the real game data (droid-data.js). No Electron, no DOM.
   Run with: npm test */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadShared } = require('./helpers/load-shared');

// Values built inside the vm context have that context's Array/Object
// prototypes, which strict deep-equality treats as different. Round-trip
// through JSON before comparing structures.
const plain = (x) => JSON.parse(JSON.stringify(x));

function fresh() {
  const s = loadShared();
  s.buildIndex();
  return s;
}

function occurrences(s, cycle) {
  const out = [];
  s.CYCLES[cycle].forEach((row, i) => {
    row.forEach(([code, name], slot) => {
      out.push({ level: i + 1, slot, code, rank: s.rankOf(code), nk: s.normKey(s.canonicalName(name)) });
    });
  });
  return out;
}

/* ---------------- data shape ---------------- */

test('every cycle has 35 levels of exactly 3 valid [rarity, name] slots', () => {
  const s = fresh();
  for (let c = 1; c <= 5; c++) {
    assert.equal(s.CYCLES[c].length, 35, `cycle ${c} level count`);
    s.CYCLES[c].forEach((row, i) => {
      assert.equal(row.length, 3, `cycle ${c} level ${i + 1} slot count`);
      for (const [code, name] of row) {
        assert.ok(s.rankOf(code) >= 0, `unknown rarity "${code}" at cycle ${c} level ${i + 1}`);
        assert.ok(typeof name === 'string' && name.trim().length > 0, `empty name at cycle ${c} level ${i + 1}`);
      }
    });
  }
});

test('no level asks for the same droid twice', () => {
  const s = fresh();
  for (let c = 1; c <= 5; c++) {
    s.CYCLES[c].forEach((row, i) => {
      const nks = row.map(([, name]) => s.normKey(name));
      assert.equal(new Set(nks).size, 3, `cycle ${c} level ${i + 1} repeats a droid: ${nks.join(', ')}`);
    });
  }
});

test('all 62 droids have an explicit rarity class (11 Default / 14 Rare / 18 Epic / 8 Legendary / 11 Mythic)', () => {
  const s = fresh();
  const table = {};
  for (const raw of Object.keys(s.DROID_RARITY_CLASS)) table[s.normKey(raw)] = s.DROID_RARITY_CLASS[raw];
  const nks = Object.keys(s.DROID_INDEX);
  for (const nk of nks) {
    assert.ok(table[nk], `"${nk}" has no DROID_RARITY_CLASS entry and would silently fall back to Default`);
  }
  assert.equal(nks.length, 62);
  const counts = {};
  for (const nk of nks) counts[table[nk]] = (counts[table[nk]] || 0) + 1;
  assert.deepEqual(counts, { Default: 11, Rare: 14, Epic: 18, Legendary: 8, Mythic: 11 });
});

/* ---------------- ceilings vs last-needed level ---------------- */

test('cycleCeilings records the FIRST level a droid hits its max rarity', () => {
  const s = fresh();
  const pr = s.cycleCeilings(1).protoroller;
  assert.equal(pr.code, 'X'); // Galactic
  assert.equal(pr.level, 28);
  assert.equal(pr.slot, 0);
});

test('cycleLastNeededLevel records the LAST level a droid is needed at any rarity', () => {
  const s = fresh();
  // Cycle 1 Proto Roller: Galactic at 28, then Beskar again at 31.
  // Selling it after 28 would leave level 31 unfillable.
  assert.equal(s.cycleLastNeededLevel(1).protoroller, 31);
});

test('13 of the 224 droid/cycle pairs are needed again after first hitting their ceiling', () => {
  // 43 + 44 + 45 + 43 + 49 droids across cycles 1-5. (README said 223 until
  // 2026-09-24; the data has always had 224.)
  const s = fresh();
  let pairs = 0, reappear = 0;
  for (let c = 1; c <= 5; c++) {
    const last = s.cycleLastNeededLevel(c);
    const ceil = s.cycleCeilings(c);
    for (const nk of Object.keys(last)) {
      pairs++;
      if (last[nk] > ceil[nk].level) reappear++;
    }
  }
  assert.equal(pairs, 224);
  assert.equal(reappear, 13);
});

test('SELL rule: each droid has exactly one last-needed occurrence per cycle, and nothing after it', () => {
  // The By Rebirth Level grid tags an occurrence SELL when
  // lastNeeded[nk] === occurrence.level. v1.7.4 fixed that under-reporting;
  // this pins the property it relies on.
  const s = fresh();
  let sellTags = 0;
  for (let c = 1; c <= 5; c++) {
    const last = s.cycleLastNeededLevel(c);
    const occ = occurrences(s, c);
    for (const nk of Object.keys(last)) {
      const mine = occ.filter((o) => o.nk === nk);
      assert.equal(mine.filter((o) => o.level === last[nk]).length, 1, `cycle ${c} ${nk}`);
      assert.ok(mine.every((o) => o.level <= last[nk]), `cycle ${c} ${nk} appears after its last-needed level`);
    }
    sellTags += occ.filter((o) => last[o.nk] === o.level).length;
  }
  assert.equal(sellTags, 224, 'one SELL tag per droid per cycle');
});

/* ---------------- level requirements ---------------- */

test('getLevelRequirements rejects out-of-range levels', () => {
  const s = fresh();
  assert.equal(s.getLevelRequirements(1, 0, {}), null);
  assert.equal(s.getLevelRequirements(1, 36, {}), null);
});

test('getLevelRequirements marks a slot owned when the owned rank is at or above the required rank', () => {
  const s = fresh();
  // Cycle 1 level 3 needs Gold R9 in slot 2. Gold is rank 1.
  const need = (owned) => s.getLevelRequirements(1, 3, owned)[2];
  assert.equal(need({}).nk, 'r9');
  assert.equal(need({}).owned, false);
  assert.equal(need({}).ownedRankValue, undefined);
  assert.equal(need({ r9: 0 }).owned, false); // Base doesn't cover Gold
  assert.equal(need({ r9: 1 }).owned, true); // exact match
  assert.equal(need({ r9: 6 }).owned, true); // Stellar covers everything below
  assert.equal(need({ r9: 6 }).ownedRankValue, 6);
});

test('getUpcomingLevels returns NOW plus the next levels, clamped to the cycle', () => {
  const s = fresh();
  const levels = (cur) => s.getUpcomingLevels(1, cur, {}, 4).map((b) => b.level);
  assert.deepEqual(plain(levels(0)), [1, 2, 3, 4]);
  assert.deepEqual(plain(levels(-3)), [1, 2, 3, 4]); // bad input never shows level 0 or below
  assert.deepEqual(plain(levels(10)), [11, 12, 13, 14]);
  assert.deepEqual(plain(levels(33)), [34, 35]);
  assert.deepEqual(plain(levels(35)), []); // cycle complete: nothing left to show
});

/* ---------------- Safe to Retire (declutter) ---------------- */

test('Safe to Retire never lists a droid that was never logged', () => {
  const s = fresh();
  assert.deepEqual(plain(s.getDeclutterList(1, 35, {})), []);
});

test('Safe to Retire waits for the last-needed level, not the ceiling level', () => {
  const s = fresh();
  const has = (lvl) => s.getDeclutterList(1, lvl, { protoroller: 5 }).some((d) => d.nk === 'protoroller');
  assert.equal(has(28), false);
  assert.equal(has(30), false);
  assert.equal(has(31), true);
  const pr = s.getDeclutterList(1, 31, { protoroller: 5 }).find((d) => d.nk === 'protoroller');
  assert.equal(pr.ownedCode, 'X');
  assert.equal(pr.rarityClass, 'Legendary');
  assert.equal(pr.iconKey, '1-28-0'); // icon comes from the ceiling occurrence
});

test('Safe to Retire is sorted highest tier first, then by name', () => {
  const s = fresh();
  const ownAll = {};
  for (const nk of Object.keys(s.cycleLastNeededLevel(1))) ownAll[nk] = 6;
  const list = s.getDeclutterList(1, 35, ownAll);
  assert.equal(list.length, Object.keys(ownAll).length);
  for (let i = 1; i < list.length; i++) {
    const a = s.RARITY_CLASS_ORDER.indexOf(list[i - 1].rarityClass);
    const b = s.RARITY_CLASS_ORDER.indexOf(list[i].rarityClass);
    assert.ok(a >= b, `tier order broken at ${list[i - 1].display} -> ${list[i].display}`);
    if (a === b) assert.ok(list[i - 1].display.localeCompare(list[i].display) <= 0, `name order broken at ${list[i].display}`);
  }
});

test('a renamed droid keeps its rarity class and stays on the Safe to Retire list', () => {
  const s = fresh();
  s.run("nameMerges['KX'] = 'KX Enforcer'");
  s.buildIndex();
  assert.equal(s.getDroidRarityClass('kxenforcer'), 'Mythic');
  const kx = s.getDeclutterList(1, 35, { kxenforcer: 6 }).find((d) => d.nk === 'kxenforcer');
  assert.ok(kx, 'renamed droid dropped off the list');
  assert.equal(kx.display, 'KX Enforcer');
  assert.equal(kx.rarityClass, 'Mythic');
});

test('spelling variants in the data resolve to one droid', () => {
  const s = fresh();
  assert.equal(s.normKey('Mecha-Droid'), s.normKey('Mecha Droid'));
  assert.equal(s.normKey('Mono Wlkr'), s.normKey('Mono-Wlkr'));
  assert.notEqual(s.normKey('RIC'), s.normKey('RIC-1200')); // genuinely different droids
});

/* ---------------- Sneak Preview ---------------- */

test('nextCycleOf wraps cycle 5 back to cycle 1', () => {
  const s = fresh();
  assert.deepEqual([1, 2, 3, 4, 5].map(s.nextCycleOf), [2, 3, 4, 5, 1]);
});

test('Sneak Preview shows only Mythic droids from the next cycle at that cycle\'s ceiling', () => {
  const s = fresh();
  for (let c = 1; c <= 5; c++) {
    const { nextCycle, items } = s.getSneakPreview(c, {});
    assert.equal(nextCycle, s.nextCycleOf(c));
    assert.ok(items.length > 0, `cycle ${c} preview is empty`);
    const ceil = s.cycleCeilings(nextCycle);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      assert.equal(s.getDroidRarityClass(it.nk), 'Mythic', `${it.nk} is not Mythic`);
      assert.equal(it.rank, ceil[it.nk].rank, `${it.nk} rank`);
      assert.equal(it.ownedCode, null);
      if (i > 0) {
        const prev = items[i - 1];
        assert.ok(prev.rank > it.rank || (prev.rank === it.rank && prev.display.localeCompare(it.display) <= 0), `order broken at ${it.display}`);
      }
    }
  }
});

test('Sneak Preview reports what you already own', () => {
  const s = fresh();
  const { items } = s.getSneakPreview(5, { motrak: 4 });
  const mt = items.find((d) => d.nk === 'motrak');
  assert.ok(mt, 'Mo-Trak should be in cycle 1');
  assert.equal(mt.ownedCode, 'K');
});
