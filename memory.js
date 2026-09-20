
(function () {
  'use strict';

  var MEM_KEY_PREFIX = 'wx_char_memories_';
  var ARCHIVE_KEY_PREFIX = 'wx_chat_archive_';

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function esc(str) { return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }

  function getTodayDateStr(dateObj) {
    var d = dateObj || new Date();
    return d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate());
  }

  // ============ 1. 记忆存储与读取 ============
  function getCharMemories(charId) {
    try {
      return JSON.parse(localStorage.getItem(MEM_KEY_PREFIX + charId) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveCharMemories(charId, list) {
    try {
      localStorage.setItem(MEM_KEY_PREFIX + charId, JSON.stringify(list));
    } catch (e) {}
    if (window.AppDB) window.AppDB.save(MEM_KEY_PREFIX + charId, list);
  }

  // 获取注入给 AI 的精炼记忆文本（极度省 Tokens）
  function getMemoryPromptText(charId, limitCount) {
    var memories = getCharMemories(charId);
    if (!memories.length) return '';
    var count = limitCount || 7; // 默认带上最近7篇高浓度日记
    var sliceMems = memories.slice(-count);

    var parts = ['【往昔记忆日记库（你的核心经历与对User的羁绊回忆）】：'];
    sliceMems.forEach(function (m) {
      parts.push('✦ ' + m.dateStr + ' ✦');
      if (m.track) parts.push('· 行动轨迹：' + m.track);
      if (m.thoughts) parts.push('· 内心感想：' + m.thoughts);
      if (m.summary) parts.push('· 彼此共话：' + m.summary);
    });
    return parts.join('\n');
  }

  // ============ 2. 午夜 00:00 自动结清与提炼引擎 ============
  function checkAndTriggerMidnightSummary(charId, charData, userData, callback) {
    if (!charId) return;
    var rawMsgs = [];
    try {
      rawMsgs = JSON.parse(localStorage.getItem('wx_chat_msgs_' + charId) || '[]');
    } catch (e) {}

    // 过滤出有效消息
    var validMsgs = rawMsgs.filter(function (m) { return !m.isError && !m.isSystem; });
    if (validMsgs.length < 2) {
      if (callback) callback(null);
      return;
    }

    var yesterdayDateStr = getTodayDateStr(new Date(Date.now() - 3600000));
    var memories = getCharMemories(charId);
    var alreadyExists = memories.some(function (m) { return m.dateStr === yesterdayDateStr; });
    if (alreadyExists) {
      if (callback) callback(null);
      return;
    }

    // 组装发给 AI 的日记提炼 Prompt
    var charName = charData ? (charData.name || '角色') : '角色';
    var userName = userData ? (userData.name || userData.nickname || '对方') : '对方';

    var chatDigest = validMsgs.map(function (m) {
      var sender = (m.role === 'user' || m.sender === 'user') ? userName : charName;
      var txt = m.cleanContent || m.content || m.text || '';
      if (m.voiceObj) {
        txt += ' (内心独白: ' + m.voiceObj.monologue + ' | 举止: ' + m.voiceObj.action + ')';
      }
      return sender + ': ' + txt;
    }).join('\n');

    var systemPrompt = '你现在是「' + charName + '」。今天已经过去了，现在是深夜。\n'
      + '请你查看今天与「' + userName + '」的所有聊天记录和你的内心活动，在你的私人手账中写下一篇日记。\n'
      + '【输出格式规范 - 严格遵守】：\n'
      + '[行动轨迹]: 用两三句话总结你今天自己的生活行止、琐碎活动或所见所闻。\n'
      + '[内心想法]: 写下今天聊天过程中，对「' + userName + '」产生的触动、隐秘念头或值得珍藏的情愫。\n'
      + '[今日共话]: 简短概括今天你们两人主要聊了哪些事情、达成了什么约定。\n'
      + '语气要完全符合你的人设风格，真诚、细腻、富有人性。';

    var api = window.WxChatSettings ? window.WxChatSettings.getActiveApi(charId) : null;
    if (!api || !api.url || !api.key) {
      if (callback) callback(null);
      return;
    }

    fetch(api.url.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + api.key
      },
      body: JSON.stringify({
        model: api.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '【今天的所有聊天与心理活动记录】：\n' + chatDigest }
        ],
        temperature: 0.7
      })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var resContent = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content : '';
      if (!resContent) { if (callback) callback(null); return; }

      // 解析日记三栏
      var trackMatch = resContent.match(/\[行动轨迹\][:：\s]*([\s\S]*?)(?=\[内心想法\]|$)/i);
      var thoughtsMatch = resContent.match(/\[内心想法\][:：\s]*([\s\S]*?)(?=\[今日共话\]|$)/i);
      var summaryMatch = resContent.match(/\[今日共话\][:：\s]*([\s\S]*?)$/i);

      var newMem = {
        id: 'mem_' + charId + '_' + Date.now(),
        charId: charId,
        dateStr: yesterdayDateStr,
        timestamp: Date.now(),
        track: trackMatch ? trackMatch[1].trim() : '度过了平静的一天，在熟悉的轨迹中穿行。',
        thoughts: thoughtsMatch ? thoughtsMatch[1].trim() : '关于今天的对话，心中泛起许多细腻的涟漪。',
        summary: summaryMatch ? summaryMatch[1].trim() : '聊了许多日常琐事，彼此的距离似乎又更近了一步。',
        rawChatCount: validMsgs.length
      };

      // 1. 归档今日原始聊天到持久库
      var archiveKey = ARCHIVE_KEY_PREFIX + charId + '_' + yesterdayDateStr;
      try {
        localStorage.setItem(archiveKey, JSON.stringify(validMsgs));
      } catch (e) {}
      if (window.AppDB) window.AppDB.save(archiveKey, validMsgs);

      // 2. 清空实时会话，开启第二天崭新的一天（极省 Tokens）
      try {
        localStorage.setItem('wx_chat_msgs_' + charId, JSON.stringify([]));
      } catch (e) {}
      if (window.AppDB) window.AppDB.save('wx_chat_msgs_' + charId, []);

      // 3. 压入记忆日记库
      memories.push(newMem);
      saveCharMemories(charId, memories);

      if (callback) callback(newMem);
    })
    .catch(function () {
      if (callback) callback(null);
    });
  }

  // ============ 3. 高定全屏记忆手账页面渲染 ============
  function openMemoryStage(charObj, userObj) {
    var charList = [];
    try {
      charList = JSON.parse(localStorage.getItem('character_archives_list_v1') || '[]');
    } catch (e) {}

    var activeChar = charObj || charList.find(function (c) { return c.id === window._chatActiveCharId; }) || charList[0];
    if (!activeChar) {
      if (window.AppNav) window.AppNav.showToast('请先在档案中录入角色设定');
      return;
    }

    var existingStage = document.getElementById('wxMemoryStage');
    if (existingStage) existingStage.remove();

    var stage = document.createElement('div');
    stage.className = 'wx-memory-stage';
    stage.id = 'wxMemoryStage';

    stage.innerHTML = ''
      // 1. 顶栏
      + '<div class="mem-stage-header">'
      + '  <div class="mem-head-left">'
      + '    <button class="mem-native-back" id="memStageBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '    <div class="mem-title-group">'
      + '      <span class="mem-script-tag">~ Memories & Dossier ~</span>'
      + '      <h1 class="mem-main-title">' + esc(activeChar.name || 'Character') + ' · 记忆长廊</h1>'
      + '    </div>'
      + '  </div>'
      + '  <div class="mem-head-right">'
      + '    <button class="mem-trigger-summary-btn" id="memTriggerSummaryBtn" type="button" title="结清今日对话并撰写日记">'
      + '      <span class="mem-btn-icon">❆</span>'
      + '      <span>今日结清</span>'
      + '    </button>'
      + '  </div>'
      + '</div>'

      // 2. 三栏时间线画卷展示区
      + '<div class="mem-stage-body" id="memStageBody"></div>'

      // 3. 对话原始溯源抽屉
      + '<div class="mem-dialogue-drawer-mask" id="memDrawerMask"></div>'
      + '<div class="mem-dialogue-drawer" id="memDialogueDrawer">'
      + '  <div class="drawer-header-bar">'
      + '    <div class="drawer-title-col">'
      + '      <span class="drawer-sub-tag">CONVERSATION ARCHIVE</span>'
      + '      <span class="drawer-date-title" id="drawerDateTitle">往昔对话溯源</span>'
      + '    </div>'
      + '    <button class="drawer-close-btn" id="drawerCloseBtn" type="button">✕</button>'
      + '  </div>'
      + '  <div class="drawer-dialogue-list" id="drawerDialogueList"></div>'
      + '</div>';

    document.body.appendChild(stage);

    renderMemoryTimeline(stage, activeChar);
    bindStageEvents(stage, activeChar, userObj);
  }

  function renderMemoryTimeline(stage, charData) {
    var body = stage.querySelector('#memStageBody');
    if (!body) return;

    var memories = getCharMemories(charData.id);
    if (!memories.length) {
      body.innerHTML = '<div class="mem-empty-stage">'
        + '<div class="mem-empty-crystal">❆</div>'
        + '<div class="mem-empty-title">尚未凝结往昔记忆</div>'
        + '<p class="mem-empty-desc">每日子夜 00:00，角色会自动回顾一整天的交谈与心声，在手账中写下专属日记；你也可以点击右上角「今日结清」手动归档。</p>'
        + '</div>';
      return;
    }

    var html = '<div class="mem-timeline-scroll-wrap">';

    memories.slice().reverse().forEach(function (m, idx) {
      html += '<div class="mem-trinity-card" data-mem-idx="' + idx + '">'
        // 左栏：时间与活动轨迹
        + '<div class="mem-route-col left">'
        + '  <div class="mem-date-stamp">'
        + '    <span class="stamp-month-day">' + esc(m.dateStr) + '</span>'
        + '    <span class="stamp-sub-code">№ ' + pad2(memories.length - idx) + '</span>'
        + '  </div>'
        + '  <div class="mem-route-title"><span class="route-icon">✦</span> 行止与轨迹</div>'
        + '  <div class="mem-track-para">' + esc(m.track) + '</div>'
        + '</div>'

        // 中间分隔立柱
        + '<div class="mem-route-spine">'
        + '  <div class="spine-line top"></div>'
        + '  <div class="spine-gem">❆</div>'
        + '  <div class="spine-line bottom"></div>'
        + '</div>'

        // 中栏：心念独白与日记
        + '<div class="mem-route-col mid">'
        + '  <div class="mem-route-title"><span class="route-icon">☽</span> 心理想法与暗涌</div>'
        + '  <div class="mem-thought-quote">“ ' + esc(m.thoughts) + ' ”</div>'
        + '  <div class="mem-summary-box">'
        + '    <span class="summary-label">共话提要：</span>'
        + '    <span class="summary-text">' + esc(m.summary) + '</span>'
        + '  </div>'
        + '</div>'

        // 右栏：溯源归档点
        + '<div class="mem-route-col right">'
        + '  <button class="mem-archive-anchor-btn" data-archive-date="' + esc(m.dateStr) + '" data-char-id="' + esc(charData.id) + '" type="button">'
        + '    <div class="anchor-circle"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>'
        + '    <span class="anchor-label">对话溯源</span>'
        + '    <span class="anchor-count">' + (m.rawChatCount || 0) + ' 条</span>'
        + '  </button>'
        + '</div>'
        + '</div>';
    });

    html += '</div>';
    body.innerHTML = html;
  }

  function bindStageEvents(stage, charData, userObj) {
    function closeMemoryStage() {
      stage.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s';
      stage.style.transform = 'translateX(100%)';
      stage.style.opacity = '0';
      setTimeout(function () { stage.remove(); }, 250);
    }

    var backBtn = stage.querySelector('#memStageBackBtn');
    if (backBtn) backBtn.addEventListener('click', closeMemoryStage);

    // 今日手动结清
    var triggerBtn = stage.querySelector('#memTriggerSummaryBtn');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', function () {
        if (window.AppDialog) {
          window.AppDialog.confirm({
            title: '今日记忆结清',
            desc: '将把今天截至目前的所有聊天和心声提炼为一篇专属日记，并归档原始记录。确定结清吗？',
            confirmText: '结清并写日记',
            isDanger: false
          }, function () {
            if (window.AppNav) window.AppNav.showToast('正在翻看记录并撰写手账...');
            checkAndTriggerMidnightSummary(charData.id, charData, userObj, function (newMem) {
              if (newMem) {
                renderMemoryTimeline(stage, charData);
                if (window.AppNav) window.AppNav.showToast('✦ 今日记忆已成功结清入库 ✦');
              } else {
                if (window.AppNav) window.AppNav.showToast('今天暂无足够的聊天记录可供结清');
              }
            });
          });
        }
      });
    }

    // 溯源抽屉打开
    var drawer = stage.querySelector('#memDialogueDrawer');
    var drawerMask = stage.querySelector('#memDrawerMask');
    var drawerCloseBtn = stage.querySelector('#drawerCloseBtn');
    var drawerTitle = stage.querySelector('#drawerDateTitle');
    var drawerList = stage.querySelector('#drawerDialogueList');

    function closeDrawer() {
      if (drawer) drawer.classList.remove('show');
      if (drawerMask) drawerMask.classList.remove('show');
    }

    if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);
    if (drawerMask) drawerMask.addEventListener('click', closeDrawer);

    stage.addEventListener('click', function (e) {
      var anchorBtn = e.target.closest('[data-archive-date]');
      if (anchorBtn) {
        e.stopPropagation();
        var dStr = anchorBtn.dataset.archiveDate;
        var cId = anchorBtn.dataset.charId;

        var archiveKey = ARCHIVE_KEY_PREFIX + cId + '_' + dStr;
        var msgs = [];
        try {
          msgs = JSON.parse(localStorage.getItem(archiveKey) || '[]');
        } catch (err) {}

        drawerTitle.textContent = dStr + ' 原始对话溯源 (' + msgs.length + '条)';

        if (!msgs.length) {
          drawerList.innerHTML = '<div style="padding:40px 16px;text-align:center;color:#8e8e93;font-size:12px;">该日期的原始会话已精炼封存</div>';
        } else {
          drawerList.innerHTML = msgs.map(function (m) {
            var isUser = (m.role === 'user' || m.sender === 'user');
            var txt = m.cleanContent || m.content || m.text || '';
            var voiceHtml = m.voiceObj ? '<div class="drawer-voice-quote">💭 心声: ' + esc(m.voiceObj.monologue) + '</div>' : '';

            return '<div class="drawer-msg-row' + (isUser ? ' is-user' : '') + '">'
              + '  <div class="drawer-msg-bubble">'
              +      esc(txt)
              +      voiceHtml
              + '  </div>'
              + '</div>';
          }).join('');
        }

        drawer.classList.add('show');
        drawerMask.classList.add('show');
      }
    });

    // 右滑返回手势
    var startX = 0, startY = 0, currentX = 0, isSwiping = false;
    stage.addEventListener('touchstart', function (e) {
      if (e.touches[0].clientX > 45) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentX = 0;
      isSwiping = true;
      stage.style.transition = 'none';
    }, { passive: true });

    stage.addEventListener('touchmove', function (e) {
      if (!isSwiping) return;
      var diffX = e.touches[0].clientX - startX;
      var diffY = e.touches[0].clientY - startY;
      if (diffX > 0 && Math.abs(diffX) > Math.abs(diffY)) {
        currentX = diffX;
        stage.style.transform = 'translateX(' + currentX + 'px)';
      }
    }, { passive: true });

    stage.addEventListener('touchend', function () {
      if (!isSwiping) return;
      isSwiping = false;
      if (currentX > window.innerWidth * 0.28) {
        closeMemoryStage();
      } else {
        stage.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
        stage.style.transform = 'translateX(0)';
      }
    });
  }

  // ============ 4. 全局定时巡检午夜结清 ============
  function startMidnightWatcher() {
    setInterval(function () {
      var now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() < 10) {
        var charList = [];
        try {
          charList = JSON.parse(localStorage.getItem('character_archives_list_v1') || '[]');
        } catch (e) {}

        var userList = [];
        try {
          userList = JSON.parse(localStorage.getItem('user_archives_list_v3') || '[]');
        } catch (e) {}

        charList.forEach(function (c) {
          var u = userList.find(function (x) { return x.id === c.boundUserId; }) || userList[0];
          checkAndTriggerMidnightSummary(c.id, c, u, function () {});
        });
      }
    }, 10000);
  }

  startMidnightWatcher();

  window.WxChatMemory = {
    open: openMemoryStage,
    getMemories: getCharMemories,
    getPromptText: getMemoryPromptText,
    triggerSummary: checkAndTriggerMidnightSummary
  };

})();
