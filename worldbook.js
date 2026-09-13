
(function () {
  'use strict';

  var sectionThemes = {
    wb: { color: '#88abda', bg: 'rgba(136, 171, 218, 0.18)' },
    preset: { color: '#88abda', bg: 'rgba(136, 171, 218, 0.18)' },
    regex: { color: '#88abda', bg: 'rgba(136, 171, 218, 0.18)' }
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

  // ============ Tokens 实时精准核算算法 ============
  function calculateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    var str = text.trim();
    if (!str) return 0;
    
    var chineseCount = (str.match(/[\u4e00-\u9fa5\u3000-\u303f\uff01-\uff5e]/g) || []).length;
    var otherStr = str.replace(/[\u4e00-\u9fa5\u3000-\u303f\uff01-\uff5e]/g, '');
    var englishWords = otherStr.trim().split(/\s+/).filter(Boolean).length;
    var otherChars = otherStr.length;
    
    var tokenEstimate = Math.ceil(chineseCount * 1.3 + englishWords * 1.3 + (otherChars - englishWords) * 0.3);
    return Math.max(1, tokenEstimate);
  }

  function getEntryTokens(entry) {
    if (!entry) return 0;
    var fullText = (entry.name || '') + ' ' + (entry.keys ? entry.keys.join(' ') : '') + ' ' + (entry.content || '');
    return calculateTokens(fullText);
  }

  function getWbTokensStats(wb) {
    if (!wb || !Array.isArray(wb.entries)) {
      return { total: 0, active: 0, count: 0 };
    }
    var totalTokens = 0;
    var activeTokens = 0;
    
    wb.entries.forEach(function (en) {
      var t = getEntryTokens(en);
      totalTokens += t;
      if (en.enabled !== false) {
        activeTokens += t;
      }
    });

    return {
      total: totalTokens,
      active: activeTokens,
      count: wb.entries.length
    };
  }

  // ============ 数据持久化 ============
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

  // ============ 封面图片剪裁 ============
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
                window.AppCropper.open(evt.target.result, { aspectRatio: 54 / 80 }, function (croppedData) {
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

  // ============ 导入 .docx / 自有标准 .json ============
  function importWorldbookDocx() {
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.docx,.json,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    fileInput.onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var fileName = file.name.replace(/\.[^/.]+$/, '') || '导入的世界书';
      var isJson = file.name.toLowerCase().endsWith('.json');

      var reader = new FileReader();

      if (isJson) {
        reader.onload = function (evt) {
          try {
            var data = JSON.parse(evt.target.result);
            if (!data || !Array.isArray(data.entries)) {
              if (window.AppNav) window.AppNav.showToast('非标准数据格式，无法导入');
              return;
            }

            var wbTitle = data.name || fileName;
            var parsedEntries = data.entries.map(function (item, idx) {
              return {
                id: 'entry_' + Date.now() + '_' + idx,
                name: item.name || item.comment || ('条目 ' + (idx + 1)),
                content: item.content || '',
                mode: (item.mode === 'const' || item.constant) ? 'const' : 'key',
                keys: Array.isArray(item.keys) ? item.keys : (Array.isArray(item.key) ? item.key : []),
                scanDepth: parseInt(item.scanDepth || item.scan_depth, 10) || 4,
                pos: (item.pos === 'before' || item.pos === 'after') ? item.pos : 'depth',
                depthVal: parseInt(item.depthVal || item.order, 10) || 2,
                enabled: item.enabled !== false && item.disable !== true
              };
            });

            state.worldbooks.push({
              id: 'wb_' + Date.now(),
              title: wbTitle,
              cover: data.cover || '',
              entries: parsedEntries
            });

            saveWorldbooksData();
            renderHomeView();
            if (window.AppNav) window.AppNav.showToast('✦ 成功导入：《' + wbTitle + '》 ✦');
          } catch (err) {
            if (window.AppNav) window.AppNav.showToast('文件损坏，导入失败');
          }
        };
        reader.readAsText(file);
      } else {
        reader.onload = function (evt) {
          try {
            var arrayBuffer = evt.target.result;
            var textContent = extractDocxText(arrayBuffer);
            if (!textContent || !textContent.trim()) {
              textContent = '从文档中导入的内容设定。';
            }

            var newEntry = {
              id: 'entry_' + Date.now(),
              name: fileName + ' 设定',
              content: textContent.trim(),
              mode: 'key',
              keys: [fileName],
              scanDepth: 4,
              pos: 'depth',
              depthVal: 2,
              enabled: true
            };

            var newWb = {
              id: 'wb_' + Date.now(),
              title: fileName,
              cover: '',
              entries: [newEntry]
            };

            state.worldbooks.push(newWb);
            saveWorldbooksData();
            renderHomeView();
            if (window.AppNav) window.AppNav.showToast('✦ 成功导入文档：《' + fileName + '》 ✦');
          } catch (err) {
            if (window.AppNav) window.AppNav.showToast('文档解析失败，请确保为标准 .docx 格式');
          }
        };
        reader.readAsArrayBuffer(file);
      }
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
      cover: wb.cover || '',
      entries: (wb.entries || []).map(function (en) {
        return {
          name: en.name || '',
          content: en.content || '',
          mode: en.mode || 'key',
          keys: en.keys || [],
          scanDepth: en.scanDepth || 4,
          pos: en.pos || 'depth',
          depthVal: en.depthVal !== undefined ? en.depthVal : 2,
          enabled: en.enabled !== false
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

    if (window.AppNav) window.AppNav.showToast('世界书已成功导出');
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
        + '  <div class="wb-gallery-header-row" id="wbGalleryHeaderRow">'
        + '    <div class="wb-header-switch-wrap" id="wbHeaderSwitchWrap">'
        + '      <span class="wb-gallery-main-title" id="wbGalleryMainTitle">世界书</span>'
        + '      <svg class="wb-header-arrow-down" id="wbHeaderArrowDown" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'
        + '    </div>'
        + '    <span class="wb-gallery-sub-en" id="wbGallerySubEn">WORLD BOOK</span>'
        + '    <div class="wb-header-dropdown-menu" id="wbHeaderDropdownMenu">'
        + '      <div class="wb-pop-item active" data-switch-to="wb">世界书</div>'
        + '      <div class="wb-pop-item" data-switch-to="preset">预设</div>'
        + '      <div class="wb-pop-item" data-switch-to="regex">正则</div>'
        + '    </div>'
        + '  </div>'

        + '  <div class="wb-viewport-box wb-home-scroll-viewport" id="wbHomeView"></div>'

        + '  <div class="wb-home-floating-wrapper" id="wbHomeBottomBar">'
        + '    <button class="wb-btn-floating-new" id="wbPopBtnNew" type="button">+ 编撰新世界书</button>'
        + '    <button class="wb-btn-floating-import" id="wbPopBtnImport" type="button">导入</button>'
        + '  </div>'

        + '  <div class="wb-viewport-box wb-view-hidden" id="wbBookMetaView"></div>'
        + '  <div class="wb-viewport-box wb-view-hidden" id="wbEntriesView"></div>'
        + '  <div class="wb-viewport-box wb-view-hidden" id="wbEditView"></div>'

        + '  <div class="wb-expanded-modal" id="wbExpandedModal">'
        + '    <div class="wb-entries-nav-bar">'
        + '      <span style="font-size:16px; font-weight:800; color:#1c1c1e;">沉浸编辑</span>'
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

    var headerRow = document.getElementById('wbGalleryHeaderRow');
    if (headerRow) headerRow.style.display = 'flex';

    var homeBottomBar = document.getElementById('wbHomeBottomBar');
    if (homeBottomBar) homeBottomBar.style.display = 'flex';

    var homeBox = document.getElementById('wbHomeView');
    if (!homeBox) return;

    homeBox.classList.remove('wb-view-hidden');
    homeBox.style.display = 'flex';
    homeBox.scrollTop = 0;

    var metaView = document.getElementById('wbBookMetaView');
    if (metaView) metaView.classList.add('wb-view-hidden');

    var entriesView = document.getElementById('wbEntriesView');
    if (entriesView) entriesView.classList.add('wb-view-hidden');

    var editView = document.getElementById('wbEditView');
    if (editView) editView.classList.add('wb-view-hidden');

    var meta = sectionMeta[state.currentSection];
    var titleEl = document.getElementById('wbGalleryMainTitle');
    var subEnEl = document.getElementById('wbGallerySubEn');
    if (meta) {
      if (titleEl) titleEl.innerText = meta.title;
      if (subEnEl) subEnEl.innerText = meta.en;
    }

    var html = '';

    if (state.currentSection === 'wb') {
      if (!state.worldbooks || state.worldbooks.length === 0) {
        html = '<div class="wb-empty-tip">✦ 暂无世界书，请点击下方「+ 编撰新世界书」 ✦</div>';
      } else {
        state.worldbooks.forEach(function (wb) {
          var coverImgHtml = wb.cover ? '<img src="' + wb.cover + '" alt="封面">' : '<img src="" alt="封面">';
          var hasImgCls = wb.cover ? ' has-img' : '';
          
          var stats = getWbTokensStats(wb);

          html += ''
            + '<div class="wb-art-card" data-wb-id="' + wb.id + '">'
            + '  <div class="wb-art-frame-left' + hasImgCls + '" data-cover-wb="' + wb.id + '">'
            + coverImgHtml
            + '    <svg class="wb-art-cam-icon" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>'
            + '  </div>'
            + '  <div class="wb-art-info-right">'
            + '    <div class="wb-art-title-line">'
            + '      <span class="wb-art-title-text" data-enter-wb="' + wb.id + '">' + (wb.title || '未命名世界书') + '</span>'
            + '      <button class="wb-art-stars-btn" type="button" data-wb-more="' + wb.id + '">'
            + '        <span class="wb-art-star-dot">✦</span>'
            + '        <span class="wb-art-star-dot">✦</span>'
            + '        <span class="wb-art-star-dot">✦</span>'
            + '      </button>'
            + '    </div>'
            + '    <div class="wb-art-dot-divider"></div>'
            + '    <div class="wb-art-meta-bottom" data-enter-wb="' + wb.id + '">'
            + '      <span class="wb-art-count">' + stats.count + ' 条 · 总计 ' + stats.total + ' Tokens · 发送 <span>' + stats.active + ' Tokens</span></span>'
            + '      <span class="wb-art-enter">ENTER ➔</span>'
            + '    </div>'
            + '  </div>'
            + '  <div class="wb-dropdown-menu" id="wbMenu_' + wb.id + '">'
            + '    <div class="wb-menu-item" data-menu-act="copy" data-id="' + wb.id + '">复制副本</div>'
            + '    <div class="wb-menu-item" data-menu-act="export" data-id="' + wb.id + '">导出文档</div>'
            + '    <div class="wb-menu-item del" data-menu-act="del" data-id="' + wb.id + '">删除</div>'
            + '  </div>'
            + '</div>';
        });
      }
    } else {
      html = '<div class="wb-empty-tip">✦ 该模块正在运行中 ✦</div>';
    }
    homeBox.innerHTML = html;

    setupZeroJitterDragSort(homeBox, '.wb-art-card', function (newOrderIds) {
      state.worldbooks.sort(function (a, b) {
        return newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id);
      });
      saveWorldbooksData();
    });
  }

  // ============ 2. 渲染新建名称页 ============
  function renderBookMetaView(wbId) {
    state.currentLevel = 'book_meta';
    state.currentWbId = wbId;
    var wb = state.worldbooks.find(function (w) { return w.id === wbId; });

    var headerRow = document.getElementById('wbGalleryHeaderRow');
    if (headerRow) headerRow.style.display = 'none';

    var homeBottomBar = document.getElementById('wbHomeBottomBar');
    if (homeBottomBar) homeBottomBar.style.display = 'none';

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

    var headerRow = document.getElementById('wbGalleryHeaderRow');
    if (headerRow) headerRow.style.display = 'none';

    var homeBottomBar = document.getElementById('wbHomeBottomBar');
    if (homeBottomBar) homeBottomBar.style.display = 'none';

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
      + '  <div class="wb-entries-title-center-wrap" id="wbBtnEditBookTitle" title="点击重命名">'
      + '    <span class="wb-entries-book-title">' + (wb.title || '世界书') + '</span>'
      + '  </div>'
      + '  <button class="wb-nav-btn-plus-only" id="wbNavBtnNewEntry" type="button" title="新建条目">'
      + '    <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>'
      + '  </button>'
      + '</div>'
      + '<div class="wb-viewport-box wb-entries-scroll-viewport" id="wbEntriesListBox">';

    if (!wb.entries || wb.entries.length === 0) {
      html += '<div class="wb-empty-tip">暂无条目，请点击右上角 ＋ 新建</div>';
    } else {
      wb.entries.forEach(function (entry) {
        var switchCls = entry.enabled !== false ? 'on' : '';
        var entryTokens = getEntryTokens(entry);

        var subTextDesc = '';
        if (entry.mode === 'const') {
          subTextDesc = '常驻全局 · <span>' + entryTokens + ' Tokens</span>';
        } else {
          var posName = entry.pos === 'before' ? '定义前' : (entry.pos === 'after' ? '定义后' : ('深度 ' + (entry.depthVal !== undefined ? entry.depthVal : 2)));
          var keysStr = (entry.keys && entry.keys.length > 0) ? entry.keys.join(', ') : '无触发词';
          subTextDesc = '<span>' + posName + '</span> · ' + keysStr + ' · <span>' + entryTokens + ' Tokens</span>';
        }

        html += ''
          + '<div class="wb-entry-item-card" data-entry-id="' + entry.id + '">'
          + '  <div class="wb-entry-left-col" data-open-entry="' + entry.id + '">'
          + '    <span class="wb-entry-title-text">' + (entry.name || '未命名条目') + '</span>'
          + '    <div class="wb-entry-sub-desc">' + subTextDesc + '</div>'
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
      + '<div class="wb-floating-save-wrapper">'
      + '  <button class="wb-btn-floating-save" id="wbBtnSaveEntriesConfirm" type="button">保存条目</button>'
      + '</div>';

    entriesBox.innerHTML = html;

    var listWrap = document.getElementById('wbEntriesListBox');
    if (listWrap) {
      setupZeroJitterDragSort(listWrap, '.wb-entry-item-card', function (newOrderIds) {
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

    var headerRow = document.getElementById('wbGalleryHeaderRow');
    if (headerRow) headerRow.style.display = 'none';

    var homeBottomBar = document.getElementById('wbHomeBottomBar');
    if (homeBottomBar) homeBottomBar.style.display = 'none';

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
      + '      <span class="wb-field-label">条目名称</span>'
      + '      <div class="wb-mode-switch-capsule">'
      + '        <button class="wb-mode-pill' + keyActiveCls + '" data-mode="key" type="button">关键词触发</button>'
      + '        <button class="wb-mode-pill' + constActiveCls + '" data-mode="const" type="button">常驻注入</button>'
      + '      </div>'
      + '    </div>'
      + '    <input class="wb-clean-input" type="text" id="wbIptName" value="' + (entry ? entry.name : '') + '" placeholder="如: 角色背景 / 特殊设定">'
      + '  </div>'

      + '  <div class="wb-field-card">'
      + '    <div class="wb-field-head-row">'
      + '      <span class="wb-field-label">条目内容</span>'
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
      + '      <button class="wb-depth-pos-btn' + posBeforeCls + '" data-pos="before" type="button">角色定义前 Before</button>'
      + '      <button class="wb-depth-pos-btn' + posAfterCls + '" data-pos="after" type="button">角色定义后 After</button>'
      + '      <button class="wb-depth-pos-btn' + posDepthCls + '" data-pos="depth" type="button">上下文深度 Depth</button>'
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

    name = name || '未命名条目';
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

  // ============ 0 抖动·iOS 原生虚拟位移让位拖拽引擎 ============
  function setupZeroJitterDragSort(container, itemSelector, onReorderCallback) {
    var items = container.querySelectorAll(itemSelector);
    if (!items || items.length < 2) return;

    items.forEach(function (el) {
      var isDragging = false;
      var dragTimer = null;
      var startY = 0;
      var fromIndex = -1;
      var targetIndex = -1;
      var itemStep = 0;
      var allCards = [];

      function onTouchStart(e) {
        if (e.target.closest('button') || e.target.closest('.wb-art-frame-left') || e.target.closest('.wb-dropdown-menu') || e.target.closest('.wb-entry-switch') || e.target.closest('.wb-entry-icons-row')) return;
        
        var touch = e.touches[0];
        startY = touch.clientY;

        dragTimer = setTimeout(function () {
          allCards = Array.from(container.querySelectorAll(itemSelector));
          fromIndex = allCards.indexOf(el);
          targetIndex = fromIndex;
          if (fromIndex === -1) return;

          // 计算单张卡片包含间距的完整高度步长
          itemStep = el.offsetHeight + 10;
          isDragging = true;

          // 抓取轻微升起
          el.style.transform = 'scale(1.025)';
          el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
          el.style.zIndex = '100';
          el.style.transition = 'none';

          if (navigator.vibrate) navigator.vibrate(15);
        }, 180);
      }

      function onTouchMove(e) {
        if (!isDragging) {
          if (Math.abs(e.touches[0].clientY - startY) > 6) {
            clearTimeout(dragTimer);
          }
          return;
        }
        e.preventDefault();
        var touch = e.touches[0];
        var dy = touch.clientY - startY;

        // 1. 被抓取的卡片 100% 紧随手指，零延迟
        el.style.transform = 'translateY(' + dy + 'px) scale(1.025)';

        // 2. 算当前应该插入哪个槽位
        var slotOffset = Math.round(dy / itemStep);
        var newTarget = Math.max(0, Math.min(allCards.length - 1, fromIndex + slotOffset));

        if (newTarget !== targetIndex) {
          targetIndex = newTarget;

          // 3. 其他卡片纯用 CSS translateY 优雅让出空位，绝不修改 DOM，绝对 0 抖动！
          allCards.forEach(function (card, idx) {
            if (card === el) return;
            card.style.transition = 'transform 0.22s cubic-bezier(0.2, 0, 0.2, 1)';

            if (fromIndex < targetIndex) {
              // 往下拖：位于 (fromIndex, targetIndex] 之间的卡片平滑往上挪
              if (idx > fromIndex && idx <= targetIndex) {
                card.style.transform = 'translateY(-' + itemStep + 'px)';
              } else {
                card.style.transform = '';
              }
            } else if (fromIndex > targetIndex) {
              // 往上拖：位于 [targetIndex, fromIndex) 之间的卡片平滑往下挪
              if (idx >= targetIndex && idx < fromIndex) {
                card.style.transform = 'translateY(' + itemStep + 'px)';
              } else {
                card.style.transform = '';
              }
            } else {
              card.style.transform = '';
            }
          });
        }
      }

      function onTouchEnd() {
        clearTimeout(dragTimer);
        if (!isDragging) return;
        isDragging = false;

        // 清空所有让位动画样式
        allCards.forEach(function (c) {
          c.style.transform = '';
          c.style.boxShadow = '';
          c.style.zIndex = '';
          c.style.transition = '';
        });

        // 只有松开手时，才正式一次性在 DOM 里插队落位！
        if (fromIndex !== targetIndex && targetIndex >= 0) {
          var targetCard = allCards[targetIndex];
          if (fromIndex < targetIndex) {
            container.insertBefore(el, targetCard.nextSibling);
          } else {
            container.insertBefore(el, targetCard);
          }
        }

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

  // ============ 事件委托 ============
  function bindInternalEvents(container) {
    if (state.initialized) return;
    state.initialized = true;

    container.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'wbIptContent') {
        var countEl = document.getElementById('wbCharCount');
        if (countEl) countEl.innerText = e.target.value.length + ' 字';
      }
    });

    container.addEventListener('keydown', function (e) {
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

    container.addEventListener('click', function (e) {
      // 1. 顶栏 ∨ 下拉切换
      if (e.target.closest('#wbHeaderSwitchWrap')) {
        e.stopPropagation();
        var menu = document.getElementById('wbHeaderDropdownMenu');
        var arrow = document.getElementById('wbHeaderArrowDown');
        if (menu) menu.classList.toggle('show');
        if (arrow) arrow.classList.toggle('open');
        return;
      }

      var switchItem = e.target.closest('[data-switch-to]');
      if (switchItem) {
        e.stopPropagation();
        var targetSec = switchItem.dataset.switchTo;
        state.currentSection = targetSec;
        container.querySelectorAll('.wb-pop-item').forEach(function (it) { it.classList.remove('active'); });
        switchItem.classList.add('active');
        
        var dMenu = document.getElementById('wbHeaderDropdownMenu');
        var dArrow = document.getElementById('wbHeaderArrowDown');
        if (dMenu) dMenu.classList.remove('show');
        if (dArrow) dArrow.classList.remove('open');
        
        renderHomeView();
        return;
      }

      // 2. 首页新建与导入
      if (e.target.closest('#wbPopBtnNew')) {
        e.stopPropagation();
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

      if (e.target.closest('#wbPopBtnImport')) {
        e.stopPropagation();
        importWorldbookDocx();
        return;
      }

      // 3. 新建名称页返回与确定
      if (e.target.closest('#wbBtnMetaBack')) {
        if (state.isCreatingNewWb) {
          state.worldbooks = state.worldbooks.filter(function (w) { return w.id !== state.currentWbId; });
          saveWorldbooksData();
        }
        renderHomeView();
        return;
      }

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

      if (e.target.closest('#wbBtnEditBookTitle')) {
        renderBookMetaView(state.currentWbId);
        return;
      }

      // 4. 词条列表返回与保存
      if (e.target.closest('#wbBtnEntriesBack')) {
        renderHomeView();
        return;
      }

      if (e.target.closest('#wbBtnSaveEntriesConfirm')) {
        saveWorldbooksData();
        if (window.AppNav) window.AppNav.showToast('世界书已保存');
        renderHomeView();
        return;
      }

      // 5. 编辑页返回
      if (e.target.closest('#wbBtnEditBack')) {
        saveCurrentEditEntry();
        renderEntriesView(state.currentWbId);
        return;
      }

      // 关闭下拉菜单
      if (!e.target.closest('#wbHeaderSwitchWrap') && !e.target.closest('#wbHeaderDropdownMenu')) {
        var hMenu = document.getElementById('wbHeaderDropdownMenu');
        var hArr = document.getElementById('wbHeaderArrowDown');
        if (hMenu) hMenu.classList.remove('show');
        if (hArr) hArr.classList.remove('open');
      }

      // 6. 三星芒按钮菜单
      var moreBtn = e.target.closest('[data-wb-more]');
      if (moreBtn) {
        e.stopPropagation();
        var wbId = moreBtn.dataset.wbMore;
        var mMenu = document.getElementById('wbMenu_' + wbId);
        container.querySelectorAll('.wb-dropdown-menu').forEach(function (m) { if (m !== mMenu) m.classList.remove('show'); });
        if (mMenu) mMenu.classList.toggle('show');
        return;
      }

      var menuItem = e.target.closest('[data-menu-act]');
      if (menuItem) {
        e.stopPropagation();
        var act = menuItem.dataset.menuAct;
        var mId = menuItem.dataset.id;
        container.querySelectorAll('.wb-dropdown-menu').forEach(function (m) { m.classList.remove('show'); });

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
              desc: '确定删除《' + (delTarget ? delTarget.title : '世界书') + '》及其全部条目吗？',
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
      container.querySelectorAll('.wb-dropdown-menu').forEach(function (m) { m.classList.remove('show'); });

      // 7. 点击封面换图
      var coverWrap = e.target.closest('[data-cover-wb]');
      if (coverWrap) {
        e.stopPropagation();
        handleCoverClick(coverWrap.dataset.coverWb);
        return;
      }

      // 8. 进入世界书列表
      var enterWbBtn = e.target.closest('[data-enter-wb]');
      if (enterWbBtn) {
        renderEntriesView(enterWbBtn.dataset.enterWb);
        return;
      }

      // 9. 新建条目
      if (e.target.closest('#wbNavBtnNewEntry')) {
        renderEditView(null);
        return;
      }

      // 10. 打开已有条目
      var openEntryItem = e.target.closest('[data-open-entry]');
      if (openEntryItem) {
        renderEditView(openEntryItem.dataset.openEntry);
        return;
      }

      // 11. 条目列表内操作 (编辑 / 复制 / 删除 / 开关)
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
              title: '删除条目',
              desc: '确定删除条目【' + (enDel ? enDel.name : '未命名') + '】吗？',
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
            
            // 实时更新当前条目及外层 Tokens
            renderEntriesView(state.currentWbId);
          }
        }
        return;
      }

      // 12. 模式与注入位置切换
      var modePill = e.target.closest('.wb-mode-pill');
      if (modePill) {
        container.querySelectorAll('.wb-mode-pill').forEach(function (p) { p.classList.remove('active'); });
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

      var depthBtn = e.target.closest('.wb-depth-pos-btn');
      if (depthBtn) {
        container.querySelectorAll('.wb-depth-pos-btn').forEach(function (b) { b.classList.remove('active'); });
        depthBtn.classList.add('active');
        var inlineWrap = document.getElementById('wbDepthInline');
        if (inlineWrap) {
          if (depthBtn.dataset.pos === 'depth') inlineWrap.classList.add('show');
          else inlineWrap.classList.remove('show');
        }
        return;
      }

      // 13. 标签删除
      var delTagBtn = e.target.closest('[data-del-tag]');
      if (delTagBtn) {
        state.editTempTags.splice(parseInt(delTagBtn.dataset.delTag, 10), 1);
        renderTags();
        return;
      }

      // 14. 沉浸编辑扩大与收起
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
  }

  var isEngineStarted = false;

  function startWorldbookEngine() {
    if (isEngineStarted) return;
    isEngineStarted = true;

    var container = ensureWorldbookDOM();
    if (!container) return;
    bindInternalEvents(container);
    loadAllData(function () {
      renderHomeView();
      updateThemeVariables(sectionThemes[state.currentSection]);
    });
  }

  window.addEventListener('pageChange', function (e) {
    if (e.detail && e.detail.page === 'worldbook') {
      startWorldbookEngine();
    }
  });

})();
