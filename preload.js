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
  onMenu: (cb) => ipcRenderer.on('menu', (e, action) => cb(action)),
});
