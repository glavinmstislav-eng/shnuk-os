// live-bar.js

(function() {
    'use strict';

    const BAR_ID = 'liveBar';
    const BAR_HEIGHT = 44;
    const BAR_HEIGHT_ACTIVE = 64;
    const BRIGHTNESS_KEY = 'shnuk_brightness';
    const ANON_KEY = 'shnuk_anon_mode';

    let barEl = null;
    let leftSlot = null;
    let rightSlot = null;
    let clockInterval = null;
    let currentActivity = null;
    let overlayEl = null;
    let quickPanel = null;
    let isQuickOpen = false;
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
            const s = _origSetItem ? localStorage.getItem(BRIGHTNESS_KEY) : null;
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
            anonMode = _origSetItem.call(localStorage, ANON_KEY) !== null
                ? localStorage.getItem(ANON_KEY) === 'true'
                : false;
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
        if (activity.type === 'custom') return p.text || '';
        return '';
    }

    function setCssVar(h) {
        document.documentElement.style.setProperty('--livebar-h', h + 'px');
    }

    function ensureBar() {
        if (barEl) return;

        barEl = document.createElement('div');
        barEl.id = BAR_ID;
        barEl.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%;
            height: ${BAR_HEIGHT}px;
            background: #ffffff;
            z-index: 2147483646;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            box-sizing: border-box;
            font-family: 'ST-SimpleSquare', monospace;
            color: #1a1a1a;
            pointer-events: auto;
            cursor: pointer;
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

        leftSlot.addEventListener('click', onLeftClick);
        barEl.addEventListener('click', onBarClick);
        startClock();
        setCssVar(BAR_HEIGHT);
    }

    function startClock() {
        if (clockInterval) return;
        clockInterval = setInterval(function() {
            if (rightSlot) rightSlot.textContent = formatClock();
        }, 1000);
    }

    function onLeftClick(e) {
        e.stopPropagation();
        if (currentActivity && currentActivity.appId) {
            const id = currentActivity.appId;
            if (typeof window[id + 'Init'] === 'function') window[id + 'Init']();
        }
    }

    function onBarClick() {
        openQuickPanel();
    }

    function applyActivity(activity) {
        ensureBar();

        if (!activity) {
            currentActivity = null;
            barEl.style.height = BAR_HEIGHT + 'px';
            barEl.style.background = '#ffffff';
            barEl.style.color = '#1a1a1a';
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
            setCssVar(BAR_HEIGHT);
            return;
        }

        currentActivity = activity;
        barEl.style.height = BAR_HEIGHT_ACTIVE + 'px';
        barEl.style.background = 'rgba(20, 20, 28, 0.72)';
        barEl.style.color = '#ffffff';
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
        setCssVar(BAR_HEIGHT_ACTIVE);
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

    function ensureQuickPanel() {
        if (quickPanel) return;

        const backdrop = document.createElement('div');
        backdrop.id = 'quickPanelBackdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0);
            backdrop-filter: blur(0px);
            -webkit-backdrop-filter: blur(0px);
            z-index: 2147483644;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1),
                        background 0.4s cubic-bezier(0.22, 1, 0.36, 1),
                        backdrop-filter 0.4s cubic-bezier(0.22, 1, 0.36, 1),
                        -webkit-backdrop-filter 0.4s cubic-bezier(0.22, 1, 0.36, 1);
        `;
        document.body.appendChild(backdrop);

        quickPanel = document.createElement('div');
        quickPanel.id = 'quickPanel';
        quickPanel.style.cssText = `
            position: fixed;
            top: var(--livebar-h, 44px);
            left: 50%;
            transform: translate(-50%, -30px) scale(0.92);
            width: 320px;
            max-width: calc(100% - 32px);
            background: #ffffff;
            padding: 24px 20px 16px;
            box-sizing: border-box;
            font-family: 'ST-SimpleSquare', monospace;
            color: #1a1a1a;
            z-index: 2147483645;
            opacity: 0;
            pointer-events: none;
            filter: blur(20px);
            transition: opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1),
                        transform 0.45s cubic-bezier(0.22, 1, 0.36, 1),
                        filter 0.45s cubic-bezier(0.22, 1, 0.36, 1);
            box-shadow: 0 20px 60px rgba(0,0,0,0.25);
            will-change: opacity, transform, filter;
        `;

        quickPanel.innerHTML = `
            <div style="font-size:13px;color:#888;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;font-weight:600;">Яркость</div>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="4"/>
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
                </svg>
                <input type="range" id="quickBrightness" min="0" max="100" value="100" style="flex:1;accent-color:#cc0000;" />
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">
                <button class="quick-btn" id="quickAnon" title="Анонимный режим">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                </button>
                <button class="quick-btn" id="quickOptimize" title="Оптимизация">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10"/>
                        <polyline points="1 20 1 14 7 14"/>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/>
                        <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/>
                        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
                    </svg>
                </button>
                <button class="quick-btn" id="quickSettings" title="Настройки">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                </button>
                <button class="quick-btn" id="quickReload" title="Выключение">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2v10"/>
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                    </svg>
                </button>
            </div>
            <div style="text-align:center;margin-top:4px;">
                <button id="quickClose" style="background:none;border:none;cursor:pointer;padding:8px 16px;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `;

        if (!document.getElementById('quickPanelStyles')) {
            const style = document.createElement('style');
            style.id = 'quickPanelStyles';
            style.textContent = `
                .quick-btn {
                    width: 56px;
                    height: 56px;
                    background: #ffffff;
                    border: 2px solid #e0e0e0;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.25s ease, border-color 0.25s ease, transform 0.15s ease, color 0.25s ease;
                    padding: 0;
                    justify-self: center;
                    color: #333;
                }
                .quick-btn:hover { background: #f5f5f5; border-color: #cc0000; }
                .quick-btn:active { transform: scale(0.94); }
                .quick-btn.active {
                    background: #cc0000;
                    border-color: #cc0000;
                    color: #ffffff;
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(quickPanel);

        const slider = quickPanel.querySelector('#quickBrightness');
        slider.value = String(getBrightness());
        slider.addEventListener('input', function() {
            setBrightness(parseInt(this.value, 10));
        });

        const anonBtn = quickPanel.querySelector('#quickAnon');
        if (anonMode) anonBtn.classList.add('active');
        anonBtn.addEventListener('click', function() {
            setAnonMode(!anonMode);
            this.classList.toggle('active', anonMode);
        });

        quickPanel.querySelector('#quickOptimize').addEventListener('click', function() {
            closeQuickPanel();
            optimizeSystem();
        });

        quickPanel.querySelector('#quickSettings').addEventListener('click', function() {
            closeQuickPanel();
            if (typeof window.settingsInit === 'function') window.settingsInit();
        });

        quickPanel.querySelector('#quickReload').addEventListener('click', function() {
            closeQuickPanel();
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; top:0; left:0; width:100%; height:100%;
                background:#000; z-index:2147483647; opacity:0;
                transition: opacity 0.4s ease;
            `;
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.style.opacity = '1');
            setTimeout(() => location.reload(), 500);
        });

        quickPanel.querySelector('#quickClose').addEventListener('click', closeQuickPanel);
        backdrop.addEventListener('click', closeQuickPanel);

        quickPanel._backdrop = backdrop;
    }

    function openQuickPanel() {
        ensureQuickPanel();
        if (isQuickOpen) return;
        isQuickOpen = true;

        const backdrop = quickPanel._backdrop;
        backdrop.style.pointerEvents = 'auto';
        quickPanel.style.pointerEvents = 'auto';

        requestAnimationFrame(() => {
            backdrop.style.background = 'rgba(0,0,0,0.4)';
            backdrop.style.backdropFilter = 'blur(15px)';
            backdrop.style.webkitBackdropFilter = 'blur(15px)';
            backdrop.style.opacity = '1';

            quickPanel.style.opacity = '1';
            quickPanel.style.filter = 'blur(0)';
            quickPanel.style.transform = 'translate(-50%, 0) scale(1)';
        });
    }

    function closeQuickPanel() {
        if (!isQuickOpen) return;
        isQuickOpen = false;

        const backdrop = quickPanel._backdrop;
        backdrop.style.background = 'rgba(0,0,0,0)';
        backdrop.style.backdropFilter = 'blur(0px)';
        backdrop.style.webkitBackdropFilter = 'blur(0px)';
        backdrop.style.opacity = '0';
        backdrop.style.pointerEvents = 'none';

        quickPanel.style.opacity = '0';
        quickPanel.style.filter = 'blur(20px)';
        quickPanel.style.transform = 'translate(-50%, -30px) scale(0.92)';
        quickPanel.style.pointerEvents = 'none';
    }

    function optimizeSystem() {
        if (window.Time && typeof window.Time.destroy === 'function') window.Time.destroy();
        if (window.FileApp && typeof window.FileApp.destroy === 'function') window.FileApp.destroy();
        if (window.Game && typeof window.Game.destroy === 'function') window.Game.destroy();
        if (window.Settings && typeof window.Settings.destroy === 'function') window.Settings.destroy();
        if (window.Store && typeof window.Store.destroy === 'function') window.Store.destroy();

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

        const ids = ['storeApp', 'settingsApp', 'fileApp', 'timeApp', 'gameApp'];
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
        document.querySelectorAll('.widget-menu').forEach(m => m.remove());
        document.querySelectorAll('.widget-menu-backdrop').forEach(m => m.remove());

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
    }

    function isActive() { return !!currentActivity; }
    function getActivity() { return currentActivity; }
    function isAnonMode() { return anonMode; }

    window.LiveBar = {
        set: setActivity,
        update: updateActivity,
        clear: clearActivity,
        isActive: isActive,
        get: getActivity,
        restore: restore,
        isAnonMode: isAnonMode,
        getBrightness: getBrightness,
        setBrightness: setBrightness
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', restore);
    } else {
        restore();
    }

})();