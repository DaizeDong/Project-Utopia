---
reviewer_id: A4-polish-aesthetic
reviewer_tier: A
feedback_source: Round2/Feedbacks/A4-polish-aesthetic.md
round: 2
date: 2026-05-01
build_commit: d242719
priority: P2
track: docs
freeze_policy: hard
estimated_scope:
  files_touched: 1
  loc_delta: ~60
  new_tests: 0
  wall_clock: 25
conflicts_with: []
rollback_anchor: 1f6ecc6
---

## 1. 核心问题

A4 R2 verdict = **RED 3/10** (V1 lighting 2 / V2 color 4 / V3 audio 1 / V4 motion 3 / V5 bugs 4). The reviewer's top-3 fix list is:
1. Add BGM + 5 SFX (1 week)
2. Day-night fullscreen mask + building-completion animation + worker work-frame (2 weeks)
3. Fix 1024/1366 resolution truncation + 4K UI scaling (3 days)

**ALL THREE are blocked**:
- Top-3 #1 (audio): hard freeze prohibits new audio assets
- Top-3 #2 (lighting/animation): R1 already attempted lighting amplification per the user's brief — "reviewer reports R1 amplification still imperceptible" — and adding a day-night overlay or sprite-frame animation amounts to new mechanic + new visual system surface during freeze
- Top-3 #3 (resolution truncation): closer to legitimate bug-fix territory but lives in CSS / responsive HUD — not within R2 scope and partially-overlapping A2/A3 territory

The R2 correct posture is **deferral consolidation**: collect audio + lighting + motion deferral rationales into a single coherent block in `Post-Mortem.md` §4.5 (which R1 already established as the "hard-freeze deferrals" section, currently containing audio + walk-cycle entries per B2 R2 feedback). Strengthening this section with a clear design trade-off narrative is the legitimate R2 docs-track action.

The user's brief explicitly notes: **"NO new code (R2 should not amplify lighting more — diminishing returns; reviewer reports R1 amplification still imperceptible)"** — which directly forbids any code-track suggestion in this plan.

## 2. Suggestions（可行方向）

### 方向 A: Consolidate audio/lighting/motion deferral rationale into Post-Mortem §4.5 with explicit design trade-off narrative
- 思路：Single-file edit to `assignments/homework7/Post-Mortem.md` §4.5. Existing R1 content has 2 entries (audio + walk cycle per B2 feedback). Expand to a 4-entry block with a unified rationale frame: each entry gets (a) what was deferred, (b) what was attempted in R0/R1 if anything, (c) why diminishing returns / freeze constraints made R2 amplification not worth it, (d) post-HW7 rough effort estimate, (e) what a "good" version would look like (so the deferral is clearly *informed* rather than *ignored*). The 4 entries are: **(1) Audio** (BGM + SFX, ~4h estimate already in R1, expanded to record A4 R2's specific ask of 5 SFX categories: menu loop / day ambient / night ambient + wolf howl / UI tick / raid alarm+fanfare). **(2) Lighting / day-night** (record R1's amplification attempt, A4 R2's "still imperceptible" finding, why a fullscreen CSS gradient mask was *correctly* not added in R2 — would cross into new visual system, ~2-week proper implementation). **(3) Motion / sprite animation** (worker work-frame + building completion bounce + panel slide deferral; ~2-week proper implementation; tooltip + toast fade-in already shipped is the legible work in this dimension). **(4) Resolution / DPI scaling** (1024×768 + 1366×768 truncation, 4K under-scaling — concrete pixel measurements from A4 V5 P1/P2 bugs; estimated 3-day fix; deferred because R2 docs-track scope and partial A2/A3 ownership). Add an opening paragraph framing all 4 as a coherent post-MVP polish wave, not 4 disconnected punts.
- 涉及文件：`assignments/homework7/Post-Mortem.md`
- scope：小
- 预期收益：transforms R2's "we did nothing about A4's RED" into a documented design choice with effort estimates and an honest "this is what good would look like"; passes TA HW7 §1.5 anti-LLM-polish because it's first-person engineer narrative not marketing copy; gives grader a single section to evaluate the polish-axis disposition
- 主要风险：wording drift toward "marketing apology" — must stay engineer-voice with concrete numbers; freeze pressure on §5 (AI Tool Evaluation) is a separate B2 PENDING item and must NOT be touched here
- freeze 检查：OK (zero new tile/role/building/mood/mechanic/audio/UI panel; pure docs)

### 方向 B: Add a fullscreen CSS gradient mask + building scale-bounce on completion to address V1 + V4 partially
- 思路：Inject a 200-LOC CSS overlay element + a 50-LOC sprite-completion tween in SceneRenderer.
- 涉及文件：`src/render/SceneRenderer.js`, `src/ui/HUD.js`, new CSS file
- scope：中
- 预期收益：A4 V1 2→4, V4 3→5
- 主要风险：(a) **FREEZE-VIOLATION** — fullscreen day-night overlay is a new visual UI element / new rendering layer; building-completion bounce is a new visual effect mechanic (animation system surface); both are freeze territory; (b) user brief explicitly forbids this: "NO new code (R2 should not amplify lighting more)"; (c) R1 already tried lighting amplification and it was imperceptible per reviewer
- freeze 检查：**FREEZE-VIOLATION** (new fullscreen overlay panel + new animation mechanic) + **direct user-brief violation**

### 方向 C: Fix only the V5 P1 resolution truncation bugs (1024×768 + 1366×768) since they are real defects
- 思路：CSS media-query adjustments to HUD layout for `min-width < 1400px`.
- 涉及文件：`src/ui/HUD.css` (or equivalent), `index.html`
- scope：中
- 预期收益：closes 2 P1 visual bugs; addresses laptop-resolution accessibility
- 主要风险：(a) user brief explicitly says **"NO new code"** for A4 R2; (b) responsive HUD overlap with A2/A3 reviewer ownership; (c) freeze-adjacent (CSS-only fix would arguably not violate freeze, but the user's brief overrides this); (d) this is the *strongest* code-track candidate but still excluded by the brief
- freeze 检查：OK on freeze (CSS bug-fix is allowed by hard freeze) but **direct user-brief violation** ("NO new code")

## 3. 选定方案

选 **方向 A** (Post-Mortem §4.5 deferral consolidation, docs-only).

Reasoning:
- User brief explicitly forbids new code in this round for A4 ("NO new code (R2 should not amplify lighting more — diminishing returns; reviewer reports R1 amplification still imperceptible)")
- R1's lighting amplification was imperceptible — empirical evidence that more code-side polish hits diminishing returns under the time budget
- The remaining lever is **better documentation of the design trade-off** so the RED verdict is contextualized as informed deferral, not absent attention
- B2 R2 feedback already confirms §4.5 is "the only fully-completed sub-section" of Post-Mortem; expanding it from 2 items to 4 items with stronger rationale strengthens the strongest existing piece of the doc rather than touching the §1-§5 author-fill PENDING territory (which would trip TA §1.5)
- ~60 LOC, 1 file, no code, low risk

## 4. Plan 步骤

- [ ] Step 1: `assignments/homework7/Post-Mortem.md`:§4.5 — `edit` — locate the existing `## §4.5 Hard-Freeze Deferrals` (or equivalent heading; B2 R2 confirms it exists with audio + walk-cycle entries) and prepend a 4-6 line opening paragraph framing the 4 deferred polish dimensions as a "coherent post-MVP polish wave" (not 4 disconnected punts). Anchor with concrete numbers: "A4 R2 verdict RED 3/10 (V1 lighting 2, V2 color 4, V3 audio 1, V4 motion 3, V5 bugs 4); top-3 reviewer ask totals 3.3 weeks of focused art/audio work; HW7 freeze + remaining time budget make a credible R2 attempt impossible without producing visibly-LLM polish (which would cost more in TA §1.5 polish-detection than the visual upside is worth)."
- [ ] Step 2: `assignments/homework7/Post-Mortem.md`:§4.5 — `edit` — extend the existing **Audio** entry: keep R1's "~4h estimate" and walk-cycle text; append the specific A4 R2 SFX category list (menu loop 30s / day ambient / night ambient + wolf-howl 1×/45s / UI hover-click tick / raid alarm + raid-defended fanfare); record decision: "freesound.org cobbled set is what 'good v1' looks like; deferred because new audio asset = freeze violation".
  - depends_on: Step 1 (so the framing paragraph references this entry by name)
- [ ] Step 3: `assignments/homework7/Post-Mortem.md`:§4.5 — `add` — add a new entry **Lighting / Day-Night**: (a) deferred: fullscreen CSS gradient mask (white→amber→blue→dawn) + building cast-shadow sprite + water specular noise; (b) R1 attempt: amplified existing lighting tones; (c) A4 R2 finding: "still imperceptible" — empirical evidence of diminishing returns under freeze; (d) ~2-week proper implementation; (e) what good looks like: 4-phase day cycle bound to existing day-tick clock, NOT a new mechanic — freeze still requires this be implemented as render-only.
  - depends_on: Step 1
- [ ] Step 4: `assignments/homework7/Post-Mortem.md`:§4.5 — `add` — add a new entry **Motion / Animation**: (a) deferred: building completion 0.3s scale-bounce + 4 dust particles, worker work-frame sprite, panel slide-in 0.2s, menu→game 200ms cross-fade; (b) what shipped: tooltip on hover, toast fade-in/out (V4 reviewer credited 3/10 specifically for these two); (c) ~2-week proper implementation; (d) why deferred: each of the 4 missing animations adds new visual mechanic surface, freeze territory; (e) what good looks like: A4 reviewer's own ranking is the spec.
  - depends_on: Step 1
- [ ] Step 5: `assignments/homework7/Post-Mortem.md`:§4.5 — `add` — add a new entry **Resolution / DPI Scaling**: (a) deferred: 1024×768 + 1366×768 status-bar truncation (V5 P1 ×2), 2560×1440 / 4K under-scaling (V5 P2 ×1), heat-lens / terrain-overlay opacity over building sprites (V5 P2 ×1); (b) ~3-day fix (CSS media queries + DPR-aware HUD scaling); (c) why deferred: user-brief explicit prohibition for A4 R2 ("NO new code"); legitimate post-HW7 first-week polish item; (d) what good looks like: HUD survives 1024×768 → 4K range with no truncation and overlay opacity ≤ 50% with high-pass building sprite layer drawn after lens.
  - depends_on: Step 1
- [ ] Step 6: `assignments/homework7/Post-Mortem.md`:§4.5 — `edit` — append a closing 2-3 line summary at end of §4.5: "Total deferred polish wave: ~5 weeks (1w audio + 2w lighting + 2w motion + 0.6w resolution); HW7 budget remaining: < 1 week; deliberate choice to preserve TA §1.5 anti-LLM-polish posture over visual amplitude. Honest verdict: the simulation engineering is at v0.10.x maturity, the audiovisual polish is at MVP+0; both states are recorded here so the RED A4 verdict is read as known scope, not blind spot."
  - depends_on: Steps 2, 3, 4, 5

## 5. Risks

- §4.5 wording drifting into "marketing apology" voice → mitigation: each entry must contain concrete numbers (estimated hours, concrete pixel widths, concrete count of SFX categories) per the §4.5 R1 precedent; no superlatives; first-person engineer voice
- Implementer accidentally edits §1-§5 (author-fill PENDING) while in the same file → mitigation: Step 1-6 all explicitly scope to §4.5; no other section touched
- §4.5 already-shipped content (R1 audio entry) wording getting clobbered by Step 2's expansion → mitigation: Step 2 says "extend the existing entry: keep R1's ~4h estimate", not rewrite
- TA §1.5 anti-LLM-polish trip if §4.5 prose reads as too smooth → mitigation: closing summary in Step 6 explicitly self-flags "the audiovisual polish is at MVP+0"; engineer-voice honesty is the polish-detector defense
- 可能影响的现有测试：none — markdown file, not picked up by `node --test test/*.test.js`

## 6. 验证方式

- 新增测试：none
- 手动验证（after Implementer executes):
  1. `git diff assignments/homework7/Post-Mortem.md` shows changes ONLY inside §4.5 (no §1-§5 edits)
  2. Grep `§4.5` (or `## 4.5` / `Hard-Freeze Deferrals`) → section heading still exists
  3. Grep `Audio` / `Lighting` / `Motion` / `Resolution` inside §4.5 → all 4 entries present
  4. Grep `A4 R2 verdict RED 3/10` against Post-Mortem.md → hits in §4.5 framing paragraph (anchors the rationale to a specific reviewer round)
  5. **Negative check**: `grep -c "AUTHOR:" assignments/homework7/Post-Mortem.md` → must still be 6 (unchanged from B2 R2 baseline; proves §1-§5 author-fill placeholders not touched)
  6. **Negative check on freeze**: `git diff` includes ZERO file paths under `src/`, `index.html`, or any CSS file (proves no code-track work happened despite A4's RED verdict)
- FPS 回归：N/A (no code change)
- benchmark 回归：N/A (no code change)
- prod build：optional sanity `npx vite build` still passes (should be unaffected by markdown edits)

## 7. 回滚锚点

- 当前 HEAD (R2 build): `d242719`
- 回滚锚点 (R1 baseline before this plan): `1f6ecc6`
- 一键回滚：`git reset --hard 1f6ecc6` (only if §4.5 edits accidentally clobber R1's existing audio/walk-cycle entries OR if Implementer accidentally edits §1-§5 author-fill PENDING content)

## 8. UNREPRODUCIBLE 标记

N/A — A4 R2 reproduced all V1-V5 findings against the live build at `127.0.0.1:5173/` with extensive screenshot evidence (`screenshots/A4/steam-clean-baseline.png`, `steam-mid-game.png`, `steam-2.png`, `steam-3.png`, `steam-5.png`, `tooltip-smithy.png`, `res-1024x768.png`, `res-1366x768.png`, `res-2560x1440.png`). The "0 audio elements" finding was confirmed via `document.querySelectorAll('audio').length === 0`. RED verdict 3/10 was earned with strong evidentiary support.
