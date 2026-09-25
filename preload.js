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

  // shared JSON store (ownedRank, nameMerges, activeCycle, ...)
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
  onStoreChanged: (cb) => subscribe('store:changed', cb), // cb({key, value})

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
