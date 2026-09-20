
(function () {
  'use strict';

  function esc(str) {
    return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
  }

  // ============ 1. 角色独立配置读取与持久化 ============
  function getCfg(charId) {
    var defaultCfg = {
      sceneText: '',           // 当前场景（背景补充）
      historyLimit: 20,        // 记忆深度/历史轮数 (0表示不限制，最高1000)
      innerVoice: true,        // 心声流露开关
      voiceLevel: 'normal',    // 'normal'(平常) | 'obsession'(迷恋·深度)
      mainLang: '简体中文',     // 主要语言
      bilingual: false,        // 双语模式
      biLang: 'English',       // 双语翻译目标语言
      biStyle: 'bracket',      // 'bracket'(括号附注) | 'newline'(另起一行)
      enFont: 'default',       // 'default' | 'caveat' | 'pinyon' | 'alex'
      minimax: false,          // MiniMax 语音开关
      mmVoiceId: '',           // MiniMax Voice ID
      mmApiKey: '',            // MiniMax API Key
      mmSpeed: 1,              // 语速 0.5 ~ 2.0
      mmPitch: 0,              // 音调 -12 ~ +12
      proactive: false,
      proMinInterval: 15,
      proMaxInterval: 120,
      proActiveMode: 'allday', // 'allday' | 'custom'
      proActiveStart: '08:00',
      proActiveEnd: '23:30',
      proLevelMode: 'manual',  // 'manual' | 'auto'
      proLevel: 3,
      replySpeed: '正常（2-4秒）',
      showTyping: true,
      minMsgs: 1,
      maxMsgs: 3,
      msgTypes: ['文字','表情','图片','语音','语音通话','视频通话','位置','音乐'],
      stickerGen: false,
      stickerStyles: ['Q版可爱卡通'],
      stickerFreq: 2,          // 1:极少 2:偶尔 3:适中 4:经常 5:频繁
      imgApiSelect: '',
      imgModel: 'gpt-image-1',
      timeWeather: true,
      charCity: '',
      charRealCity: '',
      apiMode: 'global',
      apiSelect: '',
      temperature: 0.85,
      freqPenalty: 0.3,
      presPenalty: 0.3
    };
    try {
      var saved = localStorage.getItem('wx_char_cfg_' + charId);
      if (saved) return Object.assign({}, defaultCfg, JSON.parse(saved));
    } catch(e) {}
    return defaultCfg;
  }

  function saveCfg(charId, cfg) {
    try {
      localStorage.setItem('wx_char_cfg_' + charId, JSON.stringify(cfg));
    } catch(e) {}
    if (window.AppDB) window.AppDB.save('wx_char_cfg_' + charId, cfg);
  }

  function getActiveApi(charId) {
    var cfg = getCfg(charId);
    var list = [];
    try {
      list = JSON.parse(localStorage.getItem('api_configs') || '[]');
    } catch(e) {}

    if (cfg.apiMode === 'individual' && cfg.apiSelect) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].name === cfg.apiSelect) return list[i];
      }
    }
    try {
      var act = JSON.parse(localStorage.getItem('active_api') || 'null');
      if (act) return act;
    } catch(e) {}
    return list.length ? list[0] : null;
  }

  // ============ 2. 弹窗外壳创建 ============
  function ensureSettingsMask(currentChar) {
    var existing = document.getElementById('wxCrSettingsModalMask');
    if (existing) return existing;

    var mask = document.createElement('div');
    mask.className = 'wx-cr-settings-mask';
    mask.id = 'wxCrSettingsModalMask';

    mask.innerHTML = '<div class="wx-cr-settings-card" id="wxCrSettingsCard">'
      + '  <div class="sanctuary-header-luxury">'
      + '    <div class="header-main-action-row">'
      + '      <div class="header-left-spacer"></div>'
      + '      <div class="header-center-art-col">'
      + '        <span class="art-script-motto">Sanctuary</span>'
      + '        <div class="art-title-chinese"><span class="star-dot">✦</span>' + esc(currentChar.name || '角色') + ' · 设定中枢<span class="star-dot">✦</span></div>'
      + '      </div>'
      + '      <button class="header-pure-close" id="wxCrSetCloseBtn" type="button" title="关闭"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>'
      + '    </div>'
      + '    <div class="header-bottom-ruler-deck"><span class="ruler-line"></span><span class="ruler-center-tag">✦ DOSSIER CONFIG ✦</span><span class="ruler-line"></span></div>'
      + '  </div>'
      + '  <div class="wx-cr-set-body" id="wxCrSetBody"></div>'
      + '  <div class="sanctuary-bottom-deck"></div>'
      + '</div>';

    document.body.appendChild(mask);
    return mask;
  }

  // ============ 3. 渲染原本的表单内容 ============
  function renderFullSettingsDOM(mask, cfg, currentChar) {
    var setBody = mask.querySelector('#wxCrSetBody');
    if (!setBody) return;

    var sv = function(k, v) { return cfg[k] === v ? ' selected' : ''; };
    var STK_STYLES = ['Q版可爱卡通','黑白线条','复古插画','写实萌物','像素风','手绘水彩','搞怪表情包'];
    var PRO_LEVEL_NAMES = ['佛系','偶尔','适中','频繁','粘人'];
    var STK_FREQ_NAMES = ['极少','偶尔','适中','经常','频繁'];

    var isIndividual = (cfg.apiMode === 'individual');
    var isAllDay = (cfg.proActiveMode === 'allday');
    var isManualLevel = (cfg.proLevelMode === 'manual');
    var isObsession = (cfg.voiceLevel === 'obsession');

    var stkStylesHtml = STK_STYLES.map(function(s) {
      var checked = (cfg.stickerStyles && cfg.stickerStyles.indexOf(s) >= 0) ? ' checked' : '';
      return '<label class="gothic-chip"><input type="checkbox" data-stk-style="' + s + '"' + checked + '><span>' + s + '</span></label>';
    }).join('');

    var apiList = [];
    try { apiList = JSON.parse(localStorage.getItem('api_configs') || '[]'); } catch(e){}
    var apiOptionsHtml = '<option value="">跟随全局 API</option>' + apiList.map(function(a) {
      var sel = cfg.apiSelect === a.name ? ' selected' : '';
      return '<option value="' + esc(a.name) + '"' + sel + '>' + esc(a.name) + ' (' + esc(a.model || '') + ')</option>';
    }).join('');

    var imgApiOptionsHtml = '<option value="">跟随全局 API</option>' + apiList.map(function(a) {
      var sel = cfg.imgApiSelect === a.name ? ' selected' : '';
      return '<option value="' + esc(a.name) + '"' + sel + '>' + esc(a.name) + '</option>';
    }).join('');

    var histVal = parseInt(cfg.historyLimit, 10);
    if (isNaN(histVal)) histVal = 20;
    var histText = (histVal === 0) ? ' (不限制)' : ' 轮';

    setBody.innerHTML = ''
      // 01. 场景与记忆
      + '<div class="gothic-card">'
      + '  <div class="gothic-head-row">'
      + '    <div class="gothic-title-group"><span class="gothic-sec-roman">§ 01</span><span class="gothic-sec-title">场景与记忆</span></div>'
      + '    <span class="gothic-sec-en">Lore & Context</span>'
      + '  </div>'
      + '  <div class="scripture-textarea-wrap">'
      + '    <div class="scripture-top-bar">'
      + '      <span class="scripture-label">当前场景（背景补充）</span>'
      + '      <button class="scripture-expand-btn" id="btnExpandScene" type="button" title="放大手札"><svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></button>'
      + '    </div>'
      + '    <textarea class="scripture-textarea" id="cfgSceneText" placeholder="在此书写角色此刻所处的具体场景、周遭氛围或特定故事背景，让每次交谈都充满沉浸感...">' + esc(cfg.sceneText || '') + '</textarea>'
      + '  </div>'
      + '  <div class="metric-gauge-box">'
      + '    <div class="gauge-head">'
      + '      <span class="gauge-title">记忆深度 / 历史轮数</span>'
      + '      <div style="display:flex; align-items:center; gap:4px;"><input class="gothic-input num" id="cfgHistoryNum" type="number" min="0" max="1000" value="' + histVal + '"><span style="font-size:11px; color:#8e8e93;" id="txtHistLimitUnit">' + histText + '</span></div>'
      + '    </div>'
      + '    <p class="gauge-desc">发送给模型的历史对话轮数。输入或滑动至最左侧 0 为不限制，最右侧为 1000 轮。</p>'
      + '    <div class="gauge-slider-deck">'
      + '      <span class="gauge-bound">0 (不限)</span>'
      + '      <input class="gothic-range" id="cfgHistoryLimit" type="range" min="0" max="1000" step="5" value="' + histVal + '">'
      + '      <span class="gauge-bound">1000</span>'
      + '    </div>'
      + '  </div>'
      + '</div>'

      // 02. 心声流露
      + '<div class="gothic-card">'
      + '  <div class="gothic-head-row">'
      + '    <div class="gothic-title-group"><span class="gothic-sec-roman">§ 02</span><span class="gothic-sec-title">心声流露</span></div>'
      + '    <span class="gothic-sec-en">Inner Voice</span>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <div class="gothic-row-label-col"><span class="gothic-label">心声流露</span><span class="gothic-desc">开启后每轮回复末尾附带内心独白与当下举止</span></div>'
      + '    <div class="wx-switch' + (cfg.innerVoice ? ' on' : '') + '" id="swInnerVoice"><div class="wx-switch-knob"></div></div>'
      + '  </div>'
      + '  <div class="gothic-row" id="rowVoiceLevel" style="' + (cfg.innerVoice ? '' : 'display:none;') + 'border-top:1px dashed rgba(20,22,25,0.1); padding-top:8px;">'
      + '    <span class="gothic-label">流露程度</span>'
      + '    <div style="display:flex; gap:14px;">'
      + '      <label class="cr-custom-radio"><input type="radio" name="rdoVoiceLevel" value="normal"' + (!isObsession ? ' checked' : '') + '><span class="cr-radio-circle"></span> 平常</label>'
      + '      <label class="cr-custom-radio"><input type="radio" name="rdoVoiceLevel" value="obsession"' + (isObsession ? ' checked' : '') + '><span class="cr-radio-circle"></span> 迷恋 (深度)</label>'
      + '    </div>'
      + '  </div>'
      + '</div>'

      // 03. 主动发消息
      + '<div class="gothic-card">'
      + '  <div class="gothic-head-row">'
      + '    <div class="gothic-title-group"><span class="gothic-sec-roman">§ 03</span><span class="gothic-sec-title">主动发消息</span></div>'
      + '    <span class="gothic-sec-en">Proactive</span>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <div class="gothic-row-label-col"><span class="gothic-label">开启主动联系</span><span class="gothic-desc">角色会根据闲置时间主动发起话题</span></div>'
      + '    <div class="wx-switch' + (cfg.proactive ? ' on' : '') + '" id="swProactive"><div class="wx-switch-knob"></div></div>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <span class="gothic-label">消息频率 (间隔分钟)</span>'
      + '    <div style="display:flex; align-items:center; gap:6px;"><input class="gothic-input num" id="cfgProMin" type="number" value="' + (cfg.proMinInterval||15) + '"><span style="font-size:11px; color:#8e8e93;">至</span><input class="gothic-input num" id="cfgProMax" type="number" value="' + (cfg.proMaxInterval||120) + '"></div>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <span class="gothic-label">活跃时段</span>'
      + '    <div style="display:flex; gap:14px;"><label class="cr-custom-radio"><input type="radio" name="rdoActiveMode" value="allday"' + (isAllDay?' checked':'') + '><span class="cr-radio-circle"></span> 全天</label><label class="cr-custom-radio"><input type="radio" name="rdoActiveMode" value="custom"' + (!isAllDay?' checked':'') + '><span class="cr-radio-circle"></span> 自定义</label></div>'
      + '  </div>'
      + '  <div class="gothic-row" id="rowCustomTime" style="' + (isAllDay?'display:none;':'') + 'border-top:1px dashed rgba(20,22,25,0.08); padding-top:6px;">'
      + '    <span class="gothic-label">自定义时段</span>'
      + '    <div style="display:flex; gap:6px;"><input class="gothic-input time" id="cfgProStart" type="time" value="' + (cfg.proActiveStart||'08:00') + '"><span style="font-size:11px; color:#8e8e93; line-height:26px;">至</span><input class="gothic-input time" id="cfgProEnd" type="time" value="' + (cfg.proActiveEnd||'23:30') + '"></div>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <span class="gothic-label">积极程度</span>'
      + '    <div style="display:flex; gap:14px;"><label class="cr-custom-radio"><input type="radio" name="rdoLevelMode" value="manual"' + (isManualLevel?' checked':'') + '><span class="cr-radio-circle"></span> 手动</label><label class="cr-custom-radio"><input type="radio" name="rdoLevelMode" value="auto"' + (!isManualLevel?' checked':'') + '><span class="cr-radio-circle"></span> 角色性格决定</label></div>'
      + '  </div>'
      + '  <div class="gothic-row" id="rowManualLevel" style="' + (isManualLevel?'':'display:none;') + 'border-top:1px dashed rgba(20,22,25,0.08); padding-top:6px;">'
      + '    <span class="gothic-label">设定程度</span>'
      + '    <select class="gothic-select" id="cfgProLevel">' + PRO_LEVEL_NAMES.map(function(name, idx){ return '<option value="' + (idx+1) + '"' + ((cfg.proLevel||3)===(idx+1)?' selected':'') + '>' + name + '</option>'; }).join('') + '</select>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <span class="gothic-label">单次回复条数</span>'
      + '    <div style="display:flex; align-items:center; gap:6px;"><input class="gothic-input num" id="cfgMinMsgs" type="number" min="1" max="10" value="' + (cfg.minMsgs||1) + '"><span style="font-size:11px; color:#8e8e93;">至</span><input class="gothic-input num" id="cfgMaxMsgs" type="number" min="1" max="10" value="' + (cfg.maxMsgs||3) + '"></div>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <span class="gothic-label">回复速度</span>'
      + '    <select class="gothic-select" id="cfgReplySpeed"><option' + sv('replySpeed','快速（1-2秒）') + '>快速（1-2秒）</option><option' + sv('replySpeed','正常（2-4秒）') + '>正常（2-4秒）</option><option' + sv('replySpeed','慢速（4-7秒）') + '>慢速（4-7秒）</option></select>'
      + '  </div>'
      + '</div>'

      // 04. 温度与创造力参数
      + '<div class="gothic-card">'
      + '  <div class="gothic-head-row">'
      + '    <div class="gothic-title-group"><span class="gothic-sec-roman">§ 04</span><span class="gothic-sec-title">温度与创造力参数</span></div>'
      + '    <span class="gothic-sec-en">Model Dynamics</span>'
      + '  </div>'
      + '  <div class="metric-gauge-box">'
      + '    <div class="gauge-head"><span class="gauge-title">Temperature (创造力)</span><span class="gauge-val-tag" id="txtTempVal">' + (cfg.temperature || 0.85) + '</span></div>'
      + '    <p class="gauge-desc">数值越低越贴合设定，数值越高越富有情感起伏与生动发散。</p>'
      + '    <div class="gauge-slider-deck"><span class="gauge-bound">0.0</span><input class="gothic-range" id="cfgTemp" type="range" min="0" max="2" step="0.05" value="' + (cfg.temperature || 0.85) + '"><span class="gauge-bound">2.0</span></div>'
      + '  </div>'
      + '  <div class="metric-gauge-box">'
      + '    <div class="gauge-head"><span class="gauge-title">Frequency Penalty (重复词抑制)</span><span class="gauge-val-tag" id="txtFreqVal">' + (cfg.freqPenalty || 0.3) + '</span></div>'
      + '    <p class="gauge-desc">增加该值可减少字词单调重复，促使模型变换丰富词汇。</p>'
      + '    <div class="gauge-slider-deck"><span class="gauge-bound">0.0</span><input class="gothic-range" id="cfgFreq" type="range" min="0" max="2" step="0.1" value="' + (cfg.freqPenalty || 0.3) + '"><span class="gauge-bound">2.0</span></div>'
      + '  </div>'
      + '  <div class="metric-gauge-box">'
      + '    <div class="gauge-head"><span class="gauge-title">Presence Penalty (新话题扩展)</span><span class="gauge-val-tag" id="txtPresVal">' + (cfg.presPenalty || 0.3) + '</span></div>'
      + '    <p class="gauge-desc">增加该值促使模型更乐于引入新观察与发散话题。</p>'
      + '    <div class="gauge-slider-deck"><span class="gauge-bound">0.0</span><input class="gothic-range" id="cfgPres" type="range" min="0" max="2" step="0.1" value="' + (cfg.presPenalty || 0.3) + '"><span class="gauge-bound">2.0</span></div>'
      + '  </div>'
      + '</div>'

      // 05. 语言与语音 (英文字体常驻版)
      + '<div class="gothic-card">'
      + '  <div class="gothic-head-row">'
      + '    <div class="gothic-title-group"><span class="gothic-sec-roman">§ 05</span><span class="gothic-sec-title">语言与语音</span></div>'
      + '    <span class="gothic-sec-en">Language & TTS</span>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <span class="gothic-label">主要语言</span>'
      + '    <select class="gothic-select" id="cfgMainLang"><option' + sv('mainLang','简体中文') + '>简体中文</option><option' + sv('mainLang','繁體中文') + '>繁體中文</option><option' + sv('mainLang','粤语') + '>粤语</option><option' + sv('mainLang','English') + '>English</option><option' + sv('mainLang','日本語') + '>日本語</option><option' + sv('mainLang','한국어') + '>한국어</option></select>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <span class="gothic-label">英文字体</span>'
      + '    <select class="gothic-select" id="cfgEnFont" style="max-width:170px;">'
      + '      <option value="default"' + (cfg.enFont==='default'?' selected':'') + '>默认 (Sans)</option>'
      + '      <option value="caveat"' + (cfg.enFont==='caveat'?' selected':'') + '>手写体 (Caveat)</option>'
      + '      <option value="pinyon"' + (cfg.enFont==='pinyon'?' selected':'') + '>宫廷贵族铜版体 (Pinyon)</option>'
      + '      <option value="alex"' + (cfg.enFont==='alex'?' selected':'') + '>墨水软笔体 (Alex Brush)</option>'
      + '    </select>'
      + '  </div>'
      + '  <div class="gothic-row" style="border-top:1px dashed rgba(20,22,25,0.08); padding-top:6px;">'
      + '    <div class="gothic-row-label-col"><span class="gothic-label">双语模式</span><span class="gothic-desc">每条消息附带双语翻译</span></div>'
      + '    <div class="wx-switch' + (cfg.bilingual ? ' on' : '') + '" id="swBilingual"><div class="wx-switch-knob"></div></div>'
      + '  </div>'
      + '  <div id="secBiSub" style="' + (cfg.bilingual ? 'display:flex;' : 'display:none;') + 'border-top:1px dashed rgba(20,22,25,0.08); padding-top:6px; flex-direction:column; gap:8px;">'
      + '    <div class="gothic-row"><span>翻译为</span><select class="gothic-select" id="cfgBiLang"><option' + sv('biLang','English') + '>English</option><option' + sv('biLang','日本語') + '>日本語</option><option' + sv('biLang','한국어') + '>한국어</option><option' + sv('biLang','繁體中文') + '>繁體中文</option><option' + sv('biLang','粤语') + '>粤语</option></select></div>'
      + '    <div class="gothic-row"><span>显示方式</span><div style="display:flex;gap:12px;"><label class="cr-custom-radio"><input type="radio" name="rdoBiStyle" value="bracket"' + (cfg.biStyle==='bracket'?' checked':'') + '><span class="cr-radio-circle"></span> 括号附注</label><label class="cr-custom-radio"><input type="radio" name="rdoBiStyle" value="newline"' + (cfg.biStyle==='newline'?' checked':'') + '><span class="cr-radio-circle"></span> 另起一行</label></div></div>'
      + '  </div>'
      + '  <div class="gothic-row" style="border-top:1px dashed rgba(20,22,25,0.08); padding-top:8px;">'
      + '    <div class="gothic-row-label-col"><span class="gothic-label">MiniMax 语音</span><span class="gothic-desc">TTS 真实语音合成</span></div>'
      + '    <div class="wx-switch' + (cfg.minimax ? ' on' : '') + '" id="swMinimax"><div class="wx-switch-knob"></div></div>'
      + '  </div>'
      + '  <div id="secMmSub" style="' + (cfg.minimax ? 'display:flex;' : 'display:none;') + 'border-top:1px dashed rgba(20,22,25,0.08); padding-top:6px; flex-direction:column; gap:8px;">'
      + '    <div class="gothic-row"><span>Voice ID</span><input class="gothic-input" id="cfgMmVoice" placeholder="粘贴 MiniMax Voice ID..." value="' + esc(cfg.mmVoiceId || '') + '"></div>'
      + '    <div class="gothic-row"><span>API Key</span><input class="gothic-input" id="cfgMmKey" placeholder="MiniMax API Key..." value="' + esc(cfg.mmApiKey || '') + '"></div>'
      + '    <div class="metric-gauge-box">'
      + '      <div class="gauge-head"><span class="gauge-title">语速</span><span class="gauge-val-tag" id="txtMmSpeedVal">' + (cfg.mmSpeed || 1) + 'x</span></div>'
      + '      <div class="gauge-slider-deck"><span class="gauge-bound">0.5x</span><input class="gothic-range" id="cfgMmSpeed" type="range" min="0.5" max="2" step="0.1" value="' + (cfg.mmSpeed || 1) + '"><span class="gauge-bound">2.0x</span></div>'
      + '    </div>'
      + '    <div class="metric-gauge-box">'
      + '      <div class="gauge-head"><span class="gauge-title">音调</span><span class="gauge-val-tag" id="txtMmPitchVal">' + ((cfg.mmPitch || 0) > 0 ? '+' : '') + (cfg.mmPitch || 0) + '</span></div>'
      + '      <div class="gauge-slider-deck"><span class="gauge-bound">-12</span><input class="gothic-range" id="cfgMmPitch" type="range" min="-12" max="12" step="1" value="' + (cfg.mmPitch || 0) + '"><span class="gauge-bound">+12</span></div>'
      + '    </div>'
      + '  </div>'
      + '</div>'

      // 06. API 对话配置
      + '<div class="gothic-card">'
      + '  <div class="gothic-head-row">'
      + '    <div class="gothic-title-group"><span class="gothic-sec-roman">§ 06</span><span class="gothic-sec-title">API 对话配置</span></div>'
      + '    <span class="gothic-sec-en">API Mode</span>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <div class="gothic-row-label-col"><span class="gothic-label">单独配置 API</span><span class="gothic-desc">为该角色指定独立对话模型</span></div>'
      + '    <div class="wx-switch' + (isIndividual ? ' on' : '') + '" id="swIndividualApi"><div class="wx-switch-knob"></div></div>'
      + '  </div>'
      + '  <div class="gothic-row" id="rowApiSelect" style="' + (isIndividual ? '' : 'display:none;') + 'border-top:1px dashed rgba(20,22,25,0.08); padding-top:6px;">'
      + '    <span class="gothic-label">选择专属 API</span>'
      + '    <select class="gothic-select" id="cfgApiSelect">' + apiOptionsHtml + '</select>'
      + '  </div>'
      + '</div>'

      // 07. 情境与天气感知
      + '<div class="gothic-card">'
      + '  <div class="gothic-head-row">'
      + '    <div class="gothic-title-group"><span class="gothic-sec-roman">§ 07</span><span class="gothic-sec-title">情境与天气感知</span></div>'
      + '    <span class="gothic-sec-en">Atmosphere</span>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <div class="gothic-row-label-col"><span class="gothic-label">时间 & 天气感知</span><span class="gothic-desc">角色获知当前真实时间段与所在地气候</span></div>'
      + '    <div class="wx-switch' + (cfg.timeWeather ? ' on' : '') + '" id="swTimeWeather"><div class="wx-switch-knob"></div></div>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <span class="gothic-label">真实城市 (抓取天气)</span>'
      + '    <div style="display:flex; gap:6px; align-items:center;"><input class="gothic-input city" id="cfgCharRealCity" placeholder="如: Paris" value="' + esc(cfg.charRealCity || '') + '"><button class="disc-action-btn" id="btnFetchWeather" type="button" title="抓取天气"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button></div>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <span class="gothic-label">虚拟地名 (设定城市)</span>'
      + '    <input class="gothic-input city" id="cfgCharCity" placeholder="留空用真实名" value="' + esc(cfg.charCity || '') + '">'
      + '  </div>'
      + '</div>'

      // 08. 表情包生成 API 通道
      + '<div class="gothic-card">'
      + '  <div class="gothic-head-row">'
      + '    <div class="gothic-title-group"><span class="gothic-sec-roman">§ 08</span><span class="gothic-sec-title">表情包生成 API 通道</span></div>'
      + '    <span class="gothic-sec-en">Sticker Gen</span>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <div class="gothic-row-label-col"><span class="gothic-label">AI 表情包生成</span><span class="gothic-desc">配合交谈情境自动配图</span></div>'
      + '    <div class="wx-switch' + (cfg.stickerGen ? ' on' : '') + '" id="swStickerGen"><div class="wx-switch-knob"></div></div>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <span class="gothic-label">表情包频率</span>'
      + '    <select class="gothic-select" id="cfgStkFreq">' + STK_FREQ_NAMES.map(function(name, idx){ return '<option value="' + (idx+1) + '"' + ((cfg.stickerFreq||2)===(idx+1)?' selected':'') + '>' + name + '</option>'; }).join('') + '</select>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <span class="gothic-label">绘图 API 来源</span>'
      + '    <select class="gothic-select" id="cfgImgApiSelect">' + imgApiOptionsHtml + '</select>'
      + '  </div>'
      + '  <div class="gothic-row">'
      + '    <span class="gothic-label">绘图模型</span>'
      + '    <div style="display:flex; gap:6px; align-items:center;"><input class="gothic-input" id="cfgImgModel" style="width:110px; text-align:right;" value="' + esc(cfg.imgModel || 'gpt-image-1') + '"><button class="disc-action-btn" id="btnFetchImgModels" type="button" title="拉取模型"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.22-8.56"/><path d="M21 3v6h-6"/></svg></button></div>'
      + '  </div>'
      + '  <div class="gothic-chips-wrap" id="cfgStkStylesWrap">' + stkStylesHtml + '</div>'
      + '</div>'
      + '<div class="settings-bottom-spacer"></div>';
  }

  // ============ 4. 事件绑定与数据同步 ============
  function bindSettingsEvents(mask, currentChar, onProactiveChange) {
    var cfg = getCfg(currentChar.id);

    function closeSettings() {
      mask.classList.remove('show');
    }

    var closeBtn = mask.querySelector('#wxCrSetCloseBtn');
    if (closeBtn) closeBtn.onclick = closeSettings;
    mask.onclick = function(e) {
      if (e.target === mask) closeSettings();
    };

    function syncSettingFields() {
      var gv = function(id) { var el = mask.querySelector('#' + id); return el ? el.value : ''; };
      cfg.sceneText = gv('cfgSceneText') || '';

      var histSlider = mask.querySelector('#cfgHistoryLimit');
      var histNum = mask.querySelector('#cfgHistoryNum');
      var unitText = mask.querySelector('#txtHistLimitUnit');

      if (document.activeElement === histNum) {
        var nVal = parseInt(histNum.value, 10);
        if (isNaN(nVal) || nVal < 0) nVal = 0;
        if (nVal > 1000) nVal = 1000;
        cfg.historyLimit = nVal;
        if (histSlider) histSlider.value = nVal;
      } else if (histSlider) {
        var sVal = parseInt(histSlider.value, 10);
        cfg.historyLimit = isNaN(sVal) ? 20 : sVal;
        if (histNum) histNum.value = cfg.historyLimit;
      }

      if (unitText) unitText.textContent = (cfg.historyLimit === 0) ? ' (不限制)' : ' 轮';

      cfg.innerVoice = mask.querySelector('#swInnerVoice') ? mask.querySelector('#swInnerVoice').classList.contains('on') : true;

      var rdoVoice = mask.querySelector('input[name="rdoVoiceLevel"]:checked');
      cfg.voiceLevel = rdoVoice ? rdoVoice.value : 'normal';

      cfg.proactive = mask.querySelector('#swProactive') ? mask.querySelector('#swProactive').classList.contains('on') : false;
      cfg.proMinInterval = parseInt(gv('cfgProMin'), 10) || 15;
      cfg.proMaxInterval = parseInt(gv('cfgProMax'), 10) || 120;

      var rdoActive = mask.querySelector('input[name="rdoActiveMode"]:checked');
      cfg.proActiveMode = rdoActive ? rdoActive.value : 'allday';
      cfg.proActiveStart = gv('cfgProStart') || '08:00';
      cfg.proActiveEnd = gv('cfgProEnd') || '23:30';

      var rdoLevel = mask.querySelector('input[name="rdoLevelMode"]:checked');
      cfg.proLevelMode = rdoLevel ? rdoLevel.value : 'manual';
      cfg.proLevel = parseInt(gv('cfgProLevel'), 10) || 3;

      cfg.minMsgs = parseInt(gv('cfgMinMsgs'), 10) || 1;
      cfg.maxMsgs = parseInt(gv('cfgMaxMsgs'), 10) || 3;
      cfg.replySpeed = gv('cfgReplySpeed') || '正常（2-4秒）';

      var tempInput = mask.querySelector('#cfgTemp');
      if (tempInput) {
        cfg.temperature = parseFloat(tempInput.value) || 0.85;
        var txtT = mask.querySelector('#txtTempVal');
        if (txtT) txtT.textContent = cfg.temperature;
      }

      var freqInput = mask.querySelector('#cfgFreq');
      if (freqInput) {
        cfg.freqPenalty = parseFloat(freqInput.value) || 0.3;
        var txtF = mask.querySelector('#txtFreqVal');
        if (txtF) txtF.textContent = cfg.freqPenalty;
      }

      var presInput = mask.querySelector('#cfgPres');
      if (presInput) {
        cfg.presPenalty = parseFloat(presInput.value) || 0.3;
        var txtP = mask.querySelector('#txtPresVal');
        if (txtP) txtP.textContent = cfg.presPenalty;
      }

      // 语言与语音
      cfg.mainLang = gv('cfgMainLang') || '简体中文';
      cfg.enFont = gv('cfgEnFont') || 'default';
      cfg.bilingual = mask.querySelector('#swBilingual') ? mask.querySelector('#swBilingual').classList.contains('on') : false;
      cfg.biLang = gv('cfgBiLang') || 'English';
      var rdoBiStyle = mask.querySelector('input[name="rdoBiStyle"]:checked');
      cfg.biStyle = rdoBiStyle ? rdoBiStyle.value : 'bracket';

      cfg.minimax = mask.querySelector('#swMinimax') ? mask.querySelector('#swMinimax').classList.contains('on') : false;
      cfg.mmVoiceId = gv('cfgMmVoice') || '';
      cfg.mmApiKey = gv('cfgMmKey') || '';
      var mmSpeedEl = mask.querySelector('#cfgMmSpeed');
      if (mmSpeedEl) {
        cfg.mmSpeed = parseFloat(mmSpeedEl.value) || 1;
        var txtSpd = mask.querySelector('#txtMmSpeedVal');
        if (txtSpd) txtSpd.textContent = cfg.mmSpeed + 'x';
      }
      var mmPitchEl = mask.querySelector('#cfgMmPitch');
      if (mmPitchEl) {
        cfg.mmPitch = parseInt(mmPitchEl.value, 10) || 0;
        var txtPtc = mask.querySelector('#txtMmPitchVal');
        if (txtPtc) txtPtc.textContent = (cfg.mmPitch > 0 ? '+' : '') + cfg.mmPitch;
      }

      cfg.apiMode = mask.querySelector('#swIndividualApi') && mask.querySelector('#swIndividualApi').classList.contains('on') ? 'individual' : 'global';
      cfg.apiSelect = gv('cfgApiSelect') || '';
      cfg.timeWeather = mask.querySelector('#swTimeWeather') ? mask.querySelector('#swTimeWeather').classList.contains('on') : true;
      cfg.charRealCity = gv('cfgCharRealCity') || '';
      cfg.charCity = gv('cfgCharCity') || '';
      cfg.stickerGen = mask.querySelector('#swStickerGen') ? mask.querySelector('#swStickerGen').classList.contains('on') : false;
      cfg.stickerFreq = parseInt(gv('cfgStkFreq'), 10) || 2;
      cfg.imgApiSelect = gv('cfgImgApiSelect') || '';
      cfg.imgModel = gv('cfgImgModel') || 'gpt-image-1';

      var checkedStyles = [];
      mask.querySelectorAll('#cfgStkStylesWrap input:checked').forEach(function(cb) { checkedStyles.push(cb.dataset.stkStyle); });
      cfg.stickerStyles = checkedStyles.length ? checkedStyles : ['Q版可爱卡通'];

      saveCfg(currentChar.id, cfg);
      if (onProactiveChange) onProactiveChange(cfg.proactive);
    }

    mask.querySelectorAll('.wx-switch').forEach(function(sw) {
      sw.onclick = function() {
        this.classList.toggle('on');
        if (this.id === 'swIndividualApi') {
          var rowSel = mask.querySelector('#rowApiSelect');
          if (rowSel) rowSel.style.display = this.classList.contains('on') ? 'flex' : 'none';
        }
        if (this.id === 'swInnerVoice') {
          var rowVoice = mask.querySelector('#rowVoiceLevel');
          if (rowVoice) rowVoice.style.display = this.classList.contains('on') ? 'flex' : 'none';
        }
        if (this.id === 'swBilingual') {
          var secBi = mask.querySelector('#secBiSub');
          if (secBi) secBi.style.display = this.classList.contains('on') ? 'flex' : 'none';
        }
        if (this.id === 'swMinimax') {
          var secMm = mask.querySelector('#secMmSub');
          if (secMm) secMm.style.display = this.classList.contains('on') ? 'flex' : 'none';
        }
        syncSettingFields();
      };
    });

    mask.querySelectorAll('input[name="rdoActiveMode"]').forEach(function(r) {
      r.onchange = function() {
        var rowCustom = mask.querySelector('#rowCustomTime');
        if (rowCustom) rowCustom.style.display = (this.value === 'custom') ? 'flex' : 'none';
        syncSettingFields();
      };
    });

    mask.querySelectorAll('input[name="rdoLevelMode"]').forEach(function(r) {
      r.onchange = function() {
        var rowLevel = mask.querySelector('#rowManualLevel');
        if (rowLevel) rowLevel.style.display = (this.value === 'manual') ? 'flex' : 'none';
        syncSettingFields();
      };
    });

    mask.querySelectorAll('input[name="rdoVoiceLevel"], input[name="rdoBiStyle"]').forEach(function(r) {
      r.onchange = syncSettingFields;
    });

    mask.querySelectorAll('.gothic-select, .gothic-input, .gothic-range, .scripture-textarea, #cfgStkStylesWrap input').forEach(function(inp) {
      inp.oninput = syncSettingFields;
      inp.onchange = syncSettingFields;
      inp.onblur = syncSettingFields;
    });

    // 抓取天气按钮
    var fetchWeatherBtn = mask.querySelector('#btnFetchWeather');
    if (fetchWeatherBtn) {
      fetchWeatherBtn.onclick = function() {
        var cityInp = mask.querySelector('#cfgCharRealCity');
        var city = (cityInp ? cityInp.value : '').trim();
        if (!city) {
          if (window.AppNav) window.AppNav.showToast('请先输入真实城市');
          return;
        }

        if (window.AppNav) window.AppNav.showToast('正在连接气象卫星抓取中...');
        fetchWeatherBtn.style.opacity = '0.5';

        if (window.WxChatRoom && window.WxChatRoom.fetchWeather) {
          window.WxChatRoom.fetchWeather(city, function(w) {
            fetchWeatherBtn.style.opacity = '1';

            var existingStatus = mask.querySelector('#charWeatherStatusBadge');
            if (existingStatus) existingStatus.remove();

            if (w) {
              var statusDiv = document.createElement('div');
              statusDiv.id = 'charWeatherStatusBadge';
              statusDiv.style.cssText = 'padding:4px 8px;font-size:11.5px;color:#111;background:rgba(255,255,255,0.7);border:1px dashed rgba(20,22,25,0.2);border-radius:6px;margin-top:4px;display:flex;align-items:center;justify-content:space-between;';
              statusDiv.innerHTML = '<span>🌤️ ' + esc(city) + '：' + esc(w.desc) + ' ' + w.temp + '°C · 湿度' + w.humidity + '%</span><span style="color:#07c160;font-weight:bold;">● 已就绪</span>';

              var parentCard = fetchWeatherBtn.closest('.gothic-card');
              if (parentCard) parentCard.appendChild(statusDiv);

              if (window.AppNav) window.AppNav.showToast('抓取成功！' + city + ' ' + w.desc + ' ' + w.temp + '°C');
            } else {
              if (window.AppNav) window.AppNav.showToast('未连通该城市天气，建议输入省/市名或拼音重试');
            }
          });
        }
      };
    }

    // 绘图模型拉取按钮
    var fetchImgBtn = mask.querySelector('#btnFetchImgModels');
    if (fetchImgBtn) {
      fetchImgBtn.onclick = function() {
        var api = getActiveApi(currentChar.id);
        if (!api || !api.url || !api.key) {
          if (window.AppNav) window.AppNav.showToast('请先在设置中配置并启用 API 接口');
          return;
        }
        if (window.AppNav) window.AppNav.showToast('正在获取模型列表...');

        fetch(api.url.replace(/\/+$/, '') + '/models', {
          headers: { 'Authorization': 'Bearer ' + api.key }
        })
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(data) {
          var raw = data.data || data;
          var models = [];
          if (Array.isArray(raw)) {
            for (var i = 0; i < raw.length; i++) {
              var id = raw[i].id || raw[i].name || raw[i];
              if (id) models.push(id);
            }
          }
          if (!models.length) {
            if (window.AppNav) window.AppNav.showToast('未检测到可用模型');
            return;
          }

          var existingPicker = document.getElementById('wxCrModelPickerMask');
          if (existingPicker) existingPicker.remove();

          var pickerMask = document.createElement('div');
          pickerMask.id = 'wxCrModelPickerMask';
          pickerMask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:20000;display:flex;align-items:center;justify-content:center;padding:20px;';

          pickerMask.innerHTML = '<div style="width:100%;max-width:310px;height:70vh;background:#ffffff;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.25);">'
            + '<div style="padding:14px 16px 10px;font-size:15px;font-weight:800;color:#111;border-bottom:1px solid rgba(0,0,0,0.06);display:flex;justify-content:space-between;align-items:center;"><span>选择绘图模型 (' + models.length + ')</span><span id="closeModelPicker" style="cursor:pointer;color:#888;font-size:16px;padding:2px 6px;">✕</span></div>'
            + '<div style="padding:8px 12px;border-bottom:1px solid rgba(0,0,0,0.06);background:#f7f7f8;"><input type="text" id="modelSearchInput" placeholder="🔍 搜索模型名称..." style="width:100%;height:32px;border:1px solid rgba(0,0,0,0.1);background:#fff;border-radius:8px;padding:0 10px;font-size:13px;color:#111;outline:none;box-sizing:border-box;"></div>'
            + '<div id="modelListContainer" style="flex:1;overflow-y:auto;padding:4px 8px;"></div>'
            + '</div>';

          document.body.appendChild(pickerMask);

          var listContainer = pickerMask.querySelector('#modelListContainer');
          var searchInput = pickerMask.querySelector('#modelSearchInput');

          function renderFilteredList(filterKw) {
            var kw = (filterKw || '').trim().toLowerCase();
            var matched = kw ? models.filter(function(m){ return m.toLowerCase().indexOf(kw) !== -1; }) : models;
            if (!matched.length) {
              listContainer.innerHTML = '<div style="padding:24px;text-align:center;color:#8e8e93;font-size:12.5px;">无匹配模型</div>';
              return;
            }
            listContainer.innerHTML = matched.map(function(m) {
              return '<div class="cr-model-pick-item" data-model-name="' + esc(m) + '" style="padding:10px 12px;font-size:13px;font-weight:600;color:#111;border-bottom:1px solid rgba(0,0,0,0.04);cursor:pointer;">' + esc(m) + '</div>';
            }).join('');
          }

          renderFilteredList('');

          if (searchInput) {
            searchInput.oninput = function() {
              renderFilteredList(this.value);
            };
          }

          pickerMask.onclick = function(e) {
            if (e.target === pickerMask || e.target.id === 'closeModelPicker') {
              pickerMask.remove();
              return;
            }
            var item = e.target.closest('.cr-model-pick-item');
            if (item) {
              var chosen = item.dataset.modelName || item.textContent.trim();
              mask.querySelector('#cfgImgModel').value = chosen;
              syncSettingFields();
              pickerMask.remove();
              if (window.AppNav) window.AppNav.showToast('已选定模型: ' + chosen);
            }
          };
        })
        .catch(function(err) {
          if (window.AppNav) window.AppNav.showToast('获取失败: ' + err.message);
        });
      };
    }

    // 放大手札编辑场景
    var expandSceneBtn = mask.querySelector('#btnExpandScene');
    if (expandSceneBtn) {
      expandSceneBtn.onclick = function() {
        var curText = mask.querySelector('#cfgSceneText').value || '';
        var newText = prompt('编辑当前场景与背景补充：', curText);
        if (newText !== null) {
          mask.querySelector('#cfgSceneText').value = newText;
          syncSettingFields();
        }
      };
    }
  }

  // ============ 5. 核心对外入口：打开设定中枢 ============
  function openSettingsStudio(currentChar, onProactiveChange) {
    if (!currentChar) return;
    var mask = ensureSettingsMask(currentChar);
    var cfg = getCfg(currentChar.id);
    renderFullSettingsDOM(mask, cfg, currentChar);
    bindSettingsEvents(mask, currentChar, onProactiveChange);
    mask.classList.add('show');
  }

  window.WxChatSettings = {
    open: openSettingsStudio,
    getCfg: getCfg,
    saveCfg: saveCfg,
    getActiveApi: getActiveApi
  };

})();
