// sh.js
(function() {
    'use strict';

    let container = null;
    let canvas = null;
    let ctx = null;
    let animId = null;
    let isInitialized = false;

    let audioCtx = null;
    let analyser = null;
    let stream = null;
    let freqData = null;

    let state = 'setup';
    let noiseLevel = 0;
    let noiseLimit = 0.35;
    let overLimitFrames = 0;
    const OVER_LIMIT_THRESHOLD = 30;

    let rope = null;
    let lastTime = 0;

    const FONT = "'ST-SimpleSquare', 'TTPaplane', monospace";

    function log() {
        try { console.log.apply(console, ['[Noise]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    async function initAudio() {
        if (audioCtx) return true;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AC();
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = audioCtx.createMediaStreamSource(stream);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.7;
            source.connect(analyser);
            freqData = new Uint8Array(analyser.frequencyBinCount);
            return true;
        } catch(e) {
            log('initAudio error', e);
            return false;
        }
    }

    function stopAudio() {
        try {
            if (stream) {
                stream.getTracks().forEach(function(t) { t.stop(); });
                stream = null;
            }
        } catch(e) {}
        try {
            if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
        } catch(e) {}
        audioCtx = null;
        analyser = null;
        freqData = null;
    }

    function measureNoise() {
        if (!analyser || !freqData) return 0;
        analyser.getByteTimeDomainData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) {
            const v = (freqData[i] - 128) / 128;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / freqData.length);
        return Math.min(1, rms * 4);
    }

    function buildUI() {
        container.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.id = 'shWrap';
        wrap.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: #000000;
            overflow: hidden;
            font-family: ${FONT};
            color: #ffffff;
            touch-action: none;
            user-select: none;
            -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
        `;

        canvas = document.createElement('canvas');
        canvas.id = 'shCanvas';
        canvas.style.cssText = `
            display: block;
            width: 100%; height: 100%;
            background: #000000;
            touch-action: none;
        `;

        const hud = document.createElement('div');
        hud.id = 'shHud';
        hud.style.cssText = `
            position: absolute;
            top: 16px; left: 0;
            width: 100%;
            padding: 0 20px;
            display: flex;
            justify-content: flex-start;
            align-items: flex-start;
            pointer-events: none;
            z-index: 5;
            box-sizing: border-box;
            font-family: ${FONT};
            color: #ffffff;
        `;
        hud.innerHTML = `
            <div>
                <div style="font-size:10px;opacity:0.5;letter-spacing:1px;">ШУМ</div>
                <div id="shNoiseVal" style="font-size:22px;font-weight:700;">0.00</div>
            </div>
        `;

        const setup = document.createElement('div');
        setup.id = 'shSetup';
        setup.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            box-sizing: border-box;
            z-index: 10;
            background: #000000;
            font-family: ${FONT};
            color: #ffffff;
            text-align: center;
        `;
        setup.innerHTML = `
            <div style="font-size:32px;font-weight:700;letter-spacing:3px;">ШУМОМЕР</div>
            <div style="font-size:13px;opacity:0.6;margin-top:14px;max-width:320px;line-height:1.6;">
                Шарик висит на верёвке. Чем громче шум — тем выше он подпрыгивает.
                Если шум превышает предел — шарик лопается.
            </div>
            <div style="margin-top:24px;font-size:12px;opacity:0.6;letter-spacing:1px;">ПРЕДЕЛ ШУМА</div>
            <input id="shLimitInput" type="range" min="10" max="80" value="35" style="width:220px;margin-top:8px;accent-color:#cc0000;" />
            <div id="shLimitDisplay" style="font-size:16px;font-weight:700;margin-top:6px;">0.35</div>
            <button id="shStartBtn" style="
                margin-top: 30px;
                padding: 14px 44px;
                background: #cc0000;
                border: none;
                color: #ffffff;
                font-family: ${FONT};
                font-size: 15px;
                font-weight: 700;
                letter-spacing: 2px;
                cursor: pointer;
            ">НАЧАТЬ</button>
        `;

        const popper = document.createElement('div');
        popper.id = 'shPopper';
        popper.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #000000;
            z-index: 20;
            font-family: ${FONT};
            color: #ffffff;
        `;
        popper.innerHTML = `
            <div style="font-size:56px;font-weight:700;color:#ffffff;letter-spacing:6px;">ПОТРАЧЕНО</div>
            <button id="shRestartBtn" style="
                margin-top: 32px;
                padding: 12px 36px;
                background: none;
                border: 2px solid #ffffff;
                color: #ffffff;
                font-family: ${FONT};
                font-size: 14px;
                font-weight: 700;
                letter-spacing: 2px;
                cursor: pointer;
            ">ЗАНОВО</button>
        `;

        wrap.appendChild(canvas);
        wrap.appendChild(hud);
        wrap.appendChild(setup);
        wrap.appendChild(popper);
        container.appendChild(wrap);

        ctx = canvas.getContext('2d');

        const limitInput = document.getElementById('shLimitInput');
        const limitDisplay = document.getElementById('shLimitDisplay');
        limitInput.addEventListener('input', function() {
            const v = parseInt(this.value, 10);
            noiseLimit = v / 100;
            limitDisplay.textContent = noiseLimit.toFixed(2);
        });

        document.getElementById('shStartBtn').addEventListener('click', startGame);
        document.getElementById('shRestartBtn').addEventListener('click', function() {
            document.getElementById('shPopper').style.display = 'none';
            document.getElementById('shSetup').style.display = 'flex';
            state = 'setup';
        });

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
    }

    function resizeCanvas() {
        if (!canvas || !container) return;
        const wrap = document.getElementById('shWrap');
        if (!wrap) return;
        const rect = wrap.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (rope) {
            rope.anchorX = rect.width / 2;
            rope.anchorY = rect.height * 0.18;
            rope.restLength = rect.height * 0.32;
        }
    }

    async function startGame() {
        const ok = await initAudio();
        if (!ok) {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Нет доступа к микрофону', { type: 'error' });
            }
            return;
        }

        const wrap = document.getElementById('shWrap');
        const rect = wrap.getBoundingClientRect();

        rope = {
            anchorX: rect.width / 2,
            anchorY: rect.height * 0.18,
            restLength: rect.height * 0.32,
            angle: 0.2,
            angVel: 0,
            damping: 0.992,
            gravity: 1200,
            ballRadius: 24,
            ballColor: '#cc0000'
        };

        state = 'running';
        overLimitFrames = 0;
        document.getElementById('shSetup').style.display = 'none';
        lastTime = performance.now();
        loop();
    }

    function updatePhysics(dt) {
        if (state !== 'running' || !rope) return;

        const damp = Math.pow(rope.damping, dt * 60);
        rope.angVel *= damp;

        const angAccel = -(rope.gravity / rope.restLength) * Math.sin(rope.angle);
        rope.angVel += angAccel * dt;
        rope.angle += rope.angVel * dt;

        const kick = noiseLevel * 8;
        if (kick > 0.1) {
            rope.angVel += (Math.random() - 0.5) * kick;
            rope.angVel += noiseLevel * 4 * (rope.angle > 0 ? -1 : 1);
        }

        if (noiseLevel > noiseLimit) {
            overLimitFrames++;
            if (overLimitFrames > OVER_LIMIT_THRESHOLD) {
                popBall();
            }
        } else {
            overLimitFrames = Math.max(0, overLimitFrames - 1);
        }
    }

    function popBall() {
        state = 'popped';
        rope = null;
        document.getElementById('shPopper').style.display = 'flex';
        stopAudio();
    }

    function draw() {
        if (!ctx || !canvas) return;
        const wrap = document.getElementById('shWrap');
        if (!wrap) return;
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);

        if (state === 'popped' || !rope) return;

        const bx = rope.anchorX + Math.sin(rope.angle) * rope.restLength;
        const by = rope.anchorY + Math.cos(rope.angle) * rope.restLength;

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rope.anchorX, rope.anchorY);
        ctx.lineTo(bx, by);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(rope.anchorX, rope.anchorY, 6, 0, Math.PI * 2);
        ctx.fill();

        const color = (noiseLevel > noiseLimit * 0.8) ? '#ff2200' : '#cc0000';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(bx, by, rope.ballRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, by, rope.ballRadius, 0, Math.PI * 2);
        ctx.stroke();
    }

    function updateHud() {
        const noiseEl = document.getElementById('shNoiseVal');
        if (noiseEl) noiseEl.textContent = noiseLevel.toFixed(2);
    }

    function loop() {
        animId = requestAnimationFrame(loop);
        try {
            const now = performance.now();
            let dt = (now - lastTime) / 1000;
            lastTime = now;
            if (dt > 0.1) dt = 0.1;

            if (state === 'running') {
                noiseLevel = measureNoise();
                updatePhysics(dt);
            }

            draw();
            updateHud();
        } catch(e) {
            log('loop error', e);
        }
    }

    function init() {
        container = document.getElementById('gameCenterGameContainer');
        if (!container) {
            log('container not found');
            return false;
        }
        buildUI();
        isInitialized = true;
        return true;
    }

    function destroy() {
        isInitialized = false;
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        stopAudio();
        window.removeEventListener('resize', resizeCanvas);
        if (container) container.innerHTML = '';
        container = null;
        canvas = null;
        ctx = null;
        rope = null;
        state = 'setup';
    }

    window.shInit = init;
    window.Sh = { destroy: destroy, init: init };

})();