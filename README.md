---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 4d32f127e120f5be24dadce57b263d70_e5e7f04666e911f1a0095254002afed2
    ReservedCode1: gxUr8F2gZkhY/71zyhz4rjnxLOs7UJO0mrd6A7zJ03JT/lNQS288ZStMEncbYJqAAw+7CNu7tOoOicav4j5SLFkPCO7LyPGtvLJXaxvckr5RF17pb9xia3n6LbZa1LIsrp2SYSiQQUqzkblCMrVcTumOOmFOLzUvkHSgCVbTRtFaOTqpNe06GPYuYic=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 4d32f127e120f5be24dadce57b263d70_e5e7f04666e911f1a0095254002afed2
    ReservedCode2: gxUr8F2gZkhY/71zyhz4rjnxLOs7UJO0mrd6A7zJ03JT/lNQS288ZStMEncbYJqAAw+7CNu7tOoOicav4j5SLFkPCO7LyPGtvLJXaxvckr5RF17pb9xia3n6LbZa1LIsrp2SYSiQQUqzkblCMrVcTumOOmFOLzUvkHSgCVbTRtFaOTqpNe06GPYuYic=
---

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
- **Speaking Bar**：单行紧凑布局，实时显示讲话者呼号 + 方位角 / 距离 / Grid / 服务器名 + HOST/您/新朋友徽章 + 通联计时
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

- [FmoDeck](https://github.com/wh0am1i/FmoDeck) — 战术 HUD 主题，SpeakingBar 单行布局 + SSTV 解码参考
- [FmoLogs](https://github.com/dingle1122/FmoLogs) — 原始 FMO 日志平台
- [fmo-show](https://github.com/EthanYan6/fmo-show) — 墨水屏风格单行紧凑布局参考
- [colaclanth/sstv](https://github.com/colaclanth/sstv) — Python SSTV 解码器，Robot 36 规范与时间分段参考
- [FMO 文档](https://bg5esn.com/categories/docs/) — 固件接口文档参考
- [FmoLogs Dashboard](https://fmologs.bh5hsj.org/dashboard) — SpeakingBar 设计参考

## 致谢

本项目是基于 fmo-show（作者 [@EthanYan6](https://github.com/EthanYan6)）、FmoDeck（作者 [@wh0am1i](https://github.com/wh0am1i)）的二次开发作品。原项目完整搭建了与 FMO 设备交互的协议实现、日志同步、APRS 相关能力等核心业务逻辑。本仓库在其基础上做界面与交互层的重写，但所有"能用起来"的根基都来自 fmo-show。特此鸣谢 ✨

## 更新日志

### 2026-06-13 (v0.3.20)

**功能 — 服务器搜索框 × 清除按钮**

- 搜索框右侧新增 × 清除按钮，仅在输入文字后显示，hover 有圆形背景反馈
- 点击 × 清空搜索文字、恢复完整服务器列表，焦点保持在输入框
- 选择服务器后搜索文字自动清空并收起搜索结果

### 2026-06-13 (v0.3.19)

**优化 — 字体排版精细化 & 品牌一致性增强**

- 字体系统：移除外部 Inter 依赖，改用 FMOC 同款系统字体栈（含 PingFang SC / Microsoft YaHei 中文优化）
- 字号层级修复：面板标题 11→12px，hero 呼号 52→44px（消除字号断层），全局 11px 标注统一升至 12px
- 卡片间距统一：面板 padding 基准 16px，标题与内容区间距 12px
- 品牌色渗透：面板标题左侧 2px accent 竖条装饰，卡片 hover 边框改为 accent 色 + 光晕
- 呼号光晕：hero callsign text-shadow 改用 accent-glow
- 背景网格透明度降低至 0.008，纹理更淡雅
- 入场动画：面板 stagger fadeIn（延迟 50-70ms，0.4s ease-out）

### 2026-06-13 (v0.3.18)

**重构 — 全面 UI 重设计：现代暗色仪表盘（玻璃态 + 卡片系统）**

- CSS 变量系统全面增强：背景色 / 文字色 / 强调色 / 圆角 / 阴影 / 间距多层级体系
- 面板容器：玻璃态效果（`backdrop-filter: blur`），透明背景 + 柔和边框 + 微网格背景纹理
- 状态条：玻璃态精简设计，在线状态圆点带 `box-shadow` 发光
- Speaking Bar：卡片式独立容器，idle 柔和暗色 / speaking 强调色光晕边框，过渡动画 `0.3s ease`
- 服务器列表：独立卡片项，hover 微缩放（`scale(1.01)`），激活项光晕 + 强调色边框
- Recent Speakers：紧凑卡片，hover 上浮（`translateY(-1px)`），发言者绿色左边框 + 光晕，自身蓝色左边框
- 统计卡片：hover 微上浮，数值文字带发光（`text-shadow`）
- QSO 列表：圆角行，hover 背景变化
- 设置面板 / 功能菜单 / SSTV 面板：统一玻璃态 + 模糊背景
- 颜色体系重构：暗色主题改用深蓝紫调（`#0a0e17` 底色，青蓝 `#00b4d8` 强调色系）
- 字体栈升级：Inter + JetBrains Mono（CSS 标准 `font-family` 声明，无需外部引入）
- 所有可交互元素统一 `0.3s ease` 过渡

**修改文件**：style.css（723 行新增 / 411 行删除）

### 2026-06-13 (v0.3.17)

**修复 — SSTV 解码器无法识别网页音频信号**

- FM 解调器重构：将 IQ 频移 + 二阶 biquad 低通方案替换为 **Hilbert 变换 FIR (31-tap Blackman window)** 直接解析信号方案，参照 PhosphorSSTV 实现
  - 消除 3800Hz 镜像污染（biquad 阻带抑制不足 → 噪声混入解调输出）
  - I/Q 通道群延迟对齐（15 samples），消除相位失配导致的频率估计偏移
  - FIR 系数缓存避免重复计算
- VIS 检测鲁棒性提升：能量比阈值从 3x 放宽至 2x，新增环境噪声地板（400Hz）估计
  - 前置长度校验（< 610ms 直接拒绝，避免缓冲区不足误检）
  - 比特值判定加入 2x 主导比要求，防止弱信号误读
- 同步脉冲检测改进：容差从 ±200 Hz 收紧至 ±100 Hz（PhosphorSSTV 参考 ±80 Hz）
  - 新增下降沿检测（sync 前 2ms 频率 >1600 Hz），惩罚不具真过渡的候选
  - 跳过 FM 解调器前 1ms 初始化暂态
- 亮度通道去加重：新增 `_deEmphasisLuma`（一阶递归低通，τ≈300µs，k=0.659），匹配 SSTV 发射预加重
- 时序修复：`_sstvT0` 使用 `recentTotal` 快照避免 `totalWritten` 竞态
- AudioContext autoplay：`initAudioCtx` 注册 click/keydown/touchstart 事件自动 `resume()`
- 移除废弃函数：`_toAnalytic`、`_applyBiquad`、`_instantFreq`

**修改文件**：app.js, README.md

### 2026-06-09 (v0.3.16)

**修复 — Recent Speakers 呼号字体 + 自我识别**

- Recent Speakers 呼号字体与 Speaking Bar 对齐：桌面端 1.5rem → 1.125rem（18px），移动端 1.3rem → 0.875rem（14px）
- 修复自我识别：`myCallsign` 已获取但从未用于 Recent Speakers；新增 `isSelf` 比对逻辑，匹配时添加 `is-self` CSS 类 + "您" 标签
- Speaking Bar "自己"标签统一改为"您"（与 FmoLogs 风格一致）
- 新增 CSS：`.recent-item.is-self strong { color: var(--accent) }` / `.self-tag { font-size: 0.7em; font-weight: 500 }`

**修改文件**：style.css, app.js, README.md

### 2026-06-09 (v0.3.15)

**优化 — Recent Speakers 区域放大（参照 FmoLogs SpeakingHistoryModal）**

- `.recent-speakers` max-height：180px → 200px
- `.recent-item`：gap 8px→10px，padding 4px 8px→6px 10px
- `.recent-index-bg` font-size：36px → 48px（桌面端），移动端 768px 下 36px → 38px
- `.recent-callsign-line strong` font-size：1.2rem → 1.5rem（参照 FmoLogs 1.6rem，约 1.45x speaking bar）
- `.recent-main > span` font-size：0.8rem → 1rem
- `.recent-count` font-size：0.85rem → 1rem
- `.recent-speakers:empty::after` font-size：0.85rem → 1rem
- 移动端 768px：`strong` 1.3rem / `span` 0.9rem / `count` 0.9rem / `empty` 0.9rem

**修改文件**：style.css

<details>
<summary>历史日志</summary>

### 2026-06-09 (v0.3.14)

**修复 — SSTV Robot 36 无法接收信号**

- 根因：`totalScanLines` 配置为 36，实际 Robot 36 为 240 条扫描线（36 秒）；导致解码器在 5.4 秒后即停止并触发超时重置
- 修复 `ROBOT36_MODE.totalScanLines`：36 → 240
- 修复 `_sstvForceStart`：`_sstvT0` 回退量从 5 秒改为 2.5 秒，确保在 3 秒环形缓冲区容量内
- 参照 [colaclanth/sstv](https://github.com/colaclanth/sstv) Robot 36 规范（LINE_COUNT=240, LINE_TIME=150ms）

**修改文件**：app.js, README.md

<details>
<summary>历史日志</summary>

### 2026-06-06 (v0.3.13)

**修复 — 服务器列表无法加载**

- v0.3.12 遗漏了 `_serverLatency` / `_serverLatencyPending` 字段的初始化声明，导致 `renderServerList()` 中 `TypeError: Cannot read properties of undefined`
- 在 App 对象 SSTV 段补充 `_serverLatency: {}` / `_serverLatencyPending: {}`

**修改文件**：app.js

<details>
<summary>历史日志</summary>

### 2026-06-06 (v0.3.12)

**新增 — Speaking Bar 网格地名反查 + 服务器延迟显示**

- Speaking Bar 中梅登海德网格（如 OL63ma）替换为通过 OSM Nominatim 反查得到的完整省/市/区地名
- 服务器列表每项末尾"--在线"后显示 WebSocket 延迟（临时连接测时，3s 超时，host 无则显示 ...）
- 新增 `_probeServerLatency(s)` / `_probeAllServerLatency()` 方法
- 新增 `_serverLatency` / `_serverLatencyPending` 缓存字段防止并发重复测量

**修改文件**：app.js, style.css

<details>
<summary>历史日志</summary>

### 2026-06-06 (v0.3.11)

**优化 — 替换方向箭头 SVG + 方位角旋转跟随**

- 替换 speaking-arrow SVG 为新版红底白三角图标
- SVG 通过 `transform:rotate(${azimuth}deg)` 跟随实际方位角旋转（北=0°）

**修改文件**：app.js

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
- 格式：`正在发言: CALLSIGN 方位东24° 12km OL63ma [HOST] 您 ✦新朋友 xN [服务器名] elapsed`
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

### 2026-06-09 (v0.3.1)

参照 FmoLogs（作者 BH5HSJ）

**优化**
- Speaking Bar：放大 idle 状态卡片（indicator 14→16px、字体 16→18px、strong 15→16px、gap 0.6→0.75rem），移动端同步放大

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
*（内容由AI生成，仅供参考）*
