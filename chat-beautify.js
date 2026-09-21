
(function () {
  'use strict';

  function esc(str) {
    return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
  }

  function getBeautifyCfg(charId) {
    var defaultCfg = {
      chatBg: '',
      bubbleOpacity: 1,
      fontSize: 15
    };
    try {
      var saved = localStorage.getItem('wx_char_beautify_' + charId);
      if (saved) return Object.assign({}, defaultCfg, JSON.parse(saved));
    } catch(e) {}
    return defaultCfg;
  }

  function saveBeautifyCfg(charId, cfg) {
    try {
      localStorage.setItem('wx_char_beautify_' + charId, JSON.stringify(cfg));
    } catch(e) {}
    if (window.AppDB) window.AppDB.save('wx_char_beautify_' + charId, cfg);
  }

  function ensureBeautifyMask(currentChar) {
    var existing = document.getElementById('wxCrBeautifyModalMask');
    if (existing) return existing;

    var mask = document.createElement('div');
    mask.className = 'wx-cr-beautify-mask';
    mask.id = 'wxCrBeautifyModalMask';

    mask.innerHTML = '<div class="wx-cr-beautify-card" id="wxCrBeautifyCard">'
      + '  <div class="sanctuary-header-luxury">'
      + '    <div class="header-main-action-row">'
      + '      <div class="header-left-spacer"></div>'
      + '      <div class="header-center-art-col">'
      + '        <span class="art-script-motto">Atelier</span>'
      + '        <div class="art-title-chinese"><span class="star-dot">✦</span>' + esc(currentChar.name || '角色') + ' · 美化中枢<span class="star-dot">✦</span></div>'
      + '      </div>'
      + '      <button class="header-pure-close" id="wxCrBtfCloseBtn" type="button" title="关闭"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>'
      + '    </div>'
      + '    <div class="header-bottom-ruler-deck"><span class="ruler-line"></span><span class="ruler-center-tag">✦ VISUAL STUDIO ✦</span><span class="ruler-line"></span></div>'
      + '  </div>'
      + '  <div class="wx-cr-btf-body" id="wxCrBtfBody"></div>'
      + '  <div class="sanctuary-bottom-deck"></div>'
      + '</div>';

    document.body.appendChild(mask);
    return mask;
  }

  function renderBeautifyDOM(mask, currentChar) {
    var setBody = mask.querySelector('#wxCrBtfBody');
    if (!setBody) return;

    var cfg = getBeautifyCfg(currentChar.id);
    var bgPreviewStyle = cfg.chatBg ? ('background-image: url(\'' + cfg.chatBg + '\');') : '';

    setBody.innerHTML = ''
      // 01. 聊天背景壁纸
      + '<div class="btf-card">'
      + '  <div class="btf-head-row">'
      + '    <div class="btf-title-group"><span class="btf-sec-roman">§ 01</span><span class="btf-sec-title">专属壁纸</span></div>'
      + '    <span class="btf-sec-en">Wallpaper</span>'
      + '  </div>'
      + '  <div class="btf-preview-box" id="btfBgPreview" style="' + bgPreviewStyle + '">'
      + (cfg.chatBg ? '' : '<span class="btf-preview-tip">+ 点击上传专属聊天背景</span>')
      + '  </div>'
      + '  <div class="btf-btn-row">'
      + '    <button class="btf-btn" id="btnUploadChatBg" type="button">更换背景</button>'
      + '    <button class="btf-btn" id="btnResetChatBg" type="button">恢复默认</button>'
      + '  </div>'
      + '</div>'

      // 02. 对话气泡微调
      + '<div class="btf-card">'
      + '  <div class="btf-head-row">'
      + '    <div class="btf-title-group"><span class="btf-sec-roman">§ 02</span><span class="btf-sec-title">气泡排版</span></div>'
      + '    <span class="btf-sec-en">Bubble Style</span>'
      + '  </div>'
      + '  <div class="metric-gauge-box">'
      + '    <div class="gauge-head"><span class="gauge-title">字号大小</span><span class="gauge-val-tag" id="txtBtfFontSize">' + (cfg.fontSize || 15) + 'px</span></div>'
      + '    <div class="gauge-slider-deck"><span class="gauge-bound">12px</span><input class="gothic-range" id="cfgBtfFontSize" type="range" min="12" max="20" step="1" value="' + (cfg.fontSize || 15) + '"><span class="gauge-bound">20px</span></div>'
      + '  </div>'
      + '  <div class="metric-gauge-box">'
      + '    <div class="gauge-head"><span class="gauge-title">气泡透明度</span><span class="gauge-val-tag" id="txtBtfOpacity">' + Math.round((cfg.bubbleOpacity || 1) * 100) + '%</span></div>'
      + '    <div class="gauge-slider-deck"><span class="gauge-bound">40%</span><input class="gothic-range" id="cfgBtfOpacity" type="range" min="0.4" max="1" step="0.05" value="' + (cfg.bubbleOpacity || 1) + '"><span class="gauge-bound">100%</span></div>'
      + '  </div>'
      + '</div>'
      + '<div class="settings-bottom-spacer"></div>';
  }

    function applyBeautify(stage, currentChar) {
    if (!stage || !currentChar) return;
    var cfg = getBeautifyCfg(currentChar.id);

    if (cfg.chatBg) {
      stage.style.backgroundImage = 'url(\'' + cfg.chatBg + '\')';
      stage.style.backgroundSize = 'cover';
      stage.style.backgroundPosition = 'center';
    } else {
      stage.style.backgroundImage = 'none';
      stage.style.backgroundColor = '#ffffff';
    }

    stage.querySelectorAll('.wx-msg-bubble-item').forEach(function(b) {
      if (b.classList.contains('is-sticker-bubble')) return;
      b.style.fontSize = (cfg.fontSize || 15) + 'px';
      if (!b.closest('.user-side')) {
        b.style.opacity = (cfg.bubbleOpacity !== undefined ? cfg.bubbleOpacity : 1);
      }
    });
  }

  function bindBeautifyEvents(mask, stage, currentChar) {
    var cfg = getBeautifyCfg(currentChar.id);

    function closeBeautify() {
      mask.classList.remove('show');
    }

    var closeBtn = mask.querySelector('#wxCrBtfCloseBtn');
    if (closeBtn) closeBtn.onclick = closeBeautify;
    mask.onclick = function(e) {
      if (e.target === mask) closeBeautify();
    };

    var uploadBtn = mask.querySelector('#btnUploadChatBg');
    var previewBox = mask.querySelector('#btfBgPreview');
    var resetBtn = mask.querySelector('#btnResetChatBg');

    function pickAndSetBg() {
      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.cssText = 'position:fixed;left:-9999px;opacity:0;';
      document.body.appendChild(fileInput);

      fileInput.onchange = function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(evt) {
          if (window.AppCropper) {
            window.AppCropper.open(evt.target.result, { aspectRatio: window.innerWidth / window.innerHeight }, function(cropped) {
              cfg.chatBg = cropped;
              saveBeautifyCfg(currentChar.id, cfg);
              renderBeautifyDOM(mask, currentChar);
              applyBeautify(stage, currentChar);
              if (window.AppNav) window.AppNav.showToast('专属背景已生效');
            });
          } else {
            cfg.chatBg = evt.target.result;
            saveBeautifyCfg(currentChar.id, cfg);
            renderBeautifyDOM(mask, currentChar);
            applyBeautify(stage, currentChar);
            if (window.AppNav) window.AppNav.showToast('专属背景已生效');
          }
        };
        reader.readAsDataURL(file);
        if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
      };
      fileInput.click();
    }

    if (uploadBtn) uploadBtn.onclick = pickAndSetBg;
    if (previewBox) previewBox.onclick = pickAndSetBg;

    if (resetBtn) {
      resetBtn.onclick = function() {
        cfg.chatBg = '';
        saveBeautifyCfg(currentChar.id, cfg);
        renderBeautifyDOM(mask, currentChar);
        applyBeautify(stage, currentChar);
        if (window.AppNav) window.AppNav.showToast('已恢复默认纯白背景');
      };
    }

    var fontInput = mask.querySelector('#cfgBtfFontSize');
    var opacityInput = mask.querySelector('#cfgBtfOpacity');

    if (fontInput) {
      fontInput.oninput = function() {
        cfg.fontSize = parseInt(this.value, 10) || 15;
        var txt = mask.querySelector('#txtBtfFontSize');
        if (txt) txt.textContent = cfg.fontSize + 'px';
        saveBeautifyCfg(currentChar.id, cfg);
        applyBeautify(stage, currentChar);
      };
    }

    if (opacityInput) {
      opacityInput.oninput = function() {
        cfg.bubbleOpacity = parseFloat(this.value) || 1;
        var txt = mask.querySelector('#txtBtfOpacity');
        if (txt) txt.textContent = Math.round(cfg.bubbleOpacity * 100) + '%';
        saveBeautifyCfg(currentChar.id, cfg);
        applyBeautify(stage, currentChar);
      };
    }
  }

  function openBeautifyStudio(stage, currentChar) {
    if (!currentChar) return;
    var mask = ensureBeautifyMask(currentChar);
    renderBeautifyDOM(mask, currentChar);
    bindBeautifyEvents(mask, stage, currentChar);
    mask.classList.add('show');
  }

  window.WxChatBeautify = {
    open: openBeautifyStudio,
    getCfg: getBeautifyCfg,
    saveCfg: saveBeautifyCfg,
    apply: applyBeautify
  };

})();
