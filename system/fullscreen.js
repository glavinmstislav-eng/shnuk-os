//fullscreen
(function() {
    'use strict';

    console.log('[Fullscreen] Загрузка...');

    const FULLSCREEN_KEY = 'shnuk_fullscreen_auto';

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

    function isSupported() {
        return !!(requestFS && exitFS);
    }

    function isFullscreen() {
        return !!fullscreenElement();
    }

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
        if (isFullscreen()) return;

        if (!isAutoEnabled()) return;

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
        doc.removeEventListener('fullscreenchange', callback);
        doc.removeEventListener('webkitfullscreenchange', callback);
        doc.removeEventListener('mozfullscreenchange', callback);
        doc.removeEventListener('MSFullscreenChange', callback);
    }

    function initHotkeys() {
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
                e.preventDefault();
                toggle();
            }
        });
    }

    function init() {
        console.log('[Fullscreen] Инициализация...');

        if (!isSupported()) {
            console.warn('[Fullscreen] API не поддерживается');
            return;
        }

        initHotkeys();
        tryAutoEnter();

        console.log('[Fullscreen] ✅ Готов');
    }

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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('[Fullscreen] ✅ Загружено');

})();