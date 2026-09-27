# Fuzzy's Droid Tracker — notes for Claude

Electron 32 app (tracker window + always-on-top overlays) for Droid Tycoon rebirth
tracking. README.md is the user-facing doc AND the changelog — it has the full
version history; this file is architecture + rules + current state only, kept
short on purpose so a fresh session can read it in one pass.

## Layout that matters
- `droid-data.js` — CYCLES (5 cycles x 35 levels x 3 [rarityCode, name]),
  RARITY_ORDER, DROID_RARITY_CLASS. Loaded as a classic `<script>` by every window.
- `requirements.js` — the ONE copy of the shared requirement logic: normKey,
  buildIndex, cycleCeilings, cycleLastNeededLevel, getUpcomingLevels,
  getDeclutterList, getSneakPreview, the ownership helpers (cycleCoveredCount,
  cycleDroidKeys, removeCycleMarks, decideOwnedUpdate, isValidImportPayload), and
  BORDER_SKINS/BORDER_SKIN_ORDER/BORDER_EMBLEMS/borderIconSvg (the 15 border
  skins + emblem renderer) and THEME_PRESETS (v1.12.0 one-click themes).
  Loaded by tracker.html and every overlay (overlay.html, declutter.html,
  rebirth-requirements-overlay.html, sneak-preview.html, crit-guide-overlay.html).
- `crit-guide-overlay.html` (v1.10.0) — the 5th overlay, ⚡ Optimal Crit Guide: a
  STATIC reference panel (hardcoded purchase-order data for one specific build),
  unlike the other four — no ownership/cycle data, no fullReload(), no
  store:changed listener. Same card/scroll-viewport/border-badge pattern as the
  others otherwise.
- `tracker.html` — main window. The toolbar is a "Command Console": one
  `.console-row` per function group, each a two-column layout (fixed-width label +
  a separate `.console-row-buttons` strip) so a wrapped row indents under the
  button column instead of falling back under the label. Settings panel is a
  tabbed "holo-console" (Keybinds / Layout / Appearance / Filters / Timers / Droid Editor).
  Appearance was "Borders" until v1.11.1 and "Colors" before v1.10.0; its element ids are
  still `setTab-borders`/`setPane-borders`.
- `main.js` — Electron main: windows, JSON store (via persistence.js), settings
  (DEFAULT_SETTINGS + the generic `settings:set` IPC handler — any new setting key
  that isn't a hotkey or a position just works, no special-casing needed), global
  hotkeys, screen-capture handler.
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
- `overlay-theme.css` / `overlay-theme.js` (v1.11.0) — the 5 droid overlays' shared
  look variables (`--ov-*`), corner resize grip and size-driven zoom. `overlay-drag.js`
  (v1.11.0) — every overlay window's drag bar (see the no-`-webkit-app-region` Rule).
- `overlay-snap.js` (v1.11.1) — pure snap math (snapMove/snapResize) that main.js's
  `overlay:drag`/`overlay:resize` handlers run; unit-tested in test/overlay-snap.test.js.
  overlay-theme.js (v1.11.1) also applies the `theme*` colour settings and the mark-key
  target (`<html data-mark-list>` pages; `data-ov-own-alpha` on the HUD).
- `alert-sound.js` + `sounds/good-news-data.js` — `playAlert(choice, volume, readCustom)`
  (v1.13.0) plays every timer alert: tones, 'goodnews' (default since v1.11.1) and
  'custom:<id>' files, auto-levelled and capped at 8 s. Used by timers.html and the
  tracker's ▶ previews. The data file is base64 generated from
  `sounds/good-news-everyone.mp3` by `node build-sound-data.js` (the mp3 and the script
  stay out of the exe and the repo). It's a Futurama clip; the user chose to ship it.
- `game-toast.html` (v1.11.1) — the in-game notice card (main.js `showGameToast`, created
  on first use; click-through, never focused, top-centre of the capture screen). Only
  the tracker sends it (`toast:show`); rebirth-screen-read.js uses it while the tracker
  isn't focused. Not an OVERLAY_WINDOWS entry: it never moves.
- `build-kyber-card-icons.js` (v1.11.0, not in the exe) — regenerates card-icons-data.js's
  75 Kyber slots as transparent cut-outs from the local Droidex screenshots.
- `release/` keeps only the current build's exe (cleaned 2026-09-27: 16 old exes went to the
  Recycle Bin, not deleted). Published exes live on GitHub Releases.
- `_backup_v1.11.1_approved/`, `_backup_v1.12.0_approved/` (plus the older
  `_backup_before_v1.10.11/`) — source snapshots taken before big changes. They're excluded
  from the exe (`!_backup*/**`) and from searches (`.ignore`, which ripgrep reads).
- `dev/` — the Overlay Preview Lab (see Tools). Not in the exe or the repo.

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
  add the listener to EVERY window that reads it. (No test guards this yet — an
  earlier note claimed a `STORE_LISTENER_REQUIRED_PAGES` check existed; it never did.)
- Border skins (⚙ Overlay Settings → Appearance; BORDER_SKINS/BORDER_SKIN_ORDER in
  requirements.js) are 15 since v1.12.0: glow outline + corner brackets + emblem badge,
  always VECTOR (never bitmaps) so they fit every overlay's shape. Faction emblems are
  the real insignia as SVG paths in `BORDER_EMBLEMS` (Font Awesome Free CC BY 4.0 +
  MDI Apache 2.0, credited in README → Credits; user-approved 2026-09-27 after
  comparing them in the Preview Lab). hunter/tatooine/grogu stay hand-drawn in
  borderIconSvg(). **Skin keys never change** (saved settings hold them).
  `THEME_PRESETS` (same file) = one-click skin + theme* colours for all five
  overlays. Try new skins/presets in `dev/skin-candidates.js` via the lab first.
  Still scoped to the 5 overlay windows: the toolbar, settings panel, Rebirth Reqs
  side panel and droid list stay a fixed blue.
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
`npm test` runs Node's built-in test runner over `test/**/*.test.js` (89 tests;
test/skins.test.js checks every skin/preset, test/appearance.test.js the looks and
share codes).
`test/helpers/load-shared.js` loads droid-data.js + requirements.js into an isolated vm
context the same way a browser window does. Top-level let/const must be read with
`run('NAME')`; functions are exposed directly (e.g. `s.cycleCoveredCount(...)`) — see
the `api` object in that helper, and add a new shared function there when you add
one to requirements.js, or tests can't reach it.
`test/pages.test.js` guards: redeclaration (SyntaxError and silent shadowing), every
element id a script looks up exists exactly once, and — as of v1.9.1 — every call
site of a shared requirements.js function passes the right number of arguments.

## Tools (added v1.10.13–v1.11.1): what to reach for

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
the whole Borders tab — do nothing. To actually exercise Electron-only UI without
the real app, mock `window.overlayAPI` (getSettings/setSettings/onSettingsChanged
at minimum) BEFORE the page's scripts run, then `document.open(); document.write(html); document.close();`
to re-run them against the mock — see the v1.10.0 session's browser verification of
the Borders tab and the border-badge on every overlay for the exact pattern (each
overlay needs its own mock: e.g. crit-guide-overlay.html only needs
getSettings/onSettingsChanged/onHotkeyTriggered/setCritGuideLocked, no storeGet
plumbing, since it reads no droid/cycle data at all). The tracker itself still
works normally outside Electron via a localStorage fallback (real progress in
userData is never touched).

## Current status (2026-09-27): v1.13.1 hotfix — Kyber timer back to hourly at :15

The Kyber launch event ended, so the user asked for the normal schedule: every hour at
:15, seconds :00 like Stellar/Mythic (Mission is the only :20 timer). timers.html
`nextKyber()` is now a plain hourly :15:00 (the KYBER_EVENT_START/END window is gone;
a future event would need a new window). Also updated: tracker.html schedule readout +
sound-length note, README timer section + a v1.13.1 changelog entry, package.json.
Checked nextKyber at edge times (16:14:59 -> 16:15, 16:15:00.5 -> 17:15, 23:20 -> 00:15
next day); 89/89 tests. Files to push: timers.html, tracker.html, README.md,
package.json, CLAUDE.md. Built `release\Fuzzy's Droid Tracker 1.13.1.exe` (66.68 MB,
SHA256 70D49585372D7E9A5B780A5A80ACED52C16BD9E4995C802EA4AB3F878E396B0C); its asar's
timers.html/tracker.html match local byte-for-byte (package.json differs only because
electron-builder rewrites it; version 1.13.1). Awaiting the user's test, then push + release.

## Status (2026-09-27): v1.13.0 — PUBLISHED (tag on main ff64cdc; asset digest matches the local exe)

User-tested and approved. The user chose to ship the Futurama clip + insignia as-is.
Source is pushed to `main` (4 web-upload commits); all 44 repo files match local by blob
SHA. The release form (tag v1.13.0 from main) is open in the user's Chrome. They drag
in the exe (SHA256 FF6F983A…B7A5) and publish. It's the first public release since
v1.11.0, so it includes 1.11.1 + 1.12.0. The repo deliberately holds only runtime
source, tests and README/CLAUDE.md (not dev/, the other *.md docs, build tools or the mp3).

v1.12.0 was user-approved (snapshot `_backup_v1.12.0_approved/`; its exe stays in release\).
The user asked for ideas 1, 2, 4, 5 and 6 (not the preset-cycling hotkey), with the rule
"don't lose progress or hurt stability". Everything is settings-only and defaults to
today's look.
- **Looks** (requirements.js "APPEARANCE"): THEME_KEYS (+themeCompact, themeTextScale),
  DEFAULT_BORDERS (+timersBorder null), `overlayThemes` per-overlay overrides,
  sanitizeLook (every untrusted look goes through it), lookFromSettings/lookToSettings,
  presetToLook, looksEqual, effectiveTheme(settings, overlayName), and share codes
  encodeLookCode/decodeLookCode ("FDT1." + base64 JSON, UTF-8 safe, never throws).
  Each overlay page has `<html data-ov-name>`; overlay-theme.js applies its effective
  theme (`html.ov-compact`, `--ov-text-scale`, used by each page's .d-name/.d-owned).
- **Tracker** (overlay-controls.js): "Edit colors for" target (setTheme writes the
  global keys or overlayThemes[target]); saved looks = settings.customPresets
  [{name, look}] (save/⧉ share/✕/import); a Timers border-skin row with ⊘ none.
  **Batching rule:** setSettingsNow() folds in any batched edit and flushes, and
  applyLook/reset discard the batch. Otherwise a 120 ms-delayed save could land after
  an immediate one and undo it (found in browser testing, fixed).
- **Timers** load droid-data.js + requirements.js now: backdrop via
  `--t-backdrop-*`, skin via `body.skinned` + `#timersBadge`. Each event colour stays.
- **Sounds:** alert-sound.js `playAlert(choice, volume, readCustom)` does tones,
  goodnews and 'custom:<id>'. Any clip is auto-levelled (loud-window RMS -> 0.245;
  Good news comes out at the old x8), capped at 8 s with a fade, and measured on its
  first 8 s only. main.js `sound:add/remove/read` copies files into
  userData/custom-sounds (5 MB, 20 max, id-only paths). Stellar/Mythic/Kyber
  choices are null = Blueprints. timers.html falls back to goodnews if a file fails.
  The UI note recommends 1–5 s clips (user asked for guidance).
- `.ignore` makes ripgrep skip `_backup*/` and `release/` (it's excluded from the exe).
Verified: 89/89 tests (test/appearance.test.js covers hostile share codes); lab
(6 frames incl. timers; presets, compact, text size); tracker mock (per-overlay
edits, save/share/import, sounds add/pick/preview/remove, the race fixes).

## Status (2026-09-27): v1.12.0 — Phase 4 (insignia skins + theme presets), user-approved

package.json is 1.12.0; the approved 1.11.1 exe stays in `release\` and its source in
`_backup_v1.11.1_approved/`, so either can be released. Built after the user compared
the candidates in the new Overlay Preview Lab and said "do em all":
- Rebel/Empire/Jedi/Mando emblems -> real insignia (same keys and colours). Eight new
  skins: sith, firstorder, republic, oldrepublic, senate, tradefed, deathstar,
  jedicrest. Ten THEME_PRESETS plus "Default look", shown as a Presets grid at the top
  of the Appearance tab (overlay-controls.js; one setSettings call sets all five
  border keys + theme*; the active preset = the one exactly matching the settings).
- User follow-up ("we lost our grogu one"): Grogu's hand-drawn emblem was redrawn as
  Baby Yoda (ears, eyes, robe collar; still key 'grogu'), and a Grogu preset was
  added (11 presets + Default look). The Iconify cbi:grogu was rejected: CC BY-NC-SA,
  and mush at badge size.
- Swatch rows wrap to 2 rows (8+7). README gained a Credits section (Font Awesome
  CC BY 4.0 attribution, MDI Apache 2.0, a Lucasfilm trademark/unofficial note) and
  File map entries for the v1.11.x files.
- Verified: 80/80 tests; lab (15 skins, presets dress all 5 frames); tracker
  Appearance tab with mock (preset apply/active/tweak/default, swatch wrap).
- Before a public release: the user decides on the Futurama clip AND the Star Wars
  insignia (trademarks; artwork licence is fine).

## Status (2026-09-27): v1.11.1 — user-approved, saved, awaiting release

**User-tested and approved** (every feature below, incl. the in-game Read Rebirth Screen
flow): "this will definitely be in the next release." Snapshot of the approved source:
`_backup_v1.11.1_approved/` (root files + test/ + sounds/ + mission-icons/ + .claude/).
Final exe SHA256 A16F9B9D324EDAA12FBD2F67F601BE6BF67E1BBC46B9B06B2DB647B56DD1D28D,
66.66 MB. NOT pushed to GitHub yet. Still open before release: the mp3 copyright call,
and the push-source-first flow.
**Exe slimmed 94 → 67 MB:** package.json build.files now also excludes the 48 root
`DROID IMAGES*.png` source screenshots (27.5 MB), `_backup*/**`, root `*.md`, and the
build logs and old helpers. app.asar went 38.6 → 7.6 MB, with no runtime file removed
(diffed the asar listings). The portable exe unpacks all of it on every launch, so this
also speeds up startup. **Rule: any new non-runtime file in the project root needs a
build.files exclusion.**

Built unattended from the user's list (plan: `~/.claude/plans/wild-spinning-abelson.md`).
- **Appearance tab** (Phase 3, was Borders; ids `setTab-borders`/`setPane-borders` kept):
  `themeBackdrop/-Alpha`, `themeBox/-Alpha`, `themeHighlight` ('#rrggbb' | 'border' |
  null). null = today's look everywhere. Decisions taken: the HUD keeps its own `opacity`
  (so `themeBackdropAlpha` skips it); highlight defaults stay per overlay (HUD green, Reqs
  purple, the rest border) until the user picks one; one global theme, no per-overlay yet.
- **Mark-key switch:** `markTarget` ('rebirthReq' default, persisted) + `markTargetHotkey`
  (unbound). Replaced most-recently-shown routing (`markListOrder` is gone). Channel
  `markTarget:changed {target, contested}`; non-target lists hide their selection glow,
  and the target shows a ⌨ KEYS chip while 2+ lists are open.
- **Snapping:** drag snaps edges (12px) to visible overlays + work area; resize snaps
  edges and droid-overlay sizes. `overlaySnap`/`overlaySnapSize` checkboxes in Layout.
- **Compact timers:** banners sized to text, equal-width grid, `timersLayout`
  row/grid/column, `timersScale` 0.8–1.5 (transform). timers.html sends `timers:fit`
  and main.js sizes the window (top-left anchored); reset keeps the fitted size.
- **Sound:** 'goodnews' clip, the new default; `migrateSoundDefault()` moves an old
  default 'beep' once (`soundDefaultVersion`). Plays once. The user found it too quiet:
  the clip is speech at about -30 dB vs the tones' -12 dB at 35%. So alert-sound.js
  boosts ×8 into a compressor (-10 dB), scales by volume/0.35, then limits (-3 dB).
  Measured offline: -22.5/-11.9/-9.9 dB at 10/35/80% vs tones -23/-12.1/-4.9, with
  peaks ≤1.01. That's level with the tones up to the default and gentler above, as the
  user asked ("not too crazy loud"). The clip is decoded from base64 because Web Audio
  on a file:// `<audio>` may be treated as cross-origin and output silence.
  **Copyright:** it's a Futurama clip. Ask the user before pushing it to the public
  repo or attaching it to a public release exe.
- Also fixed: the Timers tab's stale schedule readout (Kyber TBD, mission "50 min") and
  the README's Galactic-era timer section.
- **Read Rebirth Screen from in-game** (user request after testing the above; still
  1.11.1): main.js's display-media handler reuses `settings.captureDisplayId` (saved on
  every picker choice) and shows the picker only when `forceScreenPicker` is set by
  `capture:changeScreen` (the 🖥 Change screen buttons). New unbound hotkeys
  `rebirthScreenApplyHotkey`/`rebirthScreenCancelHotkey` go to the tracker only. In
  rebirth-screen-read.js, `session` (bumped by closeAll) drops any read cancelled
  mid-flight, including while the capture is still starting. `applying` stops a double
  Apply. getDisplayMedia errors are toasts now, not alert(): a blocked alert stalled
  the hotkeys. Browser-verified with a fake "Rank 27" capture stream: OCR 96%,
  apply-once, cancel mid-start, change screen, key hints. Real-app verified over CDP
  (isolated profile, the user's 2 monitors): the picker appears once and the pick is
  saved; the next capture skips it; change screen brings it back; cancelling keeps the
  saved screen; the notice shows at 720,108 480x92 and hides on time.
  **Smoke-test rule:** stop test instances by their `--user-data-dir` in the command
  line (Win32_Process), never by exe path. The user may run the app from
  `release\win-unpacked` too.
Verified: 75/75 tests; browser (mock overlayAPI) for timers layouts/scale/fit, Safe to
Retire mark chip + theme vars + reset, the tracker's Appearance/Layout/Timers controls,
and mp3 decode. Also smoke-launched the built app with an isolated `--user-data-dir`
(+ `--remote-debugging-port`, scratch `cdp-eval.js`): no startup errors, the sound
migration ran, and the timers window really fits (row 559 wide, 2x2 283x84, 150% 838x68).
**Windows keeps a frameless window at least 64px tall**, so the 1-row timers window is
559x64 with the banners in the top 45px (transparent, click-through). Only effect: an
overlay snapped right under it sits 19px lower. NOT verified: real drag snapping, the
global switch hotkey, sound on expiry. Those need the user's test.

## Status (2026-09-27): v1.11.0 — overlay rehaul part 1 (resize + zoom), released

Built during development as "v1.10.14"; the user promoted it to **v1.11.0** for release
(user-tested: resize, zoom, Kyber icons, monitor-edge fix all confirmed working).
**Phase 3 is shelved for v1.11.1** — start there next session.

User goal: overlays that look nicer and are customizable. Agreed plan, in phases:
1. **Done:** shared theme variables. `overlay-theme.css` (linked BEFORE each page's
   `<style>`) defines `--ov-backdrop-rgb/-alpha`, `--ov-box-rgb/-alpha`,
   `--ov-highlight-rgb` (defaults to the border's `--sw-rgb`), `--ov-icon-size`.
   All 5 droid overlays use them instead of literals, with page overrides that keep
   the old look (HUD: alpha 0.55 from its `opacity` setting, 34px icons, green
   highlight, `--ov-backdrop-current-rgb`; Rebirth Reqs: purple highlight). Proven
   zero visual change by diffing computed styles of all 853 elements before/after.
2. **Done (user-confirmed in the real app):** corner-grip resize
   + size-driven zoom in `overlay-theme.js`. Grip shows while unlocked; main.js
   `overlay:resize` (ipcMain.on, start/move/end with screen-px deltas) setBounds +
   saves `size`/`declutterSize`/`rebirthReqSize`/`sneakSize`/`critGuideSize`;
   `overlayBounds()` restores them at launch; Reset position also clears size.
   Zoom = CSS `zoom` on `<html>` relative to the DEFAULT size (`overlay:baseSize`), so
   default = 1.0; capped where the 96px card art would upscale
   (`96 / ((icon - 4px frame) * devicePixelRatio)`), min 0.8. Lists zoom by width;
   the HUD (`data-ov-zoom="fit"`) by min(width, height). CSS zoom (not
   webContents.setZoomFactor, whose zoom is shared per-origin across every file://
   window) and verified: page stays inside the window, grid reflows, overlay-scroll
   math still correct.
   **Bug found during testing, NOT caused by this release (fixed, user-confirmed):**
   dragging an overlay showed a moving copy of it at the top-left of monitor 1. Cause: the
   user has two 1920x1080 @100% monitors, the second to the right, and while an overlay
   STRADDLES the edge Windows also draws its monitor-2 part onto monitor 1, exactly 1920px
   to the left (measured from their screenshots). It vanishes once the window is back on one
   monitor. First guess (the grip's filter/fixed + always-set zoom) was wrong; those were
   made plain/removed anyway. Second try clamped Windows' drag in 'will-move', but its drag
   loop still drew half-crossed frames (mirror came back once the mouse was fully on
   monitor 2). Final fix, now a Rule (see Rules): no `-webkit-app-region` anywhere; the app
   drags every overlay itself (`overlay-drag.js` -> `overlay:drag` -> `onOneDisplay()`).
   Simulated with main.js's own function on the user's layout: stops at the edge, hops
   whole, returns to the grab point, never straddles. User confirmed fixed on 2 monitors.
   **Kyber card icons rebuilt:** the 75 Kyber slots in card-icons-data.js were opaque crops
   still showing bits of the in-game "PREVIEW" banner, unlike every other variant (transparent
   gonk.tools portraits). `build-kyber-card-icons.js` (excluded from the exe) re-extracts them
   from droidex-card-screenshots/KYBER with extract-droid-cards.js's detector and cuts the droid
   out by comparing each Kyber card with the same droid's other plain-backdrop variants
   (DEFAULT/GOLD/BESKAR/GALACTIC/STELLAR; DIAMOND/RAINBOW have sparkle backdrops) plus a
   per-rarity-class backdrop; only the Kyber slots are rewritten. KX (black droid on a black
   card) is the weakest result.
3. **Done in v1.11.1 (see the status above):** Appearance tab in ⚙ Overlay
   Settings (the Borders tab grows into it) — backdrop / box / highlighter color pickers,
   each with opacity, ONE global theme (settings → the `--ov-*` variables via
   overlay-theme.js), per-overlay overrides later. "Backdrop" = the dark panel behind the
   droid boxes (user's word was "back pack color"). Open decisions: the HUD's existing
   `opacity` slider vs. the theme's backdrop alpha; whether the highlight default should
   become "match border" everywhere (today HUD green / Rebirth Reqs purple / others border).
4. Later: more border skins + full-theme presets (user lifted the 7-skin cap).
Timer banners: user wants to restyle them too, undecided how; not in scope yet.

## Known follow-ups (spotted, deliberately not fixed yet)
- `overlay:markDroid`/`overlay:markLevel` (main.js) compute `nk` without the player's
  `nameMerges`, so marking a renamed/merged droid from overlay.html or Rebirth Reqs
  writes the un-merged key. The v1.10.13 handlers avoid this by taking `nk` from the renderer.
- Rebirth Reqs overlay doesn't call `scroller.reveal()` on navigate, so its selection
  can move off-screen on a long list (Sneak Preview + Safe to Retire do).
- Sneak Preview's "✓ Have" counts global ownership, which mid-cycle includes droids
  the current cycle's completion wipe will erase. Marking them ("✓ Marked") is the safe path.
- Export/Import only covers ownedRank/nameMerges/displayOverrides, not
  `rebirth-heldMarks` / `rebirth-retired`.
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
- This file keeps growing with status blocks. When it gets unwieldy, fold the old
  per-version blocks into README's changelog and keep only the current state here.

## Current status (2026-09-27): v1.10.13 — mark droids from Sneak Preview + Safe to Retire (released)

(v1.10.12, published: Kyber event timer fired at :00:00 instead of :00:20 —
`nextKyber()` now uses `setSeconds(20, 0)`, matching the 7:30:20 window.)

Sneak Preview cards can be marked with the rebirthMark* keys or a click
(when unlocked). **Marks are HELD, never written to ownedRank**: new store
key `rebirth-heldMarks` = `{cycle -> {nk -> rank}}`, written only by main.js
`overlay:holdNextCycleMark` (renderer sends `nk`, since main has no name
merges loaded; decideOwnedUpdate toggles). Why held: ownership is one global
rank per droid, so a direct write would (a) count toward the CURRENT cycle
and (b) get erased by `removeCycleMarks()` at completion whenever the Mythic
is also in the current cycle's table (most are). `tracker.html`
`setActiveCycle(c)` → `applyHeldMarks(c)` folds `held[c]` in via
`mergeHeldMarks()` (requirements.js; raise-only) and deletes it. On "Next
Cycle" this runs after `clearCycleMarks()`, so held marks survive. "Clear
ALL" also empties `rebirth-heldMarks`.

**Safe to Retire marking:** same keys/click. Toggles `rebirth-retired` =
`{cycle -> {nk -> owned rank retired}}` via main.js `overlay:toggleRetired`;
**never touches ownedRank** (removing ownership would un-cover past levels
and the cycle could never hit full coverage). `isRetired(retiredRank,
ownedRank)` in requirements.js: retired iff retiredRank >= current owned
rank, so logging a higher colorway later = new copy, back on the list.
Retired cards render dimmed at the bottom; count tag = active only.
`clearCycleMarks()` drops `retired[cycle]`; "Clear ALL" empties it.
Setting `declutterShowRetired` (default true) hides them; flipped by the
`declutterRetired` hotkey (`declutterRetiredHotkey`, unbound) through the
generic `toggleDeclutterTier()` flag flip. While hidden, `#retiredTag` shows
"N retired hidden".

**Key routing** (the most-recently-shown rule below was replaced by `markTarget`
in v1.11.1): rebirthMark* hotkeys are no longer broadcast. main.js
`sendToMarkList()` sends them to ONE visible window among Rebirth Reqs /
Sneak Preview / Safe to Retire, most-recently-shown wins (`markListOrder`,
updated by `noteMarkListShown()` in each `setXVisible`; startup order puts
Rebirth Reqs on top). This also fixed a latent bug where a HIDDEN Rebirth
Reqs overlay still marked its selected droid. `overlay-scroll.js` gained
`reveal(el)` so the list follows the selection. Rebirth Reqs doesn't use it
yet, so its selection can still scroll out of view.

65/65 tests (mergeHeldMarks, "held mark survives the finished cycle's wipe"
on real data, isRetired). Browser-verified with mocked overlayAPI on both
overlays (nav/clamp, mark/unmark, click, reveal, cycle switch, upgrade
un-retires, ownedRank byte-identical after retiring) and tracker.html's
localStorage mode (resetCycleAndAdvance + dropdown apply).

## Current status (2026-09-27): v1.10.11 — Read Rebirth Screen reliability

User reported a live misread: the game showed "Rank 2", the reader said 4.
The same pipeline run on their screenshot (tesseract.js + sharp in Node, see
below) read 2 for every box around the label, so the live read almost
certainly came from a **stale saved box**: `start()` reuses the saved region
whenever the capture size matches and reads it with no preview, so a
shifted UI means reading the wrong spot blind. Changes in
`rebirth-screen-read.js` + the confirm dialog in `tracker.html`:
- The confirm dialog now shows the exact processed image that was read
  (`#rsReadPreview`) plus the raw text and confidence (`#rsReadText`),
  amber + "not sure" under 70% confidence. The user can see a wrong box and
  hit "Box was wrong — redraw".
- Threshold is `min(r,g,b) > 170` (white text only), drawn black-on-white;
  the old brightness>150 kept the green glow and made white-on-black.
- No digit whitelist (it coerced "Rank" into digits); `parseRank()` takes
  `Rank N`, else the LAST 1-2 digit number.
Repro results on the screenshot: old pipeline returned nothing for a box
that includes the REBIRTH logo; new one read "Rank 2" at 94-95% for every
box tried. **To re-test OCR offline:** `npm install --no-save tesseract.js@5
sharp @tesseract.js-data/eng` (the jsdelivr CDN is blocked in cloud
sessions; the npm package is not) and pass
`langPath: node_modules/@tesseract.js-data/eng/4.0.0_best_int` to
`createWorker`. `rebirth-level-detect.js` (badge watcher) still uses the old
threshold/whitelist, left alone until a badge misread is reported.

## Current status (2026-09-27): v1.10.10 — fixes the v1.10.9 upload missed

**GitHub `main` is now the source of truth** (the user published v1.10.9 from
their real local build, including v1.10.8's `keybindsLock`). This branch was
re-based onto it (merge commit whose tree == main; old cloud-only history
tagged `cloud-pre-v1.10.10`). Always diff against `origin/main` — not this
branch's older history — before assuming anything is missing.

v1.10.10 adds what the manual v1.10.9 upload left out: the 75 Kyber
(level 36-40) portraits in `icons-data.js` (the 525 published ones verified
byte-identical), double-click guards on both OCR calibration Confirm
buttons, `renderLegend()` using `RARITY_ORDER` (Kyber was missing from the
legend), hotkey-list rows for mark/navigate + `keybindsLockHotkey` (main.js
sizes that window by counting ALL bound hotkeys, so any hotkey without a
`ROWS` entry leaves a blank gap — add a row whenever you add a hotkey), and
the 40-level test files. `package.json` is CRLF with PowerShell-style
double-space formatting — edit the version in place, don't reformat.

**False alarms from this pass, so they aren't re-reported:** `requirements.js`
on main was already complete; main.js's single-instance lock is already
gated (`if(singleInstanceLock){ app.whenReady()... }`, just named
differently); the timer sound fix is present (as `soundKey`, different from
the cloud version's `settingsPrefix` — both correct).

**`card-icons-data.js` is not in the repo.** Five pages (tracker.html +
overlay/declutter/rebirth-req/sneak) load it as `CARD_ICONS`, falling back
to `ICONS`. It's a generated file (see `build-card-icons.js`, excluded from
the build list) that lives only in the user's local folder — the exe
includes it (build `files` is `**/*`), so players are fine, but source
builds from GitHub silently fall back. `test/pages.test.js` now has
"every local `<script src>` a page loads exists" — it fails in any checkout
without that file, and passes locally. Upload the file (if under the 10MB
`file_upload` cap) to make the repo complete.

## Current status (2026-09-26): real Kyber color confirmed (emerald, `#50c878`)

The user sent an in-game screenshot of Kyber-rank droid cards: a vivid,
shimmering emerald green (crystal-facet gradient, matching the same
dark-to-bright-to-near-white-highlight-to-dark shimmer pattern already used
for Gold/Diamond/Stellar). Every `--r-kyber`/`--kyber` CSS variable across
the project is now `#50c878` (was placeholder `#d0a0ff`, briefly `#43e35f`
before the user clarified they wanted an emerald tone specifically, not a
flatter vivid green):
- `tracker.html` — `--r-kyber` var, `.rarity-kyber` gradient (now
  `linear-gradient(155deg,#0b3d24 0%,#1fae65 35%,#eafff2 50%,#50c878 65%,#0a3320 100%)`),
  and the Timers tab's "Schedule readout" dot + text (also updated the text
  itself, which still said "[Schedule TBD — coming with game update]" even
  though the schedule was confirmed the day before — see the block below).
- `timers.html` — `--kyber` var (drives the Kyber banner's `--accent-color`).
- `overlay.html`, `rebirth-requirements-overlay.html`, `sneak-preview.html`,
  `declutter.html` — each carries its own `--r-kyber` copy (no shared CSS
  file across overlays), all updated to match.
- One `#d0a0ff` reference remains, at `tracker.html`'s Droid Editor settings
  tab (`--saber:#d0a0ff` on `#setTab-droideditor`) — that's an unrelated tab
  accent color that happened to reuse the same old hex; it is NOT a Kyber
  reference and was deliberately left alone.

61/61 tests still passing (color values aren't covered by
`cycleRealLevelCount`-style logic tests, only the CSS-coverage-per-rarity-code
test from the prior sweep, which just checks the selectors exist — it passed
before and after). No more placeholder/TBD Kyber color language should
remain anywhere in the project as of this commit.

## Current status (2026-09-27): droid-data.js/icons-data.js replaced with the user's real local files

**The whole "port real level 36-40 data from the sibling web-tracker repo"
effort described in the block below this one was based on a wrong
assumption and has been superseded.** Sequence of what actually happened,
for the next session's sake:

1. Cloud session (no access to the user's machine) found this repo's
   `droid-data.js` still had "?" placeholders for levels 36-40 and ported
   real Kyber data in from `ibefuzzy/ibefuzzy.github.io`, which already had
   it entered.
2. User reported hotkey-based mark/navigate hotkeys "have worked for a
   while" — contradicting the cloud session's find that they're wired to
   nothing. This surfaced that **the user's actual local build is v1.10.8**,
   three versions ahead of what was on GitHub (v1.10.5) — the whole
   `main.js` keybinds-lock feature, and God knows what else, existed locally
   and had never been pushed.
3. A separate Claude Desktop session reconciled `main.js`/`timers.html`/
   `tracker.html`/`requirements.js` against the user's real 1.10.8 and sent
   them back — but did NOT touch `droid-data.js`/`icons-data.js`, so those
   two stayed exactly as the user's real local copies already were.
4. Diffing those real local files against what the cloud session had ported
   found **306 cell-level differences** in `droid-data.js` — almost all just
   left-to-right SLOT-ORDER differences within a level (same 3 droids,
   different position), not different droids. This means the GitHub copy of
   `droid-data.js` had diverged from the user's real, actively-maintained
   local copy at some point well before this session, in ways having
   nothing to do with the level-40 work. Slot order matters for icon-key
   lookups and any OCR screen-position matching, so this was a real bug,
   not cosmetic.
5. One near-miss: the user initially said cycle 5 level 36 was
   "correct in the app" as BDX Explorer/2BB/A-LT — which matched neither
   their own real local file (which has Roll-R/Hov-R/Mouse there) nor the
   ported web-tracker data at that exact row. Turned out they'd checked
   Cycle 1 (which genuinely is BDX Explorer/2BB/A-LT at level 36), not
   Cycle 5. **Lesson: when a user reports live in-game data that contradicts
   a file you're looking at, get the exact cycle/level re-confirmed before
   editing anything — a one-cycle mix-up looks exactly like a real data bug
   from the outside.**
6. The user's real local `icons-data.js` turned out to still be the
   original 525-key file (no Kyber icons at all) — confirmed both by
   parsing it (`Object.keys(ICONS).length === 525`) and by the user
   checking its on-disk file size in Windows Explorer
   (3,335,896 bytes, matching exactly). The user initially pushed back that
   their live app "has icons though I'm using it now" — resolved by an
   important Electron-specific fact: **a classic `<script src>` file is read
   once at renderer launch and kept in memory for the life of that window;
   it does not hot-reload from disk.** The user had launched the app before
   this session touched anything, so what's currently on screen reflects
   whatever `icons-data.js` looked like at THAT launch, not necessarily
   what's on disk right now. Relaunching (not yet confirmed as of this
   writing) is the real test.

**Fix applied:** `droid-data.js` was replaced wholesale with the user's real
local file (correct slot ordering, ground truth) rather than patched
cell-by-cell. `icons-data.js` was rebuilt from the user's real local
525-key file plus the 75 missing Kyber (36-40) icons, each one reusing that
same droid's existing portrait from its own 1-35 appearance elsewhere in
`droid-data.js` (Kyber reuses the same 62-droid pool at a new top rarity, so
every needed name already has an icon somewhere) — NOT pulled from the web
tracker, which uses different slot ordering for the same underlying data
and would have reintroduced the exact mismatch this fix corrects. Verified:
600/600 keys, every value decodes as valid WEBP, 61/61 tests still pass
unchanged (slot order doesn't affect any ceiling/last-needed/pairs
computation, only which physical position a name+icon sit in).

**Confirmed by the user (2026-09-26):** both files work after relaunch —
levels 36-40 show real droid portraits with correct slot order. No further
action needed on droid-data.js/icons-data.js from this effort.

**Also still outstanding from the reconciliation:** `overlay.html`,
`rebirth-requirements-overlay.html`, and `preload.js` were never sent by
either the desktop session or the user, so this repo's copies of those
three are still unconfirmed against the user's real v1.10.8 build. The
Up/Down mark-navigation bug the user originally reported ("Left and right
appear to work... up and down isn't working") turned out to be transient —
the user later confirmed (2026-09-26) navigation is working now, with no
code change made from this session. So: no known bug remains, but if
mark/navigate issues resurface, still get the real files first rather than
assuming this repo's copies match — the sync assumption already failed once
this session (see items 4-6 above).

## Current status (2026-09-27): full-project bug sweep

After the level-40/Kyber data went in (see block below), ran a full-scope
bug review across every file — 5 parallel audits (main.js; preload.js +
overlay-controls.js + settings-tabs.js; the two OCR files; tracker.html; the
7 overlay HTML pages), each independently verified before acting. Also live
gameplay caught a real data error: cycle 5 level 36 had the wrong 3 droids
entirely (`Roll-R`/`Hov-R`/`Mouse`, a Default-class droid where every other
cycle has 3 Rare-class droids at that level) — confirmed in-game as
`BDX Explorer`/`2BB`/`A-LT` (same as cycle 1's level 36), fixed in both
droid-data.js and icons-data.js (icons are keyed by cycle-level-slot
position, not droid name, so the icon needed swapping too, not just the name).

**Fixed:**
- Kyber had zero color/CSS anywhere — no `--r-kyber`, no `.rarity-kyber`,
  none of `.pip.filled.Y`/`.droid-cell.Y`/`.rebirth-tier-label.Y`/`.rb-name.Y`
  in tracker.html; `DOT_COLOR` maps in overlay.html/rebirth-requirements-
  overlay.html/sneak-preview.html had no `Y` (fell back to Base gray);
  declutter.html's hand-written ternary fell through to Stellar orange for
  Kyber too. All fixed with a placeholder `--r-kyber` (same value as
  timers.html's `--kyber` — **update both together** once the real color is
  confirmed).
- tracker.html's Rebirth Reqs panel looped `rank<=6`, silently dropping every
  Kyber-ceiling droid (~15/cycle) from the panel. `renderLegend()`'s tier
  order was hardcoded too. Both now derive from `RARITY_ORDER` directly —
  added a permanent test (`test/pages.test.js`) checking every rarity code
  has full tracker.html CSS coverage and that neither is hardcoded again, so
  the next tier added above Kyber can't repeat this silently.
- hotkey-list.html was missing all 11 v1.10.3 "mark"/"navigate" hotkey rows
  (present in DEFAULT_SETTINGS, counted by main.js's window-sizing, but
  never rendered — a permanent blank gap in the window). Added them.
- main.js's single-instance lock didn't actually gate `app.whenReady()` —
  `app.quit()` only requests a quit, doesn't synchronously abort the module,
  so a second instance could still race the first to load/write the store.
  Now explicitly gated on the captured lock result.
- Tesseract worker race in both OCR files' calibration Confirm buttons — no
  busy-guard meant a double-click could orphan a worker and, in
  rebirth-screen-read.js, race two calls over the same shared `video`
  variable. Added the same busy-flag pattern already used for the "start"
  buttons in both files. Also fixed both files' stale
  `CYCLES[cycle].length` → `cycleRealLevelCount()` (harmless today, was a
  landmine for the next placeholder batch).
- rebirth-requirements-overlay.html's pre-JS CSS fallback (`--accent`,
  `--sw-rgb`) was a stale v1.9.0 purple; fixed to match its actual default
  border skin (`mando`, tan).

61/61 tests passing (was 60/60; added the CSS-coverage guard above).

**Not fixed — flagged for a scoping decision, not a quick patch:** the
entire v1.10.3 hotkey-based "mark selected droid"/"navigate" feature is dead
end-to-end. Hotkeys broadcast correctly from main.js, and main.js even has
real backing IPC handlers (`overlay:markDroid`/`overlay:markLevel`,
correctly implemented) — but `preload.js` never exposes them on
`window.overlayAPI`, and no overlay's `onHotkeyTriggered` handler checks for
any of the 11 mark/navigate action names. Confirmed independently by two
separate audits. Implementing it properly needs a real "currently selected
droid/cell" concept in at least two overlay UIs (overlay.html and
rebirth-requirements-overlay.html), not just bridging the missing IPC calls
— treat as a real feature-scope conversation with the user before touching
it, not something to guess-implement.

Crit Guide "Eff" column non-monotonic at rows 2-3 and 35-36: **closed, not a
bug** (user dropped it 2026-09-27). Crit chance and crit damage raise each
other's value, and each row's Eff is measured after the purchase above it,
so a later row can legitimately score higher. Don't re-flag it.

## Current status (2026-09-27): real level 36-40 / Kyber data ported in — patch is live
The 2026-09-26 game patch shipped. The sibling web-tracker repo
(`ibefuzzy/ibefuzzy.github.io`) already had real level 36-40 droid names +
icons entered (via whatever channel updates that repo), so rather than wait
on this repo's own Droid Editor tab, that real data was ported straight
across into `droid-data.js` (all 5 cycles' placeholder `"?"` rows replaced
with real `["Y", name]` Kyber entries) and `icons-data.js` (75 new
cycle-level-slot keys, verified byte-for-byte as valid WEBP before writing).
Every ported droid name already existed in the 62-droid roster (Kyber reuses
the same pool at a new top rarity) — no DROID_RARITY_CLASS gaps. All the
`cycleRealLevelCount`/`cycleRealSlotCount` machinery from the prior status
entry below picked this up automatically: every cycle now reports 40 real
levels with zero code changes needed there, exactly as designed.

This shifted several computed values that were pinned in tests (Kyber, being
the new top rarity, is often now what sets a droid's *ceiling*, which can
push its *last-needed level* later than before — e.g. cycle 1 Proto Roller's
ceiling moved from Galactic-level-28 to Kyber-level-39, and it no longer
reappears afterward in that cycle). Total droid/cycle pairs: 224 -> 238;
reappearing-after-ceiling pairs: 13 -> 8. Tests updated to match, plus two
of the placeholder-specific regression tests were converted to use synthetic
placeholder data instead of relying on the live cycles having any (since
they no longer do) — see test/requirements.test.js. Still 60/60 passing.

README.md's "35 levels"/"105 slots" model description was updated to 40/120
to match.

**Kyber timer schedule confirmed 2026-09-26** (user reported it live):
a 24-hour launch event runs the Kyber blueprint every 5 minutes instead of
hourly, window Saturday 2026-09-26 4:00pm through Sunday 2026-09-27 4:00pm
(the app's own local clock, same convention as MISSION_NAME_EPOCH_MS — no
explicit timezone conversion). `nextKyber()` in timers.html now switches
automatically between the two schedules based on that fixed window — no
settings toggle needed, and nothing to remember to flip back after the
event ends. The Kyber banner's forced `display:none` was removed too, so it
now shows/hides the same way every other banner does. **Still pending:**
the `--kyber` CSS color is still a placeholder (`#d0a0ff`) — only the
schedule was confirmed, not the color. If a *future* Kyber-rate event
happens, it needs its own `KYBER_EVENT_START_MS`/`_END_MS` window added the
same way; this one was deliberately written as a one-off, not a recurring
rule.

**Found while checking Kyber had a sound option (it should have): a
pre-existing sound bug affecting Stellar and Mythic too, not just Kyber.**
`playTimerSound(timerType, settings)` in timers.html looked up
`settings[timerType + 'SoundChoice']` — i.e. literally
`stellarSoundChoice`/`mythicSoundChoice`/`kyberSoundChoice` — but
DEFAULT_SETTINGS only ever defined `missionSoundChoice` and
`blueprintSoundChoice` (Settings → Timers only has Mission and Blueprint
sound groups; Stellar/Mythic/Kyber are meant to share the one "Blueprint"
setting). So the lookup silently failed and **timer-expiry sound has never
worked for Stellar or Mythic**, only Mission — since v1.10.2. Fixed by
mapping any non-mission timerType to the `blueprint` settings prefix. The
save side (overlay-controls.js) was always correct; only this read side was
wrong. Worth a mention in the next release notes since it's a real,
user-visible fix, not just internal cleanup.
A full bug-check/declutter pass (prompted by "the app is a little slow to open") found
and fixed several real issues, all now covered by tests (60 passing, up from 57):

- **Startup speed**: `main.js` created all 8 windows (mainWindow + 7 hidden overlays)
  synchronously in `app.whenReady()`. 5 of those 8 each independently load and parse
  their own ~3.3MB `icons-data.js` (overlay/declutter/rebirth-req/sneak, same as
  tracker.html) — all 5 parses were competing for CPU with the main window's own
  startup at the same instant. Fixed by deferring the 7 secondary windows (via
  `createSecondaryWindows()`) until the main window's `did-finish-load` fires, so
  tracker.html gets the CPU to itself first. If it's still slow after this, profile
  before assuming it's fixed — this was the most likely cause, not a confirmed fix.
- **Level-40 placeholder gap (the actual v1.10.5 "36-40 filtered out of all indexing"
  claim below was only half true)**: `buildIndex`/`cycleCeilings`/`cycleLastNeededLevel`
  did skip placeholder (`code === "?"`) levels, but `getLevelRequirements` and
  `getUpcomingLevels` did not — they bounded themselves on `CYCLES[cycle].length`
  (40), so once a player's rebirth level reached 32+ (count=4 walks into level 36),
  the "Upcoming RB Req's" HUD would show literal `"????"` placeholder rows instead of
  hiding unavailable levels. Given today is the 2026-09-26 patch date this would have
  hit real players very soon. Fixed with a new `cycleRealLevelCount(cycle)` helper
  (requirements.js) that both functions now use instead of raw `.length` — it
  auto-extends to 40 the moment real data replaces the placeholders, no further code
  change needed then.
- **Same gap in `cycleCoveredCount`**: didn't skip placeholder droids either. Today it
  accidentally still worked (`normKey("????")` → `""`, which nothing ever owns), but
  `tracker.html` also hardcoded the "cycle complete" threshold at `105` (35×3) in two
  places (the `x / 105 covered` display and the `!== 105` completion check) — once
  real 36-40 data lands, covered would be able to reach 105 out of the new true total
  of 120, firing the cycle-complete prompt 15 slots early. Fixed via a new
  `cycleRealSlotCount(cycle)` helper (`cycleRealLevelCount(cycle) * 3`); both
  tracker.html sites now use it instead of the literal `105`.
- **Two more hardcoded-35 loops in tracker.html** (`renderByLevel`'s row loop,
  `buildReferenceThumbs`' OCR reference-icon builder) would have silently kept
  ignoring levels 36-40 even after real data was entered, until someone noticed and
  manually bumped them. Both now use `cycleRealLevelCount()` too. (Left `migrate()`'s
  own hardcoded `l<=35` alone — that's iterating the old v1 storage format, which
  never had levels 36-40 keys to migrate; not a bug.)
- **Test infra**: `test/helpers/load-shared.js`'s `api` object was missing 5 functions
  that already existed in requirements.js (`cycleCoveredCount`, `cycleDroidKeys`,
  `removeCycleMarks`, `decideOwnedUpdate`, `isValidImportPayload`) — exactly the
  "tests can't reach it" failure mode this file's own Rules section warns about, and
  it had already happened. All 5 are wired up now. Also added a permanent guard
  (`test/pages.test.js`) checking `icons-data.js` declares exactly one top-level
  `const`, named `ICONS` — ports the lesson from the sibling web-tracker repo's
  `CARD_ICONS` incident (2026-09-26, see that repo's
  `memory/encoding_corruption_playbook.md`): a regeneration script wrote new icon
  data into a second, never-loaded object instead of the real one, and it shipped
  silently because two top-level consts in one file isn't a syntax error. This
  repo's `icons-data.js` was checked and is currently clean (one `ICONS`, 525/525
  keys) — the new test just keeps it that way.

## Current status (2026-09-25): v1.10.5 built, pending release
v1.10.5 (local build, not yet pushed/released) — level expansion 35→40 + Kyber variant
prep + timer schedule changes ahead of the 2026-09-26 game patch:
- Expanded CYCLES to 40 levels/cycle (36-40 are blank `"?"` placeholders, filtered
  out of all indexing/requirement logic until real droid data is entered).
- Added Kyber rarity tier (`Y`, above Stellar) with a placeholder color, pending
  the in-game color once the patch is live.
- Removed the Galactic timer entirely (game is retiring it); Stellar timer changed
  from hourly `:00` to twice-hourly `:05`/`:35`; added a Kyber timer (placeholder
  schedule, hidden banner) ready for the real schedule.
- Added a Droid Editor tab (tracker.html) for manual/CSV droid entry once
  screenshots of levels 36-40 are available, with a code-export button that
  generates the droid-data.js assignment to paste in.
- See `memory/project_v1104_level_expansion.md` for full technical detail (file
  written before the version-numbering issue below was caught — filenames/content
  say "1104" but the shipped version is 1.10.5).

**Versioning lesson (2026-09-25):** this whole block of work was built and left
labeled "1.10.4" locally, but v1.10.4 had *already been pushed and released on
GitHub* (as the overlay-marking-sync fix, see below) before this work started in
the same session. Building on top of an already-shipped version number without
bumping it produces a same-numbered local exe that doesn't match what's public —
confirmed by diffing local timers.html against `raw.githubusercontent.com/.../main/timers.html`
(GitHub's copy still had `--galactic` and no `--kyber`, proving the mismatch).
**Rule: the moment work starts that will ship as its own release, bump
`package.json`'s version FIRST**, before writing feature code — don't wait until
build time to notice the number's already taken.

v1.10.4 (shipped, on GitHub) fixed overlay marking sync (tracker.html now listens
for store changes from overlays).

v1.10.3 added hotkey-based marking to overlays (arrow keys + customizable mark key).

v1.10.2 added sound notifications with two critical bug fixes from the initial implementation:

- **🔔 Sound notifications on timer expiry.** Web Audio API sine-wave generator (beep 800Hz, boop 400Hz, chime 900Hz). Master volume slider 0.1–0.8 (displayed as 10–80%). Per-timer overrides (mission + blueprint) when enabled. Plays 3x with 0.5s delay. Default OFF (opt-in in Settings → Timers tab).

- **🔧 Fixed: IPC settings handler mismatch.** Sound controls were calling `ipcRenderer.invoke('settings:set', ...)` directly, but `ipcRenderer` is NOT exposed to renderer via contextBridge—only `window.overlayAPI` is. Changed all 8 sound handlers to use `window.overlayAPI.setSettings()`. This was why sound settings were silently failing to save and resetting when timer sync fired.

- **🔧 Fixed: Timer expiry detection logic.** All next___() functions return the *next* future occurrence, so checking `remaining <= 0` is mathematically impossible to hit (next render() tick recomputes to the next full period). Replaced with wrap-detection: compare previous tick's remaining vs current tick's; if previous was small (< 1.5s) and current jumped back up, that's the expiry moment (timers.html lines 354–381, render() calls 400–413).

57 tests passing. v1.10.2 through v1.10.4 exes are built, tested, and released on
GitHub with SHA256 checksummed in release notes. v1.10.5 source is built and
tested locally, pending push + release (see status block above).

A project-level `.claude/settings.json` exists (added 2026-09-25) with a read-only permission allowlist. Does NOT cover writes/deletes/builds/code execution (those still prompt every time, deliberately).

**Workflow note for next session:** See `feedback_model_switching_strategy.md` in memory/ for when to escalate Haiku debugging to Sonnet (multi-window IPC breakdowns, impossible conditions, constraint reasoning).
