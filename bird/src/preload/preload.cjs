const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deskbirdApi', {
  // Main -> Renderer Listeners
  onInit: (callback) => ipcRenderer.on('bird:init', (_event, data) => callback(data)),
  onCursor: (callback) => ipcRenderer.on('bird:cursor', (_event, data) => callback(data)),
  onMessage: (callback) => ipcRenderer.on('bird:message', (_event, data) => callback(data)),
  onAnnouncement: (callback) => ipcRenderer.on('bird:announcement', (_event, data) => callback(data)),
  onTogglePerch: (callback) => ipcRenderer.on('bird:toggle-perch', (_event, data) => callback(data)),
  onPerchStateChanged: (callback) => ipcRenderer.on('bird:perch-state-changed', (_event, data) => callback(data)),
  onSettingUpdated: (callback) => ipcRenderer.on('bird:setting-updated', (_event, data) => callback(data)),

  // Renderer -> Main Dispatches
  setInteractive: (interactive) => ipcRenderer.send('overlay:interactive', { interactive }),
  notifySeen: (id) => ipcRenderer.send('bird:message-seen', { id }),
  updateSetting: (key, value) => ipcRenderer.send('bird:update-setting', { key, value }),
  saveSetup: (opts) => ipcRenderer.send('bird:setup-complete', opts)
});
