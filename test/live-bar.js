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

    let recordingWaveCanvas = null;
    let recordingWaveCtx = null;
    let recordingWaveAnimId = null;
    let recordingWaveStartTime = 0;
    let recordingWaveRunning = false;

    let clockHandsRef = null;
    let clockAnimId = null;
    let clockRunning = false;
    let clockStartTime = 0;

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

    function T(s) {
        if (window.L10N && typeof window.L10N.t === 'function') return window.L10N.t(s);
        return s;
    }

    function getTheme() {
        try { return localStorage.getItem(THEME_KEY) || 'day'; } catch(e) { return 'day'; }
    }

    function getThemeColors() {
        const theme = getTheme();
        if (theme === 'evening') {
            return { bg: '#2a2a2a', text: '#ffffff', activeBg: 'rgba(30, 30, 30, 0.85)', activeText: '#ffffff' };
        }
        if (theme === 'warm-night') {
            return { bg: '#000000', text: '#ffffff', activeBg: 'rgba(0, 0, 0, 0.85)', activeText: '#ffffff' };
        }
        return { bg: '#ffffff', text: '#1a1a1a', activeBg: 'rgba(20, 20, 28, 0.72)', activeText: '#ffffff' };
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
        overlayEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;opacity:0;pointer-events:none;z-index:2147483647;transition:opacity .2s ease;';
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
        try { anonMode = localStorage.getItem(ANON_KEY) === 'true'; }
        catch(e) { anonMode = false; }
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

    function buildRecordingTimerText(activity) {
        const p = activity.payload || {};
        return formatSecondsTenths(p.elapsed || 0);
    }

    function buildClockLabelText(activity) {
        const p = activity.payload || {};
        if (activity.type === 'stopwatch') return T('Секундомер') + ' ' + formatSecondsTenths(p.elapsed || 0);
        if (activity.type === 'timer') return T('Таймер') + ' ' + formatSeconds(p.remaining || 0);
        if (activity.type === 'alarm') return T('Будильник') + ' ' + (p.time || '--:--');
        return '';
    }

    function buildLeftContent(activity) {
        if (!activity) return '';
        const p = activity.payload || {};
        if (activity.type === 'cooop') return p.text || 'Cooop';
        if (activity.type === 'custom') return p.text || '';
        return '';
    }

    function isClockType(type) {
        return type === 'stopwatch' || type === 'timer' || type === 'alarm';
    }

    function buildClockSvg() {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.style.cssText = 'display:block;width:22px;height:22px;flex-shrink:0;color:inherit;';
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-linecap', 'round');

        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '10');
        circle.setAttribute('stroke-width', '1.8');
        svg.appendChild(circle);

        const hourHand = document.createElementNS(ns, 'line');
        hourHand.setAttribute('x1', '12');
        hourHand.setAttribute('y1', '12');
        hourHand.setAttribute('x2', '12');
        hourHand.setAttribute('y2', '6.5');
        hourHand.setAttribute('stroke-width', '1.8');
        svg.appendChild(hourHand);

        const minHand = document.createElementNS(ns, 'line');
        minHand.setAttribute('x1', '12');
        minHand.setAttribute('y1', '12');
        minHand.setAttribute('x2', '12');
        minHand.setAttribute('y2', '4.5');
        minHand.setAttribute('stroke-width', '1.4');
        svg.appendChild(minHand);

        const secHand = document.createElementNS(ns, 'line');
        secHand.setAttribute('x1', '12');
        secHand.setAttribute('y1', '12');
        secHand.setAttribute('x2', '12');
        secHand.setAttribute('y2', '3');
        secHand.setAttribute('stroke-width', '0.9');
        svg.appendChild(secHand);

        const center = document.createElementNS(ns, 'circle');
        center.setAttribute('cx', '12');
        center.setAttribute('cy', '12');
        center.setAttribute('r', '1.3');
        center.setAttribute('fill', 'currentColor');
        center.setAttribute('stroke', 'none');
        svg.appendChild(center);

        return { svg: svg, hourHand: hourHand, minHand: minHand, secHand: secHand };
    }

    function startClockHands(hands) {
        if (clockRunning) { clockHandsRef = hands; return; }
        clockRunning = true;
        clockHandsRef = hands;
        clockStartTime = performance.now();

        function loop(now) {
            if (!clockRunning || !clockHandsRef) return;
            const t = (now - clockStartTime) / 1000;
            const secA = (t * 720) % 360;
            const minA = (t * 60) % 360;
            const hourA = (t * 5) % 360;
            clockHandsRef.secHand.setAttribute('transform', 'rotate(' + secA + ' 12 12)');
            clockHandsRef.minHand.setAttribute('transform', 'rotate(' + minA + ' 12 12)');
            clockHandsRef.hourHand.setAttribute('transform', 'rotate(' + hourA + ' 12 12)');
            clockAnimId = requestAnimationFrame(loop);
        }
        clockAnimId = requestAnimationFrame(loop);
    }

    function stopClockHands() {
        clockRunning = false;
        clockHandsRef = null;
        if (clockAnimId) { cancelAnimationFrame(clockAnimId); clockAnimId = null; }
    }

    function startRecordingWave() {
        if (recordingWaveRunning) return;
        recordingWaveRunning = true;
        recordingWaveStartTime = performance.now();
        function loop(now) {
            if (!recordingWaveRunning) return;
            drawRecordingWave(now);
            recordingWaveAnimId = requestAnimationFrame(loop);
        }
        recordingWaveAnimId = requestAnimationFrame(loop);
    }

    function stopRecordingWave() {
        recordingWaveRunning = false;
        if (recordingWaveAnimId) { cancelAnimationFrame(recordingWaveAnimId); recordingWaveAnimId = null; }
    }

    function drawRecordingWave(now) {
        const canvas = recordingWaveCanvas;
        const ctx = recordingWaveCtx;
        if (!canvas || !ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = canvas.getBoundingClientRect();
        const w = rect.width || 64;
        const h = rect.height || 20;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        ctx.clearRect(0, 0, w, h);
        let color = '#ffffff';
        if (leftSlot) {
            const style = getComputedStyle(leftSlot);
            if (style.color) color = style.color;
        }
        const paused = currentActivity && currentActivity.payload && currentActivity.payload.paused;
        const t = paused ? 0 : (now - recordingWaveStartTime) / 1000;
        const centerY = h / 2;
        const amp = h * 0.42;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.globalAlpha = paused ? 0.35 : 1;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 1) {
            const phase1 = (x + t * 90) * 0.18;
            const phase2 = (x - t * 60) * 0.28 + 1.7;
            const y = centerY + Math.sin(phase1) * amp * 0.55 + Math.sin(phase2) * amp * 0.35;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
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
        if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
    }

    function ensureBar() {
        if (barEl && !barEl.parentNode) {
            barEl = null;
            leftSlot = null;
            rightSlot = null;
            stopClock();
        }
        if (barEl) { startClock(); return; }

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
            transition: height .45s cubic-bezier(.22,1,.36,1), background .45s cubic-bezier(.22,1,.36,1), color .45s cubic-bezier(.22,1,.36,1), align-items .45s cubic-bezier(.22,1,.36,1), padding .45s cubic-bezier(.22,1,.36,1);
            will-change: height, background, align-items;
        `;

        leftSlot = document.createElement('div');
        leftSlot.id = 'liveBarLeft';
        leftSlot.style.cssText = `
            display: flex; align-items: center;
            font-family: ${BAR_FONT};
            font-size: 15px; font-weight: 600; letter-spacing: .5px;
            opacity: 0; transform: translateY(-4px);
            transition: opacity .35s ease, transform .35s cubic-bezier(.22,1,.36,1);
            flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        `;

        rightSlot = document.createElement('div');
        rightSlot.id = 'liveBarRight';
        rightSlot.style.cssText = `
            display: flex; align-items: center; justify-content: flex-end;
            font-family: ${BAR_FONT};
            font-size: 15px; font-weight: 600; letter-spacing: .5px;
            flex-shrink: 0;
            transition: font-size .35s cubic-bezier(.22,1,.36,1);
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

    function clearLeftContent() {
        stopRecordingWave();
        stopClockHands();
        recordingWaveCanvas = null;
        recordingWaveCtx = null;
        if (!leftSlot) return;
        leftSlot.innerHTML = '';
        leftSlot.textContent = '';
        leftSlot.style.pointerEvents = 'none';
    }

    function renderRecordingLeft(activity) {
        if (!leftSlot) return;
        stopRecordingWave();
        stopClockHands();
        leftSlot.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.style.cssText = `
            display: flex; align-items: center; gap: 10px;
            font-family: ${BAR_FONT}; font-size: 15px; font-weight: 600; letter-spacing: .5px;
            color: inherit;
        `;

        const paused = activity.payload && activity.payload.paused;
        const label = document.createElement('span');
        label.className = 'lb-rec-label';
        label.textContent = T(paused ? 'ПАУЗА' : 'ЗАПИСЬ');
        label.style.cssText = `font-family: ${BAR_FONT};font-size: 15px;font-weight: 600;letter-spacing:.5px;color: inherit;`;
        wrap.appendChild(label);

        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'display:block;width:64px;height:20px;';
        wrap.appendChild(canvas);

        const timerEl = document.createElement('span');
        timerEl.className = 'lb-rec-timer';
        timerEl.textContent = buildRecordingTimerText(activity);
        timerEl.style.cssText = `font-family: ${BAR_FONT};font-size: 15px;font-weight: 600;letter-spacing:.5px;color: inherit;font-variant-numeric: tabular-nums;`;
        wrap.appendChild(timerEl);

        leftSlot.appendChild(wrap);

        recordingWaveCanvas = canvas;
        recordingWaveCtx = canvas.getContext('2d');
        startRecordingWave();
    }

    function renderClockLeft(activity) {
        if (!leftSlot) return;
        stopRecordingWave();
        stopClockHands();
        leftSlot.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.style.cssText = `
            display: flex; align-items: center; gap: 10px;
            font-family: ${BAR_FONT}; font-size: 15px; font-weight: 600; letter-spacing: .5px;
            color: inherit;
        `;

        const clock = buildClockSvg();
        wrap.appendChild(clock.svg);

        const textEl = document.createElement('span');
        textEl.className = 'lb-clock-text';
        textEl.textContent = buildClockLabelText(activity);
        textEl.style.cssText = `font-family: ${BAR_FONT};font-size: 15px;font-weight: 600;letter-spacing:.5px;color: inherit;font-variant-numeric: tabular-nums;`;
        wrap.appendChild(textEl);

        leftSlot.appendChild(wrap);
        startClockHands(clock);
    }

    function applyActivity(activity) {
        ensureBar();
        if (!activity) {
            currentActivity = null;
            clearLeftContent();
            barEl.style.height = BAR_HEIGHT + 'px';
            barEl.style.alignItems = 'center';
            barEl.style.padding = '0 20px';
            leftSlot.style.opacity = '0';
            leftSlot.style.transform = 'translateY(-4px)';
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

        if (activity.type === 'recording') renderRecordingLeft(activity);
        else if (isClockType(activity.type)) renderClockLeft(activity);
        else {
            clearLeftContent();
            leftSlot.textContent = buildLeftContent(activity);
        }

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
        if (currentActivity.type === 'recording') {
            if (leftSlot) {
                const timerEl = leftSlot.querySelector('.lb-rec-timer');
                if (timerEl) timerEl.textContent = buildRecordingTimerText(currentActivity);
                const labelEl = leftSlot.querySelector('.lb-rec-label');
                if (labelEl) {
                    const paused = currentActivity.payload.paused;
                    const wantText = T(paused ? 'ПАУЗА' : 'ЗАПИСЬ');
                    if (labelEl.textContent !== wantText) labelEl.textContent = wantText;
                }
            }
        } else if (isClockType(currentActivity.type)) {
            if (leftSlot) {
                const textEl = leftSlot.querySelector('.lb-clock-text');
                if (textEl) textEl.textContent = buildClockLabelText(currentActivity);
            }
        } else {
            if (leftSlot) leftSlot.textContent = buildLeftContent(currentActivity);
        }
    }

    function clearActivity() { applyActivity(null); }

    function suspend(appId) {}
    function resume(appId) {}

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

        if (window._timeInterval) { clearInterval(window._timeInterval); window._timeInterval = null; }
        if (window._threeResizeObserver) { try { window._threeResizeObserver.disconnect(); } catch(e) {} window._threeResizeObserver = null; }
        if (window._scrollTimeout) { clearTimeout(window._scrollTimeout); window._scrollTimeout = null; }

        const ids = ['storeApp', 'settingsApp', 'fileApp', 'timeApp', 'gameApp', 'cameraApp', 'recorderApp', 'browserApp', 'cooopApp', 'gameCenterApp'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.opacity = '0';
                setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
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
            window.Win.notify(T('Система оптимизирована'), { type: 'success', duration: 2000 });
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

    window.addEventListener('shnuk:theme-changed', function() { applyBarColors(); });
    window.addEventListener('shnuk:lang-changed', function() {
        if (currentActivity) {
            if (currentActivity.type === 'recording') renderRecordingLeft(currentActivity);
            else if (isClockType(currentActivity.type)) renderClockLeft(currentActivity);
            else if (leftSlot) leftSlot.textContent = buildLeftContent(currentActivity);
        }
    });

})();