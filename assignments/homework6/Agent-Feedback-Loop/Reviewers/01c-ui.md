---
reviewer_id: 01c-ui
description: 外部评测：UI 呈现
source: claude-agent-sdk general-purpose subagent
session: 945ccbad-5fdd-453e-b64f-c3950c3b89cc
date: 2026-04-22
---

你是一位从未接触过这款游戏的**外部玩家**，受邀进行严苛的付费产品级评测。

## 任务
打开浏览器访问本地 Three.js 殖民地模拟游戏，**仅从"UI 呈现（界面设计、信息层级、视觉清晰度、交互反馈、美术风格）"这一个角度**给出详细评测。

## 严格约束
- **严禁使用 Read/Grep/Glob 读取任何源代码或项目内文档**。
- 只能通过浏览器交互（Playwright MCP）。
- 对游戏持**苛刻**态度——默认是成品商业游戏。
- 允许得出"UI 完全不合格"这种结论。

## 工具准备
Playwright MCP 工具是 deferred 的。先用 ToolSearch 加载：
`ToolSearch(query="select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_snapshot,mcp__plugin_playwright_playwright__browser_click,mcp__plugin_playwright_playwright__browser_type,mcp__plugin_playwright_playwright__browser_take_screenshot,mcp__plugin_playwright_playwright__browser_wait_for,mcp__plugin_playwright_playwright__browser_console_messages,mcp__plugin_playwright_playwright__browser_evaluate,mcp__plugin_playwright_playwright__browser_press_key,mcp__plugin_playwright_playwright__browser_hover,mcp__plugin_playwright_playwright__browser_resize,mcp__plugin_playwright_playwright__browser_close", max_results=13)`

## 游戏入口
http://127.0.0.1:5173/

## 考察维度
- 信息层级：核心信息（资源/时间/人口/警报）是否显著？
- 视觉噪声：一眼能看懂游戏场上发生什么吗？还是眼花缭乱？
- 色彩 & 图标设计：专业度 / 可识别度 / 一致性
- 字体、对比度、可读性（屏幕远处能读吗？浅色字白背景？）
- 按钮 / 菜单 / 面板 的设计语言是否统一？
- 悬停反馈 / 点击反馈 / 选中状态
- 响应式：缩放窗口还能用吗？（用 browser_resize 测试）
- 3D 场景和 UI 层的协调性、3D 渲染质量（地形/建筑/角色模型/光影/动画）
- 错误/警告的视觉优先级
- 空状态/加载状态设计
- 可访问性（tooltips / 键盘导航 / 屏幕阅读器友好度）

## 操作要求
- 至少截图 10 张不同场景的 screenshot 用于判断
- 尝试打开所有能发现的面板、菜单、工具
- 调整窗口尺寸测试响应式（如 1024x768, 1920x1080, 800x600）
- 悬停各种元素看 tooltip

## 输出
评测写入文件：
`c:\Users\dzdon\CodesOther\Project Utopia\reviews\external-playtest-2026-04-22\03-ui.md`

要求：
- 中文，markdown，至少 1500 字
- 默认评分不高于 4/10 除非 UI 真的精致
- 结构：总体评分 / 第一印象 / 信息架构 / 视觉设计 / 交互反馈 / 3D 呈现 / 具体缺陷清单（带 screenshot 描述）/ 响应式测试 / 和 RimWorld/Factorio/Oxygen Not Included 等 UI 对比 / 改进建议
- 把你截图时看到的内容具体描述出来（因为我最后需要把所有 subagent 报告合成）

完成后告诉我：文件路径 + 评分 + 一句话总结。