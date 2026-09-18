// sw.js — Service Worker для офлайн-режима Shnuk OS

const CACHE_API_NAME = 'shnuk-cache-v1';
const SYSTEM_STORE_KEY_PREFIX = 'asset:';

function openIDB() {
    return new Promise(function(resolve, reject) {
        const req = indexedDB.open('shnuk_os', 1);
        req.onupgradeneeded = function(e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('files')) {
                db.createObjectStore('files', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('system')) {
                db.createObjectStore('system', { keyPath: 'key' });
            }
        };
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}

function idbGet(key) {
    return openIDB().then(function(db) {
        return new Promise(function(resolve) {
            try {
                const t = db.transaction('system', 'readonly');
                const req = t.objectStore('system').get(key);
                req.onsuccess = function() {
                    const row = req.result;
                    resolve(row ? row.data : null);
                };
                req.onerror = function() { resolve(null); };
            } catch(e) { resolve(null); }
        });
    });
}

function idbPut(key, data) {
    return openIDB().then(function(db) {
        return new Promise(function(resolve) {
            try {
                const t = db.transaction('system', 'readwrite');
                t.objectStore('system').put({ key: key, data: data, updated: Date.now() });
                t.oncomplete = function() { resolve(true); };
                t.onerror = function() { resolve(false); };
            } catch(e) { resolve(false); }
        });
    });
}

function base64ToBlob(b64, mime) {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime || 'application/octet-stream' });
}

function isAssetUrl(url) {
    const u = new URL(url, self.location.origin);
    if (u.origin !== self.location.origin) return false;
    const path = u.pathname;
    return /\.(js|css|html|png|jpg|jpeg|gif|webp|svg|ico|ttf|woff|woff2|otf|json)$/i.test(path)
        || path === '/' || path.endsWith('/index.html') || path.endsWith('/e3.html');
}

self.addEventListener('install', function(e) {
    self.skipWaiting();
});

self.addEventListener('activate', function(e) {
    e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event) {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Флаг __direct=1 означает «не перехватывать, отдать как есть из сети»
    // os-cache.js использует его, чтобы гарантированно получить свежий файл
    if (url.searchParams.get('__direct') === '1') {
        return;
    }

    if (url.origin !== self.location.origin) return;

    if (req.mode === 'navigate') {
        event.respondWith(handleNavigate(req));
        return;
    }

    if (!isAssetUrl(req.url)) return;

    event.respondWith(handleAsset(req));
});

async function fromCacheAPI(url) {
    if (!('caches' in self)) return null;
    try {
        const cache = await caches.open(CACHE_API_NAME);
        let match = await cache.match(url);
        if (match) return match;
        // Пробуем без query-параметров
        const clean = url.split('?')[0];
        match = await cache.match(clean);
        if (match) return match;
    } catch(e) {}
    return null;
}

async function fromIDB(key) {
    const asset = await idbGet(key);
    if (!asset) return null;
    if (asset.type === 'base64') {
        return new Response(base64ToBlob(asset.data, asset.mime), {
            status: 200,
            headers: { 'Content-Type': asset.mime }
        });
    }
    return new Response(asset.data, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
}

function handleNavigate(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    let key;
    if (path === '/' || path.endsWith('/index.html') || path.endsWith('/e3.html')) {
        const last = path.substring(path.lastIndexOf('/') + 1);
        key = SYSTEM_STORE_KEY_PREFIX + (last || 'index.html');
    } else {
        key = SYSTEM_STORE_KEY_PREFIX + 'index.html';
    }

    return fetch(req).then(function(resp) {
        if (resp && resp.ok) {
            resp.clone().text().then(function(text) {
                idbPut(key, { type: 'text', data: text });
                if ('caches' in self) {
                    caches.open(CACHE_API_NAME).then(function(cache) {
                        cache.put(url.pathname, new Response(text, {
                            headers: { 'Content-Type': 'text/html; charset=utf-8' }
                        }));
                    });
                }
            }).catch(function() {});
            return resp;
        }
        throw new Error('bad response');
    }).catch(async function() {
        let resp = await fromIDB(key);
        if (resp) return resp;

        resp = await fromCacheAPI(url.pathname);
        if (resp) return resp;

        return new Response(
            '<!DOCTYPE html><html><body style="background:#000;color:#888;font-family:monospace;padding:20px;">Shnuk OS офлайн-кэш пуст</body></html>',
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    });
}

function handleAsset(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const key = SYSTEM_STORE_KEY_PREFIX + path.replace(/^\//, '');

    return fetch(req).then(function(resp) {
        if (resp && resp.ok) {
            const ct = resp.headers.get('content-type') || '';
            if (ct.indexOf('image') !== -1 || ct.indexOf('font') !== -1) {
                resp.clone().arrayBuffer().then(function(buf) {
                    const bytes = new Uint8Array(buf);
                    let binary = '';
                    const chunk = 0x8000;
                    for (let i = 0; i < bytes.length; i += chunk) {
                        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
                    }
                    const b64 = btoa(binary);
                    const mime = ct.split(';')[0] || 'application/octet-stream';
                    idbPut(key, { type: 'base64', mime: mime, data: b64 });
                }).catch(function() {});
            } else {
                resp.clone().text().then(function(text) {
                    idbPut(key, { type: 'text', data: text });
                }).catch(function() {});
            }
            if ('caches' in self) {
                const clone = resp.clone();
                caches.open(CACHE_API_NAME).then(function(cache) {
                    cache.put(url.pathname, clone);
                }).catch(function() {});
            }
            return resp;
        }
        throw new Error('bad response');
    }).catch(async function() {
        let resp = await fromIDB(key);
        if (resp) return resp;

        resp = await fromCacheAPI(url.pathname);
        if (resp) return resp;

        return new Response('', { status: 404 });
    });
}