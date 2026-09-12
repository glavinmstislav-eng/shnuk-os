// game.js — 3D игра с управлением жестами

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
    
    let snowParticles = [];
    let houses = [];
    let snowdrifts = [];
    let roadLines = [];
    let cameraShake = 0;
    let cameraBob = 0;
    let speedLines = [];

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isTouching = false;
    let swipeThreshold = 30;
    let swipeTimeThreshold = 500;

    let deviceOrientationHandler = null;

    const CAR_START_Z = 8;
    const CAR_LOOK_AHEAD = -40;
    const CAMERA_HEIGHT = 6;
    const CAMERA_BEHIND = 12;
    const SPAWN_Z = -50;

    function initGame() {
        if (document.getElementById('gameApp')) {
            return;
        }

        gameContainer = document.createElement('div');
        gameContainer.id = 'gameApp';
        gameContainer.style.cssText = `
            position: fixed;
            top: var(--livebar-h, 44px);
            left: 0;
            width: 100%;
            height: calc(100% - var(--livebar-h, 44px));
            background: #1a1a2e;
            z-index: 99999;
            overflow: hidden;
            font-family: 'ST-SimpleSquare', monospace;
            touch-action: none;
            user-select: none;
            -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
        `;

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
                <div style="font-size:14px;opacity:0.6;text-shadow:0 2px 10px rgba(0,0,0,0.5);">СЧЁТ</div>
                <div id="gameScore" style="font-size:32px;font-weight:700;text-shadow:0 2px 20px rgba(0,0,0,0.5);">0</div>
            </div>
            <div style="text-align:right;pointer-events:all;">
                <button id="gameCloseBtn" style="
                    background: rgba(255,255,255,0.1);
                    border: 2px solid rgba(255,255,255,0.3);
                    color: #ffffff;
                    font-size: 24px;
                    padding: 4px 16px;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    backdrop-filter: blur(10px);
                ">✕</button>
                <div id="gameControlsHint" style="font-size:11px;opacity:0.6;margin-top:8px;text-shadow:0 2px 10px rgba(0,0,0,0.5);line-height:1.4;">
                    Выход
                </div>
            </div>
        `;

        const gameOverScreen = document.createElement('div');
        gameOverScreen.id = 'gameOverScreen';
        gameOverScreen.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 20;
            color: #ffffff;
            font-family: 'ST-SimpleSquare', monospace;
            padding: 20px;
            box-sizing: border-box;
        `;
        gameOverScreen.innerHTML = `
            <div style="font-size:64px;font-weight:700;color:#cc0000;text-shadow:0 0 40px rgba(204,0,0,0.5);">GAME OVER</div>
            <div style="font-size:24px;margin-top:12px;opacity:0.8;">Счёт: <span id="finalScore">0</span></div>
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
                box-shadow: 0 0 30px rgba(204,0,0,0.3);
            ">НАЧАТЬ ЗАНОВО</button>
        `;

        gameContainer.appendChild(ui);
        gameContainer.appendChild(gameOverScreen);
        document.body.appendChild(gameContainer);

        document.getElementById('gameCloseBtn').addEventListener('click', closeGame);
        document.getElementById('restartBtn').addEventListener('click', restartGame);

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);

        initTouchControls();
        initTiltControls();

        initThree();
        startGame();

        console.log('[Game] Игра запущена');
    }

    function initTouchControls() {
        const container = gameContainer;

        container.addEventListener('touchstart', function(e) {
            if (e.target.closest('button')) return;
            
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            touchStartTime = Date.now();
            isTouching = true;
            if (!gameRunning) return;
            e.preventDefault();
        }, { passive: false });

        container.addEventListener('touchmove', function(e) {
            if (!isTouching || !gameRunning) return;
            e.preventDefault();

            const touch = e.touches[0];
            const deltaX = touch.clientX - touchStartX;
            const deltaY = touch.clientY - touchStartY;

            if (Math.abs(deltaX) > swipeThreshold && Math.abs(deltaX) > Math.abs(deltaY)) {
                if (deltaX > 0) {
                    carTargetX = 2.3;
                    keys.right = true;
                    keys.left = false;
                } else {
                    carTargetX = -2.3;
                    keys.left = true;
                    keys.right = false;
                }
            }
        }, { passive: false });

        container.addEventListener('touchend', function(e) {
            if (!isTouching) return;
            isTouching = false;

            const touchEndTime = Date.now();
            const touchDuration = touchEndTime - touchStartTime;
            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - touchStartX;
            const deltaY = touch.clientY - touchStartY;

            if (touchDuration < swipeTimeThreshold) {
                if (Math.abs(deltaX) > swipeThreshold * 2 && Math.abs(deltaX) > Math.abs(deltaY)) {
                    if (deltaX > 0) {
                        carTargetX = 2.5;
                    } else {
                        carTargetX = -2.5;
                    }
                }
            }

            keys.left = false;
            keys.right = false;
            setTimeout(() => {
                if (!keys.left && !keys.right) {
                    carTargetX = 0;
                }
            }, 100);
        }, { passive: true });

        let lastTap = 0;
        container.addEventListener('touchend', function(e) {
            if (e.target.closest('button')) return;
            const now = Date.now();
            if (now - lastTap < 300) {
                togglePause();
            }
            lastTap = now;
        });
    }

    function initTiltControls() {
        if (!window.DeviceOrientationEvent) return;

        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            const requestPermission = function() {
                DeviceOrientationEvent.requestPermission()
                    .then(function(state) {
                        if (state === 'granted') enableTilt();
                    })
                    .catch(function() {});
                document.removeEventListener('touchstart', requestPermission);
            };
            document.addEventListener('touchstart', requestPermission, { once: true });
        } else {
            enableTilt();
        }
    }

    function enableTilt() {
        deviceOrientationHandler = function(e) {
            if (!gameRunning) return;
            const tilt = Math.max(-25, Math.min(25, e.gamma || 0));
            carTargetX = (tilt / 25) * 2.3;
        };
        window.addEventListener('deviceorientation', deviceOrientationHandler, true);
    }

    function disableTilt() {
        if (deviceOrientationHandler) {
            window.removeEventListener('deviceorientation', deviceOrientationHandler, true);
            deviceOrientationHandler = null;
        }
    }

    let isPaused = false;

    function togglePause() {
        if (!gameRunning) return;
        isPaused = !isPaused;

        if (isPaused) {
            if (gameLoopId) {
                cancelAnimationFrame(gameLoopId);
                gameLoopId = null;
            }
            showPauseOverlay();
        } else {
            hidePauseOverlay();
            gameLoop();
        }
    }

    function showPauseOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'pauseOverlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 15;
            color: #ffffff;
            font-family: 'ST-SimpleSquare', monospace;
            font-size: 48px;
            font-weight: 700;
            letter-spacing: 4px;
        `;
        overlay.textContent = 'ПАУЗА';
        gameContainer.appendChild(overlay);
    }

    function hidePauseOverlay() {
        const overlay = document.getElementById('pauseOverlay');
        if (overlay) overlay.remove();
    }

    function initThree() {
        const container = gameContainer;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x2a2a4a);
        scene.fog = new THREE.FogExp2(0x2a2a4a, 0.012);

        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
        camera.position.set(0, CAMERA_HEIGHT, CAR_START_Z + CAMERA_BEHIND);
        camera.lookAt(0, 0, CAR_LOOK_AHEAD);

        renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: "high-performance"
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        container.appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0x4466aa, 0.5);
        scene.add(ambientLight);

        const moonLight = new THREE.DirectionalLight(0x4466ff, 0.3);
        moonLight.position.set(-10, 15, -10);
        scene.add(moonLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(5, 15, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 100;
        dirLight.shadow.camera.left = -20;
        dirLight.shadow.camera.right = 20;
        dirLight.shadow.camera.top = 20;
        dirLight.shadow.camera.bottom = -20;
        scene.add(dirLight);

        const hemiLight = new THREE.HemisphereLight(0x4488ff, 0x444422, 0.4);
        scene.add(hemiLight);

        createRoad();
        createSnowdrifts();
        createHouses();
        createSnow();
        createCar();
        createRoadLines();

        window.addEventListener('resize', onResize);
    }

    function createRoad() {
        const roadMat = new THREE.MeshStandardMaterial({
            color: 0x334466,
            roughness: 0.9,
            metalness: 0.1,
        });
        const roadGeo = new THREE.PlaneGeometry(6, 200);
        road = new THREE.Mesh(roadGeo, roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(0, -0.1, -50);
        road.receiveShadow = true;
        scene.add(road);

        const snowMat = new THREE.MeshStandardMaterial({
            color: 0xeeeeff,
            roughness: 0.9,
            metalness: 0,
        });
        
        for (let side of [-3.5, 3.5]) {
            const snowGeo = new THREE.PlaneGeometry(3, 200);
            const snow = new THREE.Mesh(snowGeo, snowMat);
            snow.rotation.x = -Math.PI / 2;
            snow.position.set(side, -0.05, -50);
            snow.receiveShadow = true;
            scene.add(snow);
        }

        const curbMat = new THREE.MeshStandardMaterial({
            color: 0x556688,
            roughness: 0.8,
            metalness: 0.2,
        });
        for (let side of [-3.2, 3.2]) {
            const curbGeo = new THREE.BoxGeometry(0.3, 0.2, 200);
            const curb = new THREE.Mesh(curbGeo, curbMat);
            curb.position.set(side, 0.05, -50);
            curb.castShadow = true;
            scene.add(curb);
        }
    }

    function createSnowdrifts() {
        const snowMat = new THREE.MeshStandardMaterial({
            color: 0xeeeeff,
            roughness: 0.95,
            metalness: 0,
            emissive: 0x8888aa,
            emissiveIntensity: 0.05,
        });

        for (let i = 0; i < 100; i++) {
            const size = 0.3 + Math.random() * 0.8;
            const geo = new THREE.SphereGeometry(size, 8, 8);
            const drift = new THREE.Mesh(geo, snowMat);
            const side = Math.random() > 0.5 ? 1 : -1;
            const x = side * (3.6 + Math.random() * 1.5);
            const z = 20 - Math.random() * 150;
            const y = 0.1 + Math.random() * 0.2;
            drift.position.set(x, y, z);
            drift.scale.y = 0.3 + Math.random() * 0.3;
            drift.castShadow = true;
            drift.receiveShadow = true;
            scene.add(drift);
            snowdrifts.push(drift);
        }
    }

    function createHouses() {
        const colors = [0xcc4444, 0x44aa88, 0x6688cc, 0xcc8844, 0xaa66cc, 0x66ccaa];
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0xffdd44,
            emissive: 0xffdd44,
            emissiveIntensity: 0.4,
        });

        for (let i = 0; i < 40; i++) {
            const group = new THREE.Group();
            
            const side = Math.random() > 0.5 ? 1 : -1;
            const x = side * (7 + Math.random() * 8);
            const z = 20 - Math.random() * 150;
            
            const height = 1.2 + Math.random() * 1.5;
            const width = 1 + Math.random() * 0.8;
            const depth = 1 + Math.random() * 0.8;
            
            const wallMat = new THREE.MeshStandardMaterial({
                color: colors[Math.floor(Math.random() * colors.length)],
                roughness: 0.7,
                metalness: 0.1,
            });
            
            const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
            body.position.y = height / 2;
            body.castShadow = true;
            body.receiveShadow = true;
            group.add(body);

            const roofMat = new THREE.MeshStandardMaterial({
                color: 0x884444,
                roughness: 0.8,
                metalness: 0.1,
            });
            const roof = new THREE.Mesh(new THREE.ConeGeometry(width * 0.7, height * 0.5, 4), roofMat);
            roof.position.y = height + 0.25;
            roof.rotation.y = Math.PI / 4;
            roof.castShadow = true;
            group.add(roof);

            for (let w = 0; w < 2; w++) {
                for (let h = 0; h < 2; h++) {
                    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.2), windowMat);
                    win.position.set(
                        (w - 0.5) * width * 0.5,
                        0.4 + h * 0.5,
                        depth / 2 + 0.01
                    );
                    group.add(win);
                }
            }

            const snowMat = new THREE.MeshStandardMaterial({
                color: 0xeeeeff,
                roughness: 0.95,
                metalness: 0,
            });
            const snowRoof = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 0.1, depth * 0.9), snowMat);
            snowRoof.position.y = height + 0.05;
            group.add(snowRoof);

            group.position.set(x, 0, z);
            group.rotation.y = (Math.random() - 0.5) * 0.3;
            
            scene.add(group);
            houses.push({
                mesh: group,
                z: z,
                x: x,
                speed: 0.2 + Math.random() * 0.1
            });
        }
    }

    function createSnow() {
        const snowMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.08,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        const positions = [];
        const velocities = [];

        for (let i = 0; i < 1000; i++) {
            positions.push(
                (Math.random() - 0.5) * 60,
                Math.random() * 20,
                (Math.random() - 0.5) * 120 - 30
            );
            velocities.push(
                (Math.random() - 0.5) * 0.005,
                -(0.01 + Math.random() * 0.02),
                (Math.random() - 0.5) * 0.005
            );
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        
        const snow = new THREE.Points(geometry, snowMat);
        snow.position.y = 5;
        scene.add(snow);

        snowParticles = {
            mesh: snow,
            velocities: velocities,
            positions: positions,
            count: 1000
        };
    }

    function createCar() {
        const group = new THREE.Group();

        const bodyMat = new THREE.MeshStandardMaterial({ 
            color: 0xcc0000, 
            roughness: 0.2, 
            metalness: 0.8,
            emissive: 0x440000,
            emissiveIntensity: 0.1,
        });
        const bodyGeo = new THREE.BoxGeometry(1.2, 0.4, 2);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.3;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const glassMat = new THREE.MeshStandardMaterial({ 
            color: 0x88ccff, 
            roughness: 0.05, 
            metalness: 0.9,
            transparent: true,
            opacity: 0.5,
        });
        const cabinGeo = new THREE.BoxGeometry(1, 0.3, 0.9);
        const cabin = new THREE.Mesh(cabinGeo, glassMat);
        cabin.position.set(0, 0.6, -0.3);
        cabin.castShadow = true;
        group.add(cabin);

        const lightMat = new THREE.MeshStandardMaterial({ 
            color: 0xffdd44, 
            emissive: 0xffdd44,
            emissiveIntensity: 0.8,
        });
        for (let side of [-0.35, 0.35]) {
            const light = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), lightMat);
            light.position.set(side, 0.25, -1.05);
            group.add(light);
        }

        const tailMat = new THREE.MeshStandardMaterial({ 
            color: 0xff2200, 
            emissive: 0xff2200,
            emissiveIntensity: 0.3,
        });
        for (let side of [-0.35, 0.35]) {
            const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), tailMat);
            light.position.set(side, 0.25, 1.05);
            group.add(light);
        }

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

        const spoilerMat = new THREE.MeshStandardMaterial({ 
            color: 0x333333, 
            roughness: 0.3, 
            metalness: 0.5,
        });
        const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.3), spoilerMat);
        spoiler.position.set(0, 0.55, 0.9);
        group.add(spoiler);

        group.position.set(0, 0, CAR_START_Z);
        car = group;
        scene.add(car);
    }

    function createRoadLines() {
        const lineMat = new THREE.MeshStandardMaterial({ 
            color: 0x88aacc, 
            roughness: 0.5,
            emissive: 0x446688,
            emissiveIntensity: 0.1,
        });
        
        for (let i = 0; i < 80; i++) {
            const lineGeo = new THREE.PlaneGeometry(0.15, 0.8);
            const line = new THREE.Mesh(lineGeo, lineMat);
            line.rotation.x = -Math.PI / 2;
            const z = CAR_START_Z - i * 1.2;
            line.position.set(0, 0.02, z);
            line.receiveShadow = true;
            scene.add(line);
            roadLines.push(line);
        }
    }

    function createObstacle() {
        const types = [
            { color: 0xff4444, width: 0.8, height: 0.8, depth: 0.8 },
            { color: 0xffaa00, width: 1.0, height: 0.5, depth: 0.5 },
            { color: 0x44ff44, width: 0.6, height: 1.2, depth: 0.6 },
            { color: 0x4444ff, width: 0.7, height: 0.7, depth: 1.2 },
            { color: 0xff44ff, width: 1.2, height: 0.4, depth: 0.4 },
            { color: 0x44ffff, width: 0.5, height: 0.5, depth: 0.5 }
        ];

        const type = types[Math.floor(Math.random() * types.length)];
        const x = (Math.random() - 0.5) * 4.8;

        const mat = new THREE.MeshStandardMaterial({ 
            color: type.color, 
            roughness: 0.3,
            metalness: 0.5,
            emissive: type.color,
            emissiveIntensity: 0.15,
        });
        const geo = new THREE.BoxGeometry(type.width, type.height, type.depth);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, type.height/2, SPAWN_Z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.rotation.y = Math.random() * Math.PI;

        const glowMat = new THREE.MeshStandardMaterial({
            color: type.color,
            transparent: true,
            opacity: 0.1,
            emissive: type.color,
            emissiveIntensity: 0.2,
        });
        const glow = new THREE.Mesh(
            new THREE.BoxGeometry(type.width * 1.3, type.height * 1.3, type.depth * 1.3),
            glowMat
        );
        mesh.add(glow);

        scene.add(mesh);

        obstacles.push({
            mesh: mesh,
            speed: 0.3 + Math.random() * 0.2,
            width: type.width,
            depth: type.depth,
            height: type.height,
            color: type.color
        });
    }

    function gameLoop() {
        if (!gameRunning || isPaused) return;

        const currentSpeed = speed + score * 0.001;

        carX += (carTargetX - carX) * 0.12;
        if (carX > 2.5) carX = 2.5;
        if (carX < -2.5) carX = -2.5;
        car.position.x = carX;

        cameraBob += 0.02;
        const bobOffset = Math.sin(cameraBob) * 0.03;
        
        const targetCamX = carX * 0.5;
        camera.position.x += (targetCamX - camera.position.x) * 0.08;
        
        camera.position.y = CAMERA_HEIGHT + bobOffset + Math.sin(cameraBob * 0.5) * 0.03;
        camera.position.z = CAR_START_Z + CAMERA_BEHIND;
        
        camera.rotation.z += (-carX * 0.04 - camera.rotation.z) * 0.08;
        
        const lookTargetX = carX * 0.3;
        camera.lookAt(lookTargetX, 0, CAR_LOOK_AHEAD);

        if (cameraShake > 0) {
            camera.position.x += (Math.random() - 0.5) * cameraShake * 0.05;
            camera.position.y += (Math.random() - 0.5) * cameraShake * 0.05;
            cameraShake *= 0.95;
            if (cameraShake < 0.01) cameraShake = 0;
        }

        if (snowParticles.mesh) {
            const positions = snowParticles.mesh.geometry.attributes.position.array;
            const vels = snowParticles.velocities;
            const wind = Math.sin(Date.now() * 0.0005) * 0.003;
            
            for (let i = 0; i < snowParticles.count; i++) {
                positions[i*3] += vels[i*3] + wind + currentSpeed * 0.001;
                positions[i*3+1] += vels[i*3+1];
                positions[i*3+2] += vels[i*3+2] + currentSpeed * 0.01;
                
                if (positions[i*3+1] < 0) {
                    positions[i*3] = (Math.random() - 0.5) * 60;
                    positions[i*3+1] = 15 + Math.random() * 5;
                    positions[i*3+2] = (Math.random() - 0.5) * 120 - 30;
                }
                if (positions[i*3+2] > 20) {
                    positions[i*3+2] = -100 - Math.random() * 50;
                }
            }
            snowParticles.mesh.geometry.attributes.position.needsUpdate = true;
        }

        for (const house of houses) {
            house.z += currentSpeed;
            house.mesh.position.z += currentSpeed;
            if (house.z > 25) {
                house.z = -130 - Math.random() * 30;
                house.mesh.position.z = house.z;
                const side = Math.random() > 0.5 ? 1 : -1;
                house.x = side * (7 + Math.random() * 8);
                house.mesh.position.x = house.x;
                const colors = [0xcc4444, 0x44aa88, 0x6688cc, 0xcc8844, 0xaa66cc, 0x66ccaa];
                const child = house.mesh.children[0];
                if (child && child.isMesh) {
                    child.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
                }
            }
        }

        for (const drift of snowdrifts) {
            drift.position.z += currentSpeed;
            if (drift.position.z > 25) {
                drift.position.z = -130 - Math.random() * 30;
                const side = Math.random() > 0.5 ? 1 : -1;
                drift.position.x = side * (3.6 + Math.random() * 1.5);
                const size = 0.3 + Math.random() * 0.8;
                drift.scale.set(size, size * (0.3 + Math.random() * 0.3), size);
            }
        }

        for (const line of roadLines) {
            line.position.z += currentSpeed;
            if (line.position.z > 25) {
                line.position.z -= 96;
            }
        }

        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obs = obstacles[i];
            obs.mesh.position.z += currentSpeed;
            
            obs.mesh.rotation.y += 0.02;
            obs.mesh.rotation.x += 0.01;
            
            const glow = obs.mesh.children[0];
            if (glow) {
                glow.material.opacity = 0.05 + Math.sin(Date.now() * 0.003 + i) * 0.03;
            }

            if (obs.mesh.position.z > CAR_START_Z - 1.0 && obs.mesh.position.z < CAR_START_Z + 1.0) {
                const dx = Math.abs(obs.mesh.position.x - car.position.x);
                const halfWidth = 0.6 + obs.width/2;
                const halfDepth = 0.5 + obs.depth/2;
                if (dx < halfWidth && obs.mesh.position.z > CAR_START_Z - halfDepth && obs.mesh.position.z < CAR_START_Z + halfDepth) {
                    cameraShake = 2;
                    gameOver();
                    return;
                }
            }

            if (obs.mesh.position.z > CAR_START_Z + CAMERA_BEHIND + 5) {
                scene.remove(obs.mesh);
                obstacles.splice(i, 1);
                score++;
                document.getElementById('gameScore').textContent = score;
            }
        }

        obstacleTimer++;
        const spawnRate = Math.max(12, spawnInterval - score * 0.4);
        if (obstacleTimer > spawnRate) {
            obstacleTimer = 0;
            if (Math.random() < 0.6) {
                createObstacle();
                if (Math.random() < 0.2 && score > 5) {
                    setTimeout(() => { if (gameRunning) createObstacle(); }, 300);
                }
            }
        }

        if (Math.random() < currentSpeed * 0.3) {
            createSpeedLine();
        }

        renderer.render(scene, camera);
        gameLoopId = requestAnimationFrame(gameLoop);
    }

    function createSpeedLine() {
        const mat = new THREE.MeshBasicMaterial({
            color: 0x88ccff,
            transparent: true,
            opacity: 0.1 + Math.random() * 0.15,
        });
        const geo = new THREE.PlaneGeometry(0.02, 0.5 + Math.random() * 0.5);
        const line = new THREE.Mesh(geo, mat);
        const x = (Math.random() - 0.5) * 5.5;
        const y = -0.5 + Math.random() * 2.5;
        line.position.set(x, y, -10 - Math.random() * 20);
        line.rotation.z = (Math.random() - 0.5) * 0.1;
        scene.add(line);
        speedLines.push(line);

        if (speedLines.length > 30) {
            const old = speedLines.shift();
            scene.remove(old);
        }
    }

    function onKeyDown(e) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            keys.left = true;
            carTargetX = -2.3;
            e.preventDefault();
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            keys.right = true;
            carTargetX = 2.3;
            e.preventDefault();
        }
        if (e.key === 'r' || e.key === 'R') {
            if (!gameRunning) restartGame();
        }
        if (e.key === ' ' || e.key === 'Escape') {
            togglePause();
            e.preventDefault();
        }
    }

    function onKeyUp(e) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            keys.left = false;
            if (!keys.right) carTargetX = 0;
            e.preventDefault();
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            keys.right = false;
            if (!keys.left) carTargetX = 0;
            e.preventDefault();
        }
    }

    function startGame() {
        gameRunning = true;
        isPaused = false;
        gameOverShown = false;
        document.getElementById('gameOverScreen').style.display = 'none';
        document.getElementById('gameScore').textContent = '0';
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
        for (const obs of obstacles) scene.remove(obs.mesh);
        obstacles = [];
        
        for (const line of speedLines) scene.remove(line);
        speedLines = [];
        
        score = 0;
        carX = 0;
        carTargetX = 0;
        car.position.x = 0;
        car.rotation.z = 0;
        obstacleTimer = 0;
        cameraShake = 0;
        isPaused = false;
        gameOverShown = false;
        document.getElementById('gameOverScreen').style.display = 'none';
        document.getElementById('gameScore').textContent = '0';
        hidePauseOverlay();
        
        for (const house of houses) {
            house.z = 20 - Math.random() * 150;
            house.mesh.position.z = house.z;
            const side = Math.random() > 0.5 ? 1 : -1;
            house.x = side * (7 + Math.random() * 8);
            house.mesh.position.x = house.x;
        }
        
        for (const drift of snowdrifts) {
            drift.position.z = 20 - Math.random() * 150;
            const side = Math.random() > 0.5 ? 1 : -1;
            drift.position.x = side * (3.6 + Math.random() * 1.5);
        }
        
        startGame();
    }

    function onResize() {
        if (camera && renderer) {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    function closeGame() {
        gameRunning = false;
        isPaused = false;
        if (gameLoopId) {
            cancelAnimationFrame(gameLoopId);
            gameLoopId = null;
        }
        
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', onResize);
        disableTilt();

        if (scene) {
            for (const obs of obstacles) scene.remove(obs.mesh);
            obstacles = [];
            for (const line of speedLines) scene.remove(line);
            speedLines = [];
            if (car) scene.remove(car);
            if (road) scene.remove(road);
            if (snowParticles.mesh) scene.remove(snowParticles.mesh);
            for (const house of houses) scene.remove(house.mesh);
            for (const drift of snowdrifts) scene.remove(drift);
            for (const line of roadLines) scene.remove(line);
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

    window.gameInit = function() {
        if (document.getElementById('gameApp')) return;
        if (typeof THREE === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
            script.onload = function() {
                initGame();
            };
            script.onerror = function() {
                if (window.Win) {
                    Win.alert('Ошибка загрузки 3D движка', { title: 'Ошибка' });
                } else {
                    alert('Ошибка загрузки 3D движка');
                }
            };
            document.head.appendChild(script);
        } else {
            initGame();
        }
    };

    console.log('[Game] Приложение готово');

})();