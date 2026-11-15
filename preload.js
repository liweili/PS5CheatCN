'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('file:open'),
  openPath: (p) => ipcRenderer.invoke('file:openPath', p),
  // Electron 32 起 File.path 已移除，拖拽文件的真实路径必须通过 webUtils 获取
  getFilePath: (file) => webUtils.getPathForFile(file),
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
  batchCancel: () => ipcRenderer.invoke('batch:cancel'),
  batchRollback: () => ipcRenderer.invoke('batch:rollback'),
  batchConfirmRollback: () => ipcRenderer.invoke('batch:confirmRollback'),
  onBatchProgress: (cb) => ipcRenderer.on('batch:progress', (e, p) => cb(p)),
  onMenu: (cb) => ipcRenderer.on('menu', (e, action) => cb(action)),
  onOpenFromSystem: (cb) => ipcRenderer.on('file:openFromSystem', (e, payload) => cb(payload)),
});
