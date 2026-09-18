
(function () {
  'use strict';

  var ARCHIVES_USER_KEY = 'user_archives_list_v3';
  var CHAR_ARCHIVES_KEY = 'character_archives_list_v1';
  var WX_ACCOUNTS_MAP_KEY = 'app_wechat_accounts_map';
  var WX_ACTIVE_USER_KEY = 'app_wechat_active_user_id';
  var WX_CUSTOM_BGS_KEY = 'app_wechat_custom_bgs';
  var WX_CURVE_STYLE_KEY = 'app_wechat_curve_style';

  var wxCurrentTab = 'chats'; // 'chats' | 'contacts' | 'discover' | 'me'
  var chatSubMode = 'direct'; // 'direct' | 'groups'
  var headerCurveStyle = 'straight'; // 'straight' | 'droop' | 'lift'

  var archiveUsers = [];
  var archiveChars = [];
  var wxAccountsMap = {};
  var selectedUser = null;
  var currentWxAccount = null;

  var customBgs = {
    topBg: '',
    tabbarBg: '',
    momentsCover: '' // 默认无图，纯浅灰底色
  };

  // iOS 安全文件选择器
  var _fileInput = null;
  function safePickFile(accept, callback) {
    if (_fileInput && _fileInput.parentNode) _fileInput.parentNode.removeChild(_fileInput);
    _fileInput = document.createElement('input');
    _fileInput.type = 'file';
    _fileInput.accept = accept || 'image/*';
    _fileInput.style.cssText = 'position:fixed;left:-9999px;opacity:0;pointer-events:none;';
    document.body.appendChild(_fileInput);
    _fileInput.addEventListener('change', function () {
      var file = _fileInput.files[0];
      if (_fileInput.parentNode) _fileInput.parentNode.removeChild(_fileInput);
      _fileInput = null;
      if (file && callback) callback(file);
    });
    _fileInput.click();
  }

  function generateRandomWxId() {
    var prefixes = ['wxid_'];
    var prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var result = '';
    for (var i = 0; i < 7; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return prefix + result;
  }

    // 真正无限制的随机手机号：1 + 任意9位纯随机数字 + *
  function generateRandomPhone() {
    var result = '1';
    for (var i = 0; i < 9; i++) {
      result += Math.floor(Math.random() * 10);
    }
    return result + '*';
  }
  
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 实时读取档案库与账号数据
  function loadAllWxData(callback) {
    if (!window.AppDB) { if (callback) callback(); return; }

    window.AppDB.get(ARCHIVES_USER_KEY, function (uList) {
      archiveUsers = Array.isArray(uList) ? uList.filter(function (u) {
        return !u.id || !u.id.startsWith('char_');
      }) : [];

      window.AppDB.get(CHAR_ARCHIVES_KEY, function (cList) {
        archiveChars = Array.isArray(cList) ? cList.filter(function (c) {
          return !c.id || !c.id.startsWith('user_');
        }) : [];

        window.AppDB.get(WX_ACCOUNTS_MAP_KEY, function (mapData) {
          wxAccountsMap = (mapData && typeof mapData === 'object') ? mapData : {};

          window.AppDB.get(WX_CUSTOM_BGS_KEY, function (bgs) {
            if (bgs && typeof bgs === 'object') {
              customBgs.topBg = bgs.topBg || '';
              customBgs.tabbarBg = bgs.tabbarBg || '';
              customBgs.momentsCover = bgs.momentsCover || '';
            }

            window.AppDB.get(WX_CURVE_STYLE_KEY, function (cStyle) {
              if (cStyle) headerCurveStyle = cStyle;

              window.AppDB.get(WX_ACTIVE_USER_KEY, function (activeUid) {
                if (activeUid && wxAccountsMap[activeUid]) {
                  selectedUser = archiveUsers.find(function (u) { return u.id === activeUid; }) || null;
                  currentWxAccount = wxAccountsMap[activeUid] || null;
                } else {
                  selectedUser = null;
                  currentWxAccount = null;
                }
                if (callback) callback();
              });
            });
          });
        });
      });
    });
  }

  function saveWxAccounts() {
    if (window.AppDB) {
      window.AppDB.save(WX_ACCOUNTS_MAP_KEY, wxAccountsMap);
      if (selectedUser) window.AppDB.save(WX_ACTIVE_USER_KEY, selectedUser.id);
    }
  }

  function saveCustomBgs() {
    if (window.AppDB) window.AppDB.save(WX_CUSTOM_BGS_KEY, customBgs);
  }

  function saveCurveStyle() {
    if (window.AppDB) window.AppDB.save(WX_CURVE_STYLE_KEY, headerCurveStyle);
  }

  // 核心路由入口
  function renderWechatRoute() {
    var content = document.getElementById('wechatContent');
    if (!content) return;

    if (!selectedUser || !currentWxAccount) {
      renderUserPickerView(content);
    } else {
      renderMainAppShell(content);
    }
  }

  // ============ 视图 1：选择/切换身份 (毛玻璃小卡 480px + 浅灰列表) ============
  function renderUserPickerView(container) {
    selectedUser = null;
    currentWxAccount = null;
    if (window.AppDB) window.AppDB.delete(WX_ACTIVE_USER_KEY);

    var html = '<div class="wx-shell">'
      + '<div class="wx-user-picker-stage">'
      + '  <div class="wx-picker-card">'
      + '    <div class="wx-picker-inner-form">'
      + '      <div class="wx-picker-header-box">'
      + '        <span class="wx-picker-subtitle">NIVEOUS WECHAT</span>'
      + '        <span class="wx-picker-title">切换微信身份</span>'
      + '        <div class="wx-picker-divider"></div>'
      + '      </div>'
      + '      <div class="wx-picker-list-box">';

    if (!archiveUsers || archiveUsers.length === 0) {
      html += '        <div style="padding:24px 10px; text-align:center; color:#8e8e93; font-size:12px;">'
        + '✦ 档案库暂无用户，请先前往档案创建 ✦'
        + '</div>';
    } else {
      archiveUsers.forEach(function (user) {
        var acc = wxAccountsMap[user.id];
        var isRegistered = !!acc;
        var phoneDisplay = isRegistered ? ('手机号: ' + esc(acc.phone || '未绑定')) : '点击首次注册微信';

        var avatarHtml = user.photo
          ? '<img src="' + esc(user.photo) + '" alt="">'
          : '✦';

        html += ''
          + '<div class="wx-user-card-item" data-pick-user-id="' + esc(user.id) + '">'
          + '  <div class="wx-user-avatar-circle">' + avatarHtml + '</div>'
          + '  <div class="wx-user-info-col">'
          + '    <div class="wx-user-card-name">' + esc(user.name || '未命名用户') + '</div>'
          + '    <div class="wx-user-card-phone">' + phoneDisplay + '</div>'
          + '  </div>'
          + '  <svg class="wx-user-arrow" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>'
          + '</div>';
      });
    }

    html += '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>'
      + '</div>';

    container.innerHTML = html;

    container.querySelectorAll('[data-pick-user-id]').forEach(function (card) {
      card.addEventListener('click', function () {
        var uid = this.dataset.pickUserId;
        var user = archiveUsers.find(function (u) { return u.id === uid; });
        if (!user) return;
        selectedUser = user;
        if (wxAccountsMap[uid]) {
          currentWxAccount = wxAccountsMap[uid];
          saveWxAccounts();
          renderWechatRoute();
        } else {
          renderRegisterView(container, user);
        }
      });
    });
  }

  // ============ 视图 2：首次注册小卡 ============
  function renderRegisterView(container, user) {
    var html = '<div class="wx-shell">'
      + '<div class="wx-reg-stage">'
      + '  <div class="wx-reg-top-bar">'
      + '    <button class="wx-reg-back-btn" id="wxRegBackBtn" type="button">'
      + '      <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>'
      + '      <span>返回选择</span>'
      + '    </button>'
      + '  </div>'
      + '  <div class="wx-reg-card">'
      + '    <div class="wx-reg-form">'
      + '      <div class="wx-reg-header">'
      + '        <span class="wx-reg-subtitle">NIVEOUS WECHAT</span>'
      + '        <span class="wx-reg-title">注册微信</span>'
      + '        <div class="wx-reg-divider"></div>'
      + '      </div>'
      + '      <div class="wx-reg-fields">'
      + '        <div class="wx-reg-input-row">'
      + '          <span class="wx-reg-label">昵称</span>'
      + '          <input class="wx-reg-input" type="text" id="wxIptNickname" value="' + esc(user.name || '') + '" placeholder="设置专属昵称" autocomplete="off">'
      + '        </div>'
      + '        <div class="wx-reg-input-row">'
      + '          <span class="wx-reg-label">微信号</span>'
      + '          <input class="wx-reg-input" type="text" id="wxIptWxId" placeholder="设置微信号" autocomplete="off">'
      + '          <button class="wx-reg-refresh-btn" id="wxBtnRefWx" type="button" title="刷新微信号">'
            + '            <svg viewBox="0 0 24 24"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>'
            + '          </button>'
        + '        </div>'
        + '        <div class="wx-reg-input-row">'
        + '          <span class="wx-reg-label">手机号</span>'
        + '          <input class="wx-reg-input" type="text" id="wxIptPhone" placeholder="设置手机号" autocomplete="off">'
        + '          <button class="wx-reg-refresh-btn" id="wxBtnRefPhone" type="button" title="刷新手机号">'
            + '            <svg viewBox="0 0 24 24"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>'
            + '          </button>'
        + '        </div>'
        + '      </div>'
        + '      <button class="wx-reg-submit-btn" id="wxBtnSubmitReg" type="button">开启微信</button>'
        + '    </div>'
        + '  </div>'
        + '</div>'
        + '</div>';

    container.innerHTML = html;

    var iptWx = container.querySelector('#wxIptWxId');
    var iptPhone = container.querySelector('#wxIptPhone');
    if (iptWx) iptWx.value = generateRandomWxId();
    if (iptPhone) iptPhone.value = generateRandomPhone();

    container.querySelector('#wxRegBackBtn').addEventListener('click', function () {
      renderUserPickerView(container);
    });

    var btnRefWx = container.querySelector('#wxBtnRefWx');
    btnRefWx.addEventListener('click', function () {
      btnRefWx.classList.remove('rotating');
      void btnRefWx.offsetWidth;
      btnRefWx.classList.add('rotating');
      if (iptWx) iptWx.value = generateRandomWxId();
    });

    var btnRefPhone = container.querySelector('#wxBtnRefPhone');
    btnRefPhone.addEventListener('click', function () {
      btnRefPhone.classList.remove('rotating');
      void btnRefPhone.offsetWidth;
      btnRefPhone.classList.add('rotating');
      if (iptPhone) iptPhone.value = generateRandomPhone();
    });

    container.querySelector('#wxBtnSubmitReg').addEventListener('click', function () {
      var iptNick = container.querySelector('#wxIptNickname');
      var nickname = (iptNick ? iptNick.value : '').trim() || user.name || '用户';
      var wxid = (iptWx ? iptWx.value : '').trim() || generateRandomWxId();
      var phone = (iptPhone ? iptPhone.value : '').trim() || generateRandomPhone();

      var newAcc = {
        userId: user.id,
        nickname: nickname,
        wxid: wxid,
        phone: phone,
        signature: '',
        customPolPhoto: user.photo || '',
        tiles: ['', '', '', ''],
        registeredAt: Date.now()
      };

      wxAccountsMap[user.id] = newAcc;
      currentWxAccount = newAcc;
      saveWxAccounts();

      if (window.AppNav) AppNav.showToast('✦ 微信账号注册成功 ✦');
      renderWechatRoute();
    });
  }

  // ============ 视图 3：原版微信主应用外壳 ============
  function renderMainAppShell(container) {
    var isChats = (wxCurrentTab === 'chats');
    var headerHideClass = isChats ? '' : ' hide-header';
    var curveClass = ' curve-' + headerCurveStyle;
    var hasBgClass = customBgs.topBg ? ' has-bg' : '';

    var html = '<div class="wx-shell">'
      // 1. 顶栏 (Chat 28px)
      + '<div class="wx-header-wrapper">'
      + '  <div class="wx-header' + headerHideClass + curveClass + hasBgClass + '" id="wxHeader">'
      + '    <img src="' + esc(customBgs.topBg) + '" alt="" class="wx-header-bg-img" id="wxHeaderBgImg">'
      + '    <button class="wx-header-back" id="wxHeaderBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '    <div class="wx-header-title">Chat</div>'
      + '    <button class="wx-header-add" id="wxHeaderAddBtn" type="button"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>'
      + '  </div>'
      + '</div>'

      // 加号菜单
      + '<div class="wx-menu-mask" id="wxMenuMask"></div>'
      + '<div class="wx-menu-popover" id="wxMenuPopover">'
      + '  <div class="wx-menu-item" id="wxPopToggleCurve">'
      + '    <svg viewBox="0 0 24 24"><path d="M3 12c4 0 6 6 10 6s6-6 10-6"/></svg>'
      + '    <span>切换顶栏曲形</span>'
      + '  </div>'
      + '  <div class="wx-menu-item" id="wxPopUploadTopBg">'
      + '    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="6" rx="2"/><rect x="3" y="11" width="18" height="10" rx="2"/></svg>'
      + '    <span>顶部栏背景</span>'
      + '  </div>'
      + '  <div class="wx-menu-item" id="wxPopUploadTabBg">'
      + '    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="10" rx="2"/><rect x="3" y="15" width="18" height="6" rx="2"/></svg>'
      + '    <span>底部栏背景</span>'
      + '  </div>'
      + '  <div class="wx-menu-item" id="wxPopResetBgs">'
      + '    <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>'
      + '    <span>恢复默认背景</span>'
      + '  </div>'
      + '</div>'

      // 2. 主视口
      + '<div class="wx-body" id="wxBodyContainer"></div>'

      // 3. 底栏 (高度54px，文字10.5px，虚线贯穿雪花手册)
      + '<div class="wx-tabbar" id="wxTabbar">'
      + '  <div class="wx-tab-item' + (wxCurrentTab === 'chats' ? ' active' : '') + '" data-tab-name="chats">'
      + '    <svg viewBox="0 0 64 64"><path d="M32 15C21.5 15 13 22 13 31C13 36 16 40.5 20.6 43.2L18.5 50L26 46.4C27.9 46.9 29.9 47 32 47C42.5 47 51 40 51 31C51 22 42.5 15 32 15Z"/></svg>'
      + '    <span class="wx-tab-label">聊天</span>'
      + '  </div>'
      + '  <div class="wx-tab-item' + (wxCurrentTab === 'contacts' ? ' active' : '') + '" data-tab-name="contacts">'
      + '    <svg viewBox="0 0 64 64">'
      + '      <rect x="15" y="10" width="34" height="44" rx="3.5"/>'
      + '      <line x1="22.5" y1="10" x2="22.5" y2="54" stroke-dasharray="3 3"/>'
      + '      <text class="snow-mark" x="35" y="34.5" font-size="22" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="900">❆</text>'
      + '      <line x1="28" y1="44" x2="42" y2="44"/>'
      + '    </svg>'
      + '    <span class="wx-tab-label">通讯录</span>'
      + '  </div>'
      + '  <div class="wx-tab-item' + (wxCurrentTab === 'discover' ? ' active' : '') + '" data-tab-name="discover">'
      + '    <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="23"/><polygon points="41 23 35.5 35.5 23 41 28.5 28.5 41 23"/></svg>'
      + '    <span class="wx-tab-label">发现</span>'
      + '  </div>'
      + '  <div class="wx-tab-item' + (wxCurrentTab === 'me' ? ' active' : '') + '" data-tab-name="me">'
      + '    <svg viewBox="0 0 64 64"><path d="M50 52V47C50 40.5 44.5 35 38 35H26C19.5 35 14 40.5 14 47V52"/><circle cx="32" cy="20" r="10"/></svg>'
      + '    <span class="wx-tab-label">我</span>'
      + '  </div>'
      + '</div>'
      + '</div>';

    container.innerHTML = html;

    applyHeaderBg();
    applyTabbarBg();
    bindShellEvents(container);
    renderCurrentTabPage();
  }

  function applyHeaderBg() {
    var headerEl = document.getElementById('wxHeader');
    var bgImg = document.getElementById('wxHeaderBgImg');
    if (!headerEl) return;
    if (customBgs.topBg) {
      headerEl.classList.add('has-bg');
      if (bgImg) bgImg.src = customBgs.topBg;
    } else {
      headerEl.classList.remove('has-bg');
      if (bgImg) bgImg.src = '';
    }
  }

  function applyTabbarBg() {
    var el = document.getElementById('wxTabbar');
    if (!el) return;
    if (customBgs.tabbarBg) el.style.backgroundImage = 'url(' + customBgs.tabbarBg + ')';
    else el.style.backgroundImage = '';
  }

  function bindShellEvents(container) {
    var backBtn = container.querySelector('#wxHeaderBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        if (window.AppNav) AppNav.showPage('home');
      });
    }

    var addBtn = container.querySelector('#wxHeaderAddBtn');
    var mask = container.querySelector('#wxMenuMask');
    var popover = container.querySelector('#wxMenuPopover');

    function closeMenu() {
      if (popover) popover.classList.remove('show');
      if (mask) mask.classList.remove('show');
    }
    function openMenu() {
      if (popover) popover.classList.add('show');
      if (mask) mask.classList.add('show');
    }

    if (addBtn) {
      addBtn.addEventListener('click', function () {
        if (popover.classList.contains('show')) closeMenu();
        else openMenu();
      });
    }
    if (mask) mask.addEventListener('click', closeMenu);

    var toggleCurveBtn = container.querySelector('#wxPopToggleCurve');
    if (toggleCurveBtn) {
      toggleCurveBtn.addEventListener('click', function () {
        closeMenu();
        var styles = ['straight', 'droop', 'lift'];
        var idx = styles.indexOf(headerCurveStyle);
        headerCurveStyle = styles[(idx + 1) % styles.length];
        saveCurveStyle();

        var header = document.getElementById('wxHeader');
        if (header) {
          header.className = header.className.replace(/\bcurve-\w+\b/g, '').trim();
          header.classList.add('curve-' + headerCurveStyle);
        }

        var names = { straight: '直角平线', droop: '两端下垂弧', lift: '两端托起弧' };
        if (window.AppNav) AppNav.showToast('顶栏曲形已切换为「' + names[headerCurveStyle] + '」');
      });
    }

    var upTopBtn = container.querySelector('#wxPopUploadTopBg');
    if (upTopBtn) {
      upTopBtn.addEventListener('click', function () {
        closeMenu();
        safePickFile('image/*', function (file) {
          var reader = new FileReader();
          reader.onload = function (e) {
            if (window.AppCropper) {
              window.AppCropper.open(e.target.result, { aspectRatio: 375 / 52 }, function (cropped) {
                customBgs.topBg = cropped;
                saveCustomBgs();
                applyHeaderBg();
              });
            } else {
              customBgs.topBg = e.target.result;
              saveCustomBgs();
              applyHeaderBg();
            }
          };
          reader.readAsDataURL(file);
        });
      });
    }

    var upTabBtn = container.querySelector('#wxPopUploadTabBg');
    if (upTabBtn) {
      upTabBtn.addEventListener('click', function () {
        closeMenu();
        safePickFile('image/*', function (file) {
          var reader = new FileReader();
          reader.onload = function (e) {
            if (window.AppCropper) {
              window.AppCropper.open(e.target.result, { aspectRatio: 375 / 54 }, function (cropped) {
                customBgs.tabbarBg = cropped;
                saveCustomBgs();
                applyTabbarBg();
              });
            } else {
              customBgs.tabbarBg = e.target.result;
              saveCustomBgs();
              applyTabbarBg();
            }
          };
          reader.readAsDataURL(file);
        });
      });
    }

    var resetBtn = container.querySelector('#wxPopResetBgs');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        closeMenu();
        customBgs.topBg = '';
        customBgs.tabbarBg = '';
        saveCustomBgs();
        applyHeaderBg();
        applyTabbarBg();
        if (window.AppNav) AppNav.showToast('已恢复默认背景');
      });
    }

    container.querySelectorAll('.wx-tab-item').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var tName = this.dataset.tabName;
        if (wxCurrentTab === tName) return;
        wxCurrentTab = tName;

        container.querySelectorAll('.wx-tab-item').forEach(function (t) { t.classList.remove('active'); });
        this.classList.add('active');

        var headerEl = document.getElementById('wxHeader');
        if (headerEl) {
          if (wxCurrentTab === 'chats') headerEl.classList.remove('hide-header');
          else headerEl.classList.add('hide-header');
        }

        renderCurrentTabPage();
      });
    });
  }

  function renderCurrentTabPage() {
    var body = document.getElementById('wxBodyContainer');
    if (!body) return;

    if (wxCurrentTab === 'chats') renderChatsTab(body);
    else if (wxCurrentTab === 'contacts') renderContactsTab(body);
    else if (wxCurrentTab === 'discover') renderDiscoverTab(body);
    else if (wxCurrentTab === 'me') renderMeTab(body);
  }

  // ========== 1. 聊天 (Chats：严格只展示绑定给当前用户的角色) ==========
  function renderChatsTab(body) {
    var directActive = (chatSubMode === 'direct') ? ' active' : '';
    var groupsActive = (chatSubMode === 'groups') ? ' active' : '';

    var topSegmentHtml = ''
      + '<div class="wx-orbit-container">'
      + '  <div class="seg-celestial-stage" id="wxChatSegmentStage">'
      + '    <div class="celestial-orbit-line"></div>'
      + '    <div class="celestial-node' + directActive + '" data-chat-mode="direct">'
      + '      <div class="planet-orb">☽</div>'
      + '      <span class="celestial-label">Direct Message</span>'
      + '    </div>'
      + '    <div class="celestial-node' + groupsActive + '" data-chat-mode="groups">'
      + '      <span class="celestial-label">Groups</span>'
      + '      <div class="planet-orb">✦</div>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    var listContentHtml = '';

    if (chatSubMode === 'direct') {
      var currentBoundChars = archiveChars.filter(function (c) {
        return c.boundUserId && c.boundUserId === (selectedUser ? selectedUser.id : '');
      });

            if (!currentBoundChars.length) {
        listContentHtml = '<div class="wx-empty">'
          + '<div class="wx-empty-text">✦ 暂无专属绑定角色，可在「档案」中进行绑定 ✦</div>'
          + '</div>';
      } else {
                listContentHtml = '<div class="wx-chat-list">';
        currentBoundChars.forEach(function (c) {
          listContentHtml += '<div class="wx-chat-card-frame" data-char-id="' + esc(c.id) + '">'
            + '<div class="wx-avatar-box">'
            + (c.photo ? '<img src="' + esc(c.photo) + '" alt="">' : '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>')
            + '</div>'
            + '<div class="wx-chat-main-col">'
            + '  <div class="wx-chat-top-row">'
            + '    <span class="wx-chat-name">' + esc(c.name || '角色') + '</span>'
            + '    <span class="wx-chat-time"></span>'
            + '  </div>'
            + '  <div class="wx-chat-bottom-row">'
            + '    <span class="wx-chat-msg">还未开启聊天</span>'
            + '  </div>'
            + '</div>'
            + '</div>';
        });
        listContentHtml += '</div>';
      }
    } else {
      // Groups 群聊空状态：也彻底去掉了大图标，只留纯净文字
      listContentHtml = '<div class="wx-empty">'
        + '<div class="wx-empty-text">✦ 群聊还待开发中哦 ✦</div>'
        + '</div>';
    }

    body.innerHTML = '<div class="wx-chat-stage">' + topSegmentHtml + listContentHtml + '</div>';

    body.querySelectorAll('.celestial-node').forEach(function (node) {
      node.addEventListener('click', function () {
        var mode = this.dataset.chatMode;
        if (chatSubMode === mode) return;
        chatSubMode = mode;
        renderChatsTab(body);
      });
    });

    body.querySelectorAll('.wx-chat-card-frame').forEach(function (item) {
      item.addEventListener('click', function () {
        var cid = this.dataset.charId;
        var cObj = archiveChars.find(function (c) { return c.id === cid; });
        if (cObj && window.AppNav) {
          window.AppNav.showToast('与「' + (cObj.name || '角色') + '」的聊天暂时还未开通，宝宝再等等哦>_<');
        }
      });
    });
  }

  // ========== 2. 通讯录 (Contacts：严格只展示绑定给当前用户的角色) ==========
  function renderContactsTab(body) {
    var topHtml = '<div class="wx-contacts-top-group">'
      + '  <div class="wx-contact-pill-item" id="wxBtnNpcGen">'
      + '    <div class="wx-contact-pill-icon"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>'
      + '    <span class="wx-contact-pill-title">NPC人设生成</span>'
      + '    <svg class="wx-contact-pill-arrow" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>'
      + '  </div>'
      + '  <div class="wx-contact-pill-item" id="wxBtnNewFriend">'
      + '    <div class="wx-contact-pill-icon"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg></div>'
      + '    <span class="wx-contact-pill-title">新的朋友</span>'
      + '    <svg class="wx-contact-pill-arrow" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>'
      + '  </div>'
      + '</div>';

    var currentBoundChars = archiveChars.filter(function (c) {
      return c.boundUserId && c.boundUserId === (selectedUser ? selectedUser.id : '');
    });

    var listHtml = '<div class="wx-contact-card-box">';
    if (!currentBoundChars.length) {
      listHtml += '<div style="padding: 24px 10px; text-align: center; color: #8e8e93; font-size: 12px;">✦ 暂无专属绑定角色好友 ✦</div>';
    } else {
      currentBoundChars.forEach(function (c) {
        listHtml += '<div class="wx-contact-user-row" data-char-id="' + esc(c.id) + '">'
          + '<div class="wx-contact-avatar">'
          + (c.photo ? '<img src="' + esc(c.photo) + '" alt="">' : '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>')
          + '</div>'
          + '<div class="wx-contact-name">' + esc(c.name || '角色') + '</div>'
          + '</div>';
      });
    }
    listHtml += '</div>';

    body.innerHTML = '<div class="wx-contacts-wrap">' + topHtml + listHtml + '</div>';

    var npcBtn = body.querySelector('#wxBtnNpcGen');
    if (npcBtn) {
      npcBtn.addEventListener('click', function () {
        if (window.AppNav) AppNav.showToast('✦ 正在精心开发中 ✦');
      });
    }

    var newFrBtn = body.querySelector('#wxBtnNewFriend');
    if (newFrBtn) {
      newFrBtn.addEventListener('click', function () {
        if (window.AppNav) AppNav.showToast('✦ 正在精心开发中 ✦');
      });
    }

    body.querySelectorAll('.wx-contact-user-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var cid = this.dataset.charId;
        var cObj = archiveChars.find(function (c) { return c.id === cid; });
        if (cObj && window.AppNav) {
          window.AppNav.showToast('正在进入「' + (cObj.name || '角色') + '」的详情...');
        }
      });
    });
  }

  // ========== 3. 发现 (朋友圈：彻底清除残留图，纯灰底色) ==========
  function renderDiscoverTab(body) {
    // 强制校验：如果不是你自己手动换的新图，绝对不加背景图样式
    var hasUserBg = customBgs.momentsCover && customBgs.momentsCover.startsWith('data:image');
    var coverStyle = hasUserBg ? ('background-image:url(\'' + customBgs.momentsCover + '\');') : 'background-image:none; background-color:#e5e5ea;';

    var userAvatarSrc = (currentWxAccount && currentWxAccount.customPolPhoto) || (selectedUser ? selectedUser.photo : '') || '';
    var userAvatarHtml = userAvatarSrc ? '<img src="' + esc(userAvatarSrc) + '">' : '✦';
    var userSigText = (currentWxAccount && currentWxAccount.signature) ? currentWxAccount.signature : '';

      var html = '<div class="wx-moments-wrap">'
    + '<div class="wx-moments-cover-stage" style="' + coverStyle + '" id="wxMomentsCover">'
    + '  <button class="wx-moments-img-btn" id="wxBtnChangeMomentsBg" type="button" title="更换朋友圈封面">'
    + '    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
    + '  </button>'
    + '  <div class="wx-moments-user-dock">'
    + '    <span class="wx-moments-user-name">' + esc(currentWxAccount ? currentWxAccount.nickname : (selectedUser ? selectedUser.name : '用户')) + '</span>'
    + '    <div class="wx-moments-avatar-col">'
    + '      <div class="wx-moments-user-avatar">' + userAvatarHtml + '</div>'
    + '      <span class="wx-moments-user-sig">' + esc(userSigText) + '</span>'
    + '    </div>'
    + '  </div>'
    + '</div>'
    + '<div class="wx-moments-feed-list">'
    + '  <div class="wx-moments-post-square-btn" id="wxBtnMomentsPostSquare" title="发布朋友圈">'
    + '    <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>'
    + '  </div>'
    + '  <div class="wx-moments-empty">✦ 日常动态 ✦</div>'
    + '</div>'
    + '</div>';

    body.innerHTML = html;

    var changeBgBtn = body.querySelector('#wxBtnChangeMomentsBg');
    if (changeBgBtn) {
      changeBgBtn.addEventListener('click', function () {
        safePickFile('image/*', function (file) {
          var reader = new FileReader();
          reader.onload = function (e) {
            if (window.AppCropper) {
              window.AppCropper.open(e.target.result, { aspectRatio: 375 / 230 }, function (cropped) {
                customBgs.momentsCover = cropped;
                saveCustomBgs();
                renderDiscoverTab(body);
              });
            } else {
              customBgs.momentsCover = e.target.result;
              saveCustomBgs();
              renderDiscoverTab(body);
            }
          };
          reader.readAsDataURL(file);
        });
      });
    }

    var postSquareBtn = body.querySelector('#wxBtnMomentsPostSquare');
    if (postSquareBtn) {
      postSquareBtn.addEventListener('click', function () {
        if (window.AppNav) AppNav.showToast('✦ 正在精心开发中 ✦');
      });
    }
  }

  // ========== 4. 「我」(Me：拍立得完整细节，纯尖角深阴影签名框) ==========
  function renderMeTab(body) {
    var polPhotoSrc = (currentWxAccount && currentWxAccount.customPolPhoto) || (selectedUser ? selectedUser.photo : '') || '';
    var hasPhoto = polPhotoSrc ? 'display:block;' : 'display:none;';
    var hasPlaceholder = polPhotoSrc ? 'display:none;' : 'display:flex;';

    var tiles = (currentWxAccount && Array.isArray(currentWxAccount.tiles)) ? currentWxAccount.tiles : ['', '', '', ''];
    var currentSig = (currentWxAccount && currentWxAccount.signature) ? currentWxAccount.signature : '';

    var tilesHtml = '';
    for (var i = 0; i < 4; i++) {
      var tSrc = tiles[i] || '';
      var hasTImg = tSrc ? 'display:block;' : 'display:none;';
      var hasTDef = tSrc ? 'display:none;' : 'display:block;';
      tilesHtml += '<div class="tiny-tile-item" data-tile-idx="' + i + '">'
        + '<span class="tile-def-symbol" style="' + hasTDef + '">+</span>'
        + '<img src="' + esc(tSrc) + '" alt="" style="' + hasTImg + '">'
        + '</div>';
    }

    var polHtml = '<div class="wx-me-pol-container">'
      + '<div class="pol-wrap">'
      + '  <div class="pol-bw">'
      + '    <div class="frame">'
      + '      <div class="tape-tl"></div>'
      + '      <div class="tape-tr"></div>'
      + '      <div class="photo" id="wxPolPhoto">'
      + '        <div class="corner tl"></div>'
      + '        <div class="corner tr"></div>'
      + '        <div class="corner bl"></div>'
      + '        <div class="corner br"></div>'
      + '        <span class="upload-label" id="wxPolUploadText" style="' + hasPlaceholder + '">+ 上传相片</span>'
      + '        <img id="wxPolPreviewImg" class="preview-img" src="' + esc(polPhotoSrc) + '" alt="Photo" style="' + hasPhoto + '">'
      + '      </div>'
      + '      <div class="journal-bottom">'
      + '        <div class="seal-img-badge">'
      + '          <div class="dashed-border">'
      + '            <img src="https://niveousmoon.top/images/img_1789411643895_j0ciw.jpg" alt="Seal">'
      + '          </div>'
      + '        </div>'
      + '        <div class="journal-lines">'
      + '          <span></span><span></span><span></span>'
      + '        </div>'
      + '        <span class="star-deco">✦ ✧ ✦</span>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="right-info-col">'
      + '    <div class="right-top-bar">'
      + '      <div class="tiny-tiles-grid">' + tilesHtml + '</div>'
      + '    </div>'
      + '    <div class="me-clean-name" contenteditable="true" id="wxMeName" spellcheck="false">' + esc(currentWxAccount ? currentWxAccount.nickname : (selectedUser ? selectedUser.name : '')) + '</div>'
      + '    <div class="me-clean-id-row"><span class="me-clean-prefix">ID:</span><span contenteditable="true" id="wxMeId" spellcheck="false">' + esc(currentWxAccount ? currentWxAccount.wxid : '') + '</span></div>'
      + '    <div class="me-sig-cross-card">'
      + '      <span class="sig-cross tl">+</span>'
      + '      <span class="sig-cross tr">+</span>'
      + '      <span class="sig-cross bl">+</span>'
      + '      <span class="sig-cross br">+</span>'
      + '      <span class="me-sig-text" contenteditable="true" id="wxMeSig" spellcheck="false">' + esc(currentSig) + '</span>'
      + '      <svg class="me-cursor-icon-gray" viewBox="0 0 24 24"><path d="M4 2l16 11.5-6.5 1.5 4.5 7-3 1.5-4.5-7-4.5 4.5z"/></svg>'
      + '    </div>'
      + '  </div>'
      + '</div>'
      + '</div>';

    var listGroup1 = [
      { id: 'wxMeAsset', icon: '<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>', text: '资产' },
      { id: 'wxMeFav', icon: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>', text: '收藏' },
      { id: 'wxMeSticker', icon: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>', text: '表情包贴图' },
      { id: 'wxMePat', icon: '<path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>', text: '拍一拍' }
    ];

    var listHtml1 = '<div class="wx-me-white-group">';
    listGroup1.forEach(function (item) {
      listHtml1 += '<div class="wx-me-white-cell" id="' + item.id + '">'
        + '<div class="wx-me-cell-icon"><svg viewBox="0 0 24 24">' + item.icon + '</svg></div>'
        + '<div class="wx-me-cell-text">' + item.text + '</div>'
        + '<svg class="wx-me-cell-arrow" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>'
        + '</div>';
    });
    listHtml1 += '</div>';

    var listHtml2 = '<div class="wx-me-white-group">'
      + '<div class="wx-me-white-cell" id="wxMeSwitchUser">'
      + '  <div class="wx-me-cell-icon"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>'
      + '  <div class="wx-me-cell-text">切换身份</div>'
      + '  <svg class="wx-me-cell-arrow" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>'
      + '</div>'
      + '</div>';

    body.innerHTML = '<div class="wx-me-page-wrap">'
      + polHtml
      + '<div class="wx-me-divider-gap"></div>'
      + listHtml1
      + '<div class="wx-me-divider-gap thick"></div>'
      + listHtml2
      + '</div>';

    // 拍立得照片裁剪上传
    var polPhotoBox = body.querySelector('#wxPolPhoto');
    if (polPhotoBox) {
      polPhotoBox.addEventListener('click', function () {
        safePickFile('image/*', function (file) {
          var reader = new FileReader();
          reader.onload = function (e) {
            if (window.AppCropper) {
              window.AppCropper.open(e.target.result, { aspectRatio: 4 / 3 }, function (cropped) {
                if (currentWxAccount) {
                  currentWxAccount.customPolPhoto = cropped;
                  saveWxAccounts();
                  renderMeTab(body);
                }
              });
            } else {
              if (currentWxAccount) {
                currentWxAccount.customPolPhoto = e.target.result;
                saveWxAccounts();
                renderMeTab(body);
              }
            }
          };
          reader.readAsDataURL(file);
        });
      });
    }

    // 4 个微型小格 28px 独立上传/裁切
    body.querySelectorAll('.tiny-tile-item').forEach(function (tile) {
      tile.addEventListener('click', function () {
        var idx = parseInt(this.dataset.tileIdx, 10);
        safePickFile('image/*', function (file) {
          var reader = new FileReader();
          reader.onload = function (e) {
            if (window.AppCropper) {
              window.AppCropper.open(e.target.result, { aspectRatio: 1 }, function (cropped) {
                if (!currentWxAccount.tiles) currentWxAccount.tiles = ['', '', '', ''];
                currentWxAccount.tiles[idx] = cropped;
                saveWxAccounts();
                renderMeTab(body);
              });
            } else {
              if (!currentWxAccount.tiles) currentWxAccount.tiles = ['', '', '', ''];
              currentWxAccount.tiles[idx] = e.target.result;
              saveWxAccounts();
              renderMeTab(body);
            }
          };
          reader.readAsDataURL(file);
        });
      });
    });

    // 手账信息与签名同步保存
    function syncPolFields() {
      if (!currentWxAccount) return;
      var n = body.querySelector('#wxMeName');
      var w = body.querySelector('#wxMeId');
      var s = body.querySelector('#wxMeSig');
      if (n) currentWxAccount.nickname = n.innerText.trim();
      if (w) currentWxAccount.wxid = w.innerText.trim();
      if (s) currentWxAccount.signature = s.innerText.trim();
      saveWxAccounts();
    }

    ['wxMeName', 'wxMeId', 'wxMeSig'].forEach(function (id) {
      var el = body.querySelector('#' + id);
      if (el) {
        el.addEventListener('input', syncPolFields);
        el.addEventListener('blur', syncPolFields);
      }
    });

    // 列表项点击事件
    ['wxMeAsset', 'wxMeFav', 'wxMeSticker', 'wxMePat'].forEach(function (btnId) {
      var btn = body.querySelector('#' + btnId);
      if (btn) {
        btn.addEventListener('click', function () {
          if (window.AppNav) AppNav.showToast('✦ 正在精心开发中 ✦');
        });
      }
    });

    // 切换身份
    var switchBtn = body.querySelector('#wxMeSwitchUser');
    if (switchBtn) {
      switchBtn.addEventListener('click', function () {
        var content = document.getElementById('wechatContent');
        renderUserPickerView(content);
      });
    }
  }

  // 核心启动与保活
  function startWechatEngine() {
    loadAllWxData(function () {
      renderWechatRoute();
    });
  }

  window.addEventListener('pageChange', function (e) {
    if (e.detail && e.detail.page === 'wechat') {
      startWechatEngine();
    }
  });

  if (window._dbReady) {
    startWechatEngine();
  } else {
    window.addEventListener('dbReady', function () {
      startWechatEngine();
    }, { once: true });
  }

})();
