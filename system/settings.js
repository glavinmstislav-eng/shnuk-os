// settings.js

(function() {
    'use strict';

    let isOpen = false;
    let currentWallpaper = 'wall1.png';
    let currentTab = 'wallpaper';
    let currentLiveWallpaper = 'none';

    const WALLPAPER_KEY = 'shnuk_wallpaper';
    const WALLPAPER_NAME_KEY = 'shnuk_wallpaper_name';
    const FULLSCREEN_KEY = 'shnuk_fullscreen';
    const APP_WALLPAPER_KEY = 'app_wallpaper';
    const LIVE_WALLPAPER_KEY = 'shnuk_live_wallpaper';

    const wallpapers = [
        { id: 'wall1', name: 'Яркий день', file: 'wall1.png' },
        { id: 'wall2', name: 'Закат', file: 'wall2.png' },
        { id: 'wall3', name: 'Тёплая ночь', file: 'wall3.png' }
    ];

    const liveWallpapers = [
        { id: 'none', name: 'Обычные обои', desc: 'Статичная картинка' },
        { id: 'earth', name: 'Земля', desc: 'Контурная планета' },
        { id: 'saturn', name: 'Сатурн', desc: 'С кольцами' },
        { id: 'cheese', name: 'Луна-сыр', desc: 'С дырками' },
        { id: 'touch', name: 'Касания', desc: 'Реагируют на палец' }
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

    function loadData() {
        try {
            const savedApp = localStorage.getItem(APP_WALLPAPER_KEY);
            if (savedApp) {
                currentWallpaper = savedApp;
            } else {
                currentWallpaper = localStorage.getItem(WALLPAPER_KEY) || 'wall1.png';
            }
            currentLiveWallpaper = localStorage.getItem(LIVE_WALLPAPER_KEY) || 'none';
        } catch(e) {
            currentWallpaper = 'wall1.png';
            currentLiveWallpaper = 'none';
        }
    }

    function saveWallpaper(id) {
        let url = null;
        let name = id;

        const found = wallpapers.find(w => w.id === id || w.file === id);
        if (found) {
            url = found.file;
            name = found.name;
        }

        if (!url) return;

        currentWallpaper = url;
        try {
            localStorage.setItem(WALLPAPER_KEY, url);
            localStorage.setItem(WALLPAPER_NAME_KEY, name);
            localStorage.setItem(APP_WALLPAPER_KEY, url);
        } catch(e) {}

        const bg = document.getElementById('appBackground');
        if (bg) bg.dataset.staticWallpaper = url;

        if (currentLiveWallpaper === 'none') {
            applyWallpaperDirect(url);
        }

        renderWallpapers();
        renderLiveWallpapers();
        notifyWallpaperChanged();
    }

    function applyWallpaperDirect(url) {
        const bg = document.getElementById('appBackground');
        if (bg) {
            bg.dataset.staticWallpaper = url;
            bg.style.backgroundImage = `url('${url}')`;
        }
    }

    function renderWallpapers() {
        const grid = document.getElementById('wallpaperGrid');
        if (!grid) return;
        grid.innerHTML = '';

        wallpapers.forEach(w => {
            const div = document.createElement('div');
            const isSelected = currentWallpaper === w.file || currentWallpaper === w.id;
            div.className = 'wallpaper-item' + (isSelected ? ' selected' : '');
            div.innerHTML = `
                <img src="${w.file}" alt="${w.name}" loading="lazy" onerror="this.style.display='none'" />
                <div class="wallpaper-check"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="white" stroke-width="3" fill="none" stroke-linecap="round"/></svg></div>
                <div class="wallpaper-name">${w.name}</div>
            `;
            div.addEventListener('click', () => saveWallpaper(w.id));
            grid.appendChild(div);
        });
    }

    function renderLiveWallpapers() {
        const grid = document.getElementById('liveWallpaperGrid');
        if (!grid) return;
        grid.innerHTML = '';

        liveWallpapers.forEach(w => {
            const div = document.createElement('div');
            const isSelected = currentLiveWallpaper === w.id;
            div.className = 'wallpaper-item' + (isSelected ? ' selected' : '');
            div.style.aspectRatio = '1/1';
            div.innerHTML = `
                <div style="
                    width:100%;height:100%;
                    display:flex;flex-direction:column;
                    align-items:center;justify-content:center;
                    background:#f0f0f0;
                    padding:8px;box-sizing:border-box;
                    text-align:center;
                ">
                    <div style="font-size:13px;font-weight:600;color:#1a1a1a;">${w.name}</div>
                    <div style="font-size:10px;color:#888;margin-top:4px;">${w.desc}</div>
                </div>
                <div class="wallpaper-check"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="white" stroke-width="3" fill="none" stroke-linecap="round"/></svg></div>
            `;
            div.addEventListener('click', () => selectLiveWallpaper(w.id));
            grid.appendChild(div);
        });
    }

    function selectLiveWallpaper(id) {
        currentLiveWallpaper = id;
        try { localStorage.setItem(LIVE_WALLPAPER_KEY, id); } catch(e) {}

        if (window.LiveWallpapers) {
            window.LiveWallpapers.setCurrent(id);
            window.LiveWallpapers.apply(id);
        }

        renderLiveWallpapers();
        renderWallpapers();
    }

    function renderAll() {
        renderWallpapers();
        renderLiveWallpapers();
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

        const authUser = (window.Auth && window.Auth.isLoggedIn()) ? window.Auth.getUser() : null;
        const authStatus = authUser
            ? '<span style="color:#4CAF50;">Вход выполнен</span>'
            : '<span style="color:#cc0000;">Не выполнен</span>';

        html += `
            <div class="security-section">
                <div class="security-section-title">Firebase аккаунт</div>
                <div class="security-status-row" style="margin-bottom:12px;">
                    <span class="security-label">Статус</span>
                    <span class="security-value">${authStatus}</span>
                </div>
                ${authUser ? `<div style="font-size:13px;color:#666;margin-bottom:12px;word-break:break-all;">${authUser.email}</div>` : ''}
                <button class="security-btn" id="authAccountBtn">${authUser ? 'Выйти из аккаунта' : 'Создать аккаунт / Войти'}</button>
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

        const authBtn = document.getElementById('authAccountBtn');
        if (authBtn) {
            authBtn.addEventListener('click', async function() {
                if (window.Auth && window.Auth.isLoggedIn()) {
                    await window.Auth.signOut();
                    renderSecurity();
                } else {
                    if (typeof window.showAuthScreenGlobal === 'function') {
                        window.showAuthScreenGlobal(function() { renderSecurity(); });
                    }
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
            if (window.LiveWallpapers) {
                try { window.LiveWallpapers.destroy(); } catch(e) {}
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
            background: #ffffff;
            z-index: 99999;
            overflow-y: auto;
            font-family: 'ST-SimpleSquare', monospace;
            padding: 40px 24px 80px;
            animation: settingsFadeIn 0.25s ease;
            box-sizing: border-box;
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

                .settings-header {
                    display: flex; justify-content: space-between; align-items: center;
                    max-width: 640px; margin: 0 auto 24px;
                    padding-bottom: 16px; border-bottom: 2px solid #f0f0f0;
                }
                .settings-header h1 {
                    font-size: 24px; font-weight: 600; color: #1a1a1a;
                    letter-spacing: -0.3px;
                }
                .settings-header-actions {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }
                .settings-icon-btn {
                    background: none; border: none; cursor: pointer;
                    padding: 8px; color: #666; transition: color 0.2s;
                    display: flex; align-items: center; justify-content: center;
                    width: 40px; height: 40px;
                }
                .settings-icon-btn:hover { color: #cc0000; }
                .settings-icon-btn svg { display: block; width: 24px; height: 24px; }

                .settings-dropdown {
                    position: fixed;
                    top: calc(var(--livebar-h, 44px) + 20px);
                    right: 24px;
                    background: #ffffff;
                    padding: 16px;
                    z-index: 100001;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                    min-width: 240px;
                    font-family: 'ST-SimpleSquare', monospace;
                    animation: menuFadeIn 0.4s cubic-bezier(0.22, 1, 0.36, 1);
                    border: 2px solid #f0f0f0;
                }
                .settings-dropdown.closing {
                    animation: menuFadeOut 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                }
                .settings-dropdown button {
                    display: block;
                    width: 100%;
                    padding: 12px 16px;
                    margin-bottom: 6px;
                    background: #f5f5f5;
                    color: #1a1a1a;
                    border: 2px solid #e0e0e0;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 14px;
                    transition: all 0.2s;
                    text-align: left;
                }
                .settings-dropdown button:last-child { margin-bottom: 0; }
                .settings-dropdown button:hover {
                    background: #e0e0e0;
                    border-color: #cc0000;
                }
                .settings-dropdown button.active {
                    background: #cc0000;
                    color: #ffffff;
                    border-color: #cc0000;
                }

                .settings-section {
                    max-width: 640px; margin: 0 auto 36px; display: none;
                }
                .settings-section.active { display: block; }

                .settings-section-title {
                    font-size: 13px; font-weight: 600; color: #888;
                    text-transform: uppercase; letter-spacing: 0.8px;
                    margin-bottom: 16px;
                }

                .wallpaper-grid {
                    display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
                }
                .wallpaper-item {
                    aspect-ratio: 1/1; overflow: hidden; cursor: pointer;
                    border: 3px solid transparent; transition: all 0.2s ease;
                    position: relative; background: #f5f5f5;
                }
                .wallpaper-item:hover { transform: scale(1.02); }
                .wallpaper-item.selected {
                    border-color: #cc0000;
                    box-shadow: 0 0 0 3px rgba(204,0,0,0.15);
                }
                .wallpaper-item img {
                    width: 100%; height: 100%; object-fit: cover; display: block;
                }
                .wallpaper-check {
                    position: absolute; top: 8px; right: 8px;
                    width: 28px; height: 28px; background: #cc0000;
                    display: flex; align-items: center; justify-content: center;
                    opacity: 0; transition: opacity 0.2s; pointer-events: none;
                }
                .wallpaper-item.selected .wallpaper-check { opacity: 1; }
                .wallpaper-check svg { width: 16px; height: 16px; }
                .wallpaper-name {
                    position: absolute; bottom: 0; left: 0; right: 0;
                    padding: 8px 12px; background: rgba(0,0,0,0.55);
                    color: #fff; font-size: 12px; text-align: center;
                    font-weight: 500; letter-spacing: 0.3px;
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
                    background: #f8f8f8; padding: 16px 20px; margin-bottom: 24px;
                }
                .system-info .info-row {
                    display: flex; justify-content: space-between;
                    align-items: center; padding: 10px 0;
                    border-bottom: 1px solid #e8e8e8; font-size: 14px;
                }
                .system-info .info-row:last-child { border-bottom: none; }
                .system-info .info-label { color: #666; font-size: 13px; }
                .system-info .info-value {
                    color: #1a1a1a; font-weight: 600; text-align: right;
                }

                .action-card {
                    background: #f8f8f8; padding: 20px;
                    margin-bottom: 16px; border: 2px solid #e0e0e0;
                }
                .action-card .action-title {
                    font-size: 16px; font-weight: 600;
                    color: #1a1a1a; margin-bottom: 8px;
                }
                .action-card .action-desc {
                    font-size: 13px; color: #666;
                    margin-bottom: 16px; line-height: 1.5;
                }
                .action-card button {
                    padding: 10px 24px; border: 2px solid #cc0000;
                    background: #cc0000; color: #ffffff;
                    cursor: pointer; font-family: 'ST-SimpleSquare', monospace;
                    font-size: 14px; font-weight: 600;
                    transition: all 0.2s;
                }
                .action-card button:hover {
                    background: #990000; transform: scale(1.02);
                }
                .action-card button.danger {
                    background: #cc0000; border-color: #cc0000; color: #ffffff;
                }
                .action-card button.danger:hover {
                    background: #8b0000; border-color: #8b0000;
                }
                .action-card.danger-card {
                    border-color: #ffcccc; background: #fff5f5;
                }

                .toggle-row {
                    display: flex; align-items: center;
                    justify-content: space-between;
                    padding: 16px 20px; background: #f8f8f8;
                    border: 2px solid #e0e0e0; margin-bottom: 16px;
                    cursor: pointer; transition: all 0.2s;
                }
                .toggle-row:hover {
                    border-color: #cc0000; background: #fff5f5;
                }
                .toggle-row .tr-left {
                    display: flex; align-items: center; gap: 12px;
                }
                .toggle-row .tr-text {
                    font-size: 15px; font-weight: 600; color: #1a1a1a;
                }
                .toggle-row .tr-sub {
                    font-size: 12px; color: #888; margin-top: 2px;
                }
                .toggle-row .tr-switch {
                    width: 48px; height: 28px; background: #ddd;
                    border-radius: 14px; position: relative;
                    transition: background 0.3s; flex-shrink: 0;
                }
                .toggle-row .tr-switch::after {
                    content: ''; position: absolute;
                    top: 2px; left: 2px;
                    width: 24px; height: 24px;
                    background: #fff; border-radius: 50%;
                    transition: transform 0.3s;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
                .toggle-row.active .tr-switch { background: #cc0000; }
                .toggle-row.active .tr-switch::after {
                    transform: translateX(20px);
                }

                .security-status {
                    background: #f8f8f8;
                    padding: 16px 20px;
                    margin-bottom: 24px;
                    border: 2px solid #e0e0e0;
                }
                .security-status-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 14px;
                }
                .security-label { color: #666; }
                .security-value { color: #1a1a1a; font-weight: 600; }

                .security-actions { margin-bottom: 24px; }
                .security-btn {
                    padding: 10px 24px;
                    border: 2px solid #cc0000;
                    background: #cc0000;
                    color: #ffffff;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .security-btn:hover { background: #990000; }
                .security-btn.danger {
                    background: #ffffff;
                    color: #cc0000;
                }
                .security-btn.danger:hover {
                    background: #cc0000;
                    color: #ffffff;
                }

                .security-section {
                    background: #f8f8f8;
                    padding: 20px;
                    margin-bottom: 16px;
                    border: 2px solid #e0e0e0;
                }
                .security-section-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #1a1a1a;
                    margin-bottom: 12px;
                }
                .security-input-row { margin-bottom: 12px; }
                .security-input {
                    width: 100%;
                    padding: 12px 14px;
                    border: 2px solid #e0e0e0;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 14px;
                    outline: none;
                    box-sizing: border-box;
                    background: #ffffff;
                }
                .security-input:focus { border-color: #cc0000; }

                .pattern-preview-container {
                    display: flex;
                    justify-content: center;
                    margin-bottom: 12px;
                }
                #patternCanvas {
                    border: 2px solid #e0e0e0;
                    touch-action: none;
                    cursor: crosshair;
                }
                .pattern-hint {
                    text-align: center;
                    font-size: 13px;
                    color: #666;
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
                    .wallpaper-grid { gap: 10px; }
                    .wallpaper-name { font-size: 10px; padding: 6px 8px; }
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

            <div class="settings-section active" id="sectionWallpaper">
                <div class="settings-section-title">Обои рабочего стола</div>
                <div class="wallpaper-grid" id="wallpaperGrid"></div>
            </div>

            <div class="settings-section" id="sectionLiveWallpaper">
                <div class="settings-section-title">Живые обои</div>
                <div class="wallpaper-grid" id="liveWallpaperGrid"></div>
            </div>

            <div class="settings-section" id="sectionSecurity">
                <div class="settings-section-title">Защита системы</div>
                <div id="securityContent"></div>
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
                    <div class="action-title" style="color: #cc0000;">Полный сброс</div>
                    <div class="action-desc">
                        Удалит все данные: приложения, обои, файлы, виджеты, пароль.
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
                { id: 'wallpaper', name: 'Обои' },
                { id: 'livewallpaper', name: 'Живые обои' },
                { id: 'security', name: 'Безопасность' },
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
            let sectionEl;
            if (sectionId === 'livewallpaper') {
                sectionEl = document.getElementById('sectionLiveWallpaper');
            } else {
                sectionEl = document.getElementById('section' + sectionId.charAt(0).toUpperCase() + sectionId.slice(1));
            }
            if (sectionEl) sectionEl.classList.add('active');

            if (sectionId === 'system') renderSystemInfo();
            else if (sectionId === 'security') renderSecurity();
            else if (sectionId === 'livewallpaper') renderLiveWallpapers();
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

        renderAll();
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
        if (el) {
            el.style.opacity = '0';
            setTimeout(function() {
                el.remove();
                isOpen = false;
            }, 300);
        } else {
            isOpen = false;
        }
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
                container.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
                let sectionEl;
                if (sectionId === 'livewallpaper') {
                    sectionEl = document.getElementById('sectionLiveWallpaper');
                } else {
                    sectionEl = document.getElementById('section' + sectionId.charAt(0).toUpperCase() + sectionId.slice(1));
                }
                if (sectionEl) sectionEl.classList.add('active');
                if (sectionId === 'system') renderSystemInfo();
                else if (sectionId === 'security') renderSecurity();
                else if (sectionId === 'livewallpaper') renderLiveWallpapers();
            }, 400);
        },
        selectWallpaper: function(id) {
            if (!id) return;
            saveWallpaper(id);
        },
        selectLiveWallpaper: function(id) {
            if (!id) return;
            selectLiveWallpaper(id);
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