'use strict';
/* ---------------------------------------------------------------------------
   spawn-parse.js (v1.14.0) — reads the game's droid-spawn lines out of OCR text,
   for the Spawn Alert overlay (spawn-alert.html). Pure functions, no DOM: loaded
   as a classic <script> by spawn-alert.html and require()d by
   test/spawn-parse.test.js (the fixture there is real OCR output from the game).

   A spawn line reads "<Type> Droid (<Tier>) spawned at the <Place>", e.g.
   "Diamond Droid (Rare) spawned at the Sandcrawler". The same corner of the
   screen also shows "<player> crafted a <Type> Droid", "<player> has reached
   Rebirth N" and the crafting-boost notice, and OCR of game text over a moving
   backdrop is noisy ("Bes kan Droid", "[Gommon]", "spaened"). So each line is
   squashed to lowercase letters only and matched FUZZILY against the only words
   that can appear: 7 types + "droid", 5 tiers, "spawn". A line counts only if
   all of them are there, in that order, with almost nothing in front of the
   type (a crafted line has "<player> crafted a" there, chat has "<name> (Game):").
--------------------------------------------------------------------------- */

const SPAWN_VARIANTS = ['gold', 'diamond', 'rainbow', 'beskar', 'galactic', 'stellar', 'kyber'];
const SPAWN_TIERS = ['common', 'rare', 'epic', 'legendary', 'mythic'];
// letters OCR puts in front of the line for the droid icon ("#&", "IKI", "RI")
const SPAWN_MAX_PREFIX = 4;

/** Best fuzzy occurrence of `pat` in text[from..to): {dist, start, end} (end exclusive). Sellers' algorithm. */
function spawnFuzzyFind(pat, text, from, to){
  const n = pat.length;
  let best = { dist: Infinity, start: -1, end: -1 };
  // col[i] = edit distance of pat[0..i) ending at the current text position; st[i] = where that match starts
  let col = [], st = [];
  for(let i = 0; i <= n; i++){ col.push(i); st.push(from); }
  for(let j = from; j < to; j++){
    const ncol = [0], nst = [j + 1];
    for(let i = 1; i <= n; i++){
      const sub = col[i - 1] + (pat[i - 1] === text[j] ? 0 : 1);
      const del = col[i] + 1;        // skip a text letter
      const ins = ncol[i - 1] + 1;   // skip a pattern letter
      if(sub <= del && sub <= ins){ ncol.push(sub); nst.push(i === 1 ? j : st[i - 1]); }
      else if(del <= ins){ ncol.push(del); nst.push(st[i]); }
      else { ncol.push(ins); nst.push(nst[i - 1]); }
    }
    col = ncol; st = nst;
    if(col[n] < best.dist){ best = { dist: col[n], start: st[n], end: j + 1 }; }
  }
  return best;
}

/** One OCR line -> {variant, tier} or null. */
function parseSpawnLine(line){
  const s = String(line || '').toLowerCase().replace(/[^a-z]/g, '');
  if(s.length < 16) return null;
  // the type, allowing 1 slip per 3 letters ("boshar", "rhinbow"); the closest one wins
  let v = null;
  for(const name of SPAWN_VARIANTS){
    const m = spawnFuzzyFind(name, s, 0, Math.min(s.length, SPAWN_MAX_PREFIX + name.length + 2));
    if(m.dist <= Math.floor(name.length / 3) && m.start <= SPAWN_MAX_PREFIX && (!v || m.dist / name.length < v.m.dist / v.name.length)) v = { name, m };
  }
  if(!v) return null;
  // then "droid" ("druid", "dror", "drold"), right after it
  const dr = spawnFuzzyFind('droid', s, v.m.end, Math.min(s.length, v.m.end + 7));
  if(dr.dist > 2 || dr.start > v.m.end + 1) return null;
  // the tier right after that ("commo", "coiumon"), allowing 1 slip per 3 letters
  let t = null;
  for(const name of SPAWN_TIERS){
    const m = spawnFuzzyFind(name, s, dr.end, Math.min(s.length, dr.end + name.length + 3));
    if(m.dist <= Math.floor(name.length / 3) && m.start <= dr.end + 2 && (!t || m.dist / name.length < t.m.dist / t.name.length)) t = { name, m };
  }
  if(!t) return null;
  // then "spawn" ("spaen", "spaw", "spayned")
  const sp = spawnFuzzyFind('spawn', s, t.m.end, Math.min(s.length, t.m.end + 9));
  if(sp.dist > 1 || sp.start > t.m.end + 3) return null;
  return { variant: v.name, tier: t.name };
}

/** All spawn lines in an OCR text block, top to bottom. OCR sometimes breaks a
    line in two ("# Rain" / "bow Droid (Common) spawned..."), so a line that
    isn't a spawn is also tried joined to the next one (when that isn't one either). */
function parseSpawnText(text){
  const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for(let i = 0; i < lines.length; i++){
    const one = parseSpawnLine(lines[i]);
    if(one){ out.push(one); continue; }
    if(i + 1 < lines.length && !parseSpawnLine(lines[i + 1])){
      const two = parseSpawnLine(lines[i] + ' ' + lines[i + 1]);
      if(two){ out.push(two); i++; }
    }
  }
  return out;
}

/* Which spawns are NEW. The same line stays on screen for many reads, and a read
   now and then misses a line, so each "<type>|<tier>" key remembers the most
   copies seen at once and when it was last seen. More copies than that = new
   spawns; a key not seen for forgetMs is dropped (the line has gone), so a later
   spawn of the same kind alerts again. */
function createSpawnTracker(forgetMs){
  const FORGET = forgetMs || 20000;
  const mem = new Map(); // key -> { count, last }
  return {
    /** spawns: [{variant, tier}] from one read at time `now` (ms) -> the new ones. */
    update(spawns, now){
      const counts = new Map();
      spawns.forEach(sp => { const k = sp.variant + '|' + sp.tier; counts.set(k, (counts.get(k) || 0) + 1); });
      mem.forEach((m, k) => { if(now - m.last > FORGET) mem.delete(k); });
      const fresh = [];
      counts.forEach((c, k) => {
        const m = mem.get(k) || { count: 0, last: now };
        for(let i = m.count; i < c; i++){ const [variant, tier] = k.split('|'); fresh.push({ variant, tier }); }
        mem.set(k, { count: Math.max(m.count, c), last: now });
      });
      return fresh;
    },
    reset(){ mem.clear(); }
  };
}

/* Which spawns alert (⚙ Overlay Settings → Filters → 📡 Spawn Alert, v1.14.0).
   settings.spawnAlertRules maps "<type>|<tier>" to 0 = off, 1 = show, 2 = show +
   sound. Only non-default entries are stored; anything missing or invalid = show. */
const SPAWN_RULE_OFF = 0, SPAWN_RULE_SHOW = 1, SPAWN_RULE_SOUND = 2;
function spawnRuleFor(rules, variant, tier){
  const v = rules && typeof rules === 'object' ? rules[variant + '|' + tier] : undefined;
  return v === SPAWN_RULE_OFF || v === SPAWN_RULE_SOUND ? v : SPAWN_RULE_SHOW;
}
/** A rules object with only valid, non-default entries (what the tracker saves). */
function cleanSpawnRules(rules){
  const out = {};
  SPAWN_VARIANTS.forEach(v => SPAWN_TIERS.forEach(t => {
    const r = spawnRuleFor(rules, v, t);
    if(r !== SPAWN_RULE_SHOW) out[v + '|' + t] = r;
  }));
  return out;
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { SPAWN_VARIANTS, SPAWN_TIERS, spawnFuzzyFind, parseSpawnLine, parseSpawnText, createSpawnTracker,
    SPAWN_RULE_OFF, SPAWN_RULE_SHOW, SPAWN_RULE_SOUND, spawnRuleFor, cleanSpawnRules };
}
