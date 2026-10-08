// tiny.js — Tiny Walls (Tower Defense)

(function() {
    'use strict';

    let canvas, ctx;
    let container = null;
    let initialized = false;
    let animationId = null;

    let camera = {
        x: 0, y: 0,
        zoom: 0.6,
        minZoom: 0.2,
        maxZoom: 1.5
    };

    let game = {
        chunks: [],
        walls: [],
        monsters: [],
        lives: 20,
        kills: 0,
        gameOver: false,
        time: 0,
        spawnTimer: 0,
        spawnInterval: 60,
        prepTime: 3600,
        prepPhase: true,
        activeChunks: 1,
        monstersPerChunk: 1,
        buyCost: 10,
        wallsBuilt: 0,
        chunksBought: 0,
        deathTime: 0,
        restartTimer: 0,
        restarting: false,
        mainBlockDestroyed: false,
    };

    let isPanning = false;
    let panStartX = 0, panStartY = 0;
    let cameraStartX = 0, cameraStartY = 0;

    let canvasW = 0, canvasH = 0;

    let uiRefs = {};
    let eventHandlers = [];

    const WORLD_SIZE = 80;
    const CELL_SIZE = 20;
    const CHUNK_SIZE = 16;
    const CHUNKS_PER_ROW = 4;
    const TOTAL_CHUNKS = 8;

    function buildUI() {
        container.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.id = 'tinyGameWrapper';
        wrapper.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: #d9d9d9;
            overflow: hidden;
            font-family: 'ST-SimpleSquare', 'Courier New', monospace;
            user-select: none;
        `;

        const uiPanel = document.createElement('div');
        uiPanel.id = 'tinyUiPanel';
        uiPanel.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%;
            padding: 6px 14px;
            background: #ffffff;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 10;
            border-bottom: 2px solid #000000;
            flex-wrap: wrap;
            gap: 4px;
            box-sizing: border-box;
            color: #000000;
        `;
        uiPanel.innerHTML = `
            <div class="tiny-ui-item" style="background:#f0f0f0;padding:2px 12px;border:1px solid #aaaaaa;color:#000;font-size:0.9rem;display:flex;align-items:center;gap:4px;white-space:nowrap;">
                <span style="color:#333;">ЖИЗНЬ</span> <span style="font-weight:bold;color:#cc0000;min-width:20px;text-align:center;" id="tinyLives">20</span>
            </div>
            <div class="tiny-ui-item" style="background:#f0f0f0;padding:2px 12px;border:1px solid #aaaaaa;color:#000;font-size:0.9rem;display:flex;align-items:center;gap:4px;white-space:nowrap;">
                <span style="color:#333;">ЧАНКИ</span> <span style="font-weight:bold;color:#cc0000;min-width:20px;text-align:center;" id="tinyChunks">1/8</span>
            </div>
            <div class="tiny-ui-item" style="background:#f0f0f0;padding:2px 12px;border:1px solid #aaaaaa;color:#000;font-size:0.9rem;display:flex;align-items:center;gap:4px;white-space:nowrap;">
                <span style="color:#333;">УБИТО</span> <span style="font-weight:bold;color:#cc0000;min-width:20px;text-align:center;" id="tinyKills">0</span>
            </div>
            <div class="tiny-ui-item" style="background:#f0f0f0;padding:2px 12px;border:1px solid #aaaaaa;color:#000;font-size:0.9rem;display:flex;align-items:center;gap:4px;white-space:nowrap;">
                <span style="color:#333;">МОНСТРЫ</span> <span style="font-weight:bold;color:#cc0000;min-width:20px;text-align:center;" id="tinyMonsters">0</span>
            </div>
            <button id="tinyBuyBtn" style="background:#0066cc;border:2px solid #000;color:#fff;font-family:inherit;font-size:0.85rem;padding:3px 14px;cursor:pointer;text-transform:uppercase;">КУПИТЬ ЧАНК (10)</button>
            <button id="tinyResetBtn" style="background:#333;border:2px solid #000;color:#fff;font-family:inherit;font-size:0.85rem;padding:3px 14px;cursor:pointer;text-transform:uppercase;">НОВАЯ ИГРА</button>
        `;

        const prepTimer = document.createElement('div');
        prepTimer.id = 'tinyPrepTimer';
        prepTimer.style.cssText = `
            position: absolute;
            bottom: 20px;
            right: 20px;
            background: #ffffff;
            border: 2px solid #000000;
            padding: 8px 18px;
            z-index: 10;
            text-align: center;
            min-width: 100px;
            pointer-events: none;
            color: #000000;
        `;
        prepTimer.innerHTML = `
            <div style="font-size:0.8rem;color:#333;letter-spacing:0.5px;">ДО ПОЯВЛЕНИЯ</div>
            <div style="font-size:2.2rem;font-weight:bold;color:#cc0000;line-height:1.2;" id="tinyPrepTimerValue">60</div>
        `;

        const canvasEl = document.createElement('canvas');
        canvasEl.id = 'tinyGameCanvas';
        canvasEl.style.cssText = `
            display: block;
            width: 100%;
            height: 100%;
            cursor: default;
            touch-action: none;
            image-rendering: crisp-edges;
        `;

        wrapper.appendChild(uiPanel);
        wrapper.appendChild(prepTimer);
        wrapper.appendChild(canvasEl);
        container.appendChild(wrapper);

        canvas = canvasEl;
        ctx = canvas.getContext('2d');

        uiRefs.lives = document.getElementById('tinyLives');
        uiRefs.chunks = document.getElementById('tinyChunks');
        uiRefs.kills = document.getElementById('tinyKills');
        uiRefs.monsters = document.getElementById('tinyMonsters');
        uiRefs.prepTimerValue = document.getElementById('tinyPrepTimerValue');
        uiRefs.prepTimer = document.getElementById('tinyPrepTimer');
        uiRefs.buyBtn = document.getElementById('tinyBuyBtn');
        uiRefs.resetBtn = document.getElementById('tinyResetBtn');
    }

    function initChunks() {
        game.chunks = [];
        const totalWidth = CHUNKS_PER_ROW * CHUNK_SIZE;
        const totalHeight = Math.ceil(TOTAL_CHUNKS / CHUNKS_PER_ROW) * CHUNK_SIZE;
        const startX = (WORLD_SIZE - totalWidth) / 2;
        const startY = (WORLD_SIZE - totalHeight) / 2;

        for (let i = 0; i < TOTAL_CHUNKS; i++) {
            const row = Math.floor(i / CHUNKS_PER_ROW);
            const col = i % CHUNKS_PER_ROW;
            const x = startX + col * CHUNK_SIZE + CHUNK_SIZE/2;
            const y = startY + row * CHUNK_SIZE + CHUNK_SIZE/2;
            game.chunks.push({
                id: i,
                x: Math.round(x),
                y: Math.round(y),
                size: CHUNK_SIZE,
                mainBlock: { x: Math.round(x), y: Math.round(y) },
                alive: i === 0,
                isMain: i === 0,
                walls: []
            });
        }
        game.activeChunks = 1;
        game.monstersPerChunk = 1;
        game.buyCost = 10;
        game.mainBlockDestroyed = false;
        game.wallsBuilt = 0;
        game.chunksBought = 0;
        updateUI();
    }

    function buyChunk() {
        if (game.kills < game.buyCost) return false;
        if (game.gameOver) return false;
        const deadChunk = game.chunks.find(c => !c.alive);
        if (!deadChunk) return false;
        game.kills -= game.buyCost;
        game.buyCost = Math.floor(game.buyCost * 1.5);
        game.activeChunks++;
        game.chunksBought++;
        game.monstersPerChunk = Math.ceil(game.activeChunks * 0.7);
        deadChunk.alive = true;
        const half = deadChunk.size / 2;
        game.walls = game.walls.filter(w => {
            if (w.x >= deadChunk.x - half && w.x < deadChunk.x + half &&
                w.y >= deadChunk.y - half && w.y < deadChunk.y + half) {
                return false;
            }
            return true;
        });
        updateUI();
        return true;
    }

    function getChunkAt(gridX, gridY) {
        for (let chunk of game.chunks) {
            if (!chunk.alive) continue;
            const half = chunk.size / 2;
            if (gridX >= chunk.x - half && gridX < chunk.x + half &&
                gridY >= chunk.y - half && gridY < chunk.y + half) {
                return chunk;
            }
        }
        return null;
    }

    function placeWall(gridX, gridY) {
        if (game.gameOver) return false;
        gridX = Math.round(gridX);
        gridY = Math.round(gridY);
        if (gridX < 0 || gridX >= WORLD_SIZE || gridY < 0 || gridY >= WORLD_SIZE) return false;
        const chunk = getChunkAt(gridX, gridY);
        if (!chunk) return false;
        if (gridX === chunk.mainBlock.x && gridY === chunk.mainBlock.y) return false;
        for (let w of game.walls) {
            if (w.x === gridX && w.y === gridY) return false;
        }
        for (let m of game.monsters) {
            if (Math.round(m.x) === gridX && Math.round(m.y) === gridY) return false;
        }
        game.walls.push({ x: gridX, y: gridY, health: 5, maxHealth: 5 });
        game.wallsBuilt++;
        return true;
    }

    function removeWallsInChunk(chunk) {
        const half = chunk.size / 2;
        game.walls = game.walls.filter(w => {
            if (w.x >= chunk.x - half && w.x < chunk.x + half &&
                w.y >= chunk.y - half && w.y < chunk.y + half) {
                return false;
            }
            return true;
        });
    }

    function spawnMonster() {
        if (game.gameOver || game.prepPhase) return;
        const aliveChunks = game.chunks.filter(c => c.alive);
        if (aliveChunks.length === 0) return;
        const targetChunk = aliveChunks[Math.floor(Math.random() * aliveChunks.length)];
        const side = Math.floor(Math.random() * 4);
        let x, y;
        const margin = 0.5;
        if (side === 0) { x = Math.random() * (WORLD_SIZE - 1); y = -margin; }
        else if (side === 1) { x = WORLD_SIZE - 1 + margin; y = Math.random() * (WORLD_SIZE - 1); }
        else if (side === 2) { x = Math.random() * (WORLD_SIZE - 1); y = WORLD_SIZE - 1 + margin; }
        else { x = -margin; y = Math.random() * (WORLD_SIZE - 1); }
        const speed = 0.015 + Math.random() * 0.008;
        game.monsters.push({
            x, y,
            speed: Math.min(speed, 0.03),
            lastAttackTime: 0,
            targetChunk: targetChunk,
            targetX: targetChunk.mainBlock.x,
            targetY: targetChunk.mainBlock.y,
            stuckTimer: 0,
            lastX: x,
            lastY: y,
            state: 'moving'
        });
    }

    function removeMonster(index) {
        if (index < 0 || index >= game.monsters.length) return;
        game.kills++;
        game.monsters.splice(index, 1);
        updateUI();
    }

    function restartGame() {
        game.walls = [];
        game.monsters = [];
        game.lives = 20;
        game.kills = 0;
        game.gameOver = false;
        game.time = 0;
        game.spawnTimer = 0;
        game.prepPhase = true;
        game.prepTime = 3600;
        game.buyCost = 10;
        game.activeChunks = 1;
        game.monstersPerChunk = 1;
        game.wallsBuilt = 0;
        game.chunksBought = 0;
        game.deathTime = 0;
        game.restarting = false;
        game.restartTimer = 0;
        game.mainBlockDestroyed = false;
        if (uiRefs.prepTimer) uiRefs.prepTimer.style.display = 'block';
        initChunks();
        resizeCanvas();
        updateUI();
    }

    function update() {
        if (game.gameOver) {
            if (!game.restarting) {
                game.restarting = true;
                game.restartTimer = 0;
            }
            game.restartTimer++;
            if (game.restartTimer > 180) {
                restartGame();
            }
            return;
        }

        if (game.prepPhase) {
            game.prepTime--;
            const sec = Math.ceil(game.prepTime / 60);
            if (uiRefs.prepTimerValue) uiRefs.prepTimerValue.textContent = Math.max(0, sec);
            if (game.prepTime <= 0) {
                game.prepPhase = false;
                game.prepTime = 0;
                if (uiRefs.prepTimer) uiRefs.prepTimer.style.display = 'none';
            }
            game.time++;
            updateUI();
            return;
        }

        const spawnRate = Math.max(15, 60 - game.activeChunks * 2);
        game.spawnTimer++;
        if (game.spawnTimer >= spawnRate) {
            game.spawnTimer = 0;
            const count = Math.min(game.monstersPerChunk, 3 + game.activeChunks);
            for (let i = 0; i < count; i++) spawnMonster();
        }

        for (let i = game.monsters.length - 1; i >= 0; i--) {
            const m = game.monsters[i];

            if (!m.targetChunk || !m.targetChunk.alive) {
                const aliveChunks = game.chunks.filter(c => c.alive);
                if (aliveChunks.length === 0) {
                    removeMonster(i);
                    continue;
                }
                m.targetChunk = aliveChunks[Math.floor(Math.random() * aliveChunks.length)];
                m.targetX = m.targetChunk.mainBlock.x;
                m.targetY = m.targetChunk.mainBlock.y;
            }

            const gridX = Math.round(m.x);
            const gridY = Math.round(m.y);
            let wallOnCell = null;
            for (let w of game.walls) {
                if (w.x === gridX && w.y === gridY) { wallOnCell = w; break; }
            }

            if (wallOnCell) {
                wallOnCell.health--;
                if (wallOnCell.health <= 0) {
                    const idx = game.walls.indexOf(wallOnCell);
                    if (idx > -1) game.walls.splice(idx, 1);
                }
                removeMonster(i);
                continue;
            }

            const distToChunk = Math.sqrt(
                (m.x - m.targetChunk.mainBlock.x)**2 +
                (m.y - m.targetChunk.mainBlock.y)**2
            );
            if (distToChunk < 0.35) {
                if (m.targetChunk.isMain) {
                    game.mainBlockDestroyed = true;
                    game.gameOver = true;
                    game.deathTime = game.time;
                    updateUI();
                    return;
                }
                m.targetChunk.alive = false;
                removeWallsInChunk(m.targetChunk);
                game.activeChunks--;
                game.lives--;
                removeMonster(i);
                if (game.lives <= 0) {
                    game.lives = 0;
                    game.gameOver = true;
                    game.deathTime = game.time;
                    updateUI();
                    return;
                }
                continue;
            }

            const dx = m.x - m.lastX;
            const dy = m.y - m.lastY;
            const moveDist = Math.sqrt(dx*dx + dy*dy);
            if (moveDist < 0.001) m.stuckTimer++;
            else { m.stuckTimer = 0; m.lastX = m.x; m.lastY = m.y; }

            if (m.stuckTimer > 30) {
                const aliveChunks = game.chunks.filter(c => c.alive);
                if (aliveChunks.length > 0) {
                    let nearest = aliveChunks[0];
                    let minDist = Infinity;
                    for (let chunk of aliveChunks) {
                        const d = Math.sqrt((m.x - chunk.mainBlock.x)**2 + (m.y - chunk.mainBlock.y)**2);
                        if (d < minDist) { minDist = d; nearest = chunk; }
                    }
                    m.targetChunk = nearest;
                    m.targetX = nearest.mainBlock.x;
                    m.targetY = nearest.mainBlock.y;
                    m.stuckTimer = 0;
                }
            }

            const dx2 = m.targetX - m.x;
            const dy2 = m.targetY - m.y;
            const len = Math.sqrt(dx2*dx2 + dy2*dy2);
            if (len < 0.1) { m.x = m.targetX; m.y = m.targetY; continue; }

            const nx = dx2 / len, ny = dy2 / len;
            let newX = m.x + nx * m.speed;
            let newY = m.y + ny * m.speed;

            const targetGridX = Math.round(newX);
            const targetGridY = Math.round(newY);
            let hitWall = false;
            let hitWallObj = null;
            for (let w of game.walls) {
                if (w.x === targetGridX && w.y === targetGridY) { hitWall = true; hitWallObj = w; break; }
            }

            if (hitWall && hitWallObj) {
                hitWallObj.health--;
                if (hitWallObj.health <= 0) {
                    const idx = game.walls.indexOf(hitWallObj);
                    if (idx > -1) game.walls.splice(idx, 1);
                }
                removeMonster(i);
                continue;
            }

            if (!hitWall) {
                newX = Math.max(0, Math.min(WORLD_SIZE - 1, newX));
                newY = Math.max(0, Math.min(WORLD_SIZE - 1, newY));
                m.x = newX;
                m.y = newY;
            }
        }

        game.time++;
        updateUI();
    }

    function draw() {
        ctx.clearRect(0, 0, canvasW, canvasH);
        const z = camera.zoom;
        const ox = camera.x, oy = camera.y;

        ctx.fillStyle = "#d9d9d9";
        ctx.fillRect(0, 0, canvasW, canvasH);

        ctx.strokeStyle = "#c0c0c0";
        ctx.lineWidth = 0.5;
        const startX = -ox / (CELL_SIZE * z);
        const startY = -oy / (CELL_SIZE * z);
        const endX = (canvasW - ox) / (CELL_SIZE * z) + 1;
        const endY = (canvasH - oy) / (CELL_SIZE * z) + 1;
        for (let i = Math.floor(startX); i <= Math.ceil(endX); i++) {
            if (i < 0 || i > WORLD_SIZE) continue;
            const x = i * CELL_SIZE * z + ox;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasH); ctx.stroke();
        }
        for (let i = Math.floor(startY); i <= Math.ceil(endY); i++) {
            if (i < 0 || i > WORLD_SIZE) continue;
            const y = i * CELL_SIZE * z + oy;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasW, y); ctx.stroke();
        }

        function toScreen(wx, wy) {
            return { sx: wx * CELL_SIZE * z + ox, sy: wy * CELL_SIZE * z + oy };
        }
        const cellSize = CELL_SIZE * z;

        for (let chunk of game.chunks) {
            const { sx, sy } = toScreen(chunk.x - chunk.size/2, chunk.y - chunk.size/2);
            if (chunk.alive) {
                ctx.strokeStyle = "#666666";
                ctx.lineWidth = 1.5;
                ctx.strokeRect(sx, sy, chunk.size * cellSize, chunk.size * cellSize);

                const { sx: msx, sy: msy } = toScreen(chunk.mainBlock.x, chunk.mainBlock.y);
                ctx.fillStyle = chunk.isMain ? "#cc0000" : "#cc6600";
                ctx.fillRect(msx, msy, cellSize, cellSize);
                ctx.strokeStyle = "#000000";
                ctx.lineWidth = 1.5;
                ctx.strokeRect(msx, msy, cellSize, cellSize);
                ctx.fillStyle = "#ffffff";
                ctx.font = `bold ${cellSize * 0.5}px 'ST-Simple-Square', monospace`;
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(chunk.isMain ? "M" : chunk.id, msx + cellSize/2, msy + cellSize/2);
            } else {
                ctx.fillStyle = "rgba(0,0,0,0.3)";
                ctx.fillRect(sx, sy, chunk.size * cellSize, chunk.size * cellSize);
                ctx.strokeStyle = "#999999";
                ctx.lineWidth = 1;
                ctx.strokeRect(sx, sy, chunk.size * cellSize, chunk.size * cellSize);
                ctx.strokeStyle = "#ff0000";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(sx + chunk.size * cellSize, sy + chunk.size * cellSize);
                ctx.moveTo(sx + chunk.size * cellSize, sy);
                ctx.lineTo(sx, sy + chunk.size * cellSize);
                ctx.stroke();
            }
        }

        for (let w of game.walls) {
            const { sx, sy } = toScreen(w.x, w.y);
            const healthPercent = w.health / w.maxHealth;
            const r = Math.round(136 - (136 - 200) * (1 - healthPercent));
            const g = Math.round(136 - (136 - 50) * (1 - healthPercent));
            const bl = Math.round(136 - (136 - 50) * (1 - healthPercent));
            ctx.fillStyle = `rgb(${r}, ${g}, ${bl})`;
            ctx.fillRect(sx, sy, cellSize, cellSize);
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 1.2;
            ctx.strokeRect(sx, sy, cellSize, cellSize);

            ctx.fillStyle = "#ffffff";
            ctx.font = `bold ${Math.max(9, cellSize * 0.4)}px 'ST-Simple-Square', monospace`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(`${w.health}`, sx + cellSize/2, sy + cellSize/2);

            const barWidth = cellSize * 0.7;
            const barHeight = 3;
            const barX = sx + (cellSize - barWidth) / 2;
            const barY = sy + cellSize - 5;
            ctx.fillStyle = "#333333";
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = healthPercent > 0.5 ? "#00cc00" : "#cc0000";
            ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
        }

        for (let m of game.monsters) {
            const { sx, sy } = toScreen(m.x, m.y);
            const size = cellSize * 0.85;
            const off = (cellSize - size) / 2;
            ctx.fillStyle = "#2e7d32";
            ctx.fillRect(sx + off, sy + off, size, size);
            ctx.fillStyle = "#1b5e20";
            ctx.fillRect(sx + off + 2, sy + off + 2, size - 4, size - 4);
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(sx + off + size * 0.2, sy + off + size * 0.7);
            ctx.lineTo(sx + off + size * 0.8, sy + off + size * 0.7);
            ctx.stroke();
        }

        if (game.gameOver) {
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(0, 0, canvasW, canvasH);
            ctx.fillStyle = "#ffffff";
            ctx.font = `bold 60px 'ST-Simple-Square', monospace`;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("GAME OVER", canvasW/2, canvasH/2 - 40);
            ctx.font = `24px 'ST-Simple-Square', monospace`;
            ctx.fillText("ПЕРЕЗАПУСК ЧЕРЕЗ 3 СЕКУНДЫ...", canvasW/2, canvasH/2 + 40);
        }
    }

    function updateUI() {
        if (uiRefs.lives) uiRefs.lives.textContent = game.gameOver ? '0' : game.lives;
        if (uiRefs.chunks) uiRefs.chunks.textContent = `${game.activeChunks}/8`;
        if (uiRefs.kills) uiRefs.kills.textContent = game.kills;
        if (uiRefs.monsters) uiRefs.monsters.textContent = game.monsters.length;
        if (uiRefs.buyBtn) {
            uiRefs.buyBtn.textContent = `КУПИТЬ ЧАНК (${game.buyCost})`;
            const hasDeadChunk = game.chunks.some(c => !c.alive);
            uiRefs.buyBtn.disabled = game.kills < game.buyCost || game.gameOver || !hasDeadChunk;
        }
    }

    function loop() {
        animationId = requestAnimationFrame(loop);
        update();
        draw();
    }

    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        let cx, cy;
        if (e.touches) {
            cx = e.touches[0].clientX; cy = e.touches[0].clientY;
            e.preventDefault();
        } else {
            cx = e.clientX; cy = e.clientY;
        }
        return {
            canvasX: (cx - rect.left) * (canvas.width / rect.width),
            canvasY: (cy - rect.top) * (canvas.height / rect.height)
        };
    }

    function getWorld(cx, cy) {
        return {
            wx: (cx - camera.x) / (CELL_SIZE * camera.zoom),
            wy: (cy - camera.y) / (CELL_SIZE * camera.zoom)
        };
    }

    function handleDown(e) {
        if (game.gameOver) return;
        const { canvasX, canvasY } = getCanvasCoords(e);
        const { wx, wy } = getWorld(canvasX, canvasY);
        placeWall(Math.round(wx), Math.round(wy));
    }

    function handlePanStart(e) {
        const { canvasX, canvasY } = getCanvasCoords(e);
        isPanning = true;
        panStartX = canvasX;
        panStartY = canvasY;
        cameraStartX = camera.x;
        cameraStartY = camera.y;
    }

    function handleMove(e) {
        if (!isPanning) return;
        const { canvasX, canvasY } = getCanvasCoords(e);
        camera.x = cameraStartX + (canvasX - panStartX);
        camera.y = cameraStartY + (canvasY - panStartY);
    }

    function handleUp() {
        isPanning = false;
    }

    function handleWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        camera.zoom = Math.min(Math.max(camera.zoom + delta, camera.minZoom), camera.maxZoom);
    }

    function resizeCanvas() {
        if (!canvas || !container) return;
        const wrapper = document.getElementById('tinyGameWrapper');
        if (!wrapper) return;
        const rect = wrapper.getBoundingClientRect();
        const uiH = document.getElementById('tinyUiPanel') ? document.getElementById('tinyUiPanel').offsetHeight : 50;
        canvas.width = rect.width;
        canvas.height = rect.height - uiH - 2;
        canvasW = canvas.width;
        canvasH = canvas.height;
        const wx = WORLD_SIZE/2 * CELL_SIZE;
        const wy = WORLD_SIZE/2 * CELL_SIZE;
        camera.x = canvasW/2 - wx * camera.zoom;
        camera.y = canvasH/2 - wy * camera.zoom;
    }

    function onMouseDown(e) {
        if (e.button === 0) {
            handleDown(e);
            handlePanStart(e);
        }
    }
    function onTouchStart(e) {
        handleDown(e);
        handlePanStart(e);
    }
    function onResize() { resizeCanvas(); }
    function onContextMenu(e) { e.preventDefault(); }

    function bindEvents() {
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('touchend', handleUp, { passive: false });
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        canvas.addEventListener('contextmenu', onContextMenu);
        window.addEventListener('resize', onResize);

        if (uiRefs.resetBtn) {
            uiRefs.resetBtn.addEventListener('click', restartGame);
        }
        if (uiRefs.buyBtn) {
            uiRefs.buyBtn.addEventListener('click', function() {
                buyChunk();
                updateUI();
            });
        }
    }

    function unbindEvents() {
        if (canvas) {
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('wheel', handleWheel);
            canvas.removeEventListener('contextmenu', onContextMenu);
        }
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('touchend', handleUp);
        window.removeEventListener('resize', onResize);
    }

    function tinyInit() {
        container = document.getElementById('gameCenterGameContainer');
        if (!container) return;

        buildUI();
        initChunks();
        resizeCanvas();
        resetGameState();
        bindEvents();

        if (animationId) cancelAnimationFrame(animationId);
        loop();

        initialized = true;
    }

    function resetGameState() {
        game.walls = [];
        game.monsters = [];
        game.lives = 20;
        game.kills = 0;
        game.gameOver = false;
        game.time = 0;
        game.spawnTimer = 0;
        game.prepPhase = true;
        game.prepTime = 3600;
        game.buyCost = 10;
        game.activeChunks = 1;
        game.monstersPerChunk = 1;
        game.wallsBuilt = 0;
        game.chunksBought = 0;
        game.deathTime = 0;
        game.restarting = false;
        game.restartTimer = 0;
        game.mainBlockDestroyed = false;
        if (uiRefs.prepTimer) uiRefs.prepTimer.style.display = 'block';
        initChunks();
        resizeCanvas();
        updateUI();
    }

    function tinyDestroy() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        unbindEvents();
        initialized = false;
        if (container) container.innerHTML = '';
        container = null;
        canvas = null;
        ctx = null;
    }

    window.tinyInit = tinyInit;
    window.TinyWalls = {
        destroy: tinyDestroy,
        init: tinyInit
    };

})();