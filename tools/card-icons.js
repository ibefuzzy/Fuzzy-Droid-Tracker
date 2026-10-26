#!/usr/bin/env node
'use strict';
/* Droid pictures for card-icons-data.js (v1.21.0). Rebuilt in a cloud session after the PC that
   held the old local-only tools (build-gonk-icons.js, build-kyber-card-icons.js,
   build-missing-card-icons.js) died; this one is tracked in git so it can't be lost the same way.
   The SOURCE pictures stay local-only (card-sources/ is in .gitignore and out of the exe).

   Every slot's picture is a 96x96 WebP: the droid cut out on a transparent background, fitted
   to about 92 px and centred (the same as the 600 pictures from before Cycle 6).

     node tools/card-icons.js status
         Which droid + rarity pictures are missing, and the file name to give each source picture.
     node tools/card-icons.js add <folder> [--dry-run] [--replace] [--sheet out.png]
                                  [--crop x,y,w,h] [--tol 60] [--step 10] [--hole 12]
         Reads every source picture in <folder>, named "<Droid>__<Rarity>.png" (or .jpg/.webp),
         or <folder>/<Rarity>/<Droid>.png. Rarity is a name (Base, Gold, Diamond, Rainbow, Beskar,
         Galactic, Stellar, Kyber) or its letter (B G D R K X S Y). Droid names match the way the
         app matches them (case, spaces and dashes don't matter: "jo9 4mn" = "JO9-4MN").
         A picture that already has a transparent background is used as it is; otherwise the
         background is removed by growing it in from the edges (--tol: how far from the edge
         colour it may drift, --step: how much neighbouring pixels may differ; raise both for
         busy backgrounds, lower them if the droid gets eaten; --hole: how close a pocket enclosed
         by the droid must be to the background colour to be cleared). --crop cuts every source first
         (fractions 0-1 or pixels), for a batch of same-layout screenshots.
         The picture goes into EVERY slot of that droid + rarity that has none yet (so the
         one-picture-per-droid-and-rarity rule in test/card-icons.test.js holds); with --replace
         it also replaces the ones that already have a picture. Existing bytes of
         card-icons-data.js are never rewritten: new slots are appended before the closing brace.
         --sheet writes a contact sheet (each new picture large, on a checkerboard, labelled) to
         eyeball before committing. Always look at it: a picture is keyed by POSITION.

   After adding: npm test (test/card-icons.test.js), then copy CARD_ICONS into the website's
   tracker/icons-data.js ICONS (same keys) and bump its ?v= stamps. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'card-icons-data.js');
const SIZE = 96, FIT = 92;
const RARITY_WORDS = { base: 'B', default: 'B', gold: 'G', diamond: 'D', rainbow: 'R', beskar: 'K', galactic: 'X', stellar: 'S', kyber: 'Y' };
const RNAME = { B: 'Base', G: 'Gold', D: 'Diamond', R: 'Rainbow', K: 'Beskar', X: 'Galactic', S: 'Stellar', Y: 'Kyber' };
const EXT = /\.(png|jpe?g|webp)$/i;

const normKey = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, '');

/** CYCLES from droid-data.js and CARD_ICONS from card-icons-data.js (or the given text). */
function loadData(cardText){
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'droid-data.js'), 'utf8') + ';this.CYCLES=CYCLES;', ctx);
  vm.runInContext((cardText ?? fs.readFileSync(DATA_FILE, 'utf8')) + ';this.CARD_ICONS=CARD_ICONS;', ctx);
  return { CYCLES: ctx.CYCLES, CARD_ICONS: ctx.CARD_ICONS };
}

/** Every slot, grouped by droid + rarity: Map("nk|code" -> {name, code, keys:[...]}), in table order. */
function slotGroups(CYCLES){
  const groups = new Map();
  for(const c of Object.keys(CYCLES)) CYCLES[c].forEach((row, l) => row.forEach(([code, name], s) => {
    if(code === '?') return;
    const id = normKey(name) + '|' + code;
    if(!groups.has(id)) groups.set(id, { name, code, keys: [] });
    groups.get(id).keys.push(`${c}-${l + 1}-${s}`);
  }));
  return groups;
}

/** The droid + rarity groups with at least one slot that has no picture. */
function missingGroups(CYCLES, CARD_ICONS){
  return [...slotGroups(CYCLES).values()].filter((g) => g.keys.some((k) => !CARD_ICONS[k]));
}

/** "KT__Gold.png" or "Gold/KT.png" -> {nk, code} | {error}. */
function parseSourceName(rel, groups){
  const parts = rel.split(/[\\/]/);
  const file = parts.pop().replace(EXT, '');
  let droid, rar;
  if(file.includes('__')){ [droid, rar] = file.split('__'); }
  else if(parts.length){ droid = file; rar = parts[parts.length - 1]; }
  else return { error: 'name it "<Droid>__<Rarity>" or put it in a <Rarity> folder' };
  const code = RARITY_WORDS[String(rar).toLowerCase()] || (/^[BGDRKXSY]$/i.test(rar) ? rar.toUpperCase() : null);
  if(!code) return { error: `"${rar}" isn't a rarity` };
  const nk = normKey(droid);
  const known = [...groups.values()].some((g) => normKey(g.name) === nk);
  if(!known) return { error: `"${droid}" isn't a droid in droid-data.js` };
  if(!groups.has(nk + '|' + code)) return { error: `${droid} is never asked for at ${RNAME[code]}` };
  return { nk, code };
}

/** Source picture -> transparent cut-out (raw RGBA + size), before fitting. */
async function cutOut(sharp, file, opts = {}){
  let img = sharp(file).ensureAlpha();
  const meta = await sharp(file).metadata();
  if(opts.crop){
    let [x, y, w, h] = opts.crop;
    if([x, y, w, h].every((v) => v <= 1)){ x *= meta.width; y *= meta.height; w *= meta.width; h *= meta.height; }
    img = img.extract({ left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h) });
  }
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const alpha = new Uint8Array(N);
  for(let i = 0; i < N; i++) alpha[i] = data[i * 4 + 3];

  // already transparent round the edge (a game-asset portrait): keep its own alpha
  let border = 0, clear = 0;
  for(let x = 0; x < W; x++) for(const y of [0, H - 1]){ border++; if(alpha[y * W + x] < 32) clear++; }
  for(let y = 0; y < H; y++) for(const x of [0, W - 1]){ border++; if(alpha[y * W + x] < 32) clear++; }
  if(clear / border > 0.6) return { data, W, H, removed: false };

  // otherwise grow the background in from every edge pixel
  const tol = opts.tol ?? 60, step = opts.step ?? 10;
  let mr = 0, mg = 0, mb = 0, n = 0;
  const edge = [];
  for(let x = 0; x < W; x++){ edge.push(x, (H - 1) * W + x); }
  for(let y = 1; y < H - 1; y++){ edge.push(y * W, y * W + W - 1); }
  for(const p of edge){ mr += data[p * 4]; mg += data[p * 4 + 1]; mb += data[p * 4 + 2]; n++; }
  mr /= n; mg /= n; mb /= n;
  const dist = (p, r, g, b) => Math.hypot(data[p * 4] - r, data[p * 4 + 1] - g, data[p * 4 + 2] - b);
  const bg = new Uint8Array(N);
  const queue = new Int32Array(N);
  let head = 0, tail = 0;
  for(const p of edge) if(!bg[p] && dist(p, mr, mg, mb) <= tol){ bg[p] = 1; queue[tail++] = p; }
  while(head < tail){
    const p = queue[head++], x = p % W, y = (p / W) | 0;
    const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
    for(const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]){
      if(q < 0 || bg[q]) continue;
      if(dist(q, r, g, b) <= step && dist(q, mr, mg, mb) <= tol){ bg[q] = 1; queue[tail++] = q; }
    }
  }
  // background showing through gaps INSIDE the droid (between arms and legs) can't be reached
  // from the edge: clear enclosed pockets close to that row's background colour (--hole)
  const holeTol = opts.hole ?? 12;
  const rowBg = new Float32Array(H * 3).fill(NaN);
  for(let y = 0; y < H; y++){
    let r = 0, g = 0, b = 0, k = 0;
    for(let x = 0; x < W; x++){ const p = y * W + x; if(bg[p]){ r += data[p * 4]; g += data[p * 4 + 1]; b += data[p * 4 + 2]; k++; } }
    if(k){ rowBg[y * 3] = r / k; rowBg[y * 3 + 1] = g / k; rowBg[y * 3 + 2] = b / k; }
  }
  const nearBg = (p) => { const y = (p / W) | 0; return !isNaN(rowBg[y * 3]) && dist(p, rowBg[y * 3], rowBg[y * 3 + 1], rowBg[y * 3 + 2]) <= holeTol; };
  const seen = new Uint8Array(N), minHole = Math.max(12, Math.round(N * 0.0004));
  for(let p0 = 0; p0 < N; p0++){
    if(bg[p0] || seen[p0] || !nearBg(p0)) continue;
    head = 0; tail = 0; queue[tail++] = p0; seen[p0] = 1;
    while(head < tail){
      const p = queue[head++], x = p % W, y = (p / W) | 0;
      for(const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]){
        if(q >= 0 && !bg[q] && !seen[q] && nearBg(q)){ seen[q] = 1; queue[tail++] = q; }
      }
    }
    if(tail >= minHole) for(let i = 0; i < tail; i++) bg[queue[i]] = 1;
  }
  // keep the biggest foreground piece (drops specks of UI or noise the fill left behind)
  const label = new Int32Array(N).fill(-1);
  let best = -1, bestSize = 0, id = 0;
  for(let p0 = 0; p0 < N; p0++){
    if(bg[p0] || label[p0] !== -1) continue;
    let size = 0; head = 0; tail = 0; queue[tail++] = p0; label[p0] = id;
    while(head < tail){
      const p = queue[head++], x = p % W, y = (p / W) | 0; size++;
      for(const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]){
        if(q >= 0 && !bg[q] && label[q] === -1){ label[q] = id; queue[tail++] = q; }
      }
    }
    if(size > bestSize){ bestSize = size; best = id; }
    id++;
  }
  for(let p = 0; p < N; p++) data[p * 4 + 3] = (label[p] === best && best !== -1) ? Math.min(alpha[p], 255) : 0;
  // soften the cut by a pixel so it doesn't look stamped out (a 3x3 blur of the mask, only ever
  // lowering alpha at the edge; done here, not in sharp, which hands a 1-channel raw back as 3)
  const hard = new Uint8Array(N);
  for(let p = 0; p < N; p++) hard[p] = data[p * 4 + 3];
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
    let sum = 0, wsum = 0;
    for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){
      const xx = x + dx, yy = y + dy, w = (dx && dy) ? 1 : (dx || dy) ? 2 : 4;
      wsum += w; if(xx >= 0 && yy >= 0 && xx < W && yy < H) sum += w * hard[yy * W + xx];
    }
    const soft = sum / wsum, p = y * W + x;
    data[p * 4 + 3] = Math.min(hard[p], soft < 40 ? 0 : Math.round(soft));
  }
  return { data, W, H, removed: true };
}

/** A cut-out -> the 96x96 transparent WebP every slot uses (base64), plus its PNG for the sheet. */
async function fitPicture(sharp, cut){
  const trimmed = await sharp(cut.data, { raw: { width: cut.W, height: cut.H, channels: 4 } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 16 }).png().toBuffer();
  const fitted = await sharp(trimmed).resize(FIT, FIT, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' }).png().toBuffer();
  const png = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fitted, gravity: 'center' }]).png().toBuffer();
  const webp = await sharp(png).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toBuffer();
  return { b64: webp.toString('base64'), png };
}

/** Put pictures into card-icons-data.js's text: new keys appended before the closing brace,
    existing keys (only with replace) swapped in place. Returns the new text. */
function insertPictures(text, CARD_ICONS, picturesByKey, replace){
  if(!text.endsWith('"};\n')) throw new Error('card-icons-data.js does not end with "};\\n"; not touching it');
  let out = text, add = '';
  for(const [k, b64] of Object.entries(picturesByKey)){
    if(!/^UklGR/.test(b64)) throw new Error(`${k}: not a WebP`);
    if(CARD_ICONS[k] === undefined){ add += ',' + JSON.stringify(k) + ':' + JSON.stringify(b64); continue; }
    if(!replace) continue;
    const old = JSON.stringify(k) + ':' + JSON.stringify(CARD_ICONS[k]);
    if(out.split(old).length !== 2) throw new Error(`${k}: its entry isn't unique in the file`);
    out = out.replace(old, JSON.stringify(k) + ':' + JSON.stringify(b64));
  }
  return out.slice(0, -3) + add + '};\n';
}

/** Contact sheet: each picture at 2x on a checkerboard with its label. */
async function contactSheet(sharp, items, file){
  const cell = 210, cols = Math.min(6, Math.max(1, items.length)), rows = Math.ceil(items.length / cols) || 1;
  const checker = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell * cols}" height="${cell * rows}"><defs><pattern id="c" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#2a2a2e"/><rect width="8" height="8" fill="#3a3a40"/><rect x="8" y="8" width="8" height="8" fill="#3a3a40"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`);
  const esc = (t) => String(t).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
  const layers = [];
  for(let i = 0; i < items.length; i++){
    const x = (i % cols) * cell, y = Math.floor(i / cols) * cell;
    layers.push({ input: await sharp(items[i].png).resize(SIZE * 2, SIZE * 2, { kernel: 'nearest' }).toBuffer(), left: x + 9, top: y + 4 });
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="16"><text x="${cell / 2}" y="12" fill="#fff" font-family="sans-serif" font-size="12" text-anchor="middle">${esc(items[i].label)}</text></svg>`), left: x, top: y + 196 });
  }
  await sharp(checker).composite(layers).png().toFile(file);
}

function sourceFiles(folder){
  const out = [];
  (function walk(dir, rel){
    for(const e of fs.readdirSync(dir, { withFileTypes: true })){
      const r = rel ? rel + '/' + e.name : e.name;
      if(e.isDirectory()) walk(path.join(dir, e.name), r);
      else if(EXT.test(e.name)) out.push({ abs: path.join(dir, e.name), rel: r });
    }
  })(folder, '');
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

async function main(argv){
  const [cmd, ...rest] = argv;
  const flag = (name) => { const i = rest.indexOf(name); return i === -1 ? null : (rest[i + 1] ?? ''); };
  const has = (name) => rest.includes(name);
  const { CYCLES, CARD_ICONS } = loadData();
  const groups = slotGroups(CYCLES);

  if(cmd === 'status' || !cmd){
    const miss = missingGroups(CYCLES, CARD_ICONS);
    if(!miss.length){ console.log('Every slot has a picture.'); return 0; }
    console.log(`${miss.length} droid + rarity pictures missing (${miss.reduce((n, g) => n + g.keys.filter((k) => !CARD_ICONS[k]).length, 0)} slots). Source file names:`);
    for(const g of miss) console.log(`  ${g.name}__${RNAME[g.code]}.png`.padEnd(30) + `-> ${g.keys.filter((k) => !CARD_ICONS[k]).join(', ')}`);
    return 1;
  }
  if(cmd !== 'add' || !rest[0] || rest[0].startsWith('--')){ console.error('usage: node tools/card-icons.js status | add <folder> [--dry-run] [--replace] [--sheet out.png] [--crop x,y,w,h] [--tol n] [--step n] [--hole n]'); return 2; }

  let sharp;
  try{ sharp = require('sharp'); } catch(e){ console.error('sharp is missing: run npm install first'); return 2; }
  const folder = path.resolve(rest[0]);
  const opts = {
    tol: flag('--tol') ? Number(flag('--tol')) : undefined,
    step: flag('--step') ? Number(flag('--step')) : undefined,
    hole: flag('--hole') ? Number(flag('--hole')) : undefined,
    crop: flag('--crop') ? flag('--crop').split(',').map(Number) : null,
  };
  if(opts.crop && (opts.crop.length !== 4 || opts.crop.some((v) => !(v >= 0)))){ console.error('--crop takes x,y,w,h'); return 2; }
  const replace = has('--replace'), dry = has('--dry-run'), sheet = flag('--sheet');

  const picturesByKey = {}, sheetItems = [], problems = [];
  for(const f of sourceFiles(folder)){
    const parsed = parseSourceName(f.rel, groups);
    if(parsed.error){ problems.push(`${f.rel}: ${parsed.error}`); continue; }
    const g = groups.get(parsed.nk + '|' + parsed.code);
    const targets = g.keys.filter((k) => replace || !CARD_ICONS[k]);
    if(!targets.length){ problems.push(`${f.rel}: ${g.name} ${RNAME[g.code]} already has a picture (use --replace to swap it)`); continue; }
    if(!replace && targets.length !== g.keys.length){
      // some slots of this droid + rarity already have a picture: reuse it, so every slot matches
      const existing = CARD_ICONS[g.keys.find((k) => CARD_ICONS[k])];
      targets.forEach((k) => { picturesByKey[k] = existing; });
      problems.push(`${f.rel}: ${g.name} ${RNAME[g.code]} already had a picture in other slots; reused that one`);
      continue;
    }
    const cut = await cutOut(sharp, f.abs, opts);
    const pic = await fitPicture(sharp, cut);
    targets.forEach((k) => { picturesByKey[k] = pic.b64; });
    sheetItems.push({ png: pic.png, label: `${g.name} ${RNAME[g.code]}${cut.removed ? '' : ' (own alpha)'}` });
    console.log(`${f.rel} -> ${g.name} ${RNAME[g.code]}: ${targets.join(', ')}${cut.removed ? ' (background removed)' : ''}`);
  }
  problems.forEach((p) => console.warn('! ' + p));
  if(sheet && sheetItems.length){ await contactSheet(sharp, sheetItems, path.resolve(sheet)); console.log('contact sheet: ' + path.resolve(sheet)); }
  const count = Object.keys(picturesByKey).length;
  if(!count){ console.log('Nothing to add.'); return problems.length ? 1 : 0; }
  const text = fs.readFileSync(DATA_FILE, 'utf8');
  const next = insertPictures(text, CARD_ICONS, picturesByKey, replace);
  if(dry){ console.log(`--dry-run: would write ${count} slot(s).`); return 0; }
  fs.writeFileSync(DATA_FILE, next, 'utf8');
  const after = missingGroups(...Object.values(loadData(next)));
  console.log(`Wrote ${count} slot(s) to card-icons-data.js. Still missing: ${after.length} droid + rarity picture(s) (node tools/card-icons.js status).`);
  return 0;
}

module.exports = { normKey, loadData, slotGroups, missingGroups, parseSourceName, cutOut, fitPicture, insertPictures, SIZE, FIT };
if(require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(e); process.exitCode = 2; });
