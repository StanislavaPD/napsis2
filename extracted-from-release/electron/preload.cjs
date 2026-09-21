const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  login: (username, password) => ipcRenderer.invoke('auth:login', username, password),
  verify: token => ipcRenderer.invoke('auth:verify', token),
  getAll: token => ipcRenderer.invoke('data:getAll', token),
  setCollection: (token, collection, items) => ipcRenderer.invoke('data:setCollection', token, collection, items),
  saveFile: (filename, base64Data) => ipcRenderer.invoke('file:save', filename, base64Data),
  openTempFile: (filename, base64Data) => ipcRenderer.invoke('file:openTemp', filename, base64Data),
  setupStatus: () => ipcRenderer.invoke('setup:status'),
  detectExistingPostgres: () => ipcRenderer.invoke('setup:detectPostgres'),
  runProvisioning: existingSuperuserPassword => ipcRenderer.invoke('setup:runProvisioning', existingSuperuserPassword),
  onSetupProgress: callback => {
    const listener = (_e, message) => callback(message)
    ipcRenderer.on('setup:progress', listener)
    return () => ipcRenderer.removeListener('setup:progress', listener)
  },
  bootstrapAdmin: (username, password) => ipcRenderer.invoke('auth:bootstrapAdmin', username, password),
  createUser: (token, username, password) => ipcRenderer.invoke('auth:createUser', token, username, password),
  pickBackupFolder: () => ipcRenderer.invoke('backup:pickFolder'),
  writeAutoBackup: (folderPath, base64Data) => ipcRenderer.invoke('backup:writeAuto', folderPath, base64Data),
})
