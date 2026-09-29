/* Guards against the two ways a page's shared scripts break each other:

   1. A top-level let/const/class declared in two classic scripts on the same
      page is a SyntaxError that stops the whole second script. This test
      loads each page's scripts in order into one vm context, the way the
      browser does, and fails on any SyntaxError. Runtime errors (no DOM,
      no window.overlayAPI) are expected and ignored: the redeclaration
      check happens before any code runs.

   2. A `function` redeclared by a later script is NOT an error; it silently
      replaces the shared one. That is how tracker.html's private copies of
      requirements.js logic drifted apart (v1.7.4 SELL bug). Any page that
      loads requirements.js must not redefine its functions. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./helpers/load-shared');

const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

function scriptsOf(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  let inline = 0;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (src) {
      const file = path.join(ROOT, src[1]);
      const missing = !src[1].includes('node_modules') && !fs.existsSync(file);
      out.push({ name: src[1], external: true, missing, code: (src[1].includes('node_modules') || missing) ? null : fs.readFileSync(file, 'utf8') });
    } else {
      inline++;
      out.push({ name: `${page} inline script #${inline}`, external: false, code: m[2] });
    }
  }
  return out;
}

// v1.10.9 was published with 5 pages loading card-icons-data.js, a generated
// file that never made it into the repo — the exe was fine (built from the
// local folder), but the source on GitHub was incomplete.
test('every local <script src> a page loads exists in the project', () => {
  const missing = PAGES.flatMap((p) => scriptsOf(p).filter((s) => s.missing).map((s) => `${p} -> ${s.name}`));
  assert.deepEqual(missing, [], `pages load scripts that aren't in the project: ${missing.join(', ')}`);
});

const SHARED_FUNCS = [...fs.readFileSync(path.join(ROOT, 'requirements.js'), 'utf8').matchAll(/^function\s+(\w+)\s*\(/gm)].map((m) => m[1]);

test('requirements.js exposes the functions the pages rely on', () => {
  for (const fn of ['normKey', 'canonicalName', 'buildIndex', 'cycleCeilings', 'cycleLastNeededLevel', 'getUpcomingLevels', 'getDeclutterList', 'getSneakPreview']) {
    assert.ok(SHARED_FUNCS.includes(fn), fn);
  }
});

for (const page of PAGES) {
  test(`${page}: scripts load together without a redeclaration SyntaxError`, () => {
    const ctx = vm.createContext({ console });
    for (const s of scriptsOf(page)) {
      if (s.code === null) continue; // vendored library (tesseract), not ours
      try {
        vm.runInContext(s.code, ctx, { filename: s.name });
      } catch (e) {
        if (e && e.name === 'SyntaxError') assert.fail(`${s.name}: ${e.message}`);
        // anything else is a runtime error from missing DOM/Electron APIs; fine here
      }
    }
  });
}

for (const page of PAGES) {
  const scripts = scriptsOf(page);
  const reqIdx = scripts.findIndex((s) => s.name === 'requirements.js');
  if (reqIdx < 0) continue;
  test(`${page}: loads droid-data.js before requirements.js and never redefines its functions`, () => {
    const dataIdx = scripts.findIndex((s) => s.name === 'droid-data.js');
    assert.ok(dataIdx >= 0 && dataIdx < reqIdx, 'droid-data.js must load first');
    for (const s of scripts) {
      if (s.name === 'requirements.js' || s.code === null) continue;
      for (const m of s.code.matchAll(/^\s*(?:async\s+)?function\s+(\w+)\s*\(/gm)) {
        assert.ok(!SHARED_FUNCS.includes(m[1]), `${s.name} redefines ${m[1]}() from requirements.js`);
      }
    }
  });
}

test('tracker.html has every element id the settings scripts look up, exactly once', () => {
  // The settings panel layout can be rearranged freely as long as this holds:
  // overlay-controls.js wires every control by id, so a missing or duplicated
  // id silently breaks that control.
  const html = fs.readFileSync(path.join(ROOT, 'tracker.html'), 'utf8');
  for (const f of ['overlay-controls.js', 'settings-tabs.js']) {
    const file = path.join(ROOT, f);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    for (const [, id] of src.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)) {
      const n = (html.match(new RegExp(`\\bid="${id}"`, 'g')) || []).length;
      assert.equal(n, 1, `${f} looks up #${id}, and tracker.html has it ${n} time(s)`);
    }
  }
  for (const key of ['declutterShowDefault', 'declutterShowRare', 'declutterShowEpic', 'declutterShowLegendary', 'declutterShowMythic']) {
    // count buttons only; the stylesheet also mentions these keys in selectors
    assert.equal((html.match(new RegExp(`<button[^>]*data-tier-key="${key}"`, 'g')) || []).length, 1, key);
  }
});

/* v1.10.14: every droid overlay takes its backdrop/box/highlight/icon size from
   overlay-theme.css variables, which is how a theme setting reaches all of them.
   A literal color pasted back into one page would silently opt that overlay out. */
const THEMED_OVERLAYS = ['overlay.html', 'declutter.html', 'rebirth-requirements-overlay.html', 'sneak-preview.html', 'crit-guide-overlay.html', 'spawn-alert.html'];
test('droid overlays link overlay-theme.css before their own styles and use its variables', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'overlay-theme.css')), 'overlay-theme.css is missing');
  for (const page of THEMED_OVERLAYS) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const link = html.indexOf('href="overlay-theme.css"');
    assert.ok(link >= 0, `${page} doesn't link overlay-theme.css`);
    assert.ok(link < html.indexOf('<style>'), `${page} must link overlay-theme.css BEFORE its own <style>, so the page can override a default`);
    assert.ok(!/rgba\(\s*10\s*,\s*14\s*,\s*12/.test(html), `${page} has a literal backdrop color; use rgba(var(--ov-backdrop-rgb), var(--ov-backdrop-alpha))`);
    assert.ok(!/\.d-icon-wrap\{[^}]*rgba\(\s*255\s*,\s*255\s*,\s*255/.test(html), `${page} has a literal droid-box color; use rgba(var(--ov-box-rgb), var(--ov-box-alpha))`);
    assert.ok(!/\.d-cell\.selected\s*\{[^}]*rgba\(\s*\d/.test(html), `${page} has a literal highlight color; use rgba(var(--ov-highlight-rgb), ...)`);
    // the corner resize grip + size-driven zoom live in overlay-theme.js
    assert.ok(scriptsOf(page).some((s) => s.name === 'overlay-theme.js'), `${page} doesn't load overlay-theme.js (no resize grip or zoom)`);
  }
  // The HUD's four level blocks always fill its window, so it zooms to fit
  // both dimensions; the lists zoom by width and scroll for height.
  assert.ok(/<html[^>]*data-ov-zoom="fit"/.test(fs.readFileSync(path.join(ROOT, 'overlay.html'), 'utf8')), 'overlay.html lost data-ov-zoom="fit"');
});

/* v1.10.14 RULE: overlay windows never use Windows' own drag (-webkit-app-region).
   They move through overlay-drag.js, so main.js places them and keeps each wholly
   on one monitor. Windows' drag let an overlay straddle two monitors, and Windows
   then drew the part on the second monitor again on the first (a moving "mirror").
   A page with a drag bar must load overlay-drag.js, or it can't be moved at all. */
test('overlay windows move via overlay-drag.js, never -webkit-app-region', () => {
  const styled = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') || f.endsWith('.css'));
  for (const f of styled) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/-webkit-app-region\s*:/.test(src), `${f} uses -webkit-app-region; move the window through overlay-drag.js instead (see OVERLAY_WINDOWS in main.js)`);
  }
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    if (!/id="dragHandle"/.test(html)) continue;
    assert.ok(scriptsOf(page).some((s) => s.name === 'overlay-drag.js'), `${page} has a drag bar (#dragHandle) but doesn't load overlay-drag.js, so it can't be moved`);
  }
});

// v1.14.0: the Spawn Alert reads the screen itself, so it needs the line reader,
// the OCR engine, and requirements.js for its border skin.
test('spawn-alert.html loads spawn-parse.js, Tesseract and requirements.js', () => {
  const names = scriptsOf('spawn-alert.html').map((s) => s.name);
  for (const n of ['requirements.js', 'spawn-parse.js', 'tesseract.min.js']) assert.ok(names.some((s) => s === n || s.endsWith('/' + n)), `spawn-alert.html doesn't load ${n}`);
});

// v1.14.3: the toolbar's overlay switchboard. Each tile keeps a fixed name and shows
// on/off with its light, so a click never changes its width. Setting a tile's text
// from a script would wipe the light (and bring the width changes back).
test('toolbar overlay tiles have a name and a light, and no script rewrites their text', () => {
  const html = fs.readFileSync(path.join(ROOT, 'tracker.html'), 'utf8');
  const tiles = [...html.matchAll(/<button class="btn tile" id="(\w+)"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.ok(tiles.length >= 8, `expected the 8 overlay tiles in tracker.html, found ${tiles.length}`);
  for (const [, id, inner] of tiles) {
    assert.ok(/class="tile-name"/.test(inner) && /class="led"/.test(inner), `#${id} needs a .tile-name and a .led`);
  }
  assert.ok(/\.overlay-board \.tile\[hidden\]\s*\{\s*display:\s*none/.test(html), 'tracker.html lost `.overlay-board .tile[hidden]{display:none}` (the tile display:flex rule beats .btn[hidden])');
  const ids = tiles.map((t) => t[1]);
  for (const f of PROJECT_JS_AND_HTML) {
    const src = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*document\.getElementById\('(\w+)'\)/g)) {
      if (!ids.includes(m[2])) continue;
      assert.ok(!new RegExp(`\\b${m[1]}\\.(textContent|innerText|innerHTML)\\s*=`).test(src), `${f} sets the text of tile #${m[2]}; flip its .on class instead (setTile in overlay-controls.js)`);
    }
    for (const id of ids) {
      assert.ok(!new RegExp(`getElementById\\('${id}'\\)\\.(textContent|innerText|innerHTML)\\s*=`).test(src), `${f} sets the text of tile #${id}`);
    }
  }
});

test('tracker.html uses the shared requirements.js', () => {
  assert.ok(scriptsOf('tracker.html').some((s) => s.name === 'requirements.js'));
});

/* 3. A shared function's signature can change (gain a required parameter)
   without any redeclaration at all — a stale call site elsewhere then
   silently passes too few arguments (the missing one is just `undefined`),
   which throws at RUNTIME instead of failing anything above. This is
   exactly how the v1.9.0 regression happened: cycleCoveredCount() gained
   an ownedRank parameter, every call site inside tracker.html's own inline
   script was updated, but rebirth-screen-read.js — a separate file loaded
   via <script src>, never scanned for this — still called it with one
   argument, so clicking "Apply" on the Read Rebirth Screen confirm dialog
   threw immediately (ownedRank[nk] on undefined) and did nothing. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}
function arityOf(src, name) {
  const m = new RegExp(`function\\s+${name}\\s*\\(([^)]*)\\)`).exec(src);
  if (!m) return null;
  const params = m[1].trim();
  return params ? params.split(',').length : 0;
}
function callArgCounts(src, name) {
  const counts = [];
  const callRe = new RegExp(`(?<!function )\\b${name}\\s*\\(`, 'g');
  let m;
  while ((m = callRe.exec(src))) {
    let i = m.index + m[0].length; // just past the opening (
    let depth = 1;
    const argStart = i;
    let commas = 0;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) break; }
      else if (c === ',' && depth === 1) commas++;
    }
    const argsText = src.slice(argStart, i).trim();
    counts.push(argsText ? commas + 1 : 0);
  }
  return counts;
}

const REQ_SRC = fs.readFileSync(path.join(ROOT, 'requirements.js'), 'utf8');
const ARITY_CHECKED = [
  'cycleCoveredCount', 'cycleDroidKeys', 'removeCycleMarks', 'decideOwnedUpdate',
  'isValidImportPayload', 'getDeclutterList', 'getSneakPreview', 'getUpcomingLevels',
  'getLevelRequirements', 'cycleCeilings', 'cycleLastNeededLevel', 'borderIconSvg',
  'cycleRealLevelCount', 'cycleRealSlotCount', 'mergeHeldMarks', 'isRetired',
];
const PROJECT_JS_AND_HTML = fs.readdirSync(ROOT).filter((f) => {
  if (!(f.endsWith('.js') || f.endsWith('.html'))) return false;
  return fs.statSync(path.join(ROOT, f)).isFile();
});

test('every call site of a shared requirements.js function passes the right number of arguments', () => {
  for (const name of ARITY_CHECKED) {
    const arity = arityOf(stripComments(REQ_SRC), name);
    assert.ok(arity !== null, `${name} not found in requirements.js`);
    for (const f of PROJECT_JS_AND_HTML) {
      const src = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      for (const n of callArgCounts(src, name)) {
        assert.equal(n, arity, `${f} calls ${name}() with ${n} argument(s), but requirements.js declares ${arity}`);
      }
    }
  }
});

/* Guards against a real incident on the sibling web-tracker repo
   (ibefuzzy/ibefuzzy.github.io, 2026-09-26): a regeneration script wrote
   fresh icon data for the level-40 expansion into a NEW, never-loaded
   `const CARD_ICONS = {...}` object appended after the real `const ICONS =
   {...}`, instead of updating it. Nothing threw (two top-level consts in one
   file is valid JS) and most rows kept working (the old object was still
   there), so it went undetected until someone actually executed the file
   and checked what ICONS really contained. This repo's own icons-data.js
   currently has exactly one, correctly-named object — this test keeps it
   that way, so if a future regeneration ever makes the same mistake here,
   it fails loudly instead of shipping silently. */
test('icons-data.js declares exactly one top-level const, named ICONS', () => {
  const src = stripComments(fs.readFileSync(path.join(ROOT, 'icons-data.js'), 'utf8'));
  const topLevelConsts = [...src.matchAll(/^const\s+([A-Za-z_$][\w$]*)\s*=/gm)];
  assert.equal(topLevelConsts.length, 1,
    `icons-data.js has ${topLevelConsts.length} top-level const declarations ` +
    `(${topLevelConsts.map((m) => m[1]).join(', ')}) — a second one is almost ` +
    `certainly orphaned data nothing loads (see comment above this test)`);
  assert.equal(topLevelConsts[0][1], 'ICONS', 'the one top-level const must be named ICONS — every window reads that name');
});

/* Guards against a real incident found during the 2026-09-27 full-project
   bug sweep: when Kyber ("Y") was added to RARITY_ORDER for the level-40
   expansion, every CSS rule and JS color map keyed by rarity code across
   tracker.html/overlay.html/declutter.html/rebirth-requirements-overlay.html/
   sneak-preview.html needed a new entry added by hand, and several were
   missed entirely (no --r-kyber variable, no .rarity-kyber gradient,
   DOT_COLOR maps silently falling back to Base gray, tracker.html's Rebirth
   Reqs panel looping `rank<=6` and dropping every Kyber-ceiling droid from
   the panel outright). None of this threw an error or failed an existing
   test - it just rendered wrong or went missing silently. This test
   re-derives the CSS class names requirements.js's own RARITY_ORDER implies
   and confirms every rarity code has them in tracker.html, so the next tier
   added above Kyber can't repeat this by simply forgetting a spot. */
test('tracker.html has CSS coverage for every rarity code in RARITY_ORDER', () => {
  const { loadShared } = require('./helpers/load-shared');
  const s = loadShared();
  const RARITY_ORDER = s.run('RARITY_ORDER');
  const trackerSrc = fs.readFileSync(path.join(ROOT, 'tracker.html'), 'utf8');
  for (const code of RARITY_ORDER) {
    for (const selector of [`.pip.filled.${code}`, `.droid-cell.${code}`, `.rebirth-tier-label.${code}`, `.rb-name.${code}`]) {
      assert.ok(trackerSrc.includes(selector + '{'), `tracker.html is missing the "${selector}" CSS rule for rarity code "${code}"`);
    }
  }
  // The Rebirth Reqs panel's tier loop and the always-visible legend must
  // cover every rank, not a hardcoded count that stops matching RARITY_ORDER's
  // actual length the next time a tier is added.
  assert.ok(!/for\(let rank=0; rank<=\d+; rank\+\+\)/.test(stripComments(trackerSrc)),
    'renderRebirthPanel\'s tier loop looks hardcoded to a fixed rank count again - it should iterate RARITY_ORDER.length');
  assert.ok(!/const order = \[("[A-Z]",?)+\]/.test(stripComments(trackerSrc)),
    'renderLegend\'s tier order looks hardcoded to a fixed rarity-code list again - it should just be RARITY_ORDER');
});
