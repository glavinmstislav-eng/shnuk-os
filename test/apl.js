// apl.js — изолированный модуль шифрования данных
// AES-256-GCM + Argon2id (libsodium).
// Мастер-ключ генерируется автоматически и заворачивается через KEK.
// Ключ обёртки (kekPassword) хранится в ОТДЕЛЬНОЙ IndexedDB (__apl_wrap),
// чтобы wrappedKey и его KEK не лежали в одной записи.

(function() {
    'use strict';

    const VAULT_DB = '__apl_vault';
    const VAULT_STORE = 'vault';
    const VAULT_VERSION = 3;
    const VAULT_KEY = 'k';

    const WRAP_DB = '__apl_wrap';
    const WRAP_STORE = 'wrap';
    const WRAP_VERSION = 1;
    const WRAP_KEY = 'w';

    const PREFIX = 'A2:';
    const LEGACY_PREFIX = 'A1:';

    const ARGON2_OPSLIMIT = 3;
    const ARGON2_MEMLIMIT = 64 * 1024 * 1024;
    const ARGON2_SALT_BYTES = 16;

    const PBKDF2_ITERATIONS = 600000;
    const PBKDF2_HASH = 'SHA-512';

    const SECRET_SALT_BYTES = 16;
    const SECRET_PBKDF2_ITERATIONS = 600000;
    const SECRET_ARGON2_OPSLIMIT = 3;
    const SECRET_ARGON2_MEMLIMIT = 64 * 1024 * 1024;

    const SESSION_KEY = 'shnuk_master_session';

    let masterKey = null;
    let readyPromise = null;
    let sodiumReady = false;
    let sodiumInstance = null;
    let unlocked = false;
    let vaultMeta = null;

    // ============================================
    // IndexedDB: __apl_vault (wrapped master key)
    // ============================================

    function openVault() {
        return new Promise(function(resolve, reject) {
            if (!window.indexedDB) { reject(new Error('no idb')); return; }
            const req = indexedDB.open(VAULT_DB, VAULT_VERSION);
            req.onupgradeneeded = function(e) {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(VAULT_STORE)) {
                    db.createObjectStore(VAULT_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = function() { resolve(req.result); };
            req.onerror = function() { reject(req.error); };
        });
    }

    function vaultGet() {
        return openVault().then(function(db) {
            return new Promise(function(resolve, reject) {
                const t = db.transaction(VAULT_STORE, 'readonly');
                const s = t.objectStore(VAULT_STORE);
                const r = s.get(VAULT_KEY);
                r.onsuccess = function() { resolve(r.result ? r.result.data : null); };
                r.onerror = function() { reject(r.error); };
            });
        });
    }

    function vaultPut(data) {
        return openVault().then(function(db) {
            return new Promise(function(resolve, reject) {
                const t = db.transaction(VAULT_STORE, 'readwrite');
                t.objectStore(VAULT_STORE).put({ id: VAULT_KEY, data: data, updated: Date.now() });
                t.oncomplete = function() { resolve(true); };
                t.onerror = function() { reject(t.error); };
            });
        });
    }

    function vaultDelete() {
        return openVault().then(function(db) {
            return new Promise(function(resolve) {
                const t = db.transaction(VAULT_STORE, 'readwrite');
                t.objectStore(VAULT_STORE).delete(VAULT_KEY);
                t.oncomplete = function() { resolve(true); };
                t.onerror = function() { resolve(false); };
            });
        });
    }

    // ============================================
    // IndexedDB: __apl_wrap (kekPassword)
    // ============================================

    function openWrap() {
        return new Promise(function(resolve, reject) {
            if (!window.indexedDB) { reject(new Error('no idb')); return; }
            const req = indexedDB.open(WRAP_DB, WRAP_VERSION);
            req.onupgradeneeded = function(e) {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(WRAP_STORE)) {
                    db.createObjectStore(WRAP_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = function() { resolve(req.result); };
            req.onerror = function() { reject(req.error); };
        });
    }

    function wrapGet() {
        return openWrap().then(function(db) {
            return new Promise(function(resolve, reject) {
                const t = db.transaction(WRAP_STORE, 'readonly');
                const s = t.objectStore(WRAP_STORE);
                const r = s.get(WRAP_KEY);
                r.onsuccess = function() { resolve(r.result ? r.result.data : null); };
                r.onerror = function() { reject(r.error); };
            });
        });
    }

    function wrapPut(data) {
        return openWrap().then(function(db) {
            return new Promise(function(resolve, reject) {
                const t = db.transaction(WRAP_STORE, 'readwrite');
                t.objectStore(WRAP_STORE).put({ id: WRAP_KEY, data: data, updated: Date.now() });
                t.oncomplete = function() { resolve(true); };
                t.onerror = function() { reject(t.error); };
            });
        });
    }

    function wrapDelete() {
        return openWrap().then(function(db) {
            return new Promise(function(resolve) {
                const t = db.transaction(WRAP_STORE, 'readwrite');
                t.objectStore(WRAP_STORE).delete(WRAP_KEY);
                t.oncomplete = function() { resolve(true); };
                t.onerror = function() { resolve(false); };
            });
        });
    }

    // ============================================
    // Утилиты
    // ============================================

    function randomBytes(n) {
        const arr = new Uint8Array(n);
        if (!window.crypto || !window.crypto.getRandomValues) {
            throw new Error('crypto.getRandomValues недоступен');
        }
        window.crypto.getRandomValues(arr);
        return arr;
    }

    function toBase64(bytes) {
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    }

    function fromBase64(str) {
        const binary = atob(str);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function concatBytes() {
        const parts = Array.prototype.slice.call(arguments);
        let total = 0;
        for (let i = 0; i < parts.length; i++) total += parts[i].length;
        const out = new Uint8Array(total);
        let off = 0;
        for (let i = 0; i < parts.length; i++) {
            out.set(parts[i], off);
            off += parts[i].length;
        }
        return out;
    }

    function wipe(arr) {
        if (!arr) return;
        for (let i = 0; i < arr.length; i++) arr[i] = 0;
    }

    function constantTimeStringEqual(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') return false;
        if (a.length !== b.length) return false;
        let diff = 0;
        for (let i = 0; i < a.length; i++) {
            diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return diff === 0;
    }

    // ============================================
    // libsodium (локально)
    // ============================================

    function loadSodium() {
        return new Promise(function(resolve) {
            if (window.sodium && window.sodium.crypto_pwhash) {
                sodiumInstance = window.sodium;
                sodiumReady = true;
                resolve(true);
                return;
            }
            if (window.__aplSodiumLoading) {
                const check = setInterval(function() {
                    if (window.sodium && window.sodium.crypto_pwhash) {
                        clearInterval(check);
                        sodiumInstance = window.sodium;
                        sodiumReady = true;
                        resolve(true);
                    }
                }, 50);
                setTimeout(function() { clearInterval(check); resolve(false); }, 8000);
                return;
            }
            window.__aplSodiumLoading = true;
            const script = document.createElement('script');
            script.src = 'sodium.js';
            script.async = true;
            script.onload = function() {
                if (window.sodium && typeof window.sodium.ready !== 'undefined') {
                    window.sodium.ready.then(function() {
                        sodiumInstance = window.sodium;
                        sodiumReady = true;
                        window.__aplSodiumLoading = false;
                        resolve(true);
                    }).catch(function() {
                        window.__aplSodiumLoading = false;
                        resolve(false);
                    });
                } else {
                    window.__aplSodiumLoading = false;
                    resolve(false);
                }
            };
            script.onerror = function() {
                window.__aplSodiumLoading = false;
                resolve(false);
            };
            document.head.appendChild(script);
        });
    }

    // ============================================
    // KDF
    // ============================================

    async function deriveKekRaw(password, salt, params) {
        if (sodiumReady && sodiumInstance && sodiumInstance.crypto_pwhash) {
            try {
                const opslimit = (params && params.argon2Ops) || ARGON2_OPSLIMIT;
                const memlimit = (params && params.argon2Mem) || ARGON2_MEMLIMIT;
                const keyBytes = sodiumInstance.crypto_pwhash(
                    32,
                    password,
                    salt,
                    opslimit,
                    memlimit,
                    sodiumInstance.crypto_pwhash_ALG_ARGON2ID13
                );
                return { bytes: keyBytes, method: 'argon2id' };
            } catch(e) {}
        }

        const baseKey = await window.crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
        );
        const bits = await window.crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: (params && params.pbkdf2Iter) || PBKDF2_ITERATIONS,
                hash: PBKDF2_HASH
            },
            baseKey,
            256
        );
        return { bytes: new Uint8Array(bits), method: 'pbkdf2-sha512' };
    }

    async function deriveKekCryptoKey(rawBytes) {
        return await window.crypto.subtle.importKey(
            'raw',
            rawBytes,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    // ============================================
    // Сессионный кеш мастер-ключа
    // ============================================

    function getSessionStore() {
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.token || !parsed.iv || !parsed.data) return null;
            return parsed;
        } catch(e) {
            return null;
        }
    }

    function setSessionStore(token, iv, data) {
        try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                token: toBase64(token),
                iv: toBase64(iv),
                data: toBase64(data),
                created: Date.now()
            }));
        } catch(e) {}
    }

    function clearSessionStore() {
        try { sessionStorage.removeItem(SESSION_KEY); } catch(e) {}
    }

    async function saveMasterKeyToSession(rawMasterBytes) {
        try {
            const token = randomBytes(32);
            const iv = randomBytes(12);
            const tokenKey = await window.crypto.subtle.importKey(
                'raw',
                token,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            const cipher = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv, tagLength: 128 },
                tokenKey,
                rawMasterBytes
            );
            setSessionStore(token, iv, new Uint8Array(cipher));
            wipe(token);
        } catch(e) {}
    }

    async function loadMasterKeyFromSession() {
        const store = getSessionStore();
        if (!store) return null;
        try {
            const token = fromBase64(store.token);
            const iv = fromBase64(store.iv);
            const data = fromBase64(store.data);
            const tokenKey = await window.crypto.subtle.importKey(
                'raw',
                token,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            const plainBuf = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv, tagLength: 128 },
                tokenKey,
                data
            );
            wipe(token);
            return new Uint8Array(plainBuf);
        } catch(e) {
            clearSessionStore();
            return null;
        }
    }

    // ============================================
    // Создание vault
    // ============================================

    async function createVault() {
        // 1. Случайный мастер-ключ.
        const rawMaster = randomBytes(32);

        // 2. Случайный kekPassword, который уйдёт в отдельную БД.
        const kekPasswordBytes = randomBytes(32);
        const kekPassword = toBase64(kekPasswordBytes);

        // 3. Обёртка мастер-ключа через KEK.
        const wrapSalt = randomBytes(ARGON2_SALT_BYTES);
        const derived = await deriveKekRaw(kekPassword, wrapSalt, null);
        const kekCryptoKey = await deriveKekCryptoKey(derived.bytes);

        const wrapNonce = randomBytes(12);
        const wrapped = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: wrapNonce, tagLength: 128 },
            kekCryptoKey,
            rawMaster
        );
        const wrappedBytes = new Uint8Array(wrapped);

        // 4. Метаданные обёртки — в __apl_wrap.
        const wrapRecord = {
            v: 1,
            kekPassword: kekPassword,
            method: derived.method,
            argon2Ops: ARGON2_OPSLIMIT,
            argon2Mem: ARGON2_MEMLIMIT,
            pbkdf2Iter: PBKDF2_ITERATIONS,
            created: Date.now()
        };
        await wrapPut(wrapRecord);

        // 5. Метаданные vault — в __apl_vault. Без kekPassword.
        const vault = {
            v: 3,
            method: derived.method,
            argon2Ops: ARGON2_OPSLIMIT,
            argon2Mem: ARGON2_MEMLIMIT,
            pbkdf2Iter: PBKDF2_ITERATIONS,
            wrapSalt: toBase64(wrapSalt),
            wrapNonce: toBase64(wrapNonce),
            wrappedKey: toBase64(wrappedBytes),
            created: Date.now()
        };
        await vaultPut(vault);

        // 6. Импорт мастер-ключа как CryptoKey для шифрования данных.
        const masterCryptoKey = await window.crypto.subtle.importKey(
            'raw',
            rawMaster,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        await saveMasterKeyToSession(rawMaster);

        wipe(rawMaster);
        wipe(kekPasswordBytes);
        wipe(derived.bytes);

        vaultMeta = vault;
        masterKey = masterCryptoKey;
        unlocked = true;
        return true;
    }

    async function unwrapVault(vault, wrapRecord) {
        if (!vault || vault.v !== 3) throw new Error('vault format');
        if (!wrapRecord || wrapRecord.v !== 1) throw new Error('wrap format');

        const wrapSalt = fromBase64(vault.wrapSalt);
        const wrapNonce = fromBase64(vault.wrapNonce);
        const wrappedBytes = fromBase64(vault.wrappedKey);

        const derived = await deriveKekRaw(wrapRecord.kekPassword, wrapSalt, vault);
        const kekCryptoKey = await deriveKekCryptoKey(derived.bytes);

        let rawMaster;
        try {
            rawMaster = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: wrapNonce, tagLength: 128 },
                kekCryptoKey,
                wrappedBytes
            );
        } catch(e) {
            wipe(derived.bytes);
            throw new Error('unwrap failed');
        }

        const rawBytes = new Uint8Array(rawMaster);
        const masterCryptoKey = await window.crypto.subtle.importKey(
            'raw',
            rawBytes,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        await saveMasterKeyToSession(rawBytes);

        wipe(rawBytes);
        wipe(derived.bytes);

        masterKey = masterCryptoKey;
        vaultMeta = vault;
        unlocked = true;
        return true;
    }

    // ============================================
    // Публичный API
    // ============================================

    async function ensureReady() {
        if (readyPromise) return readyPromise;
        readyPromise = (async function() {
            await loadSodium();

            let vault = null;
            let wrap = null;
            try { vault = await vaultGet(); } catch(e) { vault = null; }
            try { wrap = await wrapGet(); } catch(e) { wrap = null; }

            vaultMeta = vault || null;

            if (!vault) {
                // Первый запуск — создаём обе базы.
                await createVault();
                return true;
            }

            if (!wrap) {
                // Vault есть, а обёртки нет — это повреждённое состояние.
                // Создаём новый vault заново, старые данные недоступны.
                await vaultDelete();
                await createVault();
                return true;
            }

            // Пробуем восстановить сессию.
            const restored = await tryRestoreSessionInternal(vault, wrap);
            if (!restored) {
                // Сессии нет — разворачиваем сразу, без запроса пароля.
                await unwrapVault(vault, wrap);
            }
            return true;
        })();
        return readyPromise;
    }

    async function tryRestoreSessionInternal(vault, wrap) {
        if (unlocked) return true;
        if (!vault || vault.v !== 3) return false;

        const rawMaster = await loadMasterKeyFromSession();
        if (!rawMaster || rawMaster.length !== 32) return false;

        try {
            const masterCryptoKey = await window.crypto.subtle.importKey(
                'raw',
                rawMaster,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            wipe(rawMaster);
            masterKey = masterCryptoKey;
            vaultMeta = vault;
            unlocked = true;
            return true;
        } catch(e) {
            wipe(rawMaster);
            return false;
        }
    }

    async function tryRestoreSession() {
        await ensureReady();
        return unlocked;
    }

    function isUnlocked() {
        return unlocked && !!masterKey;
    }

    async function hasVault() {
        await ensureReady();
        return !!(vaultMeta && vaultMeta.v === 3);
    }

    async function encrypt(text) {
        if (!unlocked || !masterKey) return text;
        if (text === null || text === undefined) return text;
        if (typeof text !== 'string') text = String(text);

        try {
            const nonce = randomBytes(12);
            const plaintext = new TextEncoder().encode(text);
            const cipherBuf = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: nonce, tagLength: 128 },
                masterKey,
                plaintext
            );
            const cipherBytes = new Uint8Array(cipherBuf);
            const combined = concatBytes(nonce, cipherBytes);
            return PREFIX + toBase64(combined);
        } catch(e) {
            return text;
        }
    }

    async function decrypt(payload) {
        if (!unlocked || !masterKey) return payload;
        if (payload === null || payload === undefined) return payload;
        if (typeof payload !== 'string') return payload;

        if (payload.indexOf(PREFIX) === 0) {
            try {
                const combined = fromBase64(payload.substring(PREFIX.length));
                if (combined.length < 12 + 16) return payload;
                const nonce = combined.subarray(0, 12);
                const cipherBytes = combined.subarray(12);
                const plainBuf = await window.crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
                    masterKey,
                    cipherBytes
                );
                return new TextDecoder().decode(plainBuf);
            } catch(e) {
                return payload;
            }
        }

        if (payload.indexOf(LEGACY_PREFIX) === 0) {
            return payload;
        }

        return payload;
    }

    async function encryptJSON(value) {
        if (value === null || value === undefined) return value;
        try {
            return await encrypt(JSON.stringify(value));
        } catch(e) {
            return value;
        }
    }

    async function decryptJSON(payload) {
        if (payload === null || payload === undefined) return payload;
        try {
            const s = await decrypt(payload);
            if (typeof s !== 'string') return payload;
            if (s.indexOf(PREFIX) === 0 || s.indexOf(LEGACY_PREFIX) === 0) return payload;
            return JSON.parse(s);
        } catch(e) {
            return payload;
        }
    }

    async function deriveSecret(secret) {
        if (secret === null || secret === undefined) throw new Error('empty secret');
        const s = String(secret);
        const salt = randomBytes(SECRET_SALT_BYTES);
        const derived = await deriveKekRaw(s, salt, null);
        const out = {
            hash: toBase64(derived.bytes),
            salt: toBase64(salt),
            method: derived.method,
            argon2Ops: SECRET_ARGON2_OPSLIMIT,
            argon2Mem: SECRET_ARGON2_MEMLIMIT,
            pbkdf2Iter: SECRET_PBKDF2_ITERATIONS,
            created: Date.now()
        };
        wipe(derived.bytes);
        return out;
    }

    async function verifySecret(secret, stored) {
        if (!stored || !stored.hash || !stored.salt) return false;
        if (secret === null || secret === undefined) return false;
        const s = String(secret);
        const salt = fromBase64(stored.salt);
        const derived = await deriveKekRaw(s, salt, stored);
        const candidate = toBase64(derived.bytes);
        wipe(derived.bytes);
        return constantTimeStringEqual(candidate, stored.hash);
    }

    async function destroy() {
        try { await vaultDelete(); } catch(e) {}
        try { await wrapDelete(); } catch(e) {}
        try {
            await new Promise(function(resolve) {
                const req = indexedDB.deleteDatabase(VAULT_DB);
                req.onsuccess = function() { resolve(); };
                req.onerror = function() { resolve(); };
                req.onblocked = function() { resolve(); };
                setTimeout(resolve, 1500);
            });
        } catch(e) {}
        try {
            await new Promise(function(resolve) {
                const req = indexedDB.deleteDatabase(WRAP_DB);
                req.onsuccess = function() { resolve(); };
                req.onerror = function() { resolve(); };
                req.onblocked = function() { resolve(); };
                setTimeout(resolve, 1500);
            });
        } catch(e) {}
        clearSessionStore();
        masterKey = null;
        readyPromise = null;
        unlocked = false;
        vaultMeta = null;
        sodiumInstance = null;
        sodiumReady = false;
    }

    async function lock() {
        masterKey = null;
        unlocked = false;
        clearSessionStore();
    }

    window.Apl = {
        ready: ensureReady,
        hasVault: hasVault,
        tryRestoreSession: tryRestoreSession,
        isUnlocked: isUnlocked,
        lock: lock,
        encrypt: encrypt,
        decrypt: decrypt,
        encryptJSON: encryptJSON,
        decryptJSON: decryptJSON,
        deriveSecret: deriveSecret,
        verifySecret: verifySecret,
        destroy: destroy
    };

})();