// cooop.js — P2P-шаринг файлов через WebRTC (без сервера)

(function() {
    'use strict';

    const CHUNK_SIZE = 16 * 1024;
    const MAX_FILE_SIZE = 100 * 1024 * 1024;

    const ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ];

    let isOpen = false;
    let mode = 'menu';
    let peerConnection = null;
    let dataChannel = null;
    let currentFile = null;
    let incomingFile = null;
    let incomingChunks = [];
    let incomingBytes = 0;
    let sendInProgress = false;
    let isConnecting = false;

    let diagTimer = null;
    let connectedOnce = false;

    function log() {
        try { console.log.apply(console, ['[Cooop P2P]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }
    function err() {
        try { console.warn.apply(console, ['[Cooop P2P]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    // ============================================
    // КОДИРОВАНИЕ SDP
    // ============================================

    function encodeSDP(sdp) {
        try {
            const str = JSON.stringify(sdp);
            const bytes = new TextEncoder().encode(str);
            let binary = '';
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            return btoa(binary)
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
        } catch(e) {
            return '';
        }
    }

    function decodeSDP(code) {
        try {
            let b64 = code.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4) b64 += '=';
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const str = new TextDecoder().decode(bytes);
            return JSON.parse(str);
        } catch(e) {
            return null;
        }
    }

    function waitIceComplete(pc, timeoutMs) {
        timeoutMs = timeoutMs || 5000;
        return new Promise(function(resolve) {
            if (pc.iceGatheringState === 'complete') { resolve(); return; }
            let resolved = false;
            const done = function() {
                if (resolved) return;
                resolved = true;
                pc.removeEventListener('icegatheringstatechange', check);
                resolve();
            };
            const check = function() {
                if (pc.iceGatheringState === 'complete') done();
            };
            pc.addEventListener('icegatheringstatechange', check);
            setTimeout(done, timeoutMs);
            check();
        });
    }

    // ============================================
    // UI
    // ============================================

    function openCooop() {
        if (isOpen) {
            const ex = document.getElementById('cooopApp');
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }
        createUI();
    }

    function closeCooop() {
        isOpen = false;
        cleanupPeer();
        document.removeEventListener('keydown', onKeyDown);

        const el = document.getElementById('cooopApp');
        if (!el) return;

        if (window.ShnukCloseAnimation) {
            window.ShnukCloseAnimation(el, 'cooop', function() {
                el.remove();
            });
        } else {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 250);
        }
    }

    function destroy() {
        isOpen = false;
        cleanupPeer();
        const el = document.getElementById('cooopApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') closeCooop();
    }

    function cleanupPeer() {
        if (diagTimer) { clearInterval(diagTimer); diagTimer = null; }
        try {
            if (dataChannel) {
                dataChannel.onopen = null;
                dataChannel.onclose = null;
                dataChannel.onerror = null;
                dataChannel.onmessage = null;
                try { dataChannel.close(); } catch(e) {}
            }
        } catch(e) {}
        try {
            if (peerConnection) {
                peerConnection.onicecandidate = null;
                peerConnection.onconnectionstatechange = null;
                peerConnection.ondatachannel = null;
                peerConnection.oniceconnectionstatechange = null;
                peerConnection.onicegatheringstatechange = null;
                try { peerConnection.close(); } catch(e) {}
            }
        } catch(e) {}
        peerConnection = null;
        dataChannel = null;
        incomingFile = null;
        incomingChunks = [];
        incomingBytes = 0;
        sendInProgress = false;
        isConnecting = false;
        connectedOnce = false;
    }

    function switchScreen(screen) {
        cleanupPeer();
        mode = screen;
        const container = document.getElementById('cooopContent');
        if (!container) return;
        container.innerHTML = '';
        if (screen === 'menu') renderMenu(container);
        else if (screen === 'send') renderSendScreen(container);
        else if (screen === 'receive') renderReceiveScreen(container);
    }

    // ============================================
    // ЭКРАН МЕНЮ
    // ============================================

    function renderMenu(container) {
        container.innerHTML = `
            <div class="cooop-menu">
                <button class="cooop-menu-btn send" id="cooopSendBtn">
                    <span class="cooop-menu-title">ОТПРАВИТЬ ФАЙЛ</span>
                    <span class="cooop-menu-desc">Выбрать файл и получить код-приглашение для получателя</span>
                </button>
                <button class="cooop-menu-btn receive" id="cooopReceiveBtn">
                    <span class="cooop-menu-title">ПОЛУЧИТЬ ФАЙЛ</span>
                    <span class="cooop-menu-desc">Ввести код-приглашение от отправителя</span>
                </button>
            </div>
        `;
        document.getElementById('cooopSendBtn').addEventListener('click', function() {
            switchScreen('send');
        });
        document.getElementById('cooopReceiveBtn').addEventListener('click', function() {
            switchScreen('receive');
        });
    }

    // ============================================
    // ЭКРАН ОТПРАВИТЕЛЯ
    // ============================================

    function renderSendScreen(container) {
        container.innerHTML = `
            <div class="cooop-section">
                <div class="cooop-section-title">Шаг 1. Выберите файл</div>
                <div class="cooop-file-select" id="cooopFileSelect">
                    <div class="cooop-file-select-icon">+</div>
                    <div class="cooop-file-select-text">Нажмите, чтобы выбрать файл</div>
                </div>
                <input type="file" id="cooopFileInput" style="display:none;" />
                <div class="cooop-file-info" id="cooopFileInfo" style="display:none;"></div>
            </div>

            <div class="cooop-section" id="cooopInviteSection" style="display:none;">
                <div class="cooop-section-title">Шаг 2. Отправьте код получателю</div>
                <div class="cooop-desc">Передайте этот код получателю любым способом: через мессенджер, SMS, почту. Поторопитесь — код действует около минуты.</div>
                <textarea class="cooop-code" id="cooopInviteCode" readonly></textarea>
                <button class="cooop-btn-secondary" id="cooopCopyInviteBtn">Скопировать код</button>
            </div>

            <div class="cooop-section" id="cooopAnswerSection" style="display:none;">
                <div class="cooop-section-title">Шаг 3. Вставьте ответный код</div>
                <div class="cooop-desc">Получатель пришлёт ответный код. Вставьте его сюда, чтобы установить соединение.</div>
                <textarea class="cooop-code" id="cooopAnswerInput" placeholder="Вставьте ответный код сюда..."></textarea>
                <button class="cooop-btn" id="cooopConnectBtn">УСТАНОВИТЬ СОЕДИНЕНИЕ</button>
            </div>

            <div class="cooop-section" id="cooopSendStatus" style="display:none;">
                <div class="cooop-section-title">Передача</div>
                <div class="cooop-status" id="cooopSendStatusText">Ожидание...</div>
                <div class="cooop-progress"><div class="cooop-progress-bar" id="cooopSendProgress"></div></div>
            </div>

            <div class="cooop-back-row">
                <button class="cooop-btn-secondary" id="cooopSendBack">← Назад</button>
            </div>
        `;

        const fileInput = document.getElementById('cooopFileInput');
        const fileSelect = document.getElementById('cooopFileSelect');
        const fileInfo = document.getElementById('cooopFileInfo');
        const inviteSection = document.getElementById('cooopInviteSection');
        const answerSection = document.getElementById('cooopAnswerSection');
        const answerInput = document.getElementById('cooopAnswerInput');
        const connectBtn = document.getElementById('cooopConnectBtn');

        fileSelect.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', function() {
            if (!this.files || !this.files[0]) return;
            const f = this.files[0];
            if (f.size > MAX_FILE_SIZE) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Файл больше ' + Math.round(MAX_FILE_SIZE / 1024 / 1024) + ' МБ', { type: 'error' });
                }
                return;
            }
            currentFile = f;

            fileInfo.style.display = 'block';
            fileInfo.textContent = f.name + ' — ' + formatSize(f.size);
            fileSelect.querySelector('.cooop-file-select-icon').textContent = '✓';
            fileSelect.querySelector('.cooop-file-select-text').textContent = 'Файл выбран';

            cleanupPeer();
            if (inviteSection) inviteSection.style.display = 'none';
            if (answerSection) answerSection.style.display = 'none';
            if (answerInput) answerInput.value = '';

            createInvite().catch(function(e) {
                err('createInvite', e);
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Не удалось создать приглашение: ' + e.message, { type: 'error' });
                }
            });
        });

        document.getElementById('cooopCopyInviteBtn').addEventListener('click', function() {
            const inviteCode = document.getElementById('cooopInviteCode');
            if (inviteCode) {
                inviteCode.select();
                try { document.execCommand('copy'); } catch(e) {}
                if (navigator.clipboard) navigator.clipboard.writeText(inviteCode.value).catch(function() {});
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Код скопирован', { type: 'success' });
                }
            }
        });

        connectBtn.addEventListener('click', function() {
            if (isConnecting) return;
            const code = answerInput.value.trim();
            if (!code) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Вставьте ответный код', { type: 'error' });
                }
                return;
            }
            isConnecting = true;
            connectBtn.disabled = true;
            connectBtn.textContent = 'СОЕДИНЕНИЕ...';

            applyAnswer(code).catch(function(e) {
                err('applyAnswer', e);
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Ошибка: ' + e.message, { type: 'error' });
                }
            }).then(function() {
                isConnecting = false;
                connectBtn.disabled = false;
                connectBtn.textContent = 'УСТАНОВИТЬ СОЕДИНЕНИЕ';
            });
        });

        document.getElementById('cooopSendBack').addEventListener('click', function() {
            cleanupPeer();
            switchScreen('menu');
        });
    }

    // ============================================
    // ЭКРАН ПОЛУЧАТЕЛЯ
    // ============================================

    function renderReceiveScreen(container) {
        container.innerHTML = `
            <div class="cooop-section">
                <div class="cooop-section-title">Шаг 1. Вставьте код-приглашение</div>
                <div class="cooop-desc">Получите код от отправителя и вставьте его сюда. Чем быстрее, тем лучше — код живёт около минуты.</div>
                <textarea class="cooop-code" id="cooopInviteInput" placeholder="Вставьте код-приглашение..."></textarea>
                <button class="cooop-btn" id="cooopAcceptBtn">ПРИНЯТЬ</button>
            </div>

            <div class="cooop-section" id="cooopAnswerOutSection" style="display:none;">
                <div class="cooop-section-title">Шаг 2. Отправьте ответный код</div>
                <div class="cooop-desc">Передайте этот ответный код отправителю как можно быстрее.</div>
                <textarea class="cooop-code" id="cooopAnswerOut" readonly></textarea>
                <button class="cooop-btn-secondary" id="cooopCopyAnswerBtn">Скопировать код</button>
            </div>

            <div class="cooop-section" id="cooopRecvStatus" style="display:none;">
                <div class="cooop-section-title">Получение</div>
                <div class="cooop-status" id="cooopRecvStatusText">Ожидание...</div>
                <div class="cooop-progress"><div class="cooop-progress-bar" id="cooopRecvProgress"></div></div>
            </div>

            <div class="cooop-back-row">
                <button class="cooop-btn-secondary" id="cooopRecvBack">← Назад</button>
            </div>
        `;

        const acceptBtn = document.getElementById('cooopAcceptBtn');
        const inviteInput = document.getElementById('cooopInviteInput');

        acceptBtn.addEventListener('click', function() {
            if (isConnecting) return;
            const code = inviteInput.value.trim();
            if (!code) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Вставьте код-приглашение', { type: 'error' });
                }
                return;
            }
            isConnecting = true;
            acceptBtn.disabled = true;
            acceptBtn.textContent = 'ОБРАБОТКА...';

            acceptInvite(code).catch(function(e) {
                err('acceptInvite', e);
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Ошибка: ' + e.message, { type: 'error' });
                }
            }).then(function() {
                isConnecting = false;
                acceptBtn.disabled = false;
                acceptBtn.textContent = 'ПРИНЯТЬ';
            });
        });

        document.getElementById('cooopCopyAnswerBtn').addEventListener('click', function() {
            const ta = document.getElementById('cooopAnswerOut');
            if (ta) {
                ta.select();
                try { document.execCommand('copy'); } catch(e) {}
                if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(function() {});
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Код скопирован', { type: 'success' });
                }
            }
        });

        document.getElementById('cooopRecvBack').addEventListener('click', function() {
            cleanupPeer();
            switchScreen('menu');
        });
    }

    // ============================================
    // ОТПРАВИТЕЛЬ
    // ============================================

    async function createInvite() {
        cleanupPeer();

        try {
            peerConnection = new RTCPeerConnection({
                iceServers: ICE_SERVERS,
                iceCandidatePoolSize: 4,
                iceTransportPolicy: 'all'
            });
        } catch(e) {
            throw new Error('WebRTC не поддерживается браузером');
        }

        attachDiagnostics('send');

        dataChannel = peerConnection.createDataChannel('file', { ordered: true });
        setupDataChannel(dataChannel, 'send');

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await waitIceComplete(peerConnection, 5000);

        if (peerConnection.signalingState !== 'have-local-offer') {
            throw new Error('Не удалось создать приглашение');
        }

        const invite = {
            v: 1,
            t: 'offer',
            sdp: peerConnection.localDescription
        };
        const code = encodeSDP(invite);

        const inviteSection = document.getElementById('cooopInviteSection');
        const inviteTextarea = document.getElementById('cooopInviteCode');
        const answerSection = document.getElementById('cooopAnswerSection');
        if (inviteSection) inviteSection.style.display = 'block';
        if (inviteTextarea) inviteTextarea.value = code;
        if (answerSection) answerSection.style.display = 'block';

        setStatus('send', 'Код-приглашение готов. Отправьте его получателю.');
    }

    async function applyAnswer(code) {
        if (!peerConnection) {
            throw new Error('Нет активного соединения. Выберите файл заново.');
        }
        if (peerConnection.signalingState === 'stable') {
            throw new Error('Соединение уже установлено или приглашение устарело. Выберите файл заново.');
        }
        if (peerConnection.signalingState !== 'have-local-offer') {
            throw new Error('Неверное состояние соединения: ' + peerConnection.signalingState);
        }

        const answer = decodeSDP(code);
        if (!answer || answer.t !== 'answer' || !answer.sdp) {
            throw new Error('Неверный формат ответного кода');
        }

        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer.sdp));
        } catch(e) {
            throw new Error('Не удалось применить ответ: ' + e.message);
        }

        setStatus('send', 'Устанавливается соединение...');
    }

    // ============================================
    // ПОЛУЧАТЕЛЬ
    // ============================================

    async function acceptInvite(code) {
        cleanupPeer();

        const invite = decodeSDP(code);
        if (!invite || invite.t !== 'offer' || !invite.sdp) {
            throw new Error('Неверный формат кода-приглашения');
        }

        try {
            peerConnection = new RTCPeerConnection({
                iceServers: ICE_SERVERS,
                iceCandidatePoolSize: 4,
                iceTransportPolicy: 'all'
            });
        } catch(e) {
            throw new Error('WebRTC не поддерживается браузером');
        }

        attachDiagnostics('recv');

        peerConnection.ondatachannel = function(event) {
            dataChannel = event.channel;
            setupDataChannel(dataChannel, 'recv');
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(invite.sdp));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await waitIceComplete(peerConnection, 5000);

        const answerPayload = {
            v: 1,
            t: 'answer',
            sdp: peerConnection.localDescription
        };
        const answerCode = encodeSDP(answerPayload);

        const answerOut = document.getElementById('cooopAnswerOut');
        const answerOutSection = document.getElementById('cooopAnswerOutSection');
        const recvStatus = document.getElementById('cooopRecvStatus');
        if (answerOut) answerOut.value = answerCode;
        if (answerOutSection) answerOutSection.style.display = 'block';
        if (recvStatus) recvStatus.style.display = 'block';
        setStatus('recv', 'Отправьте ответный код отправителю.');
    }

    // ============================================
    // ДИАГНОСТИКА
    // ============================================

    function attachDiagnostics(which) {
        if (!peerConnection) return;

        peerConnection.oniceconnectionstatechange = function() {
            const st = peerConnection.iceConnectionState;
            log('ice connection state:', st);
            if (st === 'checking') {
                setStatus(which, 'Проверка каналов...');
            } else if (st === 'connected' || st === 'completed') {
                setStatus(which, 'Соединение установлено, готовим канал...');
            } else if (st === 'failed') {
                setStatus(which, 'Не удалось пробить NAT. Попробуйте ещё раз.');
            } else if (st === 'disconnected') {
                setStatus(which, 'Связь прерывается...');
            }
        };

        peerConnection.onconnectionstatechange = function() {
            const st = peerConnection.connectionState;
            log('connection state:', st);
            if (st === 'connected') {
                connectedOnce = true;
            } else if (st === 'failed') {
                setStatus(which, 'Соединение не установлено. Возможно, нужен TURN-сервер.');
            } else if (st === 'disconnected') {
                setTimeout(function() {
                    if (peerConnection && peerConnection.connectionState === 'disconnected') {
                        setStatus(which, 'Соединение потеряно. Попробуйте ещё раз.');
                    }
                }, 5000);
            } else if (st === 'closed') {
                if (!connectedOnce) {
                    setStatus(which, 'Соединение закрыто.');
                }
            }
        };

        let attempts = 0;
        if (diagTimer) clearInterval(diagTimer);
        diagTimer = setInterval(function() {
            attempts++;
            if (!peerConnection) {
                clearInterval(diagTimer);
                diagTimer = null;
                return;
            }
            const ice = peerConnection.iceConnectionState;
            const conn = peerConnection.connectionState;
            if (conn === 'connected' || ice === 'connected' || ice === 'completed') {
                clearInterval(diagTimer);
                diagTimer = null;
                return;
            }
            if (attempts >= 20 && (ice === 'checking' || ice === 'new')) {
                setStatus(which, 'Не удаётся установить прямое соединение. Попробуйте ещё раз или используйте другое интернет-соединение.');
                clearInterval(diagTimer);
                diagTimer = null;
            }
        }, 1000);
    }

    // ============================================
    // DATACHANNEL
    // ============================================

    function setupDataChannel(channel, role) {
        channel.binaryType = 'arraybuffer';

        channel.onopen = function() {
            log('data channel open, role =', role);
            onDataChannelOpen(role);
        };
        channel.onclose = function() {
            log('data channel closed');
        };
        channel.onerror = function(e) {
            err('data channel error', e);
        };
        channel.onmessage = function(event) {
            handleMessage(event.data);
        };
    }

    function onDataChannelOpen(role) {
        if (role === 'send') {
            if (currentFile) {
                setStatus('send', 'Канал открыт. Начинается передача...');
                setTimeout(function() {
                    startSending().catch(function(e) {
                        err('startSending', e);
                        setStatus('send', 'Ошибка отправки: ' + e.message);
                    });
                }, 150);
            } else {
                setStatus('send', 'Канал открыт, но файл не выбран.');
            }
        } else {
            setStatus('recv', 'Канал открыт. Ожидание файла...');
        }
    }

    function setStatus(which, text) {
        const el = document.getElementById(which === 'send' ? 'cooopSendStatusText' : 'cooopRecvStatusText');
        const block = document.getElementById(which === 'send' ? 'cooopSendStatus' : 'cooopRecvStatus');
        if (block) block.style.display = 'block';
        if (el) el.textContent = text;
    }

    function setProgress(which, pct) {
        const el = document.getElementById(which === 'send' ? 'cooopSendProgress' : 'cooopRecvProgress');
        if (el) el.style.width = pct + '%';
    }

    // ============================================
    // ПЕРЕДАЧА
    // ============================================

    async function startSending() {
        if (sendInProgress) return;
        if (!currentFile) {
            setStatus('send', 'Файл не выбран.');
            return;
        }
        if (!dataChannel || dataChannel.readyState !== 'open') {
            setStatus('send', 'Канал ещё не готов. Подождите...');
            return;
        }

        sendInProgress = true;
        const file = currentFile;

        const meta = {
            type: 'meta',
            name: file.name,
            size: file.size,
            mime: file.type || 'application/octet-stream',
            chunks: Math.ceil(file.size / CHUNK_SIZE)
        };

        try {
            dataChannel.send(JSON.stringify(meta));
        } catch(e) {
            err('send meta', e);
            setStatus('send', 'Ошибка отправки метаданных');
            sendInProgress = false;
            return;
        }

        setStatus('send', 'Отправка: 0%');
        setProgress('send', 0);

        let offset = 0;

        const readChunk = function(blob) {
            return new Promise(function(resolve, reject) {
                const reader = new FileReader();
                reader.onload = function() { resolve(reader.result); };
                reader.onerror = function() { reject(reader.error); };
                reader.readAsArrayBuffer(blob);
            });
        };

        const waitForBuffer = function() {
            return new Promise(function(resolve) {
                const check = function() {
                    if (!dataChannel || dataChannel.readyState !== 'open') {
                        resolve();
                        return;
                    }
                    if (dataChannel.bufferedAmount < 1024 * 1024) resolve();
                    else setTimeout(check, 20);
                };
                check();
            });
        };

        while (offset < file.size) {
            if (!dataChannel || dataChannel.readyState !== 'open') {
                setStatus('send', 'Соединение потеряно во время передачи');
                sendInProgress = false;
                return;
            }
            await waitForBuffer();
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            let buffer;
            try {
                buffer = await readChunk(slice);
            } catch(e) {
                err('read chunk', e);
                setStatus('send', 'Ошибка чтения файла');
                sendInProgress = false;
                return;
            }
            try {
                dataChannel.send(buffer);
            } catch(e) {
                err('send chunk', e);
                setStatus('send', 'Ошибка отправки чанка');
                sendInProgress = false;
                return;
            }
            offset += buffer.byteLength;
            const pct = Math.floor((offset / file.size) * 100);
            setProgress('send', pct);
            setStatus('send', 'Отправка: ' + pct + '%');
        }

        try {
            dataChannel.send(JSON.stringify({ type: 'done' }));
        } catch(e) {
            err('send done', e);
        }

        setStatus('send', 'Файл отправлен. Ожидание подтверждения...');
    }

    function handleMessage(data) {
        if (typeof data === 'string') {
            let msg = null;
            try { msg = JSON.parse(data); } catch(e) { return; }
            if (!msg || !msg.type) return;

            if (msg.type === 'meta') {
                incomingFile = {
                    name: msg.name,
                    size: msg.size,
                    mime: msg.mime,
                    chunks: msg.chunks
                };
                incomingChunks = [];
                incomingBytes = 0;
                setStatus('recv', 'Получение: 0%');
                setProgress('recv', 0);
            } else if (msg.type === 'done') {
                finalizeReceive();
            } else if (msg.type === 'ack') {
                setStatus('send', 'Файл успешно доставлен');
            }
            return;
        }

        if (data instanceof ArrayBuffer) {
            if (!incomingFile) return;
            incomingChunks.push(data);
            incomingBytes += data.byteLength;
            const pct = Math.floor((incomingBytes / incomingFile.size) * 100);
            setProgress('recv', pct);
            setStatus('recv', 'Получение: ' + pct + '%');
        }
    }

    async function finalizeReceive() {
        if (!incomingFile || incomingChunks.length === 0) {
            setStatus('recv', 'Не получено данных');
            return;
        }

        try {
            const blob = new Blob(incomingChunks, { type: incomingFile.mime });
            const reader = new FileReader();
            reader.onload = async function() {
                const dataUrl = reader.result;
                if (!dataUrl) {
                    setStatus('recv', 'Ошибка чтения файла');
                    return;
                }

                if (window.SharedFiles && typeof window.SharedFiles.add === 'function') {
                    if (window.SharedFiles.ready) {
                        try { await window.SharedFiles.ready(); } catch(e) {}
                    }
                    const ext = (incomingFile.name.split('.').pop() || '').toLowerCase();
                    const ok = await window.SharedFiles.add({
                        id: 'cooop_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
                        name: incomingFile.name,
                        size: incomingFile.size,
                        type: incomingFile.mime,
                        data: dataUrl,
                        date: new Date().toISOString(),
                        extension: ext,
                        parentId: null,
                        isFolder: false
                    });

                    if (ok) {
                        setStatus('recv', 'Файл сохранён в Файлы: ' + incomingFile.name);
                        if (window.Win && window.Win.notify) {
                            window.Win.notify('Файл получен: ' + incomingFile.name, { type: 'success' });
                        }
                    } else {
                        setStatus('recv', 'Не удалось сохранить файл');
                    }
                } else {
                    const a = document.createElement('a');
                    a.href = dataUrl;
                    a.download = incomingFile.name;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                        if (a.parentNode) a.parentNode.removeChild(a);
                    }, 200);
                    setStatus('recv', 'Файл скачан');
                }

                if (dataChannel && dataChannel.readyState === 'open') {
                    try { dataChannel.send(JSON.stringify({ type: 'ack' })); } catch(e) {}
                }
            };
            reader.readAsDataURL(blob);
        } catch(e) {
            err('finalizeReceive', e);
            setStatus('recv', 'Ошибка: ' + e.message);
        }
    }

    // ============================================
    // UI
    // ============================================

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function createUI() {
        if (document.getElementById('cooopApp')) {
            document.getElementById('cooopApp').style.display = 'flex';
            return;
        }
        isOpen = true;

        const app = document.createElement('div');
        app.id = 'cooopApp';
        app.className = 'scroll-blur';
        app.style.cssText = `
            position: fixed;
            top: var(--livebar-h, 44px);
            left: 0;
            width: 100%;
            height: calc(100% - var(--livebar-h, 44px));
            background: var(--bg-primary);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            font-family: 'TTPaplane', monospace;
            color: var(--text-primary);
            opacity: 0;
            animation: cooopFadeIn 0.3s ease forwards;
            transition: background 0.4s ease, color 0.4s ease;
            overflow: hidden;
        `;

        if (!document.getElementById('cooopStyles')) {
            const style = document.createElement('style');
            style.id = 'cooopStyles';
            style.textContent = `
                @keyframes cooopFadeIn { from { opacity: 0; } to { opacity: 1; } }

                #cooopApp, #cooopApp * {
                    font-family: 'TTPaplane', monospace !important;
                }

                /* Постоянное размытие снизу — как в настройках */
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

                .cooop-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    background: var(--header-bg);
                    border-bottom: 2px solid var(--border-color);
                    flex-shrink: 0;
                    color: var(--header-text);
                }
                .cooop-header h1 {
                    font-size: 20px;
                    font-weight: 600;
                    margin: 0;
                }
                .cooop-header-actions button {
                    background: var(--bg-primary);
                    border: 2px solid var(--accent);
                    color: var(--accent);
                    font-size: 18px;
                    padding: 4px 12px;
                    cursor: pointer;
                    font-family: inherit;
                    transition: all 0.2s ease;
                }
                .cooop-header-actions button:hover {
                    background: var(--accent);
                    color: var(--text-on-accent);
                }

                .cooop-content {
                    position: relative;
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px 24px 80px;
                    isolation: isolate;
                }

                .cooop-menu {
                    max-width: 640px;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                .cooop-menu-btn {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    padding: 32px 28px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                    cursor: pointer;
                    text-align: left;
                    transition: all 0.2s ease;
                    font-family: inherit;
                }
                .cooop-menu-btn:hover {
                    border-color: var(--accent);
                    background: var(--bg-primary);
                }
                .cooop-menu-btn.send:hover { border-color: #4CAF50; }
                .cooop-menu-btn.receive:hover { border-color: #3366cc; }
                .cooop-menu-title {
                    font-size: 20px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                }
                .cooop-menu-desc {
                    font-size: 13px;
                    color: var(--text-muted);
                    line-height: 1.5;
                }

                .cooop-section {
                    max-width: 640px;
                    margin: 0 auto 24px;
                    background: var(--bg-secondary);
                    border: 2px solid var(--border-color);
                    padding: 20px;
                    box-sizing: border-box;
                }
                .cooop-section-title {
                    font-size: 15px;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin-bottom: 10px;
                    letter-spacing: 0.3px;
                }
                .cooop-desc {
                    font-size: 12px;
                    color: var(--text-muted);
                    line-height: 1.5;
                    margin-bottom: 12px;
                }

                .cooop-file-select {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    padding: 32px 20px;
                    border: 2px dashed var(--border-color);
                    cursor: pointer;
                    transition: border-color 0.2s;
                    background: var(--bg-primary);
                }
                .cooop-file-select:hover {
                    border-color: var(--accent);
                }
                .cooop-file-select-icon {
                    width: 48px;
                    height: 48px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--accent);
                    color: var(--text-on-accent);
                    font-size: 28px;
                    font-weight: 700;
                }
                .cooop-file-select-text {
                    font-size: 13px;
                    color: var(--text-muted);
                }
                .cooop-file-info {
                    margin-top: 12px;
                    font-size: 13px;
                    color: var(--text-primary);
                    padding: 10px 12px;
                    background: var(--bg-primary);
                    border: 2px solid var(--border-color);
                    word-break: break-all;
                }

                .cooop-code {
                    width: 100%;
                    height: 100px;
                    padding: 12px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-family: 'Courier New', monospace;
                    font-size: 11px;
                    line-height: 1.4;
                    resize: vertical;
                    box-sizing: border-box;
                    outline: none;
                    margin-bottom: 12px;
                    word-break: break-all;
                }
                .cooop-code:focus {
                    border-color: var(--accent);
                }

                .cooop-btn {
                    display: block;
                    width: 100%;
                    padding: 14px 20px;
                    border: none;
                    background: var(--accent);
                    color: var(--text-on-accent);
                    cursor: pointer;
                    font-family: inherit;
                    font-size: 14px;
                    font-weight: 700;
                    letter-spacing: 1px;
                    transition: background 0.2s;
                }
                .cooop-btn:hover {
                    background: var(--accent-dark);
                }
                .cooop-btn:disabled {
                    background: #888;
                    cursor: wait;
                }
                .cooop-btn-secondary {
                    display: block;
                    width: 100%;
                    padding: 12px 20px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    cursor: pointer;
                    font-family: inherit;
                    font-size: 13px;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .cooop-btn-secondary:hover {
                    border-color: var(--accent);
                    color: var(--accent);
                }

                .cooop-status {
                    font-size: 13px;
                    color: var(--text-primary);
                    margin-bottom: 10px;
                    word-break: break-all;
                }
                .cooop-progress {
                    width: 100%;
                    height: 8px;
                    background: var(--bg-primary);
                    border: 2px solid var(--border-color);
                    overflow: hidden;
                }
                .cooop-progress-bar {
                    width: 0%;
                    height: 100%;
                    background: var(--accent);
                    transition: width 0.2s;
                }

                .cooop-back-row {
                    max-width: 640px;
                    margin: 0 auto 24px;
                }

                @media (max-width: 500px) {
                    .cooop-content { padding: 16px 16px 80px; }
                    .cooop-menu-btn { padding: 22px 20px; }
                    .cooop-menu-title { font-size: 17px; }
                    .cooop-menu-desc { font-size: 12px; }
                    .cooop-section { padding: 16px; }
                    .cooop-section-title { font-size: 14px; }
                    .cooop-code { font-size: 10px; height: 84px; }
                }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'cooop-header';
        header.innerHTML = `
            <h1>Cooop</h1>
            <div class="cooop-header-actions">
                <button id="cooopCloseBtn">✕</button>
            </div>
        `;

        const content = document.createElement('div');
        content.className = 'cooop-content';
        content.id = 'cooopContent';

        app.appendChild(header);
        app.appendChild(content);
        document.body.appendChild(app);

        document.getElementById('cooopCloseBtn').addEventListener('click', closeCooop);
        document.addEventListener('keydown', onKeyDown);

        switchScreen('menu');
    }

    window.Cooop = {
        destroy: destroy,
        open: openCooop,
        CHUNK_SIZE: CHUNK_SIZE,
        MAX_FILE_SIZE: MAX_FILE_SIZE
    };
    window.cooopInit = function() { openCooop(); };

})();