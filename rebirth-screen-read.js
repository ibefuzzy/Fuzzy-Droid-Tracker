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

  const UPSCALE = 6;
  const REGION_KEY = 'rebirth-screenRegion';

  let stream = null, video = null, region = null;
  let starting = false; // true while a getDisplayMedia()/picker request is in flight
  let worker = null, workerFailed = false;
  let savedRegion = null; // { xFrac, yFrac, wFrac, hFrac, videoW, videoH } | null

  (async ()=>{
    savedRegion = (await storeGet(REGION_KEY)) || null;
  })();

  async function ensureWorker(){
    if(worker || workerFailed) return worker;
    if(typeof Tesseract === 'undefined'){ workerFailed = true; return null; }
    try{
      worker = await Tesseract.createWorker('eng');
      await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '7' });
      return worker;
    }catch(e){
      workerFailed = true;
      return null;
    }
  }

  async function start(force){
    try{
      stream = await navigator.mediaDevices.getDisplayMedia({ video:{ cursor:'never' }, audio:false });
    }catch(err){
      alert("Couldn't start screen sharing (" + err.message + ").");
      return;
    }
    video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    if(!video.videoWidth){
      await new Promise(res=>{ video.addEventListener('loadedmetadata', res, {once:true}); });
    }
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
      await readRegion();
    } else {
      if(!force && savedRegion){
        // Had a saved box, but this capture's resolution doesn't match it —
        // likely a different screen or a resolution change. Safer to redraw
        // than to OCR the wrong pixels.
        showToast('Screen resolution changed since your last box — redraw it once.');
      }
      openCalibration();
    }
  }

  function stopSharing(){
    if(stream){ stream.getTracks().forEach(t=>t.stop()); stream = null; }
    video = null;
  }

  function closeAll(){
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
    getEl('rsCalibConfirm').onclick = async ()=>{
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
      await readRegion();
    };

    video.requestVideoFrameCallback ? video.requestVideoFrameCallback(()=>{ redraw(); refreshInfo(); }) : (()=>{ redraw(); refreshInfo(); })();
  }

  async function readRegion(){
    getEl('rsCalibStep1').textContent = 'Reading…';
    const w = Math.max(1, Math.round(region.w));
    const h = Math.max(1, Math.round(region.h));
    const crop = document.createElement('canvas');
    crop.width = w; crop.height = h;
    crop.getContext('2d').drawImage(video, region.x, region.y, w, h, 0, 0, w, h);

    const big = document.createElement('canvas');
    big.width = w * UPSCALE; big.height = h * UPSCALE;
    const bctx = big.getContext('2d');
    bctx.imageSmoothingEnabled = true;
    bctx.drawImage(crop, 0, 0, big.width, big.height);
    try{
      const img = bctx.getImageData(0,0,big.width,big.height);
      const d = img.data;
      for(let i=0;i<d.length;i+=4){
        const lum = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
        const v = lum > 150 ? 255 : 0;
        d[i]=d[i+1]=d[i+2]=v;
      }
      bctx.putImageData(img, 0, 0);
    }catch(e){ /* still fine without the threshold pass */ }

    stopSharing(); // one frame is all this needs — release the share right away

    const w2 = await ensureWorker();
    let guess = null;
    if(w2){
      try{
        const result = await w2.recognize(big.toDataURL('image/png'));
        const match = ((result && result.data && result.data.text) || '').match(/\d+/);
        if(match) guess = parseInt(match[0], 10);
      }catch(e){ /* falls through to manual entry below */ }
    }
    showConfirm(guess);
  }

  function showConfirm(guess){
    getEl('rsCalibCanvasWrap').style.display = 'none';
    getEl('rsConfirmStep').style.display = 'block';
    const cycle = (typeof activeCycle !== 'undefined' && activeCycle) ? activeCycle : 1;
    getEl('rsDetectedRank').textContent = (guess !== null) ? guess : '?';
    getEl('rsConfirmCycleLabel').textContent = 'Cycle ' + cycle;

    const input = getEl('rsManualRank');
    input.value = (guess && guess >= 1 && guess <= 35) ? guess : '';

    function updateThroughLabels(){
      const n = parseInt(input.value, 10);
      const through = (n && n >= 1) ? (n - 1) : '?';
      getEl('rsThroughLevel').textContent = through;
      getEl('rsThroughLevel2').textContent = through;
    }
    input.oninput = updateThroughLabels;
    updateThroughLabels();

    getEl('rsCancelApply').onclick = closeAll;
    getEl('rsRecalib').onclick = ()=>{ closeAll(); start(true); };
    getEl('rsApply').onclick = async ()=>{
      const n = parseInt(input.value, 10);
      if(!n || n < 1 || n > 35){ alert('Enter a rank between 1 and 35.'); return; }
      const through = n - 1;
      // Check cycle completion once for the whole batch, not once per row:
      // markRowObtained() can pop a blocking cycle-complete confirm() that
      // resets ownedRank and advances activeCycle, and this loop is still
      // awaiting further iterations against its own closed-over `cycle` —
      // letting the popup fire mid-loop would check newly-advanced-cycle
      // completion against leftover writes from the OLD cycle's catch-up.
      // So every iteration skips its own check, and this does one instead,
      // before/after the whole batch, against the same `cycle` throughout.
      const coveredBefore = cycleCoveredCount(cycle);
      for(let level = 1; level <= through; level++){
        await markRowObtained(CYCLES[cycle][level-1], { skipCycleCheck: true });
      }
      await storeSet('rebirth-currentLevel', through);
      showToast('Caught up through rebirth ' + through + ' for Cycle ' + cycle);
      closeAll();
      maybeOfferCycleReset(cycle, coveredBefore);
    };
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
