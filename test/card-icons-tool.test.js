'use strict';
/* tools/card-icons.js (v1.21.0), the rebuilt picture tool. Needs sharp (a dependency); skipped
   where it isn't installed. Fakes a screenshot from a real picture: scaled up and pasted onto a
   gradient card background with a stray UI speck, then checks the cut-out keeps the droid's
   shape, comes out in the same 96x96 transparent WebP format as every other slot, and that
   adding pictures never rewrites the bytes already in card-icons-data.js. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tool = require('../tools/card-icons.js');

let sharp = null;
try { sharp = require('sharp'); } catch (e) { /* skipped below */ }
const skip = sharp ? false : 'sharp is not installed (npm install)';

const { CYCLES, CARD_ICONS } = tool.loadData();
const groups = tool.slotGroups(CYCLES);

// the droid's outline, trimmed to its own box and stretched to size x size, so two pictures of
// the same droid fitted to slightly different heights (89 px before, 92 px from the tool) compare
async function alphaMask(buf, size){
  const trimmed = await sharp(buf).ensureAlpha().trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 16 }).png().toBuffer();
  const { data } = await sharp(trimmed).resize(size, size, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const m = new Uint8Array(size * size);
  for (let i = 0; i < m.length; i++) m[i] = data[i * 4 + 3] > 96 ? 1 : 0;
  return m;
}
function iou(a, b){ let i = 0, u = 0; for (let p = 0; p < a.length; p++){ if (a[p] && b[p]) i++; if (a[p] || b[p]) u++; } return u ? i / u : 1; }

test('source names: "<Droid>__<Rarity>" or "<Rarity>/<Droid>", matched like the app matches names', () => {
  assert.deepStrictEqual(tool.parseSourceName('KT__Gold.png', groups), { nk: 'kt', code: 'G' });
  assert.deepStrictEqual(tool.parseSourceName('jo9 4mn__Y.webp', groups), { nk: 'jo94mn', code: 'Y' });
  assert.deepStrictEqual(tool.parseSourceName('Stellar/ECG.jpg', groups), { nk: 'ecg', code: 'S' });
  assert.ok(tool.parseSourceName('KT__Shiny.png', groups).error, 'not a rarity');
  assert.ok(tool.parseSourceName('Zorp__Gold.png', groups).error, 'not a droid');
  assert.ok(tool.parseSourceName('ECG__Diamond.png', groups).error, 'ECG is never asked for at Diamond');
  assert.ok(tool.parseSourceName('KT.png', groups).error, 'no rarity at all');
});

test('a gradient-background screenshot is cut out to the droid, in the 96x96 transparent WebP format', { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdt-cards-'));
  try {
    for (const key of ['1-1-0', '5-40-0', '3-25-1']) { // a few different droids and shapes
      const orig = Buffer.from(CARD_ICONS[key], 'base64');
      const big = await sharp(orig).resize(288, 288, { kernel: 'nearest' }).png().toBuffer();
      const bg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="420" height="520"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2a44"/><stop offset="1" stop-color="#0c1220"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect x="380" y="20" width="14" height="14" fill="#ffd040"/></svg>');
      const file = path.join(dir, key + '.png');
      await sharp(bg).composite([{ input: big, left: 66, top: 116 }]).png().toFile(file);
      const cut = await tool.cutOut(sharp, file);
      assert.ok(cut.removed, 'background should have been removed');
      const pic = await tool.fitPicture(sharp, cut);
      const meta = await sharp(Buffer.from(pic.b64, 'base64')).metadata();
      assert.deepStrictEqual([meta.format, meta.width, meta.height, meta.hasAlpha], ['webp', 96, 96, true]);
      const score = iou(await alphaMask(orig, 96), await alphaMask(Buffer.from(pic.b64, 'base64'), 96));
      assert.ok(score > 0.85, `${key}: cut-out matches the original's shape only ${score.toFixed(2)}`);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a source that is already transparent keeps its own alpha', { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdt-cards-'));
  try {
    const orig = Buffer.from(CARD_ICONS['2-1-1'], 'base64');
    const file = path.join(dir, 'own.png');
    await sharp(orig).resize(192, 192).png().toFile(file);
    const cut = await tool.cutOut(sharp, file);
    assert.strictEqual(cut.removed, false);
    const pic = await tool.fitPicture(sharp, cut);
    assert.ok(iou(await alphaMask(orig, 96), await alphaMask(Buffer.from(pic.b64, 'base64'), 96)) > 0.85);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('adding pictures appends new slots and never rewrites the existing bytes', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'card-icons-data.js'), 'utf8');
  const pic = CARD_ICONS['1-1-0'];
  const next = tool.insertPictures(text, CARD_ICONS, { '9-9-9': pic, '1-1-0': CARD_ICONS['1-1-1'] }, false);
  assert.strictEqual(next.slice(0, text.length - 3), text.slice(0, -3), 'existing bytes changed');
  assert.ok(next.endsWith(',"9-9-9":' + JSON.stringify(pic) + '};\n'));
  assert.ok(!next.includes('"1-1-0":' + JSON.stringify(CARD_ICONS['1-1-1'])), 'an existing slot was replaced without --replace');
  const swapped = tool.insertPictures(text, CARD_ICONS, { '1-1-0': CARD_ICONS['1-1-1'] }, true);
  assert.ok(swapped.includes('"1-1-0":' + JSON.stringify(CARD_ICONS['1-1-1'])), '--replace swaps it');
  assert.throws(() => tool.insertPictures(text, CARD_ICONS, { '9-9-9': 'not a webp' }, false));
});
