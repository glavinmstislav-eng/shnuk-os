// file.js — Файловый менеджер с просмотром, редактором, ZIP, буфером обмена и медиаплеерами

(function() {
    'use strict';

    let isOpen = false;
    let allItems = [];
    let currentFolderId = null;
    let sortMode = 'name-asc';
    let previewData = null;
    let filesListenerBound = false;

    let editingFileId = null;

    let clipboard = null;
    let selectedItemId = null;

    const FONT_MAIN = "'TTPaplane', monospace";

    const SUPPORTED = {
        images: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'],
        videos: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'],
        audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'webm'],
        documents: ['txt', 'json', 'xml', 'html', 'css', 'js', 'md', 'log', 'csv', 'yml', 'yaml', 'ini', 'conf', 'ts', 'jsx', 'tsx', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'sh', 'bat']
    };

    const EDITABLE = ['txt', 'json', 'xml', 'html', 'css', 'js', 'md', 'log', 'csv', 'yml', 'yaml', 'ini', 'conf', 'ts', 'jsx', 'tsx', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'sh', 'bat', 'svg'];

    // Архивы, которые можно распаковать и просмотреть
    const SUPPORTED_ARCHIVES = ['zip'];
    // Все форматы архивов (включая неподдерживаемые для просмотра)
    const ARCHIVE_EXTENSIONS = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'tbz', 'tbz2', 'txz', 'cab', 'iso', 'lz', 'lzma', 'z', 'zipx', 'jar', 'war', 'apk', 'ipa', 'deb', 'rpm'];

    const JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    let jszipPromise = null;

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    function warn() {
        try { console.warn.apply(console, ['[Files]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
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

        window.addEventListener('shnuk:audio-closed', function() {
            const el = document.getElementById('fileApp');
            if (el) {
                el.style.display = 'flex';
                el.style.opacity = '1';
            }
        });

        window.addEventListener('shnuk:media-closed', function() {
            const el = document.getElementById('fileApp');
            if (el) {
                el.style.display = 'flex';
                el.style.opacity = '1';
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

    function isArchive(file) {
        if (!file || file.isFolder) return false;
        const ext = getExt(file);
        return ARCHIVE_EXTENSIONS.indexOf(ext) !== -1;
    }

    function isSupportedArchive(file) {
        if (!file || file.isFolder) return false;
        const ext = getExt(file);
        return SUPPORTED_ARCHIVES.indexOf(ext) !== -1;
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
        if (ARCHIVE_EXTENSIONS.indexOf(ext) !== -1) return 'ZIP';
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

    function dataURLToUint8Array(dataUrl) {
        try {
            if (!dataUrl || dataUrl.indexOf('data:') !== 0) return null;
            const commaIdx = dataUrl.indexOf(',');
            if (commaIdx === -1) return null;
            const header = dataUrl.substring(5, commaIdx);
            const body = dataUrl.substring(commaIdx + 1);
            const isBase64 = /;\s*base64/i.test(header);
            if (!isBase64) {
                try {
                    const text = decodeURIComponent(body);
                    return new TextEncoder().encode(text);
                } catch(e) {
                    return new TextEncoder().encode(body);
                }
            }
            const binary = atob(body);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return bytes;
        } catch(e) {
            return null;
        }
    }

    function uint8ArrayToDataURL(bytes, mime) {
        try {
            let binary = '';
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            const b64 = btoa(binary);
            return 'data:' + (mime || 'application/octet-stream') + ';base64,' + b64;
        } catch(e) {
            return null;
        }
    }

    function getMimeFromExt(ext) {
        const map = {
            'txt': 'text/plain',
            'json': 'application/json',
            'xml': 'application/xml',
            'html': 'text/html',
            'htm': 'text/html',
            'css': 'text/css',
            'js': 'application/javascript',
            'md': 'text/markdown',
            'csv': 'text/csv',
            'svg': 'image/svg+xml',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'bmp': 'image/bmp',
            'webp': 'image/webp',
            'ico': 'image/x-icon',
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'ogg': 'video/ogg',
            'ogv': 'video/ogg',
            'mov': 'video/quicktime',
            'avi': 'video/x-msvideo',
            'mkv': 'video/x-matroska',
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'flac': 'audio/flac',
            'aac': 'audio/aac',
            'm4a': 'audio/mp4',
            'zip': 'application/zip'
        };
        return map[ext] || 'application/octet-stream';
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

    async function getOrCreateCooopFolder() {
        let folder = allItems.find(f => f.isFolder && f.parentId === null && f.name === 'Cooop Downloads');
        if (folder) return folder;

        folder = {
            id: 'folder_cooop_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            name: 'Cooop Downloads',
            isFolder: true,
            parentId: null,
            date: new Date().toISOString(),
            size: 0,
            type: 'folder',
            data: '',
            extension: ''
        };
        await putItem(folder);
        return folder;
    }

    async function saveToCooopDownloads(fileData) {
        if (!fileData || !fileData.name) return false;
        await loadAll();
        const folder = await getOrCreateCooopFolder();
        if (!folder) return false;

        const item = {
            id: 'cooop_file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            name: fileData.name,
            size: fileData.size || 0,
            type: fileData.type || 'application/octet-stream',
            data: fileData.data,
            date: new Date().toISOString(),
            extension: (fileData.name.split('.').pop() || '').toLowerCase(),
            parentId: folder.id,
            isFolder: false
        };

        const ok = await putItem(item);
        if (ok) {
            renderFiles();
            updateStorageInfo();
        }
        return ok;
    }

    function loadCooopShareScript() {
        return new Promise(function(resolve) {
            if (window.CooopShare && typeof window.CooopShare.shareFile === 'function') {
                resolve(true);
                return;
            }
            const existing = document.querySelector('script[data-cooop-share]');
            if (existing) {
                const check = setInterval(function() {
                    if (window.CooopShare) { clearInterval(check); resolve(true); }
                }, 50);
                setTimeout(function() { clearInterval(check); resolve(!!window.CooopShare); }, 3000);
                return;
            }
            const s = document.createElement('script');
            s.src = 'cooop-share.js?t=' + Date.now();
            s.dataset.cooopShare = '1';
            s.onload = function() {
                resolve(!!(window.CooopShare && typeof window.CooopShare.shareFile === 'function'));
            };
            s.onerror = function() { resolve(false); };
            document.head.appendChild(s);
        });
    }

    async function shareFileWithCooop(fileId) {
        const file = allItems.find(f => f.id === fileId);
        if (!file) {
            if (window.Win && window.Win.notify) window.Win.notify('Файл не найден', { type: 'error' });
            return;
        }
        if (file.isFolder) {
            if (window.Win && window.Win.notify) window.Win.notify('Нельзя поделиться папкой', { type: 'error' });
            return;
        }

        if (window.Win && window.Win.notify) {
            window.Win.notify('Готовим ссылку...', { type: 'info', duration: 2000 });
        }

        const ok = await loadCooopShareScript();
        if (!ok) {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Не удалось загрузить модуль Cooop Share', { type: 'error' });
            }
            return;
        }

        try {
            const result = await window.CooopShare.shareFile(file);
            if (result) {
                showShareLinkDialog(result);
            }
        } catch(e) {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Ошибка: ' + e.message, { type: 'error' });
            }
        }
    }

    function showShareLinkDialog(link) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.55);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 100002;
            display: flex; align-items: center; justify-content: center;
            padding: 20px; box-sizing: border-box;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: var(--bg-primary);
            color: var(--text-primary);
            width: 100%; max-width: 460px;
            border: 2px solid var(--border-color);
            padding: 24px; box-sizing: border-box;
            font-family: ${FONT_MAIN};
        `;

        modal.innerHTML = `
            <div style="font-size:20px;font-weight:700;margin-bottom:14px;letter-spacing:0.4px;">
                Ссылка на файл
            </div>
            <div style="font-size:13px;color:var(--text-muted);line-height:1.5;margin-bottom:14px;">
                Отправьте эту ссылку любому. При открытии файл распакуется и скачается.
            </div>
            <textarea readonly id="cooopShareLinkField" style="
                width:100%;min-height:100px;padding:10px;
                border:2px solid var(--border-color);
                background:var(--bg-primary);color:var(--text-primary);
                font-family:'Courier New',monospace;font-size:11px;
                line-height:1.4;box-sizing:border-box;outline:none;
                word-break:break-all;margin-bottom:14px;
                -webkit-user-select:text;user-select:text;
            "></textarea>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button id="cooopShareCopyBtn" style="
                    flex:1;min-width:120px;
                    padding:12px 20px;border:none;
                    background:var(--accent);color:var(--text-on-accent);
                    cursor:pointer;font-family:${FONT_MAIN};
                    font-size:14px;font-weight:700;letter-spacing:1px;
                ">СКОПИРОВАТЬ</button>
                <button id="cooopShareOpenBtn" style="
                    flex:1;min-width:120px;
                    padding:12px 20px;border:2px solid var(--border-color);
                    background:var(--bg-primary);color:var(--text-primary);
                    cursor:pointer;font-family:${FONT_MAIN};
                    font-size:14px;font-weight:600;
                ">ОТКРЫТЬ</button>
                <button id="cooopShareCloseBtn" style="
                    width:100%;padding:10px 20px;
                    border:2px solid var(--border-color);
                    background:var(--bg-primary);color:var(--text-primary);
                    cursor:pointer;font-family:${FONT_MAIN};
                    font-size:13px;font-weight:600;
                ">ЗАКРЫТЬ</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const field = document.getElementById('cooopShareLinkField');
        field.value = link;

        field.addEventListener('click', function() {
            field.focus();
            field.setSelectionRange(0, field.value.length);
        });

        document.getElementById('cooopShareCopyBtn').addEventListener('click', async function() {
            const ok = await copyText(link, field);
            if (ok) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Ссылка скопирована', { type: 'success' });
                }
            } else {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Текст выделен — скопируйте вручную', { type: 'info', duration: 4000 });
                }
            }
        });

        document.getElementById('cooopShareOpenBtn').addEventListener('click', function() {
            window.open(link, '_blank');
        });

        document.getElementById('cooopShareCloseBtn').addEventListener('click', function() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        });

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }
        });
    }

    async function copyText(text, field) {
        if (!text) return false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                let done = false;
                const p = navigator.clipboard.writeText(text).then(function() {
                    done = true;
                    return true;
                }).catch(function() {
                    done = true;
                    return false;
                });
                const timeout = new Promise(function(resolve) {
                    setTimeout(function() { if (!done) resolve(false); }, 1200);
                });
                const ok = await Promise.race([p, timeout]);
                if (ok) return true;
            }
        } catch(e) {}

        try {
            const tmp = document.createElement('textarea');
            tmp.value = text;
            tmp.setAttribute('readonly', '');
            tmp.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
            document.body.appendChild(tmp);
            tmp.focus();
            tmp.setSelectionRange(0, text.length);
            let ok = false;
            try { ok = document.execCommand('copy'); } catch(e) { ok = false; }
            document.body.removeChild(tmp);
            if (ok) return true;
        } catch(e) {}

        if (field) {
            try {
                field.focus();
                field.setSelectionRange(0, field.value.length);
            } catch(e) {}
        }
        return false;
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
        closePreview();
        closeEditor();
        document.removeEventListener('keydown', onKeyDown);

        const el = document.getElementById('fileApp');
        if (!el) return;

        if (window.ShnukCloseAnimation) {
            window.ShnukCloseAnimation(el, 'file', function() {
                if (el.parentNode) el.parentNode.removeChild(el);
            });
        } else {
            el.style.opacity = '0';
            setTimeout(() => {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, 250);
        }
    }

    function destroy() {
        isOpen = false;
        closePreview();
        closeEditor();
        document.removeEventListener('keydown', onKeyDown);
        const el = document.getElementById('fileApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function loadClipboard() {
        try {
            const raw = localStorage.getItem('shnuk_file_clipboard');
            if (raw) clipboard = JSON.parse(raw);
        } catch(e) { clipboard = null; }
    }

    function saveClipboard() {
        try {
            if (clipboard) {
                localStorage.setItem('shnuk_file_clipboard', JSON.stringify(clipboard));
            } else {
                localStorage.removeItem('shnuk_file_clipboard');
            }
        } catch(e) {}
    }

    function getSelectedItem() {
        if (!selectedItemId) return null;
        return allItems.find(f => f.id === selectedItemId) || null;
    }

    function copySelected(isCut) {
        const item = getSelectedItem();
        if (!item) return;
        const bundle = [];
        function collect(id) {
            const el = allItems.find(f => f.id === id);
            if (!el) return;
            bundle.push(Object.assign({}, el));
            if (el.isFolder) {
                allItems.forEach(f => {
                    if (f.parentId === id) collect(f.id);
                });
            }
        }
        collect(item.id);

        clipboard = {
            items: bundle,
            cut: !!isCut,
            originId: item.id,
            originParentId: item.parentId
        };
        saveClipboard();
        selectedItemId = null;

        if (window.Win && window.Win.notify) {
            window.Win.notify(isCut ? 'Вырезано' : 'Скопировано', { type: 'success' });
        }
        renderFiles();
    }

    async function pasteFromClipboard() {
        loadClipboard();
        if (!clipboard || !Array.isArray(clipboard.items) || clipboard.items.length === 0) {
            if (window.Win && window.Win.notify) window.Win.notify('Буфер пуст', { type: 'error' });
            return;
        }

        const now = Date.now();
        const idMap = {};
        const targetParent = currentFolderId;

        function nameExistsIn(name, parentId) {
            return allItems.some(f => f.parentId === parentId && f.name === name);
        }

        function makeUniqueName(baseName, parentId) {
            if (!nameExistsIn(baseName, parentId)) return baseName;
            const dotIdx = baseName.lastIndexOf('.');
            let stem = baseName, ext = '';
            if (dotIdx > 0) {
                stem = baseName.substring(0, dotIdx);
                ext = baseName.substring(dotIdx);
            }
            let i = 1;
            let candidate = stem + '_копия' + ext;
            while (nameExistsIn(candidate, parentId)) {
                i++;
                candidate = stem + '_копия_' + i + ext;
            }
            return candidate;
        }

        const newItems = [];

        clipboard.items.forEach((source, i) => {
            const newId = 'file_' + (now + i) + '_' + Math.random().toString(36).substr(2, 8);
            idMap[source.id] = newId;

            const parent = (i === 0) ? targetParent : (idMap[source.parentId] || targetParent);

            let newName = source.name;
            if (i === 0) {
                newName = makeUniqueName(source.name, targetParent);
            }

            newItems.push({
                id: newId,
                name: newName,
                size: source.size,
                type: source.type,
                data: source.data,
                date: new Date().toISOString(),
                extension: source.extension,
                parentId: parent,
                isFolder: source.isFolder
            });
        });

        for (const item of newItems) {
            await putItem(item);
        }

        if (clipboard.cut) {
            const idsToDelete = clipboard.items.map(x => x.id);
            for (const id of idsToDelete) {
                await deleteItem(id);
            }
            clipboard = null;
            saveClipboard();
        }

        renderFiles();
        updateStorageInfo();

        if (window.Win && window.Win.notify) {
            window.Win.notify('Вставлено', { type: 'success' });
        }
    }

    // ============================================
    // СОЗДАНИЕ ПАПОК (публичное — для распаковки)
    // ============================================

    async function createFolder(name, parentId) {
        if (!name) return null;
        const item = {
            id: 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
            name: name,
            isFolder: true,
            parentId: typeof parentId === 'undefined' ? null : parentId,
            date: new Date().toISOString(),
            size: 0,
            type: 'folder',
            data: '',
            extension: ''
        };
        const ok = await putItem(item);
        return ok ? item : null;
    }

    async function createUniqueFolderName(baseName, parentId) {
        let name = baseName;
        let i = 1;
        while (allItems.some(f => f.parentId === parentId && f.isFolder && f.name === name)) {
            name = baseName + '_' + i;
            i++;
        }
        return name;
    }

    // ============================================
    // ZIP — список и извлечение
    // ============================================

    let archivePreview = null; // { file, zip, entries: [{name, dir, size, date, entry}] }

    async function loadZipFromFile(file) {
        const ok = await loadJSZip();
        if (!ok) throw new Error('Не удалось загрузить JSZip');
        const bytes = dataURLToUint8Array(file.data);
        if (!bytes) throw new Error('Не удалось прочитать данные файла');
        const zip = await JSZip.loadAsync(bytes);
        return zip;
    }

    function buildArchiveEntries(zip) {
        const entries = [];
        zip.forEach(function(relativePath, entry) {
            entries.push({
                name: relativePath,
                dir: entry.dir,
                size: entry._data ? (entry._data.uncompressedSize || 0) : 0,
                date: entry.date || null,
                entry: entry
            });
        });
        entries.sort(function(a, b) {
            if (a.dir !== b.dir) return a.dir ? -1 : 1;
            return a.name.localeCompare(b.name, 'ru');
        });
        return entries;
    }

    async function openZipPreview(file) {
        closePreview();
        const content = document.getElementById('previewContent');
        const info = document.getElementById('previewInfo');
        const actions = document.getElementById('previewActions');
        const nameEl = document.getElementById('previewName');

        previewData = { file, type: 'zip' };

        nameEl.textContent = file.name;
        content.innerHTML = '<div style="color:#ccc;font-size:14px;">Загрузка архива...</div>';
        info.textContent = formatBytes(file.size) + ' • ' + new Date(file.date).toLocaleString('ru-RU');
        actions.innerHTML = '';
        document.getElementById('filePreview').classList.add('active');

        let zip;
        try {
            zip = await loadZipFromFile(file);
        } catch(e) {
            content.innerHTML = '<div style="color:#ff8888;font-size:14px;padding:20px;text-align:center;">Не удалось открыть архив: ' + escapeHtml(e.message) + '</div>';
            return;
        }

        const entries = buildArchiveEntries(zip);
        archivePreview = { file, zip, entries };

        renderArchiveContent();

        actions.innerHTML = `
            <button class="extract-all-btn" data-file-id="${file.id}">Извлечь всё</button>
            <button data-file-id="${file.id}" class="download-btn">Скачать</button>
            <button data-file-id="${file.id}" class="delete-btn">Удалить</button>
        `;

        actions.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', function() {
                const fileId = this.dataset.fileId;
                if (this.classList.contains('extract-all-btn')) extractAllFromArchive(fileId);
                else if (this.classList.contains('download-btn')) downloadFile(fileId);
                else if (this.classList.contains('delete-btn')) deleteFileFromPreview(fileId);
            });
        });
    }

    function renderArchiveContent() {
        const content = document.getElementById('previewContent');
        if (!content || !archivePreview) return;

        const entries = archivePreview.entries;
        content.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.style.cssText = `
            width: 100%;
            max-width: 640px;
            max-height: 60vh;
            overflow-y: auto;
            background: #111;
            border: 2px solid #333;
            padding: 8px;
            box-sizing: border-box;
            font-family: ${FONT_MAIN};
        `;

        if (entries.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'Архив пуст';
            empty.style.cssText = 'color:#888;text-align:center;padding:20px;font-size:13px;';
            wrap.appendChild(empty);
            content.appendChild(wrap);
            return;
        }

        entries.forEach(function(en) {
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 10px;
                border-bottom: 1px solid #222;
                color: #ddd;
                font-size: 13px;
            `;

            const icon = document.createElement('span');
            icon.textContent = en.dir ? 'DIR' : 'FILE';
            icon.style.cssText = 'font-size:10px;font-weight:700;color:' + (en.dir ? '#cc9900' : '#888') + ';flex-shrink:0;letter-spacing:0.5px;width:38px;';
            row.appendChild(icon);

            const nameEl = document.createElement('span');
            nameEl.textContent = en.name;
            nameEl.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;word-break:break-all;';
            row.appendChild(nameEl);

            if (!en.dir) {
                const sizeEl = document.createElement('span');
                sizeEl.textContent = formatBytes(en.size);
                sizeEl.style.cssText = 'font-size:11px;color:#777;flex-shrink:0;';
                row.appendChild(sizeEl);

                const btn = document.createElement('button');
                btn.textContent = 'Извлечь';
                btn.style.cssText = `
                    padding: 5px 10px;
                    background: none;
                    border: 1px solid #cc0000;
                    color: #cc0000;
                    cursor: pointer;
                    font-family: ${FONT_MAIN};
                    font-size: 11px;
                    flex-shrink: 0;
                    transition: all 0.2s;
                `;
                btn.addEventListener('mouseenter', function() {
                    btn.style.background = '#cc0000';
                    btn.style.color = '#ffffff';
                });
                btn.addEventListener('mouseleave', function() {
                    btn.style.background = 'none';
                    btn.style.color = '#cc0000';
                });
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    extractSingleFromArchive(en.name);
                });
                row.appendChild(btn);
            }

            wrap.appendChild(row);
        });

        content.appendChild(wrap);
    }

    async function pickFolderForExtraction() {
        // Возвращает: { id } — папка, { newName } — создать новую, null — отмена
        return new Promise(function(resolve) {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; inset: 0;
                background: rgba(0,0,0,0.55);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 100003;
                display: flex; align-items: center; justify-content: center;
                padding: 20px; box-sizing: border-box;
            `;

            const modal = document.createElement('div');
            modal.style.cssText = `
                background: var(--bg-primary);
                color: var(--text-primary);
                width: 100%; max-width: 460px;
                border: 2px solid var(--border-color);
                padding: 0;
                box-sizing: border-box;
                font-family: ${FONT_MAIN};
                display: flex;
                flex-direction: column;
                max-height: 80vh;
            `;

            const folders = allItems.filter(f => f.isFolder);
            const currentFolder = getCurrentFolder();
            const currentName = currentFolder ? currentFolder.name : 'Корень';

            let foldersHtml = '';
            foldersHtml += `<button class="folder-pick-item" data-folder-id="__current__">${escapeHtml(currentName)} (текущая)</button>`;
            folders.forEach(function(f) {
                foldersHtml += `<button class="folder-pick-item" data-folder-id="${escapeHtml(f.id)}">${escapeHtml(f.name)}</button>`;
            });

            modal.innerHTML = `
                <div style="padding:16px 20px;background:var(--header-bg);color:var(--header-text);border-bottom:2px solid var(--border-color);font-weight:700;font-size:16px;">
                    Куда извлечь?
                </div>
                <div style="padding:14px 20px;overflow-y:auto;max-height:50vh;">
                    <div class="folder-pick-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;"></div>
                    <div style="border-top:2px solid var(--border-color);padding-top:12px;display:flex;flex-direction:column;gap:8px;">
                        <div style="font-size:12px;color:var(--text-muted);">Создать новую папку:</div>
                        <input type="text" id="newFolderNameInput" placeholder="Имя папки" style="
                            padding:10px 12px;
                            border:2px solid var(--border-color);
                            background:var(--bg-primary);
                            color:var(--text-primary);
                            font-family:${FONT_MAIN};
                            font-size:14px;
                            outline:none;
                            box-sizing:border-box;
                        " />
                        <button id="createAndExtractBtn" style="
                            padding:10px 16px;
                            border:none;
                            background:var(--accent);
                            color:var(--text-on-accent);
                            font-family:${FONT_MAIN};
                            font-size:13px;
                            font-weight:700;
                            cursor:pointer;
                        ">Создать папку и извлечь туда</button>
                    </div>
                </div>
                <div style="padding:12px 20px;border-top:2px solid var(--border-color);display:flex;justify-content:flex-end;">
                    <button id="cancelFolderPick" style="
                        padding:10px 20px;
                        border:2px solid var(--border-color);
                        background:var(--bg-primary);
                        color:var(--text-primary);
                        font-family:${FONT_MAIN};
                        font-size:13px;
                        cursor:pointer;
                    ">Отмена</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const list = modal.querySelector('.folder-pick-list');
            list.innerHTML = foldersHtml;

            list.querySelectorAll('.folder-pick-item').forEach(function(btn) {
                btn.style.cssText = `
                    padding:10px 14px;
                    border:2px solid var(--border-color);
                    background:var(--bg-secondary);
                    color:var(--text-primary);
                    font-family:${FONT_MAIN};
                    font-size:13px;
                    text-align:left;
                    cursor:pointer;
                    transition: all 0.15s;
                `;
                btn.addEventListener('mouseenter', function() { btn.style.borderColor = 'var(--accent)'; });
                btn.addEventListener('mouseleave', function() { btn.style.borderColor = 'var(--border-color)'; });
                btn.addEventListener('click', function() {
                    const fid = this.dataset.folderId;
                    cleanup();
                    if (fid === '__current__') resolve({ id: currentFolderId });
                    else resolve({ id: fid });
                });
            });

            const newInput = modal.querySelector('#newFolderNameInput');
            const createBtn = modal.querySelector('#createAndExtractBtn');
            createBtn.addEventListener('click', function() {
                const name = (newInput.value || '').trim();
                if (!name) {
                    if (window.Win && window.Win.notify) window.Win.notify('Введите имя папки', { type: 'error' });
                    return;
                }
                cleanup();
                resolve({ newName: name });
            });

            const cancelBtn = modal.querySelector('#cancelFolderPick');
            cancelBtn.addEventListener('click', function() {
                cleanup();
                resolve(null);
            });

            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) {
                    cleanup();
                    resolve(null);
                }
            });

            function cleanup() {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }
        });
    }

    async function resolveExtractionTarget() {
        const pick = await pickFolderForExtraction();
        if (!pick) return null;
        if (typeof pick.id !== 'undefined') {
            return { folderId: pick.id };
        }
        if (pick.newName) {
            const targetParent = currentFolderId;
            const uniqueName = await createUniqueFolderName(pick.newName, targetParent);
            const folder = await createFolder(uniqueName, targetParent);
            if (!folder) return null;
            return { folderId: folder.id };
        }
        return null;
    }

    async function saveExtractedFile(targetFolderId, pathName, bytes) {
        // pathName может содержать подпапки: dir1/dir2/file.txt — создаём цепочку папок
        const parts = pathName.split('/').filter(p => p.length > 0);
        if (parts.length === 0) return false;

        const fileName = parts.pop();
        let parentId = targetFolderId;

        for (const dirName of parts) {
            let existing = allItems.find(f => f.parentId === parentId && f.isFolder && f.name === dirName);
            if (!existing) {
                const created = await createFolder(dirName, parentId);
                if (!created) return false;
                existing = created;
            }
            parentId = existing.id;
        }

        // Уникальное имя файла в целевой папке
        let finalName = fileName;
        let i = 1;
        while (allItems.some(f => f.parentId === parentId && !f.isFolder && f.name === finalName)) {
            const dot = fileName.lastIndexOf('.');
            if (dot > 0) {
                finalName = fileName.substring(0, dot) + '_' + i + fileName.substring(dot);
            } else {
                finalName = fileName + '_' + i;
            }
            i++;
        }

        const ext = (finalName.split('.').pop() || '').toLowerCase();
        const mime = getMimeFromExt(ext);
        const dataUrl = uint8ArrayToDataURL(bytes, mime);
        if (!dataUrl) return false;

        const item = {
            id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
            name: finalName,
            size: bytes.length,
            type: mime,
            data: dataUrl,
            date: new Date().toISOString(),
            extension: ext,
            parentId: parentId,
            isFolder: false
        };
        return await putItem(item);
    }

    async function extractSingleFromArchive(entryName) {
        if (!archivePreview) return;
        const en = archivePreview.entries.find(e => e.name === entryName);
        if (!en || en.dir) return;

        const target = await resolveExtractionTarget();
        if (!target) return;

        try {
            const bytes = await en.entry.async('uint8array');
            const ok = await saveExtractedFile(target.folderId, en.name, bytes);
            if (ok) {
                renderFiles();
                updateStorageInfo();
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Извлечено: ' + en.name, { type: 'success' });
                }
            } else {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Не удалось сохранить файл', { type: 'error' });
                }
            }
        } catch(e) {
            warn('extractSingle:', e);
            if (window.Win && window.Win.notify) {
                window.Win.notify('Ошибка извлечения: ' + e.message, { type: 'error' });
            }
        }
    }

    async function extractAllFromArchive(fileId) {
        if (!archivePreview || archivePreview.file.id !== fileId) return;

        const target = await resolveExtractionTarget();
        if (!target) return;

        if (window.Win && window.Win.notify) {
            window.Win.notify('Распаковка...', { type: 'info', duration: 2000 });
        }

        let count = 0;
        let errors = 0;

        for (const en of archivePreview.entries) {
            if (en.dir) continue;
            try {
                const bytes = await en.entry.async('uint8array');
                const ok = await saveExtractedFile(target.folderId, en.name, bytes);
                if (ok) count++;
                else errors++;
            } catch(e) {
                errors++;
            }
        }

        renderFiles();
        updateStorageInfo();

        if (window.Win && window.Win.notify) {
            if (errors === 0) {
                window.Win.notify('Извлечено файлов: ' + count, { type: 'success' });
            } else {
                window.Win.notify('Извлечено: ' + count + ', ошибок: ' + errors, { type: 'warning', duration: 4000 });
            }
        }
    }

    // ============================================
    // UI
    // ============================================
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
            font-family: ${FONT_MAIN};
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

                #fileApp, #fileApp * {
                    font-family: ${FONT_MAIN} !important;
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
                    font-family: ${FONT_MAIN};
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
                    font-family: ${FONT_MAIN};
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
                    font-family: ${FONT_MAIN};
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
                .file-item:hover .file-rename-btn,
                .file-item:hover .file-share-btn { opacity: 1; }
                .file-item.selected {
                    border-color: var(--accent) !important;
                    background: var(--bg-hover);
                    box-shadow: 0 0 0 2px var(--accent);
                }
                .file-item.clipboard-cut {
                    opacity: 0.5;
                }
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
                .file-item .file-badge.zip-badge {
                    background: #8844cc;
                    color: #ffffff;
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
                    font-family: ${FONT_MAIN};
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
                    font-family: ${FONT_MAIN};
                    box-shadow: 0 2px 8px rgba(68,136,255,0.3);
                    z-index: 5;
                }
                .file-rename-btn:hover { transform: scale(1.1); background: #2266dd; }

                .file-share-btn {
                    position: absolute; bottom: -8px; left: 50%;
                    transform: translateX(-50%);
                    width: 28px; height: 28px;
                    background: #4CAF50; color: #ffffff;
                    border: 2px solid var(--bg-primary);
                    border-radius: 50%;
                    font-size: 14px;
                    line-height: 24px;
                    text-align: center; cursor: pointer;
                    opacity: 0;
                    transition: opacity 0.2s, transform 0.2s;
                    font-family: ${FONT_MAIN};
                    box-shadow: 0 2px 8px rgba(76,175,80,0.3);
                    z-index: 5;
                }
                .file-share-btn:hover { transform: translateX(-50%) scale(1.1); background: #3d8b40; }

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
                    font-family: ${FONT_MAIN};
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
                .preview-content .text-preview {
                    width: 100%; height: 60vh;
                    background: #1a1a1a;
                    color: #e0e0e0;
                    padding: 20px;
                    overflow: auto;
                    font-family: 'Courier New', monospace;
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
                    font-family: ${FONT_MAIN};
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
                .preview-actions-row button.share-btn {
                    border-color: #4488ff; color: #4488ff;
                }
                .preview-actions-row button.share-btn:hover {
                    background: #4488ff; color: #ffffff;
                }
                .preview-actions-row button.extract-all-btn {
                    border-color: #8844cc; color: #8844cc;
                }
                .preview-actions-row button.extract-all-btn:hover {
                    background: #8844cc; color: #ffffff;
                }

                .preview-close-bottom {
                    width: 56px; height: 56px;
                    background: none;
                    border: none;
                    color: #ffffff;
                    font-size: 32px;
                    cursor: pointer;
                    font-family: ${FONT_MAIN};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: color 0.2s, transform 0.2s;
                    line-height: 1;
                    padding: 0;
                    outline: none;
                    box-shadow: none;
                    -webkit-tap-highlight-color: transparent;
                }
                .preview-close-bottom:hover {
                    color: var(--accent);
                    transform: scale(1.1);
                }
                .preview-close-bottom:active {
                    transform: scale(0.95);
                }

                .file-editor-overlay {
                    position: fixed;
                    top: var(--livebar-h, 44px); left: 0;
                    width: 100%; height: calc(100% - var(--livebar-h, 44px));
                    background: var(--bg-primary);
                    z-index: 100001;
                    display: none;
                    flex-direction: column;
                    font-family: ${FONT_MAIN};
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
                    font-family: ${FONT_MAIN};
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
                    .file-share-btn { width: 24px; height: 24px; font-size: 12px; line-height: 20px; bottom: -6px; }
                    .preview-nav { font-size: 24px; padding: 12px; }
                    .preview-actions-row { flex-wrap: wrap; gap: 6px; }
                    .preview-actions-row button { font-size: 11px; padding: 6px 14px; }
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
        loadClipboard();

        const canCreateFolder = hasRootFile();
        const hasSelection = !!getSelectedItem();
        const hasClipboard = !!clipboard && Array.isArray(clipboard.items) && clipboard.items.length > 0;
        const selectedIsFile = hasSelection && !getSelectedItem().isFolder;

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
            {
                id: 'new-text',
                label: 'Создать текстовый файл',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>'
            },
            { sep: true },
            {
                id: 'share',
                label: 'Поделиться ссылкой',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
                disabled: !selectedIsFile
            },
            {
                id: 'copy',
                label: 'Копировать',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
                disabled: !hasSelection
            },
            {
                id: 'cut',
                label: 'Вырезать',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
                disabled: !hasSelection
            },
            {
                id: 'paste',
                label: 'Вставить',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
                disabled: !hasClipboard
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
                        window.Win.notify('Сначала выделите элемент или загрузите файл', { type: 'error', duration: 2000 });
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
        else if (id === 'new-text') createTextFile();
        else if (id === 'new-folder') createFolderPrompt();
        else if (id === 'share') {
            const sel = getSelectedItem();
            if (sel && !sel.isFolder) shareFileWithCooop(sel.id);
        }
        else if (id === 'copy') copySelected(false);
        else if (id === 'cut') copySelected(true);
        else if (id === 'paste') pasteFromClipboard();
    }

    async function createTextFile() {
        const name = 'текст_' + Date.now() + '.txt';
        const dataUrl = encodeTextToDataURL('', 'text/plain');
        const item = {
            id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
            name: name,
            size: 0,
            type: 'text/plain',
            data: dataUrl,
            date: new Date().toISOString(),
            extension: 'txt',
            parentId: currentFolderId,
            isFolder: false
        };
        const ok = await putItem(item);
        if (ok) {
            renderFiles();
            updateStorageInfo();
            if (window.Win && window.Win.notify) window.Win.notify('Текстовый файл создан', { type: 'success' });
            setTimeout(function() {
                openEditor(item.id);
            }, 200);
        } else {
            if (window.Win && window.Win.notify) window.Win.notify('Не удалось создать файл', { type: 'error' });
        }
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

        const created = await createFolder(name, currentFolderId);
        if (created) {
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

    function uploadFiles(multiple) {
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
                selectedItemId = null;
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
                    selectedItemId = null;
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

        loadClipboard();
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

        let cutIds = {};
        if (clipboard && clipboard.cut && Array.isArray(clipboard.items)) {
            clipboard.items.forEach(function(it) { cutIds[it.id] = true; });
        }

        sorted.forEach(item => {
            const el = document.createElement('div');
            el.className = 'file-item' + (item.isFolder ? ' folder' : '');
            if (selectedItemId === item.id) el.classList.add('selected');
            if (cutIds[item.id]) el.classList.add('clipboard-cut');

            const icon = getFileIcon(item);
            const isFolder = item.isFolder;
            const size = isFolder ? '' : formatBytes(item.size);
            const dateStr = formatDate(item.date);
            const ext = getExt(item);
            const isImage = !isFolder && SUPPORTED.images.indexOf(ext) !== -1;
            const isZip = !isFolder && SUPPORTED_ARCHIVES.indexOf(ext) !== -1;
            const isOtherArchive = !isFolder && !isZip && ARCHIVE_EXTENSIONS.indexOf(ext) !== -1;

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

            const shareBtn = document.createElement('button');
            shareBtn.className = 'file-share-btn';
            shareBtn.textContent = '↑';
            shareBtn.title = 'Поделиться';
            shareBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                shareFileWithCooop(item.id);
            });

            let badge = '';
            if (isFolder) badge = '<span class="file-badge folder-badge">ПАПКА</span>';
            else if (isImage) badge = '<span class="file-badge">IMG</span>';
            else if (isZip) badge = '<span class="file-badge zip-badge">ZIP</span>';
            else if (isOtherArchive) badge = '<span class="file-badge zip-badge">ARCH</span>';

            el.innerHTML = `
                ${badge}
                <span class="file-icon">${icon}</span>
                <div class="file-name">${escapeHtml(item.name)}</div>
                <div class="file-size">${size}${size && dateStr ? ' • ' : ''}${dateStr}</div>
            `;
            el.appendChild(deleteBtn);
            el.appendChild(renameBtn);
            if (!isFolder) el.appendChild(shareBtn);

            el.addEventListener('click', function(e) {
                e.stopPropagation();
                if (selectedItemId === item.id) {
                    if (isFolder) {
                        currentFolderId = item.id;
                        selectedItemId = null;
                        renderFiles();
                    } else {
                        openFile(item);
                    }
                } else {
                    selectedItemId = item.id;
                    renderFiles();
                }
            });

            grid.appendChild(el);
        });

        content.innerHTML = '';
        content.appendChild(grid);
    }

    function loadAudioScript() {
        return new Promise(function(resolve) {
            if (window.AudioPlayer && typeof window.AudioPlayer.open === 'function') {
                resolve(true);
                return;
            }
            if (window.__audioScriptLoading) {
                const check = setInterval(function() {
                    if (window.AudioPlayer && typeof window.AudioPlayer.open === 'function') {
                        clearInterval(check);
                        resolve(true);
                    }
                }, 50);
                setTimeout(function() { clearInterval(check); resolve(!!window.AudioPlayer); }, 5000);
                return;
            }
            window.__audioScriptLoading = true;

            const script = document.createElement('script');
            script.src = 'audio.js?t=' + Date.now();
            script.async = false;
            script.onload = function() {
                window.__audioScriptLoading = false;
                resolve(!!(window.AudioPlayer && typeof window.AudioPlayer.open === 'function'));
            };
            script.onerror = function() {
                window.__audioScriptLoading = false;
                resolve(false);
            };
            document.head.appendChild(script);
        });
    }

    function loadMediaScript() {
        return new Promise(function(resolve) {
            if (window.MediaPlayer && typeof window.MediaPlayer.open === 'function') {
                resolve(true);
                return;
            }
            if (window.__mediaScriptLoading) {
                const check = setInterval(function() {
                    if (window.MediaPlayer && typeof window.MediaPlayer.open === 'function') {
                        clearInterval(check);
                        resolve(true);
                    }
                }, 50);
                setTimeout(function() { clearInterval(check); resolve(!!window.MediaPlayer); }, 5000);
                return;
            }
            window.__mediaScriptLoading = true;

            const script = document.createElement('script');
            script.src = 'media.js?t=' + Date.now();
            script.async = false;
            script.onload = function() {
                window.__mediaScriptLoading = false;
                resolve(!!(window.MediaPlayer && typeof window.MediaPlayer.open === 'function'));
            };
            script.onerror = function() {
                window.__mediaScriptLoading = false;
                resolve(false);
            };
            document.head.appendChild(script);
        });
    }

    function isAudioFile(file) {
        if (!file || file.isFolder) return false;
        const ext = getExt(file);
        const type = (file.type || '').toLowerCase();

        if (type.indexOf('audio/') === 0) return true;
        if (type.indexOf('video/') === 0) return false;

        const audioExts = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'opus', 'oga'];
        if (audioExts.indexOf(ext) !== -1) return true;

        if (ext === 'webm' || ext === 'ogg') {
            return !type || type.indexOf('video/') === -1;
        }

        return false;
    }

    function isVideoFile(file) {
        if (!file || file.isFolder) return false;
        const ext = getExt(file);
        const type = (file.type || '').toLowerCase();

        if (type.indexOf('video/') === 0) return true;

        const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'ogv'];
        if (videoExts.indexOf(ext) !== -1) return true;

        if (ext === 'ogg') {
            return type.indexOf('video/') === 0;
        }

        return false;
    }

    function openFile(file) {
        const ext = getExt(file);

        if (isAudioFile(file)) {
            closePreview();
            const el = document.getElementById('fileApp');
            if (el) el.style.display = 'none';

            loadAudioScript().then(function(ok) {
                if (ok && window.AudioPlayer && typeof window.AudioPlayer.open === 'function') {
                    window.AudioPlayer.open(file);
                } else {
                    if (el) el.style.display = 'flex';
                    openPreview(file, 'audio');
                }
            });
            return;
        }

        if (isVideoFile(file)) {
            closePreview();
            const el = document.getElementById('fileApp');
            if (el) el.style.display = 'none';

            loadMediaScript().then(function(ok) {
                if (ok && window.MediaPlayer && typeof window.MediaPlayer.open === 'function') {
                    window.MediaPlayer.open(file);
                } else {
                    if (el) el.style.display = 'flex';
                    openPreview(file, 'video');
                }
            });
            return;
        }

        if (SUPPORTED.images.indexOf(ext) !== -1) { openPreview(file, 'image'); return; }

        if (SUPPORTED_ARCHIVES.indexOf(ext) !== -1) {
            openZipPreview(file);
            return;
        }

        if (ARCHIVE_EXTENSIONS.indexOf(ext) !== -1) {
            openPreview(file, 'unsupported-archive');
            return;
        }

        openPreview(file, 'text');
    }

    function openPreview(file, type) {
        const preview = document.getElementById('filePreview');
        const content = document.getElementById('previewContent');
        const info = document.getElementById('previewInfo');
        const actions = document.getElementById('previewActions');
        const nameEl = document.getElementById('previewName');

        previewData = { file, type };

        const navigable = allItems.filter(f => {
            if (f.parentId !== file.parentId || f.isFolder) return false;
            const e = getExt(f);
            return SUPPORTED.images.indexOf(e) !== -1 || SUPPORTED.videos.indexOf(e) !== -1;
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
        } else if (type === 'text') {
            const text = decodeTextFromData(file.data);
            if (text === null) {
                html = `<div class="text-preview"><div class="binary-notice">Бинарный файл. Просмотр недоступен.</div></div>`;
            } else {
                html = `<div class="text-preview">${escapeHtml(text) || '(пусто)'}</div>`;
            }
        } else if (type === 'unsupported-archive') {
            html = `<div class="text-preview"><div class="binary-notice">Нельзя просмотреть</div></div>`;
        }

        content.innerHTML = html;
        info.textContent = `${formatBytes(file.size)} • ${new Date(file.date).toLocaleString('ru-RU')}`;

        const isImage = SUPPORTED.images.indexOf(getExt(file)) !== -1;
        const canEdit = isEditable(file);
        const isArch = ARCHIVE_EXTENSIONS.indexOf(getExt(file)) !== -1;

        let actionsHtml = '';
        if (type === 'unsupported-archive') {
            actionsHtml = `
                <button class="share-btn" data-file-id="${file.id}">Поделиться</button>
                <button data-file-id="${file.id}" class="download-btn">Скачать</button>
                <button data-file-id="${file.id}" class="delete-btn">Удалить</button>
            `;
        } else {
            actionsHtml = `
                ${isImage ? `<button class="set-wallpaper" data-file-id="${file.id}">Установить как обои</button>` : ''}
                ${canEdit ? `<button class="edit-text" data-file-id="${file.id}">Редактировать</button>` : ''}
                <button class="share-btn" data-file-id="${file.id}">Поделиться</button>
                <button data-file-id="${file.id}" class="download-btn">Скачать</button>
                <button data-file-id="${file.id}" class="delete-btn">Удалить</button>
            `;
        }

        actions.innerHTML = actionsHtml;

        actions.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', function() {
                const fileId = this.dataset.fileId;
                if (this.classList.contains('set-wallpaper')) setWallpaperFromFile(fileId);
                else if (this.classList.contains('download-btn')) downloadFile(fileId);
                else if (this.classList.contains('delete-btn')) deleteFileFromPreview(fileId);
                else if (this.classList.contains('edit-text')) openEditor(fileId);
                else if (this.classList.contains('share-btn')) shareFileWithCooop(fileId);
            });
        });

        preview.classList.add('active');
    }

    function closePreview() {
        const el = document.getElementById('filePreview');
        if (el) el.classList.remove('active');
        previewData = null;
        archivePreview = null;
    }

    function navigatePreview(direction) {
        if (!previewData) return;
        const file = previewData.file;
        const navigable = allItems.filter(f => {
            if (f.parentId !== file.parentId || f.isFolder) return false;
            const e = getExt(f);
            return SUPPORTED.images.indexOf(e) !== -1 || SUPPORTED.videos.indexOf(e) !== -1;
        });
        if (navigable.length < 2) return;
        let index = navigable.findIndex(f => f.id === file.id);
        if (index === -1) index = 0;
        index = (index + direction + navigable.length) % navigable.length;
        const next = navigable[index];
        const e = getExt(next);
        let type = 'image';
        if (SUPPORTED.videos.indexOf(e) !== -1) type = 'video';
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
            if (selectedItemId) { selectedItemId = null; renderFiles(); return; }
            closeFiles();
        }
    }

    window.FileApp = {
        destroy: destroy,
        openByName: function(name) {
            if (!name) return;
            const f = allItems.find(x => x.name === name && !x.isFolder);
            if (f) openFile(f);
        },
        saveToCooopDownloads: saveToCooopDownloads,
        getOrCreateCooopFolder: getOrCreateCooopFolder
    };
    window.fileInit = function() { openFiles(); };

})();