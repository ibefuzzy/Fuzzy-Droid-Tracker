'use strict';
/* v1.19.0 🌐 Live Friends: the pure parts main.js uses (unit-tested in test/live-sync.test.js).
   Opt-in (settings.liveFriends, off by default). While on, the app sends ONE thing to the
   Friends server (worker/live-friends-worker.mjs): your friend code, the same text you could
   paste in Discord, under a random share ID, signed with a secret key that never leaves this
   PC. It saves only when your code changes, at most every SAVE_GAP_MS, and reads friends'
   codes about every POLL_MS while the Friends panel or the HUD friend view is showing. */

const LIVE_SERVER = 'https://fdt-live.ibefuzzy.workers.dev'; // the Worker (worker/live-friends-worker.mjs) on Cloudflare
const SAVE_GAP_MS = 2 * 60 * 1000;            // at most one save every 2 min
const SAVE_SETTLE_MS = 8 * 1000;              // wait for a burst of marks to finish
const POLL_MS = 90 * 1000;
const POLL_SLOW_MS = 5 * 60 * 1000;           // once friends haven't changed for a while (a tracker left open all day)
const POLL_SLOW_AFTER = 4;                    // unchanged checks in a row (~6 min) before slowing down
const RETRY_OFFLINE_MS = 5 * 60 * 1000;
const RETRY_BUSY_MS = 60 * 60 * 1000;
const MAX_RESPONSE_BYTES = 16 * 1024;
const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_RE = /^[A-Za-z0-9]{12}$/;
const KEY_RE = /^[A-Za-z0-9_-]{43}$/;

/** 12 random base62 chars (~71 bits). randomBytes(n) -> Buffer/Uint8Array (crypto.randomBytes). */
function makeShareId(randomBytes){
  let out = '';
  while(out.length < 12){
    for(const b of randomBytes(16)){
      if(b < 248 && out.length < 12) out += BASE62[b % 62]; // 248 = 4*62: no bias
    }
  }
  return out;
}
/** 32 random bytes as base64url (43 chars). */
function makeSecretKey(randomBytes){
  return Buffer.from(randomBytes(32)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function isIdentity(x){ return !!(x && typeof x === 'object' && ID_RE.test(x.id) && KEY_RE.test(x.key)); }

/** How long until the next save may go out: SAVE_SETTLE_MS after a change, but never sooner than
    SAVE_GAP_MS after the last save, nor before a server-requested retry time. */
function saveDelay(lastSavedAt, retryAt, now){
  let at = now + SAVE_SETTLE_MS;
  if(lastSavedAt) at = Math.max(at, lastSavedAt + SAVE_GAP_MS);
  if(retryAt) at = Math.max(at, retryAt);
  return Math.max(0, at - now);
}

/** Wait before the next friends check: POLL_MS, or POLL_SLOW_MS after POLL_SLOW_AFTER checks in a
    row that changed nothing (or got no answer). A change, opening the panel or a new friend resets it. */
function pollDelay(unchangedChecks){
  return unchangedChecks >= POLL_SLOW_AFTER ? POLL_SLOW_MS : POLL_MS;
}

/** A PUT's HTTP status (0 = no answer) -> what to do next. */
function saveOutcome(status, retryAfterSec, now){
  if(status === 200) return { state: 'ok' };
  // the server's "try again in N s", kept between 30 s and an hour (a broken or hostile server can't make us hammer it)
  if(status === 429) return { state: 'saving', retryAt: now + Math.min(3600e3, Math.max(30e3, ((Number(retryAfterSec) || 60) + 1) * 1000)) };
  if(status === 503) return { state: 'busy', retryAt: now + RETRY_BUSY_MS };
  if(status === 403) return { state: 'newId' };                 // our ID expired and someone took it
  if(status === 0 || status >= 500) return { state: 'offline', retryAt: now + RETRY_OFFLINE_MS };
  return { state: 'error' };
}

/** GET /p response text -> {id: {code, updatedAt}} for the asked IDs only, or null when unreadable. */
function parseFriendsResponse(text, askedIds){
  if(typeof text !== 'string' || text.length > MAX_RESPONSE_BYTES) return null;
  let j;
  try{ j = JSON.parse(text); }catch(e){ return null; }
  if(!j || typeof j.friends !== 'object' || !j.friends) return null;
  const out = {};
  askedIds.forEach(id=>{
    const f = Object.prototype.hasOwnProperty.call(j.friends, id) ? j.friends[id] : null;
    if(f && typeof f.code === 'string' && f.code.length <= 200 && /^FDTP1\.[A-Za-z0-9_-]+$/.test(f.code) &&
      typeof f.updatedAt === 'number' && isFinite(f.updatedAt)) out[id] = { code: f.code, updatedAt: f.updatedAt };
  });
  return out;
}

/** A fetch Response's text, read only up to `max` bytes (security review: never buffer an
    unexpectedly huge answer); '' when it's longer, or unreadable. */
async function readCapped(res, max){
  try{
    if(!res.body || !res.body.getReader){ const t = await res.text(); return t.length <= max ? t : ''; }
    const reader = res.body.getReader(), parts = [];
    let n = 0;
    for(;;){
      const { done, value } = await reader.read();
      if(done) break;
      n += value.length;
      if(n > max){ reader.cancel().catch(()=>{}); return ''; }
      parts.push(value);
    }
    const all = new Uint8Array(n);
    let at = 0;
    parts.forEach(p => { all.set(p, at); at += p.length; });
    return new TextDecoder().decode(all);
  }catch(e){ return ''; }
}

/** The stored list after a fetch: found -> 'ok' with the new code; asked but missing -> 'gone',
    keeping the last code it had; not asked (added during the fetch) -> unchanged. Returns {list, changed}. */
function mergeFetched(list, found, askedIds){
  let changed = false;
  const asked = new Set(askedIds);
  const next = list.map(e=>{
    if(!asked.has(e.id)) return e;
    const f = found[e.id];
    const n = f ? { ...e, code: f.code, updatedAt: f.updatedAt, state: 'ok' } : { ...e, state: 'gone' };
    if(n.code !== e.code || n.updatedAt !== e.updatedAt || n.state !== e.state) changed = true;
    return n;
  });
  return { list: next, changed };
}

module.exports = { LIVE_SERVER, SAVE_GAP_MS, SAVE_SETTLE_MS, POLL_MS, POLL_SLOW_MS, POLL_SLOW_AFTER, RETRY_OFFLINE_MS, RETRY_BUSY_MS,
  MAX_RESPONSE_BYTES, makeShareId, makeSecretKey, isIdentity, saveDelay, pollDelay, saveOutcome, parseFriendsResponse, readCapped, mergeFetched };
