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

    function playNotificationSound(type) {
        try {
            let file;
            if (type === 'error' || type === 'warning') file = 'error.mp3';
            else if (type === 'success') file = 'window2.mp3';
            else file = 'window.mp3';

            if (window.L && typeof window.L.playSound === 'function') {
                window.L.playSound(file);
                return;
            }
            if (typeof window.playSound === 'function') {
                window.playSound(file);
            }
        } catch(e) {}
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
            touch-action: none;
            transition: height .45s cubic-bezier(.22,1,.36,1), background .45s cubic-bezier(.22,1,.36,1), color .45s cubic-bezier(.22,1,.36,1), align-items .45s cubic-bezier(.22,1,.36,1), padding .45s cubic-bezier(.22,1,.36,1), opacity .25s ease;
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
            cursor: pointer;
        `;
        rightSlot.textContent = formatClock();

        barEl.appendChild(leftSlot);
        barEl.appendChild(rightSlot);
        document.body.appendChild(barEl);

        applyBarColors();
        leftSlot.addEventListener('click', onLeftClick);
        rightSlot.addEventListener('click', function(e) {
            e.stopPropagation();
            if (shadeOpen) closeShade();
            else openShade();
        });

        bindShadeGestures();

        startClock();
        setCssVar(BAR_HEIGHT);
    }

    function onLeftClick(e) {
        e.stopPropagation();
        if (currentActivity && currentActivity.appId) {
            const id = currentActivity.appId;
            if (typeof window.ShnukOpenAppById === 'function') {
                window.__appOpenedFrom = 'notification';
                window.__notificationOpenedAppId = id;
                window.ShnukOpenAppById(id, currentActivity.appName || null);
                return;
            }
            if (typeof window[id + 'Init'] === 'function') {
                window.__appOpenedFrom = 'notification';
                window.__notificationOpenedAppId = id;
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
            updateShadeActivity();
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
        updateShadeActivity();
    }

    function setActivity(data) {
        if (!data || !data.type) { clearActivity(); return; }
        applyActivity({
            type: data.type,
            appId: data.appId || null,
            appName: data.appName || null,
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
        updateShadeActivity();
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

        playNotificationSound(n.type);

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

        window.__appOpenedFrom = 'notification';

        if (n.appName && window.__collarAppRegistry) {
            const reg = window.__collarAppRegistry;
            const entry = reg[n.appName];
            if (entry && typeof window.ShnukOpenAppById === 'function') {
                window.__notificationOpenedAppId = entry.id;
                try {
                    const ok = window.ShnukOpenAppById(entry.id);
                    if (ok) return;
                } catch(e) {}
            }
        }

        if (n.appName && window.AppScanner && AppScanner.getApps && typeof window.ShnukOpenAppById === 'function') {
            AppScanner.getApps().then(function(apps) {
                const found = apps.find(a => a.name === n.appName);
                if (found) {
                    window.__notificationOpenedAppId = found.id;
                    try { window.ShnukOpenAppById(found.id); } catch(e) {}
                } else if (n.appId) {
                    window.__notificationOpenedAppId = n.appId;
                    try { window.ShnukOpenAppById(n.appId); } catch(e) {}
                }
            }).catch(function() {
                if (n.appId) {
                    window.__notificationOpenedAppId = n.appId;
                    try { window.ShnukOpenAppById(n.appId); } catch(e) {}
                }
            });
            return;
        }

        if (n.appId && typeof window.ShnukOpenAppById === 'function') {
            window.__notificationOpenedAppId = n.appId;
            try {
                const ok = window.ShnukOpenAppById(n.appId);
                if (ok) return;
            } catch(e) {}
        }

        if (n.appId) {
            window.__notificationOpenedAppId = n.appId;
            const initFns = [n.appId + 'Init', n.appId.replace(/-/g, '') + 'Init'];
            for (const fn of initFns) {
                if (typeof window[fn] === 'function') {
                    try { window[fn](); return; } catch(e) {}
                }
            }
        }

        if (n.appName) {
            const allIcons = document.querySelectorAll('.icon-item[data-app-id]');
            for (const el of allIcons) {
                const name = el.dataset.appName || '';
                if (name === n.appName) {
                    window.__notificationOpenedAppId = el.dataset.appId || null;
                    el.click();
                    return;
                }
            }
        }
    }

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

        shadeEl = document.createElement('div');
        shadeEl.id = 'liveBarShade';
        shadeEl.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: ${bd.bg};
            -webkit-backdrop-filter: blur(${bd.blur});
            backdrop-filter: blur(${bd.blur});
            z-index: 2147483647;
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
            padding-top: ${BAR_HEIGHT}px;
            touch-action: none;
        `;

        const header = document.createElement('div');
        header.className = 'lb-shade-header';
        header.style.cssText = `
            padding: 10px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: transparent;
            border-bottom: none;
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
            min-height: 0;
            overflow-y: auto;
            padding: 16px 20px 120px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 12px;
            -webkit-overflow-scrolling: touch;
            touch-action: pan-y;
            overscroll-behavior: contain;
        `;

        const bottomBlur = document.createElement('div');
        bottomBlur.className = 'lb-shade-bottom-blur';
        bottomBlur.style.cssText = `
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            height: 90px;
            pointer-events: none;
            z-index: 5;
            -webkit-backdrop-filter: blur(14px);
            backdrop-filter: blur(14px);
            -webkit-mask-image: linear-gradient(to top, #000 0%, #000 40%, transparent 100%);
            mask-image: linear-gradient(to top, #000 0%, #000 40%, transparent 100%);
        `;

        shadeEl.appendChild(header);
        shadeEl.appendChild(body);
        shadeEl.appendChild(bottomBlur);
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

        if (currentActivity) {
            body.appendChild(buildShadeActivityNode(currentActivity, it));
        }

        if (notifications.length === 0) {
            if (!currentActivity) {
                const empty = document.createElement('div');
                empty.textContent = T('Нет уведомлений');
                empty.style.cssText = 'color: ' + it.muted + '; font-size: 14px; text-align: center; padding: 40px 12px;';
                body.appendChild(empty);
            }
            return;
        }

        notifications.forEach(function(n) {
            body.appendChild(buildNotificationItem(n, it));
        });
    }

    function buildShadeActivityNode(activity, it) {
        if (!it) it = getShadeItemColors();

        const item = document.createElement('div');
        item.className = 'lb-shade-activity';
        item.id = 'lbShadeActivity';
        item.style.cssText = `
            padding: 14px 16px;
            background: ${it.bg};
            border: 2px solid #cc0000;
            color: ${it.text};
            display: flex;
            align-items: flex-start;
            gap: 12px;
            flex-shrink: 0;
        `;

        const leading = document.createElement('div');
        leading.style.cssText = 'width:36px;height:36px;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;';

        if (activity.type === 'recording') {
            const c = document.createElement('canvas');
            c.style.cssText = 'width:36px;height:18px;display:block;';
            leading.appendChild(c);
            startShadeRecordingWave(c);
        } else if (isClockType(activity.type)) {
            const clock = buildClockSvg();
            leading.appendChild(clock.svg);
        } else {
            const ph = document.createElement('div');
            ph.textContent = 'A';
            ph.style.cssText = 'width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:#cc0000;color:#ffffff;font-weight:700;font-size:14px;';
            leading.appendChild(ph);
        }

        item.appendChild(leading);

        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;';

        const head = document.createElement('div');
        head.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px;';

        const nameEl = document.createElement('div');
        nameEl.textContent = T('Активное действие');
        nameEl.style.cssText = 'font-size: 14px; font-weight: 700; color: #cc0000; letter-spacing: .4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
        head.appendChild(nameEl);

        info.appendChild(head);

        const valueEl = document.createElement('div');
        valueEl.id = 'lbShadeActivityValue';
        valueEl.textContent = buildShadeActivityValueText(activity);
        valueEl.style.cssText = 'font-size: 13px; color: ' + it.text + '; line-height: 1.4; word-break: break-word;';
        info.appendChild(valueEl);

        item.appendChild(info);

        if (activity.appId) {
            item.style.cursor = 'pointer';
            item.addEventListener('click', function(e) {
                e.stopPropagation();
                openNotificationTarget({ appId: activity.appId, appName: activity.appName || '' });
            });
        }

        return item;
    }

    function buildShadeActivityValueText(activity) {
        if (!activity) return '';
        if (activity.type === 'recording') {
            const p = activity.payload || {};
            const paused = p.paused ? ' · ' + T('ПАУЗА') : '';
            return T('Запись') + ' ' + formatSecondsTenths(p.elapsed || 0) + paused;
        }
        if (isClockType(activity.type)) {
            return buildClockLabelText(activity);
        }
        return buildLeftContent(activity);
    }

    function updateShadeActivity() {
        if (!shadeEl || !shadeOpen) return;
        const existing = document.getElementById('lbShadeActivity');
        if (!existing) {
            if (currentActivity) renderShade();
            return;
        }
        if (!currentActivity) {
            if (existing.parentNode) existing.parentNode.removeChild(existing);
            return;
        }
        const valueEl = document.getElementById('lbShadeActivityValue');
        if (valueEl) {
            valueEl.textContent = buildShadeActivityValueText(currentActivity);
        }
    }

    let shadeWaveAnimId = null;
    let shadeWaveRunning = false;
    let shadeWaveStart = 0;
    let shadeWaveCanvas = null;
    let shadeWaveCtx = null;

    function startShadeRecordingWave(canvas) {
        stopShadeRecordingWave();
        shadeWaveCanvas = canvas;
        shadeWaveCtx = canvas.getContext('2d');
        shadeWaveRunning = true;
        shadeWaveStart = performance.now();
        function loop(now) {
            if (!shadeWaveRunning) return;
            drawShadeRecordingWave(now);
            shadeWaveAnimId = requestAnimationFrame(loop);
        }
        shadeWaveAnimId = requestAnimationFrame(loop);
    }

    function stopShadeRecordingWave() {
        shadeWaveRunning = false;
        if (shadeWaveAnimId) { cancelAnimationFrame(shadeWaveAnimId); shadeWaveAnimId = null; }
        shadeWaveCanvas = null;
        shadeWaveCtx = null;
    }

    function drawShadeRecordingWave(now) {
        const canvas = shadeWaveCanvas;
        const ctx = shadeWaveCtx;
        if (!canvas || !ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = canvas.getBoundingClientRect();
        const w = rect.width || 36;
        const h = rect.height || 18;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        ctx.clearRect(0, 0, w, h);
        const paused = currentActivity && currentActivity.payload && currentActivity.payload.paused;
        const t = paused ? 0 : (now - shadeWaveStart) / 1000;
        const centerY = h / 2;
        const amp = h * 0.42;
        ctx.strokeStyle = '#cc0000';
        ctx.lineWidth = 1.4;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.globalAlpha = paused ? 0.35 : 1;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 1) {
            const phase1 = (x + t * 90) * 0.35;
            const phase2 = (x - t * 60) * 0.5 + 1.7;
            const y = centerY + Math.sin(phase1) * amp * 0.55 + Math.sin(phase2) * amp * 0.35;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
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
            flex-shrink: 0;
            touch-action: pan-y;
            position: relative;
            overflow: hidden;
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

        return item;
    }

    function bindShadeGestures() {
        let startY = 0;
        let startX = 0;
        let tracking = false;

        function getPoint(e) {
            if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            return { x: e.clientX, y: e.clientY };
        }

        function onStart(e) {
            if (shadeOpen) return;
            const p = getPoint(e);
            startX = p.x;
            startY = p.y;
            tracking = true;
        }

        function onMoveHandler(e) {
            if (!tracking) return;
            const p = getPoint(e);
            const dy = p.y - startY;
            const dx = p.x - startX;
            if (dy > 18 && Math.abs(dy) > Math.abs(dx)) {
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

        if (window.PointerEvent) {
            barEl.addEventListener('pointerdown', onStart);
            barEl.addEventListener('pointermove', onMoveHandler);
            barEl.addEventListener('pointerup', onEnd);
            barEl.addEventListener('pointercancel', onEnd);
        } else {
            barEl.addEventListener('mousedown', onStart);
            window.addEventListener('mousemove', onMoveHandler);
            window.addEventListener('mouseup', onEnd);
        }
    }

    let shadeCloseHandler = null;

    function bindShadeCloseGesture() {
        if (shadeCloseHandler) {
            window.removeEventListener('touchstart', shadeCloseHandler.onStart, { passive: true });
            window.removeEventListener('touchmove', shadeCloseHandler.onMove, { passive: false });
            window.removeEventListener('touchend', shadeCloseHandler.onEnd, { passive: true });
            window.removeEventListener('touchcancel', shadeCloseHandler.onEnd, { passive: true });
            window.removeEventListener('mousedown', shadeCloseHandler.onStart);
            window.removeEventListener('mousemove', shadeCloseHandler.onMove);
            window.removeEventListener('mouseup', shadeCloseHandler.onEnd);
        }

        let startY = 0;
        let startX = 0;
        let tracking = false;
        let startInShade = false;

        function getPoint(e) {
            if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            return { x: e.clientX, y: e.clientY };
        }

        function isInsideShade(x, y) {
            if (!shadeEl || !shadeOpen) return false;
            const rect = shadeEl.getBoundingClientRect();
            return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        }

        function onStart(e) {
            if (!shadeOpen) return;
            const p = getPoint(e);
            startX = p.x;
            startY = p.y;
            startInShade = isInsideShade(p.x, p.y);
            tracking = startInShade;
        }

        function onMove(e) {
            if (!tracking || !shadeOpen) return;
            const p = getPoint(e);
            const dy = p.y - startY;
            const dx = p.x - startX;
            if (dy < -30 && Math.abs(dy) > Math.abs(dx) * 1.2) {
                tracking = false;
                if (e.cancelable) e.preventDefault();
                closeShade();
            }
        }

        function onEnd() {
            tracking = false;
            startInShade = false;
        }

        shadeCloseHandler = { onStart: onStart, onMove: onMove, onEnd: onEnd };

        window.addEventListener('touchstart', onStart, { passive: true });
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd, { passive: true });
        window.addEventListener('touchcancel', onEnd, { passive: true });

        window.addEventListener('mousedown', onStart);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
    }

    function openShade() {
        ensureShade();
        if (shadeOpen) return;
        shadeOpen = true;
        renderShade();
        if (barEl) {
            barEl.style.pointerEvents = 'none';
            barEl.style.opacity = '0';
        }
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
        stopShadeRecordingWave();
        shadeEl.style.opacity = '0';
        shadeEl.style.filter = 'blur(24px)';
        shadeEl.style.pointerEvents = 'none';
        if (barEl) {
            barEl.style.pointerEvents = 'auto';
            barEl.style.opacity = '1';
        }
    }

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
        if (shadeEl && shadeEl.parentNode) {
            shadeEl.parentNode.removeChild(shadeEl);
            shadeEl = null;
            ensureShade();
            if (shadeOpen) {
                renderShade();
                shadeEl.style.opacity = '1';
                shadeEl.style.filter = 'blur(0px)';
                shadeEl.style.pointerEvents = 'auto';
                if (barEl) {
                    barEl.style.pointerEvents = 'none';
                    barEl.style.opacity = '0';
                }
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