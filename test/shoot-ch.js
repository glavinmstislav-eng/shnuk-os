// shoot-ch.js — Shoot Chess (король с дробовиком против движущихся фигур)

(function() {
    'use strict';

    let container = null;
    let canvas = null;
    let sctx = null;
    let animationId = null;
    let initialized = false;

    const GRID = 8;
    let CELL = 56;

    let king = { r: 7, c: 4 };
    let enemies = [];
    let bullets = [];
    let particles = [];
    let killed = 0;
    let startTime = 0;
    let elapsed = 0;
    let gameOver = false;
    let won = false;
    let cooldown = 0;
    let moveDelay = 0;
    let bestTime = null;
    let playerTurnLocked = false;
    let enemyMoveTimer = 0;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isTouching = false;
    let touchMoved = false;
    const SWIPE_THRESHOLD = 24;
    const TAP_TIME = 300;

    const BEST_KEY = 'shnuk_shoot_ch_best';

    async function getBest() {
        try {
            if (window.svaer && typeof window.svaer.get === 'function') {
                const v = await window.svaer.get(BEST_KEY, null);
                if (v === null || v === undefined || v === '') return null;
                const n = parseFloat(v);
                return isNaN(n) ? null : n;
            }
        } catch(e) {}
        try {
            const v = localStorage.getItem(BEST_KEY);
            return v ? parseFloat(v) : null;
        } catch(e) { return null; }
    }

    async function setBest(t) {
        try {
            if (window.svaer && typeof window.svaer.set === 'function') {
                await window.svaer.set(BEST_KEY, t);
                return;
            }
        } catch(e) {}
        try { localStorage.setItem(BEST_KEY, String(t)); } catch(e) {}
    }

    // ============================================
    // Спрайты
    // ============================================

    function drawKingSprite(x, y, size) {
        if (!sctx) return;
        sctx.save();
        sctx.translate(x - size / 2, y - size / 2);
        sctx.scale(size / 28, size / 28);

        sctx.fillStyle = '#ffe066';
        sctx.beginPath();
        sctx.moveTo(4, 26);
        sctx.lineTo(4, 14);
        sctx.quadraticCurveTo(14, 8, 24, 14);
        sctx.lineTo(24, 26);
        sctx.closePath();
        sctx.fill();
        sctx.strokeStyle = '#000';
        sctx.lineWidth = 1.6;
        sctx.stroke();

        sctx.fillStyle = '#fff5cc';
        sctx.beginPath();
        sctx.arc(14, 10, 5.5, 0, Math.PI * 2);
        sctx.fill();
        sctx.stroke();

        sctx.fillStyle = '#cc9900';
        sctx.beginPath();
        sctx.moveTo(8, 6);
        sctx.lineTo(10, 1);
        sctx.lineTo(12, 5);
        sctx.lineTo(14, 0);
        sctx.lineTo(16, 5);
        sctx.lineTo(18, 1);
        sctx.lineTo(20, 6);
        sctx.closePath();
        sctx.fill();
        sctx.stroke();

        sctx.fillStyle = '#000';
        sctx.beginPath();
        sctx.arc(12, 10, 0.9, 0, Math.PI * 2);
        sctx.fill();
        sctx.beginPath();
        sctx.arc(16, 10, 0.9, 0, Math.PI * 2);
        sctx.fill();

        sctx.fillStyle = '#333';
        sctx.fillRect(20, 15, 9, 3);
        sctx.fillStyle = '#666';
        sctx.fillRect(21, 16, 6, 1.2);
        sctx.fillStyle = '#8b4513';
        sctx.fillRect(18, 15.5, 3, 2);

        sctx.restore();
    }

    function drawRookSprite(x, y, size) {
        if (!sctx) return;
        sctx.save();
        sctx.translate(x - size / 2, y - size / 2);
        sctx.scale(size / 28, size / 28);

        sctx.fillStyle = '#cc0000';
        sctx.beginPath();
        sctx.moveTo(6, 24);
        sctx.lineTo(6, 10);
        sctx.lineTo(8, 10);
        sctx.lineTo(8, 6);
        sctx.lineTo(11, 6);
        sctx.lineTo(11, 9);
        sctx.lineTo(13, 9);
        sctx.lineTo(13, 6);
        sctx.lineTo(15, 6);
        sctx.lineTo(15, 9);
        sctx.lineTo(17, 9);
        sctx.lineTo(17, 6);
        sctx.lineTo(20, 6);
        sctx.lineTo(20, 10);
        sctx.lineTo(22, 10);
        sctx.lineTo(22, 24);
        sctx.closePath();
        sctx.fill();
        sctx.strokeStyle = '#000';
        sctx.lineWidth = 1.6;
        sctx.stroke();

        sctx.strokeStyle = '#660000';
        sctx.lineWidth = 0.8;
        sctx.beginPath();
        sctx.moveTo(6, 14); sctx.lineTo(22, 14);
        sctx.moveTo(6, 19); sctx.lineTo(22, 19);
        sctx.moveTo(11, 10); sctx.lineTo(11, 14);
        sctx.moveTo(17, 10); sctx.lineTo(17, 14);
        sctx.stroke();

        sctx.restore();
    }

    function drawBishopSprite(x, y, size) {
        if (!sctx) return;
        sctx.save();
        sctx.translate(x - size / 2, y - size / 2);
        sctx.scale(size / 28, size / 28);

        sctx.fillStyle = '#8844cc';
        sctx.beginPath();
        sctx.arc(14, 13, 7, Math.PI, 0);
        sctx.lineTo(21, 22);
        sctx.lineTo(7, 22);
        sctx.closePath();
        sctx.fill();
        sctx.strokeStyle = '#000';
        sctx.lineWidth = 1.6;
        sctx.stroke();

        sctx.strokeStyle = '#fff';
        sctx.lineWidth = 1.4;
        sctx.beginPath();
        sctx.moveTo(14, 6); sctx.lineTo(14, 11);
        sctx.moveTo(11, 8.5); sctx.lineTo(17, 8.5);
        sctx.stroke();

        sctx.fillStyle = '#8844cc';
        sctx.fillRect(7, 22, 14, 3);
        sctx.strokeRect(7, 22, 14, 3);

        sctx.restore();
    }

    // ============================================
    // UI
    // ============================================

    function buildUI() {
        if (!container) return false;

        container.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.id = 'shootChWrap';
        wrap.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: #1a1a1a;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: 'ST-SimpleSquare', monospace;
            color: #fff;
            overflow: hidden;
            padding: 8px;
            box-sizing: border-box;
            user-select: none;
            -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
            touch-action: none;
        `;

        const hud = document.createElement('div');
        hud.style.cssText = `
            display: flex;
            gap: 12px;
            background: rgba(0,0,0,0.7);
            border: 2px solid #cc0000;
            padding: 6px 14px;
            font-size: 13px;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
            flex-wrap: wrap;
            justify-content: center;
            flex-shrink: 0;
        `;
        hud.innerHTML = `
            <span>ВРЕМЯ: <b id="shootTime" style="color:#ffe066;">0.00</b></span>
            <span>УБИТО: <b id="shootKilled" style="color:#ffe066;">0</b></span>
            <span>РЕКОРД: <b id="shootBest" style="color:#ffe066;">—</b></span>
        `;

        canvas = document.createElement('canvas');
        canvas.id = 'shootChCanvas';
        canvas.style.cssText = `
            display: block;
            border: 2px solid #cc0000;
            background: #2a2a2a;
            touch-action: none;
            max-width: 100%;
            max-height: 100%;
        `;

        const controls = document.createElement('div');
        controls.style.cssText = `
            margin-top: 10px;
            display: flex;
            gap: 10px;
            flex-shrink: 0;
        `;

        const resetBtn = document.createElement('button');
        resetBtn.textContent = 'ЗАНОВО';
        resetBtn.style.cssText = `
            padding: 10px 24px;
            background: #cc0000;
            color: #fff;
            border: 2px solid #fff;
            cursor: pointer;
            font-family: inherit;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 1px;
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
        `;
        resetBtn.addEventListener('click', resetGame);

        controls.appendChild(resetBtn);

        wrap.appendChild(hud);
        wrap.appendChild(canvas);
        wrap.appendChild(controls);
        container.appendChild(wrap);

        sctx = canvas.getContext('2d');
        if (!sctx) return false;

        // Читаем рекорд асинхронно после построения UI.
        getBest().then(function(v) {
            bestTime = v;
            updateBestHud();
        }).catch(function() {});

        resizeCanvas();
        return true;
    }

    function resizeCanvas() {
        if (!canvas || !container) return;
        const wrap = document.getElementById('shootChWrap');
        if (!wrap) return;

        const wrapRect = wrap.getBoundingClientRect();
        const hudH = wrap.querySelector('div').offsetHeight || 30;
        const controlsH = wrap.querySelector('div:last-child').offsetHeight || 50;

        const availW = wrapRect.width - 16;
        const availH = wrapRect.height - hudH - controlsH - 30;

        const side = Math.max(200, Math.min(availW, availH));

        canvas.style.width = side + 'px';
        canvas.style.height = side + 'px';

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(side * dpr);
        canvas.height = Math.round(side * dpr);

        CELL = canvas.width / GRID;
    }

    function updateBestHud() {
        const el = document.getElementById('shootBest');
        if (!el) return;
        el.textContent = bestTime !== null ? bestTime.toFixed(2) + 'с' : '—';
    }

    function spawnEnemies() {
        enemies = [];
        const positions = [];
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                if (r === king.r && c === king.c) continue;
                if (r >= 6 && Math.abs(c - king.c) <= 1) continue;
                positions.push({ r, c });
            }
        }
        const shuffled = positions.sort(() => Math.random() - 0.5);
        const count = 8;
        for (let i = 0; i < count && i < shuffled.length; i++) {
            const p = shuffled[i];
            const type = i % 2 === 0 ? 'rook' : 'bishop';
            enemies.push({
                r: p.r,
                c: p.c,
                type: type,
                alive: true
            });
        }
    }

    function resetGame() {
        king = { r: 7, c: 4 };
        bullets = [];
        particles = [];
        killed = 0;
        startTime = performance.now();
        elapsed = 0;
        gameOver = false;
        won = false;
        cooldown = 0;
        moveDelay = 0;
        playerTurnLocked = false;
        enemyMoveTimer = 0;
        spawnEnemies();
        updateHud();
    }

    function updateHud() {
        const timeEl = document.getElementById('shootTime');
        const killedEl = document.getElementById('shootKilled');
        if (timeEl) timeEl.textContent = elapsed.toFixed(2);
        if (killedEl) killedEl.textContent = killed;
    }

    function cellCenter(r, c) {
        return { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 };
    }

    function enemyAt(r, c) {
        for (let e of enemies) {
            if (e.alive && e.r === r && e.c === c) return e;
        }
        return null;
    }

    // ============================================
    // ХОД ИГРОКА
    // ============================================

    function shoot(targetX, targetY) {
        if (cooldown > 0 || gameOver || playerTurnLocked) return;
        cooldown = 10;
        const kc = cellCenter(king.r, king.c);
        const dx = targetX - kc.x;
        const dy = targetY - kc.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.001) return;
        const speed = CELL * 0.25;
        bullets.push({
            x: kc.x, y: kc.y,
            vx: (dx / len) * speed,
            vy: (dy / len) * speed,
            life: 90,
            fromEnemy: false,
            radius: Math.max(3, CELL * 0.07)
        });
        scheduleEnemyMove();
    }

    function tryMove(dr, dc) {
        if (moveDelay > 0 || gameOver || playerTurnLocked) return;
        const nr = king.r + dr;
        const nc = king.c + dc;
        if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) return;
        if (enemyAt(nr, nc)) return;

        king.r = nr;
        king.c = nc;
        moveDelay = 8;
        scheduleEnemyMove();
    }

    function scheduleEnemyMove() {
        playerTurnLocked = true;
        enemyMoveTimer = 14;
    }

    // ============================================
    // ХОД ВРАГОВ
    // ============================================

    function getEnemyMoves(e) {
        const dr = king.r - e.r;
        const dc = king.c - e.c;

        if (e.type === 'rook') {
            if (dr === 0) return [{ dr: 0, dc: dc > 0 ? 1 : -1 }];
            if (dc === 0) return [{ dr: dr > 0 ? 1 : -1, dc: 0 }];
            if (Math.abs(dr) > Math.abs(dc)) {
                return [
                    { dr: dr > 0 ? 1 : -1, dc: 0 },
                    { dr: 0, dc: dc > 0 ? 1 : -1 }
                ];
            } else {
                return [
                    { dr: 0, dc: dc > 0 ? 1 : -1 },
                    { dr: dr > 0 ? 1 : -1, dc: 0 }
                ];
            }
        } else {
            if (Math.abs(dr) === Math.abs(dc)) {
                return [{ dr: dr > 0 ? 1 : -1, dc: dc > 0 ? 1 : -1 }];
            }
            const moves = [];
            if (dr !== 0 && dc !== 0) {
                moves.push({ dr: dr > 0 ? 1 : -1, dc: dc > 0 ? 1 : -1 });
            }
            if (Math.abs(dr) > Math.abs(dc)) {
                moves.push({ dr: dr > 0 ? 1 : -1, dc: 0 });
            } else if (Math.abs(dc) > Math.abs(dr)) {
                moves.push({ dr: 0, dc: dc > 0 ? 1 : -1 });
            }
            return moves;
        }
    }

    function moveEnemies() {
        const sorted = enemies
            .filter(e => e.alive)
            .sort((a, b) => {
                const da = Math.abs(a.r - king.r) + Math.abs(a.c - king.c);
                const db = Math.abs(b.r - king.r) + Math.abs(b.c - king.c);
                return da - db;
            });

        for (const e of sorted) {
            if (gameOver) return;

            if (e.r === king.r && e.c === king.c) {
                gameOver = true;
                return;
            }

            const moves = getEnemyMoves(e);
            for (const m of moves) {
                const nr = e.r + m.dr;
                const nc = e.c + m.dc;
                if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue;

                const other = enemyAt(nr, nc);
                if (other && other !== e) continue;

                if (nr === king.r && nc === king.c) {
                    e.r = nr;
                    e.c = nc;
                    gameOver = true;
                    return;
                }

                e.r = nr;
                e.c = nc;
                break;
            }
        }
    }

    // ============================================
    // UPDATE / DRAW
    // ============================================

    function update() {
        if (gameOver) return;

        if (!won) {
            elapsed = (performance.now() - startTime) / 1000;
            updateHud();
        }

        if (cooldown > 0) cooldown--;
        if (moveDelay > 0) moveDelay--;

        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            b.life--;

            if (b.life <= 0 || b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
                bullets.splice(i, 1);
                continue;
            }

            let hit = false;
            for (let e of enemies) {
                if (!e.alive) continue;
                const ec = cellCenter(e.r, e.c);
                const dx = ec.x - b.x;
                const dy = ec.y - b.y;
                const hitRadius = CELL * 0.4 + (b.radius || 4);
                if (dx * dx + dy * dy < hitRadius * hitRadius) {
                    e.alive = false;
                    killed++;
                    spawnParticles(ec.x, ec.y, '#ffe066');
                    updateHud();
                    hit = true;
                    break;
                }
            }
            if (hit) bullets.splice(i, 1);
        }

        if (playerTurnLocked) {
            enemyMoveTimer--;
            if (enemyMoveTimer <= 0) {
                moveEnemies();
                playerTurnLocked = false;
            }
        }

        if (!won && enemies.every(e => !e.alive)) {
            won = true;
            gameOver = true;
            (async function() {
                if (bestTime === null || elapsed < bestTime) {
                    bestTime = elapsed;
                    updateBestHud();
                    await setBest(bestTime);
                }
            })();
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.95;
            p.vy *= 0.95;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function spawnParticles(x, y, color) {
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = CELL * 0.03 + Math.random() * CELL * 0.07;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 30,
                color
            });
        }
    }

    function draw() {
        if (!sctx) return;

        sctx.fillStyle = '#2a2a2a';
        sctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                const isLight = (r + c) % 2 === 0;
                sctx.fillStyle = isLight ? '#3a3a3a' : '#2a2a2a';
                sctx.fillRect(c * CELL, r * CELL, CELL, CELL);
            }
        }

        sctx.strokeStyle = '#555';
        sctx.lineWidth = 1;
        for (let i = 0; i <= GRID; i++) {
            sctx.beginPath();
            sctx.moveTo(i * CELL, 0);
            sctx.lineTo(i * CELL, GRID * CELL);
            sctx.stroke();
            sctx.beginPath();
            sctx.moveTo(0, i * CELL);
            sctx.lineTo(GRID * CELL, i * CELL);
            sctx.stroke();
        }

        for (let e of enemies) {
            if (!e.alive) continue;
            const ec = cellCenter(e.r, e.c);
            if (e.type === 'rook') drawRookSprite(ec.x, ec.y, CELL * 0.85);
            else drawBishopSprite(ec.x, ec.y, CELL * 0.85);
        }

        const kc = cellCenter(king.r, king.c);
        drawKingSprite(kc.x, kc.y, CELL * 0.9);

        for (let b of bullets) {
            sctx.fillStyle = '#ffe066';
            sctx.beginPath();
            sctx.arc(b.x, b.y, b.radius || 4, 0, Math.PI * 2);
            sctx.fill();
        }

        for (let p of particles) {
            sctx.globalAlpha = p.life / 30;
            sctx.fillStyle = p.color;
            sctx.fillRect(p.x - 2, p.y - 2, 4, 4);
        }
        sctx.globalAlpha = 1;

        if (gameOver) {
            sctx.fillStyle = 'rgba(0,0,0,0.75)';
            sctx.fillRect(0, 0, canvas.width, canvas.height);
            const big = Math.max(24, canvas.width * 0.07);
            const med = Math.max(14, canvas.width * 0.04);
            sctx.fillStyle = won ? '#ffe066' : '#cc0000';
            sctx.font = `bold ${big}px 'ST-SimpleSquare', monospace`;
            sctx.textAlign = 'center';
            sctx.textBaseline = 'middle';
            sctx.fillText(won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ', canvas.width / 2, canvas.height / 2 - big * 0.8);
            sctx.fillStyle = '#fff';
            sctx.font = `${med}px 'ST-SimpleSquare', monospace`;
            sctx.fillText('Время: ' + elapsed.toFixed(2) + 'с', canvas.width / 2, canvas.height / 2 + med * 0.5);
            if (won && bestTime !== null) {
                sctx.fillStyle = '#ffe066';
                sctx.font = `${med * 0.8}px 'ST-SimpleSquare', monospace`;
                sctx.fillText('Рекорд: ' + bestTime.toFixed(2) + 'с', canvas.width / 2, canvas.height / 2 + med * 1.8);
            }
        }
    }

    function loop() {
        animationId = requestAnimationFrame(loop);
        try {
            update();
            draw();
        } catch(e) {
            console.warn('[ShootCh] loop error:', e);
        }
    }

    // ============================================
    // ЖЕСТЫ
    // ============================================

    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        let cx, cy;
        if (e.touches && e.touches[0]) {
            cx = e.touches[0].clientX;
            cy = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches[0]) {
            cx = e.changedTouches[0].clientX;
            cy = e.changedTouches[0].clientY;
        } else {
            cx = e.clientX;
            cy = e.clientY;
        }
        return {
            x: (cx - rect.left) * (canvas.width / rect.width),
            y: (cy - rect.top) * (canvas.height / rect.height)
        };
    }

    function onPointerDown(e) {
        if (!canvas || gameOver) return;
        const touch = (e.touches && e.touches[0]) || e;
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = performance.now();
        isTouching = true;
        touchMoved = false;
    }

    function onPointerMove(e) {
        if (!isTouching || gameOver) return;
        const touch = (e.touches && e.touches[0]) || e;
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        if (Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(dy) > SWIPE_THRESHOLD) {
            touchMoved = true;
        }
    }

    function onPointerUp(e) {
        if (!isTouching || gameOver) {
            isTouching = false;
            return;
        }
        isTouching = false;

        const touch = (e.changedTouches && e.changedTouches[0]) || e;
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        const dt = performance.now() - touchStartTime;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);

        if (adx > SWIPE_THRESHOLD || ady > SWIPE_THRESHOLD) {
            if (adx > ady) {
                if (dx > 0) tryMove(0, 1);
                else tryMove(0, -1);
            } else {
                if (dy > 0) tryMove(1, 0);
                else tryMove(-1, 0);
            }
            return;
        }

        if (dt < TAP_TIME && !touchMoved) {
            const pos = getCanvasCoords(e);
            shoot(pos.x, pos.y);
        }
    }

    function onContextMenu(e) {
        e.preventDefault();
    }

    // ============================================
    // INIT / DESTROY
    // ============================================

    function onKeyDown(e) {
        if (!initialized) return;
        const k = e.key.toLowerCase();
        if (k === 'w' || k === 'arrowup') { tryMove(-1, 0); e.preventDefault(); }
        else if (k === 's' || k === 'arrowdown') { tryMove(1, 0); e.preventDefault(); }
        else if (k === 'a' || k === 'arrowleft') { tryMove(0, -1); e.preventDefault(); }
        else if (k === 'd' || k === 'arrowright') { tryMove(0, 1); e.preventDefault(); }
    }

    let resizeHandler = null;

    function init() {
        try {
            container = document.getElementById('gameCenterGameContainer');
            if (!container) {
                console.warn('[ShootCh] container not found');
                return false;
            }

            const ok = buildUI();
            if (!ok) {
                console.warn('[ShootCh] buildUI failed');
                return false;
            }

            resetGame();

            canvas.addEventListener('mousedown', onPointerDown);
            window.addEventListener('mousemove', onPointerMove);
            window.addEventListener('mouseup', onPointerUp);

            canvas.addEventListener('touchstart', onPointerDown, { passive: true });
            canvas.addEventListener('touchmove', onPointerMove, { passive: true });
            canvas.addEventListener('touchend', onPointerUp, { passive: true });
            canvas.addEventListener('touchcancel', function() { isTouching = false; }, { passive: true });

            canvas.addEventListener('contextmenu', onContextMenu);

            window.addEventListener('keydown', onKeyDown);

            resizeHandler = function() { resizeCanvas(); };
            window.addEventListener('resize', resizeHandler);
            window.addEventListener('orientationchange', resizeHandler);

            initialized = true;
            loop();
            return true;
        } catch(e) {
            console.warn('[ShootCh] init error:', e);
            return false;
        }
    }

    function destroy() {
        initialized = false;
        if (animationId) { cancelAnimationFrame(animationId); animationId = null; }

        if (canvas) {
            canvas.removeEventListener('mousedown', onPointerDown);
            canvas.removeEventListener('touchstart', onPointerDown);
            canvas.removeEventListener('touchmove', onPointerMove);
            canvas.removeEventListener('touchend', onPointerUp);
            canvas.removeEventListener('contextmenu', onContextMenu);
        }
        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('mouseup', onPointerUp);
        window.removeEventListener('keydown', onKeyDown);
        if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
            window.removeEventListener('orientationchange', resizeHandler);
            resizeHandler = null;
        }

        if (container) container.innerHTML = '';
        container = null;
        canvas = null;
        sctx = null;
    }

    window.shootChInit = init;
    window.ShootCh = { destroy: destroy, init: init };

})();