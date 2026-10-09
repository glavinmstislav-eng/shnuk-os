// svaer.js

(function() {
    'use strict';

    const STORAGE_PREFIX = 'shnuk_';

    class Svaer {
        constructor() {
            this.prefix = STORAGE_PREFIX;
        }

        async _encrypt(value) {
            try {
                if (!window.Apl) return JSON.stringify(value);
                return await window.Apl.encrypt(JSON.stringify(value));
            } catch(e) {
                return JSON.stringify(value);
            }
        }

        async _decrypt(data) {
            try {
                if (!window.Apl) return JSON.parse(data);
                if (typeof data !== 'string') return data;
                if (data.indexOf('A1:') !== 0 && data.indexOf('A2:') !== 0) {
                    try { return JSON.parse(data); } catch(e) { return null; }
                }
                const dec = await window.Apl.decrypt(data);
                if (typeof dec !== 'string') return null;
                if (dec.indexOf('A1:') === 0 || dec.indexOf('A2:') === 0) return null;
                return JSON.parse(dec);
            } catch(e) {
                return null;
            }
        }

        async set(key, value) {
            try {
                const enc = await this._encrypt(value);
                localStorage.setItem(this.prefix + key, enc);
                return true;
            } catch(e) {
                return false;
            }
        }

        async get(key, defaultValue) {
            defaultValue = defaultValue === undefined ? null : defaultValue;
            try {
                const data = localStorage.getItem(this.prefix + key);
                if (data === null) return defaultValue;
                const out = await this._decrypt(data);
                return out === null ? defaultValue : out;
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

        async clear() {
            const keys = this.keys();
            keys.forEach(key => this.remove(key));
        }

        async getAll() {
            const data = {};
            const keys = this.keys();
            for (let i = 0; i < keys.length; i++) {
                data[keys[i]] = await this.get(keys[i]);
            }
            return data;
        }

        async export() {
            const all = await this.getAll();
            return JSON.stringify(all, null, 2);
        }

        async import(json) {
            try {
                const data = JSON.parse(json);
                if (typeof data === 'object' && data !== null) {
                    let count = 0;
                    for (const [key, value] of Object.entries(data)) {
                        await this.set(key, value);
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