'use strict';
/* ---------------------------------------------------------------------------
   One-time first-launch walkthrough: a short, skippable tour of the app's
   tools. Shown automatically the first time the app runs (gated by
   settings.hasSeenIntroGuide, see DEFAULT_SETTINGS in main.js) and reachable
   again anytime via the ❔ Guide toolbar button. Electron-only, same as
   overlay-controls.js — the plain-browser tracker just never unhides the
   button or shows the overlay, since window.overlayAPI doesn't exist there.

   Skip and Done behave identically on purpose: both are "I'm done with
   this," so either one marks hasSeenIntroGuide true and it won't pop up
   again on its own. Skip is available on every step (not just the first)
   so changing your mind mid-tour doesn't mean clicking through the rest.
--------------------------------------------------------------------------- */
(function(){
  if(!window.overlayAPI) return; // not in Electron — no guide button to wire up

  const GUIDE_STEPS = [
    {
      title: "Welcome to Fuzzy's Droid Tracker",
      body: `
        <p>A quick tour of the tools before you dive in — about a minute, and you can skip it below any time. Recommended if this is your first time here, but nothing in it is required reading.</p>
      `
    },
    {
      title: 'Two ways to see what you need',
      body: `
        <p><span class="guide-tag new">NEWER PLAYERS</span><b>🎯 Upcoming RB Req's</b> — a small in-game overlay showing just your current rebirth level and the next 3. Turn it on, keep playing, and it tells you what to grab next without leaving the game.</p>
        <p><span class="guide-tag vet">KNOW THE GAME</span><b>🧬 Rebirth Reqs</b> — a full panel (or its own in-game overlay) listing everything the active cycle still needs, all at once. Better once you already know the droid pool and just want the complete checklist.</p>
      `
    },
    {
      title: 'Tell it your rebirth level',
      body: `
        <p>The overlay needs to know your current level. Two ways — pick whichever's easiest, and you can switch anytime:</p>
        <p><b>Manual</b> — the Rebirth Lvl −/+ control in the toolbar. Always available, one click per rebirth.</p>
        <p><b>📸 Read Rebirth Screen</b> — open the in-game Rebirth menu and read it in one shot. It also catches you up in bulk: it marks every droid at the levels you've passed as owned, not just the level number.</p>
        <p>First time you use Read Rebirth Screen, you'll draw a box around just the number after "Rank" — not the icon, not the glow around it, just the digits. A loose or wrong box is the #1 reason a reading comes out wrong. You only draw it once; it's remembered after that.</p>
      `
    },
    {
      title: 'More overlays, if you want them',
      body: `
        <p><b>⏱ Timers</b> — countdowns to the Stellar/Mythic/Galactic Blueprints and the next Mission.</p>
        <p><b>♻ Declutter</b> — Legendary/Mythic droids you're already holding that this cycle will never ask for again, safe to sell.</p>
        <p>Every overlay drags into position from <b>⚙ Overlay Settings</b>, and <b>Ctrl+Shift+1</b> hides all of them at once for a clean screenshot.</p>
      `
    },
    {
      title: "You're set",
      body: `
        <p>A full hotkey list pops up on every launch — toggle it with <b>⌨ Hotkeys</b>.</p>
        <p>Come back to this tour anytime with the <b>❔ Guide</b> button in the toolbar.</p>
      `
    }
  ];

  const overlay = document.getElementById('guideOverlay');
  if(!overlay) return;
  const progressEl = document.getElementById('guideProgress');
  const titleEl = document.getElementById('guideStepTitle');
  const bodyEl = document.getElementById('guideStepBody');
  const skipBtn = document.getElementById('guideSkipBtn');
  const backBtn = document.getElementById('guideBackBtn');
  const nextBtn = document.getElementById('guideNextBtn');
  const openBtn = document.getElementById('guideOpenBtn');

  let stepIndex = 0;

  function render(){
    const step = GUIDE_STEPS[stepIndex];
    progressEl.textContent = 'STEP ' + (stepIndex + 1) + ' OF ' + GUIDE_STEPS.length;
    titleEl.textContent = step.title;
    bodyEl.innerHTML = step.body;
    backBtn.hidden = stepIndex === 0;
    nextBtn.textContent = stepIndex === GUIDE_STEPS.length - 1 ? 'Done' : 'Next →';
  }

  function open(){
    stepIndex = 0;
    render();
    overlay.hidden = false;
  }

  function close(){
    overlay.hidden = true;
  }

  // Skip and "Done" (Next on the last step) both land here — see file header.
  function finish(){
    close();
    window.overlayAPI.setSettings({ hasSeenIntroGuide: true });
  }

  skipBtn.addEventListener('click', finish);
  backBtn.addEventListener('click', ()=>{
    if(stepIndex > 0){ stepIndex--; render(); }
  });
  nextBtn.addEventListener('click', ()=>{
    if(stepIndex < GUIDE_STEPS.length - 1){ stepIndex++; render(); }
    else finish();
  });

  if(openBtn){
    openBtn.hidden = false;
    openBtn.addEventListener('click', open); // replaying later never touches hasSeenIntroGuide's stored value
  }

  (async ()=>{
    const settings = await window.overlayAPI.getSettings();
    if(!settings.hasSeenIntroGuide) open();
  })();
})();
