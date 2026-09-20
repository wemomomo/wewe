
/* ======================================================== */
/* 角色专属设定中枢 (Chat Settings Studio) - 纯黑灰高定版   */
/* ======================================================== */

@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap');

/* =========================================================
   1. 设定中枢遮罩与大卡片
========================================================= */
.wx-cr-settings-mask {
  position: fixed;
  inset: 0;
  background: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  z-index: 15000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.wx-cr-settings-mask.show {
  opacity: 1;
  pointer-events: auto;
}

.wx-cr-settings-card {
  width: 100%;
  max-width: 340px;
  max-height: 80vh;
  background: rgba(255, 255, 255, 0.5) !important;
  backdrop-filter: blur(6px) !important;
  -webkit-backdrop-filter: blur(6px) !important;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.8) !important;
  box-shadow: 0 16px 45px rgba(0, 0, 0, 0.1) !important;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform: scale(0.92);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}
.wx-cr-settings-mask.show .wx-cr-settings-card {
  transform: scale(1);
}

/* =========================================================
   2. 设定中枢华丽手账顶栏
========================================================= */
.sanctuary-header-luxury {
  position: relative;
  padding-top: 16px;
  padding-bottom: 10px;
  padding-left: 20px;
  padding-right: 18px;
  background: transparent !important;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  z-index: 20;
}

.header-main-action-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 38px;
}

.header-left-spacer {
  width: 28px;
  height: 28px;
  visibility: hidden;
}

.header-center-art-col {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  text-align: center;
  pointer-events: none;
}
.art-script-motto {
  font-family: 'Caveat', cursive;
  font-size: 16px;
  font-weight: 700;
  color: #777777;
  letter-spacing: 0.8px;
  line-height: 1;
}
.art-title-chinese {
  font-size: 18px;
  font-weight: 900;
  color: #111111;
  letter-spacing: 2px;
  text-indent: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.2;
}
.art-title-chinese .star-dot {
  font-size: 8px;
  color: #111111;
  transform: translateY(-1px);
}

.header-pure-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #111111;
  padding: 0;
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.header-pure-close:active {
  opacity: 0.4;
  transform: scale(0.9);
}
.header-pure-close svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.2;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.header-bottom-ruler-deck {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding-top: 4px;
}
.ruler-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.15) 20%, rgba(0, 0, 0, 0.15) 80%, transparent);
}
.ruler-center-tag {
  font-family: 'Caveat', cursive;
  font-size: 15px;
  font-weight: 700;
  color: #555555;
  padding: 0 10px;
  background: transparent !important;
  letter-spacing: 0.5px;
}

/* =========================================================
   3. 滚动区与底部托底条
========================================================= */
.wx-cr-set-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 10px 16px 0 !important;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: transparent !important;
  box-sizing: border-box;
}
.wx-cr-set-body::-webkit-scrollbar { display: none; }

.settings-bottom-spacer {
  display: block !important;
  width: 100% !important;
  height: 12px !important;
  min-height: 12px !important;
  flex-shrink: 0 !important;
  pointer-events: none !important;
}

.sanctuary-bottom-deck {
  width: 100% !important;
  height: 18px !important;
  min-height: 18px !important;
  background: transparent !important;
  flex-shrink: 0 !important;
  pointer-events: none !important;
}

/* =========================================================
   4. 章节子卡片与表单控件
========================================================= */
.gothic-card {
  position: relative;
  background: rgba(255, 255, 255, 0.45) !important;
  border: 1px solid rgba(20, 22, 25, 0.16) !important;
  border-radius: 14px;
  padding: 14px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.gothic-head-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 6px;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.15);
}
.gothic-title-group {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.gothic-sec-roman {
  font-family: 'Caveat', cursive;
  font-size: 19px;
  font-weight: 700;
  color: #111111;
}
.gothic-sec-title {
  font-size: 14.5px !important;
  font-weight: 800;
  color: #111111;
  letter-spacing: 0.5px;
}
.gothic-sec-en {
  font-family: 'Caveat', cursive !important;
  font-size: 17px !important;
  font-weight: 700 !important;
  color: #555555;
  letter-spacing: 1px;
}

/* 场景文本框 */
.scripture-textarea-wrap {
  background: rgba(255, 255, 255, 0.5) !important;
  border: 1px solid rgba(20, 22, 25, 0.16) !important;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.scripture-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.scripture-label {
  font-size: 12.5px !important;
  font-weight: 700;
  color: #222222;
}

.scripture-expand-btn {
  background: none !important;
  border: none !important;
  border-radius: 0 !important;
  padding: 2px !important;
  color: #111111 !important;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.scripture-expand-btn:active {
  opacity: 0.4;
}
.scripture-expand-btn svg {
  width: 14px !important;
  height: 14px !important;
  stroke: currentColor;
  stroke-width: 2.2;
  fill: none;
}

.scripture-textarea {
  width: 100%;
  min-height: 84px;
  border: none;
  background: transparent !important;
  outline: none;
  font-size: 13.5px !important;
  line-height: 1.55;
  color: #111111 !important;
  resize: none;
  font-family: inherit;
}
.scripture-textarea::placeholder { color: #8e8e93; font-size: 12.5px; }

.gothic-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}
.gothic-row-label-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.gothic-label {
  font-size: 13.5px !important;
  font-weight: 700;
  color: #111111;
}
.gothic-desc {
  font-size: 12px !important;
  color: #555555 !important;
  line-height: 1.4;
}

/* 滑块仪表盒 */
.metric-gauge-box {
  background: rgba(255, 255, 255, 0.45) !important;
  border: 1px solid rgba(20, 22, 25, 0.14) !important;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.gauge-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.gauge-title {
  font-size: 13px !important;
  font-weight: 800;
  color: #111111;
}
.gauge-val-tag {
  font-family: monospace;
  font-size: 12px;
  font-weight: 900;
  background: #111111;
  color: #ffffff;
  padding: 2px 7px;
  border-radius: 4px;
}
.gauge-desc {
  font-size: 12px !important;
  color: #555555 !important;
  line-height: 1.45;
}
.gauge-slider-deck {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.gauge-bound {
  font-size: 10.5px !important;
  font-family: monospace;
  font-weight: 700;
  color: #555555;
}
.gothic-range {
  flex: 1;
  accent-color: #111111;
}

/* 单选框与开关 */
.cr-custom-radio {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  cursor: pointer !important;
  font-size: 13px !important;
  color: #111111 !important;
  font-weight: 600 !important;
  user-select: none !important;
}
.cr-custom-radio input[type="radio"] {
  display: none !important;
  opacity: 0 !important;
  width: 0 !important;
  height: 0 !important;
  position: absolute !important;
  pointer-events: none !important;
}
.cr-radio-circle {
  width: 16px !important;
  height: 16px !important;
  border-radius: 50% !important;
  border: 1.5px solid #111111 !important;
  background: rgba(255, 255, 255, 0.7) !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-shrink: 0 !important;
  transition: all 0.2s ease !important;
}
.cr-custom-radio input[type="radio"]:checked + .cr-radio-circle::after {
  content: '' !important;
  width: 6px !important;
  height: 6px !important;
  border-radius: 50% !important;
  background: #111111 !important;
}

.wx-switch {
  position: relative;
  width: 34px;
  height: 20px;
  background: #e5e5ea;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.25s;
  flex-shrink: 0;
}
.wx-switch.on { background: #111111; }
.wx-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #ffffff;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.wx-switch.on .wx-switch-knob { transform: translateX(14px); }

/* 输入框与按钮 */
.gothic-input, .gothic-select {
  border: 1px solid rgba(20, 22, 25, 0.18) !important;
  background: rgba(255, 255, 255, 0.65) !important;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 13px;
  color: #111111;
  outline: none;
  font-weight: 600;
}
.gothic-input.num { width: 58px; text-align: center; }
.gothic-input.city { width: 100px; text-align: right; }

.disc-action-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #111111;
  border: none;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}
.disc-action-btn:active { transform: scale(0.88); }
.disc-action-btn svg { width: 13px; height: 13px; stroke: currentColor; stroke-width: 2.2; fill: none; }

/* 芯片标签 */
.gothic-chips-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}
.gothic-chip { cursor: pointer; }
.gothic-chip input { display: none; }
.gothic-chip span {
  display: inline-block;
  font-size: 11.5px;
  padding: 4px 9px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.45) !important;
  border: 1px solid rgba(0, 0, 0, 0.12) !important;
  color: #333333;
  font-weight: 600;
}
.gothic-chip input:checked + span {
  background: #111111 !important;
  color: #ffffff !important;
  border-color: #111111 !important;
}
