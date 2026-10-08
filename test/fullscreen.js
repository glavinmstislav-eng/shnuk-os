// fullscreen.js — Управление полноэкранным режимом

(function() {
    'use strict';

    console.log('[Fullscreen] Загрузка...');

    const FULLSCREEN_KEY = 'shnuk_fullscreen_auto';

    // ============================================
    // ОПРЕДЕЛЕНИЕ API
    // ============================================
    const doc = document;
    const docEl = document.documentElement;

    const requestFS = docEl.requestFullscreen ||
                      docEl.webkitRequestFullscreen ||
                      docEl.mozRequestFullScreen ||
                      docEl.msRequestFullscreen;

    const exitFS = doc.exitFullscreen ||
                   doc.webkitExitFullscreen ||
                   doc.mozCancelFullScreen ||
                   doc.msExitFullscreen;

    const fullscreenElement = () => {
        return doc.fullscreenElement ||
               doc.webkitFullscreenElement ||
               doc.mozFullScreenElement ||
               doc.msFullscreenElement;
    };

    // ============================================
    // ПРОВЕРКА ПОДДЕРЖКИ
    // ============================================
    function isSupported() {
        return !!(requestFS && exitFS);
    }

    function isFullscreen() {
        return !!fullscreenElement();
    }

    // ============================================
    // ВХОД / ВЫХОД
    // ============================================
    function enter() {
        if (!isSupported()) {
            console.warn('[Fullscreen] Не поддерживается браузером');
            return Promise.reject(new Error('Fullscreen not supported'));
        }

        if (isFullscreen()) {
            return Promise.resolve();
        }

        try {
            const result = requestFS.call(docEl);
            if (result && typeof result.then === 'function') {
                return result.catch(function(err) {
                    console.warn('[Fullscreen] Ошибка входа:', err);
                    // Fallback — используем webkit-версию
                    if (docEl.webkitRequestFullscreen) {
                        return docEl.webkitRequestFullscreen();
                    }
                    throw err;
                });
            }
            return Promise.resolve();
        } catch(e) {
            console.warn('[Fullscreen] Ошибка:', e);
            return Promise.reject(e);
        }
    }

    function exit() {
        if (!isSupported()) {
            return Promise.resolve();
        }

        if (!isFullscreen()) {
            return Promise.resolve();
        }

        try {
            const result = exitFS.call(doc);
            if (result && typeof result.then === 'function') {
                return result.catch(function(err) {
                    console.warn('[Fullscreen] Ошибка выхода:', err);
                    throw err;
                });
            }
            return Promise.resolve();
        } catch(e) {
            console.warn('[Fullscreen] Ошибка:', e);
            return Promise.reject(e);
        }
    }

    function toggle() {
        if (isFullscreen()) {
            return exit();
        }
        return enter();
    }

    // ============================================
    // АВТО-ВХОД
    // ============================================
    function isAutoEnabled() {
        try {
            return localStorage.getItem(FULLSCREEN_KEY) === 'true';
        } catch(e) {
            return false;
        }
    }

    function setAuto(enabled) {
        try {
            localStorage.setItem(FULLSCREEN_KEY, enabled ? 'true' : 'false');
            return true;
        } catch(e) {
            return false;
        }
    }

    function tryAutoEnter() {
        // Не пытаемся автоматически если уже в fullscreen
        if (isFullscreen()) return;

        // Проверяем флаг авто-режима
        if (!isAutoEnabled()) return;

        // Пытаемся войти при первом взаимодействии с пользователем
        const tryEnter = function() {
            enter().catch(function() {});
            
            document.removeEventListener('click', tryEnter);
            document.removeEventListener('touchstart', tryEnter);
            document.removeEventListener('keydown', tryEnter);
        };

        document.addEventListener('click', tryEnter, { once: true });
        document.addEventListener('touchstart', tryEnter, { once: true });
        document.addEventListener('keydown', tryEnter, { once: true });
    }

    // ============================================
    // СОБЫТИЯ
    // ============================================
    const listeners = [];

    function on(event, callback) {
        if (event === 'change') {
            const handler = function() {
                callback(isFullscreen());
            };
            listeners.push({
                change: handler,
                webkit: handler,
                moz: handler,
                ms: handler
            });
            
            doc.addEventListener('fullscreenchange', handler);
            doc.addEventListener('webkitfullscreenchange', handler);
            doc.addEventListener('mozfullscreenchange', handler);
            doc.addEventListener('MSFullscreenChange', handler);
        }
    }

    function off(event, callback) {
        // Упрощённая версия — игнорируем callback
        doc.removeEventListener('fullscreenchange', callback);
        doc.removeEventListener('webkitfullscreenchange', callback);
        doc.removeEventListener('mozfullscreenchange', callback);
        doc.removeEventListener('MSFullscreenChange', callback);
    }

    // ============================================
    // ГОРЯЧИЕ КЛАВИШИ
    // ============================================
    function initHotkeys() {
        document.addEventListener('keydown', function(e) {
            // F11 — стандартный полноэкранный режим браузера
            // Ctrl+Shift+F — альтернатива
            if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
                e.preventDefault();
                toggle();
            }
            // Escape — выход (браузер обрабатывает сам)
        });
    }

    // ============================================
    // АВТО-РЕЖИМ ПРИ СТАРТЕ
    // ============================================
    function init() {
        console.log('[Fullscreen] Инициализация...');

        // Проверяем поддержку
        if (!isSupported()) {
            console.warn('[Fullscreen] API не поддерживается');
            return;
        }

        // Инициализируем горячие клавиши
        initHotkeys();

        // Авто-вход если включено
        tryAutoEnter();

        console.log('[Fullscreen] ✅ Готов');
    }

    // ============================================
    // ЭКСПОРТ
    // ============================================
    window.Fullscreen = {
        enter: enter,
        exit: exit,
        toggle: toggle,
        isFullscreen: isFullscreen,
        isSupported: isSupported,
        isAutoEnabled: isAutoEnabled,
        setAuto: setAuto,
        on: on,
        off: off,
        init: init
    };

    // Авто-инициализация
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('[Fullscreen] ✅ Загружено');

})();