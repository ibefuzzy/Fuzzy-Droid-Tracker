/* ---------------------------------------------------------------------------
   Overlay-side copy of the tracker's requirement logic.

   Kept deliberately self-contained (rather than sharing tracker.html's inline
   <script> directly) so the proven, working tracker code is never touched.
   These functions are copied verbatim from tracker.html as of the Electron
   overlay build — normKey / canonicalName / buildIndex / cycleCeilings are
   byte-for-byte the same logic the main app uses for its Rebirth Requirements
   panel, so the overlay can never disagree with what the tracker itself shows.
   If those functions are ever changed in tracker.html, mirror the change here.

   Depends on droid-data.js being loaded first (CYCLES, RARITY_ORDER, RNAME,
   RCLASS, rankOf).
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
   Roller first hits Galactic at level 28 but is asked for again at Galactic
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
   way. Returns null for anything not in that table (Common/Rare/Epic —
   deliberately unclassified, see droid-data.js's comment). */
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
  return RARITY_CLASS_BY_NK[nk] || null;
}

/* Puts it all together: every droid in `cycle` that's (a) Legendary or
   Mythic rarity class, (b) logged as owned at some rarity (nothing to
   retire if you never logged it), and (c) already past its last-needed
   level for this cycle. Returns [{nk, display, ownedCode, rarityClass,
   iconKey}], sorted by display name for a stable on-screen order. iconKey
   reuses cycleCeilings' {cycle,level,slot} (any occurrence of a droid shows
   the same art — rarity is conveyed by color/badge, not different art per
   variant — exactly how the Rebirth Reqs panel already looks up icons). */
function getDeclutterList(cycle, currentLevel, ownedRank){
  const lastNeeded = cycleLastNeededLevel(cycle);
  const ceilings = cycleCeilings(cycle);
  const out = [];
  Object.keys(lastNeeded).forEach(nk=>{
    const rarityClass = getDroidRarityClass(nk);
    if(rarityClass !== 'Legendary' && rarityClass !== 'Mythic') return;
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
  out.sort((a,b)=> a.display.localeCompare(b.display));
  return out;
}
