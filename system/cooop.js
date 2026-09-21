// cooop.js — Shnuk Cooop (шаринг файлов с чанками)

(function() {
    'use strict';

    const SHARES_COLLECTION = 'cooop_shares';
    const CHUNKS_SUBCOLLECTION = 'chunks';
    const SHARE_PAGE = 'CooopShare.html';

    // Firestore: 1 МиБ на документ. base64 раздувает в 1.33x.
    // Берём 700 000 символов base64 на чанк (~525 КБ исходника),
    // чтобы с запасом уложиться.
    const CHUNK_SIZE = 700000;
    // Максимум 50 МБ исходника = ~67 МБ base64 = ~96 чанков.
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
        for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
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

    // =========================================
    // ПУБЛИКАЦИЯ С ЧАНКАМИ
    // =========================================
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

        // Проверка исходного размера
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
            // Разбиваем base64 на чанки
            const chunkCount = Math.ceil(dataLen / CHUNK_SIZE);

            // 1. Создаём родительский документ
            await setDoc(doc(window.firebaseDb, SHARES_COLLECTION, id), {
                id: id,
                ownerUid: user.uid,
                name: fileData.name || 'file',
                type: fileData.type || 'application/octet-stream',
                size: realSize,
                extension: fileData.extension || '',
                chunkCount: chunkCount,
                createdAt: serverTimestamp()
            });

            if (onProgress) onProgress(0, chunkCount);

            // 2. Пишем чанки последовательно
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
            // Если что-то пошло не так — пытаемся почистить
            try {
                const { doc, deleteDoc, collection, getDocs } = window.firebaseSDK;
                const chunksRef = collection(window.firebaseDb, SHARES_COLLECTION, id, CHUNKS_SUBCOLLECTION);
                const snap = await getDocs(chunksRef);
                const deletions = [];
                snap.forEach(function(d) {
                    deletions.push(deleteDoc(d.ref));
                });
                await Promise.allSettled(deletions);
                await deleteDoc(doc(window.firebaseDb, SHARES_COLLECTION, id));
            } catch(cleanupErr) {
                err('cleanup after error:', cleanupErr);
            }
            if (window.Win && window.Win.notify) window.Win.notify('Ошибка: ' + friendlyError(e), { type: 'error' });
            return null;
        }
    }

    // =========================================
    // УДАЛЕНИЕ (с чанками)
    // =========================================
    async function deleteShare(id) {
        if (!window.firebaseDb || !window.firebaseSDK) return false;
        const { doc, deleteDoc, collection, getDocs } = window.firebaseSDK;
        try {
            // Удаляем все чанки
            const chunksRef = collection(window.firebaseDb, SHARES_COLLECTION, id, CHUNKS_SUBCOLLECTION);
            const snap = await getDocs(chunksRef);
            const deletions = [];
            snap.forEach(function(d) {
                deletions.push(deleteDoc(d.ref));
            });
            await Promise.allSettled(deletions);

            // Удаляем родительский документ
            await deleteDoc(doc(window.firebaseDb, SHARES_COLLECTION, id));
            return true;
        } catch(e) {
            err('deleteShare:', e);
            return false;
        }
    }

    // =========================================
    // UI
    // =========================================
    function openCooop() {
        if (isOpen) {
            const ex = document.getElementById('cooopApp');
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }
        createUI();
    }

    function closeCooop() {
        isOpen = false;
        const el = document.getElementById('cooopApp');
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1'; }, 300);
        }
        if (sharesUnsubscribe) {
            try { sharesUnsubscribe(); } catch(e) {}
            sharesUnsubscribe = null;
        }
        document.removeEventListener('keydown', onKeyDown);
    }

    function destroy() {
        closeCooop();
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

    function renderShares() {
        const list = document.getElementById('cooopSharesList');
        if (!list) return;

        if (shares.length === 0) {
            list.innerHTML = '<div style="text-align:center;color:#888;padding:40px 20px;font-size:14px;">Пока нет опубликованных файлов</div>';
            return;
        }

        list.innerHTML = '';
        shares.forEach(function(s) {
            const url = buildShareUrl(s.id);
            const sizeStr = formatSize(s.size);
            const card = document.createElement('div');
            card.style.cssText = 'background:#f8f8f8;border:2px solid #e0e0e0;padding:16px;margin-bottom:12px;display:flex;gap:12px;align-items:center;';
            card.innerHTML = `
                <div style="flex:1;min-width:0;">
                    <div style="font-size:14px;font-weight:600;margin-bottom:4px;word-break:break-all;">${escapeHtml(s.name)}</div>
                    <div style="font-size:11px;color:#888;">${sizeStr} • ${escapeHtml(s.extension || '')}</div>
                    <input type="text" readonly value="${escapeHtml(url)}" style="width:100%;margin-top:8px;padding:6px 8px;border:1px solid #e0e0e0;font-family:'ST-SimpleSquare',monospace;font-size:11px;background:#fff;color:#333;box-sizing:border-box;" />
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
                    <button data-action="copy" data-url="${escapeHtml(url)}" style="padding:6px 12px;background:#cc0000;color:#fff;border:none;cursor:pointer;font-family:'ST-SimpleSquare',monospace;font-size:11px;">Скопировать</button>
                    <button data-action="open" data-url="${escapeHtml(url)}" style="padding:6px 12px;background:none;color:#333;border:2px solid #e0e0e0;cursor:pointer;font-family:'ST-SimpleSquare',monospace;font-size:11px;">Открыть</button>
                    <button data-action="delete" data-id="${escapeHtml(s.id)}" style="padding:6px 12px;background:none;color:#cc0000;border:2px solid #cc0000;cursor:pointer;font-family:'ST-SimpleSquare',monospace;font-size:11px;">Удалить</button>
                </div>
            `;
            list.appendChild(card);
        });

        list.querySelectorAll('button').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const action = this.dataset.action;
                if (action === 'copy') {
                    const url = this.dataset.url;
                    try {
                        const ta = document.createElement('textarea');
                        ta.value = url;
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                        if (window.Win && window.Win.notify) window.Win.notify('Ссылка скопирована', { type: 'success' });
                    } catch(e) {
                        if (navigator.clipboard) navigator.clipboard.writeText(url);
                    }
                } else if (action === 'open') {
                    window.open(this.dataset.url, '_blank');
                } else if (action === 'delete') {
                    const id = this.dataset.id;
                    if (confirm('Удалить ссылку?')) {
                        deleteShare(id).then(function(ok) {
                            if (ok && window.Win && window.Win.notify) window.Win.notify('Ссылка удалена', { type: 'success' });
                        });
                    }
                }
            });
        });
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
            background: #ffffff;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            font-family: 'ST-SimpleSquare', monospace;
            color: #1a1a1a;
            opacity: 0;
            animation: cooopFadeIn 0.3s ease forwards;
        `;

        if (!document.getElementById('cooopStyles')) {
            const style = document.createElement('style');
            style.id = 'cooopStyles';
            style.textContent = `
                @keyframes cooopFadeIn { from { opacity: 0; } to { opacity: 1; } }
                .cooop-header { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; background:#f5f5f5; border-bottom:2px solid #e0e0e0; flex-shrink:0; }
                .cooop-header h1 { font-size:20px; font-weight:600; margin:0; }
                .cooop-header-actions button { background:none; border:2px solid #cc0000; color:#cc0000; font-size:18px; padding:4px 12px; cursor:pointer; font-family:'ST-SimpleSquare',monospace; }
                .cooop-header-actions button:hover { background:#cc0000; color:#fff; }
                .cooop-content { flex:1; overflow-y:auto; padding:24px; }
                .cooop-title { max-width:640px; margin:0 auto 16px; font-size:15px; font-weight:600; color:#333; }
                .cooop-desc { max-width:640px; margin:0 auto 24px; font-size:13px; color:#888; line-height:1.5; }
                .cooop-list { max-width:640px; margin:0 auto; }
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
                <div style="text-align:center;color:#888;padding:40px 20px;font-size:14px;">Загрузка...</div>
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
        CHUNK_SIZE: CHUNK_SIZE,
        MAX_FILE_SIZE: MAX_FILE_SIZE
    };
    window.cooopInit = function() { openCooop(); };

})();