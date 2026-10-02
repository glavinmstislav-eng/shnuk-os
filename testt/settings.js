// settings.js

(function() {
    'use strict';

    let isOpen = false;
    let currentTheme = 'day';
    let currentTab = 'theme';

    const THEME_KEY = 'shnuk_theme';
    const WALLPAPER_KEY = 'shnuk_wallpaper';
    const WALLPAPER_NAME_KEY = 'shnuk_wallpaper_name';
    const FULLSCREEN_KEY = 'shnuk_fullscreen';
    const APP_WALLPAPER_KEY = 'app_wallpaper';
    const COOOP_KEEP_FLAG = 'cooop_keep_after_download';
    const COOOP_UNLOCK_FLAG = 'cooop_keep_unlocked';

    const FONT_MAIN = "'Sector034', monospace";

    const COOOP_CODES = [
        'shnuk7k2m9x',
        'a4shnukp8q1',
        'z9rshnuk3v6',
        'shnukm5t0wy',
        'q2shnuk8n4j',
        'shnukx6b1r7',
        'c8shnuk5z3k',
        'shnuk9f4d2s',
        'v1shnuk7h6p',
        'shnuk3y8q5m',
        't6shnuk2w9a',
        'shnukr4j7x1',
        'b5shnuk9c8n',
        'shnuk2p6v3z',
        'm7shnuk1s5d'
    ];

    const themes = [
        { id: 'day', name: 'Яркий день', file: 'wall1.png', desc: 'Светлая палитра' },
        { id: 'evening', name: 'Вечер', file: 'wall2.png', desc: 'Тёмно-серая палитра' },
        { id: 'warm-night', name: 'Тёплая ночь', file: 'wall3.png', desc: 'Чёрная палитра' }
    ];

    function getWin() {
        if (window.Win) return window.Win;
        return {
            alert: (msg) => Promise.resolve(),
            confirm: (msg) => Promise.resolve(false),
            prompt: (msg, def) => Promise.resolve(null),
            notify: () => {}
        };
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
                if (savedTheme) {
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

        renderThemes();
        notifyWallpaperChanged();
        notifyThemeChanged(theme.id);
    }

    function isTouchDevice() {
        try {
            return window.matchMedia('(hover: none)').matches || ('ontouchstart' in window);
        } catch(e) {
            return false;
        }
    }

    function renderThemes() {
        const container = document.getElementById('themeGrid');
        if (!container) return;
        container.innerHTML = '';

        const currentIdx = themes.findIndex(t => t.id === currentTheme);
        let leftIdx, centerIdx, rightIdx;
        if (currentIdx === -1) {
            centerIdx = 0;
            leftIdx = themes.length - 1;
            rightIdx = 1;
        } else {
            centerIdx = currentIdx;
            leftIdx = (currentIdx - 1 + themes.length) % themes.length;
            rightIdx = (currentIdx + 1) % themes.length;
        }

        const carousel = document.createElement('div');
        carousel.className = 'theme-carousel';

        const positions = ['left', 'center', 'right'];
        const orderedIndices = [leftIdx, centerIdx, rightIdx];

        positions.forEach((pos, i) => {
            const theme = themes[orderedIndices[i]];
            const item = document.createElement('div');
            item.className = 'theme-carousel-item theme-pos-' + pos;
            item.dataset.themeId = theme.id;

            const img = document.createElement('img');
            img.src = theme.file;
            img.alt = theme.name;
            img.loading = 'lazy';
            img.onerror = function() { this.style.display = 'none'; };
            item.appendChild(img);

            const check = document.createElement('div');
            check.className = 'theme-check';
            check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="white" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';
            if (theme.id === currentTheme) {
                check.style.display = 'flex';
            } else {
                check.style.display = 'none';
            }
            item.appendChild(check);

            const info = document.createElement('div');
            info.className = 'theme-info';
            info.innerHTML = `
                <div class="theme-name">${theme.name}</div>
                <div class="theme-desc">${theme.desc}</div>
            `;
            item.appendChild(info);

            item.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!carousel.classList.contains('expanded')) {
                    carousel.classList.add('expanded');
                    return;
                }
                openThemeApply(theme.id);
            });

            carousel.appendChild(item);
        });

        container.appendChild(carousel);

        let collapseTimer = null;

        function expand() {
            if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
            carousel.classList.add('expanded');
        }

        function collapse() {
            if (collapseTimer) clearTimeout(collapseTimer);
            collapseTimer = setTimeout(function() {
                carousel.classList.remove('expanded');
            }, 320);
        }

        carousel.addEventListener('mouseenter', expand);
        carousel.addEventListener('mouseleave', collapse);

        if (isTouchDevice()) {
            carousel.addEventListener('click', function(e) {
                if (e.target.closest('.theme-carousel-item')) return;
                if (carousel.classList.contains('expanded')) {
                    carousel.classList.remove('expanded');
                } else {
                    carousel.classList.add('expanded');
                }
            });
        }

        document.addEventListener('click', function onDocClick(e) {
            if (!document.getElementById('themeGrid')) {
                document.removeEventListener('click', onDocClick);
                return;
            }
            if (!carousel.contains(e.target)) {
                carousel.classList.remove('expanded');
            }
        });
    }

    function openThemeApply(themeId) {
        const old = document.getElementById('themeApplyOverlay');
        if (old) old.remove();

        const theme = themes.find(t => t.id === themeId);
        if (!theme) return;

        const overlay = document.createElement('div');
        overlay.id = 'themeApplyOverlay';
        overlay.className = 'theme-apply-overlay';

        const modal = document.createElement('div');
        modal.className = 'theme-apply-modal';

        const header = document.createElement('div');
        header.className = 'theme-apply-header';
        header.innerHTML = `
            <div class="theme-apply-title">Применить тему?</div>
            <button class="theme-apply-close" id="themeApplyClose">✕</button>
        `;
        modal.appendChild(header);

        const nameLine = document.createElement('div');
        nameLine.className = 'theme-apply-name';
        nameLine.textContent = theme.name;
        modal.appendChild(nameLine);

        const actions = document.createElement('div');
        actions.className = 'theme-apply-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'theme-apply-btn secondary';
        cancelBtn.textContent = 'Отмена';
        actions.appendChild(cancelBtn);

        const applyBtn = document.createElement('button');
        applyBtn.className = 'theme-apply-btn primary';
        applyBtn.textContent = 'Применить';
        actions.appendChild(applyBtn);

        modal.appendChild(actions);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        requestAnimationFrame(function() {
            overlay.classList.add('visible');
        });

        function close() {
            overlay.classList.remove('visible');
            setTimeout(function() {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 260);
        }

        cancelBtn.addEventListener('click', close);
        header.querySelector('#themeApplyClose').addEventListener('click', close);
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) close();
        });

        applyBtn.addEventListener('click', function() {
            saveTheme(theme.id);
            close();
        });

        const onEsc = function(e) {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', onEsc);
            }
        };
        document.addEventListener('keydown', onEsc);
    }

    function renderCooopSettings() {
        const container = document.getElementById('cooopSettingsContent');
        if (!container) return;

        let unlocked = false;
        let keep = false;
        try { unlocked = localStorage.getItem(COOOP_UNLOCK_FLAG) === 'true'; } catch(e) {}
        try { keep = localStorage.getItem(COOOP_KEEP_FLAG) === 'true'; } catch(e) {}

        if (!unlocked) {
            container.innerHTML = `
                <div class="cooop-section">
                    <div class="cooop-section-title">Специальный доступ</div>
                    <div class="cooop-desc">Введите один из специальных кодов, чтобы открыть расширенные настройки Cooop Share.</div>
                    <div class="cooop-code-row">
                        <input type="text" id="cooopCodeInput" class="cooop-input" placeholder="Специальный код" autocomplete="off" spellcheck="false" />
                        <button class="cooop-btn" id="cooopUnlockBtn">Разблокировать</button>
                    </div>
                    <div class="cooop-hint" id="cooopCodeHint"></div>
                </div>
            `;

            const input = document.getElementById('cooopCodeInput');
            const btn = document.getElementById('cooopUnlockBtn');
            const hint = document.getElementById('cooopCodeHint');

            function tryUnlock() {
                const code = (input.value || '').trim();
                if (!code) {
                    hint.textContent = 'Введите код';
                    hint.style.color = 'var(--accent)';
                    return;
                }
                if (COOOP_CODES.indexOf(code) !== -1) {
                    try { localStorage.setItem(COOOP_UNLOCK_FLAG, 'true'); } catch(e) {}
                    hint.textContent = 'Доступ открыт';
                    hint.style.color = '#4CAF50';
                    setTimeout(renderCooopSettings, 600);
                } else {
                    hint.textContent = 'Неверный код';
                    hint.style.color = 'var(--accent)';
                    input.value = '';
                }
            }

            btn.addEventListener('click', tryUnlock);
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') tryUnlock();
            });
            return;
        }

        container.innerHTML = `
            <div class="cooop-section">
                <div class="cooop-section-title">Расширенные настройки</div>
                <div class="toggle-row ${keep ? 'active' : ''}" id="cooopKeepToggle">
                    <div class="tr-left">
                        <div>
                            <div class="tr-text">Не удалять после скачивания</div>
                            <div class="tr-sub">Файл останется на сервере после первого скачивания</div>
                        </div>
                    </div>
                    <div class="tr-switch"></div>
                </div>
                <div class="cooop-desc">При включении ссылка останется рабочей после того, как получатель скачает файл.</div>
                <div class="cooop-lock-row">
                    <button class="cooop-btn-secondary" id="cooopRelockBtn">Заблокировать настройки</button>
                </div>
            </div>
        `;

        const toggle = document.getElementById('cooopKeepToggle');
        if (toggle) {
            toggle.addEventListener('click', function() {
                const nowActive = !toggle.classList.contains('active');
                toggle.classList.toggle('active', nowActive);
                try { localStorage.setItem(COOOP_KEEP_FLAG, nowActive ? 'true' : 'false'); } catch(e) {}
                if (window.Win && window.Win.notify) {
                    window.Win.notify(nowActive ? 'Файлы не будут удаляться' : 'Файлы будут удаляться после скачивания', { type: 'success' });
                }
            });
        }

        const relock = document.getElementById('cooopRelockBtn');
        if (relock) {
            relock.addEventListener('click', function() {
                try { localStorage.removeItem(COOOP_UNLOCK_FLAG); } catch(e) {}
                try { localStorage.setItem(COOOP_KEEP_FLAG, 'false'); } catch(e) {}
                renderCooopSettings();
            });
        }
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

    function renderSecurity() {
        const container = document.getElementById('securityContent');
        if (!container) return;

        const hasSec = window.Security && window.Security.hasSecurity();
        const secType = hasSec ? (window.Security.hasPassword() ? 'Пароль' : 'Графический ключ') : 'Не установлен';

        let html = `
            <div class="security-status">
                <div class="security-status-row">
                    <span class="security-label">Текущий способ защиты</span>
                    <span class="security-value">${secType}</span>
                </div>
            </div>
        `;

        if (hasSec) {
            html += `
                <div class="security-actions">
                    <button class="security-btn danger" id="removeSecurityBtn">Удалить защиту</button>
                </div>
            `;
        }

        html += `
            <div class="security-section">
                <div class="security-section-title">Установить пароль</div>
                <div class="security-input-row">
                    <input type="password" id="newPasswordInput" placeholder="Пароль" class="security-input" />
                </div>
                <div class="security-input-row">
                    <input type="password" id="confirmPasswordInput" placeholder="Повторите пароль" class="security-input" />
                </div>
                <button class="security-btn" id="setPasswordBtn">Установить пароль</button>
            </div>

            <div class="security-section">
                <div class="security-section-title">Установить графический ключ</div>
                <div class="pattern-preview-container">
                    <canvas id="patternCanvas" width="240" height="240"></canvas>
                </div>
                <div class="pattern-hint" id="patternHint"></div>
                <button class="security-btn" id="setPatternBtn">Установить ключ</button>
            </div>
        `;

        container.innerHTML = html;

        if (hasSec) {
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
                        window.Security.removeSecurity();
                        renderSecurity();
                    }
                });
            }
        }

        const setPasswordBtn = document.getElementById('setPasswordBtn');
        if (setPasswordBtn) {
            setPasswordBtn.addEventListener('click', function() {
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

                if (window.Security.setPassword(pwd)) {
                    getWin().alert('Пароль установлен', { title: 'Готово' });
                    renderSecurity();
                }
            });
        }

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
            setPatternBtn.addEventListener('click', function() {
                if (selectedPattern.length < 4) {
                    getWin().alert('Минимум 4 точки', { title: 'Ошибка' });
                    return;
                }

                if (window.Security.setPattern(selectedPattern)) {
                    getWin().alert('Графический ключ установлен', { title: 'Готово' });
                    selectedPattern = [];
                    for (const dot of dots) dot.used = false;
                    drawGrid();
                    updateHint();
                    renderSecurity();
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
                .settings-dropdown *,
                .theme-apply-overlay,
                .theme-apply-overlay * {
                    font-family: ${FONT_MAIN} !important;
                }

                .settings-header {
                    display: flex; justify-content: space-between; align-items: center;
                    max-width: 640px; margin: 0 auto 24px;
                    padding-bottom: 16px; border-bottom: 2px solid var(--border-color);
                }
                .settings-header h1 {
                    font-size: 24px; font-weight: 600; color: var(--text-primary);
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
                    width: 40px; height: 40px;
                }
                .settings-icon-btn:hover { color: var(--accent); }
                .settings-icon-btn svg { display: block; width: 24px; height: 24px; }

                .settings-dropdown {
                    position: fixed;
                    top: calc(var(--livebar-h, 44px) + 20px);
                    right: 24px;
                    background: var(--bg-primary);
                    padding: 16px;
                    z-index: 100001;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                    min-width: 240px;
                    animation: menuFadeIn 0.4s cubic-bezier(0.22, 1, 0.36, 1);
                    border: 2px solid var(--border-color);
                }
                .settings-dropdown.closing {
                    animation: menuFadeOut 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                }
                .settings-dropdown button {
                    display: block;
                    width: 100%;
                    padding: 12px 16px;
                    margin-bottom: 6px;
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                    border: 2px solid var(--border-color);
                    cursor: pointer;
                    font-size: 14px;
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

                .settings-section {
                    max-width: 640px; margin: 0 auto 36px; display: none;
                }
                .settings-section.active { display: block; }

                .settings-section-title {
                    font-size: 13px; font-weight: 600; color: var(--text-muted);
                    text-transform: uppercase; letter-spacing: 0.8px;
                    margin-bottom: 16px;
                }

                .theme-grid {
                    display: block;
                    width: 100%;
                }

                .theme-carousel {
                    position: relative;
                    width: 100%;
                    height: 320px;
                    max-width: 480px;
                    margin: 0 auto;
                    perspective: 1200px;
                    cursor: pointer;
                    user-select: none;
                    -webkit-tap-highlight-color: transparent;
                }

                .theme-carousel-item {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 220px;
                    height: 280px;
                    margin-left: -110px;
                    margin-top: -140px;
                    border-radius: 4px;
                    overflow: hidden;
                    background: var(--bg-secondary);
                    transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1),
                                opacity 0.4s ease,
                                filter 0.4s ease,
                                box-shadow 0.4s ease;
                    will-change: transform, opacity;
                    cursor: pointer;
                    border: 3px solid transparent;
                    box-sizing: border-box;
                }

                .theme-carousel-item img {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    display: block;
                    pointer-events: none;
                    background: var(--bg-tertiary);
                }

                .theme-carousel-item .theme-info {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    padding: 12px 14px;
                    background: linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0));
                    color: #fff;
                    text-align: left;
                    pointer-events: none;
                }
                .theme-carousel-item .theme-name {
                    font-size: 15px;
                    font-weight: 700;
                    letter-spacing: 0.3px;
                }
                .theme-carousel-item .theme-desc {
                    font-size: 11px;
                    color: #cccccc;
                    margin-top: 3px;
                }
                .theme-carousel-item .theme-check {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    width: 30px;
                    height: 30px;
                    background: var(--accent);
                    display: none;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    pointer-events: none;
                }
                .theme-carousel-item .theme-check svg {
                    width: 16px;
                    height: 16px;
                }

                .theme-carousel:not(.expanded) .theme-pos-center {
                    transform: translateZ(0) rotateY(0deg) scale(1);
                    opacity: 1;
                    z-index: 3;
                    filter: blur(0);
                    box-shadow: 0 20px 60px rgba(0,0,0,0.35);
                }
                .theme-carousel:not(.expanded) .theme-pos-left {
                    transform: translateX(-120px) rotateY(35deg) scale(0.82);
                    opacity: 0.55;
                    z-index: 2;
                    filter: blur(1px);
                    box-shadow: 0 10px 30px rgba(0,0,0,0.25);
                }
                .theme-carousel:not(.expanded) .theme-pos-right {
                    transform: translateX(120px) rotateY(-35deg) scale(0.82);
                    opacity: 0.55;
                    z-index: 2;
                    filter: blur(1px);
                    box-shadow: 0 10px 30px rgba(0,0,0,0.25);
                }

                .theme-carousel.expanded .theme-pos-center {
                    transform: translateX(0) rotateY(0deg) scale(0.95);
                    opacity: 1;
                    z-index: 3;
                    filter: blur(0);
                    box-shadow: 0 20px 60px rgba(0,0,0,0.35);
                }
                .theme-carousel.expanded .theme-pos-left {
                    transform: translateX(-240px) rotateY(0deg) scale(0.88);
                    opacity: 1;
                    z-index: 3;
                    filter: blur(0);
                    box-shadow: 0 14px 40px rgba(0,0,0,0.3);
                }
                .theme-carousel.expanded .theme-pos-right {
                    transform: translateX(240px) rotateY(0deg) scale(0.88);
                    opacity: 1;
                    z-index: 3;
                    filter: blur(0);
                    box-shadow: 0 14px 40px rgba(0,0,0,0.3);
                }

                .theme-carousel-item:hover {
                    border-color: var(--accent);
                }

                @media (max-width: 600px) {
                    .theme-carousel {
                        height: 260px;
                        max-width: 100%;
                    }
                    .theme-carousel-item {
                        width: 160px;
                        height: 220px;
                        margin-left: -80px;
                        margin-top: -110px;
                    }
                    .theme-carousel:not(.expanded) .theme-pos-left {
                        transform: translateX(-90px) rotateY(35deg) scale(0.82);
                    }
                    .theme-carousel:not(.expanded) .theme-pos-right {
                        transform: translateX(90px) rotateY(-35deg) scale(0.82);
                    }
                    .theme-carousel.expanded .theme-pos-left {
                        transform: translateX(-160px) rotateY(0deg) scale(0.86);
                    }
                    .theme-carousel.expanded .theme-pos-right {
                        transform: translateX(160px) rotateY(0deg) scale(0.86);
                    }
                    .theme-carousel-item .theme-name { font-size: 13px; }
                    .theme-carousel-item .theme-desc { font-size: 10px; }
                }

                .theme-apply-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.55);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    z-index: 100002;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                    transition: opacity 0.26s ease;
                    padding: 20px;
                    box-sizing: border-box;
                }
                .theme-apply-overlay.visible { opacity: 1; }

                .theme-apply-modal {
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    width: 100%;
                    max-width: 380px;
                    border: 2px solid var(--border-color);
                    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
                    transform: scale(0.94) translateY(10px);
                    transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
                    display: flex;
                    flex-direction: column;
                    max-height: calc(100% - 40px);
                    overflow: hidden;
                }
                .theme-apply-overlay.visible .theme-apply-modal {
                    transform: scale(1) translateY(0);
                }

                .theme-apply-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 14px 18px;
                    background: var(--header-bg);
                    color: var(--header-text);
                    border-bottom: 2px solid var(--border-color);
                    flex-shrink: 0;
                }
                .theme-apply-title {
                    font-size: 16px;
                    font-weight: 700;
                    letter-spacing: 0.3px;
                }
                .theme-apply-close {
                    background: none;
                    border: 2px solid var(--accent);
                    color: var(--accent);
                    font-size: 14px;
                    padding: 2px 10px;
                    cursor: pointer;
                    line-height: 1;
                    transition: all 0.2s ease;
                }
                .theme-apply-close:hover {
                    background: var(--accent);
                    color: var(--text-on-accent);
                }

                .theme-apply-name {
                    padding: 24px 18px;
                    font-size: 17px;
                    color: var(--text-primary);
                    letter-spacing: 0.4px;
                    font-weight: 600;
                    text-align: center;
                    flex-shrink: 0;
                }

                .theme-apply-actions {
                    display: flex;
                    gap: 10px;
                    padding: 14px 18px 18px;
                    border-top: 2px solid var(--border-color);
                    background: var(--bg-secondary);
                    flex-shrink: 0;
                }
                .theme-apply-btn {
                    flex: 1;
                    padding: 12px 18px;
                    font-size: 14px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    border: 2px solid transparent;
                }
                .theme-apply-btn.primary {
                    background: var(--accent);
                    color: var(--text-on-accent);
                    border-color: var(--accent);
                }
                .theme-apply-btn.primary:hover {
                    background: var(--accent-dark);
                    border-color: var(--accent-dark);
                }
                .theme-apply-btn.secondary {
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    border-color: var(--border-color);
                }
                .theme-apply-btn.secondary:hover {
                    border-color: var(--accent);
                    color: var(--accent);
                }

                .cooop-section {
                    background: var(--bg-secondary); padding: 20px;
                    margin-bottom: 16px; border: 2px solid var(--border-color);
                }
                .cooop-section-title {
                    font-size: 14px; font-weight: 600; color: var(--text-primary);
                    margin-bottom: 12px;
                }
                .cooop-desc {
                    font-size: 12px; color: var(--text-secondary);
                    line-height: 1.5; margin-bottom: 14px;
                }
                .cooop-code-row {
                    display: flex; gap: 10px; flex-wrap: wrap;
                }
                .cooop-input {
                    flex: 1; min-width: 160px;
                    padding: 12px 14px;
                    border: 2px solid var(--border-color);
                    font-size: 14px;
                    outline: none;
                    box-sizing: border-box;
                    background: var(--bg-primary);
                    color: var(--text-primary);
                }
                .cooop-input:focus { border-color: var(--accent); }
                .cooop-btn {
                    padding: 12px 24px;
                    border: 2px solid var(--accent);
                    background: var(--accent);
                    color: var(--text-on-accent);
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .cooop-btn:hover { background: var(--accent-dark); }
                .cooop-btn-secondary {
                    padding: 10px 20px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    cursor: pointer;
                    font-size: 13px;
                    transition: all 0.2s;
                }
                .cooop-btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
                .cooop-hint {
                    font-size: 12px; margin-top: 10px;
                    min-height: 18px; color: var(--text-muted);
                }
                .cooop-lock-row {
                    margin-top: 16px;
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
                    background: var(--bg-secondary); padding: 16px 20px; margin-bottom: 24px;
                }
                .system-info .info-row {
                    display: flex; justify-content: space-between;
                    align-items: center; padding: 10px 0;
                    border-bottom: 1px solid var(--border-color); font-size: 14px;
                }
                .system-info .info-row:last-child { border-bottom: none; }
                .system-info .info-label { color: var(--text-secondary); font-size: 13px; }
                .system-info .info-value {
                    color: var(--text-primary); font-weight: 600; text-align: right;
                }

                .action-card {
                    background: var(--bg-secondary); padding: 20px;
                    margin-bottom: 16px; border: 2px solid var(--border-color);
                }
                .action-card .action-title {
                    font-size: 16px; font-weight: 600;
                    color: var(--text-primary); margin-bottom: 8px;
                }
                .action-card .action-desc {
                    font-size: 13px; color: var(--text-secondary);
                    margin-bottom: 16px; line-height: 1.5;
                }
                .action-card button {
                    padding: 10px 24px; border: 2px solid var(--accent);
                    background: var(--accent); color: var(--text-on-accent);
                    cursor: pointer;
                    font-size: 14px; font-weight: 600;
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
                    padding: 16px 20px; background: var(--bg-secondary);
                    border: 2px solid var(--border-color); margin-bottom: 16px;
                    cursor: pointer; transition: all 0.2s;
                }
                .toggle-row:hover {
                    border-color: var(--accent); background: var(--bg-hover);
                }
                .toggle-row .tr-left {
                    display: flex; align-items: center; gap: 12px;
                }
                .toggle-row .tr-text {
                    font-size: 15px; font-weight: 600; color: var(--text-primary);
                }
                .toggle-row .tr-sub {
                    font-size: 12px; color: var(--text-muted); margin-top: 2px;
                }
                .toggle-row .tr-switch {
                    width: 48px; height: 28px; background: var(--border-color);
                    border-radius: 14px; position: relative;
                    transition: background 0.3s; flex-shrink: 0;
                }
                .toggle-row .tr-switch::after {
                    content: ''; position: absolute;
                    top: 2px; left: 2px;
                    width: 24px; height: 24px;
                    background: var(--bg-primary); border-radius: 50%;
                    transition: transform 0.3s;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
                .toggle-row.active .tr-switch { background: var(--accent); }
                .toggle-row.active .tr-switch::after {
                    transform: translateX(20px);
                }

                .security-status {
                    background: var(--bg-secondary);
                    padding: 16px 20px;
                    margin-bottom: 24px;
                    border: 2px solid var(--border-color);
                }
                .security-status-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 14px;
                }
                .security-label { color: var(--text-secondary); }
                .security-value { color: var(--text-primary); font-weight: 600; }

                .security-actions { margin-bottom: 24px; }
                .security-btn {
                    padding: 10px 24px;
                    border: 2px solid var(--accent);
                    background: var(--accent);
                    color: var(--text-on-accent);
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
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
                    padding: 20px;
                    margin-bottom: 16px;
                    border: 2px solid var(--border-color);
                }
                .security-section-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin-bottom: 12px;
                }
                .security-input-row { margin-bottom: 12px; }
                .security-input {
                    width: 100%;
                    padding: 12px 14px;
                    border: 2px solid var(--border-color);
                    font-size: 14px;
                    outline: none;
                    box-sizing: border-box;
                    background: var(--bg-primary);
                    color: var(--text-primary);
                }
                .security-input:focus { border-color: var(--accent); }

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
                    font-size: 13px;
                    color: var(--text-secondary);
                    margin-bottom: 12px;
                    min-height: 20px;
                }

                @media (max-width: 900px) {
                    .system-image { max-width: 360px; max-height: 360px; }
                }
                @media (max-width: 500px) {
                    #settingsApp { padding: 24px 16px 60px; }
                    .settings-header h1 { font-size: 20px; }
                    .settings-dropdown { top: calc(var(--livebar-h, 44px) + 16px); right: 16px; min-width: 200px; }
                    .system-image { max-width: 390px; max-height: 390px; }
                    .system-image-wrap { padding: 12px 0 20px; }
                    .system-info { padding: 12px 16px; }
                    .system-info .info-row { padding: 8px 0; font-size: 13px; }
                    .action-card { padding: 16px; }
                    .action-card .action-title { font-size: 15px; }
                    .action-card button { padding: 8px 18px; font-size: 13px; }
                    .toggle-row { padding: 14px 16px; }
                    .toggle-row .tr-text { font-size: 14px; }
                    .security-section { padding: 16px; }
                    .cooop-section { padding: 16px; }
                    .theme-apply-modal { max-width: 100%; }
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

            <div class="settings-section active" id="sectionTheme">
                <div class="settings-section-title">Темы оформления</div>
                <div class="theme-grid" id="themeGrid"></div>
            </div>

            <div class="settings-section" id="sectionSecurity">
                <div class="settings-section-title">Защита системы</div>
                <div id="securityContent"></div>
            </div>

            <div class="settings-section" id="sectionCooop">
                <div class="settings-section-title">Cooop Share</div>
                <div id="cooopSettingsContent"></div>
            </div>

            <div class="settings-section" id="sectionSystem">
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
        `;

        document.body.appendChild(container);
        isOpen = true;

        let dropdownMenu = null;
        let isDropdownOpen = false;

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
                { id: 'security', name: 'Безопасность' },
                { id: 'cooop', name: 'Cooop Share' },
                { id: 'system', name: 'Система' }
            ];

            sections.forEach(s => {
                const btn = document.createElement('button');
                const isActive = currentTab === s.id;
                if (isActive) btn.classList.add('active');
                btn.textContent = s.name;
                btn.addEventListener('click', function() {
                    switchSection(s.id);
                    closeSectionsMenu();
                });
                dropdownMenu.appendChild(btn);
            });

            document.body.appendChild(dropdownMenu);
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

        function switchSection(sectionId) {
            currentTab = sectionId;

            container.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
            let sectionEl = document.getElementById('section' + sectionId.charAt(0).toUpperCase() + sectionId.slice(1));
            if (sectionEl) sectionEl.classList.add('active');

            if (sectionId === 'system') renderSystemInfo();
            else if (sectionId === 'security') renderSecurity();
            else if (sectionId === 'theme') renderThemes();
            else if (sectionId === 'cooop') renderCooopSettings();
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

        renderThemes();
        renderCooopSettings();
        renderSystemInfo();

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
                const overlay = document.getElementById('themeApplyOverlay');
                if (overlay) return;
                if (isDropdownOpen) {
                    closeSectionsMenu();
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

        const overlay = document.getElementById('themeApplyOverlay');
        if (overlay) overlay.remove();

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
        const overlay = document.getElementById('themeApplyOverlay');
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    window.Settings = {
        destroy: destroy,
        openSection: function(sectionId) {
            if (!isOpen) createUI();
            setTimeout(function() {
                const container = document.getElementById('settingsApp');
                if (!container) return;
                container.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
                let sectionEl = document.getElementById('section' + sectionId.charAt(0).toUpperCase() + sectionId.slice(1));
                if (sectionEl) sectionEl.classList.add('active');
                if (sectionId === 'system') renderSystemInfo();
                else if (sectionId === 'security') renderSecurity();
                else if (sectionId === 'theme') renderThemes();
                else if (sectionId === 'cooop') renderCooopSettings();
            }, 400);
        },
        selectTheme: function(id) {
            if (!id) return;
            saveTheme(id);
        }
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