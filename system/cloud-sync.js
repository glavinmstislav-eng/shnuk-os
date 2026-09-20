// cloud-sync.js — синхронизация всех данных пользователя через Firebase

(function() {
    'use strict';

    const SYNC_COLLECTION = 'sync';
    const FILE_SHARDS = 'file_shards';
    const FILE_INDEX_DOC = 'files_index';
    const SHARD_SIZE = 700 * 1024; // 700 КБ на шард (base64)

    let currentUid = null;
    let isSyncing = false;
    let isRestoring = false;
    let ready = false;
    let debounceTimers = {};
    let unsubscribeSettings = null;
    let unsubscribeFilesIndex = null;

    const SYNC_KEYS = [
        'app_wallpaper',
        'shnuk_live_wallpaper',
        'shnuk_installed_apps',
        'shnuk_desktop_apps',
        'shnuk_brightness',
        'shnuk_anon_mode',
        'shnuk_fullscreen',
        'shnuk_security',
        'shnuk_onboarding_done',
        'shnuk_wallpaper',
        'shnuk_wallpaper_name'
    ];

    function log() {
        try { console.log.apply(console, ['[CloudSync]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }
    function warn() {
        try { console.warn.apply(console, ['[CloudSync]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    async function waitForFirebase() {
        if (window.__firebaseReady) {
            try { await window.__firebaseReady; } catch(e) {}
        }
        if (!window.firebaseDb || !window.firebaseSDK) {
            await new Promise(function(r) { setTimeout(r, 500); });
        }
        return !!(window.firebaseDb && window.firebaseSDK);
    }

    function getUid() {
        if (window.Auth && window.Auth.isLoggedIn()) {
            const u = window.Auth.getUser();
            return u ? u.uid : null;
        }
        if (window.firebaseAuth && window.firebaseAuth.currentUser) {
            return window.firebaseAuth.currentUser.uid;
        }
        return null;
    }

    // =========================================
    // ЧТЕНИЕ локальных данных
    // =========================================
    function readLocal(key) {
        try {
            const v = localStorage.getItem(key);
            if (v === null) return null;
            try { return JSON.parse(v); } catch(e) { return v; }
        } catch(e) {
            return null;
        }
    }

    function writeLocal(key, value) {
        try {
            if (value === null || value === undefined) {
                localStorage.removeItem(key);
            } else {
                const str = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
                localStorage.setItem(key, str);
            }
            return true;
        } catch(e) {
            return false;
        }
    }

    // =========================================
    // ОТПРАВКА в Firestore
    // =========================================
    async function pushSetting(key, value) {
        if (!currentUid) return;
        if (!window.firebaseDb || !window.firebaseSDK) return;

        const { doc, setDoc } = window.firebaseSDK;
        try {
            await setDoc(
                doc(window.firebaseDb, 'users', currentUid, SYNC_COLLECTION, key),
                {
                    key: key,
                    value: value,
                    updatedAt: new Date().toISOString()
                },
                { merge: true }
            );
            log('push', key);
        } catch(e) {
            warn('push', key, e);
        }
    }

    async function pushAllSettings() {
        for (const key of SYNC_KEYS) {
            const v = readLocal(key);
            if (v !== null) {
                await pushSetting(key, v);
            }
        }
    }

    // =========================================
    // ФАЙЛЫ — шардами
    // =========================================
    async function pushFiles() {
        if (!currentUid) return;
        if (!window.firebaseDb || !window.firebaseSDK) return;
        if (!window.SharedFiles) return;

        const { doc, setDoc, deleteDoc, collection, getDocs } = window.firebaseSDK;

        try {
            const arr = await window.SharedFiles.getAsync();
            if (!Array.isArray(arr)) return;

            // Собираем JSON всего массива файлов
            const json = JSON.stringify(arr);
            const totalLen = json.length;

            // Разбиваем на шарды
            const shards = [];
            for (let i = 0; i < totalLen; i += SHARD_SIZE) {
                shards.push(json.substring(i, i + SHARD_SIZE));
            }

            log('Файлов:', arr.length, 'размер JSON:', totalLen, 'шардов:', shards.length);

            // Пишем шарды
            for (let i = 0; i < shards.length; i++) {
                await setDoc(
                    doc(window.firebaseDb, 'users', currentUid, FILE_SHARDS, 'shard_' + i),
                    { data: shards[i], index: i, updatedAt: new Date().toISOString() }
                );
            }

            // Удаляем лишние шарды (если раньше было больше)
            try {
                const snap = await getDocs(collection(window.firebaseDb, 'users', currentUid, FILE_SHARDS));
                const toDelete = [];
                snap.forEach(function(d) {
                    const idx = d.data().index;
                    if (typeof idx === 'number' && idx >= shards.length) {
                        toDelete.push(d.id);
                    }
                });
                for (const id of toDelete) {
                    await deleteDoc(doc(window.firebaseDb, 'users', currentUid, FILE_SHARDS, id));
                }
            } catch(e) {}

            // Индекс
            await setDoc(
                doc(window.firebaseDb, 'users', currentUid, SYNC_COLLECTION, FILE_INDEX_DOC),
                {
                    key: FILE_INDEX_DOC,
                    shards: shards.length,
                    totalLength: totalLen,
                    count: arr.length,
                    updatedAt: new Date().toISOString()
                },
                { merge: true }
            );

            log('pushFiles: успешно', shards.length, 'шардов');
        } catch(e) {
            warn('pushFiles:', e);
        }
    }

    // =========================================
    // ВОССТАНОВЛЕНИЕ из Firestore
    // =========================================
    async function pullAllSettings() {
        if (!currentUid) return false;
        if (!window.firebaseDb || !window.firebaseSDK) return false;

        const { doc, getDoc } = window.firebaseSDK;

        isRestoring = true;
        let changed = false;

        for (const key of SYNC_KEYS) {
            try {
                const snap = await getDoc(doc(window.firebaseDb, 'users', currentUid, SYNC_COLLECTION, key));
                if (snap.exists()) {
                    const data = snap.data();
                    const cloudVal = data && data.value;
                    if (cloudVal !== undefined && cloudVal !== null) {
                        const localVal = readLocal(key);
                        const cloudStr = JSON.stringify(cloudVal);
                        const localStr = JSON.stringify(localVal);
                        if (cloudStr !== localStr) {
                            writeLocal(key, cloudVal);
                            changed = true;
                        }
                    }
                } else {
                    // Нет в облаке — отправляем локальное
                    const localVal = readLocal(key);
                    if (localVal !== null) {
                        await pushSetting(key, localVal);
                    }
                }
            } catch(e) {
                warn('pull setting', key, e);
            }
        }

        isRestoring = false;
        return changed;
    }

    async function pullFiles() {
        if (!currentUid) return false;
        if (!window.firebaseDb || !window.firebaseSDK) return false;
        if (!window.SharedFiles) return false;

        const { doc, getDoc, collection, getDocs } = window.firebaseSDK;

        try {
            // Читаем индекс
            const idxSnap = await getDoc(doc(window.firebaseDb, 'users', currentUid, SYNC_COLLECTION, FILE_INDEX_DOC));
            if (!idxSnap.exists()) {
                // Нет в облаке — отправляем локальное
                await pushFiles();
                return false;
            }

            const idx = idxSnap.data();
            const shardCount = idx.shards || 0;

            // Читаем шарды
            let json = '';
            for (let i = 0; i < shardCount; i++) {
                const snap = await getDoc(doc(window.firebaseDb, 'users', currentUid, FILE_SHARDS, 'shard_' + i));
                if (snap.exists()) {
                    json += snap.data().data || '';
                }
            }

            if (!json) return false;

            let cloudFiles;
            try {
                cloudFiles = JSON.parse(json);
            } catch(e) {
                warn('pullFiles: JSON parse error', e);
                return false;
            }

            if (!Array.isArray(cloudFiles)) return false;

            const localFiles = await window.SharedFiles.getAsync();

            // Проверяем, отличаются ли
            const localStr = JSON.stringify(localFiles);
            const cloudStr = JSON.stringify(cloudFiles);
            if (localStr === cloudStr) return false;

            // Что делать: если локально файлов нет — берём облачные.
            // Если в облаке больше — берём облачные. Иначе — оставляем локальные.
            if (localFiles.length === 0 || cloudFiles.length >= localFiles.length) {
                log('pullFiles: применяем облачные (' + cloudFiles.length + ' файлов)');
                await window.SharedFiles.set(cloudFiles);
                return true;
            }

            return false;
        } catch(e) {
            warn('pullFiles:', e);
            return false;
        }
    }

    // =========================================
    // АВТОСИНК
    // =========================================
    function debouncedPushSetting(key) {
        if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
        debounceTimers[key] = setTimeout(function() {
            debounceTimers[key] = null;
            const v = readLocal(key);
            pushSetting(key, v);
        }, 800);
    }

    let filesPushTimer = null;
    function debouncedPushFiles() {
        if (filesPushTimer) clearTimeout(filesPushTimer);
        filesPushTimer = setTimeout(function() {
            filesPushTimer = null;
            pushFiles();
        }, 1500);
    }

    // Патчим Storage.prototype.setItem, чтобы ловить ВСЕ изменения localStorage
    function patchStorage() {
        if (window.__cloudSyncStoragePatched) return;
        window.__cloudSyncStoragePatched = true;

        const origSetItem = Storage.prototype.setItem;
        const origRemoveItem = Storage.prototype.removeItem;

        Storage.prototype.setItem = function(key, value) {
            origSetItem.call(this, key, value);
            if (isRestoring) return;
            if (SYNC_KEYS.indexOf(key) !== -1) {
                debouncedPushSetting(key);
            }
        };

        Storage.prototype.removeItem = function(key) {
            origRemoveItem.call(this, key);
            if (isRestoring) return;
            if (SYNC_KEYS.indexOf(key) !== -1) {
                debouncedPushSetting(key);
            }
        };
    }

    // Ловим изменения файлов через событие
    function bindFilesEvents() {
        window.addEventListener('shnuk:files-changed', function() {
            if (isRestoring) return;
            debouncedPushFiles();
        });
    }

    // =========================================
    // ЖИВЫЕ ОБОИ — применить после pull
    // =========================================
    function applyWallpaperAfterSync() {
        try {
            const url = localStorage.getItem('app_wallpaper');
            if (url) {
                const bg = document.getElementById('appBackground');
                if (bg) {
                    bg.dataset.staticWallpaper = url;
                    bg.style.backgroundImage = 'url(\'' + url + '\')';
                }
                window.dispatchEvent(new CustomEvent('shnuk:wallpaper-changed', { detail: { url: url } }));
            }
            const liveType = localStorage.getItem('shnuk_live_wallpaper');
            if (liveType && window.LiveWallpapers) {
                window.LiveWallpapers.setCurrent(liveType);
                window.LiveWallpapers.apply(liveType);
            }
            // Яркость
            const br = parseInt(localStorage.getItem('shnuk_brightness') || '100', 10);
            if (window.LiveBar && window.LiveBar.setBrightness && !isNaN(br)) {
                window.LiveBar.setBrightness(br);
            }
        } catch(e) {
            warn('applyWallpaperAfterSync:', e);
        }
    }

    // =========================================
    // ЗАПУСК
    // =========================================
    async function start(uid) {
        if (!uid) return;
        if (currentUid === uid && ready) return;

        currentUid = uid;
        ready = false;

        const ok = await waitForFirebase();
        if (!ok) {
            warn('Firebase не готов');
            return;
        }

        patchStorage();
        bindFilesEvents();

        // 1. Сначала применяем облачные настройки к локальным
        await pullAllSettings();

        // 2. Применяем облачные файлы, если локально пусто или облако больше
        await pullFiles();

        // 3. Применяем обои/яркость к UI
        applyWallpaperAfterSync();

        // 4. Отправляем всё, чего нет в облаке
        await pushAllSettings();
        await pushFiles();

        ready = true;
        log('Sync запущен для', uid);

        // Событие для внешних модулей
        window.dispatchEvent(new CustomEvent('shnuk:cloud-sync-ready'));
    }

    function stop() {
        currentUid = null;
        ready = false;
        if (filesPushTimer) { clearTimeout(filesPushTimer); filesPushTimer = null; }
        for (const k in debounceTimers) {
            if (debounceTimers[k]) clearTimeout(debounceTimers[k]);
        }
        debounceTimers = {};
        log('Sync остановлен');
    }

    // Автозапуск при логине
    async function init() {
        if (window.__firebaseReady) {
            try { await window.__firebaseReady; } catch(e) {}
        }

        if (window.Auth && window.Auth.isLoggedIn()) {
            const u = window.Auth.getUser();
            if (u && u.uid) {
                start(u.uid);
            }
        }

        // Слушаем смену пользователя
        if (window.firebaseAuth && window.firebaseAuthApi) {
            window.firebaseAuthApi.onAuthStateChanged(window.firebaseAuth, function(user) {
                if (user) {
                    start(user.uid);
                } else {
                    stop();
                }
            });
        }
    }

    window.CloudSync = {
        init: init,
        start: start,
        stop: stop,
        push: pushAllSettings,
        pushFiles: pushFiles,
        pull: pullAllSettings,
        pullFiles: pullFiles,
        isReady: function() { return ready; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 1500); });
    } else {
        setTimeout(init, 1500);
    }

})();