
(function () {
  'use strict';

  var USER_COGNITION_PREFIX = 'wx_user_cognition_';
  var SELF_COGNITION_PREFIX = 'wx_self_cognition_';
  var UNRESOLVED_ALERT_PREFIX = 'wx_unresolved_alerts_';
  var ARCHIVE_KEY_PREFIX = 'wx_chat_archive_';

  function esc(str) {
    return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
  }

  function getTodayDateStr(dateObj) {
    var d = dateObj || new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '.' + (m < 10 ? '0' + m : m) + '.' + (day < 10 ? '0' + day : day);
  }

  // 11 大 User 画像板块分类
  var USER_BLOCK_DEFS = [
    { key: 'likes', label: '喜好', subLabel: 'PREFERENCES' },
    { key: 'habits', label: '习惯', subLabel: 'HABITS' },
    { key: 'personality', label: '性格', subLabel: 'CHARACTER' },
    { key: 'appearance', label: '形象', subLabel: 'APPEARANCE' },
    { key: 'dislikes', label: '厌恶', subLabel: 'DISLIKES' },
    { key: 'catchphrase', label: '口头禅', subLabel: 'PHRASES' },
    { key: 'secrets', label: '秘密', subLabel: 'SECRETS' },
    { key: 'social', label: '人际', subLabel: 'RELATIONS' },
    { key: 'past', label: '过往', subLabel: 'PAST' },
    { key: 'daily', label: '日常', subLabel: 'DAILY' },
    { key: 'other', label: '其他', subLabel: 'OTHER' }
  ];

  // 5 大角色自我认知与羁绊板块
  var SELF_BLOCK_DEFS = [
    { key: 'promises', label: '承诺', subLabel: 'PROMISES' },
    { key: 'wishes', label: '心愿', subLabel: 'WISHES' },
    { key: 'mood', label: '心境', subLabel: 'MOOD' },
    { key: 'events', label: '事件', subLabel: 'EVENTS' },
    { key: 'secrets', label: '隐秘', subLabel: 'INNER THOUGHTS' }
  ];

  // ============ 1. AppDB 当前角色读取 ============
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

  // ============ 2. 结构化独立板块数据读写 (纯 AppDB) ============
  function getUserCognition(charId, callback) {
    var def = {};
    USER_BLOCK_DEFS.forEach(function (b) { def[b.key] = []; });

    if (!window.AppDB) { if (callback) callback(def); return; }
    window.AppDB.get(USER_COGNITION_PREFIX + charId, function (val) {
      var res = Object.assign({}, def);
      if (val && typeof val === 'object') {
        USER_BLOCK_DEFS.forEach(function (b) {
          if (Array.isArray(val[b.key])) res[b.key] = val[b.key];
          else if (typeof val[b.key] === 'string' && val[b.key].trim()) {
            res[b.key] = val[b.key].split(/；|;/).map(function(s){ return s.trim(); }).filter(Boolean);
          }
        });
      }
      callback(res);
    });
  }

  function saveUserCognition(charId, data, callback) {
    if (window.AppDB) window.AppDB.save(USER_COGNITION_PREFIX + charId, data, callback);
    else if (callback) callback();
  }

  function getSelfCognition(charId, callback) {
    var def = {};
    SELF_BLOCK_DEFS.forEach(function (b) { def[b.key] = []; });

    if (!window.AppDB) { if (callback) callback(def); return; }
    window.AppDB.get(SELF_COGNITION_PREFIX + charId, function (val) {
      var res = Object.assign({}, def);
      if (val && typeof val === 'object') {
        SELF_BLOCK_DEFS.forEach(function (b) {
          if (Array.isArray(val[b.key])) res[b.key] = val[b.key];
          else if (typeof val[b.key] === 'string' && val[b.key].trim()) {
            res[b.key] = val[b.key].split(/；|;/).map(function(s){ return s.trim(); }).filter(Boolean);
          }
        });
      }
      callback(res);
    });
  }

  function saveSelfCognition(charId, data, callback) {
    if (window.AppDB) window.AppDB.save(SELF_COGNITION_PREFIX + charId, data, callback);
    else if (callback) callback();
  }

  function getUnresolvedAlerts(charId, callback) {
    if (!window.AppDB) { if (callback) callback([]); return; }
    window.AppDB.get(UNRESOLVED_ALERT_PREFIX + charId, function (val) {
      callback(Array.isArray(val) ? val : []);
    });
  }

  function saveUnresolvedAlerts(charId, list, callback) {
    if (window.AppDB) window.AppDB.save(UNRESOLVED_ALERT_PREFIX + charId, list, callback);
    else if (callback) callback();
  }

  // ============ 3. 记忆网关：组装发给 AI 的高浓度精炼包 ============
  function buildGatewayPrompt(charId, callback) {
    getUserCognition(charId, function (uCog) {
      getSelfCognition(charId, function (sCog) {
        getUnresolvedAlerts(charId, function (alerts) {
          var parts = [];

          // A. User 11大画像字典
          var uLines = [];
          USER_BLOCK_DEFS.forEach(function (b) {
            var items = uCog[b.key];
            if (Array.isArray(items) && items.length) {
              uLines.push('· [' + b.label + ']: ' + items.join('；'));
            }
          });
          if (uLines.length) {
            parts.push('【我对User的观察画像与认知字典（根据交流随时更新）】：\n' + uLines.join('\n'));
          }

          // B. 角色自我5大羁绊心事
          var sLines = [];
          SELF_BLOCK_DEFS.forEach(function (b) {
            var items = sCog[b.key];
            if (Array.isArray(items) && items.length) {
              sLines.push('· [' + b.label + ']: ' + items.join('；'));
            }
          });
          if (sLines.length) {
            parts.push('【我自己的内心羁绊与心事册】：\n' + sLines.join('\n'));
          }

          // C. 悬念与情绪警报
          var activeAlerts = alerts.filter(function (a) { return !a.resolved; });
          if (activeAlerts.length) {
            var aText = activeAlerts.map(function (a) { return '· ⚠️ ' + a.text + ' (记录于: ' + a.date + ')'; }).join('\n');
            parts.push('【悬而未决的事项与情绪反常警报（时刻挂念并寻机问候）】：\n' + aText);
          }

          // D. 精准板块补充指令
          parts.push('【板块认知补充铁律】：在交流中敏锐捕捉对方信息。若本次聊天中对方透露了新的具体事实或产生新承诺，请在回复末尾附带精准板块更新标签，格式如：\n`[COG_USER: 喜好 + 喜欢吃草莓蛋糕]` 或 `[COG_SELF: 承诺 + 答应陪她看初雪]` 或 `[ALERT: 墨墨胃疼未见好转]`（如无新信息则绝不输出多余标签）。');

          callback(parts.join('\n\n'));
        });
      });
    });
  }

  // ============ 4. 记忆总结与认知自动分拣落库 ============
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

      var systemPrompt = '你现在是「' + charName + '」。请回顾你刚才与「' + userName + '」所经历的这段对话及你当时的内心活动，分门别类提炼对「' + userName + '」的新认知和自己产生的新羁绊与心事。\n'
        + '【输出格式规范 - 严格遵守】：\n'
        + '[USER板块更新]: (分门别类填写，支持板块: 喜好/习惯/性格/形象/厌恶/口头禅/秘密/人际/过往/日常/其他。格式如: 喜好: 喜欢抹茶; 习惯: 习惯晚睡。若无新发现则填 无)\n'
        + '[SELF板块更新]: (支持板块: 承诺/心愿/心境/事件/隐秘。格式如: 承诺: 答应带她去海边; 心愿: 想陪她吃抹茶冰淇淋。若无则填 无)\n'
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
            { role: 'user', content: '【待归纳提炼的对话记录】：\n' + chatDigest }
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

        var uUpdateMatch = resContent.match(/\[USER板块更新\][:：\s]*([\s\S]*?)(?=\[SELF板块更新\]|$)/i);
        var sUpdateMatch = resContent.match(/\[SELF板块更新\][:：\s]*([\s\S]*?)(?=\[未决悬念警报\]|$)/i);
        var alertMatch = resContent.match(/\[未决悬念警报\][:：\s]*([\s\S]*?)$/i);

        // A. 分拣入 User 板块
        if (uUpdateMatch && uUpdateMatch[1] && uUpdateMatch[1].trim() !== '无') {
          getUserCognition(charId, function (uCog) {
            var rawPairs = uUpdateMatch[1].trim().split(/；|;|\n/);
            rawPairs.forEach(function (pair) {
              var p = pair.split(/[:：]/);
              if (p.length >= 2) {
                var labelName = p[0].trim();
                var val = p.slice(1).join(':').trim();
                var matchedDef = USER_BLOCK_DEFS.find(function (b) { return b.label === labelName; });
                if (matchedDef && val && val !== '无') {
                  if (!Array.isArray(uCog[matchedDef.key])) uCog[matchedDef.key] = [];
                  if (uCog[matchedDef.key].indexOf(val) === -1) uCog[matchedDef.key].push(val);
                }
              }
            });
            saveUserCognition(charId, uCog);
          });
        }

        // B. 分拣入 Self 板块
        if (sUpdateMatch && sUpdateMatch[1] && sUpdateMatch[1].trim() !== '无') {
          getSelfCognition(charId, function (sCog) {
            var rawPairs = sUpdateMatch[1].trim().split(/；|;|\n/);
            rawPairs.forEach(function (pair) {
              var p = pair.split(/[:：]/);
              if (p.length >= 2) {
                var labelName = p[0].trim();
                var val = p.slice(1).join(':').trim();
                var matchedDef = SELF_BLOCK_DEFS.find(function (b) { return b.label === labelName; });
                if (matchedDef && val && val !== '无') {
                  if (!Array.isArray(sCog[matchedDef.key])) sCog[matchedDef.key] = [];
                  if (sCog[matchedDef.key].indexOf(val) === -1) sCog[matchedDef.key].push(val);
                }
              }
            });
            saveSelfCognition(charId, sCog);
          });
        }

        // C. 更新悬念警报
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

        // 归档旧消息，保留缓冲
        var archiveKey = ARCHIVE_KEY_PREFIX + charId + '_' + Date.now();
        window.AppDB.save(archiveKey, toArchiveMsgs, function () {
          window.AppDB.save('wx_chat_msgs_' + charId, bufferMsgs, function () {
            try { localStorage.setItem('wx_chat_msgs_' + charId, JSON.stringify(bufferMsgs)); } catch(e){}
            if (callback) callback({ success: true });
          });
        });
      })
      .catch(function (err) {
        if (callback) callback(null, '请求异常：' + (err.message || err));
      });
    });
  }

  // ============ 5. 记忆手账舞台与索引交互 ============
  var activeUserKey = 'likes';   // 当前选中的 User 索引分类
  var activeSelfKey = 'promises'; // 当前选中的 Self 索引分类

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
      // 1. 顶栏
      + '<div class="mem-stage-header">'
      + '  <div class="mem-head-left">'
      + '    <button class="mem-native-back" id="memStageBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '    <div class="mem-title-group">'
      + '      <span class="mem-script-tag">~ Sanctuary Mind & Dossier ~</span>'
      + '      <h1 class="mem-main-title">' + esc(activeChar.name || 'Character') + ' · 记忆手账</h1>'
      + '    </div>'
      + '  </div>'
      + '  <div class="mem-head-right">'
      + '    <button class="mem-trigger-summary-btn" id="memTriggerSummaryBtn" type="button" title="立即归纳对话至记忆库">'
      + '      <span class="mem-btn-icon">❆</span>'
      + '      <span>立即归纳</span>'
      + '    </button>'
      + '  </div>'
      + '</div>'

      // 2. 主体手账书展馆
      + '<div class="mem-stage-body" id="memStageBody"></div>';

    document.body.appendChild(stage);

    renderMemoryBook(stage, activeChar);
    bindStageEvents(stage, activeChar, userObj);
  }

  function renderMemoryBook(stage, charData) {
    var body = stage.querySelector('#memStageBody');
    if (!body) return;

    getUserCognition(charData.id, function (uCog) {
      getSelfCognition(charData.id, function (sCog) {
        getUnresolvedAlerts(charData.id, function (alerts) {

          // 生成左侧 User 分类书签标签
          var userTabsHtml = USER_BLOCK_DEFS.map(function (b) {
            var count = (uCog[b.key] && uCog[b.key].length) ? uCog[b.key].length : 0;
            var isActive = (b.key === activeUserKey);
            return '<button class="mem-index-tab' + (isActive ? ' active' : '') + '" data-user-tab="' + b.key + '" type="button">'
              + '§ ' + b.label + ' (' + count + ')'
              + '</button>';
          }).join('');

          // 生成右侧 Self 分类书签标签
          var selfTabsHtml = SELF_BLOCK_DEFS.map(function (b) {
            var count = (sCog[b.key] && sCog[b.key].length) ? sCog[b.key].length : 0;
            var isActive = (b.key === activeSelfKey);
            return '<button class="mem-index-tab self-tab' + (isActive ? ' active' : '') + '" data-self-tab="' + b.key + '" type="button">'
              + '§ ' + b.label + ' (' + count + ')'
              + '</button>';
          }).join('');

          // 悬念警报书签
          var alertCount = alerts.filter(function (a) { return !a.resolved; }).length;
          var alertTabHtml = '<button class="mem-index-tab alert-tab' + (activeSelfKey === 'alerts' ? ' active' : '') + '" data-self-tab="alerts" type="button">'
            + '⚠️ 悬念 (' + alertCount + ')'
            + '</button>';

          // 当前左页条目
          var curUserDef = USER_BLOCK_DEFS.find(function (b) { return b.key === activeUserKey; }) || USER_BLOCK_DEFS[0];
          var curUserItems = uCog[curUserDef.key] || [];

          var userItemsHtml = '';
          if (!curUserItems.length) {
            userItemsHtml = '<div class="mem-item-empty-tip">暂无观察记录，交流中将自动捕捉积累</div>';
          } else {
            userItemsHtml = curUserItems.map(function (it, idx) {
              return '<div class="mem-record-row">'
                + '<span class="mem-record-bullet">·</span>'
                + '<span class="mem-record-text">' + esc(it) + '</span>'
                + '<span class="mem-record-del-x" data-del-uitem="' + curUserDef.key + '" data-item-idx="' + idx + '" title="删除此条">×</span>'
                + '</div>';
            }).join('');
          }

          // 当前右页条目
          var rightContentHtml = '';
          var curSelfDef = null;

          if (activeSelfKey === 'alerts') {
            // 右页显示悬念雷达
            if (!alerts.length) {
              rightContentHtml = '<div class="mem-item-empty-tip">当前一切安心如常，暂无未决悬念</div>';
            } else {
              rightContentHtml = alerts.map(function (a, idx) {
                var isRes = !!a.resolved;
                return '<div class="mem-alert-record-row' + (isRes ? ' resolved' : '') + '">'
                  + '<div class="alert-record-info">'
                  + '  <span class="alert-date-mini">' + esc(a.date) + '</span>'
                  + '  <span class="alert-text-mini">' + esc(a.text) + '</span>'
                  + '</div>'
                  + '<div class="alert-record-actions">'
                  + '  <span class="alert-act-btn toggle" data-toggle-alert="' + idx + '">' + (isRes ? '重新挂起' : '完成') + '</span>'
                  + '  <span class="alert-act-btn del" data-del-alert="' + idx + '">×</span>'
                  + '</div>'
                  + '</div>';
              }).join('');
            }
          } else {
            curSelfDef = SELF_BLOCK_DEFS.find(function (b) { return b.key === activeSelfKey; }) || SELF_BLOCK_DEFS[0];
            var curSelfItems = sCog[curSelfDef.key] || [];

            if (!curSelfItems.length) {
              rightContentHtml = '<div class="mem-item-empty-tip">暂无记录，角色将在触动时写下</div>';
            } else {
              rightContentHtml = curSelfItems.map(function (it, idx) {
                return '<div class="mem-record-row self-side">'
                  + '<span class="mem-record-bullet">·</span>'
                  + '<span class="mem-record-text">' + esc(it) + '</span>'
                  + '<span class="mem-record-del-x" data-del-sitem="' + curSelfDef.key + '" data-item-idx="' + idx + '" title="删除此条">×</span>'
                  + '</div>';
              }).join('');
            }
          }

          var html = '<div class="mem-book-wrapper">'
            // 顶部索引书签组
            + '<div class="mem-index-tabs-shelf">'
            + '  <div class="tabs-group-row user-group">'
            + '    <span class="tabs-group-lead">USER画像:</span>'
            + '    <div class="tabs-scroll-container">' + userTabsHtml + '</div>'
            + '  </div>'
            + '  <div class="tabs-group-row self-group">'
            + '    <span class="tabs-group-lead">角色心事:</span>'
            + '    <div class="tabs-scroll-container">' + selfTabsHtml + alertTabHtml + '</div>'
            + '  </div>'
            + '</div>'

            // 手账书主体
            + '<div class="snow-blue-ribbon-book">'
            // 1. 左页：User 观察画像
            + '  <div class="binder-page left">'
            + '    <div class="page-hole-col top"><div class="hole-dot"></div><div class="hole-dot"></div><div class="hole-dot"></div></div>'
            + '    <div class="page-hole-col bottom"><div class="hole-dot"></div><div class="hole-dot"></div><div class="hole-dot"></div></div>'
            + '    <div class="book-page-content">'
            + '      <div class="book-page-head">'
            + '        <div class="page-head-title-col">'
            + '          <span class="page-sec-name">§ ' + curUserDef.label + ' · 观察认知</span>'
            + '          <span class="page-sec-sub">' + curUserDef.subLabel + '</span>'
            + '        </div>'
            + '        <button class="page-add-item-btn" data-add-uitem="' + curUserDef.key + '" data-block-title="' + curUserDef.label + '" type="button">+ 补充</button>'
            + '      </div>'
            + '      <div class="book-items-list">' + userItemsHtml + '</div>'
            + '      <div class="book-page-foot-code">DOSSIER // L · P.01</div>'
            + '    </div>'
            + '  </div>'

            // 2. 中脊穿透交叉白丝带
            + '  <div class="binder-spine-area">'
            + '    <div class="spine-line"></div>'
            + '    <div class="ribbon-cluster top">'
            + '      <div class="ribbon-bar cross-a"></div>'
            + '      <div class="ribbon-bar cross-b"></div>'
            + '      <div class="ribbon-bar straight"></div>'
            + '    </div>'
            + '    <div class="ribbon-cluster bottom">'
            + '      <div class="ribbon-bar straight"></div>'
            + '      <div class="ribbon-bar cross-a"></div>'
            + '      <div class="ribbon-bar cross-b"></div>'
            + '    </div>'
            + '  </div>'

            // 3. 右页：角色心事羁绊与悬念
            + '  <div class="binder-page right">'
            + '    <div class="page-hole-col top"><div class="hole-dot"></div><div class="hole-dot"></div><div class="hole-dot"></div></div>'
            + '    <div class="page-hole-col bottom"><div class="hole-dot"></div><div class="hole-dot"></div><div class="hole-dot"></div></div>'
            + '    <div class="book-page-content">'
            + '      <div class="book-page-head">'
            + '        <div class="page-head-title-col">'
            + '          <span class="page-sec-name">' + (activeSelfKey === 'alerts' ? '⚠️ 悬念与情绪雷达' : ('§ ' + (curSelfDef ? curSelfDef.label : '') + ' · 羁绊心事')) + '</span>'
            + '          <span class="page-sec-sub">' + (activeSelfKey === 'alerts' ? 'UNRESOLVED ALERTS' : (curSelfDef ? curSelfDef.subLabel : '')) + '</span>'
            + '        </div>'
            + (activeSelfKey === 'alerts'
                ? '<button class="page-add-item-btn" id="btnAddAlertManual" type="button">+ 记录悬念</button>'
                : '<button class="page-add-item-btn" data-add-sitem="' + (curSelfDef ? curSelfDef.key : '') + '" data-block-title="' + (curSelfDef ? curSelfDef.label : '') + '" type="button">+ 补充</button>'
              )
            + '      </div>'
            + '      <div class="book-items-list">' + rightContentHtml + '</div>'
            + '      <div class="book-page-foot-code">BOND // R · P.02</div>'
            + '    </div>'
            + '  </div>'
            + '</div>'
            + '</div>';

          body.innerHTML = html;
          bindBookActions(stage, charData, uCog, sCog, alerts);
        });
      });
    });
  }

  // ============ 6. 事件绑定与增删改 ============
  function bindBookActions(stage, charData, uCog, sCog, alerts) {
    // 切换左页 User 书签
    stage.querySelectorAll('[data-user-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        activeUserKey = this.dataset.userTab;
        renderMemoryBook(stage, charData);
      });
    });

    // 切换右页 Self / Alert 书签
    stage.querySelectorAll('[data-self-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        activeSelfKey = this.dataset.selfTab;
        renderMemoryBook(stage, charData);
      });
    });

    // 左页补充条目
    var addUBtn = stage.querySelector('[data-add-uitem]');
    if (addUBtn) {
      addUBtn.addEventListener('click', function () {
        var key = this.dataset.addUitem;
        var bTitle = this.dataset.blockTitle;
        var txt = prompt('向【' + bTitle + '】认知板块补充一条内容：');
        if (txt && txt.trim()) {
          if (!Array.isArray(uCog[key])) uCog[key] = [];
          uCog[key].push(txt.trim());
          saveUserCognition(charData.id, uCog, function () {
            renderMemoryBook(stage, charData);
            if (window.AppNav) window.AppNav.showToast('已补充至【' + bTitle + '】');
          });
        }
      });
    }

    // 左页删除条目
    stage.querySelectorAll('[data-del-uitem]').forEach(function (delBtn) {
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var key = this.dataset.delUitem;
        var idx = parseInt(this.dataset.itemIdx, 10);
        if (Array.isArray(uCog[key])) {
          uCog[key].splice(idx, 1);
          saveUserCognition(charData.id, uCog, function () {
            renderMemoryBook(stage, charData);
          });
        }
      });
    });

    // 右页补充心事条目
    var addSBtn = stage.querySelector('[data-add-sitem]');
    if (addSBtn) {
      addSBtn.addEventListener('click', function () {
        var key = this.dataset.addSitem;
        var bTitle = this.dataset.blockTitle;
        var txt = prompt('向【' + bTitle + '】心事板块补充一条内容：');
        if (txt && txt.trim()) {
          if (!Array.isArray(sCog[key])) sCog[key] = [];
          sCog[key].push(txt.trim());
          saveSelfCognition(charData.id, sCog, function () {
            renderMemoryBook(stage, charData);
            if (window.AppNav) window.AppNav.showToast('已补充至【' + bTitle + '】');
          });
        }
      });
    }

    // 右页删除心事条目
    stage.querySelectorAll('[data-del-sitem]').forEach(function (delBtn) {
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var key = this.dataset.delSitem;
        var idx = parseInt(this.dataset.itemIdx, 10);
        if (Array.isArray(sCog[key])) {
          sCog[key].splice(idx, 1);
          saveSelfCognition(charData.id, sCog, function () {
            renderMemoryBook(stage, charData);
          });
        }
      });
    });

    // 右页手动添加悬念
    var addAlertBtn = stage.querySelector('#btnAddAlertManual');
    if (addAlertBtn) {
      addAlertBtn.addEventListener('click', function () {
        var txt = prompt('记录一条未决悬念或情绪警报：');
        if (txt && txt.trim()) {
          alerts.unshift({
            id: 'alt_' + Date.now(),
            date: getTodayDateStr(),
            text: txt.trim(),
            resolved: false
          });
          saveUnresolvedAlerts(charData.id, alerts, function () {
            renderMemoryBook(stage, charData);
            if (window.AppNav) window.AppNav.showToast('已记录悬念');
          });
        }
      });
    }

    // 悬念完成切换
    stage.querySelectorAll('[data-toggle-alert]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = parseInt(this.dataset.toggleAlert, 10);
        if (alerts[idx]) {
          alerts[idx].resolved = !alerts[idx].resolved;
          saveUnresolvedAlerts(charData.id, alerts, function () {
            renderMemoryBook(stage, charData);
          });
        }
      });
    });

    // 悬念删除
    stage.querySelectorAll('[data-del-alert]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = parseInt(this.dataset.delAlert, 10);
        alerts.splice(idx, 1);
        saveUnresolvedAlerts(charData.id, alerts, function () {
          renderMemoryBook(stage, charData);
        });
      });
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
            title: '立即归纳认知与手账',
            desc: '角色将回顾刚才的对话与心声，自动分拣更新 User 认知板块与自我心事册。确定归纳吗？',
            confirmText: '开始归纳',
            isDanger: false
          }, function () {
            if (window.AppNav) window.AppNav.showToast('角色正在静心回想并整理手账...');
            executeMemorySummary(charData.id, charData, userObj, function (res, errMsg) {
              if (res && res.success) {
                renderMemoryBook(stage, charData);
                if (window.AppNav) window.AppNav.showToast('✦ 认知板块与手账已同步归纳积累 ✦');
              } else {
                if (window.AppNav) window.AppNav.showToast(errMsg || '归纳未能完成');
              }
            });
          });
        }
      });
    }

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
