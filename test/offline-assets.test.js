// v1.19.0: the app ships its OCR engine and fonts instead of downloading them (security review).
// Guards: every OCR worker uses the bundled files, those files exist and go into the exe, and no
// page loads anything from Google Fonts or a code CDN again.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pkg = JSON.parse(read('package.json'));
const main = read('main.js');

test('every OCR worker is created with the bundled files (ocr-options.js)', () => {
  for(const f of ['rebirth-screen-read.js', 'rebirth-level-detect.js', 'spawn-alert.html']){
    const calls = read(f).match(/Tesseract\.createWorker\([^)]*\)\)?/g) || [];
    assert.ok(calls.length >= 1, f + ' has no createWorker');
    calls.forEach(c => assert.match(c, /createWorker\('eng', 1, ocrWorkerOptions\(\)\)/, f + ': ' + c));
  }
  for(const page of ['tracker.html', 'spawn-alert.html']){
    const html = read(page);
    assert.ok(html.indexOf('tesseract.min.js') < html.indexOf('ocr-options.js'), page + ' loads ocr-options.js after tesseract');
  }
});

test('the files main.js serves on fdt://ocr/ exist, ship in the exe, and match ocr-options.js', () => {
  const block = main.slice(main.indexOf('const OCR_FILES = {'), main.indexOf('};', main.indexOf('const OCR_FILES = {')));
  const pairs = [...block.matchAll(/'([^']+)':\s*'([^']+)'/g)].map(m => [m[1], m[2]]);
  assert.strictEqual(pairs.length, 4);
  pairs.forEach(([name, rel]) => {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), rel + ' is missing (npm install?)');
    assert.ok(pkg.build.files.includes(rel), rel + ' is not in package.json build.files');
    // electron-builder nests a dependency's dependency under its parent in the exe
    // (node_modules/tesseract.js/node_modules/...), so every package served must be a DIRECT one
    const pkgName = rel.split('/')[1].startsWith('@') ? rel.split('/').slice(1, 3).join('/') : rel.split('/')[1];
    assert.ok(pkg.dependencies[pkgName], pkgName + ' must be a direct dependency, or the exe has it at another path');
  });
  const names = pairs.map(p => p[0]);
  const opts = read('ocr-options.js');
  assert.match(opts, /workerPath: 'fdt:\/\/ocr\/worker\.min\.js'/);
  assert.ok(names.includes('worker.min.js'));
  assert.ok(names.includes('core/tesseract-core-simd-lstm.wasm.js') && names.includes('core/tesseract-core-lstm.wasm.js'));
  assert.ok(names.includes('lang/eng.traineddata.gz'));
  assert.match(opts, /corePath: 'fdt:\/\/ocr\/core', langPath: 'fdt:\/\/ocr\/lang'/);
  assert.ok(pkg.dependencies['@tesseract.js-data/eng'], 'the language data is a saved dependency');
  // only listed names are served: no path is built from the request
  assert.match(main, /Object\.prototype\.hasOwnProperty\.call\(OCR_FILES, name\)/);
  assert.match(main, /protocol\.registerSchemesAsPrivileged\(\[\{ scheme: 'fdt'/);
});

test('fonts ship with the app: every page uses fonts/fonts.css, every font file it names exists', () => {
  const css = read('fonts/fonts.css');
  const files = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]);
  assert.ok(files.length >= 30);
  files.forEach(f => assert.ok(fs.existsSync(path.join(ROOT, 'fonts', f)), 'fonts/' + f + ' missing'));
  ['Rajdhani', 'IBM-Plex-Mono', 'Inter'].forEach(n => assert.match(read('fonts/OFL-' + n + '.txt'), /SIL OPEN FONT LICENSE Version 1\.1/));
  assert.ok(pkg.build.files.includes('fonts/**'));
  for(const page of ['tracker.html', 'overlay.html', 'declutter.html', 'sneak-preview.html', 'rebirth-requirements-overlay.html', 'crit-guide-overlay.html']){
    assert.match(read(page), /<link rel="stylesheet" href="fonts\/fonts\.css">/, page);
  }
});

test('no page or script of the app loads from Google Fonts or a code CDN', () => {
  const appFiles = fs.readdirSync(ROOT).filter(f => /\.(html|js|css)$/.test(f) && !/^(icons-data|card-icons-data)\.js$/.test(f));
  appFiles.forEach(f => {
    const text = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(text, /fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\./, f);
  });
});
