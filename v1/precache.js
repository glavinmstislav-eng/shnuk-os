// precache.js — предзагрузка системы в IndexedDB

(function() {
    'use strict';

    const CACHE_VERSION = 'v4';
    const CACHE_VERSION_KEY = '__system_cache_version';
    const CACHE_API_NAME = 'shnuk-cache-v1';

    const CRITICAL = [
        'index.html',
        'e3.html',
        'sw.js'
    ];

    const SCRIPTS = [
        'os-storage.js',
        'firebase-config.js',
        'auth.js',
        'file-storage.js',
        'os-cache.js',
        'precache.js',
        'l.js',
        'onboarding.js',
        'live-bar.js',
        'windows.js',
        'security.js',
        'app-scanner.js',
        'store.js',
        'settings.js',
        'cooop.js',
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

    const ICONS = [
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

    const FONTS = [
        'ST-SimpleSquare.ttf'
    ];

    const ALL = CRITICAL.concat(SCRIPTS).concat(ICONS).concat(FONTS);

    // ------- IndexedDB helpers -------

    function openIDB() {
        return new Promise(function(resolve, reject) {
            const req = indexedDB.open('shnuk_os', 1);
            req.onupgradeneeded = function(e) {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('system')) {
                    db.createObjectStore('system', { keyPath: 'key' });
                }
            };
            req.onsuccess = function() { resolve(req.result); };
            req.onerror = function() { reject(req.error); };
        });
    }

    function idbGet(key) {
        return openIDB().then(function(db) {
            return new Promise(function(resolve) {
                try {
                    const t = db.transaction('system', 'readonly');
                    const req = t.objectStore('system').get(key);
                    req.onsuccess = function() {
                        const row = req.result;
                        resolve(row ? row.data : null);
                    };
                    req.onerror = function() { resolve(null); };
                } catch(e) { resolve(null); }
            });
        });
    }

    function idbPut(key, data) {
        return openIDB().then(function(db) {
            return new Promise(function(resolve) {
                try {
                    const t = db.transaction('system', 'readwrite');
                    t.objectStore('system').put({ key: key, data: data, updated: Date.now() });
                    t.oncomplete = function() { resolve(true); };
                    t.onerror = function() { resolve(false); };
                    t.onabort = function() { resolve(false); };
                } catch(e) { resolve(false); }
            });
        });
    }

    // ------- Утилиты -------

    function isBinary(url) {
        return /\.(png|jpg|jpeg|gif|webp|svg|ico|ttf|woff|woff2|otf)$/i.test(url);
    }

    function detectMime(url) {
        if (/\.png$/i.test(url)) return 'image/png';
        if (/\.(jpg|jpeg)$/i.test(url)) return 'image/jpeg';
        if (/\.gif$/i.test(url)) return 'image/gif';
        if (/\.svg$/i.test(url)) return 'image/svg+xml';
        if (/\.webp$/i.test(url)) return 'image/webp';
        if (/\.ico$/i.test(url)) return 'image/x-icon';
        if (/\.ttf$/i.test(url)) return 'font/ttf';
        if (/\.woff2?$/i.test(url)) return 'font/woff2';
        if (/\.otf$/i.test(url)) return 'font/otf';
        return 'application/octet-stream';
    }

    function bytesToBase64(bytes) {
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    }

    async function saveToCacheAPI(url, response) {
        if (!('caches' in window)) return false;
        try {
            const cache = await caches.open(CACHE_API_NAME);
            await cache.put(url, response.clone());
            return true;
        } catch(e) {
            return false;
        }
    }

    async function fetchAndStore(url) {
        const fullUrl = url + (url.indexOf('?') === -1 ? '?v=' + CACHE_VERSION : '');
        const resp = await fetch(fullUrl, { cache: 'no-cache' });
        if (!resp || !resp.ok) throw new Error('HTTP ' + resp.status + ' for ' + url);

        // Параллельно кладём в Cache API
        saveToCacheAPI(url, resp.clone());

        if (isBinary(url)) {
            const buf = await resp.arrayBuffer();
            const bytes = new Uint8Array(buf);
            const b64 = bytesToBase64(bytes);
            const ok = await idbPut('asset:' + url, {
                type: 'base64',
                mime: detectMime(url),
                data: b64
            });
            if (!ok) throw new Error('IDB put failed for ' + url);
        } else {
            const text = await resp.text();
            const ok = await idbPut('asset:' + url, { type: 'text', data: text });
            if (!ok) throw new Error('IDB put failed for ' + url);
        }
        return true;
    }

    // ------- Публичный API -------

    async function isReady() {
        try {
            const v = await idbGet(CACHE_VERSION_KEY);
            const idx = await idbGet('asset:index.html');
            return v === CACHE_VERSION && !!(idx && idx.data);
        } catch(e) {
            return false;
        }
    }

    async function downloadAll(onProgress) {
        const total = ALL.length;
        let done = 0;
        let failed = [];

        for (const url of ALL) {
            try {
                await fetchAndStore(url);
            } catch(e) {
                failed.push(url);
                console.warn('[Precache] Не удалось:', url, e.message);
            }
            done++;
            if (typeof onProgress === 'function') {
                onProgress(done, total, url);
            }
        }

        // Помечаем версию только если index.html скачан
        const idx = await idbGet('asset:index.html');
        if (idx && idx.data) {
            await idbPut(CACHE_VERSION_KEY, CACHE_VERSION);
        }

        return { done: done - failed.length, total: total, failed: failed };
    }

    async function getAsset(url) {
        return idbGet('asset:' + url);
    }

    window.Precache = {
        list: ALL,
        isReady: isReady,
        downloadAll: downloadAll,
        getAsset: getAsset,
        version: CACHE_VERSION
    };

})();