// live-bar.js

(function() {
    'use strict';

    const BAR_ID = 'liveBar';
    const BAR_HEIGHT = 44;
    const BAR_HEIGHT_ACTIVE = 64;
    const BRIGHTNESS_KEY = 'shnuk_brightness';
    const ANON_KEY = 'shnuk_anon_mode';
    const THEME_KEY = 'shnuk_theme';
    const NOTIF_KEY = 'shnuk_notifications';

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

    // ============================================
    // УВЕДОМЛЕНИЯ
    // ============================================
    let notifications = [];
    let shadeEl = null;
    let shadeOpen = false;

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
            return { bg: '#2a2a2a', text: '#ffffff', activeBg: 'rgba(30,30,30,0.85)', activeText: '#ffffff' };
        }
        if (theme === 'warm-night') {
            return { bg: '#000000', text: '#ffffff', activeBg: 'rgba(0,0,0,0.85)', activeText: '#ffffff' };
        }
        return { bg: '#ffffff', text: '#1a1a1a', activeBg: 'rgba(20,20,28,0.72)', activeText: '#ffffff' };
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

    // ============================================
    // SVG-ЧАСЫ
    // ============================================

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
        hourHand.setAttribute('x1', '12'); hourHand.setAttribute('y1', '12');
        hourHand.setAttribute('x2', '12'); hourHand.setAttribute('y2', '6.5');
        hourHand.setAttribute('stroke-width', '1.8');
        svg.appendChild(hourHand);

        const minHand = document.createElementNS(ns, 'line');
        minHand.setAttribute('x1', '12'); minHand.setAttribute('y1', '12');
        minHand.setAttribute('x2', '12'); minHand.setAttribute('y2', '4.5');
        minHand.setAttribute('stroke-width', '1.4');
        svg.appendChild(minHand);

        const secHand = document.createElementNS(ns, 'line');
        secHand.setAttribute('x1', '12'); secHand.setAttribute('y1', '12');
        secHand.setAttribute('x2', '12'); secHand.setAttribute('y2', '3');
        secHand.setAttribute('stroke-width', '0.9');
        svg.appendChild(secHand);

        const center = document.createElementNS(ns, 'circle');
        center.setAttribute('cx', '12'); center.setAttribute('cy', '12');
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
            clockHandsRef.secHand.setAttribute('transform', 'rotate(' + ((t * 720) % 360) + ' 12 12)');
            clockHandsRef.minHand.setAttribute('transform', 'rotate(' + ((t * 60) % 360) + ' 12 12)');
            clockHandsRef.hourHand.setAttribute('transform', 'rotate(' + ((t * 5) % 360) + ' 12 12)');
            clockAnimId = requestAnimationFrame(loop);
        }
        clockAnimId = requestAnimationFrame(loop);
    }

    function stopClockHands() {
        clockRunning = false;
        clockHandsRef = null;
        if (clockAnimId) { cancelAnimationFrame(clockAnimId); clockAnimId = null; }
    }

    // ============================================
    // ПОЛОСКА ЗВУКОЗАПИСИ
    // ============================================

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

    // ============================================
    // ЖИЗНЕННЫЙ ЦИКЛ
    // ============================================

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
            touch-action: none;
            transition: height .45s cubic-bezier(.22,1,.36,1), background .45s cubic-bezier(.22,1,.36,1), color .45s cubic-bezier(.22,1,.36,1), align-items .45s cubic-bezier(.22,1,.36,1), padding .45s cubic-bezier(.22,1,.36,1);
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

        bindShadeGestures();

        startClock();
        setCssVar(BAR_HEIGHT);
    }

    function onLeftClick(e) {
        e.stopPropagation();
        if (currentActivity && currentActivity.appId) {
            const id = currentActivity.appId;
            if (typeof window[id + 'Init'] === 'function') {
                window.__appOpenedFrom = 'notification';
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

    function applyActivity(activity, opts) {
        ensureBar();
        opts = opts || {};

        if (!activity) {
            currentActivity = null;
            clearLeftContent();
            barEl.style.height = BAR_HEIGHT + 'px';
            barEl.style.alignItems = 'center';
            barEl.style.padding = '0 20px';
            leftSlot.style.opacity = '0';
            leftSlot.style.transform = 'translateY(-4px)';
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
            leftSlot.style.pointerEvents = 'auto';
        }

        leftSlot.style.opacity = '1';
        leftSlot.style.transform = 'translateY(0)';
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
                    const wantText = T(currentActivity.payload.paused ? 'ПАУЗА' : 'ЗАПИСЬ');
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

        const ids = ['storeApp','settingsApp','fileApp','timeApp','gameApp','cameraApp','recorderApp','browserApp','cooopApp','gameCenterApp'];
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
        if (window.Win && window.Win.notify) window.Win.notify(T('Система оптимизирована'), { type: 'success', duration: 2000 });
    }

    function restore() {
        ensureAnonMode();
        ensureOverlay();
        loadNotifications();
        ensureBar();
        applyActivity(null);
        startClock();
    }

    function isActive() { return !!currentActivity; }
    function getActivity() { return currentActivity; }
    function isAnonMode() { return anonMode; }

    // ============================================
    // УВЕДОМЛЕНИЯ — модель
    // ============================================

    function loadNotifications() {
        try {
            const raw = localStorage.getItem(NOTIF_KEY);
            if (!raw) { notifications = []; return; }
            const parsed = JSON.parse(raw);
            notifications = Array.isArray(parsed) ? parsed : [];
        } catch(e) { notifications = []; }
    }

    function saveNotifications() {
        try { localStorage.setItem(NOTIF_KEY, JSON.stringify(notifications)); } catch(e) {}
    }

    function addNotification(data) {
        if (!data) return null;
        const n = {
            id: 'ntf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            title: data.title || '',
            body: data.body || '',
            appId: data.appId || null,
            appName: data.appName || '',
            icon: data.icon || null,
            time: Date.now(),
            type: data.type || 'info'
        };
        notifications.unshift(n);
        if (notifications.length > 200) notifications = notifications.slice(0, 200);
        saveNotifications();
        if (shadeOpen) renderShade();

        showTransientInBar(n);
        return n;
    }

    function removeNotification(id) {
        notifications = notifications.filter(n => n.id !== id);
        saveNotifications();
        if (shadeOpen) renderShade();
    }

    function clearAllNotifications() {
        notifications = [];
        saveNotifications();
        if (shadeOpen) renderShade();
    }

    let transientTimer = null;
    function showTransientInBar(n) {
        ensureBar();
        const prevActivity = currentActivity;

        barEl.style.height = BAR_HEIGHT_ACTIVE + 'px';
        barEl.style.alignItems = 'flex-end';
        barEl.style.padding = '0 20px 14px';

        leftSlot.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.style.cssText = `
            display:flex;align-items:center;gap:10px;
            font-family:${BAR_FONT};font-size:15px;font-weight:600;letter-spacing:.5px;color:inherit;
            cursor:pointer;
        `;
        if (n.icon) {
            const img = document.createElement('img');
            img.src = n.icon;
            img.style.cssText = 'width:20px;height:20px;object-fit:contain;flex-shrink:0;';
            img.onerror = function() { this.style.display = 'none'; };
            wrap.appendChild(img);
        }
        const title = document.createElement('span');
        title.textContent = n.title || n.body || T('Уведомление');
        title.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        wrap.appendChild(title);
        leftSlot.appendChild(wrap);
        leftSlot.style.opacity = '1';
        leftSlot.style.transform = 'translateY(0)';
        leftSlot.style.pointerEvents = 'auto';

        const handleClick = function(e) {
            e.stopPropagation();
            openNotificationTarget(n);
        };
        leftSlot.addEventListener('click', handleClick);

        if (transientTimer) clearTimeout(transientTimer);
        transientTimer = setTimeout(function() {
            leftSlot.removeEventListener('click', handleClick);
            if (prevActivity) {
                applyActivity(prevActivity);
            } else {
                currentActivity = null;
                clearLeftContent();
                barEl.style.height = BAR_HEIGHT + 'px';
                barEl.style.alignItems = 'center';
                barEl.style.padding = '0 20px';
                leftSlot.style.opacity = '0';
                leftSlot.style.transform = 'translateY(-4px)';
                rightSlot.style.fontSize = '15px';
                rightSlot.textContent = formatClock();
                applyBarColors();
                setCssVar(BAR_HEIGHT);
            }
        }, 1000);
    }

    function openNotificationTarget(n) {
        if (shadeOpen) closeShade();
        if (!n) return;

        // Помечаем, что приложение открыто из уведомления — при закрытии
        // оно улетит вниз (как из меню приложений), а не к иконке.
        window.__appOpenedFrom = 'notification';

        if (n.appId) {
            const initFns = [n.appId + 'Init', n.appId.replace(/-/g, '') + 'Init'];
            for (const fn of initFns) {
                if (typeof window[fn] === 'function') {
                    try { window[fn](); return; } catch(e) {}
                }
            }
        }

        if (n.appName && window.AppScanner) {
            AppScanner.getApps().then(function(apps) {
                const found = apps.find(a => a.name === n.appName);
                if (found) {
                    const iconEl = document.querySelector('.icon-item[data-app-id="' + found.id + '"]');
                    if (iconEl) iconEl.click();
                }
            });
        }
    }

    // ============================================
    // ШТОРКА УВЕДОМЛЕНИЙ
    // ============================================

    // Псевдо-фон: полупрозрачный с размытием. Уведомления — непрозрачные.
    // Открытие/закрытие — через filter: blur() + opacity (без translateY).
    function getShadeBackdrop() {
        const theme = getTheme();
        if (theme === 'evening') {
            return { bg: 'rgba(20,20,20,0.55)', blur: '24px', text: '#ffffff', border: 'rgba(255,255,255,0.12)' };
        }
        if (theme === 'warm-night') {
            return { bg: 'rgba(0,0,0,0.6)', blur: '24px', text: '#ffffff', border: 'rgba(255,255,255,0.12)' };
        }
        return { bg: 'rgba(255,255,255,0.55)', blur: '24px', text: '#1a1a1a', border: 'rgba(0,0,0,0.08)' };
    }

    function getShadeItemColors() {
        const theme = getTheme();
        if (theme === 'evening') {
            return { bg: '#333333', border: '#444444', text: '#ffffff', muted: '#aaaaaa', title: '#ffffff' };
        }
        if (theme === 'warm-night') {
            return { bg: '#111111', border: '#333333', text: '#ffffff', muted: '#bbbbbb', title: '#ffe066' };
        }
        return { bg: '#ffffff', border: '#e0e0e0', text: '#1a1a1a', muted: '#666666', title: '#1a1a1a' };
    }

    function ensureShade() {
        if (shadeEl) return shadeEl;

        const bd = getShadeBackdrop();
        const it = getShadeItemColors();

        shadeEl = document.createElement('div');
        shadeEl.id = 'liveBarShade';
        shadeEl.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: ${bd.bg};
            -webkit-backdrop-filter: blur(${bd.blur});
            backdrop-filter: blur(${bd.blur});
            z-index: 2147483645;
            display: flex;
            flex-direction: column;
            font-family: ${BAR_FONT};
            opacity: 0;
            filter: blur(24px);
            transition: opacity .4s cubic-bezier(.22,1,.36,1), filter .4s cubic-bezier(.22,1,.36,1);
            will-change: opacity, filter;
            box-sizing: border-box;
            overflow: hidden;
            color: ${bd.text};
            pointer-events: none;
        `;

        const header = document.createElement('div');
        header.className = 'lb-shade-header';
        header.style.cssText = `
            padding: 10px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: transparent;
            border-bottom: 2px solid ${bd.border};
            flex-shrink: 0;
            box-sizing: border-box;
            min-height: 52px;
            color: ${bd.text};
        `;

        const title = document.createElement('div');
        title.textContent = T('Уведомления');
        title.style.cssText = 'font-size: 18px; font-weight: 700; letter-spacing: .4px;';
        header.appendChild(title);

        const clearAllBtn = document.createElement('button');
        clearAllBtn.id = 'lbShadeClearAll';
        clearAllBtn.textContent = T('Очистить');
        clearAllBtn.style.cssText = `
            padding: 6px 14px;
            background: none;
            border: 2px solid #cc0000;
            color: #cc0000;
            font-family: inherit;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            letter-spacing: .4px;
            transition: all .2s ease;
            -webkit-tap-highlight-color: transparent;
        `;
        clearAllBtn.addEventListener('mouseenter', function() {
            clearAllBtn.style.background = '#cc0000';
            clearAllBtn.style.color = '#ffffff';
        });
        clearAllBtn.addEventListener('mouseleave', function() {
            clearAllBtn.style.background = 'none';
            clearAllBtn.style.color = '#cc0000';
        });
        clearAllBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            clearAllNotifications();
        });
        header.appendChild(clearAllBtn);

        const body = document.createElement('div');
        body.className = 'lb-shade-body';
        body.id = 'lbShadeBody';
        body.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 16px 20px 40px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 12px;
            -webkit-overflow-scrolling: touch;
        `;

        shadeEl.appendChild(header);
        shadeEl.appendChild(body);
        document.body.appendChild(shadeEl);

        bindShadeCloseGesture();
        return shadeEl;
    }

    function renderShade() {
        ensureShade();
        const body = document.getElementById('lbShadeBody');
        if (!body) return;
        body.innerHTML = '';

        const it = getShadeItemColors();
        const bd = getShadeBackdrop();

        // 1) Активность live bar — если есть
        if (currentActivity) {
            const act = document.createElement('div');
            act.className = 'lb-shade-activity';
            act.style.cssText = `
                padding: 14px 16px;
                border: 2px solid #cc0000;
                background: ${it.bg};
                color: ${it.text};
                display: flex;
                align-items: center;
                gap: 12px;
                flex-shrink: 0;
            `;

            const clock = buildClockSvg();
            if (currentActivity.type === 'recording') {
                const c = document.createElement('canvas');
                c.style.cssText = 'width:48px;height:18px;flex-shrink:0;';
                act.appendChild(c);
            } else if (isClockType(currentActivity.type)) {
                act.appendChild(clock.svg);
            }

            const text = document.createElement('div');
            text.style.cssText = 'flex:1;min-width:0;';
            const head = document.createElement('div');
            head.textContent = T('Активное действие');
            head.style.cssText = 'font-size: 11px; color: #cc0000; letter-spacing: .6px; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;';
            text.appendChild(head);

            const valueEl = document.createElement('div');
            valueEl.className = 'lb-shade-activity-value';
            if (currentActivity.type === 'recording') {
                const p = currentActivity.payload || {};
                const paused = p.paused ? ' · ' + T('ПАУЗА') : '';
                valueEl.textContent = T('Запись') + ' ' + formatSecondsTenths(p.elapsed || 0) + paused;
            } else if (isClockType(currentActivity.type)) {
                valueEl.textContent = buildClockLabelText(currentActivity);
            } else {
                valueEl.textContent = buildLeftContent(currentActivity);
            }
            valueEl.style.cssText = 'font-size: 15px; font-weight: 600; overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            text.appendChild(valueEl);

            act.appendChild(text);

            if (currentActivity.appId) {
                act.style.cursor = 'pointer';
                act.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const id = currentActivity.appId;
                    if (typeof window[id + 'Init'] === 'function') {
                        window.__appOpenedFrom = 'notification';
                        window[id + 'Init']();
                    }
                    closeShade();
                });
            }

            body.appendChild(act);
        }

        // 2) Пустое состояние
        if (notifications.length === 0) {
            if (!currentActivity) {
                const empty = document.createElement('div');
                empty.textContent = T('Нет уведомлений');
                empty.style.cssText = 'color: ' + it.muted + '; font-size: 14px; text-align: center; padding: 40px 12px;';
                body.appendChild(empty);
            }
            return;
        }

        // 3) Список уведомлений — непрозрачные
        notifications.forEach(function(n) {
            body.appendChild(buildNotificationItem(n, it));
        });
    }

    function buildNotificationItem(n, it) {
        if (!it) it = getShadeItemColors();

        const item = document.createElement('div');
        item.className = 'lb-shade-item';
        item.dataset.id = n.id;
        item.style.cssText = `
            padding: 14px 16px;
            background: ${it.bg};
            border: 2px solid ${it.border};
            color: ${it.text};
            display: flex;
            align-items: flex-start;
            gap: 12px;
            cursor: pointer;
            transition: background .2s ease, border-color .2s ease, transform .25s cubic-bezier(.22,1,.36,1), opacity .25s ease;
            touch-action: pan-y;
            position: relative;
            overflow: hidden;
            will-change: transform;
            -webkit-tap-highlight-color: transparent;
        `;

        if (n.icon) {
            const img = document.createElement('img');
            img.src = n.icon;
            img.style.cssText = 'width:36px;height:36px;object-fit:contain;flex-shrink:0;';
            img.onerror = function() { this.style.display = 'none'; };
            item.appendChild(img);
        } else {
            const ph = document.createElement('div');
            ph.textContent = (n.appName || n.title || '?').charAt(0);
            ph.style.cssText = 'width:36px;height:36px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#cc0000;color:#ffffff;font-weight:700;';
            item.appendChild(ph);
        }

        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;';

        const head = document.createElement('div');
        head.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px;';
        const nameEl = document.createElement('div');
        nameEl.textContent = n.appName || n.title || '';
        nameEl.style.cssText = 'font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
        head.appendChild(nameEl);

        const timeEl = document.createElement('div');
        const d = new Date(n.time);
        timeEl.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        timeEl.style.cssText = 'font-size: 11px; color: ' + it.muted + '; flex-shrink: 0;';
        head.appendChild(timeEl);

        info.appendChild(head);

        if (n.title && n.appName) {
            const titleEl = document.createElement('div');
            titleEl.textContent = n.title;
            titleEl.style.cssText = 'font-size: 13px; font-weight: 600; margin-bottom: 2px;';
            info.appendChild(titleEl);
        }

        if (n.body) {
            const bodyEl = document.createElement('div');
            bodyEl.textContent = n.body;
            bodyEl.style.cssText = 'font-size: 12px; color: ' + it.muted + '; line-height: 1.4; word-break: break-word;';
            info.appendChild(bodyEl);
        }

        item.appendChild(info);

        let movedDuringSwipe = false;
        item.addEventListener('click', function(e) {
            if (movedDuringSwipe) { movedDuringSwipe = false; return; }
            e.stopPropagation();
            openNotificationTarget(n);
        });

        bindSwipeToDismiss(item, n.id, function() { movedDuringSwipe = true; });

        return item;
    }

    function bindSwipeToDismiss(item, id, onMove) {
        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let dragging = false;
        let decided = false;
        let isHorizontal = false;

        function onStart(e) {
            const t = (e.touches && e.touches[0]) || e;
            startX = t.clientX;
            startY = t.clientY;
            currentX = 0;
            dragging = true;
            decided = false;
            isHorizontal = false;
            item.style.transition = 'none';
        }

        function onMoveHandler(e) {
            if (!dragging) return;
            const t = (e.touches && e.touches[0]) || e;
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;

            if (!decided) {
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                    decided = true;
                    isHorizontal = Math.abs(dx) > Math.abs(dy);
                    if (isHorizontal && onMove) onMove();
                }
            }
            if (!isHorizontal) return;

            if (e.cancelable) e.preventDefault();
            currentX = dx;
            const opacity = Math.max(0, 1 - Math.abs(dx) / 220);
            item.style.transform = 'translateX(' + dx + 'px)';
            item.style.opacity = String(opacity);
        }

        function onEnd() {
            if (!dragging) return;
            dragging = false;
            item.style.transition = 'transform .25s cubic-bezier(.22,1,.36,1), opacity .25s ease';
            if (isHorizontal && Math.abs(currentX) > 90) {
                const dir = currentX > 0 ? 1 : -1;
                item.style.transform = 'translateX(' + (dir * 400) + 'px)';
                item.style.opacity = '0';
                setTimeout(function() {
                    removeNotification(id);
                }, 200);
            } else {
                item.style.transform = '';
                item.style.opacity = '1';
            }
        }

        item.addEventListener('touchstart', onStart, { passive: true });
        item.addEventListener('touchmove', onMoveHandler, { passive: false });
        item.addEventListener('touchend', onEnd, { passive: true });
        item.addEventListener('touchcancel', onEnd, { passive: true });

        item.addEventListener('mousedown', onStart);
        window.addEventListener('mousemove', onMoveHandler);
        window.addEventListener('mouseup', onEnd);
    }

    // ============================================
    // ЖЕСТЫ НА LIVE BAR: свайп сверху вниз → открыть шторку
    // ============================================

    function bindShadeGestures() {
        let startY = 0;
        let startX = 0;
        let tracking = false;

        function onStart(e) {
            if (shadeOpen) return;
            const t = (e.touches && e.touches[0]) || e;
            startX = t.clientX;
            startY = t.clientY;
            tracking = true;
        }

        function onMoveHandler(e) {
            if (!tracking) return;
            const t = (e.touches && e.touches[0]) || e;
            const dy = t.clientY - startY;
            const dx = t.clientX - startX;
            if (dy > 40 && Math.abs(dy) > Math.abs(dx)) {
                tracking = false;
                if (e.cancelable) e.preventDefault();
                openShade();
            }
        }

        function onEnd() { tracking = false; }

        barEl.addEventListener('touchstart', onStart, { passive: true });
        barEl.addEventListener('touchmove', onMoveHandler, { passive: false });
        barEl.addEventListener('touchend', onEnd, { passive: true });
        barEl.addEventListener('touchcancel', onEnd, { passive: true });

        barEl.addEventListener('mousedown', onStart);
        window.addEventListener('mousemove', onMoveHandler);
        window.addEventListener('mouseup', onEnd);
    }

    // Свайп снизу вверх в любом месте шторки закрывает её
    function bindShadeCloseGesture() {
        if (!shadeEl) return;
        let startY = 0;
        let startX = 0;
        let tracking = false;

        shadeEl.addEventListener('touchstart', function(e) {
            const t = (e.touches && e.touches[0]) || e;
            startX = t.clientX;
            startY = t.clientY;
            tracking = true;
        }, { passive: true });

        shadeEl.addEventListener('touchmove', function(e) {
            if (!tracking) return;
            const t = (e.touches && e.touches[0]) || e;
            const dy = t.clientY - startY;
            const dx = t.clientX - startX;
            if (dy < -60 && Math.abs(dy) > Math.abs(dx)) {
                tracking = false;
                if (e.cancelable) e.preventDefault();
                closeShade();
            }
        }, { passive: false });

        shadeEl.addEventListener('touchend', function() { tracking = false; }, { passive: true });
        shadeEl.addEventListener('touchcancel', function() { tracking = false; }, { passive: true });

        shadeEl.addEventListener('mousedown', function(e) {
            startX = e.clientX;
            startY = e.clientY;
            tracking = true;
        });
        shadeEl.addEventListener('mousemove', function(e) {
            if (!tracking) return;
            const dy = e.clientY - startY;
            const dx = e.clientX - startX;
            if (dy < -60 && Math.abs(dy) > Math.abs(dx)) {
                tracking = false;
                closeShade();
            }
        });
        shadeEl.addEventListener('mouseup', function() { tracking = false; });
    }

    function openShade() {
        ensureShade();
        if (shadeOpen) return;
        shadeOpen = true;
        renderShade();
        // Плавное "проявление" через blur → 0 и opacity → 1
        shadeEl.style.pointerEvents = 'auto';
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                shadeEl.style.opacity = '1';
                shadeEl.style.filter = 'blur(0px)';
            });
        });
    }

    function closeShade() {
        if (!shadeOpen || !shadeEl) return;
        shadeOpen = false;
        // Уход в размытие
        shadeEl.style.opacity = '0';
        shadeEl.style.filter = 'blur(24px)';
        shadeEl.style.pointerEvents = 'none';
    }

    // ============================================
    // PUBLIC API
    // ============================================

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
        optimizeSystem: optimizeSystem,

        notify: function(data) {
            return addNotification(data);
        },
        getNotifications: function() {
            return notifications.slice();
        },
        removeNotification: removeNotification,
        clearNotifications: clearAllNotifications,
        openShade: openShade,
        closeShade: closeShade
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            restore();
            ensureShade();
        });
    } else {
        restore();
        ensureShade();
    }

    window.addEventListener('shnuk:theme-changed', function() {
        applyBarColors();
        // Пересобираем шторку, чтобы обновить цвета под новую тему
        if (shadeEl && shadeEl.parentNode) {
            shadeEl.parentNode.removeChild(shadeEl);
            shadeEl = null;
            ensureShade();
            if (shadeOpen) {
                renderShade();
                shadeEl.style.opacity = '1';
                shadeEl.style.filter = 'blur(0px)';
                shadeEl.style.pointerEvents = 'auto';
            }
        }
    });

    window.addEventListener('shnuk:lang-changed', function() {
        if (currentActivity) {
            if (currentActivity.type === 'recording') renderRecordingLeft(currentActivity);
            else if (isClockType(currentActivity.type)) renderClockLeft(currentActivity);
            else if (leftSlot) leftSlot.textContent = buildLeftContent(currentActivity);
        }
        if (shadeEl) {
            const titleEl = shadeEl.querySelector('.lb-shade-header > div:first-child');
            if (titleEl) titleEl.textContent = T('Уведомления');
            const btn = shadeEl.querySelector('#lbShadeClearAll');
            if (btn) btn.textContent = T('Очистить');
            if (shadeOpen) renderShade();
        }
    });

})();