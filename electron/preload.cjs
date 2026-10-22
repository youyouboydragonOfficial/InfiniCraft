const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onBeforeClose: (cb) => ipcRenderer.on('before-close', () => cb()),
  closeOk: () => ipcRenderer.send('close-ok'),
  quit: () => ipcRenderer.send('quit'),
  saveIcon: (dataURL) => ipcRenderer.send('save-icon', dataURL),
});
