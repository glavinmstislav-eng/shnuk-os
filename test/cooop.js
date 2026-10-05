// cooop.js — P2P-шаринг файлов через WebRTC (PeerJS signaling)

(function() {
    'use strict';

    const CHUNK_SIZE = 16 * 1024;
    const MAX_FILE_SIZE = 100 * 1024 * 1024;
    const PEER_PREFIX = 'shnuk-cooop-';
    const CODE_LENGTH = 8;

    // Два CDN на случай, если один недоступен
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

    let isOpen = false;
    let mode = 'menu';
    let peer = null;
    let peerJsLoaded = false;
    let peerJsLoading = false;
    let currentFile = null;
    let myCode = null;
    let activeConnection = null;

    let incomingFile = null;
    let incomingChunks = [];
    let incomingBytes = 0;
    let sendInProgress = false;
    let isConnecting = false;

    const FONT_MAIN = "'TTPaplane', monospace";

    function log() {
        try { console.log.apply(console, ['[Cooop P2P]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }
    function err() {
        try { console.warn.apply(console, ['[Cooop P2P]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    // ============================================
    // PEERJS ЗАГРУЗКА (с резервным CDN)
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
            // Ждём окончания
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
    // КОД
    // ============================================

    function generateCode() {
        // Без похожих символов
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
        incomingFile = null;
        incomingChunks = [];
        incomingBytes = 0;
        sendInProgress = false;
        isConnecting = false;
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
    // МЕНЮ
    // ============================================

    function renderMenu(container) {
        container.innerHTML = `
            <div class="cooop-menu">
                <button class="cooop-menu-btn send" id="cooopSendBtn">
                    <span class="cooop-menu-title">ОТПРАВИТЬ ФАЙЛ</span>
                    <span class="cooop-menu-desc">Выбрать файл и получить короткий код для получателя</span>
                </button>
                <button class="cooop-menu-btn receive" id="cooopReceiveBtn">
                    <span class="cooop-menu-title">ПОЛУЧИТЬ ФАЙЛ</span>
                    <span class="cooop-menu-desc">Введите код от отправителя и скачайте файл</span>
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
    // ОТПРАВИТЕЛЬ
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

            <div class="cooop-section" id="cooopCodeSection" style="display:none;">
                <div class="cooop-section-title">Шаг 2. Отправьте этот код получателю</div>
                <div class="cooop-desc">Пока вы держите Cooop открытым, получатель может ввести этот код и скачать файл.</div>
                <div class="cooop-bigcode" id="cooopBigCode">········</div>
                <button class="cooop-btn-secondary" id="cooopCopyCodeBtn">Скопировать код</button>
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
        const codeSection = document.getElementById('cooopCodeSection');
        const bigCode = document.getElementById('cooopBigCode');

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

            // Показываем секцию кода сразу, чтобы показать "генерируем..."
            codeSection.style.display = 'block';
            bigCode.textContent = '······';
            setStatus('send', 'Готовим код...');

            startHosting().then(function(code) {
                if (!code) return;
                myCode = code;
                bigCode.textContent = code;
                setStatus('send', 'Код готов. Ожидание получателя...');
            }).catch(function(e) {
                err('startHosting', e);
                bigCode.textContent = 'Ошибка';
                setStatus('send', 'Ошибка: ' + e.message);
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Не удалось создать код: ' + e.message, { type: 'error', duration: 5000 });
                }
            });
        });

        document.getElementById('cooopCopyCodeBtn').addEventListener('click', function() {
            const code = bigCode.textContent.trim();
            if (!code || code.indexOf('·') !== -1) return;
            if (navigator.clipboard) {
                navigator.clipboard.writeText(code).catch(function() {});
            }
            try {
                const ta = document.createElement('textarea');
                ta.value = code;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            } catch(e) {}
            if (window.Win && window.Win.notify) {
                window.Win.notify('Код скопирован', { type: 'success' });
            }
        });

        document.getElementById('cooopSendBack').addEventListener('click', function() {
            cleanupPeer();
            switchScreen('menu');
        });
    }

    async function startHosting() {
        cleanupPeer();

        // 1. Загружаем PeerJS
        const ok = await loadPeerJS();
        if (!ok) {
            throw new Error('Не удалось загрузить PeerJS (проверьте интернет)');
        }

        // 2. Пробуем несколько раз с новым кодом
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
                    // Фатальные ошибки после открытия
                    if (e.type === 'peer-unavailable' || e.type === 'network') {
                        setStatus('send', 'Ошибка сети: ' + e.type);
                    }
                });

                return code;
            } catch(e) {
                err('attempt ' + attempt + ' failed', e);
                // Если код занят — пробуем ещё, иначе прерываем
                if (e && e.type === 'unavailable-id') {
                    continue;
                }
                // Прочие ошибки — не повторяем
                throw new Error(translatePeerError(e));
            }
        }
        throw new Error('Не удалось занять свободный код. Попробуйте позже.');
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

    function onIncomingConnection(conn) {
        if (activeConnection) {
            try { conn.close(); } catch(e) {}
            return;
        }
        activeConnection = conn;

        conn.on('open', function() {
            log('connection open');
            setStatus('send', 'Получатель подключился. Отправка...');
            setProgress('send', 0);
            startSending().catch(function(e) {
                err('startSending', e);
                setStatus('send', 'Ошибка отправки: ' + e.message);
            });
        });

        conn.on('data', function(data) {
            handleIncomingData(data);
        });

        conn.on('close', function() {
            log('connection closed');
            if (activeConnection === conn) {
                activeConnection = null;
                if (currentFile) {
                    setStatus('send', 'Получатель отключился. Ждём нового...');
                    setProgress('send', 0);
                }
            }
        });

        conn.on('error', function(e) {
            err('connection error', e);
        });
    }

    // ============================================
    // ПОЛУЧАТЕЛЬ
    // ============================================

    function renderReceiveScreen(container) {
        container.innerHTML = `
            <div class="cooop-section">
                <div class="cooop-section-title">Введите код</div>
                <div class="cooop-desc">Получите ${CODE_LENGTH}-символьный код от отправителя и введите его сюда.</div>
                <input type="text" class="cooop-input-code" id="cooopCodeInput" placeholder="········" maxlength="${CODE_LENGTH}" autocomplete="off" spellcheck="false" />
                <button class="cooop-btn" id="cooopConnectBtn">ПОЛУЧИТЬ ФАЙЛ</button>
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

        const input = document.getElementById('cooopCodeInput');
        const connectBtn = document.getElementById('cooopConnectBtn');

        input.addEventListener('input', function() {
            this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') connectBtn.click();
        });

        connectBtn.addEventListener('click', function() {
            if (isConnecting) return;
            const code = input.value.trim().toUpperCase();
            if (!code || code.length < 4) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Введите код полностью', { type: 'error' });
                }
                return;
            }
            isConnecting = true;
            connectBtn.disabled = true;
            connectBtn.textContent = 'ПОДКЛЮЧЕНИЕ...';

            connectToSender(code).catch(function(e) {
                err('connectToSender', e);
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Ошибка: ' + e.message, { type: 'error', duration: 5000 });
                }
            }).then(function() {
                isConnecting = false;
                connectBtn.disabled = false;
                connectBtn.textContent = 'ПОЛУЧИТЬ ФАЙЛ';
            });
        });

        document.getElementById('cooopRecvBack').addEventListener('click', function() {
            cleanupPeer();
            switchScreen('menu');
        });
    }

    async function connectToSender(code) {
        cleanupPeer();

        const ok = await loadPeerJS();
        if (!ok) {
            throw new Error('Не удалось загрузить PeerJS (проверьте интернет)');
        }

        const remoteId = peerIdFromCode(code);

        // Случайный ID для получателя
        const clientId = PEER_PREFIX + 'client-' +
            Math.random().toString(36).slice(2, 10) +
            Date.now().toString(36);

        const p = await createPeerWithId(clientId);
        peer = p;

        setStatus('recv', 'Подключение к ' + code + '...');

        const conn = p.connect(remoteId, {
            reliable: true,
            serialization: 'binary'
        });

        activeConnection = conn;

        return new Promise(function(resolve, reject) {
            let resolved = false;
            const timeout = setTimeout(function() {
                if (resolved) return;
                resolved = true;
                try { conn.close(); } catch(e) {}
                reject(new Error('Отправитель не отвечает. Проверьте код.'));
            }, 20000);

            conn.on('open', function() {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeout);
                setStatus('recv', 'Подключено. Ожидание файла...');
                resolve();
            });

            conn.on('data', function(data) {
                handleIncomingData(data);
            });

            conn.on('close', function() {
                if (resolved) {
                    setStatus('recv', 'Соединение закрыто');
                } else {
                    resolved = true;
                    clearTimeout(timeout);
                    reject(new Error('Соединение закрыто отправителем'));
                }
            });

            conn.on('error', function(e) {
                err('connection error', e);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    reject(new Error(e && e.type === 'peer-unavailable'
                        ? 'Код не найден. Проверьте правильность.'
                        : (e.message || 'Ошибка соединения')));
                }
            });
        });
    }

    // ============================================
    // ПЕРЕДАЧА И ПРИЁМ
    // ============================================

    async function startSending() {
        if (!activeConnection || !activeConnection.open || !currentFile) return;
        if (sendInProgress) return;
        sendInProgress = true;

        const file = currentFile;

        const meta = {
            type: 'meta',
            name: file.name,
            size: file.size,
            mime: file.type || 'application/octet-stream',
            chunks: Math.ceil(file.size / CHUNK_SIZE)
        };
        activeConnection.send(meta);

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
                    if (!activeConnection || !activeConnection.open) {
                        resolve();
                        return;
                    }
                    const dc = activeConnection._dc;
                    if (!dc || dc.bufferedAmount < 1024 * 1024) {
                        resolve();
                    } else {
                        setTimeout(check, 20);
                    }
                };
                check();
            });
        };

        while (offset < file.size) {
            if (!activeConnection || !activeConnection.open) {
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
                activeConnection.send(buffer);
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
            activeConnection.send({ type: 'done' });
        } catch(e) {
            err('send done', e);
        }

        setStatus('send', 'Файл отправлен. Получатель сохраняет...');
        sendInProgress = false;
    }

    function handleIncomingData(data) {
        if (data && typeof data === 'object' && !(data instanceof ArrayBuffer) && !(data instanceof Uint8Array)) {
            if (data.type === 'meta') {
                incomingFile = {
                    name: data.name,
                    size: data.size,
                    mime: data.mime,
                    chunks: data.chunks
                };
                incomingChunks = [];
                incomingBytes = 0;
                setStatus('recv', 'Получение: 0%');
                setProgress('recv', 0);
            } else if (data.type === 'done') {
                finalizeReceive();
            } else if (data.type === 'ack') {
                setStatus('send', 'Файл успешно доставлен');
            }
            return;
        }

        let buf = null;
        if (data instanceof ArrayBuffer) buf = data;
        else if (data instanceof Uint8Array) buf = data.buffer;
        else if (data && data.buffer instanceof ArrayBuffer) buf = data.buffer;

        if (!buf) return;
        if (!incomingFile) return;

        incomingChunks.push(buf);
        incomingBytes += buf.byteLength;
        const pct = Math.floor((incomingBytes / incomingFile.size) * 100);
        setProgress('recv', pct);
        setStatus('recv', 'Получение: ' + pct + '%');
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

                if (activeConnection && activeConnection.open) {
                    try { activeConnection.send({ type: 'ack' }); } catch(e) {}
                }
            };
            reader.readAsDataURL(blob);
        } catch(e) {
            err('finalizeReceive', e);
            setStatus('recv', 'Ошибка: ' + e.message);
        }
    }

    // ============================================
    // ХЕЛПЕРЫ
    // ============================================

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

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // ============================================
    // UI CARCASS
    // ============================================

    function createUI() {
        if (document.getElementById('cooopApp')) {
            document.getElementById('cooopApp').style.display = 'flex';
            return;
        }
        isOpen = true;

        const app = document.createElement('div');
        app.id = 'cooopApp';
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

                .cooop-bigcode {
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

                .cooop-input-code {
                    width: 100%;
                    padding: 20px 16px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-family: 'Courier New', monospace;
                    font-size: 32px;
                    font-weight: 700;
                    letter-spacing: 6px;
                    text-align: center;
                    text-transform: uppercase;
                    outline: none;
                    box-sizing: border-box;
                    margin-bottom: 12px;
                }
                .cooop-input-code:focus {
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
                    .cooop-content { padding: 16px; }
                    .cooop-menu-btn { padding: 22px 20px; }
                    .cooop-menu-title { font-size: 17px; }
                    .cooop-menu-desc { font-size: 12px; }
                    .cooop-section { padding: 16px; }
                    .cooop-section-title { font-size: 14px; }
                    .cooop-bigcode { font-size: 32px; letter-spacing: 5px; padding: 18px 8px; }
                    .cooop-input-code { font-size: 24px; padding: 16px 12px; letter-spacing: 4px; }
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