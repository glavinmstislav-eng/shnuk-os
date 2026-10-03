// gamecenter.js — Shnuk Game Center

(function() {
    'use strict';

    let isOpen = false;
    let activeGameId = null;
    let activeGameContainer = null;
    let activeCloseBtn = null;

    const FONT_MAIN = "'TTPaplane', monospace";

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
            id: 'missplane',
            name: 'Missplane',
            description: 'Управляйте самолётом джойстиком на белом фоне, уворачивайтесь от ракет, которые взрываются при столкновении.',
            icon: null,
            file: 'missplane.js',
            initFn: 'missplaneInit',
            destroyFn: 'Missplane',
            installed: false
        },
        {
            id: 'dvizuha',
            name: 'Dvizuha',
            description: 'Стратегия на карте: стройте ПВО, защищайте фронт, запускайте дроны, уничтожьте столицу врага.',
            icon: null,
            file: 'dviz.js',
            initFn: 'dvizInit',
            destroyFn: 'Dviz',
            installed: false
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

        if (window.ShnukCloseAnimation) {
            window.ShnukCloseAnimation(el, 'gamecenter', function() {
                el.remove();
                activeGameContainer = null;
                activeCloseBtn = null;
            });
        } else {
            el.style.opacity = '0';
            setTimeout(() => {
                el.remove();
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
            border: none;
            cursor: pointer;
            font-family: ${FONT_MAIN};
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

        const listEl = document.getElementById('gameCenterList');
        const headerEl = document.getElementById('gameCenterHeader');
        const backBtn = document.getElementById('gameCenterBackBtn');
        if (listEl) listEl.style.display = 'flex';
        if (headerEl) headerEl.style.display = 'flex';
        if (backBtn) backBtn.style.display = 'none';

        renderGameList();
    }

    function buildGameCard(game) {
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
                    renderGameList();
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Игра установлена', { type: 'success' });
                    }
                } else if (action === 'remove') {
                    uninstallGame(game.id);
                    renderGameList();
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Игра удалена', { type: 'success' });
                    }
                }
            });
        });

        return card;
    }

    function renderGameList() {
        const container = document.getElementById('gameCenterListInner');
        if (!container) return;

        if (GAMES.length === 0) {
            container.innerHTML = '<div class="gc-empty">Нет игр</div>';
            return;
        }

        container.innerHTML = '';
        GAMES.forEach(function(game) {
            container.appendChild(buildGameCard(game));
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

    function createUI() {
        if (document.getElementById('gameCenterApp')) {
            document.getElementById('gameCenterApp').style.display = 'flex';
            document.getElementById('gameCenterApp').style.opacity = '1';
            return;
        }
        isOpen = true;

        const app = document.createElement('div');
        app.id = 'gameCenterApp';
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
            font-family: ${FONT_MAIN};
            color: #1a1a1a;
            opacity: 0;
            animation: gcFadeIn 0.3s ease forwards;
            overflow: hidden;
            transition: background 0.4s ease, color 0.4s ease;
        `;

        if (!document.getElementById('gameCenterStyles')) {
            const style = document.createElement('style');
            style.id = 'gameCenterStyles';
            style.textContent = `
                @keyframes gcFadeIn { from { opacity: 0; } to { opacity: 1; } }

                #gameCenterApp, #gameCenterApp * {
                    font-family: ${FONT_MAIN} !important;
                }

                .gc-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 18px 24px;
                    background: #f5f5f5;
                    border-bottom: 3px solid #1a1a1a;
                    flex-shrink: 0;
                    position: relative;
                    z-index: 2;
                }
                .gc-header h1 {
                    font-size: 24px;
                    font-weight: 700;
                    margin: 0;
                    color: #1a1a1a;
                    letter-spacing: 1px;
                    text-transform: uppercase;
                }
                .gc-header-actions {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                .gc-close-btn {
                    width: 42px;
                    height: 42px;
                    background: #ffffff;
                    border: none;
                    color: #1a1a1a;
                    font-size: 20px;
                    cursor: pointer;
                    font-family: ${FONT_MAIN};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    padding: 0;
                }
                .gc-close-btn:hover {
                    background: #cc0000;
                    color: #ffffff;
                }
                .gc-back-btn {
                    display: none;
                    width: 42px;
                    height: 42px;
                    background: #ffffff;
                    border: none;
                    color: #1a1a1a;
                    font-size: 22px;
                    cursor: pointer;
                    font-family: ${FONT_MAIN};
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    padding: 0;
                }
                .gc-back-btn:hover {
                    background: #cc0000;
                    color: #ffffff;
                }

                .gc-list {
                    position: relative;
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-start;
                    z-index: 2;
                    background: #ffffff;
                    isolation: isolate;
                }
                .gc-list::after {
                    content: '';
                    position: sticky;
                    display: block;
                    bottom: -24px;
                    left: -24px;
                    right: -24px;
                    height: 80px;
                    margin-top: -80px;
                    pointer-events: none;
                    z-index: 20;
                    -webkit-backdrop-filter: blur(12px);
                    backdrop-filter: blur(12px);
                    -webkit-mask-image: linear-gradient(to top, #000 0%, #000 40%, transparent 100%);
                    mask-image: linear-gradient(to top, #000 0%, #000 40%, transparent 100%);
                }

                .gc-list-inner {
                    width: 100%;
                    max-width: 720px;
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                }

                .gc-card {
                    background: #ffffff;
                    border: none;
                    padding: 16px;
                    display: flex;
                    gap: 16px;
                    align-items: center;
                    color: #1a1a1a;
                    width: 100%;
                    box-sizing: border-box;
                    transition: transform 0.2s ease;
                }
                .gc-card:hover {
                    transform: translateY(-2px);
                }
                .gc-card-icon {
                    width: 72px;
                    height: 72px;
                    flex-shrink: 0;
                    background: #f0f0f0;
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    position: relative;
                    box-sizing: border-box;
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
                    color: #1a1a1a;
                    font-size: 32px;
                    font-weight: 700;
                    font-family: ${FONT_MAIN};
                }
                .gc-card-info {
                    flex: 1;
                    min-width: 0;
                }
                .gc-card-name {
                    font-size: 17px;
                    font-weight: 700;
                    color: #1a1a1a;
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
                    background: #1a1a1a;
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
                    border: none;
                    cursor: pointer;
                    font-family: ${FONT_MAIN};
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.8px;
                    transition: all 0.15s ease;
                    text-transform: uppercase;
                    min-width: 100px;
                    background: #eeeeee;
                    color: #1a1a1a;
                }
                .gc-btn.play {
                    background: #cc0000;
                    color: #ffffff;
                }
                .gc-btn.play:hover { background: #990000; }
                .gc-btn.install {
                    background: #1a1a1a;
                    color: #ffffff;
                }
                .gc-btn.install:hover { background: #000000; }
                .gc-btn.remove {
                    background: #f5f5f5;
                    color: #cc0000;
                }
                .gc-btn.remove:hover { background: #cc0000; color: #ffffff; }

                .gc-empty {
                    text-align: center;
                    color: #888888;
                    padding: 60px 20px;
                    font-size: 14px;
                }

                @media (max-width: 600px) {
                    .gc-header { padding: 12px 16px; }
                    .gc-header h1 { font-size: 18px; }
                    .gc-list { padding: 16px; }
                    .gc-list::after { bottom: -16px; left: -16px; right: -16px; }
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

        document.body.appendChild(app);

        document.getElementById('gameCenterCloseBtn').addEventListener('click', closeGameCenter);
        document.getElementById('gameCenterBackBtn').addEventListener('click', returnFromGame);

        document.addEventListener('keydown', onKeyDown);

        renderGameList();
    }

    window.GameCenter = {
        destroy: destroy,
        open: openGameCenter
    };
    window.gamecenterInit = function() { openGameCenter(); };

})();