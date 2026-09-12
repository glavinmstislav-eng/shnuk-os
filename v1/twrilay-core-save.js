// twirlay-core-save.js — Система оффлайн-сохранения Shnuk OS

(function() {
    'use strict';

    const CACHE_NAME = 'shnuk-os-v1';
    const STORAGE_PREFIX = 'shnuk_cache_';
    const MANIFEST_KEY = 'shnuk_cache_manifest';
    const COMPLETE_KEY = 'shnuk_cache_complete';

    const CACHE_FILES = [
        '/',
        'index.html',
        'e3.html',
        'updateslock.js',
        'app-scanner.js',
        'store.js',
        'l.js',
        'svaer.js',
        'settings.js',
        'game.js',
        'time.js',
        'file.js',
        'windows.js',
        'widget-time.js',
        'security.js',
        'twirlay-core1.js',
        'twirlay-core-save.js',
        'site-store.html',
        'projects-store.html',
        'ST-SimpleSquare.ttf',
        'wall.png',
        'wall1.png',
        'wall2.png',
        'wall3.png',
        'settings.png',
        'game1.png',
        'calc.png',
        'time.png',
        'studio.png',
        'shnukmarket.png',
        'store.png',
        'logoos.png',
        'wake-up.mp3'
    ];

    let isSaving = false;

    // ============================================
    // ОПРЕДЕЛЕНИЕ ТИПА ФАЙЛА
    // ============================================
    function isBinary(filename) {
        return /\.(png|jpg|jpeg|gif|webp|ttf|woff|woff2|ico|mp3|mp4|wav|ogg|pdf)$/i.test(filename);
    }

    // ============================================
    // ПОЛУЧЕНИЕ АБСОЛЮТНОГО URL
    // ============================================
    function getAbsoluteUrl(filename) {
        try {
            return new URL(filename, window.location.href).href;
        } catch(e) {
            return filename;
        }
    }

    // ============================================
    // СОХРАНЕНИЕ ОДНОГО ФАЙЛА
    // ============================================
    function saveFile(filename) {
        return new Promise(function(resolve) {
            const url = filename + '?nocache=' + Date.now();
            const absoluteUrl = getAbsoluteUrl(filename);

            fetch(url, { cache: 'no-store' })
                .then(function(response) {
                    if (!response.ok) throw new Error('HTTP ' + response.status);

                    if (isBinary(filename)) {
                        return response.blob().then(function(blob) {
                            return new Promise(function(r) {
                                const reader = new FileReader();
                                reader.onload = function() { r(reader.result); };
                                reader.onerror = function() { r(null); };
                                reader.readAsDataURL(blob);
                            });
                        });
                    }

                    return response.text();
                })
                .then(function(content) {
                    if (!content) {
                        resolve({ success: false, filename: filename });
                        return;
                    }

                    try {
                        localStorage.setItem(STORAGE_PREFIX + filename, content);

                        if (absoluteUrl !== filename) {
                            try {
                                localStorage.setItem(STORAGE_PREFIX + absoluteUrl, content);
                            } catch(e) {}
                        }

                        resolve({ success: true, filename: filename, size: content.length });
                    } catch(e) {
                        resolve({ success: false, filename: filename, error: e.message });
                    }
                })
                .catch(function(err) {
                    resolve({ success: false, filename: filename, error: err.message });
                });
        });
    }

    // ============================================
    // СОХРАНЕНИЕ SELF (САМОГО СЕБЯ)
    // ============================================
    function saveSelf() {
        try {
            const selfUrl = 'twirlay-core-save.js';
            const absoluteUrl = getAbsoluteUrl(selfUrl);

            fetch(selfUrl + '?nocache=' + Date.now(), { cache: 'no-store' })
                .then(function(response) {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.text();
                })
                .then(function(content) {
                    try {
                        localStorage.setItem(STORAGE_PREFIX + selfUrl, content);
                        localStorage.setItem(STORAGE_PREFIX + absoluteUrl, content);
                        console.log('[Save] Self saved');
                    } catch(e) {}
                })
                .catch(function(err) {
                    console.log('[Save] Self save failed:', err.message);
                });
        } catch(e) {}
    }

    // ============================================
    // СОХРАНЕНИЕ ВСЕХ ФАЙЛОВ
    // ============================================
    function saveAll(options) {
        options = options || {};
        const onProgress = options.onProgress || function() {};
        const onComplete = options.onComplete || function() {};

        if (isSaving) {
            console.log('[Save] Already saving');
            return Promise.resolve();
        }

        isSaving = true;

        console.log('[Save] Starting. Files:', CACHE_FILES.length);

        const total = CACHE_FILES.length;
        const manifest = [];
        let current = 0;
        let errors = 0;

        saveSelf();

        return new Promise(function(resolve) {
            function next(index) {
                if (index >= CACHE_FILES.length) {
                    try {
                        localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
                        localStorage.setItem(COMPLETE_KEY, 'true');
                    } catch(e) {}

                    console.log('[Save] Complete. Saved:', manifest.length, 'Errors:', errors);

                    if ('caches' in window) {
                        caches.open(CACHE_NAME).then(function(cache) {
                            CACHE_FILES.forEach(function(f) {
                                cache.add(getAbsoluteUrl(f)).catch(function() {});
                            });
                        }).catch(function() {});
                    }

                    isSaving = false;
                    onComplete({ total: total, saved: manifest.length, errors: errors });
                    resolve(manifest);
                    return;
                }

                const filename = CACHE_FILES[index];
                onProgress(current, total, filename);

                saveFile(filename).then(function(result) {
                    current++;
                    if (result.success) {
                        manifest.push({
                            filename: filename,
                            size: result.size,
                            savedAt: Date.now()
                        });
                    } else {
                        errors++;
                    }
                    setTimeout(function() { next(index + 1); }, 5);
                });
            }

            next(0);
        });
    }

    // ============================================
    // ЗАГРУЗКА ФАЙЛА ИЗ КЕША
    // ============================================
    function loadFile(filename) {
        try {
            let content = localStorage.getItem(STORAGE_PREFIX + filename);
            if (content) return content;

            const absoluteUrl = getAbsoluteUrl(filename);
            content = localStorage.getItem(STORAGE_PREFIX + absoluteUrl);
            return content;
        } catch(e) {
            return null;
        }
    }

    // ============================================
    // ПРОВЕРКА НАЛИЧИЯ ВСЕХ ФАЙЛОВ
    // ============================================
    function checkAllFiles() {
        const missing = [];
        for (let i = 0; i < CACHE_FILES.length; i++) {
            if (!loadFile(CACHE_FILES[i])) {
                missing.push(CACHE_FILES[i]);
            }
        }
        return missing;
    }

    // ============================================
    // СТАТУС
    // ============================================
    function getStatus() {
        let complete = false;
        let manifest = [];
        let totalSize = 0;

        try {
            complete = localStorage.getItem(COMPLETE_KEY) === 'true';
            const saved = localStorage.getItem(MANIFEST_KEY);
            if (saved) manifest = JSON.parse(saved);
        } catch(e) {}

        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(STORAGE_PREFIX)) {
                    totalSize += (localStorage.getItem(key) || '').length;
                }
            }
        } catch(e) {}

        return {
            complete: complete,
            filesTotal: CACHE_FILES.length,
            filesSaved: manifest.length,
            totalSize: totalSize,
            totalSizeFormatted: formatBytes(totalSize),
            missing: checkAllFiles(),
            manifest: manifest
        };
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // ============================================
    // ОЧИСТКА КЕША
    // ============================================
    function clearAll() {
        const keys = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(STORAGE_PREFIX)) {
                    keys.push(key);
                }
            }
            keys.forEach(function(k) {
                try { localStorage.removeItem(k); } catch(e) {}
            });
        } catch(e) {}

        try {
            localStorage.removeItem(MANIFEST_KEY);
            localStorage.removeItem(COMPLETE_KEY);
        } catch(e) {}

        if ('caches' in window) {
            caches.delete(CACHE_NAME).catch(function() {});
        }

        console.log('[Save] Cleared. Removed:', keys.length);
        return keys.length;
    }

    // ============================================
    // SERVICE WORKER (INLINE)
    // ============================================
    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        if (location.protocol === 'file:') return;

        const swCode = `
            const CACHE_NAME = '${CACHE_NAME}';
            const FILES = ${JSON.stringify(CACHE_FILES)};

            self.addEventListener('install', function(e) {
                self.skipWaiting();
                e.waitUntil(
                    caches.open(CACHE_NAME).then(function(cache) {
                        return Promise.all(
                            FILES.map(function(f) {
                                return cache.add(f).catch(function() {});
                            })
                        );
                    })
                );
            });

            self.addEventListener('activate', function(e) {
                e.waitUntil(self.clients.claim());
            });

            self.addEventListener('fetch', function(e) {
                if (e.request.method !== 'GET') return;
                e.respondWith(
                    caches.match(e.request).then(function(response) {
                        if (response) return response;
                        return fetch(e.request).then(function(res) {
                            if (res && res.status === 200) {
                                const clone = res.clone();
                                caches.open(CACHE_NAME).then(function(cache) {
                                    cache.put(e.request, clone).catch(function() {});
                                });
                            }
                            return res;
                        }).catch(function() {
                            return new Response('Offline', { status: 503 });
                        });
                    })
                );
            });
        `;

        try {
            const blob = new Blob([swCode], { type: 'application/javascript' });
            const swUrl = URL.createObjectURL(blob);
            navigator.serviceWorker.register(swUrl, { scope: './' })
                .then(function() { console.log('[Save] SW registered'); })
                .catch(function(err) { console.log('[Save] SW failed:', err.message); });
        } catch(e) {
            console.log('[Save] SW error:', e.message);
        }
    }

    // ============================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================
    function init() {
        registerServiceWorker();

        const missing = checkAllFiles();
        if (missing.length > 0) {
            console.log('[Save] Missing files:', missing.length, '- starting save');
            saveAll();
        } else {
            console.log('[Save] All files cached');
        }
    }

    // ============================================
    // ЭКСПОРТ
    // ============================================
    window.TwirlaySave = {
        version: '1.0.0',
        init: init,
        saveAll: saveAll,
        saveFile: saveFile,
        saveSelf: saveSelf,
        loadFile: loadFile,
        checkAllFiles: checkAllFiles,
        getStatus: getStatus,
        clearAll: clearAll,
        files: CACHE_FILES,
        storagePrefix: STORAGE_PREFIX,
        formatBytes: formatBytes
    };

    console.log('[Save] Loaded. Files:', CACHE_FILES.length);

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 500);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(init, 500);
        });
    }

})();