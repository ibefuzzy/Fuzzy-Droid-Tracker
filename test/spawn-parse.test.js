'use strict';
// Spawn Alert line reader (spawn-parse.js, v1.14.0). The fixture is real OCR of
// the game's feed: 90 s with 10 droid spawns plus crafted/rebirth/boost lines.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const P = require(path.join(__dirname, '..', 'spawn-parse.js'));
const FEED = require('./fixtures/spawn-feed-ocr.json');

const read = (line) => { const r = P.parseSpawnLine(line); return r && r.variant + ' ' + r.tier; };

test('clean and OCR-mangled spawn lines read as type + tier', () => {
  assert.equal(read('Diamond Droid (Rare) spawned at the Sandcrawler'), 'diamond rare');
  assert.equal(read('# Galactic Droid (Epic) spawnedjatithe sa'), 'galactic epic');
  assert.equal(read('] Bes kan Droid (Common) spawned atthe Sandcrawler'), 'beskar common');
  assert.equal(read('[1 Rhinbow Droid [Common] spaened at the Sander awler'), 'rainbow common');
  assert.equal(read('IKIDiamond|Droid|(Rare)|spawnedlatithelsandctawie'), 'diamond rare');
  assert.equal(read('0 Diamond|Droid (Rar .e)lspayned)'), 'diamond rare');
  assert.equal(read('# Diamond Droid [Coiumon] spawned at the Sanderawlor'), 'diamond common');
  // read in the app through the video capture, on a white wall (v1.14.0 browser replay)
  assert.equal(read('& Boshar Druid (Common) spawned at the Sandorawler —'), 'beskar common');
  // types and tiers the capture didn't happen to include
  assert.equal(read('A Gold Droid (Legendary) spawned at the Sandcrawler'), 'gold legendary');
  assert.equal(read('A Stellar Droid (Mythic) spawned at the Sandcrawler'), 'stellar mythic');
  assert.equal(read('A Kyber Droid (Mythic) spawned at the Sandcrawler'), 'kyber mythic');
});

test('lines that are not a spawn are ignored', () => {
  for (const line of [
    'Shadowsangel88 crafted a 8 Galactic Droid',           // mentions a droid, no tier, no "spawned"
    'IbcFuzzy crafled a # Galactic Droid',
    'CharmingEar7448 has reached Rebirth 4',
    'REWARD: MINE ROCKS',
    '3.2/s Craft Speed',
    'IbeFuzzy (Game): Gold Droid (Mythic) spawned lol',    // chat: a name in front of the type
    'Shadowsangel88 crafted a Diamond Droid (Rare) spawned', // anything with a player in front
    '# Diamond Droid (Rare) :',                            // cut off before "spawned"
    '[Common] spawned ache Sander aver',                    // type missing
    'Droid (Common) spawned at the Sandcrawler'             // type missing
  ]) assert.equal(read(line), null, line);
});

test('several lines at once, top to bottom', () => {
  const text = 'REWARD: MINE ROCKS\n[ ] Rainbow Droid (Common) spawned at the Sandcrawler\n'
    + 'CharmingEar7448 has reached Rebirth 4\nJ Galactic Droid (Epic) spawnedfadthe Wk';
  assert.deepEqual(P.parseSpawnText(text), [{ variant: 'rainbow', tier: 'common' }, { variant: 'galactic', tier: 'epic' }]);
  assert.deepEqual(P.parseSpawnText(''), []);
  assert.deepEqual(P.parseSpawnText(null), []);
});

test('the real 90 s capture alerts each of its 10 spawns exactly once, in order', () => {
  const tracker = P.createSpawnTracker(8000);
  const alerts = [];
  for (const f of FEED.frames) {
    tracker.update(P.parseSpawnText(f.lines.join('\n')), f.t).forEach((s) => alerts.push(s.variant + ' ' + s.tier));
  }
  assert.deepEqual(alerts, [
    'galactic common', 'diamond common', 'diamond rare', 'diamond rare', 'beskar common',
    'diamond rare', 'beskar common', 'rainbow common', 'rainbow common', 'galactic epic'
  ]);
});

test('spawn rules: missing or invalid = show; only real off/sound entries are kept', () => {
  assert.equal(P.spawnRuleFor(undefined, 'diamond', 'rare'), P.SPAWN_RULE_SHOW);
  assert.equal(P.spawnRuleFor({}, 'diamond', 'rare'), P.SPAWN_RULE_SHOW);
  const rules = { 'diamond|rare': 0, 'kyber|rare': 2, 'gold|epic': 1, 'gold|mythic': 7, 'nope|rare': 0, 'diamond|mythic': '2' };
  assert.equal(P.spawnRuleFor(rules, 'diamond', 'rare'), P.SPAWN_RULE_OFF);
  assert.equal(P.spawnRuleFor(rules, 'kyber', 'rare'), P.SPAWN_RULE_SOUND);
  assert.equal(P.spawnRuleFor(rules, 'gold', 'mythic'), P.SPAWN_RULE_SHOW, 'an out-of-range value falls back to show');
  assert.equal(P.spawnRuleFor(rules, 'diamond', 'mythic'), P.SPAWN_RULE_SHOW, 'a string is not a rule');
  assert.deepEqual(P.cleanSpawnRules(rules), { 'diamond|rare': 0, 'kyber|rare': 2 });
  assert.deepEqual(P.cleanSpawnRules(null), {});
});

test('a line staying on screen alerts once; one read missing it does not re-alert', () => {
  const tr = P.createSpawnTracker(8000);
  const d = { variant: 'diamond', tier: 'rare' };
  assert.equal(tr.update([d], 0).length, 1);
  assert.equal(tr.update([d], 1500).length, 0);
  assert.equal(tr.update([], 3000).length, 0);     // OCR missed it this time
  assert.equal(tr.update([d], 4500).length, 0);    // still the same line
  assert.equal(tr.update([d, d], 6000).length, 1); // a second identical spawn appeared under it
  assert.equal(tr.update([], 9000).length, 0);
  assert.equal(tr.update([d], 15000).length, 1);   // gone for > 8 s: a new spawn
  tr.reset();
  assert.equal(tr.update([d], 16000).length, 1);   // reset forgets everything
});
