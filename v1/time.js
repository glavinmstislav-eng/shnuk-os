// time.js

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
        if (isOpen) {
            const ex = document.getElementById('timeApp');
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }
        createUI();
    }

    function closeTime() {
        isOpen = false;
        const el = document.getElementById('timeApp');
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1'; }, 300);
        }
        document.removeEventListener('keydown', onKeyDown);
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
            background: #ffffff;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            font-family: 'ST-SimpleSquare', monospace;
            color: #1a1a1a;
            opacity: 0;
            animation: timeFadeIn 0.3s ease forwards;
        `;

        if (!document.getElementById('timeStyles')) {
            const style = document.createElement('style');
            style.id = 'timeStyles';
            style.textContent = `
                @keyframes timeFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes timePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
                .time-header { display:flex; justify-content:space-between; align-items:center; padding:16px 24px; background:#f5f5f5; border-bottom:2px solid #e0e0e0; flex-shrink:0; }
                .time-header h1 { font-size:20px; font-weight:600; margin:0; color:#1a1a1a; }
                .time-header-actions { display:flex; gap:8px; align-items:center; }
                .time-header-actions button { background:none; border:2px solid #e0e0e0; color:#333; padding:8px 16px; cursor:pointer; font-family:'ST-SimpleSquare',monospace; font-size:13px; transition:all 0.2s; }
                .time-header-actions button:hover { background:#e0e0e0; border-color:#cc0000; }
                .time-header-actions button.active { background:#cc0000; color:#fff; border-color:#cc0000; }
                .time-header-actions .close-btn { border-color:#cc0000; color:#cc0000; font-size:18px; padding:4px 12px; }
                .time-header-actions .close-btn:hover { background:#cc0000; color:#fff; }
                .time-content { flex:1; overflow-y:auto; padding:30px 24px; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fff; }
                .clock-container { display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; max-width:500px; }
                .clock-canvas-wrapper { position:relative; width:280px; height:280px; margin:0 auto; }
                .clock-canvas-wrapper canvas { width:100%; height:100%; display:block; }
                .digital-time { font-size:72px; font-weight:700; color:#1a1a1a; letter-spacing:6px; text-align:center; padding:20px 0; display:none; }
                .digital-time .seconds { font-size:36px; color:#888; letter-spacing:2px; }
                .digital-time .blink { animation: timePulse 1s step-end infinite; }
                .date-display { font-size:18px; color:#666; letter-spacing:2px; margin-top:12px; text-align:center; }
                .time-tabs { display:flex; gap:4px; margin-top:24px; border-bottom:2px solid #e0e0e0; width:100%; max-width:400px; }
                .time-tabs button { flex:1; padding:12px 16px; background:none; border:none; border-bottom:3px solid transparent; cursor:pointer; font-family:'ST-SimpleSquare',monospace; font-size:14px; color:#888; transition:all 0.2s; }
                .time-tabs button:hover { color:#1a1a1a; }
                .time-tabs button.active { color:#cc0000; border-bottom-color:#cc0000; }
                .time-panel { width:100%; max-width:400px; padding:20px 0; display:none; }
                .time-panel.active { display:block; }
                .timer-display { font-size:48px; font-weight:700; text-align:center; letter-spacing:4px; padding:16px 0; color:#1a1a1a; }
                .timer-controls { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin-top:12px; }
                .timer-controls button { padding:10px 24px; border:2px solid #e0e0e0; background:none; cursor:pointer; font-family:'ST-SimpleSquare',monospace; font-size:14px; transition:all 0.2s; min-width:80px; }
                .timer-controls button:hover { background:#f0f0f0; border-color:#cc0000; }
                .timer-controls button.primary { background:#cc0000; color:#fff; border-color:#cc0000; }
                .timer-controls button.primary:hover { background:#990000; }
                .timer-controls button.danger { border-color:#cc0000; color:#cc0000; }
                .timer-controls button.danger:hover { background:#cc0000; color:#fff; }
                .timer-input { display:flex; gap:8px; justify-content:center; align-items:center; margin-top:8px; }
                .timer-input input { width:60px; padding:8px; border:2px solid #e0e0e0; font-size:20px; text-align:center; font-family:'ST-SimpleSquare',monospace; outline:none; }
                .timer-input input:focus { border-color:#cc0000; }
                .timer-input span { font-size:20px; color:#888; }
                .alarm-section { padding:8px 0; }
                .alarm-section .alarm-row { display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #f0f0f0; }
                .alarm-section .alarm-row:last-child { border-bottom:none; }
                .alarm-section .alarm-time { font-size:24px; font-weight:600; }
                .alarm-section .alarm-toggle { width:48px; height:28px; background:#e0e0e0; border:none; border-radius:14px; cursor:pointer; position:relative; transition:background 0.3s; }
                .alarm-section .alarm-toggle.active { background:#cc0000; }
                .alarm-section .alarm-toggle::after { content:''; position:absolute; top:2px; left:2px; width:24px; height:24px; background:#fff; border-radius:50%; transition:transform 0.3s; }
                .alarm-section .alarm-toggle.active::after { transform:translateX(20px); }
                .alarm-section .alarm-set { display:flex; gap:8px; align-items:center; margin-top:12px; }
                .alarm-section .alarm-set input { width:50px; padding:8px; border:2px solid #e0e0e0; font-size:18px; text-align:center; font-family:'ST-SimpleSquare',monospace; outline:none; }
                .alarm-section .alarm-set input:focus { border-color:#cc0000; }
                .alarm-section .alarm-set button { padding:8px 20px; border:2px solid #cc0000; background:#cc0000; color:#fff; cursor:pointer; font-family:'ST-SimpleSquare',monospace; font-size:14px; }
                .alarm-section .alarm-set button:hover { background:#990000; }
                @media (max-width:500px) {
                    .time-header { padding:12px 16px; flex-wrap:wrap; gap:8px; }
                    .time-header h1 { font-size:16px; }
                    .time-header-actions button { font-size:11px; padding:4px 10px; }
                    .time-content { padding:20px 16px; }
                    .clock-canvas-wrapper { width:200px; height:200px; }
                    .digital-time { font-size:48px; }
                    .digital-time .seconds { font-size:24px; }
                    .timer-display { font-size:36px; }
                    .date-display { font-size:14px; }
                }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'time-header';
        header.innerHTML = `
            <h1>Часы</h1>
            <div class="time-header-actions">
                <button class="active" data-mode="analog">Аналоговые</button>
                <button data-mode="digital">Цифровые</button>
                <button class="close-btn" id="timeCloseBtn">✕</button>
            </div>
        `;

        const content = document.createElement('div');
        content.className = 'time-content';

        const clockContainer = document.createElement('div');
        clockContainer.className = 'clock-container';
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

        const tabs = document.createElement('div');
        tabs.className = 'time-tabs';
        tabs.innerHTML = `
            <button class="active" data-panel="main">Часы</button>
            <button data-panel="timer">Таймер</button>
            <button data-panel="stopwatch">Секундомер</button>
            <button data-panel="alarm">Будильник</button>
        `;
        content.appendChild(tabs);

        const mainPanel = document.createElement('div');
        mainPanel.className = 'time-panel active';
        mainPanel.id = 'panelMain';

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

        const alarmPanel = document.createElement('div');
        alarmPanel.className = 'time-panel';
        alarmPanel.id = 'panelAlarm';
        alarmPanel.innerHTML = `
            <div class="alarm-section">
                <div class="alarm-row">
                    <span style="font-size:14px;color:#888;">Будильник</span>
                    <button class="alarm-toggle" id="alarmToggle"></button>
                </div>
                <div class="alarm-row">
                    <span style="font-size:14px;color:#888;">Время</span>
                    <span class="alarm-time" id="alarmTimeDisplay">--:--</span>
                </div>
                <div class="alarm-set">
                    <input type="number" id="alarmHour" min="0" max="23" placeholder="Час" />
                    <span>:</span>
                    <input type="number" id="alarmMinute" min="0" max="59" placeholder="Мин" />
                    <button id="alarmSetBtn">Установить</button>
                </div>
                <div style="margin-top:12px;font-size:13px;color:#888;text-align:center;" id="alarmStatus">Будильник выключен</div>
            </div>
        `;

        content.appendChild(mainPanel);
        content.appendChild(timerPanel);
        content.appendChild(stopwatchPanel);
        content.appendChild(alarmPanel);

        app.appendChild(header);
        app.appendChild(content);
        document.body.appendChild(app);

        const canvas = document.getElementById('clockCanvas');
        const ctx = canvas.getContext('2d');

        function drawClock() {
            const now = new Date();
            const hours = now.getHours() % 12;
            const minutes = now.getMinutes();
            const seconds = now.getSeconds();
            const w = canvas.width, h = canvas.height;
            const cx = w/2, cy = h/2;
            const radius = Math.min(w, h)/2 - 20;

            ctx.clearRect(0, 0, w, h);
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
            grad.addColorStop(0, '#f8f8f8');
            grad.addColorStop(1, '#e8e8e8');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI*2); ctx.stroke();

            for (let i = 0; i < 60; i++) {
                const a = (i/60)*Math.PI*2 - Math.PI/2;
                const isH = i % 5 === 0;
                const inner = isH ? radius-20 : radius-10;
                const outer = radius-4;
                ctx.strokeStyle = isH ? '#1a1a1a' : '#aaa';
                ctx.lineWidth = isH ? 3 : 1.5;
                ctx.beginPath();
                ctx.moveTo(cx+Math.cos(a)*inner, cy+Math.sin(a)*inner);
                ctx.lineTo(cx+Math.cos(a)*outer, cy+Math.sin(a)*outer);
                ctx.stroke();
            }

            ctx.fillStyle = '#1a1a1a';
            ctx.font = 'bold 18px ST-SimpleSquare, monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            for (let i = 1; i <= 12; i++) {
                const a = (i/12)*Math.PI*2 - Math.PI/2;
                ctx.fillText(i, cx+Math.cos(a)*(radius-32), cy+Math.sin(a)*(radius-32));
            }

            const ha = (hours + minutes/60)/12*Math.PI*2 - Math.PI/2;
            ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 8;
            ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(cx, cy);
            ctx.lineTo(cx+Math.cos(ha)*(radius*0.5), cy+Math.sin(ha)*(radius*0.5));
            ctx.stroke();

            const ma = (minutes/60)*Math.PI*2 - Math.PI/2;
            ctx.strokeStyle = '#333'; ctx.lineWidth = 3.5;
            ctx.beginPath(); ctx.moveTo(cx, cy);
            ctx.lineTo(cx+Math.cos(ma)*(radius*0.7), cy+Math.sin(ma)*(radius*0.7));
            ctx.stroke();

            const sa = (seconds/60)*Math.PI*2 - Math.PI/2;
            ctx.shadowColor = 'rgba(204,0,0,0.3)'; ctx.shadowBlur = 10;
            ctx.strokeStyle = '#cc0000'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(cx, cy);
            ctx.lineTo(cx+Math.cos(sa)*(radius*0.75), cy+Math.sin(sa)*(radius*0.75));
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.fillStyle = '#cc0000';
            ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill();
        }

        function updateTime() {
            const now = new Date();
            drawClock();
            document.getElementById('digitalHours').textContent = String(now.getHours()).padStart(2,'0');
            document.getElementById('digitalMinutes').textContent = String(now.getMinutes()).padStart(2,'0');
            document.getElementById('digitalSeconds').textContent = String(now.getSeconds()).padStart(2,'0');
            const opts = { weekday:'long', day:'numeric', month:'long', year:'numeric' };
            const ds = now.toLocaleDateString('ru-RU', opts);
            document.getElementById('dateDisplay').textContent = ds.charAt(0).toUpperCase() + ds.slice(1);
        }
        updateTime();
        clockInterval = setInterval(updateTime, 1000);

        function switchMode(mode) {
            currentMode = mode;
            document.querySelectorAll('.time-header-actions [data-mode]').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === mode);
            });
            document.querySelector('.clock-canvas-wrapper').style.display = mode === 'analog' ? 'block' : 'none';
            document.getElementById('digitalTime').style.display = mode === 'digital' ? 'block' : 'none';
        }

        function switchPanel(id) {
            currentPanel = id;
            document.querySelectorAll('.time-tabs button').forEach(b => {
                b.classList.toggle('active', b.dataset.panel === id);
            });
            document.querySelectorAll('.time-panel').forEach(p => p.classList.remove('active'));
            const p = document.getElementById('panel' + id.charAt(0).toUpperCase() + id.slice(1));
            if (p) p.classList.add('active');
            clockContainer.style.display = id === 'main' ? 'block' : 'none';
        }

        function updateTimerDisplay() {
            const m = Math.floor(timerSeconds/60);
            const s = timerSeconds % 60;
            document.getElementById('timerDisplay').textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
        }

        function startTimer() {
            if (timerInterval) return;
            if (timerSeconds === 0) {
                const m = parseInt(document.getElementById('timerMinutes').value) || 0;
                const s = parseInt(document.getElementById('timerSeconds').value) || 0;
                timerSeconds = m*60 + s;
                timerTotal = timerSeconds;
                if (timerSeconds <= 0) return;
                updateTimerDisplay();
            }
            timerRunning = true;
            timerInterval = setInterval(() => {
                timerSeconds--;
                updateTimerDisplay();
                if (window.LiveBar) window.LiveBar.update({ remaining: timerSeconds });
                if (timerSeconds <= 0) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                    timerRunning = false;
                    timerSeconds = 0;
                    timerTotal = 0;
                    document.getElementById('timerStartBtn').textContent = 'Старт';
                    document.getElementById('timerMinutes').value = 1;
                    document.getElementById('timerSeconds').value = 0;
                    updateTimerDisplay();
                    if (window.LiveBar) window.LiveBar.clear();
                }
            }, 1000);
            document.getElementById('timerStartBtn').textContent = 'Стоп';
            pushLiveBar();
        }

        function pauseTimer() {
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
                timerRunning = false;
                document.getElementById('timerStartBtn').textContent = 'Продолжить';
                if (window.LiveBar) window.LiveBar.clear();
            }
        }

        function resetTimer() {
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
            timerRunning = false;
            timerSeconds = 0;
            timerTotal = 0;
            updateTimerDisplay();
            document.getElementById('timerStartBtn').textContent = 'Старт';
            if (window.LiveBar) window.LiveBar.clear();
        }

        function updateStopwatchDisplay() {
            const m = Math.floor(stopwatchSeconds/60);
            const s = Math.floor(stopwatchSeconds % 60);
            const t = Math.floor((stopwatchSeconds % 1)*10);
            document.getElementById('stopwatchDisplay').textContent =
                String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0') + '.' + t;
        }

        function startStopwatch() {
            if (stopwatchInterval) return;
            stopwatchRunning = true;
            stopwatchInterval = setInterval(() => {
                stopwatchSeconds += 0.1;
                updateStopwatchDisplay();
                if (window.LiveBar) window.LiveBar.update({ elapsed: stopwatchSeconds });
            }, 100);
            document.getElementById('stopwatchStartBtn').textContent = 'Стоп';
            pushLiveBar();
        }

        function pauseStopwatch() {
            if (stopwatchInterval) {
                clearInterval(stopwatchInterval);
                stopwatchInterval = null;
                stopwatchRunning = false;
                document.getElementById('stopwatchStartBtn').textContent = 'Продолжить';
                if (window.LiveBar) window.LiveBar.clear();
            }
        }

        function resetStopwatch() {
            if (stopwatchInterval) { clearInterval(stopwatchInterval); stopwatchInterval = null; }
            stopwatchRunning = false;
            stopwatchSeconds = 0;
            updateStopwatchDisplay();
            document.getElementById('stopwatchStartBtn').textContent = 'Старт';
            if (window.LiveBar) window.LiveBar.clear();
        }

        function setAlarm() {
            const h = parseInt(document.getElementById('alarmHour').value);
            const m = parseInt(document.getElementById('alarmMinute').value);
            if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return;
            alarmTime = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
            document.getElementById('alarmTimeDisplay').textContent = alarmTime;
            document.getElementById('alarmStatus').textContent = 'Будильник установлен на ' + alarmTime;
            alarmActive = true;
            document.getElementById('alarmToggle').classList.add('active');
            document.getElementById('alarmSetBtn').textContent = 'Изменить';
            pushLiveBar();
            if (alarmCheckInterval) clearInterval(alarmCheckInterval);
            alarmCheckInterval = setInterval(function() {
                if (!alarmActive || !alarmTime) return;
                const now = new Date();
                const cur = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
                if (cur === alarmTime && now.getSeconds() === 0) triggerAlarm();
            }, 1000);
        }

        function toggleAlarm() {
            alarmActive = !alarmActive;
            document.getElementById('alarmToggle').classList.toggle('active', alarmActive);
            if (alarmActive && alarmTime) {
                document.getElementById('alarmStatus').textContent = 'Будильник включён на ' + alarmTime;
            } else {
                document.getElementById('alarmStatus').textContent = 'Будильник выключен';
            }
            pushLiveBar();
        }

        function triggerAlarm() {
            if (alarmTimeout) return;
            document.getElementById('alarmStatus').textContent = 'Будильник сработал';
            document.getElementById('alarmStatus').style.color = '#cc0000';
            try {
                const ac = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ac.createOscillator();
                const g = ac.createGain();
                osc.connect(g); g.connect(ac.destination);
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
                document.getElementById('alarmStatus').textContent = 'Будильник выключен';
                document.getElementById('alarmStatus').style.color = '#888';
                document.getElementById('alarmToggle').classList.remove('active');
                document.getElementById('alarmTimeDisplay').textContent = '--:--';
                document.getElementById('alarmSetBtn').textContent = 'Установить';
                if (alarmCheckInterval) { clearInterval(alarmCheckInterval); alarmCheckInterval = null; }
                if (window.LiveBar) window.LiveBar.clear();
            }, 5000);
        }

        document.getElementById('timeCloseBtn').addEventListener('click', closeTime);
        document.querySelectorAll('.time-header-actions [data-mode]').forEach(b => {
            b.addEventListener('click', function() { switchMode(this.dataset.mode); });
        });
        document.querySelectorAll('.time-tabs button').forEach(b => {
            b.addEventListener('click', function() { switchPanel(this.dataset.panel); });
        });
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
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') closeTime();
    }

    window.timeInit = function() { openTime(); };

})();