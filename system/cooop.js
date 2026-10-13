//cooop
(function() {
    'use strict';

    const MAX_FILE_SIZE = 30 * 1024 * 1024;
    const CHUNK_SIZE = 16 * 1024;
    const BUFFER_HIGH = 1024 * 1024;
    const BUFFER_LOW = 256 * 1024;
    const FONT_MAIN = "'TTPaplane', monospace";

    const ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.stunprotocol.org:3478' },
        {
            urls: [
                'turn:openrelay.metered.ca:80',
                'turn:openrelay.metered.ca:80?transport=tcp',
                'turn:openrelay.metered.ca:443',
                'turn:openrelay.metered.ca:443?transport=tcp',
                'turns:openrelay.metered.ca:443?transport=tcp'
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ];

    const ICE_TRANSPORT_POLICY = 'all';

    let isOpen = false;
    let mode = 'menu';
    let activeHost = null;

    function log() {
        try { console.log.apply(console, ['[Cooop]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    function selectAllInField(field) {
        if (!field) return;
        try {
            field.focus();
            field.setSelectionRange(0, field.value.length);
        } catch(e) {}
    }

    function tryNavigatorCopy(text) {
        return new Promise(function(resolve) {
            if (!navigator.clipboard || !navigator.clipboard.writeText) {
                resolve(false);
                return;
            }
            let done = false;
            navigator.clipboard.writeText(text).then(function() {
                if (!done) { done = true; resolve(true); }
            }).catch(function() {
                if (!done) { done = true; resolve(false); }
            });
            setTimeout(function() { if (!done) { done = true; resolve(false); } }, 1200);
        });
    }

    async function copyText(text, field) {
        if (!text) return false;
        const okApi = await tryNavigatorCopy(text);
        if (okApi) return true;
        const tmp = document.createElement('textarea');
        tmp.value = text;
        tmp.setAttribute('readonly', '');
        tmp.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
        document.body.appendChild(tmp);
        tmp.focus();
        tmp.setSelectionRange(0, text.length);
        let okExec = false;
        try { okExec = document.execCommand('copy'); } catch(e) { okExec = false; }
        document.body.removeChild(tmp);
        if (okExec) return true;
        if (field) selectAllInField(field);
        return false;
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    function base64Encode(str) {
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

    function base64Decode(b64) {
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

    function waitIceComplete(pc, timeoutMs) {
        timeoutMs = timeoutMs || 12000;
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
                if (pc.iceGatheringState === 'complete') {
                    finish();
                }
            };
            const onCand = function(e) {
                if (e && e.candidate && e.candidate.type === 'relay') {
                    setTimeout(finish, 800);
                }
            };
            pc.addEventListener('icegatheringstatechange', onState);
            pc.addEventListener('icecandidate', onCand);
            setTimeout(finish, timeoutMs);
        });
    }

    function getSenderProfile() {
        const acc = window.ShnukAccount;
        if (!acc) return { code: '', name: '', avatar: null };
        acc.ensure();
        return {
            code: acc.getCode() || '',
            name: acc.getName() || '',
            avatar: acc.getAvatar() || null
        };
    }

    function createHostSession(fileData, callbacks) {
        const session = {
            fileData: fileData,
            pc: null,
            dc: null,
            closed: false,
            sendStarted: false,
            sendTotal: fileData.size,
            onStatus: (callbacks && callbacks.onStatus) || null,
            onProgress: (callbacks && callbacks.onProgress) || null,
            onFinished: (callbacks && callbacks.onFinished) || null,
            onError: (callbacks && callbacks.onError) || null,
            fileBuffer: null,
            connectTimer: null
        };

        session.close = function() {
            if (session.closed) return;
            session.closed = true;
            if (session.connectTimer) {
                clearTimeout(session.connectTimer);
                session.connectTimer = null;
            }
            if (session.dc) {
                try { session.dc.close(); } catch(e) {}
            }
            if (session.pc) {
                try { session.pc.close(); } catch(e) {}
            }
        };

        session.createOffer = async function() {
            const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            try {
                if ('iceTransportPolicy' in pc) {
                    pc.setConfiguration({ iceServers: ICE_SERVERS, iceTransportPolicy: ICE_TRANSPORT_POLICY });
                }
            } catch(e) {}
            session.pc = pc;

            const dc = pc.createDataChannel('file', { ordered: true });
            session.dc = dc;
            dc.binaryType = 'arraybuffer';
            dc.bufferedAmountLowThreshold = BUFFER_LOW;

            dc.onopen = function() {
                log('host DC open');
                if (session.connectTimer) {
                    clearTimeout(session.connectTimer);
                    session.connectTimer = null;
                }
                if (session.onStatus) session.onStatus('connected');
                startSend(session);
            };
            dc.onclose = function() {
                log('host DC close');
                if (!session.closed && session.onStatus) {
                    session.onStatus('disconnected');
                }
            };
            dc.onerror = function(e) {
                log('host DC error', e);
                if (session.onError) session.onError('Ошибка канала');
            };

            let lastIceState = '';
            pc.oniceconnectionstatechange = function() {
                const st = pc.iceConnectionState;
                if (st === lastIceState) return;
                lastIceState = st;
                log('host ice', st);
                if (session.onStatus) session.onStatus('ice-' + st);
            };

            pc.onicecandidateerror = function(e) {
                log('host ice candidate error', e && e.errorCode, e && e.url);
            };

            pc.onconnectionstatechange = function() {
                const st = pc.connectionState;
                log('host conn', st);
                if (st === 'failed' && session.onError) {
                    session.onError('Не удалось установить соединение. Прямой канал заблокирован.');
                }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await waitIceComplete(pc, 12000);

            const payload = JSON.stringify({
                t: 'offer',
                sdp: pc.localDescription.sdp,
                name: fileData.name,
                size: fileData.size,
                type: fileData.type || 'application/octet-stream',
                sender: getSenderProfile()
            });
            return base64Encode(payload);
        };

        session.acceptAnswer = async function(answerB64) {
            if (!session.pc) throw new Error('Сначала создайте приглашение');
            const json = base64Decode(answerB64);
            if (!json) throw new Error('Неверный ответ');
            let data;
            try { data = JSON.parse(json); } catch(e) { throw new Error('Неверный формат ответа'); }
            if (!data || data.t !== 'answer' || !data.sdp) throw new Error('Это не ответ');
            await session.pc.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: data.sdp
            }));

            if (session.connectTimer) clearTimeout(session.connectTimer);
            session.connectTimer = setTimeout(function() {
                if (session.dc && session.dc.readyState !== 'open') {
                    if (session.onError) {
                        session.onError('Соединение не установилось за 30 секунд. Прямой канал заблокирован.');
                    }
                }
            }, 30000);
        };

        return session;
    }

    function readFileBuffer(session) {
        if (session.fileBuffer) return Promise.resolve(session.fileBuffer);
        return new Promise(function(resolve, reject) {
            const reader = new FileReader();
            reader.onload = function() {
                session.fileBuffer = new Uint8Array(reader.result);
                resolve(session.fileBuffer);
            };
            reader.onerror = function() {
                reject(new Error('Не удалось прочитать файл'));
            };
            reader.readAsArrayBuffer(session.fileData.blob);
        });
    }

    async function startSend(session) {
        if (session.sendStarted) return;
        session.sendStarted = true;
        log('startSend');

        try {
            const bytes = await readFileBuffer(session);
            const dc = session.dc;
            if (!dc || dc.readyState !== 'open') {
                if (session.onError) session.onError('Канал не открыт');
                return;
            }

            const sender = getSenderProfile();
            const meta = JSON.stringify({
                name: session.fileData.name,
                size: session.fileData.size,
                type: session.fileData.type || 'application/octet-stream',
                sender: sender
            });
            dc.send(meta);

            let offset = 0;
            const total = bytes.length;
            let lastReportedPct = -1;

            function report() {
                if (!session.onProgress) return;
                const acked = Math.max(0, offset - dc.bufferedAmount);
                const pct = total > 0 ? Math.min(99, Math.floor((acked / total) * 100)) : 0;
                if (pct !== lastReportedPct) {
                    lastReportedPct = pct;
                    session.onProgress(pct, acked);
                }
            }

            function pump() {
                if (session.closed) return;
                if (dc.readyState !== 'open') return;

                while (offset < total) {
                    if (dc.bufferedAmount >= BUFFER_HIGH) break;
                    const end = Math.min(offset + CHUNK_SIZE, total);
                    const chunk = bytes.subarray(offset, end);
                    try {
                        dc.send(chunk);
                    } catch(e) {
                        log('send error', e);
                        if (session.onError) session.onError('Ошибка отправки: ' + (e.message || ''));
                        return;
                    }
                    offset = end;
                }

                report();

                if (offset >= total) {
                    try { dc.send(JSON.stringify({ done: true })); } catch(e) {}
                    if (session.onProgress) session.onProgress(100, total);
                    if (session.onFinished) session.onFinished();
                    return;
                }

                if (dc.bufferedAmount >= BUFFER_HIGH) {
                    const onLow = function() {
                        dc.removeEventListener('bufferedamountlow', onLow);
                        if (!session.closed && dc.readyState === 'open') {
                            pump();
                        }
                    };
                    dc.addEventListener('bufferedamountlow', onLow);
                } else {
                    setTimeout(pump, 0);
                }
            }

            pump();
        } catch(e) {
            log('startSend error', e);
            if (session.onError) session.onError(e.message || 'Ошибка');
        }
    }

    function openCooop() {
        if (isOpen) {
            const ex = document.getElementById('cooopApp');
            if (ex) { ex.style.display = 'flex'; return; }
        }
        createUI();
    }

    function closeCooop() {
        isOpen = false;
        if (activeHost) {
            try { activeHost.close(); } catch(e) {}
            activeHost = null;
        }
        const el = document.getElementById('cooopApp');
        if (!el) return;
        if (window.ShnukCloseAnimation) {
            window.ShnukCloseAnimation(el, 'cooop', function() { el.remove(); });
        } else {
            el.remove();
        }
    }

    function destroy() {
        isOpen = false;
        if (activeHost) {
            try { activeHost.close(); } catch(e) {}
            activeHost = null;
        }
        const el = document.getElementById('cooopApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') closeCooop();
    }

    function switchScreen(screen) {
        mode = screen;
        const container = document.getElementById('cooopContent');
        if (!container) return;
        container.innerHTML = '';
        if (screen === 'menu') renderMenu(container);
        else if (screen === 'send') renderSendScreen(container);
        else if (screen === 'receive') renderReceiveScreen(container);
    }

    function renderMenu(container) {
        container.innerHTML = `
            <div class="cooop-menu">
                <button class="cooop-menu-btn send" id="cooopSendBtn">
                    <span class="cooop-menu-title">РАЗДАТЬ ФАЙЛ</span>
                    <span class="cooop-menu-desc">Создайте приглашение и отправьте его получателю. Файл останется на этом устройстве и пойдёт напрямую по WebRTC.</span>
                </button>
                <button class="cooop-menu-btn receive" id="cooopReceiveBtn">
                    <span class="cooop-menu-title">ПОЛУЧИТЬ ФАЙЛ</span>
                    <span class="cooop-menu-desc">Вставьте приглашение от раздающего и сгенерируйте ответ</span>
                </button>
            </div>
        `;
        document.getElementById('cooopSendBtn').addEventListener('click', function() { switchScreen('send'); });
        document.getElementById('cooopReceiveBtn').addEventListener('click', function() { switchScreen('receive'); });
    }

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
                <div class="cooop-status-msg" id="cooopStatusMsg" style="display:none;"></div>
            </div>

            <div class="cooop-section" id="cooopInviteSection" style="display:none;">
                <div class="cooop-section-title">Шаг 2. Отправьте приглашение получателю</div>
                <div class="cooop-desc">Скопируйте эту строку и отправьте её получателю любым способом (мессенджер, почта, QR).</div>
                <textarea class="cooop-link" id="cooopInviteText" readonly></textarea>
                <div class="cooop-hint" id="cooopInviteHint" style="display:none;">
                    Текст выделен — нажмите «Копировать» в системном меню
                </div>
                <button class="cooop-btn" id="cooopCopyInviteBtn">СКОПИРОВАТЬ ПРИГЛАШЕНИЕ</button>
            </div>

            <div class="cooop-section" id="cooopAnswerSection" style="display:none;">
                <div class="cooop-section-title">Шаг 3. Вставьте ответ получателя</div>
                <div class="cooop-desc">Получатель отправит вам ответную строку. Вставьте её сюда.</div>
                <textarea class="cooop-link" id="cooopAnswerInput" placeholder="Вставьте ответную строку..."></textarea>
                <button class="cooop-btn" id="cooopAcceptAnswerBtn">УСТАНОВИТЬ СОЕДИНЕНИЕ</button>
                <div class="cooop-status-msg" id="cooopConnectStatus" style="display:none;"></div>
            </div>

            <div class="cooop-section" id="cooopSendProgressSection" style="display:none;">
                <div class="cooop-section-title">Отправка файла</div>
                <div class="cooop-desc" id="cooopSendStats">—</div>
                <div class="cooop-progress">
                    <div class="cooop-progress-bar" id="cooopSendProgressBar"></div>
                </div>
                <button class="cooop-btn-secondary" id="cooopCancelSendBtn" style="margin-top:14px;">ОТМЕНИТЬ</button>
            </div>

            <div class="cooop-back-row">
                <button class="cooop-btn-secondary" id="cooopSendBack">← Назад</button>
            </div>
        `;

        const fileInput = document.getElementById('cooopFileInput');
        const fileSelect = document.getElementById('cooopFileSelect');
        const fileInfo = document.getElementById('cooopFileInfo');
        const inviteSection = document.getElementById('cooopInviteSection');
        const inviteText = document.getElementById('cooopInviteText');
        const inviteHint = document.getElementById('cooopInviteHint');
        const answerSection = document.getElementById('cooopAnswerSection');
        const answerInput = document.getElementById('cooopAnswerInput');
        const connectStatus = document.getElementById('cooopConnectStatus');
        const sendProgressSection = document.getElementById('cooopSendProgressSection');
        const sendStats = document.getElementById('cooopSendStats');
        const sendProgressBar = document.getElementById('cooopSendProgressBar');
        const statusMsg = document.getElementById('cooopStatusMsg');

        fileSelect.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async function() {
            if (!this.files || !this.files[0]) return;
            const f = this.files[0];

            statusMsg.style.display = 'none';
            inviteSection.style.display = 'none';
            answerSection.style.display = 'none';
            sendProgressSection.style.display = 'none';
            connectStatus.style.display = 'none';
            sendProgressBar.style.width = '0%';

            if (f.size > MAX_FILE_SIZE) {
                statusMsg.style.display = 'block';
                statusMsg.textContent = 'Файл ' + formatSize(f.size) + ' — больше лимита ' + formatSize(MAX_FILE_SIZE);
                return;
            }

            if (activeHost) {
                try { activeHost.close(); } catch(e) {}
                activeHost = null;
            }

            fileInfo.style.display = 'block';
            fileInfo.textContent = f.name + ' — ' + formatSize(f.size);
            fileSelect.querySelector('.cooop-file-select-icon').textContent = '...';
            fileSelect.querySelector('.cooop-file-select-text').textContent = 'Создание приглашения...';

            try {
                const session = createHostSession({
                    name: f.name,
                    size: f.size,
                    type: f.type || 'application/octet-stream',
                    blob: f
                }, {
                    onStatus: function(st) {
                        if (st === 'connected') {
                            connectStatus.style.display = 'block';
                            connectStatus.textContent = 'Соединение установлено. Начинаю передачу...';
                            sendProgressSection.style.display = 'block';
                            sendStats.innerHTML =
                                'Файл: <b>' + escapeHtml(f.name) + '</b> (' + formatSize(f.size) + ')<br>' +
                                'Отправлено: <b>0%</b>';
                        } else if (st === 'ice-checking') {
                            connectStatus.style.display = 'block';
                            connectStatus.textContent = 'Установка соединения...';
                        } else if (st === 'ice-connected' || st === 'ice-completed') {
                            connectStatus.style.display = 'block';
                            connectStatus.textContent = 'Соединение установлено';
                        } else if (st === 'ice-failed') {
                            connectStatus.style.display = 'block';
                            connectStatus.textContent = 'Не удалось установить соединение';
                        } else if (st === 'disconnected') {
                            if (!session.closed) {
                                connectStatus.style.display = 'block';
                                connectStatus.textContent = 'Соединение потеряно';
                            }
                        }
                    },
                    onProgress: function(pct, acked) {
                        sendProgressBar.style.width = pct + '%';
                        sendStats.innerHTML =
                            'Файл: <b>' + escapeHtml(f.name) + '</b> (' + formatSize(f.size) + ')<br>' +
                            'Отправлено: <b>' + pct + '%</b>' +
                            (acked ? ' (' + formatSize(acked) + ')' : '');
                    },
                    onFinished: function() {
                        sendStats.innerHTML =
                            'Файл: <b>' + escapeHtml(f.name) + '</b> (' + formatSize(f.size) + ')<br>' +
                            '<b style="color:#2e7d32;">Передача завершена</b>';
                        if (window.Win && window.Win.notify) {
                            window.Win.notify('Файл отправлен', { type: 'success' });
                        }
                    },
                    onError: function(msg) {
                        connectStatus.style.display = 'block';
                        connectStatus.textContent = 'Ошибка: ' + msg;
                    }
                });
                activeHost = session;

                const offer = await session.createOffer();
                inviteText.value = offer;
                inviteSection.style.display = 'block';
                answerSection.style.display = 'block';
                fileSelect.querySelector('.cooop-file-select-icon').textContent = '✓';
                fileSelect.querySelector('.cooop-file-select-text').textContent = 'Приглашение готово';
            } catch(e) {
                log('host offer error', e);
                statusMsg.style.display = 'block';
                statusMsg.textContent = 'Ошибка создания приглашения: ' + (e.message || 'неизвестная');
                fileSelect.querySelector('.cooop-file-select-icon').textContent = '+';
                fileSelect.querySelector('.cooop-file-select-text').textContent = 'Нажмите, чтобы выбрать файл';
            }
        });

        inviteText.addEventListener('click', function() { selectAllInField(inviteText); });
        inviteText.addEventListener('focus', function() { selectAllInField(inviteText); });

        document.getElementById('cooopCopyInviteBtn').addEventListener('click', async function() {
            const text = inviteText.value.trim();
            if (!text) return;
            const ok = await copyText(text, inviteText);
            if (ok) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Приглашение скопировано', { type: 'success' });
                }
                inviteHint.style.display = 'none';
            } else {
                inviteHint.style.display = 'block';
            }
        });

        document.getElementById('cooopAcceptAnswerBtn').addEventListener('click', async function() {
            const text = answerInput.value.trim();
            if (!text) {
                connectStatus.style.display = 'block';
                connectStatus.textContent = 'Вставьте ответную строку';
                return;
            }
            connectStatus.style.display = 'block';
            connectStatus.textContent = 'Установка соединения...';
            try {
                await activeHost.acceptAnswer(text);
                connectStatus.textContent = 'Установка соединения...';
            } catch(e) {
                connectStatus.textContent = 'Ошибка: ' + (e.message || 'не удалось установить соединение');
            }
        });

        document.getElementById('cooopCancelSendBtn').addEventListener('click', function() {
            if (activeHost) {
                try { activeHost.close(); } catch(e) {}
                activeHost = null;
            }
            sendProgressSection.style.display = 'none';
            connectStatus.style.display = 'block';
            connectStatus.textContent = 'Передача отменена';
        });

        document.getElementById('cooopSendBack').addEventListener('click', function() {
            if (activeHost) {
                try { activeHost.close(); } catch(e) {}
                activeHost = null;
            }
            switchScreen('menu');
        });
    }

    function buildSenderBadge(sender) {
        if (!sender || !sender.code) return '';
        const isFriend = window.ShnukAccount && window.ShnukAccount.isFriend(sender.code);
        if (!isFriend) return '';

        let avatarHtml = '';
        if (sender.avatar) {
            avatarHtml = '<img src="' + sender.avatar + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;display:block;" />';
        } else {
            const initial = (sender.name || '?').charAt(0).toUpperCase();
            avatarHtml = '<span style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#cc0000;color:#fff;font-weight:700;font-size:15px;">' + escapeHtml(initial) + '</span>';
        }

        return '<div class="cooop-sender-badge">' +
            avatarHtml +
            '<div class="cooop-sender-info">' +
                '<div class="cooop-sender-name">' + escapeHtml(sender.name || 'Друг') + '</div>' +
                '<div class="cooop-sender-sub">Друг Shnuk</div>' +
            '</div>' +
        '</div>';
    }

    function renderReceiveScreen(container) {
        container.innerHTML = `
            <div class="cooop-section">
                <div class="cooop-section-title">Шаг 1. Вставьте приглашение</div>
                <div class="cooop-desc">Скопируйте строку, которую вам отправил раздающий, и вставьте сюда.</div>
                <textarea class="cooop-link" id="cooopOfferInput" placeholder="Вставьте приглашение..."></textarea>
                <button class="cooop-btn" id="cooopGenerateAnswerBtn">СГЕНЕРИРОВАТЬ ОТВЕТ</button>
                <div class="cooop-status-msg" id="cooopRecvStatus" style="display:none;"></div>
            </div>

            <div class="cooop-section" id="cooopAnswerOutSection" style="display:none;">
                <div class="cooop-section-title">Шаг 2. Отправьте ответ раздающему</div>
                <div class="cooop-desc">Скопируйте эту строку и отправьте её обратно раздающему.</div>
                <textarea class="cooop-link" id="cooopAnswerOutText" readonly></textarea>
                <button class="cooop-btn" id="cooopCopyAnswerBtn">СКОПИРОВАТЬ ОТВЕТ</button>
            </div>

            <div class="cooop-section" id="cooopReceiveProgressSection" style="display:none;">
                <div class="cooop-section-title">Получение файла</div>
                <div id="cooopSenderHolder"></div>
                <div class="cooop-desc" id="cooopReceiveStats">—</div>
                <div class="cooop-progress">
                    <div class="cooop-progress-bar" id="cooopReceiveProgressBar"></div>
                </div>
                <button class="cooop-btn" id="cooopDownloadBtn" disabled style="margin-top:14px;">СКАЧАТЬ ФАЙЛ</button>
            </div>

            <div class="cooop-back-row">
                <button class="cooop-btn-secondary" id="cooopRecvBack">← Назад</button>
            </div>
        `;

        const offerInput = document.getElementById('cooopOfferInput');
        const answerOutSection = document.getElementById('cooopAnswerOutSection');
        const answerOutText = document.getElementById('cooopAnswerOutText');
        const recvStatus = document.getElementById('cooopRecvStatus');
        const receiveProgressSection = document.getElementById('cooopReceiveProgressSection');
        const receiveStats = document.getElementById('cooopReceiveStats');
        const receiveProgressBar = document.getElementById('cooopReceiveProgressBar');
        const downloadBtn = document.getElementById('cooopDownloadBtn');
        const senderHolder = document.getElementById('cooopSenderHolder');

        let pc = null;
        let dc = null;
        let receivedChunks = [];
        let receivedBytes = 0;
        let expectedMeta = null;
        let finalBlob = null;
        let finished = false;

        function finishDownload() {
            if (finished) return;
            finished = true;
            receiveProgressBar.style.width = '100%';

            let total = 0;
            for (const c of receivedChunks) total += c.length;
            const merged = new Uint8Array(total);
            let off = 0;
            for (const c of receivedChunks) {
                merged.set(c, off);
                off += c.length;
            }
            receivedChunks = [];

            const mime = (expectedMeta && expectedMeta.type) || 'application/octet-stream';
            finalBlob = new Blob([merged], { type: mime });

            receiveStats.innerHTML =
                'Файл: <b>' + escapeHtml(expectedMeta ? expectedMeta.name : 'файл') + '</b><br>' +
                'Получено: <b>' + formatSize(merged.length) + '</b>';
            downloadBtn.disabled = false;
        }

        function applySender(sender) {
            if (!senderHolder) return;
            senderHolder.innerHTML = '';
            const badge = buildSenderBadge(sender);
            if (badge) senderHolder.innerHTML = badge;
        }

        function attachDataChannel(channel) {
            dc = channel;
            dc.binaryType = 'arraybuffer';

            dc.onopen = function() {
                log('guest DC open');
                recvStatus.textContent = 'Соединение установлено. Ожидание файла...';
            };

            dc.onmessage = function(event) {
                const data = event.data;
                if (typeof data === 'string') {
                    let msg;
                    try { msg = JSON.parse(data); } catch(e) { return; }
                    if (msg.done) {
                        finishDownload();
                        return;
                    }
                    if (msg.name) {
                        expectedMeta = msg;
                        receiveStats.innerHTML =
                            'Файл: <b>' + escapeHtml(msg.name) + '</b> (' + formatSize(msg.size) + ')';
                        if (msg.sender) applySender(msg.sender);
                    }
                    return;
                }
                if (data instanceof ArrayBuffer) {
                    receivedChunks.push(new Uint8Array(data));
                    receivedBytes += data.byteLength;
                    if (expectedMeta && expectedMeta.size > 0) {
                        const pct = Math.min(99, Math.round((receivedBytes / expectedMeta.size) * 100));
                        receiveProgressBar.style.width = pct + '%';
                        receiveStats.innerHTML =
                            'Файл: <b>' + escapeHtml(expectedMeta.name) + '</b><br>' +
                            'Получено: <b>' + formatSize(receivedBytes) + '</b> из <b>' + formatSize(expectedMeta.size) + '</b>';
                    } else {
                        receiveStats.textContent = 'Получено: ' + formatSize(receivedBytes);
                    }
                }
            };

            dc.onclose = function() {
                log('guest DC closed');
                if (!finished) {
                    recvStatus.textContent = 'Раздающий отключился';
                }
            };
        }

        document.getElementById('cooopGenerateAnswerBtn').addEventListener('click', async function() {
            const text = offerInput.value.trim();
            if (!text) {
                recvStatus.style.display = 'block';
                recvStatus.textContent = 'Вставьте приглашение';
                return;
            }
            recvStatus.style.display = 'block';
            recvStatus.textContent = 'Обработка приглашения...';

            try {
                const json = base64Decode(text);
                if (!json) throw new Error('Неверное приглашение');
                let data;
                try { data = JSON.parse(json); } catch(e) { throw new Error('Неверный формат приглашения'); }
                if (!data || data.t !== 'offer' || !data.sdp) throw new Error('Это не приглашение');

                if (pc) { try { pc.close(); } catch(e) {} }
                pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
                try {
                    if ('iceTransportPolicy' in pc) {
                        pc.setConfiguration({ iceServers: ICE_SERVERS, iceTransportPolicy: ICE_TRANSPORT_POLICY });
                    }
                } catch(e) {}

                pc.ondatachannel = function(event) {
                    attachDataChannel(event.channel);
                };
                let lastIceState = '';
                pc.oniceconnectionstatechange = function() {
                    const st = pc.iceConnectionState;
                    if (st === lastIceState) return;
                    lastIceState = st;
                    log('guest ice', st);
                    if (st === 'checking') {
                        recvStatus.textContent = 'Установка соединения...';
                    } else if (st === 'connected' || st === 'completed') {
                        recvStatus.textContent = 'Соединение установлено';
                    } else if (st === 'failed') {
                        recvStatus.textContent = 'Не удалось установить соединение';
                    }
                };
                pc.onicecandidateerror = function(e) {
                    log('guest ice candidate error', e && e.errorCode, e && e.url);
                };
                pc.onconnectionstatechange = function() {
                    log('guest conn', pc.connectionState);
                    if (pc.connectionState === 'failed') {
                        recvStatus.textContent = 'Не удалось установить соединение';
                    }
                };

                await pc.setRemoteDescription(new RTCSessionDescription({
                    type: 'offer',
                    sdp: data.sdp
                }));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await waitIceComplete(pc, 12000);

                const payload = JSON.stringify({
                    t: 'answer',
                    sdp: pc.localDescription.sdp
                });
                answerOutText.value = base64Encode(payload);
                answerOutSection.style.display = 'block';
                receiveProgressSection.style.display = 'block';
                receiveStats.innerHTML =
                    'Файл: <b>' + escapeHtml(data.name || 'файл') + '</b> (' + formatSize(data.size || 0) + ')<br>' +
                    'Ожидание соединения...';
                if (data.sender) applySender(data.sender);
                recvStatus.textContent = 'Ответ готов. Отправьте его раздающему.';
            } catch(e) {
                recvStatus.textContent = 'Ошибка: ' + (e.message || 'не удалось обработать приглашение');
            }
        });

        answerOutText.addEventListener('click', function() { selectAllInField(answerOutText); });
        answerOutText.addEventListener('focus', function() { selectAllInField(answerOutText); });

        document.getElementById('cooopCopyAnswerBtn').addEventListener('click', async function() {
            const text = answerOutText.value.trim();
            if (!text) return;
            const ok = await copyText(text, answerOutText);
            if (ok) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Ответ скопирован', { type: 'success' });
                }
            }
        });

        downloadBtn.addEventListener('click', function() {
            if (!finalBlob) return;
            const url = URL.createObjectURL(finalBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (expectedMeta && expectedMeta.name) || 'file';
            document.body.appendChild(a);
            a.click();
            setTimeout(function() {
                URL.revokeObjectURL(url);
                if (a.parentNode) a.parentNode.removeChild(a);
            }, 800);
        });

        document.getElementById('cooopRecvBack').addEventListener('click', function() {
            if (pc) { try { pc.close(); } catch(e) {} }
            pc = null;
            dc = null;
            switchScreen('menu');
        });
    }

    function createUI() {
        let root = document.getElementById('cooopApp');
        if (root) {
            root.style.display = 'flex';
            isOpen = true;
            return;
        }

        injectStyles();

        root = document.createElement('div');
        root.id = 'cooopApp';
        root.style.cssText = `
            position: fixed;
            top: var(--livebar-h, 44px);
            left: 0;
            width: 100%;
            height: calc(100% - var(--livebar-h, 44px));
            background: var(--bg-primary);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            font-family: ${FONT_MAIN};
            color: var(--text-primary);
            opacity: 0;
            animation: cooopFadeIn 0.3s ease forwards;
            transition: background 0.4s ease, color 0.4s ease;
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.className = 'cooop-header';
        header.innerHTML = `
            <h1>Cooop</h1>
            <div class="cooop-header-actions">
                <button id="cooopCloseBtn">✕</button>
            </div>
        `;

        const content = document.createElement('div');
        content.className = 'cooop-content scroll-blur';
        content.id = 'cooopContent';

        root.appendChild(header);
        root.appendChild(content);
        document.body.appendChild(root);

        document.getElementById('cooopCloseBtn').addEventListener('click', closeCooop);
        document.addEventListener('keydown', onKeyDown);

        isOpen = true;
        switchScreen('menu');
    }

    function injectStyles() {
        if (document.getElementById('cooopStyles')) return;
        const style = document.createElement('style');
        style.id = 'cooopStyles';
        style.textContent = `
            @keyframes cooopFadeIn { from { opacity: 0; } to { opacity: 1; } }

            #cooopApp, #cooopApp * {
                font-family: ${FONT_MAIN} !important;
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
                padding: 24px;
                isolation: isolate;
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
            .cooop-desc b {
                color: var(--text-primary);
                font-weight: 700;
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

            .cooop-status-msg {
                margin-top: 12px;
                padding: 12px 14px;
                background: var(--bg-hover);
                border-left: 3px solid var(--accent);
                font-size: 13px;
                color: var(--accent);
                line-height: 1.5;
                word-break: break-word;
            }

            .cooop-progress {
                width: 100%;
                height: 6px;
                background: var(--border-color);
                overflow: hidden;
                margin-top: 12px;
            }
            .cooop-progress-bar {
                height: 100%;
                width: 0%;
                background: var(--accent);
                transition: width 0.25s ease;
            }

            .cooop-link {
                width: 100%;
                min-height: 120px;
                padding: 12px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary);
                color: var(--text-primary);
                font-family: 'Courier New', monospace;
                font-size: 10px;
                line-height: 1.4;
                resize: vertical;
                box-sizing: border-box;
                outline: none;
                margin-bottom: 12px;
                word-break: break-all;
                -webkit-user-select: text;
                user-select: text;
            }
            .cooop-link:focus {
                border-color: var(--accent);
            }

            .cooop-hint {
                font-size: 12px;
                color: var(--accent);
                line-height: 1.4;
                margin-bottom: 12px;
                padding: 8px 10px;
                background: var(--bg-hover);
                border-left: 3px solid var(--accent);
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

            .cooop-back-row {
                max-width: 640px;
                margin: 0 auto 24px;
            }

            .cooop-sender-badge {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px 14px;
                background: var(--bg-hover);
                border-left: 3px solid var(--accent);
                margin-bottom: 12px;
            }
            .cooop-sender-info {
                display: flex;
                flex-direction: column;
                gap: 2px;
                min-width: 0;
            }
            .cooop-sender-name {
                font-size: 14px;
                font-weight: 700;
                color: var(--text-primary);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .cooop-sender-sub {
                font-size: 11px;
                color: var(--text-muted);
                letter-spacing: 0.5px;
            }

            @media (max-width: 500px) {
                .cooop-content { padding: 16px; }
                .cooop-menu-btn { padding: 22px 20px; }
                .cooop-menu-title { font-size: 17px; }
                .cooop-menu-desc { font-size: 12px; }
                .cooop-section { padding: 16px; }
                .cooop-section-title { font-size: 14px; }
                .cooop-link { font-size: 9px; min-height: 100px; }
            }
        `;
        document.head.appendChild(style);
    }

    window.Cooop = {
        destroy: destroy,
        open: openCooop,
        MAX_FILE_SIZE: MAX_FILE_SIZE
    };
    window.cooopInit = function() { openCooop(); };

})();