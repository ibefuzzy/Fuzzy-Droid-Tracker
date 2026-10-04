'use strict';
/* v1.18.1 📸 Read Rebirth Screen: a clean "21" was read as "217" (the crop enlarged x6 to ~230px;
   every height from 50 to 200px read "21"), and the old parser then took the LAST 1-2 digits, so
   it would have suggested 7. Now the crop is scaled to a set height, a doubtful read is retried at
   another height, and parseRankText() prefers a real rank (1..maxLevel). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadShared } = require('./helpers/load-shared.js');

const s = loadShared();
const p = (t) => s.parseRankText(t, 40);

test('the reported misread: "217" is rank 21, not 7', () => {
  assert.strictEqual(p('217'), 21);
});

test('plain readings', () => {
  assert.strictEqual(p('21'), 21);
  assert.strictEqual(p(' 7\n'), 7);
  assert.strictEqual(p('40'), 40);
  assert.strictEqual(p('Rank 12'), 12);
  assert.strictEqual(p('RANK: 3'), 3);
  assert.strictEqual(p('Rank 217'), 21); // the label and a phantom digit
});

test('a number that is not a real rank never comes back', () => {
  assert.strictEqual(p('0'), null);
  assert.strictEqual(p('41'), null);
  assert.strictEqual(p('99'), null);
  assert.strictEqual(p(''), null);
  assert.strictEqual(p('zr'), null);
  assert.strictEqual(p(null), null);
  assert.strictEqual(p('517'), 5); // leading 2 digits aren't a rank, the leading 1 is
});

test('stray digits before the rank lose to the last real rank', () => {
  assert.strictEqual(p('3 21'), 21);
  assert.strictEqual(p('12 99'), 12); // 99 isn't a rank
});

test('the reader scales to a set height (not x6) and retries a doubtful read', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'rebirth-screen-read.js'), 'utf8');
  assert.ok(!/UPSCALE/.test(src), 'the fixed x6 enlargement is gone');
  assert.match(src, /const READ_HEIGHT = 120, RETRY_HEIGHT = 80;/);
  assert.match(src, /guess: parseRankText\(t, maxLevel\)/);
  assert.match(src, /if\(best\.guess === null \|\| best\.confidence < LOW_CONFIDENCE\)/);
});
