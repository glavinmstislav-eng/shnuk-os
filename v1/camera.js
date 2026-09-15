// camera.js

(function() {
    'use strict';

    let isOpen = false;
    let stream = null;
    let videoEl = null;
    let facingMode = 'environment';

    function openCamera() {
        if (isOpen) {
            const ex = document.getElementById('cameraApp');
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }
        createUI();
    }

    function closeCamera() {
        isOpen = false;
        stopStream();
        const el = document.getElementById('cameraApp');
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1'; }, 300);
        }
        document.removeEventListener('keydown', onKeyDown);
    }

    function destroy() {
        isOpen = false;
        stopStream();
        document.removeEventListener('keydown', onKeyDown);
        const el = document.getElementById('cameraApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function stopStream() {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
        if (videoEl) {
            videoEl.srcObject = null;
        }
    }

    async function startStream(mode) {
        stopStream();
        facingMode = mode || facingMode;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: facingMode } },
                audio: false
            });
            if (videoEl) {
                videoEl.srcObject = stream;
                await videoEl.play().catch(() => {});
            }
            return true;
        } catch(e) {
            return false;
        }
    }

    function capture() {
        if (!videoEl || !videoEl.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoEl, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        try {
            const saved = JSON.parse(localStorage.getItem('shnuk_files') || '[]');
            saved.push({
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 8),
                name: 'photo_' + Date.now() + '.png',
                size: Math.round(dataUrl.length * 0.75),
                type: 'image/png',
                data: dataUrl,
                date: new Date().toISOString(),
                extension: 'png'
            });
            localStorage.setItem('shnuk_files', JSON.stringify(saved));
            flashEffect();
            if (window.Win && window.Win.notify) window.Win.notify('Сохранено в Файлы', { type: 'success' });
        } catch(e) {
            if (window.Win && window.Win.notify) window.Win.notify('Ошибка сохранения', { type: 'error' });
        }
    }

    function flashEffect() {
        const flash = document.createElement('div');
        flash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#fff;z-index:100002;opacity:0.9;transition:opacity 0.3s;pointer-events:none;';
        document.body.appendChild(flash);
        requestAnimationFrame(() => flash.style.opacity = '0');
        setTimeout(() => flash.remove(), 350);
    }

    function createUI() {
        if (document.getElementById('cameraApp')) {
            document.getElementById('cameraApp').style.display = 'flex';
            return;
        }
        isOpen = true;

        const app = document.createElement('div');
        app.id = 'cameraApp';
        app.style.cssText = `
            position: fixed;
            top: var(--livebar-h, 44px);
            left: 0;
            width: 100%;
            height: calc(100% - var(--livebar-h, 44px));
            background: #000000;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            font-family: 'ST-SimpleSquare', monospace;
            color: #ffffff;
            opacity: 0;
            animation: cameraFadeIn 0.3s ease forwards;
        `;

        if (!document.getElementById('cameraStyles')) {
            const style = document.createElement('style');
            style.id = 'cameraStyles';
            style.textContent = `
                @keyframes cameraFadeIn { from { opacity: 0; } to { opacity: 1; } }
                .camera-header { display:flex; justify-content:space-between; align-items:center; padding:14px 20px; background:#111; border-bottom:2px solid #222; flex-shrink:0; }
                .camera-header h1 { font-size:18px; font-weight:600; margin:0; }
                .camera-header-actions { display:flex; gap:8px; align-items:center; }
                .camera-header-actions button { background:none; border:2px solid #444; color:#fff; padding:6px 14px; cursor:pointer; font-family:'ST-SimpleSquare',monospace; font-size:13px; transition:all 0.2s; }
                .camera-header-actions button:hover { border-color:#cc0000; }
                .camera-header-actions .close-btn { border-color:#cc0000; color:#cc0000; font-size:18px; padding:2px 10px; }
                .camera-header-actions .close-btn:hover { background:#cc0000; color:#fff; }
                .camera-view { flex:1; position:relative; display:flex; align-items:center; justify-content:center; overflow:hidden; background:#000; }
                .camera-view video { width:100%; height:100%; object-fit:contain; display:block; }
                .camera-view .camera-error { color:#888; font-size:14px; text-align:center; padding:20px; }
                .camera-controls { display:flex; justify-content:center; align-items:center; gap:30px; padding:20px; background:#111; border-top:2px solid #222; flex-shrink:0; }
                .camera-controls button { background:none; border:none; cursor:pointer; color:#fff; padding:0; }
                .camera-shutter {
                    width: 70px; height: 70px; border-radius: 50%;
                    background: #ffffff; border: 4px solid #ffffff;
                    box-shadow: 0 0 0 3px #111, 0 0 0 5px #ffffff;
                    transition: transform 0.15s;
                }
                .camera-shutter:active { transform: scale(0.9); }
                .camera-switch, .camera-gallery {
                    width: 48px; height: 48px; border-radius: 50%;
                    background: rgba(255,255,255,0.1);
                    display: flex; align-items: center; justify-content: center;
                    transition: background 0.2s;
                }
                .camera-switch:hover, .camera-gallery:hover { background: rgba(255,255,255,0.2); }
                .camera-switch svg, .camera-gallery svg { width: 24px; height: 24px; }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'camera-header';
        header.innerHTML = `
            <h1>Камера</h1>
            <div class="camera-header-actions">
                <button class="close-btn" id="cameraCloseBtn">✕</button>
            </div>
        `;

        const view = document.createElement('div');
        view.className = 'camera-view';
        view.innerHTML = `
            <video id="cameraVideo" autoplay playsinline muted></video>
            <div class="camera-error" id="cameraError" style="display:none;">Нет доступа к камере</div>
        `;

        const controls = document.createElement('div');
        controls.className = 'camera-controls';
        controls.innerHTML = `
            <button class="camera-gallery" id="cameraGalleryBtn" title="Галерея">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                </svg>
            </button>
            <button class="camera-shutter" id="cameraShutter" title="Снять"></button>
            <button class="camera-switch" id="cameraSwitchBtn" title="Переключить">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 1l4 4-4 4"/>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                    <path d="M7 23l-4-4 4-4"/>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
            </button>
        `;

        app.appendChild(header);
        app.appendChild(view);
        app.appendChild(controls);
        document.body.appendChild(app);

        videoEl = document.getElementById('cameraVideo');

        startStream('environment').then(function(ok) {
            if (!ok) {
                const err = document.getElementById('cameraError');
                if (err) err.style.display = 'block';
            }
        });

        document.getElementById('cameraCloseBtn').addEventListener('click', closeCamera);
        document.getElementById('cameraShutter').addEventListener('click', capture);
        document.getElementById('cameraSwitchBtn').addEventListener('click', function() {
            facingMode = facingMode === 'environment' ? 'user' : 'environment';
            startStream(facingMode).then(function(ok) {
                if (!ok) {
                    const err = document.getElementById('cameraError');
                    if (err) err.style.display = 'block';
                }
            });
        });
        document.getElementById('cameraGalleryBtn').addEventListener('click', function() {
            closeCamera();
            if (typeof window.fileInit === 'function') window.fileInit();
        });

        document.addEventListener('keydown', onKeyDown);
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') closeCamera();
    }

    window.Camera = { destroy: destroy };
    window.cameraInit = function() { openCamera(); };

})();