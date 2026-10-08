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
    let pendingMimeType = 'audio/webm';

    let audioCtx = null;
    let analyser = null;
    let sourceNode = null;
    let frequencyData = null;

    // История уровней громкости для воспроизведения
    let levelsHistory = [];
    let lastLevelSampleTime = 0;
    const LEVEL_SAMPLE_INTERVAL = 50;
    const MAX_HISTORY_SECONDS = 600;

    // Позиция просмотра
    let viewPosition = 0;
    let isScrubbing = false;

    // Текущий уровень
    let liveLevel = 0;

    // Canvas
    let canvas = null;
    let canvasCtx = null;
    let animId = null;

    const FONT_MAIN = "'TTPaplane', monospace";

    // ============================================
    // АНИМАЦИИ (как в настройках)
    // ============================================

    function animationEnabled() {
        return window.L && typeof window.L.blurIn === 'function' && typeof window.L.blurOut === 'function';
    }

    function blurIn(el) {
        if (!el) return Promise.resolve();
        if (animationEnabled()) return window.L.blurIn(el, 420);
        el.style.opacity = '1';
        return Promise.resolve();
    }

    function blurOut(el) {
        if (!el) return Promise.resolve();
        if (animationEnabled()) return window.L.blurOut(el, 340);
        el.style.opacity = '0';
        return new Promise(function(resolve) { setTimeout(resolve, 340); });
    }

    // ============================================
    // ОТКРЫТИЕ / ЗАКРЫТИЕ
    // ============================================

    function openRecorder() {
        if (window.LiveBar && typeof window.LiveBar.resume === 'function') {
            window.LiveBar.resume('recorder');
        }
        if (isOpen) {
            const ex = document.getElementById('recorderApp');
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }
        createUI();
    }

    function closeRecorder() {
        const el = document.getElementById('recorderApp');
        if (!el) {
            isOpen = false;
            return;
        }

        isOpen = false;

        // Если идёт запись или пауза — не трогаем ни MediaRecorder,
        // ни LiveBar. Просто анимированно скрываем окно.
        const recordingActive = isRecording;

        if (animId) {
            cancelAnimationFrame(animId);
            animId = null;
        }

        if (recordingActive) {
            blurOut(el).then(function() {
                if (el.parentNode) el.parentNode.removeChild(el);
            });
            return;
        }

        // Полное закрытие: остановка записи, стрима, анализа, LiveBar
        if (window.LiveBar && typeof window.LiveBar.suspend === 'function') {
            window.LiveBar.suspend('recorder');
        }
        stopRecording(true);
        stopStream();
        stopAudioAnalysis();
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        document.removeEventListener('keydown', onKeyDown);

        blurOut(el).then(function() {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
    }

    function destroy() {
        isOpen = false;
        if (window.LiveBar && typeof window.LiveBar.suspend === 'function') {
            window.LiveBar.suspend('recorder');
        }
        stopRecording(true);
        stopStream();
        stopAudioAnalysis();
        if (animId) { cancelAnimationFrame(animId); animId = null; }
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

    function startAudioAnalysis(mediaStream) {
        stopAudioAnalysis();
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            audioCtx = new AC();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.75;
            sourceNode = audioCtx.createMediaStreamSource(mediaStream);
            sourceNode.connect(analyser);
            frequencyData = new Uint8Array(analyser.frequencyBinCount);
        } catch(e) {
            console.warn('[Recorder] audio analysis error:', e);
        }
    }

    function stopAudioAnalysis() {
        try {
            if (sourceNode) { sourceNode.disconnect(); sourceNode = null; }
        } catch(e) {}
        try {
            if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
        } catch(e) {}
        audioCtx = null;
        analyser = null;
        frequencyData = null;
    }

    function sampleLevel() {
        if (!analyser || !frequencyData) return 0;
        analyser.getByteTimeDomainData(frequencyData);
        let sum = 0;
        for (let i = 0; i < frequencyData.length; i++) {
            const v = (frequencyData[i] - 128) / 128;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / frequencyData.length);
        return Math.min(1, rms * 3);
    }

    function formatTime(ms) {
        const total = Math.floor(ms / 1000);
        const m = Math.floor(total / 60);
        const s = total % 60;
        const t = Math.floor((ms % 1000) / 100);
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + t;
    }

    function updateTimer() {
        if (!isRecording || isPaused) return;
        recordingElapsed = Date.now() - recordingStartTime;

        const el = document.getElementById('recorderTimer');
        if (el) el.textContent = formatTime(recordingElapsed);

        if (window.LiveBar) {
            window.LiveBar.update({ elapsed: recordingElapsed / 1000, paused: false });
        }
    }

    function pickMimeType() {
        if (typeof MediaRecorder === 'undefined') return '';
        const candidates = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            'audio/mp4',
            'audio/mpeg'
        ];
        for (const c of candidates) {
            try {
                if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
            } catch(e) {}
        }
        return '';
    }

    async function waitForSharedFiles() {
        let tries = 0;
        while (!window.SharedFiles && tries < 50) {
            tries++;
            await new Promise(function(r) { setTimeout(r, 100); });
        }
        if (window.SharedFiles && window.SharedFiles.ready) {
            try { await window.SharedFiles.ready(); } catch(e) {}
        }
    }

    function createMediaRecorder(mediaStream) {
        const mimeType = pickMimeType();
        let rec;
        try {
            rec = mimeType
                ? new MediaRecorder(mediaStream, { mimeType: mimeType })
                : new MediaRecorder(mediaStream);
        } catch(e) {
            rec = new MediaRecorder(mediaStream);
        }
        pendingMimeType = rec.mimeType || mimeType || 'audio/webm';

        rec.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        rec.onerror = function(e) {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Ошибка записи: ' + (e.error ? e.error.name : ''), { type: 'error' });
            }
        };
        return rec;
    }

    async function startRecording() {
        if (isRecording) return;

        await waitForSharedFiles();

        try {
            if (!stream) {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }

            startAudioAnalysis(stream);

            mediaRecorder = createMediaRecorder(stream);

            chunks = [];
            levelsHistory = [];
            viewPosition = 0;
            recordingElapsed = 0;

            mediaRecorder.start(1000);
            isRecording = true;
            isPaused = false;
            recordingStartTime = Date.now();
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateTimer, 100);
            lastLevelSampleTime = performance.now();

            updateUI();
            startDrawLoop();

            if (window.LiveBar) {
                window.LiveBar.set({
                    type: 'recording',
                    appId: 'recorder',
                    payload: { elapsed: 0, paused: false }
                });
            }
        } catch(e) {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Нет доступа к микрофону', { type: 'error' });
            }
        }
    }

    function stopRecording(silent) {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            try { mediaRecorder.stop(); } catch(e) {}
        }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (!silent) {
            isRecording = false;
            isPaused = false;
            updateUI();
        }
        if (window.LiveBar) window.LiveBar.clear();
    }

    // Пауза без сохранения: рекордер остаётся жив, можно продолжить
    function pauseRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            try { mediaRecorder.pause(); } catch(e) {}
        }
        isPaused = true;
        recordingElapsed = Date.now() - recordingStartTime;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        const timerEl = document.getElementById('recorderTimer');
        if (timerEl) timerEl.textContent = formatTime(recordingElapsed);

        // Live bar не сбрасываем — показываем состояние паузы
        if (window.LiveBar) {
            window.LiveBar.update({ elapsed: recordingElapsed / 1000, paused: true });
        }
        updateUI();
    }

    async function resumeRecording() {
        try {
            if (!stream || !stream.active) {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                startAudioAnalysis(stream);
                mediaRecorder = createMediaRecorder(stream);
            } else {
                if (!analyser) {
                    startAudioAnalysis(stream);
                }
            }

            if (mediaRecorder && mediaRecorder.state === 'paused') {
                mediaRecorder.resume();
            } else if (mediaRecorder && mediaRecorder.state === 'recording') {
                // уже идёт
            } else {
                mediaRecorder = createMediaRecorder(stream);
                mediaRecorder.start(1000);
            }

            isRecording = true;
            isPaused = false;
            recordingStartTime = Date.now() - recordingElapsed;
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateTimer, 100);
            lastLevelSampleTime = performance.now();

            updateUI();
            startDrawLoop();

            if (window.LiveBar) {
                window.LiveBar.set({
                    type: 'recording',
                    appId: 'recorder',
                    payload: { elapsed: recordingElapsed / 1000, paused: false }
                });
            }
        } catch(e) {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Не удалось продолжить запись', { type: 'error' });
            }
        }
    }

    async function saveRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            await new Promise(function(resolve) {
                const rec = mediaRecorder;
                const done = function() {
                    rec.onstop = null;
                    resolve();
                };
                rec.onstop = done;
                try { rec.stop(); } catch(e) { done(); return; }
                setTimeout(done, 600);
            });
        }

        if (chunks.length === 0) {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Нет данных для сохранения', { type: 'error' });
            }
            return;
        }

        const type = pendingMimeType || 'audio/webm';
        const ext = extFromMime(type);
        const blob = new Blob(chunks, { type: type });

        const reader = new FileReader();
        reader.onload = async function() {
            const dataUrl = reader.result;
            if (!dataUrl) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Ошибка чтения записи', { type: 'error' });
                }
                return;
            }
            const name = 'recording_' + Date.now() + '.' + ext;

            await waitForSharedFiles();

            if (!window.SharedFiles || typeof window.SharedFiles.add !== 'function') {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Хранилище недоступно', { type: 'error' });
                }
                return;
            }

            const ok = await window.SharedFiles.add({
                id: 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
                name: name,
                size: blob.size,
                type: type,
                data: dataUrl,
                date: new Date().toISOString(),
                extension: ext,
                parentId: null,
                isFolder: false
            });

            if (ok) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Запись сохранена в Файлы', { type: 'success' });
                }
            } else {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Не удалось сохранить', { type: 'error' });
                }
            }

            chunks = [];
            levelsHistory = [];
            recordingElapsed = 0;
            viewPosition = 0;
            isRecording = false;
            isPaused = false;
            mediaRecorder = null;
            if (window.LiveBar) window.LiveBar.clear();
            updateUI();
        };
        reader.onerror = function() {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Ошибка чтения записи', { type: 'error' });
            }
        };
        reader.readAsDataURL(blob);
    }

    function extFromMime(mime) {
        if (!mime) return 'webm';
        if (mime.indexOf('mp4') !== -1 || mime.indexOf('mpeg') !== -1) return 'm4a';
        if (mime.indexOf('ogg') !== -1) return 'ogg';
        if (mime.indexOf('wav') !== -1) return 'wav';
        return 'webm';
    }

    function updateUI() {
        const btn = document.getElementById('recorderMainBtn');
        const status = document.getElementById('recorderStatus');
        const timer = document.getElementById('recorderTimer');
        const saveBtn = document.getElementById('recorderSaveBtn');

        if (!btn) return;

        const hasData = (chunks.length > 0) || (levelsHistory.length > 0);

        if (isRecording && !isPaused) {
            btn.textContent = 'СТОП';
            btn.style.background = 'var(--accent)';
            btn.style.color = 'var(--text-on-accent)';
            if (status) status.textContent = 'Идёт запись';
            if (saveBtn) saveBtn.style.display = 'none';
        } else if (isRecording && isPaused) {
            btn.textContent = 'ПРОДОЛЖИТЬ';
            btn.style.background = '#4CAF50';
            btn.style.color = '#ffffff';
            if (status) status.textContent = 'Пауза';
            if (saveBtn) saveBtn.style.display = 'inline-block';
        } else if (hasData) {
            btn.textContent = 'ПРОДОЛЖИТЬ';
            btn.style.background = '#4CAF50';
            btn.style.color = '#ffffff';
            if (status) status.textContent = 'Готово. Можно продолжить или сохранить';
            if (saveBtn) saveBtn.style.display = 'inline-block';
        } else {
            btn.textContent = 'НАЧАТЬ';
            btn.style.background = '#4CAF50';
            btn.style.color = '#ffffff';
            if (status) status.textContent = 'Готово к записи';
            if (timer) timer.textContent = '00:00.0';
            if (saveBtn) saveBtn.style.display = 'none';
        }

        if (timer && isRecording) {
            timer.textContent = formatTime(recordingElapsed);
        }
    }

    // ============================================
    // ОТРИСОВКА
    // ============================================

    function startDrawLoop() {
        if (animId) return;
        function loop() {
            animId = requestAnimationFrame(loop);
            drawWaveform();
            if (isRecording && !isPaused) {
                const now = performance.now();
                if (now - lastLevelSampleTime >= LEVEL_SAMPLE_INTERVAL) {
                    lastLevelSampleTime = now;
                    liveLevel = sampleLevel();
                    levelsHistory.push({
                        t: recordingElapsed,
                        v: liveLevel
                    });
                    const cutoff = recordingElapsed - MAX_HISTORY_SECONDS * 1000;
                    while (levelsHistory.length > 0 && levelsHistory[0].t < cutoff) {
                        levelsHistory.shift();
                    }
                }
            } else {
                liveLevel *= 0.92;
            }
        }
        loop();
    }

    function drawWaveform() {
        if (!canvas || !canvasCtx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        if (w === 0 || h === 0) return;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        canvasCtx.fillStyle = '#ffffff';
        canvasCtx.fillRect(0, 0, w, h);

        const centerY = h / 2;

        let duration = recordingElapsed;
        if (duration <= 0 && levelsHistory.length > 0) {
            duration = levelsHistory[levelsHistory.length - 1].t;
        }
        if (duration <= 0) duration = 1000;

        const pixelsPerMs = w / Math.max(duration, 1000);

        const points = [];
        for (let i = 0; i < levelsHistory.length; i++) {
            const sample = levelsHistory[i];
            const x = sample.t * pixelsPerMs - viewPosition * pixelsPerMs;
            if (x < -20) continue;
            if (x > w + 20) break;
            const level = Math.max(0.015, sample.v);
            const y = centerY - (level * h * 0.42);
            points.push({ x: x, y: y });
        }

        if (isRecording && !isPaused && levelsHistory.length > 0) {
            const liveT = recordingElapsed;
            const liveX = liveT * pixelsPerMs - viewPosition * pixelsPerMs;
            if (liveX <= w + 20) {
                const liveY = centerY - (Math.max(0.015, liveLevel) * h * 0.42);
                points.push({ x: liveX, y: liveY });
            }
        }

        if (points.length > 0) {
            canvasCtx.save();

            canvasCtx.strokeStyle = '#cc0000';
            canvasCtx.lineWidth = 2.5;
            canvasCtx.lineJoin = 'round';
            canvasCtx.lineCap = 'round';

            canvasCtx.beginPath();
            if (points.length === 1) {
                canvasCtx.moveTo(points[0].x, points[0].y);
                canvasCtx.lineTo(points[0].x + 2, points[0].y);
            } else {
                canvasCtx.moveTo(points[0].x, points[0].y);
                for (let i = 0; i < points.length - 1; i++) {
                    const p0 = points[i];
                    const p1 = points[i + 1];
                    const mx = (p0.x + p1.x) / 2;
                    const my = (p0.y + p1.y) / 2;
                    canvasCtx.quadraticCurveTo(p0.x, p0.y, mx, my);
                }
                const last = points[points.length - 1];
                canvasCtx.lineTo(last.x, last.y);
            }
            canvasCtx.stroke();

            canvasCtx.beginPath();
            canvasCtx.moveTo(points[0].x, centerY);
            canvasCtx.lineTo(points[0].x, points[0].y);
            for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[i];
                const p1 = points[i + 1];
                const mx = (p0.x + p1.x) / 2;
                const my = (p0.y + p1.y) / 2;
                canvasCtx.quadraticCurveTo(p0.x, p0.y, mx, my);
            }
            const last = points[points.length - 1];
            canvasCtx.lineTo(last.x, last.y);
            canvasCtx.lineTo(last.x, centerY);
            canvasCtx.closePath();
            canvasCtx.fillStyle = 'rgba(204,0,0,0.12)';
            canvasCtx.fill();

            canvasCtx.beginPath();
            canvasCtx.moveTo(points[0].x, centerY + (centerY - points[0].y));
            for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[i];
                const p1 = points[i + 1];
                const mx = (p0.x + p1.x) / 2;
                const my = (p0.y + p1.y) / 2;
                const rmy = centerY + (centerY - my);
                canvasCtx.quadraticCurveTo(p0.x, centerY + (centerY - p0.y), mx, rmy);
            }
            const last2 = points[points.length - 1];
            canvasCtx.lineTo(last2.x, centerY + (centerY - last2.y));

            canvasCtx.strokeStyle = 'rgba(204,0,0,0.45)';
            canvasCtx.lineWidth = 1.5;
            canvasCtx.stroke();

            canvasCtx.beginPath();
            canvasCtx.moveTo(points[0].x, centerY);
            canvasCtx.lineTo(points[0].x, centerY + (centerY - points[0].y));
            for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[i];
                const p1 = points[i + 1];
                const mx = (p0.x + p1.x) / 2;
                const my = (p0.y + p1.y) / 2;
                const rmy = centerY + (centerY - my);
                canvasCtx.quadraticCurveTo(p0.x, centerY + (centerY - p0.y), mx, rmy);
            }
            const last3 = points[points.length - 1];
            canvasCtx.lineTo(last3.x, centerY + (centerY - last3.y));
            canvasCtx.lineTo(last3.x, centerY);
            canvasCtx.closePath();
            canvasCtx.fillStyle = 'rgba(204,0,0,0.06)';
            canvasCtx.fill();

            canvasCtx.restore();
        }

        canvasCtx.strokeStyle = 'rgba(0,0,0,0.12)';
        canvasCtx.lineWidth = 1;
        canvasCtx.beginPath();
        canvasCtx.moveTo(0, centerY);
        canvasCtx.lineTo(w, centerY);
        canvasCtx.stroke();

        if (!isRecording && duration > 0) {
            const xPos = (viewPosition / duration) * w;
            if (xPos >= 0 && xPos <= w) {
                canvasCtx.strokeStyle = '#1a1a1a';
                canvasCtx.lineWidth = 2;
                canvasCtx.beginPath();
                canvasCtx.moveTo(xPos, 0);
                canvasCtx.lineTo(xPos, h);
                canvasCtx.stroke();
            }
        }
    }

    function onCanvasDown(e) {
        if (isRecording) return;
        if (levelsHistory.length === 0) return;
        isScrubbing = true;
        updateScrubPosition(e);
        if (e.cancelable) e.preventDefault();
    }

    function onCanvasMove(e) {
        if (!isScrubbing) return;
        updateScrubPosition(e);
        if (e.cancelable) e.preventDefault();
    }

    function onCanvasUp(e) {
        isScrubbing = false;
    }

    function updateScrubPosition(e) {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const w = rect.width;
        const ratio = Math.max(0, Math.min(1, x / w));
        let duration = recordingElapsed;
        if (duration <= 0 && levelsHistory.length > 0) {
            duration = levelsHistory[levelsHistory.length - 1].t;
        }
        viewPosition = ratio * duration;
        const timer = document.getElementById('recorderTimer');
        if (timer) timer.textContent = formatTime(viewPosition);
    }

    // ============================================
    // UI
    // ============================================

    function createUI() {
        if (document.getElementById('recorderApp')) {
            document.getElementById('recorderApp').style.display = 'flex';
            document.getElementById('recorderApp').style.opacity = '1';
            isOpen = true;
            return;
        }
        isOpen = true;

        const app = document.createElement('div');
        app.id = 'recorderApp';
        app.className = 'scroll-blur';
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
            font-family: ${FONT_MAIN};
            color: #1a1a1a;
            opacity: 0;
            overflow: hidden;
            will-change: filter, opacity, transform;
        `;

        if (!document.getElementById('recorderStyles')) {
            const style = document.createElement('style');
            style.id = 'recorderStyles';
            style.textContent = `
                @keyframes recorderPanelIn {
                    from { opacity: 0; filter: blur(14px); transform: translateY(14px); }
                    to { opacity: 1; filter: blur(0); transform: translateY(0); }
                }

                #recorderApp, #recorderApp * {
                    font-family: ${FONT_MAIN} !important;
                }

                .scroll-blur {
                    position: relative;
                    isolation: isolate;
                }
                .scroll-blur::after {
                    content: '';
                    position: fixed;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    height: 80px;
                    pointer-events: none;
                    z-index: 20;
                    -webkit-backdrop-filter: blur(12px);
                    backdrop-filter: blur(12px);
                    -webkit-mask-image: linear-gradient(to top, #000 0%, #000 40%, transparent 100%);
                    mask-image: linear-gradient(to top, #000 0%, #000 40%, transparent 100%);
                }

                .recorder-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 24px;
                    background: #ffffff;
                    border-bottom: 2px solid #e0e0e0;
                    flex-shrink: 0;
                    color: #1a1a1a;
                    font-family: ${FONT_MAIN};
                }
                .recorder-header h1 {
                    font-size: 20px;
                    font-weight: 600;
                    margin: 0;
                    font-family: ${FONT_MAIN};
                }
                .recorder-header-actions button {
                    background: #ffffff;
                    border: 2px solid var(--accent);
                    color: var(--accent);
                    font-size: 18px;
                    padding: 4px 12px;
                    cursor: pointer;
                    font-family: ${FONT_MAIN};
                    transition: all 0.2s;
                }
                .recorder-header-actions button:hover {
                    background: var(--accent);
                    color: var(--text-on-accent);
                }

                .recorder-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                    overflow: hidden;
                    background: #ffffff;
                }

                .recorder-wave-area {
                    flex: 1;
                    position: relative;
                    background: #ffffff;
                    min-height: 0;
                    cursor: pointer;
                }
                .recorder-wave-canvas {
                    display: block;
                    width: 100%;
                    height: 100%;
                    background: #ffffff;
                    touch-action: none;
                }

                .recorder-controls-panel {
                    flex-shrink: 0;
                    padding: 20px 24px 100px;
                    background: #ffffff;
                    border-top: 2px solid #e0e0e0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 14px;
                    position: relative;
                    z-index: 21;
                    animation: recorderPanelIn 0.45s cubic-bezier(0.22, 1, 0.36, 1);
                }

                .recorder-timer {
                    font-size: 42px;
                    font-weight: 700;
                    letter-spacing: 3px;
                    color: #1a1a1a;
                    font-family: ${FONT_MAIN};
                    line-height: 1;
                    transition: opacity 0.25s ease, filter 0.25s ease;
                }
                .recorder-status {
                    font-size: 13px;
                    color: #888888;
                    min-height: 18px;
                    font-family: ${FONT_MAIN};
                    transition: opacity 0.25s ease;
                }

                .recorder-controls {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                    justify-content: center;
                    align-items: center;
                }
                .recorder-main-btn {
                    padding: 14px 40px;
                    border: none;
                    color: #ffffff;
                    cursor: pointer;
                    font-family: ${FONT_MAIN};
                    font-size: 15px;
                    font-weight: 700;
                    background: #4CAF50;
                    transition: background 0.2s, transform 0.15s, filter 0.2s;
                    letter-spacing: 1px;
                    touch-action: manipulation;
                }
                .recorder-main-btn:active { transform: scale(0.96); }
                .recorder-save-btn {
                    padding: 14px 26px;
                    border: 2px solid #4CAF50;
                    background: none;
                    color: #4CAF50;
                    cursor: pointer;
                    font-family: ${FONT_MAIN};
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.2s;
                    display: none;
                    touch-action: manipulation;
                }
                .recorder-save-btn:hover {
                    background: #4CAF50;
                    color: #ffffff;
                }

                @media (max-width: 500px) {
                    .recorder-header { padding: 12px 16px; }
                    .recorder-header h1 { font-size: 17px; }
                    .recorder-controls-panel { padding: 16px 16px 90px; gap: 10px; }
                    .recorder-timer { font-size: 34px; }
                    .recorder-main-btn { padding: 12px 28px; font-size: 14px; }
                    .recorder-save-btn { padding: 12px 18px; font-size: 12px; }
                }
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

        const waveArea = document.createElement('div');
        waveArea.className = 'recorder-wave-area';
        canvas = document.createElement('canvas');
        canvas.className = 'recorder-wave-canvas';
        waveArea.appendChild(canvas);
        content.appendChild(waveArea);

        const controlsPanel = document.createElement('div');
        controlsPanel.className = 'recorder-controls-panel';
        controlsPanel.innerHTML = `
            <div class="recorder-timer" id="recorderTimer">00:00.0</div>
            <div class="recorder-status" id="recorderStatus">Готово к записи</div>
            <div class="recorder-controls">
                <button class="recorder-main-btn" id="recorderMainBtn">НАЧАТЬ</button>
                <button class="recorder-save-btn" id="recorderSaveBtn">СОХРАНИТЬ</button>
            </div>
        `;
        content.appendChild(controlsPanel);

        app.appendChild(header);
        app.appendChild(content);
        document.body.appendChild(app);

        canvasCtx = canvas.getContext('2d');

        canvas.addEventListener('pointerdown', onCanvasDown);
        canvas.addEventListener('pointermove', onCanvasMove);
        canvas.addEventListener('pointerup', onCanvasUp);
        canvas.addEventListener('pointercancel', onCanvasUp);
        canvas.addEventListener('pointerleave', onCanvasUp);

        document.getElementById('recorderCloseBtn').addEventListener('click', closeRecorder);

        document.getElementById('recorderMainBtn').addEventListener('click', function() {
            if (isRecording && !isPaused) {
                pauseRecording();
            } else if (isRecording && isPaused) {
                resumeRecording();
            } else if (chunks.length > 0 || levelsHistory.length > 0) {
                resumeRecording();
            } else {
                startRecording();
            }
        });

        document.getElementById('recorderSaveBtn').addEventListener('click', saveRecording);

        document.addEventListener('keydown', onKeyDown);

        // Анимация появления — как в настройках
        blurIn(app);

        startDrawLoop();
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