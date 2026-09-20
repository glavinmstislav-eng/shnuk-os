// live-wallpapers.js — живые обои для Shnuk OS

(function() {
    'use strict';

    const STORAGE_KEY = 'shnuk_live_wallpaper';
    const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    const BG_COLOR = 0xcccccc; // серый фон

    let currentType = 'none';
    let container = null;
    let threeLoading = false;
    let threeLoadPromise = null;

    let active = null;

    function log() {
        try { console.log.apply(console, ['[LiveWallpapers]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }
    function warn() {
        try { console.warn.apply(console, ['[LiveWallpapers]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    function getType() {
        try {
            return localStorage.getItem(STORAGE_KEY) || 'none';
        } catch(e) {
            return 'none';
        }
    }

    function setType(type) {
        try { localStorage.setItem(STORAGE_KEY, type); } catch(e) {}
    }

    function loadThree() {
        if (typeof THREE !== 'undefined') return Promise.resolve(true);
        if (threeLoadPromise) return threeLoadPromise;

        threeLoadPromise = new Promise(function(resolve) {
            const script = document.createElement('script');
            script.src = THREE_CDN;
            script.onload = function() { resolve(true); };
            script.onerror = function() { resolve(false); };
            document.head.appendChild(script);
        });
        return threeLoadPromise;
    }

    function ensureContainer() {
        const bg = document.getElementById('appBackground');
        if (!bg) return null;

        let c = document.getElementById('liveWallpaperCanvas');
        if (!c) {
            c = document.createElement('div');
            c.id = 'liveWallpaperCanvas';
            c.style.cssText = `
                position: absolute;
                top: 0; left: 0;
                width: 100%; height: 100%;
                z-index: 1;
                pointer-events: none;
                overflow: hidden;
                background: #cccccc;
            `;
            bg.appendChild(c);
        }
        return c;
    }

    function destroyActive() {
        if (!active) return;
        try { active.destroy(); } catch(e) {}
        active = null;
    }

    // =========================================
    // Общие утилиты
    // =========================================
    function createRenderer(c) {
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(c.clientWidth, c.clientHeight);
        renderer.setClearColor(BG_COLOR, 1);
        c.appendChild(renderer.domElement);
        return renderer;
    }

    function addResizeHandler(renderer, camera, c) {
        function onResize() {
            if (!c || !renderer || !camera) return;
            const w = c.clientWidth;
            const h = c.clientHeight;
            if (w === 0 || h === 0) return;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }
        window.addEventListener('resize', onResize);
        return onResize;
    }

    // =========================================
    // Контурная текстура Земли
    // =========================================
    function createEarthOutlineTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 4096;
        canvas.height = 2048;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.8;
        for (let lon = -180; lon <= 180; lon += 15) {
            const x = (lon + 180) / 360 * canvas.width;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let lat = -75; lat <= 75; lat += 15) {
            const y = (90 - lat) / 180 * canvas.height;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); ctx.stroke();

        function xy(lon, lat) {
            return [(lon + 180) / 360 * canvas.width, (90 - lat) / 180 * canvas.height];
        }
        function poly(points, lw) {
            ctx.beginPath();
            for (let i = 0; i < points.length; i++) {
                const p = xy(points[i][0], points[i][1]);
                if (i === 0) ctx.moveTo(p[0], p[1]);
                else ctx.lineTo(p[0], p[1]);
            }
            ctx.closePath();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = lw || 3;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        poly([
            [-17,15],[-17,30],[10,37],[30,32],[35,30],[50,25],[60,25],[75,20],
            [90,22],[100,15],[105,10],[100,5],[80,8],[73,18],[65,25],[55,25],
            [45,12],[43,12],[43,-1],[40,-10],[35,-20],[32,-26],[28,-34],[20,-35],
            [18,-30],[15,-20],[12,-6],[8,4],[-8,4],[-15,10]
        ], 3);
        poly([
            [-10,36],[-10,44],[-2,48],[3,51],[8,55],[10,58],[15,62],[25,65],
            [35,67],[45,68],[60,70],[90,72],[120,72],[150,72],[180,68],[180,60],
            [160,60],[140,55],[120,52],[100,50],[80,50],[60,50],[40,48],[30,45],
            [25,40],[20,38],[15,40],[10,43],[5,43],[0,42],[-5,40]
        ], 3);
        poly([[68,24],[80,25],[90,22],[95,20],[90,10],[80,8],[75,15],[70,20]], 2.5);
        poly([[95,10],[105,8],[115,0],[130,-3],[140,-5],[150,-7],[140,-8],[130,-6],[120,-3],[110,0],[100,3]], 2.5);
        poly([
            [113,-22],[114,-18],[116,-17],[120,-15],[124,-14],[128,-13],[132,-11],
            [136,-12],[140,-14],[144,-16],[148,-18],[152,-21],[153,-23],[154,-25],
            [152,-29],[150,-33],[147,-37],[143,-38],[139,-37],[135,-35],[131,-33],
            [127,-33],[123,-34],[119,-34],[115,-32],[113,-28],[113,-25]
        ], 3);
        poly([
            [-168,65],[-164,68],[-158,70],[-152,71],[-146,70],[-140,70],[-134,68],
            [-128,68],[-122,69],[-116,70],[-110,70],[-104,68],[-98,68],[-92,65],
            [-86,62],[-80,59],[-74,56],[-68,53],[-62,50],[-56,47],[-52,45],
            [-58,43],[-64,41],[-70,38],[-76,35],[-80,32],[-82,28],[-84,24],
            [-87,20],[-90,18],[-94,21],[-98,23],[-102,26],[-106,29],[-110,32],
            [-114,35],[-118,37],[-122,39],[-126,42],[-130,46],[-134,50],[-138,54],
            [-142,58],[-146,60],[-152,60],[-158,60],[-164,63]
        ], 3);
        poly([[-92,15],[-88,16],[-84,15],[-80,12],[-78,8],[-80,10],[-84,11],[-88,13],[-90,14]], 2);
        poly([
            [-78,8],[-76,10],[-74,11],[-72,11],[-70,12],[-66,11],[-62,11],[-58,9],
            [-54,7],[-50,4],[-46,0],[-42,-2],[-38,-5],[-35,-8],[-38,-12],[-42,-16],
            [-46,-20],[-50,-24],[-54,-28],[-58,-32],[-62,-36],[-66,-40],[-70,-44],
            [-73,-48],[-75,-52],[-74,-54],[-72,-54],[-70,-50],[-68,-46],[-66,-42],
            [-64,-38],[-62,-34],[-60,-30],[-58,-26],[-56,-22],[-54,-18],[-52,-14],
            [-50,-10],[-48,-6],[-46,-2],[-45,0],[-44,2],[-48,4],[-52,6],[-56,8],
            [-60,10],[-64,12],[-68,14],[-72,16],[-76,18],[-80,20],[-84,22],[-88,24],
            [-92,26],[-96,28],[-100,30],[-104,34],[-108,38],[-112,42],[-116,46],
            [-120,50],[-124,54],[-128,58],[-132,62],[-136,66],[-140,70],[-144,74],
            [-148,78],[-152,82],[-156,86],[-160,90]
        ], 3);
        poly([[-52,60],[-56,64],[-58,68],[-56,72],[-50,74],[-42,78],[-34,82],
              [-26,83],[-22,80],[-26,76],[-32,72],[-38,70],[-44,66],[-50,64]], 2.5);
        ctx.beginPath();
        for (let lon = -180, i = 0; lon <= 180; lon += 5, i++) {
            const wobble = Math.sin(lon * 0.15) * 6 + Math.sin(lon * 0.4) * 3;
            const p = xy(lon, -68 + wobble);
            if (i === 0) ctx.moveTo(p[0], p[1]);
            else ctx.lineTo(p[0], p[1]);
        }
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        poly([[43,-12],[46,-18],[49,-24],[50,-26],[48,-30],[45,-34],[43,-28],[42,-22],[42,-16]], 2);
        poly([[-5,50],[-6,52],[-5,54],[-3,56],[-1,58],[-2,59],[-4,57],[-6,55],[-7,53],[-8,52],[-6,50]], 2);
        poly([[-10,51],[-10,53],[-8,55],[-6,54],[-7,52],[-8,51]], 1.8);
        poly([[-24,64],[-22,66],[-18,66],[-14,66],[-13,65],[-17,63],[-21,63],[-23,64]], 2);
        poly([[129,32],[133,35],[136,37],[140,40],[141,42],[139,42],[136,39],[133,36],[130,34]], 2);
        poly([[120,18],[123,15],[125,12],[126,10],[124,8],[121,9],[118,12],[115,16],[113,18],[112,18],[114,16],[117,14],[119,15]], 2);
        poly([[166,-46],[170,-43],[174,-41],[177,-38],[177,-36],[174,-38],[171,-40],[168,-42],[166,-45]], 1.8);
        poly([[168,-47],[172,-45],[174,-44],[171,-46],[168,-47]], 1.8);
        poly([[-85,22],[-79,23],[-75,21],[-74,20],[-78,20],[-82,21],[-85,22]], 1.5);
        poly([[80,9],[82,8],[82,7],[80,7],[80,8]], 1.5);
        poly([[120,25],[122,23],[121,22],[120,23]], 1.3);
        poly([[32,35],[34,35],[33,34],[32,35]], 1.3);
        poly([[24,36],[26,35],[27,35],[26,36],[25,36]], 1.3);
        poly([[9,39],[10,40],[10,41],[9,41],[9,40]], 1.3);
        poly([[9,42],[10,43],[9,43],[8,42]], 1.3);
        poly([[13,37],[15,37],[15,38],[14,38],[13,38]], 1.3);

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 8;
        return tex;
    }

    // Контурные облака — без заливки, только штрихи
    function createCloudsTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Контурные завитки
        for (let i = 0; i < 60; i++) {
            const cx = Math.random() * canvas.width;
            const cy = 50 + Math.random() * (canvas.height - 100);
            const size = 30 + Math.random() * 80;
            const turns = 1.2 + Math.random() * 1.5;
            ctx.beginPath();
            const steps = 200;
            for (let j = 0; j < steps; j++) {
                const t = j / steps;
                const angle = t * Math.PI * 2 * turns;
                const r = size * t;
                const x = cx + Math.cos(angle) * r;
                const y = cy + Math.sin(angle) * r * 0.55;
                if (j === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = 1 + Math.random() * 1.5;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Тонкие штрихи
        for (let i = 0; i < 400; i++) {
            const x = Math.random() * canvas.width;
            const y = 50 + Math.random() * (canvas.height - 100);
            const len = 20 + Math.random() * 60;
            const angle = Math.random() * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
            ctx.strokeStyle = 'rgba(0,0,0,' + (0.1 + Math.random() * 0.2).toFixed(2) + ')';
            ctx.lineWidth = 0.8 + Math.random() * 1;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Мелкие контурные точки (не залитые)
        for (let i = 0; i < 200; i++) {
            const lat = -30 + Math.random() * 60;
            const lon = -180 + Math.random() * 360;
            const x = (lon + 180) / 360 * canvas.width;
            const y = (90 - lat) / 180 * canvas.height;
            const r = 1.5 + Math.random() * 3;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0,0,0,' + (0.15 + Math.random() * 0.2).toFixed(2) + ')';
            ctx.lineWidth = 0.8;
            ctx.stroke();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 8;
        return tex;
    }

    // =========================================
    // ОБОИ 1: Земля
    // =========================================
    function createEarth(c) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(BG_COLOR);

        const camera = new THREE.PerspectiveCamera(45, c.clientWidth / c.clientHeight, 0.1, 2000);
        camera.position.set(0, 0, 3.2);
        camera.lookAt(0, 0, 0);

        const renderer = createRenderer(c);
        scene.add(new THREE.AmbientLight(0xffffff, 1));

        const earthGeo = new THREE.SphereGeometry(1, 96, 96);
        const earthMat = new THREE.MeshBasicMaterial({
            map: createEarthOutlineTexture(),
            transparent: true,
            depthWrite: false,
            side: THREE.FrontSide
        });
        const earth = new THREE.Mesh(earthGeo, earthMat);
        earth.rotation.z = 0.41;
        scene.add(earth);

        const cloudGeo = new THREE.SphereGeometry(1.006, 96, 96);
        const cloudMat = new THREE.MeshBasicMaterial({
            map: createCloudsTexture(),
            transparent: true,
            depthWrite: false,
            opacity: 0.8
        });
        const clouds = new THREE.Mesh(cloudGeo, cloudMat);
        clouds.rotation.z = 0.41;
        scene.add(clouds);

        let raf = null;
        let resizeHandler = addResizeHandler(renderer, camera, c);

        function animate() {
            raf = requestAnimationFrame(animate);
            earth.rotation.y += 0.0008;
            clouds.rotation.y += 0.0012;
            renderer.render(scene, camera);
        }
        animate();

        return {
            destroy: function() {
                if (raf) cancelAnimationFrame(raf);
                window.removeEventListener('resize', resizeHandler);
                renderer.dispose();
                if (renderer.domElement && renderer.domElement.parentNode) {
                    renderer.domElement.parentNode.removeChild(renderer.domElement);
                }
            }
        };
    }

    // =========================================
    // ОБОИ 2: Сатурн (контурный)
    // =========================================
    function createSaturnTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Горизонтальные полосы — только обводки
        for (let i = 0; i < 60; i++) {
            const y = Math.random() * canvas.height;
            const thickness = 0.5 + Math.random() * 2;
            ctx.strokeStyle = 'rgba(0,0,0,' + (0.15 + Math.random() * 0.3).toFixed(2) + ')';
            ctx.lineWidth = thickness;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Волнистые штрихи — только линии
        for (let i = 0; i < 400; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const len = 30 + Math.random() * 100;
            ctx.strokeStyle = 'rgba(0,0,0,' + (0.1 + Math.random() * 0.2).toFixed(2) + ')';
            ctx.lineWidth = 0.5 + Math.random() * 1.5;
            ctx.beginPath();
            ctx.moveTo(x, y);
            const dx = len;
            const dy = (Math.random() - 0.5) * 8;
            ctx.quadraticCurveTo(x + dx * 0.5, y + dy, x + dx, y);
            ctx.stroke();
        }

        // Большое пятно — контурное (эллипс)
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(canvas.width * 0.65, canvas.height * 0.55,
                    140, 60, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(canvas.width * 0.65, canvas.height * 0.55,
                    100, 40, 0, 0, Math.PI * 2);
        ctx.stroke();

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 8;
        return tex;
    }

    function createRingTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Контурные вертикальные полосы
        for (let i = 0; i < 400; i++) {
            const x = Math.random() * canvas.width;
            const w = 0.5 + Math.random() * 3;
            const alpha = 0.15 + Math.random() * 0.5;
            ctx.fillStyle = 'rgba(0,0,0,' + alpha.toFixed(2) + ')';
            ctx.fillRect(x, 0, w, canvas.height);
        }
        for (let i = 0; i < 8; i++) {
            const x = 50 + Math.random() * (canvas.width - 100);
            const w = 5 + Math.random() * 15;
            ctx.clearRect(x, 0, w, canvas.height);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 8;
        return tex;
    }

    function createSaturn(c) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(BG_COLOR);

        const camera = new THREE.PerspectiveCamera(45, c.clientWidth / c.clientHeight, 0.1, 2000);
        camera.position.set(0, 1.2, 3.8);
        camera.lookAt(0, 0, 0);

        const renderer = createRenderer(c);
        scene.add(new THREE.AmbientLight(0xffffff, 1));

        const group = new THREE.Group();
        group.rotation.z = 0.35;
        group.rotation.x = 0.15;

        // Планета — контурная
        const planetGeo = new THREE.SphereGeometry(1, 128, 128);
        const planetMat = new THREE.MeshBasicMaterial({
            map: createSaturnTexture(),
            transparent: true,
            depthWrite: false
        });
        const planet = new THREE.Mesh(planetGeo, planetMat);
        planet.scale.y = 0.92;
        group.add(planet);

        // Кольца — с контурной текстурой
        const ringGeo = new THREE.RingGeometry(1.3, 2.1, 128, 1);
        const ringMat = new THREE.MeshBasicMaterial({
            map: createRingTexture(),
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2;
        group.add(ringMesh);

        // Внешнее тонкое кольцо — контур
        const ring2Geo = new THREE.RingGeometry(2.15, 2.4, 128, 1);
        const ring2Mat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
        ring2.rotation.x = Math.PI / 2;
        group.add(ring2);

        scene.add(group);

        let raf = null;
        let resizeHandler = addResizeHandler(renderer, camera, c);

        function animate() {
            raf = requestAnimationFrame(animate);
            planet.rotation.y += 0.001;
            ringMesh.rotation.z += 0.0002;
            renderer.render(scene, camera);
        }
        animate();

        return {
            destroy: function() {
                if (raf) cancelAnimationFrame(raf);
                window.removeEventListener('resize', resizeHandler);
                renderer.dispose();
                if (renderer.domElement && renderer.domElement.parentNode) {
                    renderer.domElement.parentNode.removeChild(renderer.domElement);
                }
            }
        };
    }

    // =========================================
    // ОБОИ 3: Луна-сыр (контурная)
    // =========================================
    function createCheeseTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        function hole(cx, cy, r, irregular) {
            ctx.beginPath();
            const steps = 24;
            for (let i = 0; i <= steps; i++) {
                const angle = (i / steps) * Math.PI * 2;
                const wobble = irregular ? (0.75 + Math.random() * 0.5) : 1;
                const rr = r * wobble;
                const x = cx + Math.cos(angle) * rr;
                const y = cy + Math.sin(angle) * rr;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2.5;
            ctx.stroke();
        }

        for (let i = 0; i < 20; i++) {
            const cx = 100 + Math.random() * (canvas.width - 200);
            const cy = 100 + Math.random() * (canvas.height - 200);
            const r = 30 + Math.random() * 60;
            hole(cx, cy, r, true);
        }
        for (let i = 0; i < 60; i++) {
            const cx = Math.random() * canvas.width;
            const cy = Math.random() * canvas.height;
            const r = 12 + Math.random() * 25;
            hole(cx, cy, r, true);
        }
        for (let i = 0; i < 200; i++) {
            const cx = Math.random() * canvas.width;
            const cy = Math.random() * canvas.height;
            const r = 3 + Math.random() * 8;
            hole(cx, cy, r, false);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 8;
        return tex;
    }

    function createCheeseMoon(c) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(BG_COLOR);

        const camera = new THREE.PerspectiveCamera(45, c.clientWidth / c.clientHeight, 0.1, 2000);
        camera.position.set(0, 0, 3);
        camera.lookAt(0, 0, 0);

        const renderer = createRenderer(c);
        scene.add(new THREE.AmbientLight(0xffffff, 1));

        const geo = new THREE.SphereGeometry(1, 128, 128);
        const mat = new THREE.MeshBasicMaterial({
            map: createCheeseTexture(),
            transparent: true,
            depthWrite: false
        });
        const moon = new THREE.Mesh(geo, mat);
        scene.add(moon);

        let raf = null;
        let resizeHandler = addResizeHandler(renderer, camera, c);

        function animate() {
            raf = requestAnimationFrame(animate);
            moon.rotation.y += 0.0015;
            moon.rotation.x = Math.sin(Date.now() * 0.0002) * 0.08;
            renderer.render(scene, camera);
        }
        animate();

        return {
            destroy: function() {
                if (raf) cancelAnimationFrame(raf);
                window.removeEventListener('resize', resizeHandler);
                renderer.dispose();
                if (renderer.domElement && renderer.domElement.parentNode) {
                    renderer.domElement.parentNode.removeChild(renderer.domElement);
                }
            }
        };
    }

    // =========================================
    // ОБОИ 4: Реагирующие на касания (контурные)
    // =========================================
    function createTouchWallpaper(c) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(BG_COLOR);

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
        camera.position.set(0, 0, 10);
        camera.lookAt(0, 0, 0);

        const renderer = createRenderer(c);
        const width = c.clientWidth || window.innerWidth;
        const height = c.clientHeight || window.innerHeight;
        renderer.setSize(width, height);

        const COUNT = 60;
        const particles = [];
        const maxSpeed = 0.004;

        const group = new THREE.Group();
        scene.add(group);

        const geomCache = {};
        function getCircleGeom(radius) {
            const key = Math.round(radius * 10);
            if (geomCache[key]) return geomCache[key];
            const segments = 32;
            const geom = new THREE.BufferGeometry();
            const pts = [];
            for (let i = 0; i <= segments; i++) {
                const a = (i / segments) * Math.PI * 2;
                pts.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
            }
            geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            geomCache[key] = geom;
            return geom;
        }

        const mat = new THREE.LineBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.5
        });

        for (let i = 0; i < COUNT; i++) {
            const geom = getCircleGeom(0.02 + Math.random() * 0.03);
            const line = new THREE.Line(geom, mat.clone());
            const x = (Math.random() - 0.5) * 2;
            const y = (Math.random() - 0.5) * 2;
            line.position.set(x, y, 0);
            group.add(line);
            particles.push({
                mesh: line,
                vx: (Math.random() - 0.5) * maxSpeed,
                vy: (Math.random() - 0.5) * maxSpeed,
                pulse: 0
            });
        }

        let touchX = 0;
        let touchY = 0;
        let touchActive = false;
        let touchTimeout = null;

        function onPointerMove(clientX, clientY) {
            const rect = c.getBoundingClientRect();
            const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
            const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
            touchX = nx;
            touchY = ny;
            touchActive = true;
            if (touchTimeout) clearTimeout(touchTimeout);
            touchTimeout = setTimeout(function() { touchActive = false; }, 300);
        }

        function onMouseMove(e) { onPointerMove(e.clientX, e.clientY); }
        function onTouchMove(e) {
            if (e.touches[0]) onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
        }
        function onTouchStart(e) {
            if (e.touches[0]) onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchstart', onTouchStart, { passive: true });

        let raf = null;
        let resizeHandler = addResizeHandler(renderer, camera, c);

        function animate() {
            raf = requestAnimationFrame(animate);

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];

                p.mesh.position.x += p.vx;
                p.mesh.position.y += p.vy;

                if (p.mesh.position.x < -1.05) { p.mesh.position.x = -1.05; p.vx *= -1; }
                if (p.mesh.position.x > 1.05) { p.mesh.position.x = 1.05; p.vx *= -1; }
                if (p.mesh.position.y < -1.05) { p.mesh.position.y = -1.05; p.vy *= -1; }
                if (p.mesh.position.y > 1.05) { p.mesh.position.y = 1.05; p.vy *= -1; }

                if (touchActive) {
                    const dx = p.mesh.position.x - touchX;
                    const dy = p.mesh.position.y - touchY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const influence = 0.5;
                    if (dist < influence) {
                        const force = (1 - dist / influence) * 0.003;
                        p.vx += (dx / (dist + 0.0001)) * force;
                        p.vy += (dy / (dist + 0.0001)) * force;
                        p.pulse = 0.05;
                    }
                }

                const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                if (sp > maxSpeed * 3) {
                    p.vx = (p.vx / sp) * maxSpeed * 3;
                    p.vy = (p.vy / sp) * maxSpeed * 3;
                }

                if (p.pulse > 0) {
                    p.pulse *= 0.94;
                    p.mesh.scale.setScalar(1 + p.pulse * 5);
                    p.mesh.material.opacity = Math.min(1, 0.5 + p.pulse * 10);
                } else {
                    p.mesh.scale.setScalar(1);
                    p.mesh.material.opacity = 0.5;
                }
            }

            renderer.render(scene, camera);
        }
        animate();

        return {
            destroy: function() {
                if (raf) cancelAnimationFrame(raf);
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('touchmove', onTouchMove);
                window.removeEventListener('touchstart', onTouchStart);
                window.removeEventListener('resize', resizeHandler);
                if (touchTimeout) clearTimeout(touchTimeout);
                renderer.dispose();
                if (renderer.domElement && renderer.domElement.parentNode) {
                    renderer.domElement.parentNode.removeChild(renderer.domElement);
                }
            }
        };
    }

    // =========================================
    // Публичный API
    // =========================================
    async function apply(type) {
        const bg = document.getElementById('appBackground');
        if (!bg) return;

        destroyActive();
        container = ensureContainer();
        if (!container) return;

        if (type === 'none') {
            container.style.display = 'none';
            container.innerHTML = '';
            bg.style.backgroundImage = bg.dataset.staticWallpaper ? `url('${bg.dataset.staticWallpaper}')` : bg.style.backgroundImage;
            return;
        }

        bg.style.backgroundImage = 'none';
        container.style.display = 'block';
        container.style.background = '#cccccc';
        container.innerHTML = '';

        const ok = await loadThree();
        if (!ok) {
            warn('Three.js не загрузился');
            return;
        }

        await new Promise(function(r) { setTimeout(r, 50); });

        try {
            if (type === 'earth') {
                active = createEarth(container);
            } else if (type === 'saturn') {
                active = createSaturn(container);
            } else if (type === 'cheese') {
                active = createCheeseMoon(container);
            } else if (type === 'touch') {
                active = createTouchWallpaper(container);
            }
        } catch(e) {
            warn('Ошибка создания обоев:', e);
        }
    }

    function getCurrent() {
        return currentType;
    }

    function setCurrent(type) {
        currentType = type;
        setType(type);
    }

    function destroy() {
        destroyActive();
        const c = document.getElementById('liveWallpaperCanvas');
        if (c && c.parentNode) c.parentNode.removeChild(c);
        container = null;
    }

    function restore() {
        const t = getType();
        if (t && t !== 'none') {
            currentType = t;
            apply(t);
        }
    }

    window.LiveWallpapers = {
        apply: apply,
        restore: restore,
        getCurrent: getCurrent,
        setCurrent: setCurrent,
        destroy: destroy,
        types: [
            { id: 'none', name: 'Обычные' },
            { id: 'earth', name: 'Планета Земля' },
            { id: 'saturn', name: 'Сатурн' },
            { id: 'cheese', name: 'Луна-сыр' },
            { id: 'touch', name: 'Касания' }
        ]
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(restore, 500);
        });
    } else {
        setTimeout(restore, 500);
    }

    log('модуль загружен');

})();