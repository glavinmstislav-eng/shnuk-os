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

    // AudioContext / Analyser
    let audioCtx = null;
    let analyser = null;
    let sourceNode = null;
    let frequencyData = null;

    // Three.js
    let threeScene = null;
    let threeCamera = null;
    let threeRenderer = null;
    let threeBars = [];
    let threeAnimationId = null;
    let threeReady = false;
    let threeLoading = false;
    let lastLevels = null;

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
        stopAudioAnalysis();
        closeThree();
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
        stopAudioAnalysis();
        closeThree();
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

    // =========================================
    // AUDIO ANALYSE
    // =========================================
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

    function sampleLevels(count) {
        if (!analyser || !frequencyData) return null;
        analyser.getByteFrequencyData(frequencyData);
        const data = frequencyData;
        const len = data.length;
        const step = Math.max(1, Math.floor(len / count));
        const out = new Array(count).fill(0);
        for (let i = 0; i < count; i++) {
            let sum = 0;
            let n = 0;
            for (let j = 0; j < step; j++) {
                const idx = i * step + j;
                if (idx < len) { sum += data[idx]; n++; }
            }
            out[i] = n > 0 ? (sum / n) / 255 : 0;
        }
        return out;
    }

    // =========================================
    // THREE.JS — круговая визуализация
    // =========================================
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
        threeScene = null;
        threeCamera = null;
        threeBars = [];
        threeReady = false;
        threeLoading = false;
        lastLevels = null;
    }

    function initThree(container) {
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

            const width = container.clientWidth || 320;
            const height = container.clientHeight || 200;

            threeScene = new THREE.Scene();
            // Фон прозрачный
            threeScene.background = null;

            threeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
            threeCamera.position.set(0, 0.4, 4.2);
            threeCamera.lookAt(0, 0, 0);

            threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            threeRenderer.setSize(width, height);
            threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            // Прозрачный clear color
            threeRenderer.setClearColor(0x000000, 0);
            container.appendChild(threeRenderer.domElement);

            const ambient = new THREE.AmbientLight(0xffffff, 0.9);
            threeScene.add(ambient);
            const dir = new THREE.DirectionalLight(0xffffff, 0.7);
            dir.position.set(3, 5, 5);
            threeScene.add(dir);

            // Круг из 40 столбиков
            const COUNT = 40;
            const radius = 1.4;
            const barWidth = 0.08;
            const baseHeight = 0.06;

            threeBars = [];
            for (let i = 0; i < COUNT; i++) {
                const angle = (i / COUNT) * Math.PI * 2;

                const geo = new THREE.BoxGeometry(barWidth, baseHeight, barWidth);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0xcc0000,
                    roughness: 0.4,
                    metalness: 0.3,
                    emissive: 0x550000,
                    emissiveIntensity: 0.4
                });
                const mesh = new THREE.Mesh(geo, mat);

                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                mesh.position.set(x, baseHeight / 2, z);
                mesh.rotation.y = -angle;

                threeScene.add(mesh);
                threeBars.push(mesh);
            }

            // Центральное кольцо-подиум
            const ringGeo = new THREE.RingGeometry(1.2, 1.6, 64);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xcc0000,
                transparent: true,
                opacity: 0.15,
                side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            threeScene.add(ring);

            threeReady = true;
            lastLevels = new Array(COUNT).fill(0);

            function animate() {
                threeAnimationId = requestAnimationFrame(animate);

                // Обновляем уровни
                let levels = null;
                if (isRecording && !isPaused) {
                    levels = sampleLevels(threeBars.length);
                }
                if (!levels) {
                    // плавно опускаем в ноль
                    levels = lastLevels.map(v => v * 0.92);
                }
                lastLevels = levels;

                for (let i = 0; i < threeBars.length; i++) {
                    const bar = threeBars[i];
                    const lvl = levels[i] || 0;
                    const h = 0.06 + lvl * 1.6;
                    bar.scale.y = Math.max(0.1, h / 0.06);
                    bar.position.y = (0.06 * bar.scale.y) / 2;

                    // Лёгкое покачивание
                    const t = performance.now() * 0.001 + i * 0.3;
                    const sway = Math.sin(t) * 0.02 * (0.5 + lvl);
                    bar.position.x = Math.cos((i / threeBars.length) * Math.PI * 2) * (1.4 + sway);
                    bar.position.z = Math.sin((i / threeBars.length) * Math.PI * 2) * (1.4 + sway);

                    // Свечение растёт с уровнем
                    if (bar.material) {
                        bar.material.emissiveIntensity = 0.3 + lvl * 0.9;
                    }
                }

                // Медленное покачивание камеры
                const camAngle = performance.now() * 0.00015;
                threeCamera.position.x = Math.sin(camAngle) * 0.3;
                threeCamera.lookAt(0, 0.3, 0);

                threeRenderer.render(threeScene, threeCamera);
            }
            animate();

            window.addEventListener('resize', onThreeResize);
        } catch(e) {
            console.warn('[Recorder] Three init error:', e);
        }
    }

    function onThreeResize() {
        if (!threeRenderer || !threeCamera) return;
        const container = document.getElementById('recorderVisual3D');
        if (!container) return;
        const w = container.clientWidth || 320;
        const h = container.clientHeight || 200;
        threeCamera.aspect = w / h;
        threeCamera.updateProjectionMatrix();
        threeRenderer.setSize(w, h);
    }

    // =========================================
    // RECORDING
    // =========================================
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

    async function startRecording() {
        if (isRecording) return;
        try {
            if (!stream) {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }

            // Подключаем анализатор
            startAudioAnalysis(stream);

            const mimeType = pickMimeType();
            try {
                mediaRecorder = mimeType
                    ? new MediaRecorder(stream, { mimeType: mimeType })
                    : new MediaRecorder(stream);
            } catch(e) {
                mediaRecorder = new MediaRecorder(stream);
            }

            pendingMimeType = mediaRecorder.mimeType || mimeType || 'audio/webm';

            chunks = [];
            mediaRecorder.ondataavailable = function(e) {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };
            mediaRecorder.onstop = function() {
                saveRecording();
            };
            mediaRecorder.onerror = function(e) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Ошибка записи: ' + (e.error ? e.error.name : ''), { type: 'error' });
                }
            };

            mediaRecorder.start(1000);
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
            if (window.Win && window.Win.notify) {
                window.Win.notify('Нет доступа к микрофону', { type: 'error' });
            }
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
            try { mediaRecorder.stop(); } catch(e) {}
        }
        isRecording = false;
        isPaused = false;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (!silent) updateUI();
        if (window.LiveBar) window.LiveBar.clear();
    }

    function extFromMime(mime) {
        if (!mime) return 'webm';
        if (mime.indexOf('mp4') !== -1 || mime.indexOf('mpeg') !== -1) return 'm4a';
        if (mime.indexOf('ogg') !== -1) return 'ogg';
        if (mime.indexOf('wav') !== -1) return 'wav';
        return 'webm';
    }

    function ensureSharedFiles(cb) {
        if (window.SharedFiles && typeof window.SharedFiles.add === 'function') {
            cb();
            return;
        }
        const existing = document.querySelector('script[data-shnuk-app="file-storage"]');
        if (existing) {
            let tries = 0;
            const wait = function() {
                tries++;
                if (window.SharedFiles && typeof window.SharedFiles.add === 'function') {
                    cb();
                } else if (tries < 20) {
                    setTimeout(wait, 100);
                } else {
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Хранилище недоступно', { type: 'error' });
                    }
                }
            };
            wait();
            return;
        }
        const script = document.createElement('script');
        script.src = 'file-storage.js?t=' + Date.now();
        script.async = false;
        script.dataset.shnukApp = 'file-storage';
        script.onload = function() {
            let tries = 0;
            const wait = function() {
                tries++;
                if (window.SharedFiles && typeof window.SharedFiles.add === 'function') {
                    cb();
                } else if (tries < 20) {
                    setTimeout(wait, 100);
                } else {
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Хранилище недоступно', { type: 'error' });
                    }
                }
            };
            wait();
        };
        script.onerror = function() {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Не удалось загрузить хранилище', { type: 'error' });
            }
        };
        document.head.appendChild(script);
    }

    function saveRecording() {
        if (chunks.length === 0) {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Нет данных для сохранения', { type: 'error' });
            }
            return;
        }

        const type = pendingMimeType || 'audio/webm';
        const ext = extFromMime(type);
        const blob = new Blob(chunks, { type: type });
        chunks = [];

        const reader = new FileReader();
        reader.onload = function() {
            const dataUrl = reader.result;
            if (!dataUrl) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Ошибка чтения записи', { type: 'error' });
                }
                return;
            }
            const name = 'recording_' + Date.now() + '.' + ext;
            ensureSharedFiles(function() {
                window.SharedFiles.add({
                    id: 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
                    name: name,
                    size: blob.size,
                    type: type,
                    data: dataUrl,
                    date: new Date().toISOString(),
                    extension: ext
                }).then(function(ok) {
                    if (ok) {
                        if (window.Win && window.Win.notify) {
                            window.Win.notify('Запись сохранена в Файлы', { type: 'success' });
                        }
                    } else {
                        if (window.Win && window.Win.notify) {
                            window.Win.notify('Не удалось сохранить', { type: 'error' });
                        }
                    }
                }).catch(function() {
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Ошибка сохранения', { type: 'error' });
                    }
                });
            });
        };
        reader.onerror = function() {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Ошибка чтения записи', { type: 'error' });
            }
        };
        reader.readAsDataURL(blob);
    }

    function updateUI() {
        const btn = document.getElementById('recorderMainBtn');
        const status = document.getElementById('recorderStatus');
        const timer = document.getElementById('recorderTimer');
        const pauseBtn = document.getElementById('recorderPauseBtn');

        if (!btn) return;

        if (isRecording) {
            btn.textContent = 'СТОП';
            btn.style.background = '#cc0000';
            if (status) status.textContent = isPaused ? 'Пауза' : 'Идёт запись';
            if (pauseBtn) {
                pauseBtn.style.display = 'inline-block';
                pauseBtn.textContent = isPaused ? 'Продолжить' : 'Пауза';
            }
        } else {
            btn.textContent = 'НАЧАТЬ';
            btn.style.background = '#4CAF50';
            if (status) status.textContent = 'Готово к записи';
            if (timer) timer.textContent = '00:00.0';
            if (pauseBtn) pauseBtn.style.display = 'none';
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
                .recorder-header { display:flex; justify-content:space-between; align-items:center; padding:16px 24px; background:#f5f5f5; border-bottom:2px solid #e0e0e0; flex-shrink:0; }
                .recorder-header h1 { font-size:20px; font-weight:600; margin:0; }
                .recorder-header-actions button { background:none; border:2px solid #cc0000; color:#cc0000; font-size:18px; padding:4px 12px; cursor:pointer; font-family:'ST-SimpleSquare',monospace; }
                .recorder-header-actions button:hover { background:#cc0000; color:#fff; }
                .recorder-content { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px 24px; }

                .recorder-visual-3d {
                    width: 100%;
                    max-width: 520px;
                    height: 260px;
                    position: relative;
                    margin-bottom: 16px;
                    background: transparent;
                    border: none;
                    overflow: hidden;
                }
                .recorder-visual-3d canvas {
                    display: block;
                    width: 100% !important;
                    height: 100% !important;
                    background: transparent;
                }

                .recorder-timer {
                    font-size: 42px; font-weight: 700; letter-spacing: 3px;
                    color: #1a1a1a; margin-bottom: 8px;
                    font-family: 'ST-SimpleSquare', monospace;
                }
                .recorder-status {
                    font-size: 14px; color: #888;
                    margin-bottom: 20px;
                    min-height: 20px;
                }
                .recorder-controls {
                    display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;
                    align-items: center;
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

                @media (max-width: 500px) {
                    .recorder-header { padding: 12px 16px; }
                    .recorder-header h1 { font-size: 17px; }
                    .recorder-content { padding: 14px 16px; }
                    .recorder-visual-3d { height: 200px; margin-bottom: 12px; }
                    .recorder-timer { font-size: 34px; }
                    .recorder-main-btn { padding: 14px 32px; font-size: 15px; }
                    .recorder-pause-btn { padding: 14px 22px; font-size: 13px; }
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
        content.innerHTML = `
            <div class="recorder-visual-3d" id="recorderVisual3D"></div>
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

        // Запуск 3D визуализации
        const visualContainer = document.getElementById('recorderVisual3D');
        if (visualContainer) {
            setTimeout(function() { initThree(visualContainer); }, 50);
        }

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