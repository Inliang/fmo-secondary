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
      const derived = this._deriveStationInfo(evt.callsign);
      this.showSpeaking({
        callsign: evt.callsign,
        grid: evt.grid || derived.grid || '',
        isHost: evt.isHost || false,
        distance: evt.distance !== undefined ? evt.distance : derived.distance,
        azimuth: evt.azimuth !== undefined ? evt.azimuth : derived.azimuth,
        altitude: evt.altitude !== undefined ? evt.altitude : derived.altitude,
      });
      return;
    }
    if (evt.event === 'speaking_stop') {
      this.hideSpeaking();
      return;
    }

    // FmoDeck 新格式：qso/callsign
    if (evt.type === 'qso' && evt.subType === 'callsign') {
      const d = evt.data || {};
      if (d.isSpeaking) {
        const derived = this._deriveStationInfo(d.callsign);
        this.showSpeaking({
          callsign: d.callsign,
          grid: d.grid || derived.grid || '',
          isHost: d.isHost || false,
          distance: d.distance !== undefined ? d.distance : derived.distance,
          azimuth: d.azimuth !== undefined ? d.azimuth : derived.azimuth,
          altitude: d.altitude !== undefined ? d.altitude : derived.altitude,
        });
      } else {
        this.hideSpeaking();
      }
      return;
    }

    // FmoDeck：qso/history（预留）
    if (evt.type === 'qso' && evt.subType === 'history') {
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

  showSpeaking(data) {
    this._currentSpeaker = {
      callsign: data.callsign || '',
      grid: data.grid || '',
      isHost: data.isHost || false,
      distance: data.distance,
      azimuth: data.azimuth,
      altitude: data.altitude,
      startedAtMs: Date.now(),
    };

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
    this._currentSpeaker = null;
    const bar = document.getElementById('speaking-bar');
    if (bar) {
      bar.classList.remove('active');
      bar.innerHTML = '<div class="idle-text">等待通联...</div>';
    }
  },

  renderSpeakingBar() {
    const bar = document.getElementById('speaking-bar');
    if (!bar) return;

    const sp = this._currentSpeaker;
    if (!sp) return;

    bar.classList.add('active');

    const elapsed = Date.now() - sp.startedAtMs;
    const elapsedStr = this.formatElapsed(elapsed);

    // 徽章
    let badgesHtml = '';
    if (sp.isHost) {
      badgesHtml += '<span class="speaker-badge host">HOST</span>';
    }
    const isSelf = this.isSameOperator(sp.callsign, this.myCallsign);
    if (isSelf) {
      badgesHtml += '<span class="speaker-badge self">自己</span>';
    }

    // 通联统计
    const qsos = this.qsoList.filter(q => {
      const toCall = q.toCallsign || q.callsign || '';
      return this.isSameOperator(toCall, sp.callsign);
    });

    // 新朋友徽章（非自己且恰好 1 次）
    if (!isSelf && qsos.length === 1) {
      badgesHtml += '<span class="speaker-badge new-friend">✦ 新朋友</span>';
    }

    // 第二行：网格 + 方位/距离 + 通联统计
    let row2Html = `<span class="speaker-grid">${sp.grid || '--'}</span>`;

    // 方位角 + 距离 + 高度
    let extraInfo = '';
    if (sp.distance !== undefined && sp.distance !== null) {
      extraInfo += `距离 ${sp.distance} km`;
    }
    if (sp.azimuth !== undefined && sp.azimuth !== null) {
      if (extraInfo) extraInfo += ' · ';
      extraInfo += `方位 ${sp.azimuth}°`;
    }
    if (sp.altitude !== undefined && sp.altitude !== null) {
      if (extraInfo) extraInfo += ' · ';
      extraInfo += `高度 ${sp.altitude} m`;
    }
    if (extraInfo) {
      row2Html += `<span class="speaker-extra">${extraInfo}</span>`;
    }

    if (!isSelf) {
      const count = qsos.length;
      let statsText = '';
      if (count === 0) {
        statsText = '从未通联';
      } else {
        let latestTs = 0;
        for (const q of qsos) {
          if (q.timestamp && q.timestamp > latestTs) latestTs = q.timestamp;
        }
        const ago = this.formatTimeAgo(latestTs, Date.now());
        statsText = `通联 ${count} 次 · 上次 ${ago}`;
      }
      row2Html += `<span class="speaker-stats-text">${statsText}</span>`;
    }

    bar.innerHTML = `
      <div class="speaking-bar-content">
        <div class="speaker-row-1">
          <span class="speaker-callsign">${sp.callsign || '--'}</span>
          ${badgesHtml}
          <span class="speaker-elapsed">${elapsedStr}</span>
        </div>
        <div class="speaker-row-2">
          ${row2Html}
        </div>
        <div class="vu-meter"><div class="vu-meter-fill" style="width:${this.vuLevel}%"></div></div>
      </div>
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

    // 首次初始化：生成每个 bar 的基准噪声种子（0.05~0.35）和中心频率权重
    if (!this._specSeeds || this._specSeeds.length !== bars) {
      this._specSeeds = [];
      for (let i = 0; i < bars; i++) {
        this._specSeeds.push({
          noise: 0.05 + Math.random() * 0.3,
          // 语音频段加权：0~1 范围，人声 300-3400Hz 集中在 20%~75% 的 bar 位置
          voiceWeight: 1 - Math.abs((i / (bars - 1)) - 0.45) * 1.4
        });
      }
      this._specHistory = new Array(bars).fill(0);
    }

    const vuScale = this.vuLevel / 100;
    const maxHeight = 48;
    const containerEl = container;
    let html = '';

    for (let i = 0; i < bars; i++) {
      const seed = this._specSeeds[i];

      // 噪声基底 + VU驱动 + 语音频段加权
      const raw = seed.noise + vuScale * seed.voiceWeight * 1.2;
      const target = Math.max(0.02, Math.min(1, raw));

      // 平滑过渡（上次高度的 60% + 目标高度的 40%）
      const prev = this._specHistory[i];
      const smoothed = prev * 0.55 + target * 0.45;
      this._specHistory[i] = smoothed;

      const h = Math.max(2, Math.round(smoothed * maxHeight));

      // 颜色：低→绿，中→黄，高→红（频谱渐变）
      const ratio = smoothed;
      let r, g, b;
      if (ratio < 0.33) {
        const t = ratio / 0.33;
        r = Math.round(0 + t * 255);
        g = Math.round(200 + t * 55);
        b = Math.round(80 - t * 80);
      } else if (ratio < 0.66) {
        const t = (ratio - 0.33) / 0.33;
        r = 255;
        g = Math.round(255 - t * 155);
        b = 0;
      } else {
        const t = (ratio - 0.66) / 0.34;
        r = 255;
        g = Math.round(100 - t * 50);
        b = 0;
      }

      html += `<div class="bar" style="height:${h}px;background:rgb(${r},${g},${b});opacity:${0.45 + smoothed * 0.55}"></div>`;
    }
    containerEl.innerHTML = html;
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
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());