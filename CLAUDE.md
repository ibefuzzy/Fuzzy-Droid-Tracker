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
`npm test` runs Node's built-in test runner over `test/**/*.test.js` (56 tests).
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
