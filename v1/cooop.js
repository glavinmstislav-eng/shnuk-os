// cooop.js — Shnuk Cooop (шаринг файлов)

(function() {
    'use strict';

    const SHARES_COLLECTION = 'cooop_shares';
    const SHARE_PAGE = 'CooopShare.html';
    const TTL_MS = 24 * 60 * 60 * 1000;
    const PURGE_INTERVAL_MS = 10 * 60 * 1000;

    let isOpen = false;
    let shares = [];
    let sharesUnsubscribe = null;
    let purgeTimer = null;

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
        return (e.code ? e.code + ': ' : '') + (e.message || '');
    }

    function getExpiryMs(share) {
        if (!share || !share.expiresAt) return 0;
        if (share.expiresAt.seconds) return share.expiresAt.seconds * 1000;
        const t = new Date(share.expiresAt).getTime();
        return isNaN(t) ? 0 : t;
    }

    function isExpired(share) {
        const t = getExpiryMs(share);
        if (!t) return false;
        return Date.now() >= t;
    }

    function formatTtl(share) {
        const t = getExpiryMs(share);
        if (!t) return '';
        const left = t - Date.now();
        if (left <= 0) return 'истекла';
        const h = Math.floor(left / 3600000);
        const m = Math.floor((left % 3600000) / 60000);
        if (h > 0) return 'осталось ' + h + ' ч ' + m + ' мин';
        return 'осталось ' + m + ' мин';
    }

    async function purgeExpired() {
        if (!window.firebaseDb || !window.firebaseSDK) return 0;
        const user = await ensureAuth();
        if (!user) return 0;

        const { collection, getDocs, doc, deleteDoc } = window.firebaseSDK;
        let removed = 0;

        try {
            const snap = await getDocs(collection(window.firebaseDb, SHARES_COLLECTION));
            const now = Date.now();
            const deletions = [];

            snap.forEach(function(d) {
                const data = d.data();
                const t = getExpiryMs(data);
                if (t && now >= t) {
                    deletions.push(deleteDoc(doc(window.firebaseDb, SHARES_COLLECTION, d.id)));
                }
            });

            if (deletions.length > 0) {
                const results = await Promise.allSettled(deletions);
                results.forEach(function(r) {
                    if (r.status === 'fulfilled') removed++;
                    else err('purge delete:', r.reason);
                });
                log('Удалено просроченных ссылок:', removed);
            }
        } catch(e) {
            err('purgeExpired:', e);
        }

        return removed;
    }

    function startPurgeTimer() {
        if (purgeTimer) return;
        purgeExpired();
        purgeTimer = setInterval(function() {
            purgeExpired();
        }, PURGE_INTERVAL_MS);
    }

    function stopPurgeTimer() {
        if (purgeTimer) {
            clearInterval(purgeTimer);
            purgeTimer = null;
        }
    }

    async function shareFile(fileData) {
        const user = await ensureAuth();
        if (!user) {
            if (window.Win && window.Win.notify) window.Win.notify('Войдите в Firebase', { type: 'error' });
            return null;
        }
        if (!window.firebaseDb || !window.firebaseSDK) {
            if (window.Win && window.Win.notify) window.Win.notify('Firebase не готов', { type: 'error' });
            return null;
        }

        const { doc, setDoc, serverTimestamp } = window.firebaseSDK;
        const id = randomId();

        try {
            await setDoc(doc(window.firebaseDb, SHARES_COLLECTION, id), {
                id: id,
                ownerUid: user.uid,
                ownerEmail: user.email,
                name: fileData.name || 'file',
                type: fileData.type || 'application/octet-stream',
                size: fileData.size || 0,
                extension: fileData.extension || '',
                data: fileData.data,
                createdAt: serverTimestamp(),
                expiresAt: new Date(Date.now() + TTL_MS)
            });

            const url = buildShareUrl(id);
            log('Файл опубликован на 24 часа:', id);
            return url;
        } catch(e) {
            err('shareFile:', e);
            if (window.Win && window.Win.notify) window.Win.notify('Ошибка: ' + friendlyError(e), { type: 'error' });
            return null;
        }
    }

    async function deleteShare(id) {
        if (!window.firebaseDb || !window.firebaseSDK) return false;
        const { doc, deleteDoc } = window.firebaseSDK;
        try {
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
        stopPurgeTimer();
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

        const { collection, query, where, onSnapshot, doc, deleteDoc } = window.firebaseSDK;
        try {
            const q = query(
                collection(window.firebaseDb, SHARES_COLLECTION),
                where('ownerUid', '==', user.uid)
            );
            sharesUnsubscribe = onSnapshot(q, function(snap) {
                const raw = [];
                snap.forEach(function(d) { raw.push(d.data()); });

                const expired = raw.filter(isExpired);
                const alive = raw.filter(function(s) { return !isExpired(s); });

                if (expired.length > 0) {
                    const now = Date.now();
                    expired.forEach(function(s) {
                        const t = getExpiryMs(s);
                        if (t && now >= t) {
                            deleteDoc(doc(window.firebaseDb, SHARES_COLLECTION, s.id))
                                .catch(function(e) { err('snapshot delete:', e); });
                        }
                    });
                }

                shares = alive;
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
            const ttlStr = formatTtl(s);
            const card = document.createElement('div');
            card.style.cssText = 'background:#f8f8f8;border:2px solid #e0e0e0;padding:16px;margin-bottom:12px;display:flex;gap:12px;align-items:center;';
            card.innerHTML = `
                <div style="flex:1;min-width:0;">
                    <div style="font-size:14px;font-weight:600;margin-bottom:4px;word-break:break-all;">${escapeHtml(s.name)}</div>
                    <div style="font-size:11px;color:#888;">${sizeStr} • ${escapeHtml(s.extension || '')} • ${escapeHtml(ttlStr)}</div>
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
            <div class="cooop-desc">Файлы, которыми вы поделились. Ссылки живут 24 часа, потом удаляются автоматически.</div>
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
        purgeExpired: purgeExpired
    };
    window.cooopInit = function() {
        openCooop();
        startPurgeTimer();
    };

    // Фоновая чистка запускается сразу при загрузке скрипта,
    // если пользователь уже авторизован. Повторяется каждые 10 минут.
    (async function autoStart() {
        await ensureAuth();
        startPurgeTimer();
    })();

})();