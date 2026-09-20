
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

  function renderBeautifyDOM(stage, currentChar) {
    var setBody = stage.querySelector('#wxCrBtfBody');
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
    var cfg = getBeautifyCfg(currentChar.id);
    var chatBody = stage.querySelector('#wxCrBody');
    if (!chatBody) return;

    if (cfg.chatBg) {
      chatBody.style.backgroundImage = 'url(\'' + cfg.chatBg + '\')';
      chatBody.style.backgroundSize = 'cover';
      chatBody.style.backgroundPosition = 'center';
    } else {
      chatBody.style.backgroundImage = 'none';
    }

    stage.querySelectorAll('.wx-msg-bubble-item').forEach(function(b) {
      if (b.classList.contains('is-sticker-bubble')) return;
      b.style.fontSize = (cfg.fontSize || 15) + 'px';
      if (!b.closest('.user-side')) {
        b.style.background = 'rgba(255, 255, 255, ' + (cfg.bubbleOpacity || 1) + ')';
      }
    });
  }

  function bindBeautifyEvents(stage, currentChar) {
    var cfg = getBeautifyCfg(currentChar.id);

    var uploadBtn = stage.querySelector('#btnUploadChatBg');
    var previewBox = stage.querySelector('#btfBgPreview');
    var resetBtn = stage.querySelector('#btnResetChatBg');

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
              renderBeautifyDOM(stage, currentChar);
              applyBeautify(stage, currentChar);
              if (window.AppNav) window.AppNav.showToast('专属背景已生效');
            });
          } else {
            cfg.chatBg = evt.target.result;
            saveBeautifyCfg(currentChar.id, cfg);
            renderBeautifyDOM(stage, currentChar);
            applyBeautify(stage, currentChar);
            if (window.AppNav) window.AppNav.showToast('专属背景已生效');
          }
        };
        reader.readAsDataURL(file);
        if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
      };
      fileInput.click();
    }

    if (uploadBtn) uploadBtn.addEventListener('click', pickAndSetBg);
    if (previewBox) previewBox.addEventListener('click', pickAndSetBg);

    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        cfg.chatBg = '';
        saveBeautifyCfg(currentChar.id, cfg);
        renderBeautifyDOM(stage, currentChar);
        applyBeautify(stage, currentChar);
        if (window.AppNav) window.AppNav.showToast('已恢复默认纯白背景');
      });
    }

    var fontInput = stage.querySelector('#cfgBtfFontSize');
    var opacityInput = stage.querySelector('#cfgBtfOpacity');

    if (fontInput) {
      fontInput.addEventListener('input', function() {
        cfg.fontSize = parseInt(this.value, 10) || 15;
        var txt = stage.querySelector('#txtBtfFontSize');
        if (txt) txt.textContent = cfg.fontSize + 'px';
        saveBeautifyCfg(currentChar.id, cfg);
        applyBeautify(stage, currentChar);
      });
    }

    if (opacityInput) {
      opacityInput.addEventListener('input', function() {
        cfg.bubbleOpacity = parseFloat(this.value) || 1;
        var txt = stage.querySelector('#txtBtfOpacity');
        if (txt) txt.textContent = Math.round(cfg.bubbleOpacity * 100) + '%';
        saveBeautifyCfg(currentChar.id, cfg);
        applyBeautify(stage, currentChar);
      });
    }
  }

  window.WxChatBeautify = {
    getCfg: getBeautifyCfg,
    saveCfg: saveBeautifyCfg,
    render: renderBeautifyDOM,
    apply: applyBeautify,
    bind: bindBeautifyEvents
  };

})();
