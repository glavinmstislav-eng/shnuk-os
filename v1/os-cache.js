// os-cache.js — кэширование системы в IndexedDB

(function() {
    'use strict';

    const CACHE_VERSION_KEY = '__system_cache_version';
    const CACHE_VERSION = 'v1';

    const SCRIPT_LIST = [
        'firebase-config.js',
        'auth.js',
        'file-storage.js',
        'l.js',
        'onboarding.js',
        'live-bar.js',
        'windows.js',
        'security.js',
        'app-scanner.js',
        'store.js',
        'settings.js',
        'cooop.js',
        'os-storage.js',
        'os-cache.js',
        'time.js',
        'camera.js',
        'recorder.js',
        'browser.js',
        'game.js',
        'file.js',
        'svaer.js',
        'fullscreen.js',
        'widget-time.js',
        'site-store.js',
        'projects-store.js',
        'CooopShare.html'
    ];

    const ICON_LIST = [
        'icoon.png',
        'settings.png',
        'game1.png',
        'time.png',
        'file.png',
        'store.png',
        'shnuk-cam.png',
        'shnuk-recording.png',
        'shnuk-browser.png',
        'cooop.png',
        'wall1.png',
        'wall2.png',
        'wall3.png'
    ];

    const FONT_LIST = [
        'ST-SimpleSquare.ttf'
    ];

    const ALL_ASSETS = SCRIPT_LIST.concat(ICON_LIST).concat(FONT_LIST);

    function waitForOSStorage(maxMs) {
        maxMs = maxMs || 5000;
        return new Promise(function(resolve) {
            if (window.OSStorage) { resolve(true); return; }
            let elapsed = 0;
            const iv = setInterval(function() {
                elapsed += 100;
                if (window.OSStorage) {
                    clearInterval(iv);
                    resolve(true);
                } else if (elapsed >= maxMs) {
                    clearInterval(iv);
                    resolve(false);
                }
            }, 100);
        });
    }

    async function cacheOne(url) {
        try {
            const resp = await fetch(url + (url.indexOf('?') === -1 ? '?v=' + CACHE_VERSION : ''), { cache: 'no-cache' });
            if (!resp.ok) return false;
            const contentType = resp.headers.get('content-type') || '';
            if (contentType.indexOf('image') !== -1 || contentType.indexOf('font') !== -1 || url.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|ttf|woff|woff2|otf)$/i)) {
                const buf = await resp.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let binary = '';
                const chunk = 0x8000;
                for (let i = 0; i < bytes.length; i += chunk) {
                    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
                }
                const b64 = btoa(binary);
                const mime = url.match(/\.(png)$/i) ? 'image/png'
                    : url.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg'
                    : url.match(/\.(gif)$/i) ? 'image/gif'
                    : url.match(/\.(svg)$/i) ? 'image/svg+xml'
                    : url.match(/\.(webp)$/i) ? 'image/webp'
                    : url.match(/\.(ttf)$/i) ? 'font/ttf'
                    : 'application/octet-stream';
                await window.OSStorage.system.put('asset:' + url, { type: 'base64', mime: mime, data: b64 });
            } else {
                const text = await resp.text();
                await window.OSStorage.system.put('asset:' + url, { type: 'text', data: text });
            }
            return true;
        } catch(e) {
            return false;
        }
    }

    async function cacheAll() {
        const ready = await waitForOSStorage();
        if (!ready) return;

        let version = null;
        try { version = await window.OSStorage.system.get(CACHE_VERSION_KEY); } catch(e) {}
        if (version === CACHE_VERSION) {
            console.log('[OSCache] Кэш актуален');
            return;
        }

        console.log('[OSCache] Кэширую систему...');

        // Кэшируем index.html
        try {
            const resp = await fetch('index.html?v=' + CACHE_VERSION, { cache: 'no-cache' });
            if (resp.ok) {
                const html = await resp.text();
                await window.OSStorage.system.put('asset:index.html', { type: 'text', data: html });
            }
        } catch(e) {}

        // Кэшируем все ассеты по одному
        let ok = 0;
        for (const url of ALL_ASSETS) {
            const r = await cacheOne(url);
            if (r) ok++;
        }

        try {
            await window.OSStorage.system.put(CACHE_VERSION_KEY, CACHE_VERSION);
        } catch(e) {}

        console.log('[OSCache] Готово:', ok + '/' + ALL_ASSETS.length);
    }

    // Помощник для офлайн-запуска: получить ассет из IDB
    async function getAsset(url) {
        if (!window.OSStorage) return null;
        try {
            return await window.OSStorage.system.get('asset:' + url);
        } catch(e) {
            return null;
        }
    }

    window.OSCache = {
        cacheAll: cacheAll,
        getAsset: getAsset,
        list: ALL_ASSETS
    };

    // Запускаем кэширование после загрузки
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(cacheAll, 3000); });
    } else {
        setTimeout(cacheAll, 3000);
    }

})();