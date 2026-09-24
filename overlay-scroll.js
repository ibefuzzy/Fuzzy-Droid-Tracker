'use strict';
/* ---------------------------------------------------------------------------
   Hotkey-driven scroll viewport, shared by declutter.html (Safe to Retire)
   and rebirth-requirements-overlay.html (v1.6.0).

   Those overlays are click-through while locked — mouse events go straight
   to the game — so a mouse wheel can never reach them. Instead each window
   gets two global hotkeys (unbound by default, set in ⚙ Overlay Settings)
   that main.js broadcasts as 'hotkey:triggered'; the window calls page(±1).

   Paging is row-aligned rather than a fixed pixel step: "down" jumps so the
   first row that wasn't fully visible becomes the new top row, "up" does
   the mirror image, so every press shows whole new rows with nothing
   half-cut at the top. Rows are found from the cards' real offsetTop values,
   so a row made taller by a two-line name is still handled correctly.

   The scrollbar is display-only: its thumb is sized/positioned from the
   viewport's real scrollHeight/scrollTop, and the whole bar hides when
   nothing overflows so a short list stays completely clean.
--------------------------------------------------------------------------- */
function createScrollViewport(viewport, scrollbarEl, thumbEl, itemSelector){
  function maxScroll(){ return Math.max(0, viewport.scrollHeight - viewport.clientHeight); }

  function update(){
    const scrollable = maxScroll();
    if(scrollable <= 1){ scrollbarEl.classList.remove('visible'); return; }
    scrollbarEl.classList.add('visible');
    const trackH = scrollbarEl.clientHeight;
    const thumbH = Math.max(14, trackH * (viewport.clientHeight / viewport.scrollHeight));
    thumbEl.style.height = thumbH + 'px';
    thumbEl.style.top = ((trackH - thumbH) * Math.min(1, viewport.scrollTop / scrollable)) + 'px';
  }

  // [{top, bottom}] per visual row, relative to the scrolled content.
  function rows(){
    const byTop = new Map();
    viewport.querySelectorAll(itemSelector).forEach(el=>{
      const t = el.offsetTop, b = t + el.offsetHeight;
      byTop.set(t, Math.max(byTop.get(t) || 0, b));
    });
    return Array.from(byTop.entries()).map(([top, bottom])=>({ top, bottom })).sort((a, b)=> a.top - b.top);
  }

  function page(dir){
    const max = maxScroll();
    if(max <= 0) return;
    const cur = viewport.scrollTop, h = viewport.clientHeight;
    const r = rows();
    let target;
    if(dir > 0){
      const next = r.find(row => row.bottom > cur + h + 1); // first row not fully on screen
      target = next ? next.top : max;
      if(target <= cur) target = cur + h; // a single row taller than the viewport
    } else {
      // Mirror of "down": the row just above the current top becomes the
      // new BOTTOM row, and we start at the earliest row that still lets it
      // fit — so down-then-up lands back exactly where you started (verified
      // mid-list; from the very bottom, which is clamped to scrollHeight
      // rather than a row edge, "up" lands on the nearest clean row instead).
      const above = r.filter(row => row.top < cur - 1);
      if(!above.length){
        target = 0;
      } else {
        const need = above[above.length - 1].bottom - h;
        const first = r.find(row => row.top >= need - 1);
        target = first ? first.top : 0;
      }
      if(target >= cur) target = Math.max(0, cur - h); // a single row taller than the viewport
    }
    viewport.scrollTop = Math.min(max, Math.max(0, target));
    update();
  }

  function toTop(){ viewport.scrollTop = 0; update(); }

  viewport.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  return { update, page, toTop };
}
