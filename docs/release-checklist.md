# v0.1.0 local acceptance checklist

Date: 2026-10-25  
Branch: `feature/labor-info-search`  
Scope: local acceptance and packaging only. GitHub publication, tagging, and release remain gated for explicit user confirmation.

## Automated acceptance scenarios

| # | Scenario | Result and evidence |
|---|---|---|
| 1 | Install and open on a fresh Windows setup without developer tools, account, or key | **Partial.** Fresh isolated app data is exercised by `tests/e2e/packaged-app.spec.ts`; it asserts the packaged binary starts, shows first-run disclosure, loads bundled OCR resources, and uses the temporary profile path. NSIS and portable artifacts were freshly built. Interactive NSIS install and the actual clean Windows account flow were not verified because native computer-use approval timed out before opening Explorer. |
| 2 | Confirm a company and inspect sourced results | **Pass (automated fixture).** `tests/e2e/search-flow.spec.ts` confirms the subject, checks a result and its original URL in detail, and returns with filters preserved. |
| 3 | Resolve Taobao/JD/Douyin/Pinduoduo links or provide a fallback | **Pass (fixtures and fallback).** Adapter tests cover all four platform parsers. `tests/e2e/app.spec.ts` exercises a blocked JD URL and confirms screenshot/manual alternatives remain available. Live marketplace pages were not used as acceptance fixtures. |
| 4 | Run local OCR and allow correction before confirmation | **Pass.** `tests/e2e/packaged-app.spec.ts` checks packaged OCR model presence and recognizes `tests/fixtures/ocr/package-label.png`; `tests/e2e/app.spec.ts` verifies candidate correction before explicit subject confirmation. Low-confidence/no-candidate degradation stays editable and does not start a search. |
| 5 | Keep personal claims distinct from official findings | **Pass (automated unit coverage).** `tests/unit/results/classify-source.test.ts`, normalization, and schema tests preserve source category and claim verification independently. |
| 6 | Link an event’s statements, response, and later outcome in detail | **Pass (automated data coverage).** `tests/unit/results/group-events.test.ts` and `tests/unit/renderer/result-detail.test.tsx` verify suggested event grouping and independent source details. |
| 7 | Ask before opening an external search | **Pass.** `tests/e2e/search-flow.spec.ts` verifies the previewed domain and query, cancellation without a browser open, and the confirmed open path. |
| 8 | Explain that no results do not prove the absence of issues | **Pass.** `tests/unit/renderer/failure-states.test.tsx` checks actionable no-results wording; source failure and empty-search tests cover graceful states. |
| 9 | Delete one history item, clear history/cache, and avoid retaining screenshot files | **Pass for history deletion; screenshot evidence is code-path review.** `tests/e2e/privacy-flow.spec.ts` deletes a row and clears history, then confirms the database list is empty. OCR tests pass an image path to local processing and persist only confirmed text/results; the database session schema contains no image field. The packaged test uses and removes a temporary data directory. |
| 10 | Continue safely after disconnect, timeout, or connector failure | **Pass.** `tests/integration/search/search-service.test.ts` and `tests/integration/search/search-session-service.test.ts` cover timeout, connector failure, cancellation, partial results, and persistence. |

## Security and privacy acceptance

- **No startup telemetry/network:** source audit found no telemetry/analytics client or startup fetch. The main process initializes local storage and IPC at startup; network connectors and product-link reads are invoked only from the corresponding user actions. Packaged startup E2E runs with proxy variables pointed at `127.0.0.1:9` and reaches the first-run disclosure. This is source-flow and isolated-startup evidence; no packet capture was performed.
- **No renderer Node access:** `tests/e2e/app.spec.ts` verifies `require`, `process`, `Buffer`, `__dirname`, `module`, and `ipcRenderer` are undefined. It also checks `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true`.
- **No arbitrary external URL opening:** `tests/e2e/app.spec.ts` verifies navigation and new windows are denied. Browser fallback E2E verifies cancel performs no open and confirmation opens only the reviewed HTTPS search URL.
- **Screenshots not retained:** screenshot bytes are read by the main-process OCR service and not included in persisted session schemas; the packaged OCR flow uses a disposable isolated profile. No image filename/path is stored in database records.
- **Private-address blocking:** `tests/integration/security/safe-fetch.test.ts` covers private and mixed public/private DNS answers, local ranges, and private-address redirects.
- **Safe text rendering:** `tests/unit/security/text-safety.test.ts` covers hostile markup normalization; renderer code uses text nodes and contains no `dangerouslySetInnerHTML` sink.
- **Local-data deletion:** history E2E verifies individual deletion and clear-all; `SearchRepository.clearAll()` deletes session rows and runs `VACUUM`. The app profile used by packaged E2E is removed after the test.

## Full automated verification and artifacts

Clean-checkout-equivalent frozen install and full pipeline were run in the assigned feature worktree (the checkout itself was not freshly cloned):

```text
pnpm install --frozen-lockfile     → exit 0
pnpm lint                          → exit 0
pnpm typecheck                     → exit 0
pnpm test                          → 30 passed, 1 skipped; 294 passed, 1 skipped
pnpm build                         → exit 0
pnpm test:e2e                      → 15 passed
pnpm dist:win                      → exit 0; NSIS x64 installer created
pnpm dist:portable                 → exit 0; portable x64 executable created
```

The portable build initially timed out while electron-builder attempted a download. The single configured retry used temporary `HTTP_PROXY`, `HTTPS_PROXY`, `http_proxy`, and `https_proxy` values of `http://127.0.0.1:7897` plus `ELECTRON_GET_USE_PROXY=1`; it succeeded. Environment variables were removed immediately after the command.

| Artifact | Size | SHA-256 |
|---|---:|---|
| `dist/劳动信息检索-0.1.0-x64.exe` | 140,235,194 bytes | `75209B3612926EEF41E788D2439A76F65E0F42114025AF99E2E4934A21624834` |
| `dist/劳动信息检索-0.1.0-x64-portable.exe` | 120,398,799 bytes | `548E85541281A04D3ECD4E3FB362DE81826B8E330FDB8555ED98EB9BE9D095A4` |

Matching `.sha256` sidecars were refreshed in `dist/` and verified against the built files.

## Manual verification and deferred-item disposition

- **Task 8 renderer cancellation:** addressed with `renderer cancellation stops pending OCR and discards its eventual response` in `tests/e2e/app.spec.ts`. The test exercises the visible cancel control, IPC cancellation, stale-response discard, and return to editable input.
- **Task 8 OCR failure/degradation:** addressed with `OCR degradation keeps unclear screenshots editable and never starts a search` using `tests/fixtures/ocr/no-company.png`.
- **Task 10 renderer-supplied UUID collision:** addressed. `SearchSessionService.start()` now rejects IDs already present in the active-session map or saved history. `rejects a completed session ID collision without overwriting saved history` was observed failing before the guard and passing after it; the original saved session remains unchanged.
- **Task 13 NSIS installer launch / portable visible window:** **not verified.** Both artifacts built and the unpacked packaged app passed Playwright startup/OCR E2E, but native Explorer launch was not available: the computer-use approval for selecting the current Explorer window timed out. No claim is made that the interactive installer or portable app window has been manually verified.
- **100%, 125%, and 150% Windows scaling:** **not verified.** Native UI automation approval timed out before opening the app. Browser viewport tests cover wide and narrow layout only and are not a substitute for Windows DPI scaling.
- **Clean Windows user profile:** isolated app user-data directories were used in all relevant E2E tests, including packaged startup. A separate Windows OS account was not available in this run.

The local build/test evidence is complete. Release readiness remains contingent on the listed native Windows UI checks and the final independent branch review.
