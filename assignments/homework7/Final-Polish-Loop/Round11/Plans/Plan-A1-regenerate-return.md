---
reviewer_id: A1-stability-hunter (regenerate() return contract)
feedback_source: assignments/homework7/Final-Polish-Loop/Round11/Feedbacks/A1-stability-hunter.md
round: 11
date: 2026-05-01
build_commit: 652220f
priority: P2
track: code (launcher-runtime API surface — `regenerate()` return contract)
freeze_policy: hard
rollback_anchor: 652220f
estimated_scope:
  files_touched: 2
  loc_delta: ~10
  new_tests: 1
  wall_clock: 20
conflicts_with: []
---

# Plan-A1-regenerate-return — Mirror saveSnapshot's `{ok:true, ...}` Contract on `regenerate()`

**Plan ID:** Plan-A1-regenerate-return
**Source feedback:** `assignments/homework7/Final-Polish-Loop/Round11/Feedbacks/A1-stability-hunter.md` (P2 #1)
**Track:** code (launcher-runtime API surface)
**Priority:** P2 — A1 confirms `regenerate()` *works* in R11 (the splash visibly updates to the requested template / seed; R10's P1 of "second call ignored" is fixed). The remaining quirk is a return-shape inconsistency: `regenerate()` returns `null` while sibling `saveSnapshot()` / `loadSnapshot()` return `{ok:true, ...}` objects. This breaks Playwright / benchmark scripts that want to chain `expect(r.ok).toBe(true)` instead of doing a follow-up `getTelemetry()` round-trip. Pure cosmetic / API hygiene; no game-loop impact, but materially improves harness ergonomics.
**Freeze policy:** hard (no new mechanic, no behaviour change — only the return value of an existing function. Mirrors the established `{ok:true, ...}` contract used by `saveSnapshot` / `loadSnapshot`.)
**Rollback anchor:** `652220f`

---

## 1. Core problem (one paragraph)

`regenerate({template, seed})` on the launcher-runtime currently performs the regeneration side-effect correctly (the splash updates to the requested template / seed — confirmed in A1's session 3 for both `rugged_highlands seed 12345` AND `archipelago_isles seed 7777`) but returns `null` regardless of success. Sibling APIs `saveSnapshot()` returns `{ok:true, slotId:"default", bytes:2507024}` and `loadSnapshot()` returns `{ok:true, slotId:"default", phase:"active"}`. The asymmetric return shape forces Playwright / benchmark scripts that chain regen-then-verify to do a follow-up `getTelemetry()` call to observe what actually got regenerated, and prevents the simple `expect(r.ok).toBe(true)` assertion idiom every other launcher API supports. Fix is ~10 LOC: add a return statement at the end of the existing `regenerate()` function with `{ok:true, templateId, seed, phase:'splash'}` (or whatever the post-regenerate phase is — A1 confirms it drops to splash).

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — full success-shape mirror

```js
// At the end of regenerate(), replace `return null` (or the implicit return) with:
return {
  ok: true,
  templateId: template,            // echo what was requested
  seed,                            // echo what was requested
  phase: state.phase ?? 'splash',  // observed post-regen phase
};
```

On error (template invalid / seed invalid / pre-condition fails), return `{ok:false, reason:'<descriptor>'}` instead of throwing — matches `loadSnapshot`'s convention.

- Files: `src/launcher/runtime.js` (or wherever the LR / launcher-runtime API surface lives — locate via `Grep "regenerate\|saveSnapshot\|loadSnapshot" src/`), 1 small unit test.
- Scope: trivial (~10 LOC + ~20 LOC test).
- Expected gain: closes A1 P2 #1; harness scripts can `expect(r.ok).toBe(true)` instead of round-tripping through `getTelemetry()`.
- Main risk: any caller currently null-checking the return (e.g. `if (regenerate(...) === null)`) will flip from "always-true" to "always-false." Step 1 audits callers.

### Suggestion B (in-freeze, MINIMAL VARIANT) — return only `{ok:true}`

Skip the templateId / seed / phase echoes. Just `return {ok:true}`. Half the LOC, half the harness ergonomic win. Acceptable but suboptimal — A1 specifically requested the full shape.

- Files: 1 file, 1 line
- Scope: trivial
- Expected gain: ~50 % of A1's request

### Suggestion C (in-freeze, COMBINED) — also fix `configure()` / `startRun()` (A1 P2 #2)

A1's P2 #2 is a related quirk: `configure()` / `startRun()` template overrides on a fresh boot are silently ignored (splash defaults win). Same root cause family ("launcher-runtime APIs don't return contract-shaped status"). Could ship the same `{ok, reason}` shape on those too. **Crosses into a behaviour change** for `startRun()` (silent override → return `{ok:false, reason:'splash_already_committed'}`), so it's larger scope. Recommend: ship Suggestion A in this plan; defer P2 #2 to a sibling plan if orchestrator wants to address it in the same round.

- Files: 2-3 files
- Scope: small-medium
- Expected gain: closes A1 P2 #1 + P2 #2 in one PR; risk: P2 #2's behaviour change might break a Playwright fixture that relied on the silent-override behaviour.

### Suggestion D (FREEZE-VIOLATING, flagged, do not ship in R11) — re-architect launcher-runtime API surface for full contract uniformity

Audit all launcher-runtime APIs (saveSnapshot, loadSnapshot, regenerate, configure, startRun, devStressSpawn, getTelemetry, ...) and enforce a single `{ok, ...payload | reason}` shape across all. Catches A1 P2 #1, #2, #3 (devStressSpawn silently culls), #5 (population.byGroup stale post-regenerate), #6 (warnCount no HUD pill). **API redesign + behaviour changes = scope explosion.** Defer to v0.10.2.

## 3. Selected approach

**Suggestion A.** A1 explicitly requested the full shape (`{ok:true, templateId, seed, phase}`), and the cost is tiny. Step 1's caller audit covers the only real risk (existing null-checks). Combined with one small unit test guarding against future regressions.

## 4. Plan steps

- [ ] **Step 1 — Locate `regenerate()` and audit all callers.**
  `Grep "regenerate" src/` and `Grep "regenerate" assignments/` (the latter to catch test fixtures and Playwright scripts). Identify:
  - The function definition site (likely `src/launcher/runtime.js` or `src/main.js` — wherever `lr.regenerate` is exposed).
  - Whether any internal caller does `if (regenerate(...) === null)` or `expect(regenerate(...)).toBeNull()` — those will flip post-fix.
  - The exact post-regenerate `state.phase` value (A1 reports it drops to splash, so likely `'splash'`).
  - Type: read (no edit)

- [ ] **Step 2 — Add the success-shape return.**
  At the end of the `regenerate()` function in (likely) `src/launcher/runtime.js`:
  ```js
  // A1 R11: mirror saveSnapshot/loadSnapshot's {ok:true, ...} contract so harness
  // scripts can expect(r.ok).toBe(true) instead of round-tripping through getTelemetry().
  return {
    ok: true,
    templateId: template,
    seed,
    phase: state.phase ?? 'splash',
  };
  ```
  If the function has any early-return paths for invalid input (template not found, seed NaN), replace those with:
  ```js
  return { ok: false, reason: 'invalid_template' };  // or 'invalid_seed', etc.
  ```
  (matches `loadSnapshot`'s convention).
  - Type: edit
  - depends_on: Step 1

- [ ] **Step 3 — Add a unit test for the contract.**
  Create `test/launcher-regenerate-contract.test.js` (~25 LOC). Test cases:
  1. Valid call: `regenerate({template:'temperate_plains', seed:42})` returns `{ok:true, templateId:'temperate_plains', seed:42, phase:'splash'}`.
  2. Invalid template: `regenerate({template:'nonexistent', seed:42})` returns `{ok:false, reason:'invalid_template'}` (or whatever Step 2 chose).
  3. Chained call: `regenerate({template:'rugged_highlands', seed:12345})` then `regenerate({template:'archipelago_isles', seed:7777})` — second call also returns success-shape (this is the R11-fixed-in-R10's-P1 behaviour A1 confirmed; we're regression-guarding it).
  4. Negative control: returned object is NOT `null`.
  - Type: add (new file)
  - depends_on: Step 2

- [ ] **Step 4 — Update any existing callers that null-checked the return.**
  Per Step 1's audit, replace `if (regenerate(...) === null)` patterns (if any) with `if (!regenerate(...).ok)`. If Step 1 found no such callers (likely — A1's session 3 was the first to surface the contract gap), this step is a no-op.
  - Type: conditional edit
  - depends_on: Step 3

- [ ] **Step 5 — Manual Playwright re-verification (mirrors A1 session 3).**
  ```js
  // From browser console:
  await lr.regenerate({template:'rugged_highlands', seed:12345})
  // Expect: {ok:true, templateId:'rugged_highlands', seed:12345, phase:'splash'}
  await lr.regenerate({template:'archipelago_isles', seed:7777})
  // Expect: {ok:true, templateId:'archipelago_isles', seed:7777, phase:'splash'}
  ```
  Confirm splash visibly shows the requested template / seed (R11's existing behaviour — we're not regressing it).
  - Type: verify
  - depends_on: Step 4

- [ ] **Step 6 — Run the suite.**
  `node --test test/*.test.js`. Baseline 1646 / 1612 / 0 fail / 2 skip. Expect: +1 pass (new contract test). If any pre-existing test asserted `regenerate()` returns `null`, it will flip — relax to assert `.ok === true` instead.
  - Type: verify
  - depends_on: Step 5

- [ ] **Step 7 — CHANGELOG.md entry under unreleased v0.10.1-n.**
  *"A1-stability-hunter P2 #1 — `regenerate()` now returns `{ok:true, templateId, seed, phase}` on success / `{ok:false, reason}` on invalid input, mirroring `saveSnapshot` / `loadSnapshot`. Previously returned `null` despite working, forcing harness scripts to round-trip through `getTelemetry()`."*
  - Type: edit
  - depends_on: Step 6

## 5. Risks

- **Existing null-checking callers.** Mitigated by Step 1 (audit) + Step 4 (update). Highly likely zero callers exist — A1 was the first to test the chained-regenerate path in R11 and would have surfaced any caller behavioural dependency.
- **Phase value choice.** If `state.phase` post-regenerate is something other than `'splash'` (e.g. `'pre-start'` / `'awaiting-config'`), Step 2's literal will be wrong. Step 1 confirms; Step 2 uses the actual value.
- **Error-shape policy.** Returning `{ok:false, reason:'invalid_template'}` instead of throwing is a small behaviour change for invalid input. Per A1's recommendation explicitly mirroring `loadSnapshot`, this is the correct convention. If existing code throws for invalid input, the swap from throw → return makes the error swallow-able — flag for Coder to confirm no caller wraps in `try/catch` expecting a throw.
- **Possible affected tests:** `test/launcher-*.test.js`, `test/playwright-*.test.js`, anything that chains `regenerate()` calls. Per A1's audit, the chained behaviour was just fixed in R11, so prior tests likely don't assert on the return value at all.

## 6. Verification

- **New unit test:** `test/launcher-regenerate-contract.test.js` (Step 3). Asserts return shape matches `{ok, templateId, seed, phase}` on success, `{ok:false, reason}` on invalid input.
- **Manual repro (Playwright):** Step 5 — confirm in browser console that two chained `regenerate()` calls both return success-shape objects (R11 already passes the chained-call behaviour test; this verifies the new return contract).
- **No bench regression expected** (API-surface-only change). Optionally confirm: `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 30 --tick-rate 4` — DevIndex unchanged.

## 7. UNREPRODUCIBLE marker

N/A — A1 reproduced the `null` return in session 3 of R11 across two consecutive `regenerate()` calls. The fix is a one-line return statement; the contract assertion is mechanical.

---

## Acceptance criteria

1. `regenerate({template:'temperate_plains', seed:42})` returns `{ok:true, templateId:'temperate_plains', seed:42, phase:'<actual-phase>'}`.
2. `regenerate({template:'<invalid>', seed:42})` returns `{ok:false, reason:'<descriptor>'}` (does not throw).
3. New unit test `test/launcher-regenerate-contract.test.js` passes.
4. Chained `regenerate()` calls (the R11-already-fixed behaviour) continue to work and both return success-shape.
5. `node --test test/*.test.js` baseline preserved (1646 pass / 0 fail; +1 from new test).
6. Splash visibly updates to the requested template / seed post-call (R11 existing behaviour preserved).
7. No new mechanic, no new HUD element, no behaviour change other than the return value.

## Rollback procedure

```
git checkout 652220f -- <launcher-runtime-file> && rm test/launcher-regenerate-contract.test.js
```

(exact file resolved in Step 1).
