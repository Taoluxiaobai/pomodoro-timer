const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendNotification: (title, body) =>
    ipcRenderer.invoke('send-notification', { title, body }),
  setAlwaysOnTop: (isOnTop) =>
    ipcRenderer.invoke('set-always-on-top', isOnTop),
  getAlwaysOnTop: () =>
    ipcRenderer.invoke('get-always-on-top'),
});
