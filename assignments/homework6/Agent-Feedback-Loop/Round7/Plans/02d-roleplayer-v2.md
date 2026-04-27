---
reviewer_id: 02d-roleplayer
round: 7
version: 2
date: 2026-04-26
priority: P1
covers_all_feedback: true
---

# Plan v2: 02d-roleplayer — 叙事层激活（永久死亡日志 + 悲伤机制 + 情感语言）

## 1. 根本问题（顶层分析）

### 根因 A — 死亡通知 10s 后消失，系统层没有永久记录供玩家回溯

`state.gameplay.deathLog` 从 02a Wave 1 开始存储死亡记录，但：
1. 没有任何 UI 面板展示它
2. EventPanel 的 objectiveLog 条目会被 slice(0,24) 截断
3. 死亡通知只以 scrolling toast 形式出现，持续约 10s

**顶层修复**：在 Colony 面板（或 EventPanel）新增 "Chronicles" 标签，渲染 `state.gameplay.deathLog` 的全部历史记录，永久保存，不截断。

### 根因 B — 好友死亡被记录在记忆流，但对工人行为无影响

`worker.agent.memory.recentEvents` 记录了 `friend_death` 事件，但 `WorkerAISystem` 从不读取此记录来影响：意图权重、休息概率、morale 数值。悲伤只存在于数据库，不存在于体验。

**顶层修复**：在 `MortalitySystem` 处理死亡时，对死者的 Close Friend（relationship > 0.6）施加 morale 惩罚（-0.15），持续 90s（衰减），通过 `worker.blackboard.griefUntilSec` 跟踪。`WorkerAISystem` 在计算意图时读取此字段。

### 根因 C — 特质对叙事无影响（已在 01e-v2 处理，此处复用）

见 01e-v2 Step 1。

## 2. 完整 Feedback 覆盖

| 02d 反馈 | 覆盖 step |
|----------|-----------|
| 死亡通知 10s 消失无永久日志 | Step 1 |
| 好友死亡不影响工人行为 | Step 2 |
| Decision Context 是物流语言 | → 01e-v2 Step 3 覆盖 |
| 工人特质无行为表达 | → 01e-v2 Step 1 覆盖 |
| 无法与个别工人建立深度联系 | Step 3（Entity Focus 显示悲伤状态）|
| 无年鉴/墓地让玩家回顾失去的人 | Step 1（Chronicles 标签）|
| 死亡无戏剧处理（暂停/镜头等） | Step 4（轻量视觉提示，不暂停游戏）|

## 3. 实施步骤

### Step 1 — 永久死亡日志（Chronicles 面板）

**Step 1a** — `src/ui/panels/EventPanel.js`（或 Colony 面板相关 JS）：
新增 Chronicles 区域，渲染 `state.gameplay.deathLog`：
```js
const deathLog = state.gameplay?.deathLog ?? [];
const chronHtml = deathLog.map(d =>
  `<div class="chronicle-entry">
    💀 <strong>${d.name}</strong>, ${d.role?.toLowerCase() ?? 'worker'}, 
    ${d.trait ?? ''} — died of ${d.cause ?? 'unknown'} near ${d.location ?? 'the colony'}
    <span class="chronicle-time">Day ${Math.floor((d.timeSec ?? 0) / 60)}</span>
  </div>`
).join('');
```

在 EventPanel 或 Colony 面板内加一个 `<details open>` 折叠块 "Chronicles（${deathLog.length} fallen）"，渲染此列表。

**Step 1b** — `src/simulation/lifecycle/MortalitySystem.js`：
确认死亡时将完整记录存入 `state.gameplay.deathLog`（如 Wave 1 02a 已建立但字段可能不完整）。确保记录包含 `{ name, role, trait, cause, location, timeSec }`。

### Step 2 — `src/simulation/lifecycle/MortalitySystem.js`：悲伤机制

在工人死亡处理逻辑末尾，找到死者的 Close Friend（遍历 `state.workers`，找 `w.relationships?.[deadId] > 0.6` 者）：
```js
for (const friend of state.workers) {
  const rel = friend.relationships?.[deadWorker.id] ?? 0;
  if (rel > 0.6) {
    friend.blackboard ??= {};
    friend.blackboard.griefUntilSec = nowSec + 90;
    friend.blackboard.griefFriendName = deadWorker.name.split(' ')[0];
    friend.morale = Math.max(0, (friend.morale ?? 0.5) - 0.15);
  }
}
```

在 `WorkerAISystem` 的意图计算中，若 `nowSec < worker.blackboard.griefUntilSec`，将 `farm`/`lumber`/`build` 等工作意图权重乘以 0.85（悲伤中效率下降，但不停止工作）。

### Step 3 — `src/ui/panels/EntityFocusPanel.js`：悲伤状态显示

在工人信息面板的状态行（Mood/Morale 行附近），检查 `worker.blackboard?.griefUntilSec`：
若仍在悲伤期，在面板顶部加一行：
```html
<div class="grief-notice">💔 Grieving ${worker.blackboard.griefFriendName}</div>
```
CSS：`.grief-notice { color: #e74c3c; font-size: 11px; font-style: italic; }`

### Step 4 — 死亡轻量视觉提示（不打断游戏）

在 `src/render/SceneRenderer.js` 或 HUDController 中：
当收到新的 death 记录（检测 `deathLog.length` 变化）时，在 `#statusBar` 或 HUD 上触发一次 100ms 的 `background-color` flash（从当前色快速变为深红再恢复）：
```js
statusBar.style.transition = 'background-color 0.1s';
statusBar.style.backgroundColor = 'rgba(200,50,50,0.3)';
setTimeout(() => statusBar.style.backgroundColor = '', 400);
```
配合 audio plan 的 `onWorkerDeath()` 音效，死亡事件有视觉+听觉双重反馈，但不暂停游戏（不影响核心体验流）。

## 4. 验证

- Colony 面板（或 EventPanel）出现 "Chronicles" 区块，列出所有死亡工人
- 工人 A 死亡 → 其 Close Friend B 的 Entity Focus 显示 "💔 Grieving A"
- Close Friend B 的 morale 值下降约 0.15
- 工人死亡时 HUD 有红色 flash
- `state.gameplay.deathLog` 每次死亡后条目增加且不清除
- `node --test test/*.test.js` 全通过
