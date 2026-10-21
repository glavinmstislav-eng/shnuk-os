// shnuk-eva.js
(function() {
    'use strict';

    const FONT_MAIN = "'TTPaplane', monospace";
    const HISTORY_KEY = 'shnuk_eva_history';
    const WAKE_PHRASE = 'окей ева';
    const WAKE_ALT = 'okay eva';
    const MODEL_ID = 'Llama-3.2-3B-Instruct-q4f32_1-MLC';

    let root = null;
    let isOpen = false;
    let isThinking = false;
    let recognition = null;
    let wakeRecognition = null;
    let wakeActive = false;

    let webllm = null;
    let engine = null;
    let engineReady = false;
    let engineLoading = false;
    let engineError = null;
    let loadProgress = 0;
    let loadStatusText = 'Локальный режим';

    const APP_ALIASES = {
        'настройки': 'settings',
        'settings': 'settings',
        'часы': 'time',
        'таймер': 'time',
        'будильник': 'time',
        'секундомер': 'time',
        'файлы': 'file',
        'файловый менеджер': 'file',
        'камера': 'camera',
        'фото': 'camera',
        'звукозапись': 'recorder',
        'диктофон': 'recorder',
        'рекордер': 'recorder',
        'cooop': 'cooop',
        'кууп': 'cooop',
        'игровой центр': 'gamecenter',
        'game center': 'gamecenter',
        'игры': 'gamecenter',
        'collaris': 'coll',
        'колларис': 'coll',
        'конструктор': 'coll',
        'eva': 'shnuk-eva',
        'ева': 'shnuk-eva',
        'аккаунт': 'shnuk-account',
        'мой shnuk': 'my-shnuk',
        'my shnuk': 'my-shnuk'
    };

    const KNOWLEDGE = [
        { q: 'кто ты', a: 'Я Shnuk Eva — встроенный ассистент Shnuk OS. Умею управлять системой, файлами, приложениями и настройками.' },
        { q: 'что ты умеешь', a: 'Открывать приложения, создавать и удалять файлы, менять темы и настройки экрана, управлять будильником, таймером, камерой, звукозаписью, играми, файловым менеджером и Collaris. Понимаю голосовые команды.' },
        { q: 'как тебя зовут', a: 'Shnuk Eva.' },
        { q: 'версия системы', a: 'Shnuk OS 3.2.' },
        { q: 'что такое shnuk os', a: 'Shnuk OS — веб-операционная система с модульной архитектурой, приложениями, файловым менеджером, аккаунтом и AI-ассистентом.' },
        { q: 'привет', a: 'Привет. Чем помочь?' },
        { q: 'как дела', a: 'Работаю стабильно. Готова к командам.' },
        { q: 'спасибо', a: 'Всегда пожалуйста.' },
        { q: 'что такое llama', a: 'Llama — семейство языковых моделей от Meta, работающих локально в браузере через WebGPU.' },
        { q: 'как работает ии', a: 'Локальная модель загружается в браузер и работает на GPU через WebGPU. Это позволяет обрабатывать запросы без интернета.' }
    ];

    function log() {
        try { console.log.apply(console, ['[Eva]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    function updateStatus() {
        const s = document.getElementById('evaStatus');
        if (!s) return;
        if (engineReady) {
            s.textContent = 'WebLLM · ' + MODEL_ID + ' · готов';
            s.style.color = 'var(--accent)';
        } else if (engineLoading) {
            s.textContent = 'Загрузка модели: ' + loadProgress + '%';
            s.style.color = 'var(--text-primary)';
        } else if (engineError) {
            s.textContent = 'Ошибка: ' + engineError;
            s.style.color = 'var(--accent)';
        } else {
            s.textContent = 'Локальный режим (WebLLM не загружен)';
            s.style.color = 'var(--text-muted)';
        }
    }

    function loadWebLLM() {
        return new Promise(function(resolve, reject) {
            if (webllm) { resolve(webllm); return; }

            const urls = [
                'https://esm.run/@mlc-ai/web-llm',
                'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm'
            ];

            let idx = 0;

            function tryNext() {
                if (idx >= urls.length) {
                    reject(new Error('Не удалось загрузить WebLLM'));
                    return;
                }
                const url = urls[idx++];
                const script = document.createElement('script');
                script.type = 'module';
                script.textContent = `
                    import * as webllm from '${url}';
                    window.__evaWebllm = webllm;
                    window.dispatchEvent(new Event('eva-webllm-loaded'));
                `;
                script.onerror = function() {
                    tryNext();
                };
                document.head.appendChild(script);
            }

            window.addEventListener('eva-webllm-loaded', function() {
                webllm = window.__evaWebllm;
                resolve(webllm);
            }, { once: true });

            tryNext();

            setTimeout(function() {
                if (!webllm) {
                    reject(new Error('WebLLM не загрузился за 20 секунд'));
                }
            }, 20000);
        });
    }

    async function loadEngine() {
        if (engineReady) return engine;
        if (engineLoading) return null;

        engineLoading = true;
        engineError = null;
        loadProgress = 0;
        loadStatusText = 'Загрузка модуля WebLLM...';
        updateStatus();

        try {
            const lib = await loadWebLLM();
            loadStatusText = 'Инициализация движка...';
            loadProgress = 5;
            updateStatus();

            const created = await lib.CreateMLCEngine(MODEL_ID, {
                initProgressCallback: function(report) {
                    if (report && typeof report.progress === 'number') {
                        loadProgress = Math.round(report.progress * 100);
                    }
                    if (report && report.text) {
                        loadStatusText = report.text;
                    }
                    updateStatus();
                }
            });

            engine = created;
            engineReady = true;
            engineLoading = false;
            loadProgress = 100;
            loadStatusText = 'Модель готова';
            updateStatus();

            if (window.Win && window.Win.notify) {
                window.Win.notify('Модель ' + MODEL_ID + ' загружена', { type: 'success', duration: 3000 });
            }

            return engine;
        } catch(e) {
            engineLoading = false;
            engineError = e.message || 'Ошибка загрузки';
            log('Engine error:', e);
            updateStatus();
            if (window.Win && window.Win.notify) {
                window.Win.notify('Не удалось загрузить модель: ' + engineError, { type: 'error', duration: 5000 });
            }
            return null;
        }
    }

    async function generateLLM(userText) {
        if (!engineReady) return null;

        const messages = [
            {
                role: 'system',
                content: 'Ты — Shnuk Eva, встроенный ИИ-ассистент в операционной системе Shnuk OS. Ты умеешь управлять системой: открывать приложения, создавать и удалять файлы, менять темы и настройки, ставить таймеры и будильники. Отвечай кратко, дружелюбно, по-русски. Если пользователь просит что-то сделать в системе, отвечай что делаешь это.'
            },
            { role: 'user', content: userText }
        ];

        try {
            const reply = await engine.chat.completions.create({
                messages: messages,
                temperature: 0.7,
                max_tokens: 256,
                stream: false
            });
            if (reply && reply.choices && reply.choices[0] && reply.choices[0].message) {
                return reply.choices[0].message.content;
            }
            return null;
        } catch(e) {
            log('LLM generate error:', e);
            return null;
        }
    }

    function tokenize(str) {
        return String(str || '')
            .toLowerCase()
            .replace(/[^\wа-яё\s]/gi, ' ')
            .split(/\s+/)
            .filter(Boolean);
    }

    function hashToken(t) {
        let h = 2166136261;
        for (let i = 0; i < t.length; i++) {
            h ^= t.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0) / 4294967295;
    }

    function embed(tokens, dim) {
        dim = dim || 96;
        const vec = new Float32Array(dim);
        for (const t of tokens) {
            const h = hashToken(t);
            const idx = Math.floor(h * dim) % dim;
            vec[idx] += 1;
            const idx2 = Math.floor(hashToken(t + '#2') * dim) % dim;
            vec[idx2] += 0.5;
        }
        let norm = 0;
        for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < dim; i++) vec[i] /= norm;
        return vec;
    }

    function cosine(a, b) {
        let s = 0;
        const n = Math.min(a.length, b.length);
        for (let i = 0; i < n; i++) s += a[i] * b[i];
        return s;
    }

    function semanticSearch(query, db) {
        const tokens = tokenize(query);
        const qVec = embed(tokens);
        let best = -1, bestScore = -1;
        for (let i = 0; i < db.length; i++) {
            const v = embed(tokenize(db[i].q));
            const score = cosine(qVec, v);
            if (score > bestScore) { bestScore = score; best = i; }
        }
        return { item: db[best], score: bestScore };
    }

    function detectIntent(text) {
        const t = String(text || '').toLowerCase().trim();
        if (!t) return { type: 'empty' };

        const openMatch = t.match(/(открой|запусти|включи|open|launch)\s+(.+)/);
        if (openMatch) return { type: 'open_app', target: openMatch[2].trim() };

        const closeMatch = t.match(/(закрой|выключи|close)\s+(.+)/);
        if (closeMatch) return { type: 'close_app', target: closeMatch[2].trim() };

        const themeMatch = t.match(/(включи|поставь|смени|переключи)\s+(тёмную|темную|светлую|яркую)\s+тему/);
        if (themeMatch) {
            const w = themeMatch[2];
            const dark = /тёмн|темн/.test(w);
            return { type: 'set_theme', theme: dark ? 'evening' : 'day' };
        }

        if (/(какая|какая сейчас)\s+тема/.test(t)) return { type: 'get_theme' };

        const brightMatch = t.match(/(яркость)\s+(\d{1,3})/);
        if (brightMatch) return { type: 'set_brightness', value: parseInt(brightMatch[2], 10) };

        const timerMatch = t.match(/(таймер|отсчёт|отсчет)\s+(?:на\s+)?(\d+)\s*(минут|минуту|минуты|секунд|секунду|секунды|час|часа|часов)?/);
        if (timerMatch) {
            const n = parseInt(timerMatch[2], 10);
            const unit = (timerMatch[3] || 'секунд').toLowerCase();
            let seconds = n;
            if (/мин/.test(unit)) seconds = n * 60;
            else if (/час/.test(unit)) seconds = n * 3600;
            return { type: 'set_timer', seconds };
        }

        const alarmMatch = t.match(/(будильник|разбуди)\s+(?:на\s+)?(\d{1,2})[:.\s]?(\d{0,2})?/);
        if (alarmMatch) {
            const h = parseInt(alarmMatch[2], 10);
            const m = alarmMatch[3] ? parseInt(alarmMatch[3], 10) : 0;
            if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                return { type: 'set_alarm', hour: h, minute: m };
            }
        }

        const createFileMatch = t.match(/(создай|создать|сделай)\s+(файл|заметку|текстовый файл)/);
        if (createFileMatch) {
            const nameMatch = t.match(/назови\s+(.+)/) || t.match(/с именем\s+(.+)/);
            return {
                type: 'create_file',
                name: nameMatch ? nameMatch[1].trim() : null
            };
        }

        const delFileMatch = t.match(/(удали|сотри|delete)\s+файл\s+(.+)/);
        if (delFileMatch) return { type: 'delete_file', name: delFileMatch[2].trim() };

        const renameMatch = t.match(/(переименуй|переименовать)\s+файл\s+(.+)\s+(?:в|на)\s+(.+)/);
        if (renameMatch) return { type: 'rename_file', from: renameMatch[2].trim(), to: renameMatch[3].trim() };

        if (/(список файлов|какие файлы|файлы)/.test(t)) return { type: 'list_files' };
        if (/(сколько файлов)/.test(t)) return { type: 'count_files' };
        if (/(полный экран|фулскрин|fullscreen)/.test(t)) return { type: 'fullscreen' };
        if (/(помощь|что умеешь|help)/.test(t)) return { type: 'help' };
        if (/(загрузи|включи|подключи).*(модель|ии|llm)/.test(t)) return { type: 'load_model' };

        return { type: 'chat', text: text };
    }

    function findAppId(alias) {
        const key = String(alias || '').toLowerCase().trim();
        if (APP_ALIASES[key]) return APP_ALIASES[key];
        for (const [k, v] of Object.entries(APP_ALIASES)) {
            if (key.indexOf(k) !== -1 || k.indexOf(k) !== -1) return v;
        }
        return null;
    }

    function openApp(alias) {
        const id = findAppId(alias);
        if (!id) return { ok: false, message: 'Не знаю такого приложения: ' + alias };
        if (typeof window.ShnukOpenAppById === 'function') {
            const ok = window.ShnukOpenAppById(id);
            if (ok) return { ok: true, message: 'Открываю: ' + alias };
        }
        const initFns = [id + 'Init', id.replace(/-/g, '') + 'Init'];
        for (const fn of initFns) {
            if (typeof window[fn] === 'function') {
                try { window[fn](); return { ok: true, message: 'Открываю: ' + alias }; } catch(e) {}
            }
        }
        return { ok: false, message: 'Не удалось открыть: ' + alias };
    }

    function getThemeName() {
        try {
            const t = localStorage.getItem('shnuk_theme') || 'day';
            if (t === 'evening') return 'тёмная';
            return 'светлая';
        } catch(e) { return 'светлая'; }
    }

    function setTheme(theme) {
        try {
            if (window.Settings && typeof window.Settings.selectTheme === 'function') {
                window.Settings.selectTheme(theme);
            } else {
                localStorage.setItem('shnuk_theme', theme);
                if (theme === 'day') document.documentElement.removeAttribute('data-theme');
                else document.documentElement.setAttribute('data-theme', theme);
                window.dispatchEvent(new CustomEvent('shnuk:theme-changed', { detail: { theme } }));
            }
            return true;
        } catch(e) { return false; }
    }

    function setBrightness(v) {
        if (window.LiveBar && typeof window.LiveBar.setBrightness === 'function') {
            window.LiveBar.setBrightness(v);
            return { ok: true, message: 'Яркость установлена на ' + v + '%' };
        }
        return { ok: false, message: 'Не удалось изменить яркость' };
    }

    function toggleFullscreen() {
        if (typeof window.toggleFullscreen === 'function') {
            window.toggleFullscreen();
            return { ok: true, message: 'Переключаю полноэкранный режим' };
        }
        return { ok: false, message: 'Полноэкранный режим недоступен' };
    }

    async function listFiles() {
        if (!window.SharedFiles) return [];
        try {
            if (window.SharedFiles.ready) await window.SharedFiles.ready();
            return window.SharedFiles.get() || [];
        } catch(e) { return []; }
    }

    async function createTextFile(name) {
        if (!window.SharedFiles) return { ok: false, message: 'Файловая система недоступна' };
        const fileName = (name || ('заметка_' + Date.now())) + (name && name.indexOf('.') !== -1 ? '' : '.txt');
        const bytes = new TextEncoder().encode('');
        let b64 = '';
        for (let i = 0; i < bytes.length; i++) b64 += String.fromCharCode(bytes[i]);
        const dataUrl = 'data:text/plain;charset=utf-8;base64,' + btoa(b64);
        const ok = await window.SharedFiles.add({
            id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
            name: fileName,
            size: 0,
            type: 'text/plain',
            data: dataUrl,
            date: new Date().toISOString(),
            extension: 'txt',
            parentId: null,
            isFolder: false
        });
        return ok
            ? { ok: true, message: 'Создан файл ' + fileName }
            : { ok: false, message: 'Не удалось создать файл' };
    }

    async function deleteFileByName(name) {
        if (!window.SharedFiles) return { ok: false, message: 'Файловая система недоступна' };
        const files = await listFiles();
        const target = files.find(f => f.name && f.name.toLowerCase() === String(name).toLowerCase());
        if (!target) return { ok: false, message: 'Файл не найден: ' + name };
        const ok = await window.SharedFiles.remove(target.id);
        return ok ? { ok: true, message: 'Удалён ' + target.name } : { ok: false, message: 'Не удалось удалить' };
    }

    async function renameFileByName(from, to) {
        if (!window.SharedFiles) return { ok: false, message: 'Файловая система недоступна' };
        const files = await listFiles();
        const target = files.find(f => f.name && f.name.toLowerCase() === String(from).toLowerCase());
        if (!target) return { ok: false, message: 'Файл не найден: ' + from };
        const copy = Object.assign({}, target, { name: to, date: new Date().toISOString() });
        const ok = await window.SharedFiles.update(copy);
        return ok ? { ok: true, message: 'Переименован в ' + to } : { ok: false, message: 'Не удалось переименовать' };
    }

    function startTimer(seconds) {
        if (typeof window.timeInit === 'function') {
            try { window.timeInit(); } catch(e) {}
        }
        setTimeout(function() {
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            const minInp = document.getElementById('timerMinutes');
            const secInp = document.getElementById('timerSeconds');
            if (minInp) minInp.value = m;
            if (secInp) secInp.value = s;
            const btn = document.getElementById('timerMainBtn');
            if (btn) btn.click();
        }, 300);
        return { ok: true, message: 'Таймер на ' + seconds + ' сек запущен' };
    }

    function setAlarm(hour, minute) {
        if (typeof window.timeInit === 'function') {
            try { window.timeInit(); } catch(e) {}
        }
        setTimeout(function() {
            const hh = document.getElementById('alarmHour');
            const mm = document.getElementById('alarmMinute');
            const setBtn = document.getElementById('alarmSetBtn');
            if (hh) hh.value = hour;
            if (mm) mm.value = minute;
            if (setBtn) setBtn.click();
        }, 300);
        return { ok: true, message: 'Будильник на ' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') };
    }

    async function handleIntent(intent, originalText) {
        switch (intent.type) {
            case 'open_app': {
                const r = openApp(intent.target);
                return r.message;
            }
            case 'close_app': {
                const id = findAppId(intent.target);
                if (id && window.ShnukCloseAnimation) {
                    const el = document.getElementById(id + 'App');
                    if (el) {
                        window.ShnukCloseAnimation(el, id, function() { if (el.parentNode) el.parentNode.removeChild(el); });
                        return 'Закрываю: ' + intent.target;
                    }
                }
                return 'Не удалось закрыть: ' + intent.target;
            }
            case 'set_theme': {
                setTheme(intent.theme);
                return 'Тема переключена на ' + (intent.theme === 'evening' ? 'тёмную' : 'светлую');
            }
            case 'get_theme':
                return 'Сейчас активна ' + getThemeName() + ' тема.';
            case 'set_brightness': {
                const r = setBrightness(intent.value);
                return r.message;
            }
            case 'set_timer': {
                const r = startTimer(intent.seconds);
                return r.message;
            }
            case 'set_alarm': {
                const r = setAlarm(intent.hour, intent.minute);
                return r.message;
            }
            case 'create_file': {
                const r = await createTextFile(intent.name);
                return r.message;
            }
            case 'delete_file': {
                const r = await deleteFileByName(intent.name);
                return r.message;
            }
            case 'rename_file': {
                const r = await renameFileByName(intent.from, intent.to);
                return r.message;
            }
            case 'list_files': {
                const files = await listFiles();
                if (files.length === 0) return 'Файлов пока нет.';
                const names = files.slice(0, 10).map(f => f.name).join(', ');
                return 'Файлов: ' + files.length + '. Первые: ' + names;
            }
            case 'count_files': {
                const files = await listFiles();
                return 'Всего файлов: ' + files.length;
            }
            case 'fullscreen': {
                const r = toggleFullscreen();
                return r.message;
            }
            case 'load_model': {
                if (engineReady) return 'Модель уже загружена.';
                if (engineLoading) return 'Модель загружается, подождите...';
                loadEngine();
                return 'Начинаю загрузку модели ' + MODEL_ID + '. Это может занять несколько минут.';
            }
            case 'help':
                return 'Могу открывать приложения, создавать, удалять и переименовывать файлы, менять темы и яркость, ставить таймер и будильник, включать полный экран. Скажите «Окей Ева» для активации голосом. Скажите «загрузи модель», чтобы включить Llama-3.2-3B.';
            case 'chat': {
                if (engineReady) {
                    const llmReply = await generateLLM(originalText);
                    if (llmReply) return llmReply;
                }
                const res = semanticSearch(originalText, KNOWLEDGE);
                if (res.score > 0.4) return res.item.a;
                return 'Не уверена, что поняла. Скажите «помощь», чтобы узнать, что я умею. Или скажите «загрузи модель», чтобы включить Llama-3.2-3B.';
            }
        }
        return 'Команда не распознана.';
    }

    async function respond(text) {
        const intent = detectIntent(text);
        return await handleIntent(intent, text);
    }

    function loadHistory() {
        try {
            const raw = localStorage.getItem(HISTORY_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch(e) { return []; }
    }

    function saveHistory(arr) {
        try {
            const trimmed = arr.slice(-50);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
        } catch(e) {}
    }

    function renderMessage(role, text) {
        const msg = document.createElement('div');
        const isUser = role === 'user';
        msg.style.cssText = `
            max-width: 82%;
            padding: 10px 14px;
            border: 2px solid ${isUser ? 'var(--accent)' : 'var(--border-color)'};
            background: ${isUser ? 'var(--accent)' : 'var(--bg-secondary)'};
            color: ${isUser ? 'var(--text-on-accent)' : 'var(--text-primary)'};
            font-family: ${FONT_MAIN};
            font-size: 14px;
            line-height: 1.5;
            word-break: break-word;
            align-self: ${isUser ? 'flex-end' : 'flex-start'};
            white-space: pre-wrap;
        `;
        msg.textContent = text;
        return msg;
    }

    function appendToLog(role, text) {
        const logEl = document.getElementById('evaLog');
        if (!logEl) return;
        logEl.appendChild(renderMessage(role, text));
        logEl.scrollTop = logEl.scrollHeight;
    }

    async function sendText(text) {
        if (isThinking) return;
        text = String(text || '').trim();
        if (!text) return;
        isThinking = true;

        appendToLog('user', text);
        const hist = loadHistory();
        hist.push({ role: 'user', text, t: Date.now() });
        saveHistory(hist);

        const thinking = document.createElement('div');
        thinking.id = 'evaThinking';
        thinking.style.cssText = `
            align-self: flex-start;
            padding: 10px 14px;
            color: var(--text-muted);
            font-family: ${FONT_MAIN};
            font-size: 13px;
            letter-spacing: 0.3px;
        `;
        thinking.textContent = engineReady ? 'Ева думает (Llama)...' : 'Ева думает...';
        const logEl = document.getElementById('evaLog');
        if (logEl) { logEl.appendChild(thinking); logEl.scrollTop = logEl.scrollHeight; }

        const answer = await respond(text);

        if (thinking.parentNode) thinking.parentNode.removeChild(thinking);

        appendToLog('assistant', answer);
        hist.push({ role: 'assistant', text: answer, t: Date.now() });
        saveHistory(hist);

        isThinking = false;
    }

    function buildUI() {
        if (root && root.parentNode) return;

        root = document.createElement('div');
        root.id = 'shnukEvaApp';
        root.style.cssText = `
            position: fixed;
            top: var(--livebar-h, 44px);
            left: 0;
            width: 100%;
            height: calc(100% - var(--livebar-h, 44px));
            background: var(--bg-primary);
            color: var(--text-primary);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            font-family: ${FONT_MAIN};
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 18px;
            background: var(--header-bg);
            color: var(--header-text);
            border-bottom: 2px solid var(--border-color);
            flex-shrink: 0;
            gap: 12px;
        `;

        const titleWrap = document.createElement('div');
        titleWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;';
        const title = document.createElement('div');
        title.textContent = 'Shnuk Eva';
        title.style.cssText = 'font-size:18px;font-weight:700;letter-spacing:0.4px;';
        const sub = document.createElement('div');
        sub.id = 'evaStatus';
        sub.style.cssText = 'font-size:11px;color:var(--text-muted);letter-spacing:0.4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        sub.textContent = 'Локальный режим';
        titleWrap.appendChild(title);
        titleWrap.appendChild(sub);
        header.appendChild(titleWrap);

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:8px;align-items:center;flex-shrink:0;';

        const micBtn = document.createElement('button');
        micBtn.id = 'evaMicBtn';
        micBtn.textContent = '🎤';
        micBtn.title = 'Голосовой ввод';
        micBtn.style.cssText = `
            background: var(--bg-primary);
            border: 2px solid var(--border-color);
            color: var(--text-primary);
            font-size: 16px;
            padding: 6px 12px;
            cursor: pointer;
            font-family: inherit;
            transition: all 0.2s;
        `;
        micBtn.addEventListener('click', function() { startVoiceInput(micBtn); });
        actions.appendChild(micBtn);

        const wakeBtn = document.createElement('button');
        wakeBtn.id = 'evaWakeBtn';
        wakeBtn.textContent = 'ОК';
        wakeBtn.title = 'Активация по «Окей Ева»';
        wakeBtn.style.cssText = `
            background: var(--bg-primary);
            border: 2px solid var(--border-color);
            color: var(--text-primary);
            font-size: 13px;
            font-weight: 700;
            padding: 6px 12px;
            cursor: pointer;
            font-family: inherit;
            transition: all 0.2s;
        `;
        wakeBtn.addEventListener('click', toggleWake);
        actions.appendChild(wakeBtn);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: var(--bg-primary);
            border: 2px solid var(--accent);
            color: var(--accent);
            font-size: 16px;
            padding: 4px 12px;
            cursor: pointer;
            font-family: inherit;
            transition: all 0.2s;
        `;
        closeBtn.addEventListener('click', closeEva);
        actions.appendChild(closeBtn);

        header.appendChild(actions);

        const logEl = document.createElement('div');
        logEl.id = 'evaLog';
        logEl.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            background: var(--bg-primary);
        `;

        const loadBar = document.createElement('div');
        loadBar.id = 'evaLoadBar';
        loadBar.style.cssText = `
            display: none;
            flex-direction: column;
            gap: 6px;
            padding: 10px 16px;
            background: var(--bg-secondary);
            border-top: 1px solid var(--border-color);
            flex-shrink: 0;
        `;

        const loadBarText = document.createElement('div');
        loadBarText.id = 'evaLoadBarText';
        loadBarText.style.cssText = 'font-size:12px;color:var(--text-muted);';
        loadBarText.textContent = 'Загрузка модели...';

        const loadBarTrack = document.createElement('div');
        loadBarTrack.style.cssText = 'width:100%;height:6px;background:var(--border-color);overflow:hidden;';

        const loadBarFill = document.createElement('div');
        loadBarFill.id = 'evaLoadBarFill';
        loadBarFill.style.cssText = 'height:100%;width:0%;background:var(--accent);transition:width 0.3s;';

        loadBarTrack.appendChild(loadBarFill);
        loadBar.appendChild(loadBarText);
        loadBar.appendChild(loadBarTrack);

        const inputRow = document.createElement('div');
        inputRow.style.cssText = `
            display: flex;
            gap: 8px;
            padding: 12px 16px 16px;
            background: var(--bg-primary);
            border-top: 2px solid var(--border-color);
            flex-shrink: 0;
        `;

        const input = document.createElement('input');
        input.id = 'evaInput';
        input.type = 'text';
        input.placeholder = 'Спросите Еву...';
        input.style.cssText = `
            flex: 1;
            padding: 12px 14px;
            border: 2px solid var(--border-color);
            background: var(--bg-secondary);
            color: var(--text-primary);
            font-family: ${FONT_MAIN};
            font-size: 14px;
            outline: none;
            box-sizing: border-box;
        `;
        input.addEventListener('focus', function() {
            input.style.borderColor = 'var(--accent)';
        });
        input.addEventListener('blur', function() {
            input.style.borderColor = 'var(--border-color)';
        });
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendText(input.value);
                input.value = '';
            }
        });

        const sendBtn = document.createElement('button');
        sendBtn.textContent = '→';
        sendBtn.style.cssText = `
            padding: 12px 20px;
            border: none;
            background: var(--accent);
            color: var(--text-on-accent);
            font-family: ${FONT_MAIN};
            font-size: 18px;
            font-weight: 700;
            cursor: pointer;
        `;
        sendBtn.addEventListener('click', function() {
            sendText(input.value);
            input.value = '';
        });

        inputRow.appendChild(input);
        inputRow.appendChild(sendBtn);

        root.appendChild(header);
        root.appendChild(logEl);
        root.appendChild(loadBar);
        root.appendChild(inputRow);
        document.body.appendChild(root);

        const history = loadHistory();
        history.forEach(h => appendToLog(h.role, h.text));
        if (history.length === 0) {
            appendToLog('assistant', 'Привет. Я Shnuk Eva. Сейчас работаю в локальном режиме — понимаю команды системы. Скажите «загрузи модель», чтобы включить Llama-3.2-3B (нужен WebGPU и ~2.5 ГБ трафика). Скажите «помощь», чтобы узнать, что я умею.');
        }

        updateStatus();
    }

    function openEva() {
        if (isOpen) {
            const ex = document.getElementById('shnukEvaApp');
            if (ex) ex.style.display = 'flex';
            return;
        }
        isOpen = true;
        buildUI();
    }

    function closeEva() {
        isOpen = false;
        const el = document.getElementById('shnukEvaApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        root = null;
    }

    function destroy() {
        isOpen = false;
        stopWake();
        const el = document.getElementById('shnukEvaApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        root = null;
    }

    function startVoiceInput(btn) {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Голосовой ввод недоступен в этом браузере', { type: 'error' });
            }
            return;
        }
        const rec = new SR();
        rec.lang = 'ru-RU';
        rec.interimResults = false;
        rec.maxAlternatives = 1;

        if (btn) {
            btn.style.background = 'var(--accent)';
            btn.style.color = 'var(--text-on-accent)';
        }

        rec.onresult = function(e) {
            const t = e.results[0][0].transcript;
            const inp = document.getElementById('evaInput');
            if (inp) inp.value = t;
            sendText(t);
            if (inp) inp.value = '';
        };
        rec.onerror = function() {
            if (btn) {
                btn.style.background = 'var(--bg-primary)';
                btn.style.color = 'var(--text-primary)';
            }
        };
        rec.onend = function() {
            if (btn) {
                btn.style.background = 'var(--bg-primary)';
                btn.style.color = 'var(--text-primary)';
            }
        };
        try { rec.start(); } catch(e) {}
    }

    function startWake() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Wake-word недоступен в этом браузере', { type: 'error' });
            }
            return false;
        }
        if (wakeRecognition) return true;

        wakeRecognition = new SR();
        wakeRecognition.lang = 'ru-RU';
        wakeRecognition.continuous = true;
        wakeRecognition.interimResults = true;
        wakeRecognition.maxAlternatives = 1;

        wakeRecognition.onresult = function(e) {
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const transcript = e.results[i][0].transcript.toLowerCase().trim();
                if (transcript.indexOf(WAKE_PHRASE) !== -1 || transcript.indexOf(WAKE_ALT) !== -1) {
                    handleWake();
                    break;
                }
            }
        };
        wakeRecognition.onerror = function() {
            if (wakeActive) {
                setTimeout(function() {
                    try { wakeRecognition.start(); } catch(e) {}
                }, 500);
            }
        };
        wakeRecognition.onend = function() {
            if (wakeActive) {
                setTimeout(function() {
                    try { wakeRecognition.start(); } catch(e) {}
                }, 500);
            }
        };

        try {
            wakeRecognition.start();
            wakeActive = true;
            const btn = document.getElementById('evaWakeBtn');
            if (btn) {
                btn.style.background = 'var(--accent)';
                btn.style.color = 'var(--text-on-accent)';
                btn.textContent = 'ON';
            }
            if (window.Win && window.Win.notify) {
                window.Win.notify('Ева слушает «Окей Ева»', { type: 'success' });
            }
            return true;
        } catch(e) {
            wakeRecognition = null;
            return false;
        }
    }

    function stopWake() {
        wakeActive = false;
        if (wakeRecognition) {
            try { wakeRecognition.stop(); } catch(e) {}
            wakeRecognition = null;
        }
        const btn = document.getElementById('evaWakeBtn');
        if (btn) {
            btn.style.background = 'var(--bg-primary)';
            btn.style.color = 'var(--text-primary)';
            btn.textContent = 'ОК';
        }
    }

    function toggleWake() {
        if (wakeActive) stopWake();
        else startWake();
    }

    async function handleWake() {
        if (!isOpen) openEva();
        const rec = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        rec.lang = 'ru-RU';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        if (window.Win && window.Win.notify) {
            window.Win.notify('Слушаю...', { type: 'info', duration: 1500 });
        }
        rec.onresult = function(e) {
            const t = e.results[0][0].transcript;
            sendText(t);
        };
        try { rec.start(); } catch(e) {}
    }

    window.ShnukEva = {
        open: openEva,
        close: closeEva,
        destroy: destroy,
        send: sendText,
        startWake: startWake,
        stopWake: stopWake,
        loadModel: loadEngine,
        isModelReady: function() { return engineReady; },
        isModelLoading: function() { return engineLoading; },
        isWakeActive: function() { return wakeActive; }
    };
    window.evaInit = function() { openEva(); };
    window.shnukevaInit = function() { openEva(); };

})();