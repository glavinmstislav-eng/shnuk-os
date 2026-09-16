// app-scanner.js

(function() {
    'use strict';

    const FORCE_MODE = true;

    const APP_LIST = [
        { id: 'settings', name: 'Настройки', icon: 'settings.png' },
        { id: 'game', name: 'Игра', icon: 'game1.png' },
        { id: 'time', name: 'Часы', icon: 'time.png' },
        { id: 'file', name: 'Файлы', icon: 'file.png' },
        { id: 'store', name: 'Store', icon: 'store.png' },
        { id: 'camera', name: 'Камера', icon: 'camera.png' },
        { id: 'recorder', name: 'Звукозапись', icon: 'recording.png' },
        { id: 'actions', name: 'Actions', icon: 'actions.png' },
        { id: 'cooop', name: 'Cooop', icon: 'cooop.png' }
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

    function getInstalledApps() {
        try {
            const saved = localStorage.getItem(INSTALLED_KEY);
            if (!saved) return [];
            const parsed = JSON.parse(saved);
            return Array.isArray(parsed) ? parsed : [];
        } catch(e) {
            return [];
        }
    }

    function scanApps() {
        if (cachedApps !== null) {
            return Promise.resolve(cachedApps);
        }

        if (scanPromise) {
            return scanPromise;
        }

        scanPromise = new Promise(function(resolve) {
            const foundApps = [];

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
                const installed = getInstalledApps();

                installed.forEach(function(app) {
                    if (!app || !app.id || !app.name) return;
                    if (foundApps.some(function(a) { return a.id === app.id; })) return;

                    foundApps.push({
                        id: app.id,
                        name: app.name,
                        file: null,
                        icon: app.icon || null,
                        hasIcon: !!app.icon,
                        type: 'html',
                        html: app.html,
                        description: app.description || '',
                        author: app.author || '',
                        version: app.version || '1.0.0'
                    });
                });

                cachedApps = foundApps;
                scanPromise = null;
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

    function rescanApps() {
        cachedApps = null;
        scanPromise = null;
        return scanApps();
    }

    function setApps(apps) {
        cachedApps = apps;
        scanPromise = null;
    }

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

            cachedApps = null;
            scanPromise = null;

            return true;
        } catch(e) {
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

            return true;
        } catch(e) {
            return false;
        }
    }

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

})();