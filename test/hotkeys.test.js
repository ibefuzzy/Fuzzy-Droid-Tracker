'use strict';
/* Every hotkey is wired in five places (v1.18.1 added three: Next / Previous / Finish cycle):
   main.js HOTKEY_SETTINGS_KEY (name -> settings key), HOTKEY_HANDLERS (what it does),
   HOTKEY_LABELS (its name in notices) and DEFAULT_SETTINGS (unbound by default), plus
   overlay-controls.js HOTKEY_BUTTONS (the rebind button in ⚙ → Keybinds, which needs its
   <button> in tracker.html) and hotkey-list.html ROWS (the on-screen list; main.js sizes that
   window by counting bound hotkeys, so a missing row leaves a blank gap). These must agree. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const MAIN = read('main.js');

// the text of `const NAME = {` ... the next line that is exactly "};"
function block(src, name) {
  const at = src.indexOf('const ' + name + ' = {');
  assert.ok(at >= 0, name + ' not found');
  const end = src.indexOf('\n};', at);
  return src.slice(at, end);
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
const keysOf = (b) => [...stripComments(b).matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]).filter((k) => k !== 'const');
const sorted = (a) => [...new Set(a)].sort();

const SETTINGS_KEY = Object.fromEntries([...stripComments(block(MAIN, 'HOTKEY_SETTINGS_KEY')).matchAll(/(\w+)\s*:\s*'(\w+)'/g)].map((m) => [m[1], m[2]]));
const NAMES = sorted(Object.keys(SETTINGS_KEY));
const SETTING_KEYS = sorted(Object.values(SETTINGS_KEY));

test('every hotkey has a handler and a label in main.js', () => {
  assert.ok(NAMES.length >= 40, `only ${NAMES.length} hotkeys found`);
  assert.deepStrictEqual(sorted(keysOf(block(MAIN, 'HOTKEY_HANDLERS'))), NAMES);
  assert.deepStrictEqual(sorted(keysOf(block(MAIN, 'HOTKEY_LABELS'))), NAMES);
});

test('every hotkey setting has a default, and it is unbound', () => {
  const defaults = stripComments(block(MAIN, 'DEFAULT_SETTINGS'));
  for (const k of SETTING_KEYS) {
    const m = defaults.match(new RegExp('\\b' + k + "\\s*:\\s*'([^']*)'"));
    assert.ok(m, `${k} missing from DEFAULT_SETTINGS`);
    assert.strictEqual(m[1], '', `${k} should be unbound by default (v1.16.0)`);
  }
});

test('every hotkey has a rebind button in ⚙ → Keybinds', () => {
  const oc = read('overlay-controls.js');
  const at = oc.indexOf('const HOTKEY_BUTTONS = [');
  assert.ok(at >= 0, 'HOTKEY_BUTTONS not found');
  const table = oc.slice(at, oc.indexOf('].map(', at));
  const rows = [...stripComments(table).matchAll(/\[\s*'(\w+)'\s*,\s*'(\w+)'\s*,\s*['"]/g)].map((m) => ({ id: m[1], key: m[2] }));
  assert.deepStrictEqual(sorted(rows.map((r) => r.key)), SETTING_KEYS);
  const html = read('tracker.html');
  for (const r of rows) assert.strictEqual(html.split(`id="${r.id}"`).length - 1, 1, `tracker.html needs exactly one #${r.id}`);
});

test('every hotkey has a row in the on-screen hotkey list', () => {
  const keys = [...read('hotkey-list.html').matchAll(/\{\s*key:\s*'(\w+)'/g)].map((m) => m[1]);
  assert.deepStrictEqual(sorted(keys), SETTING_KEYS);
});

test('the v1.18.1 cycle keys go to the tracker window only', () => {
  const handlers = block(MAIN, 'HOTKEY_HANDLERS');
  for (const n of ['cycleNext', 'cyclePrev', 'finishCycle']) {
    assert.match(handlers, new RegExp(n + ":\\s*\\(\\)\\s*=>\\s*sendToTracker\\('" + n + "'\\)"));
  }
});
