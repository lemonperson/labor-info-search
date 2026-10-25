# Architecture

## Runtime shape

The Windows application uses Electron 45, a React renderer, and a deliberately small preload bridge. The renderer has no Node integration. Context isolation, sandboxing, web security, restrictive Content Security Policy, navigation denial, and a fixed set of validated IPC methods separate UI code from operating-system and network capabilities.

```text
React renderer
  └─ validated preload API
      └─ Electron main process
          ├─ subject confirmation and search orchestration
          ├─ bounded public HTTP fetching and product adapters
          ├─ local Tesseract.js OCR worker
          └─ SQLite repositories in the current user's data folder
```

## Data and trust boundaries

- Search subject evidence is carried through the search session. The user confirms the subject before a search starts; unresolved relationships remain labeled as unverified.
- Network retrieval is restricted to the configured public search and product-page paths. Redirects, protocols, hosts, response sizes, and timeouts are checked in the main process. Remote HTML is parsed as data and displayed as sanitized text, never executed.
- External-browser fallback is gated by a per-action confirmation showing the provider, domain, and query.
- The native file picker owns screenshot selection. The renderer receives OCR text, not filesystem paths. The image is read locally and not persisted by the OCR service.
- SQLite stores settings and optional history locally. The database is initialized at startup and closed on application shutdown.
- Tesseract.js uses the bundled Simplified Chinese model under `process.resourcesPath/ocr`; `cacheMethod: 'none'` and the fixed local model path avoid runtime model downloads.

## Distribution

electron-builder creates a per-user NSIS installer and an x64 portable executable. Application files are in ASAR except the better-sqlite3 runtime loader and Win32 x64 native module, plus the Tesseract Node worker entry, which need filesystem paths. Unused native builds and SQLite source files are excluded from the Windows package. The OCR model is a single explicit extra resource. There is no updater. Builds are unsigned until a signing certificate and release signing process are configured; Windows may therefore show an unknown-publisher warning.

## Verification

CI runs on Windows with a frozen pnpm lockfile, lint, TypeScript, unit/integration tests, production build, and Playwright E2E. Tagged releases build both Windows formats, publish build artifacts, and attach SHA-256 checksums. The packaged smoke test launches the unpacked production executable and checks the first-run disclosure, app identity, local OCR, user-data database, and clean exit.
