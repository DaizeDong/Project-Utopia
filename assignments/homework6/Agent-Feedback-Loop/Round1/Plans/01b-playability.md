---
reviewer_id: 01b-playability
feedback_source: Round1/Feedbacks/01b-playability.md
round: 1
date: 2026-04-22
build_commit: 709d084
priority: P0
estimated_scope:
  files_touched: 3
  loc_delta: ~120
  new_tests: 1
  wall_clock: 25
conflicts_with: []
---

## 1. 核心问题

1. **核心检查工具失效（P0，缺陷五）**：Entity Focus 面板在新手第一次尝试就报
   "No entity selected"。病因是 `SceneRenderer.#pickEntity` 对 InstancedMesh
   工人使用 THREE.Raycaster 的默认 per-instance 命中，workers 使用小 sprite /
   instanced quad，命中半径极小；同时 `#onPointerDown` 在按下 Build 工具时
   先走 entity 路径再走 build 路径，但由于 entity pick 失败，点击被 build 工具
   "吞掉"（reviewer 在 frames 1:21 前按 2 切到 Farm 时观察到）。玩家无法验证
   "谁在做什么"，直接切断"观察→策略"闭环。

2. **建造反馈微弱（P1，缺陷一）**：放 Farm/Quarry 成功时，虽然 Round-0
   01b-playability 已加了 `#spawnFloatingToast` 绿色飘字，但 reviewer 仍描述
   "没有任何你建造了一个农场的确认信息…资源条减了 5 wood，其他毫无反馈"。
   说明现有 toast 的显著性不够（短暂、浅色、没带资源代价）。

3. **顶栏信息过载的 dev 串（P2，缺陷三回响）**：`statusScoreBreak` 的
   `+1/s · +5/birth · -10/death (lived N · births N · deaths -N)` 对首次玩家
   是噪声；该元素当前在 casual/full 两种 UI 模式都可见（仅 Debug 面板在
   casual 隐藏）。

---

## 2. Suggestions（可行方向）

### 方向 A：扩大工人点击命中盒 + 禁用 Build-tool 模式下的 entity 拦截（P0 主推）
- 思路：在 `SceneRenderer.#pickEntity` 增加"半径回退"——若精确 raycast 无命中，
  用屏幕空间 8px 邻域对 entity world-pos 做投影距离排序取最近；同时当
  `state.controls.tool` 处于非 `select` 工具时，仍优先 entity pick（已经是
  现状），但在 entity pick 失败后抑制 build 失败 toast（避免"点工人反而造了
  个失败的 Farm"）。
- 涉及文件：`src/render/SceneRenderer.js`（`#pickEntity`、`#onPointerDown`）、
  `test/entity-pick-hitbox.test.js`（新增）。
- scope：小
- 预期收益：核心检查工具从"永远失败"→"近距离一点就中"，直接修复
  reviewer 最强烈的 UX 断点，重建"观察→策略"闭环。
- 主要风险：屏幕空间回退半径设太大会误选相邻工人；需以 8px 为上限。

### 方向 B：给 toast 加资源代价 + pulse 动画，并把 `statusScoreBreak` 挪到
dev-only
- 思路：`#spawnFloatingToast(..., buildResult)` 在 success 分支注入
  `"Farm placed (-5 wood)"` 文案；failure 分支已有 `formatToastText` 负责写
  "Need N more X"。同步给 toast DOM 加 `transform: scale` 弹跳关键帧（现有
  `.flash-action` 同款技巧）。把 `#statusScoreBreak` 加 `dev-only` class。
- 涉及文件：`src/render/SceneRenderer.js`（`#spawnFloatingToast` /
  `formatToastText`）、`index.html`（`#statusScoreBreak` class）、
  `src/ui/hud/HUDController.js`（可选：title 文案）。
- scope：小
- 预期收益：每次放置产生可读"Farm placed (-5 wood)"回路，资源扣减从"数字
  跳"变成"因果文案"；顶栏噪声下降。
- 主要风险：toast 文案变长可能超过 `#floatingToastLayer` 的 max-width；需
  截断。

### 方向 C：给没在生产的建筑加 tile-icon "idle" 标 + Colony 面板 idle 计数
- 思路：在 `ResourceSystem` 每 tick 给 `buildings` 里的 quarry/herbGarden 标
  `lastProducedSec`；若超过 60s 未产出→`entity.idle = true`；`SceneRenderer`
  在 tile 上画灰色感叹号小图标（复用 `pixel-art-icon-pack-rpg`）。
- 涉及文件：`src/simulation/economy/ResourceSystem.js`、`src/render/SceneRenderer.js`、
  `src/ui/panels/InspectorPanel.js`。
- scope：中
- 预期收益：直接解决 reviewer 的 "20 个药草园 0 产量" 黑箱。
- 主要风险：改 ResourceSystem 可能触动现有生产测试；大于 freeze 对 polish
  的通常 scope；本轮 20 分钟内不可能完整跑通。

---

## 3. 选定方案

选 **方向 A**，理由：

- P0 + 小 scope + 快速落地，完美匹配 enhancer 步骤 6 的"P0→小 scope"决策准则。
- reviewer 明确标 "严重"——Entity Focus 是"核心检查工具"，修好它性价比最高。
- 不引入新 mechanic，不改模拟层，不跨 freeze 边界（HW06 只允许 polish / fix
  / UX / perf，这就是典型的 UX bug fix）。
- 不破坏现有测试：`test/ui-layout.test.js` / `test/exploit-regression.test.js`
  / picking 相关测试不覆盖 `#pickEntity` 回退逻辑。
- 方向 B/C 留作后续 coder 有余力再做的 stretch goal，本 plan 只落 A。

---

## 4. Plan 步骤

- [ ] Step 1: `src/render/SceneRenderer.js:#pickEntity` — `edit` — 在函数末尾、
  `if (candidates.length === 0) return null;` 之前，加一个 "proximity fallback"
  分支：如果精确 raycast 候选为空，遍历 `this.state.agents`（仅 alive）与
  `this.state.animals`，将每个 entity 用 `this.camera` project 到 NDC，计算
  `dx = (ndc.x - mouse.x)`、`dy = (ndc.y - mouse.y)`，若屏幕像素距离 ≤ 16px
  则加入 candidates（distance = 像素距离 × 1e-3，保持 sort 稳定）。
  - 使用 `new THREE.Vector3(entity.x, 0, entity.z).project(this.camera)` 完成
    投影；把像素阈值 `PICK_FALLBACK_PX = 16` 作为文件顶部常量。

- [ ] Step 2: `src/render/SceneRenderer.js:#onPointerDown` — `edit` — 在
  `const selected = this.#pickEntity(this.mouse);` 之后、在已有 `if (selected)`
  分支里额外 `this.state.controls.buildPreview = null;` 清掉任何悬停的
  build 预览；entity pick 命中时直接 `return`（已是现状，确认保留）。
  - depends_on: Step 1

- [ ] Step 3: `src/render/SceneRenderer.js:#onPointerDown` — `edit` — 在 entity
  pick miss → fall through build path 前，加"短距离工人 guard"：若
  `this.#pickEntity` 返回 null 但 proximity fallback 找到了 ≤ 24px 的工人
  （把 Step 1 的阈值提到 24 做 guard，不做 select），则 `return` 并设
  `actionMessage = "Click a bit closer to the worker (hitbox is small)"`,
  `actionKind = "info"`，避免"点工人旁边意外放农场"。
  - 具体实现：在 `#pickEntity` 里额外暴露 `#proximityNearestEntity(mouse, px)`
    私有方法，`#onPointerDown` 在 build-tool 激活时先调用 24px guard。
  - depends_on: Step 1

- [ ] Step 4: `src/render/SceneRenderer.js` 顶部 — `add` — 加两个常量：
  `const ENTITY_PICK_FALLBACK_PX = 16;` 和 `const ENTITY_PICK_GUARD_PX = 24;`,
  并加一行注释引用本 plan：
  `// v0.8.2 Round1 01b-playability — proximity fallback + build-guard`.

- [ ] Step 5: `test/entity-pick-hitbox.test.js` — `add` — 新建 Node built-in
  test。测试用例：
  1. 用 `GameApp` 的最小初始化（参考现有 `test/ui-layout.test.js` 风格）
     放 1 个工人在 tile (10, 10)；
  2. 模拟 pointerdown 事件，其 `mouse.x/y` 对应工人屏幕坐标 +12px 偏移；
  3. 断言 `state.controls.selectedEntityId === worker.id`；
  4. 另一组断言：偏移 40px 时 `selectedEntityId === null`（不误选）。
  - depends_on: Step 1

- [ ] Step 6: `src/render/SceneRenderer.js:#onPointerDown` — `edit` — 在 entity
  命中分支追加一条 toast 调用：
  `this.#spawnFloatingToast(worldPos.x, worldPos.z, "Selected " + (selected.displayName ?? selected.id), "info", -1, -1);`
  使"点到工人"的成功反馈与放建筑同构（浮字在头顶飘出），解决 reviewer
  "没有确认信息"的余味。
  - depends_on: Step 2

- [ ] Step 7: `CHANGELOG.md` — `edit` — 在 v0.8.2 未发布段落下新增一行 bullet：
  `- Round1 01b-playability — Entity Focus 点击命中盒扩大：新增 proximity
  fallback（16px） + build-tool guard（24px），修复 reviewer 反映的"点工
  人永远 No entity selected"；新增 test/entity-pick-hitbox.test.js`。

（7 条原子步骤，落在 3 文件 + 1 新测试。）

---

## 5. Risks

- **误选风险**：proximity fallback 在高密度人群（>6 workers/ tile）可能选到
  后排工人。缓解：16px 取最近 + 距离排序，最多偏差 1 个 tile。
- **测试风险**：`test/ui-layout.test.js` 依赖 DOM 初始化顺序，若 Step 4 的
  常量放错位置可能影响 imports；常量是 module-scope 不影响 JSDOM 行为。
- **build 副作用**：Step 3 的 24px guard 会"拦截"一部分本来能成功的 build
  点击（如果玩家真想在工人旁边造）。缓解：guard 只在 `tool !== "select"`
  且 entity pick miss 时触发，文案引导玩家"稍微移开鼠标再点"。
- **Three.js 版本差**：`Vector3.project(camera)` 在 r128+ 稳定，项目用 Three.js
  r155（见 `package.json`），OK。
- 可能影响的现有测试：`test/ui-layout.test.js`（可能需更新
  `selectedEntityId` 的 null→id 断言，不会 break），`test/exploit-regression.test.js`
  （只测模拟层，不会触及）。

## 6. 验证方式

- **新增测试**：`test/entity-pick-hitbox.test.js` 覆盖 "12px 命中 / 40px 不
  命中" 两个场景；用 `node --test test/entity-pick-hitbox.test.js` 跑通。
- **手动验证**：
  1. `npx vite` → 打开 http://127.0.0.1:5173
  2. 点 Start Colony → 默认 Select 工具
  3. 左键点击任意工人周围 16px 内 → Entity Focus 面板应显示其 name/
     traits/hunger label
  4. 切到 Build→Farm 工具（按 2）→ 在工人正上方 20px 处点击 → 期望看到
     "Click a bit closer to the worker (hitbox is small)" 状态栏提示且
     **没**放下 Farm
  5. 远离工人任何草地点击 → Farm 正常放下，绿色飘字如旧
- **benchmark 回归**：`node scripts/long-horizon-bench.mjs --seed=42 --preset=temperate_plains`
  DevIndex 不得低于 42（当前基线 44，阈值 -5%）。本 patch 只触 render 层，
  不应影响模拟数值；benchmark 主要用于 regression tripwire。

## 7. UNREPRODUCIBLE 标记

部分可复现：reviewer 描述的 "(720,480)" 坐标未能用 Playwright MCP 在 20
分钟预算内跑一次完整回放（模板选择需手动操作、canvas 绝对坐标需 DPR 换
算）。本 plan 基于**静态代码路径分析**定位病因——`#pickEntity` 在
InstancedMesh 上使用默认 raycast 阈值（`THREE.Mesh.raycast` 的 `sphere`
测试），而工人 instancedMesh geometry 半径约 0.35 世界单位（≈ 8-12 屏幕
像素 at zoom 1），命中确实非常苛刻。此病因解释与 reviewer 观察"三次点击
都失败"一致，fix 方向（扩大到 16px）是标准做法。如果 Coder 在实施阶段
能同时附 Playwright 视频则更佳。
