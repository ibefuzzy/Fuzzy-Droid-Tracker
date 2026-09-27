'use strict';
// Border skins + theme presets (requirements.js, v1.12.0).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadShared, ROOT } = require('./helpers/load-shared');

const s = loadShared();
const SKINS = s.run('BORDER_SKINS');
const ORDER = s.run('BORDER_SKIN_ORDER');
const PRESETS = s.run('THEME_PRESETS');
const icon = s.run('borderIconSvg');
const HEX = /^#[0-9a-f]{6}$/i;

test('every skin is listed once, and every listed skin exists', () => {
  assert.equal(new Set(ORDER).size, ORDER.length, 'duplicate key in BORDER_SKIN_ORDER');
  assert.deepEqual([...ORDER].sort(), Object.keys(SKINS).sort());
});

test('each skin has a colour whose hex and rgb agree, a label, and an emblem', () => {
  for (const key of ORDER) {
    const sk = SKINS[key];
    assert.match(sk.hex, HEX, key);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(sk.hex.slice(i, i + 2), 16));
    assert.equal(sk.rgb, `${r},${g},${b}`, `${key}: rgb doesn't match hex`);
    assert.ok(sk.label, `${key}: no label`);
    const svg = icon(key, 18);
    assert.match(svg, /^<svg width="18" height="18" viewBox="[\d. ]+" fill="currentColor">.*<\/svg>$/, `${key}: bad emblem`);
    assert.match(svg, /<(path|circle|ellipse|rect) /, `${key}: emblem draws nothing`);
  }
  assert.equal(icon('no-such-skin', 18), '', 'an unknown or stale key renders nothing instead of throwing');
});

test("players' saved skins and main.js's defaults still exist (keys never change)", () => {
  for (const key of ['rebel', 'empire', 'jedi', 'mando', 'hunter', 'tatooine', 'grogu']) assert.ok(SKINS[key], key);
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const defaults = [...main.matchAll(/^\s*(?:border|\w+Border):\s*'(\w+)'/gm)].map((m) => m[1]);
  assert.equal(defaults.length, 6, 'expected the 6 overlay border defaults in DEFAULT_SETTINGS (v1.14.0 added spawnAlertBorder)');
  for (const key of defaults) assert.ok(SKINS[key], `DEFAULT_SETTINGS border '${key}' isn't a skin`);
});

test('theme presets point at real skins and valid colours', () => {
  const THEME_KEYS = ['themeBackdrop', 'themeBackdropAlpha', 'themeBox', 'themeBoxAlpha', 'themeHighlight'];
  assert.equal(new Set(PRESETS.map((p) => p.name)).size, PRESETS.length, 'duplicate preset name');
  assert.ok(PRESETS.some((p) => p.skin === null && Object.keys(p.theme).length === 0), 'a "back to default" preset');
  for (const p of PRESETS) {
    assert.ok(p.skin === null || SKINS[p.skin], `${p.name}: unknown skin ${p.skin}`);
    for (const [k, v] of Object.entries(p.theme)) {
      assert.ok(THEME_KEYS.includes(k), `${p.name}: unknown theme key ${k}`);
      if (k === 'themeBackdrop' || k === 'themeBox') assert.match(v, HEX, `${p.name}.${k}`);
      if (k === 'themeHighlight') assert.ok(v === 'border' || HEX.test(v), `${p.name}.${k}`);
      // the same ranges as the Appearance tab's sliders
      if (k === 'themeBackdropAlpha') assert.ok(v >= 0.2 && v <= 0.95, `${p.name}.${k}`);
      if (k === 'themeBoxAlpha') assert.ok(v >= 0 && v <= 0.5, `${p.name}.${k}`);
    }
  }
});
