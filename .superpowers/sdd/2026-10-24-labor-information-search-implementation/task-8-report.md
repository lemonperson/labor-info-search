# Task 8 report — Intake, Candidate Confirmation, and Polished Focused UI

## Result

Implemented the three intake modes and explicit subject confirmation. The renderer now returns `ConfirmedSubjectInput` data (`subject`, `selectedEvidence`, `verification`, `origin`) only after the user confirms one candidate. It does not start a search.

## RED/GREEN

- Wrote the intake and confirmation tests before creating their UI components and state modules.
- The first requested focused Vitest invocation could not reach the assertions: Vite failed with `EPERM` writing its temporary config under `node_modules/.vite-temp`. The later elevated Vitest invocation passed. The expected missing-component RED result was therefore not observed; the TDD evidence is incomplete.
- Added schema/preload/handler contract checks for marketplace resolution and cancellation. Full suite result: 248 passed, 1 skipped.

## Implementation

- Added `AppChrome`, keyboard-operable `SegmentedInput`, an accessible confirmation dialog, intake/subject state helpers, and the focused `留白聚焦`-inspired shell.
- Kept brand, manufacturer, commissioning party, distributor, and store roles distinct. Evidence is displayed readably while the confirmation result retains the selected evidence. Multiple candidates require a radio selection; names and roles remain editable.
- Manual entry and OCR/link candidates receive explicit `user-confirmed` verification, with visible `主体尚未权威核验` copy. Editable OCR text rebuilds candidates from its current contents.
- Added a narrow Zod-validated `marketplace.resolve/cancel` bridge and main-process sender checks. Link reads degrade to screenshot/manual intake; cancellation avoids stale responses replacing the current flow.
- Styled with a restrained system Chinese font stack, neutral surfaces, visible focus, 44px controls, reduced-motion handling, and a compact three-step rail. No ratings, dashboards, gradients, nested cards, or warning colors were added.

## Visual checks

- Compared against only the approved `留白聚焦` reference.
- Electron screenshots inspected at 1120×760 and 390×844. Both keep the form readable and have no horizontal overflow.
- Screenshot artifacts are `test-results/task8-intake-normal.png` and `test-results/task8-intake-narrow.png` (ignored test output).

## Verification

- `pnpm typecheck` — pass
- `pnpm lint` — pass
- `pnpm test` — 19 passed, 1 skipped; 248 passed, 1 skipped
- `pnpm build` — pass
- `pnpm test:e2e` — 7 passed; covers manual confirmation, keyboard mode switching, validation, blocked supported-platform link fallback, OCR correction, browser non-navigation, and narrow viewport smoke

Vitest, the Electron build, and E2E needed elevated temporary-file access because the sandbox denied writes to Vite/Vitest-generated temporary files. Builds and tests completed successfully after escalation.

## Files changed

- `src/main/index.ts`
- `src/main/ipc/register-ipc.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/api/labor-api.ts`
- `src/renderer/src/app.css`
- `src/renderer/src/components/AppChrome.tsx`
- `src/renderer/src/components/ConfirmDialog.tsx`
- `src/renderer/src/components/SegmentedInput.tsx`
- `src/renderer/src/features/intake/IntakePage.tsx`
- `src/renderer/src/features/intake/intake-state.ts`
- `src/renderer/src/features/subject/SubjectConfirmation.tsx`
- `src/renderer/src/features/subject/subject-state.ts`
- `src/shared/contracts.ts`
- `src/shared/schemas.ts`
- `src/shared/types.ts`
- `tests/e2e/app.spec.ts`
- `tests/unit/marketplace/handlers.test.ts`
- `tests/unit/renderer/intake-page.test.tsx`
- `tests/unit/renderer/subject-confirmation.test.tsx`
- `tests/unit/shared/contracts.test.ts`
- `tests/unit/shared/storage-contracts.test.ts`
- `vitest.config.ts`

## Self-review and concerns

- Rechecked that the only path from candidate discovery to a confirmed subject is the explicit “确认主体” action. The marketplace and OCR bridge contain no search capability.
- Link resolver output and request data are validated on both renderer and main-process boundaries; cancellation aborts the active resolver.
- One existing suite test remains skipped. The report does not claim a watched RED cycle because sandbox permissions prevented that initial check.
- The eventual search invocation is intentionally downstream of this task; the confirmed input is ready for its consumer.

## Review fix round 1/5 — 44px touch targets

### RED

Command: `pnpm test:e2e --grep "touch controls meet"`

Result: failed as expected. The new 390px viewport assertion measured mode tabs at 111.3×36px, the text action at 77×40px, and the dialog close control at 39.6×39.6px.

### GREEN

Raised mode tabs and text actions to `min-height: 44px`; set the dialog close control to 44×44px. The first rerun caught the entrance animation's `scale(.99)`, which briefly reduced the close control to 43.6×43.6px. Removed that scale while retaining the subtle vertical entrance transition.

- `pnpm test:e2e --grep "touch controls meet"` — pass, 1 test.
- `pnpm vitest run tests/unit/renderer/intake-page.test.tsx tests/unit/renderer/subject-confirmation.test.tsx` — pass, 2 files / 5 tests.
- `pnpm typecheck` — pass.
- `pnpm lint` — pass.
- `pnpm build` — pass.
- `pnpm test:e2e` — pass, 8 tests. Normal and narrow viewport screenshots were regenerated and inspected; layout remains compact and no horizontal overflow appeared.
