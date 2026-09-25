# Fuzzy's Droid Tracker — notes for Claude

Electron 32 app (tracker window + always-on-top overlays) for Droid Tycoon rebirth
tracking. README.md is the user-facing doc AND the changelog; read it first.

## Layout that matters
- `droid-data.js` — CYCLES (5 cycles x 35 levels x 3 [rarityCode, name]), RARITY_ORDER,
  DROID_RARITY_CLASS. Loaded as a classic `<script>` by every window.
- `requirements.js` — shared requirement logic (normKey, buildIndex, cycleCeilings,
  cycleLastNeededLevel, getUpcomingLevels, getDeclutterList, getSneakPreview...).
  Loaded by overlay.html, declutter.html, rebirth-requirements-overlay.html, sneak-preview.html.
- `tracker.html` — main window, ~2000 lines of inline script. See "In progress" below.
- `main.js` — Electron main: windows, JSON store (userData/droid-tycoon-store.json),
  settings (overlay-settings.json), global hotkeys, screen-capture handler.
- `src/` is a STALE snapshot, not live source. Ignore it.

## Rules
- Never change the persistence format without a migration. The store holds real progress.
- Classic scripts share one global lexical scope: a top-level `let`/`const` declared in
  two scripts on the same page is a SyntaxError that kills the whole page.
- `cycleCeilings` level = FIRST level a droid hits its max rarity. `cycleLastNeededLevel`
  = LAST level it's needed at any rarity. "Safe to sell/retire" must use the latter.
- Ownership (`ownedRank`, normKey -> rank 0..6) is global across cycles; requirements are
  per cycle. Completing a cycle clears ownership only for droids in that cycle's table.
- No git on this machine (not installed). GitHub repo: ibefuzzy/Fuzzy-Droid-Tracker,
  user uploads through the web UI. Build: `build-release.bat` -> `release\`.

## Tests
`npm test` runs Node's built-in test runner over `test/**/*.test.js`.
`test/helpers/load-shared.js` loads droid-data.js + requirements.js into an isolated vm
context the same way a browser window does. Top-level let/const must be read with `run('NAME')`.

## Smoke-testing a page without Electron
`node test/helpers/static-server.js 5178` serves the project root; open
http://localhost:5178/ (tracker.html) in the browser pane. Outside Electron the tracker
uses localStorage, so real progress in userData is never touched.

## Status (2026-09-24): v1.7.5 dedupe round DONE
- tracker.html now loads requirements.js; its private copies of normKey, canonicalName,
  buildIndex, cycleCeilings, cycleLastNeededLevel were deleted after being proven
  byte-identical across all 5 cycles, with and without renames.
- 33 tests pass (`npm test`). Browser smoke test: no console errors, 62 droids indexed,
  43 SELL tags in Cycle 1 (one per droid). v1.7.5 exe built; asar checked.
- README said "13 of the 223" droid/cycle pairs; the data has 224. Fixed.

## Status (2026-09-24): v1.7.6 DONE (built, not yet launched by the user)
- Crash-safe saves: persistence.js (tmp + fsync + rename, .bak of last good save,
  recovery from .bak when main is unreadable). main.js requires it. 10 tests.
- Settings panel rebuilt as a tabbed Star Wars "holo-console" (Keybinds / Layout /
  Filters / Timers, lightsaber tab marker). All original control ids kept;
  settings-tabs.js only does tabs, search and the bound count. The user asked that
  the art stay simple and the overlays stay see-through.
- sw-texture.css adds background-image-only art to overlay .card / .block surfaces;
  background-color (the see-through tint + HUD opacity) is untouched. Verified by
  computed style.
- 44 tests pass. Outside Electron, overlay-controls.js exits early, so to eyeball the
  settings panel in the browser pane, unhide #overlaySettingsPanel via JS.
- Browser-pane screenshots of the tracker show a blank band at the top; it's a
  capture artifact (elementFromPoint confirms the layout is fine).

Not done / next candidates:
- v1.7.6 confirmed running on the user's PC. Upload files were staged in
  Downloads\Fuzzy-Droid-Tracker-GitHub-upload-v1.7.6 (only files whose git blob SHA
  differs from GitHub main). The user uploads via github.com drag & drop.
- Gotcha: the app is single-instance. Launching a new exe while an old one runs
  just focuses the old window, so close the app before launching a new build.
- The user has a "tracker" shortcut pointing at src\tracker.html (stale snapshot).
- Git is not installed, so no local repo yet. .gitignore is ready.
- Still untested because they live inline in tracker.html: cycleCoveredCount,
  clearCycleMarks, setOwned, import validation. Moving pure parts into requirements.js
  would make them testable.
- Cleanup the user may want (ask before deleting): stale src/, duplicate exes in dist/,
  old installers in release/, the "droid-tycoon-overlay - Copy" folder in Downloads.
