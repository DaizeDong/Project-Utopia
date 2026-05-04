---
reviewer_id: A7-rationality-audit
round: 2
date: 2026-05-01
verdict: YELLOW
score: 5
dead_design_count: 6
unclear_label_count: 14
no_effect_setting_count: 3
hidden_state_issues: 5
cause_effect_breaks: 4
---

## 一句话定性

A solid colony-sim core wrapped in a UI that **leaks engineering vocabulary, hides core scales (mood/morale/threat units), and lets stale cause/effect chains fire** — a player can play 5 minutes and still not be sure what "Director", "Threat 41%", "Mood 0.40", "Hungry / FARM", or even the disabled Farm button mean.

---

## R1 残留死设计

| 位置 | 表现 | 是该删 / 是该实现 / 是该解释 |
|---|---|---|
| `T` overlay cycle (terrain) | Help says T cycles fertility/elev/conn/nodes; pressing T 4 times keeps overlay label = "Fertility overlay ON". I never observed elev/conn/nodes in 6 presses. (`A7/12-15-terrain*.png`) | **修：要么实现循环要么删除其它三个名字**。当前是部分实现的死代码暴露给玩家。 |
| 4 of 6 in-world `pressure-label` chevrons | DOM has 6 chevron labels (`▾`); only `west lumber route` and `east ruined depot ×2` carry text. Other 4 render as bare `▾` floating on the map (`A7/26-empty-labels.png`, evaluator dump confirms 4 empty `.pressure-label` nodes). | **删空字符串渲染**或者填出真实标签。空 chevron 是渲染漏洞。 |
| Splash "Best Runs" board | All 10 entries show `seed 1337 · loss` — saved-runs widget exists but every recorded run has the same seed and outcome, including duplicate scores 171/172. Looks debug-leak, not player history. (`A7/01-splash.png`) | **解释或修**：要么标注 "demo data"，要么真正写入玩家的多 seed 结果。当前给玩家一个错觉 "我已经玩过 10 次"。 |
| Build-tool `Bridge` / `Quarry` / `Herbs` / `Smithy` / `Kitchen` buttons in opening 5 min | Permanently disabled with `⚠`; tooltips reveal cost gating (`Wall (5) — block saboteurs, cost: 2 stone. Ring the colony when Threat > 30…`) but the UI never tells you "you don't have a stone deposit / a Herb Garden / a Lumber yet". (`A7/19-farm-disabled.png`, `A7/20-wall-tooltip.png`) | **解释**：把 "needs Lumber Camp" / "needs Herb Garden" 直接写在按钮上而不是要 hover。 |
| `Other` filter chip in Entity Focus | Showed `Other 1` then I clicked → became `Other 0 (no other entities now)` instantly. Never clear what "Other" means; hover gives no tooltip. (`A7/21-other-filter.png`) | **解释或删**：未定义类别等于死按钮。 |
| `AI Log` "model=deepseek-v4-flash" string | When `Autopilot OFF (LLM calls disabled)`, side-panel still proudly shows `proxy=unknown model=deepseek-v4-flash` — exposes engineering data when the feature is OFF. (`A7/10-ailog.png`) | **删或隐藏**：LLM disabled 时不应宣传模型名。 |

---

## R2 表述不清

| label / 数字 | 当前显示 | 缺什么 | 建议 |
|---|---|---|---|
| Top-bar resources: `317 ▼`, `34 ·`, `15 ·`, `0 ·` | What is `▼` vs `·`? `▼` apparently = decreasing trend, `·` = neutral, but no `▲`. No legend. | unit + legend | Add hover tooltip: `▼ falling -33/min`, etc. |
| Colony "STABLE" badge w/ `Threat: 41%` | Threat is shown as a percentage; Wall tooltip says `Ring the colony when Threat > 30`. Are these the same units (%)? `30` looks like an absolute. | unit consistency | Either both `%` or both raw; pick one. |
| Worker row label `Hungry / FARM · Wander · hungry` | Slash means…? Two states stacked? Why "Hungry / FARM" + "hungry" suffix? | grammar + redundancy | Collapse to `FARM (hungry, wandering)` or columnar. |
| `Day 1` (Colony panel) | "Day" length not stated. Help dialog never gives day length. | absolute scale | Add `Day 1 (90s/day)` once. |
| `Mood: 0.40 · Morale: 0.60 · Social: 0.33 · Rest: 0.29` | Four hidden floats `0–1`. No threshold, no color, no "danger below". (`A7/17-character.png`) | thresholds, units | At minimum colour-tint + tooltip: `Rest 0.29 (low — worker will collapse below 0.15)`. |
| `Hunger: Hungry (41% fed)` | Is 0% = dead? 100% = full? Reading is "Hungry at 41% fed" — paradox: a 41%-fed worker is "Hungry" but the threshold isn't stated. | thresholds | Spell out: "<60% fed = Hungry, <30% = Critical". |
| `Attack CD: 0.00` on a Farmer | Cooldown? Cooldown of what? Workers don't manually attack. (`A7/16-inspector.png`) | irrelevant field | Hide on non-combat roles, or show only when CD>0. |
| Population `FARM 7 · WOOD 5 · STONE 0 · COOK 0 · SMITH 0 · HERBALIST 0 · HAUL 0` | Roles look mutually-exclusive (sum=12), but `Settings → Role Quotas` lets you set each to 8 simultaneously. So `Cook: 8` slider but 0 cooks? | quota meaning unclear | Label sliders "max %" or "target ratio", not a flat 8. |
| Topbar metrics `routes 0/1 depots 0/1 warehouses 0/2 farms 0/6 lumber 0/3 walls 0/8` | The denominators (`/1`, `/6`, `/8`) are soft goals from the briefing but never named. Player thinks they're hard caps. | denominator definition | "0 of 6 recommended" or move to side panel. |
| Score banner `Run 00:03:13 Score 183 Dev 25/100 — Scrappy outpost…` | Score is rising mid-run, but splash said scoring requires loss. Are points awarded continuously or only on death? | timing | Either label "running score" or hide until run ends. |
| Director Timeline shows `Decisions 4` next to Strategic Director, but list has 8 entries | "Decisions 4, last 45.1s" is the rate; list shows 8 decisions. (`A7/10-ailog.png`) | clear divider | Label list as "history" with N items, "rate" as separate line. |
| WHISPER / DIRECTOR / DRIFT badges | Help dialog defines them but **no badge was visible** during 5 min of play — the strip never showed any voice. | implementation gap | Either show a badge or remove the help text. |
| `Idle 8` filter | Workers wander indefinitely as "Idle" because no warehouse exists. Player has no way to tell whether "Idle" = system-blocked vs lazy worker. | distinguish causes | Inline reason: "Idle (blocked: no warehouse)". |
| Splash overlay `1-12 tools` vs Help `1-9 / - / =` | Both refer to the same 12 hotkeys; one writes "1-12", the other writes "1-9 / - / =". (`A7/01-splash.png`, `A7/02-howtoplay-controls.png`) | consistency | Pick one notation. |

---

## R3 效果不明的设置

| 设置项 | 测试方法 | 是否有可见差异 |
|---|---|---|
| `Heat (L)` lens | Toggled on/off in fresh map. Caption "red = surplus, blue = starved". With 0 buildings, **no heat tiles exist**, lens is blank. (`A7/11-heat.png`) | NO observable effect first 5 min — explain that lens is a no-op without buildings. |
| `Terrain (T)` overlay | Pressed T four times. Label always reads `Fertility overlay ON`. Tile colours shift very slightly between presses but never change category. | Cycle apparently broken (see R1). |
| `Target Farmer Ratio: 50%` slider | Moved slider; no immediate change in role distribution (still FARM 7 / WOOD 5). Slider tooltip absent. (`A7/09-rolequotas.png`) | Effect, if any, only manifests on next role re-shuffle — needs visual feedback (`+1 farmer queued`). |
| `Role Quotas` sliders all default to 8 | Sliders for Cook/Smith/Herbalist/Haul/Stone/Herbs all at 8, but those roles have 0 workers. So changing the slider changes nothing visible until very late game. | Default mis-leading; either lock until prerequisite building exists or show "(no Cook role active yet)". |
| `Pause` button (⏸) | Clicked once. Score banner timer froze, but bottom right `4:51` clock kept ticking visually. Pause UI gives weak feedback (no overlay, no big "PAUSED"). (`A7/24-paused.png`) | YES it pauses, NO obvious indicator — fix with overlay text. |

---

## R4 隐藏状态

1. **Mood / Morale / Social / Rest (0–1 floats)** — 4 internal worker affects with no thresholds, no UI elsewhere, no cause displayed for low values. Player cannot answer "why is Rest 0.29?".
2. **Threat scale** — Colony panel says "Threat 41%", but Wall tooltip says "Threat > 30". Threshold logic is opaque; raid trigger is not surfaced.
3. **Director cooldown** — "Decisions 4, last 45.1s" — what's the cycle? Why does the colony only re-plan every 45s? Player has no decision-clock.
4. **Auto-build queue** — Inspector says `Auto-build queued: lumber, road` for a worker, even though Autopilot is **OFF**. So there's a hidden auto-build pipeline running in manual mode. (`A7/16-inspector.png`)
5. **Visitor hunger** — Saboteurs (Kade-14, Ash-16) become `Hungry / (saboteur) Seek Food` and **eat colony food**. Where does this food go? Inventory tracker doesn't account for it. The threat economy is invisible.

---

## R5 cause-effect 断裂

1. **Bear-20 died (killed-by-worker)** toast (`A7/26-empty-labels.png`) — the camera does not pan, the worker that killed it isn't named, and there's no visible combat log entry. A player browsing the panel will see Combat 1 → 0 silently.
2. **Pressure label `east ruined depot ×3`** — count rises ("×2", "×3") with no event toast explaining why. Looks like enemy occupation but the chevron never expands an explanation.
3. **`Farm` button still selectable while disabled** (`A7/22-key2-farm.png`) — pressing hotkey `2` activates the Farm tool even though wood = 0. The first click then silently fails with `X Insufficient resources` in the side panel only, not on-screen near the cursor.
4. **Visitors marked "Blocked"** in Entity Focus — same word as worker pathing failures. A "Blocked / (trader)" visitor is just wandering the map; it isn't actually blocked. The shared label collapses two completely different states.

---

## R6 视觉 / 文字 / 音频不匹配

- `Autopilot OFF · manual; builders/director idle` topbar phrase **always** shows even when no director/builder system exists yet for that role. After autopilot ON: `Autopilot ON · fallback/llm` — `fallback/llm` reads like an internal toggle name leaking into player UI.
- Topbar warning `⚠` icon (5 instances in DOM) has no hover state with explanation; it's just decorative ambient anxiety.
- `west lumber route ▾` chevron suggests it expands on click; clicking it does not visibly expand anything (no panel opens).

---

## R7 教程与首次体验断点

- **Tutorial promises "click a worker to inspect"** — works, but inspector fields use vocabulary (Mood, Morale, Intent, Auto-build queued, Attack CD) that the tutorial never introduces.
- **Help → "WHISPER / DIRECTOR / DRIFT badges"** — these badges were never observed in 5 minutes of play. Tutorial teaches a UI element that doesn't show up.
- **First-build pacing** — Help says start with Farm + Lumber + Warehouse, but Farm is **immediately disabled** because the player needs ≥5 wood and the player starts with 34 wood (was OK initially) yet the tutorial does not warn that hauling distance to forest uses up all wood before a farm can be paid for.
- **No coachmark for `Try Again` / `New Map`** — referenced in toast "Run started: Temperate Plains (96x72 tiles). Build the starter network now. Try Again replays this layout; New Map rerolls." but neither button is visible during the run.

---

## R8 默认状态合理性

- **Default seed 1337 reused for every saved run** in Best Runs board — looks like a debug seed escaped to production.
- **Default sliders Cook/Smith/Herbalist/Haul/Stone/Herbs = 8** while colony has 0 of each — defaults make sense only after Phase 2 buildings exist; should default to 0 + unlock as buildings are placed.
- **Default Heat-Lens off** — fine, but `L` discoverability is low because the lens is blank without buildings.
- **Default Pause = OFF** while opening briefing modal is shown? Briefing closes on Start Colony so timer ticks instantly; new players who linger on the splash UI will be okay, but those who Start then read further lose 30–45s of food.

---

## 自行扩展角度

### 角度 1 — 工程词汇泄漏到玩家界面
`fallback/llm`, `proxy=unknown`, `model=deepseek-v4-flash`, `coverage=fallback mode=fallback`, `Decision: env=steady state | saboteurs:strike a soft frontier corridor` — these are debug strings, not narrative. They should either be hidden behind a "developer panel" toggle (since debug mode flag exists) or rewritten into player language. Currently the AI Log panel's first 4 lines are pure infrastructure metadata.

### 角度 2 — 同字异义（"Director" / "Blocked" / "Hungry"）
- "Director" = (a) fallback rule-based controller, (b) Strategic Director sub-system, (c) Environment Director sub-system, (d) splash phrase "builders/director idle". Four meanings.
- "Blocked" = (a) worker can't reach target, (b) visitor wanders into Blocked filter even though it's not blocked, (c) animal regroup state.
- "Hungry" filter chip mixes workers, visitors, predators (Bear-20). A Bear in the Hungry filter feels like a categorisation bug.

### 角度 3 — 前后矛盾的进度反馈
Best Runs: `Score 182 · Dev 21 · 3:12 survived` is the recorded high; current run banner shows `Score 183 Dev 25/100` at 3:13 — implying the in-progress run is *already* the new record before the run ends. That clashes with splash "loss" suffix on every recorded entry.

---

## 改进优先级清单

### P0（玩家会困惑到无法继续）

1. **Disabled Build-tool buttons** — show the *actual* missing prerequisite on the button face, not in hover tooltip. (Farm, Wall, Quarry, etc.)
2. **`Mood / Morale / Social / Rest = 0–1 floats with no threshold**` — at minimum, color-code low values; ideally add `(low)` `(critical)` qualifiers.
3. **`T` overlay cycle is broken (or label never updates)** — fix the cycle or remove elev/conn/nodes from help text.
4. **Empty `pressure-label` chevrons rendering on the map** — 4 of 6 are blank `▾` floating in space; renderer bug.
5. **Threat unit consistency** — pick `%` or raw and use it everywhere (Wall tooltip, Colony panel, raid trigger).

### P1（明显的合理性破洞）

6. **`Hungry / FARM · Wander · hungry` worker rows** — collapse the redundant "hungry × 2" and clarify slash semantics.
7. **AI-Log infra strings** — hide `model=`, `proxy=`, `coverage=fallback mode=fallback` when LLM disabled.
8. **`Other` filter chip** — define what "Other" is or remove.
9. **Best Runs all share seed 1337** — likely demo data; either flag as such or wipe on first real run.
10. **Score rising mid-run** — clarify "current score (live)" vs "final score (on loss)".
11. **Visitor "Blocked / (trader)" label** — split worker-Blocked from visitor-Wandering.
12. **Pause feedback** — add a big "PAUSED" overlay or screen tint.
13. **Director vocabulary** — rename one of the three "Director" sub-systems so the splash phrase, AI Log, and Help don't conflict.
14. **`Auto-build queued: lumber, road` while Autopilot OFF** — either disable the queue in manual mode or rename to "Suggested next builds".

### P2（细节）

15. Hotkey notation: pick `1-12` *or* `1-9/-/=` everywhere.
16. Recruitment / `Try Again` button visibility during run.
17. `Attack CD` field hidden on non-combat roles.
18. Splash chevron expanders (`west lumber route ▾`) should actually expand.
19. Tutorial "WHISPER / DIRECTOR / DRIFT" — match real visible badges or drop section.
20. Topbar `⚠` icons need hover explanations.

---

## 结论

Project Utopia is a deep simulation that **trusts the player to read engineering output**. The core systems (worker AI, threat economy, Heat Lens) are technically rich, but the UI exposes ~14 unlabeled scales and ~6 dead/contradictory elements that block a normal player from forming a coherent mental model in the first 5 minutes. None of the breakages are run-stopping, so this is a strong **YELLOW**: the game *can* be played, but the rationality bar for "30-min explainability" is not yet cleared. Highest leverage fixes are the disabled-button reasons, the 0–1 hidden affects, and pruning engineering vocabulary from the AI Log.
