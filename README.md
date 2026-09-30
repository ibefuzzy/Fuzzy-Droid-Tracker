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

**v1.10.1:** finishing level 35 used to leave the HUD blank until you
switched cycles. Now it keeps going — once it runs past level 35 it shows the
next cycle's levels 1+ instead, each block tagged **"· Cycle N"** so it's
obvious those are next-cycle requirements, not the one you're still on. Same
idea as 🔮 Sneak Preview, just built into the always-on HUD instead of a
separate overlay.

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
no redraw. Click **↺ Redraw box** next to the button (or **"Box was wrong —
redraw"** on the confirm screen) any time you want to redo it, and it'll
also ask you to redraw automatically if your screen resolution changes
(a different monitor, a different in-game resolution) since the old box
wouldn't line up with the new pixels anymore.

**Never leave the game (v1.11.1).**
- **Your screen is remembered.** With two or more monitors, the "Choose a screen"
  picker only appears the first time. The screen you pick is reused by every read
  after that (and by Live Detect / Rebirth Level Detect). The reader says which screen
  it read ("… for Cycle 2 on Screen 1"). **🖥 Change screen** in the reader brings the
  picker back and remembers the new choice. Cancelling the picker keeps the old one.
- **Apply or cancel from the game.** Two new hotkeys under ⚙ Keybinds → Quick actions,
  unbound until you set them: **📸 Apply the reading** (same as the Apply button) and
  **📸 Cancel the reading** (closes the reader, changes nothing).
- **See the result in-game.** While the app isn't the focused window, a small notice
  pops up at the top of the game's screen with the rank it read, how sure it is, and
  your Apply/Cancel keys. After Apply it confirms what was caught up, and it tells you
  when a finished cycle is waiting for you in the app. The notice is click-through and
  never takes focus from the game.

## Diagonal split colors — owned vs. required

In the **🧬 Reqs panel** and on the overlay's droid chips, each badge/
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

## ⏱ Timer banners (Stellar / Mythic / Kyber / Mission countdowns)

A separate always-on-top strip near the top of the screen showing a live
countdown to each of the game's recurring events. This one **never reads
the screen at all** — it's pure system-clock math (today's date/time vs.
each event's known schedule), so there's nothing here to calibrate or
misread, ever:

- **✨ Stellar Blueprint** — every 30 minutes, at :05 and :35 past the hour.
- **🌌 Mythic Blueprint** — every hour, at :55 (1:55, 2:55, 3:55, ...).
- **💎 Kyber Blueprint** — every hour, at :15 (1:15, 2:15, 3:15, ...). The
  Galactic timer was retired in v1.10.5 with the game's own change.
- **🎯 Mission** — every 35 minutes, and also names which mission is coming
  up next: the four known
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

The Mission countdown's 35-minute schedule above is a best-guess baseline,
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
for Mythic, a crystal for Kyber, the upcoming mission's own icon for Mission —
in a colored circular badge with a soft tinted glow, using each event's own
color from this game's own rarity palette. Since v1.11.1 each banner is only
as big as its text, and the shape (row, 2 × 2 or column) and size are set
under ⚙ Overlay Settings → Timers. **This sandbox has no network access to actually
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
- **⚙ Overlay Settings → Tier filter** — click All / Default / Rare /
  Epic / Legendary / Mythic. Works straight away, nothing to bind.
- **Hotkeys** — one per tier plus a "toggle all tiers" key. These ship
  **unbound**; set whichever you want under ⚙ Overlay Settings → Hotkeys.

**Shared with the Rebirth Requirements overlay (v1.7.2).** This is one
filter, not two — the same buttons and hotkeys also show/hide tiers in the
🧬 Rebirth Requirements overlay below, so turning off a tier you don't want
to think about right now (say, Default) hides it from both lists at once
instead of needing to be set up twice.

All tiers are on by default. While any tier is hidden, a small row of tier
pills appears under the title (hidden ones crossed out) so you can tell at a
glance the list is filtered — both overlays show this.

**Clean cards + scrolling (v1.6.0).** Cards are a small fixed size, matching
the 🎯 Upcoming RB Req's HUD, instead of stretching to fill the box — the
old layout blew icons up whenever only a few droids were listed. When there
are more droids than fit, the list scrolls rather than shrinking: a thin
scrollbar appears on the right showing where you are (it's hidden when
everything fits). Because a locked overlay is click-through, scrolling is by
hotkey — **Scroll List: Up / Down**, one screenful per press. Both ship
unbound; set them in ⚙ Overlay Settings.

**Shared with the Rebirth Requirements overlay (v1.7.3).** This is one
hotkey pair, not two — the same Scroll List: Up/Down keys also page the 🧬
Rebirth Requirements overlay below, so you don't need a second binding to
scroll that list too. (Before v1.7.3 it had its own separate, unbound scroll
hotkeys; those are retired in favor of this shared pair — same fix as the
v1.7.2 tier filter, and for the same reason.)

Each entry shows the droid's actual in-game icon, its name, and the exact
colorway you have logged, color-coded the same as everywhere else in this
app. Rarity *tier* is a **different axis** from the Base→Stellar colorway
ladder the rest of the app tracks: it's the droid's fixed class, independent
of which colorway copy you own. (**Iconic** droids never appear in this
game's rebirth requirement tables at all, so they're correctly absent.)

**A correctness note worth knowing:** this is *not* the same check as "have
I already seen this droid hit its max colorway" — a droid can reach its
ceiling colorway at one level and then reappear at a *later* level in the
same cycle (this happens for 13 of the 224 droid/cycle combinations in the
real requirement data). The list tracks each droid's true final appearance
level, so it won't tell you something's safe to retire while the cycle could
still ask for it again.

It updates live — the moment you log a droid, apply a Rebirth Screen read,
or change your current level or active cycle anywhere else in the app, this
list recomputes. Switching cycles also scrolls it back to the top.

**Marking droids retired (v1.10.13).** Once you've actually sold or
dismantled a droid, mark it retired. Use the **same keys as the Rebirth
Requirements overlay** (🧬🔮♻ Mark Selected Droid / Navigate Left, Right,
Up, Down), or click a card while the list is unlocked. A retired droid drops
to the bottom of the list, dimmed and struck through with **"✓ Retired"**,
and the count in the title only counts what's left. The next droid slides up
under the highlight, so you can retire several in a row. **To undo, mark it
again.**
- **Retiring never changes your logged droids.** Rebirth Requirements,
  Upcoming RB Req's, By Rebirth Level and the covered count all stay exactly
  as they were, so the cycle still completes normally.
- A retire is tied to the colorway you had logged. If you later log a
  **higher** colorway of that droid, that's a new copy, so it's back on the
  list as active.
- Retires are per cycle: finishing a cycle (either choice in the
  cycle-complete prompt) clears that cycle's retires, and **Clear ALL**
  clears them all.
- **Show / hide retired droids** with its own hotkey (**♻ Retired droids**
  under ⚙ Overlay Settings → Keybinds → Tier filter; unbound by default).
  While they're hidden, the title shows **"N retired hidden"** so a short
  list isn't a mystery. Hidden retired droids can't be selected; show them
  again to undo one.
- If more than one of Rebirth Requirements / Sneak Preview / Safe to Retire
  is open, the keys drive the one you opened most recently.

Toggle it with the **♻ Safe to Retire** tile under Overlays in the toolbar or
its hotkey, **Ctrl+Shift+4** by default. Reposition it the same way as the HUD
and timers: **⚙ Overlay Settings → Layout → ♻ Safe to Retire → 🎯 Drag into
place**, drag it under your player counter, then click **Lock** on the list
itself.

**Where the tier data comes from:** the game's own requirement tables don't
encode rarity class, so it comes from community references — chiefly
[droidex.nackz.dev](https://droidex.nackz.dev)'s value list, cross-checked
name-by-name against every one of the 62 droids in this app's cycle tables
(11 Default, 14 Rare, 18 Epic, 8 Legendary, 11 Mythic), with the original
Legendary/Mythic set also confirmed against igeeksblog.com, fandomscoop.com
and insider-gaming.com. It's the one piece of data in the app that isn't
from the game's own tables — if a droid's tier ever looks wrong, say so and
it can be corrected.

## 🪟 Resize & move overlays (v1.11.0)

- **Resize any droid overlay** (Upcoming RB Req's, Rebirth Requirements, Safe to
  Retire, Sneak Preview, Crit Guide): ⚙ Overlay Settings → Layout → **🎯 Drag into
  place**, then drag the striped grip in the overlay's bottom-right corner. Icons, text
  and spacing scale up together, right up to the droid art's full sharpness. Past that,
  the lists fit more columns instead of blurring. **Lock** keeps the size, and **↺ Reset**
  now restores the default size as well as the default spot.
- **Moving an overlay keeps it on one monitor.** Drag it to the edge of a screen and it
  stops there. Keep going and it hops across whole, and pulling back returns it to right
  where you grabbed it. (Before, dragging across the edge between two monitors could show
  a flickering copy of the overlay on the other screen.)
- **Kyber droid icons** are now clean transparent cut-outs like every other colorway.
  Leftovers of the in-game "PREVIEW" banner, the card frame and the colored card glow are
  gone.

## 👥 Friends, colored SELL flags & a new tutorial (v1.16.0)

**A new tutorial.** The first time you open the app, a welcome screen asks **▶ Show me around**
or **Skip, I'll figure it out myself**. The tour highlights the real buttons one by one (7 quick
steps). After an update, you only get a short **What's new**, also skippable. Replay it any time
with **❔ Guide**. The website has the same tutorial, with its own steps for phones.

**💎 Nova Crystal rewards** (a player's request). The Nova Crystals each rebirth gives you now
show on the 🎯 Upcoming RB Req's HUD, left of the credit cost (with the game's own crystal), and
under each rebirth number in **By Rebirth Level**: 5 at Rebirth 20 rising to 300 at 35, and 300
for each of 36–40. Rebirths 1–19 give none. The website shows them too.

**Hotkeys: your own from the start.** A new install starts with no hotkeys set, and the tutorial
opens **⚙ Overlay Settings → Keybinds** so you can pick your own. The hotkey list no longer pops up
every time the app starts (open it from the **⌨ Hotkey list** tile). If you already use the app,
your hotkeys stay exactly as they are.

**👥 Friends: see what your friends need.** No accounts and no server; you swap codes.
- Press **👥 Friends** (toolbar, Tools row) to open the panel. Type the name your friends
  will see, then **📋 Copy my code** and paste it to a friend (Discord, anywhere). It's a
  short code with your cycle, your rebirth and every droid you've logged.
- Paste a friend's code into the box at the bottom and press **Add**. Each friend is one line
  with the 3 droids they need right now; click it to open:
  - **🎯 Up next**: their next 4 rebirths, like your HUD.
  - **🧬 Rebirth Reqs**: everything their cycle needs, rarest first, with how many they still
    need per rarity (**only needs** hides what they have).
- A code is a snapshot of that moment ("code from 2h ago"). When they send a new one, paste it:
  it replaces the old one. A code from a different version of the app says so instead of
  showing the wrong droids.
- **🔗 Copy link** gives a website link that opens your progress in any browser, no app needed.
- In-game: bind **👥 Switch you / friends** (⚙ Overlay Settings → Keybinds, under 🎯 Mark
  droids). It flips the 🎯 Upcoming RB Req's HUD from your list to each friend's and back, in the
  same spot and size. An amber name tag shows whose list it is, and marking is off while it shows
  a friend. Friends' progress never touches yours.
- No one to try it with yet? Paste your own code: you show up as a friend.

**Colored SELL flags on the droid pictures**, in the colors of the old Cycle 5 community chart:
- 🟡 **SELL**: never needed again this cycle.
- 🔴 **a number (21–30)**: you can sell it now; that rebirth needs it again, at a higher rarity.
- 🟢 **a number (31+)**: the same, needed again at Rebirth 31 or later.
- No flag: it's needed again soon (in the same stretch: rebirths 1–20, 21–30 or 31+), or later at
  the same rarity, so keep it.

The flags hang off the side of the picture on the 🎯 HUD and in 👥 Friends' Up next, so the droid
stays fully visible. The **By Rebirth Level** list shows the same colors as the tag by the name
(it used to be one green SELL). Hover a card in the tracker for the meaning. Cards from the next
cycle (when the HUD runs past the end) follow that cycle's own table.

## 💰 Rebirth credit costs on the HUD (v1.15.1)

- The **🎯 Upcoming RB Req's** HUD now shows what each rebirth costs, next to its level:
  the game's gold credit coin and the amount in the game's own bold green (**10K** for
  Rebirth 1 up to **15QA** for Rebirth 40), on a small dark chip so it reads over any
  scene. You can see at a glance how many credits the next few rebirths need.
- Costs for Rebirths 1–35 come from the community Super Rebirth chart (game update
  v1.26); 36–40 were added by hand. They're the same in every cycle.

## 🎨 App looks + a tidier toolbar (v1.15.0)

**App looks: theme the tracker window itself.** ⚙ Overlay Settings → Appearance → **App
look** recolors this window: the page, the panels, the console lines and labels, and the
"on" color (lit tiles, pressed buttons, the progress bar). Thirteen looks: **Default**,
**Jedi Order**, **Sith**, **Rebel Alliance**, **Galactic Empire**, **First Order**,
**Galactic Republic**, **Mandalorian**, **Grogu**, **Tatooine**, **Death Star**,
**Galactic Senate** and **Trade Federation**.
- **Matches your overlay presets.** Clicking an overlay preset (say **Sith**) also gives
  the app its Sith look. Don't want that? Untick **Presets switch the app look too**
  right under the looks, and pick the app look on its own. Your saved looks never change
  the app look.
- Rarity and tier colors are the same in every look, so a Diamond is always a Diamond.
- The tracker opens straight in your look, with no flash of green first.
- The **Default** look is exactly the tracker you know, down to the pixel.

**A tidier toolbar:**

- **Overlays are a switchboard now.** Every overlay has its own equal-sized tile under
  **Overlays**, four to a row (two on a narrow window), with a light on the right: lit
  = on screen. The names stay put, so clicking one no longer changes its width and
  reshuffles the whole row (before, each button's ": On" / ": Off" text did that).
- **Everything lines up.** Row labels sit in one column and the dividers run the full
  width. Before, each row shrank to its buttons and centred, so labels didn't line up
  and rows wrapped earlier than they needed to.
- **Clearer names.** **♻ Declutter** is now **♻ Safe to Retire**, its name everywhere
  else (hotkey, settings, the list itself). The side panel button in Tools is
  **🧬 Reqs panel**, so it isn't confused with the **🧬 Rebirth Reqs** overlay tile.
  **⌨ Hotkeys** is **⌨ Hotkey list**.
- **Rebirth Lvl row:** the second "Rebirth Lvl" label is gone, and the lone **↺** is now
  **↺ Redraw box**, after **📸 Read Rebirth Screen**: it redraws that reader's box around
  the Rank number (it read like "reset my level" before).
- **A–Z / By Rebirth Level** is one joined two-way switch.
- **⚙ Overlay Settings** and the keybinds lock sit on the last row. **Export** and
  **Import** are on the right, with **Reset all…** last, in red and away from Export.
  It still asks before clearing anything.

Nothing about your progress, settings or hotkeys changed.

## 🔧 Mission warnings actually sound (v1.14.2, hotfix)

- In v1.14.1 a mission warning only played while "Enable sound notifications when timers
  expire" was on, and nothing in the ⚠ Mission warning box said so, so with that switch off
  the warnings stayed silent. Now a warning plays whenever you've picked a time for it, with
  its own sound and volume; the switch still controls the sounds when timers expire.
- The volume sliders for the mission warning (Timers) and the Spawn Alert (Filters) sit on
  their own line now. Before, they jumped between rows while you slid them, as the
  percentage next to them changed width.

## ⚠ Mission warning (v1.14.1)

A heads-up sound **before** the next mission, in ⚙ Overlay Settings → Timers → Sound
notifications → ⚠ Mission warning:

- Click **30 s**, **1 min** and/or **2 min** (any combination), and add up to 3 times of
  your own (type `1:30` or `90`, then ＋ Add; ✕ removes one). A little timeline shows when
  each warning fires before the mission.
- **Warning sound:** its own pick from the same list as the timers (Chime by default, so
  "mission soon" sounds different from "mission now") and its own volume slider, with a ▶
  preview at that volume. Picking a time is what turns warnings on: they play even with
  "Enable sound notifications when timers expire" off (that switch is for the expiry sounds).
- It follows the 🎯 Next Mission banner, including your 🔄 Sync. A warning the PC slept
  through is skipped rather than played late.
- Fix: timer sounds (and now the warnings) no longer come up to a minute late after the
  banners have been hidden for a while. Windows was slowing the hidden banner window's clock.

## 📡 Spawn Alert (v1.14.0)

The game announces world droid spawns in small text at the left of the screen
("Diamond Droid (Rare) spawned at the Sandcrawler"). **📡 Spawn Alert** watches that line
and shows each new spawn big, wherever you put it:

- **DROID SPAWN** on top, then the droid type and tier, e.g. **Diamond Rare**. The type
  has its own look (gold, icy diamond, a moving rainbow, beskar silver, galactic purple,
  stellar amber, kyber green) and the tier its own color: Common white, Rare blue, Epic
  purple, Legendary gold, Mythic pink.
- **Only spawns.** "crafted a … Droid", "has reached Rebirth", the crafting-boost notice
  and chat are ignored. A line that stays on screen alerts once; a second identical spawn
  under it alerts again.
- **Turn it on** with the 📡 Spawn Alert button or its hotkey (unbound by default; set it
  in ⚙ Overlay Settings → Keybinds). It's off by default because it reads the screen while
  on: it checks a small box every 1.5 s and only runs text recognition when that box has
  new text (about 0.1–0.2 s each time). Turning it off stops the screen capture and frees
  the text recognition.
- **Place it** in ⚙ Overlay Settings → Layout → 📡 Spawn Alert: 🎯 Drag into place shows a
  sample alert with a drag bar and a corner resize grip. The same card picks how long an
  alert **stays up** (3–15 s). A burst of spawns queues up and moves along faster.
- **Pick which spawns, and which ones make a sound,** in ⚙ Overlay Settings → Filters →
  📡 Spawn Alert: a grid of every type × tier where each box cycles **Off → Show →
  Show + 🔊** (e.g. Diamond Mythic on, Diamond Rare off, Kyber Rare with a sound). Click a
  type or tier heading to change its whole row or column; Show all / Sound for all / No
  sounds reset the grid. Everything starts on Show with no sound. The sound is one pick for
  all 🔊 boxes, from the same list as the timers (including your own files), with its own
  volume and a ▶ preview; it plays as each alert appears.
- **Its look** follows ⚙ Overlay Settings → Appearance like the other overlays: border skin
  (frame, glow and emblem), theme presets, backdrop color, and "Edit colors for: 📡 Spawn
  Alert". Saved looks and share codes include it.
- It reads the screen you picked for 📸 Read Rebirth Screen (🖥 Change screen switches it)
  and expects the game's usual layout at 1920×1080 or another 16:9 resolution. The first
  run needs the internet once to fetch the text recognition data, same as Read Rebirth
  Screen.

## ⏱ Kyber timer back to normal (v1.13.1, hotfix)

- The Kyber launch event (a Kyber Blueprint every 5 minutes) is over. The 💎 Kyber
  banner now counts down to **:15 past every hour**, landing on :00 seconds like the
  Stellar and Mythic banners. Before this fix it kept showing the 5-minute event
  schedule until the old event window closed.

## 🎛 Your own looks, per-overlay colors, compact cards & your own alert sounds (v1.13.0)

Everything here starts switched off, so the app looks and sounds exactly as before
until you change something. None of it touches your progress (only settings).

- **Save your own looks.** Under ⚙ Overlay Settings → Appearance → Presets, name the
  current look and hit **💾 Save current look**. It joins the presets and saves every
  border skin and color, including per-overlay ones. **⧉** copies a share code
  (it starts with `FDT1.`) that a friend pastes into **⬇ Import**. Imported codes can
  only set real skins and valid colors; anything else in them is ignored.
- **Per-overlay colors.** **Edit colors for** picks one overlay (or the timers) and
  gives it its own colors on top of the all-overlays ones. **Default** on a row makes
  it follow All overlays again, and **↺ Reset this overlay** clears all of its own.
- **Droid cards.** A text-size slider for the droid names and status lines (80–140%),
  and **Compact**: icons only, so the lists fit more droids per row. Set it for every
  overlay, or for just one (Compact on Safe to Retire only, for example). Marked and
  retired droids still show on the icon itself.
- **The timers join the theme.** They take the backdrop color, and a border skin
  (Appearance → Border skins → ⏱ Timers, or any preset) tints their outlines and puts
  the emblem on top. Each timer's own color stays, so you can still tell them apart.
  ⊘ keeps the classic look.
- **Your own alert sounds.** Under ⚙ Timers → 🎵 Your sounds, **＋ Add a sound file…**
  (mp3, wav, ogg or m4a, up to 5 MB). The app keeps its own copy, so moving the
  original is fine, and it matches the loudness to the other alerts. **Best length:
  about 1–5 seconds**, because anything longer fades out at 8 seconds. Then pick it
  for any timer: Mission, Blueprints, or Stellar / Mythic / Kyber individually (they
  follow Blueprints unless you choose), with ▶ to preview each. A file that won't play
  falls back to Good news so you never miss an alert.

## 🛡 Real Star Wars insignia & one-click themes (v1.12.0)

- **Real insignia.** Rebel, Empire, Jedi and Mandalorian now wear the actual faction
  insignia instead of hand-drawn stand-ins (your chosen skins carry over).
- **Eight new border skins:** Sith, First Order, Galactic Republic, Old Republic,
  Galactic Senate, Trade Federation, Death Star and Jedi Crest. That's 15 in all.
- **Grogu got a proper Baby Yoda emblem** (wide ears, big eyes, robe collar) and a
  Grogu theme of his own.
- **Theme presets:** one click at the top of ⚙ Overlay Settings → Appearance dresses
  every overlay in a matching skin and colors (Rebel Alliance, Galactic Empire, Jedi
  Order, Sith, and more). See **🛡 Overlay Borders** below for the full list, and
  **Credits** for where the insignia come from.
- **Smaller download.** The exe dropped from about 94 MB to 67 MB, because unused
  screenshots and backups no longer ship inside it, and it starts up faster too.

## 🎨 Colors, snapping, mark-key switch & compact timers (v1.11.1)

- **Pick your own overlay colors.** The Borders tab in ⚙ Overlay Settings is now
  **🎨 Appearance**. Above the border skins you can set a **Backdrop** (the dark panel
  behind the droids), **Droid boxes** (the tile behind each icon) and a **Highlighter**
  (the glow around the droid your mark keys have selected). Backdrop and boxes each have
  an opacity slider. One theme covers all five droid overlays and changes live.
  **Default** puts one color back and **↺ Reset all colors** puts them all back. Until you
  pick something, every overlay looks exactly as before. The Highlighter's **Match
  border** makes each overlay glow in its own border color. The HUD keeps its own
  opacity slider under Layout.
- **Mark keys no longer fight when two lists are open.** With Rebirth Requirements and
  Safe to Retire (or Sneak Preview) open together, the 🧬🔮♻ mark and navigate keys drive
  **one** list: Rebirth Requirements by default. Only that list shows the selection glow,
  and it wears a small **⌨ KEYS** tag. The new **⇄ Switch lists** hotkey (Keybinds → Mark
  droids, unbound until you set it) moves the keys to the next open list. Your choice is
  remembered. With only one list open, the keys simply go to it.
- **Overlays snap together.** Drag one near another and it snaps flush against it (side
  by side or stacked, with the edges lined up), or against the screen edge. Resizing snaps
  to another droid overlay's width and height, so two lists can be exactly the same size.
  Both can be turned off at the top of ⚙ Overlay Settings → Layout.
- **Smaller timer banners.** Each banner is now only as big as its text, and the timers
  window shrinks to fit, so it covers far less of the top of the screen. Under ⚙ Overlay
  Settings → Timers, pick a **Row**, **2 × 2** or **Column** shape and a size from 80% to
  150%, then move them to a clear spot.
- **"Good news, everyone!"** is now a timer alert sound, and the new default. If you'd
  left your sound on the old default (Beep), it switches over once. Any other choice you
  made is kept. Pick a sound per timer group under ⚙ Timers → Per-timer custom volumes,
  and hear it with **▶ Play** there. The clip is levelled to match the beep/boop/chime
  tones at the same volume setting, and it's held a little gentler near the top of the
  volume slider so it never gets harsh.
- **📸 Read Rebirth Screen without alt-tabbing.** It remembers which screen to read
  (**🖥 Change screen** picks again), has optional Apply / Cancel hotkeys, and shows the
  rank it read in a notice over the game. See **📸 Read Rebirth Screen** above.

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
scrolling as the Safe to Retire list instead of shrinking everything to fit,
with a scrollbar on the right whenever there's more below. Once you're
partway through a cycle the list is usually short enough that no scrolling
is needed at all.

Because it defaults to the same spot as the Declutter list, showing both at
once will overlap — reposition one in **⚙ Overlay Settings** if you want them
apart, or just toggle whichever one you're not using off.

Toggle it with **🧬 Rebirth Req** in the toolbar or its hotkey,
**Ctrl+Shift+5** by default.

**Tier filter (v1.7.2).** This overlay shares the exact same tier filter as
♻ Safe to Retire — see that section above. Toggling a tier off (by hotkey or
in ⚙ Overlay Settings → Tier filter) hides it here too; the same tier-pills
row appears under the title while any tier is hidden.

**Scroll hotkey (v1.7.3).** This overlay also shares Safe to Retire's
**Scroll List: Up / Down** hotkeys — see that section above. One binding
pages whichever of the two you have open; there's no separate Rebirth
Requirements scroll hotkey to set up any more.

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

### Marking droids in the Sneak Preview (v1.10.13)

You can mark droids off right in the Sneak Preview as you pick them up for
the next cycle — with the **same keys as the Rebirth Requirements
overlay** (🧬🔮 Mark Selected Droid / Navigate Left, Right, Up, Down in
⚙ Overlay Settings → Keybinds), or by clicking a card while the overlay is
unlocked. Mark a card again to undo it. The list scrolls to follow the
highlighted card.

- **Marks are held for the cycle the preview shows**, not added to your
  current cycle. A marked card shows a ✓ badge and **"✓ Marked
  &lt;colorway&gt;"**. They don't count toward your current cycle, and
  finishing the current cycle doesn't erase them, even for a Mythic that
  both cycles use.
- **They're applied automatically** the moment the tracker switches to that
  cycle — **Next Cycle** in the cycle-complete prompt, or picking it in the
  cycle dropdown. A toast tells you how many were applied. Applying never
  lowers a colorway you've already logged.
- **Which list the keys drive:** whichever of Rebirth Requirements / Sneak
  Preview / Safe to Retire is on screen. If more than one is open, the one
  you opened most recently.
  A hidden overlay never reacts to them. (Before v1.10.13 a hidden Rebirth
  Requirements overlay still did, and could mark its selected droid
  unseen.)
- **Clear ALL** also clears held marks.

## ⚡ Optimal Crit Guide (v1.10.0)

A fifth in-game overlay — a static reference panel, not tied to your droid
progress at all. It's the fixed crystal-spend order for one specific build
(Fortnite, Nova Crystals, Chopper equipped, starting at 80% crit chance /
+110% crit bonus / multi-crit level 0), plus the formula behind how a
critical hit is actually calculated:

> The standard hit is counted **once**, whatever the number of rolls. Each
> landed roll then adds the crit bonus (50% base + 50% Chopper + 10% per
> level) on top of it.

Below that, all 36 purchases in the order that gets the most droid-time
reduction per crystal spent for this build — each row color-coded by what it
levels (gold = crit damage, cyan = crit chance, purple = multi-crit), with
the resulting total, the crystal cost, the running total spent, and the
droid time after that purchase. Scrolls past the purchase list to the 3
milestone chips (multi-crit unlocked, multi-crit level 2, after all 36
buys) and a "why this order, not a universal ranking" callout.

Toggle it with **⚡ Crit Guide** in the toolbar or its hotkey (unbound by
default — set one in ⚙ Overlay Settings). Same card look, default size/
position, and hotkey-scrolled viewport as Safe to Retire / Rebirth
Requirements / Sneak Preview — **Scroll Crit Guide Up / Down**, also unbound
by default.

**v1.10.1:** the subtitle + "How a Critical Hit is Calculated" box were
eating a lot of the panel's height, forcing more scrolling to see the actual
purchase list. An **ℹ Info** button next to the buy counter now hides/shows
that block on demand (remembered across restarts); purchase rows are also a
little bigger and easier to read. Hiding the info box roughly a third more
rows fit on screen at once.

## 🛡 Overlay Borders (v1.10.0; real insignia + theme presets in v1.12.0)

Each of the five in-game overlays picks a full illustrated **border
skin** instead of a flat saber color — a glowing outline, corner brackets,
and a small emblem badge straddling the top edge. Pick one per overlay in
**⚙ Overlay Settings → Appearance** (called Borders before v1.11.1). There are 15:

| Skin | Color | Emblem |
|---|---|---|
| Rebel | red | Rebel Alliance starbird (real insignia since v1.12.0) |
| Empire | silver | Galactic Empire cog (real insignia since v1.12.0) |
| Jedi | blue | Jedi Order symbol (real insignia since v1.12.0) |
| Mandalorian | tan | Mythosaur skull (real insignia since v1.12.0) |
| Bounty Hunter | crimson | T-visor helmet |
| Tatooine | orange | twin suns |
| Grogu | green | Baby Yoda (redrawn in v1.12.0) |
| Sith *(v1.12.0)* | blood red | Sith insignia |
| First Order *(v1.12.0)* | white | First Order insignia |
| Galactic Republic *(v1.12.0)* | red | Republic cog |
| Old Republic *(v1.12.0)* | gold | Old Republic emblem |
| Galactic Senate *(v1.12.0)* | violet | Senate emblem |
| Trade Federation *(v1.12.0)* | bronze | Trade Federation emblem |
| Death Star *(v1.12.0)* | steel | Death Star |
| Jedi Crest *(v1.12.0)* | green | Jedi crest |

**🎨 Theme presets (v1.12.0).** The top of the Appearance tab has one-click
presets that dress every overlay at once, with the border skin and matching
colors together: **Rebel Alliance, Galactic Empire, Jedi Order, Sith,
Mandalorian, Grogu, First Order, Galactic Republic, Trade Federation, Death
Star, Tatooine**, plus **Default look** to put everything back. Tweak any color
afterwards, and the preset simply stops being highlighted. Your saved skins
carry over from earlier versions.

Defaults: Jedi for 🎯 Upcoming RB Req's (the HUD), Grogu for ♻ Safe to
Retire, Mandalorian for 🧬 Rebirth Requirements, Rebel for 🔮 Sneak Preview,
Tatooine for ⚡ Optimal Crit Guide. Applies live — no restart needed.

Every emblem is vector art (SVG), never a bitmap, specifically so it scales
cleanly to each overlay's own shape (the wide HUD, the narrow tall lists)
with no distortion or 9-slicing needed — a fixed-aspect image would have
squashed badly on the narrower overlays. Bounty Hunter, Tatooine and Grogu
are hand-drawn; the faction insignia come from Font Awesome (see Credits). Border
skins are per overlay window; the tracker window itself has its own **App look**
since v1.15.0 (see above), which an overlay preset can switch to match.

**🎨 Per-overlay saber colors (v1.9.0/v1.9.1, superseded above).** The
original version of this picker offered six flat colors (blue, green,
purple, red, yellow, orange) instead of illustrated borders. Kept here for
the changelog record; every overlay now uses the border-skin system above
instead, and the settings keys were renamed to match (`color` → `border`,
`declutterColor` → `declutterBorder`, and so on) — an existing install just
picks fresh border defaults on upgrade, same as any other new setting.

**v1.9.1 hotfix.** v1.9.0 shipped a regression: clicking **Apply** on the
Read Rebirth Screen confirm dialog silently did nothing (a shared function,
`cycleCoveredCount()`, gained a required parameter and one call site outside
tracker.html's own script — in `rebirth-screen-read.js` — never got updated
to pass it, so the click handler threw immediately). Fixed, and a new test
now checks every call site of every shared `requirements.js` function passes
the right number of arguments, specifically to catch this class of bug
project-wide instead of only inside tracker.html.

## 🚫 Hide All Overlays (one-way — never toggles back on)

Every other hotkey in this app toggles its own overlay on and off. This one
is the deliberate exception: **Ctrl+Shift+1** by default, and it only ever
turns things **off** — the main HUD, the timers banner, the Safe to Retire list,
the Rebirth Requirements overlay, the Sneak Preview, the Crit Guide, the Spawn
Alert and the hotkey reference card below, all at once. Pressing it again does nothing; each overlay only comes back when
you show it again yourself, individually, the same way you always would
(its own hotkey or toolbar button).

It exists for one specific moment: taking a screenshot or sharing your
screen without every overlay showing up in it and prompting questions. Hit
it right before, take the picture, then bring back whatever you actually
want on screen again afterward.

## ⌨ Hotkey reference list

A small card listing every hotkey currently bound, centered on screen. Show or
hide it with the **⌨ Hotkey list** tile in the toolbar (or its own hotkey, once you
set one). Since v1.16.0 it no longer pops up on every launch: the tutorial shows
where to set your keys instead. Unlike the HUD and timer banners, it isn't
draggable — it's meant to be a brief reference, so it always reopens centered.
(Hide All Overlays hides this card too, but doesn't have its own on/off state to
toggle back — see above.)

**v1.10.10:** the card now lists the 🎯/🧬 mark & navigate hotkeys and the
🔒 Lock/unlock all keybinds hotkey when they're bound — before, the card
was sized for them but left a blank gap where they should have been.

It reads its rows live from **⚙ Overlay Settings**, so if you rebind any
hotkey there, the list updates immediately without a restart. Only hotkeys
that are actually bound are listed — the optional ones (scroll and tier
hotkeys) show up here once you set them.

All hotkeys work even while Fortnite has focus. **Since v1.16.0 a new install starts
with no hotkeys set**: pick your own in **⚙ Overlay Settings → Keybinds** (the tutorial
opens it for you). An install from before v1.16.0 keeps the keys it already had; the
old defaults are in the last column.

| Hotkey | Action | Default before v1.16.0 |
|---|---|---|
| Hide All Overlays | Turns every overlay off — one-way only, never toggles back on | `Ctrl+Shift+1` |
| Toggle Current Rebirth Requirements | Show/hide the rebirth-requirements HUD | `Ctrl+Shift+3` |
| Toggle Timers | Show/hide the Stellar/Mythic/Kyber/Mission banners | `Alt+Shift+T` |
| Toggle Hotkey List | Show/hide this reference card | `Ctrl+Shift+2` |
| Toggle Safe to Retire List | Show/hide the ♻ Safe to Retire droid list | `Ctrl+Shift+4` |
| Toggle Rebirth Requirements | Show/hide the 🧬 still-needed overlay | `Ctrl+Shift+5` |
| Trigger Read Rebirth Screen | Fires the 📸 Read Rebirth Screen button | `Ctrl+Shift+6` |
| Switch You / Friends (v1.16.0) | Flips the 🎯 HUD between your list and each 👥 friend's | *(unbound)* |
| Toggle Sneak Preview | Show/hide the 🔮 next-cycle Mythic overlay | *(unbound — set in ⚙ Overlay Settings)* |
| Toggle Optimal Crit Guide | Show/hide the ⚡ crystal-spend order overlay | *(unbound — set in ⚙ Overlay Settings)* |
| Scroll List: Up / Down | Pages whichever of the ♻ Safe to Retire / 🧬 Rebirth Requirements lists is open, one screen at a time — one shared pair, not one per overlay | *(unbound)* |
| Scroll Sneak Preview Up / Down | Same, for the Sneak Preview overlay | *(unbound)* |
| Scroll Crit Guide Up / Down | Same, for the Optimal Crit Guide overlay | *(unbound)* |
| Turn Spawn Alert On / Off | Starts/stops 📡 Spawn Alert watching the game's droid-spawn lines | *(unbound)* |
| Tier Filter: Toggle All Tiers | Shows all five rarity tiers if any is hidden, otherwise hides all — in both Safe to Retire and Rebirth Requirements | *(unbound)* |
| Tier Filter: Toggle Default / Rare / Epic / Legendary / Mythic | Show or hide that one tier in both the Safe to Retire and Rebirth Requirements overlays | *(unbound, one each)* |
| Switch Mark Keys to the Next Open List | With two or more of 🧬 Rebirth Requirements / ♻ Safe to Retire / 🔮 Sneak Preview open, moves the mark & navigate keys to the next one (v1.11.1) | *(unbound)* |
| Read Rebirth Screen: Apply / Cancel | Accept the rank it just read, or close the reader without changing anything (v1.11.1) | *(unbound, one each)* |

Unbound hotkeys have no key combo until you set one; they only appear on the on-screen hotkey list once you have.

The read-button hotkey doesn't do anything new under the hood — pressing it
just clicks the real toolbar button for you, so the exact same
screen-capture-and-confirm flow runs either way; nothing about what gets
read or written changes based on how you triggered it.

## ⚙ Overlay Settings: the holo-console (v1.7.6)

The settings panel is now a Star Wars-style ship console with five tabs down
the left side. The active tab is marked by a lightsaber blade that ignites
out of a small hilt, each tab with its own blade color:

- **⌨ Keybinds** (blue): every hotkey, grouped into Quick actions, Show/hide
  overlays, List scrolling and Tier filter. There's a search box that matches
  names, descriptions and current key combos. Unbound hotkeys show as dashed
  keys, and the tab shows how many are bound, like `7/21`.
- **🧭 Layout** (green): the snap / match-size switches (v1.11.1), then one
  card per overlay with its 🎯 Drag into place and ↺ Reset buttons. The HUD's
  card also holds its opacity slider.
- **🎨 Appearance** (red; **🛡 Borders** until v1.11.1): the overlay colors,
  then one row per overlay with seven illustrated border skins — see
  **🛡 Overlay Borders** above.
- **🔎 Filters** (purple): the shared tier filter for Safe to Retire and
  Rebirth Requirements.
- **⏱ Timers** (yellow): banner shape and size (v1.11.1), the mission-timer
  sync, sounds, plus a readout of every banner's schedule.

The app remembers which tab you had open. The console is translucent, so a
custom 🖼 Background still shows through it. Every control works exactly as
it did before; only the layout changed.

The in-game overlays (the HUD, Safe to Retire, Rebirth Requirements, Sneak
Preview and Optimal Crit Guide) got a matching light touch from `sw-texture.css`:
targeting-computer corner brackets, faint hull-plate seams and scanlines.
It only adds art on top. Each overlay's see-through tint, including the
HUD's opacity setting, is unchanged. To drop the look from one overlay,
delete the `sw-texture.css` link from its HTML file.

## Visual polish pass (v1.8.0)

Functionality was stable, so this pass is styling only — no droid data, ownership
logic, or hotkeys changed. Everything below extends the holo-console look from the
v1.7.6 settings panel to the rest of the app:

- **Overlay typography.** The four in-game overlays (HUD, Safe to Retire, Rebirth
  Requirements, Sneak Preview) now use the same Rajdhani/IBM Plex Mono pairing as
  the tracker window instead of the system font.
- **Fade-in on refresh.** Cards and HUD level blocks ease in instead of popping in
  instantly when a droid gets logged or you switch levels. Honors "reduce motion."
- **Command Console toolbar.** The tracker's main button row is now a holo-console
  surface (same corner brackets and scanlines as ⚙ Overlay Settings), with the ~24
  buttons grouped into five labeled rows — Find, Rebirth Lvl, Tools, Overlays, Data
  — instead of one unsorted wall.
- **Rebirth Requirements panel** got the same holo surface, and its rarity-tier
  headers (Base, Gold, Diamond…) now have a fading divider line like the keybind
  groups in ⚙ Overlay Settings.
- **Header polish.** The sticky rarity legend and the "droids maxed" counter sit in
  a subtle blue-tinted holo chip instead of a flat background.
- The screen-capture calibration box and the first-launch guide dialog got the
  same holo border/background treatment.
- The droid list itself (the rows you click to log ownership) was deliberately
  left alone — it's the busiest surface in the app, and the plain background
  keeps it easy to scan.

**Command Console layout fix (v1.8.1).** Each toolbar row is now two columns —
a fixed-width label and a separate button strip next to it — instead of one
flat row. Buttons that don't fit wrap to a second line *within that button
column*, lined up under the first button, rather than falling back to the
left edge under the row's own label. Small buttons (Pop out, ↺, Guide, Reset
all) also moved to the front of their row so a lone button doesn't get
stranded alone on an otherwise-empty wrapped line.

## Quality-of-life additions

A few small fixes aimed at specific rough edges that came up while building
and testing everything above:

- **Crash-safe saving (v1.7.6).** Progress used to be written straight into
  the save file, so a crash or power cut mid-save could leave it empty and
  the next launch would start with no progress. Saves now go to a temporary
  file first and replace the real one in a single step, so the save file is
  always either the old version or the new one. The previous good save is
  also kept as `droid-tycoon-store.json.bak`. If the main file is ever
  unreadable anyway, the app keeps a copy of the broken file and loads the
  backup instead of starting empty. The save format itself didn't change.

- **Hide the droid list to jump straight to a panel (v1.6.0).** Press the
  already-active **A–Z** or **By Rebirth Level** button again to turn the
  droid list off (press either to bring it back). With the list off, an open
  **🧬 Reqs panel** takes the full width instead of sitting below or
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
- Each block's header shows the level and, on the right, the credits that
  rebirth costs (v1.15.1).
- Each block shows a level tag and its 3 required droids as portrait cards
  (redesigned 2026-09-20 to match the ♻ Safe to Retire list's look), framed in
  the color of the rarity that level needs. A droid already covered by
  something you own elsewhere shows dimmed with a strikethrough — still
  listed (so you know it's required), just flagged as already handled.
- The overlay is click-through by default — your clicks always reach the
  game, never the HUD. Only reposition mode is briefly interactive.

## Credits

- Faction insignia on the border skins (Rebel, Empire, Jedi, Mandalorian, Sith,
  First Order, Galactic Republic, Old Republic, Galactic Senate, Trade Federation,
  Jedi Crest): [Font Awesome Free](https://fontawesome.com) by Fonticons, Inc.,
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), used as SVG paths.
- Death Star emblem: [Material Design Icons](https://pictogrammers.com/library/mdi/),
  Apache License 2.0.
- Star Wars and its insignia are trademarks of Lucasfilm Ltd. This is an unofficial
  fan-made tool, not affiliated with or endorsed by Lucasfilm, Disney or Epic Games.

## File map

- `main.js` — Electron main process: all eight windows (tracker, HUD,
  timers, Declutter list, Rebirth Requirements overlay, Sneak Preview,
  Optimal Crit Guide, hotkey list), the shared JSON store, the twenty-one global hotkeys (registered together at
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
- `persistence.js` — crash-safe `loadJson` / `saveJsonNow` used by
  `main.js` for the store and settings files (temp file + rename, `.bak`
  of the last good save, recovery from it). Tested in
  `test/persistence.test.js`.
- `settings-tabs.js` — tab switching, keybind search and the bound-count
  badge for the ⚙ Overlay Settings console. Layout only; every control is
  still wired by `overlay-controls.js` through its original id.
- `sw-texture.css` — the holo-console surface art linked into overlay.html,
  declutter.html, rebirth-requirements-overlay.html, sneak-preview.html and
  crit-guide-overlay.html.
- `preload.js` — the only bridge between the pages and Node/IPC.
- `overlay-theme.css` / `overlay-theme.js` — the droid overlays' shared look:
  theme colors, the corner resize grip and zoom, and the ⌨ KEYS mark-key tag.
- `overlay-drag.js` / `overlay-snap.js` — moving overlays (always wholly on one
  monitor) and the snap / match-size math.
- `game-toast.html` — the click-through in-game notice (Read Rebirth Screen results).
- `alert-sound.js` + `sounds/good-news-data.js` — the levelled "Good news, everyone!"
  timer alert.
- `dev/overlay-lab.html` — dev-only Overlay Preview Lab (not in the exe): every
  overlay side by side with fake progress, to try skins, presets and colors.
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
- `crit-guide-overlay.html` — the ⚡ Optimal Crit Guide overlay (see its
  section above). Unlike the other four, it's a static reference: the
  purchase-order data is hardcoded for one specific build, so it doesn't
  read ownership/cycle progress at all — droid-data.js/requirements.js are
  only loaded for `BORDER_SKINS`/`borderIconSvg`, same as every other
  overlay's script list.
- `spawn-alert.html` + `spawn-parse.js` (v1.14.0) — the 📡 Spawn Alert. The page
  captures the screen, cleans up the game's feed box and runs text recognition on it;
  `spawn-parse.js` decides which lines are droid spawns and which are new (tested
  against a real 90-second capture in `test/fixtures/spawn-feed-ocr.json`).
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
  overlay's data), and (v1.10.0) `BORDER_SKINS`/`BORDER_SKIN_ORDER`/
  `borderIconSvg` — the seven illustrated border skins every overlay picks
  from in ⚙ Overlay Settings → Borders (replaces the old flat
  `SABER_COLORS`). As of v1.7.5 this is the only copy: tracker.html loads
  it too instead of keeping its own duplicates, which is what let the
  v1.7.2-v1.7.4 bugs happen. Change logic here and run `npm test`.
- `test/` — `npm test` (Node's built-in runner, no extra dependencies).
  `requirements.test.js` pins the requirement logic against the real cycle
  data; `pages.test.js` fails if any page's scripts would collide or
  redefine a shared function. Not packaged into the .exe.
- `CLAUDE.md` — working notes for Claude sessions. Not packaged.
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
  Hidden on launch since v1.16.0; toggled via the ⌨ Hotkey list tile or its own
  hotkey (unbound on new installs).
- `declutter.html` — the "safe to retire" droid list (every tier); the
  which-droids logic lives in `requirements.js`'s `getDeclutterList`, this
  file handles rendering, the tier filter (read from the `declutterShow*`
  settings), and the hotkey-driven scroll viewport, plus the same live
  store-driven update pattern every other window here already uses. Shown/hidden by `main.js` via the ♻
  Safe to Retire tile or its own hotkey (`Ctrl+Shift+4` by default).
