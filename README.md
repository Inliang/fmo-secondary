# fmo-secondary

FMO 副屏伴侣 — 单 HTML 零依赖、纵向信息流仪表盘、三主题 Web 控制面板。

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
- **设计参考**：[UI UX Pro Max](https://ui-ux-pro-max-skill.nextlevelbuilder.io/) / [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) / [Dribbble](https://dribbble.com/) / [React Bits](https://reactbits.dev/)

---

## 架构概览

```
+------------------------------------+
|  Speaking Bar (全宽, 当前发言者)    |
+------------------------------------+
|  Device Info  |  Server Info       |
+------------------------------------+
|  Recent Speakers (最多10条)         |
+------------------------------------+
|  QSO 通联列表 (最多15条, 带网格)    |
+------------------------------------+
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

- [fmo-show](https://github.com/EthanYan6/fmo-show) — 墨水屏风格单行紧凑布局参考
- [FmoDeck](https://github.com/wh0am1i/FmoDeck) — 战术 HUD 主题，SpeakingBar + SSTV 解码参考
- [FmoLogs](https://github.com/dingle1122/FmoLogs) — 原始 FMO 日志平台
- [FMO 文档](https://bg5esn.com/categories/docs/) — 固件接口文档

---

## 致谢

本项目是基于 fmo-show（作者 [@EthanYan6](https://github.com/EthanYan6)）、FmoDeck（作者 [@wh0am1i](https://github.com/wh0am1i)）的二次开发作品。原项目完整搭建了与 FMO 设备交互的协议实现、日志同步、APRS 相关能力等核心业务逻辑。本仓库在其基础上做界面与交互层的重写，但所有"能用起来"的根基都来自 fmo-show。特此鸣谢。

---

## 更新日志

### 2026-06-21 (v0.4.9)

**Bugfix：修复部分固件版本服务器列表无法获取**

- `fetchServerListAll()` 移除对 `resp.code === undefined` 的强制跳过，兼容不返回 `code` 字段的固件版本
- 响应解析扩展 `payload.stations` / `payload.items` 格式支持

---

### 2026-06-21 (v0.4.8)

**底部面板去毛玻璃化 + 最近发言/通联记录左右分栏**

- live-panel 和 qso-panel 移除毛玻璃效果，改为纯色背景
- index.html 新增 `.bottom-split` 包裹 div，桌面端横向 50/50 分栏，移动端纵向堆叠

---

### 2026-06-21 (v0.4.7)

**Bugfix：修复频率、服务器列表、QSO 日志三项数据获取为空**

- **服务器列表**：`RESPONSE_ALIASES` 修正为 `{ station: { getListRange: 'getListResponse' } }`，与协议文档和 fmo-show 源码一致
- **QSO 日志**：`fetchQsoListAll()` 改为 `getListRange` + `{ start, count }` 分页参数
- **频率显示**：新增 `fetchRadioInfo()` 方法，兼容不同固件版本的频率端点，支持 polling 刷新

---

### 2026-06-21 (v0.4.6)

**bearing-panel 右上角重定位** — 罗盘方位组件从卡片中部移到右上角

- `.bearing-panel` 移入 `.ac-hero` 内部作为 flex 右侧伴生元素，新增 `.hero-main` 包裹层
- 罗盘尺寸 72→48px，箭头 22×32→16×24px，方位文字字号同步缩小


> 更早的版本记录可通过 `git log` 查看。
