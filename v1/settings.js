// settings.js

(function() {
    'use strict';

    let isOpen = false;
    let currentWallpaper = 'wall1.png';
    let customWallpapers = [];
    let currentTab = 'wallpaper';

    const WALLPAPER_KEY = 'shnuk_wallpaper';
    const WALLPAPER_NAME_KEY = 'shnuk_wallpaper_name';
    const CUSTOM_WALLPAPERS_KEY = 'shnuk_custom_wallpapers';
    const FULLSCREEN_KEY = 'shnuk_fullscreen';
    const APP_WALLPAPER_KEY = 'app_wallpaper';
    const AOD_KEY = 'shnuk_aod_enabled';

    const wallpapers = [
        { id: 'wall1', name: 'Яркий день', file: 'wall1.png' },
        { id: 'wall2', name: 'Закат', file: 'wall2.png' },
        { id: 'wall3', name: 'Тёплая ночь', file: 'wall3.png' }
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

    function isAODEnabled() {
        try { return localStorage.getItem(AOD_KEY) === 'true'; }
        catch(e) { return false; }
    }

    function setAODEnabled(on) {
        try { localStorage.setItem(AOD_KEY, on ? 'true' : 'false'); } catch(e) {}
        if (window.AOD && typeof window.AOD.setEnabled === 'function') {
            window.AOD.setEnabled(on);
        }
    }

    function showAODWarning(callback) {
        const overlay = document.createElement('div');
        overlay.id = 'aodWarningOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0,0,0,0.55);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            z-index: 2147483646;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'ST-SimpleSquare', monospace;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: #ffffff;
            max-width: 440px;
            width: calc(100% - 40px);
            padding: 28px 24px 24px;
            box-sizing: border-box;
            box-shadow: 0 20px 60px rgba(0,0,0,0.35);
            border: 2px solid #cc0000;
            transform: scale(0.94);
            transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
        `;

        dialog.innerHTML = `
            <div style="font-size:18px;font-weight:700;color:#cc0000;margin-bottom:14px;">Внимание</div>
            <div style="font-size:14px;line-height:1.6;color:#333;margin-bottom:24px;">
                AOD опасен для устройств с IPS экраном, пожалуйста, не включайте эту функцию если на вашем устройстве IPS экран. Shnuk не несет отвественности за ваше устройство в случае выгарания экрана из-за IPS, или чего похуже.
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <button id="aodConfirmBtn" style="
                    padding:14px 20px;border:none;
                    background:#cc0000;color:#fff;
                    cursor:pointer;font-family:'ST-SimpleSquare',monospace;
                    font-size:14px;font-weight:600;
                    transition:background 0.2s;
                ">Всё равно включить AOD</button>
                <button id="aodCancelBtn" style="
                    padding:14px 20px;border:2px solid #e0e0e0;
                    background:#fff;color:#666;
                    cursor:pointer;font-family:'ST-SimpleSquare',monospace;
                    font-size:14px;font-weight:600;
                    transition:all 0.2s;
                ">Отмена</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        requestAnimationFrame(function() {
            overlay.style.opacity = '1';
            dialog.style.transform = 'scale(1)';
        });

        function close() {
            overlay.style.opacity = '0';
            dialog.style.transform = 'scale(0.94)';
            setTimeout(function() {
                if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 300);
        }

        document.getElementById('aodConfirmBtn').addEventListener('click', function() {
            close();
            if (callback) callback(true);
        });
        document.getElementById('aodCancelBtn').addEventListener('click', function() {
            close();
            if (callback) callback(false);
        });
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                close();
                if (callback) callback(false);
            }
        });
    }

    function notifyWallpaperChanged() {
        try {
            const url = localStorage.getItem(APP_WALLPAPER_KEY);
            if (url) {
                window.dispatchEvent(new CustomEvent('shnuk:wallpaper-changed', { detail: { url: url } }));
            }
        } catch(e) {}
    }

    function loadCustomWallpapersFromStorage() {
        try {
            const raw = localStorage.getItem(CUSTOM_WALLPAPERS_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(w => w && w.id && w.data);
        } catch(e) {
            return [];
        }
    }

    function saveCustomWallpapersToStorage() {
        try {
            localStorage.setItem(CUSTOM_WALLPAPERS_KEY, JSON.stringify(customWallpapers));
        } catch(e) {}
    }

    function loadData() {
        customWallpapers = loadCustomWallpapersFromStorage();
        try {
            const savedApp = localStorage.getItem(APP_WALLPAPER_KEY);
            if (savedApp) {
                currentWallpaper = savedApp;
            } else {
                currentWallpaper = localStorage.getItem(WALLPAPER_KEY) || 'wall1.png';
            }
        } catch(e) {
            currentWallpaper = 'wall1.png';
        }
    }

    function saveWallpaper(id) {
        let url = null;
        let name = id;

        const found = wallpapers.find(w => w.id === id || w.file === id);
        if (found) {
            url = found.file;
            name = found.name;
        } else {
            const custom = customWallpapers.find(w => w.id === id || w.data === id);
            if (custom) {
                url = custom.data;
                name = custom.name;
            }
        }

        if (!url) return;

        currentWallpaper = url;
        try {
            localStorage.setItem(WALLPAPER_KEY, url);
            localStorage.setItem(WALLPAPER_NAME_KEY, name);
            localStorage.setItem(APP_WALLPAPER_KEY, url);
        } catch(e) {}

        applyWallpaperDirect(url);
        renderWallpapers();
        renderCustomWallpapers();
        notifyWallpaperChanged();
    }

    function applyWallpaperDirect(url) {
        const bg = document.getElementById('appBackground');
        if (bg) bg.style.backgroundImage = `url('${url}')`;
    }

    function loadCustomWallpapers(files) {
        const promises = [];
        const newItems = [];
        
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            promises.push(new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = e => {
                    const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                    newItems.push({ 
                        id, 
                        name: file.name.replace(/\.[^.]+$/, ''), 
                        data: e.target.result 
                    });
                    resolve();
                };
                reader.onerror = () => resolve();
                reader.readAsDataURL(file);
            }));
        });
        
        Promise.all(promises).then(() => {
            customWallpapers = customWallpapers.concat(newItems);
            saveCustomWallpapersToStorage();
            renderCustomWallpapers();
            if (newItems.length) saveWallpaper(newItems[0].id);
        });
    }

    async function removeCustomWallpaper(id) {
        const Win = getWin();
        const ok = await Win.confirm('Удалить эти обои?', {
            title: 'Удаление',
            okText: 'Удалить',
            cancelText: 'Отмена',
            danger: true
        });
        if (!ok) return;
        
        customWallpapers = customWallpapers.filter(w => w.id !== id);
        saveCustomWallpapersToStorage();
        
        if (currentWallpaper === id || customWallpapers.find(w => w.data === currentWallpaper) === undefined) {
            const next = customWallpapers.length ? customWallpapers[0].id : 'wall1';
            saveWallpaper(next);
        } else {
            renderCustomWallpapers();
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

    function renderCustomWallpapers() {
        const grid = document.getElementById('customWallpapersGrid');
        if (!grid) return;
        grid.innerHTML = '';
        
        if (customWallpapers.length === 0) {
            grid.innerHTML = `<div class="empty-message">Нет загруженных обоев</div>`;
            return;
        }
        
        customWallpapers.forEach(w => {
            const div = document.createElement('div');
            const isSelected = currentWallpaper === w.id || currentWallpaper === w.data;
            div.className = 'custom-wallpaper-item' + (isSelected ? ' selected' : '');
            div.innerHTML = `
                <img src="${w.data}" alt="${w.name}" loading="lazy" />
                <button class="custom-remove" data-id="${w.id}">
                    <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>
                </button>
                <div class="wallpaper-check"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="white" stroke-width="3" fill="none" stroke-linecap="round"/></svg></div>
                <div class="wallpaper-name">${w.name}</div>
            `;
            div.addEventListener('click', e => {
                if (e.target.closest('.custom-remove')) return;
                saveWallpaper(w.id);
            });
            div.querySelector('.custom-remove').addEventListener('click', e => {
                e.stopPropagation();
                removeCustomWallpaper(w.id);
            });
            grid.appendChild(div);
        });
    }

    function renderAll() {
        renderWallpapers();
        renderCustomWallpapers();
    }

    function renderSystemInfo() {
        const container = document.getElementById('systemInfo');
        if (!container) return;

        let filesCount = 0;
        try {
            const files = localStorage.getItem('shnuk_files');
            if (files) {
                const parsed = JSON.parse(files);
                filesCount = Array.isArray(parsed) ? parsed.length : 0;
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

        const sizeFormatted = formatBytes(storageSize);

        container.innerHTML = `
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
                .wallpaper-item, .custom-wallpaper-item {
                    aspect-ratio: 1/1; overflow: hidden; cursor: pointer;
                    border: 3px solid transparent; transition: all 0.2s ease;
                    position: relative; background: #f5f5f5;
                }
                .wallpaper-item:hover, .custom-wallpaper-item:hover { transform: scale(1.02); }
                .wallpaper-item.selected, .custom-wallpaper-item.selected {
                    border-color: #cc0000;
                    box-shadow: 0 0 0 3px rgba(204,0,0,0.15);
                }
                .wallpaper-item img, .custom-wallpaper-item img {
                    width: 100%; height: 100%; object-fit: cover; display: block;
                }
                .wallpaper-check {
                    position: absolute; top: 8px; right: 8px;
                    width: 28px; height: 28px; background: #cc0000;
                    display: flex; align-items: center; justify-content: center;
                    opacity: 0; transition: opacity 0.2s; pointer-events: none;
                }
                .wallpaper-item.selected .wallpaper-check,
                .custom-wallpaper-item.selected .wallpaper-check { opacity: 1; }
                .wallpaper-check svg { width: 16px; height: 16px; }
                .wallpaper-name {
                    position: absolute; bottom: 0; left: 0; right: 0;
                    padding: 8px 12px; background: rgba(0,0,0,0.55);
                    color: #fff; font-size: 12px; text-align: center;
                    font-weight: 500; letter-spacing: 0.3px;
                }
                .custom-remove {
                    position: absolute; top: 6px; right: 6px;
                    width: 28px; height: 28px; background: #cc0000;
                    border: none; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    opacity: 0; transition: opacity 0.2s; padding: 0; z-index: 2;
                }
                .custom-wallpaper-item:hover .custom-remove { opacity: 0.9; }
                .custom-remove svg { width: 14px; height: 14px; }
                .custom-wallpapers {
                    display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
                    margin-bottom: 16px;
                }
                .empty-message {
                    grid-column: 1/-1; text-align: center;
                    padding: 30px 20px; color: #bbb; font-size: 14px;
                }
                .custom-upload {
                    padding: 24px; border: 2px dashed #ddd;
                    text-align: center; cursor: pointer;
                    transition: all 0.3s ease; background: #fafafa; margin-top: 8px;
                }
                .custom-upload:hover {
                    border-color: #cc0000; background: #fff5f5;
                }
                .custom-upload svg {
                    display: block; margin: 0 auto 8px;
                    width: 40px; height: 40px; stroke: #888;
                }
                .custom-upload .upload-text {
                    font-size: 14px; color: #888; font-weight: 500;
                }
                .custom-upload input[type="file"] { display: none; }

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

                @media (max-width: 500px) {
                    #settingsApp { padding: 24px 16px 60px; }
                    .settings-header h1 { font-size: 20px; }
                    .settings-dropdown { top: calc(var(--livebar-h, 44px) + 16px); right: 16px; min-width: 200px; }
                    .wallpaper-grid { gap: 10px; }
                    .custom-wallpapers { gap: 10px; }
                    .wallpaper-name { font-size: 10px; padding: 6px 8px; }
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
        const isAOD = isAODEnabled();

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

                <div class="settings-section-title" style="margin-top:32px;">Мои обои</div>
                <div class="custom-wallpapers" id="customWallpapersGrid"></div>
                <div class="custom-upload" id="customUpload">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    <span class="upload-text">Загрузить свои обои</span>
                    <input type="file" id="fileInput" accept="image/*" multiple />
                </div>
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

                <div class="toggle-row ${isAOD ? 'active' : ''}" id="aodToggle">
                    <div class="tr-left">
                        <div>
                            <div class="tr-text">AOD</div>
                            <div class="tr-sub">Always On Display (часы на заблокированном экране)</div>
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
            const section = document.getElementById('section' + sectionId.charAt(0).toUpperCase() + sectionId.slice(1));
            if (section) section.classList.add('active');
            
            if (sectionId === 'system') renderSystemInfo();
            else if (sectionId === 'security') renderSecurity();
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

        const upload = document.getElementById('customUpload');
        const fileInput = document.getElementById('fileInput');
        
        if (upload && fileInput) {
            upload.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', function(e) {
                if (this.files && this.files.length > 0) {
                    loadCustomWallpapers(this.files);
                    this.value = '';
                }
            });
        }

        const fsToggle = document.getElementById('fullscreenToggle');
        if (fsToggle) {
            fsToggle.addEventListener('click', function() {
                toggleFullscreen().then(function() {
                    if (isFullscreen()) fsToggle.classList.add('active');
                    else fsToggle.classList.remove('active');
                }).catch(function(err) {});
            });
        }

        const aodToggle = document.getElementById('aodToggle');
        if (aodToggle) {
            aodToggle.addEventListener('click', function() {
                const currentlyOn = isAODEnabled();
                if (currentlyOn) {
                    setAODEnabled(false);
                    aodToggle.classList.remove('active');
                } else {
                    showAODWarning(function(confirmed) {
                        if (confirmed) {
                            setAODEnabled(true);
                            aodToggle.classList.add('active');
                        }
                    });
                }
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
                const section = document.getElementById('section' + sectionId.charAt(0).toUpperCase() + sectionId.slice(1));
                if (section) section.classList.add('active');
                if (sectionId === 'system') renderSystemInfo();
                else if (sectionId === 'security') renderSecurity();
            }, 400);
        },
        selectWallpaper: function(id) {
            if (!id) return;
            saveWallpaper(id);
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