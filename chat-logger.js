(function () {
  'use strict';

  var MAX_LOGS = 30; // 每个角色保留最近 30 条核心交互日志，避免占用手机内存

  function getLogKey(charId) {
    return 'wx_chat_logs_' + (charId || 'default');
  }

  function getLogs(charId) {
    try {
      return JSON.parse(localStorage.getItem(getLogKey(charId)) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveLogs(charId, list) {
    try {
      localStorage.setItem(getLogKey(charId), JSON.stringify(list.slice(0, MAX_LOGS)));
    } catch (e) {}
    if (window.AppDB) window.AppDB.save(getLogKey(charId), list.slice(0, MAX_LOGS));
  }

  // 粗略估算 Token
  function estimateTokens(text) {
    if (!text) return 0;
    var str = String(text);
    var zh = (str.match(/[\u4e00-\u9fa5]/g) || []).length;
    var en = str.length - zh;
    return Math.ceil(zh * 1.3 + en * 0.3);
  }

  // 开始记录单次请求
  function recordRequest(data) {
    var charId = data.charId || 'default';
    var logs = getLogs(charId);
    var now = new Date();
    var timeStr = (now.getMonth() + 1) + '/' + now.getDate() + ' ' + 
                  (now.getHours() < 10 ? '0' : '') + now.getHours() + ':' + 
                  (now.getMinutes() < 10 ? '0' : '') + now.getMinutes() + ':' + 
                  (now.getSeconds() < 10 ? '0' : '') + now.getSeconds();

    var logId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    // 计算发出的全部 token 估算
    var promptTokens = 0;
    if (Array.isArray(data.messages)) {
      data.messages.forEach(function(m) {
        promptTokens += estimateTokens(m.content);
      });
    }

    var newEntry = {
      id: logId,
      timeStr: timeStr,
      timestamp: Date.now(),
      charId: charId,
      charName: data.charName || '角色',
      model: data.model || '未知模型',
      status: 'pending', // 'pending' | 'success' | 'error'
      temperature: data.temperature,
      historyCount: (data.messages ? data.messages.length - 1 : 0),
      promptTokens: promptTokens,
      completionTokens: 0,
      systemPrompt: data.systemPrompt || '',
      messages: data.messages || [],
      rawResponse: '',
      errorMsg: ''
    };

    logs.unshift(newEntry);
    saveLogs(charId, logs);
    return logId;
  }

  // 记录响应结果
  function recordResponse(charId, logId, res) {
    var logs = getLogs(charId);
    var item = logs.find(function(l) { return l.id === logId; });
    if (!item) return;

    item.status = res.isError ? 'error' : 'success';
    item.rawResponse = res.rawText || '';
    item.errorMsg = res.errorMsg || '';
    item.completionTokens = estimateTokens(res.rawText || '');
    item.durationMs = Date.now() - item.timestamp;

    saveLogs(charId, logs);
  }

  function clearLogs(charId) {
    saveLogs(charId, []);
  }

  function esc(str) {
    return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
  }

  // 渲染在悬浮球面板中
  function renderPortalView(container, activeCharId) {
    var charList = [];
    try {
      charList = JSON.parse(localStorage.getItem('character_archives_list_v1') || '[]');
    } catch (e) {}
    var curCharId = activeCharId || window._chatActiveCharId || (charList.length ? charList[0].id : 'default');
    var curChar = charList.find(function(c) { return c.id === curCharId; }) || { name: '角色' };
    var logs = getLogs(curCharId);

    var topBarHtml = '<div class="logger-ctrl-bar">'
      + '  <span class="logger-stat-badge">共记录 ' + logs.length + ' 次对话</span>'
      + '  <button class="logger-clear-btn" id="btnClearChatLogs" type="button">清空日志</button>'
      + '</div>';

    if (!logs.length) {
      container.innerHTML = topBarHtml + '<div class="mem-empty-box"><span>✦ 暂无「' + esc(curChar.name) + '」的交互日志 ✦</span></div>';
      bindClearEvent(container, curCharId);
      return;
    }

    var listHtml = logs.map(function(item, idx) {
      var isSuccess = item.status === 'success';
      var isError = item.status === 'error';
      var statusBadge = isSuccess 
        ? '<span class="log-tag-status success">成功 · ' + (item.durationMs ? (item.durationMs / 1000).toFixed(1) + 's' : '') + '</span>'
        : (isError ? '<span class="log-tag-status error">失败</span>' : '<span class="log-tag-status pending">流式传输中...</span>');

      var totalTokens = (item.promptTokens || 0) + (item.completionTokens || 0);

      // 上下文消息预览
      var msgsPreview = '';
      if (Array.isArray(item.messages)) {
        msgsPreview = item.messages.map(function(m) {
          var roleName = m.role === 'system' ? '系统设定 (System)' : (m.role === 'user' ? '用户 (User)' : '角色 (Assistant)');
          return '<div class="log-msg-item">'
            + '<span class="log-msg-role">' + roleName + ':</span>'
            + '<div class="log-msg-body">' + esc(m.content) + '</div>'
            + '</div>';
        }).join('');
      }

      return '<div class="log-record-card" data-log-idx="' + idx + '">'
        + '  <div class="log-card-header">'
        + '    <div class="log-head-left">'
        + '      <span class="log-time-badge">' + esc(item.timeStr) + '</span>'
        + '      <span class="log-model-name">' + esc(item.model) + '</span>'
        + '    </div>'
        + '    <div class="log-head-right">'
        +        statusBadge
        + '      <span class="log-token-count">~' + totalTokens + ' Tokens</span>'
        + '    </div>'
        + '  </div>'
        + '  <div class="log-detail-drawer">'
        + (item.errorMsg ? '<div class="log-error-box">⚠️ 报错信息：' + esc(item.errorMsg) + '</div>' : '')
        + '    <div class="log-sec-title">📥 原始模型回复 (Raw Response)：</div>'
        + '    <div class="log-code-box">' + esc(item.rawResponse || '(暂无返回)') + '</div>'
        + '    <div class="log-sec-title">📤 完整发送上下文 (Context · ' + (item.messages ? item.messages.length : 0) + ' 条)：</div>'
        + '    <div class="log-msgs-scroll">' + msgsPreview + '</div>'
        + '  </div>'
        + '</div>';
    }).join('');

    container.innerHTML = topBarHtml + listHtml;
    bindClearEvent(container, curCharId);

    // 折叠展开交互
    container.querySelectorAll('.log-record-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('.logger-clear-btn')) return;
        this.classList.toggle('expanded');
      });
    });
  }

  function bindClearEvent(container, charId) {
    var btn = container.querySelector('#btnClearChatLogs');
    if (btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.AppDialog) {
          window.AppDialog.confirm({
            title: '清空日志',
            desc: '确定清空当前角色的所有交互记录吗？',
            confirmText: '清空',
            isDanger: true
          }, function() {
            clearLogs(charId);
            renderPortalView(container, charId);
            if (window.AppNav) window.AppNav.showToast('日志已清空');
          });
        }
      });
    }
  }

  window.ChatLogger = {
    logRequest: recordRequest,
    logResponse: recordResponse,
    getLogs: getLogs,
    clearLogs: clearLogs,
    renderPortalView: renderPortalView
  };

})();
