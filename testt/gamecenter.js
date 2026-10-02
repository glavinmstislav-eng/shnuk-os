// gamecenter.js — Shnuk Game Center

(function() {
    'use strict';

    let isOpen = false;
    let activeGameId = null;
    let activeGameContainer = null;
    let activeCloseBtn = null;

    let currentCarouselIndex = 0;
    let carouselExpanded = false;

    const CARD_HEIGHT = 130;
    const CARD_GAP = 14;

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

        const listEl = document.getElementById('gameCenterList');
        const headerEl = document.getElementById('gameCenterHeader');
        const backBtn = document.getElementById('gameCenterBackBtn');
        if (listEl) listEl.style.display = 'flex';
        if (headerEl) headerEl.style.display = 'flex';
        if (backBtn) backBtn.style.display = 'none';

        buildCarousel();
    }

    // ============================================
    // КАРУСЕЛЬ
    // ============================================
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
                    buildCarousel();
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Игра установлена', { type: 'success' });
                    }
                } else if (action === 'remove') {
                    uninstallGame(game.id);
                    buildCarousel();
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Игра удалена', { type: 'success' });
                    }
                }
            });
        });

        return card;
    }

    function buildCarousel() {
        const container = document.getElementById('gameCenterListInner');
        if (!container) return;

        if (GAMES.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:#888;padding:40px;">Нет игр</div>';
            return;
        }

        if (currentCarouselIndex >= GAMES.length) currentCarouselIndex = 0;

        container.innerHTML = '';

        const carousel = document.createElement('div');
        carousel.className = 'gc-carousel';
        if (carouselExpanded) carousel.classList.add('expanded');

        const total = GAMES.length;
        let upIdx, centerIdx, downIdx;

        if (total === 1) {
            upIdx = centerIdx = downIdx = 0;
        } else if (total === 2) {
            upIdx = (currentCarouselIndex - 1 + total) % total;
            centerIdx = currentCarouselIndex;
            downIdx = centerIdx;
        } else {
            upIdx = (currentCarouselIndex - 1 + total) % total;
            centerIdx = currentCarouselIndex;
            downIdx = (currentCarouselIndex + 1) % total;
        }

        const cardDefs = [];
        if (total === 1) {
            cardDefs.push({ idx: centerIdx, pos: 0 });
        } else if (total === 2) {
            cardDefs.push({ idx: upIdx, pos: -1 });
            cardDefs.push({ idx: centerIdx, pos: 0 });
        } else {
            cardDefs.push({ idx: upIdx, pos: -1 });
            cardDefs.push({ idx: centerIdx, pos: 0 });
            cardDefs.push({ idx: downIdx, pos: 1 });
        }

        cardDefs.forEach(function(def) {
            const card = buildGameCard(GAMES[def.idx]);
            card.dataset.pos = String(def.pos);
            carousel.appendChild(card);
        });

        container.appendChild(carousel);

        updateCarouselHeight(carousel, cardDefs.length);
        // Устанавливаем начальную раскладку
        if (carouselExpanded) {
            layoutExpanded(carousel);
        } else {
            layoutCollapsed(carousel);
        }
    }

    function updateCarouselHeight(carousel, count) {
        const expandedHeight = count * CARD_HEIGHT + (count - 1) * CARD_GAP + 40;
        const collapsedHeight = CARD_HEIGHT + 2 * 80;
        const h = carousel.classList.contains('expanded') ? expandedHeight : collapsedHeight;
        carousel.style.height = h + 'px';
    }

    function layoutCollapsed(carousel) {
        const cards = carousel.querySelectorAll('.gc-card');
        const H = carousel.clientHeight;
        const centerY = H / 2;

        cards.forEach(function(card) {
            const pos = parseInt(card.dataset.pos, 10) || 0;
            card.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s ease, filter 0.45s ease, top 0.5s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.4s ease';
            card.style.left = '50%';
            card.style.top = centerY + 'px';

            if (pos === 0) {
                card.style.transform = 'translate(-50%, -50%) scale(1) translateY(0)';
                card.style.opacity = '1';
                card.style.filter = 'blur(0)';
                card.style.zIndex = '3';
                card.style.boxShadow = '0 12px 40px rgba(0,0,0,0.12)';
                card.style.pointerEvents = 'auto';
            } else if (pos === -1) {
                card.style.transform = 'translate(-50%, -50%) scale(0.85) translateY(-95px)';
                card.style.opacity = '0.4';
                card.style.filter = 'blur(1.5px)';
                card.style.zIndex = '2';
                card.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)';
                card.style.pointerEvents = 'none';
            } else if (pos === 1) {
                card.style.transform = 'translate(-50%, -50%) scale(0.85) translateY(95px)';
                card.style.opacity = '0.4';
                card.style.filter = 'blur(1.5px)';
                card.style.zIndex = '2';
                card.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)';
                card.style.pointerEvents = 'none';
            }
        });
    }

    function layoutExpanded(carousel) {
        const cards = carousel.querySelectorAll('.gc-card');
        const sorted = Array.from(cards).sort(function(a, b) {
            return (parseInt(a.dataset.pos, 10) || 0) - (parseInt(b.dataset.pos, 10) || 0);
        });

        sorted.forEach(function(card, i) {
            const y = i * (CARD_HEIGHT + CARD_GAP) + CARD_HEIGHT / 2 + 20;
            card.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s ease, filter 0.45s ease, top 0.5s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.4s ease';
            card.style.left = '50%';
            card.style.top = '0px';
            card.style.transform = 'translate(-50%, -50%) scale(1) translateY(' + (y - CARD_HEIGHT / 2 - 20) + 'px)';
            card.style.opacity = '1';
            card.style.filter = 'blur(0)';
            card.style.zIndex = '3';
            card.style.boxShadow = '0 8px 28px rgba(0,0,0,0.12)';
            card.style.pointerEvents = 'auto';
        });
    }

    function setExpanded(expanded) {
        const carousel = document.querySelector('.gc-carousel');
        if (!carousel) return;
        carouselExpanded = expanded;

        const count = carousel.children.length;
        updateCarouselHeight(carousel, count);

        if (expanded) {
            carousel.classList.add('expanded');
            layoutExpanded(carousel);
        } else {
            carousel.classList.remove('expanded');
            layoutCollapsed(carousel);
        }
    }

    function bindCarouselEvents() {
        const container = document.getElementById('gameCenterList');
        if (!container || container.__carouselBound) return;
        container.__carouselBound = true;

        let collapseTimer = null;

        container.addEventListener('mouseenter', function() {
            if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
            if (!carouselExpanded) setExpanded(true);
        });

        container.addEventListener('mouseleave', function() {
            if (collapseTimer) clearTimeout(collapseTimer);
            collapseTimer = setTimeout(function() {
                if (carouselExpanded) setExpanded(false);
            }, 320);
        });

        container.addEventListener('click', function(e) {
            if (e.target.closest('.gc-card')) return;
            if (e.target.closest('.gc-btn')) return;
            setExpanded(!carouselExpanded);
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
    // UI
    // ============================================

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
            font-family: 'ST-SimpleSquare', monospace;
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
                    border: 2px solid #1a1a1a;
                    color: #1a1a1a;
                    font-size: 20px;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    padding: 0;
                }
                .gc-close-btn:hover {
                    background: #cc0000;
                    border-color: #cc0000;
                    color: #ffffff;
                }
                .gc-back-btn {
                    display: none;
                    width: 42px;
                    height: 42px;
                    background: #ffffff;
                    border: 2px solid #1a1a1a;
                    color: #1a1a1a;
                    font-size: 22px;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    padding: 0;
                }
                .gc-back-btn:hover {
                    background: #cc0000;
                    border-color: #cc0000;
                    color: #ffffff;
                }

                .gc-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    z-index: 2;
                    background: #ffffff;
                    cursor: pointer;
                }
                .gc-list-inner {
                    position: relative;
                    width: 100%;
                    max-width: 720px;
                    min-height: 480px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .gc-carousel {
                    position: relative;
                    width: 100%;
                    height: 300px;
                    transition: height 0.5s cubic-bezier(0.22, 1, 0.36, 1);
                }

                .gc-card {
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    background: #ffffff;
                    border: 3px solid #1a1a1a;
                    padding: 16px;
                    display: flex;
                    gap: 16px;
                    align-items: center;
                    cursor: pointer;
                    color: #1a1a1a;
                    width: 100%;
                    max-width: 640px;
                    box-sizing: border-box;
                    transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1),
                                opacity 0.45s ease,
                                filter 0.45s ease,
                                top 0.5s cubic-bezier(0.22, 1, 0.36, 1),
                                box-shadow 0.4s ease,
                                border-color 0.2s ease;
                    will-change: transform, opacity, top;
                    transform-origin: center center;
                }
                .gc-card:hover {
                    border-color: #cc0000;
                }

                .gc-card-icon {
                    width: 72px;
                    height: 72px;
                    flex-shrink: 0;
                    background: #f0f0f0;
                    border: 2px solid #1a1a1a;
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
                    font-family: 'ST-SimpleSquare', monospace;
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
                    border: 2px solid #1a1a1a;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.8px;
                    transition: all 0.15s ease;
                    text-transform: uppercase;
                    min-width: 100px;
                    background: #ffffff;
                    color: #1a1a1a;
                }
                .gc-btn.play {
                    background: #cc0000;
                    color: #ffffff;
                    border-color: #cc0000;
                }
                .gc-btn.play:hover { background: #990000; border-color: #990000; }
                .gc-btn.install {
                    background: #1a1a1a;
                    color: #ffffff;
                }
                .gc-btn.install:hover { background: #000000; }
                .gc-btn.remove {
                    background: #ffffff;
                    color: #cc0000;
                    border-color: #cc0000;
                }
                .gc-btn.remove:hover { background: #cc0000; color: #ffffff; }

                @media (max-width: 600px) {
                    .gc-header { padding: 12px 16px; }
                    .gc-header h1 { font-size: 18px; }
                    .gc-list { padding: 16px; }
                    .gc-list-inner { min-height: 420px; }
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

        bindCarouselEvents();
        buildCarousel();
    }

    window.GameCenter = {
        destroy: destroy,
        open: openGameCenter
    };
    window.gamecenterInit = function() { openGameCenter(); };

})();