---
reviewer_id: Plan-R13-sanity-toast-dedup (R13 sanity follow-up #1)
feedback_source: assignments/homework7/Final-Polish-Loop/Round13/Feedbacks/summary.md
round: 13
date: 2026-05-01
build_commit: 527f460
priority: P2
track: code (sanity — guard new R13 toasts against spam)
freeze_policy: hard
rollback_anchor: 527f460
estimated_scope:
  files_touched: 1
  loc_delta: ~25
  new_tests: 1
  wall_clock: 20
conflicts_with: [Plan-R13-event-mitigation, Plan-R13-fog-aware-build]
---

# Plan-R13-sanity-toast-dedup — Centralize dedup keys for new R13 toasts (event-mitigation, fog-aware-build) so warnings don't spam

**Plan ID:** Plan-R13-sanity-toast-dedup
**Source feedback:** R13 sanity follow-up — three R13 plans (event-mitigation, fog-aware-build, A1-P2-cleanup) each introduce new toast emitters. To prevent toast spam (a recurring problem from earlier rounds — see v0.8.7 Tier 1 SceneRenderer `_lastToastTextMap` cap), centralize their dedup-key conventions and add a regression test.
**Track:** code
**Priority:** **P2** — quality polish, not a blocker; closes a likely future regression vector.
**Freeze policy:** hard — pure dedup contract enforcement, no new toast types.
**Rollback anchor:** `527f460`
**Conflicts with:** the three R13 plans listed above (this plan post-merges their toast-emit sites). Apply this plan AFTER those three land.

---

## 1. Core problem (one paragraph)

Three new R13 plans each emit toasts: `Plan-R13-event-mitigation` ("Bandit raid incoming in 30s"), `Plan-R13-fog-aware-build` ("Send a worker to scout"), `Plan-R13-A1-P2-cleanup` (deprecation warning). Each plan independently picks its own dedup key. Without a centralized convention, two raids 5s apart could double-fire warnings; the scout-needed toast could repeat every tick if the proposer keeps re-evaluating. The fix: consolidate their dedup keys + min-repeat-interval into a single helper `pushToastWithCooldown(state, text, kind, { dedupKey, cooldownSec })` and route the three R13 toasts through it.

## 2. Suggestions (≥2)

### Suggestion A (RECOMMENDED, in-freeze) — small `pushToastWithCooldown` helper + apply to 3 R13 sites

Add helper to existing `src/app/warnings.js` (or wherever `pushToast` / `pushWarning` lives):
```js
export function pushToastWithCooldown(state, text, kind, { dedupKey, cooldownSec = 30 } = {}) {
  if (!dedupKey) return pushToast(state, text, kind);
  state.__toastCooldowns ??= new Map();
  const now = state.metrics?.timeSec ?? 0;
  const last = state.__toastCooldowns.get(dedupKey) ?? -Infinity;
  if (now - last < cooldownSec) return; // still in cooldown
  state.__toastCooldowns.set(dedupKey, now);
  pushToast(state, text, kind);
}
```
Then in the three R13 plans' implementation step, route through `pushToastWithCooldown`.

- Files: `src/app/warnings.js` (or equivalent), 3 R13 implementation files (already touched by other plans).
- Scope: ~15 LOC helper + ~10 LOC test.
- Expected gain: prevents toast spam from R13 features.
- Main risk: if `state.__toastCooldowns` Map grows unbounded over a long run, memory leak. Cap to last 64 entries (LRU).

### Suggestion B (in-freeze) — let each plan own its dedup independently

Status quo. Skip — risks duplication and inconsistency.

### Suggestion C (FREEZE-VIOLATING) — full toast subsystem rewrite

Out of scope.

## 3. Selected approach

**Suggestion A** — small helper, LRU-capped, applied to the three known R13 toast sites.

## 4. Plan steps

- [ ] **Step 1 — Locate `pushToast` / `pushWarning` definition.**
  Grep `src/app/warnings.js` first; otherwise search `pushToast` exports.
  - Type: read

- [ ] **Step 2 — Add `pushToastWithCooldown` helper with LRU cap.**
  ```js
  const TOAST_COOLDOWN_LRU_CAP = 64;
  export function pushToastWithCooldown(state, text, kind, { dedupKey, cooldownSec = 30 } = {}) {
    if (!dedupKey) return pushToast(state, text, kind);
    state.__toastCooldowns ??= new Map();
    const now = state.metrics?.timeSec ?? 0;
    const last = state.__toastCooldowns.get(dedupKey) ?? -Infinity;
    if (now - last < cooldownSec) return;
    if (state.__toastCooldowns.size >= TOAST_COOLDOWN_LRU_CAP) {
      // delete oldest entry (Map preserves insertion order)
      const oldestKey = state.__toastCooldowns.keys().next().value;
      state.__toastCooldowns.delete(oldestKey);
    }
    state.__toastCooldowns.set(dedupKey, now);
    pushToast(state, text, kind);
  }
  ```
  - Type: add
  - depends_on: Step 1

- [ ] **Step 3 — Patch event-mitigation toast site (Plan-R13-event-mitigation Step 3).**
  Replace direct `pushToast(state, "Bandit raid incoming in 30s — build walls or draft guards", "warning", { dedupKey: ... })` with `pushToastWithCooldown(state, ..., { dedupKey: "raid-warning-${event.id}", cooldownSec: 60 })`.
  - Type: edit
  - depends_on: Step 2

- [ ] **Step 4 — Patch fog-aware-build scout-needed toast (Plan-R13-fog-aware-build Step 5).**
  Replace with `pushToastWithCooldown(state, "Send a worker to scout — no buildable visible terrain", "warning", { dedupKey: "scout-needed", cooldownSec: 90 })`.
  - Type: edit
  - depends_on: Step 3

- [ ] **Step 5 — Patch A1-P2 deprecation warning site.**
  Replace with `pushToastWithCooldown(state, "configureLongRunMode/startRun: 'template' key is deprecated, use 'templateId'", "warning", { dedupKey: "deprecated-template-key", cooldownSec: 9999 })` (effectively once-per-session).
  - Type: edit
  - depends_on: Step 4

- [ ] **Step 6 — Unit test `test/toast-cooldown.test.js` (~25 LOC).**
  Test cases:
  1. Same dedupKey within cooldown → second call no-op.
  2. Same dedupKey after cooldown expires → second toast emits.
  3. No dedupKey → behaves like plain pushToast (no cooldown applied).
  4. >64 unique dedupKeys → oldest evicted (LRU).
  - Type: add
  - depends_on: Step 5

- [ ] **Step 7 — CHANGELOG.md entry.**
  *"R13 sanity Plan-R13-sanity-toast-dedup (P2): pushToastWithCooldown helper centralizes dedupKey + cooldownSec for R13 event-mitigation, fog-scout, and template-deprecation toasts. LRU-capped at 64 entries."*
  - Type: edit
  - depends_on: Step 6

## 5. Risks

- **Conflicts with the 3 R13 plans listed in frontmatter.** Apply this plan AFTER those land so the patch sites exist.
- **Map grows unbounded** mitigated by LRU cap.
- **Possible affected tests:** `test/warnings*.test.js`, `test/push-toast*.test.js`, `test/event-mitigation*.test.js`, `test/build-advisor-fog-gate*.test.js`.

## 6. Verification

- **New unit test:** `test/toast-cooldown.test.js`.
- **Manual:** trigger 3 raids back-to-back → first warning toast fires, second + third within 60s suppressed.
- **No bench regression** — pure UI concern.

## 7. UNREPRODUCIBLE marker

N/A — preventive sanity follow-up.

---

## Acceptance criteria

1. New `pushToastWithCooldown` helper exported from warnings module.
2. Three R13 toast sites route through it.
3. LRU cap prevents unbounded memory growth.
4. Test baseline 1646 / 0 fail / 2 skip preserved + new test passes.
5. CHANGELOG.md updated.

## Rollback procedure

```
git checkout 527f460 -- src/app/warnings.js && rm test/toast-cooldown.test.js
```
