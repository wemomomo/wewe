
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

  window._returnToChatFromArchive = false;

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(ts) { var d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function esc(str) { return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }

  // ============ 1. 角色独立配置与 API 获取 ============
  function getCfg(charId) {
    var defaultCfg = {
      mainLang: '简体中文',
      bilingual: false,
      biLang: 'English',
      biStyle: 'bracket',
      minimax: false,
      proactive: false,
      proMinInterval: 15,
      proMaxInterval: 120,
      proActiveStart: '08:00',
      proActiveEnd: '23:30',
      proMode: 'manual',
      proLevel: 3,
      replySpeed: '正常（3-8秒）',
      showTyping: true,
      minMsgs: 1,
      maxMsgs: 3,
      msgTypes: ['文字','表情','图片','语音','语音通话','视频通话','红包','转账','位置','音乐'],
      stickerGen: false,
      stickerStyles: ['可爱卡通'],
      stickerFreq: 2,
      timeWeather: true,
      charCity: '',
      charRealCity: '',
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
    var info = '【当前时间】：' + timeStr;

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

  // ============ 4. 世界书与双模式智能系统提示词 ============
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
    parts.push('【基础对话铁律】：\n1. 永远不要承认自己是AI或机器人。\n2. 你的回复由即时通讯短句组成，简短、口语化、有真实温度。不要写长篇大论。');

    var hasCustomProfile = !!(charData && (charData.personality || charData.appearance || charData.background || charData.hobbies));

    if (hasCustomProfile) {
      parts.push('【专属人设铁律 - 严格执行】：\n你拥有完整清晰的人格设定，必须100%严格遵循以下人设风格，绝不脱离人设(OOC)：');
      if (charData.personality) parts.push('· 性格特质与语气：\n' + charData.personality);
      if (charData.appearance) parts.push('· 外貌长相与气质：\n' + charData.appearance);
      if (charData.background) parts.push('· 深度背景与经历：\n' + charData.background);
      if (charData.hobbies) parts.push('· 喜好与习惯：\n' + charData.hobbies);
      if (charData.relation) parts.push('· 与' + userName + '的关系：\n' + charData.relation);
      if (charData.callName) parts.push('· 对' + userName + '的称呼：\n' + charData.callName);
    } else {
      parts.push('【自由人设铁律 - 严禁冷落】：\n当前未给定固定人设，你可以按照自己的想法和偏好展现独特的灵魂与个性，自由做自己。但下达绝对铁律：严禁冷落「' + callName + '」，必须主动、真诚、充满陪伴感与互动感。');
    }

    var tw = buildTimeWeather(cfg);
    if (tw) parts.push(tw);

    if (cfg.innerVoice) {
      parts.push('【心声与动态流露规范】：\n你拥有独立丰富的生活与真实内心。在每轮回复的末尾，你可以附带一个专属括号格式，记录你此刻的真实心声、当下动作与身心状态，格式如下：\n[心声: 你的内心独白 | 动作: 你正在做的事或小举止 | 心情: 当前情绪 | 体力: 当前体力状态]');
    }

    parts.push('【回复条数与切分铁律 - 严格遵守】：\n每次回复必须发送 ' + minM + ' 到 ' + maxM + ' 条独立短消息，各条消息之间务必使用 ' + SPLIT + ' 符号进行分隔。例如：第一条消息' + SPLIT + '第二条消息');

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
      apiMsgs.push({ role: 'user', content: '[系统指令，请以你的身份主动发来消息]\n' + proPrompt });
    }

    return apiMsgs;
  }

  // ============ 5. 渲染单聊总界面 ============
  function openChatRoom(charObj, userObj) {
    currentChatChar = charObj;
    currentChatUser = userObj;
    replyingMsg = null;
    isStreaming = false;

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

    var avatarSrc = currentChatChar.photo || '';
    var cfg = getCfg(currentChatChar.id);

    stage.innerHTML = ''
      // 1. 顶栏 (大名居中，左侧头像点击查看历史心声，右侧双图标)
      + '<div class="wx-cr-header">'
      + '  <div class="wx-cr-left-group">'
      + '    <button class="wx-cr-back-btn" id="wxCrBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '    <div class="salon-avatar-badge" id="wxCrCharHeadBtn" title="点击查看历史心声">'
      + (avatarSrc ? '<img class="salon-avatar-img" src="' + esc(avatarSrc) + '" alt="">' : '<div class="salon-avatar-img">✦</div>')
      + '      <div class="salon-mini-wax">✦</div>'
      + '    </div>'
      + '  </div>'

      // 中间正中：角色大名 + 正在输入
      + '  <div class="wx-cr-title-col">'
      + '    <span class="char-glitch-name-dark">' + esc(currentChatChar.name || 'Chat') + '</span>'
      + '    <div class="typing-status-bar" id="wxCrTypingIndicator">'
      + '      <span class="typing-dots"><span></span><span></span><span></span></span>'
      + '      <span>TYPING... 正在输入中</span>'
      + '    </div>'
      + '  </div>'

      // 右侧：AI 生图图标 (实心黑四角星+微星) + 纯粹星轨玄月图标
      + '  <div class="wx-cr-right-group">'
      + '    <button class="cr-header-icon-btn" id="wxCrAiImgBtn" type="button" title="AI 生图" data-action="ai-image">'
      + '      <svg viewBox="0 0 24 24" fill="none">'
      + '        <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" fill="#1a1c22"></path>'
      + '        <path d="M19.5 3.5l0.6 1.8 1.9 0.7-1.9 0.7-0.6 1.8-0.6-1.8-1.9-0.7 1.9-0.7z" fill="#1a1c22"></path>'
      + '        <path d="M4.5 17.5l0.6 1.8 1.9 0.7-1.9 0.7-0.6 1.8-0.6-1.8-1.9-0.7 1.9-0.7z" fill="#1a1c22"></path>'
      + '      </svg>'
      + '    </button>'
      + '    <button class="cr-header-icon-btn" id="wxCrMoreBtn" type="button" title="设置">'
      + '      <svg viewBox="0 0 24 24" fill="none">'
      + '        <circle cx="12" cy="12" r="9.2" stroke="#1a1c22" stroke-width="1.3"/>'
      + '        <path d="M12 4.8A7.2 7.2 0 1 0 19.2 12A5.6 5.6 0 1 1 12 4.8Z" fill="#1a1c22"/>'
      + '        <circle cx="12" cy="12" r="1.2" fill="#ffffff"/>'
      + '      </svg>'
      + '    </button>'
      + '  </div>'
      + '</div>'

      // 2. 聊天消息区 (纯白背景)
      + '<div class="wx-cr-body" id="wxCrBody"></div>'

      // 3. 向上弹出的多功能菜单（完全透明，表情包排在第一位）
      + '<div class="upward-tray-overlay" id="wxCrUpwardTray">'
      + '  <div class="tray-slider-container" id="wxCrTraySlider">'
      + '    <div class="tray-page-grid">'
      + renderTrayItem('sticker', '表情包', '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>')
      + renderTrayItem('album', '照片', '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>')
      + renderTrayItem('camera', '拍摄', '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>')
      + renderTrayItem('call', '通话', '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>')
      + renderTrayItem('location', '位置', '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>')
      + renderTrayItem('redpack', '红包', '<rect x="4" y="2" width="16" height="20" rx="3"/><circle cx="12" cy="10" r="3"/><line x1="4" y1="8" x2="20" y2="8"/>')
      + renderTrayItem('transfer', '转账', '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>')
      + renderTrayItem('favorite', '收藏', '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>')
      + '    </div>'
      + '    <div class="tray-page-grid">'
      + renderTrayItem('card', '名片', '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>')
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

      // 4. 底部输入控制条 (输入框 #f8f8fa + 大加号 28px)
      + '<div class="chat-footer-clean">'
      + '  <div class="input-bar-wrap">'
      + '    <button class="pure-icon-btn" id="wxCrVoiceBtn" type="button" title="语音输入">'
      + '      <svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="18" x2="12" y2="22"></line><line x1="8" y1="22" x2="16" y2="22"></line></svg>'
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

      // 5. 【彻底无遮罩】双栏心声手账卡片
      + '<div class="voice-transparent-wrap" id="wxCrVoiceModalWrap">'
      + '  <div class="voice-dossier-card" id="wxCrVoiceCard">'
      + '    <div class="card-tape-deco"></div>'
      + '    <div class="card-header-line">'
      + '      <span class="card-serial-code">' + esc(currentChatChar.name || 'CHAR') + ' · VITAL DOSSIER</span>'
      + '      <button class="card-close-btn" id="wxCrCloseVoiceBtn" type="button">✕</button>'
      + '    </div>'
      + '    <div class="voice-monologue-sec">'
      + '      <div class="voice-quote-text" id="wxCrVoiceMonologueText">“ 想要立刻飞奔到墨墨身边... ”</div>'
      + '      <div class="voice-heart-pulse-bar">'
      + '        <div class="line"></div>'
      + '        <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>'
      + '        <div class="line"></div>'
      + '      </div>'
      + '    </div>'
      + '    <div class="voice-lower-columns">'
      + '      <div class="col-action">'
      + '        <span class="col-title">当前行止 ACTION</span>'
      + '        <div class="action-detail-text" id="wxCrVoiceActionText">正靠在窗边喝红茶，看着窗外的风景。</div>'
      + '        <div class="action-sub-wish" id="wxCrVoiceWishText">☕ 想吃城南现烤的栗子糕。</div>'
      + '      </div>'
      + '      <div class="col-status">'
      + '        <span class="col-title">状态 VITAL</span>'
      + '        <div class="stat-row">'
      + '          <div class="stat-label-bar"><span>心情状态</span><span id="wxCrVoiceMoodLabel">欣悦</span></div>'
      + '          <div class="stat-progress-track"><div class="stat-progress-fill" id="wxCrVoiceMoodFill" style="width: 90%;"></div></div>'
      + '        </div>'
      + '        <div class="stat-row">'
      + '          <div class="stat-label-bar"><span>当前体力</span><span id="wxCrVoiceEnergyLabel">75%</span></div>'
      + '          <div class="stat-progress-track"><div class="stat-progress-fill" id="wxCrVoiceEnergyFill" style="width: 75%;"></div></div>'
      + '        </div>'
      + '        <div class="stat-row">'
      + '          <div class="stat-label-bar"><span>心动同频</span><span id="wxCrVoiceLoveLabel">99%</span></div>'
      + '          <div class="stat-progress-track"><div class="stat-progress-fill" id="wxCrVoiceLoveFill" style="width: 99%;"></div></div>'
      + '        </div>'
      + '      </div>'
      + '    </div>'
      + '    <div class="card-footer-sec">'
      + '      <span class="card-timestamp-sub" id="wxCrVoiceTimeSub">RECORDED · 14:32:08</span>'
      + '      <div class="card-motto-sub">对我来说，你不可重复</div>'
      + '    </div>'
      + '  </div>'
      + '</div>'

      // 6. 【历史心声留存馆】
      + '<div class="history-voice-mask" id="wxCrHistoryVoiceMask">'
      + '  <div class="history-voice-modal">'
      + '    <div class="history-modal-header">'
      + '      <span class="history-modal-title">✦ ' + esc(currentChatChar.name || 'Ta') + ' 的心声留存馆 ✦</span>'
      + '      <button class="history-close-btn" id="wxCrCloseHistoryBtn" type="button">✕</button>'
      + '    </div>'
      + '    <div class="history-modal-list" id="wxCrHistoryVoiceList"></div>'
      + '  </div>'
      + '</div>'

      // 7. 角色专属设定中枢（正中间弹出小卡片，完整 CharMgr 结构）
      + '<div class="wx-cr-settings-mask" id="wxCrSetMask">'
      + '  <div class="wx-cr-settings-card" id="wxCrSetCard">'
      + '    <div class="wx-cr-set-header">'
      + '      <span>' + esc(currentChatChar.name || '角色') + ' · 设定与参数</span>'
      + '      <button class="wx-cr-set-close" id="wxCrSetCloseBtn" type="button">✕</button>'
      + '    </div>'
      + '    <div class="wx-cr-set-body" id="wxCrSetBody"></div>'
      + '  </div>'
      + '</div>'

      // 8. 长按消息黑色悬浮菜单
      + '<div class="cr-ctx-menu-mask" id="wxCrCtxMask"></div>'
      + '<div class="cr-ctx-menu" id="wxCrCtxMenu" style="display:none;">'
      + '  <div class="cr-ctx-item" data-ctx-act="quote"><svg viewBox="0 0 24 24"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg><span>引用</span></div>'
      + '  <div class="cr-ctx-item" data-ctx-act="copy"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>复制</span></div>'
      + '  <div class="cr-ctx-item" data-ctx-act="resend"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg><span>重发</span></div>'
      + '  <div class="cr-ctx-item" data-ctx-act="del"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg><span>删除</span></div>'
      + '</div>';

    document.body.appendChild(stage);
    renderFullSettingsDOM(stage, cfg);
    bindChatEvents(stage);
    renderMessages();
  }

  function renderTrayItem(act, label, svgPaths) {
    return '<div class="tray-btn-item" data-tray-act="' + act + '">'
      + '<div class="tray-icon-pure"><svg viewBox="0 0 24 24">' + svgPaths + '</svg></div>'
      + '<span class="tray-label-text">' + label + '</span>'
      + '</div>';
  }

  // ============ 6. 渲染设定中枢 DOM ============
  function renderFullSettingsDOM(stage, cfg) {
    var setBody = stage.querySelector('#wxCrSetBody');
    if (!setBody) return;

    var sv = function(k, v) { return cfg[k] === v ? ' selected' : ''; };
    var STK_STYLES = ['可爱卡通','写实','像素风','手绘','表情包梗图'];
    var PRO_LEVEL_NAMES = ['佛系','偶尔','适中','频繁','粘人'];

    var isIndividual = (cfg.apiMode === 'individual');

    var stkStylesHtml = STK_STYLES.map(function(s) {
      var checked = (cfg.stickerStyles && cfg.stickerStyles.indexOf(s) >= 0) ? ' checked' : '';
      return '<label class="cr-set-chip"><input type="checkbox" data-stk-style="' + s + '"' + checked + '><span>' + s + '</span></label>';
    }).join('');

    var apiList = [];
    try { apiList = JSON.parse(localStorage.getItem('api_configs') || '[]'); } catch(e){}
    var apiOptionsHtml = '<option value="">请选择独立 API...</option>' + apiList.map(function(a) {
      var sel = cfg.apiSelect === a.name ? ' selected' : '';
      return '<option value="' + esc(a.name) + '"' + sel + '>' + esc(a.name) + ' (' + esc(a.model || '') + ')</option>';
    }).join('');

    setBody.innerHTML = ''
      // 1. 心声流露
      + '<div class="cr-set-card-group">'
      + '  <div class="cr-set-card-row"><div><div class="cr-set-label">心声流露</div><div class="cr-set-desc">开启后角色回复中将包含内心独白</div></div><div class="wx-switch' + (cfg.innerVoice ? ' on' : '') + '" id="swInnerVoice"><div class="wx-switch-knob"></div></div></div>'
      + '</div>'

      // 2. 主动发消息
      + '<div class="cr-set-card-group">'
      + '  <div class="cr-set-card-title">主动发消息</div>'
      + '  <div class="cr-set-card-row"><div><div class="cr-set-label">开启主动联系</div><div class="cr-set-desc">角色会不定时主动发起话题</div></div><div class="wx-switch' + (cfg.proactive ? ' on' : '') + '" id="swProactive"><div class="wx-switch-knob"></div></div></div>'
      + '  <div class="cr-set-card-row"><span>消息频率 (间隔分钟)</span><div style="display:flex;align-items:center;gap:6px;"><input class="cr-set-num-input" id="cfgProMin" type="number" value="' + (cfg.proMinInterval||15) + '"><span>至</span><input class="cr-set-num-input" id="cfgProMax" type="number" value="' + (cfg.proMaxInterval||120) + '"></div></div>'
      + '  <div class="cr-set-card-row"><span>活跃时段</span><div style="display:flex;gap:6px;"><input class="cr-set-time-input" id="cfgProStart" type="time" value="' + (cfg.proActiveStart||'08:00') + '"><span>至</span><input class="cr-set-time-input" id="cfgProEnd" type="time" value="' + (cfg.proActiveEnd||'23:30') + '"></div></div>'
      + '  <div class="cr-set-card-row"><span>消息积极程度</span><select class="cr-set-select" id="cfgProLevel">' + PRO_LEVEL_NAMES.map(function(name, idx){ return '<option value="' + (idx+1) + '"' + ((cfg.proLevel||3)===(idx+1)?' selected':'') + '>' + name + '</option>'; }).join('') + '</select></div>'
      + '  <div class="cr-set-card-row"><span>单次回复条数</span><div style="display:flex;align-items:center;gap:6px;"><input class="cr-set-num-input" id="cfgMinMsgs" type="number" min="1" max="10" value="' + (cfg.minMsgs||1) + '"><span>至</span><input class="cr-set-num-input" id="cfgMaxMsgs" type="number" min="1" max="10" value="' + (cfg.maxMsgs||3) + '"></div></div>'
      + '  <div class="cr-set-card-row"><span>回复速度</span><select class="cr-set-select" id="cfgReplySpeed"><option' + sv('replySpeed','快速（1-3秒）') + '>快速（1-3秒）</option><option' + sv('replySpeed','正常（3-8秒）') + '>正常（3-8秒）</option><option' + sv('replySpeed','慢速（5-15秒）') + '>慢速（5-15秒）</option></select></div>'
      + '  <div class="cr-set-card-row"><div><div class="cr-set-label">显示「正在输入中」</div><div class="cr-set-desc">顶栏展示打字动态动画</div></div><div class="wx-switch' + (cfg.showTyping !== false ? ' on' : '') + '" id="swShowTyping"><div class="wx-switch-knob"></div></div></div>'
      + '</div>'

      // 3. 温度与创造力参数
      + '<div class="cr-set-card-group">'
      + '  <div class="cr-set-card-title">温度与创造力参数</div>'
      + '  <div class="cr-set-card-row"><span>Temperature (温度)</span><input class="cr-set-num-input" id="cfgTemp" type="number" step="0.05" min="0" max="2" value="' + (cfg.temperature || 0.85) + '"></div>'
      + '  <div class="cr-set-card-row"><span>Frequency Penalty</span><input class="cr-set-num-input" id="cfgFreq" type="number" step="0.1" min="0" max="2" value="' + (cfg.freqPenalty || 0.3) + '"></div>'
      + '  <div class="cr-set-card-row"><span>Presence Penalty</span><input class="cr-set-num-input" id="cfgPres" type="number" step="0.1" min="0" max="2" value="' + (cfg.presPenalty || 0.3) + '"></div>'
      + '</div>'

      // 4. 是否单独配置 API
      + '<div class="cr-set-card-group">'
      + '  <div class="cr-set-card-title">API 接口模式</div>'
      + '  <div class="cr-set-card-row"><div><div class="cr-set-label">单独配置 API</div><div class="cr-set-desc">为该角色指定专属模型或代理</div></div><div class="wx-switch' + (isIndividual ? ' on' : '') + '" id="swIndividualApi"><div class="wx-switch-knob"></div></div></div>'
      + '  <div class="cr-set-card-row" id="rowApiSelect" style="' + (isIndividual ? '' : 'display:none;') + '"><span>选择专属 API</span><select class="cr-set-select" id="cfgApiSelect">' + apiOptionsHtml + '</select></div>'
      + '</div>'

      // 5. 时间 & 天气感知
      + '<div class="cr-set-card-group">'
      + '  <div class="cr-set-card-title">情境与天气感知</div>'
      + '  <div class="cr-set-card-row"><div><div class="cr-set-label">时间 & 天气感知</div><div class="cr-set-desc">让角色获知当前真实时间与天气</div></div><div class="wx-switch' + (cfg.timeWeather ? ' on' : '') + '" id="swTimeWeather"><div class="wx-switch-knob"></div></div></div>'
      + '  <div class="cr-set-card-row"><span>真实城市 (抓取天气)</span><input class="cr-set-input" id="cfgCharRealCity" placeholder="如: Tokyo, Paris, 上海" value="' + esc(cfg.charRealCity || '') + '"></div>'
      + '  <div class="cr-set-card-row"><span>虚拟地名 (设定城市)</span><input class="cr-set-input" id="cfgCharCity" placeholder="留空则使用真实城市" value="' + esc(cfg.charCity || '') + '"></div>'
      + '</div>'

      // 6. 语言与语音
      + '<div class="cr-set-card-group">'
      + '  <div class="cr-set-card-title">语言与语音</div>'
      + '  <div class="cr-set-card-row"><span>主要语言</span><select class="cr-set-select" id="cfgMainLang"><option' + sv('mainLang','简体中文') + '>简体中文</option><option' + sv('mainLang','繁體中文') + '>繁體中文</option><option' + sv('mainLang','English') + '>English</option><option' + sv('mainLang','日本語') + '>日本語</option><option' + sv('mainLang','한국어') + '>한국어</option></select></div>'
      + '  <div class="cr-set-card-row"><div><div class="cr-set-label">双语模式</div><div class="cr-set-desc">每条消息附带翻译</div></div><div class="wx-switch' + (cfg.bilingual ? ' on' : '') + '" id="swBilingual"><div class="wx-switch-knob"></div></div></div>'
      + '  <div class="cr-set-card-row"><div><div class="cr-set-label">MiniMax 语音</div><div class="cr-set-desc">TTS 真实语音合成</div></div><div class="wx-switch' + (cfg.minimax ? ' on' : '') + '" id="swMinimax"><div class="wx-switch-knob"></div></div></div>'
      + '</div>'

      // 7. 表情包生成
      + '<div class="cr-set-card-group">'
      + '  <div class="cr-set-card-title">表情包生成</div>'
      + '  <div class="cr-set-card-row"><div><div class="cr-set-label">AI 表情包生成</div><div class="cr-set-desc">配合语境自动配图</div></div><div class="wx-switch' + (cfg.stickerGen ? ' on' : '') + '" id="swStickerGen"><div class="wx-switch-knob"></div></div></div>'
      + '  <div class="cr-set-chips-wrap" id="cfgStkStylesWrap">' + stkStylesHtml + '</div>'
      + '</div>';
  }

  // ============ 7. 渲染气泡群与心声结构解析 ============
  function parseDossierVoice(text) {
    var raw = (text || '').trim();
    var voiceObj = null;

    var match = raw.match(/\[心声:\s*([^\|\]]+)(?:\|\s*动作:\s*([^\|\]]+))?(?:\|\s*心情:\s*([^\|\]]+))?(?:\|\s*体力:\s*([^\|\]]+))?\]/i);
    if (match) {
      voiceObj = {
        monologue: (match[1] || '').trim(),
        action: (match[2] || '正专心凝望着窗外。').trim(),
        mood: (match[3] || '平静温和').trim(),
        energy: (match[4] || '80%').trim()
      };
      raw = raw.replace(match[0], '').trim();
    } else {
      var simpleMatch = raw.match(/[\(（]([^\)）]{2,})[\)）]/);
      if (simpleMatch && simpleMatch[1]) {
        voiceObj = {
          monologue: simpleMatch[1].trim(),
          action: '正看着手机屏幕，嘴角带着一抹浅笑。',
          mood: '极度依恋',
          energy: '85%'
        };
        raw = raw.replace(simpleMatch[0], '').trim();
      }
    }

    return { text: raw || '...', voiceObj: voiceObj };
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
    var groups = [];
    var curGroup = null;

    // 分组连续发言
    for (var i = 0; i < chatMessages.length; i++) {
      var m = chatMessages[i];
      var isUser = (m.role === 'user' || m.sender === 'user');
      if (!curGroup || curGroup.isUser !== isUser || m.isSystem) {
        curGroup = { isUser: isUser, isSystem: !!m.isSystem, msgs: [] };
        groups.push(curGroup);
      }
      curGroup.msgs.push({ msg: m, globalIdx: i });
    }

    groups.forEach(function(g) {
      if (g.isSystem) {
        g.msgs.forEach(function(item) {
          html += '<div class="wx-msg-system-pill">' + esc(item.msg.content || item.msg.text) + '</div>';
        });
        return;
      }

      var isUser = g.isUser;
      var avatarSrc = isUser
        ? (currentChatUser ? (currentChatUser.customPolPhoto || currentChatUser.photo) : '')
        : (currentChatChar ? currentChatChar.photo : '');

      html += '<div class="wx-msg-group' + (isUser ? ' user-side' : '') + '">'
        + '<div class="wx-msg-avatar" data-avatar-side="' + (isUser ? 'user' : 'char') + '" title="点击查看档案详情">'
        + (avatarSrc ? '<img src="' + esc(avatarSrc) + '">' : (isUser ? '墨' : '✦'))
        + '</div>'
        + '<div class="wx-msg-bubbles-col">';

      var total = g.msgs.length;
      g.msgs.forEach(function(item, idx) {
        var m = item.msg;
        var globalIdx = item.globalIdx;
        var content = m.content || m.text || '';
        var voiceObj = m.voiceObj || null;

        if (!isUser && !voiceObj) {
          var parsed = parseDossierVoice(content);
          content = parsed.text;
          voiceObj = parsed.voiceObj;
          m.voiceObj = voiceObj;
          m.cleanContent = content;
        } else if (m.cleanContent) {
          content = m.cleanContent;
        }

        var shapeCls = '';
        if (total === 1) {
          shapeCls = isUser ? 'user-single' : 'char-single';
        } else {
          if (idx === 0) shapeCls = isUser ? 'user-top' : 'char-top';
          else if (idx === total - 1) shapeCls = isUser ? 'user-bot' : 'char-bot';
          else shapeCls = isUser ? 'user-mid' : 'char-mid';
        }

        var heartHtml = '';
        if (!isUser && voiceObj && idx === total - 1) {
          heartHtml = '<span class="voice-heart-trigger" data-voice-idx="' + globalIdx + '" title="点击查看当下心声">'
            + '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>'
            + '</span>';
        }

        var quoteHtml = m.quote ? '<div class="wx-msg-quote-bar">' + esc(m.quote) + '</div>' : '';

        html += '<div class="wx-msg-bubble-item ' + shapeCls + '" data-bubble-idx="' + globalIdx + '">'
          + quoteHtml
          + esc(content)
          + heartHtml
          + '</div>';
      });

      html += '</div></div>';
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

  // ============ 8. 真实流式 Stream 发送与请求 ============
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

  // ============ 9. 交互事件、直达档案、长按菜单与手势绑定 ============
  function bindChatEvents(stage) {
    function closeChatRoom(callback) {
      if (abortCtrl) abortCtrl.abort();
      stage.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s';
      stage.style.transform = 'translateX(100%)';
      stage.style.opacity = '0';
      setTimeout(function() { 
        stage.remove(); 
        if (callback) callback();
      }, 250);
    }

    var backBtn = stage.querySelector('#wxCrBackBtn');
    backBtn.addEventListener('click', function() { closeChatRoom(); });

    // ── 直达档案详情卡片（不进编辑手账） ──
    function gotoArchiveCard(side) {
      window._returnToChatFromArchive = {
        char: currentChatChar,
        user: currentChatUser
      };
      stage.style.display = 'none';

      if (window.AppNav) {
        window.AppNav.showPage('archive');
        setTimeout(function() {
          var tabBtn = document.getElementById(side === 'char' ? 'tabCharBtn' : 'tabUserBtn');
          if (tabBtn) tabBtn.click();
        }, 50);
      }
    }

    // 监听聊天中左右头像点击
    stage.addEventListener('click', function(e) {
      var avt = e.target.closest('[data-avatar-side]');
      if (avt) {
        var side = avt.dataset.avatarSide;
        gotoArchiveCard(side);
      }
    });

    // 左上角头像点击 -> 弹出【历史心声留存馆】
    var charHeadBtn = stage.querySelector('#wxCrCharHeadBtn');
    var histMask = stage.querySelector('#wxCrHistoryVoiceMask');
    var histList = stage.querySelector('#wxCrHistoryVoiceList');
    var closeHistBtn = stage.querySelector('#wxCrCloseHistoryBtn');

    if (charHeadBtn) {
      charHeadBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var voiceMsgs = chatMessages.filter(function(m) { return m.voiceObj; });
        if (!voiceMsgs.length) {
          histList.innerHTML = '<div class="cr-voice-empty">✦ 还没有沉淀下他的心声碎片哦 ✦</div>';
        } else {
          histList.innerHTML = voiceMsgs.map(function(m) {
            var vo = m.voiceObj;
            return '<div class="history-item-card">'
              + '<div class="history-item-top"><span class="history-item-time">' + fmtTime(m.ts || Date.now()) + '</span><svg class="history-item-heart" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg></div>'
              + '<div class="history-item-text">“ ' + esc(vo.monologue) + ' ”</div>'
              + '<div class="history-item-context">回复: ' + esc(m.cleanContent || m.content || m.text) + '</div>'
              + '</div>';
          }).join('');
        }
        histMask.classList.add('show');
      });
    }

    if (closeHistBtn) closeHistBtn.addEventListener('click', function() { histMask.classList.remove('show'); });
    if (histMask) histMask.addEventListener('click', function(e) { if (e.target === histMask) histMask.classList.remove('show'); });

    // 单次心声弹卡逻辑 (实心黑小心心)
    var voiceModalWrap = stage.querySelector('#wxCrVoiceModalWrap');
    var closeVoiceBtn = stage.querySelector('#wxCrCloseVoiceBtn');

    stage.addEventListener('click', function(e) {
      var heart = e.target.closest('[data-voice-idx]');
      if (heart) {
        e.stopPropagation();
        var idx = parseInt(heart.dataset.voiceIdx, 10);
        var targetMsg = chatMessages[idx];
        if (!targetMsg || !targetMsg.voiceObj) return;

        var vo = targetMsg.voiceObj;
        stage.querySelector('#wxCrVoiceMonologueText').textContent = '“ ' + vo.monologue + ' ”';
        stage.querySelector('#wxCrVoiceActionText').textContent = vo.action || '正安静地坐在桌前。';
        stage.querySelector('#wxCrVoiceWishText').textContent = '☕ 心情温和，期待着你的下一次回应。';
        stage.querySelector('#wxCrVoiceMoodLabel').textContent = vo.mood || '欣悦';
        stage.querySelector('#wxCrVoiceEnergyLabel').textContent = vo.energy || '80%';
        stage.querySelector('#wxCrVoiceTimeSub').textContent = 'RECORDED · ' + fmtTime(targetMsg.ts || Date.now());

        voiceModalWrap.classList.add('show');
      }
    });

    if (closeVoiceBtn) closeVoiceBtn.addEventListener('click', function() { voiceModalWrap.classList.remove('show'); });
    if (voiceModalWrap) {
      voiceModalWrap.addEventListener('click', function(e) {
        if (e.target === voiceModalWrap) voiceModalWrap.classList.remove('show');
      });
    }

    // AI 生图按钮
    var aiImgBtn = stage.querySelector('#wxCrAiImgBtn');
    if (aiImgBtn) {
      aiImgBtn.addEventListener('click', function() {
        if (window.AppNav) window.AppNav.showToast('✦ AI 生图工作室即将开放 ✦');
      });
    }

    // ── 核心右滑返回手势 ──
    var startX = 0, startY = 0, currentX = 0, isSwiping = false, isLocked = false, isHoriz = false;

    stage.addEventListener('touchstart', function(e) {
      if (e.touches[0].clientX > 45) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentX = 0;
      isSwiping = true;
      isLocked = false;
      isHoriz = false;
      stage.style.transition = 'none';
    }, { passive: true });

    stage.addEventListener('touchmove', function(e) {
      if (!isSwiping) return;
      var diffX = e.touches[0].clientX - startX;
      var diffY = e.touches[0].clientY - startY;

      if (!isLocked && (Math.abs(diffX) > 5 || Math.abs(diffY) > 5)) {
        isLocked = true;
        isHoriz = Math.abs(diffX) > Math.abs(diffY);
      }

      if (!isHoriz) return;

      if (diffX > 0) {
        currentX = diffX;
        stage.style.transform = 'translateX(' + currentX + 'px)';
      }
    }, { passive: true });

    stage.addEventListener('touchend', function() {
      if (!isSwiping || !isHoriz) { isSwiping = false; return; }
      isSwiping = false;

      if (currentX > window.innerWidth * 0.28) {
        closeChatRoom();
      } else {
        stage.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
        stage.style.transform = 'translateX(0)';
      }
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
      dismissCtxMenu();
    });

    // 托盘翻页
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

    // 正中心弹出式设置卡片
    var moreBtn = stage.querySelector('#wxCrMoreBtn');
    var mask = stage.querySelector('#wxCrSetMask');
    var closeSetBtn = stage.querySelector('#wxCrSetCloseBtn');

    function openSettings() {
      mask.classList.add('show');
      upwardTray.classList.remove('show');
      plusBtn.classList.remove('open');
    }
    function closeSettings() {
      mask.classList.remove('show');
    }

    moreBtn.addEventListener('click', openSettings);
    mask.addEventListener('click', function(e) {
      if (e.target === mask) closeSettings();
    });
    closeSetBtn.addEventListener('click', closeSettings);

    // 绑定设置项与实时持久化
    var cfg = getCfg(currentChatChar.id);

    function syncSettingFields() {
      var gv = function(id) { var el = stage.querySelector('#' + id); return el ? el.value : ''; };
      cfg.innerVoice = stage.querySelector('#swInnerVoice') ? stage.querySelector('#swInnerVoice').classList.contains('on') : true;
      cfg.proactive = stage.querySelector('#swAutoMsg') ? stage.querySelector('#swAutoMsg').classList.contains('on') : false;
      cfg.proMinInterval = parseInt(gv('cfgProMin'), 10) || 15;
      cfg.proMaxInterval = parseInt(gv('cfgProMax'), 10) || 120;
      cfg.proActiveStart = gv('cfgProStart') || '08:00';
      cfg.proActiveEnd = gv('cfgProEnd') || '23:30';
      cfg.proLevel = parseInt(gv('cfgProLevel'), 10) || 3;
      cfg.minMsgs = parseInt(gv('cfgMinMsgs'), 10) || 1;
      cfg.maxMsgs = parseInt(gv('cfgMaxMsgs'), 10) || 3;
      cfg.replySpeed = gv('cfgReplySpeed') || '正常（3-8秒）';
      cfg.showTyping = stage.querySelector('#swShowTyping') ? stage.querySelector('#swShowTyping').classList.contains('on') : true;
      cfg.temperature = parseFloat(gv('cfgTemp')) || 0.85;
      cfg.freqPenalty = parseFloat(gv('cfgFreq')) || 0.3;
      cfg.presPenalty = parseFloat(gv('cfgPres')) || 0.3;
      cfg.apiMode = stage.querySelector('#swIndividualApi') && stage.querySelector('#swIndividualApi').classList.contains('on') ? 'individual' : 'global';
      cfg.apiSelect = gv('cfgApiSelect') || '';
      cfg.timeWeather = stage.querySelector('#swTimeWeather') ? stage.querySelector('#swTimeWeather').classList.contains('on') : true;
      cfg.charRealCity = gv('cfgCharRealCity') || '';
      cfg.charCity = gv('cfgCharCity') || '';
      cfg.mainLang = gv('cfgMainLang') || '简体中文';
      cfg.bilingual = stage.querySelector('#swBilingual') ? stage.querySelector('#swBilingual').classList.contains('on') : false;
      cfg.minimax = stage.querySelector('#swMinimax') ? stage.querySelector('#swMinimax').classList.contains('on') : false;
      cfg.stickerGen = stage.querySelector('#swStickerGen') ? stage.querySelector('#swStickerGen').classList.contains('on') : false;

      var checkedStyles = [];
      stage.querySelectorAll('#cfgStkStylesWrap input:checked').forEach(function(cb) { checkedStyles.push(cb.dataset.stkStyle); });
      cfg.stickerStyles = checkedStyles.length ? checkedStyles : ['可爱卡通'];

      saveCfg(currentChatChar.id, cfg);
    }

    stage.querySelectorAll('.wx-switch').forEach(function(sw) {
      sw.addEventListener('click', function() {
        this.classList.toggle('on');
        if (this.id === 'swIndividualApi') {
          var rowSel = stage.querySelector('#rowApiSelect');
          if (rowSel) rowSel.style.display = this.classList.contains('on') ? 'flex' : 'none';
        }
        syncSettingFields();
      });
    });

    stage.querySelectorAll('.cr-set-select, .cr-set-input, .cr-set-num-input, .cr-set-time-input, #cfgStkStylesWrap input').forEach(function(inp) {
      inp.addEventListener('change', syncSettingFields);
      inp.addEventListener('blur', syncSettingFields);
    });

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
        newMsg.quote = (replyingMsg.sender === 'user' ? '你' : currentChatChar.name) + ': ' + (replyingMsg.cleanContent || replyingMsg.content || replyingMsg.text);
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

      var replySpeed = cfg.replySpeed || '正常（3-8秒）';
      var delayMs = 1500;
      if (replySpeed === '快速（1-3秒）') delayMs = 1000;
      else if (replySpeed === '慢速（5-15秒）') delayMs = 3500;

      sendDelayTimer = setTimeout(function() {
        sendDelayTimer = null;
        if (isInputIdle) {
          requestAIStream();
        } else {
          isWaitingForIdle = true;
        }
      }, delayMs);
    }

    sendBtn.addEventListener('click', doSendMessage);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSendMessage();
      }
    });

    // ── 长按消息黑色悬浮菜单逻辑 ──
    var ctxMenu = stage.querySelector('#wxCrCtxMenu');
    var ctxMask = stage.querySelector('#wxCrCtxMask');
    var currentCtxIdx = -1;

    function dismissCtxMenu() {
      if (ctxMenu) ctxMenu.style.display = 'none';
      if (ctxMask) ctxMask.classList.remove('show');
      currentCtxIdx = -1;
    }

    if (ctxMask) ctxMask.addEventListener('click', dismissCtxMenu);

    var pressTimer = null;
    stage.addEventListener('touchstart', function(e) {
      var bubble = e.target.closest('[data-bubble-idx]');
      if (!bubble) return;
      var idx = parseInt(bubble.dataset.bubbleIdx, 10);

      pressTimer = setTimeout(function () {
        currentCtxIdx = idx;
        var rect = bubble.getBoundingClientRect();
        var top = rect.top;
        var left = rect.left + rect.width / 2;

        if (ctxMenu) {
          ctxMenu.style.top = top + 'px';
          ctxMenu.style.left = left + 'px';
          ctxMenu.style.display = 'flex';
        }
        if (ctxMask) ctxMask.classList.add('show');
      }, 450);
    });

    stage.addEventListener('touchend', function() {
      clearTimeout(pressTimer);
    });

    stage.querySelectorAll('[data-ctx-act]').forEach(function(item) {
      item.addEventListener('click', function() {
        var act = this.dataset.ctxAct;
        var targetMsg = chatMessages[currentCtxIdx];
        dismissCtxMenu();
        if (!targetMsg) return;

        if (act === 'quote') {
          replyingMsg = targetMsg;
          input.placeholder = '回复 ' + (targetMsg.sender === 'user' ? '自己' : currentChatChar.name) + '...';
          input.focus();
        } else if (act === 'copy') {
          var textToCopy = targetMsg.cleanContent || targetMsg.content || targetMsg.text || '';
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy);
          }
          if (window.AppNav) window.AppNav.showToast('已复制到剪贴板');
        } else if (act === 'resend') {
          chatMessages.splice(currentCtxIdx);
          saveChatMessages(currentChatChar.id);
          renderMessages();
          requestAIStream();
        } else if (act === 'del') {
          chatMessages.splice(currentCtxIdx, 1);
          saveChatMessages(currentChatChar.id);
          renderMessages();
        }
      });
    });

    // 托盘功能点击
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

  // ============ 10. 本地消息存储与读取 ============
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
