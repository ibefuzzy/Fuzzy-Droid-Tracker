'use strict';
// v1.20.0 panel backgrounds (overlay-backgrounds.js + the themeBg* theme keys) and the holo foil.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadShared, ROOT } = require('./helpers/load-shared');

const s = loadShared(['droid-data.js', 'requirements.js', 'overlay-backgrounds.js']);
const BG = s.run('OVERLAY_BG');
const KEYS = s.run('OVERLAY_BG_KEYS');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const svgsOf = (layers) => layers.filter((l) => l.img.startsWith('url("data:image/svg+xml,')).map((l) => decodeURIComponent(l.img.slice(24, -2)));

test('every background key has exactly one design, and every design has a key', () => {
  assert.equal(new Set(KEYS).size, KEYS.length, 'duplicate in OVERLAY_BG_KEYS');
  assert.deepEqual(JSON.stringify(BG.list.map((c) => c.key).sort()), JSON.stringify([...KEYS].sort()));
  assert.equal(KEYS[0], 'none');
  for (const c of BG.list) {
    assert.ok(c.label && c.sub, c.key + ': label + description');
    assert.ok(['off', 'sw', 'halloween'].includes(c.group), c.key + ': group');
    if (c.skin) assert.ok(s.run('BORDER_SKINS')[c.skin], c.key + ': pairs with a real skin');
  }
});

test('every design draws for every colour mode and skin, with no broken values', () => {
  for (const key of KEYS.filter((k) => k !== 'none')) {
    for (const color of [null, 'border', '#ff00aa']) {
      for (const skin of ['jedi', 'nightsister', null]) {
        const theme = { themeBg: key, themeBgColor: color, themeBgStrength: 0.5, themeBgMotion: true, themeBgSpeed: 1.4 };
        const css = BG.css(theme, skin, { light: color === null });
        assert.ok(css.length > 100, `${key}/${color}/${skin}: empty`);
        assert.doesNotMatch(css, /undefined|NaN|\[object/, `${key}/${color}/${skin}`);
        const layers = BG.layersFor(key, theme, skin);
        assert.ok(layers.length >= 1, key);
        for (const svg of svgsOf(layers)) assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, key);
      }
    }
  }
});

test('motion only names layers the design has, and stays inside the reduced-motion guard', () => {
  for (const c of BG.list.filter((x) => x.anim)) {
    const n = BG.layersFor(c.key, {}, 'jedi').length;
    for (const part of ['loop', 'bob', 'from', 'sizeLoop', 'sizeBob']) {
      for (const i of Object.keys(c.anim[part] || {})) assert.ok(+i < n, `${c.key}.${part}[${i}] but only ${n} layers`);
    }
  }
  const still = BG.css({ themeBg: 'stars' }, 'jedi');
  assert.doesNotMatch(still, /animation:|@keyframes/, 'no motion unless themeBgMotion is on');
  const moving = BG.css({ themeBg: 'stars', themeBgMotion: true }, 'jedi');
  assert.match(moving, /@media \(prefers-reduced-motion:no-preference\)\{.*animation:/);
  assert.match(moving, /\.block\{animation:fdt-in [^,]*backwards,/, "the HUD keeps its fade-in, leaving no transform behind");
  assert.match(still, /\.block,\.ready-strip\{animation-fill-mode:backwards!important\}/,
    "a leftover translateY(0) would make the fixed picture repeat in every HUD block");
  assert.match(moving, /\.banner\.imminent\{animation:pulse-glow/, 'a timer about to fire keeps its pulse');
  assert.match(BG.css({ themeBg: 'stars', themeBgMotion: true }, 'jedi', { light: true }), /steps\(\d+\)/, 'light motion steps');
});

test('recolouring keeps near-black details and changes the rest', () => {
  const natural = svgsOf(BG.layersFor('bones', {}, 'jedi')).join('');
  const green = svgsOf(BG.layersFor('bones', { themeBgColor: '#00ff00' }, 'jedi')).join('');
  assert.match(natural, /#efe6d2/);
  assert.doesNotMatch(green, /#efe6d2/, 'bone colour recoloured');
  assert.match(green, /#0a0a0a/, 'the skull eye holes stay black');
});

test("'none', nothing, or an unknown key draws no background", () => {
  for (const t of [{}, { themeBg: null }, { themeBg: 'none' }, { themeBg: 'nope' }, null]) assert.equal(BG.css(t, 'jedi'), '');
});

test('looks and share codes keep valid background settings and drop bad ones', () => {
  const sanitizeLook = s.run('sanitizeLook');
  const l = sanitizeLook({ theme: { themeBg: 'targeting', themeBgStrength: 0.4, themeBgColor: 'border', themeBgMotion: true, themeBgSpeed: 0.6 },
    overlayThemes: { timers: { themeBg: 'none' }, sneak: { themeBg: 'url(evil)', themeBgColor: 'javascript:x', themeBgStrength: 5, themeBgMotion: 'yes' } } });
  assert.equal(l.theme.themeBg, 'targeting');
  assert.equal(l.theme.themeBgStrength, 0.4);
  assert.equal(l.theme.themeBgColor, 'border');
  assert.equal(l.theme.themeBgMotion, true);
  assert.equal(l.theme.themeBgSpeed, 0.6);
  assert.deepEqual(JSON.parse(JSON.stringify(l.overlayThemes)), { timers: { themeBg: 'none' } }, 'bad per-overlay values dropped');
  const code = s.run('encodeLookCode')('Trench run', l);
  const back = s.run('decodeLookCode')(code);
  assert.ok(s.run('looksEqual')(back.look, l));
});

test('defaults: no background, foil on, light motion off', () => {
  const main = read('main.js');
  for (const k of ['themeBg', 'themeBgStrength', 'themeBgColor', 'themeBgMotion', 'themeBgSpeed']) assert.match(main, new RegExp('\\b' + k + ': null,'), k);
  assert.match(main, /overlayFoil: true,/);
  assert.match(main, /overlayBgLight: false,/);
  assert.match(main, /overlayBgPairSkin: true,/);
});

test('every themed window loads overlay-backgrounds.js right after requirements.js and applies it', () => {
  for (const f of ['overlay.html', 'declutter.html', 'rebirth-requirements-overlay.html', 'sneak-preview.html', 'crit-guide-overlay.html', 'spawn-alert.html', 'timers.html', 'tracker.html']) {
    assert.match(read(f), /<script src="requirements\.js"><\/script>\s*<script src="overlay-backgrounds\.js"><\/script>/, f);
  }
  assert.match(read('overlay-theme.js'), /applyOverlayBackground\(t, skin, \{ light \}\)/);
  assert.match(read('timers.html'), /applyOverlayBackground\(t, /);
});

test('the holo foil covers exactly Stellar + Kyber, in their own colours, and respects reduced motion', () => {
  const css = read('overlay-theme.css');
  assert.match(css, /html\.ov-foil \.d-icon-wrap\[style\*="--r-stellar"\]\{ --foil:var\(--r-stellar/);
  assert.match(css, /html\.ov-foil \.d-icon-wrap\[style\*="--r-kyber"\]\{ --foil:var\(--r-kyber/);
  assert.match(css, /@media \(prefers-reduced-motion:no-preference\)\{\s*html\.ov-foil[^}]*\{ animation:ov-foil/);
  assert.match(read('overlay-theme.js'), /root\.classList\.toggle\('ov-foil', s\.overlayFoil !== false\)/);
});
