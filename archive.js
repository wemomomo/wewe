
(function(){
  'use strict';

  // 数据库存储键名
  var ARCHIVES_LIST_KEY = 'user_archives_list_v3';
  var ACTIVE_USER_ID_KEY = 'user_archive_active_id_v3';
  var CHAR_ARCHIVES_LIST_KEY = 'character_archives_list_v1';
  var CHAR_ACTIVE_ID_KEY = 'character_archive_active_id_v1';

  var container = null;
  var currentTab = 'user'; // 'user' | 'char'

  // 用户数据状态
  var userList = [];
  var currentUserId = null;
  var userTplIdx = 0;

  // 角色数据状态
  var charList = [];
  var currentCharId = null;
  var charTplIdx = 0;

  // 用户默认文案
  var DEFAULT_BIOS = [
    '把梦放进富士山里融化         🍎 -夢を富士山に入れて溶かす苹果',
    '“你可以是任何形状的星星，\n                        ——但對我来説就是宇宙⊹',
    '霧の中で咲く純白の夢\n雾中盛开的纯白梦境',
    '𓈒𓏸✧₊ 月亮偷藏糖果 融化在星塵郵筒的縫隙裡𓈒𓏸ꕤ.₊\n ',
    '“在这漫长胶片的每一帧里，只为你聚焦。”'
  ];

  // 用户初始模板结构
  var defaultProfile = {
    id: '',
    name: '',
    gender: '',
    age: '',
    height: '',
    birthday: '',
    zodiac: '',
    appearance: '',
    personality: '',
    tags: '',
    hobbies: '',
    background: '',
    bio0: DEFAULT_BIOS[0],
    bio1: DEFAULT_BIOS[1],
    bio2: DEFAULT_BIOS[2],
    bio3: DEFAULT_BIOS[3],
    bio4: DEFAULT_BIOS[4],
    photo: '',
    createDate: '',
    userid: '@NIVEOUSMOON',
    tag1: '✦ 专属',
    tag2: '♡ 奔赴',
    tag3: '✧ 宇宙漫游',
    serial: 'NO. 0000-NIVEOUS',
    tplIdx: 0,
    u1Title: 'MEMORIES ✦',
    u1Stamp: '★ SPECIAL',
    u1VertCode: 'LUCKY-TODAY',
    u2Brand: 'NIVEOUS ARCHIVE',
    u2Playing: 'PLAYING',
    u2Stars: '✦ ✦ ✦',
    u2Digits: '4 892019 330219',
    u2Tag: 'SPECIAL EDITION',
    u3Postmark: 'PARIS',
    u3TagText: 'LETTRE D\'AMOUR',
    u3FrenchQuote: '« Pour toujours et à jamais »',
    u3Chip1: '燕麦手作',
    u3Chip2: '典藏信笺',
    u4Title: 'SANCTUARY',
    u4Stamp: 'ROSE',
    u4Overlay: '✦ ETERNAL ✦',
    u4Plague: '✟ SACRED OATH · IN PERPETUUM ✟',
    u4Stat1: '纯粹',
    u4Stat2: '灵魂共鸣',
    u4Stat3: '永恒',
    u5Scene: 'SCENE 01',
    u5Fps: 'ISO 400 · 24 FPS',
    u5Director: 'PROD. BY STAR',
    u5SubEn: '"In every frame of this endless reel, you are my only focus."',
    u5Seat: 'SEAT: VIP',
    u5FilmNo: '№ 0000-FILM'
  };

  // 角色默认文案
  var DEFAULT_CHAR_QUOTES = [
    '—𖤐⸝⋆我在一萬顆星星中找到了你𖤐⸝⋆—',
    '人间失格。',
    '秩序是谎言，混乱才是真相。\n"Order is a lie; chaos is the truth."',
    '教堂的钟声是群鸦的悲鸣\n你的出现，让我开始相信天使的存在',
    '« 无论时间流转至何处，我都会守在你的身边。 »'
  ];

  // 角色初始模板结构
  var defaultCharProfile = {
    id: '',
    name: '',
    gender: '',
    age: '',
    height: '',
    birthday: '',
    zodiac: '',
    appearance: '',
    personality: '',
    tags: '',
    hobbies: '',
    background: '',
    quote0: DEFAULT_CHAR_QUOTES[0],
    quote1: DEFAULT_CHAR_QUOTES[1],
    quote2: DEFAULT_CHAR_QUOTES[2],
    quote3: DEFAULT_CHAR_QUOTES[3],
    quote4: DEFAULT_CHAR_QUOTES[4],
    photo: '',
    createDate: '',
    tagRomaji: 'NIVEOUS // MOON',
    serial: 'NO. 0000',
    tplIdx: 0,
    boundUserId: ''
  };

  // ============ 核心自愈初始化 ============
  function initArchivePage() {
    var page = document.querySelector('[data-page="archive"]');
    if (!page) {
      page = document.createElement('div');
      page.className = 'page app-page';
      page.dataset.page = 'archive';
      page.innerHTML = '<div class="app-content" id="archiveContent"></div>';
      var pageContainer = document.getElementById('pageContainer');
      if (pageContainer) pageContainer.appendChild(page);
    }

    container = document.getElementById('archiveContent');
    if (!container) {
      page.innerHTML = '<div class="app-content" id="archiveContent"></div>';
      container = document.getElementById('archiveContent');
    }

    if (!container) return;
    loadAllData();
  }

  // 页面切换监听
  window.addEventListener('pageChange', function(e) {
    if (e.detail && e.detail.page === 'archive') {
      initArchivePage();
    }
  });

  // 启动与就绪双重保活
  if (window._dbReady) {
    initArchivePage();
  } else {
    window.addEventListener('dbReady', function() {
      initArchivePage();
    }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initArchivePage);
  } else {
    initArchivePage();
  }

  // ============ 展平读取逻辑（彻底消除嵌套死锁） ============
  function loadAllData() {
    if (!window.AppDB) {
      renderArchiveShell();
      return;
    }

    // 1. 读取用户列表
    AppDB.get(ARCHIVES_LIST_KEY, function(uList) {
      userList = Array.isArray(uList) ? uList : [];
      userList.forEach(function(u) {
        if (u.name) u.name = u.name.replace(/[✞✟✠]/g, '').trim();
        for (var i = 0; i < 5; i++) {
          if (!u['bio' + i]) {
            u['bio' + i] = (i === 0 && u.bio) ? u.bio : DEFAULT_BIOS[i];
          }
        }
      });
      userList = userList.filter(function(u) { return !u.id || !u.id.startsWith('char_'); });

      // 2. 读取用户激活ID
      AppDB.get(ACTIVE_USER_ID_KEY, function(activeUId) {
        currentUserId = activeUId;
        var activeUser = getCurrentUser();
        if (activeUser) {
          userTplIdx = activeUser.tplIdx || 0;
        } else if (userList.length > 0) {
          currentUserId = userList[0].id;
          userTplIdx = userList[0].tplIdx || 0;
        }

        // 3. 读取角色列表
        AppDB.get(CHAR_ARCHIVES_LIST_KEY, function(cList) {
          charList = Array.isArray(cList) ? cList : [];
          charList.forEach(function(c) {
            if (c.name) c.name = c.name.replace(/[✞✟✠]/g, '').trim();
            for (var j = 0; j < 5; j++) {
              if (!c['quote' + j]) {
                c['quote' + j] = (j === 0 && c.quote) ? c.quote : DEFAULT_CHAR_QUOTES[j];
              }
            }
          });
          charList = charList.filter(function(c) { return !c.id || !c.id.startsWith('user_'); });

          // 4. 读取角色激活ID
          AppDB.get(CHAR_ACTIVE_ID_KEY, function(activeCId) {
            currentCharId = activeCId;
            var activeChar = getCurrentChar();
            if (activeChar) {
              charTplIdx = activeChar.tplIdx || 0;
            } else if (charList.length > 0) {
              currentCharId = charList[0].id;
              charTplIdx = charList[0].tplIdx || 0;
            }

            renderArchiveShell();
          });
        });
      });
    });
  }

  function getActiveStore() {
    var isUser = (currentTab === 'user');
    return {
      isUser: isUser,
      list: isUser ? userList : charList,
      activeId: isUser ? currentUserId : currentCharId,
      tplIdx: isUser ? userTplIdx : charTplIdx,
      listKey: isUser ? ARCHIVES_LIST_KEY : CHAR_ARCHIVES_LIST_KEY,
      activeKey: isUser ? ACTIVE_USER_ID_KEY : CHAR_ACTIVE_ID_KEY,
      defaultObj: isUser ? defaultProfile : defaultCharProfile
    };
  }

  function getCurrentUser() {
    if (!currentUserId || !userList.length) return null;
    for (var i = 0; i < userList.length; i++) {
      if (userList[i].id === currentUserId) return userList[i];
    }
    return null;
  }

  function getCurrentChar() {
    if (!currentCharId || !charList.length) return null;
    for (var i = 0; i < charList.length; i++) {
      if (charList[i].id === currentCharId) return charList[i];
    }
    return null;
  }

  function getCurrentItem() {
    return currentTab === 'user' ? getCurrentUser() : getCurrentChar();
  }

  function saveCurrentToDB(callback) {
    if (!window.AppDB) return;
    var store = getActiveStore();
    AppDB.save(store.listKey, store.list, function() {
      AppDB.save(store.activeKey, store.activeId, function() {
        if (callback) callback();
      });
    });
  }

  function getTodayDateStr() {
    var now = new Date();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    return m + d;
  }

  function createNewItem() {
    var store = getActiveStore();
    var newObj = JSON.parse(JSON.stringify(store.defaultObj));
    newObj.id = (store.isUser ? 'user_' : 'char_') + Date.now();
    newObj.createDate = getTodayDateStr();
    newObj.serial = 'NO. 0000-NIVEOUS';
    store.list.push(newObj);

    if (store.isUser) {
      currentUserId = newObj.id;
      userTplIdx = 0;
    } else {
      currentCharId = newObj.id;
      charTplIdx = 0;
    }

    renderStep2();
  }

  function isCharBound(charId) {
    if (!charId) return false;
    var c = charList.find(function(x) { return x.id === charId; });
    return !!(c && c.boundUserId);
  }

  // ==========================================
  // 总外壳架构：玄月星盘 + 单层合并顶栏 + 星星绑定
  // ==========================================
  function renderArchiveShell() {
    if (!container) container = document.getElementById('archiveContent');
    if (!container) return;

    container.className = 'app-content archive-page-wrap';
    var isUser = (currentTab === 'user');
    var activeTpl = isUser ? userTplIdx : charTplIdx;
    
    var bgClass = 'screen-bg-' + activeTpl;
    if (!isUser) {
      if (activeTpl === 2) bgClass = 'char-screen-bg-2';
      else if (activeTpl === 3) bgClass = 'char-screen-bg-3';
    }

    container.innerHTML = '<div class="archive-page-screen ' + bgClass + '" id="archiveScreenRoot">'
      + '<div class="header-ornament-stage">'
      + '<div class="ornament-artwork-layer">'
      + '<div class="celestial-crescent-emblem">'
      + '<svg viewBox="0 0 100 100">'
      + '<circle cx="50" cy="50" r="44" stroke-width="0.7" stroke-dasharray="2 3.5" opacity="0.5"/>'
      + '<circle cx="50" cy="50" r="38" stroke-width="0.5" opacity="0.35"/>'
      + '<path d="M50 12 A38 38 0 1 0 88 50 A30 30 0 1 1 50 12 Z" stroke-width="1.1" opacity="0.85"/>'
      + '<path d="M63 42.5 L64.8 47 L69.5 48.8 L64.8 50.5 L63 55 L61.2 50.5 L56.5 48.8 L61.2 47 Z" fill="currentColor" stroke-width="0.4" opacity="0.9"/>'
      + '<circle cx="77" cy="29" r="1.3" fill="currentColor" opacity="0.65"/>'
      + '<circle cx="71" cy="19" r="0.9" fill="currentColor" opacity="0.48"/>'
      + '</svg>'
      + '</div>'
      + '<span class="art-star s1">✦</span><span class="art-star s3">✦</span>'
      + '<span class="art-crosshair c1">+</span>'
      + '</div>'

      // 单层合并顶栏
      + '<div class="archive-header">'
      + '<div class="archive-header-left">'
      + '<button class="arch-native-back" id="archShellBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '<h1 class="archive-title">档案</h1>'
      + '</div>'

      // 中间滑动胶囊
      + '<div class="archive-nav-capsule">'
      + '<div class="nav-glider-pill' + (currentTab === 'char' ? ' char-pos' : '') + '" id="navGlider"></div>'
      + '<button class="archive-nav-item' + (currentTab === 'user' ? ' active' : '') + '" id="tabUserBtn" type="button"><span>用户</span></button>'
      + '<button class="archive-nav-item' + (currentTab === 'char' ? ' active' : '') + '" id="tabCharBtn" type="button"><span>角色</span></button>'
      + '</div>'

      // 右侧按钮区
      + '<div class="archive-header-right">'
      + '<button class="arch-tool-pill bind-star-btn' + (isCharBound(currentCharId) ? ' is-bound' : '') + '" id="bindStarBtn" type="button" title="绑定专属用户">'
      + '<svg viewBox="0 0 24 24"><polygon points="12,2 15,9 22,12 15,15 12,22 9,15 2,12 9,9"/></svg>'
      + '</button>'
      + '<button class="arch-tool-pill menu-btn" id="actionMenuBtn" type="button">'
      + '<svg viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>'
      + '</button>'
      + '</div>'
      + '</div>'

      + '</div>'

      + '<div class="archive-showcase-wrap" id="archiveSubViewport"></div>'

      // 专属用户羁绊绑定抽屉
      + '<div class="user-drawer-mask" id="bindDrawerMask"></div>'
      + '<div class="user-drawer-card bind-drawer-card" id="bindDrawerCard">'
      + '<div class="drawer-header">'
      + '<div class="drawer-title">✦ 专属羁绊绑定 ✦</div>'
      + '<button class="drawer-close-btn" id="bindDrawerCloseBtn" type="button">✕</button>'
      + '</div>'
      + '<div class="drawer-list" id="bindUserListContent"></div>'
      + '</div>'

      + '</div>';

    document.getElementById('archShellBackBtn').addEventListener('click', function() {
      if (window.AppNav) AppNav.showPage('home');
    });

    var tabUserBtn = document.getElementById('tabUserBtn');
    var tabCharBtn = document.getElementById('tabCharBtn');
    var navGlider = document.getElementById('navGlider');

    tabUserBtn.addEventListener('click', function() {
      if (currentTab === 'user') return;
      syncDirectEdits(getCurrentItem());
      currentTab = 'user';
      tabUserBtn.classList.add('active');
      tabCharBtn.classList.remove('active');
      if (navGlider) navGlider.classList.remove('char-pos');
      updateBindStarStatus();
      renderSubContent();
    });

    tabCharBtn.addEventListener('click', function() {
      if (currentTab === 'char') return;
      syncDirectEdits(getCurrentItem());
      currentTab = 'char';
      tabCharBtn.classList.add('active');
      tabUserBtn.classList.remove('active');
      if (navGlider) navGlider.classList.add('char-pos');
      updateBindStarStatus();
      renderSubContent();
    });

    document.getElementById('actionMenuBtn').addEventListener('click', function() {
      var drawerMask = document.getElementById('userDrawerMask');
      var drawerCard = document.getElementById('userDrawerCard');
      if (drawerMask) drawerMask.classList.add('show');
      if (drawerCard) drawerCard.classList.add('show');
    });

    var bindStarBtn = document.getElementById('bindStarBtn');
    var bindDrawerMask = document.getElementById('bindDrawerMask');
    var bindDrawerCard = document.getElementById('bindDrawerCard');
    var bindDrawerCloseBtn = document.getElementById('bindDrawerCloseBtn');

    function closeBindDrawer() {
      if (bindDrawerMask) bindDrawerMask.classList.remove('show');
      if (bindDrawerCard) bindDrawerCard.classList.remove('show');
    }

    if (bindDrawerCloseBtn) bindDrawerCloseBtn.addEventListener('click', closeBindDrawer);
    if (bindDrawerMask) bindDrawerMask.addEventListener('click', closeBindDrawer);

    if (bindStarBtn) {
      bindStarBtn.addEventListener('click', function() {
        if (currentTab !== 'char') {
          if (window.AppNav) AppNav.showToast('✦ 切换到角色端即可绑定专属用户 ✦');
          return;
        }
        var curChar = getCurrentChar();
        if (!curChar) {
          if (window.AppNav) AppNav.showToast('请先录入角色设定哦');
          return;
        }
        
        var pureUsers = userList.filter(function(u) { return !u.id || !u.id.startsWith('char_'); });

        if (!pureUsers.length) {
          if (window.AppNav) AppNav.showToast('暂无用户设定，请在用户端新建档案');
          return;
        }

        var listWrap = document.getElementById('bindUserListContent');
        if (listWrap) {
          listWrap.innerHTML = pureUsers.map(function(u) {
            var isBoundToThis = (curChar.boundUserId === u.id);
            return '<div class="drawer-user-item' + (isBoundToThis ? ' active' : '') + '" data-bind-uid="' + u.id + '">'
              + '<div class="drawer-avatar">' + (u.photo ? '<img src="' + esc(u.photo) + '">' : '✦') + '</div>'
              + '<div class="drawer-user-info">'
              + '<div class="drawer-user-name">' + esc(u.name) + (isBoundToThis ? '<span class="drawer-active-tag">已绑定</span>' : '') + '</div>'
              + '<div class="drawer-user-date">' + esc(u.userid || '@NIVEOUSMOON') + '</div>'
              + '</div>'
              + '<button class="bind-select-btn' + (isBoundToThis ? ' is-cancel' : '') + '" type="button">' + (isBoundToThis ? '解除' : '绑定') + '</button>'
              + '</div>';
          }).join('');

          listWrap.querySelectorAll('.drawer-user-item').forEach(function(item) {
            item.addEventListener('click', function() {
              var targetUid = this.dataset.bindUid;
              var targetUser = userList.find(function(x){ return x.id === targetUid; });
              if (curChar.boundUserId === targetUid) {
                curChar.boundUserId = '';
                if (window.AppNav) AppNav.showToast('✦ 已解除与 [' + (targetUser ? targetUser.name : '该用户') + '] 的专属绑定 ✦');
              } else {
                curChar.boundUserId = targetUid;
                if (window.AppNav) AppNav.showToast('✦ 已将 [' + (curChar.name || '角色') + '] 专属绑定至 [' + (targetUser ? targetUser.name : '用户') + '] ✦');
              }
              saveCurrentToDB(function() {
                closeBindDrawer();
                updateBindStarStatus();
                renderSubContent();
              });
            });
          });
        }

        if (bindDrawerMask) bindDrawerMask.classList.add('show');
        if (bindDrawerCard) bindDrawerCard.classList.add('show');
      });
    }

    function updateBindStarStatus() {
      var btn = document.getElementById('bindStarBtn');
      if (!btn) return;
      if (currentTab === 'char' && isCharBound(currentCharId)) {
        btn.classList.add('is-bound');
      } else {
        btn.classList.remove('is-bound');
      }
    }

    renderSubContent();
  }

  function renderSubContent() {
    var subViewport = document.getElementById('archiveSubViewport');
    if (!subViewport) return;

    var store = getActiveStore();
    var cur = getCurrentItem();

    if (cur) {
      renderStep3(subViewport, cur);
    } else if (store.list.length > 0) {
      if (store.isUser) currentUserId = store.list[0].id;
      else currentCharId = store.list[0].id;
      renderStep3(subViewport, store.list[0]);
    } else {
      renderStep1(subViewport);
    }
  }

  // ==========================================
  // 步骤 1：空状态凝聚冰晶
  // ==========================================
  function renderStep1(subViewport) {
    var isUser = (currentTab === 'user');
    subViewport.innerHTML = '<div class="archive-step-panel step-active" id="archStep1">'
      + '<div class="empty-card-stage">'
      + '<div class="deco-cross tl">+</div><div class="deco-cross tr">+</div>'
      + '<div class="deco-cross bl">+</div><div class="deco-cross br">+</div>'
      + '<div class="empty-illustration-box">'
      + '<span class="empty-sparkle s1">✦</span><span class="empty-sparkle s2">✧</span>'
      + '<div class="empty-illustration-circle">'
      + '<svg class="frost-crystal-svg" viewBox="0 0 48 48">'
      + '<g class="crystal-core">'
      + '<circle cx="24" cy="24" r="1.5" fill="#18191c" />'
      + '<polygon points="24,19.5 28.5,24 24,28.5 19.5,24" class="crystal-stroke" />'
      + '<circle cx="24" cy="24" r="9" class="crystal-stroke" stroke-dasharray="1.5 2" stroke-width="0.8" opacity="0.6" />'
      + '</g>'
      + '<g class="crystal-spears crystal-stroke">'
      + '<polygon points="24,3 27,15 24,19.5 21,15" />'
      + '<polygon points="24,45 27,33 24,28.5 21,33" />'
      + '<polygon points="3,24 15,21 19.5,24 15,27" />'
      + '<polygon points="45,24 33,21 28.5,24 33,27" />'
      + '</g>'
      + '<g class="crystal-petals crystal-stroke">'
      + '<polygon points="35,13 36.5,19 30.5,20.5 29,14.5" />'
      + '<polygon points="13,13 14.5,19 20.5,20.5 19,14.5" />'
      + '<polygon points="35,35 36.5,29 30.5,27.5 29,33.5" />'
      + '<polygon points="13,35 14.5,29 20.5,27.5 19,33.5" />'
      + '</g>'
      + '<g class="crystal-sparkles">'
      + '<circle cx="24" cy="3" r="1" fill="#18191c" />'
      + '<circle cx="24" cy="45" r="1" fill="#18191c" />'
      + '<circle cx="3" cy="24" r="1" fill="#18191c" />'
      + '<circle cx="45" cy="24" r="1" fill="#18191c" />'
      + '</g>'
      + '</svg>'
      + '</div>'
      + '</div>'
      + '<h2 class="empty-title">' + (isUser ? '尚未建立用户档案' : '尚未建立角色档案') + '</h2>'
      + '<p class="empty-desc">' + (isUser ? '记录你的专属身份与高定立绘' : '记录Ta的专属身份与高定立绘') + '</p>'
      + '<button class="action-trigger-btn" id="goToStep2Btn" type="button">'
      + '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
      + '<span>' + (isUser ? '新建USER设定' : '新建CHAR设定') + '</span>'
      + '</button>'
      + '</div>'
      + '</div>';

    var root = document.getElementById('archiveScreenRoot');
    if (root) {
      var s1StartX = 0, s1StartY = 0, s1EndX = 0, s1EndY = 0;
      root.addEventListener('touchstart', function(e) {
        s1StartX = e.touches[0].clientX;
        s1StartY = e.touches[0].clientY;
        s1EndX = s1StartX;
        s1EndY = s1StartY;
      }, { passive: true });

      root.addEventListener('touchmove', function(e) {
        s1EndX = e.touches[0].clientX;
        s1EndY = e.touches[0].clientY;
      }, { passive: true });

      root.addEventListener('touchend', function() {
        var diffX = s1EndX - s1StartX;
        var diffY = s1EndY - s1StartY;
        if (diffX > 35 && Math.abs(diffX) > Math.abs(diffY)) {
          if (window.AppNav) AppNav.showPage('home');
        }
      });
    }

    document.getElementById('goToStep2Btn').addEventListener('click', function() {
      createNewItem();
    });
  }

  // ==========================================
  // 步骤 2：手账录入填单
  // ==========================================
  var step2BackHandler = null;

  function renderStep2() {
    var isUser = (currentTab === 'user');
    var store = getActiveStore();
    var cur = getCurrentItem() || store.defaultObj;

    container.className = 'app-content archive-page-wrap';
    container.innerHTML = '<div class="archive-page-screen screen-bg-0">'
      + '<div class="archive-step-panel step-active" id="archStep2">'
      + '<div class="journal-sheet">'
      
      + '<div class="journal-header">'
      + '<div class="journal-header-top">'
      + '<div class="journal-header-top-left">'
      + '<button class="journal-inline-back" id="archBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '<span class="brand-confidential">RECORD // ' + (isUser ? 'ARCHIVE' : 'CHARACTER') + '</span>'
      + '</div>'
      + '<span class="brand-serial">创檔日期：' + esc(cur.createDate || getTodayDateStr()) + '</span>'
      + '</div>'
      + '<h1 class="journal-main-title">档案录入</h1>'
      + '<p class="journal-desc-text">墨已研就，且借一纸，写作众生相</p>'
      + '<div class="journal-header-divider"><span class="divider-line"></span><span class="divider-star">✦</span><span class="divider-line"></span></div>'
      + '</div>'

      // 01. 基础设定
      + '<div class="journal-section">'
      + '<div class="section-lead-title"><div class="section-name"><span class="sec-index">01.</span><span>基础设定</span></div><span class="section-tag-en">IDENTITY</span></div>'
      + '<div class="ruled-row-grid">'
      + '<div class="ruled-item"><span class="ruled-label">' + (isUser ? '姓名 / 昵称' : '角色姓名') + '</span><input type="text" class="ruled-input" id="fieldName" value="' + esc(cur.name) + '" placeholder=""></div>'
      + '<div class="ruled-item"><span class="ruled-label">性别</span><input type="text" class="ruled-input" id="fieldGender" value="' + esc(cur.gender) + '" placeholder=""></div>'
      + '<div class="ruled-item"><span class="ruled-label">年龄</span><input type="text" class="ruled-input" id="fieldAge" value="' + esc(cur.age) + '" placeholder=""></div>'
      + '<div class="ruled-item"><span class="ruled-label">身高</span><input type="text" class="ruled-input" id="fieldHeight" value="' + esc(cur.height) + '" placeholder=""></div>'
      + '<div class="ruled-item"><span class="ruled-label">生日</span><input type="text" class="ruled-input" id="fieldBirthday" value="' + esc(cur.birthday) + '" placeholder=""></div>'
      + '<div class="ruled-item"><span class="ruled-label">星座</span><input type="text" class="ruled-input" id="fieldZodiac" value="' + esc(cur.zodiac) + '" placeholder=""></div>'
      + '</div>'
      + '</div>'

      // 02. 外貌长相
      + '<div class="journal-section">'
      + '<div class="section-lead-title">'
      + '<div class="section-name"><span class="sec-index">02.</span><span>外貌长相与气质</span></div>'
      + '<div class="section-lead-right">'
      + '<span class="section-tag-en">APPEARANCE</span>'
      + '<button class="expand-edit-btn" data-expand-target="fieldAppearance" data-expand-title="02. 外貌长相与气质" type="button" title="扩大编辑">'
      + '<svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
      + '</button>'
      + '</div>'
      + '</div>'
      + '<textarea class="ruled-textarea" id="fieldAppearance" rows="2" placeholder="发型、眸色、五官气质、穿搭风格、身形特点...">' + esc(cur.appearance) + '</textarea>'
      + '</div>'

      // 03. 性格特质
      + '<div class="journal-section">'
      + '<div class="section-lead-title">'
      + '<div class="section-name"><span class="sec-index">03.</span><span>性格特质与言行语气</span></div>'
      + '<div class="section-lead-right">'
      + '<span class="section-tag-en">PERSONALITY</span>'
      + '<button class="expand-edit-btn" data-expand-target="fieldPersonality" data-expand-title="03. 性格特质与言行语气" type="button" title="扩大编辑">'
      + '<svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
      + '</button>'
      + '</div>'
      + '</div>'
      + '<div class="ruled-item compact-item"><span class="ruled-label">专属标签</span><input type="text" class="ruled-input" id="fieldTags" value="' + esc(cur.tags) + '" placeholder="多个关键词用空格或逗号分隔"></div>'
      + '<textarea class="ruled-textarea" id="fieldPersonality" rows="2" placeholder="日常性格表现、说话习惯、专属的互动方式与情绪特点...">' + esc(cur.personality) + '</textarea>'
      + '</div>'

      // 04. 兴趣爱好
      + '<div class="journal-section">'
      + '<div class="section-lead-title">'
      + '<div class="section-name"><span class="sec-index">04.</span><span>日常习惯与喜好偏好</span></div>'
      + '<div class="section-lead-right">'
      + '<span class="section-tag-en">HOBBIES & LIKES</span>'
      + '<button class="expand-edit-btn" data-expand-target="fieldHobbies" data-expand-title="04. 日常习惯与喜好偏好" type="button" title="扩大编辑">'
      + '<svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
      + '</button>'
      + '</div>'
      + '</div>'
      + '<textarea class="ruled-textarea" id="fieldHobbies" rows="2" placeholder="喜欢的食物、日常兴趣爱好、喜恶偏好、特殊习惯...">' + esc(cur.hobbies) + '</textarea>'
      + '</div>'

      // 05. 深度背景
      + '<div class="journal-section">'
      + '<div class="section-lead-title">'
      + '<div class="section-name"><span class="sec-index">05.</span><span>深度设定与故事渊源</span></div>'
      + '<div class="section-lead-right">'
      + '<span class="section-tag-en">BACKGROUND & LORE</span>'
      + '<button class="expand-edit-btn" data-expand-target="fieldBackground" data-expand-title="05. 深度设定与故事渊源" type="button" title="扩大编辑">'
      + '<svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
      + '</button>'
      + '</div>'
      + '</div>'
      + '<textarea class="ruled-textarea" id="fieldBackground" rows="3" placeholder="身份背景、过往经历、故事渊源与深度设定...">' + esc(cur.background) + '</textarea>'
      + '</div>'

      + '<div class="journal-tear-strip">'
      + '<div class="journal-sign-box"><span class="sign-handwriting">✦ Verified Official Dossier</span></div>'
      + '<div class="journal-seal-stamp"><span>NIVEOUS</span><span>OFFICIAL</span></div>'
      + '</div>'

      + '<button class="action-trigger-btn save-seal-btn" id="generateCardBtn" type="button">'
      + '<span> 封存 </span>'
      + '</button>'
      + '</div>'
      + '</div>'

      // 全屏手写板弹窗
      + '<div class="expand-modal-overlay" id="expandModalOverlay">'
      + '<div class="expand-modal-panel">'
      + '<div class="expand-modal-header">'
      + '<button class="expand-modal-back" id="expandModalCancelBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '<div class="expand-modal-title" id="expandModalTitle">深度手札编辑</div>'
      + '<button class="expand-modal-done" id="expandModalDoneBtn" type="button">完成</button>'
      + '</div>'
      + '<div class="expand-modal-body">'
      + '<textarea class="expand-modal-textarea" id="expandModalTextarea" placeholder="在这里尽情书写..."></textarea>'
      + '</div>'
      + '<div class="expand-modal-footer">'
      + '<div class="expand-word-count" id="expandWordCount">0 字</div>'
      + '<button class="expand-clear-btn" id="expandClearBtn" type="button">清空文本</button>'
      + '</div>'
      + '</div>'
      + '</div>'

      + '</div>';

    var originalSnapshot = JSON.stringify({
      name: cur.name || '', gender: cur.gender || '', age: cur.age || '', height: cur.height || '', birthday: cur.birthday || '', zodiac: cur.zodiac || '',
      appearance: cur.appearance || '', personality: cur.personality || '', tags: cur.tags || '', hobbies: cur.hobbies || '', background: cur.background || ''
    });

    function exitWithoutSaving() {
      var store = getActiveStore();
      if (store.list.length > 0 && cur.name && cur.name !== '') {
        renderArchiveShell();
      } else if (store.list.length > 0) {
        if (store.isUser) {
          userList = userList.filter(function(u) { return u.id !== cur.id; });
          if (userList.length) currentUserId = userList[0].id;
        } else {
          charList = charList.filter(function(c) { return c.id !== cur.id; });
          if (charList.length) currentCharId = charList[0].id;
        }
        renderArchiveShell();
      } else {
        renderArchiveShell();
      }
    }

    step2BackHandler = function() {
      var modal = document.getElementById('expandModalOverlay');
      if (modal && modal.classList.contains('show')) {
        handleModalCloseAttempt();
        return;
      }

      var currentSnapshot = JSON.stringify({
        name: (document.getElementById('fieldName') ? document.getElementById('fieldName').value : '').replace(/[✞✟✠]/g, ''),
        gender: (document.getElementById('fieldGender') ? document.getElementById('fieldGender').value : ''),
        age: (document.getElementById('fieldAge') ? document.getElementById('fieldAge').value : ''),
        height: (document.getElementById('fieldHeight') ? document.getElementById('fieldHeight').value : ''),
        birthday: (document.getElementById('fieldBirthday') ? document.getElementById('fieldBirthday').value : ''),
        zodiac: (document.getElementById('fieldZodiac') ? document.getElementById('fieldZodiac').value : ''),
        appearance: (document.getElementById('fieldAppearance') ? document.getElementById('fieldAppearance').value : ''),
        personality: (document.getElementById('fieldPersonality') ? document.getElementById('fieldPersonality').value : ''),
        tags: (document.getElementById('fieldTags') ? document.getElementById('fieldTags').value : ''),
        hobbies: (document.getElementById('fieldHobbies') ? document.getElementById('fieldHobbies').value : ''),
        background: (document.getElementById('fieldBackground') ? document.getElementById('fieldBackground').value : '')
      });

      if (originalSnapshot !== currentSnapshot) {
        if (window.AppDialog) {
          AppDialog.confirm({
            title: '提示',
            desc: '检测到手札内容已修改，是否保存？',
            confirmText: '保存'
          }, function() {
            var nameVal = (document.getElementById('fieldName') ? document.getElementById('fieldName').value : '').replace(/[✞✟✠]/g, '');
            if (!nameVal.trim()) { if (window.AppNav) AppNav.showToast('请在第一栏写下姓名哦'); return; }
            saveFormDataToCur(cur);
            saveCurrentToDB(function() { renderArchiveShell(); });
          }, function() {
            exitWithoutSaving();
          });
          return;
        }
      }

      exitWithoutSaving();
    };

    document.getElementById('archBackBtn').addEventListener('click', step2BackHandler);

    function saveFormDataToCur(target) {
      target.name = (document.getElementById('fieldName').value || '').replace(/[✞✟✠]/g, '');
      target.gender = document.getElementById('fieldGender').value || '';
      target.age = document.getElementById('fieldAge').value || '';
      target.height = document.getElementById('fieldHeight').value || '';
      target.birthday = document.getElementById('fieldBirthday').value;
      target.zodiac = document.getElementById('fieldZodiac').value || '';
      target.appearance = document.getElementById('fieldAppearance').value;
      target.personality = document.getElementById('fieldPersonality').value;
      target.tags = document.getElementById('fieldTags').value;
      target.hobbies = document.getElementById('fieldHobbies').value;
      target.background = document.getElementById('fieldBackground').value;
      if (target.birthday) {
        var cleanDigits = target.birthday.replace(/[^0-9]/g, '');
        target.serial = 'NO. ' + (cleanDigits || target.birthday) + '-NIVEOUS';
      }
    }

    var currentTargetFieldId = '';
    var modalOriginalText = '';
    var modalOverlay = document.getElementById('expandModalOverlay');
    var modalTitle = document.getElementById('expandModalTitle');
    var modalTextarea = document.getElementById('expandModalTextarea');
    var modalDoneBtn = document.getElementById('expandModalDoneBtn');
    var modalCancelBtn = document.getElementById('expandModalCancelBtn');
    var wordCount = document.getElementById('expandWordCount');
    var clearBtn = document.getElementById('expandClearBtn');

    function updateWordCount() {
      if (wordCount && modalTextarea) wordCount.textContent = modalTextarea.value.length + ' 字';
    }

    function openExpandModal(fieldId, titleText) {
      currentTargetFieldId = fieldId;
      var targetInput = document.getElementById(fieldId);
      if (modalTitle) modalTitle.textContent = titleText || '深度手札编辑';
      if (modalTextarea) {
        modalTextarea.value = targetInput ? targetInput.value : '';
        modalOriginalText = modalTextarea.value;
        updateWordCount();
      }
      if (modalOverlay) modalOverlay.classList.add('show');
      setTimeout(function() { if (modalTextarea) modalTextarea.focus(); }, 300);
    }

    function closeExpandModal() {
      if (modalOverlay) modalOverlay.classList.remove('show');
      currentTargetFieldId = '';
      modalOriginalText = '';
    }

    function handleModalCloseAttempt() {
      if (modalTextarea && modalTextarea.value !== modalOriginalText) {
        if (window.AppDialog) {
          AppDialog.confirm({
            title: '提示',
            desc: '检测到手写板内容已修改，是否保存？',
            confirmText: '保存'
          }, function() {
            if (currentTargetFieldId) {
              var targetInput = document.getElementById(currentTargetFieldId);
              if (targetInput && modalTextarea) targetInput.value = modalTextarea.value;
            }
            closeExpandModal();
          }, function() {
            closeExpandModal();
          });
          return;
        }
      }
      closeExpandModal();
    }

    document.querySelectorAll('.expand-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        openExpandModal(this.dataset.expandTarget, this.dataset.expandTitle);
      });
    });

    if (modalTextarea) modalTextarea.addEventListener('input', updateWordCount);

    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        if (!modalTextarea) return;
        if (window.AppDialog) {
          AppDialog.confirm({
            title: '提示',
            desc: '确定要清空当前输入的内容吗？',
            confirmText: '清空',
            isDanger: true
          }, function() {
            modalTextarea.value = '';
            updateWordCount();
            modalTextarea.focus();
          });
        }
      });
    }

    if (modalDoneBtn) {
      modalDoneBtn.addEventListener('click', function() {
        if (currentTargetFieldId) {
          var targetInput = document.getElementById(currentTargetFieldId);
          if (targetInput && modalTextarea) targetInput.value = modalTextarea.value;
        }
        closeExpandModal();
      });
    }

    if (modalCancelBtn) {
      modalCancelBtn.addEventListener('click', handleModalCloseAttempt);
    }

    document.getElementById('generateCardBtn').addEventListener('click', function() {
      var nameVal = (document.getElementById('fieldName').value || '').replace(/[✞✟✠]/g, '');
      if (!nameVal.trim()) { if (window.AppNav) AppNav.showToast('请在第一栏写下姓名哦'); return; }
      saveFormDataToCur(cur);
      saveCurrentToDB(function() { renderArchiveShell(); });
    });
  }

  (function initGlobalSwipeInterceptor() {
    var touchStartX = 0, touchStartY = 0, touchCurX = 0, touchCurY = 0;
    var isIntercepting = false;

    window.addEventListener('touchstart', function(e) {
      var step2 = document.getElementById('archStep2');
      if (!step2 || !step2.classList.contains('step-active')) { isIntercepting = false; return; }
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchCurX = touchStartX;
      touchCurY = touchStartY;
      isIntercepting = true;
      if (touchStartX <= 60) e.stopPropagation();
    }, { capture: true, passive: true });

    window.addEventListener('touchmove', function(e) {
      if (!isIntercepting) return;
      touchCurX = e.touches[0].clientX;
      touchCurY = e.touches[0].clientY;
      var diffX = touchCurX - touchStartX;
      var diffY = touchCurY - touchStartY;
      if (diffX > 10 && diffX > Math.abs(diffY)) e.stopPropagation();
    }, { capture: true, passive: true });

    window.addEventListener('touchend', function(e) {
      if (!isIntercepting) return;
      isIntercepting = false;
      var diffX = touchCurX - touchStartX;
      var diffY = touchCurY - touchStartY;
      if (diffX > 50 && diffX > Math.abs(diffY) * 1.2) {
        e.stopPropagation();
        if (typeof step2BackHandler === 'function') step2BackHandler();
      }
    }, { capture: true, passive: true });
  })();

  // ==========================================
  // 步骤 3：卡片展示与管理
  // ==========================================
  function renderStep3(subViewport, cur) {
    if (cur.name) cur.name = cur.name.replace(/[✞✟✠]/g, '');
    var hasPhotoClass = cur.photo ? ' has-img' : '';
    var isUser = (currentTab === 'user');
    var activeTpl = isUser ? userTplIdx : charTplIdx;
    var store = getActiveStore();

    var cardHtml = isUser ? renderUserCardHtml(cur, activeTpl, hasPhotoClass) : renderCharCardHtml(cur, activeTpl, hasPhotoClass);

    subViewport.innerHTML = '<div class="archive-full-card-box" id="cardContainerBox">'
      + cardHtml
      + '</div>'
      + '<div class="archive-bottom-dock">'
      + '<button class="dock-arrow-btn" id="prevTplBtn" type="button"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>'
      + '<button class="dock-edit-btn" id="dockEditBtn" type="button"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg><span>' + (isUser ? '编辑资料' : '编辑角色资料') + '</span></button>'
      + '<button class="dock-arrow-btn" id="nextTplBtn" type="button"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>'
      + '</div>'

      // 专属抽屉
      + '<div class="user-drawer-mask" id="userDrawerMask"></div>'
      + '<div class="user-drawer-card" id="userDrawerCard">'
      + '<div class="drawer-header">'
      + '<div class="drawer-title">' + (isUser ? '用户档案库' : '角色档案库') + ' (' + store.list.length + ')</div>'
      + '<div class="drawer-header-actions">'
      + '<button class="drawer-new-btn" id="drawerNewUserBtn" type="button"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>新建</span></button>'
      + '<button class="drawer-close-btn" id="drawerCloseBtn" type="button">✕</button>'
      + '</div>'
      + '</div>'
      + '<div class="drawer-list">'
      + (isUser 
          ? userList.filter(function(u){ return !u.id || !u.id.startsWith('char_'); })
          : charList.filter(function(c){ return !c.id || !c.id.startsWith('user_'); })
        ).map(function(item) {
          var isActive = item.id === cur.id;
          
          var boundCoupleHtml = '';
          var heartPulseSvg = '<div class="drawer-heart-pulse-svg">'
            + '<svg viewBox="0 0 64 64" fill="none">'
            + '<path d="M4 34H14L18 26L23 42L28 20L33 38L37 30H44" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'
            + '<path d="M52 28C52 25 50 23 48 23C46 23 44.5 25 44.5 25C44.5 25 43 23 41 23C39 23 37 25 37 28C37 32 44.5 37 44.5 37C44.5 37 52 32 52 28Z" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
            + '<line x1="44" y1="34" x2="46" y2="34" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'
            + '<line x1="43" y1="34" x2="60" y2="34" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'
            + '</svg>'
            + '</div>';

          if (isUser) {
            var boundChars = charList.filter(function(c) { return c.boundUserId === item.id; });
            if (boundChars.length > 0) {
              var charsAvatarsHtml = boundChars.map(function(c) {
                return '<div class="drawer-avatar bound-target" title="专属守护: ' + esc(c.name) + '">'
                  + (c.photo ? '<img src="' + esc(c.photo) + '">' : '✦')
                  + '</div>';
              }).join('');

              boundCoupleHtml = '<div class="drawer-couple-binding">'
                + heartPulseSvg
                + '<div class="drawer-multi-bound-avatars">' + charsAvatarsHtml + '</div>'
                + '</div>';
            }
          } else {
            var boundUser = userList.find(function(u) { return u.id === item.boundUserId; });
            if (boundUser) {
              boundCoupleHtml = '<div class="drawer-couple-binding">'
                + heartPulseSvg
                + '<div class="drawer-avatar bound-target" title="专属用户: ' + esc(boundUser.name) + '">'
                + (boundUser.photo ? '<img src="' + esc(boundUser.photo) + '">' : '✦')
                + '</div>'
                + '</div>';
            }
          }

          return '<div class="drawer-user-item' + (isActive ? ' active' : '') + '" data-user-id="' + item.id + '">'
            + '<div class="drawer-avatar">' + (item.photo ? '<img src="' + esc(item.photo) + '">' : '✦') + '</div>'
            + '<div class="drawer-user-info">'
            + '<div class="drawer-user-name"><span>' + esc(item.name) + '</span>' + (isActive ? '<span class="drawer-active-tag">当前</span>' : '') + '</div>'
            + '<div class="drawer-user-date">建档：' + esc(item.createDate || '0000') + '</div>'
            + '</div>'
            + boundCoupleHtml
            + '<button class="drawer-del-btn" data-del-id="' + item.id + '" type="button">删除</button>'
            + '</div>';
        }).join('')
      + '</div>'
      + '</div>';

    var root = document.getElementById('archiveScreenRoot');
    if (root) {
      if (isUser) {
        root.className = 'archive-page-screen screen-bg-' + userTplIdx;
      } else {
        if (charTplIdx === 2) root.className = 'archive-page-screen char-screen-bg-2';
        else if (charTplIdx === 3) root.className = 'archive-page-screen char-screen-bg-3';
        else root.className = 'archive-page-screen screen-bg-' + charTplIdx;
      }
    }

    bindStep3Events(cur);
  }

  // ==========================================
  // 用户 5 款卡片 HTML
  // ==========================================
  function renderUserCardHtml(cur, tplIdx, hasPhotoClass) {
    if (tplIdx === 0) {
      return '<div class="arch-card-wrapper t1-wrapper">'
        + '<div class="t1-inner">'
        + '<div class="t1-header">'
        + '<div>'
        + '<div class="t1-serial" id="cardSerial" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.serial) + '</div>'
        + '<div class="t1-title" data-field="u1Title" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u1Title || 'MEMORIES ✦') + '</div>'
        + '</div>'
        + '<div class="t1-stamp" data-field="u1Stamp" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u1Stamp || '★ SPECIAL') + '</div>'
        + '</div>'
        + '<div class="t1-body">'
        + '<div class="t1-left-rail"><div class="t1-qr-icon"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="14" y="3" width="7" height="7" stroke="currentColor" width="1.5" fill="none"/><rect x="3" y="14" width="7" height="7" stroke="currentColor" width="1.5" fill="none"/><rect x="15" y="15" width="5" height="5" fill="currentColor"/></svg></div><div class="t1-barcode-lines"><div class="t1-bline thick"></div><div class="t1-bline thin"></div><div class="t1-bline"></div><div class="t1-bline thick"></div><div class="t1-bline"></div><div class="t1-bline thin"></div><div class="t1-bline thick"></div></div><div class="t1-vertical-code" data-field="u1VertCode" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u1VertCode || 'LUCKY-TODAY') + '</div></div>'
        + '<div class="t1-photo-stage' + hasPhotoClass + '" id="cardPhotoBtn"><img id="cardPhotoImg" src="' + esc(cur.photo) + '" alt="立绘"><div class="t1-photo-empty"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>上传立绘</span></div></div>'
        + '<div class="t1-right-rail"><span class="t1-star">✦</span><span class="t1-dash"></span><span class="t1-rail-dot"></span><span class="t1-star">✧</span><span class="t1-rail-dot"></span><span class="t1-dash"></span><span class="t1-star">✦</span></div>'
        + '</div>'
        + '<div class="t1-footer"><div class="t1-cutout-left"></div><div class="t1-cutout-right"></div>'
        + '<div class="t1-user-row"><div class="t1-username" id="cardName" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.name) + '</div><div class="t1-userid" id="cardUserId" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.userid) + '</div></div>'
        + '<div class="t1-bio" id="cardBio" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.bio0 || DEFAULT_BIOS[0]) + '</div>'
        + '<div class="t1-tags"><span class="t1-tag primary" id="cardTag1" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.tag1) + '</span><span class="t1-tag" id="cardTag2" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.tag2) + '</span><span class="t1-tag" id="cardTag3" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.tag3) + '</span></div>'
        + '</div></div></div>';
    } else if (tplIdx === 1) {
      return '<div class="arch-card-wrapper t2-wrapper">'
        + '<div class="t2-ribbon-tr">✦ SPECIAL</div><div class="t2-ribbon-bl">✦ MEMORIES</div><div class="t2-top-ring"></div>'
        + '<div class="t2-frame"><div class="t2-cross tl">+</div><div class="t2-cross tr">+</div><div class="t2-cross bl">+</div><div class="t2-cross br">+</div>'
        + '<div class="t2-top-bar"><div class="t2-icons" data-field="u2Icons" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u2Icons || '♡ ★ ♪ ☆') + '</div><div class="t2-brand" data-field="u2Brand" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u2Brand || 'NIVEOUS ARCHIVE') + '</div></div>'
        + '<div class="t2-photo-stage' + hasPhotoClass + '" id="cardPhotoBtn"><img id="cardPhotoImg" src="' + esc(cur.photo) + '" alt="立绘"><div class="t1-photo-empty"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>上传立绘</span></div><div class="t2-music-pill"><div class="t2-music-wave"><div class="t2-wave-bar"></div><div class="t2-wave-bar"></div><div class="t2-wave-bar"></div></div><span data-field="u2Playing" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u2Playing || 'PLAYING') + '</span></div></div>'
        + '<div class="t2-footer"><div class="t2-user-row"><div class="t2-username" id="cardName" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.name) + '</div><div class="t2-stars" data-field="u2Stars" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u2Stars || '✦ ✦ ✦') + '</div></div>'
        + '<div class="t2-bio" id="cardBio" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.bio1 || DEFAULT_BIOS[1]) + '</div>'
        + '<div class="t2-barcode-deck"><div class="t2-barcode-wrap"><div class="t2-graphic"><div class="t2-bar w2"></div><div class="t2-bar"></div><div class="t2-bar w3"></div><div class="t2-bar"></div><div class="t2-bar w2"></div><div class="t2-bar"></div></div><span class="t2-digits" data-field="u2Digits" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u2Digits || '4 892019 330219') + '</span></div><div class="t2-tag" data-field="u2Tag" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u2Tag || 'SPECIAL EDITION') + '</div></div>'
        + '</div></div></div>';
    } else if (tplIdx === 2) {
      return '<div class="arch-card-wrapper t3-wrapper">'
        + '<div class="t3-perfs-left"><div class="t3-perf-hole"></div><div class="t3-perf-hole"></div><div class="t3-perf-hole"></div><div class="t3-perf-hole"></div><div class="t3-perf-hole"></div><div class="t3-perf-hole"></div></div>'
        + '<div class="t3-perfs-right"><div class="t3-perf-hole"></div><div class="t3-perf-hole"></div><div class="t3-perf-hole"></div><div class="t3-perf-hole"></div><div class="t3-perf-hole"></div><div class="t3-perf-hole"></div></div>'
        + '<div class="t3-inner-box"><div class="t3-header-row"><div class="t3-postmark"><div class="t3-pm-circle" data-field="u3Postmark" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u3Postmark || 'PARIS') + '</div><div class="t3-pm-lines"><div class="t3-pm-line"></div><div class="t3-pm-line"></div></div></div><div class="t3-tag-text" data-field="u3TagText" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u3TagText || 'LETTRE D\'AMOUR') + '</div></div>'
        + '<div class="t3-photo-stage' + hasPhotoClass + '" id="cardPhotoBtn"><img id="cardPhotoImg" src="' + esc(cur.photo) + '" alt="立绘"><div class="t1-photo-empty"><svg viewBox="0 0 24 24"><rect x="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>上传立绘</span></div><div class="t3-photo-tag" data-field="u3PhotoTag" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u3PhotoTag || ('NO. ' + (cur.birthday || '0000'))) + '</div></div>'
        + '<div class="t3-footer-body"><div style="display:flex; justify-content:space-between; align-items:baseline;"><div class="t3-username" id="cardName" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.name) + '</div><div class="t3-serial">POSTAGE</div></div>'
        + '<div class="t3-bio" id="cardBio" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.bio2 || DEFAULT_BIOS[2]) + '</div>'
        + '<div class="t3-bottom-deck"><div class="t3-french-tags"><span class="t3-french-quote" data-field="u3FrenchQuote" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u3FrenchQuote || '« Pour toujours et à jamais »') + '</span><div class="t3-chips"><span class="t3-chip" data-field="u3Chip1" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u3Chip1 || '燕麦手作') + '</span><span class="t3-chip" data-field="u3Chip2" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u3Chip2 || '典藏信笺') + '</span></div></div><div class="t3-wax-seal"><div class="t3-wax-inner" data-field="u3WaxInner" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u3WaxInner || '✦') + '</div></div></div>'
        + '</div></div></div>';
    } else if (tplIdx === 3) {
      return '<div class="arch-card-wrapper t4-wrapper">'
        + '<div class="t4-inner-frame"><div class="t4-cross tl">✟</div><div class="t4-cross tr">✟</div><div class="t4-cross bl">✟</div><div class="t4-cross br">✟</div>'
        + '<div class="t4-header"><div class="t4-title-wrap"><span>✠</span><span class="t4-title" data-field="u4Title" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u4Title || 'SANCTUARY') + '</span></div><div class="t4-stamp" data-field="u4Stamp" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u4Stamp || ('ROSE · ' + (cur.birthday || '0000'))) + '</div></div>'
        + '<div class="t4-arch-stage' + hasPhotoClass + '" id="cardPhotoBtn"><div class="t4-arch-overlay" data-field="u4Overlay" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u4Overlay || '✦ ETERNAL ✦') + '</div><img id="cardPhotoImg" src="' + esc(cur.photo) + '" alt="立绘"><div class="t1-photo-empty"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>上传立绘</span></div></div>'
        + '<div class="t4-footer-body"><div style="display:flex; justify-content:space-between; align-items:baseline;"><div class="t4-username" id="cardName" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.name) + '</div><div class="t4-serial"></div></div>'
        + '<div class="t4-bio" id="cardBio" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.bio3 || DEFAULT_BIOS[3]) + '</div>'
        + '<div class="t4-plague-bar" data-field="u4Plague" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u4Plague || '✟ SACRED OATH · IN PERPETUUM ✟') + '</div>'
        + '<div class="t4-stats-matrix"><div class="t4-stat-box"><span class="t4-stat-label">DEVOTION</span><span class="t4-stat-val" data-field="u4Stat1" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u4Stat1 || '纯粹') + '</span></div><div class="t4-stat-box"><span class="t4-stat-label">BOUND</span><span class="t4-stat-val" data-field="u4Stat2" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u4Stat2 || '灵魂共鸣') + '</span></div><div class="t4-stat-box"><span class="t4-stat-label">STATUS</span><span class="t4-stat-val" data-field="u4Stat3" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u4Stat3 || '永恒') + '</span></div></div>'
        + '</div></div></div>';
    } else {
      return '<div class="arch-card-wrapper t5-wrapper">'
        + '<div class="t5-sprockets"><div class="t5-hole"></div><div class="t5-hole"></div><span class="t5-sprocket-code" data-field="u5Sprocket" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u5Sprocket || '▶ NIVEOUS 35mm') + '</span><div class="t5-hole"></div><div class="t5-hole"></div></div>'
        + '<div class="t5-header-bar"><div class="t5-scene"><span class="t5-dot"></span><span data-field="u5Scene" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u5Scene || 'SCENE 01') + '</span></div><span class="t5-fps" data-field="u5Fps" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u5Fps || 'ISO 400 · 24 FPS') + '</span></div>'
        + '<div class="t5-frame-stage' + hasPhotoClass + '" id="cardPhotoBtn"><span class="t5-edge-mark" data-field="u5EdgeMark" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u5EdgeMark || 'SAFETY FILM ★') + '</span><img id="cardPhotoImg" src="' + esc(cur.photo) + '" alt="立绘"><div class="t1-photo-empty"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>上传立绘</span></div></div>'
        + '<div class="t5-footer-wrap">'
        + '<div class="t5-username-row"><div class="t5-username" id="cardName" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.name) + '</div><span class="t5-director" data-field="u5Director" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u5Director || 'PROD. BY STAR') + '</span></div>'
        + '<div class="t5-subtitles-box">'
        + '<div class="t5-sub-cn" id="cardBio" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.bio4 || DEFAULT_BIOS[4]) + '</div>'
        + '<div class="t5-sub-en" data-field="u5SubEn" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u5SubEn || '"In every frame of this endless reel, you are my only focus."') + '</div>'
        + '</div>'
        + '<div class="t5-stub">'
        + '<div style="display:flex; align-items:center; gap:6px;">'
        + '<span class="t5-admit-pill" data-field="u5Admit" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u5Admit || 'ADMIT ONE') + '</span>'
        + '<span style="font-size:8.5px; color:#a0aec0; font-family:monospace;" data-field="u5Seat" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u5Seat || 'SEAT: VIP') + '</span>'
        + '</div>'
        + '<span style="font-size:8px; color:#828a94; font-family:monospace;" data-field="u5FilmNo" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u5FilmNo || '№ 0000-FILM') + '</span>'
        + '</div>'
        + '</div>'
        + '<div class="t5-sprockets" style="margin-top:2px;"><div class="t5-hole"></div><div class="t5-hole"></div><span class="t5-sprocket-code" data-field="u5SprocketBottom" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.u5SprocketBottom || 'KODAK FRAME 24A') + '</span><div class="t5-hole"></div><div class="t5-hole"></div></div>'
        + '</div>';
    }
  }

  // ==========================================
  // 角色 5 款卡片 HTML
  // ==========================================
  function renderCharCardHtml(cur, tplIdx, hasPhotoClass) {
    if (tplIdx === 0) {
      return '<div class="char-card-base theme-archive">'
        + '<div class="card-bg-dots"></div>'
        + '<div class="card-top-bar">'
        + '<div class="card-serial" id="cardSerial" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.serial || 'NO. 92WOB007STZT') + '</div>'
        + '<div class="card-brand" data-field="c1Brand" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c1Brand || 'NIVEOUS ARCHIVE') + '</div>'
        + '</div>'
        + '<div class="photo-frame-wrap">'
        + '<div class="left-deco-bar"><div class="vert-text" data-field="c1Sec" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c1Sec || 'SEC. 01 // REF') + '</div><div class="vert-text" data-field="c1Specimen" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c1Specimen || 'SPECIMEN') + '</div></div>'
        + '<div class="right-deco-line"><svg class="star-icon" viewBox="0 0 24 24"><polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 2,12 9.5,9.5"/></svg><div style="width:1px; height:30px; background:#cbd5e1;"></div><svg class="star-icon" viewBox="0 0 24 24"><polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 2,12 9.5,9.5"/></svg><div style="width:1px; height:30px; background:#cbd5e1;"></div><svg class="star-icon" viewBox="0 0 24 24"><polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 2,12 9.5,9.5"/></svg></div>'
        + '<div class="photo-box' + hasPhotoClass + '" id="cardPhotoBtn"><div class="frame-corner c-tl"></div><div class="frame-corner c-tr"></div><div class="frame-corner c-bl"></div><div class="frame-corner c-br"></div><img id="cardPhotoImg" src="' + esc(cur.photo) + '" alt="立绘"><div class="photo-empty"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>点击上传立绘</span></div></div>'
        + '</div>'
        + '<div class="archive-bottom-zone">'
        + '<div class="char-spec-header">'
        + '<div class="name-block"><div class="char-name" id="cardName" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.name) + '</div><div class="char-en-sub" id="cardTagRomaji" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.tagRomaji || 'COMMANDER // DEPT.01') + '</div></div>'
        + '<div class="huge-shadow-num" data-field="c1ShadowNum" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c1ShadowNum || '01') + '</div>'
        + '</div>'
        + '<div class="precision-axis-line"><div class="axis-dot"></div><div class="axis-line"></div><div class="axis-cross">+</div><div class="axis-line" style="background: linear-gradient(to right, rgba(74, 107, 143, 0.15), rgba(136, 171, 218, 0.4));"></div><div class="axis-dot"></div></div>'
        + '<div class="char-intro-text" id="cardQuote" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.quote0 || DEFAULT_CHAR_QUOTES[0]) + '</div>'
        + '</div>'
        + '<div class="card-footer-bar"><div class="qr-box"><svg viewBox="0 0 24 24"><path d="M3 3h6v6H3V3zm2 2v2h2V5H5zm8-2h6v6h-6V3zm2 2v2h2V5h-2zM3 13h6v6H3v-6zm2 2v2h2v-2H5zm13-2h3v3h-3v-3zm-5 0h2v2h-2v-2zm2 3h2v2h-2v-2zm3 0h3v3h-3v-3zm-3 3h2v2h-2v-2z"/></svg></div><div class="barcode-horiz"><span class="b2"></span><span class="b1"></span><span class="b3"></span><span class="b1"></span><span class="b2"></span><span class="b3"></span><span class="b2"></span><span class="b1"></span><span class="b2"></span></div></div>'
        + '</div>';
    } else if (tplIdx === 1) {
      return '<div class="char-card-base theme-notebook">'
        + '<div class="nb-outer-border"></div><div class="nb-corner-tl"></div><div class="nb-corner-br"><svg viewBox="0 0 24 24"><polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 23,12 9.5,9.5"/></svg></div>'
        + '<div class="nb-top-bar"><div class="nb-top-title" data-field="c2TopTitle" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c2TopTitle || 'TACTICAL NOTEBOOK // SPECIMEN') + '</div><div class="nb-top-tag" data-field="c2TopTag" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c2TopTag || 'LOG 007') + '</div></div>'
        + '<div class="nb-main-layout">'
        + '<div class="nb-sidebar-left"><div class="nb-vert-text" data-field="c2VertText" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c2VertText || 'NIVEOUS SPECIFICATION') + '</div><div class="nb-vert-barcode"><span style="width:2px;"></span><span style="width:1px;"></span><span style="width:3px;"></span><span style="width:1px;"></span><span style="width:2px;"></span></div><div class="nb-mini-qr"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div></div>'
        + '<div class="photo-box' + hasPhotoClass + '" id="cardPhotoBtn"><div class="frame-cross tl"></div><div class="frame-cross tr"></div><div class="frame-cross bl"></div><div class="frame-cross br"></div><img id="cardPhotoImg" src="' + esc(cur.photo) + '" alt="立绘"><div class="photo-empty"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>上传立绘</span></div></div>'
        + '<div class="nb-sidebar-right"><svg class="star-icon" viewBox="0 0 24 24"><polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 2,12 9.5,9.5"/></svg><div class="dashed-line"></div><div class="geo-dots"><span></span><span></span><span></span></div><div class="dashed-line"></div><svg class="star-icon" viewBox="0 0 24 24"><polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 2,12 9.5,9.5"/></svg></div>'
        + '</div>'
        + '<div class="nb-bottom-section">'
        + '<div class="nb-name-row"><div class="char-name" id="cardName" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.name) + '</div><div class="nb-char-serial" data-field="c2Serial" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c2Serial || 'DESIGNATION') + '</div></div>'
        + '<div class="nb-spec-matrix">'
        + '<div class="spec-cell"><span class="cell-label">CLASS</span><span class="cell-val" id="cardTagRomaji" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.tagRomaji || 'COMMANDER') + '</span></div>'
        + '<div class="spec-cell"><span class="cell-label">AFFINITY</span><span class="cell-val" data-field="c2Affinity" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c2Affinity || '100%') + '</span></div>'
        + '<div class="spec-cell"><span class="cell-label">STATUS</span><span class="cell-val" data-field="c2Status" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c2Status || 'ACTIVE') + '</span></div>'
        + '</div>'
        + '<div class="nb-memo-container">'
        + '<div class="memo-tape-header"><span class="tape-tag" data-field="c2TapeTag" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c2TapeTag || 'FIELD MEMO') + '</span><span class="memo-date" data-field="c2MemoDate" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c2MemoDate || 'NIV-LOG // 2026') + '</span></div>'
        + '<div class="char-intro-text" id="cardQuote" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.quote1 || DEFAULT_CHAR_QUOTES[1]) + '</div>'
        + '</div>'
        + '<div class="nb-footer-holes"><div class="holes-row"><div class="hole-dot"></div><div class="hole-dot"></div><div class="hole-dot"></div><div class="hole-dot"></div></div><span class="nb-foot-code" data-field="c2FootCode" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c2FootCode || 'ARCHIVE SYSTEM · NOTEBOOK SPEC') + '</span></div>'
        + '</div></div>';
    } else if (tplIdx === 2) {
      return '<div class="char-card-base theme-tactical">'
        + '<div class="tac-top-bar"><span class="tac-badge"><span data-field="c3TopSecret" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c3TopSecret || 'TOP SECRET') + '</span><span data-field="c3Classified" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c3Classified || 'CLASSIFIED') + '</span></span><div class="tac-sync-rate"><div class="sync-dot"></div><span data-field="c3SyncRate" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c3SyncRate || 'NEURAL SYNC 99.8%') + '</span></div></div>'
        + '<div class="photo-box' + hasPhotoClass + '" id="cardPhotoBtn"><div class="tac-grid-bg"></div><span class="target-lock-text" data-field="c3LockText" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c3LockText || '[ ⛶ TARGET LOCKED ]') + '</span><div class="tac-stamp" data-field="c3Stamp" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c3Stamp || 'ENCRYPTED') + '</div><img id="cardPhotoImg" src="' + esc(cur.photo) + '" alt="立绘"><div class="photo-empty"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>上传立绘</span></div></div>'
        + '<div class="tac-content">'
        + '<div class="name-row"><div class="char-name" id="cardName" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.name) + '</div><div class="char-tag" id="cardTagRomaji" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.tagRomaji || 'CHIEF SPECIAL AGENT #007') + '</div></div>'
        + '<div class="char-intro-text" id="cardQuote" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.quote2 || DEFAULT_CHAR_QUOTES[2]) + '</div>'
        + '<div class="tac-bottom-matrix"><span data-field="c3Hash" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c3Hash || 'QUANTUM HASH: SYN-7F80-NEO') + '</span><div class="tac-signal-bars"><div class="sig-bar" style="height: 4px;"></div><div class="sig-bar" style="height: 6px;"></div><div class="sig-bar" style="height:10px;"></div><div class="sig-bar" style="height: 8px;"></div></div></div>'
        + '</div></div>';
    } else if (tplIdx === 3) {
      return '<div class="char-card-base theme-astral">'
        + '<div class="astral-inner-frame"></div>'
        + '<div class="astral-top-bar"><span class="astral-arcana-num" data-field="c4Arcana" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c4Arcana || '✦ ARCANA XIII // CRIMSON & SILVER') + '</span><div class="moon-phases"><div class="moon-dot" style="opacity:0.3;"></div><div class="moon-dot" style="opacity:0.6;"></div><div class="moon-dot eclipse"></div><div class="moon-dot" style="opacity:0.6;"></div><div class="moon-dot" style="opacity:0.3;"></div></div></div>'
        + '<div class="photo-box' + hasPhotoClass + '" id="cardPhotoBtn"><div class="tarot-corner tc-tl"></div><div class="tarot-corner tc-tr"></div><div class="tarot-corner tc-bl"></div><div class="tarot-corner tc-br"></div><div class="astral-badge-seal"><span data-field="c4Badge" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c4Badge || 'BLOOD OATH') + '</span></div><img id="cardPhotoImg" src="' + esc(cur.photo) + '" alt="立绘"><div class="photo-empty"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span style="color:#ffffff;">上传立绘</span></div></div>'
        + '<div class="astral-info-sec">'
        + '<div class="char-tag" id="cardTagRomaji" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.tagRomaji || 'THE ETERNAL NIGHT EMPEROR') + '</div>'
        + '<div class="char-name" id="cardName" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.name) + '</div>'
        + '<div class="tarot-glyph-separator"><div class="glyph-line"></div><div class="glyph-symbol" data-field="c4Glyph" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c4Glyph || '☽ ✧ ☾') + '</div><div class="glyph-line"></div></div>'
        + '<div class="char-intro-text" id="cardQuote" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.quote3 || DEFAULT_CHAR_QUOTES[3]) + '</div>'
        + '<div class="astral-foot-matrix"><span data-field="c4Foot1" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c4Foot1 || 'SANCTUM IMPERIUM') + '</span><span data-field="c4Foot2" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c4Foot2 || 'ORBIT // 333°') + '</span><span data-field="c4Foot3" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c4Foot3 || 'MMXXV · ETERNAL') + '</span></div>'
        + '</div></div>';
    } else {
      return '<div class="char-card-base theme-french">'
        + '<div class="french-outer-border"></div>'
        + '<div class="french-header"><div class="french-logo" data-field="c5Logo" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c5Logo || 'L\'ÉTERNEL') + '</div><div class="french-sub-head" data-field="c5SubHead" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c5SubHead || 'ÉDITION LIMITÉE · N°01') + '</div></div>'
        + '<div class="photo-box' + hasPhotoClass + '" id="cardPhotoBtn"><img id="cardPhotoImg" src="' + esc(cur.photo) + '" alt="立绘"><div class="photo-empty"><svg viewBox="0 0 24 24"><rect x="3" width="18" height="18" rx="1" ry="1"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>上传立绘</span></div></div>'
        + '<div class="french-content">'
        + '<div class="char-name" id="cardName" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.name) + '</div><div class="char-tag" id="cardTagRomaji" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.tagRomaji || 'GARDE DU CŒUR // 007') + '</div>'
        + '<div class="french-divider-line"></div>'
        + '<div class="char-intro-text" id="cardQuote" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.quote4 || DEFAULT_CHAR_QUOTES[4]) + '</div>'
        + '</div>'
        + '<div class="french-footer"><span data-field="c5Foot1" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c5Foot1 || 'PARIS · STUDIO ARCHIVE') + '</span><span data-field="c5Foot2" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.c5Foot2 || 'AUTOMNE 2026') + '</span></div>'
        + '</div>';
    }
  }

  // ==========================================
  // 事件交互与抽屉管理绑定
  // ==========================================
  function bindStep3Events(cur) {
    var isUser = (currentTab === 'user');

    var prevBtn = document.getElementById('prevTplBtn');
    var nextBtn = document.getElementById('nextTplBtn');
    var editBtn = document.getElementById('dockEditBtn');

    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        syncDirectEdits(cur);
        if (isUser) {
          userTplIdx = (userTplIdx - 1 + 5) % 5;
          cur.tplIdx = userTplIdx;
        } else {
          charTplIdx = (charTplIdx - 1 + 5) % 5;
          cur.tplIdx = charTplIdx;
        }
        saveCurrentToDB();
        renderSubContent();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        syncDirectEdits(cur);
        if (isUser) {
          userTplIdx = (userTplIdx + 1) % 5;
          cur.tplIdx = userTplIdx;
        } else {
          charTplIdx = (charTplIdx + 1) % 5;
          cur.tplIdx = charTplIdx;
        }
        saveCurrentToDB();
        renderSubContent();
      });
    }

    if (editBtn) {
      editBtn.addEventListener('click', function() {
        syncDirectEdits(cur);
        renderStep2();
      });
    }

    var root = document.getElementById('archiveScreenRoot');
    var touchStartX = 0, touchStartY = 0, touchEndX = 0, touchEndY = 0;

    if (root) {
      root.addEventListener('touchstart', function(e) {
        var activeEl = document.activeElement;
        if (activeEl && (activeEl.isContentEditable || activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
        if (e.target.closest('[contenteditable="true"]')) return;

        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchEndX = touchStartX;
        touchEndY = touchStartY;
      }, { passive: true });

      root.addEventListener('touchmove', function(e) {
        touchEndX = e.touches[0].clientX;
        touchEndY = e.touches[0].clientY;
      }, { passive: true });

      root.addEventListener('touchend', function() {
        var diffX = touchEndX - touchStartX;
        var diffY = touchEndY - touchStartY;

        if (touchStartX <= 35 && diffX > 40 && Math.abs(diffX) > Math.abs(diffY)) {
          syncDirectEdits(cur);
          saveCurrentToDB(function() {
            if (window.AppNav) AppNav.showPage('home');
          });
        }
      }, { passive: true });
    }

    var drawerCard = document.getElementById('userDrawerCard');
    var drawerCloseBtn = document.getElementById('drawerCloseBtn');
    var drawerMask = document.getElementById('userDrawerMask');
    var drawerNewUserBtn = document.getElementById('drawerNewUserBtn');

    function closeDrawer() {
      if (drawerMask) drawerMask.classList.remove('show');
      if (drawerCard) drawerCard.classList.remove('show');
    }

    if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);
    if (drawerMask) drawerMask.addEventListener('click', closeDrawer);

    if (drawerNewUserBtn) {
      drawerNewUserBtn.addEventListener('click', function() {
        closeDrawer();
        syncDirectEdits(cur);
        createNewItem();
      });
    }

    if (drawerCard) {
      drawerCard.querySelectorAll('.drawer-user-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
          if (e.target.closest('.drawer-del-btn')) return;
          syncDirectEdits(cur);
          var selId = this.dataset.userId;

          if (isUser) {
            currentUserId = selId;
            var u = getCurrentUser();
            if (u) userTplIdx = u.tplIdx || 0;
          } else {
            currentCharId = selId;
            var c = getCurrentChar();
            if (c) charTplIdx = c.tplIdx || 0;
          }

          saveCurrentToDB(function() {
            closeDrawer();
            renderSubContent();
          });
        });
      });

      drawerCard.querySelectorAll('.drawer-del-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var delId = this.dataset.delId;
          if (window.AppDialog) {
            AppDialog.confirm({
              title: '提示',
              desc: isUser ? '确定要删除该用户档案吗？此操作无法撤销。' : '确定要删除该角色档案吗？此操作无法撤销。',
              confirmText: '删除',
              isDanger: true
            }, function() {
              if (isUser) {
                userList = userList.filter(function(u) { return u.id !== delId; });
                if (currentUserId === delId) currentUserId = userList.length ? userList[0].id : null;
              } else {
                charList = charList.filter(function(c) { return c.id !== delId; });
                if (currentCharId === delId) currentCharId = charList.length ? charList[0].id : null;
              }

              saveCurrentToDB(function() {
                var store = getActiveStore();
                if (store.list.length) renderSubContent();
                else renderStep1(document.getElementById('archiveSubViewport'));
                if (window.AppNav) AppNav.showToast(isUser ? '✦ 用户档案已成功删除 ✦' : '✦ 角色档案已成功删除 ✦');
              });
            });
          }
        });
      });
    }

    var photoBtn = document.getElementById('cardPhotoBtn');
    if (photoBtn) {
      photoBtn.addEventListener('click', function() {
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', function() {
          var file = this.files[0];
          if (!file) return;

          var reader = new FileReader();
          reader.onload = function(e) {
            var cropRatio = isUser ? (1 / 1.35) : (1 / 1.25);
            if (window.AppCropper) {
              AppCropper.open(e.target.result, { aspectRatio: cropRatio }, function(croppedData) {
                syncDirectEdits(cur);
                cur.photo = croppedData;
                saveCurrentToDB(function() { renderSubContent(); });
              });
            } else {
              syncDirectEdits(cur);
              cur.photo = e.target.result;
              saveCurrentToDB(function() { renderSubContent(); });
            }
          };
          reader.readAsDataURL(file);
          if (fileInput.parentNode) document.body.removeChild(fileInput);
        });

        fileInput.click();
      });
    }

    bindLiveEdits(cur);
  }

  function getHtmlWithBreaks(node) {
    if (!node) return '';
    var text = (node.innerText !== undefined) ? node.innerText : node.textContent;
    if (typeof text === 'string') {
      return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }
    return '';
  }

  function syncDirectEdits(targetItem) {
    var cur = targetItem || getCurrentItem();
    if (!cur) return;
    var isUser = (currentTab === 'user');

    var nameNode = document.getElementById('cardName');
    var bioNode = document.getElementById('cardBio');
    var quoteNode = document.getElementById('cardQuote');
    var serialNode = document.getElementById('cardSerial');
    var tagRomajiNode = document.getElementById('cardTagRomaji');
    var userIdNode = document.getElementById('cardUserId');
    var tag1Node = document.getElementById('cardTag1');
    var tag2Node = document.getElementById('cardTag2');
    var tag3Node = document.getElementById('cardTag3');

    var editables = document.querySelectorAll('.arch-card-wrapper [data-field], .char-card-base [data-field]');
    editables.forEach(function(el) {
      var fieldKey = el.dataset.field;
      if (fieldKey) {
        cur[fieldKey] = getHtmlWithBreaks(el);
      }
    });

    if (nameNode) {
      cur.name = getHtmlWithBreaks(nameNode).replace(/[✞✟✠]/g, '');
    }
    if (serialNode) cur.serial = getHtmlWithBreaks(serialNode);

    if (isUser) {
      if (bioNode) cur['bio' + userTplIdx] = getHtmlWithBreaks(bioNode);
      if (userIdNode) cur.userid = getHtmlWithBreaks(userIdNode);
      if (tag1Node) cur.tag1 = getHtmlWithBreaks(tag1Node);
      if (tag2Node) cur.tag2 = getHtmlWithBreaks(tag2Node);
      if (tag3Node) cur.tag3 = getHtmlWithBreaks(tag3Node);
    } else {
      if (quoteNode) cur['quote' + charTplIdx] = getHtmlWithBreaks(quoteNode);
      if (tagRomajiNode) cur.tagRomaji = getHtmlWithBreaks(tagRomajiNode);
    }
  }

  function bindLiveEdits(cur) {
    var editables = document.querySelectorAll('.arch-card-wrapper [contenteditable="true"], .char-card-base [contenteditable="true"]');
    editables.forEach(function(el) {
      el.oninput = function() { syncDirectEdits(); };
      el.onblur = function() { syncDirectEdits(); saveCurrentToDB(); };
    });
  }

  function formatLineBreaks(str) {
    if (!str) return '';
    var safe = esc(str);
    safe = safe.replace(/\n/g, '<br>');
    safe = safe.replace(/ /g, '&nbsp;');
    return safe;
  }

  function esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
