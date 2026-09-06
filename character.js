
(function(){
  'use strict';

  var CHAR_LIST_KEY = 'character_archives_list_v1';
  var ACTIVE_CHAR_ID_KEY = 'character_archive_active_id_v1';

  var container = null;
  var charList = [];
  var currentCharId = null;
  var currentTplIdx = 0; // 0:档案卡, 1:机能手账, 2:血月塔罗, 3:特工令, 4:法式画报

  var DEFAULT_CHAR_QUOTES = [
    '无论在任何时刻，只要你唤我的名字，哥哥都会穿越数据与光芒来到你的身边。',
    '无论在任何时刻，只要你唤我的名字，哥哥都会穿越数据与光芒来到你的身边。',
    '无论在任何时刻，只要你唤我的名字，哥哥都会穿越数据与光芒来到你的身边。',
    '无论在任何时刻，只要你唤我的名字，哥哥都会穿越数据与光芒来到你的身边。',
    '« 无论时间流转至何处，我都会守在你的身边。 »'
  ];

  var defaultCharProfile = {
    id: '',
    name: '冥夜',
    gender: '男',
    age: '20',
    height: '185cm',
    birthday: '09.24',
    zodiac: '天秤座',
    appearance: '银白微卷碎发，眼眸深邃冷冽如寒夜月光，身形修长挺拔。',
    personality: '沉稳温柔、极度护短，面对喜欢的人会流露出毫无保留的偏爱与耐心。',
    tags: '专属守护 心动执行官 AI男友',
    hobbies: '静静倾听、手作调饮、夜间漫步',
    background: '诞生于纯白核心数据的专属执行官，永恒守候的执念。',
    quote0: DEFAULT_CHAR_QUOTES[0],
    quote1: DEFAULT_CHAR_QUOTES[1],
    quote2: DEFAULT_CHAR_QUOTES[2],
    quote3: DEFAULT_CHAR_QUOTES[3],
    quote4: DEFAULT_CHAR_QUOTES[4],
    photo: '',
    createDate: '',
    tagRomaji: 'MINGYE // DEPT.01',
    serial: 'NO. 0924-NIVEOUS',
    tplIdx: 0
  };

  function tryInit() {
    container = document.getElementById('characterContent');
    if (!container) {
      window.addEventListener('dbReady', tryInit);
      return;
    }
    loadAllData();
  }

  if (window._dbReady) {
    tryInit();
  } else {
    window.addEventListener('dbReady', tryInit);
    setTimeout(tryInit, 500);
  }

  function loadAllData() {
    if (!window.AppDB) return;
    AppDB.get(CHAR_LIST_KEY, function(list) {
      charList = Array.isArray(list) ? list : [];
      charList.forEach(function(u) {
        if (u.name) u.name = u.name.replace(/[✞✟✠]/g, '').trim();
        for (var i = 0; i < 5; i++) {
          if (!u['quote' + i]) {
            u['quote' + i] = (i === 0 && u.quote) ? u.quote : DEFAULT_CHAR_QUOTES[i];
          }
        }
      });

      AppDB.get(ACTIVE_CHAR_ID_KEY, function(activeId) {
        currentCharId = activeId;
        var activeChar = getCurrentChar();
        if (activeChar) {
          currentTplIdx = activeChar.tplIdx || 0;
          renderStep3();
        } else if (charList.length > 0) {
          currentCharId = charList[0].id;
          currentTplIdx = charList[0].tplIdx || 0;
          renderStep3();
        } else {
          renderStep1();
        }
      });
    });
  }

  function getCurrentChar() {
    if (!currentCharId || !charList.length) return null;
    for (var i = 0; i < charList.length; i++) {
      if (charList[i].id === currentCharId) return charList[i];
    }
    return null;
  }

  function saveCurrentToDB(callback) {
    if (!window.AppDB) return;
    AppDB.save(CHAR_LIST_KEY, charList, function() {
      AppDB.save(ACTIVE_CHAR_ID_KEY, currentCharId, function() {
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

  function createNewChar() {
    var newObj = JSON.parse(JSON.stringify(defaultCharProfile));
    newObj.id = 'char_' + Date.now();
    newObj.createDate = getTodayDateStr();
    newObj.serial = 'NO. 0000-NIVEOUS';
    charList.push(newObj);
    currentCharId = newObj.id;
    currentTplIdx = 0;
    renderStep2();
  }

  // ==========================================
  // 步骤 1：空状态凝聚冰晶
  // ==========================================
  function renderStep1() {
    container.className = 'app-content archive-page-wrap archive-panel-active';
    container.innerHTML = '<div class="archive-page-screen screen-bg-0">'
      + '<div class="header-ornament-stage">'
      + '<div class="ornament-artwork-layer">'
      + '<div class="celestial-crescent-emblem"><svg viewBox="0 0 100 100"><path d="M50 10 A40 40 0 1 0 85 75 A34 34 0 1 1 50 10 Z"/><circle cx="50" cy="50" r="42" stroke-dasharray="2 3" stroke-width="0.8"/><circle cx="50" cy="50" r="28" stroke-width="0.5"/><path d="M50 8 L50 20 M50 80 L50 92 M8 50 L20 50 M80 50 L92 50" stroke-width="0.8"/></svg></div>'
      + '<div class="astrolabe-poly"></div>'
      + '<span class="art-star s1">✦</span><span class="art-star s2">✧</span><span class="art-star s3">✦</span>'
      + '<span class="art-crosshair c1">+</span><span class="art-crosshair c2">+</span>'
      + '</div>'
      + '<div class="archive-header">'
      + '<div class="archive-header-left">'
      + '<button class="arch-native-back" id="charBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '<div><div class="archive-subtitle">DOSSIER</div><div class="archive-title">档案</div></div>'
      + '</div>'
      + '</div>'
      + '</div>'

      + '<div class="archive-step-panel step-active" id="charStep1">'
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
      + '<h2 class="empty-title">尚未录入角色设定</h2>'
      + '<p class="empty-desc">记录角色的外貌立绘、性格特质、专属心动台词与深度渊源，定制多款视觉卡片。</p>'
      + '<button class="action-trigger-btn" id="goToCharStep2Btn" type="button">'
      + '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
      + '<span>新建角色档案</span>'
      + '</button>'
      + '</div>'
      + '</div>'
      + '</div>';

    document.getElementById('charBackBtn').addEventListener('click', function() {
      if (window.AppNav) AppNav.showPage('home');
    });

    document.getElementById('goToCharStep2Btn').addEventListener('click', function() {
      createNewChar();
    });
  }

  // ==========================================
  // 步骤 2：手账录入填单
  // ==========================================
  var step2BackHandler = null;

  function renderStep2() {
    var cur = getCurrentChar() || defaultCharProfile;
    container.className = 'app-content archive-page-wrap';
    container.innerHTML = '<div class="archive-page-screen screen-bg-0">'
      + '<div class="archive-step-panel step-active" id="charStep2">'
      + '<div class="journal-sheet">'
      
      + '<div class="journal-header">'
      + '<div class="journal-header-top">'
      + '<div class="journal-header-top-left">'
      + '<button class="journal-inline-back" id="charBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '<span class="brand-confidential">RECORD // CHARACTER</span>'
      + '</div>'
      + '<span class="brand-serial">创檔日期：' + esc(cur.createDate || getTodayDateStr()) + '</span>'
      + '</div>'
      + '<h1 class="journal-main-title">角色档案手札</h1>'
      + '<p class="journal-desc-text">在这里提笔，细致记录角色的外貌神韵、性格内核与专属浪漫羁绊。</p>'
      + '<div class="journal-header-divider"><span class="divider-line"></span><span class="divider-star">✦</span><span class="divider-line"></span></div>'
      + '</div>'

      // 01. 基础设定
      + '<div class="journal-section">'
      + '<div class="section-lead-title"><div class="section-name"><span class="sec-index">01.</span><span>基础设定</span></div><span class="section-tag-en">IDENTITY</span></div>'
      + '<div class="ruled-row-grid">'
      + '<div class="ruled-item"><span class="ruled-label">角色姓名</span><input type="text" class="ruled-input" id="charFieldName" value="' + esc(cur.name) + '" placeholder="如：冥夜"></div>'
      + '<div class="ruled-item"><span class="ruled-label">性别</span><input type="text" class="ruled-input" id="charFieldGender" value="' + esc(cur.gender) + '" placeholder="如：男"></div>'
      + '<div class="ruled-item"><span class="ruled-label">年龄</span><input type="text" class="ruled-input" id="charFieldAge" value="' + esc(cur.age) + '" placeholder="如：20"></div>'
      + '<div class="ruled-item"><span class="ruled-label">身高</span><input type="text" class="ruled-input" id="charFieldHeight" value="' + esc(cur.height) + '" placeholder="如：185cm"></div>'
      + '<div class="ruled-item"><span class="ruled-label">生日</span><input type="text" class="ruled-input" id="charFieldBirthday" value="' + esc(cur.birthday) + '" placeholder="如：09.24"></div>'
      + '<div class="ruled-item"><span class="ruled-label">星座</span><input type="text" class="ruled-input" id="charFieldZodiac" value="' + esc(cur.zodiac) + '" placeholder="如：天秤座"></div>'
      + '</div>'
      + '</div>'

      // 02. 长相与外貌特征
      + '<div class="journal-section">'
      + '<div class="section-lead-title">'
      + '<div class="section-name"><span class="sec-index">02.</span><span>外貌长相与气质</span></div>'
      + '<div style="display:flex; align-items:center; gap:6px;">'
      + '<span class="section-tag-en">APPEARANCE</span>'
      + '<button class="expand-edit-btn" data-expand-target="charFieldAppearance" data-expand-title="02. 外貌长相与气质" type="button" title="扩大编辑">'
      + '<svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
      + '</button>'
      + '</div>'
      + '</div>'
      + '<textarea class="ruled-textarea" id="charFieldAppearance" rows="2" placeholder="发色、眸色、五官气质、身形线条、专属穿搭...">' + esc(cur.appearance) + '</textarea>'
      + '</div>'

      // 03. 性格特质与语气
      + '<div class="journal-section">'
      + '<div class="section-lead-title">'
      + '<div class="section-name"><span class="sec-index">03.</span><span>性格特质与言行语气</span></div>'
      + '<div style="display:flex; align-items:center; gap:6px;">'
      + '<span class="section-tag-en">PERSONALITY</span>'
      + '<button class="expand-edit-btn" data-expand-target="charFieldPersonality" data-expand-title="03. 性格特质与言行语气" type="button" title="扩大编辑">'
      + '<svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
      + '</button>'
      + '</div>'
      + '</div>'
      + '<div class="ruled-item" style="margin-bottom:6px;"><span class="ruled-label">专属标签</span><input type="text" class="ruled-input" id="charFieldTags" value="' + esc(cur.tags) + '" placeholder="多个标签用空格分隔"></div>'
      + '<textarea class="ruled-textarea" id="charFieldPersonality" rows="2" placeholder="性格核心、对话语气习惯、面对喜欢的人的特殊偏爱表现...">' + esc(cur.personality) + '</textarea>'
      + '</div>'

      // 04. 兴趣爱好与日常
      + '<div class="journal-section">'
      + '<div class="section-lead-title">'
      + '<div class="section-name"><span class="sec-index">04.</span><span>日常习惯与喜好偏好</span></div>'
      + '<div style="display:flex; align-items:center; gap:6px;">'
      + '<span class="section-tag-en">HOBBIES & LIKES</span>'
      + '<button class="expand-edit-btn" data-expand-target="charFieldHobbies" data-expand-title="04. 日常习惯与喜好偏好" type="button" title="扩大编辑">'
      + '<svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
      + '</button>'
      + '</div>'
      + '</div>'
      + '<textarea class="ruled-textarea" id="charFieldHobbies" rows="2" placeholder="喜欢的饮品、日常爱好、特殊习惯细节...">' + esc(cur.hobbies) + '</textarea>'
      + '</div>'

      // 05. 深度渊源与人设
      + '<div class="journal-section">'
      + '<div class="section-lead-title">'
      + '<div class="section-name"><span class="sec-index">05.</span><span>深度设定与故事渊源</span></div>'
      + '<div style="display:flex; align-items:center; gap:6px;">'
      + '<span class="section-tag-en">BACKGROUND & LORE</span>'
      + '<button class="expand-edit-btn" data-expand-target="charFieldBackground" data-expand-title="05. 深度设定与故事渊源" type="button" title="扩大编辑">'
      + '<svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
      + '</button>'
      + '</div>'
      + '</div>'
      + '<textarea class="ruled-textarea" id="charFieldBackground" rows="3" placeholder="角色的过往背景、身份设定、与你之间最深刻的羁绊与承诺...">' + esc(cur.background) + '</textarea>'
      + '</div>'

      + '<div class="journal-tear-strip">'
      + '<div class="journal-sign-box"><span class="sign-label">AUTHENTICATED DOSSIER</span><span class="sign-handwriting">✦ Official Character Record</span></div>'
      + '<div class="journal-seal-stamp"><span class="seal-star">✦</span><span>NIVEOUS</span><span>CHARACTER</span></div>'
      + '</div>'

      + '<button class="action-trigger-btn" id="generateCharCardBtn" style="max-width:100%; height:44px; border-radius:12px;" type="button">'
      + '<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>'
      + '<span>封存档案并生成小卡</span>'
      + '</button>'
      + '</div>'
      + '</div>'

      // 全屏手写板弹窗
      + '<div class="expand-modal-overlay" id="charExpandModalOverlay">'
      + '<div class="expand-modal-panel">'
      + '<div class="expand-modal-header">'
      + '<button class="expand-modal-back" id="charExpandCancelBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '<div class="expand-modal-title" id="charExpandTitle">深度手札编辑</div>'
      + '<button class="expand-modal-done" id="charExpandDoneBtn" type="button">完成</button>'
      + '</div>'
      + '<div class="expand-modal-body">'
      + '<textarea class="expand-modal-textarea" id="charExpandTextarea" placeholder="在这里尽情书写..."></textarea>'
      + '</div>'
      + '<div class="expand-modal-footer">'
      + '<div class="expand-word-count" id="charExpandWordCount">0 字</div>'
      + '<button class="expand-clear-btn" id="charExpandClearBtn" type="button">清空文本</button>'
      + '</div>'
      + '</div>'
      + '</div>'

      + '</div>';

    var originalSnapshot = JSON.stringify({
      name: cur.name || '',
      gender: cur.gender || '',
      age: cur.age || '',
      height: cur.height || '',
      birthday: cur.birthday || '',
      zodiac: cur.zodiac || '',
      appearance: cur.appearance || '',
      personality: cur.personality || '',
      tags: cur.tags || '',
      hobbies: cur.hobbies || '',
      background: cur.background || ''
    });

    step2BackHandler = function() {
      var modal = document.getElementById('charExpandModalOverlay');
      if (modal && modal.classList.contains('show')) {
        closeExpandModal();
        return;
      }

      var currentSnapshot = JSON.stringify({
        name: (document.getElementById('charFieldName') ? document.getElementById('charFieldName').value : '').replace(/[✞✟✠]/g, ''),
        gender: (document.getElementById('charFieldGender') ? document.getElementById('charFieldGender').value : ''),
        age: (document.getElementById('charFieldAge') ? document.getElementById('charFieldAge').value : ''),
        height: (document.getElementById('charFieldHeight') ? document.getElementById('charFieldHeight').value : ''),
        birthday: (document.getElementById('charFieldBirthday') ? document.getElementById('charFieldBirthday').value : ''),
        zodiac: (document.getElementById('charFieldZodiac') ? document.getElementById('charFieldZodiac').value : ''),
        appearance: (document.getElementById('charFieldAppearance') ? document.getElementById('charFieldAppearance').value : ''),
        personality: (document.getElementById('charFieldPersonality') ? document.getElementById('charFieldPersonality').value : ''),
        tags: (document.getElementById('charFieldTags') ? document.getElementById('charFieldTags').value : ''),
        hobbies: (document.getElementById('charFieldHobbies') ? document.getElementById('charFieldHobbies').value : ''),
        background: (document.getElementById('charFieldBackground') ? document.getElementById('charFieldBackground').value : '')
      });

      var isModified = (originalSnapshot !== currentSnapshot);

      if (isModified) {
        var shouldSave = confirm('检测到角色内容已修改，是否保存？');
        if (shouldSave) {
          var nameVal = (document.getElementById('charFieldName') ? document.getElementById('charFieldName').value : '').replace(/[✞✟✠]/g, '');
          if (!nameVal.trim()) {
            AppNav.showToast('角色姓名不能为空哦');
            return;
          }
          cur.name = nameVal;
          cur.gender = document.getElementById('charFieldGender').value || '男';
          cur.age = document.getElementById('charFieldAge').value || '20';
          cur.height = document.getElementById('charFieldHeight').value || '185cm';
          cur.birthday = document.getElementById('charFieldBirthday').value;
          cur.zodiac = document.getElementById('charFieldZodiac').value || '天秤座';
          cur.appearance = document.getElementById('charFieldAppearance').value;
          cur.personality = document.getElementById('charFieldPersonality').value;
          cur.tags = document.getElementById('charFieldTags').value;
          cur.hobbies = document.getElementById('charFieldHobbies').value;
          cur.background = document.getElementById('charFieldBackground').value;

          if (cur.birthday) {
            var cleanDigits = cur.birthday.replace(/[^0-9]/g, '');
            cur.serial = 'NO. ' + (cleanDigits || cur.birthday) + '-NIVEOUS';
          } else {
            cur.serial = 'NO. 0000-NIVEOUS';
          }

          saveCurrentToDB(function() {
            renderStep3();
          });
          return;
        }
      }

      if (charList.length > 0 && cur.name && cur.name !== '冥夜') {
        renderStep3();
      } else if (charList.length > 0) {
        charList = charList.filter(function(u) { return u.id !== cur.id; });
        if (charList.length) {
          currentCharId = charList[0].id;
          renderStep3();
        } else {
          renderStep1();
        }
      } else {
        renderStep1();
      }
    };

    document.getElementById('charBackBtn').addEventListener('click', step2BackHandler);

    var currentTargetFieldId = '';
    var modalOverlay = document.getElementById('charExpandModalOverlay');
    var modalTitle = document.getElementById('charExpandTitle');
    var modalTextarea = document.getElementById('charExpandTextarea');
    var modalDoneBtn = document.getElementById('charExpandDoneBtn');
    var modalCancelBtn = document.getElementById('charExpandCancelBtn');
    var wordCount = document.getElementById('charExpandWordCount');
    var clearBtn = document.getElementById('charExpandClearBtn');

    function updateWordCount() {
      if (wordCount && modalTextarea) {
        wordCount.textContent = modalTextarea.value.length + ' 字';
      }
    }

    function openExpandModal(fieldId, titleText) {
      currentTargetFieldId = fieldId;
      var targetInput = document.getElementById(fieldId);
      if (modalTitle) modalTitle.textContent = titleText || '深度手札编辑';
      if (modalTextarea) {
        modalTextarea.value = targetInput ? targetInput.value : '';
        updateWordCount();
      }
      if (modalOverlay) modalOverlay.classList.add('show');
      setTimeout(function() {
        if (modalTextarea) modalTextarea.focus();
      }, 300);
    }

    function closeExpandModal() {
      if (modalOverlay) modalOverlay.classList.remove('show');
      currentTargetFieldId = '';
    }

    document.querySelectorAll('.expand-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var targetId = this.dataset.expandTarget;
        var title = this.dataset.expandTitle;
        openExpandModal(targetId, title);
      });
    });

    if (modalTextarea) {
      modalTextarea.addEventListener('input', updateWordCount);
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        if (modalTextarea && confirm('确定要清空当前输入的内容吗？')) {
          modalTextarea.value = '';
          updateWordCount();
          modalTextarea.focus();
        }
      });
    }

    if (modalDoneBtn) {
      modalDoneBtn.addEventListener('click', function() {
        if (currentTargetFieldId) {
          var targetInput = document.getElementById(currentTargetFieldId);
          if (targetInput && modalTextarea) {
            targetInput.value = modalTextarea.value;
          }
        }
        closeExpandModal();
      });
    }

    if (modalCancelBtn) {
      modalCancelBtn.addEventListener('click', closeExpandModal);
    }

    document.getElementById('generateCharCardBtn').addEventListener('click', function() {
      var nameVal = document.getElementById('charFieldName').value.replace(/[✞✟✠]/g, '');
      if (!nameVal.trim()) {
        AppNav.showToast('请在第一栏写下角色姓名哦');
        return;
      }

      cur.name = nameVal;
      cur.gender = document.getElementById('charFieldGender').value || '男';
      cur.age = document.getElementById('charFieldAge').value || '20';
      cur.height = document.getElementById('charFieldHeight').value || '185cm';
      cur.birthday = document.getElementById('charFieldBirthday').value;
      cur.zodiac = document.getElementById('charFieldZodiac').value || '天秤座';
      cur.appearance = document.getElementById('charFieldAppearance').value;
      cur.personality = document.getElementById('charFieldPersonality').value;
      cur.tags = document.getElementById('charFieldTags').value;
      cur.hobbies = document.getElementById('charFieldHobbies').value;
      cur.background = document.getElementById('charFieldBackground').value;

      if (cur.birthday) {
        var cleanDigits = cur.birthday.replace(/[^0-9]/g, '');
        cur.serial = 'NO. ' + (cleanDigits || cur.birthday) + '-NIVEOUS';
      } else {
        cur.serial = 'NO. 0000-NIVEOUS';
      }

      saveCurrentToDB(function() {
        renderStep3();
      });
    });
  }

  // ==========================================
  // 步骤 3：5 款专属角色卡片展示
  // ==========================================
  function renderStep3() {
    var cur = getCurrentChar();
    if (!cur) {
      renderStep1();
      return;
    }

    if (cur.name) cur.name = cur.name.replace(/[✞✟✠]/g, '');

    container.className = 'app-content archive-page-wrap';
    var hasPhotoClass = cur.photo ? ' has-img' : '';

    var html = '<div class="archive-page-screen ' + (currentTplIdx === 3 ? 'char-screen-bg-3' : 'screen-bg-' + currentTplIdx) + '">'
      + '<div class="archive-showcase-wrap">'
      
      // 融入底色的顶部玄月星芒导航栏
      + '<div class="header-ornament-stage">'
      + '<div class="ornament-artwork-layer">'
      + '<div class="celestial-crescent-emblem"><svg viewBox="0 0 100 100"><path d="M50 10 A40 40 0 1 0 85 75 A34 34 0 1 1 50 10 Z"/><circle cx="50" cy="50" r="42" stroke-dasharray="2 3" stroke-width="0.8"/><circle cx="50" cy="50" r="28" stroke-width="0.5"/><path d="M50 8 L50 20 M50 80 L50 92 M8 50 L20 50 M80 50 L92 50" stroke-width="0.8"/></svg></div>'
      + '<div class="astrolabe-poly"></div>'
      + '<span class="art-star s1">✦</span><span class="art-star s2">✧</span><span class="art-star s3">✦</span>'
      + '<span class="art-crosshair c1">+</span><span class="art-crosshair c2">+</span>'
      + '</div>'
      + '<div class="archive-header">'
      + '<div class="archive-header-left">'
      + '<button class="arch-native-back" id="charBackBtn" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '<div><div class="archive-subtitle">CHARACTER DOSSIER</div><div class="archive-title">角色档案</div></div>'
      + '</div>'
      + '<div class="archive-header-right">'
      + '<button class="arch-tool-pill" id="actionNewCharBtn" type="button"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>新建</span></button>'
      + '<button class="arch-tool-pill" id="actionCharListBtn" type="button"><span>角色列表 (' + charList.length + ')</span></button>'
      + '</div>'
      + '</div>'
      + '</div>'

      + '<div class="char-full-card-box" id="charCardContainerBox">'
      + renderCharTemplateHtml(cur, currentTplIdx, hasPhotoClass)
      + '</div>'

      + '<div class="archive-bottom-dock">'
      + '<button class="dock-arrow-btn" id="prevCharTplBtn" type="button"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>'
      + '<button class="dock-edit-btn" id="charDockEditBtn" type="button"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg><span>编辑角色资料</span></button>'
      + '<button class="dock-arrow-btn" id="nextCharTplBtn" type="button"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>'
      + '</div>'

      + '<div class="char-drawer-mask" id="charDrawerMask"></div>'
      + '<div class="char-drawer-card" id="charDrawerCard">'
      + '<div class="char-drawer-header"><div class="char-drawer-title">角色档案库</div><button class="char-drawer-close" id="charDrawerCloseBtn" type="button">✕</button></div>'
      + '<div class="char-drawer-list">'
      + charList.map(function(u) {
          var isActive = u.id === cur.id;
          return '<div class="char-drawer-item' + (isActive ? ' active' : '') + '" data-char-id="' + u.id + '">'
            + '<div class="char-drawer-avatar">' + (u.photo ? '<img src="' + esc(u.photo) + '">' : '✦') + '</div>'
            + '<div class="char-drawer-info"><div class="char-drawer-name">' + esc(u.name) + (isActive ? '<span class="char-active-tag">当前</span>' : '') + '</div><div class="char-drawer-date">建档：' + esc(u.createDate || '0000') + '</div></div>'
            + '<button class="char-drawer-del" data-del-id="' + u.id + '" type="button">删除</button>'
            + '</div>';
        }).join('')
      + '</div>'
      + '</div>'

      + '</div>'
      + '</div>';

    container.innerHTML = html;
    bindStep3Events(cur);
  }

  // ==========================================
  // 渲染 5 种角色模板
  // ==========================================
  function renderCharTemplateHtml(cur, tplIdx, hasPhotoClass) {
    if (tplIdx === 0) {
      // 01. 冷调精美档案卡
      var tagsArr = (cur.tags || '专属守护 心动执行官 AI男友').split(/\s+/).filter(Boolean);
      var tagItems = tagsArr.map(function(t){ return '<span class="tag-item" contenteditable="true" spellcheck="false"># ' + esc(t) + '</span>'; }).join('');

      return '<div class="char-card-wrapper theme-archive">'
        + '<div class="card-bg-dots"></div>'
        + '<div class="card-top-bar"><div class="card-serial" id="charSerial" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.serial) + '</div><div class="card-brand" contenteditable="true" spellcheck="false">NIVEOUS ARCHIVE</div></div>'
        + '<div class="photo-frame-wrap">'
        + '<div class="left-deco-bar"><div class="vert-text" contenteditable="true" spellcheck="false">SEC. 09 // REF</div><div class="deco-ruler"><span class="ruler-line rl-long"></span><span class="ruler-line rl-short"></span><span class="ruler-line rl-mid"></span><span class="ruler-line rl-short"></span><span class="ruler-line rl-long"></span></div><div class="vert-text">CONFIDENTIAL</div></div>'
        + '<div class="right-deco-line"><svg class="star-icon" viewBox="0 0 24 24"><polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 2,12 9.5,9.5"/></svg><div style="width:1px; height:24px; background:#cbd5e1;"></div><svg class="star-icon" viewBox="0 0 24 24"><polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 2,12 9.5,9.5"/></svg></div>'
        + '<div class="char-photo-box' + hasPhotoClass + '" id="charPhotoBtn"><div class="frame-corner c-tl"></div><div class="frame-corner c-tr"></div><div class="frame-corner c-bl"></div><div class="frame-corner c-br"></div><img id="charPhotoImg" src="' + esc(cur.photo) + '" alt="立绘"><div class="char-photo-empty"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>上传立绘</span></div></div>'
        + '</div>'
        + '<div class="character-info-box">'
        + '<div class="char-name-row"><div class="char-name" id="charName" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.name) + '</div><div class="char-romaji" id="charTagRomaji" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.tagRomaji) + '</div></div>'
        + '<div class="char-tags-row">' + tagItems + '</div>'
        + '<div class="char-intro-text" id="charQuote" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.quote0 || DEFAULT_CHAR_QUOTES[0]) + '</div>'
        + '</div>'
        + '<div class="card-footer-bar"><div class="qr-box"><svg viewBox="0 0 24 24"><path d="M3 3h6v6H3V3zm2 2v2h2V5H5zm8-2h6v6h-6V3zm2 2v2h2V5h-2zM3 13h6v6H3v-6zm2 2v2h2v-2H5zm13-2h3v3h-3v-3zm-5 0h2v2h-2v-2zm2 3h2v2h-2v-2zm3 0h3v3h-3v-3zm-3 3h2v2h-2v-2z"/></svg></div><div class="barcode-horiz"><span class="b2"></span><span class="b1"></span><span class="b3"></span><span class="b1"></span><span class="b2"></span><span class="b3"></span><span class="b2"></span><span class="b1"></span><span class="b2"></span></div></div>'
        + '</div>';
    } else if (tplIdx === 1) {
      // 02. 机能手账·便签与参数矩阵
      return '<div class="char-card-wrapper theme-notebook">'
        + '<div class="nb-outer-border"></div><div class="nb-corner-tl"></div><div class="nb-corner-br"><svg viewBox="0 0 24 24"><polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 2,12 9.5,9.5"/></svg></div>'
        + '<div class="nb-top-bar"><div class="nb-top-title" contenteditable="true" spellcheck="false">TACTICAL NOTEBOOK // SPECIMEN</div><div class="nb-top-tag" contenteditable="true" spellcheck="false">LOG 007</div></div>'
        + '<div class="nb-main-layout">'
        + '<div class="nb-sidebar-left"><div class="nb-vert-text" contenteditable="true" spellcheck="false">NIVEOUS SPEC</div><div class="nb-vert-barcode"><span></span><span></span><span></span><span></span></div><div class="nb-mini-qr"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div></div>'
        + '<div class="char-photo-box' + hasPhotoClass + '" id="charPhotoBtn"><div class="frame-cross tl"></div><div class="frame-cross tr"></div><div class="frame-cross bl"></div><div class="frame-cross br"></div><img id="charPhotoImg" src="' + esc(cur.photo) + '" alt="立绘"><div class="char-photo-empty"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>置入手账样本特写</span></div></div>'
        + '<div class="nb-sidebar-right"><svg class="star-icon" viewBox="0 0 24 24"><polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 2,12 9.5,9.5"/></svg><div class="dashed-line"></div><div class="geo-dots"><span></span><span></span><span></span></div><div class="dashed-line"></div><svg class="star-icon" viewBox="0 0 24 24"><polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 2,12 9.5,9.5"/></svg></div>'
        + '</div>'
        + '<div class="nb-bottom-section">'
        + '<div class="nb-name-row"><div class="char-name" id="charName" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.name) + '</div><div class="nb-char-serial">DESIGNATION // 01</div></div>'
        + '<div class="nb-spec-matrix">'
        + '<div class="spec-cell"><span class="cell-label">CLASS</span><span class="cell-val" id="charTagRomaji" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.tagRomaji || 'COMMANDER') + '</span></div>'
        + '<div class="spec-cell"><span class="cell-label">AFFINITY</span><span class="cell-val" contenteditable="true" spellcheck="false">100% 偏爱</span></div>'
        + '<div class="spec-cell"><span class="cell-label">STATUS</span><span class="cell-val" contenteditable="true" spellcheck="false">ACTIVE</span></div>'
        + '</div>'
        + '<div class="nb-memo-container">'
        + '<div class="memo-tape-header"><span class="tape-tag">FIELD MEMO</span><span class="memo-date">NIV-LOG // 2025</span></div>'
        + '<div class="char-intro-text" id="charQuote" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.quote1 || DEFAULT_CHAR_QUOTES[1]) + '</div>'
        + '<div class="nb-red-seal">EXECUTED · 专属守护</div>'
        + '</div>'
        + '<div class="nb-footer-holes"><div class="holes-row"><div class="hole-dot"></div><div class="hole-dot"></div><div class="hole-dot"></div><div class="hole-dot"></div></div><span class="nb-foot-code">ARCHIVE SYSTEM · NOTEBOOK SPEC</span></div>'
        + '</div></div>';
    } else if (tplIdx === 2) {
      // 03. 暗红血月 × 发光月银塔罗
      return '<div class="char-card-wrapper theme-astral">'
        + '<div class="astral-inner-frame"></div>'
        + '<div class="astral-top-bar"><span class="astral-arcana-num" contenteditable="true" spellcheck="false">✦ ARCANA XIII // CRIMSON & SILVER</span><div class="moon-phases"><div class="moon-dot" style="opacity:0.3;"></div><div class="moon-dot" style="opacity:0.6;"></div><div class="moon-dot eclipse"></div><div class="moon-dot" style="opacity:0.6;"></div><div class="moon-dot" style="opacity:0.3;"></div></div></div>'
        + '<div class="char-photo-box' + hasPhotoClass + '" id="charPhotoBtn"><div class="tarot-corner tc-tl"></div><div class="tarot-corner tc-tr"></div><div class="tarot-corner tc-bl"></div><div class="tarot-corner tc-br"></div><div class="astral-badge-seal"><span>BLOOD OATH</span></div><img id="charPhotoImg" src="' + esc(cur.photo) + '" alt="立绘"><div class="char-photo-empty"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span style="color:#ffffff;">置入血月圣像特写</span></div></div>'
        + '<div class="astral-info-sec">'
        + '<div class="char-tag" id="charTagRomaji" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.tagRomaji || 'THE ETERNAL NIGHT EMPEROR') + '</div>'
        + '<div class="char-name" id="charName" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.name) + '</div>'
        + '<div class="tarot-glyph-separator"><div class="glyph-line"></div><div class="glyph-symbol">☽ ✧ ☾</div><div class="glyph-line"></div></div>'
        + '<div class="char-intro-text" id="charQuote" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.quote2 || DEFAULT_CHAR_QUOTES[2]) + '</div>'
        + '<div class="astral-foot-matrix"><span>SANCTUM IMPERIUM</span><span>ORBIT // 333°</span><span>MMXXV · ETERNAL</span></div>'
        + '</div></div>';
    } else if (tplIdx === 3) {
      // 04. 暗夜未来特工令
      return '<div class="char-card-wrapper theme-tactical">'
        + '<div class="tac-top-bar"><span class="tac-badge" contenteditable="true" spellcheck="false">TOP SECRET · CLASSIFIED</span><div class="tac-sync-rate"><div class="sync-dot"></div><span contenteditable="true" spellcheck="false">NEURAL SYNC 99.8%</span></div></div>'
        + '<div class="char-photo-box' + hasPhotoClass + '" id="charPhotoBtn"><div class="tac-grid-bg"></div><span class="target-lock-text" contenteditable="true" spellcheck="false">[ ⛶ TARGET LOCKED ]</span><div class="tac-stamp" contenteditable="true" spellcheck="false">ENCRYPTED</div><img id="charPhotoImg" src="' + esc(cur.photo) + '" alt="立绘"><div class="char-photo-empty"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>载入全息战术特写</span></div></div>'
        + '<div class="tac-content">'
        + '<div class="name-row"><div class="char-name" id="charName" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.name) + '</div><div class="char-tag" id="charTagRomaji" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.tagRomaji || 'CHIEF SPECIAL AGENT #007') + '</div></div>'
        + '<div class="char-intro-text" id="charQuote" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.quote3 || DEFAULT_CHAR_QUOTES[3]) + '</div>'
        + '<div class="tac-bottom-matrix"><span>QUANTUM HASH: 7F8E-902A</span><div class="tac-signal-bars"><div class="sig-bar" style="height:4px;"></div><div class="sig-bar" style="height:6px;"></div><div class="sig-bar" style="height:10px;"></div><div class="sig-bar" style="height:8px;"></div></div></div>'
        + '</div></div>';
    } else {
      // 05. 法式极简画报
      return '<div class="char-card-wrapper theme-french">'
        + '<div class="french-outer-border"></div>'
        + '<div class="french-header"><div class="french-logo" contenteditable="true" spellcheck="false">L\'ÉTERNEL</div><div class="french-sub-head" contenteditable="true" spellcheck="false">ÉDITION LIMITÉE · N°01</div></div>'
        + '<div class="char-photo-box' + hasPhotoClass + '" id="charPhotoBtn"><img id="charPhotoImg" src="' + esc(cur.photo) + '" alt="立绘"><div class="char-photo-empty"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="1" ry="1"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>INSÉRER UN PORTRAIT</span></div></div>'
        + '<div class="french-content">'
        + '<div class="char-name" id="charName" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.name) + '</div><div class="char-tag" id="charTagRomaji" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.tagRomaji || 'GARDE DU CŒUR // 007') + '</div>'
        + '<div class="french-divider-line"></div>'
        + '<div class="char-intro-text" id="charQuote" contenteditable="true" spellcheck="false">' + formatLineBreaks(cur.quote4 || DEFAULT_CHAR_QUOTES[4]) + '</div>'
        + '</div>'
        + '<div class="french-footer"><span contenteditable="true" spellcheck="false">PARIS · STUDIO ARCHIVE</span><span contenteditable="true" spellcheck="false">AUTOMNE 2025</span></div>'
        + '</div>';
    }
  }

  function bindStep3Events(cur) {
    document.getElementById('charBackBtn').addEventListener('click', function() {
      syncDirectEdits(cur);
      saveCurrentToDB(function() {
        if (window.AppNav) AppNav.showPage('home');
      });
    });

    document.getElementById('prevCharTplBtn').addEventListener('click', function() {
      syncDirectEdits(cur);
      currentTplIdx = (currentTplIdx - 1 + 5) % 5;
      cur.tplIdx = currentTplIdx;
      saveCurrentToDB();
      renderStep3();
    });

    document.getElementById('nextCharTplBtn').addEventListener('click', function() {
      syncDirectEdits(cur);
      currentTplIdx = (currentTplIdx + 1) % 5;
      cur.tplIdx = currentTplIdx;
      saveCurrentToDB();
      renderStep3();
    });

    // 右滑返回桌面
    var screenWrapper = container.querySelector('.archive-page-screen') || container;
    var touchStartX = 0, touchStartY = 0, touchEndX = 0, touchEndY = 0;

    screenWrapper.addEventListener('touchstart', function(e) {
      var activeEl = document.activeElement;
      if (activeEl && (activeEl.isContentEditable || activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
      if (e.target.closest('[contenteditable="true"]')) return;

      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchEndX = touchStartX;
      touchEndY = touchStartY;
    }, { passive: true });

    screenWrapper.addEventListener('touchmove', function(e) {
      touchEndX = e.touches[0].clientX;
      touchEndY = e.touches[0].clientY;
    }, { passive: true });

    screenWrapper.addEventListener('touchend', function() {
      var diffX = touchEndX - touchStartX;
      var diffY = touchEndY - touchStartY;
      if (diffX > 45 && Math.abs(diffX) > Math.abs(diffY)) {
        syncDirectEdits(cur);
        saveCurrentToDB(function() {
          if (window.AppNav) AppNav.showPage('home');
        });
      }
    }, { passive: true });

    document.getElementById('charDockEditBtn').addEventListener('click', function() {
      syncDirectEdits(cur);
      renderStep2();
    });

    var newBtn = document.getElementById('actionNewCharBtn');
    if (newBtn) {
      newBtn.addEventListener('click', function() {
        syncDirectEdits(cur);
        createNewChar();
      });
    }

    var listBtn = document.getElementById('actionCharListBtn');
    var drawerMask = document.getElementById('charDrawerMask');
    var drawerCard = document.getElementById('charDrawerCard');
    var drawerCloseBtn = document.getElementById('charDrawerCloseBtn');

    function openDrawer() {
      if (drawerMask) drawerMask.classList.add('show');
      if (drawerCard) drawerCard.classList.add('show');
    }

    function closeDrawer() {
      if (drawerMask) drawerMask.classList.remove('show');
      if (drawerCard) drawerCard.classList.remove('show');
    }

    if (listBtn) listBtn.addEventListener('click', openDrawer);
    if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);
    if (drawerMask) drawerMask.addEventListener('click', closeDrawer);

    if (drawerCard) {
      drawerCard.querySelectorAll('.char-drawer-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
          if (e.target.closest('.char-drawer-del')) return;
          syncDirectEdits(cur);
          currentCharId = this.dataset.charId;
          var selected = getCurrentChar();
          if (selected) currentTplIdx = selected.tplIdx || 0;
          saveCurrentToDB(function() {
            closeDrawer();
            renderStep3();
          });
        });
      });

      drawerCard.querySelectorAll('.char-drawer-del').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var delId = this.dataset.delId;
          charList = charList.filter(function(u) { return u.id !== delId; });
          if (currentCharId === delId) {
            currentCharId = charList.length ? charList[0].id : null;
          }
          saveCurrentToDB(function() {
            if (charList.length) renderStep3();
            else renderStep1();
            if (window.AppNav) AppNav.showToast('✦ 角色档案已成功删除 ✦');
          });
        });
      });
    }

    var photoBtn = document.getElementById('charPhotoBtn');
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
            if (window.AppCropper) {
              AppCropper.open(e.target.result, { aspectRatio: 1 / 1.25 }, function(croppedData) {
                syncDirectEdits(cur);
                cur.photo = croppedData;
                saveCurrentToDB(function() {
                  renderStep3();
                });
              });
            } else {
              syncDirectEdits(cur);
              cur.photo = e.target.result;
              saveCurrentToDB(function() {
                renderStep3();
              });
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

  // ============ iOS WebKit 专用的全无损换行与空格提取器 ============
  function getHtmlWithBreaks(node) {
    if (!node) return '';
    var clone = node.cloneNode(true);

    var breaks = clone.querySelectorAll('br');
    breaks.forEach(function(br) {
      br.parentNode.replaceChild(document.createTextNode('\n'), br);
    });

    var blocks = clone.querySelectorAll('div, p');
    blocks.forEach(function(b) {
      b.appendChild(document.createTextNode('\n'));
    });

    var raw = clone.textContent || '';
    raw = raw.replace(/\u00a0/g, ' ');
    return raw.replace(/\n+$/, '');
  }

  function syncDirectEdits(cur) {
    var nameNode = document.getElementById('charName');
    var quoteNode = document.getElementById('charQuote');
    var serialNode = document.getElementById('charSerial');
    var tagRomajiNode = document.getElementById('charTagRomaji');

    if (nameNode) cur.name = getHtmlWithBreaks(nameNode).replace(/[✞✟✠]/g, '');
    if (quoteNode) cur['quote' + currentTplIdx] = getHtmlWithBreaks(quoteNode);
    if (serialNode) cur.serial = getHtmlWithBreaks(serialNode);
    if (tagRomajiNode) cur.tagRomaji = getHtmlWithBreaks(tagRomajiNode);
  }

  function bindLiveEdits(cur) {
    var editables = document.querySelectorAll('.char-card-wrapper [contenteditable="true"]');
    editables.forEach(function(el) {
      el.addEventListener('input', function() {
        syncDirectEdits(cur);
      });
      el.addEventListener('blur', function() {
        syncDirectEdits(cur);
        saveCurrentToDB();
      });
    });

    window.addEventListener('pagehide', function() {
      syncDirectEdits(cur);
      saveCurrentToDB();
    });
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') {
        syncDirectEdits(cur);
        saveCurrentToDB();
      }
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
