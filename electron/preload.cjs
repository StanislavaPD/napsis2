const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  register: (username, password) => ipcRenderer.invoke('auth:register', username, password),
  login: (username, password) => ipcRenderer.invoke('auth:login', username, password),
  verify: token => ipcRenderer.invoke('auth:verify', token),
  getAll: token => ipcRenderer.invoke('data:getAll', token),
  setCollection: (token, collection, items) => ipcRenderer.invoke('data:setCollection', token, collection, items),
  saveFile: (filename, base64Data) => ipcRenderer.invoke('file:save', filename, base64Data),
})
