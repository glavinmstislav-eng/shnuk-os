// settings.js — Приложение настроек

(function() {
    'use strict';

    console.log('[Settings] Загрузка...');

    let isOpen = false;
    let currentWallpaper = 'wall1.png';
    let customWallpapers = [];
    let currentTab = 'wallpaper';

    const WALLPAPER_KEY = 'shnuk_wallpaper';
    const WALLPAPER_NAME_KEY = 'shnuk_wallpaper_name';
    const CUSTOM_WALLPAPERS_KEY = 'shnuk_custom_wallpapers';
    const FULLSCREEN_KEY = 'shnuk_fullscreen';

    const wallpapers = [
        { id: 'wall1', name: 'Яркий день', file: 'wall1.png' },
        { id: 'wall2', name: 'Закат', file: 'wall2.png' },
        { id: 'wall3', name: 'Тёплая ночь', file: 'wall3.png' }
    ];

    // ============================================
    // УТИЛИТА: WINDOWS (с fallback)
    // ============================================
    function getWin() {
        if (window.Win) return window.Win;
        // Fallback на системные окна
        return {
            alert: (msg) => Promise.resolve(window.alert(msg)),
            confirm: (msg) => Promise.resolve(window.confirm(msg)),
            prompt: (msg, def) => Promise.resolve(window.prompt(msg, def)),
            notify: (msg) => console.log('[Notify]', msg)
        };
    }

    // ============================================
    // ХРАНИЛИЩЕ
    // ============================================
    function getSvaer() {
        if (typeof window.svaer !== 'undefined') return window.svaer;
        return {
            get: (key, def) => {
                try {
                    const val = localStorage.getItem(key);
                    return val ? JSON.parse(val) : def;
                } catch { return def; }
            },
            set: (key, val) => {
                try { localStorage.setItem(key, JSON.stringify(val)); return true; } 
                catch { return false; }
            }
        };
    }

    const svaer = getSvaer();

    // ============================================
    // ПОЛНОЭКРАННЫЙ РЕЖИМ
    // ============================================
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
        } catch(e) {
            console.warn('[Settings] Fullscreen error:', e);
        }
        return Promise.reject('Fullscreen not supported');
    }

    function exitFullscreen() {
        try {
            if (document.exitFullscreen) return document.exitFullscreen();
            if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
            if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
            if (document.msExitFullscreen) return document.msExitFullscreen();
        } catch(e) {
            console.warn('[Settings] Exit fullscreen error:', e);
        }
        return Promise.reject('Exit fullscreen not supported');
    }

    function toggleFullscreen() {
        if (isFullscreen()) {
            return exitFullscreen().then(function() {
                svaer.set(FULLSCREEN_KEY, false);
            });
        } else {
            return enterFullscreen().then(function() {
                svaer.set(FULLSCREEN_KEY, true);
            });
        }
    }

    // Полноэкранный режим включён по умолчанию
    function tryRestoreFullscreen() {
        const saved = svaer.get(FULLSCREEN_KEY, true); // true по умолчанию
        if (saved && !isFullscreen()) {
            const tryOnce = function() {
                if (svaer.get(FULLSCREEN_KEY, true) && !isFullscreen()) {
                    enterFullscreen().catch(() => {});
                }
                document.removeEventListener('click', tryOnce);
                document.removeEventListener('touchstart', tryOnce);
                document.removeEventListener('keydown', tryOnce);
            };
            document.addEventListener('click', tryOnce, { once: true });
            document.addEventListener('touchstart', tryOnce, { once: true });
            document.addEventListener('keydown', tryOnce, { once: true });
        }
    }

    // ============================================
    // ЗАГРУЗКА ДАННЫХ
    // ============================================
    function loadData() {
        try {
            currentWallpaper = svaer.get(WALLPAPER_KEY, 'wall1.png');
            customWallpapers = svaer.get(CUSTOM_WALLPAPERS_KEY, []);
        } catch(e) {
            currentWallpaper = 'wall1.png';
            customWallpapers = [];
        }
    }

    // ============================================
    // ОБОИ
    // ============================================
    function saveWallpaper(id) {
        currentWallpaper = id;
        svaer.set(WALLPAPER_KEY, id);
        
        let name = id;
        const found = wallpapers.find(w => w.id === id);
        if (found) name = found.name;
        else {
            const custom = customWallpapers.find(w => w.id === id);
            if (custom) name = custom.name;
        }
        svaer.set(WALLPAPER_NAME_KEY, name);
        
        applyWallpaper(id);
        renderWallpapers();
        renderCustomWallpapers();
    }

    function applyWallpaper(id) {
        let url = null;
        const found = wallpapers.find(w => w.id === id);
        if (found) {
            url = found.file;
        } else {
            const custom = customWallpapers.find(w => w.id === id);
            if (custom) url = custom.data;
        }
        if (url) {
            const bg = document.getElementById('appBackground');
            if (bg) bg.style.backgroundImage = `url('${url}')`;
            localStorage.setItem('app_wallpaper', url);
        }
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
                reader.readAsDataURL(file);
            }));
        });
        
        Promise.all(promises).then(() => {
            customWallpapers = customWallpapers.concat(newItems);
            svaer.set(CUSTOM_WALLPAPERS_KEY, customWallpapers);
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
        svaer.set(CUSTOM_WALLPAPERS_KEY, customWallpapers);
        if (currentWallpaper === id) {
            saveWallpaper(customWallpapers.length ? customWallpapers[0].id : 'wall1.png');
        } else {
            renderCustomWallpapers();
        }
    }

    // ============================================
    // РЕНДЕРИНГ
    // ============================================
    function renderWallpapers() {
        const grid = document.getElementById('wallpaperGrid');
        if (!grid) return;
        grid.innerHTML = '';
        
        wallpapers.forEach(w => {
            const div = document.createElement('div');
            div.className = 'wallpaper-item' + (currentWallpaper === w.id ? ' selected' : '');
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
            div.className = 'custom-wallpaper-item' + (currentWallpaper === w.id ? ' selected' : '');
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

    // ============================================
    // СИСТЕМНАЯ ИНФОРМАЦИЯ
    // ============================================
    function renderSystemInfo() {
        const container = document.getElementById('systemInfo');
        if (!container) return;

        let filesCount = 0;
        try {
            const files = localStorage.getItem('shnuk_downloaded_files');
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
                <span class="info-label">Загружено файлов</span>
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

    // ============================================
    // ДЕЙСТВИЯ
    // ============================================
    async function reinstallSystem() {
        const Win = getWin();
        
        if (typeof Downloader === 'undefined') {
            await Win.alert('Загрузчик недоступен. Обновите страницу.', { title: 'Ошибка' });
            return;
        }

        const confirmed = await Win.confirm(
            'Все системные файлы будут перезаписаны.\n\n' +
            'Ваши данные сохранятся:\n' +
            '• Установленные приложения\n' +
            '• Обои\n' +
            '• Файлы\n' +
            '• Виджеты',
            {
                title: 'Переустановить систему?',
                okText: 'Переустановить',
                cancelText: 'Отмена'
            }
        );

        if (!confirmed) return;

        console.log('[Settings] Переустановка...');
        closeSettings();

        setTimeout(function() {
            if (typeof Downloader.forceReload === 'function') {
                Downloader.forceReload();
            } else {
                const STORAGE_PREFIX = 'shnuk_cache_';
                const keysToRemove = [];
                
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (key.startsWith(STORAGE_PREFIX) || 
                        key === 'shnuk_downloaded_files' || 
                        key === 'shnuk_download_complete')) {
                        keysToRemove.push(key);
                    }
                }
                
                keysToRemove.forEach(k => localStorage.removeItem(k));
                location.reload();
            }
        }, 500);
    }

    async function clearAllData() {
        const Win = getWin();

        const confirmed = await Win.confirm(
            'Будут удалены ВСЕ данные:\n' +
            '• Установленные приложения\n' +
            '• Обои\n' +
            '• Файлы\n' +
            '• Виджеты\n' +
            '• Пароль\n\n' +
            'Система будет переустановлена с нуля.',
            {
                title: '⚠️ Полный сброс',
                okText: 'Продолжить',
                cancelText: 'Отмена',
                danger: true
            }
        );

        if (!confirmed) return;

        const confirmed2 = await Win.confirm(
            'Это действие НЕЛЬЗЯ отменить!\n\nВы уверены?',
            {
                title: '⚠️ Последнее предупреждение',
                okText: 'Да, сбросить всё',
                cancelText: 'Нет, отмена',
                danger: true
            }
        );

        if (!confirmed2) return;

        console.log('[Settings] Полная очистка...');
        
        try {
            localStorage.clear();
            sessionStorage.clear();
        } catch(e) {}
        
        closeSettings();
        setTimeout(() => location.reload(), 300);
    }

    // ============================================
    // UI
    // ============================================
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
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
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
                
                .settings-header {
                    display: flex; justify-content: space-between; align-items: center;
                    max-width: 640px; margin: 0 auto 24px;
                    padding-bottom: 16px; border-bottom: 2px solid #f0f0f0;
                }
                .settings-header h1 {
                    font-size: 24px; font-weight: 600; color: #1a1a1a;
                    letter-spacing: -0.3px;
                }
                .settings-close {
                    background: none; border: none; cursor: pointer;
                    padding: 8px; color: #999; transition: color 0.2s;
                    display: flex; align-items: center; justify-content: center;
                }
                .settings-close:hover { color: #cc0000; }
                .settings-close svg { display: block; width: 28px; height: 28px; }

                .settings-tabs {
                    display: flex; gap: 4px;
                    max-width: 640px; margin: 0 auto 32px;
                    border-bottom: 2px solid #f0f0f0;
                }
                .settings-tabs button {
                    padding: 12px 24px; background: none; border: none;
                    border-bottom: 3px solid transparent; cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 14px; color: #888;
                    transition: all 0.2s; margin-bottom: -2px;
                }
                .settings-tabs button:hover { color: #1a1a1a; }
                .settings-tabs button.active {
                    color: #cc0000; border-bottom-color: #cc0000;
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

                .fullscreen-toggle {
                    display: flex; align-items: center;
                    justify-content: space-between;
                    padding: 16px 20px; background: #f8f8f8;
                    border: 2px solid #e0e0e0; margin-bottom: 16px;
                    cursor: pointer; transition: all 0.2s;
                }
                .fullscreen-toggle:hover {
                    border-color: #cc0000; background: #fff5f5;
                }
                .fullscreen-toggle .fs-left {
                    display: flex; align-items: center; gap: 12px;
                }
                .fullscreen-toggle .fs-icon {
                    font-size: 24px;
                }
                .fullscreen-toggle .fs-text {
                    font-size: 15px; font-weight: 600; color: #1a1a1a;
                }
                .fullscreen-toggle .fs-sub {
                    font-size: 12px; color: #888; margin-top: 2px;
                }
                .fullscreen-toggle .fs-switch {
                    width: 48px; height: 28px; background: #ddd;
                    border-radius: 14px; position: relative;
                    transition: background 0.3s; flex-shrink: 0;
                }
                .fullscreen-toggle .fs-switch::after {
                    content: ''; position: absolute;
                    top: 2px; left: 2px;
                    width: 24px; height: 24px;
                    background: #fff; border-radius: 50%;
                    transition: transform 0.3s;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
                .fullscreen-toggle.active .fs-switch { background: #cc0000; }
                .fullscreen-toggle.active .fs-switch::after {
                    transform: translateX(20px);
                }

                @media (max-width: 500px) {
                    #settingsApp { padding: 24px 16px 60px; }
                    .settings-header h1 { font-size: 20px; }
                    .wallpaper-grid { gap: 10px; }
                    .custom-wallpapers { gap: 10px; }
                    .wallpaper-name { font-size: 10px; padding: 6px 8px; }
                    .settings-tabs button { padding: 10px 14px; font-size: 12px; }
                    .system-info { padding: 12px 16px; }
                    .system-info .info-row { padding: 8px 0; font-size: 13px; }
                    .action-card { padding: 16px; }
                    .action-card .action-title { font-size: 15px; }
                    .action-card button { padding: 8px 18px; font-size: 13px; }
                    .fullscreen-toggle { padding: 14px 16px; }
                    .fullscreen-toggle .fs-text { font-size: 14px; }
                }
            `;
            document.head.appendChild(style);
        }

        const isFs = isFullscreen();

        container.innerHTML = `
            <div class="settings-header">
                <h1>Настройки</h1>
                <button class="settings-close" id="settingsCloseBtn">
                    <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
                </button>
            </div>

            <div class="settings-tabs">
                <button class="active" data-tab="wallpaper">Обои</button>
                <button data-tab="system">Система</button>
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

            <div class="settings-section" id="sectionSystem">
                <div class="settings-section-title">Отображение</div>

                <div class="fullscreen-toggle ${isFs ? 'active' : ''}" id="fullscreenToggle">
                    <div class="fs-left">
                        <span class="fs-icon">⛶</span>
                        <div>
                            <div class="fs-text">Полноэкранный режим</div>
                            <div class="fs-sub">Скрыть элементы браузера</div>
                        </div>
                    </div>
                    <div class="fs-switch"></div>
                </div>

                <div class="settings-section-title" style="margin-top:32px;">Информация о системе</div>
                <div class="system-info" id="systemInfo"></div>

                <div class="settings-section-title" style="margin-top:32px;">Обслуживание</div>

                <div class="action-card">
                    <div class="action-title">🔄 Переустановить систему</div>
                    <div class="action-desc">
                        Перезагрузит все системные файлы заново. 
                        Ваши данные (приложения, обои, файлы) сохранятся.
                    </div>
                    <button id="reinstallBtn">Переустановить</button>
                </div>

                <div class="action-card danger-card">
                    <div class="action-title" style="color: #cc0000;">⚠️ Полный сброс</div>
                    <div class="action-desc">
                        Удалит ВСЕ данные: приложения, обои, файлы, виджеты, пароль.
                        Система будет переустановлена с нуля.
                    </div>
                    <button class="danger" id="clearAllBtn">Сбросить всё</button>
                </div>
            </div>
        `;

        document.body.appendChild(container);
        isOpen = true;

        // Обработчики
        document.getElementById('settingsCloseBtn').addEventListener('click', closeSettings);

        container.querySelectorAll('.settings-tabs button').forEach(btn => {
            btn.addEventListener('click', function() {
                container.querySelectorAll('.settings-tabs button').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                
                currentTab = this.dataset.tab;
                
                container.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
                const section = document.getElementById('section' + currentTab.charAt(0).toUpperCase() + currentTab.slice(1));
                if (section) section.classList.add('active');
                
                if (currentTab === 'system') {
                    renderSystemInfo();
                }
            });
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
                    if (isFullscreen()) {
                        fsToggle.classList.add('active');
                    } else {
                        fsToggle.classList.remove('active');
                    }
                }).catch(function(err) {
                    console.warn('[Settings] Fullscreen ошибка:', err);
                });
            });
        }

        const reinstallBtn = document.getElementById('reinstallBtn');
        if (reinstallBtn) {
            reinstallBtn.addEventListener('click', reinstallSystem);
        }

        const clearAllBtn = document.getElementById('clearAllBtn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', clearAllData);
        }

        renderAll();
        if (currentWallpaper) applyWallpaper(currentWallpaper);
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
                closeSettings();
                document.removeEventListener('keydown', onEsc);
            }
        };
        document.addEventListener('keydown', onEsc);

        console.log('[Settings] ✅ UI создан');
    }

    function closeSettings() {
        const el = document.getElementById('settingsApp');
        if (el) {
            el.style.opacity = '0';
            setTimeout(function() {
                el.remove();
                isOpen = false;
            }, 300);
        }
    }

    // ============================================
    // ЭКСПОРТ
    // ============================================
    window.settingsInit = function() {
        console.log('[Settings] Открытие...');
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

    // Автовосстановление полного экрана при запуске (включён по умолчанию)
    tryRestoreFullscreen();

    console.log('[Settings] ✅ Загружено');

})();