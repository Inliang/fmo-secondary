# fmo-secondary

FMO 副屏伴侣 — 单 HTML 零依赖、四象限面板、三主题 Web 控制面板。

基于 [fmo-show](https://github.com/EthanYan6/fmo-show)（作者 [@EthanYan6](https://github.com/EthanYan6)）和 [FmoDeck](https://github.com/wh0am1i/FmoDeck)（作者 [@wh0am1i](https://github.com/wh0am1i)）的二次开发作品。

## 项目定位

- **目标场景**：FMO 设备的副屏/第二显示器，用于实时监控 QSO 状态
- **技术特点**：单 HTML 文件、零外部依赖、直接双击可用
- **协议参考**：FW 接口文档参见 [bg5esn.com/docs](https://bg5esn.com/categories/docs/)

## 架构概览

```
┌──────────────┬──────────────┐
│  左上：       │  右上：        │
│  设备信息     │  服务器列表    │
│  (info-hero) │  (station)    │
├──────────────┼──────────────┤
│  左下：       │  右下：        │
│  Speaking    │  QSO 统计     │
│  Bar         │  + 迷你频谱   │
└──────────────┴──────────────┘
```

### 三路 WebSocket

| 连接 | 端点 | 协议 | 用途 |
|------|------|------|------|
| `/ws` | JSON-RPC | FmoDeck 串行队列 | 设备信息 / 服务器列表 / QSO 查询 |
| `/events` | Event Stream | 推送 | 讲话事件 / QSO 实时更新 |
| `/audio` | PCM 8kHz | 二进制流 | 对讲音频播放 + VU 电平 |

### 三主题

- **Dark**（默认）：战术 HUD 风格，深色背景 + 亮色数字
- **Light**：浅色背景，适用日常浏览
- **E-ink**：高对比度黑白，适应墨水屏副屏

## 功能一览

- **设备信息面板**：呼号大号居中、天线 / 固件版本 / 坐标 / 高度 / 网格
- **服务器列表**：翻页全量加载、点击切换、当前服务器高亮
- **Speaking Bar**：单行紧凑布局，实时显示讲话者呼号 + 方位角 / 距离 / Grid / 服务器名 + HOST/自己/新朋友徽章 + 通联计时
- **QSO 统计**：Top N 统计卡片、删除按钮
- **音频收听**：VU 电平 + 迷你频谱（24 柱真实 FFT，200-3800Hz 对数分频）+ 静音按钮
- **移动端适配**：响应式布局、呼号 / 频谱 / 信息栏自动缩放

## 快速开始

1. 确保电脑与 FMO 设备在同一局域网
2. 双击 `index.html` 打开页面
3. 输入 FMO 设备 IP 和端口（默认 80），点击连接
4. 连接成功后自动加载设备信息、服务器列表和 QSO 数据

## 文件结构

```
fmo-secondary/
├── index.html    # 主页面（四象限布局 + 状态条）
├── app.js        # 核心逻辑（WebSocket / 串行队列 / UI 渲染）
├── style.css     # 样式（三主题 + 响应式）
└── README.md
```

## 参考项目

- [FmoDeck](https://github.com/wh0am1i/FmoDeck) — 战术 HUD 主题，SpeakingBar 单行布局参考
- [FmoLogs](https://github.com/dingle1122/FmoLogs) — 原始 FMO 日志平台
- [fmo-show](https://github.com/EthanYan6/fmo-show) — 墨水屏风格单行紧凑布局参考
- [FMO 文档](https://bg5esn.com/categories/docs/) — 固件接口文档参考
- [FmoLogs Dashboard](https://fmologs.bh5hsj.org/dashboard) — SpeakingBar 设计参考

## 致谢

本项目是基于 fmo-show（作者 [@EthanYan6](https://github.com/EthanYan6)）、FmoDeck（作者 [@wh0am1i](https://github.com/wh0am1i)）的二次开发作品。原项目完整搭建了与 FMO 设备交互的协议实现、日志同步、APRS 相关能力等核心业务逻辑。本仓库在其基础上做界面与交互层的重写，但所有"能用起来"的根基都来自 fmo-show。特此鸣谢 ✨

## 更新日志

### 2026-06-06 (v0.3.11)

**优化 — 替换方向箭头 SVG + 方位角旋转跟随**

- 替换 speaking-arrow SVG 为新版红底白三角图标
- SVG 通过 `transform:rotate(${azimuth}deg)` 跟随实际方位角旋转（北=0°）

**修改文件**：app.js

<details>
<summary>历史日志</summary>

### 2026-06-06 (v0.3.10)

**修复 — 方位角 SVG 方向箭头 + CSS 样式**

- 将 `→` 文本箭头替换为 SVG 方向图标（speaking-arrow class，14×14px，vertical-align: middle）
- 新增 `.speaking-meta .speaking-arrow` CSS 规则

**修改文件**：app.js, style.css

### 2026-06-06 (v0.3.9)

**重构 — Speaking Bar 加入方位角/距离/Grid + 频谱改为真实 FFT**

- Speaking Bar 在呼号后加入 `方位东24° 12km OL63ma` 格式的方位角/距离/梅登海德网格信息
- 迷你频谱从 VU 模拟驱动改为真实 FFT（Radix-2 Cooley-Tukey，1024 点 Hann 窗，200-3800Hz 对数分频 24 柱）
- 无音频时频谱显示基线而非随机噪声

**修改文件**：app.js, style.css

### 2026-06-06 (v0.3.8)

**重构 — Speaking Bar 完全参照 FmoLogs 重做 UI**

- 彻底废弃旧卡片式设计（border + border-radius + card bg），改为 FmoLogs 扁平单行状态条
- 结构：脉冲圆点指示器（发言绿/空闲灰） + 单行文字 + 紧凑 VU 表
- 格式：`正在发言: CALLSIGN 方位东24° 12km OL63ma [HOST] 自己 ✦新朋友 xN [服务器名] elapsed`
- 空闲态：`当前无人发言`（灰色圆点）
- CSS 全部重写：移除 speaker-callsign/speaker-badge/speaker-grid/speaker-server/speaker-extra/idle-text/idle-sub 等旧类，统一为 speaking-indicator / speaking-text / speaking-tag / speaking-count / speaking-elapsed / speaking-meta
- 彻底消除多层嵌套、双层显示、flex-wrap 换行等问题

**修改文件**：index.html, style.css, app.js

<details>
<summary>历史日志</summary>

### 2026-06-06 (v0.3.7)

**修复 — 移除 Speaking Bar 面板 title 消除双层显示**

- 根因：`panel-title "当前通联"`（带 bottom-border）+ `speaking-bar`（带自身 border+背景）各自形成独立视觉层，导致双层显示
- 修复：删除 `panel-title "当前通联"`，speaking-bar 成为面板内最上层元素

**修改文件**：index.html

### 2026-06-06 (v0.3.6)

**修复 — Speaking Bar 双层显示 + 重复调用 _addSpeakingRecord**

- 根因定位：`.speaking-bar` 使用 `flex-wrap: wrap`，在四象限 50% 面板宽度下条目换行形成双层显示
- 修复：`flex-wrap: wrap` → `flex-wrap: nowrap`，强制单行布局；添加 `overflow: hidden` 防止溢出
- 修复 `_processEvent` 中 `speaking_start` / `qso/callsign` 事件处理重复调用 `_addSpeakingRecord`（`showSpeaking()` 内部已调用一次）

**修改文件**：style.css, app.js

### 2026-06-06 (v0.3.5)

**重构 — Speaking Bar 单层布局 + README 优化**

- Speaking Bar 改为单行紧凑布局（参照 FmoDeck/fmo-show）：callsign → 徽章 → 方位角 → 距离 → Grid → 服务器名 → elapsed → VU 表，全部在一行内横向排列
- 删除通联统计文字（"通联 X 次 · 上次 XX"），保留新朋友徽章（1 次通联时显示）
- idle 状态同步改为单行结构：`等待通联... 方位 -- -- km ---- ----`
- CSS 全面重构：`.speaking-bar-content` 改为 `flex-direction: row; flex-wrap: wrap`；移除 `.speaker-row-1` / `.speaker-row-2`；VU 表改为固定宽度内联
- 移动端响应式：允许自动换行，保持紧凑
- README 新增参考项目列表；历史更新日志折叠

**修改文件**：app.js, style.css, index.html, README.md

### 2026-06-06 (v0.3.4)

**修复 — Speaking Bar server name & azimuth resolution**

- 参照 FmoLogs：新增 `_lookupServerName(addressId)` 方法，通过事件 `addressId` 在 `serverList` 中查找服务器名称（name/uid/address 三字段匹配）
- `_processEvent`：`speaking_start` 和 `qso/callsign` 事件 handler 新增 `addressId` → server 映射，不再依赖事件中不存在的 `serverName` 字段
- `showSpeaking`：serverName 兜底链增强：qsoList → serverList 两级 fallback
- `hideSpeaking`：idle 结构对齐 active 状态（双行 + subtitle 占位），消除框体高度跳变
- `renderSpeakingBar`：方位/距离/高度各自独立 `<span>` 输出，不再混杂单行

**修改文件**：app.js, style.css

### 2026-06-06 (v0.3.3)

**修复 — Speaking Bar 两 Bug**

- Bug 1: 「等待通联」与「正在通联」框体大小不一致
  - 修复：`.speaking-bar` min-height 从 90px 调整为 112px，使 idle 文本垂直居中仍与 active 内容区等高
  - idle 状态下隐藏 vu-meter
- Bug 2: 正在通联不显示方位角方向文字、Grid、服务器名称
  - 新增 `_azimuthToDirection()` 方法：将度数转为中文 8 方位（北/东北/东/…）
  - `renderSpeakingBar()`：方位角格式化为 `方位 东24°`、距离 → `距离 12 km`、Grid → 第二行独立显示
  - `showSpeaking()`：事件若缺 grid/distance/azimuth 立即从 QSO 列表推导补全
  - 新增 `.speaker-server` CSS：服务器名显示为 accent 色小标签
  - `_currentSpeaker` 新增 serverName/serverUid 字段

**修改文件**：app.js, style.css

### 2026-06-06 (v0.3.2)

**修复 — SSTV Robot 36 解码完全重写（参照 FmoDeck）**

- 修复 Robot 36 decodeLine 核心 Bug：旧版将每 3 条扫描线当作 Y/U/V（YUV 420）同等距采样，完全不符合 SSTV 规范
- 重写为正确的 Robot 36 时间分段解码：每对扫描线（300ms）分为 sync(9ms)+porch(3ms)+Y[even](88ms)+separator(4.5ms)+porch2(1.5ms)+Cr(44ms) / Y[odd]+Cb
- 新增 1200Hz sync 脉冲检测（滑窗最小距离法），校正行同步时序漂移
- 新增 Hampel 滤波器平滑 sync jitter（窗长 5，MAD×3 阈值），消除孤立野点
- 新增 `_sampleSstvSection`：按时间窗正确切片 freq 序列并 box 平均采样为像素亮度
- 替换 YUV→RGB 为 BT.601 full-range YCbCr→RGB（JPEG/JFIF 标准矩阵系数）
- 新增 `_decodeSstvLinePair` 一行对解码，Cr/Cb 色度水平 2:1 subsampling（ci=x>>1）

**修改文件**：app.js

### 2026-06-06 (v0.3.1)

参照 FmoDeck SSTV 模块重写核心 DSP。

**修复**
- SSTV：修复 FM 解调数学错误（`atan2(0, xy+xy)` 交叉项恒为 0，输出永远 0/±1）
- SSTV：VIS 检测改为在原始 PCM 上做 Goertzel 音调检测，不再在已解调信号上跑
- SSTV：Goertzel 改用任意频率形式，消除 DFT 整数 bin 量化误差
- SSTV：VIS 检测增加完整前导校验（双 leader 1900Hz + break 1200Hz）、start/stop bit 校验、偶校验位校验、噪声底噪 3× 阈值
- SSTV：FM 解调重写为 mixer + Butterworth LPF + analytic signal 瞬时频率估计，新增 5ms LPF 瞬态丢弃
- SSTV：`_extractPixels` 适配正确频率输出（1500-2300Hz → 0-1 线性映射）

### 2026-06-06 (v0.3.0)

参照 FmoLogs（作者 BH5HSJ）

**新增**
- 服务器列表：显示服务器序列号（uid），支持按 uid 搜索
- 状态条：音量调节滑块（AudioContext GainNode 控制）
- QSO 面板：通联日志导出为 .db 文件
- 服务器搜索：支持按 uid 精确定位服务器

**修复**
- 设备信息面板：修复高度不显示（getCordinate 字段兼容 altitude/elevation/height/alt，getAltitude 兜底）

### 2026-06-02 (v0.2.0)

**修复**
- 服务器列表：修复 RESPONSE_ALIASES 匹配固件 subType、fallback 匹配按 type 兜底、`resp.code` 增加 `undefined` 检查
- Speaking Bar：`_deriveStationInfo` 按时间戳取最新 QSO、距离/方位字段名兼容 `dist`/`az`/`bearing`

**优化**
- 加载速度：`fetchAllData` 三组数据并发入队、分页每页 20 条与 FmoDeck 一致

### 2026-06-02 (v0.1.0)

**新增**
- 四象限面板布局（设备信息 / 服务器列表 / Speaking Bar / QSO 统计）
- 三路 WebSocket（`/ws` `/events` `/audio`）
- 三主题（dark / light / e-ink）
- 串行队列请求-响应匹配（FmoDeck 同款协议）
- 设备信息面板 info-hero + info-card
- 服务器列表翻页全量加载
- Speaking Bar 实时讲话者 + 徽章系统 + 通联统计
- 迷你频谱 24 柱语音频段加权
- VU 电平 + 静音按钮
- 移动端响应式布局

**参照项目**
- [FmoDeck](https://github.com/wh0am1i/FmoDeck)：协议参考（串行队列 / RESPONSE_ALIASES / `qso/callsign` 事件）
- [fmo-show](https://github.com/EthanYan6/fmo-show)：界面灵感
- [bg5esn.com](https://bg5esn.com/categories/docs/)：固件接口文档

</details>
