/* ============================================================
   FMO 副屏伴侣 — app.js v5
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
  station: { getListRange: 'getListResponse' }
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
    const si = $('server-search');
    if (si) {
      si.addEventListener('input', (e) => {
        this.serverSearch = e.target.value.toLowerCase();
        this.renderServerList();
      });
    }
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
      if (
        msg.type === r.type &&
        (msg.subType === expectedSubType || msg.subType === r.subType)
      ) {
        clearTimeout(this._inFlight.timer);
        const resolve = this._inFlight.resolve;
        this._inFlight = null;
        resolve(msg);
        this._processQueue();
        return;
      }
    }

    // 非响应 → 服务端推送
    if (msg.type === 'event' || msg.event) {
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
    try {
      const evt = JSON.parse(data);
      switch (evt.event) {
        case 'speaking_start':
          this.showSpeaking(evt.callsign, evt.grid, evt);
          break;
        case 'speaking_stop':
          this.hideSpeaking();
          break;
        case 'new_qso':
          this.addQsoItem(evt);
          break;
        case 'station_update':
        case 'online_change':
          this.fetchServerList();
          break;
      }
    } catch (e) {}
  },

  // ============ 数据获取 ============

  async fetchAllData() {
    await this.fetchDeviceInfo();
    await this.fetchServerListAll();     // 翻页全量
    await this.fetchQsoListAll();        // 翻页全量
  },

  async fetchDeviceInfo() {
    // user.getInfo
    try {
      const r = await this.send({ type: 'user', subType: 'getInfo' });
      if (r.code === 0 && r.data?.callsign) {
        this.myCallsign = r.data.callsign;
        document.getElementById('info-callsign').textContent = this.myCallsign;
        document.getElementById('status-callsign').textContent = this.myCallsign;
      }
    } catch (e) { console.warn('user:', e.message); }

    // config 类 — 串行队列保护，各自独立
    try {
      const r = await this.send({ type: 'config', subType: 'getCordinate' });
      if (r.code === 0 && r.data) {
        const grid = this.latLonToGrid(r.data.latitude, r.data.longitude);
        this.myGrid = grid;
        document.getElementById('info-grid').textContent = grid;
        document.getElementById('status-grid').textContent = grid;
      }
    } catch (e) {}
    try {
      const r = await this.send({ type: 'config', subType: 'getUserPhyDeviceName' });
      if (r.code === 0 && r.data?.deviceName)
        document.getElementById('info-device').textContent = r.data.deviceName;
    } catch (e) {}
    try {
      const r = await this.send({ type: 'config', subType: 'getUserPhyAnt' });
      if (r.code === 0 && r.data?.ant)
        document.getElementById('info-antenna').textContent = r.data.ant;
    } catch (e) {}
    try {
      const r = await this.send({ type: 'config', subType: 'getFirmwareVersion' });
      if (r.code === 0 && r.data?.version)
        document.getElementById('info-firmware').textContent = r.data.version;
    } catch (e) {}
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
        if (resp.code !== 0) break;
        const list = resp.data?.list ?? [];
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
      filtered = this.serverList.filter(s =>
        (s.name || '').toLowerCase().includes(this.serverSearch)
      );
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
      const active = s.name === this.currentServerName;
      return `<div class="server-item${active ? ' active' : ''}" data-server-name="${s.name}">
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
    try {
      const target = this.serverList.find(s => s.name === name);
      const data = target ? { uid: target.uid, name: target.name } : { name };
      const resp = await this.send({ type: 'station', subType: 'setCurrent', data });
      if (resp.code === 0) {
        this.currentServerName = name;
        document.getElementById('status-server').textContent = name;
        this.renderServerList();
        await this.fetchQsoListAll();
        await this.fetchStats();
      }
    } catch (e) { console.warn('switchServer:', e.message); }
  },

  // ============ 通联统计 ============

  async fetchStats() {
    try {
      const r = await this.send({ type: 'qso', subType: 'getTodayCount' });
      if (r.code === 0) document.getElementById('stat-today').textContent = r.data?.count ?? '--';
    } catch (e) {}
    try {
      const r = await this.send({ type: 'qso', subType: 'getTotalCount' });
      if (r.code === 0) document.getElementById('stat-total').textContent = r.data?.count ?? '--';
    } catch (e) {}
    try {
      const r = await this.send({ type: 'qso', subType: 'getContactCount' });
      if (r.code === 0) document.getElementById('stat-contacts').textContent = r.data?.count ?? '--';
    } catch (e) {}
  },

  // ============ QSO 列表 — qso.getList 分页全量 ============

  async fetchQsoListAll() {
    const maxPages = 200;
    const all = [];

    try {
      for (let page = 0; page < maxPages; page++) {
        const resp = await this.send({
          type: 'qso',
          subType: 'getList',
          data: { page }
        });
        if (resp.code !== 0) break;
        const payload = resp.data;
        const list = payload?.list ?? [];
        if (list.length === 0) break;

        all.push(...list);

        // pageSize 固定 20，不足 20 条说明最后一页
        if (list.length < 20) break;
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

  showSpeaking(callsign, grid, evt) {
    const bar = document.getElementById('speaking-bar');
    bar.classList.add('active');
    let extraHtml = '';
    if (evt) {
      const parts = [];
      if (evt.distance) parts.push(`距离 ${evt.distance} km`);
      if (evt.power) parts.push(`功率 ${evt.power}W`);
      if (evt.mode) parts.push(evt.mode);
      if (parts.length) extraHtml = `<div class="speaker-stats">${parts.join(' · ')}</div>`;
    }
    bar.innerHTML = `
      <div class="speaker-callsign">${callsign || '--'}</div>
      <div class="speaker-location">${grid || '--'}</div>
      ${extraHtml}
      <div class="vu-meter"><div class="vu-meter-fill" style="width:${this.vuLevel}%"></div></div>
    `;
  },

  hideSpeaking() {
    setTimeout(() => {
      const bar = document.getElementById('speaking-bar');
      bar.classList.remove('active');
      bar.innerHTML = '<div class="idle-text">等待通联...</div>';
    }, 3000);
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
    let html = '';
    for (let i = 0; i < 16; i++) {
      const h = Math.max(2, Math.random() * 36 * (this.vuLevel / 100 + 0.1));
      html += `<div class="bar" style="height:${h}px"></div>`;
    }
    container.innerHTML = html;
  },

  // ============ 音频 ============

  initAudioCtx() {
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 8000 });
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
    source.connect(this.audioCtx.destination);
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