'use strict';
// Looks, per-overlay colours and share codes (requirements.js, v1.13.0).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadShared, ROOT } = require('./helpers/load-shared');

const s = loadShared();
const fn = (name) => s.run(name);
const sanitizeLook = fn('sanitizeLook');
const lookFromSettings = fn('lookFromSettings');
const lookToSettings = fn('lookToSettings');
const presetToLook = fn('presetToLook');
const looksEqual = fn('looksEqual');
const effectiveTheme = fn('effectiveTheme');
const encodeLookCode = fn('encodeLookCode');
const decodeLookCode = fn('decodeLookCode');
const DEFAULT_BORDERS = s.run('DEFAULT_BORDERS');
const THEME_PRESETS = s.run('THEME_PRESETS');
const plain = (o) => JSON.parse(JSON.stringify(o)); // vm-realm objects -> this realm, for deepEqual

test('DEFAULT_BORDERS agrees with main.js DEFAULT_SETTINGS', () => {
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  for (const [k, v] of Object.entries(DEFAULT_BORDERS)) {
    const m = new RegExp(`^\\s*${k}:\\s*('(\\w+)'|null)`, 'm').exec(main);
    assert.ok(m, `${k} missing from DEFAULT_SETTINGS`);
    assert.equal(m[2] || null, v, k);
  }
});

test('an untouched install is the default look, and every overlay keeps its own colours', () => {
  const look = plain(lookFromSettings({}));
  assert.deepEqual(look.borders, plain(DEFAULT_BORDERS));
  assert.ok(Object.values(look.theme).every((v) => v === null));
  assert.deepEqual(look.overlayThemes, {});
  assert.ok(looksEqual(look, presetToLook(THEME_PRESETS.find((p) => p.skin === null))), '"Default look" matches a fresh install');
});

test('sanitizeLook keeps valid values and drops everything else', () => {
  const l = plain(sanitizeLook({
    borders: { border: 'sith', declutterBorder: 'no-such-skin', timersBorder: null, evil: 'x' },
    theme: { themeBackdrop: '#123456', themeBox: 'red; background:url(x)', themeBoxAlpha: 9, themeHighlight: 'border',
             themeCompact: 'yes', themeTextScale: 1.2, unknown: 1 },
    overlayThemes: { declutter: { themeCompact: false, themeBackdrop: 'nope' }, notAnOverlay: { themeCompact: true }, sneak: {} }
  }));
  assert.equal(l.borders.border, 'sith');
  assert.equal(l.borders.declutterBorder, DEFAULT_BORDERS.declutterBorder, 'unknown skin -> default');
  assert.equal(l.borders.timersBorder, null);
  assert.ok(!('evil' in l.borders));
  assert.equal(l.theme.themeBackdrop, '#123456');
  assert.equal(l.theme.themeBox, null, 'CSS injection attempt rejected');
  assert.equal(l.theme.themeBoxAlpha, null, 'out of range');
  assert.equal(l.theme.themeHighlight, 'border');
  assert.equal(l.theme.themeCompact, null, 'not a boolean');
  assert.equal(l.theme.themeTextScale, 1.2);
  assert.ok(!('unknown' in l.theme));
  assert.deepEqual(l.overlayThemes, { declutter: { themeCompact: false } }, 'only real overlays and valid values; empty ones dropped');
  assert.doesNotThrow(() => sanitizeLook(null));
  assert.doesNotThrow(() => sanitizeLook('garbage'));
});

test("one overlay's own colours go on top of the all-overlays values", () => {
  const settings = { themeBackdrop: '#111111', themeCompact: true, overlayThemes: { declutter: { themeBackdrop: '#222222', themeCompact: false } } };
  assert.equal(effectiveTheme(settings, 'declutter').themeBackdrop, '#222222');
  assert.equal(effectiveTheme(settings, 'declutter').themeCompact, false, 'can opt out of an all-overlays Compact');
  assert.equal(effectiveTheme(settings, 'sneak').themeBackdrop, '#111111');
  assert.equal(effectiveTheme(settings, 'sneak').themeCompact, true);
});

test('a look survives settings -> look -> settings unchanged', () => {
  const settings = { ...DEFAULT_BORDERS, border: 'grogu', timersBorder: 'sith', themeBackdrop: '#0f1a0f', themeBackdropAlpha: 0.7, themeBox: null,
    themeBoxAlpha: null, themeHighlight: '#b8ff8a', themeCompact: null, themeTextScale: 1.1,
    themeBg: 'hyperspace', themeBgStrength: 0.6, themeBgColor: 'border', themeBgMotion: true, themeBgSpeed: 1.4,
    overlayThemes: { timers: { themeBackdrop: '#000000', themeBg: 'none' } } };
  assert.deepEqual(plain(lookToSettings(lookFromSettings(settings))), settings);
});

test('presets put one skin on every overlay, the timers included, and clear per-overlay colours', () => {
  const l = plain(presetToLook(THEME_PRESETS.find((p) => p.name === 'Sith')));
  assert.ok(Object.values(l.borders).every((b) => b === 'sith'));
  assert.deepEqual(l.overlayThemes, {});
});

test('share codes round-trip, names included (emoji too)', () => {
  const look = lookFromSettings({ border: 'mando', timersBorder: 'mando', themeBackdrop: '#15120e', overlayThemes: { overlay: { themeTextScale: 1.3 } } });
  const code = encodeLookCode('Beskar 🛡', look);
  assert.match(code, /^FDT1\.[A-Za-z0-9+/=]+$/);
  const got = decodeLookCode('  ' + code.slice(0, 20) + '\n' + code.slice(20) + '  '); // pasted with line breaks
  assert.equal(got.name, 'Beskar 🛡');
  assert.ok(looksEqual(got.look, look));
});

test('bad or hostile share codes are refused or cleaned, never thrown', () => {
  for (const bad of ['', 'hello', 'FDT1.', 'FDT1.!!!notbase64', 'FDT1.' + Buffer.from('not json').toString('base64'),
                     'FDT1.' + Buffer.from('{"n":"x"}').toString('base64'), 'FDT2.' + Buffer.from('{"l":{}}').toString('base64'), null, 42]) {
    assert.equal(decodeLookCode(bad), null, String(bad));
  }
  const evil = 'FDT1.' + Buffer.from(JSON.stringify({ n: '<img src=x onerror=alert(1)>\u0007', l: { theme: { themeBackdrop: 'url(javascript:x)' }, __proto__: { polluted: true } } })).toString('base64');
  const got = decodeLookCode(evil);
  assert.ok(got);
  assert.ok(!/[<>\u0000-\u001f]/.test(got.name), 'markup and control characters stripped from the name');
  assert.equal(got.look.theme.themeBackdrop, null);
  assert.equal(({}).polluted, undefined);
});
