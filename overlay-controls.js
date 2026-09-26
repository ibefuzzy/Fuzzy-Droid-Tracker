'use strict';
/* ---------------------------------------------------------------------------
   Tracker-side controls for the Electron overlay window: show/hide toggle,
   hotkey capture, opacity slider, reposition/lock. Loaded after the main
   inline script, so showToast()/getEl() etc. are already defined.

   Does nothing (and stays hidden) when not running inside the Electron app —
   the plain-browser version of tracker.html works exactly as before.
--------------------------------------------------------------------------- */
(function(){
  if(!window.overlayAPI) return; // not in Electron — buttons stay hidden

  const toggleBtn = document.getElementById('overlayToggleBtn');
  const settingsBtn = document.getElementById('overlaySettingsBtn');
  const panel = document.getElementById('overlaySettingsPanel');
  const hotkeyHint = document.getElementById('overlayHotkeyHint');
  const opacityRange = document.getElementById('overlayOpacityRange');
  const repositionBtn = document.getElementById('overlayRepositionBtn');
  const overlayResetPosBtn = document.getElementById('overlayResetPosBtn');
  const timersToggleBtn = document.getElementById('timersToggleBtn');
  const timersRepositionBtn = document.getElementById('timersRepositionBtn');
  const timersResetPosBtn = document.getElementById('timersResetPosBtn');
  const appVersionTag = document.getElementById('appVersionTag');
  const missionSyncMin = document.getElementById('missionSyncMin');
  const missionSyncSec = document.getElementById('missionSyncSec');
  const missionSyncBtn = document.getElementById('missionSyncBtn');
  const hotkeyListToggleBtn = document.getElementById('hotkeyListToggleBtn');
  const rebirthScreenBtn = document.getElementById('rebirthScreenBtn');
  const declutterRepositionBtn = document.getElementById('declutterRepositionBtn');
  const declutterResetPosBtn = document.getElementById('declutterResetPosBtn');
  const declutterToggleBtn = document.getElementById('declutterToggleBtn');
  const rebirthReqRepositionBtn = document.getElementById('rebirthReqRepositionBtn');
  const rebirthReqResetPosBtn = document.getElementById('rebirthReqResetPosBtn');
  const rebirthReqToggleBtn = document.getElementById('rebirthReqToggleBtn');
  const sneakRepositionBtn = document.getElementById('sneakRepositionBtn');
  const sneakResetPosBtn = document.getElementById('sneakResetPosBtn');
  const sneakToggleBtn = document.getElementById('sneakToggleBtn');
  const critGuideRepositionBtn = document.getElementById('critGuideRepositionBtn');
  const critGuideResetPosBtn = document.getElementById('critGuideResetPosBtn');
  const critGuideToggleBtn = document.getElementById('critGuideToggleBtn');

  /* Every "press to rebind" hotkey button: [button id, settings key, label].
     One table instead of seventeen hand-copied const/label/wire lines
     (2026-09-24) — a new hotkey only needs a row here, its map entries in
     main.js, a <button> in tracker.html and a ROWS entry in hotkey-list.html.
     Labels match main.js's HOTKEY_LABELS so a toast names each one the same
     way the startup-failure notice does. */
  const HOTKEY_BUTTONS = [
    ['hideAllHotkeyBtn', 'hideAllHotkey', 'Hide All Overlays'],
    ['overlayHotkeyBtn', 'hotkey', 'Toggle Current Rebirth Requirements'],
    ['timersHotkeyBtn', 'timersHotkey', 'Toggle Timers'],
    ['rebirthScreenHotkeyBtn', 'rebirthScreenHotkey', 'Trigger Read Rebirth Screen'],
    ['hotkeyListHotkeyBtn', 'hotkeyListHotkey', 'Toggle Hotkey List'],
    ['declutterHotkeyBtn', 'declutterHotkey', 'Toggle Declutter List'],
    // v1.7.3: these page whichever of Safe to Retire / Rebirth Requirements
    // is open — one shared hotkey pair, not a separate one per overlay (the
    // old rebirthReqScrollUp/DownHotkey rows are retired, same fix as the
    // tier filter below).
    ['declutterScrollUpHotkeyBtn', 'declutterScrollUpHotkey', 'Scroll List: Up'],
    ['declutterScrollDownHotkeyBtn', 'declutterScrollDownHotkey', 'Scroll List: Down'],
    ['declutterTierAllHotkeyBtn', 'declutterTierAllHotkey', 'Tier Filter: Toggle All Tiers'],
    ['declutterTierDefaultHotkeyBtn', 'declutterTierDefaultHotkey', 'Tier Filter: Toggle Default'],
    ['declutterTierRareHotkeyBtn', 'declutterTierRareHotkey', 'Tier Filter: Toggle Rare'],
    ['declutterTierEpicHotkeyBtn', 'declutterTierEpicHotkey', 'Tier Filter: Toggle Epic'],
    ['declutterTierLegendaryHotkeyBtn', 'declutterTierLegendaryHotkey', 'Tier Filter: Toggle Legendary'],
    ['declutterTierMythicHotkeyBtn', 'declutterTierMythicHotkey', 'Tier Filter: Toggle Mythic'],
    ['rebirthReqHotkeyBtn', 'rebirthReqOverlayHotkey', 'Toggle Rebirth Requirements'],
    ['sneakHotkeyBtn', 'sneakHotkey', 'Toggle Sneak Preview'],
    ['sneakScrollUpHotkeyBtn', 'sneakScrollUpHotkey', 'Scroll Sneak Preview Up'],
    ['sneakScrollDownHotkeyBtn', 'sneakScrollDownHotkey', 'Scroll Sneak Preview Down'],
    ['critGuideHotkeyBtn', 'critGuideHotkey', 'Toggle Optimal Crit Guide'],
    ['critGuideScrollUpHotkeyBtn', 'critGuideScrollUpHotkey', 'Scroll Crit Guide Up'],
    ['critGuideScrollDownHotkeyBtn', 'critGuideScrollDownHotkey', 'Scroll Crit Guide Down'],
    // v1.10.3: hotkey-based marking in Upcoming RB Req's overlay
    ['markDroidBtn', 'markDroid', 'Mark Selected Droid'],
    ['markLevelBtn', 'markLevel', 'Mark Entire Level'],
    ['markLeftBtn', 'markLeft', 'Navigate Left'],
    ['markRightBtn', 'markRight', 'Navigate Right'],
    ['markUpBtn', 'markUp', 'Navigate Up'],
    ['markDownBtn', 'markDown', 'Navigate Down'],
    // v1.10.3: hotkey-based marking in Rebirth Requirements overlay
    ['rebirthMarkDroidBtn', 'rebirthMarkDroid', 'Mark Selected Droid (Rebirth Requirements)'],
    ['rebirthMarkLeftBtn', 'rebirthMarkLeft', 'Navigate Left (Rebirth Requirements)'],
    ['rebirthMarkRightBtn', 'rebirthMarkRight', 'Navigate Right (Rebirth Requirements)'],
    ['rebirthMarkUpBtn', 'rebirthMarkUp', 'Navigate Up (Rebirth Requirements)'],
    ['rebirthMarkDownBtn', 'rebirthMarkDown', 'Navigate Down (Rebirth Requirements)']
  ].map(([id, settingsKey, label]) => ({ btn: document.getElementById(id), settingsKey, label }));

  /* Tier filter buttons (⚙ Overlay Settings → Filters tab) —
     clickable equivalents of the declutterTier* hotkeys, so the filter works
     without binding any of them. Same settings keys main.js's
     toggleDeclutterTier() flips; both declutter.html AND
     rebirth-requirements-overlay.html re-render off settings:changed (v1.7.2
     — the two overlays share this one filter, not one each). */
  const TIER_KEYS = ['declutterShowDefault', 'declutterShowRare', 'declutterShowEpic', 'declutterShowLegendary', 'declutterShowMythic'];
  const tierBtns = Array.from(document.querySelectorAll('[data-tier-key]'));
  const tierAllBtn = document.getElementById('declutterTierAllBtn');

  /* Borders tab (v1.10.0, was Colors): one row per overlay (⚙ Overlay
     Settings → Borders), each with a swatch button per BORDER_SKIN_ORDER
     entry. Swatches are built here instead of hand-written in tracker.html
     so the border list only exists in one place — BORDER_SKINS/
     BORDER_SKIN_ORDER in requirements.js, the same object each overlay
     window reads its own border skin from. */
  const COLOR_ROW_DEFAULT = { border:'jedi', declutterBorder:'grogu', rebirthReqBorder:'mando', sneakBorder:'rebel', critGuideBorder:'tatooine' };
  const colorRows = Array.from(document.querySelectorAll('.color-row[data-color-key]'));
  colorRows.forEach(row=>{
    const key = row.dataset.colorKey;
    const wrap = row.querySelector('.color-swatches');
    if(!wrap) return;
    BORDER_SKIN_ORDER.forEach(name=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.title = BORDER_SKINS[name].label;
      b.style.setProperty('--sw', BORDER_SKINS[name].hex);
      b.innerHTML = borderIconSvg(name, 16);
      b.dataset.colorValue = name;
      wrap.appendChild(b);
    });
  });

  toggleBtn.hidden = false;
  settingsBtn.hidden = false;
  if(timersToggleBtn) timersToggleBtn.hidden = false;
  if(hotkeyListToggleBtn) hotkeyListToggleBtn.hidden = false;
  if(declutterToggleBtn) declutterToggleBtn.hidden = false;
  if(rebirthReqToggleBtn) rebirthReqToggleBtn.hidden = false;
  if(sneakToggleBtn) sneakToggleBtn.hidden = false;
  if(critGuideToggleBtn) critGuideToggleBtn.hidden = false;

  let opacityDebounce = null;
  const capturing = {}; // settingsKey -> bool, so two hotkey rows never step on each other

  function setToggleLabel(visible){
    toggleBtn.textContent = visible ? '🎯 Upcoming RB Req\'s: On' : '🎯 Upcoming RB Req\'s: Off';
    toggleBtn.classList.toggle('on', visible);
  }

  function setTimersToggleLabel(visible){
    if(!timersToggleBtn) return;
    timersToggleBtn.textContent = visible ? '⏱ Timers: On' : '⏱ Timers: Off';
    timersToggleBtn.classList.toggle('on', visible);
  }

  function setHotkeyListToggleLabel(visible){
    if(!hotkeyListToggleBtn) return;
    hotkeyListToggleBtn.textContent = visible ? '⌨ Hotkeys: On' : '⌨ Hotkeys: Off';
    hotkeyListToggleBtn.classList.toggle('on', visible);
  }

  function setDeclutterToggleLabel(visible){
    if(!declutterToggleBtn) return;
    declutterToggleBtn.textContent = visible ? '♻ Declutter: On' : '♻ Declutter: Off';
    declutterToggleBtn.classList.toggle('on', visible);
  }

  function setRebirthReqToggleLabel(visible){
    if(!rebirthReqToggleBtn) return;
    rebirthReqToggleBtn.textContent = visible ? '🧬 Rebirth Req: On' : '🧬 Rebirth Req: Off';
    rebirthReqToggleBtn.classList.toggle('on', visible);
  }

  function setSneakToggleLabel(visible){
    if(!sneakToggleBtn) return;
    sneakToggleBtn.textContent = visible ? '🔮 Sneak Preview: On' : '🔮 Sneak Preview: Off';
    sneakToggleBtn.classList.toggle('on', visible);
  }

  function setCritGuideToggleLabel(visible){
    if(!critGuideToggleBtn) return;
    critGuideToggleBtn.textContent = visible ? '⚡ Crit Guide: On' : '⚡ Crit Guide: Off';
    critGuideToggleBtn.classList.toggle('on', visible);
  }

  function applySettingsToUI(settings){
    HOTKEY_BUTTONS.forEach(({ btn, settingsKey })=>{
      if(btn && !capturing[settingsKey]) btn.textContent = settings[settingsKey] || '(none set)';
    });
    tierBtns.forEach(b=>{ b.classList.toggle('on', settings[b.dataset.tierKey] !== false); });
    if(tierAllBtn) tierAllBtn.classList.toggle('on', TIER_KEYS.every(k => settings[k] !== false));
    colorRows.forEach(row=>{
      const key = row.dataset.colorKey;
      const active = settings[key] || COLOR_ROW_DEFAULT[key];
      row.querySelectorAll('.swatch').forEach(b=>{
        b.classList.toggle('active', b.dataset.colorValue === active);
      });
    });
    opacityRange.value = settings.opacity != null ? settings.opacity : 0.55;
    setToggleLabel(settings.visible);
    setTimersToggleLabel(settings.timersVisible);
    setDeclutterToggleLabel(settings.declutterVisible);
    setRebirthReqToggleLabel(settings.rebirthReqVisible);
    setSneakToggleLabel(settings.sneakVisible);
    setCritGuideToggleLabel(settings.critGuideVisible);
    repositionBtn.textContent = settings.locked ? '🎯 Drag into place' : '🔓 Unlocked — drag the HUD, then use its Lock button';
    repositionBtn.classList.toggle('on', !settings.locked);
    if(timersRepositionBtn){
      timersRepositionBtn.textContent = settings.timersLocked ? '🎯 Drag into place' : '🔓 Unlocked — drag the banners, then use their Lock button';
      timersRepositionBtn.classList.toggle('on', !settings.timersLocked);
    }
    if(declutterRepositionBtn){
      declutterRepositionBtn.textContent = settings.declutterLocked ? '🎯 Drag into place' : '🔓 Unlocked — drag the list, then use its Lock button';
      declutterRepositionBtn.classList.toggle('on', !settings.declutterLocked);
    }
    if(rebirthReqRepositionBtn){
      rebirthReqRepositionBtn.textContent = settings.rebirthReqLocked ? '🎯 Drag into place' : '🔓 Unlocked — drag the overlay, then use its Lock button';
      rebirthReqRepositionBtn.classList.toggle('on', !settings.rebirthReqLocked);
    }
    if(sneakRepositionBtn){
      sneakRepositionBtn.textContent = settings.sneakLocked ? '🎯 Drag into place' : '🔓 Unlocked — drag the overlay, then use its Lock button';
      sneakRepositionBtn.classList.toggle('on', !settings.sneakLocked);
    }
    if(critGuideRepositionBtn){
      critGuideRepositionBtn.textContent = settings.critGuideLocked ? '🎯 Drag into place' : '🔓 Unlocked — drag the overlay, then use its Lock button';
      critGuideRepositionBtn.classList.toggle('on', !settings.critGuideLocked);
    }
    // Sound notifications (v1.10.2)
    const timerSoundEnabledCheckbox = document.getElementById('timerSoundEnabledCheckbox');
    if(timerSoundEnabledCheckbox) timerSoundEnabledCheckbox.checked = settings.timerSoundEnabled !== false;
    const timerSoundVolumeSlider = document.getElementById('timerSoundVolumeSlider');
    if(timerSoundVolumeSlider) {
      timerSoundVolumeSlider.value = settings.timerSoundVolume != null ? settings.timerSoundVolume : 0.35;
      const volumeDisplay = document.getElementById('volumeDisplay');
      if(volumeDisplay) volumeDisplay.textContent = Math.round((settings.timerSoundVolume || 0.35) * 100) + '%';
    }
    const missionSoundOverride = document.getElementById('missionSoundOverrideCheckbox');
    if(missionSoundOverride) missionSoundOverride.checked = settings.missionSoundVolumeOverride !== false;
    const missionSoundVolumeSlider = document.getElementById('missionSoundVolumeSlider');
    if(missionSoundVolumeSlider) {
      missionSoundVolumeSlider.value = settings.missionSoundVolume != null ? settings.missionSoundVolume : 0.35;
      const missionVolumeDisplay = document.getElementById('missionVolumeDisplay');
      if(missionVolumeDisplay) missionVolumeDisplay.textContent = Math.round((settings.missionSoundVolume || 0.35) * 100) + '%';
    }
    const missionSoundChoice = document.getElementById('missionSoundChoice');
    if(missionSoundChoice) missionSoundChoice.value = settings.missionSoundChoice || 'off';
    const blueprintSoundOverride = document.getElementById('blueprintSoundOverrideCheckbox');
    if(blueprintSoundOverride) blueprintSoundOverride.checked = settings.blueprintSoundVolumeOverride !== false;
    const blueprintSoundVolumeSlider = document.getElementById('blueprintSoundVolumeSlider');
    if(blueprintSoundVolumeSlider) {
      blueprintSoundVolumeSlider.value = settings.blueprintSoundVolume != null ? settings.blueprintSoundVolume : 0.35;
      const blueprintVolumeDisplay = document.getElementById('blueprintVolumeDisplay');
      if(blueprintVolumeDisplay) blueprintVolumeDisplay.textContent = Math.round((settings.blueprintSoundVolume || 0.35) * 100) + '%';
    }
    const blueprintSoundChoice = document.getElementById('blueprintSoundChoice');
    if(blueprintSoundChoice) blueprintSoundChoice.value = settings.blueprintSoundChoice || 'off';
  }

  function acceleratorFromEvent(e){
    const key = e.key;
    if(key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') return undefined; // still waiting
    if(key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) return null; // cancel
    const parts = [];
    if(e.ctrlKey) parts.push('Control');
    if(e.altKey) parts.push('Alt');
    if(e.shiftKey) parts.push('Shift');
    if(e.metaKey) parts.push(navigator.platform.toLowerCase().includes('mac') ? 'Command' : 'Super');
    const map = { ' ':'Space', 'ArrowUp':'Up', 'ArrowDown':'Down', 'ArrowLeft':'Left', 'ArrowRight':'Right' };
    let k = map[key] || (key.length === 1 ? key.toUpperCase() : key);
    parts.push(k);
    return parts.join('+');
  }

  // Every hotkey button registers itself here (settingsKey + its human
  // label) so a new capture can be checked against every OTHER hotkey's
  // current binding — see the collision check in onKeydown below.
  const HOTKEY_REGISTRY = [];
  // The currently-capturing button's own stop() function, or null. Capture
  // is exclusive across ALL hotkey buttons, not just per-button: without
  // this, starting a second capture (clicking a different rebind button)
  // while a first is still waiting for a keypress left two capture-phase
  // keydown listeners live on `document` at once, and a single keypress
  // would fire both — silently binding the SAME key to two different
  // actions via two racing setSettings() calls.
  let activeCapture = null;

  /* Wires one "press to rebind" hotkey button against one settings field.
     Each button tracks its own capture state (in the shared `capturing` map)
     so opening one capture doesn't affect the other's displayed label. */
  function wireHotkeyButton(btn, settingsKey, label){
    if(!btn) return;
    HOTKEY_REGISTRY.push({ settingsKey, label });
    function stop(){
      capturing[settingsKey] = false;
      btn.classList.remove('capturing');
      document.removeEventListener('keydown', onKeydown, true);
      if(activeCapture === stop) activeCapture = null;
    }
    async function onKeydown(e){
      e.preventDefault(); e.stopPropagation();
      const accel = acceleratorFromEvent(e);
      if(accel === undefined) return; // only a modifier so far, keep listening
      const hadModifier = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
      stop();
      if(accel === null){ // Escape = cancel
        const s = await window.overlayAPI.getSettings();
        applySettingsToUI(s);
        return;
      }
      if(!hadModifier && (e.key === 'Backspace' || e.key === 'Delete')){
        // Backspace/Delete = unbind. Needed since v1.6.0 made most hotkeys
        // optional (unbound by default): without it, binding one by mistake
        // or to try it out was permanent. main.js unregisters it on ''.
        const result = await window.overlayAPI.setSettings({ [settingsKey]: '' });
        showToast(label + ' cleared — no hotkey set');
        applySettingsToUI(result.settings);
        return;
      }
      if(!hadModifier){
        // Registering a bare, unmodified key (e.g. just "E") as a SYSTEM-
        // WIDE hotkey would swallow every press of it in every app while
        // this one is running — including Fortnite itself. That's exactly
        // the kind of interference with the game this app must never
        // cause, so refuse it here rather than letting it ever reach
        // setSettings()/globalShortcut.
        showToast('Hold a modifier too (Ctrl/Alt/Shift) — an unmodified "' + accel + '" would block that key in every app, including Fortnite, while this is running');
        const s = await window.overlayAPI.getSettings();
        applySettingsToUI(s);
        return;
      }
      const current = await window.overlayAPI.getSettings();
      const collision = HOTKEY_REGISTRY.find(h => h.settingsKey !== settingsKey && current[h.settingsKey] === accel);
      if(collision){
        // globalShortcut.register() is keyed by the accelerator string alone
        // (not by which action asked for it), so binding the same key to a
        // second action wouldn't error — it would just silently steal the
        // OS-level registration out from under the first one, leaving the
        // UI showing both as "bound" while only the newest actually fires.
        showToast('"' + accel + '" is already used by "' + collision.label + '" — pick a different combo');
        applySettingsToUI(current);
        return;
      }
      const result = await window.overlayAPI.setSettings({ [settingsKey]: accel });
      if(!result.hotkeyResult.ok){
        showToast("Couldn't bind " + accel + " — try a different combo");
      } else {
        showToast(label + ' set to ' + accel);
      }
      applySettingsToUI(result.settings);
    }
    btn.addEventListener('click', async ()=>{
      if(capturing[settingsKey]){
        stop();
        // Without this, cancelling by clicking the same button again (as
        // opposed to pressing Escape) left the label stuck on "Press new
        // keys…" until some unrelated settings change happened to repaint
        // it later.
        const s = await window.overlayAPI.getSettings();
        applySettingsToUI(s);
        return;
      }
      if(activeCapture){
        activeCapture(); // only one hotkey button can capture keystrokes at a time
        // Unlike the same-button-cancel and Escape paths, pre-empting a
        // DIFFERENT button's capture used to skip this re-sync — its stop()
        // correctly tore down capturing state/listener but never touched
        // btn.textContent, so the pre-empted button stayed stuck on "Press
        // new keys…" until some unrelated settings change
        // happened to repaint it. applySettingsToUI skips any button whose
        // `capturing` flag is still true, so calling it here only repaints
        // the one we just pre-empted (already false) — safe to call before
        // this button's own capturing state is set below.
        const s = await window.overlayAPI.getSettings();
        applySettingsToUI(s);
      }
      capturing[settingsKey] = true;
      activeCapture = stop;
      btn.classList.add('capturing');
      btn.textContent = 'Press new keys… (Esc cancel · Backspace clear)';
      document.addEventListener('keydown', onKeydown, true);
    });
  }

  toggleBtn.addEventListener('click', async ()=>{
    const visible = await window.overlayAPI.toggleOverlay();
    setToggleLabel(visible);
  });

  settingsBtn.addEventListener('click', ()=>{
    panel.hidden = !panel.hidden;
  });

  HOTKEY_BUTTONS.forEach(({ btn, settingsKey, label }) => wireHotkeyButton(btn, settingsKey, label));

  tierBtns.forEach(b=>{
    b.addEventListener('click', async ()=>{
      const cur = await window.overlayAPI.getSettings();
      await window.overlayAPI.setSettings({ [b.dataset.tierKey]: cur[b.dataset.tierKey] === false });
    });
  });
  if(tierAllBtn){
    tierAllBtn.addEventListener('click', async ()=>{
      const cur = await window.overlayAPI.getSettings();
      const allOn = TIER_KEYS.every(k => cur[k] !== false);
      const partial = {};
      TIER_KEYS.forEach(k => { partial[k] = !allOn; });
      await window.overlayAPI.setSettings(partial);
    });
  }

  colorRows.forEach(row=>{
    const key = row.dataset.colorKey;
    row.querySelectorAll('.swatch').forEach(b=>{
      b.addEventListener('click', async ()=>{
        await window.overlayAPI.setSettings({ [key]: b.dataset.colorValue });
      });
    });
  });

  // Toast bridge for one-off messages the main process pushes (e.g. the
  // startup "hotkey couldn't register" notice).
  if(window.overlayAPI.onNotify){
    window.overlayAPI.onNotify((msg)=>{ if(msg) showToast(msg); });
  }

  opacityRange.addEventListener('input', ()=>{
    const v = parseFloat(opacityRange.value);
    if(opacityDebounce) clearTimeout(opacityDebounce);
    opacityDebounce = setTimeout(()=>{ window.overlayAPI.setSettings({ opacity: v }); }, 80);
  });

  repositionBtn.addEventListener('click', async ()=>{
    const s = await window.overlayAPI.getSettings();
    if(s.locked){
      await window.overlayAPI.setOverlayLocked(false);
      showToast('HUD unlocked — drag it into place, then click its own Lock button');
    } else {
      await window.overlayAPI.setOverlayLocked(true);
      showToast('HUD position locked');
    }
  });

  if(overlayResetPosBtn){
    overlayResetPosBtn.addEventListener('click', async ()=>{
      if(!window.overlayAPI.resetOverlayPosition) return;
      const s = await window.overlayAPI.resetOverlayPosition();
      applySettingsToUI(s);
      showToast('HUD position reset to default');
    });
  }

  if(timersToggleBtn){
    timersToggleBtn.addEventListener('click', async ()=>{
      const visible = await window.overlayAPI.toggleTimers();
      setTimersToggleLabel(visible);
    });
  }

  if(timersRepositionBtn){
    timersRepositionBtn.addEventListener('click', async ()=>{
      const s = await window.overlayAPI.getSettings();
      if(s.timersLocked){
        await window.overlayAPI.setTimersLocked(false);
        showToast('Timer banners unlocked — drag them into place, then click their own Lock button');
      } else {
        await window.overlayAPI.setTimersLocked(true);
        showToast('Timer banner position locked');
      }
    });
  }

  if(timersResetPosBtn){
    timersResetPosBtn.addEventListener('click', async ()=>{
      if(!window.overlayAPI.resetTimersPosition) return;
      const s = await window.overlayAPI.resetTimersPosition();
      applySettingsToUI(s);
      showToast('Timer banner position reset to default');
    });
  }

  if(hotkeyListToggleBtn){
    hotkeyListToggleBtn.addEventListener('click', async ()=>{
      const visible = await window.overlayAPI.toggleHotkeyList();
      setHotkeyListToggleLabel(visible);
    });
  }
  // Shown automatically on launch (see main.js) — reflect that as this
  // button's initial label rather than waiting on a broadcast.
  setHotkeyListToggleLabel(true);

  if(declutterToggleBtn){
    declutterToggleBtn.addEventListener('click', async ()=>{
      const visible = await window.overlayAPI.toggleDeclutter();
      setDeclutterToggleLabel(visible);
    });
  }

  if(declutterRepositionBtn){
    declutterRepositionBtn.addEventListener('click', async ()=>{
      const s = await window.overlayAPI.getSettings();
      if(s.declutterLocked){
        await window.overlayAPI.setDeclutterLocked(false);
        showToast('Declutter list unlocked — drag it into place, then click its own Lock button');
      } else {
        await window.overlayAPI.setDeclutterLocked(true);
        showToast('Declutter list position locked');
      }
    });
  }

  if(declutterResetPosBtn){
    declutterResetPosBtn.addEventListener('click', async ()=>{
      if(!window.overlayAPI.resetDeclutterPosition) return;
      const s = await window.overlayAPI.resetDeclutterPosition();
      applySettingsToUI(s);
      showToast('Declutter list position reset to default');
    });
  }

  if(rebirthReqToggleBtn){
    rebirthReqToggleBtn.addEventListener('click', async ()=>{
      const visible = await window.overlayAPI.toggleRebirthReq();
      setRebirthReqToggleLabel(visible);
    });
  }

  if(rebirthReqRepositionBtn){
    rebirthReqRepositionBtn.addEventListener('click', async ()=>{
      const s = await window.overlayAPI.getSettings();
      if(s.rebirthReqLocked){
        await window.overlayAPI.setRebirthReqLocked(false);
        showToast('Rebirth Requirements overlay unlocked — drag it into place, then click its own Lock button');
      } else {
        await window.overlayAPI.setRebirthReqLocked(true);
        showToast('Rebirth Requirements overlay position locked');
      }
    });
  }

  if(rebirthReqResetPosBtn){
    rebirthReqResetPosBtn.addEventListener('click', async ()=>{
      if(!window.overlayAPI.resetRebirthReqPosition) return;
      const s = await window.overlayAPI.resetRebirthReqPosition();
      applySettingsToUI(s);
      showToast('Rebirth Requirements overlay position reset to default');
    });
  }

  if(sneakToggleBtn){
    sneakToggleBtn.addEventListener('click', async ()=>{
      const visible = await window.overlayAPI.toggleSneak();
      setSneakToggleLabel(visible);
    });
  }

  if(sneakRepositionBtn){
    sneakRepositionBtn.addEventListener('click', async ()=>{
      const s = await window.overlayAPI.getSettings();
      if(s.sneakLocked){
        await window.overlayAPI.setSneakLocked(false);
        showToast('Sneak Preview overlay unlocked — drag it into place, then click its own Lock button');
      } else {
        await window.overlayAPI.setSneakLocked(true);
        showToast('Sneak Preview overlay position locked');
      }
    });
  }

  if(sneakResetPosBtn){
    sneakResetPosBtn.addEventListener('click', async ()=>{
      if(!window.overlayAPI.resetSneakPosition) return;
      const s = await window.overlayAPI.resetSneakPosition();
      applySettingsToUI(s);
      showToast('Sneak Preview overlay position reset to default');
    });
  }

  if(critGuideToggleBtn){
    critGuideToggleBtn.addEventListener('click', async ()=>{
      const visible = await window.overlayAPI.toggleCritGuide();
      setCritGuideToggleLabel(visible);
    });
  }

  if(critGuideRepositionBtn){
    critGuideRepositionBtn.addEventListener('click', async ()=>{
      const s = await window.overlayAPI.getSettings();
      if(s.critGuideLocked){
        await window.overlayAPI.setCritGuideLocked(false);
        showToast('Optimal Crit Guide overlay unlocked — drag it into place, then click its own Lock button');
      } else {
        await window.overlayAPI.setCritGuideLocked(true);
        showToast('Optimal Crit Guide overlay position locked');
      }
    });
  }

  if(critGuideResetPosBtn){
    critGuideResetPosBtn.addEventListener('click', async ()=>{
      if(!window.overlayAPI.resetCritGuidePosition) return;
      const s = await window.overlayAPI.resetCritGuidePosition();
      applySettingsToUI(s);
      showToast('Optimal Crit Guide overlay position reset to default');
    });
  }

  /* Ctrl+Shift+6 (Read Rebirth Screen) fires from a global OS-level hotkey
     in the main process, which can't call renderer functions directly — it
     broadcasts that it fired, and this just clicks the real button, so the
     read runs through the exact same code path (same confirm step, same
     safeguards) as a manual click. Guarded on `!hidden` so it's a silent
     no-op on the rare setup where getDisplayMedia isn't supported and the
     button never un-hid itself in the first place. */
  if(window.overlayAPI.onHotkeyTriggered){
    window.overlayAPI.onHotkeyTriggered((which)=>{
      if(which === 'rebirthScreen' && rebirthScreenBtn && !rebirthScreenBtn.hidden) rebirthScreenBtn.click();
    });
  }

  /* "Sync mission timer" — the mission schedule's exact anchor is a best
     guess (45 min countdown + 5 min mission-active buffer between starts)
     and small residual drift is possible. Rather than keep guessing tighter
     and tighter corrections, this lets the player type in exactly what the
     game's own "NEXT MISSION" banner shows right now; we timestamp the
     click and store the resulting exact instant (missionSyncEpochMs), so
     every future occurrence (and the countdown display) locks to the real
     schedule exactly — no more drift to chase. Stored as a plain timestamp
     (not a time-of-day) so it stays correct regardless of which calendar
     day a given occurrence falls on. */
  if(missionSyncBtn){
    missionSyncBtn.addEventListener('click', async ()=>{
      const mm = parseInt(missionSyncMin.value, 10);
      const ss = parseInt(missionSyncSec.value, 10);
      if(!Number.isFinite(mm) || mm < 0 || !Number.isFinite(ss) || ss < 0 || ss > 59){
        showToast('Type the mm:ss shown on the real "Next Mission" banner first');
        return;
      }
      const targetMs = Date.now() + (mm * 60 + ss) * 1000;
      await window.overlayAPI.setSettings({ missionSyncEpochMs: targetMs });
      showToast('Mission timer synced — should match the game exactly now');
      missionSyncMin.value = '';
      missionSyncSec.value = '';
    });
  }

  /* Sound notifications (v1.10.2) */
  document.getElementById('timerSoundEnabledCheckbox')?.addEventListener('change', (e)=>{
    window.overlayAPI.setSettings({ timerSoundEnabled: e.target.checked });
  });

  document.getElementById('timerSoundVolumeSlider')?.addEventListener('input', (e)=>{
    const val = parseFloat(e.target.value);
    document.getElementById('volumeDisplay').textContent = Math.round(val * 100) + '%';
    window.overlayAPI.setSettings({ timerSoundVolume: val });
  });

  document.getElementById('advancedSoundToggle')?.addEventListener('change', (e)=>{
    document.getElementById('advancedSoundSettings').style.display =
      e.target.checked ? 'block' : 'none';
  });

  document.getElementById('missionSoundOverrideCheckbox')?.addEventListener('change', (e)=>{
    window.overlayAPI.setSettings({ missionSoundVolumeOverride: e.target.checked });
  });

  document.getElementById('missionSoundVolumeSlider')?.addEventListener('input', (e)=>{
    const val = parseFloat(e.target.value);
    document.getElementById('missionVolumeDisplay').textContent = Math.round(val * 100) + '%';
    window.overlayAPI.setSettings({ missionSoundVolume: val });
  });

  document.getElementById('missionSoundChoice')?.addEventListener('change', (e)=>{
    window.overlayAPI.setSettings({ missionSoundChoice: e.target.value });
  });

  document.getElementById('blueprintSoundOverrideCheckbox')?.addEventListener('change', (e)=>{
    window.overlayAPI.setSettings({ blueprintSoundVolumeOverride: e.target.checked });
  });

  document.getElementById('blueprintSoundVolumeSlider')?.addEventListener('input', (e)=>{
    const val = parseFloat(e.target.value);
    document.getElementById('blueprintVolumeDisplay').textContent = Math.round(val * 100) + '%';
    window.overlayAPI.setSettings({ blueprintSoundVolume: val });
  });

  document.getElementById('blueprintSoundChoice')?.addEventListener('change', (e)=>{
    window.overlayAPI.setSettings({ blueprintSoundChoice: e.target.value });
  });

  window.overlayAPI.onSettingsChanged(applySettingsToUI);
  window.overlayAPI.onOverlayVisibility(setToggleLabel);
  if(window.overlayAPI.onTimersVisibility) window.overlayAPI.onTimersVisibility(setTimersToggleLabel);
  if(window.overlayAPI.onHotkeyListVisibility) window.overlayAPI.onHotkeyListVisibility(setHotkeyListToggleLabel);
  if(window.overlayAPI.onDeclutterVisibility) window.overlayAPI.onDeclutterVisibility(setDeclutterToggleLabel);
  if(window.overlayAPI.onRebirthReqVisibility) window.overlayAPI.onRebirthReqVisibility(setRebirthReqToggleLabel);
  if(window.overlayAPI.onSneakVisibility) window.overlayAPI.onSneakVisibility(setSneakToggleLabel);
  if(window.overlayAPI.onCritGuideVisibility) window.overlayAPI.onCritGuideVisibility(setCritGuideToggleLabel);

  (async ()=>{
    const s = await window.overlayAPI.getSettings();
    applySettingsToUI(s);
    hotkeyHint.textContent = '';
  })();

  if(appVersionTag && window.overlayAPI.getAppVersion){
    window.overlayAPI.getAppVersion().then((v)=>{
      if(!v) return;
      appVersionTag.textContent = 'v' + v;
      appVersionTag.hidden = false;
    }).catch(()=>{ /* not fatal — the app works fine without the badge */ });
  }

  /* ============ DROID EDITOR (v1.10.5) ============
     Input new droids for levels 36+ when game updates. Store pending edits
     in userData, generate exportable code snippet. */

  const editorCycle = document.getElementById('editorCycle');
  const editorLevel = document.getElementById('editorLevel');
  const slotInputs = document.getElementById('slotInputs');
  const editorClearAllBtn = document.getElementById('editorClearAllBtn');
  const bulkImportBtn = document.getElementById('bulkImportBtn');
  const bulkImportText = document.getElementById('bulkImportText');
  const editorExportBtn = document.getElementById('editorExportBtn');
  const exportOutput = document.getElementById('exportOutput');

  // Store pending droid edits as { cycle: { level: [slot0, slot1, slot2], ... }, ... }
  let pendingEdits = {};

  function renderSlotInputs(){
    const cycle = parseInt(editorCycle.value, 10);
    const level = parseInt(editorLevel.value, 10);
    slotInputs.innerHTML = '';

    const rarities = ['B','G','D','R','K','X','S','Y'];
    for(let slot = 0; slot < 3; slot++){
      const pending = pendingEdits[cycle]?.[level]?.[slot];
      const rarity = pending ? pending[0] : '?';
      const name = pending ? pending[1] : '';

      const row = document.createElement('div');
      row.style.cssText = 'display: grid; grid-template-columns: 80px 1fr 80px; gap: 8px; margin-bottom: 10px; align-items: center;';

      const raritySelect = document.createElement('select');
      raritySelect.style.cssText = 'padding: 6px; background: rgba(10,14,12,0.5); border: 1px solid rgba(143,214,255,0.3); color: #fff; border-radius: 4px;';
      rarities.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = (RNAME?.[r] || r);
        if(r === rarity) opt.selected = true;
        raritySelect.appendChild(opt);
      });

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = `Slot ${slot + 1} droid name`;
      nameInput.value = name;
      nameInput.style.cssText = 'padding: 6px; background: rgba(10,14,12,0.5); border: 1px solid rgba(143,214,255,0.3); color: #fff; border-radius: 4px; font-family: monospace;';

      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn';
      saveBtn.textContent = 'Save';
      saveBtn.style.cssText = 'padding: 6px 12px;';
      saveBtn.addEventListener('click', ()=>{
        if(!pendingEdits[cycle]) pendingEdits[cycle] = {};
        if(!pendingEdits[cycle][level]) pendingEdits[cycle][level] = [['?','????'],['?','????'],['?','????']];
        pendingEdits[cycle][level][slot] = [raritySelect.value, nameInput.value || '????'];
        showToast(`Saved: Cycle ${cycle}, Level ${level}, Slot ${slot + 1}`);
      });

      row.appendChild(raritySelect);
      row.appendChild(nameInput);
      row.appendChild(saveBtn);
      slotInputs.appendChild(row);
    }
  }

  if(editorCycle && editorLevel){
    editorCycle.addEventListener('change', renderSlotInputs);
    editorLevel.addEventListener('change', renderSlotInputs);
    renderSlotInputs();
  }

  if(editorClearAllBtn){
    editorClearAllBtn.addEventListener('click', ()=>{
      if(confirm('Clear ALL pending droid edits? This cannot be undone.')){
        pendingEdits = {};
        renderSlotInputs();
        showToast('All pending edits cleared');
      }
    });
  }

  if(bulkImportBtn){
    bulkImportBtn.addEventListener('click', ()=>{
      const lines = bulkImportText.value.trim().split('\n');
      let count = 0;
      lines.forEach(line => {
        const parts = line.split(',').map(s => s.trim());
        if(parts.length < 5) return;
        const [c, l, s, r, n] = parts;
        const cycle = parseInt(c, 10);
        const level = parseInt(l, 10);
        const slot = parseInt(s, 10);
        if(!Number.isFinite(cycle) || !Number.isFinite(level) || !Number.isFinite(slot)) return;
        if(!pendingEdits[cycle]) pendingEdits[cycle] = {};
        if(!pendingEdits[cycle][level]) pendingEdits[cycle][level] = [['?','????'],['?','????'],['?','????']];
        pendingEdits[cycle][level][slot] = [r, n];
        count++;
      });
      renderSlotInputs();
      showToast(`Imported ${count} droid(s) from CSV`);
    });
  }

  if(editorExportBtn){
    editorExportBtn.addEventListener('click', ()=>{
      let code = '';
      const cycles = Object.keys(pendingEdits).sort((a, b) => parseInt(a) - parseInt(b));
      cycles.forEach(c => {
        const cycleNum = parseInt(c, 10);
        const levels = Object.keys(pendingEdits[c]).sort((a, b) => parseInt(a) - parseInt(b));
        levels.forEach(l => {
          const levelNum = parseInt(l, 10);
          const droids = pendingEdits[c][l];
          const droidStr = droids.map(d => `["${d[0]}","${d[1]}"]`).join(',');
          code += `CYCLES[${cycleNum}][${levelNum - 1}] = [${droidStr}];\n`;
        });
      });

      if(!code){
        showToast('No pending edits to export');
        return;
      }

      exportOutput.style.display = 'block';
      exportOutput.value = code;
      exportOutput.select();
      showToast('Code ready to copy — paste into droid-data.js after each cycle definition');
    });
  }
})();
