import { contextBridge, ipcRenderer } from 'electron'
import { createLaborApi } from '../shared/contracts'

// All renderer capabilities are fixed, validated messages; no Node or filesystem API is exposed.
contextBridge.exposeInMainWorld('laborApi', createLaborApi(
  (channel, request) => ipcRenderer.invoke(channel, request),
  (channel, listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
))
