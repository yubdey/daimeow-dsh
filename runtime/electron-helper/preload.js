const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petWindow', {
  setHitRegions: (regions) => ipcRenderer.send('pet-window:set-hit-regions', regions),
  setInteractionLock: (locked) => ipcRenderer.send('pet-window:interaction-lock', !!locked),
  setAlwaysOnTop: (value) => ipcRenderer.send('pet-window:always-on-top', !!value),
  disablePlugin: () => ipcRenderer.send('pet-window:disable-plugin'),
  hide: () => ipcRenderer.send('pet-window:hide'),
  show: () => ipcRenderer.send('pet-window:show'),
  captureScreen: () => ipcRenderer.invoke('pet-window:capture-screen'),
  onResetInteraction: (callback) => {
    const handler = (_event, point) => {
      try {
        callback(point);
      } catch (error) {
        console.error('[daimeow-helper] reset interaction failed', error);
      }
    };
    ipcRenderer.on('pet-reset-interaction', handler);
    return () => ipcRenderer.removeListener('pet-reset-interaction', handler);
  },
  onWindowShown: (callback) => {
    const handler = (_event, point) => {
      try {
        callback(point);
      } catch (error) {
        console.error('[daimeow-helper] window shown handler failed', error);
      }
    };
    ipcRenderer.on('pet-window-shown', handler);
    return () => ipcRenderer.removeListener('pet-window-shown', handler);
  },
  onCursor: (callback) => {
    const handler = (_event, point) => {
      try {
        callback(point);
      } catch (error) {
        console.error('[daimeow-helper] cursor handler failed', error);
      }
    };
    ipcRenderer.on('pet-cursor', handler);
    return () => ipcRenderer.removeListener('pet-cursor', handler);
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
