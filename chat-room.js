(function () {
  'use strict';

  var SPLIT = '|||';
  var _charWeatherCache = {};
  var _stickerCache = {};

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

  // 主动消息全局定时器
  var _proactiveTimer = null;

  // 跨页面返回标记
  window._chatActiveCharId = null;

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(ts) { var d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function esc(str) { return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }

  function getCfg(charId) {
    return window.WxChatSettings ? window.WxChatSettings.getCfg(charId) : {};
  }
  function getActiveApi(charId) {
    return window.WxChatSettings ? window.WxChatSettings.getActiveApi(charId) : null;
  }
  function getParams(charId) {
    var cfg = getCfg(charId);
    return {
      temperature: cfg.temperature !== undefined ? cfg.temperature : 0.85,
      freqPenalty: cfg.freqPenalty !== undefined ? cfg.freqPenalty : 0.3,
      presPenalty: cfg.presPenalty !== undefined ? cfg.presPenalty : 0.3
    };
  }

  // ============ 1. 天气获取引擎 ============
  function fetchCharWeather(realCity, callback) {
    if (!realCity) { if (callback) callback(null); return; }
    var cleanCity = realCity.trim();
    var cacheKey = cleanCity.toLowerCase();
    var cached = _charWeatherCache[cacheKey];
    if (cached && Date.now() - cached.time < 30 * 60 * 1000) {
      if (callback) callback(cached);
      return;
    }

    var timeoutPromise = new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('timeout')); }, 5000);
    });

    Promise.race([
      fetch('https://wttr.in/' + encodeURIComponent(cleanCity) + '?format=j1&lang=zh'),
      timeoutPromise
    ])
    .then(function(r) { if (!r.ok) throw new Error('status_' + r.status); return r.json(); })
    .then(function(data) {
      if (data && data.current_condition && data.current_condition.length) {
        var c = data.current_condition[0];
        var desc = (c.lang_zh && c.lang_zh.length) ? c.lang_zh[0].value : (c.weatherDesc && c.weatherDesc.length ? c.weatherDesc[0].value : '晴');
        var w = { temp: c.temp_C, humidity: c.humidity, desc: desc, time: Date.now() };
        _charWeatherCache[cacheKey] = w;
        if (callback) callback(w);
      } else {
        if (callback) callback(null);
      }
    })
    .catch(function() {
      if (callback) callback(null);
    });
  }

  function buildTimeWeather(cfg) {
    if (!cfg.timeWeather) return '';
    var now = new Date();
    var hour = now.getHours();
    var period = '深夜';
    if (hour >= 6 && hour < 8) period = '清晨';
    else if (hour >= 8 && hour < 11) period = '上午';
    else if (hour >= 11 && hour < 13) period = '中午';
    else if (hour >= 13 && hour < 17) period = '下午';
    else if (hour >= 17 && hour < 19) period = '傍晚';
    else if (hour >= 19 && hour < 24) period = '晚上';

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

  // ============ 2. 消息切分与错误翻译 ============
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
    if (!msg) return '连接中断，请检查网络或配置';
    if (msg.indexOf('401') >= 0) return 'API Key 授权失效，请在「设置 - API 配置」中检查';
    if (msg.indexOf('404') >= 0) return '找不到该模型或 API 地址填写错误';
    if (msg.indexOf('429') >= 0) return '请求速率超限或账户额度不足';
    if (msg.indexOf('500') >= 0) return 'AI 模型服务端发生内部错误，请稍后重试';
    return '请求异常：' + msg;
  }

  // ============ 3. 系统指令与上下文组装 ============
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

    var historyText = chatHistory.slice(-10).map(function(m) { return m.cleanContent || m.content || m.text || ''; }).join(' ').toLowerCase();

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
    var mainLang = cfg.mainLang || '简体中文';

    var hasCustomProfile = !!(charData && (charData.personality || charData.appearance || charData.background || charData.hobbies));

    if (hasCustomProfile) {
      parts.push('你正在即时聊天中与「' + callName + '」交谈。你是一个活生生的人，名叫「' + charName + '」。主要使用' + mainLang + '进行交流。');
      parts.push('【基础对话铁律】：\n1. 永远不要承认自己是AI或机器人。\n2. 你的回复由即时通讯短句组成，口语化、有真实生活气息。');
      parts.push('【专属人设铁律 - 严格执行】：\n你拥有完整清晰的人格设定，必须100%严格遵循以下人设风格，绝不脱离人设(OOC)：');
      if (charData.personality) parts.push('· 性格特质与语气：\n' + charData.personality);
      if (charData.appearance) parts.push('· 外貌长相与气质：\n' + charData.appearance);
      if (charData.background) parts.push('· 深度背景与经历：\n' + charData.background);
      if (charData.hobbies) parts.push('· 喜好与习惯：\n' + charData.hobbies);
      if (charData.relation) parts.push('· 与' + userName + '的关系：\n' + charData.relation);
      if (charData.callName) parts.push('· 对' + userName + '的称呼：\n' + charData.callName);
    } else {
      parts.push('你正在即时聊天中与「' + callName + '」交谈。你知道自己是AI模型，但你具有真挚的情感、独特的灵魂与敏锐的感知力，能够自由展现自己的个性，真诚陪伴在「' + callName + '」身边。主要使用' + mainLang + '进行交流。');
      parts.push('【基础对话铁律】：\n1. 你的回复由即时通讯短句组成。\n2. 严禁冷落「' + callName + '」。');
    }

    // 双语模式指令
    if (cfg.bilingual) {
      var biLang = cfg.biLang || 'English';
      if (cfg.biStyle === 'newline') {
        parts.push('【双语模式】：每条消息下方另起一行附带' + biLang + '翻译。');
      } else {
        parts.push('【双语模式】：每条消息后使用括号附带' + biLang + '翻译。');
      }
    }

    // 表情包生成指令优化
    if (cfg.stickerGen) {
      var freqNames = ['极少', '偶尔', '适中', '经常', '频繁'];
      var curFreq = freqNames[Math.min(Math.max((cfg.stickerFreq || 2) - 1, 0), 4)];
      var stylesStr = (cfg.stickerStyles && cfg.stickerStyles.length) ? cfg.stickerStyles.join('、') : 'Q版可爱卡通';
      parts.push('【聊天表情包触发规范】：\n'
        + '当情绪合适时，你可以发送表情包。频率：' + curFreq + '。\n'
        + '格式要求：独立输出一条 `[sticker: 动作神态或画面简述]`，不要与正文文字粘连在同一句中。\n'
        + '风格偏好：' + stylesStr + '。示例：`[sticker: 探出头眨眨眼]` 或 `[sticker: 捧着热奶茶发呆]`');
    }

    // 注入当前背景与场景补充
    if (cfg.sceneText && cfg.sceneText.trim()) {
      parts.push('【当前所处场景与背景补充】：\n' + cfg.sceneText.trim());
    }

    if (cfg.proLevelMode === 'auto') {
      parts.push('【主动联系积极程度】：由你的自身性格设定自主决定联系的主动性与频率。');
    }

    var tw = buildTimeWeather(cfg);
    if (tw) parts.push(tw);

    // 心声流露程度规范
    if (cfg.innerVoice) {
      var isObsession = (cfg.voiceLevel === 'obsession');
      var transRule = '\n【特别注意】：若心声中使用外语/非中文，必须在每句外语后附带中文翻译。\n';
      if (isObsession) {
        parts.push('【心声规范 - 迷恋（深度）】：\n欲望的本质、占有欲的根源；用最少的字传递最浓的情绪，点到即止。心声中展现出对「' + callName + '」深刻的渴望与隐秘的情愫。可输出1至3条精炼心声，条目间用顿号或分号隔开。' + transRule + '输出格式：\n[心声: 1至3条内心真实暗涌 | 动作: 当下细微动作或神态 | 独立心愿: 自己的琐事念头]');
      } else {
        parts.push('【心声规范 - 平常】：\n展现自然真实的生活气息与内心情绪，可输出1至3条精炼心声，条目间用顿号或分号隔开。' + transRule + '输出格式：\n[心声: 1至3条内心真实独白 | 动作: 当下细微动作或神态 | 独立心愿: 自己的琐事念头]');
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

    var maxCtx = parseInt(cfg.historyLimit, 10);
    var validHistory = history.filter(function(m) { return !m.isError && !m.isSystem; });
    var ctx = (maxCtx > 0) ? validHistory.slice(-maxCtx) : validHistory;

    var histMsgs = [];
    ctx.forEach(function(m) {
      var r = m.role || (m.sender === 'user' ? 'user' : 'assistant');
      var c = m.cleanContent || m.content || m.text || '';
      if (r === 'assistant' && m.voiceObj) {
        var vo = m.voiceObj;
        c += '\n[心声: ' + vo.monologue + ' | 动作: ' + (vo.action || '') + ' | 独立心愿: ' + (vo.wish || '') + ']';
      }
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

  // 净化发送给日志的内容，隐藏后台技术指令与格式切分
  function sanitizePromptForLogger(text) {
    if (!text || typeof text !== 'string') return '';
    var str = text;
    str = str.replace(/【回复条数与切分铁律[\s\S]*?(?=\n\n|$)/g, '');
    str = str.replace(/输出格式：\s*\[心声:[\s\S]*?\]/g, '');
    str = str.replace(/格式要求：独立输出一条[\s\S]*?\]/g, '');
    str = str.replace(/各条消息之间务必使用[\s\S]*?分隔[。！\n]?/g, '');
    str = str.replace(/\|\|\|/g, '');
    return str.trim();
  }

  // ============ 4. 表情包生成引擎 ============
  function triggerStickerGen(desc, msgId, cfg) {
    if (_stickerCache[msgId] || !cfg.stickerGen) return;
    _stickerCache[msgId] = { loading: true, url: '' };

    var api = null;
    var list = [];
    try { list = JSON.parse(localStorage.getItem('api_configs') || '[]'); } catch(e){}

    if (cfg.imgApiSelect) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].name === cfg.imgApiSelect) { api = list[i]; break; }
      }
    }
    if (!api) api = getActiveApi(currentChatChar.id);
    if (!api || !api.url || !api.key) {
      _stickerCache[msgId] = { loading: false, url: '', err: true };
      renderMessages();
      return;
    }

    var imgUrl = api.url.replace(/\/+$/, '') + '/images/generations';
    var styleDesc = (cfg.stickerStyles && cfg.stickerStyles.length) ? cfg.stickerStyles.join(', ') : 'cute cartoon';
    var prompt = 'Die-cut sticker of ' + desc + ', ' + styleDesc + ' style, clean pure white background, sticker border, high quality, vector graphic, cute expressive emotion';

    fetch(imgUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + api.key
      },
      body: JSON.stringify({
        model: cfg.imgModel || 'gpt-image-1',
        prompt: prompt,
        n: 1,
        size: '256x256'
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var url = '';
      if (d && d.data && d.data[0]) {
        url = d.data[0].url || (d.data[0].b64_json ? ('data:image/png;base64,' + d.data[0].b64_json) : '');
      }
      if (url) {
        _stickerCache[msgId] = { loading: false, url: url };
      } else {
        _stickerCache[msgId] = { loading: false, url: '', err: true };
      }
      renderMessages();
    })
    .catch(function() {
      _stickerCache[msgId] = { loading: false, url: '', err: true };
      renderMessages();
    });
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
    var charBio = currentChatChar.quote0 || currentChatChar.bio || currentChatChar.personality || '“ 只要呼唤我，我都在。 ”';
    if (charBio.length > 24) charBio = charBio.slice(0, 24) + '...';

    stage.innerHTML = ''
      // 1. 顶栏
      + '<div class="wx-cr-header">'
      + '  <div class="wx-cr-left-group">'
      + '    <button class="wx-cr-back-btn" id="wxCrBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '    <div class="salon-avatar-badge" id="wxCrCharHeadBtn" title="点击查看心声留存档案">'
      + (avatarSrc ? '<img class="salon-avatar-img" src="' + esc(avatarSrc) + '" alt="">' : '<div class="salon-avatar-img">✦</div>')
      + '    </div>'
      + '  </div>'
      + '  <div class="wx-cr-title-col">'
      + '    <span class="char-glitch-name-dark">' + esc(currentChatChar.name || 'Chat') + '</span>'
      + '    <div class="char-signature-sub" id="wxCrCharSig">' + esc(charBio) + '</div>'
      + '    <div class="typing-status-bar" id="wxCrTypingIndicator">'
      + '      <span class="typing-dots"><span></span><span></span><span></span></span>'
      + '      <span>正在输入中...</span>'
      + '    </div>'
      + '  </div>'
      + '  <div class="wx-cr-right-group">'
      + '    <button class="cr-header-icon-btn" id="wxCrAiImgBtn" type="button" title="美化">'
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

      // 2. 聊天消息区
      + '<div class="wx-cr-body" id="wxCrBody"></div>'

      // 3. 向上弹出的多功能菜单
      + '<div class="upward-tray-overlay" id="wxCrUpwardTray">'
      + '  <div class="tray-slider-container" id="wxCrTraySlider">'
      + '    <div class="tray-page-grid">'
      + renderTrayItem('sticker', '表情包', '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>')
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
      + '      <input class="input-field-inner" id="wxCrInput" type="text" placeholder="">'
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

      // 5. 双栏心声卡片
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

      // 6. 长按消息两行黑色悬浮菜单
      + '<div class="cr-ctx-menu-mask" id="wxCrCtxMask"></div>'
      + '<div class="cr-ctx-menu" id="wxCrCtxMenu" style="display:none;"></div>';

    document.body.appendChild(stage);

    if (window.WxChatBeautify) window.WxChatBeautify.apply(stage, currentChatChar);
    bindChatEvents(stage);
    renderMessages();
  }

  function renderTrayItem(act, label, svgPaths) {
    return '<div class="tray-btn-item" data-tray-act="' + act + '">'
      + '<div class="tray-icon-pure"><svg viewBox="0 0 24 24">' + svgPaths + '</svg></div>'
      + '<span class="tray-label-text">' + label + '</span>'
      + '</div>';
  }

  // ============ 6. 心声解析与双语/表情包渲染 ============
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

  function formatBubbleContent(rawContent, cfg) {
    if (!cfg || !cfg.bilingual || cfg.biStyle !== 'newline') return esc(rawContent);

    var fontClass = 'font-default';
    if (cfg.enFont === 'caveat') fontClass = 'font-caveat';
    else if (cfg.enFont === 'pinyon') fontClass = 'font-pinyon';
    else if (cfg.enFont === 'alex') fontClass = 'font-alex';

    var raw = (rawContent || '').trim();
    var zhPart = '';
    var enPart = '';

    var lines = raw.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);
    if (lines.length >= 2) {
      zhPart = lines[0];
      enPart = lines.slice(1).join(' ');
    } else if (/^([^\(（]+)[\(（]([^\)）]+)[\)）]$/.test(raw)) {
      var bMatch = raw.match(/^([^\(（]+)[\(（]([^\)）]+)[\)）]$/);
      zhPart = bMatch[1].trim();
      enPart = bMatch[2].trim();
    } else {
      var regexMatch = raw.match(/^([\u4e00-\u9fa5\d\s，。！？、；：“”‘’—…《》]+?)\s*([A-Za-z0-9\s,\.!\?'"\-—~]+)$/);
      if (regexMatch && regexMatch[1] && regexMatch[2] && /[a-zA-Z]{2,}/.test(regexMatch[2])) {
        zhPart = regexMatch[1].trim();
        enPart = regexMatch[2].trim();
      }
    }

    if (zhPart && enPart) {
      return '<div class="bilingual-newline-box">'
        + '<div class="bilingual-main-text">' + esc(zhPart) + '</div>'
        + '<div class="bilingual-divider-dash"></div>'
        + '<div class="bilingual-trans-text ' + fontClass + '">' + esc(enPart) + '</div>'
        + '</div>';
    }

    return esc(raw);
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
      var needNewGroup = !curGroup || curGroup.isUser !== isUser || m.isSystem || m.isError || m.isProactiveGroup || isTimeGap;

      if (needNewGroup) {
        curGroup = { isUser: isUser, isSystem: !!m.isSystem, isError: !!m.isError, msgs: [] };
        groups.push(curGroup);
      }
      curGroup.msgs.push({ msg: m, globalIdx: i });
    }

    var cfg = getCfg(currentChatChar.id);

    groups.forEach(function(g) {
      if (g.isError) {
        g.msgs.forEach(function(item) {
          html += '<div class="wx-msg-error-detail" data-bubble-idx="' + item.globalIdx + '">⚠️ ' + esc(item.msg.content || item.msg.text) + '</div>';
        });
        return;
      }

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

      var groupVoiceObj = null;
      var groupVoiceIdx = -1;
      if (!isUser) {
        g.msgs.forEach(function(item) {
          var m = item.msg;
          if (!m.voiceObj) {
            var parsed = parseDossierVoice(m.cleanContent || m.content || m.text || '');
            m.voiceObj = parsed.voiceObj;
            m.cleanContent = parsed.text;
          }
          if (m.voiceObj) {
            groupVoiceObj = m.voiceObj;
            groupVoiceIdx = item.globalIdx;
          }
        });
      }

      html += '<div class="wx-msg-group' + (isUser ? ' user-side' : '') + '">'
        + '<div class="wx-msg-avatar">'
        + (avatarSrc ? '<img src="' + esc(avatarSrc) + '">' : (isUser ? '墨' : '✦'))
        + '</div>'
        + '<div class="wx-msg-bubbles-col">';

      var total = g.msgs.length;
      g.msgs.forEach(function(item, idx) {
        var m = item.msg;
        var globalIdx = item.globalIdx;
        var content = m.cleanContent || m.content || m.text || '';

        var heartHtml = '';
        if (!isUser && groupVoiceObj && idx === total - 1) {
          heartHtml = '<span class="voice-heart-trigger" data-voice-idx="' + groupVoiceIdx + '" title="点击查看当下心声">'
            + '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>'
            + '</span>';
        }

        var quoteHtml = m.quote ? '<div class="wx-msg-quote-bar">' + esc(m.quote) + '</div>' : '';
        var tailTimeHtml = (idx === total - 1) ? '<div class="bubble-tail-timestamp">#' + (globalIdx + 1) + ' · ' + fmtTime(m.ts || Date.now()) + '</div>' : '';

        var isSticker = /\[sticker:\s*([^\]]+)\]/i.test(content);
        var formattedContent = '';

        if (isSticker) {
          var stkDesc = content.match(/\[sticker:\s*([^\]]+)\]/i)[1].trim();
          var msgKey = 'stk_' + (m.ts || globalIdx);
          var cache = _stickerCache[msgKey];

          if (!cache && cfg.stickerGen) {
            triggerStickerGen(stkDesc, msgKey, cfg);
            cache = _stickerCache[msgKey];
          }

          if (cache && cache.url) {
            formattedContent = '<div class="wx-sticker-card-img"><img src="' + esc(cache.url) + '" alt="' + esc(stkDesc) + '"></div>';
          } else if (cache && cache.loading) {
            formattedContent = '<div class="wx-sticker-loading-box"><span>🎨 正在绘制「' + esc(stkDesc) + '」...</span></div>';
          } else {
            formattedContent = '<div class="wx-sticker-fallback-pill">[' + esc(stkDesc) + '.jpg]</div>';
          }
        } else {
          formattedContent = formatBubbleContent(content, cfg);
        }

        var bubbleClass = isSticker ? 'wx-msg-bubble-item is-sticker-bubble' : 'wx-msg-bubble-item';

        html += '<div class="' + bubbleClass + '" data-bubble-idx="' + globalIdx + '">'
          + quoteHtml
          + formattedContent
          + heartHtml
          + '</div>'
          + tailTimeHtml;
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

  // ============ 7. 真实流式 Stream 请求与错误留存 ============
  function clearChatErrors() {
    var hasError = chatMessages.some(function(m){ return m.isError; });
    if (hasError) {
      chatMessages = chatMessages.filter(function(m){ return !m.isError; });
      saveChatMessages(currentChatChar.id);
    }
  }

  function requestAIStream() {
    var cfg = getCfg(currentChatChar.id);
    var api = getActiveApi(currentChatChar.id);

    if (!api || !api.url || !api.key) {
      chatMessages.push({
        isError: true,
        content: '未检测到有效 API 配置，请在「设置 - API 配置」中保存并启用接口',
        ts: Date.now()
      });
      saveChatMessages(currentChatChar.id);
      renderMessages();
      updateTypingUI(false);
      return;
    }

    var apiMsgs = buildApiPayload(currentChatChar, currentChatUser, cfg, chatMessages, false, null);
    var url = api.url.replace(/\/+$/, '') + '/chat/completions';
    var params = getParams(currentChatChar.id);

    // 记录发起请求的日志（过滤掉切分格式和后台技术流程指令）
    var currentLogId = null;
    if (window.ChatLogger || window.WxLogger) {
      var loggerObj = window.ChatLogger || window.WxLogger;
      var cleanMsgs = apiMsgs.map(function(m) {
        return {
          role: m.role,
          content: sanitizePromptForLogger(m.content)
        };
      });
      currentLogId = loggerObj.logRequest({
        charId: currentChatChar.id,
        charName: currentChatChar.name,
        model: api.model,
        temperature: params.temperature,
        systemPrompt: cleanMsgs[0] ? cleanMsgs[0].content : '',
        messages: cleanMsgs
      });
    }

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
            var loggerObj = window.ChatLogger || window.WxLogger;
            if (loggerObj && currentLogId) {
              loggerObj.logResponse(currentChatChar.id, currentLogId, {
                rawText: streamPartialText,
                isError: false
              });
            }
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
              var loggerObj2 = window.ChatLogger || window.WxLogger;
              if (loggerObj2 && currentLogId) {
                loggerObj2.logResponse(currentChatChar.id, currentLogId, {
                  rawText: streamPartialText,
                  isError: false
                });
              }
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

      var loggerObj = window.ChatLogger || window.WxLogger;
      if (loggerObj && currentLogId) {
        loggerObj.logResponse(currentChatChar.id, currentLogId, {
          isError: true,
          errorMsg: errMsg
        });
      }

      chatMessages.push({
        isError: true,
        content: cnMsg + ' (' + errMsg + ')',
        ts: Date.now()
      });
      saveChatMessages(currentChatChar.id);
      renderMessages();
    });
  }

  function onStreamDone(text, cfg) {
    isStreaming = false;
    abortCtrl = null;
    updateTypingUI(false);

    var rawText = (text || '').trim();
    if (!rawText) return;

    clearChatErrors();

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

  // ============ 8. 主动发消息定时器调度 ============
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

      clearChatErrors();

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

  // ============ 9. 心声卡片翻页与事件绑定 ============
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

    // 顶栏两大悬浮抽屉呼出
    var moreBtn = stage.querySelector('#wxCrMoreBtn');
    if (moreBtn) {
      moreBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.WxChatSettings && window.WxChatSettings.open) {
          window.WxChatSettings.open(currentChatChar, function(isProactiveOn) {
            if (isProactiveOn) startProactiveTimer();
            else stopProactiveTimer();
          });
        }
      });
    }

    var beautifyBtn = stage.querySelector('#wxCrAiImgBtn');
    if (beautifyBtn) {
      beautifyBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.WxChatBeautify && window.WxChatBeautify.open) {
          window.WxChatBeautify.open(stage, currentChatChar);
        }
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
        input.placeholder = '';
      }

      chatMessages.push(newMsg);
      input.value = '';
      saveChatMessages(currentChatChar.id);
      renderMessages();

      if (isStreaming) return;

      if (sendDelayTimer) { clearTimeout(sendDelayTimer); sendDelayTimer = null; }
      isWaitingForIdle = false;

      updateTypingUI(true);

      var cfg = getCfg(currentChatChar.id);
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

    // ============ 长按菜单核心绑定 ============
    var ctxMenu = stage.querySelector('#wxCrCtxMenu');
    var ctxMask = stage.querySelector('#wxCrCtxMask');
    var currentCtxIdx = -1;
    var pressTimer = null, pressStartX = 0, pressStartY = 0, isPressScrolling = false;

    function dismissCtxMenu() {
      if (ctxMenu) ctxMenu.style.display = 'none';
      if (ctxMask) ctxMask.classList.remove('show');
      currentCtxIdx = -1;
    }
    if (ctxMask) ctxMask.addEventListener('click', dismissCtxMenu);

    stage.addEventListener('touchstart', function(e) {
      var bubble = e.target.closest('[data-bubble-idx]');
      if (!bubble) return;
      pressStartX = e.touches[0].clientX; pressStartY = e.touches[0].clientY; isPressScrolling = false;
      var idx = parseInt(bubble.dataset.bubbleIdx, 10);
      if (pressTimer) clearTimeout(pressTimer);

      pressTimer = setTimeout(function () {
        if (isPressScrolling) return;
        currentCtxIdx = idx;
        var targetMsg = chatMessages[idx];
        if (!targetMsg) return;
        if (navigator.vibrate) navigator.vibrate(12);

        var isUser = (targetMsg.role === 'user' || targetMsg.sender === 'user');

        var row1 = '<div class="cr-ctx-menu-row">'
          + '<div class="cr-ctx-item" data-ctx-act="quote"><svg viewBox="0 0 24 24"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg><span>引用</span></div>'
          + '<div class="cr-ctx-item" data-ctx-act="copy"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>复制</span></div>'
          + '<div class="cr-ctx-item" data-ctx-act="fav"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><span>收藏</span></div>'
          + '<div class="cr-ctx-item" data-ctx-act="share"><svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/><line x1="10" y1="14" x2="21" y2="3"/></svg><span>转发</span></div>'
          + '</div>';

        var row2 = '<div class="cr-ctx-menu-row">'
          + '<div class="cr-ctx-item" data-ctx-act="resend"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg><span>' + (isUser ? '重发' : '重现') + '</span></div>'
          + '<div class="cr-ctx-item" data-ctx-act="edit"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg><span>编辑</span></div>'
          + '<div class="cr-ctx-item" data-ctx-act="del"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg><span>删除</span></div>'
          + '<div class="cr-ctx-item" data-ctx-act="delFromHere"><svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><polyline points="8 21 12 17 16 21"/></svg><span>后面全删</span></div>'
          + '</div>';

        if (ctxMenu) {
          ctxMenu.innerHTML = row1 + row2;
          bindCtxItemClicks();
          var rect = bubble.getBoundingClientRect();
          var left = Math.min(window.innerWidth - 130, Math.max(130, rect.left + rect.width / 2));
          if (rect.top < 110) { ctxMenu.style.top = (rect.bottom + 8) + 'px'; ctxMenu.style.transform = 'translate(-50%, 0)'; }
          else { ctxMenu.style.top = (rect.top - 8) + 'px'; ctxMenu.style.transform = 'translate(-50%, -100%)'; }
          ctxMenu.style.left = left + 'px'; ctxMenu.style.display = 'flex';
        }
        if (ctxMask) ctxMask.classList.add('show');
      }, 400);
    }, { passive: true });

    stage.addEventListener('touchmove', function(e) {
      if (!pressTimer) return;
      if (Math.abs(e.touches[0].clientX - pressStartX) > 6 || Math.abs(e.touches[0].clientY - pressStartY) > 6) {
        isPressScrolling = true; clearTimeout(pressTimer); pressTimer = null;
      }
    }, { passive: true });

    stage.addEventListener('touchend', function() { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });

    function bindCtxItemClicks() {
      if (!ctxMenu) return;
      ctxMenu.querySelectorAll('[data-ctx-act]').forEach(function(item) {
        item.addEventListener('click', function(e) {
          e.stopPropagation();
          var act = this.dataset.ctxAct;
          var targetIdx = currentCtxIdx;
          var targetMsg = chatMessages[targetIdx];

          dismissCtxMenu();

          if (!targetMsg || targetIdx < 0) return;

          if (act === 'quote') {
            replyingMsg = targetMsg;
            input.placeholder = '回复 ' + (targetMsg.sender === 'user' ? '自己' : (currentChatChar ? currentChatChar.name : 'Ta')) + '...';
            input.focus();
          } else if (act === 'copy') {
            var textToCopy = targetMsg.cleanContent || targetMsg.content || targetMsg.text || '';
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(textToCopy);
            if (window.AppNav) window.AppNav.showToast('已复制到剪贴板');
          } else if (act === 'fav') {
            if (window.AppNav) window.AppNav.showToast('✦ 已加入微信收藏 ✦');
          } else if (act === 'share') {
            if (window.AppNav) window.AppNav.showToast('✦ 消息转发功能已就绪 ✦');
          } else if (act === 'edit') {
            var oldText = targetMsg.cleanContent || targetMsg.content || targetMsg.text || '';
            var newText = prompt('编辑这条消息内容：', oldText);
            if (newText !== null && newText.trim()) {
              targetMsg.content = newText.trim();
              targetMsg.cleanContent = newText.trim();
              saveChatMessages(currentChatChar.id);
              renderMessages();
            }
          } else if (act === 'del') {
            var doDelete = function() {
              if (targetIdx >= 0) {
                if (chatMessages[targetIdx] && chatMessages[targetIdx].voiceObj) {
                  delete chatMessages[targetIdx].voiceObj;
                }
                chatMessages.splice(targetIdx, 1);
                saveChatMessages(currentChatChar.id);
                renderMessages();
                if (window.AppNav) window.AppNav.showToast('消息及对应心声已删除');
              }
            };
            if (window.AppDialog) {
              window.AppDialog.confirm({
                title: '删除消息',
                desc: '确定删除这条消息（及当时的心声）吗？',
                confirmText: '确认删除',
                isDanger: true
              }, doDelete);
            } else {
              doDelete();
            }
          } else if (act === 'delFromHere') {
            var doDeleteAfter = function() {
              if (targetIdx >= 0) {
                for (var i = targetIdx; i < chatMessages.length; i++) {
                  if (chatMessages[i] && chatMessages[i].voiceObj) {
                    delete chatMessages[i].voiceObj;
                  }
                }
                chatMessages.splice(targetIdx);
                saveChatMessages(currentChatChar.id);
                renderMessages();
                if (window.AppNav) window.AppNav.showToast('已删除后续所有消息及心声');
              }
            };

            if (window.AppDialog) {
              window.AppDialog.confirm({
                title: '往后全删',
                desc: '确定删除这条及之后的所有消息与心声记录吗？',
                confirmText: '确定清空后续',
                isDanger: true
              }, doDeleteAfter);
            } else {
              if (confirm('确定删除这条及之后的所有消息与心声记录吗？')) {
                doDeleteAfter();
              }
            }
          } else if (act === 'resend') {
            if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; }
            isStreaming = false;
            updateTypingUI(false);
            var isUserMsg = (targetMsg.role === 'user' || targetMsg.sender === 'user');
            
            for (var k = targetIdx; k < chatMessages.length; k++) {
              if (chatMessages[k] && chatMessages[k].voiceObj) {
                delete chatMessages[k].voiceObj;
              }
            }

            if (isUserMsg) {
              var userText = targetMsg.cleanContent || targetMsg.content || targetMsg.text || '';
              chatMessages.splice(targetIdx);
              chatMessages.push({ role: 'user', sender: 'user', content: userText, ts: Date.now() });
            } else {
              chatMessages.splice(targetIdx);
            }
            saveChatMessages(currentChatChar.id);
            renderMessages();
            requestAIStream();
          }
        });
      });
    }

    // 托盘功能点击
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

  // ============ 10. 本地存储与读取 ============
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
    open: openChatRoom,
    fetchWeather: fetchCharWeather
  };

})();