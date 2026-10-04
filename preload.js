'use strict';
/* Safe bridge between the renderer pages (tracker.html and overlay.html) and
   the main process. contextIsolation is on, so this is the only door between
   them — the renderers never get direct Node/IPC access. */

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, cb){
  const listener = (evt, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('overlayAPI', {
  // package.json's version, via Electron's own app.getVersion() — shown in
  // the tracker header and the hotkey list so a stale/old build is obvious
  // at a glance instead of a guessing game.
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),

  // v1.18.0 update notice (update-check.js): the banner's data, dismiss, and the Download button
  getUpdate: () => ipcRenderer.invoke('update:get'),
  dismissUpdate: () => ipcRenderer.invoke('update:dismiss'),
  openUpdatePage: () => ipcRenderer.invoke('update:openPage'),
  onUpdateState: (cb) => subscribe('update:state', cb), // cb(info | null)

  // shared JSON store (ownedRank, nameMerges, activeCycle, ...)
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
  onStoreChanged: (cb) => subscribe('store:changed', cb), // cb({key, value})

  // overlay-initiated ownership marking (via click in overlay.html or rebirth-requirements-overlay.html)
  markDroidFromOverlay: (data) => ipcRenderer.invoke('overlay:markDroid', data), // data: {cycle, level, slot}
  markLevelFromOverlay: (data) => ipcRenderer.invoke('overlay:markLevel', data), // data: {cycle, level}
  holdNextCycleMark: (data) => ipcRenderer.invoke('overlay:holdNextCycleMark', data), // data: {cycle, nk, rank} — Sneak Preview, held until that cycle is active
  toggleRetired: (data) => ipcRenderer.invoke('overlay:toggleRetired', data), // data: {cycle, nk, rank} — Safe to Retire, never touches ownedRank

  // v1.10.14: every overlay moves via overlay-drag.js and resizes via overlay-theme.js;
  // main.js places the window (on one monitor). phase: 'start' | 'move' | 'end';
  // dx/dy = screen px since 'start'.
  dragOverlay: (phase, dx, dy) => ipcRenderer.send('overlay:drag', { phase, dx, dy }),
  resizeOverlay: (phase, dx, dy) => ipcRenderer.send('overlay:resize', { phase, dx, dy }),
  getOverlayBaseSize: () => ipcRenderer.invoke('overlay:baseSize'), // -> {width, height} default size, or null

  // v1.11.1: which list the rebirthMark* keys drive -> {target: 'rebirthReq'|'declutter'|'sneak'|null, contested}
  getMarkTarget: () => ipcRenderer.invoke('markTarget:get'),
  onMarkTargetChanged: (cb) => subscribe('markTarget:changed', cb),
  // v1.11.1: timers.html sizes its window to the banners ({width, height} in px)
  fitTimers: (size) => ipcRenderer.send('timers:fit', size),
  // v1.11.1 Read Rebirth Screen: show the screen picker on the next capture
  // (the choice is then saved again), and the in-game notice card
  // (game-toast.html) — msg: {title, sub?, tone?: 'ok'|'warn'|'info', ms?}
  changeCaptureScreen: () => ipcRenderer.invoke('capture:changeScreen'),
  showGameToast: (msg) => ipcRenderer.send('toast:show', msg),
  onGameToast: (cb) => subscribe('toast:show', cb),

  // v1.13.0 own alert sounds: add (file dialog -> {ok, sound?, reason?}), remove
  // (by id), read (-> base64 or null; alert-sound.js decodes it)
  addCustomSound: () => ipcRenderer.invoke('sound:add'),
  removeCustomSound: (id) => ipcRenderer.invoke('sound:remove', id),
  readCustomSound: (id) => ipcRenderer.invoke('sound:read', id),

  // overlay settings (hotkey, opacity, position, visible, locked)
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  onSettingsChanged: (cb) => subscribe('settings:changed', cb), // cb(settings)

  toggleOverlay: () => ipcRenderer.invoke('overlay:toggle'),
  onOverlayVisibility: (cb) => subscribe('overlay:visibility-changed', cb), // cb(boolean)
  setOverlayLocked: (locked) => ipcRenderer.invoke('overlay:setLocked', locked),
  resetOverlayPosition: () => ipcRenderer.invoke('overlay:resetPosition'),

  // blueprint/mission countdown timers banner (timers.html + the toggle button/hotkey in tracker.html)
  toggleTimers: () => ipcRenderer.invoke('timers:toggle'),
  onTimersVisibility: (cb) => subscribe('timers:visibility-changed', cb), // cb(boolean)
  setTimersLocked: (locked) => ipcRenderer.invoke('timers:setLocked', locked),
  resetTimersPosition: () => ipcRenderer.invoke('timers:resetPosition'),

  // "safe to retire" Legendary/Mythic droid list (declutter.html + the toggle button/hotkey in tracker.html)
  toggleDeclutter: () => ipcRenderer.invoke('declutter:toggle'),
  onDeclutterVisibility: (cb) => subscribe('declutter:visibility-changed', cb), // cb(boolean)
  setDeclutterLocked: (locked) => ipcRenderer.invoke('declutter:setLocked', locked),
  resetDeclutterPosition: () => ipcRenderer.invoke('declutter:resetPosition'),

  // standalone Rebirth Requirements overlay — every droid the active cycle
  // needs, same data as the tracker's own 🧬 panel (rebirth-requirements-overlay.html
  // + the toggle button/hotkey in tracker.html)
  toggleRebirthReq: () => ipcRenderer.invoke('rebirthReq:toggle'),
  onRebirthReqVisibility: (cb) => subscribe('rebirthReq:visibility-changed', cb), // cb(boolean)
  setRebirthReqLocked: (locked) => ipcRenderer.invoke('rebirthReq:setLocked', locked),
  resetRebirthReqPosition: () => ipcRenderer.invoke('rebirthReq:resetPosition'),

  // Sneak Preview — next cycle's Mythic droids, at their highest required
  // variety (sneak-preview.html + the toggle button/hotkey in tracker.html;
  // showSneakPreview is called when the user picks "Sneak Preview" in the
  // cycle-complete prompt — it also turns off every other overlay except
  // the timers)
  toggleSneak: () => ipcRenderer.invoke('sneak:toggle'),
  showSneakPreview: () => ipcRenderer.invoke('sneak:show'),
  // Cycle-complete prompt (native box, main.js) -> 'next' | 'sneak' | 'none'
  // ('none' = closed with X/Esc: leave everything as it is)
  askCycleComplete: () => ipcRenderer.invoke('cycle:askComplete'),
  onSneakVisibility: (cb) => subscribe('sneak:visibility-changed', cb), // cb(boolean)
  setSneakLocked: (locked) => ipcRenderer.invoke('sneak:setLocked', locked),
  resetSneakPosition: () => ipcRenderer.invoke('sneak:resetPosition'),

  // Optimal Crit Guide — a static crit-investment reference panel
  // (crit-guide-overlay.html + the toggle button/hotkey in tracker.html)
  toggleCritGuide: () => ipcRenderer.invoke('critGuide:toggle'),
  onCritGuideVisibility: (cb) => subscribe('critGuide:visibility-changed', cb), // cb(boolean)
  setCritGuideLocked: (locked) => ipcRenderer.invoke('critGuide:setLocked', locked),
  resetCritGuidePosition: () => ipcRenderer.invoke('critGuide:resetPosition'),

  // Spawn Alert (v1.14.0) — spawn-alert.html reads the game's spawn lines while
  // settings.spawnAlertVisible is on (+ the toggle button/hotkey in tracker.html)
  toggleSpawnAlert: () => ipcRenderer.invoke('spawnAlert:toggle'),
  onSpawnAlertVisibility: (cb) => subscribe('spawnAlert:visibility-changed', cb), // cb(boolean)
  setSpawnAlertLocked: (locked) => ipcRenderer.invoke('spawnAlert:setLocked', locked),
  resetSpawnAlertPosition: () => ipcRenderer.invoke('spawnAlert:resetPosition'),

  // hotkey-triggered button actions: the Ctrl+Shift+5 hotkey fires the same
  // click listener as manually clicking 📸 Read Rebirth Screen — this just
  // tells the renderer which one to click
  onHotkeyTriggered: (cb) => subscribe('hotkey:triggered', cb), // cb('rebirthScreen')

  // on-screen hotkey reference list (hotkey-list.html + the toggle button/hotkey in tracker.html)
  toggleHotkeyList: () => ipcRenderer.invoke('hotkeyList:toggle'),
  onHotkeyListVisibility: (cb) => subscribe('hotkeyList:visibility-changed', cb), // cb(boolean)

  // one-off toast messages pushed from the main process (e.g. "boxes weren't saved yet")
  onNotify: (cb) => subscribe('app:notify', cb), // cb(message string)

  platform: process.platform
});
