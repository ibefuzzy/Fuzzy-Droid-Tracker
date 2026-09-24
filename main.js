'use strict';
/* ---------------------------------------------------------------------------
   Fuzzy's Droid Tracker — Electron shell.

   One normal decorated window (mainWindow, tracker.html) plus a handful of
   transparent/click-through/always-on-top overlay windows, each a
   completely separate OS window showing one piece of glanceable info:
     - overlayWindow    (overlay.html)     — current + next 3 rebirth reqs
     - timersWindow     (timers.html)      — Stellar/Mythic/Galactic/Mission countdowns
     - declutterWindow  (declutter.html)   — "safe to retire" Legendary/Mythic droids
     - rebirthReqWindow (rebirth-requirements-overlay.html) — every droid the
       active cycle asks for, same full list as the tracker's own 🧬 panel
     - hotkeyListWindow (hotkey-list.html) — on-screen hotkey reference card
   None of them ever touch Fortnite's process, memory, or input — they only
   ever read/write this app's own JSON store on disk and draw their own
   pixels. See README.md for why that's the safe category of "overlay".

   All windows share state through a tiny JSON-file store owned by this main
   process (storeGet/storeSet over IPC), so a change made in the tracker
   window (or any overlay) shows up everywhere else immediately.
--------------------------------------------------------------------------- */

const { app, BrowserWindow, ipcMain, globalShortcut, screen, session, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');

// Two instances would each independently load their own copy of the JSON
// store/settings into memory and each debounce-write to the SAME files on
// disk -- whichever instance's write lands last would silently overwrite
// the other's changes, with real tracked progress lost and no warning on
// either side. Refuse a second launch outright and just focus the window
// the first instance already has open.
if(!app.requestSingleInstanceLock()){
  app.quit();
} else {
  app.on('second-instance', ()=>{
    if(mainWindow){
      if(mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

const STORE_PATH = path.join(app.getPath('userData'), 'droid-tycoon-store.json');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'overlay-settings.json');

const DEFAULT_SETTINGS = {
  hideAllHotkey: 'Control+Shift+1', // one-way ONLY — hides every overlay below, never toggles them back on (new 2026-09-20, see migrateHotkeyLayout() below)
  hotkey: 'Control+Shift+3',   // toggles the Current Rebirth Requirements HUD ("Upcoming RB Req's") show/hide, works even while Fortnite is focused (moved from Alt+Shift+D on 2026-09-23 — brought into the same Ctrl+Shift+N family as every other overlay hotkey instead of sitting on its own odd-one-out combo)
  // calibHotkey / craftBenchHotkey retired 2026-09-22 along with the whole
  // Read Crafting Bench feature (see crafting-bench-read.js's own header
  // comment for why) — deliberately no longer in DEFAULT_SETTINGS, so a
  // fresh install never has them. migrateHotkeyLayout() below still reads
  // an EXISTING user's already-saved craftBenchHotkey value from their own
  // settings file (not from this object), so removing it here doesn't
  // affect that migration's correctness for anyone upgrading from an
  // older version.
  timersHotkey: 'Alt+Shift+T', // toggles the blueprint/mission countdown banners, same deal
  rebirthScreenHotkey: 'Control+Shift+6', // fires the 📸 Read Rebirth Screen button, same deal (moved from Ctrl+Shift+5 on 2026-09-23 — shifted down to make room for the new Ctrl+Shift+3 Upcoming RB Req's hotkey below)
  hotkeyListHotkey: 'Control+Shift+2', // toggles the on-screen hotkey reference list, same deal (moved from Ctrl+Shift+1 on 2026-09-20 — freed up for hideAllHotkey above)
  visible: true,
  opacity: 0.55,           // background opacity of the overlay panel, 0.2-0.92
  locked: true,            // false while the user is dragging it into position
  position: null,          // {x,y} in screen pixels; null = use the computed default
  timersVisible: true,
  timersLocked: true,
  timersPosition: null,
  missionSyncEpochMs: null, // exact timestamp (ms) of a confirmed live mission moment, set via "Sync mission timer"; null = use the built-in best-guess schedule
  declutterHotkey: 'Control+Shift+4', // toggles the "safe to retire" Legendary/Mythic droid list, same deal (moved from Ctrl+Shift+3 on 2026-09-23 — see hotkey above)
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
  declutterScrollUpHotkey: '',
  declutterScrollDownHotkey: '',
  // Which rarity tiers the Safe to Retire list shows (2026-09-24 — it used
  // to be Legendary/Mythic only, now every tier). Flipped by the six
  // declutterTier* hotkeys below (all unbound by default, per the
  // convention comment further down); declutter.html just re-renders off
  // settings:changed. Flat booleans rather than one nested object so
  // loadJson()'s top-level-key merge fills in any one that's missing.
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
  rebirthReqOverlayHotkey: 'Control+Shift+5', // toggles the standalone Rebirth Requirements overlay, same deal (moved from Ctrl+Shift+4 on 2026-09-23 — see hotkey above)
  rebirthReqVisible: true,
  rebirthReqLocked: true,
  rebirthReqPosition: null,
  // Same deal as declutterScrollUp/DownHotkey above, for the Rebirth
  // Requirements overlay's own scroll viewport.
  rebirthReqScrollUpHotkey: '',
  rebirthReqScrollDownHotkey: '',
  hasSeenIntroGuide: false, // first-launch walkthrough (guide.js) — set true once dismissed or finished; an existing settings file just merges this in as false via loadJson(), so upgraders see it once too
  hotkeyLayoutVersion: 0   // bumped by the migrations below; never hand-edit
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
let hotkeyListWindow = null;
let hotkeyListVisible = true; // runtime-only — always shown fresh each launch, not persisted
let storeData = {};
let settings = { ...DEFAULT_SETTINGS };
let storeWriteTimer = null;
let registeredHotkeys = {}; // name -> accelerator currently bound via globalShortcut

/* ---------------- persistence ---------------- */
function loadJson(filePath, fallback){
  let raw;
  try{
    raw = fs.readFileSync(filePath, 'utf8');
  }catch(e){
    return { ...fallback }; // no file yet -- the normal first-launch case, nothing to lose
  }
  try{
    return { ...fallback, ...JSON.parse(raw) };
  }catch(e){
    // The file exists but isn't valid JSON (a crash mid-write, a manual
    // edit gone wrong, disk corruption...). Back it up before falling
    // through to defaults instead of silently discarding it -- this file
    // can hold a player's whole tracked rebirth history, so losing it
    // without a trace on the next save (which would overwrite it with
    // fresh defaults) is worse than leaving a recoverable copy on disk.
    // Best-effort: if even the backup fails, still fall through and start
    // the app rather than crash on launch.
    try{ fs.copyFileSync(filePath, filePath + '.corrupt-' + Date.now() + '.bak'); }catch(e2){ /* best-effort */ }
    return { ...fallback };
  }
}
function saveJsonNow(filePath, data){
  try{
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }catch(e){
    console.error('Failed to write', filePath, e);
  }
}
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
  mainWindow.on('closed', ()=>{
    mainWindow = null;
    app.quit();
  });
}

function createOverlayWindow(){
  const bounds = settings.position ? clampToDisplay({ ...computeDefaultBounds(), ...settings.position }) : computeDefaultBounds();

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
      nodeIntegration: false
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
  const bounds = settings.declutterPosition ? clampToDisplay({ ...computeDefaultDeclutterBounds(), ...settings.declutterPosition }) : computeDefaultDeclutterBounds();

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
  const bounds = settings.rebirthReqPosition ? clampToDisplay({ ...computeDefaultDeclutterBounds(), ...settings.rebirthReqPosition }) : computeDefaultDeclutterBounds();

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
}

/* On-screen hotkey reference list: a small centered, click-through card
   listing every hotkey currently bound, shown automatically each time the
   app starts so a fresh session doesn't require remembering the bindings.
   It has no draggable position (see computeDefaultHotkeyListBounds) and its
   shown/hidden state is intentionally NOT persisted to settings — it
   always starts visible on launch and is only toggled at runtime via its
   own hotkey or toolbar button. */
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
function setupDisplayMediaHandler(){
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback)=>{
    try{
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 320, height: 200 } });
      if(!sources.length){ callback({}); return; }
      if(sources.length === 1){ callback({ video: sources[0] }); return; }
      const chosen = await pickScreenSource(sources);
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
   Requirements overlay, and the hotkey reference card. */
function hideAllOverlays(){
  setOverlayVisible(false);
  setTimersVisible(false);
  setDeclutterVisible(false);
  setRebirthReqVisible(false);
  hideHotkeyList();
}

/* ---------------- global hotkeys ----------------
   Seventeen independent named hotkeys share this same register/unregister
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
   changes for a future overlay), and four more — "declutterScrollUp"/
   "declutterScrollDown"/"rebirthReqScrollUp"/"rebirthReqScrollDown" — that
   page their overlay's now-scrollable card list, plus six "declutterTier*"
   hotkeys that toggle which rarity tiers Safe to Retire shows (all tiers,
   or Default/Rare/Epic/Legendary/Mythic individually) — all ten unbound
   by default per that same convention (see declutter.html/rebirth-
   requirements-overlay.html for the actual scroll logic). Each is tracked
   by name so setting one never disturbs the others.

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
  // tracks, so this just tells the right window which direction to move.
  declutterScrollUp: () => broadcast('hotkey:triggered', 'declutterScrollUp'),
  declutterScrollDown: () => broadcast('hotkey:triggered', 'declutterScrollDown'),
  rebirthReqScrollUp: () => broadcast('hotkey:triggered', 'rebirthReqScrollUp'),
  rebirthReqScrollDown: () => broadcast('hotkey:triggered', 'rebirthReqScrollDown'),
  // Safe to Retire tier filters live in settings (main process owns them),
  // so these flip the flag here and let the normal settings:changed
  // broadcast re-render declutter.html — no new IPC channel needed.
  declutterTierAll: () => toggleDeclutterTiersAll(),
  declutterTierDefault: () => toggleDeclutterTier('declutterShowDefault'),
  declutterTierRare: () => toggleDeclutterTier('declutterShowRare'),
  declutterTierEpic: () => toggleDeclutterTier('declutterShowEpic'),
  declutterTierLegendary: () => toggleDeclutterTier('declutterShowLegendary'),
  declutterTierMythic: () => toggleDeclutterTier('declutterShowMythic')
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
  overlay: 'Toggle Current Rebirth Requirements',
  timers: 'Toggle Timers',
  rebirthScreen: 'Trigger Read Rebirth Screen',
  hotkeyList: 'Toggle Hotkey List',
  declutter: 'Toggle Declutter List',
  rebirthReqOverlay: 'Toggle Rebirth Requirements', // "Overlay" dropped from the end 2026-09-23, see tracker.html/hotkey-list.html/README for the matching rename
  declutterScrollUp: 'Scroll Safe to Retire Up',
  declutterScrollDown: 'Scroll Safe to Retire Down',
  rebirthReqScrollUp: 'Scroll Rebirth Requirements Up',
  rebirthReqScrollDown: 'Scroll Rebirth Requirements Down',
  declutterTierAll: 'Safe to Retire: Toggle All Tiers',
  declutterTierDefault: 'Safe to Retire: Toggle Default',
  declutterTierRare: 'Safe to Retire: Toggle Rare',
  declutterTierEpic: 'Safe to Retire: Toggle Epic',
  declutterTierLegendary: 'Safe to Retire: Toggle Legendary',
  declutterTierMythic: 'Safe to Retire: Toggle Mythic'
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
  rebirthReqScrollUp: 'rebirthReqScrollUpHotkey',
  rebirthReqScrollDown: 'rebirthReqScrollDownHotkey',
  declutterTierAll: 'declutterTierAllHotkey',
  declutterTierDefault: 'declutterTierDefaultHotkey',
  declutterTierRare: 'declutterTierRareHotkey',
  declutterTierEpic: 'declutterTierEpicHotkey',
  declutterTierLegendary: 'declutterTierLegendaryHotkey',
  declutterTierMythic: 'declutterTierMythicHotkey'
};

/* Registers all seventeen global hotkeys from current settings and returns each
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
    results[name] = registerHotkeyFor(name, settings[HOTKEY_SETTINGS_KEY[name]]);
  });
  return results;
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
}
function notify(message){
  broadcast('app:notify', message);
}

/* ---------------- IPC ---------------- */
function wireIpc(){
  // Reads straight from package.json's "version" field (Electron's own
  // app.getVersion() does this natively) — bump that one number on each
  // release and every place that displays it stays in sync automatically.
  // Added so a build that LOOKS unchanged (a stale, not-yet-restarted
  // Electron process, or an old unzip sitting next to a new one) can be
  // told apart from the current code at a glance, instead of the "is this
  // actually the new build?" confusion that has cost real back-and-forth
  // before (see the timer-banner saga in the project history).
  ipcMain.handle('app:getVersion', ()=> app.getVersion());

  ipcMain.handle('store:get', (evt, key)=> (key in storeData ? storeData[key] : null));
  ipcMain.handle('store:set', (evt, key, value)=>{
    storeData[key] = value;
    persistStoreDebounced();
    broadcast('store:changed', { key, value });
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
    settings = { ...settings, ...partial };
    persistSettingsNow();

    let hotkeyResult = { ok: true, reason: null };
    let boundSetChanged = false;
    Object.keys(HOTKEY_SETTINGS_KEY).forEach(name=>{
      const key = HOTKEY_SETTINGS_KEY[name];
      if(!(key in partial) || partial[key] === prevHotkeys[name]) return;
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

  // "Reset position" — snaps a window straight back to its tuned default
  // spot and forgets the saved custom position, for when a drag went
  // somewhere awkward (or a resolution/monitor change left it looking
  // wrong) and re-eyeballing a drag is more hassle than starting over.
  // Works regardless of locked state: movement doesn't depend on lock,
  // only mouse-passthrough does (see createOverlayWindow and friends).
  ipcMain.handle('overlay:resetPosition', ()=>{
    settings.position = null;
    if(overlayWindow) overlayWindow.setBounds(computeDefaultBounds());
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  ipcMain.handle('timers:resetPosition', ()=>{
    settings.timersPosition = null;
    if(timersWindow) timersWindow.setBounds(computeDefaultTimersBounds());
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  ipcMain.handle('declutter:resetPosition', ()=>{
    settings.declutterPosition = null;
    if(declutterWindow) declutterWindow.setBounds(computeDefaultDeclutterBounds());
    persistSettingsNow();
    broadcast('settings:changed', { ...settings });
    return { ...settings };
  });

  ipcMain.handle('rebirthReq:resetPosition', ()=>{
    settings.rebirthReqPosition = null;
    if(rebirthReqWindow) rebirthReqWindow.setBounds(computeDefaultDeclutterBounds());
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

/* ---------------- lifecycle ---------------- */
app.whenReady().then(()=>{
  migrateUserDataFromOldAppName();
  storeData = loadJson(STORE_PATH, {});
  settings = loadJson(SETTINGS_PATH, DEFAULT_SETTINGS);
  migrateHotkeyLayout();

  wireIpc();
  setupDisplayMediaHandler();
  createMainWindow();
  createOverlayWindow();
  createTimersWindow();
  createDeclutterWindow();
  createRebirthReqWindow();
  createHotkeyListWindow();
  const hotkeyRegResults = registerAllHotkeys();
  // Wait for the tracker window's own scripts (overlay-controls.js's
  // onNotify subscription) to actually be wired up before pushing this —
  // sending it any earlier would go out before anything is listening and
  // just be lost, since webContents.send() doesn't queue across page loads.
  if(mainWindow){
    mainWindow.webContents.once('did-finish-load', ()=>{
      reportHotkeyRegistrationFailures(hotkeyRegResults);
    });
  }

  app.on('activate', ()=>{
    if(BrowserWindow.getAllWindows().length === 0){
      createMainWindow();
      createOverlayWindow();
      createTimersWindow();
      createDeclutterWindow();
      createRebirthReqWindow();
      createHotkeyListWindow();
    }
  });
});

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
