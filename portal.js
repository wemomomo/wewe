
(function () {
  'use strict';

  function esc(str) {
    return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
  }

  window._portalReturnPage = null;

  var ORB_CONFIG_KEY = 'app_floating_orb_config';
  var orbConfig = {
    mode: 'default',
    frameImg: '',
    standeePng: ''
  };

  // 初始月牙扇形中心朝向：默认贴右侧时，月牙朝向左上方 (-135°)
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

  var NOTES_STORAGE_KEY = 'app_portal_inspirations_notes';
  function getNotesList() {
    try {
      return JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || '[]');
    } catch(e) {
      return [];
    }
  }

  function saveNotesList(list) {
    try {
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(list));
    } catch(e) {}
  }

  function hookAppNavReturn() {
    if (!window.AppNav || window.AppNav._hookedPortal) return;
    window.AppNav._hookedPortal = true;

    var originalShowPage = window.AppNav.showPage;
    window.AppNav.showPage = function (targetPage) {
      if (targetPage === 'home' && window._portalReturnPage) {
        var returnTarget = window._portalReturnPage;
        window._portalReturnPage = null;
        return originalShowPage(returnTarget);
      }
      if (targetPage !== 'archive') {
        window._portalReturnPage = null;
      }
      return originalShowPage(targetPage);
    };

    document.addEventListener('click', function (e) {
      var backBtn = e.target.closest('#archShellBackBtn');
      if (backBtn && window._portalReturnPage) {
        e.stopPropagation();
        e.preventDefault();
        var ret = window._portalReturnPage;
        window._portalReturnPage = null;
        window.AppNav.showPage(ret);
      }
    }, true);
  }

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
      + '  <div class="satellite-circle-btn"><div class="satellite-inner-blue">✦</div></div>'
      + '  <span class="satellite-label">记忆</span>'
      + '</div>'
      + '<div class="satellite-item-wrap" data-idx="1" data-portal="api">'
      + '  <div class="satellite-circle-btn"><div class="satellite-inner-blue">✦</div></div>'
      + '  <span class="satellite-label">API</span>'
      + '</div>'
      + '<div class="satellite-item-wrap" data-idx="2" data-portal="arch">'
      + '  <div class="satellite-circle-btn"><div class="satellite-inner-blue">✦</div></div>'
      + '  <span class="satellite-label">档案</span>'
      + '</div>'
      + '<div class="satellite-item-wrap" data-idx="3" data-portal="notes">'
      + '  <div class="satellite-circle-btn"><div class="satellite-inner-blue">✦</div></div>'
      + '  <span class="satellite-label">便签</span>'
      + '</div>'
      + '<div class="satellite-item-wrap" data-idx="4" data-portal="orbStyle">'
      + '  <div class="satellite-circle-btn"><div class="satellite-inner-blue">✦</div></div>'
      + '  <span class="satellite-label">浮球</span>'
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

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.id = 'portalFileInput';
    fileInput.style.cssText = 'position:fixed;top:-9999px;opacity:0;pointer-events:none;';

    document.body.appendChild(orb);
    document.body.appendChild(satellitesGroup);
    document.body.appendChild(panelMask);
    document.body.appendChild(panelCard);
    document.body.appendChild(fileInput);

    applyOrbAppearance(orb);
    bindOrbInteractions(orb, satellitesGroup, panelMask, panelCard, fileInput);
  }

  function applyOrbAppearance(orb) {
    if (!orb) orb = document.getElementById('portalOrb');
    if (!orb) return;

    var isLeft = orb.classList.contains('align-left');
    orb.className = 'portal-floating-orb ' + (isLeft ? 'align-left' : 'align-right') + ' style-' + orbConfig.mode + (orb.classList.contains('open') ? ' open' : '');

    if (orbConfig.mode === 'default') {
      orb.innerHTML = '<img class="orb-custom-icon-img" src="https://niveousmoon.top/images/img_1789899105258_1vbwn.jpg" alt="Orb">';
    } else if (orbConfig.mode === 'blackframe') {
      var src = orbConfig.frameImg || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';
      orb.innerHTML = '<img class="orb-frame-img" src="' + esc(src) + '" alt="照片">';
    } else if (orbConfig.mode === 'pngstandee') {
      var pngSrc = orbConfig.standeePng || 'https://img.icons8.com/isometric/512/anime.png';
      orb.innerHTML = '<img class="orb-png-img" src="' + esc(pngSrc) + '" alt="立绘">';
    }
  }

  // 舒展美观的月牙半包围算法（加大离心距离与分布弧度）
  function renderSatellitesLayout(orb, satellites, centerAngle) {
    var rect = orb.getBoundingClientRect();
    var centerX = rect.left + rect.width / 2;
    var centerY = rect.top + rect.height / 2;
    var radius = 88; // 拉大离心半径，留出舒适间距

    // 扇形分布弧度略微舒展
    var arcOffsets = [-1.32, -0.66, 0, 0.66, 1.32];
    var isOpen = orb.classList.contains('open');

    satellites.forEach(function (sat, i) {
      var angle = centerAngle + arcOffsets[i];
      var x = Math.cos(angle) * radius;
      var y = Math.sin(angle) * radius;

      sat.style.left = Math.round(centerX + x - 19) + 'px';
      sat.style.top = Math.round(centerY + y - 19) + 'px';
      sat.style.transform = isOpen ? 'scale(1)' : 'scale(0)';
    });
  }

  function bindOrbInteractions(orb, satellitesGroup, panelMask, panelCard, fileInput) {
    var satellites = satellitesGroup.querySelectorAll('.satellite-item-wrap');
    var pendingUploadMode = '';

    function syncSatellites() {
      renderSatellitesLayout(orb, satellites, currentArcCenterAngle);
    }

    function toggleOrbOpen() {
      orb.classList.toggle('open');
      syncSatellites();
    }
    function closeOrb() {
      orb.classList.remove('open');
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
        closeOrb();

        if (portalType === 'arch') {
          panelMask.classList.remove('show');
          panelCard.classList.remove('show');

          var curPageEl = document.querySelector('.page.active');
          var curPage = curPageEl ? curPageEl.dataset.page : 'home';
          if (curPage !== 'archive') {
            window._portalReturnPage = curPage;
          }

          if (window.AppNav) {
            window.AppNav.showPage('archive');
          }
          return;
        }

        openFeaturePanel(portalType, panelMask, panelCard, fileInput);
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

    // 1. 悬浮球自由拖拽（拖拽时不收起围绕图标）
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

    // 2. 按住任意图标以悬浮球为圆心整体顺畅转动
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

    fileInput.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (evt) {
        if (pendingUploadMode === 'frame') {
          orbConfig.frameImg = evt.target.result;
          orbConfig.mode = 'blackframe';
        } else if (pendingUploadMode === 'png') {
          orbConfig.standeePng = evt.target.result;
          orbConfig.mode = 'pngstandee';
        }
        saveOrbConfig();
        applyOrbAppearance(orb);
        renderOrbStyleSettings(panelCard.querySelector('#panelBody'), fileInput, function (mode) {
          pendingUploadMode = mode;
        });
      };
      reader.readAsDataURL(file);
    });
  }

  function openFeaturePanel(type, panelMask, panelCard, fileInput) {
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
    } else if (type === 'notes') {
      panelSubTag.textContent = '~ Inspirations ~';
      panelTitle.textContent = '✦ 灵感便签手账本 ✦';
      renderNotesManager(panelBody);
    } else if (type === 'orbStyle') {
      panelSubTag.textContent = '~ Skin Studio ~';
      panelTitle.textContent = '✦ 浮球样式定制 ✦';
      renderOrbStyleSettings(panelBody, fileInput, function (mode) {
        pendingUploadMode = mode;
      });
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

  function renderNotesManager(container) {
    var notes = getNotesList();
    var notesHtml = notes.map(function (txt, idx) {
      return '<div class="note-item-card">'
        + '<span>' + esc(txt) + '</span>'
        + '<span class="note-del-x" data-del-note="' + idx + '" style="color:#b45309;cursor:pointer;font-weight:bold;padding-left:8px;">✕</span>'
        + '</div>';
    }).join('');

    container.innerHTML = '<div class="notes-writer-box">'
      + '<textarea class="notes-textarea" id="portalNoteInput" placeholder="写下此刻的灵感、待办或心绪..."></textarea>'
      + '<button class="notes-add-btn" id="portalAddNoteBtn" type="button">＋ 记下一笔</button>'
      + '</div>'
      + '<div class="notes-list-wrap" id="portalNotesListWrap">' + (notesHtml || '<div class="mem-empty-box"><span>暂无灵感便签</span></div>') + '</div>';

    var addBtn = container.querySelector('#portalAddNoteBtn');
    var input = container.querySelector('#portalNoteInput');

    if (addBtn && input) {
      addBtn.addEventListener('click', function () {
        var val = input.value.trim();
        if (!val) return;
        notes.unshift(val);
        saveNotesList(notes);
        renderNotesManager(container);
      });
    }

    container.querySelectorAll('[data-del-note]').forEach(function (xBtn) {
      xBtn.addEventListener('click', function () {
        var delIdx = parseInt(this.dataset.delNote, 10);
        notes.splice(delIdx, 1);
        saveNotesList(notes);
        renderNotesManager(container);
      });
    });
  }

  function renderOrbStyleSettings(container, fileInput, setPendingMode) {
    var orb = document.getElementById('portalOrb');
    var frameImgSrc = orbConfig.frameImg || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';
    var standeePngSrc = orbConfig.standeePng || 'https://img.icons8.com/isometric/512/anime.png';

    container.innerHTML = ''
      + '<div class="orb-style-row ' + (orbConfig.mode === 'default' ? 'active' : '') + '" data-set-orb="default">'
      + '  <div class="orb-style-preview-box" style="background:rgba(255,255,255,0.9); border:1px solid #cbd5e1;"><img src="https://niveousmoon.top/images/img_1789899105258_1vbwn.jpg" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"></div>'
      + '  <div class="orb-style-info-col">'
      + '    <div class="orb-style-title">默认球</div>'
      + '    <div class="orb-style-desc">专属图像居中圆球。</div>'
      + '  </div>'
      + '</div>'

      + '<div class="orb-style-row ' + (orbConfig.mode === 'blackframe' ? 'active' : '') + '" data-set-orb="blackframe">'
      + '  <div class="orb-style-preview-box" style="border:2px solid #111; overflow:hidden;"><img src="' + esc(frameImgSrc) + '" style="width:100%;height:100%;object-fit:cover;"></div>'
      + '  <div class="orb-style-info-col">'
      + '    <div class="orb-style-title">黑框照片</div>'
      + '    <div class="orb-style-desc">经典黑边拍立得相框，可上传心仪照片。</div>'
      + '  </div>'
      + '  <button class="orb-upload-btn-sm" data-upload="frame" type="button">换图</button>'
      + '</div>'

      + '<div class="orb-style-row ' + (orbConfig.mode === 'pngstandee' ? 'active' : '') + '" data-set-orb="pngstandee">'
      + '  <div class="orb-style-preview-box" style="background:transparent; border:1px dashed #cbd5e1;"><img src="' + esc(standeePngSrc) + '" style="width:100%;height:100%;object-fit:contain;"></div>'
      + '  <div class="orb-style-info-col">'
      + '    <div class="orb-style-title">透明立绘 PNG</div>'
      + '    <div class="orb-style-desc">仅展现角色立绘，四周100%纯透明，无任何底色与遮罩阴影。</div>'
      + '  </div>'
      + '  <button class="orb-upload-btn-sm" data-upload="png" type="button">传立绘</button>'
      + '</div>';

    container.querySelectorAll('[data-set-orb]').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        var chosenMode = this.dataset.setOrb;
        orbConfig.mode = chosenMode;
        saveOrbConfig();
        applyOrbAppearance(orb);
        renderOrbStyleSettings(container, fileInput, setPendingMode);
      });
    });

    container.querySelectorAll('[data-upload]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var targetMode = this.dataset.upload;
        setPendingMode(targetMode);
        fileInput.click();
      });
    });
  }

  function initPortalEngine() {
    ensurePortalDOM();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPortalEngine);
  } else {
    initPortalEngine();
  }

  window.addEventListener('pageChange', initPortalEngine);

})();
