'use strict';
/* ---------------------------------------------------------------------------
   overlay-drag.js — moving an overlay window by its drag bar (v1.10.14), shared
   by every overlay window: overlay.html, timers.html, declutter.html,
   rebirth-requirements-overlay.html, sneak-preview.html, crit-guide-overlay.html.

   The app does the dragging, not Windows: this reports how far the pointer has
   moved since it went down on #dragHandle ('overlay:drag'), and main.js places
   the window, always wholly on one monitor. Windows' own drag
   (-webkit-app-region: drag) let a window straddle two monitors, and Windows
   then drew the part on one monitor again on the other — so overlay pages must
   never use -webkit-app-region (test/pages.test.js enforces it).
--------------------------------------------------------------------------- */
(function(){
  const handle = document.getElementById('dragHandle');
  if(!window.overlayAPI || !handle) return;

  let drag = null; // { x, y, dx, dy } in screen px
  handle.addEventListener('pointerdown', (e)=>{
    if(e.button !== 0 || e.target.closest('button')) return; // the Lock button is a button, not a grab point
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    drag = { x: e.screenX, y: e.screenY, dx: 0, dy: 0 };
    window.overlayAPI.dragOverlay('start', 0, 0);
  });
  handle.addEventListener('pointermove', (e)=>{
    if(!drag) return;
    drag.dx = e.screenX - drag.x;
    drag.dy = e.screenY - drag.y;
    window.overlayAPI.dragOverlay('move', drag.dx, drag.dy);
  });
  // Ends with the last MOVE's offsets: a pointercancel carries no usable coordinates.
  function endDrag(){
    if(!drag) return;
    window.overlayAPI.dragOverlay('end', drag.dx, drag.dy);
    drag = null;
  }
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  handle.addEventListener('lostpointercapture', endDrag);
})();
