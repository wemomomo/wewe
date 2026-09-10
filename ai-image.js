
(function(){
  'use strict';

  var currentCallback = null;
  var currentGeneratedUrl = '';
  var currentRatio = '1:1';
  var isGenerating = false;
  var timerInterval = null;
  var startTimestamp = 0;

  var STORAGE_TASK_KEY = 'ai_image_active_task';
  var STORAGE_LAST_RESULT_KEY = 'ai_image_last_result';

  function initAiImageApp() {
    var page = document.querySelector('[data-page="ai-image"]');
    if (!page) {
      page = document.createElement('div');
      page.className = 'page app-page';
      page.dataset.page = 'ai-image';
      var container = document.getElementById('pageContainer');
      if (container) container.appendChild(page);
    }

    renderPage(page);
    bindPageEvents(page);
    restorePersistedResult();
  }

  function renderPage(page) {
    page.innerHTML = '<div class="app-header">'
      + '<button class="icon-back-btn" data-back="home" type="button"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>'
      + '<div class="app-title">AI 绘图</div>'
      + '</div>'
      + '<div class="app-content ai-image-page-content">'
      
      // 1. API 渠道与模型配置区
      + '<div class="ai-channel-section">'
      + '<div class="ai-channel-header-row">'
      + '<span class="ai-field-label">API 渠道</span>'
      + '</div>'
      + '<div class="ai-api-select-wrap">'
      + '<select class="ai-api-select" id="aiApiChannelSelect"></select>'
      + '</div>'
      + '<div class="ai-model-input-row">'
      + '<div class="ai-channel-header-row">'
      + '<span class="ai-field-label">生图模型 (极速通道)</span>'
      + '<div class="ai-quick-models">'
      + '<button class="ai-quick-model-btn" data-model="flux-schnell" type="button">⚡极速Flux</button>'
      + '<button class="ai-quick-model-btn" data-model="dall-e-3" type="button">dall-e-3</button>'
      + '<button class="ai-quick-model-btn" data-model="imagen-3" type="button">imagen-3</button>'
      + '</div>'
      + '</div>'
      + '<input type="text" class="ai-custom-input" id="aiCustomModelInput" placeholder="输入模型名 (如 flux-schnell / dall-e-3)">'
      + '</div>'
      + '</div>'

      // 2. 提示词输入区
      + '<div class="ai-prompt-section">'
      + '<div class="ai-section-label-row">'
      + '<span class="ai-field-label">画意描述 (PROMPT)</span>'
      + '<button class="ai-auto-prompt-pill" id="aiAutoPromptBtn" type="button"><span>✦ 智能润色</span></button>'
      + '</div>'
      + '<textarea class="ai-prompt-textarea" id="aiPromptInput" placeholder="描述想要绘制的画面、发色眸色、光影与场景..."></textarea>'
      + '</div>'

      // 3. 比例选择
      + '<div class="ai-ratio-section">'
      + '<div class="ai-ratio-group">'
      + '<button class="ai-ratio-chip active" data-ratio="1:1" type="button">1:1 方图</button>'
      + '<button class="ai-ratio-chip" data-ratio="3:4" type="button">3:4 立绘</button>'
      + '<button class="ai-ratio-chip" data-ratio="9:16" type="button">9:16 壁纸</button>'
      + '</div>'
      + '</div>'

      // 4. 图像生成展示舞台
      + '<div class="ai-preview-stage" id="aiPreviewStage">'
      + '<img id="aiResultImg" src="" alt="AI生成图像">'
      + '<div class="ai-stage-empty">'
      + '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
      + '<span>输入描述，轻点下方开始绘图</span>'
      + '</div>'
      + '<div class="ai-generating-box">'
      + '<svg class="ai-generating-crystal" viewBox="0 0 48 48">'
      + '<circle cx="24" cy="24" r="2" fill="#88abda"/>'
      + '<polygon points="24,6 28,20 24,24 20,20" stroke="#88abda" stroke-width="1.5" fill="none"/>'
      + '<polygon points="24,42 28,28 24,24 20,28" stroke="#88abda" stroke-width="1.5" fill="none"/>'
      + '<polygon points="6,24 20,20 24,24 20,28" stroke="#88abda" stroke-width="1.5" fill="none"/>'
      + '<polygon points="42,24 28,20 24,24 28,28" stroke="#88abda" stroke-width="1.5" fill="none"/>'
      + '</svg>'
      + '<span class="ai-generating-text" id="aiProgressStatusText">正在连接极速通道... (0s)</span>'
      + '</div>'
      + '</div>'

      // 5. 诊断报错输出框
      + '<div class="ai-debug-error-box" id="aiDebugErrorBox"></div>'

      // 6. 操作按钮区
      + '<div class="ai-action-footer">'
      + '<button class="ai-generate-btn" id="aiStartGenBtn" type="button">'
      + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 2,12 9.5,9.5"/></svg>'
      + '<span>开始绘制立绘</span>'
      + '</button>'
      + '<div class="ai-result-actions" id="aiResultActions">'
      + '<button class="ai-result-btn download" id="aiDownloadPhotoBtn" type="button"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>保存相册</span></button>'
      + '<button class="ai-result-btn" id="aiSaveImgbedBtn" type="button"><span>存入图床</span></button>'
      + '<button class="ai-result-btn primary" id="aiAdoptBtn" type="button"><span>✦ 采用立绘</span></button>'
      + '</div>'
      + '</div>'

      + '</div>'

      // 7. 采用立绘目标选择抽屉
      + '<div class="ai-adopt-mask" id="aiAdoptMask"></div>'
      + '<div class="ai-adopt-card" id="aiAdoptCard">'
      + '<div class="ai-adopt-title">将此立绘应用于：</div>'
      + '<button class="ai-adopt-option" id="adoptToUserBtn" type="button">✦ 设为用户档案立绘 (你)</button>'
      + '<button class="ai-adopt-option" id="adoptToCharBtn" type="button">✦ 设为角色档案立绘 (冥夜)</button>'
      + '<button class="ai-adopt-cancel" id="adoptCancelBtn" type="button">取消</button>'
      + '</div>';
  }

  function loadAndPopulateApiChannels(selectEl, customModelInput) {
    if (!selectEl || !window.AppDB) return;

    AppDB.get('api_configs', function(configs) {
      var list = Array.isArray(configs) ? configs : [];
      AppDB.get('active_api', function(active) {
        selectEl.innerHTML = '';

        if (!list.length) {
          var opt = document.createElement('option');
          opt.value = '';
          opt.textContent = '暂无配置 (请前往设置添加)';
          selectEl.appendChild(opt);
          return;
        }

        var selectedIndex = 0;
        list.forEach(function(cfg, idx) {
          var opt = document.createElement('option');
          opt.value = idx;
          opt.textContent = cfg.name + ' (' + (cfg.model || '未设定模型') + ')';
          if (active && active.name === cfg.name) {
            selectedIndex = idx;
          }
          selectEl.appendChild(opt);
        });

        selectEl.selectedIndex = selectedIndex;

        // 同步填入当前所选通道的模型
        var currentCfg = list[selectedIndex];
        if (currentCfg && customModelInput) {
          if (currentCfg.model && /(image|flux|dall|sd|midjourney)/i.test(currentCfg.model)) {
            customModelInput.value = currentCfg.model;
          } else {
            customModelInput.value = 'flux-schnell';
          }
        }
      });
    });
  }

  function bindPageEvents(page) {
    var startBtn = page.querySelector('#aiStartGenBtn');
    var adoptBtn = page.querySelector('#aiAdoptBtn');
    var saveImgbedBtn = page.querySelector('#aiSaveImgbedBtn');
    var downloadBtn = page.querySelector('#aiDownloadPhotoBtn');
    var autoPromptBtn = page.querySelector('#aiAutoPromptBtn');
    var promptInput = page.querySelector('#aiPromptInput');
    var customModelInput = page.querySelector('#aiCustomModelInput');
    var apiSelect = page.querySelector('#aiApiChannelSelect');
    var resultImg = page.querySelector('#aiResultImg');

    var adoptMask = page.querySelector('#aiAdoptMask');
    var adoptCard = page.querySelector('#aiAdoptCard');
    var adoptToUserBtn = page.querySelector('#adoptToUserBtn');
    var adoptToCharBtn = page.querySelector('#adoptToCharBtn');
    var adoptCancelBtn = page.querySelector('#adoptCancelBtn');

    // 载入并渲染 API 渠道列表
    loadAndPopulateApiChannels(apiSelect, customModelInput);

    // 监听 API 渠道切换
    if (apiSelect) {
      apiSelect.addEventListener('change', function() {
        var idx = parseInt(this.value, 10);
        if (isNaN(idx) || !window.AppDB) return;

        AppDB.get('api_configs', function(configs) {
          var list = Array.isArray(configs) ? configs : [];
          if (list[idx]) {
            var selectedCfg = list[idx];
            if (customModelInput) {
              if (selectedCfg.model && /(image|flux|dall|sd|midjourney)/i.test(selectedCfg.model)) {
                customModelInput.value = selectedCfg.model;
              } else {
                customModelInput.value = 'flux-schnell';
              }
            }
            if (window.AppNav) AppNav.showToast('✦ 已切换通道: ' + selectedCfg.name + ' ✦');
          }
        });
      });
    }

    page.querySelectorAll('.ai-quick-model-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (customModelInput) customModelInput.value = this.dataset.model;
      });
    });

    page.querySelectorAll('.ai-ratio-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        page.querySelectorAll('.ai-ratio-chip').forEach(function(c){ c.classList.remove('active'); });
        this.classList.add('active');
        currentRatio = this.dataset.ratio;
        
        var stage = page.querySelector('#aiPreviewStage');
        if (stage) {
          if (currentRatio === '1:1') stage.style.aspectRatio = '1 / 1';
          else if (currentRatio === '3:4') stage.style.aspectRatio = '3 / 4';
          else if (currentRatio === '9:16') stage.style.aspectRatio = '9 / 16';
        }
      });
    });

    if (autoPromptBtn) {
      autoPromptBtn.addEventListener('click', function() {
        var raw = (promptInput.value || '').trim();
        if (!raw) {
          promptInput.value = '1boy, handsome anime male, silver hair, deep blue eyes, gentle smile, masterpiece, best quality, 8k resolution';
        } else {
          promptInput.value = raw + ', highly detailed, masterpiece, anime aesthetic, 8k resolution';
        }
        if (window.AppNav) AppNav.showToast('✦ 提示词已优化 ✦');
      });
    }

    if (startBtn) {
      startBtn.addEventListener('click', function() {
        var prompt = (promptInput.value || '').trim();
        if (!prompt) {
          if (window.AppNav) AppNav.showToast('请先输入想要绘制的描述哦');
          return;
        }
        executeDualEngineGeneration(prompt, page);
      });
    }

    function closeAdoptCard() {
      if (adoptMask) adoptMask.classList.remove('show');
      if (adoptCard) adoptCard.classList.remove('show');
    }

    if (adoptBtn) {
      adoptBtn.addEventListener('click', function() {
        if (!currentGeneratedUrl) return;
        if (typeof currentCallback === 'function') {
          currentCallback(currentGeneratedUrl);
          if (window.AppNav) {
            AppNav.showToast('✦ 已采用为当前立绘 ✦');
            AppNav.showPage('home');
          }
          currentCallback = null;
        } else {
          if (adoptMask) adoptMask.classList.add('show');
          if (adoptCard) adoptCard.classList.add('show');
        }
      });
    }

    if (adoptCancelBtn) adoptCancelBtn.addEventListener('click', closeAdoptCard);
    if (adoptMask) adoptMask.addEventListener('click', closeAdoptCard);

    if (adoptToUserBtn) {
      adoptToUserBtn.addEventListener('click', function() {
        if (!currentGeneratedUrl || !window.AppDB) return;
        AppDB.get('user_archives_list_v3', function(list) {
          var arr = Array.isArray(list) ? list : [];
          if (arr.length > 0) {
            arr[0].photo = currentGeneratedUrl;
            AppDB.save('user_archives_list_v3', arr, function() {
              closeAdoptCard();
              if (window.AppNav) {
                AppNav.showToast('✦ 已成功设为用户小卡立绘 ✦');
                AppNav.showPage('archive');
              }
            });
          } else {
            closeAdoptCard();
            if (window.AppNav) AppNav.showToast('请先在档案页创建用户档案哦');
          }
        });
      });
    }

    if (adoptToCharBtn) {
      adoptToCharBtn.addEventListener('click', function() {
        if (!currentGeneratedUrl || !window.AppDB) return;
        AppDB.get('character_archives_list_v1', function(list) {
          var arr = Array.isArray(list) ? list : [];
          if (arr.length > 0) {
            arr[0].photo = currentGeneratedUrl;
            AppDB.save('character_archives_list_v1', arr, function() {
              closeAdoptCard();
              if (window.AppNav) {
                AppNav.showToast('✦ 已成功设为角色小卡立绘 ✦');
                AppNav.showPage('character');
              }
            });
          } else {
            closeAdoptCard();
            if (window.AppNav) AppNav.showToast('请先创建角色档案哦');
          }
        });
      });
    }

    if (saveImgbedBtn) {
      saveImgbedBtn.addEventListener('click', function() {
        if (!currentGeneratedUrl || !window.AppDB) return;
        AppDB.get('app_imgbed_list', function(list) {
          var arr = Array.isArray(list) ? list : [];
          arr.unshift({
            id: 'img_' + Date.now(),
            url: currentGeneratedUrl,
            name: 'AI绘图 · ' + new Date().toLocaleDateString(),
            date: new Date().toLocaleDateString()
          });
          AppDB.save('app_imgbed_list', arr, function() {
            window.dispatchEvent(new Event('imgbedUpdated'));
            if (window.AppNav) AppNav.showToast('✦ 已成功存入图床相册 ✦');
          });
        });
      });
    }

    if (downloadBtn) {
      downloadBtn.addEventListener('click', function() {
        if (!currentGeneratedUrl) return;
        downloadImageSafely(currentGeneratedUrl);
      });
    }

    if (resultImg) {
      resultImg.addEventListener('click', function() {
        if (!currentGeneratedUrl) return;
        downloadImageSafely(currentGeneratedUrl);
      });
    }
  }

  function downloadImageSafely(url) {
    if (window.AppNav) AppNav.showToast('正在准备原图...');

    var img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function() {
      try {
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        var base64Data = canvas.toDataURL('image/png');

        var a = document.createElement('a');
        a.href = base64Data;
        a.download = 'niveous-art-' + Date.now() + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (window.AppNav) AppNav.showToast('✦ 已保存至手机下载 ✦');
      } catch(e) {
        window.open(url, '_blank');
        if (window.AppNav) AppNav.showToast('✦ 已打开大图，长按即可存储 ✦');
      }
    };
    img.onerror = function() {
      window.open(url, '_blank');
      if (window.AppNav) AppNav.showToast('✦ 已打开大图，长按即可存储 ✦');
    };
    img.src = url;
  }

  function deeplyExtractImage(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') {
      var str = obj.trim();
      if (str.indexOf('data:image/') === 0) return str;
      if (/^[A-Za-z0-9+/=]{100,}$/.test(str)) return 'data:image/png;base64,' + str;
      var mdMatch = str.match(/!\[.*?\]\((https?:\/\/[^\s\)\"\']+)\)/i);
      if (mdMatch && mdMatch[1]) return mdMatch[1];
      var urlMatch = str.match(/https?:\/\/[^\s"'<>\)]+/i);
      if (urlMatch && urlMatch[0]) return urlMatch[0].replace(/[,\);]+$/, '');
      return '';
    }
    if (obj.data && Array.isArray(obj.data) && obj.data.length > 0) {
      var first = obj.data[0];
      if (first.url) return first.url;
      if (first.b64_json) return 'data:image/png;base64,' + first.b64_json;
      if (first.image) return first.image;
    }
    if (obj.choices && Array.isArray(obj.choices) && obj.choices.length > 0) {
      var msg = obj.choices[0].message;
      if (msg && msg.content) {
        var fromContent = deeplyExtractImage(msg.content);
        if (fromContent) return fromContent;
      }
    }
    if (obj.url && typeof obj.url === 'string') return obj.url;
    if (obj.image_url && typeof obj.image_url === 'string') return obj.image_url;
    if (obj.image && typeof obj.image === 'string') return deeplyExtractImage(obj.image);
    if (obj.images && Array.isArray(obj.images) && obj.images[0]) return deeplyExtractImage(obj.images[0]);
    if (obj.result) return deeplyExtractImage(obj.result);
    return '';
  }

  function executeDualEngineGeneration(prompt, page) {
    var debugBox = page.querySelector('#aiDebugErrorBox');
    if (debugBox) {
      debugBox.classList.remove('show');
      debugBox.textContent = '';
    }

    var apiSelect = page.querySelector('#aiApiChannelSelect');
    var customModelInput = page.querySelector('#aiCustomModelInput');

    if (!window.AppDB) return;

    AppDB.get('api_configs', function(configs) {
      var list = Array.isArray(configs) ? configs : [];
      var selectedIdx = apiSelect ? parseInt(apiSelect.value, 10) : 0;
      var targetApi = list[selectedIdx] || ((window.ApiConfig && typeof window.ApiConfig.getActive === 'function') ? window.ApiConfig.getActive() : null);

      if (!targetApi || !targetApi.url || !targetApi.key) {
        if (window.AppNav) AppNav.showToast('当前所选 API 无效，请前往设置检查');
        return;
      }

      var chosenModel = (customModelInput && customModelInput.value.trim()) ? customModelInput.value.trim() : (targetApi.model || 'flux-schnell');

      var cleanBase = targetApi.url.replace(/\/+$/, '');
      var rootUrl = cleanBase.endsWith('/v1') ? cleanBase : (cleanBase + '/v1');
      var imagesUrl = rootUrl + '/images/generations';
      var chatUrl = rootUrl + '/chat/completions';

      setGeneratingState(true, page);

      try {
        localStorage.setItem(STORAGE_TASK_KEY, JSON.stringify({ prompt: prompt, model: chosenModel, time: Date.now() }));
      } catch(e){}

      fetch(imagesUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + targetApi.key },
        body: JSON.stringify({ model: chosenModel, prompt: prompt, n: 1, size: '1024x1024' })
      })
      .then(function(res) {
        return res.text().then(function(rawText) {
          var data = null;
          try { data = JSON.parse(rawText); } catch(e) { data = rawText; }
          if (!res.ok) {
            var msg = (data && data.error && data.error.message) ? data.error.message : (typeof data === 'string' ? data : ('HTTP ' + res.status));
            throw new Error('IMG_FAILED:' + msg);
          }
          var foundImg = deeplyExtractImage(data);
          if (foundImg) {
            onSuccess(foundImg);
            return null;
          } else {
            throw new Error('IMG_FAILED:转入Chat协议');
          }
        });
      })
      .catch(function(imgErr) {
        var statusText = page.querySelector('#aiProgressStatusText');
        if (statusText) statusText.textContent = '🔄 切换对话画师协议中...';

        fetch(chatUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + targetApi.key },
          body: JSON.stringify({
            model: chosenModel,
            messages: [{ role: 'user', content: 'Draw an image: ' + prompt }]
          })
        })
        .then(function(cRes) {
          return cRes.text().then(function(cText) {
            var cData = null;
            try { cData = JSON.parse(cText); } catch(e) { cData = cText; }
            if (!cRes.ok) {
              var cMsg = (cData && cData.error && cData.error.message) ? cData.error.message : (typeof cData === 'string' ? cData : ('HTTP ' + cRes.status));
              throw new Error(cMsg);
            }
            var chatImg = deeplyExtractImage(cData);
            if (chatImg) {
              onSuccess(chatImg);
            } else {
              var rawPreview = typeof cData === 'object' ? JSON.stringify(cData) : String(cData);
              throw new Error('中转未给出图片链接: ' + rawPreview.slice(0, 100));
            }
          });
        })
        .catch(function(finalErr) {
          setGeneratingState(false, page);
          try { localStorage.removeItem(STORAGE_TASK_KEY); } catch(e){}
          if (debugBox) {
            debugBox.classList.add('show');
            debugBox.textContent = '【排查提示】' + (finalErr.message || '请求失败');
          }
          if (window.AppNav) AppNav.showToast('绘图遇到阻碍，请看下方提示');
        });
      });

      function onSuccess(url) {
        setGeneratingState(false, page);
        try {
          localStorage.removeItem(STORAGE_TASK_KEY);
          localStorage.setItem(STORAGE_LAST_RESULT_KEY, url);
        } catch(e){}
        showGeneratedResult(url, page);
        if (window.AppNav) AppNav.showToast('✦ 绘制成功 ✦');
      }
    });
  }

  function setGeneratingState(generating, page) {
    isGenerating = generating;
    var stage = page.querySelector('#aiPreviewStage');
    var startBtn = page.querySelector('#aiStartGenBtn');
    var statusText = page.querySelector('#aiProgressStatusText');
    var resultActions = page.querySelector('#aiResultActions');
    if (!stage || !startBtn) return;

    if (generating) {
      startTimestamp = Date.now();
      stage.classList.remove('has-result');
      stage.classList.add('is-generating');
      startBtn.disabled = true;
      startBtn.querySelector('span').textContent = '正在极速绘制中...';
      if (resultActions) resultActions.classList.remove('show');

      if (statusText) statusText.textContent = '正在连接极速画师... (0s)';
      clearInterval(timerInterval);
      timerInterval = setInterval(function() {
        var elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
        if (statusText) {
          if (elapsed < 5) statusText.textContent = '⚡ 正在极速连接画师... (' + elapsed + 's)';
          else if (elapsed < 12) statusText.textContent = '✨ 正在高精光影渲染... (' + elapsed + 's)';
          else statusText.textContent = '🎨 正在进行细节高清处理... (' + elapsed + 's)';
        }
      }, 1000);
    } else {
      startTimestamp = 0;
      clearInterval(timerInterval);
      stage.classList.remove('is-generating');
      startBtn.disabled = false;
      startBtn.querySelector('span').textContent = '重新绘制';
    }
  }

  function showGeneratedResult(url, page) {
    currentGeneratedUrl = url;
    var p = page || document.querySelector('[data-page="ai-image"]');
    if (!p) return;
    var stage = p.querySelector('#aiPreviewStage');
    var resultImg = p.querySelector('#aiResultImg');
    var resultActions = p.querySelector('#aiResultActions');
    if (stage && resultImg) {
      resultImg.onload = function() {
        stage.classList.add('has-result');
        if (resultActions) resultActions.classList.add('show');
      };
      resultImg.onerror = function() {
        stage.classList.add('has-result');
        if (resultActions) resultActions.classList.add('show');
      };
      resultImg.src = url;
      stage.classList.add('has-result');
      if (resultActions) resultActions.classList.add('show');
    }
  }

  function restorePersistedResult() {
    try {
      var saved = localStorage.getItem(STORAGE_LAST_RESULT_KEY);
      if (saved && !currentGeneratedUrl) {
        showGeneratedResult(saved);
      }
    } catch(e){}
  }

  function openStudio(options, callback) {
    currentCallback = callback || null;
    if (window.AppNav) {
      AppNav.showPage('ai-image');
    }
    var page = document.querySelector('[data-page="ai-image"]');
    if (page) {
      if (options && options.defaultPrompt) {
        var promptInput = page.querySelector('#aiPromptInput');
        if (promptInput) promptInput.value = options.defaultPrompt;
      }
      var apiSelect = page.querySelector('#aiApiChannelSelect');
      var customModelInput = page.querySelector('#aiCustomModelInput');
      loadAndPopulateApiChannels(apiSelect, customModelInput);
    }
  }

  window.AppAiImage = {
    openStudio: openStudio
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAiImageApp);
  } else {
    initAiImageApp();
  }

})();
