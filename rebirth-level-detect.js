'use strict';
/* ---------------------------------------------------------------------------
   REBIRTH LEVEL DETECT (screen capture + digit OCR)

   Independent of Live Detect (its own getDisplayMedia call, its own state) so
   neither feature can break the other. Watches a small, user-calibrated
   screen region containing the game's own rebirth-count badge, reads the
   number with Tesseract.js restricted to digits, and requires the SAME
   reading twice in a row before committing it — a single misread frame
   can't flip the display. A manual +/- stepper is always available too,
   since OCR on a small stylized game-HUD numeral is inherently less
   reliable than Live Detect's icon-matching (which compares against known-
   exact reference images, not arbitrary rendered text).

   Writes to 'rebirth-currentLevel' in the shared store; the overlay HUD
   reads that to decide which rebirth's requirements to show (see
   requirements.js's getUpcomingLevels).

   The calibrated box is saved (as fractions of the captured screen's
   width/height) under 'rebirth-levelBadgeRegion' and reused automatically
   on the next click of the toolbar button, so calibration only has to
   happen once — or again via the "Redraw box" button in the running strip,
   or automatically if the captured screen's resolution no longer matches
   what was saved (a strong sign the old coordinates point at the wrong
   pixels now).

   Depends on globals already defined in tracker.html's main script: getEl,
   storeGet, storeSet, showToast. Loaded after that script, before this one
   runs any of its own code.
--------------------------------------------------------------------------- */
(function(){
  // Continuous auto-detect retired 2026-09-22 at the user's request — a real
  // resource cost (a live screen-capture stream plus a full Tesseract OCR
  // pass roughly every 1.2s, indefinitely, competing with Fortnite for the
  // same GPU/CPU — see SAMPLE_MS below) for something Manual + Read Rebirth
  // Screen already cover between them: Manual is free and instant, and Read
  // Rebirth Screen already does the heavier lifting (bulk-marks droids
  // owned) whenever you're on that screen anyway. Flip this back to `true`
  // to bring the 🔢 Draw Rebirth Level Box button and its whole flow back —
  // nothing else in the app depends on it running or even existing.
  //
  // The manual −/Lvl N/+ stepper (setLevel, rlDec/rlInc) is NOT gated by
  // this flag and stays wired unconditionally below. It used to only be
  // reachable by first opening this feature's own calibration flow (it
  // lived inside #rlStrip, shown only once auto-detect actually started) —
  // which would have made the manual override unreachable too the moment
  // this got disabled. It's now its own always-visible toolbar control
  // (#rlManualToolbar in tracker.html) instead, independent of whether
  // auto-detect exists at all.
  const REBIRTH_LEVEL_DETECT_ENABLED = false;

  const rlBtn = document.getElementById('rebirthLevelBtn');
  const mediaSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  const autoDetectAvailable = REBIRTH_LEVEL_DETECT_ENABLED && mediaSupported;
  if(autoDetectAvailable) rlBtn.hidden = false; // stays hidden otherwise

  const SAMPLE_MS = 1200;
  const UPSCALE = 8;        // enlarge the tiny badge crop before OCR gets it
  const CONFIRM_READS = 2;  // same reading this many samples in a row before it commits
  const REGION_KEY = 'rebirth-levelBadgeRegion';

  let rlStream = null, rlVideo = null, rlRegion = null;
  let rlStarting = false; // true while a getDisplayMedia()/picker request is in flight
  let rlTimer = null;
  let worker = null, workerReady = false, workerFailed = false;
  let pendingValue = null, pendingCount = 0;
  let currentLevel = 0;
  let savedRegion = null; // { xFrac, yFrac, wFrac, hFrac, videoW, videoH } | null

  function setLevel(n, source){
    currentLevel = n;
    if(source){
      // A manual (+/-) correction should win over whatever OCR was already
      // confirming. Without this, a confirmation streak built up BEFORE the
      // manual click (e.g. 2 stable reads of "5") could immediately count
      // toward overriding it again on the very next sample, silently
      // snapping back to 5 within one tick with no explanation — instead,
      // OCR now has to freshly confirm CONFIRM_READS more times, in a row,
      // AFTER this correction, before it can override it again.
      pendingValue = null; pendingCount = 0;
    }
    const disp = getEl('rlLevelDisplay');
    if(disp) disp.textContent = 'Lvl ' + n;
    storeSet('rebirth-currentLevel', n);
    if(source) showToast('Rebirth level set to ' + n + ' (' + source + ')');
  }

  async function ensureWorker(){
    if(worker || workerFailed) return;
    if(typeof Tesseract === 'undefined'){
      workerFailed = true;
      getEl('rlGuess').textContent = "text recognition didn't load — run npm install and restart the app";
      return;
    }
    try{
      getEl('rlGuess').textContent = 'loading text recognition… (first run needs internet once)';
      worker = await Tesseract.createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: '7' // treat the crop as a single line of text
      });
      workerReady = true;
      getEl('rlGuess').textContent = 'watching…';
    }catch(err){
      workerFailed = true;
      getEl('rlGuess').textContent = 'text recognition failed to start (' + err.message + ')';
    }
  }

  async function startRebirthLevelDetect(force){
    try{
      rlStream = await navigator.mediaDevices.getDisplayMedia({ video:{ cursor:'never' }, audio:false });
    }catch(err){
      alert("Couldn't start screen sharing (" + err.message + "). Rebirth Level Detect needs permission to share a window or your screen.");
      return;
    }
    rlVideo = document.createElement('video');
    rlVideo.srcObject = rlStream;
    rlVideo.muted = true;
    await rlVideo.play();
    if(!rlVideo.videoWidth){
      await new Promise(res=>{ rlVideo.addEventListener('loadedmetadata', res, {once:true}); });
    }
    rlStream.getVideoTracks()[0].addEventListener('ended', stopRebirthLevelDetect);

    const canUseSaved = !force && savedRegion &&
      savedRegion.videoW === rlVideo.videoWidth && savedRegion.videoH === rlVideo.videoHeight;

    if(canUseSaved){
      rlRegion = {
        x: savedRegion.xFrac * rlVideo.videoWidth,
        y: savedRegion.yFrac * rlVideo.videoHeight,
        w: savedRegion.wFrac * rlVideo.videoWidth,
        h: savedRegion.hFrac * rlVideo.videoHeight
      };
      beginRlSampling();
    } else {
      if(!force && savedRegion){
        showToast('Screen resolution changed since your last box — redraw it once.');
      }
      openRlCalibration();
    }
  }

  function openRlCalibration(){
    getEl('rlCalibOverlay').style.display = 'flex';
    getEl('rlCalibStep1').textContent = 'Make sure your rebirth counter is visible on screen right now.';
    getEl('rlCalibCanvasWrap').style.display = '';
    const canvas = getEl('rlCalibCanvas');
    canvas.width = rlVideo.videoWidth;
    canvas.height = rlVideo.videoHeight;
    const ctx = canvas.getContext('2d');

    let selStart = null, sel = null;

    function redraw(){
      ctx.drawImage(rlVideo, 0, 0, canvas.width, canvas.height);
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
      getEl('rlCalibRegionInfo').textContent = sel ? 'box set' : 'draw a box around just the number';
      getEl('rlCalibConfirm').disabled = !sel;
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

    getEl('rlCalibRedo').onclick = ()=>{ sel = null; redraw(); refreshInfo(); };
    getEl('rlCalibCancel').onclick = stopRebirthLevelDetect;
    getEl('rlCalibConfirm').onclick = async ()=>{
      rlRegion = sel;
      savedRegion = {
        xFrac: sel.x / canvas.width,
        yFrac: sel.y / canvas.height,
        wFrac: sel.w / canvas.width,
        hFrac: sel.h / canvas.height,
        videoW: canvas.width,
        videoH: canvas.height
      };
      await storeSet(REGION_KEY, savedRegion);
      getEl('rlCalibOverlay').style.display = 'none';
      beginRlSampling();
    };

    rlVideo.requestVideoFrameCallback ? rlVideo.requestVideoFrameCallback(()=>{ redraw(); refreshInfo(); }) : (()=>{ redraw(); refreshInfo(); })();
  }

  async function beginRlSampling(){
    getEl('rlStrip').style.display = 'flex';
    await ensureWorker();

    const cropCanvas = document.createElement('canvas');
    const cropCtx = cropCanvas.getContext('2d', {willReadFrequently:true});
    const bigCanvas = document.createElement('canvas');
    const bigCtx = bigCanvas.getContext('2d');

    // Guards against a recognize() pass that takes longer than SAMPLE_MS —
    // plausible here specifically, since this overlay runs alongside
    // Fortnite competing for the same GPU/CPU. setInterval doesn't wait for
    // an async callback to finish, so without this flag a slow pass would
    // leave the next tick free to kick off ANOTHER recognize() on the same
    // worker while the first is still pending, and the backlog could grow
    // without bound for as long as the contention lasts.
    let sampling = false;

    rlTimer = setInterval(async ()=>{
      if(!workerReady || !rlVideo || rlVideo.readyState < 2 || !rlRegion) return;
      if(sampling) return;
      sampling = true;
      try{
        const w = Math.max(1, Math.round(rlRegion.w));
        const h = Math.max(1, Math.round(rlRegion.h));
        cropCanvas.width = w; cropCanvas.height = h;
        cropCtx.drawImage(rlVideo, rlRegion.x, rlRegion.y, w, h, 0, 0, w, h);

        bigCanvas.width = w * UPSCALE; bigCanvas.height = h * UPSCALE;
        bigCtx.imageSmoothingEnabled = true;
        bigCtx.drawImage(cropCanvas, 0, 0, bigCanvas.width, bigCanvas.height);

        // Simple contrast boost: push toward pure black/white so a thin HUD
        // numeral separates cleanly from a busy game background behind it.
        // Tuned for light-colored digits (white/green on a translucent badge);
        // flip the comparison if yours are dark-on-light.
        try{
          const img = bigCtx.getImageData(0,0,bigCanvas.width,bigCanvas.height);
          const d = img.data;
          for(let i=0;i<d.length;i+=4){
            const lum = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
            const v = lum > 150 ? 255 : 0;
            d[i]=d[i+1]=d[i+2]=v;
          }
          bigCtx.putImageData(img, 0, 0);
        }catch(e){ /* if this fails, OCR still runs on the un-thresholded crop */ }

        let text = '';
        try{
          const result = await worker.recognize(bigCanvas.toDataURL('image/png'));
          text = (result && result.data && result.data.text) || '';
        }catch(e){
          getEl('rlGuess').textContent = 'read failed: ' + e.message;
          return;
        }
        const match = text.match(/\d+/);
        const guess = match ? parseInt(match[0], 10) : null;
        const maxLevel = CYCLES[1] ? CYCLES[1].length : 40;

        if(guess === null || guess < 0 || guess > maxLevel){
          getEl('rlGuess').textContent = 'couldn\'t read a number (saw "' + text.trim() + '")';
          pendingValue = null; pendingCount = 0;
          return;
        }
        getEl('rlGuess').textContent = 'reading: ' + guess;

        if(guess === pendingValue) pendingCount++;
        else { pendingValue = guess; pendingCount = 1; }

        if(pendingCount >= CONFIRM_READS && guess !== currentLevel){
          setLevel(guess);
        }
      } finally {
        sampling = false;
      }
    }, SAMPLE_MS);
  }

  function stopRebirthLevelDetect(){
    if(rlTimer){ clearInterval(rlTimer); rlTimer = null; }
    if(rlStream){ rlStream.getTracks().forEach(tr=>tr.stop()); rlStream = null; }
    rlVideo = null; rlRegion = null;
    const overlay = getEl('rlCalibOverlay'); if(overlay) overlay.style.display = 'none';
    const strip = getEl('rlStrip'); if(strip) strip.style.display = 'none';
  }

  if(autoDetectAvailable){
    rlBtn.addEventListener('click', async ()=>{
      if(rlStream){ stopRebirthLevelDetect(); return; }
      // rlStream is only assigned once getDisplayMedia() resolves, so without
      // this a second click landing while the picker dialog is still up (the
      // custom in-app picker window doesn't block interaction with this one)
      // would start a second, overlapping capture/worker-setup pass.
      if(rlStarting) return;
      rlStarting = true;
      try{ await startRebirthLevelDetect(); }
      finally{ rlStarting = false; }
    });
    getEl('rlStop').addEventListener('click', stopRebirthLevelDetect);
    getEl('rlRecalib').addEventListener('click', ()=>{
      if(rlTimer){ clearInterval(rlTimer); rlTimer = null; }
      getEl('rlStrip').style.display = 'none';
      openRlCalibration(); // explicit redraw request — always shows the box UI, saved region or not
    });
  }

  // Manual override: always wired, whether or not auto-detect exists — see
  // the header comment above for why this can't just be gated the same way
  // Live Detect's single-flag/early-return pattern gates that feature.
  getEl('rlDec').addEventListener('click', ()=> setLevel(Math.max(0, currentLevel-1), 'manual'));
  getEl('rlInc').addEventListener('click', ()=>{
    const maxLevel = CYCLES[1] ? CYCLES[1].length : 40;
    setLevel(Math.min(maxLevel, currentLevel+1), 'manual');
  });

  (async ()=>{
    currentLevel = (await storeGet('rebirth-currentLevel')) || 0;
    const disp = getEl('rlLevelDisplay');
    if(disp) disp.textContent = 'Lvl ' + currentLevel;
    if(autoDetectAvailable) savedRegion = (await storeGet(REGION_KEY)) || null;
  })();

  // Keep currentLevel in sync when 'rebirth-currentLevel' changes from
  // somewhere OTHER than this file's own setLevel() — Read Rebirth Screen's
  // bulk catch-up, or (if auto-detect is ever flipped back on) a second
  // window's OCR. Without this, currentLevel only ever reflects whatever
  // was in the store at page load, so the manual +/- stepper computes off
  // a stale number and can silently regress real progress instead of
  // adjusting from where the game actually is (e.g. Read Rebirth Screen
  // sets level 6, then a single manual + click, still thinking it's at 0,
  // sets it back down to 1). Mirrors the onStoreChanged pattern every
  // overlay window already uses (see overlay.html) for the same reason,
  // and — like a manual correction already does in setLevel() above —
  // clears any OCR confirmation streak that was building toward a value
  // this external change has now made stale.
  if(window.overlayAPI) window.overlayAPI.onStoreChanged(({ key, value })=>{ // absent when tracker.html is opened in a plain browser
    if(key !== 'rebirth-currentLevel') return;
    currentLevel = value || 0;
    const disp = getEl('rlLevelDisplay');
    if(disp) disp.textContent = 'Lvl ' + currentLevel;
    pendingValue = null; pendingCount = 0;
  });
})();
