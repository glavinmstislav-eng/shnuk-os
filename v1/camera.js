// camera.js

(function() {
    'use strict';

    let isOpen = false;
    let stream = null;
    let videoEl = null;
    let facingMode = 'environment';
    let zoomLevel = 1;
    let brightness = 100;
    let contrast = 100;
    let saturation = 100;

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
            const constraints = {
                video: {
                    facingMode: { ideal: facingMode },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (videoEl) {
                videoEl.srcObject = stream;
                await videoEl.play().catch(() => {});
                applyFilters();
            }
            return true;
        } catch(e) {
            return false;
        }
    }

    function applyFilters() {
        if (!videoEl) return;
        videoEl.style.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
        videoEl.style.transform = `scale(${zoomLevel})`;
        videoEl.style.transformOrigin = 'center center';
    }

    function capture() {
        if (!videoEl || !videoEl.videoWidth) {
            if (window.Win && window.Win.notify) window.Win.notify('Камера не готова', { type: 'error' });
            return;
        }

        try {
            const canvas = document.createElement('canvas');
            const w = videoEl.videoWidth;
            const h = videoEl.videoHeight;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;

            const sw = w / zoomLevel;
            const sh = h / zoomLevel;
            const sx = (w - sw) / 2;
            const sy = (h - sh) / 2;
            ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, w, h);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            flashEffect();

            if (!window.SharedFiles) {
                if (window.Win && window.Win.notify) window.Win.notify('Хранилище недоступно', { type: 'error' });
                return;
            }

            const ok = window.SharedFiles.add({
                id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
                name: 'photo_' + Date.now() + '.jpg',
                size: Math.round(dataUrl.length * 0.75),
                type: 'image/jpeg',
                data: dataUrl,
                date: new Date().toISOString(),
                extension: 'jpg'
            });

            if (ok) {
                if (window.Win && window.Win.notify) window.Win.notify('Сохранено в Файлы', { type: 'success' });
            } else {
                if (window.Win && window.Win.notify) window.Win.notify('Не удалось сохранить (переполнено?)', { type: 'error' });
            }
        } catch(e) {
            if (window.Win && window.Win.notify) window.Win.notify('Ошибка снимка: ' + e.message, { type: 'error' });
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
                .camera-header { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:#111; border-bottom:2px solid #222; flex-shrink:0; }
                .camera-header h1 { font-size:16px; font-weight:600; margin:0; }
                .camera-header-actions button { background:none; border:2px solid #cc0000; color:#cc0000; font-size:18px; padding:2px 10px; cursor:pointer; font-family:'ST-SimpleSquare',monospace; }
                .camera-header-actions button:hover { background:#cc0000; color:#fff; }
                .camera-view { flex:1; position:relative; display:flex; align-items:center; justify-content:center; overflow:hidden; background:#000; }
                .camera-view video { width:100%; height:100%; object-fit:cover; display:block; }
                .camera-view .camera-error { color:#888; font-size:14px; text-align:center; padding:20px; position:absolute; }
                .camera-controls-panel { background:#111; border-top:2px solid #222; padding:10px 14px; flex-shrink:0; overflow-y:auto; max-height:42vh; }
                .camera-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; font-size:12px; }
                .camera-row label { color:#aaa; min-width:70px; }
                .camera-row input[type="range"] { flex:1; accent-color:#cc0000; }
                .camera-row .val { min-width:32px; text-align:right; color:#fff; font-size:11px; }
                .camera-zoom-row { display:flex; gap:6px; justify-content:center; flex-wrap:wrap; margin-bottom:8px; }
                .camera-zoom-btn { padding:6px 14px; background:#222; border:2px solid #333; color:#fff; cursor:pointer; font-family:'ST-SimpleSquare',monospace; font-size:12px; transition:all 0.15s; }
                .camera-zoom-btn:hover { border-color:#cc0000; }
                .camera-zoom-btn.active { background:#cc0000; border-color:#cc0000; }
                .camera-main-row { display:flex; justify-content:center; align-items:center; gap:30px; margin-top:6px; }
                .camera-shutter {
                    width: 60px; height: 60px; border-radius: 50%;
                    background: #ffffff; border: 4px solid #ffffff;
                    box-shadow: 0 0 0 3px #111, 0 0 0 5px #ffffff;
                    transition: transform 0.15s;
                    cursor: pointer;
                }
                .camera-shutter:active { transform: scale(0.9); }
                .camera-switch, .camera-gallery {
                    width: 44px; height: 44px; border-radius: 50%;
                    background: rgba(255,255,255,0.1);
                    display: flex; align-items: center; justify-content: center;
                    transition: background 0.2s; cursor: pointer; border:none; color:#fff;
                }
                .camera-switch:hover, .camera-gallery:hover { background: rgba(255,255,255,0.2); }
                .camera-switch svg, .camera-gallery svg { width: 22px; height: 22px; }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'camera-header';
        header.innerHTML = `
            <h1>Камера</h1>
            <div class="camera-header-actions">
                <button id="cameraCloseBtn">✕</button>
            </div>
        `;

        const view = document.createElement('div');
        view.className = 'camera-view';
        view.innerHTML = `
            <video id="cameraVideo" autoplay playsinline muted></video>
            <div class="camera-error" id="cameraError" style="display:none;">Нет доступа к камере</div>
        `;

        const controls = document.createElement('div');
        controls.className = 'camera-controls-panel';
        controls.innerHTML = `
            <div class="camera-zoom-row">
                <button class="camera-zoom-btn active" data-zoom="1">1x</button>
                <button class="camera-zoom-btn" data-zoom="2">2x</button>
                <button class="camera-zoom-btn" data-zoom="3">3x</button>
                <button class="camera-zoom-btn" data-zoom="5">5x</button>
                <button class="camera-zoom-btn" data-zoom="10">10x</button>
            </div>
            <div class="camera-row">
                <label>Яркость</label>
                <input type="range" id="camBrightness" min="20" max="200" value="100" />
                <span class="val" id="camBrightnessVal">100</span>
            </div>
            <div class="camera-row">
                <label>Контраст</label>
                <input type="range" id="camContrast" min="20" max="200" value="100" />
                <span class="val" id="camContrastVal">100</span>
            </div>
            <div class="camera-row">
                <label>Насыщенность</label>
                <input type="range" id="camSaturation" min="0" max="200" value="100" />
                <span class="val" id="camSaturationVal">100</span>
            </div>
            <div class="camera-main-row">
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
            </div>
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

        document.querySelectorAll('.camera-zoom-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.camera-zoom-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                zoomLevel = parseFloat(this.dataset.zoom);
                applyFilters();
            });
        });

        const bs = document.getElementById('camBrightness');
        const cs = document.getElementById('camContrast');
        const ss = document.getElementById('camSaturation');
        bs.addEventListener('input', function() {
            brightness = parseInt(this.value, 10);
            document.getElementById('camBrightnessVal').textContent = brightness;
            applyFilters();
        });
        cs.addEventListener('input', function() {
            contrast = parseInt(this.value, 10);
            document.getElementById('camContrastVal').textContent = contrast;
            applyFilters();
        });
        ss.addEventListener('input', function() {
            saturation = parseInt(this.value, 10);
            document.getElementById('camSaturationVal').textContent = saturation;
            applyFilters();
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