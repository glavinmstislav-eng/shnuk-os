// security.js — защита системы: пароль, графический ключ, доп. безопасность, стирание.
// Хэширование пароля/ключа — через Apl.deriveSecret (Argon2id/PBKDF2-SHA-512).
// Секреты хранятся в IndexedDB (shnuk_os.system) в зашифрованном виде.

(function() {
    'use strict';

    const EXTRA_KEY = 'shnuk_security_extra';
    const HAS_SECURITY_KEY = 'shnuk_has_security';
    const ATTEMPTS_KEY = 'shnuk_attempts_count';
    const LOCK_UNTIL_KEY = 'shnuk_lock_until';
    const SECURITY_STORE_KEY = 'security_main';
    const WIPE_PENDING_KEY = 'shnuk_wipe_pending';

    const SESSION_TOKENS_KEY = 'shnuk_session_tokens';
    const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

    const FONT_MAIN = "'TTPaplane', monospace";

    const DEFAULT_EXTRA = {
        wipeByCode: false,
        wipeCode: null,
        wipeOnAttempts: false,
        wipeAfterAttempts: 10,
        lockAttempts: 5,
        lockSeconds: 30
    };

    let cachedSecurity = null;
    let sessionTokens = null;

    function randomToken() {
        if (window.crypto && window.crypto.randomUUID) {
            return window.crypto.randomUUID();
        }
        const b = new Uint8Array(24);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(b);
        } else {
            for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
        }
        let out = '';
        for (let i = 0; i < b.length; i++) out += b[i].toString(16).padStart(2, '0');
        return out;
    }

    function ensureSessionTokens() {
        if (sessionTokens) return sessionTokens;
        sessionTokens = {};
        return sessionTokens;
    }

    function issueSessionToken() {
        const t = ensureSessionTokens();
        const token = randomToken();
        t[token] = Date.now() + SESSION_TTL_MS;
        try {
            sessionStorage.setItem(SESSION_TOKENS_KEY, JSON.stringify(t));
        } catch(e) {}
        return token;
    }

    function loadSessionTokens() {
        if (sessionTokens) return sessionTokens;
        try {
            const raw = sessionStorage.getItem(SESSION_TOKENS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    sessionTokens = parsed;
                    return sessionTokens;
                }
            }
        } catch(e) {}
        sessionTokens = {};
        return sessionTokens;
    }

    function pruneExpiredTokens() {
        const t = loadSessionTokens();
        const now = Date.now();
        let changed = false;
        for (const k in t) {
            if (!Object.prototype.hasOwnProperty.call(t, k)) continue;
            if (typeof t[k] !== 'number' || t[k] <= now) {
                delete t[k];
                changed = true;
            }
        }
        if (changed) {
            try { sessionStorage.setItem(SESSION_TOKENS_KEY, JSON.stringify(t)); } catch(e) {}
        }
        return t;
    }

    function hasValidSessionToken() {
        const t = pruneExpiredTokens();
        for (const k in t) {
            if (Object.prototype.hasOwnProperty.call(t, k)) return true;
        }
        return false;
    }

    function clearAllSessionTokens() {
        sessionTokens = {};
        try { sessionStorage.removeItem(SESSION_TOKENS_KEY); } catch(e) {}
    }

    // ============================================
    // ХРАНЕНИЕ СЕКРЕТА — только в IndexedDB, в зашифрованном виде
    // ============================================

    async function loadSecurity() {
        if (cachedSecurity) return cachedSecurity;
        try {
            if (window.OSStorage && window.OSStorage.system) {
                const raw = await window.OSStorage.system.get(SECURITY_STORE_KEY);
                if (raw) {
                    let parsed = raw;
                    if (typeof raw === 'string') {
                        try { parsed = JSON.parse(raw); } catch(e) { parsed = null; }
                    }
                    if (parsed && parsed.hash && parsed.salt) {
                        cachedSecurity = parsed;
                        return cachedSecurity;
                    }
                }
            }
        } catch(e) {}
        cachedSecurity = null;
        return null;
    }

    async function saveSecurity(data) {
        cachedSecurity = data;
        try {
            if (window.OSStorage && window.OSStorage.system) {
                await window.OSStorage.system.put(SECURITY_STORE_KEY, JSON.stringify(data));
                try { localStorage.setItem(HAS_SECURITY_KEY, 'true'); } catch(e) {}
                return true;
            }
        } catch(e) {}
        return false;
    }

    async function dropSecurity() {
        cachedSecurity = null;
        try {
            if (window.OSStorage && window.OSStorage.system) {
                await window.OSStorage.system.delete(SECURITY_STORE_KEY);
            }
        } catch(e) {}
        try { localStorage.removeItem(HAS_SECURITY_KEY); } catch(e) {}
        clearAllSessionTokens();
        return true;
    }

    function hasSecuritySync() {
        try { return localStorage.getItem(HAS_SECURITY_KEY) === 'true'; } catch(e) { return false; }
    }

    // ============================================
    // СОЗДАНИЕ / ПРОВЕРКА
    // ============================================

    async function setPassword(password) {
        if (!window.Apl || typeof window.Apl.deriveSecret !== 'function') return false;
        const derived = await window.Apl.deriveSecret(password);
        const data = {
            type: 'password',
            hash: derived.hash,
            salt: derived.salt,
            method: derived.method,
            argon2Ops: derived.argon2Ops,
            argon2Mem: derived.argon2Mem,
            pbkdf2Iter: derived.pbkdf2Iter,
            created: Date.now()
        };
        return await saveSecurity(data);
    }

    async function checkPassword(password) {
        const sec = await loadSecurity();
        if (!sec || sec.type !== 'password') return false;
        if (!window.Apl || typeof window.Apl.verifySecret !== 'function') return false;
        return await window.Apl.verifySecret(password, sec);
    }

    async function setPattern(pattern) {
        if (!pattern || pattern.length < 4) return false;
        if (!window.Apl || typeof window.Apl.deriveSecret !== 'function') return false;
        const secret = pattern.join('-');
        const derived = await window.Apl.deriveSecret(secret);
        const data = {
            type: 'pattern',
            hash: derived.hash,
            salt: derived.salt,
            method: derived.method,
            argon2Ops: derived.argon2Ops,
            argon2Mem: derived.argon2Mem,
            pbkdf2Iter: derived.pbkdf2Iter,
            created: Date.now()
        };
        return await saveSecurity(data);
    }

    async function checkPattern(pattern) {
        const sec = await loadSecurity();
        if (!sec || sec.type !== 'pattern') return false;
        if (!window.Apl || typeof window.Apl.verifySecret !== 'function') return false;
        const secret = pattern.join('-');
        return await window.Apl.verifySecret(secret, sec);
    }

    async function removeSecurity() {
        return await dropSecurity();
    }

    function hasPasswordSync() {
        return hasSecuritySync();
    }

    function isSessionUnlocked() {
        return hasValidSessionToken();
    }

    function setSessionUnlocked() {
        issueSessionToken();
    }

    function clearSession() {
        clearAllSessionTokens();
    }

    // ============================================
    // ПОПЫТКИ И БЛОКИРОВКА
    // ============================================

    function getAttempts() {
        try {
            const v = parseInt(localStorage.getItem(ATTEMPTS_KEY), 10);
            return isNaN(v) ? 0 : v;
        } catch(e) { return 0; }
    }

    function setAttempts(v) {
        try { localStorage.setItem(ATTEMPTS_KEY, String(v)); } catch(e) {}
    }

    function resetAttempts() {
        try { localStorage.removeItem(ATTEMPTS_KEY); } catch(e) {}
    }

    function getLockUntil() {
        try {
            const v = parseInt(localStorage.getItem(LOCK_UNTIL_KEY), 10);
            return isNaN(v) ? 0 : v;
        } catch(e) { return 0; }
    }

    function setLockUntil(ts) {
        try { localStorage.setItem(LOCK_UNTIL_KEY, String(ts)); } catch(e) {}
    }

    function getLockRemaining() {
        const lockUntil = getLockUntil();
        const now = Date.now();
        return lockUntil > now ? Math.ceil((lockUntil - now) / 1000) : 0;
    }

    // ============================================
    // ДОПОЛНИТЕЛЬНАЯ БЕЗОПАСНОСТЬ
    // ============================================

    async function getExtra() {
        try {
            if (window.OSStorage && window.OSStorage.system) {
                const raw = await window.OSStorage.system.get(EXTRA_KEY);
                if (raw) {
                    let parsed = raw;
                    if (typeof raw === 'string') {
                        try { parsed = JSON.parse(raw); } catch(e) { parsed = null; }
                    }
                    if (parsed) return Object.assign({}, DEFAULT_EXTRA, parsed);
                }
            }
        } catch(e) {}
        return Object.assign({}, DEFAULT_EXTRA);
    }

    async function setExtra(cfg) {
        try {
            if (window.OSStorage && window.OSStorage.system) {
                await window.OSStorage.system.put(EXTRA_KEY, JSON.stringify(cfg));
                return true;
            }
        } catch(e) {}
        return false;
    }

    async function setWipeCode(type, value) {
        const cfg = await getExtra();
        if (!value) {
            cfg.wipeCode = null;
        } else {
            const secret = (type === 'pattern')
                ? (Array.isArray(value) ? value.join('-') : String(value))
                : String(value);
            const derived = await window.Apl.deriveSecret(secret);
            cfg.wipeCode = {
                type: type,
                hash: derived.hash,
                salt: derived.salt,
                method: derived.method,
                argon2Ops: derived.argon2Ops,
                argon2Mem: derived.argon2Mem,
                pbkdf2Iter: derived.pbkdf2Iter
            };
        }
        return await setExtra(cfg);
    }

    async function clearWipeCode() {
        const cfg = await getExtra();
        cfg.wipeCode = null;
        return await setExtra(cfg);
    }

    async function matchesWipeCode(type, value) {
        const cfg = await getExtra();
        if (!cfg || !cfg.wipeCode) return false;
        if (cfg.wipeCode.type !== type) return false;
        const secret = (type === 'pattern')
            ? (Array.isArray(value) ? value.join('-') : String(value))
            : String(value);
        return await window.Apl.verifySecret(secret, cfg.wipeCode);
    }

    async function setWipePending() {
        try {
            if (window.OSStorage && window.OSStorage.system) {
                await window.OSStorage.system.put(WIPE_PENDING_KEY, 'true');
            }
        } catch(e) {}
    }

    async function checkStartWipe() {
        try {
            if (window.OSStorage && window.OSStorage.system) {
                const v = await window.OSStorage.system.get(WIPE_PENDING_KEY);
                if (v === 'true') {
                    await window.OSStorage.system.delete(WIPE_PENDING_KEY);
                    await wipeAllData();
                    return true;
                }
            }
        } catch(e) {}
        return false;
    }

    // ============================================
    // ПОЛНОЕ СТИРАНИЕ
    // ============================================

    async function wipeAllData() {
        try {
            if (window.OSStorage && window.OSStorage.open) {
                try {
                    const db = await window.OSStorage.open();
                    if (db && db.close) db.close();
                } catch(e) {}
            }
        } catch(e) {}

        try {
            await new Promise(function(resolve) {
                const req = indexedDB.deleteDatabase('shnuk_os');
                req.onsuccess = function() { resolve(); };
                req.onerror = function() { resolve(); };
                req.onblocked = function() { resolve(); };
                setTimeout(resolve, 1500);
            });
        } catch(e) {}

        try {
            if (window.Apl && typeof window.Apl.destroy === 'function') {
                await window.Apl.destroy();
            }
        } catch(e) {}

        try { localStorage.clear(); } catch(e) {}
        try { sessionStorage.clear(); } catch(e) {}
        clearAllSessionTokens();

        setTimeout(function() {
            try { location.reload(); } catch(e) {}
        }, 300);
    }

    // ============================================
    // ЭКРАН БЛОКИРОВКИ
    // ============================================

    async function showLockScreen(callback) {
        const sec = await loadSecurity();
        const cfg = await getExtra();

        const overlay = document.createElement('div');
        overlay.id = 'lockScreenOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #000000;
            z-index: 99999999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: ${FONT_MAIN};
            color: #ffffff;
            animation: lockFadeIn 0.5s ease;
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes lockFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes lockShake {
                0%, 100% { transform: translateX(0); }
                20% { transform: translateX(-10px); }
                40% { transform: translateX(10px); }
                60% { transform: translateX(-8px); }
                80% { transform: translateX(8px); }
            }
            @keyframes lockFadeOut { from { opacity: 1; } to { opacity: 0; } }
            .lock-shake { animation: lockShake 0.4s ease; }
            .lock-fade-out { animation: lockFadeOut 0.4s ease forwards; }
        `;
        document.head.appendChild(style);

        const remaining0 = getLockRemaining();
        if (remaining0 > 0) {
            const lockBox = document.createElement('div');
            lockBox.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
            const lockTitle = document.createElement('div');
            lockTitle.textContent = 'Слишком много неверных попыток';
            lockTitle.style.cssText = 'font-size:22px;letter-spacing:2px;text-align:center;';
            lockBox.appendChild(lockTitle);
            const lockTimer = document.createElement('div');
            lockTimer.textContent = 'Подождите ' + remaining0 + ' сек';
            lockTimer.style.cssText = 'font-size:18px;color:#cc0000;letter-spacing:2px;';
            lockBox.appendChild(lockTimer);
            overlay.appendChild(lockBox);

            let remaining = remaining0;
            const iv = setInterval(function() {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(iv);
                    overlay.remove();
                    style.remove();
                    showLockScreen(callback);
                    return;
                }
                lockTimer.textContent = 'Подождите ' + remaining + ' сек';
            }, 1000);

            document.body.appendChild(overlay);
            return;
        }

        if (!sec) {
            if (callback) callback(true);
            return;
        }

        if (sec.type === 'password') {
            const title = document.createElement('div');
            title.style.cssText = 'font-size: 24px; margin-bottom: 40px; letter-spacing: 2px;';
            title.textContent = 'Введите пароль';
            overlay.appendChild(title);

            const input = document.createElement('input');
            input.type = 'password';
            input.style.cssText = `
                width: 300px;
                max-width: 80%;
                padding: 16px;
                background: #111111;
                border: 2px solid #333333;
                color: #ffffff;
                font-size: 20px;
                font-family: ${FONT_MAIN};
                text-align: center;
                outline: none;
                letter-spacing: 4px;
            `;
            input.addEventListener('focus', () => { input.style.borderColor = '#ffffff'; });
            input.addEventListener('blur', () => { input.style.borderColor = '#333333'; });
            overlay.appendChild(input);

            const submitBtn = document.createElement('button');
            submitBtn.style.cssText = `
                margin-top: 20px;
                padding: 14px 48px;
                background: #ffffff;
                color: #000000;
                border: none;
                font-family: ${FONT_MAIN};
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                letter-spacing: 2px;
            `;
            submitBtn.textContent = 'Войти';
            overlay.appendChild(submitBtn);

            const error = document.createElement('div');
            error.style.cssText = 'margin-top: 20px; font-size: 14px; color: #ff4444; min-height: 20px; letter-spacing: 1px; text-align:center;';
            overlay.appendChild(error);

            async function tryUnlock() {
                const pwd = input.value;
                if (!pwd) return;

                if (cfg.wipeByCode && await matchesWipeCode('password', pwd)) {
                    error.textContent = 'Стирание данных...';
                    await setWipePending();
                    await wipeAllData();
                    return;
                }

                if (await checkPassword(pwd)) {
                    resetAttempts();
                    setSessionUnlocked();
                    overlay.classList.add('lock-fade-out');
                    setTimeout(function() {
                        overlay.remove();
                        style.remove();
                        if (callback) callback(true);
                    }, 400);
                } else {
                    const attempts = getAttempts() + 1;
                    setAttempts(attempts);
                    error.textContent = 'Неверный пароль';
                    overlay.classList.add('lock-shake');
                    input.value = '';
                    setTimeout(() => overlay.classList.remove('lock-shake'), 400);

                    if (cfg.wipeOnAttempts && attempts >= cfg.wipeAfterAttempts) {
                        error.textContent = 'Превышен лимит попыток. Стирание данных...';
                        await setWipePending();
                        await wipeAllData();
                        return;
                    }

                    if (cfg.lockAttempts > 0 && attempts % cfg.lockAttempts === 0) {
                        const lockUntil = Date.now() + cfg.lockSeconds * 1000;
                        setLockUntil(lockUntil);
                        resetAttempts();
                        overlay.remove();
                        style.remove();
                        showLockScreen(callback);
                        return;
                    }
                }
            }

            submitBtn.addEventListener('click', tryUnlock);
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') tryUnlock();
            });

            setTimeout(() => input.focus(), 300);

        } else if (sec.type === 'pattern') {
            const title = document.createElement('div');
            title.style.cssText = 'font-size: 24px; margin-bottom: 20px; letter-spacing: 2px;';
            title.textContent = 'Нарисуйте ключ';
            overlay.appendChild(title);

            const subtitle = document.createElement('div');
            subtitle.style.cssText = 'font-size: 12px; color: #666; margin-bottom: 30px; letter-spacing: 1px; min-height: 20px;';
            subtitle.textContent = '';
            overlay.appendChild(subtitle);

            const canvas = document.createElement('canvas');
            const canvasSize = 300;
            canvas.width = canvasSize;
            canvas.height = canvasSize;
            canvas.style.cssText = 'background: #000000; touch-action: none;';
            overlay.appendChild(canvas);

            const ctx = canvas.getContext('2d');
            const dots = [];
            const dotRadius = 12;
            const gridSize = 3;
            const cellSize = canvasSize / gridSize;

            for (let i = 0; i < gridSize; i++) {
                for (let j = 0; j < gridSize; j++) {
                    dots.push({
                        x: cellSize * (j + 0.5),
                        y: cellSize * (i + 0.5),
                        id: i * gridSize + j,
                        used: false
                    });
                }
            }

            let selectedPattern = [];
            let isDrawing = false;
            let currentMouse = null;

            function drawGrid() {
                ctx.clearRect(0, 0, canvasSize, canvasSize);

                for (const dot of dots) {
                    if (dot.used) {
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
                        ctx.fill();

                        ctx.fillStyle = '#000000';
                        ctx.beginPath();
                        ctx.arc(dot.x, dot.y, dotRadius * 0.4, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        ctx.strokeStyle = '#333333';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }

                if (selectedPattern.length > 1) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 4;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();

                    for (let i = 0; i < selectedPattern.length; i++) {
                        const dot = dots.find(d => d.id === selectedPattern[i]);
                        if (dot) {
                            if (i === 0) {
                                ctx.moveTo(dot.x, dot.y);
                            } else {
                                ctx.lineTo(dot.x, dot.y);
                            }
                        }
                    }
                    ctx.stroke();
                }

                if (isDrawing && currentMouse && selectedPattern.length > 0) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 4;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    const lastDot = dots.find(d => d.id === selectedPattern[selectedPattern.length - 1]);
                    if (lastDot) {
                        ctx.moveTo(lastDot.x, lastDot.y);
                        ctx.lineTo(currentMouse.x, currentMouse.y);
                    }
                    ctx.stroke();
                }
            }

            function getMousePos(e) {
                const rect = canvas.getBoundingClientRect();
                const touch = e.touches ? e.touches[0] : e;
                return {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top
                };
            }

            function findDot(pos) {
                for (const dot of dots) {
                    const dx = dot.x - pos.x;
                    const dy = dot.y - pos.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < dotRadius * 2.5) return dot;
                }
                return null;
            }

            function startDrawing(e) {
                e.preventDefault();
                isDrawing = true;
                currentMouse = getMousePos(e);
                const dot = findDot(currentMouse);
                if (dot && !dot.used) {
                    dot.used = true;
                    selectedPattern.push(dot.id);
                    subtitle.textContent = selectedPattern.length + ' точек';
                    drawGrid();
                }
            }

            function continueDrawing(e) {
                if (!isDrawing) return;
                e.preventDefault();
                currentMouse = getMousePos(e);
                const dot = findDot(currentMouse);
                if (dot && !dot.used) {
                    dot.used = true;
                    selectedPattern.push(dot.id);
                    subtitle.textContent = selectedPattern.length + ' точек';
                }
                drawGrid();
            }

            function endDrawing(e) {
                if (!isDrawing) return;
                isDrawing = false;
                currentMouse = null;
                drawGrid();

                if (selectedPattern.length >= 4) {
                    setTimeout(async function() {
                        if (cfg.wipeByCode && await matchesWipeCode('pattern', selectedPattern)) {
                            subtitle.textContent = 'Стирание данных...';
                            subtitle.style.color = '#ff4444';
                            await setWipePending();
                            await wipeAllData();
                            return;
                        }

                        if (await checkPattern(selectedPattern)) {
                            resetAttempts();
                            setSessionUnlocked();
                            overlay.classList.add('lock-fade-out');
                            setTimeout(function() {
                                overlay.remove();
                                style.remove();
                                if (callback) callback(true);
                            }, 400);
                        } else {
                            const attempts = getAttempts() + 1;
                            setAttempts(attempts);
                            subtitle.textContent = 'Неверный ключ';
                            subtitle.style.color = '#ff4444';
                            overlay.classList.add('lock-shake');
                            setTimeout(function() {
                                overlay.classList.remove('lock-shake');
                                selectedPattern = [];
                                for (const dot of dots) dot.used = false;
                                subtitle.textContent = '';
                                subtitle.style.color = '#666';
                                drawGrid();
                            }, 400);

                            if (cfg.wipeOnAttempts && attempts >= cfg.wipeAfterAttempts) {
                                subtitle.textContent = 'Превышен лимит попыток. Стирание данных...';
                                await setWipePending();
                                await wipeAllData();
                                return;
                            }

                            if (cfg.lockAttempts > 0 && attempts % cfg.lockAttempts === 0) {
                                const lockUntil = Date.now() + cfg.lockSeconds * 1000;
                                setLockUntil(lockUntil);
                                resetAttempts();
                                overlay.remove();
                                style.remove();
                                showLockScreen(callback);
                                return;
                            }
                        }
                    }, 200);
                } else {
                    setTimeout(function() {
                        selectedPattern = [];
                        for (const dot of dots) dot.used = false;
                        subtitle.textContent = '';
                        drawGrid();
                    }, 200);
                }
            }

            canvas.addEventListener('mousedown', startDrawing);
            canvas.addEventListener('mousemove', continueDrawing);
            canvas.addEventListener('mouseup', endDrawing);
            canvas.addEventListener('mouseleave', endDrawing);
            canvas.addEventListener('touchstart', startDrawing, { passive: false });
            canvas.addEventListener('touchmove', continueDrawing, { passive: false });
            canvas.addEventListener('touchend', endDrawing);

            drawGrid();
        }

        document.body.appendChild(overlay);
    }

    // ============================================
    // ПУБЛИЧНЫЙ API
    // ============================================

    window.Security = {
        hasSecurity: hasSecuritySync,
        hasSecurityAsync: async function() { const s = await loadSecurity(); return !!s; },
        hasPassword: hasPasswordSync,
        hasPattern: hasPasswordSync,
        setPassword: setPassword,
        setPattern: setPattern,
        checkPassword: checkPassword,
        checkPattern: checkPattern,
        removeSecurity: removeSecurity,
        isSessionUnlocked: isSessionUnlocked,
        setSessionUnlocked: setSessionUnlocked,
        clearSession: clearSession,
        showLockScreen: showLockScreen,

        getExtra: getExtra,
        setExtra: setExtra,
        setWipeCode: setWipeCode,
        clearWipeCode: clearWipeCode,
        matchesWipeCode: matchesWipeCode,
        checkStartWipe: checkStartWipe,
        wipeAllData: wipeAllData,

        getAttempts: getAttempts,
        resetAttempts: resetAttempts,
        getLockRemaining: getLockRemaining,

        load: loadSecurity
    };

})();