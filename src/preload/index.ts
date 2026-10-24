import { contextBridge, ipcRenderer } from 'electron'
import { createLaborApi } from '../shared/contracts'

// All history/settings requests and replies pass through the shared schemas.
contextBridge.exposeInMainWorld('laborApi', createLaborApi((channel, request) => ipcRenderer.invoke(channel, request)))
