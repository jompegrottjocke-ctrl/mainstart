const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  status: () => ipcRenderer.invoke('status'),
  downloadFFmpeg: () => ipcRenderer.invoke('download-ffmpeg'),
  onInstallProgress: callback => ipcRenderer.on('install-progress', (_, message) => callback(message)),
  chooseBinary: language => ipcRenderer.invoke('choose-binary', language),
  addFiles: () => ipcRenderer.invoke('add-files'),
  chooseOutput: () => ipcRenderer.invoke('choose-output'),
  encode: job => ipcRenderer.invoke('encode', job),
  cancel: () => ipcRenderer.invoke('cancel'),
  openOutput: id => ipcRenderer.invoke('open-output', id),
  onProgress: callback => ipcRenderer.on('progress', (_, progress) => callback(progress)),
});
