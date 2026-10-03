// missplane.js — Missplane: самолёт против ракет

(function() {
    'use strict';

    let container = null;
    let canvas = null;
    let ctx = null;
    let animationId = null;
    let initialized = false;
    let inputBound = false;

    let W = 0, H = 0;
    let dpr = 1;

    let worldW = 4000;
    let worldH = 3000;

    let plane = {
        x: worldW / 2,
        y: worldH / 2,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 2,
        speed: 3.4,
        maxSpeed: 5.6,
        turnRate: 0.06,
        size: 18
    };

    let camera = {
        x: 0, y: 0,
        smooth: 0.08
    };

    let joy = {
        active: false,
        id: null,
        baseX: 0, baseY: 0,
        curX: 0, curY: 0,
        radius: 70,
        knobRadius: 26
    };

    let missiles = [];
    let missileSpawnTimer = 0;
    let missileSpawnInterval = 90;

    let explosions = [];
    let trail = [];

    let score = 0;
    let best = 0;
    let lives = 3;
    let invulnerableTimer = 0;

    let gameOver = false;
    let gameStarted = false;
    let startTime = 0;
    let elapsed = 0;

    let keys = { left: false, right: false, up: false, down: false };

    const BEST_KEY = 'shnuk_missplane_best';
    const FONT_MAIN = "'TTPaplane', monospace";

    function getBest() {
        try {
            const v = localStorage.getItem(BEST_KEY);
            return v ? parseFloat(v) : 0;
        } catch(e) { return 0; }
    }

    function setBest(v) {
        try { localStorage.setItem(BEST_KEY, String(v)); } catch(e) {}
    }

    // ============================================
    // UI
    // ============================================

    function buildUI() {
        if (!container) return false;
        container.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.id = 'missplaneWrap';
        wrap.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: #ffffff;
            overflow: hidden;
            font-family: ${FONT_MAIN};
            touch-action: none;
            user-select: none;
            -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
        `;

        const hud = document.createElement('div');
        hud.style.cssText = `
            position: absolute;
            top: 12px; left: 0;
            width: 100%;
            padding: 0 16px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            pointer-events: none;
            z-index: 10;
            color: #1a1a1a;
            font-family: ${FONT_MAIN};
            box-sizing: border-box;
            gap: 10px;
        `;
        hud.innerHTML = `
            <div style="background:rgba(255,255,255,0.85);padding:6px 12px;display:flex;flex-direction:column;">
                <div style="font-size:10px;opacity:0.55;letter-spacing:1px;">ОЧКИ</div>
                <div id="mpScore" style="font-size:22px;font-weight:700;line-height:1;">0</div>
            </div>
            <div style="background:rgba(255,255,255,0.85);padding:6px 12px;display:flex;flex-direction:column;align-items:flex-end;">
                <div style="font-size:10px;opacity:0.55;letter-spacing:1px;">ЖИЗНИ</div>
                <div id="mpLives" style="font-size:22px;font-weight:700;line-height:1;">3</div>
            </div>
        `;

        canvas = document.createElement('canvas');
        canvas.id = 'missplaneCanvas';
        canvas.style.cssText = `
            display: block;
            width: 100%;
            height: 100%;
            background: #ffffff;
            touch-action: none;
        `;

        const gameOverScreen = document.createElement('div');
        gameOverScreen.id = 'mpGameOver';
        gameOverScreen.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(255,255,255,0.92);
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 20;
            color: #1a1a1a;
            font-family: ${FONT_MAIN};
            padding: 20px;
            box-sizing: border-box;
        `;
        gameOverScreen.innerHTML = `
            <div style="font-size:44px;font-weight:700;color:#cc0000;letter-spacing:2px;">ИГРА ОКОНЧЕНА</div>
            <div style="font-size:20px;margin-top:12px;opacity:0.75;">Очки: <span id="mpFinalScore">0</span></div>
            <div style="font-size:14px;margin-top:6px;opacity:0.55;">Рекорд: <span id="mpBest">0</span></div>
            <button id="mpRestart" style="
                margin-top: 26px;
                padding: 14px 44px;
                background: #cc0000;
                border: none;
                color: #ffffff;
                font-size: 16px;
                font-weight: 700;
                cursor: pointer;
                font-family: ${FONT_MAIN};
                letter-spacing: 1px;
            ">ЗАНОВО</button>
        `;

        const startScreen = document.createElement('div');
        startScreen.id = 'mpStart';
        startScreen.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: #ffffff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 25;
            color: #1a1a1a;
            font-family: ${FONT_MAIN};
            padding: 20px;
            box-sizing: border-box;
        `;
        startScreen.innerHTML = `
            <div style="font-size:40px;font-weight:700;letter-spacing:2px;">MISSPLANE</div>
            <div style="font-size:14px;margin-top:14px;opacity:0.6;text-align:center;max-width:340px;line-height:1.6;">
                Управляйте самолётом с помощью джойстика в любом месте экрана.<br>Уворачивайтесь от ракет. Ракеты взрываются при столкновении друг с другом.
            </div>
            <button id="mpStartBtn" style="
                margin-top: 32px;
                padding: 14px 52px;
                background: #cc0000;
                border: none;
                color: #ffffff;
                font-size: 16px;
                font-weight: 700;
                cursor: pointer;
                font-family: ${FONT_MAIN};
                letter-spacing: 2px;
            ">НАЧАТЬ</button>
        `;

        wrap.appendChild(canvas);
        wrap.appendChild(hud);
        wrap.appendChild(gameOverScreen);
        wrap.appendChild(startScreen);
        container.appendChild(wrap);

        ctx = canvas.getContext('2d');
        if (!ctx) return false;

        best = getBest();

        document.getElementById('mpStartBtn').addEventListener('click', startGame);
        document.getElementById('mpRestart').addEventListener('click', restartGame);

        bindInput();

        window.addEventListener('resize', onResize);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        resizeCanvas();
        return true;
    }

    function resizeCanvas() {
        if (!canvas || !container) return;
        const wrap = document.getElementById('missplaneWrap');
        if (!wrap) return;
        const rect = wrap.getBoundingClientRect();
        W = rect.width;
        H = rect.height;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function onResize() {
        resizeCanvas();
    }

    // ============================================
    // ИГРА
    // ============================================

    function startGame() {
        const startScreen = document.getElementById('mpStart');
        if (startScreen) startScreen.style.display = 'none';
        restartGame();
    }

    function restartGame() {
        plane.x = worldW / 2;
        plane.y = worldH / 2;
        plane.vx = 0;
        plane.vy = 0;
        plane.angle = -Math.PI / 2;
        plane.speed = 3.4;

        camera.x = plane.x - W / 2;
        camera.y = plane.y - H / 2;

        missiles = [];
        explosions = [];
        trail = [];
        missileSpawnTimer = 0;
        missileSpawnInterval = 90;

        score = 0;
        lives = 3;
        invulnerableTimer = 90;

        gameOver = false;
        gameStarted = true;
        startTime = performance.now();
        elapsed = 0;

        joy.active = false;
        joy.id = null;
        joy.baseX = 0;
        joy.baseY = 0;
        joy.curX = 0;
        joy.curY = 0;

        keys.left = false;
        keys.right = false;
        keys.up = false;
        keys.down = false;

        document.getElementById('mpGameOver').style.display = 'none';
        updateHud();
    }

    function updateHud() {
        const sEl = document.getElementById('mpScore');
        if (sEl) sEl.textContent = score;
        const lEl = document.getElementById('mpLives');
        if (lEl) lEl.textContent = lives;
    }

    function spawnMissile() {
        const margin = 500;
        const side = Math.floor(Math.random() * 4);
        let x, y;
        if (side === 0) { x = plane.x + (Math.random() - 0.5) * 1000; y = plane.y - margin; }
        else if (side === 1) { x = plane.x + margin; y = plane.y + (Math.random() - 0.5) * 1000; }
        else if (side === 2) { x = plane.x + (Math.random() - 0.5) * 1000; y = plane.y + margin; }
        else { x = plane.x - margin; y = plane.y + (Math.random() - 0.5) * 1000; }

        x = Math.max(20, Math.min(worldW - 20, x));
        y = Math.max(20, Math.min(worldH - 20, y));

        const angle = Math.atan2(plane.y - y, plane.x - x);
        const speed = 1.6 + Math.random() * 1.2;

        missiles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            angle,
            speed,
            turnRate: 0.022 + Math.random() * 0.012,
            life: 1800,
            radius: 8,
            trail: []
        });
    }

    function updateMissiles() {
        for (let i = missiles.length - 1; i >= 0; i--) {
            const m = missiles[i];

            const targetAngle = Math.atan2(plane.y - m.y, plane.x - m.x);
            let diff = targetAngle - m.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            if (diff > m.turnRate) diff = m.turnRate;
            if (diff < -m.turnRate) diff = -m.turnRate;
            m.angle += diff;

            m.vx = Math.cos(m.angle) * m.speed;
            m.vy = Math.sin(m.angle) * m.speed;

            m.x += m.vx;
            m.y += m.vy;
            m.life--;

            m.trail.push({ x: m.x, y: m.y, life: 24 });
            if (m.trail.length > 32) m.trail.shift();
            for (const t of m.trail) t.life--;

            const dx = m.x - plane.x;
            const dy = m.y - plane.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < plane.size + m.radius && invulnerableTimer <= 0) {
                hitPlane();
                missiles.splice(i, 1);
                continue;
            }

            const distFromPlaneSq = dx * dx + dy * dy;
            const maxRange = 2200;
            if (distFromPlaneSq > maxRange * maxRange) {
                explode(m.x, m.y);
                missiles.splice(i, 1);
                continue;
            }

            if (m.life <= 0) {
                explode(m.x, m.y);
                missiles.splice(i, 1);
                continue;
            }
        }

        for (let i = missiles.length - 1; i >= 0; i--) {
            const a = missiles[i];
            if (!a) continue;
            let removed = false;
            for (let j = i - 1; j >= 0; j--) {
                const b = missiles[j];
                if (!b) continue;
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < a.radius + b.radius + 4) {
                    explode(a.x, a.y);
                    explode(b.x, b.y);
                    missiles.splice(i, 1);
                    missiles.splice(j, 1);
                    score += 5;
                    updateHud();
                    removed = true;
                    break;
                }
            }
            if (removed) continue;
        }
    }

    function hitPlane() {
        lives--;
        invulnerableTimer = 120;
        explode(plane.x, plane.y);
        updateHud();
        if (lives <= 0) {
            endGame();
        }
    }

    function explode(x, y) {
        const count = 14;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
            const speed = 1.5 + Math.random() * 2.5;
            explosions.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 30,
                maxLife: 30,
                radius: 3 + Math.random() * 3
            });
        }
    }

    function updateExplosions() {
        for (let i = explosions.length - 1; i >= 0; i--) {
            const p = explosions[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.94;
            p.vy *= 0.94;
            p.life--;
            if (p.life <= 0) explosions.splice(i, 1);
        }
    }

    function updatePlane() {
        let jx = 0, jy = 0;

        if (joy.active) {
            const dx = joy.curX - joy.baseX;
            const dy = joy.curY - joy.baseY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const maxDist = joy.radius;
            if (dist > 0.001) {
                const clamped = Math.min(dist, maxDist);
                jx = (dx / dist) * (clamped / maxDist);
                jy = (dy / dist) * (clamped / maxDist);
            }
        }

        if (keys.left) jx = -1;
        if (keys.right) jx = 1;
        if (keys.up) jy = -1;
        if (keys.down) jy = 1;

        const mag = Math.sqrt(jx * jx + jy * jy);
        if (mag > 0.05) {
            const targetAngle = Math.atan2(jy, jx);
            let diff = targetAngle - plane.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            const turnSpeed = plane.turnRate * (0.6 + mag * 0.8);
            if (diff > turnSpeed) diff = turnSpeed;
            if (diff < -turnSpeed) diff = -turnSpeed;
            plane.angle += diff;

            const targetSpeed = plane.maxSpeed * mag;
            plane.speed += (targetSpeed - plane.speed) * 0.06;
        } else {
            plane.speed += (plane.speed * 0.7 - plane.speed) * 0.05;
            if (plane.speed < 1.6) plane.speed = 1.6;
        }

        plane.vx = Math.cos(plane.angle) * plane.speed;
        plane.vy = Math.sin(plane.angle) * plane.speed;

        plane.x += plane.vx;
        plane.y += plane.vy;

        const pad = 60;
        if (plane.x < pad) plane.x = pad;
        if (plane.x > worldW - pad) plane.x = worldW - pad;
        if (plane.y < pad) plane.y = pad;
        if (plane.y > worldH - pad) plane.y = worldH - pad;

        trail.push({ x: plane.x, y: plane.y, life: 26, maxLife: 26 });
        if (trail.length > 40) trail.shift();
        for (const t of trail) t.life--;

        if (invulnerableTimer > 0) invulnerableTimer--;
    }

    function updateCamera() {
        const targetX = plane.x - W / 2;
        const targetY = plane.y - H / 2;
        camera.x += (targetX - camera.x) * camera.smooth;
        camera.y += (targetY - camera.y) * camera.smooth;
    }

    function update() {
        if (!gameStarted || gameOver) return;

        elapsed = (performance.now() - startTime) / 1000;
        updatePlane();
        updateCamera();
        updateMissiles();
        updateExplosions();

        missileSpawnTimer++;
        const interval = Math.max(28, missileSpawnInterval - Math.floor(elapsed * 1.2));
        if (missileSpawnTimer >= interval) {
            missileSpawnTimer = 0;
            spawnMissile();
            if (elapsed > 12 && Math.random() < 0.35) spawnMissile();
            if (elapsed > 25 && Math.random() < 0.35) spawnMissile();
        }

        if (Math.floor(elapsed * 10) > score) {
            score = Math.floor(elapsed * 10);
            updateHud();
        }
    }

    // ============================================
    // ОТРИСОВКА
    // ============================================

    function draw() {
        if (!ctx) return;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);

        const gridSize = 80;
        const offsetX = -camera.x % gridSize;
        const offsetY = -camera.y % gridSize;

        ctx.strokeStyle = 'rgba(200,200,200,0.35)';
        ctx.lineWidth = 1;
        for (let x = offsetX; x < W; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let y = offsetY; y < H; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }

        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        ctx.strokeStyle = 'rgba(204,0,0,0.25)';
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, worldW, worldH);

        for (const t of trail) {
            const a = t.life / t.maxLife;
            if (a <= 0) continue;
            ctx.fillStyle = 'rgba(204,0,0,' + (a * 0.35) + ')';
            ctx.beginPath();
            ctx.arc(t.x, t.y, 3 + a * 2, 0, Math.PI * 2);
            ctx.fill();
        }

        for (const p of explosions) {
            const a = p.life / p.maxLife;
            ctx.fillStyle = 'rgba(255,' + Math.floor(120 + 100 * a) + ',0,' + a + ')';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius * a + 2, 0, Math.PI * 2);
            ctx.fill();
        }

        for (const m of missiles) {
            for (let i = 0; i < m.trail.length; i++) {
                const t = m.trail[i];
                const a = t.life / 24;
                if (a <= 0) continue;
                ctx.fillStyle = 'rgba(150,150,150,' + (a * 0.5) + ')';
                ctx.beginPath();
                ctx.arc(t.x, t.y, 2 + a * 2, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.save();
            ctx.translate(m.x, m.y);
            ctx.rotate(m.angle);
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.moveTo(m.radius + 6, 0);
            ctx.lineTo(-m.radius, -m.radius * 0.6);
            ctx.lineTo(-m.radius * 0.6, 0);
            ctx.lineTo(-m.radius, m.radius * 0.6);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#cc0000';
            ctx.beginPath();
            ctx.arc(m.radius + 4, 0, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        drawPlane(plane.x, plane.y, plane.angle, plane.size,
            invulnerableTimer > 0 && Math.floor(invulnerableTimer / 6) % 2 === 0);

        ctx.restore();

        if (joy.active) {
            ctx.save();
            ctx.strokeStyle = 'rgba(26,26,26,0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(joy.baseX, joy.baseY, joy.radius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(26,26,26,0.15)';
            ctx.beginPath();
            ctx.arc(joy.baseX, joy.baseY, joy.radius * 0.6, 0, Math.PI * 2);
            ctx.stroke();

            const dx = joy.curX - joy.baseX;
            const dy = joy.curY - joy.baseY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            let kx = joy.curX;
            let ky = joy.curY;
            if (dist > joy.radius) {
                kx = joy.baseX + (dx / dist) * joy.radius;
                ky = joy.baseY + (dy / dist) * joy.radius;
            }
            ctx.fillStyle = 'rgba(204,0,0,0.75)';
            ctx.beginPath();
            ctx.arc(kx, ky, joy.knobRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function drawPlane(x, y, angle, size, blink) {
        if (blink) return;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.beginPath();
        ctx.ellipse(2, 2, size * 1.05, size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#cc0000';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-size * 0.35, -size * 0.95);
        ctx.lineTo(size * 0.15, -size * 0.55);
        ctx.lineTo(size * 0.15, size * 0.55);
        ctx.lineTo(-size * 0.35, size * 0.95);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.moveTo(size * 0.9, 0);
        ctx.lineTo(-size * 0.3, -size * 0.4);
        ctx.lineTo(-size * 0.7, 0);
        ctx.lineTo(-size * 0.3, size * 0.4);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#cc0000';
        ctx.beginPath();
        ctx.moveTo(-size * 0.6, 0);
        ctx.lineTo(-size * 0.95, -size * 0.35);
        ctx.lineTo(-size * 0.8, 0);
        ctx.lineTo(-size * 0.95, size * 0.35);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(size * 0.15, 0, size * 0.18, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function loop() {
        animationId = requestAnimationFrame(loop);
        try {
            update();
            draw();
        } catch(e) {
            console.warn('[Missplane] loop error:', e);
        }
    }

    // ============================================
    // ВВОД
    // ============================================

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };
    }

    function onPointerDown(e) {
        if (!canvas) return;
        if (gameOver || !gameStarted) return;
        if (joy.active) return;

        const pos = getPos(e);
        joy.active = true;
        joy.id = (e.touches && e.touches[0] && e.touches[0].identifier) || 'mouse';
        joy.baseX = pos.x;
        joy.baseY = pos.y;
        joy.curX = pos.x;
        joy.curY = pos.y;

        if (e.cancelable) e.preventDefault();
    }

    function onPointerMove(e) {
        if (!joy.active) return;

        let pos = null;
        if (e.touches) {
            const t = Array.from(e.touches).find(tt => tt.identifier === joy.id);
            if (!t) return;
            const rect = canvas.getBoundingClientRect();
            pos = { x: t.clientX - rect.left, y: t.clientY - rect.top };
        } else {
            pos = getPos(e);
        }
        if (!pos) return;
        joy.curX = pos.x;
        joy.curY = pos.y;
        if (e.cancelable) e.preventDefault();
    }

    function onPointerUp(e) {
        if (!joy.active) return;
        joy.active = false;
        joy.id = null;
        joy.baseX = 0;
        joy.baseY = 0;
        joy.curX = 0;
        joy.curY = 0;
    }

    function bindInput() {
        if (inputBound) return;
        inputBound = true;

        canvas.addEventListener('mousedown', onPointerDown);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);

        canvas.addEventListener('touchstart', onPointerDown, { passive: false });
        canvas.addEventListener('touchmove', onPointerMove, { passive: false });
        canvas.addEventListener('touchend', onPointerUp, { passive: false });
        canvas.addEventListener('touchcancel', onPointerUp, { passive: false });
    }

    function unbindInput() {
        inputBound = false;

        if (canvas) {
            canvas.removeEventListener('mousedown', onPointerDown);
            canvas.removeEventListener('touchstart', onPointerDown);
            canvas.removeEventListener('touchmove', onPointerMove);
            canvas.removeEventListener('touchend', onPointerUp);
            canvas.removeEventListener('touchcancel', onPointerUp);
        }

        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('mouseup', onPointerUp);
    }

    function onKeyDown(e) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.up = true;
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = true;
    }

    function onKeyUp(e) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.up = false;
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = false;
    }

    function endGame() {
        gameOver = true;
        gameStarted = false;

        const finalScore = score;
        if (finalScore > best) {
            best = finalScore;
            setBest(best);
        }

        const fs = document.getElementById('mpFinalScore');
        if (fs) fs.textContent = finalScore;
        const bEl = document.getElementById('mpBest');
        if (bEl) bEl.textContent = Math.max(best, finalScore);

        const el = document.getElementById('mpGameOver');
        if (el) el.style.display = 'flex';
    }

    // ============================================
    // INIT / DESTROY
    // ============================================

    function init() {
        try {
            container = document.getElementById('gameCenterGameContainer');
            if (!container) {
                console.warn('[Missplane] container not found');
                return false;
            }

            const ok = buildUI();
            if (!ok) return false;

            initialized = true;
            loop();
            return true;
        } catch(e) {
            console.warn('[Missplane] init error:', e);
            return false;
        }
    }

    function destroy() {
        initialized = false;
        if (animationId) { cancelAnimationFrame(animationId); animationId = null; }

        unbindInput();

        joy.active = false;
        joy.id = null;
        joy.baseX = 0;
        joy.baseY = 0;
        joy.curX = 0;
        joy.curY = 0;

        keys.left = false;
        keys.right = false;
        keys.up = false;
        keys.down = false;

        window.removeEventListener('resize', onResize);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);

        missiles = [];
        explosions = [];
        trail = [];
        gameOver = false;
        gameStarted = false;

        if (container) container.innerHTML = '';
        container = null;
        canvas = null;
        ctx = null;
    }

    window.missplaneInit = init;
    window.Missplane = { destroy: destroy, init: init };

})();