// dviz.js — Dvizuha: стратегия на карте (ПВО vs дроны)

(function() {
    'use strict';

    let container = null;
    let canvas = null;
    let ctx = null;
    let animationId = null;
    let initialized = false;

    let W = 0, H = 0;
    let dpr = 1;

    const FONT_MAIN = "'TTPaplane', monospace";

    let map = {
        width: 2400,
        height: 1400
    };

    let playerAA = [];
    let enemyAA = [];
    let playerLaunchers = [];
    let enemyLaunchers = [];

    let pendingLauncher = null;
    let retargetLauncher = null;

    let drones = [];
    let missiles = [];
    let explosions = [];

    let playerCapital = { x: 200, y: 700, hp: 100, maxHp: 100 };
    let enemyCapital = { x: 2200, y: 700, hp: 100, maxHp: 100 };

    let playerMoney = 100;
    let enemyMoney = 100;

    let buildMode = null;
    let awaitingTargetPoint = false;

    let gameOver = false;
    let winner = null;
    let gameStarted = false;
    let startTime = 0;
    let elapsed = 0;

    let lastEnemyAction = 0;
    let enemyActionInterval = 3.5;
    let lastPlayerIncome = 0;
    let incomeInterval = 2.0;

    let mousePos = { x: 0, y: 0 };
    let camera = { x: 0, y: 0, zoom: 0.55, minZoom: 0.2, maxZoom: 2.0 };

    // Панорамирование одним пальцем/мышью
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let cameraStart = { x: 0, y: 0 };
    let panMoved = false;

    // Pinch-zoom
    let isPinching = false;
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let pinchCenterWorld = { x: 0, y: 0 };

    const AA_COST = 60;
    const LAUNCHER_COST = 90;
    const AA_RANGE = 340;
    const AA_COOLDOWN = 55;
    const DRONE_SPEED = 0.9;
    const MISSILE_SPEED = 5.5;
    const MIN_DIST_BETWEEN_BUILDINGS = 46;

    // ============================================
    // UI
    // ============================================

    function buildUI() {
        if (!container) return false;
        container.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.id = 'dvizWrap';
        wrap.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: #e8e0d0;
            overflow: hidden;
            font-family: ${FONT_MAIN};
            touch-action: none;
            user-select: none;
            -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
        `;

        canvas = document.createElement('canvas');
        canvas.id = 'dvizCanvas';
        canvas.style.cssText = `
            display: block;
            width: 100%;
            height: 100%;
            background: #e8e0d0;
            touch-action: none;
        `;

        const hud = document.createElement('div');
        hud.id = 'dvizHud';
        hud.style.cssText = `
            position: absolute;
            top: 12px; left: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            z-index: 10;
            font-family: ${FONT_MAIN};
            pointer-events: none;
        `;
        hud.innerHTML = `
            <div style="background:rgba(255,255,255,0.9);padding:8px 14px;display:flex;flex-direction:column;">
                <div style="font-size:10px;opacity:0.55;letter-spacing:1px;">ВАШИ СРЕДСТВА</div>
                <div id="dvizMoney" style="font-size:22px;font-weight:700;line-height:1;">100</div>
            </div>
            <div style="background:rgba(255,255,255,0.9);padding:8px 14px;display:flex;flex-direction:column;">
                <div style="font-size:10px;opacity:0.55;letter-spacing:1px;">ВАША СТОЛИЦА</div>
                <div id="dvizCapHp" style="font-size:18px;font-weight:700;line-height:1;">100</div>
            </div>
            <div style="background:rgba(255,255,255,0.9);padding:8px 14px;display:flex;flex-direction:column;">
                <div style="font-size:10px;opacity:0.55;letter-spacing:1px;">СТОЛИЦА ВРАГА</div>
                <div id="dvizEnemyCapHp" style="font-size:18px;font-weight:700;line-height:1;">100</div>
            </div>
        `;

        const controls = document.createElement('div');
        controls.id = 'dvizControls';
        controls.style.cssText = `
            position: absolute;
            bottom: 16px; left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 10px;
            z-index: 10;
            font-family: ${FONT_MAIN};
            padding: 8px;
            background: rgba(255,255,255,0.9);
            flex-wrap: wrap;
            justify-content: center;
            max-width: calc(100% - 24px);
            box-sizing: border-box;
        `;
        controls.innerHTML = `
            <button class="dviz-btn" data-mode="aa" style="padding:10px 18px;border:none;background:#4CAF50;color:#fff;cursor:pointer;font-family:${FONT_MAIN};font-size:13px;font-weight:700;letter-spacing:0.5px;">ПВО (${AA_COST})</button>
            <button class="dviz-btn" data-mode="launcher" style="padding:10px 18px;border:none;background:#cc0000;color:#fff;cursor:pointer;font-family:${FONT_MAIN};font-size:13px;font-weight:700;letter-spacing:0.5px;">ПУСКОВАЯ (${LAUNCHER_COST})</button>
            <button class="dviz-btn" data-mode="none" style="padding:10px 18px;border:none;background:#333;color:#fff;cursor:pointer;font-family:${FONT_MAIN};font-size:13px;font-weight:700;letter-spacing:0.5px;">ОТМЕНА</button>
        `;

        const hintBar = document.createElement('div');
        hintBar.id = 'dvizHintBar';
        hintBar.style.cssText = `
            position: absolute;
            bottom: 78px; left: 50%;
            transform: translateX(-50%);
            z-index: 11;
            font-family: ${FONT_MAIN};
            font-size: 12px;
            color: #1a1a1a;
            background: rgba(255,255,255,0.85);
            padding: 6px 14px;
            display: none;
            pointer-events: none;
            letter-spacing: 0.4px;
            white-space: nowrap;
            max-width: calc(100% - 24px);
            box-sizing: border-box;
            text-align: center;
        `;

        const launcherMenu = document.createElement('div');
        launcherMenu.id = 'dvizLauncherMenu';
        launcherMenu.style.cssText = `
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255,255,255,0.96);
            padding: 22px 26px;
            display: none;
            flex-direction: column;
            gap: 10px;
            z-index: 30;
            font-family: ${FONT_MAIN};
            min-width: 300px;
            max-width: calc(100% - 40px);
            box-sizing: border-box;
            box-shadow: 0 12px 40px rgba(0,0,0,0.25);
        `;
        launcherMenu.innerHTML = `
            <div style="font-size:16px;font-weight:700;margin-bottom:6px;letter-spacing:0.4px;">ПУСКОВАЯ ПЛОЩАДКА</div>
            <div id="dvizCurrentTarget" style="font-size:12px;opacity:0.65;margin-bottom:10px;">Цель не назначена</div>
            <button class="dviz-launcher-btn" data-action="retarget" style="padding:12px 18px;border:none;background:#cc0000;color:#fff;cursor:pointer;font-family:${FONT_MAIN};font-size:13px;font-weight:700;text-align:left;">НАЗНАЧИТЬ НОВУЮ ЦЕЛЬ</button>
            <button class="dviz-launcher-btn" data-action="sell" style="padding:12px 18px;border:none;background:#555;color:#fff;cursor:pointer;font-family:${FONT_MAIN};font-size:13px;font-weight:700;text-align:left;">СНЕСТИ (+${Math.floor(LAUNCHER_COST/2)})</button>
            <button class="dviz-launcher-btn" data-action="cancel" style="padding:10px 18px;border:none;background:#ddd;color:#333;cursor:pointer;font-family:${FONT_MAIN};font-size:12px;font-weight:700;text-align:left;margin-top:4px;">ОТМЕНА</button>
        `;

        const startScreen = document.createElement('div');
        startScreen.id = 'dvizStart';
        startScreen.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: #e8e0d0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 25;
            color: #1a1a1a;
            font-family: ${FONT_MAIN};
            padding: 20px;
            box-sizing: border-box;
            text-align: center;
        `;
        startScreen.innerHTML = `
            <div style="font-size:40px;font-weight:700;letter-spacing:2px;">DVIZUHA</div>
            <div style="font-size:14px;margin-top:14px;opacity:0.65;text-align:center;max-width:480px;line-height:1.7;">
                Между двумя государствами идёт война.<br><br>
                Ставьте ПВО и пусковые площадки в любом месте своей территории.<br>
                После постройки пусковой тапните по карте — туда полетят дроны.<br><br>
                Перемещайте карту одним пальцем, приближайте двумя.
            </div>
            <button id="dvizStartBtn" style="
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
            ">НАЧАТЬ ВОЙНУ</button>
        `;

        const gameOverScreen = document.createElement('div');
        gameOverScreen.id = 'dvizGameOver';
        gameOverScreen.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(255,255,255,0.94);
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
            <div id="dvizWinnerText" style="font-size:44px;font-weight:700;letter-spacing:2px;">ПОБЕДА</div>
            <div id="dvizWinnerSub" style="font-size:16px;margin-top:14px;opacity:0.7;">Столица врага уничтожена</div>
            <button id="dvizRestart" style="
                margin-top: 30px;
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

        wrap.appendChild(canvas);
        wrap.appendChild(hud);
        wrap.appendChild(controls);
        wrap.appendChild(hintBar);
        wrap.appendChild(launcherMenu);
        wrap.appendChild(startScreen);
        wrap.appendChild(gameOverScreen);
        container.appendChild(wrap);

        ctx = canvas.getContext('2d');
        if (!ctx) return false;

        // Кнопки управления
        controls.querySelectorAll('.dviz-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const mode = this.dataset.mode;
                if (mode === 'none') buildMode = null;
                else buildMode = mode;
                awaitingTargetPoint = false;
                pendingLauncher = null;
                retargetLauncher = null;
                updateControlsUI();
                updateHint(null);
            });
            // Чтобы кнопки не запускали тап по карте
            btn.addEventListener('touchstart', function(e) {
                e.stopPropagation();
            }, { passive: true });
        });

        launcherMenu.querySelectorAll('.dviz-launcher-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const action = this.dataset.action;
                if (action === 'cancel') {
                    hideLauncherMenu();
                    return;
                }
                if (action === 'retarget') {
                    const l = launcherMenu._launcher;
                    hideLauncherMenu();
                    if (l) {
                        retargetLauncher = l;
                        awaitingTargetPoint = true;
                        buildMode = null;
                        updateControlsUI();
                        updateHint('ТАПНИТЕ НОВУЮ ТОЧКУ ДЛЯ ЭТОЙ ПУСКОВОЙ');
                    }
                    return;
                }
                if (action === 'sell') {
                    const l = launcherMenu._launcher;
                    hideLauncherMenu();
                    if (l) sellLauncher(l);
                    return;
                }
            });
            btn.addEventListener('touchstart', function(e) {
                e.stopPropagation();
            }, { passive: true });
        });

        document.getElementById('dvizStartBtn').addEventListener('click', startGame);
        document.getElementById('dvizRestart').addEventListener('click', restartGame);

        // Единый обработчик указателя — и для мыши, и для касаний
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);

        // Fallback для браузеров без Pointer Events (старые)
        if (!window.PointerEvent) {
            canvas.addEventListener('mousedown', onPointerDown);
            window.addEventListener('mousemove', onPointerMove);
            window.addEventListener('mouseup', onPointerUp);

            canvas.addEventListener('touchstart', onTouchStartFallback, { passive: false });
            canvas.addEventListener('touchmove', onTouchMoveFallback, { passive: false });
            canvas.addEventListener('touchend', onTouchEndFallback, { passive: false });
            canvas.addEventListener('touchcancel', onTouchEndFallback, { passive: false });
        }

        // Колесо мыши для зума на десктопе
        canvas.addEventListener('wheel', onWheel, { passive: false });

        window.addEventListener('resize', onResize);

        resizeCanvas();
        return true;
    }

    // ============================================
    // POINTER EVENTS
    // ============================================

    let activePointers = new Map();

    function onPointerDown(e) {
        if (!gameStarted || gameOver) return;
        if (e.target !== canvas) return;

        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size === 1) {
            // Начинаем панорамирование
            const pos = getCanvasPos(e);
            isPanning = true;
            panMoved = false;
            panStart = { x: pos.x, y: pos.y };
            cameraStart = { x: camera.x, y: camera.y };
        } else if (activePointers.size === 2) {
            // Начинаем pinch-zoom
            isPanning = false;
            isPinching = true;
            const pts = Array.from(activePointers.values());
            const dx = pts[0].x - pts[1].x;
            const dy = pts[0].y - pts[1].y;
            pinchStartDist = Math.sqrt(dx * dx + dy * dy);
            pinchStartZoom = camera.zoom;

            // Центр между пальцами в мировых координатах
            const rect = canvas.getBoundingClientRect();
            const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
            const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
            pinchCenterWorld = screenToWorld(midX, midY);
        }

        if (e.cancelable) e.preventDefault();
    }

    function onPointerMove(e) {
        if (!gameStarted) return;
        if (!activePointers.has(e.pointerId)) return;

        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pos = getCanvasPos(e);
        mousePos = pos;

        if (activePointers.size === 2 && isPinching) {
            // Pinch-zoom
            const pts = Array.from(activePointers.values());
            const dx = pts[0].x - pts[1].x;
            const dy = pts[0].y - pts[1].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (pinchStartDist > 0) {
                const ratio = dist / pinchStartDist;
                const newZoom = Math.max(camera.minZoom, Math.min(camera.maxZoom, pinchStartZoom * ratio));

                // Зум относительно центра между пальцами
                const rect = canvas.getBoundingClientRect();
                const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
                const midY = (pts[0].y + pts[1].y) / 2 - rect.top;

                camera.zoom = newZoom;

                // Сдвигаем камеру так, чтобы точка под центром не сместилась
                const wx = (midX - W / 2) / camera.zoom + camera.x;
                const wy = (midY - H / 2) / camera.zoom + camera.y;
                camera.x += pinchCenterWorld.x - wx;
                camera.y += pinchCenterWorld.y - wy;
            }
            if (e.cancelable) e.preventDefault();
            return;
        }

        if (isPanning && activePointers.size === 1) {
            const dx = pos.x - panStart.x;
            const dy = pos.y - panStart.y;
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                panMoved = true;
                camera.x = cameraStart.x - dx / camera.zoom;
                camera.y = cameraStart.y - dy / camera.zoom;
            }
            if (e.cancelable) e.preventDefault();
        }
    }

    function onPointerUp(e) {
        if (!activePointers.has(e.pointerId)) return;
        activePointers.delete(e.pointerId);

        if (activePointers.size === 0) {
            if (isPanning) {
                isPanning = false;
                const pos = getCanvasPos(e);
                const dx = pos.x - panStart.x;
                const dy = pos.y - panStart.y;
                if (!panMoved && Math.abs(dx) < 6 && Math.abs(dy) < 6) {
                    handleClick(pos.x, pos.y);
                }
            }
            isPinching = false;
        } else if (activePointers.size === 1 && isPinching) {
            // Один палец остался — перезапускаем панорамирование
            isPinching = false;
            const pos = getCanvasPos(e);
            isPanning = true;
            panMoved = false;
            panStart = { x: pos.x, y: pos.y };
            cameraStart = { x: camera.x, y: camera.y };
        }

        if (e.cancelable) e.preventDefault();
    }

    // ============================================
    // FALLBACK (Touch Events)
    // ============================================

    let touchPanning = false;
    let touchPinching = false;
    let touchPanStart = { x: 0, y: 0 };
    let touchCamStart = { x: 0, y: 0 };
    let touchPanMoved = false;
    let touchPinchStartDist = 0;
    let touchPinchStartZoom = 1;
    let touchPinchCenterWorld = { x: 0, y: 0 };

    function onTouchStartFallback(e) {
        if (!gameStarted || gameOver) return;
        if (e.target !== canvas) return;

        if (e.touches.length === 1) {
            const t = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            touchPanning = true;
            touchPanMoved = false;
            touchPanStart = { x: t.clientX - rect.left, y: t.clientY - rect.top };
            touchCamStart = { x: camera.x, y: camera.y };
        } else if (e.touches.length === 2) {
            touchPanning = false;
            touchPinching = true;
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dx = t1.clientX - t2.clientX;
            const dy = t1.clientY - t2.clientY;
            touchPinchStartDist = Math.sqrt(dx * dx + dy * dy);
            touchPinchStartZoom = camera.zoom;

            const rect = canvas.getBoundingClientRect();
            const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
            const midY = (t1.clientY + t2.clientY) / 2 - rect.top;
            touchPinchCenterWorld = screenToWorld(midX, midY);
        }
        if (e.cancelable) e.preventDefault();
    }

    function onTouchMoveFallback(e) {
        if (!gameStarted) return;

        if (e.touches.length === 2 && touchPinching) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dx = t1.clientX - t2.clientX;
            const dy = t1.clientY - t2.clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (touchPinchStartDist > 0) {
                const ratio = dist / touchPinchStartDist;
                const newZoom = Math.max(camera.minZoom, Math.min(camera.maxZoom, touchPinchStartZoom * ratio));
                const rect = canvas.getBoundingClientRect();
                const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
                const midY = (t1.clientY + t2.clientY) / 2 - rect.top;

                camera.zoom = newZoom;
                const wx = (midX - W / 2) / camera.zoom + camera.x;
                const wy = (midY - H / 2) / camera.zoom + camera.y;
                camera.x += touchPinchCenterWorld.x - wx;
                camera.y += touchPinchCenterWorld.y - wy;
            }
            if (e.cancelable) e.preventDefault();
            return;
        }

        if (e.touches.length === 1 && touchPanning) {
            const t = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const pos = { x: t.clientX - rect.left, y: t.clientY - rect.top };
            const dx = pos.x - touchPanStart.x;
            const dy = pos.y - touchPanStart.y;
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                touchPanMoved = true;
                camera.x = touchCamStart.x - dx / camera.zoom;
                camera.y = touchCamStart.y - dy / camera.zoom;
            }
            if (e.cancelable) e.preventDefault();
        }
    }

    function onTouchEndFallback(e) {
        if (touchPanning && e.changedTouches.length > 0) {
            const t = e.changedTouches[0];
            const rect = canvas.getBoundingClientRect();
            const pos = { x: t.clientX - rect.left, y: t.clientY - rect.top };
            const dx = pos.x - touchPanStart.x;
            const dy = pos.y - touchPanStart.y;
            if (!touchPanMoved && Math.abs(dx) < 6 && Math.abs(dy) < 6) {
                handleClick(pos.x, pos.y);
            }
            touchPanning = false;
        }
        if (e.touches.length === 0) touchPinching = false;
    }

    // ============================================
    // ОБЩЕЕ
    // ============================================

    function screenToWorld(sx, sy) {
        const cx = W / 2;
        const cy = H / 2;
        return {
            x: (sx - cx) / camera.zoom + camera.x,
            y: (sy - cy) / camera.zoom + camera.y
        };
    }

    function getCanvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };
    }

    function updateControlsUI() {
        const controls = document.getElementById('dvizControls');
        if (!controls) return;
        controls.querySelectorAll('.dviz-btn').forEach(btn => {
            const mode = btn.dataset.mode;
            if (mode === 'none') {
                btn.style.outline = (buildMode === null && !awaitingTargetPoint) ? '3px solid #1a1a1a' : 'none';
            } else {
                btn.style.outline = buildMode === mode ? '3px solid #1a1a1a' : 'none';
            }
        });
    }

    function updateHint(text) {
        const hb = document.getElementById('dvizHintBar');
        if (!hb) return;
        if (text) {
            hb.textContent = text;
            hb.style.display = 'block';
        } else {
            hb.style.display = 'none';
        }
    }

    function showLauncherMenu(l) {
        const m = document.getElementById('dvizLauncherMenu');
        if (!m) return;
        const info = document.getElementById('dvizCurrentTarget');
        if (info) {
            if (l.targetPoint) {
                info.textContent = 'Цель: точка (' + Math.round(l.targetPoint.x) + ', ' + Math.round(l.targetPoint.y) + ')';
            } else {
                info.textContent = 'Цель не назначена (бьёт по столице)';
            }
        }
        m._launcher = l;
        m.style.display = 'flex';
    }

    function hideLauncherMenu() {
        const m = document.getElementById('dvizLauncherMenu');
        if (m) {
            m.style.display = 'none';
            m._launcher = null;
        }
    }

    function resizeCanvas() {
        if (!canvas || !container) return;
        const wrap = document.getElementById('dvizWrap');
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

        if (!camera.x && !camera.y) {
            centerCamera();
        }
    }

    function centerCamera() {
        camera.x = map.width / 2;
        camera.y = map.height / 2;
        camera.zoom = Math.min(W / map.width, H / map.height) * 0.95;
    }

    function onResize() {
        resizeCanvas();
    }

    function onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        camera.zoom = Math.min(Math.max(camera.zoom + delta, camera.minZoom), camera.maxZoom);
    }

    // ============================================
    // ИГРА
    // ============================================

    function startGame() {
        const s = document.getElementById('dvizStart');
        if (s) s.style.display = 'none';
        restartGame();
    }

    function restartGame() {
        playerAA = [];
        enemyAA = [];
        playerLaunchers = [];
        enemyLaunchers = [];
        drones = [];
        missiles = [];
        explosions = [];
        pendingLauncher = null;
        retargetLauncher = null;
        awaitingTargetPoint = false;

        playerCapital = { x: 200, y: 700, hp: 100, maxHp: 100 };
        enemyCapital = { x: 2200, y: 700, hp: 100, maxHp: 100 };

        playerMoney = 100;
        enemyMoney = 100;

        buildMode = null;
        updateControlsUI();
        updateHint(null);

        gameOver = false;
        winner = null;
        gameStarted = true;
        startTime = performance.now();
        elapsed = 0;

        lastEnemyAction = 0;
        lastPlayerIncome = 0;
        enemyActionInterval = 3.5;

        activePointers.clear();
        isPanning = false;
        isPinching = false;

        centerCamera();
        updateHud();

        hideLauncherMenu();

        document.getElementById('dvizGameOver').style.display = 'none';
    }

    function updateHud() {
        const m = document.getElementById('dvizMoney');
        if (m) m.textContent = Math.floor(playerMoney);
        const h = document.getElementById('dvizCapHp');
        if (h) h.textContent = Math.max(0, Math.floor(playerCapital.hp));
        const eh = document.getElementById('dvizEnemyCapHp');
        if (eh) eh.textContent = Math.max(0, Math.floor(enemyCapital.hp));
    }

    // ============================================
    // ПОСТРОЙКИ
    // ============================================

    function isOnPlayerTerritory(x, y) {
        return x > 40 && x < map.width / 2 - 40 && y > 40 && y < map.height - 40;
    }

    function isOnEnemyTerritory(x, y) {
        return x > map.width / 2 + 40 && x < map.width - 40 && y > 40 && y < map.height - 40;
    }

    function tooCloseToExisting(x, y, list, exclude) {
        for (const item of list) {
            if (item === exclude) continue;
            const dx = item.x - x;
            const dy = item.y - y;
            if (Math.sqrt(dx * dx + dy * dy) < MIN_DIST_BETWEEN_BUILDINGS) return true;
        }
        return false;
    }

    function canBuildAA(x, y) {
        if (!isOnPlayerTerritory(x, y)) return false;
        if (tooCloseToExisting(x, y, playerAA)) return false;
        if (tooCloseToExisting(x, y, playerLaunchers)) return false;
        const dxc = x - playerCapital.x;
        const dyc = y - playerCapital.y;
        if (Math.sqrt(dxc * dxc + dyc * dyc) < 60) return false;
        return true;
    }

    function canBuildLauncher(x, y) {
        if (!isOnPlayerTerritory(x, y)) return false;
        if (tooCloseToExisting(x, y, playerAA)) return false;
        if (tooCloseToExisting(x, y, playerLaunchers)) return false;
        const dxc = x - playerCapital.x;
        const dyc = y - playerCapital.y;
        if (Math.sqrt(dxc * dxc + dyc * dyc) < 60) return false;
        return true;
    }

    function buildPlayerAA(x, y) {
        if (playerMoney < AA_COST) return false;
        if (!canBuildAA(x, y)) return false;
        playerMoney -= AA_COST;
        playerAA.push({
            x, y,
            cooldown: 0,
            hp: 3,
            maxHp: 3
        });
        updateHud();
        return true;
    }

    function buildPlayerLauncher(x, y, targetPoint) {
        if (playerMoney < LAUNCHER_COST) return false;
        if (!canBuildLauncher(x, y)) return false;
        playerMoney -= LAUNCHER_COST;
        const l = {
            x, y,
            cooldown: 120,
            hp: 4,
            maxHp: 4,
            targetPoint: targetPoint ? { x: targetPoint.x, y: targetPoint.y } : null
        };
        playerLaunchers.push(l);
        updateHud();
        return l;
    }

    function sellLauncher(l) {
        const idx = playerLaunchers.indexOf(l);
        if (idx === -1) return;
        playerLaunchers.splice(idx, 1);
        playerMoney += Math.floor(LAUNCHER_COST / 2);
        updateHud();
    }

    function buildEnemyAA(x, y) {
        if (enemyMoney < AA_COST) return false;
        if (!isOnEnemyTerritory(x, y)) return false;
        if (tooCloseToExisting(x, y, enemyAA)) return false;
        if (tooCloseToExisting(x, y, enemyLaunchers)) return false;
        const dxc = x - enemyCapital.x;
        const dyc = y - enemyCapital.y;
        if (Math.sqrt(dxc * dxc + dyc * dyc) < 60) return false;
        enemyMoney -= AA_COST;
        enemyAA.push({
            x, y,
            cooldown: 0,
            hp: 3,
            maxHp: 3
        });
        return true;
    }

    function buildEnemyLauncher(x, y, targetPoint) {
        if (enemyMoney < LAUNCHER_COST) return false;
        if (!isOnEnemyTerritory(x, y)) return false;
        if (tooCloseToExisting(x, y, enemyAA)) return false;
        if (tooCloseToExisting(x, y, enemyLaunchers)) return false;
        const dxc = x - enemyCapital.x;
        const dyc = y - enemyCapital.y;
        if (Math.sqrt(dxc * dxc + dyc * dyc) < 60) return false;
        enemyMoney -= LAUNCHER_COST;
        enemyLaunchers.push({
            x, y,
            cooldown: 120,
            hp: 4,
            maxHp: 4,
            targetPoint: targetPoint ? { x: targetPoint.x, y: targetPoint.y } : { x: playerCapital.x, y: playerCapital.y }
        });
        return true;
    }

    // ============================================
    // ЛОГИКА
    // ============================================

    function update() {
        if (!gameStarted || gameOver) return;

        elapsed += 1 / 60;

        if (elapsed - lastPlayerIncome >= incomeInterval) {
            lastPlayerIncome = elapsed;
            playerMoney += 8;
            enemyMoney += 8;
            updateHud();
        }

        if (elapsed - lastEnemyAction >= enemyActionInterval) {
            lastEnemyAction = elapsed;
            enemyAI();
            enemyActionInterval = Math.max(1.8, 3.5 - elapsed * 0.02);
        }

        updateLaunchers();
        updateDrones();
        updateMissiles();
        updateExplosions();

        if (enemyCapital.hp <= 0 && !gameOver) endGame('player');
        if (playerCapital.hp <= 0 && !gameOver) endGame('enemy');
    }

    // ============================================
    // ИИ
    // ============================================

    function countAAWithin(x, y, radius, list) {
        let count = 0;
        const r2 = radius * radius;
        for (const aa of list) {
            const dx = aa.x - x;
            const dy = aa.y - y;
            if (dx * dx + dy * dy < r2) count++;
        }
        return count;
    }

    function findFreeSpot(minX, maxX, minY, maxY, list1, list2, triesMax) {
        for (let t = 0; t < triesMax; t++) {
            const x = minX + Math.random() * (maxX - minX);
            const y = minY + Math.random() * (maxY - minY);
            if (!tooCloseToExisting(x, y, list1) && !tooCloseToExisting(x, y, list2)) {
                return { x, y };
            }
        }
        return null;
    }

    function enemyAI() {
        const aaNearCapital = countAAWithin(enemyCapital.x, enemyCapital.y, 420, enemyAA);
        if (aaNearCapital < 2 && enemyMoney >= AA_COST) {
            const spot = findFreeSpot(
                enemyCapital.x + 80, enemyCapital.x + 360,
                200, map.height - 200,
                enemyAA, enemyLaunchers, 12
            );
            if (spot && buildEnemyAA(spot.x, spot.y)) return;
        }

        if (playerLaunchers.length >= 2 && enemyMoney >= LAUNCHER_COST + 30) {
            let targetLauncher = null;
            let maxX = -Infinity;
            for (const pl of playerLaunchers) {
                if (pl.x > maxX) {
                    maxX = pl.x;
                    targetLauncher = pl;
                }
            }
            if (targetLauncher) {
                const spot = findFreeSpot(
                    map.width / 2 + 100, map.width / 2 + 400,
                    200, map.height - 200,
                    enemyAA, enemyLaunchers, 10
                );
                if (spot) {
                    const jitter = 25;
                    const target = {
                        x: targetLauncher.x + (Math.random() - 0.5) * jitter,
                        y: targetLauncher.y + (Math.random() - 0.5) * jitter
                    };
                    if (buildEnemyLauncher(spot.x, spot.y, target)) return;
                }
            }
        }

        const midX = map.width * 0.75;
        const aaNearFront = countAAWithin(midX, map.height / 2, 500, enemyAA);
        if (aaNearFront < 2 && enemyMoney >= AA_COST + 20) {
            const spot = findFreeSpot(
                map.width / 2 + 120, map.width / 2 + 340,
                200, map.height - 200,
                enemyAA, enemyLaunchers, 10
            );
            if (spot && buildEnemyAA(spot.x, spot.y)) return;
        }

        const reserve = 60;
        if (enemyMoney >= LAUNCHER_COST + reserve && enemyLaunchers.length < 8) {
            const spot = findFreeSpot(
                map.width / 2 + 100, map.width / 2 + 400,
                200, map.height - 200,
                enemyAA, enemyLaunchers, 10
            );
            if (spot) {
                const jitter = 40;
                const target = {
                    x: playerCapital.x + (Math.random() - 0.5) * jitter,
                    y: playerCapital.y + (Math.random() - 0.5) * jitter
                };
                if (buildEnemyLauncher(spot.x, spot.y, target)) return;
            }
        }

        if (enemyMoney >= AA_COST * 2 && enemyAA.length < 12) {
            const spot = findFreeSpot(
                map.width / 2 + 80, map.width - 200,
                100, map.height - 100,
                enemyAA, enemyLaunchers, 8
            );
            if (spot && buildEnemyAA(spot.x, spot.y)) return;
        }
    }

    function launchDrone(fromX, fromY, targetPoint, isPlayer) {
        const angle = Math.atan2(targetPoint.y - fromY, targetPoint.x - fromX);
        drones.push({
            x: fromX,
            y: fromY,
            vx: Math.cos(angle) * DRONE_SPEED,
            vy: Math.sin(angle) * DRONE_SPEED,
            angle,
            targetPoint: { x: targetPoint.x, y: targetPoint.y },
            isPlayer,
            hp: 2,
            radius: 8,
            trail: []
        });
    }

    function updateLaunchers() {
        for (const l of playerLaunchers) {
            l.cooldown--;
            if (l.cooldown <= 0) {
                l.cooldown = 180;
                const tp = l.targetPoint || { x: enemyCapital.x, y: enemyCapital.y };
                launchDrone(l.x, l.y, tp, true);
            }
        }

        for (const l of enemyLaunchers) {
            l.cooldown--;
            if (l.cooldown <= 0) {
                l.cooldown = 180;
                const tp = l.targetPoint || { x: playerCapital.x, y: playerCapital.y };
                launchDrone(l.x, l.y, tp, false);
            }
        }
    }

    function updateDrones() {
        for (let i = drones.length - 1; i >= 0; i--) {
            const d = drones[i];
            const dx = d.targetPoint.x - d.x;
            const dy = d.targetPoint.y - d.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 1) {
                applyDamageAtPoint(d.targetPoint.x, d.targetPoint.y, d.isPlayer);
                explode(d.x, d.y);
                drones.splice(i, 1);
                continue;
            }

            const nx = dx / dist;
            const ny = dy / dist;
            d.vx = nx * DRONE_SPEED;
            d.vy = ny * DRONE_SPEED;
            d.x += d.vx;
            d.y += d.vy;
            d.angle = Math.atan2(d.vy, d.vx);

            d.trail.push({ x: d.x, y: d.y, life: 20 });
            if (d.trail.length > 24) d.trail.shift();
            for (const t of d.trail) t.life--;

            if (d.isPlayer) {
                for (const aa of enemyAA) {
                    const dx2 = d.x - aa.x;
                    const dy2 = d.y - aa.y;
                    const dst = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                    if (dst < AA_RANGE && aa.cooldown <= 0) {
                        aa.cooldown = AA_COOLDOWN;
                        spawnMissile(aa.x, aa.y, d);
                        break;
                    }
                }
            } else {
                for (const aa of playerAA) {
                    const dx2 = d.x - aa.x;
                    const dy2 = d.y - aa.y;
                    const dst = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                    if (dst < AA_RANGE && aa.cooldown <= 0) {
                        aa.cooldown = AA_COOLDOWN;
                        spawnMissile(aa.x, aa.y, d);
                        break;
                    }
                }
            }
        }

        for (const aa of playerAA) if (aa.cooldown > 0) aa.cooldown--;
        for (const aa of enemyAA) if (aa.cooldown > 0) aa.cooldown--;
    }

    function applyDamageAtPoint(x, y, isPlayer) {
        const RADIUS = 55;
        let damaged = false;

        if (isPlayer) {
            const dxc = x - enemyCapital.x;
            const dyc = y - enemyCapital.y;
            if (Math.sqrt(dxc * dxc + dyc * dyc) < 55) {
                enemyCapital.hp -= 12;
                if (enemyCapital.hp < 0) enemyCapital.hp = 0;
                damaged = true;
            } else {
                for (let i = enemyAA.length - 1; i >= 0; i--) {
                    const aa = enemyAA[i];
                    if (Math.sqrt((aa.x - x) ** 2 + (aa.y - y) ** 2) < RADIUS) {
                        aa.hp -= 2;
                        if (aa.hp <= 0) enemyAA.splice(i, 1);
                        damaged = true;
                        break;
                    }
                }
                if (!damaged) {
                    for (let i = enemyLaunchers.length - 1; i >= 0; i--) {
                        const el = enemyLaunchers[i];
                        if (Math.sqrt((el.x - x) ** 2 + (el.y - y) ** 2) < RADIUS) {
                            el.hp -= 2;
                            if (el.hp <= 0) enemyLaunchers.splice(i, 1);
                            damaged = true;
                            break;
                        }
                    }
                }
            }
        } else {
            const dxc = x - playerCapital.x;
            const dyc = y - playerCapital.y;
            if (Math.sqrt(dxc * dxc + dyc * dyc) < 55) {
                playerCapital.hp -= 12;
                if (playerCapital.hp < 0) playerCapital.hp = 0;
                damaged = true;
            } else {
                for (let i = playerAA.length - 1; i >= 0; i--) {
                    const aa = playerAA[i];
                    if (Math.sqrt((aa.x - x) ** 2 + (aa.y - y) ** 2) < RADIUS) {
                        aa.hp -= 2;
                        if (aa.hp <= 0) playerAA.splice(i, 1);
                        damaged = true;
                        break;
                    }
                }
                if (!damaged) {
                    for (let i = playerLaunchers.length - 1; i >= 0; i--) {
                        const pl = playerLaunchers[i];
                        if (Math.sqrt((pl.x - x) ** 2 + (pl.y - y) ** 2) < RADIUS) {
                            pl.hp -= 2;
                            if (pl.hp <= 0) playerLaunchers.splice(i, 1);
                            damaged = true;
                            break;
                        }
                    }
                }
            }
        }

        updateHud();
    }

    function spawnMissile(fromX, fromY, target) {
        const angle = Math.atan2(target.y - fromY, target.x - fromX);
        missiles.push({
            x: fromX,
            y: fromY,
            vx: Math.cos(angle) * MISSILE_SPEED,
            vy: Math.sin(angle) * MISSILE_SPEED,
            angle,
            target,
            radius: 4,
            trail: [],
            life: 100
        });
    }

    function updateMissiles() {
        for (let i = missiles.length - 1; i >= 0; i--) {
            const m = missiles[i];
            m.life--;

            if (!m.target || m.life <= 0) {
                missiles.splice(i, 1);
                continue;
            }

            const angle = Math.atan2(m.target.y - m.y, m.target.x - m.x);
            let diff = angle - m.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (diff > 0.05) diff = 0.05;
            if (diff < -0.05) diff = -0.05;
            m.angle += diff;

            m.vx = Math.cos(m.angle) * MISSILE_SPEED;
            m.vy = Math.sin(m.angle) * MISSILE_SPEED;
            m.x += m.vx;
            m.y += m.vy;

            m.trail.push({ x: m.x, y: m.y, life: 15 });
            if (m.trail.length > 16) m.trail.shift();
            for (const t of m.trail) t.life--;

            const dx = m.x - m.target.x;
            const dy = m.y - m.target.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < m.target.radius + m.radius + 4) {
                m.target.hp -= 2;
                explode(m.x, m.y);
                if (m.target.hp <= 0) {
                    const idx = drones.indexOf(m.target);
                    if (idx !== -1) drones.splice(idx, 1);
                }
                missiles.splice(i, 1);
                continue;
            }
        }
    }

    function explode(x, y) {
        const count = 10;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const speed = 1.2 + Math.random() * 2;
            explosions.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 24,
                maxLife: 24,
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

    function handleClick(sx, sy) {
        const world = screenToWorld(sx, sy);

        const lm = document.getElementById('dvizLauncherMenu');
        if (lm && lm.style.display !== 'none') return;

        if (pendingLauncher) {
            const l = buildPlayerLauncher(pendingLauncher.x, pendingLauncher.y, world);
            pendingLauncher = null;
            awaitingTargetPoint = false;
            buildMode = null;
            updateControlsUI();
            updateHint(null);
            return;
        }

        if (retargetLauncher) {
            retargetLauncher.targetPoint = { x: world.x, y: world.y };
            retargetLauncher = null;
            awaitingTargetPoint = false;
            updateControlsUI();
            updateHint(null);
            return;
        }

        for (const l of playerLaunchers) {
            const dx = l.x - world.x;
            const dy = l.y - world.y;
            if (Math.sqrt(dx * dx + dy * dy) < 24) {
                showLauncherMenu(l);
                return;
            }
        }

        if (buildMode === 'aa') {
            buildPlayerAA(world.x, world.y);
        } else if (buildMode === 'launcher') {
            if (playerMoney < LAUNCHER_COST) return;
            if (!canBuildLauncher(world.x, world.y)) return;
            pendingLauncher = { x: world.x, y: world.y };
            awaitingTargetPoint = true;
            buildMode = null;
            updateControlsUI();
            updateHint('ТАПНИТЕ, КУДА ПОЛЕТЯТ ДРОНЫ С НОВОЙ ПУСКОВОЙ');
        }
    }

    // ============================================
    // ОТРИСОВКА
    // ============================================

    function draw() {
        if (!ctx) return;

        ctx.fillStyle = '#e8e0d0';
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        drawMap();
        drawBuildPreview();
        drawTargetLines();
        drawCapital(playerCapital, '#3366cc', 'СТОЛИЦА');
        drawCapital(enemyCapital, '#cc0000', 'ВРАГ');
        drawAAs();
        drawLaunchers();
        drawDrones();
        drawMissiles();
        drawExplosions();

        ctx.restore();
    }

    function drawBuildPreview() {
        if (!buildMode) return;
        if (!mousePos.x && !mousePos.y) return;
        const world = screenToWorld(mousePos.x, mousePos.y);

        let canBuild = false;
        let color = '#4CAF50';
        if (buildMode === 'aa') {
            canBuild = playerMoney >= AA_COST && canBuildAA(world.x, world.y);
        } else if (buildMode === 'launcher') {
            canBuild = playerMoney >= LAUNCHER_COST && canBuildLauncher(world.x, world.y);
            color = '#cc0000';
        }

        ctx.globalAlpha = 0.5;
        ctx.fillStyle = canBuild ? color : 'rgba(150,150,150,0.5)';
        ctx.beginPath();
        ctx.arc(world.x, world.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        if (buildMode === 'aa') {
            ctx.strokeStyle = canBuild ? 'rgba(76,175,80,0.5)' : 'rgba(150,150,150,0.4)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.arc(world.x, world.y, AA_RANGE, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    function drawTargetLines() {
        for (const l of playerLaunchers) {
            if (!l.targetPoint) continue;
            ctx.strokeStyle = 'rgba(204,0,0,0.35)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(l.x, l.y);
            ctx.lineTo(l.targetPoint.x, l.targetPoint.y);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = 'rgba(204,0,0,0.5)';
            ctx.beginPath();
            ctx.arc(l.targetPoint.x, l.targetPoint.y, 10, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(204,0,0,0.85)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(l.targetPoint.x, l.targetPoint.y, 10, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    function drawMap() {
        ctx.fillStyle = '#d8cfb8';
        ctx.fillRect(0, 0, map.width, map.height);

        ctx.fillStyle = 'rgba(51,102,204,0.12)';
        ctx.fillRect(0, 0, map.width / 2, map.height);

        ctx.fillStyle = 'rgba(204,0,0,0.12)';
        ctx.fillRect(map.width / 2, 0, map.width / 2, map.height);

        ctx.strokeStyle = 'rgba(26,26,26,0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 10]);
        ctx.beginPath();
        ctx.moveTo(map.width / 2, 0);
        ctx.lineTo(map.width / 2, map.height);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = 'rgba(26,26,26,0.5)';
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, map.width, map.height);

        ctx.strokeStyle = 'rgba(120,140,170,0.35)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(map.width / 2 - 40, 0);
        ctx.quadraticCurveTo(map.width / 2 + 60, map.height / 2, map.width / 2 - 40, map.height);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(140,120,80,0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, map.height / 2);
        ctx.lineTo(map.width, map.height / 2);
        ctx.stroke();
    }

    function drawCapital(cap, color, label) {
        const hpRatio = cap.hp / cap.maxHp;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cap.x, cap.y, 34, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(cap.x, cap.y, 14, 0, Math.PI * 2);
        ctx.fill();

        const bw = 100;
        const bh = 10;
        const bx = cap.x - bw / 2;
        const by = cap.y - 60;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = hpRatio > 0.5 ? '#4CAF50' : hpRatio > 0.25 ? '#ff9800' : '#cc0000';
        ctx.fillRect(bx, by, bw * hpRatio, bh);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);

        ctx.fillStyle = '#1a1a1a';
        ctx.font = 'bold 12px ' + FONT_MAIN;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cap.x, cap.y + 54);
    }

    function drawAAs() {
        for (const aa of playerAA) drawAA(aa, '#4CAF50');
        for (const aa of enemyAA) drawAA(aa, '#cc0000');
    }

    function drawAA(aa, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(aa.x, aa.y, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(26,26,26,0.85)';
        ctx.fillRect(aa.x - 2, aa.y - 26, 4, 22);

        const hpRatio = aa.hp / aa.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(aa.x - 20, aa.y + 24, 40, 4);
        ctx.fillStyle = hpRatio > 0.5 ? '#4CAF50' : '#cc0000';
        ctx.fillRect(aa.x - 20, aa.y + 24, 40 * hpRatio, 4);
    }

    function drawLaunchers() {
        for (const l of playerLaunchers) drawLauncher(l, true);
        for (const l of enemyLaunchers) drawLauncher(l, false);
    }

    function drawLauncher(l, isPlayer) {
        ctx.fillStyle = '#444';
        ctx.fillRect(l.x - 16, l.y - 16, 32, 32);

        ctx.fillStyle = '#cc0000';
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(l.x - 14, l.y - 12 + i * 8, 28, 5);
        }

        const hpRatio = l.hp / l.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(l.x - 20, l.y + 22, 40, 4);
        ctx.fillStyle = hpRatio > 0.5 ? '#4CAF50' : '#cc0000';
        ctx.fillRect(l.x - 20, l.y + 22, 40 * hpRatio, 4);
    }

    function drawDrones() {
        for (const d of drones) {
            for (const t of d.trail) {
                const a = t.life / 20;
                if (a <= 0) continue;
                ctx.fillStyle = 'rgba(0,0,0,' + (a * 0.25) + ')';
                ctx.beginPath();
                ctx.arc(t.x, t.y, 2 + a * 2, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.save();
            ctx.translate(d.x, d.y);
            ctx.rotate(d.angle);

            ctx.fillStyle = d.isPlayer ? '#3366cc' : '#cc0000';
            ctx.beginPath();
            ctx.moveTo(d.radius + 4, 0);
            ctx.lineTo(-d.radius, -d.radius * 0.7);
            ctx.lineTo(-d.radius * 0.5, 0);
            ctx.lineTo(-d.radius, d.radius * 0.7);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = 'rgba(26,26,26,0.7)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-d.radius - 2, -d.radius * 0.6);
            ctx.lineTo(-d.radius - 2, d.radius * 0.6);
            ctx.stroke();

            ctx.restore();

            const hpRatio = d.hp / 2;
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(d.x - 10, d.y - 16, 20, 3);
            ctx.fillStyle = hpRatio > 0.5 ? '#4CAF50' : '#cc0000';
            ctx.fillRect(d.x - 10, d.y - 16, 20 * hpRatio, 3);
        }
    }

    function drawMissiles() {
        for (const m of missiles) {
            for (const t of m.trail) {
                const a = t.life / 15;
                if (a <= 0) continue;
                ctx.fillStyle = 'rgba(200,200,200,' + (a * 0.5) + ')';
                ctx.beginPath();
                ctx.arc(t.x, t.y, 1 + a * 2, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.save();
            ctx.translate(m.x, m.y);
            ctx.rotate(m.angle);
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.moveTo(m.radius + 5, 0);
            ctx.lineTo(-m.radius, -2);
            ctx.lineTo(-m.radius, 2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    function drawExplosions() {
        for (const p of explosions) {
            const a = p.life / p.maxLife;
            ctx.fillStyle = 'rgba(255,' + Math.floor(120 + 100 * a) + ',0,' + a + ')';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius * a + 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function loop() {
        animationId = requestAnimationFrame(loop);
        try {
            update();
            draw();
        } catch(e) {
            console.warn('[Dviz] loop error:', e);
        }
    }

    function endGame(who) {
        gameOver = true;
        winner = who;

        const titleEl = document.getElementById('dvizWinnerText');
        const subEl = document.getElementById('dvizWinnerSub');

        if (who === 'player') {
            if (titleEl) {
                titleEl.textContent = 'ПОБЕДА';
                titleEl.style.color = '#4CAF50';
            }
            if (subEl) subEl.textContent = 'Столица врага уничтожена';
        } else {
            if (titleEl) {
                titleEl.textContent = 'ПОРАЖЕНИЕ';
                titleEl.style.color = '#cc0000';
            }
            if (subEl) subEl.textContent = 'Ваша столица уничтожена';
        }

        const el = document.getElementById('dvizGameOver');
        if (el) el.style.display = 'flex';
    }

    // ============================================
    // INIT / DESTROY
    // ============================================

    function init() {
        try {
            container = document.getElementById('gameCenterGameContainer');
            if (!container) {
                console.warn('[Dviz] container not found');
                return false;
            }
            const ok = buildUI();
            if (!ok) return false;
            initialized = true;
            loop();
            return true;
        } catch(e) {
            console.warn('[Dviz] init error:', e);
            return false;
        }
    }

    function destroy() {
        initialized = false;
        if (animationId) { cancelAnimationFrame(animationId); animationId = null; }

        window.removeEventListener('resize', onResize);

        if (canvas) {
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerUp);
            canvas.removeEventListener('mousedown', onPointerDown);
            canvas.removeEventListener('touchstart', onTouchStartFallback);
            canvas.removeEventListener('touchmove', onTouchMoveFallback);
            canvas.removeEventListener('touchend', onTouchEndFallback);
            canvas.removeEventListener('touchcancel', onTouchEndFallback);
            canvas.removeEventListener('wheel', onWheel);
        }
        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('mouseup', onPointerUp);

        activePointers.clear();

        if (container) container.innerHTML = '';
        container = null;
        canvas = null;
        ctx = null;
    }

    window.dvizInit = init;
    window.Dviz = { destroy: destroy, init: init };

})();