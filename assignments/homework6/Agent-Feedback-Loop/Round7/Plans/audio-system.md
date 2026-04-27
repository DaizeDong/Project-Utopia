---
reviewer_id: P0-5-audio
round: 7
date: 2026-04-26
priority: P0（多位 reviewer 独立提及）
covers_all_feedback: true
feedback_sources: [01b-playability, 02b-casual, 02d-roleplayer]
---

# Plan: Audio System（P0-5）

## 1. 根本问题

**根因**：游戏完全没有初始化 `AudioContext`。没有任何 `.js` 文件引用 Web Audio API。这不是某个功能缺失，而是整个音频系统从未被建立过。

**顶层修复**：新建 `src/audio/AudioSystem.js`，使用 Web Audio API 的 `OscillatorNode` + `GainNode` 合成 5 种基础音效。采用**懒初始化**（在第一次用户交互后才创建 AudioContext，规避浏览器自动播放政策）。

所有音效为纯合成音（无需外部 asset 文件），零资源依赖。

## 2. 完整 Feedback 覆盖

| Feedback | 覆盖 |
|----------|------|
| 01b: "完全没有声音" | Step 1-3 |
| 02b: 无音效导致无成就感 | Step 2（里程碑音效）|
| 02d: 工人死亡无情感重量 | Step 2（死亡音效）|
| 01b: 食物危机无预警 | Step 2（危机脉冲音）|

## 3. 实施步骤

### Step 1 — 新建 `src/audio/AudioSystem.js`

```js
// 懒初始化的合成音频系统，零外部依赖
class AudioSystem {
  #ctx = null;
  #masterGain = null;

  _init() {
    if (this.#ctx) return;
    this.#ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.#masterGain = this.#ctx.createGain();
    this.#masterGain.gain.value = 0.4;
    this.#masterGain.connect(this.#ctx.destination);
  }

  _tone(freq, type, duration, volumeScale = 1, delay = 0) {
    this._init();
    if (this.#ctx.state === 'suspended') this.#ctx.resume();
    const now = this.#ctx.currentTime + delay;
    const osc = this.#ctx.createOscillator();
    const gain = this.#ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(volumeScale, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.#masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  // 建筑放置：短促明亮双音节
  onBuildingPlaced() {
    this._tone(523, 'sine', 0.12);
    this._tone(784, 'sine', 0.12, 0.7, 0.1);
  }

  // 工人死亡：低沉单音淡出
  onWorkerDeath() {
    this._tone(110, 'triangle', 0.8, 0.5);
  }

  // 食物危机脉冲（< 60s）：每 3s 触发一次
  onFoodCritical() {
    this._tone(220, 'square', 0.15, 0.3);
    this._tone(196, 'square', 0.15, 0.3, 0.2);
  }

  // 里程碑达成：上行三音和弦
  onMilestone() {
    this._tone(523, 'sine', 0.3);
    this._tone(659, 'sine', 0.3, 0.8, 0.1);
    this._tone(784, 'sine', 0.4, 0.6, 0.2);
  }

  // 游戏开始：轻微环境提示音
  onGameStart() {
    this._tone(330, 'sine', 0.5, 0.3);
  }
}

export const audioSystem = new AudioSystem();
```

### Step 2 — `src/render/SceneRenderer.js` 或 `GameApp.js`：接线事件

在以下位置调用 audioSystem：

- 建筑放置成功后：`import { audioSystem } from '../audio/AudioSystem.js'; ... audioSystem.onBuildingPlaced();`
- `src/simulation/lifecycle/MortalitySystem.js` 工人死亡记录后：`audioSystem.onWorkerDeath();`
- `src/ui/hud/HUDController.js:#renderRunoutHints` 食物 ETA < 60s 且上次播放 > 3s 前：`audioSystem.onFoodCritical();`
- 里程碑 toast 触发时（搜索 `milestone-toast` 相关 JS）：`audioSystem.onMilestone();`
- 游戏启动（GameApp 初始化完成，地图加载后）：`audioSystem.onGameStart();`

### Step 3 — `index.html`：Settings 面板加音量滑块（可选）

在 Settings 标签页加一行：
```html
<label>Volume <input type="range" id="volumeSlider" min="0" max="1" step="0.1" value="0.4"></label>
```
JS：`document.getElementById('volumeSlider').addEventListener('input', e => audioSystem.setVolume(Number(e.target.value)));`

AudioSystem 加 `setVolume(v) { this.#masterGain.gain.value = v; }`

## 4. 验证

- 放置 Farm → 听到双音节提示音
- 工人死亡 → 听到低沉淡出音
- 食物 ETA < 60s → 约每 3s 有脉冲警告音（不连续）
- 调整 Volume 滑块 → 音量实时变化
- 静音（0）→ 无任何声音
- `node --test test/*.test.js` 全通过（AudioSystem 是浏览器 API，测试环境忽略）
