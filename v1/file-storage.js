// file-storage.js — общее хранилище файлов

(function() {
    'use strict';

    const KEY = 'shnuk_files';

    function get() {
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

    function set(list) {
        try {
            localStorage.setItem(KEY, JSON.stringify(list));
            return true;
        } catch(e) {
            return false;
        }
    }

    function add(fileData) {
        if (!fileData || !fileData.name || !fileData.data) return false;
        const list = get();
        list.push(fileData);
        const ok = set(list);
        if (ok) {
            try {
                window.dispatchEvent(new CustomEvent('shnuk:files-changed', { detail: { count: list.length } }));
            } catch(e) {}
        }
        return ok;
    }

    function remove(id) {
        const list = get().filter(f => f.id !== id);
        const ok = set(list);
        if (ok) {
            try {
                window.dispatchEvent(new CustomEvent('shnuk:files-changed', { detail: { count: list.length } }));
            } catch(e) {}
        }
        return ok;
    }

    window.SharedFiles = {
        get: get,
        set: set,
        add: add,
        remove: remove
    };

})();