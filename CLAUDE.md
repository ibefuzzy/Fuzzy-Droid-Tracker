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

## Current status (2026-09-25): v1.9.1 built + pushed, release page open, NOT YET PUBLISHED
Everything through v1.9.1 is done: crash-safe saves, the tabbed holo-console
settings panel, per-overlay typography and fade-in, the two-column Command Console
toolbar, holo borders on the Rebirth Reqs panel and droid list, the untested
ownership logic moved into requirements.js and tested, and the per-overlay
saber-color picker (Colors tab) — all shipped, 54 tests passing, verified live in
the browser, not just unit tests. Source is on GitHub main (commit be8c1d3). The
v1.9.1 exe is built and checksummed, and its release page is open in the browser
pane with everything prefilled — the ONLY remaining step is the user dragging the
exe onto the page and clicking Publish. Check whether that already happened before
assuming it's still pending.

No other work is queued. If the user wants a next direction and isn't sure, ask —
don't assume; the last brainstorm (visual polish) is the most recently exhausted
vein, but that doesn't mean it's automatically next again.
