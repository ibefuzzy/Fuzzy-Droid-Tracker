'use strict';
// Rebirth credit costs (REBIRTH_CREDITS in droid-data.js, v1.15.1), shown on the
// 🎯 Upcoming RB Req's HUD.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadShared } = require('./helpers/load-shared');

const s = loadShared();

// Exactly as the game / the community "Super Rebirth" chart writes them (1-35),
// plus 36-40 from the user (2026-09-29).
const CHART = ['10K', '150K', '975K', '2.95M', '5.35M', '9.85M', '14.5M', '36M', '89M', '220M',
  '550M', '1.36B', '3.4B', '8.45B', '21B', '52B', '130B', '325B', '810B', '2T',
  '3T', '4.5T', '6T', '9T', '13.5T', '21T', '32T', '45T', '68T', '100T',
  '150T', '230T', '345T', '520T', '778T', '1.19QA', '2.5QA', '4.5QA', '8QA', '15QA'];

test('every rebirth level has a credit cost, written the way the game writes it', () => {
  assert.equal(s.REBIRTH_CREDITS.length, CHART.length);
  CHART.forEach((want, i) => assert.equal(s.formatCredits(s.rebirthCreditsFor(1, i + 1)), want, `Rebirth ${i + 1}`));
});

test('the credit costs cover every real level of every cycle and only go up', () => {
  for (let c = 1; c <= 5; c++) {
    for (let l = 1; l <= s.cycleRealLevelCount(c); l++) assert.ok(s.rebirthCreditsFor(c, l) > 0, `cycle ${c} level ${l} has no cost`);
  }
  s.REBIRTH_CREDITS.forEach((n, i) => { if (i) assert.ok(n > s.REBIRTH_CREDITS[i - 1], `Rebirth ${i + 1} costs less than Rebirth ${i}`); });
});

test('unknown levels have no cost, and the formatter never throws', () => {
  assert.equal(s.rebirthCreditsFor(1, 0), null);
  assert.equal(s.rebirthCreditsFor(1, 41), null);
  assert.equal(s.formatCredits(0), '0');
  assert.equal(s.formatCredits(999), '999');
  assert.equal(s.formatCredits(1000), '1K');
  assert.equal(s.formatCredits(NaN), '');
  assert.equal(s.formatCredits(undefined), '');
});
