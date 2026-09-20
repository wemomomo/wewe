
(function () {
  'use strict';

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function esc(str) { return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }

  function getDateKey(ts) {
    var d = new Date(ts || Date.now());
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // ============ 1. 轻量高精度向量语义距离计算引擎 (Cosine Similarity) ============
  // 将文本转化为多维语义特征向量（支持字符级 N-gram + 语义特征哈希），无需外部依赖，毫秒级比对
  function textToVector(text) {
    var clean = (text || '').toLowerCase().replace(/[\s\p{P}]/gu, '');
    var vec = {};
    if (!clean) return vec;

    // 1-gram & 2-gram 语义特征捕获
    for (var i = 0; i < clean.length; i++) {
      var c1 = clean[i];
      vec[c1] = (vec[c1] || 0) + 1;
      if (i < clean.length - 1) {
        var c2 = clean.slice(i, i + 2);
        vec[c2] = (vec[c2] || 0) + 1.5;
      }
    }
    return vec;
  }

  function cosineSimilarity(vecA, vecB) {
    var dot = 0;
    var mA = 0;
    var mB = 0;

    for (var k in vecA) {
      if (vecA.hasOwnProperty(k)) {
        var valA = vecA[k];
        mA += valA * valA;
        if (vecB[k]) dot += valA * vecB[k];
      }
    }
    for (var j in vecB) {
      if (vecB.hasOwnProperty(j)) {
        mB += vecB[j] * vecB[j];
      }
    }

    if (mA === 0 || mB === 0) return 0;
    return dot / (Math.sqrt(mA) * Math.sqrt(mB));
  }

  // ============ 2. 记忆库存储与读取 ============
  function getMemoryList(charId) {
    try {
      return JSON.parse(localStorage.getItem('wx_char_memories_' + charId) || '[]');
    } catch(e) {
      return [];
    }
  }

  function saveMemoryList(charId, list) {
    try {
      localStorage.setItem('wx_char_memories_' + charId, JSON.stringify(list));
    } catch(e) {}
    if (window.AppDB) window.AppDB.save('wx_char_memories_' + charId, list);
  }

  function getArchiveMessages(charId, dateKey) {
    try {
      return JSON.parse(localStorage.getItem('wx_chat_archive_' + charId + '_' + dateKey) || '[]');
    } catch(e) {
      return [];
    }
  }

  function saveArchiveMessages(charId, dateKey, msgs) {
    try {
      localStorage.setItem('wx_chat_archive_' + charId + '_' + dateKey, JSON.stringify(msgs));
    } catch(e) {}
    if (window.AppDB) window.AppDB.save('wx_chat_archive_' + charId + '_' + dateKey, msgs);
  }

  // ============ 3. 核心拦截：只取今天 00:01 之后的对话 ============
  function filterTodayMessages(allMessages) {
    var now = new Date();
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 1).getTime();
    return allMessages.filter(function (m) {
      return (m.ts || 0) >= todayStart;
    });
  }

  // ============ 4. 向量检索：跨天细节精准语义回溯 ============
  function recallPastDetails(charId, currentQuery, topK) {
    if (!currentQuery || !currentQuery.trim()) return [];
    var queryVec = textToVector(currentQuery);
    var memories = getMemoryList(charId);
    var scored = [];

    // 1. 在过往手账日记中算语义匹配度
    memories.forEach(function (mem) {
      var text = (mem.track || '') + ' ' + (mem.thoughts || '') + ' ' + (mem.summary || '');
      var sim = cosineSimilarity(queryVec, textToVector(text));
      if (sim > 0.22) {
        scored.push({
          type: 'diary',
          date: mem.dateStr,
          text: '【' + mem.dateStr + ' 记忆日记】：行动轨迹：' + mem.track + '；心绪念头：' + mem.thoughts + '；交谈摘要：' + mem.summary,
          similarity: sim
        });
      }
    });

    // 2. 在过往归档对话碎片中检索高相似度句子
    memories.slice(-7).forEach(function (mem) {
      var archivedMsgs = getArchiveMessages(charId, mem.dateStr);
      archivedMsgs.forEach(function (m) {
        var content = m.cleanContent || m.content || m.text || '';
        if (!content) return;
        var sim = cosineSimilarity(queryVec, textToVector(content));
        if (sim > 0.38) {
          scored.push({
            type: 'dialogue',
            date: mem.dateStr,
            text: '【' + mem.dateStr + ' 历史对话原句】：' + (m.sender === 'user' ? '墨墨' : '你') + '曾经说过：“' + content + '”',
            similarity: sim
          });
        }
      });
    });

    scored.sort(function (a, b) { return b.similarity - a.similarity; });
    return scored.slice(0, topK || 3);
  }

  // ============ 5. 午夜 00:00 自动结清与日记生成 ============
  function checkAndTriggerMidnightRollover(charId, currentChar, currentUser, onComplete) {
    if (!charId || !currentChar) return;
    var allMsgs = [];
    try {
      allMsgs = JSON.parse(localStorage.getItem('wx_chat_msgs_' + charId) || '[]');
    } catch(e) { allMsgs = []; }
    if (!allMsgs.length) return;

    var todayStr = getDateKey(Date.now());
    var unarchivedMsgs = {};

    // 收集所有早于今天 00:00 的历史消息，按日期归类
    allMsgs.forEach(function (m) {
      var dKey = getDateKey(m.ts || Date.now());
      if (dKey < todayStr && !m.isSystem && !m.isError) {
        if (!unarchivedMsgs[dKey]) unarchivedMsgs[dKey] = [];
        unarchivedMsgs[dKey].push(m);
      }
    });

    var dateKeys = Object.keys(unarchivedMsgs);
    if (!dateKeys.length) {
      if (onComplete) onComplete();
      return;
    }

    // 逐日结清未归档的旧历史
    var dateIndex = 0;
    function processNextDate() {
      if (dateIndex >= dateKeys.length) {
        // 将旧消息从当前对话流中物理移入归档库，只保留今天新消息
        var remainingTodayMsgs = filterTodayMessages(allMsgs);
        try {
          localStorage.setItem('wx_chat_msgs_' + charId, JSON.stringify(remainingTodayMsgs));
        } catch(e) {}
        if (window.AppDB) window.AppDB.save('wx_chat_msgs_' + charId, remainingTodayMsgs);
        if (onComplete) onComplete();
        return;
      }

      var dKey = dateKeys[dateIndex];
      var msgsOfThatDay = unarchivedMsgs[dKey];
      saveArchiveMessages(charId, dKey, msgsOfThatDay);

      // 调用模型生成当天的日记手账
      generateDiaryPrompt(currentChar, currentUser, dKey, msgsOfThatDay, function (diaryObj) {
        var memories = getMemoryList(charId);
        memories = memories.filter(function (x) { return x.dateStr !== dKey; });
        memories.push(diaryObj);
        memories.sort(function (a, b) { return a.dateStr.localeCompare(b.dateStr); });
        saveMemoryList(charId, memories);

        dateIndex++;
        processNextDate();
      });
    }

    processNextDate();
  }

  function generateDiaryPrompt(currentChar, currentUser, dateStr, dayMsgs, cb) {
    var charName = currentChar.name || '冥夜';
    var userName = (currentUser ? (currentUser.name || currentUser.nickname) : '') || '墨墨';
    var api = window.WxChatSettings ? window.WxChatSettings.getActiveApi(currentChar.id) : null;

    var dialogueHistory = dayMsgs.map(function (m) {
      var speaker = (m.sender === 'user' || m.role === 'user') ? userName : charName;
      var text = m.cleanContent || m.content || m.text || '';
      var voice = m.voiceObj ? (' [心声与念头: ' + m.voiceObj.monologue + ']') : '';
      return speaker + ': ' + text + voice;
    }).join('\n');

    // 兜底离线总结，防止无 API 时失忆
    function fallbackDiary() {
      return {
        dateStr: dateStr,
        timestamp: new Date(dateStr).getTime(),
        track: '全日陪伴在墨墨身边，静心处理手头琐事与日常起居。',
        thoughts: '心系墨墨的一言一语，她的喜乐安好便是我最大的牵挂。',
        summary: '与墨墨共话今日细碎日常，彼此依偎闲谈，字里行间皆是温情。',
        messageCount: dayMsgs.length
      };
    }

    if (!api || !api.url || !api.key) {
      cb(fallbackDiary());
      return;
    }

    var sysPrompt = '你是「' + charName + '」。今天是 ' + dateStr + ' 的深夜，你在独属于自己的手账日记本中写下对今天的私人复盘。\n'
      + '请结合今天你与「' + userName + '」的全部交谈、以及你当时内心的真实想法，写下一则精炼高浓度的日记。\n'
      + '输出格式必须严格为以下三行（不要出现多余文字）：\n'
      + '[行动轨迹]: 用两三句话总结你今天的活动与行止（若无重大波澜，则描绘符合你人设的平静日常轨迹）。\n'
      + '[内心所念]: 记录今天你在内心对「' + userName + '」所产生的最深刻想法、心动暗涌或值得永远留存的念头。\n'
      + '[对话综述]: 总结今天你和「' + userName + '」主要聊了哪些事与心绪羁绊。';

    fetch(api.url.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + api.key
      },
      body: JSON.stringify({
        model: api.model,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: '以下是今天我们的全部聊天记录与内心念头：\n\n' + dialogueHistory }
        ],
        temperature: 0.7
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var content = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) ? d.choices[0].message.content : '';
      var track = '今日平静安宁，如常度过，专注于日常事务。';
      var thoughts = '墨墨安好，心有所属，便是最大的慰藉。';
      var summary = '与墨墨畅谈心事，细水长流。';

      var mTrack = content.match(/\[行动轨迹\][:：]\s*(.+)/);
      var mThoughts = content.match(/\[内心所念\][:：]\s*(.+)/);
      var mSummary = content.match(/\[对话综述\][:：]\s*(.+)/);

      if (mTrack) track = mTrack[1].trim();
      if (mThoughts) thoughts = mThoughts[1].trim();
      if (mSummary) summary = mSummary[1].trim();

      cb({
        dateStr: dateStr,
        timestamp: new Date(dateStr).getTime(),
        track: track,
        thoughts: thoughts,
        summary: summary,
        messageCount: dayMsgs.length
      });
    })
    .catch(function() {
      cb(fallbackDiary());
    });
  }

  // ============ 6. 三栏式记忆时间轴手账 UI 渲染 ============
  function openMemoryCorridor(currentChar, currentUser) {
    if (!currentChar) return;
    var existing = document.getElementById('wxCrMemoryCorridorMask');
    if (existing) existing.remove();

    var mask = document.createElement('div');
    mask.className = 'wx-mem-corridor-mask';
    mask.id = 'wxCrMemoryCorridorMask';

    var memories = getMemoryList(currentChar.id);
    var charName = currentChar.name || '角色';

    var listHtml = '';
    if (!memories.length) {
      listHtml = '<div class="mem-empty-box"><span>✦ 暂无往昔手账，今夜午夜将凝结第一篇回忆 ✦</span></div>';
    } else {
      listHtml = memories.map(function (mem) {
        return '<div class="mem-trio-card" data-mem-date="' + mem.dateStr + '">'
          // 路线 1：左侧时间与轨迹
          + '<div class="mem-col-left">'
          + '  <div class="mem-date-badge">' + esc(mem.dateStr) + '</div>'
          + '  <div class="mem-track-text">' + esc(mem.track) + '</div>'
          + '</div>'

          // 中轴分割线与星标
          + '<div class="mem-spine-divider">'
          + '  <span class="mem-star-node">✦</span>'
          + '</div>'

          // 路线 2：右侧心理念头与交谈综述
          + '<div class="mem-col-mid">'
          + '  <div class="mem-thought-quote">“ ' + esc(mem.thoughts) + ' ”</div>'
          + '  <div class="mem-summary-sub">共话：' + esc(mem.summary) + '</div>'
          + '</div>'

          // 路线 3：最右侧归档溯源触发点
          + '<div class="mem-col-right">'
          + '  <button class="mem-archive-btn" data-archive-date="' + mem.dateStr + '" type="button" title="查看当天原始聊天">'
          + '    <svg viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
          + '    <span>溯源</span>'
          + '  </button>'
          + '</div>'
          + '</div>';
      }).join('');
    }

    mask.innerHTML = '<div class="wx-mem-corridor-panel">'
      + '  <div class="mem-corridor-header">'
      + '    <div class="mem-header-left">'
      + '      <span class="mem-header-script">~ Memories ~</span>'
      + '      <span class="mem-header-title">✦ ' + esc(charName) + ' · 记忆手账 ✦</span>'
      + '    </div>'
      + '    <button class="mem-close-btn" id="wxMemCloseBtn" type="button">✕</button>'
      + '  </div>'
      + '  <div class="mem-corridor-body">' + listHtml + '</div>'
      + '</div>'

      // 归档对话回溯弹窗
      + '<div class="mem-archive-modal" id="wxMemArchiveModal">'
      + '  <div class="mem-archive-panel">'
      + '    <div class="mem-archive-head">'
      + '      <span class="mem-archive-title" id="wxArchiveModalTitle">历史对话归档</span>'
      + '      <button class="mem-archive-close" id="wxArchiveModalClose" type="button">✕</button>'
      + '    </div>'
      + '    <div class="mem-archive-msgs" id="wxArchiveModalMsgs"></div>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(mask);
    setTimeout(function() { mask.classList.add('show'); }, 10);

    // 绑定事件
    mask.querySelector('#wxMemCloseBtn').onclick = function () {
      mask.classList.remove('show');
      setTimeout(function () { mask.remove(); }, 250);
    };

    var archiveModal = mask.querySelector('#wxMemArchiveModal');
    var archiveClose = mask.querySelector('#wxArchiveModalClose');
    archiveClose.onclick = function () { archiveModal.classList.remove('show'); };

    mask.querySelectorAll('.mem-archive-btn').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var dKey = this.dataset.archiveDate;
        var archivedMsgs = getArchiveMessages(currentChar.id, dKey);
        var modalMsgs = mask.querySelector('#wxArchiveModalMsgs');
        mask.querySelector('#wxArchiveModalTitle').textContent = dKey + ' · 对话原貌';

        if (!archivedMsgs.length) {
          modalMsgs.innerHTML = '<div class="mem-empty-box"><span>此日无原始对话记录</span></div>';
        } else {
          modalMsgs.innerHTML = archivedMsgs.map(function (m) {
            var isUser = (m.sender === 'user' || m.role === 'user');
            var txt = m.cleanContent || m.content || m.text || '';
            var timeStr = m.ts ? (' ' + fmtTime(m.ts)) : '';
            return '<div class="archive-bubble-row' + (isUser ? ' user-side' : '') + '">'
              + '<span class="archive-speaker">' + (isUser ? '墨墨' : charName) + timeStr + '</span>'
              + '<div class="archive-bubble">' + esc(txt) + '</div>'
              + '</div>';
          }).join('');
        }
        archiveModal.classList.add('show');
      };
    });
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  window.WxChatMemory = {
    filterToday: filterTodayMessages,
    recall: recallPastDetails,
    getMemories: getMemoryList,
    checkRollover: checkAndTriggerMidnightRollover,
    openCorridor: openMemoryCorridor
  };

})();
