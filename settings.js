
(function () {
  'use strict';

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
  var resendingRoundGroupId = null;
  var _proactiveTimer = null;
  var isSendingShield = false;

  window._chatActiveCharId = null;

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(ts) { var d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function esc(str) { return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }

  function getCfg(charId) { return window.WxChatSettings ? window.WxChatSettings.getCfg(charId) : {}; }
  function getActiveApi(charId) { return window.WxChatSettings ? window.WxChatSettings.getActiveApi(charId) : null; }
  function getParams(charId) {
    var cfg = getCfg(charId);
    return {
      temperature: cfg.temperature !== undefined ? cfg.temperature : 0.85,
      freqPenalty: cfg.freqPenalty !== undefined ? cfg.freqPenalty : 0.3,
      presPenalty: cfg.presPenalty !== undefined ? cfg.presPenalty : 0.3
    };
  }

  // 💡 终极思维链绝杀清理器（完整/半截/中文标记全方位地毯式清扫）
  function stripThinkingProcess(raw) {
    if (!raw || typeof raw !== 'string') return '';
    var str = raw;
    str = str.replace(/<think[\s\S]*?<\/think>/gi, '');
    str = str.replace(/<thought[\s\S]*?<\/thought>/gi, '');
    str = str.replace(/<reasoning[\s\S]*?<\/reasoning>/gi, '');
    str = str.replace(/<analysis[\s\S]*?<\/analysis>/gi, '');
    str = str.replace(/```thought[\s\S]*?```/gi, '');
    str = str.replace(/```reasoning[\s\S]*?```/gi, '');
    str = str.replace(/```think[\s\S]*?```/gi, '');
    str = str.replace(/<(?:think|thought|reasoning|analysis)[\s\S]*$/gi, '');
    str = str.replace(/【思考[\s\S]*?】/g, '');
    str = str.replace(/\[思考[\s\S]*?\]/g, '');
    return str.trim();
  }

  function smartSplitMessages(text) {
    text = (text || '').trim();
    if (!text) return [];
    if (text.indexOf('|||') >= 0) {
      return text.split('|||').map(function(t){ return t.trim(); }).filter(Boolean);
    }
    var lines = text.split(/\r?\n+/).map(function(t){ return t.trim(); }).filter(Boolean);
    return lines.length >= 2 ? lines : [text];
  }

  function translateError(msg) {
    if (!msg) return '连接中断，请检查网络或配置';
    if (msg.indexOf('401') >= 0) return 'API Key 授权失效，请在「设置 - API 配置」中检查';
    if (msg.indexOf('404') >= 0) return '找不到该模型或 API 地址填写错误';
    if (msg.indexOf('429') >= 0) return '请求速率超限或账户额度不足';
    return '请求异常：' + msg;
  }

  function safeBuildPayload(charObj, userObj, cfg, history) {
    if (window.WxChatPrompt && window.WxChatPrompt.buildApiPayload) {
      try {
        return window.WxChatPrompt.buildApiPayload(charObj, userObj, cfg, history, false, null);
      } catch(e) {}
    }
    var charName = charObj ? (charObj.name || '角色') : '角色';
    var userName = userObj ? (userObj.name || userObj.nickname || '用户') : '用户';
    var minM = Math.max(2, cfg.minMsgs || 2);
    var maxM = Math.max(minM, cfg.maxMsgs || 3);
    var sys = '你是' + charName + '，正在微信上与' + userName + '私聊。每次回复必须用 ||| 分隔成 ' + minM + ' 到 ' + maxM + ' 条短句。'
      + (charObj && charObj.personality ? '\n性格设定：' + charObj.personality : '')
      + (charObj && charObj.appearance ? '\n外貌气质：' + charObj.appearance : '');

    var msgs = [{ role: 'system', content: sys }];
    history.slice(-15).forEach(function(m) {
      if (!m.isError && !m.isSystem) {
        msgs.push({ role: m.role || (m.sender === 'user' ? 'user' : 'assistant'), content: m.cleanContent || m.content || '' });
      }
    });
    return msgs;
  }

  // ============ 1. 渲染主外壳 ============
  function openChatRoom(charObj, userObj) {
    currentChatChar = charObj;
    currentChatUser = userObj;
    replyingMsg = null;
    isStreaming = false;
    resendingRoundGroupId = null;
    isSendingShield = false;
    window._chatActiveCharId = charObj.id;

    var cfg = getCfg(charObj.id);
    if (cfg.timeWeather && window.WxChatPrompt) {
      try {
        window.WxChatPrompt.fetchCharWeather(cfg.charRealCity || cfg.charCity || charObj.location);
      } catch(e){}
    }

    loadChatMessages(charObj.id, function() {
      renderChatRoomDOM();
      startProactiveTimer();
    });
  }

  function renderChatRoomDOM() {
    var old = document.getElementById('wxChatRoomStage');
    if (old) old.remove();

    var stage = document.createElement('div');
    stage.className = 'wx-chat-room-stage';
    stage.id = 'wxChatRoomStage';

    var avatarSrc = currentChatChar.photo || '';
    var charBio = currentChatChar.quote0 || currentChatChar.bio || currentChatChar.personality || '“ 只要呼唤我，我都在。 ”';
    if (charBio.length > 24) charBio = charBio.slice(0, 24) + '...';

    stage.innerHTML = ''
      + '<div class="wx-cr-header">'
      + '  <div class="wx-cr-left-group">'
      + '    <button class="wx-cr-back-btn" id="wxCrBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '    <div class="salon-avatar-badge" id="wxCrCharHeadBtn" title="心声档案">' + (avatarSrc ? '<img class="salon-avatar-img" src="' + esc(avatarSrc) + '">' : '<div class="salon-avatar-img">✦</div>') + '</div>'
      + '  </div>'
      + '  <div class="wx-cr-title-col">'
      + '    <span class="char-glitch-name-dark">' + esc(currentChatChar.name || 'Chat') + '</span>'
      + '    <div class="char-signature-sub" id="wxCrCharSig">' + esc(charBio) + '</div>'
      + '    <div class="typing-status-bar" id="wxCrTypingIndicator"><span>正在输入中</span><span class="typing-dots"><span></span><span></span><span></span></span></div>'
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
      + '      <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.2" stroke="#1a1c22" stroke-width="1.3"/><path d="M12 4.8A7.2 7.2 0 1 0 19.2 12A5.6 5.6 0 1 1 12 4.8Z" fill="#1a1c22"/><circle cx="12" cy="12" r="1.2" fill="#ffffff"/></svg>'
      + '    </button>'
      + '  </div>'
      + '</div>'
      + '<div class="wx-cr-body" id="wxCrBody"></div>'
      + '<div class="upward-tray-overlay" id="wxCrUpwardTray"><div class="tray-slider-container" id="wxCrTraySlider"><div class="tray-page-grid">'
      + renderTrayItem('sticker', '表情包', '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>')
      + renderTrayItem('album', '照片', '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>')
      + renderTrayItem('camera', '拍摄', '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>')
      + renderTrayItem('call', '通话', '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>')
      + '</div></div></div>'
      + '<div class="chat-footer-clean"><div class="input-bar-wrap">'
      + '<button class="pure-icon-btn" id="wxCrVoiceBtn" type="button"><svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="18" x2="12" y2="22"></line><line x1="8" y1="22" x2="16" y2="22"></line></svg></button>'
      + '<div class="input-capsule-glass"><textarea class="input-field-inner" id="wxCrInput" rows="1"></textarea></div>'
      + '<button class="pure-plus-trigger" id="wxCrPlusBtn" type="button"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>'
      + '<button class="pure-send-balloon-btn" id="wxCrSendBtn" type="button"><svg viewBox="0 0 64 64" fill="none"><path d="M52 12 L12 26 L30 32 L42 54 Z" fill="#2a2a2a" stroke="#2a2a2a" stroke-width="6" stroke-linejoin="round"/></svg></button>'
      + '</div></div>'
      + '<div class="voice-transparent-wrap" id="wxCrVoiceModalWrap"><div class="voice-dossier-card" id="wxCrVoiceCard"><div class="card-tape-deco"></div><div class="card-header-line"><button class="card-page-arrow prev" id="wxCrVoicePrevBtn" type="button">❮</button><span class="card-serial-code" id="wxCrVoicePageTitle">心声档案</span><button class="card-page-arrow next" id="wxCrVoiceNextBtn" type="button">❯</button><button class="card-close-btn" id="wxCrCloseVoiceBtn" type="button">✕</button></div><div class="voice-monologue-sec"><div class="voice-quote-text" id="wxCrVoiceMonologueText">“ ... ”</div><div class="voice-heart-pulse-bar"><div class="line"></div><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg><div class="line"></div></div></div><div class="voice-lower-columns"><div class="col-action"><span class="col-title">当前行止 ACTION</span><div class="action-detail-text" id="wxCrVoiceActionText">正看着手机屏幕。</div></div><div class="col-wish"><span class="col-title" id="wxCrVoiceRealityTitle">瞬息 TRANSIENT</span><div class="action-detail-text" id="wxCrVoiceWishText">指尖微凉，想倒杯温水。</div></div></div><div class="card-footer-sec"><span class="card-timestamp-sub" id="wxCrVoiceTimeSub">RECORDED</span><div class="card-motto-sub">对我来说，你不可重复</div></div></div></div>'
      + '<div class="cr-ctx-menu-mask" id="wxCrCtxMask"></div><div class="cr-ctx-menu" id="wxCrCtxMenu" style="display:none;"></div>'
      + '<div class="cr-expand-modal-mask" id="wxCrExpandModal"><div class="cr-expand-modal-panel"><div class="cr-expand-header"><button class="cr-expand-back-btn" id="wxCrExpCancelBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button><div class="cr-expand-title" id="wxCrExpTitle">深度手札编辑</div><button class="cr-expand-done-btn" id="wxCrExpDoneBtn" type="button">完成</button></div><div class="cr-expand-body"><textarea class="cr-expand-textarea" id="wxCrExpTextarea"></textarea></div><div class="cr-expand-footer"><div class="cr-expand-count" id="wxCrExpCount">0 字</div><button class="cr-expand-clear-btn" id="wxCrExpClearBtn" type="button">清空文本</button></div></div></div>';

    document.body.appendChild(stage);
    if (window.WxChatBeautify) window.WxChatBeautify.apply(stage, currentChatChar);
    bindChatEvents(stage);
    renderMessages();
  }

  function renderTrayItem(act, label, svgPaths) {
    return '<div class="tray-btn-item" data-tray-act="' + act + '"><div class="tray-icon-pure"><svg viewBox="0 0 24 24">' + svgPaths + '</svg></div><span class="tray-label-text">' + label + '</span></div>';
  }

  // ============ 2. 消息流渲染 ============
  function renderMessages() {
    var body = document.getElementById('wxCrBody');
    if (!body) return;
    if (!chatMessages.length) {
      body.innerHTML = '<div class="wx-msg-time-pill">刚刚</div><div class="wx-msg-system-pill">你已与 ' + esc(currentChatChar.name || 'Ta') + ' 建立专属私语通道</div>';
      return;
    }

    var html = '<div class="wx-msg-time-pill">今天</div>';
    var groups = [], curGroup = null;

    for (var i = 0; i < chatMessages.length; i++) {
      var m = chatMessages[i], isUser = (m.role === 'user' || m.sender === 'user');
      var isTimeGap = curGroup && curGroup.msgs.length && (m.ts - curGroup.msgs[curGroup.msgs.length - 1].msg.ts > 180000);
      var isNewRoundGroup = curGroup && curGroup.groupId && m.groupId && curGroup.groupId !== m.groupId;

      if (!curGroup || curGroup.isUser !== isUser || m.isSystem || m.isError || m.isProactiveGroup || isTimeGap || isNewRoundGroup) {
        curGroup = { isUser: isUser, isSystem: !!m.isSystem, isError: !!m.isError, groupId: m.groupId || null, msgs: [] };
        groups.push(curGroup);
      }
      curGroup.msgs.push({ msg: m, globalIdx: i });
    }

    var cfg = getCfg(currentChatChar.id);

    groups.forEach(function(g) {
      if (g.isError) {
        g.msgs.forEach(function(it) { html += '<div class="wx-msg-error-detail" data-bubble-idx="' + it.globalIdx + '">⚠️ ' + esc(it.msg.content || it.msg.text) + '</div>'; });
        return;
      }
      if (g.isSystem) {
        g.msgs.forEach(function(it) { html += '<div class="wx-msg-system-pill">' + esc(it.msg.content || it.msg.text) + '</div>'; });
        return;
      }

      var isUser = g.isUser;
      var userInitial = (currentChatUser && (currentChatUser.name || currentChatUser.nickname)) ? (currentChatUser.name || currentChatUser.nickname).charAt(0) : '我';
      var avatarSrc = isUser ? (currentChatUser ? (currentChatUser.customPolPhoto || currentChatUser.photo) : '') : (currentChatChar ? currentChatChar.photo : '');

      var groupVoiceObj = null, groupVoiceIdx = -1;
      if (!isUser) {
        g.msgs.forEach(function(item) {
          if (item.msg.voiceObj) {
            groupVoiceObj = item.msg.voiceObj;
            groupVoiceIdx = item.globalIdx;
          }
        });
      }

      html += '<div class="wx-msg-group' + (isUser ? ' user-side' : '') + '"><div class="wx-msg-avatar">' + (avatarSrc ? '<img src="' + esc(avatarSrc) + '">' : (isUser ? esc(userInitial) : '✦')) + '</div><div class="wx-msg-bubbles-col">';
      var total = g.msgs.length;

      var rootMsg = g.msgs[0] ? g.msgs[0].msg : null;
      var hasGroupSwipes = !isUser && rootMsg && Array.isArray(rootMsg.groupSwipes) && rootMsg.groupSwipes.length > 1;
      var curSwipe = hasGroupSwipes ? ((rootMsg.groupSwipeIdx !== undefined ? rootMsg.groupSwipeIdx : rootMsg.groupSwipes.length - 1) + 1) : 1;
      var totalSwipe = hasGroupSwipes ? rootMsg.groupSwipes.length : 1;

      g.msgs.forEach(function(item, idx) {
        var m = item.msg, globalIdx = item.globalIdx;
        var content = m.cleanContent || m.content || m.text || '';
        
        // 渲染前最后脱敏清洗
        if (!isUser && window.WxChatVoice) {
          content = window.WxChatVoice.sanitizeBubbleText(content);
        }
        content = content.replace(/!\[.*?\]\([^\)]+\)/gi, '').trim();

        if (!content && content !== '0') return;

        var heartHtml = (!isUser && groupVoiceObj && idx === total - 1) ? '<span class="voice-heart-trigger" data-voice-idx="' + groupVoiceIdx + '" title="心声"><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg></span>' : '';
        var quoteHtml = m.quote ? '<div class="wx-msg-quote-bar">' + esc(m.quote) + '</div>' : '';

        var swipeDeckHtml = '';
        if (hasGroupSwipes && idx === total - 1) {
          swipeDeckHtml = '<div class="msg-swipe-nav-bar" data-group-id="' + esc(rootMsg.groupId || '') + '" data-root-idx="' + g.msgs[0].globalIdx + '">'
            + '<button class="msg-swipe-btn prev" data-swipe-dir="prev" type="button" title="上一个回答">❮</button>'
            + '<span class="msg-swipe-num">' + curSwipe + '/' + totalSwipe + '</span>'
            + '<button class="msg-swipe-btn next" data-swipe-dir="next" type="button" title="下一个回答">❯</button>'
            + '</div>';
        }

        var tailTimeHtml = (idx === total - 1) ? ('<div class="bubble-tail-wrapper">' + swipeDeckHtml + '<div class="bubble-tail-timestamp">#' + (globalIdx + 1) + ' · ' + fmtTime(m.ts || Date.now()) + '</div></div>') : '';

        var isPhotoTag = /\[(?:photo|image|picture|sticker):\s*([^\]]+)\]/i.test(content);
        var formattedContent = '';

        if (isPhotoTag) {
          var photoDesc = content.match(/\[(?:photo|image|picture|sticker):\s*([^\]]+)\]/i)[1].trim();
          var msgKey = 'pho_' + (m.groupId || m.ts || globalIdx) + '_' + (rootMsg ? (rootMsg.groupSwipeIdx || 0) : 0);
          var cache = window.WxChatPhoto ? window.WxChatPhoto.getCache(msgKey) : null;
          var finalUrl = m.photoUrl || (cache ? cache.url : '');

          if (!finalUrl && !cache && cfg.stickerGen && window.WxChatPhoto) {
            window.WxChatPhoto.triggerPhotoGen(photoDesc, msgKey, m, cfg, currentChatChar, function(shouldSave) {
              if (shouldSave) saveChatMessages(currentChatChar.id);
              renderMessages();
            });
            cache = window.WxChatPhoto.getCache(msgKey);
          }

          if (finalUrl) {
            formattedContent = '<div class="wx-real-photo-card" data-preview-img="' + esc(finalUrl) + '"><img src="' + esc(finalUrl) + '" alt="照片"><div class="photo-expand-badge"><svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></div></div>';
          } else if (cache && cache.loading) {
            formattedContent = '<div class="wx-photo-loading-card"><span class="photo-loading-spinner">📷</span><div class="photo-loading-info"><span>正在记录画面中...</span><b data-photo-timer="' + msgKey + '">' + (cache.seconds || 0) + 's</b></div></div>';
          } else {
            formattedContent = '<div class="wx-photo-fallback-card" data-retry-photo="' + msgKey + '" data-photo-desc="' + esc(photoDesc) + '"><span>📷 照片发送失败 <b style="text-decoration:underline;">点击重试 ↻</b></span></div>';
          }
        } else {
          formattedContent = window.WxChatVoice ? window.WxChatVoice.formatBubbleContent(content, cfg) : esc(content);
        }

        var bubbleClass = isPhotoTag ? 'wx-msg-bubble-item is-photo-bubble' : 'wx-msg-bubble-item';

        // 🌟 墨墨的两颗高定伴星（永久固定在每一个气泡的外角！）
        var cloudDeco = isPhotoTag ? '' : (isUser 
          ? '<div class="rz8-dc rz8-br-cloud"><div class="rz8-star-blue-gray-tl"></div><div class="rz8-cloud-blue-gray"></div><div class="rz8-dot-blue-gray-br"></div></div>' 
          : '<div class="rz8-dc rz8-bl-cloud"><div class="rz8-star-silver-tr"></div><div class="rz8-cloud-silver"></div><div class="rz8-dot-silver-bl"></div></div>');

        html += '<div class="wx-bubble-outer">' 
          + cloudDeco 
          + '<div class="' + bubbleClass + '" data-bubble-idx="' + globalIdx + '">' 
          + quoteHtml 
          + formattedContent 
          + heartHtml 
          + '</div></div>' 
          + tailTimeHtml;
      });

      html += '</div></div>';
    });

    body.innerHTML = html;
    body.scrollTop = body.scrollHeight;
  }

  function updateTypingUI(show) {
    var indicator = document.getElementById('wxCrTypingIndicator'), charSig = document.getElementById('wxCrCharSig'), sendBtn = document.getElementById('wxCrSendBtn');
    if (indicator && charSig) { indicator.classList.toggle('show', show); charSig.style.display = show ? 'none' : 'block'; }
    if (sendBtn) {
      sendBtn.classList.toggle('is-stop-mode', show);
      sendBtn.innerHTML = show ? '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#111111" stroke-width="2"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="#111111"/></svg>' : '<svg viewBox="0 0 64 64" fill="none"><path d="M52 12 L12 26 L30 32 L42 54 Z" fill="#2a2a2a" stroke="#2a2a2a" stroke-width="6" stroke-linejoin="round"/></svg>';
    }
  }

  // ============ 3. 真实流式 Stream 请求 (万能自适应无冲突版) ============
  function requestAIStream() {
    var cfg = getCfg(currentChatChar.id), api = getActiveApi(currentChatChar.id);
    if (!api || !api.url || !api.key) {
      chatMessages.push({ isError: true, content: '未检测到有效 API 配置，请在「设置」中配置启用', ts: Date.now() });
      saveChatMessages(currentChatChar.id);
      renderMessages();
      updateTypingUI(false);
      return;
    }

    var apiMsgs = safeBuildPayload(currentChatChar, currentChatUser, cfg, chatMessages);
    var rawApiUrl = (api.url || '').trim().replace(/\/+$/, '');
    var url = rawApiUrl;

    // 💡 万能黄金自适应拼接：绝不破坏智谱 /paas/v4，也不误伤 DeepSeek /v1
    if (!url.endsWith('/chat/completions')) {
      if (/\/v\d+$/i.test(url) || /\/paas\/v\d+/i.test(url)) {
        url = url + '/chat/completions';
      } else if (url.indexOf('/v1') !== -1 || url.indexOf('/paas') !== -1) {
        url = url + '/chat/completions';
      } else {
        url = url + '/v1/chat/completions';
      }
    }

    var params = getParams(currentChatChar.id);

    isStreaming = true;
    streamPartialText = '';
    abortCtrl = new AbortController();
    updateTypingUI(true);

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + String(api.key || '').trim() },
      body: JSON.stringify({ model: api.model, messages: apiMsgs, stream: true, temperature: params.temperature, frequency_penalty: params.freqPenalty, presence_penalty: params.presPenalty }),
      signal: abortCtrl.signal
    })
    .then(function(resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var reader = resp.body.getReader(), decoder = new TextDecoder(), buffer = '';
      function read() {
        return reader.read().then(function(result) {
          if (result.done) { onStreamDone(streamPartialText, cfg); return; }
          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n'); buffer = lines.pop() || '';
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || !line.startsWith('data:')) continue;
            var data = line.slice(5).trim();
            if (data === '[DONE]') { onStreamDone(streamPartialText, cfg); return; }
            try {
              var json = JSON.parse(data);
              var delta = json.choices && json.choices[0] && json.choices[0].delta;
              if (delta && delta.content) streamPartialText += delta.content;
            } catch(e) {}
          }
          return read();
        });
      }
      return read();
    })
    .catch(function(err) {
      isStreaming = false; updateTypingUI(false); resendingRoundGroupId = null;
      if (err.name === 'AbortError') return;
      chatMessages.push({ isError: true, content: translateError(err.message || String(err)), ts: Date.now() });
      saveChatMessages(currentChatChar.id);
      renderMessages();
    });
  }

  // 💡 终极心声先剥离、后分条入库
  function onStreamDone(text, cfg) {
    isStreaming = false; abortCtrl = null; updateTypingUI(false);
    var rawText = stripThinkingProcess(text);
    if (!rawText) return;

    var parsedGlobal = window.WxChatVoice ? window.WxChatVoice.extractGlobalVoice(rawText) : { cleanText: rawText, voiceObj: null, emotionTag: '' };
    var cleanDialogue = parsedGlobal.cleanText;

    var parts = smartSplitMessages(cleanDialogue);
    if (!parts.length) parts = [cleanDialogue || '......'];

    var now = Date.now();
    var groupId = resendingRoundGroupId || ('grp_' + now);

    var newGroupMsgs = parts.map(function(p, idx) {
      var isLast = (idx === parts.length - 1);
      return {
        role: 'assistant',
        sender: 'char',
        content: p,
        cleanContent: p,
        voiceObj: isLast ? parsedGlobal.voiceObj : null,
        emotionTag: isLast ? parsedGlobal.emotionTag : '',
        groupId: groupId,
        ts: now + idx * 800
      };
    });

    if (resendingRoundGroupId) {
      var rootIdx = -1;
      for (var i = 0; i < chatMessages.length; i++) {
        if (chatMessages[i].groupId === resendingRoundGroupId) { rootIdx = i; break; }
      }

      if (rootIdx !== -1) {
        var oldRoot = chatMessages[rootIdx];
        var groupSwipes = Array.isArray(oldRoot.groupSwipes) ? oldRoot.groupSwipes : [];
        groupSwipes.push(newGroupMsgs);

        var delCount = chatMessages.filter(function(m){ return m.groupId === resendingRoundGroupId; }).length;
        chatMessages.splice(rootIdx, delCount);

        newGroupMsgs[0].groupSwipes = groupSwipes;
        newGroupMsgs[0].groupSwipeIdx = groupSwipes.length - 1;

        for (var k = 0; k < newGroupMsgs.length; k++) {
          chatMessages.splice(rootIdx + k, 0, newGroupMsgs[k]);
        }
      } else {
        newGroupMsgs.forEach(function(m){ chatMessages.push(m); });
      }
      resendingRoundGroupId = null;
    } else {
      newGroupMsgs.forEach(function(m){ chatMessages.push(m); });
    }

    saveChatMessages(currentChatChar.id);
    renderMessages();
  }

  // ============ 4. 主动发消息 ============
  function startProactiveTimer() {
    if (_proactiveTimer) clearTimeout(_proactiveTimer);
    if (!currentChatChar || !getCfg(currentChatChar.id).proactive) return;
    _proactiveTimer = setTimeout(function() {
      if (!currentChatChar || isStreaming) { startProactiveTimer(); return; }
      var prompt = '以你的身份主动发来消息，分享你此刻当下的心境或身边所见。';
      var apiMsgs = safeBuildPayload(currentChatChar, currentChatUser, getCfg(currentChatChar.id), chatMessages);
      var api = getActiveApi(currentChatChar.id);
      if (!api || !api.url || !api.key) return;

      var rawApiUrl = (api.url || '').trim().replace(/\/+$/, '');
      var url = rawApiUrl;
      if (!url.endsWith('/chat/completions')) {
        if (/\/v\d+$/i.test(url) || /\/paas\/v\d+/i.test(url)) {
          url = url + '/chat/completions';
        } else if (url.indexOf('/v1') !== -1 || url.indexOf('/paas') !== -1) {
          url = url + '/chat/completions';
        } else {
          url = url + '/v1/chat/completions';
        }
      }

      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.key },
        body: JSON.stringify({ model: api.model, messages: apiMsgs, stream: false })
      }).then(function(r){ return r.json(); }).then(function(d){
        var content = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
        if (content) onStreamDone(content, getCfg(currentChatChar.id));
        startProactiveTimer();
      }).catch(function(){ startProactiveTimer(); });
    }, 180000);
  }

  // ============ 5. 事件交互与防退护盾 ============
  function bindChatEvents(stage) {
    function closeChatRoom() {
      if (isSendingShield) return;
      if (abortCtrl) abortCtrl.abort();
      if (_proactiveTimer) clearTimeout(_proactiveTimer);
      window._chatActiveCharId = null;
      stage.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s';
      stage.style.transform = 'translateX(100%)';
      stage.style.opacity = '0';
      setTimeout(function() { stage.remove(); }, 250);
    }

    var backBtn = stage.querySelector('#wxCrBackBtn');
    backBtn.addEventListener('click', closeChatRoom);

    var startX = 0, startY = 0, currentX = 0, isSwiping = false, isLocked = false, isHoriz = false;

    stage.addEventListener('touchstart', function(e) {
      if (e.target.closest('.chat-footer-clean, .upward-tray-overlay, .cr-expand-modal-mask, .voice-transparent-wrap, .cr-ctx-menu')) {
        isSwiping = false; currentX = 0; return;
      }
      currentX = 0; isSwiping = false; isLocked = false; isHoriz = false;
      if (e.touches[0].clientX > 45) return;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      isSwiping = true; stage.style.transition = 'none';
    }, { passive: true });

    stage.addEventListener('touchmove', function(e) {
      if (!isSwiping) return;
      var diffX = e.touches[0].clientX - startX, diffY = e.touches[0].clientY - startY;
      if (!isLocked && (Math.abs(diffX) > 5 || Math.abs(diffY) > 5)) {
        isLocked = true; isHoriz = Math.abs(diffX) > Math.abs(diffY);
      }
      if (!isHoriz) return;
      if (diffX > 0) { currentX = diffX; stage.style.transform = 'translateX(' + currentX + 'px)'; }
    }, { passive: true });

    stage.addEventListener('touchend', function() {
      if (!isSwiping || !isHoriz) { isSwiping = false; currentX = 0; return; }
      isSwiping = false;
      if (currentX > window.innerWidth * 0.28) {
        closeChatRoom();
      } else {
        stage.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
        stage.style.transform = 'translateX(0)';
      }
      currentX = 0;
    });

    if (window.WxChatVoice) {
      stage.querySelector('#wxCrCharHeadBtn').onclick = function(e) { e.stopPropagation(); window.WxChatVoice.showAllVoiceArchive(chatMessages, currentChatChar); };
      stage.querySelector('#wxCrVoicePrevBtn').onclick = function(e) { e.stopPropagation(); window.WxChatVoice.prevVoicePage(currentChatChar); };
      stage.querySelector('#wxCrVoiceNextBtn').onclick = function(e) { e.stopPropagation(); window.WxChatVoice.nextVoicePage(currentChatChar); };
      stage.querySelector('#wxCrCloseVoiceBtn').onclick = window.WxChatVoice.hideVoiceModal;
      stage.querySelector('#wxCrVoiceModalWrap').onclick = function(e) { if (e.target === this) window.WxChatVoice.hideVoiceModal(); };
    }

    // 翻页响应
    stage.addEventListener('click', function(e) {
      var swipeBtn = e.target.closest('[data-swipe-dir]');
      if (swipeBtn) {
        e.stopPropagation();
        var bar = swipeBtn.closest('.msg-swipe-nav-bar');
        if (!bar) return;
        var groupId = bar.dataset.groupId;
        var rootIdx = parseInt(bar.dataset.rootIdx, 10);
        var rootMsg = chatMessages[rootIdx];
        if (!rootMsg || !Array.isArray(rootMsg.groupSwipes) || rootMsg.groupSwipes.length <= 1) return;

        var dir = swipeBtn.dataset.swipeDir;
        var curIdx = rootMsg.groupSwipeIdx !== undefined ? rootMsg.groupSwipeIdx : rootMsg.groupSwipes.length - 1;
        var newIdx = curIdx;

        if (dir === 'prev' && curIdx > 0) newIdx = curIdx - 1;
        else if (dir === 'next' && curIdx < rootMsg.groupSwipes.length - 1) newIdx = curIdx + 1;

        if (newIdx !== curIdx) {
          var targetBranch = rootMsg.groupSwipes[newIdx];
          var allSwipes = rootMsg.groupSwipes;
          var delCount = chatMessages.filter(function(m){ return m.groupId === groupId; }).length;
          chatMessages.splice(rootIdx, delCount);

          targetBranch[0].groupSwipes = allSwipes;
          targetBranch[0].groupSwipeIdx = newIdx;

          for (var k = 0; k < targetBranch.length; k++) {
            chatMessages.splice(rootIdx + k, 0, targetBranch[k]);
          }

          saveChatMessages(currentChatChar.id);
          renderMessages();
        }
      }
    });

    stage.addEventListener('click', function(e) {
      var photoCard = e.target.closest('[data-preview-img]');
      if (photoCard && window.WxChatPhoto) { e.stopPropagation(); window.WxChatPhoto.openImageViewer(photoCard.dataset.previewImg); }
      var retryBtn = e.target.closest('[data-retry-photo]');
      if (retryBtn && window.WxChatPhoto) {
        e.stopPropagation();
        var bubbleEl = retryBtn.closest('[data-bubble-idx]');
        var targetMsg = bubbleEl ? chatMessages[parseInt(bubbleEl.dataset.bubbleIdx, 10)] : null;
        window.WxChatPhoto.clearCache(retryBtn.dataset.retryPhoto);
        window.WxChatPhoto.triggerPhotoGen(retryBtn.dataset.photoDesc, retryBtn.dataset.retryPhoto, targetMsg, getCfg(currentChatChar.id), currentChatChar, function(shouldSave) {
          if (shouldSave) saveChatMessages(currentChatChar.id);
          renderMessages();
        });
      }
      var heart = e.target.closest('[data-voice-idx]');
      if (heart && window.WxChatVoice) {
        e.stopPropagation();
        var idx = parseInt(heart.dataset.voiceIdx, 10);
        window.WxChatVoice.showSingleVoice(chatMessages[idx], currentChatChar);
      }
    });

    var plusBtn = stage.querySelector('#wxCrPlusBtn'), upwardTray = stage.querySelector('#wxCrUpwardTray');
    plusBtn.onclick = function(e) { e.stopPropagation(); plusBtn.classList.toggle('open', upwardTray.classList.toggle('show')); };
    stage.querySelector('#wxCrBody').onclick = function() { upwardTray.classList.remove('show'); plusBtn.classList.remove('open'); if (window.WxChatMenu) window.WxChatMenu.dismissCtxMenu(); };

    stage.querySelector('#wxCrMoreBtn').onclick = function(e) {
      e.stopPropagation();
      if (window.WxChatSettings) window.WxChatSettings.open(currentChatChar, function(on){ if(on) startProactiveTimer(); });
    };
    stage.querySelector('#wxCrAiImgBtn').onclick = function(e) {
      e.stopPropagation();
      if (window.WxChatBeautify) window.WxChatBeautify.open(stage, currentChatChar);
    };

    var input = stage.querySelector('#wxCrInput'), sendBtn = stage.querySelector('#wxCrSendBtn');
    
    // 💡 pushUserBubble: 回车仅推消息上屏，纸飞机按钮触发回复
    function pushUserBubble(triggerAI) {
      try {
        var text = (input.value || '').trim();
        if (text) {
          isSendingShield = true;
          setTimeout(function() { isSendingShield = false; }, 1500);

          var newMsg = { role: 'user', sender: 'user', content: text, ts: Date.now() };
          if (replyingMsg) {
            newMsg.quote = (replyingMsg.sender === 'user' ? '你' : (currentChatChar ? currentChatChar.name : 'Ta')) + ': ' + (replyingMsg.cleanContent || replyingMsg.content || '');
            replyingMsg = null;
            input.placeholder = '';
          }
          
          chatMessages.push(newMsg);
          input.value = '';
          input.style.height = '22px';
          
          if (currentChatChar) saveChatMessages(currentChatChar.id);
          renderMessages();
        }

        if (triggerAI) {
          if (isStreaming) return;
          if (sendDelayTimer) clearTimeout(sendDelayTimer);

          updateTypingUI(true);
          sendDelayTimer = setTimeout(function() {
            sendDelayTimer = null;
            try {
              requestAIStream();
            } catch(err) {
              updateTypingUI(false);
              if (window.AppNav) window.AppNav.showToast('发送失败，请重试');
            }
          }, 800);
        }
      } catch(e) {
        if (window.AppNav) window.AppNav.showToast('处理异常');
      }
    }

    sendBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (isStreaming) {
        try {
          if (abortCtrl) abortCtrl.abort();
          onStreamDone(streamPartialText, getCfg(currentChatChar.id));
        } catch(err){}
        return;
      }
      pushUserBubble(true);
    });

    sendBtn.addEventListener('touchend', function(e) {
      e.stopPropagation();
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        pushUserBubble(false);
      }
    });

    if (window.WxChatMenu) {
      window.WxChatMenu.bindContextMenuEvents(stage, {
        getMessages: function() { return chatMessages; },
        getCurrentChar: function() { return currentChatChar; },
        setReplying: function(msg) { replyingMsg = msg; input.placeholder = '回复 ' + (msg.sender === 'user' ? '自己' : currentChatChar.name) + '...'; input.focus(); },
        saveAndRender: function() { saveChatMessages(currentChatChar.id); renderMessages(); },
        triggerResend: function(targetIdx, targetMsg) {
          if (targetMsg.role === 'user' || targetMsg.sender === 'user') {
            chatMessages.splice(targetIdx);
            chatMessages.push({ role: 'user', sender: 'user', content: targetMsg.content, ts: Date.now() });
            saveChatMessages(currentChatChar.id); renderMessages(); requestAIStream();
          } else {
            var groupId = targetMsg.groupId || ('grp_' + targetMsg.ts);
            targetMsg.groupId = groupId;

            var groupMsgs = chatMessages.filter(function(m){ return m.groupId === groupId; });
            if (!groupMsgs.length) groupMsgs = [targetMsg];

            var rootMsg = groupMsgs[0];
            if (!Array.isArray(rootMsg.groupSwipes)) {
              rootMsg.groupSwipes = [JSON.parse(JSON.stringify(groupMsgs))];
              rootMsg.groupSwipeIdx = 0;
            }

            var lastIdxInGroup = -1;
            for (var i = 0; i < chatMessages.length; i++) {
              if (chatMessages[i].groupId === groupId) lastIdxInGroup = i;
            }
            if (lastIdxInGroup !== -1) chatMessages.splice(lastIdxInGroup + 1);

            resendingRoundGroupId = groupId;
            saveChatMessages(currentChatChar.id);
            requestAIStream();
          }
        }
      });
    }
  }

  // ============ 6. 纯净海量 IndexedDB 专属存储 ============
  function loadChatMessages(charId, cb) {
    function onLoaded(msgs) {
      chatMessages = (Array.isArray(msgs)) ? msgs : [];
      if (cb) cb();
    }

    if (!window.AppDB) {
      onLoaded([]);
      return;
    }

    if (!window._dbReady) {
      window.addEventListener('dbReady', function() {
        window.AppDB.get('wx_chat_msgs_' + charId, onLoaded);
      }, { once: true });
    } else {
      window.AppDB.get('wx_chat_msgs_' + charId, onLoaded);
    }
  }

  function saveChatMessages(charId) {
    if (!chatMessages || !Array.isArray(chatMessages)) return;
    if (window.AppDB) {
      window.AppDB.save('wx_chat_msgs_' + charId, chatMessages);
    }
  }

  window.WxChatRoom = { open: openChatRoom };

})();
