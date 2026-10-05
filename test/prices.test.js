'use strict';
// v1.20.0 droid prices (a player's request): DROID_BASE_PRICES x PRICE_LADDER (droid-data.js), droidPriceFor().
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadShared, ROOT } = require('./helpers/load-shared');

const s = loadShared();
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const price = (code, name) => s.droidPriceFor(code, s.normKey(s.canonicalName(name)));

test('every droid every rebirth asks for has a price, at every rarity it is asked for', () => {
  let slots = 0;
  for (const cycle of Object.keys(s.CYCLES)) {
    s.CYCLES[cycle].forEach((row, li) => row.forEach(([code, name]) => {
      if (code === '?') return;
      slots++;
      const p = price(code, name);
      assert.ok(p && p.credits > 0, `cycle ${cycle} rebirth ${li + 1}: ${name} ${code} has no price`);
      assert.equal(p.crystals > 0, code === 'Y', `${name} ${code}: Kyber Crystals only for Kyber`);
    }));
  }
  assert.equal(slots, 600);
});

test('the price table lists exactly the CYCLES droids, once each', () => {
  const base = s.run('DROID_BASE_PRICES');
  const nks = new Set();
  Object.keys(s.CYCLES).forEach((c) => s.CYCLES[c].forEach((r) => r.forEach(([code, n]) => { if (code !== '?') nks.add(s.normKey(s.canonicalName(n))); })));
  const keys = Object.keys(base).map((n) => s.normKey(s.canonicalName(n)));
  assert.equal(new Set(keys).size, keys.length, 'a droid listed twice');
  assert.deepEqual([...keys].sort(), [...nks].sort());
});

test('known prices (the in-game chart, the published Kyber blueprints, the DubTrackr check)', () => {
  const KNOWN = [
    ['B', 'Gonk', 3000, 0], ['Y', 'Gonk', 108000, 1], ['Y', 'CB', 72000, 1], ['Y', 'ID10', 144000, 1],
    ['Y', 'BDX Explorer', 900000, 2], ['R', 'LO', 25200000, 0], ['X', 'Util-Tec', 540000000, 0],
    ['S', 'Snow Mouse', 5.04e12, 0], ['B', 'KX', 300000000, 0], ['Y', 'KX', 50.4e12, 10], ['K', 'R7', 14.8e9, 0]
  ];
  for (const [code, name, credits, crystals] of KNOWN) {
    const p = price(code, name);
    assert.equal(p.credits, credits, `${name} ${code}`);
    assert.equal(p.crystals, crystals, `${name} ${code} crystals`);
  }
});

test('every class has a full ladder that only ever goes up', () => {
  const LADDER = s.run('PRICE_LADDER');
  for (const cls of s.run('RARITY_CLASS_ORDER')) {
    const l = LADDER[cls];
    assert.equal(l.length, s.RARITY_ORDER.length, cls);
    assert.equal(l[0], 1, cls);
    l.slice(1).forEach((m, i) => assert.ok(m > l[i], `${cls}: rung ${i + 1} not higher`));
    assert.ok(s.run('KYBER_ACTIVATION_CRYSTALS')[cls] > 0, cls);
  }
});

test('price markup, the setting, and unknown droids', () => {
  assert.equal(s.droidPriceHtml({ credits: 4.64e6, crystals: 0 }), '<span class="pr-ic"></span>4.64M');
  assert.equal(s.droidPriceHtml({ credits: 900000, crystals: 2 }), '<span class="pr-ic"></span>900K + 2<span class="pr-ic kc"></span>');
  assert.equal(s.droidPriceHtml(null), '');
  assert.equal(s.droidPriceFor('B', 'notadroid'), null);
  assert.equal(s.droidPriceFor('?', s.normKey('Gonk')), null);
  assert.equal(s.pricesOn({}), true, 'on by default');
  assert.equal(s.pricesOn({ overlayPrices: false }), false);
  assert.match(read('main.js'), /overlayPrices: true,/);
});

test('the three droid overlays show prices for droids still needed, and the HUD its Σ total', () => {
  for (const f of ['overlay.html', 'rebirth-requirements-overlay.html', 'sneak-preview.html']) {
    const src = read(f);
    assert.match(src, /droidPriceFor\(/, f);
    assert.match(src, /<div class="d-owned price">' \+ droidPriceHtml\(price\)/, f);
    assert.match(src, /pricesOn\(settings\)/, f + ' follows the switch');
  }
  const hud = read('overlay.html');
  assert.match(hud, /class="price-total"/);
  assert.match(hud, /showPrices \? 'NOW ' : 'NOW · Lvl '/, 'the top tag shortens to make room');
  assert.match(read('overlay-theme.css'), /\.d-owned\.price\{/);
  assert.match(read('tracker.html'), /id="overlayPricesCheck"/);
});
