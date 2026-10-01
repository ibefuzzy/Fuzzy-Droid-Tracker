'use strict';
/* v1.17.0 "Rarity on each droid" (⚙ Overlay Settings → Appearance): settings.overlayRarityStyle is
   'color' (the picture frame shows the rarity, as always) or 'text' (neutral frame, the rarity written
   under the name). The visual result is checked by eye in a browser; these tests guard the wiring that
   is easy to break silently: the setting's meaning, that nothing shows by default, that every rarity
   has a colour for its label, and that each overlay still carries the markup the CSS switches on. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadShared } = require('./helpers/load-shared.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('rarityStyleOf: only "text" means written; everything else is the picture colour', () => {
  const s = loadShared();
  assert.strictEqual(s.rarityStyleOf('text'), 'text');
  for (const v of ['color', '', 'TEXT', 'written', null, undefined, 0, 1, {}, true]) {
    assert.strictEqual(s.rarityStyleOf(v), 'color', String(v));
  }
});

test("a fresh install defaults to the picture colour (main.js DEFAULT_SETTINGS)", () => {
  assert.match(read('main.js'), /overlayRarityStyle:\s*'color'/);
});

test('written labels are hidden until html.rarity-text is set, and Compact hides them too', () => {
  const css = read('overlay-theme.css');
  const hidden = css.indexOf('.rar-label{ display:none; }');
  const shown = css.indexOf('html.rarity-text .rar-label{');
  assert.ok(hidden !== -1 && shown !== -1 && hidden < shown, 'default-hidden rule must come before the shown rule');
  assert.match(css, /html\.ov-compact \.rar-label\{ display:none !important; \}/);
  assert.match(css, /\.have-word\{ display:none; \}/);
});

test('every rarity has a label colour in overlay-theme.css (no hardcoded tier list)', () => {
  const s = loadShared();
  const css = read('overlay-theme.css');
  for (const code of s.RARITY_ORDER) {
    assert.ok(css.includes('.rar-label.' + code + '{'), 'missing .rar-label.' + code);
  }
});

test("the neutral frame skips Safe to Retire: its frame shows the droid's class, not a rarity", () => {
  const css = read('overlay-theme.css');
  assert.match(css, /html\.rarity-text:not\(\[data-ov-name="declutter"\]\) \.d-icon-wrap\{ --rc:/);
  assert.match(read('declutter.html'), /data-ov-name="declutter"/);
});

test('each overlay still carries the markup the written style switches on', () => {
  // the HUD and Rebirth Reqs get a "Need <rarity>" line coloured by the REQUIRED rarity code
  assert.match(read('overlay.html'), /class="rar-label ' \+ d\.code \+ '">Need ' \+ RNAME\[d\.code\]/);
  assert.match(read('rebirth-requirements-overlay.html'), /class="rar-label ' \+ code \+ '">Need ' \+ RNAME\[code\]/);
  // Sneak Preview's existing "Needs …" line is coloured by the rarity it names (--nc)
  const sneak = read('sneak-preview.html');
  assert.match(sneak, /' need'/);
  assert.match(sneak, /--nc:' \+ reqColor/);
  // Safe to Retire spells out "Have <rarity>"
  const retire = read('declutter.html');
  assert.match(retire, /class="have-word">Have <\/span>/);
  assert.match(retire, /' has'/);
});

test('every overlay that has written labels links the shared CSS and loads overlay-theme.js', () => {
  for (const f of ['overlay.html', 'rebirth-requirements-overlay.html', 'sneak-preview.html', 'declutter.html']) {
    const html = read(f);
    assert.match(html, /href="overlay-theme\.css"/, f + ' must link overlay-theme.css');
    assert.match(html, /src="overlay-theme\.js"/, f + ' must load overlay-theme.js');
  }
  const js = read('overlay-theme.js');
  assert.match(js, /rarityStyleOf\(s && s\.overlayRarityStyle\)/);
  assert.match(js, /classList\.toggle\('rarity-text'/);
});

test('the Appearance tab has both buttons and the tutorial step points at the row', () => {
  const html = read('tracker.html');
  assert.strictEqual((html.match(/id="rarityStyleRow"/g) || []).length, 1);
  assert.match(html, /id="rarityStyleColorBtn" data-rarity-style="color"/);
  assert.match(html, /id="rarityStyleTextBtn" data-rarity-style="text"/);
  assert.match(read('guide.js'), /since: '1\.17\.0', target: '#rarityStyleRow'/);
});
