'use strict';
/* ---------------------------------------------------------------------------
   READ REBIRTH SCREEN (one-shot screen capture + digit OCR)

   The in-game Rebirth menu shows "REBIRTH Rank N" in large, high-contrast
   text — a much easier OCR target than the tiny always-on HUD badge that
   rebirth-level-detect.js watches. Since that menu only appears when the
   player deliberately opens it, this is a ONE-SHOT read, not a continuous
   watcher: grab a single frame, read the number, let the user confirm or
   correct it, then bulk-mark every droid for the now-completed levels as
   owned and set the current level — a single screen read catches the whole
   log up at once, which is the actual fix for "I'm sometimes late logging
   droids as I get them."

   The box you draw around the "Rank N" number is saved (as fractions of the
   captured screen's width/height, so it survives the "Choose a screen"
   picker mattering less, and reused automatically next time) so this only
   needs drawing once — either the first time ever, or again after "↺"
   /"Box was wrong — redraw" is used, or automatically if the captured
   screen's resolution has changed since the saved box was drawn (a strong
   sign the old coordinates no longer point at the right pixels).

   Independent of Live Detect and Rebirth Level Detect — its own
   getDisplayMedia call, released immediately after the one frame it needs
   (no reason to keep sharing the screen after a one-shot read).

   v1.11.1, reading from in-game without alt-tabbing: main.js remembers the
   screen picked in "Choose a screen" (🖥 Change screen asks again), the
   rebirthScreenApply/Cancel hotkeys answer the confirm step, and while this
   window isn't focused every result is also shown on the game's screen
   (overlayAPI.showGameToast -> game-toast.html).

   Depends on globals from tracker.html's main script: getEl, activeCycle,
   CYCLES, markRowObtained, cycleCoveredCount, maybeOfferCycleReset, storeGet,
   storeSet, showToast; and the Tesseract global from the tesseract.min.js
   script tag loaded earlier.

   The bulk catch-up loop below calls markRowObtained() with skipCycleCheck
   so the cycle-complete popup can't fire mid-loop against a stale cycle
   reference; it does one before/after completion check around the whole
   batch instead. See the comment on that option where markRowObtained is
   defined in tracker.html for why.
--------------------------------------------------------------------------- */
(function(){
  const btn = document.getElementById('rebirthScreenBtn');
  const recalibBtn = document.getElementById('rebirthScreenRecalibBtn');
  if(!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) return; // stays hidden
  btn.hidden = false;
  if(recalibBtn) recalibBtn.hidden = false;

  // v1.18.1: the crop is scaled to a set HEIGHT, not a fixed x6. Tesseract misread a clean "21"
  // as "217" once the digits were ~230px tall (x6 of a 39px box); on that real crop every height
  // from 50 to 200px read "21". READ_HEIGHT is the middle of that range; a doubtful first read
  // (not a real rank, or under LOW_CONFIDENCE) gets a second one at RETRY_HEIGHT.
  const READ_HEIGHT = 120, RETRY_HEIGHT = 80;
  const REGION_KEY = 'rebirth-screenRegion';

  let stream = null, video = null, region = null;
  let starting = false; // true while a getDisplayMedia()/picker request is in flight
  let confirming = false; // true while readRegion() is in flight, guards double-clicking Confirm
  let worker = null, workerFailed = false;
  let savedRegion = null; // { xFrac, yFrac, wFrac, hFrac, videoW, videoH } | null
  let session = 0;          // bumped by closeAll(), so a read still in flight when the reader is closed is dropped
  let pendingCycle = null;  // the cycle the open confirm step applies to
  let applying = false;     // guards a double Apply (button + hotkey)

  (async ()=>{
    savedRegion = (await storeGet(REGION_KEY)) || null;
  })();

  const api = window.overlayAPI || null; // null in the plain-browser tracker
  // The tracker isn't the focused window: the player is in the game, so the
  // dialog here can't be seen and results go to the in-game notice too.
  function inGame(){ return !!api && !document.hasFocus(); }
  function gameToast(msg){ if(api && api.showGameToast) api.showGameToast(msg); }
  async function appSettings(){
    try{ return (api && await api.getSettings()) || {}; }catch(e){ return {}; }
  }
  function keyHint(s){
    const a = s.rebirthScreenApplyHotkey, c = s.rebirthScreenCancelHotkey;
    if(a && c) return a + ' = apply · ' + c + ' = cancel';
    if(a) return a + ' = apply · alt-tab to cancel';
    if(c) return c + ' = cancel · alt-tab to apply';
    return 'Alt-tab to apply, or bind Apply/Cancel keys in ⚙ Keybinds.';
  }
  // 🖥 Change screen: only shown once a screen has been picked (multi-monitor).
  function showScreenControls(s){
    const name = s.captureScreenName || '';
    ['rsChangeScreen', 'rsCalibChangeScreen'].forEach(id => { const b = getEl(id); if(b){ b.hidden = !name; b.title = name ? 'Reading ' + name + '. Pick a different screen (it\'s remembered).' : ''; } });
    const label = getEl('rsScreenName'); if(label) label.textContent = name ? ' on ' + name : '';
  }

  async function ensureWorker(){
    if(worker || workerFailed) return worker;
    if(typeof Tesseract === 'undefined'){ workerFailed = true; return null; }
    try{
      worker = await Tesseract.createWorker('eng');
      // No digit whitelist: a box that includes the word "Rank" would get its
      // letters coerced into look-alike digits. parseRankText() (requirements.js) picks the number.
      await worker.setParameters({ tessedit_pageseg_mode: '7' });
      return worker;
    }catch(e){
      workerFailed = true;
      return null;
    }
  }

  async function start(force){
    // A Cancel (closeAll bumps `session`) can land while the picker or the
    // capture is still starting; every await below re-checks it.
    const mine = session;
    let s;
    try{
      s = await navigator.mediaDevices.getDisplayMedia({ video:{ cursor:'never' }, audio:false });
    }catch(err){
      if(mine !== session) return;
      // Closing "Choose a screen" is a choice, not a failure (a saved screen stays saved).
      if(err && err.name === 'AbortError'){ showToast('Screen picker closed — nothing was read.'); return; }
      // Not alert(): from a hotkey the player is in-game, and a blocked alert
      // would also stall the Apply/Cancel hotkeys until someone alt-tabbed.
      showToast("Couldn't start screen sharing (" + err.message + ").");
      if(inGame()) gameToast({ title: '📸 Screen capture didn\'t start', sub: err.message, tone: 'warn', ms: 6000 });
      return;
    }
    if(mine !== session){ s.getTracks().forEach(t=>t.stop()); return; }
    stream = s;
    const v = document.createElement('video');
    video = v;
    v.srcObject = s;
    v.muted = true;
    await v.play();
    if(!v.videoWidth){
      await new Promise(res=>{ v.addEventListener('loadedmetadata', res, {once:true}); });
    }
    if(mine !== session) return; // closeAll() already stopped the share
    // Unlike rebirth-level-detect.js's continuous watcher, this flow can
    // still be sitting in the calibration UI for a while before the stream
    // is released — if the user stops sharing externally (the OS/browser
    // "Stop sharing" control) during that window, this cleans up instead
    // of leaving a dead video feed drawn into the calibration canvas with
    // no way out but closing the app.
    stream.getVideoTracks()[0].addEventListener('ended', closeAll);

    const canUseSaved = !force && savedRegion &&
      savedRegion.videoW === video.videoWidth && savedRegion.videoH === video.videoHeight;

    if(canUseSaved){
      region = {
        x: savedRegion.xFrac * video.videoWidth,
        y: savedRegion.yFrac * video.videoHeight,
        w: savedRegion.wFrac * video.videoWidth,
        h: savedRegion.hFrac * video.videoHeight
      };
      getEl('rsCalibOverlay').style.display = 'flex';
      getEl('rsCalibCanvasWrap').style.display = 'none';
      getEl('rsConfirmStep').style.display = 'none';
      await readRegion(mine);
    } else {
      if(!force && savedRegion){
        // Had a saved box, but this capture's resolution doesn't match it —
        // likely a different screen or a resolution change. Safer to redraw
        // than to OCR the wrong pixels.
        showToast('Screen resolution changed since your last box — redraw it once.');
      }
      openCalibration();
      if(inGame()) gameToast({ title: '📸 Draw the Rank box once in the app', sub: 'New screen or resolution: alt-tab and box the number after "Rank". After that it reads from in-game.', tone: 'warn', ms: 9000 });
    }
  }

  function stopSharing(){
    if(stream){ stream.getTracks().forEach(t=>t.stop()); stream = null; }
    video = null;
  }

  function closeAll(){
    session++;
    stopSharing();
    const overlay = getEl('rsCalibOverlay'); if(overlay) overlay.style.display = 'none';
    const confirmStep = getEl('rsConfirmStep'); if(confirmStep) confirmStep.style.display = 'none';
    const canvasWrap = getEl('rsCalibCanvasWrap'); if(canvasWrap) canvasWrap.style.display = '';
  }

  function openCalibration(){
    getEl('rsCalibOverlay').style.display = 'flex';
    getEl('rsConfirmStep').style.display = 'none';
    getEl('rsCalibCanvasWrap').style.display = '';
    getEl('rsCalibStep1').textContent = 'Make sure the Rebirth menu is open on screen right now.';
    const canvas = getEl('rsCalibCanvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    let selStart = null, sel = null;

    function redraw(){
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if(sel){
        ctx.lineWidth = Math.max(2, canvas.width/400);
        ctx.strokeStyle = '#f2b95e';
        ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
        ctx.fillStyle = 'rgba(242,185,94,0.15)';
        ctx.fillRect(sel.x, sel.y, sel.w, sel.h);
      }
    }
    function coordsFromEvent(e){
      const r = canvas.getBoundingClientRect();
      return { x:(e.clientX-r.left)*(canvas.width/r.width), y:(e.clientY-r.top)*(canvas.height/r.height) };
    }
    function refreshInfo(){
      getEl('rsCalibRegionInfo').textContent = sel ? 'box set' : 'draw a box around the number';
      getEl('rsCalibConfirm').disabled = !sel;
    }

    canvas.onmousedown = e=>{ selStart = coordsFromEvent(e); };
    canvas.onmousemove = e=>{
      if(!selStart) return;
      const c = coordsFromEvent(e);
      sel = { x:Math.min(selStart.x,c.x), y:Math.min(selStart.y,c.y), w:Math.abs(c.x-selStart.x), h:Math.abs(c.y-selStart.y) };
      redraw();
    };
    canvas.onmouseup = ()=>{
      if(sel && (sel.w < 6 || sel.h < 6)) sel = null;
      selStart = null;
      redraw(); refreshInfo();
    };
    getEl('rsCalibRedo').onclick = ()=>{ sel = null; redraw(); refreshInfo(); };
    getEl('rsCalibCancel').onclick = closeAll;
    getEl('rsCalibChangeScreen').onclick = changeScreen; // the wrong screen is a common reason to land here
    appSettings().then(showScreenControls);
    getEl('rsCalibConfirm').onclick = async ()=>{
      // Guards a double-click racing two concurrent readRegion() calls: both
      // would see ensureWorker()'s `worker` as still null and each create
      // their own Tesseract worker (orphaning one, since it's never
      // terminated either way), and both would touch the shared `video` var
      // — one call's stopSharing() setting it null while the other is still
      // mid-drawImage() on it.
      if(confirming) return;
      confirming = true;
      try{
        region = sel;
        savedRegion = {
          xFrac: sel.x / canvas.width,
          yFrac: sel.y / canvas.height,
          wFrac: sel.w / canvas.width,
          hFrac: sel.h / canvas.height,
          videoW: canvas.width,
          videoH: canvas.height
        };
        await storeSet(REGION_KEY, savedRegion);
        await readRegion(session);
      } finally{ confirming = false; }
    };

    video.requestVideoFrameCallback ? video.requestVideoFrameCallback(()=>{ redraw(); refreshInfo(); }) : (()=>{ redraw(); refreshInfo(); })();
  }

  async function readRegion(mine){
    getEl('rsCalibStep1').textContent = 'Reading…';
    const w = Math.max(1, Math.round(region.w));
    const h = Math.max(1, Math.round(region.h));
    const crop = document.createElement('canvas');
    crop.width = w; crop.height = h;
    crop.getContext('2d').drawImage(video, region.x, region.y, w, h, 0, 0, w, h);

    // The crop scaled to `height` px tall, as black-on-white PNG data.
    function prepared(height){
      const scale = Math.max(0.5, Math.min(8, height / h));
      const big = document.createElement('canvas');
      big.width = Math.max(1, Math.round(w * scale)); big.height = Math.max(1, Math.round(h * scale));
      const bctx = big.getContext('2d');
      bctx.imageSmoothingEnabled = true;
      bctx.drawImage(crop, 0, 0, big.width, big.height);
      // Only near-white pixels count as text (the Rank label is white); the
      // green glow/particles and Fortnite's faint stats overlay behind it fail
      // min(r,g,b) and drop out. Drawn black-on-white, which Tesseract reads best.
      try{
        const img = bctx.getImageData(0,0,big.width,big.height);
        const d = img.data;
        for(let i=0;i<d.length;i+=4){
          const v = Math.min(d[i], d[i+1], d[i+2]) > 170 ? 0 : 255;
          d[i]=d[i+1]=d[i+2]=v;
        }
        bctx.putImageData(img, 0, 0);
      }catch(e){ /* still fine without the threshold pass */ }
      return big.toDataURL('image/png');
    }
    const readImage = prepared(READ_HEIGHT);
    const retryImage = prepared(RETRY_HEIGHT);

    stopSharing(); // one frame is all this needs — release the share right away

    const cycle = (typeof activeCycle !== 'undefined' && activeCycle) ? activeCycle : 1;
    const maxLevel = CYCLES[cycle] ? cycleRealLevelCount(cycle) : 40;
    const w2 = await ensureWorker();
    let guess = null, text = '', confidence = 0;
    async function ocr(image){
      const result = await w2.recognize(image);
      const t = ((result && result.data && result.data.text) || '').trim();
      return { text: t, confidence: (result && result.data && result.data.confidence) || 0, guess: parseRankText(t, maxLevel) };
    }
    if(w2){
      try{
        let best = await ocr(readImage);
        if(best.guess === null || best.confidence < LOW_CONFIDENCE){
          const again = await ocr(retryImage); // v1.18.1: a second look at another size
          if(again.guess !== null && (best.guess === null || again.confidence > best.confidence)) best = again;
        }
        ({ text, confidence, guess } = best);
      }catch(e){ /* falls through to manual entry below */ }
    }
    if(mine !== session) return; // cancelled (or restarted) while reading
    // Not awaited: the read is done once the dialog is up, so 🖥 Change screen
    // (which waits for no read to be starting) works straight away.
    showConfirm(guess, { image: readImage, text, confidence });
  }

  // "Rank 2" -> 2: parseRankText() in requirements.js (v1.18.1, tested in test/rank-read.test.js).

  const LOW_CONFIDENCE = 70;

  async function showConfirm(guess, read){
    read = read || {};
    const unsure = guess === null || read.confidence < LOW_CONFIDENCE;
    getEl('rsCalibStep1').textContent = 'Check the number, then Apply.';
    const preview = getEl('rsReadPreview');
    if(read.image){ preview.src = read.image; preview.style.display = ''; } else { preview.style.display = 'none'; }
    getEl('rsReadText').textContent = read.text
      ? 'Read "' + read.text + '" (' + Math.round(read.confidence) + '% sure)' + (unsure ? ' — not sure, check the number below.' : '')
      : 'Couldn\'t read any text in the box — enter the rank below or redraw the box.';
    getEl('rsReadText').classList.toggle('rs-unsure', unsure);
    getEl('rsCalibCanvasWrap').style.display = 'none';
    getEl('rsConfirmStep').style.display = 'block';
    const cycle = (typeof activeCycle !== 'undefined' && activeCycle) ? activeCycle : 1;
    getEl('rsDetectedRank').textContent = (guess !== null) ? guess : '?';
    getEl('rsConfirmCycleLabel').textContent = 'Cycle ' + cycle;

    const input = getEl('rsManualRank');
    const maxLevel = CYCLES[cycle] ? cycleRealLevelCount(cycle) : 40;
    input.value = (guess && guess >= 1 && guess <= maxLevel) ? guess : '';

    function updateThroughLabels(){
      const n = parseInt(input.value, 10);
      const through = (n && n >= 1) ? (n - 1) : '?';
      getEl('rsThroughLevel').textContent = through;
      getEl('rsThroughLevel2').textContent = through;
    }
    input.oninput = updateThroughLabels;
    updateThroughLabels();

    pendingCycle = cycle;
    getEl('rsCancelApply').onclick = closeAll;
    getEl('rsRecalib').onclick = ()=>{ closeAll(); start(true); };
    getEl('rsChangeScreen').onclick = changeScreen;
    getEl('rsApply').onclick = ()=> applyInput(false);

    const mine = session;
    const s = await appSettings();
    if(mine !== session) return; // cancelled meanwhile
    showScreenControls(s);
    if(inGame()){
      const value = parseInt(input.value, 10);
      if(value){
        gameToast({
          title: '📸 Rank ' + value + (unsure ? '?' : '') + ' · Cycle ' + cycle,
          sub: (unsure ? 'Not sure (' + Math.round(read.confidence) + '%) — check it. ' : 'Marks rebirths 1–' + (value - 1) + ' done. ') + keyHint(s),
          tone: unsure ? 'warn' : 'info', ms: 12000
        });
      } else {
        gameToast({
          title: '📸 Couldn\'t read the rank',
          sub: 'Alt-tab to type it in or redraw the box.' + (s.rebirthScreenCancelHotkey ? ' ' + s.rebirthScreenCancelHotkey + ' = cancel.' : ''),
          tone: 'warn', ms: 10000
        });
      }
    }
  }

  function readerOpen(){ const o = getEl('rsCalibOverlay'); return !!o && o.style.display !== 'none'; }
  function confirmOpen(){ return readerOpen() && getEl('rsConfirmStep').style.display === 'block'; }

  // Apply button (fromHotkey false) or the rebirthScreenApply hotkey (true).
  async function applyInput(fromHotkey){
    if(applying || !confirmOpen()) return;
    const cycle = pendingCycle;
    const n = parseInt(getEl('rsManualRank').value, 10);
    const maxLevel = CYCLES[cycle] ? cycleRealLevelCount(cycle) : 40;
    if(!n || n < 1 || n > maxLevel){
      if(fromHotkey) gameToast({ title: '📸 No rank to apply yet', sub: 'Alt-tab and type the rank (1–' + maxLevel + ') in the reader.', tone: 'warn', ms: 6000 });
      else alert('Enter a level between 1 and ' + maxLevel + '.');
      return;
    }
    applying = true;
    try{
      const through = n - 1;
      // Check cycle completion once for the whole batch, not once per row:
      // markRowObtained() can pop the cycle-complete prompt, whose choices
      // reset ownedRank and may advance activeCycle, and this loop is still
      // awaiting further iterations against its own closed-over `cycle` —
      // letting the popup fire mid-loop would check newly-advanced-cycle
      // completion against leftover writes from the OLD cycle's catch-up.
      // So every iteration skips its own check, and this does one instead,
      // before/after the whole batch, against the same `cycle` throughout.
      const coveredBefore = cycleCoveredCount(cycle, ownedRank);
      for(let level = 1; level <= through; level++){
        await markRowObtained(CYCLES[cycle][level-1], { skipCycleCheck: true });
      }
      await storeSet('rebirth-currentLevel', through);
      showToast('Caught up through rebirth ' + through + ' for Cycle ' + cycle);
      closeAll();
      if(fromHotkey || inGame()){
        // the cycle-complete prompt opens over the tracker window, behind the game
        const done = cycleCoveredCount(cycle, ownedRank) === cycleRealSlotCount(cycle) && coveredBefore !== cycleRealSlotCount(cycle);
        gameToast({
          title: '✓ Caught up through rebirth ' + through,
          sub: 'Cycle ' + cycle + (done ? ' is complete 🎉 alt-tab to choose what\'s next.' : ' · current level set to ' + through + '.'),
          tone: 'ok', ms: done ? 9000 : 4500
        });
      }
      maybeOfferCycleReset(cycle, coveredBefore);
    } finally{ applying = false; }
  }

  // 🖥 Change screen: main.js shows "Choose a screen" on the next capture and
  // saves the new pick; cancelling the picker keeps the old screen.
  async function changeScreen(){
    if(!api || !api.changeCaptureScreen || starting) return;
    await api.changeCaptureScreen();
    closeAll();
    starting = true;
    try{ await start(false); } finally{ starting = false; }
  }

  if(api && api.onHotkeyTriggered){
    api.onHotkeyTriggered((name)=>{
      if(name === 'rebirthScreenApply') applyInput(true);
      else if(name === 'rebirthScreenCancel' && (readerOpen() || starting)){
        closeAll();
        if(inGame()) gameToast({ title: '✕ Rebirth read cancelled', tone: 'info', ms: 2500 });
      }
    });
  }

  // Unlike rebirth-level-detect.js's toggle button, this one has no "click
  // again to stop" state to guard re-entry with — it's a one-shot read, and
  // the custom in-app screen picker doesn't block clicks on this window
  // while it's up, so a second click before the first request resolves
  // would start a second, overlapping capture over the first's.
  btn.addEventListener('click', async ()=>{
    if(starting) return;
    starting = true;
    try{ await start(false); } finally{ starting = false; }
  });
  if(recalibBtn) recalibBtn.addEventListener('click', async ()=>{
    if(starting) return;
    starting = true;
    try{ await start(true); } finally{ starting = false; }
  });
})();
