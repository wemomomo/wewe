
(function () {
  'use strict';

  var sectionThemes = {
    wb: { color: '#A6BFE0', bg: 'rgba(166, 191, 224, 0.22)' },
    preset: { color: '#A6BFE0', bg: 'rgba(166, 191, 224, 0.22)' },
    regex: { color: '#A6BFE0', bg: 'rgba(166, 191, 224, 0.22)' }
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
    isEditingBookTitle: false,
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

  // 核心改色引擎：立刻更新 CSS 变量，确保主题秒变
  function updateThemeVariables(theme) {
    if (!theme) return;
    document.documentElement.style.setProperty('--wb-cur-theme', theme.color);
    document.documentElement.style.setProperty('--wb-cur-theme-bg', theme.bg);
  }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255].join(',');
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
                window.AppCropper.open(evt.target.result, { aspectRatio: 68 / 98 }, function (croppedData) {
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

  // ============ 真正解压读取 .docx 真实全文 ============
  function extractDocxText(buffer, callback) {
    function fallbackRegex() {
      try {
        var bytes = new Uint8Array(buffer);
        var str = new TextDecoder('utf-8').decode(bytes);
        var matches = str.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
        var parts = [];
        for (var i = 0; i < matches.length; i++) {
          var c = matches[i].replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '');
          c = c.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
          if (c.trim()) parts.push(c);
        }
        callback(parts.join(''));
      } catch (e) {
        callback('');
      }
    }

    function loadZip(cb) {
      if (window.JSZip) return cb(window.JSZip);
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = function () { cb(window.JSZip); };
      s.onerror = function () { cb(null); };
      document.head.appendChild(s);
    }

    loadZip(function (JSZipLib) {
      if (!JSZipLib) {
        fallbackRegex();
        return;
      }
      JSZipLib.loadAsync(buffer).then(function (zip) {
        var doc = zip.file('word/document.xml');
        if (!doc) {
          fallbackRegex();
          return;
        }
        doc.async('string').then(function (xml) {
          var pList = xml.split(/<\/w:p>/g);
          var paras = [];
          for (var i = 0; i < pList.length; i++) {
            var tList = pList[i].match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
            var line = '';
            for (var j = 0; j < tList.length; j++) {
              var txt = tList[j].replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '');
              txt = txt.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
              line += txt;
            }
            if (line.trim()) paras.push(line.trim());
          }
          callback(paras.join('\n\n'));
        }).catch(fallbackRegex);
      }).catch(fallbackRegex);
    });
  }

  // ============ DOCX 智能多词条拆分引擎 ============
  function splitDocxToEntries(rawText, defaultTitle) {
    if (!rawText || !rawText.trim()) return [];
    var text = rawText.trim();
    var entries = [];

    function makeEntry(name, content, idx) {
      var cleanName = (name || ('条目 ' + (idx + 1))).trim();
      var cleanContent = (content || '').trim();
      var keys = [cleanName];

      var keyMatch = cleanContent.match(/^(?:关键词|触发词|Keys?|Key)\s*[:：]\s*(.+)$/im);
      if (keyMatch) {
        var foundKeys = keyMatch[1].split(/[,，\s]+/).filter(Boolean);
        if (foundKeys.length > 0) {
          keys = foundKeys;
          cleanContent = cleanContent.replace(/^(?:关键词|触发词|Keys?|Key)\s*[:：].*$\n?/im, '').trim();
        }
      }

      return {
        id: 'entry_' + Date.now() + '_' + idx,
        name: cleanName,
        content: cleanContent,
        mode: 'key',
        keys: keys,
        scanDepth: 4,
        pos: 'depth',
        depthVal: 2,
        enabled: true
      };
    }

    var match;
    var idx = 0;

    // 1. 尝试 <标签>内容</> 语法
    var tagRegex = /<([^>/]+)>([\s\S]*?)(?:<\/\1>|<\/>)/g;
    while ((match = tagRegex.exec(text)) !== null) {
      if (match[1] && match[2] && match[2].trim()) {
        entries.push(makeEntry(match[1], match[2], idx++));
      }
    }
    if (entries.length > 0) return entries;

    // 2. 尝试 【标题】内容 或 [标题]内容
    var bracketRegex = /(?:^|\n)\s*[【\[]([^】\]]+)[】\]]\s*([\s\S]*?)(?=(?:\n\s*[【\[][^】\]]+[】\]]|$))/g;
    idx = 0;
    while ((match = bracketRegex.exec(text)) !== null) {
      if (match[1] && match[2] && match[2].trim()) {
        entries.push(makeEntry(match[1], match[2], idx++));
      }
    }
    if (entries.length > 1) return entries;

    // 3. 尝试 Markdown 标题 (## 标题 或 # 标题)
    var mdRegex = /(?:^|\n)\s*#{1,3}\s+([^\n]+)\n([\s\S]*?)(?=(?:\n\s*#{1,3}\s+[^\n]+|$))/g;
    idx = 0;
    entries = [];
    while ((match = mdRegex.exec(text)) !== null) {
      if (match[1] && match[2] && match[2].trim()) {
        entries.push(makeEntry(match[1], match[2], idx++));
      }
    }
    if (entries.length > 1) return entries;

    // 4. 尝试 中文序号或数字序号
    var numRegex = /(?:^|\n)\s*(?:(?:[一二三四五六七八九十百]+|[0-9]{1,3})[、.．:]|条目\s*(?:[一二三四五六七八九十百0-9]+)\s*[:：])\s*([^\n]+)\n([\s\S]*?)(?=(?:\n\s*(?:(?:[一二三四五六七八九十百]+|[0-9]{1,3})[、.．:]|条目\s*(?:[一二三四五六七八九十百0-9]+)\s*[:：])|$))/g;
    idx = 0;
    entries = [];
    while ((match = numRegex.exec(text)) !== null) {
      if (match[1] && match[2] && match[2].trim()) {
        entries.push(makeEntry(match[1], match[2], idx++));
      }
    }
    if (entries.length > 1) return entries;

    // 5. 兜底：作为单条核心设定
    return [makeEntry(defaultTitle + ' 设定', text, 0)];
  }

  // ============ 导入 .docx / 自研 .json (彻底绝杀拦截第三方酒馆格式) ============
  function importWorldbookDocx() {
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.docx,.json,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';
    fileInput.onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var fileName = file.name.replace(/\.[^/.]+$/, '') || '导入的世界书';
      var isDocx = file.name.toLowerCase().endsWith('.docx');

      if (!isDocx) {
        var textReader = new FileReader();
        textReader.onload = function (evt) {
          try {
            var rawStr = (evt.target.result || '').toString().replace(/^\uFEFF/, '').trim();
            var data = JSON.parse(rawStr);

            // 绝杀拦截：检测酒馆私有特征字段
            if (data.tavo_spec || data.tavo_spec_version || (data.entries && typeof data.entries === 'object' && !Array.isArray(data.entries))) {
              if (window.AppNav) window.AppNav.showToast('格式不支持，仅支持 Niveous 独立自研世界书');
              return;
            }

            if (!data || !Array.isArray(data.entries) || data.entries.length === 0) {
              if (window.AppNav) window.AppNav.showToast('世界书中未检测到有效词条');
              return;
            }

            var wbTitle = data.name || data.title || fileName;
            var parsedEntries = data.entries.map(function (item, idx) {
              var keysArr = [];
              var sourceKey = item.keys || item.key;
              if (Array.isArray(sourceKey)) {
                keysArr = sourceKey;
              } else if (typeof sourceKey === 'string' && sourceKey.trim()) {
                keysArr = sourceKey.split(/[,，\s]+/).filter(Boolean);
              }

              var isConst = (item.mode === 'const') || (item.constant === true);
              var entryName = item.name || ('条目 ' + (idx + 1));
              var contentText = item.content || item.text || item.value || '';
              var scanDepth = parseInt(item.scanDepth, 10) || 4;
              var depthVal = parseInt(item.depthVal, 10) || 2;
              var isEnabled = (item.enabled !== false);

              return {
                id: 'entry_' + Date.now() + '_' + idx,
                name: entryName,
                content: contentText,
                mode: isConst ? 'const' : 'key',
                keys: keysArr,
                scanDepth: scanDepth,
                pos: (item.pos === 'before' || item.pos === 'after') ? item.pos : 'depth',
                depthVal: depthVal,
                enabled: isEnabled
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
            if (window.AppNav) window.AppNav.showToast('成功导入：《' + wbTitle + '》共 ' + parsedEntries.length + ' 条');
          } catch (err) {
            if (window.AppNav) window.AppNav.showToast('文件格式有误，导入失败');
          }
        };
        textReader.readAsText(file, 'utf-8');
      } else {
        var reader = new FileReader();
        reader.onload = function (evt) {
          var arrayBuffer = evt.target.result;
          if (window.AppNav) window.AppNav.showToast('正在解析文档...');
          extractDocxText(arrayBuffer, function (textContent) {
            if (!textContent || !textContent.trim()) {
              if (window.AppNav) window.AppNav.showToast('未能从文档中提取到文字内容');
              return;
            }

            var entriesList = splitDocxToEntries(textContent, fileName);

            var newWb = {
              id: 'wb_' + Date.now(),
              title: fileName,
              cover: '',
              entries: entriesList
            };

            state.worldbooks.push(newWb);
            saveWorldbooksData();
            renderHomeView();
            if (window.AppNav) window.AppNav.showToast('成功导入文档：《' + fileName + '》共 ' + entriesList.length + ' 条');
          });
        };
        reader.readAsArrayBuffer(file);
      }
    };
    fileInput.click();
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
        + '    <div class="wb-header-left-col">'
        + '      <div class="wb-header-switch-wrap" id="wbHeaderSwitchWrap">'
        + '        <span class="wb-gallery-main-title" id="wbGalleryMainTitle">世界书</span>'
        + '        <svg class="wb-header-arrow-down" id="wbHeaderArrowDown" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'
        + '      </div>'
        + '      <span class="wb-gallery-sub-en" id="wbGallerySubEn">WORLD BOOK</span>'
        + '    </div>'
        + '    <button class="wb-header-circle-btn saturn-btn" id="wbBtnRightAction" type="button" title="功能与改色">'
        + '      <div class="ring-back"></div>'
        + '      <div class="saturn-planet-core">'
        + '        <div class="core-snowflake">❆</div>'
        + '      </div>'
        + '      <div class="ring-front"></div>'
        + '      <div class="ring-star-dot"></div>'
        + '    </button>'
        + '    <div class="wb-header-dropdown-menu" id="wbHeaderDropdownMenu">'
        + '      <div class="wb-pop-item active" data-switch-to="wb">世界书</div>'
        + '      <div class="wb-pop-item" data-switch-to="preset">预设</div>'
        + '      <div class="wb-pop-item" data-switch-to="regex">正则</div>'
        + '    </div>'
        + '    <div class="wb-right-menu-popover" id="wbRightMenuPopover">'
        + '      <button class="wb-action-card-btn" id="wbPopBtnNew" type="button">'
        + '        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>'
        + '        <span>新建独立世界书</span>'
        + '      </button>'
        + '      <button class="wb-action-card-btn" id="wbPopBtnImport" type="button">'
        + '        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>'
        + '        <span>导入世界书</span>'
        + '      </button>'
        + '      <div class="wb-menu-color-row">'
        + '        <div class="wb-swatch-dot" style="background:#A6BFE0;" data-color="#A6BFE0" data-bg="rgba(166,191,224,0.22)" title="经典冰蓝"></div>'
        + '        <div class="wb-swatch-dot" style="background:#e5e5ea;" data-color="#e5e5ea" data-bg="rgba(229,229,234,0.22)" title="高级浅灰"></div>'
        + '        <div class="wb-custom-color-item" title="自定义取色">'
        + '          <input type="color" class="wb-custom-color-input" id="wbCustomColorInput" value="#A6BFE0">'
        + '        </div>'
        + '      </div>'
        + '    </div>'
        + '  </div>'

        + '  <div class="wb-viewport-box wb-home-scroll-viewport" id="wbHomeView"></div>'
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
        html = '<div class="wb-empty-tip">✦ 暂无世界书，请点击右上角菜单新建 ✦</div>';
      } else {
        state.worldbooks.forEach(function (wb) {
          var coverImgHtml = wb.cover ? '<img src="' + wb.cover + '" alt="封面">' : '<img src="" alt="封面">';
          var hasImgCls = wb.cover ? ' has-img' : '';

          var stats = getWbTokensStats(wb);

          html += ''
            + '<div class="wb-art-card" data-wb-id="' + wb.id + '">'
            + '  <div class="wb-art-frame-left' + hasImgCls + '" data-cover-wb="' + wb.id + '">'
            + coverImgHtml
            + '    <svg class="wb-art-cam-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>'
            + '  </div>'
            + '  <div class="wb-art-info-right">'
            + '    <div class="wb-art-title-line">'
            + '      <span class="wb-art-title-text">' + (wb.title || '未命名世界书') + '</span>'
            + '      <button class="wb-art-stars-btn" type="button" data-wb-more="' + wb.id + '">'
            + '        <span class="wb-art-star-dot">✦</span>'
            + '        <span class="wb-art-star-dot">✦</span>'
            + '        <span class="wb-art-star-dot">✦</span>'
            + '      </button>'
            + '    </div>'
            + '    <div class="wb-art-dot-divider"></div>'
            + '    <div class="wb-art-meta-bottom" data-card-click-enter="' + wb.id + '">'
            + '      <span class="wb-art-count">总计 ' + stats.total + ' · 实际发送 <span>' + stats.active + ' Tokens</span></span>'
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

    setupPureVerticalDragSort(homeBox, '.wb-art-card', function (newOrderIds) {
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

        var modeName = entry.mode === 'const' ? '常驻全局' : '关键词';
        var posName = entry.pos === 'before' ? '角色定义前' : (entry.pos === 'after' ? '角色定义后' : ('深度 ' + (entry.depthVal !== undefined ? entry.depthVal : 2)));
        
        var subTextDesc = '<span>' + modeName + '</span> · ' + posName + ' · <span>' + entryTokens + ' Tokens</span>';
        
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
      setupPureVerticalDragSort(listWrap, '.wb-entry-item-card', function (newOrderIds) {
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
      + '      <textarea class="wb-clean-textarea" id="wbIptContent" placeholder="">' + content + '</textarea>'
      + '      <span class="wb-char-count" id="wbCharCount">' + content.length + ' 字</span>'
      + '    </div>'
      + '  </div>'

      + '  <div class="wb-field-card" id="wbKeyWrap" ' + keyWrapOpacity + '>'
      + '    <div class="wb-field-head-row"><span class="wb-field-label">触发关键词</span></div>'
      + '    <div class="wb-tag-box" id="wbTagBox"></div>'
      + '    <input class="wb-clean-input" type="text" id="wbIptKeyInput" placeholder="输入词后回车添加...">'
      + '    <div class="wb-scan-depth-row">'
      + '      <span class="wb-scan-desc">扫描深度（向前检索多少轮消息扫到相关关键词）</span>'
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
      + '      <span class="wb-scan-desc">插入深度 (0是插入到最新一条历史聊天消息的前面，1是第二新，以此类推)</span>'
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
    if (!state.editTempTags || state.editTempTags.length === 0) {
      box.style.display = 'none';
      return;
    }
    box.style.display = 'flex';
    state.editTempTags.forEach(function (t, idx) {
      var tag = document.createElement('span');
      tag.className = 'wb-kw-tag';
      tag.dataset.delTag = idx;
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

  // ============ 纯垂直微放大平滑拖拽引擎 ============
  function setupPureVerticalDragSort(container, itemSelector, onReorderCallback) {
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

          itemStep = el.offsetHeight + 10;
          isDragging = true;

          el.style.transform = 'scaleY(1.035)';
          el.style.boxShadow = 'none';
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

        el.style.transform = 'translateY(' + dy + 'px) scaleY(1.035)';
        el.style.boxShadow = 'none';

        var slotOffset = Math.round(dy / itemStep);
        var newTarget = Math.max(0, Math.min(allCards.length - 1, fromIndex + slotOffset));

        if (newTarget !== targetIndex) {
          targetIndex = newTarget;

          allCards.forEach(function (card, idx) {
            if (card === el) return;
            card.style.transition = 'transform 0.22s cubic-bezier(0.2, 0, 0.2, 1)';

            if (fromIndex < targetIndex) {
              if (idx > fromIndex && idx <= targetIndex) {
                card.style.transform = 'translateY(-' + itemStep + 'px)';
              } else {
                card.style.transform = '';
              }
            } else if (fromIndex > targetIndex) {
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

        allCards.forEach(function (c) {
          c.style.transform = '';
          c.style.boxShadow = '';
          c.style.zIndex = '';
          c.style.transition = '';
        });

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
        state.isCreatingNewWb = false;
        saveWorldbooksData();
        renderHomeView();
      } else if (state.isEditingBookTitle) {
        state.isEditingBookTitle = false;
        renderEntriesView(state.currentWbId);
      } else {
        renderHomeView();
      }
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
      if (e.target && e.target.id === 'wbCustomColorInput') {
        var chosenColor = e.target.value;
        var customBg = 'rgba(' + hexToRgb(chosenColor) + ', 0.22)';
        sectionThemes[state.currentSection] = { color: chosenColor, bg: customBg };
        updateThemeVariables(sectionThemes[state.currentSection]);
        saveThemesData();
      }
    });

    function addKeyTagFromInput(inputEl) {
      if (!inputEl) return;
      var raw = inputEl.value || '';
      var words = raw.split(/[,，\s]+/);
      words.forEach(function (w) {
        var clean = w.trim();
        if (clean && state.editTempTags.indexOf(clean) === -1) {
          state.editTempTags.push(clean);
        }
      });
      renderTags();
      inputEl.value = '';
    }

    container.addEventListener('keydown', function (e) {
      if (e.target && e.target.id === 'wbIptKeyInput') {
        if (e.key === 'Enter' || e.keyCode === 13) {
          e.preventDefault();
          addKeyTagFromInput(e.target);
        }
      }
    });

    container.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'wbIptKeyInput') {
        var v = e.target.value;
        if (v.indexOf(',') !== -1 || v.indexOf('，') !== -1) {
          addKeyTagFromInput(e.target);
        }
      }
    });

    container.addEventListener('blur', function (e) {
      if (e.target && e.target.id === 'wbIptKeyInput') {
        addKeyTagFromInput(e.target);
      }
    }, true);

    container.addEventListener('click', function (e) {
      // 1. 顶栏 ∨ 下拉切换
      if (e.target.closest('#wbHeaderSwitchWrap')) {
        e.stopPropagation();
        var menu = document.getElementById('wbHeaderDropdownMenu');
        var arrow = document.getElementById('wbHeaderArrowDown');
        if (menu) menu.classList.toggle('show');
        if (arrow) arrow.classList.toggle('open');
        var pRight = document.getElementById('wbRightMenuPopover');
        if (pRight) pRight.classList.remove('show');
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

        updateThemeVariables(sectionThemes[targetSec]);
        renderHomeView();
        return;
      }

      // 2. 右上角土星按钮展开浮层
      if (e.target.closest('#wbBtnRightAction')) {
        e.stopPropagation();
        var popRight = document.getElementById('wbRightMenuPopover');
        if (popRight) popRight.classList.toggle('show');
        var dMenu2 = document.getElementById('wbHeaderDropdownMenu');
        var dArrow2 = document.getElementById('wbHeaderArrowDown');
        if (dMenu2) dMenu2.classList.remove('show');
        if (dArrow2) dArrow2.classList.remove('open');
        return;
      }

      // 3. 浮层内：新建世界书
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

      // 4. 浮层内：导入世界书
      if (e.target.closest('#wbPopBtnImport')) {
        e.stopPropagation();
        var popR2 = document.getElementById('wbRightMenuPopover');
        if (popR2) popR2.classList.remove('show');
        importWorldbookDocx();
        return;
      }

      // 5. 核心改色
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
        if (window.AppNav) window.AppNav.showToast('色彩主题已切换');
        return;
      }

      // 6. 新建名称页返回与确定
      if (e.target.closest('#wbBtnMetaBack')) {
        if (state.isCreatingNewWb) {
          state.worldbooks = state.worldbooks.filter(function (w) { return w.id !== state.currentWbId; });
          state.isCreatingNewWb = false;
          renderHomeView();
        } else if (state.isEditingBookTitle) {
          state.isEditingBookTitle = false;
          renderEntriesView(state.currentWbId);
        } else {
          renderHomeView();
        }
        return;
      }

      if (e.target.closest('#wbBtnSaveBookMeta')) {
        var bookTitleIpt = document.getElementById('wbIptBookTitle');
        var currentBook = state.worldbooks.find(function (w) { return w.id === state.currentWbId; });
        if (currentBook && bookTitleIpt) {
          currentBook.title = (bookTitleIpt.value || '').trim() || '未命名世界书';
          saveWorldbooksData();
          
          if (state.isCreatingNewWb) {
            state.isCreatingNewWb = false;
            renderEditView(null);
          } else if (state.isEditingBookTitle) {
            state.isEditingBookTitle = false;
            renderEntriesView(state.currentWbId);
          } else {
            renderEntriesView(state.currentWbId);
          }
        }
        return;
      }

      if (e.target.closest('#wbBtnEditBookTitle')) {
        state.isEditingBookTitle = true;
        renderBookMetaView(state.currentWbId);
        return;
      }

      // 7. 词条列表返回与保存
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

      // 8. 编辑页返回
      if (e.target.closest('#wbBtnEditBack')) {
        saveCurrentEditEntry();
        renderEntriesView(state.currentWbId);
        return;
      }

      // 空白处关闭浮层
      if (!e.target.closest('#wbHeaderSwitchWrap') && !e.target.closest('#wbHeaderDropdownMenu')) {
        var hMenu = document.getElementById('wbHeaderDropdownMenu');
        var hArr = document.getElementById('wbHeaderArrowDown');
        if (hMenu) hMenu.classList.remove('show');
        if (hArr) hArr.classList.remove('open');
      }
      if (!e.target.closest('#wbBtnRightAction') && !e.target.closest('#wbRightMenuPopover')) {
        var popRgt = document.getElementById('wbRightMenuPopover');
        if (popRgt) popRgt.classList.remove('show');
      }

      // 9. 三星芒按钮菜单
      var moreBtn = e.target.closest('[data-wb-more]');
      if (moreBtn) {
        e.stopPropagation();
        var wbId = moreBtn.dataset.wbMore;
        var mMenu = document.getElementById('wbMenu_' + wbId);
        var currentCard = moreBtn.closest('.wb-art-card');
        var isOpen = mMenu && mMenu.classList.contains('show');

        container.querySelectorAll('.wb-art-card').forEach(function(c) { c.classList.remove('menu-active'); });
        container.querySelectorAll('.wb-dropdown-menu').forEach(function(m) { m.classList.remove('show'); });

        if (!isOpen && mMenu) {
          mMenu.classList.add('show');
          if (currentCard) currentCard.classList.add('menu-active');
        }
        return;
      }

      var menuItem = e.target.closest('[data-menu-act]');
      if (menuItem) {
        e.stopPropagation();
        var act = menuItem.dataset.menuAct;
        var mId = menuItem.dataset.id;
        container.querySelectorAll('.wb-art-card').forEach(function(c) { c.classList.remove('menu-active'); });
        container.querySelectorAll('.wb-dropdown-menu').forEach(function(m) { m.classList.remove('show'); });

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
      container.querySelectorAll('.wb-art-card').forEach(function(c) { c.classList.remove('menu-active'); });
      container.querySelectorAll('.wb-dropdown-menu').forEach(function(m) { m.classList.remove('show'); });

      // 10. 点击封面换图
      var coverWrap = e.target.closest('[data-cover-wb]');
      if (coverWrap) {
        e.stopPropagation();
        handleCoverClick(coverWrap.dataset.coverWb);
        return;
      }

      // 11. 全卡片点击直接进入（仅限点击下半部分）
      var enterCard = e.target.closest('[data-card-click-enter]');
      if (enterCard) {
        renderEntriesView(enterCard.dataset.cardClickEnter);
        return;
      }

      // 12. 新建条目
      if (e.target.closest('#wbNavBtnNewEntry')) {
        renderEditView(null);
        return;
      }

      // 13. 打开已有条目
      var openEntryItem = e.target.closest('[data-open-entry]');
      if (openEntryItem) {
        renderEditView(openEntryItem.dataset.openEntry);
        return;
      }

      // 14. 条目列表内操作 (编辑 / 复制 / 删除 / 开关)
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

            renderEntriesView(state.currentWbId);
          }
        }
        return;
      }

      // 15. 模式与注入位置切换
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

      // 16. 标签删除
      var delTagBtn = e.target.closest('[data-del-tag]');
      if (delTagBtn) {
        e.stopPropagation();
        e.preventDefault();
        var idx = parseInt(delTagBtn.dataset.delTag, 10);
        state.editTempTags.splice(idx, 1);
        renderTags();
        return;
      }

      // 17. 沉浸编辑扩大与收起
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

