// onboarding.js — Первоначальная настройка системы

(function() {
    'use strict';

    const DONE_KEY = 'shnuk_onboarding_done';
    const LANG_KEY = 'shnuk_lang';
    const BLUR_OFF_KEY = 'shnuk_blur_disabled';
    const SOUND_OFF_KEY = 'shnuk_sound_disabled';
    const SOUND_TARGETS_KEY = 'shnuk_sound_disabled_targets';

    let root = null;
    let selectedLang = 'ru';
    let isFinishing = false;

    const LANGS = {
        ru: {
            label: 'Русский',
            pickLangTitle: 'Язык системы',
            pickLangDesc: 'Выберите язык, на котором будет говорить Shnuk OS.',
            blurTitle: 'Размытие и анимации',
            blurDesc: 'Настройте визуальные эффекты системы.',
            blurAllLabel: 'Отключить размытие и анимации',
            blurAllSub: 'Убрать размытие фона и все переходы',
            soundTitle: 'Звуки',
            soundDesc: 'Управление звуковыми эффектами системы.',
            soundAllLabel: 'Отключить все звуки',
            soundAllSub: 'Полностью выключить системные сигналы',
            soundTargetsLabel: 'Отключить отдельные звуки',
            soundTargetsSub: 'Настроить по отдельности',
            next: 'Далее',
            finish: 'Начать работу',
            back: 'Назад',
            targetSoundWindow: 'Окна',
            targetSoundNotify: 'Уведомления',
            targetSoundError: 'Ошибки'
        },
        en: {
            label: 'English',
            pickLangTitle: 'System language',
            pickLangDesc: 'Choose the language of Shnuk OS.',
            blurTitle: 'Blur and animations',
            blurDesc: 'Configure system visual effects.',
            blurAllLabel: 'Disable blur and animations',
            blurAllSub: 'Remove background blur and all transitions',
            soundTitle: 'Sounds',
            soundDesc: 'System sound effects management.',
            soundAllLabel: 'Disable all sounds',
            soundAllSub: 'Turn off all system signals',
            soundTargetsLabel: 'Disable specific sounds',
            soundTargetsSub: 'Configure individually',
            next: 'Next',
            finish: 'Get started',
            back: 'Back',
            targetSoundWindow: 'Windows',
            targetSoundNotify: 'Notifications',
            targetSoundError: 'Errors'
        },
        zh: {
            label: '中文',
            pickLangTitle: '系统语言',
            pickLangDesc: '选择 Shnuk OS 的语言。',
            blurTitle: '模糊与动画',
            blurDesc: '配置系统的视觉效果。',
            blurAllLabel: '关闭模糊与动画',
            blurAllSub: '移除背景模糊和所有过渡效果',
            soundTitle: '声音',
            soundDesc: '系统音效管理。',
            soundAllLabel: '关闭所有声音',
            soundAllSub: '关闭所有系统提示音',
            soundTargetsLabel: '关闭某些声音',
            soundTargetsSub: '逐项配置',
            next: '下一步',
            finish: '开始使用',
            back: '返回',
            targetSoundWindow: '窗口',
            targetSoundNotify: '通知',
            targetSoundError: '错误'
        },
        meme: {
            label: 'Мемный',
            pickLangTitle: 'Клута языка',
            pickLangDesc: 'Выбели язык, на котолом будет говолить Shnuk OS.',
            blurTitle: 'Клута и анимации',
            blurDesc: 'Настлойте визуальные эффекты системы.',
            blurAllLabel: 'Отключить клута и анимации',
            blurAllSub: 'Ублать клута фона и все пелеходы',
            soundTitle: 'Пельмени',
            soundDesc: 'Уплавление звуковыми эффектами системы.',
            soundAllLabel: 'Отключить все пельмени',
            soundAllSub: 'Полностью выключить системные сигналы',
            soundTargetsLabel: 'Отключить отдельные пельмени',
            soundTargetsSub: 'Настлоить по отдельности',
            next: 'Далее',
            finish: 'Охаешеньки, начать',
            back: 'Назад',
            targetSoundWindow: 'Окна',
            targetSoundNotify: 'Уведомления',
            targetSoundError: 'Ошибки'
        }
    };

    function getLang() { return LANGS[selectedLang] || LANGS.ru; }
    function tr(k) { const l = getLang(); return l[k] || k; }

    function saveLang(lang) { try { localStorage.setItem(LANG_KEY, lang); } catch(e) {} }
    function saveBlurAll(off) {
        try {
            if (off) localStorage.setItem(BLUR_OFF_KEY, 'true');
            else localStorage.removeItem(BLUR_OFF_KEY);
        } catch(e) {}
    }
    function saveSoundAll(off) {
        try {
            if (off) localStorage.setItem(SOUND_OFF_KEY, 'true');
            else localStorage.removeItem(SOUND_OFF_KEY);
        } catch(e) {}
    }
    function saveSoundTargets(map) { try { localStorage.setItem(SOUND_TARGETS_KEY, JSON.stringify(map)); } catch(e) {} }

    // ============================================
    // СТИЛИ
    // ============================================

    function injectStyles() {
        if (document.getElementById('onboardingStyles')) return;
        const st = document.createElement('style');
        st.id = 'onboardingStyles';
        st.textContent = `
            #obRoot {
                position: fixed;
                top: 0; left: 0;
                width: 100vw; height: 100vh;
                background: #000000;
                z-index: 2147483647;
                font-family: 'TTPaplane', monospace;
                color: #ffffff;
                overflow: hidden;
                -webkit-tap-highlight-color: transparent;
                user-select: none;
                -webkit-user-select: none;
                opacity: 0;
                animation: obRootFadeIn 0.4s ease forwards;
            }

            #obRoot, #obRoot * {
                font-family: 'TTPaplane', monospace !important;
            }

            @keyframes obRootFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes obRootFadeOut { from { opacity: 1; } to { opacity: 0; } }

            @keyframes obBlurIn {
                from { opacity: 0; filter: blur(24px); transform: scale(0.96); }
                to   { opacity: 1; filter: blur(0);   transform: scale(1); }
            }
            @keyframes obBlurOut {
                from { opacity: 1; filter: blur(0);    transform: scale(1); }
                to   { opacity: 0; filter: blur(24px); transform: scale(0.96); }
            }
            @keyframes obLogoIn {
                from { opacity: 0; filter: blur(24px); transform: scale(0.94); }
                to   { opacity: 1; filter: blur(0);    transform: scale(1); }
            }

            .ob-step {
                position: absolute;
                top: 0; left: 0;
                width: 100%; height: 100%;
                display: none;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px 24px;
                box-sizing: border-box;
                opacity: 0;
                filter: blur(24px);
                transform: scale(0.96);
            }
            .ob-step.active {
                display: flex !important;
                opacity: 1;
                filter: blur(0);
                transform: scale(1);
                animation: obBlurIn 0.55s cubic-bezier(.22,1,.36,1);
            }
            .ob-step.leaving {
                display: flex !important;
                opacity: 0;
                filter: blur(24px);
                transform: scale(0.96);
                animation: obBlurOut 0.45s cubic-bezier(.22,1,.36,1);
                pointer-events: none;
            }

            #obWelcome {
                justify-content: center;
                align-items: center;
            }
            #obWelcome .ob-logo-text {
                font-family: 'TTPaplane', monospace;
                font-weight: 700;
                font-size: 48px;
                line-height: 1;
                letter-spacing: 0.08em;
                color: #ffffff;
                text-align: center;
                user-select: none;
                -webkit-user-select: none;
                pointer-events: none;
                white-space: nowrap;
                text-shadow:
                    0 0 18px rgba(255,255,255,0.10),
                    0 0 48px rgba(255,255,255,0.06);
                animation: obLogoIn 0.9s cubic-bezier(.22,1,.36,1) both;
            }

            .ob-arrow-btn {
                position: absolute;
                bottom: 60px;
                right: 60px;
                width: 80px;
                height: 80px;
                background: none;
                border: none;
                padding: 0;
                cursor: pointer;
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                -webkit-tap-highlight-color: transparent;
                outline: none;
                transition: transform .25s cubic-bezier(.22,1,.36,1), opacity .25s ease;
                opacity: 0.85;
                z-index: 5;
            }
            .ob-arrow-btn:hover { opacity: 1; transform: translateX(6px); }
            .ob-arrow-btn:active { transform: translateX(6px) scale(0.94); }
            .ob-arrow-btn svg {
                width: 52px;
                height: 52px;
                display: block;
                stroke: currentColor;
                fill: none;
                stroke-width: 2.2;
                stroke-linecap: round;
                stroke-linejoin: round;
            }

            .ob-content {
                width: 100%;
                max-width: 640px;
                display: flex;
                flex-direction: column;
                gap: 22px;
                box-sizing: border-box;
            }

            .ob-title {
                font-size: 34px;
                font-weight: 700;
                letter-spacing: 0.6px;
                text-align: left;
                color: #ffffff;
                margin: 0;
            }

            .ob-subtitle {
                font-size: 15px;
                color: rgba(255,255,255,0.6);
                line-height: 1.55;
                margin-top: -12px;
            }

            .ob-lang-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .ob-lang-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 18px 22px;
                border: 2px solid rgba(255,255,255,0.18);
                background: rgba(255,255,255,0.03);
                cursor: pointer;
                font-family: 'TTPaplane', monospace;
                color: #ffffff;
                font-size: 20px;
                text-align: left;
                transition: all .2s ease;
                -webkit-tap-highlight-color: transparent;
                outline: none;
            }
            .ob-lang-item:hover {
                border-color: rgba(255,255,255,0.5);
                background: rgba(255,255,255,0.08);
            }
            .ob-lang-item.selected {
                border-color: #ffffff;
                background: rgba(255,255,255,0.14);
            }
            .ob-lang-name { font-weight: 700; letter-spacing: 0.3px; }
            .ob-lang-mark {
                width: 20px;
                height: 20px;
                border: 2px solid rgba(255,255,255,0.4);
                border-radius: 50%;
                position: relative;
                flex-shrink: 0;
                transition: all .2s ease;
            }
            .ob-lang-item.selected .ob-lang-mark {
                border-color: #ffffff;
                background: #ffffff;
            }
            .ob-lang-item.selected .ob-lang-mark::after {
                content: '';
                position: absolute;
                inset: 4px;
                border-radius: 50%;
                background: #000000;
            }

            .ob-toggle-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                padding: 20px 22px;
                border: 2px solid rgba(255,255,255,0.18);
                background: rgba(255,255,255,0.03);
                cursor: pointer;
                transition: all .2s ease;
                -webkit-tap-highlight-color: transparent;
            }
            .ob-toggle-row:hover {
                border-color: rgba(255,255,255,0.4);
                background: rgba(255,255,255,0.06);
            }
            .ob-toggle-text {
                display: flex;
                flex-direction: column;
                gap: 4px;
                min-width: 0;
            }
            .ob-toggle-label {
                font-size: 20px;
                font-weight: 700;
                color: #ffffff;
                letter-spacing: 0.3px;
            }
            .ob-toggle-sub {
                font-size: 13px;
                color: rgba(255,255,255,0.55);
                line-height: 1.4;
            }
            .ob-switch {
                width: 54px;
                height: 32px;
                background: rgba(255,255,255,0.18);
                position: relative;
                flex-shrink: 0;
                transition: background .25s ease;
            }
            .ob-switch::after {
                content: '';
                position: absolute;
                top: 2px;
                left: 2px;
                width: 28px;
                height: 28px;
                background: #ffffff;
                transition: transform .25s ease;
            }
            .ob-toggle-row.active .ob-switch { background: #ffffff; }
            .ob-toggle-row.active .ob-switch::after {
                transform: translateX(22px);
                background: #000000;
            }

            .ob-subpanel {
                display: none;
                flex-direction: column;
                gap: 10px;
                padding: 14px 16px;
                border: 2px solid rgba(255,255,255,0.12);
                background: rgba(255,255,255,0.02);
                margin-top: 8px;
            }
            .ob-subpanel.visible { display: flex; }
            .ob-subpanel-title {
                font-size: 12px;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: rgba(255,255,255,0.5);
                margin-bottom: 4px;
            }
            .ob-sub-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 14px;
                padding: 10px 4px;
                font-size: 16px;
                color: rgba(255,255,255,0.9);
            }
            .ob-sub-switch {
                width: 46px;
                height: 26px;
                background: rgba(255,255,255,0.18);
                position: relative;
                flex-shrink: 0;
                transition: background .25s ease;
                cursor: pointer;
            }
            .ob-sub-switch::after {
                content: '';
                position: absolute;
                top: 2px;
                left: 2px;
                width: 22px;
                height: 22px;
                background: #ffffff;
                transition: transform .25s ease;
            }
            .ob-sub-switch.on { background: #ffffff; }
            .ob-sub-switch.on::after {
                transform: translateX(20px);
                background: #000000;
            }
            .ob-sub-switch.disabled {
                opacity: 0.35;
                pointer-events: none;
            }

            .ob-nav {
                position: absolute;
                left: 24px;
                right: 24px;
                bottom: 40px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 16px;
                max-width: 640px;
                margin: 0 auto;
                pointer-events: auto;
                z-index: 6;
            }

            .ob-btn {
                padding: 16px 34px;
                border: 2px solid rgba(255,255,255,0.6);
                background: none;
                color: #ffffff;
                font-family: 'TTPaplane', monospace;
                font-size: 16px;
                font-weight: 700;
                letter-spacing: 1px;
                cursor: pointer;
                transition: all .2s ease;
                -webkit-tap-highlight-color: transparent;
                outline: none;
            }
            .ob-btn:hover {
                background: #ffffff;
                color: #000000;
                border-color: #ffffff;
            }
            .ob-btn:active { transform: scale(0.96); }
            .ob-btn.primary {
                background: #ffffff;
                color: #000000;
                border-color: #ffffff;
            }
            .ob-btn.primary:hover {
                background: rgba(255,255,255,0.85);
                border-color: rgba(255,255,255,0.85);
            }
            .ob-btn.ghost {
                border-color: rgba(255,255,255,0.25);
                color: rgba(255,255,255,0.65);
            }
            .ob-btn.ghost:hover {
                background: rgba(255,255,255,0.08);
                color: #ffffff;
                border-color: rgba(255,255,255,0.5);
            }

            /* Если системный no-blur активен — не даём ему портить анимации самого онбординга. */
            html.no-blur #obRoot,
            html.no-blur #obRoot *,
            html.no-blur #obRoot *::before,
            html.no-blur #obRoot *::after {
                animation: revert !important;
                transition: revert !important;
                filter: revert !important;
                backdrop-filter: revert !important;
                -webkit-backdrop-filter: revert !important;
            }
            html.no-blur #obRoot .ob-step.active {
                animation: obBlurIn 0.55s cubic-bezier(.22,1,.36,1) !important;
            }
            html.no-blur #obRoot .ob-step.leaving {
                animation: obBlurOut 0.45s cubic-bezier(.22,1,.36,1) !important;
            }
            html.no-blur #obRoot .ob-logo-text {
                animation: obLogoIn 0.9s cubic-bezier(.22,1,.36,1) both !important;
            }

            @media (max-width: 500px) {
                #obWelcome .ob-logo-text {
                    font-size: 34px;
                    letter-spacing: 0.06em;
                }
                .ob-arrow-btn {
                    bottom: 40px;
                    right: 30px;
                    width: 68px;
                    height: 68px;
                }
                .ob-arrow-btn svg { width: 44px; height: 44px; }
                .ob-title { font-size: 26px; }
                .ob-lang-item { padding: 16px 18px; font-size: 18px; }
                .ob-toggle-row { padding: 16px 18px; }
                .ob-toggle-label { font-size: 17px; }
                .ob-toggle-sub { font-size: 12px; }
                .ob-nav { left: 16px; right: 16px; bottom: 24px; gap: 10px; }
                .ob-btn { padding: 14px 24px; font-size: 14px; }
            }
        `;
        document.head.appendChild(st);
    }

    let blurAll = false;
    let soundAll = false;
    let soundTargets = {};

    // ============================================
    // СОЗДАНИЕ UI
    // ============================================

    function createRoot() {
        if (root) return;
        injectStyles();
        root = document.createElement('div');
        root.id = 'obRoot';
        root.innerHTML = `
            <div class="ob-step active" id="obWelcome">
                <div class="ob-logo-text">Shnuk OS</div>
                <button class="ob-arrow-btn" id="obArrowBtn" aria-label="Далее">
                    <svg viewBox="0 0 24 24"><line x1="4" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
            </div>

            <div class="ob-step" id="obLang">
                <div class="ob-content">
                    <h1 class="ob-title" id="obLangTitle"></h1>
                    <div class="ob-subtitle" id="obLangDesc"></div>
                    <div class="ob-lang-list" id="obLangList"></div>
                </div>
                <div class="ob-nav">
                    <button class="ob-btn ghost" id="obLangBack"></button>
                    <button class="ob-btn primary" id="obLangNext"></button>
                </div>
            </div>

            <div class="ob-step" id="obBlur">
                <div class="ob-content">
                    <h1 class="ob-title" id="obBlurTitle"></h1>
                    <div class="ob-subtitle" id="obBlurDesc"></div>
                    <div class="ob-toggle-row" id="obBlurAllRow">
                        <div class="ob-toggle-text">
                            <div class="ob-toggle-label" id="obBlurAllLabel"></div>
                            <div class="ob-toggle-sub" id="obBlurAllSub"></div>
                        </div>
                        <div class="ob-switch"></div>
                    </div>
                </div>
                <div class="ob-nav">
                    <button class="ob-btn ghost" id="obBlurBack"></button>
                    <button class="ob-btn primary" id="obBlurNext"></button>
                </div>
            </div>

            <div class="ob-step" id="obSound">
                <div class="ob-content">
                    <h1 class="ob-title" id="obSoundTitle"></h1>
                    <div class="ob-subtitle" id="obSoundDesc"></div>
                    <div class="ob-toggle-row" id="obSoundAllRow">
                        <div class="ob-toggle-text">
                            <div class="ob-toggle-label" id="obSoundAllLabel"></div>
                            <div class="ob-toggle-sub" id="obSoundAllSub"></div>
                        </div>
                        <div class="ob-switch"></div>
                    </div>
                    <div class="ob-toggle-row" id="obSoundTargetsRow">
                        <div class="ob-toggle-text">
                            <div class="ob-toggle-label" id="obSoundTargetsLabel"></div>
                            <div class="ob-toggle-sub" id="obSoundTargetsSub"></div>
                        </div>
                        <div class="ob-switch"></div>
                    </div>
                    <div class="ob-subpanel" id="obSoundSubpanel">
                        <div class="ob-subpanel-title">—</div>
                        <div class="ob-sub-row">
                            <span id="obSoundWinLabel"></span>
                            <div class="ob-sub-switch on" data-key="window"></div>
                        </div>
                        <div class="ob-sub-row">
                            <span id="obSoundNotifyLabel"></span>
                            <div class="ob-sub-switch on" data-key="notify"></div>
                        </div>
                        <div class="ob-sub-row">
                            <span id="obSoundErrorLabel"></span>
                            <div class="ob-sub-switch on" data-key="error"></div>
                        </div>
                    </div>
                </div>
                <div class="ob-nav">
                    <button class="ob-btn ghost" id="obSoundBack"></button>
                    <button class="ob-btn primary" id="obSoundNext"></button>
                </div>
            </div>
        `;
        document.body.appendChild(root);

        root.querySelector('#obArrowBtn').addEventListener('click', function() {
            gotoStep('lang');
        });

        renderLangList();

        root.querySelector('#obLangBack').addEventListener('click', function() { gotoStep('welcome'); });
        root.querySelector('#obLangNext').addEventListener('click', function() { gotoStep('blur'); });

        root.querySelector('#obBlurAllRow').addEventListener('click', function() {
            blurAll = !blurAll;
            this.classList.toggle('active', blurAll);
        });
        root.querySelector('#obBlurBack').addEventListener('click', function() { gotoStep('lang'); });
        root.querySelector('#obBlurNext').addEventListener('click', function() { gotoStep('sound'); });

        root.querySelector('#obSoundAllRow').addEventListener('click', function() {
            soundAll = !soundAll;
            this.classList.toggle('active', soundAll);
            updateSoundUI();
        });
        root.querySelector('#obSoundTargetsRow').addEventListener('click', function() {
            const visible = !document.getElementById('obSoundSubpanel').classList.contains('visible');
            document.getElementById('obSoundSubpanel').classList.toggle('visible', visible);
            this.classList.toggle('active', visible);
        });
        root.querySelectorAll('#obSoundSubpanel .ob-sub-switch').forEach(sw => {
            sw.addEventListener('click', function() {
                if (soundAll) return;
                const key = this.dataset.key;
                const isOn = !this.classList.contains('on');
                this.classList.toggle('on', isOn);
                if (!isOn) soundTargets[key] = true;
                else delete soundTargets[key];
            });
        });
        root.querySelector('#obSoundBack').addEventListener('click', function() { gotoStep('blur'); });
        root.querySelector('#obSoundNext').addEventListener('click', function() { finish(); });

        applyLangToStaticText();
    }

    function renderLangList() {
        const list = document.getElementById('obLangList');
        if (!list) return;
        list.innerHTML = '';
        ['ru', 'en', 'zh', 'meme'].forEach(function(code) {
            const data = LANGS[code];
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'ob-lang-item' + (selectedLang === code ? ' selected' : '');
            item.dataset.code = code;
            item.innerHTML = `
                <span class="ob-lang-name">${data.label}</span>
                <span class="ob-lang-mark"></span>
            `;
            item.addEventListener('click', function() {
                selectedLang = code;
                renderLangList();
                applyLangToStaticText();
            });
            list.appendChild(item);
        });
    }

    function applyLangToStaticText() {
        const setText = function(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };
        setText('obLangTitle', tr('pickLangTitle'));
        setText('obLangDesc', tr('pickLangDesc'));
        setText('obLangBack', tr('back'));
        setText('obLangNext', tr('next'));
        setText('obBlurTitle', tr('blurTitle'));
        setText('obBlurDesc', tr('blurDesc'));
        setText('obBlurAllLabel', tr('blurAllLabel'));
        setText('obBlurAllSub', tr('blurAllSub'));
        setText('obBlurBack', tr('back'));
        setText('obBlurNext', tr('next'));
        setText('obSoundTitle', tr('soundTitle'));
        setText('obSoundDesc', tr('soundDesc'));
        setText('obSoundAllLabel', tr('soundAllLabel'));
        setText('obSoundAllSub', tr('soundAllSub'));
        setText('obSoundTargetsLabel', tr('soundTargetsLabel'));
        setText('obSoundTargetsSub', tr('soundTargetsSub'));
        setText('obSoundWinLabel', tr('targetSoundWindow'));
        setText('obSoundNotifyLabel', tr('targetSoundNotify'));
        setText('obSoundErrorLabel', tr('targetSoundError'));
        setText('obSoundBack', tr('back'));
        setText('obSoundNext', tr('finish'));
    }

    function updateSoundUI() {
        const subSwitches = document.querySelectorAll('#obSoundSubpanel .ob-sub-switch');
        subSwitches.forEach(function(sw) {
            sw.classList.toggle('disabled', soundAll);
            if (soundAll) sw.classList.remove('on');
            else {
                const key = sw.dataset.key;
                sw.classList.toggle('on', !soundTargets[key]);
            }
        });
    }

    function gotoStep(id) {
        const steps = root.querySelectorAll('.ob-step');
        let oldEl = null;
        steps.forEach(function(el) { if (el.classList.contains('active')) oldEl = el; });
        const newEl = root.querySelector('#ob' + id.charAt(0).toUpperCase() + id.slice(1));
        if (!newEl || newEl === oldEl) return;

        if (oldEl) {
            oldEl.classList.remove('active');
            oldEl.classList.add('leaving');
            setTimeout(function() {
                oldEl.classList.remove('leaving');
                oldEl.style.display = 'none';
            }, 450);
        }

        newEl.style.display = 'flex';
        newEl.classList.remove('leaving');
        newEl.classList.add('active');
    }

    function finish() {
        if (isFinishing) return;
        isFinishing = true;

        saveLang(selectedLang);
        saveBlurAll(blurAll);
        saveSoundAll(soundAll);
        saveSoundTargets(soundTargets);
        try { localStorage.setItem(DONE_KEY, 'true'); } catch(e) {}

        if (root) {
            root.style.animation = 'obRootFadeOut 0.45s ease forwards';
            setTimeout(function() {
                if (root && root.parentNode) root.parentNode.removeChild(root);
                root = null;

                try {
                    if (blurAll) document.documentElement.classList.add('no-blur');
                    else document.documentElement.classList.remove('no-blur');
                } catch(e) {}

                try {
                    window.dispatchEvent(new CustomEvent('shnuk:lang-changed', { detail: { lang: selectedLang } }));
                    window.dispatchEvent(new CustomEvent('shnuk:blur-settings-changed', { detail: { blurDisabled: blurAll } }));
                    window.dispatchEvent(new CustomEvent('shnuk:sound-settings-changed', { detail: { soundDisabled: soundAll, targets: soundTargets } }));
                } catch(e) {}
            }, 460);
        } else {
            try {
                if (blurAll) document.documentElement.classList.add('no-blur');
                else document.documentElement.classList.remove('no-blur');
            } catch(e) {}
            try {
                window.dispatchEvent(new CustomEvent('shnuk:lang-changed', { detail: { lang: selectedLang } }));
                window.dispatchEvent(new CustomEvent('shnuk:blur-settings-changed', { detail: { blurDisabled: blurAll } }));
                window.dispatchEvent(new CustomEvent('shnuk:sound-settings-changed', { detail: { soundDisabled: soundAll, targets: soundTargets } }));
            } catch(e) {}
        }
    }

    function isDone() {
        try { return localStorage.getItem(DONE_KEY) === 'true'; }
        catch(e) { return false; }
    }

    function show() {
        if (root) return;
        if (isDone()) return;
        createRoot();
    }

    function reset() {
        try {
            localStorage.removeItem(DONE_KEY);
            localStorage.removeItem(LANG_KEY);
            localStorage.removeItem(BLUR_OFF_KEY);
            localStorage.removeItem(SOUND_OFF_KEY);
            localStorage.removeItem(SOUND_TARGETS_KEY);
        } catch(e) {}
    }

    window.Onboarding = {
        isDone: isDone,
        show: show,
        reset: reset
    };

    function bootstrap() {
        setTimeout(function() {
            try { show(); } catch(e) {}
        }, 80);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }

})();