// live-bar.js

(function() {
    'use strict';

    const BAR_ID = 'liveBar';
    const BAR_HEIGHT = 44;
    const BAR_HEIGHT_ACTIVE = 64;
    const BRIGHTNESS_KEY = 'shnuk_brightness';
    const ANON_KEY = 'shnuk_anon_mode';
    const THEME_KEY = 'shnuk_theme';

    const BAR_FONT = "'TTPaplane', monospace";

    let barEl = null;
    let leftSlot = null;
    let rightSlot = null;
    let clockInterval = null;
    let currentActivity = null;
    let overlayEl = null;
    let anonMode = false;

    const _origSetItem = Storage.prototype.setItem;
    const _origRemoveItem = Storage.prototype.removeItem;
    const _origClear = Storage.prototype.clear;

    Storage.prototype.setItem = function(key, value) {
        if (anonMode && key !== ANON_KEY && key !== BRIGHTNESS_KEY) return;
        return _origSetItem.call(this, key, value);
    };

    Storage.prototype.removeItem = function(key) {
        if (anonMode && key !== ANON_KEY && key !== BRIGHTNESS_KEY) return;
        return _origRemoveItem.call(this, key);
    };

    Storage.prototype.clear = function() {
        if (anonMode) {
            try { _origRemoveItem.call(this, ANON_KEY); } catch(e) {}
            try { _origRemoveItem.call(this, BRIGHTNESS_KEY); } catch(e) {}
            return;
        }
        return _origClear.call(this);
    };

    function getTheme() {
        try { return localStorage.getItem(THEME_KEY) || 'day'; } catch(e) { return 'day'; }
    }

    function getThemeColors() {
        const theme = getTheme();
        if (theme === 'evening') {
            return {
                bg: '#2a2a2a',
                text: '#ffffff',
                activeBg: 'rgba(30, 30, 30, 0.85)',
                activeText: '#ffffff'
            };
        }
        if (theme === 'warm-night') {
            return {
                bg: '#000000',
                text: '#ffffff',
                activeBg: 'rgba(0, 0, 0, 0.85)',
                activeText: '#ffffff'
            };
        }
        return {
            bg: '#ffffff',
            text: '#1a1a1a',
            activeBg: 'rgba(20, 20, 28, 0.72)',
            activeText: '#ffffff'
        };
    }

    function applyBarColors() {
        if (!barEl) return;
        const c = getThemeColors();
        if (currentActivity) {
            barEl.style.background = c.activeBg;
            barEl.style.color = c.activeText;
        } else {
            barEl.style.background = c.bg;
            barEl.style.color = c.text;
        }
    }

    function ensureOverlay() {
        if (overlayEl) return;
        overlayEl = document.createElement('div');
        overlayEl.id = 'brightnessOverlay';
        overlayEl.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%;
            height: 100%;
            background: #000000;
            opacity: 0;
            pointer-events: none;
            z-index: 2147483647;
            transition: opacity 0.2s ease;
        `;
        document.body.appendChild(overlayEl);
        applyBrightness();
    }

    function getBrightness() {
        let v = 100;
        try {
            const s = localStorage.getItem(BRIGHTNESS_KEY);
            if (s !== null) v = parseInt(s, 10);
            if (isNaN(v)) v = 100;
        } catch(e) {}
        return Math.max(0, Math.min(100, v));
    }

    function setBrightness(v) {
        v = Math.max(0, Math.min(100, v));
        try { _origSetItem.call(localStorage, BRIGHTNESS_KEY, String(v)); } catch(e) {}
        applyBrightness();
    }

    function applyBrightness() {
        if (!overlayEl) return;
        const v = getBrightness();
        overlayEl.style.opacity = String(0.75 - (v / 100) * 0.75);
    }

    function ensureAnonMode() {
        try {
            anonMode = localStorage.getItem(ANON_KEY) === 'true';
        } catch(e) { anonMode = false; }
    }

    function setAnonMode(on) {
        anonMode = !!on;
        try {
            if (anonMode) _origSetItem.call(localStorage, ANON_KEY, 'true');
            else _origRemoveItem.call(localStorage, ANON_KEY);
        } catch(e) {}
    }

    function formatClock() {
        const now = new Date();
        return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }

    function formatSeconds(total) {
        total = Math.max(0, Math.floor(total));
        const m = Math.floor(total / 60);
        const s = total % 60;
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function formatSecondsTenths(total) {
        total = Math.max(0, total);
        const m = Math.floor(total / 60);
        const s = Math.floor(total % 60);
        const t = Math.floor((total * 10) % 10);
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + t;
    }

    function buildLeftContent(activity) {
        if (!activity) return '';
        const p = activity.payload || {};
        if (activity.type === 'stopwatch') return 'Секундомер ' + formatSecondsTenths(p.elapsed || 0);
        if (activity.type === 'timer') return 'Таймер ' + formatSeconds(p.remaining || 0);
        if (activity.type === 'alarm') return 'Будильник ' + (p.time || '--:--');
        if (activity.type === 'recording') {
            const prefix = p.paused ? 'Пауза' : 'Запись';
            return prefix + ' ' + formatSecondsTenths(p.elapsed || 0);
        }
        if (activity.type === 'cooop') return p.text || 'Cooop';
        if (activity.type === 'custom') return p.text || '';
        return '';
    }

    function setCssVar(h) {
        document.documentElement.style.setProperty('--livebar-h', h + 'px');
    }

    function startClock() {
        if (clockInterval) return;
        clockInterval = setInterval(function() {
            if (!rightSlot) return;
            if (!barEl || !barEl.parentNode) return;
            rightSlot.textContent = formatClock();
        }, 1000);
    }

    function stopClock() {
        if (clockInterval) {
            clearInterval(clockInterval);
            clockInterval = null;
        }
    }

    function ensureBar() {
        if (barEl && !barEl.parentNode) {
            barEl = null;
            leftSlot = null;
            rightSlot = null;
            stopClock();
        }

        if (barEl) {
            startClock();
            return;
        }

        barEl = document.createElement('div');
        barEl.id = BAR_ID;
        barEl.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%;
            height: ${BAR_HEIGHT}px;
            z-index: 2147483646;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            box-sizing: border-box;
            font-family: ${BAR_FONT};
            pointer-events: auto;
            transition: height 0.45s cubic-bezier(0.22, 1, 0.36, 1),
                        background 0.45s cubic-bezier(0.22, 1, 0.36, 1),
                        color 0.45s cubic-bezier(0.22, 1, 0.36, 1),
                        align-items 0.45s cubic-bezier(0.22, 1, 0.36, 1),
                        padding 0.45s cubic-bezier(0.22, 1, 0.36, 1);
            will-change: height, background, align-items;
        `;

        leftSlot = document.createElement('div');
        leftSlot.id = 'liveBarLeft';
        leftSlot.style.cssText = `
            display: flex;
            align-items: center;
            font-family: ${BAR_FONT};
            font-size: 15px;
            font-weight: 600;
            letter-spacing: 0.5px;
            opacity: 0;
            transform: translateY(-4px);
            transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
            flex: 1;
            min-width: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;

        rightSlot = document.createElement('div');
        rightSlot.id = 'liveBarRight';
        rightSlot.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: flex-end;
            font-family: ${BAR_FONT};
            font-size: 15px;
            font-weight: 600;
            letter-spacing: 0.5px;
            flex-shrink: 0;
            transition: font-size 0.35s cubic-bezier(0.22, 1, 0.36, 1);
        `;
        rightSlot.textContent = formatClock();

        barEl.appendChild(leftSlot);
        barEl.appendChild(rightSlot);
        document.body.appendChild(barEl);

        applyBarColors();

        leftSlot.addEventListener('click', onLeftClick);
        startClock();
        setCssVar(BAR_HEIGHT);
    }

    function onLeftClick(e) {
        e.stopPropagation();
        if (currentActivity && currentActivity.appId) {
            const id = currentActivity.appId;
            if (typeof window[id + 'Init'] === 'function') {
                window[id + 'Init']();
            }
        }
    }

    function applyActivity(activity) {
        ensureBar();

        if (!activity) {
            currentActivity = null;
            barEl.style.height = BAR_HEIGHT + 'px';
            barEl.style.alignItems = 'center';
            barEl.style.padding = '0 20px';
            leftSlot.style.opacity = '0';
            leftSlot.style.transform = 'translateY(-4px)';
            leftSlot.textContent = '';
            leftSlot.style.pointerEvents = 'none';
            leftSlot.style.paddingBottom = '0';
            rightSlot.style.fontSize = '15px';
            rightSlot.textContent = formatClock();
            rightSlot.style.paddingBottom = '0';
            applyBarColors();
            setCssVar(BAR_HEIGHT);
            startClock();
            return;
        }

        currentActivity = activity;
        barEl.style.height = BAR_HEIGHT_ACTIVE + 'px';
        barEl.style.alignItems = 'flex-end';
        barEl.style.padding = '0 20px 14px';
        leftSlot.textContent = buildLeftContent(activity);
        leftSlot.style.opacity = '1';
        leftSlot.style.transform = 'translateY(0)';
        leftSlot.style.pointerEvents = 'auto';
        leftSlot.style.paddingBottom = '0';
        rightSlot.style.fontSize = '20px';
        rightSlot.textContent = formatClock();
        rightSlot.style.paddingBottom = '0';
        applyBarColors();
        setCssVar(BAR_HEIGHT_ACTIVE);
        startClock();
    }

    function setActivity(data) {
        if (!data || !data.type) { clearActivity(); return; }
        applyActivity({
            type: data.type,
            appId: data.appId || null,
            payload: data.payload || {},
            startedAt: data.startedAt || Date.now()
        });
    }

    function updateActivity(payload) {
        if (!currentActivity) return;
        currentActivity.payload = Object.assign({}, currentActivity.payload, payload || {});
        if (leftSlot) leftSlot.textContent = buildLeftContent(currentActivity);
    }

    function clearActivity() {
        applyActivity(null);
    }

    function suspend(appId) {
        // no-op
    }
    function resume(appId) {
        // no-op
    }

    function optimizeSystem() {
        if (window.Time && typeof window.Time.destroy === 'function') window.Time.destroy();
        if (window.FileApp && typeof window.FileApp.destroy === 'function') window.FileApp.destroy();
        if (window.Game && typeof window.Game.destroy === 'function') window.Game.destroy();
        if (window.Settings && typeof window.Settings.destroy === 'function') window.Settings.destroy();
        if (window.Store && typeof window.Store.destroy === 'function') window.Store.destroy();
        if (window.Camera && typeof window.Camera.destroy === 'function') window.Camera.destroy();
        if (window.Recorder && typeof window.Recorder.destroy === 'function') window.Recorder.destroy();
        if (window.Browser && typeof window.Browser.destroy === 'function') window.Browser.destroy();
        if (window.Cooop && typeof window.Cooop.destroy === 'function') window.Cooop.destroy();
        if (window.GameCenter && typeof window.GameCenter.destroy === 'function') window.GameCenter.destroy();

        if (window._timeInterval) {
            clearInterval(window._timeInterval);
            window._timeInterval = null;
        }
        if (window._threeResizeObserver) {
            try { window._threeResizeObserver.disconnect(); } catch(e) {}
            window._threeResizeObserver = null;
        }
        if (window._scrollTimeout) {
            clearTimeout(window._scrollTimeout);
            window._scrollTimeout = null;
        }

        const ids = ['storeApp', 'settingsApp', 'fileApp', 'timeApp', 'gameApp', 'cameraApp', 'recorderApp', 'browserApp', 'cooopApp', 'gameCenterApp'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.opacity = '0';
                setTimeout(() => {
                    if (el.parentNode) el.parentNode.removeChild(el);
                }, 300);
            }
        });

        document.querySelectorAll('.html-app-window').forEach(c => {
            const b = document.querySelector('.html-app-close-btn');
            if (b) b.remove();
            c.remove();
        });

        document.querySelectorAll('.win-backdrop').forEach(b => b.remove());

        if (window.LiveBar) window.LiveBar.clear();

        if (window.Win && window.Win.notify) {
            window.Win.notify('Система оптимизирована', { type: 'success', duration: 2000 });
        }
    }

    function restore() {
        ensureAnonMode();
        ensureOverlay();
        ensureBar();
        applyActivity(null);
        startClock();
    }

    function isActive() { return !!currentActivity; }
    function getActivity() { return currentActivity; }
    function isAnonMode() { return anonMode; }

    window.LiveBar = {
        set: setActivity,
        update: updateActivity,
        clear: clearActivity,
        suspend: suspend,
        resume: resume,
        isActive: isActive,
        get: getActivity,
        restore: restore,
        isAnonMode: isAnonMode,
        getBrightness: getBrightness,
        setBrightness: setBrightness,
        optimizeSystem: optimizeSystem
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', restore);
    } else {
        restore();
    }

    window.addEventListener('shnuk:theme-changed', function() {
        applyBarColors();
    });

})();