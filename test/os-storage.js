// os-storage.js — IndexedDB хранилище для Shnuk OS

(function() {
    'use strict';

    const DB_NAME = 'shnuk_os';
    const DB_VERSION = 1;
    const STORE_FILES = 'files';
    const STORE_SYSTEM = 'system';

    let dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function(resolve, reject) {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB не поддерживается'));
                return;
            }
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = function(e) {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_FILES)) {
                    const files = db.createObjectStore(STORE_FILES, { keyPath: 'id' });
                    files.createIndex('date', 'date', { unique: false });
                    files.createIndex('name', 'name', { unique: false });
                }
                if (!db.objectStoreNames.contains(STORE_SYSTEM)) {
                    db.createObjectStore(STORE_SYSTEM, { keyPath: 'key' });
                }
            };

            req.onsuccess = function() { resolve(req.result); };
            req.onerror = function() { reject(req.error); };
        });
        return dbPromise;
    }

    function tx(store, mode, fn) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                const t = db.transaction(store, mode);
                const s = t.objectStore(store);
                let result;
                try {
                    result = fn(s);
                } catch(e) {
                    reject(e);
                    return;
                }
                t.oncomplete = function() { resolve(result); };
                t.onerror = function() { reject(t.error); };
                t.onabort = function() { reject(t.error || new Error('aborted')); };
            });
        });
    }

    function reqToPromise(req) {
        return new Promise(function(resolve, reject) {
            req.onsuccess = function() { resolve(req.result); };
            req.onerror = function() { reject(req.error); };
        });
    }

    // ---------- FILES ----------

    async function filesGetAll() {
        const db = await openDB();
        const t = db.transaction(STORE_FILES, 'readonly');
        const s = t.objectStore(STORE_FILES);
        const req = s.getAll();
        return reqToPromise(req);
    }

    async function filesPut(file) {
        if (!file || !file.id) throw new Error('file.id обязателен');
        const db = await openDB();
        const t = db.transaction(STORE_FILES, 'readwrite');
        t.objectStore(STORE_FILES).put(file);
        return new Promise(function(resolve, reject) {
            t.oncomplete = function() { resolve(true); };
            t.onerror = function() { reject(t.error); };
            t.onabort = function() { reject(t.error || new Error('aborted')); };
        });
    }

    async function filesDelete(id) {
        const db = await openDB();
        const t = db.transaction(STORE_FILES, 'readwrite');
        t.objectStore(STORE_FILES).delete(id);
        return new Promise(function(resolve, reject) {
            t.oncomplete = function() { resolve(true); };
            t.onerror = function() { reject(t.error); };
        });
    }

    async function filesClear() {
        const db = await openDB();
        const t = db.transaction(STORE_FILES, 'readwrite');
        t.objectStore(STORE_FILES).clear();
        return new Promise(function(resolve, reject) {
            t.oncomplete = function() { resolve(true); };
            t.onerror = function() { reject(t.error); };
        });
    }

    async function filesCount() {
        const db = await openDB();
        const t = db.transaction(STORE_FILES, 'readonly');
        const req = t.objectStore(STORE_FILES).count();
        return reqToPromise(req);
    }

    // ---------- SYSTEM (HTML/CSS/JS/иконки) ----------

    async function systemPut(key, data) {
        if (!key) throw new Error('key обязателен');
        const db = await openDB();
        const t = db.transaction(STORE_SYSTEM, 'readwrite');
        t.objectStore(STORE_SYSTEM).put({ key: key, data: data, updated: Date.now() });
        return new Promise(function(resolve, reject) {
            t.oncomplete = function() { resolve(true); };
            t.onerror = function() { reject(t.error); };
        });
    }

    async function systemGet(key) {
        const db = await openDB();
        const t = db.transaction(STORE_SYSTEM, 'readonly');
        const req = t.objectStore(STORE_SYSTEM).get(key);
        const row = await reqToPromise(req);
        return row ? row.data : null;
    }

    async function systemDelete(key) {
        const db = await openDB();
        const t = db.transaction(STORE_SYSTEM, 'readwrite');
        t.objectStore(STORE_SYSTEM).delete(key);
        return new Promise(function(resolve, reject) {
            t.oncomplete = function() { resolve(true); };
            t.onerror = function() { reject(t.error); };
        });
    }

    async function systemGetAllKeys() {
        const db = await openDB();
        const t = db.transaction(STORE_SYSTEM, 'readonly');
        const req = t.objectStore(STORE_SYSTEM).getAllKeys();
        return reqToPromise(req);
    }

    async function systemClear() {
        const db = await openDB();
        const t = db.transaction(STORE_SYSTEM, 'readwrite');
        t.objectStore(STORE_SYSTEM).clear();
        return new Promise(function(resolve, reject) {
            t.oncomplete = function() { resolve(true); };
            t.onerror = function() { reject(t.error); };
        });
    }

    // ---------- ДИАГНОСТИКА ----------

    async function estimate() {
        if (navigator.storage && navigator.storage.estimate) {
            try { return await navigator.storage.estimate(); } catch(e) {}
        }
        return null;
    }

    window.OSStorage = {
        open: openDB,
        files: {
            getAll: filesGetAll,
            put: filesPut,
            delete: filesDelete,
            clear: filesClear,
            count: filesCount
        },
        system: {
            put: systemPut,
            get: systemGet,
            delete: systemDelete,
            keys: systemGetAllKeys,
            clear: systemClear
        },
        estimate: estimate
    };

})();