// file2.js — Полный файловый менеджер с 3D просмотром (без Cooop)

(function() {
    'use strict';

    let isOpen = false;
    let allItems = [];
    let currentFolderId = null;
    let sortMode = 'name-asc';
    let previewData = null;
    let filesListenerBound = false;

    let threeScene = null;
    let threeRenderer = null;
    let threeCamera = null;
    let threeObject = null;
    let threeAnimationId = null;
    let threeIsLoading = false;

    let editingFileId = null;

    const SUPPORTED = {
        images: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'],
        videos: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'],
        audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'webm'],
        documents: ['txt', 'json', 'xml', 'html', 'css', 'js', 'md', 'log', 'csv', 'yml', 'yaml', 'ini', 'conf', 'ts', 'jsx', 'tsx', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'sh', 'bat'],
        models: ['obj', 'fbx', 'gltf', 'glb', 'stl', '3ds', 'ply']
    };

    const EDITABLE = ['txt', 'json', 'xml', 'html', 'css', 'js', 'md', 'log', 'csv', 'yml', 'yaml', 'ini', 'conf', 'ts', 'jsx', 'tsx', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'sh', 'bat', 'svg'];

    const JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    let jszipPromise = null;

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    function warn() {
        try { console.warn.apply(console, ['[Files2]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    function hasRootFile() {
        return allItems.some(f => f.parentId === null && !f.isFolder);
    }

    function syncItemsFromStorage() {
        if (!window.SharedFiles) return false;
        try {
            const src = window.SharedFiles.get();
            allItems = Array.isArray(src) ? src.slice() : [];
            return true;
        } catch(e) {
            warn('syncItemsFromStorage:', e);
            return false;
        }
    }

    async function loadAll() {
        if (!window.SharedFiles) return [];
        try {
            if (window.SharedFiles.ready) await window.SharedFiles.ready();
            syncItemsFromStorage();
            let arr = allItems.slice();

            let needMigrate = false;
            arr.forEach(f => {
                if (typeof f.parentId === 'undefined') { f.parentId = null; needMigrate = true; }
                if (typeof f.isFolder === 'undefined') { f.isFolder = false; needMigrate = true; }
            });

            if (needMigrate && window.SharedFiles.set) {
                try {
                    await window.SharedFiles.set(arr);
                    allItems = arr.slice();
                } catch(e) {}
            }
            return arr;
        } catch(e) {
            warn('loadAll:', e);
            return [];
        }
    }

    async function refreshFromStorage() {
        await loadAll();
        rerenderIfMounted();
    }

    function rerenderIfMounted() {
        const el = document.getElementById('fileApp');
        if (el) {
            renderFiles();
            updateStorageInfo();
        }
    }

    async function putItem(item) {
        if (window.SharedFiles && window.SharedFiles.update) {
            const ok = await window.SharedFiles.update(item);
            if (ok) {
                const idx = allItems.findIndex(f => f.id === item.id);
                if (idx !== -1) allItems[idx] = item;
                else allItems.push(item);
            }
            return ok;
        }
        if (!window.OSStorage) return false;
        try {
            await window.OSStorage.files.put(item);
            const idx = allItems.findIndex(f => f.id === item.id);
            if (idx !== -1) allItems[idx] = item;
            else allItems.push(item);
            return true;
        } catch(e) {
            warn('putItem:', e);
            return false;
        }
    }

    async function deleteItem(id) {
        if (window.SharedFiles && window.SharedFiles.remove) {
            const ok = await window.SharedFiles.remove(id);
            if (ok) {
                allItems = allItems.filter(f => f.id !== id);
            }
            return ok;
        }
        if (!window.OSStorage) return false;
        try {
            await window.OSStorage.files.delete(id);
            allItems = allItems.filter(f => f.id !== id);
            return true;
        } catch(e) {
            warn('deleteItem:', e);
            return false;
        }
    }

    async function deleteItemsRecursive(id) {
        const toDelete = [id];
        const collect = function(parentId) {
            allItems.forEach(f => {
                if (f.parentId === parentId) {
                    toDelete.push(f.id);
                    if (f.isFolder) collect(f.id);
                }
            });
        };
        const item = allItems.find(f => f.id === id);
        if (item && item.isFolder) collect(id);

        if (window.SharedFiles && window.SharedFiles.removeMany) {
            await window.SharedFiles.removeMany(toDelete);
        } else {
            for (const delId of toDelete) {
                await deleteItem(delId);
            }
        }
        const delSet = {};
        toDelete.forEach(did => { delSet[did] = true; });
        allItems = allItems.filter(f => !delSet[f.id]);
        return toDelete.length;
    }

    function bindFilesListener() {
        if (filesListenerBound) return;
        filesListenerBound = true;

        window.addEventListener('shnuk:files-changed', function() {
            syncItemsFromStorage();
            const el = document.getElementById('fileApp');
            if (el) {
                renderFiles();
                updateStorageInfo();
            }
        });
    }

    bindFilesListener();

    if (window.SharedFiles && window.SharedFiles.ready) {
        try {
            window.SharedFiles.ready().then(function() {
                syncItemsFromStorage();
            }).catch(function() {});
        } catch(e) {}
    } else {
        syncItemsFromStorage();
    }

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = Math.floor(Math.log(bytes) / Math.log(k));
        if (i < 0) i = 0;
        if (i >= sizes.length) i = sizes.length - 1;
        const v = bytes / Math.pow(k, i);
        let str;
        if (v >= 100) str = v.toFixed(0);
        else if (v >= 10) str = v.toFixed(1);
        else str = v.toFixed(2);
        return str + ' ' + sizes[i];
    }

    function utf8ByteLength(str) {
        if (!str) return 0;
        try {
            return new TextEncoder().encode(str).length;
        } catch(e) {
            let n = 0;
            for (let i = 0; i < str.length; i++) {
                const c = str.charCodeAt(i);
                if (c < 0x80) n += 1;
                else if (c < 0x800) n += 2;
                else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; }
                else n += 3;
            }
            return n;
        }
    }

    async function updateStorageInfo() {
        const el = document.getElementById('fileStorageInfo');
        if (!el) return;

        let usage = 0;
        try {
            if (navigator.storage && navigator.storage.estimate) {
                const est = await navigator.storage.estimate();
                usage = est.usage || 0;
            }
        } catch(e) {}

        if (!usage) {
            let sum = 0;
            allItems.forEach(f => {
                if (f.data) sum += f.data.length;
            });
            usage = sum;
        }

        el.textContent = 'Занято ' + formatBytes(usage);
    }

    function loadJSZip() {
        if (typeof JSZip !== 'undefined') return Promise.resolve(true);
        if (jszipPromise) return jszipPromise;
        jszipPromise = new Promise(function(resolve) {
            const s = document.createElement('script');
            s.src = JSZIP_CDN;
            s.onload = function() { resolve(true); };
            s.onerror = function() { resolve(false); };
            document.head.appendChild(s);
        });
        return jszipPromise;
    }

    function getExt(file) {
        if (!file || !file.name) return '';
        const idx = file.name.lastIndexOf('.');
        if (idx === -1) return '';
        return file.name.substring(idx + 1).toLowerCase();
    }

    function isEditable(file) {
        const ext = getExt(file);
        return EDITABLE.indexOf(ext) !== -1;
    }

    function formatDate(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            const pad = function(n) { return n < 10 ? '0' + n : '' + n; };
            return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
        } catch(e) { return ''; }
    }

    function getFileIcon(item) {
        if (item.isFolder) return 'DIR';
        const ext = getExt(item);
        if (SUPPORTED.images.indexOf(ext) !== -1) return 'IMG';
        if (SUPPORTED.videos.indexOf(ext) !== -1) return 'VID';
        if (SUPPORTED.audio.indexOf(ext) !== -1) return 'AUD';
        if (SUPPORTED.models.indexOf(ext) !== -1) return '3D';
        if (SUPPORTED.documents.indexOf(ext) !== -1) return 'TXT';
        return 'FILE';
    }

    function decodeTextFromData(data) {
        if (!data) return '';
        try {
            if (data.indexOf('data:') !== 0) return data;

            const commaIdx = data.indexOf(',');
            if (commaIdx === -1) return '';

            const header = data.substring(5, commaIdx);
            const body = data.substring(commaIdx + 1);
            const isBase64 = /;\s*base64/i.test(header);
            const lowerHeader = header.toLowerCase();

            let bytes = null;

            if (isBase64) {
                const binary = atob(body);
                bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            } else {
                try {
                    const decoded = decodeURIComponent(body);
                    bytes = new TextEncoder().encode(decoded);
                } catch(e) {
                    bytes = new TextEncoder().encode(body);
                }
            }

            if (!bytes) return '';

            let nullCount = 0;
            const sampleSize = Math.min(bytes.length, 2048);
            for (let i = 0; i < sampleSize; i++) {
                if (bytes[i] === 0) nullCount++;
            }
            const isBinary = sampleSize > 0 && (nullCount / sampleSize) > 0.05;

            if (isBinary) return null;

            let charset = 'utf-8';
            const csMatch = lowerHeader.match(/charset=([^;]+)/);
            if (csMatch) charset = csMatch[1].trim().replace(/['"]/g, '');

            if (charset === 'utf-8' || charset === 'utf8') {
                try {
                    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
                } catch(e) {}
            }

            try {
                return new TextDecoder(charset, { fatal: false }).decode(bytes);
            } catch(e) {}

            if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
                return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(3));
            }

            if (bytes.length >= 2) {
                if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
                    try { return new TextDecoder('utf-16le', { fatal: false }).decode(bytes.subarray(2)); } catch(e) {}
                }
                if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
                    try { return new TextDecoder('utf-16be', { fatal: false }).decode(bytes.subarray(2)); } catch(e) {}
                }
            }

            try {
                return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            } catch(e) {
                try {
                    return new TextDecoder('windows-1251', { fatal: false }).decode(bytes);
                } catch(e2) {
                    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
                }
            }
        } catch(e) {
            return '';
        }
    }

    function encodeTextToDataURL(text, mime) {
        mime = mime || 'text/plain';
        try {
            const bytes = new TextEncoder().encode(text);
            let binary = '';
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            const b64 = btoa(binary);
            return 'data:' + mime + ';charset=utf-8;base64,' + b64;
        } catch(e) {
            return 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(text);
        }
    }

    function dataURLToBlob(dataUrl, mime) {
        try {
            if (dataUrl.indexOf('data:') !== 0) {
                return new Blob([dataUrl], { type: mime || 'application/octet-stream' });
            }
            const commaIdx = dataUrl.indexOf(',');
            const header = dataUrl.substring(5, commaIdx);
            const isBase64 = /;\s*base64/i.test(header);
            const dataPart = dataUrl.substring(commaIdx + 1);
            if (!isBase64) {
                let text = dataPart;
                try { text = decodeURIComponent(dataPart); } catch(e) {}
                return new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
            }
            const binary = atob(dataPart);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new Blob([bytes], { type: mime || 'application/octet-stream' });
        } catch(e) {
            return new Blob([dataUrl], { type: mime || 'application/octet-stream' });
        }
    }

    function getCurrentFolder() {
        if (!currentFolderId) return null;
        return allItems.find(f => f.id === currentFolderId) || null;
    }

    function getBreadcrumbs() {
        const crumbs = [];
        let cur = currentFolderId;
        let safety = 0;
        while (cur && safety < 100) {
            const f = allItems.find(x => x.id === cur);
            if (!f) break;
            crumbs.unshift(f);
            cur = f.parentId;
            safety++;
        }
        return crumbs;
    }

    function getChildren(parentId) {
        return allItems.filter(f => f.parentId === parentId);
    }

    function sortItems(items) {
        const arr = items.slice();
        switch(sortMode) {
            case 'name-asc':
                arr.sort((a, b) => {
                    if (a.isFolder && !b.isFolder) return -1;
                    if (!a.isFolder && b.isFolder) return 1;
                    return (a.name || '').localeCompare(b.name || '', 'ru');
                });
                break;
            case 'name-desc':
                arr.sort((a, b) => {
                    if (a.isFolder && !b.isFolder) return -1;
                    if (!a.isFolder && b.isFolder) return 1;
                    return (b.name || '').localeCompare(a.name || '', 'ru');
                });
                break;
            case 'date-asc':
                arr.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
                break;
            case 'date-desc':
                arr.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
                break;
        }
        return arr;
    }

    function openFiles() {
        syncItemsFromStorage();

        const existing = document.getElementById('fileApp');
        if (existing) {
            existing.style.display = 'flex';
            existing.style.opacity = '1';
            isOpen = true;
            renderFiles();
            updateStorageInfo();
            refreshFromStorage().catch(function() {});
            return;
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
        closeEditor();
        document.removeEventListener('keydown', onKeyDown);
    }

    function destroy() {
        isOpen = false;
        closePreview();
        closeThreeViewer();
        closeEditor();
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
            const text = decodeTextFromData(file.data);
            if (!text) return null;
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
            if (vertices.length > 0 && faces.length > 0) return createModelFromVertices(vertices, faces);
            if (hasValidData) return createPointsFromVertices(vertices);
            return null;
        } catch(e) { return null; }
    }

    function createModelFromVertices(vertices, faces) {
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

    function createDemoModel() {
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
            script.onerror = function() { threeIsLoading = false; const p = container.querySelector('.three-placeholder'); if (p) { p.textContent = 'Ошибка загрузки'; p.style.color = 'var(--accent)'; } };
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
            let model = loadRealModel(file) || createDemoModel();
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
                setTimeout(() => { autoRotate = true; }, 3000);
            });
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
            document.getElementById('fileApp').style.opacity = '1';
            isOpen = true;
            renderFiles();
            updateStorageInfo();
            refreshFromStorage().catch(function() {});
            return;
        }
        isOpen = true;

        const app = document.createElement('div');
        app.id = 'fileApp';
        app.style.cssText = `
            position: fixed;
            top: var(--livebar-h, 44px);
            left: 0;
            width: 100%;
            height: calc(100% - var(--livebar-h, 44px));
            background: var(--bg-primary);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            font-family: 'ST-SimpleSquare', monospace;
            color: var(--text-primary);
            opacity: 0;
            animation: fileFadeIn 0.3s ease forwards;
            transition: background 0.4s ease, color 0.4s ease;
        `;

        if (!document.getElementById('fileStyles')) {
            const style = document.createElement('style');
            style.id = 'fileStyles';
            style.textContent = `
                @keyframes fileFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes fileMenuIn {
                    from { opacity: 0; filter: blur(20px); transform: translateY(-10px) scale(0.95); }
                    to { opacity: 1; filter: blur(0); transform: translateY(0) scale(1); }
                }
                @keyframes fileMenuOut {
                    from { opacity: 1; filter: blur(0); transform: translateY(0) scale(1); }
                    to { opacity: 0; filter: blur(20px); transform: translateY(-10px) scale(0.95); }
                }

                .file-header {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 10px 16px;
                    background: var(--header-bg);
                    border-bottom: 2px solid var(--border-color);
                    flex-shrink: 0;
                    gap: 10px;
                    color: var(--header-text);
                }
                .file-header-left {
                    display: flex; flex-direction: column; gap: 2px;
                    flex: 1; min-width: 0;
                }
                .file-header-left-top {
                    display: flex; align-items: center; gap: 12px;
                }
                .file-header-left h1 { font-size: 18px; font-weight: 600; margin: 0; }
                .file-header-left .file-count { font-size: 12px; color: var(--text-muted); }
                .file-storage-info {
                    font-size: 10px;
                    color: var(--text-muted);
                    letter-spacing: 0.3px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .file-header-actions {
                    display: flex; gap: 8px; align-items: center; flex-shrink: 0;
                }
                .file-sort-select {
                    padding: 8px 10px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 12px;
                    cursor: pointer;
                    outline: none;
                    color: var(--text-primary);
                    transition: border-color 0.2s;
                }
                .file-sort-select:hover { border-color: var(--accent); }
                .file-sort-select:focus { border-color: var(--accent); }

                .file-menu-btn, .file-close-btn {
                    width: 40px; height: 40px;
                    background: var(--bg-primary);
                    border: 2px solid var(--border-color);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-primary);
                    transition: all 0.2s ease;
                    padding: 0;
                    -webkit-tap-highlight-color: transparent;
                    flex-shrink: 0;
                }
                .file-menu-btn:hover { border-color: var(--accent); background: var(--bg-hover); }
                .file-menu-btn:active { transform: scale(0.94); }
                .file-menu-btn svg { display: block; width: 22px; height: 22px; }
                .file-close-btn {
                    border-color: var(--accent);
                    color: var(--accent);
                    font-size: 18px;
                }
                .file-close-btn:hover { background: var(--accent); color: var(--text-on-accent); }

                .file-menu-dropdown {
                    position: absolute;
                    top: 64px;
                    right: 16px;
                    background: var(--bg-primary);
                    border: 2px solid var(--border-color);
                    min-width: 260px;
                    z-index: 100;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.15);
                    padding: 8px;
                    animation: fileMenuIn 0.35s cubic-bezier(0.22, 1, 0.36, 1);
                }
                .file-menu-dropdown.closing {
                    animation: fileMenuOut 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                }
                .file-menu-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    width: 100%;
                    padding: 11px 14px;
                    background: none;
                    border: none;
                    color: var(--text-primary);
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 14px;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    -webkit-tap-highlight-color: transparent;
                }
                .file-menu-item:hover { background: var(--bg-secondary); color: var(--text-primary); }
                .file-menu-item.disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                .file-menu-item.disabled:hover { background: none; color: var(--text-primary); }
                .file-menu-item .mi-icon {
                    width: 18px; height: 18px;
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0; opacity: 0.85;
                }
                .file-menu-item .mi-icon svg { width: 100%; height: 100%; display: block; }
                .file-menu-sep { height: 1px; background: var(--border-color); margin: 6px 8px; }

                .file-breadcrumbs {
                    display: flex; align-items: center; gap: 4px;
                    padding: 10px 16px;
                    background: var(--bg-secondary);
                    border-bottom: 1px solid var(--border-color);
                    font-size: 12px;
                    color: var(--text-secondary);
                    flex-wrap: wrap;
                    flex-shrink: 0;
                }
                .file-breadcrumb-item {
                    background: none;
                    border: none;
                    padding: 4px 8px;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 12px;
                    color: var(--text-primary);
                    transition: color 0.15s;
                    -webkit-tap-highlight-color: transparent;
                }
                .file-breadcrumb-item:hover { color: var(--accent); }
                .file-breadcrumb-item.current { color: var(--accent); font-weight: 600; cursor: default; }
                .file-breadcrumb-sep { color: var(--text-muted); }

                .file-root-warning {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    background: var(--bg-hover);
                    border-bottom: 2px solid var(--accent);
                    font-size: 12px;
                    color: var(--accent);
                    line-height: 1.4;
                    flex-shrink: 0;
                }
                .file-root-warning .warn-icon {
                    width: 20px; height: 20px;
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .file-root-warning .warn-icon svg {
                    width: 100%; height: 100%;
                    stroke: var(--accent);
                }

                .file-content {
                    flex: 1; overflow-y: auto;
                    padding: 20px 24px;
                    position: relative;
                }
                .file-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                    gap: 16px;
                }

                .file-item {
                    background: var(--bg-secondary);
                    border: 2px solid transparent;
                    padding: 14px 12px;
                    text-align: center;
                    cursor: pointer;
                    transition: all 0.2s;
                    position: relative;
                }
                .file-item:hover {
                    border-color: var(--accent);
                    transform: translateY(-2px);
                    background: var(--bg-primary);
                    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
                }
                .file-item:hover .file-delete-btn,
                .file-item:hover .file-rename-btn { opacity: 1; }
                .file-item .file-icon {
                    font-size: 13px; line-height: 1;
                    margin-bottom: 8px; display: block;
                    font-weight: 700;
                    color: var(--accent);
                    letter-spacing: 1px;
                }
                .file-item.folder .file-icon { color: var(--accent); }
                .file-item .file-name {
                    font-size: 11px; color: var(--text-primary);
                    word-break: break-all; line-height: 1.2;
                }
                .file-item .file-size {
                    font-size: 10px; color: var(--text-muted);
                    margin-top: 4px;
                }
                .file-item .file-badge {
                    position: absolute; top: 4px; left: 4px;
                    font-size: 8px;
                    background: var(--text-primary);
                    color: var(--bg-primary);
                    padding: 2px 8px;
                    border-radius: 10px;
                    text-transform: uppercase;
                }
                .file-item .file-badge.folder-badge {
                    background: var(--accent);
                    color: var(--text-on-accent);
                    border-radius: 3px;
                }

                .file-delete-btn {
                    position: absolute; top: -8px; right: -8px;
                    width: 28px; height: 28px;
                    background: var(--accent); color: var(--text-on-accent);
                    border: 2px solid var(--bg-primary);
                    border-radius: 50%;
                    font-size: 16px;
                    line-height: 24px;
                    text-align: center; cursor: pointer;
                    opacity: 0;
                    transition: opacity 0.2s, transform 0.2s;
                    font-family: 'ST-SimpleSquare', monospace;
                    box-shadow: 0 2px 8px rgba(204,0,0,0.3);
                    z-index: 5;
                }
                .file-delete-btn:hover { transform: scale(1.1); background: var(--accent-dark); }

                .file-rename-btn {
                    position: absolute; top: -8px; left: -8px;
                    width: 28px; height: 28px;
                    background: #4488ff; color: #ffffff;
                    border: 2px solid var(--bg-primary);
                    border-radius: 50%;
                    font-size: 14px;
                    line-height: 24px;
                    text-align: center; cursor: pointer;
                    opacity: 0;
                    transition: opacity 0.2s, transform 0.2s;
                    font-family: 'ST-SimpleSquare', monospace;
                    box-shadow: 0 2px 8px rgba(68,136,255,0.3);
                    z-index: 5;
                }
                .file-rename-btn:hover { transform: scale(1.1); background: #2266dd; }

                .empty-folder {
                    grid-column: 1/-1;
                    text-align: center;
                    padding: 80px 20px;
                    color: var(--text-muted);
                    font-size: 16px;
                }
                .empty-folder .icon { font-size: 32px; display: block; margin-bottom: 20px; color: var(--text-muted); }

                .file-preview-overlay {
                    position: fixed;
                    top: var(--livebar-h, 44px); left: 0;
                    width: 100%; height: calc(100% - var(--livebar-h, 44px));
                    background: rgba(0,0,0,0.92);
                    z-index: 100000;
                    display: none;
                    align-items: center;
                    justify-content: center;
                    flex-direction: column;
                }
                .file-preview-overlay.active { display: flex; }
                .preview-top {
                    position: absolute; top: 0; left: 0; right: 0;
                    padding: 16px 24px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
                    z-index: 5;
                }
                .preview-top .preview-name { font-size: 16px; color: #fff; }
                .preview-nav {
                    position: absolute; top: 50%;
                    transform: translateY(-50%);
                    font-size: 36px;
                    color: rgba(255,255,255,0.5);
                    cursor: pointer;
                    padding: 20px 16px;
                    background: none; border: none;
                    font-family: 'ST-SimpleSquare', monospace;
                    z-index: 10;
                }
                .preview-nav:hover { color: #ffffff; background: rgba(255,255,255,0.05); }
                .preview-nav.prev { left: 10px; }
                .preview-nav.next { right: 10px; }

                .preview-content {
                    max-width: 92%; max-height: 65vh;
                    display: flex; align-items: center; justify-content: center;
                    width: 100%; height: 100%;
                }
                .preview-content img,
                .preview-content video { max-width: 100%; max-height: 65vh; object-fit: contain; }
                .preview-content audio { width: 500px; max-width: 90%; }
                .preview-content .three-viewer {
                    width: 100%; height: 60vh;
                    position: relative;
                    background: #0a0a12;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .preview-content .three-viewer .three-placeholder {
                    position: absolute;
                    top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    color: #888; font-size: 18px;
                    text-align: center;
                }
                .preview-content .text-preview {
                    width: 100%; height: 60vh;
                    background: #1a1a1a;
                    color: #e0e0e0;
                    padding: 20px;
                    overflow: auto;
                    font-family: monospace;
                    font-size: 13px;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    box-sizing: border-box;
                    border-radius: 8px;
                }
                .preview-content .binary-notice {
                    color: #888;
                    font-size: 16px;
                    text-align: center;
                    padding: 40px 20px;
                }
                .preview-info {
                    color: #888; font-size: 13px;
                    margin-top: 12px;
                    text-align: center;
                    z-index: 5;
                }

                .preview-bottom {
                    position: absolute; bottom: 0; left: 0; right: 0;
                    padding: 16px 24px 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 12px;
                    background: linear-gradient(to top, rgba(0,0,0,0.85), transparent);
                    z-index: 5;
                }
                .preview-actions-row {
                    display: flex;
                    justify-content: center;
                    gap: 12px;
                    flex-wrap: wrap;
                }
                .preview-actions-row button {
                    padding: 10px 24px;
                    border: 2px solid #444;
                    background: rgba(0,0,0,0.6);
                    color: #ffffff;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 13px;
                    transition: all 0.2s;
                }
                .preview-actions-row button:hover {
                    background: #444;
                    border-color: var(--accent);
                }
                .preview-actions-row button.set-wallpaper {
                    border-color: var(--accent); color: var(--accent);
                }
                .preview-actions-row button.set-wallpaper:hover {
                    background: var(--accent); color: var(--text-on-accent);
                }
                .preview-actions-row button.edit-text {
                    border-color: #4CAF50; color: #4CAF50;
                }
                .preview-actions-row button.edit-text:hover {
                    background: #4CAF50; color: #ffffff;
                }
                .preview-close-bottom {
                    width: 56px; height: 56px;
                    border-radius: 50%;
                    background: var(--accent); color: var(--text-on-accent);
                    border: 2px solid #ffffff;
                    font-size: 26px;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    line-height: 1;
                }
                .preview-close-bottom:hover {
                    background: var(--accent-dark);
                    transform: scale(1.08);
                }

                .file-editor-overlay {
                    position: fixed;
                    top: var(--livebar-h, 44px); left: 0;
                    width: 100%; height: calc(100% - var(--livebar-h, 44px));
                    background: var(--bg-primary);
                    z-index: 100001;
                    display: none;
                    flex-direction: column;
                    font-family: 'ST-SimpleSquare', monospace;
                }
                .file-editor-overlay.active { display: flex; }
                .file-editor-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px;
                    background: var(--header-bg);
                    border-bottom: 2px solid var(--border-color);
                    gap: 10px;
                    flex-shrink: 0;
                    color: var(--header-text);
                }
                .file-editor-header h2 {
                    font-size: 16px;
                    margin: 0;
                    flex: 1;
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .file-editor-actions {
                    display: flex;
                    gap: 8px;
                    flex-shrink: 0;
                }
                .file-editor-actions button {
                    padding: 8px 16px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 13px;
                    color: var(--text-primary);
                    transition: all 0.2s;
                }
                .file-editor-actions button:hover { border-color: var(--accent); }
                .file-editor-actions button.save {
                    background: #4CAF50;
                    border-color: #4CAF50;
                    color: #ffffff;
                }
                .file-editor-actions button.save:hover { background: #3d8b40; }
                .file-editor-textarea {
                    flex: 1;
                    width: 100%;
                    padding: 20px;
                    border: none;
                    outline: none;
                    resize: none;
                    font-family: 'Courier New', monospace;
                    font-size: 13px;
                    line-height: 1.5;
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    box-sizing: border-box;
                    tab-size: 2;
                }

                @media (max-width: 500px) {
                    .file-header { padding: 8px 12px; gap: 6px; }
                    .file-header-left h1 { font-size: 15px; }
                    .file-header-left .file-count { font-size: 11px; }
                    .file-storage-info { font-size: 9px; max-width: 140px; }
                    .file-sort-select { font-size: 11px; padding: 6px 8px; max-width: 110px; }
                    .file-menu-btn, .file-close-btn { width: 34px; height: 34px; }
                    .file-menu-btn svg { width: 18px; height: 18px; }
                    .file-menu-dropdown { top: 56px; right: 10px; min-width: 220px; }
                    .file-breadcrumbs { padding: 8px 12px; font-size: 11px; }
                    .file-root-warning { padding: 10px 12px; font-size: 11px; gap: 8px; }
                    .file-root-warning .warn-icon { width: 16px; height: 16px; }
                    .file-content { padding: 12px 16px; }
                    .file-grid { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px; }
                    .file-item { padding: 10px 8px; }
                    .file-item .file-icon { font-size: 11px; }
                    .file-item .file-name { font-size: 10px; }
                    .file-delete-btn { width: 24px; height: 24px; font-size: 14px; line-height: 20px; top: -6px; right: -6px; }
                    .file-rename-btn { width: 24px; height: 24px; font-size: 12px; line-height: 20px; top: -6px; left: -6px; }
                    .preview-nav { font-size: 24px; padding: 12px; }
                    .preview-actions-row { flex-wrap: wrap; gap: 6px; }
                    .preview-actions-row button { font-size: 11px; padding: 6px 14px; }
                    .preview-content .three-viewer { height: 50vh; }
                    .preview-content .text-preview { height: 50vh; padding: 14px; font-size: 12px; }
                    .file-editor-textarea { padding: 14px; font-size: 12px; }
                }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'file-header';
        header.innerHTML = `
            <div class="file-header-left">
                <div class="file-header-left-top">
                    <h1>Файлы</h1>
                    <span class="file-count" id="fileCount">0</span>
                </div>
                <div class="file-storage-info" id="fileStorageInfo"></div>
            </div>
            <div class="file-header-actions">
                <select class="file-sort-select" id="fileSortSelect" title="Сортировка">
                    <option value="name-asc">Имя A→Z</option>
                    <option value="name-desc">Имя Z→A</option>
                    <option value="date-desc">Новые сначала</option>
                    <option value="date-asc">Старые сначала</option>
                </select>
                <button class="file-menu-btn" id="fileMenuBtn" title="Меню">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="4" y1="7" x2="20" y2="7"/>
                        <line x1="4" y1="12" x2="20" y2="12"/>
                        <line x1="4" y1="17" x2="20" y2="17"/>
                    </svg>
                </button>
                <button class="file-close-btn" id="fileCloseBtn" title="Закрыть">✕</button>
            </div>
        `;

        const breadcrumbs = document.createElement('div');
        breadcrumbs.className = 'file-breadcrumbs';
        breadcrumbs.id = 'fileBreadcrumbs';

        const rootWarning = document.createElement('div');
        rootWarning.className = 'file-root-warning';
        rootWarning.id = 'fileRootWarning';
        rootWarning.style.display = 'none';
        rootWarning.innerHTML = `
            <span class="warn-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
            </span>
            <span>Сначала загрузите хотя бы один файл в корневую папку — без этого создавать папки нельзя.</span>
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

        const editor = document.createElement('div');
        editor.className = 'file-editor-overlay';
        editor.id = 'fileEditor';
        editor.innerHTML = `
            <div class="file-editor-header">
                <h2 id="fileEditorName">Редактор</h2>
                <div class="file-editor-actions">
                    <button id="fileEditorCancel">Отмена</button>
                    <button class="save" id="fileEditorSave">Сохранить</button>
                </div>
            </div>
            <textarea class="file-editor-textarea" id="fileEditorText" spellcheck="false"></textarea>
        `;

        app.appendChild(header);
        app.appendChild(breadcrumbs);
        app.appendChild(rootWarning);
        app.appendChild(content);
        app.appendChild(preview);
        app.appendChild(editor);
        document.body.appendChild(app);

        document.getElementById('fileCloseBtn').addEventListener('click', closeFiles);

        document.getElementById('fileSortSelect').addEventListener('change', function() {
            sortMode = this.value;
            renderFiles();
        });
        document.getElementById('fileSortSelect').value = sortMode;

        document.getElementById('fileMenuBtn').addEventListener('click', function(e) {
            e.stopPropagation();
            toggleMenu();
        });

        document.getElementById('previewClose').addEventListener('click', closePreview);
        document.getElementById('previewPrev').addEventListener('click', () => navigatePreview(-1));
        document.getElementById('previewNext').addEventListener('click', () => navigatePreview(1));

        document.getElementById('fileEditorCancel').addEventListener('click', closeEditor);
        document.getElementById('fileEditorSave').addEventListener('click', saveEditor);

        document.addEventListener('click', function(e) {
            if (isMenuOpen && menuDropdown) {
                if (!menuDropdown.contains(e.target) && !e.target.closest('#fileMenuBtn')) {
                    closeMenu();
                }
            }
        });

        document.addEventListener('keydown', onKeyDown);

        syncItemsFromStorage();
        renderFiles();
        updateStorageInfo();
        refreshFromStorage().catch(function() {});

        setInterval(function() {
            if (document.getElementById('fileApp')) updateStorageInfo();
        }, 5000);
    }

    let menuDropdown = null;
    let isMenuOpen = false;

    function toggleMenu() {
        if (isMenuOpen) closeMenu();
        else openMenu();
    }

    function openMenu() {
        if (isMenuOpen) return;
        isMenuOpen = true;

        const canCreateFolder = hasRootFile();

        menuDropdown = document.createElement('div');
        menuDropdown.className = 'file-menu-dropdown';
        menuDropdown.id = 'fileMenuDropdown';

        const items = [
            {
                id: 'download-all',
                label: 'Скачать все данные (ZIP)',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
            },
            {
                id: 'zip-current',
                label: 'ZIP из текущей папки',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>'
            },
            { sep: true },
            {
                id: 'upload-file',
                label: 'Загрузить файл',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
            },
            {
                id: 'upload-multiple',
                label: 'Выбрать файлы',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>'
            },
            { sep: true },
            {
                id: 'new-folder',
                label: 'Создать папку',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
                disabled: !canCreateFolder
            }
        ];

        items.forEach(item => {
            if (item.sep) {
                const sep = document.createElement('div');
                sep.className = 'file-menu-sep';
                menuDropdown.appendChild(sep);
                return;
            }
            const btn = document.createElement('button');
            btn.className = 'file-menu-item' + (item.disabled ? ' disabled' : '');
            btn.innerHTML = `
                <span class="mi-icon">${item.icon}</span>
                <span>${item.label}</span>
            `;
            btn.addEventListener('click', function() {
                if (item.disabled) {
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Сначала загрузите файл в корень', { type: 'error', duration: 3000 });
                    }
                    closeMenu();
                    return;
                }
                closeMenu();
                handleMenuAction(item.id);
            });
            menuDropdown.appendChild(btn);
        });

        const app = document.getElementById('fileApp');
        if (app) app.appendChild(menuDropdown);
    }

    function closeMenu() {
        if (!isMenuOpen) return;
        isMenuOpen = false;
        if (!menuDropdown) return;
        const m = menuDropdown;
        menuDropdown = null;
        m.classList.add('closing');
        setTimeout(() => {
            if (m.parentNode) m.parentNode.removeChild(m);
        }, 280);
    }

    function handleMenuAction(id) {
        if (id === 'download-all') downloadAllAsZip();
        else if (id === 'zip-current') downloadCurrentFolderAsZip();
        else if (id === 'upload-file') uploadFiles(false);
        else if (id === 'upload-multiple') uploadFiles(true);
        else if (id === 'new-folder') createFolderPrompt();
    }

    async function createFolderPrompt() {
        if (!hasRootFile()) {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Сначала загрузите файл в корень', { type: 'error', duration: 3000 });
            }
            return;
        }

        let name = 'Новая папка';
        if (window.Win && window.Win.prompt) {
            const res = await window.Win.prompt('Название папки', 'Новая папка', { title: 'Создать папку', okText: 'Создать' });
            if (res === null || res === undefined) return;
            name = (res || '').trim();
        } else {
            const res = window.prompt('Название папки', 'Новая папка');
            if (res === null) return;
            name = (res || '').trim();
        }
        if (!name) return;

        const item = {
            id: 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
            name: name,
            isFolder: true,
            parentId: currentFolderId,
            date: new Date().toISOString(),
            size: 0,
            type: 'folder',
            data: '',
            extension: ''
        };

        const ok = await putItem(item);
        if (ok) {
            renderFiles();
            updateStorageInfo();
            if (window.Win && window.Win.notify) {
                window.Win.notify('Папка создана', { type: 'success' });
            }
        } else {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Не удалось создать папку', { type: 'error' });
            }
        }
    }

    async function renameItemPrompt(item) {
        let newName = item.name;
        if (window.Win && window.Win.prompt) {
            const res = await window.Win.prompt('Новое имя', item.name, { title: 'Переименовать', okText: 'Сохранить' });
            if (res === null || res === undefined) return;
            newName = (res || '').trim();
        } else {
            const res = window.prompt('Новое имя', item.name);
            if (res === null) return;
            newName = (res || '').trim();
        }
        if (!newName || newName === item.name) return;

        const updated = Object.assign({}, item, {
            name: newName,
            date: new Date().toISOString()
        });
        const ok = await putItem(updated);
        if (ok) {
            renderFiles();
            updateStorageInfo();
        }
    }

    function requestFullscreenSafe() {
        if (document.fullscreenElement || document.webkitFullscreenElement) return;
        const el = document.documentElement;
        try {
            if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        } catch(e) {}
    }

    function uploadFiles(multiple) {
        requestFullscreenSafe();
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = !!multiple;
        input.accept = '*/*';
        input.style.display = 'none';
        input.onchange = function() {
            if (this.files.length > 0) saveFiles(this.files);
        };
        document.body.appendChild(input);
        input.click();
        setTimeout(() => input.remove(), 1000);
    }

    function saveFiles(fileList) {
        const arr = Array.from(fileList);
        if (arr.length === 0) return;

        let index = 0;
        let savedCount = 0;
        const targetParent = currentFolderId;

        function processNext() {
            if (index >= arr.length) {
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
                    extension: file.name.split('.').pop().toLowerCase(),
                    parentId: targetParent,
                    isFolder: false
                };
                if (window.SharedFiles) {
                    window.SharedFiles.add(fileData).then(function(ok) {
                        if (ok) savedCount++;
                        setTimeout(processNext, 10);
                    }).catch(function() {
                        setTimeout(processNext, 10);
                    });
                } else {
                    setTimeout(processNext, 10);
                }
            };
            reader.onerror = function() {
                setTimeout(processNext, 10);
            };
            reader.readAsDataURL(file);
        }

        processNext();
    }

    async function deleteItemById(id) {
        const item = allItems.find(f => f.id === id);
        if (!item) return;

        let confirmed = true;
        if (window.Win && window.Win.confirm) {
            confirmed = await window.Win.confirm(
                item.isFolder ? 'Удалить папку и всё её содержимое?' : 'Удалить файл?',
                { title: 'Удаление', okText: 'Удалить', cancelText: 'Отмена', danger: true }
            );
        } else {
            confirmed = window.confirm(item.isFolder ? 'Удалить папку и всё её содержимое?' : 'Удалить файл?');
        }
        if (!confirmed) return;

        await deleteItemsRecursive(id);
        renderFiles();
        updateStorageInfo();
        if (previewData && previewData.file.id === id) closePreview();
    }

    function renderBreadcrumbs() {
        const el = document.getElementById('fileBreadcrumbs');
        if (!el) return;
        el.innerHTML = '';

        const rootBtn = document.createElement('button');
        rootBtn.className = 'file-breadcrumb-item' + (currentFolderId === null ? ' current' : '');
        rootBtn.textContent = 'Корень';
        if (currentFolderId !== null) {
            rootBtn.addEventListener('click', function() {
                currentFolderId = null;
                renderFiles();
            });
        }
        el.appendChild(rootBtn);

        const crumbs = getBreadcrumbs();
        crumbs.forEach((c, idx) => {
            const sep = document.createElement('span');
            sep.className = 'file-breadcrumb-sep';
            sep.textContent = '/';
            el.appendChild(sep);

            const btn = document.createElement('button');
            const isLast = idx === crumbs.length - 1;
            btn.className = 'file-breadcrumb-item' + (isLast ? ' current' : '');
            btn.textContent = c.name;
            if (!isLast) {
                btn.addEventListener('click', function() {
                    currentFolderId = c.id;
                    renderFiles();
                });
            }
            el.appendChild(btn);
        });
    }

    function updateRootWarning() {
        const el = document.getElementById('fileRootWarning');
        if (!el) return;
        if (hasRootFile()) {
            el.style.display = 'none';
        } else {
            el.style.display = 'flex';
        }
    }

    function renderFiles() {
        const content = document.getElementById('fileContent');
        const fileCount = document.getElementById('fileCount');
        if (!content) return;

        renderBreadcrumbs();
        updateRootWarning();

        const children = getChildren(currentFolderId);
        const sorted = sortItems(children);

        if (fileCount) fileCount.textContent = sorted.length;

        if (sorted.length === 0) {
            content.innerHTML = `
                <div class="empty-folder">
                    <span class="icon">DIR</span>
                    Папка пуста
                    <div style="font-size:13px;color:var(--text-muted);margin-top:8px;">Откройте меню → «Загрузить файл»</div>
                </div>
            `;
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'file-grid';

        sorted.forEach(item => {
            const el = document.createElement('div');
            el.className = 'file-item' + (item.isFolder ? ' folder' : '');

            const icon = getFileIcon(item);
            const isFolder = item.isFolder;
            const size = isFolder ? '' : formatBytes(item.size);
            const dateStr = formatDate(item.date);
            const ext = getExt(item);
            const isModel = !isFolder && SUPPORTED.models.indexOf(ext) !== -1;
            const isImage = !isFolder && SUPPORTED.images.indexOf(ext) !== -1;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'file-delete-btn';
            deleteBtn.textContent = '✕';
            deleteBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                deleteItemById(item.id);
            });

            const renameBtn = document.createElement('button');
            renameBtn.className = 'file-rename-btn';
            renameBtn.textContent = '✎';
            renameBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                renameItemPrompt(item);
            });

            let badge = '';
            if (isFolder) badge = '<span class="file-badge folder-badge">ПАПКА</span>';
            else if (isModel) badge = '<span class="file-badge">3D</span>';
            else if (isImage) badge = '<span class="file-badge">IMG</span>';

            el.innerHTML = `
                ${badge}
                <span class="file-icon">${icon}</span>
                <div class="file-name">${escapeHtml(item.name)}</div>
                <div class="file-size">${size}${size && dateStr ? ' • ' : ''}${dateStr}</div>
            `;
            el.appendChild(deleteBtn);
            el.appendChild(renameBtn);

            el.addEventListener('click', function() {
                if (isFolder) {
                    currentFolderId = item.id;
                    renderFiles();
                } else {
                    openFile(item);
                }
            });

            grid.appendChild(el);
        });

        content.innerHTML = '';
        content.appendChild(grid);
    }

    function openFile(file) {
        const ext = getExt(file);
        if (SUPPORTED.images.indexOf(ext) !== -1) { openPreview(file, 'image'); return; }
        if (SUPPORTED.videos.indexOf(ext) !== -1) { openPreview(file, 'video'); return; }
        if (SUPPORTED.audio.indexOf(ext) !== -1) { openPreview(file, 'audio'); return; }
        if (SUPPORTED.models.indexOf(ext) !== -1) { openPreview(file, 'model'); return; }
        openPreview(file, 'text');
    }

    function openPreview(file, type) {
        closeThreeViewer();

        const preview = document.getElementById('filePreview');
        const content = document.getElementById('previewContent');
        const info = document.getElementById('previewInfo');
        const actions = document.getElementById('previewActions');
        const nameEl = document.getElementById('previewName');

        previewData = { file, type };

        const navigable = allItems.filter(f => {
            if (f.parentId !== file.parentId || f.isFolder) return false;
            const e = getExt(f);
            return SUPPORTED.images.indexOf(e) !== -1 || SUPPORTED.videos.indexOf(e) !== -1 || SUPPORTED.models.indexOf(e) !== -1;
        });
        document.getElementById('previewPrev').style.display = navigable.length > 1 ? 'block' : 'none';
        document.getElementById('previewNext').style.display = navigable.length > 1 ? 'block' : 'none';

        nameEl.textContent = file.name;

        let html = '';
        if (type === 'image') {
            html = `<img src="${file.data}" alt="${escapeHtml(file.name)}" />`;
        } else if (type === 'video') {
            html = `<video controls autoplay><source src="${file.data}" type="${file.type}"></video>`;
        } else if (type === 'audio') {
            html = `<audio controls autoplay><source src="${file.data}" type="${file.type}"></audio>`;
        } else if (type === 'model') {
            html = `<div class="three-viewer" id="threeViewer"><div class="three-placeholder">Загрузка 3D...</div></div>`;
        } else if (type === 'text') {
            const text = decodeTextFromData(file.data);
            if (text === null) {
                html = `<div class="text-preview"><div class="binary-notice">Бинарный файл. Просмотр недоступен.</div></div>`;
            } else {
                html = `<div class="text-preview">${escapeHtml(text) || '(пусто)'}</div>`;
            }
        }

        content.innerHTML = html;
        info.textContent = `${formatBytes(file.size)} • ${new Date(file.date).toLocaleString('ru-RU')}`;

        const isImage = SUPPORTED.images.indexOf(getExt(file)) !== -1;
        const isModel = SUPPORTED.models.indexOf(getExt(file)) !== -1;
        const canEdit = isEditable(file);

        actions.innerHTML = `
            ${isImage ? `<button class="set-wallpaper" data-file-id="${file.id}">Установить как обои</button>` : ''}
            ${isModel ? `<button class="reset-view" id="resetViewBtn">Сброс вида</button>` : ''}
            ${canEdit ? `<button class="edit-text" data-file-id="${file.id}">Редактировать</button>` : ''}
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
                else if (this.classList.contains('edit-text')) openEditor(fileId);
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
        if (!previewData) return;
        const file = previewData.file;
        const navigable = allItems.filter(f => {
            if (f.parentId !== file.parentId || f.isFolder) return false;
            const e = getExt(f);
            return SUPPORTED.images.indexOf(e) !== -1 || SUPPORTED.videos.indexOf(e) !== -1 || SUPPORTED.models.indexOf(e) !== -1;
        });
        if (navigable.length < 2) return;
        let index = navigable.findIndex(f => f.id === file.id);
        if (index === -1) index = 0;
        index = (index + direction + navigable.length) % navigable.length;
        const next = navigable[index];
        const e = getExt(next);
        let type = 'image';
        if (SUPPORTED.videos.indexOf(e) !== -1) type = 'video';
        else if (SUPPORTED.models.indexOf(e) !== -1) type = 'model';
        openPreview(next, type);
    }

    function openEditor(fileId) {
        const file = allItems.find(f => f.id === fileId);
        if (!file) return;
        editingFileId = fileId;
        const editor = document.getElementById('fileEditor');
        const nameEl = document.getElementById('fileEditorName');
        const textarea = document.getElementById('fileEditorText');
        if (nameEl) nameEl.textContent = file.name;
        if (textarea) {
            const decoded = decodeTextFromData(file.data);
            textarea.value = decoded === null ? '' : decoded;
        }
        if (editor) editor.classList.add('active');
        setTimeout(function() {
            if (textarea) {
                textarea.focus();
                textarea.setSelectionRange(0, 0);
            }
        }, 100);
    }

    function closeEditor() {
        editingFileId = null;
        const editor = document.getElementById('fileEditor');
        if (editor) editor.classList.remove('active');
    }

    async function saveEditor() {
        if (!editingFileId) return;
        const file = allItems.find(f => f.id === editingFileId);
        if (!file) { closeEditor(); return; }

        const textarea = document.getElementById('fileEditorText');
        if (!textarea) return;
        const text = textarea.value;

        const ext = getExt(file);
        let mime = 'text/plain';
        if (ext === 'json') mime = 'application/json';
        else if (ext === 'html' || ext === 'htm') mime = 'text/html';
        else if (ext === 'css') mime = 'text/css';
        else if (ext === 'js') mime = 'application/javascript';
        else if (ext === 'svg') mime = 'image/svg+xml';
        else if (ext === 'xml') mime = 'application/xml';
        else if (ext === 'csv') mime = 'text/csv';
        else if (ext === 'md') mime = 'text/markdown';

        const dataUrl = encodeTextToDataURL(text, mime);
        const updated = Object.assign({}, file, {
            data: dataUrl,
            size: utf8ByteLength(text),
            date: new Date().toISOString()
        });

        const ok = await putItem(updated);
        if (ok) {
            closeEditor();
            closePreview();
            renderFiles();
            updateStorageInfo();
            if (window.Win && window.Win.notify) {
                window.Win.notify('Файл сохранён', { type: 'success' });
            }
        } else {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Ошибка сохранения', { type: 'error' });
            }
        }
    }

    function safeName(name) {
        return (name || 'item').replace(/[\\/:*?"<>|]/g, '_');
    }

    async function downloadAllAsZip() {
        try {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Собираю архив...', { type: 'info', duration: 2000 });
            }
            const ok = await loadJSZip();
            if (!ok) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Не удалось загрузить JSZip', { type: 'error' });
                }
                return;
            }
            const zip = new JSZip();
            const root = zip.folder('shnuk_files');

            function addItems(items, parentZipFolder, parentId) {
                const children = items.filter(f => f.parentId === parentId);
                children.forEach(item => {
                    if (item.isFolder) {
                        const folder = parentZipFolder.folder(safeName(item.name));
                        addItems(items, folder, item.id);
                    } else {
                        const blob = dataURLToBlob(item.data, item.type);
                        parentZipFolder.file(safeName(item.name), blob);
                    }
                });
            }

            addItems(allItems, root, null);

            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'shnuk_files_' + Date.now() + '.zip';
            document.body.appendChild(a);
            a.click();
            setTimeout(function() {
                URL.revokeObjectURL(url);
                if (a.parentNode) a.parentNode.removeChild(a);
            }, 1000);

            if (window.Win && window.Win.notify) {
                window.Win.notify('Архив скачан', { type: 'success' });
            }
        } catch(e) {
            warn('downloadAllAsZip:', e);
            if (window.Win && window.Win.notify) {
                window.Win.notify('Ошибка создания архива', { type: 'error' });
            }
        }
    }

    async function downloadCurrentFolderAsZip() {
        try {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Собираю архив...', { type: 'info', duration: 2000 });
            }
            const folder = getCurrentFolder();
            const rootName = folder ? safeName(folder.name) : 'shnuk_root';

            const ok = await loadJSZip();
            if (!ok) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Не удалось загрузить JSZip', { type: 'error' });
                }
                return;
            }

            const zip = new JSZip();
            const root = zip.folder(rootName);

            function addItems(items, parentZipFolder, parentId) {
                const children = items.filter(f => f.parentId === parentId);
                children.forEach(item => {
                    if (item.isFolder) {
                        const f = parentZipFolder.folder(safeName(item.name));
                        addItems(items, f, item.id);
                    } else {
                        const blob = dataURLToBlob(item.data, item.type);
                        parentZipFolder.file(safeName(item.name), blob);
                    }
                });
            }

            if (currentFolderId === null) {
                addItems(allItems, root, null);
            } else {
                addItems(allItems, root, currentFolderId);
            }

            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = rootName + '_' + Date.now() + '.zip';
            document.body.appendChild(a);
            a.click();
            setTimeout(function() {
                URL.revokeObjectURL(url);
                if (a.parentNode) a.parentNode.removeChild(a);
            }, 1000);

            if (window.Win && window.Win.notify) {
                window.Win.notify('Архив скачан', { type: 'success' });
            }
        } catch(e) {
            warn('downloadCurrentFolderAsZip:', e);
            if (window.Win && window.Win.notify) {
                window.Win.notify('Ошибка создания архива', { type: 'error' });
            }
        }
    }

    function setWallpaperFromFile(fileId) {
        const file = allItems.find(f => f.id === fileId);
        if (!file) { alert('Файл не найден'); return; }
        const ext = getExt(file);
        if (SUPPORTED.images.indexOf(ext) === -1) { alert('Это не изображение'); return; }

        if (confirm(`Установить "${file.name}" как обои?`)) {
            try {
                localStorage.setItem('app_wallpaper', file.data);
                localStorage.setItem('shnuk_wallpaper', file.data);
                localStorage.setItem('shnuk_wallpaper_name', file.name);
                localStorage.setItem('shnuk_live_wallpaper', 'none');

                const bg = document.getElementById('appBackground');
                if (bg) {
                    bg.dataset.staticWallpaper = file.data;
                    bg.style.backgroundImage = 'url(\'' + file.data + '\')';
                }
                window.dispatchEvent(new CustomEvent('shnuk:wallpaper-changed', { detail: { url: file.data } }));
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Обои установлены', { type: 'success' });
                }
                closePreview();
            } catch(e) {
                alert('Ошибка установки обоев: ' + e.message);
            }
        }
    }

    function downloadFile(fileId) {
        const file = allItems.find(f => f.id === fileId);
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
        deleteItemById(fileId);
        closePreview();
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') {
            const editor = document.getElementById('fileEditor');
            if (editor && editor.classList.contains('active')) { closeEditor(); return; }
            const prev = document.getElementById('filePreview');
            if (prev && prev.classList.contains('active')) { closePreview(); return; }
            if (isMenuOpen) { closeMenu(); return; }
            closeFiles();
        }
    }

    window.FileApp = {
        destroy: destroy,
        openByName: function(name) {
            if (!name) return;
            const f = allItems.find(x => x.name === name && !x.isFolder);
            if (f) openFile(f);
        }
    };
    window.file2Init = function() { openFiles(); };

})();