# Labor Information Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a polished Windows 10/11 desktop application that identifies a company from a name, shopping link, or screenshot and presents sourced, neutral labor-rights information without accounts, API keys, ratings, or purchasing recommendations.

**Architecture:** Use a secure Electron 45 desktop shell with a React 19.3 renderer and a narrow typed preload bridge. All network access, OCR, persistence, link parsing, and external-browser calls run in the main process; the renderer receives plain typed data only. Search is connector-based and best-effort, with partial-failure handling and an explicit confirmation step before any browser fallback.

**Tech Stack:** Electron 45.x, Node.js 24.22.x for development, React 19.3.x, TypeScript, Vite 8.3.x, pnpm, Zod, better-sqlite3, Cheerio, fast-xml-parser, Tesseract.js with bundled Simplified Chinese data, Vitest, React Testing Library, Playwright Electron tests, electron-builder 27.x, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-24-labor-information-search-design.md`

## Global Constraints

- Ship Windows 10/11 x64 first; users must not need Node.js, Python, a terminal, an account, or an API key.
- First-release sources and OCR are Chinese-language and focused on mainland-China companies.
- All cloud-LLM and paid search dependencies are prohibited in v1.
- Never score, rank morally, blacklist, or recommend buying/avoiding a company.
- Distinguish brand owner, seller, manufacturer, principal, parent, subsidiary, and platform; unresolved identity must be visibly labeled `主体尚未权威核验`.
- Personal/social claims must remain attributed and marked unverified; company responses, decisions, corrections, and later developments must be co-presented when found.
- Never bypass login, CAPTCHA, paywall, robots/access controls, or anti-automation controls.
- Never open an external browser without a per-action user confirmation showing provider, domain, and exact query.
- Store history/cache locally only; no telemetry. Do not retain uploaded screenshots by default.
- Render fetched content as text, never execute source HTML or scripts.
- Product working name is `劳动信息检索`; repository slug is `labor-info-search`; license is MIT.
- Pin all resolved dependency versions in `pnpm-lock.yaml`; use Electron `45.0.0` initially and update only with passing security, unit, integration, E2E, and packaging tests.

## Review Focus

- Malformed, unsupported, oversized, redirecting, localhost, and private-network URLs must be rejected without making an unsafe request; Task 4 and Task 6 pin this behavior.
- Two companies with the same or similar names must never be silently merged; Task 3 and Task 8 require explicit subject confirmation and preserve matching evidence.
- Source titles/excerpts containing HTML, scripts, bidirectional control characters, or extreme text length must render as inert bounded text; Task 9 and Task 10 cover this.
- One connector timing out, rate-limiting, or returning malformed data must yield partial results plus a clear channel status rather than failing the whole search; Task 5 and Task 9 cover this.
- The same article found by multiple queries or URLs, and related report/response/follow-up pages, must deduplicate without losing provenance; Task 9 covers canonicalization and event grouping.

---

## Planned File Structure

```text
.
├─ .github/
│  ├─ workflows/ci.yml
│  ├─ workflows/release-windows.yml
│  └─ ISSUE_TEMPLATE/{bug-report.yml,source-correction.yml,subject-mismatch.yml}
├─ docs/
│  ├─ superpowers/{specs,plans}/...
│  └─ architecture.md
├─ resources/
│  ├─ icons/{icon.svg,icon.ico}
│  ├─ ocr/chi_sim.traineddata.gz
│  └─ sources/source-registry.json
├─ src/
│  ├─ shared/
│  │  ├─ contracts.ts
│  │  ├─ schemas.ts
│  │  └─ types.ts
│  ├─ main/
│  │  ├─ index.ts
│  │  ├─ window.ts
│  │  ├─ ipc/register-ipc.ts
│  │  ├─ security/{safe-fetch.ts,text-safety.ts}
│  │  ├─ database/{database.ts,migrations.ts,search-repository.ts,settings-repository.ts}
│  │  ├─ identity/{candidate-extractor.ts,query-builder.ts}
│  │  ├─ marketplace/{link-resolver.ts,types.ts,adapters/{taobao.ts,jd.ts,douyin.ts,pinduoduo.ts}}
│  │  ├─ ocr/ocr-service.ts
│  │  ├─ search/{types.ts,search-service.ts,browser-fallback.ts,connectors/{bing-rss.ts}}
│  │  └─ results/{classify-source.ts,normalize-result.ts,deduplicate.ts,group-events.ts}
│  ├─ preload/index.ts
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx
│        ├─ App.tsx
│        ├─ app.css
│        ├─ api/labor-api.ts
│        ├─ components/{AppChrome.tsx,SegmentedInput.tsx,SourceBadge.tsx,EmptyState.tsx,ConfirmDialog.tsx}
│        └─ features/{intake,subject,search,results,history,settings}/...
├─ tests/
│  ├─ fixtures/{marketplace,search,ocr}/...
│  ├─ unit/...
│  ├─ integration/...
│  └─ e2e/app.spec.ts
├─ electron-builder.yml
├─ electron.vite.config.ts
├─ package.json
├─ tsconfig.json
├─ vitest.config.ts
└─ playwright.config.ts
```

## Task 1: Secure Desktop Skeleton and Typed Bridge

**Files:**
- Create: `.gitignore`, `.editorconfig`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `electron.vite.config.ts`, `vitest.config.ts`
- Create: `src/main/index.ts`, `src/main/window.ts`, `src/preload/index.ts`
- Create: `src/shared/types.ts`, `src/shared/schemas.ts`, `src/shared/contracts.ts`
- Create: `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/app.css`, `src/renderer/src/api/labor-api.ts`
- Test: `tests/unit/shared/contracts.test.ts`, `tests/e2e/app.spec.ts`, `playwright.config.ts`

**Interfaces:**
- Produces: `window.laborApi: LaborApi`; `LaborApi.getAppInfo(): Promise<AppInfo>`; shared `Result<T, E>` and IPC request/response schemas.
- Security invariant: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, deny renderer navigation/window creation by default.

- [ ] **Step 1: Initialize Git and scaffold the pinned Electron/React/TypeScript project**

Run `git init`, set branch `main`, create the files above, and add scripts `dev`, `typecheck`, `lint`, `test`, `test:e2e`, `build`, `dist:win`, and `dist:portable`.

- [ ] **Step 2: Write failing contract and window-security tests**

Assert `AppInfo` parses `{ name: "劳动信息检索", version: string, platform: "win32" }`, invalid IPC payloads are rejected, `window.laborApi` exposes only declared methods, and the BrowserWindow uses the four security invariants above.

- [ ] **Step 3: Run the focused tests and confirm failure**

Run: `pnpm vitest run tests/unit/shared/contracts.test.ts && pnpm playwright test tests/e2e/app.spec.ts`

Expected: FAIL because the bridge and window do not exist.

- [ ] **Step 4: Implement the minimal secure shell and typed bridge**

Use Zod at both IPC boundaries. The initial renderer shows the working product name and a single loading-safe root surface; do not implement feature UI yet.

- [ ] **Step 5: Verify shell, types, and production build**

Run: `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`

Expected: all commands exit 0 and E2E verifies no Node globals are available in the renderer.

- [ ] **Step 6: Commit**

Run: `git add . && git commit -m "chore: bootstrap secure Electron application"`

## Task 2: Core Domain Model and Neutral Query Generation

**Files:**
- Modify: `src/shared/types.ts`, `src/shared/schemas.ts`
- Create: `src/main/identity/query-builder.ts`
- Create: `resources/sources/source-registry.json`
- Test: `tests/unit/identity/query-builder.test.ts`, `tests/unit/shared/schemas.test.ts`

**Interfaces:**
- Produces: `CompanySubject`, `EntityCandidate`, `SubjectRole`, `SourceType`, `ClaimStatus`, `SourceRecord`, `EventGroup`, `SearchSession`, `SearchQuery`.
- Produces: `buildLaborQueries(subject: CompanySubject): SearchQuery[]`.
- `CompanySubject.verification` is exactly `"verified" | "user-confirmed" | "unverified"`.

- [ ] **Step 1: Write failing schema tests for every persisted/network-facing domain type**

Tests must reject blank subject names, unknown source types, malformed URLs, excerpts over 1,200 characters, and records without publisher/access time; they must preserve role distinctions and verification state.

- [ ] **Step 2: Write failing query-builder tests**

For subject `示例制造有限公司`, assert deterministic queries cover these eight groups without moral language: `欠薪/工资拖欠`, `劳动仲裁/劳动争议`, `违法解除/裁员`, `加班/工时`, `社保/工伤`, `劳动保障监察/行政处罚`, `员工待遇`, `企业回应/情况说明`.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `pnpm vitest run tests/unit/shared/schemas.test.ts tests/unit/identity/query-builder.test.ts`

Expected: FAIL for missing types/functions.

- [ ] **Step 4: Implement exact types, Zod schemas, source registry schema, and query builder**

Each `SearchQuery` contains `id`, `subjectId`, `terms`, `topic`, and optional `siteScope`; it never contains a severity score.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/unit/shared/schemas.test.ts tests/unit/identity/query-builder.test.ts && pnpm typecheck`

Expected: PASS, then commit with `git commit -am "feat: define neutral search domain model"` plus newly created files.

## Task 3: Local SQLite History, Cache, and Privacy Settings

**Files:**
- Create: `src/main/database/database.ts`, `src/main/database/migrations.ts`, `src/main/database/search-repository.ts`, `src/main/database/settings-repository.ts`
- Modify: `src/shared/contracts.ts`, `src/preload/index.ts`
- Test: `tests/integration/database/search-repository.test.ts`, `tests/integration/database/settings-repository.test.ts`

**Interfaces:**
- Produces: `openDatabase(path: string): DatabaseHandle`.
- Produces: `SearchRepository.saveSession(session)`, `getSession(id)`, `listSessions(limit)`, `deleteSession(id)`, `clearAll()`.
- Produces: `SettingsRepository.getSettings()`, `updateSettings(patch)` with defaults `{ saveHistory: true, theme: "system", browserProvider: "bing" }`.

- [ ] **Step 1: Write failing repository tests using a temporary database**

Cover save/read/delete, cascade deletion of records, schema migration from version 0, disabled-history behavior, transaction rollback, and two similar company names remaining separate session subjects.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm vitest run tests/integration/database`

Expected: FAIL because repositories do not exist.

- [ ] **Step 3: Implement migration version 1 and repositories**

Tables: `search_sessions`, `subjects`, `source_records`, `event_groups`, `event_group_members`, `connector_runs`, `settings`. Store short excerpts only; never store uploaded image bytes.

- [ ] **Step 4: Register validated history/settings IPC methods**

Expose only `history.list/get/delete/clear` and `settings.get/update` through `LaborApi`; every request and response uses Task 2 schemas.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/integration/database && pnpm typecheck`

Expected: PASS, then commit `feat: add local private search storage`.

## Task 4: Safe Network Boundary and Text Safety

**Files:**
- Create: `src/main/security/safe-fetch.ts`, `src/main/security/text-safety.ts`
- Test: `tests/unit/security/text-safety.test.ts`, `tests/integration/security/safe-fetch.test.ts`

**Interfaces:**
- Produces: `safeFetchText(url: URL, options: SafeFetchOptions): Promise<SafeFetchResult>`.
- `SafeFetchOptions` fixes defaults: 10-second timeout, 2 MiB response limit, 5 redirects, HTTP/HTTPS only.
- Produces: `toSafeDisplayText(input: string, maxLength: number): string`.

- [ ] **Step 1: Write failing URL and redirect safety tests**

Cover invalid scheme, embedded credentials, localhost, IPv4/IPv6 loopback, RFC1918/link-local targets, DNS resolving to private IP, public-to-private redirect, more than five redirects, oversized body, unsupported MIME type, timeout, and valid public UTF-8 HTML.

- [ ] **Step 2: Write failing hostile-text tests**

Assert tags/scripts become inert plain text, NUL/bidirectional control characters are removed, whitespace is normalized, and text is truncated at the requested bound without splitting a surrogate pair.

- [ ] **Step 3: Run tests and confirm failure**

Run: `pnpm vitest run tests/unit/security tests/integration/security`

Expected: FAIL for missing functions.

- [ ] **Step 4: Implement safe fetch with DNS re-check per redirect and bounded streaming**

Do not follow redirects through the global `fetch` implementation automatically; validate each hop before requesting it.

- [ ] **Step 5: Implement text safety and verify**

Run: `pnpm vitest run tests/unit/security tests/integration/security && pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit `feat: enforce safe network and text boundaries`.

## Task 5: Search Connector, Partial Results, and Browser Fallback Query

**Files:**
- Create: `src/main/search/types.ts`, `src/main/search/connectors/bing-rss.ts`, `src/main/search/search-service.ts`, `src/main/search/browser-fallback.ts`
- Modify: `src/shared/types.ts`, `resources/sources/source-registry.json`
- Test: `tests/fixtures/search/{bing-success.xml,bing-malformed.xml}`, `tests/unit/search/browser-fallback.test.ts`, `tests/integration/search/search-service.test.ts`

**Interfaces:**
- Produces: `SearchConnector.search(query: SearchQuery, signal: AbortSignal): Promise<ConnectorResult>`.
- Produces: `SearchService.run(subject, queries, onProgress, signal): Promise<SearchBatch>`.
- Produces: `buildBrowserFallback(provider: "bing", queries: SearchQuery[]): BrowserFallbackPreview` containing provider, hostname, exact query strings, and URLs.

- [ ] **Step 1: Write failing fixture-based connector tests**

Assert RSS items become raw source records with title, URL, publisher/domain, date when supplied, query provenance, and safe excerpts; malformed XML returns a typed connector failure.

- [ ] **Step 2: Write failing orchestration tests**

Cover cancellation, concurrency limit 2, per-query timeout, one failed connector plus successful results, all connectors failed, and progress events. Partial success must return records plus connector status.

- [ ] **Step 3: Write failing browser-fallback tests**

Assert query encoding, visible hostname `www.bing.com`, exact preview text, and no call to Electron `shell.openExternal` from the query-builder module.

- [ ] **Step 4: Implement connector and orchestration**

Treat the RSS endpoint as replaceable and best-effort. Do not scrape CAPTCHA pages; detect HTML/non-RSS responses and return `blocked_or_changed`.

- [ ] **Step 5: Add an opt-in network smoke test**

Create `tests/smoke/search-network.smoke.ts`, skipped unless `RUN_NETWORK_SMOKE=1`; assert only that the connector returns a typed success/failure within 15 seconds, never that a specific third-party result exists.

- [ ] **Step 6: Verify and commit**

Run: `pnpm vitest run tests/unit/search tests/integration/search`

Expected: PASS, then commit `feat: add no-key search orchestration`.

## Task 6: Shopping-Link Resolution and Four Marketplace Adapters

**Files:**
- Create: `src/main/marketplace/types.ts`, `src/main/marketplace/link-resolver.ts`
- Create: `src/main/marketplace/adapters/{taobao.ts,jd.ts,douyin.ts,pinduoduo.ts}`
- Create: `tests/fixtures/marketplace/{taobao,jd,douyin,pinduoduo}/{metadata.html,manufacturer.html}`
- Test: `tests/unit/marketplace/adapters.test.ts`, `tests/integration/marketplace/link-resolver.test.ts`

**Interfaces:**
- Produces: `MarketplaceAdapter.canHandle(url): boolean` and `extract(document, finalUrl): ProductResolution`.
- Produces: `resolveProductLink(rawUrl: string, signal: AbortSignal): Promise<ProductResolution>`.
- `ProductResolution` contains `platform`, `productTitle`, `finalUrl`, `candidates: EntityCandidate[]`, `evidence[]`, `warnings[]`, and `status` exactly `resolved | partial | blocked | unsupported`.

- [ ] **Step 1: Write failing host-recognition and synthetic fixture tests**

Cover Taobao/Tmall, JD, Douyin short/product links, and Pinduoduo/Yangkeduo hosts. Assert brand, seller, manufacturer, and principal remain separate roles; missing manufacturer yields `partial`, not a guessed company.

- [ ] **Step 2: Write failing resolver safety and degradation tests**

Cover whitespace, tracking parameters, normal redirects, private-network URLs, unsupported domain, login page, CAPTCHA/blocked page, oversized response, and cancellation.

- [ ] **Step 3: Run tests and confirm failure**

Run: `pnpm vitest run tests/unit/marketplace tests/integration/marketplace`

Expected: FAIL for missing adapters/resolver.

- [ ] **Step 4: Implement static metadata/JSON-LD/label extraction only**

Use Cheerio in the main process. Do not automate login or bundle a hidden browser for scraping. Each evidence item records exact source field/label and a short text excerpt.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/unit/marketplace tests/integration/marketplace && pnpm typecheck`

Expected: PASS, then commit `feat: resolve marketplace company candidates`.

## Task 7: Local Screenshot OCR and Candidate Extraction

**Files:**
- Create: `src/main/ocr/ocr-service.ts`, `src/main/identity/candidate-extractor.ts`
- Add: `resources/ocr/chi_sim.traineddata.gz`, attribution/license note in `THIRD_PARTY_NOTICES.md`
- Modify: `src/main/ipc/register-ipc.ts`, `src/preload/index.ts`, `src/shared/contracts.ts`
- Test: `tests/fixtures/ocr/{package-label.png,no-company.png}`, `tests/unit/identity/candidate-extractor.test.ts`, `tests/integration/ocr/ocr-service.test.ts`

**Interfaces:**
- Produces: `recognizeImage(imagePath: string, signal: AbortSignal): Promise<OcrTextResult>`.
- Produces: `extractEntityCandidates(text: string): EntityCandidate[]` using label contexts `品牌`, `生产企业`, `制造商`, `委托方`, `经销商`.
- Preload exposes `image.pickAndRecognize(): Promise<Result<OcrCandidateResult, OcrError>>`; it never exposes arbitrary filesystem reads.

- [ ] **Step 1: Write failing extraction tests**

Assert labels map to separate roles, repeated/whitespace-broken company names normalize, low-confidence/label-free text produces editable raw text without auto-search, and two distinct company names are not merged.

- [ ] **Step 2: Write failing OCR boundary tests**

Cover PNG/JPEG/WebP, invalid MIME/extension mismatch, file over 20 MiB, unreadable file, cancellation, Chinese package fixture, and no persistence of input image bytes/path in the repository.

- [ ] **Step 3: Run tests and confirm failure**

Run: `pnpm vitest run tests/unit/identity/candidate-extractor.test.ts tests/integration/ocr`

Expected: FAIL for missing OCR service.

- [ ] **Step 4: Implement a single reusable Tesseract worker with bundled Chinese data**

Load the worker lazily, emit progress, terminate it on app shutdown, and return plain text plus word/line confidence. Validate files in the main process before OCR.

- [ ] **Step 5: Verify offline and commit**

Run tests with network disabled or an empty proxy setting; expected PASS without downloading language data. Commit `feat: add private local screenshot OCR`.

## Task 8: Intake, Candidate Confirmation, and Polished Focused UI

**Files:**
- Create: `src/renderer/src/components/{AppChrome.tsx,SegmentedInput.tsx,ConfirmDialog.tsx}`
- Create: `src/renderer/src/features/intake/{IntakePage.tsx,intake-state.ts}`
- Create: `src/renderer/src/features/subject/{SubjectConfirmation.tsx,subject-state.ts}`
- Modify: `src/renderer/src/App.tsx`, `src/renderer/src/app.css`, `src/renderer/src/api/labor-api.ts`
- Test: `tests/unit/renderer/intake-page.test.tsx`, `tests/unit/renderer/subject-confirmation.test.tsx`, `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: Task 6 `resolveProductLink`, Task 7 `image.pickAndRecognize`, Task 2 domain schemas.
- Produces: `ConfirmedSubjectInput` with `subject`, `selectedEvidence`, `verification` and `origin`.

- [ ] **Step 1: Write failing component tests for all three input modes**

Assert keyboard switching, one primary action, validation copy, loading/cancel states, link/OCR degradation, editable OCR text, and no search beginning before the user confirms a candidate.

- [ ] **Step 2: Write failing confirmation tests**

Assert roles are shown separately, evidence is readable, ambiguous candidates require selection, and proceeding without authoritative identity sets `user-confirmed` plus visible `主体尚未权威核验`.

- [ ] **Step 3: Run tests and confirm failure**

Run: `pnpm vitest run tests/unit/renderer/intake-page.test.tsx tests/unit/renderer/subject-confirmation.test.tsx`

Expected: FAIL because components do not exist.

- [ ] **Step 4: Implement the approved “留白聚焦” shell**

Use custom CSS tokens and system Chinese font stack, restrained surfaces, exact spacing hierarchy, subtle state transitions, 44px touch targets, visible keyboard focus, and `prefers-reduced-motion`. Avoid dashboard cards, scores, warning colors, decorative gradients, and nested panels.

- [ ] **Step 5: Add focused E2E paths**

Cover manual company confirmation, blocked link falling back to screenshot/manual mode, and OCR candidate correction. Verify the browser is never opened in these flows.

- [ ] **Step 6: Verify visual behavior and commit**

Run: `pnpm test && pnpm test:e2e && pnpm build`

Expected: PASS, then commit `feat: add focused company intake experience`.

## Task 9: Result Normalization, Classification, Deduplication, and Event Grouping

**Files:**
- Create: `src/main/results/{classify-source.ts,normalize-result.ts,deduplicate.ts,group-events.ts}`
- Modify: `resources/sources/source-registry.json`, `src/shared/types.ts`
- Test: `tests/unit/results/{classify-source,normalize-result,deduplicate,group-events}.test.ts`

**Interfaces:**
- Produces: `classifySource(url, publisher, registry): SourceClassification`.
- Produces: `normalizeRawResult(raw, subject): SourceRecord`.
- Produces: `deduplicateRecords(records): DeduplicationResult` preserving all `queryIds` and connector provenance.
- Produces: `groupRelatedEvents(records): EventGroup[]` using deterministic title/entity/date similarity; no severity inference.

- [ ] **Step 1: Write failing classification/normalization tests**

Cover `.gov.cn`/court entries, configured media domains, social-platform content, unknown sites, missing dates, unsafe markup, 1,200-character bound, attribution phrases, and a source registry entry that is disabled without code changes.

- [ ] **Step 2: Write failing deduplication tests**

Cover tracking parameters, fragments, redirected canonical URLs, same URL from eight queries, same title on different domains, and preserving earliest/latest access plus every query ID.

- [ ] **Step 3: Write failing event-group tests**

Assert report/response/follow-up may group when subject and evidence overlap, unrelated same-day pages remain separate, and uncertain grouping is marked `suggested` rather than stated as fact.

- [ ] **Step 4: Implement deterministic pipelines**

All source types come from hostname registry/connector metadata, not sentiment. Unknown content remains `other`; never guess `company_response` solely from favorable wording.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run tests/unit/results && pnpm typecheck`

Expected: PASS, then commit `feat: organize sourced search results neutrally`.

## Task 10: End-to-End Search Session, Progress, and Persistence

**Files:**
- Modify: `src/main/search/search-service.ts`, `src/main/ipc/register-ipc.ts`, `src/preload/index.ts`, `src/shared/contracts.ts`
- Create: `src/main/search/search-session-service.ts`
- Test: `tests/integration/search/search-session-service.test.ts`, `tests/e2e/search-flow.spec.ts`

**Interfaces:**
- Produces: `SearchSessionService.start(input, progressPort): Promise<SearchSession>` and `cancel(sessionId): Promise<void>`.
- Preload exposes `search.start(confirmedSubject)`, `search.cancel(sessionId)`, and a disposable `search.onProgress(listener)`.
- Consumes: Tasks 2, 3, 5, and 9.

- [ ] **Step 1: Write failing session tests**

Cover normal results, no results, one connector timeout, all connectors blocked, cancellation, save-history on/off, duplicate results, event grouping, and ambiguous subject evidence retained in the saved session.

- [ ] **Step 2: Write failing IPC lifetime tests**

Assert malformed inputs are rejected, progress subscriptions are removed on renderer disposal, concurrent sessions have isolated IDs, and cancellation does not delete already completed partial results.

- [ ] **Step 3: Run tests and confirm failure**

Run: `pnpm vitest run tests/integration/search/search-session-service.test.ts`

Expected: FAIL for missing orchestration.

- [ ] **Step 4: Implement session orchestration and validated IPC**

Persist only after normalization; emit phases `preparing_queries`, `searching`, `normalizing`, `saving`, `complete`; expose connector failures as readable channel statuses.

- [ ] **Step 5: Verify and commit**

Run: `pnpm test && pnpm test:e2e`

Expected: PASS, then commit `feat: run resilient local search sessions`.

## Task 11: Results List, Independent Detail View, and Confirmed Browser Escape Hatch

**Files:**
- Create: `src/renderer/src/components/{SourceBadge.tsx,EmptyState.tsx}`
- Create: `src/renderer/src/features/search/{SearchProgress.tsx,search-state.ts}`
- Create: `src/renderer/src/features/results/{ResultsPage.tsx,ResultRow.tsx,ResultDetail.tsx,ResultFilters.tsx,BrowserFallbackDialog.tsx}`
- Modify: `src/renderer/src/App.tsx`, `src/renderer/src/app.css`, `src/main/ipc/register-ipc.ts`
- Test: `tests/unit/renderer/{results-page,result-detail,browser-fallback-dialog}.test.tsx`, `tests/e2e/search-flow.spec.ts`

**Interfaces:**
- Consumes: `SearchSession`, `SourceRecord`, `EventGroup`, `BrowserFallbackPreview`.
- Main process exposes `browser.openConfirmed(previewId: string): Promise<Result<void, BrowserOpenError>>`; preview IDs are one-time, expire after 5 minutes, and bind to an exact HTTPS URL created by Task 5.

- [ ] **Step 1: Write failing results-list tests**

Assert default relevance ordering, optional time ordering, factual source-type filters, publisher/date/title/excerpt display, no score/buying advice, visible unverified attribution, and partial-channel status without dominating the page.

- [ ] **Step 2: Write failing detail-view tests**

Assert original URL/domain, subject-match evidence, longer safe excerpt, related response/follow-up items, deleted/unavailable state, back navigation restoring scroll/filter state, and hostile source text rendered as inert text.

- [ ] **Step 3: Write failing browser-consent tests**

Assert dialog displays reason, provider, hostname, exact queries, and privacy copy; cancel never opens a browser; confirm opens once; expired/replayed/tampered preview IDs fail closed.

- [ ] **Step 4: Implement the approved result and detail experience**

Keep a quiet vertical list with restrained source labels and an independent detail view. Use transitions only to preserve spatial context and disable them for reduced-motion users.

- [ ] **Step 5: Implement main-process one-time browser confirmation tokens**

The renderer cannot supply an arbitrary URL to `shell.openExternal`; it can only redeem the exact main-process preview it displayed.

- [ ] **Step 6: Verify and commit**

Run: `pnpm test && pnpm test:e2e && pnpm build`

Expected: PASS, then commit `feat: present sourced results and safe browser fallback`.

## Task 12: History, Settings, First-Run Disclosure, and Failure States

**Files:**
- Create: `src/renderer/src/features/history/{HistoryPage.tsx,HistoryRow.tsx}`
- Create: `src/renderer/src/features/settings/{SettingsPage.tsx,FirstRunDisclosure.tsx}`
- Create: `src/renderer/src/components/FailureState.tsx`
- Modify: `src/renderer/src/App.tsx`, `src/renderer/src/app.css`
- Test: `tests/unit/renderer/{history-page,settings-page,failure-states}.test.tsx`, `tests/e2e/privacy-flow.spec.ts`

**Interfaces:**
- Consumes: Task 3 history/settings methods.
- Produces: first-run acknowledgement setting `disclosureAcceptedAt`; no network request is allowed before the user submits a search.

- [ ] **Step 1: Write failing privacy/history tests**

Cover local-history disclosure, default enabled state, disable-before-search, delete one, clear all with confirmation, and no retained screenshot path/bytes.

- [ ] **Step 2: Write failing failure-state tests**

Cover offline, no results, link blocked, OCR low confidence, source unavailable, all connectors failed, and database recovery. Every state must state what happened and offer at least one safe next action.

- [ ] **Step 3: Implement history/settings and calm failure states**

Use the same focused visual system. Do not turn settings into a developer console; advanced connector diagnostics live behind a copyable “技术详情” disclosure.

- [ ] **Step 4: Run accessibility-focused checks**

Use Testing Library role/name assertions and Playwright keyboard navigation; verify visible focus, Escape behavior for dialogs, focus return, and no color-only meaning.

- [ ] **Step 5: Verify and commit**

Run: `pnpm test && pnpm test:e2e && pnpm build`

Expected: PASS, then commit `feat: add local history and privacy controls`.

## Task 13: Windows Packaging, Offline Assets, Documentation, and CI

**Files:**
- Create: `electron-builder.yml`, `resources/icons/{icon.svg,icon.ico}`
- Create: `README.md`, `LICENSE`, `PRIVACY.md`, `SOURCES.md`, `DISCLAIMER.md`, `CONTRIBUTING.md`, `THIRD_PARTY_NOTICES.md`, `docs/architecture.md`
- Create: `.github/workflows/ci.yml`, `.github/workflows/release-windows.yml`
- Create: `.github/ISSUE_TEMPLATE/{bug-report.yml,source-correction.yml,subject-mismatch.yml}`
- Modify: `package.json`
- Test: `tests/e2e/packaged-app.spec.ts`

**Interfaces:**
- Produces: NSIS per-user installer and portable x64 `.exe`; stable `appId: org.laborinfosearch.desktop`.
- Produces: CI artifacts on every tagged release; publishing remains unsigned until a certificate is added.

- [ ] **Step 1: Write failing packaged-app smoke test**

Launch the unpacked production build and assert first-run disclosure, app name/version, bundled OCR availability without network, database creation in user data, and clean shutdown.

- [ ] **Step 2: Configure packaging and assets**

Use electron-builder NSIS and portable targets, `asar: true`, explicit unpack rules only for required native/OCR assets, per-user installation without elevation, stable artifact names, and no auto-update in v1.

- [ ] **Step 3: Write user-facing documentation**

README must include screenshots, install/run steps for non-programmers, Windows security-warning instructions, supported inputs, known platform parsing limits, “not a blacklist/not legal advice” language, privacy behavior, and source-build instructions in a separate developer section.

- [ ] **Step 4: Add CI and release workflows**

CI on Windows runs install with frozen lockfile, lint, typecheck, unit/integration tests, build, and E2E. Tagged releases additionally create NSIS/portable artifacts and SHA-256 checksums without silently claiming code signing.

- [ ] **Step 5: Verify release candidates locally**

Run: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm dist:win && pnpm dist:portable && pnpm playwright test tests/e2e/packaged-app.spec.ts`

Expected: all commands exit 0; installer and portable app launch on Windows without a development runtime.

- [ ] **Step 6: Commit**

Commit `build: package and document Windows release`.

## Task 14: Final Acceptance, GitHub Publication, and Release Verification

**Files:**
- Modify: only files needed to fix acceptance findings
- Create: `docs/release-checklist.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: public GitHub repository `labor-info-search` and first tagged prerelease.

- [ ] **Step 1: Run the ten acceptance scenarios from the design spec**

Record pass/fail evidence in `docs/release-checklist.md`, including manual UI review at 100%, 125%, and 150% Windows scaling and a clean Windows user profile.

- [ ] **Step 2: Run security and privacy acceptance**

Verify no telemetry/network request before search, no renderer Node access, no arbitrary external URL opening, no retained screenshot, private-address blocking, safe text rendering, and complete local-data deletion.

- [ ] **Step 3: Run full automated verification from a clean checkout**

Run: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e && pnpm dist:win && pnpm dist:portable`

Expected: all commands exit 0 and both artifacts exist with checksums.

- [ ] **Step 4: Review the branch before publication**

Use `superpowers:requesting-code-review`; resolve all correctness, security, privacy, neutrality, and packaging findings, then rerun Step 3.

- [ ] **Step 5: Publish the public repository**

After confirming the signed-in GitHub account and that `labor-info-search` is available, run `gh repo create labor-info-search --public --source . --remote origin --push`. If the name is unavailable, stop and ask for a new slug rather than inventing one.

- [ ] **Step 6: Create and verify the first prerelease**

Tag `v0.1.0`, let the Windows release workflow attach installer, portable executable, and checksums, then download and smoke-test those exact GitHub artifacts before marking the prerelease ready for users.

- [ ] **Step 7: Commit release evidence**

Commit `docs: record v0.1.0 acceptance results` and push the final verified state.

## Self-Review Outcome

- **Spec coverage:** All design sections map to Tasks 1–14: secure desktop shell, three inputs, subject confirmation, no-key search, source neutrality, event grouping, focused UI, browser consent, local privacy, Windows distribution, documentation, and GitHub publication.
- **Step scan:** Each checkbox is one implementation or verification action; external behavior is fixed by named tests and typed interfaces rather than code transcripts.
- **Type consistency:** `CompanySubject`, `EntityCandidate`, `SourceRecord`, `EventGroup`, `SearchSession`, `BrowserFallbackPreview`, and `LaborApi` originate in Tasks 1–2 and are consumed consistently later.
- **Review Focus:** The five highest-risk unowned input/failure classes are each pinned to explicit tests in Tasks 3–11.
- **Proportion:** The plan chooses boundaries, signatures, test cases, and verification commands while leaving implementation bodies to the executor.
