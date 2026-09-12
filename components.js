
(function(){
  'use strict';

  var hasInit = false;

  function initAllComponents() {
    if (hasInit) return;
    hasInit = true;
    setupHomeBg();
    setupCard();
    setupMessage();
    setupCoupleStyle();
  }

  // 多重安全时序启动：确保在任何情况下都会立即初始化桌面所有组件
  if (window._dbReady) {
    initAllComponents();
  } else {
    window.addEventListener('dbReady', initAllComponents);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(initAllComponents, 50);
    });
  } else {
    setTimeout(initAllComponents, 50);
  }

  function bindPlainTextPaste(el) {
    if (!el) return;
    el.addEventListener('paste', function(e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
      document.execCommand('insertText', false, text);
    });
  }

  // ============ 全局全屏壁纸模块 ============
  function setupHomeBg() {
    var bgLayer = document.getElementById('homeBgLayer');
    var addBgBtn = document.getElementById('addHomeBgBtn');
    
    var bgFileInput = document.getElementById('homeBgHiddenInput');
    if (!bgFileInput) {
      bgFileInput = document.createElement('input');
      bgFileInput.id = 'homeBgHiddenInput';
      bgFileInput.type = 'file'; 
      bgFileInput.accept = 'image/*';
      bgFileInput.style.display = 'none';
      document.body.appendChild(bgFileInput);
    }

    if (addBgBtn) {
      addBgBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.PhotoAction) {
          window.PhotoAction.show(
            function() { bgFileInput.click(); },
            function() {
              if (bgLayer) bgLayer.style.backgroundImage = '';
              if (window.AppDB) window.AppDB.delete('home_bg_img');
            }
          );
        } else {
          bgFileInput.click();
        }
      });
    }

    bgFileInput.addEventListener('change', function() {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        if (window.AppCropper) {
          window.AppCropper.open(e.target.result, { aspectRatio: 9/16 }, function(croppedData) {
            if (bgLayer) bgLayer.style.backgroundImage = 'url(' + croppedData + ')';
            if (window.AppDB) window.AppDB.save('home_bg_img', croppedData);
          });
        } else {
          if (bgLayer) bgLayer.style.backgroundImage = 'url(' + e.target.result + ')';
          if (window.AppDB) window.AppDB.save('home_bg_img', e.target.result);
        }
      };
      reader.readAsDataURL(file);
      this.value = '';
    });

    if (window.AppDB) {
      window.AppDB.get('home_bg_img', function(bgData) {
        if (bgData && bgLayer) {
          bgLayer.style.backgroundImage = 'url(' + bgData + ')';
        }
      });
    }
  }

  // ============ 通用智能弹窗定位函数 ============
  function positionSmartPopup(popupEl, targetEl) {
    if (!popupEl || !targetEl) return;
    var targetRect = targetEl.getBoundingClientRect();
    var windowW = window.innerWidth;
    var windowH = window.innerHeight;

    popupEl.style.visibility = 'hidden';
    popupEl.style.display = 'flex';
    var popupW = popupEl.offsetWidth || 240;
    var popupH = popupEl.offsetHeight || 260;
    popupEl.style.visibility = '';
    popupEl.style.display = '';

    var left = targetRect.left + targetRect.width / 2 - popupW / 2;
    if (left < 16) left = 16;
    if (left + popupW > windowW - 16) left = windowW - popupW - 16;

    var spaceAbove = targetRect.top;
    var spaceBelow = windowH - targetRect.bottom;

    var top = 0;
    if (spaceAbove >= popupH + 12 || spaceAbove > spaceBelow) {
      top = targetRect.top - popupH - 10;
    } else {
      top = targetRect.bottom + 10;
    }

    var minTop = 20;
    var maxTop = windowH - popupH - 20;
    if (top < minTop) top = minTop;
    if (top > maxTop) top = maxTop;

    popupEl.style.left = Math.round(left) + 'px';
    popupEl.style.top = Math.round(top) + 'px';
  }

  // ============ 个人卡片模块 ============
  function setupCard() {
    var cardBg = document.getElementById('cardBg');
    var cardUpper = document.getElementById('cardUpper');
    var avatarBtn = document.getElementById('avatarBtn');
    var avatarImg = document.getElementById('avatarImg');
    var lowerOverlay = document.getElementById('lowerOverlay');
    var infoTexts = document.querySelectorAll('.info-text[data-key]');
    var locationText = document.querySelector('.location-text');

    var bgFileInput = document.getElementById('cardBgInput');
    if (!bgFileInput) {
      bgFileInput = document.createElement('input');
      bgFileInput.id = 'cardBgInput';
      bgFileInput.type = 'file'; 
      bgFileInput.accept = 'image/*';
      bgFileInput.style.display = 'none';
      document.body.appendChild(bgFileInput);
    }

    var avatarFileInput = document.getElementById('cardAvatarInput');
    if (!avatarFileInput) {
      avatarFileInput = document.createElement('input');
      avatarFileInput.id = 'cardAvatarInput';
      avatarFileInput.type = 'file'; 
      avatarFileInput.accept = 'image/*';
      avatarFileInput.style.display = 'none';
      document.body.appendChild(avatarFileInput);
    }

    var cardState = {
      texts: { line1: '', line2: '', line3: '', line4text: '' },
      style: { glass: false, color: '#ffffff', opacity: 80 }
    };

    if (cardUpper) {
      cardUpper.addEventListener('click', function(e) {
        e.stopPropagation();
        if (cardBg && cardBg.classList.contains('has-bg') && window.PhotoAction) {
          window.PhotoAction.show(
            function() { bgFileInput.click(); },
            function() {
              if (cardBg) {
                cardBg.style.backgroundImage = '';
                cardBg.classList.remove('has-bg');
              }
              if (window.AppDB) window.AppDB.delete('card_bg');
            }
          );
        } else {
          bgFileInput.click();
        }
      });
    }

    if (avatarBtn) {
      avatarBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (avatarBtn.classList.contains('has-img') && window.PhotoAction) {
          window.PhotoAction.show(
            function() { avatarFileInput.click(); },
            function() {
              if (avatarImg) avatarImg.src = '';
              avatarBtn.classList.remove('has-img');
              if (window.AppDB) window.AppDB.delete('card_avatar');
            }
          );
        } else {
          avatarFileInput.click();
        }
      });
    }

    bgFileInput.addEventListener('change', function() {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        if (window.AppCropper) {
          window.AppCropper.open(e.target.result, { aspectRatio: 16/11 }, function(croppedData) {
            if (cardBg) {
              cardBg.style.backgroundImage = 'url(' + croppedData + ')';
              cardBg.classList.add('has-bg');
            }
            if (window.AppDB) window.AppDB.save('card_bg', croppedData);
          });
        } else {
          if (cardBg) {
            cardBg.style.backgroundImage = 'url(' + e.target.result + ')';
            cardBg.classList.add('has-bg');
          }
          if (window.AppDB) window.AppDB.save('card_bg', e.target.result);
        }
      };
      reader.readAsDataURL(file);
      this.value = '';
    });

    avatarFileInput.addEventListener('change', function() {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        if (window.AppCropper) {
          window.AppCropper.open(e.target.result, { aspectRatio: 1 }, function(croppedData) {
            if (avatarImg) avatarImg.src = croppedData;
            if (avatarBtn) avatarBtn.classList.add('has-img');
            if (window.AppDB) window.AppDB.save('card_avatar', croppedData);
          });
        } else {
          if (avatarImg) avatarImg.src = e.target.result;
          if (avatarBtn) avatarBtn.classList.add('has-img');
          if (window.AppDB) window.AppDB.save('card_avatar', e.target.result);
        }
      };
      reader.readAsDataURL(file);
      this.value = '';
    });

    infoTexts.forEach(function(el) {
      bindPlainTextPaste(el);
      var key = el.dataset.key;
      el.addEventListener('input', function() {
        cardState.texts[key] = this.textContent.trim();
        if (window.AppDB) window.AppDB.save('card_state', cardState);
      });
      el.addEventListener('blur', function() {
        cardState.texts[key] = this.textContent.trim();
        if (window.AppDB) window.AppDB.save('card_state', cardState);
      });
    });

    if (locationText) {
      bindPlainTextPaste(locationText);
      locationText.addEventListener('input', function() {
        cardState.texts.line4text = this.textContent.trim();
        if (window.AppDB) window.AppDB.save('card_state', cardState);
      });
      locationText.addEventListener('blur', function() {
        cardState.texts.line4text = this.textContent.trim();
        if (window.AppDB) window.AppDB.save('card_state', cardState);
      });
    }

    var cardEditBtn = document.querySelector('[data-edit-target="card"]');
    var cardPopup = null;
    var cardPopupMask = null;
    var cardPopupCreated = false;

    if (cardEditBtn) {
      cardEditBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        showCardPopup();
      });
    }

    function showCardPopup() {
      if (!cardPopupCreated) {
        cardPopupMask = document.createElement('div');
        cardPopupMask.className = 'popup-mask';
        document.body.appendChild(cardPopupMask);
        cardPopupMask.addEventListener('click', hideCardPopup);

        cardPopup = document.createElement('div');
        cardPopup.className = 'popup-card';
        cardPopup.innerHTML = '<div class="popup-card-title">卡片设置</div>'
          + '<div class="popup-card-row"><span>毛玻璃</span>'
          + '<div class="toggle-switch"><input type="checkbox" id="cardGlassToggle"><label for="cardGlassToggle"></label></div></div>'
          + '<div class="popup-card-row"><span>背景颜色</span>'
          + '<input type="color" id="cardColorPicker" value="#ffffff"></div>'
          + '<div class="popup-card-row"><span>透明度</span>'
          + '<input type="range" id="cardOpacitySlider" min="0" max="100" value="80">'
          + '<span class="popup-card-value" id="cardOpacityValue">80%</span></div>';
        document.body.appendChild(cardPopup);

        document.getElementById('cardGlassToggle').addEventListener('change', applyCardStyleFromControls);
        document.getElementById('cardColorPicker').addEventListener('input', applyCardStyleFromControls);
        document.getElementById('cardOpacitySlider').addEventListener('input', applyCardStyleFromControls);

        cardPopupCreated = true;
      }

      loadControlsFromState();
      positionSmartPopup(cardPopup, document.getElementById('profileCard'));
      cardPopupMask.classList.add('show');
      cardPopup.classList.add('show');
    }

    function hideCardPopup() {
      if (cardPopup) cardPopup.classList.remove('show');
      if (cardPopupMask) cardPopupMask.classList.remove('show');
    }

    function loadControlsFromState() {
      var glassToggle = document.getElementById('cardGlassToggle');
      var colorPicker = document.getElementById('cardColorPicker');
      var opacitySlider = document.getElementById('cardOpacitySlider');
      var opacityValue = document.getElementById('cardOpacityValue');
      if (glassToggle) glassToggle.checked = !!cardState.style.glass;
      if (colorPicker) colorPicker.value = cardState.style.color || '#ffffff';
      if (opacitySlider) opacitySlider.value = (cardState.style.opacity !== undefined) ? cardState.style.opacity : 80;
      if (opacityValue) opacityValue.textContent = (cardState.style.opacity !== undefined ? cardState.style.opacity : 80) + '%';
    }

    function applyCardStyleFromControls() {
      var colorPicker = document.getElementById('cardColorPicker');
      var opacitySlider = document.getElementById('cardOpacitySlider');
      var glassToggle = document.getElementById('cardGlassToggle');
      var opacityValue = document.getElementById('cardOpacityValue');
      if (!colorPicker || !opacitySlider || !glassToggle) return;

      cardState.style.glass = glassToggle.checked;
      cardState.style.color = colorPicker.value;
      cardState.style.opacity = parseInt(opacitySlider.value, 10);

      if (opacityValue) opacityValue.textContent = opacitySlider.value + '%';
      renderCardOverlay(cardState.style);
      if (window.AppDB) window.AppDB.save('card_state', cardState);
    }

    function renderCardOverlay(style) {
      if (!lowerOverlay || !style) return;
      var color = style.color || '#ffffff';
      var opacity = (style.opacity !== undefined ? style.opacity : 80) / 100;
      var r = parseInt(color.slice(1,3), 16) || 255;
      var g = parseInt(color.slice(3,5), 16) || 255;
      var b = parseInt(color.slice(5,7), 16) || 255;
      lowerOverlay.style.backgroundColor = 'rgba(' + r + ',' + g + ',' + b + ',' + opacity + ')';
      if (style.glass) lowerOverlay.classList.add('glass-effect');
      else lowerOverlay.classList.remove('glass-effect');
    }

    function loadCardState() {
      if (!window.AppDB) return;
      window.AppDB.get('card_bg', function(bgData) {
        if (bgData && cardBg) {
          cardBg.style.backgroundImage = 'url(' + bgData + ')';
          cardBg.classList.add('has-bg');
        }
      });
      window.AppDB.get('card_avatar', function(avatarData) {
        if (avatarData && avatarImg && avatarBtn) {
          avatarImg.src = avatarData;
          avatarBtn.classList.add('has-img');
        }
      });
      window.AppDB.get('card_state', function(saved) {
        if (saved) {
          if (saved.texts) {
            Object.keys(saved.texts).forEach(function(key) {
              cardState.texts[key] = saved.texts[key];
              if (key === 'line4text') {
                if (locationText) locationText.textContent = saved.texts[key];
              } else {
                var el = document.querySelector('[data-key="' + key + '"]');
                if (el) el.textContent = saved.texts[key];
              }
            });
          }
          if (saved.style) {
            cardState.style.glass = !!saved.style.glass;
            cardState.style.color = saved.style.color || '#ffffff';
            cardState.style.opacity = saved.style.opacity !== undefined ? saved.style.opacity : 80;
          }
        }
        renderCardOverlay(cardState.style);
      });
    }

    loadCardState();
  }

  // ============ 消息框模块 ============
  function setupMessage() {
    var messageAvatar = document.getElementById('messageAvatar');
    var messageAvatarImg = document.getElementById('messageAvatarImg');
    var messagePreview = document.getElementById('messagePreview');
    var messageBadge = document.getElementById('messageBadge');
    
    var avatarFileInput = document.getElementById('msgAvatarInput');
    if (!avatarFileInput) {
      avatarFileInput = document.createElement('input');
      avatarFileInput.id = 'msgAvatarInput';
      avatarFileInput.type = 'file'; 
      avatarFileInput.accept = 'image/*';
      avatarFileInput.style.display = 'none';
      document.body.appendChild(avatarFileInput);
    }

    var msgBadgeState = { bgColor: '#8e8e93', textColor: '#ffffff' };

    if (messageAvatar) {
      messageAvatar.addEventListener('click', function(e) {
        e.stopPropagation();
        if (messageAvatar.classList.contains('has-img') && window.PhotoAction) {
          window.PhotoAction.show(
            function() { avatarFileInput.click(); },
            function() {
              if (messageAvatarImg) messageAvatarImg.src = '';
              messageAvatar.classList.remove('has-img');
              if (window.AppDB) window.AppDB.delete('message_avatar');
            }
          );
        } else {
          avatarFileInput.click();
        }
      });
    }

    avatarFileInput.addEventListener('change', function() {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        if (window.AppCropper) {
          window.AppCropper.open(e.target.result, { aspectRatio: 1 }, function(croppedData) {
            if (messageAvatarImg) messageAvatarImg.src = croppedData;
            if (messageAvatar) messageAvatar.classList.add('has-img');
            if (window.AppDB) window.AppDB.save('message_avatar', croppedData);
          });
        } else {
          if (messageAvatarImg) messageAvatarImg.src = e.target.result;
          if (messageAvatar) messageAvatar.classList.add('has-img');
          if (window.AppDB) window.AppDB.save('message_avatar', e.target.result);
        }
      };
      reader.readAsDataURL(file);
      this.value = '';
    });

    if (window.AppDB) {
      window.AppDB.get('message_avatar', function(data) {
        if (data && messageAvatarImg && messageAvatar) {
          messageAvatarImg.src = data;
          messageAvatar.classList.add('has-img');
        }
      });

      window.AppDB.get('message_preview', function(text) {
        if (text && messagePreview) messagePreview.textContent = text;
      });
    }

    if (messagePreview) {
      bindPlainTextPaste(messagePreview);
      messagePreview.addEventListener('input', function() {
        if (window.AppDB) window.AppDB.save('message_preview', this.textContent.trim());
      });
      messagePreview.addEventListener('blur', function() {
        if (window.AppDB) window.AppDB.save('message_preview', this.textContent.trim());
      });
    }

    var msgEditBtn = document.querySelector('[data-edit-target="message"]');
    var msgPopup = null;
    var msgPopupMask = null;
    var msgPopupCreated = false;

    if (msgEditBtn) {
      msgEditBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        showMsgPopup();
      });
    }

    function showMsgPopup() {
      if (!msgPopupCreated) {
        msgPopupMask = document.createElement('div');
        msgPopupMask.className = 'popup-mask';
        document.body.appendChild(msgPopupMask);
        msgPopupMask.addEventListener('click', hideMsgPopup);

        msgPopup = document.createElement('div');
        msgPopup.className = 'popup-card';
        msgPopup.innerHTML = '<div class="popup-card-title">消息角标设置</div>'
          + '<div class="popup-card-row"><span>胶囊背景色</span>'
          + '<input type="color" id="msgBadgeBgColor" value="#8e8e93"></div>'
          + '<div class="popup-card-row"><span>文字与图标颜色</span>'
          + '<input type="color" id="msgBadgeTextColor" value="#ffffff"></div>';
        document.body.appendChild(msgPopup);

        document.getElementById('msgBadgeBgColor').addEventListener('input', applyMsgBadgeStyle);
        document.getElementById('msgBadgeTextColor').addEventListener('input', applyMsgBadgeStyle);

        msgPopupCreated = true;
      }

      loadMsgBadgeControls();
      positionSmartPopup(msgPopup, document.getElementById('messageCard'));
      msgPopupMask.classList.add('show');
      msgPopup.classList.add('show');
    }

    function hideMsgPopup() {
      if (msgPopup) msgPopup.classList.remove('show');
      if (msgPopupMask) msgPopupMask.classList.remove('show');
    }

    function applyMsgBadgeStyle() {
      var bgPicker = document.getElementById('msgBadgeBgColor');
      var textPicker = document.getElementById('msgBadgeTextColor');
      if (!bgPicker || !textPicker || !messageBadge) return;

      msgBadgeState.bgColor = bgPicker.value;
      msgBadgeState.textColor = textPicker.value;

      messageBadge.style.backgroundColor = msgBadgeState.bgColor;
      messageBadge.style.color = msgBadgeState.textColor;
      if (window.AppDB) window.AppDB.save('msg_badge_state', msgBadgeState);
    }

    function loadMsgBadgeControls() {
      var bgPicker = document.getElementById('msgBadgeBgColor');
      var textPicker = document.getElementById('msgBadgeTextColor');
      if (bgPicker) bgPicker.value = msgBadgeState.bgColor || '#8e8e93';
      if (textPicker) textPicker.value = msgBadgeState.textColor || '#ffffff';
    }

    if (window.AppDB) {
      window.AppDB.get('msg_badge_state', function(saved) {
        if (saved) {
          msgBadgeState.bgColor = saved.bgColor || '#8e8e93';
          msgBadgeState.textColor = saved.textColor || '#ffffff';
        }
        if (messageBadge) {
          messageBadge.style.backgroundColor = msgBadgeState.bgColor;
          messageBadge.style.color = msgBadgeState.textColor;
        }
      });
    }
  }

  // ============ 头像展示区样式定制模块 ============
  function setupCoupleStyle() {
    var coupleEditBtn = document.querySelector('[data-edit-target="couple"]');
    var couplePopup = null;
    var couplePopupMask = null;
    var couplePopupCreated = false;

    var cpState = {
      glass: false,
      speechBg: '#f0f0f3',
      speechOpacity: 100,
      speechText: '#3c3c43',
      avatarBorder: '#d1d1d6',
      nameText: '#1c1c1e',
      dateCardBg: '#f8f8fa'
    };

    if (coupleEditBtn) {
      coupleEditBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        showCouplePopup();
      });
    }

    function showCouplePopup() {
      if (!couplePopupCreated) {
        couplePopupMask = document.createElement('div');
        couplePopupMask.className = 'popup-mask';
        document.body.appendChild(couplePopupMask);
        couplePopupMask.addEventListener('click', hideCouplePopup);

        couplePopup = document.createElement('div');
        couplePopup.className = 'popup-card';
        couplePopup.innerHTML = '<div class="popup-card-title">头像区设置</div>'
          + '<div class="popup-card-row"><span>气泡毛玻璃</span>'
          + '<div class="toggle-switch"><input type="checkbox" id="cpGlassToggle"><label for="cpGlassToggle"></label></div></div>'
          + '<div class="popup-card-row"><span>气泡背景色</span>'
          + '<input type="color" id="cpSpeechBgColor" value="#f0f0f3"></div>'
          + '<div class="popup-card-row"><span>气泡透明度</span>'
          + '<input type="range" id="cpSpeechOpacity" min="0" max="100" value="100">'
          + '<span class="popup-card-value" id="cpSpeechOpacityVal">100%</span></div>'
          + '<div class="popup-card-row"><span>气泡文字颜色</span>'
          + '<input type="color" id="cpSpeechTextColor" value="#3c3c43"></div>'
          + '<div class="popup-card-row"><span>头像框颜色</span>'
          + '<input type="color" id="cpAvatarBorderColor" value="#d1d1d6"></div>'
          + '<div class="popup-card-row"><span>名字字体颜色</span>'
          + '<input type="color" id="cpNameTextColor" value="#1c1c1e"></div>'
          + '<div class="popup-card-row"><span>日期背景色</span>'
          + '<input type="color" id="cpDateCardBgColor" value="#f8f8fa"></div>';
        document.body.appendChild(couplePopup);

        document.getElementById('cpGlassToggle').addEventListener('change', applyCoupleStylesFromControls);
        document.getElementById('cpSpeechBgColor').addEventListener('input', applyCoupleStylesFromControls);
        document.getElementById('cpSpeechOpacity').addEventListener('input', applyCoupleStylesFromControls);
        document.getElementById('cpSpeechTextColor').addEventListener('input', applyCoupleStylesFromControls);
        document.getElementById('cpAvatarBorderColor').addEventListener('input', applyCoupleStylesFromControls);
        document.getElementById('cpNameTextColor').addEventListener('input', applyCoupleStylesFromControls);
        document.getElementById('cpDateCardBgColor').addEventListener('input', applyCoupleStylesFromControls);

        couplePopupCreated = true;
      }

      loadCoupleStyleControls();
      positionSmartPopup(couplePopup, document.getElementById('coupleSection'));
      couplePopupMask.classList.add('show');
      couplePopup.classList.add('show');
    }

    function hideCouplePopup() {
      if (couplePopup) couplePopup.classList.remove('show');
      if (couplePopupMask) couplePopupMask.classList.remove('show');
    }

    function loadCoupleStyleControls() {
      var glassToggle = document.getElementById('cpGlassToggle');
      var speechBg = document.getElementById('cpSpeechBgColor');
      var speechOpacity = document.getElementById('cpSpeechOpacity');
      var speechOpacityVal = document.getElementById('cpSpeechOpacityVal');
      var speechText = document.getElementById('cpSpeechTextColor');
      var avatarBorder = document.getElementById('cpAvatarBorderColor');
      var nameText = document.getElementById('cpNameTextColor');
      var dateCardBg = document.getElementById('cpDateCardBgColor');

      if (glassToggle) glassToggle.checked = !!cpState.glass;
      if (speechBg) speechBg.value = cpState.speechBg || '#f0f0f3';
      if (speechOpacity) speechOpacity.value = cpState.speechOpacity !== undefined ? cpState.speechOpacity : 100;
      if (speechOpacityVal) speechOpacityVal.textContent = (cpState.speechOpacity !== undefined ? cpState.speechOpacity : 100) + '%';
      if (speechText) speechText.value = cpState.speechText || '#3c3c43';
      if (avatarBorder) avatarBorder.value = cpState.avatarBorder || '#d1d1d6';
      if (nameText) nameText.value = cpState.nameText || '#1c1c1e';
      if (dateCardBg) dateCardBg.value = cpState.dateCardBg || '#f8f8fa';
    }

    function applyCoupleStylesFromControls() {
      var glassToggle = document.getElementById('cpGlassToggle');
      var speechBg = document.getElementById('cpSpeechBgColor');
      var speechOpacity = document.getElementById('cpSpeechOpacity');
      var speechOpacityVal = document.getElementById('cpSpeechOpacityVal');
      var speechText = document.getElementById('cpSpeechTextColor');
      var avatarBorder = document.getElementById('cpAvatarBorderColor');
      var nameText = document.getElementById('cpNameTextColor');
      var dateCardBg = document.getElementById('cpDateCardBgColor');

      if (!speechBg || !speechOpacity) return;

      cpState.glass = glassToggle ? glassToggle.checked : false;
      cpState.speechBg = speechBg.value;
      cpState.speechOpacity = parseInt(speechOpacity.value, 10);
      cpState.speechText = speechText ? speechText.value : '#3c3c43';
      cpState.avatarBorder = avatarBorder ? avatarBorder.value : '#d1d1d6';
      cpState.nameText = nameText ? nameText.value : '#1c1c1e';
      if (dateCardBg) cpState.dateCardBg = dateCardBg.value;

      if (speechOpacityVal) speechOpacityVal.textContent = speechOpacity.value + '%';
      renderCoupleStyles(cpState);
      if (window.AppDB) window.AppDB.save('couple_style_state', cpState);
    }

    function renderCoupleStyles(state) {
      if (!state) return;
      var opacity = (state.speechOpacity !== undefined ? state.speechOpacity : 100) / 100;
      var bgHex = state.speechBg || '#f0f0f3';
      var r = parseInt(bgHex.slice(1,3), 16) || 240;
      var g = parseInt(bgHex.slice(3,5), 16) || 240;
      var b = parseInt(bgHex.slice(5,7), 16) || 243;
      var rgbaBg = 'rgba(' + r + ',' + g + ',' + b + ',' + opacity + ')';

      var s1 = document.getElementById('coupleSpeech1');
      var s2 = document.getElementById('coupleSpeech2');
      [s1, s2].forEach(function(el) {
        if (!el) return;
        el.style.backgroundColor = rgbaBg;
        if (state.speechText) el.style.color = state.speechText;
        if (state.glass) el.classList.add('glass-effect');
        else el.classList.remove('glass-effect');
      });

      var c1 = document.getElementById('coupleAvatar1');
      var c2 = document.getElementById('coupleAvatar2');
      [c1, c2].forEach(function(el) {
        if (!el) return;
        if (state.avatarBorder) el.style.boxShadow = '0 0 0 1px ' + state.avatarBorder;
      });

      var n1 = document.getElementById('coupleName1');
      var n2 = document.getElementById('coupleName2');
      [n1, n2].forEach(function(el) {
        if (!el) return;
        if (state.nameText) el.style.color = state.nameText;
      });

      var dateCard = document.getElementById('coupleDateCard');
      if (dateCard && state.dateCardBg) {
        dateCard.style.backgroundColor = state.dateCardBg;
      }
    }

    if (window.AppDB) {
      window.AppDB.get('couple_style_state', function(saved) {
        if (saved) {
          cpState.glass = !!saved.glass;
          cpState.speechBg = saved.speechBg || '#f0f0f3';
          cpState.speechOpacity = saved.speechOpacity !== undefined ? saved.speechOpacity : 100;
          cpState.speechText = saved.speechText || '#3c3c43';
          cpState.avatarBorder = saved.avatarBorder || '#d1d1d6';
          cpState.nameText = saved.nameText || '#1c1c1e';
          cpState.dateCardBg = saved.dateCardBg || '#f8f8fa';
        }
        renderCoupleStyles(cpState);
      });
    }
  }

})();

// ========== 头像展示区数据与日历模块 ==========
(function() {
  'use strict';

  var coupleData = {
    speech1: '对话1',
    speech2: '对话2',
    name1: 'TA',
    name2: '你',
    avatar1: null,
    avatar2: null,
    startDate: null
  };

  function bindTextPaste(el) {
    if (!el) return;
    el.addEventListener('paste', function(e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
      document.execCommand('insertText', false, text);
    });
  }

  var _coupleFileInput = null;
  function getCoupleFileInput() {
    if (!_coupleFileInput) {
      _coupleFileInput = document.createElement('input');
      _coupleFileInput.id = 'coupleAvatarHiddenInput';
      _coupleFileInput.type = 'file';
      _coupleFileInput.accept = 'image/*';
      _coupleFileInput.style.display = 'none';
      document.body.appendChild(_coupleFileInput);
    }
    return _coupleFileInput;
  }

  function initCoupleSection() {
    renderDateCard();
    applyCoupleData();
    bindCoupleEvents();

    loadCoupleData(function() {
      applyCoupleData();
      renderDateCard();
    });
  }

  if (window._dbReady) {
    initCoupleSection();
  } else {
    window.addEventListener('dbReady', initCoupleSection);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(initCoupleSection, 50);
    });
  } else {
    setTimeout(initCoupleSection, 50);
  }

  function applyCoupleData() {
    var s1 = document.getElementById('coupleSpeech1');
    var s2 = document.getElementById('coupleSpeech2');
    var n1 = document.getElementById('coupleName1');
    var n2 = document.getElementById('coupleName2');
    var img1 = document.getElementById('coupleAvatarImg1');
    var img2 = document.getElementById('coupleAvatarImg2');
    var circle1 = document.getElementById('coupleAvatar1');
    var circle2 = document.getElementById('coupleAvatar2');

    if (s1 && coupleData.speech1) s1.textContent = coupleData.speech1;
    if (s2 && coupleData.speech2) s2.textContent = coupleData.speech2;
    if (n1 && coupleData.name1) n1.textContent = coupleData.name1;
    if (n2 && coupleData.name2) n2.textContent = coupleData.name2;

    if (coupleData.avatar1 && img1 && circle1) {
      img1.src = coupleData.avatar1;
      circle1.classList.add('has-img');
    }
    if (coupleData.avatar2 && img2 && circle2) {
      img2.src = coupleData.avatar2;
      circle2.classList.add('has-img');
    }
  }

  function bindCoupleEvents() {
    var editables = [
      ['coupleSpeech1', 'speech1'],
      ['coupleSpeech2', 'speech2'],
      ['coupleName1', 'name1'],
      ['coupleName2', 'name2']
    ];
    editables.forEach(function(pair) {
      var el = document.getElementById(pair[0]);
      if (el) {
        bindTextPaste(el);
        el.addEventListener('input', function() {
          coupleData[pair[1]] = this.textContent.trim() || '';
          saveCoupleData();
          if (pair[1] === 'name1') updateDateName();
        });
        el.addEventListener('blur', function() {
          coupleData[pair[1]] = this.textContent.trim() || '';
          saveCoupleData();
          if (pair[1] === 'name1') updateDateName();
        });
      }
    });

    var circle1 = document.getElementById('coupleAvatar1');
    var circle2 = document.getElementById('coupleAvatar2');
    if (circle1) circle1.onclick = function(e) { e.stopPropagation(); handleAvatarClick(1); };
    if (circle2) circle2.onclick = function(e) { e.stopPropagation(); handleAvatarClick(2); };

    var daysEl = document.getElementById('dateDaysCount');
    var dateInput = document.getElementById('dateStartInput');
    if (daysEl && dateInput) {
      daysEl.onclick = function(e) {
        e.stopPropagation();
        try {
          if (dateInput.showPicker) dateInput.showPicker();
          else dateInput.click();
        } catch(err) {
          dateInput.click();
        }
      };
      dateInput.onchange = function() {
        coupleData.startDate = this.value || null;
        saveCoupleData();
        renderDateCard();
      };
    }
  }

  function handleAvatarClick(idx) {
    var key = 'avatar' + idx;
    var circle = document.getElementById('coupleAvatar' + idx);
    if (coupleData[key] || (circle && circle.classList.contains('has-img'))) {
      if (window.PhotoAction) {
        window.PhotoAction.show(
          function() { pickCoupleAvatar(idx); },
          function() { deleteCoupleAvatar(idx); }
        );
      } else {
        pickCoupleAvatar(idx);
      }
    } else {
      pickCoupleAvatar(idx);
    }
  }

  function pickCoupleAvatar(idx) {
    var input = getCoupleFileInput();
    input.onchange = function() {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        if (window.AppCropper) {
          window.AppCropper.open(e.target.result, { aspectRatio: 1 }, function(cropped) {
            coupleData['avatar' + idx] = cropped;
            var img = document.getElementById('coupleAvatarImg' + idx);
            var circle = document.getElementById('coupleAvatar' + idx);
            if (img) img.src = cropped;
            if (circle) circle.classList.add('has-img');
            saveCoupleData();
          });
        } else {
          coupleData['avatar' + idx] = e.target.result;
          var img2 = document.getElementById('coupleAvatarImg' + idx);
          var circle2 = document.getElementById('coupleAvatar' + idx);
          if (img2) img2.src = e.target.result;
          if (circle2) circle2.classList.add('has-img');
          saveCoupleData();
        }
      };
      reader.readAsDataURL(file);
      this.value = '';
    };
    input.click();
  }

  function deleteCoupleAvatar(idx) {
    coupleData['avatar' + idx] = null;
    var img = document.getElementById('coupleAvatarImg' + idx);
    var circle = document.getElementById('coupleAvatar' + idx);
    if (img) img.removeAttribute('src');
    if (circle) circle.classList.remove('has-img');
    saveCoupleData();
  }

  function updateDateName() {
    var nameEl = document.getElementById('datePartnerName');
    if (nameEl) nameEl.textContent = coupleData.name1 || 'TA';
  }

  function renderDateCard() {
    var daysEl = document.getElementById('dateDaysCount');
    var datesEl = document.getElementById('dateWeekDates');
    var dateInput = document.getElementById('dateStartInput');

    if (!daysEl || !datesEl) return;

    updateDateName();

    if (dateInput && coupleData.startDate) {
      dateInput.value = coupleData.startDate;
    }

    var days = 0;
    if (coupleData.startDate) {
      var parts = coupleData.startDate.split('-');
      if (parts.length === 3) {
        var start = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        var now = new Date();
        now.setHours(0, 0, 0, 0);
        days = Math.floor((now - start) / 86400000);
        if (days < 0 || isNaN(days)) days = 0;
      }
    }
    daysEl.textContent = days;

    var today = new Date();
    var dayOfWeek = today.getDay();
    var weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);

    var html = '';
    for (var i = 0; i < 7; i++) {
      var d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      var isToday = d.getDate() === today.getDate()
        && d.getMonth() === today.getMonth()
        && d.getFullYear() === today.getFullYear();
      html += '<span' + (isToday ? ' class="today"' : '') + '>' + d.getDate() + '</span>';
    }
    datesEl.innerHTML = html;
  }

  function loadCoupleData(callback) {
    if (!window.AppDB) { if (callback) callback(); return; }
    window.AppDB.get('couple_data', function(val) {
      if (val) {
        for (var k in val) { if (val.hasOwnProperty(k)) coupleData[k] = val[k]; }
      }
      if (callback) callback();
    });
  }

  function saveCoupleData() {
    if (!window.AppDB) return;
    window.AppDB.save('couple_data', coupleData);
  }
})();
