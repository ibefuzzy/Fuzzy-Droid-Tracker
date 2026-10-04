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
  const spawnAlertRepositionBtn = document.getElementById('spawnAlertRepositionBtn'); // v1.14.0
  const spawnAlertResetPosBtn = document.getElementById('spawnAlertResetPosBtn');
  const spawnAlertToggleBtn = document.getElementById('spawnAlertToggleBtn');
  const spawnAlertHoldSel = document.getElementById('spawnAlertHoldSel');
  const keybindsLockToggleBtn = document.getElementById('keybindsLockToggleBtn'); // v1.10.8

  /* Every "press to rebind" hotkey button: [button id, settings key, label].
     One table instead of seventeen hand-copied const/label/wire lines
     (2026-09-24) — a new hotkey only needs a row here, its map entries in
     main.js, a <button> in tracker.html and a ROWS entry in hotkey-list.html.
     Labels match main.js's HOTKEY_LABELS so a toast names each one the same
     way the startup-failure notice does. */
  const HOTKEY_BUTTONS = [
    ['hideAllHotkeyBtn', 'hideAllHotkey', 'Hide All Overlays'],
    ['overlayHotkeyBtn', 'hotkey', 'Toggle Next Droids Needed'],
    ['timersHotkeyBtn', 'timersHotkey', 'Toggle Timers'],
    ['rebirthScreenHotkeyBtn', 'rebirthScreenHotkey', 'Trigger Read Rebirth Screen'],
    ['rebirthScreenApplyHotkeyBtn', 'rebirthScreenApplyHotkey', 'Read Rebirth Screen: Apply'], // v1.11.1
    ['rebirthScreenCancelHotkeyBtn', 'rebirthScreenCancelHotkey', 'Read Rebirth Screen: Cancel'], // v1.11.1
    ['hotkeyListHotkeyBtn', 'hotkeyListHotkey', 'Toggle Hotkey List'],
    ['cycleNextHotkeyBtn', 'cycleNextHotkey', 'Next Cycle'], // v1.18.1
    ['cyclePrevHotkeyBtn', 'cyclePrevHotkey', 'Previous Cycle'],
    ['finishCycleHotkeyBtn', 'finishCycleHotkey', 'Finish Cycle (press twice)'],
    ['declutterHotkeyBtn', 'declutterHotkey', 'Toggle Safe to Retire List'],
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
    ['declutterRetiredHotkeyBtn', 'declutterRetiredHotkey', 'Safe to Retire: Show/Hide Retired'],
    ['rebirthReqHotkeyBtn', 'rebirthReqOverlayHotkey', 'Toggle Rebirth Requirements'],
    ['sneakHotkeyBtn', 'sneakHotkey', 'Toggle Sneak Preview'],
    ['sneakScrollUpHotkeyBtn', 'sneakScrollUpHotkey', 'Scroll Sneak Preview Up'],
    ['sneakScrollDownHotkeyBtn', 'sneakScrollDownHotkey', 'Scroll Sneak Preview Down'],
    ['critGuideHotkeyBtn', 'critGuideHotkey', 'Toggle Optimal Crit Guide'],
    ['critGuideScrollUpHotkeyBtn', 'critGuideScrollUpHotkey', 'Scroll Crit Guide Up'],
    ['critGuideScrollDownHotkeyBtn', 'critGuideScrollDownHotkey', 'Scroll Crit Guide Down'],
    ['spawnAlertHotkeyBtn', 'spawnAlertHotkey', 'Turn Spawn Alert On / Off'],
    // v1.10.3: hotkey-based marking in Next Droids Needed overlay
    ['markDroidBtn', 'markDroid', 'Mark Selected Droid'],
    ['markLevelBtn', 'markLevel', 'Mark Entire Level'],
    ['markLeftBtn', 'markLeft', 'Navigate Left'],
    ['markRightBtn', 'markRight', 'Navigate Right'],
    ['markUpBtn', 'markUp', 'Navigate Up'],
    ['markDownBtn', 'markDown', 'Navigate Down'],
    ['hudFriendHotkeyBtn', 'hudFriendHotkey', 'Next Droids Needed: Switch You / Friends'], // v1.16.0
    // v1.10.3: hotkey-based marking in Rebirth Requirements overlay
    ['rebirthMarkDroidBtn', 'rebirthMarkDroid', 'Mark Selected Droid (Rebirth Reqs / Sneak Preview / Safe to Retire)'],
    ['rebirthMarkLeftBtn', 'rebirthMarkLeft', 'Navigate Left (Rebirth Reqs / Sneak Preview / Safe to Retire)'],
    ['rebirthMarkRightBtn', 'rebirthMarkRight', 'Navigate Right (Rebirth Reqs / Sneak Preview / Safe to Retire)'],
    ['rebirthMarkUpBtn', 'rebirthMarkUp', 'Navigate Up (Rebirth Reqs / Sneak Preview / Safe to Retire)'],
    ['rebirthMarkDownBtn', 'rebirthMarkDown', 'Navigate Down (Rebirth Reqs / Sneak Preview / Safe to Retire)'],
    ['markTargetHotkeyBtn', 'markTargetHotkey', 'Switch Mark Keys to the Next Open List'], // v1.11.1
    // v1.10.8
    ['keybindsLockHotkeyBtn', 'keybindsLockHotkey', 'Lock/Unlock All Keybinds']
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
  const COLOR_ROW_DEFAULT = DEFAULT_BORDERS; // requirements.js; timersBorder's default is null = no skin
  const colorRows = Array.from(document.querySelectorAll('.color-row[data-color-key]'));
  colorRows.forEach(row=>{
    const key = row.dataset.colorKey;
    const wrap = row.querySelector('.color-swatches');
    if(!wrap) return;
    if(COLOR_ROW_DEFAULT[key] === null){ // v1.13.0 timers: a "no skin" choice first
      const none = document.createElement('button');
      none.type = 'button';
      none.className = 'swatch none-swatch';
      none.title = 'None: the classic timer look';
      none.style.setProperty('--sw', '#8fa1ad');
      none.textContent = '⊘';
      none.dataset.colorValue = '';
      wrap.appendChild(none);
    }
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
  if(spawnAlertToggleBtn) spawnAlertToggleBtn.hidden = false;
  if(keybindsLockToggleBtn) keybindsLockToggleBtn.hidden = false;

  let opacityDebounce = null;
  const capturing = {}; // settingsKey -> bool, so two hotkey rows never step on each other

  // v1.14.3: the overlay tiles (tracker.html's .overlay-board) keep a fixed
  // name and show on/off with their light (.on), so a click never changes a
  // tile's width. Never set their textContent: it would wipe the light.
  function setTile(btn, on){
    if(!btn) return;
    btn.classList.toggle('on', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function setToggleLabel(visible){ setTile(toggleBtn, visible); }
  function setTimersToggleLabel(visible){ setTile(timersToggleBtn, visible); }
  function setHotkeyListToggleLabel(visible){ setTile(hotkeyListToggleBtn, visible); }
  function setDeclutterToggleLabel(visible){ setTile(declutterToggleBtn, visible); }
  function setRebirthReqToggleLabel(visible){ setTile(rebirthReqToggleBtn, visible); }
  function setSneakToggleLabel(visible){ setTile(sneakToggleBtn, visible); }
  function setCritGuideToggleLabel(visible){ setTile(critGuideToggleBtn, visible); }
  function setSpawnAlertToggleLabel(visible){ setTile(spawnAlertToggleBtn, visible); }

  // v1.10.8: inverted sense vs. the toggles above — "on" (accent-highlighted)
  // means LOCKED, since that's the state worth calling attention to.
  function setKeybindsLockToggleLabel(locked){
    if(!keybindsLockToggleBtn) return;
    keybindsLockToggleBtn.textContent = locked ? '🔒 Keybinds locked' : '🔓 Keybinds unlocked';
    keybindsLockToggleBtn.classList.toggle('on', !!locked);
  }

  function applySettingsToUI(settings){
    // v1.17.0 Rarity on each droid (one setting for every droid overlay, not part of the colour looks)
    const rarityStyle = rarityStyleOf(settings.overlayRarityStyle);
    document.querySelectorAll('[data-rarity-style]').forEach(b=>{ b.classList.toggle('on', b.dataset.rarityStyle === rarityStyle); });
    HOTKEY_BUTTONS.forEach(({ btn, settingsKey })=>{
      if(btn && !capturing[settingsKey]) btn.textContent = settings[settingsKey] || '(none set)';
    });
    tierBtns.forEach(b=>{ b.classList.toggle('on', settings[b.dataset.tierKey] !== false); });
    if(tierAllBtn) tierAllBtn.classList.toggle('on', TIER_KEYS.every(k => settings[k] !== false));
    colorRows.forEach(row=>{
      const key = row.dataset.colorKey;
      const active = settings[key] || COLOR_ROW_DEFAULT[key] || ''; // '' = the timers' "none" swatch
      row.querySelectorAll('.swatch').forEach(b=>{
        b.classList.toggle('active', b.dataset.colorValue === active);
      });
    });
    opacityRange.value = settings.opacity != null ? settings.opacity : 0.55;
    applyAppearanceUI(settings);
    setToggleLabel(settings.visible);
    setTimersToggleLabel(settings.timersVisible);
    setDeclutterToggleLabel(settings.declutterVisible);
    setRebirthReqToggleLabel(settings.rebirthReqVisible);
    setSneakToggleLabel(settings.sneakVisible);
    setCritGuideToggleLabel(settings.critGuideVisible);
    setSpawnAlertToggleLabel(settings.spawnAlertVisible);
    setKeybindsLockToggleLabel(settings.keybindsLocked);
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
    if(spawnAlertRepositionBtn){
      spawnAlertRepositionBtn.textContent = settings.spawnAlertLocked ? '🎯 Drag into place' : '🔓 Unlocked — drag the sample alert, then use its Lock button';
      spawnAlertRepositionBtn.classList.toggle('on', !settings.spawnAlertLocked);
    }
    if(spawnAlertHoldSel) spawnAlertHoldSel.value = String(settings.spawnAlertHoldSec || 6);
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
    const blueprintSoundOverride = document.getElementById('blueprintSoundOverrideCheckbox');
    if(blueprintSoundOverride) blueprintSoundOverride.checked = settings.blueprintSoundVolumeOverride !== false;
    const blueprintSoundVolumeSlider = document.getElementById('blueprintSoundVolumeSlider');
    if(blueprintSoundVolumeSlider) {
      blueprintSoundVolumeSlider.value = settings.blueprintSoundVolume != null ? settings.blueprintSoundVolume : 0.35;
      const blueprintVolumeDisplay = document.getElementById('blueprintVolumeDisplay');
      if(blueprintVolumeDisplay) blueprintVolumeDisplay.textContent = Math.round((settings.blueprintSoundVolume || 0.35) * 100) + '%';
    }
    renderSounds(settings); // v1.13.0: the per-timer pickers + your own sounds
    renderSpawnRules(settings); // v1.14.0: Filters → 📡 Spawn Alert grid + sound
    renderMissionWarn(settings); // v1.14.1: Timers → ⚠ Mission warning
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
        await window.overlayAPI.setSettings({ [key]: b.dataset.colorValue || null });
      });
    });
  });

  /* v1.11.1 controls: Appearance colours, Layout snapping, timer layout/size.
     Pickers and sliders fire on every pixel of a drag, and each settings save
     writes the file and re-broadcasts to every window, so they're batched. */
  const pendingSettings = {};
  let pendingTimer = null;
  function flushSettings(){
    clearTimeout(pendingTimer);
    pendingTimer = null;
    if(!Object.keys(pendingSettings).length) return;
    const p = { ...pendingSettings };
    Object.keys(pendingSettings).forEach(k => delete pendingSettings[k]);
    window.overlayAPI.setSettings(p);
  }
  function setSettingsSoon(partial){
    Object.assign(pendingSettings, partial);
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(flushSettings, 120);
  }
  // An immediate change joins anything still batched and goes now, so a delayed
  // save from a moment earlier can never land after it and undo it.
  function setSettingsNow(partial){
    Object.assign(pendingSettings, partial);
    flushSettings();
  }
  function discardPendingSettings(){
    clearTimeout(pendingTimer);
    pendingTimer = null;
    Object.keys(pendingSettings).forEach(k => delete pendingSettings[k]);
  }

  // null in a theme setting = each overlay's own default (overlay-theme.css),
  // which is what the pickers show until something is chosen.
  const THEME_ROWS = [
    { row: document.getElementById('themeBackdropRow'), color: document.getElementById('themeBackdropColor'), colorKey: 'themeBackdrop', colorDefault: '#0a0e0c',
      alpha: document.getElementById('themeBackdropAlpha'), alphaVal: document.getElementById('themeBackdropAlphaVal'), alphaKey: 'themeBackdropAlpha', alphaDefault: 0.62,
      reset: document.getElementById('themeBackdropDefaultBtn') },
    { row: document.getElementById('themeBoxRow'), color: document.getElementById('themeBoxColor'), colorKey: 'themeBox', colorDefault: '#ffffff',
      alpha: document.getElementById('themeBoxAlpha'), alphaVal: document.getElementById('themeBoxAlphaVal'), alphaKey: 'themeBoxAlpha', alphaDefault: 0.06,
      reset: document.getElementById('themeBoxDefaultBtn') },
    { row: document.getElementById('themeHighlightRow'), color: document.getElementById('themeHighlightColor'), colorKey: 'themeHighlight', colorDefault: '#5ef2a6',
      reset: document.getElementById('themeHighlightDefaultBtn') }
  ];
  /* "Edit colors for" (v1.13.0): '' = all overlays (the theme* settings), or one
     overlay's own overrides in settings.overlayThemes[name]; effectiveTheme() in
     requirements.js puts those on top. Rows show that overlay's effective values;
     Default drops its override so it follows All overlays again. The timers use
     the backdrop only; the HUD's backdrop opacity is its Layout slider. */
  const themeTargetSel = document.getElementById('themeTargetSel');
  const themeTargetHint = document.getElementById('themeTargetHint');
  const themeCardRow = document.getElementById('themeCardRow');
  const themeTextScale = document.getElementById('themeTextScale');
  const themeTextScaleVal = document.getElementById('themeTextScaleVal');
  const themeCompactCheck = document.getElementById('themeCompactCheck');
  const themeCardDefaultBtn = document.getElementById('themeCardDefaultBtn');
  let lastSettings = {};
  // overlayThemes as last edited here, kept until the settings echo catches up,
  // so quick edits to one overlay never build on a stale copy
  let pendingOverlayThemes = null;
  const themeTarget = () => themeTargetSel.value;
  function setTheme(partial, soon){
    const t = themeTarget();
    let out = partial;
    if(t){
      const ot = JSON.parse(JSON.stringify(pendingOverlayThemes || lastSettings.overlayThemes || {}));
      const mine = { ...(ot[t] || {}) };
      Object.entries(partial).forEach(([k, v]) => { if(v === null) delete mine[k]; else mine[k] = v; });
      if(Object.keys(mine).length) ot[t] = mine; else delete ot[t];
      pendingOverlayThemes = ot;
      out = { overlayThemes: ot };
    }
    if(soon) setSettingsSoon(out); else setSettingsNow(out);
  }
  function applyLook(name, look, verb, extra){
    discardPendingSettings(); // a colour tweak still in flight must not land on top of the look
    pendingOverlayThemes = null;
    window.overlayAPI.setSettings({ ...lookToSettings(look), ...(extra || {}) });
    showToast(name + ' ' + (verb || 'applied'));
  }

  /* Presets (v1.12.0) + your saved looks (v1.13.0, settings.customPresets =
     [{name, look}]). Every entry is a "look" (requirements.js); the highlighted
     one matches the settings exactly. Names come from the player or a pasted
     code, so they're only ever set with textContent. */
  const presetGrid = document.getElementById('themePresetGrid');
  const lookNameInput = document.getElementById('lookNameInput');
  const lookCodeInput = document.getElementById('lookCodeInput');
  const MAX_CUSTOM_PRESETS = 24;
  let presetItems = [], presetListKey = null;
  function customPresetsOf(s){ return Array.isArray(s.customPresets) ? s.customPresets.filter(c => c && typeof c.name === 'string') : []; }
  // appLookKey: a built-in preset's matching app look (THEME_PRESETS' appLook),
  // applied too while "presets also switch the app look" is on. Saved looks have none.
  function presetButton(name, look, skinKey, title, appLookKey){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset-btn';
    const skin = skinKey && BORDER_SKINS[skinKey];
    b.style.setProperty('--sw', skin ? skin.hex : '#8fd6ff');
    const badge = document.createElement('span');
    badge.className = 'preset-badge';
    if(skin) badge.innerHTML = borderIconSvg(skinKey, 16); else badge.textContent = '↺';
    const label = document.createElement('span');
    label.textContent = name;
    b.append(badge, label);
    b.title = title;
    b.addEventListener('click', ()=>{
      if(appLookKey && lastSettings.appLookFollowsPresets !== false){
        applyAppLook(appLookKey); // straight away; the settings echo repeats it as a no-op
        applyLook(name, look, 'applied to every overlay and the app', { appLook: appLookKey });
      } else {
        applyLook(name, look, 'applied to every overlay');
      }
    });
    return b;
  }
  function renderPresets(s){
    const customs = customPresetsOf(s);
    const key = JSON.stringify(customs);
    if(key !== presetListKey){
      presetListKey = key;
      presetGrid.textContent = '';
      presetItems = [];
      THEME_PRESETS.forEach(p => {
        const look = presetToLook(p);
        const skin = p.skin && BORDER_SKINS[p.skin];
        const b = presetButton(p.name, look, p.skin, skin ? p.name + ': ' + skin.label + ' border and matching colors on every overlay' : "Each overlay's own border and colors", p.appLook);
        presetGrid.appendChild(b);
        presetItems.push({ el: b, look });
      });
      customs.forEach((c, i) => {
        const look = sanitizeLook(c.look);
        const item = document.createElement('div');
        item.className = 'preset-item';
        const b = presetButton(c.name, look, look.borders.border, 'Your saved look: ' + c.name);
        const share = document.createElement('button');
        share.type = 'button'; share.className = 'preset-act'; share.textContent = '⧉'; share.title = 'Copy a share code for "' + c.name + '"';
        share.addEventListener('click', ()=>{
          const code = encodeLookCode(c.name, look);
          const fallback = ()=>{ lookCodeInput.value = code; lookCodeInput.select(); showToast('Copy the code from the box below'); };
          if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(()=> showToast('Share code for "' + c.name + '" copied — a friend pastes it into Import'), fallback);
          else fallback();
        });
        const del = document.createElement('button');
        del.type = 'button'; del.className = 'preset-act'; del.textContent = '✕'; del.title = 'Delete "' + c.name + '"';
        del.addEventListener('click', ()=>{
          if(!confirm('Delete your saved look "' + c.name + '"? (The overlays keep their current look.)')) return;
          window.overlayAPI.setSettings({ customPresets: customPresetsOf(lastSettings).filter((_, j) => j !== i) });
        });
        item.append(b, share, del);
        presetGrid.appendChild(item);
        presetItems.push({ el: b, look });
      });
    }
    const cur = lookFromSettings(s);
    presetItems.forEach(({ el, look }) => el.classList.toggle('active', looksEqual(look, cur)));
  }
  document.getElementById('lookSaveBtn').addEventListener('click', ()=>{
    const customs = customPresetsOf(lastSettings);
    const name = (lookNameInput.value || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || ('My look ' + (customs.length + 1));
    const next = customs.filter(c => c.name !== name);
    if(next.length >= MAX_CUSTOM_PRESETS){ showToast('You have ' + MAX_CUSTOM_PRESETS + ' saved looks — delete one first'); return; }
    next.push({ name, look: lookFromSettings({ ...lastSettings, ...pendingSettings }) }); // includes a tweak still being batched
    window.overlayAPI.setSettings({ customPresets: next });
    lookNameInput.value = '';
    showToast('Saved "' + name + '"' + (next.length === customs.length ? ' (replaced the old one)' : ''));
  });
  document.getElementById('lookImportBtn').addEventListener('click', ()=>{
    const got = decodeLookCode(lookCodeInput.value);
    if(!got){ showToast("That isn't a look code — they start with FDT1."); return; }
    const customs = customPresetsOf(lastSettings);
    if(customs.length >= MAX_CUSTOM_PRESETS){ showToast('You have ' + MAX_CUSTOM_PRESETS + ' saved looks — delete one first'); return; }
    let name = got.name, n = 2;
    while(customs.some(c => c.name === name)) name = got.name.slice(0, 35) + ' (' + (n++) + ')';
    window.overlayAPI.setSettings({ customPresets: customs.concat({ name, look: got.look }) });
    lookCodeInput.value = '';
    applyLook('"' + name + '"', got.look, 'imported and applied');
  });

  /* App looks (v1.15.0): the tracker window's own colours, APP_LOOKS in
     requirements.js. A look sets tracker.html's theme variables on <html>;
     'default' clears them so its own :root applies. The variables are also kept
     in localStorage, and tracker.html's <head> puts them back before the first
     paint, so a themed tracker never flashes the default colours on launch. */
  const APP_LOOK_CACHE_KEY = 'fdt-appLookVars';
  const appLookGrid = document.getElementById('appLookGrid');
  const appLookFollowCheck = document.getElementById('appLookFollowsPresetsCheck');
  let appliedAppLook = null;
  function applyAppLook(key){
    const look = appLookFor(key);
    if(look.key === appliedAppLook) return; // settings echoes re-apply nothing
    appliedAppLook = look.key;
    const roots = [document.documentElement];
    const pip = window.documentPictureInPicture && window.documentPictureInPicture.window; // ⧉ Pop out
    if(pip) roots.push(pip.document.documentElement);
    const vars = appLookCssVars(look);
    roots.forEach(root => Object.entries(vars).forEach(([name, value]) => {
      if(look.key === 'default') root.style.removeProperty(name); else root.style.setProperty(name, value);
    }));
    try{
      if(look.key === 'default') localStorage.removeItem(APP_LOOK_CACHE_KEY);
      else localStorage.setItem(APP_LOOK_CACHE_KEY, document.documentElement.style.cssText);
    }catch(e){ /* storage off: the look still applies, it just can't pre-paint next launch */ }
  }
  const appLookBtns = APP_LOOKS.map(look => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset-btn';
    b.dataset.appLook = look.key;
    b.style.setProperty('--sw', 'rgb(' + look.accent + ')');
    const chip = document.createElement('span');
    chip.className = 'app-look-chip';
    chip.style.background = 'linear-gradient(135deg, rgb(' + look.bg + ') 0 44%, rgb(' + look.holo + ') 44% 72%, rgb(' + look.accent + ') 72%)';
    const label = document.createElement('span');
    label.textContent = look.name;
    b.append(chip, label);
    b.title = look.name + ': ' + look.note;
    b.addEventListener('click', ()=>{
      applyAppLook(look.key);
      setSettingsNow({ appLook: look.key });
      showToast('App look: ' + look.name);
    });
    appLookGrid.appendChild(b);
    return b;
  });
  appLookFollowCheck.addEventListener('change', ()=> setSettingsNow({ appLookFollowsPresets: appLookFollowCheck.checked }));
  function renderAppLook(s){
    const key = appLookFor(s.appLook).key;
    applyAppLook(key);
    appLookBtns.forEach(b => b.classList.toggle('active', b.dataset.appLook === key));
    appLookFollowCheck.checked = s.appLookFollowsPresets !== false;
  }

  const themeHighlightBorderBtn = document.getElementById('themeHighlightBorderBtn');
  const themeResetBtn = document.getElementById('themeResetBtn');
  const overlaySnapCheckbox = document.getElementById('overlaySnapCheckbox');
  const updateCheckCheckbox = document.getElementById('updateCheckCheckbox');
  const overlaySnapSizeCheckbox = document.getElementById('overlaySnapSizeCheckbox');
  const timersLayoutBtns = Array.from(document.querySelectorAll('[data-timers-layout]'));
  const timersScaleRange = document.getElementById('timersScaleRange');
  const timersScaleVal = document.getElementById('timersScaleVal');
  const pct = (v) => Math.round(v * 100) + '%';

  THEME_ROWS.forEach(r=>{
    r.color.addEventListener('input', ()=> setTheme({ [r.colorKey]: r.color.value }, true));
    if(r.alpha){
      r.alpha.addEventListener('input', ()=>{
        const v = parseFloat(r.alpha.value);
        r.alphaVal.textContent = pct(v);
        setTheme({ [r.alphaKey]: v }, true);
      });
    }
    r.reset.addEventListener('click', ()=>{
      const partial = { [r.colorKey]: null };
      if(r.alpha) partial[r.alphaKey] = null;
      setTheme(partial);
    });
  });
  themeHighlightBorderBtn.addEventListener('click', ()=> setTheme({ themeHighlight: 'border' }));
  themeTextScale.addEventListener('input', ()=>{
    const v = parseFloat(themeTextScale.value);
    themeTextScaleVal.textContent = pct(v);
    setTheme({ themeTextScale: v }, true);
  });
  // one overlay can opt OUT of an all-overlays Compact, so it stores false there
  themeCompactCheck.addEventListener('change', ()=> setTheme({ themeCompact: themeCompactCheck.checked ? true : (themeTarget() ? false : null) }));
  themeCardDefaultBtn.addEventListener('click', ()=> setTheme({ themeTextScale: null, themeCompact: null }));
  // v1.17.0: Rarity on each droid, applied by overlay-theme.js in every overlay
  document.querySelectorAll('[data-rarity-style]').forEach(b=>{
    b.addEventListener('click', ()=> setSettingsNow({ overlayRarityStyle: rarityStyleOf(b.dataset.rarityStyle) }));
  });
  themeTargetSel.addEventListener('change', ()=> applyAppearanceUI(lastSettings));
  themeResetBtn.addEventListener('click', ()=>{
    const t = themeTarget();
    if(t){
      const ot = JSON.parse(JSON.stringify(pendingOverlayThemes || lastSettings.overlayThemes || {}));
      delete ot[t];
      pendingOverlayThemes = null;
      setSettingsNow({ overlayThemes: ot });
      showToast(themeTargetSel.selectedOptions[0].textContent + ' follows All overlays again');
    } else {
      const partial = { overlayThemes: {} };
      THEME_KEYS.forEach(k => { partial[k] = null; });
      discardPendingSettings();
      pendingOverlayThemes = null;
      window.overlayAPI.setSettings(partial);
      showToast('Overlay colors reset to default');
    }
  });
  overlaySnapCheckbox.addEventListener('change', ()=> window.overlayAPI.setSettings({ overlaySnap: overlaySnapCheckbox.checked }));
  updateCheckCheckbox.addEventListener('change', ()=>{
    window.overlayAPI.setSettings({ updateCheck: updateCheckCheckbox.checked });
    // off hides the banner now; on shows it again if one is waiting (the daily read happens next launch)
    setTimeout(()=> window.overlayAPI.getUpdate().then(showUpdateBanner), 150);
  });

  // v1.18.0 update notice (update-check.js in main.js): textContent only, the note is never HTML
  const updateBanner = document.getElementById('updateBanner');
  function showUpdateBanner(info){
    if(!info){ updateBanner.hidden = true; return; }
    document.getElementById('updateVersion').textContent = info.version;
    document.getElementById('updateNote').textContent = info.note ? ' ' + info.note : '';
    window.overlayAPI.getAppVersion().then(v=>{ document.getElementById('updateCurrent').textContent = v; });
    updateBanner.hidden = false;
  }
  document.getElementById('updateDownloadBtn').addEventListener('click', ()=> window.overlayAPI.openUpdatePage());
  document.getElementById('updateDismissBtn').addEventListener('click', ()=> window.overlayAPI.dismissUpdate());
  window.overlayAPI.onUpdateState(showUpdateBanner);
  window.overlayAPI.getUpdate().then(showUpdateBanner);
  overlaySnapSizeCheckbox.addEventListener('change', ()=> window.overlayAPI.setSettings({ overlaySnapSize: overlaySnapSizeCheckbox.checked }));
  timersLayoutBtns.forEach(b => b.addEventListener('click', ()=> window.overlayAPI.setSettings({ timersLayout: b.dataset.timersLayout })));
  timersScaleRange.addEventListener('input', ()=>{
    const v = parseFloat(timersScaleRange.value);
    timersScaleVal.textContent = pct(v);
    setSettingsSoon({ timersScale: v });
  });

  /* Alert sounds (v1.13.0). Every timer's picker lists the built-ins plus your own
     files (settings.customSounds, copied into the app's folder by main.js
     'sound:add'). Stellar/Mythic/Kyber can follow the Blueprints pick (''). ▶ plays
     through alert-sound.js, exactly as the timers will. */
  const BUILTIN_SOUNDS = [['goodnews', 'Good news, everyone!'], ['beep', 'Beep'], ['boop', 'Boop'], ['chime', 'Chime'], ['off', 'Off']];
  const SOUND_KEYS = ['missionSoundChoice', 'blueprintSoundChoice', 'stellarSoundChoice', 'mythicSoundChoice', 'kyberSoundChoice'];
  const SOUND_INHERITS = { stellarSoundChoice: true, mythicSoundChoice: true, kyberSoundChoice: true };
  const customSoundList = document.getElementById('customSoundList');
  const readCustomSound = (id) => window.overlayAPI.readCustomSound(id);
  let soundListKey = null;
  function soundVolume(key){
    const s = lastSettings;
    const master = s.timerSoundVolume || 0.35;
    if(key === 'missionSoundChoice') return s.missionSoundVolumeOverride ? (s.missionSoundVolume || 0.35) : master;
    return s.blueprintSoundVolumeOverride ? (s.blueprintSoundVolume || 0.35) : master;
  }
  function preview(choice, key){
    playAlert(choice, soundVolume(key), readCustomSound).catch(()=> showToast("Couldn't play that sound — the file may be damaged or in a format this app can't read"));
  }
  function option(value, text){ const o = document.createElement('option'); o.value = value; o.textContent = text; return o; }
  function renderSounds(s){
    const customs = Array.isArray(s.customSounds) ? s.customSounds : [];
    const key = JSON.stringify(customs);
    if(key !== soundListKey){
      soundListKey = key;
      SOUND_KEYS.forEach(k => {
        const sel = document.getElementById(k);
        sel.textContent = '';
        if(SOUND_INHERITS[k]) sel.appendChild(option('', 'Same as Blueprints'));
        BUILTIN_SOUNDS.forEach(([v, t]) => sel.appendChild(option(v, t)));
        customs.forEach(c => sel.appendChild(option('custom:' + c.id, '🎵 ' + c.name)));
      });
      customSoundList.textContent = '';
      if(!customs.length){
        const none = document.createElement('div');
        none.className = 'pos-hint';
        none.textContent = 'No sounds added yet.';
        customSoundList.appendChild(none);
      }
      customs.forEach(c => {
        const row = document.createElement('div');
        row.className = 'custom-sound-row';
        const name = document.createElement('span');
        name.textContent = '🎵 ' + c.name;
        const play = document.createElement('button');
        play.type = 'button'; play.className = 'btn'; play.textContent = '▶'; play.title = 'Preview';
        play.addEventListener('click', ()=> preview('custom:' + c.id, 'blueprintSoundChoice'));
        const del = document.createElement('button');
        del.type = 'button'; del.className = 'btn'; del.textContent = '✕'; del.title = 'Remove this sound';
        del.addEventListener('click', ()=>{
          if(!confirm('Remove "' + c.name + '"? Any timer using it goes back to its default sound.')) return;
          window.overlayAPI.removeCustomSound(c.id);
        });
        row.append(name, play, del);
        customSoundList.appendChild(row);
      });
    }
    SOUND_KEYS.forEach(k => {
      const sel = document.getElementById(k);
      const fallback = SOUND_INHERITS[k] ? '' : 'goodnews';
      sel.value = s[k] || fallback;
      if(sel.selectedIndex < 0) sel.value = fallback; // e.g. a removed file
    });
  }
  SOUND_KEYS.forEach(k => {
    document.getElementById(k).addEventListener('change', (e)=> window.overlayAPI.setSettings({ [k]: e.target.value || null }));
  });
  document.querySelectorAll('[data-sound-for]').forEach(b => b.addEventListener('click', ()=>{
    const k = b.dataset.soundFor;
    const choice = document.getElementById(k).value || document.getElementById('blueprintSoundChoice').value;
    preview(choice, k);
  }));
  document.getElementById('customSoundAddBtn').addEventListener('click', async ()=>{
    const r = await window.overlayAPI.addCustomSound();
    if(r && r.ok) showToast('Added "' + r.sound.name + '" — pick it for any timer above');
    else if(r && r.reason && r.reason !== 'cancelled') showToast(r.reason);
  });

  /* 📡 Spawn Alert rules (v1.14.0, ⚙ Overlay Settings → Filters): a grid of the
     types x tiers in spawn-parse.js, each box Off / Show / Show + sound
     (spawnRuleFor()); only boxes that aren't plain Show are saved
     (cleanSpawnRules()). pendingSpawnRules keeps a quick run of clicks from being
     undone by the settings echo of an earlier click. The sound list is the timers'
     built-ins (minus Off: a box without 🔊 is already silent) + your own files. */
  const spawnRuleGrid = document.getElementById('spawnRuleGrid');
  const spawnSoundSel = document.getElementById('spawnAlertSound');
  const spawnVolume = document.getElementById('spawnAlertVolume');
  const spawnVolumeVal = document.getElementById('spawnAlertVolumeVal');
  const RULE_TEXT = ['Off', 'Show', 'Show 🔊'];
  const capWord = (w) => w[0].toUpperCase() + w.slice(1);
  const ruleCells = {};
  let spawnRules = {}, pendingSpawnRules = null, spawnSoundKey = null;
  function ruleOf(k){ const [v, t] = k.split('|'); return spawnRuleFor(spawnRules, v, t); }
  function setRules(r){
    spawnRules = cleanSpawnRules(r);
    pendingSpawnRules = spawnRules;
    paintRules();
    window.overlayAPI.setSettings({ spawnAlertRules: spawnRules });
  }
  function cycleMany(keys){
    const next = (ruleOf(keys[0]) + 1) % 3, r = { ...spawnRules };
    keys.forEach(k => { r[k] = next; });
    setRules(r);
  }
  function allRules(fn){
    const r = {};
    Object.keys(ruleCells).forEach(k => { r[k] = fn(ruleOf(k)); });
    setRules(r);
  }
  (function buildSpawnRuleGrid(){
    const head = spawnRuleGrid.insertRow();
    const corner = document.createElement('th');
    corner.className = 'corner';
    head.appendChild(corner);
    SPAWN_TIERS.forEach(t => {
      const th = document.createElement('th');
      th.textContent = capWord(t);
      th.style.color = 'var(--t-' + t + ')';
      th.title = 'Change every ' + capWord(t) + ' spawn';
      th.addEventListener('click', ()=> cycleMany(SPAWN_VARIANTS.map(v => v + '|' + t)));
      head.appendChild(th);
    });
    SPAWN_VARIANTS.forEach(v => {
      const tr = spawnRuleGrid.insertRow();
      const th = document.createElement('th');
      th.className = 'row';
      th.title = 'Change every ' + capWord(v) + ' spawn';
      const name = document.createElement('span');
      name.className = 'spawn-type v-' + v;
      name.textContent = capWord(v);
      th.appendChild(name);
      th.addEventListener('click', ()=> cycleMany(SPAWN_TIERS.map(t => v + '|' + t)));
      tr.appendChild(th);
      SPAWN_TIERS.forEach(t => {
        const k = v + '|' + t;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'spawn-rule-cell';
        b.style.setProperty('--tc', 'var(--t-' + t + ')');
        b.title = capWord(v) + ' ' + capWord(t) + ': click for Off → Show → Show + sound';
        b.addEventListener('click', ()=> setRules({ ...spawnRules, [k]: (ruleOf(k) + 1) % 3 }));
        tr.insertCell().appendChild(b);
        ruleCells[k] = b;
      });
    });
  })();
  function paintRules(){
    let shown = 0, loud = 0;
    Object.keys(ruleCells).forEach(k => {
      const r = ruleOf(k), b = ruleCells[k];
      b.className = 'spawn-rule-cell' + (r === SPAWN_RULE_SHOW ? ' show' : r === SPAWN_RULE_SOUND ? ' sound' : '');
      b.textContent = RULE_TEXT[r];
      if(r !== SPAWN_RULE_OFF) shown++;
      if(r === SPAWN_RULE_SOUND) loud++;
    });
    document.getElementById('spawnRuleSummary').textContent = 'Shows ' + shown + ' of ' + Object.keys(ruleCells).length + ' kinds · sound for ' + loud + '.';
  }
  function renderSpawnRules(s){
    const saved = cleanSpawnRules(s.spawnAlertRules);
    if(pendingSpawnRules && JSON.stringify(saved) === JSON.stringify(pendingSpawnRules)) pendingSpawnRules = null;
    if(!pendingSpawnRules) spawnRules = saved;
    paintRules();
    const customs = Array.isArray(s.customSounds) ? s.customSounds : [];
    const key = JSON.stringify(customs);
    if(key !== spawnSoundKey){
      spawnSoundKey = key;
      spawnSoundSel.textContent = '';
      BUILTIN_SOUNDS.filter(([v]) => v !== 'off').forEach(([v, t]) => spawnSoundSel.appendChild(option(v, t)));
      customs.forEach(c => spawnSoundSel.appendChild(option('custom:' + c.id, '🎵 ' + c.name)));
    }
    spawnSoundSel.value = s.spawnAlertSound || 'goodnews';
    if(spawnSoundSel.selectedIndex < 0) spawnSoundSel.value = 'goodnews'; // e.g. a removed file
    const vol = typeof s.spawnAlertVolume === 'number' ? s.spawnAlertVolume : 0.35;
    if(document.activeElement !== spawnVolume){ spawnVolume.value = vol; spawnVolumeVal.textContent = Math.round(vol * 100) + '%'; }
  }
  document.getElementById('spawnRuleAllShowBtn').addEventListener('click', ()=> allRules(r => Math.max(SPAWN_RULE_SHOW, r)));
  document.getElementById('spawnRuleAllSoundBtn').addEventListener('click', ()=> allRules(()=> SPAWN_RULE_SOUND));
  document.getElementById('spawnRuleNoSoundBtn').addEventListener('click', ()=> allRules(r => Math.min(SPAWN_RULE_SHOW, r)));
  spawnSoundSel.addEventListener('change', ()=> window.overlayAPI.setSettings({ spawnAlertSound: spawnSoundSel.value }));
  spawnVolume.addEventListener('input', ()=>{ spawnVolumeVal.textContent = Math.round(spawnVolume.value * 100) + '%'; });
  spawnVolume.addEventListener('change', ()=> window.overlayAPI.setSettings({ spawnAlertVolume: parseFloat(spawnVolume.value) }));
  /* ⚠ Mission warning (v1.14.1, Timers tab): a chip per MISSION_WARN_PRESETS time
     to toggle, plus up to MISSION_WARN_MAX_CUSTOM of the player's own (chips with ✕),
     all saved as settings.missionWarnTimes through cleanMissionWarnTimes()
     (requirements.js). timers.html plays settings.missionWarnSound at each one. */
  const warnChips = document.getElementById('missionWarnChips');
  const warnInput = document.getElementById('missionWarnInput');
  const warnMsg = document.getElementById('missionWarnMsg');
  const warnSoundSel = document.getElementById('missionWarnSound');
  const warnLine = document.getElementById('missionWarnLine');
  const warnVolume = document.getElementById('missionWarnVolume');
  const warnVolumeVal = document.getElementById('missionWarnVolumeVal');
  let warnTimes = [], pendingWarnTimes = null, warnSoundKey = null;
  const fmtWarn = (sec) => sec < 60 ? sec + ' s' : (sec % 60 ? Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') : (sec / 60) + ' min');
  function setWarnTimes(list){
    warnTimes = cleanMissionWarnTimes(list);
    pendingWarnTimes = warnTimes;
    paintWarn();
    window.overlayAPI.setSettings({ missionWarnTimes: warnTimes });
  }
  function warnChip(sec, on, own){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'warn-chip' + (on ? ' on' : '');
    b.textContent = fmtWarn(sec);
    if(own){
      const x = document.createElement('span');
      x.className = 'x';
      x.textContent = '✕';
      b.appendChild(x);
      b.title = 'Your own time: click to remove it';
      b.addEventListener('click', ()=> setWarnTimes(warnTimes.filter(v => v !== sec)));
    } else {
      b.title = on ? 'Click to stop this warning' : 'Click to warn ' + fmtWarn(sec) + ' before each mission';
      b.addEventListener('click', ()=> setWarnTimes(on ? warnTimes.filter(v => v !== sec) : warnTimes.concat(sec)));
    }
    return b;
  }
  function paintWarn(){
    warnChips.textContent = '';
    MISSION_WARN_PRESETS.forEach(sec => warnChips.appendChild(warnChip(sec, warnTimes.includes(sec), false)));
    warnTimes.filter(sec => !MISSION_WARN_PRESETS.includes(sec)).forEach(sec => warnChips.appendChild(warnChip(sec, true, true)));
    warnLine.textContent = '';
    if(warnTimes.length){
      const span = Math.max(150, ...warnTimes) * 1.08;
      warnTimes.concat(0).forEach(sec => {
        const t = document.createElement('div');
        t.className = 'warn-tick' + (sec ? '' : ' start');
        t.style.left = (100 - sec / span * 100) + '%';
        t.appendChild(document.createElement('i'));
        t.appendChild(document.createTextNode(sec ? fmtWarn(sec) : 'Mission'));
        warnLine.appendChild(t);
      });
    }
    document.getElementById('missionWarnSummary').textContent = warnTimes.length
      ? 'Warns ' + warnTimes.length + (warnTimes.length === 1 ? ' time' : ' times') + ' before each mission: ' + warnTimes.map(fmtWarn).join(', ') + ' before.'
      : 'No warnings: pick a time above.';
  }
  function renderMissionWarn(s){
    const saved = cleanMissionWarnTimes(s.missionWarnTimes);
    if(pendingWarnTimes && JSON.stringify(saved) === JSON.stringify(pendingWarnTimes)) pendingWarnTimes = null;
    if(!pendingWarnTimes) warnTimes = saved;
    paintWarn();
    const customs = Array.isArray(s.customSounds) ? s.customSounds : [];
    const key = JSON.stringify(customs);
    if(key !== warnSoundKey){
      warnSoundKey = key;
      warnSoundSel.textContent = '';
      BUILTIN_SOUNDS.filter(([v]) => v !== 'off').forEach(([v, t]) => warnSoundSel.appendChild(option(v, t)));
      customs.forEach(c => warnSoundSel.appendChild(option('custom:' + c.id, '🎵 ' + c.name)));
    }
    warnSoundSel.value = s.missionWarnSound || 'chime';
    if(warnSoundSel.selectedIndex < 0) warnSoundSel.value = 'chime'; // e.g. a removed file
    const vol = typeof s.missionWarnVolume === 'number' ? s.missionWarnVolume : 0.35;
    if(document.activeElement !== warnVolume){ warnVolume.value = vol; warnVolumeVal.textContent = Math.round(vol * 100) + '%'; }
  }
  function addOwnWarnTime(){
    const v = warnInput.value.trim();
    const m = /^(\d{1,2}):([0-5]\d)$/.exec(v); // m:ss, so 2:99 isn't a time
    const sec = m ? (+m[1]) * 60 + (+m[2]) : (/^\d{1,4}$/.test(v) ? +v : NaN);
    const [lo, hi] = MISSION_WARN_RANGE;
    let msg = '';
    if(!(sec >= lo && sec <= hi)) msg = 'Use ' + lo + ' s to ' + (hi / 60) + ' min, like 1:30 or 90.';
    else if(warnTimes.includes(sec)) msg = 'Already on.';
    else if(!MISSION_WARN_PRESETS.includes(sec) && warnTimes.filter(t => !MISSION_WARN_PRESETS.includes(t)).length >= MISSION_WARN_MAX_CUSTOM) msg = 'Up to ' + MISSION_WARN_MAX_CUSTOM + ' of your own: remove one first.';
    warnMsg.textContent = msg;
    if(msg) return;
    warnInput.value = '';
    setWarnTimes(warnTimes.concat(sec));
  }
  document.getElementById('missionWarnAddBtn').addEventListener('click', addOwnWarnTime);
  warnInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); addOwnWarnTime(); } });
  warnSoundSel.addEventListener('change', ()=> window.overlayAPI.setSettings({ missionWarnSound: warnSoundSel.value }));
  warnVolume.addEventListener('input', ()=>{ warnVolumeVal.textContent = Math.round(warnVolume.value * 100) + '%'; });
  warnVolume.addEventListener('change', ()=> window.overlayAPI.setSettings({ missionWarnVolume: parseFloat(warnVolume.value) }));
  document.getElementById('missionWarnPlayBtn').addEventListener('click', ()=>{
    playAlert(warnSoundSel.value || 'chime', parseFloat(warnVolume.value) || 0.35, readCustomSound)
      .catch(()=> showToast("Couldn't play that sound — the file may be damaged or in a format this app can't read"));
  });

  document.getElementById('spawnAlertSoundPlayBtn').addEventListener('click', ()=>{
    playAlert(spawnSoundSel.value || 'goodnews', parseFloat(spawnVolume.value) || 0.35, readCustomSound)
      .catch(()=> showToast("Couldn't play that sound — the file may be damaged or in a format this app can't read"));
  });

  function applyAppearanceUI(s){
    lastSettings = s;
    if(pendingOverlayThemes && JSON.stringify(s.overlayThemes || {}) === JSON.stringify(pendingOverlayThemes)) pendingOverlayThemes = null;
    const t = themeTarget();
    const all = lookFromSettings(s).theme;
    const own = t ? ((pendingOverlayThemes || s.overlayThemes || {})[t] || {}) : null;
    const v = t ? { ...all, ...own } : all;
    const isOwnDefault = (k) => own ? !(k in own) : v[k] == null;
    THEME_ROWS.forEach(r=>{
      const c = v[r.colorKey];
      // a control being dragged keeps its own value; the echo is a step behind
      if(document.activeElement !== r.color) r.color.value = /^#[0-9a-f]{6}$/i.test(c || '') ? c : r.colorDefault;
      let isDefault = isOwnDefault(r.colorKey);
      if(r.alpha){
        const a = typeof v[r.alphaKey] === 'number' ? v[r.alphaKey] : r.alphaDefault;
        if(document.activeElement !== r.alpha){ r.alpha.value = a; r.alphaVal.textContent = pct(a); }
        isDefault = isDefault && isOwnDefault(r.alphaKey);
      }
      r.row.classList.toggle('is-default', isDefault);
    });
    const ts = typeof v.themeTextScale === 'number' ? v.themeTextScale : 1;
    if(document.activeElement !== themeTextScale){ themeTextScale.value = ts; themeTextScaleVal.textContent = pct(ts); }
    themeCompactCheck.checked = v.themeCompact === true;
    themeCardRow.classList.toggle('is-default', isOwnDefault('themeTextScale') && isOwnDefault('themeCompact'));
    themeHighlightBorderBtn.classList.toggle('on', v.themeHighlight === 'border');
    // what applies to the chosen overlay
    const backdropOnly = t === 'timers' || t === 'spawnAlert'; // v1.14.0: the Spawn Alert has no boxes or selection
    ['themeBoxRow', 'themeHighlightRow'].forEach(id => document.getElementById(id).classList.toggle('is-hidden', backdropOnly));
    themeCardRow.classList.toggle('is-hidden', backdropOnly || t === 'critGuide');
    THEME_ROWS[0].alpha.disabled = t === 'overlay';
    themeTargetHint.textContent = !t ? 'Every overlay, unless one has its own colors.'
      : 'Only this one. Default follows All overlays.' + (t === 'overlay' ? ' Its backdrop opacity is under Layout.' : '')
        + (t === 'timers' ? ' The timers use the backdrop only.' : '') + (t === 'spawnAlert' ? ' The Spawn Alert uses the backdrop only.' : '');
    themeResetBtn.textContent = t ? '↺ Reset this overlay' : '↺ Reset all colors';
    renderPresets(s);
    renderAppLook(s);
    overlaySnapCheckbox.checked = s.overlaySnap !== false;
    updateCheckCheckbox.checked = s.updateCheck !== false;
    overlaySnapSizeCheckbox.checked = s.overlaySnapSize !== false;
    timersLayoutBtns.forEach(b => b.classList.toggle('on', b.dataset.timersLayout === (s.timersLayout || 'row')));
    if(document.activeElement !== timersScaleRange){
      const sc = Number(s.timersScale) || 1;
      timersScaleRange.value = sc;
      timersScaleVal.textContent = pct(sc);
    }
  }

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
  // Hidden on launch since v1.16.0 (see main.js hotkeyListVisible) — reflect
  // that as this button's initial state rather than waiting on a broadcast.
  setHotkeyListToggleLabel(false);

  if(declutterToggleBtn){
    declutterToggleBtn.addEventListener('click', async ()=>{
      const visible = await window.overlayAPI.toggleDeclutter();
      setDeclutterToggleLabel(visible);
    });
  }

  if(keybindsLockToggleBtn){
    keybindsLockToggleBtn.addEventListener('click', async ()=>{
      const cur = await window.overlayAPI.getSettings();
      const locked = !cur.keybindsLocked;
      await window.overlayAPI.setSettings({ keybindsLocked: locked });
      setKeybindsLockToggleLabel(locked);
      showToast(locked ? '🔒 Keybinds locked — every hotkey is off until you unlock' : '🔓 Keybinds unlocked');
    });
  }

  if(declutterRepositionBtn){
    declutterRepositionBtn.addEventListener('click', async ()=>{
      const s = await window.overlayAPI.getSettings();
      if(s.declutterLocked){
        await window.overlayAPI.setDeclutterLocked(false);
        showToast('Safe to Retire list unlocked — drag it into place, then click its own Lock button');
      } else {
        await window.overlayAPI.setDeclutterLocked(true);
        showToast('Safe to Retire list position locked');
      }
    });
  }

  if(declutterResetPosBtn){
    declutterResetPosBtn.addEventListener('click', async ()=>{
      if(!window.overlayAPI.resetDeclutterPosition) return;
      const s = await window.overlayAPI.resetDeclutterPosition();
      applySettingsToUI(s);
      showToast('Safe to Retire list position reset to default');
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

  // Spawn Alert (v1.14.0): on = spawn-alert.html watches the game's feed.
  if(spawnAlertToggleBtn){
    spawnAlertToggleBtn.addEventListener('click', async ()=>{
      const visible = await window.overlayAPI.toggleSpawnAlert();
      setSpawnAlertToggleLabel(visible);
    });
  }
  if(spawnAlertRepositionBtn){
    spawnAlertRepositionBtn.addEventListener('click', async ()=>{
      const s = await window.overlayAPI.getSettings();
      if(s.spawnAlertLocked){
        await window.overlayAPI.setSpawnAlertLocked(false);
        showToast('Spawn Alert unlocked — drag the sample alert into place, then click its own Lock button');
      } else {
        await window.overlayAPI.setSpawnAlertLocked(true);
        showToast('Spawn Alert position locked');
      }
    });
  }
  if(spawnAlertResetPosBtn){
    spawnAlertResetPosBtn.addEventListener('click', async ()=>{
      const s = await window.overlayAPI.resetSpawnAlertPosition();
      applySettingsToUI(s);
      showToast('Spawn Alert position and size reset to default');
    });
  }
  if(spawnAlertHoldSel){
    spawnAlertHoldSel.addEventListener('change', ()=>{
      const n = parseInt(spawnAlertHoldSel.value, 10);
      if(n > 0) window.overlayAPI.setSettings({ spawnAlertHoldSec: n });
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


  document.getElementById('blueprintSoundOverrideCheckbox')?.addEventListener('change', (e)=>{
    window.overlayAPI.setSettings({ blueprintSoundVolumeOverride: e.target.checked });
  });

  document.getElementById('blueprintSoundVolumeSlider')?.addEventListener('input', (e)=>{
    const val = parseFloat(e.target.value);
    document.getElementById('blueprintVolumeDisplay').textContent = Math.round(val * 100) + '%';
    window.overlayAPI.setSettings({ blueprintSoundVolume: val });
  });


  window.overlayAPI.onSettingsChanged(applySettingsToUI);
  window.overlayAPI.onOverlayVisibility(setToggleLabel);
  if(window.overlayAPI.onTimersVisibility) window.overlayAPI.onTimersVisibility(setTimersToggleLabel);
  if(window.overlayAPI.onHotkeyListVisibility) window.overlayAPI.onHotkeyListVisibility(setHotkeyListToggleLabel);
  if(window.overlayAPI.onDeclutterVisibility) window.overlayAPI.onDeclutterVisibility(setDeclutterToggleLabel);
  if(window.overlayAPI.onRebirthReqVisibility) window.overlayAPI.onRebirthReqVisibility(setRebirthReqToggleLabel);
  if(window.overlayAPI.onSneakVisibility) window.overlayAPI.onSneakVisibility(setSneakToggleLabel);
  if(window.overlayAPI.onCritGuideVisibility) window.overlayAPI.onCritGuideVisibility(setCritGuideToggleLabel);
  if(window.overlayAPI.onSpawnAlertVisibility) window.overlayAPI.onSpawnAlertVisibility(setSpawnAlertToggleLabel);

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
      raritySelect.style.cssText = 'padding: 6px; background: rgba(var(--bg-rgb),0.5); border: 1px solid rgba(var(--holo-rgb),0.3); color: #fff; border-radius: 4px;';
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
      nameInput.style.cssText = 'padding: 6px; background: rgba(var(--bg-rgb),0.5); border: 1px solid rgba(var(--holo-rgb),0.3); color: #fff; border-radius: 4px; font-family: monospace;';

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
