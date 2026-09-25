/* Crash-safety tests for persistence.js, run against real files in a temp
   folder. These simulate the situations that used to lose progress. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadJson, saveJsonNow } = require('../persistence');

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdt-persist-'));
  const file = path.join(dir, 'droid-tycoon-store.json');
  return { dir, file, list: () => fs.readdirSync(dir).sort(), done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('first launch: no file gives the defaults and creates nothing', () => {
  const s = tmpStore();
  try {
    const fallback = { a: 1 };
    const got = loadJson(s.file, fallback);
    assert.deepEqual(got, { a: 1 });
    assert.notEqual(got, fallback, 'must be a copy, not the shared defaults object');
    assert.deepEqual(s.list(), []);
  } finally { s.done(); }
});

test('save then load round-trips, merges new default keys, leaves no .tmp behind', () => {
  const s = tmpStore();
  try {
    assert.equal(saveJsonNow(s.file, { owned: { bb9: 6 } }), true);
    assert.deepEqual(loadJson(s.file, { newSetting: true }), { newSetting: true, owned: { bb9: 6 } });
    assert.deepEqual(s.list(), ['droid-tycoon-store.json']);
  } finally { s.done(); }
});

test('each save keeps the previous version as .bak', () => {
  const s = tmpStore();
  try {
    saveJsonNow(s.file, { v: 1 });
    saveJsonNow(s.file, { v: 2 });
    assert.deepEqual(read(s.file), { v: 2 });
    assert.deepEqual(read(s.file + '.bak'), { v: 1 });
  } finally { s.done(); }
});

test('crash before the rename: a half-written .tmp never replaces the real file', () => {
  const s = tmpStore();
  try {
    saveJsonNow(s.file, { v: 1 });
    fs.writeFileSync(s.file + '.tmp', '{"v": 2, "owned": {"bb'); // simulated crash mid-write
    assert.deepEqual(loadJson(s.file, {}), { v: 1 });
    saveJsonNow(s.file, { v: 3 }); // next save overwrites the stale .tmp
    assert.deepEqual(read(s.file), { v: 3 });
    assert.ok(!s.list().includes('droid-tycoon-store.json.tmp'));
  } finally { s.done(); }
});

test('truncated main file: keeps a .corrupt copy and recovers the last good save from .bak', () => {
  const s = tmpStore();
  try {
    saveJsonNow(s.file, { v: 1 });
    saveJsonNow(s.file, { v: 2 });
    fs.writeFileSync(s.file, '{"v": 3, "own'); // damaged outside our control
    assert.deepEqual(loadJson(s.file, { d: 0 }), { d: 0, v: 1 });
    const corrupt = s.list().filter((n) => n.includes('.corrupt-'));
    assert.equal(corrupt.length, 1);
    assert.equal(fs.readFileSync(path.join(s.dir, corrupt[0]), 'utf8'), '{"v": 3, "own');
  } finally { s.done(); }
});

test('empty main file (old power-loss artifact) recovers from .bak', () => {
  const s = tmpStore();
  try {
    fs.writeFileSync(s.file + '.bak', JSON.stringify({ v: 1 }));
    fs.writeFileSync(s.file, '');
    assert.deepEqual(loadJson(s.file, {}), { v: 1 });
  } finally { s.done(); }
});

test('an empty main file never overwrites a good .bak on the next save', () => {
  const s = tmpStore();
  try {
    fs.writeFileSync(s.file + '.bak', JSON.stringify({ v: 1 }));
    fs.writeFileSync(s.file, '');
    saveJsonNow(s.file, { v: 2 });
    assert.deepEqual(read(s.file), { v: 2 });
    assert.deepEqual(read(s.file + '.bak'), { v: 1 });
  } finally { s.done(); }
});

test('corrupt main file with no backup falls back to the defaults', () => {
  const s = tmpStore();
  try {
    fs.writeFileSync(s.file, 'not json');
    assert.deepEqual(loadJson(s.file, { d: 0 }), { d: 0 });
    assert.equal(s.list().filter((n) => n.includes('.corrupt-')).length, 1);
  } finally { s.done(); }
});

test('valid JSON that is not an object (e.g. an array) is treated as corrupt', () => {
  const s = tmpStore();
  try {
    fs.writeFileSync(s.file + '.bak', JSON.stringify({ v: 1 }));
    fs.writeFileSync(s.file, '[1,2,3]');
    assert.deepEqual(loadJson(s.file, {}), { v: 1 });
  } finally { s.done(); }
});

test('saving into a folder that does not exist yet creates it', () => {
  const s = tmpStore();
  try {
    const nested = path.join(s.dir, 'new', 'deeper', 'store.json');
    assert.equal(saveJsonNow(nested, { ok: true }), true);
    assert.deepEqual(read(nested), { ok: true });
  } finally { s.done(); }
});
