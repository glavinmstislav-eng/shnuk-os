// time.js — Приложение часы

(function() {
    'use strict';

    let isOpen = false;
    let timerInterval = null;
    let stopwatchInterval = null;
    let clockInterval = null;
    let timerSeconds = 0;
    let timerTotal = 0;
    let stopwatchSeconds = 0;
    let stopwatchRunning = false;
    let timerRunning = false;
    let alarmTime = null;
    let alarmActive = false;
    let alarmTimeout = null;
    let alarmCheckInterval = null;
    let currentMode = 'analog';
    let currentPanel = 'main';

    let threeScene = null;
    let threeCamera = null;
    let threeRenderer = null;
    let threeSphere = null;
    let threeWire = null;
    let threeAnimationId = null;
    let threeReady = false;
    let threeLoading = false;
    let threeContainer = null;
    let spherePulse = 0;

    function playSfx(name) {
        try {
            if (window.L && typeof window.L.playSound === 'function') {
                window.L.playSound(name);
            } else if (typeof window.playSound === 'function') {
                window.playSound(name);
            }
        } catch(e) {}
    }

    function getThemeColors() {
        try {
            const style = getComputedStyle(document.documentElement);
            const bg = style.getPropertyValue('--bg-primary').trim() || '#ffffff';
            const text = style.getPropertyValue('--text-primary').trim() || '#1a1a1a';
            const muted = style.getPropertyValue('--text-muted').trim() || '#888888';
            const accent = style.getPropertyValue('--accent').trim() || '#cc0000';
            const onAccent = style.getPropertyValue('--text-on-accent').trim() || '#ffffff';
            return { bg, text, muted, accent, onAccent };
        } catch(e) {
            return { bg: '#ffffff', text: '#1a1a1a', muted: '#888888', accent: '#cc0000', onAccent: '#ffffff' };
        }
    }

    function hexToInt(hex) {
        if (!hex) return 0x000000;
        hex = String(hex).replace('#', '').trim();
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const n = parseInt(hex, 16);
        return isNaN(n) ? 0x000000 : n;
    }

    function pushLiveBar() {
        if (!window.LiveBar) return;
        if (stopwatchRunning) {
            window.LiveBar.set({
                type: 'stopwatch', appId: 'time',
                payload: { elapsed: stopwatchSeconds }
            });
        } else if (timerRunning) {
            window.LiveBar.set({
                type: 'timer', appId: 'time',
                payload: { remaining: timerSeconds, total: timerTotal }
            });
        } else if (alarmActive && alarmTime) {
            window.LiveBar.set({
                type: 'alarm', appId: 'time',
                payload: { time: alarmTime }
            });
        } else {
            window.LiveBar.clear();
        }
    }

    function openTime() {
        if (window.LiveBar && typeof window.LiveBar.resume === 'function') {
            window.LiveBar.resume('time');
        }
        if (isOpen) {
            const ex = document.getElementById('timeApp');
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }
        createUI();
    }

    function closeTime() {
        isOpen = false;
        if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
        document.removeEventListener('keydown', onKeyDown);

        const el = document.getElementById('timeApp');
        if (!el) return;

        if (window.ShnukCloseAnimation) {
            window.ShnukCloseAnimation(el, 'time', function() {
                closeThree();
                el.remove();
            });
        } else {
            el.style.opacity = '0';
            setTimeout(function() {
                closeThree();
                if (el.parentNode) el.parentNode.removeChild(el);
            }, 180);
        }
    }

    function destroy() {
        isOpen = false;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (stopwatchInterval) { clearInterval(stopwatchInterval); stopwatchInterval = null; }
        if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
        if (alarmTimeout) { clearTimeout(alarmTimeout); alarmTimeout = null; }
        if (alarmCheckInterval) { clearInterval(alarmCheckInterval); alarmCheckInterval = null; }
        timerRunning = false;
        stopwatchRunning = false;
        alarmActive = false;
        alarmTime = null;
        closeThree();
        document.removeEventListener('keydown', onKeyDown);
        const el = document.getElementById('timeApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        if (window.LiveBar) window.LiveBar.clear();
    }

    function closeThree() {
        if (threeAnimationId) {
            cancelAnimationFrame(threeAnimationId);
            threeAnimationId = null;
        }
        if (threeRenderer) {
            threeRenderer.dispose();
            if (threeRenderer.domElement && threeRenderer.domElement.parentNode) {
                threeRenderer.domElement.parentNode.removeChild(threeRenderer.domElement);
            }
            threeRenderer = null;
        }
        window.removeEventListener('resize', onThreeResize);
        if (threeSphere) {
            if (threeSphere.geometry) threeSphere.geometry.dispose();
            if (threeSphere.material) {
                if (Array.isArray(threeSphere.material)) {
                    threeSphere.material.forEach(m => m.dispose());
                } else {
                    threeSphere.material.dispose();
                }
            }
            threeSphere = null;
        }
        if (threeWire) {
            if (threeWire.geometry) threeWire.geometry.dispose();
            if (threeWire.material) threeWire.material.dispose();
            threeWire = null;
        }
        threeScene = null;
        threeCamera = null;
        threeReady = false;
        threeLoading = false;
    }

    function initThree(container) {
        threeContainer = container;
        if (typeof THREE === 'undefined') {
            if (threeLoading) return;
            threeLoading = true;
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
            script.onload = function() { threeLoading = false; initThreeScene(container); };
            script.onerror = function() { threeLoading = false; };
            document.head.appendChild(script);
            return;
        }
        initThreeScene(container);
    }

    function initThreeScene(container) {
        try {
            closeThree();

            const colors = getThemeColors();
            const bgInt = hexToInt(colors.bg);

            const width = container.clientWidth || window.innerWidth;
            const height = container.clientHeight || window.innerHeight;

            threeScene = new THREE.Scene();
            threeScene.background = new THREE.Color(bgInt);

            threeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
            threeCamera.position.set(0, 0, 3.2);
            threeCamera.lookAt(0, 0, 0);

            threeRenderer = new THREE.WebGLRenderer({ antialias: true });
            threeRenderer.setSize(width, height);
            threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            threeRenderer.setClearColor(bgInt, 1);
            container.appendChild(threeRenderer.domElement);

            // Свет — мягкий, без резких бликов
            const ambient = new THREE.AmbientLight(0xffffff, 0.9);
            threeScene.add(ambient);

            const dir = new THREE.DirectionalLight(0xffffff, 0.55);
            dir.position.set(3, 5, 5);
            threeScene.add(dir);

            // Икосфера — матовая жёлтая
            const geometry = new THREE.IcosahedronGeometry(1, 1);
            const material = new THREE.MeshStandardMaterial({
                color: 0xffe066,
                emissive: 0xffcc00,
                emissiveIntensity: 0.12,
                roughness: 0.95,
                metalness: 0.0,
                flatShading: true
            });
            threeSphere = new THREE.Mesh(geometry, material);
            threeScene.add(threeSphere);

            // Рёбра икосферы
            const wireGeo = new THREE.EdgesGeometry(geometry);
            const wireMat = new THREE.LineBasicMaterial({
                color: 0xcc9900,
                transparent: true,
                opacity: 0.3
            });
            threeWire = new THREE.LineSegments(wireGeo, wireMat);
            threeSphere.add(threeWire);

            threeReady = true;

            function animate() {
                threeAnimationId = requestAnimationFrame(animate);
                if (threeSphere) {
                    threeSphere.rotation.y += 0.006;
                    threeSphere.rotation.x += 0.002;
                    spherePulse += 0.02;
                    const s = 1 + Math.sin(spherePulse) * 0.04;
                    threeSphere.scale.set(s, s, s);
                }
                if (threeRenderer && threeScene && threeCamera) {
                    threeRenderer.render(threeScene, threeCamera);
                }
            }
            animate();

            window.addEventListener('resize', onThreeResize);
        } catch(e) {
            console.warn('[Time] Three.js ошибка:', e);
        }
    }

    function refreshThreeTheme() {
        if (!threeReady || !threeContainer) return;
        initThreeScene(threeContainer);
    }

    function onThreeResize() {
        if (!threeRenderer || !threeCamera) return;
        const container = document.getElementById('timeBg3D');
        if (!container) return;
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        threeCamera.aspect = width / height;
        threeCamera.updateProjectionMatrix();
        threeRenderer.setSize(width, height);
    }

    function createUI() {
        if (document.getElementById('timeApp')) {
            document.getElementById('timeApp').style.display = 'flex';
            return;
        }
        isOpen = true;

        const app = document.createElement('div');
        app.id = 'timeApp';
        app.style.cssText = `
            position: fixed;
            top: var(--livebar-h, 44px);
            left: 0;
            width: 100%;
            height: calc(100% - var(--livebar-h, 44px));
            background: var(--bg-primary);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            font-family: 'ST-SimpleSquare', monospace;
            color: var(--text-primary);
            opacity: 0;
            animation: timeFadeIn 0.3s ease forwards;
            overflow: hidden;
            transition: background 0.4s ease, color 0.4s ease;
        `;

        if (!document.getElementById('timeStyles')) {
            const style = document.createElement('style');
            style.id = 'timeStyles';
            style.textContent = `
                @keyframes timeFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes timePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
                @keyframes timeMenuIn {
                    from { opacity: 0; filter: blur(20px); transform: translateY(-10px) scale(0.95); }
                    to { opacity: 1; filter: blur(0); transform: translateY(0) scale(1); }
                }
                @keyframes timeMenuOut {
                    from { opacity: 1; filter: blur(0); transform: translateY(0) scale(1); }
                    to { opacity: 0; filter: blur(20px); transform: translateY(-10px) scale(0.95); }
                }

                .time-bg-3d {
                    position: absolute;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    z-index: 0;
                    pointer-events: none;
                    background: var(--bg-primary);
                }
                .time-bg-3d canvas {
                    display: block;
                    width: 100% !important;
                    height: 100% !important;
                    background: var(--bg-primary);
                }

                .time-header {
                    position: relative;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    background: var(--header-bg);
                    border-bottom: 2px solid var(--border-color);
                    flex-shrink: 0;
                    z-index: 10;
                    color: var(--header-text);
                }
                .time-header h1 {
                    font-size: 18px;
                    font-weight: 600;
                    margin: 0;
                    letter-spacing: 0.5px;
                }
                .time-header-actions {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }
                .time-menu-btn {
                    width: 40px;
                    height: 40px;
                    background: var(--bg-primary);
                    border: 2px solid var(--border-color);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-primary);
                    transition: all 0.2s ease;
                    padding: 0;
                    -webkit-tap-highlight-color: transparent;
                }
                .time-menu-btn:hover {
                    border-color: var(--accent);
                    background: var(--bg-hover);
                }
                .time-menu-btn:active { transform: scale(0.94); }
                .time-menu-btn svg { display: block; width: 22px; height: 22px; }
                .time-close-btn {
                    width: 40px;
                    height: 40px;
                    background: var(--accent);
                    border: 2px solid var(--accent);
                    color: var(--text-on-accent);
                    cursor: pointer;
                    font-size: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: 'ST-SimpleSquare', monospace;
                    transition: all 0.2s ease;
                    -webkit-tap-highlight-color: transparent;
                    padding: 0;
                }
                .time-close-btn:hover {
                    background: var(--accent-dark);
                    border-color: var(--accent-dark);
                    color: var(--text-on-accent);
                }
                .time-close-btn:active { transform: scale(0.94); }

                .time-menu-dropdown {
                    position: absolute;
                    top: 68px;
                    right: 20px;
                    background: var(--bg-primary);
                    border: 2px solid var(--border-color);
                    min-width: 220px;
                    z-index: 100;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.15);
                    padding: 8px;
                    animation: timeMenuIn 0.35s cubic-bezier(0.22, 1, 0.36, 1);
                }
                .time-menu-dropdown.closing {
                    animation: timeMenuOut 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                }
                .time-menu-section-title {
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: var(--text-muted);
                    padding: 10px 14px 6px;
                    font-weight: 600;
                }
                .time-menu-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    width: 100%;
                    padding: 11px 14px;
                    background: none;
                    border: none;
                    color: var(--text-primary);
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 14px;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    -webkit-tap-highlight-color: transparent;
                }
                .time-menu-item:hover {
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                }
                .time-menu-item.active {
                    background: var(--accent);
                    color: var(--text-on-accent);
                }
                .time-menu-item.active:hover {
                    background: var(--accent);
                    color: var(--text-on-accent);
                }
                .time-menu-item .mi-icon {
                    width: 18px;
                    height: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    opacity: 0.85;
                }
                .time-menu-item .mi-icon svg { width: 100%; height: 100%; display: block; }

                .time-content {
                    position: relative;
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px 20px 40px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    z-index: 5;
                    box-sizing: border-box;
                    background: transparent;
                }

                .clock-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    max-width: 500px;
                }
                .clock-canvas-wrapper {
                    position: relative;
                    width: 280px;
                    height: 280px;
                    margin: 0 auto;
                }
                .clock-canvas-wrapper canvas {
                    width: 100%;
                    height: 100%;
                    display: block;
                }
                .digital-time {
                    font-size: 72px;
                    font-weight: 700;
                    color: var(--text-primary);
                    letter-spacing: 6px;
                    text-align: center;
                    padding: 20px 0;
                    display: none;
                }
                .digital-time .seconds {
                    font-size: 36px;
                    color: var(--text-muted);
                    letter-spacing: 2px;
                }
                .digital-time .blink {
                    animation: timePulse 1s step-end infinite;
                }
                .date-display {
                    font-size: 15px;
                    color: var(--text-muted);
                    letter-spacing: 2px;
                    margin-top: 12px;
                    text-align: center;
                }

                .time-panel {
                    width: 100%;
                    max-width: 400px;
                    padding: 20px 0;
                    display: none;
                }
                .time-panel.active {
                    display: block;
                }

                .timer-display {
                    font-size: 56px;
                    font-weight: 700;
                    text-align: center;
                    letter-spacing: 4px;
                    padding: 16px 0;
                    color: var(--text-primary);
                }
                .timer-controls {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                    flex-wrap: wrap;
                    margin-top: 12px;
                }
                .timer-controls button {
                    padding: 12px 26px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 14px;
                    transition: all 0.2s ease;
                    min-width: 90px;
                }
                .timer-controls button:hover {
                    background: var(--bg-secondary);
                    border-color: var(--accent);
                }
                .timer-controls button.primary {
                    background: var(--accent);
                    color: var(--text-on-accent);
                    border-color: var(--accent);
                }
                .timer-controls button.primary:hover {
                    background: var(--accent-dark);
                }
                .timer-controls button.danger {
                    border-color: var(--accent);
                    color: var(--accent);
                    background: var(--bg-primary);
                }
                .timer-controls button.danger:hover {
                    background: var(--accent);
                    color: var(--text-on-accent);
                }
                .timer-input {
                    display: flex;
                    gap: 8px;
                    justify-content: center;
                    align-items: center;
                    margin-top: 8px;
                }
                .timer-input input {
                    width: 64px;
                    padding: 10px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-size: 20px;
                    text-align: center;
                    font-family: 'ST-SimpleSquare', monospace;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .timer-input input:focus {
                    border-color: var(--accent);
                }
                .timer-input span {
                    font-size: 18px;
                    color: var(--text-muted);
                }

                .alarm-section {
                    padding: 8px 0;
                }
                .alarm-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 14px 0;
                    border-bottom: 1px solid var(--border-color);
                }
                .alarm-row:last-child { border-bottom: none; }
                .alarm-label {
                    font-size: 13px;
                    color: var(--text-muted);
                    letter-spacing: 0.5px;
                }
                .alarm-time {
                    font-size: 26px;
                    font-weight: 600;
                    color: var(--text-primary);
                    letter-spacing: 2px;
                }
                .alarm-toggle {
                    width: 48px;
                    height: 28px;
                    background: var(--border-color);
                    border: none;
                    border-radius: 14px;
                    cursor: pointer;
                    position: relative;
                    transition: background 0.3s;
                    padding: 0;
                }
                .alarm-toggle.active { background: var(--accent); }
                .alarm-toggle::after {
                    content: '';
                    position: absolute;
                    top: 2px; left: 2px;
                    width: 24px; height: 24px;
                    background: var(--bg-primary);
                    border-radius: 50%;
                    transition: transform 0.3s;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .alarm-toggle.active::after {
                    transform: translateX(20px);
                }
                .alarm-set {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    justify-content: center;
                    margin-top: 16px;
                }
                .alarm-set input {
                    width: 56px;
                    padding: 10px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-size: 18px;
                    text-align: center;
                    font-family: 'ST-SimpleSquare', monospace;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .alarm-set input:focus {
                    border-color: var(--accent);
                }
                .alarm-set span {
                    font-size: 18px;
                    color: var(--text-muted);
                }
                .alarm-set button {
                    padding: 12px 24px;
                    border: 2px solid var(--accent);
                    background: var(--accent);
                    color: var(--text-on-accent);
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 14px;
                    transition: background 0.2s;
                }
                .alarm-set button:hover {
                    background: var(--accent-dark);
                }
                .alarm-status {
                    margin-top: 16px;
                    font-size: 13px;
                    color: var(--text-muted);
                    text-align: center;
                }

                @media (max-width: 500px) {
                    .time-header { padding: 12px 16px; }
                    .time-header h1 { font-size: 16px; }
                    .time-menu-dropdown { top: 60px; right: 12px; min-width: 200px; }
                    .time-content { padding: 20px 16px 30px; }
                    .clock-canvas-wrapper { width: 220px; height: 220px; }
                    .digital-time { font-size: 48px; letter-spacing: 4px; }
                    .digital-time .seconds { font-size: 24px; }
                    .timer-display { font-size: 42px; }
                    .date-display { font-size: 13px; }
                    .timer-controls button { padding: 10px 18px; font-size: 13px; min-width: 80px; }
                    .timer-input input { width: 54px; font-size: 18px; }
                }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'time-header';
        header.innerHTML = `
            <h1>Часы</h1>
            <div class="time-header-actions">
                <button class="time-menu-btn" id="timeMenuBtn" title="Меню">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="4" y1="7" x2="20" y2="7"/>
                        <line x1="4" y1="12" x2="20" y2="12"/>
                        <line x1="4" y1="17" x2="20" y2="17"/>
                    </svg>
                </button>
                <button class="time-close-btn" id="timeCloseBtn" title="Закрыть">✕</button>
            </div>
        `;

        const bg3d = document.createElement('div');
        bg3d.className = 'time-bg-3d';
        bg3d.id = 'timeBg3D';

        const content = document.createElement('div');
        content.className = 'time-content';

        const clockContainer = document.createElement('div');
        clockContainer.className = 'clock-container';
        clockContainer.id = 'clockContainer';
        clockContainer.innerHTML = `
            <div class="clock-canvas-wrapper"><canvas id="clockCanvas" width="280" height="280"></canvas></div>
            <div class="digital-time" id="digitalTime">
                <span id="digitalHours">00</span><span class="blink">:</span>
                <span id="digitalMinutes">00</span><span class="blink">:</span>
                <span class="seconds" id="digitalSeconds">00</span>
            </div>
            <div class="date-display" id="dateDisplay"></div>
        `;
        content.appendChild(clockContainer);

        const timerPanel = document.createElement('div');
        timerPanel.className = 'time-panel';
        timerPanel.id = 'panelTimer';
        timerPanel.innerHTML = `
            <div class="timer-display" id="timerDisplay">00:00</div>
            <div class="timer-input">
                <input type="number" id="timerMinutes" min="0" max="99" value="1" />
                <span>мин</span>
                <input type="number" id="timerSeconds" min="0" max="59" value="0" />
                <span>сек</span>
            </div>
            <div class="timer-controls">
                <button class="primary" id="timerStartBtn">Старт</button>
                <button id="timerPauseBtn">Пауза</button>
                <button class="danger" id="timerResetBtn">Сброс</button>
            </div>
        `;
        content.appendChild(timerPanel);

        const stopwatchPanel = document.createElement('div');
        stopwatchPanel.className = 'time-panel';
        stopwatchPanel.id = 'panelStopwatch';
        stopwatchPanel.innerHTML = `
            <div class="timer-display" id="stopwatchDisplay">00:00.0</div>
            <div class="timer-controls">
                <button class="primary" id="stopwatchStartBtn">Старт</button>
                <button id="stopwatchPauseBtn">Пауза</button>
                <button class="danger" id="stopwatchResetBtn">Сброс</button>
            </div>
        `;
        content.appendChild(stopwatchPanel);

        const alarmPanel = document.createElement('div');
        alarmPanel.className = 'time-panel';
        alarmPanel.id = 'panelAlarm';
        alarmPanel.innerHTML = `
            <div class="alarm-section">
                <div class="alarm-row">
                    <span class="alarm-label">Будильник</span>
                    <button class="alarm-toggle" id="alarmToggle"></button>
                </div>
                <div class="alarm-row">
                    <span class="alarm-label">Время</span>
                    <span class="alarm-time" id="alarmTimeDisplay">--:--</span>
                </div>
                <div class="alarm-set">
                    <input type="number" id="alarmHour" min="0" max="23" placeholder="ЧЧ" />
                    <span>:</span>
                    <input type="number" id="alarmMinute" min="0" max="59" placeholder="ММ" />
                    <button id="alarmSetBtn">Установить</button>
                </div>
                <div class="alarm-status" id="alarmStatus">Будильник выключен</div>
            </div>
        `;
        content.appendChild(alarmPanel);

        app.appendChild(bg3d);
        app.appendChild(header);
        app.appendChild(content);
        document.body.appendChild(app);

        initThree(bg3d);

        const canvas = document.getElementById('clockCanvas');
        const ctx = canvas.getContext('2d');

        function drawClock() {
            const now = new Date();
            const hours = now.getHours() % 12;
            const minutes = now.getMinutes();
            const seconds = now.getSeconds();
            const w = canvas.width, h = canvas.height;
            const cx = w / 2, cy = h / 2;
            const radius = Math.min(w, h) / 2 - 20;

            const colors = getThemeColors();

            ctx.clearRect(0, 0, w, h);

            ctx.fillStyle = colors.bg;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = colors.text;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.stroke();

            for (let i = 0; i < 60; i++) {
                const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
                const isH = i % 5 === 0;
                const inner = isH ? radius - 20 : radius - 10;
                const outer = radius - 4;
                ctx.strokeStyle = isH ? colors.text : colors.muted;
                ctx.lineWidth = isH ? 2.5 : 1;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
                ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
                ctx.stroke();
            }

            ctx.fillStyle = colors.text;
            ctx.font = 'bold 18px ST-SimpleSquare, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let i = 1; i <= 12; i++) {
                const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
                ctx.fillText(i, cx + Math.cos(a) * (radius - 32), cy + Math.sin(a) * (radius - 32));
            }

            const ha = (hours + minutes / 60) / 12 * Math.PI * 2 - Math.PI / 2;
            ctx.strokeStyle = colors.text;
            ctx.lineWidth = 5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(ha) * (radius * 0.5), cy + Math.sin(ha) * (radius * 0.5));
            ctx.stroke();

            const ma = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
            ctx.strokeStyle = colors.text;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(ma) * (radius * 0.7), cy + Math.sin(ma) * (radius * 0.7));
            ctx.stroke();

            const sa = (seconds / 60) * Math.PI * 2 - Math.PI / 2;
            ctx.strokeStyle = colors.accent;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(sa) * (radius * 0.78), cy + Math.sin(sa) * (radius * 0.78));
            ctx.stroke();

            ctx.fillStyle = colors.accent;
            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = colors.bg;
            ctx.beginPath();
            ctx.arc(cx, cy, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        function updateTime() {
            const now = new Date();
            if (currentMode === 'analog') drawClock();
            const hoursEl = document.getElementById('digitalHours');
            if (hoursEl) hoursEl.textContent = String(now.getHours()).padStart(2, '0');
            const minEl = document.getElementById('digitalMinutes');
            if (minEl) minEl.textContent = String(now.getMinutes()).padStart(2, '0');
            const secEl = document.getElementById('digitalSeconds');
            if (secEl) secEl.textContent = String(now.getSeconds()).padStart(2, '0');
            const dateEl = document.getElementById('dateDisplay');
            if (dateEl) {
                const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
                const ds = now.toLocaleDateString('ru-RU', opts);
                dateEl.textContent = ds.charAt(0).toUpperCase() + ds.slice(1);
            }
        }

        updateTime();
        clockInterval = setInterval(updateTime, 1000);

        function switchMode(mode) {
            currentMode = mode;
            const wrap = document.querySelector('.clock-canvas-wrapper');
            if (wrap) wrap.style.display = mode === 'analog' ? 'block' : 'none';
            const dt = document.getElementById('digitalTime');
            if (dt) dt.style.display = mode === 'digital' ? 'block' : 'none';
            updateMenuActive();
        }

        function switchPanel(id) {
            currentPanel = id;
            document.querySelectorAll('.time-panel').forEach(p => p.classList.remove('active'));
            const p = document.getElementById('panel' + id.charAt(0).toUpperCase() + id.slice(1));
            if (p) p.classList.add('active');
            if (clockContainer) clockContainer.style.display = id === 'main' ? 'flex' : 'none';
            updateMenuActive();
        }

        let menuDropdown = null;
        let isMenuOpen = false;

        function buildMenu() {
            const items = [
                { id: 'main', label: 'Часы', section: 'Разделы' },
                { id: 'timer', label: 'Таймер', section: null },
                { id: 'stopwatch', label: 'Секундомер', section: null },
                { id: 'alarm', label: 'Будильник', section: null },
                { id: 'analog', label: 'Аналоговые', section: 'Отображение' },
                { id: 'digital', label: 'Цифровые', section: null }
            ];

            menuDropdown = document.createElement('div');
            menuDropdown.className = 'time-menu-dropdown';
            menuDropdown.id = 'timeMenuDropdown';

            const icons = {
                main: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
                timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="9" y1="2" x2="15" y2="2"/></svg>',
                stopwatch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="8"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="9" y1="2" x2="15" y2="2"/><line x1="19" y1="4" x2="21" y2="6"/></svg>',
                alarm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7"/><polyline points="12 9 12 13 15 15"/><path d="M5 3 L2 6"/><path d="M19 3 L22 6"/></svg>',
                analog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="12" x2="12" y2="7"/><line x1="12" y1="12" x2="16" y2="14"/></svg>',
                digital: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="16" y1="10" x2="16" y2="14"/></svg>'
            };

            items.forEach(item => {
                if (item.section) {
                    const t = document.createElement('div');
                    t.className = 'time-menu-section-title';
                    t.textContent = item.section;
                    menuDropdown.appendChild(t);
                }
                const btn = document.createElement('button');
                btn.className = 'time-menu-item';
                btn.dataset.id = item.id;
                btn.innerHTML = `
                    <span class="mi-icon">${icons[item.id] || ''}</span>
                    <span>${item.label}</span>
                `;
                btn.addEventListener('click', function() {
                    const id = this.dataset.id;
                    if (id === 'main' || id === 'timer' || id === 'stopwatch' || id === 'alarm') {
                        switchPanel(id);
                    } else if (id === 'analog' || id === 'digital') {
                        switchMode(id);
                    }
                    closeMenu();
                });
                menuDropdown.appendChild(btn);
            });

            app.appendChild(menuDropdown);
            updateMenuActive();
        }

        function updateMenuActive() {
            if (!menuDropdown) return;
            menuDropdown.querySelectorAll('.time-menu-item').forEach(btn => {
                const id = btn.dataset.id;
                let active = false;
                if (id === currentPanel) active = true;
                if ((id === 'analog' || id === 'digital') && id === currentMode && currentPanel === 'main') active = true;
                btn.classList.toggle('active', active);
            });
        }

        function openMenu() {
            if (isMenuOpen) { closeMenu(); return; }
            isMenuOpen = true;
            if (!menuDropdown) buildMenu();
            menuDropdown.classList.remove('closing');
            menuDropdown.style.display = 'block';
        }

        function closeMenu() {
            if (!isMenuOpen) return;
            isMenuOpen = false;
            if (!menuDropdown) return;
            const m = menuDropdown;
            m.classList.add('closing');
            setTimeout(() => {
                m.style.display = 'none';
                m.classList.remove('closing');
            }, 280);
        }

        document.getElementById('timeMenuBtn').addEventListener('click', function(e) {
            e.stopPropagation();
            openMenu();
        });

        document.addEventListener('click', function(e) {
            if (!isMenuOpen || !menuDropdown) return;
            if (!menuDropdown.contains(e.target) && !e.target.closest('#timeMenuBtn')) {
                closeMenu();
            }
        });

        document.getElementById('timeCloseBtn').addEventListener('click', closeTime);

        function updateTimerDisplay() {
            const m = Math.floor(timerSeconds / 60);
            const s = timerSeconds % 60;
            const el = document.getElementById('timerDisplay');
            if (el) el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        }

        function startTimer() {
            if (timerInterval) return;
            if (timerSeconds === 0) {
                const m = parseInt(document.getElementById('timerMinutes').value) || 0;
                const s = parseInt(document.getElementById('timerSeconds').value) || 0;
                timerSeconds = m * 60 + s;
                timerTotal = timerSeconds;
                if (timerSeconds <= 0) return;
                updateTimerDisplay();
            }
            timerRunning = true;
            timerInterval = setInterval(() => {
                timerSeconds--;
                if (isOpen) updateTimerDisplay();
                if (window.LiveBar) window.LiveBar.update({ remaining: timerSeconds });
                if (timerSeconds <= 0) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                    timerRunning = false;
                    timerSeconds = 0;
                    timerTotal = 0;
                    const startBtn = document.getElementById('timerStartBtn');
                    if (startBtn) startBtn.textContent = 'Старт';
                    const minInp = document.getElementById('timerMinutes');
                    if (minInp) minInp.value = 1;
                    const secInp = document.getElementById('timerSeconds');
                    if (secInp) secInp.value = 0;
                    if (isOpen) updateTimerDisplay();
                    playSfx('aria.mp3');
                    if (window.LiveBar) window.LiveBar.clear();
                }
            }, 1000);
            const startBtn = document.getElementById('timerStartBtn');
            if (startBtn) startBtn.textContent = 'Стоп';
            pushLiveBar();
        }

        function pauseTimer() {
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
                timerRunning = false;
                const startBtn = document.getElementById('timerStartBtn');
                if (startBtn) startBtn.textContent = 'Продолжить';
                if (window.LiveBar) window.LiveBar.clear();
            }
        }

        function resetTimer() {
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
            timerRunning = false;
            timerSeconds = 0;
            timerTotal = 0;
            if (isOpen) updateTimerDisplay();
            const startBtn = document.getElementById('timerStartBtn');
            if (startBtn) startBtn.textContent = 'Старт';
            if (window.LiveBar) window.LiveBar.clear();
        }

        function updateStopwatchDisplay() {
            const m = Math.floor(stopwatchSeconds / 60);
            const s = Math.floor(stopwatchSeconds % 60);
            const t = Math.floor((stopwatchSeconds % 1) * 10);
            const el = document.getElementById('stopwatchDisplay');
            if (el) el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + t;
        }

        function startStopwatch() {
            if (stopwatchInterval) return;
            stopwatchRunning = true;
            stopwatchInterval = setInterval(() => {
                stopwatchSeconds += 0.1;
                if (isOpen) updateStopwatchDisplay();
                if (window.LiveBar) window.LiveBar.update({ elapsed: stopwatchSeconds });
            }, 100);
            const btn = document.getElementById('stopwatchStartBtn');
            if (btn) btn.textContent = 'Стоп';
            pushLiveBar();
        }

        function pauseStopwatch() {
            if (stopwatchInterval) {
                clearInterval(stopwatchInterval);
                stopwatchInterval = null;
                stopwatchRunning = false;
                const btn = document.getElementById('stopwatchStartBtn');
                if (btn) btn.textContent = 'Продолжить';
                if (window.LiveBar) window.LiveBar.clear();
            }
        }

        function resetStopwatch() {
            if (stopwatchInterval) { clearInterval(stopwatchInterval); stopwatchInterval = null; }
            stopwatchRunning = false;
            stopwatchSeconds = 0;
            if (isOpen) updateStopwatchDisplay();
            const btn = document.getElementById('stopwatchStartBtn');
            if (btn) btn.textContent = 'Старт';
            if (window.LiveBar) window.LiveBar.clear();
        }

        function setAlarm() {
            const h = parseInt(document.getElementById('alarmHour').value);
            const m = parseInt(document.getElementById('alarmMinute').value);
            if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return;
            alarmTime = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
            if (isOpen) {
                const at = document.getElementById('alarmTimeDisplay');
                if (at) at.textContent = alarmTime;
                const st = document.getElementById('alarmStatus');
                if (st) st.textContent = 'Будильник установлен на ' + alarmTime;
                const tg = document.getElementById('alarmToggle');
                if (tg) tg.classList.add('active');
                const sb = document.getElementById('alarmSetBtn');
                if (sb) sb.textContent = 'Изменить';
            }
            alarmActive = true;
            pushLiveBar();
            if (alarmCheckInterval) clearInterval(alarmCheckInterval);
            alarmCheckInterval = setInterval(function() {
                if (!alarmActive || !alarmTime) return;
                const now = new Date();
                const cur = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
                if (cur === alarmTime && now.getSeconds() === 0) triggerAlarm();
            }, 1000);
        }

        function toggleAlarm() {
            alarmActive = !alarmActive;
            if (isOpen) {
                const tg = document.getElementById('alarmToggle');
                if (tg) tg.classList.toggle('active', alarmActive);
                const st = document.getElementById('alarmStatus');
                if (st) {
                    if (alarmActive && alarmTime) st.textContent = 'Будильник включён на ' + alarmTime;
                    else st.textContent = 'Будильник выключен';
                }
            }
            pushLiveBar();
        }

        function triggerAlarm() {
            if (alarmTimeout) return;
            if (isOpen) {
                const st = document.getElementById('alarmStatus');
                if (st) {
                    st.textContent = 'Будильник сработал';
                    st.style.color = 'var(--accent)';
                }
            }
            playSfx('aria.mp3');
            try {
                const ac = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ac.createOscillator();
                const g = ac.createGain();
                osc.connect(g);
                g.connect(ac.destination);
                osc.frequency.value = 800;
                osc.type = 'square';
                g.gain.value = 0.3;
                osc.start();
                setTimeout(() => osc.stop(), 3000);
            } catch(e) {}
            alarmTimeout = setTimeout(() => {
                alarmTimeout = null;
                alarmActive = false;
                alarmTime = null;
                if (isOpen) {
                    const st = document.getElementById('alarmStatus');
                    if (st) {
                        st.textContent = 'Будильник выключен';
                        st.style.color = 'var(--text-muted)';
                    }
                    const tg = document.getElementById('alarmToggle');
                    if (tg) tg.classList.remove('active');
                    const at = document.getElementById('alarmTimeDisplay');
                    if (at) at.textContent = '--:--';
                    const sb = document.getElementById('alarmSetBtn');
                    if (sb) sb.textContent = 'Установить';
                }
                if (alarmCheckInterval) { clearInterval(alarmCheckInterval); alarmCheckInterval = null; }
                if (window.LiveBar) window.LiveBar.clear();
            }, 5000);
        }

        document.getElementById('timerStartBtn').addEventListener('click', startTimer);
        document.getElementById('timerPauseBtn').addEventListener('click', pauseTimer);
        document.getElementById('timerResetBtn').addEventListener('click', resetTimer);
        document.getElementById('stopwatchStartBtn').addEventListener('click', startStopwatch);
        document.getElementById('stopwatchPauseBtn').addEventListener('click', pauseStopwatch);
        document.getElementById('stopwatchResetBtn').addEventListener('click', resetStopwatch);
        document.getElementById('alarmSetBtn').addEventListener('click', setAlarm);
        document.getElementById('alarmToggle').addEventListener('click', toggleAlarm);

        document.addEventListener('keydown', onKeyDown);
        switchMode('analog');
        switchPanel('main');

        window.addEventListener('shnuk:theme-changed', function() {
            if (currentMode === 'analog') drawClock();
            refreshThreeTheme();
        });
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') {
            const menu = document.getElementById('timeMenuDropdown');
            if (menu && menu.style.display === 'block') {
                menu.style.display = 'none';
                return;
            }
            closeTime();
        }
    }

    window.Time = { destroy: destroy };
    window.timeInit = function() { openTime(); };

})();