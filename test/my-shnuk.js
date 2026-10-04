// my-shnuk.js — My Shnuk: информация об устройстве и поддержке

(function() {
    'use strict';

    let isOpen = false;
    let currentPage = 'home';
    let supportTimer = null;

    const APP_ID = 'myShnukApp';

    function getDevice() {
        if (window.SystemV && window.SystemV.getDevice) {
            return window.SystemV.getDevice();
        }
        return {
            id: 'base2',
            name: 'Shnuk 2',
            description: 'Неплохой вариант, брат :)',
            image: 'base2.png',
            supportUntil: '2026-11-20T00:00:00'
        };
    }

    function openMyShnuk() {
        if (isOpen) {
            const ex = document.getElementById(APP_ID);
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }
        createUI();
    }

    function closeMyShnuk() {
        isOpen = false;
        if (supportTimer) { clearInterval(supportTimer); supportTimer = null; }
        document.removeEventListener('keydown', onKeyDown);

        const el = document.getElementById(APP_ID);
        if (!el) return;

        if (window.ShnukCloseAnimation) {
            window.ShnukCloseAnimation(el, 'my-shnuk', function() {
                el.remove();
            });
        } else {
            el.style.opacity = '0';
            setTimeout(function() {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, 200);
        }
    }

    function destroy() {
        isOpen = false;
        if (supportTimer) { clearInterval(supportTimer); supportTimer = null; }
        document.removeEventListener('keydown', onKeyDown);
        const el = document.getElementById(APP_ID);
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') closeMyShnuk();
    }

    // ============================================
    // РЕНДЕР СТРАНИЦ
    // ============================================

    function renderHome(container) {
        const device = getDevice();

        const wrap = document.createElement('div');
        wrap.className = 'myshnuk-home';

        const img = document.createElement('img');
        img.className = 'myshnuk-device-image';
        img.src = device.image;
        img.alt = device.name;
        img.onerror = function() {
            this.style.display = 'none';
            const fallback = document.createElement('div');
            fallback.className = 'myshnuk-device-fallback';
            fallback.textContent = device.name;
            wrap.insertBefore(fallback, wrap.firstChild);
        };
        wrap.appendChild(img);

        const name = document.createElement('div');
        name.className = 'myshnuk-device-name';
        name.textContent = device.name;
        wrap.appendChild(name);

        const desc = document.createElement('div');
        desc.className = 'myshnuk-device-desc';
        desc.textContent = device.description;
        wrap.appendChild(desc);

        container.appendChild(wrap);
    }

    function formatTimeParts(ms) {
        if (ms < 0) ms = 0;
        const totalSec = Math.floor(ms / 1000);
        const days = Math.floor(totalSec / 86400);
        const hours = Math.floor((totalSec % 86400) / 3600);
        const minutes = Math.floor((totalSec % 3600) / 60);
        const seconds = totalSec % 60;
        const pad = function(n) { return n < 10 ? '0' + n : '' + n; };
        return {
            days: days,
            time: pad(hours) + ':' + pad(minutes) + ':' + pad(seconds)
        };
    }

    function renderSupport(container) {
        const device = getDevice();
        const until = new Date(device.supportUntil).getTime();

        const wrap = document.createElement('div');
        wrap.className = 'myshnuk-support';

        const title = document.createElement('div');
        title.className = 'myshnuk-support-title';
        title.textContent = 'Поддержка устройства';
        wrap.appendChild(title);

        const subtitle = document.createElement('div');
        subtitle.className = 'myshnuk-support-subtitle';
        subtitle.textContent = device.name;
        wrap.appendChild(subtitle);

        const timerWrap = document.createElement('div');
        timerWrap.className = 'myshnuk-support-timer-wrap';
        wrap.appendChild(timerWrap);

        const infoText = document.createElement('div');
        infoText.className = 'myshnuk-support-info';
        infoText.textContent = 'Поддержка активна до ' + formatDate(device.supportUntil);
        wrap.appendChild(infoText);

        container.appendChild(wrap);

        function updateTimer() {
            const now = Date.now();
            const diff = until - now;

            if (diff <= 0) {
                timerWrap.innerHTML = '';
                const ended = document.createElement('div');
                ended.className = 'myshnuk-support-ended';
                ended.textContent = 'Поддержка завершена. Навсегда';
                timerWrap.appendChild(ended);
                infoText.style.display = 'none';
                if (supportTimer) { clearInterval(supportTimer); supportTimer = null; }
                return;
            }

            const parts = formatTimeParts(diff);
            timerWrap.innerHTML = `
                <div class="myshnuk-timer-days">
                    <span class="myshnuk-timer-num">${parts.days}</span>
                    <span class="myshnuk-timer-label">дней</span>
                </div>
                <div class="myshnuk-timer-clock">${parts.time}</div>
            `;
        }

        updateTimer();
        if (supportTimer) clearInterval(supportTimer);
        supportTimer = setInterval(updateTimer, 1000);
    }

    function formatDate(iso) {
        try {
            const d = new Date(iso);
            const pad = function(n) { return n < 10 ? '0' + n : '' + n; };
            return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
        } catch(e) {
            return iso;
        }
    }

    // ============================================
    // UI
    // ============================================

    function injectStyles() {
        if (document.getElementById('myShnukStyles')) return;
        const style = document.createElement('style');
        style.id = 'myShnukStyles';
        style.textContent = `
            @keyframes myshnukFadeIn { from { opacity: 0; } to { opacity: 1; } }

            .myshnuk-root {
                position: fixed;
                top: var(--livebar-h, 44px);
                left: 0;
                width: 100%;
                height: calc(100% - var(--livebar-h, 44px));
                background: var(--bg-primary);
                color: var(--text-primary);
                font-family: 'ST-SimpleSquare', monospace;
                z-index: 99999;
                display: flex;
                flex-direction: column;
                opacity: 0;
                animation: myshnukFadeIn 0.3s ease forwards;
                overflow: hidden;
                transition: background 0.4s ease, color 0.4s ease;
            }

            .myshnuk-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                background: var(--header-bg);
                border-bottom: 2px solid var(--border-color);
                flex-shrink: 0;
                color: var(--header-text);
                gap: 8px;
            }
            .myshnuk-header h1 {
                font-size: 18px;
                font-weight: 700;
                margin: 0;
                letter-spacing: 0.5px;
            }
            .myshnuk-header-actions {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            .myshnuk-menu-btn,
            .myshnuk-close-btn {
                width: 40px;
                height: 40px;
                background: var(--bg-primary);
                border: 2px solid var(--border-color);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--text-primary);
                transition: all 0.2s ease;
                padding: 0;
                -webkit-tap-highlight-color: transparent;
                flex-shrink: 0;
            }
            .myshnuk-menu-btn:hover { border-color: var(--accent); background: var(--bg-hover); }
            .myshnuk-menu-btn svg { display: block; width: 22px; height: 22px; }
            .myshnuk-close-btn {
                border-color: var(--accent);
                color: var(--accent);
                font-size: 18px;
            }
            .myshnuk-close-btn:hover { background: var(--accent); color: var(--text-on-accent); }

            .myshnuk-menu-dropdown {
                position: absolute;
                top: 64px;
                right: 16px;
                background: var(--bg-primary);
                border: 2px solid var(--border-color);
                min-width: 220px;
                z-index: 100;
                box-shadow: 0 20px 60px rgba(0,0,0,0.15);
                padding: 8px;
            }
            .myshnuk-menu-item {
                display: block;
                width: 100%;
                padding: 12px 16px;
                background: none;
                border: none;
                color: var(--text-primary);
                font-family: 'ST-SimpleSquare', monospace;
                font-size: 14px;
                text-align: left;
                cursor: pointer;
                transition: all 0.15s ease;
                -webkit-tap-highlight-color: transparent;
            }
            .myshnuk-menu-item:hover { background: var(--bg-secondary); }
            .myshnuk-menu-item.active {
                background: var(--accent);
                color: var(--text-on-accent);
                font-weight: 700;
            }

            .myshnuk-content {
                flex: 1;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 32px 24px;
                box-sizing: border-box;
            }

            /* === Home === */
            .myshnuk-home {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                max-width: 520px;
                width: 100%;
            }
            .myshnuk-device-image {
                max-width: 320px;
                max-height: 320px;
                width: auto;
                height: auto;
                object-fit: contain;
                display: block;
                margin-bottom: 28px;
            }
            .myshnuk-device-fallback {
                width: 220px;
                height: 220px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--bg-secondary);
                border: 3px solid var(--border-color);
                color: var(--text-muted);
                font-size: 16px;
                font-weight: 700;
                margin-bottom: 28px;
                text-align: center;
                padding: 10px;
                box-sizing: border-box;
            }
            .myshnuk-device-name {
                font-size: 30px;
                font-weight: 700;
                color: var(--text-primary);
                letter-spacing: 0.5px;
                margin-bottom: 14px;
            }
            .myshnuk-device-desc {
                font-size: 15px;
                line-height: 1.6;
                color: var(--text-secondary);
                max-width: 440px;
            }

            /* === Support === */
            .myshnuk-support {
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                max-width: 520px;
                width: 100%;
            }
            .myshnuk-support-title {
                font-size: 24px;
                font-weight: 700;
                color: var(--text-primary);
                margin-bottom: 8px;
                letter-spacing: 0.5px;
            }
            .myshnuk-support-subtitle {
                font-size: 14px;
                color: var(--text-muted);
                margin-bottom: 40px;
                letter-spacing: 1px;
                text-transform: uppercase;
            }
            .myshnuk-support-timer-wrap {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 16px;
                padding: 32px 40px;
                border: 3px solid var(--border-color);
                background: var(--bg-secondary);
                min-width: 280px;
                box-sizing: border-box;
                margin-bottom: 24px;
            }
            .myshnuk-timer-days {
                display: flex;
                align-items: baseline;
                gap: 10px;
            }
            .myshnuk-timer-num {
                font-size: 64px;
                font-weight: 700;
                color: var(--accent);
                line-height: 1;
                letter-spacing: 2px;
            }
            .myshnuk-timer-label {
                font-size: 16px;
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .myshnuk-timer-clock {
                font-size: 32px;
                font-weight: 700;
                color: var(--text-primary);
                letter-spacing: 3px;
            }
            .myshnuk-support-ended {
                font-size: 22px;
                font-weight: 700;
                color: var(--accent);
                letter-spacing: 1px;
                padding: 20px 10px;
                text-align: center;
            }
            .myshnuk-support-info {
                font-size: 13px;
                color: var(--text-muted);
                letter-spacing: 0.5px;
            }

            @media (max-width: 500px) {
                .myshnuk-header { padding: 10px 12px; }
                .myshnuk-header h1 { font-size: 16px; }
                .myshnuk-menu-btn, .myshnuk-close-btn { width: 36px; height: 36px; }
                .myshnuk-menu-btn svg { width: 20px; height: 20px; }
                .myshnuk-menu-dropdown { top: 56px; right: 12px; min-width: 200px; }
                .myshnuk-content { padding: 24px 16px; }
                .myshnuk-device-image { max-width: 220px; max-height: 220px; margin-bottom: 20px; }
                .myshnuk-device-fallback { width: 160px; height: 160px; font-size: 14px; margin-bottom: 20px; }
                .myshnuk-device-name { font-size: 22px; margin-bottom: 10px; }
                .myshnuk-device-desc { font-size: 13px; }
                .myshnuk-support-title { font-size: 19px; }
                .myshnuk-support-subtitle { font-size: 12px; margin-bottom: 28px; }
                .myshnuk-support-timer-wrap { padding: 22px 24px; min-width: 220px; }
                .myshnuk-timer-num { font-size: 48px; }
                .myshnuk-timer-label { font-size: 13px; }
                .myshnuk-timer-clock { font-size: 24px; letter-spacing: 2px; }
                .myshnuk-support-ended { font-size: 17px; }
            }
        `;
        document.head.appendChild(style);
    }

    function createUI() {
        if (document.getElementById(APP_ID)) {
            document.getElementById(APP_ID).style.display = 'flex';
            isOpen = true;
            return;
        }

        injectStyles();
        isOpen = true;

        const root = document.createElement('div');
        root.className = 'myshnuk-root';
        root.id = APP_ID;

        const header = document.createElement('div');
        header.className = 'myshnuk-header';
        header.innerHTML = `
            <h1>My Shnuk</h1>
            <div class="myshnuk-header-actions">
                <button class="myshnuk-menu-btn" id="myshnukMenuBtn" title="Меню">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="4" y1="7" x2="20" y2="7"/>
                        <line x1="4" y1="12" x2="20" y2="12"/>
                        <line x1="4" y1="17" x2="20" y2="17"/>
                    </svg>
                </button>
                <button class="myshnuk-close-btn" id="myshnukCloseBtn" title="Закрыть">✕</button>
            </div>
        `;

        const content = document.createElement('div');
        content.className = 'myshnuk-content';
        content.id = 'myshnukContent';

        root.appendChild(header);
        root.appendChild(content);
        document.body.appendChild(root);

        document.getElementById('myshnukCloseBtn').addEventListener('click', closeMyShnuk);
        document.getElementById('myshnukMenuBtn').addEventListener('click', function(e) {
            e.stopPropagation();
            toggleMenu();
        });

        document.addEventListener('click', function(e) {
            const menu = document.getElementById('myshnukMenuDropdown');
            const btn = document.getElementById('myshnukMenuBtn');
            if (menu && !menu.contains(e.target) && !(btn && btn.contains(e.target))) {
                menu.remove();
            }
        });

        document.addEventListener('keydown', onKeyDown);

        renderPage('home');
    }

    function toggleMenu() {
        const existing = document.getElementById('myshnukMenuDropdown');
        if (existing) { existing.remove(); return; }

        const menu = document.createElement('div');
        menu.className = 'myshnuk-menu-dropdown';
        menu.id = 'myshnukMenuDropdown';

        const items = [
            { id: 'home', label: 'Главная страница' },
            { id: 'support', label: 'О поддержке' }
        ];

        items.forEach(function(item) {
            const btn = document.createElement('button');
            btn.className = 'myshnuk-menu-item' + (currentPage === item.id ? ' active' : '');
            btn.textContent = item.label;
            btn.addEventListener('click', function() {
                renderPage(item.id);
                menu.remove();
            });
            menu.appendChild(btn);
        });

        const root = document.getElementById(APP_ID);
        if (root) root.appendChild(menu);
    }

    function renderPage(page) {
        currentPage = page;
        if (supportTimer) { clearInterval(supportTimer); supportTimer = null; }

        const content = document.getElementById('myshnukContent');
        if (!content) return;
        content.innerHTML = '';

        if (page === 'support') {
            renderSupport(content);
        } else {
            renderHome(content);
        }
    }

    window.MyShnuk = {
        destroy: destroy,
        open: openMyShnuk
    };
    window['my-shnukInit'] = function() { openMyShnuk(); };

    // Псевдоним для сканера (id 'my-shnuk' превращается в 'my-shnuk' + 'Init')
    window.myShnukInit = function() { openMyShnuk(); };

})();