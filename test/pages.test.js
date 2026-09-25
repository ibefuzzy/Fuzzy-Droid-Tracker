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
      out.push({ name: src[1], external: true, code: src[1].includes('node_modules') ? null : fs.readFileSync(path.join(ROOT, src[1]), 'utf8') });
    } else {
      inline++;
      out.push({ name: `${page} inline script #${inline}`, external: false, code: m[2] });
    }
  }
  return out;
}

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
