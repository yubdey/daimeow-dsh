const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petWindow', {
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('pet-window:ignore', !!ignore),
  setAlwaysOnTop: (value) => ipcRenderer.send('pet-window:always-on-top', !!value),
  quit: () => ipcRenderer.send('pet-window:quit'),
  hide: () => ipcRenderer.send('pet-window:hide'),
  show: () => ipcRenderer.send('pet-window:show'),
  onResetInteraction: (callback) => {
    const handler = () => {
      try {
        callback();
      } catch (error) {
        console.error('[daimeow-helper] reset interaction failed', error);
      }
    };
    ipcRenderer.on('pet-reset-interaction', handler);
    return () => ipcRenderer.removeListener('pet-reset-interaction', handler);
  },
  onFrame: (callback) => {
    const handler = (_event, frame) => {
      try {
        callback(frame);
      } catch (error) {
        console.error('[daimeow-helper] frame handler failed', error);
      }
    };
    ipcRenderer.on('pet-frame', handler);
    return () => ipcRenderer.removeListener('pet-frame', handler);
  },
});
