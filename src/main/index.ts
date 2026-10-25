import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { appInfoContract, createAppInfoHandler, createStorageHandlers } from '../shared/contracts'
import { openDatabase, type DatabaseHandle } from './database/database'
import { SearchRepository } from './database/search-repository'
import { SettingsRepository } from './database/settings-repository'
import { createMainWindow } from './window'
import { registerBrowserIpc, registerImageIpc, registerMarketplaceIpc, registerSearchIpc } from './ipc/register-ipc'
import { SearchService } from './search/search-service'
import { BingRssConnector } from './search/connectors/bing-rss'
import { SearchSessionService } from './search/search-session-service'
import { configureOcrModelDirectory, shutdownOcrWorker } from './ocr/ocr-service'

let mainWindow: BrowserWindow | null = null
let database: DatabaseHandle | null = null

if (process.env.LABOR_SEARCH_E2E_USER_DATA && (!app.isPackaged || process.env.LABOR_SEARCH_E2E_PACKAGED === 'enabled')) {
  app.setPath('userData', process.env.LABOR_SEARCH_E2E_USER_DATA)
}

function openMainWindow(): void {
  mainWindow = createMainWindow()
  mainWindow.once('closed', () => { mainWindow = null })
}

void app.whenReady().then(async () => {
  configureOcrModelDirectory(app.isPackaged ? join(process.resourcesPath, 'ocr') : join(app.getAppPath(), 'resources', 'ocr'))
  await registerImageIpc(() => mainWindow)
  await registerMarketplaceIpc(() => mainWindow)
  await registerBrowserIpc(() => mainWindow)
  database = openDatabase(join(app.getPath('userData'), 'labor-information.sqlite'))
  const searches = new SearchRepository(database)
  const settings = new SettingsRepository(database)
  const connectors = !app.isPackaged && process.env.LABOR_SEARCH_E2E_FIXTURE === 'enabled'
    ? [new (await import('./search/e2e-fixture-connector')).E2ESearchFixtureConnector()]
    : [new BingRssConnector()]
  const searchSessions = new SearchSessionService(new SearchService(connectors), searches)
  await registerSearchIpc(() => mainWindow, searchSessions)
  const handlers = {
    [appInfoContract.channel]: createAppInfoHandler(() => ({
      name: '劳动信息检索', version: app.getVersion(), platform: process.platform
    })),
    ...createStorageHandlers({
      listSessions: limit => searches.listSessions(limit),
      getSession: id => searches.getSession(id),
      deleteSession: id => searches.deleteSession(id),
      clearAll: () => searches.clearAll(),
      getSettings: () => settings.getSettings(),
      updateSettings: patch => settings.updateSettings(patch)
    })
  }

  for (const [channel, handle] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, payload: unknown) => {
      if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame) {
        throw new Error('Untrusted IPC sender')
      }
      return handle(payload)
    })
  }

  openMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow()
  })
})

app.on('before-quit', () => { database?.close(); database = null; void shutdownOcrWorker() })
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
