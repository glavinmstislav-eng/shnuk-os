// cooop.js — Shnuk Cooop (шаринг файлов с чанками)

(function() {
    'use strict';

    const SHARES_COLLECTION = 'cooop_shares';
    const CHUNKS_SUBCOLLECTION = 'chunks';
    const SHARE_PAGE = 'CooopShare.html';
    const KEEP_FLAG = 'cooop_keep_after_download';

    const CHUNK_SIZE = 700000;
    const MAX_FILE_SIZE = 50 * 1024 * 1024;

    let isOpen = false;
    let shares = [];
    let sharesUnsubscribe = null;

    function log() {
        try { console.log.apply(console, ['[Cooop]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }
    function err() {
        try { console.warn.apply(console, ['[Cooop]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    function randomId() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let out = '';
        for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
        out += '_' + Date.now().toString(36);
        return out;
    }

    function buildShareUrl(id) {
        return location.origin + location.pathname.replace(/[^/]*$/, '') + SHARE_PAGE + '?id=' + id;
    }

    async function ensureAuth() {
        if (window.__firebaseReady) {
            try { await window.__firebaseReady; } catch(e) {}
        }
        if (window.__firebaseAuthReady) {
            try { await window.__firebaseAuthReady; } catch(e) {}
        }
        if (!window.firebaseAuth) return null;
        let tries = 0;
        while (!window.firebaseAuth.currentUser && tries < 30) {
            tries++;
            await new Promise(function(r) { setTimeout(r, 100); });
        }
        if (!window.firebaseAuth.currentUser) return null;
        try { await window.firebaseAuth.currentUser.getIdToken(true); } catch(e) {}
        return window.firebaseAuth.currentUser;
    }

    function friendlyError(e) {
        if (!e) return 'неизвестная ошибка';
        if (e.code === 'permission-denied') return 'Нет доступа к Firestore. Проверьте правила.';
        if (e.code === 'unauthenticated') return 'Сессия истекла. Войдите заново.';
        if (e.code === 'not-found') return 'Файл не найден.';
        if (e.code === 'unavailable') return 'Нет соединения с Firestore.';
        if (e.code === 'resource-exhausted') return 'Превышен лимит Firestore. Попробуйте позже.';
        return (e.code ? e.code + ': ' : '') + (e.message || '');
    }

    function isKeepEnabled() {
        try { return localStorage.getItem(KEEP_FLAG) === 'true'; } catch(e) { return false; }
    }

    async function purgeShare(id) {
        if (!window.firebaseDb || !window.firebaseSDK) return;
        const { doc, deleteDoc, collection, getDocs } = window.firebaseSDK;
        try {
            const chunksRef = collection(window.firebaseDb, SHARES_COLLECTION, id, CHUNKS_SUBCOLLECTION);
            const snap = await getDocs(chunksRef);
            const deletions = [];
            snap.forEach(function(d) {
                deletions.push(deleteDoc(d.ref));
            });
            await Promise.allSettled(deletions);
        } catch(e) {
            err('purgeShare chunks:', e);
        }
        try {
            await deleteDoc(doc(window.firebaseDb, SHARES_COLLECTION, id));
        } catch(e) {
            err('purgeShare parent:', e);
        }
    }

    async function shareFile(fileData, onProgress) {
        const user = await ensureAuth();
        if (!user) {
            if (window.Win && window.Win.notify) window.Win.notify('Войдите в Firebase', { type: 'error' });
            return null;
        }
        if (!window.firebaseDb || !window.firebaseSDK) {
            if (window.Win && window.Win.notify) window.Win.notify('Firebase не готов', { type: 'error' });
            return null;
        }

        const data = fileData.data || '';
        const dataLen = data.length;
        if (dataLen === 0) {
            if (window.Win && window.Win.notify) window.Win.notify('Пустые данные файла', { type: 'error' });
            return null;
        }

        const realSize = fileData.size || Math.round(dataLen * 0.75);
        if (realSize > MAX_FILE_SIZE) {
            const mb = (realSize / (1024 * 1024)).toFixed(1);
            if (window.Win && window.Win.notify) {
                window.Win.notify('Файл слишком большой: ' + mb + ' МБ. Лимит 50 МБ.', { type: 'error', duration: 5000 });
            }
            return null;
        }

        const { doc, setDoc, collection, serverTimestamp } = window.firebaseSDK;
        const id = randomId();

        try {
            await purgeShare(id);

            const chunkCount = Math.ceil(dataLen / CHUNK_SIZE);

            await setDoc(doc(window.firebaseDb, SHARES_COLLECTION, id), {
                id: id,
                ownerUid: user.uid,
                name: fileData.name || 'file',
                type: fileData.type || 'application/octet-stream',
                size: realSize,
                extension: fileData.extension || '',
                chunkCount: chunkCount,
                keepAfterDownload: isKeepEnabled(),
                createdAt: serverTimestamp()
            });

            if (onProgress) onProgress(0, chunkCount);

            for (let i = 0; i < chunkCount; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, dataLen);
                const chunkData = data.substring(start, end);

                const chunkRef = doc(
                    collection(window.firebaseDb, SHARES_COLLECTION, id, CHUNKS_SUBCOLLECTION),
                    String(i)
                );
                await setDoc(chunkRef, {
                    index: i,
                    data: chunkData
                });

                if (onProgress) onProgress(i + 1, chunkCount);
            }

            const url = buildShareUrl(id);
            log('Файл опубликован чанками:', id, 'чанков:', chunkCount);
            return url;
        } catch(e) {
            err('shareFile:', e);
            try { await purgeShare(id); } catch(cleanupErr) {}
            if (window.Win && window.Win.notify) window.Win.notify('Ошибка: ' + friendlyError(e), { type: 'error' });
            return null;
        }
    }

    async function deleteShare(id) {
        if (!window.firebaseDb || !window.firebaseSDK) return false;
        const { doc, deleteDoc, collection, getDocs } = window.firebaseSDK;
        try {
            const chunksRef = collection(window.firebaseDb, SHARES_COLLECTION, id, CHUNKS_SUBCOLLECTION);
            const snap = await getDocs(chunksRef);
            const deletions = [];
            snap.forEach(function(d) {
                deletions.push(deleteDoc(d.ref));
            });
            await Promise.allSettled(deletions);

            await deleteDoc(doc(window.firebaseDb, SHARES_COLLECTION, id));
            return true;
        } catch(e) {
            err('deleteShare:', e);
            return false;
        }
    }

    function openCooop() {
        if (isOpen) {
            const ex = document.getElementById('cooopApp');
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }
        createUI();
    }

    function closeCooop() {
        isOpen = false;
        if (sharesUnsubscribe) {
            try { sharesUnsubscribe(); } catch(e) {}
            sharesUnsubscribe = null;
        }
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
        if (sharesUnsubscribe) {
            try { sharesUnsubscribe(); } catch(e) {}
            sharesUnsubscribe = null;
        }
        const el = document.getElementById('cooopApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') closeCooop();
    }

    async function loadMyShares() {
        const user = await ensureAuth();
        if (!user) return;
        if (!window.firebaseDb || !window.firebaseSDK) return;

        const { collection, query, where, onSnapshot } = window.firebaseSDK;
        try {
            const q = query(
                collection(window.firebaseDb, SHARES_COLLECTION),
                where('ownerUid', '==', user.uid)
            );
            sharesUnsubscribe = onSnapshot(q, function(snap) {
                shares = [];
                snap.forEach(function(d) {
                    shares.push(d.data());
                });
                shares.sort(function(a, b) {
                    const ta = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
                    const tb = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
                    return tb - ta;
                });
                renderShares();
            }, function(er) {
                err('onSnapshot shares:', er);
            });
        } catch(e) {
            err('loadMyShares:', e);
        }
    }

    function getFileIcon(extension, type) {
        const ext = (extension || '').toLowerCase();
        if (['jpg','jpeg','png','gif','bmp','webp','svg','ico'].indexOf(ext) !== -1) return 'IMG';
        if (['mp4','webm','ogg','mov','avi','mkv'].indexOf(ext) !== -1) return 'VID';
        if (['mp3','wav','ogg','flac','aac','m4a'].indexOf(ext) !== -1) return 'AUD';
        if (['txt','json','xml','html','css','js','md'].indexOf(ext) !== -1) return 'TXT';
        if (['obj','fbx','gltf','glb','stl','3ds','ply'].indexOf(ext) !== -1) return '3D';
        if (ext) return ext.charAt(0).toUpperCase();
        return 'FILE';
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    function buildCard(share) {
        const url = buildShareUrl(share.id);
        const sizeStr = formatSize(share.size);
        const keepLabel = share.keepAfterDownload ? ' • Сохраняется' : '';

        const card = document.createElement('div');
        card.className = 'cooop-card';
        card.innerHTML = `
            <div class="cooop-card-icon">${escapeHtml(getFileIcon(share.extension, share.type))}</div>
            <div class="cooop-card-body">
                <div class="cooop-card-name">${escapeHtml(share.name || 'Файл')}</div>
                <div class="cooop-card-meta">${sizeStr}${share.extension ? ' • ' + escapeHtml((share.extension || '').toUpperCase()) : ''}${keepLabel}</div>
                <input type="text" readonly value="${escapeHtml(url)}" class="cooop-card-url" />
                <div class="cooop-card-actions">
                    <button class="cooop-card-btn primary" data-action="copy">Скопировать</button>
                    <button class="cooop-card-btn" data-action="open">Открыть</button>
                    <button class="cooop-card-btn danger" data-action="delete">Удалить</button>
                </div>
            </div>
        `;

        const copyBtn = card.querySelector('[data-action="copy"]');
        copyBtn.addEventListener('click', function() {
            try {
                const ta = document.createElement('textarea');
                ta.value = url;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                if (window.Win && window.Win.notify) window.Win.notify('Ссылка скопирована', { type: 'success' });
            } catch(ex) {
                if (navigator.clipboard) navigator.clipboard.writeText(url);
            }
        });

        const openBtn = card.querySelector('[data-action="open"]');
        openBtn.addEventListener('click', function() {
            window.open(url, '_blank');
        });

        const delBtn = card.querySelector('[data-action="delete"]');
        delBtn.addEventListener('click', function() {
            if (confirm('Удалить ссылку?')) {
                deleteShare(share.id).then(function(ok) {
                    if (ok && window.Win && window.Win.notify) window.Win.notify('Ссылка удалена', { type: 'success' });
                });
            }
        });

        return card;
    }

    function renderShares() {
        const container = document.getElementById('cooopSharesList');
        if (!container) return;

        if (shares.length === 0) {
            container.innerHTML = '<div class="cooop-empty">Пока нет опубликованных файлов</div>';
            return;
        }

        container.innerHTML = '';
        shares.forEach(function(share) {
            container.appendChild(buildCard(share));
        });
    }

    function createUI() {
        if (document.getElementById('cooopApp')) {
            document.getElementById('cooopApp').style.display = 'flex';
            loadMyShares();
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
            font-family: 'ST-SimpleSquare', monospace;
            color: var(--text-primary);
            opacity: 0;
            animation: cooopFadeIn 0.3s ease forwards;
            transition: background 0.4s ease, color 0.4s ease;
        `;

        if (!document.getElementById('cooopStyles')) {
            const style = document.createElement('style');
            style.id = 'cooopStyles';
            style.textContent = `
                @keyframes cooopFadeIn { from { opacity: 0; } to { opacity: 1; } }

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
                    font-family: 'ST-SimpleSquare', monospace;
                    transition: all 0.2s ease;
                }
                .cooop-header-actions button:hover {
                    background: var(--accent);
                    color: var(--text-on-accent);
                }

                /* Размытие внизу при скролле */
                .cooop-content {
                    position: relative;
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px;
                    isolation: isolate;
                }
                .cooop-content::after {
                    content: '';
                    position: sticky;
                    display: block;
                    bottom: -24px;
                    left: -24px;
                    right: -24px;
                    height: 80px;
                    margin-top: -80px;
                    pointer-events: none;
                    z-index: 20;
                    -webkit-backdrop-filter: blur(12px);
                    backdrop-filter: blur(12px);
                    -webkit-mask-image: linear-gradient(to top, #000 0%, #000 40%, transparent 100%);
                    mask-image: linear-gradient(to top, #000 0%, #000 40%, transparent 100%);
                }

                .cooop-title {
                    max-width: 640px;
                    margin: 0 auto 16px;
                    font-size: 15px;
                    font-weight: 600;
                    color: var(--text-primary);
                }
                .cooop-desc {
                    max-width: 640px;
                    margin: 0 auto 24px;
                    font-size: 13px;
                    color: var(--text-muted);
                    line-height: 1.5;
                }

                .cooop-list {
                    max-width: 640px;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                }

                .cooop-card {
                    display: flex;
                    gap: 14px;
                    background: var(--bg-secondary);
                    border: 2px solid var(--border-color);
                    padding: 16px;
                    transition: border-color 0.2s ease, background 0.2s ease;
                }
                .cooop-card:hover {
                    border-color: var(--accent);
                }
                .cooop-card-icon {
                    width: 52px;
                    height: 52px;
                    flex-shrink: 0;
                    background: var(--accent);
                    color: var(--text-on-accent);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 15px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                }
                .cooop-card-body {
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .cooop-card-name {
                    font-size: 15px;
                    font-weight: 700;
                    color: var(--text-primary);
                    word-break: break-word;
                    line-height: 1.3;
                }
                .cooop-card-meta {
                    font-size: 11px;
                    color: var(--text-muted);
                }
                .cooop-card-url {
                    width: 100%;
                    padding: 8px 10px;
                    border: 1px solid var(--border-color);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 11px;
                    box-sizing: border-box;
                    outline: none;
                }
                .cooop-card-actions {
                    display: flex;
                    gap: 6px;
                    margin-top: 4px;
                    flex-wrap: wrap;
                }
                .cooop-card-btn {
                    padding: 7px 14px;
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    border: 2px solid var(--border-color);
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 12px;
                    font-weight: 600;
                    transition: all 0.15s ease;
                    flex: 1;
                    min-width: 90px;
                }
                .cooop-card-btn:hover {
                    border-color: var(--accent);
                    color: var(--accent);
                }
                .cooop-card-btn.primary {
                    background: var(--accent);
                    color: var(--text-on-accent);
                    border-color: var(--accent);
                }
                .cooop-card-btn.primary:hover {
                    background: var(--accent-dark);
                    border-color: var(--accent-dark);
                    color: var(--text-on-accent);
                }
                .cooop-card-btn.danger {
                    color: var(--accent);
                    border-color: var(--accent);
                }
                .cooop-card-btn.danger:hover {
                    background: var(--accent);
                    color: var(--text-on-accent);
                }

                .cooop-empty {
                    text-align: center;
                    color: var(--text-muted);
                    padding: 60px 20px;
                    font-size: 14px;
                }

                @media (max-width: 500px) {
                    .cooop-content { padding: 16px; }
                    .cooop-content::after { bottom: -16px; left: -16px; right: -16px; }
                    .cooop-card { padding: 12px; gap: 10px; }
                    .cooop-card-icon { width: 44px; height: 44px; font-size: 13px; }
                    .cooop-card-name { font-size: 14px; }
                    .cooop-card-url { font-size: 10px; }
                    .cooop-card-btn { font-size: 10px; padding: 6px 10px; min-width: 70px; }
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
        content.innerHTML = `
            <div class="cooop-title">Опубликованные файлы</div>
            <div class="cooop-desc">Файлы до 50 МБ. Ссылку можно отправить любому — он скачает файл через CooopShare.</div>
            <div class="cooop-list" id="cooopSharesList">
                <div class="cooop-empty">Загрузка...</div>
            </div>
        `;

        app.appendChild(header);
        app.appendChild(content);
        document.body.appendChild(app);

        document.getElementById('cooopCloseBtn').addEventListener('click', closeCooop);
        document.addEventListener('keydown', onKeyDown);

        loadMyShares();
    }

    window.Cooop = {
        destroy: destroy,
        open: openCooop,
        shareFile: shareFile,
        deleteShare: deleteShare,
        purgeShare: purgeShare,
        isKeepEnabled: isKeepEnabled,
        CHUNK_SIZE: CHUNK_SIZE,
        MAX_FILE_SIZE: MAX_FILE_SIZE
    };
    window.cooopInit = function() { openCooop(); };

})();