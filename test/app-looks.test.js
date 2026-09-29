'use strict';
// App looks: the tracker window's own colours (APP_LOOKS in requirements.js, v1.15.0).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadShared, ROOT } = require('./helpers/load-shared');

const s = loadShared();
const LOOKS = s.run('APP_LOOKS');
const VAR_NAMES = s.run('APP_LOOK_VAR_NAMES');
const PRESETS = s.run('THEME_PRESETS');
const HEX = /^#[0-9a-f]{6}$/i;
const RGB = /^\d{1,3},\d{1,3},\d{1,3}$/;
const RGB_FIELDS = ['bg', 'accent', 'holo', 'glow', 'hi', 'surface', 'glow2'];
const HEX_FIELDS = ['panel', 'panel2', 'line', 'lineBright', 'text', 'textDim', 'accentDim'];

const TRACKER = fs.readFileSync(path.join(ROOT, 'tracker.html'), 'utf8');
const STYLE = TRACKER.slice(TRACKER.indexOf('<style>'), TRACKER.indexOf('</style>'));
const ROOT_CSS = STYLE.slice(STYLE.indexOf(':root{'), STYLE.indexOf('}', STYLE.indexOf(':root{')));
const rootVar = (name) => { const m = ROOT_CSS.match(new RegExp(name + ':\\s*([^;]+);')); return m && m[1].trim(); };

const rgbOf = (v) => (v.startsWith('#') ? [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) : v.split(',').map(Number));
const lum = (c) => { const [r, g, b] = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };

test('every app look has a unique key, a name and valid colours', () => {
  assert.equal(new Set(LOOKS.map((l) => l.key)).size, LOOKS.length, 'duplicate look key');
  assert.equal(LOOKS[0].key, 'default', 'the default look comes first (appLookFor falls back to it)');
  for (const l of LOOKS) {
    assert.ok(l.name && l.note, `${l.key}: needs a name and a note`);
    for (const f of RGB_FIELDS) {
      assert.match(l[f], RGB, `${l.key}.${f}`);
      assert.ok(rgbOf(l[f]).every((x) => x <= 255), `${l.key}.${f} out of range`);
    }
    for (const f of HEX_FIELDS) assert.match(l[f], HEX, `${l.key}.${f}`);
  }
});

test("the default look is exactly tracker.html's own colours", () => {
  const d = LOOKS[0];
  for (const [field, name] of Object.entries(VAR_NAMES)) {
    assert.ok(rootVar(name), `tracker.html :root doesn't declare ${name}`);
    assert.equal(rootVar(name).toLowerCase(), d[field].toLowerCase().replace(/,\s*/g, ','), `default.${field} != tracker.html ${name}`);
  }
  assert.equal(Object.keys(s.run('appLookCssVars')(d)).length, Object.keys(VAR_NAMES).length);
});

test('every look stays readable', () => {
  for (const l of LOOKS) {
    const bg = rgbOf(l.bg), panel = rgbOf(l.panel), surface = rgbOf(l.surface), accent = rgbOf(l.accent), holo = rgbOf(l.holo);
    assert.ok(contrast(rgbOf(l.text), panel) >= 7, `${l.key}: text on panels`);
    assert.ok(contrast(rgbOf(l.textDim), panel) >= 4.5, `${l.key}: dim text on panels`);
    assert.ok(contrast(accent, panel) >= 4.5, `${l.key}: "on" colour on panels`);
    assert.ok(contrast(rgbOf('#08130d'), accent) >= 4.5, `${l.key}: dark text on a lit chip (.warn-chip.on)`);
    // the console row labels: the chrome colour at 62% over the console fill
    const label = holo.map((x, i) => Math.round(x * 0.62 + surface[i] * 0.38));
    assert.ok(contrast(label, surface) >= 4.2, `${l.key}: console labels (${contrast(label, surface).toFixed(2)})`);
    assert.ok(contrast(bg, rgbOf('#ffffff')) > 12, `${l.key}: the page stays dark (the rarity colours are made for a dark page)`);
  }
});

test('overlay presets name a real app look; unknown keys fall back to the default', () => {
  const keys = new Set(LOOKS.map((l) => l.key));
  for (const p of PRESETS) assert.ok(keys.has(p.appLook), `${p.name}: appLook '${p.appLook}' isn't an app look`);
  assert.equal(s.run('appLookFor')('no-such-look').key, 'default');
  assert.equal(s.run('appLookFor')(undefined).key, 'default');
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const m = main.match(/^\s*appLook:\s*'(\w+)'/m);
  assert.ok(m && keys.has(m[1]), "main.js DEFAULT_SETTINGS.appLook isn't an app look");
});

test("tracker.html's CSS takes the themed colours from variables, never literals", () => {
  // a literal here would stay green/blue whatever look is picked
  const css = STYLE.replace(ROOT_CSS, '');
  for (const lit of ['rgba(143,214,255', 'rgba(94,242,166', 'rgba(9,14,20', 'rgba(11,15,13', 'rgba(79,184,255', 'rgba(200,230,255', 'rgba(94,150,242', '#8fd6ff', '#5ef2a6', '#0b0f0d']) {
    const re = new RegExp(lit.replace(/[()]/g, '\\$&').replace(/,/g, ',\\s*'), 'i');
    assert.ok(!re.test(css), `tracker.html's <style> hardcodes ${lit}; use the matching var (--holo-rgb, --accent-rgb, --surface-rgb, --bg-rgb, …)`);
  }
});
