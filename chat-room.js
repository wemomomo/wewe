
(function () {
  'use strict';

  var currentChatChar = null;
  var currentChatUser = null;
  var chatMessages = [];
  var isPanelOpen = false;
  var replyingMsg = null;

  // 默认角色聊天配置
  var defaultCharChatConfig = {
    innerVoice: true,      // 心声流露
    autoMsg: true,         // 主动发消息
    timeAware: 'real',     // 时间感知：'real' 真实 | 'virtual' 虚拟
    location: '',          // 所在地点
    apiTemp: 0.85,         // API 创造温度 (0.1 ~ 1.5)
    customApiKey: '',      // 独立 API Key
    customApiUrl: ''       // 独立 API 代理地址
  };

  var currentCharConfig = {};

  // 核心入口：打开单聊页
  function openChatRoom(charObj, userObj) {
    currentChatChar = charObj;
    currentChatUser = userObj;
    replyingMsg = null;
    isPanelOpen = false;

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

    var displayLoc = currentCharConfig.location || currentChatChar.location || '未知地点';

    stage.innerHTML = ''
      // 1. 顶栏
      + '<div class="wx-cr-header">'
      + '  <button class="wx-cr-back-btn" id="wxCrBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '  <div class="wx-cr-title-col">'
      + '    <span class="wx-cr-name">' + esc(currentChatChar.name || 'Chat') + '</span>'
      + '    <span class="wx-cr-status-sub"><span class="wx-cr-status-dot"></span>在线 · ' + esc(displayLoc) + '</span>'
      + '  </div>'
      + '  <button class="wx-cr-more-btn" id="wxCrMoreBtn" type="button"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>'
      + '</div>'

      // 2. 聊天消息区
      + '<div class="wx-cr-body" id="wxCrBody"></div>'

      // 3. 底部输入条
      + '<div class="wx-cr-footer">'
      + '  <div class="wx-cr-input-bar">'
      + '    <button class="wx-cr-tool-icon-btn" id="wxCrVoiceBtn" type="button" title="语音输入"><svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></button>'
      + '    <div class="wx-cr-input-wrap">'
      + '      <textarea class="wx-cr-textarea" id="wxCrInput" rows="1" placeholder="发送消息..."></textarea>'
      + '    </div>'
      + '    <button class="wx-cr-tool-icon-btn" id="wxCrEmojiBtn" type="button" title="表情包"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg></button>'
      + '    <button class="wx-cr-tool-icon-btn" id="wxCrPlusBtn" type="button" title="更多功能"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></button>'
      + '    <button class="wx-cr-send-btn" id="wxCrSendBtn" type="button" style="display:none;">发送</button>'
      + '  </div>'

      // 4. 多功能九宫格抽屉
      + '  <div class="wx-cr-panel-drawer" id="wxCrPanelDrawer">'
      + '    <div class="wx-cr-grid-actions">'
      + renderGridItem('album', '照片', '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>')
      + renderGridItem('camera', '拍摄', '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>')
      + renderGridItem('call', '音视频通话', '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>')
      + renderGridItem('location', '位置', '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>')
      + renderGridItem('redpack', '红包', '<rect x="4" y="2" width="16" height="20" rx="3"/><circle cx="12" cy="10" r="3"/><line x1="4" y1="8" x2="20" y2="8"/>')
      + renderGridItem('transfer', '转账', '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>')
      + renderGridItem('favorite', '收藏', '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>')
      + renderGridItem('card', '名片', '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>')
      + renderGridItem('coupon', '卡券', '<rect x="3" y="6" width="18" height="12" rx="2"/><line x1="9" y1="6" x2="9" y2="18" stroke-dasharray="2 2"/>')
      + renderGridItem('music', '音乐', '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>')
      + renderGridItem('file', '文件', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>')
      + renderGridItem('link', '分享链接', '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>')
      + renderGridItem('watch', '一起看', '<polygon points="5 3 19 12 5 21 5 3"/>')
      + '    </div>'
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
      + '        <input class="wx-cr-set-input" id="iptCharLocation" value="' + esc(currentCharConfig.location || currentChatChar.location || '') + '" placeholder="如: 枫丹·沫芒宫 / 巴黎">'
      + '      </div>'
      + '      <div class="wx-cr-set-row">'
      + '        <div class="wx-cr-set-label">API 创造温度</div>'
      + '        <input class="wx-cr-set-input" id="iptApiTemp" type="number" step="0.05" min="0.1" max="1.5" value="' + (currentCharConfig.apiTemp || 0.85) + '">'
      + '      </div>'
      + '    </div>'
      + '    <div class="wx-cr-set-group">'
      + '      <div class="wx-cr-set-row">'
      + '        <div class="wx-cr-set-label">独立 API Key</div>'
      + '        <input class="wx-cr-set-input" id="iptCustomKey" value="' + esc(currentCharConfig.customApiKey || '') + '" placeholder="默认全局 API">'
      + '      </div>'
      + '      <div class="wx-cr-set-row">'
      + '        <div class="wx-cr-set-label">独立代理接口</div>'
      + '        <input class="wx-cr-set-input" id="iptCustomUrl" value="' + esc(currentCharConfig.customApiUrl || '') + '" placeholder="默认全局代理">'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(stage);
    bindChatEvents(stage);
    renderMessages();
  }

  function renderGridItem(act, label, svgPaths) {
    return '<div class="wx-cr-grid-item" data-grid-act="' + act + '">'
      + '<div class="wx-cr-grid-icon-box"><svg viewBox="0 0 24 24">' + svgPaths + '</svg></div>'
      + '<span class="wx-cr-grid-label">' + label + '</span>'
      + '</div>';
  }

  function renderMessages() {
    var body = document.getElementById('wxCrBody');
    if (!body) return;

    if (!chatMessages.length) {
      body.innerHTML = '<div class="wx-msg-time-pill">刚刚</div>'
        + '<div class="wx-msg-system-pill">你已与 ' + esc(currentChatChar.name || 'Ta') + ' 建立专属聊天通道</div>';
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

  function bindChatEvents(stage) {
    var backBtn = stage.querySelector('#wxCrBackBtn');
    backBtn.addEventListener('click', function () {
      stage.remove();
    });

    var moreBtn = stage.querySelector('#wxCrMoreBtn');
    var mask = stage.querySelector('#wxCrSetMask');
    var panel = stage.querySelector('#wxCrSetPanel');
    var closeSetBtn = stage.querySelector('#wxCrSetCloseBtn');

    function openSettings() {
      mask.classList.add('show');
      panel.classList.add('open');
    }
    function closeSettings() {
      mask.classList.remove('show');
      panel.classList.remove('open');
      saveCharChatConfig();
    }

    moreBtn.addEventListener('click', openSettings);
    mask.addEventListener('click', closeSettings);
    closeSetBtn.addEventListener('click', closeSettings);

    // 抽屉开关与输入持久化
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

    // 加号九宫格展开/收起
    var plusBtn = stage.querySelector('#wxCrPlusBtn');
    var drawer = stage.querySelector('#wxCrPanelDrawer');
    plusBtn.addEventListener('click', function () {
      isPanelOpen = !isPanelOpen;
      if (isPanelOpen) drawer.classList.add('open');
      else drawer.classList.remove('open');
    });

    // 输入条与发送按钮切换
    var input = stage.querySelector('#wxCrInput');
    var sendBtn = stage.querySelector('#wxCrSendBtn');

    input.addEventListener('input', function () {
      if (input.value.trim().length > 0) {
        sendBtn.style.display = 'block';
        plusBtn.style.display = 'none';
      } else {
        sendBtn.style.display = 'none';
        plusBtn.style.display = 'flex';
      }
    });

    function doSendMessage() {
      var text = input.value.trim();
      if (!text) return;

      var newMsg = {
        sender: 'user',
        text: text,
        time: Date.now()
      };

      if (replyingMsg) {
        newMsg.quote = (replyingMsg.sender === 'user' ? '你' : (currentChatChar.name || 'Ta')) + ': ' + replyingMsg.text;
        replyingMsg = null;
      }

      chatMessages.push(newMsg);
      input.value = '';
      sendBtn.style.display = 'none';
      plusBtn.style.display = 'flex';
      renderMessages();
      saveChatMessages(currentChatChar.id);
    }

    sendBtn.addEventListener('click', doSendMessage);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSendMessage();
      }
    });

    // 九宫格功能点击事件
    stage.querySelectorAll('[data-grid-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = this.dataset.gridAct;
        var names = {
          album: '照片', camera: '拍摄', call: '音视频通话', location: '位置',
          redpack: '红包', transfer: '转账', favorite: '我的收藏', card: '名片',
          coupon: '卡券', music: '音乐', file: '文件', link: '分享链接', watch: '一起看'
        };

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

    // 拍一拍（双击头像）
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

    // 长按气泡功能操作（引用回复 / 撤回 / 双语翻译）
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
            function () { // 引用回复
              replyingMsg = targetMsg;
              input.placeholder = '回复 ' + (targetMsg.sender === 'user' ? '自己' : currentChatChar.name) + '...';
              input.focus();
            },
            function () { // 消息撤回或翻译
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

  // 数据持久化
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
