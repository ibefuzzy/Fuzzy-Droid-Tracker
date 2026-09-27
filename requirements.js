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
/** Reduce droid name to lowercase alphanumerics only (e.g., "Clone Force 99" -> "cloneforce99"). Used as internal key. */
function normKey(name){
  return name.toLowerCase().replace(/[^a-z0-9]/g,'');
}
let nameMerges = {};        // rawName (as it appears in CYCLES) -> canonical display name
let displayOverrides = {};  // normKey -> preferred display name
/** Resolve droid name through any active merges/renames. If rawName was merged, return the merged display name; otherwise return rawName unchanged. */
function canonicalName(rawName){
  return nameMerges[rawName] || rawName;
}

/* ---------------- BUILD DROID INDEX FROM CYCLES ---------------- */
let DROID_INDEX = {};  // normKey -> {display, entries:[...], ceilingRank}
let RAW_GROUPS = {};

/** Build the global DROID_INDEX from CYCLES. Called once at startup and whenever a name merge changes. Updates DROID_INDEX and invalidates the rarity-class cache. */
function buildIndex(){
  const groups = {};
  for(let c=1;c<=5;c++){
    const cycleLen = CYCLES[c] ? CYCLES[c].length : 0;
    for(let l=1;l<=cycleLen;l++){
      const row = CYCLES[c][l-1];
      row.forEach((d,i)=>{
        const code = d[0], rawName = d[1];
        // Skip placeholder droids (code = "?") — levels 36-40 pending update
        if(code === '?') return;
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
/** Per-cycle rarity ceiling: the FIRST level each droid hits its max rarity. Returns {nk -> {rank, cycle, level, slot, code}}. Use for icon lookups; do NOT use for "safe to retire" (see cycleLastNeededLevel). */
function cycleCeilings(cycle){
  const ceilings = {}; // nk -> {rank, cycle, level, slot, code}
  const cycleLen = CYCLES[cycle] ? CYCLES[cycle].length : 0;
  for(let l=1;l<=cycleLen;l++){
    const row = CYCLES[cycle][l-1];
    row.forEach((d,i)=>{
      // Skip placeholder droids (code = "?")
      if(d[0] === '?') return;
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
/** Get the 3 droids required for one specific rebirth level. Returns [{nk, display, code, rank, owned, ownedRankValue, cycle, level, slot}] or null if level is invalid. */
function getLevelRequirements(cycle, level, ownedRank){
  const cycleLen = cycleRealLevelCount(cycle);
  if(level < 1 || level > cycleLen) return null;
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
   `count` upcoming levels starting at currentLevel+1, i.e. "NOW" first. When
   the current cycle runs out (currentLevel 32+, since count is 4), wraps to
   the next cycle's levels 1+ instead of stopping short — so the "Upcoming RB
   Req's" HUD (overlay.html) is never empty at the end of a cycle, it shows
   what's coming in the next one, same idea as Sneak Preview. Each entry
   carries its own `cycle` (not just `level`) so a caller spanning the wrap
   can tell which levels belong to the next cycle without re-deriving it. */
/** Get next `count` rebirth levels starting after currentLevel. Wraps cycle 5→1. Returns [{cycle, level, droids: [...]}]. Each entry carries its own cycle for wrap detection. */
function getUpcomingLevels(cycle, currentLevel, ownedRank, count){
  const out = [];
  let workingCycle = cycle;
  let workingLevel = Math.max(0, currentLevel) + 1;

  while(out.length < count){
    const cycleLen = cycleRealLevelCount(workingCycle);
    if(workingLevel > cycleLen){
      workingCycle = nextCycleOf(workingCycle);
      workingLevel = 1;
    }
    out.push({ cycle: workingCycle, level: workingLevel, droids: getLevelRequirements(workingCycle, workingLevel, ownedRank) });
    workingLevel++;
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
/** Get the LAST (highest) level each droid is needed in a cycle. Returns {nk -> level}. Use this (not cycleCeilings) for "safe to retire" logic. */
function cycleLastNeededLevel(cycle){
  const lastLevel = {}; // nk -> highest level number requiring this droid, any rarity
  const cycleLen = CYCLES[cycle] ? CYCLES[cycle].length : 0;
  for(let l=1;l<=cycleLen;l++){
    const row = CYCLES[cycle][l-1];
    row.forEach(d=>{
      // Skip placeholder droids (code = "?")
      if(d[0] === '?') return;
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
/** Get the rarity class (Mythic/Legendary/etc.) for a droid by normKey. Caches result and is invalidated by buildIndex(). Returns string like 'Mythic' or 'Default' if unknown. */
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
/** Get all droids safe to retire/sell in this cycle (owned + already past last-needed level). Returns [{nk, display, ownedCode, rarityClass, iconKey}] sorted Mythic first, then name. */
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
/** Wrap cycle number: cycle 5 to 1, all others increment by 1. */
function nextCycleOf(cycle){ return cycle >= 5 ? 1 : cycle + 1; }
/** Get all Mythic droids in the next cycle at their ceiling rarity. Returns {nextCycle, items: [{nk, display, rank, code, ownedCode, iconKey}]} sorted highest-needed first. */
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

/* ---------------- BORDER SKINS (v1.10.0; 15 skins since v1.12.0) ----
   Every in-game overlay picks a border skin in ⚙ Overlay Settings →
   Appearance: a glowing outline, corner brackets (drawn by sw-texture.css off
   --sw-rgb) and an emblem badge (borderIconSvg() below) overlapping the top
   edge. All vector, so it scales cleanly to every overlay's own shape (wide
   HUD, narrow tall lists) with no distortion, unlike a fixed-aspect image.
   Each overlay reads its own settings key (border / declutterBorder /
   rebirthReqBorder / sneakBorder / critGuideBorder) and applies { hex, rgb }
   to its own --accent / --sw-rgb CSS variables, then fills its
   .border-badge with borderIconSvg(key) — see applySettings() in
   overlay.html, declutter.html, rebirth-requirements-overlay.html,
   sneak-preview.html, crit-guide-overlay.html.
   v1.12.0: the faction skins wear the real Star Wars insignia (BORDER_EMBLEMS)
   instead of hand-drawn stand-ins. Keys never change, so saved picks carry over. */
const BORDER_SKINS = {
  rebel:       { hex:'#ff3b3b', rgb:'255,59,59',   label:'Rebel',             sub:'red' },
  empire:      { hex:'#d8dee3', rgb:'216,222,227', label:'Empire',            sub:'silver' },
  jedi:        { hex:'#4fa8ff', rgb:'79,168,255',  label:'Jedi',              sub:'blue' },
  mando:       { hex:'#d4af6a', rgb:'212,175,106', label:'Mandalorian',       sub:'tan' },
  hunter:      { hex:'#e6483c', rgb:'230,72,60',   label:'Bounty Hunter',     sub:'crimson' },
  tatooine:    { hex:'#e08a3c', rgb:'224,138,60',  label:'Tatooine',          sub:'orange' },
  grogu:       { hex:'#5ef2a6', rgb:'94,242,166',  label:'Grogu',             sub:'green' },
  sith:        { hex:'#e0142c', rgb:'224,20,44',   label:'Sith',              sub:'blood red' },
  firstorder:  { hex:'#f2f4f7', rgb:'242,244,247', label:'First Order',       sub:'white' },
  republic:    { hex:'#d8403a', rgb:'216,64,58',   label:'Galactic Republic', sub:'red' },
  oldrepublic: { hex:'#e8c04a', rgb:'232,192,74',  label:'Old Republic',      sub:'gold' },
  senate:      { hex:'#9b8cff', rgb:'155,140,255', label:'Galactic Senate',   sub:'violet' },
  tradefed:    { hex:'#c9975a', rgb:'201,151,90',  label:'Trade Federation',  sub:'bronze' },
  deathstar:   { hex:'#8fa6ba', rgb:'143,166,186', label:'Death Star',        sub:'steel' },
  jedicrest:   { hex:'#4cd964', rgb:'76,217,100',  label:'Jedi Crest',        sub:'green' }
};
const BORDER_SKIN_ORDER = ['rebel', 'empire', 'jedi', 'mando', 'hunter', 'tatooine', 'grogu',
  'sith', 'firstorder', 'republic', 'oldrepublic', 'senate', 'tradefed', 'deathstar', 'jedicrest'];

/* The real insignia (v1.12.0), as SVG path data: Font Awesome Free brand/solid
   icons (CC BY 4.0, https://fontawesome.com/license/free — credited in README)
   and Material Design Icons' Death Star (Apache 2.0). The Star Wars insignia are
   Lucasfilm trademarks. Source: dev/emblems-data.js (node dev/fetch-emblems.js).
   vb = the icon's own viewBox; a skin without an entry is hand-drawn below. */
const BORDER_EMBLEMS = {
  rebel: { vb: "0 0 512 512", d: "M256.5 504C117.2 504 9 387.8 13.2 249.9C16 170.7 56.4 97.7 129.7 49.5c.3 0 1.9-.6 1.1.8c-5.8 5.5-111.3 129.8-14.1 226.4c49.8 49.5 90 2.5 90 2.5c38.5-50.1-.6-125.9-.6-125.9c-10-24.9-45.7-40.1-45.7-40.1l28.8-31.8c24.4 10.5 43.2 38.7 43.2 38.7c.8-29.6-21.9-61.4-21.9-61.4L255.1 8l44.3 50.1c-20.5 28.8-21.9 62.6-21.9 62.6c13.8-23 43.5-39.3 43.5-39.3l28.5 31.8c-27.4 8.9-45.4 39.9-45.4 39.9c-15.8 28.5-27.1 89.4.6 127.3c32.4 44.6 87.7-2.8 87.7-2.8c102.7-91.9-10.5-225-10.5-225c-6.1-5.5.8-2.8.8-2.8c50.1 36.5 114.6 84.4 116.2 204.8C500.9 400.2 399 504 256.5 504" },
  empire: { vb: "0 0 496 512", d: "M287.6 54.2c-10.8-2.2-22.1-3.3-33.5-3.6V32.4c78.1 2.2 146.1 44 184.6 106.6l-15.8 9.1c-6.1-9.7-12.7-18.8-20.2-27.1l-18 15.5c-26-29.6-61.4-50.7-101.9-58.4zM53.4 322.4l23-7.7c-6.4-18.3-10-38.2-10-58.7s3.3-40.4 9.7-58.7l-22.7-7.7c3.6-10.8 8.3-21.3 13.6-31l-15.8-9.1C34 181 24.1 217.5 24.1 256s10 75 27.1 106.6l15.8-9.1c-5.3-10-9.7-20.3-13.6-31.1M213.1 434c-40.4-8-75.8-29.1-101.9-58.7l-18 15.8c-7.5-8.6-14.4-17.7-20.2-27.4l-16 9.4c38.5 62.3 106.8 104.3 184.9 106.6v-18.3c-11.3-.3-22.7-1.7-33.5-3.6zM93.3 120.9l18 15.5c26-29.6 61.4-50.7 101.9-58.4l-4.7-23.8c10.8-2.2 22.1-3.3 33.5-3.6V32.4C163.9 34.6 95.9 76.4 57.4 139l15.8 9.1c6-9.7 12.6-18.9 20.1-27.2m309.4 270.2l-18-15.8c-26 29.6-61.4 50.7-101.9 58.7l4.7 23.8c-10.8 1.9-22.1 3.3-33.5 3.6v18.3c78.1-2.2 146.4-44.3 184.9-106.6l-16.1-9.4c-5.7 9.7-12.6 18.8-20.1 27.4M496 256c0 137-111 248-248 248S0 393 0 256S111 8 248 8s248 111 248 248m-12.2 0c0-130.1-105.7-235.8-235.8-235.8S12.2 125.9 12.2 256S117.9 491.8 248 491.8S483.8 386.1 483.8 256m-39-106.6l-15.8 9.1c5.3 9.7 10 20.2 13.6 31l-22.7 7.7c6.4 18.3 9.7 38.2 9.7 58.7s-3.6 40.4-10 58.7l23 7.7c-3.9 10.8-8.3 21-13.6 31l15.8 9.1C462 331 471.9 294.5 471.9 256s-9.9-75-27.1-106.6m-183 177.7c16.3-3.3 30.4-11.6 40.7-23.5l51.2 44.8c11.9-13.6 21.3-29.3 27.1-46.8l-64.2-22.1c2.5-7.5 3.9-15.2 3.9-23.5s-1.4-16.1-3.9-23.5l64.5-22.1c-6.1-17.4-15.5-33.2-27.4-46.8l-51.2 44.8c-10.2-11.9-24.4-20.5-40.7-23.8l13.3-66.4c-8.6-1.9-17.7-2.8-27.1-2.8s-18.5.8-27.1 2.8l13.3 66.4c-16.3 3.3-30.4 11.9-40.7 23.8l-51.2-44.8c-11.9 13.6-21.3 29.3-27.4 46.8l64.5 22.1c-2.5 7.5-3.9 15.2-3.9 23.5s1.4 16.1 3.9 23.5l-64.2 22.1c5.8 17.4 15.2 33.2 27.1 46.8l51.2-44.8c10.2 11.9 24.4 20.2 40.7 23.5l-13.3 66.7c8.6 1.7 17.7 2.8 27.1 2.8s18.5-1.1 27.1-2.8z" },
  jedi: { vb: "0 0 448 512", d: "M398.5 373.6c95.9-122.1 17.2-233.1 17.2-233.1c45.4 85.8-41.4 170.5-41.4 170.5c105-171.5-60.5-271.5-60.5-271.5c96.9 72.7-10.1 190.7-10.1 190.7c85.8 158.4-68.6 230.1-68.6 230.1s-.4-16.9-2.2-85.7c4.3 4.5 34.5 36.2 34.5 36.2l-24.2-47.4l62.6-9.1l-62.6-9.1l20.2-55.5l-31.4 45.9c-2.2-87.7-7.8-305.1-7.9-306.9v-2.4v1v-1v2.4c0 1-5.6 219-7.9 306.9l-31.4-45.9l20.2 55.5l-62.6 9.1l62.6 9.1l-24.2 47.4l34.5-36.2c-1.8 68.8-2.2 85.7-2.2 85.7s-154.4-71.7-68.6-230.1c0 0-107-118.1-10.1-190.7c0 0-165.5 99.9-60.5 271.5c0 0-86.8-84.8-41.4-170.5c0 0-78.7 111 17.2 233.1c0 0-26.2-16.1-49.4-77.7c0 0 16.9 183.3 222 185.7h4.1c205-2.4 222-185.7 222-185.7c-23.6 61.5-49.9 77.7-49.9 77.7" },
  mando: { vb: "0 0 448 512", d: "M232.27 511.89c-1-3.26-1.69-15.83-1.39-24.58c.55-15.89 1-24.72 1.4-28.76c.64-6.2 2.87-20.72 3.28-21.38c.6-1 .4-27.87-.24-33.13c-.31-2.58-.63-11.9-.69-20.73c-.13-16.47-.53-20.12-2.73-24.76c-1.1-2.32-1.23-3.84-1-11.43a92 92 0 0 0-.34-12.71c-2-13-3.46-27.7-3.25-33.9s.43-7.15 2.06-9.67c3.05-4.71 6.51-14 8.62-23.27c2.26-9.86 3.88-17.18 4.59-20.74a109.5 109.5 0 0 1 4.42-15.05c2.27-6.25 2.49-15.39.37-15.39c-.3 0-1.38 1.22-2.41 2.71s-4.76 4.8-8.29 7.36c-8.37 6.08-11.7 9.39-12.66 12.58s-1 7.23-.16 7.76c.34.21 1.29 2.4 2.11 4.88a28.83 28.83 0 0 1 .72 15.36c-.39 1.77-1 5.47-1.46 8.23s-1 6.46-1.25 8.22a9.85 9.85 0 0 1-1.55 4.26c-1 1-1.14.91-2.05-.53a14.9 14.9 0 0 1-1.44-4.75c-.25-1.74-1.63-7.11-3.08-11.93c-3.28-10.9-3.52-16.15-1-21a14.2 14.2 0 0 0 1.67-4.61c0-2.39-2.2-5.32-7.41-9.89c-7-6.18-8.63-7.92-10.23-11.3c-1.71-3.6-3.06-4.06-4.54-1.54c-1.78 3-2.6 9.11-3 22l-.34 12.19l2 2.25c3.21 3.7 12.07 16.45 13.78 19.83c3.41 6.74 4.34 11.69 4.41 23.56s.95 22.75 2 24.71c.36.66.51 1.35.34 1.52s.41 2.09 1.29 4.27a38 38 0 0 1 2.06 9a91 91 0 0 0 1.71 10.37c2.23 9.56 2.77 14.08 2.39 20.14c-.2 3.27-.53 11.07-.73 17.32c-1.31 41.76-1.85 58-2 61.21c-.12 2-.39 11.51-.6 21.07c-.36 16.3-1.3 27.37-2.42 28.65c-.64.73-8.07-4.91-12.52-9.49c-3.75-3.87-4-4.79-2.83-9.95c.7-3 2.26-18.29 3.33-32.62c.36-4.78.81-10.5 1-12.71c.83-9.37 1.66-20.35 2.61-34.78c.56-8.46 1.33-16.44 1.72-17.73s.89-9.89 1.13-19.11l.43-16.77l-2.26-4.3c-1.72-3.28-4.87-6.94-13.22-15.34c-6-6.07-11.84-12.3-12.91-13.85l-1.95-2.81l.75-10.9c1.09-15.71 1.1-48.57 0-59.06l-.89-8.7l-3.28-4.52c-5.86-8.08-5.8-7.75-6.22-33.27c-.1-6.07-.38-11.5-.63-12.06c-.83-1.87-3.05-2.66-8.54-3.05c-8.86-.62-11-1.9-23.85-14.55c-6.15-6-12.34-12-13.75-13.19c-2.81-2.42-2.79-2-.56-9.63l1.35-4.65l-1.69-3a32 32 0 0 0-2.59-4.07c-1.33-1.51-5.5-10.89-6-13.49a4.24 4.24 0 0 1 .87-3.9c2.23-2.86 3.4-5.68 4.45-10.73c2.33-11.19 7.74-26.09 10.6-29.22c3.18-3.47 7.7-1 9.41 5c1.34 4.79 1.37 9.79.1 18.55a101 101 0 0 0-1 11.11c0 4 .19 4.69 2.25 7.39c3.33 4.37 7.73 7.41 15.2 10.52a18.7 18.7 0 0 1 4.72 2.85c11.17 10.72 18.62 16.18 22.95 16.85c5.18.8 8 4.54 10 13.39c1.31 5.65 4 11.14 5.46 11.14a9.4 9.4 0 0 0 3.33-1.39c2-1.22 2.25-1.73 2.25-4.18a133 133 0 0 0-2-17.84c-.37-1.66-.78-4.06-.93-5.35s-.61-3.85-1-5.69c-2.55-11.16-3.65-15.46-4.1-16c-1.55-2-4.08-10.2-4.93-15.92c-1.64-11.11-4-14.23-12.91-17.39A43.2 43.2 0 0 1 165.24 78c-1.15-1-4-3.22-6.35-5.06s-4.41-3.53-4.6-3.76a23 23 0 0 0-2.69-2c-6.24-4.22-8.84-7-11.26-12l-2.44-5l-.22-13l-.22-13l6.91-6.55c3.95-3.75 8.48-7.35 10.59-8.43c3.31-1.69 4.45-1.89 11.37-2c8.53-.19 10.12 0 11.66 1.56s1.36 6.4-.29 8.5a6.7 6.7 0 0 0-1.34 2.32c0 .58-2.61 4.91-5.42 9a30.4 30.4 0 0 0-2.37 6.82c20.44 13.39 21.55 3.77 14.07 29L194 66.92c3.11-8.66 6.47-17.26 8.61-26.22c.29-7.63-12-4.19-15.4-8.68c-2.33-5.93 3.13-14.18 6.06-19.2c1.6-2.34 6.62-4.7 8.82-4.15c.88.22 4.16-.35 7.37-1.28a45.3 45.3 0 0 1 7.55-1.68a29.6 29.6 0 0 0 6-1.29c3.65-1.11 4.5-1.17 6.35-.4a29.5 29.5 0 0 0 5.82 1.36a18.2 18.2 0 0 1 6 1.91a22.7 22.7 0 0 0 5 2.17c2.51.68 3 .57 7.05-1.67l4.35-2.4L268.32 5c10.44-.4 10.81-.47 15.26-2.68L288.16 0l2.46 1.43c1.76 1 3.14 2.73 4.85 6c2.36 4.51 2.38 4.58 1.37 7.37c-.88 2.44-.89 3.3-.1 6.39a36 36 0 0 0 2.1 5.91a13.6 13.6 0 0 1 1.31 4c.31 4.33 0 5.3-2.41 6.92c-2.17 1.47-7 7.91-7 9.34a14.8 14.8 0 0 1-1.07 3c-5 11.51-6.76 13.56-14.26 17c-9.2 4.2-12.3 5.19-16.21 5.19c-3.1 0-4 .25-4.54 1.26a18.3 18.3 0 0 1-4.09 3.71a13.6 13.6 0 0 0-4.38 4.78a5.9 5.9 0 0 1-2.49 2.91a6.9 6.9 0 0 0-2.45 1.71a68 68 0 0 1-7 5.38c-3.33 2.34-6.87 5-7.87 6A7.3 7.3 0 0 1 224 100a5.76 5.76 0 0 0-2.13 1.65c-1.31 1.39-1.49 2.11-1.14 4.6a36.5 36.5 0 0 0 1.42 5.88c1.32 3.8 1.31 7.86 0 10.57s-.89 6.65 1.35 9.59c2 2.63 2.16 4.56.71 8.84a33.5 33.5 0 0 0-1.06 8.91c0 4.88.22 6.28 1.46 8.38s1.82 2.48 3.24 2.32c2-.23 2.3-1.05 4.71-12.12c2.18-10 3.71-11.92 13.76-17.08c2.94-1.51 7.46-4 10-5.44s6.79-3.69 9.37-4.91a40.1 40.1 0 0 0 15.22-11.67c7.11-8.79 10-16.22 12.85-33.3a18.4 18.4 0 0 1 2.86-7.73a20.4 20.4 0 0 0 2.89-7.31c1-5.3 2.85-9.08 5.58-11.51c4.7-4.18 6-1.09 4.59 10.87c-.46 3.86-1.1 10.33-1.44 14.38l-.61 7.36l4.45 4.09l4.45 4.09l.11 8.42c.06 4.63.47 9.53.92 10.89l.82 2.47l-6.43 6.28c-8.54 8.33-12.88 13.93-16.76 21.61c-1.77 3.49-3.74 7.11-4.38 8c-2.18 3.11-6.46 13-8.76 20.26l-2.29 7.22l-7 6.49c-3.83 3.57-8 7.25-9.17 8.17c-3.05 2.32-4.26 5.15-4.26 10a14.6 14.6 0 0 0 1.59 7.26a42 42 0 0 1 2.09 4.83a9.3 9.3 0 0 0 1.57 2.89c1.4 1.59 1.92 16.12.83 23.22c-.68 4.48-3.63 12-4.7 12c-1.79 0-4.06 9.27-5.07 20.74c-.18 2-.62 5.94-1 8.7s-1 10-1.35 16.05c-.77 12.22-.19 18.77 2 23.15c3.41 6.69.52 12.69-11 22.84l-4 3.49l.07 5.19a40.8 40.8 0 0 0 1.14 8.87c4.61 16 4.73 16.92 4.38 37.13c-.46 26.4-.26 40.27.63 44.15a61 61 0 0 1 1.08 7c.17 2 .66 5.33 1.08 7.36c.47 2.26.78 11 .79 22.74v19.06l-1.81 2.63c-2.71 3.91-15.11 13.54-15.49 12.29zm29.53-45.11c-.18-.3-.33-6.87-.33-14.59c0-14.06-.89-27.54-2.26-34.45c-.4-2-.81-9.7-.9-17.06c-.15-11.93-1.4-24.37-2.64-26.38c-.66-1.07-3-17.66-3-21.3c0-4.23 1-6 5.28-9.13s4.86-3.14 5.48-.72c.28 1.1 1.45 5.62 2.6 10c3.93 15.12 4.14 16.27 4.05 21.74c-.1 5.78-.13 6.13-1.74 17.73c-1 7.07-1.17 12.39-1 28.43c.17 19.4-.64 35.73-2 41.27c-.71 2.78-2.8 5.48-3.43 4.43zm-71-37.58a101 101 0 0 1-1.73-10.79a101 101 0 0 0-1.73-10.79a37.5 37.5 0 0 1-1-6.49c-.31-3.19-.91-7.46-1.33-9.48c-1-4.79-3.35-19.35-3.42-21.07c0-.74-.34-4.05-.7-7.36c-.67-6.21-.84-27.67-.22-28.29c1-1 6.63 2.76 11.33 7.43l5.28 5.25l-.45 6.47c-.25 3.56-.6 10.23-.78 14.83s-.49 9.87-.67 11.71s-.61 9.36-.94 16.72c-.79 17.41-1.94 31.29-2.65 32a.62.62 0 0 1-1-.14zm-87.18-266.59c21.07 12.79 17.84 14.15 28.49 17.66c13 4.29 18.87 7.13 23.15 16.87C111.6 233.28 86.25 255 78.55 268c-31 52-6 101.59 62.75 87.21c-14.18 29.23-78 28.63-98.68-4.9c-24.68-39.95-22.09-118.3 61-187.66zm210.79 179c56.66 6.88 82.32-37.74 46.54-89.23c0 0-26.87-29.34-64.28-68c3-15.45 9.49-32.12 30.57-53.82c89.2 63.51 92 141.61 92.46 149.36c4.3 70.64-78.7 91.18-105.29 61.71z" },
  sith: { vb: "0 0 448 512", d: "m0 32l69.71 118.75l-58.86-11.52l69.84 91.03a146.7 146.7 0 0 0 0 51.45l-69.84 91.03l58.86-11.52L0 480l118.75-69.71l-11.52 58.86l91.03-69.84c17.02 3.04 34.47 3.04 51.48 0l91.03 69.84l-11.52-58.86L448 480l-69.71-118.78l58.86 11.52l-69.84-91.03c3.03-17.01 3.04-34.44 0-51.45l69.84-91.03l-58.86 11.52L448 32l-118.75 69.71l11.52-58.9l-91.06 69.87c-8.5-1.52-17.1-2.29-25.71-2.29s-17.21.78-25.71 2.29l-91.06-69.87l11.52 58.9zm224 99.78c31.8 0 63.6 12.12 87.85 36.37c48.5 48.5 48.49 127.21 0 175.7s-127.2 48.46-175.7-.03c-48.5-48.5-48.49-127.21 0-175.7c24.24-24.25 56.05-36.34 87.85-36.34m0 36.66c-22.42 0-44.83 8.52-61.92 25.61c-34.18 34.18-34.19 89.68 0 123.87s89.65 34.18 123.84 0c34.18-34.18 34.19-89.68 0-123.87c-17.09-17.09-39.5-25.61-61.92-25.61" },
  firstorder: { vb: "0 0 448 512", d: "M12.9 229.2c.1-.1.2-.3.3-.4c0 .1 0 .3-.1.4zM224 96.6c-7.1 0-14.6.6-21.4 1.7l3.7 67.4l-22-64c-14.3 3.7-27.7 9.4-40 16.6l29.4 61.4l-45.1-50.9c-11.4 8.9-21.7 19.1-30.6 30.9l50.6 45.4l-61.1-29.7c-7.1 12.3-12.9 25.7-16.6 40l64.3 22.6l-68-4c-.9 7.1-1.4 14.6-1.4 22s.6 14.6 1.4 21.7l67.7-4l-64 22.6c3.7 14.3 9.4 27.7 16.6 40.3l61.1-29.7L97.7 352c8.9 11.7 19.1 22.3 30.9 30.9l44.9-50.9l-29.5 61.4c12.3 7.4 25.7 13.1 40 16.9l22.3-64.6l-4 68c7.1 1.1 14.6 1.7 21.7 1.7c7.4 0 14.6-.6 21.7-1.7l-4-68.6l22.6 65.1c14.3-4 27.7-9.4 40-16.9L274.9 332l44.9 50.9c11.7-8.9 22-19.1 30.6-30.9l-50.6-45.1l61.1 29.4c7.1-12.3 12.9-25.7 16.6-40.3l-64-22.3l67.4 4c1.1-7.1 1.4-14.3 1.4-21.7s-.3-14.9-1.4-22l-67.7 4l64-22.3c-3.7-14.3-9.1-28-16.6-40.3l-60.9 29.7l50.6-45.4q-13.35-17.55-30.6-30.9l-45.1 50.9l29.4-61.1c-12.3-7.4-25.7-13.1-40-16.9L241.7 166l4-67.7c-7.1-1.2-14.3-1.7-21.7-1.7M443.4 128v256L224 512L4.6 384V128L224 0zm-17.1 10.3L224 20.9L21.7 138.3v235.1L224 491.1l202.3-117.7zM224 37.1l187.7 109.4v218.9L224 474.9L36.3 365.4V146.6zm0 50.9c-92.3 0-166.9 75.1-166.9 168c0 92.6 74.6 167.7 166.9 167.7c92 0 166.9-75.1 166.9-167.7c0-92.9-74.9-168-166.9-168" },
  republic: { vb: "0 0 496 512", d: "M248 504C111.25 504 0 392.75 0 256S111.25 8 248 8s248 111.25 248 248s-111.25 248-248 248m0-479.47C120.37 24.53 16.53 128.37 16.53 256S120.37 487.47 248 487.47S479.47 383.63 479.47 256S375.63 24.53 248 24.53m27.62 21.81v24.62a185.9 185.9 0 0 1 83.57 34.54l17.39-17.36c-28.75-22.06-63.3-36.89-100.96-41.8m-55.37.07c-37.64 4.94-72.16 19.8-100.88 41.85l17.28 17.36h.08c24.07-17.84 52.55-30.06 83.52-34.67zm12.25 50.17v82.87c-10.04 2.03-19.42 5.94-27.67 11.42l-58.62-58.59l-21.93 21.93l58.67 58.67c-5.47 8.23-9.45 17.59-11.47 27.62h-82.9v31h82.9c2.02 10.02 6.01 19.31 11.47 27.54l-58.67 58.69l21.93 21.93l58.62-58.62a77.9 77.9 0 0 0 27.67 11.47v82.9h31v-82.9c10.05-2.03 19.37-6.06 27.62-11.55l58.67 58.69l21.93-21.93l-58.67-58.69c5.46-8.23 9.47-17.52 11.5-27.54h82.87v-31h-82.87c-2.02-10.02-6.03-19.38-11.5-27.62l58.67-58.67l-21.93-21.93l-58.67 58.67c-8.25-5.49-17.57-9.47-27.62-11.5V96.58zm183.24 30.72l-17.36 17.36a186.34 186.34 0 0 1 34.67 83.67h24.62c-4.95-37.69-19.83-72.29-41.93-101.03m-335.55.13c-22.06 28.72-36.91 63.26-41.85 100.91h24.65c4.6-30.96 16.76-59.45 34.59-83.52zM38.34 283.67c4.92 37.64 19.75 72.18 41.8 100.9l17.36-17.39c-17.81-24.07-29.92-52.57-34.51-83.52H38.34zm394.7 0c-4.61 30.99-16.8 59.5-34.67 83.6l17.36 17.36c22.08-28.74 36.98-63.29 41.93-100.96zM136.66 406.38l-17.36 17.36c28.73 22.09 63.3 36.98 100.96 41.93v-24.64c-30.99-4.63-59.53-16.79-83.6-34.65m222.53.05c-24.09 17.84-52.58 30.08-83.57 34.67v24.57c37.67-4.92 72.21-19.79 100.96-41.85l-17.31-17.39z" },
  oldrepublic: { vb: "0 0 496 512", d: "M235.76 10.23c7.5-.31 15-.28 22.5-.09c3.61.14 7.2.4 10.79.73c4.92.27 9.79 1.03 14.67 1.62c2.93.43 5.83.98 8.75 1.46c7.9 1.33 15.67 3.28 23.39 5.4c12.24 3.47 24.19 7.92 35.76 13.21c26.56 12.24 50.94 29.21 71.63 49.88c20.03 20.09 36.72 43.55 48.89 69.19c1.13 2.59 2.44 5.1 3.47 7.74c2.81 6.43 5.39 12.97 7.58 19.63c4.14 12.33 7.34 24.99 9.42 37.83c.57 3.14 1.04 6.3 1.4 9.47c.55 3.83.94 7.69 1.18 11.56c.83 8.34.84 16.73.77 25.1c-.07 4.97-.26 9.94-.75 14.89c-.24 3.38-.51 6.76-.98 10.12c-.39 2.72-.63 5.46-1.11 8.17c-.9 5.15-1.7 10.31-2.87 15.41c-4.1 18.5-10.3 36.55-18.51 53.63c-15.77 32.83-38.83 62.17-67.12 85.12a246.5 246.5 0 0 1-56.91 34.86c-6.21 2.68-12.46 5.25-18.87 7.41c-3.51 1.16-7.01 2.38-10.57 3.39c-6.62 1.88-13.29 3.64-20.04 5c-4.66.91-9.34 1.73-14.03 2.48c-5.25.66-10.5 1.44-15.79 1.74c-6.69.66-13.41.84-20.12.81c-6.82.03-13.65-.12-20.45-.79c-3.29-.23-6.57-.5-9.83-.95c-2.72-.39-5.46-.63-8.17-1.11c-4.12-.72-8.25-1.37-12.35-2.22c-4.25-.94-8.49-1.89-12.69-3.02c-8.63-2.17-17.08-5.01-25.41-8.13c-10.49-4.12-20.79-8.75-30.64-14.25c-2.14-1.15-4.28-2.29-6.35-3.57c-11.22-6.58-21.86-14.1-31.92-22.34c-34.68-28.41-61.41-66.43-76.35-108.7c-3.09-8.74-5.71-17.65-7.8-26.68c-1.48-6.16-2.52-12.42-3.58-18.66c-.4-2.35-.61-4.73-.95-7.09c-.6-3.96-.75-7.96-1.17-11.94c-.8-9.47-.71-18.99-.51-28.49c.14-3.51.34-7.01.7-10.51c.31-3.17.46-6.37.92-9.52c.41-2.81.65-5.65 1.16-8.44c.7-3.94 1.3-7.9 2.12-11.82c3.43-16.52 8.47-32.73 15.26-48.18c1.15-2.92 2.59-5.72 3.86-8.59c8.05-16.71 17.9-32.56 29.49-47.06c20-25.38 45.1-46.68 73.27-62.47c7.5-4.15 15.16-8.05 23.07-11.37c15.82-6.88 32.41-11.95 49.31-15.38c3.51-.67 7.04-1.24 10.56-1.85c2.62-.47 5.28-.7 7.91-1.08c3.53-.53 7.1-.68 10.65-1.04c2.46-.24 4.91-.36 7.36-.51m8.64 24.41c-9.23.1-18.43.99-27.57 2.23c-7.3 1.08-14.53 2.6-21.71 4.3c-13.91 3.5-27.48 8.34-40.46 14.42c-10.46 4.99-20.59 10.7-30.18 17.22c-4.18 2.92-8.4 5.8-12.34 9.03c-5.08 3.97-9.98 8.17-14.68 12.59c-2.51 2.24-4.81 4.7-7.22 7.06c-28.22 28.79-48.44 65.39-57.5 104.69c-2.04 8.44-3.54 17.02-4.44 25.65c-1.1 8.89-1.44 17.85-1.41 26.8c.11 7.14.38 14.28 1.22 21.37c.62 7.12 1.87 14.16 3.2 21.18c1.07 4.65 2.03 9.32 3.33 13.91c6.29 23.38 16.5 45.7 30.07 65.75c8.64 12.98 18.78 24.93 29.98 35.77c16.28 15.82 35.05 29.04 55.34 39.22c7.28 3.52 14.66 6.87 22.27 9.63c5.04 1.76 10.06 3.57 15.22 4.98c11.26 3.23 22.77 5.6 34.39 7.06c2.91.29 5.81.61 8.72.9c13.82 1.08 27.74 1 41.54-.43c4.45-.6 8.92-.99 13.35-1.78c3.63-.67 7.28-1.25 10.87-2.1c4.13-.98 8.28-1.91 12.36-3.07c26.5-7.34 51.58-19.71 73.58-36.2c15.78-11.82 29.96-25.76 42.12-41.28c3.26-4.02 6.17-8.31 9.13-12.55c3.39-5.06 6.58-10.25 9.6-15.54c2.4-4.44 4.74-8.91 6.95-13.45c5.69-12.05 10.28-24.62 13.75-37.49c2.59-10.01 4.75-20.16 5.9-30.45c1.77-13.47 1.94-27.1 1.29-40.65c-.29-3.89-.67-7.77-1-11.66c-2.23-19.08-6.79-37.91-13.82-55.8c-5.95-15.13-13.53-29.63-22.61-43.13c-12.69-18.8-28.24-35.68-45.97-49.83c-25.05-20-54.47-34.55-85.65-42.08c-7.78-1.93-15.69-3.34-23.63-4.45c-3.91-.59-7.85-.82-11.77-1.24c-7.39-.57-14.81-.72-22.22-.58M139.26 83.53c13.3-8.89 28.08-15.38 43.3-20.18c-3.17 1.77-6.44 3.38-9.53 5.29c-11.21 6.68-21.52 14.9-30.38 24.49c-6.8 7.43-12.76 15.73-17.01 24.89c-3.29 6.86-5.64 14.19-6.86 21.71c-.93 4.85-1.3 9.81-1.17 14.75c.13 13.66 4.44 27.08 11.29 38.82c5.92 10.22 13.63 19.33 22.36 27.26c4.85 4.36 10.24 8.09 14.95 12.6c2.26 2.19 4.49 4.42 6.43 6.91c2.62 3.31 4.89 6.99 5.99 11.1c.9 3.02.66 6.2.69 9.31c.02 4.1-.04 8.2.03 12.3c.14 3.54-.02 7.09.11 10.63c.08 2.38.02 4.76.05 7.14c.16 5.77.06 11.53.15 17.3c.11 2.91.02 5.82.13 8.74c.03 1.63.13 3.28-.03 4.91c-.91.12-1.82.18-2.73.16c-10.99 0-21.88-2.63-31.95-6.93c-6-2.7-11.81-5.89-17.09-9.83c-5.75-4.19-11.09-8.96-15.79-14.31c-6.53-7.24-11.98-15.39-16.62-23.95c-1.07-2.03-2.24-4.02-3.18-6.12c-1.16-2.64-2.62-5.14-3.67-7.82c-4.05-9.68-6.57-19.94-8.08-30.31c-.49-4.44-1.09-8.88-1.2-13.35c-.7-15.73.84-31.55 4.67-46.82c2.12-8.15 4.77-16.18 8.31-23.83c6.32-14.2 15.34-27.18 26.3-38.19c6.28-6.2 13.13-11.84 20.53-16.67m175.37-20.12c2.74.74 5.41 1.74 8.09 2.68c6.36 2.33 12.68 4.84 18.71 7.96c13.11 6.44 25.31 14.81 35.82 24.97c10.2 9.95 18.74 21.6 25.14 34.34c1.28 2.75 2.64 5.46 3.81 8.26c6.31 15.1 10 31.26 11.23 47.57c.41 4.54.44 9.09.45 13.64c.07 11.64-1.49 23.25-4.3 34.53c-1.97 7.27-4.35 14.49-7.86 21.18c-3.18 6.64-6.68 13.16-10.84 19.24c-6.94 10.47-15.6 19.87-25.82 27.22c-10.48 7.64-22.64 13.02-35.4 15.38c-3.51.69-7.08 1.08-10.66 1.21c-1.85.06-3.72.16-5.56-.1c-.28-2.15 0-4.31-.01-6.46c-.03-3.73.14-7.45.1-11.17c.19-7.02.02-14.05.21-21.07c.03-2.38-.03-4.76.03-7.14c.17-5.07-.04-10.14.14-15.21c.1-2.99-.24-6.04.51-8.96c.66-2.5 1.78-4.86 3.09-7.08c4.46-7.31 11.06-12.96 17.68-18.26c5.38-4.18 10.47-8.77 15.02-13.84c7.68-8.37 14.17-17.88 18.78-28.27c2.5-5.93 4.52-12.1 5.55-18.46c.86-4.37 1.06-8.83 1.01-13.27c-.02-7.85-1.4-15.65-3.64-23.17c-1.75-5.73-4.27-11.18-7.09-16.45c-3.87-6.93-8.65-13.31-13.96-19.2c-9.94-10.85-21.75-19.94-34.6-27.1c-1.85-1.02-3.84-1.82-5.63-2.97m-100.8 58.45c.98-1.18 1.99-2.33 3.12-3.38c-.61.93-1.27 1.81-1.95 2.68c-3.1 3.88-5.54 8.31-7.03 13.06c-.87 3.27-1.68 6.6-1.73 10c-.07 2.52-.08 5.07.32 7.57c1.13 7.63 4.33 14.85 8.77 21.12c2 2.7 4.25 5.27 6.92 7.33c1.62 1.27 3.53 2.09 5.34 3.05c3.11 1.68 6.32 3.23 9.07 5.48c2.67 2.09 4.55 5.33 4.4 8.79c-.01 73.67 0 147.34-.01 221.02c0 1.35-.08 2.7.04 4.04c.13 1.48.82 2.83 1.47 4.15c.86 1.66 1.78 3.34 3.18 4.62c.85.77 1.97 1.4 3.15 1.24c1.5-.2 2.66-1.35 3.45-2.57c.96-1.51 1.68-3.16 2.28-4.85c.76-2.13.44-4.42.54-6.63c.14-4.03-.02-8.06.14-12.09c.03-5.89.03-11.77.06-17.66c.14-3.62.03-7.24.11-10.86c.15-4.03-.02-8.06.14-12.09c.03-5.99.03-11.98.07-17.97c.14-3.62.02-7.24.11-10.86c.14-3.93-.02-7.86.14-11.78c.03-5.99.03-11.98.06-17.97c.16-3.94-.01-7.88.19-11.82c.29 1.44.13 2.92.22 4.38c.19 3.61.42 7.23.76 10.84c.32 3.44.44 6.89.86 10.32c.37 3.1.51 6.22.95 9.31c.57 4.09.87 8.21 1.54 12.29c1.46 9.04 2.83 18.11 5.09 26.99c1.13 4.82 2.4 9.61 4 14.3c2.54 7.9 5.72 15.67 10.31 22.62c1.73 2.64 3.87 4.98 6.1 7.21c.27.25.55.51.88.71c.6.25 1.31-.07 1.7-.57c.71-.88 1.17-1.94 1.7-2.93c4.05-7.8 8.18-15.56 12.34-23.31c.7-1.31 1.44-2.62 2.56-3.61c1.75-1.57 3.84-2.69 5.98-3.63c2.88-1.22 5.9-2.19 9.03-2.42c6.58-.62 13.11.75 19.56 1.85c3.69.58 7.4 1.17 11.13 1.41c3.74.1 7.48.05 11.21-.28c8.55-.92 16.99-2.96 24.94-6.25c5.3-2.24 10.46-4.83 15.31-7.93c11.46-7.21 21.46-16.57 30.04-27.01c1.17-1.42 2.25-2.9 3.46-4.28c-1.2 3.24-2.67 6.37-4.16 9.48c-1.25 2.9-2.84 5.61-4.27 8.42c-5.16 9.63-11.02 18.91-17.75 27.52c-4.03 5.21-8.53 10.05-13.33 14.57c-6.64 6.05-14.07 11.37-22.43 14.76c-8.21 3.37-17.31 4.63-26.09 3.29c-3.56-.58-7.01-1.69-10.41-2.88c-2.79-.97-5.39-2.38-8.03-3.69c-3.43-1.71-6.64-3.81-9.71-6.08c2.71 3.06 5.69 5.86 8.7 8.61c4.27 3.76 8.74 7.31 13.63 10.23c3.98 2.45 8.29 4.4 12.84 5.51c1.46.37 2.96.46 4.45.6c-1.25 1.1-2.63 2.04-3.99 2.98c-9.61 6.54-20.01 11.86-30.69 16.43c-20.86 8.7-43.17 13.97-65.74 15.34q-6.99.36-13.98.36c-4.98-.11-9.97-.13-14.92-.65c-11.2-.76-22.29-2.73-33.17-5.43c-10.35-2.71-20.55-6.12-30.3-10.55c-8.71-3.86-17.12-8.42-24.99-13.79c-1.83-1.31-3.74-2.53-5.37-4.08c6.6-1.19 13.03-3.39 18.99-6.48c5.74-2.86 10.99-6.66 15.63-11.07c2.24-2.19 4.29-4.59 6.19-7.09c-3.43 2.13-6.93 4.15-10.62 5.78c-4.41 2.16-9.07 3.77-13.81 5.02c-5.73 1.52-11.74 1.73-17.61 1.14c-8.13-.95-15.86-4.27-22.51-8.98c-4.32-2.94-8.22-6.43-11.96-10.06c-9.93-10.16-18.2-21.81-25.66-33.86c-3.94-6.27-7.53-12.75-11.12-19.22c-1.05-2.04-2.15-4.05-3.18-6.1c2.85 2.92 5.57 5.97 8.43 8.88c8.99 8.97 18.56 17.44 29.16 24.48c7.55 4.9 15.67 9.23 24.56 11.03c3.11.73 6.32.47 9.47.81c2.77.28 5.56.2 8.34.3c5.05.06 10.11.04 15.16-.16c3.65-.16 7.27-.66 10.89-1.09c2.07-.25 4.11-.71 6.14-1.2c3.88-.95 8.11-.96 11.83.61c4.76 1.85 8.44 5.64 11.38 9.71c2.16 3.02 4.06 6.22 5.66 9.58c1.16 2.43 2.46 4.79 3.55 7.26c1 2.24 2.15 4.42 3.42 6.52c.67 1.02 1.4 2.15 2.62 2.55c1.06-.75 1.71-1.91 2.28-3.03c2.1-4.16 3.42-8.65 4.89-13.05c2.02-6.59 3.78-13.27 5.19-20.02c2.21-9.25 3.25-18.72 4.54-28.13c.56-3.98.83-7.99 1.31-11.97c.87-10.64 1.9-21.27 2.24-31.94c.08-1.86.24-3.71.25-5.57c.01-4.35.25-8.69.22-13.03c-.01-2.38-.01-4.76 0-7.13c.05-5.07-.2-10.14-.22-15.21c-.2-6.61-.71-13.2-1.29-19.78c-.73-5.88-1.55-11.78-3.12-17.51c-2.05-7.75-5.59-15.03-9.8-21.82c-3.16-5.07-6.79-9.88-11.09-14.03c-3.88-3.86-8.58-7.08-13.94-8.45c-1.5-.41-3.06-.45-4.59-.64c.07-2.99.7-5.93 1.26-8.85c1.59-7.71 3.8-15.3 6.76-22.6c1.52-4.03 3.41-7.9 5.39-11.72c3.45-6.56 7.62-12.79 12.46-18.46m31.27 1.7c.35-.06.71-.12 1.07-.19c.19 1.79.09 3.58.1 5.37v38.13c-.01 1.74.13 3.49-.15 5.22c-.36-.03-.71-.05-1.06-.05c-.95-3.75-1.72-7.55-2.62-11.31c-.38-1.53-.58-3.09-1.07-4.59c-1.7-.24-3.43-.17-5.15-.2c-5.06-.01-10.13 0-15.19-.01c-1.66-.01-3.32.09-4.98-.03c-.03-.39-.26-.91.16-1.18c1.28-.65 2.72-.88 4.06-1.35c3.43-1.14 6.88-2.16 10.31-3.31c1.39-.48 2.9-.72 4.16-1.54c.04-.56.02-1.13-.05-1.68c-1.23-.55-2.53-.87-3.81-1.28c-3.13-1.03-6.29-1.96-9.41-3.02c-1.79-.62-3.67-1-5.41-1.79c-.03-.37-.07-.73-.11-1.09c5.09-.19 10.2.06 15.3-.12c3.36-.13 6.73.08 10.09-.07c.12-.39.26-.77.37-1.16c1.08-4.94 2.33-9.83 3.39-14.75m5.97-.2c.36.05.72.12 1.08.2c.98 3.85 1.73 7.76 2.71 11.61c.36 1.42.56 2.88 1.03 4.27c2.53.18 5.07-.01 7.61.05c5.16.12 10.33.12 15.49.07c.76-.01 1.52.03 2.28.08c-.04.36-.07.72-.1 1.08c-1.82.83-3.78 1.25-5.67 1.89c-3.73 1.23-7.48 2.39-11.22 3.57c-.57.17-1.12.42-1.67.64c-.15.55-.18 1.12-.12 1.69c.87.48 1.82.81 2.77 1.09c4.88 1.52 9.73 3.14 14.63 4.6c.38.13.78.27 1.13.49c.4.27.23.79.15 1.18c-1.66.13-3.31.03-4.97.04c-5.17.01-10.33-.01-15.5.01c-1.61.03-3.22-.02-4.82.21c-.52 1.67-.72 3.42-1.17 5.11c-.94 3.57-1.52 7.24-2.54 10.78c-.36.01-.71.02-1.06.06c-.29-1.73-.15-3.48-.15-5.22v-38.13c.02-1.78-.08-3.58.11-5.37M65.05 168.33c1.12-2.15 2.08-4.4 3.37-6.46c-1.82 7.56-2.91 15.27-3.62 23c-.8 7.71-.85 15.49-.54 23.23c1.05 19.94 5.54 39.83 14.23 57.88c2.99 5.99 6.35 11.83 10.5 17.11c6.12 7.47 12.53 14.76 19.84 21.09c4.8 4.1 9.99 7.78 15.54 10.8c3.27 1.65 6.51 3.39 9.94 4.68c5.01 2.03 10.19 3.61 15.42 4.94c3.83.96 7.78 1.41 11.52 2.71c5 1.57 9.47 4.61 13.03 8.43c4.93 5.23 8.09 11.87 10.2 18.67c.99 2.9 1.59 5.91 2.17 8.92c.15.75.22 1.52.16 2.29c-6.5 2.78-13.26 5.06-20.26 6.18c-4.11.78-8.29.99-12.46 1.08c-10.25.24-20.47-1.76-30.12-5.12c-3.74-1.42-7.49-2.85-11.03-4.72c-8.06-3.84-15.64-8.7-22.46-14.46c-2.92-2.55-5.83-5.13-8.4-8.03c-9.16-9.83-16.3-21.41-21.79-33.65c-2.39-5.55-4.61-11.18-6.37-16.96c-1.17-3.94-2.36-7.89-3.26-11.91c-.75-2.94-1.22-5.95-1.87-8.92c-.46-2.14-.69-4.32-1.03-6.48c-.85-5.43-1.28-10.93-1.33-16.43c.11-6.18.25-12.37 1.07-18.5c.4-2.86.67-5.74 1.15-8.6c.98-5.7 2.14-11.37 3.71-16.93c3.09-11.65 7.48-22.95 12.69-33.84m363.73-6.44c1.1 1.66 1.91 3.48 2.78 5.26c2.1 4.45 4.24 8.9 6.02 13.49c7.61 18.76 12.3 38.79 13.04 59.05c.02 1.76.07 3.52.11 5.29c.13 9.57-1.27 19.09-3.18 28.45c-.73 3.59-1.54 7.17-2.58 10.69c-4.04 14.72-10 29-18.41 41.78c-8.21 12.57-19.01 23.55-31.84 31.41c-5.73 3.59-11.79 6.64-18.05 9.19c-5.78 2.19-11.71 4.03-17.8 5.11c-6.4 1.05-12.91 1.52-19.4 1.23c-7.92-.48-15.78-2.07-23.21-4.85c-1.94-.8-3.94-1.46-5.84-2.33c-.21-1.51.25-2.99.53-4.46c1.16-5.74 3.03-11.36 5.7-16.58c2.37-4.51 5.52-8.65 9.46-11.9c2.43-2.05 5.24-3.61 8.16-4.83c3.58-1.5 7.47-1.97 11.24-2.83c7.23-1.71 14.37-3.93 21.15-7c10.35-4.65 19.71-11.38 27.65-19.46c1.59-1.61 3.23-3.18 4.74-4.87c3.37-3.76 6.71-7.57 9.85-11.53c7.48-10.07 12.82-21.59 16.71-33.48c1.58-5.3 3.21-10.6 4.21-16.05c.63-2.87 1.04-5.78 1.52-8.68c.87-6.09 1.59-12.22 1.68-18.38c.12-6.65.14-13.32-.53-19.94c-.73-7.99-1.87-15.96-3.71-23.78" },
  senate: { vb: "0 0 512 512", d: "M249.86 33.48v26.07C236.28 80.17 226 168.14 225.39 274.9c11.74-15.62 19.13-33.33 19.13-48.24v-16.88c-.03-5.32.75-10.53 2.19-15.65c.65-2.14 1.39-4.08 2.62-5.82c1.23-1.75 3.43-3.79 6.68-3.79c3.24 0 5.45 2.05 6.68 3.79c1.23 1.75 1.97 3.68 2.62 5.82c1.44 5.12 2.22 10.33 2.19 15.65v16.88c0 14.91 7.39 32.62 19.13 48.24c-.63-106.76-10.91-194.73-24.49-215.35V33.48zm-26.34 147.77c-9.52 2.15-18.7 5.19-27.46 9.08c8.9 16.12 9.76 32.64 1.71 37.29c-8 4.62-21.85-4.23-31.36-19.82c-11.58 8.79-21.88 19.32-30.56 31.09c14.73 9.62 22.89 22.92 18.32 30.66c-4.54 7.7-20.03 7.14-35.47-.96c-5.78 13.25-9.75 27.51-11.65 42.42c9.68.18 18.67 2.38 26.18 6.04c17.78-.3 32.77-1.96 40.49-4.22c5.55-26.35 23.02-48.23 46.32-59.51c.73-25.55 1.88-49.67 3.48-72.07m64.96 0c1.59 22.4 2.75 46.52 3.47 72.07c23.29 11.28 40.77 33.16 46.32 59.51c7.72 2.26 22.71 3.92 40.49 4.22c7.51-3.66 16.5-5.85 26.18-6.04c-1.9-14.91-5.86-29.17-11.65-42.42c-15.44 8.1-30.93 8.66-35.47.96c-4.57-7.74 3.6-21.05 18.32-30.66c-8.68-11.77-18.98-22.3-30.56-31.09c-9.51 15.59-23.36 24.44-31.36 19.82c-8.05-4.65-7.19-21.16 1.71-37.29a147.5 147.5 0 0 0-27.45-9.08m-32.48 8.6c-3.23 0-5.86 8.81-6.09 19.93h-.05v16.88c0 41.42-49.01 95.04-93.49 95.04c-52 0-122.75-1.45-156.37 29.17v2.51c9.42 17.12 20.58 33.17 33.18 47.97C45.7 380.26 84.77 360.4 141.2 360c45.68 1.02 79.03 20.33 90.76 40.87c.01.01-.01.04 0 .05c7.67 2.14 15.85 3.23 24.04 3.21c8.19.02 16.37-1.07 24.04-3.21c.01-.01-.01-.04 0-.05c11.74-20.54 45.08-39.85 90.76-40.87c56.43.39 95.49 20.26 108.02 41.35c12.6-14.8 23.76-30.86 33.18-47.97v-2.51c-33.61-30.62-104.37-29.17-156.37-29.17c-44.48 0-93.49-53.62-93.49-95.04v-16.88h-.05c-.23-11.12-2.86-19.93-6.09-19.93m0 96.59c22.42 0 40.6 18.18 40.6 40.6s-18.18 40.65-40.6 40.65s-40.6-18.23-40.6-40.65s18.18-40.6 40.6-40.6m0 7.64c-18.19 0-32.96 14.77-32.96 32.96S237.81 360 256 360s32.96-14.77 32.96-32.96s-14.77-32.96-32.96-32.96m0 6.14c14.81 0 26.82 12.01 26.82 26.82s-12.01 26.82-26.82 26.82s-26.82-12.01-26.82-26.82s12.01-26.82 26.82-26.82m-114.8 66.67c-10.19.07-21.6.36-30.5 1.66c.43 4.42 1.51 18.63 7.11 29.76c9.11-2.56 18.36-3.9 27.62-3.9c41.28.94 71.48 34.35 78.26 74.47l.11 4.7c10.4 1.91 21.19 2.94 32.21 2.94c11.03 0 21.81-1.02 32.21-2.94l.11-4.7c6.78-40.12 36.98-73.53 78.26-74.47c9.26 0 18.51 1.34 27.62 3.9c5.6-11.13 6.68-25.34 7.11-29.76c-8.9-1.3-20.32-1.58-30.5-1.66c-18.76.42-35.19 4.17-48.61 9.67c-12.54 16.03-29.16 30.03-49.58 33.07c-.09.02-.17.04-.27.05c-.05.01-.11.04-.16.05c-5.24 1.07-10.63 1.6-16.19 1.6c-5.55 0-10.95-.53-16.19-1.6c-.05-.01-.11-.04-.16-.05c-.1-.02-.17-.04-.27-.05c-20.42-3.03-37.03-17.04-49.58-33.07c-13.42-5.49-29.86-9.25-48.61-9.67" },
  tradefed: { vb: "0 0 496 512", d: "M248 8.8c-137 0-248 111-248 248s111 248 248 248s248-111 248-248s-111-248-248-248m0 482.8c-129.7 0-234.8-105.1-234.8-234.8S118.3 22 248 22s234.8 105.1 234.8 234.8S377.7 491.6 248 491.6m155.1-328.5v-46.8H209.3V198H54.2l36.7 46h117.7v196.8h48.8V245h83.3v-47h-83.3v-34.8h145.7zm-73.3 45.1v23.9h-82.9v197.4h-26.8V232.1H96.3l-20.1-23.9h143.9v-80.6h171.8V152h-145v56.2zm-161.3-69l-12.4-20.7l2.1 23.8l-23.5 5.4l23.3 5.4l-2.1 24l12.3-20.5l22.2 9.5l-15.7-18.1l15.8-18.1zm-29.6-19.7l9.3-11.5l-12.7 5.9l-8-12.4l1.7 13.9l-14.3 3.8l13.7 2.7l-.8 14.7l6.8-12.2l13.8 5.3zm165.4 145.2l-13.1 5.6l-7.3-12.2l1.3 14.2l-13.9 3.2l13.9 3.2l-1.2 14.2l7.3-12.2l13.1 5.5l-9.4-10.7zm106.9-77.2l-20.9 9.1l-12-19.6l2.2 22.7l-22.3 5.4l22.2 4.9l-1.8 22.9l11.5-19.6l21.2 8.8l-15.1-17zM248 29.9c-125.3 0-226.9 101.6-226.9 226.9S122.7 483.7 248 483.7s226.9-101.6 226.9-226.9S373.3 29.9 248 29.9M342.6 196v51h-83.3v195.7h-52.7V245.9H89.9l-40-49.9h157.4v-81.6h197.8v50.7H259.4V196zM248 43.2c60.3 0 114.8 25 153.6 65.2H202.5V190H45.1C73.1 104.8 153.4 43.2 248 43.2m0 427.1c-117.9 0-213.6-95.6-213.6-213.5c0-21.2 3.1-41.8 8.9-61.1L87.1 252h114.7v196.8h64.6V253h83.3v-62.7h-83.2v-19.2h145.6v-50.8c30.8 37 49.3 84.6 49.3 136.5c.1 117.9-95.5 213.5-213.4 213.5M178.8 275l-11-21.4l1.7 24.5l-23.7 3.9l23.8 5.9l-3.7 23.8l13-20.9l21.5 10.8l-15.8-18.8l16.9-17.1z" },
  deathstar: { vb: "0 0 24 24", d: "M2.05 13h19.89c-.06.69-.2 1.36-.4 2H14v2h3v2h-2v2h-2.5v1H12c-5.18 0-9.45-3.95-9.95-9m19.89-2H2.05c.5-5.05 4.77-9 9.95-9c1.62 0 3.15.39 4.5 1.08V5h2v2H20v2h1.54c.2.64.34 1.31.4 2M12 6.75a2.5 2.5 0 0 0-2.5-2.5A2.5 2.5 0 0 0 7 6.75a2.5 2.5 0 0 0 2.5 2.5a2.5 2.5 0 0 0 2.5-2.5" },
  jedicrest: { vb: "0 0 576 512", d: "m246 315.7l-21.2-31.9c-2.1-3.2-1.7-7.4 1-10.1s6.9-3.1 10.1-1l29.5 19.7c2.1 1.4 4.9 0 5-2.6L279.7 8c.1-4.5 3.8-8 8.3-8s8.1 3.5 8.3 8l9.4 281.9c.1 2.5 2.9 3.9 5 2.6l29.5-19.7c3.2-2.1 7.4-1.7 10.1 1s3.1 6.9 1 10.1L330 315.7c-1.3 1.9-.2 4.5 2 4.9l37.6 7.5c3.7.7 6.4 4 6.4 7.8s-2.7 7.1-6.4 7.8l-37.6 7.7c-2.2.4-3.3 3-2 4.9l21.2 31.9c2.1 3.2 1.7 7.4-1 10.1s-6.9 3.1-10.1 1l-26.3-17.6c-2.2-1.4-5.1.2-5 2.8l2.1 61.5C370.6 435.2 416 382.9 416 320c0-37-15.7-70.4-40.8-93.7c-7-6.5-6.5-18.6 1-24.4C410.1 175.5 432 134.3 432 88c0-16.8-2.9-33-8.2-48c-4.6-13 10.2-30 21.4-22c53.5 38 92.7 94.8 107.8 160.7c.5 2.1-.2 4.3-1.7 5.9L522.9 213c-4 4-1.2 10.9 4.5 10.9h26c3.4 0 6.2 2.6 6.3 6c.1 3.3.2 6.6.2 10c0 17.5-1.7 34.7-4.8 51.3c-.2 1.2-.9 2.4-1.7 3.3L506.9 341c-4 4-1.2 10.9 4.5 10.9H526c4.6 0 7.7 4.8 5.7 9C487.2 450.5 394.8 512 288 512S88.8 450.5 44.3 361c-2.1-4.2 1-9 5.7-9h14.6c5.7 0 8.6-6.9 4.5-10.9l-46.5-46.5c-.9-.9-1.5-2-1.7-3.3c-3.2-16.6-4.9-33.8-4.9-51.3c0-3.3.1-6.7.2-10c.1-3.4 2.9-6 6.3-6h26c5.7 0 8.6-6.9 4.5-10.9l-28.4-28.5c-1.5-1.5-2.2-3.8-1.7-5.9C38.1 112.8 77.3 56 130.8 18c11.3-8 26 8.9 21.4 22c-5.3 15-8.2 31.2-8.2 48c0 46.3 21.9 87.5 55.8 113.9c7.5 5.8 8 17.9 1 24.4C175.7 249.6 160 283 160 320c0 62.9 45.4 115.2 105.1 126l2.1-61.5c.1-2.6-2.8-4.2-5-2.8l-26.3 17.6c-3.2 2.1-7.4 1.7-10.1-1s-3.1-6.9-1-10.1l21.2-31.9c1.3-1.9.2-4.5-2-4.9l-37.6-7.5c-3.7-.7-6.4-4-6.4-7.8s2.7-7.1 6.4-7.8l37.6-7.5c2.2-.4 3.3-3 2-4.9z" }
};

/* THEME PRESETS (v1.12.0): one click in ⚙ Overlay Settings → Appearance sets
   every overlay's border skin AND the Appearance colours (the v1.11.1 theme*
   settings, applied by overlay-theme.js). skin null = each overlay's own default
   skin; theme {} = each overlay's own colours. Tried out in dev/overlay-lab.html. */
const THEME_PRESETS = [
  { name: 'Default look',      skin: null,         theme: {} },
  { name: 'Rebel Alliance',    skin: 'rebel',      theme: { themeBackdrop: '#1a0c0c', themeBackdropAlpha: 0.7,  themeBox: '#ff3b3b', themeBoxAlpha: 0.08, themeHighlight: '#ffd24a' } },
  { name: 'Galactic Empire',   skin: 'empire',     theme: { themeBackdrop: '#0b0d10', themeBackdropAlpha: 0.78, themeBox: '#d8dee3', themeBoxAlpha: 0.07, themeHighlight: 'border' } },
  { name: 'Jedi Order',        skin: 'jedi',       theme: { themeBackdrop: '#0a1426', themeBackdropAlpha: 0.68, themeBox: '#4fa8ff', themeBoxAlpha: 0.09, themeHighlight: '#8ff3ff' } },
  { name: 'Sith',              skin: 'sith',       theme: { themeBackdrop: '#060303', themeBackdropAlpha: 0.82, themeBox: '#e0142c', themeBoxAlpha: 0.1,  themeHighlight: '#ff3040' } },
  { name: 'Mandalorian',       skin: 'mando',      theme: { themeBackdrop: '#15120e', themeBackdropAlpha: 0.72, themeBox: '#c9d3dc', themeBoxAlpha: 0.08, themeHighlight: '#9fe7ff' } },
  { name: 'Grogu',             skin: 'grogu',      theme: { themeBackdrop: '#0f1a0f', themeBackdropAlpha: 0.7,  themeBox: '#c9a77c', themeBoxAlpha: 0.1,  themeHighlight: '#b8ff8a' } },
  { name: 'First Order',       skin: 'firstorder', theme: { themeBackdrop: '#0a0a0a', themeBackdropAlpha: 0.8,  themeBox: '#ffffff', themeBoxAlpha: 0.07, themeHighlight: '#ff3b30' } },
  { name: 'Galactic Republic', skin: 'republic',   theme: { themeBackdrop: '#141018', themeBackdropAlpha: 0.72, themeBox: '#ffffff', themeBoxAlpha: 0.08, themeHighlight: '#ff6a5a' } },
  { name: 'Trade Federation',  skin: 'tradefed',   theme: { themeBackdrop: '#1c140a', themeBackdropAlpha: 0.72, themeBox: '#d9a55a', themeBoxAlpha: 0.1,  themeHighlight: '#ffcf6a' } },
  { name: 'Death Star',        skin: 'deathstar',  theme: { themeBackdrop: '#0c1016', themeBackdropAlpha: 0.78, themeBox: '#8fa6ba', themeBoxAlpha: 0.08, themeHighlight: '#7dff5a' } },
  { name: 'Tatooine',          skin: 'tatooine',   theme: { themeBackdrop: '#2a1a0c', themeBackdropAlpha: 0.62, themeBox: '#e08a3c', themeBoxAlpha: 0.09, themeHighlight: '#ffe29a' } }
];

/* Small flat emblem for each border skin's badge — fill="currentColor" so
   the caller just sets `color` (normally var(--accent)) on the wrapping
   element instead of passing a hex through here; keeps this a 1-argument
   function no call site can get wrong. Returns '' for an unknown key so a
   bad/stale settings value never throws, just renders no icon. */
/** Render SVG emblem for a border skin badge. Pass key from BORDER_SKIN_ORDER. Sizes to `size` (default 20). Returns SVG string or '' if key unknown. */
function borderIconSvg(key, size){
  const s = size || 20;
  const e = BORDER_EMBLEMS[key];
  if(e) return '<svg width="' + s + '" height="' + s + '" viewBox="' + e.vb + '" fill="currentColor"><path d="' + e.d + '"/></svg>';
  const open = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64" fill="currentColor">';
  switch(key){
    case 'hunter':
      return open + '<path d="M12 34 C 12 14 22 6 32 6 C 42 6 52 14 52 34 L 52 40 L 12 40 Z"/><rect x="6" y="40" width="52" height="8" rx="2"/>' +
        '<rect x="29" y="12" width="6" height="28" fill="#0c1210"/><rect x="16" y="22" width="14" height="6" fill="#0c1210"/><rect x="34" y="22" width="14" height="6" fill="#0c1210"/></svg>';
    case 'tatooine':
      return open + '<circle cx="24" cy="30" r="15"/><circle cx="42" cy="36" r="10" opacity="0.75"/><rect x="6" y="50" width="52" height="4" rx="2" opacity="0.4"/></svg>';
    case 'grogu':
      // v1.12.0 redraw, so it reads as Baby Yoda at badge size: wide drooping ears,
      // big eyes with a catch-light, robe collar
      return open +
        '<path d="M19 25 C 11 18 5 15 1 16 C 3 24 10 31 19 34 Z"/>' +
        '<path d="M45 25 C 53 18 59 15 63 16 C 61 24 54 31 45 34 Z"/>' +
        '<ellipse cx="32" cy="30" rx="15" ry="14"/>' +
        '<path d="M17 57 C 18 48 23 44 32 44 C 41 44 46 48 47 57 Z" opacity="0.72"/>' +
        '<path d="M26 44.5 L 32 52 L 38 44.5 Z" fill="#0c1210" opacity="0.55"/>' +
        '<ellipse cx="25.5" cy="29.5" rx="4.4" ry="5.2" fill="#0c1210"/><ellipse cx="38.5" cy="29.5" rx="4.4" ry="5.2" fill="#0c1210"/>' +
        '<circle cx="24.2" cy="27.6" r="1.5" fill="#eafff3"/><circle cx="37.2" cy="27.6" r="1.5" fill="#eafff3"/>' +
        '<path d="M29.5 37.5 Q 32 39 34.5 37.5" stroke="#0c1210" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>';
    default:
      return '';
  }
}

/* ---------------- APPEARANCE: looks, per-overlay colours, share codes (v1.13.0) ----
   A "look" is everything the Appearance tab controls, as one plain object:
     { borders:       { border, declutterBorder, rebirthReqBorder, sneakBorder, critGuideBorder, timersBorder },
       theme:         { themeBackdrop, ..., themeCompact, themeTextScale }   // all overlays
       overlayThemes: { declutter: { themeCompact: true }, ... } }         // per-overlay overrides
   Settings hold the same keys flat (plus settings.overlayThemes). Theme presets,
   saved custom presets and share codes are all looks. Every value that comes
   from outside (a pasted share code, the settings file) goes through
   sanitizeLook(), which keeps only known keys with valid values. */
const THEME_KEYS = ['themeBackdrop', 'themeBackdropAlpha', 'themeBox', 'themeBoxAlpha', 'themeHighlight', 'themeCompact', 'themeTextScale'];
const THEMED_OVERLAYS = ['overlay', 'declutter', 'rebirthReq', 'sneak', 'critGuide', 'timers'];
// Each overlay's border-skin settings key, and its default (main.js DEFAULT_SETTINGS
// agrees; test/skins.test.js checks). The timers had no skin before v1.13.0: null.
const DEFAULT_BORDERS = { border: 'jedi', declutterBorder: 'grogu', rebirthReqBorder: 'mando', sneakBorder: 'rebel', critGuideBorder: 'tatooine', timersBorder: null };
const OVERLAY_BORDER_KEY = { overlay: 'border', declutter: 'declutterBorder', rebirthReq: 'rebirthReqBorder', sneak: 'sneakBorder', critGuide: 'critGuideBorder', timers: 'timersBorder' };
const THEME_RANGES = { themeBackdropAlpha: [0.2, 0.95], themeBoxAlpha: [0, 0.5], themeTextScale: [0.8, 1.4] };

/** True if `v` is an allowed value for theme key `key` (null = "use the default"). */
function validThemeValue(key, v){
  if(v === null) return true;
  switch(key){
    case 'themeBackdrop': case 'themeBox': return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
    case 'themeHighlight': return v === 'border' || (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v));
    case 'themeCompact': return typeof v === 'boolean';
    default: {
      const r = THEME_RANGES[key];
      return !!r && typeof v === 'number' && Number.isFinite(v) && v >= r[0] && v <= r[1];
    }
  }
}

function cleanThemeObject(raw){
  const out = {};
  if(!raw || typeof raw !== 'object') return out;
  THEME_KEYS.forEach(k => { if(k in raw && raw[k] !== null && validThemeValue(k, raw[k])) out[k] = raw[k]; });
  return out;
}

/** A clean look from untrusted input: unknown keys dropped, bad values reset to default. Never throws. */
function sanitizeLook(raw){
  const src = (raw && typeof raw === 'object') ? raw : {};
  const b = (src.borders && typeof src.borders === 'object') ? src.borders : {};
  const borders = {};
  Object.keys(DEFAULT_BORDERS).forEach(k => {
    const v = b[k];
    borders[k] = (typeof v === 'string' && BORDER_SKINS[v]) ? v : (k === 'timersBorder' && v === null ? null : DEFAULT_BORDERS[k]);
  });
  const theme = {};
  const t = cleanThemeObject(src.theme);
  THEME_KEYS.forEach(k => { theme[k] = k in t ? t[k] : null; });
  const overlayThemes = {};
  const o = (src.overlayThemes && typeof src.overlayThemes === 'object') ? src.overlayThemes : {};
  THEMED_OVERLAYS.forEach(name => { const c = cleanThemeObject(o[name]); if(Object.keys(c).length) overlayThemes[name] = c; });
  return { borders, theme, overlayThemes };
}

/** The current look out of a settings object. */
function lookFromSettings(s){
  s = s || {};
  return sanitizeLook({
    borders: Object.fromEntries(Object.keys(DEFAULT_BORDERS).map(k => [k, k in s ? s[k] : DEFAULT_BORDERS[k]])),
    theme: Object.fromEntries(THEME_KEYS.map(k => [k, s[k] === undefined ? null : s[k]])),
    overlayThemes: s.overlayThemes
  });
}

/** The settings partial that applies a look (every key, so nothing from the old look lingers). */
function lookToSettings(look){
  const l = sanitizeLook(look);
  return { ...l.borders, ...l.theme, overlayThemes: l.overlayThemes };
}

/** A THEME_PRESETS entry as a look: one skin everywhere (timers too), no per-overlay overrides. */
function presetToLook(p){
  const borders = {};
  Object.keys(DEFAULT_BORDERS).forEach(k => { borders[k] = p.skin || DEFAULT_BORDERS[k]; });
  return sanitizeLook({ borders, theme: p.theme || {}, overlayThemes: {} });
}

function looksEqual(a, b){
  return JSON.stringify(lookToSettings(a)) === JSON.stringify(lookToSettings(b));
}

/** One overlay's effective theme: the all-overlays values, then its own overrides on top. */
function effectiveTheme(s, overlayName){
  const l = lookFromSettings(s);
  return { ...l.theme, ...(l.overlayThemes[overlayName] || {}) };
}

// Share codes: "FDT1." + base64 of {"n": name, "l": look}. UTF-8 safe (emoji names).
const LOOK_CODE_PREFIX = 'FDT1.';
function encodeLookCode(name, look){
  const json = JSON.stringify({ n: String(name || '').slice(0, 40), l: sanitizeLook(look) });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach(x => { bin += String.fromCharCode(x); });
  return LOOK_CODE_PREFIX + btoa(bin);
}
/** {name, look} from a pasted code, or null if it isn't a valid code. Never throws. */
function decodeLookCode(code){
  try{
    const str = String(code || '').replace(/\s+/g, '');
    if(!str.startsWith(LOOK_CODE_PREFIX) || str.length > 20000) return null;
    const bin = atob(str.slice(LOOK_CODE_PREFIX.length));
    const json = new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0)));
    const data = JSON.parse(json);
    if(!data || typeof data !== 'object' || !data.l || typeof data.l !== 'object') return null;
    const name = String(data.n || 'Shared look').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || 'Shared look';
    return { name, look: sanitizeLook(data.l) };
  }catch(e){
    return null;
  }
}

/* ---------------- OWNERSHIP HELPERS (moved from tracker.html, 2026-09-25) ----------------
   These four were the last pieces of core tracking logic still living
   inline in tracker.html, untested. Pure functions — no DOM, no storage I/O
   — so tracker.html's own setOwned()/clearCycleMarks()/cycleCoveredCount()
   now just call these and handle the storeSet()/render()/toast side effects
   around them. Behavior is unchanged; see test/requirements.test.js. */

/* How many of a cycle's 105 slots (35 levels x 3) are covered by ownedRank
   (global, keyed by name) at that slot's required rarity or better. */
/** Count how many of a cycle's 105 rebirth slots are covered by owned droids at the required rarity or better. Returns 0–105 integer. */
function cycleCoveredCount(cycle, ownedRank){
  let covered = 0;
  CYCLES[cycle].forEach(row=>{
    row.forEach(d=>{
      // Skip placeholder droids (code = "?") — same as cycleDroidKeys/
      // cycleCeilings/buildIndex, so this stays correct once real data
      // replaces the placeholders instead of relying on normKey("????")
      // happening to be an empty string nothing ever owns.
      if(d[0] === '?') return;
      const nk = normKey(canonicalName(d[1]));
      const owned = ownedRank[nk];
      if(owned !== undefined && rankOf(d[0]) <= owned) covered++;
    });
  });
  return covered;
}

/* The set of normKeys that appear anywhere in a cycle's requirement table. */
/** Get the Set of all normKeys that appear in a cycle's requirement table (used for clearing ownership on cycle completion). */
function cycleDroidKeys(cycle){
  const keys = new Set();
  CYCLES[cycle].forEach(row=>{
    row.forEach(d=>{
      // Skip placeholder droids (code = "?")
      if(d[0] === '?') return;
      keys.add(normKey(canonicalName(d[1])));
    });
  });
  return keys;
}

/* A NEW ownedRank object with every key belonging to this cycle's table
   deleted — does not mutate the object passed in, so the caller decides
   when (and whether) to commit the result to the real ownedRank/storage. */
/** Return a NEW ownedRank with all droids from this cycle deleted (for cycle completion). Does NOT mutate the input. */
function removeCycleMarks(cycle, ownedRank){
  const next = Object.assign({}, ownedRank);
  cycleDroidKeys(cycle).forEach(nk=>{ delete next[nk]; });
  return next;
}

/* Sneak Preview marks (v1.10.13) are held per target cycle in their own store
   key ('rebirth-heldMarks': {cycle -> {nk -> rank}}), NOT in ownedRank — so a
   droid held for the next cycle can't count toward the current one, and the
   current cycle's completion wipe (removeCycleMarks) can't erase it. When the
   target cycle becomes active, tracker.html folds them in with this. */
/** Merge held marks {nk -> rank} into ownedRank, raising (never lowering) each droid. Returns a NEW ownedRank; mutates neither input. */
function mergeHeldMarks(ownedRank, held){
  const next = Object.assign({}, ownedRank);
  Object.keys(held).forEach(nk=>{
    if(next[nk] === undefined || next[nk] < held[nk]) next[nk] = held[nk];
  });
  return next;
}

/* Safe to Retire marks (v1.10.13) live in 'rebirth-retired' ({cycle -> {nk ->
   the owned rank that was retired}}), never in ownedRank: removing ownership
   would un-cover that droid's past levels and the cycle could never reach
   full coverage again. Retiring records the colorway you had; logging a
   higher one afterwards is a new copy, so it shows as not retired. */
/** True when a Safe to Retire droid was retired at (or above) the colorway currently logged for it. */
function isRetired(retiredRank, ownedRank){
  return retiredRank !== undefined && retiredRank >= ownedRank;
}

/* The three-way click semantics every "claim a rarity" control in the app
   shares (main grid, A-Z pips, Rebirth Reqs panel):
     - clicking your current best again undoes it            -> 'clear'
     - nothing logged yet, or a genuine upgrade                -> 'set'
     - anything lower than what's already on record            -> 'blocked'
       (never silently downgrades a real claim from a stray click — the
       caller is expected to point the player at right-click instead) */
/** Decide the ownership action for a click: 'set' (upgrade/new), 'clear' (toggle off), or 'blocked' (downgrade prevented). Returns {action}. */
function decideOwnedUpdate(currentRank, requestedRank){
  if(currentRank === requestedRank) return { action:'clear' };
  if(currentRank === undefined || requestedRank > currentRank) return { action:'set' };
  return { action:'blocked' };
}

/* What Export produces and Import accepts: an object with an ownedRank map
   of normKey -> integer rarity rank in [0, RARITY_ORDER.length). */
/** Validate an import payload structure: {ownedRank: {normKey -> rank integer}}. Returns boolean. */
function isValidImportPayload(parsed){
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  if(!isObj(parsed) || !isObj(parsed.ownedRank)) return false;
  return !Object.values(parsed.ownedRank).some(r => !Number.isInteger(r) || r < 0 || r >= RARITY_ORDER.length);
}

/** Returns the count of real (non-placeholder) levels in a cycle. Stops at the first `"?"` placeholder. */
function cycleRealLevelCount(cycle){
  if(!CYCLES[cycle]) return 0;
  for(let l=0; l<CYCLES[cycle].length; l++){
    if(CYCLES[cycle][l][0][0] === '?') return l;
  }
  return CYCLES[cycle].length;
}

/** Returns the count of real (non-placeholder) droid slots in a cycle: cycleRealLevelCount(cycle) * 3. */
function cycleRealSlotCount(cycle){
  return cycleRealLevelCount(cycle) * 3;
}
