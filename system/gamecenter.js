// gamecenter.js — Shnuk Game Center

(function() {
    'use strict';

    let isOpen = false;
    let currentView = 'list';
    let activeGameId = null;
    let activeGameContainer = null;
    let activeCloseBtn = null;
    let leavesLayer = null;

    const GAMES = [
        {
            id: 'driving',
            name: 'Driving',
            description: 'Ночная 3D-гонка по заснеженной трассе. Объезжайте препятствия.',
            icon: 'game1.png',
            file: 'game.js',
            initFn: 'gameInit',
            destroyFn: 'Game',
            installed: true
        },
        {
            id: 'cheese-chess',
            name: 'Cheese Chess',
            description: 'Шахматы. Белые — мыши, чёрные — куски сыра.',
            icon: null,
            file: 'cheese-chess.js',
            initFn: 'cheeseChessInit',
            destroyFn: 'CheeseChess',
            installed: false
        },
        {
            id: 'shoot-ch',
            name: 'Shoot Chess',
            description: 'Король с дробовиком. Убей все фигуры как можно быстрее.',
            icon: null,
            file: 'shoot-ch.js',
            initFn: 'shootChInit',
            destroyFn: 'ShootCh',
            installed: false
        },
        {
            id: 'tinywalls',
            name: 'Tiny Walls',
            description: 'Tower defense. Строй стены и защищай главный блок от монстров.',
            icon: null,
            file: 'tiny.js',
            initFn: 'tinyInit',
            destroyFn: 'TinyWalls',
            installed: false
        }
    ];

    const INSTALLED_KEY = 'shnuk_gamecenter_installed';

    function getInstalled() {
        try {
            const raw = localStorage.getItem(INSTALLED_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch(e) { return {}; }
    }

    function setInstalled(map) {
        try { localStorage.setItem(INSTALLED_KEY, JSON.stringify(map)); } catch(e) {}
    }

    function isGameInstalled(id) {
        const game = GAMES.find(g => g.id === id);
        if (game && game.installed) return true;
        const installed = getInstalled();
        return !!installed[id];
    }

    function installGame(id) {
        const installed = getInstalled();
        installed[id] = true;
        setInstalled(installed);
    }

    function uninstallGame(id) {
        const game = GAMES.find(g => g.id === id);
        if (game && game.installed) return;
        const installed = getInstalled();
        delete installed[id];
        setInstalled(installed);
    }

    function openGameCenter() {
        if (isOpen) {
            const ex = document.getElementById('gameCenterApp');
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }
        createUI();
    }

    function closeGameCenter() {
        if (activeGameId) {
            stopActiveGame();
        }

        isOpen = false;
        document.removeEventListener('keydown', onKeyDown);

        const el = document.getElementById('gameCenterApp');
        if (!el) return;

        // Скрываем слой листьев перед анимацией, чтобы не клонировался
        if (leavesLayer) leavesLayer.style.display = 'none';

        if (window.ShnukCloseAnimation) {
            window.ShnukCloseAnimation(el, 'gamecenter', function() {
                el.remove();
                leavesLayer = null;
                activeGameContainer = null;
                activeCloseBtn = null;
            });
        } else {
            el.style.opacity = '0';
            setTimeout(() => {
                el.remove();
                leavesLayer = null;
                activeGameContainer = null;
                activeCloseBtn = null;
            }, 250);
        }
    }

    function destroy() {
        stopActiveGame();
        isOpen = false;
        document.removeEventListener('keydown', onKeyDown);
        const el = document.getElementById('gameCenterApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        leavesLayer = null;
    }

    function stopActiveGame() {
        if (activeGameId) {
            const game = GAMES.find(g => g.id === activeGameId);
            if (game && game.destroyFn) {
                try {
                    if (window[game.destroyFn] && typeof window[game.destroyFn].destroy === 'function') {
                        window[game.destroyFn].destroy();
                    }
                } catch(e) {}
            }
            activeGameId = null;
        }
        if (activeCloseBtn && activeCloseBtn.parentNode) {
            activeCloseBtn.parentNode.removeChild(activeCloseBtn);
            activeCloseBtn = null;
        }
        if (activeGameContainer && activeGameContainer.parentNode) {
            activeGameContainer.parentNode.removeChild(activeGameContainer);
            activeGameContainer = null;
        }
    }

    function loadScript(src) {
        return new Promise(function(resolve) {
            if (window.__gameCenterLoaded && window.__gameCenterLoaded[src]) {
                resolve(true);
                return;
            }
            const script = document.createElement('script');
            script.src = src + '?t=' + Date.now();
            script.async = false;
            script.onload = function() {
                if (!window.__gameCenterLoaded) window.__gameCenterLoaded = {};
                window.__gameCenterLoaded[src] = true;
                resolve(true);
            };
            script.onerror = function() { resolve(false); };
            document.head.appendChild(script);
        });
    }

    function playGame(id) {
        const game = GAMES.find(g => g.id === id);
        if (!game) return;

        if (!isGameInstalled(id)) {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Сначала установите игру', { type: 'error' });
            }
            return;
        }

        activeGameId = id;

        if (leavesLayer) leavesLayer.style.display = 'none';

        const listEl = document.getElementById('gameCenterList');
        const headerEl = document.getElementById('gameCenterHeader');
        const backBtn = document.getElementById('gameCenterBackBtn');
        if (listEl) listEl.style.display = 'none';
        if (headerEl) headerEl.style.display = 'none';
        if (backBtn) backBtn.style.display = 'flex';

        const app = document.getElementById('gameCenterApp');

        activeGameContainer = document.createElement('div');
        activeGameContainer.id = 'gameCenterGameContainer';
        activeGameContainer.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: #000000;
            z-index: 5;
            overflow: hidden;
        `;
        app.appendChild(activeGameContainer);

        activeCloseBtn = document.createElement('button');
        activeCloseBtn.id = 'gameCenterGameCloseBtn';
        activeCloseBtn.textContent = '✕';
        activeCloseBtn.title = 'Выйти из игры';
        activeCloseBtn.style.cssText = `
            position: fixed;
            top: calc(var(--livebar-h, 44px) + 14px);
            right: 14px;
            width: 44px;
            height: 44px;
            background: #cc0000;
            color: #ffffff;
            border: 3px solid #ffffff;
            cursor: pointer;
            font-family: 'ST-SimpleSquare', monospace;
            font-size: 22px;
            font-weight: 700;
            z-index: 2147483640;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            box-shadow: 0 4px 16px rgba(0,0,0,0.5);
            transition: all 0.15s ease;
            -webkit-tap-highlight-color: transparent;
        `;
        activeCloseBtn.addEventListener('mouseenter', function() {
            activeCloseBtn.style.background = '#990000';
            activeCloseBtn.style.transform = 'scale(1.08)';
        });
        activeCloseBtn.addEventListener('mouseleave', function() {
            activeCloseBtn.style.background = '#cc0000';
            activeCloseBtn.style.transform = 'scale(1)';
        });
        activeCloseBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            returnFromGame();
        });
        document.body.appendChild(activeCloseBtn);

        loadScript(game.file).then(function(ok) {
            if (!ok) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Не удалось загрузить игру', { type: 'error' });
                }
                returnFromGame();
                return;
            }
            setTimeout(function() {
                const initFn = window[game.initFn];
                if (typeof initFn === 'function') {
                    try {
                        initFn();
                    } catch(e) {
                        console.warn('[GameCenter] init error:', e);
                        if (window.Win && window.Win.notify) {
                            window.Win.notify('Ошибка запуска игры', { type: 'error' });
                        }
                        returnFromGame();
                    }
                } else {
                    console.warn('[GameCenter] init function not found:', game.initFn);
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Игра не инициализирована', { type: 'error' });
                    }
                    returnFromGame();
                }
            }, 30);
        });
    }

    function returnFromGame() {
        stopActiveGame();

        if (leavesLayer) leavesLayer.style.display = 'block';

        const listEl = document.getElementById('gameCenterList');
        const headerEl = document.getElementById('gameCenterHeader');
        const backBtn = document.getElementById('gameCenterBackBtn');
        if (listEl) listEl.style.display = 'flex';
        if (headerEl) headerEl.style.display = 'flex';
        if (backBtn) backBtn.style.display = 'none';

        renderList();
    }

    function renderList() {
        const list = document.getElementById('gameCenterListInner');
        if (!list) return;
        list.innerHTML = '';

        GAMES.forEach(function(game) {
            const installed = isGameInstalled(game.id);
            const card = document.createElement('div');
            card.className = 'gc-card';
            card.dataset.id = game.id;

            const iconHtml = game.icon
                ? `<img src="${game.icon}" alt="${game.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="gc-icon-fallback" style="display:none;">${game.name.charAt(0)}</span>`
                : `<span class="gc-icon-fallback">${game.name.charAt(0)}</span>`;

            card.innerHTML = `
                <div class="gc-card-icon">${iconHtml}</div>
                <div class="gc-card-info">
                    <div class="gc-card-name">${game.name}</div>
                    <div class="gc-card-desc">${game.description}</div>
                    ${installed ? '<div class="gc-card-badge">УСТАНОВЛЕНО</div>' : ''}
                </div>
                <div class="gc-card-actions">
                    ${installed
                        ? `<button class="gc-btn play" data-action="play">ИГРАТЬ</button>
                           ${game.installed ? '' : '<button class="gc-btn remove" data-action="remove">УДАЛИТЬ</button>'}`
                        : `<button class="gc-btn install" data-action="install">СКАЧАТЬ</button>`
                    }
                </div>
            `;

            card.querySelectorAll('.gc-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const action = this.dataset.action;
                    if (action === 'play') {
                        playGame(game.id);
                    } else if (action === 'install') {
                        installGame(game.id);
                        renderList();
                        if (window.Win && window.Win.notify) {
                            window.Win.notify('Игра установлена', { type: 'success' });
                        }
                    } else if (action === 'remove') {
                        uninstallGame(game.id);
                        renderList();
                        if (window.Win && window.Win.notify) {
                            window.Win.notify('Игра удалена', { type: 'success' });
                        }
                    }
                });
            });

            card.addEventListener('click', function(e) {
                if (e.target.closest('.gc-btn')) return;
                if (isGameInstalled(game.id)) {
                    playGame(game.id);
                }
            });

            list.appendChild(card);
        });
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') {
            if (activeGameId) {
                returnFromGame();
            } else {
                closeGameCenter();
            }
        }
    }

    // ============================================
    // ПАДАЮЩИЕ ЛИСТЬЯ
    // ============================================

    function createLeavesLayer(app) {
        leavesLayer = document.createElement('div');
        leavesLayer.id = 'gcLeavesLayer';
        leavesLayer.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            overflow: hidden;
            pointer-events: none;
            z-index: 1;
        `;

        const LEAF_COUNT = 22;
        const COLORS = ['#ffb347', '#ff8c42', '#d4a017', '#c86b2b', '#e0a93a', '#b8860b'];

        for (let i = 0; i < LEAF_COUNT; i++) {
            const leaf = document.createElement('div');
            const size = 8 + Math.random() * 10;
            const color = COLORS[Math.floor(Math.random() * COLORS.length)];
            const left = Math.random() * 100;
            const delay = Math.random() * 12;
            const duration = 10 + Math.random() * 10;
            const rotateStart = Math.random() * 360;
            const swayDur = 2 + Math.random() * 3;

            leaf.style.cssText = `
                position: absolute;
                top: -40px;
                left: ${left}%;
                width: ${size}px;
                height: ${size * 1.3}px;
                background: ${color};
                border-radius: 50% 0 50% 0;
                opacity: 0.75;
                transform: rotate(${rotateStart}deg);
                animation: gcLeafFall ${duration}s linear ${delay}s infinite,
                           gcLeafSway ${swayDur}s ease-in-out ${delay}s infinite alternate;
                box-shadow: inset -2px -2px 3px rgba(0,0,0,0.15);
            `;
            leavesLayer.appendChild(leaf);
        }

        app.appendChild(leavesLayer);
    }

    function injectLeafStyles() {
        if (document.getElementById('gcLeafStyles')) return;
        const style = document.createElement('style');
        style.id = 'gcLeafStyles';
        style.textContent = `
            @keyframes gcLeafFall {
                0% { top: -40px; }
                100% { top: 110%; }
            }
            @keyframes gcLeafSway {
                0% { margin-left: -20px; transform: rotate(0deg); }
                100% { margin-left: 20px; transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================
    // UI
    // ============================================

    function createUI() {
        if (document.getElementById('gameCenterApp')) {
            document.getElementById('gameCenterApp').style.display = 'flex';
            document.getElementById('gameCenterApp').style.opacity = '1';
            return;
        }
        isOpen = true;

        injectLeafStyles();

        const app = document.createElement('div');
        app.id = 'gameCenterApp';
        app.style.cssText = `
            position: fixed;
            top: var(--livebar-h, 44px);
            left: 0;
            width: 100%;
            height: calc(100% - var(--livebar-h, 44px));
            background: linear-gradient(180deg, #1a5c2e 0%, #0f3d1e 100%);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            font-family: 'ST-SimpleSquare', monospace;
            color: #ffffff;
            opacity: 0;
            animation: gcFadeIn 0.3s ease forwards;
            overflow: hidden;
        `;

        if (!document.getElementById('gameCenterStyles')) {
            const style = document.createElement('style');
            style.id = 'gameCenterStyles';
            style.textContent = `
                @keyframes gcFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes gcCardIn {
                    from { opacity: 0; transform: translateY(20px); filter: blur(10px); }
                    to { opacity: 1; transform: translateY(0); filter: blur(0); }
                }

                .gc-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 18px 24px;
                    background: rgba(10, 48, 24, 0.85);
                    border-bottom: 3px solid #0a3018;
                    flex-shrink: 0;
                    position: relative;
                    z-index: 2;
                }
                .gc-header h1 {
                    font-size: 24px;
                    font-weight: 700;
                    margin: 0;
                    color: #ffffff;
                    letter-spacing: 1px;
                    text-transform: uppercase;
                    text-shadow: 0 2px 6px rgba(0,0,0,0.4);
                }
                .gc-header-actions {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                .gc-close-btn {
                    width: 42px;
                    height: 42px;
                    background: #0a3018;
                    border: 2px solid #000000;
                    color: #ffffff;
                    font-size: 20px;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    padding: 0;
                }
                .gc-close-btn:hover { background: #cc0000; }
                .gc-back-btn {
                    display: none;
                    width: 42px;
                    height: 42px;
                    background: #0a3018;
                    border: 2px solid #000000;
                    color: #ffffff;
                    font-size: 22px;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    padding: 0;
                }
                .gc-back-btn:hover { background: #cc0000; }

                .gc-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px;
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                    max-width: 720px;
                    width: 100%;
                    margin: 0 auto;
                    box-sizing: border-box;
                    position: relative;
                    z-index: 2;
                }
                .gc-list-inner {
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                    width: 100%;
                }

                .gc-card {
                    background: #ffffff;
                    border: 3px solid #0a3018;
                    padding: 16px;
                    display: flex;
                    gap: 16px;
                    align-items: center;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    animation: gcCardIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) backwards;
                    color: #1a1a1a;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                }
                .gc-card:nth-child(1) { animation-delay: 0.02s; }
                .gc-card:nth-child(2) { animation-delay: 0.06s; }
                .gc-card:nth-child(3) { animation-delay: 0.1s; }
                .gc-card:nth-child(4) { animation-delay: 0.14s; }
                .gc-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
                }
                .gc-card-icon {
                    width: 72px;
                    height: 72px;
                    flex-shrink: 0;
                    background: #1a5c2e;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    position: relative;
                }
                .gc-card-icon img {
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    display: block;
                }
                .gc-icon-fallback {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #ffffff;
                    font-size: 32px;
                    font-weight: 700;
                    font-family: 'ST-SimpleSquare', monospace;
                }
                .gc-card-info {
                    flex: 1;
                    min-width: 0;
                }
                .gc-card-name {
                    font-size: 17px;
                    font-weight: 700;
                    color: #0a3018;
                    margin-bottom: 4px;
                    letter-spacing: 0.3px;
                }
                .gc-card-desc {
                    font-size: 12px;
                    color: #555555;
                    line-height: 1.45;
                    margin-bottom: 6px;
                }
                .gc-card-badge {
                    display: inline-block;
                    font-size: 9px;
                    background: #1a5c2e;
                    color: #ffffff;
                    padding: 2px 8px;
                    letter-spacing: 1px;
                    font-weight: 700;
                }
                .gc-card-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    flex-shrink: 0;
                }
                .gc-btn {
                    padding: 8px 18px;
                    border: 2px solid #000000;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.8px;
                    transition: all 0.15s ease;
                    text-transform: uppercase;
                    min-width: 100px;
                }
                .gc-btn.play {
                    background: #cc0000;
                    color: #ffffff;
                }
                .gc-btn.play:hover { background: #990000; }
                .gc-btn.install {
                    background: #0066cc;
                    color: #ffffff;
                }
                .gc-btn.install:hover { background: #004488; }
                .gc-btn.remove {
                    background: #ffffff;
                    color: #cc0000;
                    border-color: #cc0000;
                }
                .gc-btn.remove:hover { background: #cc0000; color: #ffffff; }

                @media (max-width: 600px) {
                    .gc-header { padding: 12px 16px; }
                    .gc-header h1 { font-size: 18px; }
                    .gc-list { padding: 16px; gap: 10px; }
                    .gc-card { padding: 12px; gap: 12px; }
                    .gc-card-icon { width: 56px; height: 56px; }
                    .gc-card-name { font-size: 14px; }
                    .gc-card-desc { font-size: 11px; }
                    .gc-btn { padding: 6px 12px; font-size: 11px; min-width: 80px; }
                }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'gc-header';
        header.id = 'gameCenterHeader';
        header.innerHTML = `
            <h1>Game Center</h1>
            <div class="gc-header-actions">
                <button class="gc-back-btn" id="gameCenterBackBtn" title="Назад">‹</button>
                <button class="gc-close-btn" id="gameCenterCloseBtn" title="Закрыть">✕</button>
            </div>
        `;

        const list = document.createElement('div');
        list.className = 'gc-list';
        list.id = 'gameCenterList';
        list.innerHTML = '<div class="gc-list-inner" id="gameCenterListInner"></div>';

        app.appendChild(header);
        app.appendChild(list);

        createLeavesLayer(app);

        document.body.appendChild(app);

        document.getElementById('gameCenterCloseBtn').addEventListener('click', closeGameCenter);
        document.getElementById('gameCenterBackBtn').addEventListener('click', returnFromGame);

        document.addEventListener('keydown', onKeyDown);

        renderList();
    }

    window.GameCenter = {
        destroy: destroy,
        open: openGameCenter
    };
    window.gamecenterInit = function() { openGameCenter(); };

})();