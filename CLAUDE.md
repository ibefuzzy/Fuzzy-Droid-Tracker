# Fuzzy's Droid Tracker — notes for Claude

Electron 32 app (tracker window + always-on-top overlays) for Droid Tycoon rebirth
tracking. README.md is the user-facing doc AND the changelog — it has the full
version history; this file is architecture + rules + current state only, kept
short on purpose so a fresh session can read it in one pass.

## Layout that matters
- `droid-data.js` — CYCLES (5 cycles x 35 levels x 3 [rarityCode, name]),
  RARITY_ORDER, DROID_RARITY_CLASS, REBIRTH_CREDITS (v1.15.1: credits per rebirth 1-40,
  same every cycle; read it only through requirements.js `rebirthCreditsFor(cycle, level)`
  + `formatCredits()`, which the HUD uses). Loaded as a classic `<script>` by every window.
- `requirements.js` — the ONE copy of the shared requirement logic: normKey,
  buildIndex, cycleCeilings, cycleLastNeededLevel, getUpcomingLevels,
  getDeclutterList, getSneakPreview, the ownership helpers (cycleCoveredCount,
  cycleDroidKeys, removeCycleMarks, decideOwnedUpdate, isValidImportPayload), and
  BORDER_SKINS/BORDER_SKIN_ORDER/BORDER_EMBLEMS/borderIconSvg (the 15 border
  skins + emblem renderer), THEME_PRESETS and the look helpers (sanitizeLook,
  effectiveTheme, share codes), APP_LOOKS + appLookFor/appLookCssVars (the tracker
  window's own colours, v1.15.0), the mission-warning helpers (cleanMissionWarnTimes,
  missionWarningsDue), and (v1.16.0) `sellFlagFor` (the coloured SELL flags) + the 👥 friend
  codes (`encodeFriendCode`/`decodeFriendCode`, `friendOwnedFromMine`/`friendOwnedRank`). Loaded by tracker.html, timers.html and every overlay page;
  `grep -l requirements.js *.html` gives the current list.
- `crit-guide-overlay.html` (v1.10.0) — the 5th overlay, ⚡ Optimal Crit Guide: a
  STATIC reference panel (hardcoded purchase-order data for one specific build),
  unlike the other four — no ownership/cycle data, no fullReload(), no
  store:changed listener. Same card/scroll-viewport/border-badge pattern as the
  others otherwise.
- `spawn-alert.html` + `spawn-parse.js` (v1.14.0) — the 6th overlay, 📡 Spawn Alert. The
  page itself captures the screen (getDisplayMedia, the saved capture screen), reads the
  game's feed box (screen fractions x0 y.355 w.235 h.165) every 1.5 s and shows each NEW
  "<Type> Droid (<Tier>) spawned" line as "DROID SPAWN / <Type> <Tier>". Pipeline, all
  tuned on a real capture: skip if <250 outlined-text px (empty feed); reuse the last result
  if the box is unchanged; else max(R,G,B)>160 mask, drop bright blobs taller than 20 px
  (walls/sky/panels), 2x, Tesseract psm 4. spawn-parse.js = fuzzy match against the only
  possible words + a "new spawn" tracker (8 s forget). Visible = watching (off by default);
  `backgroundThrottling:false`; `OVERLAY_WINDOWS.spawnAlert.minSize` (smaller than the
  other overlays). `window.spawnAlertStats()` in its DevTools shows read counts/ms.
  Which spawns alert: `settings.spawnAlertRules` {"type|tier": 0 off / 2 +sound}, missing =
  show (spawnRuleFor/cleanSpawnRules in spawn-parse.js, which tracker.html also loads for
  the Filters-tab grid); one `spawnAlertSound` + `spawnAlertVolume` via alert-sound.js.
- `tracker.html` — main window. The toolbar is a "Command Console": one
  `.console-row` per function group, each a two-column layout (fixed-width label +
  a separate `.console-row-buttons` strip) so a wrapped row indents under the
  button column instead of falling back under the label. Since v1.14.3 the Overlays row
  is a switchboard (`.overlay-board`): one equal `.tile` per overlay with a fixed
  `.tile-name` and a `.led`; overlay-controls.js `setTile()` only flips `.on`, never the
  text (test/pages.test.js guards it). Settings panel is a
  tabbed "holo-console" (Keybinds / Layout / Appearance / Filters / Timers / Droid Editor).
  Appearance was "Borders" until v1.11.1 and "Colors" before v1.10.0; its element ids are
  still `setTab-borders`/`setPane-borders`.
- `main.js` — Electron main: windows, JSON store (via persistence.js), settings
  (DEFAULT_SETTINGS + the generic `settings:set` IPC handler — any new setting key
  that isn't a hotkey or a position just works, no special-casing needed), global
  hotkeys, screen-capture handler.
- `tour.js` + `guide.js` (v1.16.0) — the tutorial. tour.js is the engine (welcome card with
  "Show me around" / "Skip", spotlight steps, "What's new" for updaters) and is byte-identical in
  dev/web-tracker/tracker/tour.js; guide.js holds the app's steps. **A new feature = a new step
  with `since: '<version>'`** in guide.js AND the web's TOUR_STEPS_COMPUTER/PHONE (+ bump the web's
  TOUR_VERSION). App: settings.hasSeenIntroGuide + introGuideVersion; ❔ Guide replays.
- `persistence.js` — crash-safe `loadJson`/`saveJsonNow` (tmp file + fsync +
  rename, `.bak` of the last good save, recovery from `.bak` if the main file is
  ever unreadable).
- `overlay-controls.js` — tracker-side wiring for every Electron-only control:
  hotkey capture, tier filter buttons, position/lock, the Appearance tab (skin swatches
  built from `BORDER_SKIN_ORDER`, presets + saved looks, "Edit colors for", card options),
  and the Timers tab (layout/size, per-timer sound pickers, 🎵 Your sounds).
- `settings-tabs.js` — pure presentation: tab switching, keybind search, bound
  count. Every control keeps the id `overlay-controls.js` wires it by.
- `sw-texture.css` — holo-console corner-bracket/scanline art for the 5 overlays.
  Reads `rgba(var(--sw-rgb, 150,215,255), a)` — each overlay sets its own
  `--sw-rgb`/`--accent` (from BORDER_SKINS, per the border skin picked in
  ⚙ Overlay Settings → Appearance), falling back to blue if unset. Each overlay also
  has its own `.border-badge` div (top-center, straddling the panel's top edge)
  showing that skin's emblem via `borderIconSvg()` — see any overlay's
  `applySettings()` for the pattern.
- `rebirth-screen-read.js` / `rebirth-level-detect.js` — the two OCR flows (bulk
  catch-up from the in-game Rebirth screen; continuous badge watching). Depend on
  tracker.html's globals (`ownedRank`, `activeCycle`, `markRowObtained`,
  `cycleCoveredCount`, etc.) — see the Rules section below, this is exactly where
  the v1.9.0 regression happened.
- `overlay-theme.css` / `overlay-theme.js` (v1.11.0) — the droid overlays' and the Spawn Alert's shared
  look variables (`--ov-*`), corner resize grip and size-driven zoom. `overlay-drag.js`
  (v1.11.0) — every overlay window's drag bar (see the no-`-webkit-app-region` Rule).
- `overlay-snap.js` (v1.11.1) — pure snap math (snapMove/snapResize) that main.js's
  `overlay:drag`/`overlay:resize` handlers run; unit-tested in test/overlay-snap.test.js.
  overlay-theme.js (v1.11.1) also applies the `theme*` colour settings and the mark-key
  target (`<html data-mark-list>` pages; `data-ov-own-alpha` on the HUD).
- `alert-sound.js` + `sounds/good-news-data.js` — `playAlert(choice, volume, readCustom)`
  (v1.13.0) plays every alert sound: tones, 'goodnews' (default since v1.11.1) and
  'custom:<id>' files, auto-levelled and capped at 8 s. Used by timers.html (timer alerts
  and mission warnings), spawn-alert.html and the tracker's ▶ previews. The data file is base64 generated from
  `sounds/good-news-everyone.mp3` by `node build-sound-data.js` (the mp3 and the script
  stay out of the exe and the repo). It's a Futurama clip; the user chose to ship it.
- `game-toast.html` (v1.11.1) — the in-game notice card (main.js `showGameToast`, created
  on first use; click-through, never focused, top-centre of the capture screen). Only
  the tracker sends it (`toast:show`); rebirth-screen-read.js uses it while the tracker
  isn't focused. Not an OVERLAY_WINDOWS entry: it never moves.
- `build-kyber-card-icons.js` (v1.11.0, not in the exe) — regenerates card-icons-data.js's
  75 Kyber slots as transparent cut-outs from the local Droidex screenshots.
- `release/` holds only the latest build (the user asked; older exes go to the Recycle Bin,
  never deleted). Published exes live on GitHub Releases.
- `_backup_*` folders — source snapshots taken before big changes (current list under
  Current state). They're excluded
  from the exe (`!_backup*/**`) and from searches (`.ignore`, which ripgrep reads).
- `dev/` — the Overlay Preview Lab and other mockups/labs (see Tools). Not in the exe or the repo.
- `dev/web-tracker/` — a byte-exact working copy of the website repo
  `ibefuzzy/ibefuzzy.github.io` (tracker/ = the web tracker). Edit here, preview at
  http://localhost:5178/dev/web-tracker/tracker/index.html (phone frames:
  dev/web-mobile-preview.html), push through the web upload pages. Its CLAUDE.md is the
  site repo's own notes.

## Rules
- Never change the persistence format without a migration. The store holds real progress.
- Classic scripts share one global lexical scope: a top-level `let`/`const` declared in
  two scripts on the same page is a SyntaxError that kills the whole page. A `function`
  redeclared by a later script is NOT an error — it silently replaces the shared one
  (this is how the v1.7.2-v1.7.4 SELL bugs happened). test/pages.test.js guards both.
- **When changing a shared function's signature in requirements.js (e.g. adding a
  required parameter), grep the WHOLE project root for call sites — not just
  tracker.html.** rebirth-screen-read.js, rebirth-level-detect.js, guide.js,
  settings-tabs.js and overlay-controls.js are all separate files loaded via
  `<script src>` that call these functions too; a grep scoped to one file misses
  them. This exact mistake shipped a broken "Apply" button in v1.9.0 (fixed in
  v1.9.1). test/pages.test.js now has a permanent guard for this ("every call site
  of a shared requirements.js function passes the right number of arguments") —
  if you add a parameter to a shared function, add its name to `ARITY_CHECKED` in
  that test. Treat the test as a safety net, not a substitute for checking first.
- `cycleCeilings` level = FIRST level a droid hits its max rarity. `cycleLastNeededLevel`
  = LAST level it's needed at any rarity. "Safe to sell/retire" must use the latter.
- Ownership (`ownedRank`, normKey -> rank 0..6) is global across cycles; requirements are
  per cycle. Completing a cycle clears ownership only for droids in that cycle's table.
- **Store listener pattern (v1.10.4):** Any window that READS ownedRank, activeCycle,
  nameMerges, or displayOverrides must LISTEN for store changes via
  `window.overlayAPI.onStoreChanged()`, not just load once at init. This ensures that
  when overlays modify the store (marking droids, advancing cycles), all windows that
  display that data see the change instantly. tracker.html is not exempt — it reads
  ownedRank and must listen. When adding a new store key that overlays can modify,
  add the listener to EVERY window that reads it. (No test guards this.)
- Border skins (⚙ Overlay Settings → Appearance; BORDER_SKINS/BORDER_SKIN_ORDER in
  requirements.js) are 15 since v1.12.0: glow outline + corner brackets + emblem badge,
  always VECTOR (never bitmaps) so they fit every overlay's shape. Faction emblems are
  the real insignia as SVG paths in `BORDER_EMBLEMS` (Font Awesome Free CC BY 4.0 +
  MDI Apache 2.0, credited in README → Credits; user-approved 2026-09-27 after
  comparing them in the Preview Lab). hunter/tatooine/grogu stay hand-drawn in
  borderIconSvg(). **Skin keys never change** (saved settings hold them).
  `THEME_PRESETS` (same file) = one-click skin + theme* colours for every skinnable
  window (the five droid overlays, the timers, the Spawn Alert). Try new skins/presets in
  `dev/skin-candidates.js` via the lab first.
- **App looks (v1.15.0) theme the tracker window itself.** `APP_LOOKS` in requirements.js
  (13, keys never change; `settings.appLook`) set the theme variables in tracker.html's
  `:root` (`--bg-rgb`, `--accent-rgb`, `--holo-rgb`, `--surface-rgb`, … + a few hex vars;
  `APP_LOOK_VAR_NAMES` lists them). **New tracker CSS must use those variables, never a
  literal of the default green/blue** (e.g. `rgba(var(--holo-rgb),.2)`, not
  `rgba(143,214,255,.2)`), or it stays green/blue in every look; test/app-looks.test.js
  fails on the literals. Rarity/tier colours and the settings tabs' `--saber` stay fixed.
  The default look == :root exactly (tested), and it's applied by clearing the overrides.
  overlay-controls.js `applyAppLook()` also caches the vars in localStorage
  (`fdt-appLookVars`) for tracker.html's no-flash `<head>` script. THEME_PRESETS' `appLook`
  = the look a preset switches the app to while `appLookFollowsPresets` is on. Try new
  looks in `dev/app-looks-lab.html` (real tracker per look; extras in
  `dev/app-look-candidates.js`).
- **Never open/save any project file (JS/HTML, this repo's or the sibling
  web tracker's) without pinning `encoding='utf-8'` explicitly, especially
  from a Windows-side script.** Windows' default `open()` locale encoding is
  cp1252, not UTF-8; reading UTF-8 source that way and writing it back out as
  UTF-8 double-encodes every em-dash/emoji/special character into mojibake
  that looks fine in a diff tool set to the same wrong encoding but is
  actually corrupt. This cost a full session on the sibling
  `ibefuzzy/ibefuzzy.github.io` repo (v1.10.8, 2026-09-26) before it was
  diagnosed — see that repo's `memory/encoding_corruption_playbook.md` for
  the exact byte-level diagnostic (how to tell recoverable double-encoding
  apart from an earlier "fix" that destroyed it with U+FFFD, and how to
  reverse it) if this project's own README/HTML ever shows `�` or
  `â€™`-style garbage.
- No git on this machine (not installed). GitHub repo: ibefuzzy/Fuzzy-Droid-Tracker.
  Source pushes go through Claude in Chrome's `file_upload` onto
  `github.com/ibefuzzy/Fuzzy-Droid-Tracker/upload/main` — works directly from the
  project folder (a separate staging copy elsewhere fails; `file_upload` only reads
  paths already in the session's allowed folders). Release flow: after pushing
  source, open `releases/new?tag=vX.Y.Z&target=main&title=...&body=...` prefilled
  with notes + the exe's SHA256; the user drags the exe in (too large — 65+MB — for
  `file_upload`'s 10MB cap) and publishes themselves.
  **Push source BEFORE the release is published, and verify it landed**: v1.10.10–
  v1.10.12 shipped as exes while `main` stayed on v1.10.9 source, so those tags
  point at stale code. Diff local vs `main` by git blob SHA, and use one upload page
  per folder (`/upload/main/test`, `/upload/main/test/helpers`). Exact steps in
  GOTCHAS_AND_CONSTRAINTS.md → "No Git Locally".
- **Overlay marks that aren't real ownership never write ownedRank** (v1.10.13).
  Sneak Preview "held" marks and Safe to Retire "retired" marks each have their own
  per-cycle store key (`rebirth-heldMarks`, `rebirth-retired`). Writing them to
  ownedRank would either count toward the wrong cycle / get wiped at completion,
  or un-cover past levels so the cycle can never complete. Follow the same pattern
  for any future "mark X" idea. Details: GOTCHAS_AND_CONSTRAINTS.md.
- **Hotkeys that act on an overlay's selection go through `sendToMarkList()`**,
  never `broadcast()`: hidden overlays keep their DOM and still receive broadcasts.
- **Overlay windows never use `-webkit-app-region: drag`** (v1.10.14). They move only
  through `overlay-drag.js` (`#dragHandle` -> `overlay:drag`) and resize only through
  overlay-theme.js's grip (`overlay:resize`); main.js places them, always wholly on ONE
  monitor. Windows' own drag let an overlay straddle two monitors, and Windows then drew
  the second monitor's part again on the first (a moving mirror). A new overlay window:
  `#dragHandle` + `overlay-drag.js` on its page, and an entry in `OVERLAY_WINDOWS` in
  main.js. test/pages.test.js enforces the page side.
- Build: `npm run dist` (with `$env:CSC_IDENTITY_AUTO_DISCOVERY='false'` set first)
  -> `release\Fuzzy's Droid Tracker X.Y.Z.exe`. The app is single-instance —
  launching a new exe while an old one runs just focuses the old window, so the
  user closes the running app before launching a new build.

## Tests
`npm test` runs Node's built-in test runner over `test/**/*.test.js` (121 tests; plain
`node --test` also sweeps _backup_* and the static server, so use npm test;
test/sell-flags.test.js + test/friends.test.js cover v1.16.0;
test/rebirth-credits.test.js checks all 40 credit costs display exactly as the game chart writes them;
test/app-looks.test.js checks the app looks and bans default-colour literals in tracker.html's CSS;
test/skins.test.js checks every skin/preset, test/appearance.test.js the looks and
share codes, test/spawn-parse.test.js replays real feed OCR from test/fixtures/).
`test/helpers/load-shared.js` loads droid-data.js + requirements.js into an isolated vm
context the same way a browser window does. Top-level let/const must be read with
`run('NAME')`; functions are exposed directly (e.g. `s.cycleCoveredCount(...)`) — see
the `api` object in that helper, and add a new shared function there when you add
one to requirements.js, or tests can't reach it.
`test/pages.test.js` guards: redeclaration (SyntaxError and silent shadowing), every
element id a script looks up exists exactly once, and — as of v1.9.1 — every call
site of a shared requirements.js function passes the right number of arguments.

## Tools: what to reach for

- **Overlay Preview Lab** (`dev/overlay-lab.html`, dev-only, `!dev/**` keeps it out of the
  exe): all five REAL overlay pages side by side in frames (srcdoc + `<base href="/">` +
  a mock overlayAPI), fed fake progress (cycle 1, rebirth 22). Controls: theme presets,
  border skin, Appearance colours, size 100–150%, game-like backdrops, and the KEYS tag.
  Candidate skins/presets live in `dev/skin-candidates.js` and are patched into each
  frame's BORDER_SKINS/borderIconSvg, so skins can be judged before they're in the app.
  Real Star Wars insignia (Font Awesome Free brands CC BY 4.0, MDI Apache 2.0) are
  cached in `dev/emblems-data.js` by `node dev/fetch-emblems.js` (Iconify API). Open:
  `node test/helpers/static-server.js 5179` -> http://localhost:5179/dev/overlay-lab.html
  (launch.json "tracker-static-alt"). Use it for any look change instead of hand-mocking.
  Gotcha: a literal `</script>` inside an inline script's string ends the block; write `<\/script>`.

- **App Looks Lab** (`dev/app-looks-lab.html`, dev-only, v1.15.0): the REAL tracker.html in
  one frame per app look (APP_LOOKS + `APP_LOOK_EXTRA` from `dev/app-look-candidates.js`),
  fake progress via a mock overlayAPI, View = main window or ⚙ settings open. Frames load
  one at a time (IntersectionObserver never fires while the Browser pane is hidden). The
  user couldn't see the hidden Browser pane: give them the localhost link to open in Chrome.
- **HUD credits preview** (`dev/hud-credits-preview.html`, dev-only, v1.15.1): the real
  overlay.html ten times (rebirths 0, 4 … 36), so all 40 credit costs show at once;
  `?cycle=N`, `?cols=N`. To send the user a picture: open it in their Chrome (window is
  1920 wide at DPR 1, all 10 fit) and screenshot / zoom with `save_to_disk`, then
  SendUserFile. An off-screen Electron capture from this PowerShell exits -1 before the
  script runs (even with --no-sandbox), so don't bother with that route.
- **Spawn Alert replay harness** (`dev/spawn-alert-harness.html`, dev-only): runs the real
  spawn-alert.html with a mock overlayAPI and a fake getDisplayMedia that replays real game
  frames (`dev/spawn-frames/` + manifest.json, 23 frames) at their recorded timing, so
  capture → OCR → parse → alert all run. Logs every check; `?only=<frame>` shows the image
  the OCR gets; `?cut=&blob=&up=&q=` try other settings. Expect 6 alerts (Galactic C,
  Diamond C, Beskar C, Rainbow C x2, Galactic E). Canvas captureStream goes through the same
  YUV video path as a real capture, which is why an offline-only (sharp/PNG) test misled once.
- **Rebuild the Kyber card icons:** `node build-kyber-card-icons.js`. Use it when Kyber
  art changes or the game adds a droid. It needs the LOCAL-ONLY folders
  `droidex-card-screenshots/KYBER/` (6 in-game Droidex screenshots) and
  `droid-cards/rebirth/<VARIANT>/` (from `extract-droid-cards.js`), and rewrites ONLY the
  75 Kyber slots of `card-icons-data.js`. Back that file up first, then eyeball a
  contact sheet (recipe in COMMON_TASKS.md → "Regenerating Kyber card icons").
- **Prove a CSS refactor changes nothing:** snapshot every element's computed style
  before, edit, snapshot after, diff (recipe in TEST_WITHOUT_ELECTRON.md → "Computed-style
  parity"). Used to prove v1.11.0's theme refactor was pixel-identical (853 elements).
- **Before any release, diff local vs GitHub `main`** by git blob SHA and upload only the
  mismatches, one upload page per folder (recipe + script in COMMON_TASKS.md → Building &
  Releasing). v1.10.10–v1.10.12 shipped without their source reaching `main`.
- **Drive an overlay in the browser:** mock `window.overlayAPI` (a Proxy that no-ops
  anything unmocked), capture the `on*` callbacks, and call them to fake hotkeys, store
  and settings broadcasts (TEST_WITHOUT_ELECTRON.md → "Driving an Overlay's Hotkeys").
- **Moving/resizing overlays:** only through `overlay-drag.js` / overlay-theme.js's grip,
  never `-webkit-app-region` (see Rules). Real window moves can't be tested in the
  browser, so the user tests those on their 2-monitor setup.

## Smoke-testing a page without Electron
`node test/helpers/static-server.js 5178` serves the project root; open
http://localhost:5178/ (tracker.html). Outside Electron, `overlay-controls.js`
exits immediately (`if(!window.overlayAPI) return;`), so most controls — including
the whole Appearance tab — do nothing. To actually exercise Electron-only UI without
the real app, mock `window.overlayAPI` (getSettings/setSettings/onSettingsChanged
at minimum) BEFORE the page's scripts run, then `document.open(); document.write(html); document.close();`
to re-run them against the mock (each
overlay needs its own mock: e.g. crit-guide-overlay.html only needs
getSettings/onSettingsChanged/onHotkeyTriggered/setCritGuideLocked, no storeGet
plumbing, since it reads no droid/cycle data at all). The tracker itself still
works normally outside Electron via a localStorage fallback (real progress in
userData is never touched).

**Smoke-testing the real built app:** launch `release\win-unpacked\Fuzzy's Droid Tracker.exe`
with `--user-data-dir=<scratch>\smoke-userdata --remote-debugging-port=9333` (an isolated
profile, so the user's progress is never touched) and drive it over CDP (Runtime.evaluate).
Stop test copies ONLY by that `--user-data-dir` in the process command line (Win32_Process),
never by exe path: the user may be running the app from `release\win-unpacked` too. Tell the
user before launching; they may be in-game and close stray windows.

## Current state (2026-09-30): v1.16.0 released (app + website)

- **App v1.16.0** = 👥 Friends (friend codes, no server; tracker panel + HUD friend switch),
  coloured SELL flags, the new tutorial (tour.js/guide.js, skippable, "What's new" for updaters),
  💎 Nova Crystal rewards, and no default hotkeys for new installs (no hotkey list on launch).
  The design decisions are in CLAUDE_HISTORY.md (2026-09-30). Source pushed to `main` and checked
  by blob SHA; the user publishes the release (drags the exe). `release\` holds only 1.16.0 (+
  win-unpacked). Snapshots: `_backup_v1.15.1_approved/`, `_backup_v1.16.0_approved/`.
- **Web tracker** got the same features (Friends + `#friend=` link view, SELL colours, tutorial
  with phone steps, crystals; data `?v=1.16.0`). The local copy `dev/web-tracker/` == live
  `main` after the push; re-download it (raw files, byte-exact) before the next web edit if
  the site may have changed. Its own notes: dev/web-tracker/CLAUDE.md.
- **Next app work: bump package.json FIRST** (1.16.0 is published; a feature → 1.17.0). A new
  feature also gets a tutorial step (`since: '1.17.0'`) in guide.js AND the web's step lists.
- Players are starting to send feedback/requests (the crystals were the first); expect more.
- **NEXT TASK (the user's decision, 2026-09-29): "Rarity on each droid" in the app, OVERLAYS
  ONLY** (not the tracker window). It's the website's 🎨 Look option (a player's idea): **Picture
  color** (today) or **Written under the name** (neutral icon frame + "NEED STELLAR" in the
  rarity's colour under the droid's name). Apply to the 🎯 HUD (overlay.html), 🧬 Rebirth
  Reqs, ♻ Safe to Retire ("HAVE X") and 🔮 Sneak Preview cards. Suggested: one setting (e.g.
  `overlayRarityStyle`, 'color' | 'text'), picked in ⚙ Overlay Settings → Appearance; the
  shared overlay-theme.js sets a class on each overlay's `<html>` and each card renders a
  hidden-by-default label (the web version's pattern: `.rar-label` + `html.rarity-text`,
  see dev/web-tracker/tracker/index.html). Keep the cards from growing (measure
  scrollHeight vs clientHeight, as with the credit chip); mockup first in the Overlay
  Preview Lab and send a picture before building.
- The user may have turned on GitHub 2FA (required by Nov 4, 2026). Never change account
  security settings for them.
- Candidate next ideas (offered 2026-09-29, none picked yet):
  - App: an "update available" notice (checks GitHub releases); Spawn Alert "adjust box" for
    screens other than 1920x1080; Export/Import that also carries held/retired marks (app
    AND web); rebirth history + pace ("time per rebirth"); a spawn log; a hotkey to cycle
    looks in-game; the two small fixes under Known follow-ups.
  - Credits: read the cost off the Rebirth screen with the existing OCR, if it's shown there
    (would confirm the per-cycle assumption). Needs a screenshot from the user.
- Working habits that held up this session (details in memory + Lessons):
  - Show looks/layouts as mockups first (dev/*-mockup.html, dev/app-looks-lab.html,
    dev/web-layout-mockup.html); the user picks by eye. When the Browser pane is hidden,
    give a localhost link or screenshot through their Chrome and SendUserFile.
  - Release: bump → build (release/next if their exe is running) → user tests → snapshot →
    blob-SHA diff vs main → one upload page per folder, Claude commits (focus+Enter or a
    coordinate click; list_commits before any retry) → verify SHAs → pre-fill the release →
    user drags the exe + publishes → check the asset digest.
  - Web push: run `node scripts/validate-tracker-data.js` in dev/web-tracker; bump both `?v=`
    stamps when droid-data.js/icons-data.js change; upload icons/assets before the page that
    uses them; check the live URL afterwards. The site is live the moment `main` changes.
- When the user says a sound or feature "doesn't work", read their
  `%APPDATA%\fuzzys-droid-tracker\overlay-settings.json` first (read-only).
- package.json is CRLF with PowerShell-style double-space formatting; edit lines in place.
- `release\` keeps only the newest exe (older ones → Recycle Bin; published ones are on
  GitHub Releases). Take a `_backup_vX_approved/` before a big change and recycle the
  oldest so about two remain (snapshots copy the whole root, ~56 MB each).
- Don't run `npm run dist` while the user runs the exe it would replace: it hangs with no
  error. Build with `--config.directories.output=release/next` and move it over afterwards.
- Recent versions in one line each (details: README changelog + CLAUDE_HISTORY.md):
  - v1.16.0: 👥 Friends (codes, no server), coloured SELL flags, tutorial, 💎 crystals, no default hotkeys.
  - v1.15.1: rebirth credit costs on the HUD (game coin + green chip).
  - v1.15.0: App looks (13, presets can switch them) + the toolbar overlay switchboard,
    clearer names, rows line up (v1.14.3 was folded into it).
  - v1.14.2: mission warnings play even with timer-expiry sounds off; volume sliders don't jump.
  - v1.14.1: ⚠ Mission warning (30 s / 1 min / 2 min + own times, own sound + volume).
  - v1.14.0: 📡 Spawn Alert (OCR of the game's spawn feed → big placeable alert).
  - v1.13.x: saved/shareable looks, per-overlay colours, own sounds; Kyber banner hourly :15.
  - v1.12.0: 15 border skins with real insignia, one-click theme presets, Preview Lab.
  - v1.11.x: resize + zoom, one-monitor drag, Appearance colours, snapping, compact timers.
- Older per-version status notes are in **CLAUDE_HISTORY.md**
  (local-only, like the other root .md docs). Read it only when a task touches that history.

## Lessons worth keeping (distilled from CLAUDE_HISTORY.md)
- **Screen-reading (OCR) changes: test through the replay harness, not just offline PNGs.**
  A real capture arrives as video with softened colour edges; a v1.14.0 method that read
  10/10 offline caught 4/6 through the video path. `dev/spawn-alert-harness.html` +
  test/spawn-parse.test.js are the checks. New real samples: a read-only PowerShell
  CopyFromScreen loop (computer-use can't see Fortnite by name).
- **Timers are pure clock maths** in timers.html's `next*()` functions: Stellar :05/:35,
  Mythic :55, Kyber :15 (all on :00 seconds), Mission every 35 min on :20 seconds from the
  fixed `MISSION_NAME_EPOCH_MS` (+ the player's "Sync mission timer"). A limited-time event
  schedule needs its own start/end window (the 2026-09-26 Kyber event had one; removed in
  v1.13.1). Expiry is detected by the countdown wrapping back up, never `remaining <= 0`.
- **Never hardcode level/slot/tier counts:** use `cycleRealLevelCount()`,
  `cycleRealSlotCount()` and `RARITY_ORDER` (hardcoded 35/105/"rank<=6" silently dropped
  Kyber once; test/pages.test.js guards the CSS side).
- **Kyber colour `#50c878`** is copied in tracker.html (`--r-kyber`, `.rarity-kyber`),
  timers.html (`--kyber`) and each droid overlay's own `--r-kyber`; change them together.
  (tracker.html's Droid Editor `--saber:#d0a0ff` is unrelated.)
- **droid-data.js slot order matters:** icons are keyed by cycle-level-slot position, not
  by name. If the user reports in-game data that contradicts the file, re-confirm the
  exact cycle AND level first (a one-cycle mix-up once looked exactly like a data bug).
- **Classic `<script src>` files load once per window launch.** A changed data file
  shows only after the app is relaunched.
- **Every hotkey needs a `ROWS` entry in hotkey-list.html**: main.js sizes that window
  by counting all bound hotkeys, so a missing row leaves a blank gap.
- **Renderers save settings through `window.overlayAPI.setSettings()`** (ipcRenderer
  isn't exposed). In the tracker, use setSettingsNow()/discardPendingSettings() around
  the 120 ms batch (a delayed batch once overwrote an immediate change).
- **Startup:** main.js creates the secondary windows only after the main window's
  `did-finish-load` (five windows each parse the ~3.3 MB icon data).
- **OCR offline re-test:** tesseract.js and sharp are dependencies already; add the language
  data with `npm install --no-save '@tesseract.js-data/eng'` (quoted: a bare `@` is a
  PowerShell parse error), `langPath: node_modules/@tesseract.js-data/eng/4.0.0_best_int`.
  rebirth-level-detect.js still uses the old threshold/whitelist (untouched until a
  badge misread is reported).
- **Crit Guide "Eff" going up and down between rows is NOT a bug** (each row is measured
  after the purchase above it). Don't re-flag it.
- **The web tracker is a hand-synced port, and it drifts silently.** On 2026-09-29 it
  still had month-old timers, no Kyber styling and a 105-slot cycle count, and nobody had
  noticed. When the app changes shared data, timers, looks (APP_LOOKS is copied into the
  web's `<head>`) or marks, check dev/web-tracker too (its notes list what's synced).
- **Theme-colour refactors: prove "no visible change" with a computed-style parity
  snapshot** (TEST_WITHOUT_ELECTRON.md), comparing as a multiset when new elements shift
  positions. It caught nothing wrong twice (tracker, web) and made the change safe to ship.
- **Test a page's real render path, not just its math:** the HUD chip looked fine in code
  but cut 2px off the cards (found by measuring scrollHeight vs clientHeight per block).
- **Electron off-screen capture doesn't run from this shell** (exits -1 before the script
  starts, even with --no-sandbox); for images to send the user, render a dev page in their
  Chrome and use screenshot/zoom with `save_to_disk`.

## Known follow-ups (spotted, deliberately not fixed yet)
- Spawn Alert: no "adjust box" UI yet (the feed box is a fixed screen fraction, measured at
  1920x1080); not in the Overlay Preview Lab
  (it only draws while unlocked or alerting). Legendary/Mythic and Gold/Stellar/Kyber lines
  were never seen in a capture: parser-tested only.
- `overlay:markDroid`/`overlay:markLevel` (main.js) compute `nk` without the player's
  `nameMerges`, so marking a renamed/merged droid from overlay.html or Rebirth Reqs
  writes the un-merged key. The v1.10.13 handlers avoid this by taking `nk` from the renderer.
- Rebirth Reqs overlay doesn't call `scroller.reveal()` on navigate, so its selection
  can move off-screen on a long list (Sneak Preview + Safe to Retire do).
- Sneak Preview's "✓ Have" counts global ownership, which mid-cycle includes droids
  the current cycle's completion wipe will erase. Marking them ("✓ Marked") is the safe path.
- Export/Import only covers ownedRank/nameMerges/displayOverrides, not
  `rebirth-heldMarks` / `rebirth-retired` (same gap on the web tracker since it gained marks).
- Rebirth credit costs are assumed the same in every cycle (only a Cycle 5 chart was seen).
- Web tracker: its "Up next" doesn't auto-advance the level when all 3 droids are logged
  (the app's HUD does); the player uses − / +. The browser's install offer only appears
  once the site qualifies and stops after installing, so 📲 Install may show menu steps.
- tracker.html's `window.overlayAPI.onStoreChanged(...)` at the end of init isn't
  guarded, so it throws in browser/localStorage mode (harmless, runs last).
- User idea, deferred: a manual "Sync Kyber timer" like the mission sync, if event
  timers drift again.
- Customization ideas not taken yet (offered 2026-09-27): a hotkey to cycle presets
  in-game (the user skipped it), and more skins/presets (try them in dev/ first).
- The 1-row timers window is at least 64px tall (Windows' frameless minimum), so
  there are 19px of transparent space under the banners. It only matters for snapping.
- "Add a sound file" opens a native file dialog, so only the user can test that step.
  Everything around it was browser- and CDP-verified.
- Keep this file short: after a release, replace "Current state" and move the finished
  version's detailed notes into CLAUDE_HISTORY.md (newest first) instead of stacking
  status blocks here.
