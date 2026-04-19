import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  storeGet: (key: string) => ipcRenderer.invoke('store:get', key),
  storeSet: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
  saveProject: (data: string, defaultName: string) => ipcRenderer.invoke('dialog:save', data, defaultName),
  openProject: () => ipcRenderer.invoke('dialog:open'),
  writeFile: (filePath: string, data: string) => ipcRenderer.invoke('file:write', filePath, data),
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath)
})