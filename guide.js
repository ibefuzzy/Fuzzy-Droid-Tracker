'use strict';
/* ---------------------------------------------------------------------------
   The PC app's tutorial (v1.16.0, replaces the old 5-card walkthrough). The
   engine is tour.js (shared with the website tracker); this file only holds
   the app's steps and when to show them.

   - First launch (settings.hasSeenIntroGuide false): a welcome card with
     "Show me around" / "Skip, I'll figure it out", then every step.
   - An update: only the steps whose `since` is newer than
     settings.introGuideVersion ("What's new"). Players from before 1.16.0 have
     hasSeenIntroGuide but no introGuideVersion, so they count as 1.15.1.
   - ❔ Guide replays every step. Skip, Done or Esc all mark the tour seen.
   ADDING A FEATURE: add a step below with since: '<the new version>'. The
   version itself comes from the app (appVersion), so nothing else changes.
   Electron-only: the plain-browser tracker has no window.overlayAPI.
--------------------------------------------------------------------------- */
(function(){
  if(!window.overlayAPI || !window.FDT_TOUR) return;

  const row = id => ()=>{ const el = document.getElementById(id); return el && el.closest('.console-row'); };

  const GUIDE_STEPS = [
    {
      since: '1.0.0', target: row('sortToggleWrap'),
      title: 'Log the droids you own',
      body: `<p>Your droid list is under the toolbar. <b>A–Z</b> lists every droid: click its rarity dots to log the best one you have.
        <b>By Rebirth Level</b> shows the 3 droids each rebirth needs: click one to log it.</p>
        <p>Right-click any droid to set an exact rarity. The search box finds one fast.</p>`
    },
    {
      since: '1.0.0', target: row('rlManualToolbar'),
      title: 'Tell it your rebirth',
      body: `<p>Set the rebirth you're on with <b>− / +</b>. Everything else (your in-game list, credit costs, what to sell) follows it.</p>
        <p>Or let it read the game: open the in-game Rebirth menu and press <b>📸 Read Rebirth Screen</b>. It also logs every droid from the rebirths you've passed.
        The first time, you draw a box around just the number after "Rank".</p>`
    },
    {
      since: '1.0.0', target: row('overlayToggleBtn'),
      title: 'Overlays: your lists on top of the game',
      body: `<p>Click a tile to put that list on top of the game; its light shows it's on. The main ones:</p>
        <ul>
          <li><b>🎯 Next Droids Needed</b>: the next 4 rebirth lines you still need droids for, with credit costs and Nova Crystal rewards.</li>
          <li><b>🧬 Rebirth Reqs</b>: every droid this cycle needs.</li>
          <li><b>♻ Safe to Retire</b>: what you can let go of.</li>
          <li><b>⏱ Timers</b> and <b>📡 Spawn Alert</b>: countdowns, and each new spawn shown big.</li>
        </ul>`
    },
    {
      since: '1.16.0',
      title: 'SELL flags: what you can let go',
      body: `<p>Droid pictures on the 🎯 overlay (and in the By Rebirth Level list) get a flag:</p>
        <p><span class="sell-tag yellow" style="margin:0 6px 0 0">SELL</span> never needed again this cycle.</p>
        <p><span class="sell-tag red" style="margin:0 6px 0 0">23</span> you can sell it now; Rebirth 23 needs it again, at a higher rarity (red = rebirths 21–30).</p>
        <p><span class="sell-tag kyber" style="margin:0 6px 0 0">34</span> the same, needed again at Rebirth 31 or later.</p>
        <p>No flag: you'll need it again soon, so keep it.</p>`
    },
    {
      since: '1.16.0', target: '#friendsPanelToggle',
      title: '👥 Friends: see what your friends need',
      body: `<p>Open <b>👥 Friends</b>, type your name and press <b>📋 Copy my code</b>. Paste it to a friend in Discord, and paste theirs into the box to see their
        next rebirths and everything their cycle needs.</p>
        <p>In-game, a hotkey flips your 🎯 overlay to a friend's list and back (set it in ⚙ Overlay Settings → Keybinds). No one to try it with? Paste your own code.</p>`
    },
    {
      // v1.16.0: new installs have no hotkeys bound, so this opens ⚙ Overlay Settings on Keybinds
      since: '1.0.0', target: '#setTab-keys',
      before: ()=>{
        const panel = document.getElementById('overlaySettingsPanel');
        if(panel && panel.hidden) document.getElementById('overlaySettingsBtn').click();
        const tab = document.getElementById('setTab-keys');
        if(tab) tab.click();
      },
      title: 'Set your hotkeys',
      body: `<p>No keys are set at first, so pick your own here in <b>⚙ Overlay Settings → Keybinds</b>: click a key box, then press the keys you want.
        Hotkeys work while you're in the game, so you never have to alt-tab.</p>
        <p>The other tabs place your overlays, pick borders and colors, and set sounds.</p>`
    },
    {
      // v1.17.0: opens ⚙ Overlay Settings on Appearance, where the switch lives
      since: '1.17.0', target: '#rarityStyleRow',
      before: ()=>{
        const panel = document.getElementById('overlaySettingsPanel');
        if(panel && panel.hidden) document.getElementById('overlaySettingsBtn').click();
        const tab = document.getElementById('setTab-borders');
        if(tab) tab.click();
      },
      title: 'Rarity written on each droid',
      body: `<p>On the overlays, the color of a droid's picture frame shows its rarity. If you'd rather read it, pick <b>Written under the name</b>
        (⚙ Overlay Settings → Appearance): the frame turns neutral and the rarity is spelled out in its color, like <b>NEED STELLAR</b>.
        Pick <b>Picture color</b> to go back.</p>`
    },
    {
      // v1.18.0: opens ⚙ Overlay Settings on Appearance, where the presets live
      since: '1.18.0', target: '#appLookGrid',
      before: ()=>{
        const panel = document.getElementById('overlaySettingsPanel');
        if(panel && panel.hidden) document.getElementById('overlaySettingsBtn').click();
        const tab = document.getElementById('setTab-borders');
        if(tab) tab.click();
      },
      title: 'Spooky season looks',
      body: `<p>Three Halloween looks: <b>Force Ghost</b>, <b>Sith Harvest</b> and <b>Nightsister</b>. Pick one here for this window,
        or click its preset below to give every overlay the matching border too.</p>`
    },
    {
      // v1.18.0: opens ⚙ Overlay Settings on Layout, where the switch lives
      since: '1.18.0', target: '#updateCheckCheckbox',
      before: ()=>{
        const panel = document.getElementById('overlaySettingsPanel');
        if(panel && panel.hidden) document.getElementById('overlaySettingsBtn').click();
        const tab = document.getElementById('setTab-layout');
        if(tab) tab.click();
      },
      title: 'New version notice',
      body: `<p>Once a day the app reads one small public file on the website and, if a newer version is out, shows a banner at the top
        with a <b>Download</b> button that opens the releases page. It sends nothing about you and never installs anything.
        Don't want it? Untick this box (⚙ Overlay Settings → Layout).</p>`
    },
    {
      // v1.18.1: opens ⚙ Overlay Settings on Keybinds, at the new 🔄 Cycle keys
      since: '1.18.1', target: '#cycleKeysGroup',
      before: ()=>{
        const panel = document.getElementById('overlaySettingsPanel');
        if(panel && panel.hidden) document.getElementById('overlaySettingsBtn').click();
        const tab = document.getElementById('setTab-keys');
        if(tab) tab.click();
      },
      title: '🎯 Next Droids Needed + cycle keys',
      body: `<p>The HUD is now called <b>🎯 Next Droids Needed</b> and moves on by itself: once every droid of its top line is marked,
        it shows the next line you still need. It never jumps past a line that's missing a droid, and it starts from your rebirth level.</p>
        <p>New keys here: <b>🔄 Next / Previous cycle</b>, <b>🏁 Finish cycle</b> (press it twice) to clear this cycle's marks and start
        the next one without leaving the game, <b>↶ Undo</b> for 10 minutes after, and <b>🔢 Rebirth level +1 / −1</b>.</p>`
    },
    {
      // v1.19.0: opens 👥 Friends at the 🌐 Live switch
      since: '1.19.0', target: '#friendLiveRow',
      before: ()=>{
        const panel = document.getElementById('friendsPanel');
        if(panel && !panel.classList.contains('show')) document.getElementById('friendsPanelToggle').click();
      },
      title: '🌐 Live Friends',
      body: `<p>Switch on <b>🌐 Live</b> and your friend code keeps itself up to date: give friends your short <b>live code</b> once
        (📋 Copy my live code), and their 👥 Friends panel and HUD follow your progress by themselves. Paste a friend's live code to follow them.</p>
        <p>It's <b>off</b> until you switch it on. While on, only your friend code (name, cycle, rebirth, logged droids) is saved, when it changes.
        Switching off deletes it. Snapshot codes still work as before.</p>`
    },
    {
      since: '1.0.0', target: '#guideOpenBtn',
      title: "You're all set",
      body: `<p>Your progress saves by itself as you go.</p>
        <p>Replay this tour any time with <b>❔ Guide</b>. Want your list on your phone too? The website tracker, <b>ibefuzzy.github.io/tracker</b>, works there
        (its progress is kept separately).</p>`
    }
  ];

  const openBtn = document.getElementById('guideOpenBtn');

  async function start(replay){
    const settings = await window.overlayAPI.getSettings();
    const version = (await window.overlayAPI.getAppVersion?.()) || '1.17.0';
    const seen = !settings.hasSeenIntroGuide ? null : (settings.introGuideVersion || '1.15.1');
    FDT_TOUR.run({
      steps: GUIDE_STEPS,
      seenVersion: seen,
      version,
      replay,
      welcome: {
        title: "Welcome to Fuzzy's Droid Tracker",
        body: `<p>It keeps track of the droids you own and shows what each rebirth needs, right on top of the game.</p>
          <p>Want a quick look around first?</p>`,
        replayNote: 'You can take the tour any time from the ❔ Guide button.'
      },
      onDone: ()=> window.overlayAPI.setSettings({ hasSeenIntroGuide: true, introGuideVersion: version })
    });
  }

  if(openBtn){
    openBtn.hidden = false;
    openBtn.addEventListener('click', ()=> start(true));
  }
  // after the tracker's own startup has drawn the toolbar and list
  setTimeout(()=> start(false), 700);
})();
