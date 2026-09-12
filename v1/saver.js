// svaer.js - Система сохранения для Shnuk OS

(function() {
    'use strict';

    const STORAGE_PREFIX = 'shnuk_';

    class Svaer {
        constructor() {
            this.prefix = STORAGE_PREFIX;
        }

        // Сохранить данные
        set(key, value) {
            try {
                const json = JSON.stringify(value);
                localStorage.setItem(this.prefix + key, json);
                return true;
            } catch(e) {
                console.error('[Svaer] Ошибка сохранения:', e);
                return false;
            }
        }

        // Получить данные
        get(key, defaultValue = null) {
            try {
                const data = localStorage.getItem(this.prefix + key);
                if (data === null) return defaultValue;
                return JSON.parse(data);
            } catch(e) {
                console.error('[Svaer] Ошибка чтения:', e);
                return defaultValue;
            }
        }

        // Удалить данные
        remove(key) {
            localStorage.removeItem(this.prefix + key);
        }

        // Проверить существование
        has(key) {
            return localStorage.getItem(this.prefix + key) !== null;
        }

        // Получить все ключи
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

        // Очистить все данные системы
        clear() {
            const keys = this.keys();
            keys.forEach(key => this.remove(key));
        }

        // Получить все данные
        getAll() {
            const data = {};
            const keys = this.keys();
            keys.forEach(key => {
                data[key] = this.get(key);
            });
            return data;
        }

        // Экспорт данных в JSON
        export() {
            return JSON.stringify(this.getAll(), null, 2);
        }

        // Импорт данных из JSON
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
                console.error('[Svaer] Ошибка импорта:', e);
                return 0;
            }
        }
    }

    // Создаём глобальный экземпляр
    window.svaer = new Svaer();
    window.Svaer = Svaer;

    console.log('[Svaer] Система сохранения загружена');

})();