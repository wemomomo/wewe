
(function(){
  'use strict';

  // 修复 iOS Safari 点击不冒泡 Bug，确保苹果手机上所有 div 上的点击都能顺畅触发
  if (document.body) {
    document.body.style.cursor = 'pointer';
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      if (document.body) document.body.style.cursor = 'pointer';
    });
  }

  // ============ IndexedDB ============
  var DB_NAME = 'AppDB';
  var DB_VERSION = 1;
  var STORE_NAME = 'appData';
  var db = null;
  
  window._dbReady = false;

  function openDB(callback) {
    var request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function(e) {
      var database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = function(e) { 
      db = e.target.result; 
      window._dbReady = true;
      window.dispatchEvent(new Event('dbReady'));
      if (callback) callback(); 
    };
    request.onerror = function() { 
      window._dbReady = true;
      window.dispatchEvent(new Event('dbReady'));
      if (callback) callback(); 
    };
  }

  function dbSave(key, value, cb) {
    if (!db) { if (cb) cb(); return; }
    try {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = function() { if (cb) cb(); };
      tx.onerror = function() { if (cb) cb(); };
    } catch(e) { if (cb) cb(); }
  }
  function dbGet(key, cb) {
    if (!db) { cb(null); return; }
    try {
      var r = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      r.onsuccess = function() { cb(r.result !== undefined ? r.result : null); };
      r.onerror = function() { cb(null); };
    } catch(e) { cb(null); }
  }
  function dbDelete(key, cb) {
    if (!db) { if (cb) cb(); return; }
    try {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = function() { if (cb) cb(); };
      tx.onerror = function() { if (cb) cb(); };
    } catch(e) { if (cb) cb(); }
  }

  window.AppDB = { open: openDB, save: dbSave, get: dbGet, delete: dbDelete };

  function parseServerCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) {
        try {
          return JSON.parse(decodeURIComponent(c.substring(nameEQ.length, c.length)));
        } catch(e) {
          return decodeURIComponent(c.substring(nameEQ.length, c.length));
        }
      }
    }
    return null;
  }

  function getGlobalSession() {
    try {
      var token = localStorage.getItem('app_auth_token');
      var info = localStorage.getItem('app_user_info');
      if (token && info) {
        return { token: token, userInfo: JSON.parse(info) };
      }
    } catch(e) {}

    var session = parseServerCookie('niveous_session');
    if (session && session.token && session.username) {
      return {
        token: session.token,
        userInfo: { username: session.username }
      };
    }

    return null;
  }

  function clearAllAuth() {
    try {
      localStorage.removeItem('app_auth_token');
      localStorage.removeItem('app_user_info');
    } catch(e) {}
    document.cookie = 'niveous_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
  }

  function getStableDeviceId(callback) {
    var cookieDev = parseServerCookie('shared_device_id');
    if (cookieDev && typeof cookieDev === 'string') {
      callback(cookieDev);
      return;
    }

    try {
      var localDev = localStorage.getItem('shared_device_id');
      if (localDev) {
        callback(localDev);
        return;
      }
    } catch(e) {}

    dbGet('app_device_fingerprint', function(savedId) {
      if (savedId) {
        try { localStorage.setItem('shared_device_id', savedId); } catch(e){}
        callback(savedId);
        return;
      }

      var w = Math.min(screen.width, screen.height);
      var h = Math.max(screen.width, screen.height);
      var cores = navigator.hardwareConcurrency || 4;
      var touch = navigator.maxTouchPoints || 5;

      var rawString = [w, h, cores, touch].join('::');
      var hash = simpleHash(rawString);
      var deviceId = 'hw_' + hash.substring(0, 12);

      dbSave('app_device_fingerprint', deviceId, function() {
        try { localStorage.setItem('shared_device_id', deviceId); } catch(e){}
        callback(deviceId);
      });
    });
  }

  function simpleHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  function getApiEndpoint(action) {
    return '/api/' + action;
  }

  // ============ 登录门禁逻辑 ============
  function checkActivation() {
    var mask = document.getElementById('authGateMask');
    var usernameInput = document.getElementById('authUsernameInput');
    var passwordInput = document.getElementById('authPasswordInput');
    var submitBtn = document.getElementById('authSubmitBtn');
    if (!mask) return;

    function hideMask() {
      mask.classList.remove('show');
    }

    function showMask() {
      mask.classList.add('show');
    }

    function onLoginVerified(token, userInfo) {
      try {
        localStorage.setItem('app_auth_token', token);
        localStorage.setItem('app_user_info', JSON.stringify(userInfo));
      } catch(e) {}

      dbSave('app_auth_token', token, function() {
        dbSave('app_user_info', userInfo, function() {
          hideMask();
        });
      });
    }

    function kickOut(message) {
      dbDelete('app_auth_token', function() {
        dbDelete('app_user_info', function() {
          clearAllAuth();
          showMask();
          if (message) showToast(message);
        });
      });
    }

    function realTimeVerify(userInfo) {
      getStableDeviceId(function(deviceId) {
        fetch(getApiEndpoint('login') + '?_t=' + Date.now(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({
            username: userInfo.username,
            password: userInfo.password || '',
            deviceId: deviceId,
            verifyOnly: true
          })
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data && data.kickOut === true) {
            kickOut(data.message || '账号已失效');
          }
        })
        .catch(function() {});
      });
    }

    dbGet('app_user_info', function(userInfo) {
      dbGet('app_auth_token', function(token) {
        if (token && userInfo && userInfo.username) {
          hideMask();
          realTimeVerify(userInfo);
        } else {
          var session = getGlobalSession();
          if (session && session.token && session.userInfo && session.userInfo.username) {
            onLoginVerified(session.token, session.userInfo);
            realTimeVerify(session.userInfo);
          } else {
            showMask();
          }
        }
      });
    });

    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        dbGet('app_user_info', function(userInfo) {
          if (userInfo && userInfo.username) realTimeVerify(userInfo);
        });
      }
    });

    function doLoginRequest(username, password, forceReset) {
      getStableDeviceId(function(deviceId) {
        submitBtn.disabled = true;
        submitBtn.textContent = '进入中...';

        fetch(getApiEndpoint('login') + '?_t=' + Date.now(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({
            username: username,
            password: password,
            deviceId: deviceId,
            forceReset: !!forceReset
          })
        })
        .then(function(res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function(data) {
          submitBtn.disabled = false;
          submitBtn.textContent = '进入';

          if (data.success && data.token) {
            var info = { username: data.username, password: password };
            onLoginVerified(data.token, info);
            showToast('欢迎回来');
            window.dispatchEvent(new CustomEvent('loginSuccess'));
          } else if (data.canReset) {
            if (window.AppDialog) {
              window.AppDialog.confirm({
                title: '设备数已达上限',
                desc: '已达到最大设备数，是否清空历史旧设备并将当前设备绑定进入？',
                confirmText: '立即绑定当前设备',
                isDanger: false
              }, function() {
                doLoginRequest(username, password, true);
              });
            } else {
              showToast(data.message || '设备超过限制');
            }
          } else {
            showToast(data.message || '登录失败');
          }
        })
        .catch(function() {
          submitBtn.disabled = false;
          submitBtn.textContent = '进入';
          showToast('登录失败，请重试');
        });
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', function() {
        var username = (usernameInput.value || '').trim();
        var password = (passwordInput.value || '').trim();
        if (!username || !password) { showToast('请输入账号和密码'); return; }
        doLoginRequest(username, password, false);
      });
    }

    var loginBox = document.getElementById('authLoginBox');
    var registerBox = document.getElementById('authRegisterBox');
    var goRegisterBtn = document.getElementById('authGoRegister');
    var goLoginBtn = document.getElementById('authGoLogin');
    var registerBtn = document.getElementById('authRegisterBtn');

    if (goRegisterBtn) {
      goRegisterBtn.addEventListener('click', function() {
        loginBox.classList.add('auth-hidden');
        registerBox.classList.remove('auth-hidden');
      });
    }

    if (goLoginBtn) {
      goLoginBtn.addEventListener('click', function() {
        registerBox.classList.add('auth-hidden');
        loginBox.classList.remove('auth-hidden');
      });
    }

    if (registerBtn) {
      registerBtn.addEventListener('click', function() {
        var inviteCode = (document.getElementById('authInviteInput').value || '').trim();
        var regUser = (document.getElementById('authRegUserInput').value || '').trim();
        var regPass = (document.getElementById('authRegPassInput').value || '').trim();

        if (!inviteCode || !regUser || !regPass) { showToast('请填写完整信息'); return; }

        getStableDeviceId(function(deviceId) {
          registerBtn.disabled = true;
          registerBtn.textContent = '注册中...';

          fetch(getApiEndpoint('register') + '?_t=' + Date.now(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
              inviteCode: inviteCode,
              username: regUser,
              password: regPass,
              deviceId: deviceId
            })
          })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            registerBtn.disabled = false;
            registerBtn.textContent = '注册并登录';

            if (data.success && data.token) {
              var info = { username: data.username, password: regPass };
              onLoginVerified(data.token, info);
              showToast('注册成功，欢迎进入');
              window.dispatchEvent(new CustomEvent('loginSuccess'));
            } else {
              showToast(data.message || '注册失败');
            }
          })
          .catch(function() {
            registerBtn.disabled = false;
            registerBtn.textContent = '注册并登录';
            showToast('网络异常，请重试');
          });
        });
      });
    }
  }

  // ============ 页面外壳与导航 ============
  var dock = document.querySelector('.tab-bar');
  var dockEditBtn = document.querySelector('.tabbar-edit-btn');

  function initAppShells() {
    var appPages = ['beautify', 'archive', 'imgbed', 'wechat', 'offline', 'settings', 'check', 'worldbook'];
    appPages.forEach(function(name) {
      var page = document.querySelector('[data-page="'+name+'"]');
      if (!page || page.querySelector('.app-header') || (name === 'worldbook' && page.querySelector('#worldbookContent'))) return;
      var titleText = { beautify: '美化中心', archive: '档案', imgbed: '图床', wechat: '微信', offline: '线下', settings: '设置', check: '查岗', worldbook: '世界书' }[name];
      
      if (name === 'worldbook') {
        page.innerHTML = '<div class="app-content" id="worldbookContent"></div>';
      } else if (name === 'beautify') {
        page.innerHTML = '<div class="app-header">'
          + '<button class="icon-back-btn" data-back="home"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
          + '<div class="app-title-group"><div class="app-title">'+titleText+'</div><div class="app-subtitle">DESIGN PROCESS</div></div>'
          + '</div><div class="app-content" id="'+name+'Content"></div>';
      } else {
        page.innerHTML = '<div class="app-header"><button class="icon-back-btn" data-back="home"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button><div class="app-title">'+titleText+'</div></div><div class="app-content" id="'+name+'Content"></div>';
      }
    });

    var settingsContent = document.getElementById('settingsContent');
    if (settingsContent && !settingsContent.querySelector('.settings-list')) {
      settingsContent.innerHTML = '<div class="settings-list"><div class="settings-item" data-goto="api"><div class="settings-item-icon"><svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></div><div class="settings-item-text"><div class="settings-item-title">API 配置</div><div class="settings-item-desc">管理接口密钥与模型设置</div></div><svg class="settings-arrow" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></div><div class="settings-item" data-goto="data"><div class="settings-item-icon"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg></div><div class="settings-item-text"><div class="settings-item-title">数据</div><div class="settings-item-desc">导入导出与清除本地数据</div></div><svg class="settings-arrow" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></div></div>';
    }

    var subPages = [{name:'api',title:'API 配置',back:'settings'},{name:'data',title:'数据',back:'settings'}];
    subPages.forEach(function(sub) {
      var existing = document.querySelector('[data-page="'+sub.name+'"]');
      if (existing) return;
      var subPage = document.createElement('div');
      subPage.className = 'page app-page';
      subPage.dataset.page = sub.name;
      subPage.innerHTML = '<div class="app-header"><button class="icon-back-btn" data-back="'+sub.back+'"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button><div class="app-title">'+sub.title+'</div></div><div class="app-content" id="'+sub.name+'PageContent"></div>';
      document.getElementById('pageContainer').appendChild(subPage);
    });
  }

  function showPage(name) {
    var allPages = document.querySelectorAll('.page');
    allPages.forEach(function(p) {
      if (p.dataset.page === name) { p.classList.add('active'); p.style.transform = ''; }
      else { p.classList.remove('active'); p.style.transform = ''; }
    });
    
    var homePage = document.querySelector('[data-page="home"]');
    if (homePage) homePage.style.transform = '';

    var desktopPagination = document.getElementById('desktopPagination');
    if (name === 'home') { 
      if (dock) dock.style.display = 'flex'; 
      if (dockEditBtn) dockEditBtn.style.display = 'block'; 
      if (desktopPagination) desktopPagination.style.display = 'flex';
    } else { 
      if (dock) dock.style.display = 'none'; 
      if (dockEditBtn) dockEditBtn.style.display = 'none'; 
      if (desktopPagination) desktopPagination.style.display = 'none';
    }
    window.dispatchEvent(new CustomEvent('pageChange', { detail: { page: name } }));
  }

  // ============ 桌面双屏滑动交互 ============
  function setupDesktopSlider() {
    var slider = document.getElementById('desktopSlider');
    var dots = document.querySelectorAll('.desktop-dot');
    var currentScreen = 0;
    var startX = 0, startY = 0, distX = 0, distY = 0, isDragging = false;

    function goToScreen(idx) {
      currentScreen = idx;
      if (slider) slider.style.transform = 'translateX(-' + (idx * 50) + '%)';
      dots.forEach(function(dot, i) {
        if (i === idx) dot.classList.add('active');
        else dot.classList.remove('active');
      });
    }

    dots.forEach(function(dot, idx) {
      dot.addEventListener('click', function(e) {
        e.stopPropagation();
        goToScreen(idx);
      });
    });

    if (slider) {
      slider.addEventListener('touchstart', function(e) {
        if (document.querySelector('.app-shell') && document.querySelector('.app-shell').classList.contains('edit-mode')) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        distX = 0;
        distY = 0;
        isDragging = true;
      }, { passive: true });

      slider.addEventListener('touchmove', function(e) {
        if (!isDragging) return;
        var curX = e.touches[0].clientX;
        var curY = e.touches[0].clientY;
        distX = curX - startX;
        distY = curY - startY;
      }, { passive: true });

      slider.addEventListener('touchend', function() {
        if (!isDragging) return;
        isDragging = false;
        if (Math.abs(distX) > Math.abs(distY) && Math.abs(distX) > 35) {
          if (distX < 0 && currentScreen === 0) {
            goToScreen(1);
          } else if (distX > 0 && currentScreen === 1) {
            goToScreen(0);
          }
        }
      });
    }
  }

  // ============ 全局统一导航与多级滑动统管 ============
  function bindNavigation() {
    document.querySelectorAll('.tab-item').forEach(function(tab) {
      tab.addEventListener('click', function() { 
        var targetTab = this.dataset.tab;
        
        if (targetTab === 'wechat') {
          var DEV_PASSCODE = '0525'; 
          var isDevUnlocked = sessionStorage.getItem('dev_wechat_unlocked');

          if (isDevUnlocked === 'true') {
            showPage('wechat');
            return;
          }

          var inputCode = prompt('✦ 微信开发中 · 请输入开发者密匙 ✦');
          if (inputCode === DEV_PASSCODE) {
            sessionStorage.setItem('dev_wechat_unlocked', 'true');
            showToast('✦ 开发者身份验证成功 ✦');
            showPage('wechat');
          } else if (inputCode !== null) {
            showToast('✦ 密匙错误，暂未对公众开放 ✦');
          }
          return;
        }
        if (targetTab === 'offline') {
          showToast('✦ 线下功能正在精心筹备中 ✦');
          return;
        }
        if (targetTab === 'check') {
          showToast('✦ 查岗系统正在研发中 ✦');
          return;
        }
        showPage(targetTab); 
      });
    });

    document.addEventListener('click', function(e) { 
      var b = e.target.closest('[data-back]'); 
      if (b) {
        var backTarget = b.dataset.back;
        if (backTarget === 'beautify-main') {
          window.dispatchEvent(new Event('closeBeautifySub'));
        } else {
          showPage(backTarget);
        }
      }
    });

    document.addEventListener('click', function(e) { 
      var g = e.target.closest('[data-goto]'); 
      if (g) showPage(g.dataset.goto); 
    });
    
    document.addEventListener('click', function(e) {
      var appItem = e.target.closest('[data-open-app]');
      if (appItem && appItem.dataset.openApp) {
        showPage(appItem.dataset.openApp);
      }
    });

    document.addEventListener('click', function(e) {
      var coupleItem = e.target.closest('.couple-icon-item');
      if (coupleItem && !coupleItem.dataset.openApp && !coupleItem.dataset.goto) {
        var action = coupleItem.dataset.action;
        if (action === 'worldbook') {
          showPage('worldbook');
        } else if (action === 'forum') {
          showToast('✦ 论坛社区即将开放 ✦');
        } else {
          showToast('✦ 该功能正在精心研发中 ✦');
        }
      }
    });

    // 核心多级滑动返回引擎：美化中心、世界书三级、基础页面统管
    document.querySelectorAll('.app-page').forEach(function(page) {
      var startX = 0, startY = 0, currentX = 0, isDragging = false, isLocked = false, isHoriz = false;
      var activeSubView = null;
      var mainView = null;
      var isWorldbook = false;

      page.addEventListener('touchstart', function(e) { 
        if (e.touches[0].clientX > 45) return; 
        
        // 1. 【档案】完全由 archive.js 自身手势独立接管，app.js 绝对不碰，彻底封死越级
        if (page.dataset.page === 'archive') return;
        
        startX = e.touches[0].clientX; 
        startY = e.touches[0].clientY;
        currentX = 0;
        isDragging = true; 
        isLocked = false;
        isHoriz = false;

        // 2. 【美化中心】多级视图检测
        if (page.dataset.page === 'beautify') {
          activeSubView = page.querySelector('.beautify-sub-view.active');
          mainView = page.querySelector('.beautify-main-view');
          isWorldbook = false;
        } 
        // 3. 【世界书】专属三级视图检测 (词条编辑 / 词条列表 / 封面修改 / 首页)
        else if (page.dataset.page === 'worldbook') {
          isWorldbook = true;
          activeSubView = null;
          mainView = null;
          
          // 只要处于非 home 状态，严格捕获对应的活动子层
          if (window.WorldbookState && window.WorldbookState.currentLevel && window.WorldbookState.currentLevel !== 'home') {
            if (window.WorldbookState.currentLevel === 'edit') {
              activeSubView = page.querySelector('#wbEditView');
            } else if (window.WorldbookState.currentLevel === 'book_meta') {
              activeSubView = page.querySelector('#wbBookMetaView');
            } else if (window.WorldbookState.currentLevel === 'entries') {
              activeSubView = page.querySelector('#wbEntriesView');
            }
          } else {
            var editView = page.querySelector('#wbEditView');
            var entriesView = page.querySelector('#wbEntriesView');
            var metaView = page.querySelector('#wbBookMetaView');
            
            if (editView && !editView.classList.contains('wb-view-hidden') && editView.style.display !== 'none') {
              activeSubView = editView;
            } else if (metaView && !metaView.classList.contains('wb-view-hidden') && metaView.style.display !== 'none') {
              activeSubView = metaView;
            } else if (entriesView && !entriesView.classList.contains('wb-view-hidden') && entriesView.style.display !== 'none') {
              activeSubView = entriesView;
            }
          }
        } else {
          activeSubView = null;
          mainView = null;
          isWorldbook = false;
        }

        if (activeSubView) {
          activeSubView.style.transition = 'none';
          if (mainView) mainView.style.transition = 'none';
        } else {
          page.style.transition = 'none'; 
        }
      }, { passive: true });

      page.addEventListener('touchmove', function(e) { 
        if (!isDragging) return; 
        var diffX = e.touches[0].clientX - startX;
        var diffY = e.touches[0].clientY - startY;

        if (!isLocked && (Math.abs(diffX) > 5 || Math.abs(diffY) > 5)) {
          isLocked = true;
          isHoriz = Math.abs(diffX) > Math.abs(diffY);
        }

        if (!isHoriz) return;

        if (diffX > 0) {
          currentX = diffX;
          if (activeSubView) {
            activeSubView.style.transform = 'translateX(' + currentX + 'px)';
            if (mainView) {
              var mainOffset = -30 + (currentX / window.innerWidth) * 30;
              mainView.style.transform = 'translateX(' + mainOffset + '%)';
              mainView.style.opacity = Math.min(1, 0.4 + (currentX / window.innerWidth) * 0.6);
            }
          } else {
            page.style.transform = 'translateX(' + currentX + 'px)'; 
          }
        }
      }, { passive: true });

      page.addEventListener('touchend', function() {
        if (!isDragging || !isHoriz) {
          isDragging = false;
          return;
        }
        isDragging = false;

        // 子视图右滑返回上一级 (词条编辑 -> 列表 -> 首页)
        if (activeSubView) {
          if (currentX > window.innerWidth * 0.25) {
            activeSubView.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
            activeSubView.style.transform = 'translateX(100%)';
            setTimeout(function() {
              activeSubView.style.transform = '';
              if (isWorldbook) {
                // 通知世界书按层级后退一步
                window.dispatchEvent(new CustomEvent('wbStepBack'));
              } else {
                window.dispatchEvent(new Event('closeBeautifySub'));
              }
            }, 220);
          } else {
            activeSubView.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
            activeSubView.style.transform = 'translateX(0)';
            if (mainView) {
              mainView.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.22s ease';
              mainView.style.transform = 'translateX(-30%)';
              mainView.style.opacity = '0.4';
            }
          }
        } 
        // 顶层 App 页面右滑返回桌面 (Home)
        else {
          page.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)';
          var backBtn = page.querySelector('[data-back]');
          if (currentX > window.innerWidth * 0.28) { 
            var targetBack = backBtn ? backBtn.dataset.back : 'home';
            showPage(targetBack); 
            setTimeout(function() { page.style.transform = ''; }, 280); 
          } else { 
            page.style.transform = 'translateX(0)'; 
          }
        }
      });
    });
  }

  // ============ Canvas 裁剪器 ============
  var cropOverlay = document.getElementById('cropOverlay');
  var cropCanvas = document.getElementById('cropCanvas');
  var cropWorkspace = document.getElementById('cropWorkspace');
  var cropCancelBtn = document.getElementById('cropCancelBtn');
  var cropConfirmBtn = document.getElementById('cropConfirmBtn');
  var cropCtx = cropCanvas ? cropCanvas.getContext('2d') : null;
  var cropDpr = window.devicePixelRatio || 1;

  var cropImg = null, cropCallback = null, cropScale = 1;
  var cropDisplayW = 0, cropDisplayH = 0;
  var cropBox = { x: 0, y: 0, w: 0, h: 0 };
  var cropLockedRatio = 0, cropDragMode = '';
  var cropStartX = 0, cropStartY = 0, cropStartBox = {};
  var CROP_HANDLE = 24, CROP_MIN = 40;

  window.AppCropper = {
    open: function(src, options, callback) {
      cropCallback = callback; cropLockedRatio = 0;
      cropOverlay.querySelectorAll('.crop-ratio-btn').forEach(function(b) { b.classList.remove('active'); });
      var freeBtn = cropOverlay.querySelector('[data-ratio="free"]');
      if (freeBtn) freeBtn.classList.add('active');
      cropOverlay.classList.add('show');

      cropImg = new Image();
      cropImg.onload = function() {
        var maxW = cropWorkspace.clientWidth - 32, maxH = cropWorkspace.clientHeight - 32;
        if (maxW <= 0 || maxH <= 0) { maxW = window.innerWidth - 32; maxH = window.innerHeight - 180; }
        cropScale = Math.min(maxW / cropImg.width, maxH / cropImg.height, 1);
        cropDisplayW = Math.round(cropImg.width * cropScale);
        cropDisplayH = Math.round(cropImg.height * cropScale);
        cropCanvas.width = cropDisplayW * cropDpr; cropCanvas.height = cropDisplayH * cropDpr;
        cropCanvas.style.width = cropDisplayW + 'px'; cropCanvas.style.height = cropDisplayH + 'px';
        cropCtx.setTransform(cropDpr, 0, 0, cropDpr, 0, 0);
        var initRatio = (options && options.aspectRatio) ? options.aspectRatio : (cropDisplayW / cropDisplayH);
        var initW = cropDisplayW * 0.85, initH = initW / initRatio;
        if (initH > cropDisplayH * 0.85) { initH = cropDisplayH * 0.85; initW = initH * initRatio; }
        cropBox.w = initW; cropBox.h = initH;
        cropBox.x = (cropDisplayW - cropBox.w) / 2; cropBox.y = (cropDisplayH - cropBox.h) / 2;
        cropDraw();
      };
      cropImg.src = src;
    }
  };

  function cropClamp() {
    if (cropBox.w < CROP_MIN) cropBox.w = CROP_MIN;
    if (cropBox.h < CROP_MIN) cropBox.h = CROP_MIN;
    if (cropBox.x < 0) { cropBox.w += cropBox.x; cropBox.x = 0; }
    if (cropBox.y < 0) { cropBox.h += cropBox.y; cropBox.y = 0; }
    if (cropBox.x + cropBox.w > cropDisplayW) { cropBox.w = cropDisplayW - cropBox.x; }
    if (cropBox.y + cropBox.h > cropDisplayH) { cropBox.h = cropDisplayH - cropBox.y; }
  }

  function cropDraw() {
    if (!cropCtx) return;
    var c = cropBox;
    cropCtx.clearRect(0, 0, cropDisplayW, cropDisplayH);
    cropCtx.drawImage(cropImg, 0, 0, cropDisplayW, cropDisplayH);
    cropCtx.fillStyle = 'rgba(0,0,0,0.55)';
    cropCtx.fillRect(0, 0, cropDisplayW, c.y);
    cropCtx.fillRect(0, c.y + c.h, cropDisplayW, cropDisplayH - c.y - c.h);
    cropCtx.fillRect(0, c.y, c.x, c.h);
    cropCtx.fillRect(c.x + c.w, c.y, cropDisplayW - c.x - c.w, c.h);
    cropCtx.strokeStyle = '#fff'; cropCtx.lineWidth = 2;
    cropCtx.strokeRect(c.x, c.y, c.w, c.h);
    cropCtx.strokeStyle = 'rgba(255,255,255,0.35)'; cropCtx.lineWidth = 1;
    var tw = c.w/3, th = c.h/3;
    cropCtx.beginPath();
    cropCtx.moveTo(c.x+tw,c.y); cropCtx.lineTo(c.x+tw,c.y+c.h);
    cropCtx.moveTo(c.x+tw*2,c.y); cropCtx.lineTo(c.x+tw*2,c.y+c.h);
    cropCtx.moveTo(c.x,c.y+th); cropCtx.lineTo(c.x+c.w,c.y+th);
    cropCtx.moveTo(c.x,c.y+th*2); cropCtx.lineTo(c.x+c.w,c.y+th*2);
    cropCtx.stroke();
    cropCtx.fillStyle = '#fff'; var hs = 9;
    [[c.x,c.y],[c.x+c.w,c.y],[c.x,c.y+c.h],[c.x+c.w,c.y+c.h]].forEach(function(p){cropCtx.fillRect(p[0]-hs/2,p[1]-hs/2,hs,hs);});
    [[c.x+c.w/2,c.y],[c.x+c.w/2,c.y+c.h],[c.x,c.y+c.h/2],[c.x+c.w,c.y+c.h/2]].forEach(function(p){cropCtx.fillRect(p[0]-hs/2,p[1]-hs/2,hs,hs);});
  }

  function cropGetPos(e) { var t = e.touches ? e.touches[0] : e; var rect = cropCanvas.getBoundingClientRect(); return { x: t.clientX - rect.left, y: t.clientY - rect.top }; }

  function cropHitTest(px, py) {
    var c = cropBox, H = CROP_HANDLE;
    if (px>=c.x-H&&px<=c.x+H&&py>=c.y-H&&py<=c.y+H) return 'tl';
    if (px>=c.x+c.w-H&&px<=c.x+c.w+H&&py>=c.y-H&&py<=c.y+H) return 'tr';
    if (px>=c.x-H&&px<=c.x+H&&py>=c.y+c.h-H&&py<=c.y+c.h+H) return 'bl';
    if (px>=c.x+c.w-H&&px<=c.x+c.w+H&&py>=c.y-H&&py<=c.y+H) return 'br';
    if (py>=c.y-H&&py<=c.y+H&&px>c.x+H&&px<c.x+c.w-H) return 't';
    if (py>=c.y+c.h-H&&py<=c.y+c.h+H&&px>c.x+H&&px<c.x+c.w-H) return 'b';
    if (px>=c.x-H&&px<=c.x+H&&py>c.y+H&&py<c.y+c.h-H) return 'l';
    if (px>=c.x+c.w-H&&px<=c.x+c.w+H&&py>c.y+H&&py<c.y+c.h-H) return 'r';
    if (px>=c.x&&px<=c.x+c.w&&py>=c.y&&py<=c.y+c.h) return 'move';
    return '';
  }

  function cropOnStart(e) {
    if (e.touches && e.touches.length > 1) return;
    e.preventDefault(); var p = cropGetPos(e);
    cropDragMode = cropHitTest(p.x, p.y); if (!cropDragMode) return;
    cropStartX = p.x; cropStartY = p.y;
    cropStartBox = { x:cropBox.x, y:cropBox.y, w:cropBox.w, h:cropBox.h };
    document.addEventListener('mousemove', cropOnMove);
    document.addEventListener('mouseup', cropOnEnd);
    document.addEventListener('touchmove', cropOnMove, { passive: false });
    document.addEventListener('touchend', cropOnEnd);
  }

  function cropOnMove(e) {
    if (!cropDragMode) return; e.preventDefault();
    var p = cropGetPos(e), dx = p.x-cropStartX, dy = p.y-cropStartY, sc = cropStartBox;
    if (cropDragMode==='move') { cropBox.x=Math.max(0,Math.min(cropDisplayW-cropBox.w,sc.x+dx)); cropBox.y=Math.max(0,Math.min(cropDisplayH-cropBox.h,sc.y+dy)); cropDraw(); return; }
    if (cropDragMode==='r') { cropBox.w=Math.max(CROP_MIN,Math.min(cropDisplayW-sc.x,sc.w+dx)); }
    else if (cropDragMode==='l') { var ra=sc.x+sc.w; var nx=Math.max(0,Math.min(ra-CROP_MIN,sc.x+dx)); cropBox.x=nx; cropBox.w=ra-nx; }
    else if (cropDragMode==='b') { cropBox.h=Math.max(CROP_MIN,Math.min(cropDisplayH-sc.y,sc.h+dy)); }
    else if (cropDragMode==='t') { var ba=sc.y+sc.h; var ny=Math.max(0,Math.min(ba-CROP_MIN,sc.y+dy)); cropBox.y=ny; cropBox.h=ba-ny; }
    else if (cropDragMode==='br') { cropBox.w=Math.max(CROP_MIN,Math.min(cropDisplayW-sc.x,sc.w+dx)); cropBox.h=Math.max(CROP_MIN,Math.min(cropDisplayH-sc.y,sc.h+dy)); }
    else if (cropDragMode==='bl') { var ra2=sc.x+sc.w; var nx2=Math.max(0,Math.min(ra2-CROP_MIN,sc.x+dx)); cropBox.x=nx2; cropBox.w=ra2-nx2; cropBox.h=Math.max(CROP_MIN,cropDisplayH-sc.y,sc.h+dy)); }
    else if (cropDragMode==='tr') { var ba2=sc.y+sc.h; var ny2=Math.max(0,Math.min(ba2-CROP_MIN,sc.y+dy)); cropBox.w=Math.max(CROP_MIN,Math.min(cropDisplayW-sc.x,sc.w+dx)); cropBox.y=ny2; cropBox.h=ba2-ny2; }
    else if (cropDragMode==='tl') { var ra3=sc.x+sc.w; var ba3=sc.y+sc.h; var nx3=Math.max(0,Math.min(ra3-CROP_MIN,sc.x+dx)); var ny3=Math.max(0,Math.min(ba3-CROP_MIN,sc.y+dy)); cropBox.x=nx3; cropBox.w=ra3-nx3; cropBox.y=ny3; cropBox.h=ba3-ny3; }
    if (cropLockedRatio) {
      if (cropDragMode==='r'||cropDragMode==='l'||cropDragMode==='tr'||cropDragMode==='tl') cropBox.h=cropBox.w/cropLockedRatio;
      else cropBox.w=cropBox.h*cropLockedRatio;
      cropClamp();
    }
    cropDraw();
  }

  function cropOnEnd() {
    cropDragMode = '';
    document.removeEventListener('mousemove', cropOnMove); document.removeEventListener('mouseup', cropOnEnd);
    document.removeEventListener('touchmove', cropOnMove); document.removeEventListener('touchend', cropOnEnd);
  }

  if (cropCanvas) {
    cropCanvas.addEventListener('mousedown', cropOnStart);
    cropCanvas.addEventListener('touchstart', cropOnStart, { passive: false });
    var cropLastDist = 0;
    cropCanvas.addEventListener('touchstart', function(e) { if (e.touches.length===2) { e.preventDefault(); cropDragMode=''; cropLastDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); } }, { passive: false });
    cropCanvas.addEventListener('touchmove', function(e) {
      if (e.touches.length===2) { e.preventDefault(); var dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); var diff=dist-cropLastDist; var ratio=cropBox.w/cropBox.h; var cx=cropBox.x+cropBox.w/2,cy=cropBox.y+cropBox.h/2; cropBox.w=Math.max(CROP_MIN,cropBox.w+diff); cropBox.h=Math.max(CROP_MIN,cropBox.h+diff/ratio); cropBox.x=cx-cropBox.w/2; cropBox.y=cy-cropBox.h/2; cropClamp(); cropLastDist=dist; cropDraw(); }
    }, { passive: false });
  }

  if (cropOverlay) {
    cropOverlay.querySelectorAll('.crop-ratio-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        cropOverlay.querySelectorAll('.crop-ratio-btn').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
        var r=btn.dataset.ratio;
        if (r==='free') cropLockedRatio=0;
        else if (r==='1') cropLockedRatio=1;
        else if (r==='4:3') cropLockedRatio=4/3;
        else if (r==='16:9') cropLockedRatio=16/9;
        if (cropLockedRatio) { var cx=cropBox.x+cropBox.w/2,cy=cropBox.y+cropBox.h/2; var nw=cropBox.w,nh=nw/cropLockedRatio; if(nh>cropDisplayH*0.9){nh=cropDisplayH*0.9;nw=nh*cropLockedRatio;} cropBox.w=nw;cropBox.h=nh;cropBox.x=cx-cropBox.w/2;cropBox.y=cy-cropBox.h/2; cropClamp(); cropDraw(); }
      });
    });
  }

  if (cropCancelBtn) cropCancelBtn.addEventListener('click', function() { cropOverlay.classList.remove('show'); cropCallback=null; });
  if (cropConfirmBtn) cropConfirmBtn.addEventListener('click', function() {
    var outW = Math.round(cropBox.w / cropScale);
    var outH = Math.round(cropBox.h / cropScale);
    var output = document.createElement('canvas');
    output.width = outW;
    output.height = outH;
    var outCtx = output.getContext('2d');
    outCtx.drawImage(cropImg, cropBox.x / cropScale, cropBox.y / cropScale, outW, outH, 0, 0, outW, outH);
    var data = output.toDataURL('image/jpeg', 0.92);
    cropOverlay.classList.remove('show');
    if (cropCallback) cropCallback(data);
    cropCallback = null;
  });

  // ============ 照片操作卡片 ============
  var photoActionCard=null,photoActionMask=null,photoActionOnSelect=null,photoActionOnDelete=null;
  function setupPhotoAction() {
    if (photoActionMask) return;
    photoActionMask=document.createElement('div'); photoActionMask.className='photo-action-mask'; document.body.appendChild(photoActionMask);
    photoActionCard=document.createElement('div'); photoActionCard.className='photo-action-card';
    photoActionCard.innerHTML='<button id="paSelectBtn" type="button">选择照片</button><button id="paDeleteBtn" type="button">删除照片</button>';
    document.body.appendChild(photoActionCard);
    photoActionMask.addEventListener('click',function(){photoActionMask.classList.remove('show');photoActionCard.classList.remove('show');photoActionOnSelect=null;photoActionOnDelete=null;});
    document.getElementById('paSelectBtn').addEventListener('click',function(e){e.stopPropagation();var cb=photoActionOnSelect;photoActionMask.classList.remove('show');photoActionCard.classList.remove('show');photoActionOnSelect=null;photoActionOnDelete=null;if(cb)cb();});
    document.getElementById('paDeleteBtn').addEventListener('click',function(e){e.stopPropagation();var cb=photoActionOnDelete;photoActionMask.classList.remove('show');photoActionCard.classList.remove('show');photoActionOnSelect=null;photoActionOnDelete=null;if(cb)cb();});
  }
  window.PhotoAction={show:function(onSelect,onDelete){if(!photoActionMask)setupPhotoAction();photoActionOnSelect=onSelect;photoActionOnDelete=onDelete;photoActionMask.classList.add('show');photoActionCard.classList.add('show');}};

  // ============ 全局高定「双选确认弹窗」引擎 ============
  var appDialogMask = null, appDialogOnConfirm = null, appDialogOnCancel = null;
  function setupAppDialog() {
    if (appDialogMask) return;
    appDialogMask = document.createElement('div');
    appDialogMask.className = 'app-dialog-mask';
    appDialogMask.innerHTML = '<div class="app-dialog-card">'
      + '<div class="app-dialog-title" id="appDialogTitle">提示</div>'
      + '<div class="app-dialog-desc" id="appDialogDesc">确定执行此操作吗？</div>'
      + '<div class="app-dialog-btns">'
      + '<button class="app-dialog-btn cancel" id="appDialogCancelBtn" type="button">取消</button>'
      + '<button class="app-dialog-btn confirm" id="appDialogConfirmBtn" type="button">确定</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(appDialogMask);

    function closeDialog() {
      appDialogMask.classList.remove('show');
      appDialogOnConfirm = null;
      appDialogOnCancel = null;
    }

    appDialogMask.addEventListener('click', function(e) {
      if (e.target === appDialogMask) {
        var cb = appDialogOnCancel;
        closeDialog();
        if (cb) cb();
      }
    });

    document.getElementById('appDialogCancelBtn').addEventListener('click', function(e) {
      e.stopPropagation();
      var cb = appDialogOnCancel;
      closeDialog();
      if (cb) cb();
    });

    document.getElementById('appDialogConfirmBtn').addEventListener('click', function(e) {
      e.stopPropagation();
      var cb = appDialogOnConfirm;
      closeDialog();
      if (cb) cb();
    });
  }

  window.AppDialog = {
    confirm: function(options, onConfirm, onCancel) {
      if (!appDialogMask) setupAppDialog();
      options = options || {};
      document.getElementById('appDialogTitle').textContent = options.title || '提示';
      document.getElementById('appDialogDesc').textContent = options.desc || '确定执行此操作吗？';
      
      var confirmBtn = document.getElementById('appDialogConfirmBtn');
      confirmBtn.textContent = options.confirmText || '确定';
      if (options.isDanger) {
        confirmBtn.className = 'app-dialog-btn danger';
      } else {
        confirmBtn.className = 'app-dialog-btn confirm';
      }

      appDialogOnConfirm = onConfirm;
      appDialogOnCancel = onCancel;
      appDialogMask.classList.add('show');
    }
  };

  // ============ Toast ============
  var currentToastTimer = null;
  function showToast(message) {
    var existing = document.querySelector('.toast-message');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
      clearTimeout(currentToastTimer);
    }
    var toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function(){ toast.classList.add('show'); }, 10);
    currentToastTimer = setTimeout(function(){
      toast.classList.remove('show');
      setTimeout(function(){
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 2000);
  }

  window.AppNav = { showPage: showPage, showToast: showToast };

  // ============ 初始化 ============
  openDB(function() {
    setupPhotoAction();
    setupAppDialog();
    initAppShells();
    setupDesktopSlider();
    bindNavigation();
    checkActivation();
  });

})();