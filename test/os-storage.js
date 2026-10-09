// os-storage.js — IndexedDB хранилище для Shnuk OS
// Все строковые поля (кроме структурных) шифруются через Apl.

(function() {
    'use strict';

    const DB_NAME = 'shnuk_os';
    const DB_VERSION = 1;
    const STORE_FILES = 'files';
    const STORE_SYSTEM = 'system';

    let dbPromise = null;
    let aplReadyPromise = null;

    // Гарантирует, что Apl развёрнут до любой операции с хранилищем.
    function ensureAplReady() {
        if (aplReadyPromise) return aplReadyPromise;
        aplReadyPromise = (async function() {
            if (!window.Apl) {
                // Даём Apl время загрузиться, если скрипт ещё не выполнился.
                let tries = 0;
                while (!window.Apl && tries < 100) {
                    tries++;
                    await new Promise(function(r) { setTimeout(r, 50); });
                }
            }
            if (window.Apl && typeof window.Apl.ready === 'function') {
                try { await window.Apl.ready(); } catch(e) {}
            }
            if (window.Apl && typeof window.Apl.isUnlocked === 'function') {
                return window.Apl.isUnlocked();
            }
            return false;
        })();
        return aplReadyPromise;
    }

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

    function reqToPromise(req) {
        return new Promise(function(resolve, reject) {
            req.onsuccess = function() { resolve(req.result); };
            req.onerror = function() { reject(req.error); };
        });
    }

    // ============================================
    // ШИФРОВАНИЕ
    // ============================================

    // Структурные поля: id, key — обязательны для обхода хранилища.
    // parentId, isFolder — нужны для построения дерева без расшифровки.
    const FIELD_BLACKLIST = ['id', 'key', 'parentId', 'isFolder'];

    function isEncryptedString(v) {
        if (typeof v !== 'string') return false;
        return v.indexOf('A1:') === 0 || v.indexOf('A2:') === 0;
    }

    async function encryptRecord(rec) {
        if (!rec || typeof rec !== 'object') return rec;
        if (!window.Apl || typeof window.Apl.encrypt !== 'function') return rec;
        if (!window.Apl.isUnlocked || !window.Apl.isUnlocked()) return rec;

        const out = {};
        for (const k in rec) {
            if (!Object.prototype.hasOwnProperty.call(rec, k)) continue;
            if (FIELD_BLACKLIST.indexOf(k) !== -1) {
                out[k] = rec[k];
                continue;
            }
            const v = rec[k];
            if (typeof v === 'string') {
                if (v.length > 0 && !isEncryptedString(v)) {
                    try { out[k] = await window.Apl.encrypt(v); } catch(e) { out[k] = v; }
                } else {
                    out[k] = v;
                }
            } else if (v && typeof v === 'object' && !Array.isArray(v)) {
                out[k] = await encryptRecord(v);
            } else {
                out[k] = v;
            }
        }
        return out;
    }

    async function decryptRecord(rec) {
        if (!rec || typeof rec !== 'object') return rec;
        if (!window.Apl || typeof window.Apl.decrypt !== 'function') return rec;
        if (!window.Apl.isUnlocked || !window.Apl.isUnlocked()) return rec;

        const out = {};
        for (const k in rec) {
            if (!Object.prototype.hasOwnProperty.call(rec, k)) continue;
            if (FIELD_BLACKLIST.indexOf(k) !== -1) {
                out[k] = rec[k];
                continue;
            }
            const v = rec[k];
            if (isEncryptedString(v)) {
                try {
                    const plain = await window.Apl.decrypt(v);
                    out[k] = plain;
                } catch(e) {
                    out[k] = v;
                }
            } else if (v && typeof v === 'object' && !Array.isArray(v)) {
                out[k] = await decryptRecord(v);
            } else {
                out[k] = v;
            }
        }
        return out;
    }

    // ============================================
    // FILES
    // ============================================

    async function filesGetAll() {
        await ensureAplReady();
        const db = await openDB();
        const t = db.transaction(STORE_FILES, 'readonly');
        const s = t.objectStore(STORE_FILES);
        const req = s.getAll();
        const raw = await reqToPromise(req);
        const out = [];
        for (let i = 0; i < raw.length; i++) {
            out.push(await decryptRecord(raw[i]));
        }
        return out;
    }

    async function filesPut(file) {
        if (!file || !file.id) throw new Error('file.id обязателен');
        await ensureAplReady();
        const enc = await encryptRecord(file);
        const db = await openDB();
        const t = db.transaction(STORE_FILES, 'readwrite');
        t.objectStore(STORE_FILES).put(enc);
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

    // ============================================
    // SYSTEM
    // ============================================

    async function systemPut(key, data) {
        if (!key) throw new Error('key обязателен');
        await ensureAplReady();
        let storedData = data;
        if (typeof data === 'string' && data.length > 0 && !isEncryptedString(data)) {
            try {
                if (window.Apl && window.Apl.isUnlocked && window.Apl.isUnlocked()) {
                    storedData = await window.Apl.encrypt(data);
                }
            } catch(e) {}
        }
        const db = await openDB();
        const t = db.transaction(STORE_SYSTEM, 'readwrite');
        t.objectStore(STORE_SYSTEM).put({ key: key, data: storedData, updated: Date.now() });
        return new Promise(function(resolve, reject) {
            t.oncomplete = function() { resolve(true); };
            t.onerror = function() { reject(t.error); };
        });
    }

    async function systemGet(key) {
        await ensureAplReady();
        const db = await openDB();
        const t = db.transaction(STORE_SYSTEM, 'readonly');
        const req = t.objectStore(STORE_SYSTEM).get(key);
        const row = await reqToPromise(req);
        if (!row) return null;
        const v = row.data;
        if (isEncryptedString(v)) {
            try {
                if (window.Apl && typeof window.Apl.decrypt === 'function') {
                    return await window.Apl.decrypt(v);
                }
            } catch(e) {
                return v;
            }
        }
        return v;
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

    // ============================================
    // ДИАГНОСТИКА
    // ============================================

    async function estimate() {
        if (navigator.storage && navigator.storage.estimate) {
            try { return await navigator.storage.estimate(); } catch(e) {}
        }
        return null;
    }

    window.OSStorage = {
        open: openDB,
        ready: ensureAplReady,
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