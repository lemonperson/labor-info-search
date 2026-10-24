import { contextBridge, ipcRenderer } from 'electron'
import { createLaborApi } from '../shared/contracts'

contextBridge.exposeInMainWorld('laborApi', createLaborApi((channel, request) => ipcRenderer.invoke(channel, request)))
