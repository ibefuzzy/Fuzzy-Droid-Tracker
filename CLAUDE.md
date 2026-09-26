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
  (v1.10.0) BORDER_SKINS/BORDER_SKIN_ORDER/borderIconSvg (the per-overlay border
  picker's 7 skins + emblem-icon renderer — replaces the old flat SABER_COLORS).
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
  tabbed "holo-console" (Keybinds / Layout / Borders / Filters / Timers — Borders
  was "Colors" pre-v1.10.0).
- `main.js` — Electron main: windows, JSON store (via persistence.js), settings
  (DEFAULT_SETTINGS + the generic `settings:set` IPC handler — any new setting key
  that isn't a hotkey or a position just works, no special-casing needed), global
  hotkeys, screen-capture handler.
- `persistence.js` — crash-safe `loadJson`/`saveJsonNow` (tmp file + fsync +
  rename, `.bak` of the last good save, recovery from `.bak` if the main file is
  ever unreadable).
- `overlay-controls.js` — tracker-side wiring for every Electron-only control:
  hotkey capture, tier filter buttons, position/lock, and the Borders tab's swatch
  buttons (built from `BORDER_SKIN_ORDER`, not hand-written per skin).
- `settings-tabs.js` — pure presentation: tab switching, keybind search, bound
  count. Every control keeps the id `overlay-controls.js` wires it by.
- `sw-texture.css` — holo-console corner-bracket/scanline art for the 5 overlays.
  Reads `rgba(var(--sw-rgb, 150,215,255), a)` — each overlay sets its own
  `--sw-rgb`/`--accent` (from BORDER_SKINS, per the border skin picked in
  ⚙ Overlay Settings → Borders), falling back to blue if unset. Each overlay also
  has its own `.border-badge` div (top-center, straddling the panel's top edge)
  showing that skin's emblem via `borderIconSvg()` — see any overlay's
  `applySettings()` for the pattern.
- `rebirth-screen-read.js` / `rebirth-level-detect.js` — the two OCR flows (bulk
  catch-up from the in-game Rebirth screen; continuous badge watching). Depend on
  tracker.html's globals (`ownedRank`, `activeCycle`, `markRowObtained`,
  `cycleCoveredCount`, etc.) — see the Rules section below, this is exactly where
  the v1.9.0 regression happened.
- `release/` keeps only the current build's exe. No `src/` snapshot anymore.

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
  add the listener to EVERY window that reads it. test/pages.test.js guards this via
  `STORE_LISTENER_REQUIRED_PAGES`.
- The border picker (⚙ Overlay Settings → Borders, v1.10.0) is a curated
  7-skin set (BORDER_SKINS in requirements.js: rebel/empire/jedi/mando/hunter/
  tatooine/grogu), each hand-drawn CSS/SVG (glow outline + corner brackets +
  emblem badge) rather than sourced art — deliberately, so it scales to every
  overlay's own shape (wide HUD vs. narrow tall lists) with no distortion. This
  replaced the old flat SABER_COLORS 6-swatch picker at the user's request
  (they tried sourcing real image-frame assets first, decided this app's own
  vector look was better). Still scoped to the 5 overlay windows only — the
  toolbar, settings panel, Rebirth Reqs side panel and droid list stay a fixed
  blue, not user-borderable. Don't expand past 7 or add sourced-image skins
  without the user raising it again.
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
- Build: `npm run dist` (with `$env:CSC_IDENTITY_AUTO_DISCOVERY='false'` set first)
  -> `release\Fuzzy's Droid Tracker X.Y.Z.exe`. The app is single-instance —
  launching a new exe while an old one runs just focuses the old window, so the
  user closes the running app before launching a new build.

## Tests
`npm test` runs Node's built-in test runner over `test/**/*.test.js` (60 tests).
`test/helpers/load-shared.js` loads droid-data.js + requirements.js into an isolated vm
context the same way a browser window does. Top-level let/const must be read with
`run('NAME')`; functions are exposed directly (e.g. `s.cycleCoveredCount(...)`) — see
the `api` object in that helper, and add a new shared function there when you add
one to requirements.js, or tests can't reach it.
`test/pages.test.js` guards: redeclaration (SyntaxError and silent shadowing), every
element id a script looks up exists exactly once, and — as of v1.9.1 — every call
site of a shared requirements.js function passes the right number of arguments.

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
either the desktop session or the user — these are presumably where the
actually-working Left/Right mark-navigation code lives (Up/Down don't work
in "Upcoming RB Req's" per the user; Rebirth Requirements untested). Do not
assume these three match what's in this repo — get the real files before
touching anything mark/navigate-related again, same lesson as items 4-6
above: the sync assumption failed once already this session.

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

Also flagged, not touched: crit-guide-overlay.html's hardcoded purchase-order
"Eff" column isn't strictly monotonic at two points (rows 2-3, 35-36) —
possibly a data slip in the reference table, needs the user's judgment on
the actual correct order rather than a guess at hardcoded strategy content.

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
