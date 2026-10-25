import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { appInfoContract, createAppInfoHandler, createStorageHandlers } from '../shared/contracts'
import { openDatabase, type DatabaseHandle } from './database/database'
import { openDatabaseOrRecover } from './database/startup'
import { SearchRepository } from './database/search-repository'
import { SettingsRepository } from './database/settings-repository'
import { createMainWindow } from './window'
import { registerBrowserIpc, registerImageIpc, registerMarketplaceIpc, registerRecoveryIpc, registerSearchIpc } from './ipc/register-ipc'
import { SearchService } from './search/search-service'
import { BingRssConnector } from './search/connectors/bing-rss'
import { SearchSessionService } from './search/search-session-service'
import { configureOcrModelDirectory, shutdownOcrWorker } from './ocr/ocr-service'
import sourceRegistryJson from '../../resources/sources/source-registry.json'
import { sourceRegistrySchema } from '../shared/schemas'

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
  await registerRecoveryIpc(() => mainWindow)
  database = openDatabaseOrRecover(() => openDatabase(join(app.getPath('userData'), 'labor-information.sqlite')), () => openMainWindow())
  if (!database) return
  const searches = new SearchRepository(database)
  const settings = new SettingsRepository(database)
  const sourceRegistry = sourceRegistrySchema.parse(sourceRegistryJson)
  const connectorEntries = sourceRegistry.sources.filter(entry => entry.enabled)
  const productionConnectors = [new BingRssConnector()].filter(connector => connectorEntries.some(entry => entry.id === connector.id))
  const useFixture = import.meta.env.MODE === 'e2e' && !app.isPackaged && process.env.LABOR_SEARCH_E2E_FIXTURE === 'enabled'
  const connectors = useFixture ? [new (await import('./search/e2e-fixture-connector')).E2ESearchFixtureConnector()] : productionConnectors
  const connectorPolicies = Object.fromEntries(connectorEntries.map(entry => [entry.id, { enabled: entry.enabled, requestsPerMinute: entry.requestsPerMinute }]))
  if (useFixture) connectorPolicies['e2e-fixture'] = { enabled: true, requestsPerMinute: 60 }
  const searchSessions = new SearchSessionService(new SearchService(connectors, { connectorPolicies }), searches)
  await registerBrowserIpc(() => mainWindow, (sessionId, recordId) => {
    const record = searchSessions.getSession(sessionId)?.records.find(item => item.id === recordId)
    return record ? { title: record.title, url: record.url } : null
  })
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
