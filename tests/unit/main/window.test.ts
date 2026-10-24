import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fileURLToPath } from 'node:url'

// Electron is an external runtime boundary; exercise the real window factory's load selection.
const boundary = vi.hoisted(() => ({
  app: { isPackaged: false },
  loadURL: vi.fn<(url: string) => Promise<void>>(),
  loadFile: vi.fn<(path: string) => Promise<void>>()
}))

vi.mock('electron', () => ({
  app: boundary.app,
  BrowserWindow: class {
    webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn() }
    once = vi.fn()
    loadURL = boundary.loadURL
    loadFile = boundary.loadFile
  }
}))

import { createMainWindow } from '../../../src/main/window'

beforeEach(() => {
  vi.clearAllMocks()
  boundary.loadURL.mockResolvedValue(undefined)
  boundary.loadFile.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe('renderer selection', () => {
  it.each([true, false])('loads the bundled renderer in packaged mode (override present: %s)', overridePresent => {
    boundary.app.isPackaged = true
    vi.stubEnv('ELECTRON_RENDERER_URL', overridePresent ? 'https://untrusted.example/' : undefined)

    createMainWindow()

    expect(boundary.loadURL).not.toHaveBeenCalled()
    expect(boundary.loadFile).toHaveBeenCalledExactlyOnceWith(
      fileURLToPath(new URL('../../../src/renderer/index.html', import.meta.url))
    )
  })

  it('retains the renderer URL override for unpackaged development', () => {
    boundary.app.isPackaged = false
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://127.0.0.1:5173')

    createMainWindow()

    expect(boundary.loadURL).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:5173')
    expect(boundary.loadFile).not.toHaveBeenCalled()
  })
})
