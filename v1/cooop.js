// cooop.js — Shnuk Cooop

(function() {
    'use strict';

    const ROOMS_COLLECTION = 'cooop_rooms';
    const SIGNALS_COLLECTION = 'cooop_signals';
    const ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];

    let isOpen = false;
    let roomId = null;
    let isHost = false;
    let peerConnection = null;
    let localStream = null;
    let roomUnsubscribe = null;
    let signalUnsubscribe = null;
    let peerId = null;
    let hostStreaming = false;
    let remoteStreamActive = false;
    let cssFullscreenActive = false;

    function log() {
        try { console.log.apply(console, ['[Cooop]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }
    function err() {
        try { console.warn.apply(console, ['[Cooop]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    function randomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let out = '';
        for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
        return out;
    }

    function uid() {
        return 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    }

    function buildShareLink(code) {
        return location.origin + location.pathname + '?cooop=' + code;
    }

    function extractCode(input) {
        if (!input) return '';
        let s = String(input).trim();
        if (/^[A-Z0-9]{4,16}$/i.test(s)) return s.toUpperCase();
        const m = s.match(/[?&]cooop=([A-Z0-9]+)/i);
        if (m && m[1]) return m[1].toUpperCase();
        try {
            const u = new URL(s);
            const c = u.searchParams.get('cooop');
            if (c) return c.toUpperCase();
        } catch(e) {}
        const tail = s.split(/[=\/]/).pop();
        if (tail && /^[A-Z0-9]{4,16}$/i.test(tail)) return tail.toUpperCase();
        return s.toUpperCase();
    }

    async function ensureAuth() {
        if (window.__firebaseReady) {
            try { await window.__firebaseReady; } catch(e) {}
        }
        if (window.__firebaseAuthReady) {
            try { await window.__firebaseAuthReady; } catch(e) {}
        }
        if (!window.firebaseAuth) return null;

        let tries = 0;
        while (!window.firebaseAuth.currentUser && tries < 30) {
            tries++;
            await new Promise(function(r) { setTimeout(r, 100); });
        }
        if (!window.firebaseAuth.currentUser) return null;

        try { await window.firebaseAuth.currentUser.getIdToken(true); } catch(e) {}
        return window.firebaseAuth.currentUser;
    }

    function friendlyError(e) {
        if (!e) return 'неизвестная ошибка';
        if (e.code === 'permission-denied') return 'Нет доступа к Firestore. Проверьте правила и Email/Password в Firebase Console.';
        if (e.code === 'unauthenticated') return 'Сессия истекла. Войдите заново.';
        if (e.code === 'not-found') return 'Документ не найден.';
        if (e.code === 'unavailable') return 'Нет соединения с Firestore.';
        return (e.code ? e.code + ': ' : '') + (e.message || '');
    }

    function openCooop() {
        if (isOpen) {
            const ex = document.getElementById('cooopApp');
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }
        createUI();
    }

    function closeCooop() {
        isOpen = false;
        const el = document.getElementById('cooopApp');
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1'; }, 300);
        }
        document.removeEventListener('keydown', onKeyDown);
        updateLiveBar();
    }

    function destroy() {
        leaveRoom();
        isOpen = false;
        document.removeEventListener('keydown', onKeyDown);
        const el = document.getElementById('cooopApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') {
            if (cssFullscreenActive) {
                exitCssFullscreen();
                return;
            }
            closeCooop();
        }
    }

    function cleanupPeer() {
        if (peerConnection) {
            try { peerConnection.close(); } catch(e) {}
            peerConnection = null;
        }
        if (localStream) {
            try { localStream.getTracks().forEach(t => t.stop()); } catch(e) {}
            localStream = null;
        }
        hostStreaming = false;
        remoteStreamActive = false;
    }

    function cleanupSubs() {
        if (roomUnsubscribe) { try { roomUnsubscribe(); } catch(e) {} roomUnsubscribe = null; }
        if (signalUnsubscribe) { try { signalUnsubscribe(); } catch(e) {} signalUnsubscribe = null; }
    }

    function updateLiveBar() {
        if (!window.LiveBar) return;

        if (roomId) {
            if (window.LiveBar.set) {
                window.LiveBar.set({
                    type: 'cooop',
                    appId: 'cooop',
                    payload: {
                        text: isHost
                            ? 'Cooop: комната ' + roomId
                            : 'Cooop: просмотр ' + roomId,
                        role: isHost ? 'host' : 'guest'
                    }
                });
            }
        } else {
            if (window.LiveBar.clear) window.LiveBar.clear();
        }
    }

    function leaveRoom() {
        cleanupSubs();
        cleanupPeer();
        exitCssFullscreen();
        if (roomId && isHost && window.firebaseDb && window.firebaseSDK) {
            const { doc, deleteDoc } = window.firebaseSDK;
            try { deleteDoc(doc(window.firebaseDb, ROOMS_COLLECTION, roomId)).catch(function() {}); } catch(e) {}
            try { deleteDoc(doc(window.firebaseDb, SIGNALS_COLLECTION, roomId)).catch(function() {}); } catch(e) {}
        }
        roomId = null;
        isHost = false;
        peerId = null;
        hostStreaming = false;
        remoteStreamActive = false;
        if (window.LiveBar) window.LiveBar.clear();
        renderRoomState();
    }

    async function getStream() {
        if (localStream) return localStream;
        try {
            localStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false
            });
            localStream.getVideoTracks()[0].addEventListener('ended', function() {
                leaveRoom();
                if (window.Win && window.Win.notify) window.Win.notify('Демонстрация экрана остановлена', { type: 'info' });
            });
            return localStream;
        } catch(e) {
            throw new Error('Отменено или нет доступа к экрану');
        }
    }

    async function createRoom() {
        const user = await ensureAuth();
        if (!user) {
            if (window.Win && window.Win.notify) window.Win.notify('Не выполнен вход в Firebase. Войдите заново.', { type: 'error' });
            return;
        }
        if (!window.firebaseDb || !window.firebaseSDK) {
            if (window.Win && window.Win.notify) window.Win.notify('Firebase не готов', { type: 'error' });
            return;
        }

        if (roomId && isHost) {
            renderRoomState();
            return;
        }

        leaveRoom();

        roomId = randomCode();
        isHost = true;
        peerId = uid();

        const { doc, setDoc, serverTimestamp } = window.firebaseSDK;
        log('Создаю комнату', roomId, 'host:', user.uid);

        try {
            await setDoc(doc(window.firebaseDb, ROOMS_COLLECTION, roomId), {
                roomId: roomId,
                hostUid: user.uid,
                hostEmail: user.email,
                guestUid: null,
                guestEmail: null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                active: true
            });
            log('Комната создана');
        } catch(e) {
            err('createRoom:', e);
            if (window.Win && window.Win.notify) window.Win.notify('Ошибка создания: ' + friendlyError(e), { type: 'error' });
            leaveRoom();
            return;
        }

        try {
            await setDoc(doc(window.firebaseDb, SIGNALS_COLLECTION, roomId), {
                hostOffer: null,
                guestAnswer: null,
                hostCandidates: [],
                guestCandidates: [],
                updatedAt: serverTimestamp()
            });
        } catch(e) {
            err('signal create:', e);
        }

        try {
            await getStream();
            hostStreaming = true;
        } catch(e) {
            await leaveRoom();
            if (window.Win && window.Win.notify) window.Win.notify(e.message, { type: 'error' });
            return;
        }

        startHostSignaling();
        renderRoomState();
        updateLiveBar();
    }

    function startHostSignaling() {
        const { doc, setDoc, getDoc, onSnapshot } = window.firebaseSDK;
        const signalRef = doc(window.firebaseDb, SIGNALS_COLLECTION, roomId);
        const roomRef = doc(window.firebaseDb, ROOMS_COLLECTION, roomId);

        peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        if (localStream) {
            localStream.getTracks().forEach(function(track) {
                peerConnection.addTrack(track, localStream);
            });
        }

        peerConnection.onicecandidate = function(e) {
            if (e.candidate) {
                getDoc(signalRef).then(function(snap) {
                    const cur = snap.exists() ? snap.data() : {};
                    const list = Array.isArray(cur.hostCandidates) ? cur.hostCandidates.slice() : [];
                    list.push(e.candidate.toJSON());
                    setDoc(signalRef, { hostCandidates: list, updatedAt: new Date().toISOString() }, { merge: true });
                }).catch(function(er) { err('hostCandidates:', er); });
            }
        };

        peerConnection.createOffer()
            .then(function(offer) {
                return peerConnection.setLocalDescription(offer).then(function() {
                    return setDoc(signalRef, { hostOffer: offer, updatedAt: new Date().toISOString() }, { merge: true });
                });
            })
            .then(function() { log('Offer отправлен'); })
            .catch(function(e) { err('offer:', e); });

        signalUnsubscribe = onSnapshot(signalRef, async function(snap) {
            if (!snap.exists()) return;
            const data = snap.data();
            if (!data) return;

            if (data.guestAnswer && peerConnection && !peerConnection.currentRemoteDescription) {
                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.guestAnswer));
                    log('Answer принят');
                } catch(e) { err('setRemoteDescription:', e); }
            }
            if (Array.isArray(data.guestCandidates) && peerConnection) {
                for (const c of data.guestCandidates) {
                    try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); } catch(e) {}
                }
            }
        }, function(er) { err('onSnapshot signal host:', er); });

        roomUnsubscribe = onSnapshot(roomRef, function(snap) {
            if (!snap.exists()) {
                leaveRoom();
                if (window.Win && window.Win.notify) window.Win.notify('Комната закрыта', { type: 'info' });
                return;
            }
            const data = snap.data();
            if (data && data.guestUid) {
                const st = document.getElementById('cooopStatus');
                if (st) st.textContent = 'Подключён: ' + (data.guestEmail || 'guest');
            }
            renderRoomState(data);
            updateLiveBar();
        }, function(er) { err('onSnapshot room host:', er); });
    }

    async function joinRoom(rawCode) {
        const code = extractCode(rawCode);
        if (!code) return;

        const user = await ensureAuth();
        if (!user) {
            if (window.Win && window.Win.notify) window.Win.notify('Не выполнен вход в Firebase. Войдите заново.', { type: 'error' });
            return;
        }
        if (!window.firebaseDb || !window.firebaseSDK) {
            if (window.Win && window.Win.notify) window.Win.notify('Firebase не готов', { type: 'error' });
            return;
        }

        const clean = code.trim().toUpperCase();

        if (roomId && roomId === clean) return;
        if (roomId && isHost) return;

        leaveRoom();

        const { doc, getDoc, setDoc, onSnapshot } = window.firebaseSDK;
        const roomRef = doc(window.firebaseDb, ROOMS_COLLECTION, clean);

        log('Пробую подключиться к', clean);

        let snap;
        try {
            snap = await getDoc(roomRef);
        } catch(e) {
            err('getDoc:', e);
            if (window.Win && window.Win.notify) window.Win.notify('Ошибка: ' + friendlyError(e), { type: 'error' });
            return;
        }

        if (!snap.exists()) {
            if (window.Win && window.Win.notify) window.Win.notify('Комната не найдена', { type: 'error' });
            return;
        }

        roomId = clean;
        isHost = false;
        peerId = uid();

        try {
            await setDoc(roomRef, {
                guestUid: user.uid,
                guestEmail: user.email,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        } catch(e) {
            err('guest write:', e);
        }

        startGuestSignaling();

        roomUnsubscribe = onSnapshot(roomRef, function(s) {
            if (!s.exists()) {
                leaveRoom();
                if (window.Win && window.Win.notify) window.Win.notify('Комната закрыта', { type: 'info' });
            }
        }, function(er) { err('onSnapshot room guest:', er); });

        renderRoomState(snap.data());
        updateLiveBar();
    }

    function startGuestSignaling() {
        const { doc, setDoc, getDoc, onSnapshot } = window.firebaseSDK;
        const signalRef = doc(window.firebaseDb, SIGNALS_COLLECTION, roomId);

        peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        peerConnection.onicecandidate = function(e) {
            if (e.candidate) {
                getDoc(signalRef).then(function(snap) {
                    const cur = snap.exists() ? snap.data() : {};
                    const list = Array.isArray(cur.guestCandidates) ? cur.guestCandidates.slice() : [];
                    list.push(e.candidate.toJSON());
                    setDoc(signalRef, { guestCandidates: list, updatedAt: new Date().toISOString() }, { merge: true });
                }).catch(function(er) { err('guestCandidates:', er); });
            }
        };

        peerConnection.ontrack = function(e) {
            const remoteVideo = document.getElementById('cooopRemoteVideo');
            if (remoteVideo && e.streams && e.streams[0]) {
                remoteVideo.srcObject = e.streams[0];
                remoteVideo.play().catch(function() {});
                remoteStreamActive = true;
                const fsBtn = document.getElementById('cooopFullscreenBtn');
                if (fsBtn) fsBtn.style.display = 'inline-block';
                updateLiveBar();
            }
        };

        signalUnsubscribe = onSnapshot(signalRef, async function(snap) {
            if (!snap.exists()) return;
            const data = snap.data();
            if (!data) return;

            if (data.hostOffer && peerConnection && !peerConnection.currentRemoteDescription) {
                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.hostOffer));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    await setDoc(signalRef, { guestAnswer: answer, updatedAt: new Date().toISOString() }, { merge: true });
                    log('Answer отправлен');
                } catch(e) { err('guest answer:', e); }
            }
            if (Array.isArray(data.hostCandidates) && peerConnection) {
                for (const c of data.hostCandidates) {
                    try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); } catch(e) {}
                }
            }
        }, function(er) { err('onSnapshot signal guest:', er); });
    }

    function enterCssFullscreen() {
        const remoteVideo = document.getElementById('cooopRemoteVideo');
        if (!remoteVideo) return;

        cssFullscreenActive = true;
        remoteVideo.style.position = 'fixed';
        remoteVideo.style.top = '0';
        remoteVideo.style.left = '0';
        remoteVideo.style.width = '100vw';
        remoteVideo.style.height = '100vh';
        remoteVideo.style.maxWidth = 'none';
        remoteVideo.style.maxHeight = 'none';
        remoteVideo.style.objectFit = 'contain';
        remoteVideo.style.background = '#000';
        remoteVideo.style.zIndex = '2147483647';
        remoteVideo.style.cursor = 'zoom-out';

        // Кнопка выхода поверх
        let exitBtn = document.getElementById('cooopFullscreenExit');
        if (!exitBtn) {
            exitBtn = document.createElement('button');
            exitBtn.id = 'cooopFullscreenExit';
            exitBtn.textContent = '✕';
            exitBtn.style.cssText = `
                position: fixed;
                top: calc(var(--livebar-h, 44px) + 16px);
                right: 16px;
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: #cc0000;
                color: #ffffff;
                border: 2px solid #ffffff;
                font-size: 22px;
                cursor: pointer;
                font-family: 'ST-SimpleSquare', monospace;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                -webkit-tap-highlight-color: transparent;
            `;
            exitBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                exitCssFullscreen();
            });
            document.body.appendChild(exitBtn);
        }
        exitBtn.style.display = 'flex';

        document.addEventListener('keydown', onFullscreenEsc);
    }

    function exitCssFullscreen() {
        if (!cssFullscreenActive) return;
        cssFullscreenActive = false;

        const remoteVideo = document.getElementById('cooopRemoteVideo');
        if (remoteVideo) {
            remoteVideo.style.position = '';
            remoteVideo.style.top = '';
            remoteVideo.style.left = '';
            remoteVideo.style.width = '';
            remoteVideo.style.height = '';
            remoteVideo.style.maxWidth = '';
            remoteVideo.style.maxHeight = '';
            remoteVideo.style.objectFit = '';
            remoteVideo.style.background = '';
            remoteVideo.style.zIndex = '';
            remoteVideo.style.cursor = '';
        }

        const exitBtn = document.getElementById('cooopFullscreenExit');
        if (exitBtn) exitBtn.style.display = 'none';

        document.removeEventListener('keydown', onFullscreenEsc);
    }

    function onFullscreenEsc(e) {
        if (e.key === 'Escape') exitCssFullscreen();
    }

    function enterFullscreen() {
        const remoteVideo = document.getElementById('cooopRemoteVideo');
        if (!remoteVideo) return;

        // Пытаемся использовать нативный Fullscreen API
        const el = remoteVideo;
        let called = false;

        try {
            if (el.requestFullscreen) { el.requestFullscreen().catch(function() {}); called = true; }
            else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); called = true; }
            else if (el.mozRequestFullScreen) { el.mozRequestFullScreen(); called = true; }
            else if (el.msRequestFullscreen) { el.msRequestFullscreen(); called = true; }
        } catch(e) {}

        // Если нативный API недоступен (iOS), используем CSS-фуллскрин
        if (!called || !document.fullscreenEnabled && !document.webkitFullscreenEnabled) {
            enterCssFullscreen();
        }
    }

    function exitFullscreen() {
        if (cssFullscreenActive) {
            exitCssFullscreen();
            return;
        }
        try {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
            else if (document.msExitFullscreen) document.msExitFullscreen();
        } catch(e) {}
    }

    function renderRoomState(roomData) {
        const st = document.getElementById('cooopStatus');
        const linkBox = document.getElementById('cooopLinkBox');
        const joinBox = document.getElementById('cooopJoinBox');
        const videoBox = document.getElementById('cooopVideoBox');
        const leaveBtn = document.getElementById('cooopLeaveBtn');
        const createBtn = document.getElementById('cooopCreateBtn');
        const fsBtn = document.getElementById('cooopFullscreenBtn');

        if (!st) return;

        if (!roomId) {
            st.textContent = 'Не в комнате';
            if (linkBox) linkBox.style.display = 'none';
            if (joinBox) joinBox.style.display = 'block';
            if (videoBox) videoBox.style.display = 'none';
            if (leaveBtn) leaveBtn.style.display = 'none';
            if (createBtn) createBtn.style.display = 'block';
            if (fsBtn) fsBtn.style.display = 'none';
            return;
        }

        if (isHost) {
            st.textContent = 'Комната создана. Код: ' + roomId;
            if (linkBox) {
                linkBox.style.display = 'block';
                const url = buildShareLink(roomId);
                const inp = document.getElementById('cooopLinkInput');
                if (inp) inp.value = url;
            }
            if (joinBox) joinBox.style.display = 'none';
            if (videoBox) videoBox.style.display = 'none';
            if (leaveBtn) leaveBtn.style.display = 'block';
            if (createBtn) createBtn.style.display = 'none';
            if (fsBtn) fsBtn.style.display = 'none';
        } else {
            st.textContent = 'Подключение к ' + roomId;
            if (linkBox) linkBox.style.display = 'none';
            if (joinBox) joinBox.style.display = 'none';
            if (videoBox) videoBox.style.display = 'block';
            if (leaveBtn) leaveBtn.style.display = 'block';
            if (createBtn) createBtn.style.display = 'none';
            if (fsBtn && remoteStreamActive) fsBtn.style.display = 'inline-block';
        }
    }

    function createUI() {
        if (document.getElementById('cooopApp')) {
            document.getElementById('cooopApp').style.display = 'flex';
            renderRoomState();
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
            background: #ffffff;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            font-family: 'ST-SimpleSquare', monospace;
            color: #1a1a1a;
            opacity: 0;
            animation: cooopFadeIn 0.3s ease forwards;
        `;

        if (!document.getElementById('cooopStyles')) {
            const style = document.createElement('style');
            style.id = 'cooopStyles';
            style.textContent = `
                @keyframes cooopFadeIn { from { opacity: 0; } to { opacity: 1; } }
                .cooop-header { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; background:#f5f5f5; border-bottom:2px solid #e0e0e0; flex-shrink:0; }
                .cooop-header h1 { font-size:20px; font-weight:600; margin:0; }
                .cooop-header-actions { display:flex; gap:8px; align-items:center; }
                .cooop-header-actions button { background:none; border:2px solid #cc0000; color:#cc0000; font-size:16px; padding:6px 12px; cursor:pointer; font-family:'ST-SimpleSquare',monospace; }
                .cooop-header-actions button:hover { background:#cc0000; color:#fff; }
                .cooop-content { flex:1; overflow-y:auto; padding:24px; display:flex; flex-direction:column; align-items:center; }
                .cooop-block { width:100%; max-width:560px; background:#f8f8f8; border:2px solid #e0e0e0; padding:20px; margin-bottom:16px; box-sizing:border-box; }
                .cooop-block .title { font-size:15px; font-weight:600; margin-bottom:12px; }
                .cooop-block .desc { font-size:12px; color:#888; margin-bottom:14px; line-height:1.5; }
                .cooop-input { width:100%; padding:12px 14px; border:2px solid #e0e0e0; font-family:'ST-SimpleSquare',monospace; font-size:14px; outline:none; box-sizing:border-box; background:#fff; color:#1a1a1a; margin-bottom:12px; }
                .cooop-input:focus { border-color:#cc0000; }
                .cooop-btn { padding:12px 24px; border:2px solid #cc0000; background:#cc0000; color:#fff; cursor:pointer; font-family:'ST-SimpleSquare',monospace; font-size:14px; font-weight:600; transition:all 0.2s; }
                .cooop-btn:hover { background:#990000; }
                .cooop-btn.secondary { background:none; color:#666; border-color:#e0e0e0; }
                .cooop-btn.secondary:hover { background:#f0f0f0; color:#333; }
                .cooop-status { font-size:13px; color:#666; text-align:center; padding:10px 0; }
                .cooop-video { width:100%; max-width:560px; aspect-ratio:16/9; background:#000; border:2px solid #333; position: relative; }
                .cooop-video video { width:100%; height:100%; object-fit:contain; display:block; background:#000; cursor: zoom-in; }
                .cooop-video video:fullscreen,
                .cooop-video video:-webkit-full-screen,
                .cooop-video video:-moz-full-screen,
                .cooop-video video:-ms-fullscreen {
                    width: 100vw;
                    height: 100vh;
                    max-width: none;
                    max-height: none;
                    object-fit: contain;
                    background: #000;
                    cursor: zoom-out;
                }
                .cooop-row { display:flex; gap:8px; flex-wrap:wrap; }
                .cooop-row .cooop-btn { flex:1; min-width:120px; }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'cooop-header';
        header.innerHTML = `
            <h1>Cooop</h1>
            <div class="cooop-header-actions">
                <button id="cooopFullscreenBtn" style="display:none;">На весь экран</button>
                <button id="cooopCloseBtn">✕</button>
            </div>
        `;

        const content = document.createElement('div');
        content.className = 'cooop-content';
        content.innerHTML = `
            <div id="cooopStatus" class="cooop-status">Не в комнате</div>

            <div class="cooop-block" id="cooopCreateBox">
                <div class="title">Создать комнату</div>
                <div class="desc">Создайте комнату и поделитесь ссылкой с другом. Он увидит ваш экран.</div>
                <button class="cooop-btn" id="cooopCreateBtn">Создать комнату</button>
            </div>

            <div class="cooop-block" id="cooopLinkBox" style="display:none;">
                <div class="title">Ссылка на комнату</div>
                <div class="desc">Отправьте эту ссылку другу, чтобы он подключился.</div>
                <input class="cooop-input" id="cooopLinkInput" readonly />
                <div class="cooop-row">
                    <button class="cooop-btn" id="cooopCopyBtn">Скопировать</button>
                    <button class="cooop-btn secondary" id="cooopShareBtn">Поделиться</button>
                </div>
            </div>

            <div class="cooop-block" id="cooopJoinBox">
                <div class="title">Подключиться к комнате</div>
                <div class="desc">Введите код комнаты или вставьте ссылку.</div>
                <input class="cooop-input" id="cooopJoinInput" placeholder="КОД или ссылка" />
                <button class="cooop-btn" id="cooopJoinBtn">Подключиться</button>
            </div>

            <div class="cooop-block" id="cooopVideoBox" style="display:none; padding:0; background:#000; border-color:#333;">
                <div class="cooop-video" style="margin:0 auto;">
                    <video id="cooopRemoteVideo" autoplay playsinline></video>
                </div>
            </div>

            <button class="cooop-btn secondary" id="cooopLeaveBtn" style="display:none; margin-top:16px;">Выйти из комнаты</button>
        `;

        app.appendChild(header);
        app.appendChild(content);
        document.body.appendChild(app);

        document.getElementById('cooopCloseBtn').addEventListener('click', closeCooop);
        document.getElementById('cooopCreateBtn').addEventListener('click', createRoom);
        document.getElementById('cooopFullscreenBtn').addEventListener('click', enterFullscreen);

        // Клик по видео — тоже фуллскрин
        const remoteVideoEl = document.getElementById('cooopRemoteVideo');
        if (remoteVideoEl) {
            remoteVideoEl.addEventListener('click', function() {
                if (cssFullscreenActive) {
                    exitCssFullscreen();
                } else if (document.fullscreenElement) {
                    exitFullscreen();
                } else {
                    enterFullscreen();
                }
            });
        }

        document.getElementById('cooopJoinBtn').addEventListener('click', function() {
            const v = document.getElementById('cooopJoinInput').value.trim();
            if (!v) return;
            joinRoom(v);
        });

        document.getElementById('cooopLeaveBtn').addEventListener('click', function() {
            leaveRoom();
            renderRoomState();
        });

        document.getElementById('cooopCopyBtn').addEventListener('click', function() {
            const inp = document.getElementById('cooopLinkInput');
            if (!inp) return;
            inp.select();
            inp.setSelectionRange(0, inp.value.length);
            try {
                const ok = document.execCommand('copy');
                if (ok) {
                    if (window.Win && window.Win.notify) window.Win.notify('Ссылка скопирована', { type: 'success' });
                } else if (navigator.clipboard) {
                    navigator.clipboard.writeText(inp.value).then(function() {
                        if (window.Win && window.Win.notify) window.Win.notify('Ссылка скопирована', { type: 'success' });
                    }).catch(function() {
                        if (window.Win && window.Win.notify) window.Win.notify('Не удалось скопировать', { type: 'error' });
                    });
                }
            } catch(e) {
                if (navigator.clipboard) navigator.clipboard.writeText(inp.value);
            }
        });

        document.getElementById('cooopShareBtn').addEventListener('click', function() {
            const inp = document.getElementById('cooopLinkInput');
            if (!inp) return;
            const url = inp.value;
            if (navigator.share) {
                navigator.share({ title: 'Shnuk Cooop', text: 'Подключись к моей комнате', url: url }).catch(function() {});
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(url).then(function() {
                    if (window.Win && window.Win.notify) window.Win.notify('Ссылка скопирована', { type: 'success' });
                });
            }
        });

        const params = new URLSearchParams(window.location.search);
        const codeParam = params.get('cooop');
        if (codeParam) {
            setTimeout(function() { joinRoom(codeParam); }, 1200);
        }

        document.addEventListener('keydown', onKeyDown);
        renderRoomState();
    }

    window.Cooop = {
        destroy: destroy,
        open: openCooop,
        leave: leaveRoom
    };
    window.cooopInit = function() { openCooop(); };

})();