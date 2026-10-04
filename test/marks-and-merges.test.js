'use strict';
/* v1.18.1 fixes that are easy to undo by accident:
   - Export/Import carry Sneak Preview "held" marks and Safe to Retire marks (cleanCycleMarks)
   - marking from an overlay uses the player's renames/merges (main.js overlay:markDroid/markLevel)
   - no page loads the old picture file any more (every slot is in card-icons-data.js)
   - Rebirth Requirements keeps its selection on screen, like Safe to Retire / Sneak Preview */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadShared } = require('./helpers/load-shared.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));

test('cleanCycleMarks keeps valid marks and drops everything else', () => {
  const s = loadShared();
  assert.deepStrictEqual(plain(s.cleanCycleMarks({ 2: { lo: 4, r6: 6 }, 3: { gonk: 0 } })), { 2: { lo: 4, r6: 6 }, 3: { gonk: 0 } });
  assert.deepStrictEqual(plain(s.cleanCycleMarks({
    0: { lo: 1 }, 6: { lo: 1 }, x: { lo: 1 },              // not a cycle 1-5
    1: { lo: -1, r6: 99, kx: 2.5, ig: '3', bb: null },     // not a rank
    4: 'nope', 5: [1, 2],                                   // not a per-droid object
    2: { r9: 1 },
  })), { 2: { r9: 1 } });
  assert.deepStrictEqual(plain(s.cleanCycleMarks({})), {});
});

test('cleanCycleMarks says "no field" (null) for a file from before v1.18.1, so the import keeps the current marks', () => {
  const s = loadShared();
  for (const v of [undefined, null, 'x', 5, [1]]) assert.strictEqual(s.cleanCycleMarks(v), null);
  const tracker = read('tracker.html');
  assert.match(tracker, /const held = cleanCycleMarks\(parsed\.heldMarks\), retired = cleanCycleMarks\(parsed\.retired\);/);
  assert.match(tracker, /if\(held\) await storeSet\('rebirth-heldMarks', held\);/);
  assert.match(tracker, /heldMarks: \(await storeGet\('rebirth-heldMarks'\)\) \|\| \{\}, retired: \(await storeGet\('rebirth-retired'\)\) \|\| \{\}/);
});

test("marking from an overlay applies the player's renames/merges first", () => {
  const main = read('main.js');
  for (const ch of ['overlay:markDroid', 'overlay:markLevel']) {
    const at = main.indexOf("ipcMain.handle('" + ch + "'");
    const body = main.slice(at, main.indexOf('\n  });', at));
    const set = body.indexOf("shared.setNameMerges(storeData['rebirth-nameMerges'])");
    assert.ok(set > 0, ch + ' must set the merges');
    assert.ok(set < body.indexOf('shared.canonicalName('), ch + ': merges are set before the name is resolved');
  }
});

test('no page loads the old picture file (icons-data.js), and the exe leaves it out', () => {
  for (const f of fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
    assert.ok(!/<script[^>]+src="icons-data\.js/.test(read(f)), f + ' still loads icons-data.js');
  }
  assert.match(read('package.json'), /"!icons-data\.js"/);
});

test('Rebirth Requirements scrolls its selection into view when it moves', () => {
  const src = read('rebirth-requirements-overlay.html');
  const at = src.indexOf('function moveRebirthSelection');
  assert.match(src.slice(at, src.indexOf('\n  }', at)), /scroller\.reveal\(/);
});
