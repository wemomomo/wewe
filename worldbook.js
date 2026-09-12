
(function () {
  'use strict';

  var sectionThemes = {
    wb: { color: '#88abda', bg: 'rgba(136, 171, 218, 0.25)' },
    preset: { color: '#88abda', bg: 'rgba(136, 171, 218, 0.25)' },
    regex: { color: '#88abda', bg: 'rgba(136, 171, 218, 0.25)' }
  };

  var sectionMeta = {
    wb: { title: '世界书', en: 'WORLD BOOK' },
    preset: { title: '预设', en: 'PRESETS' },
    regex: { title: '正则', en: 'REGEX' }
  };

  var state = {
    currentSection: 'wb',
    currentLevel: 'home', // 'home' | 'entries' | 'edit' | 'book_meta'
    worldbooks: [],
    presets: [],
    regexes: [],
    currentWbId: null,
    currentEntryId: null,
    isCreatingNewWb: false,
    editTempTags: [],
    initialized: false
  };

  window.WorldbookState = state;

  // ============ 数据持久化 (仅在进入模块时按需执行) ============
  function loadAllData(callback) {
    if (!window.AppDB) {
      state.worldbooks = [];
      if (callback) callback();
      return;
    }
    window.AppDB.get('app_worldbooks_data', function (wbData) {
      state.worldbooks = Array.isArray(wbData) ? wbData.filter(function (w) { return w.title !== '默认角色世界观'; }) : [];
      window.AppDB.get('app_presets_data', function (preData) {
        state.presets = Array.isArray(preData) ? preData : [];
        window.AppDB.get('app_regex_data', function (regData) {
          state.regexes = Array.isArray(regData) ? regData : [];
          window.AppDB.get('app_wb_themes', function (themes) {
            if (themes) sectionThemes = themes;
            if (callback) callback();
          });
        });
      });
    });
  }

  function saveWorldbooksData() {
    if (window.AppDB) window.AppDB.save('app_worldbooks_data', state.worldbooks);
  }

  function saveThemesData() {
    if (window.AppDB) window.AppDB.save('app_wb_themes', sectionThemes);
  }

  function updateThemeVariables(theme) {
    document.documentElement.style.setProperty('--wb-cur-theme', theme.color);
    document.documentElement.style.setProperty('--wb-cur-theme-bg', theme.bg);
  }

  // ============ 裁剪封面 ============
  function handleCoverClick(wbId) {
    var wb = state.worldbooks.find(function (w) { return w.id === wbId; });
    if (!wb) return;

    if (window.PhotoAction) {
      window.PhotoAction.show(
        function () {
          var fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = 'image/*';
          fileInput.onchange = function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (evt) {
              if (window.AppCropper) {
                window.AppCropper.open(evt.target.result, { aspectRatio: 1 }, function (croppedData) {
                  wb.cover = croppedData;
                  saveWorldbooksData();
                  renderHomeView();
                });
              } else {
                wb.cover = evt.target.result;
                saveWorldbooksData();
                renderHomeView();
              }
            };
            reader.readAsDataURL(file);
          };
          fileInput.click();
        },
        function () {
          wb.cover = '';
          saveWorldbooksData();
          renderHomeView();
        }
      );
    }
  }

  // ============ 导入 .docx ============
  function importWorldbookDocx() {
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    fileInput.onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var wbName = file.name.replace(/\.[^/.]+$/, '') || '导入的世界书';

      var reader = new FileReader();
      reader.onload = function (evt) {
        try {
          var arrayBuffer = evt.target.result;
          var textContent = extractDocxText(arrayBuffer);
          if (!textContent || !textContent.trim()) {
            textContent = '从文档中导入的内容设定。';
          }

          var newEntry = {
            id: 'entry_' + Date.now(),
            name: wbName + ' 设定',
            content: textContent.trim(),
            mode: 'key',
            keys: [wbName],
            scanDepth: 4,
            pos: 'depth',
            depthVal: 2,
            enabled: true
          };

          var newWb = {
            id: 'wb_' + Date.now(),
            title: wbName,
            cover: '',
            entries: [newEntry]
          };

          state.worldbooks.push(newWb);
          saveWorldbooksData();
          renderHomeView();
          if (window.AppNav) window.AppNav.showToast('✦ 成功导入文档：《' + wbName + '》 ✦');
        } catch (err) {
          if (window.AppNav) window.AppNav.showToast('文档解析失败，请确保为标准 .docx 格式');
        }
      };
      reader.readAsArrayBuffer(file);
    };
    fileInput.click();
  }

  function extractDocxText(buffer) {
    try {
      var bytes = new Uint8Array(buffer);
      var textParts = [];
      var decoder = new TextDecoder('utf-8');
      var decoded = decoder.decode(bytes);

      var matches = decoded.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g);
      if (matches && matches.length) {
        for (var i = 0; i < matches.length; i++) {
          var clean = matches[i].replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '');
          clean = clean.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
          textParts.push(clean);
        }
        return textParts.join('');
      }

      var pMatches = decoded.match(/<w:p[^>]*>([\s\S]*?)<\/w:p>/g);
      if (pMatches && pMatches.length) {
        for (var j = 0; j < pMatches.length; j++) {
          var pClean = pMatches[j].replace(/<[^>]+>/g, '');
          if (pClean && pClean.trim()) textParts.push(pClean.trim());
        }
        return textParts.join('\n');
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  // ============ 导出 JSON ============
  function exportWorldbookJSON(wbId) {
    var wb = state.worldbooks.find(function (w) { return w.id === wbId; });
    if (!wb) return;

    var exportData = {
      name: wb.title || 'WorldBook',
      description: 'Exported from Niveous Studio',
      entries: (wb.entries || []).map(function (en, idx) {
        return {
          uid: idx + 1,
          key: en.keys || [],
          comment: en.name || '',
          content: en.content || '',
          constant: en.mode === 'const',
          order: en.depthVal || 2,
          position: en.pos === 'before' ? 0 : (en.pos === 'after' ? 1 : 2),
          disable: en.enabled === false,
          scan_depth: en.scanDepth || 4
        };
      })
    };

    var dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    var downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', (wb.title || 'worldbook') + '.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    if (window.AppNav) window.AppNav.showToast('✦ 世界书已成功导出 ✦');
  }

  // ============ 单例 DOM 构建 ============
  function ensureWorldbookDOM() {
    var page = document.querySelector('[data-page="worldbook"]');
    if (!page) return null;

    var container = document.getElementById('worldbookContent');
    if (!container) {
      container = document.createElement('div');
      container.className = 'app-content';
      container.id = 'worldbookContent';
      page.appendChild(container);
    }

    if (!container.querySelector('#wbMainContainer')) {
      container.innerHTML = ''
        + '<div class="wb-container" id="wbMainContainer">'
        // 1. 顶栏：贯穿虚线星轨 + 标题 + 对齐中文字的按钮
        + '  <div class="wb-top-header-row" id="wbTopHeaderRow">'
        + '    <div class="wb-header-left-col">'
        + '      <span class="wb-title-main" id="wbHeaderMainTitle">世界书</span>'
        + '      <span class="wb-title-sub-en" id="wbHeaderSubEn">WORLD BOOK</span>'
        + '    </div>'
        + '    <div class="wb-header-center-wrap">'
        + '      <button class="wb-header-circle-btn" id="wbBtnLeftSwitch" type="button" title="切换板块">'
        + '        <div class="wb-circle-core">⇅</div>'
        + '      </button>'
        + '    </div>'
        + '    <div class="wb-header-right-wrap">'
        + '      <button class="wb-header-circle-btn" id="wbBtnRightAction" type="button" title="新建与改色">'
        + '        <div class="wb-circle-core plus-icon">+</div>'
        + '      </button>'
        + '    </div>'
        // 切换板块浮层
        + '    <div class="wb-left-switch-popover" id="wbLeftSwitchPopover">'
        + '      <div class="wb-pop-item active" data-switch-to="wb">世界书</div>'
        + '      <div class="wb-pop-item" data-switch-to="preset">预设</div>'
        + '      <div class="wb-pop-item" data-switch-to="regex">正则</div>'
        + '    </div>'
        // 新建与改色浮层
        + '    <div class="wb-right-menu-popover" id="wbRightMenuPopover">'
        + '      <button class="wb-action-card-btn" id="wbPopBtnNew" type="button">'
        + '        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>'
        + '        <span>新建独立世界书</span>'
        + '      </button>'
        + '      <button class="wb-action-card-btn" id="wbPopBtnImport" type="button">'
        + '        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>'
        + '        <span>导入世界书 (.docx)</span>'
        + '      </button>'
        + '      <div class="wb-menu-color-row">'
        + '        <div class="wb-swatch-dot" style="background:#88abda;" data-color="#88abda" data-bg="rgba(136,171,218,0.25)" title="经典冰蓝"></div>'
        + '        <div class="wb-swatch-dot" style="background:#8e8e93;" data-color="#8e8e93" data-bg="rgba(142,142,147,0.25)" title="高级浅灰"></div>'
        + '        <div class="wb-custom-color-item" title="自定义取色">'
        + '          <input type="color" class="wb-custom-color-input" id="wbCustomColorInput" value="#88abda">'
        + '        </div>'
        + '      </div>'
        + '    </div>'
        + '  </div>'

        // 2. 主视口画卷（首页列表）
        + '  <div class="wb-viewport-box" id="wbHomeView"></div>'

        // 3. 新建世界书名称页面
        + '  <div class="wb-viewport-box wb-view-hidden" id="wbBookMetaView"></div>'

        // 4. 词条列表视口
        + '  <div class="wb-viewport-box wb-view-hidden" id="wbEntriesView"></div>'

        // 5. 词条编辑视口
        + '  <div class="wb-viewport-box wb-view-hidden" id="wbEditView"></div>'

        // 6. 全屏沉浸式编辑弹层
        + '  <div class="wb-expanded-modal" id="wbExpandedModal">'
        + '    <div class="wb-edit-nav-bar" style="justify-content:space-between;">'
        + '      <span style="font-size:15px; font-weight:800; color:#1c1c1e;">沉浸编辑</span>'
        + '      <button class="wb-btn-expand-icon" id="wbBtnCollapse" type="button">'
        + '        <svg viewBox="0 0 24 24"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>'
        + '      </button>'
        + '    </div>'
        + '    <textarea class="wb-expanded-textarea" id="wbExpandedText" placeholder="畅写长篇设定..."></textarea>'
        + '  </div>'
        + '</div>';
    }

    return container;
  }

  // ============ 1. 渲染首页 ============
  function renderHomeView() {
    state.currentLevel = 'home';
    state.isCreatingNewWb = false;
    var homeBox = document.getElementById('wbHomeView');
    if (!homeBox) return;

    homeBox.classList.remove('wb-view-hidden');
    homeBox.style.display = 'flex';
    homeBox.scrollTop = 0;

    var headerRow = document.getElementById('wbTopHeaderRow');
    if (headerRow) headerRow.style.display = 'flex';

    var metaView = document.getElementById('wbBookMetaView');
    if (metaView) metaView.classList.add('wb-view-hidden');

    var entriesView = document.getElementById('wbEntriesView');
    if (entriesView) entriesView.classList.add('wb-view-hidden');

    var editView = document.getElementById('wbEditView');
    if (editView) editView.classList.add('wb-view-hidden');

    var meta = sectionMeta[state.currentSection];
    if (meta) {
      var mainTitleEl = document.getElementById('wbHeaderMainTitle');
      var subEnEl = document.getElementById('wbHeaderSubEn');
      if (mainTitleEl) mainTitleEl.innerText = meta.title;
      if (subEnEl) subEnEl.innerText = meta.en;
    }

    var html = '';

    if (state.currentSection === 'wb') {
      if (!state.worldbooks || state.worldbooks.length === 0) {
        html = '<div class="wb-empty-tip">✦ 暂无世界书，请点击右上角 + 新建 ✦</div>';
      } else {
        state.worldbooks.forEach(function (wb) {
          var coverImgHtml = wb.cover ? '<img src="' + wb.cover + '" alt="封面">' : '<img src="" alt="封面">';
          var hasImgCls = wb.cover ? ' has-img' : '';
          html += ''
            + '<div class="wb-main-card" data-wb-id="' + wb.id + '">'
            + '  <div class="wb-row-left" data-enter-wb="' + wb.id + '">'
            + '    <div class="wb-cover-wrap' + hasImgCls + '" data-cover-wb="' + wb.id + '">'
            + coverImgHtml
            + '      <svg class="wb-camera-icon" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>'
            + '    </div>'
            + '    <div class="wb-row-info">'
            + '      <div class="wb-row-title-line"><span class="wb-row-title">' + (wb.title || '未命名世界书') + '</span></div>'
            + '      <div class="wb-row-desc"><span>✦ ' + (wb.entries ? wb.entries.length : 0) + ' 条深度词条</span></div>'
            + '    </div>'
            + '  </div>'
            + '  <button class="wb-more-btn" type="button" data-wb-more="' + wb.id + '">'
            + '    <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>'
            + '  </button>'
            + '  <div class="wb-dropdown-menu" id="wbMenu_' + wb.id + '">'
            + '    <div class="wb-menu-item" data-menu-act="copy" data-id="' + wb.id + '">复制</div>'
            + '    <div class="wb-menu-item" data-menu-act="export" data-id="' + wb.id + '">导出</div>'
            + '    <div class="wb-menu-item del" data-menu-act="del" data-id="' + wb.id + '">删除</div>'
            + '  </div>'
            + '</div>';
        });
      }
    } else {
      html = '<div class="wb-empty-tip">✦ 模块正在运行中 ✦</div>';
    }
    homeBox.innerHTML = html;

    setupAnchorLockedDragSort(homeBox, '.wb-main-card', function (newOrderIds) {
      state.worldbooks.sort(function (a, b) {
        return newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id);
      });
      saveWorldbooksData();
    });
  }

  // ============ 2. 渲染新建世界书名称页面 ============
  function renderBookMetaView(wbId) {
    state.currentLevel = 'book_meta';
    state.currentWbId = wbId;
    var wb = state.worldbooks.find(function (w) { return w.id === wbId; });

    var headerRow = document.getElementById('wbTopHeaderRow');
    if (headerRow) headerRow.style.display = 'none';

    var homeView = document.getElementById('wbHomeView');
    if (homeView) homeView.classList.add('wb-view-hidden');

    var entriesView = document.getElementById('wbEntriesView');
    if (entriesView) entriesView.classList.add('wb-view-hidden');

    var editView = document.getElementById('wbEditView');
    if (editView) editView.classList.add('wb-view-hidden');

    var metaBox = document.getElementById('wbBookMetaView');
    if (!metaBox) return;

    metaBox.classList.remove('wb-view-hidden');
    metaBox.style.display = 'flex';
    metaBox.scrollTop = 0;

    var titleVal = (wb && wb.title) ? wb.title : '';

    var html = ''
      + '<div class="wb-meta-nav-bar">'
      + '  <button class="wb-meta-back-btn" id="wbBtnMetaBack" type="button">'
      + '    <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>'
      + '  </button>'
      + '  <button class="wb-meta-confirm-btn" id="wbBtnSaveBookMeta" type="button">确定</button>'
      + '</div>'
      + '<div class="wb-meta-body-wrap">'
      + '  <span class="wb-meta-title-label">世界书名称</span>'
      + '  <input class="wb-underline-input" type="text" id="wbIptBookTitle" value="' + titleVal + '" placeholder="输入世界书名称" autofocus>'
      + '</div>';

    metaBox.innerHTML = html;
  }

  // ============ 3. 渲染词条列表页 ============
  function renderEntriesView(wbId) {
    state.currentLevel = 'entries';
    state.currentWbId = wbId;
    var wb = state.worldbooks.find(function (w) { return w.id === wbId; });
    if (!wb) return;

    var headerRow = document.getElementById('wbTopHeaderRow');
    if (headerRow) headerRow.style.display = 'none';

    var homeView = document.getElementById('wbHomeView');
    if (homeView) homeView.classList.add('wb-view-hidden');

    var metaView = document.getElementById('wbBookMetaView');
    if (metaView) metaView.classList.add('wb-view-hidden');

    var editView = document.getElementById('wbEditView');
    if (editView) editView.classList.add('wb-view-hidden');

    var entriesBox = document.getElementById('wbEntriesView');
    if (!entriesBox) return;

    entriesBox.classList.remove('wb-view-hidden');
    entriesBox.style.display = 'flex';
    entriesBox.scrollTop = 0;

    var html = ''
      + '<div class="wb-entries-nav-bar">'
      + '  <button class="wb-entries-back-btn" id="wbBtnEntriesBack" type="button">'
      + '    <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>'
      + '  </button>'
      + '  <div class="wb-entries-title-center-wrap" id="wbBtnEditBookTitle" title="点击编辑书名">'
      + '    <span class="wb-entries-book-title">' + (wb.title || '世界书') + '</span>'
      + '    <div class="wb-entries-title-underline"></div>'
      + '  </div>'
      + '  <button class="wb-nav-btn-plus-only" id="wbNavBtnNewEntry" type="button" title="新建词条">'
      + '    <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>'
      + '  </button>'
      + '</div>'
      + '<div class="wb-viewport-box" id="wbEntriesListBox">';

    if (!wb.entries || wb.entries.length === 0) {
      html += '<div class="wb-empty-tip">✦ 暂无词条，请点击右上角 ＋ 新建 ✦</div>';
    } else {
      wb.entries.forEach(function (entry) {
        var switchCls = entry.enabled !== false ? 'on' : '';
        
        var pillTagHtml = '';
        if (entry.mode === 'const') {
          pillTagHtml = '<span class="wb-entry-pill-tag active">常驻</span>';
        } else if (entry.pos === 'depth') {
          pillTagHtml = '<span class="wb-entry-pill-tag active">深度 ' + (entry.depthVal || 2) + '</span>';
        } else if (entry.pos === 'before') {
          pillTagHtml = '<span class="wb-entry-pill-tag">定义前</span>';
        } else {
          pillTagHtml = '<span class="wb-entry-pill-tag">定义后</span>';
        }

        html += ''
          + '<div class="wb-entry-item-card" data-entry-id="' + entry.id + '">'
          + '  <div class="wb-entry-left-row" data-open-entry="' + entry.id + '">'
          + '    <span class="wb-entry-title-text">' + (entry.name || '未命名词条') + '</span>'
          +      pillTagHtml
          + '  </div>'
          + '  <div class="wb-entry-icons-row">'
          + '    <button class="wb-entry-icon-btn" title="编辑" data-entry-act="edit" data-id="' + entry.id + '"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>'
          + '    <button class="wb-entry-icon-btn" title="复制" data-entry-act="copy" data-id="' + entry.id + '"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>'
          + '    <button class="wb-entry-icon-btn del" title="删除" data-entry-act="del" data-id="' + entry.id + '"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>'
          + '    <div class="wb-entry-switch ' + switchCls + '" title="开关" data-entry-act="toggle" data-id="' + entry.id + '"></div>'
          + '  </div>'
          + '</div>';
      });
    }
    html += '</div>';

    html += ''
      + '<div class="wb-entries-bottom-save-bar">'
      + '  <button class="wb-entries-btn-save-center" id="wbBtnSaveEntriesConfirm" type="button">保存</button>'
      + '</div>';

    entriesBox.innerHTML = html;

    var listWrap = document.getElementById('wbEntriesListBox');
    if (listWrap) {
      setupAnchorLockedDragSort(listWrap, '.wb-entry-item-card', function (newOrderIds) {
        wb.entries.sort(function (a, b) {
          return newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id);
        });
        saveWorldbooksData();
      });
    }
  }

  // ============ 4. 渲染词条编辑页 ============
  function renderEditView(entryId) {
    state.currentLevel = 'edit';
    state.currentEntryId = entryId;
    var wb = state.worldbooks.find(function (w) { return w.id === state.currentWbId; });
    var entry = (entryId && wb) ? (wb.entries || []).find(function (e) { return e.id === entryId; }) : null;

    state.editTempTags = (entry && Array.isArray(entry.keys)) ? [...entry.keys] : [];

    var headerRow = document.getElementById('wbTopHeaderRow');
    if (headerRow) headerRow.style.display = 'none';

    var homeView = document.getElementById('wbHomeView');
    if (homeView) homeView.classList.add('wb-view-hidden');

    var metaView = document.getElementById('wbBookMetaView');
    if (metaView) metaView.classList.add('wb-view-hidden');

    var entriesView = document.getElementById('wbEntriesView');
    if (entriesView) entriesView.classList.add('wb-view-hidden');

    var editBox = document.getElementById('wbEditView');
    if (!editBox) return;

    editBox.classList.remove('wb-view-hidden');
    editBox.style.display = 'flex';
    editBox.scrollTop = 0;

    var mode = (entry && entry.mode) ? entry.mode : 'key';
    var pos = (entry && entry.pos) ? entry.pos : 'depth';
    var scanDepth = (entry && entry.scanDepth) ? entry.scanDepth : 4;
    var depthVal = (entry && entry.depthVal !== undefined) ? entry.depthVal : 2;
    var content = (entry && entry.content) ? entry.content : '';

    var keyActiveCls = mode === 'key' ? ' active' : '';
    var constActiveCls = mode === 'const' ? ' active' : '';
    var keyWrapOpacity = mode === 'const' ? 'style="opacity:0.35;"' : '';

    var posBeforeCls = pos === 'before' ? ' active' : '';
    var posAfterCls = pos === 'after' ? ' active' : '';
    var posDepthCls = pos === 'depth' ? ' active' : '';
    var depthInlineShow = pos === 'depth' ? ' show' : '';

    var html = ''
      + '<div class="wb-edit-nav-bar">'
      + '  <button class="wb-edit-back-btn" id="wbBtnEditBack" type="button">'
      + '    <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>'
      + '  </button>'
      + '</div>'
      + '<div class="wb-viewport-box">'
      + '  <div class="wb-field-card">'
      + '    <div class="wb-field-head-row">'
      + '      <span class="wb-field-label">词条名称</span>'
      + '      <div class="wb-mode-switch-capsule">'
      + '        <button class="wb-mode-pill' + keyActiveCls + '" data-mode="key" type="button">关键词触发</button>'
      + '        <button class="wb-mode-pill' + constActiveCls + '" data-mode="const" type="button">常驻注入</button>'
      + '      </div>'
      + '    </div>'
      + '    <input class="wb-clean-input" type="text" id="wbIptName" value="' + (entry ? entry.name : '') + '" placeholder="如: 角色背景 / 特殊设定">'
      + '  </div>'

      + '  <div class="wb-field-card">'
      + '    <div class="wb-field-head-row">'
      + '      <span class="wb-field-label">词条内容</span>'
      + '      <button class="wb-btn-expand-icon" id="wbBtnExpand" type="button"><svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg></button>'
      + '    </div>'
      + '    <div class="wb-textarea-wrap">'
      + '      <textarea class="wb-clean-textarea" id="wbIptContent" placeholder="填写具体的剧情背景或交互逻辑...">' + content + '</textarea>'
      + '      <span class="wb-char-count" id="wbCharCount">' + content.length + ' 字</span>'
      + '    </div>'
      + '  </div>'

      + '  <div class="wb-field-card" id="wbKeyWrap" ' + keyWrapOpacity + '>'
      + '    <div class="wb-field-head-row"><span class="wb-field-label">触发关键词</span></div>'
      + '    <div class="wb-tag-box" id="wbTagBox"></div>'
      + '    <input class="wb-clean-input" type="text" id="wbIptKeyInput" placeholder="输入词后回车添加...">'
      + '    <div class="wb-scan-depth-row">'
      + '      <span class="wb-scan-desc">扫描深度 (向前检索轮数)</span>'
      + '      <input class="wb-scan-input" type="number" id="wbIptScanDepth" value="' + scanDepth + '" min="1" max="50">'
      + '    </div>'
      + '  </div>'

      + '  <div class="wb-field-card">'
      + '    <span class="wb-field-label">注入位置</span>'
      + '    <div class="wb-depth-btn-group">'
      + '      <button class="wb-depth-pos-btn' + posBeforeCls + '" data-pos="before" type="button">角色定义前</button>'
      + '      <button class="wb-depth-pos-btn' + posAfterCls + '" data-pos="after" type="button">角色定义后</button>'
      + '      <button class="wb-depth-pos-btn' + posDepthCls + '" data-pos="depth" type="button">上下文深度</button>'
      + '    </div>'
      + '    <div class="wb-depth-num-inline' + depthInlineShow + '" id="wbDepthInline">'
      + '      <span class="wb-scan-desc">插入深度 (距末尾轮数)</span>'
      + '      <input class="wb-scan-input" type="number" id="wbIptDepthVal" value="' + depthVal + '" min="0" max="99">'
      + '    </div>'
      + '  </div>'
      + '</div>';

    editBox.innerHTML = html;
    renderTags();
  }

  function renderTags() {
    var box = document.getElementById('wbTagBox');
    if (!box) return;
    box.innerHTML = '';
    state.editTempTags.forEach(function (t, idx) {
      var tag = document.createElement('span');
      tag.className = 'wb-kw-tag';
      tag.innerHTML = t + ' <span class="wb-kw-tag-del" data-del-tag="' + idx + '">×</span>';
      box.appendChild(tag);
    });
  }

  function saveCurrentEditEntry() {
    var wb = state.worldbooks.find(function (w) { return w.id === state.currentWbId; });
    if (!wb) return;
    var nameInput = document.getElementById('wbIptName');
    if (!nameInput) return;
    var name = (nameInput.value || '').trim();
    var content = (document.getElementById('wbIptContent').value || '').trim();

    if (!name && !content && !state.currentEntryId) return;

    name = name || '未命名词条';
    var scanDepth = parseInt(document.getElementById('wbIptScanDepth').value, 10) || 4;
    var depthVal = parseInt(document.getElementById('wbIptDepthVal').value, 10) || 2;
    var activeModeBtn = document.querySelector('.wb-mode-pill.active');
    var mode = activeModeBtn ? activeModeBtn.dataset.mode : 'key';
    var activePosBtn = document.querySelector('.wb-depth-pos-btn.active');
    var pos = activePosBtn ? activePosBtn.dataset.pos : 'depth';

    if (!wb.entries) wb.entries = [];

    if (state.currentEntryId) {
      var entry = wb.entries.find(function (e) { return e.id === state.currentEntryId; });
      if (entry) {
        entry.name = name;
        entry.content = content;
        entry.mode = mode;
        entry.pos = pos;
        entry.scanDepth = scanDepth;
        entry.depthVal = depthVal;
        entry.keys = [...state.editTempTags];
      }
    } else {
      wb.entries.push({
        id: 'entry_' + Date.now(),
        name: name,
        content: content,
        mode: mode,
        pos: pos,
        scanDepth: scanDepth,
        depthVal: depthVal,
        keys: [...state.editTempTags],
        enabled: true
      });
    }
    saveWorldbooksData();
  }

  // ============ 1:1 指针锚点锁死拖拽引擎 ============
  function setupAnchorLockedDragSort(container, itemSelector, onReorderCallback) {
    var items = container.querySelectorAll(itemSelector);
    if (!items || items.length < 2) return;

    items.forEach(function (el) {
      var isDragging = false;
      var dragTimer = null;
      var startTouchY = 0;

      function onTouchStart(e) {
        if (e.target.closest('button') || e.target.closest('.wb-cover-wrap') || e.target.closest('.wb-dropdown-menu') || e.target.closest('.wb-entry-switch')) return;
        var touch = e.touches[0];
        startTouchY = touch.clientY;

        dragTimer = setTimeout(function () {
          isDragging = true;
          el.classList.add('wb-dragging');
          if (navigator.vibrate) navigator.vibrate(15);
        }, 200);
      }

      function onTouchMove(e) {
        if (!isDragging) {
          if (Math.abs(e.touches[0].clientY - startTouchY) > 8) {
            clearTimeout(dragTimer);
          }
          return;
        }
        e.preventDefault();
        var touch = e.touches[0];
        var deltaY = touch.clientY - startTouchY;
        el.style.transform = 'translateY(' + deltaY + 'px) scale(1.02)';

        var allCards = Array.from(container.querySelectorAll(itemSelector));
        var targetCard = allCards.find(function (card) {
          if (card === el) return false;
          var r = card.getBoundingClientRect();
          return touch.clientY >= r.top && touch.clientY <= r.bottom;
        });

        if (targetCard) {
          var draggingIndex = allCards.indexOf(el);
          var targetIndex = allCards.indexOf(targetCard);
          if (draggingIndex < targetIndex) {
            container.insertBefore(el, targetCard.nextSibling);
          } else {
            container.insertBefore(el, targetCard);
          }
        }
      }

      function onTouchEnd() {
        clearTimeout(dragTimer);
        if (!isDragging) return;
        isDragging = false;
        el.classList.remove('wb-dragging');
        el.style.transform = '';

        var reorderedIds = Array.from(container.querySelectorAll(itemSelector)).map(function (c) {
          return c.dataset.wbId || c.dataset.entryId;
        });
        if (onReorderCallback) onReorderCallback(reorderedIds);
      }

      el.addEventListener('touchstart', onTouchStart, { passive: false });
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      el.addEventListener('touchend', onTouchEnd);
      el.addEventListener('touchcancel', onTouchEnd);
    });
  }

  // ============ 响应 app.js 多级滑返 ============
  window.addEventListener('wbStepBack', function () {
    if (state.currentLevel === 'edit') {
      saveCurrentEditEntry();
      renderEntriesView(state.currentWbId);
    } else if (state.currentLevel === 'book_meta') {
      if (state.isCreatingNewWb) {
        state.worldbooks = state.worldbooks.filter(function (w) { return w.id !== state.currentWbId; });
        saveWorldbooksData();
      }
      renderHomeView();
    } else if (state.currentLevel === 'entries') {
      if (state.isCreatingNewWb) {
        var chkWb = state.worldbooks.find(function (w) { return w.id === state.currentWbId; });
        if (!chkWb || !chkWb.entries || chkWb.entries.length === 0) {
          state.worldbooks = state.worldbooks.filter(function (w) { return w.id !== state.currentWbId; });
          saveWorldbooksData();
        }
      }
      renderHomeView();
    }
  });

  // ============ 全局事件委托 ============
  function bindGlobalEvents() {
    if (state.initialized) return;
    state.initialized = true;

    document.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'wbIptContent') {
        var countEl = document.getElementById('wbCharCount');
        if (countEl) countEl.innerText = e.target.value.length + ' 字';
      }
    });

    document.addEventListener('click', function (e) {
      var wbContainer = document.getElementById('wbMainContainer');
      if (!wbContainer || !wbContainer.contains(e.target)) return;

      // 1. 中间圆圈 ⇅
      if (e.target.closest('#wbBtnLeftSwitch')) {
        e.stopPropagation();
        var pLeft = document.getElementById('wbLeftSwitchPopover');
        if (pLeft) pLeft.classList.toggle('show');
        var pRight = document.getElementById('wbRightMenuPopover');
        if (pRight) pRight.classList.remove('show');
        return;
      }

      var switchItem = e.target.closest('[data-switch-to]');
      if (switchItem) {
        e.stopPropagation();
        var targetSec = switchItem.dataset.switchTo;
        state.currentSection = targetSec;
        document.querySelectorAll('.wb-pop-item').forEach(function (it) { it.classList.remove('active'); });
        switchItem.classList.add('active');
        var popLeft = document.getElementById('wbLeftSwitchPopover');
        if (popLeft) popLeft.classList.remove('show');
        updateThemeVariables(sectionThemes[targetSec]);
        renderHomeView();
        return;
      }

      // 2. 右侧圆圈 +
      if (e.target.closest('#wbBtnRightAction')) {
        e.stopPropagation();
        var popRight = document.getElementById('wbRightMenuPopover');
        if (popRight) popRight.classList.toggle('show');
        var popL = document.getElementById('wbLeftSwitchPopover');
        if (popL) popL.classList.remove('show');
        return;
      }

      // 新建世界书
      if (e.target.closest('#wbPopBtnNew')) {
        e.stopPropagation();
        var popR = document.getElementById('wbRightMenuPopover');
        if (popR) popR.classList.remove('show');
        var tempId = 'wb_' + Date.now();
        state.worldbooks.push({
          id: tempId,
          title: '',
          cover: '',
          entries: []
        });
        state.isCreatingNewWb = true;
        state.currentWbId = tempId;
        renderBookMetaView(tempId);
        return;
      }

      // 导入 .docx
      if (e.target.closest('#wbPopBtnImport')) {
        e.stopPropagation();
        var popR2 = document.getElementById('wbRightMenuPopover');
        if (popR2) popR2.classList.remove('show');
        importWorldbookDocx();
        return;
      }

      // 色块点击
      var swatch = e.target.closest('.wb-swatch-dot');
      if (swatch) {
        e.stopPropagation();
        var color = swatch.dataset.color;
        var bg = swatch.dataset.bg;
        sectionThemes[state.currentSection] = { color: color, bg: bg };
        updateThemeVariables(sectionThemes[state.currentSection]);
        saveThemesData();
        var pR = document.getElementById('wbRightMenuPopover');
        if (pR) pR.classList.remove('show');
        return;
      }

      // 新建名称页返回
      if (e.target.closest('#wbBtnMetaBack')) {
        if (state.isCreatingNewWb) {
          state.worldbooks = state.worldbooks.filter(function (w) { return w.id !== state.currentWbId; });
          saveWorldbooksData();
        }
        renderHomeView();
        return;
      }

      // 新建名称页确定
      if (e.target.closest('#wbBtnSaveBookMeta')) {
        var bookTitleIpt = document.getElementById('wbIptBookTitle');
        var currentBook = state.worldbooks.find(function (w) { return w.id === state.currentWbId; });
        if (currentBook && bookTitleIpt) {
          currentBook.title = (bookTitleIpt.value || '').trim() || '未命名世界书';
          saveWorldbooksData();
          renderEditView(null);
        }
        return;
      }

      // 内部词条页：点击居中带下划线标题重命名
      if (e.target.closest('#wbBtnEditBookTitle')) {
        renderBookMetaView(state.currentWbId);
        return;
      }

      // 内部词条页：左上角返回
      if (e.target.closest('#wbBtnEntriesBack')) {
        renderHomeView();
        return;
      }

      // 内部词条页：底部保存按钮
      if (e.target.closest('#wbBtnSaveEntriesConfirm')) {
        saveWorldbooksData();
        if (window.AppNav) window.AppNav.showToast('✦ 世界书已保存 ✦');
        renderHomeView();
        return;
      }

      // 编辑词条页：左上角返回
      if (e.target.closest('#wbBtnEditBack')) {
        saveCurrentEditEntry();
        renderEntriesView(state.currentWbId);
        return;
      }

      // 点击空白处关闭浮层
      if (!e.target.closest('.wb-left-switch-popover') && !e.target.closest('#wbBtnLeftSwitch')) {
        var popLft = document.getElementById('wbLeftSwitchPopover');
        if (popLft) popLft.classList.remove('show');
      }
      if (!e.target.closest('.wb-right-menu-popover') && !e.target.closest('#wbBtnRightAction')) {
        var popRgt = document.getElementById('wbRightMenuPopover');
        if (popRgt) popRgt.classList.remove('show');
      }

      // 竖三点菜单
      var moreBtn = e.target.closest('[data-wb-more]');
      if (moreBtn) {
        e.stopPropagation();
        var wbId = moreBtn.dataset.wbMore;
        var menu = document.getElementById('wbMenu_' + wbId);
        document.querySelectorAll('.wb-dropdown-menu').forEach(function (m) { if (m !== menu) m.classList.remove('show'); });
        if (menu) menu.classList.toggle('show');
        return;
      }

      var menuItem = e.target.closest('[data-menu-act]');
      if (menuItem) {
        e.stopPropagation();
        var act = menuItem.dataset.menuAct;
        var mId = menuItem.dataset.id;
        document.querySelectorAll('.wb-dropdown-menu').forEach(function (m) { m.classList.remove('show'); });

        if (act === 'copy') {
          var targetWb = state.worldbooks.find(function (w) { return w.id === mId; });
          if (targetWb) {
            var copyWb = JSON.parse(JSON.stringify(targetWb));
            copyWb.id = 'wb_' + Date.now();
            copyWb.title = (targetWb.title || '世界书') + ' (副本)';
            state.worldbooks.push(copyWb);
            saveWorldbooksData();
            renderHomeView();
          }
        } else if (act === 'export') {
          exportWorldbookJSON(mId);
        } else if (act === 'del') {
          var delTarget = state.worldbooks.find(function (w) { return w.id === mId; });
          if (window.AppDialog) {
            window.AppDialog.confirm({
              title: '删除世界书',
              desc: '确定删除《' + (delTarget ? delTarget.title : '世界书') + '》及其包含的全部词条吗？',
              confirmText: '确定',
              isDanger: false
            }, function () {
              state.worldbooks = state.worldbooks.filter(function (w) { return w.id !== mId; });
              saveWorldbooksData();
              renderHomeView();
            });
          }
        }
        return;
      }
      document.querySelectorAll('.wb-dropdown-menu').forEach(function (m) { m.classList.remove('show'); });

      // 封面点击
      var coverWrap = e.target.closest('[data-cover-wb]');
      if (coverWrap) {
        e.stopPropagation();
        handleCoverClick(coverWrap.dataset.coverWb);
        return;
      }

      // 进入词条列表
      var enterWbBtn = e.target.closest('[data-enter-wb]');
      if (enterWbBtn) {
        renderEntriesView(enterWbBtn.dataset.enterWb);
        return;
      }

      // 新建词条
      if (e.target.closest('#wbNavBtnNewEntry')) {
        renderEditView(null);
        return;
      }

      // 打开词条编辑
      var openEntryItem = e.target.closest('[data-open-entry]');
      if (openEntryItem) {
        renderEditView(openEntryItem.dataset.openEntry);
        return;
      }

      // 词条操作 (编辑 / 复制 / 删除 / 开关)
      var actBtn = e.target.closest('[data-entry-act]');
      if (actBtn) {
        e.stopPropagation();
        var eAct = actBtn.dataset.entryAct;
        var eId = actBtn.dataset.id;
        var curWb = state.worldbooks.find(function (w) { return w.id === state.currentWbId; });
        if (!curWb) return;

        if (eAct === 'edit') {
          renderEditView(eId);
        } else if (eAct === 'copy') {
          var enTarget = curWb.entries.find(function (en) { return en.id === eId; });
          if (enTarget) {
            var cOne = JSON.parse(JSON.stringify(enTarget));
            cOne.id = 'entry_' + Date.now();
            cOne.name = cOne.name + ' (副本)';
            curWb.entries.push(cOne);
            saveWorldbooksData();
            renderEntriesView(state.currentWbId);
          }
        } else if (eAct === 'del') {
          var enDel = curWb.entries.find(function (en) { return en.id === eId; });
          if (window.AppDialog) {
            window.AppDialog.confirm({
              title: '删除词条',
              desc: '确定删除词条【' + (enDel ? enDel.name : '未命名') + '】吗？',
              confirmText: '确定',
              isDanger: false
            }, function () {
              curWb.entries = curWb.entries.filter(function (en) { return en.id !== eId; });
              saveWorldbooksData();
              renderEntriesView(state.currentWbId);
            });
          }
        } else if (eAct === 'toggle') {
          var enToggle = curWb.entries.find(function (en) { return en.id === eId; });
          if (enToggle) {
            enToggle.enabled = !(enToggle.enabled !== false);
            saveWorldbooksData();
            if (enToggle.enabled) actBtn.classList.add('on');
            else actBtn.classList.remove('on');
          }
        }
        return;
      }

      // 模式切换
      var modePill = e.target.closest('.wb-mode-pill');
      if (modePill) {
        document.querySelectorAll('.wb-mode-pill').forEach(function (p) { p.classList.remove('active'); });
        modePill.classList.add('active');
        var keyWrap = document.getElementById('wbKeyWrap');
        if (keyWrap) {
          if (modePill.dataset.mode === 'const') {
            keyWrap.style.opacity = '0.35';
            keyWrap.querySelectorAll('input').forEach(function (i) { i.disabled = true; });
          } else {
            keyWrap.style.opacity = '1';
            keyWrap.querySelectorAll('input').forEach(function (i) { i.disabled = false; });
          }
        }
        return;
      }

      // 注入位置切换
      var depthBtn = e.target.closest('.wb-depth-pos-btn');
      if (depthBtn) {
        document.querySelectorAll('.wb-depth-pos-btn').forEach(function (b) { b.classList.remove('active'); });
        depthBtn.classList.add('active');
        var inlineWrap = document.getElementById('wbDepthInline');
        if (inlineWrap) {
          if (depthBtn.dataset.pos === 'depth') inlineWrap.classList.add('show');
          else inlineWrap.classList.remove('show');
        }
        return;
      }

      // 删除标签
      var delTagBtn = e.target.closest('[data-del-tag]');
      if (delTagBtn) {
        state.editTempTags.splice(parseInt(delTagBtn.dataset.delTag, 10), 1);
        renderTags();
        return;
      }

      // 扩大与收起
      if (e.target.closest('#wbBtnExpand')) {
        var normalIpt = document.getElementById('wbIptContent');
        var expModal = document.getElementById('wbExpandedModal');
        var expIpt = document.getElementById('wbExpandedText');
        if (normalIpt && expModal && expIpt) {
          expIpt.value = normalIpt.value;
          expModal.classList.add('show');
        }
        return;
      }
      if (e.target.closest('#wbBtnCollapse')) {
        var normalInput = document.getElementById('wbIptContent');
        var expMod = document.getElementById('wbExpandedModal');
        var expInput = document.getElementById('wbExpandedText');
        if (normalInput && expMod && expInput) {
          normalInput.value = expInput.value;
          expMod.classList.remove('show');
          var countEle = document.getElementById('wbCharCount');
          if (countEle) countEle.innerText = expInput.value.length + ' 字';
        }
        return;
      }
    });

    document.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'wbCustomColorInput') {
        var chosenColor = e.target.value;
        var customBg = 'rgba(' + hexToRgb(chosenColor) + ', 0.25)';
        sectionThemes[state.currentSection] = { color: chosenColor, bg: customBg };
        updateThemeVariables(sectionThemes[state.currentSection]);
        saveThemesData();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.target && e.target.id === 'wbIptKeyInput') {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          var val = (e.target.value || '').trim().replace(',', '');
          if (val && state.editTempTags.indexOf(val) === -1) {
            state.editTempTags.push(val);
            renderTags();
          }
          e.target.value = '';
        }
      }
    });
  }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255].join(',');
  }

  // ============ 按需冷启动核心 (开机0消耗) ============
  var isEngineStarted = false;

  function startWorldbookEngine() {
    if (isEngineStarted) return;
    isEngineStarted = true;

    var container = ensureWorldbookDOM();
    if (!container) return;
    bindGlobalEvents();
    loadAllData(function () {
      renderHomeView();
      updateThemeVariables(sectionThemes[state.currentSection]);
    });
  }

  // 严格按需唤醒：开机不执行任何操作，只有墨墨点进“世界书”页面才秒级加载！
  window.addEventListener('pageChange', function (e) {
    if (e.detail && e.detail.page === 'worldbook') {
      startWorldbookEngine();
    }
  });

})();
