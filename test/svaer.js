// svaer.js — простой враппер над localStorage

(function() {
    'use strict';

    const STORAGE_PREFIX = 'shnuk_';

    class Svaer {
        constructor() {
            this.prefix = STORAGE_PREFIX;
        }

        set(key, value) {
            try {
                localStorage.setItem(this.prefix + key, JSON.stringify(value));
                return true;
            } catch(e) {
                return false;
            }
        }

        get(key, defaultValue) {
            defaultValue = defaultValue === undefined ? null : defaultValue;
            try {
                const data = localStorage.getItem(this.prefix + key);
                if (data === null) return defaultValue;
                try {
                    return JSON.parse(data);
                } catch(e) {
                    return data;
                }
            } catch(e) {
                return defaultValue;
            }
        }

        remove(key) {
            localStorage.removeItem(this.prefix + key);
        }

        has(key) {
            return localStorage.getItem(this.prefix + key) !== null;
        }

        keys() {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.prefix)) {
                    keys.push(key.replace(this.prefix, ''));
                }
            }
            return keys;
        }

        clear() {
            const keys = this.keys();
            keys.forEach(key => this.remove(key));
        }

        getAll() {
            const data = {};
            const keys = this.keys();
            for (let i = 0; i < keys.length; i++) {
                data[keys[i]] = this.get(keys[i]);
            }
            return data;
        }

        export() {
            const all = this.getAll();
            return JSON.stringify(all, null, 2);
        }

        import(json) {
            try {
                const data = JSON.parse(json);
                if (typeof data === 'object' && data !== null) {
                    let count = 0;
                    for (const [key, value] of Object.entries(data)) {
                        this.set(key, value);
                        count++;
                    }
                    return count;
                }
                return 0;
            } catch(e) {
                return 0;
            }
        }
    }

    window.svaer = new Svaer();
    window.Svaer = Svaer;

})();