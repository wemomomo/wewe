
(function () {
  'use strict';

  var currentChatChar = null;
  var currentChatUser = null;
  var chatMessages = [];
  var replyingMsg = null;
  var isSending = false;

  // 默认角色聊天配置
  var defaultCharChatConfig = {
    innerVoice: true,      // 心声流露
    autoMsg: true,         // 主动发消息
    timeAware: 'real',     // 时间感知：'real' 真实 | 'virtual' 虚拟
    location: '',          // 所在地点
    apiTemp: 0.85,         // API 创造温度 (0.1 ~ 1.5)
    customApiKey: '',      // 独立 API Key
    customApiUrl: '',      // 独立 API 代理地址
    customModel: ''        // 独立模型
  };

  var currentCharConfig = {};

  // 辅助：生成优雅大写英文名
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
    
    var pinyinMap = {
      '冥夜': 'MINGYE',
      '冥': 'MING',
      '夜': 'YE',
      '墨墨': 'MOMO',
      '墨': 'MO'
    };
    if (pinyinMap[rawName]) return pinyinMap[rawName];
    return 'CHARACTER';
  }

  // 核心入口：打开单聊页
  function openChatRoom(charObj, userObj) {
    currentChatChar = charObj;
    currentChatUser = userObj;
    replyingMsg = null;
    isSending = false;

    loadCharChatConfig(charObj.id, function () {
      loadChatMessages(charObj.id, function () {
        renderChatRoomDOM();
      });
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
      + '  <div class="wx-cr-title-col" id="wxCrTitleTrigger">'
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

      // 3. 向上悬浮弹出的透明双行功能菜单 (Upward Tray)
      + '<div class="upward-tray-overlay" id="wxCrUpwardTray">'
      + '  <div class="tray-slider-container" id="wxCrTraySlider">'
      // 第 1 页 (2行 × 4列 = 8个)
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
      // 第 2 页
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

      // 5. 角色专属设定抽屉
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
      + '        <div class="wx-switch' + (currentCharConfig.innerVoice ? ' on' : '') + '" id="swInnerVoice"><div class="wx-switch-knob"></div></div>'
      + '      </div>'
      + '      <div class="wx-cr-set-row">'
      + '        <div><div class="wx-cr-set-label">主动发消息</div><div class="wx-cr-set-desc">根据时间状态与剧情发展自主发起话题</div></div>'
      + '        <div class="wx-switch' + (currentCharConfig.autoMsg ? ' on' : '') + '" id="swAutoMsg"><div class="wx-switch-knob"></div></div>'
      + '      </div>'
      + '    </div>'
      + '    <div class="wx-cr-set-group">'
      + '      <div class="wx-cr-set-row">'
      + '        <div class="wx-cr-set-label">时间感知模式</div>'
      + '        <input class="wx-cr-set-input" id="iptTimeAware" value="' + (currentCharConfig.timeAware === 'real' ? '真实时间同步' : '虚拟时间流速') + '">'
      + '      </div>'
      + '      <div class="wx-cr-set-row">'
      + '        <div class="wx-cr-set-label">所在地点</div>'
      + '        <input class="wx-cr-set-input" id="iptCharLocation" value="' + esc(currentCharConfig.location || currentChatChar.location || '') + '" placeholder="如: 枫丹·沫芒宫">'
      + '      </div>'
      + '      <div class="wx-cr-set-row">'
      + '        <div class="wx-cr-set-label">API 创造温度</div>'
      + '        <input class="wx-cr-set-input" id="iptApiTemp" type="number" step="0.05" min="0.1" max="1.5" value="' + (currentCharConfig.apiTemp || 0.85) + '">'
      + '      </div>'
      + '    </div>'
      + '    <div class="wx-cr-set-group">'
      + '      <div class="wx-cr-set-row">'
      + '        <div class="wx-cr-set-label">独立 API Key</div>'
      + '        <input class="wx-cr-set-input" id="iptCustomKey" value="' + esc(currentCharConfig.customApiKey || '') + '" placeholder="默认使用全局 API">'
      + '      </div>'
      + '      <div class="wx-cr-set-row">'
      + '        <div class="wx-cr-set-label">独立代理接口</div>'
      + '        <input class="wx-cr-set-input" id="iptCustomUrl" value="' + esc(currentCharConfig.customApiUrl || '') + '" placeholder="默认使用全局代理">'
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

  function renderMessages() {
    var body = document.getElementById('wxCrBody');
    if (!body) return;

    if (!chatMessages.length) {
      body.innerHTML = '<div class="wx-msg-time-pill">刚刚</div>'
        + '<div class="wx-msg-system-pill">你已与 ' + esc(currentChatChar.name || 'Ta') + ' 建立专属私语通道</div>';
      return;
    }

    var html = '<div class="wx-msg-time-pill">今天</div>';
    chatMessages.forEach(function (msg, idx) {
      if (msg.isSystem) {
        html += '<div class="wx-msg-system-pill">' + esc(msg.text)
          + (msg.canUndo ? '<span data-undo-idx="' + idx + '">撤回</span>' : '')
          + '</div>';
        return;
      }

      var isUser = (msg.sender === 'user');
      var avatarSrc = isUser
        ? (currentChatUser ? (currentChatUser.customPolPhoto || currentChatUser.photo) : '')
        : (currentChatChar ? currentChatChar.photo : '');

      var quoteHtml = msg.quote ? '<div class="wx-msg-quote-bar">' + esc(msg.quote) + '</div>' : '';
      var voiceHtml = (msg.innerVoice && currentCharConfig.innerVoice) ? '<div class="wx-msg-inner-voice">💭 ' + esc(msg.innerVoice) + '</div>' : '';
      var transHtml = msg.translation ? '<div class="wx-msg-trans-box">' + esc(msg.translation) + '</div>' : '';

      html += '<div class="wx-msg-row' + (isUser ? ' user-side' : '') + '" data-msg-idx="' + idx + '">'
        + '<div class="wx-msg-avatar" data-avatar-click="' + msg.sender + '">'
        + (avatarSrc ? '<img src="' + esc(avatarSrc) + '">' : '✦')
        + '</div>'
        + '<div class="wx-msg-bubble-col">'
        + quoteHtml
        + '<div class="wx-msg-bubble" data-bubble-idx="' + idx + '">' + esc(msg.text) + transHtml + '</div>'
        + voiceHtml
        + '</div>'
        + '</div>';
    });

    body.innerHTML = html;
    body.scrollTop = body.scrollHeight;
  }

  // ============ 核心 API 请求引擎 ============
  function buildSystemPrompt(charObj, userObj, config) {
    var promptParts = [];
    var charName = charObj.name || '角色';
    var userName = (userObj ? userObj.name : '你') || '墨墨';

    promptParts.push('你是【' + charName + '】，正在微信上与【' + userName + '】进行日常即时通讯聊天。');
    
    // 角色身份背景设定
    if (charObj.personality) promptParts.push('【性格特质与语气】：' + charObj.personality);
    if (charObj.appearance) promptParts.push('【外貌气质】：' + charObj.appearance);
    if (charObj.background) promptParts.push('【背景经历】：' + charObj.background);
    if (charObj.hobbies) promptParts.push('【喜好偏好】：' + charObj.hobbies);
    if (charObj.callUser) promptParts.push('【对' + userName + '的称呼】：' + charObj.callUser);
    if (charObj.userRelation) promptParts.push('【与' + userName + '的关系】：' + charObj.userRelation);
    
    // 地点与时间状态感知
    var loc = config.location || charObj.location || '当前身边';
    promptParts.push('【当前所在地点】：' + loc);
    promptParts.push('【当前时间】：' + new Date().toLocaleString());

    // 心声格式要求
    if (config.innerVoice) {
      promptParts.push('【特殊要求】：请真实沉浸在人设中，回复时可以在开头或结尾用括号写出你当下的内心独白与心声，例如：（想揉揉她的脑袋）。正文请用自然的微信短句口吻。');
    } else {
      promptParts.push('【特殊要求】：请像微信真人聊天一样，简短、自然、深情，不要长篇大论。');
    }

    return promptParts.join('\n');
  }

  function parseVoiceAndText(rawResponse) {
    if (!rawResponse) return { text: '', innerVoice: '' };
    var text = rawResponse.trim();
    var innerVoice = '';

    // 尝试提取括号内的心声 (xxx) 或 （xxx）
    var match = text.match(/[\(（]([^\)）]+)[\)）]/);
    if (match && match[1]) {
      innerVoice = match[1].trim();
      text = text.replace(match[0], '').trim();
    }

    if (!text && innerVoice) {
      text = '...';
    }

    return {
      text: text || rawResponse,
      innerVoice: innerVoice
    };
  }

  function sendToAIModel() {
    if (isSending) return;

    // 1. 获取全局配置或独立配置
    var activeGlobalApi = (window.ApiConfig && typeof window.ApiConfig.getActive === 'function') ? window.ApiConfig.getActive() : null;
    
    var apiUrl = currentCharConfig.customApiUrl || (activeGlobalApi ? activeGlobalApi.url : '');
    var apiKey = currentCharConfig.customApiKey || (activeGlobalApi ? activeGlobalApi.key : '');
    var model = currentCharConfig.customModel || (activeGlobalApi ? activeGlobalApi.model : 'deepseek-chat');
    var temperature = currentCharConfig.apiTemp || 0.85;

    if (!apiUrl || !apiKey) {
      if (window.AppNav) window.AppNav.showToast('请先在「设置 - API 配置」中保存并启用接口');
      return;
    }

    isSending = true;
    var indicator = document.getElementById('wxCrTypingIndicator');
    if (indicator) indicator.classList.add('show');

    // 2. 组装对话历史
    var systemPrompt = buildSystemPrompt(currentChatChar, currentChatUser, currentCharConfig);
    var messagesPayload = [{ role: 'system', content: systemPrompt }];

    var recentMsgs = chatMessages.slice(-15);
    recentMsgs.forEach(function(m) {
      if (!m.isSystem && m.text) {
        messagesPayload.push({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        });
      }
    });

    var endpoint = apiUrl.replace(/\/+$/, '') + '/chat/completions';

    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model,
        messages: messagesPayload,
        temperature: temperature,
        stream: false
      })
    })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      isSending = false;
      if (indicator) indicator.classList.remove('show');

      var replyRaw = '';
      if (data.choices && data.choices[0] && data.choices[0].message) {
        replyRaw = data.choices[0].message.content || '';
      }

      if (replyRaw) {
        var parsed = parseVoiceAndText(replyRaw);
        chatMessages.push({
          sender: 'char',
          text: parsed.text,
          innerVoice: parsed.innerVoice,
          time: Date.now()
        });
        renderMessages();
        saveChatMessages(currentChatChar.id);
      }
    })
    .catch(function(err) {
      isSending = false;
      if (indicator) indicator.classList.remove('show');
      if (window.AppNav) window.AppNav.showToast('消息发送失败: ' + err.message);
    });
  }

  function bindChatEvents(stage) {
    var backBtn = stage.querySelector('#wxCrBackBtn');
    backBtn.addEventListener('click', function () {
      stage.remove();
    });

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
      saveCharChatConfig();
    }

    moreBtn.addEventListener('click', openSettings);
    mask.addEventListener('click', closeSettings);
    closeSetBtn.addEventListener('click', closeSettings);

    var swVoice = stage.querySelector('#swInnerVoice');
    if (swVoice) {
      swVoice.addEventListener('click', function () {
        this.classList.toggle('on');
        currentCharConfig.innerVoice = this.classList.contains('on');
        renderMessages();
      });
    }

    var swAuto = stage.querySelector('#swAutoMsg');
    if (swAuto) {
      swAuto.addEventListener('click', function () {
        this.classList.toggle('on');
        currentCharConfig.autoMsg = this.classList.contains('on');
      });
    }

    var iptLoc = stage.querySelector('#iptCharLocation');
    var iptTemp = stage.querySelector('#iptApiTemp');
    var iptKey = stage.querySelector('#iptCustomKey');
    var iptUrl = stage.querySelector('#iptCustomUrl');

    function syncConfigFields() {
      if (iptLoc) currentCharConfig.location = iptLoc.value.trim();
      if (iptTemp) currentCharConfig.apiTemp = parseFloat(iptTemp.value) || 0.85;
      if (iptKey) currentCharConfig.customApiKey = iptKey.value.trim();
      if (iptUrl) currentCharConfig.customApiUrl = iptUrl.value.trim();
    }

    [iptLoc, iptTemp, iptKey, iptUrl].forEach(function (el) {
      if (el) {
        el.addEventListener('input', syncConfigFields);
        el.addEventListener('blur', syncConfigFields);
      }
    });

    var input = stage.querySelector('#wxCrInput');
    var sendBtn = stage.querySelector('#wxCrSendBtn');

    function doSendMessage() {
      var text = input.value.trim();
      if (!text || isSending) return;

      var newMsg = {
        sender: 'user',
        text: text,
        time: Date.now()
      };

      if (replyingMsg) {
        newMsg.quote = (replyingMsg.sender === 'user' ? '你' : (currentChatChar.name || 'Ta')) + ': ' + replyingMsg.text;
        replyingMsg = null;
        input.placeholder = '与 ' + (currentChatChar.name || 'Ta') + ' 私语...';
      }

      chatMessages.push(newMsg);
      input.value = '';
      renderMessages();
      saveChatMessages(currentChatChar.id);

      // 发送后即刻呼叫模型生成回信
      sendToAIModel();
    }

    sendBtn.addEventListener('click', doSendMessage);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSendMessage();
      }
    });

    stage.querySelectorAll('[data-tray-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = this.dataset.trayAct;
        var names = {
          album: '照片', camera: '拍摄', call: '音视频通话', location: '位置',
          redpack: '红包', transfer: '转账', favorite: '我的收藏', card: '名片',
          coupon: '卡券', music: '音乐', file: '文件', link: '分享链接', watch: '一起看'
        };

        upwardTray.classList.remove('show');
        plusBtn.classList.remove('open');

        if (act === 'location') {
          chatMessages.push({
            sender: 'user',
            text: '📍 [位置] ' + (currentCharConfig.location || '当前定位地点'),
            time: Date.now()
          });
          renderMessages();
          saveChatMessages(currentChatChar.id);
        } else if (act === 'redpack') {
          chatMessages.push({
            sender: 'user',
            text: '🧧 [微信红包] 恭喜发财，大吉大利',
            time: Date.now()
          });
          renderMessages();
          saveChatMessages(currentChatChar.id);
        } else if (act === 'transfer') {
          chatMessages.push({
            sender: 'user',
            text: '💰 [转账] ￥520.00',
            time: Date.now()
          });
          renderMessages();
          saveChatMessages(currentChatChar.id);
        } else {
          if (window.AppNav) window.AppNav.showToast('✦ ' + (names[act] || '功能') + ' 正在连接角色 ✦');
        }
      });
    });

    stage.addEventListener('dblclick', function (e) {
      var avt = e.target.closest('[data-avatar-click]');
      if (avt) {
        var who = avt.dataset.avatarClick === 'user' ? '自己' : (currentChatChar.name || 'Ta');
        chatMessages.push({
          isSystem: true,
          text: '你拍了拍「' + who + '」',
          time: Date.now()
        });
        renderMessages();
        saveChatMessages(currentChatChar.id);
      }
    });

    var pressTimer = null;
    stage.addEventListener('touchstart', function (e) {
      var bubble = e.target.closest('[data-bubble-idx]');
      if (!bubble) return;
      var idx = parseInt(bubble.dataset.bubbleIdx, 10);

      pressTimer = setTimeout(function () {
        var targetMsg = chatMessages[idx];
        if (!targetMsg) return;

        if (window.PhotoAction) {
          window.PhotoAction.show(
            function () {
              replyingMsg = targetMsg;
              input.placeholder = '回复 ' + (targetMsg.sender === 'user' ? '自己' : currentChatChar.name) + '...';
              input.focus();
            },
            function () {
              if (targetMsg.sender === 'user') {
                chatMessages.splice(idx, 1);
                chatMessages.push({
                  isSystem: true,
                  text: '你撤回了一条消息',
                  time: Date.now()
                });
                renderMessages();
                saveChatMessages(currentChatChar.id);
              } else {
                targetMsg.translation = '✦ 双语翻译：' + targetMsg.text;
                renderMessages();
                saveChatMessages(currentChatChar.id);
              }
            }
          );
        }
      }, 500);
    });

    stage.addEventListener('touchend', function () {
      clearTimeout(pressTimer);
    });
  }

  function loadChatMessages(charId, cb) {
    if (!window.AppDB) { if (cb) cb(); return; }
    window.AppDB.get('wx_chat_msgs_' + charId, function (msgs) {
      chatMessages = Array.isArray(msgs) ? msgs : [];
      if (cb) cb();
    });
  }

  function saveChatMessages(charId) {
    if (!window.AppDB) return;
    window.AppDB.save('wx_chat_msgs_' + charId, chatMessages);
  }

  function loadCharChatConfig(charId, cb) {
    if (!window.AppDB) {
      currentCharConfig = Object.assign({}, defaultCharChatConfig);
      if (cb) cb();
      return;
    }
    window.AppDB.get('wx_char_cfg_' + charId, function (cfg) {
      currentCharConfig = Object.assign({}, defaultCharChatConfig, cfg || {});
      if (cb) cb();
    });
  }

  function saveCharChatConfig() {
    if (!window.AppDB || !currentChatChar) return;
    window.AppDB.save('wx_char_cfg_' + currentChatChar.id, currentCharConfig);
  }

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.WxChatRoom = {
    open: openChatRoom
  };

})();
