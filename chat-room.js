
(function () {
  'use strict';

  var SPLIT = '|||';
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

  var _proactiveTimer = null;
  window._chatActiveCharId = null;

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(ts) { var d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function esc(str) { return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }

  // ============ 1. 角色独立配置读取与持久化 ============
  function getCfg(charId) {
    var defaultCfg = {
      sceneText: '',           // 当前场景（背景补充）
      historyLimit: 20,        // 记忆深度/历史轮数 (0为不限, 最高1000)
      innerVoice: true,        // 心声流露开关
      voiceLevelMode: 'normal',// 'normal' 平常 | 'obsessed' 迷恋
      mainLang: '简体中文',
      bilingual: false,
      biLang: 'English',
      biStyle: 'bracket',
      minimax: false,
      proactive: false,
      proMinInterval: 15,
      proMaxInterval: 120,
      proActiveMode: 'allday', // 'allday' | 'custom'
      proActiveStart: '08:00',
      proActiveEnd: '23:30',
      proLevelMode: 'manual',  // 'manual' | 'auto'
      proLevel: 3,
      replySpeed: '正常（2-4秒）',
      showTyping: true,
      minMsgs: 1,
      maxMsgs: 3,
      msgTypes: ['文字','表情','图片','语音','语音通话','视频通话','位置','音乐'],
      stickerGen: false,
      stickerStyles: ['可爱卡通'],
      stickerFreq: 2,
      imgApiSelect: '',
      imgModel: 'gpt-image-1',
      timeWeather: true,
      charCity: '',
      charRealCity: '',
      apiMode: 'global',
      apiSelect: '',
      temperature: 0.85,
      freqPenalty: 0.3,
      presPenalty: 0.3
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

  // ============ 2. 天气获取引擎 ============
  function fetchCharWeather(realCity, callback) {
    if (!realCity) { if (callback) callback(null); return; }
    var cacheKey = realCity.toLowerCase();
    var cached = _charWeatherCache[cacheKey];
    if (cached && Date.now() - cached.time < 30 * 60 * 1000) {
      if (callback) callback(cached);
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
          if (callback) callback(w);
        } else { if (callback) callback(null); }
      })
      .catch(function() { if (callback) callback(null); });
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

    var city = cfg.charCity || cfg.charRealCity || (currentChatChar ? currentChatChar.location : '') || '';
    if (city) {
      var cacheKey = (cfg.charRealCity || city).toLowerCase();
      var cw = _charWeatherCache[cacheKey];
      if (cw) {
        info += '\n【当前所在地天气】：' + city + '，' + cw.desc + '，' + cw.temp + '°C，湿度' + cw.humidity + '%';
      } else {
        info += '\n【当前所在城市】：' + city;
      }
    }
    return info;
  }

  // ============ 3. 消息切分与错误翻译 ============
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

  // ============ 4. 系统指令与上下文组装 ============
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
    var charName = charData ? (charData.name || '角色') : '角色';
    var userName = userData ? (userData.name || userData.nickname || '对方') : '对方';
    var callName = (charData && charData.callName) ? charData.callName : userName;
    var minM = Math.max(1, cfg.minMsgs || 1);
    var maxM = Math.max(1, cfg.maxMsgs || 3);

    var parts = [];
    parts.push('你正在即时聊天中与「' + callName + '」交谈。你是一个活生生的人，名叫「' + charName + '」。');
    parts.push('【基础对话铁律】：\n1. 永远不要承认自己是AI或机器人。\n2. 你的回复由即时通讯短句组成，简短、口语化、有真实生活气息。严禁长篇大论小作文。');

    if (cfg.sceneText && cfg.sceneText.trim()) {
      parts.push('【当前所处场景与背景补充】：\n' + cfg.sceneText.trim());
    }

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
      parts.push('【自由人设铁律 - 严禁冷落】：\n当前未给定固定人设，你可以按照自己的想法和偏好展现独特的灵魂与个性，自由做自己。但下达绝对铁律：严禁冷落「' + callName + '」，必须主动、真诚、充满陪伴感。');
    }

    if (cfg.proLevelMode === 'auto') {
      parts.push('【主动联系积极程度】：由你的自身性格设定自主决定联系的主动性与频率。');
    }

    var tw = buildTimeWeather(cfg);
    if (tw) parts.push(tw);

    // 4. 心声流露规范（区分【平常】与【迷恋】）
    if (cfg.innerVoice) {
      if (cfg.voiceLevelMode === 'obsessed') {
        parts.push('【心声流露模式 - 迷恋 (NSFW/深层欲望)】：\n你对「' + callName + '」怀有极度热烈、深沉甚至充满占有欲与隐秘遐想的深层情感。在每轮回复末尾附带以下格式：\n[心声: 你的内心真实独白（可大胆流露深层欲望与占有渴望） | 动作: 你此刻身体正做出的动作或隐秘小举止 | 独立心愿: 你自己此刻想吃的东西、想做的事情或生活念头]');
      } else {
        parts.push('【心声流露模式 - 平常】：\n在每轮回复末尾附带以下格式：\n[心声: 你的内心真实独白 | 动作: 你当下身体正做出的动作或神态举止 | 独立心愿: 你自己此刻想吃的东西、想做的事情或生活念头]');
      }
    }

    parts.push('【回复条数与切分铁律 - 严格遵守】：\n每次回复必须发送 ' + minM + ' 到 ' + maxM + ' 条独立短消息，各条消息之间务必使用 ' + SPLIT + ' 符号分隔。例如：第一条短句' + SPLIT + '第二条短句');

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

    var limit = parseInt(cfg.historyLimit, 10);
    var histMsgs = [];
    var ctx = (limit <= 0) ? history : history.slice(-limit);

    ctx.forEach(function(m) {
      var r = m.role || (m.sender === 'user' ? 'user' : 'assistant');
      var c = m.cleanContent || m.content || m.text || '';
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
    window._chatActiveCharId = charObj.id;

    var cfg = getCfg(charObj.id);
    if (cfg.timeWeather && (cfg.charRealCity || cfg.charCity || charObj.location)) {
      fetchCharWeather(cfg.charRealCity || cfg.charCity || charObj.location, function() {});
    }

    loadChatMessages(charObj.id, function() {
      renderChatRoomDOM();
      startProactiveTimer();
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

    var charBio = currentChatChar.quote0 || currentChatChar.bio || currentChatChar.personality || '“ 只要呼唤我，我都在。 ”';
    if (charBio.length > 24) charBio = charBio.slice(0, 24) + '...';

    stage.innerHTML = ''
      // 1. 顶栏 (无横线，名字正中，个签拉开距离)
      + '<div class="wx-cr-header">'
      + '  <div class="wx-cr-left-group">'
      + '    <button class="wx-cr-back-btn" id="wxCrBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '    <div class="salon-avatar-badge" id="wxCrCharHeadBtn" title="点击查看心声留存档案">'
      + (avatarSrc ? '<img class="salon-avatar-img" src="' + esc(avatarSrc) + '" alt="">' : '<div class="salon-avatar-img">✦</div>')
      + '      <div class="salon-mini-wax">✦</div>'
      + '    </div>'
      + '  </div>'

      // 中间正中：角色大名 + 个签 / 正在输入
      + '  <div class="wx-cr-title-col">'
      + '    <span class="char-glitch-name-dark">' + esc(currentChatChar.name || 'Chat') + '</span>'
      + '    <div class="char-signature-sub" id="wxCrCharSig">' + esc(charBio) + '</div>'
      + '    <div class="typing-status-bar" id="wxCrTypingIndicator">'
      + '      <span class="typing-dots"><span></span><span></span><span></span></span>'
      + '      <span>正在输入中...</span>'
      + '    </div>'
      + '  </div>'

      // 右侧：生图图标 + 设置星轨
      + '  <div class="wx-cr-right-group">'
      + '    <button class="cr-header-icon-btn" id="wxCrAiImgBtn" type="button" title="AI 生图">'
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

      // 2. 聊天消息区 (白透毛玻璃)
      + '<div class="wx-cr-body" id="wxCrBody"></div>'

      // 3. 向上弹出的多功能菜单
      + '<div class="upward-tray-overlay" id="wxCrUpwardTray">'
      + '  <div class="tray-slider-container" id="wxCrTraySlider">'
      + '    <div class="tray-page-grid">'
      + renderTrayItem('sticker', '表情包', '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>')
      + renderTrayItem('album', '照片', '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>')
      + renderTrayItem('camera', '拍摄', '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>')
      + renderTrayItem('call', '通话', '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>')
      + renderTrayItem('favorite', '收藏', '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>')
      + renderTrayItem('card', '名片', '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>')
      + renderTrayItem('coupon', '卡券', '<rect x="3" y="6" width="18" height="12" rx="2"/><line x1="9" y1="6" x2="9" y2="18" stroke-dasharray="2 2"/>')
      + renderTrayItem('music', '音乐', '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>')
      + '    </div>'
      + '    <div class="tray-page-grid">'
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

      // 4. 底部输入控制条
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

      // 5. 双栏心声手账卡片 (支持左右翻页)
      + '<div class="voice-transparent-wrap" id="wxCrVoiceModalWrap">'
      + '  <div class="voice-dossier-card" id="wxCrVoiceCard">'
      + '    <div class="card-tape-deco"></div>'
      + '    <div class="card-header-line">'
      + '      <button class="card-page-arrow prev" id="wxCrVoicePrevBtn" type="button">❮</button>'
      + '      <span class="card-serial-code" id="wxCrVoicePageTitle">' + esc(currentChatChar.name || 'CHAR') + ' · 心声档案</span>'
      + '      <button class="card-page-arrow next" id="wxCrVoiceNextBtn" type="button">❯</button>'
      + '      <button class="card-close-btn" id="wxCrCloseVoiceBtn" type="button">✕</button>'
      + '    </div>'
      + '    <div class="voice-monologue-sec">'
      + '      <div class="voice-quote-text" id="wxCrVoiceMonologueText">“ ... ”</div>'
      + '      <div class="voice-heart-pulse-bar">'
      + '        <div class="line"></div>'
      + '        <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>'
      + '        <div class="line"></div>'
      + '      </div>'
      + '    </div>'
      + '    <div class="voice-lower-columns">'
      + '      <div class="col-action">'
      + '        <span class="col-title">当前行止 ACTION</span>'
      + '        <div class="action-detail-text" id="wxCrVoiceActionText">正看着手机屏幕。</div>'
      + '      </div>'
      + '      <div class="col-wish">'
      + '        <span class="col-title">独立心愿 WISH</span>'
      + '        <div class="action-detail-text" id="wxCrVoiceWishText">想去街角喝杯刚煮好的黑咖啡。</div>'
      + '      </div>'
      + '    </div>'
      + '    <div class="card-footer-sec">'
      + '      <span class="card-timestamp-sub" id="wxCrVoiceTimeSub">RECORDED</span>'
      + '      <div class="card-motto-sub">对我来说，你不可重复</div>'
      + '    </div>'
      + '  </div>'
      + '</div>'

      // 6. 角色专属设定中枢
      + '<div class="wx-cr-settings-mask" id="wxCrSetMask">'
      + '  <div class="wx-cr-settings-card" id="wxCrSetCard">'
      + '    <div class="wx-cr-set-header">'
      + '      <span>' + esc(currentChatChar.name || '角色') + ' · 设定与参数</span>'
      + '      <button class="wx-cr-set-close" id="wxCrSetCloseBtn" type="button">✕</button>'
      + '    </div>'
      + '    <div class="wx-cr-set-body" id="wxCrSetBody"></div>'
      + '  </div>'
      + '</div>'

      // 7. 长按消息两行黑色悬浮菜单
      + '<div class="cr-ctx-menu-mask" id="wxCrCtxMask"></div>'
      + '<div class="cr-ctx-menu" id="wxCrCtxMenu" style="display:none;"></div>';

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

  // ============ 6. 渲染完整设定中枢 DOM ============
  function renderFullSettingsDOM(stage, cfg) {
    var setBody = stage.querySelector('#wxCrSetBody');
    if (!setBody) return;

    var sv = function(k, v) { return cfg[k] === v ? ' selected' : ''; };
    var STK_STYLES = ['可爱卡通','写实','像素风','手绘','表情包梗图'];
    var PRO_LEVEL_NAMES = ['佛系','偶尔','适中','频繁','粘人'];

    var isIndividual = (cfg.apiMode === 'individual');
    var isAllDay = (cfg.proActiveMode === 'allday');
    var isManualLevel = (cfg.proLevelMode === 'manual');
    var isObsessed = (cfg.voiceLevelMode === 'obsessed');
    var curHist = parseInt(cfg.historyLimit, 10);
    var histText = (curHist <= 0) ? '不限历史' : (curHist + ' 条');

    var stkStylesHtml = STK_STYLES.map(function(s) {
      var checked = (cfg.stickerStyles && cfg.stickerStyles.indexOf(s) >= 0) ? ' checked' : '';
      return '<label class="cr-set-chip"><input type="checkbox" data-stk-style="' + s + '"' + checked + '><span>' + s + '</span></label>';
    }).join('');

    var apiList = [];
    try { apiList = JSON.parse(localStorage.getItem('api_configs') || '[]'); } catch(e){}
    var apiOptionsHtml = '<option value="">跟随全局 API</option>' + apiList.map(function(a) {
      var sel = cfg.apiSelect === a.name ? ' selected' : '';
      return '<option value="' + esc(a.name) + '"' + sel + '>' + esc(a.name) + ' (' + esc(a.model || '') + ')</option>';
    }).join('');

    var imgApiOptionsHtml = '<option value="">跟随全局 API</option>' + apiList.map(function(a) {
      var sel = cfg.imgApiSelect === a.name ? ' selected' : '';
      return '<option value="' + esc(a.name) + '"' + sel + '>' + esc(a.name) + '</option>';
    }).join('');

    setBody.innerHTML = ''
      // 0. 当前场景（背景补充）与记忆深度
      + '<div class="cr-set-card-group">'
      + '  <div class="cr-set-card-title">场景与记忆</div>'
      + '  <div class="cr-set-card-row" style="flex-direction:column;align-items:stretch;gap:4px;">'
      + '    <div style="display:flex;justify-content:space-between;align-items:center;">'
      + '      <span class="cr-set-label">当前场景（背景补充）</span>'
      + '      <button class="cr-expand-edit-btn" id="btnExpandScene" type="button" title="扩大编辑"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none;"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>'
      + '    </div>'
      + '    <textarea class="cr-set-textarea" id="cfgSceneText" rows="4" placeholder="补充角色此刻所处的环境、心境或特定前置剧情...">' + esc(cfg.sceneText || '') + '</textarea>'
      + '  </div>'
      + '  <div class="cr-slider-block" style="margin-top:6px;">'
      + '    <div class="cr-slider-header"><span>记忆深度 / 历史轮数</span><span id="txtHistoryLimit">' + histText + '</span></div>'
      + '    <input class="cr-range-slider-full" id="cfgHistoryLimit" type="range" min="0" max="1000" step="5" value="' + curHist + '">'
      + '    <div class="cr-slider-desc-text">滑到最左侧 (0) 为不限制历史消息，最右侧为 1000 条</div>'
      + '  </div>'
      + '</div>'

      // 1. 心声流露及程度切换（平常 / 迷恋）
      + '<div class="cr-set-card-group">'
      + '  <div class="cr-set-card-title">心声流露</div>'
      + '  <div class="cr-set-card-row"><div><div class="cr-set-label">开启心声流露</div><div class="cr-set-desc">角色回复中将包含内心独白与心声</div></div><div class="wx-switch' + (cfg.innerVoice ? ' on' : '') + '" id="swInnerVoice"><div class="wx-switch-knob"></div></div></div>'
      + '  <div class="cr-set-card-row" id="rowVoiceLevel" style="' + (cfg.innerVoice ? '' : 'display:none;') + '"><span>心声流露模式</span><div style="display:flex;gap:12px;"><label class="cr-custom-radio"><input type="radio" name="rdoVoiceLevelMode" value="normal"' + (!isObsessed?' checked':'') + '><span class="cr-radio-circle"></span> 平常</label><label class="cr-custom-radio"><input type="radio" name="rdoVoiceLevelMode" value="obsessed"' + (isObsessed?' checked':'') + '><span class="cr-radio-circle"></span> 迷恋</label></div></div>'
      + '</div>'

      // 2. 主动发消息
      + '<div class="cr-set-card-group">'
      + '  <div class="cr-set-card-title">主动发消息</div>'
      + '  <div class="cr-set-card-row"><div><div class="cr-set-label">开启主动联系</div><div class="cr-set-desc">角色会根据时间与闲置状态主动发起话题</div></div><div class="wx-switch' + (cfg.proactive ? ' on' : '') + '" id="swProactive"><div class="wx-switch-knob"></div></div></div>'
      + '  <div class="cr-set-card-row"><span>消息频率 (间隔分钟)</span><div style="display:flex;align-items:center;gap:6px;"><input class="cr-set-num-input" id="cfgProMin" type="number" value="' + (cfg.proMinInterval||15) + '"><span>至</span><input class="cr-set-num-input" id="cfgProMax" type="number" value="' + (cfg.proMaxInterval||120) + '"></div></div>'
      + '  <div class="cr-set-card-row"><span>活跃时段</span><div style="display:flex;gap:12px;"><label class="cr-custom-radio"><input type="radio" name="rdoActiveMode" value="allday"' + (isAllDay?' checked':'') + '><span class="cr-radio-circle"></span> 全天</label><label class="cr-custom-radio"><input type="radio" name="rdoActiveMode" value="custom"' + (!isAllDay?' checked':'') + '><span class="cr-radio-circle"></span> 自定义</label></div></div>'
      + '  <div class="cr-set-card-row" id="rowCustomTime" style="' + (isAllDay?'display:none;':'') + '"><span>自定义时段</span><div style="display:flex;gap:6px;"><input class="cr-set-time-input" id="cfgProStart" type="time" value="' + (cfg.proActiveStart||'08:00') + '"><span>至</span><input class="cr-set-time-input" id="cfgProEnd" type="time" value="' + (cfg.proActiveEnd||'23:30') + '"></div></div>'
      + '  <div class="cr-set-card-row"><span>消息积极程度</span><div style="display:flex;gap:12px;"><label class="cr-custom-radio"><input type="radio" name="rdoLevelMode" value="manual"' + (isManualLevel?' checked':'') + '><span class="cr-radio-circle"></span> 手动</label><label class="cr-custom-radio"><input type="radio" name="rdoLevelMode" value="auto"' + (!isManualLevel?' checked':'') + '><span class="cr-radio-circle"></span> 角色性格决定</label></div></div>'
      + '  <div class="cr-set-card-row" id="rowManualLevel" style="' + (isManualLevel?'':'display:none;') + '"><span>设定程度</span><select class="cr-set-select" id="cfgProLevel">' + PRO_LEVEL_NAMES.map(function(name, idx){ return '<option value="' + (idx+1) + '"' + ((cfg.proLevel||3)===(idx+1)?' selected':'') + '>' + name + '</option>'; }).join('') + '</select></div>'
      + '  <div class="cr-set-card-row"><span>单次回复条数</span><div style="display:flex;align-items:center;gap:6px;"><input class="cr-set-num-input" id="cfgMinMsgs" type="number" min="1" max="10" value="' + (cfg.minMsgs||1) + '"><span>至</span><input class="cr-set-num-input" id="cfgMaxMsgs" type="number" min="1" max="10" value="' + (cfg.maxMsgs||3) + '"></div></div>'
      + '  <div class="cr-set-card-row"><span>回复速度</span><select class="cr-set-select" id="cfgReplySpeed"><option' + sv('replySpeed','快速（1-2秒）') + '>快速（1-2秒）</option><option' + sv('replySpeed','正常（2-4秒）') + '>正常（2-4秒）</option><option' + sv('replySpeed','慢速（4-7秒）') + '>慢速（4-7秒）</option></select></div>'
      + '</div>'

      // 3. 温度与三大创造力参数 (含详细解释与滑块)
      + '<div class="cr-set-card-group">'
      + '  <div class="cr-set-card-title">温度与创造力参数</div>'
      + '  <div class="cr-slider-block">'
      + '    <div class="cr-slider-header"><span>Temperature (创造力温度)</span><span id="txtTemp">' + (cfg.temperature || 0.85) + '</span></div>'
      + '    <div class="cr-slider-desc-text">严谨贴合人设 (0.1) ↔ 极具丰富发散创意 (2.0)</div>'
      + '    <input class="cr-range-slider-full" id="cfgTemp" type="range" min="0.05" max="2.0" step="0.05" value="' + (cfg.temperature || 0.85) + '">'
      + '  </div>'
      + '  <div class="cr-slider-block">'
      + '    <div class="cr-slider-header"><span>Frequency Penalty (重复词抑制)</span><span id="txtFreq">' + (cfg.freqPenalty || 0.3) + '</span></div>'
      + '    <div class="cr-slider-desc-text">允许自然重复 (0.0) ↔ 极力避免重复句式 (2.0)</div>'
      + '    <input class="cr-range-slider-full" id="cfgFreq" type="range" min="0.0" max="2.0" step="0.05" value="' + (cfg.freqPenalty || 0.3) + '">'
      + '  </div>'
      + '  <div class="cr-slider-block">'
      + '    <div class="cr-slider-header"><span>Presence Penalty (新话题倾向)</span><span id="txtPres">' + (cfg.presPenalty || 0.3) + '</span></div>'
      + '    <div class="cr-slider-desc-text">聚焦当前话题 (0.0) ↔ 积极引入新奇话题 (2.0)</div>'
      + '    <input class="cr-range-slider-full" id="cfgPres" type="range" min="0.0" max="2.0" step="0.05" value="' + (cfg.presPenalty || 0.3) + '">'
      + '  </div>'
      + '</div>'

      // 4. API 独立模式
      + '<div class="cr-set-card-group">'
      + '  <div class="cr-set-card-title">API 对话配置</div>'
      + '  <div class="cr-set-card-row"><div><div class="cr-set-label">单独配置 API</div><div class="cr-set-desc">为该角色指定独立对话模型</div></div><div class="wx-switch' + (isIndividual ? ' on' : '') + '" id="swIndividualApi"><div class="wx-switch-knob"></div></div></div>'
      + '  <div class="cr-set-card-row" id="rowApiSelect" style="' + (isIndividual ? '' : 'display:none;') + '"><span>选择专属 API</span><select class="cr-set-select" id="cfgApiSelect">' + apiOptionsHtml + '</select></div>'
      + '</div>'

      // 5. 时间 & 天气感知
      + '<div class="cr-set-card-group">'
      + '  <div class="cr-set-card-title">情境与天气感知</div>'
      + '  <div class="cr-set-card-row"><div><div class="cr-set-label">时间 & 天气感知</div><div class="cr-set-desc">让角色获知当前真实时间与天气</div></div><div class="wx-switch' + (cfg.timeWeather ? ' on' : '') + '" id="swTimeWeather"><div class="wx-switch-knob"></div></div></div>'
      + '  <div class="cr-set-card-row"><span>真实城市 (抓取天气)</span><div style="display:flex;gap:4px;align-items:center;"><input class="cr-set-input" id="cfgCharRealCity" placeholder="如: Tokyo, Paris" value="' + esc(cfg.charRealCity || '') + '"><button class="cr-fetch-btn" id="btnFetchWeather" type="button" title="抓取天气"><svg viewBox="0 0 24 24" fill="none"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button></div></div>'
      + '  <div class="cr-set-card-row"><span>虚拟地名 (设定城市)</span><input class="cr-set-input" id="cfgCharCity" placeholder="留空则使用真实城市" value="' + esc(cfg.charCity || '') + '"></div>'
      + '</div>'

      // 6. 表情包生成 (带绘图 API 通道与拉取模型按钮)
      + '<div class="cr-set-card-group">'
      + '  <div class="cr-set-card-title">表情包生成 API 通道</div>'
      + '  <div class="cr-set-card-row"><div><div class="cr-set-label">AI 表情包生成</div><div class="cr-set-desc">配合语境自动配图</div></div><div class="wx-switch' + (cfg.stickerGen ? ' on' : '') + '" id="swStickerGen"><div class="wx-switch-knob"></div></div></div>'
      + '  <div class="cr-set-card-row"><span>绘图 API 来源</span><select class="cr-set-select" id="cfgImgApiSelect">' + imgApiOptionsHtml + '</select></div>'
      + '  <div class="cr-set-card-row"><span>绘图模型</span><div style="display:flex;gap:4px;align-items:center;"><input class="cr-set-input" id="cfgImgModel" value="' + esc(cfg.imgModel || 'gpt-image-1') + '"><button class="cr-fetch-btn" id="btnFetchImgModels" type="button" title="拉取模型"><svg viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 1 1-6.22-8.56"/><path d="M21 3v6h-6"/></svg></button></div></div>'
      + '  <div class="cr-set-chips-wrap" id="cfgStkStylesWrap">' + stkStylesHtml + '</div>'
      + '</div>';
  }

  // ============ 7. 心声解析与气泡渲染 ============
  function parseDossierVoice(text) {
    var raw = (text || '').trim();
    var voiceObj = null;

    var match = raw.match(/\[心声:\s*([^\|\]]+)(?:\|\s*动作:\s*([^\|\]]+))?(?:\|\s*独立心愿:\s*([^\|\]]+))?\]/i);
    if (match) {
      voiceObj = {
        monologue: (match[1] || '').trim(),
        action: (match[2] || '正专心凝望着窗外。').trim(),
        wish: (match[3] || '想去街角的烘焙店买刚出炉的千层酥。').trim()
      };
      raw = raw.replace(match[0], '').trim();
    } else {
      var simpleMatch = raw.match(/[\(（]([^\)）]{2,})[\)）]/);
      if (simpleMatch && simpleMatch[1]) {
        voiceObj = {
          monologue: simpleMatch[1].trim(),
          action: '正看着手机屏幕，眼神温和。',
          wish: '盘算着晚上要听哪一首常听的胶片爵士乐。'
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

    for (var i = 0; i < chatMessages.length; i++) {
      var m = chatMessages[i];
      var isUser = (m.role === 'user' || m.sender === 'user');
      
      var isTimeGap = curGroup && curGroup.msgs.length && (m.ts - curGroup.msgs[curGroup.msgs.length - 1].msg.ts > 180000);
      var needNewGroup = !curGroup || curGroup.isUser !== isUser || m.isSystem || m.isProactiveGroup || isTimeGap;

      if (needNewGroup) {
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
        var content = m.cleanContent || m.content || m.text || '';
        var voiceObj = m.voiceObj || null;

        if (!isUser && !voiceObj) {
          var parsed = parseDossierVoice(content);
          content = parsed.text;
          voiceObj = parsed.voiceObj;
          m.voiceObj = voiceObj;
          m.cleanContent = content;
        }

        var heartHtml = '';
        if (!isUser && voiceObj) {
          heartHtml = '<span class="voice-heart-trigger" data-voice-idx="' + globalIdx + '" title="点击查看当下心声">'
            + '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>'
            + '</span>';
        }

        var quoteHtml = m.quote ? '<div class="wx-msg-quote-bar">' + esc(m.quote) + '</div>' : '';
        var timeHtml = (idx === total - 1) ? '<div class="wx-msg-bottom-timestamp">' + fmtTime(m.ts || Date.now()) + '</div>' : '';

        html += '<div class="wx-msg-bubble-item" data-bubble-idx="' + globalIdx + '">'
          + quoteHtml
          + esc(content)
          + heartHtml
          + '</div>'
          + timeHtml;
      });

      html += '</div></div>';
    });

    body.innerHTML = html;
    body.scrollTop = body.scrollHeight;
  }

  function updateTypingUI(show) {
    var indicator = document.getElementById('wxCrTypingIndicator');
    var charSig = document.getElementById('wxCrCharSig');
    if (indicator && charSig) {
      if (show) {
        indicator.classList.add('show');
        charSig.style.display = 'none';
      } else {
        indicator.classList.remove('show');
        charSig.style.display = 'block';
      }
    }
  }

  // ============ 8. 真实流式 Stream 请求 ============
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

  // ============ 9. 主动发消息定时器调度引擎 ============
  function startProactiveTimer() {
    stopProactiveTimer();
    if (!currentChatChar) return;
    var cfg = getCfg(currentChatChar.id);
    if (!cfg.proactive) return;

    var minVal = Number(cfg.proMinInterval) || 1;
    var maxVal = Number(cfg.proMaxInterval) || 3;
    var minMs = Math.max(minVal * 60 * 1000, 10000);
    var maxMs = Math.max(maxVal * 60 * 1000, minMs + 5000);
    var delay = minMs + Math.random() * (maxMs - minMs);

    _proactiveTimer = setTimeout(function() {
      if (!currentChatChar || isStreaming) {
        startProactiveTimer();
        return;
      }

      if (cfg.proActiveMode === 'custom') {
        var now = new Date();
        var curHhMm = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
        if (curHhMm < (cfg.proActiveStart || '08:00') || curHhMm > (cfg.proActiveEnd || '23:30')) {
          startProactiveTimer();
          return;
        }
      }

      fireProactiveMessage();
      startProactiveTimer();
    }, delay);
  }

  function stopProactiveTimer() {
    if (_proactiveTimer) {
      clearTimeout(_proactiveTimer);
      _proactiveTimer = null;
    }
  }

  function fireProactiveMessage() {
    if (!currentChatChar) return;
    var cfg = getCfg(currentChatChar.id);
    var api = getActiveApi(currentChatChar.id);
    if (!api || !api.url || !api.key) return;

    var charName = currentChatChar.name || '角色';
    var userName = (currentChatUser ? (currentChatUser.name || currentChatUser.nickname) : '') || '对方';
    var callName = (currentChatChar && currentChatChar.callName) ? currentChatChar.callName : userName;

    var prompt = '距离「' + callName + '」上次发来消息已经过去了一段时间。请根据你此刻当下的心境、所在环境以及你与「' + callName + '」的关系，以「' + charName + '」的身份主动向「' + callName + '」发来消息。';

    var apiMsgs = buildApiPayload(currentChatChar, currentChatUser, cfg, chatMessages, true, prompt);
    var url = api.url.replace(/\/+$/, '') + '/chat/completions';
    var params = getParams(currentChatChar.id);

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
        stream: false,
        temperature: params.temperature,
        frequency_penalty: params.freqPenalty,
        presence_penalty: params.presPenalty
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      updateTypingUI(false);
      var content = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) ? d.choices[0].message.content : '';
      if (!content || content.indexOf('[SKIP]') !== -1) return;

      var parts = smartSplitMessages(content);
      var now = Date.now();

      parts.forEach(function(p, idx) {
        chatMessages.push({
          role: 'assistant',
          sender: 'char',
          content: p,
          ts: now + idx * 800,
          isProactiveGroup: (idx === 0)
        });
      });

      saveChatMessages(currentChatChar.id);
      renderMessages();

      if (navigator.vibrate) navigator.vibrate(20);
    })
    .catch(function(err) {
      updateTypingUI(false);
    });
  }

  // ============ 10. 心声翻页与事件绑定 ============
  var currentVoiceList = [];
  var currentVoicePageIdx = 0;

  function updateVoiceCardUI() {
    if (!currentVoiceList.length) return;
    var item = currentVoiceList[currentVoicePageIdx];
    var vo = item.voiceObj;
    var stage = document.getElementById('wxChatRoomStage');
    if (!stage || !vo) return;

    stage.querySelector('#wxCrVoicePageTitle').textContent = (currentChatChar.name || 'CHAR') + ' · 心声档案 (' + (currentVoicePageIdx + 1) + '/' + currentVoiceList.length + ')';
    stage.querySelector('#wxCrVoiceMonologueText').textContent = '“ ' + vo.monologue + ' ”';
    stage.querySelector('#wxCrVoiceActionText').textContent = vo.action || '正安静地看着手机屏幕。';
    stage.querySelector('#wxCrVoiceWishText').textContent = vo.wish || '想去街角的烘焙店买刚出炉的千层酥。';
    stage.querySelector('#wxCrVoiceTimeSub').textContent = 'RECORDED · ' + fmtTime(item.ts || Date.now());

    var prevBtn = stage.querySelector('#wxCrVoicePrevBtn');
    var nextBtn = stage.querySelector('#wxCrVoiceNextBtn');
    if (prevBtn) prevBtn.style.opacity = (currentVoicePageIdx > 0) ? '1' : '0.3';
    if (nextBtn) nextBtn.style.opacity = (currentVoicePageIdx < currentVoiceList.length - 1) ? '1' : '0.3';
  }

  function bindChatEvents(stage) {
    function closeChatRoom() {
      if (abortCtrl) abortCtrl.abort();
      stopProactiveTimer();
      window._chatActiveCharId = null;
      stage.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s';
      stage.style.transform = 'translateX(100%)';
      stage.style.opacity = '0';
      setTimeout(function() { stage.remove(); }, 250);
    }

    var backBtn = stage.querySelector('#wxCrBackBtn');
    backBtn.addEventListener('click', closeChatRoom);

    // ── 直达档案卡片且支持一键返回 ──
    function gotoArchiveCard(side) {
      stage.style.display = 'none';
      if (window.AppNav) {
        window.AppNav.showPage('archive');
        setTimeout(function() {
          var tabBtn = document.getElementById(side === 'char' ? 'tabCharBtn' : 'tabUserBtn');
          if (tabBtn) tabBtn.click();
        }, 60);
      }
    }

    function hookArchiveBack() {
      var archBackBtn = document.getElementById('archShellBackBtn');
      if (archBackBtn && !archBackBtn._hookedChat) {
        archBackBtn._hookedChat = true;
        archBackBtn.addEventListener('click', function(e) {
          if (window._chatActiveCharId && document.getElementById('wxChatRoomStage')) {
            e.stopPropagation();
            if (window.AppNav) window.AppNav.showPage('wechat');
            document.getElementById('wxChatRoomStage').style.display = 'flex';
          }
        }, true);
      }
    }
    hookArchiveBack();

    stage.addEventListener('click', function(e) {
      var avt = e.target.closest('[data-avatar-side]');
      if (avt) {
        gotoArchiveCard(avt.dataset.avatarSide);
      }
    });

    // 左上角头像点击 -> 弹出【心声卡片】并支持左右滑动翻页
    var charHeadBtn = stage.querySelector('#wxCrCharHeadBtn');
    var voiceModalWrap = stage.querySelector('#wxCrVoiceModalWrap');
    var closeVoiceBtn = stage.querySelector('#wxCrCloseVoiceBtn');
    var prevVoiceBtn = stage.querySelector('#wxCrVoicePrevBtn');
    var nextVoiceBtn = stage.querySelector('#wxCrVoiceNextBtn');

    if (charHeadBtn) {
      charHeadBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        currentVoiceList = chatMessages.filter(function(m) { return m.voiceObj; });
        if (!currentVoiceList.length) {
          if (window.AppNav) window.AppNav.showToast('✦ 还没有记录下他的心声碎片哦 ✦');
          return;
        }
        currentVoicePageIdx = currentVoiceList.length - 1;
        updateVoiceCardUI();
        voiceModalWrap.classList.add('show');
      });
    }

    if (prevVoiceBtn) {
      prevVoiceBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (currentVoicePageIdx > 0) {
          currentVoicePageIdx--;
          updateVoiceCardUI();
        }
      });
    }

    if (nextVoiceBtn) {
      nextVoiceBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (currentVoicePageIdx < currentVoiceList.length - 1) {
          currentVoicePageIdx++;
          updateVoiceCardUI();
        }
      });
    }

    // 单次爱心点击
    stage.addEventListener('click', function(e) {
      var heart = e.target.closest('[data-voice-idx]');
      if (heart) {
        e.stopPropagation();
        var idx = parseInt(heart.dataset.voiceIdx, 10);
        var targetMsg = chatMessages[idx];
        if (!targetMsg || !targetMsg.voiceObj) return;

        currentVoiceList = chatMessages.filter(function(m) { return m.voiceObj; });
        currentVoicePageIdx = currentVoiceList.indexOf(targetMsg);
        if (currentVoicePageIdx === -1) currentVoicePageIdx = 0;

        updateVoiceCardUI();
        voiceModalWrap.classList.add('show');
      }
    });

    if (closeVoiceBtn) closeVoiceBtn.addEventListener('click', function() { voiceModalWrap.classList.remove('show'); });
    if (voiceModalWrap) {
      voiceModalWrap.addEventListener('click', function(e) {
        if (e.target === voiceModalWrap) voiceModalWrap.classList.remove('show');
      });
    }

    // 右滑返回手势
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

    // 向上弹出托盘
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

    // 设置卡片
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

    // 绑定设置同步
    var cfg = getCfg(currentChatChar.id);

    function syncSettingFields() {
      var gv = function(id) { var el = stage.querySelector('#' + id); return el ? el.value : ''; };
      cfg.sceneText = gv('cfgSceneText') || '';
      
      var histEl = stage.querySelector('#cfgHistoryLimit');
      if (histEl) {
        cfg.historyLimit = parseInt(histEl.value, 10);
        var txtHist = stage.querySelector('#txtHistoryLimit');
        if (txtHist) txtHist.textContent = (cfg.historyLimit <= 0) ? '不限历史' : (cfg.historyLimit + ' 条');
      }

      cfg.innerVoice = stage.querySelector('#swInnerVoice') ? stage.querySelector('#swInnerVoice').classList.contains('on') : true;
      var rdoVoice = stage.querySelector('input[name="rdoVoiceLevelMode"]:checked');
      cfg.voiceLevelMode = rdoVoice ? rdoVoice.value : 'normal';

      cfg.proactive = stage.querySelector('#swProactive') ? stage.querySelector('#swProactive').classList.contains('on') : false;
      cfg.proMinInterval = parseInt(gv('cfgProMin'), 10) || 15;
      cfg.proMaxInterval = parseInt(gv('cfgProMax'), 10) || 120;

      var rdoActive = stage.querySelector('input[name="rdoActiveMode"]:checked');
      cfg.proActiveMode = rdoActive ? rdoActive.value : 'allday';
      cfg.proActiveStart = gv('cfgProStart') || '08:00';
      cfg.proActiveEnd = gv('cfgProEnd') || '23:30';

      var rdoLevel = stage.querySelector('input[name="rdoLevelMode"]:checked');
      cfg.proLevelMode = rdoLevel ? rdoLevel.value : 'manual';
      cfg.proLevel = parseInt(gv('cfgProLevel'), 10) || 3;

      cfg.minMsgs = parseInt(gv('cfgMinMsgs'), 10) || 1;
      cfg.maxMsgs = parseInt(gv('cfgMaxMsgs'), 10) || 3;
      cfg.replySpeed = gv('cfgReplySpeed') || '正常（2-4秒）';

      var tempEl = stage.querySelector('#cfgTemp');
      if (tempEl) { cfg.temperature = parseFloat(tempEl.value) || 0.85; var tT = stage.querySelector('#txtTemp'); if (tT) tT.textContent = cfg.temperature; }
      var freqEl = stage.querySelector('#cfgFreq');
      if (freqEl) { cfg.freqPenalty = parseFloat(freqEl.value) || 0.3; var tF = stage.querySelector('#txtFreq'); if (tF) tF.textContent = cfg.freqPenalty; }
      var presEl = stage.querySelector('#cfgPres');
      if (presEl) { cfg.presPenalty = parseFloat(presEl.value) || 0.3; var tP = stage.querySelector('#txtPres'); if (tP) tP.textContent = cfg.presPenalty; }

      cfg.apiMode = stage.querySelector('#swIndividualApi') && stage.querySelector('#swIndividualApi').classList.contains('on') ? 'individual' : 'global';
      cfg.apiSelect = gv('cfgApiSelect') || '';
      cfg.timeWeather = stage.querySelector('#swTimeWeather') ? stage.querySelector('#swTimeWeather').classList.contains('on') : true;
      cfg.charRealCity = gv('cfgCharRealCity') || '';
      cfg.charCity = gv('cfgCharCity') || '';
      cfg.stickerGen = stage.querySelector('#swStickerGen') ? stage.querySelector('#swStickerGen').classList.contains('on') : false;
      cfg.imgApiSelect = gv('cfgImgApiSelect') || '';
      cfg.imgModel = gv('cfgImgModel') || 'gpt-image-1';

      var checkedStyles = [];
      stage.querySelectorAll('#cfgStkStylesWrap input:checked').forEach(function(cb) { checkedStyles.push(cb.dataset.stkStyle); });
      cfg.stickerStyles = checkedStyles.length ? checkedStyles : ['可爱卡通'];

      saveCfg(currentChatChar.id, cfg);
      if (cfg.proactive) {
        startProactiveTimer();
      } else {
        stopProactiveTimer();
      }
    }

    stage.querySelectorAll('.wx-switch').forEach(function(sw) {
      sw.addEventListener('click', function() {
        this.classList.toggle('on');
        if (this.id === 'swIndividualApi') {
          var rowSel = stage.querySelector('#rowApiSelect');
          if (rowSel) rowSel.style.display = this.classList.contains('on') ? 'flex' : 'none';
        }
        if (this.id === 'swInnerVoice') {
          var rowVoice = stage.querySelector('#rowVoiceLevel');
          if (rowVoice) rowVoice.style.display = this.classList.contains('on') ? 'flex' : 'none';
        }
        syncSettingFields();
      });
    });

    stage.querySelectorAll('input[name="rdoActiveMode"]').forEach(function(r) {
      r.addEventListener('change', function() {
        var rowCustom = stage.querySelector('#rowCustomTime');
        if (rowCustom) rowCustom.style.display = (this.value === 'custom') ? 'flex' : 'none';
        syncSettingFields();
      });
    });

    stage.querySelectorAll('input[name="rdoLevelMode"]').forEach(function(r) {
      r.addEventListener('change', function() {
        var rowLevel = stage.querySelector('#rowManualLevel');
        if (rowLevel) rowLevel.style.display = (this.value === 'manual') ? 'flex' : 'none';
        syncSettingFields();
      });
    });

    stage.querySelectorAll('input[name="rdoVoiceLevelMode"]').forEach(function(r) {
      r.addEventListener('change', syncSettingFields);
    });

    stage.querySelectorAll('.cr-set-select, .cr-set-input, .cr-set-num-input, .cr-set-time-input, .cr-range-slider-full, .cr-set-textarea, #cfgStkStylesWrap input').forEach(function(inp) {
      inp.addEventListener('input', syncSettingFields);
      inp.addEventListener('change', syncSettingFields);
      inp.addEventListener('blur', syncSettingFields);
    });

    // 场景扩大编辑
    var btnExpScene = stage.querySelector('#btnExpandScene');
    if (btnExpScene) {
      btnExpScene.addEventListener('click', function() {
        var ta = stage.querySelector('#cfgSceneText');
        var oldVal = ta ? ta.value : '';
        var newVal = prompt('当前场景（背景补充）深度编辑：', oldVal);
        if (newVal !== null) {
          if (ta) ta.value = newVal;
          syncSettingFields();
        }
      });
    }

    // 真实天气抓取按钮
    var fetchWeatherBtn = stage.querySelector('#btnFetchWeather');
    if (fetchWeatherBtn) {
      fetchWeatherBtn.addEventListener('click', function() {
        var city = (stage.querySelector('#cfgCharRealCity').value || '').trim();
        if (!city) {
          if (window.AppNav) window.AppNav.showToast('请先输入真实城市名称');
          return;
        }
        if (window.AppNav) window.AppNav.showToast('正在抓取城市天气...');
        fetchCharWeather(city, function(w) {
          if (w) {
            if (window.AppNav) window.AppNav.showToast('抓取成功: ' + city + ' ' + w.desc + ' ' + w.temp + '°C');
          } else {
            if (window.AppNav) window.AppNav.showToast('未能抓取到天气，请检查城市英文名拼写');
          }
        });
      });
    }

    // 生图模型拉取按钮
    var fetchImgBtn = stage.querySelector('#btnFetchImgModels');
    if (fetchImgBtn) {
      fetchImgBtn.addEventListener('click', function() {
        var selApiName = (stage.querySelector('#cfgImgApiSelect') || {}).value;
        var api = null;
        var list = [];
        try { list = JSON.parse(localStorage.getItem('api_configs') || '[]'); } catch(e){}
        if (selApiName) {
          api = list.find(function(a){ return a.name === selApiName; });
        } else {
          api = getActiveApi(currentChatChar.id);
        }

        if (!api || !api.url || !api.key) {
          if (window.AppNav) window.AppNav.showToast('请先配置好对应的 API');
          return;
        }

        if (window.AppNav) window.AppNav.showToast('正在拉取绘图模型...');
        fetch(api.url.replace(/\/+$/, '') + '/models', {
          headers: { 'Authorization': 'Bearer ' + api.key }
        })
        .then(function(r){ return r.json(); })
        .then(function(d){
          var raw = d.data || d;
          var models = [];
          if (Array.isArray(raw)) {
            raw.forEach(function(m){ var id = m.id || m.name; if (id) models.push(id); });
          }
          if (models.length) {
            var pick = prompt('请选择或输入绘图模型：\n' + models.slice(0, 15).join('\n'), models[0]);
            if (pick) {
              stage.querySelector('#cfgImgModel').value = pick.trim();
              syncSettingFields();
            }
          } else {
            if (window.AppNav) window.AppNav.showToast('未拉取到模型列表');
          }
        })
        .catch(function(err){
          if (window.AppNav) window.AppNav.showToast('拉取失败: ' + err.message);
        });
      });
    }

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
      }, 3500);
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

      var replySpeed = cfg.replySpeed || '正常（2-4秒）';
      var delayMs = 2500;
      if (replySpeed === '快速（1-2秒）') delayMs = 1200;
      else if (replySpeed === '慢速（4-7秒）') delayMs = 5000;

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

    // ── 长按消息两行黑色悬浮菜单 ──
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
        var targetMsg = chatMessages[idx];
        if (!targetMsg) return;

        var isUser = (targetMsg.role === 'user' || targetMsg.sender === 'user');

        var row1 = '<div class="cr-ctx-menu-row">'
          + '<div class="cr-ctx-item" data-ctx-act="quote"><svg viewBox="0 0 24 24"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg><span>引用</span></div>'
          + '<div class="cr-ctx-item" data-ctx-act="copy"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>复制</span></div>'
          + '<div class="cr-ctx-item" data-ctx-act="edit"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg><span>编辑</span></div>';

        if (!isUser) {
          row1 += '<div class="cr-ctx-item" data-ctx-act="fav"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><span>收藏</span></div>'
            + '<div class="cr-ctx-item" data-ctx-act="share"><svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/><line x1="10" y1="14" x2="21" y2="3"/></svg><span>转发</span></div>';
        }
        row1 += '</div>';

        var row2 = '<div class="cr-ctx-menu-row">'
          + '<div class="cr-ctx-item" data-ctx-act="resend"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg><span>' + (isUser ? '重发' : '重现') + '</span></div>'
          + '<div class="cr-ctx-item" data-ctx-act="del"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg><span>删除</span></div>'
          + '<div class="cr-ctx-item" data-ctx-act="delFromHere"><svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/><polyline points="8 21 12 17 16 21"/></svg><span>后面全删</span></div>'
          + '</div>';

        if (ctxMenu) {
          ctxMenu.innerHTML = row1 + row2;
          bindCtxItemClicks();

          var rect = bubble.getBoundingClientRect();
          var top = Math.max(70, rect.top);
          var left = Math.min(window.innerWidth - 130, Math.max(130, rect.left + rect.width / 2));

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

    function bindCtxItemClicks() {
      if (!ctxMenu) return;
      ctxMenu.querySelectorAll('[data-ctx-act]').forEach(function(item) {
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
          } else if (act === 'edit') {
            var oldText = targetMsg.cleanContent || targetMsg.content || targetMsg.text || '';
            var newText = prompt('编辑这条消息：', oldText);
            if (newText !== null && newText.trim()) {
              targetMsg.content = newText.trim();
              targetMsg.cleanContent = newText.trim();
              saveChatMessages(currentChatChar.id);
              renderMessages();
            }
          } else if (act === 'fav') {
            if (window.AppNav) window.AppNav.showToast('✦ 已加入我的微信收藏 ✦');
          } else if (act === 'share') {
            if (window.AppNav) window.AppNav.showToast('✦ 消息转发功能已就绪 ✦');
          } else if (act === 'del') {
            chatMessages.splice(currentCtxIdx, 1);
            saveChatMessages(currentChatChar.id);
            renderMessages();
          } else if (act === 'delFromHere') {
            // 8. 彻底修复：保留本条，精确将本条之后产生的所有记录全部删除！
            if (confirm('确定删除此条消息之后的所有记录吗？')) {
              chatMessages.splice(currentCtxIdx + 1);
              saveChatMessages(currentChatChar.id);
              renderMessages();
              if (window.AppNav) window.AppNav.showToast('已删除此条之后的所有消息');
            }
          } else if (act === 'resend') {
            if (targetMsg.role === 'user' || targetMsg.sender === 'user') {
              var userText = targetMsg.cleanContent || targetMsg.content || targetMsg.text;
              chatMessages.splice(currentCtxIdx);
              chatMessages.push({
                role: 'user',
                sender: 'user',
                content: userText,
                ts: Date.now()
              });
            } else {
              var startIdx = currentCtxIdx;
              while (startIdx > 0 && (chatMessages[startIdx - 1].role === 'assistant' || chatMessages[startIdx - 1].sender === 'char')) {
                startIdx--;
              }
              chatMessages.splice(startIdx);
            }
            saveChatMessages(currentChatChar.id);
            renderMessages();
            requestAIStream();
          }
        });
      });
    }

    // 托盘功能
    stage.querySelectorAll('[data-tray-act]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var act = this.dataset.trayAct;
        upwardTray.classList.remove('show');
        plusBtn.classList.remove('open');

        if (act === 'location' || act === 'redpack' || act === 'transfer') {
          if (window.AppNav) window.AppNav.showToast('✦ 该功能正在精心准备中 ✦');
        } else {
          if (window.AppNav) window.AppNav.showToast('✦ 该功能已连接专属角色 ✦');
        }
      });
    });
  }

  // ============ 11. 本地存储与读取 ============
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
