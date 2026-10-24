import { app, BrowserWindow, ipcMain } from 'electron'
import { appInfoContract, createAppInfoHandler } from '../shared/contracts'
import { createMainWindow } from './window'

let mainWindow: BrowserWindow | null = null

function openMainWindow(): void {
  mainWindow = createMainWindow()
  mainWindow.once('closed', () => { mainWindow = null })
}

void app.whenReady().then(() => {
  const getAppInfo = createAppInfoHandler(() => ({
    name: '劳动信息检索',
    version: app.getVersion(),
    platform: process.platform
  }))

  ipcMain.handle(appInfoContract.channel, (event, payload: unknown) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Untrusted IPC sender')
    }
    return getAppInfo(payload)
  })

  openMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
