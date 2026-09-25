/* ---------------------------------------------------------------------------
   The ONE copy of the requirement logic, loaded by every window: tracker.html
   and all the overlays. Until v1.7.5 tracker.html kept its own private
   copies of normKey / canonicalName / buildIndex / cycleCeilings /
   cycleLastNeededLevel; they were proven byte-for-byte equivalent across all
   5 cycles (with and without renames) and then deleted, because drift
   between copies caused the v1.7.2 / v1.7.3 / v1.7.4 bugs.

   Change behavior here, then run `npm test`. test/pages.test.js fails if any
   page redefines one of these functions or redeclares one of these globals.

   Depends on droid-data.js being loaded first (CYCLES, RARITY_ORDER, RNAME,
   RCLASS, rankOf, DROID_RARITY_CLASS, RARITY_CLASS_ORDER).
--------------------------------------------------------------------------- */

/* ---------------- NAME NORMALIZATION / MERGES ---------------- */
function normKey(name){
  return name.toLowerCase().replace(/[^a-z0-9]/g,'');
}
let nameMerges = {};        // rawName (as it appears in CYCLES) -> canonical display name
let displayOverrides = {};  // normKey -> preferred display name
function canonicalName(rawName){
  return nameMerges[rawName] || rawName;
}

/* ---------------- BUILD DROID INDEX FROM CYCLES ---------------- */
let DROID_INDEX = {};  // normKey -> {display, entries:[...], ceilingRank}
let RAW_GROUPS = {};

function buildIndex(){
  const groups = {};
  for(let c=1;c<=5;c++){
    for(let l=1;l<=35;l++){
      const row = CYCLES[c][l-1];
      row.forEach((d,i)=>{
        const code = d[0], rawName = d[1];
        const canon = canonicalName(rawName);
        const nk = normKey(canon);
        if(!groups[nk]) groups[nk] = { names:{}, entries:[] };
        groups[nk].names[canon] = (groups[nk].names[canon]||0)+1;
        groups[nk].entries.push({cycle:c, level:l, slot:i, code:code, rank:rankOf(code)});
      });
    }
  }
  const idx = {};
  Object.keys(groups).forEach(nk=>{
    const g = groups[nk];
    let display = displayOverrides[nk];
    if(!display){
      display = Object.keys(g.names).sort((a,b)=>g.names[b]-g.names[a])[0];
    }
    let ceilingRank = 0;
    let minLevel = null, minLevelCycle = null;
    g.entries.forEach(e=>{
      if(e.rank > ceilingRank) ceilingRank = e.rank;
      if(minLevel === null || e.level < minLevel || (e.level === minLevel && e.cycle < minLevelCycle)){
        minLevel = e.level; minLevelCycle = e.cycle;
      }
    });
    idx[nk] = { display:display, entries:g.entries, ceilingRank:ceilingRank, minLevel:minLevel, minLevelCycle:minLevelCycle };
  });
  DROID_INDEX = idx;
  RAW_GROUPS = groups;
  // A rename/merge changes what canonicalName() returns for these raw
  // names, which getDroidRarityClass()'s own cache (below) is keyed by.
  // Invalidate it here so any caller that rebuilds the index after a
  // nameMerges change (tracker.html's handleRename, or a window reacting
  // to that store key changing) also gets a fresh rarity-class lookup,
  // instead of keeping stale post-rename entries for the rest of this
  // window's lifetime.
  RARITY_CLASS_BY_NK = null;
}

/* ---------------- PER-CYCLE REBIRTH CEILINGS ----------------
   For one cycle, the highest rarity each droid appears at, level 1-35. */
function cycleCeilings(cycle){
  const ceilings = {}; // nk -> {rank, cycle, level, slot, code}
  for(let l=1;l<=35;l++){
    const row = CYCLES[cycle][l-1];
    row.forEach((d,i)=>{
      const code = d[0];
      const nk = normKey(canonicalName(d[1]));
      const rank = rankOf(code);
      if(!ceilings[nk] || rank > ceilings[nk].rank){
        ceilings[nk] = { rank:rank, cycle:cycle, level:l, slot:i, code:code };
      }
    });
  }
  return ceilings;
}

/* ---------------- OVERLAY: LEVEL-BASED REQUIREMENTS ----------------
   Corrected model (2026-09-18): "rebirth N" is level N (1-35) of the active
   cycle, not a rarity tier. Each level has exactly 3 [rarityCode, name]
   slots in CYCLES — that IS "the droids required for that rebirth". A
   player's current progress is "currentLevel" = the last rebirth they've
   completed; the overlay's job is to show that level's requirements plus
   the next few, in the exact order they'll actually reach them — never
   grouped by rarity (that's what produced the wrong "level 25 item shown
   while still on level 3" bug this replaced). */

/* One level's 3 required droids, with display names resolved and each
   flagged `owned` if ownedRank already covers it (from elsewhere in the
   cycle/other cycles) — purely informational, doesn't change what's shown. */
function getLevelRequirements(cycle, level, ownedRank){
  if(level < 1 || level > 35) return null;
  const row = CYCLES[cycle][level-1];
  return row.map((d,i)=>{
    const code = d[0];
    const rank = rankOf(code);
    const nk = normKey(canonicalName(d[1]));
    const entry = DROID_INDEX[nk];
    const owned = ownedRank ? ownedRank[nk] : undefined;
    return {
      nk,
      display: entry ? entry.display : d[1],
      code,
      rank,
      owned: owned !== undefined && owned >= rank,
      ownedRankValue: owned, // raw rank the player has logged for this droid (any cycle), or undefined if never logged — lets the overlay show the actual owned tier's color, not just a done/not-done flag
      // cycle/level/slot identify this exact occurrence for icon lookups
      // (iconKey = cycle-level-slot into ICONS, same convention as every
      // other icon lookup in the app) — added 2026-09-20 for the redesigned
      // overlay.html, which now shows a droid portrait per chip instead of
      // a plain color dot.
      cycle,
      level,
      slot: i
    };
  });
}

/* currentLevel = last rebirth completed (0 if none yet). Returns up to
   `count` upcoming levels starting at currentLevel+1, i.e. "NOW" first. */
function getUpcomingLevels(cycle, currentLevel, ownedRank, count){
  const start = Math.max(0, currentLevel) + 1;
  const out = [];
  for(let level = start; level <= 35 && out.length < count; level++){
    out.push({ level, droids: getLevelRequirements(cycle, level, ownedRank) });
  }
  return out;
}

/* ---------------- DECLUTTER LIST: "safe to retire" droids ----------------
   For the active cycle, the LAST (highest-numbered) level that still
   requires a given droid, at ANY rarity. Once currentLevel has passed this
   number, that cycle's requirement table will never ask for this droid
   again for the rest of the cycle, so whatever copy of it you're holding is
   free to get rid of.

   Deliberately NOT the same thing as cycleCeilings' level: cycleCeilings
   records the FIRST level a droid hits its ceiling/max rarity, which can be
   several levels before its true final appearance if the same max rarity is
   asked for again later. Verified against the real CYCLES data this
   actually happens 13 times across the 5 cycles — e.g. cycle 1's Proto
   Roller first hits Galactic at level 28 but is asked for again (at Beskar)
   at level 31, so using cycleCeilings' level here would call it safe to
   retire 3 rebirths too early. This function instead tracks the latest
   level seen for each droid, independent of rarity. */
function cycleLastNeededLevel(cycle){
  const lastLevel = {}; // nk -> highest level number requiring this droid, any rarity
  for(let l=1;l<=35;l++){
    const row = CYCLES[cycle][l-1];
    row.forEach(d=>{
      const nk = normKey(canonicalName(d[1]));
      lastLevel[nk] = l; // levels visited in increasing order, so the last write is the true max
    });
  }
  return lastLevel;
}

/* Looks up the DROID_RARITY_CLASS table (droid-data.js) by normalized key,
   so either raw spelling CYCLES uses for the same droid resolves the same
   way. Every CYCLES droid has an entry as of v1.6.0; anything that somehow
   doesn't (see the fallback below) is treated as 'Default'. */
let RARITY_CLASS_BY_NK = null;
function getDroidRarityClass(nk){
  if(!RARITY_CLASS_BY_NK){
    RARITY_CLASS_BY_NK = {};
    Object.keys(DROID_RARITY_CLASS).forEach(rawName=>{
      // Resolved through canonicalName() (not the raw CYCLES spelling) so a
      // renamed/merged Legendary or Mythic droid is still found here under
      // its NEW name. getDeclutterList() below looks this table up by the
      // post-rename key (same as everywhere else in the app resolves
      // names) — without this, a renamed droid would miss here and get
      // silently dropped from the "Safe to Retire" list forever, even
      // though it still qualifies.
      RARITY_CLASS_BY_NK[normKey(canonicalName(rawName))] = DROID_RARITY_CLASS[rawName];
    });
  }
  // Every droid in CYCLES is classified as of 2026-09-24; 'Default' is only
  // a safety net for a renamed/unknown key so it still shows up somewhere.
  return RARITY_CLASS_BY_NK[nk] || 'Default';
}

/* Puts it all together: every droid in `cycle` that's (a) logged as owned
   at some rarity (nothing to retire if you never logged it), and (b)
   already past its last-needed level for this cycle — ANY rarity class as
   of 2026-09-24 (was Legendary/Mythic only); declutter.html filters by
   whichever tiers are toggled on. Returns [{nk, display, ownedCode,
   rarityClass, iconKey}], sorted highest tier first, then display name.
   iconKey reuses cycleCeilings' {cycle,level,slot} (any occurrence of a
   droid shows the same art — rarity is conveyed by color/badge, not
   different art per variant — exactly how the Rebirth Reqs panel already
   looks up icons). */
function getDeclutterList(cycle, currentLevel, ownedRank){
  const lastNeeded = cycleLastNeededLevel(cycle);
  const ceilings = cycleCeilings(cycle);
  const out = [];
  Object.keys(lastNeeded).forEach(nk=>{
    const rarityClass = getDroidRarityClass(nk);
    const owned = ownedRank ? ownedRank[nk] : undefined;
    if(owned === undefined || owned === null) return; // nothing logged, nothing to retire
    if(lastNeeded[nk] > currentLevel) return; // still needed later this cycle
    const entry = DROID_INDEX[nk];
    const ceilingInfo = ceilings[nk];
    const iconKey = ceilingInfo ? (ceilingInfo.cycle + '-' + ceilingInfo.level + '-' + ceilingInfo.slot) : null;
    out.push({
      nk,
      display: entry ? entry.display : nk,
      ownedCode: RARITY_ORDER[owned],
      rarityClass,
      iconKey
    });
  });
  out.sort((a,b)=>{
    const ta = RARITY_CLASS_ORDER.indexOf(a.rarityClass), tb = RARITY_CLASS_ORDER.indexOf(b.rarityClass);
    if(ta !== tb) return tb - ta; // Mythic first
    return a.display.localeCompare(b.display);
  });
  return out;
}

/* ---------------- Sneak Preview (v1.6.1) ----------------
   What the NEXT cycle will ask for, restricted to Mythic-class droids, each
   at the highest variety that cycle ever requires of it — so a player who
   just finished a cycle (and picked "Sneak Preview" in the cycle-complete
   prompt) can see what to start hunting before flipping over. Returns
   [{nk, display, rank, code, ownedCode, iconKey}] sorted highest required
   variety first, then name. `cycle` is the CURRENT cycle; 5 wraps to 1. */
function nextCycleOf(cycle){ return cycle >= 5 ? 1 : cycle + 1; }
function getSneakPreview(cycle, ownedRank){
  const next = nextCycleOf(cycle);
  const ceilings = cycleCeilings(next);
  const out = [];
  Object.keys(ceilings).forEach(nk=>{
    if(getDroidRarityClass(nk) !== 'Mythic') return;
    const info = ceilings[nk];
    const entry = DROID_INDEX[nk];
    const owned = ownedRank ? ownedRank[nk] : undefined;
    out.push({
      nk,
      display: entry ? entry.display : nk,
      rank: info.rank,
      code: RARITY_ORDER[info.rank],
      ownedCode: (owned === undefined || owned === null) ? null : RARITY_ORDER[owned],
      iconKey: info.cycle + '-' + info.level + '-' + info.slot
    });
  });
  out.sort((a,b)=> (b.rank - a.rank) || a.display.localeCompare(b.display));
  return { nextCycle: next, items: out };
}

/* ---------------- SABER COLORS (v1.9.0) ----------------
   The curated palette every in-game overlay picks its own color from, in
   ⚙ Overlay Settings → Colors. A curated set, not a full color wheel — every
   hex here is already used somewhere else in this app (a Settings tab's own
   saber color, or a rarity/tier color), so nothing here can be illegible
   against the dark background or clash with the rest of the UI. Each
   overlay reads its own settings key (color / declutterColor /
   rebirthReqColor / sneakColor) and applies { hex, rgb } to its own
   --accent / --sw-rgb CSS variables — see applySettings() in overlay.html,
   declutter.html, rebirth-requirements-overlay.html, sneak-preview.html. */
const SABER_COLORS = {
  blue:   { hex:'#4fb8ff', rgb:'79,184,255' },
  green:  { hex:'#5ef2a6', rgb:'94,242,166' },
  purple: { hex:'#b06cf2', rgb:'176,108,242' },
  red:    { hex:'#ff4d6d', rgb:'255,77,109' },
  yellow: { hex:'#ffd24a', rgb:'255,210,74' },
  orange: { hex:'#e08a3c', rgb:'224,138,60' }
};
const SABER_COLOR_ORDER = ['blue', 'green', 'purple', 'red', 'yellow', 'orange'];

/* ---------------- OWNERSHIP HELPERS (moved from tracker.html, 2026-09-25) ----------------
   These four were the last pieces of core tracking logic still living
   inline in tracker.html, untested. Pure functions — no DOM, no storage I/O
   — so tracker.html's own setOwned()/clearCycleMarks()/cycleCoveredCount()
   now just call these and handle the storeSet()/render()/toast side effects
   around them. Behavior is unchanged; see test/requirements.test.js. */

/* How many of a cycle's 105 slots (35 levels x 3) are covered by ownedRank
   (global, keyed by name) at that slot's required rarity or better. */
function cycleCoveredCount(cycle, ownedRank){
  let covered = 0;
  CYCLES[cycle].forEach(row=>{
    row.forEach(d=>{
      const nk = normKey(canonicalName(d[1]));
      const owned = ownedRank[nk];
      if(owned !== undefined && rankOf(d[0]) <= owned) covered++;
    });
  });
  return covered;
}

/* The set of normKeys that appear anywhere in a cycle's requirement table. */
function cycleDroidKeys(cycle){
  const keys = new Set();
  CYCLES[cycle].forEach(row=>{
    row.forEach(d=>{ keys.add(normKey(canonicalName(d[1]))); });
  });
  return keys;
}

/* A NEW ownedRank object with every key belonging to this cycle's table
   deleted — does not mutate the object passed in, so the caller decides
   when (and whether) to commit the result to the real ownedRank/storage. */
function removeCycleMarks(cycle, ownedRank){
  const next = Object.assign({}, ownedRank);
  cycleDroidKeys(cycle).forEach(nk=>{ delete next[nk]; });
  return next;
}

/* The three-way click semantics every "claim a rarity" control in the app
   shares (main grid, A-Z pips, Rebirth Reqs panel):
     - clicking your current best again undoes it            -> 'clear'
     - nothing logged yet, or a genuine upgrade                -> 'set'
     - anything lower than what's already on record            -> 'blocked'
       (never silently downgrades a real claim from a stray click — the
       caller is expected to point the player at right-click instead) */
function decideOwnedUpdate(currentRank, requestedRank){
  if(currentRank === requestedRank) return { action:'clear' };
  if(currentRank === undefined || requestedRank > currentRank) return { action:'set' };
  return { action:'blocked' };
}

/* What Export produces and Import accepts: an object with an ownedRank map
   of normKey -> integer rarity rank in [0, RARITY_ORDER.length). */
function isValidImportPayload(parsed){
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  if(!isObj(parsed) || !isObj(parsed.ownedRank)) return false;
  return !Object.values(parsed.ownedRank).some(r => !Number.isInteger(r) || r < 0 || r >= RARITY_ORDER.length);
}
