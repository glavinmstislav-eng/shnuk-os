// updates.js — Проверка изменений в файлах системы

(function() {
    'use strict';

    console.log('[Updates] Загрузка системы проверки обновлений...');

    // URL к файлу с хешами (на GitHub Pages)
    const MANIFEST_URL = 'https://glavinmstislav-eng.github.io/shnuk-os/manifest.json';
    
    // Fallback локальный manifest (для тестирования)
    const LOCAL_MANIFEST = 'manifest.json';

    const CURRENT_HASHES_KEY = 'shnuk_file_hashes';
    const CURRENT_VERSION_KEY = 'shnuk_system_version';

    let updateInfo = null;
    let isChecking = false;
    let manifestCache = null;

    // ============================================
    // ВЫЧИСЛЕНИЕ ХЕША СТРОКИ (простой hash)
    // ============================================
    function hashString(str) {
        let hash = 0;
        if (str.length === 0) return '0';
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    // ============================================
    // ПОЛУЧЕНИЕ ТЕКУЩИХ ХЕШЕЙ ИЗ LOCALSTORAGE
    // ============================================
    function getCurrentHashes() {
        try {
            const saved = localStorage.getItem(CURRENT_HASHES_KEY);
            return saved ? JSON.parse(saved) : {};
        } catch(e) {
            return {};
        }
    }

    function saveCurrentHashes(hashes) {
        try {
            localStorage.setItem(CURRENT_HASHES_KEY, JSON.stringify(hashes));
        } catch(e) {
            console.error('[Updates] Ошибка сохранения хешей:', e);
        }
    }

    // ============================================
    // ЗАГРУЗКА MANIFEST (список файлов + хеши)
    // ============================================
    function loadManifest() {
        if (manifestCache) {
            return Promise.resolve(manifestCache);
        }

        // Пробуем сначала основной URL
        return fetch(MANIFEST_URL + '?t=' + Date.now(), {
            cache: 'no-store',
            mode: 'cors'
        })
            .then(function(response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            })
            .then(function(data) {
                manifestCache = data;
                console.log('[Updates] ✅ Manifest загружен с сервера');
                return data;
            })
            .catch(function(err) {
                console.warn('[Updates] Не удалось загрузить с сервера, пробуем локальный:', err.message);
                // Fallback на локальный
                return fetch(LOCAL_MANIFEST + '?t=' + Date.now())
                    .then(function(response) {
                        if (!response.ok) throw new Error('HTTP ' + response.status);
                        return response.json();
                    })
                    .then(function(data) {
                        manifestCache = data;
                        console.log('[Updates] ✅ Manifest загружен локально');
                        return data;
                    })
                    .catch(function(err2) {
                        console.error('[Updates] ❌ Не удалось загрузить manifest:', err2.message);
                        throw err2;
                    });
            });
    }

    // ============================================
    // ПОЛУЧЕНИЕ СОДЕРЖИМОГО ФАЙЛА
    // ============================================
    function getFileContent(filename) {
        // Сначала проверяем localStorage (кеш)
        const cached = localStorage.getItem('shnuk_cache_' + filename);
        if (cached) {
            return Promise.resolve(cached);
        }
        
        // Иначе скачиваем
        return fetch(filename + '?t=' + Date.now(), { cache: 'no-store' })
            .then(function(response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.text();
            });
    }

    // ============================================
    // ПРОВЕРКА ОБНОВЛЕНИЙ
    // ============================================
    function checkForUpdates() {
        if (isChecking) {
            return Promise.resolve(updateInfo);
        }
        isChecking = true;

        console.log('[Updates] 🔍 Проверка обновлений...');

        return loadManifest()
            .then(function(manifest) {
                const currentHashes = getCurrentHashes();
                const serverHashes = manifest.files || {};
                const serverVersion = manifest.version || '1.0.0';
                
                const changedFiles = [];
                const newFiles = [];
                const removedFiles = [];
                
                // Проверяем каждый файл в манифесте
                const promises = Object.keys(serverHashes).map(function(filename) {
                    const serverHash = serverHashes[filename];
                    const localHash = currentHashes[filename];
                    
                    if (!localHash) {
                        // Файл ещё не был проверен — считаем новым
                        newFiles.push(filename);
                        return Promise.resolve();
                    }
                    
                    if (localHash !== serverHash) {
                        // Файл изменился
                        changedFiles.push({
                            filename: filename,
                            oldHash: localHash,
                            newHash: serverHash
                        });
                    }
                    
                    return Promise.resolve();
                });
                
                // Проверяем удалённые файлы
                Object.keys(currentHashes).forEach(function(filename) {
                    if (!serverHashes[filename]) {
                        removedFiles.push(filename);
                    }
                });
                
                return Promise.all(promises).then(function() {
                    const hasUpdate = changedFiles.length > 0 || newFiles.length > 0;
                    
                    updateInfo = {
                        available: hasUpdate,
                        current: {
                            version: getCurrentVersion().version,
                            filesCount: Object.keys(currentHashes).length
                        },
                        latest: {
                            version: serverVersion,
                            description: manifest.description || 'Обновление системы',
                            changelog: manifest.changelog || [],
                            date: manifest.date || new Date().toISOString(),
                            build: manifest.build || 1
                        },
                        changedFiles: changedFiles,
                        newFiles: newFiles,
                        removedFiles: removedFiles,
                        totalChanges: changedFiles.length + newFiles.length,
                        checkedAt: new Date().toISOString(),
                        manifest: manifest
                    };
                    
                    isChecking = false;
                    
                    console.log('[Updates] ✅ Проверка завершена');
                    console.log('[Updates] Изменённых файлов:', changedFiles.length);
                    console.log('[Updates] Новых файлов:', newFiles.length);
                    console.log('[Updates] Удалённых файлов:', removedFiles.length);
                    
                    if (changedFiles.length > 0) {
                        console.log('[Updates] Изменённые:', changedFiles.map(f => f.filename).join(', '));
                    }
                    if (newFiles.length > 0) {
                        console.log('[Updates] Новые:', newFiles.join(', '));
                    }
                    
                    return updateInfo;
                });
            })
            .catch(function(err) {
                console.error('[Updates] ❌ Ошибка:', err);
                updateInfo = {
                    available: false,
                    error: err.message,
                    checkedAt: new Date().toISOString()
                };
                isChecking = false;
                return updateInfo;
            });
    }

    // ============================================
    // СОХРАНЕНИЕ ХЕШЕЙ ПОСЛЕ ОБНОВЛЕНИЯ
    // ============================================
    function saveHashesFromManifest(manifest) {
        if (!manifest || !manifest.files) return false;
        
        const hashes = {};
        Object.keys(manifest.files).forEach(function(filename) {
            hashes[filename] = manifest.files[filename];
        });
        
        saveCurrentHashes(hashes);
        
        // Сохраняем версию
        try {
            localStorage.setItem(CURRENT_VERSION_KEY, JSON.stringify({
                version: manifest.version || '1.0.0',
                build: manifest.build || 1,
                date: manifest.date || new Date().toISOString()
            }));
        } catch(e) {}
        
        console.log('[Updates] ✅ Хеши сохранены:', Object.keys(hashes).length);
        return true;
    }

    // ============================================
    // ПОЛУЧЕНИЕ ТЕКУЩЕЙ ВЕРСИИ
    // ============================================
    function getCurrentVersion() {
        try {
            const saved = localStorage.getItem(CURRENT_VERSION_KEY);
            if (saved) return JSON.parse(saved);
        } catch(e) {}
        return {
            version: '1.0.0',
            build: 1,
            date: '2024-01-01'
        };
    }

    // ============================================
    // ПРИМЕНЕНИЕ ОБНОВЛЕНИЯ
    // ============================================
    function applyUpdate() {
        if (!updateInfo || !updateInfo.manifest) return false;
        
        const result = saveHashesFromManifest(updateInfo.manifest);
        
        if (result) {
            console.log('[Updates] ✅ Обновление применено');
            manifestCache = null; // Сброс кеша
            return true;
        }
        return false;
    }

    // ============================================
    // СБРОС ВСЕХ ХЕШЕЙ (для тестирования)
    // ============================================
    function resetHashes() {
        try {
            localStorage.removeItem(CURRENT_HASHES_KEY);
            console.log('[Updates] 🗑️ Все хеши сброшены');
            manifestCache = null;
            updateInfo = null;
            return true;
        } catch(e) {
            return false;
        }
    }

    // ============================================
    // ГЕНЕРАЦИЯ MANIFEST (для разработчика)
    // ============================================
    function generateManifest() {
        console.log('[Updates] 📝 Генерация manifest...');
        
        const files = [
            'app-scanner.js',
            'store.js',
            'l.js',
            'svaer.js',
            'settings.js',
            'game.js',
            'time.js',
            'file.js',
            'widget-time.js',
            'twirlay-core1.js',
            'twirlay-core-save.js',
            'notes-store.html',
            'calc-store.html',
            'site-store.html',
            'projects-store.html'
        ];
        
        const hashes = {};
        const promises = files.map(function(filename) {
            return fetch(filename + '?t=' + Date.now())
                .then(function(r) { return r.text(); })
                .then(function(content) {
                    hashes[filename] = hashString(content);
                })
                .catch(function() {
                    hashes[filename] = 'error';
                });
        });
        
        return Promise.all(promises).then(function() {
            const manifest = {
                version: '1.1.0',
                build: 2,
                date: new Date().toISOString().split('T')[0],
                description: 'Автоматически сгенерированный manifest',
                changelog: ['Автоматическое обновление'],
                files: hashes
            };
            
            console.log('[Updates] Manifest:');
            console.log(JSON.stringify(manifest, null, 2));
            
            // Копируем в буфер обмена
            try {
                navigator.clipboard.writeText(JSON.stringify(manifest, null, 2));
                console.log('[Updates] 📋 Скопировано в буфер обмена!');
            } catch(e) {}
            
            return manifest;
        });
    }

    // ============================================
    // ЭКСПОРТ
    // ============================================
    window.Updates = {
        check: checkForUpdates,
        getInfo: function() { return updateInfo; },
        getCurrentVersion: getCurrentVersion,
        getCurrentHashes: getCurrentHashes,
        applyUpdate: applyUpdate,
        resetHashes: resetHashes,
        generateManifest: generateManifest,
        hashString: hashString,
        loadManifest: loadManifest,
        isOnline: function() { return navigator.onLine; }
    };

    // Автопроверка при загрузке (если онлайн)
    setTimeout(function() {
        if (navigator.onLine) {
            checkForUpdates();
        }
    }, 2000);

    console.log('[Updates] ✅ Загружено');

})();