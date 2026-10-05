'use strict';
/* v1.18.0 "update available" notice: the version compare, the version.json parsing, the once-a-day
   rule, and the wiring that keeps the promises in the README (notify only, switch exists, off = no read). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const u = require('../update-check.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('isNewerVersion compares numbers, not strings', () => {
  assert.strictEqual(u.isNewerVersion('1.18.0', '1.17.0'), true);
  assert.strictEqual(u.isNewerVersion('1.10.0', '1.9.9'), true);
  assert.strictEqual(u.isNewerVersion('2.0.0', '1.99.99'), true);
  assert.strictEqual(u.isNewerVersion('1.17.0', '1.17.0'), false);
  assert.strictEqual(u.isNewerVersion('1.16.9', '1.17.0'), false);
  assert.strictEqual(u.isNewerVersion('v1.18.0', '1.17.0'), true);
});

test('unreadable versions are never "newer"', () => {
  for (const bad of [undefined, null, '', 'abc', '1.2', '1.2.3.4', '1.2.x', 5, {}, '1.2.3-beta']) {
    assert.strictEqual(u.isNewerVersion(bad, '1.0.0'), false, String(bad));
    assert.strictEqual(u.isNewerVersion('9.9.9', bad), false, String(bad));
  }
});

test('parseUpdateInfo accepts a good file and tidies the note', () => {
  assert.deepStrictEqual(u.parseUpdateInfo(JSON.stringify({ version: '1.18.0', note: '  Spooky \t themes  ' })),
    { version: '1.18.0', note: 'Spooky themes' });
  assert.deepStrictEqual(u.parseUpdateInfo('{"version":"v1.18.0"}'), { version: '1.18.0', note: '' });
  assert.strictEqual(u.parseUpdateInfo('{"version":"1.0.0","note":"' + 'x'.repeat(500) + '"}').note.length, 160);
});

test('parseUpdateInfo rejects anything else, and never reads a link from the file', () => {
  for (const bad of ['', 'nope', '[]', 'null', '{}', '{"version":"soon"}', '{"version":5}', '<html>404</html>', 'x'.repeat(5000)]) {
    assert.strictEqual(u.parseUpdateInfo(bad), null, bad.slice(0, 20));
  }
  const info = u.parseUpdateInfo('{"version":"1.18.0","url":"https://evil.example/x.exe","note":"hi"}');
  assert.deepStrictEqual(Object.keys(info).sort(), ['note', 'version']);
  assert.strictEqual(u.parseUpdateInfo(undefined), null);
});

test('checkIsDue: first run, under a day, a day, clock went backwards', () => {
  const now = 1_800_000_000_000;
  assert.strictEqual(u.checkIsDue(0, now), true);
  assert.strictEqual(u.checkIsDue(undefined, now), true);
  assert.strictEqual(u.checkIsDue(now - 3600e3, now), false);
  assert.strictEqual(u.checkIsDue(now - u.CHECK_EVERY_MS, now), true);
  assert.strictEqual(u.checkIsDue(now + 5000, now), true);
});

test('pendingUpdate: newer and not dismissed only', () => {
  const info = { version: '1.18.0', note: '' };
  assert.strictEqual(u.pendingUpdate(info, '1.17.0', ''), info);
  assert.strictEqual(u.pendingUpdate(info, '1.18.0', ''), null);
  assert.strictEqual(u.pendingUpdate(info, '1.17.0', '1.18.0'), null);
  assert.strictEqual(u.pendingUpdate({ version: '1.19.0', note: '' }, '1.17.0', '1.18.0').version, '1.19.0');
  assert.strictEqual(u.pendingUpdate(null, '1.17.0', ''), null);
});

test('the only address is the site file; the Download button opens the fixed releases page', () => {
  assert.strictEqual(u.UPDATE_URL, 'https://ibefuzzy.github.io/version.json');
  assert.match(u.RELEASES_URL, /^https:\/\/github\.com\/ibefuzzy\/Fuzzy-Droid-Tracker\/releases$/);
  const main = read('main.js');
  assert.match(main, /shell\.openExternal\(updateCheck\.RELEASES_URL\)/);
  // v1.19.0: exactly two network calls in the app: this file, and the 🌐 Live Friends server.
  // The third net.fetch reads the bundled OCR files from the app's own folder (file://, never the network).
  const fetches = main.match(/net\.fetch\([^,]+/g) || [];
  assert.deepStrictEqual(fetches.sort(), ['net.fetch(liveSync.LIVE_SERVER + p', 'net.fetch(pathToFileURL(path.join(__dirname',
    'net.fetch(updateCheck.UPDATE_URL']);
  assert.match(main, /net\.fetch\(pathToFileURL\(path\.join\(__dirname, rel\)\)\.toString\(\)\)/);
});

test('on by default, and the switch turns the read off', () => {
  const main = read('main.js');
  assert.match(main, /updateCheck:\s*true/);
  assert.match(main, /async function checkForUpdate\(\)\{\s*if\(settings\.updateCheck === false\) return;/);
  assert.match(read('tracker.html'), /id="updateCheckCheckbox"/);
  assert.match(read('guide.js'), /since: '1\.18\.0'/);
});

test('the banner shows the note as text, never HTML', () => {
  const oc = read('overlay-controls.js');
  assert.match(oc, /getElementById\('updateNote'\)\.textContent/);
  assert.ok(!/updateNote'\)\.innerHTML/.test(oc));
});
