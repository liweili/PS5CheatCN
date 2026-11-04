'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('file:open'),
  openPath: (p) => ipcRenderer.invoke('file:openPath', p),
  save: (payload) => ipcRenderer.invoke('file:save', payload),
  saveAs: (payload) => ipcRenderer.invoke('file:saveAs', payload),
  saveTo: (payload) => ipcRenderer.invoke('file:saveTo', payload),
  getFullText: (p) => ipcRenderer.invoke('file:getFullText', p),
  pickDir: () => ipcRenderer.invoke('file:pickDir'),
  translateOne: (name) => ipcRenderer.invoke('tr:one', name),
  translateBatch: (names) => ipcRenderer.invoke('tr:batch', names),
  openDir: (dir) => ipcRenderer.invoke('shell:openDir', dir),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  batchScan: (opts) => ipcRenderer.invoke('batch:scan', opts),
  batchProcess: (opts) => ipcRenderer.invoke('batch:process', opts),
  onMenu: (cb) => ipcRenderer.on('menu', (e, action) => cb(action)),
});
