'use strict';
/* ---------------------------------------------------------------------------
   Fuzzy's Droid Tracker — Electron shell.

   One normal decorated window (mainWindow, tracker.html) plus a handful of
   transparent/click-through/always-on-top overlay windows, each a
   completely separate OS window showing one piece of glanceable info:
     - overlayWindow    (overlay.html)     — current + next 3 rebirth reqs
     - timersWindow     (timers.html)      — Stellar/Mythic/Kyber/Mission countdowns
     - declutterWindow  (declutter.html)   — "safe to retire" Legendary/Mythic droids
     - rebirthReqWindow (rebirth-requirements-overlay.html) — every droid the
       active cycle asks for, same full list as the tracker's own 🧬 panel
     - sneakWindow (sneak-preview.html) — next cycle's Mythic droids
     - critGuideWindow (crit-guide-overlay.html) — static crit-investment
       purchase order + hit-calculation formula for one specific build
     - spawnAlertWindow (spawn-alert.html) — reads the game's "droid spawned"
       lines off a screen capture and shows each new one big (v1.14.0)
     - hotkeyListWindow (hotkey-list.html) — on-screen hotkey reference card
   None of them ever touch Fortnite's process, memory, or input — they only
   ever read/write this app's own JSON store on disk and draw their own
   pixels. See README.md for why that's the safe category of "overlay".

   All windows share state through a tiny JSON-file store owned by this main
   process (storeGet/storeSet over IPC), so a change made in the tracker
   window (or any overlay) shows up everywhere else immediately.
--------------------------------------------------------------------------- */

const { app, BrowserWindow, ipcMain, globalShortcut, screen, session, desktopCapturer, dialog, net, shell, protocol } = require('electron');
const { pathToFileURL } = require('url');
const updateCheck = require('./update-check.js');
const liveSync = require('./live-sync.js'); // v1.19.0 🌐 Live Friends
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { loadJson, saveJsonNow } = require('./persistence');
const { snapMove, snapResize } = require('./overlay-snap');

// Load shared functions from droid-data.js and requirements.js using vm,
// same pattern as test/helpers/load-shared.js, so the overlay:markDroid and
// overlay:markLevel handlers can use normKey(), canonicalName(), rankOf(), and decideOwnedUpdate()
function loadSharedFunctions(){
  const ctx = vm.createContext({ console, TextEncoder, TextDecoder, atob, btoa }); // the friend code needs these
  for(const f of ['droid-data.js', 'requirements.js']){
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  const run = (code) => vm.runInContext(code, ctx, { filename: '<ipc>' });
  return {
    CYCLES: run('CYCLES'),
    RARITY_ORDER: run('RARITY_ORDER'),
    normKey: run('normKey'),
    canonicalName: run('canonicalName'),
    rankOf: run('rankOf'),
    decideOwnedUpdate: run('decideOwnedUpdate'),
    isRetired: run('isRetired'),
    // v1.18.1: canonicalName() reads the player's renames/merges; the mark handlers set them
    // from the store first, or a merged droid was marked under its un-merged key
    setNameMerges: run('(m) => { nameMerges = (m && typeof m === "object" && !Array.isArray(m)) ? m : {}; }'),
    // v1.19.0 🌐 Live Friends: main.js builds your friend code itself, to save it while Live is on
    encodeFriendCode: run('encodeFriendCode'),
    friendOwnedFromMine: run('friendOwnedFromMine'),
    cleanFriendName: run('cleanFriendName'),
    cycleRealLevelCount: run('cycleRealLevelCount'),
    cleanLiveFriends: run('cleanLiveFriends'),
    LIVE_CODE_PREFIX: run('LIVE_CODE_PREFIX'),
    LIVE_ID_RE: run('LIVE_ID_RE'),
    LIVE_FRIENDS_MAX: run('LIVE_FRIENDS_MAX'),
  };
}
const shared = loadSharedFunctions();

/* v1.19.0: the OCR engine's own files, shipped with the app instead of downloaded from
   cdn.jsdelivr.net at first use. tesseract.js loads them inside a web worker with
   importScripts() and fetch(), and a worker can't fetch() a file:// URL, so they get a private
   address: fdt://ocr/<name> (ocr-options.js). Only the files listed here are served, read from
   the app's own folder; anything else is a 404. The scheme must be registered before 'ready'. */
const OCR_FILES = {
  'worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
  'core/tesseract-core-simd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'core/tesseract-core-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
  'lang/eng.traineddata.gz': 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'
};
// The app's own fonts (fonts/, v1.19.0) for the one window that can't read them from disk: the
// tracker's Pop out (a picture-in-picture window starts as about:blank). Only files in fonts/.
const FONT_FILES = new Set((()=>{
  try{ return fs.readdirSync(path.join(__dirname, 'fonts')).filter(f => /^[a-z0-9-]+\.(woff2|css)$/.test(f)); }catch(e){ return []; }
})());
const APP_FILE_TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
protocol.registerSchemesAsPrivileged([{ scheme: 'fdt', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
async function serveAppFile(request){
  let rel = null;
  try{
    const u = new URL(request.url);
    const name = u.pathname.slice(1);
    if(u.host === 'ocr' && Object.prototype.hasOwnProperty.call(OCR_FILES, name)) rel = OCR_FILES[name];
    else if(u.host === 'app' && name.startsWith('fonts/') && FONT_FILES.has(name.slice(6))) rel = name;
  }catch(e){ /* not a URL: 404 below */ }
  if(!rel) return new Response('', { status: 404 });
  const res = await net.fetch(pathToFileURL(path.join(__dirname, rel)).toString());
  // .gz stays compressed (tesseract unzips it itself); CORS for the worker's fetch() and for fonts
  return new Response(res.body, { status: res.ok ? 200 : 404, headers: { 'Content-Type': APP_FILE_TYPES[path.extname(rel)] || 'application/octet-stream',
    'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

// Two instances would each independently load their own copy of the JSON
// store/settings into memory and each debounce-write to the SAME files on
// disk -- whichever instance's write lands last would silently overwrite
// the other's changes, with real tracked progress lost and no warning on
// either side. Refuse a second launch outright and just focus the window
// the first instance already has open.
const singleInstanceLock = app.requestSingleInstanceLock();
if(!singleInstanceLock){
  app.quit();
}

app.on('second-instance', ()=>{
  if(mainWindow){
    if(mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

const STORE_PATH = path.join(app.getPath('userData'), 'droid-tycoon-store.json');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'overlay-settings.json');

const DEFAULT_SETTINGS = {
  // v1.16.0: EVERY hotkey starts unbound on a fresh install (the user's call): players pick
  // their own in ⚙ Overlay Settings → Keybinds, and the tutorial (guide.js) opens that tab.
  // An existing install keeps whatever its saved settings file holds, so nobody loses keys.
  // The "moved from" notes below are the history of the old defaults (migrateHotkeyLayout()
  // only moves a key still sitting on an old default, so '' never moves).
  hideAllHotkey: '', // one-way ONLY — hides every overlay below, never toggles them back on (was Ctrl+Shift+1 by default, 2026-09-20 to v1.15.1)
  hotkey: '',   // toggles the Current Rebirth Requirements HUD ("Upcoming RB Req's") show/hide, works even while Fortnite is focused (moved from Alt+Shift+D on 2026-09-23 — brought into the same Ctrl+Shift+N family as every other overlay hotkey instead of sitting on its own odd-one-out combo)
  // calibHotkey / craftBenchHotkey retired 2026-09-22 along with the whole
  // Read Crafting Bench feature (see crafting-bench-read.js's own header
  // comment for why) — deliberately no longer in DEFAULT_SETTINGS, so a
  // fresh install never has them. migrateHotkeyLayout() below still reads
  // an EXISTING user's already-saved craftBenchHotkey value from their own
  // settings file (not from this object), so removing it here doesn't
  // affect that migration's correctness for anyone upgrading from an
  // older version.
  timersHotkey: '', // toggles the blueprint/mission countdown banners, same deal (was Alt+Shift+T until v1.15.1)
  rebirthScreenHotkey: '', // fires the 📸 Read Rebirth Screen button, same deal (moved from Ctrl+Shift+5 on 2026-09-23 — shifted down to make room for the new Ctrl+Shift+3 Upcoming RB Req's hotkey below)
  hotkeyListHotkey: '', // toggles the on-screen hotkey reference list, same deal (moved from Ctrl+Shift+1 on 2026-09-20 — freed up for hideAllHotkey above)
  visible: true,
  opacity: 0.55,           // background opacity of the overlay panel, 0.2-0.92
  locked: true,            // false while the user is dragging it into position
  position: null,          // {x,y} in screen pixels; null = use the computed default
  border: 'jedi',          // v1.10.0: this overlay's border skin key, see BORDER_SKINS in requirements.js (replaces the old flat "color")
  timersVisible: true,
  timersLocked: true,
  timersPosition: null,
  missionSyncEpochMs: null, // exact timestamp (ms) of a confirmed live mission moment, set via "Sync mission timer"; null = use the built-in best-guess schedule
  // v1.14.1: seconds BEFORE the next mission to play missionWarnSound (none by
  // default); see cleanMissionWarnTimes()/missionWarningsDue() in requirements.js.
  missionWarnTimes: [],
  missionWarnSound: 'chime',
  missionWarnVolume: 0.35, // its own slider, like spawnAlertVolume
  // v1.18.0 "update available" notice (update-check.js): once a day the app reads one small public
  // file (version.json on the site). Notify only, on by default, switch in ⚙ Overlay Settings → Layout.
  updateCheck: true,
  updateLastCheck: 0,   // ms timestamp of the last successful read
  updateInfo: null,     // {version, note} from the last read
  updateDismissed: '',  // version whose banner the player closed
  // v1.19.0 🌐 Live Friends (live-sync.js): off until the player switches it on in 👥 Friends
  liveFriends: false,
  timerSoundEnabled: false, // v1.10.2: sound notifications for timer expiry (default off for fresh installs)
  timerSoundVolume: 0.35,   // master volume, 0.1–0.8 range
  missionSoundVolumeOverride: false, // use per-timer override instead of master
  missionSoundVolume: 0.35,
  blueprintSoundVolumeOverride: false,
  blueprintSoundVolume: 0.35,
  missionSoundChoice: 'goodnews', // 'goodnews' (alert-sound.js, v1.11.1) | 'beep' | 'boop' | 'chime' | 'off'
  blueprintSoundChoice: 'goodnews',
  soundDefaultVersion: 0, // bumped by migrateSoundDefault(); 0 here so an older settings file (which lacks it) runs that once
  declutterHotkey: '', // toggles the "safe to retire" Legendary/Mythic droid list, same deal (moved from Ctrl+Shift+3 on 2026-09-23 — see hotkey above)
  declutterVisible: true,
  declutterLocked: true,
  declutterPosition: null,
  // Scroll hotkeys for the Declutter list's now-scrollable card viewport
  // (2026-09-23, the same round that added the empty-default convention
  // right below) — the first hotkeys actually built under that convention:
  // unbound by default, player opts in from Settings. Needed at all because
  // a locked overlay is click-through by design (mouse events pass straight
  // to the game), so the only way to move a scroll position on it is a
  // global hotkey — see declutter.html's own scroll-viewport comment.
  // v1.7.3: shared with the Rebirth Requirements overlay too (same fix as
  // the v1.7.2 tier filter) — this one hotkey pair pages whichever of
  // Safe to Retire / Rebirth Requirements is open, instead of each overlay
  // needing its own separate scroll binding. See rebirthReqScrollUpHotkey's
  // retirement note below.
  declutterScrollUpHotkey: '',
  declutterScrollDownHotkey: '',
  // Which rarity tiers the Safe to Retire list shows (2026-09-24 — it used
  // to be Legendary/Mythic only, now every tier). Flipped by the six
  // declutterTier* hotkeys below (all unbound by default, per the
  // convention comment further down); declutter.html just re-renders off
  // settings:changed. Flat booleans rather than one nested object so
  // loadJson()'s top-level-key merge fills in any one that's missing.
  declutterBorder: 'grogu', // v1.10.0: this overlay's border skin key (was declutterColor)
  declutterShowDefault: true,
  declutterShowRare: true,
  declutterShowEpic: true,
  declutterShowLegendary: true,
  declutterShowMythic: true,
  declutterTierAllHotkey: '',       // all five on if any is off, otherwise all five off
  declutterTierDefaultHotkey: '',
  declutterTierRareHotkey: '',
  declutterTierEpicHotkey: '',
  declutterTierLegendaryHotkey: '',
  declutterTierMythicHotkey: '',
  declutterShowRetired: true,       // v1.10.13: retired droids shown dimmed at the bottom of Safe to Retire
  declutterRetiredHotkey: '',
  rebirthReqOverlayHotkey: '', // toggles the standalone Rebirth Requirements overlay, same deal (moved from Ctrl+Shift+4 on 2026-09-23 — see hotkey above)
  rebirthReqVisible: true,
  rebirthReqLocked: true,
  rebirthReqPosition: null,
  rebirthReqBorder: 'mando', // v1.10.0: this overlay's border skin key (was rebirthReqColor)
  // rebirthReqScrollUpHotkey / rebirthReqScrollDownHotkey retired 2026-09-24
  // (v1.7.3) — the Rebirth Requirements overlay never actually needed its
  // own separate scroll hotkeys, it just hadn't been wired to share
  // declutterScrollUp/DownHotkey above the way it now is (same class of gap
  // as the v1.7.2 tier filter fix: a control that should apply everywhere
  // only ever reached one overlay). Deliberately no longer in
  // DEFAULT_SETTINGS, so a fresh install never has them; an existing
  // install that had bound one of its own keeps that value sitting unused
  // in its saved settings file, same as craftBenchHotkey/calibHotkey above.
  // Sneak Preview overlay (v1.6.1): next cycle's Mythic requirements. Hidden
  // by default — it pops up on its own when a cycle completes and the player
  // declines the reset; the hotkey/toolbar button toggle it otherwise.
  sneakHotkey: '',
  sneakScrollUpHotkey: '',
  sneakScrollDownHotkey: '',
  sneakVisible: false,
  sneakLocked: true,
  sneakPosition: null,
  sneakBorder: 'rebel', // v1.10.0: this overlay's border skin key (was sneakColor)
  // Optimal Crit Guide overlay (v1.10.0): a static reference panel — the
  // fixed crystal-spend order for one specific crit build, plus the crit-hit
  // formula. Unbound by default per the "convention" comment above, same as
  // Sneak Preview's own hotkeys.
  critGuideHotkey: '',
  critGuideScrollUpHotkey: '',
  critGuideScrollDownHotkey: '',
  critGuideVisible: false,
  critGuideLocked: true,
  critGuidePosition: null,
  critGuideBorder: 'tatooine',
  critGuideShowInfo: true, // v1.10.1: the "How a Critical Hit is Calculated" box is toggleable in-overlay (see the ℹ button) — the subtitle + calc-box eat a lot of vertical space, so hiding it leaves more room for the purchase list before scrolling kicks in
  // Spawn Alert (v1.14.0): reads the game's "<Type> Droid (<Tier>) spawned"
  // lines off the screen (spawn-alert.html + spawn-parse.js) and shows each new
  // one big. Visible = watching, so it's off by default: it reads the screen
  // while on. Hold = seconds each alert stays up. Rules = which "<type>|<tier>"
  // spawns are off (0) or also play spawnAlertSound (2); missing = show (1).
  // See spawnRuleFor() in spawn-parse.js.
  spawnAlertHotkey: '',
  spawnAlertVisible: false,
  spawnAlertLocked: true,
  spawnAlertPosition: null,
  spawnAlertBorder: 'jedi',
  spawnAlertHoldSec: 6,
  spawnAlertRules: {},
  spawnAlertSound: 'goodnews',
  spawnAlertVolume: 0.35,
  hasSeenIntroGuide: false, // first-launch walkthrough (guide.js) — set true once dismissed or finished; an existing settings file just merges this in as false via loadJson(), so upgraders see it once too
  introGuideVersion: '',    // v1.16.0: the app version whose tour this player last saw ('' = before 1.16.0); guide.js shows only newer steps ("What's new")
  hotkeyLayoutVersion: 0,   // bumped by the migrations below; never hand-edit
  markDroid: '',            // mark selected droid in Upcoming RB Req's overlay (v1.10.3; was \ until v1.15.1)
  markLevel: '',            // mark entire current level (v1.10.3)
  markLeft: '',             // navigate left across droids (v1.10.3)
  markRight: '',            // navigate right across droids (v1.10.3)
  markUp: '',               // navigate up between levels (v1.10.3)
  markDown: '',             // navigate down between levels (v1.10.3)
  hudFriendHotkey: '',      // v1.16.0: flip the Upcoming RB Req's HUD between you and each 👥 friend
  rebirthMarkDroid: '',     // mark selected droid in Rebirth Requirements overlay (v1.10.3)
  rebirthMarkLeft: '',      // navigate left in grid (v1.10.3)
  rebirthMarkRight: '',     // navigate right in grid (v1.10.3)
  rebirthMarkUp: '',        // navigate up in grid (v1.10.3)
  rebirthMarkDown: '',      // navigate down in grid (v1.10.3)
  keybindsLockHotkey: '',   // v1.10.8: unbound by default, same convention as every other hotkey added after 2026-09-23 — see keybindsLocked below for what it does
  // v1.10.8: master kill switch for every global hotkey above — a player
  // reported the overlay's mark/navigate keys (arrow keys etc.) still firing
  // while they were doing schoolwork in another app, since these are OS-level
  // global shortcuts and don't care which window has focus. Toggling this
  // unregisters every hotkey with the OS entirely (see applyKeybindsLock())
  // so the keys behave completely normally in whatever app is actually
  // focused, then re-registers them all from settings when unlocked again.
  keybindsLocked: false,
  // v1.10.14: each droid overlay's {width, height} from its corner resize grip
  // (overlay-theme.js), or null for the default size. Separate from the
  // xPosition keys so an older settings file simply merges these in as null.
  size: null,
  declutterSize: null,
  rebirthReqSize: null,
  sneakSize: null,
  critGuideSize: null,
  spawnAlertSize: null,
  // v1.11.1: which list the rebirthMark* keys drive while more than one is
  // open ('rebirthReq' | 'declutter' | 'sneak'), flipped by markTargetHotkey.
  markTarget: 'rebirthReq',
  markTargetHotkey: '',
  // v1.11.1: dragging snaps overlays to each other and to the screen edge;
  // resizing also snaps to another overlay's size (overlay-snap.js).
  overlaySnap: true,
  overlaySnapSize: true,
  // v1.11.1: one colour theme for every droid overlay (overlay-theme.js). null
  // = that overlay's own default. Colours are '#rrggbb'; themeHighlight may
  // also be 'border' (follow each overlay's border colour). The HUD keeps its
  // own `opacity` slider instead of themeBackdropAlpha.
  themeBackdrop: null,
  themeBackdropAlpha: null,
  themeBox: null,
  themeBoxAlpha: null,
  themeHighlight: null,
  // v1.11.1: compact timer banners — 'row' | 'grid' (2x2) | 'column', and a
  // size multiplier. The window fits itself to the banners (timers:fit).
  timersLayout: 'row',
  timersScale: 1,
  // v1.11.1: answer the Read Rebirth Screen result from in-game (unbound).
  rebirthScreenApplyHotkey: '',
  rebirthScreenCancelHotkey: '',
  // v1.18.1: switch cycle / finish the cycle from in-game (unbound). The tracker window does
  // the work (setActiveCycle / resetCycleAndAdvance); Finish asks for a second press.
  cycleNextHotkey: '',
  cyclePrevHotkey: '',
  finishCycleHotkey: '',
  undoFinishCycleHotkey: '', // v1.18.1: put the finished cycle back (10 minutes)
  rebirthLevelUpHotkey: '',  // v1.18.1: the − / + rebirth level from in-game
  rebirthLevelDownHotkey: '',
  // v1.11.1: the screen picked in "Choose a screen to share", reused by every
  // screen capture until 🖥 Change screen. Id = desktopCapturer display_id
  // (or source id where that's empty); name is shown in the reader.
  captureDisplayId: null,
  captureScreenName: null,
  // v1.13.0 appearance (see "APPEARANCE" in requirements.js): card text size and
  // compact mode for every overlay, per-overlay overrides of any theme* value, a
  // border skin for the timers (null = the classic look), and saved looks
  // ({name, look} — lookToSettings() applies one).
  themeCompact: null,
  themeTextScale: null,
  // v1.17.0: 'color' (the picture frame shows the rarity) or 'text' (neutral frame, rarity written under
  // the name) for every droid overlay; see rarityStyleOf() in requirements.js
  overlayRarityStyle: 'color',
  overlayThemes: {},
  timersBorder: null,
  customPresets: [],
  // v1.15.0: the tracker window's own colours (APP_LOOKS in requirements.js; an
  // unknown key falls back to 'default'), and whether clicking an overlay preset
  // also switches it to that preset's app look.
  appLook: 'default',
  appLookFollowsPresets: true,
  // v1.13.0 sounds: Stellar/Mythic/Kyber can each pick their own (null = the
  // Blueprints pick), and the player's own files ({id, name, ext}, copied into
  // userData/custom-sounds by 'sound:add'; a choice of 'custom:<id>').
  stellarSoundChoice: null,
  mythicSoundChoice: null,
  kyberSoundChoice: null,
  customSounds: []
};

/* ---------------- convention: hotkeys for FUTURE overlays (2026-09-23) ----
   Every overlay toggle above launched with a pre-picked Ctrl+Shift+N combo,
   which is exactly why they've needed four rounds of migration so far just
   to make room for each new one (see below) — every existing user's saved
   layout has to get reshuffled around a slot nobody asked them to give up.
   From here on, a NEW overlay's hotkey defaults to an EMPTY string ('') in
   DEFAULT_SETTINGS instead of a picked accelerator: it ships unbound, the
   settings row shows "(none set)" (already the normal fallback display —
   see applySettingsToUI() in overlay-controls.js), and the player picks
   their own combo whenever they actually want one. No collision with an
   existing binding is possible, and — just as important — no future round
   ever needs another cascading migrateHotkeyLayout() step again just to
   free up a slot for it. registerHotkeyFor() below already no-ops cleanly
   on an empty accelerator (returns { ok:false, reason:'empty' } without
   ever calling globalShortcut.register), and reportHotkeyRegistrationFailures()
   deliberately excludes that reason so an intentionally-unbound hotkey
   never produces a false "couldn't register" toast on launch. Wiring a new
   overlay in fully still means touching the usual handful of spots: this
   object, HOTKEY_HANDLERS/HOTKEY_LABELS/HOTKEY_SETTINGS_KEY below, a
   wireHotkeyButton(...) call in overlay-controls.js, a row in
   hotkey-list.html's ROWS array, and the README hotkey table — this just
   changes what the DEFAULT_SETTINGS value should be when you do. */

/* ---------------- one-time hotkey renumbering ----------------
   Four rounds so far, all handled the same way: loadJson() (below) only
   fills in a DEFAULT_SETTINGS key when it's completely ABSENT from the
   saved settings file, so an existing install that already has a concrete
   saved value for e.g. rebirthScreenHotkey never actually moves just
   because the default above changed. Each round below only touches a
   hotkey if it's still sitting on exactly its OLD default; a deliberate
   custom rebind away from that default is left alone either way, same as
   every other hotkey in this app never gets silently overwritten.
   hotkeyLayoutVersion gates each round so it only ever runs once per
   install, and the rounds cascade — a pre-1.2.0 install passes through
   all four in a single launch, an already-1.2.1 install (already at
   version 1) only needs the last three, and so on.

   v0 -> v1 (shipped in 1.2.0/1.2.1): Ctrl+Shift+3/4 used to be Read
   Crafting Bench / Read Rebirth Screen. They moved to 4/5 to free up
   Ctrl+Shift+3 for the Rebirth Requirements Overlay hotkey.

   v1 -> v2 (shipped in 1.3.0): Ctrl+Shift+1/2/3/4/5 (hotkey list /
   declutter list / Rebirth Req overlay / craft bench / rebirth screen)
   all moved up one slot to 2/3/4/5/6, freeing up Ctrl+Shift+1 for the new
   one-way "hide all overlays" hotkey. V1_HOTKEY_DEFAULTS below is a
   frozen record of what each key's default was AT v1, not today's
   DEFAULT_SETTINGS — so this step's own before/after check stays correct
   no matter how many more rounds get layered on top of it later. Same
   reasoning is why the v0->v1 step above writes literal v1 values instead
   of reading DEFAULT_SETTINGS.

   v2 -> v3 (shipped in 1.5.3): Read Crafting Bench was removed
   entirely, freeing Ctrl+Shift+5. Read Rebirth Screen moves down from
   Ctrl+Shift+6 to fill it, so 1/2/3/4/5 stay a contiguous block with
   nothing skipped. Ctrl+Shift+1-4 are untouched by this round. There's no
   new home for the old craftBenchHotkey/calibHotkey values to move to —
   the feature they controlled is gone — so an existing user who'd
   customized either just keeps an unused, harmless field in their saved
   settings file; nothing reads it anymore.

   v3 -> v4 (this round, 2026-09-23): the Current Rebirth Requirements HUD
   ("Upcoming RB Req's") had a hotkey since the very start (Alt+Shift+D,
   predating the whole Ctrl+Shift+N numbered scheme below) but had never
   been given a slot in that scheme, which is what prompted this round.
   Alt+Shift+D moves to Ctrl+Shift+3, and Ctrl+Shift+3/4/5 (declutter list /
   Rebirth Req overlay / rebirth screen) each shift down one to 4/5/6 to
   make room, so 1-6 are now a single contiguous block covering every
   overlay. Same as every round before it: only a hotkey still sitting on
   its exact old default moves — a custom rebind is left alone. */
const PRE_MIGRATION_DEFAULTS = { craftBenchHotkey: 'Control+Shift+3', rebirthScreenHotkey: 'Control+Shift+4' };
const V1_HOTKEY_DEFAULTS = {
  hotkeyListHotkey: 'Control+Shift+1',
  declutterHotkey: 'Control+Shift+2',
  rebirthReqOverlayHotkey: 'Control+Shift+3',
  craftBenchHotkey: 'Control+Shift+4',
  rebirthScreenHotkey: 'Control+Shift+5'
};
// Frozen record of what each key's default was once AT v2 (after the
// v1->v2 step below finished, before this round's v2->v3 step) — same
// role V1_HOTKEY_DEFAULTS plays for v0->v1, and used TWICE here: as the
// v1->v2 step's MOVE-TO target (replacing what used to be a live
// DEFAULT_SETTINGS[key] read, which broke the moment this round changed
// DEFAULT_SETTINGS.rebirthScreenHotkey out from under it — caught before
// shipping, not after) and as the v2->v3 step's own before-check.
const V2_HOTKEY_DEFAULTS = {
  hotkeyListHotkey: 'Control+Shift+2',
  declutterHotkey: 'Control+Shift+3',
  rebirthReqOverlayHotkey: 'Control+Shift+4',
  craftBenchHotkey: 'Control+Shift+5',
  rebirthScreenHotkey: 'Control+Shift+6'
};
// Frozen record of what each key's default was once AT v3 (after the
// v2->v3 step above finished, before this round's v3->v4 step) — same
// role V1_HOTKEY_DEFAULTS/V2_HOTKEY_DEFAULTS play for the earlier steps.
// "hotkey" (Alt+Shift+D) joins this cascade for the first time here — it
// was never part of v0/v1/v2's Ctrl+Shift+N reshuffling, so it has no
// earlier frozen-default entry to appear in above this point.
const V3_HOTKEY_DEFAULTS = {
  hotkey: 'Alt+Shift+D',
  declutterHotkey: 'Control+Shift+3',
  rebirthReqOverlayHotkey: 'Control+Shift+4',
  rebirthScreenHotkey: 'Control+Shift+5'
};
const V4_HOTKEY_DEFAULTS = {
  hotkey: 'Control+Shift+3',
  declutterHotkey: 'Control+Shift+4',
  rebirthReqOverlayHotkey: 'Control+Shift+5',
  rebirthScreenHotkey: 'Control+Shift+6'
};
const LATEST_HOTKEY_LAYOUT_VERSION = 4;
function migrateHotkeyLayout(){
  if(settings.hotkeyLayoutVersion >= LATEST_HOTKEY_LAYOUT_VERSION) return;
  if(settings.hotkeyLayoutVersion < 1){
    if(settings.craftBenchHotkey === PRE_MIGRATION_DEFAULTS.craftBenchHotkey){
      settings.craftBenchHotkey = 'Control+Shift+4'; // frozen v1 default, see comment above
    }
    if(settings.rebirthScreenHotkey === PRE_MIGRATION_DEFAULTS.rebirthScreenHotkey){
      settings.rebirthScreenHotkey = 'Control+Shift+5'; // frozen v1 default, see comment above
    }
    settings.hotkeyLayoutVersion = 1;
  }
  if(settings.hotkeyLayoutVersion < 2){
    Object.keys(V1_HOTKEY_DEFAULTS).forEach(key=>{
      if(settings[key] === V1_HOTKEY_DEFAULTS[key]){
        settings[key] = V2_HOTKEY_DEFAULTS[key]; // frozen v2 target, see comment above (was a live DEFAULT_SETTINGS[key] read before this round)
      }
    });
    settings.hotkeyLayoutVersion = 2;
  }
  if(settings.hotkeyLayoutVersion < 3){
    if(settings.rebirthScreenHotkey === V2_HOTKEY_DEFAULTS.rebirthScreenHotkey){
      settings.rebirthScreenHotkey = 'Control+Shift+5'; // frozen v3 default, see comment above
    }
    // craftBenchHotkey/calibHotkey intentionally not migrated here — see
    // the v2->v3 note in the big comment above.
    settings.hotkeyLayoutVersion = 3;
  }
  if(settings.hotkeyLayoutVersion < 4){
    Object.keys(V3_HOTKEY_DEFAULTS).forEach(key=>{
      if(settings[key] === V3_HOTKEY_DEFAULTS[key]){
        settings[key] = V4_HOTKEY_DEFAULTS[key]; // frozen v4 target, see comment above
      }
    });
    settings.hotkeyLayoutVersion = 4;
  }
  persistSettingsNow();
}

/* v1.11.1: "Good news, everyone!" became the default timer sound. A saved
   settings file keeps its old values, so an install still on the old default
   ('beep') moves once; any other pick (boop/chime/off) is left alone. */
function migrateSoundDefault(){
  if(settings.soundDefaultVersion >= 1) return;
  ['missionSoundChoice', 'blueprintSoundChoice'].forEach(key=>{
    if(settings[key] === 'beep') settings[key] = 'goodnews';
  });
  settings.soundDefaultVersion = 1;
  persistSettingsNow();
}

// Set true by 'before-quit' (fires once, before Electron attempts to close
// any window) so the 4 HUD windows' 'close' handlers below know to let a
// real quit through instead of intercepting it. Without this, app.quit()
// can never succeed: Electron cancels the whole quit if ANY window's
// 'close' handler calls preventDefault(), and all 4 of these windows do
// that unconditionally (see createOverlayWindow()'s comment) so the app
// they're guarding would otherwise become unquittable the moment they're
// created — which happens unconditionally at startup, below.
let isQuitting = false;
let mainWindow = null;
let overlayWindow = null;
let pickerWindow = null;
let timersWindow = null;
let declutterWindow = null;
let rebirthReqWindow = null;
let sneakWindow = null;
let critGuideWindow = null;
let spawnAlertWindow = null;
let hotkeyListWindow = null;
let hotkeyListVisible = false; // runtime-only, not persisted. v1.16.0: no longer shown on launch (the tutorial points players to ⚙ Overlay Settings → Keybinds); ⌨ Hotkey list or its hotkey opens it
let storeData = {};
let settings = { ...DEFAULT_SETTINGS };
let storeWriteTimer = null;
let registeredHotkeys = {}; // name -> accelerator currently bound via globalShortcut

/* ---------------- persistence ----------------
   loadJson / saveJsonNow live in persistence.js (required at the top): saves
   go through a temp file + rename so a crash mid-write can't truncate the
   store, and an unreadable store is recovered from its .bak copy. Covered by
   test/persistence.test.js. */
function persistStoreDebounced(){
  if(storeWriteTimer) clearTimeout(storeWriteTimer);
  storeWriteTimer = setTimeout(()=>{ saveJsonNow(STORE_PATH, storeData); storeWriteTimer = null; }, 200);
}
function persistSettingsNow(){
  saveJsonNow(SETTINGS_PATH, settings);
}

/* ---------------- default overlay position ----------------
   Fractions of the primary display, tuned against a real gameplay screenshot:
   the game's own top-left network/perf HUD ends around 12% of screen height,
   and droid-spawn toast notifications start around 50%. This box sits in the
   gap between them with a wide safety margin on both sides, and can still be
   dragged to an exact spot per-user via the Reposition control. */
function computeDefaultBounds(){
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  // Each row is a "level block" (a tag + a fixed row of exactly 3 droid
  // cards — portrait, name, owned-status). Resized 2026-09-20 when
  // overlay.html's chips were redesigned into image cards to match the
  // Safe to Retire overlay's look: a 34px-capped icon plus two lines of
  // text needs noticeably more vertical room than the old text-only pill
  // row did. Icon/font sizes in overlay.html are fixed px, not scaled to
  // screen size, so the floor below (rather than the fraction) is what
  // guarantees every block's real content fits on a smaller display —
  // measured against the actual CSS at ~81px/block including padding. The
  // fraction just adds proportionally more breathing room on bigger
  // screens; over-allocating is harmless since .block centers its content
  // (justify-content:center), so extra height just becomes padding, never
  // overflow. Width floor bumped too (320->340) to give 3 image columns a
  // bit more room than the old wrapping text chips needed. As with every
  // other visual pass in this app, treat these as a reasoned starting
  // point to eyeball once actually on screen, not a final answer.
  const w = Math.round(width * 0.14);
  const blockH = Math.round(height * 0.07);
  const h = Math.round(blockH * 4 + height * 0.02);
  const x = Math.round(width * 0.012) + display.workArea.x;
  const y = Math.round(height * 0.135) + display.workArea.y;
  return { x, y, width: Math.max(340, w), height: Math.max(370, h) };
}

/* ---------------- default timers banner position ----------------
   Fractions of the primary display, tuned against the reference gameplay
   screenshot the user marked up with a red box: a wide strip near the top
   center of the screen, clear of the game's own top-left perf HUD. Like the
   main overlay, this is just a starting point — the Reposition control lets
   the user drag it to an exact spot per-monitor. */
function computeDefaultTimersBounds(){
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const w = Math.round(width * 0.46);
  const h = Math.round(height * 0.09);
  const x = Math.round(width * 0.37) + display.workArea.x;
  const y = Math.round(height * 0.01) + display.workArea.y;
  return { x, y, width: Math.max(520, w), height: Math.max(80, h) };
}

/* ---------------- default declutter-list position ----------------
   The user's own reference screenshot shows the in-game player counter
   (leaderboard) docked top-right, up to 6 rows tall. This sits right below
   where a maxed-out 6-row counter would end, right-aligned to roughly match
   the counter's own right edge — a starting point only, like the HUD and
   timers windows: Position -> Drag into place moves it exactly.
   Narrowed and pulled closer to the screen's right edge 2026-09-19, after
   a real in-game screenshot showed the original 3-wide/30%-width version
   sticking out further than wanted — went with 2 columns instead of 3
   (see declutter.html) and a smaller width fraction to match, plus a
   tighter right-edge margin (0.995 vs 0.985). */
function computeDefaultDeclutterBounds(){
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const w = Math.max(240, Math.round(width * 0.20));
  // v1.6.0: cards are a fixed size and the list scrolls, so the box no longer
  // has to be tall enough to hold everything (was 34% of screen height).
  // 266px is exactly three full rows of cards (46px of header/padding + 72px
  // per row, measured) so a 1080p screen shows three clean rows; taller
  // screens scale up to ~25% of their height and show a fourth.
  const h = Math.max(266, Math.round(height * 0.25));
  const x = Math.round(width * 0.995) - w + display.workArea.x;
  const y = Math.round(height * 0.34) + display.workArea.y;
  return { x, y, width: w, height: h };
}

/* ---------------- default Spawn Alert position (v1.14.0) ----------------
   Centred, a fifth of the way down: under the timers banner, clear of the
   game's own feed at the left edge (which is what the alert repeats, bigger).
   460x150 fits the longest alert ("Galactic Legendary") at zoom 1. */
function computeDefaultSpawnAlertBounds(){
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const w = 460, h = 150;
  const x = Math.round((width - w) / 2) + display.workArea.x;
  const y = Math.round(height * 0.2) + display.workArea.y;
  return { x, y, width: w, height: h };
}

/* ---------------- default hotkey-list position ----------------
   Always centered on the primary display — the user asked for this list
   in "the middle of the screen," not somewhere draggable, so unlike the
   HUD/timers windows there's no position/lock setting to persist here. */
function computeDefaultHotkeyListBounds(){
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const w = Math.min(460, Math.max(380, Math.round(width * 0.24)));
  // Sized to the rows actually shown: hotkey-list.html lists only BOUND
  // hotkeys (most are unbound by default), so count those rather than
  // assuming a fixed row count. ~36px per row + chrome.
  const shown = Object.keys(HOTKEY_SETTINGS_KEY).filter(n => settings[HOTKEY_SETTINGS_KEY[n]]).length;
  const h = Math.min(Math.round(height * 0.9), Math.max(200, 110 + shown * 36));
  const x = Math.round((width - w) / 2) + display.workArea.x;
  const y = Math.round((height - h) / 2) + display.workArea.y;
  return { x, y, width: w, height: h };
}

function clampToDisplay(bounds){
  const display = screen.getDisplayMatching(bounds) || screen.getPrimaryDisplay();
  const wa = display.workArea;
  const x = Math.min(Math.max(bounds.x, wa.x), wa.x + wa.width - bounds.width);
  const y = Math.min(Math.max(bounds.y, wa.y), wa.y + wa.height - bounds.height);
  return { ...bounds, x, y };
}

/* v1.10.14: a droid overlay's starting bounds — its tuned default, then the
   saved size and position on top. A saved size larger than the work area
   (e.g. after switching to a smaller monitor) is shrunk to fit first. */
const OVERLAY_MIN_SIZE = { width: 200, height: 160 };
function overlayBounds(defaults, position, size, minSize){
  if(!position && !size) return defaults;
  const min = minSize || OVERLAY_MIN_SIZE;
  const b = { ...defaults, ...(size || {}), ...(position || {}) };
  const wa = (screen.getDisplayMatching(b) || screen.getPrimaryDisplay()).workArea;
  b.width = Math.max(min.width, Math.min(b.width, wa.width));
  b.height = Math.max(min.height, Math.min(b.height, wa.height));
  return clampToDisplay(b);
}

/* Every overlay window the user can move (v1.10.14). RULE: overlay windows never
   use -webkit-app-region: drag. They move only through overlay-drag.js ->
   'overlay:drag' below, and resize only through overlay-theme.js -> 'overlay:resize',
   so main.js always places them and keeps each wholly on ONE monitor. Windows'
   own drag let a window straddle two monitors, and Windows then drew the part on
   the second monitor again on the first, a moving "mirror" (v1.10.14 testing, two
   1920x1080 monitors side by side). A new overlay window needs an entry here,
   overlay-drag.js on its page, and a #dragHandle.
   sizeKey/defaults: only the droid overlays resize (overlay-theme.js zooms
   relative to the default size); the timers banner just moves. minSize: the
   Spawn Alert's one-line card is smaller than OVERLAY_MIN_SIZE (v1.14.0). */
const OVERLAY_WINDOWS = {
  overlay:    { win: () => overlayWindow,    sizeKey: 'size',           defaults: computeDefaultBounds },
  timers:     { win: () => timersWindow },
  declutter:  { win: () => declutterWindow,  sizeKey: 'declutterSize',  defaults: computeDefaultDeclutterBounds },
  rebirthReq: { win: () => rebirthReqWindow, sizeKey: 'rebirthReqSize', defaults: computeDefaultDeclutterBounds },
  sneak:      { win: () => sneakWindow,      sizeKey: 'sneakSize',      defaults: computeDefaultDeclutterBounds },
  critGuide:  { win: () => critGuideWindow,  sizeKey: 'critGuideSize',  defaults: computeDefaultDeclutterBounds },
  spawnAlert: { win: () => spawnAlertWindow, sizeKey: 'spawnAlertSize', defaults: computeDefaultSpawnAlertBounds, minSize: { width: 240, height: 90 } }
};
function overlayWindowFor(webContents){
  return Object.values(OVERLAY_WINDOWS).find(o => { const w = o.win(); return w && !w.isDestroyed() && w.webContents === webContents; });
}

// Where a dragged window goes: wholly inside the work area of the monitor under
// its centre. It stops at a monitor's edge and hops across once its centre is
// over the next one; pulled back, it resumes exactly under the original grab point.
function onOneDisplay(b){
  const wa = screen.getDisplayNearestPoint({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }).workArea;
  return {
    x: Math.round(Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width)),
    y: Math.round(Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height)),
    width: b.width, height: b.height
  };
}

/* ---------------- windows ---------------- */
function createMainWindow(){
  mainWindow = new BrowserWindow({
    width: 1060,
    height: 940,
    minWidth: 760,
    minHeight: 600,
    title: 'Fuzzy\'s Droid Tracker — Keep or Let Go',
    backgroundColor: '#0b0f0d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'tracker.html'));
  // v1.19.0 🌐: coming back to the tracker refreshes watched live friends (at most every 15 s)
  mainWindow.on('focus', ()=>{ if(live.watchers.size) liveWakePolling(); });
  mainWindow.on('closed', ()=>{
    mainWindow = null;
    app.quit();
  });
}

function createOverlayWindow(){
  const bounds = overlayBounds(computeDefaultBounds(), settings.position, settings.size);

  overlayWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 'screen-saver' level floats above exclusive/borderless games and other
  // always-on-top windows more reliably than the default always-on-top level.
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Match whatever lock state was actually persisted, not just the
  // construction default above (focusable:false) -- without this, a window
  // last left UNLOCKED (e.g. the app was closed mid-reposition) would come
  // back click-through/non-draggable next launch even though settings/UI
  // still say "unlocked," until the user toggled Lock twice to refresh it.
  if(settings.locked){
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    overlayWindow.setFocusable(true);
  }
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

  overlayWindow.once('ready-to-show', ()=>{
    if(settings.visible) overlayWindow.showInactive();
  });

  // Unlocking this window (see 'overlay:setLocked') makes it focusable so it
  // can be dragged, which means an OS-level "close focused window" command
  // (Alt+F4 is the realistic case, since it has no taskbar/dock entry to
  // close from otherwise) would destroy it outright — and nothing ever
  // recreates these 4 HUD windows individually after startup, so that would
  // silently kill this overlay for the rest of the session, with its own
  // toggle button still flipping its On/Off label with zero visible effect.
  // Treat an OS close exactly like the app's own "hide" instead: intercept
  // it, keep the window alive (just hidden), and update settings/UI the
  // same way turning it off from the app would — fully recoverable with a
  // normal toggle, no restart needed.
  overlayWindow.on('close', (e)=>{ if(isQuitting) return; e.preventDefault(); setOverlayVisible(false); });
  overlayWindow.on('closed', ()=>{ overlayWindow = null; });
}

function createTimersWindow(){
  const bounds = settings.timersPosition ? clampToDisplay({ ...computeDefaultTimersBounds(), ...settings.timersPosition }) : computeDefaultTimersBounds();

  timersWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // v1.14.1: the alert sounds and mission warnings run off this page's 1 s
      // tick, which Chromium slows to once a minute in a window hidden for ~5
      // minutes (banners toggled off), so a sound could come up to a minute late.
      backgroundThrottling: false
    }
  });

  timersWindow.setAlwaysOnTop(true, 'screen-saver');
  timersWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // See the matching comment in createOverlayWindow(): match the persisted
  // lock state instead of always defaulting to locked/click-through.
  if(settings.timersLocked){
    timersWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    timersWindow.setFocusable(true);
  }
  timersWindow.loadFile(path.join(__dirname, 'timers.html'));

  timersWindow.once('ready-to-show', ()=>{
    if(settings.timersVisible) timersWindow.showInactive();
  });

  // See the matching comment in createOverlayWindow(): unlocking makes this
  // focusable, so an OS-level close (Alt+F4) must be treated as "hide", not
  // "destroy" — otherwise it's gone for the rest of the session with no way
  // back except restarting the app.
  timersWindow.on('close', (e)=>{ if(isQuitting) return; e.preventDefault(); setTimersVisible(false); });
  timersWindow.on('closed', ()=>{ timersWindow = null; });
}

function createDeclutterWindow(){
  const bounds = overlayBounds(computeDefaultDeclutterBounds(), settings.declutterPosition, settings.declutterSize);

  declutterWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  declutterWindow.setAlwaysOnTop(true, 'screen-saver');
  declutterWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // See the matching comment in createOverlayWindow(): match the persisted
  // lock state instead of always defaulting to locked/click-through.
  if(settings.declutterLocked){
    declutterWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    declutterWindow.setFocusable(true);
  }
  declutterWindow.loadFile(path.join(__dirname, 'declutter.html'));

  declutterWindow.once('ready-to-show', ()=>{
    if(settings.declutterVisible) declutterWindow.showInactive();
  });

  // See the matching comment in createOverlayWindow(): unlocking makes this
  // focusable, so an OS-level close (Alt+F4) must be treated as "hide", not
  // "destroy" — otherwise it's gone for the rest of the session with no way
  // back except restarting the app.
  declutterWindow.on('close', (e)=>{ if(isQuitting) return; e.preventDefault(); setDeclutterVisible(false); });
  declutterWindow.on('closed', ()=>{ declutterWindow = null; });
}

/* Standalone "every droid this cycle needs" overlay — the tracker's own 🧬
   Rebirth Requirements panel, made reachable as an in-game overlay (2026-
   09-20). Deliberately reuses computeDefaultDeclutterBounds() itself rather
   than a second, separately-tuned copy of the same numbers, so its default
   size and position can never drift out of sync with the Safe to Retire
   window it's meant to match exactly. */
function createRebirthReqWindow(){
  const bounds = overlayBounds(computeDefaultDeclutterBounds(), settings.rebirthReqPosition, settings.rebirthReqSize);

  rebirthReqWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  rebirthReqWindow.setAlwaysOnTop(true, 'screen-saver');
  rebirthReqWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // See the matching comment in createOverlayWindow(): match the persisted
  // lock state instead of always defaulting to locked/click-through.
  if(settings.rebirthReqLocked){
    rebirthReqWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    rebirthReqWindow.setFocusable(true);
  }
  rebirthReqWindow.loadFile(path.join(__dirname, 'rebirth-requirements-overlay.html'));

  rebirthReqWindow.once('ready-to-show', ()=>{
    if(settings.rebirthReqVisible) rebirthReqWindow.showInactive();
  });

  // See the matching comment in createOverlayWindow(): unlocking makes this
  // focusable, so an OS-level close (Alt+F4) must be treated as "hide", not
  // "destroy" — otherwise it's gone for the rest of the session with no way
  // back except restarting the app.
  rebirthReqWindow.on('close', (e)=>{ if(isQuitting) return; e.preventDefault(); setRebirthReqVisible(false); });
  rebirthReqWindow.on('closed', ()=>{ rebirthReqWindow = null; });
}

/* ---------------- declutter list ---------------- */
/* Sneak Preview — same bounds as Safe to Retire / Rebirth Requirements. */
function createSneakWindow(){
  const bounds = overlayBounds(computeDefaultDeclutterBounds(), settings.sneakPosition, settings.sneakSize);

  sneakWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  sneakWindow.setAlwaysOnTop(true, 'screen-saver');
  sneakWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // See the matching comment in createOverlayWindow(): match the persisted
  // lock state instead of always defaulting to locked/click-through.
  if(settings.sneakLocked){
    sneakWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    sneakWindow.setFocusable(true);
  }
  sneakWindow.loadFile(path.join(__dirname, 'sneak-preview.html'));

  sneakWindow.once('ready-to-show', ()=>{
    if(settings.sneakVisible) sneakWindow.showInactive();
  });

  // See the matching comment in createOverlayWindow(): unlocking makes this
  // focusable, so an OS-level close (Alt+F4) must be treated as "hide", not
  // "destroy" — otherwise it's gone for the rest of the session with no way
  // back except restarting the app.
  sneakWindow.on('close', (e)=>{ if(isQuitting) return; e.preventDefault(); setSneakVisible(false); });
  sneakWindow.on('closed', ()=>{ sneakWindow = null; });
}

/* Optimal Crit Guide — a static reference panel (fixed purchase order + the
   crit-hit formula for one build), not tied to any droid/cycle progress.
   Same window shape as Safe to Retire / Rebirth Requirements / Sneak
   Preview otherwise, so it reuses their default bounds. */
function createCritGuideWindow(){
  const bounds = overlayBounds(computeDefaultDeclutterBounds(), settings.critGuidePosition, settings.critGuideSize);

  critGuideWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  critGuideWindow.setAlwaysOnTop(true, 'screen-saver');
  critGuideWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if(settings.critGuideLocked){
    critGuideWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    critGuideWindow.setFocusable(true);
  }
  critGuideWindow.loadFile(path.join(__dirname, 'crit-guide-overlay.html'));

  critGuideWindow.once('ready-to-show', ()=>{
    if(settings.critGuideVisible) critGuideWindow.showInactive();
  });

  critGuideWindow.on('close', (e)=>{ if(isQuitting) return; e.preventDefault(); setCritGuideVisible(false); });
  critGuideWindow.on('closed', ()=>{ critGuideWindow = null; });
}

function toggleCritGuideVisible(){ setCritGuideVisible(!settings.critGuideVisible); }
function setCritGuideVisible(visible){
  settings.critGuideVisible = !!visible;
  persistSettingsNow();
  if(!critGuideWindow) return;
  if(settings.critGuideVisible) critGuideWindow.showInactive();
  else critGuideWindow.hide();
  broadcast('critGuide:visibility-changed', settings.critGuideVisible);
}

/* Spawn Alert (v1.14.0): a transparent window that stays on screen while the
   feature is on and draws nothing until a spawn is read (spawn-alert.html does
   the screen reading itself). backgroundThrottling off: its reads run on a
   timer, and Chromium slows timers in windows it thinks nobody is looking at. */
function createSpawnAlertWindow(){
  const o = OVERLAY_WINDOWS.spawnAlert;
  const bounds = overlayBounds(computeDefaultSpawnAlertBounds(), settings.spawnAlertPosition, settings.spawnAlertSize, o.minSize);

  spawnAlertWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  spawnAlertWindow.setAlwaysOnTop(true, 'screen-saver');
  spawnAlertWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if(settings.spawnAlertLocked){
    spawnAlertWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    spawnAlertWindow.setFocusable(true);
  }
  spawnAlertWindow.loadFile(path.join(__dirname, 'spawn-alert.html'));

  spawnAlertWindow.once('ready-to-show', ()=>{
    if(settings.spawnAlertVisible) spawnAlertWindow.showInactive();
  });

  spawnAlertWindow.on('close', (e)=>{ if(isQuitting) return; e.preventDefault(); setSpawnAlertVisible(false); });
  spawnAlertWindow.on('closed', ()=>{ spawnAlertWindow = null; });
}

function toggleSpawnAlertVisible(){ setSpawnAlertVisible(!settings.spawnAlertVisible); }
// The page starts/stops its screen reading from settings.spawnAlertVisible
// (settings:changed), so turning it off also stops the capture and frees OCR.
function setSpawnAlertVisible(visible){
  settings.spawnAlertVisible = !!visible;
  persistSettingsNow();
  broadcast('settings:changed', { ...settings });
  broadcast('spawnAlert:visibility-changed', settings.spawnAlertVisible);
  if(!spawnAlertWindow) return;
  if(settings.spawnAlertVisible) spawnAlertWindow.showInactive();
  else spawnAlertWindow.hide();
}

function toggleDeclutterVisible(){
  setDeclutterVisible(!settings.declutterVisible);
}
function setDeclutterVisible(visible){
  settings.declutterVisible = !!visible;
  persistSettingsNow();
  if(!declutterWindow) return;
  if(settings.declutterVisible) declutterWindow.showInactive();
  else declutterWindow.hide();
  broadcast('declutter:visibility-changed', settings.declutterVisible);
  broadcastMarkTarget();
}

/* ---------------- rebirth requirements overlay ---------------- */
function toggleRebirthReqVisible(){
  setRebirthReqVisible(!settings.rebirthReqVisible);
}
function setRebirthReqVisible(visible){
  settings.rebirthReqVisible = !!visible;
  persistSettingsNow();
  if(!rebirthReqWindow) return;
  if(settings.rebirthReqVisible) rebirthReqWindow.showInactive();
  else rebirthReqWindow.hide();
  broadcast('rebirthReq:visibility-changed', settings.rebirthReqVisible);
  broadcastMarkTarget();
}

/* On-screen hotkey reference list: a small centered, click-through card
   listing every hotkey currently bound. Until v1.15.1 it showed on every
   launch; since v1.16.0 it starts hidden (the tutorial covers the Keybinds
   tab instead). It has no draggable position (see
   computeDefaultHotkeyListBounds) and its shown/hidden state is NOT
   persisted to settings — it is only toggled at runtime via its own hotkey
   or toolbar button. */
function createHotkeyListWindow(){
  const bounds = computeDefaultHotkeyListBounds();

  hotkeyListWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  hotkeyListWindow.setAlwaysOnTop(true, 'screen-saver');
  hotkeyListWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  hotkeyListWindow.setIgnoreMouseEvents(true, { forward: true });
  hotkeyListWindow.loadFile(path.join(__dirname, 'hotkey-list.html'));

  hotkeyListWindow.once('ready-to-show', ()=>{
    if(hotkeyListVisible) hotkeyListWindow.showInactive();
  });

  hotkeyListWindow.on('closed', ()=>{ hotkeyListWindow = null; });
}

function showHotkeyList(){
  hotkeyListVisible = true;
  if(hotkeyListWindow) hotkeyListWindow.showInactive();
  broadcast('hotkeyList:visibility-changed', true);
}
function hideHotkeyList(){
  hotkeyListVisible = false;
  if(hotkeyListWindow) hotkeyListWindow.hide();
  broadcast('hotkeyList:visibility-changed', false);
}
function toggleHotkeyList(){
  if(hotkeyListVisible) hideHotkeyList();
  else showHotkeyList();
}

/* ---------------- screen-capture wiring (Live Detect / Rebirth OCR features) ----------------
   Electron does NOT wire up the standard navigator.mediaDevices.getDisplayMedia()
   web API to anything by default — a renderer calling it just gets a
   "Not supported" rejection unless the main process installs a handler via
   session.setDisplayMediaRequestHandler(). This single handler is what makes
   getDisplayMedia() work for every renderer call in the app: Live Detect,
   Rebirth Level Detect, and Read Rebirth Screen all use the exact same
   browser API and are all fixed by this one piece of main-process plumbing.
   It still only ever hands the renderer a captured screen frame — same as
   OBS or Discord screen-share; nothing here touches Fortnite's process. */
// v1.11.1: the picked screen is remembered (settings.captureDisplayId) so a
// multi-monitor capture goes straight through. 'capture:changeScreen' sets
// forceScreenPicker so the NEXT request shows the picker again; cancelling
// it keeps the old choice.
let forceScreenPicker = false;
function captureKey(source){ return source.display_id || source.id; }
function rememberCaptureSource(source){
  settings.captureDisplayId = captureKey(source);
  settings.captureScreenName = source.name;
  persistSettingsNow();
  broadcast('settings:changed', { ...settings });
}
function setupDisplayMediaHandler(){
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback)=>{
    try{
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 320, height: 200 } });
      if(!sources.length){ callback({}); return; }
      if(sources.length === 1){ forceScreenPicker = false; callback({ video: sources[0] }); return; }
      const saved = !forceScreenPicker && settings.captureDisplayId != null && sources.find(s => captureKey(s) === settings.captureDisplayId);
      if(saved){ callback({ video: saved }); return; }
      forceScreenPicker = false;
      const chosen = await pickScreenSource(sources);
      if(chosen) rememberCaptureSource(chosen);
      callback(chosen ? { video: chosen } : {});
    }catch(e){
      console.error('Display media request failed', e);
      callback({});
    }
  }, { useSystemPicker: true }); // no-op today outside macOS 15+, harmless to leave on
}

// Only needed on multi-monitor setups (single-screen machines skip straight to
// callback({video: sources[0]}) above). Shows a small modal with a thumbnail
// per screen so the user can pick the one actually showing the game.
function pickScreenSource(sources){
  return new Promise((resolve)=>{
    if(pickerWindow && !pickerWindow.isDestroyed()) pickerWindow.destroy();
    // Defensive: this function's own 'picker:choose' handler below assumes
    // any PREVIOUS call's handler was already removed (via the old
    // window's 'closed'->finish() path triggered by destroy() above) by
    // the time it registers a new one -- ipcMain.handle() throws if a
    // handler for the same channel is already registered. removeHandler()
    // is a safe no-op when nothing is registered, so this guarantees the
    // upcoming handle() call never throws even if a future Electron
    // version ever made destroy()'s 'closed' event fire asynchronously.
    ipcMain.removeHandler('picker:choose');

    const win = new BrowserWindow({
      width: 640,
      height: 440,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      autoHideMenuBar: true,
      title: 'Choose a screen to share',
      parent: mainWindow || undefined,
      modal: !!mainWindow,
      backgroundColor: '#0b0f0d',
      webPreferences: {
        preload: path.join(__dirname, 'screen-picker-preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    pickerWindow = win;

    let settled = false;
    function finish(id){
      if(settled) return;
      settled = true;
      ipcMain.removeHandler('picker:choose');
      resolve(id ? (sources.find(s=>s.id === id) || null) : null);
      if(!win.isDestroyed()) win.destroy();
    }

    ipcMain.handle('picker:choose', (evt, id)=>{ finish(id); return true; });
    win.on('closed', ()=>{ pickerWindow = null; finish(null); });

    win.loadFile(path.join(__dirname, 'screen-picker.html'));
    win.once('ready-to-show', ()=>{
      win.webContents.send('picker:sources', sources.map(s=>({
        id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL()
      })));
      win.show();
    });
  });
}

/* ---------------- sneak preview overlay ---------------- */
function toggleSneakVisible(){ setSneakVisible(!settings.sneakVisible); }
function setSneakVisible(visible){
  settings.sneakVisible = !!visible;
  persistSettingsNow();
  if(!sneakWindow) return;
  if(settings.sneakVisible) sneakWindow.showInactive();
  else sneakWindow.hide();
  broadcast('sneak:visibility-changed', settings.sneakVisible);
  broadcastMarkTarget();
}

// The cycle-complete prompt's "Sneak Preview" choice: clear the stage for
// it (it shares its default spot with Safe to Retire / Rebirth
// Requirements), turning every other overlay off EXCEPT the timers banner,
// then show it. Same setXVisible(false)/hideX() calls hideAllOverlays()
// uses below, so the toolbar labels update the same way.
function showSneakFocused(){
  setOverlayVisible(false);
  setDeclutterVisible(false);
  setRebirthReqVisible(false);
  hideHotkeyList();
  setSneakVisible(true);
}

/* ---------------- hide all overlays (one-way only) ----------------
   Ctrl+Shift+1 by default. Deliberately NOT a toggle like every hotkey
   below — this one only ever turns overlays OFF, never back on, so a quick
   screenshot never means hunting down and re-enabling everything
   afterward: hit it once before the picture, then bring overlays back
   individually (their own hotkeys or the toolbar buttons) whenever ready.
   Reuses the exact same setXVisible(false)/hideX() functions each
   overlay's own hotkey/toolbar button already calls — nothing new to
   verify here, and every toggle button's on-screen label updates too, for
   free, same as if each had been switched off by hand. Covers every
   overlay window that can be on screen: the main Rebirth Requirements HUD,
   the timers banner, the declutter list, the standalone Rebirth
   Requirements overlay, the Sneak Preview, and the hotkey reference card. */
function hideAllOverlays(){
  setOverlayVisible(false);
  setTimersVisible(false);
  setDeclutterVisible(false);
  setRebirthReqVisible(false);
  setSneakVisible(false);
  setCritGuideVisible(false);
  setSpawnAlertVisible(false);
  hideHotkeyList();
  if(toastWindow && !toastWindow.isDestroyed()) toastWindow.hide();
}

/* ---------------- global hotkeys ----------------
   Twenty-one independent named hotkeys share this same register/unregister
   logic: "hideAll" (turns every overlay off — never back on, see
   hideAllOverlays() above, default Ctrl+Shift+1), "hotkeyList" (toggles
   the on-screen hotkey reference list, default Ctrl+Shift+2), "overlay"
   (the Current Rebirth Requirements HUD, "Upcoming RB Req's", default
   Ctrl+Shift+3), "declutter" (toggles the "safe to retire" Legendary/
   Mythic droid list, default Ctrl+Shift+4), "rebirthReqOverlay" (the
   standalone Rebirth Requirements overlay, default Ctrl+Shift+5),
   "rebirthScreen" (fires the 📸 Read Rebirth Screen button, default
   Ctrl+Shift+6), "timers" (the blueprint/mission countdown banners,
   default Alt+Shift+T — the one hotkey here still outside the Ctrl+Shift+N
   block; see the "convention" comment above DEFAULT_SETTINGS if that ever
   changes for a future overlay), and two more — "declutterScrollUp"/
   "declutterScrollDown" — that page a scrollable card list: v1.7.3 made
   these fire in BOTH declutter.html and rebirth-requirements-overlay.html
   (previously the latter had its own separate, now-retired
   rebirthReqScrollUp/Down pair — see the DEFAULT_SETTINGS retirement note
   above), plus six "declutterTier*" hotkeys that toggle which rarity tiers
   Safe to Retire AND Rebirth Requirements show (all tiers, or Default/Rare/
   Epic/Legendary/Mythic individually) — all eight unbound by default per
   that same convention (see declutter.html/rebirth-requirements-overlay.html
   for the actual scroll logic). Each is tracked by name so setting one
   never disturbs the others.

   "rebirthScreen" can't just call a function here directly — the actual
   read logic (screen capture + OCR + confirm step) lives in the renderer,
   wired to the button's own click listener in rebirth-screen-read.js. So
   the main process only broadcasts that it fired; a small listener in
   overlay-controls.js does btn.click() on the real button, which runs
   through the exact same code path (and the exact same on-screen confirm
   step) as clicking it by hand — still just a screen read + a local
   click, nothing touching Fortnite. */
const HOTKEY_HANDLERS = {
  hideAll: () => hideAllOverlays(),
  overlay: () => toggleOverlayVisible(),
  timers: () => toggleTimersVisible(),
  rebirthScreen: () => broadcast('hotkey:triggered', 'rebirthScreen'),
  hotkeyList: () => toggleHotkeyList(),
  declutter: () => toggleDeclutterVisible(),
  rebirthReqOverlay: () => toggleRebirthReqVisible(),
  // Same broadcast-and-let-the-renderer-react pattern as rebirthScreen above
  // — the actual scroll position lives in declutter.html's / rebirth-
  // requirements-overlay.html's own DOM, not anything the main process
  // tracks, so this just tells every window which direction to move. v1.7.3:
  // broadcast() already reaches every open window (see below), so both
  // declutter.html AND rebirth-requirements-overlay.html now listen for
  // this same 'declutterScrollUp'/'declutterScrollDown' event — no separate
  // rebirthReqScrollUp/Down handler needed any more.
  declutterScrollUp: () => broadcast('hotkey:triggered', 'declutterScrollUp'),
  declutterScrollDown: () => broadcast('hotkey:triggered', 'declutterScrollDown'),
  sneak: () => toggleSneakVisible(),
  sneakScrollUp: () => broadcast('hotkey:triggered', 'sneakScrollUp'),
  sneakScrollDown: () => broadcast('hotkey:triggered', 'sneakScrollDown'),
  critGuide: () => toggleCritGuideVisible(),
  critGuideScrollUp: () => broadcast('hotkey:triggered', 'critGuideScrollUp'),
  critGuideScrollDown: () => broadcast('hotkey:triggered', 'critGuideScrollDown'),
  spawnAlert: () => toggleSpawnAlertVisible(),
  // Safe to Retire tier filters live in settings (main process owns them),
  // so these flip the flag here and let the normal settings:changed
  // broadcast re-render declutter.html — no new IPC channel needed.
  declutterTierAll: () => toggleDeclutterTiersAll(),
  declutterTierDefault: () => toggleDeclutterTier('declutterShowDefault'),
  declutterTierRare: () => toggleDeclutterTier('declutterShowRare'),
  declutterTierEpic: () => toggleDeclutterTier('declutterShowEpic'),
  declutterTierLegendary: () => toggleDeclutterTier('declutterShowLegendary'),
  declutterTierMythic: () => toggleDeclutterTier('declutterShowMythic'),
  declutterRetired: () => toggleDeclutterTier('declutterShowRetired'), // same default-true flag flip as the tiers
  // v1.10.3: hotkey-based marking in Upcoming RB Req's overlay (broadcast to overlay.html)
  markDroid: () => broadcast('hotkey:triggered', 'markDroid'),
  markLevel: () => broadcast('hotkey:triggered', 'markLevel'),
  markLeft: () => broadcast('hotkey:triggered', 'markLeft'),
  markRight: () => broadcast('hotkey:triggered', 'markRight'),
  markUp: () => broadcast('hotkey:triggered', 'markUp'),
  markDown: () => broadcast('hotkey:triggered', 'markDown'),
  // v1.16.0: only overlay.html acts on it (switches whose list the HUD shows)
  hudFriend: () => broadcast('hotkey:triggered', 'hudFriend'),
  // v1.10.3: hotkey-based marking in the Rebirth Requirements overlay; since
  // v1.10.13 the same keys also drive Sneak Preview — see sendToMarkList().
  rebirthMarkDroid: () => sendToMarkList('rebirthMarkDroid'),
  rebirthMarkLeft: () => sendToMarkList('rebirthMarkLeft'),
  rebirthMarkRight: () => sendToMarkList('rebirthMarkRight'),
  rebirthMarkUp: () => sendToMarkList('rebirthMarkUp'),
  rebirthMarkDown: () => sendToMarkList('rebirthMarkDown'),
  markTarget: () => cycleMarkTarget(), // v1.11.1
  // v1.11.1: answer the Read Rebirth Screen result without alt-tabbing. Only the
  // tracker window owns that dialog (rebirth-screen-read.js).
  rebirthScreenApply: () => sendToTracker('rebirthScreenApply'),
  rebirthScreenCancel: () => sendToTracker('rebirthScreenCancel'),
  // v1.18.1: cycle keys. The tracker owns the active cycle and the cycle reset.
  cycleNext: () => sendToTracker('cycleNext'),
  cyclePrev: () => sendToTracker('cyclePrev'),
  finishCycle: () => sendToTracker('finishCycle'),
  undoFinishCycle: () => sendToTracker('undoFinishCycle'),
  rebirthLevelUp: () => sendToTracker('rebirthLevelUp'), // rebirth-level-detect.js owns the level
  rebirthLevelDown: () => sendToTracker('rebirthLevelDown'),
  // v1.10.8: master lock — see toggleKeybindsLock()/applyKeybindsLock() above
  keybindsLock: () => toggleKeybindsLock()
};
const DECLUTTER_TIER_KEYS = ['declutterShowDefault','declutterShowRare','declutterShowEpic','declutterShowLegendary','declutterShowMythic'];
// A tier counts as ON unless explicitly false — the same rule declutter.html
// and overlay-controls.js read it with, so the three can never disagree.
function toggleDeclutterTier(key){
  settings[key] = settings[key] === false;
  persistSettingsNow();
  broadcast('settings:changed', { ...settings });
}
function toggleDeclutterTiersAll(){
  const allOn = DECLUTTER_TIER_KEYS.every(k => settings[k] !== false);
  DECLUTTER_TIER_KEYS.forEach(k => { settings[k] = !allOn; });
  persistSettingsNow();
  broadcast('settings:changed', { ...settings });
}
function registerHotkeyFor(name, accelerator){
  const prev = registeredHotkeys[name];
  if(prev){
    try{ globalShortcut.unregister(prev); }catch(e){ /* ignore */ }
    delete registeredHotkeys[name];
  }
  if(!accelerator) return { ok: false, reason: 'empty' };
  let ok = false;
  try{
    ok = globalShortcut.register(accelerator, HOTKEY_HANDLERS[name]);
  }catch(e){
    ok = false;
  }
  if(ok) registeredHotkeys[name] = accelerator;
  return { ok, reason: ok ? null : 'in-use-or-invalid' };
}

/* Human-readable label + the settings field holding each hotkey's current
   accelerator, used only to build the startup failure notice below — every
   other place in this file already refers to hotkeys by their short name. */
const HOTKEY_LABELS = {
  hideAll: 'Hide All Overlays',
  overlay: 'Toggle Next Droids Needed', // the HUD; was "Current Rebirth Requirements" / "Upcoming RB Req's" until v1.18.1
  timers: 'Toggle Timers',
  rebirthScreen: 'Trigger Read Rebirth Screen',
  hotkeyList: 'Toggle Hotkey List',
  declutter: 'Toggle Safe to Retire List',
  rebirthReqOverlay: 'Toggle Rebirth Requirements', // "Overlay" dropped from the end 2026-09-23, see tracker.html/hotkey-list.html/README for the matching rename
  // Renamed 2026-09-24 (v1.7.3): pages whichever of Safe to Retire /
  // Rebirth Requirements is open, not just Safe to Retire — same
  // shared-control treatment as the tier filter just below. The old,
  // separate rebirthReqScrollUp/Down pair is retired (see DEFAULT_SETTINGS).
  declutterScrollUp: 'Scroll List: Up',
  declutterScrollDown: 'Scroll List: Down',
  // Renamed 2026-09-24 (v1.7.2): these flip settings keys shared with the
  // Rebirth Requirements overlay's own tier filter, not just Safe to
  // Retire's — see rebirth-requirements-overlay.html's TIER_SETTING.
  declutterTierAll: 'Tier Filter: Toggle All Tiers',
  declutterTierDefault: 'Tier Filter: Toggle Default',
  declutterTierRare: 'Tier Filter: Toggle Rare',
  declutterTierEpic: 'Tier Filter: Toggle Epic',
  declutterTierLegendary: 'Tier Filter: Toggle Legendary',
  declutterTierMythic: 'Tier Filter: Toggle Mythic',
  declutterRetired: 'Safe to Retire: Show/Hide Retired',
  sneak: 'Toggle Sneak Preview',
  sneakScrollUp: 'Scroll Sneak Preview Up',
  sneakScrollDown: 'Scroll Sneak Preview Down',
  critGuide: 'Toggle Optimal Crit Guide',
  critGuideScrollUp: 'Scroll Crit Guide Up',
  critGuideScrollDown: 'Scroll Crit Guide Down',
  spawnAlert: 'Turn Spawn Alert On / Off',
  markDroid: 'Mark Selected Droid',
  markLevel: 'Mark Entire Level',
  markLeft: 'Navigate Left',
  markRight: 'Navigate Right',
  markUp: 'Navigate Up',
  markDown: 'Navigate Down',
  hudFriend: 'Next Droids Needed: Switch You / Friends',
  rebirthMarkDroid: 'Mark Selected Droid (Rebirth Reqs / Sneak Preview / Safe to Retire)',
  rebirthMarkLeft: 'Navigate Left (Rebirth Reqs / Sneak Preview / Safe to Retire)',
  rebirthMarkRight: 'Navigate Right (Rebirth Reqs / Sneak Preview / Safe to Retire)',
  rebirthMarkUp: 'Navigate Up (Rebirth Reqs / Sneak Preview / Safe to Retire)',
  rebirthMarkDown: 'Navigate Down (Rebirth Reqs / Sneak Preview / Safe to Retire)',
  markTarget: 'Switch Mark Keys to the Next Open List',
  rebirthScreenApply: 'Read Rebirth Screen: Apply',
  rebirthScreenCancel: 'Read Rebirth Screen: Cancel',
  cycleNext: 'Next Cycle',
  cyclePrev: 'Previous Cycle',
  finishCycle: 'Finish Cycle (press twice)',
  undoFinishCycle: 'Undo Finish Cycle',
  rebirthLevelUp: 'Rebirth Level +1',
  rebirthLevelDown: 'Rebirth Level −1',
  keybindsLock: 'Lock/Unlock All Keybinds'
};
const HOTKEY_SETTINGS_KEY = {
  hideAll: 'hideAllHotkey',
  overlay: 'hotkey',
  timers: 'timersHotkey',
  rebirthScreen: 'rebirthScreenHotkey',
  hotkeyList: 'hotkeyListHotkey',
  declutter: 'declutterHotkey',
  rebirthReqOverlay: 'rebirthReqOverlayHotkey',
  declutterScrollUp: 'declutterScrollUpHotkey',
  declutterScrollDown: 'declutterScrollDownHotkey',
  declutterTierAll: 'declutterTierAllHotkey',
  declutterTierDefault: 'declutterTierDefaultHotkey',
  declutterTierRare: 'declutterTierRareHotkey',
  declutterTierEpic: 'declutterTierEpicHotkey',
  declutterTierLegendary: 'declutterTierLegendaryHotkey',
  declutterTierMythic: 'declutterTierMythicHotkey',
  declutterRetired: 'declutterRetiredHotkey',
  sneak: 'sneakHotkey',
  sneakScrollUp: 'sneakScrollUpHotkey',
  sneakScrollDown: 'sneakScrollDownHotkey',
  critGuide: 'critGuideHotkey',
  critGuideScrollUp: 'critGuideScrollUpHotkey',
  critGuideScrollDown: 'critGuideScrollDownHotkey',
  spawnAlert: 'spawnAlertHotkey',
  markDroid: 'markDroid',
  markLevel: 'markLevel',
  markLeft: 'markLeft',
  markRight: 'markRight',
  markUp: 'markUp',
  markDown: 'markDown',
  hudFriend: 'hudFriendHotkey',
  rebirthMarkDroid: 'rebirthMarkDroid',
  rebirthMarkLeft: 'rebirthMarkLeft',
  rebirthMarkRight: 'rebirthMarkRight',
  rebirthMarkUp: 'rebirthMarkUp',
  rebirthMarkDown: 'rebirthMarkDown',
  markTarget: 'markTargetHotkey',
  rebirthScreenApply: 'rebirthScreenApplyHotkey',
  rebirthScreenCancel: 'rebirthScreenCancelHotkey',
  cycleNext: 'cycleNextHotkey',
  cyclePrev: 'cyclePrevHotkey',
  finishCycle: 'finishCycleHotkey',
  undoFinishCycle: 'undoFinishCycleHotkey',
  rebirthLevelUp: 'rebirthLevelUpHotkey',
  rebirthLevelDown: 'rebirthLevelDownHotkey',
  keybindsLock: 'keybindsLockHotkey'
};

/* Registers all twenty-one global hotkeys from current settings and returns each
   one's { ok, reason } result, keyed by name — called once at launch. A
   failure here is otherwise silent (globalShortcut.register() just returns
   false, no exception, no OS-level detail) and was an open, never-confirmed
   question after the Ctrl+Shift+1/2/3/4 hotkeys shipped: "whether all these
   hotkeys register without OS-level conflicts on the user's machine." Rather
   than leave that to be discovered by a hotkey silently not working days
   later, this surfaces it immediately as an on-screen toast. */
function registerAllHotkeys(){
  const results = {};
  Object.keys(HOTKEY_LABELS).forEach(name=>{
    // v1.10.8: while locked, every hotkey except the lock toggle itself stays
    // unregistered with the OS — keybindsLock must keep working so there's
    // always a way back out of a lock without touching the app window.
    if(settings.keybindsLocked && name !== 'keybindsLock'){
      results[name] = { ok:false, reason:'empty' };
      return;
    }
    results[name] = registerHotkeyFor(name, settings[HOTKEY_SETTINGS_KEY[name]]);
  });
  return results;
}

/* v1.10.8: the lock toggle's actual effect — globalShortcut intercepts the
   key combo system-wide the moment it's registered, so merely ignoring the
   keypress inside HOTKEY_HANDLERS would still swallow it from whatever app
   the player is actually using (this is exactly what a user reported: the
   overlay's mark/navigate hotkeys firing while typing in another app for
   schoolwork). The fix has to unregister with the OS entirely, not just gate
   the handler — and keybindsLock's own registration is deliberately left
   alone so locking never strands the player with no keyboard way to undo it. */
function applyKeybindsLock(locked){
  if(locked){
    Object.keys(registeredHotkeys).forEach(name=>{
      if(name === 'keybindsLock') return;
      try{ globalShortcut.unregister(registeredHotkeys[name]); }catch(e){ /* ignore */ }
      delete registeredHotkeys[name];
    });
  } else {
    // Deliberately NOT registerAllHotkeys() here — that would also
    // unregister-then-immediately-re-register keybindsLock's own accelerator
    // even though locking never touched it, and that redundant cycle on the
    // exact key combo currently held down was silently failing to
    // re-register (Electron/OS race), leaving the lock hotkey dead after
    // its first use. keybindsLock is registered once at launch and never
    // touched again by the lock/unlock cycle itself.
    Object.keys(HOTKEY_LABELS).forEach(name=>{
      if(name === 'keybindsLock') return;
      registerHotkeyFor(name, settings[HOTKEY_SETTINGS_KEY[name]]);
    });
  }
}

function toggleKeybindsLock(){
  settings.keybindsLocked = !settings.keybindsLocked;
  persistSettingsNow();
  applyKeybindsLock(settings.keybindsLocked);
  broadcast('settings:changed', { ...settings });
  notify(settings.keybindsLocked ? '🔒 Keybinds locked' : '🔓 Keybinds unlocked');
}

function reportHotkeyRegistrationFailures(results){
  // reason 'empty' means the settings field is intentionally blank (see the
  // "convention" comment above DEFAULT_SETTINGS) — the player just hasn't
  // picked a combo for that overlay yet, not a real OS-level conflict, so it
  // must NOT show the "couldn't register" toast below. Only 'in-use-or-invalid'
  // (registerHotkeyFor actually tried and globalShortcut.register said no)
  // counts as a failure worth surfacing.
  const failedNames = Object.keys(results).filter(name => results[name] && !results[name].ok && results[name].reason !== 'empty');
  if(!failedNames.length) return;
  const parts = failedNames.map(name => HOTKEY_LABELS[name] + ' (' + (settings[HOTKEY_SETTINGS_KEY[name]] || 'none set') + ')');
  const plural = parts.length > 1;
  notify('⚠ ' + parts.length + ' hotkey' + (plural ? 's' : '') + " couldn't register — probably already used by another app: " + parts.join(', ') + '. Rebind ' + (plural ? 'them' : 'it') + ' in ⚙ Overlay Settings.');
}

function toggleOverlayVisible(){
  setOverlayVisible(!settings.visible);
}
function setOverlayVisible(visible){
  settings.visible = !!visible;
  persistSettingsNow();
  if(!overlayWindow) return;
  if(settings.visible) overlayWindow.showInactive();
  else overlayWindow.hide();
  broadcast('overlay:visibility-changed', settings.visible);
}

/* ---------------- timers banner ---------------- */
function toggleTimersVisible(){
  setTimersVisible(!settings.timersVisible);
}
function setTimersVisible(visible){
  settings.timersVisible = !!visible;
  persistSettingsNow();
  if(!timersWindow) return;
  if(settings.timersVisible) timersWindow.showInactive();
  else timersWindow.hide();
  broadcast('timers:visibility-changed', settings.timersVisible);
}

/* ---------------- broadcast helpers ---------------- */
function broadcast(channel, payload){
  BrowserWindow.getAllWindows().forEach(w=>{
    if(!w.isDestroyed()) w.webContents.send(channel, payload);
  });
  // v1.19.0 🌐: every store change passes here (store:set and the overlay mark handlers alike)
  if(channel === 'store:changed' && payload && LIVE_SOURCE_KEYS.has(payload.key)) liveSchedule();
}
function notify(message){
  broadcast('app:notify', message);
}
/* The list overlays the rebirthMark* keys can drive (v1.11.1). They go to ONE
   open list, never a broadcast: a hidden window keeps its DOM and selection, so
   a broadcast would mark whatever it had selected, unseen. With several open,
   settings.markTarget picks (Rebirth Requirements unless switched with the
   markTarget hotkey); if that one is closed, the first open list in this order. */
const MARK_LISTS = ['rebirthReq', 'declutter', 'sneak'];
function markListWindow(name){
  const w = { rebirthReq: settings.rebirthReqVisible && rebirthReqWindow,
              declutter: settings.declutterVisible && declutterWindow,
              sneak: settings.sneakVisible && sneakWindow }[name];
  return w && !w.isDestroyed() ? w : null;
}
function markTargetState(){
  const open = MARK_LISTS.filter(markListWindow);
  const target = open.includes(settings.markTarget) ? settings.markTarget : (open[0] || null);
  return { target, contested: open.length > 1 };
}
// Every list window shows the selection glow only while it's the target, and a
// "KEYS" tag while more than one list is open (overlay-theme.js).
function broadcastMarkTarget(){ broadcast('markTarget:changed', markTargetState()); }
function sendToMarkList(name){
  const w = markListWindow(markTargetState().target);
  if(w) w.webContents.send('hotkey:triggered', name);
}
function sendToTracker(name){
  if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('hotkey:triggered', name);
}

/* In-game notice (v1.11.1, game-toast.html): a small click-through, never-focused
   card at the top-centre of the game's screen (the saved capture screen), so a
   result that only shows in the tracker window (behind the game) can be read
   without alt-tabbing. Created on first use; hides itself after msg.ms. */
let toastWindow = null, toastReady = false, toastPending = null, toastTimer = null;
const TOAST_SIZE = { width: 480, height: 92 };
function toastBounds(){
  const ds = screen.getAllDisplays();
  const d = ds.find(x => String(x.id) === String(settings.captureDisplayId)) || screen.getPrimaryDisplay();
  const wa = d.workArea;
  return { x: Math.round(wa.x + (wa.width - TOAST_SIZE.width) / 2), y: Math.round(wa.y + wa.height * 0.1), ...TOAST_SIZE };
}
function showGameToast(msg){
  if(!msg || !msg.title) return;
  if(!toastWindow || toastWindow.isDestroyed()){
    toastReady = false;
    toastWindow = new BrowserWindow({
      ...toastBounds(),
      frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
      resizable: false, movable: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    toastWindow.setAlwaysOnTop(true, 'screen-saver');
    toastWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    toastWindow.setIgnoreMouseEvents(true);
    toastWindow.webContents.once('did-finish-load', ()=>{ toastReady = true; if(toastPending){ const m = toastPending; toastPending = null; deliverToast(m); } });
    toastWindow.on('closed', ()=>{ toastWindow = null; toastReady = false; });
    toastWindow.loadFile(path.join(__dirname, 'game-toast.html'));
  } else {
    toastWindow.setBounds(toastBounds());
  }
  if(toastReady) deliverToast(msg); else toastPending = msg;
}
function deliverToast(msg){
  if(!toastWindow || toastWindow.isDestroyed()) return;
  toastWindow.webContents.send('toast:show', msg);
  toastWindow.showInactive();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ if(toastWindow && !toastWindow.isDestroyed()) toastWindow.hide(); }, Math.min(20000, Math.max(1500, msg.ms || 6000)));
}

function cycleMarkTarget(){
  const open = MARK_LISTS.filter(markListWindow);
  if(open.length < 2) return;
  settings.markTarget = open[(open.indexOf(markTargetState().target) + 1) % open.length];
  persistSettingsNow();
  broadcastMarkTarget();
}

/* ---------------- IPC ---------------- */
// v1.18.0: read version.json (outgoing HTTPS GET only, nothing about the player is sent), at most
// once a day, then tell the tracker window. Any failure is silent: no banner, try again next launch.
function pendingUpdateInfo(){
  return updateCheck.pendingUpdate(settings.updateInfo, app.getVersion(), settings.updateDismissed);
}
function sendUpdateState(){
  if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:state', settings.updateCheck === false ? null : pendingUpdateInfo());
}
async function checkForUpdate(){
  if(settings.updateCheck === false) return;
  if(!updateCheck.checkIsDue(settings.updateLastCheck, Date.now())) return;
  try{
    const ctl = new AbortController();
    const timer = setTimeout(()=> ctl.abort(), 10000);
    let text = '';
    try{
      const res = await net.fetch(updateCheck.UPDATE_URL, { signal: ctl.signal, cache: 'no-store' });
      text = res.ok ? await res.text() : '';
    }finally{ clearTimeout(timer); } // also when the fetch fails (offline), not only on success
    const info = updateCheck.parseUpdateInfo(text);
    if(!info) return;
    settings = { ...settings, updateLastCheck: Date.now(), updateInfo: info };
    persistSettingsNow();
    sendUpdateState();
  }catch(e){ /* offline, blocked or malformed: stay quiet */ }
}

/* ---------------- 🌐 LIVE FRIENDS (v1.19.0) ----------------
   Opt-in (settings.liveFriends). live-sync.js holds the rules; this is the plumbing. While on,
   your friend code is built HERE from the store (the same code 📋 Copy my code gives) and saved
   to the Friends server when it changes. Live friends ('rebirth-liveFriends') are read only
   while a window watches them (the Friends panel, the HUD friend view). The secret key in
   'live-identity' never reaches a window: store:get/store:set refuse that key. */
const LIVE_IDENTITY = 'live-identity';
const LIVE_SOURCE_KEYS = new Set(['rebirth-ownedRank-v2', 'rebirth-activeCycle', 'rebirth-currentLevel', 'rebirth-friendName', 'rebirth-nameMerges']);
const live = { savedContent: null, savedAt: 0, retryAt: 0, timer: null, saving: false, state: 'off', newIdTries: 0,
  watchers: new Set(), knownSenders: new Set(), pollTimer: null, polledAt: 0, polling: false, unchanged: 0, friendsOffline: false };

function liveIdentity(){
  if(!liveSync.isIdentity(storeData[LIVE_IDENTITY])){
    storeData[LIVE_IDENTITY] = { id: liveSync.makeShareId(crypto.randomBytes), key: liveSync.makeSecretKey(crypto.randomBytes) };
    persistStoreDebounced();
  }
  return storeData[LIVE_IDENTITY];
}
// your friend code as of `time`; at time 0 it's the "has anything changed?" fingerprint
function myFriendCodeAt(time){
  shared.setNameMerges(storeData['rebirth-nameMerges']);
  const c = storeData['rebirth-activeCycle'];
  const cycle = (Number.isInteger(c) && c >= 1 && c <= 5) ? c : 1;
  const level = Math.max(0, Math.min(parseInt(storeData['rebirth-currentLevel'], 10) || 0, shared.cycleRealLevelCount(cycle)));
  return shared.encodeFriendCode({ name: shared.cleanFriendName(storeData['rebirth-friendName']) || 'Friend', cycle, level,
    owned: shared.friendOwnedFromMine(storeData['rebirth-ownedRank-v2'] || {}), time });
}
function liveStateForWindow(){
  const idn = settings.liveFriends ? liveIdentity() : null;
  return { on: !!settings.liveFriends, server: !!liveSync.LIVE_SERVER, id: idn ? idn.id : null,
    code: idn ? shared.LIVE_CODE_PREFIX + idn.id : null, state: settings.liveFriends ? live.state : 'off',
    savedAt: live.savedAt || null, friendsOffline: live.friendsOffline };
}
function sendLiveState(){
  if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('live:state', liveStateForWindow());
}
// one request to the Friends server -> {status (0 = no answer), text, retryAfter}
async function liveRequest(method, p, opts){
  if(!liveSync.LIVE_SERVER) return { status: 0 };
  const ctl = new AbortController();
  const timer = setTimeout(()=> ctl.abort(), 10000);
  try{
    const headers = {};
    if(opts && opts.key) headers.Authorization = 'Bearer ' + opts.key;
    if(opts && opts.body !== undefined) headers['Content-Type'] = 'text/plain;charset=utf-8';
    // security review: never follow a redirect (the key must only ever go to LIVE_SERVER), no cookies,
    // and read at most MAX_RESPONSE_BYTES of the answer
    const res = await net.fetch(liveSync.LIVE_SERVER + p, { method, headers, body: opts && opts.body, signal: ctl.signal,
      cache: 'no-store', redirect: 'error', credentials: 'omit' });
    return { status: res.status, text: await liveSync.readCapped(res, liveSync.MAX_RESPONSE_BYTES), retryAfter: res.headers.get('Retry-After') };
  }catch(e){
    return { status: 0 };
  }finally{ clearTimeout(timer); }
}

// a change (or launch / switching on, force) -> one save, after the settle time and the 2-min gap
function liveSchedule(force){
  if(!settings.liveFriends || !liveSync.LIVE_SERVER) return;
  if(force) live.savedContent = null;
  if(live.timer || live.saving) return; // the pending save reads the newest code when it runs
  if(live.savedContent === myFriendCodeAt(0)) return;
  live.timer = setTimeout(liveSaveNow, liveSync.saveDelay(live.savedAt, live.retryAt, Date.now()));
}
async function liveSaveNow(){
  live.timer = null;
  if(!settings.liveFriends) return;
  const content = myFriendCodeAt(0);
  if(content === live.savedContent) return;
  const idn = liveIdentity();
  const sentAt = Date.now();
  live.saving = true; live.state = 'saving'; sendLiveState();
  const r = await liveRequest('PUT', '/p/' + idn.id, { key: idn.key, body: myFriendCodeAt(sentAt) });
  live.saving = false;
  if(!settings.liveFriends) return; // switched off meanwhile: liveStop() already asked for the delete
  const out = liveSync.saveOutcome(r.status, r.retryAfter, Date.now());
  live.retryAt = out.retryAt || 0;
  if(out.state === 'ok'){ live.savedContent = content; live.savedAt = sentAt; live.state = 'ok'; live.newIdTries = 0; }
  else if(out.state === 'newId' && live.newIdTries < 2){ live.newIdTries++; delete storeData[LIVE_IDENTITY]; liveIdentity(); live.state = 'saving'; }
  else live.state = out.state === 'newId' ? 'error' : out.state;
  sendLiveState();
  if(live.state !== 'error') liveSchedule(); // a retry, or marks made while it was saving
}
// switched off: forget the schedule and delete the entry (retried at the next launch if offline)
async function liveStop(){
  if(live.timer){ clearTimeout(live.timer); live.timer = null; }
  live.savedContent = null; live.savedAt = 0; live.retryAt = 0; live.state = 'off';
  sendLiveState();
  const idn = storeData[LIVE_IDENTITY];
  if(!liveSync.isIdentity(idn)) return;
  const r = await liveRequest('DELETE', '/p/' + idn.id, { key: idn.key });
  if(settings.liveFriends) return; // switched back on meanwhile
  storeData[LIVE_IDENTITY] = { id: idn.id, key: idn.key, deletePending: r.status !== 200 };
  persistStoreDebounced();
}
function liveStartup(){
  if(settings.liveFriends) liveSchedule(true);
  else if(storeData[LIVE_IDENTITY] && storeData[LIVE_IDENTITY].deletePending) liveStop();
}

function liveFriendList(){ return shared.cleanLiveFriends(storeData['rebirth-liveFriends']); }
function liveSetFriends(list){
  storeData['rebirth-liveFriends'] = list;
  persistStoreDebounced();
  broadcast('store:changed', { key: 'rebirth-liveFriends', value: list });
}
async function liveFetchFriends(){
  const ids = liveFriendList().map(e => e.id);
  if(live.polling || !ids.length || !liveSync.LIVE_SERVER) return;
  live.polling = true; live.polledAt = Date.now();
  const r = await liveRequest('GET', '/p?ids=' + ids.join(','));
  live.polling = false;
  const found = r.status === 200 ? liveSync.parseFriendsResponse(r.text, ids) : null;
  if(live.friendsOffline !== !found){ live.friendsOffline = !found; sendLiveState(); }
  if(!found){ live.unchanged++; return; }
  const merged = liveSync.mergeFetched(liveFriendList(), found, ids); // the list may have changed meanwhile
  live.unchanged = merged.changed ? 0 : live.unchanged + 1;           // quiet friends -> check less often
  if(merged.changed) liveSetFriends(merged.list);
}
// poll while any window watches and there's someone to watch: every 90 s, every 5 min once quiet
function liveWantPolling(){ return live.watchers.size > 0 && liveFriendList().length > 0 && !!liveSync.LIVE_SERVER; }
function livePollSoon(ms){
  if(live.pollTimer) clearTimeout(live.pollTimer);
  const handle = setTimeout(async ()=>{
    await liveFetchFriends();
    if(live.pollTimer !== handle) return; // stopped or restarted meanwhile
    live.pollTimer = null;
    if(liveWantPolling()) livePollSoon(liveSync.pollDelay(live.unchanged));
  }, ms);
  live.pollTimer = handle;
}
function liveUpdatePolling(){
  if(liveWantPolling()){
    if(!live.pollTimer) livePollSoon(Date.now() - live.polledAt > 30000 ? 0 : liveSync.pollDelay(live.unchanged));
  } else if(live.pollTimer){
    clearTimeout(live.pollTimer); live.pollTimer = null;
  }
}
// someone looks again (panel opened, HUD friend view, window focus, new friend): back to every 90 s
function liveWakePolling(){
  live.unchanged = 0;
  if(!liveWantPolling()){ liveUpdatePolling(); return; }
  const since = Date.now() - live.polledAt;          // checked moments ago: the next check 90 s after that one
  livePollSoon(since > 15000 ? 0 : liveSync.POLL_MS - since);
}
function liveWatch(sender, on){
  const id = sender.id;
  const isNew = on && !live.watchers.has(id);
  if(on){
    live.watchers.add(id);
    if(!live.knownSenders.has(id)){
      live.knownSenders.add(id);
      sender.once('destroyed', ()=>{ live.watchers.delete(id); live.knownSenders.delete(id); liveUpdatePolling(); });
    }
  } else live.watchers.delete(id);
  if(isNew) liveWakePolling(); else liveUpdatePolling();
}

function wireIpc(){
  // v1.19.0 🌐 Live Friends
  ipcMain.handle('live:get', ()=> liveStateForWindow());
  ipcMain.handle('live:watch', (evt, on)=>{ liveWatch(evt.sender, !!on); });
  ipcMain.handle('live:refresh', ()=>{ live.unchanged = 0; if(Date.now() - live.polledAt > 15000) liveFetchFriends(); });
  ipcMain.handle('live:addFriend', (evt, id)=>{
    if(typeof id !== 'string' || !shared.LIVE_ID_RE.test(id)) return false;
    const list = liveFriendList();
    const old = list.find(e => e.id === id);
    const next = [old || { id, code: null, updatedAt: null, state: 'new' }, ...list.filter(e => e.id !== id)].slice(0, shared.LIVE_FRIENDS_MAX);
    liveSetFriends(next);
    live.polledAt = 0;
    live.unchanged = 0;
    if(liveWantPolling()) livePollSoon(0); else liveFetchFriends();
    return true;
  });
  ipcMain.handle('live:removeFriend', (evt, id)=>{
    liveSetFriends(liveFriendList().filter(e => e.id !== id));
    liveUpdatePolling();
    return true;
  });

  ipcMain.handle('update:get', ()=> (settings.updateCheck === false ? null : pendingUpdateInfo()));
  ipcMain.handle('update:dismiss', ()=>{
    const info = settings.updateInfo;
    settings = { ...settings, updateDismissed: info ? info.version : '' };
    persistSettingsNow();
    sendUpdateState();
  });
  ipcMain.handle('update:openPage', ()=> shell.openExternal(updateCheck.RELEASES_URL));
  // Reads straight from package.json's "version" field (Electron's own
  // app.getVersion() does this natively) — bump that one number on each
  // release and every place that displays it stays in sync automatically.
  // Added so a build that LOOKS unchanged (a stale, not-yet-restarted
  // Electron process, or an old unzip sitting next to a new one) can be
  // told apart from the current code at a glance, instead of the "is this
  // actually the new build?" confusion that has cost real back-and-forth
  // before (see the timer-banner saga in the project history).
  ipcMain.handle('app:getVersion', ()=> app.getVersion());

  // v1.19.0: the 🌐 Live secret key stays in this process (never read or written by a window)
  ipcMain.handle('store:get', (evt, key)=> (key !== LIVE_IDENTITY && key in storeData ? storeData[key] : null));
  ipcMain.handle('store:set', (evt, key, value)=>{
    if(key === LIVE_IDENTITY) return false;
    storeData[key] = value;
    persistStoreDebounced();
    broadcast('store:changed', { key, value });
    return true;
  });

  // overlay:markDroid — mark a single droid as obtained from overlay click
  ipcMain.handle('overlay:markDroid', (evt, data)=>{
    const { cycle, level, slot } = data;
    if(cycle < 1 || cycle > 5 || level < 1 || level > (shared.CYCLES[cycle] ? shared.CYCLES[cycle].length : 0) || slot < 0 || slot > 2) return false;
    const row = shared.CYCLES[cycle][level-1];
    if(!row || !row[slot]) return false;
    const [code, rawName] = row[slot];
    shared.setNameMerges(storeData['rebirth-nameMerges']);
    const nk = shared.normKey(shared.canonicalName(rawName));
    const rank = shared.rankOf(code);
    const ownedRank = storeData['rebirth-ownedRank-v2'] || {};
    const decision = shared.decideOwnedUpdate(ownedRank[nk], rank);
    if(decision.action === 'clear'){
      delete ownedRank[nk];
    } else if(decision.action === 'set'){
      ownedRank[nk] = rank;
    } else {
      return false; // blocked — don't update
    }
    storeData['rebirth-ownedRank-v2'] = ownedRank;
    persistStoreDebounced();
    broadcast('store:changed', { key: 'rebirth-ownedRank-v2', value: ownedRank });
    return true;
  });

  // overlay:markLevel — mark all 3 droids in a rebirth level as obtained from overlay click
  ipcMain.handle('overlay:markLevel', (evt, data)=>{
    const { cycle, level } = data;
    if(cycle < 1 || cycle > 5 || level < 1 || level > (shared.CYCLES[cycle] ? shared.CYCLES[cycle].length : 0)) return false;
    const row = shared.CYCLES[cycle][level-1];
    if(!row) return false;
    const ownedRank = storeData['rebirth-ownedRank-v2'] || {};
    shared.setNameMerges(storeData['rebirth-nameMerges']);
    row.forEach(d=>{
      const [code, rawName] = d;
      const nk = shared.normKey(shared.canonicalName(rawName));
      const rank = shared.rankOf(code);
      if(ownedRank[nk] === undefined || ownedRank[nk] < rank){
        ownedRank[nk] = rank;
      }
    });
    storeData['rebirth-ownedRank-v2'] = ownedRank;
    persistStoreDebounced();
    broadcast('store:changed', { key: 'rebirth-ownedRank-v2', value: ownedRank });
    return true;
  });

  // overlay:holdNextCycleMark (v1.10.13) — Sneak Preview marks a droid for the
  // cycle it previews. Held in 'rebirth-heldMarks' ({cycle -> {nk -> rank}}),
  // apart from ownedRank, until that cycle becomes active (tracker.html's
  // setActiveCycle → mergeHeldMarks). The renderer sends nk itself because it
  // has the player's name merges loaded and this process doesn't.
  ipcMain.handle('overlay:holdNextCycleMark', (evt, data)=>{
    const { cycle, nk, rank } = data;
    if(!(cycle >= 1 && cycle <= 5) || typeof nk !== 'string' || !nk || !Number.isInteger(rank) || rank < 0 || rank >= shared.RARITY_ORDER.length) return false;
    const held = storeData['rebirth-heldMarks'] || {};
    const marks = held[cycle] || {};
    const decision = shared.decideOwnedUpdate(marks[nk], rank);
    if(decision.action === 'blocked') return false;
    if(decision.action === 'clear') delete marks[nk];
    else marks[nk] = rank;
    if(Object.keys(marks).length) held[cycle] = marks;
    else delete held[cycle];
    storeData['rebirth-heldMarks'] = held;
    persistStoreDebounced();
    broadcast('store:changed', { key: 'rebirth-heldMarks', value: held });
    return true;
  });

  // overlay:toggleRetired (v1.10.13) — Safe to Retire marks a droid retired
  // (or un-retires it) for one cycle, in 'rebirth-retired' ({cycle -> {nk ->
  // owned rank retired}}). Never touches ownedRank; see isRetired() in
  // requirements.js. `rank` is the droid's currently logged rank.
  ipcMain.handle('overlay:toggleRetired', (evt, data)=>{
    const { cycle, nk, rank } = data;
    if(!(cycle >= 1 && cycle <= 5) || typeof nk !== 'string' || !nk || !Number.isInteger(rank) || rank < 0 || rank >= shared.RARITY_ORDER.length) return false;
    const retired = storeData['rebirth-retired'] || {};
    const marks = retired[cycle] || {};
    if(shared.isRetired(marks[nk], rank)) delete marks[nk];
    else marks[nk] = rank;
    if(Object.keys(marks).length) retired[cycle] = marks;
    else delete retired[cycle];
    storeData['rebirth-retired'] = retired;
    persistStoreDebounced();
    broadcast('store:changed', { key: 'rebirth-retired', value: retired });
    return true;
  });

  ipcMain.handle('settings:get', ()=> ({ ...settings }));
  ipcMain.handle('settings:set', (evt, partial)=>{
    // Snapshot every hotkey's current accelerator BEFORE merging, then for
    // any hotkey the caller actually changed, try to (re)register it and
    // revert to the previous binding if the OS says no. One generic loop
    // over HOTKEY_SETTINGS_KEY (2026-09-24) replaced eleven hand-copied
    // per-hotkey blocks that were all identical in shape — same behavior,
    // and a new hotkey now only needs its map entries, not another block.
    const prevHotkeys = {};
    Object.keys(HOTKEY_SETTINGS_KEY).forEach(name=>{ prevHotkeys[name] = settings[HOTKEY_SETTINGS_KEY[name]]; });
    const prevKeybindsLocked = settings.keybindsLocked;
    const prevLiveFriends = settings.liveFriends;
    settings = { ...settings, ...partial };
    persistSettingsNow();

    // v1.19.0 🌐 Live switched on (save now) or off (delete the entry)
    if('liveFriends' in partial && !!partial.liveFriends !== !!prevLiveFriends){
      if(settings.liveFriends){ live.newIdTries = 0; liveSchedule(true); sendLiveState(); }
      else liveStop();
    }

    // v1.10.8: lock toggled from the toolbar button (not the hotkey path,
    // which calls applyKeybindsLock itself via toggleKeybindsLock()).
    if('keybindsLocked' in partial && partial.keybindsLocked !== prevKeybindsLocked){
      applyKeybindsLock(settings.keybindsLocked);
    }

    let hotkeyResult = { ok: true, reason: null };
    let boundSetChanged = false;
    Object.keys(HOTKEY_SETTINGS_KEY).forEach(name=>{
      const key = HOTKEY_SETTINGS_KEY[name];
      if(!(key in partial) || partial[key] === prevHotkeys[name]) return;
      if(settings.keybindsLocked && name !== 'keybindsLock'){
        // Locked: record the new binding but leave the OS registration
        // alone — applyKeybindsLock(false) picks it up on unlock.
        boundSetChanged = true;
        return;
      }
      if(!partial[key]){
        // Cleared (Backspace in the rebind UI). registerHotkeyFor('') drops
        // the old OS registration and reports 'empty' — that IS the success
        // case here, so no revert.
        registerHotkeyFor(name, '');
        boundSetChanged = true;
        return;
      }
      hotkeyResult = registerHotkeyFor(name, settings[key]);
      if(!hotkeyResult.ok){
        settings[key] = prevHotkeys[name]; // revert, keep the old one working
        registerHotkeyFor(name, prevHotkeys[name]);
        persistSettingsNow();
      } else {
        boundSetChanged = true;
      }
    });
    // The hotkey card only lists bound hotkeys, so its height follows the count.
    if(boundSetChanged && hotkeyListWindow && !hotkeyListWindow.isDestroyed()){
      hotkeyListWindow.setBounds(computeDefaultHotkeyListBounds());
    }
    if(overlayWindow && (partial.position)){
      overlayWindow.setBounds(clampToDisplay({ ...overlayWindow.getBounds(), ...partial.position }));
    }
    if(timersWindow && (partial.timersPosition)){
      timersWindow.setBounds(clampToDisplay({ ...timersWindow.getBounds(), ...partial.timersPosition }));
    }
    if(declutterWindow && (partial.declutterPosition)){
      declutterWindow.setBounds(clampToDisplay({ ...declutterWindow.getBounds(), ...partial.declutterPosition }));
    }
    if(rebirthReqWindow && (partial.rebirthReqPosition)){
      rebirthReqWindow.setBounds(clampToDisplay({ ...rebirthReqWindow.getBounds(), ...partial.rebirthReqPosition }));
    }
    if(sneakWindow && (partial.sneakPosition)){
      sneakWindow.setBounds(clampToDisplay({ ...sneakWindow.getBounds(), ...partial.sneakPosition }));
    }
    if(critGuideWindow && (partial.critGuidePosition)){
      critGuideWindow.setBounds(clampToDisplay({ ...critGuideWindow.getBounds(), ...partial.critGuidePosition }));
    }
    if(spawnAlertWindow && (partial.spawnAlertPosition)){
      spawnAlertWindow.setBounds(clampToDisplay({ ...spawnAlertWindow.getBounds(), ...partial.spawnAlertPosition }));
    }
    broadcast('settings:changed', { ...settings });
    return { settings: { ...settings }, hotkeyResult };
  });

  ipcMain.handle('overlay:toggle', ()=>{ toggleOverlayVisible(); return settings.visible; });

  // craftBoxes:toggle/craftBoxes:hide (the "👁 Show Boxes" button's IPC
  // handlers) and the whole crafting-bench guide-box window system behind
  // them — showCalibBoxes()/hideCalibBoxes()/toggleCalibBoxes()/
  // destroyCalibOverlay()/findDisplayForResolution() — were removed
  // outright 2026-09-22 along with the rest of Read Crafting Bench. Dig
  // through git history if this ever needs resurrecting.

  ipcMain.handle('timers:toggle', ()=>{ toggleTimersVisible(); return settings.timersVisible; });

  ipcMain.handle('hotkeyList:toggle', ()=>{ toggleHotkeyList(); return hotkeyListVisible; });

  ipcMain.handle('declutter:toggle', ()=>{ toggleDeclutterVisible(); return settings.declutterVisible; });

  ipcMain.handle('rebirthReq:toggle', ()=>{ toggleRebirthReqVisible(); return settings.rebirthReqVisible; });

  ipcMain.handle('sneak:toggle', ()=>{ toggleSneakVisible(); return settings.sneakVisible; });
  // Force-show (not toggle), with every other overlay but the timers turned
  // off: tracker.html calls this when a cycle completes and the player picks
  // "Sneak Preview" in the prompt below (after it has reset that cycle).
  ipcMain.handle('sneak:show', ()=>{ showSneakFocused(); return settings.sneakVisible; });

  ipcMain.handle('critGuide:toggle', ()=>{ toggleCritGuideVisible(); return settings.critGuideVisible; });

  ipcMain.handle('spawnAlert:toggle', ()=>{ toggleSpawnAlertVisible(); return settings.spawnAlertVisible; });

  // Cycle-complete prompt (v1.7.1). A native box instead of the renderer's
  // confirm() because confirm() can only say OK/Cancel. Both buttons reset
  // the finished cycle (tracker.html does that part); they differ in what
  // opens next. cancelId deliberately points PAST both buttons: on Windows
  // the X and Esc always cancel and Electron returns cancelId as-is, and
  // left unset it would default to one of the buttons — i.e. closing the
  // box would silently reset progress. As set, closing it changes nothing.
  ipcMain.handle('cycle:askComplete', async (evt)=>{
    const opts = {
      type: 'none',
      title: "Fuzzy's Droid Tracker",
      message: 'Would you like to reset progress for this cycle and open the next, or open the sneak preview window?',
      buttons: ['Next Cycle', 'Sneak Preview'],
      defaultId: 0,
      cancelId: 2,
      noLink: true // plain side-by-side buttons, not Windows command links
    };
    const win = BrowserWindow.fromWebContents(evt.sender);
    const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    return response === 0 ? 'next' : (response === 1 ? 'sneak' : 'none');
  });

  ipcMain.handle('overlay:setLocked', (evt, locked)=>{
    settings.locked = !!locked;
    if(overlayWindow){
      if(settings.locked){
        const b = overlayWindow.getBounds();
        settings.position = { x: b.x, y: b.y };
        overlayWindow.setFocusable(false);
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
        // Unlocking force-shows the window (below) so it can actually be
        // dragged, even if it was toggled off at the time -- without this,
        // re-locking left it visibly on screen afterward, disagreeing with
        // settings.visible/the toggle button, until the user toggled
        // visibility again by hand.
        if(!settings.visible) overlayWindow.hide();
      } else {
        overlayWindow.setFocusable(true);
        overlayWindow.setIgnoreMouseEvents(false);
        overlayWindow.showInactive();
        overlayWindow.focus();
      }
    }
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  // v1.10.14: moving (overlay-drag.js) and corner-grip resizing (overlay-theme.js).
  // The renderer sends how far the pointer has moved since it went down; the
  // starting bounds are kept here so the window tracks the pointer exactly.
  // `send`, not `invoke`: pointermove fires fast and needs no reply. See
  // OVERLAY_WINDOWS for why overlays never use Windows' own drag.
  // v1.11.1: the other visible overlays are read once when a drag/resize
  // begins (they can't move meanwhile), so each pointermove is only the snap
  // math. See overlay-snap.js.
  function otherOverlays(win){
    return Object.values(OVERLAY_WINDOWS)
      .map(o => ({ w: o.win(), resizable: !!o.sizeKey }))
      .filter(({ w }) => w && w !== win && !w.isDestroyed() && w.isVisible())
      .map(({ w, resizable }) => ({ ...w.getBounds(), resizable }));
  }
  const dragStart = new Map(); // webContents id -> { bounds, others } when the drag began
  ipcMain.on('overlay:drag', (evt, data)=>{
    const o = overlayWindowFor(evt.sender);
    if(!o || !data) return;
    const win = o.win();
    if(data.phase === 'start'){ dragStart.set(evt.sender.id, { bounds: win.getBounds(), others: otherOverlays(win) }); return; }
    const d = dragStart.get(evt.sender.id);
    if(!d || !Number.isFinite(data.dx) || !Number.isFinite(data.dy)) return;
    let b = { ...d.bounds, x: d.bounds.x + data.dx, y: d.bounds.y + data.dy };
    if(settings.overlaySnap !== false){
      const wa = screen.getDisplayNearestPoint({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }).workArea;
      b = snapMove(b, d.others, wa);
    }
    win.setBounds(onOneDisplay(b));
    if(data.phase === 'end') dragStart.delete(evt.sender.id);
  });

  const resizeStart = new Map(); // webContents id -> { bounds, others } when the resize began
  ipcMain.on('overlay:resize', (evt, data)=>{
    const o = overlayWindowFor(evt.sender);
    if(!o || !o.sizeKey || !data) return;
    const win = o.win();
    if(data.phase === 'start'){ resizeStart.set(evt.sender.id, { bounds: win.getBounds(), others: otherOverlays(win) }); return; }
    const r = resizeStart.get(evt.sender.id);
    if(!r || !Number.isFinite(data.dx) || !Number.isFinite(data.dy)) return;
    const start = r.bounds;
    const wa = (screen.getDisplayMatching(start) || screen.getPrimaryDisplay()).workArea;
    let size = { x: start.x, y: start.y, width: start.width + data.dx, height: start.height + data.dy };
    if(settings.overlaySnap !== false || settings.overlaySnapSize !== false){
      const edges = settings.overlaySnap !== false ? r.others : [];
      const sizes = settings.overlaySnapSize !== false ? r.others.filter(b => b.resizable) : [];
      size = snapResize(size, edges, sizes, wa);
    }
    const min = o.minSize || OVERLAY_MIN_SIZE;
    const width = Math.round(Math.max(min.width, Math.min(size.width, wa.x + wa.width - start.x)));
    const height = Math.round(Math.max(min.height, Math.min(size.height, wa.y + wa.height - start.y)));
    win.setBounds({ x: start.x, y: start.y, width, height });
    if(data.phase === 'end'){
      resizeStart.delete(evt.sender.id);
      settings[o.sizeKey] = { width, height };
      persistSettingsNow();
    }
  });
  // The default size this overlay's zoom is measured against (1.0 at default).
  ipcMain.handle('overlay:baseSize', (evt)=>{
    const o = overlayWindowFor(evt.sender);
    if(!o || !o.defaults) return null;
    const d = o.defaults();
    return { width: d.width, height: d.height };
  });

  // "Reset position" — snaps a window straight back to its tuned default
  // spot and forgets the saved custom position, for when a drag went
  // somewhere awkward (or a resolution/monitor change left it looking
  // wrong) and re-eyeballing a drag is more hassle than starting over.
  // Works regardless of locked state: movement doesn't depend on lock,
  // only mouse-passthrough does (see createOverlayWindow and friends).
  ipcMain.handle('overlay:resetPosition', ()=>{
    settings.position = null;
    settings.size = null; // v1.10.14: reset = default spot AND default size
    if(overlayWindow) overlayWindow.setBounds(computeDefaultBounds());
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  // v1.11.1: the banner window is sized by timers:fit (below), so a reset only
  // moves it back; the default bounds' own width/height are just a first guess.
  ipcMain.on('timers:fit', (evt, size)=>{
    if(!timersWindow || timersWindow.isDestroyed() || evt.sender !== timersWindow.webContents || !size) return;
    const width = Math.ceil(size.width), height = Math.ceil(size.height);
    if(!(width > 0 && height > 0)) return;
    const b = timersWindow.getBounds();
    if(b.width === width && b.height === height) return;
    timersWindow.setBounds(clampToDisplay({ x: b.x, y: b.y, width, height }));
  });
  ipcMain.handle('markTarget:get', ()=> markTargetState());
  // v1.11.1 Read Rebirth Screen: show the picker on the next capture, and the
  // in-game notice (both sent by the tracker window only).
  ipcMain.handle('capture:changeScreen', (evt)=>{
    if(!mainWindow || evt.sender !== mainWindow.webContents) return false;
    forceScreenPicker = true;
    return true;
  });
  ipcMain.on('toast:show', (evt, msg)=>{
    if(mainWindow && evt.sender === mainWindow.webContents) showGameToast(msg);
  });

  // v1.13.0: the player's own alert sounds. The picked file is COPIED into the
  // app's own folder, so moving or deleting the original can't break an alert.
  // Only ids from settings.customSounds are ever turned into paths.
  const SOUND_DIR = path.join(app.getPath('userData'), 'custom-sounds');
  const SOUND_EXTS = ['.mp3', '.wav', '.ogg', '.m4a'];
  const MAX_SOUND_BYTES = 5 * 1024 * 1024, MAX_SOUNDS = 20;
  const soundEntry = (id) => (typeof id === 'string' && /^[a-z0-9]{4,24}$/.test(id))
    ? (settings.customSounds || []).find(s => s.id === id) : null;
  const soundPath = (s) => path.join(SOUND_DIR, s.id + (SOUND_EXTS.includes(s.ext) ? s.ext : '.mp3'));
  ipcMain.handle('sound:add', async (evt)=>{
    if(!mainWindow || evt.sender !== mainWindow.webContents) return { ok: false, reason: 'cancelled' };
    if((settings.customSounds || []).length >= MAX_SOUNDS) return { ok: false, reason: 'You already have ' + MAX_SOUNDS + ' sounds — remove one first.' };
    const r = await dialog.showOpenDialog(mainWindow, {
      title: 'Pick a sound for the timer alerts', properties: ['openFile'],
      filters: [{ name: 'Audio (mp3, wav, ogg, m4a)', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }]
    });
    if(r.canceled || !r.filePaths.length) return { ok: false, reason: 'cancelled' };
    const src = r.filePaths[0], ext = path.extname(src).toLowerCase();
    if(!SOUND_EXTS.includes(ext)) return { ok: false, reason: 'That file type isn\'t supported — use mp3, wav, ogg or m4a.' };
    try{
      if(fs.statSync(src).size > MAX_SOUND_BYTES) return { ok: false, reason: 'That file is over 5 MB — pick a shorter clip.' };
      fs.mkdirSync(SOUND_DIR, { recursive: true });
      const id = (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 24);
      const entry = { id, name: path.basename(src, path.extname(src)).slice(0, 40), ext };
      fs.copyFileSync(src, soundPath(entry));
      settings.customSounds = [...(settings.customSounds || []), entry];
      persistSettingsNow();
      broadcast('settings:changed', { ...settings });
      return { ok: true, sound: { id: entry.id, name: entry.name } };
    }catch(e){
      return { ok: false, reason: 'Couldn\'t copy that file (' + e.message + ').' };
    }
  });
  ipcMain.handle('sound:remove', (evt, id)=>{
    if(!mainWindow || evt.sender !== mainWindow.webContents) return false;
    const entry = soundEntry(id);
    if(!entry) return false;
    try{ fs.rmSync(soundPath(entry), { force: true }); }catch(e){ /* the app's own copy; nothing else to do */ }
    settings.customSounds = settings.customSounds.filter(s => s.id !== id);
    ['missionSoundChoice', 'blueprintSoundChoice', 'spawnAlertSound'].forEach(k => { if(settings[k] === 'custom:' + id) settings[k] = 'goodnews'; });
    if(settings.missionWarnSound === 'custom:' + id) settings.missionWarnSound = 'chime';
    ['stellarSoundChoice', 'mythicSoundChoice', 'kyberSoundChoice'].forEach(k => { if(settings[k] === 'custom:' + id) settings[k] = null; });
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return true;
  });
  // base64 of one own sound, for alert-sound.js to decode; null if it's gone.
  ipcMain.handle('sound:read', (evt, id)=>{
    const entry = soundEntry(id);
    if(!entry) return null;
    try{ return fs.readFileSync(soundPath(entry)).toString('base64'); }catch(e){ return null; }
  });

  ipcMain.handle('timers:resetPosition', ()=>{
    settings.timersPosition = null;
    if(timersWindow){
      const d = computeDefaultTimersBounds(), b = timersWindow.getBounds();
      timersWindow.setBounds(clampToDisplay({ x: d.x, y: d.y, width: b.width, height: b.height }));
    }
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  ipcMain.handle('declutter:resetPosition', ()=>{
    settings.declutterPosition = null;
    settings.declutterSize = null;
    if(declutterWindow) declutterWindow.setBounds(computeDefaultDeclutterBounds());
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  ipcMain.handle('rebirthReq:resetPosition', ()=>{
    settings.rebirthReqPosition = null;
    settings.rebirthReqSize = null;
    if(rebirthReqWindow) rebirthReqWindow.setBounds(computeDefaultDeclutterBounds());
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  ipcMain.handle('sneak:resetPosition', ()=>{
    settings.sneakPosition = null;
    settings.sneakSize = null;
    if(sneakWindow) sneakWindow.setBounds(computeDefaultDeclutterBounds());
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  ipcMain.handle('critGuide:resetPosition', ()=>{
    settings.critGuidePosition = null;
    settings.critGuideSize = null;
    if(critGuideWindow) critGuideWindow.setBounds(computeDefaultDeclutterBounds());
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  ipcMain.handle('spawnAlert:resetPosition', ()=>{
    settings.spawnAlertPosition = null;
    settings.spawnAlertSize = null;
    if(spawnAlertWindow) spawnAlertWindow.setBounds(computeDefaultSpawnAlertBounds());
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  ipcMain.handle('timers:setLocked', (evt, locked)=>{
    settings.timersLocked = !!locked;
    if(timersWindow){
      if(settings.timersLocked){
        const b = timersWindow.getBounds();
        settings.timersPosition = { x: b.x, y: b.y };
        timersWindow.setFocusable(false);
        timersWindow.setIgnoreMouseEvents(true, { forward: true });
        // See the matching comment in overlay:setLocked.
        if(!settings.timersVisible) timersWindow.hide();
      } else {
        timersWindow.setFocusable(true);
        timersWindow.setIgnoreMouseEvents(false);
        timersWindow.showInactive();
        timersWindow.focus();
      }
    }
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  ipcMain.handle('declutter:setLocked', (evt, locked)=>{
    settings.declutterLocked = !!locked;
    if(declutterWindow){
      if(settings.declutterLocked){
        const b = declutterWindow.getBounds();
        settings.declutterPosition = { x: b.x, y: b.y };
        declutterWindow.setFocusable(false);
        declutterWindow.setIgnoreMouseEvents(true, { forward: true });
        // See the matching comment in overlay:setLocked.
        if(!settings.declutterVisible) declutterWindow.hide();
      } else {
        declutterWindow.setFocusable(true);
        declutterWindow.setIgnoreMouseEvents(false);
        declutterWindow.showInactive();
        declutterWindow.focus();
      }
    }
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  ipcMain.handle('rebirthReq:setLocked', (evt, locked)=>{
    settings.rebirthReqLocked = !!locked;
    if(rebirthReqWindow){
      if(settings.rebirthReqLocked){
        const b = rebirthReqWindow.getBounds();
        settings.rebirthReqPosition = { x: b.x, y: b.y };
        rebirthReqWindow.setFocusable(false);
        rebirthReqWindow.setIgnoreMouseEvents(true, { forward: true });
        // See the matching comment in overlay:setLocked.
        if(!settings.rebirthReqVisible) rebirthReqWindow.hide();
      } else {
        rebirthReqWindow.setFocusable(true);
        rebirthReqWindow.setIgnoreMouseEvents(false);
        rebirthReqWindow.showInactive();
        rebirthReqWindow.focus();
      }
    }
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  ipcMain.handle('sneak:setLocked', (evt, locked)=>{
    settings.sneakLocked = !!locked;
    if(sneakWindow){
      if(settings.sneakLocked){
        const b = sneakWindow.getBounds();
        settings.sneakPosition = { x: b.x, y: b.y };
        sneakWindow.setFocusable(false);
        sneakWindow.setIgnoreMouseEvents(true, { forward: true });
        // See the matching comment in overlay:setLocked.
        if(!settings.sneakVisible) sneakWindow.hide();
      } else {
        sneakWindow.setFocusable(true);
        sneakWindow.setIgnoreMouseEvents(false);
        sneakWindow.showInactive();
        sneakWindow.focus();
      }
    }
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  ipcMain.handle('critGuide:setLocked', (evt, locked)=>{
    settings.critGuideLocked = !!locked;
    if(critGuideWindow){
      if(settings.critGuideLocked){
        const b = critGuideWindow.getBounds();
        settings.critGuidePosition = { x: b.x, y: b.y };
        critGuideWindow.setFocusable(false);
        critGuideWindow.setIgnoreMouseEvents(true, { forward: true });
        // See the matching comment in overlay:setLocked.
        if(!settings.critGuideVisible) critGuideWindow.hide();
      } else {
        critGuideWindow.setFocusable(true);
        critGuideWindow.setIgnoreMouseEvents(false);
        critGuideWindow.showInactive();
        critGuideWindow.focus();
      }
    }
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  // Unlocked, spawn-alert.html shows a sample alert and its drag bar so it can be placed.
  ipcMain.handle('spawnAlert:setLocked', (evt, locked)=>{
    settings.spawnAlertLocked = !!locked;
    if(spawnAlertWindow){
      if(settings.spawnAlertLocked){
        const b = spawnAlertWindow.getBounds();
        settings.spawnAlertPosition = { x: b.x, y: b.y };
        spawnAlertWindow.setFocusable(false);
        spawnAlertWindow.setIgnoreMouseEvents(true, { forward: true });
        // See the matching comment in overlay:setLocked.
        if(!settings.spawnAlertVisible) spawnAlertWindow.hide();
      } else {
        spawnAlertWindow.setFocusable(true);
        spawnAlertWindow.setIgnoreMouseEvents(false);
        spawnAlertWindow.showInactive();
        spawnAlertWindow.focus();
      }
    }
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });
}

/* ---------------- one-time userData migration (2026-09-22 rename) ----------------
   Electron's userData folder is named after the app's package.json `name`
   field (NOT `productName` — that field only feeds electron-builder's own
   installer/exe metadata, confirmed directly against the real folders this
   app has actually created on disk), so renaming the old package.json
   `name` "droid-tycoon-overlay" to "fuzzys-droid-tracker" would silently
   orphan every existing install's saved rebirth progress under the old
   folder unless something copies it forward first. Runs once: only when the
   new folder has no store file yet AND the old folder does, so it can never
   overwrite real progress already logged under the new name, and it's a
   total no-op for a fresh install that never had the old folder.

   CORRECTNESS NOTE (2026-09-23): this function originally checked for the
   old folder under the wrong name — the capitalized `productName` string
   ("Droid Tycoon Overlay") instead of the actual `name`-derived folder
   Electron creates ("droid-tycoon-overlay") — so it silently found nothing
   and copied nothing for every real upgrader, including the developer's own
   install. Fixed here; see app-status project doc for the real-world impact
   this had and how the affected install's data was recovered by hand. */
function migrateUserDataFromOldAppName(){
  try{
    const oldDir = path.join(app.getPath('appData'), 'droid-tycoon-overlay');
    const newDir = app.getPath('userData');
    if(fs.existsSync(STORE_PATH)) return; // already on the new name, nothing to bring over
    if(!fs.existsSync(oldDir)) return;    // fresh install, no old data exists
    fs.mkdirSync(newDir, { recursive: true });
    ['droid-tycoon-store.json', 'overlay-settings.json'].forEach(name=>{
      const src = path.join(oldDir, name);
      const dest = path.join(newDir, name);
      if(fs.existsSync(src) && !fs.existsSync(dest)){
        fs.copyFileSync(src, dest);
      }
    });
  }catch(e){
    console.error('userData migration from old app name failed (non-fatal, continuing with fresh data)', e);
  }
}

function createSecondaryWindows(){
  createOverlayWindow();
  createTimersWindow();
  createDeclutterWindow();
  createRebirthReqWindow();
  createSneakWindow();
  createCritGuideWindow();
  createSpawnAlertWindow();
  createHotkeyListWindow();
}

/* ---------------- lifecycle ---------------- */
if(singleInstanceLock){
  app.whenReady().then(()=>{
    protocol.handle('fdt', serveAppFile); // v1.19.0: the bundled OCR files (OCR_FILES)
    migrateUserDataFromOldAppName();
    storeData = loadJson(STORE_PATH, {});
    settings = loadJson(SETTINGS_PATH, DEFAULT_SETTINGS);
    migrateHotkeyLayout();
    migrateSoundDefault();

  wireIpc();
  setupDisplayMediaHandler();
  createMainWindow();
  const hotkeyRegResults = registerAllHotkeys();

  // Defer secondary window creation until mainWindow loads, so tracker.html
  // gets CPU priority to finish its own startup (~3.3MB icons-data.js parse)
  // instead of competing with 5 other overlay windows all parsing the same
  // file simultaneously.
  if(mainWindow){
    mainWindow.webContents.once('did-finish-load', ()=>{
      createSecondaryWindows();
      reportHotkeyRegistrationFailures(hotkeyRegResults);
      setTimeout(checkForUpdate, 5000);
      setTimeout(liveStartup, 7000); // v1.19.0 🌐: one save per launch keeps the entry from expiring
    });
  } else {
    // Fallback if mainWindow failed to create (shouldn't happen, but just in case)
    createSecondaryWindows();
    reportHotkeyRegistrationFailures(hotkeyRegResults);
  }

  app.on('activate', ()=>{
    if(BrowserWindow.getAllWindows().length === 0){
      createMainWindow();
      createSecondaryWindows();
    }
  });
  });
}

app.on('before-quit', ()=>{ isQuitting = true; });

app.on('window-all-closed', ()=>{
  if(process.platform !== 'darwin') app.quit();
});

app.on('will-quit', ()=>{
  globalShortcut.unregisterAll();
  if(storeWriteTimer){ clearTimeout(storeWriteTimer); storeWriteTimer = null; }
  saveJsonNow(STORE_PATH, storeData);
  saveJsonNow(SETTINGS_PATH, settings);
});
