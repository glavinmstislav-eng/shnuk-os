// app-scanner.js — Сканер приложений + установленные HTML (ИСПРАВЛЕННЫЙ)

(function() {
    'use strict';

    console.log('[Scanner] Загрузка сканера...');

    const FORCE_MODE = true;

    // Встроенные приложения
    const APP_LIST = [
        { id: 'settings', name: 'Настройки', icon: 'settings.png' },
        { id: 'game', name: 'Игра', icon: 'game1.png' },
        { id: 'time', name: 'Часы', icon: 'time.png' },
        { id: 'file', name: 'Файлы', icon: 'file.png' },
        { id: 'store', name: 'Store', icon: 'store.png' }
    ];

    const BASE_PATH = './';
    const INSTALLED_KEY = 'shnuk_installed_apps';

    let cachedApps = null;
    let scanPromise = null;

    function imageExists(url) {
        return new Promise(function(resolve) {
            if (!url) { resolve(false); return; }
            const img = new Image();
            img.onload = function() { resolve(true); };
            img.onerror = function() { resolve(false); };
            img.src = url + '?t=' + Date.now();
        });
    }

    // ============================================
    // ЗАГРУЗКА УСТАНОВЛЕННЫХ ПРИЛОЖЕНИЙ
    // ============================================
    function getInstalledApps() {
        try {
            const saved = localStorage.getItem(INSTALLED_KEY);
            if (!saved) {
                console.log('[Scanner] Нет установленных приложений');
                return [];
            }
            const parsed = JSON.parse(saved);
            if (!Array.isArray(parsed)) return [];
            console.log('[Scanner] Установленных приложений в localStorage:', parsed.length);
            return parsed;
        } catch(e) {
            console.error('[Scanner] Ошибка чтения установленных:', e);
            return [];
        }
    }

    // ============================================
    // СКАНИРОВАНИЕ
    // ============================================
    function scanApps() {
        if (cachedApps !== null) {
            return Promise.resolve(cachedApps);
        }

        if (scanPromise) {
            return scanPromise;
        }

        scanPromise = new Promise(function(resolve) {
            const foundApps = [];

            console.log('[Scanner] 🔍 Начинаем сканирование...');

            // 1. Сканируем нативные приложения
            const promises = APP_LIST.map(function(appData) {
                const jsPath = BASE_PATH + appData.id + '.js';
                const iconPath = appData.icon || appData.id + '.png';
                
                return imageExists(iconPath).then(function(iconExists) {
                    foundApps.push({
                        id: appData.id,
                        name: appData.name,
                        file: jsPath,
                        icon: iconExists ? iconPath : null,
                        hasIcon: iconExists,
                        type: 'native'
                    });
                }).catch(function() {
                    foundApps.push({
                        id: appData.id,
                        name: appData.name,
                        file: jsPath,
                        icon: null,
                        hasIcon: false,
                        type: 'native'
                    });
                });
            });

            Promise.allSettled(promises).then(function() {
                // 2. Добавляем установленные HTML-приложения
                const installed = getInstalledApps();
                
                console.log('[Scanner] 📦 HTML-приложений:', installed.length);
                
                installed.forEach(function(app) {
                    if (!app || !app.id || !app.name) {
                        console.warn('[Scanner] Пропускаем невалидное приложение:', app);
                        return;
                    }
                    
                    // Проверяем что не дублируется
                    if (foundApps.some(function(a) { return a.id === app.id; })) {
                        console.warn('[Scanner] Дубликат:', app.id);
                        return;
                    }
                    
                    foundApps.push({
                        id: app.id,
                        name: app.name,
                        file: null,
                        icon: app.icon || null,
                        hasIcon: !!app.icon,
                        type: 'html',
                        html: app.html,
                        description: app.description || 'HTML приложение',
                        author: app.author || 'Неизвестно',
                        version: app.version || '1.0.0'
                    });
                    
                    console.log('[Scanner] ✅ Добавлено HTML:', app.name);
                });

                cachedApps = foundApps;
                scanPromise = null;
                
                console.log('[Scanner] ✅ Всего приложений:', foundApps.length);
                console.log('[Scanner] 📋 Список:', foundApps.map(function(a) { 
                    return a.name + ' (' + a.type + ')'; 
                }).join(', '));
                
                resolve(foundApps);
            });
        });

        return scanPromise;
    }

    function getApps() {
        if (cachedApps !== null) {
            return Promise.resolve(cachedApps);
        }
        return scanApps();
    }

    function getAppById(appId) {
        return getApps().then(function(apps) {
            return apps.find(function(app) { return app.id === appId; }) || null;
        });
    }

    // ============================================
    // ПЕРЕСКАНИРОВАНИЕ (важно!)
    // ============================================
    function rescanApps() {
        console.log('[Scanner] 🔄 Пересканирование...');
        cachedApps = null;
        scanPromise = null;
        return scanApps();
    }

    function setApps(apps) {
        cachedApps = apps;
        scanPromise = null;
    }

    // ============================================
    // УСТАНОВКА / УДАЛЕНИЕ
    // ============================================
    function installApp(appData) {
        try {
            const installed = getInstalledApps();
            
            const existing = installed.findIndex(function(a) { return a.id === appData.id; });
            if (existing !== -1) {
                installed[existing] = appData;
            } else {
                installed.push(appData);
            }
            
            localStorage.setItem(INSTALLED_KEY, JSON.stringify(installed));
            
            // Сбрасываем кеш
            cachedApps = null;
            scanPromise = null;
            
            console.log('[Scanner] ✅ Установлено:', appData.name);
            return true;
        } catch(e) {
            console.error('[Scanner] Ошибка установки:', e);
            return false;
        }
    }

    function uninstallApp(appId) {
        try {
            let installed = getInstalledApps();
            installed = installed.filter(function(a) { return a.id !== appId; });
            localStorage.setItem(INSTALLED_KEY, JSON.stringify(installed));
            
            cachedApps = null;
            scanPromise = null;
            
            console.log('[Scanner] ✅ Удалено:', appId);
            return true;
        } catch(e) {
            console.error('[Scanner] Ошибка удаления:', e);
            return false;
        }
    }

    // ============================================
    // ЭКСПОРТ
    // ============================================
    window.AppScanner = {
        scan: scanApps,
        getApps: getApps,
        getAppById: getAppById,
        rescan: rescanApps,
        setApps: setApps,
        getCache: function() { return cachedApps; },
        isForceMode: FORCE_MODE,
        getInstalledApps: getInstalledApps,
        installApp: installApp,
        uninstallApp: uninstallApp
    };

    console.log('[Scanner] ✅ Загружен');

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(function() {
            AppScanner.scan().then(function(apps) {
                console.log('[Scanner] ✅ Автосканирование завершено. Найдено:', apps.length);
            });
        }, 300);
    }

})();