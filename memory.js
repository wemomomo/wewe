
(function () {
  'use strict';

  var MEM_KEY_PREFIX = 'wx_char_memories_';
  var ARCHIVE_KEY_PREFIX = 'wx_chat_archive_';
  var MEM_CONFIG_KEY_PREFIX = 'wx_char_mem_cfg_';

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function esc(str) { return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }

  function getTodayDateStr(dateObj) {
    var d = dateObj || new Date();
    return d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate());
  }

  // ============ 核心：从 AppDB 获取当前激活的角色 ============
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

  // ============ 1. 记忆配置与手账存储 (纯 AppDB) ============
  function getMemoryConfig(charId, callback) {
    var def = {
      autoSummary: true,      // 角色自主感知总结
      thresholdTurns: 30,     // 轮数阈值自动提醒总结
      keepRecentTurns: 3      // 总结后保留最后多少轮作为过渡缓冲
    };
    if (!window.AppDB) { if (callback) callback(def); return; }
    window.AppDB.get(MEM_CONFIG_KEY_PREFIX + charId, function (val) {
      if (val && typeof val === 'object') {
        if (callback) callback(Object.assign({}, def, val));
      } else {
        if (callback) callback(def);
      }
    });
  }

  function saveMemoryConfig(charId, cfg, callback) {
    if (window.AppDB) {
      window.AppDB.save(MEM_CONFIG_KEY_PREFIX + charId, cfg, callback);
    } else {
      if (callback) callback();
    }
  }

  function getCharMemories(charId, callback) {
    if (!window.AppDB) {
      if (callback) callback([]);
      return;
    }
    window.AppDB.get(MEM_KEY_PREFIX + charId, function (val) {
      var list = Array.isArray(val) ? val : [];
      if (callback) callback(list);
    });
  }

  function saveCharMemories(charId, list, callback) {
    if (window.AppDB) {
      window.AppDB.save(MEM_KEY_PREFIX + charId, list, callback);
    } else {
      if (callback) callback();
    }
  }

  // 获取注入给 AI 的精炼记忆文本（近期高浓度日记库）
  function getMemoryPromptText(charId, limitCount, callback) {
    getCharMemories(charId, function (memories) {
      if (!memories.length) {
        if (callback) callback('');
        return;
      }
      var count = limitCount || 5;
      var sliceMems = memories.slice(-count);

      var parts = ['【往昔手账日记（你此前总结的核心回忆与对User的情感印记）】：'];
      sliceMems.forEach(function (m) {
        parts.push('✦ ' + m.dateStr + ' ✦');
        if (m.track) parts.push('· 行动轨迹：' + m.track);
        if (m.thoughts) parts.push('· 内心感想：' + m.thoughts);
        if (m.summary) parts.push('· 共话回响：' + m.summary);
      });
      if (callback) callback(parts.join('\n'));
    });
  }

  // ============ 2. 核心：即时归纳与记忆结晶引擎 ============
  function executeMemorySummary(charId, charData, userData, callback) {
    if (!charId || !window.AppDB) return;

    window.AppDB.get('wx_chat_msgs_' + charId, function (rawMsgs) {
      var msgs = Array.isArray(rawMsgs) ? rawMsgs : [];
      var validMsgs = msgs.filter(function (m) { return !m.isError && !m.isSystem; });

      if (validMsgs.length < 2) {
        if (callback) callback(null, '当前对话记录太少，暂不需要归纳总结哦');
        return;
      }

      getMemoryConfig(charId, function (memCfg) {
        var keepCount = memCfg.keepRecentTurns ? memCfg.keepRecentTurns * 2 : 6;
        var toArchiveMsgs = validMsgs.slice(0, Math.max(0, validMsgs.length - keepCount));
        var bufferMsgs = validMsgs.slice(-keepCount);

        // 如果可归档的消息过少，就把除最后一条外的全部归纳
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

        var systemPrompt = '你现在是「' + charName + '」。请回顾你刚才与「' + userName + '」所经历的这段对话及你当时的内心活动，在你的私人手账中写下一篇手账日记。\n'
          + '【输出格式规范 - 严格遵守】：\n'
          + '[行动轨迹]: 用两三句话总结你这段时间自己的生活行止、琐碎活动或所见所闻（如无特殊事件则简短平实记录）。\n'
          + '[内心想法]: 写下对话过程中，对「' + userName + '」产生的触动、真实心声暗涌或值得珍藏的念头。\n'
          + '[今日共话]: 简短概括你们两人主要聊了哪些事情、达成了什么约定或发生了什么趣事。\n'
          + '语气要完全符合你的人设风格，真诚、细腻、富有人性。';

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

          var trackMatch = resContent.match(/\[行动轨迹\][:：\s]*([\s\S]*?)(?=\[内心想法\]|$)/i);
          var thoughtsMatch = resContent.match(/\[内心想法\][:：\s]*([\s\S]*?)(?=\[今日共话\]|$)/i);
          var summaryMatch = resContent.match(/\[今日共话\][:：\s]*([\s\S]*?)$/i);

          var archiveKey = ARCHIVE_KEY_PREFIX + charId + '_' + Date.now();
          var newMem = {
            id: 'mem_' + charId + '_' + Date.now(),
            charId: charId,
            dateStr: getTodayDateStr(),
            timestamp: Date.now(),
            track: trackMatch ? trackMatch[1].trim() : '度过了平淡而熟悉的一段时光。',
            thoughts: thoughtsMatch ? thoughtsMatch[1].trim() : '关于刚才的交谈，心中泛起许多细腻的情感。',
            summary: summaryMatch ? summaryMatch[1].trim() : '彼此分享了生活中的点滴琐事。',
            archiveKey: archiveKey,
            rawChatCount: toArchiveMsgs.length
          };

          // 1. 将本次提炼的详细记录单独存入归档区（供溯源）
          window.AppDB.save(archiveKey, toArchiveMsgs, function () {
            // 2. 实时会话只保留最后几条作为过渡缓冲（极省 Tokens 且对话不卡顿断片）
            window.AppDB.save('wx_chat_msgs_' + charId, bufferMsgs, function () {
              try { localStorage.setItem('wx_chat_msgs_' + charId, JSON.stringify(bufferMsgs)); } catch(e){}
              // 3. 追加进记忆手账库
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
    });
  }

  // ============ 3. 对话轮数监控与提醒 ============
  function checkTurnThreshold(charId) {
    if (!charId || !window.AppDB) return;
    getMemoryConfig(charId, function (memCfg) {
      if (!memCfg.thresholdTurns || memCfg.thresholdTurns <= 0) return;
      window.AppDB.get('wx_chat_msgs_' + charId, function (rawMsgs) {
        var msgs = Array.isArray(rawMsgs) ? rawMsgs : [];
        var validMsgs = msgs.filter(function (m) { return !m.isError && !m.isSystem; });
        // 当积攒的消息达到设定轮数（一问一答为2条）
        if (validMsgs.length >= memCfg.thresholdTurns * 2) {
          if (window.AppNav) {
            window.AppNav.showToast('✦ 累积对话已达' + memCfg.thresholdTurns + '轮，可前往记忆长廊归纳手账 ✦');
          }
        }
      });
    });
  }

  // ============ 4. 高定全屏记忆手账长廊页面 ============
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
        html += '<div class="mem-trinity-card" data-mem-idx="' + idx + '">'
          + '<div class="mem-route-col left">'
          + '  <div class="mem-date-stamp">'
          + '    <span class="stamp-month-day">' + esc(m.dateStr) + '</span>'
          + '    <span class="stamp-sub-code">№ ' + pad2(memories.length - idx) + '</span>'
          + '  </div>'
          + '  <div class="mem-route-title"><span class="route-icon">✦</span> 行止与轨迹</div>'
          + '  <div class="mem-track-para">' + esc(m.track) + '</div>'
          + '</div>'

          + '<div class="mem-route-spine">'
          + '  <div class="spine-line top"></div>'
          + '  <div class="spine-gem">❆</div>'
          + '  <div class="spine-line bottom"></div>'
          + '</div>'

          + '<div class="mem-route-col mid">'
          + '  <div class="mem-route-title"><span class="route-icon">☽</span> 心理想法与暗涌</div>'
          + '  <div class="mem-thought-quote">“ ' + esc(m.thoughts) + ' ”</div>'
          + '  <div class="mem-summary-box">'
          + '    <span class="summary-label">共话回响：</span>'
          + '    <span class="summary-text">' + esc(m.summary) + '</span>'
          + '  </div>'
          + '</div>'

          + '<div class="mem-route-col right">'
          + '  <button class="mem-archive-anchor-btn" data-archive-key="' + esc(m.archiveKey || '') + '" data-mem-date="' + esc(m.dateStr) + '" type="button">'
          + '    <div class="anchor-circle"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>'
          + '    <span class="anchor-label">对话溯源</span>'
          + '    <span class="anchor-count">' + (m.rawChatCount || 0) + ' 条</span>'
          + '  </button>'
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

    // 立即归纳
    var triggerBtn = stage.querySelector('#memTriggerSummaryBtn');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', function () {
        if (window.AppDialog) {
          window.AppDialog.confirm({
            title: '立即归纳记忆',
            desc: '角色将回顾前面积累的所有交谈与内心暗涌，精炼成一篇专属三栏手账，并归档原始记录。确定归纳吗？',
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

    // 溯源抽屉
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

  window.WxChatMemory = {
    open: openMemoryStage,
    getMemories: getCharMemories,
    getPromptText: getMemoryPromptText,
    triggerSummary: executeMemorySummary,
    checkTurns: checkTurnThreshold,
    getConfig: getMemoryConfig,
    saveConfig: saveMemoryConfig
  };

})();
