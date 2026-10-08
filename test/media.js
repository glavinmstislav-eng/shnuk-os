// media.js — Видеоплеер Shnuk OS

(function() {
    'use strict';

    let isOpen = false;
    let videoEl = null;
    let currentFile = null;
    let pendingSeekPct = null;
    let isClosing = false;
    let isSeeking = false;
    let isDraggingSlider = false;

    const playbackPositions = {};
    let activePlayerEl = null;

    const FONT_MAIN = "'TTPaplane', monospace";

    function warn() {
        try { console.warn.apply(console, ['[Media]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    function savePlaybackPosition() {
        if (!currentFile || !currentFile.id || !videoEl) return;
        try {
            const t = videoEl.currentTime;
            if (isFinite(t) && t > 0) playbackPositions[currentFile.id] = t;
            else if (t === 0) delete playbackPositions[currentFile.id];
        } catch(e) {}
    }

    function getSavedPosition(fileId) {
        if (!fileId) return 0;
        const v = playbackPositions[fileId];
        return (typeof v === 'number' && isFinite(v)) ? v : 0;
    }

    function openMedia(fileData) {
        const old = document.getElementById('mediaApp');
        if (old) {
            savePlaybackPosition();
            stopPlayback();
            if (old.parentNode) old.parentNode.removeChild(old);
        }
        isClosing = false;
        if (fileData) currentFile = fileData;
        createUI();
    }

    function closeMedia() {
        isOpen = false;
        isClosing = true;

        savePlaybackPosition();
        stopPlayback();

        const el = document.getElementById('mediaApp');
        if (!el) {
            window.dispatchEvent(new CustomEvent('shnuk:media-closed'));
            return;
        }

        el.style.transition = 'opacity 0.3s ease, filter 0.3s ease';
        el.style.opacity = '0';
        el.style.filter = 'blur(12px)';

        setTimeout(function() {
            if (el.parentNode) el.parentNode.removeChild(el);
            window.dispatchEvent(new CustomEvent('shnuk:media-closed'));
        }, 300);
    }

    function destroy() {
        isOpen = false;
        isClosing = true;
        savePlaybackPosition();
        stopPlayback();
        const el = document.getElementById('mediaApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        activePlayerEl = null;
        window.dispatchEvent(new CustomEvent('shnuk:media-closed'));
    }

    function stopPlayback() {
        if (activePlayerEl && activePlayerEl !== videoEl) {
            try { activePlayerEl.pause(); } catch(e) {}
            try {
                activePlayerEl.removeAttribute('src');
                activePlayerEl.load();
            } catch(e) {}
        }

        if (videoEl) {
            try { videoEl.pause(); } catch(e) {}
            try {
                videoEl.onerror = null;
                videoEl.onloadedmetadata = null;
                videoEl.ontimeupdate = null;
                videoEl.onseeked = null;
                videoEl.onended = null;
                videoEl.onplay = null;
                videoEl.onpause = null;
                videoEl.removeAttribute('src');
                videoEl.load();
            } catch(e) {}
            if (videoEl.__blobUrl) {
                try { URL.revokeObjectURL(videoEl.__blobUrl); } catch(e) {}
            }
            videoEl = null;
        }
        if (activePlayerEl) {
            try { activePlayerEl.pause(); } catch(e) {}
            activePlayerEl = null;
        }
        pendingSeekPct = null;
        isSeeking = false;
        isDraggingSlider = false;
    }

    function stripExtension(name) {
        if (!name) return '';
        const idx = name.lastIndexOf('.');
        if (idx === -1) return name;
        return name.substring(0, idx);
    }

    function formatTime(sec) {
        if (!isFinite(sec) || sec < 0) sec = 0;
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function dataURLToBlob(dataUrl, mime) {
        try {
            if (!dataUrl || dataUrl.indexOf('data:') !== 0) {
                return new Blob([dataUrl || ''], { type: mime || 'video/mp4' });
            }
            const commaIdx = dataUrl.indexOf(',');
            if (commaIdx === -1) {
                return new Blob([dataUrl], { type: mime || 'video/mp4' });
            }
            const header = dataUrl.substring(5, commaIdx);
            const isBase64 = /;\s*base64/i.test(header);
            const dataPart = dataUrl.substring(commaIdx + 1);
            let realMime = mime || 'video/mp4';
            const mimeMatch = header.match(/^([^;]+)/);
            if (mimeMatch && mimeMatch[1]) realMime = mimeMatch[1];

            if (!isBase64) {
                let text = dataPart;
                try { text = decodeURIComponent(dataPart); } catch(e) {}
                return new Blob([text], { type: realMime });
            }
            const binary = atob(dataPart);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new Blob([bytes], { type: realMime });
        } catch(e) {
            return new Blob([dataUrl || ''], { type: mime || 'video/mp4' });
        }
    }

    function createUI() {
        if (document.getElementById('mediaApp')) {
            document.getElementById('mediaApp').remove();
        }
        isOpen = true;

        const file = currentFile;
        if (!file) {
            if (window.Win && window.Win.notify) window.Win.notify('Файл не выбран', { type: 'error' });
            return;
        }

        const savedPos = getSavedPosition(file.id);

        const app = document.createElement('div');
        app.id = 'mediaApp';
        app.style.cssText = `
            position: fixed;
            top: var(--livebar-h, 44px);
            left: 0;
            width: 100%;
            height: calc(100% - var(--livebar-h, 44px));
            background: #000000;
            z-index: 100050;
            display: flex;
            flex-direction: column;
            font-family: ${FONT_MAIN};
            color: #ffffff;
            opacity: 0;
            animation: mediaFadeIn 0.3s ease forwards;
            overflow: hidden;
        `;

        if (!document.getElementById('mediaStyles')) {
            const style = document.createElement('style');
            style.id = 'mediaStyles';
            style.textContent = `
                @keyframes mediaFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes mediaControlsIn {
                    from { opacity: 0; filter: blur(10px); transform: translateY(10px); }
                    to { opacity: 1; filter: blur(0); transform: translateY(0); }
                }

                #mediaApp, #mediaApp * {
                    font-family: ${FONT_MAIN} !important;
                }

                .media-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px;
                    background: #0a0a0a;
                    border-bottom: 2px solid #1a1a1a;
                    flex-shrink: 0;
                    color: #ffffff;
                    gap: 10px;
                }
                .media-header-title {
                    font-size: 15px;
                    font-weight: 700;
                    margin: 0;
                    letter-spacing: 0.4px;
                    flex: 1;
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: #ffffff;
                }
                .media-close-btn {
                    background: #000000;
                    border: 2px solid #cc0000;
                    color: #cc0000;
                    font-size: 16px;
                    padding: 4px 12px;
                    cursor: pointer;
                    font-family: ${FONT_MAIN};
                    transition: all 0.2s ease;
                    flex-shrink: 0;
                }
                .media-close-btn:hover {
                    background: #cc0000;
                    color: #ffffff;
                }

                .media-stage {
                    flex: 1;
                    position: relative;
                    background: #000000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 0;
                    overflow: hidden;
                }
                .media-stage video {
                    max-width: 100%;
                    max-height: 100%;
                    width: auto;
                    height: auto;
                    display: block;
                    background: #000000;
                    outline: none;
                }
                .media-stage .media-error {
                    position: absolute;
                    top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    color: #888;
                    font-size: 14px;
                    text-align: center;
                    padding: 20px;
                    font-family: ${FONT_MAIN};
                }

                .media-controls {
                    flex-shrink: 0;
                    padding: 14px 20px 20px;
                    background: #0a0a0a;
                    border-top: 2px solid #1a1a1a;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    animation: mediaControlsIn 0.4s cubic-bezier(0.22, 1, 0.36, 1);
                }

                .media-slider-wrap {
                    position: relative;
                    padding: 6px 0;
                    user-select: none;
                    -webkit-user-select: none;
                    touch-action: none;
                }
                .media-slider-track {
                    width: 100%;
                    height: 22px;
                    position: relative;
                    cursor: pointer;
                    touch-action: none;
                    box-sizing: border-box;
                }
                .media-slider-track::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    right: 0;
                    top: 50%;
                    transform: translateY(-50%);
                    height: 6px;
                    background: #222222;
                    box-sizing: border-box;
                    z-index: 1;
                }
                .media-slider-progress {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    left: 0;
                    height: 6px;
                    width: 0%;
                    background: #cc0000;
                    pointer-events: none;
                    z-index: 2;
                }
                .media-slider-buffer {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    left: 0;
                    height: 6px;
                    width: 0%;
                    background: #333333;
                    pointer-events: none;
                    z-index: 1;
                }
                .media-slider-knob {
                    position: absolute;
                    top: 50%;
                    left: 0%;
                    width: 18px;
                    height: 18px;
                    background: #cc0000;
                    border: 2px solid #ffffff;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                    transform: translate(-50%, -50%);
                    box-sizing: border-box;
                    pointer-events: none;
                    z-index: 3;
                }

                .media-time-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    color: #aaaaaa;
                    letter-spacing: 0.5px;
                    font-variant-numeric: tabular-nums;
                }

                .media-buttons-row {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 26px;
                    margin-top: 6px;
                }
                .media-play-btn {
                    width: 60px;
                    height: 60px;
                    background: #cc0000;
                    border: none;
                    color: #ffffff;
                    cursor: pointer;
                    font-family: ${FONT_MAIN};
                    font-size: 22px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s, transform 0.15s;
                    padding: 0;
                    box-shadow: 0 6px 20px rgba(204,0,0,0.4);
                    border-radius: 0;
                }
                .media-play-btn:hover { background: #a80000; }
                .media-play-btn:active { transform: scale(0.94); }
                .media-play-btn svg {
                    display: block;
                    width: 26px;
                    height: 26px;
                    fill: #ffffff;
                }

                .media-skip-btn {
                    width: 40px;
                    height: 40px;
                    background: none;
                    border: none;
                    color: #ffffff;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: color 0.2s, transform 0.15s;
                    padding: 0;
                    border-radius: 0;
                    opacity: 0.75;
                }
                .media-skip-btn:hover {
                    color: #cc0000;
                    opacity: 1;
                }
                .media-skip-btn:active { transform: scale(0.9); }
                .media-skip-btn svg {
                    display: block;
                    width: 26px;
                    height: 26px;
                    fill: none;
                    stroke: currentColor;
                    stroke-width: 2.2;
                    stroke-linecap: round;
                    stroke-linejoin: round;
                }

                @media (max-width: 500px) {
                    .media-header { padding: 10px 12px; }
                    .media-header-title { font-size: 13px; }
                    .media-close-btn { font-size: 14px; padding: 4px 10px; }
                    .media-controls { padding: 10px 14px 16px; }
                    .media-play-btn { width: 52px; height: 52px; }
                    .media-play-btn svg { width: 22px; height: 22px; }
                    .media-skip-btn { width: 36px; height: 36px; }
                    .media-skip-btn svg { width: 22px; height: 22px; }
                    .media-buttons-row { gap: 20px; }
                }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'media-header';

        const title = document.createElement('h1');
        title.className = 'media-header-title';
        title.textContent = stripExtension(file.name || 'Видео');
        title.title = file.name || '';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'media-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Закрыть';
        closeBtn.addEventListener('click', closeMedia);
        header.appendChild(closeBtn);

        const stage = document.createElement('div');
        stage.className = 'media-stage';

        videoEl = document.createElement('video');
        videoEl.controls = false;
        videoEl.preload = 'metadata';
        videoEl.playsInline = true;
        videoEl.setAttribute('playsinline', '');
        videoEl.setAttribute('webkit-playsinline', '');
        videoEl.style.display = 'block';

        const errorEl = document.createElement('div');
        errorEl.className = 'media-error';
        errorEl.style.display = 'none';
        errorEl.textContent = 'Не удалось воспроизвести видео';

        stage.appendChild(videoEl);
        stage.appendChild(errorEl);

        const controls = document.createElement('div');
        controls.className = 'media-controls';

        const sliderWrap = document.createElement('div');
        sliderWrap.className = 'media-slider-wrap';

        const track = document.createElement('div');
        track.className = 'media-slider-track';

        const buffer = document.createElement('div');
        buffer.className = 'media-slider-buffer';

        const progress = document.createElement('div');
        progress.className = 'media-slider-progress';

        const knob = document.createElement('div');
        knob.className = 'media-slider-knob';

        track.appendChild(buffer);
        track.appendChild(progress);
        track.appendChild(knob);
        sliderWrap.appendChild(track);
        controls.appendChild(sliderWrap);

        const timeRow = document.createElement('div');
        timeRow.className = 'media-time-row';
        timeRow.innerHTML = `
            <span id="mediaCurrentTime">00:00</span>
            <span id="mediaTotalTime">00:00</span>
        `;
        controls.appendChild(timeRow);

        const buttonsRow = document.createElement('div');
        buttonsRow.className = 'media-buttons-row';

        // === Простые стрелки влево и вправо ===
        const skipBackBtn = document.createElement('button');
        skipBackBtn.className = 'media-skip-btn';
        skipBackBtn.title = 'Назад на 10 секунд';
        skipBackBtn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="20" y1="12" x2="4" y2="12"/><polyline points="11 5 4 12 11 19"/></svg>';
        buttonsRow.appendChild(skipBackBtn);

        const playBtn = document.createElement('button');
        playBtn.className = 'media-play-btn';
        playBtn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="7,5 19,12 7,19"/></svg>';
        buttonsRow.appendChild(playBtn);

        const skipFwdBtn = document.createElement('button');
        skipFwdBtn.className = 'media-skip-btn';
        skipFwdBtn.title = 'Вперёд на 10 секунд';
        skipFwdBtn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="13 5 20 12 13 19"/></svg>';
        buttonsRow.appendChild(skipFwdBtn);

        controls.appendChild(buttonsRow);

        app.appendChild(header);
        app.appendChild(stage);
        app.appendChild(controls);
        document.body.appendChild(app);

        try {
            videoEl.src = file.data;
        } catch(e) {
            warn('Video src error:', e);
        }

        videoEl.addEventListener('error', function() {
            if (isClosing) return;
            try {
                if (videoEl.__blobRetried) {
                    errorEl.style.display = 'block';
                    return;
                }
                videoEl.__blobRetried = true;
                const blob = dataURLToBlob(file.data, file.type);
                const blobUrl = URL.createObjectURL(blob);
                videoEl.__blobUrl = blobUrl;
                videoEl.src = blobUrl;
                videoEl.load();
            } catch(e) {
                warn('Blob retry error:', e);
                errorEl.style.display = 'block';
            }
        });

        function applySavedPosition() {
            if (savedPos > 0 && isFinite(videoEl.duration) && videoEl.duration > 0) {
                const target = Math.min(savedPos, videoEl.duration - 0.3);
                if (target > 0) {
                    try { videoEl.currentTime = target; } catch(e) {}
                    const pct = (target / videoEl.duration) * 100;
                    updateSliderVisual(pct);
                    const cur = document.getElementById('mediaCurrentTime');
                    if (cur) cur.textContent = formatTime(target);
                }
            }
        }

        function applyPendingSeek() {
            if (pendingSeekPct === null) return;
            if (!videoEl || !isFinite(videoEl.duration) || videoEl.duration <= 0) return;
            const pct = pendingSeekPct;
            pendingSeekPct = null;
            try {
                videoEl.currentTime = (pct / 100) * videoEl.duration;
            } catch(e) {}
            updateSliderVisual(pct);
        }

        videoEl.addEventListener('loadedmetadata', function() {
            const total = document.getElementById('mediaTotalTime');
            if (isFinite(videoEl.duration) && videoEl.duration > 0) {
                if (total) total.textContent = formatTime(videoEl.duration);
                applyPendingSeek();
                applySavedPosition();
            } else {
                const onTimeUpdate = function() {
                    videoEl.removeEventListener('timeupdate', onTimeUpdate);
                    if (!isFinite(videoEl.duration) || videoEl.duration <= 0) return;
                    if (total) total.textContent = formatTime(videoEl.duration);
                    try { videoEl.currentTime = savedPos > 0 ? savedPos : 0; } catch(e) {}
                    applyPendingSeek();
                    applySavedPosition();
                };
                videoEl.addEventListener('timeupdate', onTimeUpdate);
            }
        });

        videoEl.addEventListener('durationchange', function() {
            const total = document.getElementById('mediaTotalTime');
            if (isFinite(videoEl.duration) && videoEl.duration > 0) {
                if (total) total.textContent = formatTime(videoEl.duration);
            }
        });

        videoEl.addEventListener('progress', function() {
            if (!isFinite(videoEl.duration) || videoEl.duration <= 0) return;
            if (videoEl.buffered.length > 0) {
                const end = videoEl.buffered.end(videoEl.buffered.length - 1);
                const pct = (end / videoEl.duration) * 100;
                buffer.style.width = pct + '%';
            }
        });

        videoEl.addEventListener('timeupdate', function() {
            if (isDraggingSlider || isSeeking) return;
            if (!isFinite(videoEl.duration) || videoEl.duration <= 0) return;
            const pct = (videoEl.currentTime / videoEl.duration) * 100;
            updateSliderVisual(pct);
            const cur = document.getElementById('mediaCurrentTime');
            if (cur) cur.textContent = formatTime(videoEl.currentTime);
        });

        videoEl.addEventListener('ended', function() {
            setPlayIcon(false);
            if (currentFile && currentFile.id) {
                delete playbackPositions[currentFile.id];
            }
        });

        videoEl.addEventListener('play', function() {
            setPlayIcon(true);
        });

        videoEl.addEventListener('pause', function() {
            setPlayIcon(false);
        });

        videoEl.addEventListener('pause', savePlaybackPosition);

        playBtn.addEventListener('click', togglePlay);
        skipBackBtn.addEventListener('click', function() {
            if (!videoEl) return;
            try { videoEl.currentTime = Math.max(0, videoEl.currentTime - 10); } catch(e) {}
        });
        skipFwdBtn.addEventListener('click', function() {
            if (!videoEl) return;
            try {
                const d = isFinite(videoEl.duration) ? videoEl.duration : videoEl.currentTime + 10;
                videoEl.currentTime = Math.min(d, videoEl.currentTime + 10);
            } catch(e) {}
        });

        videoEl.addEventListener('click', togglePlay);

        function getPercentFromEvent(e) {
            const rect = track.getBoundingClientRect();
            let clientX;
            if (e.touches && e.touches[0]) clientX = e.touches[0].clientX;
            else if (e.changedTouches && e.changedTouches[0]) clientX = e.changedTouches[0].clientX;
            else clientX = e.clientX;
            let pct = ((clientX - rect.left) / rect.width) * 100;
            if (pct < 0) pct = 0;
            if (pct > 100) pct = 100;
            return pct;
        }

        function seekToPct(pct) {
            if (!videoEl) return;
            if (isFinite(videoEl.duration) && videoEl.duration > 0) {
                const wasPlaying = !videoEl.paused;
                isSeeking = true;
                try {
                    const targetTime = (pct / 100) * videoEl.duration;
                    if (wasPlaying) videoEl.pause();
                    videoEl.currentTime = targetTime;
                    if (wasPlaying) {
                        const p = videoEl.play();
                        if (p && typeof p.catch === 'function') p.catch(function() {});
                    }
                    const onSeeked = function() {
                        videoEl.removeEventListener('seeked', onSeeked);
                        isSeeking = false;
                    };
                    videoEl.addEventListener('seeked', onSeeked);
                    setTimeout(function() { isSeeking = false; }, 500);
                } catch(e) {
                    isSeeking = false;
                }
            } else {
                pendingSeekPct = pct;
            }
            updateSliderVisual(pct);
            const cur = document.getElementById('mediaCurrentTime');
            if (cur && isFinite(videoEl.duration) && videoEl.duration > 0) {
                cur.textContent = formatTime((pct / 100) * videoEl.duration);
            }
        }

        function onDown(e) {
            isDraggingSlider = true;
            seekToPct(getPercentFromEvent(e));
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onUp);
            if (e.cancelable) e.preventDefault();
        }
        function onMove(e) {
            if (!isDraggingSlider) return;
            seekToPct(getPercentFromEvent(e));
            if (e.cancelable) e.preventDefault();
        }
        function onUp() {
            isDraggingSlider = false;
            isSeeking = true;
            setTimeout(function() { isSeeking = false; }, 300);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onUp);
        }

        track.addEventListener('mousedown', onDown);
        track.addEventListener('touchstart', onDown, { passive: false });

        function updateSliderVisual(pct) {
            if (progress) progress.style.width = pct + '%';
            if (knob) knob.style.left = pct + '%';
        }

        function setPlayIcon(playing) {
            if (playing) {
                playBtn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6.5" y="5" width="4" height="14"/><rect x="13.5" y="5" width="4" height="14"/></svg>';
            } else {
                playBtn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="7,5 19,12 7,19"/></svg>';
            }
        }

        function togglePlay() {
            if (!videoEl) return;
            if (videoEl.paused) {
                const p = videoEl.play();
                if (p && typeof p.catch === 'function') {
                    p.catch(function() {
                        if (window.Win && window.Win.notify) {
                            window.Win.notify('Не удалось начать воспроизведение', { type: 'error' });
                        }
                    });
                }
            } else {
                videoEl.pause();
            }
        }

        const onEsc = function(e) {
            if (e.key === 'Escape' && !isClosing) {
                closeMedia();
                document.removeEventListener('keydown', onEsc);
            }
        };
        document.addEventListener('keydown', onEsc);
        app.__escHandler = onEsc;

        updateSliderVisual(0);
    }

    window.MediaPlayer = {
        open: openMedia,
        close: closeMedia,
        destroy: destroy
    };
    window.mediaInit = function(fileData) { openMedia(fileData); };
    window.media = { open: openMedia, destroy: destroy };

})();