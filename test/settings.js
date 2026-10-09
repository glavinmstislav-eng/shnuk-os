// settings.js

(function() {
    'use strict';

    let isOpen = false;
    let currentTheme = 'day';
    let currentTab = 'theme';
    let isSectionTransitioning = false;

    const THEME_KEY = 'shnuk_theme';
    const WALLPAPER_KEY = 'shnuk_wallpaper';
    const WALLPAPER_NAME_KEY = 'shnuk_wallpaper_name';
    const FULLSCREEN_KEY = 'shnuk_fullscreen';
    const APP_WALLPAPER_KEY = 'app_wallpaper';
    const SCREEN_SETTINGS_KEY = 'shnuk_screen_settings';
    const SEARCH_INTELLIGENCE_KEY = 'shnuk_search_intelligence';

    const FONT_MAIN = "'TTPaplane', monospace";

    const themes = [
        { id: 'day',     name: 'Яркий день',  file: 'wall1.png', desc: 'Светлая палитра' },
        { id: 'evening', name: 'Тёплая ночь', file: 'wall2.png', desc: 'Тёмная палитра'  }
    ];

    let securityPage = 'menu';

    function getWin() {
        if (window.Win) return window.Win;
        return {
            alert: (msg) => Promise.resolve(),
            confirm: (msg) => Promise.resolve(false),
            prompt: (msg, def) => Promise.resolve(null),
            notify: () => {}
        };
    }

    function loadScreenSettings() {
        const defaults = {
            desktopSearch: false,
            appsSearch: false,
            searchEngine: 'google',
            desktopCols: 4,
            desktopRows: 2,
            appsCols: 4,
            appsRows: 3
        };
        try {
            const raw = localStorage.getItem(SCREEN_SETTINGS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return Object.assign(defaults, parsed);
            }
        } catch(e) {}
        return defaults;
    }

    function saveScreenSettings(s) {
        try {
            localStorage.setItem(SCREEN_SETTINGS_KEY, JSON.stringify(s));
        } catch(e) {}
        try {
            window.dispatchEvent(new CustomEvent('shnuk:screen-settings-changed', { detail: s }));
        } catch(e) {}
    }

    function loadSearchIntelligence() {
        const defaults = {
            photos: false,
            files: false,
            notifications: false,
            livebarActions: false
        };
        try {
            const raw = localStorage.getItem(SEARCH_INTELLIGENCE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return Object.assign(defaults, parsed);
            }
        } catch(e) {}
        return defaults;
    }

    function saveSearchIntelligence(s) {
        try {
            localStorage.setItem(SEARCH_INTELLIGENCE_KEY, JSON.stringify(s));
        } catch(e) {}
        try {
            window.dispatchEvent(new CustomEvent('shnuk:search-intelligence-changed', { detail: s }));
        } catch(e) {}
    }

    function isFullscreen() {
        return !!(document.fullscreenElement ||
                  document.webkitFullscreenElement ||
                  document.mozFullScreenElement ||
                  document.msFullscreenElement);
    }

    function enterFullscreen() {
        const el = document.documentElement;
        try {
            if (el.requestFullscreen) return el.requestFullscreen();
            if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
            if (el.mozRequestFullScreen) return el.mozRequestFullScreen();
            if (el.msRequestFullscreen) return el.msRequestFullscreen();
        } catch(e) {}
        return Promise.reject('not supported');
    }

    function exitFullscreen() {
        try {
            if (document.exitFullscreen) return document.exitFullscreen();
            if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
            if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
            if (document.msExitFullscreen) return document.msExitFullscreen();
        } catch(e) {}
        return Promise.reject('not supported');
    }

    function toggleFullscreen() {
        if (isFullscreen()) {
            return exitFullscreen().then(function() {
                try { localStorage.setItem(FULLSCREEN_KEY, 'false'); } catch(e) {}
            });
        } else {
            return enterFullscreen().then(function() {
                try { localStorage.setItem(FULLSCREEN_KEY, 'true'); } catch(e) {}
            });
        }
    }

    function notifyWallpaperChanged() {
        try {
            const url = localStorage.getItem(APP_WALLPAPER_KEY);
            if (url) {
                window.dispatchEvent(new CustomEvent('shnuk:wallpaper-changed', { detail: { url: url } }));
            }
        } catch(e) {}
    }

    function applyTheme(themeId) {
        if (themeId === 'day') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', themeId);
        }
    }

    function notifyThemeChanged(themeId) {
        window.dispatchEvent(new CustomEvent('shnuk:theme-changed', { detail: { theme: themeId } }));
    }

    function loadData() {
        try {
            const savedApp = localStorage.getItem(APP_WALLPAPER_KEY);
            if (savedApp) {
                currentTheme = detectThemeByFile(savedApp);
            } else {
                const savedTheme = localStorage.getItem(THEME_KEY);
                if (savedTheme && themes.some(t => t.id === savedTheme)) {
                    currentTheme = savedTheme;
                } else {
                    const savedWall = localStorage.getItem(WALLPAPER_KEY) || 'wall1.png';
                    currentTheme = detectThemeByFile(savedWall);
                }
            }
        } catch(e) {
            currentTheme = 'day';
        }
    }

    function detectThemeByFile(file) {
        const found = themes.find(t => t.file === file || t.id === file);
        return found ? found.id : 'day';
    }

    function saveTheme(themeId) {
        const theme = themes.find(t => t.id === themeId);
        if (!theme) return;

        currentTheme = theme.id;

        try {
            localStorage.setItem(THEME_KEY, theme.id);
            localStorage.setItem(WALLPAPER_KEY, theme.file);
            localStorage.setItem(WALLPAPER_NAME_KEY, theme.name);
            localStorage.setItem(APP_WALLPAPER_KEY, theme.file);
        } catch(e) {}

        applyTheme(theme.id);

        const bg = document.getElementById('appBackground');
        if (bg) {
            bg.dataset.staticWallpaper = theme.file;
            bg.style.backgroundImage = `url('${theme.file}')`;
        }

        renderThemeToggle();
        renderScreenSettings();
        notifyWallpaperChanged();
        notifyThemeChanged(theme.id);
    }

    function toggleTheme() {
        const next = currentTheme === 'evening' ? 'day' : 'evening';
        saveTheme(next);
    }

    function renderThemeToggle() {
        const container = document.getElementById('themeGrid');
        if (!container) return;
        container.innerHTML = '';

        const isDark = (currentTheme === 'evening');

        const wrap = document.createElement('div');
        wrap.className = 'theme-toggle-wrap';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theme-toggle-btn' + (isDark ? ' dark-active' : '');
        btn.setAttribute('aria-label', isDark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему');

        const sunEl = document.createElement('span');
        sunEl.className = 'theme-toggle-icon theme-toggle-icon-sun';
        sunEl.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                '<circle cx="12" cy="12" r="4.2" fill="currentColor"/>' +
                '<g stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
                    '<line x1="12" y1="2.4" x2="12" y2="5"/>' +
                    '<line x1="12" y1="19" x2="12" y2="21.6"/>' +
                    '<line x1="2.4" y1="12" x2="5" y2="12"/>' +
                    '<line x1="19" y1="12" x2="21.6" y2="12"/>' +
                    '<line x1="4.9" y1="4.9" x2="6.8" y2="6.8"/>' +
                    '<line x1="17.2" y1="17.2" x2="19.1" y2="19.1"/>' +
                    '<line x1="4.9" y1="19.1" x2="6.8" y2="17.2"/>' +
                    '<line x1="17.2" y1="6.8" x2="19.1" y2="4.9"/>' +
                '</g>' +
            '</svg>';

        const moonEl = document.createElement('span');
        moonEl.className = 'theme-toggle-icon theme-toggle-icon-moon';
        moonEl.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" fill="currentColor"/>' +
            '</svg>';

        btn.appendChild(sunEl);
        btn.appendChild(moonEl);

        btn.addEventListener('click', function() {
            toggleTheme();
        });

        wrap.appendChild(btn);
        container.appendChild(wrap);
    }

    function renderScreenSettings() {
        const container = document.getElementById('screenSettingsContainer');
        if (!container) return;
        container.innerHTML = '';

        const title = document.createElement('div');
        title.className = 'settings-section-title';
        title.style.marginTop = '36px';
        title.textContent = 'Другие настройки экрана';
        container.appendChild(title);

        const s = loadScreenSettings();

        container.appendChild(makeToggleRow(
            'Строка поиска на главном',
            'Поиск в интернете прямо с рабочего стола',
            !!s.desktopSearch,
            function(v) {
                s.desktopSearch = v;
                saveScreenSettings(s);
            }
        ));

        container.appendChild(makeSelectRow(
            'Поисковик',
            'Куда отправлять запрос',
            [
                { value: 'google', label: 'Google' },
                { value: 'yandex', label: 'Яндекс' },
                { value: 'duckduckgo', label: 'DuckDuckGo' },
                { value: 'bing', label: 'Bing' }
            ],
            s.searchEngine || 'google',
            function(v) {
                s.searchEngine = v;
                saveScreenSettings(s);
            }
        ));

        container.appendChild(makeGridRow(
            'Ряды и столбцы на главном',
            'desktopCols',
            'desktopRows',
            s,
            2, 6,
            1, 5,
            function() { saveScreenSettings(s); }
        ));

        container.appendChild(makeGridRow(
            'Ряды и столбцы в меню',
            'appsCols',
            'appsRows',
            s,
            2, 6,
            1, 6,
            function() { saveScreenSettings(s); }
        ));
    }

    function renderSearchIntelligence() {
        const container = document.getElementById('searchIntelContent');
        if (!container) return;
        container.innerHTML = '';

        const intro = document.createElement('div');
        intro.style.cssText = 'font-size:15px;color:var(--text-muted);line-height:1.5;margin-bottom:18px;';
        intro.textContent = 'Расширенный поиск в меню приложений: помимо программ можно искать фото, файлы, уведомления и действия в Live Bar.';
        container.appendChild(intro);

        const si = loadSearchIntelligence();

        container.appendChild(makeToggleRow(
            'Поиск по фото',
            'Искать изображения в галерее файлов',
            !!si.photos,
            function(v) {
                si.photos = v;
                saveSearchIntelligence(si);
            }
        ));

        container.appendChild(makeToggleRow(
            'Поиск по файлам',
            'Искать документы и прочие файлы',
            !!si.files,
            function(v) {
                si.files = v;
                saveSearchIntelligence(si);
            }
        ));

        container.appendChild(makeToggleRow(
            'Поиск по уведомлениям',
            'Искать по заголовку и тексту уведомлений',
            !!si.notifications,
            function(v) {
                si.notifications = v;
                saveSearchIntelligence(si);
            }
        ));

        container.appendChild(makeToggleRow(
            'Поиск по действиям Live Bar',
            'Искать по активным действиям в Live Bar',
            !!si.livebarActions,
            function(v) {
                si.livebarActions = v;
                saveSearchIntelligence(si);
            }
        ));
    }

    function makeToggleRow(label, sub, active, onChange) {
        const row = document.createElement('div');
        row.className = 'toggle-row' + (active ? ' active' : '');
        row.innerHTML = `
            <div class="tr-left">
                <div>
                    <div class="tr-text">${label}</div>
                    <div class="tr-sub">${sub}</div>
                </div>
            </div>
            <div class="tr-switch"></div>
        `;
        row.addEventListener('click', function() {
            const newVal = !row.classList.contains('active');
            row.classList.toggle('active', newVal);
            onChange(newVal);
        });
        return row;
    }

    function makeSelectRow(label, sub, options, value, onChange) {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 18px 22px;
            background: var(--bg-secondary);
            border: 2px solid var(--border-color);
            margin-bottom: 18px;
            gap: 16px;
            flex-wrap: wrap;
        `;

        const left = document.createElement('div');
        left.innerHTML = `
            <div style="font-size:21px;font-weight:700;color:var(--text-primary);">${label}</div>
            <div style="font-size:15px;color:var(--text-muted);margin-top:2px;">${sub}</div>
        `;
        row.appendChild(left);

        const sel = document.createElement('select');
        sel.style.cssText = `
            padding: 10px 14px;
            border: 2px solid var(--border-color);
            background: var(--bg-primary);
            color: var(--text-primary);
            font-family: ${FONT_MAIN};
            font-size: 18px;
            outline: none;
            cursor: pointer;
            min-width: 160px;
            transition: border-color 0.2s;
        `;
        sel.addEventListener('focus', function() { sel.style.borderColor = 'var(--accent)'; });
        sel.addEventListener('blur', function() { sel.style.borderColor = 'var(--border-color)'; });
        options.forEach(function(o) {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            sel.appendChild(opt);
        });
        sel.value = value;
        sel.addEventListener('change', function() { onChange(this.value); });
        row.appendChild(sel);

        return row;
    }

    function makeGridRow(label, keyCols, keyRows, s, minCols, maxCols, minRows, maxRows, onChange) {
        const row = document.createElement('div');
        row.style.cssText = `
            padding: 18px 22px;
            background: var(--bg-secondary);
            border: 2px solid var(--border-color);
            margin-bottom: 18px;
        `;

        const title = document.createElement('div');
        title.style.cssText = 'font-size:21px;font-weight:700;color:var(--text-primary);margin-bottom:14px;';
        title.textContent = label;
        row.appendChild(title);

        const inner = document.createElement('div');
        inner.style.cssText = 'display:flex;gap:28px;flex-wrap:wrap;';

        function makeField(subLabel, key, min, max) {
            const field = document.createElement('div');
            field.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
            const lbl = document.createElement('span');
            lbl.style.cssText = 'font-size:13px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.6px;font-weight:600;';
            lbl.textContent = subLabel;
            field.appendChild(lbl);

            const inp = document.createElement('input');
            inp.type = 'number';
            inp.min = String(min);
            inp.max = String(max);
            inp.value = s[key];
            inp.style.cssText = `
                width: 84px;
                padding: 10px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary);
                color: var(--text-primary);
                font-family: ${FONT_MAIN};
                font-size: 20px;
                text-align: center;
                outline: none;
                box-sizing: border-box;
                transition: border-color 0.2s;
            `;
            inp.addEventListener('focus', function() { inp.style.borderColor = 'var(--accent)'; });
            inp.addEventListener('blur', function() { inp.style.borderColor = 'var(--border-color)'; });
            inp.addEventListener('input', function() {
                let v = parseInt(this.value, 10);
                if (isNaN(v)) return;
                v = Math.max(min, Math.min(max, v));
                s[key] = v;
                onChange();
            });
            field.appendChild(inp);
            return field;
        }

        inner.appendChild(makeField('Столбцы', keyCols, minCols, maxCols));
        inner.appendChild(makeField('Ряды', keyRows, minRows, maxRows));

        row.appendChild(inner);
        return row;
    }

    async function renderSystemInfo() {
        const container = document.getElementById('systemInfo');
        if (!container) return;

        let filesCount = 0;
        try {
            if (window.SharedFiles && window.SharedFiles.getAsync) {
                const arr = await window.SharedFiles.getAsync();
                filesCount = Array.isArray(arr) ? arr.length : 0;
            } else if (window.SharedFiles) {
                const arr = window.SharedFiles.get();
                filesCount = Array.isArray(arr) ? arr.length : 0;
            }
        } catch(e) {}

        let installedCount = 0;
        try {
            const installed = localStorage.getItem('shnuk_installed_apps');
            if (installed) {
                const parsed = JSON.parse(installed);
                installedCount = Array.isArray(parsed) ? parsed.length : 0;
            }
        } catch(e) {}

        let desktopCount = 0;
        try {
            const desktop = localStorage.getItem('shnuk_desktop_apps');
            if (desktop) {
                const parsed = JSON.parse(desktop);
                desktopCount = Array.isArray(parsed) ? parsed.length : 0;
            }
        } catch(e) {}

        let storageSize = 0;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) {
                    storageSize += (localStorage.getItem(key) || '').length + key.length;
                }
            }
        } catch(e) {}

        if (window.OSStorage && window.OSStorage.estimate) {
            try {
                const est = await window.OSStorage.estimate();
                if (est && est.usage) storageSize += est.usage;
            } catch(e) {}
        }

        const sizeFormatted = formatBytes(storageSize);

        container.innerHTML = `
            <div class="system-image-wrap">
                <img src="system.png" alt="System" class="system-image" onerror="this.parentNode.style.display='none'" />
            </div>
            <div class="info-row">
                <span class="info-label">Файлов в менеджере</span>
                <span class="info-value">${filesCount}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Установлено приложений</span>
                <span class="info-value">${installedCount}</span>
            </div>
            <div class="info-row">
                <span class="info-label">На рабочем столе</span>
                <span class="info-value">${desktopCount}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Размер данных</span>
                <span class="info-value">${sizeFormatted}</span>
            </div>
        `;
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async function renderSecurity() {
        const container = document.getElementById('securityContent');
        if (!container) return;

        if (securityPage === 'password') {
            renderSecurityPassword(container);
            return;
        }
        if (securityPage === 'pattern') {
            renderSecurityPattern(container);
            return;
        }
        if (securityPage === 'extra') {
            await renderSecurityExtra(container);
            return;
        }
        await renderSecurityMenu(container);
    }

    async function renderSecurityMenu(container) {
        let hasSec = false;
        try {
            hasSec = window.Security && await window.Security.hasSecurityAsync();
        } catch(e) { hasSec = false; }

        let secType = 'Не установлен';
        if (hasSec) {
            try {
                const sec = await window.Security.load();
                if (sec && sec.type === 'password') secType = 'Пароль';
                else if (sec && sec.type === 'pattern') secType = 'Графический ключ';
            } catch(e) {}
        }

        let html = `
            <div class="security-status">
                <div class="security-status-row">
                    <span class="security-label">Текущий способ защиты</span>
                    <span class="security-value">${secType}</span>
                </div>
            </div>

            <div class="security-section">
                <div class="security-section-title">Выберите способ защиты</div>
                <div class="security-choice-row">
                    <button class="security-choice-btn" id="choosePasswordBtn">
                        <span class="scb-title">Пароль</span>
                        <span class="scb-desc">Защита цифровым или буквенным паролем</span>
                    </button>
                    <button class="security-choice-btn" id="choosePatternBtn">
                        <span class="scb-title">Графический ключ</span>
                        <span class="scb-desc">Соединение точек на сетке 3x3</span>
                    </button>
                </div>
            </div>
        `;

        if (hasSec) {
            html += `
                <div class="security-section">
                    <div class="security-section-title">Дополнительная безопасность</div>
                    <div class="security-choice-row">
                        <button class="security-choice-btn" id="openExtraSecurityBtn">
                            <span class="scb-title">Открыть</span>
                            <span class="scb-desc">Специальный код для стирания, лимит попыток и блокировка</span>
                        </button>
                    </div>
                </div>
                <div class="security-actions">
                    <button class="security-btn danger" id="removeSecurityBtn">Удалить защиту</button>
                </div>
            `;
        } else {
            html += `
                <div class="security-section">
                    <div class="security-section-title">Дополнительная безопасность</div>
                    <div class="security-desc" style="font-size:14px;color:var(--text-muted);line-height:1.4;">
                        Доступно после установки пароля или графического ключа.
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;

        const choosePasswordBtn = document.getElementById('choosePasswordBtn');
        if (choosePasswordBtn) {
            choosePasswordBtn.addEventListener('click', function() {
                if (hasSec) {
                    getWin().confirm('Текущая защита будет заменена. Продолжить?', {
                        title: 'Замена защиты',
                        okText: 'Продолжить',
                        cancelText: 'Отмена'
                    }).then(function(ok) {
                        if (ok) {
                            securityPage = 'password';
                            renderSecurity();
                        }
                    });
                } else {
                    securityPage = 'password';
                    renderSecurity();
                }
            });
        }

        const choosePatternBtn = document.getElementById('choosePatternBtn');
        if (choosePatternBtn) {
            choosePatternBtn.addEventListener('click', function() {
                if (hasSec) {
                    getWin().confirm('Текущая защита будет заменена. Продолжить?', {
                        title: 'Замена защиты',
                        okText: 'Продолжить',
                        cancelText: 'Отмена'
                    }).then(function(ok) {
                        if (ok) {
                            securityPage = 'pattern';
                            renderSecurity();
                        }
                    });
                } else {
                    securityPage = 'pattern';
                    renderSecurity();
                }
            });
        }

        const openExtraBtn = document.getElementById('openExtraSecurityBtn');
        if (openExtraBtn) {
            openExtraBtn.addEventListener('click', function() {
                securityPage = 'extra';
                renderSecurity();
            });
        }

        const removeBtn = document.getElementById('removeSecurityBtn');
        if (removeBtn) {
            removeBtn.addEventListener('click', async function() {
                const Win = getWin();
                const ok = await Win.confirm('Удалить защиту?', {
                    title: 'Удаление защиты',
                    okText: 'Удалить',
                    cancelText: 'Отмена',
                    danger: true
                });
                if (ok) {
                    await window.Security.removeSecurity();
                    renderSecurity();
                }
            });
        }
    }

    // ============================================
    // ДОПОЛНИТЕЛЬНАЯ БЕЗОПАСНОСТЬ
    // ============================================

    async function renderSecurityExtra(container) {
        const cfg = await window.Security.getExtra();

        let method = 'password';
        try {
            const sec = await window.Security.load();
            method = (sec && sec.type === 'pattern') ? 'pattern' : 'password';
        } catch(e) {}

        const wipeCodeSet = !!(cfg.wipeCode && cfg.wipeCode.hash);

        container.innerHTML = `
            <div class="security-subheader">
                <button class="security-back-btn" id="securityBackBtn">‹ Назад</button>
                <div class="security-subheader-title">Дополнительная безопасность</div>
            </div>

            <div class="security-section">
                <div class="security-section-title">Специальный код для стирания</div>
                <div class="security-desc" style="font-size:14px;color:var(--text-muted);line-height:1.5;margin-bottom:12px;">
                    Если ввести этот код при разблокировке, все данные будут полностью удалены — включая IndexedDB.
                </div>
                <div id="wipeCodeArea"></div>
                <div class="toggle-row ${cfg.wipeByCode ? 'active' : ''}" id="wipeByCodeToggle" style="margin-top:14px;">
                    <div class="tr-left"><div>
                        <div class="tr-text">Стирать при вводе кода</div>
                        <div class="tr-sub">Активировать специальный код</div>
                    </div></div>
                    <div class="tr-switch"></div>
                </div>
            </div>

            <div class="security-section">
                <div class="security-section-title">Стирание после неверных попыток</div>
                <div class="security-desc" style="font-size:14px;color:var(--text-muted);line-height:1.5;margin-bottom:12px;">
                    Если превысить указанное количество неверных вводов подряд, все данные будут стёрты.
                </div>
                <div class="toggle-row ${cfg.wipeOnAttempts ? 'active' : ''}" id="wipeOnAttemptsToggle">
                    <div class="tr-left"><div>
                        <div class="tr-text">Стирать после N неверных попыток</div>
                        <div class="tr-sub">Радикальная защита данных</div>
                    </div></div>
                    <div class="tr-switch"></div>
                </div>
                <div style="display:flex;gap:10px;align-items:center;margin-top:12px;">
                    <label style="font-size:14px;color:var(--text-muted);">Попыток до стирания:</label>
                    <input type="number" id="wipeAfterAttempts" min="3" max="50" value="${cfg.wipeAfterAttempts}" class="security-input" style="width:100px;" />
                </div>
            </div>

            <div class="security-section">
                <div class="security-section-title">Ограничение ввода</div>
                <div class="security-desc" style="font-size:14px;color:var(--text-muted);line-height:1.5;margin-bottom:12px;">
                    После указанного количества неверных вводов подряд блокировка на указанное время. Счётчик сбрасывается после успешного ввода.
                </div>
                <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;">
                    <label style="font-size:14px;color:var(--text-muted);display:flex;align-items:center;gap:8px;">
                        Попыток до блокировки:
                        <input type="number" id="lockAttempts" min="1" max="30" value="${cfg.lockAttempts}" class="security-input" style="width:80px;" />
                    </label>
                    <label style="font-size:14px;color:var(--text-muted);display:flex;align-items:center;gap:8px;">
                        Длительность блокировки, сек:
                        <input type="number" id="lockSeconds" min="5" max="600" value="${cfg.lockSeconds}" class="security-input" style="width:90px;" />
                    </label>
                </div>
            </div>
        `;

        document.getElementById('securityBackBtn').addEventListener('click', function() {
            securityPage = 'menu';
            renderSecurity();
        });

        // ---------- Блок специального кода для стирания ----------
        const wipeCodeArea = document.getElementById('wipeCodeArea');
        renderWipeCodeControls(wipeCodeArea, method, cfg, wipeCodeSet);

        // ---------- Переключатели и числа ----------
        const wipeByCodeToggle = document.getElementById('wipeByCodeToggle');
        wipeByCodeToggle.addEventListener('click', async function() {
            const cfg2 = await window.Security.getExtra();
            cfg2.wipeByCode = !cfg2.wipeByCode;
            await window.Security.setExtra(cfg2);
            renderSecurity();
        });

        const wipeOnAttemptsToggle = document.getElementById('wipeOnAttemptsToggle');
        wipeOnAttemptsToggle.addEventListener('click', async function() {
            const cfg2 = await window.Security.getExtra();
            cfg2.wipeOnAttempts = !cfg2.wipeOnAttempts;
            await window.Security.setExtra(cfg2);
            renderSecurity();
        });

        document.getElementById('wipeAfterAttempts').addEventListener('change', async function() {
            const v = Math.max(3, Math.min(50, parseInt(this.value, 10) || 10));
            const cfg2 = await window.Security.getExtra();
            cfg2.wipeAfterAttempts = v;
            await window.Security.setExtra(cfg2);
            this.value = v;
        });

        document.getElementById('lockAttempts').addEventListener('change', async function() {
            const v = Math.max(1, Math.min(30, parseInt(this.value, 10) || 5));
            const cfg2 = await window.Security.getExtra();
            cfg2.lockAttempts = v;
            await window.Security.setExtra(cfg2);
            this.value = v;
        });

        document.getElementById('lockSeconds').addEventListener('change', async function() {
            const v = Math.max(5, Math.min(600, parseInt(this.value, 10) || 30));
            const cfg2 = await window.Security.getExtra();
            cfg2.lockSeconds = v;
            await window.Security.setExtra(cfg2);
            this.value = v;
        });
    }

    // Рисует блок специального кода: для пароля — текстовое поле, для ключа — интерактивная сетка 3×3.
    function renderWipeCodeControls(area, method, cfg, wipeCodeSet) {
        area.innerHTML = '';

        if (method === 'password') {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;';

            const input = document.createElement('input');
            input.type = 'password';
            input.id = 'wipeCodeInput';
            input.placeholder = 'Новый специальный код';
            input.className = 'security-input';
            input.style.cssText = 'flex:1;min-width:180px;';
            row.appendChild(input);

            const setBtn = document.createElement('button');
            setBtn.className = 'security-btn';
            setBtn.textContent = 'Задать';
            setBtn.addEventListener('click', async function() {
                const val = (input.value || '').trim();
                if (!val) {
                    getWin().alert('Введите код', { title: 'Ошибка' });
                    return;
                }
                await window.Security.setWipeCode('password', val);
                renderSecurity();
            });
            row.appendChild(setBtn);

            if (wipeCodeSet) {
                const clearBtn = document.createElement('button');
                clearBtn.className = 'security-btn danger';
                clearBtn.textContent = 'Очистить';
                clearBtn.addEventListener('click', async function() {
                    await window.Security.clearWipeCode();
                    renderSecurity();
                });
                row.appendChild(clearBtn);
            }

            area.appendChild(row);

            const status = document.createElement('div');
            status.style.cssText = 'margin-top:10px;font-size:14px;color:var(--text-muted);';
            status.innerHTML = 'Текущее состояние: <b>' + (wipeCodeSet ? 'Задан' : 'Не задан') + '</b>';
            area.appendChild(status);
            return;
        }

        // method === 'pattern'
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;';

        const setBtn = document.createElement('button');
        setBtn.className = 'security-btn';
        setBtn.textContent = wipeCodeSet ? 'Задать новый специальный ключ' : 'Задать специальный ключ';
        setBtn.addEventListener('click', function() {
            openWipePatternPad(area, async function(pattern) {
                if (!pattern || pattern.length < 4) {
                    getWin().alert('Минимум 4 точки', { title: 'Ошибка' });
                    return;
                }
                await window.Security.setWipeCode('pattern', pattern);
                renderSecurity();
            });
        });
        row.appendChild(setBtn);

        if (wipeCodeSet) {
            const clearBtn = document.createElement('button');
            clearBtn.className = 'security-btn danger';
            clearBtn.textContent = 'Очистить';
            clearBtn.addEventListener('click', async function() {
                await window.Security.clearWipeCode();
                renderSecurity();
            });
            row.appendChild(clearBtn);
        }

        area.appendChild(row);

        const status = document.createElement('div');
        status.style.cssText = 'margin-top:10px;font-size:14px;color:var(--text-muted);';
        status.innerHTML = 'Текущее состояние: <b>' + (wipeCodeSet ? 'Задан' : 'Не задан') + '</b>';
        area.appendChild(status);
    }

    // Открывает интерактивную сетку 3×3 для рисования специального ключа.
    // По завершении рисования вызывает onSave(массив точек) или onCancel().
    function openWipePatternPad(area, onSave) {
        // Скрываем кнопки под сеткой, чтобы не мешали
        const existingChildren = Array.from(area.children);

        const padWrap = document.createElement('div');
        padWrap.style.cssText = 'margin-top:12px;display:flex;flex-direction:column;align-items:center;gap:10px;';

        const hint = document.createElement('div');
        hint.textContent = 'Нарисуйте специальный ключ';
        hint.style.cssText = 'font-size:13px;color:var(--text-muted);letter-spacing:0.4px;';
        padWrap.appendChild(hint);

        const canvas = document.createElement('canvas');
        const size = 240;
        canvas.width = size;
        canvas.height = size;
        canvas.style.cssText = `
            background: var(--bg-primary);
            border: 2px solid var(--border-color);
            touch-action: none;
            cursor: crosshair;
            display: block;
        `;
        padWrap.appendChild(canvas);

        const sub = document.createElement('div');
        sub.style.cssText = 'font-size:13px;color:var(--text-muted);min-height:18px;';
        padWrap.appendChild(sub);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center;';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'security-btn danger';
        cancelBtn.textContent = 'Отмена';
        cancelBtn.addEventListener('click', function() {
            cleanup();
        });
        btnRow.appendChild(cancelBtn);

        padWrap.appendChild(btnRow);

        area.appendChild(padWrap);

        const ctx = canvas.getContext('2d');
        const dots = [];
        const dotRadius = 10;
        const gridSize = 3;
        const cellSize = size / gridSize;

        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                dots.push({
                    x: cellSize * (j + 0.5),
                    y: cellSize * (i + 0.5),
                    id: i * gridSize + j,
                    used: false
                });
            }
        }

        let selected = [];
        let isDrawing = false;
        let currentMouse = null;

        function draw() {
            ctx.clearRect(0, 0, size, size);
            ctx.fillStyle = 'rgba(0,0,0,0)';
            ctx.fillRect(0, 0, size, size);

            for (const dot of dots) {
                if (dot.used) {
                    ctx.fillStyle = 'var(--accent)';
                    ctx.beginPath();
                    ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = 'var(--bg-primary)';
                    ctx.beginPath();
                    ctx.arc(dot.x, dot.y, dotRadius * 0.4, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.strokeStyle = 'var(--text-muted)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }

            if (selected.length > 1) {
                ctx.strokeStyle = 'var(--accent)';
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                for (let i = 0; i < selected.length; i++) {
                    const d = dots.find(function(x) { return x.id === selected[i]; });
                    if (d) {
                        if (i === 0) ctx.moveTo(d.x, d.y);
                        else ctx.lineTo(d.x, d.y);
                    }
                }
                ctx.stroke();
            }

            if (isDrawing && currentMouse && selected.length > 0) {
                ctx.strokeStyle = 'var(--accent)';
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.beginPath();
                const last = dots.find(function(x) { return x.id === selected[selected.length - 1]; });
                if (last) {
                    ctx.moveTo(last.x, last.y);
                    ctx.lineTo(currentMouse.x, currentMouse.y);
                }
                ctx.stroke();
            }
        }

        function getPos(e) {
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches ? e.touches[0] : e;
            return {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            };
        }

        function findDot(pos) {
            for (const d of dots) {
                const dx = d.x - pos.x;
                const dy = d.y - pos.y;
                if (Math.sqrt(dx * dx + dy * dy) < dotRadius * 2.5) return d;
            }
            return null;
        }

        function start(e) {
            e.preventDefault();
            isDrawing = true;
            currentMouse = getPos(e);
            const d = findDot(currentMouse);
            if (d && !d.used) {
                d.used = true;
                selected.push(d.id);
                sub.textContent = selected.length + ' точек';
                draw();
            }
        }

        function move(e) {
            if (!isDrawing) return;
            e.preventDefault();
            currentMouse = getPos(e);
            const d = findDot(currentMouse);
            if (d && !d.used) {
                d.used = true;
                selected.push(d.id);
                sub.textContent = selected.length + ' точек';
            }
            draw();
        }

        function end(e) {
            if (!isDrawing) return;
            isDrawing = false;
            currentMouse = null;
            draw();

            if (selected.length >= 4) {
                const pattern = selected.slice();
                cleanup();
                onSave(pattern);
            } else {
                sub.textContent = 'Нужно минимум 4 точки';
                sub.style.color = 'var(--accent)';
                setTimeout(function() {
                    selected = [];
                    for (const d of dots) d.used = false;
                    sub.textContent = '';
                    sub.style.color = 'var(--text-muted)';
                    draw();
                }, 500);
            }
        }

        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        canvas.addEventListener('mouseup', end);
        canvas.addEventListener('mouseleave', end);
        canvas.addEventListener('touchstart', start, { passive: false });
        canvas.addEventListener('touchmove', move, { passive: false });
        canvas.addEventListener('touchend', end);

        function cleanup() {
            padWrap.remove();
            existingChildren.forEach(function(el) {
                if (!area.contains(el)) area.appendChild(el);
            });
        }

        draw();
    }

    function renderSecurityPassword(container) {
        container.innerHTML = `
            <div class="security-subheader">
                <button class="security-back-btn" id="securityBackBtn">‹ Назад</button>
                <div class="security-subheader-title">Пароль</div>
            </div>
            <div class="security-section">
                <div class="security-section-title">Придумайте пароль</div>
                <div class="security-input-row">
                    <input type="password" id="newPasswordInput" placeholder="Пароль" class="security-input" />
                </div>
                <div class="security-input-row">
                    <input type="password" id="confirmPasswordInput" placeholder="Повторите пароль" class="security-input" />
                </div>
                <button class="security-btn" id="setPasswordBtn">Установить пароль</button>
            </div>
        `;

        document.getElementById('securityBackBtn').addEventListener('click', function() {
            securityPage = 'menu';
            renderSecurity();
        });

        document.getElementById('setPasswordBtn').addEventListener('click', async function() {
            const pwd = document.getElementById('newPasswordInput').value;
            const confirm = document.getElementById('confirmPasswordInput').value;

            if (!pwd || pwd.length < 4) {
                getWin().alert('Пароль должен быть минимум 4 символа', { title: 'Ошибка' });
                return;
            }
            if (pwd !== confirm) {
                getWin().alert('Пароли не совпадают', { title: 'Ошибка' });
                return;
            }

            const ok = await window.Security.setPassword(pwd);
            if (ok) {
                getWin().alert('Пароль установлен', { title: 'Готово' });
                securityPage = 'menu';
                renderSecurity();
            } else {
                getWin().alert('Не удалось сохранить пароль', { title: 'Ошибка' });
            }
        });
    }

    function renderSecurityPattern(container) {
        container.innerHTML = `
            <div class="security-subheader">
                <button class="security-back-btn" id="securityBackBtn">‹ Назад</button>
                <div class="security-subheader-title">Графический ключ</div>
            </div>
            <div class="security-section">
                <div class="security-section-title">Нарисуйте ключ</div>
                <div class="pattern-preview-container">
                    <canvas id="patternCanvas" width="240" height="240"></canvas>
                </div>
                <div class="pattern-hint" id="patternHint"></div>
                <button class="security-btn" id="setPatternBtn">Установить ключ</button>
            </div>
        `;

        document.getElementById('securityBackBtn').addEventListener('click', function() {
            securityPage = 'menu';
            renderSecurity();
        });

        initPatternCanvas();
    }

    function initPatternCanvas() {
        const canvas = document.getElementById('patternCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const canvasSize = 240;
        const dots = [];
        const dotRadius = 10;
        const gridSize = 3;
        const cellSize = canvasSize / gridSize;

        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                dots.push({
                    x: cellSize * (j + 0.5),
                    y: cellSize * (i + 0.5),
                    id: i * gridSize + j,
                    used: false
                });
            }
        }

        let selectedPattern = [];
        let isDrawing = false;
        let currentMouse = null;

        function drawGrid() {
            ctx.fillStyle = '#f5f5f5';
            ctx.fillRect(0, 0, canvasSize, canvasSize);

            for (const dot of dots) {
                if (dot.used) {
                    ctx.fillStyle = '#cc0000';
                    ctx.beginPath();
                    ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.strokeStyle = '#999999';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }

            if (selectedPattern.length > 1) {
                ctx.strokeStyle = '#cc0000';
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();

                for (let i = 0; i < selectedPattern.length; i++) {
                    const dot = dots.find(d => d.id === selectedPattern[i]);
                    if (dot) {
                        if (i === 0) ctx.moveTo(dot.x, dot.y);
                        else ctx.lineTo(dot.x, dot.y);
                    }
                }
                ctx.stroke();
            }

            if (isDrawing && currentMouse && selectedPattern.length > 0) {
                ctx.strokeStyle = '#cc0000';
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.beginPath();
                const lastDot = dots.find(d => d.id === selectedPattern[selectedPattern.length - 1]);
                if (lastDot) {
                    ctx.moveTo(lastDot.x, lastDot.y);
                    ctx.lineTo(currentMouse.x, currentMouse.y);
                }
                ctx.stroke();
            }
        }

        function getMousePos(e) {
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches ? e.touches[0] : e;
            return {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            };
        }

        function findDot(pos) {
            for (const dot of dots) {
                const dx = dot.x - pos.x;
                const dy = dot.y - pos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < dotRadius * 2.5) return dot;
            }
            return null;
        }

        function startDrawing(e) {
            e.preventDefault();
            isDrawing = true;
            currentMouse = getMousePos(e);
            const dot = findDot(currentMouse);
            if (dot && !dot.used) {
                dot.used = true;
                selectedPattern.push(dot.id);
                updateHint();
                drawGrid();
            }
        }

        function continueDrawing(e) {
            if (!isDrawing) return;
            e.preventDefault();
            currentMouse = getMousePos(e);
            const dot = findDot(currentMouse);
            if (dot && !dot.used) {
                dot.used = true;
                selectedPattern.push(dot.id);
                updateHint();
            }
            drawGrid();
        }

        function endDrawing(e) {
            if (!isDrawing) return;
            isDrawing = false;
            currentMouse = null;
            drawGrid();
        }

        function updateHint() {
            const hint = document.getElementById('patternHint');
            if (hint) hint.textContent = 'Точек: ' + selectedPattern.length;
        }

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', continueDrawing);
        canvas.addEventListener('mouseup', endDrawing);
        canvas.addEventListener('mouseleave', endDrawing);
        canvas.addEventListener('touchstart', startDrawing, { passive: false });
        canvas.addEventListener('touchmove', continueDrawing, { passive: false });
        canvas.addEventListener('touchend', endDrawing);

        drawGrid();

        const setPatternBtn = document.getElementById('setPatternBtn');
        if (setPatternBtn) {
            setPatternBtn.addEventListener('click', async function() {
                if (selectedPattern.length < 4) {
                    getWin().alert('Минимум 4 точки', { title: 'Ошибка' });
                    return;
                }

                const ok = await window.Security.setPattern(selectedPattern);
                if (ok) {
                    getWin().alert('Графический ключ установлен', { title: 'Готово' });
                    selectedPattern = [];
                    for (const dot of dots) dot.used = false;
                    drawGrid();
                    updateHint();
                    securityPage = 'menu';
                    renderSecurity();
                } else {
                    getWin().alert('Не удалось сохранить ключ', { title: 'Ошибка' });
                }
            });
        }
    }

    async function clearAllData() {
        const Win = getWin();

        const confirmed = await Win.confirm(
            'Будут удалены все данные. Система будет переустановлена с нуля.',
            {
                title: 'Полный сброс',
                okText: 'Продолжить',
                cancelText: 'Отмена',
                danger: true
            }
        );

        if (!confirmed) return;

        const confirmed2 = await Win.confirm(
            'Это действие нельзя отменить. Вы уверены?',
            {
                title: 'Последнее предупреждение',
                okText: 'Да, сбросить всё',
                cancelText: 'Нет, отмена',
                danger: true
            }
        );

        if (!confirmed2) return;

        try {
            if (window.Security && typeof window.Security.wipeAllData === 'function') {
                await window.Security.wipeAllData();
                return;
            }
            localStorage.clear();
            sessionStorage.clear();
            if (window.OSStorage) {
                try { await window.OSStorage.files.clear(); } catch(e) {}
                try { await window.OSStorage.system.clear(); } catch(e) {}
            }
        } catch(e) {}

        closeSettings();
        setTimeout(() => location.reload(), 300);
    }

    function createUI() {
        if (isOpen) {
            const existing = document.getElementById('settingsApp');
            if (existing) {
                existing.style.display = 'block';
                existing.style.opacity = '1';
                return;
            }
        }

        loadData();

        const container = document.createElement('div');
        container.id = 'settingsApp';
        container.className = 'scroll-blur';
        container.style.cssText = `
            position: fixed;
            top: var(--livebar-h, 44px);
            left: 0;
            width: 100%;
            height: calc(100% - var(--livebar-h, 44px));
            background: var(--bg-primary);
            z-index: 99999;
            overflow-y: auto;
            font-family: ${FONT_MAIN};
            font-size: 20px;
            padding: 40px 24px 80px;
            animation: settingsFadeIn 0.25s ease;
            box-sizing: border-box;
            color: var(--text-primary);
            transition: background 0.4s ease, color 0.4s ease;
        `;

        if (!document.getElementById('settingsStyles')) {
            const style = document.createElement('style');
            style.id = 'settingsStyles';
            style.textContent = `
                @keyframes settingsFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes menuFadeIn {
                    from { opacity: 0; filter: blur(20px); transform: translateY(-10px) scale(0.95); }
                    to { opacity: 1; filter: blur(0); transform: translateY(0) scale(1); }
                }
                @keyframes menuFadeOut {
                    from { opacity: 1; filter: blur(0); transform: translateY(0) scale(1); }
                    to { opacity: 0; filter: blur(20px); transform: translateY(-10px) scale(0.95); }
                }

                #settingsApp,
                #settingsApp *,
                .settings-dropdown,
                .settings-dropdown * {
                    font-family: ${FONT_MAIN} !important;
                }

                .scroll-blur {
                    position: relative;
                    isolation: isolate;
                }
                .scroll-blur::after {
                    content: '';
                    position: fixed;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    height: 80px;
                    pointer-events: none;
                    z-index: 20;
                    -webkit-backdrop-filter: blur(12px);
                    backdrop-filter: blur(12px);
                    -webkit-mask-image: linear-gradient(to top, #000 0%, #000 40%, transparent 100%);
                    mask-image: linear-gradient(to top, #000 0%, #000 40%, transparent 100%);
                }

                .settings-header {
                    display: flex; justify-content: space-between; align-items: center;
                    max-width: 720px; margin: 0 auto 28px;
                    padding-bottom: 18px; border-bottom: 2px solid var(--border-color);
                }
                .settings-header h1 {
                    font-size: 30px; font-weight: 700; color: var(--text-primary);
                    letter-spacing: -0.3px;
                }
                .settings-header-actions {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }
                .settings-icon-btn {
                    background: none; border: none; cursor: pointer;
                    padding: 8px; color: var(--text-secondary); transition: color 0.2s;
                    display: flex; align-items: center; justify-content: center;
                    width: 46px; height: 46px;
                }
                .settings-icon-btn:hover { color: var(--accent); }
                .settings-icon-btn svg { display: block; width: 28px; height: 28px; }

                .settings-dropdown {
                    position: fixed;
                    top: calc(var(--livebar-h, 44px) + 20px);
                    right: 24px;
                    background: var(--bg-primary);
                    padding: 16px;
                    z-index: 100001;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                    min-width: 280px;
                    max-height: 70vh;
                    overflow-y: auto;
                    animation: menuFadeIn 0.4s cubic-bezier(0.22, 1, 0.36, 1);
                    border: 2px solid var(--border-color);
                }
                .settings-dropdown.closing {
                    animation: menuFadeOut 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                }
                .settings-dropdown button {
                    display: block;
                    width: 100%;
                    padding: 14px 18px;
                    margin-bottom: 6px;
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                    border: 2px solid var(--border-color);
                    cursor: pointer;
                    font-size: 20px;
                    transition: all 0.2s;
                    text-align: left;
                }
                .settings-dropdown button:last-child { margin-bottom: 0; }
                .settings-dropdown button:hover {
                    background: var(--bg-tertiary);
                    border-color: var(--accent);
                }
                .settings-dropdown button.active {
                    background: var(--accent);
                    color: var(--text-on-accent);
                    border-color: var(--accent);
                }

                .settings-stage {
                    position: relative;
                    width: 100%;
                    max-width: 720px;
                    margin: 0 auto;
                }

                .settings-section-view {
                    width: 100%;
                    display: none;
                    transition: filter 0.32s cubic-bezier(0.22, 1, 0.36, 1),
                                opacity 0.32s cubic-bezier(0.22, 1, 0.36, 1),
                                transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
                    will-change: filter, opacity, transform;
                }
                .settings-section-view.active {
                    display: block;
                }
                .settings-section-view.entering {
                    opacity: 0;
                    filter: blur(18px);
                    transform: scale(0.94);
                }
                .settings-section-view.entered {
                    opacity: 1;
                    filter: blur(0);
                    transform: scale(1);
                }
                .settings-section-view.leaving {
                    opacity: 0;
                    filter: blur(18px);
                    transform: scale(0.94);
                }

                .settings-section-title {
                    font-size: 19px; font-weight: 700; color: var(--text-muted);
                    text-transform: uppercase; letter-spacing: 0.8px;
                    margin-bottom: 16px;
                }

                /* ====== Переключатель темы ====== */
                .theme-toggle-wrap {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 24px 0 8px;
                }

                .theme-toggle-btn {
                    --size: 220px;
                    width: var(--size);
                    height: var(--size);
                    border: none;
                    cursor: pointer;
                    padding: 0;
                    position: relative;
                    border-radius: 50%;
                    background: #cc0000;
                    color: #ffffff;
                    -webkit-tap-highlight-color: transparent;
                    outline: none;
                    overflow: hidden;
                    transition: background 0.4s ease, color 0.4s ease, transform 0.2s ease;
                }
                .theme-toggle-btn:active {
                    transform: scale(0.97);
                }
                .theme-toggle-btn.dark-active {
                    background: #ffffff;
                    color: #000000;
                }

                .theme-toggle-icon {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 45%;
                    height: 45%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;
                    transition: opacity 0.35s ease;
                }
                .theme-toggle-icon svg {
                    width: 100%;
                    height: 100%;
                    display: block;
                }
                .theme-toggle-icon-sun {
                    transform: translate(-50%, -50%);
                    opacity: 1;
                }
                .theme-toggle-icon-moon {
                    transform: translate(-50%, -50%);
                    opacity: 0;
                }
                .theme-toggle-btn.dark-active .theme-toggle-icon-sun {
                    opacity: 0;
                }
                .theme-toggle-btn.dark-active .theme-toggle-icon-moon {
                    opacity: 1;
                }

                @media (max-width: 500px) {
                    .theme-toggle-btn { --size: 160px; }
                    .theme-toggle-wrap { padding: 12px 0 4px; }
                }

                .system-image-wrap {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 24px 0 32px;
                }
                .system-image {
                    max-width: 540px;
                    max-height: 540px;
                    width: auto;
                    height: auto;
                    object-fit: contain;
                    display: block;
                    image-rendering: auto;
                }

                .system-info {
                    background: var(--bg-secondary); padding: 18px 22px; margin-bottom: 26px;
                }
                .system-info .info-row {
                    display: flex; justify-content: space-between;
                    align-items: center; padding: 12px 0;
                    border-bottom: 1px solid var(--border-color); font-size: 20px;
                }
                .system-info .info-row:last-child { border-bottom: none; }
                .system-info .info-label { color: var(--text-secondary); font-size: 19px; }
                .system-info .info-value {
                    color: var(--text-primary); font-weight: 700; text-align: right;
                }

                .action-card {
                    background: var(--bg-secondary); padding: 22px;
                    margin-bottom: 18px; border: 2px solid var(--border-color);
                }
                .action-card .action-title {
                    font-size: 22px; font-weight: 700;
                    color: var(--text-primary); margin-bottom: 10px;
                }
                .action-card .action-desc {
                    font-size: 19px; color: var(--text-secondary);
                    margin-bottom: 18px; line-height: 1.5;
                }
                .action-card button {
                    padding: 12px 26px; border: 2px solid var(--accent);
                    background: var(--accent); color: var(--text-on-accent);
                    cursor: pointer;
                    font-size: 20px; font-weight: 700;
                    transition: all 0.2s;
                }
                .action-card button:hover {
                    background: var(--accent-dark); transform: scale(1.02);
                }
                .action-card button.danger {
                    background: var(--accent); border-color: var(--accent); color: var(--text-on-accent);
                }
                .action-card button.danger:hover {
                    background: var(--accent-dark); border-color: var(--accent-dark);
                }
                .action-card.danger-card {
                    border-color: var(--border-color); background: var(--bg-hover);
                }

                .toggle-row {
                    display: flex; align-items: center;
                    justify-content: space-between;
                    padding: 18px 22px; background: var(--bg-secondary);
                    border: 2px solid var(--border-color); margin-bottom: 18px;
                    cursor: pointer; transition: all 0.2s;
                }
                .toggle-row:hover {
                    border-color: var(--accent); background: var(--bg-hover);
                }
                .toggle-row .tr-left {
                    display: flex; align-items: center; gap: 12px;
                }
                .toggle-row .tr-text {
                    font-size: 21px; font-weight: 700; color: var(--text-primary);
                }
                .toggle-row .tr-sub {
                    font-size: 16px; color: var(--text-muted); margin-top: 2px;
                }
                .toggle-row .tr-switch {
                    width: 54px; height: 32px; background: var(--border-color);
                    position: relative;
                    transition: background 0.3s; flex-shrink: 0;
                }
                .toggle-row .tr-switch::after {
                    content: ''; position: absolute;
                    top: 2px; left: 2px;
                    width: 28px; height: 28px;
                    background: var(--bg-primary);
                    transition: transform 0.3s;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
                .toggle-row.active .tr-switch { background: var(--accent); }
                .toggle-row.active .tr-switch::after {
                    transform: translateX(22px);
                }

                .security-status {
                    background: var(--bg-secondary);
                    padding: 18px 22px;
                    margin-bottom: 26px;
                    border: 2px solid var(--border-color);
                }
                .security-status-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 20px;
                }
                .security-label { color: var(--text-secondary); }
                .security-value { color: var(--text-primary); font-weight: 700; }

                .security-actions { margin-bottom: 26px; }
                .security-btn {
                    padding: 12px 26px;
                    border: 2px solid var(--accent);
                    background: var(--accent);
                    color: var(--text-on-accent);
                    cursor: pointer;
                    font-size: 20px;
                    font-weight: 700;
                    transition: all 0.2s;
                }
                .security-btn:hover { background: var(--accent-dark); }
                .security-btn.danger {
                    background: var(--bg-primary);
                    color: var(--accent);
                }
                .security-btn.danger:hover {
                    background: var(--accent);
                    color: var(--text-on-accent);
                }

                .security-section {
                    background: var(--bg-secondary);
                    padding: 22px;
                    margin-bottom: 18px;
                    border: 2px solid var(--border-color);
                }
                .security-section-title {
                    font-size: 20px;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin-bottom: 14px;
                }
                .security-input-row { margin-bottom: 14px; }
                .security-input {
                    width: 100%;
                    padding: 14px 16px;
                    border: 2px solid var(--border-color);
                    font-size: 20px;
                    outline: none;
                    box-sizing: border-box;
                    background: var(--bg-primary);
                    color: var(--text-primary);
                }
                .security-input:focus { border-color: var(--accent); }

                .security-choice-row {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .security-choice-btn {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    width: 100%;
                    padding: 22px 24px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: inherit;
                }
                .security-choice-btn:hover {
                    border-color: var(--accent);
                    background: var(--bg-hover);
                }
                .security-choice-btn:active {
                    transform: scale(0.99);
                }
                .security-choice-btn .scb-title {
                    font-size: 22px;
                    font-weight: 700;
                    letter-spacing: 0.4px;
                    color: var(--text-primary);
                }
                .security-choice-btn .scb-desc {
                    font-size: 16px;
                    color: var(--text-muted);
                    line-height: 1.4;
                }

                .security-subheader {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 20px;
                    padding-bottom: 14px;
                    border-bottom: 2px solid var(--border-color);
                }
                .security-back-btn {
                    padding: 8px 16px;
                    background: var(--bg-primary);
                    border: 2px solid var(--border-color);
                    color: var(--text-primary);
                    cursor: pointer;
                    font-size: 18px;
                    font-family: inherit;
                    transition: all 0.2s;
                }
                .security-back-btn:hover {
                    border-color: var(--accent);
                    color: var(--accent);
                }
                .security-subheader-title {
                    font-size: 24px;
                    font-weight: 700;
                    color: var(--text-primary);
                    letter-spacing: 0.3px;
                }

                .pattern-preview-container {
                    display: flex;
                    justify-content: center;
                    margin-bottom: 12px;
                }
                #patternCanvas {
                    border: 2px solid var(--border-color);
                    touch-action: none;
                    cursor: crosshair;
                }
                .pattern-hint {
                    text-align: center;
                    font-size: 19px;
                    color: var(--text-secondary);
                    margin-bottom: 12px;
                    min-height: 26px;
                }

                @media (max-width: 900px) {
                    .system-image { max-width: 360px; max-height: 360px; }
                }
                @media (max-width: 500px) {
                    #settingsApp { padding: 24px 16px 60px; }
                    .settings-header h1 { font-size: 24px; }
                    .settings-dropdown { top: calc(var(--livebar-h, 44px) + 16px); right: 16px; min-width: 220px; }
                    .system-image { max-width: 390px; max-height: 390px; }
                    .system-image-wrap { padding: 12px 0 20px; }
                    .system-info { padding: 14px 16px; }
                    .system-info .info-row { padding: 10px 0; font-size: 18px; }
                    .action-card { padding: 18px; }
                    .action-card .action-title { font-size: 19px; }
                    .action-card button { padding: 10px 20px; font-size: 18px; }
                    .toggle-row { padding: 16px 18px; }
                    .toggle-row .tr-text { font-size: 19px; }
                    .security-section { padding: 18px; }
                    .security-choice-btn { padding: 18px 20px; }
                    .security-choice-btn .scb-title { font-size: 20px; }
                    .security-choice-btn .scb-desc { font-size: 15px; }
                }
            `;
            document.head.appendChild(style);
        }

        const isFs = isFullscreen();

        container.innerHTML = `
            <div class="settings-header">
                <h1>Настройки</h1>
                <div class="settings-header-actions">
                    <button class="settings-icon-btn" id="settingsMenuBtn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                    </button>
                    <button class="settings-icon-btn" id="settingsCloseBtn">
                        <svg viewBox="0 0 24 24">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="settings-stage" id="settingsStage">
                <div class="settings-section-view" id="viewTheme">
                    <div class="settings-section-title">Тема оформления</div>
                    <div class="theme-grid" id="themeGrid"></div>

                    <div id="screenSettingsContainer"></div>
                </div>

                <div class="settings-section-view" id="viewSearchIntel">
                    <div class="settings-section-title">Shnuk Search Intelligence</div>
                    <div id="searchIntelContent"></div>
                </div>

                <div class="settings-section-view" id="viewSecurity">
                    <div class="settings-section-title">Защита системы</div>
                    <div id="securityContent"></div>
                </div>

                <div class="settings-section-view" id="viewSystem">
                    <div class="settings-section-title">Отображение</div>

                    <div class="toggle-row ${isFs ? 'active' : ''}" id="fullscreenToggle">
                        <div class="tr-left">
                            <div>
                                <div class="tr-text">Полноэкранный режим</div>
                                <div class="tr-sub">Скрыть элементы браузера</div>
                            </div>
                        </div>
                        <div class="tr-switch"></div>
                    </div>

                    <div class="settings-section-title" style="margin-top:32px;">Информация о системе</div>
                    <div class="system-info" id="systemInfo"></div>

                    <div class="settings-section-title" style="margin-top:32px;">Обслуживание</div>

                    <div class="action-card danger-card">
                        <div class="action-title" style="color: var(--accent);">Полный сброс</div>
                        <div class="action-desc">
                            Удалит все данные: приложения, темы, файлы, виджеты, пароль.
                        </div>
                        <button class="danger" id="clearAllBtn">Сбросить всё</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(container);
        isOpen = true;

        let dropdownMenu = null;
        let isDropdownOpen = false;

        function getViewByTab(tab) {
            if (tab === 'searchIntel') return document.getElementById('viewSearchIntel');
            if (tab === 'security') return document.getElementById('viewSecurity');
            if (tab === 'system') return document.getElementById('viewSystem');
            return document.getElementById('viewTheme');
        }

        function prepareView(tab) {
            if (tab === 'system') renderSystemInfo();
            else if (tab === 'security') {
                securityPage = 'menu';
                renderSecurity();
            }
            else if (tab === 'searchIntel') {
                renderSearchIntelligence();
            }
            else if (tab === 'theme') {
                renderThemeToggle();
                renderScreenSettings();
            }
        }

        function switchSection(sectionId) {
            if (isSectionTransitioning) return;
            if (sectionId === currentTab) {
                const active = getViewByTab(sectionId);
                if (active && active.classList.contains('active')) {
                    updateDropdownActive();
                    return;
                }
            }

            const oldView = getViewByTab(currentTab);
            const newView = getViewByTab(sectionId);
            if (!newView) return;

            isSectionTransitioning = true;
            currentTab = sectionId;
            updateDropdownActive();

            if (!oldView || !oldView.classList.contains('active')) {
                prepareView(sectionId);
                newView.style.display = 'block';
                newView.classList.add('active', 'entering');
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        newView.classList.remove('entering');
                        newView.classList.add('entered');
                        isSectionTransitioning = false;
                    });
                });
                return;
            }

            oldView.classList.remove('entered');
            oldView.classList.add('leaving');

            setTimeout(function() {
                oldView.classList.remove('active');
                oldView.classList.remove('leaving');
                oldView.style.display = 'none';

                prepareView(sectionId);

                newView.style.display = 'block';
                newView.classList.add('active', 'entering');

                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        newView.classList.remove('entering');
                        newView.classList.add('entered');
                        setTimeout(function() {
                            isSectionTransitioning = false;
                        }, 340);
                    });
                });
            }, 300);
        }

        function openSectionsMenu() {
            if (isDropdownOpen) {
                closeSectionsMenu();
                return;
            }
            isDropdownOpen = true;

            dropdownMenu = document.createElement('div');
            dropdownMenu.className = 'settings-dropdown';

            const sections = [
                { id: 'theme', name: 'Темы' },
                { id: 'searchIntel', name: 'Shnuk Search Intelligence' },
                { id: 'security', name: 'Безопасность' },
                { id: 'system', name: 'Система' }
            ];

            sections.forEach(s => {
                const btn = document.createElement('button');
                const isActive = currentTab === s.id;
                if (isActive) btn.classList.add('active');
                btn.textContent = s.name;
                btn.dataset.section = s.id;
                btn.addEventListener('click', function() {
                    switchSection(s.id);
                    closeSectionsMenu();
                });
                dropdownMenu.appendChild(btn);
            });

            document.body.appendChild(dropdownMenu);
        }

        function updateDropdownActive() {
            if (!dropdownMenu) return;
            dropdownMenu.querySelectorAll('button').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.section === currentTab);
            });
        }

        function closeSectionsMenu() {
            if (!dropdownMenu) return;
            const menu = dropdownMenu;
            dropdownMenu = null;
            isDropdownOpen = false;
            menu.classList.add('closing');
            setTimeout(() => {
                if (menu.parentNode) menu.remove();
            }, 300);
        }

        document.getElementById('settingsMenuBtn').addEventListener('click', function(e) {
            e.stopPropagation();
            openSectionsMenu();
        });

        document.getElementById('settingsCloseBtn').addEventListener('click', function() {
            closeSectionsMenu();
            closeSettings();
        });

        document.addEventListener('click', function(e) {
            if (isDropdownOpen && dropdownMenu) {
                if (!dropdownMenu.contains(e.target) && !e.target.closest('#settingsMenuBtn')) {
                    closeSectionsMenu();
                }
            }
        });

        const fsToggle = document.getElementById('fullscreenToggle');
        if (fsToggle) {
            fsToggle.addEventListener('click', function() {
                toggleFullscreen().then(function() {
                    if (isFullscreen()) fsToggle.classList.add('active');
                    else fsToggle.classList.remove('active');
                }).catch(function(err) {});
            });
        }

        const clearAllBtn = document.getElementById('clearAllBtn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', clearAllData);
        }

        prepareView('theme');
        const themeView = document.getElementById('viewTheme');
        themeView.classList.add('active', 'entered');
        themeView.style.display = 'block';

        const fsChangeHandler = function() {
            const toggle = document.getElementById('fullscreenToggle');
            if (toggle) {
                if (isFullscreen()) toggle.classList.add('active');
                else toggle.classList.remove('active');
            }
        };

        document.addEventListener('fullscreenchange', fsChangeHandler);
        document.addEventListener('webkitfullscreenchange', fsChangeHandler);
        document.addEventListener('mozfullscreenchange', fsChangeHandler);
        document.addEventListener('MSFullscreenChange', fsChangeHandler);

        const onEsc = function(e) {
            if (e.key === 'Escape') {
                if (isDropdownOpen) {
                    closeSectionsMenu();
                    return;
                }
                if (securityPage !== 'menu') {
                    securityPage = 'menu';
                    renderSecurity();
                    return;
                }
                closeSettings();
                document.removeEventListener('keydown', onEsc);
            }
        };
        document.addEventListener('keydown', onEsc);
    }

    function closeSettings() {
        const el = document.getElementById('settingsApp');
        if (!el) {
            isOpen = false;
            return;
        }

        isOpen = false;

        if (window.ShnukCloseAnimation) {
            window.ShnukCloseAnimation(el, 'settings', function() {
                el.remove();
            });
        } else {
            el.style.opacity = '0';
            setTimeout(function() { el.remove(); }, 250);
        }

        document.querySelectorAll('.settings-dropdown').forEach(m => {
            m.classList.add('closing');
            setTimeout(() => { if (m.parentNode) m.remove(); }, 300);
        });
    }

    function destroy() {
        isOpen = false;
        const el = document.getElementById('settingsApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        document.querySelectorAll('.settings-dropdown').forEach(m => m.remove());
    }

    window.Settings = {
        destroy: destroy,
        openSection: function(sectionId) {
            if (!isOpen) createUI();
            setTimeout(function() {
                const container = document.getElementById('settingsApp');
                if (!container) return;
                const tabIds = ['theme', 'searchIntel', 'security', 'system'];
                tabIds.forEach(id => {
                    const v = document.getElementById('view' + id.charAt(0).toUpperCase() + id.slice(1));
                    if (!v) return;
                    if (id === sectionId) {
                        v.classList.add('active', 'entered');
                        v.classList.remove('entering', 'leaving');
                        v.style.display = 'block';
                    } else {
                        v.classList.remove('active', 'entered', 'entering', 'leaving');
                        v.style.display = 'none';
                    }
                });
                currentTab = sectionId;
                if (sectionId === 'system') renderSystemInfo();
                else if (sectionId === 'security') {
                    securityPage = 'menu';
                    renderSecurity();
                }
                else if (sectionId === 'searchIntel') {
                    renderSearchIntelligence();
                }
                else if (sectionId === 'theme') {
                    renderThemeToggle();
                    renderScreenSettings();
                }
            }, 400);
        },
        selectTheme: function(id) {
            if (!id) return;
            saveTheme(id);
        },
        toggleTheme: toggleTheme
    };
    window.settingsInit = function() {
        if (isOpen) {
            const el = document.getElementById('settingsApp');
            if (el) {
                el.style.display = 'block';
                el.style.opacity = '1';
                return;
            }
        }
        createUI();
    };

    window.openSettings = window.settingsInit;
    window.toggleFullscreen = toggleFullscreen;
    window.enterFullscreen = enterFullscreen;
    window.exitFullscreen = exitFullscreen;
    window.isFullscreen = isFullscreen;

})();