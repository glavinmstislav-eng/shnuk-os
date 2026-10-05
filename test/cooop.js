// cooop.js — Cooop: ссылки на файлы через сжатие + base64url

(function() {
    'use strict';

    const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 МБ до сжатия
    const FONT_MAIN = "'TTPaplane', monospace";
    const LINK_BASE = location.origin + location.pathname;

    let isOpen = false;
    let mode = 'menu';

    function log() {
        try { console.log.apply(console, ['[Cooop]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    // ============================================
    // СЖАТИЕ
    // ============================================

    function supportsCompression() {
        return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
    }

    async function compressBytes(bytes) {
        if (!supportsCompression()) return bytes;
        try {
            const cs = new CompressionStream('deflate');
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
            return bytes;
        }
    }

    async function decompressBytes(bytes) {
        if (!supportsCompression()) return bytes;
        try {
            const ds = new DecompressionStream('deflate');
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
            log('decompress error', e);
            return null;
        }
    }

    // ============================================
    // RLE — сжатие повторов
    // Формат: 0xFF <count> <byte>
    // 0xFF в исходнике экранируется как 0xFF 0x00 0xFF
    // ============================================

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

    // ============================================
    // УПАКОВКА
    // ============================================

    async function packFile(bytes) {
        const deflated = await compressBytes(bytes);
        const rleAfter = rleEncode(deflated);
        const rleOnly = rleEncode(bytes);

        let best = deflated;
        let method = 'd';
        let bestLen = deflated.length;

        if (rleAfter.length < bestLen) {
            best = rleAfter;
            method = 'dr';
            bestLen = rleAfter.length;
        }
        if (rleOnly.length < bestLen) {
            best = rleOnly;
            method = 'r';
            bestLen = rleOnly.length;
        }
        if (bytes.length < bestLen) {
            best = bytes;
            method = 'n';
        }

        return { data: best, method: method, originalSize: bytes.length };
    }

    async function unpackFile(bytes, method) {
        if (method === 'n') return bytes;

        let data = bytes;
        if (method === 'r' || method === 'dr') {
            data = rleDecode(data);
        }
        if (method === 'd' || method === 'dr') {
            data = await decompressBytes(data);
            if (!data) return null;
        }
        return data;
    }

    // ============================================
    // BASE64URL
    // ============================================

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
        let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    // ============================================
    // ССЫЛКИ
    // ============================================

    function buildLink(fileName, mime, packed) {
        const b64 = base64UrlEncode(packed.data);
        const safeName = encodeURIComponent(fileName);
        const safeMime = encodeURIComponent(mime || 'application/octet-stream');
        return LINK_BASE + '#cooop=' + safeName + '|' + safeMime + '|' + packed.method + '|' + b64;
    }

    function parseLink(hash) {
        if (!hash || hash.indexOf('#cooop=') !== 0) return null;
        const payload = hash.substring(7);
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

    // ============================================
    // СКАЧИВАНИЕ
    // ============================================

    async function downloadFromParsed(parsed, onStatus) {
        try {
            if (onStatus) onStatus('Распаковка...');
            const packedBytes = base64UrlDecode(parsed.b64);
            const unpacked = await unpackFile(packedBytes, parsed.method);
            if (!unpacked) {
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

            if (window.SharedFiles && typeof window.SharedFiles.add === 'function') {
                const reader = new FileReader();
                reader.onload = async function() {
                    const dataUrl = reader.result;
                    const ext = (parsed.name.split('.').pop() || '').toLowerCase();
                    if (window.SharedFiles.ready) {
                        try { await window.SharedFiles.ready(); } catch(e) {}
                    }
                    await window.SharedFiles.add({
                        id: 'cooop_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
                        name: parsed.name,
                        size: blob.size,
                        type: parsed.mime,
                        data: dataUrl,
                        date: new Date().toISOString(),
                        extension: ext,
                        parentId: null,
                        isFolder: false
                    });
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Файл сохранён в Файлы: ' + parsed.name, { type: 'success' });
                    }
                };
                reader.readAsDataURL(blob);
            }

            if (onStatus) onStatus('Файл: ' + parsed.name + ' (' + formatSize(unpacked.length) + ')');
        } catch(e) {
            log('downloadFromParsed', e);
            if (window.Win && window.Win.notify) {
                window.Win.notify('Ошибка: ' + e.message, { type: 'error' });
            }
        }
    }

    // ============================================
    // UI
    // ============================================

    function openCooop() {
        if (isOpen) {
            const ex = document.getElementById('cooopApp');
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }
        createUI();
    }

    function closeCooop() {
        isOpen = false;
        document.removeEventListener('keydown', onKeyDown);

        const el = document.getElementById('cooopApp');
        if (!el) return;

        if (window.ShnukCloseAnimation) {
            window.ShnukCloseAnimation(el, 'cooop', function() {
                el.remove();
            });
        } else {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 250);
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
                    Файл сжимается алгоритмом deflate + RLE, затем кодируется в base64url.
                    Итоговая ссылка обычно <b>меньше</b> исходного файла.
                    Лимит до сжатия — 4 МБ.
                </div>
            </div>

            <div class="cooop-section" id="cooopLinkSection" style="display:none;">
                <div class="cooop-section-title">Ваша ссылка</div>
                <div class="cooop-desc" id="cooopLinkStats">—</div>
                <textarea class="cooop-link" id="cooopLinkText" readonly></textarea>
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

        document.getElementById('cooopCopyLinkBtn').addEventListener('click', function() {
            const link = linkText.value.trim();
            if (!link) return;
            copyToClipboard(link);
            if (window.Win && window.Win.notify) {
                window.Win.notify('Ссылка скопирована', { type: 'success' });
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

            let hash = '';
            const hashIdx = link.indexOf('#cooop=');
            if (hashIdx !== -1) hash = link.substring(hashIdx);
            else if (link.indexOf('cooop=') === 0) hash = '#' + link;

            const parsed = parseLink(hash);
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

    // ============================================
    // ХЕЛПЕРЫ
    // ============================================

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).catch(function() {});
        }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        } catch(e) {}
    }

    // ============================================
    // АВТОСКАЧИВАНИЕ ПО HASH
    // ============================================

    async function checkHashOnLoad() {
        if (!location.hash || location.hash.indexOf('#cooop=') !== 0) return;
        const parsed = parseLink(location.hash);
        if (!parsed) return;

        setTimeout(async function() {
            openCooop();
            switchScreen('receive');
            const input = document.getElementById('cooopInputLink');
            if (input) input.value = location.href;
            const status = document.getElementById('cooopRecvStatus');
            if (status) status.textContent = 'Файл: ' + parsed.name;
            if (window.Win && window.Win.notify) {
                window.Win.notify('Получен файл: ' + parsed.name, { type: 'info' });
            }
            await downloadFromParsed(parsed, function(s) {
                if (status) status.textContent = s;
            });
        }, 600);
    }

    // ============================================
    // UI CARCASS
    // ============================================

    function createUI() {
        if (document.getElementById('cooopApp')) {
            document.getElementById('cooopApp').style.display = 'flex';
            return;
        }
        isOpen = true;

        const app = document.createElement('div');
        app.id = 'cooopApp';
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
            animation: cooopFadeIn 0.3s ease forwards;
            transition: background 0.4s ease, color 0.4s ease;
            overflow: hidden;
        `;

        if (!document.getElementById('cooopStyles')) {
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
                }
                .cooop-link:focus {
                    border-color: var(--accent);
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
                    .cooop-link { font-size: 10px; min-height: 90px; }
                }
            `;
            document.head.appendChild(style);
        }

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

        app.appendChild(header);
        app.appendChild(content);
        document.body.appendChild(app);

        document.getElementById('cooopCloseBtn').addEventListener('click', closeCooop);
        document.addEventListener('keydown', onKeyDown);

        switchScreen('menu');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkHashOnLoad);
    } else {
        checkHashOnLoad();
    }
    window.addEventListener('hashchange', checkHashOnLoad);

    window.Cooop = {
        destroy: destroy,
        open: openCooop,
        MAX_FILE_SIZE: MAX_FILE_SIZE
    };
    window.cooopInit = function() { openCooop(); };

})();