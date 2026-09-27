'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { snapMove, snapResize } = require('../overlay-snap');

const WA = { x: 0, y: 0, width: 1920, height: 1040 };
const reqs = { x: 1500, y: 200, width: 380, height: 300 }; // a list overlay already placed

test('a window dragged just below another snaps flush under it', () => {
  const b = snapMove({ x: 1504, y: 509, width: 380, height: 280 }, [reqs], WA);
  assert.deepEqual(b, { x: 1500, y: 500, width: 380, height: 280 }); // bottom-to-top and left edges line up
});

test('a window dragged beside another snaps flush to its side and lines up the tops', () => {
  const b = snapMove({ x: 1108, y: 195, width: 380, height: 300 }, [reqs], WA);
  assert.deepEqual(b, { x: 1120, y: 200, width: 380, height: 300 });
});

test('an overlay far away does not tug', () => {
  const b = snapMove({ x: 400, y: 505, width: 300, height: 200 }, [reqs], WA);
  assert.deepEqual(b, { x: 400, y: 505, width: 300, height: 200 });
});

test('the work area edges snap too', () => {
  const b = snapMove({ x: 7, y: 600, width: 300, height: 200 }, [], WA);
  assert.equal(b.x, 0);
  const r = snapMove({ x: 1612, y: 600, width: 300, height: 200 }, [], WA);
  assert.equal(r.x + r.width, 1920);
});

test('beyond the snap distance nothing moves', () => {
  const b = snapMove({ x: 1500, y: 514, width: 380, height: 280 }, [reqs], WA);
  assert.equal(b.y, 514);
});

test('resizing snaps to another overlay\'s size so two lists can match', () => {
  const b = snapResize({ x: 100, y: 100, width: 371, height: 309 }, [], [{ width: 380, height: 300 }], WA);
  assert.deepEqual(b, { x: 100, y: 100, width: 380, height: 300 });
});

test('resizing snaps the right edge to a neighbour\'s right edge, not only its size', () => {
  const b = snapResize({ x: 1500, y: 500, width: 373, height: 200 }, [reqs], [], WA);
  assert.equal(b.x + b.width, reqs.x + reqs.width);
});

test('resize with size matching off leaves an unrelated size alone', () => {
  const b = snapResize({ x: 100, y: 100, width: 371, height: 309 }, [], [], WA);
  assert.deepEqual(b, { x: 100, y: 100, width: 371, height: 309 });
});
