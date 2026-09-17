// file.js — Полный файловый менеджер с 3D просмотром и шарингом через Cooop

(function() {
    'use strict';

    let isOpen = false;
    let files = [];
    let previewData = null;
    let threeScene = null;
    let threeRenderer = null;
    let threeCamera = null;
    let threeObject = null;
    let threeAnimationId = null;
    let threeIsLoading = false;
    let filesListenerBound = false;

    const SUPPORTED = {
        images: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'],
        videos: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'],
        audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'webm'],
        documents: ['txt', 'json', 'xml', 'html', 'css', 'js', 'md'],
        models: ['obj', 'fbx', 'gltf', 'glb', 'stl', '3ds', 'ply']
    };

    function refreshFromStorage() {
        if (!window.SharedFiles) {
            files = [];
            if (isOpen) renderFiles();
            return;
        }
        files = window.SharedFiles.get();
        if (isOpen) renderFiles();
    }

    function bindFilesListener() {
        if (filesListenerBound) return;
        filesListenerBound = true;
        window.addEventListener('shnuk:files-changed', function() {
            files = window.SharedFiles ? window.SharedFiles.get() : [];
            if (isOpen) renderFiles();
        });
    }

    bindFilesListener();

    function openFiles() {
        if (isOpen) {
            const existing = document.getElementById('fileApp');
            if (existing) {
                existing.style.display = 'flex';
                return;
            }
        }
        createUI();
    }

    function closeFiles() {
        isOpen = false;
        const el = document.getElementById('fileApp');
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => {
                el.style.display = 'none';
                el.style.opacity = '1';
            }, 300);
        }
        closePreview();
        closeThreeViewer();
        document.removeEventListener('keydown', onKeyDown);
    }

    function destroy() {
        isOpen = false;
        closePreview();
        closeThreeViewer();
        document.removeEventListener('keydown', onKeyDown);
        const el = document.getElementById('fileApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function closeThreeViewer() {
        if (threeAnimationId) {
            cancelAnimationFrame(threeAnimationId);
            threeAnimationId = null;
        }
        if (threeRenderer) {
            threeRenderer.dispose();
            if (threeRenderer.domElement && threeRenderer.domElement.parentNode) {
                threeRenderer.domElement.parentNode.removeChild(threeRenderer.domElement);
            }
            threeRenderer = null;
        }
        threeScene = null;
        threeCamera = null;
        threeObject = null;
        threeIsLoading = false;
    }

    function loadRealModel(file) {
        try {
            if (!file.data) return null;
            let text = '';
            try {
                if (file.data.startsWith('data:')) {
                    const commaIdx = file.data.indexOf(',');
                    const base64 = commaIdx !== -1 ? file.data.slice(commaIdx + 1) : '';
                    if (base64) {
                        const binary = atob(base64);
                        const bytes = new Uint8Array(binary.length);
                        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                        try {
                            text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
                        } catch(e) {
                            text = binary;
                        }
                    }
                } else {
                    text = file.data;
                }
            } catch(e) { return null; }

            const lines = text.split('\n');
            const vertices = [];
            const faces = [];
            let hasValidData = false;

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('v ')) {
                    const parts = trimmed.split(/\s+/).filter(s => s && s !== 'v');
                    if (parts.length >= 3) {
                        vertices.push([parseFloat(parts[0]) || 0, parseFloat(parts[1]) || 0, parseFloat(parts[2]) || 0]);
                        hasValidData = true;
                    }
                } else if (trimmed.startsWith('f ')) {
                    const parts = trimmed.split(/\s+/).filter(s => s && s !== 'f');
                    if (parts.length >= 3) {
                        const indices = parts.map(p => {
                            const idx = parseInt(p.split('/')[0]);
                            return isNaN(idx) ? -1 : idx - 1;
                        });
                        if (indices.every(i => i >= 0 && i < vertices.length)) {
                            faces.push(indices);
                            hasValidData = true;
                        }
                    }
                }
            }

            if (vertices.length > 0 && faces.length > 0) return createModelFromVertices(vertices, faces, file.name);
            if (hasValidData) return createPointsFromVertices(vertices);
            return null;
        } catch(e) { return null; }
    }

    function createModelFromVertices(vertices, faces, name) {
        try {
            const geometry = new THREE.BufferGeometry();
            const positions = [];
            const indices = [];
            for (const v of vertices) positions.push(v[0], v[1], v[2]);
            for (const f of faces) {
                if (f.length === 3) indices.push(f[0], f[1], f[2]);
                else if (f.length === 4) { indices.push(f[0], f[1], f[2]); indices.push(f[0], f[2], f[3]); }
            }
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setIndex(indices);
            geometry.computeVertexNormals();

            const box = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position'));
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
                const scale = 2 / maxDim;
                const pos = geometry.getAttribute('position');
                for (let i = 0; i < pos.count; i++) {
                    pos.setXYZ(i, (pos.getX(i) - center.x) * scale, (pos.getY(i) - center.y) * scale, (pos.getZ(i) - center.z) * scale);
                }
            }

            const material = new THREE.MeshStandardMaterial({
                color: 0xcc0000, roughness: 0.3, metalness: 0.6,
                emissive: 0x440000, emissiveIntensity: 0.1, side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true; mesh.receiveShadow = true;

            const edges = new THREE.EdgesGeometry(geometry);
            const lineMat = new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.15 });
            mesh.add(new THREE.LineSegments(edges, lineMat));
            return mesh;
        } catch(e) { return null; }
    }

    function createPointsFromVertices(vertices) {
        try {
            const geometry = new THREE.BufferGeometry();
            const positions = [];
            for (const v of vertices) positions.push(v[0], v[1], v[2]);
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            const material = new THREE.PointsMaterial({ color: 0xcc0000, size: 0.03, sizeAttenuation: true });
            return new THREE.Points(geometry, material);
        } catch(e) { return null; }
    }

    function createDemoModel(file) {
        try {
            const group = new THREE.Group();
            const torus = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.25, 16, 32), new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.2, metalness: 0.8 }));
            torus.rotation.x = Math.PI / 2; torus.castShadow = true; group.add(torus);
            const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 24), new THREE.MeshStandardMaterial({ color: 0x4488ff, transparent: true, opacity: 0.6 }));
            sphere.castShadow = true; group.add(sphere);
            const box = new THREE.Box3().setFromObject(group);
            group.position.sub(box.getCenter(new THREE.Vector3()));
            return group;
        } catch(e) {
            const geo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
            const mat = new THREE.MeshStandardMaterial({ color: 0xcc0000 });
            return new THREE.Mesh(geo, mat);
        }
    }

    function initThreeViewer(container, file) {
        if (typeof THREE === 'undefined') {
            if (threeIsLoading) return;
            threeIsLoading = true;
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
            script.onload = function() { threeIsLoading = false; initThreeScene(container, file); };
            script.onerror = function() { threeIsLoading = false; const p = container.querySelector('.three-placeholder'); if (p) { p.textContent = 'Ошибка загрузки'; p.style.color = '#cc0000'; } };
            document.head.appendChild(script);
            return;
        }
        initThreeScene(container, file);
    }

    function initThreeScene(container, file) {
        try {
            closeThreeViewer();
            const width = container.clientWidth || 600;
            const height = container.clientHeight || 400;

            threeScene = new THREE.Scene();
            threeScene.background = new THREE.Color(0x0a0a12);

            threeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
            threeCamera.position.set(3.5, 2.5, 5);
            threeCamera.lookAt(0, 0, 0);

            threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            threeRenderer.setSize(width, height);
            threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            threeRenderer.shadowMap.enabled = true;
            container.appendChild(threeRenderer.domElement);

            threeScene.add(new THREE.AmbientLight(0x404060, 0.5));
            const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
            dirLight.position.set(5, 10, 7);
            threeScene.add(dirLight);
            threeScene.add(new THREE.HemisphereLight(0x4488ff, 0x444422, 0.4));

            const gridHelper = new THREE.GridHelper(8, 8, 0x444466, 0x222244);
            gridHelper.position.y = -0.5;
            threeScene.add(gridHelper);

            let model = loadRealModel(file) || createDemoModel(file);
            if (model) { threeObject = model; threeScene.add(model); }

            const placeholder = container.querySelector('.three-placeholder');
            if (placeholder) {
                placeholder.textContent = 'Готово';
                placeholder.style.color = '#4CAF50';
                setTimeout(() => { if (placeholder && placeholder.parentNode) placeholder.remove(); }, 800);
            }

            let isDragging = false;
            let prevMouse = { x: 0, y: 0 };
            let rotation = { x: 0, y: 0 };
            let autoRotate = true;
            let autoRotateTimer = null;

            const dom = threeRenderer.domElement;
            dom.addEventListener('mousedown', (e) => { isDragging = true; autoRotate = false; prevMouse = { x: e.clientX, y: e.clientY }; });
            document.addEventListener('mousemove', (e) => {
                if (!isDragging || !threeObject) return;
                rotation.y += (e.clientX - prevMouse.x) * 0.01;
                rotation.x += (e.clientY - prevMouse.y) * 0.01;
                prevMouse = { x: e.clientX, y: e.clientY };
                threeObject.rotation.x = rotation.x;
                threeObject.rotation.y = rotation.y;
            });
            document.addEventListener('mouseup', () => {
                isDragging = false;
                autoRotateTimer = setTimeout(() => { autoRotate = true; }, 3000);
            });

            let touchStart = { x: 0, y: 0 };
            let touchDist = 0;
            dom.addEventListener('touchstart', (e) => {
                const t = e.touches[0];
                if (t) { touchStart = { x: t.clientX, y: t.clientY }; isDragging = true; autoRotate = false; }
                if (e.touches.length === 2) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    touchDist = Math.sqrt(dx*dx + dy*dy);
                }
            }, { passive: true });

            dom.addEventListener('touchmove', (e) => {
                e.preventDefault();
                const t = e.touches[0];
                if (!t) return;
                if (e.touches.length === 2 && threeCamera) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    const delta = touchDist - dist;
                    touchDist = dist;
                    const pos = threeCamera.position;
                    const cur = Math.sqrt(pos.x*pos.x + pos.y*pos.y + pos.z*pos.z);
                    const nd = Math.max(1, Math.min(15, cur + delta * 0.02));
                    const r = nd / cur;
                    pos.x *= r; pos.y *= r; pos.z *= r;
                    threeCamera.lookAt(0, 0, 0);
                    return;
                }
                if (!isDragging || !threeObject) return;
                rotation.y += (t.clientX - touchStart.x) * 0.01;
                rotation.x += (t.clientY - touchStart.y) * 0.01;
                touchStart = { x: t.clientX, y: t.clientY };
                threeObject.rotation.x = rotation.x;
                threeObject.rotation.y = rotation.y;
            }, { passive: false });

            dom.addEventListener('touchend', () => {
                isDragging = false;
                autoRotateTimer = setTimeout(() => { autoRotate = true; }, 3000);
            }, { passive: true });

            function animate() {
                threeAnimationId = requestAnimationFrame(animate);
                if (autoRotate && threeObject) threeObject.rotation.y += 0.005;
                if (threeRenderer && threeScene && threeCamera) threeRenderer.render(threeScene, threeCamera);
            }
            animate();
        } catch(e) {}
    }

    function resetThreeView() {
        if (threeCamera) { threeCamera.position.set(3.5, 2.5, 5); threeCamera.lookAt(0, 0, 0); }
        if (threeObject) { threeObject.rotation.x = 0; threeObject.rotation.y = 0; }
    }

    function createUI() {
        if (document.getElementById('fileApp')) {
            document.getElementById('fileApp').style.display = 'flex';
            return;
        }

        isOpen = true;
        refreshFromStorage();

        const app = document.createElement('div');
        app.id = 'fileApp';
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
            animation: fileFadeIn 0.3s ease forwards;
        `;

        if (!document.getElementById('fileStyles')) {
            const style = document.createElement('style');
            style.id = 'fileStyles';
            style.textContent = `
                @keyframes fileFadeIn { from { opacity: 0; } to { opacity: 1; } }
                .file-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: #f5f5f5; border-bottom: 2px solid #e0e0e0; flex-shrink: 0; }
                .file-header-left { display: flex; align-items: center; gap: 16px; }
                .file-header-left h1 { font-size: 20px; font-weight: 600; margin: 0; }
                .file-header-left .file-count { font-size: 13px; color: #888; }
                .file-header-actions { display: flex; gap: 8px; align-items: center; }
                .file-header-actions button { background: none; border: 2px solid #e0e0e0; color: #333; padding: 8px 16px; cursor: pointer; font-family: 'ST-SimpleSquare', monospace; font-size: 13px; transition: all 0.2s; }
                .file-header-actions button:hover { background: #e0e0e0; border-color: #cc0000; }
                .file-header-actions .close-btn { border-color: #cc0000; color: #cc0000; font-size: 18px; padding: 4px 12px; }
                .file-header-actions .close-btn:hover { background: #cc0000; color: #fff; }
                .file-header-actions .upload-btn { border-color: #4CAF50; color: #4CAF50; }
                .file-header-actions .upload-btn:hover { background: #4CAF50; color: #fff; }

                .file-content { flex: 1; overflow-y: auto; padding: 20px 24px; }
                .file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 16px; }

                .file-item { background: #f5f5f5; border: 2px solid transparent; padding: 14px 12px; text-align: center; cursor: pointer; transition: all 0.2s; position: relative; }
                .file-item:hover { border-color: #cc0000; transform: translateY(-2px); background: #ffffff; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
                .file-item:hover .file-delete-btn { opacity: 1; }
                .file-item .file-icon { font-size: 44px; line-height: 1; margin-bottom: 8px; display: block; }
                .file-item .file-name { font-size: 11px; color: #333; word-break: break-all; line-height: 1.2; }
                .file-item .file-size { font-size: 10px; color: #888; margin-top: 4px; }
                .file-item .file-badge { position: absolute; top: 4px; left: 4px; font-size: 8px; background: rgba(0,0,0,0.6); color: #fff; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; }

                .file-delete-btn { position: absolute; top: -8px; right: -8px; width: 28px; height: 28px; background: #cc0000; color: #ffffff; border: 2px solid #ffffff; border-radius: 50%; font-size: 16px; line-height: 24px; text-align: center; cursor: pointer; opacity: 0; transition: opacity 0.2s, transform 0.2s; font-family: 'ST-SimpleSquare', monospace; box-shadow: 0 2px 8px rgba(204,0,0,0.3); z-index: 5; }
                .file-delete-btn:hover { transform: scale(1.1); background: #990000; }

                .empty-folder { grid-column: 1/-1; text-align: center; padding: 80px 20px; color: #999; font-size: 16px; }
                .empty-folder .icon { font-size: 64px; display: block; margin-bottom: 20px; }

                .file-preview-overlay { position: fixed; top: var(--livebar-h, 44px); left: 0; width: 100%; height: calc(100% - var(--livebar-h, 44px)); background: rgba(0,0,0,0.92); z-index: 100000; display: none; align-items: center; justify-content: center; flex-direction: column; }
                .file-preview-overlay.active { display: flex; }
                .file-preview-overlay .preview-top { position: absolute; top: 0; left: 0; right: 0; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent); z-index: 5; }
                .file-preview-overlay .preview-top .preview-name { font-size: 16px; color: #fff; }
                .file-preview-overlay .preview-nav { position: absolute; top: 50%; transform: translateY(-50%); font-size: 36px; color: rgba(255,255,255,0.5); cursor: pointer; padding: 20px 16px; background: none; border: none; font-family: 'ST-SimpleSquare', monospace; z-index: 10; }
                .file-preview-overlay .preview-nav:hover { color: #ffffff; background: rgba(255,255,255,0.05); }
                .file-preview-overlay .preview-nav.prev { left: 10px; }
                .file-preview-overlay .preview-nav.next { right: 10px; }

                .file-preview-overlay .preview-content { max-width: 92%; max-height: 65vh; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
                .file-preview-overlay .preview-content img,
                .file-preview-overlay .preview-content video { max-width: 100%; max-height: 65vh; object-fit: contain; }
                .file-preview-overlay .preview-content audio { width: 500px; max-width: 90%; }
                .file-preview-overlay .preview-content .three-viewer { width: 100%; height: 60vh; position: relative; background: #0a0a12; border-radius: 8px; overflow: hidden; }
                .file-preview-overlay .preview-content .three-viewer .three-placeholder { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #888; font-size: 18px; text-align: center; }
                .file-preview-overlay .preview-info { color: #888; font-size: 13px; margin-top: 12px; text-align: center; z-index: 5; }

                .file-preview-overlay .preview-bottom { position: absolute; bottom: 0; left: 0; right: 0; padding: 16px 24px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px; background: linear-gradient(to top, rgba(0,0,0,0.85), transparent); z-index: 5; }
                .file-preview-overlay .preview-actions-row { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
                .file-preview-overlay .preview-actions-row button { padding: 10px 24px; border: 2px solid #444; background: rgba(0,0,0,0.6); color: #ffffff; cursor: pointer; font-family: 'ST-SimpleSquare', monospace; font-size: 13px; transition: all 0.2s; }
                .file-preview-overlay .preview-actions-row button:hover { background: #444; border-color: #cc0000; }
                .file-preview-overlay .preview-actions-row button.set-wallpaper { border-color: #cc0000; color: #cc0000; }
                .file-preview-overlay .preview-actions-row button.set-wallpaper:hover { background: #cc0000; color: #ffffff; }
                .file-preview-overlay .preview-actions-row button.share-cooop { border-color: #4488ff; color: #4488ff; }
                .file-preview-overlay .preview-actions-row button.share-cooop:hover { background: #4488ff; color: #ffffff; }
                .file-preview-overlay .preview-close-bottom { width: 56px; height: 56px; border-radius: 50%; background: #cc0000; color: #ffffff; border: 2px solid #ffffff; font-size: 26px; cursor: pointer; font-family: 'ST-SimpleSquare', monospace; display: flex; align-items: center; justify-content: center; transition: all 0.2s; line-height: 1; }
                .file-preview-overlay .preview-close-bottom:hover { background: #990000; transform: scale(1.08); }

                @media (max-width: 500px) {
                    .file-header { padding: 12px 16px; flex-wrap: wrap; gap: 8px; }
                    .file-header-left h1 { font-size: 16px; }
                    .file-header-actions button { font-size: 11px; padding: 4px 10px; }
                    .file-content { padding: 12px 16px; }
                    .file-grid { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px; }
                    .file-item { padding: 10px 8px; }
                    .file-item .file-icon { font-size: 32px; }
                    .file-item .file-name { font-size: 10px; }
                    .file-delete-btn { width: 24px; height: 24px; font-size: 14px; line-height: 20px; top: -6px; right: -6px; }
                    .file-preview-overlay .preview-nav { font-size: 24px; padding: 12px; }
                    .file-preview-overlay .preview-actions-row { flex-wrap: wrap; gap: 6px; }
                    .file-preview-overlay .preview-actions-row button { font-size: 11px; padding: 6px 14px; }
                    .file-preview-overlay .preview-content .three-viewer { height: 50vh; }
                }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'file-header';
        header.innerHTML = `
            <div class="file-header-left">
                <h1>Файлы</h1>
                <span class="file-count" id="fileCount">0</span>
            </div>
            <div class="file-header-actions">
                <button class="upload-btn" id="uploadBtn">Загрузить</button>
                <button class="close-btn" id="fileCloseBtn">✕</button>
            </div>
        `;

        const content = document.createElement('div');
        content.className = 'file-content';
        content.id = 'fileContent';

        const preview = document.createElement('div');
        preview.className = 'file-preview-overlay';
        preview.id = 'filePreview';
        preview.innerHTML = `
            <div class="preview-top">
                <span class="preview-name" id="previewName"></span>
            </div>
            <button class="preview-nav prev" id="previewPrev">‹</button>
            <button class="preview-nav next" id="previewNext">›</button>
            <div class="preview-content" id="previewContent"></div>
            <div class="preview-info" id="previewInfo"></div>
            <div class="preview-bottom">
                <div class="preview-actions-row" id="previewActions"></div>
                <button class="preview-close-bottom" id="previewClose">✕</button>
            </div>
        `;

        app.appendChild(header);
        app.appendChild(content);
        app.appendChild(preview);
        document.body.appendChild(app);

        renderFiles();

        document.getElementById('fileCloseBtn').addEventListener('click', closeFiles);
        document.getElementById('uploadBtn').addEventListener('click', uploadFiles);
        document.getElementById('previewClose').addEventListener('click', closePreview);
        document.getElementById('previewPrev').addEventListener('click', () => navigatePreview(-1));
        document.getElementById('previewNext').addEventListener('click', () => navigatePreview(1));

        app.addEventListener('dragover', (e) => { e.preventDefault(); app.style.border = '3px solid #cc0000'; });
        app.addEventListener('dragleave', () => { app.style.border = 'none'; });
        app.addEventListener('drop', (e) => {
            e.preventDefault();
            app.style.border = 'none';
            if (e.dataTransfer.files.length > 0) saveFiles(e.dataTransfer.files);
        });

        document.addEventListener('keydown', onKeyDown);
    }

    function saveFiles(fileList) {
        const arr = Array.from(fileList);
        if (arr.length === 0) return;

        let index = 0;
        let savedCount = 0;

        function processNext() {
            if (index >= arr.length) {
                refreshFromStorage();
                if (window.Win && window.Win.notify && savedCount > 0) {
                    window.Win.notify('Загружено файлов: ' + savedCount, { type: 'success' });
                }
                return;
            }
            const file = arr[index];
            index++;
            const reader = new FileReader();
            reader.onload = function(e) {
                const fileData = {
                    id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
                    name: file.name,
                    size: file.size,
                    type: file.type || 'application/octet-stream',
                    data: e.target.result,
                    date: new Date().toISOString(),
                    extension: file.name.split('.').pop().toLowerCase()
                };
                if (window.SharedFiles) {
                    const ok = window.SharedFiles.add(fileData);
                    if (ok) savedCount++;
                    else if (window.Win && window.Win.notify) {
                        window.Win.notify('Не удалось сохранить: ' + file.name, { type: 'error' });
                    }
                }
                setTimeout(processNext, 10);
            };
            reader.onerror = function() {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Ошибка чтения: ' + file.name, { type: 'error' });
                }
                setTimeout(processNext, 10);
            };
            reader.readAsDataURL(file);
        }

        processNext();
    }

    function requestFullscreenSafe() {
        if (document.fullscreenElement || document.webkitFullscreenElement) return;
        const el = document.documentElement;
        try {
            if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        } catch(e) {}
    }

    function uploadFiles() {
        requestFullscreenSafe();
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '*/*';
        input.style.display = 'none';
        input.onchange = function() {
            if (this.files.length > 0) saveFiles(this.files);
        };
        document.body.appendChild(input);
        input.click();
        setTimeout(() => input.remove(), 1000);
    }

    function deleteFile(fileId) {
        if (!confirm('Удалить файл?')) return;
        if (window.SharedFiles && typeof window.SharedFiles.remove === 'function') {
            window.SharedFiles.remove(fileId);
        } else {
            files = files.filter(f => f.id !== fileId);
            try { localStorage.setItem('shnuk_files', JSON.stringify(files)); } catch(e) {}
        }
        refreshFromStorage();
        if (previewData && previewData.file.id === fileId) closePreview();
    }

    function renderFiles() {
        const content = document.getElementById('fileContent');
        const fileCount = document.getElementById('fileCount');
        if (!content) return;

        if (fileCount) fileCount.textContent = files.length;

        if (files.length === 0) {
            content.innerHTML = `
                <div class="empty-folder">
                    <span class="icon">Ы</span>
                    Нет файлов
                    <div style="font-size:13px;color:#bbb;margin-top:8px;">Нажмите "Загрузить" или перетащите файлы</div>
                </div>
            `;
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'file-grid';

        const sorted = [...files].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        sorted.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-item';

            const icon = getFileIcon(file);
            const size = formatSize(file.size);
            const ext = file.extension || file.name.split('.').pop().toLowerCase();
            const isModel = SUPPORTED.models.includes(ext);
            const isImage = SUPPORTED.images.includes(ext);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'file-delete-btn';
            deleteBtn.textContent = '✕';
            deleteBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                deleteFile(file.id);
            });

            let badge = '';
            if (isModel) badge = '3D';
            else if (isImage) badge = 'IMG';

            item.innerHTML = `
                <span class="file-icon">${icon}</span>
                ${badge ? `<span class="file-badge">${badge}</span>` : ''}
                <div class="file-name">${file.name}</div>
                <div class="file-size">${size}</div>
            `;
            item.appendChild(deleteBtn);
            item.addEventListener('click', () => openFile(file));
            grid.appendChild(item);
        });

        content.innerHTML = '';
        content.appendChild(grid);
    }

    function getFileIcon(file) {
        const ext = file.extension || file.name.split('.').pop().toLowerCase();
        if (SUPPORTED.images.includes(ext)) return '🖼';
        if (SUPPORTED.videos.includes(ext)) return '🎬';
        if (SUPPORTED.audio.includes(ext)) return '🎵';
        if (SUPPORTED.models.includes(ext)) return '📐';
        if (SUPPORTED.documents.includes(ext)) return '📄';
        return '📎';
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function openFile(file) {
        const ext = file.extension || file.name.split('.').pop().toLowerCase();
        if (SUPPORTED.images.includes(ext)) { openPreview(file, 'image'); return; }
        if (SUPPORTED.videos.includes(ext)) { openPreview(file, 'video'); return; }
        if (SUPPORTED.audio.includes(ext)) { openPreview(file, 'audio'); return; }
        if (SUPPORTED.models.includes(ext)) { openPreview(file, 'model'); return; }
        if (SUPPORTED.documents.includes(ext)) { openText(file); return; }
        alert('Этот тип файла не поддерживается');
    }

    function openPreview(file, type) {
        closeThreeViewer();

        const preview = document.getElementById('filePreview');
        const content = document.getElementById('previewContent');
        const info = document.getElementById('previewInfo');
        const actions = document.getElementById('previewActions');
        const nameEl = document.getElementById('previewName');

        previewData = { file, type };

        const mediaFiles = files.filter(f => {
            const e = f.extension || f.name.split('.').pop().toLowerCase();
            return SUPPORTED.images.includes(e) || SUPPORTED.videos.includes(e) || SUPPORTED.models.includes(e);
        });
        document.getElementById('previewPrev').style.display = mediaFiles.length > 1 ? 'block' : 'none';
        document.getElementById('previewNext').style.display = mediaFiles.length > 1 ? 'block' : 'none';

        nameEl.textContent = file.name;

        let html = '';
        if (type === 'image') html = `<img src="${file.data}" alt="${file.name}" />`;
        else if (type === 'video') html = `<video controls autoplay><source src="${file.data}" type="${file.type}"></video>`;
        else if (type === 'audio') html = `<audio controls autoplay><source src="${file.data}" type="${file.type}"></audio>`;
        else if (type === 'model') html = `<div class="three-viewer" id="threeViewer"><div class="three-placeholder">Загрузка 3D...</div></div>`;

        content.innerHTML = html;
        info.textContent = `${formatSize(file.size)} • ${new Date(file.date).toLocaleString('ru-RU')}`;

        const isImage = SUPPORTED.images.includes(file.extension || file.name.split('.').pop().toLowerCase());
        const isModel = SUPPORTED.models.includes(file.extension || file.name.split('.').pop().toLowerCase());

        actions.innerHTML = `
            ${isImage ? `<button class="set-wallpaper" data-file-id="${file.id}">Установить как обои</button>` : ''}
            ${isModel ? `<button class="reset-view" id="resetViewBtn">⟲ Сброс вида</button>` : ''}
            <button data-file-id="${file.id}" class="share-cooop">Поделиться через Cooop</button>
            <button data-file-id="${file.id}" class="download-btn">Скачать</button>
            <button data-file-id="${file.id}" class="delete-btn">Удалить</button>
        `;

        actions.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', function() {
                const fileId = this.dataset.fileId;
                if (this.classList.contains('set-wallpaper')) setWallpaperFromFile(fileId);
                else if (this.classList.contains('download-btn')) downloadFile(fileId);
                else if (this.classList.contains('delete-btn')) deleteFileFromPreview(fileId);
                else if (this.id === 'resetViewBtn') resetThreeView();
                else if (this.classList.contains('share-cooop')) shareViaCooop(fileId);
            });
        });

        preview.classList.add('active');

        if (type === 'model') {
            setTimeout(() => {
                const viewer = document.getElementById('threeViewer');
                if (viewer) initThreeViewer(viewer, file);
            }, 300);
        }
    }

    function closePreview() {
        const el = document.getElementById('filePreview');
        if (el) el.classList.remove('active');
        previewData = null;
        closeThreeViewer();
    }

    function navigatePreview(direction) {
        const mediaFiles = files.filter(f => {
            const e = f.extension || f.name.split('.').pop().toLowerCase();
            return SUPPORTED.images.includes(e) || SUPPORTED.videos.includes(e) || SUPPORTED.models.includes(e);
        });
        if (mediaFiles.length < 2) return;

        let index = mediaFiles.findIndex(f => f.id === previewData?.file?.id);
        if (index === -1) index = 0;
        index = (index + direction + mediaFiles.length) % mediaFiles.length;
        const file = mediaFiles[index];
        const e = file.extension || file.name.split('.').pop().toLowerCase();
        let type = 'image';
        if (SUPPORTED.videos.includes(e)) type = 'video';
        else if (SUPPORTED.models.includes(e)) type = 'model';
        openPreview(file, type);
    }

    function openText(file) {
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed; top: var(--livebar-h, 44px); left: 0;
            width: 100%; height: calc(100% - var(--livebar-h, 44px));
            background: #ffffff; z-index: 100000; display: flex; flex-direction: column;
            padding: 40px; font-family: 'ST-SimpleSquare', monospace; color: #1a1a1a;
            box-sizing: border-box;
        `;

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:16px;padding-bottom:16px;border-bottom:2px solid #e0e0e0;';
        header.innerHTML = `
            <span style="color:#333;font-size:14px;">${file.name}</span>
            <button style="background:none;border:none;color:#333;font-size:24px;cursor:pointer;font-family:'ST-SimpleSquare',monospace;">✕</button>
        `;
        header.querySelector('button').onclick = () => container.remove();

        const content = document.createElement('pre');
        content.style.cssText = `flex:1;background:#f5f5f5;padding:20px;color:#333;overflow:auto;font-size:14px;border:2px solid #e0e0e0;white-space:pre-wrap;word-wrap:break-word;`;

        try {
            let text = '';
            if (file.data && file.data.indexOf('data:') === 0) {
                const commaIdx = file.data.indexOf(',');
                const base64 = commaIdx !== -1 ? file.data.slice(commaIdx + 1) : '';
                if (base64) {
                    const binary = atob(base64);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                        bytes[i] = binary.charCodeAt(i);
                    }
                    try {
                        text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
                    } catch(e) {
                        text = binary;
                    }
                }
            } else if (file.data) {
                text = file.data;
            }
            content.textContent = text || 'Файл пуст';
        } catch(e) {
            content.textContent = 'Не удалось прочитать';
        }

        container.appendChild(header);
        container.appendChild(content);
        document.body.appendChild(container);

        const onEsc = function(e) {
            if (e.key === 'Escape') {
                container.remove();
                document.removeEventListener('keydown', onEsc);
            }
        };
        document.addEventListener('keydown', onEsc);
    }

    function setWallpaperFromFile(fileId) {
        const file = files.find(f => f.id === fileId);
        if (!file) { alert('Файл не найден'); return; }
        const ext = file.extension || file.name.split('.').pop().toLowerCase();
        if (!SUPPORTED.images.includes(ext)) { alert('Это не изображение'); return; }

        if (confirm(`Установить "${file.name}" как обои?`)) {
            try {
                localStorage.setItem('app_wallpaper', file.data);
                localStorage.setItem('shnuk_wallpaper', file.data);
                localStorage.setItem('shnuk_wallpaper_name', file.name);

                const bg = document.getElementById('appBackground');
                if (bg) bg.style.backgroundImage = 'url(\'' + file.data + '\')';

                window.dispatchEvent(new CustomEvent('shnuk:wallpaper-changed', { detail: { url: file.data } }));

                if (window.Win && window.Win.notify) {
                    window.Win.notify('Обои установлены', { type: 'success' });
                } else {
                    alert('Обои установлены!');
                }
                closePreview();
            } catch(e) {
                alert('Ошибка установки обоев: ' + e.message);
            }
        }
    }

    async function shareViaCooop(fileId) {
        const file = files.find(f => f.id === fileId);
        if (!file) { alert('Файл не найден'); return; }

        if (!window.Cooop || typeof window.Cooop.shareFile !== 'function') {
            alert('Cooop недоступен');
            return;
        }

        let url = null;
        try {
            url = await window.Cooop.shareFile({
                name: file.name,
                type: file.type,
                size: file.size,
                extension: file.extension,
                data: file.data
            });
        } catch(e) {
            alert('Ошибка публикации: ' + (e.message || ''));
            return;
        }

        if (!url) return;

        try {
            const ta = document.createElement('textarea');
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        } catch(e) {
            if (navigator.clipboard) {
                try { navigator.clipboard.writeText(url); } catch(e) {}
            }
        }

        if (window.Win && window.Win.confirm) {
            Win.confirm('Файл опубликован. Ссылка скопирована:\n\n' + url, {
                title: 'Cooop',
                okText: 'Открыть в Cooop',
                cancelText: 'Закрыть'
            }).then(function(ok) {
                if (ok && window.Cooop && window.Cooop.open) {
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Ссылка скопирована', { type: 'success' });
                    }
                    window.Cooop.open();
                }
            });
        } else {
            alert('Файл опубликован. Ссылка скопирована:\n\n' + url);
        }
    }

    function downloadFile(fileId) {
        const file = files.find(f => f.id === fileId);
        if (!file) { alert('Файл не найден'); return; }
        try {
            const a = document.createElement('a');
            a.href = file.data;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => document.body.removeChild(a), 100);
        } catch(e) { alert('Ошибка скачивания'); }
    }

    function deleteFileFromPreview(fileId) {
        deleteFile(fileId);
        closePreview();
    }

    window.setWallpaperFromFile = setWallpaperFromFile;
    window.downloadFile = downloadFile;
    window.deleteFileFromPreview = deleteFileFromPreview;
    window.shareViaCooop = shareViaCooop;

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') {
            const prev = document.getElementById('filePreview');
            if (prev && prev.classList.contains('active')) closePreview();
            else closeFiles();
        }
    }

    window.FileApp = {
        destroy: destroy,
        openByName: function(name) {
            if (!name) return;
            const f = files.find(x => x.name === name);
            if (f) openFile(f);
        }
    };
    window.fileInit = function() { openFiles(); };

})();