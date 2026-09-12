// twirlay-core-save.js — Система оффлайн-сохранения для Twirlay OS

(function() {
    'use strict';

    console.log('[Twirlay Save] Загрузка системы оффлайн-сохранения...');

    // ============================================
    // 1. SERVICE WORKER ДЛЯ ОФФЛАЙН
    // ============================================
    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.warn('[Twirlay Save] Service Worker не поддерживается');
            return false;
        }

        // Список файлов для кеширования
        const CACHE_FILES = [
            '/',
            '/index.html',
            '/app-scanner.js',
            '/svaer.js',
            '/settings.js',
            '/game.js',
            '/time.js',
            '/file.js',
            '/widget-time.js',
            '/widget-digital-time.js',
            '/twirlay-core1.js',
            '/twirlay-core-save.js',
            '/assets/wall.png',
            '/assets/wall2.png',
            '/assets/wall3.png',
            '/assets/game1.png',
            '/assets/settings.png',
            '/assets/calc.png',
            '/assets/time.png',
            '/assets/shnukmarket.png',
            '/assets/studio.png',
            '/assets/app1.png',
            '/assets/app2.png',
            '/assets/app3.png',
            '/assets/app4.png',
            '/ST-SimpleSquare.ttf'
        ];

        // Создаём inline Service Worker
        const swCode = `
            const CACHE_NAME = 'twirlay-v1';
            const CACHE_FILES = ${JSON.stringify(CACHE_FILES)};

            self.addEventListener('install', function(e) {
                console.log('[SW] Установка...');
                e.waitUntil(
                    caches.open(CACHE_NAME).then(function(cache) {
                        console.log('[SW] Кеширование файлов...');
                        return cache.addAll(CACHE_FILES).catch(function(err) {
                            console.warn('[SW] Ошибка кеширования:', err);
                            // Продолжаем даже если некоторые файлы не закешировались
                        });
                    }).then(function() {
                        return self.skipWaiting();
                    })
                );
            });

            self.addEventListener('activate', function(e) {
                console.log('[SW] Активация...');
                e.waitUntil(
                    caches.keys().then(function(keys) {
                        return Promise.all(
                            keys.map(function(key) {
                                if (key !== CACHE_NAME) {
                                    console.log('[SW] Удаление старого кеша:', key);
                                    return caches.delete(key);
                                }
                            })
                        );
                    }).then(function() {
                        return self.clients.claim();
                    })
                );
            });

            self.addEventListener('fetch', function(e) {
                // Пропускаем запросы к аналитике и внешним ресурсам
                if (e.request.url.includes('google-analytics') || 
                    e.request.url.includes('facebook.com') ||
                    e.request.url.includes('doubleclick.net')) {
                    return;
                }

                e.respondWith(
                    caches.match(e.request).then(function(response) {
                        if (response) {
                            return response;
                        }
                        return fetch(e.request).catch(function() {
                            // Если файл не найден в кеше и оффлайн
                            return new Response('Offline', { 
                                status: 503, 
                                statusText: 'Service Unavailable' 
                            });
                        });
                    })
                );
            });
        `;

        try {
            // Создаём Blob с кодом Service Worker
            const blob = new Blob([swCode], { type: 'application/javascript' });
            const swUrl = URL.createObjectURL(blob);

            // Регистрируем Service Worker
            navigator.serviceWorker.register(swUrl, { scope: '/' })
                .then(function(reg) {
                    console.log('[Twirlay Save] ✅ Service Worker зарегистрирован');
                    
                    // Проверяем статус
                    if (reg.installing) {
                        console.log('[Twirlay Save] Установка SW...');
                    } else if (reg.waiting) {
                        console.log('[Twirlay Save] SW ожидает активации');
                    } else if (reg.active) {
                        console.log('[Twirlay Save] SW активен');
                    }
                    
                    return reg;
                })
                .catch(function(err) {
                    console.warn('[Twirlay Save] ❌ Ошибка регистрации SW:', err);
                    return false;
                });

            // Периодическая проверка обновлений
            setInterval(function() {
                if (navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        type: 'CHECK_UPDATE'
                    });
                }
            }, 60000); // Каждую минуту

            return true;

        } catch(e) {
            console.warn('[Twirlay Save] ❌ Ошибка создания SW:', e);
            return false;
        }
    }

    // ============================================
    // 2. КЕШИРОВАНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ
    // ============================================
    function initUserDataCache() {
        // Сохраняем ключевые данные в отдельный кеш
        const USER_DATA_KEYS = [
            'shnuk_wallpaper',
            'shnuk_wallpaper_name',
            'shnuk_desktop',
            'shnuk_widget',
            'shnuk_password',
            'shnuk_files',
            'shnuk_installed_apps',
            'shnuk_installed_apps_data',
            'shnuk_custom_wallpapers'
        ];

        // Создаём резервную копию данных
        function backupUserData() {
            try {
                const data = {};
                for (const key of USER_DATA_KEYS) {
                    const value = localStorage.getItem(key);
                    if (value !== null) {
                        data[key] = value;
                    }
                }
                
                // Сохраняем в сессию для восстановления
                sessionStorage.setItem('twirlay_backup', JSON.stringify(data));
                console.log('[Twirlay Save] ✅ Данные пользователя сохранены в кеш');
                return true;
            } catch(e) {
                console.warn('[Twirlay Save] ❌ Ошибка бэкапа данных:', e);
                return false;
            }
        }

        // Восстановление данных из бэкапа
        function restoreUserData() {
            try {
                const backup = sessionStorage.getItem('twirlay_backup');
                if (!backup) return false;

                const data = JSON.parse(backup);
                let restored = 0;

                for (const [key, value] of Object.entries(data)) {
                    if (!localStorage.getItem(key)) {
                        localStorage.setItem(key, value);
                        restored++;
                    }
                }

                if (restored > 0) {
                    console.log('[Twirlay Save] ✅ Восстановлено данных:', restored);
                }
                return true;
            } catch(e) {
                console.warn('[Twirlay Save] ❌ Ошибка восстановления:', e);
                return false;
            }
        }

        // Создаём бэкап при загрузке
        backupUserData();

        // Создаём бэкап при изменении данных
        const originalSetItem = localStorage.setItem;
        localStorage.setItem = function(key, value) {
            originalSetItem.call(this, key, value);
            if (USER_DATA_KEYS.includes(key)) {
                backupUserData();
            }
        };

        // Экспортируем функции
        window.twirlayBackup = {
            backup: backupUserData,
            restore: restoreUserData,
            keys: USER_DATA_KEYS
        };

        return true;
    }

    // ============================================
    // 3. ПРОВЕРКА ОНЛАЙН/ОФФЛАЙН СТАТУСА
    // ============================================
    function initOnlineStatus() {
        let isOnline = navigator.onLine;
        
        function updateStatus() {
            const newStatus = navigator.onLine;
            if (newStatus !== isOnline) {
                isOnline = newStatus;
                console.log('[Twirlay Save] Статус:', isOnline ? '🟢 Онлайн' : '🔴 Оффлайн');
                
                // Показываем уведомление
                showStatusNotification(isOnline);
                
                // Если стали онлайн - проверяем обновления
                if (isOnline) {
                    checkForUpdates();
                }
            }
        }

        function showStatusNotification(online) {
            const existing = document.querySelector('.twirlay-status-notification');
            if (existing) existing.remove();

            const notification = document.createElement('div');
            notification.className = 'twirlay-status-notification';
            notification.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 8px 20px;
                font-family: 'ST-SimpleSquare', monospace;
                font-size: 13px;
                color: #ffffff;
                background: ${online ? '#4CAF50' : '#cc0000'};
                z-index: 999999;
                border: 2px solid rgba(255,255,255,0.2);
                opacity: 0;
                transition: opacity 0.3s ease;
                pointer-events: none;
            `;
            notification.textContent = online ? '🟢 Онлайн' : '🔴 Оффлайн режим';
            document.body.appendChild(notification);

            // Показываем
            setTimeout(() => { notification.style.opacity = '1'; }, 50);
            
            // Скрываем через 3 секунды
            setTimeout(() => {
                notification.style.opacity = '0';
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }

        function checkForUpdates() {
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'CHECK_UPDATE'
                });
            }
        }

        // Слушаем события
        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);

        // Периодическая проверка
        setInterval(updateStatus, 30000);

        // Начальный статус
        setTimeout(updateStatus, 500);

        return true;
    }

    // ============================================
    // 4. ПРЕДЗАГРУЗКА ВАЖНЫХ РЕСУРСОВ
    // ============================================
    function preloadImportantResources() {
        const importantUrls = [
            '/ST-SimpleSquare.ttf',
            '/assets/wall.png',
            '/assets/settings.png',
            '/assets/game1.png'
        ];

        // Предзагружаем в кеш через fetch
        for (const url of importantUrls) {
            try {
                fetch(url, { cache: 'force-cache' })
                    .catch(() => {});
            } catch(e) {}
        }

        // Предзагружаем шрифт через CSS
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'font';
        link.type = 'font/ttf';
        link.href = '/ST-SimpleSquare.ttf';
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);

        console.log('[Twirlay Save] ✅ Ресурсы предзагружены');
    }

    // ============================================
    // 5. ОФФЛАЙН-МЕНЕДЖЕР
    // ============================================
    function initOfflineManager() {
        const manager = {
            isOnline: navigator.onLine,
            
            // Проверить, доступен ли ресурс оффлайн
            isCached: function(url) {
                return caches.match(url).then(function(response) {
                    return !!response;
                });
            },

            // Принудительно закешировать URL
            cacheUrl: function(url) {
                return caches.open('twirlay-v1').then(function(cache) {
                    return cache.add(url).then(function() {
                        console.log('[Twirlay Save] Закешировано:', url);
                        return true;
                    }).catch(function() {
                        console.warn('[Twirlay Save] Не удалось закешировать:', url);
                        return false;
                    });
                });
            },

            // Кешировать несколько URL
            cacheUrls: function(urls) {
                return caches.open('twirlay-v1').then(function(cache) {
                    return cache.addAll(urls).then(function() {
                        console.log('[Twirlay Save] Закешировано URL:', urls.length);
                        return true;
                    }).catch(function(err) {
                        console.warn('[Twirlay Save] Ошибка кеширования:', err);
                        return false;
                    });
                });
            },

            // Очистить кеш
            clearCache: function() {
                return caches.delete('twirlay-v1').then(function() {
                    console.log('[Twirlay Save] Кеш очищен');
                    return true;
                });
            },

            // Показать размер кеша
            getCacheSize: function() {
                return caches.open('twirlay-v1').then(function(cache) {
                    return cache.keys().then(function(keys) {
                        return keys.length;
                    });
                });
            }
        };

        window.twirlayOffline = manager;

        console.log('[Twirlay Save] ✅ Оффлайн-менеджер инициализирован');
        return manager;
    }

    // ============================================
    // 6. ИНИЦИАЛИЗАЦИЯ
    // ============================================
    function initTwirlaySave() {
        console.log('[Twirlay Save] Инициализация...');

        let results = {
            serviceWorker: false,
            dataCache: false,
            onlineStatus: false,
            preload: false,
            offlineManager: false
        };

        // 1. Регистрация Service Worker
        results.serviceWorker = registerServiceWorker();

        // 2. Кеширование данных пользователя
        results.dataCache = initUserDataCache();

        // 3. Статус онлайн/оффлайн
        results.onlineStatus = initOnlineStatus();

        // 4. Предзагрузка ресурсов
        preloadImportantResources();
        results.preload = true;

        // 5. Оффлайн-менеджер
        results.offlineManager = !!initOfflineManager();

        // Вывод результатов
        console.log('[Twirlay Save] Инициализация завершена:', results);

        // Показываем статус
        const status = results.serviceWorker ? '✅' : '⚠️';
        console.log(`[Twirlay Save] ${status} Оффлайн-режим ${results.serviceWorker ? 'активен' : 'недоступен'}`);

        // Добавляем глобальный объект
        window.TwirlaySave = {
            version: '1.0.0',
            status: results,
            backup: window.twirlayBackup,
            offline: window.twirlayOffline,
            registerSW: registerServiceWorker,
            cacheUrl: function(url) {
                return caches.open('twirlay-v1').then(function(cache) {
                    return cache.add(url);
                });
            },
            cacheAll: function() {
                return caches.open('twirlay-v1').then(function(cache) {
                    const urls = [
                        '/',
                        '/index.html',
                        '/app-scanner.js',
                        '/svaer.js',
                        '/settings.js',
                        '/game.js',
                        '/time.js',
                        '/file.js',
                        '/widget-time.js',
                        '/widget-digital-time.js',
                        '/twirlay-core1.js',
                        '/twirlay-core-save.js',
                        '/assets/wall.png',
                        '/assets/wall2.png',
                        '/assets/wall3.png',
                        '/assets/game1.png',
                        '/assets/settings.png',
                        '/assets/calc.png',
                        '/assets/time.png',
                        '/assets/shnukmarket.png',
                        '/assets/studio.png',
                        '/assets/app1.png',
                        '/assets/app2.png',
                        '/assets/app3.png',
                        '/assets/app4.png',
                        '/ST-SimpleSquare.ttf'
                    ];
                    return cache.addAll(urls);
                });
            },
            isOnline: function() {
                return navigator.onLine;
            }
        };

        console.log('[Twirlay Save] ✅ Система оффлайн-сохранения загружена');
        console.log('[Twirlay Save] Используйте TwirlaySave для управления оффлайн-режимом');

        return results;
    }

    // ============================================
    // 7. АВТОМАТИЧЕСКИЙ ЗАПУСК
    // ============================================
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(initTwirlaySave, 100);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(initTwirlaySave, 100);
        });
    }

    // Если DOM уже загружен, но скрипт ещё выполняется
    if (document.readyState === 'loading') {
        document.addEventListener('readystatechange', function() {
            if (document.readyState === 'complete') {
                setTimeout(initTwirlaySave, 100);
            }
        });
    }

    console.log('[Twirlay Save] Скрипт загружен');

})();