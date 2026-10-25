# v0.1.0 local acceptance checklist

Date: 2026-10-25  
Branch: `main`
Scope: local acceptance and packaging only. GitHub publication, tagging, and release remain gated for explicit user confirmation.

## Automated acceptance scenarios

| # | Scenario | Result and evidence |
|---|---|---|
| 1 | Install and open on a fresh Windows setup without developer tools, account, or key | **Partial.** Fresh isolated app data is exercised by `tests/e2e/packaged-app.spec.ts`; it asserts the packaged binary starts, shows first-run disclosure, loads bundled OCR resources, and uses a temporary profile. The NSIS wizard was also completed interactively for the current user, and both the installed and portable executables displayed usable native windows at the machine's current 150% scaling. A separate Windows account remains unverified. |
| 2 | Confirm a company and inspect sourced results | **Pass (automated fixture).** `tests/e2e/search-flow.spec.ts` confirms the subject and source, reviews the exact source URL/domain in a main-generated confirmation dialog, tests cancel without opening, and verifies one-time confirmed opening. |
| 3 | Resolve Taobao/JD/Douyin/Pinduoduo links or provide a fallback | **Pass (fixtures and fallback).** Adapter tests cover all four platform parsers. `tests/e2e/app.spec.ts` exercises a blocked JD URL and confirms screenshot/manual alternatives remain available. Live marketplace pages were not used as acceptance fixtures. |
| 4 | Run local OCR and allow correction before confirmation | **Pass.** `tests/e2e/packaged-app.spec.ts` checks packaged OCR model presence and recognizes `tests/fixtures/ocr/package-label.png`; `tests/e2e/app.spec.ts` verifies candidate correction before explicit subject confirmation. Low-confidence/no-candidate degradation stays editable and does not start a search. |
| 5 | Keep personal claims distinct from official findings | **Pass (automated unit coverage).** `tests/unit/results/classify-source.test.ts`, normalization, and schema tests preserve source category and claim verification independently. |
| 6 | Link an event’s statements, response, and later outcome in detail | **Pass (automated data coverage).** `tests/unit/results/group-events.test.ts` covers report/response hits from different query topics using title/excerpt content, with an explicit tentative matching basis; `tests/unit/renderer/result-detail.test.tsx` checks the suggested label and uncertainty. |
| 7 | Ask before opening an external search | **Pass.** `tests/e2e/search-flow.spec.ts` verifies the previewed domain and query, cancellation without a browser open, and the confirmed open path. |
| 8 | Explain that no results do not prove the absence of issues | **Pass.** `tests/unit/renderer/failure-states.test.tsx` checks actionable no-results wording; source failure and empty-search tests cover graceful states. |
| 9 | Delete one history item, clear history/cache, and avoid retaining screenshot files | **Pass for history deletion; screenshot evidence is code-path review.** `tests/e2e/privacy-flow.spec.ts` deletes a row and clears history, then confirms the database list is empty. OCR tests pass an image path to local processing and persist only confirmed text/results; the database session schema contains no image field. The packaged test uses and removes a temporary data directory. |
| 10 | Continue safely after disconnect, timeout, or connector failure | **Pass.** Search integration tests cover timeout, cancellation, partial results, and persistence. `tests/e2e/search-flow.spec.ts` seeds a saved result, forces all fixture connectors to fail, then verifies the saved result, history, settings, and local OCR remain usable. |

## Security and privacy acceptance

- **No startup telemetry/network:** source audit found no telemetry/analytics client or startup fetch. The main process initializes local storage and IPC at startup; network connectors and product-link reads are invoked only from the corresponding user actions. Packaged startup E2E runs with proxy variables pointed at `127.0.0.1:9` and reaches the first-run disclosure. This is source-flow and isolated-startup evidence; no packet capture was performed.
- **No renderer Node access:** `tests/e2e/app.spec.ts` verifies `require`, `process`, `Buffer`, `__dirname`, `module`, and `ipcRenderer` are undefined. It also checks `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true`.
- **No arbitrary external URL opening:** `tests/e2e/app.spec.ts` verifies navigation and new windows are denied. Browser fallback E2E verifies cancel performs no open and confirmation opens only the reviewed HTTPS search URL.
- **Screenshots not retained:** screenshot bytes are read by the main-process OCR service and not included in persisted session schemas; the packaged OCR flow uses a disposable isolated profile. No image filename/path is stored in database records.
- **Private-address blocking:** `tests/integration/security/safe-fetch.test.ts` covers private and mixed public/private DNS answers, local ranges, and private-address redirects.
- **Safe text rendering:** `tests/unit/security/text-safety.test.ts` covers hostile markup normalization; renderer code uses text nodes and contains no `dangerouslySetInnerHTML` sink.
- **Local-data deletion:** history E2E verifies individual deletion and clear-all; `SearchRepository.clearAll()` deletes session rows and runs `VACUUM`. The app profile used by packaged E2E is removed after the test.

## Full automated verification and artifacts

Final fix-wave verification was run in the assigned feature worktree (the checkout itself was not freshly cloned):

```text
pnpm lint                          → exit 0
pnpm typecheck                     → exit 0
pnpm test                          → 32 files passed, 1 skipped; 303 passed, 1 skipped
pnpm build                         → exit 0
production fixture absence check   → no E2E fixture connector in `out/main`
pnpm dist:win                      → exit 0; NSIS x64 installer created
pnpm test:e2e                      → 17 passed; includes packaged ASAR assertion
pnpm dist:portable                 → exit 0; portable x64 executable created
```

The portable build initially timed out while electron-builder attempted a download. The single configured retry used temporary `HTTP_PROXY`, `HTTPS_PROXY`, `http_proxy`, and `https_proxy` values of `http://127.0.0.1:7897` plus `ELECTRON_GET_USE_PROXY=1`; it succeeded. Environment variables were removed immediately after the command.

| Artifact | Size | SHA-256 |
|---|---:|---|
| `dist/劳动信息检索-0.1.0-x64.exe` | 140,237,971 bytes | `4b3ad456f354c229a764e61f3d234b5c8139a65ba6ef7f90149b887809d7d88e` |
| `dist/劳动信息检索-0.1.0-x64-portable.exe` | 120,388,499 bytes | `0859091722fac2cb587f4d1d74b0025367552fa03b5b82a2f0f3c3342cf05f55` |

Matching `.sha256` sidecars were refreshed in `dist/` and verified against the built files.

## Manual verification and deferred-item disposition

- **Task 8 renderer cancellation:** `renderer cancellation propagates the cancelled OCR response and returns to editable input` in `tests/e2e/app.spec.ts` verifies cancellation and the error response path. A late-success-after-cancel race is not covered; no such behavior is claimed.
- **Task 8 OCR failure/degradation:** addressed with `OCR degradation keeps unclear screenshots editable and never starts a search` using `tests/fixtures/ocr/no-company.png`.
- **Task 10 renderer-supplied UUID collision:** addressed. `SearchSessionService.start()` now rejects IDs already present in the active-session map or saved history. `rejects a completed session ID collision without overwriting saved history` was observed failing before the guard and passing after it; the original saved session remains unchanged.
- **Task 13 NSIS installer launch / portable visible window:** **verified on 2026-10-25.** After explicit action-time confirmation, the per-user NSIS wizard completed at its default path and launched the installed application. The first-run disclosure, main intake screen, all three intake tabs, history, settings, and subject-confirmation dialog were visually inspected. The portable executable also opened a native window and completed the company-name-to-subject-confirmation flow without starting a network search.
- **100%, 125%, and 150% Windows scaling:** **partial.** The current Windows profile reported `AppliedDPI=144` (150%), and both packaged variants displayed without clipping, overlap, or inaccessible controls at that scale. 100% and 125% remain unverified; browser viewport tests cover wide and narrow layouts but are not substitutes for those Windows DPI settings.
- **Clean Windows user profile:** isolated app user-data directories were used in all relevant E2E tests, including packaged startup. A separate Windows OS account was not available in this run.

The local automated build/test evidence is complete, and the final branch review plus its scoped fix-wave re-review are clean. Release readiness remains contingent on the 100%/125% Windows DPI checks and a separate Windows OS account check. The release workflow publishes only after build, both package targets, full E2E, and checksum generation; the GitHub release is marked prerelease and retains the unsigned-binary disclosure.
