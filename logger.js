/* ============================================================
   FMO 副屏伴侣 — logger.js
   统一调试日志模块，支持按标签启用/禁用
   全局开关：设置 FMODebug.enabled = false 可关闭所有调试输出
   标签开关：例如 FMODebug.tags.FREQ = false 关闭频率相关日志
   ============================================================ */

(function() {
  'use strict';

  const TAGS = {
    DEBUG:   { prefix: '[FMO-DEBUG]',        enabled: true },
    FREQ:    { prefix: '[FMO-DEBUG-FREQ]',   enabled: true },
    SERVER:  { prefix: '[FMO-DEBUG-SERVER]', enabled: true },
    QSO:     { prefix: '[FMO-DEBUG-QSO]',    enabled: true }
  };

  let _enabled = true;

  function log(tag, ...args) {
    if (!_enabled) return;
    const cfg = TAGS[tag];
    if (!cfg || !cfg.enabled) return;
    console.log(cfg.prefix, ...args);
  }

  window.FMODebug = {
    log: log,
    get enabled() { return _enabled; },
    set enabled(v) { _enabled = v; },
    tags: Object.keys(TAGS).reduce(function(acc, key) {
      Object.defineProperty(acc, key, {
        get: function() { return TAGS[key].enabled; },
        set: function(v) { TAGS[key].enabled = v; },
        enumerable: true
      });
      return acc;
    }, {})
  };
})();
