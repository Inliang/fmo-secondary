# fmo-secondary

FMO 副屏伴侣 — 单 HTML 零依赖、四象限面板、三主题 Web 控制面板。

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=flat-square&logo=socket.io&logoColor=white)
![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square)

基于 [fmo-show](https://github.com/EthanYan6/fmo-show)（作者 [@EthanYan6](https://github.com/EthanYan6)）和 [FmoDeck](https://github.com/wh0am1i/FmoDeck)（作者 [@wh0am1i](https://github.com/wh0am1i)）的二次开发作品。

---

## 项目定位

- **目标场景**：FMO 设备的副屏 / 第二显示器，用于实时监控 QSO 状态
- **技术特点**：单 HTML 文件、零外部依赖、直接双击可用
- **协议参考**：FW 接口文档参见 [bg5esn.com/docs](https://bg5esn.com/categories/docs/)
- **设计参考**：[UI UX Pro Max](https://ui-ux-pro-max-skill.nextlevelbuilder.io/) — 设计智能数据库；[awesome-design-md](https://github.com/VoltAgent/awesome-design-md) — 品牌设计系统 DESIGN.md 集合；[Dribbble](https://dribbble.com/) — UI 灵感社区；[React Bits](https://reactbits.dev/) — Web 动效组件库

---

## 架构概览

```
+----------------+----------------+
|  左上           |  右上           |
|  设备信息       |  服务器列表      |
|  (info-hero)   |  (station)     |
+----------------+----------------+
|  左下           |  右下           |
|  Speaking Bar  |  QSO 列表       |
|  + 最近发言     |  + 迷你频谱     |
+----------------+----------------+
```

### 三路 WebSocket

| 连接 | 端点 | 协议 | 用途 |
|------|------|------|------|
| `/ws` | JSON-RPC | FmoDeck 串行队列 | 设备信息 / 服务器列表 / QSO 查询 |
| `/events` | Event Stream | 推送 | 讲话事件 / QSO 实时更新 |
| `/audio` | PCM 8kHz | 二进制流 | 对讲音频播放 + VU 电平 |

### 三主题

| 主题 | 风格 | 适用场景 |
|------|------|----------|
| **Dark**（默认） | 战术 HUD，深色背景 + 亮色数字 | 日常监控 |
| **Light** | 浅色背景 | 日常浏览 |
| **E-ink** | 高对比度黑白 | 墨水屏副屏 |

---

## 功能一览

### 设备信息面板

- 呼号大号居中显示，带光晕效果
- 天线 / 固件版本 / 坐标 / 高度 / 梅登海德网格

### 服务器列表

- 翻页全量加载，支持按 UID 搜索
- 点击切换服务器，当前选中项高亮
- WebSocket 延迟测时显示

### Speaking Bar

- 单行紧凑布局，实时显示发言者信息
- 方位角（含方向图标旋转跟随）/ 距离 / Grid / 服务器名
- HOST / 您 / 新朋友徽章 + 通联计时
- 梅登海德网格自动反查省市区地名
- Recent Speakers 历史发言者记录

### QSO 统计

- Top N 统计卡片展示
- 通联日志导出
- 删除按钮管理

### 音频收听

- VU 电平实时显示
- 迷你频谱：24 柱真实 FFT（1024 点 Hann 窗，200-3800Hz 对数分频）
- 静音按钮 + 音量调节滑块（AudioContext GainNode）

### 移动端适配

- 响应式布局，呼号 / 频谱 / 信息栏自动缩放

---

## 快速开始

1. 确保电脑与 FMO 设备在同一局域网
2. 双击 `index.html` 打开页面
3. 输入 FMO 设备 IP 和端口（默认 `80`），点击连接
4. 连接成功后自动加载设备信息、服务器列表和 QSO 数据

---

## 文件结构

```
fmo-secondary/
├── index.html       # 主页面（四象限布局 + 状态条）
├── app.js           # 核心逻辑（WebSocket / 串行队列 / UI 渲染）
├── style.css        # 样式（三主题 + 响应式）
├── ARCHITECTURE.md  # 架构设计文档
├── PROTOCOL.md      # WebSocket 协议映射
├── UI_DESIGN.md     # UI/UX 设计规范
└── README.md
```

---

## 参考项目

- [FmoDeck](https://github.com/wh0am1i/FmoDeck) — 战术 HUD 主题，SpeakingBar 单行布局 + SSTV 解码参考
- [FmoLogs](https://github.com/dingle1122/FmoLogs) — 原始 FMO 日志平台
- [fmo-show](https://github.com/EthanYan6/fmo-show) — 墨水屏风格单行紧凑布局参考
- [colaclanth/sstv](https://github.com/colaclanth/sstv) — Python SSTV 解码器，Robot 36 规范与时间分段参考
- [FMO 文档](https://bg5esn.com/categories/docs/) — 固件接口文档参考
- [FmoLogs Dashboard](https://fmologs.bh5hsj.org/dashboard) — SpeakingBar 设计参考

---

## 致谢

本项目是基于 fmo-show（作者 [@EthanYan6](https://github.com/EthanYan6)）、FmoDeck（作者 [@wh0am1i](https://github.com/wh0am1i)）的二次开发作品。原项目完整搭建了与 FMO 设备交互的协议实现、日志同步、APRS 相关能力等核心业务逻辑。本仓库在其基础上做界面与交互层的重写，但所有"能用起来"的根基都来自 fmo-show。特此鸣谢。

---

## 更新日志

### 2026-06-20 (v0.3.35)

梅登海德网格链接回退为 map.fmo.net.cn，使用 FMO 后台返回的 grid 字段

**修改**
- `.recent-grid` 链接改回 `https://map.fmo.net.cn/?grid=<grid>`，参数使用 FMO 后台 speaking/station 数据中的原始梅登海德网格值
- title 恢复为「在地图上查看 <grid>」

**修改文件**：app.js

### 2026-06-20 (v0.3.34)

梅登海德网格链接改用呼号跳转 aprs.fi

**修改**
- `.recent-grid`：显示文本保持为梅登海德网格坐标（如 OL63ma），但 `href` 改为 `https://aprs.fi/#!call=<callsign>`，title 更新为「在 aprs.fi 上查看 <callsign>」

**修改文件**：app.js

### 2026-06-20 (v0.3.33)

梅登海德网格链接目标切换为 aprs.fi

**修改**
- `.recent-grid` 链接目标从 `https://map.fmo.net.cn/?grid=<locator>` 改为 `https://aprs.fi/#!call=<locator>`

**修改文件**：app.js

### 2026-06-20 (v0.3.32)

最近发言面板加入梅登海德网格，点击跳转 APRS 地图

**新增**
- `.recent-grid`：recent-item 新增梅登海德网格标签，显示呼号对应的 Grid Locator（如 OL63ma）
- 网格链接：点击 `.recent-grid` 跳转 `https://map.fmo.net.cn/?grid=...` 查看 APRS 位置
- 网格数据来源：优先从 `_speakingHistory` 的 `grid` 字段提取，`_historyEvents` 兼容 `grid` 字段

**样式**
- `.recent-grid`：等宽字体 13px、accent 色系边框胶囊、hover 发光 + 背景高亮、active 缩放反馈
- `.recent-item.is-speaking .recent-grid`：正在发言状态下网格变绿色系（`var(--success)` + `var(--success-glow)` 边框）

**修改文件**：style.css、app.js

### 2026-06-20 (v0.3.31)

面板标题 accent 竖线加粗发光

**优化**
- `.panel-title::before`：竖线宽度 2px→3px，增加 `box-shadow: 0 0 6px var(--accent-glow)` 发光效果，圆角 1px→2px，上下边距微调更贴边

**修改文件**：style.css

<details>
<summary>历史版本</summary>

### 2026-06-20 (v0.3.30)

深度 UI/UX 审查 — 颜色一致性修复、字号层级统一、间距对齐、交互状态补全、无障碍优化

**修复 — 颜色一致性**
- 清除全部 `rgba(0, 180, 216, ...)` 青蓝色残留，统一替换为墨绿色系 `rgba(0, 214, 143, ...)`
- 涉及选择器：.panel:hover / .info-card:hover / .server-search:focus / .server-item:hover / .qso-item:hover / .speaking-bar speaking 态 / scrollbar-thumb:hover / .settings-field:focus / SSTV signal-segment

**优化 — 字号层级统一**
- recent-speakers 全部 rem 单位转 px：callsign strong 16px / main span 14px / count 14px / self-tag 11px
- 响应式 768px 内对应 rem 同步转换

**修复 — 间距与对齐**
- Grid 布局内冗余 margin 清理：.server-item-uid / .server-item-check / .qso-logid / .qso-time / .server-item-latency 删除多余 margin-right/margin-left

**新增 — 交互状态补全**
- .server-item / .qso-item / .recent-item / .export-btn / .btn 增加 `:focus-visible` outline 样式（键盘导航可感知）
- .server-item / .qso-item / .recent-item / .export-btn 增加 `:active` 按压缩放反馈

**优化 — 空状态**
- 服务器列表空状态颜色提亮至 `--text-secondary`
- QSO 通联列表空状态从内联 style 迁移至 `.qso-list-empty` 样式类，与 server-list-empty 保持一致

**新增 — 无障碍**
- `prefers-reduced-motion: reduce` 媒体查询，关闭全部动效

**优化 — 响应式**
- 768px 断点追加 .qso-item / .server-item / .panel-title / .export-btn 字号与间距适配

**重构 — 色值语义**
- 新增 `--speaking-indicator` / `--speaking-indicator-glow` CSS 变量
- .speaking-indicator.speaking 改用语义变量替代原 `var(--success)` 引用

**修改文件**：style.css, index.html

<details>
<summary>历史版本</summary>

### 2026-06-20 (v0.3.29)

QSO 日志导出标准 ADIF 格式 + QRZ.com 兼容修复

**功能 — QSO 导出 ADIF (.adi) 格式**
- 导出格式从 JSON `.db` 替换为标准 ADIF v3.1.4 `.adi` 文件，兼容 qrz.com 直接导入
- 字段映射：CALL / QSO_DATE / TIME_ON / GRIDSQUARE / MODE / BAND / FREQ / RST_SENT / RST_RCVD / OPERATOR / COMMENT
- 新增 `_parseTimestamp()` 方法：兼容 Unix 秒、Unix 毫秒、ISO 字符串三种时间戳格式
- 新增 `_freqToBand()` 方法：自动频率→波段映射（2200m ~ 3cm 全业余波段覆盖）
- ADIF 头部标准化：`ADIF_VER` + `PROGRAMID` + `EOH`

**优化 — 四象限样式与动画统一**
- 右下 QSO 列表静态样式完全对齐右上服务器列表（字号 16px / grid 布局 / hover 渐变光晕）
- 右上服务器列表获 QSO slide-in 入场动画
- 两象限动画 GPU 加速：`will-change: transform` + `translateZ(0)` + spring 缓动曲线
- 三象限滚动条统一为墨绿极简细条（6px），默认透明，hover 浮现

- ADIF 字段长度修复：所有字符串字段改用 `TextEncoder` 计算 UTF-8 字节数，解决中文 COMMENT 长度错位导致 QRZ 解析失败
- QSO 面板标题栏对齐服务器列表样式：左侧 accent 竖线 + 导出按钮文字改"ADI"
- Git 推送偶发 SSL 失败时重试

**修改文件**：app.js, style.css, index.html

### 2026-06-19 (v0.3.28)

四个象限面板 overflow 裁剪修复 + 服务器列表条目内容溢出截断

**修复 — overflow 遮挡优化**
- `.panel` overflow: hidden → visible（四个象限面板不再被边界裁剪）
- `.panel-content` overflow-y: auto → visible（子列表自带滚动，面板层不重复裁剪）
- `.sstv-body` / `.sstv-sidebar` / `.sstv-panel` overflow 统一为 visible（SSTV 下拉选择器不再被遮挡）

**修复 — 服务器列表条目右侧溢出**
- `.server-item-name` 新增 overflow:hidden / text-overflow:ellipsis / white-space:nowrap + flex:1 / min-width:0（长名称自动截断）
- `.server-item-uid` / 右侧 count+latency+check 区域设 flex-shrink:0（防止被压缩）
- `.server-item-uid` 11→14px、`.server-item-count` 12→14px、`.server-item-latency` 11→13px（与 v0.3.27 规格对齐，此前遗漏）

**修改文件**：style.css




### 2026-06-19 (v0.3.27)

参照设计参考站点（UI UX Pro Max / awesome-design-md / Dribbble / React Bits），以左下象限为基准统一全局字号层级

**优化 — 全局字号统一放大**
- 服务器列表：名称 13→16px，uid 11→14px，count 12→14px，latency 11→13px，check 10→15px，padding 同步增大
- 服务器搜索框：13→14px
- QSO 列表：条目 13→14px，logid/grid/time 11-12→13px，padding 10px 12px→10px 14px
- 状态栏：status-text / server-label / time / ip 等 12→13px，server 名称 13→14px
- 面板：panel-title 12→13px，info-card-label 12→13px，info-card-value 15→16px
- Speaking Bar：speaking-text 16→18px，strong 17→19px，tag/meta/count/elapsed 11-12→13px，distance 13→14px，padding 16→18px
- 最近发言：callsign 1.05→1.1rem，main/count 0.9→0.95rem，self-tag 0.65→0.7em，recent-item padding 7px 12px→8px 14px
- SSTV 弹窗：status/mode-h4/select/force-btn/hint/history-h4/history-empty 10-12→12-13px
- 空态文字：server-list-empty 13→14px

**修改文件**：style.css

### 2026-06-19 (v0.3.26)

暗色主题墨绿色调切换 + 历史日志折叠 + 设计参考链接

**优化 — 暗色主题切换为墨绿色调 (NVIDIA / VoltAgent)**
- 主强调色青蓝 #00b4d8 → 深翡翠绿 #00d68f，accent-light → #3de6a5
- 背景底色注入绿冷调：bg-deepest #03060a→#010a06、bg-body #060a14→#040f0d
- success / success-glow 升级为 #00e676 亮绿
- 所有 accent 系变量（glow / ring / border / shadow / glass-inner-glow / glass-bg / bg-card-active）同步切换绿调
- body::after ambient 径向光晕双椭圆渐变同步调为绿色调 (rgba(0,214,143) / rgba(61,230,165))
- accent-warm 琥珀金 #f59e0b 保留作为次级强调色，light / eink 主题不变

**维护 — README 优化**
- 版本日志折叠：v0.3.24 及更早版本使用 `details`/`summary` 折叠为「历史版本」
- 项目定位区新增设计参考链接：[UI UX Pro Max](https://ui-ux-pro-max-skill.nextlevelbuilder.io/) + [awesome-design-md](https://github.com/VoltAgent/awesome-design-md)

**修改文件**：style.css, README.md

### 2026-06-18 (v0.3.25)

参考 awesome-design-md (SpaceX / Linear / NVIDIA / VoltAgent / BMW M) 设计系统 + UI UX Pro Max 精修

**优化 — 色彩体系 + 动效 + 排版精修**
- 新增暖色次级强调色系 `--accent-warm` / `--accent-warm-glow`（#f59e0b 琥珀金），三主题同步声明
- 统计卡片 `.stat-value` 切换为暖色调强调，hover 增加暖色外发光；`.info-card-grid` 网格数值同步应用暖色 + text-shadow
- QSO 列表条目精修：gap 10→12px / padding 8→10px，hover 渐变背景 + 微妙右移 (3px) + accent 外发光边框，呼号增加 0.02em 字距 + hover 变 accent-light
- Speaking Bar 状态过渡增强：speaking 态增加渐变背景呼吸感 (scale 1.003) + 更大光晕 (24px) + 更深 inset
- 服务器列表项 hover 增加 accent 侧向发光 box-shadow；搜索框 focus 光晕改为双环 (ring + outer glow)
- 状态指示器 `ripple-connected` 三环扩散：7 / 11 / 15px 三层套环逐层衰减
- 连接状态圆点 `.status-dot.connected` 叠加动画 `ripple-connected` 3s 循环

**修改文件**：style.css

### 2026-06-18 (v0.3.24)

参考 Dribbble 暗色仪表盘 & react-bits 精修 UI

**优化 — CSS 全面升级**
- 暗色主题背景加深：`--bg-deepest` → `#03060a`、`--bg-body` → `#060a14`，提升对比度与沉浸感
- `body::after` ambient 径向光晕双椭圆渐变 + `ambientFloat` 30s 缓慢移动动画，营造暗色氛围
- `body::before` 点阵纹理变量统一：`--bg-grid-color` → `--bg-dot-color`，三主题（dark/light/eink）同步声明
- `info-hero` 呼号流光 `shine` 动画：渐变背景 + `background-clip: text` + 3s 循环移动，文字呈现金属质感
- `panel:hover` 增强光晕：边框切 accent 色 + 外层 glow 阴影 + `inset` accent 内发光
- `server-item:hover` 渐变背景 + `border-left`：135deg 线性渐变 + 3px accent 左边框 + `translateX(4px)` 微动效
- `qso-item` `border-image` 渐变分割线：`linear-gradient(90deg, border-subtle, transparent)` 替代实色底线
- `speaking-bar :has()` 状态切换：idle 柔和暗色 / speaking 强调色光晕，纯 CSS 驱动无需 JS 切换 class
- 新增 `speak-pulse` 关键帧动画：`opacity` + `scale` 脉冲效果
- 指示器 `speaking` 态叠加动画：`speak-pulse` 1.5s + `ripple-speaking` 2s 双重呼吸感

**修改文件**：style.css




### 2026-06-18 (v0.3.23)

**UI 全面品质提升 — 卡片质感、排版精修、动效微交互**

- 卡片系统：面板默认内发光边框 (`inset 0 0 0 1px`)，hover 时 box-shadow 升级为 accent 微光，圆角 14px 保持玻璃态
- 排版精修：统计数字启用等宽数字 (`font-variant-numeric: tabular-nums`)，面板标题 letter-spacing 微增 + line-height 1.3，内容区 line-height 1.5
- 动效微交互：面板入场 stagger 0.5s，Speaking Bar 状态切换 spring 曲线 (`cubic-bezier(0.4,0,0.2,1)`)，QSO 新增条目 slide-in 右侧滑入，统计数字更新 pulse 微缩放，在线指示器扩散光环动画
- 色彩微调：背景底色加深增强对比 (`--bg-deepest: #04070a`)，卡片不透明度略微提高层次更分明
- 细节打磨：滚动条 hover accent 色，服务器列表 hover translateX(4px) + 左边框 accent，QSO 分隔线渐变透明，Recent Speakers 自身标识 accent 竖条 + 微背景，设置弹窗 backdrop 加深

### 2026-06-14 (v0.3.22)

**功能 — 设备信息面板二轮迭代：通联双值 + 坐标地址反查**

- QSO 通联统计：从单一累计次数改为 `当天次数 / 累计次数` 双值显示（如 `3 / 127`），按 QSO 时间戳筛选当天记录
- 用户坐标：从经纬度改为 `经度,纬度 / 省 市 区` 格式（如 `116.3972,39.9075 / 北京市朝阳区`），通过 OSM Nominatim 逆地理编码异步获取地址并缓存
- 新增 `updateCoordDisplay()` 方法，逆地理结果命中用户网格时自动刷新坐标显示，与 Speaking Bar 共享 `_gridLocationCache` 缓存




### 2026-06-13 (v0.3.21)

**功能 — 设备信息面板重构**

- 删除两个字段：固件版本（`info-firmware`）、高度（`info-altitude`），同时移除对应的 `config.getFirmwareVersion` 和 `config.getAltitude` 请求
- 新增通联统计：显示累计 QSO 次数（`info-qso-count`），数据来源 `qsoList.length`，在加载 QSO 列表和新通联到达时实时更新
- 新增用户坐标：显示经纬度（`info-coord`），精确到 4 位小数，数据来源 `config.getCordinate` 接口

### 2026-06-13 (v0.3.20)

**功能 — 服务器搜索框 x 清除按钮**

- 搜索框右侧新增 x 清除按钮，仅在输入文字后显示，hover 有圆形背景反馈
- 点击 x 清空搜索文字、恢复完整服务器列表，焦点保持在输入框
- 选择服务器后搜索文字自动清空并收起搜索结果
- **Bugfix**：修复 v0.3.20 引入的 `ReferenceError: $ is not defined` — `switchServer()` 中误用了 `bindEvents()` 局部作用域内的 `$` 函数，导致点击服务器列表项无法切换。改为 `document.getElementById()`

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
  - 消除 3800Hz 镜像污染（biquad 阻带抑制不足 -> 噪声混入解调输出）
  - I/Q 通道群延迟对齐（15 samples），消除相位失配导致的频率估计偏移
  - FIR 系数缓存避免重复计算
- VIS 检测鲁棒性提升：能量比阈值从 3x 放宽至 2x，新增环境噪声地板（400Hz）估计
  - 前置长度校验（< 610ms 直接拒绝，避免缓冲区不足误检）
  - 比特值判定加入 2x 主导比要求，防止弱信号误读
- 同步脉冲检测改进：容差从 +-200 Hz 收紧至 +-100 Hz（PhosphorSSTV 参考 +-80 Hz）
  - 新增下降沿检测（sync 前 2ms 频率 >1600 Hz），惩罚不具真过渡的候选
  - 跳过 FM 解调器前 1ms 初始化暂态
- 亮度通道去加重：新增 `_deEmphasisLuma`（一阶递归低通，t~=300us，k=0.659），匹配 SSTV 发射预加重
- 时序修复：`_sstvT0` 使用 `recentTotal` 快照避免 `totalWritten` 竞态
- AudioContext autoplay：`initAudioCtx` 注册 click/keydown/touchstart 事件自动 `resume()`
- 移除废弃函数：`_toAnalytic`、`_applyBiquad`、`_instantFreq`

**修改文件**：app.js, README.md

### 2026-06-09 (v0.3.16)

**修复 — Recent Speakers 呼号字体 + 自我识别**

- Recent Speakers 呼号字体与 Speaking Bar 对齐：桌面端 1.5rem -> 1.125rem（18px），移动端 1.3rem -> 0.875rem（14px）
- 修复自我识别：`myCallsign` 已获取但从未用于 Recent Speakers；新增 `isSelf` 比对逻辑，匹配时添加 `is-self` CSS 类 + "您" 标签
- Speaking Bar "自己"标签统一改为"您"（与 FmoLogs 风格一致）
- 新增 CSS：`.recent-item.is-self strong { color: var(--accent) }` / `.self-tag { font-size: 0.7em; font-weight: 500 }`

**修改文件**：style.css, app.js, README.md

### 2026-06-09 (v0.3.15)

**优化 — Recent Speakers 区域放大（参照 FmoLogs SpeakingHistoryModal）**

- `.recent-speakers` max-height：180px -> 200px
- `.recent-item`：gap 8px->10px，padding 4px 8px->6px 10px
- `.recent-index-bg` font-size：36px -> 48px（桌面端），移动端 768px 下 36px -> 38px
- `.recent-callsign-line strong` font-size：1.2rem -> 1.5rem（参照 FmoLogs 1.6rem，约 1.45x speaking bar）
- `.recent-main > span` font-size：0.8rem -> 1rem
- `.recent-count` font-size：0.85rem -> 1rem
- `.recent-speakers:empty::after` font-size：0.85rem -> 1rem
- 移动端 768px：`strong` 1.3rem / `span` 0.9rem / `count` 0.9rem / `empty` 0.9rem

**修改文件**：style.css

### 2026-06-09 (v0.3.14)

**修复 — SSTV Robot 36 无法接收信号**

- 根因：`totalScanLines` 配置为 36，实际 Robot 36 为 240 条扫描线（36 秒）；导致解码器在 5.4 秒后即停止并触发超时重置
- 修复 `ROBOT36_MODE.totalScanLines`：36 -> 240
- 修复 `_sstvForceStart`：`_sstvT0` 回退量从 5 秒改为 2.5 秒，确保在 3 秒环形缓冲区容量内
- 参照 [colaclanth/sstv](https://github.com/colaclanth/sstv) Robot 36 规范（LINE_COUNT=240, LINE_TIME=150ms）

**修改文件**：app.js, README.md

### 2026-06-06 (v0.3.13)

**修复 — 服务器列表无法加载**

- v0.3.12 遗漏了 `_serverLatency` / `_serverLatencyPending` 字段的初始化声明，导致 `renderServerList()` 中 `TypeError: Cannot read properties of undefined`
- 在 App 对象 SSTV 段补充 `_serverLatency: {}` / `_serverLatencyPending: {}`

**修改文件**：app.js

### 2026-06-06 (v0.3.12)

**新增 — Speaking Bar 网格地名反查 + 服务器延迟显示**

- Speaking Bar 中梅登海德网格（如 OL63ma）替换为通过 OSM Nominatim 反查得到的完整省/市/区地名
- 服务器列表每项末尾"--在线"后显示 WebSocket 延迟（临时连接测时，3s 超时，host 无则显示 ...）
- 新增 `_probeServerLatency(s)` / `_probeAllServerLatency()` 方法
- 新增 `_serverLatency` / `_serverLatencyPending` 缓存字段防止并发重复测量

**修改文件**：app.js, style.css

### 2026-06-06 (v0.3.11)

**优化 — 替换方向箭头 SVG + 方位角旋转跟随**

- 替换 speaking-arrow SVG 为新版红底白三角图标
- SVG 通过 `transform:rotate(${azimuth}deg)` 跟随实际方位角旋转（北=0 deg）

**修改文件**：app.js

### 2026-06-06 (v0.3.10)

**修复 — 方位角 SVG 方向箭头 + CSS 样式**

- 将 `->` 文本箭头替换为 SVG 方向图标（speaking-arrow class，14x14px，vertical-align: middle）
- 新增 `.speaking-meta .speaking-arrow` CSS 规则

**修改文件**：app.js, style.css




### 2026-06-06 (v0.3.9)

**重构 — Speaking Bar 加入方位角/距离/Grid + 频谱改为真实 FFT**

- Speaking Bar 在呼号后加入 `方位东24 deg 12km OL63ma` 格式的方位角/距离/梅登海德网格信息
- 迷你频谱从 VU 模拟驱动改为真实 FFT（Radix-2 Cooley-Tukey，1024 点 Hann 窗，200-3800Hz 对数分频 24 柱）
- 无音频时频谱显示基线而非随机噪声

**修改文件**：app.js, style.css

### 2026-06-06 (v0.3.8)

**重构 — Speaking Bar 完全参照 FmoLogs 重做 UI**

- 彻底废弃旧卡片式设计（border + border-radius + card bg），改为 FmoLogs 扁平单行状态条
- 结构：脉冲圆点指示器（发言绿/空闲灰） + 单行文字 + 紧凑 VU 表
- 格式：`正在发言: CALLSIGN 方位东24 deg 12km OL63ma [HOST] 您 +新朋友 xN [服务器名] elapsed`
- 空闲态：`当前无人发言`（灰色圆点）
- CSS 全部重写：移除 speaker-callsign/speaker-badge/speaker-grid/speaker-server/speaker-extra/idle-text/idle-sub 等旧类，统一为 speaking-indicator / speaking-text / speaking-tag / speaking-count / speaking-elapsed / speaking-meta
- 彻底消除多层嵌套、双层显示、flex-wrap 换行等问题

**修改文件**：index.html, style.css, app.js

### 2026-06-06 (v0.3.7)

**修复 — 移除 Speaking Bar 面板 title 消除双层显示**

- 根因：`panel-title "当前通联"`（带 bottom-border）+ `speaking-bar`（带自身 border+背景）各自形成独立视觉层，导致双层显示
- 修复：删除 `panel-title "当前通联"`，speaking-bar 成为面板内最上层元素

**修改文件**：index.html

### 2026-06-06 (v0.3.6)

**修复 — Speaking Bar 双层显示 + 重复调用 _addSpeakingRecord**

- 根因定位：`.speaking-bar` 使用 `flex-wrap: wrap`，在四象限 50% 面板宽度下条目换行形成双层显示
- 修复：`flex-wrap: wrap` -> `flex-wrap: nowrap`，强制单行布局；添加 `overflow: hidden` 防止溢出
- 修复 `_processEvent` 中 `speaking_start` / `qso/callsign` 事件处理重复调用 `_addSpeakingRecord`（`showSpeaking()` 内部已调用一次）

**修改文件**：style.css, app.js

### 2026-06-06 (v0.3.5)

**重构 — Speaking Bar 单层布局 + README 优化**

- Speaking Bar 改为单行紧凑布局（参照 FmoDeck/fmo-show）：callsign -> 徽章 -> 方位角 -> 距离 -> Grid -> 服务器名 -> elapsed -> VU 表，全部在一行内横向排列
- 删除通联统计文字（"通联 X 次 . 上次 XX"），保留新朋友徽章（1 次通联时显示）
- idle 状态同步改为单行结构：`等待通联... 方位 -- -- km ---- ----`
- CSS 全面重构：`.speaking-bar-content` 改为 `flex-direction: row; flex-wrap: wrap`；移除 `.speaker-row-1` / `.speaker-row-2`；VU 表改为固定宽度内联
- 移动端响应式：允许自动换行，保持紧凑
- README 新增参考项目列表；历史更新日志折叠

**修改文件**：app.js, style.css, index.html, README.md

### 2026-06-06 (v0.3.4)

**修复 — Speaking Bar server name & azimuth resolution**

- 参照 FmoLogs：新增 `_lookupServerName(addressId)` 方法，通过事件 `addressId` 在 `serverList` 中查找服务器名称（name/uid/address 三字段匹配）
- `_processEvent`：`speaking_start` 和 `qso/callsign` 事件 handler 新增 `addressId` -> server 映射，不再依赖事件中不存在的 `serverName` 字段
- `showSpeaking`：serverName 兜底链增强：qsoList -> serverList 两级 fallback
- `hideSpeaking`：idle 结构对齐 active 状态（双行 + subtitle 占位），消除框体高度跳变
- `renderSpeakingBar`：方位/距离/高度各自独立 `<span>` 输出，不再混杂单行

**修改文件**：app.js, style.css

### 2026-06-06 (v0.3.3)

**修复 — Speaking Bar 两 Bug**

- Bug 1: 「等待通联」与「正在通联」框体大小不一致
  - 修复：`.speaking-bar` min-height 从 90px 调整为 112px，使 idle 文本垂直居中仍与 active 内容区等高
  - idle 状态下隐藏 vu-meter
- Bug 2: 正在通联不显示方位角方向文字、Grid、服务器名称
  - 新增 `_azimuthToDirection()` 方法：将度数转为中文 8 方位（北/东北/东/...）
  - `renderSpeakingBar()`：方位角格式化为 `方位 东24 deg`、距离 -> `距离 12 km`、Grid -> 第二行独立显示
  - `showSpeaking()`：事件若缺 grid/distance/azimuth 立即从 QSO 列表推导补全
  - 新增 `.speaker-server` CSS：服务器名显示为 accent 色小标签
  - `_currentSpeaker` 新增 serverName/serverUid 字段

**修改文件**：app.js, style.css

### 2026-06-06 (v0.3.2)

**修复 — SSTV Robot 36 解码完全重写（参照 FmoDeck）**

- 修复 Robot 36 decodeLine 核心 Bug：旧版将每 3 条扫描线当作 Y/U/V（YUV 420）同等距采样，完全不符合 SSTV 规范
- 重写为正确的 Robot 36 时间分段解码：每对扫描线（300ms）分为 sync(9ms)+porch(3ms)+Y[even](88ms)+separator(4.5ms)+porch2(1.5ms)+Cr(44ms) / Y[odd]+Cb
- 新增 1200Hz sync 脉冲检测（滑窗最小距离法），校正行同步时序漂移
- 新增 Hampel 滤波器平滑 sync jitter（窗长 5，MADx3 阈值），消除孤立野点
- 新增 `_sampleSstvSection`：按时间窗正确切片 freq 序列并 box 平均采样为像素亮度
- 替换 YUV->RGB 为 BT.601 full-range YCbCr->RGB（JPEG/JFIF 标准矩阵系数）
- 新增 `_decodeSstvLinePair` 一行对解码，Cr/Cb 色度水平 2:1 subsampling（ci=x>>1）

**修改文件**：app.js

### 2026-06-06 (v0.3.1)

参照 FmoDeck SSTV 模块重写核心 DSP。

**修复**
- SSTV：修复 FM 解调数学错误（`atan2(0, xy+xy)` 交叉项恒为 0，输出永远 0/+-1）
- SSTV：VIS 检测改为在原始 PCM 上做 Goertzel 音调检测，不再在已解调信号上跑
- SSTV：Goertzel 改用任意频率形式，消除 DFT 整数 bin 量化误差
- SSTV：VIS 检测增加完整前导校验（双 leader 1900Hz + break 1200Hz）、start/stop bit 校验、偶校验位校验、噪声底噪 3x 阈值
- SSTV：FM 解调重写为 mixer + Butterworth LPF + analytic signal 瞬时频率估计，新增 5ms LPF 瞬态丢弃
- SSTV：`_extractPixels` 适配正确频率输出（1500-2300Hz -> 0-1 线性映射）

### 2026-06-09 (v0.3.1)

参照 FmoLogs（作者 BH5HSJ）

**优化**
- Speaking Bar：放大 idle 状态卡片（indicator 14->16px、字体 16->18px、strong 15->16px、gap 0.6->0.75rem），移动端同步放大

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
