// file-storage.js — хранилище файлов на IndexedDB

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
            cache = [];
            return;
        }
        cache = await window.OSStorage.files.getAll();
        if (!Array.isArray(cache)) cache = [];
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
            return true;
        }
        // Перезаписываем всю таблицу: чистим и кладём заново
        await window.OSStorage.files.clear();
        for (const f of arr) {
            try { await window.OSStorage.files.put(f); } catch(e) { console.warn('[Files] put:', e); }
        }
        cache = arr;
        notify();
        return true;
    }

    async function add(fileData) {
        if (!fileData || !fileData.name || !fileData.data) return false;
        await ensureReady();
        try {
            if (window.OSStorage) {
                await window.OSStorage.files.put(fileData);
            }
            cache.push(fileData);
            notify();
            return true;
        } catch(e) {
            console.warn('[Files] add:', e);
            return false;
        }
    }

    async function remove(id) {
        await ensureReady();
        try {
            if (window.OSStorage) {
                await window.OSStorage.files.delete(id);
            }
            cache = cache.filter(f => f.id !== id);
            notify();
            return true;
        } catch(e) {
            console.warn('[Files] remove:', e);
            return false;
        }
    }

    async function clear() {
        if (window.OSStorage) {
            await window.OSStorage.files.clear();
        }
        cache = [];
        notify();
        return true;
    }

    async function count() {
        await ensureReady();
        return cache.length;
    }

    // Стартовая инициализация — грузим кеш из IndexedDB
    readyPromise = ensureReady();

    window.SharedFiles = {
        get: get,
        getAsync: getAsync,
        set: set,
        add: add,
        remove: remove,
        clear: clear,
        count: count,
        max: function() { return Infinity; },
        ready: function() { return readyPromise; },
        // Заглушки для совместимости, чтобы старый код не падал
        syncToCloud: async function() { return false; },
        pullFromCloud: async function() { return false; }
    };

})();