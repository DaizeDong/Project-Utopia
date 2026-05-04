---
reviewer_id: A7-rationality-audit
round: 3
date: 2026-05-01
verdict: YELLOW
score: 5
dead_design_count: 3
unclear_label_count: 9
no_effect_setting_count: 2
hidden_state_issues: 4
cause_effect_breaks: 3
---

## 一句话定性

Build is functionally rich and the AI Log/Colony panels expose impressive transparency, but a swarm of small label/unit/keybinding inconsistencies — plus a clearly visible "supply surplus" heat over a starving colony — undermines the player's ability to form a coherent mental model in the first 30 minutes.

## R1 残留死设计

| 位置 | 表现 | 是该删 / 是该实现 / 是该解释 |
|---|---|---|
| Settings → Display & Graphics → "Anti-Aliasing" combobox | Options are literally "Auto", "On next start", "Off next start" — but the helper line at the bottom says AA is applied on renderer startup. Picking "On next start" looks like a duplicated state with "Auto"; never observed any visible diff. (`08-settings.png`) | 是该解释 — collapse to On / Off + footnote, or remove the duplicate. |
| Settings → Map & Doctrine → "Role Quotas" | All six sliders default to "8" with no unit. Pop is 12; sum of quotas is 48. Moving them while paused produces no visible change, no rebalancing toast. (`10-rolequotas-expanded.png`) | 是该解释 — show "% of pop" or "max workers" + a confirmation toast on change. |
| Colony → Population → "Logistics Legend" footer | Header rendered but empty content area. (`24-colony-late.png`) | 是该实现 — populate it, or remove the empty header. |

## R2 表述不清

| label / 数字 | 当前显示 | 缺什么 | 建议 |
|---|---|---|---|
| Top status `Threat: 21%` → `Threat: 50%` | percent of what? Colony resists up to 100%? Game-over at 100? (`07-colony.png`, `24-colony-late.png`) | scale + danger threshold | "Threat 50% (raid at 80%)" |
| Resources rate `(sampling…)` | All non-Food rates stick on `(sampling…)` for the entire opening. (`07-colony.png`) | how long is the sample window? when does it resolve? | "(sampling, ~30s)" or hide until resolved |
| Tile inspector tooltip key hint `B = build · R = road · T = fertility` (`22-tile-inspect.png`) | Contradicts the Help dialog which says R = reset camera, T = terrain overlay, build keys are 1-12. There is no "B" key in the keybind sheet. | unify or delete this hint | drop these three letters; they don't match any global binding I could trigger. |
| Tile inspector `Yield pool 99 · Salinization 28%` (`22-tile-inspect.png`) | What is the yield pool unit (food per harvest? remaining)? What does 28% salinization do to the player? | unit + behavioural consequence | "99 food remaining · 28% salt → -28% farm output" |
| Top score line `Score 199 Dev 29/100 — Scrappy outpost, still finding its rhyth\|` (`23-storyteller.png`) | "rhyth" is truncated mid-word; the whole storyteller line is also clipped by the resources strip. | layout fix | reserve more horizontal room or wrap. |
| Status badge wording `Autopilot OFF · manual; builders/director idle` (`06-game-start.png`) vs help text "DIRECTOR — the deterministic rule-based fallback is driving" | First reads as "no AI"; second reads as "AI is rule-based fallback". Same word means two things. | pick one verb | "AI: rule-based fallback (no LLM)". |
| Day counter `Day 14` after 3:24 elapsed (`24-colony-late.png`) | Help dialog never defines Day length; the briefing says nothing. ~14 s/day inferred. | seconds-per-day caption | "Day 14 (≈14s each)". |
| Storyteller summary `Dev 40 - foothold` (`24-colony-late.png`) vs status bar `Dev 29/100` at the same instant | Two different Dev numbers on screen at the same time. | pick one source | tie storyteller text to the status-bar number. |
| Entity Focus rows `Critical / FARM · Deliver · starving` (`23-storyteller.png`) | A worker that is "Delivering" is also "starving" — does Deliver mean "carrying food" or "moving toward storage"? Player can't tell whether the worker can self-eat. | verb glossary | tooltip on each verb explaining what the worker is doing **right now**. |

## R3 效果不明的设置

| 设置项 | 测试方法 | 是否有可见差异 |
|---|---|---|
| Heat Lens key `L` | Pressed once on the title screen-cleared map (`12-heatlens.png`); zero change. Then clicked sidebar Heat (L) tab and the toast confirmed ON, but until tiles were active there was nothing to overlay — no "Heat lens has nothing to show yet" hint. (`13-heatlens-on.png`) | partially — needs a "no signal yet" state. |
| Terrain key `T` | Pressed twice consecutively (`15-terrain-elev.png`, `16-terrain-cycle.png`); top-left badge stayed "Overlay: Fertility" — never cycled to elev / conn / nodes despite the build-panel hint promising those modes. | dead — either implement cycling or remove the promise. |
| `Anti-Aliasing` combobox | See R1; toggling produced no visible diff and footnote says it requires renderer restart, but the page never restarted. | no diff. |
| `Role Quotas` sliders | See R1; moved, nothing observable on the colony. | no diff. |
| `Quality Preset` combobox | Switching from Balanced → Performance: top-left HUD showed no change (no resolution shift, no FPS counter). | unverifiable — needs an FPS / quality readout. |

## R4 隐藏状态

- The autopilot built **6 warehouses against a target of 2 and 17 farms against 6** before pausing (`24-colony-late.png` top strip "warehouses 6/2 farms 17/6"). The player never authorised this. There is no "Autopilot is buying X with your wood" warning before the action.
- "Bear-20 Combat / (predator) Stalk" appeared briefly in Entity Focus, then "Last: Deer-17 died (predation)" toast (`19-after-wait.png`) — but the population block never shows that the predator count went up or that a herbivore was lost. Hidden body count.
- Worker carry contents (food / wood) only visible after click-inspecting a single worker. "Critical / FARM · Deliver · starving" rows in Entity Focus do **not** say what the worker is currently carrying — the hidden state ("you have 5 food in your pocket while starving") is exactly the bug pattern earlier patches were chasing.
- Colony panel `Threat 50%` is unsourced — there is no breakdown panel ("from raids X, from hunger Y, from injuries Z").

## R5 cause-effect 断裂

- **Surplus on the heat lens, starvation in the population.** `24-colony-late.png` shows "supply surplus" labels stacked on the food cluster while every worker on the Entity Focus list reads "starving". The lens promises "red = surplus", which is true at the storage tiles, but the player has no way to learn from the screen that "surplus stuck behind queueing" is a different failure mode from "no food at all".
- **Autopilot recovery toast says "Expansion paused; farms, warehouses, and roads take priority"** (`21-autopilot-on.png`), yet 90 seconds later the colony has 17 farms and 6 warehouses — far more than the displayed targets (6 and 2). Either the toast lied or the targets are stale; the player can't tell.
- **Animal "Blocked / (herbivore)"** rows on the early Entity Focus list (`06-game-start.png`) — there is no obstacle visible on the map and the deer immediately re-enter Graze a few ticks later. "Blocked" implies player-fixable cause; really it's just spawn pathing. Misleading.

## R6 视觉 / 文字 / 音频不匹配

- Heat lens toast says "red = surplus, blue = starved" (`13-heatlens-on.png`); Help dialog says "blue over processors or routes that are starving for input" (`05-different.png`). Two valid but different explanations of the same colour.
- Building cost labels in the right Construction panel show **"Cost: free"** for Road and **"Cost: 1 wood (commission)"** for Demolish (`17-build-road.png`, `20-demolish.png`). New player will reasonably expect Demolish to *return* wood, not cost wood. The "partial salvage" line is below the fold.
- Top status mid-game string runs off the screen ("…paused | Au…") (`24-colony-late.png`). Important "Recovery" sentence is literally cut off.

## R7 教程与首次体验断点

- Help → Controls dialog teaches `1`–`12`, `R`, `Home`, `T`, `L`, `Ctrl+Z` — but the in-game tile tooltip teaches `B`, `R`, `T` with **different semantics**. Two contradictory teaching surfaces.
- "What makes Utopia different" tab promises a **WHISPER / DIRECTOR / DRIFT** badge "on the status-bar storyteller strip" (`05-different.png`). The status-bar strip in-game shows "Autopilot OFF · manual" / "Autopilot ON · fallback/llm" — none of those three named voices ever appears on the strip; only "DIRECTOR" surfaces inside the Colony panel under "AI STORYTELLER". Tutorial points at a UI element that doesn't exist where promised.
- The Best Runs list on the menu is **all losses** at 3:11–6:26 survival (`01-launch.png`). New player has no template for "what does winning look like?" — the Survival Mode help line ("the run ends when the colony cannot recover") explains why, but the empty win column reads as a broken board.

## R8 默认状态合理性

- Default Quality Preset is "Balanced", default GPU is "High Performance GPU". For a brand-new player on a laptop, defaulting to High-Performance GPU is aggressive; should be Browser Default until the user opts in.
- Default time speed = `▶` (1×) is fine, but the **Ultra-speed (8×) button has no warning that it caps to ~×0.7 on this hardware** (visible "running ×0.7 (capped)" in `21-autopilot-on.png`); a first-time player will press it and silently get less than promised.
- Default left side-panel "Entity Focus" filter is `All 20` — fine — but the row format `Una Lowe · Hungry / WOOD · Wander · hungry` repeats "Hungry/hungry" twice and is dense. New player parse load is high.

## 自行扩展角度

### Internal consistency of the world / story

- The opening briefing says "rebuild the east warehouse" and the map shows a `east ruined depot` label, but the build tool is called `Warehouse` and the existing tile is labelled "depot". Three nouns for the same building family.
- Two visitor factions are simultaneously labelled `Blocked / (saboteur)` *and* `well-fed`. A saboteur unit is in your colony, well-fed, and you are not warned. The fiction breaks (why is my saboteur idle and well-fed?).

### Numbers / units conflict across contexts

- Resource rate uses `/min` (`Food 0 ▼ -747.0/min`, `24-colony-late.png`) but Day length appears to be ~14 real-time seconds. So `-747/min` over a "day" is `-174 food per day` — but the player sees "0m 9s until empty" framed in real seconds. Three different time bases (per-min, per-day, real seconds).
- "Score 199 Dev 29/100" implies a max of 100, but Best Runs on the title screen lists "Score 358 · Dev 21" and "Score 256 · Dev 12" (`01-launch.png`) — Dev values are well below the 29 we hit in this run. So "Dev /100" is a gauge but Score is unbounded; the slash format implies they're comparable.

## 改进优先级清单

### P0（玩家会困惑到无法继续）

1. **"Supply surplus" heat tags over a starving colony** — add a third heat colour or a "queue saturated" overlay so the player understands the failure mode.
2. **Tile inspector key hint `B / R / T = fertility`** — either remove it or align with the global binds; right now it actively miseducates.
3. **Status bar truncation mid-sentence** in active recovery state — reserve room or wrap the line.

### P1（明显的合理性破洞）

4. **Terrain overlay key (`T`) advertised to cycle 4 modes, only ever shows Fertility.**
5. **Autopilot over-builds past its own announced targets** (warehouses 6/2, farms 17/6) with no further explanation toast.
6. **Storyteller "WHISPER / DIRECTOR / DRIFT" badge promised on the status strip is not on the status strip** (only inside the Colony panel).
7. **`Threat 50%` and `Dev 29/100` units lack scale anchors** (what counts as red, what counts as winning).
8. **Resource rate `(sampling…)` never resolves visibly**; either show partial data or a countdown.
9. **`Day 14` time base undefined**; show seconds-per-day at least once.
10. **Demolish "Cost: 1 wood"** counter-intuitive when "salvage" is below the fold.

### P2（细节）

11. Help dialog / heat-lens toast use different colour glossaries.
12. "Anti-Aliasing" combobox has redundant Auto / On next start / Off next start.
13. Role Quotas slider unit (8 of what?) + no feedback when changed.
14. Empty "Logistics Legend" header in the Colony panel.
15. `Blocked / (herbivore)` is a misleading "blocked" verb for unblocked spawn-area pathing.
16. Best Runs list on menu is 100% losses; visual asymmetry with no winning entries.

## 结论

The build is in a "lots of telemetry, not enough teaching" state. The Colony panel, AI Log, and Heat Lens are genuinely impressive instrumentation — every decision the AI makes is visible, every tile state is inspectable, every worker has a hunger and policy line. But the **labels on top of those instruments are inconsistent** (R/T/B keys, Day units, Threat scale, Dev scale, Heat colour glossary), and the **autopilot over-runs its own announced budget** without warning. A player who reads the briefing carefully and presses every button will spend the first 30 minutes trying to reconcile contradictions instead of running the colony.

YELLOW: nothing is irreparably broken, but the next pass should be a lockdown on **labels and units** before adding any new features. Specifically: pick one global key map and align tooltip / help / build-panel hint to it; pick one Dev / Score scale and bind the storyteller text to it; and add an explicit "queued / blocked" colour to the heat lens so "surplus" never coexists with "starving".
