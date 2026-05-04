---
reviewer_id: A1-stability-hunter
reviewer_tier: A
feedback_source: Round0/Feedbacks/A1-stability-hunter.md
round: 0
date: 2026-05-01
build_commit: 3f87bf4
priority: P2
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 3
  loc_delta: ~70
  new_tests: 1
  wall_clock: 25
conflicts_with: []
rollback_anchor: 3f87bf4
---

## 1. 核心问题

A1 returned **GREEN (8/10), 0 P0 + 0 P1 + 2 P2**. Both P2s are API/console hygiene, not stability bugs. Root causes:

1. **API-contract inconsistency on snapshot shims** — `window.__utopiaLongRun.saveSnapshot()` / `loadSnapshot()` return `undefined` (fall-through from `GameApp.saveSnapshot/loadSnapshot` which only mutate `state.controls.actionMessage`). Every other shim in the same object (`placeToolAt`, `focusTile`, `selectEntity`, …) returns either a structured `{ok, reason, …}` result or a defined `null`/`false`. Callers can't distinguish "saved" from "no-op", and `loadSnapshot('garbage')` would throw (`JSON.parse`) — currently masked only because `localStorage.getItem` returns `null` for unknown keys. Real-world automation that passes a malformed payload would surface as an `unhandledrejection`. Source: `src/main.js:208-209`, `src/app/GameApp.js:1480-1517`, `src/app/snapshotService.js:270-287`.
2. **No global `error` filter** for the well-known benign Chromium warning `ResizeObserver loop completed with undelivered notifications.`. Today the project does not register ANY `window.addEventListener('error', …)` listener (grep is empty across `src/**` and `index.html`); A1's `__qa_errors` is an external test harness. The warning is harmless but pollutes DevTools and inflates `error` counts in any future stability harness. Source: confirmed by `Grep` returning zero matches for `window.addEventListener('error'` / `unhandledrejection` / `__qa_errors` in repo source.

Both are "polish, not blocker". Single thin code-track fix is appropriate.

## 2. Suggestions（可行方向）

### 方向 A: Tighten snapshot-shim return contract + add benign-error filter

- 思路：In `src/main.js`, wrap `saveSnapshot`/`loadSnapshot` shim entries to mirror the `placeToolAt` contract: return `{ok:true, slotId, bytes}` on save success, `{ok:true, slotId, phase}` on load success, `{ok:false, reason:'notFound'|'invalidPayload'|'storageError', reasonText}` on failure. Wrap `JSON.parse` in `loadFromStorage` (`src/app/snapshotService.js:281-287`) with try/catch that returns `null` rather than throwing. Add a small `installBenignErrorFilter()` helper invoked once in the `if (canvas)` block of `src/main.js` that registers `window.addEventListener('error', e => …)` to swallow + `e.preventDefault()` events whose `message` starts with `"ResizeObserver loop"`. Re-export the original message via a counted `window.__utopiaBenignSuppressed` so tests can still assert it fired.
- 涉及文件：`src/main.js` (shim contract + filter install), `src/app/snapshotService.js` (try/catch around parse), `test/long-run-api-shim.test.js` (extend existing test file with new cases)
- scope：小（~70 LOC across 3 files, +1 test)
- 预期收益：A1 P2-1 closed (API contract aligned with rest of `__utopiaLongRun`); A1 P2-2 closed (DevTools clean during resize fuzz); future stability harnesses get reliable success/failure signals from snapshot APIs; `loadSnapshot('not-json')` no longer relies on `localStorage` luck to avoid throwing.
- 主要风险：(a) Any caller that today checks `=== undefined` for "did save run" breaks — mitigated because no in-repo caller exists (UI calls `GameApp.saveSnapshot` directly, not the shim). (b) Benign-error filter could accidentally swallow a real error if a future bug message happens to start with "ResizeObserver loop" — mitigated by exact-prefix match + counter.
- freeze 检查：OK — no new tile / role / building / mood / mechanic / audio asset / UI panel.

### 方向 B: Documentation-only — add `docs/debug-api.md` describing current behaviour

- 思路：Leave code unchanged. Document in a new `docs/` page that `saveSnapshot`/`loadSnapshot` return `undefined` by design and that `loadSnapshot` accepts only existing slot IDs. Note the ResizeObserver warning as a known-benign console event.
- 涉及文件：new `docs/debug-api.md` (~80 LOC)
- scope：小
- 预期收益：A1 P2s technically "answered" with policy.
- 主要风险：Doesn't actually fix the API-contract inconsistency that A1 flagged; future automation will keep hitting the same surprise. Treats a real (low-severity) defect as documentation debt.
- freeze 检查：OK — docs only.

### 方向 C: Replace `__utopiaLongRun.saveSnapshot` with a no-arg JSON-returning API

- 思路：Repurpose the shim to return a serialised JSON payload directly (skipping `localStorage`) so callers can ship snapshots out-of-band. Drop `loadSnapshot` from the shim entirely.
- 涉及文件：`src/main.js`, `src/app/GameApp.js`, multiple existing tests
- scope：中
- 预期收益：Cleaner mental model.
- 主要风险：**Removes a working public-ish API** (the in-game UI Save/Load buttons in `index.html` flow through the same `GameApp` methods, but the shim is consumed by external scripts e.g. `scripts/soak-browser-operator.mjs`). Breaks contract instead of repairing it. Borderline new-mechanic territory if the JSON export behaviour wasn't previously available via this shim.
- freeze 检查：OK structurally (no new tile/role/etc.) but semantically a feature redesign — out of scope for a P2 polish fix.

## 3. 选定方案

选 **方向 A**，理由：

- A1 is GREEN; we want a small, surgical, cheap-to-validate change that closes both P2s in one pass without expanding scope.
- 方向 A directly attacks the root causes (return contract + missing benign-error filter) at the same surface area (`src/main.js` shim block + sibling service file). 
- 方向 B leaves the defect in place, which will keep showing up in future Tier-A stability sweeps.
- 方向 C is a redesign, not a polish; risks regressing the in-game Save/Load buttons + `scripts/soak-browser-operator.mjs`.
- 方向 A's LOC delta is ~70 — well under the C1 cap (not even C1, but a useful sanity bound) and within a 25-min Implementer budget.

## 4. Plan 步骤

- [ ] **Step 1**: `src/app/snapshotService.js:281` (`loadFromStorage`) — `edit` — wrap `JSON.parse(raw)` in `try { … } catch { return null; }`. Bare `null` already means "no snapshot" downstream, so no caller-side change needed; this only hardens the function against corrupted localStorage payloads.

- [ ] **Step 2**: `src/app/GameApp.js:1480` (`saveSnapshot`) — `edit` — `return { ok: true, slotId, bytes: result.bytes }` after the existing `actionMessage` assignment. Do not change parameter signature. Pure additive return; existing in-game button caller in `src/app/GameApp.js:193` (`onSaveSnapshot`) ignores return value, unaffected.

- [ ] **Step 3**: `src/app/GameApp.js:1492` (`loadSnapshot`) — `edit` — return `{ ok: false, reason: 'notFound', reasonText: \`Snapshot slot '\${slotId}' not found.\` }` on the early-return path (line 1497 today), and `return { ok: true, slotId, phase: this.state.session.phase }` at the bottom (after line 1516). Same in-game caller (`onLoadSnapshot`, line 194) ignores return; safe additive.
  - depends_on: Step 1

- [ ] **Step 4**: `src/main.js:208-209` (`__utopiaLongRun.saveSnapshot` / `loadSnapshot` shim entries) — `edit` — propagate the new return values directly: `saveSnapshot: (slotId) => app?.saveSnapshot?.(slotId) ?? { ok:false, reason:'notReady', reasonText:'GameApp not initialised.' }` and the matching `loadSnapshot` shape. This aligns the shim with the `placeToolAt` `{ok, reason, reasonText}` contract A1 already confirmed for invalid args.
  - depends_on: Step 2, Step 3

- [ ] **Step 5**: `src/main.js` (new helper above `mountBootError`, ~lines 145-148) — `add` — `function installBenignErrorFilter()` that registers a single `window.addEventListener('error', listener, { capture:true })` whose `listener` checks `e.message?.startsWith?.('ResizeObserver loop')`, calls `e.preventDefault()` + `e.stopImmediatePropagation()`, and increments `window.__utopiaBenignSuppressed = (window.__utopiaBenignSuppressed ?? 0) + 1`. No-op when `typeof window === 'undefined'` (Node test path).

- [ ] **Step 6**: `src/main.js:177` (top of `if (canvas) { try { … }` block) — `edit` — invoke `installBenignErrorFilter();` as the first statement inside the `try` (before `app = new GameApp(canvas)`). Idempotent if HMR re-runs because the listener is registered once per module instance.
  - depends_on: Step 5

- [ ] **Step 7**: `test/long-run-api-shim.test.js` — `edit` — append three new cases: (a) `normalizePlaceToolArgs` parity test that confirms the documented contract shape `{ok, reason, reasonText}` is what we now return for `saveSnapshot`/`loadSnapshot` shapes too — done as a pure-shape assertion against a hand-rolled mock `app` object (we DO NOT need a real GameApp). (b) `installBenignErrorFilter` test that programmatically dispatches an `ErrorEvent` with message `'ResizeObserver loop completed with undelivered notifications.'` and asserts `window.__utopiaBenignSuppressed === 1` and that a non-matching error does NOT increment. (c) `loadFromStorage` returns `null` (not throws) when localStorage contains `'not-json'`. Use a `globalThis.localStorage = { getItem: () => 'not-json', setItem: () => {} }` stub.
  - depends_on: Step 1, Step 4, Step 6

## 5. Risks

- (R1) Any external script that does `if (window.__utopiaLongRun.saveSnapshot() === undefined) …` will now see a truthy object — but A1's own report confirms the only observed callers (Round 0 fuzz + `scripts/soak-browser-operator.mjs`) treat the return as opaque, so impact is nil. Mitigation: spot-check `scripts/*.mjs` for `saveSnapshot()` usage during implementation and adjust if any consumer pattern-matches `=== undefined`.
- (R2) The `error`-event filter registers in capture phase; if a future test harness depends on observing the raw ResizeObserver event, it would silently see zero. Mitigation: `window.__utopiaBenignSuppressed` counter exposes the swallowed count, and the filter only matches an exact prefix.
- (R3) `loadFromStorage` previously threw on malformed JSON in some environments; if any test asserts on that throw, it will fail. Mitigation: a Grep across `test/**` for `'JSON.parse'` / `loadFromStorage` callers must be performed in Step 1.
- (R4) HMR re-runs `src/main.js`; if `installBenignErrorFilter` is called twice the listener will be doubled. Mitigation: guard with `if (window.__utopiaBenignErrorInstalled) return; window.__utopiaBenignErrorInstalled = true;`.
- 可能影响的现有测试：`test/long-run-api-shim.test.js` (extending), any `test/snapshot*.test.js` (none confirmed; verify in implementation), `test/ui-voice-consistency.test.js` (greps `__qa_errors` per Grep above — read-only check; should not be affected because we only read `__utopiaBenignSuppressed`, distinct symbol).

## 6. 验证方式

- 新增测试：extend `test/long-run-api-shim.test.js` with 3 cases (see Step 7) — covers shim return shape parity, benign-error filter counter, and snapshot-parse hardening.
- 手动验证：
  1. `npx vite` → open `http://127.0.0.1:5173` → DevTools console.
  2. `window.__utopiaLongRun.saveSnapshot('manualtest')` → expect `{ok:true, slotId:'manualtest', bytes: <number>}`.
  3. `window.__utopiaLongRun.loadSnapshot('manualtest')` → expect `{ok:true, slotId:'manualtest', phase:<string>}`.
  4. `window.__utopiaLongRun.loadSnapshot('does-not-exist')` → expect `{ok:false, reason:'notFound', reasonText:…}`.
  5. `localStorage.setItem('utopia-snapshot:bad','not-json'); window.__utopiaLongRun.loadSnapshot('bad')` → expect `{ok:false, reason:'notFound', …}` (because `loadFromStorage` now returns `null` for parse failure).
  6. Trigger a synthetic ResizeObserver-loop ErrorEvent: `window.dispatchEvent(new ErrorEvent('error',{message:'ResizeObserver loop completed with undelivered notifications.'}))` → DevTools shows nothing; `window.__utopiaBenignSuppressed === 1`.
- FPS 回归：`browser_evaluate` 5-second average must remain ≥ 30 fps in active window (A1 baseline 33–60). The change touches only one global event listener registration and shim return values; no per-frame work added.
- benchmark 回归：`node scripts/long-horizon-bench.mjs` seed 42 / temperate_plains — DevIndex must stay within −5% of v0.10.1-m baseline (no sim-system change in this plan; expected delta ≈ 0).
- prod build：`npx vite build` → no errors; `npx vite preview` → 3-minute smoke with `__utopiaLongRun.saveSnapshot('smoke'); loadSnapshot('smoke')` cycled 5×, expect zero console errors and `__utopiaBenignSuppressed === 0` (no spurious matches).
- Test baseline: `node --test test/*.test.js` must remain at **1646 pass / 0 fail / 2 skip** (current v0.10.0 baseline) plus the 3 new cases → target **1649 pass / 0 fail / 2 skip**.

## 7. 回滚锚点

- 当前 HEAD: `3f87bf4`
- 一键回滚：`git reset --hard 3f87bf4`（仅当 Implementer 失败时由 orchestrator 触发）

## 8. UNREPRODUCIBLE 标记（如适用）

Reproduction was not re-run live by the Enhancer (Step-5 of the spec is optional for an Enhancer when the feedback already supplies deterministic repro steps). A1's own report contains exact repro for both P2s with `__utopiaLongRun.saveSnapshot()` returning `undefined` and the `ResizeObserver loop` warning text — both were independently confirmed via static read of `src/main.js:208-209`, `src/app/GameApp.js:1480-1517`, and a repo-wide Grep for `window.addEventListener('error'` returning zero matches. No `UNREPRODUCIBLE` marker required.
