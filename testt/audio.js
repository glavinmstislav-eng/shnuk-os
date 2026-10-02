// audio.js — Аудиоплеер Shnuk OS

(function() {
    'use strict';

    let isOpen = false;
    let audioEl = null;
    let currentFile = null;
    let pendingSeekPct = null;
    let isClosing = false;
    let isSeeking = false;
    let isDraggingSlider = false;

    function warn() {
        try { console.warn.apply(console, ['[Audio]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    function openAudio(fileData) {
        const old = document.getElementById('audioApp');
        if (old) {
            stopPlayback();
            if (old.parentNode) old.parentNode.removeChild(old);
        }
        isClosing = false;
        if (fileData) currentFile = fileData;
        createUI();
    }

    function closeAudio() {
        isOpen = false;
        isClosing = true;

        const el = document.getElementById('audioApp');
        if (!el) {
            stopPlayback();
            window.dispatchEvent(new CustomEvent('shnuk:audio-closed'));
            return;
        }

        if (window.ShnukCloseAnimation) {
            window.ShnukCloseAnimation(el, 'audio', function() {
                stopPlayback();
                el.remove();
                window.dispatchEvent(new CustomEvent('shnuk:audio-closed'));
            });
        } else {
            el.style.opacity = '0';
            setTimeout(function() {
                stopPlayback();
                if (el.parentNode) el.parentNode.removeChild(el);
                window.dispatchEvent(new CustomEvent('shnuk:audio-closed'));
            }, 200);
        }
    }

    function destroy() {
        isOpen = false;
        isClosing = true;
        stopPlayback();
        const el = document.getElementById('audioApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function stopPlayback() {
        if (audioEl) {
            try {
                audioEl.pause();
                audioEl.onerror = null;
                audioEl.onloadedmetadata = null;
                audioEl.ontimeupdate = null;
                audioEl.onseeked = null;
                audioEl.removeAttribute('src');
                audioEl.load();
            } catch(e) {}
            if (audioEl.__blobUrl) {
                try { URL.revokeObjectURL(audioEl.__blobUrl); } catch(e) {}
            }
            audioEl = null;
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
                return new Blob([dataUrl || ''], { type: mime || 'audio/webm' });
            }
            const commaIdx = dataUrl.indexOf(',');
            if (commaIdx === -1) {
                return new Blob([dataUrl], { type: mime || 'audio/webm' });
            }
            const header = dataUrl.substring(5, commaIdx);
            const isBase64 = /;\s*base64/i.test(header);
            const dataPart = dataUrl.substring(commaIdx + 1);
            let realMime = mime || 'audio/webm';
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
            return new Blob([dataUrl || ''], { type: mime || 'audio/webm' });
        }
    }

    function generateFallbackCover() {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, 400, 400);
        grad.addColorStop(0, '#f5f5f5');
        grad.addColorStop(1, '#d8d8d8');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 400, 400);

        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 400; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, 400);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(400, i);
            ctx.stroke();
        }

        ctx.fillStyle = '#cc0000';
        ctx.font = 'bold 180px ST-SimpleSquare, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♪', 200, 210);

        return canvas.toDataURL('image/png');
    }

    function createUI() {
        if (document.getElementById('audioApp')) {
            document.getElementById('audioApp').remove();
        }
        isOpen = true;

        const file = currentFile;
        if (!file) {
            if (window.Win && window.Win.notify) window.Win.notify('Файл не выбран', { type: 'error' });
            return;
        }

        const app = document.createElement('div');
        app.id = 'audioApp';
        app.style.cssText = `
            position: fixed;
            top: var(--livebar-h, 44px);
            left: 0;
            width: 100%;
            height: calc(100% - var(--livebar-h, 44px));
            background: #ffffff;
            z-index: 100050;
            display: flex;
            flex-direction: column;
            font-family: 'ST-SimpleSquare', monospace;
            color: #1a1a1a;
            opacity: 0;
            animation: audioFadeIn 0.3s ease forwards;
            overflow: hidden;
        `;

        if (!document.getElementById('audioStyles')) {
            const style = document.createElement('style');
            style.id = 'audioStyles';
            style.textContent = `
                @keyframes audioFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes waveform-shift {
                    from { transform: translateX(0); }
                    to { transform: translateX(-32px); }
                }
                @keyframes knob-spin {
                    from { transform: translate(-50%, -50%) rotate(0deg); }
                    to { transform: translate(-50%, -50%) rotate(360deg); }
                }

                .audio-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px;
                    background: #f5f5f5;
                    border-bottom: 2px solid #e0e0e0;
                    flex-shrink: 0;
                    color: #1a1a1a;
                }
                .audio-header h1 {
                    font-size: 16px;
                    font-weight: 700;
                    margin: 0;
                    letter-spacing: 0.5px;
                }
                .audio-close-btn {
                    background: #ffffff;
                    border: 2px solid #cc0000;
                    color: #cc0000;
                    font-size: 16px;
                    padding: 4px 12px;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    transition: all 0.2s ease;
                }
                .audio-close-btn:hover {
                    background: #cc0000;
                    color: #ffffff;
                }

                .audio-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 24px;
                    box-sizing: border-box;
                    background: #ffffff;
                    gap: 20px;
                }

                .audio-cover-wrap {
                    width: 240px;
                    height: 240px;
                    position: relative;
                    border: 3px solid #1a1a1a;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
                    background: #f5f5f5;
                    overflow: hidden;
                    flex-shrink: 0;
                }
                .audio-cover-wrap img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    display: block;
                }
                .audio-cover-wrap::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.2), transparent 60%);
                    pointer-events: none;
                }

                .audio-title {
                    font-size: 20px;
                    font-weight: 700;
                    color: #1a1a1a;
                    text-align: center;
                    max-width: 90%;
                    word-break: break-word;
                    line-height: 1.3;
                    padding: 0 8px;
                }

                .audio-slider-wrap {
                    width: 100%;
                    max-width: 480px;
                    padding: 20px 0 6px;
                    box-sizing: border-box;
                    position: relative;
                    user-select: none;
                    -webkit-user-select: none;
                    touch-action: none;
                }

                .audio-slider-track {
                    width: 100%;
                    height: 28px;
                    background: transparent;
                    position: relative;
                    cursor: pointer;
                    touch-action: none;
                    box-sizing: border-box;
                }
                .audio-slider-track::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    right: 0;
                    top: 50%;
                    transform: translateY(-50%);
                    height: 14px;
                    background: #e8e8e8;
                    border: 1px solid #d0d0d0;
                    box-sizing: border-box;
                }

                .audio-slider-progress {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    left: 0;
                    height: 14px;
                    width: 0%;
                    background: #cc0000;
                    overflow: hidden;
                    transition: none;
                    box-sizing: border-box;
                    pointer-events: none;
                }
                .audio-slider-progress.wave-active::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: calc(100% + 32px);
                    height: 100%;
                    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='14' viewBox='0 0 32 14'><polyline points='0,7 8,2 16,12 24,2 32,7' fill='none' stroke='rgba(255,255,255,0.9)' stroke-width='1.6' stroke-linejoin='round'/></svg>");
                    background-repeat: repeat-x;
                    background-size: 32px 14px;
                    animation: waveform-shift 0.8s linear infinite;
                    pointer-events: none;
                }

                .audio-slider-knob {
                    position: absolute;
                    top: 50%;
                    left: 0%;
                    width: 28px;
                    height: 28px;
                    background: #cc0000;
                    border: 2px solid #ffffff;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
                    transform: translate(-50%, -50%);
                    box-sizing: border-box;
                    pointer-events: none;
                }
                .audio-slider-knob.spinning {
                    animation: knob-spin 1.2s linear infinite;
                }

                .audio-time-row {
                    width: 100%;
                    max-width: 480px;
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    color: #666;
                    letter-spacing: 0.5px;
                    margin-top: -10px;
                }

                .audio-play-btn {
                    width: 64px;
                    height: 64px;
                    background: #cc0000;
                    border: none;
                    color: #ffffff;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 22px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s, transform 0.15s;
                    margin-top: 4px;
                    padding: 0;
                    box-shadow: 0 6px 20px rgba(204,0,0,0.3);
                }
                .audio-play-btn:hover { background: #a80000; }
                .audio-play-btn:active { transform: scale(0.94); }
                .audio-play-btn svg {
                    display: block;
                    width: 26px;
                    height: 26px;
                    fill: #ffffff;
                }

                @media (max-width: 500px) {
                    .audio-cover-wrap { width: 180px; height: 180px; }
                    .audio-title { font-size: 16px; }
                    .audio-play-btn { width: 56px; height: 56px; }
                    .audio-slider-knob { width: 24px; height: 24px; }
                }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'audio-header';
        header.innerHTML = `
            <h1>Аудиоплеер</h1>
            <button class="audio-close-btn" id="audioCloseBtn">✕</button>
        `;

        const content = document.createElement('div');
        content.className = 'audio-content';

        const coverWrap = document.createElement('div');
        coverWrap.className = 'audio-cover-wrap';
        const coverImg = document.createElement('img');
        coverImg.alt = 'Обложка';
        coverImg.src = generateFallbackCover();
        coverWrap.appendChild(coverImg);
        content.appendChild(coverWrap);

        const titleEl = document.createElement('div');
        titleEl.className = 'audio-title';
        titleEl.textContent = stripExtension(file.name || 'Без названия');
        content.appendChild(titleEl);

        const sliderWrap = document.createElement('div');
        sliderWrap.className = 'audio-slider-wrap';
        sliderWrap.id = 'audioSliderWrap';

        const track = document.createElement('div');
        track.className = 'audio-slider-track';
        track.id = 'audioTrack';

        const progress = document.createElement('div');
        progress.className = 'audio-slider-progress';
        progress.id = 'audioProgress';
        track.appendChild(progress);

        const knob = document.createElement('div');
        knob.className = 'audio-slider-knob';
        knob.id = 'audioKnob';
        track.appendChild(knob);

        sliderWrap.appendChild(track);
        content.appendChild(sliderWrap);

        const timeRow = document.createElement('div');
        timeRow.className = 'audio-time-row';
        timeRow.innerHTML = `
            <span id="audioCurrentTime">00:00</span>
            <span id="audioTotalTime">00:00</span>
        `;
        content.appendChild(timeRow);

        const playBtn = document.createElement('button');
        playBtn.className = 'audio-play-btn';
        playBtn.id = 'audioPlayBtn';
        playBtn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20"/></svg>';
        content.appendChild(playBtn);

        app.appendChild(header);
        app.appendChild(content);
        document.body.appendChild(app);

        document.getElementById('audioCloseBtn').addEventListener('click', closeAudio);

        audioEl = new Audio();
        audioEl.preload = 'metadata';

        try {
            audioEl.src = file.data;
        } catch(e) {
            warn('Audio src error:', e);
        }

        audioEl.addEventListener('error', function() {
            if (isClosing) return;
            try {
                if (audioEl.__blobRetried) return;
                audioEl.__blobRetried = true;
                const blob = dataURLToBlob(file.data, file.type);
                const blobUrl = URL.createObjectURL(blob);
                audioEl.__blobUrl = blobUrl;
                audioEl.src = blobUrl;
                audioEl.load();
            } catch(e) {
                warn('Blob retry error:', e);
            }
        });

        function applyPendingSeek() {
            if (pendingSeekPct === null) return;
            if (!audioEl || !isFinite(audioEl.duration) || audioEl.duration <= 0) return;
            const pct = pendingSeekPct;
            pendingSeekPct = null;
            try {
                audioEl.currentTime = (pct / 100) * audioEl.duration;
            } catch(e) {}
            updateSliderVisual(pct);
        }

        audioEl.addEventListener('loadedmetadata', function() {
            const total = document.getElementById('audioTotalTime');

            if (audioEl.duration === Infinity || isNaN(audioEl.duration)) {
                const onTimeUpdate = function() {
                    audioEl.removeEventListener('timeupdate', onTimeUpdate);
                    if (audioEl.duration === Infinity || isNaN(audioEl.duration)) return;
                    try { audioEl.currentTime = 0; } catch(e) {}
                    if (total) total.textContent = formatTime(audioEl.duration);
                    applyPendingSeek();
                };
                audioEl.addEventListener('timeupdate', onTimeUpdate);
                try {
                    audioEl.currentTime = 1e101;
                } catch(e) {}
            } else {
                if (total) total.textContent = formatTime(audioEl.duration);
                applyPendingSeek();
            }
        });

        audioEl.addEventListener('durationchange', function() {
            const total = document.getElementById('audioTotalTime');
            if (isFinite(audioEl.duration) && audioEl.duration > 0) {
                if (total) total.textContent = formatTime(audioEl.duration);
            }
        });

        audioEl.addEventListener('timeupdate', function() {
            if (isDraggingSlider || isSeeking) return;
            if (!isFinite(audioEl.duration) || audioEl.duration <= 0) return;
            const pct = (audioEl.currentTime / audioEl.duration) * 100;
            updateSliderVisual(pct);
            const cur = document.getElementById('audioCurrentTime');
            if (cur) cur.textContent = formatTime(audioEl.currentTime);
        });

        audioEl.addEventListener('ended', function() {
            setPlayIcon(false);
            progress.classList.remove('wave-active');
            knob.classList.remove('spinning');
        });

        audioEl.addEventListener('play', function() {
            setPlayIcon(true);
            progress.classList.add('wave-active');
            knob.classList.add('spinning');
        });

        audioEl.addEventListener('pause', function() {
            setPlayIcon(false);
            progress.classList.remove('wave-active');
            knob.classList.remove('spinning');
        });

        playBtn.addEventListener('click', togglePlay);

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
            if (!audioEl) return;
            if (isFinite(audioEl.duration) && audioEl.duration > 0) {
                const wasPlaying = !audioEl.paused;
                isSeeking = true;
                try {
                    const targetTime = (pct / 100) * audioEl.duration;
                    if (wasPlaying) audioEl.pause();
                    audioEl.currentTime = targetTime;
                    if (wasPlaying) audioEl.play().catch(function() {});
                    const onSeeked = function() {
                        audioEl.removeEventListener('seeked', onSeeked);
                        isSeeking = false;
                    };
                    audioEl.addEventListener('seeked', onSeeked);
                    setTimeout(function() { isSeeking = false; }, 500);
                } catch(e) {
                    isSeeking = false;
                }
            } else {
                pendingSeekPct = pct;
            }
            updateSliderVisual(pct);
            const cur = document.getElementById('audioCurrentTime');
            if (cur && isFinite(audioEl.duration) && audioEl.duration > 0) {
                cur.textContent = formatTime((pct / 100) * audioEl.duration);
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
                playBtn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="4.5" height="16"/><rect x="14.5" y="4" width="4.5" height="16"/></svg>';
            } else {
                playBtn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20"/></svg>';
            }
        }

        function togglePlay() {
            if (!audioEl) return;
            if (audioEl.paused) {
                audioEl.play().catch(function(e) {
                    if (window.Win && window.Win.notify) window.Win.notify('Ошибка воспроизведения', { type: 'error' });
                });
            } else {
                audioEl.pause();
            }
        }

        updateSliderVisual(0);
    }

    window.AudioPlayer = {
        open: openAudio,
        close: closeAudio,
        destroy: destroy
    };
    window.audioInit = function(fileData) { openAudio(fileData); };
    window.audio = { open: openAudio, destroy: destroy };

})();