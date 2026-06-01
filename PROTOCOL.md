# WebSocket 协议映射

基于 [fmo-show](https://github.com/EthanYan6/fmo-show) 逆向工程 + [BG5ESN Docs](https://bg5esn.com/categories/docs/) 官方文档。

## 1. 连接端点

| 端点 | 协议 | 说明 |
|------|------|------|
| `ws://{host}/ws` | JSON-RPC | 主数据通道，请求/响应模式 |
| `ws://{host}/events` | JSON 事件流 | 服务端推送，单向接收 |
| `ws://{host}/audio` | Binary | 8kHz 16bit mono PCM，每帧 ~320B (20ms) |

## 2. 请求/响应协议 (Main WS)

### 通用格式

```json
// 请求
{ "type": "<domain>", "subType": "<action>", "data": { ... } }

// 响应
{ "type": "<domain>", "subType": "<action>Response", "code": 0, "data": { ... } }
```

### 2.1 用户信息

```
→ { type: "user", subType: "getInfo" }
← { type: "user", subType: "getInfoResponse", code: 0,
    data: { callsign, uid, ... } }
```

### 2.2 设备配置

```
→ { type: "config", subType: "getCordinate" }
← { data: { latitude, longitude } }

→ { type: "config", subType: "getUserPhyDeviceName" }
← { data: { deviceName } }

→ { type: "config", subType: "getUserPhyAnt" }
← { data: { ant } }

→ { type: "config", subType: "getFirmwareVersion" }
← { data: { version } }
```

### 2.3 服务器/中继

```
→ { type: "station", subType: "getCurrent" }
← { data: { uid, name, announcement, onlineCount } }

→ { type: "station", subType: "getListRange", data: { start, count } }
← { data: { list: [{ uid, name, onlineCount }] } }
```

### 2.4 QSO 统计

```
→ { type: "qso", subType: "getTodayCount" }
← { data: { count } }

→ { type: "qso", subType: "getTotalCount" }
← { data: { count } }

→ { type: "qso", subType: "getListRange", data: { start, count } }
← { data: { list: [{ logId, toCallsign, grid, timestamp }] } }

→ { type: "qso", subType: "getContactCount" }
← { data: { count } }
```

## 3. 事件推送 (Events WS)

| 事件类型 | 数据 | 处理动作 |
|---------|------|---------|
| `speaking_start` | `{ callsign, grid }` | 更新 SpeakingBar |
| `speaking_stop` | `{ callsign }` | 5s 后清空 SpeakingBar |
| `new_qso` | `{ logId, toCallsign, grid, timestamp }` | 插入 QSO 列表 + 刷新统计 |
| `station_update` | `{ ... }` | 刷新服务器面板 |
| `online_change` | `{ count }` | 更新在线人数 |

## 4. 音频流 (Audio WS)

- 格式：8kHz sample rate, 16-bit signed integer PCM, mono
- 帧率：每 20ms 一帧 = 每帧 320 字节（160 samples × 2 bytes）
- 处理管线：ArrayBuffer → Int16Array → Float32Array(-1.0~1.0) → AudioWorklet
- VU 计算：RMS of frame → dB → 映射到 0-100% 电平

## 5. 响应别名映射

```javascript
const RESPONSE_ALIASES = {
  station: { getListRange: 'getListResponse' }
};
```

注意：`station.getListRange` 的响应 subType 为 `getListResponse` 而非 `getListRangeResponse`。