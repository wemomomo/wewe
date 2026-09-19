
(function () {
  'use strict';

  var SPLIT = '|||';
  var MAX_CONTEXT = 40;
  var _charWeatherCache = {};

  var currentChatChar = null;
  var currentChatUser = null;
  var chatMessages = [];
  var isStreaming = false;
  var abortCtrl = null;
  var streamPartialText = '';
  var replyingMsg = null;
  var sendDelayTimer = null;
  var inputIdleTimer = null;
  var isInputIdle = true;
  var isWaitingForIdle = false;

  // 辅助函数
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(ts) { var d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function esc(str) { return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }

  function getCharEnName(charObj) {
    if (!charObj) return 'NIVEOUS';
    if (charObj.enName && charObj.enName.trim()) return charObj.enName.trim().toUpperCase();
    if (charObj.tagRomaji && charObj.tagRomaji.trim()) {
      var clean = charObj.tagRomaji.replace(/[^a-zA-Z]/g, '').trim();
      if (clean) return clean.toUpperCase();
    }
    var rawName = charObj.name || '';
    var enOnly = rawName.replace(/[^a-zA-Z]/g, '').trim();
    if (enOnly) return enOnly.toUpperCase();
    var pMap = { '冥夜': 'MINGYE', '冥': 'MING', '夜': 'YE', '墨墨': 'MOMO', '墨': 'MO' };
    return pMap[rawName] || 'CHARACTER';
  }

  // ============ 1. 角色独立配置与全局 API 获取 ============
  function getCfg(charId) {
    var defaultCfg = {
      mainLang: '简体中文',
      bilingual: false,
      biLang: 'English',
      biStyle: 'bracket',
      proactive: false,
      proMinInterval: 15,
      proMaxInterval: 120,
      proActiveStart: '00:00',
      proActiveEnd: '23:59',
      proMode: 'manual',
      proLevel: 3,
      replySpeed: '正常（3-8秒）',
      showTyping: true,
      minMsgs: 1,
      maxMsgs: 3,
      timeWeather: true,
      charCity: '',
      apiMode: 'global',
      apiSelect: '',
      temperature: 0.85,
      freqPenalty: 0.3,
      presPenalty: 0.3,
      innerVoice: true
    };
    try {
      var saved = localStorage.getItem('wx_char_cfg_' + charId);
      if (saved) return Object.assign({}, defaultCfg, JSON.parse(saved));
    } catch(e) {}
    return defaultCfg;
  }

  function saveCfg(charId, cfg) {
    try {
      localStorage.setItem('wx_char_cfg_' + charId, JSON.stringify(cfg));
    } catch(e) {}
    if (window.AppDB) window.AppDB.save('wx_char_cfg_' + charId, cfg);
  }

  function getActiveApi(charId) {
    var cfg = getCfg(charId);
    var list = [];
    try {
      list = JSON.parse(localStorage.getItem('api_configs') || '[]');
    } catch(e) {}

    if (cfg.apiMode === 'individual' && cfg.apiSelect) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].name === cfg.apiSelect) return list[i];
      }
    }
    try {
      var act = JSON.parse(localStorage.getItem('active_api') || 'null');
      if (act) return act;
    } catch(e) {}
    return list.length ? list[0] : null;
  }

  function getParams(charId) {
    var cfg = getCfg(charId);
    return {
      temperature: cfg.temperature || 0.85,
      freqPenalty: cfg.freqPenalty || 0.3,
      presPenalty: cfg.presPenalty || 0.3
    };
  }

  // ============ 2. 真实城市天气预取 ============
  function fetchCharWeather(realCity, callback) {
    if (!realCity) { callback(null); return; }
    var cacheKey = realCity.toLowerCase();
    var cached = _charWeatherCache[cacheKey];
    if (cached && Date.now() - cached.time < 30 * 60 * 1000) {
      callback(cached);
      return;
    }
    fetch('https://wttr.in/' + encodeURIComponent(realCity) + '?format=j1&lang=zh')
      .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function(data) {
        if (data && data.current_condition && data.current_condition.length) {
          var c = data.current_condition[0];
          var desc = (c.lang_zh && c.lang_zh.length) ? c.lang_zh[0].value : (c.weatherDesc && c.weatherDesc.length ? c.weatherDesc[0].value : '');
          var w = { temp: c.temp_C, humidity: c.humidity, desc: desc, time: Date.now() };
          _charWeatherCache[cacheKey] = w;
          callback(w);
        } else { callback(null); }
      })
      .catch(function() { callback(null); });
  }

  function buildTimeWeather(cfg) {
    if (!cfg.timeWeather) return '';
    var now = new Date();
    var hour = now.getHours();
    var period = '深夜';
    if (hour >= 5 && hour < 8) period = '清晨';
    else if (hour >= 8 && hour < 11) period = '上午';
    else if (hour >= 11 && hour < 13) period = '中午';
    else if (hour >= 13 && hour < 17) period = '下午';
    else if (hour >= 17 && hour < 19) period = '傍晚';
    else if (hour >= 19 && hour < 23) period = '晚上';

    var timeStr = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + ['周日','周一','周二','周三','周四','周五','周六'][now.getDay()] + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ' (' + period + ')';
    var info = '【当前真实时间】：' + timeStr;

    var city = cfg.charCity || (currentChatChar ? currentChatChar.location : '') || '';
    if (city) {
      var cacheKey = city.toLowerCase();
      var cw = _charWeatherCache[cacheKey];
      if (cw) {
        info += '\n【当前所在地天气】：' + city + '，' + cw.desc + '，' + cw.temp + '°C，湿度' + cw.humidity + '%';
      } else {
        info += '\n【当前所在城市】：' + city;
      }
    }
    return info;
  }

  // ============ 3. 智能消息拆分引擎 ============
  function smartSplitMessages(text) {
    text = (text || '').trim();
    if (!text) return [];

    if (text.indexOf(SPLIT) >= 0) {
      return text.split(SPLIT).map(function(t) { return t.trim(); }).filter(Boolean);
    }
    if (/\n\s*\n/.test(text)) {
      return text.split(/\n\s*\n/).map(function(t) { return t.trim(); }).filter(Boolean);
    }
    var lines = text.split('\n').map(function(t) { return t.trim(); }).filter(Boolean);
    if (lines.length >= 2) return lines;

    return [text];
  }

  function translateError(msg) {
    if (!msg) return '连接中断，请重试';
    if (msg.indexOf('401') >= 0) return 'API Key 授权失效，请在设置中检查';
    if (msg.indexOf('404') >= 0) return '找不到该模型或接口地址填错';
    if (msg.indexOf('429') >= 0) return '请求过快或额度不足';
    if (msg.indexOf('500') >= 0) return 'AI 服务端发生错误，请稍后';
    return '网络异常：' + msg;
  }

  // ============ 4. 世界书条目检索与上下文装配 ============
  function collectWorldBookEntries(charId, chatHistory) {
    var result = { before: [], after: [], depth: [] };
    var wbData = [];
    try {
      wbData = JSON.parse(localStorage.getItem('app_worldbooks_data') || '[]');
    } catch(e) {}
    if (!wbData.length || !currentChatChar) return result;

    var boundWbIds = Array.isArray(currentChatChar.boundWbIds) ? currentChatChar.boundWbIds : [];
    var books = wbData.filter(function(w) { return boundWbIds.indexOf(w.id) !== -1; });
    var allEntries = [];
    books.forEach(function(b) {
      if (Array.isArray(b.entries)) allEntries = allEntries.concat(b.entries);
    });

    var historyText = chatHistory.slice(-10).map(function(m) { return m.content || m.text || ''; }).join(' ').toLowerCase();

    allEntries.forEach(function(e) {
      if (e.enabled === false) return;
      var match = false;
      if (e.mode === 'const') match = true;
      else if (Array.isArray(e.keys) && e.keys.length) {
        for (var i = 0; i < e.keys.length; i++) {
          if (historyText.indexOf(e.keys[i].toLowerCase()) !== -1) { match = true; break; }
        }
      } else { match = true; }

      if (!match) return;
      if (e.pos === 'depth') result.depth.push({ content: e.content, depth: e.depthVal || 2 });
      else if (e.pos === 'after') result.after.push(e.content);
      else result.before.push(e.content);
    });

    return result;
  }

  function buildPromptRules(cfg, charData, userData, history) {
    var charName = charData ? charData.name : '角色';
    var userName = (userData ? userData.name : '') || '墨墨';
    var callName = charData && charData.callName ? charData.callName : userName;
    var minM = Math.max(1, cfg.minMsgs || 1);
    var maxM = Math.max(1, cfg.maxMsgs || 3);

    var parts = [];
    parts.push('你正在即时聊天中与「' + callName + '」交谈。你是一个活生生的人，名叫「' + charName + '」。');
    parts.push('【世界观与交流规范】：\n1. 永远不要承认自己是AI或机器人。\n2. 你的回复由微信短句组成，简短、口语化、有温度。不要写长篇大论。');
    
    if (charData) {
      if (charData.personality) parts.push('【性格特质与言行语气】：\n' + charData.personality);
      if (charData.appearance) parts.push('【外貌长相与气质】：\n' + charData.appearance);
      if (charData.background) parts.push('【深度背景渊源】：\n' + charData.background);
      if (charData.hobbies) parts.push('【喜好偏好】：\n' + charData.hobbies);
      if (charData.relation) parts.push('【与' + userName + '的关系】：\n' + charData.relation);
      if (charData.callName) parts.push('【对' + userName + '的称呼】：\n' + charData.callName);
    }

    // 时间与天气感知
    var tw = buildTimeWeather(cfg);
    if (tw) parts.push(tw);

    // 心声流露规范
    if (cfg.innerVoice) {
      parts.push('【心声流露规范】：你可以在某句回复的开头或结尾用括号包含你的心理活动或小动作，如：（心跳微微加速）或（忍不住扬起嘴角）。');
    }

    // 智能消息条数切分指令
    parts.push('【回复条数与切分铁律 - 严格遵守】：\n每次回复必须发送 ' + minM + ' 到 ' + maxM + ' 条独立消息，各条消息之间务必使用 ' + SPLIT + ' 符号进行分隔。例如：第一条消息' + SPLIT + '第二条消息');

    // 世界书条目注入
    var wb = collectWorldBookEntries(charData ? charData.id : null, history);
    if (wb.before.length) parts.push('【核心世界书条目】：\n' + wb.before.join('\n'));

    return {
      systemPrompt: parts.join('\n\n'),
      depthInjects: wb.depth
    };
  }

  function buildApiPayload(charData, userData, cfg, history, isProactive, proPrompt) {
    var promptObj = buildPromptRules(cfg, charData, userData, history);
    var apiMsgs = [{ role: 'system', content: promptObj.systemPrompt }];

    var ctx = history.slice(-MAX_CONTEXT);
    var histMsgs = [];
    ctx.forEach(function(m) {
      var r = m.role || (m.sender === 'user' ? 'user' : 'assistant');
      var c = m.content || m.text || '';
      if (r === 'user' || r === 'assistant') histMsgs.push({ role: r, content: c });
    });

    if (promptObj.depthInjects.length && histMsgs.length) {
      promptObj.depthInjects.sort(function(a, b) { return b.depth - a.depth; });
      promptObj.depthInjects.forEach(function(d) {
        var pos = Math.max(0, histMsgs.length - d.depth);
        histMsgs.splice(pos, 0, { role: 'system', content: d.content });
      });
    }

    histMsgs.forEach(function(m) { apiMsgs.push(m); });

    if (isProactive && proPrompt) {
      apiMsgs.push({ role: 'user', content: '[系统指令，请勿当作对方发言，请以你的身份主动发来消息]\n' + proPrompt });
    }

    return apiMsgs;
  }

  // ============ 5. 渲染单聊总界面 (方案 B 高定) ============
  function openChatRoom(charObj, userObj) {
    currentChatChar = charObj;
    currentChatUser = userObj;
    replyingMsg = null;
    isStreaming = false;

    // 预取城市天气
    var cfg = getCfg(charObj.id);
    if (cfg.timeWeather && (cfg.charCity || charObj.location)) {
      fetchCharWeather(cfg.charCity || charObj.location, function() {});
    }

    loadChatMessages(charObj.id, function() {
      renderChatRoomDOM();
    });
  }

  function renderChatRoomDOM() {
    var existingStage = document.getElementById('wxChatRoomStage');
    if (existingStage) existingStage.remove();

    var stage = document.createElement('div');
    stage.className = 'wx-chat-room-stage';
    stage.id = 'wxChatRoomStage';

    var charEnName = getCharEnName(currentChatChar);
    var avatarSrc = currentChatChar.photo || '';
    var cfg = getCfg(currentChatChar.id);

    stage.innerHTML = ''
      // 1. 顶栏 (方案 B 典藏顶栏)
      + '<div class="wx-cr-header">'
      + '  <div class="wx-cr-left-group">'
      + '    <button class="wx-cr-back-btn" id="wxCrBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '    <div class="salon-avatar-badge">'
      + (avatarSrc ? '<img class="salon-avatar-img" src="' + esc(avatarSrc) + '" alt="">' : '<div class="salon-avatar-img">✦</div>')
      + '      <div class="salon-mini-wax">✦</div>'
      + '    </div>'
      + '  </div>'

      // 中间：中英文等大并列 + 故障撕裂动效 + 正在输入指示器
      + '  <div class="wx-cr-title-col">'
      + '    <div class="wx-cr-name-row">'
      + '      <span class="char-glitch-name-dark">' + esc(currentChatChar.name || 'Chat') + '</span>'
      + '      <span class="char-name-en-sub">' + esc(charEnName) + '</span>'
      + '    </div>'
      + '    <div class="typing-status-bar" id="wxCrTypingIndicator">'
      + '      <span class="typing-dots"><span></span><span></span><span></span></span>'
      + '      <span>TYPING... 正在输入中</span>'
      + '    </div>'
      + '  </div>'

      // 右侧：【纯粹星轨环 + 玄月】无边框悬浮图标
      + '  <button class="crescent-astrolabe-btn" id="wxCrMoreBtn" type="button" title="设置">'
      + '    <svg viewBox="0 0 24 24" fill="none">'
      + '      <circle cx="12" cy="12" r="9.2" stroke="currentColor" stroke-width="1.3"/>'
      + '      <path d="M12 4.8A7.2 7.2 0 1 0 19.2 12A5.6 5.6 0 1 1 12 4.8Z" fill="currentColor"/>'
      + '      <circle cx="12" cy="12" r="1.2" fill="#ffffff"/>'
      + '    </svg>'
      + '  </button>'
      + '</div>'

      // 2. 聊天消息区
      + '<div class="wx-cr-body" id="wxCrBody"></div>'

      // 3. 向上悬浮弹出的透明多功能菜单 (Upward Tray)
      + '<div class="upward-tray-overlay" id="wxCrUpwardTray">'
      + '  <div class="tray-slider-container" id="wxCrTraySlider">'
      + '    <div class="tray-page-grid">'
      + renderTrayItem('album', '照片', '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>')
      + renderTrayItem('camera', '拍摄', '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>')
      + renderTrayItem('call', '通话', '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>')
      + renderTrayItem('location', '位置', '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>')
      + renderTrayItem('redpack', '红包', '<rect x="4" y="2" width="16" height="20" rx="3"/><circle cx="12" cy="10" r="3"/><line x1="4" y1="8" x2="20" y2="8"/>')
      + renderTrayItem('transfer', '转账', '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>')
      + renderTrayItem('favorite', '收藏', '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>')
      + renderTrayItem('card', '名片', '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>')
      + '    </div>'
      + '    <div class="tray-page-grid">'
      + renderTrayItem('coupon', '卡券', '<rect x="3" y="6" width="18" height="12" rx="2"/><line x1="9" y1="6" x2="9" y2="18" stroke-dasharray="2 2"/>')
      + renderTrayItem('music', '音乐', '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>')
      + renderTrayItem('file', '文件', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>')
      + renderTrayItem('link', '分享链接', '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>')
      + renderTrayItem('watch', '一起看', '<polygon points="5 3 19 12 5 21 5 3"/>')
      + '    </div>'
      + '  </div>'
      + '  <div class="tray-pagination">'
      + '    <span class="tray-dot active" id="wxCrDot0"></span>'
      + '    <span class="tray-dot" id="wxCrDot1"></span>'
      + '  </div>'
      + '</div>'

      // 4. 底部输入控制条 (完全透明无横线)
      + '<div class="chat-footer-clean">'
      + '  <div class="input-bar-wrap">'
      + '    <button class="pure-icon-btn" id="wxCrVoiceBtn" type="button" title="语音输入">'
      + '      <svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>'
      + '    </button>'
      + '    <div class="input-capsule-glass">'
      + '      <input class="input-field-inner" id="wxCrInput" type="text" placeholder="与 ' + esc(currentChatChar.name || 'Ta') + ' 私语...">'
      + '    </div>'
      + '    <button class="pure-plus-trigger" id="wxCrPlusBtn" type="button" title="更多功能">'
      + '      <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
      + '    </button>'
      + '    <button class="pure-send-balloon-btn" id="wxCrSendBtn" type="button" title="发送">'
      + '      <svg viewBox="0 0 64 64" fill="none">'
      + '        <path d="M52 12 L12 26 L30 32 L42 54 Z" fill="#2a2a2a" stroke="#2a2a2a" stroke-width="6" stroke-linejoin="round"/>'
      + '      </svg>'
      + '    </button>'
      + '  </div>'
      + '</div>'

      // 5. 角色专属全功能参数抽屉
      + '<div class="wx-cr-settings-mask" id="wxCrSetMask"></div>'
      + '<div class="wx-cr-settings-panel" id="wxCrSetPanel">'
      + '  <div class="wx-cr-set-header">'
      + '    <span>' + esc(currentChatChar.name || '角色') + ' · 设定与参数</span>'
      + '    <button class="wx-cr-set-close" id="wxCrSetCloseBtn" type="button">✕</button>'
      + '  </div>'
      + '  <div class="wx-cr-set-body">'
      + '    <div class="wx-cr-set-group">'
      + '      <div class="wx-cr-set-row">'
      + '        <div><div class="wx-cr-set-label">心声流露</div><div class="wx-cr-set-desc">开启后角色回复中将包含内心独白与心声</div></div>'
      + '        <div class="wx-switch' + (cfg.innerVoice ? ' on' : '') + '" id="swInnerVoice"><div class="wx-switch-knob"></div></div>'
      + '      </div>'
      + '      <div class="wx-cr-set-row">'
      + '        <div><div class="wx-cr-set-label">主动发消息</div><div class="wx-cr-set-desc">根据时间与离线状态自主发起话题</div></div>'
      + '        <div class="wx-switch' + (cfg.proactive ? ' on' : '') + '" id="swAutoMsg"><div class="wx-switch-knob"></div></div>'
      + '      </div>'
      + '    </div>'
      + '    <div class="wx-cr-set-group">'
      + '      <div class="wx-cr-set-row">'
      + '        <div class="wx-cr-set-label">城市地点感知</div>'
      + '        <input class="wx-cr-set-input" id="iptCharCity" value="' + esc(cfg.charCity || currentChatChar.location || '') + '" placeholder="如: 枫丹·沫芒宫 / 巴黎">'
      + '      </div>'
      + '      <div class="wx-cr-set-row">'
      + '        <div class="wx-cr-set-label">API 创造温度</div>'
      + '        <input class="wx-cr-set-input" id="iptApiTemp" type="number" step="0.05" min="0.1" max="1.5" value="' + (cfg.temperature || 0.85) + '">'
      + '      </div>'
      + '    </div>'
      + '    <div class="wx-cr-set-group">'
      + '      <div class="wx-cr-set-row">'
      + '        <div class="wx-cr-set-label">接口模式</div>'
      + '        <input class="wx-cr-set-input" id="iptApiMode" value="' + (cfg.apiMode === 'individual' ? '独立角色配置' : '跟随全局设置') + '" readonly>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(stage);
    bindChatEvents(stage);
    renderMessages();
  }

  function renderTrayItem(act, label, svgPaths) {
    return '<div class="tray-btn-item" data-tray-act="' + act + '">'
      + '<div class="tray-icon-pure"><svg viewBox="0 0 24 24">' + svgPaths + '</svg></div>'
      + '<span class="tray-label-text">' + label + '</span>'
      + '</div>';
  }

  // ============ 6. 渲染消息流与心声解析 ============
  function parseInnerVoice(text) {
    var raw = (text || '').trim();
    var voice = '';
    var match = raw.match(/[\(（]([^\)）]{2,})[\)）]/);
    if (match && match[1]) {
      voice = match[1].trim();
      raw = raw.replace(match[0], '').trim();
    }
    return { text: raw || '...', voice: voice };
  }

  function renderMessages() {
    var body = document.getElementById('wxCrBody');
    if (!body) return;

    if (!chatMessages.length) {
      body.innerHTML = '<div class="wx-msg-time-pill">刚刚</div>'
        + '<div class="wx-msg-system-pill">你已与 ' + esc(currentChatChar.name || 'Ta') + ' 建立专属私语通道</div>';
      return;
    }

    var html = '<div class="wx-msg-time-pill">今天</div>';
    var cfg = getCfg(currentChatChar.id);

    chatMessages.forEach(function (msg, idx) {
      if (msg.isSystem) {
        html += '<div class="wx-msg-system-pill">' + esc(msg.content || msg.text) + '</div>';
        return;
      }

      var isUser = (msg.role === 'user' || msg.sender === 'user');
      var avatarSrc = isUser
        ? (currentChatUser ? (currentChatUser.customPolPhoto || currentChatUser.photo) : '')
        : (currentChatChar ? currentChatChar.photo : '');

      var contentText = msg.content || msg.text || '';
      var voiceHtml = '';
      if (!isUser && cfg.innerVoice) {
        var parsed = parseInnerVoice(contentText);
        contentText = parsed.text;
        if (parsed.voice) {
          voiceHtml = '<div class="wx-msg-inner-voice">💭 ' + esc(parsed.voice) + '</div>';
        }
      }

      var quoteHtml = msg.quote ? '<div class="wx-msg-quote-bar">' + esc(msg.quote) + '</div>' : '';

      html += '<div class="wx-msg-row' + (isUser ? ' user-side' : '') + '" data-msg-idx="' + idx + '">'
        + '<div class="wx-msg-avatar" data-avatar-click="' + (isUser ? 'user' : 'char') + '">'
        + (avatarSrc ? '<img src="' + esc(avatarSrc) + '">' : '✦')
        + '</div>'
        + '<div class="wx-msg-bubble-col">'
        + quoteHtml
        + '<div class="wx-msg-bubble" data-bubble-idx="' + idx + '">' + esc(contentText) + '</div>'
        + voiceHtml
        + '</div>'
        + '</div>';
    });

    body.innerHTML = html;
    body.scrollTop = body.scrollHeight;
  }

  function updateTypingUI(show) {
    var indicator = document.getElementById('wxCrTypingIndicator');
    if (indicator) {
      if (show) indicator.classList.add('show');
      else indicator.classList.remove('show');
    }
  }

  // ============ 7. 真实流式 Stream 发送与请求 ============
  function requestAIStream() {
    var cfg = getCfg(currentChatChar.id);
    var api = getActiveApi(currentChatChar.id);

    if (!api || !api.url || !api.key) {
      if (window.AppNav) window.AppNav.showToast('请先在「设置 - API 配置」中保存并启用接口');
      updateTypingUI(false);
      return;
    }

    var apiMsgs = buildApiPayload(currentChatChar, currentChatUser, cfg, chatMessages, false, null);
    var url = api.url.replace(/\/+$/, '') + '/chat/completions';
    var params = getParams(currentChatChar.id);

    isStreaming = true;
    streamPartialText = '';
    abortCtrl = new AbortController();
    updateTypingUI(true);

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + api.key
      },
      body: JSON.stringify({
        model: api.model,
        messages: apiMsgs,
        stream: true,
        temperature: params.temperature,
        frequency_penalty: params.freqPenalty,
        presence_penalty: params.presPenalty
      }),
      signal: abortCtrl.signal
    })
    .then(function(resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
      var reader = resp.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      function read() {
        return reader.read().then(function(result) {
          if (result.done) {
            onStreamDone(streamPartialText, cfg);
            return;
          }
          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || !line.startsWith('data:')) continue;
            var data = line.slice(5).trim();
            if (data === '[DONE]') {
              onStreamDone(streamPartialText, cfg);
              return;
            }
            if (!data) continue;
            try {
              var json = JSON.parse(data);
              var delta = json.choices && json.choices[0] && json.choices[0].delta;
              if (delta && delta.content) {
                streamPartialText += delta.content;
              }
            } catch(e) {}
          }
          return read();
        });
      }
      return read();
    })
    .catch(function(err) {
      isStreaming = false;
      updateTypingUI(false);
      if (err.name === 'AbortError') return;
      var errMsg = err.message || String(err);
      var cnMsg = translateError(errMsg);
      if (window.AppNav) window.AppNav.showToast(cnMsg);
    });
  }

  function onStreamDone(text, cfg) {
    isStreaming = false;
    abortCtrl = null;
    updateTypingUI(false);

    var rawText = (text || '').trim();
    if (!rawText) return;

    // 智能多条拆分存储
    var parts = smartSplitMessages(rawText);
    var now = Date.now();
    parts.forEach(function(p, idx) {
      chatMessages.push({
        role: 'assistant',
        sender: 'char',
        content: p,
        ts: now + idx * 800
      });
    });

    saveChatMessages(currentChatChar.id);
    renderMessages();
  }

  // ============ 8. 交互事件绑定 ============
  function bindChatEvents(stage) {
    var backBtn = stage.querySelector('#wxCrBackBtn');
    backBtn.addEventListener('click', function () {
      if (abortCtrl) abortCtrl.abort();
      stage.remove();
    });

    // 向上弹出托盘控制
    var plusBtn = stage.querySelector('#wxCrPlusBtn');
    var upwardTray = stage.querySelector('#wxCrUpwardTray');
    var chatBody = stage.querySelector('#wxCrBody');

    plusBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = upwardTray.classList.toggle('show');
      plusBtn.classList.toggle('open', isOpen);
    });

    chatBody.addEventListener('click', function () {
      upwardTray.classList.remove('show');
      plusBtn.classList.remove('open');
    });

    // 托盘横向翻页
    var traySlider = stage.querySelector('#wxCrTraySlider');
    var dot0 = stage.querySelector('#wxCrDot0');
    var dot1 = stage.querySelector('#wxCrDot1');

    if (traySlider && dot0 && dot1) {
      traySlider.addEventListener('scroll', function () {
        var scrollLeft = traySlider.scrollLeft;
        var width = traySlider.clientWidth;
        if (scrollLeft > width / 2) {
          dot0.classList.remove('active');
          dot1.classList.add('active');
        } else {
          dot0.classList.add('active');
          dot1.classList.remove('active');
        }
      });
    }

    // 设置抽屉
    var moreBtn = stage.querySelector('#wxCrMoreBtn');
    var mask = stage.querySelector('#wxCrSetMask');
    var panel = stage.querySelector('#wxCrSetPanel');
    var closeSetBtn = stage.querySelector('#wxCrSetCloseBtn');

    function openSettings() {
      mask.classList.add('show');
      panel.classList.add('open');
      upwardTray.classList.remove('show');
      plusBtn.classList.remove('open');
    }
    function closeSettings() {
      mask.classList.remove('show');
      panel.classList.remove('open');
    }

    moreBtn.addEventListener('click', openSettings);
    mask.addEventListener('click', closeSettings);
    closeSetBtn.addEventListener('click', closeSettings);

    // 参数开关监听与同步
    var cfg = getCfg(currentChatChar.id);
    var swVoice = stage.querySelector('#swInnerVoice');
    if (swVoice) {
      swVoice.addEventListener('click', function() {
        this.classList.toggle('on');
        cfg.innerVoice = this.classList.contains('on');
        saveCfg(currentChatChar.id, cfg);
        renderMessages();
      });
    }

    var swAuto = stage.querySelector('#swAutoMsg');
    if (swAuto) {
      swAuto.addEventListener('click', function() {
        this.classList.toggle('on');
        cfg.proactive = this.classList.contains('on');
        saveCfg(currentChatChar.id, cfg);
      });
    }

    var iptCity = stage.querySelector('#iptCharCity');
    var iptTemp = stage.querySelector('#iptApiTemp');

    function syncFields() {
      if (iptCity) cfg.charCity = iptCity.value.trim();
      if (iptTemp) cfg.temperature = parseFloat(iptTemp.value) || 0.85;
      saveCfg(currentChatChar.id, cfg);
    }

    if (iptCity) iptCity.addEventListener('blur', syncFields);
    if (iptTemp) iptTemp.addEventListener('blur', syncFields);

    // 输入与发送监听
    var input = stage.querySelector('#wxCrInput');
    var sendBtn = stage.querySelector('#wxCrSendBtn');

    if (input) {
      input.addEventListener('focus', function() { isInputIdle = false; resetIdleTimer(); });
      input.addEventListener('input', function() { isInputIdle = false; resetIdleTimer(); });
      input.addEventListener('blur', function() { isInputIdle = true; checkIdleQueue(); });
    }

    function resetIdleTimer() {
      if (inputIdleTimer) clearTimeout(inputIdleTimer);
      inputIdleTimer = setTimeout(function() {
        isInputIdle = true;
        checkIdleQueue();
      }, 4000);
    }

    function checkIdleQueue() {
      if (!isInputIdle || !isWaitingForIdle) return;
      isWaitingForIdle = false;
      requestAIStream();
    }

    function doSendMessage() {
      var text = (input.value || '').trim();
      if (!text) return;

      var newMsg = {
        role: 'user',
        sender: 'user',
        content: text,
        ts: Date.now()
      };

      if (replyingMsg) {
        newMsg.quote = (replyingMsg.sender === 'user' ? '你' : currentChatChar.name) + ': ' + (replyingMsg.content || replyingMsg.text);
        replyingMsg = null;
        input.placeholder = '与 ' + currentChatChar.name + ' 私语...';
      }

      chatMessages.push(newMsg);
      input.value = '';
      saveChatMessages(currentChatChar.id);
      renderMessages();

      if (isStreaming) return;

      if (sendDelayTimer) { clearTimeout(sendDelayTimer); sendDelayTimer = null; }
      isWaitingForIdle = false;

      updateTypingUI(true);

      sendDelayTimer = setTimeout(function() {
        sendDelayTimer = null;
        if (isInputIdle) {
          requestAIStream();
        } else {
          isWaitingForIdle = true;
        }
      }, 1500);
    }

    sendBtn.addEventListener('click', doSendMessage);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSendMessage();
      }
    });

    // 拍一拍
    stage.addEventListener('dblclick', function(e) {
      var avt = e.target.closest('[data-avatar-click]');
      if (avt) {
        var who = avt.dataset.avatarClick === 'user' ? '自己' : currentChatChar.name;
        chatMessages.push({
          isSystem: true,
          content: '你拍了拍「' + who + '」',
          ts: Date.now()
        });
        saveChatMessages(currentChatChar.id);
        renderMessages();
      }
    });

    // 长按气泡功能
    var pressTimer = null;
    stage.addEventListener('touchstart', function(e) {
      var bubble = e.target.closest('[data-bubble-idx]');
      if (!bubble) return;
      var idx = parseInt(bubble.dataset.bubbleIdx, 10);

      pressTimer = setTimeout(function() {
        var targetMsg = chatMessages[idx];
        if (!targetMsg) return;

        if (window.PhotoAction) {
          window.PhotoAction.show(
            function () { // 引用
              replyingMsg = targetMsg;
              input.placeholder = '回复 ' + (targetMsg.sender === 'user' ? '自己' : currentChatChar.name) + '...';
              input.focus();
            },
            function () { // 撤回/删除
              chatMessages.splice(idx, 1);
              saveChatMessages(currentChatChar.id);
              renderMessages();
            }
          );
        }
      }, 500);
    });

    stage.addEventListener('touchend', function() {
      clearTimeout(pressTimer);
    });

    // 托盘功能
    stage.querySelectorAll('[data-tray-act]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var act = this.dataset.trayAct;
        upwardTray.classList.remove('show');
        plusBtn.classList.remove('open');

        if (act === 'location') {
          chatMessages.push({
            role: 'user',
            sender: 'user',
            content: '📍 [位置] ' + (cfg.charCity || currentChatChar.location || '当前位置'),
            ts: Date.now()
          });
          saveChatMessages(currentChatChar.id);
          renderMessages();
          requestAIStream();
        } else if (act === 'redpack') {
          chatMessages.push({
            role: 'user',
            sender: 'user',
            content: '🧧 [微信红包] 恭喜发财，大吉大利',
            ts: Date.now()
          });
          saveChatMessages(currentChatChar.id);
          renderMessages();
          requestAIStream();
        } else if (act === 'transfer') {
          chatMessages.push({
            role: 'user',
            sender: 'user',
            content: '💰 [转账] ￥520.00',
            ts: Date.now()
          });
          saveChatMessages(currentChatChar.id);
          renderMessages();
          requestAIStream();
        } else {
          if (window.AppNav) window.AppNav.showToast('✦ 正在连接角色 ✦');
        }
      });
    });
  }

  // ============ 9. 本地消息存储与读取 ============
  function loadChatMessages(charId, cb) {
    if (!window.AppDB) {
      try {
        chatMessages = JSON.parse(localStorage.getItem('wx_chat_msgs_' + charId) || '[]');
      } catch(e) { chatMessages = []; }
      if (cb) cb();
      return;
    }
    window.AppDB.get('wx_chat_msgs_' + charId, function(msgs) {
      if (msgs && Array.isArray(msgs)) {
        chatMessages = msgs;
      } else {
        try {
          chatMessages = JSON.parse(localStorage.getItem('wx_chat_msgs_' + charId) || '[]');
        } catch(e) { chatMessages = []; }
      }
      if (cb) cb();
    });
  }

  function saveChatMessages(charId) {
    try {
      localStorage.setItem('wx_chat_msgs_' + charId, JSON.stringify(chatMessages));
    } catch(e) {}
    if (window.AppDB) {
      window.AppDB.save('wx_chat_msgs_' + charId, chatMessages);
    }
  }

  window.WxChatRoom = {
    open: openChatRoom
  };

})();
