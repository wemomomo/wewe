
(function(){
  'use strict';

  var apiConfigs = [];
  var activeApi = null;
  var currentTab = 'config';
  var editingIdx = -1;

  // ============ 确保 DOM 挂载 ============
  function ensureSettingsDOM() {
    var pageContainer = document.getElementById('pageContainer');
    if (!pageContainer) return;

    if (!document.querySelector('[data-page="settings"]')) {
      var setPage = document.createElement('div');
      setPage.className = 'page app-page';
      setPage.dataset.page = 'settings';
      setPage.innerHTML = '<div class="app-header">'
        + '<button class="icon-back-btn" data-back="home"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
        + '<div class="app-title">设置</div>'
        + '</div><div class="app-content" id="settingsContent"><div class="settings-list">'
        + '<div class="settings-item" data-goto="api"><div class="settings-item-icon"><svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></div><div class="settings-item-text"><div class="settings-item-title">API 配置</div><div class="settings-item-desc">管理接口密钥与模型设置</div></div><svg class="settings-arrow" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></div>'
        + '<div class="settings-item" data-goto="data"><div class="settings-item-icon"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg></div><div class="settings-item-text"><div class="settings-item-title">数据</div><div class="settings-item-desc">导入导出与清除本地数据</div></div><svg class="settings-arrow" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></div>'
        + '</div></div>';
      pageContainer.appendChild(setPage);
    }

    if (!document.querySelector('[data-page="api"]')) {
      var apiPage = document.createElement('div');
      apiPage.className = 'page app-page';
      apiPage.dataset.page = 'api';
      apiPage.innerHTML = '<div class="app-header"><button class="icon-back-btn" data-back="settings"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button><div class="app-title">API 配置</div></div><div class="app-content" id="apiPageContent"></div>';
      pageContainer.appendChild(apiPage);
    }

    if (!document.querySelector('[data-page="data"]')) {
      var dataPage = document.createElement('div');
      dataPage.className = 'page app-page';
      dataPage.dataset.page = 'data';
      dataPage.innerHTML = '<div class="app-header"><button class="icon-back-btn" data-back="settings"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button><div class="app-title">数据</div></div><div class="app-content" id="dataPageContent"></div>';
      pageContainer.appendChild(dataPage);
    }
  }

  function initSettingsData() {
    ensureSettingsDOM();
    loadApiData(function() {
      renderApiBody();
      renderDataBody();
    });
  }

  // 立即监听与双重保险加载
  window.addEventListener('pageChange', function(e) {
    var page = e.detail ? e.detail.page : '';
    if (page === 'settings' || page === 'api' || page === 'data') {
      initSettingsData();
    }
  });

  if (window._dbReady) {
    initSettingsData();
  } else {
    window.addEventListener('dbReady', function() {
      initSettingsData();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsData);
  } else {
    initSettingsData();
  }

  // ============ 渲染 API 页面 ============
  function renderApiBody() {
    var body = document.getElementById('apiPageContent');
    if (!body) return;

    var tabsHtml = '<div class="api-tabs">'
      + '<div class="api-tab' + (currentTab === 'config' ? ' active' : '') + '" data-tab="config">接口配置</div>'
      + '<div class="api-tab' + (currentTab === 'saved' ? ' active' : '') + '" data-tab="saved">已存配置 (' + apiConfigs.length + ')</div>'
      + '</div>';

    var contentHtml = '';

    if (currentTab === 'config') {
      var cfg = editingIdx >= 0 ? apiConfigs[editingIdx] : (activeApi || (apiConfigs.length ? apiConfigs[0] : null));
      contentHtml = '<div class="api-section">'
        + '<div class="api-section-title">接口信息</div>'
        + '<div class="api-field"><div class="api-field-label">配置名称</div><input type="text" class="api-input" id="apiName" placeholder="例如：Claude / DeepSeek" value="' + esc(cfg ? cfg.name : '') + '"></div>'
        + '<div class="api-field"><div class="api-field-label">API 地址</div><input type="text" class="api-input" id="apiUrl" placeholder="https://api.example.com/v1" value="' + esc(cfg ? cfg.url : '') + '"></div>'
        + '<div class="api-field"><div class="api-field-label">API KEY</div><div class="api-field-row"><input type="password" class="api-input" id="apiKey" placeholder="sk-..." value="' + esc(cfg ? cfg.key : '') + '"><button class="api-icon-btn" id="apiToggleKey" type="button"><svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>'
        + '<div class="api-field"><div class="api-field-label">模型名称</div><div class="api-field-row"><input type="text" class="api-input" id="apiModel" placeholder="deepseek-chat / gpt-4o" value="' + esc(cfg ? cfg.model : '') + '"><button class="api-icon-btn" id="apiFetchModels" type="button"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.22-8.56"/><path d="M21 3v6h-6"/></svg></button></div><div class="api-model-list" id="apiModelList"></div></div>'
        + '</div>'
        + '<div class="api-btn-group"><button class="api-btn api-btn-primary" id="apiSaveBtn" type="button">' + (editingIdx >= 0 ? '保存修改' : '保存配置') + '</button></div>';
    } else if (currentTab === 'saved') {
      if (!apiConfigs.length) {
        contentHtml = '<div class="api-empty">暂无已存配置</div>';
      } else {
        contentHtml = '<div class="api-saved-list">' + apiConfigs.map(function(cfg, i) {
          var isActive = activeApi && activeApi.name === cfg.name;
          return '<div class="api-saved-item' + (isActive ? ' active' : '') + '">'
            + '<div class="api-saved-info"><div class="api-saved-name">' + esc(cfg.name) + (isActive ? '<span class="api-saved-tag">当前启用</span>' : '') + '</div>'
            + '<div class="api-saved-detail">' + esc((cfg.model || '') + ' · ' + (cfg.url || '').replace(/^https?:\/\//, '').split('/')[0]) + '</div></div>'
            + '<div class="api-saved-actions">'
            + '<button class="api-saved-act use" data-idx="' + i + '" type="button" title="启用"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></button>'
            + '<button class="api-saved-act edit" data-idx="' + i + '" type="button" title="编辑"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>'
            + '<button class="api-saved-act delete" data-idx="' + i + '" type="button" title="删除"><svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>'
            + '</div></div>';
        }).join('') + '</div>';
      }
    }

    body.innerHTML = tabsHtml + contentHtml;
    bindApiEvents(body);
  }

  function bindApiEvents(body) {
    body.querySelectorAll('.api-tab').forEach(function(tab) {
      tab.addEventListener('click', function() { 
        currentTab = this.dataset.tab; 
        editingIdx = -1; 
        renderApiBody(); 
      });
    });

    if (currentTab === 'config') {
      var toggleBtn = body.querySelector('#apiToggleKey');
      if (toggleBtn) toggleBtn.addEventListener('click', function() { var inp = body.querySelector('#apiKey'); inp.type = inp.type === 'password' ? 'text' : 'password'; });
      
      var fetchBtn = body.querySelector('#apiFetchModels');
      if (fetchBtn) fetchBtn.addEventListener('click', function() { fetchModels(body); });

      var saveBtn = body.querySelector('#apiSaveBtn');
      if (saveBtn) {
        saveBtn.addEventListener('click', function() {
          var name = (body.querySelector('#apiName').value || '').trim();
          var url = (body.querySelector('#apiUrl').value || '').trim();
          var key = (body.querySelector('#apiKey').value || '').trim();
          var model = (body.querySelector('#apiModel').value || '').trim();
          if (!name || !url || !key || !model) { 
            if (window.AppNav) window.AppNav.showToast('请填写完整信息'); 
            return; 
          }

          var config = { name: name, url: url, key: key, model: model };
          if (editingIdx >= 0) {
            apiConfigs[editingIdx] = config;
            if (activeApi && activeApi.name === config.name) activeApi = config;
          } else {
            var existing = -1;
            for (var i = 0; i < apiConfigs.length; i++) { if (apiConfigs[i].name === config.name) { existing = i; break; } }
            if (existing >= 0) apiConfigs[existing] = config; else apiConfigs.push(config);
          }
          if (!activeApi) activeApi = config;
          saveApiData();
          editingIdx = -1;
          if (window.AppNav) window.AppNav.showToast('接口已保存');
          currentTab = 'saved';
          renderApiBody();
        });
      }
    } else if (currentTab === 'saved') {
      body.querySelectorAll('.api-saved-act.use').forEach(function(btn) {
        btn.addEventListener('click', function() {
          activeApi = apiConfigs[parseInt(this.dataset.idx, 10)];
          saveApiData();
          if (window.AppNav) window.AppNav.showToast('已启用: ' + activeApi.name);
          renderApiBody();
        });
      });
      body.querySelectorAll('.api-saved-act.edit').forEach(function(btn) {
        btn.addEventListener('click', function() {
          editingIdx = parseInt(this.dataset.idx, 10);
          currentTab = 'config';
          renderApiBody();
        });
      });
      body.querySelectorAll('.api-saved-act.delete').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var delIdx = parseInt(this.dataset.idx, 10);
          if (window.AppDialog) {
            window.AppDialog.confirm({
              title: '删除配置',
              desc: '确定删除该接口配置吗？',
              confirmText: '确认删除',
              isDanger: true
            }, function() {
              var removed = apiConfigs.splice(delIdx, 1)[0];
              if (activeApi && removed && activeApi.name === removed.name) {
                activeApi = apiConfigs.length ? apiConfigs[0] : null;
              }
              saveApiData();
              if (window.AppNav) window.AppNav.showToast('已删除');
              renderApiBody();
            });
          }
        });
      });
    }
  }

  function fetchModels(body) {
    var url = (body.querySelector('#apiUrl').value || '').trim();
    var key = (body.querySelector('#apiKey').value || '').trim();
    if (!url || !key) { 
      if (window.AppNav) window.AppNav.showToast('请先填写地址和Key'); 
      return; 
    }
    if (window.AppNav) window.AppNav.showToast('获取模型列表中...');
    fetch(url.replace(/\/+$/, '') + '/models', { headers: { 'Authorization': 'Bearer ' + key } })
    .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function(data) {
      var raw = data.data || data; var models = [];
      if (Array.isArray(raw)) { for (var i = 0; i < raw.length; i++) { var id = raw[i].id || raw[i].name || raw[i]; if (id) models.push(id); } }
      if (!models.length) { 
        if (window.AppNav) window.AppNav.showToast('未找到模型列表'); 
        return; 
      }
      var list = body.querySelector('#apiModelList');
      if (!list) return;
      var currentModel = body.querySelector('#apiModel').value;
      list.innerHTML = '<input type="text" class="api-model-search" id="apiModelSearch" placeholder="搜索模型...">'
        + '<div id="apiModelResults">' + models.map(function(m) { return '<div class="api-model-item' + (m === currentModel ? ' selected' : '') + '">' + esc(m) + '</div>'; }).join('') + '</div>';
      list.classList.add('show');
      var searchInput = list.querySelector('#apiModelSearch');
      var resultsBox = list.querySelector('#apiModelResults');
      function bindClicks() {
        resultsBox.querySelectorAll('.api-model-item').forEach(function(item) {
          item.addEventListener('click', function() { body.querySelector('#apiModel').value = item.textContent; list.classList.remove('show'); });
        });
      }
      bindClicks();
      searchInput.addEventListener('input', function() {
        var kw = this.value.trim().toLowerCase();
        var filtered = kw ? models.filter(function(m) { return m.toLowerCase().indexOf(kw) >= 0; }) : models;
        resultsBox.innerHTML = filtered.map(function(m) { return '<div class="api-model-item' + (m === currentModel ? ' selected' : '') + '">' + esc(m) + '</div>'; }).join('');
        bindClicks();
      });
      if (window.AppNav) window.AppNav.showToast('成功获取 ' + models.length + ' 个模型');
    }).catch(function(err) { 
      if (window.AppNav) window.AppNav.showToast('获取失败: ' + err.message); 
    });
  }

  function renderDataBody() {
    var body = document.getElementById('dataPageContent');
    if(!body) return;
    body.innerHTML = '<div class="data-section">'
      + '<div class="data-item" id="dataExport"><div class="data-item-icon export"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div><div class="data-item-text"><div class="data-item-title">导出数据</div><div class="data-item-desc">导出完整全生态备份数据包</div></div></div>'
      + '<div class="data-item" id="dataImport"><div class="data-item-icon import"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div><div class="data-item-text"><div class="data-item-title">导入数据</div><div class="data-item-desc">导入备份数据并完全覆盖还原</div></div></div>'
      + '<div class="data-item" id="dataClear"><div class="data-item-icon danger"><svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></div><div class="data-item-text"><div class="data-item-title danger">清除所有数据</div><div class="data-item-desc">恢复初始出厂设置</div></div></div>'
      + '</div>';

    body.querySelector('#dataExport').addEventListener('click', exportAllData);
    body.querySelector('#dataImport').addEventListener('click', function() {
      var input = document.createElement('input');
      input.type = 'file'; input.accept = '.json';
      input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
      document.body.appendChild(input);
      input.addEventListener('change', function() {
        var file = this.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(e) {
          try { 
            importAllData(JSON.parse(e.target.result)); 
          } catch(err) { 
            if (window.AppNav) window.AppNav.showToast('文件格式错误'); 
          }
        };
        reader.readAsText(file);
        if (input.parentNode) input.parentNode.removeChild(input);
      });
      input.click();
    });

    body.querySelector('#dataClear').addEventListener('click', function() {
      if (window.AppDialog) {
        window.AppDialog.confirm({
          title: '重置所有数据',
          desc: '确定要清除所有本地数据并恢复初始出厂设置吗？',
          confirmText: '确认清空',
          isDanger: true
        }, function() {
          var request = indexedDB.deleteDatabase('AppDB');
          request.onsuccess = function() {
            try { localStorage.clear(); } catch(e){}
            if (window.AppNav) window.AppNav.showToast('已重置，即将刷新');
            setTimeout(function() { location.reload(); }, 800);
          };
          request.onerror = function() { 
            if (window.AppNav) window.AppNav.showToast('清除失败'); 
          };
        });
      }
    });
  }

  // ============ 全局完整数据键名注册表 (全生态一网打尽) ============
  var ALL_SYSTEM_DATA_KEYS = [
    // 1. 桌面美化与组件排版
    'card_state', 'card_bg', 'card_avatar', 
    'message_avatar', 'message_preview', 'msg_badge_state',
    'couple_data', 'couple_style_state',
    'tabbar_state', 'drag_order', 'home_bg_img', 'beautify_settings',

    // 2. 档案系统 (用户 + 角色 + 羁绊绑定)
    'user_archives_list_v3',
    'user_archive_active_id_v3',
    'character_archives_list_v1',
    'character_archive_active_id_v1',

    // 3. 世界书、预设、正则与色彩主题
    'app_worldbooks_data',
    'app_presets_data',
    'app_regex_data',
    'app_wb_themes',

    // 4. 微信系统 (多账号映射、激活身份、自定义顶底栏背景、朋友圈背景)
    'app_wechat_accounts_map',
    'app_wechat_active_user_id',
    'app_wechat_custom_bgs',
    'app_wechat_curve_style',

    // 5. API 接口配置
    'api_configs',
    'active_api'
  ];

  // ============ 导出完整数据包 ============
  function exportAllData() {
    var result = {
      app: 'Niveous',
      version: '3.0',
      exportTime: new Date().toISOString(),
      data: {}
    };
    var done = 0;

    ALL_SYSTEM_DATA_KEYS.forEach(function(key) {
      if (window.AppDB) {
        window.AppDB.get(key, function(val) {
          if (val !== undefined && val !== null) {
            result.data[key] = val;
          }
          done++;
          if (done === ALL_SYSTEM_DATA_KEYS.length) {
            var blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'niveous-backup-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            if (window.AppNav) window.AppNav.showToast('✦ 全生态数据备份成功 ✦');
          }
        });
      }
    });
  }

  // ============ 导入完整数据包 (无缝还原) ============
  function importAllData(parsedJson) {
    if (!parsedJson || typeof parsedJson !== 'object') {
      if (window.AppNav) window.AppNav.showToast('无效的数据包文件');
      return;
    }

    var sourceData = parsedJson.data && typeof parsedJson.data === 'object' ? parsedJson.data : parsedJson;
    var done = 0;

    ALL_SYSTEM_DATA_KEYS.forEach(function(key) {
      if (window.AppDB) {
        if (sourceData.hasOwnProperty(key) && sourceData[key] !== null && sourceData[key] !== undefined && sourceData[key] !== '') {
          window.AppDB.save(key, sourceData[key], function() { checkDone(); });
        } else {
          checkDone();
        }
      }
    });

    function checkDone() {
      done++;
      if (done === ALL_SYSTEM_DATA_KEYS.length) {
        try {
          if (sourceData.api_configs) localStorage.setItem('api_configs', JSON.stringify(sourceData.api_configs));
          if (sourceData.active_api) localStorage.setItem('active_api', JSON.stringify(sourceData.active_api));
          if (sourceData.beautify_settings) localStorage.setItem('app_beautify_cache', JSON.stringify(sourceData.beautify_settings));
        } catch(e) {}

        if (window.AppNav) window.AppNav.showToast('✦ 数据还原成功，即将刷新 ✦');
        setTimeout(function() { location.reload(); }, 600);
      }
    }
  }

  function esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function loadApiData(callback) {
    if (!window.AppDB) { if(callback) callback(); return; }
    
    window.AppDB.get('api_configs', function(val) {
      if (val && Array.isArray(val) && val.length) {
        apiConfigs = val;
      } else {
        try {
          var local = JSON.parse(localStorage.getItem('api_configs') || '[]');
          if (local.length) apiConfigs = local;
        } catch(e) {}
      }

      window.AppDB.get('active_api', function(activeVal) {
        if (activeVal) {
          activeApi = activeVal;
        } else if (apiConfigs.length) {
          activeApi = apiConfigs[0];
        }
        if (callback) callback();
      });
    });
  }

  function saveApiData() {
    if (window.AppDB) {
      window.AppDB.save('api_configs', apiConfigs);
      if (activeApi) window.AppDB.save('active_api', activeApi); else window.AppDB.delete('active_api');
    }
    try {
      localStorage.setItem('api_configs', JSON.stringify(apiConfigs));
      if (activeApi) localStorage.setItem('active_api', JSON.stringify(activeApi));
    } catch(e) {}
  }

  window.ApiConfig = { 
    getActive: function() { return activeApi; }
  };

})();
