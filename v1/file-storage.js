// file-storage.js — общее хранилище файлов (Firebase Firestore + локальный кеш)

(function() {
    'use strict';

    const KEY = 'shnuk_files';

    let cache = null;

    function getLocal() {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(f => f && f.name && f.data);
        } catch(e) {
            return [];
        }
    }

    function setLocal(list) {
        try {
            localStorage.setItem(KEY, JSON.stringify(list || []));
            return true;
        } catch(e) {
            console.warn('[Files] Ошибка записи в localStorage:', e);
            return false;
        }
    }

    function get() {
        if (cache !== null) return cache;
        cache = getLocal();
        return cache;
    }

    function set(list) {
        const arr = Array.isArray(list) ? list.slice() : [];
        cache = arr;
        const ok = setLocal(arr);
        if (ok) notify(arr.length);
        return ok;
    }

    function notify(count) {
        try {
            window.dispatchEvent(new CustomEvent('shnuk:files-changed', { detail: { count: count } }));
        } catch(e) {}
    }

    async function syncToCloud() {
        if (!window.firebaseDb || !window.firebaseSDK) return false;
        if (!window.Auth || !window.Auth.isLoggedIn()) return false;

        const user = window.Auth.getUser();
        const { doc, setDoc, serverTimestamp } = window.firebaseSDK;

        try {
            const payload = JSON.stringify(get());
            const encoded = btoa(unescape(encodeURIComponent(payload)));
            const ref = doc(window.firebaseDb, 'user_files', user.uid);
            await setDoc(ref, {
                uid: user.uid,
                data: encoded,
                count: get().length,
                updatedAt: serverTimestamp()
            }, { merge: true });
            return true;
        } catch(e) {
            console.warn('[Files] Ошибка синхронизации в Firebase:', e);
            return false;
        }
    }

    async function pullFromCloud() {
        if (!window.firebaseDb || !window.firebaseSDK) return false;
        if (!window.Auth || !window.Auth.isLoggedIn()) return false;

        const user = window.Auth.getUser();
        const { doc, getDoc } = window.firebaseSDK;

        try {
            const ref = doc(window.firebaseDb, 'user_files', user.uid);
            const snap = await getDoc(ref);
            if (!snap.exists()) return false;
            const data = snap.data();
            if (!data || !data.data) return false;

            const decoded = decodeURIComponent(escape(atob(data.data)));
            const parsed = JSON.parse(decoded);
            if (!Array.isArray(parsed)) return false;

            set(parsed);
            return true;
        } catch(e) {
            console.warn('[Files] Ошибка загрузки из Firebase:', e);
            return false;
        }
    }

    function add(fileData) {
        if (!fileData || !fileData.name || !fileData.data) return false;
        const list = get().slice();
        list.push(fileData);
        const ok = set(list);
        if (ok) {
            syncToCloud();
        }
        return ok;
    }

    function remove(id) {
        const list = get().filter(f => f.id !== id);
        const ok = set(list);
        if (ok) {
            syncToCloud();
        }
        return ok;
    }

    function clear() {
        cache = [];
        try { localStorage.removeItem(KEY); } catch(e) {}
        notify(0);
        syncToCloud();
        return true;
    }

    function count() { return get().length; }
    function max() { return Infinity; }

    window.SharedFiles = {
        get: get,
        set: set,
        add: add,
        remove: remove,
        clear: clear,
        count: count,
        max: max,
        syncToCloud: syncToCloud,
        pullFromCloud: pullFromCloud
    };

})();