'use strict';
/* ---------------------------------------------------------------------------
   Crash-safe JSON persistence for the main process (store + settings).

   Before v1.7.6, saves wrote straight into droid-tycoon-store.json. A crash,
   power cut or forced shutdown mid-write could leave that file truncated or
   empty; the next launch would back it up as *.corrupt-*.bak and start with
   no progress at all.

   Now every save:
     1. writes the new JSON to <file>.tmp and fsyncs it to disk,
     2. copies the current (last good) file to <file>.bak,
     3. renames <file>.tmp over <file>, which replaces it in one step.
   So <file> is always either the old version or the new one, never half of
   each. If <file> is ever unreadable anyway (disk trouble, a bad hand edit),
   loadJson keeps a copy of the broken file and falls back to <file>.bak, the
   previous good save, instead of starting empty.

   The on-disk format is unchanged: same file names, same plain JSON.
   Pure Node (fs/path only) so test/persistence.test.js runs without Electron.
--------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);

function isPlainObject(v){
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Returns { missing:true } | { ok:true, data } | { ok:false }
function readJsonObject(filePath){
  let raw;
  try{ raw = fs.readFileSync(filePath, 'utf8'); }
  catch(e){ return { missing: true }; }
  try{
    const data = JSON.parse(raw);
    return isPlainObject(data) ? { ok: true, data } : { ok: false };
  }catch(e){
    return { ok: false };
  }
}

// Blocks the main process briefly. Only used between rename retries, which
// only happen when antivirus/indexing briefly holds the file open on Windows.
function sleepSync(ms){
  try{ Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }catch(e){ /* best-effort */ }
}

function loadJson(filePath, fallback){
  const main = readJsonObject(filePath);
  if(main.missing) return { ...fallback }; // first launch, nothing to lose
  if(main.ok) return { ...fallback, ...main.data };

  // The file exists but isn't a valid JSON object. Keep a copy of it before
  // anything can overwrite it, then fall back to the previous good save.
  try{ fs.copyFileSync(filePath, filePath + '.corrupt-' + Date.now() + '.bak'); }catch(e){ /* best-effort */ }
  const bak = readJsonObject(filePath + '.bak');
  if(bak.ok){
    console.warn('Recovered', filePath, 'from its .bak copy (the main file was unreadable)');
    return { ...fallback, ...bak.data };
  }
  return { ...fallback };
}

function saveJsonNow(filePath, data){
  const json = JSON.stringify(data, null, 2);
  const tmp = filePath + '.tmp';
  try{
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    try{
      fs.writeSync(fd, json, 0, 'utf8');
      fs.fsyncSync(fd); // make sure the bytes are on disk before the rename points at them
    }finally{
      fs.closeSync(fd);
    }
  }catch(e){
    console.error('Failed to write', tmp, e);
    return false; // the real file is untouched
  }

  // Keep the last good version as .bak. Skip an empty main file (the classic
  // leftover of a crash under the old direct-write code) so it can never
  // replace a good backup.
  try{
    if(fs.statSync(filePath).size > 0) fs.copyFileSync(filePath, filePath + '.bak');
  }catch(e){ /* no main file yet, or backup failed: not fatal */ }

  for(let attempt = 1; attempt <= 5; attempt++){
    try{
      fs.renameSync(tmp, filePath);
      return true;
    }catch(e){
      if(!RETRYABLE.has(e.code) || attempt === 5){
        console.error('Atomic rename failed for', filePath, e);
        break;
      }
      sleepSync(25 * attempt);
    }
  }

  // Rename kept failing (file locked by another program). Saving the data
  // matters more than atomicity, so fall back to the old direct write.
  try{
    fs.writeFileSync(filePath, json, 'utf8');
    try{ fs.unlinkSync(tmp); }catch(e){ /* leftover .tmp is harmless */ }
    return true;
  }catch(e){
    console.error('Failed to write', filePath, e);
    return false;
  }
}

module.exports = { loadJson, saveJsonNow };
