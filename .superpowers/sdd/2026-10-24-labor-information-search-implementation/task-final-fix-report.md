# Final fix-wave report

Date: 2026-10-25
Branch: `feature/labor-info-search`
Base: `de24a0000031b287cd62686053ac9a68eb427d40`
Implementation commit: `ebf24f5cd12bfa225d585925e30111c7cbd4521a`
Scope: local code, tests, docs, CI, packaging, and release-workflow corrections only. Nothing was published, pushed, tagged, or released.

## Dispositions by finding

| Finding | Disposition and evidence |
|---|---|
| Important 1 — original source URLs cannot be opened safely | Added main-process `source:preview` and `source:open-confirmed` IPC. The main process looks up a record by session and record IDs, returns its exact URL/domain/title for preview, and stores a five-minute one-use token. The renderer cannot submit a destination URL. A bounded in-memory session cache supports previews when history saving is disabled; saved history is the fallback lookup. Unit and E2E checks verify cancellation does not open, confirmation opens the exact HTTPS destination once, and response contracts match. |
| Important 2 — disabling history hid/deactivated saved records | History listing is independent of future retention preference. The history page always renders saved rows and leaves delete/clear enabled when saving is off. `SearchRepository.saveSession` continues to skip new writes while disabled. Renderer and E2E tests cover retained records and deletion/clear. |
| Important 3 — connector enable/rate policies unused | Production connectors are selected from the validated source registry. `SearchService` applies configured per-connector rates with one shared sliding window across runs, and abortable waits use an injectable `{ now, delay }` clock. Disabled policies schedule no network work. Dedicated tests cover `enabled:false`, injected clock quota behavior, cross-run sharing, and cancellation. Fixture tests use an explicit E2E mode and a separate rate limit. |
| Important 4 — normalization erased trusted statement/response classification | Normalization preserves explicit non-`other` connector classification, while the registry can refine `other`. Employee statements are forced to `unverified` before schema validation. Publisher text is never used for classification; an unregistered social hostname remains `other`. Normalization tests cover employee statements, company responses, and unverified claim state. |
| Important 5 — material uncertainty missing in result views | Results and details show subject role and `主体尚未权威核验` unless the subject is verified. Related records are labeled `可能相关的来源（建议分组）`, state that the link is tentative, and display the matching basis. Results/detail renderer tests cover these labels; history reopen uses the same results page. |
| Important 6 — response-specific hits failed event association | Event clustering uses sanitized title/excerpt content rather than retrieval provenance. It requires same subject, a 14-day date window, shared title/content terms, and a shared labor-event marker; generated basis text remains a suggestion for human review. Cross-topic report/response tests pass and unrelated events remain separate. |
| Important 7 — database open/migration failure bypassed UI | Main startup catches initialization errors before services start, opens a recovery window, and leaves the existing DB untouched. Recovery exposes only fixed capabilities: open the app data folder and restart the app. An isolated Playwright test seeds `user_version=2`, confirms the recovery UI, and confirms the file still reports version 2. |
| Important 8 — release workflow omitted full E2E/prerelease | Tagged release sequence now builds NSIS and portable artifacts, then runs full E2E (including packaged startup), then checksums/artifact upload/release. The GitHub Release action sets `prerelease: true`; existing unsigned disclosure remains. CI uses the dedicated E2E build mode after production packaging. No release was created. |
| Important 9 — native Windows gates incomplete | Built both artifacts and passed packaged startup/OCR E2E. Did not launch/install NSIS or open the portable executable through Windows UI. The Computer Use skill requires action-time user confirmation before running/installing apps via UI; parent explicitly directed not to launch without that confirmation. DPI scale checks and a separate Windows account remain pending. |
| Minor 1 — E2E fixture could enter packaged ASAR | Production mode constant-folds out the fixture import; `pnpm build` emits only `out/main/index.js`. The E2E fixture is included only under `pnpm build:e2e`. The packaged-app E2E asserts the fixture identifier is absent from production `app.asar`. |
| Minor 2 — late OCR success after cancellation | Narrowed the E2E title and checklist wording to the evidence: cancellation sends the `cancelled` error response and returns to editable input. No late-success-after-cancel race is claimed or covered. |
| Minor 3 — all-connectors-fail local feature usability | Added an E2E case that seeds a saved session, starts a search with every fixture connector failing, then verifies the old result can reopen, history/settings remain available, and local OCR still runs. Acceptance scenario 10 is marked covered by this test plus integration coverage. |

## TDD evidence

| Behavior | RED evidence | GREEN evidence |
|---|---|---|
| Trusted classification and employee-statement invariant | `pnpm exec vitest run tests/unit/results/normalize-result.test.ts` initially rejected the explicit employee classification/claim combination at schema validation. | After normalization preconditions were corrected, the focused normalization suite passed; final suite includes these cases. |
| Content-based cross-query event grouping | `pnpm exec vitest run tests/unit/results/group-events.test.ts` failed with `expected [] to have a length of 1` for the report/response pair with different retrieval evidence. | Content-evidence grouping produced a suggested group with explicit shared-content basis; unrelated cases remain separate. |
| Existing-history UI when retention is off | `pnpm exec vitest run tests/unit/renderer/history-page.test.tsx` failed because the disabled state hid `青禾制造` and delete/clear controls. | The history renderer tests passed after separating retention notice from stored-record listing. E2E verifies retained rows remain manageable. |
| Source preview capability | Initial `pnpm exec vitest run tests/unit/search/source-preview.test.ts` failed with `Cannot find module ...source-preview`. | The one-use-token tests pass. Later E2E exposed and fixed two additional integration issues: non-UUID record IDs and the `value: undefined` success contract. The final source-confirmation E2E passes. |
| Shared rate limiter | Initial `pnpm exec vitest run tests/integration/search/search-service.test.ts` failed waiting for an injected-clock sleep because no limiter existed. | Dedicated tests pass for shared window, configured rate, disabled connector, and abort. Session-lifetime tests inject a 60/minute policy so their concern stays session isolation. |
| Database recovery | The recovery helper test was added alongside implementation; no separate pre-implementation RED run was captured. | `tests/e2e/recovery.spec.ts` verifies error startup, recovery actions, and preservation of the newer SQLite file in an isolated profile. This deviation is recorded rather than represented as a watched RED/GREEN cycle. |
| All-connectors-failed local usability | The new E2E first failed on the expected failure-state heading while the fixture still returned results; after using a launch-time failure mode, the UI exposed the actual “网络暂时不可用” state. | The corrected acceptance test passes and verifies old results, history, settings, and OCR remain usable. |

## Final verification

Commands and observed results:

```text
pnpm lint                          → exit 0
pnpm typecheck                     → exit 0
pnpm test                          → 32 files passed, 1 skipped; 303 passed, 1 skipped
pnpm build                         → exit 0; production output has no fixture connector chunk
pnpm dist:win                      → exit 0; NSIS x64 installer created
pnpm test:e2e                      → 17 passed; includes production ASAR fixture-absence assertion
pnpm dist:portable                 → exit 0; portable x64 executable created
Get-FileHash SHA256 + sidecar compare → both artifact hashes matched
```

The ordinary package attempts timed out fetching Electron from `20.205.243.166:443`. One retry per target through the previously successful local proxy (`127.0.0.1:7897`, `ELECTRON_GET_USE_PROXY=1`) succeeded; all temporary proxy environment variables were removed immediately afterward.

| Artifact | Size | SHA-256 |
|---|---:|---|
| `dist/劳动信息检索-0.1.0-x64.exe` | 140,237,971 bytes | `4b3ad456f354c229a764e61f3d234b5c8139a65ba6ef7f90149b887809d7d88e` |
| `dist/劳动信息检索-0.1.0-x64-portable.exe` | 120,388,499 bytes | `0859091722fac2cb587f4d1d74b0025367552fa03b5b82a2f0f3c3342cf05f55` |

Matching `.sha256` sidecars were written and verified against the binaries.

## Files changed

- Main: `src/main/search/source-preview.ts`, `src/main/search/rate-limiter.ts`, `src/main/search/search-service.ts`, `src/main/search/search-session-service.ts`, `src/main/results/{normalize-result,group-events}.ts`, `src/main/database/startup.ts`, `src/main/ipc/register-ipc.ts`, `src/main/index.ts`.
- Shared/preload/renderer: `src/shared/{types,schemas,contracts}.ts`, `src/renderer/src/{App.tsx,api/labor-api.ts,features/history/HistoryPage.tsx,features/results/{ResultsPage,ResultDetail,SourcePreviewDialog}.tsx}`.
- Build/release: `package.json`, `electron-builder.yml`, `.github/workflows/{ci,release-windows}.yml`.
- Tests: source preview, limiter, session startup/recovery, normalization/grouping, renderer uncertainty/history, packaged fixture boundary, DB recovery, and local usability E2E.
- Evidence: `docs/release-checklist.md` and this report.

## Residual concerns

- Interactive NSIS installation, portable visible-window launch, 100/125/150% DPI scaling, and a separate Windows account remain pending the required action-time user confirmation.
- OCR cancellation coverage proves the error-response path only; a late successful OCR response after cancellation is still untested.
- No push, tag, repository creation, or GitHub release was performed.

