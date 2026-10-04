// file-storage.js — хранилище файлов ТОЛЬКО в IndexedDB

(function() {
    'use strict';

    let cache = null;
    let readyPromise = null;

    function notify() {
        try {
            window.dispatchEvent(new CustomEvent('shnuk:files-changed', { detail: { count: cache ? cache.length : 0 } }));
        } catch(e) {}
    }

    async function ensureReady() {
        if (cache !== null) return;
        if (!window.OSStorage) {
            await new Promise(function(resolve) {
                let elapsed = 0;
                const iv = setInterval(function() {
                    elapsed += 100;
                    if (window.OSStorage || elapsed >= 5000) {
                        clearInterval(iv);
                        resolve();
                    }
                }, 100);
            });
        }
        if (!window.OSStorage) {
            console.error('[Files] OSStorage недоступен');
            cache = [];
            return;
        }
        try {
            cache = await window.OSStorage.files.getAll();
            if (!Array.isArray(cache)) cache = [];
        } catch(e) {
            console.error('[Files] ошибка чтения IDB:', e);
            cache = [];
        }
    }

    function get() {
        if (cache !== null) return cache;
        return [];
    }

    async function getAsync() {
        await ensureReady();
        return cache;
    }

    async function set(list) {
        await ensureReady();
        const arr = Array.isArray(list) ? list.slice() : [];
        if (!window.OSStorage) {
            cache = arr;
            notify();
            return false;
        }
        try {
            await window.OSStorage.files.clear();
            for (const f of arr) {
                await window.OSStorage.files.put(f);
            }
            cache = arr;
            notify();
            return true;
        } catch(e) {
            console.error('[Files] set error:', e);
            return false;
        }
    }

    async function add(fileData) {
        if (!fileData || !fileData.name) return false;
        await ensureReady();
        if (!window.OSStorage) return false;
        try {
            await window.OSStorage.files.put(fileData);
            cache.push(fileData);
            notify();
            return true;
        } catch(e) {
            console.error('[Files] add error:', e);
            return false;
        }
    }

    // Обновляет существующий элемент (по id) или добавляет
    async function update(fileData) {
        if (!fileData || !fileData.id) return false;
        await ensureReady();
        if (!window.OSStorage) return false;
        try {
            await window.OSStorage.files.put(fileData);
            const idx = cache.findIndex(f => f.id === fileData.id);
            if (idx !== -1) cache[idx] = fileData;
            else cache.push(fileData);
            notify();
            return true;
        } catch(e) {
            console.error('[Files] update error:', e);
            return false;
        }
    }

    async function remove(id) {
        await ensureReady();
        if (!window.OSStorage) return false;
        try {
            await window.OSStorage.files.delete(id);
            cache = cache.filter(f => f.id !== id);
            notify();
            return true;
        } catch(e) {
            console.error('[Files] remove error:', e);
            return false;
        }
    }

    // Удаляет массив id за одну операцию
    async function removeMany(ids) {
        await ensureReady();
        if (!window.OSStorage) return false;
        if (!Array.isArray(ids) || ids.length === 0) return true;
        try {
            for (const id of ids) {
                await window.OSStorage.files.delete(id);
            }
            const idSet = {};
            ids.forEach(id => { idSet[id] = true; });
            cache = cache.filter(f => !idSet[f.id]);
            notify();
            return true;
        } catch(e) {
            console.error('[Files] removeMany error:', e);
            return false;
        }
    }

    async function clear() {
        if (window.OSStorage) {
            try { await window.OSStorage.files.clear(); } catch(e) {}
        }
        cache = [];
        notify();
        return true;
    }

    async function count() {
        await ensureReady();
        return cache.length;
    }

    try {
        if (localStorage.getItem('shnuk_files')) {
            localStorage.removeItem('shnuk_files');
            console.log('[Files] Удалён legacy ключ shnuk_files из localStorage');
        }
    } catch(e) {}

    readyPromise = ensureReady();

    window.SharedFiles = {
        get: get,
        getAsync: getAsync,
        set: set,
        add: add,
        update: update,
        remove: remove,
        removeMany: removeMany,
        clear: clear,
        count: count,
        max: function() { return Infinity; },
        ready: function() { return readyPromise; },
        syncToCloud: async function() { return false; },
        pullFromCloud: async function() { return false; }
    };

})();