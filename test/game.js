// game.js — 3D игра "Гоночный вызов"

(function() {
    'use strict';

    console.log('[Game] Загрузка 3D игры...');

    let gameContainer = null;
    let scene, camera, renderer;
    let car, road, obstacles = [];
    let score = 0;
    let gameRunning = false;
    let gameLoopId = null;
    let speed = 0.3;
    let carX = 0;
    let carTargetX = 0;
    let keys = { left: false, right: false };
    let obstacleTimer = 0;
    let spawnInterval = 60;
    let gameOverShown = false;

    // ---------- ИНИЦИАЛИЗАЦИЯ ----------
    function initGame() {
        if (document.getElementById('gameApp')) {
            return;
        }

        // Создаём контейнер
        gameContainer = document.createElement('div');
        gameContainer.id = 'gameApp';
        gameContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #1a1a2e;
            z-index: 99999;
            overflow: hidden;
            font-family: 'ST-SimpleSquare', monospace;
        `;

        // UI поверх игры
        const ui = document.createElement('div');
        ui.id = 'gameUI';
        ui.style.cssText = `
            position: absolute;
            top: 20px;
            left: 0;
            width: 100%;
            padding: 0 20px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            pointer-events: none;
            z-index: 10;
            color: #ffffff;
            font-family: 'ST-SimpleSquare', monospace;
        `;
        ui.innerHTML = `
            <div>
                <div style="font-size:14px;opacity:0.6;">СЧЁТ</div>
                <div id="gameScore" style="font-size:32px;font-weight:700;">0</div>
            </div>
            <div style="text-align:right;">
                <button id="gameCloseBtn" style="
                    pointer-events: all;
                    background: rgba(255,255,255,0.1);
                    border: 2px solid rgba(255,255,255,0.3);
                    color: #ffffff;
                    font-size: 24px;
                    padding: 4px 16px;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                ">✕</button>
                <div style="font-size:12px;opacity:0.5;margin-top:8px;">← → или A D</div>
            </div>
        `;

        // Экран Game Over
        const gameOverScreen = document.createElement('div');
        gameOverScreen.id = 'gameOverScreen';
        gameOverScreen.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 20;
            color: #ffffff;
            font-family: 'ST-SimpleSquare', monospace;
        `;
        gameOverScreen.innerHTML = `
            <div style="font-size:64px;font-weight:700;color:#cc0000;">GAME OVER</div>
            <div style="font-size:24px;margin-top:12px;">Счёт: <span id="finalScore">0</span></div>
            <button id="restartBtn" style="
                margin-top: 30px;
                padding: 14px 48px;
                background: #cc0000;
                border: none;
                color: #ffffff;
                font-size: 20px;
                font-weight: 600;
                cursor: pointer;
                font-family: 'ST-SimpleSquare', monospace;
                transition: transform 0.2s;
            ">НАЧАТЬ ЗАНОВО</button>
        `;

        gameContainer.appendChild(ui);
        gameContainer.appendChild(gameOverScreen);
        document.body.appendChild(gameContainer);

        // Обработчики
        document.getElementById('gameCloseBtn').addEventListener('click', closeGame);
        document.getElementById('restartBtn').addEventListener('click', restartGame);

        // Клавиши
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);

        // Создаём 3D сцену
        initThree();
        startGame();

        console.log('[Game] Игра запущена');
    }

    // ---------- THREE.JS ----------
    function initThree() {
        const container = gameContainer;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);
        scene.fog = new THREE.Fog(0x1a1a2e, 20, 50);

        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.set(0, 6, 10);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        // Свет
        const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 40;
        dirLight.shadow.camera.left = -10;
        dirLight.shadow.camera.right = 10;
        dirLight.shadow.camera.top = 10;
        dirLight.shadow.camera.bottom = -10;
        scene.add(dirLight);

        const backLight = new THREE.DirectionalLight(0x4466ff, 0.3);
        backLight.position.set(-5, 5, -10);
        scene.add(backLight);

        // Дорога
        createRoad();

        // Полосы разметки
        createRoadLines();

        // Машина
        createCar();

        // Обработка resize
        window.addEventListener('resize', onResize);
    }

    function createRoad() {
        const roadGeo = new THREE.PlaneGeometry(6, 100);
        const roadMat = new THREE.MeshStandardMaterial({
            color: 0x333344,
            roughness: 0.8,
            metalness: 0.2
        });
        road = new THREE.Mesh(roadGeo, roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.z = -20;
        road.receiveShadow = true;
        scene.add(road);

        // Обочины
        const sideMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.9 });
        for (let side of [-3.2, 3.2]) {
            const sideGeo = new THREE.PlaneGeometry(0.5, 100);
            const sideMesh = new THREE.Mesh(sideGeo, sideMat);
            sideMesh.rotation.x = -Math.PI / 2;
            sideMesh.position.set(side, 0.01, -20);
            scene.add(sideMesh);
        }
    }

    function createRoadLines() {
        const lineMat = new THREE.MeshStandardMaterial({ color: 0x666688, roughness: 0.5 });
        for (let i = 0; i < 40; i++) {
            const lineGeo = new THREE.PlaneGeometry(0.1, 0.8);
            const line = new THREE.Mesh(lineGeo, lineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(0, 0.02, -i * 1.2);
            scene.add(line);
        }
    }

    function createCar() {
        const group = new THREE.Group();

        // Кузов
        const bodyMat = new THREE.MeshStandardMaterial({ 
            color: 0xcc0000, 
            roughness: 0.3, 
            metalness: 0.6 
        });
        const bodyGeo = new THREE.BoxGeometry(1.2, 0.4, 2);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.3;
        body.castShadow = true;
        group.add(body);

        // Кабина
        const glassMat = new THREE.MeshStandardMaterial({ 
            color: 0x88ccff, 
            roughness: 0.1, 
            metalness: 0.8,
            transparent: true,
            opacity: 0.6
        });
        const cabinGeo = new THREE.BoxGeometry(1, 0.3, 0.9);
        const cabin = new THREE.Mesh(cabinGeo, glassMat);
        cabin.position.set(0, 0.6, -0.3);
        cabin.castShadow = true;
        group.add(cabin);

        // Колёса
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
        const wheelPositions = [
            [-0.7, 0.1, 0.7],
            [0.7, 0.1, 0.7],
            [-0.7, 0.1, -0.7],
            [0.7, 0.1, -0.7]
        ];
        wheelPositions.forEach(pos => {
            const wheelGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.15, 8);
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(pos[0], pos[1], pos[2]);
            wheel.castShadow = true;
            group.add(wheel);
        });

        // Фары
        const lightMat = new THREE.MeshStandardMaterial({ 
            color: 0xffdd44, 
            emissive: 0xffdd44,
            emissiveIntensity: 0.5
        });
        for (let side of [-0.35, 0.35]) {
            const lightGeo = new THREE.SphereGeometry(0.08, 8, 8);
            const light = new THREE.Mesh(lightGeo, lightMat);
            light.position.set(side, 0.25, 1.05);
            group.add(light);
        }

        group.position.set(0, 0, 0);
        car = group;
        scene.add(car);
    }

    // ---------- ПРЕПЯТСТВИЯ ----------
    function createObstacle() {
        const types = [
            { color: 0xff4444, width: 0.8, height: 0.8, depth: 0.8 },
            { color: 0xffaa00, width: 1.0, height: 0.5, depth: 0.5 },
            { color: 0x44ff44, width: 0.6, height: 1.2, depth: 0.6 },
            { color: 0x4444ff, width: 0.7, height: 0.7, depth: 1.2 },
            { color: 0xff44ff, width: 1.2, height: 0.4, depth: 0.4 }
        ];

        const type = types[Math.floor(Math.random() * types.length)];
        const x = (Math.random() - 0.5) * 4.5;

        const mat = new THREE.MeshStandardMaterial({ 
            color: type.color, 
            roughness: 0.5,
            metalness: 0.3,
            emissive: type.color,
            emissiveIntensity: 0.1
        });
        const geo = new THREE.BoxGeometry(type.width, type.height, type.depth);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, type.height/2, -35);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Вращение для разнообразия
        mesh.rotation.y = Math.random() * Math.PI;

        scene.add(mesh);

        obstacles.push({
            mesh: mesh,
            speed: 0.3 + Math.random() * 0.2,
            width: type.width,
            depth: type.depth
        });
    }

    // ---------- АНИМАЦИЯ ----------
    function gameLoop() {
        if (!gameRunning) return;

        // Движение влево-вправо
        if (keys.left) carTargetX = -2.2;
        else if (keys.right) carTargetX = 2.2;
        else carTargetX = 0;

        carX += (carTargetX - carX) * 0.12;
        car.position.x = carX;

        // Лёгкое наклонение машины
        car.rotation.z = -carX * 0.05;

        // Движение дороги и препятствий
        const currentSpeed = speed + score * 0.001;

        // Двигаем препятствия
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obs = obstacles[i];
            obs.mesh.position.z += currentSpeed;

            // Проверка столкновения
            if (obs.mesh.position.z > -0.5 && obs.mesh.position.z < 0.5) {
                const dx = Math.abs(obs.mesh.position.x - car.position.x);
                const halfWidth = 0.6 + obs.width/2;
                const halfDepth = 0.5 + obs.depth/2;
                if (dx < halfWidth && obs.mesh.position.z > -halfDepth && obs.mesh.position.z < halfDepth) {
                    gameOver();
                    return;
                }
            }

            // Удаление препятствий за машиной
            if (obs.mesh.position.z > 10) {
                scene.remove(obs.mesh);
                obstacles.splice(i, 1);
                score++;
                updateScore();
            }
        }

        // Спавн препятствий
        obstacleTimer++;
        const spawnRate = Math.max(20, spawnInterval - score * 0.5);
        if (obstacleTimer > spawnRate) {
            obstacleTimer = 0;
            if (Math.random() < 0.6) {
                createObstacle();
                // Иногда два сразу
                if (Math.random() < 0.3 && score > 10) {
                    setTimeout(() => { if (gameRunning) createObstacle(); }, 200);
                }
            }
        }

        // Движение дорожной разметки
        const lines = scene.children.filter(c => c.geometry && c.geometry.type === 'PlaneGeometry' && c.position.y === 0.02);
        lines.forEach(line => {
            line.position.z += currentSpeed;
            if (line.position.z > 10) {
                line.position.z -= 48;
            }
        });

        renderer.render(scene, camera);
        gameLoopId = requestAnimationFrame(gameLoop);
    }

    // ---------- УПРАВЛЕНИЕ ----------
    function onKeyDown(e) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            keys.left = true;
            e.preventDefault();
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            keys.right = true;
            e.preventDefault();
        }
        if (e.key === 'r' || e.key === 'R') {
            if (!gameRunning) restartGame();
        }
    }

    function onKeyUp(e) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            keys.left = false;
            e.preventDefault();
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            keys.right = false;
            e.preventDefault();
        }
    }

    // ---------- ТАЧ УПРАВЛЕНИЕ ----------
    let touchStartX = 0;
    let isTouching = false;

    function initTouchControls() {
        const container = gameContainer;
        container.addEventListener('touchstart', function(e) {
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            isTouching = true;
        }, { passive: true });

        container.addEventListener('touchmove', function(e) {
            if (!isTouching) return;
            const touch = e.touches[0];
            const diff = touch.clientX - touchStartX;
            if (diff > 30) {
                keys.right = true;
                keys.left = false;
            } else if (diff < -30) {
                keys.left = true;
                keys.right = false;
            } else {
                keys.left = false;
                keys.right = false;
            }
            touchStartX = touch.clientX;
        }, { passive: true });

        container.addEventListener('touchend', function() {
            isTouching = false;
            keys.left = false;
            keys.right = false;
        }, { passive: true });
    }

    // ---------- ИГРОВЫЕ ФУНКЦИИ ----------
    function startGame() {
        gameRunning = true;
        gameOverShown = false;
        document.getElementById('gameOverScreen').style.display = 'none';
        updateScore();
        gameLoop();
    }

    function gameOver() {
        gameRunning = false;
        gameOverShown = true;
        document.getElementById('finalScore').textContent = score;
        document.getElementById('gameOverScreen').style.display = 'flex';
        if (gameLoopId) {
            cancelAnimationFrame(gameLoopId);
            gameLoopId = null;
        }
    }

    function restartGame() {
        // Очищаем препятствия
        obstacles.forEach(obs => scene.remove(obs.mesh));
        obstacles = [];
        score = 0;
        carX = 0;
        car.position.x = 0;
        car.rotation.z = 0;
        obstacleTimer = 0;
        gameOverShown = false;
        document.getElementById('gameOverScreen').style.display = 'none';
        updateScore();
        startGame();
    }

    function updateScore() {
        document.getElementById('gameScore').textContent = score;
    }

    function onResize() {
        if (camera && renderer) {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    // ---------- ЗАКРЫТИЕ ----------
    function closeGame() {
        gameRunning = false;
        if (gameLoopId) {
            cancelAnimationFrame(gameLoopId);
            gameLoopId = null;
        }
        
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', onResize);

        // Очищаем сцену
        if (scene) {
            obstacles.forEach(obs => scene.remove(obs.mesh));
            obstacles = [];
            if (car) scene.remove(car);
            if (road) scene.remove(road);
            // Удаляем все объекты
            while(scene.children.length > 0) {
                scene.remove(scene.children[0]);
            }
        }

        if (renderer) {
            renderer.dispose();
            if (renderer.domElement && renderer.domElement.parentNode) {
                renderer.domElement.parentNode.remove();
            }
        }

        const el = document.getElementById('gameApp');
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => { el.remove(); }, 300);
        }

        console.log('[Game] Игра закрыта');
    }

    // ---------- ИНИЦИАЛИЗАЦИЯ ----------
    window.gameInit = function() {
        if (document.getElementById('gameApp')) {
            return;
        }
        // Загружаем Three.js с CDN
        if (typeof THREE === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
            script.onload = function() {
                console.log('[Game] Three.js загружен');
                initGame();
                initTouchControls();
            };
            script.onerror = function() {
                alert('Ошибка загрузки 3D движка. Проверьте интернет-соединение.');
            };
            document.head.appendChild(script);
        } else {
            initGame();
            initTouchControls();
        }
    };

    console.log('[Game] Приложение готово. Используйте gameInit() для запуска');

})();