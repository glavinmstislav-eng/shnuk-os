// os-cache.js — кэширование системы в IndexedDB (блокирующее при первом запуске)

(function() {
    'use strict';

    const CACHE_VERSION_KEY = '__system_cache_version';
    const CACHE_VERSION = 'v6';
    const CACHE_API_NAME = 'shnuk-cache-v1';

    const CRITICAL_LIST = [
        'index.html',
        'e3.html',
        'sw.js',
        'os-storage.js'
    ];

    const SCRIPT_LIST = [
        'firebase-config.js',
        'auth.js',
        'file-storage.js',
        'os-cache.js',
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

    const ALL_ASSETS = CRITICAL_LIST
        .concat(SCRIPT_LIST)
        .concat(ICON_LIST)
        .concat(FONT_LIST);

    let cachingPromise = null;

    function log() {
        try { console.log.apply(console, ['[OSCache]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }
    function warn() {
        try { console.warn.apply(console, ['[OSCache]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    function waitForOSStorage(maxMs) {
        maxMs = maxMs || 8000;
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

    function isBinary(url) {
        return /\.(png|jpg|jpeg|gif|webp|svg|ico|ttf|woff|woff2|otf)$/i.test(url);
    }

    async function saveToIDB(url, asset) {
        try {
            await window.OSStorage.system.put('asset:' + url, asset);
            return true;
        } catch(e) {
            warn('saveToIDB fail', url, e);
            return false;
        }
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

    async function fetchAsset(url) {
        // __direct=1 заставляет SW пропустить этот запрос и отдать напрямую из сети
        const sep = url.indexOf('?') === -1 ? '?' : '&';
        const fullUrl = url + sep + '__direct=1&v=' + CACHE_VERSION;

        let resp;
        try {
            resp = await fetch(fullUrl, { cache: 'no-cache' });
        } catch(e) {
            warn('fetch exception', url, e);
            return null;
        }

        if (!resp || !resp.ok) {
            warn('fetch bad status', url, resp ? resp.status : 'null');
            return null;
        }

        // Проверка на HTML-заглушку от SW — если это index.html, а мы получили заглушку,
        // значит SW всё-таки перехватил (не должно случаться с __direct=1)
        if ((url === 'index.html' || url === 'e3.html') && resp.headers) {
            // ничего не делаем, просто читаем содержимое
        }

        return resp;
    }

    async function cacheOne(url) {
        try {
            const resp = await fetchAsset(url);
            if (!resp) {
                warn('пропущено (нет ответа):', url);
                return false;
            }

            try { await saveToCacheAPI(url, resp.clone()); } catch(e) {}

            if (isBinary(url)) {
                const buf = await resp.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let binary = '';
                const chunk = 0x8000;
                for (let i = 0; i < bytes.length; i += chunk) {
                    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
                }
                const b64 = btoa(binary);
                const ok = await saveToIDB(url, {
                    type: 'base64',
                    mime: detectMime(url),
                    data: b64
                });
                return ok;
            } else {
                const text = await resp.text();
                if (!text || text.length < 10) {
                    warn('пустое содержимое:', url);
                    return false;
                }
                const ok = await saveToIDB(url, { type: 'text', data: text });
                return ok;
            }
        } catch(e) {
            warn('cacheOne exception', url, e);
            return false;
        }
    }

    async function isCacheComplete() {
        try {
            const idx = await window.OSStorage.system.get('asset:index.html');
            if (!idx || !idx.data || idx.data.length < 100) return false;
            return true;
        } catch(e) {
            return false;
        }
    }

    async function ensureCached(onProgress) {
        if (cachingPromise) return cachingPromise;

        cachingPromise = (async function() {
            const ready = await waitForOSStorage();
            if (!ready) {
                warn('OSStorage недоступен');
                return { ok: false, reason: 'OSStorage недоступен' };
            }

            if (await isCacheComplete()) {
                log('кэш актуален');
                if (onProgress) onProgress(ALL_ASSETS.length, ALL_ASSETS.length);
                return { ok: true, cached: true, total: ALL_ASSETS.length };
            }

            log('начало кэширования', ALL_ASSETS.length, 'файлов');
            let done = 0;
            const total = ALL_ASSETS.length;
            let saved = 0;

            if (onProgress) onProgress(0, total);

            for (const url of ALL_ASSETS) {
                const ok = await cacheOne(url);
                if (ok) saved++;
                done++;
                if (onProgress) onProgress(done, total);
            }

            try {
                await window.OSStorage.system.put(CACHE_VERSION_KEY, CACHE_VERSION);
            } catch(e) {}

            const finalCheck = await isCacheComplete();
            log('кэширование завершено. Сохранено:', saved + '/' + total, 'index.html в IDB:', finalCheck);

            if (!finalCheck) {
                return {
                    ok: false,
                    reason: 'index.html не сохранился (' + saved + '/' + total + ')',
                    total: total,
                    done: done,
                    saved: saved
                };
            }

            return { ok: true, cached: false, total: total, done: done, saved: saved };
        })();

        return cachingPromise;
    }

    async function getAsset(url) {
        if (!window.OSStorage) return null;
        try {
            return await window.OSStorage.system.get('asset:' + url);
        } catch(e) {
            return null;
        }
    }

    async function forceRecache(onProgress) {
        cachingPromise = null;
        try {
            await window.OSStorage.system.delete(CACHE_VERSION_KEY);
        } catch(e) {}
        return ensureCached(onProgress);
    }

    window.OSCache = {
        ensureCached: ensureCached,
        forceRecache: forceRecache,
        getAsset: getAsset,
        needsCaching: async function() {
            const ready = await waitForOSStorage(2000);
            if (!ready) return false;
            return !(await isCacheComplete());
        },
        isCacheComplete: isCacheComplete,
        list: ALL_ASSETS
    };

    log('загружен, файлов:', ALL_ASSETS.length);

})();