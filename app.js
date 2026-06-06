/* ============================================================
   FMO 副屏伴侣 — app.js v7
   参照 FmoDeck 协议层改写：
   - QSO 用 qso.getList({page}) 分页拉取全量
   - Station 用 station.getListRange({start,count}) 循环翻页全量
   - 串行队列 + type+subType 匹配 + RESPONSE_ALIASES
   ============================================================ */

function normalizeHost(addr) {
  if (!addr) return '';
  return addr.trim().replace(/^(https?|wss?):?\/\//, '').replace(/\/+$/, '');
}

/* FmoDeck 同款：响应 subType 别名映射 */
const RESPONSE_ALIASES = {
  station: { getListRange: 'getListRangeResponse' }
};

class PcmTap {
  constructor(capacity) {
    this.buffer = new Float32Array(capacity);
    this.writePos = 0;
    this.capacity = capacity;
    this.totalWritten = 0;
  }
  push(samples) {
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.writePos] = samples[i];
      this.writePos = (this.writePos + 1) % this.capacity;
    }
    this.totalWritten += samples.length;
  }
  recent(ms, sampleRate) {
    const count = Math.min(Math.round((ms * sampleRate) / 1000), this.capacity);
    const out = new Float32Array(count);
    let idx = this.writePos - count;
    if (idx < 0) idx += this.capacity;
    for (let i = 0; i < count; i++) {
      out[i] = this.buffer[(idx + i) % this.capacity];
    }
    return out;
  }
  slice(startSample, count) {
    if (startSample < this.totalWritten - this.capacity) return null;
    const oldest = this.totalWritten - this.capacity;
    const offset = startSample - oldest;
    if (offset < 0) return null;
    if (offset + count > this.capacity) return null;
    const out = new Float32Array(count);
    let idx = (this.writePos - this.capacity + offset) % this.capacity;
    if (idx < 0) idx += this.capacity;
    for (let i = 0; i < count; i++) {
      out[i] = this.buffer[(idx + i) % this.capacity];
    }
    return out;
  }
}

const ROBOT36_MODE = {
  name: 'Robot 36',
  visCode: 8,
  width: 320,
  height: 240,
  scanLineMs: 150,
  totalScanLines: 36,
  preludeMs: 0,
  // Segment timing within 150ms scan line (Robot 36 spec)
  syncMs: 9,
  porchMs: 3,
  yMs: 88,
  separatorMs: 4.5,
  porch2Ms: 1.5,
  chromaMs: 44,
};

const App = {
  // --- 连接 ---
  ws: null,
  eventsWs: null,
  audioWs: null,
  connected: false,
  protocol: 'ws',
  hostPort: '',
  reconnectAttempts: 0,
  maxReconnectAttempts: 10,

  // --- 串行队列（FmoDeck 同款） ---
  _queue: null,
  _inFlight: null,

  // --- 数据 ---
  myCallsign: '',
  myGrid: '',
  qsoList: [],
  serverList: [],
  currentServerName: '',
  serverSearch: '',

  // --- 音频 ---
  audioCtx: null,
  audioConnected: false,
  isMuted: false,
  vuLevel: 0,
  volume: 80,
  gainNode: null,

  // --- Speaking ---
  _currentSpeaker: null,
  _speakingTimer: null,
  _speakingHistory: [],
  _historyEvents: [],
  _recentHistoryTimer: null,

  // --- SSTV ---
  _sstvActive: false,
  _sstvState: 'idle',
  _sstvMode: null,
  _sstvDecodeState: {},
  _sstvFullRgba: null,
  _sstvCanvasCtx: null,
  _sstvOffCanvas: null,
  _sstvOffCtx: null,
  _sstvImageData: null,
  _sstvAudioTap: null,
  _sstvHistory: [],
  _sstvVisDetectorState: {},
  _sstvTickTimer: null,
  _sstvNextScanLine: 0,
  _sstvT0: 0,
  _sstvYbuf: null,
  _sstvRYbuf: null,
  _sstvBYbuf: null,
  _sstvSyncWin0: [],
  _sstvSyncWin1: [],

  // --- 定时器 ---
  datetimeTimer: null,
  pollTimer: null,

  // --- 初始化 ---
  init() {
    this._queue = [];
    this._inFlight = null;
    this.bindEvents();
    this.loadSettings();
    this.loadTheme();
    this.startDatetime();
    this.updateConnectionUI(false);
    this.initAudioCtx();
    this.initVolume();
    // SSTV
    this._sstvCanvasCtx = document.getElementById('sstv-canvas').getContext('2d');
    this._sstvOffCanvas = document.createElement('canvas');
    this._sstvOffCanvas.width = 320;
    this._sstvOffCanvas.height = 240;
    this._sstvOffCtx = this._sstvOffCanvas.getContext('2d');
    this._sstvAudioTap = new PcmTap(3 * 8000);
    this._initSstvUi();
  },

  bindEvents() {
    const $ = id => document.getElementById(id);
    $('settings-btn').addEventListener('click', () => this.openSettings());
    $('settings-overlay').addEventListener('click', (e) => {
      if (e.target === $('settings-overlay')) this.closeSettings();
    });
    $('settings-cancel').addEventListener('click', () => this.closeSettings());
    $('settings-save').addEventListener('click', () => this.saveSettings());
    $('theme-toggle').addEventListener('click', () => this.cycleTheme());
    $('mute-btn').addEventListener('click', () => this.toggleMute());
    const si = $('server-search');
    if (si) {
      si.addEventListener('input', (e) => {
        this.serverSearch = e.target.value.toLowerCase();
        this.renderServerList();
      });
    }
    const eq = $('export-qso-btn');
    if (eq) eq.addEventListener('click', () => this.exportQso());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeSettings();
    });
  },

  // --- 主题 ---
  cycleTheme() {
    const themes = ['dark', 'light', 'eink'];
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const idx = themes.indexOf(cur);
    const next = themes[(idx + 1) % 3];
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('fmo-theme', next);
    document.getElementById('theme-toggle').textContent =
      { dark: '暗色', light: '亮色', eink: '墨水屏' }[next];
  },
  loadTheme() {
    const theme = localStorage.getItem('fmo-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('theme-toggle').textContent =
      { dark: '暗色', light: '亮色', eink: '墨水屏' }[theme];
  },

  startDatetime() {
    const update = () => {
      const d = new Date();
      document.getElementById('status-time').textContent =
        `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    };
    update();
    this.datetimeTimer = setInterval(update, 10000);
  },

  // ============ 连接管理 ============

  loadSettings() {
    const raw = localStorage.getItem('fmo-settings');
    if (!raw) return;
    try {
      const { ip, port, protocol } = JSON.parse(raw);
      this.protocol = protocol || 'ws';
      if (ip) this.connect(ip, port || '80');
    } catch (e) {}
  },

  connect(ip, port) {
    this.disconnect();
    this.updateConnectionUI(false, 'connecting');
    const host = normalizeHost(ip);
    this.hostPort = `${host}:${port}`;
    const p = this.protocol;
    const wsUrl = `${p}://${this.hostPort}/ws`;
    const evUrl = `${p}://${this.hostPort}/events`;

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.updateConnectionUI(true, 'connected');
        this.fetchAllData();
        this.startPolling();

        // 启动发言历史定期清理
        if (this._recentHistoryTimer) clearInterval(this._recentHistoryTimer);
        this._recentHistoryTimer = setInterval(() => this._cleanupOldHistory(), 60000);
      };
      this.ws.onmessage = (e) => this.handleWsMessage(e.data);
      this.ws.onclose = () => {
        this.connected = false;
        this.updateConnectionUI(false, 'disconnected');
        this.stopPolling();
        this.failAllPending(new Error('WS closed'));
        this.scheduleReconnect();
      };
      this.ws.onerror = () => {};
    } catch (e) { this.updateConnectionUI(false, 'disconnected'); }

    try {
      this.eventsWs = new WebSocket(evUrl);
      this.eventsWs.onmessage = (e) => this.handleEvent(e.data);
      this.eventsWs.onclose = () => {};
      this.eventsWs.onerror = () => {};
    } catch (e) {}

    try {
      this.audioWs = new WebSocket(`ws://${this.hostPort}/audio`);
      this.audioWs.binaryType = 'arraybuffer';
      this.audioWs.onopen = () => { this.audioConnected = true; };
      this.audioWs.onmessage = (e) => this.handleAudioFrame(e.data);
      this.audioWs.onclose = () => { this.audioConnected = false; };
      this.audioWs.onerror = () => {};
    } catch (e) {}

    document.getElementById('status-ip').textContent = ip;
  },

  disconnect() {
    this.stopPolling();
    [this.ws, this.eventsWs, this.audioWs].forEach(ws => {
      if (ws) { try { ws.close(); } catch (e) {} }
    });
    this.ws = this.eventsWs = this.audioWs = null;
    this.connected = false;
    this.audioConnected = false;
    this.failAllPending(new Error('Disconnected'));
    this.updateConnectionUI(false, 'disconnected');
  },

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    const delay = 1000 * Math.pow(2, this.reconnectAttempts - 1);
    setTimeout(() => {
      if (!this.connected) {
        const raw = localStorage.getItem('fmo-settings');
        if (raw) {
          try {
            const { ip, port } = JSON.parse(raw);
            if (ip) this.connect(ip, port || '80');
          } catch (e) {}
        }
      }
    }, delay);
  },

  updateConnectionUI(connected, status) {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (status === 'connecting') {
      dot.className = 'status-dot connecting';
      text.textContent = '连接中';
    } else if (connected) {
      dot.className = 'status-dot connected';
      text.textContent = '已连接';
    } else {
      dot.className = 'status-dot';
      text.textContent = '未连接';
    }
  },

  // ============ 串行队列（FmoDeck 同款） ============

  /**
   * 同时只 1 个 in-flight；响应按 type + subType 匹配。
   * RESPONSE_ALIASES 处理服务器不规范返回。
   */
  send(req) {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('未连接'));
    }
    return new Promise((resolve, reject) => {
      this._queue.push({ req, resolve, reject });
      this._processQueue();
    });
  },

  _processQueue() {
    if (this._inFlight || this._queue.length === 0) return;
    const next = this._queue.shift();
    const timer = setTimeout(() => {
      if (this._inFlight === flight) {
        this._inFlight = null;
        next.reject(new Error(`超时: ${next.req.type}/${next.req.subType}`));
        this._processQueue();
      }
    }, 10000);
    const flight = { ...next, timer };
    this._inFlight = flight;
    this.ws.send(JSON.stringify(next.req));
  },

  handleWsMessage(data) {
    let msg;
    try { msg = JSON.parse(data); } catch (e) { return; }

    // 匹配 in-flight 请求 — FmoDeck 同款 type+subType 匹配
    if (this._inFlight) {
      const r = this._inFlight.req;
      const expectedSubType =
        RESPONSE_ALIASES[r.type]?.[r.subType] ?? `${r.subType}Response`;

      let matched = false;
      if (
        msg.type === r.type &&
        (msg.subType === expectedSubType || msg.subType === r.subType)
      ) {
        matched = true;
      }

      if (!matched && msg.type === r.type) {
        matched = true;
      }

      if (matched) {
        clearTimeout(this._inFlight.timer);
        const resolve = this._inFlight.resolve;
        this._inFlight = null;
        resolve(msg);
        this._processQueue();
        return;
      }
    }

    // 非响应 → 服务端推送（含 FmoDeck qso 事件）
    if (msg.type === 'event' || msg.event || msg.type === 'qso') {
      this.handleEvent(JSON.stringify(msg));
    }
  },

  failAllPending(error) {
    if (this._inFlight) {
      clearTimeout(this._inFlight.timer);
      this._inFlight.reject(error);
      this._inFlight = null;
    }
    for (const q of this._queue) q.reject(error);
    this._queue = [];
  },

  handleEvent(data) {
    const self = this;
    // 处理黏连 JSON（多个 }{ 拼接）
    const parts = data.split('}{');
    let messages;
    if (parts.length === 1) {
      messages = [data.trim()];
    } else {
      messages = parts.map((p, i) => {
        if (i === 0) return (p + '}').trim();
        if (i === parts.length - 1) return ('{' + p).trim();
        return ('{' + p + '}').trim();
      });
    }
    for (const msgStr of messages) {
      try {
        const evt = JSON.parse(msgStr);
        self._processEvent(evt);
      } catch (e) {}
    }
  },

  _processEvent(evt) {
    // 旧格式：speaking_start / speaking_stop
    if (evt.event === 'speaking_start') {
      // 参照 FmoLogs：事件携带 addressId，映射到 serverList 获取 serverName
      const srv = this._lookupServerName(evt.addressId);
      const derived = this._deriveStationInfo(evt.callsign);
      this.showSpeaking({
        callsign: evt.callsign,
        grid: evt.grid || derived.grid || '',
        isHost: evt.isHost || false,
        distance: evt.distance !== undefined ? evt.distance : derived.distance,
        azimuth: evt.azimuth !== undefined ? evt.azimuth : derived.azimuth,
        altitude: evt.altitude !== undefined ? evt.altitude : derived.altitude,
        serverName: srv.name || evt.serverName || '',
        serverUid: srv.uid || evt.serverUid || '',
      });
      return;
    }
    if (evt.event === 'speaking_stop') {
      this._finishSpeakingRecords();
      this.hideSpeaking();
      return;
    }

    // FmoDeck 新格式：qso/callsign
    if (evt.type === 'qso' && evt.subType === 'callsign') {
      const d = evt.data || {};
      if (d.isSpeaking) {
        // addressId 可能来自 data.addressId 或 evt.addressId
        const srv = this._lookupServerName(d.addressId || evt.addressId);
        const derived = this._deriveStationInfo(d.callsign);
        this.showSpeaking({
          callsign: d.callsign,
          grid: d.grid || derived.grid || '',
          isHost: d.isHost || false,
          distance: d.distance !== undefined ? d.distance : derived.distance,
          azimuth: d.azimuth !== undefined ? d.azimuth : derived.azimuth,
          altitude: d.altitude !== undefined ? d.altitude : derived.altitude,
          serverName: srv.name || d.serverName || '',
          serverUid: srv.uid || d.serverUid || '',
        });
      } else {
        this._finishSpeakingRecords();
        this.hideSpeaking();
      }
      return;
    }

    // FmoDeck：qso/history
    if (evt.type === 'qso' && evt.subType === 'history') {
      const historyData = evt.data;
      if (Array.isArray(historyData)) {
        this._historyEvents = historyData.map(item => ({
          callsign: item.callsign || '',
          utcTime: item.utcTime || 0
        }));
        this._cleanupOldHistory();
        this.renderRecentSpeakers();
      }
      return;
    }

    // 其他事件
    if (evt.event === 'new_qso') {
      this.addQsoItem(evt);
    } else if (evt.event === 'station_update' || evt.event === 'online_change') {
      this.fetchServerList();
    }
  },

  // ============ 数据获取 ============

  async fetchAllData() {
    await Promise.all([
      this.fetchDeviceInfo(),
      this.fetchServerListAll(),
      this.fetchQsoListAll()
    ]);
  },

  async fetchDeviceInfo() {
    const tasks = [];

    // user.getInfo
    tasks.push((async () => {
      try {
        const r = await this.send({ type: 'user', subType: 'getInfo' });
        if (r.code === 0 && r.data?.callsign) {
          this.myCallsign = r.data.callsign;
          document.getElementById('info-callsign').textContent = this.myCallsign;
          document.getElementById('status-callsign').textContent = this.myCallsign;
        }
      } catch (e) { console.warn('user:', e.message); }
    })());

    // config: 坐标 + 网格
    tasks.push((async () => {
      try {
        const r = await this.send({ type: 'config', subType: 'getCordinate' });
        if (r.code === 0 && r.data && typeof r.data === 'object') {
          this._myLat = r.data.latitude;
          this._myLon = r.data.longitude;
          const grid = this.latLonToGrid(r.data.latitude, r.data.longitude);
          this.myGrid = grid;
          document.getElementById('info-grid').textContent = grid;
          document.getElementById('status-grid').textContent = grid;
          const alt = r.data.altitude ?? r.data.elevation ?? r.data.height ?? r.data.alt;
          if (alt !== undefined) {
            document.getElementById('info-altitude').textContent = `${alt} m`;
          }
        }
      } catch (e) {}
    })());

    // config: 高度兜底
    tasks.push((async () => {
      try {
        const r = await this.send({ type: 'config', subType: 'getAltitude' });
        if (r.code === 0 && r.data) {
          const alt = r.data.altitude ?? r.data.height ?? r.data.elevation ?? r.data.alt;
          if (alt !== undefined) {
            document.getElementById('info-altitude').textContent = `${alt} m`;
          }
        }
      } catch (e) {}
    })());

    // config: 设备名
    tasks.push((async () => {
      try {
        const r = await this.send({ type: 'config', subType: 'getUserPhyDeviceName' });
        if (r.code === 0 && r.data?.deviceName)
          document.getElementById('info-device').textContent = r.data.deviceName;
      } catch (e) {}
    })());

    // config: 天线
    tasks.push((async () => {
      try {
        const r = await this.send({ type: 'config', subType: 'getUserPhyAnt' });
        if (r.code === 0 && r.data?.ant)
          document.getElementById('info-antenna').textContent = r.data.ant;
      } catch (e) {}
    })());

    // config: 固件版本
    tasks.push((async () => {
      try {
        const r = await this.send({ type: 'config', subType: 'getFirmwareVersion' });
        if (r.code === 0 && r.data?.version)
          document.getElementById('info-firmware').textContent = r.data.version;
      } catch (e) {}
    })());

    await Promise.all(tasks);
  },

  latLonToGrid(lat, lon) {
    lat = +lat; lon = +lon;
    const L = lon + 180, La = lat + 90;
    const fl = Math.floor(L / 20), fL = Math.floor(La / 10);
    const sl = Math.floor((L % 20) / 2), sL = Math.floor(La % 10);
    const ssLon = Math.floor((L % 2) * 12), ssLat = Math.floor((La % 1) * 24);
    return String.fromCharCode(65+fl) + String.fromCharCode(65+fL) +
           String(sl) + String(sL) +
           String.fromCharCode(97+ssLon) + String.fromCharCode(97+ssLat);
  },

  // ============ 辅助函数 ============

  parseCallsignSsid(callsign) {
    if (!callsign) return { call: '', ssid: '' };
    const m = callsign.match(/^(.+?)(?:-(\d+))?$/);
    return m ? { call: m[1], ssid: m[2] || '0' } : { call: callsign, ssid: '0' };
  },

  isSameOperator(a, b) {
    return this.parseCallsignSsid(a).call === this.parseCallsignSsid(b).call;
  },

  formatElapsed(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    const remS = s % 60;
    if (s < 3600) return m + 'm' + remS + 's';
    const h = Math.floor(s / 3600);
    const remM = Math.floor((s % 3600) / 60);
    const remSs = s % 60;
    return h + 'h' + remM + 'm' + remSs + 's';
  },

  formatTimeAgo(unixSeconds, nowMs) {
    const diffMs = nowMs - unixSeconds * 1000;
    const diffS = Math.floor(diffMs / 1000);
    if (diffS < 60) return diffS + 's前';
    const diffM = Math.floor(diffS / 60);
    if (diffM < 60) return diffM + 'm前';
    const diffH = Math.floor(diffM / 60);
    if (diffH < 48) return diffH + 'h前';
    return Math.floor(diffH / 24) + 'd前';
  },

  // ============ 服务器列表 — 翻页全量 ============

  async fetchServerListAll() {
    const pageSize = 20, maxPages = 50;
    const all = [];

    try {
      for (let i = 0; i < maxPages; i++) {
        const resp = await this.send({
          type: 'station',
          subType: 'getListRange',
          data: { start: i * pageSize, count: pageSize }
        });
        if (resp.code !== undefined && resp.code !== 0) break;
        // 兼容 firmware 不同返回格式：data 可能是 {list:[]} 或直接是数组
        const payload = resp.data;
        let list;
        if (Array.isArray(payload)) {
          list = payload;
        } else if (payload && Array.isArray(payload.list)) {
          list = payload.list;
        } else if (payload && Array.isArray(payload.data)) {
          list = payload.data;
        } else {
          list = [];
        }
        if (list.length === 0) break;
        all.push(...list);
        if (list.length < pageSize) break;
      }
      this.serverList = all;
    } catch (e) { console.warn('station list:', e.message); }

    // 当前服务器
    try {
      const r = await this.send({ type: 'station', subType: 'getCurrent' });
      if (r.code === 0 && r.data) {
        this.currentServerName = r.data.name || '';
        this._prevServer = this.currentServerName;
        document.getElementById('status-server').textContent = this.currentServerName || '--';
      }
    } catch (e) {}

    this.renderServerList();
    await this.fetchStats();
  },

  // 轮询时走轻量单页（避免每次都翻页）
  async fetchServerList() {
    await this.fetchServerListAll();
  },

  renderServerList() {
    const container = document.getElementById('server-list-container');
    if (!container) return;

    let filtered = this.serverList;
    if (this.serverSearch) {
      filtered = this.serverList.filter(s => {
        const kw = this.serverSearch.toLowerCase();
        const nameMatch = (s.name || '').toLowerCase().includes(kw);
        const uid = s.uid ?? s._id ?? s.id ?? '';
        const uidMatch = String(uid).toLowerCase().includes(kw);
        return nameMatch || uidMatch;
      });
    }

    if (!this.serverList.length) {
      container.innerHTML = '<div class="server-list-empty">加载中...</div>';
      return;
    }
    if (!filtered.length) {
      container.innerHTML = '<div class="server-list-empty">无匹配服务器</div>';
      return;
    }

    container.innerHTML = filtered.map(s => {
      const uid = s.uid ?? s._id ?? s.id ?? '--';
      const active = s.name === this.currentServerName;
      return `<div class="server-item${active ? ' active' : ''}" data-server-name="${s.name}">
        <span class="server-item-uid">#${uid}</span>
        <span class="server-item-name">${s.name || '--'}</span>
        <span>
          <span class="server-item-count">${s.onlineCount ?? s.count ?? '--'} 在线</span>
          ${active ? '<span class="server-item-check">✓</span>' : ''}
        </span>
      </div>`;
    }).join('');

    container.querySelectorAll('.server-item').forEach(el => {
      el.addEventListener('click', () => this.switchServer(el.dataset.serverName));
    });
  },

  async switchServer(name) {
    if (name === this.currentServerName) return;

    // 保存切换前服务器，失败时回退
    this._prevServer = this.currentServerName;

    // 先更新 UI 为切换中状态，再发请求
    document.getElementById('status-server').textContent = name + ' …';
    this.currentServerName = name;
    this.renderServerList();

    try {
      const target = this.serverList.find(s => s.name === name);
      const uid = target ? (target.uid ?? target._id ?? target.id) : undefined;
      const data = { name };
      if (uid !== undefined) data.uid = uid;

      const resp = await this.send({ type: 'station', subType: 'setCurrent', data });
      if (resp.code === 0) {
        document.getElementById('status-server').textContent = name;
        this.renderServerList();
      } else {
        // 失败回退
        document.getElementById('status-server').textContent = this._prevServer || '--';
        this.currentServerName = this._prevServer || '';
        this.renderServerList();
        return;
      }
    } catch (e) {
      console.warn('switchServer:', e.message);
      document.getElementById('status-server').textContent = this._prevServer || '--';
      this.currentServerName = this._prevServer || '';
      this.renderServerList();
      return;
    }

    await this.fetchQsoListAll();
    await this.fetchStats();
  },

  // ============ 通联统计 ============

  async fetchStats() {
    await Promise.all([
      (async () => {
        try {
          const r = await this.send({ type: 'qso', subType: 'getTodayCount' });
          if (r.code === 0) document.getElementById('stat-today').textContent = r.data?.count ?? '--';
        } catch (e) {}
      })(),
      (async () => {
        try {
          const r = await this.send({ type: 'qso', subType: 'getTotalCount' });
          if (r.code === 0) document.getElementById('stat-total').textContent = r.data?.count ?? '--';
        } catch (e) {}
      })(),
      (async () => {
        try {
          const r = await this.send({ type: 'qso', subType: 'getContactCount' });
          if (r.code === 0) document.getElementById('stat-contacts').textContent = r.data?.count ?? '--';
        } catch (e) {}
      })()
    ]);
  },

  // ============ QSO 列表 — qso.getList 分页全量 ============

  async fetchQsoListAll() {
    const maxPages = 200;
    const all = [];
    let detectedPageSize = 20;

    try {
      for (let page = 0; page < maxPages; page++) {
        const resp = await this.send({
          type: 'qso',
          subType: 'getList',
          data: { page, count: 20 }
        });
        if (resp.code !== 0) break;
        const payload = resp.data;
        const list = payload?.list ?? [];
        if (list.length === 0) break;

        all.push(...list);

        if (page === 0) detectedPageSize = list.length;
        if (list.length < detectedPageSize) break;
      }
    } catch (e) { console.warn('qso list:', e.message); }

    this.qsoList = all;
    this.renderQsoList();
  },

  renderQsoList() {
    const container = document.getElementById('qso-container');
    if (!container) return;

    if (!this.qsoList.length) {
      container.innerHTML = '<div class="idle-text" style="padding:20px;text-align:center">暂无通联记录</div>';
      return;
    }

    // 最新的 50 条
    const items = this.qsoList.slice(0, 50);
    container.innerHTML = items.map(item => {
      const ts = item.timestamp ? new Date(item.timestamp * 1000) : null;
      const timeStr = ts
        ? `${ts.getFullYear()}/${String(ts.getMonth()+1).padStart(2,'0')}/${String(ts.getDate()).padStart(2,'0')} ${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}`
        : '--';
      return `<div class="qso-item">
        <span class="qso-logid">#${item.logId ?? '--'}</span>
        <span class="qso-callsign">${item.toCallsign ?? item.callsign ?? '--'}</span>
        <span class="qso-grid">${item.grid ?? item.locator ?? '--'}</span>
        <span class="qso-time">${timeStr}</span>
      </div>`;
    }).join('');
  },

  addQsoItem(qso) {
    this.qsoList.unshift(qso);
    this.renderQsoList();
    const first = document.querySelector('.qso-item');
    if (first) first.classList.add('new-highlight');
    this.fetchStats();
  },

  // ============ Speaking Bar ============

  /**
   * 方位角 → 中文方向文字（8 方位）
   */
  _azimuthToDirection(azimuth) {
    const a = ((azimuth % 360) + 360) % 360;
    const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    return dirs[Math.round(a / 45) % 8];
  },

  /**
   * 从 QSO 列表推导台站附属信息（当事件未提供时兜底）
   * 返回 { grid, distance, azimuth, altitude }，未找到的字段为 undefined
   */
  _deriveStationInfo(callsign) {
    const result = {};
    if (!callsign || !this.qsoList.length) return result;

    // 查找最近一条包含该呼号的 QSO（按时间戳降序）
    const matchingQsos = this.qsoList.filter(q => {
      const qc = q.toCallsign || q.callsign || '';
      return this.isSameOperator(qc, callsign);
    });
    if (!matchingQsos.length) return result;
    const qso = matchingQsos.reduce((latest, q) =>
      (q.timestamp || 0) > (latest.timestamp || 0) ? q : latest
    );

    if (qso.grid || qso.locator) result.grid = qso.grid || qso.locator;
    const d = qso.distance ?? qso.dist;
    if (d !== undefined) result.distance = d;
    const a = qso.azimuth ?? qso.az ?? qso.bearing;
    if (a !== undefined) result.azimuth = a;
    if (qso.altitude !== undefined) result.altitude = qso.altitude;

    // 若 QSO 无 distance/azimuth，尝试从双方网格计算
    if (result.grid && (result.distance === undefined || result.azimuth === undefined)) {
      const computed = this._computeGridDistance(result.grid);
      if (computed) {
        if (result.distance === undefined) result.distance = computed.distance;
        if (result.azimuth === undefined) result.azimuth = computed.azimuth;
      }
    }

    return result;
  },

  /**
   * 从远程网格计算与我站之间的距离(km)和方位角(°)。
   * 网格中心点近似（6 位精度 ~ 3' 以内）。
   */
  _computeGridDistance(remoteGrid) {
    try {
      const selfLat = this._myLat;
      const selfLon = this._myLon;
      if (selfLat === undefined || selfLon === undefined) return null;

      // 解析 Maidenhead 6 位网格→经纬度（字段中心）
      const g = remoteGrid.toUpperCase();
      if (g.length < 4) return null;

      // 字段 AA-Field
      const fieldLon = (g.charCodeAt(0) - 65) * 20 - 180;
      const fieldLat = (g.charCodeAt(1) - 65) * 10 - 90;
      // 方格 Square (0-9)
      const sqLon = parseInt(g[2]) * 2;
      const sqLat = parseInt(g[3]) * 1;
      // 小区 Sub-square (a-x)
      const subLon = g.length >= 6 ? (g.charCodeAt(4) - 65) * (5 / 60) : 0;
      const subLat = g.length >= 6 ? (g.charCodeAt(5) - 65) * (2.5 / 60) : 0;

      const lat = fieldLat + sqLat + subLat + (2.5 / 120);  // 中心
      const lon = fieldLon + sqLon + subLon + (5 / 120);

      return this._calcDistanceAzimuth(selfLat, selfLon, lat, lon);
    } catch (e) {
      return null;
    }
  },

  _calcDistanceAzimuth(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const rLat1 = lat1 * Math.PI / 180;
    const rLat2 = lat2 * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = Math.round(R * c);

    const y = Math.sin(dLon) * Math.cos(rLat2);
    const x = Math.cos(rLat1) * Math.sin(rLat2) -
              Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);
    let azimuth = Math.atan2(y, x) * 180 / Math.PI;
    if (azimuth < 0) azimuth += 360;
    azimuth = Math.round(azimuth);

    return { distance, azimuth };
  },

  /**
   * 参照 FmoLogs getServerName()：通过 addressId 在 serverList 中查找服务器名称
   * addressId 可能是 uid/id/address 中的任意一个
   * 返回 { name, uid }，未找到返回空对象
   */
  _lookupServerName(addressId) {
    if (!addressId || !this.serverList.length) return {};
    const match = this.serverList.find(s => {
      if (String(s.uid ?? s._id ?? s.id ?? '') === String(addressId)) return true;
      if (String(s.address ?? '') === String(addressId)) return true;
      if (String(s.name ?? '') === String(addressId)) return true;
      return false;
    });
    if (match) {
      return {
        name: match.name || '',
        uid: String(match.uid ?? match._id ?? match.id ?? '')
      };
    }
    return {};
  },

  showSpeaking(data) {
    this._currentSpeaker = {
      callsign: data.callsign || '',
      grid: data.grid || '',
      isHost: data.isHost || false,
      distance: data.distance,
      azimuth: data.azimuth,
      altitude: data.altitude,
      serverName: data.serverName || '',
      serverUid: data.serverUid || '',
      startedAtMs: Date.now(),
    };

    // 若事件未提供 serverName，依次从 qsoList / serverList 兜底查找
    let serverUid = this._currentSpeaker.serverUid;
    let serverName = this._currentSpeaker.serverName;
    if (!serverName) {
      // 先查 qsoList（同呼号的历史 QSO 可能记录了 server）
      const matchingQso = this.qsoList.find(q => {
        const qc = q.toCallsign || q.callsign || '';
        return this.isSameOperator(qc, data.callsign);
      });
      if (matchingQso) {
        serverUid = matchingQso.serverUid || matchingQso.addressId || '';
        serverName = matchingQso.serverName || '';
      }
      // qsoList 无结果，尝试从 serverList 反问
      if (!serverName && serverUid) {
        const srv = this._lookupServerName(serverUid);
        if (srv.name) {
          serverName = srv.name;
          serverUid = srv.uid || serverUid;
        }
      }
      this._currentSpeaker.serverName = serverName;
      this._currentSpeaker.serverUid = serverUid;
    }

    // 若事件数据缺少 grid/distance/azimuth，立即从 QSO 补全
    const sp = this._currentSpeaker;
    if (!sp.grid || sp.distance === undefined || sp.azimuth === undefined) {
      const derived = this._deriveStationInfo(data.callsign);
      if (!sp.grid && derived.grid) sp.grid = derived.grid;
      if (sp.distance === undefined && derived.distance !== undefined) sp.distance = derived.distance;
      if (sp.azimuth === undefined && derived.azimuth !== undefined) sp.azimuth = derived.azimuth;
      if (sp.altitude === undefined && derived.altitude !== undefined) sp.altitude = derived.altitude;
    }

    // 若无 grid 但有 QSO grid，更新 speaking record
    this._addSpeakingRecord(data.callsign, sp.grid, serverUid, serverName);

    if (this._speakingTimer) {
      clearInterval(this._speakingTimer);
    }

    this.renderSpeakingBar();

    this._speakingTimer = setInterval(() => {
      this.renderSpeakingBar();
    }, 1000);
  },

  hideSpeaking() {
    if (this._speakingTimer) {
      clearInterval(this._speakingTimer);
      this._speakingTimer = null;
    }
    this._finishSpeakingRecords();
    this._currentSpeaker = null;
    const bar = document.getElementById('speaking-bar');
    if (bar) {
      bar.innerHTML = `
        <span class="speaking-indicator idle"></span>
        <span class="speaking-text">当前无人发言</span>
        <div class="vu-meter"><div class="vu-meter-fill" style="width:0%"></div></div>
      `;
    }
  },

  _addSpeakingRecord(callsign, grid, serverUid, serverName) {
    if (!callsign) return;
    const now = Date.now();
    // 将之前的未结束记录全部结束
    this._speakingHistory.forEach(h => { if (!h.endTime) h.endTime = now; });
    // 检查是否已有该呼号的历史记录
    const existing = this._speakingHistory.find(h => h.callsign === callsign);
    if (existing) {
      // 移动该记录到最前面
      const idx = this._speakingHistory.indexOf(existing);
      this._speakingHistory.splice(idx, 1);
      existing.startTime = now;
      existing.endTime = null;
      existing.grid = grid || existing.grid;
      if (serverUid) existing.serverUid = serverUid;
      if (serverName) existing.serverName = serverName;
      this._speakingHistory.unshift(existing);
    } else {
      this._speakingHistory.unshift({
        callsign,
        grid: grid || '',
        startTime: now,
        endTime: null,
        serverUid: serverUid || '',
        serverName: serverName || ''
      });
    }
    this._cleanupOldHistory();
    this.renderRecentSpeakers();
  },

  _finishSpeakingRecords() {
    const now = Date.now();
    this._speakingHistory.forEach(h => { if (!h.endTime) h.endTime = now; });
    this.renderRecentSpeakers();
  },

  _cleanupOldHistory() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this._speakingHistory = this._speakingHistory.filter(h => (h.endTime || h.startTime) > oneHourAgo);
    const oneHourAgoSec = Math.floor(oneHourAgo / 1000);
    this._historyEvents = this._historyEvents.filter(e => e.utcTime > oneHourAgoSec);
  },

  renderRecentSpeakers() {
    const container = document.getElementById('recent-speakers');
    if (!container) return;

    // 构建通联次数 Map
    const contactCounts = new Map();
    this.qsoList.forEach(q => {
      const qc = q.toCallsign || q.callsign || '';
      if (qc) {
        const call = this.parseCallsignSsid(qc).call;
        contactCounts.set(call, (contactCounts.get(call) || 0) + 1);
      }
    });

    // 正在发言的呼号集合
    const activeCallsigns = new Set();
    this._speakingHistory.forEach(h => { if (!h.endTime) activeCallsigns.add(h.callsign); });
    if (this._currentSpeaker?.callsign) {
      activeCallsigns.add(this._currentSpeaker.callsign);
    }

    // 优先使用 _historyEvents，为空时用 _speakingHistory
    let items = [];
    if (this._historyEvents.length > 0) {
      // 取最近10条，去重
      const seen = new Set();
      for (const evt of this._historyEvents) {
        const call = this.parseCallsignSsid(evt.callsign).call;
        if (!seen.has(call)) {
          seen.add(call);
          items.push({
            callsign: evt.callsign,
            utcTime: evt.utcTime
          });
          if (items.length >= 10) break;
        }
      }
    } else {
      items = this._speakingHistory.slice(0, 10).map(h => ({
        callsign: h.callsign,
        utcTime: Math.floor((h.endTime || h.startTime) / 1000)
      }));
    }

    if (!items.length) {
      container.innerHTML = '';
      return;
    }

    const now = Date.now();
    container.innerHTML = items.map((item, index) => {
      const call = this.parseCallsignSsid(item.callsign).call;
      const count = contactCounts.get(call) || 0;
      const timeStr = this.formatTimeAgo(item.utcTime, now);
      const isActive = activeCallsigns.has(item.callsign);
      return '<div class="recent-item' + (isActive ? ' is-speaking' : '') + '" data-callsign="' + item.callsign + '">'
        + '<span class="recent-index-bg">' + (index + 1) + '</span>'
        + '<div class="recent-main">'
        + '<div class="recent-callsign-line"><strong>' + item.callsign + '</strong></div>'
        + '<span>' + timeStr + '</span>'
        + '</div>'
        + '<span class="recent-count">x' + count + '</span>'
        + '</div>';
    }).join('');
  },

  renderSpeakingBar() {
    const bar = document.getElementById('speaking-bar');
    if (!bar) return;

    const sp = this._currentSpeaker;
    if (!sp) return;

    const elapsed = Date.now() - sp.startedAtMs;
    const elapsedStr = this.formatElapsed(elapsed);

    // 兜底：distance / azimuth / altitude 缺失时从 _deriveStationInfo 或 grid 计算补全
    if (sp.distance === undefined || sp.azimuth === undefined || sp.altitude === undefined) {
      const derived = this._deriveStationInfo(sp.callsign);
      if (sp.distance === undefined && derived.distance !== undefined) sp.distance = derived.distance;
      if (sp.azimuth === undefined && derived.azimuth !== undefined) sp.azimuth = derived.azimuth;
      if (sp.altitude === undefined && derived.altitude !== undefined) sp.altitude = derived.altitude;
      if (!sp.grid && derived.grid) sp.grid = derived.grid;
      
      // 如果 QSO 有 grid 但仍无 distance/azimuth，直接用 grid 计算
      if (sp.grid && (sp.distance === undefined || sp.azimuth === undefined)) {
        const computed = this._computeGridDistance(sp.grid);
        if (computed) {
          if (sp.distance === undefined) sp.distance = computed.distance;
          if (sp.azimuth === undefined) sp.azimuth = computed.azimuth;
        }
      }
    }

    // 组装附件标签（FmoLogs 风格：无卡片化徽章）
    let tags = '';

    // HOST
    if (sp.isHost) {
      tags += '<span class="speaking-tag">[HOST]</span>';
    }

    // 自己
    const isSelf = this.isSameOperator(sp.callsign, this.myCallsign);
    if (isSelf) {
      tags += '<span class="speaking-tag">自己</span>';
    }

    // 通联次数 / 新朋友
    const qsos = this.qsoList.filter(q => {
      const toCall = q.toCallsign || q.callsign || '';
      return this.isSameOperator(toCall, sp.callsign);
    });
    if (!isSelf && qsos.length === 1) {
      tags += '<span class="speaking-tag" style="color:var(--warn)">✦新朋友</span>';
    } else if (qsos.length > 1) {
      tags += `<span class="speaking-count">x${qsos.length}</span>`;
    }

    // 方位角 + 距离 + Grid（FmoLogs 风格：放在呼号之后、徽章之前）
    let meta = '';
    if (sp.azimuth !== undefined && sp.azimuth !== null) {
      const dir = this._azimuthToDirection(sp.azimuth);
      meta += `<span class="speaking-meta"><svg class="speaking-arrow" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" style="transform:rotate(${sp.azimuth}deg)"><path d="M512 512m-512 0a512 512 0 1 0 1024 0 512 512 0 1 0-1024 0Z" fill="#F93008" opacity=".7"/><path d="M512 512m-361.411765 0a361.411765 361.411765 0 1 0 722.82353 0 361.411765 361.411765 0 1 0-722.82353 0Z" fill="#F9A594" opacity=".7"/><path d="M512 150.588235l-210.823529 602.352941 210.823529-78.305882 210.823529 78.305882z" fill="#FFFFFF"/></svg> 方位 ${dir}${sp.azimuth}°</span>`;
    }
    if (sp.distance !== undefined && sp.distance !== null) {
      meta += `<span class="speaking-meta distance">${Number(sp.distance).toFixed(1)}km</span>`;
    }
    if (sp.grid) {
      meta += `<span class="speaking-meta">${sp.grid}</span>`;
    }

    // 服务器名
    if (sp.serverName) {
      tags += `<span class="speaking-tag">[${sp.serverName}]</span>`;
    }

    // elapsed
    tags += `<span class="speaking-elapsed">${elapsedStr}</span>`;

    bar.innerHTML = `
      <span class="speaking-indicator speaking"></span>
      <span class="speaking-text">
        正在发言: <strong>${sp.callsign || '--'}</strong>
        ${meta}
        ${tags}
      </span>
      <div class="vu-meter"><div class="vu-meter-fill" style="width:${this.vuLevel}%"></div></div>
    `;
  },

  // ============ VU / 频谱 ============

  updateVU(level) {
    this.vuLevel = Math.min(100, level);
    const fill = document.querySelector('.vu-meter-fill');
    if (fill) fill.style.width = this.vuLevel + '%';
    this.updateMiniSpectrum();
  },

  updateMiniSpectrum() {
    const container = document.getElementById('mini-spectrum');
    if (!container) return;

    const bars = 24;
    const raw = this._lastAudioChunk;
    if (!raw || raw.length < 256) {
      // 无音频数据时显示基线（低噪声条）
      let html = '';
      for (let i = 0; i < bars; i++) {
        html += `<div class="bar" style="height:2px;opacity:0.25"></div>`;
      }
      container.innerHTML = html;
      return;
    }

    // 取 2 的幂次样本做 FFT（1024 样本 @ 8kHz = 128ms 窗口）
    const N = 1024;
    const samples = new Float32Array(N);
    const src = raw.length >= N ? raw.slice(raw.length - N) : raw;
    const offset = raw.length >= N ? 0 : N - src.length;
    const hann = (i) => 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
    for (let i = 0; i < src.length; i++) {
      samples[offset + i] = (src[i] / 32768) * hann(i + offset);
    }

    // Radix-2 FFT（Cooley-Tukey）
    const fft = (re, im) => {
      const n = re.length;
      // bit-reversal
      for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
      }
      for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len;
        const wRe = Math.cos(ang), wIm = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
          let curRe = 1, curIm = 0;
          for (let j = 0; j < len / 2; j++) {
            const a = i + j, b = i + j + len / 2;
            const tRe = curRe * re[b] - curIm * im[b];
            const tIm = curRe * im[b] + curIm * re[b];
            re[b] = re[a] - tRe; im[b] = im[a] - tIm;
            re[a] += tRe; im[a] += tIm;
            const nRe = curRe * wRe - curIm * wIm;
            curIm = curRe * wIm + curIm * wRe;
            curRe = nRe;
          }
        }
      }
    };

    const re = new Float32Array(samples);
    const im = new Float32Array(N);
    fft(re, im);
    const mag = new Float32Array(N / 2);
    for (let i = 0; i < N / 2; i++) {
      mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    }

    // 24 条对数频率 bin：200Hz → 3800Hz（人声频段 + 谐波），@ Nyquist=4000Hz
    const sampleRate = 8000;
    const fMin = 200, fMax = 3800;
    const binEdges = [];
    for (let i = 0; i <= bars; i++) {
      binEdges.push(fMin * Math.pow(fMax / fMin, i / bars));
    }

    const binValues = new Array(bars).fill(0);
    for (let i = 1; i < N / 2; i++) {
      const freq = i * sampleRate / N;
      if (freq < fMin || freq > fMax) continue;
      // 找到所属 bin
      let b = 0;
      while (b < bars && freq > binEdges[b + 1]) b++;
      binValues[b] = Math.max(binValues[b], mag[i]);
    }

    // 归一化并平滑
    const maxMag = binValues.reduce((a, b) => Math.max(a, b), 0.001);
    const maxHeight = 48;
    if (!this._specHistory || this._specHistory.length !== bars) {
      this._specHistory = new Array(bars).fill(0);
    }

    let html = '';
    for (let i = 0; i < bars; i++) {
      const target = Math.min(1, binValues[i] / (maxMag * 1.5));
      const prev = this._specHistory[i];
      const smoothed = prev * 0.55 + target * 0.45;
      this._specHistory[i] = smoothed;
      const h = Math.max(2, Math.round(smoothed * maxHeight));

      const ratio = smoothed;
      let r, g, b;
      if (ratio < 0.33) {
        const t = ratio / 0.33;
        r = Math.round(t * 200);
        g = Math.round(180 + t * 75);
        b = Math.round(60 - t * 40);
      } else if (ratio < 0.66) {
        const t = (ratio - 0.33) / 0.33;
        r = Math.round(200 + t * 55);
        g = Math.round(255 - t * 100);
        b = Math.round(20 - t * 20);
      } else {
        const t = (ratio - 0.66) / 0.34;
        r = 255;
        g = Math.round(155 - t * 100);
        b = 0;
      }
      html += `<div class="bar" style="height:${h}px;background:rgb(${r},${g},${b});opacity:${0.4 + smoothed * 0.6}"></div>`;
    }
    container.innerHTML = html;
  },

  // ============ 音频 ============

  initAudioCtx() {
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 8000 });
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.volume / 100;
      this.gainNode.connect(this.audioCtx.destination);
    } catch (e) {}
  },

  handleAudioFrame(buf) {
    if (!buf || !this.audioCtx || this.isMuted) {
      if (buf) this.computeVU(buf);
      return;
    }
    this.computeVU(buf);
    // SSTV audio tap
    if (this._sstvActive && buf) {
      const raw16 = new Int16Array(buf);
      const floatSamples = new Float32Array(raw16.length);
      for (let i = 0; i < raw16.length; i++) floatSamples[i] = raw16[i] / 32768;
      this._sstvAudioTap.push(floatSamples);
    }
    const raw = new Int16Array(buf);
    const buffer = this.audioCtx.createBuffer(1, raw.length, 8000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < raw.length; i++) channel[i] = raw[i] / 32768;
    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);
    source.start();
  },

  computeVU(buf) {
    const raw = new Int16Array(buf);
    let sum = 0;
    for (let i = 0; i < raw.length; i++) sum += (raw[i] / 32768) ** 2;
    const rms = Math.sqrt(sum / raw.length);
    const db = 20 * Math.log10(rms + 0.0001);
    this.updateVU(Math.max(0, Math.min(100, (db + 60) * (100 / 60))));
    // 保存最新音频块供 FFT 频谱分析
    this._lastAudioChunk = raw;
  },

  // ============ 轮询 ============

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      if (this.connected) this.fetchServerList();
    }, 30000);
  },

  stopPolling() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    const btn = document.getElementById('mute-btn');
    if (btn) {
      if (this.isMuted) {
        btn.innerHTML = '&#x1F507;';
        btn.classList.add('muted');
      } else {
        btn.innerHTML = '&#x1F50A;';
        btn.classList.remove('muted');
      }
    }
  },

  setVolume(val) {
    this.volume = val;
    if (this.gainNode) {
      this.gainNode.gain.value = val / 100;
    }
    const slider = document.getElementById('volume-slider');
    if (slider) slider.value = val;
  },

  initVolume() {
    const slider = document.getElementById('volume-slider');
    if (slider) {
      slider.value = this.volume;
      slider.addEventListener('input', (e) => this.setVolume(parseInt(e.target.value)));
    }
  },

  exportQso() {
    if (!this.qsoList.length) {
      alert('暂无通联记录可导出');
      return;
    }
    const data = this.qsoList.map(item => {
      const logId = item.logId ?? '';
      const toCallsign = item.toCallsign ?? item.callsign ?? '';
      const grid = item.grid ?? item.locator ?? '';
      const ts = item.timestamp ? new Date(item.timestamp * 1000) : null;
      const timeStr = ts
        ? `${ts.getFullYear()}-${String(ts.getMonth()+1).padStart(2,'0')}-${String(ts.getDate()).padStart(2,'0')} ${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}:${String(ts.getSeconds()).padStart(2,'0')}`
        : '';
      const frequency = item.frequency ?? item.freq ?? '';
      const mode = item.mode ?? '';
      const repeater = item.repeater ?? item.relay ?? '';
      const memo = item.memo ?? item.message ?? '';
      return { logId, toCallsign, grid, timestamp: item.timestamp, timeStr, frequency, mode, repeater, memo };
    });
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const filename = `fmo-qso-export-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}.db`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // ============ 设置 ============

  openSettings() {
    document.getElementById('settings-overlay').classList.add('open');
    const raw = localStorage.getItem('fmo-settings');
    if (raw) {
      try {
        const { ip, port, protocol } = JSON.parse(raw);
        document.getElementById('fmo-ip').value = ip || '';
        document.getElementById('fmo-port').value = port || '80';
        document.getElementById('fmo-protocol').value = protocol || 'ws';
      } catch (e) {}
    }
  },
  closeSettings() { document.getElementById('settings-overlay').classList.remove('open'); },
  saveSettings() {
    const ip = document.getElementById('fmo-ip').value.trim();
    const port = document.getElementById('fmo-port').value.trim() || '80';
    const protocol = document.getElementById('fmo-protocol').value;
    if (!ip) return;
    this.protocol = protocol;
    localStorage.setItem('fmo-settings', JSON.stringify({ ip, port, protocol }));
    this.closeSettings();
    this.connect(ip, port);
  },

  // ============ SSTV 解码 ============

  /* 参照 FmoDeck 重写的 FM 解调 + VIS 检测 + Goertzel */

  _goertzel(samples, targetHz, sampleRate) {
    const omega = (2 * Math.PI * targetHz) / sampleRate;
    const coeff = 2 * Math.cos(omega);
    let s0 = 0, s1 = 0, s2 = 0;
    for (let i = 0; i < samples.length; i++) {
      s0 = samples[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    return s1 * s1 + s2 * s2 - s1 * s2 * coeff;
  },

  _applyBiquad(x, b0, b1, b2, a1, a2) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let n = 0; n < x.length; n++) {
      const xn = x[n];
      const yn = b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = xn;
      y2 = y1; y1 = yn;
      x[n] = yn;
    }
  },

  _toAnalytic(samples, sampleRate, centerHz, cutoffHz) {
    const n = samples.length;
    const i = new Float32Array(n);
    const q = new Float32Array(n);
    const omegaC = (2 * Math.PI * centerHz) / sampleRate;
    for (let k = 0; k < n; k++) {
      const phase = omegaC * k;
      i[k] = samples[k] * Math.cos(phase);
      q[k] = -samples[k] * Math.sin(phase);
    }
    const omega = (2 * Math.PI * cutoffHz) / sampleRate;
    const alpha = Math.sin(omega) / (2 * Math.SQRT1_2);
    const cosW = Math.cos(omega);
    const a0 = 1 + alpha;
    const b0 = (1 - cosW) / 2 / a0;
    const b1 = (1 - cosW) / a0;
    const b2 = b0;
    const a1 = (-2 * cosW) / a0;
    const a2 = (1 - alpha) / a0;
    this._applyBiquad(i, b0, b1, b2, a1, a2);
    this._applyBiquad(q, b0, b1, b2, a1, a2);
    return { i, q };
  },

  _instantFreq(i, q, sampleRate, centerHz) {
    const n = i.length;
    const out = new Float32Array(n);
    out[0] = centerHz;
    const scale = sampleRate / (2 * Math.PI);
    for (let k = 1; k < n; k++) {
      const re = i[k] * i[k - 1] + q[k] * q[k - 1];
      const im = q[k] * i[k - 1] - i[k] * q[k - 1];
      out[k] = centerHz + scale * Math.atan2(im, re);
    }
    return out;
  },

  _fmDemodulate(samples, sampleRate, warmupSamples) {
    if (!warmupSamples) warmupSamples = 0;
    const { i, q } = this._toAnalytic(samples, sampleRate, 1900, 600);
    const freq = this._instantFreq(i, q, sampleRate, 1900);
    return warmupSamples > 0 ? freq.subarray(warmupSamples) : freq;
  },

  /* FmoDeck VIS 检测器: 在原 PCM 上做 Goertzel 音调检测, 完整前导+bit+parity 校验 */

  _visDetect(samples, sampleRate) {
    const bs = Math.round((30 / 1000) * sampleRate); // bit=30ms
    const step = Math.max(1, Math.floor(bs / 4));
    const n = samples.length;
    const preambleSamples = Math.round((300 * 2 + 10) / 1000 * sampleRate); // 300+10+300ms

    const isLeader1900 = (start, len) => {
      if (start < 0 || start + len > n) return false;
      const e1900 = this._goertzel(samples.subarray(start, start + len), 1900, sampleRate);
      const e2400 = this._goertzel(samples.subarray(start, start + len), 2400, sampleRate);
      return e1900 > e2400 * 3;
    };

    const hasPreamble = (startBitOff) => {
      const leaderCoreSamples = Math.round((200 / 1000) * sampleRate);
      const firstCoreStart = startBitOff - Math.round(((300 + 10 + 300 - 250) / 1000) * sampleRate);
      const secondCoreStart = startBitOff - Math.round(((300 - 250) / 1000) * sampleRate);
      const leader1Ok = isLeader1900(firstCoreStart, leaderCoreSamples);
      const leader2Ok = isLeader1900(secondCoreStart, leaderCoreSamples);
      if (!leader1Ok && !leader2Ok) return false;
      const searchStart = startBitOff - Math.round(((300 + 10 + 20) / 1000) * sampleRate);
      const searchEnd = startBitOff - Math.round(((300 + 10 - 20) / 1000) * sampleRate);
      for (let off = searchStart; off + Math.round((10 / 1000) * sampleRate) <= searchEnd; off += Math.max(1, Math.floor(sampleRate / 500))) {
        const win = samples.subarray(off, off + Math.round((10 / 1000) * sampleRate));
        const e1200 = this._goertzel(win, 1200, sampleRate);
        const e1700 = this._goertzel(win, 1700, sampleRate);
        if (e1200 > e1700 * 3) return true;
      }
      return false;
    };

    const bitValue = (off) => {
      if (off + bs > n) return -1;
      const win = samples.subarray(off, off + bs);
      const e1100 = this._goertzel(win, 1100, sampleRate);
      const e1300 = this._goertzel(win, 1300, sampleRate);
      const noiseFloor = this._goertzel(win, 500, sampleRate);
      const max = Math.max(e1100, e1300);
      if (max < noiseFloor * 3) return -1;
      return e1100 > e1300 ? 1 : 0;
    };

    const isStartBit1200 = (off) => {
      if (off + bs > n) return false;
      const win = samples.subarray(off, off + bs);
      const e1200 = this._goertzel(win, 1200, sampleRate);
      const e1700 = this._goertzel(win, 1700, sampleRate);
      const e1900 = this._goertzel(win, 1900, sampleRate);
      return e1200 > e1700 * 3 && e1200 > e1900 * 3;
    };

    for (let s = preambleSamples; s + 10 * bs <= n; s += step) {
      if (!hasPreamble(s)) continue;
      if (!isStartBit1200(s)) continue;
      let code = 0, ok = true;
      for (let b = 0; b < 8; b++) {
        const v = bitValue(s + (1 + b) * bs);
        if (v === -1) { ok = false; break; }
        if (v === 1) code |= (1 << b);
      }
      if (!ok) continue;
      let pc = 0, cv = code;
      while (cv) { pc += cv & 1; cv >>>= 1; }
      if (pc % 2 !== 0) continue;
      const stopOff = s + 9 * bs;
      const win = samples.subarray(stopOff, stopOff + bs);
      const e1200 = this._goertzel(win, 1200, sampleRate);
      const e1700 = this._goertzel(win, 1700, sampleRate);
      if (e1200 <= e1700 * 3) continue;
      return { visCode: code, endOffset: n - (stopOff + bs) };
    }
    return null;
  },

  _sstvTick() {
    if (!this._sstvActive || !this._sstvAudioTap) return;
    const tap = this._sstvAudioTap;
    const SR = 8000;
    const MODE = ROBOT36_MODE;
    const WARMUP_MS = 5; // LPF transient discard
    const warmupSamples = Math.round((WARMUP_MS * SR) / 1000);

    if (this._sstvState === 'idle') {
      const recent = tap.recent(1200, SR);
      if (recent.length < 800) return;
      const vis = this._visDetect(recent, SR);
      if (vis && vis.visCode === MODE.visCode) {
        this._sstvState = 'decoding';
        this._sstvMode = MODE;
        this._sstvNextScanLine = 0;
        this._sstvT0 = tap.totalWritten - vis.endOffset;
        this._sstvFullRgba = new Uint8ClampedArray(MODE.width * MODE.height * 4);
        this._sstvYbuf = null;
        this._sstvRYbuf = null;
        this._sstvBYbuf = null;
        this._sstvSyncWin0 = [];
        this._sstvSyncWin1 = [];

        document.getElementById('sstv-status').textContent = '解码中...';
        document.getElementById('sstv-status').classList.add('active');
        document.getElementById('sstv-mode-badge').textContent = MODE.name;
        document.getElementById('sstv-mode-badge').classList.add('visible');

        const ctx = this._sstvCanvasCtx;
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, 640, 480);
        this._sstvOffCtx.fillStyle = '#111';
        this._sstvOffCtx.fillRect(0, 0, 320, 240);
      }
      return;
    }

    if (this._sstvState === 'decoding') {
      const MODE = this._sstvMode;
      const SR = 8000;
      const warmupSamples = Math.round((5 * SR) / 1000);
      const rowSamples = Math.round(MODE.scanLineMs * SR / 1000);

      const elapsedSamples = tap.totalWritten - this._sstvT0;
      const elapsedMs = (elapsedSamples / SR) * 1000;
      const targetScanLine = Math.floor(elapsedMs / MODE.scanLineMs);

      this._updateSignalBar(targetScanLine);

      // Process scan lines in pairs (Robot 36: each pair = Y[even],Cr,Y[odd],Cb)
      while (this._sstvNextScanLine + 1 < Math.min(targetScanLine, MODE.totalScanLines)) {
        const lnEven = this._sstvNextScanLine;
        const lnOdd = lnEven + 1;
        const oldest = Math.max(0, tap.totalWritten - tap.capacity);

        const startEven = this._sstvT0 + Math.round(lnEven * MODE.scanLineMs * SR / 1000);
        const actualWarmupEven = Math.max(0, Math.min(warmupSamples, startEven - oldest));
        const samplesEven = tap.slice(startEven - actualWarmupEven, rowSamples + actualWarmupEven);
        if (!samplesEven || samplesEven.length < 100) break;

        const startOdd = this._sstvT0 + Math.round(lnOdd * MODE.scanLineMs * SR / 1000);
        const actualWarmupOdd = Math.max(0, Math.min(warmupSamples, startOdd - oldest));
        const samplesOdd = tap.slice(startOdd - actualWarmupOdd, rowSamples + actualWarmupOdd);
        if (!samplesOdd || samplesOdd.length < 100) break;

        const rgba = this._decodeSstvLinePair(samplesEven, samplesOdd, SR, MODE,
          actualWarmupEven, actualWarmupOdd);

        const firstRow = lnEven; // 0, 2, 4, ..., 34
        const rowOffset = firstRow * MODE.width * 4;
        this._sstvFullRgba.set(rgba, rowOffset);
        this._renderSstvRows(firstRow, 2);

        this._sstvNextScanLine += 2;
      }

      if (this._sstvNextScanLine >= MODE.totalScanLines) {
        this._sstvState = 'done';
        this._renderSstvFull();
        const dataUrl = this._sstvCanvasCtx.canvas.toDataURL('image/png');
        this._addSstvToHistory(MODE.name, dataUrl);

        document.getElementById('sstv-status').textContent = '解码完成';
        document.getElementById('sstv-status').classList.add('active');

        const self = this;
        setTimeout(() => {
          if (self._sstvState === 'done') {
            self._sstvState = 'idle';
            self._sstvFullRgba = null;
            self._sstvMode = null;
            self._sstvYbuf = null;
            self._sstvRYbuf = null;
            self._sstvBYbuf = null;
            self._sstvSyncWin0 = [];
            self._sstvSyncWin1 = [];
            document.getElementById('sstv-status').textContent = '等待信号...';
            document.getElementById('sstv-status').classList.remove('active');
            document.getElementById('sstv-mode-badge').classList.remove('visible');
            self._clearSignalBar();
          }
        }, 3000);
        return;
      }

      if (elapsedMs > MODE.scanLineMs * MODE.totalScanLines * 1.1) {
        this._renderSstvFull();
        const dataUrl = this._sstvCanvasCtx.canvas.toDataURL('image/png');
        this._addSstvToHistory(MODE.name + ' (未完整)', dataUrl);

        this._sstvState = 'idle';
        this._sstvFullRgba = null;
        this._sstvMode = null;
        this._sstvYbuf = null;
        this._sstvRYbuf = null;
        this._sstvBYbuf = null;
        this._sstvSyncWin0 = [];
        this._sstvSyncWin1 = [];
        document.getElementById('sstv-status').textContent = '等待信号...';
        document.getElementById('sstv-status').classList.remove('active');
        document.getElementById('sstv-mode-badge').classList.remove('visible');
        this._clearSignalBar();
      }
    }
  },

  // ============ SSTV Robot 36 像素解码（参照 FmoDeck） ============

  _ycbcrToRgb(y, cb, cr) {
    const cbb = cb - 128;
    const crr = cr - 128;
    const r = y + 1.402 * crr;
    const g = y - 0.344136 * cbb - 0.714136 * crr;
    const b = y + 1.772 * cbb;
    return [
      Math.max(0, Math.min(255, Math.round(r))),
      Math.max(0, Math.min(255, Math.round(g))),
      Math.max(0, Math.min(255, Math.round(b)))
    ];
  },

  _detectSstvSync(freq, sampleRate, syncMs, searchMs) {
    const searchSamples = Math.min(freq.length, Math.round((searchMs * sampleRate) / 1000));
    const winSamples = Math.max(4, Math.round((syncMs * sampleRate) / 1000));
    if (searchSamples < winSamples + 4) return 0;

    let sum = 0;
    for (let k = 0; k < winSamples; k++) sum += freq[k] || 0;

    let bestCenterIdx = winSamples / 2;
    let bestDist = Infinity;

    for (let start = 0; start + winSamples <= searchSamples; start++) {
      const mean = sum / winSamples;
      const dist = Math.abs(mean - 1200);
      if (dist < bestDist) {
        bestDist = dist;
        bestCenterIdx = start + winSamples / 2;
      }
      if (start + winSamples < searchSamples) {
        sum += (freq[start + winSamples] || 0) - (freq[start] || 0);
      }
    }

    if (bestDist > 200) return 0;
    const detectedMs = (bestCenterIdx / sampleRate) * 1000;
    return detectedMs - syncMs / 2;
  },

  _hampelFilterSync(window, raw) {
    window.push(raw);
    if (window.length > 5) window.shift();
    if (window.length < 3) return raw;
    const sorted = [...window].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const deviations = window.map(v => Math.abs(v - median)).sort((a, b) => a - b);
    const mad = deviations[Math.floor(deviations.length / 2)];
    if (Math.abs(raw - median) > mad * 3 + 0.01) return median;
    return raw;
  },

  _sampleSstvSection(freq, sampleRate, startMs, endMs, count) {
    const out = new Uint8ClampedArray(count);
    const startIdx = Math.max(0, Math.round((startMs * sampleRate) / 1000));
    const endIdx = Math.min(freq.length, Math.round((endMs * sampleRate) / 1000));
    const sectionSamples = endIdx - startIdx;
    if (sectionSamples <= 0) return out;

    const perPixelSamples = sectionSamples / count;
    const winSamples = Math.min(sectionSamples, Math.max(4, Math.round(perPixelSamples)));

    for (let i = 0; i < count; i++) {
      const centerIdx = startIdx + Math.round((i + 0.5) * perPixelSamples);
      const ws = Math.floor(winSamples / 2);
      const s = Math.max(startIdx, centerIdx - ws);
      const e = Math.min(endIdx, s + winSamples);
      let sum = 0;
      for (let k = s; k < e; k++) sum += freq[k] || 0;
      const avgHz = sum / (e - s);
      out[i] = Math.max(0, Math.min(255, Math.round(((avgHz - 1500) / 800) * 255)));
    }
    return out;
  },

  _decodeSstvLinePair(samplesEven, samplesOdd, sampleRate, mode, warmupEven, warmupOdd) {
    const freqEven = this._fmDemodulate(samplesEven, sampleRate, warmupEven);
    const freqOdd = this._fmDemodulate(samplesOdd, sampleRate, warmupOdd);

    const sync0Raw = this._detectSstvSync(freqEven, sampleRate, mode.syncMs, 20);
    const sync1Raw = this._detectSstvSync(freqOdd, sampleRate, mode.syncMs, 20);

    const sync0 = this._hampelFilterSync(this._sstvSyncWin0, sync0Raw);
    const sync1 = this._hampelFilterSync(this._sstvSyncWin1, sync1Raw);

    // Even line: sync(9)+porch(3)+Y[even](88)+sep(4.5)+porch2(1.5)+Cr(44)
    const yEvenStart = mode.syncMs + mode.porchMs + sync0;
    const yEvenEnd = yEvenStart + mode.yMs;
    const crStart = yEvenEnd + mode.separatorMs + mode.porch2Ms;
    const crEnd = crStart + mode.chromaMs;

    // Odd line: sync(9)+porch(3)+Y[odd](88)+sep(4.5)+porch2(1.5)+Cb(44)
    const yOddStart = mode.syncMs + mode.porchMs + sync1;
    const yOddEnd = yOddStart + mode.yMs;
    const cbStart = yOddEnd + mode.separatorMs + mode.porch2Ms;
    const cbEnd = cbStart + mode.chromaMs;

    const chromaWidth = Math.floor(mode.width / 2); // 160 for Robot 36

    const yEven = this._sampleSstvSection(freqEven, sampleRate, yEvenStart, yEvenEnd, mode.width);
    const cr = this._sampleSstvSection(freqEven, sampleRate, crStart, crEnd, chromaWidth);
    const yOdd = this._sampleSstvSection(freqOdd, sampleRate, yOddStart, yOddEnd, mode.width);
    const cb = this._sampleSstvSection(freqOdd, sampleRate, cbStart, cbEnd, chromaWidth);

    // YCbCr→RGB, 2 rows, chroma subsampling 2:1
    const rgba = new Uint8ClampedArray(mode.width * 2 * 4);
    for (let x = 0; x < mode.width; x++) {
      const ci = x >> 1;
      const crVal = cr[ci] || 128;
      const cbVal = cb[ci] || 128;
      const [r0, g0, b0] = this._ycbcrToRgb(yEven[x] || 128, cbVal, crVal);
      const [r1, g1, b1] = this._ycbcrToRgb(yOdd[x] || 128, cbVal, crVal);
      rgba[x * 4 + 0] = r0;
      rgba[x * 4 + 1] = g0;
      rgba[x * 4 + 2] = b0;
      rgba[x * 4 + 3] = 255;
      rgba[(mode.width + x) * 4 + 0] = r1;
      rgba[(mode.width + x) * 4 + 1] = g1;
      rgba[(mode.width + x) * 4 + 2] = b1;
      rgba[(mode.width + x) * 4 + 3] = 255;
    }
    return rgba;
  },

  _renderSstvRows(firstRow, count) {
    const mode = this._sstvMode;
    if (!mode || !this._sstvFullRgba) return;
    const offCtx = this._sstvOffCtx;
    for (let row = 0; row < count; row++) {
      const y = firstRow + row;
      if (y >= mode.height) break;
      const rowOffset = y * mode.width * 4;
      const rowData = new ImageData(
        new Uint8ClampedArray(this._sstvFullRgba.buffer, rowOffset, mode.width * 4),
        mode.width, 1
      );
      offCtx.putImageData(rowData, 0, y);
    }
    const ctx = this._sstvCanvasCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this._sstvOffCanvas, 0, 0, 640, 480);
  },

  _renderSstvFull() {
    const mode = this._sstvMode;
    if (!mode || !this._sstvFullRgba) return;
    const offCtx = this._sstvOffCtx;
    offCtx.putImageData(
      new ImageData(new Uint8ClampedArray(this._sstvFullRgba), mode.width, mode.height),
      0, 0
    );
    const ctx = this._sstvCanvasCtx;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 640, 480);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this._sstvOffCanvas, 0, 0, 640, 480);
  },

  _updateSignalBar(targetScanLine) {
    const leadEl = document.getElementById('sig-lead');
    const syncEl = document.getElementById('sig-sync');
    const imgEl = document.getElementById('sig-img');
    if (!leadEl || !syncEl || !imgEl) return;
    leadEl.classList.add('active');
    if (targetScanLine > 0) {
      syncEl.classList.add('active');
      imgEl.classList.add('active');
    } else {
      syncEl.classList.remove('active');
      imgEl.classList.remove('active');
    }
  },

  _clearSignalBar() {
    ['sig-lead', 'sig-sync', 'sig-img'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
  },

  _initSstvUi() {
    const self = this;
    const $ = id => document.getElementById(id);

    const featureBtn = $('feature-btn');
    const featureMenu = $('feature-menu');
    if (featureBtn && featureMenu) {
      featureBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        featureMenu.classList.toggle('open');
      });
      document.addEventListener('click', () => {
        featureMenu.classList.remove('open');
      });
      featureMenu.addEventListener('click', (e) => e.stopPropagation());
    }

    const menuSstv = $('menu-sstv');
    if (menuSstv) {
      menuSstv.addEventListener('click', () => {
        featureMenu.classList.remove('open');
        self._openSstvPanel();
      });
    }

    const closeBtn = $('sstv-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => self._closeSstvPanel());
    }

    const overlay = $('sstv-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) self._closeSstvPanel();
      });
    }

    const forceBtn = $('sstv-force-start');
    if (forceBtn) {
      forceBtn.addEventListener('click', () => {
        const modeKey = $('sstv-force-mode').value;
        self._sstvForceStart(modeKey);
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && self._sstvActive) {
        self._closeSstvPanel();
      }
    });
  },

  _openSstvPanel() {
    document.getElementById('sstv-overlay').classList.add('open');
    this._sstvActive = true;
    this._sstvState = 'idle';
    this._sstvFullRgba = null;
    this._sstvMode = null;
    this._sstvYbuf = null;
    this._sstvRYbuf = null;
    this._sstvBYbuf = null;
    this._sstvSyncWin0 = [];
    this._sstvSyncWin1 = [];
    this._clearSignalBar();
    document.getElementById('sstv-status').textContent = '等待信号...';
    document.getElementById('sstv-status').classList.remove('active');
    document.getElementById('sstv-mode-badge').classList.remove('visible');

    if (this._sstvTickTimer) clearInterval(this._sstvTickTimer);
    this._sstvTickTimer = setInterval(() => this._sstvTick(), 50);

    this._renderSstvHistory();
  },

  _closeSstvPanel() {
    document.getElementById('sstv-overlay').classList.remove('open');
    this._sstvActive = false;
    this._sstvState = 'idle';
    this._sstvFullRgba = null;
    this._sstvMode = null;
    this._sstvYbuf = null;
    this._sstvRYbuf = null;
    this._sstvBYbuf = null;
    this._sstvSyncWin0 = [];
    this._sstvSyncWin1 = [];

    if (this._sstvTickTimer) {
      clearInterval(this._sstvTickTimer);
      this._sstvTickTimer = null;
    }
  },

  _sstvForceStart(modeKey) {
    if (!modeKey) {
      alert('请选择强制解码模式');
      return;
    }
    if (!this._sstvActive || !this._sstvAudioTap) return;

    const tap = this._sstvAudioTap;
    const SR = 8000;
    const MODE = ROBOT36_MODE;

    this._sstvState = 'decoding';
    this._sstvMode = MODE;
    this._sstvNextScanLine = 0;
    this._sstvT0 = tap.totalWritten - Math.round(5 * SR);
    this._sstvFullRgba = new Uint8ClampedArray(MODE.width * MODE.height * 4);
    this._sstvYbuf = null;
    this._sstvRYbuf = null;
    this._sstvBYbuf = null;
    this._sstvSyncWin0 = [];
    this._sstvSyncWin1 = [];

    document.getElementById('sstv-status').textContent = '强制解码中...';
    document.getElementById('sstv-status').classList.add('active');
    document.getElementById('sstv-mode-badge').textContent = MODE.name;
    document.getElementById('sstv-mode-badge').classList.add('visible');

    const ctx = this._sstvCanvasCtx;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 640, 480);
    this._sstvOffCtx.fillStyle = '#111';
    this._sstvOffCtx.fillRect(0, 0, 320, 240);
  },

  _addSstvToHistory(modeName, dataUrl) {
    this._sstvHistory.unshift({
      mode: modeName,
      dataUrl: dataUrl,
      time: Date.now()
    });
    if (this._sstvHistory.length > 20) {
      this._sstvHistory = this._sstvHistory.slice(0, 20);
    }
    this._renderSstvHistory();
  },

  _renderSstvHistory() {
    const container = document.getElementById('sstv-history-list');
    const countEl = document.getElementById('sstv-history-count');
    if (!container) return;
    countEl.textContent = this._sstvHistory.length;

    if (!this._sstvHistory.length) {
      container.innerHTML = '<div class="sstv-history-empty">暂无历史</div>';
      return;
    }

    const self = this;
    container.innerHTML = this._sstvHistory.map((item, index) => {
      const d = new Date(item.time);
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      return `<div class="sstv-history-item" data-index="${index}">
        <img src="${item.dataUrl}" alt="${item.mode}">
        <div class="sstv-history-item-meta">
          <span>${item.mode}</span>
          <span>${timeStr}</span>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('.sstv-history-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index);
        const item = self._sstvHistory[idx];
        if (item) {
          const img = new Image();
          img.onload = () => {
            const ctx = self._sstvCanvasCtx;
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, 640, 480);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, 640, 480);
          };
          img.src = item.dataUrl;
        }
      });
    });
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());