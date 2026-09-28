'use strict';
// Mission warnings (requirements.js, v1.14.1): which "N seconds before the next
// mission" warnings fire as timers.html's countdown ticks once a second.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadShared } = require('./helpers/load-shared');

const s = loadShared();
const clean = (l) => [...s.cleanMissionWarnTimes(l)]; // copy out of the vm realm for deepEqual
const due = (a, b, l) => [...s.missionWarningsDue(a, b, l)];

test('warning lists are cleaned: in range, whole seconds, no repeats, longest first', () => {
  assert.deepEqual(clean([30, 60, 120]), [120, 60, 30]);
  assert.deepEqual(clean([30, 30, '60', 90.4, 4, 1801, -5, null, 'x']), [90, 60, 30]);
  assert.deepEqual(clean(undefined), []);
  assert.deepEqual(clean('30'), []);
});

test('at most 3 of the player\'s own times; the presets never count toward that', () => {
  assert.deepEqual(clean([90, 45, 75, 100, 30, 60, 120]), [120, 100, 90, 75, 60, 45, 30].filter((v) => v !== 100));
});

test('each warning fires once, on the tick its time is crossed', () => {
  const warn = [120, 60, 30];
  const fired = [];
  // a 1 s ticking countdown from 2:05 down to 0, then the wrap to the next mission
  let prev = null;
  for (let ms = 125000; ms >= 0; ms -= 1000) { due(prev, ms, warn).forEach((w) => fired.push(w)); prev = ms; }
  assert.deepEqual(due(prev, 35 * 60 * 1000, warn), [], 'the wrap to the next mission fires nothing');
  assert.deepEqual(fired, [120, 60, 30]);
});

test('uneven ticks still fire exactly once (a slow tick jumps past the mark)', () => {
  assert.deepEqual(due(30400, 29100, [30]), [30]);
  assert.deepEqual(due(29100, 28100, [30]), []);
  assert.deepEqual(due(30000, 29000, [30]), [], 'exactly on the mark last tick = already fired');
});

test('never late, never on the first reading', () => {
  assert.deepEqual(due(null, 29500, [30]), [], 'first reading after launch');
  assert.deepEqual(due(95000, 20000, [60, 30]), [], 'slept through both: skipped, not played late');
  assert.deepEqual(due(62000, 58500, [60, 30]), [60], 'within 3 s is still on time');
  assert.deepEqual(due(1000, 2100000, [30]), [], 'countdown went up (wrap or a sync change)');
});
