const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('widgetDesktop', {
  getState: () => ipcRenderer.invoke('widget:get-state'),
  refreshUsage: () => ipcRenderer.invoke('widget:refresh-usage'),
  saveUsage: (usage) => ipcRenderer.invoke('widget:save-usage', usage),
  updateSettings: (settings) => ipcRenderer.invoke('widget:update-settings', settings),
  setInteractive: (interactive) => ipcRenderer.invoke('widget:set-interactive', interactive),
  moveBy: (delta) => ipcRenderer.invoke('widget:move-by', delta),
  setMascotCenter: (center) => ipcRenderer.invoke('widget:set-mascot-center', center),
  snap: () => ipcRenderer.invoke('widget:snap'),
  getLayout: () => ipcRenderer.invoke('widget:get-layout'),
  onConfigChanged: (callback) => ipcRenderer.on('widget:config-changed', callback),
  onTaskStateChanged: (callback) => ipcRenderer.on('widget:task-state', (_event, snapshot) => callback(snapshot)),
  acknowledgeCompleted: () => ipcRenderer.invoke('widget:acknowledge-completed'),
  openStudio: () => ipcRenderer.invoke('widget:open-studio'),
  openApp: (id) => ipcRenderer.invoke('widget:open-app', id),
  openPlugin: (id) => ipcRenderer.invoke('widget:open-plugin', id),
  close: () => ipcRenderer.invoke('widget:close'),
})
