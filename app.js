/* ============================================================
   FMO 副屏伴侣 — app.js v3
   修复：响应匹配机制、QSO 拉取、服务器列表、状态栏
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
  reconnectAttempts: 0,
  maxReconnectAttempts: 10,

  // --- 请求映射 (type → FIFO 队列) ---
  _pending: null,
  _reqId: 0,

  // --- 数据 ---
  myCallsign: '',
  myGrid: '',
  qsoList: [],
  serverList: [],
  currentServerName: '',

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

  // --- 事件绑定 ---
  bindEvents() {
    const $ = id => document.getElementById(id);

    $('settings-btn').addEventListener('click', () => this.openSettings());
    $('settings-overlay').addEventListener('click', (e) => {
      if (e.target === $('settings-overlay')) this.closeSettings();
    });
    $('settings-cancel').addEventListener('click', () => this.closeSettings());
    $('settings-save').addEventListener('click', () => this.saveSettings());
    $('theme-toggle').addEventListener('click', () => this.cycleTheme());

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

  // --- 时间 ---
  startDatetime() {
    const update = () => {
      const now = new Date();
      const str = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      document.getElementById('status-time').textContent = str;
    };
    update();
    this.datetimeTimer = setInterval(update, 10000);
  },

  // --- 连接管理 ---
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
    const fullHost = `${host}:${port}`;
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
      const url = `ws://${host}/audio`;
      this.audioWs = new WebSocket(url);
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

  // ============ 核心：sendRequest (Map + type-match FIFO) ============

  /**
   * 新的 sendRequest：
   * - 用 Map 存储待处理请求，单 onmessage handler 统一调度
   * - 匹配策略：遍历 _pending (插入顺序=FIFO)，命中 type 即 resolve
   * - 超时自动清理，不再堆积废弃 handler
   */
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

  /**
   * 统一消息处理：
   * 先尝试匹配待处理请求（type-only，FIFO），匹配失败作为 event 处理
   */
  handleWsMessage(data) {
    let msg;
    try { msg = JSON.parse(data); } catch (e) { return; }

    // 1. 尝试匹配 pending 请求
    for (const [id, pending] of this._pending) {
      if (msg.type === pending.req.type) {
        clearTimeout(pending.timeout);
        this._pending.delete(id);
        pending.resolve(msg);
        return;
      }
    }

    // 2. 无匹配 → 当作事件
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

  // ============ 数据获取 ============

  async fetchAllData() {
    await this.fetchDeviceInfo();
    await this.fetchServerList();
    await this.fetchQsos();
  },

  async fetchDeviceInfo() {
    try {
      // user.getInfo 单独发（需先拿到 callsign）
      const userResp = await this.sendRequest({ type: 'user', subType: 'getInfo' });
      if (userResp.code === 0 && userResp.data?.callsign) {
        this.myCallsign = userResp.data.callsign;
        document.getElementById('info-callsign').textContent = this.myCallsign;
        document.getElementById('status-callsign').textContent = this.myCallsign;
      }
    } catch (e) { console.warn('user.getInfo:', e.message); }

    // 其余并发
    try {
      const [coordResp, devResp, antResp] = await Promise.all([
        this.sendRequest({ type: 'config', subType: 'getCordinate' }),
        this.sendRequest({ type: 'config', subType: 'getUserPhyDeviceName' }),
        this.sendRequest({ type: 'config', subType: 'getUserPhyAnt' })
      ]);

      if (coordResp.code === 0 && coordResp.data) {
        const grid = this.latLonToGrid(coordResp.data.latitude, coordResp.data.longitude);
        this.myGrid = grid;
        document.getElementById('info-grid').textContent = grid;
        document.getElementById('status-grid').textContent = grid;
      }

      if (devResp.code === 0 && devResp.data?.deviceName) {
        document.getElementById('info-device').textContent = devResp.data.deviceName;
      }

      if (antResp.code === 0 && antResp.data?.ant) {
        document.getElementById('info-antenna').textContent = antResp.data.ant;
      }
    } catch (e) { console.warn('fetch configs:', e.message); }

    // 固件
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

  async fetchServerList() {
    try {
      // 串行避免 qso 响应被 station 匹配吞掉
      const listResp = await this.sendRequest({ type: 'station', subType: 'getListRange' });
      if (listResp.code === 0 && listResp.data?.list) {
        this.serverList = listResp.data.list;
      }
    } catch (e) { console.warn('station.getListRange:', e.message); }

    try {
      const currentResp = await this.sendRequest({ type: 'station', subType: 'getCurrent' });
      if (currentResp.code === 0 && currentResp.data) {
        this.currentServerName = currentResp.data.name || '';
        // 更新状态栏
        document.getElementById('status-server').textContent = this.currentServerName || '--';
      }
    } catch (e) {}

    this.renderServerList();

    // 通联统计
    await this.fetchStats();
  },

  async fetchStats() {
    try {
      const todayResp = await this.sendRequest({ type: 'qso', subType: 'getTodayCount' });
      if (todayResp.code === 0) {
        document.getElementById('stat-today').textContent = todayResp.data?.count ?? '--';
      }
    } catch (e) {}

    try {
      const totalResp = await this.sendRequest({ type: 'qso', subType: 'getTotalCount' });
      if (totalResp.code === 0) {
        document.getElementById('stat-total').textContent = totalResp.data?.count ?? '--';
      }
    } catch (e) {}

    try {
      const contactResp = await this.sendRequest({ type: 'qso', subType: 'getContactCount' });
      if (contactResp.code === 0) {
        document.getElementById('stat-contacts').textContent = contactResp.data?.count ?? '--';
      }
    } catch (e) {}
  },

  /** QSO 历史记录（设备支持的 getListRange） */
  async fetchQsos() {
    try {
      const resp = await this.sendRequest({
        type: 'qso', subType: 'getListRange', data: { start: 0, count: 30 }
      });
      if (resp.code === 0 && resp.data?.list) {
        this.qsoList = resp.data.list;
        this.renderQsoList();
      } else if (resp.code === 0 && Array.isArray(resp.data)) {
        // 兼容：有的固件直接返回 data 数组
        this.qsoList = resp.data;
        this.renderQsoList();
      }
    } catch (e) { console.warn('qso.getListRange:', e.message); }
  },

  // ============ 服务器列表渲染 ============

  renderServerList() {
    const container = document.getElementById('server-list-container');
    if (!container) return;

    if (!this.serverList.length) {
      container.innerHTML = '<div class="server-list-empty">加载中...</div>';
      return;
    }

    container.innerHTML = this.serverList.map(s => {
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

  // ============ QSO 列表 ============

  renderQsoList() {
    const container = document.getElementById('qso-container');
    if (!container) return;

    if (!this.qsoList.length) {
      container.innerHTML = '<div class="idle-text" style="padding:20px;text-align:center">暂无通联记录</div>';
      return;
    }

    container.innerHTML = this.qsoList.slice(0, 20).map(item => {
      const ts = item.timestamp ? new Date(item.timestamp * 1000) : null;
      const timeStr = ts
        ? `${ts.getFullYear()}/${String(ts.getMonth()+1).padStart(2,'0')}/${String(ts.getDate()).padStart(2,'0')} ${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}`
        : '--';
      return `<div class="qso-item">
        <span class="qso-logid">#${item.logId ?? '--'}</span>
        <span class="qso-callsign">${item.toCallsign ?? '--'}</span>
        <span class="qso-grid">${item.grid ?? '--'}</span>
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
    const level = Math.max(0, Math.min(100, (db + 60) * (100 / 60)));
    this.updateVU(level);
  },

  // ============ 轮询 ============

  startPolling() {
    this.stopPolling();
    const poll = () => {
      if (this.connected) this.fetchServerList();
    };
    this.pollTimer = setInterval(poll, 15000);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
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