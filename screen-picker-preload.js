'use strict';
/* Preload for the small "choose a screen" modal (only ever shown on
   multi-monitor setups — see main.js's pickScreenSource). Same
   contextIsolation-safe pattern as preload.js: no direct Node/IPC access
   from the page, just this narrow bridge. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pickerAPI', {
  onSources: (cb)=> ipcRenderer.on('picker:sources', (evt, sources)=> cb(sources)),
  choose: (id)=> ipcRenderer.invoke('picker:choose', id),
  cancel: ()=> ipcRenderer.invoke('picker:choose', null)
});
