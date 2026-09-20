
(function () {
  'use strict';

  function esc(str) {
    return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
  }

  // 记录来源页面，确保从悬浮球进档案后退出能原路返回
  var currentActiveAppPage = 'home';
  window.addEventListener('pageChange', function (e) {
    var p = e.detail ? e.detail.page : '';
    if (p && p !== 'archive') {
      currentActiveAppPage = p;
    }
  });

  var ORB_CONFIG_KEY = 'app_floating_orb_config';
  var STANDEE_HISTORY_KEY = 'app_portal_standee_history';

  var orbConfig = {
    mode: 'default', // 'default' | 'blackframe' | 'pngstandee'
    frameImg: '',
    standeePng: ''
  };

  // 初始月牙扇形中心朝向
  var currentArcCenterAngle = -Math.PI * 0.75;

  function loadOrbConfig() {
    try {
      var saved = localStorage.getItem(ORB_CONFIG_KEY);
      if (saved) orbConfig = Object.assign(orbConfig, JSON.parse(saved));
    } catch(e) {}
  }

  function saveOrbConfig() {
    try {
      localStorage.setItem(ORB_CONFIG_KEY, JSON.stringify(orbConfig));
    } catch(e) {}
    if (window.AppDB) window.AppDB.save(ORB_CONFIG_KEY, orbConfig);
  }

  // 历史立绘手账库
  function getStandeeHistory() {
    try {
      return JSON.parse(localStorage.getItem(STANDEE_HISTORY_KEY) || '[]');
    } catch(e) {
      return [];
    }
  }

  function saveStandeeHistory(list) {
    try {
      localStorage.setItem(STANDEE_HISTORY_KEY, JSON.stringify(list));
    } catch(e) {}
    if (window.AppDB) window.AppDB.save(STANDEE_HISTORY_KEY, list);
  }

  function addStandeeToHistory(url) {
    if (!url || !url.trim()) return;
    var clean = url.trim();
    var list = getStandeeHistory();
    list = list.filter(function(item) { return item !== clean; });
    list.unshift(clean);
    saveStandeeHistory(list);
  }

  // 纯净 PNG 相册直传（免裁剪，保留透明通道）
  function pickRawPngPhoto(callback) {
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/*';
    fileInput.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(fileInput);

    fileInput.onchange = function (e) {
      var file = e.target.files[0];
      if (!file) {
        if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
        return;
      }
      var reader = new FileReader();
      reader.onload = function (evt) {
        if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
        callback(evt.target.result);
      };
      reader.readAsDataURL(file);
    };

    fileInput.click();
  }

  // 黑框照片 1:1 裁剪通道
  function pickAndCropFramePhoto(callback) {
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(fileInput);

    fileInput.onchange = function (e) {
      var file = e.target.files[0];
      if (!file) {
        if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
        return;
      }
      var reader = new FileReader();
      reader.onload = function (evt) {
        if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
        if (window.AppCropper) {
          window.AppCropper.open(evt.target.result, { aspectRatio: 1 }, function (cropped) {
            callback(cropped);
          });
        } else {
          callback(evt.target.result);
        }
      };
      reader.readAsDataURL(file);
    };

    fileInput.click();
  }

  // ============ 核心：拦截档案退出，确保原路返回来源 App（绝不跳回桌面） ============
  function hookAppNavReturn() {
    if (!window.AppNav || window.AppNav._hookedPortalReturn) return;
    window.AppNav._hookedPortalReturn = true;

    var originalShowPage = window.AppNav.showPage;
    window.AppNav.showPage = function (targetPage) {
      if (targetPage === 'home') {
        var savedOrigin = sessionStorage.getItem('portal_return_origin_app');
        if (savedOrigin && savedOrigin !== 'archive' && savedOrigin !== 'home') {
          sessionStorage.removeItem('portal_return_origin_app');
          return originalShowPage(savedOrigin);
        }
      }
      return originalShowPage(targetPage);
    };

        document.addEventListener('click', function (e) {
      var backBtn = e.target.closest('#archShellBackBtn');
      if (backBtn) {
        var savedOrigin = sessionStorage.getItem('portal_return_origin_app');
        if (savedOrigin && savedOrigin !== 'archive' && savedOrigin !== 'home') {
          e.stopPropagation();
          e.preventDefault();
          sessionStorage.removeItem('portal_return_origin_app');
          window.AppNav.showPage(savedOrigin);

          // 核心：如果之前是从聊天点进去的，返回时把聊天窗口重新亮出来！
          var chatStage = document.getElementById('wxChatRoomStage');
          if (chatStage) {
            chatStage.style.display = 'flex';
          }
        }
      }
    }, true);
  }

  function syncArchiveBackAttribute() {
    var savedOrigin = sessionStorage.getItem('portal_return_origin_app');
    if (!savedOrigin) return;
    var backBtn = document.getElementById('archShellBackBtn');
    if (backBtn) {
      backBtn.setAttribute('data-back', savedOrigin);
    }
  }

  // 单例 DOM 构建（关停便签，只保留 4 个圆钮）
  function ensurePortalDOM() {
    if (document.getElementById('portalOrb')) return;

    loadOrbConfig();
    hookAppNavReturn();

    var orb = document.createElement('div');
    orb.className = 'portal-floating-orb align-right style-' + orbConfig.mode;
    orb.id = 'portalOrb';

    var satellitesGroup = document.createElement('div');
    satellitesGroup.className = 'portal-satellites-group';
    satellitesGroup.id = 'satellitesGroup';
    satellitesGroup.innerHTML = ''
      + '<div class="satellite-item-wrap" data-idx="0" data-portal="mem">'
      + '  <span class="satellite-label-top">记忆</span>'
      + '  <div class="satellite-circle-btn"><div class="satellite-inner-blue">❆</div></div>'
      + '</div>'
      + '<div class="satellite-item-wrap" data-idx="1" data-portal="api">'
      + '  <span class="satellite-label-top">API</span>'
      + '  <div class="satellite-circle-btn"><div class="satellite-inner-blue">❆</div></div>'
      + '</div>'
      + '<div class="satellite-item-wrap" data-idx="2" data-portal="arch">'
      + '  <span class="satellite-label-top">档案</span>'
      + '  <div class="satellite-circle-btn"><div class="satellite-inner-blue">❆</div></div>'
      + '</div>'
      + '<div class="satellite-item-wrap" data-idx="3" data-portal="orbStyle">'
      + '  <span class="satellite-label-top">外观</span>'
      + '  <div class="satellite-circle-btn"><div class="satellite-inner-blue">❆</div></div>'
      + '</div>';

    var panelMask = document.createElement('div');
    panelMask.className = 'portal-panel-mask';
    panelMask.id = 'panelMask';

    var panelCard = document.createElement('div');
    panelCard.className = 'portal-panel-card';
    panelCard.id = 'panelCard';
    panelCard.innerHTML = ''
      + '<div class="panel-head-bar">'
      + '  <div class="panel-head-title-group">'
      + '    <span class="panel-script-tag" id="panelSubTag">~ Sanctuary ~</span>'
      + '    <span class="panel-main-title" id="panelTitle">快捷中枢</span>'
      + '  </div>'
      + '  <button class="panel-close-x" id="panelCloseBtn" type="button">✕</button>'
      + '</div>'
      + '<div class="panel-content-body" id="panelBody"></div>';

    document.body.appendChild(orb);
    document.body.appendChild(satellitesGroup);
    document.body.appendChild(panelMask);
    document.body.appendChild(panelCard);

    applyOrbAppearance(orb);
    bindOrbInteractions(orb, satellitesGroup, panelMask, panelCard);
  }

  // 渲染浮球外观：默认完全透明 PNG，绝无白色背景
  function applyOrbAppearance(orb) {
    if (!orb) orb = document.getElementById('portalOrb');
    if (!orb) return;

    var isLeft = orb.classList.contains('align-left');
    orb.className = 'portal-floating-orb ' + (isLeft ? 'align-left' : 'align-right') + ' style-' + orbConfig.mode + (orb.classList.contains('open') ? ' open' : '');

    if (orbConfig.mode === 'default') {
      orb.innerHTML = '<img class="orb-custom-icon-img" src="https://iili.io/nTN7lxs.md.png" alt="Orb">';
    } else if (orbConfig.mode === 'blackframe') {
      if (orbConfig.frameImg) {
        orb.innerHTML = '<img class="orb-frame-img" src="' + esc(orbConfig.frameImg) + '" alt="照片">';
      } else {
        orb.innerHTML = '<span style="font-size:20px;font-weight:bold;color:#111;">+</span>';
      }
    } else if (orbConfig.mode === 'pngstandee') {
      if (orbConfig.standeePng) {
        orb.innerHTML = '<img class="orb-png-img" src="' + esc(orbConfig.standeePng) + '" alt="立绘">';
      } else {
        orb.innerHTML = '<span style="font-size:12px;color:#111;font-weight:bold;">立绘</span>';
      }
    }
  }

  // 4 个卫星圆环围绕排布（精准 70px 半径）
  function renderSatellitesLayout(orb, satellites, centerAngle) {
    var rect = orb.getBoundingClientRect();
    var centerX = rect.left + rect.width / 2;
    var centerY = rect.top + rect.height / 2;
    var radius = 70;

    // 4 个圆钮的匀称扇形弧度
    var arcOffsets = [-0.99, -0.33, 0.33, 0.99];
    var isOpen = orb.classList.contains('open');

    satellites.forEach(function (sat, i) {
      var angle = centerAngle + arcOffsets[i];
      var x = Math.cos(angle) * radius;
      var y = Math.sin(angle) * radius;

      sat.style.left = Math.round(centerX + x - 19) + 'px';
      sat.style.top = Math.round(centerY + y - 31) + 'px';
      sat.style.transform = isOpen ? 'scale(1)' : 'scale(0)';
    });
  }

  function bindOrbInteractions(orb, satellitesGroup, panelMask, panelCard) {
    var satellites = satellitesGroup.querySelectorAll('.satellite-item-wrap');

    function syncSatellites() {
      renderSatellitesLayout(orb, satellites, currentArcCenterAngle);
    }

    function toggleOrbOpen() {
      orb.classList.toggle('open');
      syncSatellites();
    }

    orb.addEventListener('click', function () {
      if (orb._isDragged) return;
      toggleOrbOpen();
    });

    satellites.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        if (this._hasRotated) {
          this._hasRotated = false;
          return;
        }
        e.stopPropagation();
        var portalType = this.dataset.portal;

                // 点击【档案】：关闭浮球，直接前往档案编辑，并锁定原地返回路径
        if (portalType === 'arch') {
          panelMask.classList.remove('show');
          panelCard.classList.remove('show');

          var origin = currentActiveAppPage || 'home';
          sessionStorage.setItem('portal_return_origin_app', origin);

          // 核心：如果有打开的单聊窗口，把它暂时隐藏，让档案露出来！
          var chatStage = document.getElementById('wxChatRoomStage');
          if (chatStage) {
            chatStage.style.display = 'none';
          }

          if (window.AppNav) {
            window.AppNav.showPage('archive');
          }

          setTimeout(syncArchiveBackAttribute, 60);
          return;
        }

        openFeaturePanel(portalType, panelMask, panelCard);
      });
    });

    panelMask.addEventListener('click', function () {
      panelMask.classList.remove('show');
      panelCard.classList.remove('show');
    });

    var closeBtn = panelCard.querySelector('#panelCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        panelMask.classList.remove('show');
        panelCard.classList.remove('show');
      });
    }

    // 悬浮球自由平移拖拽（启用 passive 避免卡顿）
    (function initOrbGesture() {
      var startX = 0, startY = 0, initialLeft = 0, initialTop = 0, hasMoved = false;

      orb.addEventListener('touchstart', function (e) {
        var touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        var rect = orb.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        orb._isDragged = false;
        hasMoved = false;
        orb.style.transition = 'none';
      }, { passive: true });

      orb.addEventListener('touchmove', function (e) {
        var touch = e.touches[0];
        var dx = touch.clientX - startX;
        var dy = touch.clientY - startY;

        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          hasMoved = true;
          orb._isDragged = true;
        }
        if (!hasMoved) return;

        var nextX = initialLeft + dx;
        var nextY = initialTop + dy;
        orb.style.left = nextX + 'px';
        orb.style.top = nextY + 'px';
        orb.style.right = 'auto';
        orb.style.bottom = 'auto';

        syncSatellites();
      }, { passive: true });

      orb.addEventListener('touchend', function () {
        if (!hasMoved) return;
        var rect = orb.getBoundingClientRect();
        var screenW = window.innerWidth;
        var screenH = window.innerHeight;

        var safeX = Math.max(10, Math.min(screenW - rect.width - 10, rect.left));
        var safeY = Math.max(10, Math.min(screenH - rect.height - 10, rect.top));

        orb.style.left = safeX + 'px';
        orb.style.top = safeY + 'px';

        var isLeft = (safeX + rect.width / 2 < screenW / 2);
        orb.className = 'portal-floating-orb style-' + orbConfig.mode + (isLeft ? ' align-left' : ' align-right') + (orb.classList.contains('open') ? ' open' : '');

        if (!orb._hasCustomRotated) {
          currentArcCenterAngle = isLeft ? (-Math.PI * 0.25) : (-Math.PI * 0.75);
        }
        syncSatellites();
      });
    })();

    // 旋转卫星弧度手势
    (function initArcWheelRotation() {
      var touchedSat = null;
      var startTouchAngle = 0;
      var startArcAngle = 0;
      var isSpinning = false;

      satellites.forEach(function (sat) {
        sat.addEventListener('touchstart', function (e) {
          if (!orb.classList.contains('open')) return;
          var touch = e.touches[0];
          var rect = orb.getBoundingClientRect();
          var cx = rect.left + rect.width / 2;
          var cy = rect.top + rect.height / 2;

          touchedSat = sat;
          startTouchAngle = Math.atan2(touch.clientY - cy, touch.clientX - cx);
          startArcAngle = currentArcCenterAngle;
          isSpinning = false;
          sat._hasRotated = false;

          satellitesGroup.classList.add('is-rotating');
        }, { passive: true });
      });

      window.addEventListener('touchmove', function (e) {
        if (!touchedSat || !orb.classList.contains('open')) return;
        var touch = e.touches[0];
        var rect = orb.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;

        var curTouchAngle = Math.atan2(touch.clientY - cy, touch.clientX - cx);
        var delta = curTouchAngle - startTouchAngle;

        if (Math.abs(delta) > 0.04) {
          isSpinning = true;
          touchedSat._hasRotated = true;
          orb._hasCustomRotated = true;
        }

        if (isSpinning) {
          currentArcCenterAngle = startArcAngle + delta;
          syncSatellites();
        }
      }, { passive: true });

      window.addEventListener('touchend', function () {
        if (!touchedSat) return;
        satellitesGroup.classList.remove('is-rotating');
        setTimeout(function () {
          if (touchedSat) touchedSat._hasRotated = false;
          touchedSat = null;
        }, 80);
      });
    })();
  }

  // ============ 5. 功能面板中枢 ============
  function openFeaturePanel(type, panelMask, panelCard) {
    panelMask.classList.add('show');
    panelCard.classList.add('show');

    var panelTitle = panelCard.querySelector('#panelTitle');
    var panelSubTag = panelCard.querySelector('#panelSubTag');
    var panelBody = panelCard.querySelector('#panelBody');

    if (type === 'mem') {
      panelSubTag.textContent = '~ Memories ~';
      panelTitle.textContent = '✦ 角色记忆时间轴 ✦';
      renderMemoryCorridor(panelBody);
    } else if (type === 'api') {
      panelSubTag.textContent = '~ Endpoints ~';
      panelTitle.textContent = '✦ API 接口快捷切换 ✦';
      renderApiSwitcher(panelBody);
    } else if (type === 'orbStyle') {
      panelSubTag.textContent = '~ Skin Studio ~';
      panelTitle.textContent = '✦ 浮球样式定制 ✦';
      renderOrbStyleSettings(panelBody);
    }
  }

  function renderMemoryCorridor(container) {
    var charList = [];
    try {
      charList = JSON.parse(localStorage.getItem('character_archives_list_v1') || '[]');
    } catch(e) {}
    var activeCharId = window._chatActiveCharId || (charList.length ? charList[0].id : null);
    var activeChar = charList.find(function (c) { return c.id === activeCharId; }) || charList[0];

    if (!activeChar) {
      container.innerHTML = '<div class="mem-empty-box"><span>✦ 暂无角色档案，请先在档案中创建 ✦</span></div>';
      return;
    }

    var memories = [];
    if (window.WxChatMemory && window.WxChatMemory.getMemories) {
      memories = window.WxChatMemory.getMemories(activeChar.id);
    }

    var listHtml = '';
    if (!memories.length) {
      listHtml = '<div class="mem-empty-box"><span>✦ 「' + esc(activeChar.name) + '」暂无往昔手账，今夜午夜将凝结第一篇回忆 ✦</span></div>';
    } else {
      listHtml = memories.map(function (mem) {
        return '<div class="mem-trio-card">'
          + '<div class="mem-col-left">'
          + '  <span class="mem-date-badge">' + esc(mem.dateStr) + '</span>'
          + '  <div class="mem-track-text">' + esc(mem.track) + '</div>'
          + '</div>'
          + '<div class="mem-spine-divider"><span class="mem-star-node">✦</span></div>'
          + '<div class="mem-col-mid">'
          + '  <div class="mem-thought-quote">“ ' + esc(mem.thoughts) + ' ”</div>'
          + '  <div class="mem-summary-sub">共话：' + esc(mem.summary) + '</div>'
          + '</div>'
          + '<div class="mem-col-right">'
          + '  <button class="mem-archive-btn" data-archive-date="' + esc(mem.dateStr) + '" data-char-id="' + esc(activeChar.id) + '" type="button">'
          + '    <span>溯源</span>'
          + '  </button>'
          + '</div>'
          + '</div>';
      }).join('');
    }

    container.innerHTML = listHtml;

    container.querySelectorAll('.mem-archive-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dKey = this.dataset.archiveDate;
        var cId = this.dataset.charId;
        var archiveMsgs = [];
        try {
          archiveMsgs = JSON.parse(localStorage.getItem('wx_chat_archive_' + cId + '_' + dKey) || '[]');
        } catch(e) {}
        if (window.AppNav) {
          window.AppNav.showToast(dKey + ' 包含 ' + archiveMsgs.length + ' 条原始对话记录');
        }
      });
    });
  }

  function renderApiSwitcher(container) {
    var apiConfigs = [];
    var activeApi = null;
    try {
      apiConfigs = JSON.parse(localStorage.getItem('api_configs') || '[]');
      activeApi = JSON.parse(localStorage.getItem('active_api') || 'null');
    } catch(e) {}

    if (!apiConfigs.length) {
      container.innerHTML = '<div class="mem-empty-box"><span>暂无已存接口，请在「设置 - API 配置」中添加</span></div>';
      return;
    }

    container.innerHTML = apiConfigs.map(function (cfg) {
      var isActive = activeApi && activeApi.name === cfg.name;
      return '<div class="api-card-pill' + (isActive ? ' active' : '') + '" data-api-name="' + esc(cfg.name) + '">'
        + '<div class="api-pill-info">'
        + '  <div class="api-pill-name">' + esc(cfg.name) + '</div>'
        + '  <div class="api-pill-model">' + esc(cfg.model || '默认模型') + '</div>'
        + '</div>'
        + '<span class="api-pill-badge">' + (isActive ? '当前启用' : '点击切换') + '</span>'
        + '</div>';
    }).join('');

    container.querySelectorAll('.api-card-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        var chosenName = this.dataset.apiName;
        var chosen = apiConfigs.find(function (a) { return a.name === chosenName; });
        if (chosen) {
          try {
            localStorage.setItem('active_api', JSON.stringify(chosen));
          } catch(e) {}
          if (window.AppDB) window.AppDB.save('active_api', chosen);
          if (window.AppNav) window.AppNav.showToast('已切换为接口: ' + chosen.name);
          renderApiSwitcher(container);
        }
      });
    });
  }

  // 浮球样式定制面板（含 PNG URL 输入 & 历史立绘手账架带复制按钮）
  function renderOrbStyleSettings(container) {
    var orb = document.getElementById('portalOrb');
    var standeeHistory = getStandeeHistory();

    var framePreviewInner = orbConfig.frameImg
      ? '<img src="' + esc(orbConfig.frameImg) + '" style="width:100%;height:100%;object-fit:cover;">'
      : '<span style="font-size:18px;font-weight:bold;color:#111;">+</span>';

    var standeePreviewInner = orbConfig.standeePng
      ? '<img src="' + esc(orbConfig.standeePng) + '" style="width:100%;height:100%;object-fit:contain;">'
      : '<span style="font-size:18px;font-weight:bold;color:#888;">+</span>';

    var historyShelfHtml = '';
    if (standeeHistory.length) {
      historyShelfHtml = '<div class="standee-panel-title-row"><span class="standee-panel-title">历史立绘手账架 (' + standeeHistory.length + ')</span></div>'
        + '<div class="standee-history-shelf">'
        + standeeHistory.map(function(imgUrl, idx) {
            var isCur = (orbConfig.standeePng === imgUrl && orbConfig.mode === 'pngstandee');
            return '<div class="standee-history-item-wrap">'
              + '  <div class="standee-history-card' + (isCur ? ' active' : '') + '" data-pick-history="' + esc(imgUrl) + '">'
              + '    <img class="standee-history-img" src="' + esc(imgUrl) + '" alt="历史立绘">'
              + '    <span class="standee-del-x" data-del-history="' + idx + '">✕</span>'
              + '  </div>'
              + '  <button class="standee-copy-link-btn" data-copy-link="' + esc(imgUrl) + '" type="button" title="复制链接">'
              + '    <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
              + '  </button>'
              + '</div>';
          }).join('')
        + '</div>';
    }

    container.innerHTML = ''
      // 样式 1：默认透明球
      + '<div class="orb-style-row ' + (orbConfig.mode === 'default' ? 'active' : '') + '" data-set-orb="default">'
      + '  <div class="orb-style-preview-box" style="background:transparent;"><img src="https://iili.io/nTN7lxs.md.png" style="width:100%;height:100%;object-fit:contain;"></div>'
      + '  <div class="orb-style-info-col">'
      + '    <div class="orb-style-title">默认透明球</div>'
      + '    <div class="orb-style-desc">专属图像居中，四周100%纯透明。</div>'
      + '  </div>'
      + '</div>'

      // 样式 2：黑边框相框（调起 1:1 裁剪）
      + '<div class="orb-style-row ' + (orbConfig.mode === 'blackframe' ? 'active' : '') + '" data-set-orb="blackframe">'
      + '  <div class="orb-style-preview-box" data-trigger-upload="frame" style="border:2px solid #111; overflow:hidden; background:#ffffff;">' + framePreviewInner + '</div>'
      + '  <div class="orb-style-info-col">'
      + '    <div class="orb-style-title">黑框照片</div>'
      + '    <div class="orb-style-desc">经典黑边相框，点击左侧头像上传并剪裁照片。</div>'
      + '  </div>'
      + '</div>'

      // 样式 3：完全纯净透明底 PNG 立绘
      + '<div class="orb-style-row ' + (orbConfig.mode === 'pngstandee' ? 'active' : '') + '" data-set-orb="pngstandee">'
      + '  <div class="orb-style-preview-box" data-trigger-upload="png" style="background:transparent; border:1px dashed #cbd5e1;">' + standeePreviewInner + '</div>'
      + '  <div class="orb-style-info-col">'
      + '    <div class="orb-style-title">透明立绘 PNG</div>'
      + '    <div class="orb-style-desc">点击左侧相册直传，或在下方输入链接与调阅历史。</div>'
      + '  </div>'
      + '</div>'

      // PNG 立绘专属 URL 输入与历史架
      + '<div class="standee-custom-panel">'
      + '  <div class="standee-panel-title-row">'
      + '    <span class="standee-panel-title">链接上传 PNG 立绘</span>'
      + '  </div>'
      + '  <div class="standee-url-input-wrap">'
      + '    <input class="standee-url-input" id="standeeUrlInput" type="text" placeholder="粘贴透明 PNG 图像链接...">'
      + '    <button class="standee-btn" id="standeeApplyUrlBtn" type="button">应用</button>'
      + '    <button class="standee-btn outline" id="standeePickLocalBtn" type="button">相册</button>'
      + '  </div>'
      + '  ' + historyShelfHtml
      + '</div>';

    function triggerFramePick() {
      pickAndCropFramePhoto(function (base64) {
        orbConfig.frameImg = base64;
        orbConfig.mode = 'blackframe';
        saveOrbConfig();
        applyOrbAppearance(orb);
        renderOrbStyleSettings(container);
        if (window.AppNav) window.AppNav.showToast('照片已更新');
      });
    }

    function triggerPngPick() {
      pickRawPngPhoto(function (base64) {
        orbConfig.standeePng = base64;
        orbConfig.mode = 'pngstandee';
        addStandeeToHistory(base64);
        saveOrbConfig();
        applyOrbAppearance(orb);
        renderOrbStyleSettings(container);
        if (window.AppNav) window.AppNav.showToast('透明立绘已更新');
      });
    }

    // URL 应用
    var urlInput = container.querySelector('#standeeUrlInput');
    var applyUrlBtn = container.querySelector('#standeeApplyUrlBtn');
    var pickLocalBtn = container.querySelector('#standeePickLocalBtn');

    if (applyUrlBtn && urlInput) {
      applyUrlBtn.addEventListener('click', function () {
        var urlVal = urlInput.value.trim();
        if (!urlVal) {
          if (window.AppNav) window.AppNav.showToast('请先粘贴立绘链接');
          return;
        }
        orbConfig.standeePng = urlVal;
        orbConfig.mode = 'pngstandee';
        addStandeeToHistory(urlVal);
        saveOrbConfig();
        applyOrbAppearance(orb);
        renderOrbStyleSettings(container);
        if (window.AppNav) window.AppNav.showToast('立绘链接已应用并归档');
      });
    }

    if (pickLocalBtn) {
      pickLocalBtn.addEventListener('click', triggerPngPick);
    }

    // 点击历史立绘卡片换装
    container.querySelectorAll('[data-pick-history]').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('.standee-del-x') || e.target.closest('.standee-copy-link-btn')) return;
        var chosenUrl = this.dataset.pickHistory;
        orbConfig.standeePng = chosenUrl;
        orbConfig.mode = 'pngstandee';
        saveOrbConfig();
        applyOrbAppearance(orb);
        renderOrbStyleSettings(container);
        if (window.AppNav) window.AppNav.showToast('已切换至该立绘');
      });
    });

    // 复制立绘链接到剪贴板
    container.querySelectorAll('[data-copy-link]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var link = this.dataset.copyLink;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link);
        } else {
          var ta = document.createElement('textarea');
          ta.value = link;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        if (window.AppNav) window.AppNav.showToast('链接已复制到剪贴板');
      });
    });

    // 删除单张历史立绘
    container.querySelectorAll('[data-del-history]').forEach(function(xBtn) {
      xBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var delIdx = parseInt(this.dataset.delHistory, 10);
        var list = getStandeeHistory();
        var removed = list.splice(delIdx, 1)[0];
        saveStandeeHistory(list);
        if (orbConfig.standeePng === removed) {
          orbConfig.standeePng = list.length ? list[0] : '';
          saveOrbConfig();
          applyOrbAppearance(orb);
        }
        renderOrbStyleSettings(container);
      });
    });

    container.querySelectorAll('[data-set-orb]').forEach(function (row) {
      row.addEventListener('click', function (e) {
        var chosenMode = this.dataset.setOrb;
        var uploadTarget = e.target.closest('[data-trigger-upload]');

        if (uploadTarget) {
          var targetType = uploadTarget.dataset.triggerUpload;
          if (targetType === 'frame') triggerFramePick();
          else if (targetType === 'png') triggerPngPick();
          return;
        }

        if (chosenMode === 'blackframe' && !orbConfig.frameImg) {
          triggerFramePick();
          return;
        }
        if (chosenMode === 'pngstandee' && !orbConfig.standeePng) {
          triggerPngPick();
          return;
        }

        orbConfig.mode = chosenMode;
        saveOrbConfig();
        applyOrbAppearance(orb);
        renderOrbStyleSettings(container);
      });
    });
  }

  // ============ 6. 初始化 ============
  function initPortalEngine() {
    ensurePortalDOM();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPortalEngine);
  } else {
    initPortalEngine();
  }

  window.addEventListener('pageChange', function(e) {
    initPortalEngine();
    if (e.detail && e.detail.page === 'archive') {
      setTimeout(syncArchiveBackAttribute, 60);
    }
  });

})();
