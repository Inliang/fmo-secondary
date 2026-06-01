/* ============================================================
   FMO 副屏伴侣 — app.js v4
   QSO: WS qso.getListRange → HTTP REST 兜底 → events 实时
   服务器列表: 搜索过滤 + 完整渲染
   ============================================================ */

function normalizeHost(addr) {
  if (!addr) return '';
  return addr.trim().replace(/^(https?|wss?):?\/\//, '').replace(/\/+$/, '');
}

const App = {
  // --- 连接 ---
  ws: null,
  eventsWs: null,
  audioWs: null,
  connected: false,
  protocol: 'ws',
  hostPort: '',        // "ip:port" 用于 HTTP 请求
  reconnectAttempts: 0,
  maxReconnectAttempts: 10,

  // --- 请求映射 ---
  _pending: null,
  _reqId: 0,

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
    this._pending = new Map();
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
    // 服务器搜索
    const searchInput = $('server-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
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
    const next = themes[(idx + 1) % themes.length];
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
      const now = new Date();
      const str = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      document.getElementById('status-time').textContent = str;
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
    this._pending.clear();
    this.updateConnectionUI(false, 'connecting');
    const host = normalizeHost(ip);
    this.hostPort = `${host}:${port}`;
    const fullHost = this.hostPort;
    const protocol = this.protocol;

    this.connectWs(`${protocol}://${fullHost}/ws`);
    this.connectEvents(`${protocol}://${fullHost}/events`);
    this.connectAudio(fullHost);
    document.getElementById('status-ip').textContent = ip;
  },

  connectWs(url) {
    try {
      this.ws = new WebSocket(url);
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
        this.scheduleReconnect();
      };
      this.ws.onerror = () => {};
    } catch (e) {
      this.updateConnectionUI(false, 'disconnected');
    }
  },

  connectEvents(url) {
    try {
      this.eventsWs = new WebSocket(url);
      this.eventsWs.onmessage = (e) => this.handleEvent(e.data);
      this.eventsWs.onclose = () => {};
      this.eventsWs.onerror = () => {};
    } catch (e) {}
  },

  connectAudio(host) {
    try {
      this.audioWs = new WebSocket(`ws://${host}/audio`);
      this.audioWs.binaryType = 'arraybuffer';
      this.audioWs.onopen = () => { this.audioConnected = true; };
      this.audioWs.onmessage = (e) => this.handleAudioFrame(e.data);
      this.audioWs.onclose = () => { this.audioConnected = false; };
      this.audioWs.onerror = () => {};
    } catch (e) {}
  },

  disconnect() {
    this.stopPolling();
    [this.ws, this.eventsWs, this.audioWs].forEach(ws => {
      if (ws) { ws.close(); }
    });
    this.ws = this.eventsWs = this.audioWs = null;
    this.connected = false;
    this.audioConnected = false;
    this._pending.clear();
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

  // ============ WebSocket 请求/响应 ============

  sendRequest(req) {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('未连接'));
        return;
      }
      const id = ++this._reqId;
      const timeout = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error('超时'));
      }, 10000);
      this._pending.set(id, { req, resolve, timeout });
      this.ws.send(JSON.stringify(req));
    });
  },

  handleWsMessage(data) {
    let msg;
    try { msg = JSON.parse(data); } catch (e) { return; }

    // 仅 code 存在时为响应（事件/推送无 code 字段）
    if (msg.code !== undefined) {
      for (const [id, pending] of this._pending) {
        if (msg.type === pending.req.type) {
          clearTimeout(pending.timeout);
          this._pending.delete(id);
          pending.resolve(msg);
          return;
        }
      }
    }

    // 事件
    if (msg.type === 'event' || msg.event) {
      this.handleEvent(JSON.stringify(msg));
    }
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

  // ============ HTTP REST 请求 ============

  /**
   * 参照 /api/provision 模式，尝试 REST 端点
   * 返回解析后的 JSON 或 null
   */
  async _httpGet(path) {
    try {
      const url = `http://${this.hostPort}${path}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) { return null; }
  },

  // ============ 数据获取 ============

  async fetchAllData() {
    await this.fetchDeviceInfo();
    await this.fetchServerList();
    // QSO: WS 优先 → HTTP REST 兜底
    await this.fetchQsos();
  },

  async fetchDeviceInfo() {
    // user.getInfo 串行
    try {
      const userResp = await this.sendRequest({ type: 'user', subType: 'getInfo' });
      if (userResp.code === 0 && userResp.data?.callsign) {
        this.myCallsign = userResp.data.callsign;
        document.getElementById('info-callsign').textContent = this.myCallsign;
        document.getElementById('status-callsign').textContent = this.myCallsign;
      }
    } catch (e) { console.warn('user.getInfo:', e.message); }

    // config 类请求 — 改为串行避免同 type FIFO 错位
    try {
      const coordResp = await this.sendRequest({ type: 'config', subType: 'getCordinate' });
      if (coordResp.code === 0 && coordResp.data) {
        const grid = this.latLonToGrid(coordResp.data.latitude, coordResp.data.longitude);
        this.myGrid = grid;
        document.getElementById('info-grid').textContent = grid;
        document.getElementById('status-grid').textContent = grid;
      }
    } catch (e) { console.warn('getCordinate:', e.message); }

    try {
      const devResp = await this.sendRequest({ type: 'config', subType: 'getUserPhyDeviceName' });
      if (devResp.code === 0 && devResp.data?.deviceName) {
        document.getElementById('info-device').textContent = devResp.data.deviceName;
      }
    } catch (e) {}

    try {
      const antResp = await this.sendRequest({ type: 'config', subType: 'getUserPhyAnt' });
      if (antResp.code === 0 && antResp.data?.ant) {
        document.getElementById('info-antenna').textContent = antResp.data.ant;
      }
    } catch (e) {}

    try {
      const fwResp = await this.sendRequest({ type: 'config', subType: 'getFirmwareVersion' });
      if (fwResp.code === 0 && fwResp.data?.version) {
        document.getElementById('info-firmware').textContent = fwResp.data.version;
      }
    } catch (e) {}
  },

  latLonToGrid(lat, lon) {
    lat = parseFloat(lat); lon = parseFloat(lon);
    const lon1 = lon + 180, lat1 = lat + 90;
    const fLon = Math.floor(lon1 / 20), fLat = Math.floor(lat1 / 10);
    const sLon = Math.floor((lon1 % 20) / 2), sLat = Math.floor(lat1 % 10);
    const ssLon = Math.floor((lon1 % 2) * 12), ssLat = Math.floor((lat1 % 1) * 24);
    return String.fromCharCode(65+fLon) + String.fromCharCode(65+fLat) +
           String(sLon) + String(sLat) +
           String.fromCharCode(97+ssLon) + String.fromCharCode(97+ssLat);
  },

  // ============ 服务器列表 ============

  async fetchServerList() {
    // WS 获取全量服务器列表
    try {
      const listResp = await this.sendRequest({ type: 'station', subType: 'getListRange' });
      if (listResp.code === 0 && listResp.data?.list) {
        this.serverList = listResp.data.list;
      }
    } catch (e) {
      console.warn('station.getListRange:', e.message);
      // HTTP REST 兜底
      const httpData = await this._httpGet('/api/stations');
      if (httpData && Array.isArray(httpData)) {
        this.serverList = httpData;
      } else if (httpData && httpData.list) {
        this.serverList = httpData.list;
      }
    }

    try {
      const currentResp = await this.sendRequest({ type: 'station', subType: 'getCurrent' });
      if (currentResp.code === 0 && currentResp.data) {
        this.currentServerName = currentResp.data.name || '';
        document.getElementById('status-server').textContent = this.currentServerName || '--';
      }
    } catch (e) {}

    this.renderServerList();
    await this.fetchStats();
  },

  renderServerList() {
    const container = document.getElementById('server-list-container');
    if (!container) return;

    // 搜索过滤
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
      const isActive = s.name === this.currentServerName;
      return `<div class="server-item${isActive ? ' active' : ''}" data-server-name="${s.name}">
        <span class="server-item-name">${s.name || '--'}</span>
        <span>
          <span class="server-item-count">${s.onlineCount ?? '--'} 在线</span>
          ${isActive ? '<span class="server-item-check">✓</span>' : ''}
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
      const resp = await this.sendRequest({
        type: 'station', subType: 'setCurrent', data: { name }
      });
      if (resp.code === 0) {
        this.currentServerName = name;
        document.getElementById('status-server').textContent = name;
        this.renderServerList();
        await this.fetchQsos();
        await this.fetchStats();
      }
    } catch (e) { console.warn('switchServer:', e.message); }
  },

  // ============ 通联统计 ============

  async fetchStats() {
    try {
      const r = await this.sendRequest({ type: 'qso', subType: 'getTodayCount' });
      if (r.code === 0) document.getElementById('stat-today').textContent = r.data?.count ?? '--';
    } catch (e) {}
    try {
      const r = await this.sendRequest({ type: 'qso', subType: 'getTotalCount' });
      if (r.code === 0) document.getElementById('stat-total').textContent = r.data?.count ?? '--';
    } catch (e) {}
    try {
      const r = await this.sendRequest({ type: 'qso', subType: 'getContactCount' });
      if (r.code === 0) document.getElementById('stat-contacts').textContent = r.data?.count ?? '--';
    } catch (e) {}
  },

  // ============ QSO 列表 (WS → HTTP REST → events) ============

  async fetchQsos() {
    // 策略1: WebSocket qso.getListRange
    try {
      const resp = await this.sendRequest({
        type: 'qso', subType: 'getListRange', data: { start: 0, count: 50 }
      });
      if (resp.code === 0) {
        if (resp.data?.list) {
          this.qsoList = resp.data.list;
        } else if (Array.isArray(resp.data)) {
          this.qsoList = resp.data;
        } else if (resp.data?.qsos) {
          this.qsoList = resp.data.qsos;
        }
        this.renderQsoList();
        return;
      }
    } catch (e) { console.warn('WS qso.getListRange failed, trying HTTP...'); }

    // 策略2: HTTP REST（参照 /api/provision 模式）
    // 尝试多个可能端点
    const endpoints = ['/api/qso/list', '/api/qsos', '/api/qso', '/api/log/list'];
    for (const ep of endpoints) {
      const data = await this._httpGet(ep);
      if (data) {
        let list = null;
        if (Array.isArray(data)) list = data;
        else if (data.list) list = data.list;
        else if (data.qsos) list = data.qsos;
        else if (data.data?.list) list = data.data.list;
        else if (Array.isArray(data.data)) list = data.data;
        if (list && list.length) {
          this.qsoList = list;
          this.renderQsoList();
          return;
        }
      }
    }

    // 策略3: 无历史数据，仅靠 events 实时推送
    console.log('QSO: 未获取到历史记录，由 new_qso 事件实时填充');
  },

  // ============ QSO 渲染 ============

  renderQsoList() {
    const container = document.getElementById('qso-container');
    if (!container) return;

    if (!this.qsoList.length) {
      container.innerHTML = '<div class="idle-text" style="padding:20px;text-align:center">暂无通联记录</div>';
      return;
    }

    container.innerHTML = this.qsoList.slice(0, 30).map(item => {
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

  // ============ 设置面板 ============

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

  closeSettings() {
    document.getElementById('settings-overlay').classList.remove('open');
  },

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