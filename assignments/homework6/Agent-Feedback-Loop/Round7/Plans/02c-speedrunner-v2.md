---
reviewer_id: 02c-speedrunner
round: 7
version: 2
date: 2026-04-26
priority: P0-equivalent（COOK=0 使整个精炼链失效）
covers_all_feedback: true
---

# Plan v2: 02c-speedrunner — COOK 死锁根因修复 + 角色控制 + 性能

## 1. 根本问题（顶层分析）

### 根因 A — ColonyPlanner fallback 分配逻辑的 chicken-egg 死锁

**代码路径**：`src/simulation/meta/ColonyPlanner.js` → `generateFallbackPlan`

**缺陷**：COOK 分配被 `food >= idleChainThreshold(15)` 门槛控制。Kitchen 存在时，若当前食物低（开局饥荒），阈值不满足 → COOK 永远不被分配 → Kitchen 不生产 Meals → 食物始终低 → 阈值永远不满足。**循环依赖闭环**。

**正确逻辑**：COOK 分配应基于**基础设施是否存在**（Kitchen 数量），而非当前库存水平。即：有 Kitchen 就必须有 COOK，与食物当前值无关。

### 根因 B — Fallback 策略硬编码角色分配，忽视 Settings 面板

**代码路径**：`src/simulation/meta/ColonyPlanner.js` → `generateFallbackPlan` 的角色权重

**缺陷**：Settings 面板的 `farmRatio`、`roleQuotaCook`、`roleQuotaSmith` 等滑块值被保存到 `state.settings`，但 fallback plan 生成器使用内置的硬编码权重比例，完全不读 `state.settings`。LLM 下线时，玩家的所有设置干预完全无效。

**正确逻辑**：Fallback 应读取 `state.settings.roleQuota*` 作为 **硬约束下限**（当 roleQuotaCook > 0 时，分配 ≥ roleQuotaCook 个 COOK，不可低于）。

### 根因 C — 每帧全量计算在高速模拟下线性劣化

**代码路径**：渲染循环 → 所有实体每帧都执行路径重算

**缺陷**：20+ worker 在 8× 快进下，每帧 54ms，FPS=10。根本原因是：(1) 路径重算触发频率与时间步长无关，每渲染帧都算；(2) EntityFocus 面板 DOM 更新与 Three.js 渲染帧同步，每帧重渲染整个工人列表。

**正确逻辑**：路径重算和 UI 面板更新应按**模拟逻辑帧**节拍（低频）而非**渲染帧**节拍（高频）执行。在速度 > 4× 时，UI 更新降频至每 3 渲染帧一次。

### 根因 D — "僵尸殖民地"缺乏终局机制

**现状**：4 个工人可以无限 Wander，Score 线性增长，没有游戏结束条件。玩家没有压力维持高质量运营。

**修复**：当同时满足以下条件时触发 "Colony Collapsed" 事件（可配置）：工人 < 3 AND 连续 180s 无新生 AND food < 20 AND DevIndex < 15。

## 2. 完整 Feedback 覆盖

| 02c 反馈 | 覆盖 step |
|----------|-----------|
| COOK 永远为 0 | Step 1 + Step 2 |
| 角色配额滑块无效 | Step 2 |
| 快进实际速度 1-2× | Step 3 |
| LLM 完全离线 | → 01e-v2 plan |
| 僵尸殖民地无终局 | Step 4 |
| 分数公式不透明 | Step 5 |
| 手动干预无效 | → 02b-v2 plan |
| 手动策略劣于 autopilot | → 02b-v2 plan |

## 3. 实施步骤

### Step 1 — `src/simulation/meta/ColonyPlanner.js:generateFallbackPlan`
删除 COOK 分配的食物阈值门槛。改为：当 `state.buildings.kitchens > 0`，至少分配 `max(1, Math.floor(state.buildings.kitchens * 1.5))` 个 COOK。这是**架构级修复**：资源分配由基础设施决定，不由当前库存决定。

### Step 2 — `src/simulation/meta/ColonyPlanner.js:generateFallbackPlan`
在角色分配计算之前，读取 `state.settings` 中的配额设置：
```js
const cookFloor = Number(state.settings?.roleQuotaCook ?? 0);
const farmRatio = Number(state.settings?.farmRatio ?? 0.5);
```
将这些值作为 **下限约束** 应用到分配结果：`allocatedCook = Math.max(allocatedCook, cookFloor)`。

### Step 3 — `src/render/SceneRenderer.js` 或 `GameApp.js`
在高速模式（speed > 4）下，对 EntityFocus 面板的 DOM 更新降频：
```js
if (state.settings?.speed > 4 && this._frameCount % 3 !== 0) return; // skip UI update
```
同时，在 `WorkerAISystem.js` 的路径重算里，增加逻辑帧节拍门槛（改为每 N 个逻辑 tick 重算一次，N 随 speed 增大）。

### Step 4 — `src/simulation/lifecycle/MortalitySystem.js` 或 `src/simulation/meta/ProgressionSystem.js`
新增 "Colony Collapsed" 检查：每 60s 游戏时间检查：workers < 3 AND lastBirthAge > 180s AND food < 20 AND devIndex < 15。满足时 emit `RUN_END` 事件，reason=`"collapse"`。在 GameStateOverlay 的 run-end 面板显示 "Colony Collapsed" 原因。

### Step 5 — `index.html` 或 `src/ui/hud/HUDController.js`
给 DevIndex tooltip 加说明：`"Dev Index: measures settlement progress (0-100). Requires full production chain (Meals + Tools + Medicine) and active Frontier routes. Currently at X/100."`

## 4. 验证

1. 启动游戏，开 Kitchen 不开 Autopilot → 确认 Colony 面板显示 COOK ≥ 1
2. 设置 roleQuotaCook=3 → 确认工人分配中有 3 个 COOK
3. 20+ 工人开 8× 快进 → 确认 FPS 维持 ≥ 15（原来 10）
4. `node --test test/*.test.js` 全通过
