# 渲染与用户界面系统 (Rendering & UI Systems)

**版本**: v0.8.2 | **日期**: 2026-04-24

全面文档覆盖 Project Utopia 的 Three.js 场景架构、瓷砖网格、战争迷雾层、压力透镜、地形覆盖、HUD 系统与侧边栏面板。

## 1. Three.js 场景架构

### 摄像机配置
- 投影: 正交投影 (高纵横比感知)
- 位置: Y=120 (俯视图)
- 缩放范围: 0.55 ~ 3.2
- 控制: OrbitControls (中键/右键平移, 滚轮缩放)

### 渲染顺序 (RENDER_ORDER)
- 0: TILE_BASE (瓷砖底层网格)
- 6: TILE_BORDER (网格边界线)
- 12: TILE_ICON (瓷砖类型图标)
- 20: ENTITY_MODEL (3D 模型)
- 24: ENTITY_SPRITE (2D 精灵)
- 30: DEBUG_PATH (路径可视化)
- 34: PRESSURE_LENS (标记)
- 36: TILE_OVERLAY (地形覆盖)
- 38: SELECTION_RING (最高优先级)

### 光照设置
- 环境光 + 半球光 + 定向光(太阳) + 补光
- 阴影贴图: 1536x1536 或 1024x1024 (低内存)
- ACESFilmic 色调映射, exposure=1.28

## 2. 瓷砖渲染系统

### InstancedMesh 池
- 每个瓷砖类型一个 InstancedMesh
- 动态矩阵 (THREE.DynamicDrawUsage)
- 总容量 = 网格宽 x 高

### 瓷砖颜色映射表
| 类型 | 十六进制 | 纹理 | 粗糙度 |
|-----|--------|------|-------|
| GRASS | 0xa8d98b | grass | 0.97 |
| ROAD | 0xdfc7a7 | road | 0.94 |
| FARM | 0xe4cb72 | plants | 0.95 |
| WAREHOUSE | 0xd59f74 | structure | 0.90 |
| WALL | 0xb6c1cd | wall | 0.88 |
| WATER | 0x86c8f8 | grass | 0.66 |

## 3. 战争迷雾 (FogOverlay)

### DataTexture 实现
- 文件: src/render/FogOverlay.js
- 分辨率: 96x72 (网格尺寸)
- 格式: Uint8Array (RED_FORMAT, UnsignedByteType)
- 滤波: THREE.LinearFilter (GPU双线性插值)
- 配置: flipY=true, ClampToEdgeWrapping

### 可见性值
- 0: HIDDEN (alpha=0.75, 深灰, 完全遮挡)
- 1: EXPLORED (alpha=0.35, 浅灰, 已探索)
- 2: VISIBLE (discard, 完全透明)

### Shader 片段着色器
渲染顺序: 42 (高于所有实体)
depthTest: false, depthWrite: false, transparent: true
位置 Y: 0.045 (避免z-fighting)
edgeSoftness: 0.15 (1瓷砖柔和边界)

## 4. 压力透镜 (PressureLens)

### 标记类型与样式
| 类型 | 圆环 | 填充 | 优先级 | 说明 |
|-----|------|------|--------|------|
| route | 0xffa75a | 0xffe0b8 | 120 | 断开路线 |
| depot | 0x71d9ff | 0xc8f4ff | 108 | 准备仓库 |
| event | 0xff9d80 | 0xffdccb | 96 | 活跃事件 |
| weather | 0x72b9ff | 0xd0e8ff | 84 | 天气灾害 |
| traffic | 0xffcd6c | 0xffefc5 | 70 | 交通拥堵 |
| ecology | 0x8ed66f | 0xd8efb7 | 64 | 野生动物 |
| heat_surplus | 0xff5a48 | 0xff9180 | 118 | 物资过剩(红) |
| heat_starved | 0x4aa8ff | 0x9fd0ff | 116 | 物资缺乏(蓝) |

### 热力透镜 (v0.8.0 Phase 7.C)
- 红标记: 原始生产者 + 相邻饱和仓库
- 蓝标记: 处理建筑输入为空或仓库利用率<20%
- 灰标记: 健康瓷砖(默认不渲染)

### 标记预算
- 压力透镜: 最多24个
- 热力透镜: 最多48个
- 按优先级和权重排序

## 5. 地形覆盖 (TerrainLens)

### 覆盖层模式 (T键切换)
null → fertility → elevation → connectivity → nodeDepletion → null

### 工具自动映射
- farm, herb_garden → fertility
- lumber, clinic → nodeDepletion
- quarry, wall → elevation
- warehouse, road → connectivity
- select → null

### 覆盖层配色
| 模式 | 颜色范围 | 含义 |
|-----|--------|------|
| fertility | 棕→绿 | 肥沃度% |
| elevation | 蓝→棕→白 | 高度值 |
| connectivity | 红→黄→绿 | 连通性% |
| nodeDepletion | 绿→黄→红 | 消耗% |

## 6. 瓦片信息提示

### 工具感知上下文
| 工具 | 标题示例 | 属性 |
|-----|--------|------|
| farm | Farm Site - fertility: 78.5% | 肥沃度 |
| warehouse | Warehouse Site - connectivity: 92.1% | 连通性 |
| quarry | Quarry Site - elevation: 45.3m | 高度 |
| select | GRASS / ROAD | 类型 |

提示内容: 位置, 海拔, 湿度%, 建筑信息

## 7. HUD 架构 (HUDController)

### 状态栏 (32px高, 顶部固定)
1. 资源 (食物, 木材, 石头, 草本) + 进度条
2. 工人计数
3. 存活时间和分数
4. 场景目标
5. AI芯片
6. 故事讲述者条
7. 操作消息

### 资源速率徽章
- 计算周期: 3秒
- 单位: /分钟
- 格式: "▲ +42.3/min" 或 "▼ -15.6/min"

### 讣告闪烁 (8秒)
显示: "Name (backstory) died of reason at (x,z)"
然后回到: "N (starve X / pred Y)"

### 故事讲述者条
徽章: WHISPER | DIRECTOR | DRIFT
状态: llm-live | llm-stale | fallback-degraded | fallback-healthy
内容: focusText + summaryText + beatText
节流: 2.5秒dwell

### 殖民地健康卡
[THRIVING] Day 5 | Food: +12/min | 8 idle | Threat: 15%
状态: threat<20% (thriving) / <50% (stable) / <70% (struggling) / >=70% (crisis)

## 8. 侧边栏面板

### 4个选项卡
| 面板 | 内容 |
|-----|------|
| Build | 工具网格, 成本, 规则 |
| Colony | 健康卡, 故事讲述者, 资源 |
| Debug | AI决策, 交换, 性能 |
| Settings | 渲染选项, 摄像机, 地图 |

## 9. AI调试面板

### AIDecisionPanel
- 因果链(证据)
- 环境指令(天气, 张力, 焦点)
- 组策略(workers/traders/herbivores/etc)
- 可折叠详情, 记住打开状态

### AIExchangePanel
- 最新交换(Policy/Environment)
- 完整提示(系统+用户)
- 原始输出
- 解析前/保护后
- 错误日志(最后5个)

### AI Debug按钮
点击时: 打开侧边栏 + 切换到Debug选项卡

## 10. 键盘快捷键

### 完整列表
| 快捷键 | 操作 | 场景 |
|-------|-----|------|
| 1-0/-/= | 工具选择 | Active |
| Space | 暂停/继续 | Active |
| Esc | 清除选择 | 任何 |
| T | 地形覆盖切换 | Active |
| L | 热力透镜切换 | Active |
| Home | 重置摄像机 | Active |
| Ctrl+Z | 撤销 | Active |
| Ctrl+Y | 重做 | Active |

### 工具映射
- Digit1: road
- Digit2: farm
- Digit3: lumber
- Digit4: warehouse
- Digit5: wall
- Digit6: bridge
- Digit7: erase
- Digit8: quarry
- Digit9: herb_garden
- Digit0: kitchen
- Minus: smithy
- Equal: clinic

---

完整参考 - Project Utopia v0.8.2 渲染与UI系统
