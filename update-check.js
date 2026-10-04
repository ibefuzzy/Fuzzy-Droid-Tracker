'use strict';
/* v1.18.0 "update available" notice: the pure parts, used by main.js (and unit-tested in
   test/update-check.test.js). The app reads ONE small public file, UPDATE_URL, at most once a
   day; it sends nothing about the player. Notify only: nothing is downloaded or installed. */

const UPDATE_URL = 'https://ibefuzzy.github.io/version.json';
const RELEASES_URL = 'https://github.com/ibefuzzy/Fuzzy-Droid-Tracker/releases';
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 4096;

// "1.18.0" -> [1,18,0]; anything else -> null
function parseVersion(v){
  if(typeof v !== 'string') return null;
  const m = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(v.trim());
  return m ? [+m[1], +m[2], +m[3]] : null;
}

// true only when `latest` is strictly newer than `current`; unreadable input is never "newer"
function isNewerVersion(latest, current){
  const a = parseVersion(latest), b = parseVersion(current);
  if(!a || !b) return false;
  for(let i = 0; i < 3; i++){
    if(a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

// version.json text -> { version, note } or null. The note is plain text (the tracker shows it with
// textContent), trimmed and capped; the download link is never read from the file.
function parseUpdateInfo(text){
  if(typeof text !== 'string' || text.length > MAX_BYTES) return null;
  let j;
  try{ j = JSON.parse(text); }catch(e){ return null; }
  if(!j || typeof j !== 'object' || !parseVersion(j.version)) return null;
  const note = typeof j.note === 'string' ? j.note.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  return { version: j.version.trim().replace(/^v/, ''), note };
}

// Is it time to ask again? (never checked, a clock that went backwards, or a day has passed)
function checkIsDue(lastCheckMs, nowMs){
  if(typeof lastCheckMs !== 'number' || !isFinite(lastCheckMs) || lastCheckMs <= 0) return true;
  if(lastCheckMs > nowMs) return true;
  return nowMs - lastCheckMs >= CHECK_EVERY_MS;
}

// The banner shows when the saved info is newer than this build and wasn't dismissed.
function pendingUpdate(info, currentVersion, dismissedVersion){
  if(!info || !isNewerVersion(info.version, currentVersion)) return null;
  if(dismissedVersion && dismissedVersion === info.version) return null;
  return info;
}

module.exports = { UPDATE_URL, RELEASES_URL, CHECK_EVERY_MS, MAX_BYTES,
  parseVersion, isNewerVersion, parseUpdateInfo, checkIsDue, pendingUpdate };
