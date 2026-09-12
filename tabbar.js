
(function(){
  'use strict';

  var tabBar = document.querySelector('.tab-bar');
  var tabbarPopup = null;
  var tabbarPopupMask = null;
  var isPopupCreated = false;

  function initTabbarModule() {
    var tabbarEditBtn = document.querySelector('[data-edit-target="tabbar"]');
    if (tabbarEditBtn) {
      tabbarEditBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        showTabbarPopup();
      };
    }
    loadTabbarState();
  }

  if (window._dbReady) {
    initTabbarModule();
  } else {
    window.addEventListener('dbReady', initTabbarModule);
    setTimeout(initTabbarModule, 300);
  }

  function showTabbarPopup() {
    if (!isPopupCreated) {
      tabbarPopupMask = document.createElement('div');
      tabbarPopupMask.className = 'popup-mask';
      document.body.appendChild(tabbarPopupMask);
      tabbarPopupMask.addEventListener('click', hideTabbarPopup);

      tabbarPopup = document.createElement('div');
      tabbarPopup.className = 'popup-card';
      tabbarPopup.innerHTML = '<div class="popup-card-title">底部栏设置</div>'
        + '<div class="popup-card-row"><span>毛玻璃</span>'
        + '<div class="toggle-switch"><input type="checkbox" id="tabbarGlassToggle" checked><label for="tabbarGlassToggle"></label></div></div>'
        + '<div class="popup-card-row"><span>背景颜色</span>'
        + '<input type="color" id="tabbarBgColor" value="#ffffff"></div>'
        + '<div class="popup-card-row"><span>透明度</span>'
        + '<input type="range" id="tabbarOpacitySlider" min="0" max="100" value="92">'
        + '<span class="popup-card-value" id="tabbarOpacityValue">92%</span></div>'
        + '<div class="popup-card-row"><span>边框颜色</span>'
        + '<input type="color" id="tabbarBorderColor" value="#8e8e93"></div>'
        + '<div class="popup-card-row"><span>边框粗细</span>'
        + '<input type="range" id="tabbarBorderWidth" min="0" max="3" step="0.5" value="1">'
        + '<span class="popup-card-value" id="tabbarBorderValue">1px</span></div>';
      document.body.appendChild(tabbarPopup);

      document.getElementById('tabbarGlassToggle').addEventListener('change', applyFromControls);
      document.getElementById('tabbarBgColor').addEventListener('input', applyFromControls);
      document.getElementById('tabbarOpacitySlider').addEventListener('input', applyFromControls);
      document.getElementById('tabbarBorderColor').addEventListener('input', applyFromControls);
      document.getElementById('tabbarBorderWidth').addEventListener('input', applyFromControls);

      isPopupCreated = true;
    }

    loadTabbarControls();
    positionTabbarPopup();
    tabbarPopupMask.classList.add('show');
    tabbarPopup.classList.add('show');
  }

  function hideTabbarPopup() {
    if (tabbarPopup) tabbarPopup.classList.remove('show');
    if (tabbarPopupMask) tabbarPopupMask.classList.remove('show');
    saveTabbarState();
  }

  // 严格安全边界定位算法，杜绝飞出屏幕
  function positionTabbarPopup() {
    if (!tabbarPopup) return;
    var targetEl = tabBar || document.querySelector('.tab-bar');
    if (!targetEl) return;

    var barRect = targetEl.getBoundingClientRect();
    var windowW = window.innerWidth;
    var windowH = window.innerHeight;

    tabbarPopup.style.visibility = 'hidden';
    tabbarPopup.style.display = 'flex';
    var popupW = tabbarPopup.offsetWidth || 240;
    var popupH = tabbarPopup.offsetHeight || 260;
    tabbarPopup.style.visibility = '';
    tabbarPopup.style.display = '';

    var left = barRect.left + barRect.width / 2 - popupW / 2;
    if (left < 16) left = 16;
    if (left + popupW > windowW - 16) left = windowW - popupW - 16;

    // 默认在底部栏上方弹出
    var top = barRect.top - popupH - 12;

    // 如果上方空间不够，锁定在屏幕可见区域内
    if (top < 20) {
      top = 20;
    }
    if (top + popupH > windowH - 20) {
      top = windowH - popupH - 20;
    }

    tabbarPopup.style.left = Math.round(left) + 'px';
    tabbarPopup.style.top = Math.round(top) + 'px';
  }

  function applyFromControls() {
    var glassToggle = document.getElementById('tabbarGlassToggle');
    var bgColor = document.getElementById('tabbarBgColor');
    var opacitySlider = document.getElementById('tabbarOpacitySlider');
    var opacityValue = document.getElementById('tabbarOpacityValue');
    var borderColor = document.getElementById('tabbarBorderColor');
    var borderWidth = document.getElementById('tabbarBorderWidth');
    var borderValue = document.getElementById('tabbarBorderValue');

    if (!glassToggle || !bgColor || !opacitySlider) return;

    if (opacityValue) opacityValue.textContent = opacitySlider.value + '%';
    if (borderValue) borderValue.textContent = borderWidth.value + 'px';

    applyTabbarStyle(
      glassToggle.checked,
      bgColor.value,
      opacitySlider.value / 100,
      borderColor.value,
      borderWidth.value
    );
    saveTabbarState();
  }

  function applyTabbarStyle(glass, bgColor, opacity, borderColor, borderWidth) {
    var capsule = document.querySelector('.tab-bar-capsule');
    if (!capsule) return;

    var r = parseInt(bgColor.slice(1,3), 16) || 255;
    var g = parseInt(bgColor.slice(3,5), 16) || 255;
    var b = parseInt(bgColor.slice(5,7), 16) || 255;

    capsule.style.backgroundColor = 'rgba(' + r + ',' + g + ',' + b + ',' + opacity + ')';
    capsule.style.borderColor = borderColor || '#8e8e93';
    capsule.style.borderWidth = (borderWidth !== undefined ? borderWidth : 1) + 'px';
    capsule.style.borderStyle = 'solid';

    if (glass) {
      capsule.style.backdropFilter = 'saturate(180%) blur(20px)';
      capsule.style.webkitBackdropFilter = 'saturate(180%) blur(20px)';
    } else {
      capsule.style.backdropFilter = 'none';
      capsule.style.webkitBackdropFilter = 'none';
    }
  }

  function saveTabbarState() {
    var glassToggle = document.getElementById('tabbarGlassToggle');
    var bgColor = document.getElementById('tabbarBgColor');
    var opacitySlider = document.getElementById('tabbarOpacitySlider');
    var borderColor = document.getElementById('tabbarBorderColor');
    var borderWidth = document.getElementById('tabbarBorderWidth');

    if (!glassToggle) return;

    var state = {
      glass: glassToggle.checked,
      bgColor: bgColor ? bgColor.value : '#ffffff',
      opacity: opacitySlider ? opacitySlider.value : 92,
      borderColor: borderColor ? borderColor.value : '#8e8e93',
      borderWidth: borderWidth ? borderWidth.value : '1'
    };
    if (window.AppDB) AppDB.save('tabbar_state', state);
  }

  function loadTabbarControls() {
    if (!window.AppDB) return;
    AppDB.get('tabbar_state', function(state) {
      if (!state) return;
      var glassToggle = document.getElementById('tabbarGlassToggle');
      var bgColor = document.getElementById('tabbarBgColor');
      var opacitySlider = document.getElementById('tabbarOpacitySlider');
      var opacityValue = document.getElementById('tabbarOpacityValue');
      var borderColor = document.getElementById('tabbarBorderColor');
      var borderWidth = document.getElementById('tabbarBorderWidth');
      var borderValue = document.getElementById('tabbarBorderValue');

      if (glassToggle) glassToggle.checked = !!state.glass;
      if (bgColor) bgColor.value = state.bgColor || '#ffffff';
      if (opacitySlider) opacitySlider.value = state.opacity !== undefined ? state.opacity : 92;
      if (opacityValue) opacityValue.textContent = (state.opacity !== undefined ? state.opacity : 92) + '%';
      if (borderColor) borderColor.value = state.borderColor || '#8e8e93';
      if (borderWidth) borderWidth.value = state.borderWidth !== undefined ? state.borderWidth : 1;
      if (borderValue) borderValue.textContent = (state.borderWidth !== undefined ? state.borderWidth : 1) + 'px';
    });
  }

  function loadTabbarState() {
    if (!window.AppDB) return;
    AppDB.get('tabbar_state', function(state) {
      if (!state) return;
      applyTabbarStyle(
        state.glass,
        state.bgColor || '#ffffff',
        (state.opacity !== undefined ? state.opacity : 92) / 100,
        state.borderColor || '#8e8e93',
        state.borderWidth !== undefined ? state.borderWidth : '1'
      );
    });
  }

})();
