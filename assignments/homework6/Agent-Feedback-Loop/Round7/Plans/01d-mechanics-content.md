---
reviewer_id: 01d-mechanics-content
round: 7
build_commit: f0bc153
freeze_policy: lifted
plan_author: Enhancer-Claude
plan_date: 2026-04-26
scores_reported:
  mechanic_presentation: 6/10
  content_richness: 3/10
---

# Plan: Mechanic Visibility & Run-End Narrative Depth

## 1. 核心问题提炼

### 问题 A — 天气效果因果链断裂（机制可见性最弱的单一痛点）
**症状**：Rain 导致路径成本 x1.50，但主地图无雨滴动效、无路面颜色变化；工人行走变慢时玩家毫无感知。  
**病因**：`AtmosphereProfile.js` 仅修改灯光/背景色（整体色调偏暗），`WeatherSystem.js` 会 emit `WEATHER_CHANGED` 事件，但 `HUDController` / `storytellerStrip` 均不将天气切换转化为任何面向玩家的主动提示（只在 DeveloperPanel 的 Colony Log 中记录一行）。HUD statusBar 区域中没有天气图标或当前状态角标。

### 问题 B — 游戏结束画面缺乏诊断叙事（核心体验落差）
**症状**：Run Ended 只显示 DevIndex / Deaths / Prosperity 等数字，玩家不知道"哪一步出了错"——无死亡时间线、无主要死因摘要、无"第几天粮食开始告急"之类的叙事。  
**病因**：`GameStateOverlay.render()` → `endStats` 区块仅写入 6 行固定数字（Time / Workers / Prosperity / DevIndex / Deaths / Score）。`state.gameplay.deathLog`（最多 24 条完整 obituary 行，已由 MortalitySystem 维护）和 `evaluateRunOutcomeState` 的 `reason` 字段（已有"Colony wiped"/"Both food and wood..."/"low prosperity"三种短语）均未被 end panel 充分利用。

### 问题 C — 土壤盐碱化无主动预警（资源链断裂的静默路径）
**症状**：Farm 盐碱化后产量下降，玩家只有主动按 T 键开 Terrain Overlay 才能发现，运行时无任何预警。  
**病因**：`TileStateSystem._updateSoil()` 计算并存储 `entry.salinized` 值，但没有任何代码在 `salinized` 超过阈值时触发 `emitEvent`。`storytellerStrip` 和 HUD 的 toast / actionMessage 均未订阅任何与土壤相关的事件。

---

## 2. 代码定位

| 问题 | 关键文件 | 关键位置 |
|------|----------|---------|
| A - 天气事件无提示 | `src/world/weather/WeatherSystem.js` | line 250: `emitEvent(WEATHER_CHANGED, ...)` — 已 emit 但无 HUD 消费者 |
| A - HUD 无天气角标 | `src/ui/hud/HUDController.js` | statusBar 区域（line 354/1467 周边）无 weather badge 逻辑 |
| A - storytellerStrip 过滤 | `src/ui/hud/storytellerStrip.js` | `SALIENT_BEAT_PATTERNS`（line 55-75）：`/\[WEATHER\]/i` 已在列表中，但 `formatGameEventForLog` 生成的 `[WEATHER]` 前缀行需要进入 `state.debug.eventTrace` 才会被拾取 |
| B - end panel 缺少叙事 | `src/ui/hud/GameStateOverlay.js` | `render()` isEnd 分支 line 526-621：endStats 仅写 6 行，endReason 只用 `session.reason`（1行） |
| B - deathLog 未利用 | `src/simulation/lifecycle/MortalitySystem.js` | line 432-434: `state.gameplay.deathLog` 有 24 条带时间戳的 obituary，未输出到 end panel |
| C - 盐碱化无事件 | `src/simulation/economy/TileStateSystem.js` | `_updateSoil()` line 100-170：计算 `entry.salinized` 但从不 emit 事件 |
| C - 缺少事件类型 | `src/simulation/meta/GameEventBus.js` | EVENT_TYPES 中无 `SOIL_SALINIZED` 事件 |

---

## 3. 浏览器复现

已在 http://127.0.0.1:5173/ Tab 0 (Silted Hearth 场景，Day 2)：

- **确认问题 A**：HUD statusBar 无天气图标；Weather 仅出现在 Debug 面板 Colony Log（`[WEATHER] clear -> rain (14s)`）。storytellerStrip 显示 DRIFT 徽章 + colony 状态，无任何天气相关文字。
- **确认问题 B**：端画面 endStats 输出 `Time Survived / Workers / Prosperity / DevIndex / Deaths` 六行数字，无死亡时间线，无诊断性叙事。`state.gameplay.deathLog` 存在但未被渲染。
- **确认问题 C**：盐碱化值存储于 `grid.tileState` map entries（`entry.salinized`），但无任何 HUD 元素订阅或显示预警。

---

## 4. 改进建议

### Suggestion 1 — 天气切换 HUD 角标 + storytellerStrip beat 推送

**做法**：在 `HUDController.render()` 中，每次检测到 `state.weather.current` 与上一帧不同时，向 `state.controls.actionMessage` 写入一条天气切换提示（例如 `"Rain started — path cost x1.50 on affected routes"`），并将同内容以 `[WEATHER]` 前缀 unshift 进 `state.debug.eventTrace`（与 MortalitySystem 的 obituary 写入方式完全一致）。`storytellerStrip` 已有 `/\[WEATHER\]/i` 过滤规则，将自动拾取并在 strip 上短暂显示。

**优点**：零新增 DOM 元素，零新 CSS；利用现有 actionMessage toast 和 storytellerBeat 机制；改动量极小（HUDController 约 10 行新逻辑）。

### Suggestion 2 — Run End 诊断叙事块

**做法**：在 `GameStateOverlay.render()` 的 isEnd 分支中，读取 `state.gameplay.deathLog`（最多取头 5 条）拼接成"Death Timeline"段落，并在 endStats 末尾附加"First Death: Day X, Cause: starvation"等摘要行。利用已有的 `evaluateRunOutcomeState.reason` 字段作为顶行标题（当前已赋值但仅显示在 endReason 元素，字号极小）。

**优点**：`state.gameplay.deathLog` 已由 MortalitySystem 维护且格式完整（带时间戳 + backstory + anchor label），只需读取渲染，无需新系统；直接映射 RimWorld 风格的"故事摘要"。

### Suggestion 3 — 土壤盐碱化 GameEventBus 事件 + storytellerStrip 告警

**做法**：在 `GameEventBus.EVENT_TYPES` 中添加 `SOIL_SALINIZED: "soil_salinized"`；在 `TileStateSystem._updateSoil()` 中，当 `entry.salinized` 首次超过 `BALANCE.saltThreshold`（约 0.5）时 emit 该事件；在 `formatGameEventForLog`（DeveloperPanel）和 `SALIENT_BEAT_PATTERNS`（storytellerStrip）中添加对应的格式化和过滤规则。

**优点**：遵循项目现有的"事件总线 → story beat"流程，与现有体系完全一致；土壤预警自动出现在 storytellerStrip 和 DeveloperPanel Colony Log，无需新 UI 元件。

---

## 5. 选定方案

选定 **Suggestion 1 + Suggestion 2**，作为本轮实施目标：

- Suggestion 1（天气 HUD 角标）是反馈中评分最低（★☆☆☆☆）的"天气效果不可见"问题的最小可行修复，修改量少、风险低。
- Suggestion 2（Run End 诊断叙事）是反馈中唯一被明确和 RimWorld 类比的缺口，且 `state.gameplay.deathLog` 已有全部所需数据，是"数据已在，只缺渲染"的典型 quick win。
- Suggestion 3（土壤盐碱化事件）同样选定，作为轻量补充步骤（EventBus + TileStateSystem + 格式化），无 DOM 改动。

---

## 6. 执行步骤

### Step 1 — `GameEventBus.js`：添加 `SOIL_SALINIZED` 事件类型
**文件**: `src/simulation/meta/GameEventBus.js`  
**函数**: `EVENT_TYPES` 冻结对象  
**改动**: 在 `WORKER_RIVALRY: "worker_rivalry"` 之后追加：
```js
SOIL_SALINIZED: "soil_salinized",
```

### Step 2 — `TileStateSystem.js`：在 `_updateSoil()` 中 emit 盐碱化事件
**文件**: `src/simulation/economy/TileStateSystem.js`  
**函数**: `_updateSoil(state)`  
**改动**: 在 Farm tile 的 `entry.salinized` 更新逻辑之后（处理 salinized 值写入的循环内），当 `entry.salinized` 首次穿越阈值时（新值 >= 0.5 且上一个值 < 0.5），调用 `emitEvent(state, EVENT_TYPES.SOIL_SALINIZED, { ix, iz, salinized: entry.salinized })`。需在文件顶部补充导入：`import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js"` 已存在，检查后直接使用。需给每个 tileState entry 加 `_saltEventFired` 标记位防重复触发（重置到 fallow 后清除）。

### Step 3 — `DeveloperPanel.js`：在 `formatGameEventForLog` 中格式化 SOIL_SALINIZED
**文件**: `src/ui/panels/DeveloperPanel.js`  
**函数**: `formatGameEventForLog(event)` — `switch (event.type)` 块  
**改动**: 在 `DEMOLITION_RECYCLED` case 之后添加：
```js
case EVENT_TYPES.SOIL_SALINIZED: {
  const ix = Number(detail.ix ?? 0);
  const iz = Number(detail.iz ?? 0);
  const salt = Number(detail.salinized ?? 0);
  return `${tsPrefix} [SOIL] Farm at (${ix},${iz}) salinized (${salt.toFixed(2)}) — consider fallow`;
}
```

### Step 4 — `storytellerStrip.js`：在 SALIENT_BEAT_PATTERNS 中添加 SOIL 过滤规则
**文件**: `src/ui/hud/storytellerStrip.js`  
**位置**: `SALIENT_BEAT_PATTERNS` 冻结数组（line 55-75）  
**改动**: 在数组末尾追加 `/\[SOIL\]/i`，使 `[SOIL] Farm at ...` 行被 `extractLatestNarrativeBeat` 拾取并短暂展示在 storytellerBeat 区域。

### Step 5 — `HUDController.js`：检测天气切换并推送 toast + eventTrace beat
**文件**: `src/ui/hud/HUDController.js`  
**函数**: `render(state, session)`  
**改动**:
1. 在类实例字段区（`constructor` 附近）初始化 `this._lastWeatherKind = null`。
2. 在 `render()` 函数开头（statusBar 更新逻辑之后、storytellerStrip 渲染之前）插入约 15 行逻辑：
   - 读取 `const currentWeather = state.weather?.current ?? "clear"`
   - 若 `currentWeather !== this._lastWeatherKind && this._lastWeatherKind !== null`（排除首帧）：
     - 构造提示文字，例如：对 `rain` / `storm` 包含 path cost 倍数，对 `drought` 说明 farm 产量影响，对 `clear` 说"天气转晴"。文字通过 `getWeatherInsight(state).summary` 辅助构建。
     - 写入 `state.controls.actionMessage = weatherMsg` + `state.controls.actionKind = "warning"`（使 HUD toast 条显示）。
     - `state.debug ??= {}; state.debug.eventTrace ??= []; state.debug.eventTrace.unshift('[WEATHER] ' + weatherMsg); state.debug.eventTrace = state.debug.eventTrace.slice(0, 36);`
   - 更新 `this._lastWeatherKind = currentWeather`。

### Step 6 — `GameStateOverlay.js`：Run End 诊断叙事块
**文件**: `src/ui/hud/GameStateOverlay.js`  
**函数**: `render(session)` → isEnd 分支 → `endStats` 渲染块（line 550-574）  
**改动**:
1. 在 `lines` 数组构建之后，读取 `state.gameplay.deathLog`（已由 MortalitySystem 维护，每条格式为 `[t.ts] Name, backstory, died of reason near anchor`）。
2. 取前 5 条，清理时间戳前缀（`replace(/^\[\d+\.?\d*s\]\s*/, '')`），构造 `Death Timeline` 段落：
   ```
   — First 5 deaths —
   Kael Keane, farming specialist, died of starvation near west lumber route
   ...
   ```
3. 将该段落追加到 `lines` 数组末尾（使用空行分隔），使 `endStats.textContent` 显示完整诊断叙事。
4. 若 `state.gameplay.deathLog` 为空或未定义，静默跳过（不影响现有渲染）。

### Step 7 — 验证
运行 `node --test test/*.test.js`，确认：
- `test/event-log-rendering.test.js`：新 `SOIL_SALINIZED` case 的 formatGameEventForLog 输出符合预期（需追加 1 条 assertion）。
- `test/storyteller-strip*.test.js`（若有）：`[SOIL]` 行被 `extractLatestNarrativeBeat` 正确拾取。
- 现有 865 tests 全部通过，无回归。

---

## 7. Risks & 验证

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| `_saltEventFired` 标记位在 TileStateSystem 热更新（hot-reload）后可能丢失，导致每次 vite HMR 后重复 emit | 低 | 在 `_updateSoil` 中用 `(entry.salinized ?? 0) >= 0.5 && !(entry._saltEventFired)` 检查，fallow 重置时清除标记；不影响生产 |
| HUDController 天气切换逻辑在首帧（`_lastWeatherKind === null`）可能漏过首次 rain | 无 | 代码中显式跳过首帧（`this._lastWeatherKind !== null` 守卫） |
| `state.gameplay.deathLog` 可能在极早期（Day 1 前）为 undefined | 无 | `Array.isArray` 守卫 + slice 保护，静默跳过 |
| endStats textContent 变长后，结束面板在小屏幕上溢出 | 低 | 前 5 条已有字数限制（obituary line 约 80-120 chars），`endStats` 本身有 `overflow-y: auto`；Coder 应在移动 breakpoint 下确认布局 |
| `[SOIL]` beat 与现有高优先级 beat（obituary / birth）争夺 storytellerStrip 显示位 | 无 | `HIGH_PRIORITY_PATTERNS` 不含 SOIL，SOIL 只在无更高优先级 beat 时显示，行为正确 |
| `state.controls.actionMessage` 可能被其他系统在同一帧内覆盖 | 低 | actionMessage 机制是 last-writer-wins；天气切换的 `actionKind = "warning"` 优先级足够高；可接受 |

**验证清单**：
- [ ] `node --test test/*.test.js` 全绿（≥865 tests passing）
- [ ] 新增 `test/soil-salinized-event.test.js` 或在 `event-log-rendering.test.js` 中追加：SOIL_SALINIZED → formatGameEventForLog → 包含 `[SOIL]` + `fallow` 字样
- [ ] 浏览器手动验证：天气切换时 HUD toast 条出现天气提示文字 + storytellerStrip 短暂显示 `[WEATHER]` beat
- [ ] 浏览器手动验证：Run End 画面 endStats 最后显示前 5 条死亡叙事（若当局有死亡）
- [ ] CHANGELOG.md 更新：在当前 unreleased 版本节添加本次改动条目
