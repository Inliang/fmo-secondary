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
- **Speaking Bar**：实时讲话者呼号 + 网格 / 距离 / 方位 / 高度 + HOST/新朋友徽章 + 通联统计
- **QSO 统计**：Top N 统计卡片、删除按钮
- **音频收听**：VU 电平 + 迷你频谱（24 柱语音频段加权）+ 静音按钮
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

## 致谢

FmoDeck 是基于 fmo-show（作者 [@EthanYan6](https://github.com/EthanYan6)）、FmoDeck（作者 [@wh0am1i](https://github.com/wh0am1i)）的二次开发作品。原项目完整搭建了与 FMO 设备交互的协议实现、日志同步、APRS 相关能力等核心业务逻辑。本仓库在其基础上做界面与交互层的重写，但所有"能用起来"的根基都来自 fmo-show。特此鸣谢 ✨

## 更新日志

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

<details>
<summary>历史日志</summary>

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
