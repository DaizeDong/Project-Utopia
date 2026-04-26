---
round: 7
stage: B
date: 2026-04-26
plans_received: 10
plans_accepted: 10
plans_deferred: 0
waves: 3
---

# Round 7 Stage B — Enhancer Plan Summary

## 接收情况

全部 10 份 plan 收齐，YAML frontmatter 完整，步骤精确到 file:func。

| Plan | Priority | Scope | LOC Δ | 状态 |
|------|----------|-------|--------|------|
| 01a-onboarding | P0 | 5 files | ~180 | ACCEPTED |
| 01b-playability | P0 | 5 files | ~120 | ACCEPTED |
| 02a-rimworld-veteran | P0 | 5 files | ~150 | ACCEPTED |
| 01c-ui | P1 | 3 files | ~80 | ACCEPTED |
| 01d-mechanics-content | P1 | 5 files | ~200 | ACCEPTED |
| 01e-innovation | P1 | 8 files | ~320 | ACCEPTED |
| 02b-casual | P1 | 3 files | ~100 | ACCEPTED |
| 02c-speedrunner | P1 | 4 files | ~130 | ACCEPTED |
| 02d-roleplayer | P1 | 4 files | ~160 | ACCEPTED |
| 02e-indie-critic | P1 | 5 files | ~420 | ACCEPTED |

---

## 关键发现（跨计划汇总）

### P0 根因定位

**01b — Canvas 点击刷新页面**
> `index.html` 中按钮缺少 `type="button"`，浏览器默认 `type="submit"`，指针事件冒泡触发表单提交。修复：所有非提交按钮加 `type="button"` + `SceneRenderer.#onPointerDown` 加 `preventDefault()`。

**01a — "How to Play"触发场景切换**
> `#overlayHelpBtn` 缺 `stopPropagation()`，事件冒泡到 GameStateOverlay 的 `onReset` handler。修复：绑定改为箭头函数 + 显式 stopPropagation。

**02a — Starving worker 不进食（三层根因）**
> Layer A: `StatePlanner.deriveWorkerDesiredState` deliver 滞后分支可覆盖 `seek_food`；Layer B: `seek_food` 不在 `isProtectedLocalState`，强信号策略可抢占；Layer C: `consumeEmergencyRation` 不读 `worker.carry.food`，手持食物的工人在仓库空时仍不能自食。

### P1 根因定位

**02c — COOK=0 死锁**
> `ColonyPlanner.generateFallbackPlan` 以 `food >= idleChainThreshold(15)` 为 COOK 分配门槛，但无 COOK 时 Kitchen 不产 Meals，食物维持低位，阈值永不触发。死锁闭环。

**01e — LLM/WHISPER 结构性不可达**
> `AI_CONFIG.enableByDefault = false`，`GameApp.js` 强制 `state.ai.enabled = false`，`LLMClient` 直接短路到 `buildEnvironmentFallback`。玩家无法感知差异化。

**01d — 天气事件主 HUD 完全静默**
> `WeatherSystem` emit `WEATHER_CHANGED`，但唯一消费者是 `DeveloperPanel`；`storytellerStrip` 有 `/\[WEATHER\]/i` 规则但事件从未进入 `state.debug.eventTrace`。

**02e — Debug/Benchmark 面板非开发模式可见**
> `DeveloperPanel` 标签和 Benchmark/Export 区域未在现有 `.dev-only` CSS gate 下。

---

## 冲突与仲裁

### Conflict 1：01a × 02b（overlayHelpBtn + statusNextAction 重叠）
- 01a：修复 `#overlayHelpBtn` 事件冒泡 bug + 用 causal digest 覆写 `statusNextAction`
- 02b：将 "How to Play" 按钮重命名/移位到操作行下方 + 添加 `#nextActionBanner`
- **决议**：Wave 1 先落 01a（bug fix），Wave 2 再落 02b（UI polish），coder 在 Wave 2 步骤里处理 DOM 已被 01a 修改的情况

### Conflict 2：01e × 02d（worker trait 机制化重叠）
- 01e：在 `EntityFactory.js` preferences 添加 `weatherSpeedPenaltyMultiplier`（hardy）/ `socialDecayMultiplier`（social）/ `moraleDecayOnDeathMultiplier`（resilient），并在 `WorkerAISystem` + `MortalitySystem` 接线
- 02d：`deathThresholdFor()` 读 `entity.traits` + Entity Focus 面板加悲伤前缀
- **决议**：Wave 3 中先执行 01e（基础接线），再执行 02d（Display 层 + MortalitySystem holdSec 扩展）；02d 依赖 01e 的 traits 键名，coder 注意使用一致的字段名

### Conflict 3：02a × 01d（EventPanel 重叠）
- 02a：EventPanel log 从 3 → 6 条；推送仓库火灾 + 资源耗尽到 objectiveLog
- 01d：推送天气变化 toast 到 eventTrace；Run End 读取 deathLog
- **决议**：02a 在 Wave 1，01d 在 Wave 3；两者都是加法操作，objectiveLog 条目类型不同，不冲突

---

## 波次安排

### Wave 1 — P0 bug fixes（先行，独立，低 bench 风险）
- **01a**：overlayHelpBtn stopPropagation + Help Tab CSS 特异度 + causal digest → statusNextAction
- **01b**：`type="button"` + `preventDefault` + food 200→400 + 率符号修正
- **02a**：seek_food 进 isProtectedLocalState + carry.food 自食 + WorldEvent → objectiveLog + EventPanel 3→6

> ⚠️ bench 注意：01b 将 `INITIAL_RESOURCES.food` 从 200 提升到 400，对 90d bench 影响预计正向（早期存活率提升），但 Stage D 仍需全 4-seed 验证

### Wave 2 — P1 gameplay（中层，承接 Wave 1 修复）
- **02c**：COOK deadlock（ColonyPlanner 低 pop 门槛 + RoleAssignment quota floor 语义）
- **01c**：HUD 次级标签 + 1280px 溢出 + milestone toast 定位
- **02b**："How to Play" 重命名/位移 + `#nextActionBanner` + STABLE→FOOD LOW 一致性 + Help Modal 快速入门卡

### Wave 3 — P1 enrichment（最后，叙事/内容/创新层）
- **01d**：Weather HUD toast + Run End deathLog + Soil salinization event chain
- **01e**：Trait mechanics（hardy/social/resilient）接线 + Local WHISPER Demo mode
- **02d**：Memorial block（deathLog 面板）+ trait holdSec 扩展 + 悲伤前缀（依赖 01e traits 键）
- **02e**：`.dev-only` 扩展 + double-reset debounce + endThemeQuestion per template

---

## §7 Benchmark 风险清单

| 变更 | 可能影响 | 建议 |
|------|---------|------|
| food 200→400 | seed-99 早期存活率可能提升，也可能影响 EventDirector 触发时序 | Wave 1 后 90d × 4-seed 验证 |
| seek_food isProtected | 减少早期死亡，可能改变 devIndex 轨迹 | 同上 |
| COOK deadlock fix | 大幅改善 COOK 分配，可能提升所有种子的后期 devIndex | 积极影响，仍需验证 |
| WHISPER demo mode | 不影响模拟，仅 UI text 变化 | 无 bench 影响 |
| food initial raise + COOK fix 叠加 | 两者都正向，seed-7 zombie 状态可能部分改善 | Stage D 全 365d bench 验证 |

---

## 实施命令（Stage C coder 参考）

```
# Wave 1 acceptance gate（90d × 4-seed）
node scripts/long-horizon-bench.mjs --seed 1 --preset temperate_plains --max-days 90 --soft-validation
node scripts/long-horizon-bench.mjs --seed 7 --preset temperate_plains --max-days 90 --soft-validation
node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 90 --soft-validation
node scripts/long-horizon-bench.mjs --seed 99 --preset temperate_plains --max-days 90 --soft-validation

# Stage D final（365d × 4-seed，顺序）
node scripts/long-horizon-bench.mjs --seed 1 --preset temperate_plains --max-days 365 --soft-validation
...
```
