// shnuk-pc-mode.js
(function() {
    'use strict';

    const FONT_MAIN = "'TTPaplane', monospace";
    const TOKEN_KEY = 'shnuk_pc_mode_token';
    const TOKEN_TTL = 5 * 60 * 1000;
    const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const TOKEN_LEN = 6;

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

    function isActiveToken(token) {
        if (!token) return false;
        try {
            const raw = sessionStorage.getItem(TOKEN_KEY);
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.token !== token) return false;
            if (Date.now() - parsed.created > TOKEN_TTL) return false;
            return true;
        } catch(e) { return false; }
    }

    function loadToken() {
        try {
            const raw = sessionStorage.getItem(TOKEN_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed) return null;
            if (Date.now() - parsed.created > TOKEN_TTL) return null;
            return parsed;
        } catch(e) { return null; }
    }

    function saveToken(token) {
        try {
            sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
                token: token,
                created: Date.now(),
                phoneConfirmed: false,
                pcConfirmed: false
            }));
        } catch(e) {}
    }

    function updateToken(patch) {
        try {
            const cur = loadToken();
            if (!cur) return;
            const merged = Object.assign({}, cur, patch, { updated: Date.now() });
            sessionStorage.setItem(TOKEN_KEY, JSON.stringify(merged));
        } catch(e) {}
    }

    function clearToken() {
        try { sessionStorage.removeItem(TOKEN_KEY); } catch(e) {}
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
            }
            #pcModeOverlay, #pcModeOverlay * {
                font-family: ${FONT_MAIN} !important;
            }
            @keyframes pcModeFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes pcModeFadeOut { from { opacity: 1; } to { opacity: 0; } }
            #pcModeOverlay.closing { animation: pcModeFadeOut 0.3s ease forwards; }

            .pc-mode-card {
                width: 100%;
                max-width: 460px;
                background: #f5f5f5;
                border: 2px solid #e0e0e0;
                padding: 28px 26px 24px;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                gap: 18px;
            }

            .pc-mode-logo {
                font-size: 26px;
                font-weight: 700;
                letter-spacing: 1px;
                color: #cc0000;
                text-align: center;
            }
            .pc-mode-title {
                font-size: 14px;
                color: #666666;
                text-align: center;
                line-height: 1.5;
                margin-top: -12px;
            }
            .pc-mode-label {
                font-size: 12px;
                color: #888888;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                font-weight: 700;
            }
            .pc-mode-code-display {
                font-family: 'Courier New', monospace;
                font-size: 42px;
                font-weight: 700;
                letter-spacing: 10px;
                text-align: center;
                color: #cc0000;
                padding: 14px 10px;
                background: #ffffff;
                border: 2px dashed #cc0000;
                user-select: text;
                -webkit-user-select: text;
                cursor: text;
                word-break: break-all;
            }
            .pc-mode-input {
                width: 100%;
                padding: 16px 14px;
                border: 2px solid #e0e0e0;
                background: #ffffff;
                color: #1a1a1a;
                font-family: 'Courier New', monospace;
                font-size: 26px;
                font-weight: 700;
                letter-spacing: 8px;
                text-align: center;
                text-transform: uppercase;
                outline: none;
                box-sizing: border-box;
                transition: border-color 0.2s;
            }
            .pc-mode-input:focus { border-color: #cc0000; }

            .pc-mode-btn {
                padding: 14px 20px;
                border: none;
                background: #cc0000;
                color: #ffffff;
                font-family: ${FONT_MAIN};
                font-size: 14px;
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
            .pc-mode-hint {
                font-size: 12px;
                color: #888888;
                line-height: 1.5;
                text-align: center;
            }
            .pc-mode-error {
                font-size: 13px;
                color: #cc0000;
                text-align: center;
                min-height: 18px;
                line-height: 1.4;
            }
            .pc-mode-steps {
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding: 14px 16px;
                background: #ffffff;
                border-left: 3px solid #cc0000;
                font-size: 13px;
                color: #333333;
                line-height: 1.5;
            }
            .pc-mode-steps b { color: #cc0000; }

            @media (max-width: 500px) {
                .pc-mode-card { padding: 20px 18px; }
                .pc-mode-logo { font-size: 22px; }
                .pc-mode-code-display { font-size: 30px; letter-spacing: 6px; padding: 12px 8px; }
                .pc-mode-input { font-size: 20px; letter-spacing: 6px; padding: 14px 10px; }
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

    // ==== Телефонная сторона: показать код ====
    function showPhoneCode() {
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
            '1. Откройте <b>Shnuk OS</b> на этом же ПК.<br>' +
            '2. Введите код ниже в окне ввода.<br>' +
            '3. Дождитесь ответного кода и введите его здесь.';
        card.appendChild(steps);

        const cur = loadToken();
        let token = cur && cur.token && (Date.now() - cur.created < TOKEN_TTL) ? cur.token : null;
        if (!token) {
            token = generateToken();
            saveToken(token);
        }

        const label = document.createElement('div');
        label.className = 'pc-mode-label';
        label.textContent = 'Код для ПК';
        card.appendChild(label);

        const codeDisplay = document.createElement('div');
        codeDisplay.className = 'pc-mode-code-display';
        codeDisplay.textContent = token;
        card.appendChild(codeDisplay);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'pc-mode-btn secondary';
        copyBtn.textContent = 'Скопировать код';
        copyBtn.addEventListener('click', function() {
            copyToClipboard(token, null).then(function(ok) {
                if (ok && window.Win && window.Win.notify) {
                    window.Win.notify('Код скопирован', { type: 'success', duration: 2000 });
                }
            });
        });
        card.appendChild(copyBtn);

        const label2 = document.createElement('div');
        label2.className = 'pc-mode-label';
        label2.textContent = 'Ответный код от ПК';
        card.appendChild(label2);

        const input = document.createElement('input');
        input.className = 'pc-mode-input';
        input.type = 'text';
        input.maxLength = TOKEN_LEN;
        input.placeholder = '______';
        input.autocomplete = 'off';
        input.autocapitalize = 'characters';
        card.appendChild(input);

        const errorEl = document.createElement('div');
        errorEl.className = 'pc-mode-error';
        card.appendChild(errorEl);

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'pc-mode-btn';
        confirmBtn.textContent = 'Подтвердить связку';
        confirmBtn.addEventListener('click', function() {
            const answer = (input.value || '').trim().toUpperCase();
            if (!answer) { errorEl.textContent = 'Введите ответный код'; return; }
            if (answer.length !== TOKEN_LEN) { errorEl.textContent = 'Код должен быть из ' + TOKEN_LEN + ' символов'; return; }

            const t = loadToken();
            if (!t || t.token !== token) {
                errorEl.textContent = 'Сессия истекла. Откройте раздел заново.';
                return;
            }
            if (Date.now() - t.created > TOKEN_TTL) {
                errorEl.textContent = 'Код просрочен. Откройте раздел заново.';
                return;
            }
            if (!t.pcConfirmed) {
                errorEl.textContent = 'ПК ещё не подтвердил привязку. Нажмите «Продолжить» на ПК.';
                return;
            }

            updateToken({ phoneConfirmed: true, confirmedAt: Date.now() });
            errorEl.style.color = '#2e7d32';
            errorEl.textContent = 'Готово. Связка установлена.';
            setTimeout(function() {
                closeOverlay(ov);
                if (window.Win && window.Win.notify) {
                    window.Win.notify('PC Mode подключён', { type: 'success', duration: 3000 });
                }
            }, 900);
        });
        card.appendChild(confirmBtn);

        const resetBtn = document.createElement('button');
        resetBtn.className = 'pc-mode-btn secondary';
        resetBtn.textContent = 'Новый код';
        resetBtn.addEventListener('click', function() {
            clearToken();
            closeOverlay(ov, function() { showPhoneCode(); });
        });
        card.appendChild(resetBtn);

        const hint = document.createElement('div');
        hint.className = 'pc-mode-hint';
        hint.textContent = 'Код живёт ' + (TOKEN_TTL / 60000) + ' минут. Не закрывайте это окно до подтверждения.';
        card.appendChild(hint);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'pc-mode-btn secondary';
        closeBtn.textContent = 'Закрыть';
        closeBtn.addEventListener('click', function() {
            closeOverlay(ov);
        });
        card.appendChild(closeBtn);

        ov.appendChild(card);
        document.body.appendChild(ov);

        setTimeout(function() { input.focus(); }, 400);
    }

    // ==== ПК-сторона: показать окно ввода кода ====
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
            '2. Скопируйте код, который появится на телефоне.<br>' +
            '3. Введите его ниже.';
        card.appendChild(steps);

        const label = document.createElement('div');
        label.className = 'pc-mode-label';
        label.textContent = 'Код с телефона';
        card.appendChild(label);

        const input = document.createElement('input');
        input.className = 'pc-mode-input';
        input.type = 'text';
        input.maxLength = TOKEN_LEN;
        input.placeholder = '______';
        input.autocomplete = 'off';
        input.autocapitalize = 'characters';
        card.appendChild(input);

        const errorEl = document.createElement('div');
        errorEl.className = 'pc-mode-error';
        card.appendChild(errorEl);

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'pc-mode-btn';
        confirmBtn.textContent = 'Продолжить';
        confirmBtn.addEventListener('click', function() {
            const val = (input.value || '').trim().toUpperCase();
            if (val.length !== TOKEN_LEN) {
                errorEl.textContent = 'Код должен быть из ' + TOKEN_LEN + ' символов';
                return;
            }
            let cur = loadToken();
            if (!cur || cur.token !== val) {
                cur = { token: val, created: Date.now(), phoneConfirmed: false, pcConfirmed: false };
                try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(cur)); } catch(e) {}
            }
            updateToken({ pcConfirmed: true, pcConfirmedAt: Date.now() });
            showPCAnswer(ov, val, onDone);
        });
        card.appendChild(confirmBtn);

        const hint = document.createElement('div');
        hint.className = 'pc-mode-hint';
        hint.textContent = 'Без связки Shnuk PC Mode не будет работать.';
        card.appendChild(hint);

        ov.appendChild(card);
        document.body.appendChild(ov);

        setTimeout(function() { input.focus(); }, 400);
    }

    function showPCAnswer(ov, token, onDone) {
        const card = ov.querySelector('.pc-mode-card');
        if (!card) { if (onDone) onDone(true); return; }
        card.innerHTML = '';

        const logo = document.createElement('div');
        logo.className = 'pc-mode-logo';
        logo.textContent = 'Shnuk PC Mode';
        card.appendChild(logo);

        const title = document.createElement('div');
        title.className = 'pc-mode-title';
        title.textContent = 'Ответный код';
        card.appendChild(title);

        const steps = document.createElement('div');
        steps.className = 'pc-mode-steps';
        steps.innerHTML =
            '1. На телефоне введите этот код в разделе <b>Shnuk PC Mode</b>.<br>' +
            '2. Нажмите «Подтвердить связку» на телефоне.<br>' +
            '3. После этого можно закрыть окно на ПК.';
        card.appendChild(steps);

        const label = document.createElement('div');
        label.className = 'pc-mode-label';
        label.textContent = 'Ответный код для телефона';
        card.appendChild(label);

        const codeDisplay = document.createElement('div');
        codeDisplay.className = 'pc-mode-code-display';
        codeDisplay.textContent = token;
        card.appendChild(codeDisplay);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'pc-mode-btn secondary';
        copyBtn.textContent = 'Скопировать код';
        copyBtn.addEventListener('click', function() {
            copyToClipboard(token, null).then(function(ok) {
                if (ok && window.Win && window.Win.notify) {
                    window.Win.notify('Код скопирован', { type: 'success', duration: 2000 });
                }
            });
        });
        card.appendChild(copyBtn);

        const doneBtn = document.createElement('button');
        doneBtn.className = 'pc-mode-btn';
        doneBtn.textContent = 'Я ввёл код на телефоне';
        doneBtn.addEventListener('click', function() {
            updateToken({ phoneConfirmed: true, confirmedAt: Date.now() });
            closeOverlay(ov, function() {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('PC Mode подключён', { type: 'success', duration: 2500 });
                }
                if (onDone) onDone(true);
            });
        });
        card.appendChild(doneBtn);

        const hint = document.createElement('div');
        hint.className = 'pc-mode-hint';
        hint.textContent = 'Код одноразовый. После подтверждения связка активируется на время сессии.';
        card.appendChild(hint);
    }

    // ==== Настройки: раздел Shnuk PC Mode ====
    function renderSettingsSection(container) {
        if (!container) return;
        container.innerHTML = '';

        const isPc = isPC();
        const t = loadToken();
        const active = t && t.phoneConfirmed && t.pcConfirmed && (Date.now() - t.created < TOKEN_TTL);

        const status = document.createElement('div');
        status.style.cssText = 'background:var(--bg-secondary);border:2px solid var(--border-color);padding:16px 20px;margin-bottom:18px;';
        status.innerHTML =
            '<div style="font-size:11px;color:var(--text-muted);letter-spacing:0.8px;text-transform:uppercase;font-weight:700;margin-bottom:6px;">Текущее устройство</div>' +
            '<div style="font-size:18px;font-weight:700;color:var(--text-primary);">' + (isPc ? 'Компьютер' : 'Телефон / планшет') + '</div>' +
            '<div style="font-size:13px;color:var(--text-muted);margin-top:4px;">' +
                (active ? 'PC Mode активен для этой сессии.' : 'PC Mode не активен.') +
            '</div>';
        container.appendChild(status);

        if (!isPc) {
            const intro = document.createElement('div');
            intro.style.cssText = 'font-size:14px;color:var(--text-muted);line-height:1.5;margin-bottom:14px;';
            intro.textContent = 'Откройте этот сайт на ПК и введите код, который появится ниже. Затем введите ответный код с ПК в это же окно, чтобы завершить связку.';
            container.appendChild(intro);

            const btn = document.createElement('button');
            btn.style.cssText = 'padding:14px 24px;border:none;background:var(--accent);color:var(--text-on-accent);font-family:inherit;font-size:14px;font-weight:700;letter-spacing:1px;cursor:pointer;text-transform:uppercase;';
            btn.textContent = 'Открыть PC Mode';
            btn.addEventListener('click', function() {
                showPhoneCode();
            });
            container.appendChild(btn);
        }

        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:12px;color:var(--text-muted);line-height:1.5;margin-top:14px;';
        hint.textContent = 'Связка действует на время текущей сессии. Код одноразовый, живёт ' + (TOKEN_TTL / 60000) + ' минут.';
        container.appendChild(hint);
    }

    window.ShnukPCMode = {
        isPC: isPC,
        isActive: function() {
            const t = loadToken();
            return !!(t && t.phoneConfirmed && t.pcConfirmed && (Date.now() - t.created < TOKEN_TTL));
        },
        showPhoneCode: showPhoneCode,
        showPCStart: showPCStart,
        renderSettingsSection: renderSettingsSection,
        clearToken: clearToken
    };

})();