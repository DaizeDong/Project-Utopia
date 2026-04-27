---
reviewer_id: 01e-innovation
round: 7
version: 2
date: 2026-04-26
priority: P1
covers_all_feedback: true
---

# Plan v2: 01e-innovation — 特质行为接线 + WHISPER Demo + 情感决策层

## 1. 根本问题（顶层分析）

### 根因 A — 工人特质只是标签，WorkerAISystem 从未读取

**代码路径**：`EntityFactory.js` 设置 `worker.traits = ['hardy', 'social']`，但 `WorkerAISystem.chooseWorkerIntent`、`StatePlanner.deriveWorkerDesiredState` 等均未读取 `worker.traits`。

**顶层修复**：创建 `getWorkerTraitModifiers(worker, state)` 函数，返回基于特质的意图权重乘数。在 `chooseWorkerIntent` 内调用，将乘数应用于相关意图分数。特质从此对行为产生可见影响，而非只是显示标签。

### 根因 B — WHISPER 永远不激活，DIRECTOR 输出固定模板

**代码路径**：`src/config/constants.js`（或 AI_CONFIG）→ `enableByDefault: false`；`GameApp.js` 强制 `state.ai.enabled = false`；`LLMClient.buildEnvironmentFallback` 只返回静态候选字符串。

**顶层修复**：不需要真实 LLM。创建**本地 WHISPER Demo 模式**：`buildLocalWhisperResponse(state)` 函数，根据当前游戏状态（危机类型、最近死亡、工人数量趋势、场景目标）生成**状态敏感的个性化叙事**，明显区别于 DIRECTOR 的通用策略格言。在 UI 中显示 `[WHISPER]` 标签（而非 `[DIRECTOR]`）让玩家感知差异。

### 根因 C — Decision Context 是物流语言，无情感维度

**代码路径**：`WorkerAISystem.buildDecisionContext`（或生成 Decision Context 文本的函数）只读取任务/携带数据，从不读取 `worker.hunger`、`worker.mood`、`worker.recentEvents`。

**顶层修复**：在 decision context 文本前加情感前缀，基于：
- `hunger < 0.25` → "Running low—" 前缀
- 近期记忆中有 close friend 死亡 → "[Name] is gone. " 前缀
- `morale < 0.3` → "Barely holding together—" 前缀

## 2. 完整 Feedback 覆盖

| 01e 反馈 | 覆盖 step |
|----------|-----------|
| LLM 始终离线，WHISPER 从未激活 | Step 2 |
| 工人特质对行为无影响 | Step 1 |
| 社交关系不产生玩法后果 | Step 1（social trait 在友人附近获得社交奖励）|
| Decision Context 是物流语言 | Step 3 |
| 地图模板视觉差异度不足 | Step 4（每模板专属 Heat Lens 标签）|
| 决策层过窄（仅建造+滑块） | → 02b plan advisory 覆盖 |
| 后期钩子缺失 | → 超出 freeze 范围，部分由 01d Run End 覆盖 |

## 3. 实施步骤

### Step 1 — `src/simulation/npc/WorkerAISystem.js`：特质意图权重接线

新增函数 `getWorkerTraitModifiers(worker)` → 返回乘数对象：
```js
function getWorkerTraitModifiers(worker) {
  const traits = worker.traits ?? [];
  return {
    weatherSpeedMult: traits.includes('hardy') ? 0.6 : 1.0,
    moraleDecayMult: traits.includes('hardy') ? 0.7 : 1.0,
    restDecayMult: traits.includes('social') ? 0.75 : 1.0,
    socialBonusNearFriend: traits.includes('social') ? 0.15 : 0,
    taskSwitchCooldownMult: traits.includes('efficient') ? 0.8 : 1.0,
    deathThresholdDelta: traits.includes('resilient') ? -0.05 : 0,
  };
}
```
在 `chooseWorkerIntent` 调用后，将 `weatherSpeedMult` 乘以路径成本，`socialBonusNearFriend` 加到工人附近（3 格内有 Close Friend）时的 `rest` 意图分数。

在 `src/config/balance.js` 的 `BALANCE` 对象中添加：`workerTraitEffectsEnabled: true`。

### Step 2 — `src/simulation/ai/LLMClient.js`（或 WorldExplain.js）：本地 WHISPER Demo

新增函数 `buildLocalWhisperResponse(state)` → 根据游戏状态生成个性化叙事：

```js
function buildLocalWhisperResponse(state) {
  const deaths = state.gameplay?.deathLog ?? [];
  const recentDeath = deaths[0];
  const food = state.resources?.food ?? 0;
  const workers = state.workers?.length ?? 0;
  const scenario = state.scenario?.name ?? '';

  if (recentDeath && (state.metrics?.timeSec - recentDeath.timeSec) < 120) {
    return `${recentDeath.name} is gone — the rest press on. ${food < 50 ? 'The colony cannot afford another loss.' : 'Hold formation.'}`;
  }
  if (food < 30) {
    return `${workers} mouths, no margin. Every second without a harvest is a death sentence.`;
  }
  if (state.buildings?.kitchens > 0 && (state.workers?.filter(w => w.role === 'COOK').length ?? 0) === 0) {
    return `The kitchen stands empty. Someone needs to cook — the difference between raw and fed is survival.`;
  }
  // fallback to scenario-specific advice
  return getScenarioWhisper(scenario, state);
}
```

在 `AI_CONFIG` 中添加 `enableLocalWhisperDemo: true`（默认 true）。当此选项开启时，DIRECTOR 格言改由 `buildLocalWhisperResponse` 替代，UI 标签显示 `WHISPER` 而非 `DIRECTOR`。

### Step 3 — `src/simulation/npc/WorkerAISystem.js`（或 WorldExplain.js）：情感决策前缀

在生成 Decision Context 字符串的函数中：
```js
function buildDecisionContext(worker, state, taskDesc) {
  let prefix = '';
  if ((worker.hunger ?? 1) < 0.25) prefix = 'Running low — ';
  else if ((worker.morale ?? 1) < 0.3) prefix = 'Barely holding — ';
  else {
    const recentFriendDeath = worker.agent?.memory?.recentEvents
      ?.find(e => e.type === 'friend_death' && (state.metrics.timeSec - e.timeSec) < 90);
    if (recentFriendDeath) prefix = `${recentFriendDeath.name.split(' ')[0]} is gone. `;
  }
  return prefix + taskDesc;
}
```

### Step 4 — `index.html`：每地图模板专属 Heat Lens 标签

在 HeatLens 按钮或 overlay 的 label 中，根据当前 `state.scenario.template`：
- `temperate_plains` → "(soil / routes / frontier)"
- `archipelago_isles` → "(island / bridges / fragmented)"
- `fortified_basin` → "(defense / gates / walls)"
- `fertile_riverlands` → "(fertile / throughput / river)"
- `rugged_highlands` → "(elevation / chokepoints / hardship)"
- `coastal_ocean` → "(harbor / wind / tidal)"

这让不同模板在 Heat Lens 激活时有可见的语境差异。

## 4. 验证

- 点开 hardy 工人 Entity Focus → Policy Notes 或 Traits 区显示 "Hardy trait: weather path cost ×0.6"
- social 工人在 Close Friend 3 格内 → 休息意图分数 +0.15（可在 Top Intents 观察）
- HUD AI Storyteller 显示 `WHISPER` 标签，文本包含工人姓名或具体危机内容（非通用格言）
- 饥饿工人（< 25%）的 Decision Context 以 "Running low — " 开头
- `node --test test/*.test.js` 全通过
