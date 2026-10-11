// time.js — Приложение часы

(function() {
    'use strict';

    // Защита от повторной загрузки модуля. Если time.js был подключён дважды,
    // первый экземпляр уничтожает свои интервалы и не создаёт новых.
    if (window.__timeModuleLoaded) {
        try {
            if (window.Time && typeof window.Time.destroy === 'function') {
                window.Time.destroy();
            }
        } catch(e) {}
        return;
    }
    window.__timeModuleLoaded = true;

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
    let currentPanel = 'main';
    let isTransitioning = false;

    // Идентификатор сессии. Меняется при открытии и при сбросах.
    let sessionId = 0;

    // Идентификаторы активностей в LiveBar. Сохраняются при set(),
    // передаются в update() для защиты от запоздавших вызовов.
    let timerActivityId = 0;
    let stopwatchActivityId = 0;
    let alarmActivityId = 0;

    const FONT_MAIN = "'TTPaplane', monospace";

    function playSfx(name) {
        try {
            if (window.L && typeof window.L.playSound === 'function') {
                window.L.playSound(name);
            } else if (typeof window.playSound === 'function') {
                window.playSound(name);
            }
        } catch(e) {}
    }

    // Полная остановка всех интервалов и сброс всех счётчиков.
    // Используется при повторном ОТКРЫТИИ часов, чтобы стереть всё старое.
    function haltEverything() {
        sessionId++;

        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (stopwatchInterval) { clearInterval(stopwatchInterval); stopwatchInterval = null; }
        if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
        if (alarmTimeout) { clearTimeout(alarmTimeout); alarmTimeout = null; }
        if (alarmCheckInterval) { clearInterval(alarmCheckInterval); alarmCheckInterval = null; }

        timerRunning = false;
        stopwatchRunning = false;
        timerSeconds = 0;
        timerTotal = 0;
        stopwatchSeconds = 0;
        alarmTime = null;
        alarmActive = false;

        timerActivityId = 0;
        stopwatchActivityId = 0;
        alarmActivityId = 0;

        try {
            if (window.LiveBar && typeof window.LiveBar.clear === 'function') {
                window.LiveBar.clear();
            }
        } catch(e) {}
    }

    function resetTimerState() {
        sessionId++;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        timerRunning = false;
        timerSeconds = 0;
        timerTotal = 0;
        timerActivityId = 0;

        if (isOpen) {
            const startBtn = document.getElementById('timerStartBtn');
            if (startBtn) startBtn.textContent = 'Старт';
            const minInp = document.getElementById('timerMinutes');
            if (minInp) minInp.value = 1;
            const secInp = document.getElementById('timerSeconds');
            if (secInp) secInp.value = 0;
            const disp = document.getElementById('timerDisplay');
            if (disp) disp.textContent = '00:00';
        }

        syncLiveBar();
    }

    function resetStopwatchState() {
        sessionId++;
        if (stopwatchInterval) { clearInterval(stopwatchInterval); stopwatchInterval = null; }
        stopwatchRunning = false;
        stopwatchSeconds = 0;
        stopwatchActivityId = 0;

        if (isOpen) {
            const btn = document.getElementById('stopwatchStartBtn');
            if (btn) btn.textContent = 'Старт';
            const disp = document.getElementById('stopwatchDisplay');
            if (disp) disp.textContent = '00:00.0';
        }

        syncLiveBar();
    }

    function syncLiveBar() {
        if (!window.LiveBar) return;
        try {
            if (stopwatchRunning && stopwatchActivityId) {
                window.LiveBar.set({
                    type: 'stopwatch', appId: 'time',
                    payload: { elapsed: stopwatchSeconds }
                });
                stopwatchActivityId = window.LiveBar.getActivityId ? window.LiveBar.getActivityId() : 0;
            } else if (timerRunning && timerActivityId) {
                window.LiveBar.set({
                    type: 'timer', appId: 'time',
                    payload: { remaining: timerSeconds, total: timerTotal }
                });
                timerActivityId = window.LiveBar.getActivityId ? window.LiveBar.getActivityId() : 0;
            } else if (alarmActive && alarmTime) {
                window.LiveBar.set({
                    type: 'alarm', appId: 'time',
                    payload: { time: alarmTime }
                });
                alarmActivityId = window.LiveBar.getActivityId ? window.LiveBar.getActivityId() : 0;
            } else {
                window.LiveBar.clear();
                timerActivityId = 0;
                stopwatchActivityId = 0;
                alarmActivityId = 0;
            }
        } catch(e) {}
    }

    function openTime() {
        if (window.LiveBar && typeof window.LiveBar.resume === 'function') {
            window.LiveBar.resume('time');
        }
        if (isOpen) {
            const ex = document.getElementById('timeApp');
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }

        haltEverything();

        currentPanel = 'main';
        isTransitioning = false;

        createUI();
    }

    // Закрытие окна. Интервалы НЕ убиваются — таймер, секундомер и будильник
    // продолжают работать в фоне, Live Bar остаётся активным.
    function closeTime() {
        isOpen = false;

        currentPanel = 'main';
        isTransitioning = false;

        if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }

        document.removeEventListener('keydown', onKeyDown);

        const el = document.getElementById('timeApp');
        if (!el) return;

        if (window.ShnukCloseAnimation) {
            window.ShnukCloseAnimation(el, 'time', function() {
                el.remove();
            });
        } else {
            el.style.opacity = '0';
            setTimeout(function() {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, 180);
        }
    }

    function destroy() {
        isOpen = false;
        currentPanel = 'main';
        isTransitioning = false;
        haltEverything();
        document.removeEventListener('keydown', onKeyDown);
        const el = document.getElementById('timeApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function createUI() {
        if (document.getElementById('timeApp')) {
            document.getElementById('timeApp').style.display = 'flex';
            return;
        }
        isOpen = true;

        const mySession = sessionId;

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
            font-family: ${FONT_MAIN};
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

                #timeApp, #timeApp * {
                    font-family: ${FONT_MAIN} !important;
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
                    font-family: ${FONT_MAIN};
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
                    font-family: ${FONT_MAIN};
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

                .time-stage {
                    position: relative;
                    width: 100%;
                    max-width: 500px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }

                .time-panel-view {
                    width: 100%;
                    display: none;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    transition: filter 0.32s cubic-bezier(0.22, 1, 0.36, 1),
                                opacity 0.32s cubic-bezier(0.22, 1, 0.36, 1),
                                transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
                    will-change: filter, opacity, transform;
                }
                .time-panel-view.active {
                    display: flex;
                }
                .time-panel-view.entering {
                    opacity: 0;
                    filter: blur(18px);
                    transform: scale(0.94);
                }
                .time-panel-view.entered {
                    opacity: 1;
                    filter: blur(0);
                    transform: scale(1);
                }
                .time-panel-view.leaving {
                    opacity: 0;
                    filter: blur(18px);
                    transform: scale(0.94);
                }

                .digital-time {
                    font-size: 96px;
                    font-weight: 700;
                    color: var(--text-primary);
                    letter-spacing: 8px;
                    text-align: center;
                    padding: 20px 0;
                    font-family: ${FONT_MAIN};
                    line-height: 1;
                }
                .digital-time .seconds {
                    font-size: 48px;
                    color: var(--text-muted);
                    letter-spacing: 4px;
                }
                .digital-time .blink {
                    animation: timePulse 1s step-end infinite;
                }
                .date-display {
                    font-size: 16px;
                    color: var(--text-muted);
                    letter-spacing: 2px;
                    margin-top: 16px;
                    text-align: center;
                    font-family: ${FONT_MAIN};
                }

                .timer-display {
                    font-size: 56px;
                    font-weight: 700;
                    text-align: center;
                    letter-spacing: 4px;
                    padding: 16px 0;
                    color: var(--text-primary);
                    font-family: ${FONT_MAIN};
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
                    font-family: ${FONT_MAIN};
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
                    font-family: ${FONT_MAIN};
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
                    width: 100%;
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
                    width: 52px;
                    height: 30px;
                    background: var(--border-color);
                    border: 2px solid var(--border-color);
                    cursor: pointer;
                    position: relative;
                    transition: background 0.3s, border-color 0.3s;
                    padding: 0;
                    border-radius: 0;
                }
                .alarm-toggle.active {
                    background: var(--accent);
                    border-color: var(--accent);
                }
                .alarm-toggle::after {
                    content: '';
                    position: absolute;
                    top: 2px; left: 2px;
                    width: 22px; height: 22px;
                    background: var(--bg-primary);
                    border-radius: 0;
                    transition: transform 0.3s;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
                }
                .alarm-toggle.active::after {
                    transform: translateX(22px);
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
                    font-family: ${FONT_MAIN};
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
                    font-family: ${FONT_MAIN};
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
                    .digital-time { font-size: 64px; letter-spacing: 6px; }
                    .digital-time .seconds { font-size: 32px; letter-spacing: 3px; }
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

        const content = document.createElement('div');
        content.className = 'time-content';

        const stage = document.createElement('div');
        stage.className = 'time-stage';

        const mainView = document.createElement('div');
        mainView.className = 'time-panel-view';
        mainView.id = 'viewMain';
        mainView.innerHTML = `
            <div class="digital-time" id="digitalTime">
                <span id="digitalHours">00</span><span class="blink">:</span><span id="digitalMinutes">00</span><span class="blink">:</span><span class="seconds" id="digitalSeconds">00</span>
            </div>
            <div class="date-display" id="dateDisplay"></div>
        `;
        stage.appendChild(mainView);

        const timerView = document.createElement('div');
        timerView.className = 'time-panel-view';
        timerView.id = 'viewTimer';
        timerView.innerHTML = `
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
        stage.appendChild(timerView);

        const stopwatchView = document.createElement('div');
        stopwatchView.className = 'time-panel-view';
        stopwatchView.id = 'viewStopwatch';
        stopwatchView.innerHTML = `
            <div class="timer-display" id="stopwatchDisplay">00:00.0</div>
            <div class="timer-controls">
                <button class="primary" id="stopwatchStartBtn">Старт</button>
                <button id="stopwatchPauseBtn">Пауза</button>
                <button class="danger" id="stopwatchResetBtn">Сброс</button>
            </div>
        `;
        stage.appendChild(stopwatchView);

        const alarmView = document.createElement('div');
        alarmView.className = 'time-panel-view';
        alarmView.id = 'viewAlarm';
        alarmView.innerHTML = `
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
        stage.appendChild(alarmView);

        content.appendChild(stage);
        app.appendChild(header);
        app.appendChild(content);
        document.body.appendChild(app);

        function updateTime() {
            if (!isOpen) return;
            if (sessionId !== mySession) return;
            const now = new Date();
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
        if (clockInterval) clearInterval(clockInterval);
        const localClockId = setInterval(function() {
            if (sessionId !== mySession) {
                clearInterval(localClockId);
                if (clockInterval === localClockId) clockInterval = null;
                return;
            }
            updateTime();
        }, 1000);
        clockInterval = localClockId;

        function getViewByPanel(id) {
            if (id === 'timer') return document.getElementById('viewTimer');
            if (id === 'stopwatch') return document.getElementById('viewStopwatch');
            if (id === 'alarm') return document.getElementById('viewAlarm');
            return document.getElementById('viewMain');
        }

        function switchPanel(id) {
            if (isTransitioning) return;
            if (id === currentPanel) {
                updateMenuActive();
                return;
            }

            const oldView = getViewByPanel(currentPanel);
            const newView = getViewByPanel(id);
            if (!newView) return;

            isTransitioning = true;
            currentPanel = id;
            updateMenuActive();

            if (!oldView || !oldView.classList.contains('active')) {
                newView.style.display = 'flex';
                newView.classList.add('active');
                newView.classList.add('entering');
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        newView.classList.remove('entering');
                        newView.classList.add('entered');
                        isTransitioning = false;
                    });
                });
                return;
            }

            oldView.classList.remove('entered');
            oldView.classList.add('leaving');

            setTimeout(function() {
                oldView.classList.remove('active');
                oldView.classList.remove('leaving');
                oldView.style.display = 'none';

                newView.style.display = 'flex';
                newView.classList.add('active');
                newView.classList.add('entering');

                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        newView.classList.remove('entering');
                        newView.classList.add('entered');
                        setTimeout(function() {
                            isTransitioning = false;
                        }, 340);
                    });
                });
            }, 300);
        }

        let menuDropdown = null;
        let isMenuOpen = false;

        function buildMenu() {
            const items = [
                { id: 'main', label: 'Часы', section: 'Разделы' },
                { id: 'timer', label: 'Таймер', section: null },
                { id: 'stopwatch', label: 'Секундомер', section: null },
                { id: 'alarm', label: 'Будильник', section: null }
            ];

            menuDropdown = document.createElement('div');
            menuDropdown.className = 'time-menu-dropdown';
            menuDropdown.id = 'timeMenuDropdown';

            const icons = {
                main: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
                timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="9" y1="2" x2="15" y2="2"/></svg>',
                stopwatch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="8"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="9" y1="2" x2="15" y2="2"/><line x1="19" y1="4" x2="21" y2="6"/></svg>',
                alarm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7"/><polyline points="12 9 12 13 15 15"/><path d="M5 3 L2 6"/><path d="M19 3 L22 6"/></svg>'
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
                    switchPanel(id);
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
                btn.classList.toggle('active', id === currentPanel);
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

        function updateStopwatchDisplay() {
            const m = Math.floor(stopwatchSeconds / 60);
            const s = Math.floor(stopwatchSeconds % 60);
            const t = Math.floor((stopwatchSeconds % 1) * 10);
            const el = document.getElementById('stopwatchDisplay');
            if (el) el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + t;
        }

        // ---------- ТАЙМЕР ----------

        function startTimer() {
            if (timerInterval) return;

            // Секундомер должен быть полностью сброшен.
            if (stopwatchRunning || stopwatchSeconds > 0 || stopwatchInterval) {
                sessionId++;
                if (stopwatchInterval) { clearInterval(stopwatchInterval); stopwatchInterval = null; }
                stopwatchRunning = false;
                stopwatchSeconds = 0;
                stopwatchActivityId = 0;
                if (isOpen) {
                    const btn = document.getElementById('stopwatchStartBtn');
                    if (btn) btn.textContent = 'Старт';
                    const disp = document.getElementById('stopwatchDisplay');
                    if (disp) disp.textContent = '00:00.0';
                }
            }

            if (timerSeconds === 0) {
                const m = parseInt(document.getElementById('timerMinutes').value) || 0;
                const s = parseInt(document.getElementById('timerSeconds').value) || 0;
                timerSeconds = m * 60 + s;
                timerTotal = timerSeconds;
                if (timerSeconds <= 0) return;
                updateTimerDisplay();
            }
            timerRunning = true;

            const localSession = ++sessionId;
            let localId = null;

            localId = setInterval(function() {
                // Самоуничтожение при смене сессии.
                if (sessionId !== localSession) {
                    clearInterval(localId);
                    if (timerInterval === localId) timerInterval = null;
                    return;
                }

                timerSeconds--;

                // Обновляем LiveBar, передавая id активности.
                // Старые интервалы с чужим id будут отброшены самим LiveBar.
                if (timerRunning && timerActivityId) {
                    if (window.LiveBar) {
                        window.LiveBar.update(
                            { remaining: timerSeconds },
                            { activityId: timerActivityId, expectedType: 'timer', expectedAppId: 'time' }
                        );
                    }
                }

                if (isOpen) {
                    updateTimerDisplay();
                }
                if (timerSeconds <= 0) {
                    clearInterval(localId);
                    if (timerInterval === localId) timerInterval = null;
                    timerRunning = false;
                    timerSeconds = 0;
                    timerTotal = 0;
                    timerActivityId = 0;
                    if (isOpen) {
                        const startBtn = document.getElementById('timerStartBtn');
                        if (startBtn) startBtn.textContent = 'Старт';
                        const minInp = document.getElementById('timerMinutes');
                        if (minInp) minInp.value = 1;
                        const secInp = document.getElementById('timerSeconds');
                        if (secInp) secInp.value = 0;
                        updateTimerDisplay();
                    }
                    playSfx('aria.mp3');
                    if (window.LiveBar) window.LiveBar.clear();
                }
            }, 1000);
            timerInterval = localId;

            const startBtn = document.getElementById('timerStartBtn');
            if (startBtn) startBtn.textContent = 'Стоп';

            if (window.LiveBar) {
                window.LiveBar.clear();
                window.LiveBar.set({
                    type: 'timer', appId: 'time',
                    payload: { remaining: timerSeconds, total: timerTotal }
                });
                timerActivityId = window.LiveBar.getActivityId ? window.LiveBar.getActivityId() : 0;
            }
        }

        function pauseTimer() {
            if (timerInterval) {
                sessionId++;
                clearInterval(timerInterval);
                timerInterval = null;
                timerRunning = false;
                timerActivityId = 0;
                const startBtn = document.getElementById('timerStartBtn');
                if (startBtn) startBtn.textContent = 'Продолжить';
                if (window.LiveBar) window.LiveBar.clear();
            }
        }

        function resetTimer() {
            sessionId++;
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
            timerRunning = false;
            timerSeconds = 0;
            timerTotal = 0;
            timerActivityId = 0;

            if (isOpen) {
                const startBtn = document.getElementById('timerStartBtn');
                if (startBtn) startBtn.textContent = 'Старт';
                const minInp = document.getElementById('timerMinutes');
                if (minInp) minInp.value = 1;
                const secInp = document.getElementById('timerSeconds');
                if (secInp) secInp.value = 0;
                const disp = document.getElementById('timerDisplay');
                if (disp) disp.textContent = '00:00';
            }

            if (window.LiveBar) window.LiveBar.clear();
        }

        // ---------- СЕКУНДОМЕР ----------

        function startStopwatch() {
            if (stopwatchInterval) return;

            // Таймер должен быть полностью сброшен.
            if (timerRunning || timerSeconds > 0 || timerTotal > 0 || timerInterval) {
                sessionId++;
                if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
                timerRunning = false;
                timerSeconds = 0;
                timerTotal = 0;
                timerActivityId = 0;
                if (isOpen) {
                    const startBtn = document.getElementById('timerStartBtn');
                    if (startBtn) startBtn.textContent = 'Старт';
                    const minInp = document.getElementById('timerMinutes');
                    if (minInp) minInp.value = 1;
                    const secInp = document.getElementById('timerSeconds');
                    if (secInp) secInp.value = 0;
                    const disp = document.getElementById('timerDisplay');
                    if (disp) disp.textContent = '00:00';
                }
            }

            stopwatchRunning = true;

            const localSession = ++sessionId;
            let localId = null;

            localId = setInterval(function() {
                if (sessionId !== localSession) {
                    clearInterval(localId);
                    if (stopwatchInterval === localId) stopwatchInterval = null;
                    return;
                }

                stopwatchSeconds += 0.1;

                if (stopwatchRunning && stopwatchActivityId) {
                    if (window.LiveBar) {
                        window.LiveBar.update(
                            { elapsed: stopwatchSeconds },
                            { activityId: stopwatchActivityId, expectedType: 'stopwatch', expectedAppId: 'time' }
                        );
                    }
                }

                if (isOpen) {
                    updateStopwatchDisplay();
                }
            }, 100);
            stopwatchInterval = localId;

            const btn = document.getElementById('stopwatchStartBtn');
            if (btn) btn.textContent = 'Стоп';

            if (window.LiveBar) {
                window.LiveBar.clear();
                window.LiveBar.set({
                    type: 'stopwatch', appId: 'time',
                    payload: { elapsed: stopwatchSeconds }
                });
                stopwatchActivityId = window.LiveBar.getActivityId ? window.LiveBar.getActivityId() : 0;
            }
        }

        function pauseStopwatch() {
            if (stopwatchInterval) {
                sessionId++;
                clearInterval(stopwatchInterval);
                stopwatchInterval = null;
                stopwatchRunning = false;
                stopwatchActivityId = 0;
                const btn = document.getElementById('stopwatchStartBtn');
                if (btn) btn.textContent = 'Продолжить';
                if (window.LiveBar) window.LiveBar.clear();
            }
        }

        function resetStopwatch() {
            sessionId++;
            if (stopwatchInterval) { clearInterval(stopwatchInterval); stopwatchInterval = null; }
            stopwatchRunning = false;
            stopwatchSeconds = 0;
            stopwatchActivityId = 0;

            if (isOpen) {
                const btn = document.getElementById('stopwatchStartBtn');
                if (btn) btn.textContent = 'Старт';
                const disp = document.getElementById('stopwatchDisplay');
                if (disp) disp.textContent = '00:00.0';
            }

            if (window.LiveBar) window.LiveBar.clear();
        }

        // ---------- БУДИЛЬНИК ----------

        function syncAlarmUI() {
            const tg = document.getElementById('alarmToggle');
            if (tg) tg.classList.toggle('active', alarmActive);
            const at = document.getElementById('alarmTimeDisplay');
            if (at) at.textContent = alarmTime || '--:--';
            const st = document.getElementById('alarmStatus');
            if (st) {
                if (alarmActive && alarmTime) st.textContent = 'Будильник включён на ' + alarmTime;
                else st.textContent = 'Будильник выключен';
            }
            const sb = document.getElementById('alarmSetBtn');
            if (sb) sb.textContent = alarmTime ? 'Изменить' : 'Установить';
        }

        function setAlarm() {
            const h = parseInt(document.getElementById('alarmHour').value);
            const m = parseInt(document.getElementById('alarmMinute').value);
            if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return;
            alarmTime = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
            alarmActive = true;

            const at = document.getElementById('alarmTimeDisplay');
            if (at) at.textContent = alarmTime;
            const st = document.getElementById('alarmStatus');
            if (st) st.textContent = 'Будильник установлен на ' + alarmTime;
            const tg = document.getElementById('alarmToggle');
            if (tg) tg.classList.add('active');
            const sb = document.getElementById('alarmSetBtn');
            if (sb) sb.textContent = 'Изменить';

            if (window.LiveBar) {
                window.LiveBar.clear();
                window.LiveBar.set({
                    type: 'alarm', appId: 'time',
                    payload: { time: alarmTime }
                });
                alarmActivityId = window.LiveBar.getActivityId ? window.LiveBar.getActivityId() : 0;
            }

            const localSession = ++sessionId;
            if (alarmCheckInterval) clearInterval(alarmCheckInterval);
            let localId = null;
            localId = setInterval(function() {
                if (sessionId !== localSession) {
                    clearInterval(localId);
                    if (alarmCheckInterval === localId) alarmCheckInterval = null;
                    return;
                }
                if (!alarmActive || !alarmTime) return;
                const now = new Date();
                const cur = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
                if (cur === alarmTime && now.getSeconds() === 0) triggerAlarm();
            }, 1000);
            alarmCheckInterval = localId;
        }

        function toggleAlarm() {
            alarmActive = !alarmActive;
            const tg = document.getElementById('alarmToggle');
            if (tg) tg.classList.toggle('active', alarmActive);
            const st = document.getElementById('alarmStatus');
            if (st) {
                if (alarmActive && alarmTime) st.textContent = 'Будильник включён на ' + alarmTime;
                else st.textContent = 'Будильник выключен';
            }
            if (window.LiveBar) {
                if (alarmActive && alarmTime) {
                    window.LiveBar.clear();
                    window.LiveBar.set({
                        type: 'alarm', appId: 'time',
                        payload: { time: alarmTime }
                    });
                    alarmActivityId = window.LiveBar.getActivityId ? window.LiveBar.getActivityId() : 0;
                } else {
                    window.LiveBar.clear();
                    alarmActivityId = 0;
                }
            }
        }

        function triggerAlarm() {
            if (alarmTimeout) return;
            const st = document.getElementById('alarmStatus');
            if (st) {
                st.textContent = 'Будильник сработал';
                st.style.color = 'var(--accent)';
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
                alarmActivityId = 0;
                if (isOpen) {
                    const st2 = document.getElementById('alarmStatus');
                    if (st2) {
                        st2.textContent = 'Будильник выключен';
                        st2.style.color = 'var(--text-muted)';
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

        const mainEl = document.getElementById('viewMain');
        mainEl.classList.add('active', 'entered');
        mainEl.style.display = 'flex';

        updateTimerDisplay();
        updateStopwatchDisplay();
        syncAlarmUI();
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