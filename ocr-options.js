/* v1.19.0: where the OCR engine (tesseract.js) loads its parts from. Before this, every
   Tesseract.createWorker('eng') downloaded its worker script, its WebAssembly core and the
   English data from cdn.jsdelivr.net the first time it ran, i.e. code from the internet.
   Now they ship with the app:
   - in the app (file:// pages), main.js serves exactly those files on fdt://ocr/ (a worker
     can't fetch() a file:// URL, so they need an address of their own; see OCR_FILES there);
   - in a browser preview (node test/helpers/static-server.js), the same files are read from
     node_modules on the local server.
   Used by rebirth-screen-read.js, rebirth-level-detect.js (tracker.html) and spawn-alert.html. */
function ocrWorkerOptions(){
  if(location.protocol === 'file:'){
    return { workerPath: 'fdt://ocr/worker.min.js', corePath: 'fdt://ocr/core', langPath: 'fdt://ocr/lang',
      gzip: true, cacheMethod: 'none' };
  }
  const local = rel => new URL(rel, document.baseURI).href;
  return { workerPath: local('node_modules/tesseract.js/dist/worker.min.js'), corePath: local('node_modules/tesseract.js-core'),
    langPath: local('node_modules/@tesseract.js-data/eng/4.0.0_best_int'), gzip: true, cacheMethod: 'none' };
}
