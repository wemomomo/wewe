
(function(){
  'use strict';

  var isSelectMode = false;
  var selectedUrls = [];

  function initImgbedContent() {
    // 1. 如果页面上没有图床页面，自己自动创建挂载
    var page = document.querySelector('[data-page="imgbed"]');
    if (!page) {
      page = document.createElement('div');
      page.className = 'page app-page';
      page.dataset.page = 'imgbed';
      page.innerHTML = '<div class="app-header">'
        + '<button class="icon-back-btn" data-back="home"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
        + '<div class="app-title">图床</div>'
        + '</div><div class="app-content" id="imgbedContent"></div>';
      
      var pageContainer = document.getElementById('pageContainer');
      if (pageContainer) pageContainer.appendChild(page);
    }

    var content = document.getElementById('imgbedContent');
    if (!content) return;
    if (content.querySelector('.imgbed-container')) return;
    
    content.innerHTML = '<div class="imgbed-container">'
      + '<div class="imgbed-top-card">'
      + '<div class="imgbed-name-wrap">'
      + '<div class="imgbed-name-label">自定义名称（选填）</div>'
      + '<input type="text" class="imgbed-name-input" id="inAppCustomNameInput" placeholder="如: my-avatar (仅支持英文/数字)" autocomplete="off" autocapitalize="none">'
      + '</div>'
      + '<div class="imgbed-upload-card" id="inAppDropBox">'
      + '<div class="imgbed-icon-circle"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>'
      + '<div class="imgbed-upload-info">'
      + '<div class="imgbed-upload-title" id="inAppUploadText">选择照片并裁剪上传</div>'
      + '<div class="imgbed-upload-tip">自动极速轻量化 PNG · 点击历史图片可放大预览</div>'
      + '</div>'
      + '<input type="file" id="inAppFileInput" accept="image/*" style="display:none">'
      + '</div>'
      + '</div>'
      + '<div class="imgbed-history-section" id="inAppHistorySection">'
      + '<div class="imgbed-history-header">'
      + '<span>历史记录</span>'
      + '<div class="imgbed-header-actions">'
      + '<button class="imgbed-hdr-btn" id="inAppCopyAllBtn" type="button">复制全部</button>'
      + '<button class="imgbed-hdr-btn" id="inAppToggleSelectBtn" type="button">多选</button>'
      + '<button class="imgbed-hdr-btn danger" id="inAppClearHistory" type="button">清空</button>'
      + '</div>'
      + '</div>'
      + '<div class="imgbed-batch-bar" id="inAppBatchBar">'
      + '<span class="imgbed-batch-info" id="inAppBatchInfo">已选 0 项</span>'
      + '<div class="imgbed-batch-btns">'
      + '<button class="imgbed-batch-act select-all" id="inAppSelectAllBtn" type="button">全选</button>'
      + '<button class="imgbed-batch-act copy" id="inAppBatchCopyBtn" type="button">复制所选</button>'
      + '<button class="imgbed-batch-act delete" id="inAppBatchDelBtn" type="button">删除所选</button>'
      + '</div>'
      + '</div>'
      + '<div class="imgbed-history-list" id="inAppHistoryList"></div>'
      + '</div>'
      + '</div>'
      + '<div class="imgbed-viewer-modal" id="inAppViewerModal">'
      + '<div class="imgbed-viewer-card">'
      + '<div class="imgbed-viewer-header">'
      + '<span class="imgbed-viewer-title">图片预览与直链</span>'
      + '<button class="imgbed-viewer-close" id="inAppViewerClose" type="button">'
      + '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      + '</button>'
      + '</div>'
      + '<div class="imgbed-viewer-box"><img id="inAppViewerImg" class="imgbed-viewer-img" src="" alt="大图预览"></div>'
      + '<div class="imgbed-viewer-bar">'
      + '<input type="text" id="inAppViewerInput" readonly>'
      + '<button class="imgbed-viewer-copy" id="inAppViewerCopyBtn" type="button">复制直链</button>'
      + '</div>'
      + '</div>'
      + '</div>';

    var dropBox = document.getElementById('inAppDropBox');
    var fileInput = document.getElementById('inAppFileInput');
    var uploadText = document.getElementById('inAppUploadText');
    var customNameInput = document.getElementById('inAppCustomNameInput');
    var historySection = document.getElementById('inAppHistorySection');
    var historyList = document.getElementById('inAppHistoryList');
    var clearBtn = document.getElementById('inAppClearHistory');
    var toggleSelectBtn = document.getElementById('inAppToggleSelectBtn');
    var copyAllBtn = document.getElementById('inAppCopyAllBtn');
    var batchBar = document.getElementById('inAppBatchBar');
    var batchInfo = document.getElementById('inAppBatchInfo');
    var selectAllBtn = document.getElementById('inAppSelectAllBtn');
    var batchCopyBtn = document.getElementById('inAppBatchCopyBtn');
    var batchDelBtn = document.getElementById('inAppBatchDelBtn');

    var viewerModal = document.getElementById('inAppViewerModal');
    var viewerImg = document.getElementById('inAppViewerImg');
    var viewerInput = document.getElementById('inAppViewerInput');
    var viewerCopyBtn = document.getElementById('inAppViewerCopyBtn');
    var viewerClose = document.getElementById('inAppViewerClose');

    function openViewer(url) {
      if (!url) return;
      viewerImg.src = url;
      viewerInput.value = url;
      viewerModal.classList.add('show');
    }

    function closeViewer() {
      viewerModal.classList.remove('show');
      viewerImg.src = '';
    }

    if (viewerClose) viewerClose.addEventListener('click', closeViewer);
    if (viewerModal) {
      viewerModal.addEventListener('click', function(e) {
        if (e.target === viewerModal) closeViewer();
      });
    }

    if (viewerCopyBtn) {
      viewerCopyBtn.addEventListener('click', function() {
        if (!viewerInput.value) return;
        navigator.clipboard.writeText(viewerInput.value).then(function() {
          if (window.AppNav) AppNav.showToast('直链已复制到剪贴板！');
        });
      });
    }

    dropBox.addEventListener('click', function() { fileInput.click(); });

    fileInput.addEventListener('change', function() {
      var file = this.files[0];
      if (!file) return;

      var reader = new FileReader();
      reader.onload = function(e) {
        var rawBase64 = e.target.result;

        if (window.AppCropper) {
          window.AppCropper.open(rawBase64, { aspectRatio: 0 }, function(croppedData) {
            rawBase64 = null;
            compressImage(croppedData, function(safeBase64) {
              uploadToServer(safeBase64, file.name);
            });
          });
        } else {
          compressImage(rawBase64, function(safeBase64) {
            uploadToServer(safeBase64, file.name);
          });
          rawBase64 = null;
        }
      };
      reader.readAsDataURL(file);
      this.value = '';
    });

    // 智能轻量化 PNG 压缩：控制在 512px 黄金规格（体积仅 50~80KB，瞬间秒开）
    function compressImage(base64Str, callback) {
      var img = new Image();
      img.onload = function() {
        var maxSide = 512; // 512px 完美适配 iOS Retina 桌面图标与头像，极度轻巧
        var w = img.width;
        var h = img.height;

        if (w > maxSide || h > maxSide) {
          if (w > h) {
            h = Math.round((h * maxSide) / w);
            w = maxSide;
          } else {
            w = Math.round((w * maxSide) / h);
            h = maxSide;
          }
        }

        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        var compressed = canvas.toDataURL('image/png');
        callback(compressed);
      };
      img.src = base64Str;
    }

    function uploadToServer(safeBase64, originalName) {
      uploadText.textContent = '极速上传中...';
      dropBox.style.pointerEvents = 'none';

      var customName = (customNameInput.value || '').trim();

      fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          base64Data: safeBase64,
          filename: originalName,
          mimeType: 'image/png',
          customName: customName,
          forcePNG: true
        })
      })
      .then(function(res){ return res.json(); })
      .then(function(data){
        dropBox.style.pointerEvents = 'auto';
        uploadText.textContent = '选择照片并裁剪上传';
        safeBase64 = null;

        if (data.success && data.url) {
          if (window.AppNav) AppNav.showToast('上传成功！已生成极速 PNG');
          saveHistory(data.url);
          openViewer(data.url);
        } else {
          if (window.AppNav) AppNav.showToast(data.message || '上传失败');
        }
      })
      .catch(function(){
        dropBox.style.pointerEvents = 'auto';
        uploadText.textContent = '选择照片并裁剪上传';
        safeBase64 = null;
        if (window.AppNav) AppNav.showToast('网络错误，请重试');
      });
    }

    copyAllBtn.addEventListener('click', function() {
      var list = getHistoryList();
      if (!list.length) return;
      var allUrls = list.map(function(item){ return item.url; }).join('\n');
      navigator.clipboard.writeText(allUrls).then(function() {
        if (window.AppNav) AppNav.showToast('已复制全部 ' + list.length + ' 条链接！');
      });
    });

    toggleSelectBtn.addEventListener('click', function() {
      isSelectMode = !isSelectMode;
      selectedUrls = [];
      if (isSelectMode) {
        toggleSelectBtn.classList.add('active');
        toggleSelectBtn.textContent = '取消';
        historyList.classList.add('select-mode');
        batchBar.classList.add('show');
      } else {
        toggleSelectBtn.classList.remove('active');
        toggleSelectBtn.textContent = '多选';
        historyList.classList.remove('select-mode');
        batchBar.classList.remove('show');
      }
      updateBatchBar();
      renderHistoryList();
    });

    selectAllBtn.addEventListener('click', function() {
      var list = getHistoryList();
      if (selectedUrls.length === list.length) {
        selectedUrls = [];
        selectAllBtn.textContent = '全选';
      } else {
        selectedUrls = list.map(function(item){ return item.url; });
        selectAllBtn.textContent = '取消全选';
      }
      updateBatchBar();
      renderHistoryList();
    });

    batchCopyBtn.addEventListener('click', function() {
      if (!selectedUrls.length) {
        if (window.AppNav) AppNav.showToast('请先勾选图片');
        return;
      }
      var text = selectedUrls.join('\n');
      navigator.clipboard.writeText(text).then(function() {
        if (window.AppNav) AppNav.showToast('已复制选中的 ' + selectedUrls.length + ' 条链接！');
      });
    });

    batchDelBtn.addEventListener('click', function() {
      if (!selectedUrls.length) {
        if (window.AppNav) AppNav.showToast('请先勾选图片');
        return;
      }
      if (!confirm('确定要删除选中的 ' + selectedUrls.length + ' 条记录吗？')) return;
      var list = getHistoryList();
      list = list.filter(function(item){ return selectedUrls.indexOf(item.url) === -1; });
      localStorage.setItem('niveous_inapp_history', JSON.stringify(list));
      
      selectedUrls = [];
      updateBatchBar();
      renderHistoryList();
      if (window.AppNav) AppNav.showToast('已删除选中项');
    });

    function updateBatchBar() {
      batchInfo.textContent = '已选 ' + selectedUrls.length + ' 项';
      var list = getHistoryList();
      if (list.length && selectedUrls.length === list.length) {
        selectAllBtn.textContent = '取消全选';
      } else {
        selectAllBtn.textContent = '全选';
      }
    }

    function getHistoryList() {
      try { return JSON.parse(localStorage.getItem('niveous_inapp_history') || '[]'); } catch(e) { return []; }
    }

    function saveHistory(u) {
      var l = getHistoryList();
      l = l.filter(function(item){ return item.url !== u; });
      l.unshift({ url: u, time: Date.now() });
      if (l.length > 30) l = l.slice(0, 30);
      localStorage.setItem('niveous_inapp_history', JSON.stringify(l));
      renderHistoryList();
    }

    function deleteHistoryItem(u) {
      var l = getHistoryList();
      l = l.filter(function(item){ return item.url !== u; });
      localStorage.setItem('niveous_inapp_history', JSON.stringify(l));
      renderHistoryList();
      if (window.AppNav) AppNav.showToast('已删除记录');
    }

    function renderHistoryList() {
      var l = getHistoryList();
      if (!l.length) {
        historySection.classList.remove('show');
        return;
      }
      historySection.classList.add('show');
      historyList.innerHTML = l.map(function(item) {
        var isSelected = (selectedUrls.indexOf(item.url) !== -1);
        return '<div class="imgbed-history-item' + (isSelected ? ' selected' : '') + '" data-url="' + item.url + '">'
          + '<div class="imgbed-check-circle"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>'
          + '<img class="imgbed-history-thumb" src="' + item.url + '">'
          + '<div class="imgbed-history-info">'
          + '<div class="imgbed-history-url">' + item.url + '</div>'
          + '<div class="imgbed-history-tag">' + (isSelectMode ? (isSelected ? '✓ 已选中' : '点击勾选') : '点击放大预览') + '</div>'
          + '</div>'
          + '<div class="imgbed-history-actions">'
          + '<button class="imgbed-btn-action copy" data-copy-url="' + item.url + '" type="button">复制</button>'
          + '<button class="imgbed-btn-action delete" data-del-url="' + item.url + '" type="button">删除</button>'
          + '</div>'
          + '</div>';
      }).join('');

      historyList.querySelectorAll('.imgbed-history-item').forEach(function(row){
        row.addEventListener('click', function(e){
          if (e.target.closest('.imgbed-btn-action')) return;
          var u = this.dataset.url;
          if (isSelectMode) {
            var idx = selectedUrls.indexOf(u);
            if (idx === -1) selectedUrls.push(u);
            else selectedUrls.splice(idx, 1);
            updateBatchBar();
            renderHistoryList();
          } else {
            openViewer(u);
          }
        });
      });

      historyList.querySelectorAll('[data-copy-url]').forEach(function(btn){
        btn.addEventListener('click', function(e){
          e.stopPropagation();
          var u = this.dataset.copyUrl;
          navigator.clipboard.writeText(u).then(function() { 
            if (window.AppNav) AppNav.showToast('已复制'); 
          });
        });
      });

      historyList.querySelectorAll('[data-del-url]').forEach(function(btn){
        btn.addEventListener('click', function(e){
          e.stopPropagation();
          deleteHistoryItem(this.dataset.delUrl);
        });
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        if (!confirm('确定要清空所有上传历史吗？')) return;
        localStorage.removeItem('niveous_inapp_history');
        selectedUrls = [];
        renderHistoryList();
        if (window.AppNav) AppNav.showToast('历史已清空');
      });
    }

    renderHistoryList();
  }

  window.addEventListener('dbReady', initImgbedContent);
  window.addEventListener('pageChange', function(e) {
    if (e.detail && e.detail.page === 'imgbed') {
      initImgbedContent();
    }
  });

})();
