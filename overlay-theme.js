'use strict';
/* ---------------------------------------------------------------------------
   overlay-theme.js — shared by the five droid overlays (v1.10.14), loaded
   after each page's own script. Four jobs (3 and 4 added in v1.11.1, below):

   1. Corner resize grip. Shown only while the overlay is unlocked (the same
      body.unlocked class that shows the drag bar). Dragging it reports the
      pointer's movement since the drag began to main.js ('overlay:resize'),
      which resizes the window and saves the size on release.

   2. Zoom that follows the window's size. The whole page (icons, text,
      spacing) is scaled by CSS zoom relative to the overlay's DEFAULT size,
      so the default size is always zoom 1 and looks exactly as before.
      Zoom stops where the droid art would be upscaled past its native
      pixels (MAX_ART_PX); beyond that a bigger window fits more columns
      instead. List overlays follow width only (extra height = more rows);
      the HUD (<html data-ov-zoom="fit">) fits both width and height, since
      its four level blocks always fill the window.
--------------------------------------------------------------------------- */
(function(){
  if(!window.overlayAPI) return;

  const root = document.documentElement;
  const MAX_ART_PX = 96;   // card-icons-data.js art is 96x96
  const ICON_FRAME_PX = 4; // .d-icon-wrap's 2px rarity border on each side
  const MIN_ZOOM = 0.8;    // below this the 7.5px status text gets unreadable
  let base = null;

  function iconPx(){
    return parseFloat(getComputedStyle(root).getPropertyValue('--ov-icon-size')) || 40;
  }

  function targetZoom(){
    const byWidth = window.innerWidth / base.width;
    const wanted = root.dataset.ovZoom === 'fit' ? Math.min(byWidth, window.innerHeight / base.height) : byWidth;
    const sharpest = MAX_ART_PX / ((iconPx() - ICON_FRAME_PX) * (window.devicePixelRatio || 1));
    return Math.max(MIN_ZOOM, Math.min(sharpest, wanted));
  }

  // Re-announces a resize after changing zoom so overlay-scroll.js resizes its
  // scrollbar to the new layout; the zoom-unchanged check stops the loop. At 1.0
  // the property is removed, not set, so an overlay that was never resized has no
  // zoom style at all.
  function applyZoom(){
    if(!base) return;
    const z = Math.round(targetZoom() * 1000) / 1000;
    const want = z === 1 ? '' : String(z);
    if(root.style.zoom === want) return;
    root.style.zoom = want;
    window.dispatchEvent(new Event('resize'));
  }
  window.addEventListener('resize', applyZoom);
  window.overlayAPI.getOverlayBaseSize().then(b => { base = b; applyZoom(); });

  const grip = document.createElement('div');
  grip.className = 'ov-resize-grip';
  grip.title = 'Drag to resize';
  document.body.appendChild(grip);

  let drag = null; // { x, y, dx, dy } in screen px
  grip.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    drag = { x: e.screenX, y: e.screenY, dx: 0, dy: 0 };
    window.overlayAPI.resizeOverlay('start', 0, 0);
  });
  grip.addEventListener('pointermove', (e)=>{
    if(!drag) return;
    drag.dx = e.screenX - drag.x;
    drag.dy = e.screenY - drag.y;
    window.overlayAPI.resizeOverlay('move', drag.dx, drag.dy);
  });
  // Ends with the last MOVE's offsets: a pointercancel carries no usable coordinates.
  function endDrag(){
    if(!drag) return;
    window.overlayAPI.resizeOverlay('end', drag.dx, drag.dy);
    drag = null;
  }
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);
  grip.addEventListener('lostpointercapture', endDrag);

  /* 3. Colour theme (v1.11.1, ⚙ Overlay Settings → Appearance; per-overlay,
     compact mode and text size since v1.13.0). Each setting is an inline :root
     property, which beats the page's own :root default; a null setting removes
     it so that default comes back. The HUD (<html data-ov-own-alpha>) keeps its
     own opacity slider for the backdrop. */
  function rgbOf(hex){
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if(!m) return null;
    const n = parseInt(m[1], 16);
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }
  function numOf(v){ return typeof v === 'number' && Number.isFinite(v) ? v : null; }
  function setVar(name, value){
    if(value == null) root.style.removeProperty(name);
    else root.style.setProperty(name, String(value));
  }
  // v1.13.0: this overlay's own overrides (settings.overlayThemes[<html data-ov-name>])
  // go on top of the all-overlays values — effectiveTheme() in requirements.js.
  const ovName = root.dataset.ovName || '';
  let lastTheme = null;
  function applyTheme(s){
    const t = effectiveTheme(s, ovName);
    // settings:changed fires for every setting; skip the ones that aren't the theme
    const key = JSON.stringify(t);
    if(key === lastTheme) return;
    lastTheme = key;
    const backdrop = rgbOf(t.themeBackdrop);
    setVar('--ov-backdrop-rgb', backdrop);
    setVar('--ov-backdrop-current-rgb', backdrop); // the HUD's current-level block
    if(!('ovOwnAlpha' in root.dataset)) setVar('--ov-backdrop-alpha', numOf(t.themeBackdropAlpha));
    setVar('--ov-box-rgb', rgbOf(t.themeBox));
    setVar('--ov-box-alpha', numOf(t.themeBoxAlpha));
    setVar('--ov-highlight-rgb', t.themeHighlight === 'border' ? 'var(--sw-rgb)' : rgbOf(t.themeHighlight));
    setVar('--ov-text-scale', numOf(t.themeTextScale));
    root.classList.toggle('ov-compact', t.themeCompact === true);
    window.dispatchEvent(new Event('resize')); // compact/text size change the list's rows: rescale the scrollbar
  }
  window.overlayAPI.getSettings().then(applyTheme);
  window.overlayAPI.onSettingsChanged(applyTheme);

  /* 4. Mark-key target (v1.11.1). A list page (<html data-mark-list="name">)
     shows its selection glow only while the rebirthMark* keys drive it, plus a
     KEYS tag while more than one list is open. main.js decides the target
     (markTargetState) and re-sends it whenever a list opens/closes or the
     markTarget hotkey switches it. */
  const markName = root.dataset.markList;
  if(markName && window.overlayAPI.onMarkTargetChanged){
    const chip = document.createElement('div');
    chip.className = 'ov-mark-chip';
    chip.textContent = '⌨ KEYS';
    (document.querySelector('.panel') || document.body).appendChild(chip);
    let wasTarget = null;
    const applyMarkTarget = (st)=>{
      const on = !!st && st.target === markName;
      root.classList.toggle('mark-off', !on);
      root.classList.toggle('mark-contested', !!(st && st.contested));
      if(on && wasTarget === false && st.contested){
        root.classList.remove('mark-flash');
        void chip.offsetWidth; // restart the flash animation
        root.classList.add('mark-flash');
      }
      wasTarget = on;
    };
    window.overlayAPI.getMarkTarget().then(applyMarkTarget);
    window.overlayAPI.onMarkTargetChanged(applyMarkTarget);
  }
})();
