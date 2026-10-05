// cooop-messenger.js — P2P-мессенджер через WebRTC (PeerJS signaling)

(function() {
    'use strict';

    const PEER_PREFIX = 'shnuk-msg-';
    const CODE_LENGTH = 8;
    const MAX_MESSAGE_LENGTH = 2000;
    const MAX_HISTORY = 500;

    const PEERJS_CDNS = [
        'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
        'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'
    ];

    const ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
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

    const FONT_MAIN = "'TTPaplane', monospace";

    let isOpen = false;
    let mode = 'menu'; // 'menu' | 'host' | 'join' | 'chat'
    let peer = null;
    let peerJsLoaded = false;
    let peerJsLoading = false;
    let activeConnection = null;
    let myCode = null;
    let myNickname = '';
    let remoteNickname = '';
    let isConnecting = false;
    let messages = [];      // { id, from: 'me' | 'them' | 'system', text, time }

    function log() {
        try { console.log.apply(console, ['[CooopMsg]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }
    function err() {
        try { console.warn.apply(console, ['[CooopMsg]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    // ============================================
    // PEERJS ЗАГРУЗКА
    // ============================================

    function loadFromUrl(url) {
        return new Promise(function(resolve) {
            const s = document.createElement('script');
            s.src = url;
            s.async = true;
            s.onload = function() { resolve(typeof Peer !== 'undefined'); };
            s.onerror = function() { resolve(false); };
            document.head.appendChild(s);
        });
    }

    async function loadPeerJS() {
        if (typeof Peer !== 'undefined') { peerJsLoaded = true; return true; }
        if (peerJsLoading) {
            let tries = 0;
            while (peerJsLoading && tries < 100) {
                await new Promise(r => setTimeout(r, 50));
                tries++;
            }
            return typeof Peer !== 'undefined';
        }
        peerJsLoading = true;
        try {
            for (const url of PEERJS_CDNS) {
                const ok = await loadFromUrl(url);
                if (ok) {
                    peerJsLoaded = true;
                    peerJsLoading = false;
                    return true;
                }
            }
            peerJsLoaded = false;
            peerJsLoading = false;
            return false;
        } catch(e) {
            peerJsLoading = false;
            return false;
        }
    }

    // ============================================
    // КОДЫ
    // ============================================

    function generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let out = '';
        for (let i = 0; i < CODE_LENGTH; i++) {
            out += chars[Math.floor(Math.random() * chars.length)];
        }
        return out;
    }

    function peerIdFromCode(code) {
        return PEER_PREFIX + code.toUpperCase();
    }

    function createPeerWithId(id) {
        return new Promise(function(resolve, reject) {
            let p;
            try {
                p = new Peer(id, {
                    config: { iceServers: ICE_SERVERS },
                    debug: 1
                });
            } catch(e) {
                reject(e);
                return;
            }

            let resolved = false;
            const timeout = setTimeout(function() {
                if (resolved) return;
                resolved = true;
                try { p.destroy(); } catch(e) {}
                reject({ type: 'timeout', message: 'Тайм-аут подключения к PeerJS' });
            }, 10000);

            p.on('open', function() {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeout);
                resolve(p);
            });

            p.on('error', function(e) {
                if (resolved) {
                    err('post-open error', e);
                    return;
                }
                resolved = true;
                clearTimeout(timeout);
                try { p.destroy(); } catch(e2) {}
                reject(e);
            });
        });
    }

    function translatePeerError(e) {
        if (!e) return 'неизвестная ошибка';
        if (e.type === 'unavailable-id') return 'код уже занят';
        if (e.type === 'network') return 'нет связи с PeerJS Cloud';
        if (e.type === 'server-error') return 'ошибка сервера PeerJS';
        if (e.type === 'browser-incompatible') return 'браузер не поддерживает WebRTC';
        if (e.type === 'ssl-unavailable') return 'нужно HTTPS-соединение';
        if (e.message) return e.message;
        return e.type || 'неизвестная ошибка';
    }

    // ============================================
    // UI
    // ============================================

    function openMessenger() {
        if (isOpen) {
            const ex = document.getElementById('cooopMessengerApp');
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }
        createUI();
    }

    function closeMessenger() {
        isOpen = false;
        cleanupPeer();
        document.removeEventListener('keydown', onKeyDown);

        const el = document.getElementById('cooopMessengerApp');
        if (!el) return;

        if (window.ShnukCloseAnimation) {
            window.ShnukCloseAnimation(el, 'cooop-messenger', function() {
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
        const el = document.getElementById('cooopMessengerApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') {
            if (mode === 'chat') {
                // Не закрываем сразу в чате — сначала выходим в меню
                disconnect();
                switchScreen('menu');
                return;
            }
            closeMessenger();
        }
    }

    function cleanupPeer() {
        try {
            if (activeConnection) {
                activeConnection.removeAllListeners();
                try { activeConnection.close(); } catch(e) {}
                activeConnection = null;
            }
        } catch(e) {}
        try {
            if (peer) {
                peer.removeAllListeners();
                try { peer.destroy(); } catch(e) {}
                peer = null;
            }
        } catch(e) {}
        myCode = null;
        remoteNickname = '';
        isConnecting = false;
    }

    function disconnect() {
        cleanupPeer();
        messages = [];
        updateChatUI();
    }

    function switchScreen(screen) {
        mode = screen;
        const container = document.getElementById('cooopMsgContent');
        if (!container) return;
        container.innerHTML = '';
        if (screen === 'menu') renderMenu(container);
        else if (screen === 'host') renderHostScreen(container);
        else if (screen === 'join') renderJoinScreen(container);
        else if (screen === 'chat') renderChatScreen(container);
    }

    // ============================================
    // МЕНЮ
    // ============================================

    function renderMenu(container) {
        container.innerHTML = `
            <div class="cm-menu">
                <button class="cm-menu-btn host" id="cmHostBtn">
                    <span class="cm-menu-title">СОЗДАТЬ ЧАТ</span>
                    <span class="cm-menu-desc">Получить код и отправить его собеседнику</span>
                </button>
                <button class="cm-menu-btn join" id="cmJoinBtn">
                    <span class="cm-menu-title">ПОДКЛЮЧИТЬСЯ</span>
                    <span class="cm-menu-desc">Ввести код от собеседника и начать общение</span>
                </button>
            </div>
        `;
        document.getElementById('cmHostBtn').addEventListener('click', function() {
            switchScreen('host');
        });
        document.getElementById('cmJoinBtn').addEventListener('click', function() {
            switchScreen('join');
        });
    }

    // ============================================
    // СОЗДАТЬ ЧАТ
    // ============================================

    function renderHostScreen(container) {
        container.innerHTML = `
            <div class="cm-section">
                <div class="cm-section-title">Ваше имя</div>
                <input type="text" class="cm-input-name" id="cmHostName" placeholder="Введите имя" maxlength="24" autocomplete="off" />
            </div>

            <div class="cm-section">
                <div class="cm-section-title">Код комнаты</div>
                <div class="cm-desc">Пока это окно открыто, собеседник может ввести код и присоединиться.</div>
                <div class="cm-bigcode" id="cmHostCode">········</div>
                <button class="cm-btn-secondary" id="cmHostCopyBtn">Скопировать код</button>
            </div>

            <div class="cm-section" id="cmHostStatusSection" style="display:none;">
                <div class="cm-section-title">Статус</div>
                <div class="cm-status" id="cmHostStatus">—</div>
            </div>

            <div class="cm-back-row">
                <button class="cm-btn-secondary" id="cmHostBack">← Назад</button>
            </div>
        `;

        const nameInput = document.getElementById('cmHostName');
        const codeEl = document.getElementById('cmHostCode');

        nameInput.value = myNickname || '';
        nameInput.addEventListener('input', function() {
            myNickname = this.value.trim().slice(0, 24);
        });

        // Генерируем код сразу
        startHosting().then(function(code) {
            if (!code) return;
            myCode = code;
            codeEl.textContent = code;
            setHostStatus('Код готов. Ждём собеседника...');
        }).catch(function(e) {
            err('startHosting', e);
            codeEl.textContent = 'Ошибка';
            setHostStatus('Ошибка: ' + translatePeerError(e));
            if (window.Win && window.Win.notify) {
                window.Win.notify('Не удалось создать код: ' + translatePeerError(e), { type: 'error', duration: 5000 });
            }
        });

        document.getElementById('cmHostCopyBtn').addEventListener('click', function() {
            const code = codeEl.textContent.trim();
            if (!code || code.indexOf('·') !== -1) return;
            copyToClipboard(code);
            if (window.Win && window.Win.notify) {
                window.Win.notify('Код скопирован', { type: 'success' });
            }
        });

        document.getElementById('cmHostBack').addEventListener('click', function() {
            cleanupPeer();
            switchScreen('menu');
        });
    }

    function setHostStatus(text) {
        const el = document.getElementById('cmHostStatus');
        const section = document.getElementById('cmHostStatusSection');
        if (section) section.style.display = 'block';
        if (el) el.textContent = text;
    }

    async function startHosting() {
        cleanupPeer();

        const ok = await loadPeerJS();
        if (!ok) {
            throw new Error('Не удалось загрузить PeerJS (проверьте интернет)');
        }

        for (let attempt = 0; attempt < 5; attempt++) {
            const code = generateCode();
            const id = peerIdFromCode(code);

            try {
                const p = await createPeerWithId(id);
                peer = p;
                myCode = code;

                peer.on('connection', function(conn) {
                    onIncomingConnection(conn);
                });

                peer.on('error', function(e) {
                    err('peer error after open', e);
                });

                return code;
            } catch(e) {
                err('attempt ' + attempt + ' failed', e);
                if (e && e.type === 'unavailable-id') continue;
                throw e;
            }
        }
        throw new Error('Не удалось занять свободный код. Попробуйте позже.');
    }

    function onIncomingConnection(conn) {
        if (activeConnection) {
            try { conn.close(); } catch(e) {}
            return;
        }
        activeConnection = conn;

        conn.on('open', function() {
            log('connection open');
            setHostStatus('Собеседник подключился');
            // Отправим свой ник
            sendSystem('hello', { nickname: myNickname || 'Собеседник' });
        });

        conn.on('data', function(data) {
            handleIncomingData(data);
        });

        conn.on('close', function() {
            log('connection closed');
            if (activeConnection === conn) {
                activeConnection = null;
                addSystemMessage('Собеседник отключился');
                setHostStatus('Собеседник отключился');
                if (mode === 'chat') updateChatUI();
            }
        });

        conn.on('error', function(e) {
            err('connection error', e);
        });
    }

    // ============================================
    // ПОДКЛЮЧИТЬСЯ
    // ============================================

    function renderJoinScreen(container) {
        container.innerHTML = `
            <div class="cm-section">
                <div class="cm-section-title">Ваше имя</div>
                <input type="text" class="cm-input-name" id="cmJoinName" placeholder="Введите имя" maxlength="24" autocomplete="off" />
            </div>

            <div class="cm-section">
                <div class="cm-section-title">Код комнаты</div>
                <div class="cm-desc">Введите код, который вам прислал собеседник.</div>
                <input type="text" class="cm-input-code" id="cmJoinCode" placeholder="········" maxlength="${CODE_LENGTH}" autocomplete="off" spellcheck="false" />
                <button class="cm-btn" id="cmJoinConnectBtn">ПОДКЛЮЧИТЬСЯ</button>
            </div>

            <div class="cm-section" id="cmJoinStatusSection" style="display:none;">
                <div class="cm-section-title">Статус</div>
                <div class="cm-status" id="cmJoinStatus">—</div>
            </div>

            <div class="cm-back-row">
                <button class="cm-btn-secondary" id="cmJoinBack">← Назад</button>
            </div>
        `;

        const nameInput = document.getElementById('cmJoinName');
        const codeInput = document.getElementById('cmJoinCode');
        const connectBtn = document.getElementById('cmJoinConnectBtn');

        nameInput.value = myNickname || '';
        nameInput.addEventListener('input', function() {
            myNickname = this.value.trim().slice(0, 24);
        });

        codeInput.addEventListener('input', function() {
            this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });
        codeInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') connectBtn.click();
        });

        connectBtn.addEventListener('click', function() {
            if (isConnecting) return;
            const code = codeInput.value.trim().toUpperCase();
            if (!code || code.length < 4) {
                setJoinStatus('Введите код полностью');
                return;
            }
            isConnecting = true;
            connectBtn.disabled = true;
            connectBtn.textContent = 'ПОДКЛЮЧЕНИЕ...';
            setJoinStatus('Подключение к ' + code + '...');

            connectToHost(code).then(function() {
                isConnecting = false;
                // После успешного подключения переключаемся в чат
            }).catch(function(e) {
                err('connectToHost', e);
                setJoinStatus('Ошибка: ' + translatePeerError(e));
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Ошибка: ' + translatePeerError(e), { type: 'error', duration: 5000 });
                }
            }).then(function() {
                isConnecting = false;
                connectBtn.disabled = false;
                connectBtn.textContent = 'ПОДКЛЮЧИТЬСЯ';
            });
        });

        document.getElementById('cmJoinBack').addEventListener('click', function() {
            cleanupPeer();
            switchScreen('menu');
        });
    }

    function setJoinStatus(text) {
        const el = document.getElementById('cmJoinStatus');
        const section = document.getElementById('cmJoinStatusSection');
        if (section) section.style.display = 'block';
        if (el) el.textContent = text;
    }

    async function connectToHost(code) {
        cleanupPeer();

        const ok = await loadPeerJS();
        if (!ok) throw new Error('Не удалось загрузить PeerJS');

        const remoteId = peerIdFromCode(code);
        const clientId = PEER_PREFIX + 'client-' +
            Math.random().toString(36).slice(2, 10) +
            Date.now().toString(36);

        const p = await createPeerWithId(clientId);
        peer = p;

        const conn = p.connect(remoteId, { reliable: true, serialization: 'json' });
        activeConnection = conn;

        return new Promise(function(resolve, reject) {
            let resolved = false;
            const timeout = setTimeout(function() {
                if (resolved) return;
                resolved = true;
                try { conn.close(); } catch(e) {}
                reject({ type: 'timeout', message: 'Отправитель не отвечает' });
            }, 20000);

            conn.on('open', function() {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeout);
                // Отправим свой ник
                sendSystem('hello', { nickname: myNickname || 'Собеседник' });
                // Переходим в чат
                switchScreen('chat');
                setTimeout(function() {
                    addSystemMessage('Вы подключились к комнате');
                    updateChatUI();
                    focusChatInput();
                }, 100);
                resolve();
            });

            conn.on('data', function(data) {
                handleIncomingData(data);
            });

            conn.on('close', function() {
                if (resolved) {
                    addSystemMessage('Соединение закрыто');
                    updateChatUI();
                } else {
                    resolved = true;
                    clearTimeout(timeout);
                    reject({ type: 'closed', message: 'Соединение закрыто' });
                }
            });

            conn.on('error', function(e) {
                err('connection error', e);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    reject(e && e.type === 'peer-unavailable'
                        ? { type: 'peer-unavailable', message: 'Комната не найдена. Проверьте код.' }
                        : e);
                }
            });
        });
    }

    // ============================================
    // ЧАТ
    // ============================================

    function renderChatScreen(container) {
        container.innerHTML = `
            <div class="cm-chat">
                <div class="cm-chat-header">
                    <div class="cm-chat-partner">
                        <span class="cm-chat-partner-label">Собеседник:</span>
                        <span class="cm-chat-partner-name" id="cmPartnerName">—</span>
                    </div>
                </div>
                <div class="cm-chat-messages" id="cmMessages"></div>
                <div class="cm-chat-input-row">
                    <input type="text" class="cm-chat-input" id="cmMessageInput" placeholder="Сообщение..." maxlength="${MAX_MESSAGE_LENGTH}" autocomplete="off" />
                    <button class="cm-chat-send" id="cmSendBtn">→</button>
                </div>
            </div>
        `;

        // Хост после соединения попадает в режим чата
        if (myCode && !remoteNickname) {
            document.getElementById('cmPartnerName').textContent = 'Подключение...';
        }

        const input = document.getElementById('cmMessageInput');
        const sendBtn = document.getElementById('cmSendBtn');

        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') sendMessage();
        });

        updateChatUI();
    }

    function focusChatInput() {
        const input = document.getElementById('cmMessageInput');
        if (input) setTimeout(() => input.focus(), 100);
    }

    function updateChatUI() {
        const listEl = document.getElementById('cmMessages');
        if (!listEl) return;
        listEl.innerHTML = '';
        messages.forEach(function(msg) {
            const el = document.createElement('div');
            el.className = 'cm-msg cm-msg-' + msg.from;
            if (msg.from === 'system') {
                el.textContent = msg.text;
            } else {
                const meta = document.createElement('div');
                meta.className = 'cm-msg-meta';
                meta.textContent = (msg.from === 'me' ? 'Вы' : (remoteNickname || 'Собеседник')) + ' • ' + formatTime(msg.time);
                const body = document.createElement('div');
                body.className = 'cm-msg-body';
                body.textContent = msg.text;
                el.appendChild(meta);
                el.appendChild(body);
            }
            listEl.appendChild(el);
        });
        // Скролл вниз
        listEl.scrollTop = listEl.scrollHeight;

        const partnerEl = document.getElementById('cmPartnerName');
        if (partnerEl && remoteNickname) {
            partnerEl.textContent = remoteNickname;
        }
    }

    function addSystemMessage(text) {
        messages.push({
            id: 'sys_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            from: 'system',
            text: text,
            time: Date.now()
        });
        if (messages.length > MAX_HISTORY) messages.shift();
        updateChatUI();
    }

    function sendMessage() {
        const input = document.getElementById('cmMessageInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        if (!activeConnection || !activeConnection.open) {
            addSystemMessage('Нет соединения');
            return;
        }
        const msg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            from: 'me',
            text: text.slice(0, MAX_MESSAGE_LENGTH),
            time: Date.now()
        };
        messages.push(msg);
        if (messages.length > MAX_HISTORY) messages.shift();

        try {
            activeConnection.send({
                type: 'chat',
                id: msg.id,
                text: msg.text,
                time: msg.time
            });
        } catch(e) {
            err('send error', e);
            addSystemMessage('Ошибка отправки');
        }

        input.value = '';
        updateChatUI();
        focusChatInput();
    }

    function sendSystem(subtype, payload) {
        if (!activeConnection || !activeConnection.open) return;
        try {
            activeConnection.send(Object.assign({ type: 'system', subtype: subtype }, payload || {}));
        } catch(e) {
            err('sendSystem error', e);
        }
    }

    function handleIncomingData(data) {
        if (!data || typeof data !== 'object') return;

        if (data.type === 'chat') {
            messages.push({
                id: data.id || ('msg_' + Date.now()),
                from: 'them',
                text: String(data.text || ''),
                time: data.time || Date.now()
            });
            if (messages.length > MAX_HISTORY) messages.shift();
            updateChatUI();
            return;
        }

        if (data.type === 'system') {
            if (data.subtype === 'hello') {
                remoteNickname = String(data.nickname || 'Собеседник').slice(0, 24);
                updateChatUI();
                addSystemMessage(remoteNickname + ' присоединился');
            }
            return;
        }
    }

    // ============================================
    // ХЕЛПЕРЫ
    // ============================================

    function formatTime(ts) {
        const d = new Date(ts);
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return h + ':' + m;
    }

    function copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).catch(function() {});
        }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        } catch(e) {}
    }

    // ============================================
    // UI CARCASS
    // ============================================

    function createUI() {
        if (document.getElementById('cooopMessengerApp')) {
            document.getElementById('cooopMessengerApp').style.display = 'flex';
            return;
        }
        isOpen = true;

        const app = document.createElement('div');
        app.id = 'cooopMessengerApp';
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
            font-family: ${FONT_MAIN};
            color: var(--text-primary);
            opacity: 0;
            animation: cmFadeIn 0.3s ease forwards;
            transition: background 0.4s ease, color 0.4s ease;
            overflow: hidden;
        `;

        if (!document.getElementById('cooopMessengerStyles')) {
            const style = document.createElement('style');
            style.id = 'cooopMessengerStyles';
            style.textContent = `
                @keyframes cmFadeIn { from { opacity: 0; } to { opacity: 1; } }

                #cooopMessengerApp, #cooopMessengerApp * {
                    font-family: ${FONT_MAIN} !important;
                }

                .cm-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    background: var(--header-bg);
                    border-bottom: 2px solid var(--border-color);
                    flex-shrink: 0;
                    color: var(--header-text);
                }
                .cm-header h1 {
                    font-size: 20px;
                    font-weight: 600;
                    margin: 0;
                }
                .cm-header-actions button {
                    background: var(--bg-primary);
                    border: 2px solid var(--accent);
                    color: var(--accent);
                    font-size: 18px;
                    padding: 4px 12px;
                    cursor: pointer;
                    font-family: inherit;
                    transition: all 0.2s ease;
                }
                .cm-header-actions button:hover {
                    background: var(--accent);
                    color: var(--text-on-accent);
                }

                .cm-content {
                    position: relative;
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px;
                    isolation: isolate;
                }
                .cm-content.chat-mode {
                    padding: 0;
                    overflow: hidden;
                }

                .cm-menu {
                    max-width: 640px;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                .cm-menu-btn {
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
                .cm-menu-btn:hover {
                    border-color: var(--accent);
                    background: var(--bg-primary);
                }
                .cm-menu-btn.host:hover { border-color: #4CAF50; }
                .cm-menu-btn.join:hover { border-color: #3366cc; }
                .cm-menu-title {
                    font-size: 20px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                }
                .cm-menu-desc {
                    font-size: 13px;
                    color: var(--text-muted);
                    line-height: 1.5;
                }

                .cm-section {
                    max-width: 640px;
                    margin: 0 auto 20px;
                    background: var(--bg-secondary);
                    border: 2px solid var(--border-color);
                    padding: 20px;
                    box-sizing: border-box;
                }
                .cm-section-title {
                    font-size: 14px;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin-bottom: 10px;
                    letter-spacing: 0.3px;
                }
                .cm-desc {
                    font-size: 12px;
                    color: var(--text-muted);
                    line-height: 1.5;
                    margin-bottom: 12px;
                }

                .cm-input-name,
                .cm-input-code {
                    width: 100%;
                    padding: 12px 16px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-family: inherit;
                    font-size: 16px;
                    outline: none;
                    box-sizing: border-box;
                }
                .cm-input-name:focus,
                .cm-input-code:focus {
                    border-color: var(--accent);
                }
                .cm-input-code {
                    font-family: 'Courier New', monospace;
                    font-size: 28px;
                    font-weight: 700;
                    letter-spacing: 6px;
                    text-align: center;
                    text-transform: uppercase;
                    padding: 18px 12px;
                    margin-bottom: 12px;
                }

                .cm-bigcode {
                    font-size: 42px;
                    font-weight: 700;
                    letter-spacing: 8px;
                    text-align: center;
                    padding: 24px 12px;
                    background: var(--bg-primary);
                    border: 2px solid var(--border-color);
                    color: var(--accent);
                    margin-bottom: 12px;
                    font-family: 'Courier New', monospace;
                    user-select: all;
                    -webkit-user-select: all;
                    word-break: break-all;
                }

                .cm-btn,
                .cm-btn-secondary {
                    display: block;
                    width: 100%;
                    padding: 14px 20px;
                    cursor: pointer;
                    font-family: inherit;
                    font-size: 14px;
                    font-weight: 700;
                    letter-spacing: 1px;
                    transition: all 0.2s;
                    box-sizing: border-box;
                }
                .cm-btn {
                    border: none;
                    background: var(--accent);
                    color: var(--text-on-accent);
                }
                .cm-btn:hover {
                    background: var(--accent-dark);
                }
                .cm-btn:disabled {
                    background: #888;
                    cursor: wait;
                }
                .cm-btn-secondary {
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                }
                .cm-btn-secondary:hover {
                    border-color: var(--accent);
                    color: var(--accent);
                }

                .cm-status {
                    font-size: 13px;
                    color: var(--text-primary);
                    word-break: break-all;
                }

                .cm-back-row {
                    max-width: 640px;
                    margin: 0 auto 24px;
                }

                /* ============= ЧАТ ============= */

                .cm-chat {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    width: 100%;
                }
                .cm-chat-header {
                    padding: 12px 20px;
                    background: var(--bg-secondary);
                    border-bottom: 2px solid var(--border-color);
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .cm-chat-partner-label {
                    font-size: 12px;
                    color: var(--text-muted);
                    letter-spacing: 0.5px;
                }
                .cm-chat-partner-name {
                    font-size: 16px;
                    font-weight: 700;
                    color: var(--text-primary);
                }

                .cm-chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    background: var(--bg-primary);
                }
                .cm-msg {
                    max-width: 80%;
                    padding: 10px 14px;
                    word-wrap: break-word;
                    word-break: break-word;
                    font-size: 14px;
                    line-height: 1.4;
                }
                .cm-msg-system {
                    align-self: center;
                    background: none;
                    color: var(--text-muted);
                    font-size: 12px;
                    padding: 4px 12px;
                    letter-spacing: 0.3px;
                    max-width: 100%;
                    text-align: center;
                }
                .cm-msg-me {
                    align-self: flex-end;
                    background: var(--accent);
                    color: var(--text-on-accent);
                    border-radius: 12px 12px 2px 12px;
                }
                .cm-msg-them {
                    align-self: flex-start;
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                    border: 2px solid var(--border-color);
                    border-radius: 12px 12px 12px 2px;
                }
                .cm-msg-meta {
                    font-size: 10px;
                    opacity: 0.7;
                    margin-bottom: 4px;
                    letter-spacing: 0.3px;
                }
                .cm-msg-me .cm-msg-meta {
                    color: var(--text-on-accent);
                    opacity: 0.85;
                    text-align: right;
                }
                .cm-msg-body {
                    word-wrap: break-word;
                    white-space: pre-wrap;
                }

                .cm-chat-input-row {
                    display: flex;
                    gap: 10px;
                    padding: 12px 16px 90px;
                    background: var(--bg-secondary);
                    border-top: 2px solid var(--border-color);
                    flex-shrink: 0;
                    align-items: center;
                    position: relative;
                    z-index: 21;
                }
                .cm-chat-input {
                    flex: 1;
                    padding: 12px 16px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-family: inherit;
                    font-size: 15px;
                    outline: none;
                    box-sizing: border-box;
                }
                .cm-chat-input:focus {
                    border-color: var(--accent);
                }
                .cm-chat-send {
                    width: 48px;
                    height: 48px;
                    border: none;
                    background: var(--accent);
                    color: var(--text-on-accent);
                    cursor: pointer;
                    font-family: inherit;
                    font-size: 20px;
                    font-weight: 700;
                    flex-shrink: 0;
                    transition: background 0.2s, transform 0.15s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .cm-chat-send:hover {
                    background: var(--accent-dark);
                }
                .cm-chat-send:active {
                    transform: scale(0.94);
                }

                @media (max-width: 500px) {
                    .cm-content { padding: 16px; }
                    .cm-menu-btn { padding: 22px 20px; }
                    .cm-menu-title { font-size: 17px; }
                    .cm-section { padding: 16px; }
                    .cm-bigcode { font-size: 32px; letter-spacing: 5px; padding: 18px 8px; }
                    .cm-input-code { font-size: 22px; padding: 14px 10px; letter-spacing: 4px; }
                    .cm-chat-input-row { padding: 10px 12px 90px; gap: 8px; }
                    .cm-chat-send { width: 42px; height: 42px; font-size: 18px; }
                    .cm-msg { max-width: 85%; font-size: 13px; }
                }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'cm-header';
        header.innerHTML = `
            <h1>Cooop Messenger</h1>
            <div class="cm-header-actions">
                <button id="cmCloseBtn">✕</button>
            </div>
        `;

        const content = document.createElement('div');
        content.className = 'cm-content';
        content.id = 'cooopMsgContent';

        app.appendChild(header);
        app.appendChild(content);
        document.body.appendChild(app);

        document.getElementById('cmCloseBtn').addEventListener('click', closeMessenger);
        document.addEventListener('keydown', onKeyDown);

        switchScreen('menu');
    }

    window.CooopMessenger = {
        destroy: destroy,
        open: openMessenger
    };
    window.cooopMessengerInit = function() { openMessenger(); };

})();