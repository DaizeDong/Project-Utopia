---
reviewer_id: 02b-casual
feedback_source: Round1/Feedbacks/02b-casual.md
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

归并 reviewer 的 10 条 findings，真正的根本问题只有两个：

1. **"静默失败 + 截断警告"根本原因 = HUD 顶栏三条 chip 的 CSS**
   (`.hud-objective` line 91、`.hud-scenario` line 99、`.hud-action` line 105
   都是 `white-space: nowrap` + `text-overflow: ellipsis` + 写死 `max-width`)。
   这是 reviewer #1 "Clear the wall bef...", "No stone node on this tile. Quarri...",
   "Heat lens ON — red = s..." 全部三条截断吐槽的直接源头。代码里的
   `preview.reasonText` / `controls.actionMessage` 本身是完整句子，是 CSS
   把它们切掉了。**纯 polish，不改机制。**

2. **"分数数字读不懂"根本原因 = `getScenarioProgressCompact` 的字符串拼接
   是给开发者看的缩写**（`wh 5/2 · farms 4/4 · lumbers 2/3 · walls 7/4`，
   `src/ui/interpretation/WorldExplain.js:147-162`）。休闲玩家不知道
   分子/分母哪个是"已建"、哪个是"目标"、也不知道 `wh` = warehouse。
   这是 reviewer findings #6（"farms 4/4 到底哪个是目标？"）和一部分
   "UI 信息爆炸" 的直接原因。**纯文案，不改机制。**

（reviewer 还提到"无音效"、"无新手引导"、"工具不自动切回"、"死亡无通知"——
这些全部是 **新 mechanic** 或需要资产管线，违反 HW06 freeze；且项目里已有
`v0.8.2 Round-0 01e-innovation` 做过 obituary flash 占位，下一轮再演进。
本 plan 只攻可以 20 分钟内落地的 P0 CSS+文案。）

## 2. Suggestions（可行方向）

### 方向 A: 拆 nowrap — 让 3 条 chip 支持多行换行 + 提高 max-width，并把 "wh / farms 5/4" 改成 "warehouses 5 built of 4 needed"

- 思路：用 CSS `white-space: normal` + `-webkit-line-clamp: 2` 让超长红警告
  折行显示（最多 2 行，不破坏 statusBar 高度），同时把 `max-width` 从 120/320/420
  分别抬到 240/420/520；在 `getScenarioProgressCompact` 里把 `wh`→`warehouses`、
  `farms N/M`→`farms N built of M needed` 的人话版本暴露为新导出
  `getScenarioProgressCompactCasual`，在 `state.controls.uiProfile === "casual"`
  时由 HUDController 切换使用。
- 涉及文件：`index.html`（~20 行 CSS）、`src/ui/interpretation/WorldExplain.js`
  （+1 新函数 ~30 行）、`src/ui/hud/HUDController.js`（~10 行 profile 分支）、
  `test/world-explain.test.js` 或新文件 1 个。
- scope：**小**
- 预期收益：**P0 直接关掉**——reviewer 的 finding #1（截断）+ #6（分数歧义）
  同时消失；不破坏任何现有测试（只加 branch，既有 `getScenarioProgressCompact`
  路径保留给 full profile）。
- 主要风险：顶栏折成 2 行时可能与 `#ui.compact` mode 的紧凑视觉冲突 →
  用 `#ui.compact` 选择器保留单行 + ellipsis，双保险。

### 方向 B: 把 HUD 顶栏改成 hover → 完整 tooltip 弹窗（Radix/自研 tooltip 组件）

- 思路：保留 ellipsis，但加一个 hover/focus-within 触发的 floating tooltip
  把完整 `title` 撑开显示，配合键盘可达。
- 涉及文件：`index.html`、`src/ui/hud/HUDController.js`、可能需要自研 tooltip 组件
- scope：**中**
- 预期收益：比方向 A 更优雅，但休闲玩家 **不会主动 hover** —— reviewer
  原话"鼠标悬停没有完整提示"已经排除了这条路径的有效性（她试过了）。
- 主要风险：需要额外 JS positioning 逻辑；hover-only 对触屏 / 慢读玩家不友好；
  实现量超过 20 分钟 deadline。

### 方向 C: 把红色警告也 pipe 进已有的 `#floatingToastLayer`（锚定光标位置）

- 思路：BuildToolbar 里 `isBlocker` 分支除了写 `buildPreviewVal`，还 emit 一个
  2 秒 float toast（`.build-toast.build-toast--err`，CSS 已存在于 `index.html:123-141`），
  让警告在玩家视线焦点——鼠标周围——显示。
- 涉及文件：`src/ui/tools/BuildToolbar.js` + 1 个 toast 派发 helper
- scope：**小**
- 预期收益：对"click 被 silently 拒绝"场景最直接。但 reviewer 的 #1 问题更多是
  **顶栏 chip 被截断**（她就在看顶栏），toast 是 complement 而不是 substitute。
- 主要风险：触发频率不对（hover 每次重算 preview 都 toast）会变成 spam。

## 3. 选定方案

选 **方向 A**，理由：

1. reviewer 明确 finding #1 是"悬停也没更多提示"——说明她不 hover，所以方向 B
   直接 DOA；
2. 方向 A 完全由"CSS 改值 + 文案人话化"构成，不碰 state / 不碰 simulation，
   side-effect 面最小，不会破坏 865 个现有测试中的任何一个（简单 grep 过，
   没有测试 assert `wh 5/2` 字面值）；
3. 同时命中 reviewer 最刺眼的两条 findings (#1 截断 + #6 分数歧义)，P0 × 2；
4. 20 分钟可落地，符合 deadline；
5. 与 HW06 freeze 一致——纯 polish，零新 mechanic。

方向 C 作为**下一轮候补**（reviewer 在乱点 Quarry 时也被 silent 拒绝过，但
现在 BuildToolbar 已有 ✗ 前缀 + data-kind="error"，优先级降为 P1）。

## 4. Plan 步骤

- [ ] **Step 1**: `index.html:91` — edit — 把
      `.hud-objective { ... max-width: 120px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }` 改成
      `.hud-objective { font-size: 10px; opacity: 0.7; text-align: right;
      max-width: 240px; line-height: 1.25; overflow: hidden;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      word-break: break-word; }`。保留 `title` 属性做完整 tooltip 兜底。

- [ ] **Step 2**: `index.html:99` — edit — `.hud-scenario` 规则里把
      `max-width: 320px; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap;` 改成
      `max-width: 420px; overflow: hidden; display: -webkit-box;
      -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      line-height: 1.25; word-break: break-word;`。

- [ ] **Step 3**: `index.html:105` — edit — `.hud-action` 规则里把
      `max-width: 420px; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap;` 改成
      `max-width: 520px; overflow: hidden; display: -webkit-box;
      -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      line-height: 1.3; word-break: break-word;`。
      （注意：`transition: opacity 0.3s;` 保留；`.flash-action` 动画
      line 143-147 依旧生效。）

- [ ] **Step 4**: `index.html:149` — edit — 在 `#ui.compact .hud-action.flash-action { animation: none; }`
      之后追加一组 compact 兜底：
      ```css
      #ui.compact .hud-objective,
      #ui.compact .hud-scenario,
      #ui.compact .hud-action {
        -webkit-line-clamp: 1; white-space: nowrap;
        text-overflow: ellipsis;
      }
      ```
      这样紧凑模式仍然是单行 + ellipsis，不破坏既有密集布局。
      - depends_on: Step 1, Step 2, Step 3

- [ ] **Step 5**: `src/ui/interpretation/WorldExplain.js:162` — add — 在
      `getScenarioProgressCompact` 之后新增导出函数 `getScenarioProgressCompactCasual(state)`，
      逻辑与现有函数一致，但每行写人话：
      - `routes ${n}/${m}` → `${n} of ${m} supply routes open`
      - `depots ${n}/${m}` → `${n} of ${m} depots reclaimed`
      - `wh ${n}/${m}` → `${n} warehouses built (goal ${m})`
      - `farms ${n}/${m}` → `${n} farms built (goal ${m})`
      - `lumbers ${n}/${m}` → `${n} lumber camps (goal ${m})`
      - `walls ${n}/${m}` → `${n} walls placed (goal ${m})`
      - fallback `"endless · no active objectives"` → `"Endless mode — no pending goals"`
      分隔符从 `"·"` 改成 `"  "`（两空格）便于换行断字。
      不修改旧函数——full profile 保持原样以免击中任何依赖字面值的测试。

- [ ] **Step 6**: `src/ui/hud/HUDController.js` — edit — 在
      `getScenarioProgressCompact` 的调用点（Grep 本文件找到唯一引用处）旁边
      加一个 profile 分支：
      ```js
      const uiProfile = this.state.controls?.uiProfile ?? "casual";
      const compact = uiProfile === "casual"
        ? getScenarioProgressCompactCasual(this.state)
        : getScenarioProgressCompact(this.state);
      ```
      相应的 `import` 声明里追加 `getScenarioProgressCompactCasual`。
      （若 HUDController 没有直接用该函数，跳过；用 Grep 确认位置后再动。）
      - depends_on: Step 5

- [ ] **Step 7**: `test/world-explain.test.js`（若不存在则新建
      `test/world-explain-casual.test.js`）— add — 3 个断言：
      1. `getScenarioProgressCompactCasual` 对 `routes 3/5` 输入返回含
         `"3 of 5 supply routes open"` 的子串；
      2. 无 routes/depots/targets 时返回 `"Endless mode — no pending goals"`；
      3. `getScenarioProgressCompact`（旧函数）对同一输入仍返回
         `"wh 5/2 · farms 4/4"` 字面值（regression guard）。

- [ ] **Step 8**: 本地手测——`npx vite`，触发 `Insufficient resources` 和
      `No stone node on this tile` 警告，确认在桌面 non-compact 模式下
      两行完整显示；切 compact 模式确认仍是单行 ellipsis。
      - depends_on: Step 1-6

## 5. Risks

- **R1**: CSS 改值后 statusBar 高度可能从 ~22px 涨到 ~44px，挤压
  `#storytellerStrip` / panelToggles 布局。缓解：保留 compact-mode 单行 +
  ellipsis 兜底（Step 4）。
- **R2**: `-webkit-line-clamp` 是 `-webkit-` 前缀属性，在 Firefox / Safari 上
  的兼容性差异。项目只打包 Vite dev server，用户目标浏览器未严格定义——
  Chromium / Edge / Safari 14+ / FF 68+ 均支持。若团队要求严格跨浏览器，
  可改用 `max-height: 2.6em` + `overflow: hidden` 做降级（plan 里不列，
  因为 Coder 会察觉）。
- **R3**: 新增 `getScenarioProgressCompactCasual` 可能让 `compact` 字符串
  变长，若别处有代码 `.slice()` 或 `.padEnd()` 假设 40 字符上限——Grep 显示
  只有 HUDController 消费，风险低。
- **R4**: reviewer 还提到 "deaths -60" 无通知——本 plan **不处理**，留给
  01e-innovation 下一轮；obituary flash 已存在但时长 OBITUARY_FLASH_MS 可能
  太短，另开 plan。
- **可能影响的现有测试**:
  - `test/build-toast-feedback.test.js`（Grep 命中的文件，只 assert
    `reasonText` 字段值，不 assert CSS，应安全）
  - `test/` 下所有 assert `wh ` / `farms ` 字面值的测试——Grep 过，无命中。

## 6. 验证方式

- **新增测试**:
  `test/world-explain-casual.test.js`
  - `getScenarioProgressCompactCasual` 给定 `runtime.routes=[x,y,z]`,
    `connectedRoutes=3`, `routesTotal=5` 返回子串 `"3 of 5 supply routes open"`；
  - 空场景返回 `"Endless mode — no pending goals"`；
  - 旧 `getScenarioProgressCompact` 同一输入仍返回 `"routes 3/5 · ..."`。
- **手动验证**:
  1. `npx vite`；
  2. Start Colony（默认 temperate_plains）；
  3. 选 Quarry 工具，点在草地（非石矿节点），看左侧 `buildPreviewVal`
     和顶栏 `statusAction` 是否显示完整句子 "No stone node on this tile.
     Quarries must be sited on a stone deposit." 未被 "..." 截断；
  4. 右上角 `statusObjective` 与 `statusScenarioHeadline` 长文本应折行而非截断；
  5. 顶栏 chip 的 compact-mode 保持单行——按 `C`（或者打开 compact toggle）
     验证；
  6. 打开 HUD 顶栏 compact 字符串应显示 "3 farms built (goal 4)" 而非 "farms 3/4"。
- **benchmark 回归**:
  `scripts/long-horizon-bench.mjs --seed=42 --preset=temperate_plains --days=365`，
  DevIndex 不得低于 **41**（当前 v0.8.1 基线 44，允许 -5% ≈ 41.8）；
  预期 CSS/文案改动对 DevIndex 影响 = 0，仅做 sanity check。

## 7. UNREPRODUCIBLE 标记

不适用——所有现象（截断、分数歧义）都可从代码直接静态确认：

- 截断来源: `index.html:91, 99, 105` 三条 CSS `text-overflow: ellipsis`
  + `white-space: nowrap` + `max-width`；
- 分数格式来源: `src/ui/interpretation/WorldExplain.js:154-161` 的
  `parts.push(\`wh ${n}/${m}\`)` 等模板字符串。

未使用 Playwright 复现，因为两条 CSS 和一条函数字面值已经构成充分证据。
Coder 在 Step 8 做一次真机确认即可。
