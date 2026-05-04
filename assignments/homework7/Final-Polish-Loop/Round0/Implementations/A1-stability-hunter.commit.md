---
reviewer_id: A1-stability-hunter
plan_source: Round0/Plans/A1-stability-hunter.md
round: 0
date: 2026-05-01
parent_commit: 78b346e
head_commit: 7b4526b
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 7/7
tests_passed: 1646/1654
tests_new: test/long-run-api-shim.test.js (extended, +5 cases)
---

## Steps executed

- [x] **Step 1**: `src/app/snapshotService.js:281` — wrapped `JSON.parse(raw)` in `loadFromStorage` with `try { … } catch { return null; }`. Bare `null` already maps to "no snapshot" downstream, so no caller-side change needed.
- [x] **Step 2**: `src/app/GameApp.js:1480` (`saveSnapshot`) — appended `return { ok: true, slotId, bytes: result.bytes }` after the existing `actionMessage` assignment. Existing UI caller (`onSaveSnapshot`) ignores return — purely additive.
- [x] **Step 3**: `src/app/GameApp.js:1492` (`loadSnapshot`) — added `{ ok: false, reason: 'notFound', reasonText }` on the early-return path (slot missing) and `{ ok: true, slotId, phase }` on the success path. Existing UI caller (`onLoadSnapshot`) ignores return.
- [x] **Step 4**: `src/main.js:208-209` (`__utopiaLongRun.saveSnapshot` / `loadSnapshot` shim entries) — propagated return values directly with `{ ok:false, reason:'notReady', reasonText:'GameApp not initialised.' }` fallback when `app` is null/undefined. Mirrors the `placeToolAt` `{ok, reason, reasonText}` contract.
- [x] **Step 5**: `src/main.js` (new helper above `mountBootError`) — added `installBenignErrorFilter()` exported function that registers a single capture-phase `error` listener swallowing messages starting with `"ResizeObserver loop"`, with `event.preventDefault()` + `event.stopImmediatePropagation()` and increments `window.__utopiaBenignSuppressed`. Idempotency guard via `window.__utopiaBenignErrorInstalled`. No-op when `typeof window === 'undefined'`.
- [x] **Step 6**: `src/main.js:177` — invoke `installBenignErrorFilter();` as the first statement inside the `if (canvas) { try { … } }` block, before `app = new GameApp(canvas)`.
- [x] **Step 7**: `test/long-run-api-shim.test.js` — appended 5 new cases (slightly more granular than plan's "3 cases", same surface area):
  1. saveSnapshot mock yields `{ok:true, slotId, bytes}` shape parity
  2. loadSnapshot mock yields `{ok:false, reason:'notFound', reasonText}` when missing
  3. undefined-app shim yields `{ok:false, reason:'notReady'}` (covers the `app?.x?.()` fallback branch)
  4. `installBenignErrorFilter` swallows ResizeObserver-loop event, increments counter, ignores non-matching events, and is idempotent under double-invocation
  5. `loadFromStorage` returns `null` (does not throw) on malformed JSON via stubbed `globalThis.localStorage`

## Tests

- pre-existing failures (4, all confirmed on parent `78b346e` via `git stash` + full run):
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
- pre-existing skips (4, unchanged): unchanged baseline carry
- new tests added: `test/long-run-api-shim.test.js` extended with 5 new cases (12 → 17 subtests in that file, all passing)
- failures resolved during iteration: none — full suite went green-modulo-pre-existing on first run
- baseline delta: parent 1641 pass → head 1646 pass (+5 from new cases); fail/skip counts unchanged at 4/4

## Deviations from plan

- Step 7 expanded from "3 cases" to 5 cases for finer granularity:
  - Plan's case (a) "shim shape parity" was split into 3 separate tests (saveSnapshot success, loadSnapshot failure, undefined-app fallback) — same surface area, easier diagnosis on regression.
  - Plan's case (b) "benign-filter counter" and case (c) "loadFromStorage null on malformed" implemented as written.
- Step 5 used a `globalThis.window` stub in the test rather than dispatching a real `ErrorEvent`, because Node's `ErrorEvent` constructor is environment-dependent and the listener-registration semantics are exactly what we want to assert. Counter behaviour and prevention assertions are equivalent.

## Freeze / Track check 结果

- **Freeze check**: PASS — no new TILE / role / building / mood / mechanic / audio asset / UI panel introduced. Only argument-shape changes + one error-event listener.
- **Track check**: PASS — only edited `src/main.js`, `src/app/snapshotService.js`, `src/app/GameApp.js`, `test/long-run-api-shim.test.js`. No `README.md` / `CHANGELOG.md` / `docs/` / `assignments/` changes.
- **R1 grep verification**: `scripts/soak-browser-operator.mjs:155-156` does `api.saveSnapshot('long-run-operator'); api.loadSnapshot('long-run-operator');` and ignores the return value — no `=== undefined` pattern-match anywhere in `scripts/`. Safe.
- **R3 grep verification**: No test files assert on `JSON.parse` throw from `loadFromStorage`; the 7 test files matching `JSON.parse` use it independently of snapshot storage.

## Handoff to Validator

- **Manual smoke targets** (priority order):
  1. Open `npx vite` → DevTools console → `window.__utopiaLongRun.saveSnapshot('manualtest')` should return `{ok:true, slotId:'manualtest', bytes:<number>}`.
  2. `window.__utopiaLongRun.loadSnapshot('does-not-exist')` should return `{ok:false, reason:'notFound', reasonText:"Snapshot slot 'does-not-exist' not found."}`.
  3. `localStorage.setItem('utopia:snapshot:bad','not-json'); window.__utopiaLongRun.loadSnapshot('bad')` should return `{ok:false, reason:'notFound', …}` (because parse failure → null → notFound path).
  4. `window.dispatchEvent(new ErrorEvent('error',{message:'ResizeObserver loop completed with undelivered notifications.'}))` → DevTools shows nothing; `window.__utopiaBenignSuppressed === 1`.
- **Stability invariant**: Stability harnesses can now distinguish save-success from save-failure via `result?.ok` rather than `result === undefined`. The benign-filter counter (`window.__utopiaBenignSuppressed`) lets harnesses still observe the suppression rate.
- **No FPS regression expected**: One-shot listener registration (capture-phase) + a 4-line conditional. No per-frame work.
- **No sim/balance change**: Touched no system tick, no balance constant, no AI policy. DevIndex / long-horizon bench should be deltaless.
- **prod-build verification deferred to validator**: `npx vite build` + `npx vite preview` smoke is part of the handoff per plan §6.
