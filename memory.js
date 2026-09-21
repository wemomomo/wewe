
(function () {
  'use strict';

  var MEM_KEY_PREFIX = 'wx_char_memories_';
  var ARCHIVE_KEY_PREFIX = 'wx_chat_archive_';
  var USER_COGNITION_PREFIX = 'wx_user_cognition_';
  var SELF_COGNITION_PREFIX = 'wx_self_cognition_';
  var UNRESOLVED_ALERT_PREFIX = 'wx_unresolved_alerts_';

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function esc(str) { return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }

  function getTodayDateStr(dateObj) {
    var d = dateObj || new Date();
    return d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate());
  }

  // ============ 1. AppDB 安全读取当前角色 ============
  function fetchCurrentActiveChar(callback) {
    function doFetch() {
      if (!window.AppDB) {
        if (callback) callback(null);
        return;
      }
      window.AppDB.get('character_archives_list_v1', function (cList) {
        var charList = Array.isArray(cList) ? cList.filter(function (c) {
          return !c.id || !c.id.startsWith('user_');
        }) : [];

        if (!charList.length) {
          if (callback) callback(null);
          return;
        }

        if (window._chatActiveCharId) {
          var found = charList.find(function (c) { return c.id === window._chatActiveCharId; });
          if (found) { if (callback) callback(found); return; }
        }

        window.AppDB.get('character_archive_active_id_v1', function (activeCId) {
          var activeChar = null;
          if (activeCId) {
            activeChar = charList.find(function (c) { return c.id === activeCId; });
          }
          if (!activeChar) activeChar = charList[0];
          if (callback) callback(activeChar);
        });
      });
    }

    if (window._dbReady) {
      doFetch();
    } else {
      window.addEventListener('dbReady', doFetch, { once: true });
    }
  }

  // ============ 2. 结构化认知库 (User画像 + 自我心事 + 悬念雷达) ============
  function getUserCognition(charId, callback) {
    var def = {
      appearance: '',  // 形象
      personality: '', // 性格
      likes: '',       // 喜好
      dislikes: '',    // 厌恶
      habits: '',      // 习惯
      catchphrase: '', // 口头禅
      social: '',      // 人际关系
      past: '',        // 过往经历
      secrets: '',     // 秘密
      daily: '',       // 日常
      other: ''        // 其他
    };
    if (!window.AppDB) { if (callback) callback(def); return; }
    window.AppDB.get(USER_COGNITION_PREFIX + charId, function (val) {
      callback(Object.assign({}, def, val || {}));
    });
  }

  function saveUserCognition(charId, data, callback) {
    if (window.AppDB) window.AppDB.save(USER_COGNITION_PREFIX + charId, data, callback);
  }

  function getSelfCognition(charId, callback) {
    var def = {
      mood: '',      // 心境变化
      events: '',    // 重要事件
      promises: '',  // 承诺
      wishes: '',    // 想做的事
      secrets: ''    // 隐秘不方便描述
    };
    if (!window.AppDB) { if (callback) callback(def); return; }
    window.AppDB.get(SELF_COGNITION_PREFIX + charId, function (val) {
      callback(Object.assign({}, def, val || {}));
    });
  }

  function saveSelfCognition(charId, data, callback) {
    if (window.AppDB) window.AppDB.save(SELF_COGNITION_PREFIX + charId, data, callback);
  }

  function getUnresolvedAlerts(charId, callback) {
    if (!window.AppDB) { if (callback) callback([]); return; }
    window.AppDB.get(UNRESOLVED_ALERT_PREFIX + charId, function (val) {
      callback(Array.isArray(val) ? val : []);
    });
  }

  function saveUnresolvedAlerts(charId, list, callback) {
    if (window.AppDB) window.AppDB.save(UNRESOLVED_ALERT_PREFIX + charId, list, callback);
  }

  function getCharMemories(charId, callback) {
    if (!window.AppDB) { if (callback) callback([]); return; }
    window.AppDB.get(MEM_KEY_PREFIX + charId, function (val) {
      callback(Array.isArray(val) ? val : []);
    });
  }

  function saveCharMemories(charId, list, callback) {
    if (window.AppDB) window.AppDB.save(MEM_KEY_PREFIX + charId, list, callback);
  }

  // ============ 3. 【核心】记忆网关 (Memory Gateway) 上下文调度引擎 ============
  function buildGatewayPrompt(charId, callback) {
    getUserCognition(charId, function (uCog) {
      getSelfCognition(charId, function (sCog) {
        getUnresolvedAlerts(charId, function (alerts) {
          getCharMemories(charId, function (memories) {
            var parts = [];

            // A. User 画像观察日记
            var uParts = [];
            if (uCog.appearance) uParts.push('· 外在形象: ' + uCog.appearance);
            if (uCog.personality) uParts.push('· 性格特点: ' + uCog.personality);
            if (uCog.likes) uParts.push('· 偏好喜好: ' + uCog.likes);
            if (uCog.dislikes) uParts.push('· 讨厌厌恶: ' + uCog.dislikes);
            if (uCog.habits) uParts.push('· 生活习惯: ' + uCog.habits);
            if (uCog.catchphrase) uParts.push('· 常用口头禅: ' + uCog.catchphrase);
            if (uCog.social) uParts.push('· 人际关系: ' + uCog.social);
            if (uCog.past) uParts.push('· 听过的过往: ' + uCog.past);
            if (uCog.secrets) uParts.push('· 了解的秘密: ' + uCog.secrets);
            if (uCog.daily) uParts.push('· 日常近况: ' + uCog.daily);
            if (uCog.other) uParts.push('· 其他琐碎印象: ' + uCog.other);

            if (uParts.length) {
              parts.push('【我对User的观察画像与认知（根据交流随时更新）】：\n' + uParts.join('\n'));
            }

            // B. 角色自我心事簿
            var sParts = [];
            if (sCog.mood) sParts.push('· 近期心境: ' + sCog.mood);
            if (sCog.events) sParts.push('· 共同经历的里程碑: ' + sCog.events);
            if (sCog.promises) sParts.push('· 许下的承诺: ' + sCog.promises);
            if (sCog.wishes) sParts.push('· 想要一起做的事: ' + sCog.wishes);
            if (sCog.secrets) sParts.push('· 不便明说的隐秘念头: ' + sCog.secrets);

            if (sParts.length) {
              parts.push('【我自己的内心羁绊与心事】：\n' + sParts.join('\n'));
            }

            // C. 悬念与情绪警报
            if (alerts.length) {
              var activeAlerts = alerts.filter(function (a) { return !a.resolved; });
              if (activeAlerts.length) {
                var aText = activeAlerts.map(function (a) { return '· ⚠️ ' + a.text + ' (记录时间: ' + a.date + ')'; }).join('\n');
                parts.push('【悬而未决的事项与情绪反常警报（时刻挂念并寻机问候）】：\n' + aText);
              }
            }

            // D. 近期 3 篇手账日记
            if (memories.length) {
              var recentMems = memories.slice(-3);
              var mText = recentMems.map(function (m) {
                return '✦ ' + m.dateStr + ' ✦\n· 事件: ' + m.track + '\n· 心声: ' + m.thoughts + '\n· 共话: ' + m.summary;
              }).join('\n\n');
              parts.push('【近期手账回忆录】：\n' + mText);
            }

            // E. 动态感知与记忆补充指令
            parts.push('【记忆补充指令】：你在交流中需时刻敏锐关注对方。若本次聊天中对方透露了新的个人细节（喜好/习惯/秘密等）、或产生了新承诺/未决悬念，请在回复末尾附带更新指令，格式如：\n`[UPDATE_USER: 喜好 +1 喜欢抹茶冰淇淋]` 或 `[ALERT: 对方今天心情低落未解决]`');

            callback(parts.join('\n\n'));
          });
        });
      });
    });
  }

  // ============ 4. 记忆总结与认知自动更新引擎 ============
  function executeMemorySummary(charId, charData, userData, callback) {
    if (!charId || !window.AppDB) return;

    window.AppDB.get('wx_chat_msgs_' + charId, function (rawMsgs) {
      var msgs = Array.isArray(rawMsgs) ? rawMsgs : [];
      var validMsgs = msgs.filter(function (m) { return !m.isError && !m.isSystem; });

      if (validMsgs.length < 2) {
        if (callback) callback(null, '当前对话记录太少，暂不需要归纳总结哦');
        return;
      }

      var keepCount = 6;
      var toArchiveMsgs = validMsgs.slice(0, Math.max(0, validMsgs.length - keepCount));
      var bufferMsgs = validMsgs.slice(-keepCount);

      if (toArchiveMsgs.length < 2) {
        toArchiveMsgs = validMsgs.slice(0, -1);
        bufferMsgs = validMsgs.slice(-1);
      }

      var charName = charData ? (charData.name || '角色') : '角色';
      var userName = userData ? (userData.name || userData.nickname || '对方') : '对方';

      var chatDigest = toArchiveMsgs.map(function (m) {
        var sender = (m.role === 'user' || m.sender === 'user') ? userName : charName;
        var txt = m.cleanContent || m.content || m.text || '';
        if (m.voiceObj) {
          txt += ' (当时心声: ' + m.voiceObj.monologue + ' | 举止: ' + m.voiceObj.action + ')';
        }
        return sender + ': ' + txt;
      }).join('\n');

      var systemPrompt = '你现在是「' + charName + '」。请回顾你刚才与「' + userName + '」所经历的这段对话及你当时的内心活动，在你的私人手账中写下一篇高光手账日记，并同步更新你对「' + userName + '」的认知。\n'
        + '【输出格式规范 - 严格遵守】：\n'
        + '[重要事件]: 提炼总结这段时间发生的关键事件或核心话题（如无特殊大事则用一两句话简短概括）。\n'
        + '[内心想法]: 写下对话过程中，对「' + userName + '」产生的触动、真实心声暗涌或值得珍藏的念头。\n'
        + '[今日共话]: 简短概括你们两人主要聊了哪些事情、达成了什么约定或发生了什么趣事。\n'
        + '[USER新认知]: (若有新发现则填写，格式如: 喜好-喜欢抹茶; 习惯-习惯熬夜。若无则填 无)\n'
        + '[未决悬念警报]: (若对方有情绪反常、生病、或未完结的事情则填写，若无则填 无)';

      var api = window.WxChatSettings ? window.WxChatSettings.getActiveApi(charId) : null;
      if (!api || !api.url || !api.key) {
        if (callback) callback(null, '未检测到有效 API 接口，无法进行总结');
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
            { role: 'user', content: '【待归纳提炼的对话与心理记录】：\n' + chatDigest }
          ],
          temperature: 0.7
        })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var resContent = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content : '';
        if (!resContent) {
          if (callback) callback(null, '模型返回为空，归纳未完成');
          return;
        }

        var trackMatch = resContent.match(/\[重要事件\][:：\s]*([\s\S]*?)(?=\[内心想法\]|$)/i);
        var thoughtsMatch = resContent.match(/\[内心想法\][:：\s]*([\s\S]*?)(?=\[今日共话\]|$)/i);
        var summaryMatch = resContent.match(/\[今日共话\][:：\s]*([\s\S]*?)(?=\[USER新认知\]|$)/i);
        var uCogMatch = resContent.match(/\[USER新认知\][:：\s]*([\s\S]*?)(?=\[未决悬念警报\]|$)/i);
        var alertMatch = resContent.match(/\[未决悬念警报\][:：\s]*([\s\S]*?)$/i);

        // A. 自动更新 USER 认知库
        if (uCogMatch && uCogMatch[1] && uCogMatch[1].trim() !== '无') {
          getUserCognition(charId, function (uCog) {
            uCog.daily = (uCog.daily ? uCog.daily + '；' : '') + uCogMatch[1].trim();
            saveUserCognition(charId, uCog);
          });
        }

        // B. 自动更新悬念警报
        if (alertMatch && alertMatch[1] && alertMatch[1].trim() !== '无') {
          getUnresolvedAlerts(charId, function (alerts) {
            alerts.unshift({
              id: 'alt_' + Date.now(),
              date: getTodayDateStr(),
              text: alertMatch[1].trim(),
              resolved: false
            });
            saveUnresolvedAlerts(charId, alerts);
          });
        }

        var archiveKey = ARCHIVE_KEY_PREFIX + charId + '_' + Date.now();
        var newMem = {
          id: 'mem_' + charId + '_' + Date.now(),
          charId: charId,
          dateStr: getTodayDateStr(),
          timestamp: Date.now(),
          track: trackMatch ? trackMatch[1].trim() : '度过了一段平静温和的时光。',
          thoughts: thoughtsMatch ? thoughtsMatch[1].trim() : '关于刚才的交谈，心中泛起许多细腻的情感。',
          summary: summaryMatch ? summaryMatch[1].trim() : '彼此分享了生活中的点滴琐事。',
          archiveKey: archiveKey,
          rawChatCount: toArchiveMsgs.length
        };

        window.AppDB.save(archiveKey, toArchiveMsgs, function () {
          window.AppDB.save('wx_chat_msgs_' + charId, bufferMsgs, function () {
            try { localStorage.setItem('wx_chat_msgs_' + charId, JSON.stringify(bufferMsgs)); } catch(e){}
            getCharMemories(charId, function (memories) {
              memories.push(newMem);
              saveCharMemories(charId, memories, function () {
                if (callback) callback(newMem);
              });
            });
          });
        });
      })
      .catch(function (err) {
        if (callback) callback(null, '请求异常：' + (err.message || err));
      });
    });
  }

  // ============ 5. 高定全屏记忆手账长廊页面 (渲染手账书卡片) ============
  function openMemoryStage(charObj, userObj) {
    if (charObj) {
      doRenderStage(charObj, userObj);
    } else {
      fetchCurrentActiveChar(function (activeChar) {
        if (!activeChar) {
          if (window.AppNav) window.AppNav.showToast('请先在档案中录入角色设定');
          return;
        }
        doRenderStage(activeChar, userObj);
      });
    }
  }

  function doRenderStage(activeChar, userObj) {
    var existingStage = document.getElementById('wxMemoryStage');
    if (existingStage) existingStage.remove();

    var stage = document.createElement('div');
    stage.className = 'wx-memory-stage';
    stage.id = 'wxMemoryStage';

    stage.innerHTML = ''
      + '<div class="mem-stage-header">'
      + '  <div class="mem-head-left">'
      + '    <button class="mem-native-back" id="memStageBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '    <div class="mem-title-group">'
      + '      <span class="mem-script-tag">~ Memories & Dossier ~</span>'
      + '      <h1 class="mem-main-title">' + esc(activeChar.name || 'Character') + ' · 记忆长廊</h1>'
      + '    </div>'
      + '  </div>'
      + '  <div class="mem-head-right">'
      + '    <button class="mem-trigger-summary-btn" id="memTriggerSummaryBtn" type="button" title="立即总结前面对话并归纳手账">'
      + '      <span class="mem-btn-icon">❆</span>'
      + '      <span>立即归纳</span>'
      + '    </button>'
      + '  </div>'
      + '</div>'

      + '<div class="mem-stage-body" id="memStageBody"></div>'

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

    getCharMemories(charData.id, function (memories) {
      if (!memories.length) {
        body.innerHTML = '<div class="mem-empty-stage">'
          + '<div class="mem-empty-crystal">❆</div>'
          + '<div class="mem-empty-title">尚未凝结往昔记忆</div>'
          + '<p class="mem-empty-desc">记忆由角色与你共同书写。平日交谈不受阻隔；随时点击右上角「立即归纳」，角色便会将此前对话凝炼为三栏手账，长久珍藏。</p>'
          + '</div>';
        return;
      }

      var html = '<div class="mem-timeline-scroll-wrap">';

      memories.slice().reverse().forEach(function (m, idx) {
        html += '<div class="snow-blue-ribbon-book" data-mem-idx="' + idx + '">'
          // 1. 左侧书页：日期与事件
          + '<div class="binder-page left">'
          + '  <div class="page-hole-col top">'
          + '    <div class="hole-dot"></div><div class="hole-dot"></div><div class="hole-dot"></div>'
          + '  </div>'
          + '  <div class="page-hole-col bottom">'
          + '    <div class="hole-dot"></div><div class="hole-dot"></div><div class="hole-dot"></div>'
          + '  </div>'
          + '  <div class="book-page-content">'
          + '    <div class="book-header-row">'
          + '      <span class="book-date-pill">' + esc(m.dateStr) + '</span>'
          + '      <span class="book-serial-tag">№ ' + pad2(memories.length - idx) + '</span>'
          + '    </div>'
          + '    <div class="book-track-text"><span class="track-tag">事件 · </span>' + esc(m.track) + '</div>'
          + '    <div class="book-foot-code">RECORD // L</div>'
          + '  </div>'
          + '</div>'

          // 2. 中脊穿透交叉白丝带
          + '<div class="binder-spine-area">'
          + '  <div class="spine-line"></div>'
          + '  <div class="ribbon-cluster top">'
          + '    <div class="ribbon-bar cross-a"></div>'
          + '    <div class="ribbon-bar cross-b"></div>'
          + '    <div class="ribbon-bar straight"></div>'
          + '  </div>'
          + '  <div class="ribbon-cluster bottom">'
          + '    <div class="ribbon-bar straight"></div>'
          + '    <div class="ribbon-bar cross-a"></div>'
          + '    <div class="ribbon-bar cross-b"></div>'
          + '  </div>'
          + '</div>'

          // 3. 右侧书页：心声独白与溯源
          + '<div class="binder-page right">'
          + '  <div class="page-hole-col top">'
          + '    <div class="hole-dot"></div><div class="hole-dot"></div><div class="hole-dot"></div>'
          + '  </div>'
          + '  <div class="page-hole-col bottom">'
          + '    <div class="hole-dot"></div><div class="hole-dot"></div><div class="hole-dot"></div>'
          + '  </div>'
          + '  <div class="book-page-content">'
          + '    <div class="book-thought-quote">“ ' + esc(m.thoughts) + ' ”</div>'
          + '    <div class="book-bottom-deck">'
          + '      <span class="book-summary-sub">共话：' + esc(m.summary) + '</span>'
          + '      <button class="mem-archive-anchor-btn" data-archive-key="' + esc(m.archiveKey || '') + '" data-mem-date="' + esc(m.dateStr) + '" type="button">溯源 ➔</button>'
          + '    </div>'
          + '  </div>'
          + '</div>'
          + '</div>';
      });

      html += '</div>';
      body.innerHTML = html;
    });
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

    var triggerBtn = stage.querySelector('#memTriggerSummaryBtn');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', function () {
        if (window.AppDialog) {
          window.AppDialog.confirm({
            title: '立即归纳记忆',
            desc: '角色将回顾前面积累的所有交谈与内心暗涌，精炼成一篇专属手账书，并归档原始记录。确定归纳吗？',
            confirmText: '开始归纳',
            isDanger: false
          }, function () {
            if (window.AppNav) window.AppNav.showToast('角色正在静心回想并撰写手账...');
            executeMemorySummary(charData.id, charData, userObj, function (newMem, errMsg) {
              if (newMem) {
                renderMemoryTimeline(stage, charData);
                if (window.AppNav) window.AppNav.showToast('✦ 回忆已化为手账凝结在长廊中 ✦');
              } else {
                if (window.AppNav) window.AppNav.showToast(errMsg || '归纳未能完成');
              }
            });
          });
        }
      });
    }

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
      var anchorBtn = e.target.closest('[data-archive-key]');
      if (anchorBtn) {
        e.stopPropagation();
        var archKey = anchorBtn.dataset.archiveKey;
        var dateStr = anchorBtn.dataset.memDate;

        if (!archKey || !window.AppDB) {
          if (window.AppNav) window.AppNav.showToast('该条记录暂无详细对话镜像');
          return;
        }

        window.AppDB.get(archKey, function (val) {
          var msgs = Array.isArray(val) ? val : [];
          drawerTitle.textContent = (dateStr || '往昔') + ' 对话溯源 (' + msgs.length + '条)';

          if (!msgs.length) {
            drawerList.innerHTML = '<div style="padding:40px 16px;text-align:center;color:#8e8e93;font-size:12px;">该篇手账对应的详细会话已精炼封存</div>';
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
        });
      }
    });

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

  window.WxChatMemory = {
    open: openMemoryStage,
    getMemories: getCharMemories,
    getGatewayPrompt: buildGatewayPrompt,
    triggerSummary: executeMemorySummary,
    getUserCognition: getUserCognition,
    saveUserCognition: saveUserCognition,
    getSelfCognition: getSelfCognition,
    saveSelfCognition: saveSelfCognition,
    getAlerts: getUnresolvedAlerts,
    saveAlerts: saveUnresolvedAlerts
  };

})();
