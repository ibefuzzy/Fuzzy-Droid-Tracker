'use strict';
/* ---------------------------------------------------------------------------
   tour.js (v1.16.0): the step-by-step tutorial, shared by the PC app (its steps
   are in guide.js) and the website tracker (its steps are in index.html). The
   two copies of this file are kept IDENTICAL; only the steps differ.

   FDT_TOUR.run({ steps, seenVersion, version, welcome, onDone, replay }):
     - Never had a tour (seenVersion null): a welcome card with two big choices,
       "Show me around" or "Skip, I'll figure it out" (the skip button up front
       is a must), then every step.
     - Had an older one: only the steps added since then ("What's new in X"),
       also skippable from its first card. Nothing new: nothing shows.
     - replay (the ❔ Guide / Tour buttons): every step, straight from step 1.
   A step: { since:'1.16.0', title, body (HTML), target?, before? }.
     target = a CSS selector (or a function returning an element) to highlight;
     if it's missing or hidden, the card just shows centred. before() runs first
     (open a panel, switch a phone tab).
   ADDING A FEATURE LATER: add a step with since: '<that version>' and bump the
   version passed in. Updating players get it as "What's new"; new players get
   it in the full tour.
--------------------------------------------------------------------------- */
(function(){
  if(window.FDT_TOUR) return;

  function cmpVersion(a, b){
    const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
    for(let i = 0; i < Math.max(pa.length, pb.length); i++){
      const d = (pa[i] || 0) - (pb[i] || 0);
      if(d) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  // Colours come from the page's theme (the app looks set these), with fallbacks.
  const CSS = `
  .fdt-tour{position:fixed;inset:0;z-index:100000;font-family:'Inter',system-ui,sans-serif;}
  .fdt-tour-dim{position:absolute;inset:0;background:rgba(0,0,0,.62);}
  .fdt-tour-ring{position:absolute;border-radius:10px;pointer-events:none;display:none;
    box-shadow:0 0 0 3px rgba(var(--accent-rgb, 94,242,166), .95), 0 0 18px 3px rgba(var(--accent-rgb, 94,242,166), .55), 0 0 0 9999px rgba(0,0,0,.62);
    transition:left .25s ease, top .25s ease, width .25s ease, height .25s ease;}
  .fdt-tour.spot .fdt-tour-dim{background:transparent;}
  .fdt-tour.spot .fdt-tour-ring{display:block;}
  .fdt-tour-card{position:absolute;box-sizing:border-box;width:min(440px, calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;
    background:rgb(var(--surface-rgb, 9,14,20));color:var(--text, #dfe8e2);
    border:1px solid rgba(var(--holo-rgb, 143,214,255), .35);border-radius:12px;padding:18px 20px 16px;
    box-shadow:0 18px 50px -12px rgba(0,0,0,.9), inset 0 0 40px -28px rgba(var(--holo-rgb, 143,214,255), .8);}
  .fdt-tour-card.welcome{width:min(500px, calc(100vw - 24px));text-align:center;padding:26px 24px 22px;}
  .fdt-tour-kicker{font:700 11px 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(var(--holo-rgb, 143,214,255), .75);margin-bottom:8px;}
  .fdt-tour-card h3{font:700 22px/1.15 'Rajdhani',sans-serif;letter-spacing:.02em;margin:0 0 10px;color:var(--text, #dfe8e2);}
  .fdt-tour-card.welcome h3{font-size:27px;}
  .fdt-tour-body{font-size:14px;line-height:1.55;color:var(--text, #dfe8e2);}
  .fdt-tour-body p{margin:0 0 10px;} .fdt-tour-body p:last-child{margin-bottom:0;}
  .fdt-tour-body b{color:var(--text, #dfe8e2);}
  .fdt-tour-body ul{margin:0 0 10px;padding-left:18px;} .fdt-tour-body li{margin:3px 0;}
  .fdt-tour-actions{display:flex;align-items:center;gap:8px;margin-top:16px;}
  .fdt-tour-actions .grow{flex:1;}
  .fdt-tour-choices{display:flex;flex-direction:column;gap:10px;margin-top:20px;}
  .fdt-tour-btn{font:600 14px 'Inter',system-ui,sans-serif;border-radius:8px;padding:9px 16px;cursor:pointer;
    background:rgba(255,255,255,.04);color:var(--text-dim, #8fa199);border:1px solid rgba(var(--holo-rgb, 143,214,255), .25);}
  .fdt-tour-btn:hover{color:var(--text, #dfe8e2);border-color:rgba(var(--holo-rgb, 143,214,255), .5);}
  .fdt-tour-btn.primary{color:rgb(var(--bg-rgb, 11,15,13));background:rgb(var(--accent-rgb, 94,242,166));border-color:transparent;font-weight:700;}
  .fdt-tour-btn.primary:hover{filter:brightness(1.08);}
  .fdt-tour-btn.big{font-size:16px;padding:13px 18px;}
  .fdt-tour-btn.link{background:none;border:0;padding:6px 4px;text-decoration:underline;text-underline-offset:3px;}
  .fdt-tour-note{font-size:12px;color:var(--text-dim, #8fa199);margin-top:12px;}
  .fdt-tour-dots{display:flex;gap:5px;justify-content:center;margin-top:12px;}
  .fdt-tour-dots i{width:6px;height:6px;border-radius:50%;background:rgba(var(--holo-rgb, 143,214,255), .25);}
  .fdt-tour-dots i.on{background:rgb(var(--accent-rgb, 94,242,166));}
  @media (max-width:700px){
    .fdt-tour-card{left:12px !important;right:12px;width:auto;}
    .fdt-tour-card h3{font-size:20px;}
    .fdt-tour-card.welcome h3{font-size:24px;}
  }`;

  function h(tag, cls, html){
    const e = document.createElement(tag);
    if(cls) e.className = cls;
    if(html !== undefined) e.innerHTML = html;
    return e;
  }
  function targetOf(step){
    if(!step.target) return null;
    let el = null;
    try{ el = typeof step.target === 'function' ? step.target() : document.querySelector(step.target); }catch(e){ el = null; }
    if(!el || !el.getClientRects().length) return null;
    const r = el.getBoundingClientRect();
    return (r.width > 0 && r.height > 0) ? el : null;
  }

  function run(opts){
    const all = opts.steps || [];
    const fresh = opts.seenVersion == null;
    const steps = (fresh || opts.replay) ? all : all.filter(s => cmpVersion(s.since, opts.seenVersion) > 0);
    const done = (completed)=>{ try{ opts.onDone && opts.onDone(completed); }catch(e){} };
    if(!steps.length){ done(false); return; }

    if(!document.getElementById('fdtTourCss')){
      const st = h('style'); st.id = 'fdtTourCss'; st.textContent = CSS; document.head.appendChild(st);
    }
    const root = h('div', 'fdt-tour');
    const dim = h('div', 'fdt-tour-dim');
    const ring = h('div', 'fdt-tour-ring');
    const card = h('div', 'fdt-tour-card');
    root.append(dim, ring, card);
    document.body.appendChild(root);

    let i = -1;          // -1 = the first card (welcome / what's new), then steps[i]
    let target = null;
    let raf = 0;

    function finish(completed){
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      done(completed);
    }
    function position(){
      raf = 0;
      const vw = window.innerWidth, vh = window.innerHeight;
      if(target && target.isConnected && target.getClientRects().length){
        const r = target.getBoundingClientRect(), pad = 6;
        root.classList.add('spot');
        Object.assign(ring.style, { left:(r.left - pad) + 'px', top:(r.top - pad) + 'px', width:(r.width + pad * 2) + 'px', height:(r.height + pad * 2) + 'px' });
        card.style.maxHeight = '';
        const cw = card.offsetWidth, gap = 14;
        let ch = card.offsetHeight, top;
        const below = vh - r.bottom - gap - 8, above = r.top - gap - 8;
        // below it, else above it; if neither fits, the roomier side and the card scrolls inside
        if(ch <= below) top = r.bottom + gap;
        else if(ch <= above) top = r.top - gap - ch;
        else if(below >= above){ card.style.maxHeight = Math.max(120, below) + 'px'; top = r.bottom + gap; }
        else { card.style.maxHeight = Math.max(120, above) + 'px'; ch = card.offsetHeight; top = r.top - gap - ch; }
        let left = Math.min(Math.max(8, r.left + r.width / 2 - cw / 2), vw - cw - 8);
        card.style.top = top + 'px'; card.style.left = left + 'px';
      } else {
        root.classList.remove('spot');
        card.style.maxHeight = '';
        card.style.top = Math.max(12, (vh - card.offsetHeight) / 2) + 'px';
        card.style.left = Math.max(12, (vw - card.offsetWidth) / 2) + 'px';
      }
    }
    function schedule(){ if(!raf) raf = requestAnimationFrame(position); }

    function showFirst(){
      card.className = 'fdt-tour-card welcome';
      target = null;
      const w = opts.welcome || {};
      if(fresh && !opts.replay){
        card.innerHTML = '<div class="fdt-tour-kicker">Welcome</div><h3>' + (w.title || 'Welcome') + '</h3>' +
          '<div class="fdt-tour-body">' + (w.body || '') + '</div>' +
          '<div class="fdt-tour-choices">' +
            '<button type="button" class="fdt-tour-btn primary big" data-act="go">▶ Show me around <small style="font-weight:500;opacity:.8">(' + steps.length + ' quick steps)</small></button>' +
            '<button type="button" class="fdt-tour-btn big" data-act="skip">Skip, I\'ll figure it out myself</button>' +
          '</div>' +
          '<div class="fdt-tour-note">' + (w.replayNote || 'You can take the tour any time later.') + '</div>';
      } else {
        card.innerHTML = '<div class="fdt-tour-kicker">Updated to ' + (opts.version || '') + '</div><h3>What\'s new</h3>' +
          '<div class="fdt-tour-body"><ul>' + steps.map(s => '<li>' + s.title + '</li>').join('') + '</ul></div>' +
          '<div class="fdt-tour-choices">' +
            '<button type="button" class="fdt-tour-btn primary big" data-act="go">▶ Show me</button>' +
            '<button type="button" class="fdt-tour-btn big" data-act="skip">Skip</button>' +
          '</div>';
      }
      schedule();
      const go = card.querySelector('[data-act="go"]');
      if(go) go.focus();
    }
    function showStep(){
      const s = steps[i];
      try{ if(s.before) s.before(); }catch(e){}
      card.className = 'fdt-tour-card';
      const last = i === steps.length - 1;
      card.innerHTML = '<div class="fdt-tour-kicker">Step ' + (i + 1) + ' of ' + steps.length + '</div>' +
        '<h3>' + s.title + '</h3><div class="fdt-tour-body">' + s.body + '</div>' +
        '<div class="fdt-tour-actions">' +
          '<button type="button" class="fdt-tour-btn link" data-act="skip">' + (last ? '' : 'Skip tour') + '</button><span class="grow"></span>' +
          (i > 0 ? '<button type="button" class="fdt-tour-btn" data-act="back">← Back</button>' : '') +
          '<button type="button" class="fdt-tour-btn primary" data-act="next">' + (last ? 'Done ✓' : 'Next →') + '</button>' +
        '</div>' +
        '<div class="fdt-tour-dots">' + steps.map((_, k) => '<i' + (k === i ? ' class="on"' : '') + '></i>').join('') + '</div>';
      if(last) card.querySelector('[data-act="skip"]').style.visibility = 'hidden';
      // let before() open whatever it opens, then find and bring the target into view
      setTimeout(()=>{
        target = targetOf(s);
        if(target){
          // scroll so the highlighted thing AND the card below it both fit on screen
          target.scrollIntoView({ block:'center', inline:'nearest' });
          const r = target.getBoundingClientRect(), both = r.height + 14 + card.offsetHeight;
          if(both <= window.innerHeight - 16) window.scrollBy(0, r.top - Math.max(8, (window.innerHeight - both) / 2));
        }
        schedule();
        setTimeout(schedule, 300); // after smooth scrolling / panel transitions settle
      }, 60);
      card.querySelector('[data-act="next"]').focus();
    }
    function go(delta){
      i += delta;
      if(i >= steps.length){ finish(true); return; }
      if(i < 0){ i = -1; showFirst(); return; }
      showStep();
    }
    function onKey(e){
      if(e.key === 'Escape'){ e.preventDefault(); finish(false); }
      else if(e.key === 'ArrowRight' && i >= 0){ e.preventDefault(); go(1); }
      else if(e.key === 'ArrowLeft' && i > 0){ e.preventDefault(); go(-1); }
    }
    card.addEventListener('click', e=>{
      const b = e.target.closest('[data-act]');
      if(!b) return;
      const act = b.dataset.act;
      if(act === 'skip') finish(false);
      else if(act === 'go' || act === 'next') go(1);
      else if(act === 'back') go(-1);
    });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    document.addEventListener('keydown', onKey, true);

    if(opts.replay){ i = 0; showStep(); } else showFirst();
  }

  window.FDT_TOUR = { run, cmpVersion };
})();
