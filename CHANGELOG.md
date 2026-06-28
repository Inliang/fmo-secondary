---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 4d32f127e120f5be24dadce57b263d70_718434ba723711f1897e5254002afed2
    ReservedCode1: ULwvedkHCQCnTYd1YhKrAPpNqsFRdUbaznmy9McD8ctT2KLDgebYNYDYOYLjBkxZynmX5bmHOwKTL8UjyVDk5n4YFgUFkTzK26b1jNo1QVAJXDb5PNVNtMoIudKoaibC39FZIg5p4aU71LtmTVXZBObP4QfFuwZq1OhmdBRdQoxyeALIOy0g7TMVX1A=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 4d32f127e120f5be24dadce57b263d70_718434ba723711f1897e5254002afed2
    ReservedCode2: ULwvedkHCQCnTYd1YhKrAPpNqsFRdUbaznmy9McD8ctT2KLDgebYNYDYOYLjBkxZynmX5bmHOwKTL8UjyVDk5n4YFgUFkTzK26b1jNo1QVAJXDb5PNVNtMoIudKoaibC39FZIg5p4aU71LtmTVXZBObP4QfFuwZq1OhmdBRdQoxyeALIOy0g7TMVX1A=
---

# FMO 副屏伴侣 — 更新日志

## 2026-06-27

### 服务器列表改为浮动搜索弹窗

- 服务器列表右侧"列表"标签改为"搜索"，点击弹出浮动搜索框
- 支持中文名、拼音首字母、UID 多维匹配
- 点击搜索结果后弹窗关闭并跳转到对应服务器
- click-outside 关闭弹窗

### 服务器列表在线数添加 APRS V4 U 前缀

- 服务器列表每行右侧在线数前添加 APRS V4 `U` 前缀，格式如 `U5 在线`
- U 字段表示 APRS 协议中的 `<online>` 用户数

### APRS UID 参数显示

- device-strip 中 CALL 后方新增 UID 参数标签
- 数据来源 `user.getInfo` 响应的 `uid` 字段

### 日志模块重构

- 更新日志内容从 app.js 抽离到 CHANGELOG.md，还原 app.js 纯净运行日志
- FMO-DEBUG 调试日志抽离到独立 `logger.js` 模块

---

## 2026-06-28

### 卡片高度固定（flex overflow 修复）

- `.live-table-wrap` 和 `.server-list-sidebar` 添加 `min-height: 0`
- 修复 flex 子元素默认 `min-height: auto` 导致内容撑破父容器 `max-height` 的问题
- 最近发言、通联记录、服务器列表卡片高度固定，内容溢出时内部滚动

### 设置面板暗色扁平风格

- 设置面板 overlay-box 改为纯暗色扁平风格（`#0c1117`）
- 边框透明度提升至 0.12，叠加深度阴影
- btn-muted / btn-accent 统一 `box-shadow: none` + `outline: none` + `border: none`
- 输入框回车键触发保存

### UTF-8 编码修复

- `index.html` / `app.js` 从 UTF-16 LE 转为 UTF-8
- 内嵌 overlay CSS 确保 file:// 协议下样式生效
- 修复编码问题导致设置按钮无响应的 bug

### 上个通联卡片微调

- 参数值水平居中
- 参数垂直居中 + 方位值不换行

### 逆地理编码三层 fallback 链路

- 梅登海德网格 → QTH 地址解析重构
- 修复 `_resolveGridLocation` 调用链与查错能力
- 修复 display_name 解析缺少市级的 bug（从区与省之间提取市级）
- Nominatim 中国大陆被墙 → 高德 JSONP（key 类型不匹配）→ BigDataCloud（无需 key）
- 最终形成 BigDataCloud → 高德 JSONP → Nominatim 三层 fallback 链路

---

## 2026-06-21

### v0.4.9

**Bugfix：修复部分固件版本服务器列表无法获取**

- `fetchServerListAll()` 移除对 `resp.code === undefined` 的强制跳过，兼容不返回 `code` 字段的固件版本
- 响应解析扩展 `payload.stations` / `payload.items` 格式支持

### v0.4.12

**Bugfix：RESPONSE_ALIASES 修正 + 响应匹配兼容 V2 协议 event 字段**

- RESPONSE_ALIASES 从 `getListRangeResponse` 修正为 `getListResponse`（对齐 FmoLogs 参考实现，设备实际返回 subType 为 getListResponse）
- handleWsMessage 外 guard 从 `!msg.event` 改为 `!msg.event || msg.subType !== undefined || msg.code !== undefined`：V2 协议响应可能带 `event: "ok"`（遵循 AT 协议规范），需通过 subType/code 辅助识別响应消息
- 回退匹配移除冗余 `!msg.event` 条件（外 guard 已拦截纯事件）
- fetchServerListAll 移除 `resp.event` continue 跳過邏輯（現已冗餘，且會誤跳 V2 合法響應）

### v0.4.11

**Bugfix：RESPONSE_ALIASES 回退 + 恢复 type 回退匹配**

- RESPONSE_ALIASES 从 `getListResponse` 回退为 `getListRangeResponse`（部分固件实际返回格式）
- 恢复 `!matched && msg.type === r.type && !msg.event` 回退匹配（v0.3.39 时期已存在）
- 两层匹配：先严格 type+subType，失败后 type 回退兜底（排除事件消息污染）

### v0.4.10

**Bugfix：移除 handleWsMessage 贪婪回退匹配，修复服务器列表获取失败**

- `handleWsMessage` 中删除 `!matched && msg.type === r.type && !msg.event` 回退匹配
- 该回退在串行队列模式下过于贪婪：当 station/getListRange 在飞行中时，任何 type=station 的非事件消息都会被错误消费为响应，导致真实 getListResponse 被丢弃
- 对齐 fmo-show / FMO-Dashboard / FmoDeck 三个参考项目的严格 type+subType 匹配策略

### v0.4.15

**Tide 风格全面 UI 优化** — 30 项精细化调整，参考 Dribbble 金融仪表盘设计

- 新增 warning 色系 + border 精细化变量
- Active Contact Card / Device Strip / Detail Card / Bearing Panel 去玻璃化改纯色
- 全局卡片圆角统一 10px/16px，边框统一 --border-subtle
- 底部面板 header 增加分割线，行间距优化
- Status Bar 玻璃保留但精炼，Stat Pill 样式收窄
- 全局 typography 微调（标签字重/尺寸、数值加粗）

### v0.4.14

**右侧边栏去除毛玻璃效果** — `.previous-card` / `.server-card` / `.prev-info-item` 改为纯色不透明背景

### v0.4.13

**右侧边栏 UI 统一为毛玻璃卡片风格**

- `.prev-info-item` 升级为玻璃卡片，匹配主面板 `.detail-card` 视觉语言
- `.server-card-header` padding 对齐 `.section-label` 节奏
- `.side-loading` 加载状态对齐主面板占位风格
- `.server-list-trigger` 增加 mono 字体和字重，匹配交互元素

### v0.4.8

**底部面板去毛玻璃化 + 最近发言/通联记录左右分栏**

- live-panel 和 qso-panel 移除毛玻璃效果，改为纯色背景
- index.html 新增 `.bottom-split` 包裹 div，桌面端横向 50/50 分栏，移动端纵向堆叠

### v0.4.7

**Bugfix：修复频率、服务器列表、QSO 日志三项数据获取为空**

- **服务器列表**：`RESPONSE_ALIASES` 修正为 `{ station: { getListRange: 'getListResponse' } }`，与协议文档和 fmo-show 源码一致
- **QSO 日志**：`fetchQsoListAll()` 改为 `getListRange` + `{ start, count }` 分页参数
- **频率显示**：新增 `fetchRadioInfo()` 方法，兼容不同固件版本的频率端点，支持 polling 刷新

### v0.4.6

**bearing-panel 右上角重定位** — 罗盘方位组件从卡片中部移到右上角

- `.bearing-panel` 移入 `.ac-hero` 内部作为 flex 右侧伴生元素，新增 `.hero-main` 包裹层
- 罗盘尺寸 72→48px，箭头 22×32→16×24px，方位文字字号同步缩小

---

> 更早的版本记录可通过 `git log` 查看。
*（内容由AI生成，仅供参考）*
