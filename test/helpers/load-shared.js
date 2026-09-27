/* Loads droid-data.js + requirements.js into a fresh, isolated JS context
   exactly the way a renderer window does (two classic <script> tags, shared
   global scope), without Electron or a browser. Every test gets its own
   context, so a test that renames a droid or mutates ownedRank can't leak
   into the next one.

   Top-level `let`/`const` in a classic script live in the global *lexical*
   scope, which vm does not mirror onto the sandbox object — so read them
   with run('NAME') instead of ctx.NAME. Functions declared with `function`
   are also reachable via run('fnName'). */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

function loadShared(files = ['droid-data.js', 'requirements.js']) {
  const ctx = vm.createContext({ console });
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  const run = (code) => vm.runInContext(code, ctx, { filename: '<test>' });
  const api = {
    run,
    // data
    CYCLES: run('CYCLES'),
    RARITY_ORDER: run('RARITY_ORDER'),
    RNAME: run('RNAME'),
    RARITY_CLASS_ORDER: run('RARITY_CLASS_ORDER'),
    DROID_RARITY_CLASS: run('DROID_RARITY_CLASS'),
    rankOf: run('rankOf'),
    // requirements.js
    normKey: run('normKey'),
    canonicalName: run('canonicalName'),
    buildIndex: run('buildIndex'),
    cycleCeilings: run('cycleCeilings'),
    cycleLastNeededLevel: run('cycleLastNeededLevel'),
    getLevelRequirements: run('getLevelRequirements'),
    getUpcomingLevels: run('getUpcomingLevels'),
    getDroidRarityClass: run('getDroidRarityClass'),
    getDeclutterList: run('getDeclutterList'),
    nextCycleOf: run('nextCycleOf'),
    getSneakPreview: run('getSneakPreview'),
    cycleRealLevelCount: run('cycleRealLevelCount'),
    cycleRealSlotCount: run('cycleRealSlotCount'),
    cycleCoveredCount: run('cycleCoveredCount'),
    cycleDroidKeys: run('cycleDroidKeys'),
    removeCycleMarks: run('removeCycleMarks'),
    decideOwnedUpdate: run('decideOwnedUpdate'),
    isValidImportPayload: run('isValidImportPayload'),
    // live views of the mutable module state (re-read after buildIndex())
    get DROID_INDEX() { return run('DROID_INDEX'); },
    get nameMerges() { return run('nameMerges'); },
    get displayOverrides() { return run('displayOverrides'); },
  };
  return api;
}

module.exports = { loadShared, ROOT };
