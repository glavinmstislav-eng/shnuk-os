// shnuk-pc-mode.js
(function() {
    'use strict';

    const FONT_MAIN = "'TTPaplane', monospace";
    const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const TOKEN_LEN = 6;
    const ICE_TIMEOUT_MS = 12000;
    const CHANNEL_TIMEOUT_MS = 45000;

    const ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        {
            urls: [
                'turn:openrelay.metered.ca:80',
                'turn:openrelay.metered.ca:443',
                'turns:openrelay.metered.ca:443?transport=tcp'
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ];

    function log() {
        try { console.log.apply(console, ['[PC-Mode]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    function generateToken() {
        let out = '';
        const arr = new Uint8Array(TOKEN_LEN);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(arr);
        } else {
            for (let i = 0; i < TOKEN_LEN; i++) arr[i] = Math.floor(Math.random() * 256);
        }
        for (let i = 0; i < TOKEN_LEN; i++) {
            out += TOKEN_ALPHABET[arr[i] % TOKEN_ALPHABET.length];
        }
        return out;
    }

    function isPC() {
        if (window.matchMedia) {
            const coarse = window.matchMedia('(pointer: coarse)').matches;
            const hover = window.matchMedia('(hover: hover)').matches;
            const touchPoints = navigator.maxTouchPoints || 0;
            if (!coarse && hover && touchPoints === 0) return true;
        }
        const ua = navigator.userAgent || '';
        if (/Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(ua)) return false;
        if (/Windows|Macintosh|Linux|X11/i.test(ua)) return true;
        return false;
    }

    function base64UrlEncode(str) {
        try {
            const bytes = new TextEncoder().encode(str);
            let binary = '';
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        } catch(e) {
            return '';
        }
    }

    function base64UrlDecode(b64) {
        try {
            let s = String(b64).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
            while (s.length % 4) s += '=';
            const binary = atob(s);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new TextDecoder().decode(bytes);
        } catch(e) {
            return '';
        }
    }

    function waitIceComplete(pc) {
        return new Promise(function(resolve) {
            if (pc.iceGatheringState === 'complete') {
                resolve(true);
                return;
            }
            let resolved = false;
            const finish = function() {
                if (resolved) return;
                resolved = true;
                pc.removeEventListener('icegatheringstatechange', onState);
                pc.removeEventListener('icecandidate', onCand);
                resolve(true);
            };
            const onState = function() {
                if (pc.iceGatheringState === 'complete') finish();
            };
            const onCand = function(e) {
                if (e && e.candidate && e.candidate.type === 'relay') {
                    setTimeout(finish, 700);
                }
            };
            pc.addEventListener('icegatheringstatechange', onState);
            pc.addEventListener('icecandidate', onCand);
            setTimeout(finish, ICE_TIMEOUT_MS);
        });
    }

    function injectStyles() {
        if (document.getElementById('pcModeStyles')) return;
        const st = document.createElement('style');
        st.id = 'pcModeStyles';
        st.textContent = `
            #pcModeOverlay {
                position: fixed;
                inset: 0;
                background: #ffffff;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 24px;
                box-sizing: border-box;
                font-family: ${FONT_MAIN};
                color: #1a1a1a;
                opacity: 0;
                animation: pcModeFadeIn 0.4s ease forwards;
                overflow-y: auto;
            }
            #pcModeOverlay, #pcModeOverlay * {
                font-family: ${FONT_MAIN} !important;
                box-sizing: border-box;
            }
            @keyframes pcModeFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes pcModeFadeOut { from { opacity: 1; } to { opacity: 0; } }
            #pcModeOverlay.closing { animation: pcModeFadeOut 0.3s ease forwards; }

            .pc-mode-card {
                width: 100%;
                max-width: 520px;
                background: #f5f5f5;
                border: 2px solid #e0e0e0;
                padding: 26px 24px 22px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                margin: auto;
            }

            .pc-mode-logo {
                font-size: 24px;
                font-weight: 700;
                letter-spacing: 1px;
                color: #cc0000;
                text-align: center;
            }
            .pc-mode-title {
                font-size: 13px;
                color: #666666;
                text-align: center;
                line-height: 1.5;
                margin-top: -12px;
            }
            .pc-mode-label {
                font-size: 11px;
                color: #888888;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                font-weight: 700;
            }
            .pc-mode-steps {
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 12px 14px;
                background: #ffffff;
                border-left: 3px solid #cc0000;
                font-size: 12px;
                color: #333333;
                line-height: 1.5;
            }
            .pc-mode-steps b { color: #cc0000; }

            .pc-mode-link {
                width: 100%;
                min-height: 90px;
                max-height: 160px;
                padding: 10px 12px;
                border: 2px solid #e0e0e0;
                background: #ffffff;
                color: #1a1a1a;
                font-family: 'Courier New', monospace;
                font-size: 10px;
                line-height: 1.4;
                resize: vertical;
                outline: none;
                word-break: break-all;
                -webkit-user-select: text;
                user-select: text;
                transition: border-color 0.2s;
            }
            .pc-mode-link:focus { border-color: #cc0000; }

            .pc-mode-code-display {
                font-family: 'Courier New', monospace;
                font-size: 40px;
                font-weight: 700;
                letter-spacing: 9px;
                text-align: center;
                color: #cc0000;
                padding: 12px 10px;
                background: #ffffff;
                border: 2px dashed #cc0000;
                user-select: text;
                -webkit-user-select: text;
                cursor: text;
                word-break: break-all;
            }

            .pc-mode-btn {
                padding: 13px 20px;
                border: none;
                background: #cc0000;
                color: #ffffff;
                font-family: ${FONT_MAIN};
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 1px;
                cursor: pointer;
                transition: background 0.2s;
                text-transform: uppercase;
            }
            .pc-mode-btn:hover { background: #990000; }
            .pc-mode-btn:active { transform: scale(0.98); }
            .pc-mode-btn.secondary {
                background: #ffffff;
                color: #1a1a1a;
                border: 2px solid #e0e0e0;
            }
            .pc-mode-btn.secondary:hover {
                background: #f0f0f0;
                color: #cc0000;
                border-color: #cc0000;
            }
            .pc-mode-btn:disabled {
                background: #cccccc;
                color: #ffffff;
                cursor: not-allowed;
            }

            .pc-mode-hint {
                font-size: 11px;
                color: #888888;
                line-height: 1.5;
                text-align: center;
            }
            .pc-mode-error {
                font-size: 12px;
                color: #cc0000;
                text-align: center;
                min-height: 16px;
                line-height: 1.4;
            }
            .pc-mode-status {
                font-size: 12px;
                color: #666666;
                text-align: center;
                min-height: 16px;
                line-height: 1.4;
                transition: color 0.2s;
            }
            .pc-mode-status.ok { color: #2e7d32; }

            @media (max-width: 500px) {
                .pc-mode-card { padding: 18px 16px; }
                .pc-mode-logo { font-size: 20px; }
                .pc-mode-code-display { font-size: 28px; letter-spacing: 5px; padding: 10px 8px; }
                .pc-mode-link { font-size: 9px; min-height: 80px; }
            }
        `;
        document.head.appendChild(st);
    }

    function createOverlay() {
        injectStyles();
        const ov = document.createElement('div');
        ov.id = 'pcModeOverlay';
        return ov;
    }

    function closeOverlay(ov, onDone) {
        if (!ov) { if (onDone) onDone(); return; }
        ov.classList.add('closing');
        setTimeout(function() {
            if (ov.parentNode) ov.parentNode.removeChild(ov);
            if (onDone) onDone();
        }, 320);
    }

    function copyToClipboard(text, field) {
        return new Promise(function(resolve) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                let done = false;
                navigator.clipboard.writeText(text).then(function() {
                    if (!done) { done = true; resolve(true); }
                }).catch(function() {
                    if (!done) { done = true; resolve(false); }
                });
                setTimeout(function() { if (!done) { done = true; resolve(false); } }, 1200);
                return;
            }
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
                document.body.appendChild(ta);
                ta.focus();
                ta.setSelectionRange(0, text.length);
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                if (ok) { resolve(true); return; }
            } catch(e) {}
            if (field) {
                try {
                    field.focus();
                    field.setSelectionRange(0, field.value.length);
                } catch(e) {}
            }
            resolve(false);
        });
    }

    // ==== Телефонная сторона (host) ====
    function showPhoneStart() {
        let existing = document.getElementById('pcModeOverlay');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        const ov = createOverlay();
        const card = document.createElement('div');
        card.className = 'pc-mode-card';

        const logo = document.createElement('div');
        logo.className = 'pc-mode-logo';
        logo.textContent = 'Shnuk PC Mode';
        card.appendChild(logo);

        const title = document.createElement('div');
        title.className = 'pc-mode-title';
        title.textContent = 'Связка телефона и ПК';
        card.appendChild(title);

        const steps = document.createElement('div');
        steps.className = 'pc-mode-steps';
        steps.innerHTML =
            '1. Нажмите <b>Создать приглашение</b>.<br>' +
            '2. Скопируйте строку и перенесите её на ПК любым способом.<br>' +
            '3. Вставьте в это окно ответную строку с ПК.<br>' +
            '4. Сверьте код — он должен совпасть на обоих устройствах.';
        card.appendChild(steps);

        const statusEl = document.createElement('div');
        statusEl.className = 'pc-mode-status';
        statusEl.textContent = 'Готово к созданию приглашения';
        card.appendChild(statusEl);

        const createBtn = document.createElement('button');
        createBtn.className = 'pc-mode-btn';
        createBtn.textContent = 'Создать приглашение';
        card.appendChild(createBtn);

        const inviteWrap = document.createElement('div');
        inviteWrap.style.display = 'none';
        inviteWrap.style.flexDirection = 'column';
        inviteWrap.style.gap = '16px';
        inviteWrap.style.width = '100%';

        const inviteLabel = document.createElement('div');
        inviteLabel.className = 'pc-mode-label';
        inviteLabel.textContent = 'Приглашение для ПК';
        inviteWrap.appendChild(inviteLabel);

        const inviteArea = document.createElement('textarea');
        inviteArea.className = 'pc-mode-link';
        inviteArea.readOnly = true;
        inviteArea.addEventListener('click', function() { inviteArea.select(); });
        inviteWrap.appendChild(inviteArea);

        const copyInviteBtn = document.createElement('button');
        copyInviteBtn.className = 'pc-mode-btn secondary';
        copyInviteBtn.textContent = 'Скопировать приглашение';
        copyInviteBtn.addEventListener('click', function() {
            const text = inviteArea.value.trim();
            if (!text) return;
            copyToClipboard(text, inviteArea).then(function(ok) {
                if (ok && window.Win && window.Win.notify) {
                    window.Win.notify('Приглашение скопировано', { type: 'success', duration: 2000 });
                }
            });
        });
        inviteWrap.appendChild(copyInviteBtn);

        const answerLabel = document.createElement('div');
        answerLabel.className = 'pc-mode-label';
        answerLabel.textContent = 'Ответная строка от ПК';
        inviteWrap.appendChild(answerLabel);

        const answerInput = document.createElement('textarea');
        answerInput.className = 'pc-mode-link';
        answerInput.placeholder = 'Вставьте ответную строку с ПК сюда...';
        inviteWrap.appendChild(answerInput);

        const connectBtn = document.createElement('button');
        connectBtn.className = 'pc-mode-btn';
        connectBtn.textContent = 'Установить соединение';
        inviteWrap.appendChild(connectBtn);

        const codeLabel = document.createElement('div');
        codeLabel.className = 'pc-mode-label';
        codeLabel.textContent = 'Код подтверждения';
        codeLabel.style.display = 'none';
        inviteWrap.appendChild(codeLabel);

        const codeDisplay = document.createElement('div');
        codeDisplay.className = 'pc-mode-code-display';
        codeDisplay.style.display = 'none';
        inviteWrap.appendChild(codeDisplay);

        const codeHint = document.createElement('div');
        codeHint.className = 'pc-mode-hint';
        codeHint.style.display = 'none';
        codeHint.textContent = 'Код должен совпасть с кодом, который покажет ПК.';
        inviteWrap.appendChild(codeHint);

        card.appendChild(inviteWrap);

        const errorEl = document.createElement('div');
        errorEl.className = 'pc-mode-error';
        card.appendChild(errorEl);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'pc-mode-btn secondary';
        closeBtn.textContent = 'Закрыть';
        closeBtn.addEventListener('click', function() {
            if (session) session.close();
            closeOverlay(ov);
        });
        card.appendChild(closeBtn);

        ov.appendChild(card);
        document.body.appendChild(ov);

        let session = null;
        let currentInvite = null;

        createBtn.addEventListener('click', async function() {
            errorEl.textContent = '';
            createBtn.disabled = true;
            statusEl.textContent = 'Создание приглашения...';
            statusEl.classList.remove('ok');

            try {
                session = createHostSession();
                const invite = await session.createOffer();
                currentInvite = invite;
                inviteArea.value = invite;
                inviteWrap.style.display = 'flex';
                statusEl.textContent = 'Приглашение готово. Перенесите на ПК.';
                statusEl.classList.add('ok');
                createBtn.style.display = 'none';
            } catch(e) {
                log('host createOffer error', e);
                errorEl.textContent = 'Ошибка создания приглашения: ' + (e.message || 'неизвестная');
                createBtn.disabled = false;
                statusEl.textContent = 'Готово к созданию приглашения';
            }
        });

        connectBtn.addEventListener('click', async function() {
            if (!session || !currentInvite) {
                errorEl.textContent = 'Сначала создайте приглашение';
                return;
            }
            const answer = answerInput.value.trim();
            if (!answer) {
                errorEl.textContent = 'Вставьте ответную строку';
                return;
            }
            errorEl.textContent = '';
            connectBtn.disabled = true;
            statusEl.textContent = 'Установка соединения...';
            statusEl.classList.remove('ok');

            try {
                await session.acceptAnswer(answer);
                statusEl.textContent = 'Ожидание открытия канала...';
            } catch(e) {
                log('host acceptAnswer error', e);
                errorEl.textContent = 'Ошибка: ' + (e.message || 'не удалось установить соединение');
                connectBtn.disabled = false;
                statusEl.textContent = 'Готово к вводу ответа';
            }
        });

        function createHostSession() {
            const state = {
                pc: null,
                dc: null,
                closed: false,
                code: null,
                onCode: null
            };

            state.close = function() {
                if (state.closed) return;
                state.closed = true;
                if (state.dc) {
                    try { state.dc.close(); } catch(e) {}
                }
                if (state.pc) {
                    try { state.pc.close(); } catch(e) {}
                }
            };

            state.createOffer = async function() {
                const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
                state.pc = pc;

                const dc = pc.createDataChannel('pcmode', { ordered: true });
                state.dc = dc;

                dc.onopen = function() {
                    log('host DC open');
                    statusEl.textContent = 'Соединение установлено. Ожидание кода...';
                    statusEl.classList.add('ok');
                };

                dc.onmessage = function(event) {
                    const data = event.data;
                    if (typeof data !== 'string') return;
                    let msg;
                    try { msg = JSON.parse(data); } catch(e) { return; }
                    if (msg && msg.t === 'code' && typeof msg.code === 'string') {
                        state.code = msg.code;
                        codeLabel.style.display = 'block';
                        codeDisplay.style.display = 'block';
                        codeDisplay.textContent = msg.code;
                        codeHint.style.display = 'block';
                        statusEl.textContent = 'Связка подтверждена';
                        statusEl.classList.add('ok');
                        if (state.onCode) state.onCode(msg.code);
                    }
                };

                dc.onclose = function() {
                    log('host DC close');
                    if (!state.closed) {
                        statusEl.textContent = 'Соединение закрыто';
                        statusEl.classList.remove('ok');
                    }
                };

                pc.onconnectionstatechange = function() {
                    log('host conn', pc.connectionState);
                    if (pc.connectionState === 'failed') {
                        errorEl.textContent = 'Не удалось установить соединение. Прямой канал заблокирован.';
                    }
                };

                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await waitIceComplete(pc);

                return base64UrlEncode(JSON.stringify({
                    t: 'offer',
                    sdp: pc.localDescription.sdp
                }));
            };

            state.acceptAnswer = async function(answerB64) {
                if (!state.pc) throw new Error('Сначала создайте приглашение');
                const json = base64UrlDecode(answerB64);
                if (!json) throw new Error('Неверная ответная строка');
                let data;
                try { data = JSON.parse(json); } catch(e) { throw new Error('Неверный формат ответа'); }
                if (!data || data.t !== 'answer' || !data.sdp) throw new Error('Это не ответ');

                await state.pc.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: data.sdp
                }));

                setTimeout(function() {
                    if (state.dc && state.dc.readyState !== 'open' && !state.closed) {
                        errorEl.textContent = 'Канал не открылся за 45 секунд. Прямой канал заблокирован.';
                    }
                }, CHANNEL_TIMEOUT_MS);
            };

            return state;
        }
    }

    // ==== ПК-сторона (guest) ====
    function showPCStart(onDone) {
        let existing = document.getElementById('pcModeOverlay');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        const ov = createOverlay();
        const card = document.createElement('div');
        card.className = 'pc-mode-card';

        const logo = document.createElement('div');
        logo.className = 'pc-mode-logo';
        logo.textContent = 'Shnuk PC Mode';
        card.appendChild(logo);

        const title = document.createElement('div');
        title.className = 'pc-mode-title';
        title.textContent = 'Связка телефона и ПК';
        card.appendChild(title);

        const steps = document.createElement('div');
        steps.className = 'pc-mode-steps';
        steps.innerHTML =
            '1. На телефоне откройте <b>Настройки → Shnuk PC Mode</b>.<br>' +
            '2. Нажмите <b>Создать приглашение</b> и перенесите строку на ПК.<br>' +
            '3. Вставьте приглашение ниже и нажмите <b>Продолжить</b>.<br>' +
            '4. Верните ответную строку на телефон и введите код, который появится здесь.';
        card.appendChild(steps);

        const statusEl = document.createElement('div');
        statusEl.className = 'pc-mode-status';
        statusEl.textContent = 'Ожидание приглашения';
        card.appendChild(statusEl);

        const inviteLabel = document.createElement('div');
        inviteLabel.className = 'pc-mode-label';
        inviteLabel.textContent = 'Приглашение с телефона';
        card.appendChild(inviteLabel);

        const inviteInput = document.createElement('textarea');
        inviteInput.className = 'pc-mode-link';
        inviteInput.placeholder = 'Вставьте приглашение с телефона сюда...';
        card.appendChild(inviteInput);

        const connectBtn = document.createElement('button');
        connectBtn.className = 'pc-mode-btn';
        connectBtn.textContent = 'Продолжить';
        card.appendChild(connectBtn);

        const answerWrap = document.createElement('div');
        answerWrap.style.display = 'none';
        answerWrap.style.flexDirection = 'column';
        answerWrap.style.gap = '16px';
        answerWrap.style.width = '100%';

        const answerLabel = document.createElement('div');
        answerLabel.className = 'pc-mode-label';
        answerLabel.textContent = 'Ответная строка для телефона';
        answerWrap.appendChild(answerLabel);

        const answerArea = document.createElement('textarea');
        answerArea.className = 'pc-mode-link';
        answerArea.readOnly = true;
        answerArea.addEventListener('click', function() { answerArea.select(); });
        answerWrap.appendChild(answerArea);

        const copyAnswerBtn = document.createElement('button');
        copyAnswerBtn.className = 'pc-mode-btn secondary';
        copyAnswerBtn.textContent = 'Скопировать ответную строку';
        copyAnswerBtn.addEventListener('click', function() {
            const text = answerArea.value.trim();
            if (!text) return;
            copyToClipboard(text, answerArea).then(function(ok) {
                if (ok && window.Win && window.Win.notify) {
                    window.Win.notify('Ответная строка скопирована', { type: 'success', duration: 2000 });
                }
            });
        });
        answerWrap.appendChild(copyAnswerBtn);

        const codeLabel = document.createElement('div');
        codeLabel.className = 'pc-mode-label';
        codeLabel.textContent = 'Код подтверждения';
        codeLabel.style.display = 'none';
        answerWrap.appendChild(codeLabel);

        const codeDisplay = document.createElement('div');
        codeDisplay.className = 'pc-mode-code-display';
        codeDisplay.style.display = 'none';
        answerWrap.appendChild(codeDisplay);

        const codeHint = document.createElement('div');
        codeHint.className = 'pc-mode-hint';
        codeHint.style.display = 'none';
        codeHint.textContent = 'Этот же код должен появиться на телефоне.';
        answerWrap.appendChild(codeHint);

        card.appendChild(answerWrap);

        const errorEl = document.createElement('div');
        errorEl.className = 'pc-mode-error';
        card.appendChild(errorEl);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'pc-mode-btn secondary';
        closeBtn.textContent = 'Закрыть';
        closeBtn.addEventListener('click', function() {
            if (session) session.close();
            closeOverlay(ov, function() {
                if (onDone) onDone(false);
            });
        });
        card.appendChild(closeBtn);

        ov.appendChild(card);
        document.body.appendChild(ov);

        let session = null;

        connectBtn.addEventListener('click', async function() {
            const invite = inviteInput.value.trim();
            if (!invite) {
                errorEl.textContent = 'Вставьте приглашение';
                return;
            }
            errorEl.textContent = '';
            connectBtn.disabled = true;
            statusEl.textContent = 'Обработка приглашения...';
            statusEl.classList.remove('ok');

            try {
                session = createGuestSession();
                const answer = await session.acceptOffer(invite);
                answerArea.value = answer;
                answerWrap.style.display = 'flex';
                statusEl.textContent = 'Ответная строка готова. Перенесите на телефон.';
                statusEl.classList.add('ok');
                inviteInput.disabled = true;
                connectBtn.style.display = 'none';
            } catch(e) {
                log('guest acceptOffer error', e);
                errorEl.textContent = 'Ошибка: ' + (e.message || 'не удалось обработать приглашение');
                connectBtn.disabled = false;
                statusEl.textContent = 'Ожидание приглашения';
            }
        });

        function createGuestSession() {
            const state = {
                pc: null,
                dc: null,
                closed: false,
                code: null
            };

            state.close = function() {
                if (state.closed) return;
                state.closed = true;
                if (state.dc) {
                    try { state.dc.close(); } catch(e) {}
                }
                if (state.pc) {
                    try { state.pc.close(); } catch(e) {}
                }
            };

            state.acceptOffer = async function(offerB64) {
                const json = base64UrlDecode(offerB64);
                if (!json) throw new Error('Неверное приглашение');
                let data;
                try { data = JSON.parse(json); } catch(e) { throw new Error('Неверный формат приглашения'); }
                if (!data || data.t !== 'offer' || !data.sdp) throw new Error('Это не приглашение');

                const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
                state.pc = pc;

                pc.ondatachannel = function(event) {
                    const dc = event.channel;
                    state.dc = dc;

                    dc.onopen = function() {
                        log('guest DC open');
                        const code = generateToken();
                        state.code = code;
                        try {
                            dc.send(JSON.stringify({ t: 'code', code: code }));
                        } catch(e) {
                            errorEl.textContent = 'Не удалось отправить код по каналу';
                            return;
                        }
                        codeLabel.style.display = 'block';
                        codeDisplay.style.display = 'block';
                        codeDisplay.textContent = code;
                        codeHint.style.display = 'block';
                        statusEl.textContent = 'Связка подтверждена';
                        statusEl.classList.add('ok');
                    };

                    dc.onclose = function() {
                        log('guest DC close');
                        if (!state.closed) {
                            statusEl.textContent = 'Соединение закрыто';
                            statusEl.classList.remove('ok');
                        }
                    };
                };

                pc.onconnectionstatechange = function() {
                    log('guest conn', pc.connectionState);
                    if (pc.connectionState === 'failed') {
                        errorEl.textContent = 'Не удалось установить соединение. Прямой канал заблокирован.';
                    }
                };

                await pc.setRemoteDescription(new RTCSessionDescription({
                    type: 'offer',
                    sdp: data.sdp
                }));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await waitIceComplete(pc);

                return base64UrlEncode(JSON.stringify({
                    t: 'answer',
                    sdp: pc.localDescription.sdp
                }));
            };

            return state;
        }
    }

    // ==== Настройки: раздел Shnuk PC Mode ====
    function renderSettingsSection(container) {
        if (!container) return;
        container.innerHTML = '';

        const isPc = isPC();

        const status = document.createElement('div');
        status.style.cssText = 'background:var(--bg-secondary);border:2px solid var(--border-color);padding:16px 20px;margin-bottom:18px;';
        status.innerHTML =
            '<div style="font-size:11px;color:var(--text-muted);letter-spacing:0.8px;text-transform:uppercase;font-weight:700;margin-bottom:6px;">Текущее устройство</div>' +
            '<div style="font-size:18px;font-weight:700;color:var(--text-primary);">' + (isPc ? 'Компьютер' : 'Телефон / планшет') + '</div>';
        container.appendChild(status);

        if (!isPc) {
            const intro = document.createElement('div');
            intro.style.cssText = 'font-size:14px;color:var(--text-muted);line-height:1.5;margin-bottom:14px;';
            intro.textContent = 'Создайте приглашение, перенесите его на ПК, вставьте ответную строку обратно и сверьте код подтверждения. Соединение устанавливается напрямую между устройствами по WebRTC.';
            container.appendChild(intro);

            const btn = document.createElement('button');
            btn.style.cssText = 'padding:14px 24px;border:none;background:var(--accent);color:var(--text-on-accent);font-family:inherit;font-size:14px;font-weight:700;letter-spacing:1px;cursor:pointer;text-transform:uppercase;';
            btn.textContent = 'Открыть PC Mode';
            btn.addEventListener('click', function() {
                showPhoneStart();
            });
            container.appendChild(btn);
        } else {
            const intro = document.createElement('div');
            intro.style.cssText = 'font-size:14px;color:var(--text-muted);line-height:1.5;margin-bottom:14px;';
            intro.textContent = 'Связка запрашивается при запуске системы. Если хотите пройти её сейчас, нажмите кнопку ниже.';
            container.appendChild(intro);

            const btn = document.createElement('button');
            btn.style.cssText = 'padding:14px 24px;border:none;background:var(--accent);color:var(--text-on-accent);font-family:inherit;font-size:14px;font-weight:700;letter-spacing:1px;cursor:pointer;text-transform:uppercase;';
            btn.textContent = 'Открыть PC Mode';
            btn.addEventListener('click', function() {
                showPCStart(function() {});
            });
            container.appendChild(btn);
        }

        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:12px;color:var(--text-muted);line-height:1.5;margin-top:14px;';
        hint.textContent = 'Связка устанавливается напрямую между устройствами. Код подтверждения генерируется на ПК и передаётся телефону по открытому P2P-каналу.';
        container.appendChild(hint);
    }

    window.ShnukPCMode = {
        isPC: isPC,
        showPhoneStart: showPhoneStart,
        showPCStart: showPCStart,
        renderSettingsSection: renderSettingsSection
    };

})();