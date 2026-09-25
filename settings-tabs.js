/* ---------------------------------------------------------------------------
   Tabs for ⚙ Overlay Settings (v1.7.6). Presentation only: every control in
   the panel keeps the id it always had, and overlay-controls.js still owns
   all of their behavior. This file just switches tabs, remembers the last
   one, and adds the Keybinds extras (search, bound count, dimmed unbound
   keys). Wrapped in an IIFE so it can't collide with any page global.
--------------------------------------------------------------------------- */
(function(){
  const panel = document.getElementById('overlaySettingsPanel');
  if(!panel) return;

  /* ---- tabs ---- */
  const tabs = Array.from(panel.querySelectorAll('[role="tab"]'));
  const paneOf = (t) => document.getElementById(t.getAttribute('aria-controls'));
  const STORE_KEY = 'fdt-settings-tab'; // per-machine UI preference, not progress data

  function select(name, focus){
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      const pane = paneOf(t);
      if(pane) pane.hidden = !on;
      if(on && focus) t.focus();
    });
    try{ localStorage.setItem(STORE_KEY, name); }catch(e){ /* private mode etc. */ }
  }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t.dataset.tab));
    t.addEventListener('keydown', (e) => {
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if(e.key === 'Home' || e.key === 'End'){
        e.preventDefault();
        select(tabs[e.key === 'Home' ? 0 : tabs.length - 1].dataset.tab, true);
      }else if(step){
        e.preventDefault();
        select(tabs[(i + step + tabs.length) % tabs.length].dataset.tab, true);
      }
    });
  });

  // "Keybinds → Tier filter" style shortcuts inside a pane
  panel.querySelectorAll('[data-goto]').forEach((b) => {
    b.addEventListener('click', () => select(b.dataset.goto, true));
  });

  let start = tabs.length ? tabs[0].dataset.tab : null;
  try{
    const saved = localStorage.getItem(STORE_KEY);
    if(saved && tabs.some((t) => t.dataset.tab === saved)) start = saved;
  }catch(e){ /* ignore */ }
  if(start) select(start);

  /* ---- Keybinds extras ---- */
  const keyBtns = Array.from(panel.querySelectorAll('.kb-key'));
  const countEl = document.getElementById('keybindCount');

  // overlay-controls.js writes each key's label as text ("(none set)" when
  // unbound), so watch the text instead of hooking into that file.
  function refreshBound(){
    let bound = 0;
    keyBtns.forEach((b) => {
      const unbound = b.textContent.trim() === '(none set)';
      const row = b.closest('.kb-row');
      if(row) row.classList.toggle('unbound', unbound);
      if(!unbound) bound++;
    });
    const txt = bound + '/' + keyBtns.length;
    if(countEl && countEl.textContent !== txt) countEl.textContent = txt; // guard: an unconditional write would re-trigger the observer forever
    if(countEl) countEl.title = bound + ' of ' + keyBtns.length + ' hotkeys bound';
  }
  refreshBound();
  keyBtns.forEach((b) => new MutationObserver(refreshBound).observe(b, { childList: true, characterData: true, subtree: true }));

  const search = document.getElementById('keybindSearch');
  const noMatch = document.getElementById('keybindNoMatch');
  if(search){
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      panel.querySelectorAll('.kb-row').forEach((r) => {
        const hit = !q || r.textContent.toLowerCase().includes(q); // label, hint and current combo
        r.hidden = !hit;
        if(hit) shown++;
      });
      panel.querySelectorAll('.kb-group').forEach((g) => {
        g.hidden = !g.querySelector('.kb-row:not([hidden])');
      });
      if(noMatch) noMatch.hidden = shown > 0;
    });
  }
})();
