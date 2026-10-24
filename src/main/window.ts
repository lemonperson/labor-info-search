import { BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: '劳动信息检索',
    width: 1120,
    height: 760,
    minWidth: 760,
    minHeight: 540,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false
    }
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.on('will-redirect', event => event.preventDefault())
  window.once('ready-to-show', () => window.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)))
  }
  return window
}
