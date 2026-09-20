(function () {
  'use strict';

  var MAX_LOGS = 50;

  function esc(str) {
    return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
  }

  function getLogKey(charId) {
    return 'wx_chat_logs_' + (charId || 'default');
  }

  // 纯 AppDB (IndexedDB) 查找激活角色
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

  // 纯 AppDB 读取与持久化日志
  function getLogs(charId, callback) {
    if (!window.AppDB) {
      if (callback) callback([]);
      return;
    }
    window.AppDB.get(getLogKey(charId), function (val) {
      var list = Array.isArray(val) ? val : [];
      if (callback) callback(list);
    });
  }

  function saveLogs(charId, list, callback) {
    if (window.AppDB) {
      window.AppDB.save(getLogKey(charId), list.slice(0, MAX_LOGS), callback);
    } else {
      if (callback) callback();
    }
  }

  function estimateTokens(text) {
    if (!text) return 0;
    var str = String(text);
    var zh = (str.match(/[\u4e00-\u9fa5]/g) || []).length;
    var en = str.length - zh;
    return Math.ceil(zh * 1.3 + en * 0.3);
  }

  // 净化后台技术规则与切分指令，呈现真实纯净对话
  function sanitizePrompt(text) {
    if (!text || typeof text !== 'string') return '';
    var str = text;
    str = str.replace(/【回复条数与切分铁律[\s\S]*?(?=\n\n|$)/g, '');
    str = str.replace(/输出格式：\s*\[心声:[\s\S]*?\]/g, '');
    str = str.replace(/格式要求：独立输出一条[\s\S]*?\]/g, '');
    str = str.replace(/各条消息之间务必使用[\s\S]*?分隔[。！\n]?/g, '');
    str = str.replace(/\|\|\|/g, '');
    return str.trim();
  }

  // ============ 1. 日志记录核心 ============
  function recordRequest(data) {
    var charId = data.charId || 'default';
    var now = new Date();
    var timeStr = (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + 
                  (now.getHours() < 10 ? '0' : '') + now.getHours() + ':' + 
                  (now.getMinutes() < 10 ? '0' : '') + now.getMinutes() + ':' + 
                  (now.getSeconds() < 10 ? '0' : '') + now.getSeconds();

    var logId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    var promptTokens = 0;
    var cleanMsgs = [];
    if (Array.isArray(data.messages)) {
      data.messages.forEach(function(m) {
        var cleanContent = sanitizePrompt(m.content);
        promptTokens += estimateTokens(cleanContent);
        cleanMsgs.push({
          role: m.role,
          content: cleanContent
        });
      });
    }

    var newEntry = {
      id: logId,
      timeStr: timeStr,
      timestamp: Date.now(),
      charId: charId,
      charName: data.charName || '角色',
      model: data.model || '默认模型',
      status: 'pending',
      temperature: data.temperature !== undefined ? data.temperature : 0.85,
      promptTokens: promptTokens,
      completionTokens: 0,
      systemPrompt: cleanMsgs[0] ? cleanMsgs[0].content : '',
      messages: cleanMsgs,
      rawResponse: '',
      errorMsg: '',
      durationMs: 0
    };

    getLogs(charId, function(logs) {
      logs.unshift(newEntry);
      saveLogs(charId, logs);
    });

    return logId;
  }

  function recordResponse(charId, logId, res) {
    getLogs(charId, function(logs) {
      var item = logs.find(function(l) { return l.id === logId; });
      if (!item) return;

      item.status = res.isError ? 'error' : 'success';
      item.rawResponse = res.rawText || '';
      item.errorMsg = res.errorMsg || '';
      item.completionTokens = estimateTokens(res.rawText || '');
      item.durationMs = Date.now() - item.timestamp;

      saveLogs(charId, logs);
    });
  }

  function clearLogs(charId, callback) {
    saveLogs(charId, [], callback);
  }

  // ============ 2. 全屏独立日志页面渲染 ============
  function openLoggerStage(charObj) {
    if (charObj) {
      doRenderLoggerStage(charObj);
    } else {
      fetchCurrentActiveChar(function (activeChar) {
        if (!activeChar) {
          if (window.AppNav) window.AppNav.showToast('请先在档案中录入角色设定');
          return;
        }
        doRenderLoggerStage(activeChar);
      });
    }
  }

  function doRenderLoggerStage(activeChar) {
    var existingStage = document.getElementById('wxLoggerStage');
    if (existingStage) existingStage.remove();

    var stage = document.createElement('div');
    stage.className = 'wx-logger-stage';
    stage.id = 'wxLoggerStage';

    stage.innerHTML = ''
      + '<div class="logger-stage-header">'
      + '  <div class="logger-head-left">'
      + '    <button class="logger-native-back" id="loggerStageBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '    <div class="logger-title-group">'
      + '      <span class="logger-script-tag">~ System Inspector & Logs ~</span>'
      + '      <h1 class="logger-main-title">' + esc(activeChar.name || 'Character') + ' · 交互日志</h1>'
      + '    </div>'
      + '  </div>'
      + '  <div class="logger-head-right">'
      + '    <button class="logger-clear-pill-btn" id="loggerStageClearBtn" type="button" title="清空全部日志">'
      + '      <span>清空记录</span>'
      + '    </button>'
      + '  </div>'
      + '</div>'
      + '<div class="logger-stage-body" id="loggerStageBody"></div>';

    document.body.appendChild(stage);

    renderLoggerList(stage, activeChar);
    bindStageEvents(stage, activeChar);
  }

  function renderLoggerList(stage, charData) {
    var body = stage.querySelector('#loggerStageBody');
    if (!body) return;

    getLogs(charData.id, function(logs) {
      if (!logs.length) {
        body.innerHTML = '<div class="logger-empty-stage">'
          + '<div class="logger-empty-icon">📜</div>'
          + '<div class="logger-empty-title">暂无交互日志</div>'
          + '<p class="logger-empty-desc">当你与「' + esc(charData.name) + '」交谈时，系统发出的完整上下文、AI原始回复及 Token 消耗都会清晰记录在此处。</p>'
          + '</div>';
        return;
      }

      var html = '<div class="logger-feed-wrap">';

      logs.forEach(function (item, idx) {
        var isSuccess = item.status === 'success';
        var isError = item.status === 'error';
        var statusBadge = isSuccess 
          ? '<span class="logger-status-tag success">成功 · ' + (item.durationMs ? (item.durationMs / 1000).toFixed(1) + 's' : '0.0s') + '</span>'
          : (isError ? '<span class="logger-status-tag error">失败</span>' : '<span class="logger-status-tag pending">传输中...</span>');

        var totalTokens = (item.promptTokens || 0) + (item.completionTokens || 0);

        var msgsHtml = '';
        if (Array.isArray(item.messages)) {
          msgsHtml = item.messages.map(function(m) {
            var roleCls = m.role === 'system' ? 'system' : (m.role === 'user' ? 'user' : 'assistant');
            var roleName = m.role === 'system' ? '系统设定 (System)' : (m.role === 'user' ? '用户 (User)' : '角色 (Assistant)');
            return '<div class="log-dialogue-item ' + roleCls + '">'
              + '<div class="log-role-label">' + roleName + '</div>'
              + '<div class="log-bubble-content">' + esc(m.content) + '</div>'
              + '</div>';
          }).join('');
        }

        html += '<div class="logger-card-item' + (idx === 0 ? ' expanded' : '') + '" data-log-idx="' + idx + '">'
          + '  <div class="logger-card-header">'
          + '    <div class="logger-card-meta-left">'
          + '      <span class="logger-time-stamp">' + esc(item.timeStr) + '</span>'
          + '      <span class="logger-model-pill">' + esc(item.model) + '</span>'
          + '    </div>'
          + '    <div class="logger-card-meta-right">'
          +        statusBadge
          + '      <span class="logger-tokens-badge">~' + totalTokens + ' Tokens</span>'
          + '      <span class="logger-chevron">▾</span>'
          + '    </div>'
          + '  </div>'
          + '  <div class="logger-card-details">'
          + (item.errorMsg ? '<div class="logger-error-banner">⚠️ 报错信息：' + esc(item.errorMsg) + '</div>' : '')
          + '    <div class="logger-detail-section">'
          + '      <div class="logger-sec-label">📥 原始模型回复 (Raw Response)</div>'
          + '      <div class="logger-code-terminal">' + esc(item.rawResponse || '(暂无返回或仍在生成中)') + '</div>'
          + '    </div>'
          + '    <div class="logger-detail-section">'
          + '      <div class="logger-sec-label">📤 完整发送上下文 (Context · ' + (item.messages ? item.messages.length : 0) + ' 条)</div>'
          + '      <div class="logger-context-feed">' + msgsHtml + '</div>'
          + '    </div>'
          + '  </div>'
          + '</div>';
      });

      html += '</div>';
      body.innerHTML = html;
    });
  }

  function bindStageEvents(stage, charData) {
    function closeLoggerStage() {
      stage.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s';
      stage.style.transform = 'translateX(100%)';
      stage.style.opacity = '0';
      setTimeout(function () { stage.remove(); }, 250);
    }

    var backBtn = stage.querySelector('#loggerStageBackBtn');
    if (backBtn) backBtn.addEventListener('click', closeLoggerStage);

    var clearBtn = stage.querySelector('#loggerStageClearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (window.AppDialog) {
          window.AppDialog.confirm({
            title: '清空交互日志',
            desc: '确定清空当前角色的所有交互记录吗？',
            confirmText: '清空',
            isDanger: true
          }, function () {
            clearLogs(charData.id, function() {
              renderLoggerList(stage, charData);
              if (window.AppNav) window.AppNav.showToast('日志已清空');
            });
          });
        }
      });
    }

    stage.addEventListener('click', function (e) {
      var head = e.target.closest('.logger-card-header');
      if (head) {
        var card = head.closest('.logger-card-item');
        if (card) card.classList.toggle('expanded');
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
        closeLoggerStage();
      } else {
        stage.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
        stage.style.transform = 'translateX(0)';
      }
    });
  }

  window.WxLogger = {
    open: openLoggerStage,
    logRequest: recordRequest,
    logResponse: recordResponse,
    getLogs: getLogs,
    clearLogs: clearLogs
  };

  window.ChatLogger = window.WxLogger;

})();