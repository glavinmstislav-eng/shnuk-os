// twirlay-core-save.js — Система оффлайн-сохранения для Shnuk OS

(function() {
    'use strict';

    const STORAGE_PREFIX = 'shnuk_cache_';
    const FILES_LIST_KEY = 'shnuk_downloaded_files';
    const COMPLETE_KEY = 'shnuk_download_complete';
    const VERSION_KEY = 'shnuk_cache_version';

    const CACHE_VERSION = '1.0.0';

    const SYSTEM_FILES = [
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
        'updateslock.js',
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

    // Проверка нужно ли перекешировать
    function needsRecache() {
        try {
            const savedVersion = localStorage.getItem(VERSION_KEY);
            const complete = localStorage.getItem(COMPLETE_KEY) === 'true';
            if (savedVersion !== CACHE_VERSION) return true;
            if (!complete) return true;
            return false;
        } catch(e) {
            return true;
        }
    }

    // Определить бинарный ли файл
    function isBinaryFile(filename) {
        return /\.(png|jpg|jpeg|gif|webp|bmp|svg|ico|ttf|woff|woff2|otf|eot|mp3|wav|ogg|mp4|webm|pdf|zip)$/i.test(filename);
    }

    // Скачать один файл
    function downloadFile(filename) {
        return new Promise(function(resolve) {
            const url = filename + '?cache=' + Date.now();
            
            fetch(url, { cache: 'no-store' })
                .then(function(response) {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    
                    if (isBinaryFile(filename)) {
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
                        resolve({ success: true, filename: filename });
                    } catch(e) {
                        resolve({ success: false, filename: filename, error: e.message });
                    }
                })
                .catch(function(err) {
                    resolve({ success: false, filename: filename, error: err.message });
                });
        });
    }

    // Скачать все файлы
    function downloadAll(onProgress) {
        return new Promise(function(resolve) {
            const total = SYSTEM_FILES.length;
            const downloaded = [];
            const errors = [];
            let current = 0;

            function next(index) {
                if (index >= SYSTEM_FILES.length) {
                    try {
                        localStorage.setItem(FILES_LIST_KEY, JSON.stringify(downloaded));
                        localStorage.setItem(COMPLETE_KEY, 'true');
                        localStorage.setItem(VERSION_KEY, CACHE_VERSION);
                    } catch(e) {}
                    
                    resolve({
                        total: total,
                        downloaded: downloaded.length,
                        errors: errors.length,
                        errorList: errors
                    });
                    return;
                }

                const filename = SYSTEM_FILES[index];
                
                downloadFile(filename).then(function(result) {
                    current++;
                    if (result.success) {
                        downloaded.push(filename);
                    } else {
                        errors.push(filename);
                    }
                    
                    if (onProgress) {
                        onProgress(current, total, filename, result.success);
                    }
                    
                    setTimeout(function() { next(index + 1); }, 5);
                });
            }

            next(0);
        });
    }

    // Очистить весь кеш
    function clearCache() {
        let removed = 0;
        const keysToRemove = [];
        
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key) continue;
                if (key.startsWith(STORAGE_PREFIX) || 
                    key === FILES_LIST_KEY || 
                    key === COMPLETE_KEY ||
                    key === VERSION_KEY) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(function(k) {
                try {
                    localStorage.removeItem(k);
                    removed++;
                } catch(e) {}
            });
        } catch(e) {}
        
        // Очищаем Cache API
        if ('caches' in window) {
            caches.keys().then(function(names) {
                names.forEach(function(name) {
                    caches.delete(name);
                });
            });
        }
        
        return removed;
    }

    // Получить закешированный файл
    function getCachedFile(filename) {
        try {
            return localStorage.getItem(STORAGE_PREFIX + filename);
        } catch(e) {
            return null;
        }
    }

    // Проверить закеширован ли файл
    function isCached(filename) {
        try {
            return localStorage.getItem(STORAGE_PREFIX + filename) !== null;
        } catch(e) {
            return false;
        }
    }

    // Список закешированных файлов
    function getCachedFilesList() {
        const list = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(STORAGE_PREFIX)) {
                    list.push(key.replace(STORAGE_PREFIX, ''));
                }
            }
        } catch(e) {}
        return list;
    }

    // Размер кеша в байтах
    function getCacheSize() {
        let size = 0;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(STORAGE_PREFIX)) {
                    const value = localStorage.getItem(key);
                    if (value) size += value.length + key.length;
                }
            }
        } catch(e) {}
        return size;
    }

    // Форматирование размера
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Автоматическая загрузка при первом запуске
    function autoInit() {
        if (needsRecache()) {
            console.log('[Cache] Первый запуск, загрузка ' + SYSTEM_FILES.length + ' файлов');
            clearCache();
            
            downloadAll(function(current, total, filename, success) {
                console.log('[Cache] ' + current + '/' + total + ' ' + filename + (success ? '' : ' (ошибка)'));
            }).then(function(result) {
                console.log('[Cache] Завершено. Успешно: ' + result.downloaded + ', ошибок: ' + result.errors);
            });
        } else {
            console.log('[Cache] Кеш актуален');
        }
    }

    // Экспорт
    window.TwirlayCache = {
        version: CACHE_VERSION,
        files: SYSTEM_FILES,
        
        init: autoInit,
        needsRecache: needsRecache,
        downloadAll: downloadAll,
        downloadFile: downloadFile,
        clearCache: clearCache,
        
        getFile: getCachedFile,
        isCached: isCached,
        getList: getCachedFilesList,
        getSize: getCacheSize,
        formatSize: formatBytes
    };

    // Автозапуск
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInit);
    } else {
        autoInit();
    }

})();