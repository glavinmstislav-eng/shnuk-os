// cooop.js — Cooop: ссылки на файлы через сжатие + base64url

(function() {
    'use strict';

    const MAX_FILE_SIZE = 4 * 1024 * 1024;
    const FONT_MAIN = "'TTPaplane', monospace";
    const LINK_BASE = location.origin + location.pathname.replace(/[^/]*$/, '') + 'cooop.html';

    let isOpen = false;
    let mode = 'menu';
    let pendingHashParse = null;

    function log() {
        try { console.log.apply(console, ['[Cooop]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    function selectAllInField(field) {
        if (!field) return;
        try {
            field.focus();
            field.setSelectionRange(0, field.value.length);
            if (field.createTextRange) {
                const r = field.createTextRange();
                r.collapse(true);
                r.moveEnd('character', field.value.length);
                r.moveStart('character', 0);
                r.select();
            }
        } catch(e) {}
    }

    function tryNavigatorCopy(text) {
        return new Promise(function(resolve) {
            if (!navigator.clipboard || !navigator.clipboard.writeText) {
                resolve(false);
                return;
            }
            let done = false;
            navigator.clipboard.writeText(text).then(function() {
                if (!done) { done = true; resolve(true); }
            }).catch(function() {
                if (!done) { done = true; resolve(false); }
            });
            setTimeout(function() { if (!done) { done = true; resolve(false); } }, 1200);
        });
    }

    async function copyText(text, field) {
        if (!text) return false;

        const okApi = await tryNavigatorCopy(text);
        if (okApi) return true;

        const tmp = document.createElement('textarea');
        tmp.value = text;
        tmp.setAttribute('readonly', '');
        tmp.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
        document.body.appendChild(tmp);
        tmp.focus();
        tmp.setSelectionRange(0, text.length);
        let okExec = false;
        try { okExec = document.execCommand('copy'); } catch(e) { okExec = false; }
        document.body.removeChild(tmp);
        if (okExec) return true;

        if (field) selectAllInField(field);
        return false;
    }

    function supportsCompression() {
        return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
    }

    async function compressBytes(bytes) {
        if (!supportsCompression()) return null;
        try {
            let cs;
            try {
                cs = new CompressionStream('deflate-raw');
            } catch(e) {
                cs = new CompressionStream('deflate');
            }
            const writer = cs.writable.getWriter();
            writer.write(bytes);
            writer.close();

            const reader = cs.readable.getReader();
            const chunks = [];
            let total = 0;
            while (true) {
                const r = await reader.read();
                if (r.done) break;
                chunks.push(r.value);
                total += r.value.length;
            }
            const out = new Uint8Array(total);
            let off = 0;
            for (const c of chunks) {
                out.set(c, off);
                off += c.length;
            }
            return out;
        } catch(e) {
            log('compress error', e);
            return null;
        }
    }

    async function decompressBytes(bytes) {
        if (!supportsCompression()) return null;
        const types = ['deflate-raw', 'deflate', 'gzip'];
        for (const t of types) {
            try {
                const ds = new DecompressionStream(t);
                const writer = ds.writable.getWriter();
                writer.write(bytes);
                writer.close();

                const reader = ds.readable.getReader();
                const chunks = [];
                let total = 0;
                while (true) {
                    const r = await reader.read();
                    if (r.done) break;
                    chunks.push(r.value);
                    total += r.value.length;
                }
                const out = new Uint8Array(total);
                let off = 0;
                for (const c of chunks) {
                    out.set(c, off);
                    off += c.length;
                }
                return out;
            } catch(e) {
                continue;
            }
        }
        return null;
    }

    function rleEncode(bytes) {
        const out = [];
        let i = 0;
        const n = bytes.length;
        while (i < n) {
            const b = bytes[i];
            let run = 1;
            while (i + run < n && bytes[i + run] === b && run < 255) run++;

            if (b === 0xFF) {
                if (run >= 4) {
                    out.push(0xFF, run, 0xFF);
                } else {
                    for (let k = 0; k < run; k++) out.push(0xFF, 0x00, 0xFF);
                }
                i += run;
            } else if (run >= 4) {
                out.push(0xFF, run, b);
                i += run;
            } else {
                for (let k = 0; k < run; k++) out.push(b);
                i += run;
            }
        }
        return new Uint8Array(out);
    }

    function rleDecode(bytes) {
        const out = [];
        let i = 0;
        const n = bytes.length;
        while (i < n) {
            const b = bytes[i];
            if (b === 0xFF) {
                if (i + 2 >= n) break;
                const count = bytes[i + 1];
                const val = bytes[i + 2];
                if (count === 0) {
                    out.push(0xFF);
                } else {
                    for (let k = 0; k < count; k++) out.push(val);
                }
                i += 3;
            } else {
                out.push(b);
                i++;
            }
        }
        return new Uint8Array(out);
    }

    async function packFile(bytes) {
        const deflated = await compressBytes(bytes);
        const rleOnly = rleEncode(bytes);

        let candidates = [];

        if (deflated) {
            candidates.push({ data: deflated, method: 'd' });
            candidates.push({ data: rleEncode(deflated), method: 'dr' });
        }
        candidates.push({ data: rleOnly, method: 'r' });
        candidates.push({ data: bytes, method: 'n' });

        let best = candidates[0];
        for (const c of candidates) {
            if (c.data.length < best.data.length) best = c;
        }

        return { data: best.data, method: best.method, originalSize: bytes.length };
    }

    async function unpackFile(bytes, method) {
        const tryOrder = [method, 'dr', 'd', 'r', 'n'];

        for (const m of tryOrder) {
            try {
                let data = bytes;

                if (m === 'r' || m === 'dr') {
                    data = rleDecode(data);
                }
                if (m === 'd' || m === 'dr') {
                    const dec = await decompressBytes(data);
                    if (!dec) continue;
                    data = dec;
                }
                if (data && data.length > 0) return data;
            } catch(e) {
                continue;
            }
        }
        return null;
    }

    function base64UrlEncode(bytes) {
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    function base64UrlDecode(str) {
        let b64 = String(str).replace(/\s+/g, '');
        b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function buildLink(fileName, mime, packed) {
        const b64 = base64UrlEncode(packed.data);
        const safeName = encodeURIComponent(fileName);
        const safeMime = encodeURIComponent(mime || 'application/octet-stream');
        return LINK_BASE + '#cooop=' + safeName + '|' + safeMime + '|' + packed.method + '|' + b64;
    }

    function parseLink(hash) {
        if (!hash) return null;
        const idx = hash.indexOf('#cooop=');
        if (idx === -1) return null;
        let payload = hash.substring(idx + 7);
        payload = payload.replace(/\s+/g, '');
        const parts = payload.split('|');
        if (parts.length !== 4) return null;
        try {
            return {
                name: decodeURIComponent(parts[0]),
                mime: decodeURIComponent(parts[1]),
                method: parts[2],
                b64: parts[3]
            };
        } catch(e) {
            return null;
        }
    }

    async function shareFile(fileData) {
        if (!fileData || !fileData.name) return null;
        if (!fileData.data) return null;

        try {
            let bytes;
            if (fileData.data.indexOf('data:') === 0) {
                const commaIdx = fileData.data.indexOf(',');
                if (commaIdx === -1) return null;
                const header = fileData.data.substring(5, commaIdx);
                const body = fileData.data.substring(commaIdx + 1);
                const isBase64 = /;\s*base64/i.test(header);
                if (isBase64) {
                    const binary = atob(body);
                    bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                } else {
                    let text = body;
                    try { text = decodeURIComponent(body); } catch(e) {}
                    bytes = new TextEncoder().encode(text);
                }
            } else {
                bytes = new TextEncoder().encode(fileData.data);
            }

            if (bytes.length > MAX_FILE_SIZE) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify(
                        'Файл ' + formatSize(bytes.length) + ' — больше лимита ' + formatSize(MAX_FILE_SIZE),
                        { type: 'error', duration: 5000 }
                    );
                }
                return null;
            }

            const packed = await packFile(bytes);
            return buildLink(fileData.name, fileData.type || 'application/octet-stream', packed);
        } catch(e) {
            log('shareFile error', e);
            return null;
        }
    }

    async function downloadFromParsed(parsed, onStatus) {
        try {
            if (onStatus) onStatus('Распаковка...');
            const packedBytes = base64UrlDecode(parsed.b64);
            const unpacked = await unpackFile(packedBytes, parsed.method);

            if (!unpacked || unpacked.length === 0) {
                if (onStatus) onStatus('Не удалось распаковать');
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Не удалось распаковать файл', { type: 'error' });
                }
                return;
            }

            const blob = new Blob([unpacked], { type: parsed.mime });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = parsed.name;
            document.body.appendChild(a);
            a.click();
            setTimeout(function() {
                URL.revokeObjectURL(url);
                if (a.parentNode) a.parentNode.removeChild(a);
            }, 500);

            try {
                const reader = new FileReader();
                reader.onload = async function() {
                    const dataUrl = reader.result;
                    if (!dataUrl) return;

                    if (window.FileApp && typeof window.FileApp.saveToCooopDownloads === 'function') {
                        const ok = await window.FileApp.saveToCooopDownloads({
                            name: parsed.name,
                            type: parsed.mime,
                            size: blob.size,
                            data: dataUrl
                        });
                        if (ok) {
                            if (window.Win && window.Win.notify) {
                                window.Win.notify('Файл сохранён в Cooop Downloads', { type: 'success' });
                            }
                        }
                    } else if (window.SharedFiles && typeof window.SharedFiles.add === 'function') {
                        if (window.SharedFiles.ready) {
                            try { await window.SharedFiles.ready(); } catch(e) {}
                        }
                        const all = window.SharedFiles.get() || [];
                        let folder = all.find(f => f.isFolder && f.parentId === null && f.name === 'Cooop Downloads');
                        if (!folder) {
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
                            await window.SharedFiles.add(folder);
                        }
                        const ext = (parsed.name.split('.').pop() || '').toLowerCase();
                        await window.SharedFiles.add({
                            id: 'cooop_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
                            name: parsed.name,
                            size: blob.size,
                            type: parsed.mime,
                            data: dataUrl,
                            date: new Date().toISOString(),
                            extension: ext,
                            parentId: folder.id,
                            isFolder: false
                        });
                        if (window.Win && window.Win.notify) {
                            window.Win.notify('Файл сохранён в Cooop Downloads', { type: 'success' });
                        }
                    }
                };
                reader.readAsDataURL(blob);
            } catch(e) {
                log('save to filemanager error', e);
            }

            if (onStatus) onStatus('Файл: ' + parsed.name + ' (' + formatSize(unpacked.length) + ')');
        } catch(e) {
            log('downloadFromParsed', e);
            if (onStatus) onStatus('Ошибка: ' + e.message);
            if (window.Win && window.Win.notify) {
                window.Win.notify('Ошибка: ' + e.message, { type: 'error' });
            }
        }
    }

    function openCooop() {
        if (isOpen) {
            const ex = document.getElementById('cooopApp');
            if (ex) { ex.style.display = 'flex'; return; }
        }
        createUI();
    }

    function closeCooop() {
        isOpen = false;
        const el = document.getElementById('cooopApp');
        if (!el) return;
        if (location.pathname.indexOf('cooop.html') !== -1) {
            el.innerHTML = '';
        } else {
            if (window.ShnukCloseAnimation) {
                window.ShnukCloseAnimation(el, 'cooop', function() {
                    el.remove();
                });
            } else {
                el.remove();
            }
        }
    }

    function destroy() {
        isOpen = false;
        const el = document.getElementById('cooopApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') closeCooop();
    }

    function switchScreen(screen) {
        mode = screen;
        const container = document.getElementById('cooopContent');
        if (!container) return;
        container.innerHTML = '';
        if (screen === 'menu') renderMenu(container);
        else if (screen === 'send') renderSendScreen(container);
        else if (screen === 'receive') renderReceiveScreen(container);
    }

    function renderMenu(container) {
        container.innerHTML = `
            <div class="cooop-menu">
                <button class="cooop-menu-btn send" id="cooopSendBtn">
                    <span class="cooop-menu-title">СОЗДАТЬ ССЫЛКУ</span>
                    <span class="cooop-menu-desc">Выбрать файл и получить ссылку со сжатыми данными</span>
                </button>
                <button class="cooop-menu-btn receive" id="cooopReceiveBtn">
                    <span class="cooop-menu-title">СКАЧАТЬ ПО ССЫЛКЕ</span>
                    <span class="cooop-menu-desc">Вставить ссылку Cooop и скачать файл</span>
                </button>
            </div>
        `;
        document.getElementById('cooopSendBtn').addEventListener('click', function() {
            switchScreen('send');
        });
        document.getElementById('cooopReceiveBtn').addEventListener('click', function() {
            switchScreen('receive');
        });
    }

    function renderSendScreen(container) {
        container.innerHTML = `
            <div class="cooop-section">
                <div class="cooop-section-title">Выберите файл</div>
                <div class="cooop-file-select" id="cooopFileSelect">
                    <div class="cooop-file-select-icon">+</div>
                    <div class="cooop-file-select-text">Нажмите, чтобы выбрать файл</div>
                </div>
                <input type="file" id="cooopFileInput" style="display:none;" />
                <div class="cooop-file-info" id="cooopFileInfo" style="display:none;"></div>
                <div class="cooop-desc" style="margin-top:12px;">
                    Файл сжимается и кодируется в base64url.
                    Лимит до сжатия — 4 МБ.
                </div>
            </div>

            <div class="cooop-section" id="cooopLinkSection" style="display:none;">
                <div class="cooop-section-title">Ваша ссылка</div>
                <div class="cooop-desc" id="cooopLinkStats">—</div>
                <textarea class="cooop-link" id="cooopLinkText" readonly></textarea>
                <div class="cooop-hint" id="cooopCopyHint" style="display:none;">
                    Текст выделен — нажмите «Копировать» в системном меню
                </div>
                <button class="cooop-btn" id="cooopCopyLinkBtn">СКОПИРОВАТЬ ССЫЛКУ</button>
                <button class="cooop-btn-secondary" id="cooopOpenLinkBtn" style="margin-top:10px;">ОТКРЫТЬ ССЫЛКУ</button>
            </div>

            <div class="cooop-back-row">
                <button class="cooop-btn-secondary" id="cooopSendBack">← Назад</button>
            </div>
        `;

        const fileInput = document.getElementById('cooopFileInput');
        const fileSelect = document.getElementById('cooopFileSelect');
        const fileInfo = document.getElementById('cooopFileInfo');
        const linkSection = document.getElementById('cooopLinkSection');
        const linkText = document.getElementById('cooopLinkText');
        const linkStats = document.getElementById('cooopLinkStats');
        const copyHint = document.getElementById('cooopCopyHint');

        fileSelect.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async function() {
            if (!this.files || !this.files[0]) return;
            const f = this.files[0];

            if (f.size > MAX_FILE_SIZE) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify(
                        'Файл ' + formatSize(f.size) + ' — больше лимита ' + formatSize(MAX_FILE_SIZE),
                        { type: 'error', duration: 5000 }
                    );
                }
                return;
            }

            fileInfo.style.display = 'block';
            fileInfo.textContent = f.name + ' — ' + formatSize(f.size);
            fileSelect.querySelector('.cooop-file-select-icon').textContent = '✓';
            fileSelect.querySelector('.cooop-file-select-text').textContent = 'Сжатие...';

            try {
                const arrayBuffer = await f.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);

                const packed = await packFile(bytes);
                const link = buildLink(f.name, f.type || 'application/octet-stream', packed);

                const origSize = bytes.length;
                const packedSize = packed.data.length;
                const linkSize = link.length;
                const ratio = ((1 - packedSize / origSize) * 100).toFixed(1);
                const totalRatio = ((1 - linkSize / origSize) * 100).toFixed(1);

                const methodName = {
                    'd': 'deflate',
                    'r': 'RLE',
                    'dr': 'deflate + RLE',
                    'n': 'без сжатия'
                }[packed.method] || packed.method;

                linkText.value = link;
                linkSection.style.display = 'block';
                linkStats.innerHTML =
                    'Исходно: <b>' + formatSize(origSize) + '</b> • ' +
                    'Сжато (' + methodName + '): <b>' + formatSize(packedSize) + '</b> (−' + ratio + '%)<br>' +
                    'Длина ссылки: <b>' + formatSize(linkSize) + '</b> ' +
                    (linkSize < origSize
                        ? '(меньше оригинала на ' + totalRatio + '%)'
                        : '(больше оригинала на ' + Math.abs(totalRatio) + '%)');

                fileSelect.querySelector('.cooop-file-select-text').textContent = 'Файл сжат';
            } catch(e) {
                log('pack error', e);
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Ошибка сжатия: ' + e.message, { type: 'error' });
                }
                fileSelect.querySelector('.cooop-file-select-text').textContent = 'Ошибка';
            }
        });

        linkText.addEventListener('click', function() {
            selectAllInField(linkText);
        });
        linkText.addEventListener('focus', function() {
            selectAllInField(linkText);
        });

        document.getElementById('cooopCopyLinkBtn').addEventListener('click', async function() {
            const link = linkText.value.trim();
            if (!link) return;

            const ok = await copyText(link, linkText);
            if (ok) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Ссылка скопирована', { type: 'success' });
                }
                if (copyHint) copyHint.style.display = 'none';
            } else {
                if (copyHint) copyHint.style.display = 'block';
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Текст выделен — скопируйте вручную', { type: 'info', duration: 4000 });
                }
            }
        });

        document.getElementById('cooopOpenLinkBtn').addEventListener('click', function() {
            const link = linkText.value.trim();
            if (!link) return;
            window.open(link, '_blank');
        });

        document.getElementById('cooopSendBack').addEventListener('click', function() {
            switchScreen('menu');
        });
    }

    function renderReceiveScreen(container) {
        container.innerHTML = `
            <div class="cooop-section">
                <div class="cooop-section-title">Вставьте ссылку Cooop</div>
                <div class="cooop-desc">Ссылка должна содержать #cooop=</div>
                <textarea class="cooop-link" id="cooopInputLink" placeholder="Вставьте ссылку сюда..."></textarea>
                <button class="cooop-btn" id="cooopDownloadBtn">СКАЧАТЬ ФАЙЛ</button>
                <div class="cooop-status" id="cooopRecvStatus" style="margin-top:12px;"></div>
            </div>

            <div class="cooop-back-row">
                <button class="cooop-btn-secondary" id="cooopRecvBack">← Назад</button>
            </div>
        `;

        const input = document.getElementById('cooopInputLink');
        const btn = document.getElementById('cooopDownloadBtn');
        const status = document.getElementById('cooopRecvStatus');

        btn.addEventListener('click', async function() {
            const link = input.value.trim();
            if (!link) {
                status.textContent = 'Вставьте ссылку';
                return;
            }

            const parsed = parseLink(link);
            if (!parsed) {
                status.textContent = 'Неверный формат ссылки';
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Неверный формат ссылки', { type: 'error' });
                }
                return;
            }

            status.textContent = 'Распаковка...';
            await downloadFromParsed(parsed, function(s) {
                status.textContent = s;
            });
        });

        document.getElementById('cooopRecvBack').addEventListener('click', function() {
            switchScreen('menu');
        });
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function checkHashOnLoad() {
        if (!location.hash || location.hash.indexOf('#cooop=') !== 0) return;
        const parsed = parseLink(location.hash);
        if (!parsed) return;
        pendingHashParse = parsed;
    }

    function createUI() {
        let root = document.getElementById('cooopApp');
        if (root) {
            root.style.display = 'flex';
            isOpen = true;
            return;
        }

        injectStyles();

        root = document.createElement('div');
        root.id = 'cooopApp';
        root.style.cssText = `
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
            animation: cooopFadeIn 0.3s ease forwards;
            transition: background 0.4s ease, color 0.4s ease;
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.className = 'cooop-header';
        header.innerHTML = `
            <h1>Cooop</h1>
            <div class="cooop-header-actions">
                <button id="cooopCloseBtn">✕</button>
            </div>
        `;

        const content = document.createElement('div');
        content.className = 'cooop-content';
        content.id = 'cooopContent';

        root.appendChild(header);
        root.appendChild(content);
        document.body.appendChild(root);

        document.getElementById('cooopCloseBtn').addEventListener('click', closeCooop);
        document.addEventListener('keydown', onKeyDown);

        isOpen = true;

        if (pendingHashParse) {
            switchScreen('receive');
            const input = document.getElementById('cooopInputLink');
            if (input) input.value = location.href;
            const status = document.getElementById('cooopRecvStatus');
            if (status) status.textContent = 'Файл: ' + pendingHashParse.name;
            if (window.Win && window.Win.notify) {
                window.Win.notify('Получен файл: ' + pendingHashParse.name, { type: 'info' });
            }
            downloadFromParsed(pendingHashParse, function(s) {
                if (status) status.textContent = s;
            });
        } else {
            switchScreen('menu');
        }
    }

    function injectStyles() {
        if (document.getElementById('cooopStyles')) return;
        const style = document.createElement('style');
        style.id = 'cooopStyles';
        style.textContent = `
            @keyframes cooopFadeIn { from { opacity: 0; } to { opacity: 1; } }

            #cooopApp, #cooopApp * {
                font-family: ${FONT_MAIN} !important;
            }

            .cooop-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                background: var(--header-bg);
                border-bottom: 2px solid var(--border-color);
                flex-shrink: 0;
                color: var(--header-text);
            }
            .cooop-header h1 {
                font-size: 20px;
                font-weight: 600;
                margin: 0;
            }
            .cooop-header-actions button {
                background: var(--bg-primary);
                border: 2px solid var(--accent);
                color: var(--accent);
                font-size: 18px;
                padding: 4px 12px;
                cursor: pointer;
                font-family: inherit;
                transition: all 0.2s ease;
            }
            .cooop-header-actions button:hover {
                background: var(--accent);
                color: var(--text-on-accent);
            }

            .cooop-content {
                position: relative;
                flex: 1;
                overflow-y: auto;
                padding: 24px;
                isolation: isolate;
            }

            .cooop-menu {
                max-width: 640px;
                margin: 0 auto;
                display: flex;
                flex-direction: column;
                gap: 20px;
            }
            .cooop-menu-btn {
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 32px 28px;
                border: 2px solid var(--border-color);
                background: var(--bg-secondary);
                color: var(--text-primary);
                cursor: pointer;
                text-align: left;
                transition: all 0.2s ease;
                font-family: inherit;
            }
            .cooop-menu-btn:hover {
                border-color: var(--accent);
                background: var(--bg-primary);
            }
            .cooop-menu-btn.send:hover { border-color: #4CAF50; }
            .cooop-menu-btn.receive:hover { border-color: #3366cc; }
            .cooop-menu-title {
                font-size: 20px;
                font-weight: 700;
                letter-spacing: 0.5px;
            }
            .cooop-menu-desc {
                font-size: 13px;
                color: var(--text-muted);
                line-height: 1.5;
            }

            .cooop-section {
                max-width: 640px;
                margin: 0 auto 24px;
                background: var(--bg-secondary);
                border: 2px solid var(--border-color);
                padding: 20px;
                box-sizing: border-box;
            }
            .cooop-section-title {
                font-size: 15px;
                font-weight: 700;
                color: var(--text-primary);
                margin-bottom: 10px;
                letter-spacing: 0.3px;
            }
            .cooop-desc {
                font-size: 12px;
                color: var(--text-muted);
                line-height: 1.5;
                margin-bottom: 12px;
            }
            .cooop-desc b {
                color: var(--text-primary);
                font-weight: 700;
            }

            .cooop-file-select {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 10px;
                padding: 32px 20px;
                border: 2px dashed var(--border-color);
                cursor: pointer;
                transition: border-color 0.2s;
                background: var(--bg-primary);
            }
            .cooop-file-select:hover {
                border-color: var(--accent);
            }
            .cooop-file-select-icon {
                width: 48px;
                height: 48px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--accent);
                color: var(--text-on-accent);
                font-size: 28px;
                font-weight: 700;
            }
            .cooop-file-select-text {
                font-size: 13px;
                color: var(--text-muted);
            }
            .cooop-file-info {
                margin-top: 12px;
                font-size: 13px;
                color: var(--text-primary);
                padding: 10px 12px;
                background: var(--bg-primary);
                border: 2px solid var(--border-color);
                word-break: break-all;
            }

            .cooop-link {
                width: 100%;
                min-height: 120px;
                padding: 12px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary);
                color: var(--text-primary);
                font-family: 'Courier New', monospace;
                font-size: 11px;
                line-height: 1.4;
                resize: vertical;
                box-sizing: border-box;
                outline: none;
                margin-bottom: 12px;
                word-break: break-all;
                -webkit-user-select: text;
                user-select: text;
            }
            .cooop-link:focus {
                border-color: var(--accent);
            }

            .cooop-hint {
                font-size: 12px;
                color: var(--accent);
                line-height: 1.4;
                margin-bottom: 12px;
                padding: 8px 10px;
                background: var(--bg-hover);
                border-left: 3px solid var(--accent);
            }

            .cooop-btn {
                display: block;
                width: 100%;
                padding: 14px 20px;
                border: none;
                background: var(--accent);
                color: var(--text-on-accent);
                cursor: pointer;
                font-family: inherit;
                font-size: 14px;
                font-weight: 700;
                letter-spacing: 1px;
                transition: background 0.2s;
            }
            .cooop-btn:hover {
                background: var(--accent-dark);
            }
            .cooop-btn-secondary {
                display: block;
                width: 100%;
                padding: 12px 20px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary);
                color: var(--text-primary);
                cursor: pointer;
                font-family: inherit;
                font-size: 13px;
                font-weight: 600;
                transition: all 0.2s;
            }
            .cooop-btn-secondary:hover {
                border-color: var(--accent);
                color: var(--accent);
            }

            .cooop-status {
                font-size: 13px;
                color: var(--text-muted);
                word-break: break-all;
                min-height: 18px;
            }

            .cooop-back-row {
                max-width: 640px;
                margin: 0 auto 24px;
            }

            @media (max-width: 500px) {
                .cooop-content { padding: 16px; }
                .cooop-menu-btn { padding: 22px 20px; }
                .cooop-menu-title { font-size: 17px; }
                .cooop-menu-desc { font-size: 12px; }
                .cooop-section { padding: 16px; }
                .cooop-section-title { font-size: 14px; }
                .cooop-link { font-size: 10px; min-height: 100px; }
            }
        `;
        document.head.appendChild(style);
    }

    checkHashOnLoad();

    window.addEventListener('hashchange', function() {
        if (!location.hash || location.hash.indexOf('#cooop=') !== 0) return;
        const parsed = parseLink(location.hash);
        if (!parsed) return;
        pendingHashParse = parsed;
        if (isOpen) {
            downloadFromParsed(parsed, function(s) {
                const status = document.getElementById('cooopRecvStatus');
                if (status) status.textContent = s;
            });
        }
    });

    window.Cooop = {
        destroy: destroy,
        open: openCooop,
        shareFile: shareFile,
        MAX_FILE_SIZE: MAX_FILE_SIZE
    };
    window.CooopShare = {
        shareFile: shareFile
    };
    window.cooopInit = function() { openCooop(); };

})();