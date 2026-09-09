
(function() {
  'use strict';
  
  var isDomRendered = false;

  var beautifyData = {
    activePwaIcon: 'heart',
    customPwaIconUrl: '',
    cornerStyle: 'standard',
    iconStyle: 'normal',
    themeMode: 'light',
    brightness: 100,
    bgHistory: []
  };

  var DEFAULT_HEART_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%2388abda'/%3E%3Ctext x='50%25' y='55%25' font-size='45' text-anchor='middle' dominant-baseline='middle' fill='white'%3E%E2%99%A1%3C/text%3E%3C/svg%3E";
  var ICON_PATH_1 = '/97A2A7C7-37EE-4B08-A7AC-FA77A29FA6ED.jpeg';
  var ICON_PATH_2 = '/E87530F1-A12E-4235-A9E6-2E279F85656F.jpeg';

  function initBeautifyApp() {
    var contentEl = document.getElementById('beautifyContent');
    if (!contentEl) return;

    if (!isDomRendered || contentEl.innerHTML.trim() === '') {
      renderBeautifyDOM(contentEl);
      bindBeautifyEvents();
      isDomRendered = true;
    }
    
    loadBeautifyData();
  }

  function renderBeautifyDOM(container) {
    var html = '' +
      '<div class="beautify-container">' +
        '<input type="file" id="pwaCustomFileInput" accept="image/*" style="display:none;">' +
        '<input type="file" id="beautifyBgFileInput" accept="image/*" style="display:none;">' +

        '<div class="beautify-main-view" id="bMainView">' +
          '<div class="beautify-menu-item" data-open-sub="pwa_bg">' +
            '<div class="beautify-menu-icon">' +
              '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>' +
            '</div>' +
            '<div class="beautify-menu-text">' +
              '<div class="beautify-menu-title">pwa桌面与背景图片</div>' +
              '<div class="beautify-menu-desc">管理添加到主屏幕的图标与全屏壁纸</div>' +
            '</div>' +
            '<svg class="beautify-arrow" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>' +
          '</div>' +

          '<div class="beautify-menu-item" data-open-sub="ui">' +
            '<div class="beautify-menu-icon">' +
              '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/></svg>' +
            '</div>' +
            '<div class="beautify-menu-text">' +
              '<div class="beautify-menu-title">组件UI</div>' +
              '<div class="beautify-menu-desc">调整卡片圆角轮廓与质感</div>' +
            '</div>' +
            '<svg class="beautify-arrow" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>' +
          '</div>' +

          '<div class="beautify-menu-item" data-open-sub="icons">' +
            '<div class="beautify-menu-icon">' +
              '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>' +
            '</div>' +
            '<div class="beautify-menu-text">' +
              '<div class="beautify-menu-title">内部图标</div>' +
              '<div class="beautify-menu-desc">选择桌面与底栏图标光效</div>' +
            '</div>' +
            '<svg class="beautify-arrow" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>' +
          '</div>' +

          '<div class="beautify-menu-item" data-open-sub="display">' +
            '<div class="beautify-menu-icon">' +
              '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>' +
            '</div>' +
            '<div class="beautify-menu-text">' +
              '<div class="beautify-menu-title">显示与亮度</div>' +
              '<div class="beautify-menu-desc">浅色/深色主题与屏幕滤镜</div>' +
            '</div>' +
            '<svg class="beautify-arrow" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>' +
          '</div>' +
        '</div>' +

        '<div class="beautify-sub-view" id="bSub_pwa_bg">' +
          '<div class="beautify-sub-header">' +
            '<button class="beautify-sub-back" data-back="beautify-main" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>返回</button>' +
          '</div>' +

          '<div class="beautify-card">' +
            '<div class="beautify-card-header">' +
              '<div class="beautify-card-title">主屏幕快捷图标</div>' +
              '<div class="beautify-card-desc">选择预设或点击自定义从相册裁剪上传属于你的专属App图标</div>' +
            '</div>' +
            '<div class="pwa-icons-grid">' +
              '<div class="pwa-icon-item active" data-pwa-val="heart" data-pwa-name="默认">' +
                '<div class="pwa-icon-preview">' +
                  '<div class="pwa-svg-box">&#9825;</div>' +
                '</div>' +
                '<span class="pwa-icon-name">默认</span>' +
              '</div>' +
              '<div class="pwa-icon-item" data-pwa-val="icon1" data-pwa-name="雪魄">' +
                '<div class="pwa-icon-preview">' +
                  '<img src="' + ICON_PATH_1 + '" alt="雪魄">' +
                '</div>' +
                '<span class="pwa-icon-name">雪魄</span>' +
              '</div>' +
              '<div class="pwa-icon-item" data-pwa-val="icon2" data-pwa-name="雪宝">' +
                '<div class="pwa-icon-preview">' +
                  '<img src="' + ICON_PATH_2 + '" alt="雪宝">' +
                '</div>' +
                '<span class="pwa-icon-name">雪宝</span>' +
              '</div>' +
              '<div class="pwa-icon-item pwa-custom-item" id="pwaCustomItem" data-pwa-val="custom" data-pwa-name="自定义">' +
                '<div class="pwa-icon-preview" id="pwaCustomPreview">' +
                  '<div class="pwa-custom-placeholder" id="pwaCustomPlaceholder">' +
                    '<svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></svg>' +
                  '</div>' +
                  '<img id="pwaCustomImg" style="display:none;" alt="自定义">' +
                '</div>' +
                '<span class="pwa-icon-name" id="pwaCustomLabel">自定义</span>' +
              '</div>' +
            '</div>' +
            '<div class="pwa-tip-box">' +
              '提示：若点击自定义已有图标，可更换或删除；苹果设备添加到主屏幕时，请等待2-4秒钟图标刷新方可。' +
            '</div>' +
          '</div>' +

          '<div class="bg-dual-row">' +
            // 左侧大预览卡片（完整手机屏幕微缩）
            '<div class="beautify-card bg-preview-card">' +
              '<div class="bg-screen-preview" id="bgLivePreviewScreen">' +
                '<div class="bg-screen-img" id="bgLivePreviewImg"></div>' +
                '<div class="bg-screen-body">' +
                  // 1. 个人卡片微缩
                  '<div class="mini-profile-card">' +
                    '<div class="mini-avatar"></div>' +
                    '<div class="mini-lines">' +
                      '<span class="mini-line w-80"></span>' +
                      '<span class="mini-line w-60"></span>' +
                      '<span class="mini-line w-40"></span>' +
                    '</div>' +
                  '</div>' +
                  // 2. 消息卡片微缩
                  '<div class="mini-message-card">' +
                    '<div class="mini-msg-avatar"></div>' +
                    '<div class="mini-msg-text"></div>' +
                    '<div class="mini-msg-badge"></div>' +
                  '</div>' +
                  // 3. 底部头像与应用微缩
                  '<div class="mini-couple-section">' +
                    '<div class="mini-icons-grid">' +
                      '<span class="mini-app-icon"></span><span class="mini-app-icon"></span>' +
                      '<span class="mini-app-icon"></span><span class="mini-app-icon"></span>' +
                    '</div>' +
                    '<div class="mini-couple-right">' +
                      '<div class="mini-avatars-row">' +
                        '<span class="mini-cp-avatar"></span>' +
                        '<span class="mini-cp-avatar"></span>' +
                      '</div>' +
                      '<div class="mini-date-card"></div>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
                // 4. 微缩底部 Dock 栏
                '<div class="mini-tab-bar">' +
                  '<span class="mini-tab-dot"></span>' +
                  '<span class="mini-tab-dot"></span>' +
                  '<span class="mini-tab-dot"></span>' +
                  '<span class="mini-tab-dot"></span>' +
                '</div>' +
              '</div>' +
            '</div>' +

            // 右侧控制卡片
            '<div class="beautify-card bg-control-card">' +
              '<div class="beautify-card-header">' +
                '<div class="beautify-card-title">全屏壁纸管理</div>' +
                '<div class="beautify-card-desc">定制手机桌面的主视觉壁纸，支持相册挑选与自由裁剪。</div>' +
              '</div>' +
              '<div class="bg-actions-col">' +
                '<button class="beautify-action-btn" id="bUploadBgBtn" type="button">从相册上传背景</button>' +
                '<button class="beautify-action-btn secondary" id="bClearBgBtn" type="button">恢复纯净背景</button>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="beautify-card">' +
            '<div class="beautify-card-header">' +
              '<div class="beautify-card-title">历史背景记录</div>' +
              '<div class="beautify-card-desc">轻触已上传历史壁纸可立即应用或移除。</div>' +
            '</div>' +
            '<div class="bg-history-grid" id="bgHistoryGrid">' +
              '<div class="bg-history-empty" id="bgHistoryEmpty">暂无历史背景记录</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="beautify-sub-view" id="bSub_ui">' +
          '<div class="beautify-sub-header">' +
            '<button class="beautify-sub-back" data-back="beautify-main" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>返回</button>' +
          '</div>' +
          '<div class="beautify-card">' +
            '<div class="beautify-card-header">' +
              '<div class="beautify-card-title">卡片轮廓质感</div>' +
              '<div class="beautify-card-desc">调节桌面组件卡片的圆角倒角弧度。</div>' +
            '</div>' +
            '<div class="beautify-setting-row">' +
              '<span class="beautify-setting-label">卡片倒角风格</span>' +
              '<div class="beautify-pills-group" id="bCornerGroup">' +
                '<button class="beautify-pill-btn" data-corner="sharp" type="button">直角</button>' +
                '<button class="beautify-pill-btn active" data-corner="standard" type="button">适度</button>' +
                '<button class="beautify-pill-btn" data-corner="soft" type="button">圆润</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="beautify-sub-view" id="bSub_icons">' +
          '<div class="beautify-sub-header">' +
            '<button class="beautify-sub-back" data-back="beautify-main" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>返回</button>' +
          '</div>' +
          '<div class="beautify-card">' +
            '<div class="beautify-card-header">' +
              '<div class="beautify-card-title">图标光效与材质</div>' +
              '<div class="beautify-card-desc">配置桌面与底栏功能图标的视觉光泽。</div>' +
            '</div>' +
            '<div class="icon-style-cards">' +
              '<div class="icon-style-box active" data-istyle="normal">' +
                '<span>标准质感</span>' +
              '</div>' +
              '<div class="icon-style-box" data-istyle="glow">' +
                '<span>微光流影</span>' +
              '</div>' +
              '<div class="icon-style-box" data-istyle="emboss">' +
                '<span>轻微浮雕</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="beautify-sub-view" id="bSub_display">' +
          '<div class="beautify-sub-header">' +
            '<button class="beautify-sub-back" data-back="beautify-main" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>返回</button>' +
          '</div>' +
          '<div class="beautify-card">' +
            '<div class="beautify-card-header">' +
              '<div class="beautify-card-title">外观模式</div>' +
              '<div class="beautify-card-desc">切换界面明亮或极夜深灰色彩。</div>' +
            '</div>' +
            '<div class="theme-switch-grid">' +
              '<div class="theme-box-card light active" data-tmode="light">' +
                '<span>浅色明亮</span>' +
              '</div>' +
              '<div class="theme-box-card dark" data-tmode="dark">' +
                '<span>极夜深灰</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="beautify-card">' +
            '<div class="beautify-card-header">' +
              '<div class="beautify-card-title">舒适度微调</div>' +
              '<div class="beautify-card-desc">降低屏幕亮度与暗度滤镜。</div>' +
            '</div>' +
            '<div class="beautify-setting-row">' +
              '<span class="beautify-setting-label">屏幕暗度</span>' +
              '<div class="beautify-slider-wrap">' +
                '<input type="range" id="bBrightnessSlider" min="30" max="100" value="100">' +
                '<span class="beautify-slider-val" id="bBrightVal">100%</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

      '</div>';

    container.innerHTML = html;
  }

  function bindBeautifyEvents() {
    var mainView = document.getElementById('bMainView');
    var beautifyPage = document.querySelector('.app-page[data-page="beautify"]');
    var customFileInput = document.getElementById('pwaCustomFileInput');
    var bgFileInput = document.getElementById('beautifyBgFileInput');

    window.addEventListener('closeBeautifySub', function() {
      var subs = document.querySelectorAll('.beautify-sub-view');
      for (var s = 0; s < subs.length; s++) {
        subs[s].style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
        subs[s].style.transform = 'translateX(100%)';
      }
      setTimeout(function() {
        for (var k = 0; k < subs.length; k++) {
          subs[k].classList.remove('active');
          subs[k].style.transform = '';
          subs[k].style.transition = '';
        }
      }, 250);

      if (mainView) {
        mainView.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.25s ease';
        mainView.style.transform = 'translateX(0)';
        mainView.style.opacity = '1';
        setTimeout(function() {
          mainView.classList.remove('slide-left');
          mainView.style.transform = '';
          mainView.style.opacity = '';
          mainView.style.transition = '';
        }, 250);
      }
      if (beautifyPage) beautifyPage.classList.remove('in-sub-page');
    });

    var menuItems = document.querySelectorAll('.beautify-menu-item');
    for (var m = 0; m < menuItems.length; m++) {
      menuItems[m].addEventListener('click', function(e) {
        e.stopPropagation();
        var subName = this.getAttribute('data-open-sub');
        var targetSub = document.getElementById('bSub_' + subName);
        if (targetSub && mainView) {
          targetSub.classList.add('active');
          targetSub.style.transform = 'translateX(0)';
          mainView.classList.add('slide-left');
          if (beautifyPage) beautifyPage.classList.add('in-sub-page');
          if (subName === 'pwa_bg') {
            updateLivePreviewAndHistory();
          }
        }
      });
    }

    var pwaItems = document.querySelectorAll('.pwa-icon-item');
    for (var p = 0; p < pwaItems.length; p++) {
      pwaItems[p].addEventListener('click', function(e) {
        e.stopPropagation();
        var val = this.getAttribute('data-pwa-val');
        var name = this.getAttribute('data-pwa-name') || '该图标';

        if (val === 'custom') {
          if (beautifyData.customPwaIconUrl) {
            if (window.PhotoAction) {
              window.PhotoAction.show(function() {
                if (customFileInput) customFileInput.click();
              }, function() {
                beautifyData.customPwaIconUrl = '';
                beautifyData.activePwaIcon = 'heart';
                applyPwaIcon('heart');
                syncBeautifyUI();
                saveBeautifyData();
                if (window.AppNav && window.AppNav.showToast) {
                  window.AppNav.showToast('已清除自定义图标，恢复默认');
                }
              });
            } else {
              if (customFileInput) customFileInput.click();
            }
          } else {
            if (customFileInput) customFileInput.click();
          }
          return;
        }

        if (beautifyData.activePwaIcon === val) {
          if (window.AppNav && window.AppNav.showToast) {
            window.AppNav.showToast('当前已处于「' + name + '」图标');
          }
          return;
        }

        if (window.AppDialog) {
          window.AppDialog.confirm({
            title: '更换桌面图标',
            desc: '是否将「' + name + '」设为桌面主屏幕图标？',
            confirmText: '确认更换',
            isDanger: false
          }, function() {
            for (var x = 0; x < pwaItems.length; x++) { pwaItems[x].classList.remove('active'); }
            this.classList.add('active');
            beautifyData.activePwaIcon = val;
            applyPwaIcon(val);
            saveBeautifyData();
            if (window.AppNav && window.AppNav.showToast) {
              window.AppNav.showToast('图标已更换为「' + name + '」');
            }
          }.bind(this));
        } else {
          for (var y = 0; y < pwaItems.length; y++) { pwaItems[y].classList.remove('active'); }
          this.classList.add('active');
          beautifyData.activePwaIcon = val;
          applyPwaIcon(val);
          saveBeautifyData();
        }
      });
    }

    if (customFileInput) {
      customFileInput.addEventListener('change', function(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(evt) {
          var base64Src = evt.target.result;
          if (window.AppCropper) {
            window.AppCropper.open(base64Src, { aspectRatio: 1 }, function(croppedBase64) {
              uploadPwaIconToServer(croppedBase64);
            });
          }
        };
        reader.readAsDataURL(file);
        customFileInput.value = '';
      });
    }

    var uploadBgBtn = document.getElementById('bUploadBgBtn');
    var clearBgBtn = document.getElementById('bClearBgBtn');

    if (uploadBgBtn && bgFileInput) {
      uploadBgBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        bgFileInput.click();
      });
    }

    if (bgFileInput) {
      bgFileInput.addEventListener('change', function(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(evt) {
          var base64Src = evt.target.result;
          if (window.AppCropper) {
            var screenRatio = window.innerWidth / window.innerHeight;
            window.AppCropper.open(base64Src, { aspectRatio: screenRatio }, function(croppedBase64) {
              applyAndSaveNewBackground(croppedBase64);
            });
          } else {
            applyAndSaveNewBackground(base64Src);
          }
        };
        reader.readAsDataURL(file);
        bgFileInput.value = '';
      });
    }

    if (clearBgBtn) {
      clearBgBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var bgLayer = document.getElementById('homeBgLayer');
        if (bgLayer) bgLayer.style.backgroundImage = '';
        if (window.AppDB) window.AppDB.delete('home_bg_img');
        updateLivePreviewAndHistory();
        if (window.AppNav && window.AppNav.showToast) {
          window.AppNav.showToast('已恢复默认纯净背景');
        }
      });
    }

    var cornerBtns = document.querySelectorAll('#bCornerGroup .beautify-pill-btn');
    for (var c = 0; c < cornerBtns.length; c++) {
      cornerBtns[c].addEventListener('click', function(e) {
        e.stopPropagation();
        for (var cb = 0; cb < cornerBtns.length; cb++) { cornerBtns[cb].classList.remove('active'); }
        this.classList.add('active');
        var style = this.getAttribute('data-corner');
        beautifyData.cornerStyle = style;
        applyCornerStyle(style);
        saveBeautifyData();
      });
    }

    var iconBoxes = document.querySelectorAll('.icon-style-box');
    for (var ib = 0; ib < iconBoxes.length; ib++) {
      iconBoxes[ib].addEventListener('click', function(e) {
        e.stopPropagation();
        for (var ic = 0; ic < iconBoxes.length; ic++) { iconBoxes[ic].classList.remove('active'); }
        this.classList.add('active');
        var style = this.getAttribute('data-istyle');
        beautifyData.iconStyle = style;
        applyIconStyle(style);
        saveBeautifyData();
      });
    }

    var themeBoxes = document.querySelectorAll('.theme-box-card');
    for (var tb = 0; tb < themeBoxes.length; tb++) {
      themeBoxes[tb].addEventListener('click', function(e) {
        e.stopPropagation();
        for (var tc = 0; tc < themeBoxes.length; tc++) { themeBoxes[tc].classList.remove('active'); }
        this.classList.add('active');
        var mode = this.getAttribute('data-tmode');
        beautifyData.themeMode = mode;
        applyThemeMode(mode);
        saveBeautifyData();
      });
    }

    var brightSlider = document.getElementById('bBrightnessSlider');
    var brightVal = document.getElementById('bBrightVal');
    if (brightSlider) {
      brightSlider.addEventListener('input', function(e) {
        e.stopPropagation();
        var val = parseInt(this.value, 10);
        if (brightVal) brightVal.textContent = val + '%';
        beautifyData.brightness = val;
        applyBrightness(val);
        saveBeautifyData();
      });
    }
  }

  function applyAndSaveNewBackground(bgUrl) {
    var bgLayer = document.getElementById('homeBgLayer');
    if (bgLayer) bgLayer.style.backgroundImage = 'url("' + bgUrl + '")';

    if (window.AppDB) {
      window.AppDB.save('home_bg_img', bgUrl);
    }

    if (!Array.isArray(beautifyData.bgHistory)) {
      beautifyData.bgHistory = [];
    }
    var existingIdx = -1;
    for (var i = 0; i < beautifyData.bgHistory.length; i++) {
      if (beautifyData.bgHistory[i] === bgUrl) {
        existingIdx = i;
        break;
      }
    }
    if (existingIdx !== -1) {
      beautifyData.bgHistory.splice(existingIdx, 1);
    }
    beautifyData.bgHistory.unshift(bgUrl);
    if (beautifyData.bgHistory.length > 20) {
      beautifyData.bgHistory.pop();
    }
    saveBeautifyData();
    updateLivePreviewAndHistory();

    if (window.AppNav && window.AppNav.showToast) {
      window.AppNav.showToast('全屏壁纸设定成功');
    }
  }

  function updateLivePreviewAndHistory() {
    var liveImg = document.getElementById('bgLivePreviewImg');
    var bgLayer = document.getElementById('homeBgLayer');
    var currentBg = '';

    if (bgLayer && bgLayer.style.backgroundImage) {
      currentBg = bgLayer.style.backgroundImage;
    }

    if (liveImg) {
      if (currentBg && currentBg !== 'none') {
        liveImg.style.backgroundImage = currentBg;
      } else {
        liveImg.style.backgroundImage = '';
      }
    }

    renderBgHistoryList();
  }

  function renderBgHistoryList() {
    var historyGrid = document.getElementById('bgHistoryGrid');
    if (!historyGrid) return;

    var list = Array.isArray(beautifyData.bgHistory) ? beautifyData.bgHistory : [];
    if (list.length === 0) {
      historyGrid.innerHTML = '<div class="bg-history-empty">暂无历史背景记录</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < list.length; i++) {
      html += '<div class="bg-history-item" data-bg-idx="' + i + '">' +
                '<img src="' + list[i] + '" alt="历史壁纸" loading="lazy">' +
              '</div>';
    }
    historyGrid.innerHTML = html;

    var items = historyGrid.querySelectorAll('.bg-history-item');
    for (var j = 0; j < items.length; j++) {
      items[j].addEventListener('click', function(e) {
        e.stopPropagation();
        var index = parseInt(this.getAttribute('data-bg-idx'), 10);
        var targetBg = beautifyData.bgHistory[index];
        if (!targetBg) return;

        if (window.PhotoAction) {
          window.PhotoAction.show(function() {
            applyAndSaveNewBackground(targetBg);
          }, function() {
            beautifyData.bgHistory.splice(index, 1);
            saveBeautifyData();
            renderBgHistoryList();
            if (window.AppNav && window.AppNav.showToast) {
              window.AppNav.showToast('已从历史记录中移除');
            }
          });
        } else {
          applyAndSaveNewBackground(targetBg);
        }
      });
    }
  }

  function uploadPwaIconToServer(croppedBase64) {
    if (window.AppNav && window.AppNav.showToast) {
      window.AppNav.showToast('正在生成桌面图标...');
    }

    fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        base64Data: croppedBase64,
        forcePNG: true,
        customName: 'pwa_diy_' + Date.now()
      })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.success && data.url) {
        beautifyData.customPwaIconUrl = data.url;
        beautifyData.activePwaIcon = 'custom';
        applyPwaIcon('custom', data.url);
        syncBeautifyUI();
        saveBeautifyData();
        if (window.AppNav && window.AppNav.showToast) {
          window.AppNav.showToast('DIY桌面图标已设定成功');
        }
      } else {
        beautifyData.customPwaIconUrl = croppedBase64;
        beautifyData.activePwaIcon = 'custom';
        applyPwaIcon('custom', croppedBase64);
        syncBeautifyUI();
        saveBeautifyData();
        if (window.AppNav && window.AppNav.showToast) {
          window.AppNav.showToast('DIY图标已本地设定成功');
        }
      }
    })
    .catch(function() {
      beautifyData.customPwaIconUrl = croppedBase64;
      beautifyData.activePwaIcon = 'custom';
      applyPwaIcon('custom', croppedBase64);
      syncBeautifyUI();
      saveBeautifyData();
      if (window.AppNav && window.AppNav.showToast) {
        window.AppNav.showToast('DIY图标已设定成功');
      }
    });
  }

  function applyPwaIcon(type, customUrl) {
    var targetUrl = DEFAULT_HEART_URL;
    if (type === 'icon1') {
      targetUrl = ICON_PATH_1;
    } else if (type === 'icon2') {
      targetUrl = ICON_PATH_2;
    } else if (type === 'custom') {
      targetUrl = customUrl || beautifyData.customPwaIconUrl || DEFAULT_HEART_URL;
    }

    var appleIcon = document.getElementById('appleTouchIcon');
    var appleIconPre = document.getElementById('appleTouchIconPre');
    var favIconPng = document.getElementById('favIconPng');
    var appManifest = document.getElementById('appManifest');

    if (appleIcon) appleIcon.href = targetUrl;
    if (appleIconPre) appleIconPre.href = targetUrl;
    if (favIconPng) favIconPng.href = targetUrl;
    if (appManifest) {
      if (type === 'custom') {
        appManifest.href = '/api/manifest?icon=custom&_t=' + Date.now();
      } else {
        appManifest.href = '/api/manifest?icon=' + type + '&_t=' + Date.now();
      }
    }
  }

  function applyCornerStyle(style) {
    document.body.classList.remove('corner-sharp', 'corner-soft');
    if (style === 'sharp') document.body.classList.add('corner-sharp');
    else if (style === 'soft') document.body.classList.add('corner-soft');
  }

  function applyIconStyle(style) {
    document.body.classList.remove('icon-glow', 'icon-emboss');
    if (style === 'glow') document.body.classList.add('icon-glow');
    else if (style === 'emboss') document.body.classList.add('icon-emboss');
  }

  function applyThemeMode(mode) {
    if (mode === 'dark') {
      document.body.classList.add('theme-dark');
    } else {
      document.body.classList.remove('theme-dark');
    }
  }

  function applyBrightness(val) {
    var tintLayer = document.getElementById('globalTintLayer');
    if (!tintLayer) return;
    if (val >= 100) {
      tintLayer.style.backgroundColor = 'transparent';
    } else {
      var darkAlpha = (100 - val) / 100 * 0.75;
      tintLayer.style.backgroundColor = 'rgba(0, 0, 0, ' + darkAlpha + ')';
    }
  }

  function saveBeautifyData() {
    if (window.AppDB) {
      window.AppDB.save('beautify_settings', beautifyData);
    }
  }

  function loadBeautifyData() {
    if (!window.AppDB) return;
    window.AppDB.get('beautify_settings', function(saved) {
      if (saved) {
        for (var k in saved) {
          if (saved.hasOwnProperty(k)) beautifyData[k] = saved[k];
        }
      }
      syncBeautifyUI();
    });
  }

  function syncBeautifyUI() {
    var customPlaceholder = document.getElementById('pwaCustomPlaceholder');
    var customImg = document.getElementById('pwaCustomImg');
    var customLabel = document.getElementById('pwaCustomLabel');

    if (beautifyData.customPwaIconUrl) {
      if (customPlaceholder) customPlaceholder.style.display = 'none';
      if (customImg) {
        customImg.src = beautifyData.customPwaIconUrl;
        customImg.style.display = 'block';
      }
      if (customLabel) customLabel.textContent = 'DIY自定义';
    } else {
      if (customPlaceholder) customPlaceholder.style.display = 'flex';
      if (customImg) {
        customImg.src = '';
        customImg.style.display = 'none';
      }
      if (customLabel) customLabel.textContent = '自定义';
    }

    var pwaItems = document.querySelectorAll('.pwa-icon-item');
    for (var i = 0; i < pwaItems.length; i++) {
      if (pwaItems[i].getAttribute('data-pwa-val') === beautifyData.activePwaIcon) pwaItems[i].classList.add('active');
      else pwaItems[i].classList.remove('active');
    }
    applyPwaIcon(beautifyData.activePwaIcon, beautifyData.customPwaIconUrl);

    var cornerBtns = document.querySelectorAll('#bCornerGroup .beautify-pill-btn');
    for (var j = 0; j < cornerBtns.length; j++) {
      if (cornerBtns[j].getAttribute('data-corner') === beautifyData.cornerStyle) cornerBtns[j].classList.add('active');
      else cornerBtns[j].classList.remove('active');
    }
    applyCornerStyle(beautifyData.cornerStyle);

    var iconBoxes = document.querySelectorAll('.icon-style-box');
    for (var k = 0; k < iconBoxes.length; k++) {
      if (iconBoxes[k].getAttribute('data-istyle') === beautifyData.iconStyle) iconBoxes[k].classList.add('active');
      else iconBoxes[k].classList.remove('active');
    }
    applyIconStyle(beautifyData.iconStyle);

    var themeBoxes = document.querySelectorAll('.theme-box-card');
    for (var m = 0; m < themeBoxes.length; m++) {
      if (themeBoxes[m].getAttribute('data-tmode') === beautifyData.themeMode) themeBoxes[m].classList.add('active');
      else themeBoxes[m].classList.remove('active');
    }
    applyThemeMode(beautifyData.themeMode);

    var brightSlider = document.getElementById('bBrightnessSlider');
    var brightVal = document.getElementById('bBrightVal');
    if (brightSlider) brightSlider.value = beautifyData.brightness;
    if (brightVal) brightVal.textContent = beautifyData.brightness + '%';
    applyBrightness(beautifyData.brightness);

    updateLivePreviewAndHistory();
  }

  window.addEventListener('pageChange', function(e) {
    if (e.detail && e.detail.page === 'beautify') {
      initBeautifyApp();
    }
  });

  if (window._dbReady) {
    initBeautifyApp();
  } else {
    window.addEventListener('dbReady', initBeautifyApp, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBeautifyApp);
  } else {
    setTimeout(initBeautifyApp, 50);
  }

})();

