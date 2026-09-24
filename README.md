# Fuzzy's Droid Tracker

The tracker, plus a small always-on-top HUD that floats over the game and shows
the droids required for your **current rebirth level + the next 3**, in the
active cycle.

First time you launch it, a short **on-screen guide** walks through the tools
(which overlay to use if you're newer vs. already know the game, and how the
auto rebirth-level readers work) — skippable from its first screen, and
reopenable anytime from the **❔ Guide** button in the toolbar.

## The model this is built on

Each cycle has 35 "rebirth levels," and each level needs exactly 3 specific
droids at specific rarities (that's the 3-slot rows the tracker's own data is
built from). "Rebirth 3" means level 3 of whichever cycle you've got selected
in the tracker — not a rarity tier, not the cycle number itself. The HUD's
top block ("NOW") shows the 3 droids needed for the next level you haven't
finished yet; the three blocks under it show the next three levels after
that, in order.

This replaced an earlier version that grouped requirements by rarity tier
across the whole cycle regardless of what level you were actually on, which
could (and did) surface a level-25 requirement while you were still on level
3. Worth knowing if that sounds familiar.

## Why this is safe to run alongside Fortnite

The overlay is a completely separate OS window — Electron's own, not a hook
into the game. It never injects into Fortnite's process, never reads its
memory, and never sends it input. It only reads pixels off its own window (or,
for the two screen-capture features below, off *your whole screen* the same
way OBS or Discord's screen-share does) and draws its own UI. **Fortnite must
run in Borderless Windowed, not exclusive Fullscreen** — that's an OS
compositing rule, not an anti-cheat one: in exclusive fullscreen nothing else
can draw on top of the game, period.

## Running it

```
npm install
npm start
```

That opens two windows: the tracker, and the small transparent HUD (top-left
by default). `npm install` now also pulls in `tesseract.js` (for Rebirth
Level Detect, below) — it's a bigger download than before, that's expected.

**I could not run `npm install` myself in this sandbox** (blocked network
policy, confirmed not Electron-specific) or test the live Electron runtime.
Every file was syntax-checked individually, and the actual requirement logic
— which droid shows at which level, the "owned" flag, the cycle-complete
edge case — was run and verified against the real game data using Node's
`vm` module. What's genuinely untested: window transparency/click-through,
the global hotkey, on-screen positioning, and — most of all — **whether
Tesseract can actually read your specific rebirth badge**. That last one is
a real unknown; see below.

## Troubleshooting

**"Couldn't start screen sharing (Not supported)"** — this was a real bug in
an earlier build of this app, not something on your end. Electron doesn't
wire up screen sharing to anything by default; it needs the main process to
explicitly hand it off, and that piece was missing. Fixed in `main.js` (a
`setDisplayMediaRequestHandler` that grabs your screen via Electron's own
`desktopCapturer`, with a small picker window if you have more than one
monitor). This one fix covers Live Detect, Rebirth Level Detect (currently
disabled by default — see `rebirth-level-detect.js`), and Read Rebirth
Screen — they all hit the same missing plumbing. If you still see this
error after updating, you're on an old copy of `main.js`.

**Overlays are invisible in-game, but show up fine when you tab out (or in
windowed mode)** — this means Fortnite is set to exclusive **Fullscreen**,
not **Windowed Fullscreen**. Confirmed with a real report: someone the app
was shared with saw exactly this, while the person who built it always runs
Windowed Fullscreen and never noticed a problem. It isn't a bug and there's
no code fix possible — see "Why this is safe to run alongside Fortnite"
above: exclusive fullscreen renders directly to the display and skips
Windows' own window compositor, which is the only thing normally drawing
any other window (this overlay, but also Discord's overlay, Steam's
overlay, OBS's capture border, etc.) on top of the game. A real DirectX
render-hook could get around that, but that's exactly the kind of
game-process-touching technique this app deliberately never does. **Fix:**
in Fortnite's own video settings, set **Window Mode** to **Windowed
Fullscreen** instead of **Fullscreen** — same visual fullscreen coverage,
negligible performance difference on modern Windows, and it's what most
overlay tools require for the same reason.

## Bringing over your existing progress

This app has its own separate storage, so it starts empty. To carry over
what you already logged in the browser version: open that tab, click
**Export**, then in this app click **Import** and pick the saved file.

## Setting your current rebirth level

The HUD needs to know which level you're on. Two ways, and you can use both:

### Manual

A **− / Lvl N / +** stepper, always visible in the toolbar. One click per
rebirth — instant, no screen share, no OCR involved, and always correct.

### 📸 Read Rebirth Screen (recommended)

Open the in-game **Rebirth** menu (the "REBIRTH Rank N" screen with the
credits/multiplier/EXP cards and the NEED checklist) and click **📸 Read
Rebirth Screen** in the toolbar — or press its hotkey, **Ctrl+Shift+6** by
default, so you never have to alt-tab out of the game to click it. Share
your screen once, draw a box around just the number after "Rank," and it
reads it — one frame, not continuous, and the screen share stops
immediately after.

That text is large, bold, and high-contrast, which makes for a reliable OCR
read. It then shows you what it detected (editable, in case it's off) and
exactly what applying it will do: "Rank 4" means rebirths 1-3 are complete,
so it marks every droid at those 3 levels as owned and sets the current
level to 3 — for whichever cycle is selected in the tracker right now, so
double-check that's the right one before hitting Apply. This is the better
fix for "I'm sometimes late logging droids": open this screen whenever you
rebirth (you're already there to click the Rebirth button anyway) and one
read catches your whole log up.

First time you use it, it needs internet once to download its OCR language
data (~15MB, cached after that).

Safe to run repeatedly as you keep progressing — it only ever raises
ownership, never lowers it.

**The box only needs drawing once.** After your first successful read, it's
remembered — click the button again later and it goes straight to reading,
no redraw. Click the little **↺** next to the button (or **"Box was wrong —
redraw"** on the confirm screen) any time you want to redo it, and it'll
also ask you to redraw automatically if your screen resolution changes
(a different monitor, a different in-game resolution) since the old box
wouldn't line up with the new pixels anymore.

## Diagonal split colors — owned vs. required

In the **Rebirth Reqs** panel and on the overlay's droid chips, each badge/
marker is now split diagonally: the upper-left half is the rarity you've
actually logged for that droid (from anywhere — the main list or elsewhere),
the lower-right half is this cycle's highest required rarity for it. Own
Beskar but the row needs Stellar? You'll see both colors at once instead of
one badge that only ever shows Stellar with no way to tell what you actually
have. When the two match (you've caught up), the seam basically disappears
into one solid color. A flat dark square means nothing's logged for that
droid yet — that's deliberately different from Base's own color, since
"never logged" and "logged as Base" aren't the same thing.

This only changes the *display* — clicking a cell in the Rebirth Reqs panel
still works the same as before (claims the top tier shown, or undoes it if
you click your current claim again). To log a specific in-between tier like
"I have Beskar, not Stellar," use the main list's own per-rarity pips like
you always have; the Rebirth Reqs panel will pick it up and show it
immediately. Say the word if you'd rather be able to pick an exact tier
right from this panel instead — that'd be a bigger change to how it's wired.

## Right-click any droid to set an exact colorway

Left-clicking a cell or pip anywhere in the app still works as before
(claims that cell's tier, or undoes it). **Right-click** — in the main
by-level grid, the A-Z list, or the Rebirth Reqs panel — to pick the
*exact* colorway you have from all 7. This started as the fix for "I have
Beskar but the badge only ever shows Stellar" in the Rebirth Reqs panel,
since that's a display limitation, not a data one: the app already stores
whatever exact colorway you tell it.

As of 2026-09-21 this also reaches the main grid and the A-Z list, because
it turned out to be the *only* reliable way to unmark a droid in some
cases — a droid can recur at many rarities across all 5 cycles (BB9, for
example, is Base through Galactic in several cycles but only ever Stellar
once, at Cycle 1 Rebirth 35), and a plain left-click deliberately never
downgrades a tier logged elsewhere, so it can never erase real progress
from a stray click. If you've ever logged a droid's top tier somewhere and
then found a *different, lower* cell for that same droid stuck looking
marked with no way to click it off, this is the fix — right-click it and
pick your current tier again to clear it, no matter which cell you're
looking at. Picking your current tier again undoes it, and picking
something lower than what's already on record is a safe no-op — same
rules as every other click-to-mark control in this app.

## 🎉 Cycle complete: reset & move to the next

Once every one of a cycle's 105 slots (35 levels x 3 droids) is covered,
the app asks: **"Would you like to reset progress for this cycle and open
the next?"**

- **Yes** — clears the ownership you've logged for every droid that
  cycle's own requirement table needed (only those droids — anything
  logged for a droid that only ever showed up in a *different* cycle is
  left alone), then switches you straight to the next cycle (Cycle 5 wraps
  back around to Cycle 1).
- **No** — leaves everything exactly as it is: the cycle stays fully
  marked, on the same cycle, nothing cleared.

This only fires the moment a mark you make is the one that completes the
cycle you're currently on — not repeatedly every time you click around in
an already-finished cycle. It only resets what you've logged in this
tracker; it doesn't touch the rebirth-level counter from **📸 Read Rebirth
Screen** or **Manual** above, since that's reading the game's own
on-screen counter and will pick up your actual in-game rebirth on its own.

## ⏱ Timer banners (Stellar / Mythic / Galactic / Mission countdowns)

A separate always-on-top strip near the top of the screen showing a live
countdown to each of the game's recurring events. This one **never reads
the screen at all** — it's pure system-clock math (today's date/time vs.
each event's known schedule), so there's nothing here to calibrate or
misread, ever:

- **✨ Stellar Blueprint** — every hour, on the hour exactly (1:00, 2:00,
  3:00, ...).
- **🌌 Mythic Blueprint** — every hour, at :55 (1:55, 2:55, 3:55, ...).
- **🪐 Galactic Blueprint** — every 30 minutes, at :15 and :45 past the hour.
- **🎯 Mission** — every 50 minutes (a 45-minute countdown plus a 5-minute
  window where the mission stays active/live before the next countdown can
  start), and also names which mission is coming up next: the four known
  missions (**Stormtrooper → Fishing → D-0 → Mining**) repeat in that fixed
  order forever. This cycle is verified to never drift, no matter how long
  the app stays open, how many missions have passed, or what day it is —
  it's computed from one fixed reference instant with plain elapsed-time
  math rather than "today's date," so it can't misalign across midnight the
  way a calendar-day-relative calculation could.

Toggle it on/off with **⏱ Timers** in the toolbar, or its own hotkey —
**Alt+Shift+T** by default, set from **⚙ Overlay Settings** alongside the
other two hotkeys. Reposition it the same way as the main HUD: **Timers
position → 🎯 Drag into place**, drag the banner strip, then click **Lock**
on the banner strip itself. Like the main HUD, it's click-through once
locked, so it never steals a click meant for the game.

### 🔄 Sync mission timer — for exact precision

The Mission countdown's 50-minute schedule above is a best-guess baseline,
and small real-world drift is still possible. Rather than chase ever-finer
manual corrections, **⚙ Overlay
Settings → Sync mission timer** lets you lock it to the real thing exactly:
type in the **mm:ss** shown right now on the game's own "NEXT MISSION"
banner and click **🔄 Sync**. That's it — the countdown snaps to match the
real one precisely from then on, and the correction is remembered between
launches.

This only ever nudges the *timing*, never which mission name shows next —
you can sync while any of the four missions is up (not just the first one)
and the Stormtrooper → Fishing → D-0 → Mining order stays correct
regardless, since the name cycle is deliberately kept anchored to the fixed
schedule rather than to whatever moment you happened to sync at.

### Look & feel

Each banner shows a small icon badge — a sparkle for Stellar, a faceted gem
for Mythic, a ringed planet for Galactic, a radar sweep for Mission — in a
colored circular badge with a soft tinted glow, using each event's own
color from this game's own rarity palette (the same orange/red/purple
family already used for the Stellar/Mythic/Galactic colorway tiers
elsewhere in this app). **This sandbox has no network access to actually
download real extracted game art** (confirmed by testing — `npm install`
of an image-processing package and direct image downloads both failed with
403s — not just assumed), so these are original icons drawn to match the
researched color language, not lifted screenshots. Once a banner's own
countdown drops under 10 seconds, it pulses gently — a glance-only cue that
something's about to fire, without needing to read the numbers.

## ♻ Safe to Retire list (droids you can safely let go of)

An always-on-top window, meant to sit under your in-game player-counter HUD.
It lists every droid you've logged as owned whose last-required level in the
*active* cycle you've already passed — meaning nothing left in that cycle's
requirement table will ever ask for that droid again, so whatever copy
you're holding (Beskar, Galactic, whatever) is safe to sell or dismantle
in-game.

Example: in Cycle 2, Beskar Proto Roller (the highest colorway Proto Roller
appears in for that cycle) is last needed at Rebirth 22. Once your current
level passes 22, Proto Roller shows up here — not before.

**Every rarity tier, filterable (v1.6.0).** The list covers all five droid
tiers — **Default, Rare, Epic, Legendary, Mythic** (it was Legendary/Mythic
only before 1.6.0) — sorted highest tier first. Each card's frame and corner
dot are colored by tier (gray / blue / purple / amber / red). Show or hide
tiers two ways:
- **⚙ Overlay Settings → Safe to Retire tiers** — click All / Default / Rare /
  Epic / Legendary / Mythic. Works straight away, nothing to bind.
- **Hotkeys** — one per tier plus a "toggle all tiers" key. These ship
  **unbound**; set whichever you want under ⚙ Overlay Settings → Hotkeys.

All tiers are on by default. While any tier is hidden, a small row of tier
pills appears under the title (hidden ones crossed out) so you can tell at a
glance the list is filtered.

**Clean cards + scrolling (v1.6.0).** Cards are a small fixed size, matching
the 🎯 Upcoming RB Req's HUD, instead of stretching to fill the box — the
old layout blew icons up whenever only a few droids were listed. When there
are more droids than fit, the list scrolls rather than shrinking: a thin
scrollbar appears on the right showing where you are (it's hidden when
everything fits). Because a locked overlay is click-through, scrolling is by
hotkey — **Scroll Safe to Retire Up / Down**, one screenful per press. Both
ship unbound; set them in ⚙ Overlay Settings.

Each entry shows the droid's actual in-game icon, its name, and the exact
colorway you have logged, color-coded the same as everywhere else in this
app. Rarity *tier* is a **different axis** from the Base→Stellar colorway
ladder the rest of the app tracks: it's the droid's fixed class, independent
of which colorway copy you own. (**Iconic** droids never appear in this
game's rebirth requirement tables at all, so they're correctly absent.)

**A correctness note worth knowing:** this is *not* the same check as "have
I already seen this droid hit its max colorway" — a droid can reach its
ceiling colorway at one level and then reappear at a *later* level in the
same cycle (this happens for 13 of the 223 droid/cycle combinations in the
real requirement data). The list tracks each droid's true final appearance
level, so it won't tell you something's safe to retire while the cycle could
still ask for it again.

It updates live — the moment you log a droid, apply a Rebirth Screen read,
or change your current level or active cycle anywhere else in the app, this
list recomputes. Switching cycles also scrolls it back to the top.

Toggle it with **♻ Declutter** in the toolbar or its hotkey, **Ctrl+Shift+4**
by default. Reposition it the same way as the HUD and timers: **⚙ Overlay
Settings → Reposition Declutter List → 🎯 Drag into place**, drag it under
your player counter, then click **Lock** on the list itself.

**Where the tier data comes from:** the game's own requirement tables don't
encode rarity class, so it comes from community references — chiefly
[droidex.nackz.dev](https://droidex.nackz.dev)'s value list, cross-checked
name-by-name against every one of the 62 droids in this app's cycle tables
(11 Default, 14 Rare, 18 Epic, 8 Legendary, 11 Mythic), with the original
Legendary/Mythic set also confirmed against igeeksblog.com, fandomscoop.com
and insider-gaming.com. It's the one piece of data in the app that isn't
from the game's own tables — if a droid's tier ever looks wrong, say so and
it can be corrected.

## 🧬 Rebirth Requirements overlay

A standalone always-on-top **"what do I still need"** checklist for the
active cycle, built from the same data as the tracker's own **🧬 Rebirth
Reqs** side panel but filtered down to only the droids you haven't yet
logged at the rarity this cycle actually needs — so it's reachable with a
hotkey while you're actually in-game, no alt-tabbing to the tracker window
required. A droid drops off the list the moment you log it at (or above)
what's needed, and it never shows a droid you've already covered — if
you've made partial progress on one (say the cycle wants Stellar and you've
logged Beskar), it stays on the list with its current colorway shown, since
it's still needed.

It's built to **look like, and default to the exact same size and screen
position as, the ♻ Declutter list** — same card style (a droid portrait in a
rarity-colored frame, its name, and the colorway you've logged for it, if
any), same drag-to-reposition/Lock behavior. The one real difference is
volume: right after you switch to a new cycle, before you've logged
anything, this can show the full roster (43-49 droids depending on the
cycle). As of v1.6.0 it uses the same small fixed-size cards and hotkey
scrolling as the Safe to Retire list instead of shrinking everything to fit
— **Scroll Rebirth Requirements Up / Down**, unbound until you set them in ⚙
Overlay Settings, with a scrollbar on the right whenever there's more below.
Once you're partway through a cycle the list is usually short enough that no
scrolling is needed at all.

Because it defaults to the same spot as the Declutter list, showing both at
once will overlap — reposition one in **⚙ Overlay Settings** if you want them
apart, or just toggle whichever one you're not using off.

Toggle it with **🧬 Rebirth Req** in the toolbar or its hotkey,
**Ctrl+Shift+5** by default.

## 🔮 Sneak Preview (v1.7.0)

A small overlay showing the **Mythic-class droids the *next* cycle will
ask for**, each at the highest colorway that cycle ever needs from it —
so you know what to start hunting for before you flip over. Cycle 5's
"next" wraps back around to Cycle 1.

Once a cycle hits 105/105 you get a prompt with two choices — both reset
that cycle's progress:
- **Next Cycle** — moves the tracker on to the next cycle, same as before.
- **Sneak Preview** (v1.7.1) — keeps the tracker on the finished cycle (so
  the preview is still the one coming up next), turns off every other
  overlay **except the timers**, and opens the Sneak Preview. Switch the
  tracker to the new cycle whenever you start it.

Closing the prompt with its **X** (or Esc) leaves everything as it is.
You can also open the Sneak Preview anytime with **🔮 Sneak Preview** in
the toolbar or its hotkey (unbound by default — set one in ⚙ Overlay
Settings).

Same card look, default size and screen position as Safe to Retire /
Rebirth Requirements (drag-to-reposition + Lock, hotkey-scrolled if the
list runs long — **Scroll Sneak Preview Up / Down**, also unbound by
default). Each card shows the droid's icon, name, and either **"Needs
&lt;colorway&gt;"** or, in green, **"✓ Have &lt;colorway&gt;"** if what
you've already logged for that droid (from anywhere) already covers what
next cycle will need — nothing left to chase for that one.

## 🚫 Hide All Overlays (one-way — never toggles back on)

Every other hotkey in this app toggles its own overlay on and off. This one
is the deliberate exception: **Ctrl+Shift+1** by default, and it only ever
turns things **off** — the main HUD, the timers banner, the Declutter list,
the Rebirth Requirements overlay, the Sneak Preview overlay, and the hotkey
reference card below, all at once. Pressing it again does nothing; each overlay only comes back when
you show it again yourself, individually, the same way you always would
(its own hotkey or toolbar button).

It exists for one specific moment: taking a screenshot or sharing your
screen without every overlay showing up in it and prompting questions. Hit
it right before, take the picture, then bring back whatever you actually
want on screen again afterward.

## ⌨ Hotkey reference list

A small card listing every hotkey currently bound, centered on screen. It
shows up automatically each time you launch the app — a quick reminder so
you're not stuck guessing the bindings — and can be shown/hidden at any time
with **Ctrl+Shift+2** (or **⌨ Hotkeys** in the toolbar). Unlike the HUD and
timer banners, it isn't draggable — it's meant to be a brief reference, not
a permanent fixture, so it always reopens centered. (**Ctrl+Shift+1**, Hide
All Overlays, hides this card too, but doesn't have its own on/off state to
toggle back — see above.)

It reads its rows live from **⚙ Overlay Settings**, so if you rebind any
hotkey there, the list updates immediately without a restart. Only hotkeys
that are actually bound are listed — the optional ones (scroll and tier
hotkeys) show up here once you set them.

All hotkeys work even while Fortnite has focus, and every default is
changeable from **⚙ Overlay Settings**:

| Hotkey | Action | Default |
|---|---|---|
| Hide All Overlays | Turns every overlay off — one-way only, never toggles back on | `Ctrl+Shift+1` |
| Toggle Current Rebirth Requirements | Show/hide the rebirth-requirements HUD | `Ctrl+Shift+3` |
| Toggle Timers | Show/hide the Stellar/Mythic/Galactic/Mission banners | `Alt+Shift+T` |
| Toggle Hotkey List | Show/hide this reference card | `Ctrl+Shift+2` |
| Toggle Declutter List | Show/hide the ♻ safe-to-retire droid list | `Ctrl+Shift+4` |
| Toggle Rebirth Requirements | Show/hide the 🧬 still-needed overlay | `Ctrl+Shift+5` |
| Trigger Read Rebirth Screen | Fires the 📸 Read Rebirth Screen button | `Ctrl+Shift+6` |
| Toggle Sneak Preview | Show/hide the 🔮 next-cycle Mythic overlay | *(unbound — set in ⚙ Overlay Settings)* |
| Scroll Safe to Retire Up / Down | Pages the Safe to Retire list one screen at a time | *(unbound)* |
| Scroll Rebirth Requirements Up / Down | Same, for the Rebirth Requirements overlay | *(unbound)* |
| Scroll Sneak Preview Up / Down | Same, for the Sneak Preview overlay | *(unbound)* |
| Safe to Retire: Toggle All Tiers | Shows all five rarity tiers if any is hidden, otherwise hides all | *(unbound)* |
| Safe to Retire: Toggle Default / Rare / Epic / Legendary / Mythic | Show or hide that one tier in the Safe to Retire list | *(unbound, one each)* |

The thirteen unbound hotkeys above ship with no key combo on purpose (see the convention note in `main.js`): they only appear on the on-screen hotkey list once you've set them.

The read-button hotkey doesn't do anything new under the hood — pressing it
just clicks the real toolbar button for you, so the exact same
screen-capture-and-confirm flow runs either way; nothing about what gets
read or written changes based on how you triggered it.

## Quality-of-life additions

A few small fixes aimed at specific rough edges that came up while building
and testing everything above:

- **Hide the droid list to jump straight to a panel (v1.6.0).** Press the
  already-active **A–Z** or **By Rebirth Level** button again to turn the
  droid list off (press either to bring it back). With the list off, an open
  **🧬 Rebirth Reqs** panel takes the full width instead of sitting below or
  beside a long list — handy on small screens. The choice is remembered.
- **Version badge.** The tracker's title bar and the hotkey reference list
  both now show a small `vX.Y.Z` tag. After unzipping a new copy, check
  that this changed — a stale, not-yet-restarted build has looked exactly
  like a code bug more than once (the mission-timer saga above is a direct
  example: a whole round of back-and-forth turned out to be an old build,
  not a bug).
- **Hotkey conflict warning.** With seventeen global hotkeys now competing for
  key combinations your OS or another app might already have claimed, a
  silent failure to register was a real risk that was never fully confirmed
  either way. If any hotkey fails to bind at launch, a toast names exactly
  which one(s) and their current key combo, so you know to rebind it in
  **⚙ Overlay Settings** instead of wondering why it "isn't working."
- **Reset position.** The HUD, timer banners, and Declutter list each now
  have a **↺ Reset** button next to their **🎯 Drag into place** control in
  **⚙ Overlay Settings** — snaps that window straight back to its tuned
  default spot if a drag ends up somewhere awkward, without needing to
  eyeball a fresh drag.
- **Safer hotkey rebinding.** Two guardrails on the "press new keys" capture
  in **⚙ Overlay Settings**: it now refuses a key combo that's already bound
  to a *different* action instead of silently letting the newer one win
  while the settings panel still shows both as bound, and it refuses a
  rebind with no modifier held at all (Ctrl/Alt/Shift) — an unmodified key
  registered as a global hotkey would swallow every press of it in *every*
  app while this one is running, including Fortnite itself.
- **Unbinding a hotkey (v1.6.0).** While a rebind button is waiting for keys,
  press **Backspace** (or Delete) to clear that hotkey entirely — Esc still
  just cancels. Most hotkeys added in 1.6.0 are unbound by default, so this
  is how you undo one you set to try it out.
- **"Nothing selected" hint (v1.6.0).** If the droid list is toggled off and
  no side panel is open, the page says which buttons bring a view back
  instead of sitting blank.
- **Accidentally closing a HUD window is recoverable again.** Unlocking the
  HUD, a timer banner, the Declutter list, or the Rebirth Requirements
  overlay to drag it gives that window real focus, so an OS-level "close
  window" command (Alt+F4) used to destroy it outright — silently, with its
  own toggle button doing nothing afterward until a full app restart. It's
  now treated the same as turning that window off from the toolbar: just
  toggle it back on, no restart needed.
- **Closing the tracker window quits the app again.** A side effect of the
  fix above: once any HUD window existed, closing the main tracker window
  no longer actually quit the app — it just kept running invisibly in the
  background. Fixed; closing the tracker window (or File → Quit) now exits
  cleanly every time, hotkeys and all.
- **Renamed droids stay on the Declutter list.** Fixing a typo or merging a
  duplicate entry for a droid used to silently drop it
  out of the **♻ Safe to Retire** list for good, even once it genuinely
  qualified again — the list was still looking it up under its old name.
  Renaming no longer loses track of it.
- **A second copy of the app won't clobber your progress.** Launching the
  overlay while it's already running now just brings the existing window to
  the front instead of starting a second instance — two copies quietly
  saving to the same file could otherwise overwrite each other's changes.
- **Several smaller reliability fixes**: the automatic Rebirth Level reader
  could occasionally commit an impossible level if a misread digit slipped
  through; rapid double-clicks (or hotkey mashing) on any of the three
  screen-reading buttons could start two overlapping reads at once; and a
  corrupted save file is now backed up automatically instead of being
  silently replaced with a blank one.

## Using the overlay

- **Toggle Current Rebirth Requirements**: `Ctrl+Shift+3` by default, works
  even while Fortnite has focus. Change it from the tracker's
  **⚙ Overlay Settings** panel. See **⌨ Hotkey reference list** above for
  the full set of hotkeys.
- **Opacity**: same settings panel, defaults to about 55%.
- **Position**: **🎯 Drag into place** in the settings panel, drag the HUD,
  then click **Lock** on the HUD itself. Remembered between launches.
- Each block shows a level tag and its 3 required droids as portrait cards
  (redesigned 2026-09-20 to match the ♻ Declutter list's look), framed in
  the color of the rarity that level needs. A droid already covered by
  something you own elsewhere shows dimmed with a strikethrough — still
  listed (so you know it's required), just flagged as already handled.
- The overlay is click-through by default — your clicks always reach the
  game, never the HUD. Only reposition mode is briefly interactive.

## File map

- `main.js` — Electron main process: all seven windows (tracker, HUD,
  timers, Declutter list, Rebirth Requirements overlay, Sneak Preview,
  hotkey list), the shared JSON store, the twenty global hotkeys (registered together at
  launch via `registerAllHotkeys`, with any that fail to bind reported to
  the tracker window as a toast via `reportHotkeyRegistrationFailures`),
  settings (including the four-step `migrateHotkeyLayout()` pass that
  moves an existing install's hotkey bindings forward — v0→v1 moved
  Ctrl+Shift+3/4 to 4/5, v1→v2 moved Ctrl+Shift+1/2/3/4/5 to 2/3/4/5/6 to
  make room for the new Hide All Overlays hotkey at Ctrl+Shift+1, v2→v3
  moved Read Rebirth Screen back down from Ctrl+Shift+6 to 5 once Read
  Crafting Bench's removal freed it up, v3→v4 moved the Current Rebirth
  Requirements HUD's hotkey from Alt+Shift+D to Ctrl+Shift+3 and shifted
  Declutter/Rebirth Req/Rebirth Screen down to 4/5/6 to make room — see its
  comment if a future renumber needs the same trick; a future overlay's
  hotkey shouldn't need this trick at all, see the "convention" comment
  above `DEFAULT_SETTINGS`), and each movable window's "reset to default
  position" handler.
- `preload.js` — the only bridge between the pages and Node/IPC.
- `tracker.html` — your original tracker, functionally unchanged, plus the
  Overlay toolbar controls, the always-visible Manual rebirth-level stepper,
  and Read Rebirth Screen. (Rebirth Level Detect's old button/strip markup
  is still here too, just hidden — see the flag in rebirth-level-detect.js.)
- `overlay.html` — the HUD: 4 level-blocks, each with its 3 droids as
  portrait cards (see the Rebirth Requirements overlay section above for
  why the card style changed).
- `rebirth-requirements-overlay.html` — the standalone Rebirth Requirements
  overlay (see its section above); reuses `cycleCeilings()` from
  `requirements.js`, so it can never disagree with the tracker's own 🧬
  panel for the same cycle.
- `sneak-preview.html` — the 🔮 Sneak Preview overlay (see its section
  above); reuses `getSneakPreview()` from `requirements.js` and the same
  card/scroll-viewport pattern as Rebirth Requirements / Safe to Retire.
- `droid-data.js` — CYCLES + rarity data, shared verbatim by both windows.
  Also holds `DROID_RARITY_CLASS` + `RARITY_CLASS_ORDER` (the separate,
  community-sourced Default/Rare/Epic/Legendary/Mythic tier map the Safe to
  Retire list groups and filters on — see its section above for provenance).
- `icons-data.js` — reference-icon thumbnails (tracker-only: Live Detect and
  the Rebirth Requirements panel's icons).
- `requirements.js` — shared logic (`normKey`/`canonicalName`/`buildIndex`/
  `cycleCeilings`, plus `getLevelRequirements`/`getUpcomingLevels`, the
  level-based model above). Also `cycleLastNeededLevel` (each droid's true
  final appearance level in a cycle — deliberately separate from
  `cycleCeilings`, which only records the *first* level a droid hits its
  ceiling colorway and is the wrong field for a "safe to retire" decision;
  see the Declutter list section above), `getDeclutterList` (the list's
  full filter logic, so it can be verified once against the real data
  instead of duplicated in declutter.html), and `getSneakPreview` (next
  cycle's Mythic-only ceiling requirements, 5→1 wrap — the Sneak Preview
  overlay's data). Mirror any change here if you edit the equivalent logic
  in tracker.html.
- `rebirth-level-detect.js` — continuous badge-watching OCR: its own
  screen-capture call (independent of Live Detect), calibration, sampling,
  debounce, and the manual stepper.
- `rebirth-screen-read.js` — one-shot Rebirth-menu OCR + bulk catch-up: its
  own screen-capture call, calibration, editable confirmation, then reuses
  the tracker's existing `markRowObtained()` for every completed level.
- `screen-picker.html` / `screen-picker-preload.js` — the small "choose a
  screen" modal `main.js` shows only when you have more than one monitor;
  irrelevant/never shown on a single-monitor setup.
- `timers.html` — the always-on-top countdown-banner strip (Stellar/Mythic/
  Galactic/Mission). Pure wall-clock math, no screen reading at all; shown/
  hidden by `main.js` via the ⏱ Timers button or its own hotkey.
- `hotkey-list.html` — the centered, click-through hotkey reference card;
  reads its rows live from shared settings and re-renders on any change.
  Shown automatically on launch, toggled via the ⌨ Hotkeys button or its own
  hotkey (`Ctrl+Shift+2` by default).
- `declutter.html` — the "safe to retire" droid list (every tier); the
  which-droids logic lives in `requirements.js`'s `getDeclutterList`, this
  file handles rendering, the tier filter (read from the `declutterShow*`
  settings), and the hotkey-driven scroll viewport, plus the same live
  store-driven update pattern every other window here already uses. Shown/hidden by `main.js` via the ♻
  Declutter button or its own hotkey (`Ctrl+Shift+4` by default).
