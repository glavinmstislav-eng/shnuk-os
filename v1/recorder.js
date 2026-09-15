// recorder.js

(function() {
    'use strict';

    let isOpen = false;
    let mediaRecorder = null;
    let stream = null;
    let chunks = [];
    let recordingStartTime = 0;
    let recordingElapsed = 0;
    let timerInterval = null;
    let isRecording = false;
    let isPaused = false;

    function openRecorder() {
        if (isOpen) {
            const ex = document.getElementById('recorderApp');
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }
        createUI();
    }

    function closeRecorder() {
        isOpen = false;
        stopRecording(true);
        stopStream();
        const el = document.getElementById('recorderApp');
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1'; }, 300);
        }
        document.removeEventListener('keydown', onKeyDown);
    }

    function destroy() {
        isOpen = false;
        stopRecording(true);
        stopStream();
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        document.removeEventListener('keydown', onKeyDown);
        const el = document.getElementById('recorderApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function stopStream() {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
    }

    function formatTime(ms) {
        const total = Math.floor(ms / 1000);
        const m = Math.floor(total / 60);
        const s = total % 60;
        const t = Math.floor((ms % 1000) / 100);
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + t;
    }

    function updateTimer() {
        const el = document.getElementById('recorderTimer');
        if (el && isRecording && !isPaused) {
            recordingElapsed = Date.now() - recordingStartTime;
            el.textContent = formatTime(recordingElapsed);
            if (window.LiveBar) {
                window.LiveBar.update({ elapsed: recordingElapsed / 1000, paused: false });
            }
        }
    }

    async function startRecording() {
        if (isRecording) return;
        try {
            if (!stream) {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }

            let mimeType = 'audio/webm';
            if (typeof MediaRecorder !== 'undefined') {
                if (!MediaRecorder.isTypeSupported('audio/webm')) {
                    if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
                    else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
                }
            }

            try {
                mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
            } catch(e) {
                mediaRecorder = new MediaRecorder(stream);
                mimeType = mediaRecorder.mimeType || 'audio/webm';
            }

            chunks = [];
            mediaRecorder.ondataavailable = function(e) {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };
            mediaRecorder.onstop = function() {
                saveRecording(mimeType);
            };
            mediaRecorder.start();
            isRecording = true;
            isPaused = false;
            recordingStartTime = Date.now();
            recordingElapsed = 0;
            timerInterval = setInterval(updateTimer, 100);
            updateUI();

            if (window.LiveBar) {
                window.LiveBar.set({
                    type: 'recording',
                    appId: 'recorder',
                    payload: { elapsed: 0, paused: false }
                });
            }
        } catch(e) {
            if (window.Win && window.Win.notify) window.Win.notify('Нет доступа к микрофону', { type: 'error' });
        }
    }

    function pauseRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.pause();
            isPaused = true;
            recordingElapsed = Date.now() - recordingStartTime;
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
            updateUI();
            if (window.LiveBar) {
                window.LiveBar.update({ elapsed: recordingElapsed / 1000, paused: true });
            }
        } else if (mediaRecorder && mediaRecorder.state === 'paused') {
            mediaRecorder.resume();
            isPaused = false;
            recordingStartTime = Date.now() - recordingElapsed;
            timerInterval = setInterval(updateTimer, 100);
            updateUI();
            if (window.LiveBar) {
                window.LiveBar.update({ elapsed: recordingElapsed / 1000, paused: false });
            }
        }
    }

    function stopRecording(silent) {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        isRecording = false;
        isPaused = false;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (!silent) updateUI();
        if (window.LiveBar) window.LiveBar.clear();
    }

    function saveRecording(mimeType) {
        if (chunks.length === 0) {
            if (window.Win && window.Win.notify) window.Win.notify('Нет данных для сохранения', { type: 'error' });
            return;
        }

        const type = mimeType || 'audio/webm';
        const ext = type.indexOf('mp4') !== -1 ? 'm4a' : (type.indexOf('ogg') !== -1 ? 'ogg' : 'webm');
        const blob = new Blob(chunks, { type: type });
        const reader = new FileReader();

        reader.onload = function() {
            if (!window.SharedFiles) {
                if (window.Win && window.Win.notify) window.Win.notify('Хранилище недоступно', { type: 'error' });
                return;
            }
            const ok = window.SharedFiles.add({
                id: 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
                name: 'recording_' + Date.now() + '.' + ext,
                size: blob.size,
                type: type,
                data: reader.result,
                date: new Date().toISOString(),
                extension: ext
            });
            if (ok) {
                if (window.Win && window.Win.notify) window.Win.notify('Запись сохранена в Файлы', { type: 'success' });
            } else {
                if (window.Win && window.Win.notify) window.Win.notify('Не удалось сохранить (переполнено?)', { type: 'error' });
            }
        };
        reader.onerror = function() {
            if (window.Win && window.Win.notify) window.Win.notify('Ошибка чтения записи', { type: 'error' });
        };
        reader.readAsDataURL(blob);
        chunks = [];
    }

    function updateUI() {
        const btn = document.getElementById('recorderMainBtn');
        const status = document.getElementById('recorderStatus');
        const timer = document.getElementById('recorderTimer');
        const pauseBtn = document.getElementById('recorderPauseBtn');
        const dot = document.getElementById('recorderDot');

        if (!btn) return;

        if (isRecording) {
            btn.textContent = 'СТОП';
            btn.style.background = '#cc0000';
            if (status) status.textContent = isPaused ? 'Пауза' : 'Идёт запись';
            if (pauseBtn) {
                pauseBtn.style.display = 'inline-block';
                pauseBtn.textContent = isPaused ? 'Продолжить' : 'Пауза';
            }
            if (dot) {
                if (isPaused) dot.classList.remove('active');
                else dot.classList.add('active');
            }
        } else {
            btn.textContent = 'НАЧАТЬ';
            btn.style.background = '#4CAF50';
            if (status) status.textContent = 'Готово к записи';
            if (timer) timer.textContent = '00:00.0';
            if (pauseBtn) pauseBtn.style.display = 'none';
            if (dot) dot.classList.remove('active');
        }
    }

    function createUI() {
        if (document.getElementById('recorderApp')) {
            document.getElementById('recorderApp').style.display = 'flex';
            return;
        }
        isOpen = true;

        const app = document.createElement('div');
        app.id = 'recorderApp';
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
            animation: recorderFadeIn 0.3s ease forwards;
        `;

        if (!document.getElementById('recorderStyles')) {
            const style = document.createElement('style');
            style.id = 'recorderStyles';
            style.textContent = `
                @keyframes recorderFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes recPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
                .recorder-header { display:flex; justify-content:space-between; align-items:center; padding:16px 24px; background:#f5f5f5; border-bottom:2px solid #e0e0e0; flex-shrink:0; }
                .recorder-header h1 { font-size:20px; font-weight:600; margin:0; }
                .recorder-header-actions button { background:none; border:2px solid #cc0000; color:#cc0000; font-size:18px; padding:4px 12px; cursor:pointer; font-family:'ST-SimpleSquare',monospace; }
                .recorder-header-actions button:hover { background:#cc0000; color:#fff; }
                .recorder-content { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:30px 24px; }
                .recorder-visual { margin-bottom: 30px; display: flex; align-items: center; justify-content: center; }
                .recorder-dot {
                    width: 120px; height: 120px; border-radius: 50%;
                    background: #f0f0f0;
                    display: flex; align-items: center; justify-content: center;
                    transition: background 0.3s;
                }
                .recorder-dot.active { background: #ffe5e5; animation: recPulse 1.2s ease infinite; }
                .recorder-dot-inner {
                    width: 40px; height: 40px; border-radius: 50%;
                    background: #cc0000;
                    transition: all 0.3s;
                }
                .recorder-dot.active .recorder-dot-inner {
                    width: 30px; height: 30px; border-radius: 6px;
                }
                .recorder-timer {
                    font-size: 48px; font-weight: 700; letter-spacing: 3px;
                    color: #1a1a1a; margin-bottom: 12px;
                    font-family: 'ST-SimpleSquare', monospace;
                }
                .recorder-status {
                    font-size: 14px; color: #888;
                    margin-bottom: 30px;
                    min-height: 20px;
                }
                .recorder-controls {
                    display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;
                }
                .recorder-main-btn {
                    padding: 16px 48px; border: none; color: #fff;
                    cursor: pointer; font-family: 'ST-SimpleSquare', monospace;
                    font-size: 16px; font-weight: 600;
                    background: #4CAF50;
                    transition: background 0.2s, transform 0.15s;
                    letter-spacing: 1px;
                }
                .recorder-main-btn:active { transform: scale(0.96); }
                .recorder-pause-btn {
                    padding: 16px 32px; border: 2px solid #cc0000;
                    background: none; color: #cc0000;
                    cursor: pointer; font-family: 'ST-SimpleSquare', monospace;
                    font-size: 14px; font-weight: 600;
                    transition: all 0.2s;
                    display: none;
                }
                .recorder-pause-btn:hover { background: #cc0000; color: #fff; }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'recorder-header';
        header.innerHTML = `
            <h1>Звукозапись</h1>
            <div class="recorder-header-actions">
                <button id="recorderCloseBtn">✕</button>
            </div>
        `;

        const content = document.createElement('div');
        content.className = 'recorder-content';
        content.innerHTML = `
            <div class="recorder-visual">
                <div class="recorder-dot" id="recorderDot">
                    <div class="recorder-dot-inner"></div>
                </div>
            </div>
            <div class="recorder-timer" id="recorderTimer">00:00.0</div>
            <div class="recorder-status" id="recorderStatus">Готово к записи</div>
            <div class="recorder-controls">
                <button class="recorder-pause-btn" id="recorderPauseBtn">Пауза</button>
                <button class="recorder-main-btn" id="recorderMainBtn">НАЧАТЬ</button>
            </div>
        `;

        app.appendChild(header);
        app.appendChild(content);
        document.body.appendChild(app);

        document.getElementById('recorderCloseBtn').addEventListener('click', closeRecorder);
        document.getElementById('recorderMainBtn').addEventListener('click', function() {
            if (isRecording) {
                stopRecording();
            } else {
                startRecording();
            }
        });
        document.getElementById('recorderPauseBtn').addEventListener('click', pauseRecording);

        document.addEventListener('keydown', onKeyDown);
        updateUI();
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') closeRecorder();
    }

    window.Recorder = {
        destroy: destroy,
        start: startRecording,
        stop: stopRecording
    };
    window.recorderInit = function() { openRecorder(); };

})();