//cooop
(function() {
    'use strict';

    const MAX_FILE_SIZE = 30 * 1024 * 1024;
    const MAX_LINK_SIZE = 1500 * 1024;
    const HARD_LINK_LIMIT = 2000 * 1024;
    const FONT_MAIN = "'TTPaplane', monospace";

    const LINK_BASE = location.origin + location.pathname.replace(/[^/]*$/, '') + 'cooopshare.html';

    const WORKER_CODE = `
(function() {
    'use strict';

    const BWT_BLOCK_BIN = 64 * 1024;
    const BWT_BLOCK_TXT = 256 * 1024;
    const WORD_MAX_LEN = 40;
    const TOKEN_BASE = 0x80;

    function rleEncode(bytes) {
        const out = [];
        const n = bytes.length;
        let i = 0;
        while (i < n) {
            const b = bytes[i];
            let run = 1;
            while (i + run < n && bytes[i + run] === b && run < 255) run++;
            if (b === 0xFE || b === 0xFF) {
                for (let k = 0; k < run; k++) out.push(0xFE, b);
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

    function mergeSort(arr, lo, hi, cmp) {
        if (lo >= hi) return;
        const mid = (lo + hi) >> 1;
        mergeSort(arr, lo, mid, cmp);
        mergeSort(arr, mid + 1, hi, cmp);
        const buf = new Int32Array(hi - lo + 1);
        let i = lo, j = mid + 1, k = 0;
        while (i <= mid && j <= hi) {
            if (cmp(arr[i], arr[j]) <= 0) buf[k++] = arr[i++];
            else buf[k++] = arr[j++];
        }
        while (i <= mid) buf[k++] = arr[i++];
        while (j <= hi) buf[k++] = arr[j++];
        for (let t = 0; t < buf.length; t++) arr[lo + t] = buf[t];
    }

    function buildSuffixArray(bytes) {
        const n = bytes.length;
        const sa = new Int32Array(n);
        const rank = new Int32Array(n);
        const tmp = new Int32Array(n);
        const tmpRank = new Int32Array(n);
        for (let i = 0; i < n; i++) {
            sa[i] = i;
            rank[i] = bytes[i];
        }
        let k = 1;
        while (k < n) {
            const kk = k;
            const rr = rank;
            const cmp = function(a, b) {
                if (rr[a] !== rr[b]) return rr[a] - rr[b];
                const ra = a + kk < n ? rr[a + kk] : -1;
                const rb = b + kk < n ? rr[b + kk] : -1;
                return ra - rb;
            };
            for (let i = 0; i < n; i++) tmp[i] = sa[i];
            mergeSort(tmp, 0, n - 1, cmp);
            for (let i = 0; i < n; i++) sa[i] = tmp[i];
            tmpRank[sa[0]] = 0;
            let cls = 0;
            for (let i = 1; i < n; i++) {
                if (cmp(sa[i - 1], sa[i]) !== 0) cls++;
                tmpRank[sa[i]] = cls;
            }
            for (let i = 0; i < n; i++) rank[i] = tmpRank[i];
            if (cls === n - 1) break;
            k <<= 1;
        }
        return sa;
    }

    function bwtTransform(block) {
        const n = block.length;
        if (n < 2) return { data: block.slice(), index: 0 };
        const sa = buildSuffixArray(block);
        const data = new Uint8Array(n);
        let primaryIndex = 0;
        for (let i = 0; i < n; i++) {
            const s = sa[i];
            if (s === 0) {
                primaryIndex = i;
                data[i] = block[n - 1];
            } else {
                data[i] = block[s - 1];
            }
        }
        return { data: data, index: primaryIndex };
    }

    function applyBWT(bytes, blockSize, onProgress) {
        if (bytes.length < 32) return null;
        const blocks = [];
        const indices = [];
        const blockCount = Math.ceil(bytes.length / blockSize);
        for (let off = 0, bi = 0; off < bytes.length; off += blockSize, bi++) {
            const end = Math.min(off + blockSize, bytes.length);
            const block = bytes.subarray(off, end);
            try {
                const res = bwtTransform(block);
                blocks.push(res.data);
                indices.push(res.index);
            } catch(e) {
                return null;
            }
            if (onProgress && (bi % 4 === 0 || bi === blockCount - 1)) {
                onProgress(Math.round(((bi + 1) / blockCount) * 100));
            }
        }
        let totalLen = 0;
        for (const b of blocks) totalLen += b.length;
        const out = new Uint8Array(totalLen);
        let o = 0;
        for (const b of blocks) {
            out.set(b, o);
            o += b.length;
        }
        return { data: out, indices: indices };
    }

    function mtfEncode(bytes) {
        const symbols = new Uint8Array(256);
        for (let i = 0; i < 256; i++) symbols[i] = i;
        const out = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            const c = bytes[i];
            let pos = 0;
            for (let j = 0; j < 256; j++) {
                if (symbols[j] === c) { pos = j; break; }
            }
            out[i] = pos;
            for (let j = pos; j > 0; j--) symbols[j] = symbols[j - 1];
            symbols[0] = c;
        }
        return out;
    }

    function packIndices(indices) {
        const buf = new Uint8Array(indices.length * 4);
        const view = new DataView(buf.buffer);
        for (let i = 0; i < indices.length; i++) {
            view.setUint32(i * 4, indices[i], false);
        }
        return buf;
    }

    function concatBytes(arrays) {
        let total = 0;
        for (const a of arrays) total += a.length;
        const out = new Uint8Array(total);
        let off = 0;
        for (const a of arrays) {
            out.set(a, off);
            off += a.length;
        }
        return out;
    }

    async function deflateBytes(bytes) {
        if (typeof CompressionStream === 'undefined') return null;
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
            return null;
        }
    }

    function isWordByte(b) {
        if (b >= 0x30 && b <= 0x39) return true;
        if (b >= 0x41 && b <= 0x5A) return true;
        if (b >= 0x61 && b <= 0x7A) return true;
        if (b === 0x5F) return true;
        if (b === 0x2D) return true;
        if (b >= 0xC0) return true;
        return false;
    }

    function extractWords(bytes) {
        const words = [];
        const n = bytes.length;
        let i = 0;
        while (i < n) {
            if (isWordByte(bytes[i])) {
                const start = i;
                while (i < n && isWordByte(bytes[i]) && (i - start) < WORD_MAX_LEN) i++;
                const len = i - start;
                if (len >= 3) {
                    words.push({ start: start, len: len });
                }
            } else {
                i++;
            }
        }
        return words;
    }

    function buildWordDict(bytes) {
        const words = extractWords(bytes);
        if (words.length < 8) return null;
        const map = new Map();
        for (const w of words) {
            const key = String.fromCharCode.apply(null, bytes.subarray(w.start, w.start + w.len));
            const entry = map.get(key);
            if (entry) {
                entry.count++;
            } else {
                map.set(key, { count: 1, len: w.len });
            }
        }
        if (map.size === 0) return null;
        const sorted = Array.from(map.entries()).sort(function(a, b) {
            const scoreA = (a[1].len - 1) * a[1].count - 1;
            const scoreB = (b[1].len - 1) * b[1].count - 1;
            return scoreB - scoreA;
        });
        const maxTokens = 256 - TOKEN_BASE;
        const chosen = [];
        for (const [word, info] of sorted) {
            if (chosen.length >= maxTokens) break;
            if (info.count < 2) continue;
            const savings = (info.len - 1) * info.count - (info.len + 2);
            if (savings <= 0) continue;
            chosen.push(word);
        }
        if (chosen.length === 0) return null;
        const dict = new Map();
        for (let i = 0; i < chosen.length; i++) {
            dict.set(chosen[i], TOKEN_BASE + i);
        }
        return dict;
    }

    function tokenizeText(bytes, dict) {
        if (!dict || dict.size === 0) return null;
        const n = bytes.length;
        const out = [];
        let i = 0;
        let anyToken = false;
        while (i < n) {
            if (isWordByte(bytes[i])) {
                const start = i;
                while (i < n && isWordByte(bytes[i]) && (i - start) < WORD_MAX_LEN) i++;
                const len = i - start;
                if (len >= 3) {
                    const key = String.fromCharCode.apply(null, bytes.subarray(start, i));
                    const token = dict.get(key);
                    if (token !== undefined) {
                        out.push(token);
                        anyToken = true;
                        continue;
                    }
                }
                for (let k = start; k < i; k++) out.push(bytes[k]);
            } else {
                out.push(bytes[i]);
                i++;
            }
        }
        if (!anyToken) return null;
        return new Uint8Array(out);
    }

    function buildDictPayload(dict) {
        if (!dict || dict.size === 0) {
            return new Uint8Array(0);
        }
        const entries = Array.from(dict.entries());
        const parts = [];
        const countBuf = new Uint8Array(2);
        new DataView(countBuf.buffer).setUint16(0, entries.length, false);
        parts.push(countBuf);
        for (const [word] of entries) {
            const wordBytes = new Uint8Array(word.length);
            for (let i = 0; i < word.length; i++) wordBytes[i] = word.charCodeAt(i) & 0xFF;
            const hdr = new Uint8Array(2);
            new DataView(hdr.buffer).setUint16(0, wordBytes.length, false);
            parts.push(hdr);
            parts.push(wordBytes);
        }
        return concatBytes(parts);
    }

    async function packTextAdvanced(bytes, onProgress) {
        if (bytes.length === 0) return null;

        if (onProgress) onProgress(3);

        const dict = buildWordDict(bytes);
        if (onProgress) onProgress(10);

        let tokenized = null;
        if (dict) {
            tokenized = tokenizeText(bytes, dict);
        }

        const dictPayload = dict ? buildDictPayload(dict) : new Uint8Array(0);
        const baseData = tokenized || bytes;

        if (onProgress) onProgress(15);

        const firstDeflate = typeof CompressionStream !== 'undefined'
            ? await deflateBytes(baseData)
            : null;
        if (onProgress) onProgress(35);

        const payloadForBWT = firstDeflate || baseData;

        const bwtRes = applyBWT(payloadForBWT, BWT_BLOCK_TXT, function(p) {
            if (onProgress) onProgress(35 + Math.round(p * 0.35));
        });

        if (!bwtRes) {
            if (onProgress) onProgress(100);
            return null;
        }

        const idxBytes = packIndices(bwtRes.indices);
        const idxCount = bwtRes.indices.length;
        const mtf = mtfEncode(bwtRes.data);
        const rle = rleEncode(mtf);

        const bwtHeader = new Uint8Array(10);
        const bv = new DataView(bwtHeader.buffer);
        bv.setUint16(0, idxCount, false);
        bv.setUint32(2, idxBytes.length, false);
        bv.setUint32(6, dictPayload.length, false);

        const combined = concatBytes([bwtHeader, dictPayload, idxBytes, rle]);

        const finalDeflate = typeof CompressionStream !== 'undefined'
            ? await deflateBytes(combined)
            : null;

        if (onProgress) onProgress(98);

        const finalBytes = finalDeflate && finalDeflate.length < combined.length ? finalDeflate : combined;
        const usedFinalDeflate = !!(finalDeflate && finalDeflate.length < combined.length);

        if (onProgress) onProgress(100);

        return {
            data: finalBytes,
            method: usedFinalDeflate ? 'twd' : 'twr',
            tag: usedFinalDeflate ? 'word+bwt+deflate' : 'word+bwt',
            originalSize: bytes.length
        };
    }

    async function packLossless(bytes, isText, onProgress) {
        const originalSize = bytes.length;
        const candidates = [];

        candidates.push({ data: bytes.slice(), method: 'n', tag: 'raw' });
        if (onProgress) onProgress(5);

        const rleOnly = rleEncode(bytes);
        if (rleOnly.length < bytes.length) {
            candidates.push({ data: rleOnly, method: 'r', tag: 'rle' });
        }

        if (typeof CompressionStream !== 'undefined') {
            const deflated = await deflateBytes(bytes);
            if (deflated && deflated.length < bytes.length) {
                candidates.push({ data: deflated, method: 'd', tag: 'deflate' });
                const dr = rleEncode(deflated);
                if (dr.length < deflated.length) {
                    candidates.push({ data: dr, method: 'dr', tag: 'deflate+rle' });
                }
            }
        }
        if (onProgress) onProgress(20);

        const bwtBlockSize = isText ? BWT_BLOCK_TXT : BWT_BLOCK_BIN;
        const bwtRes = applyBWT(bytes, bwtBlockSize, function(p) {
            if (onProgress) onProgress(20 + Math.round(p * 0.4));
        });
        if (bwtRes) {
            const idxBytes = packIndices(bwtRes.indices);
            const idxCount = bwtRes.indices.length;
            const mtf = mtfEncode(bwtRes.data);
            const rle = rleEncode(mtf);
            const header = new Uint8Array(6);
            const view = new DataView(header.buffer);
            view.setUint16(0, idxCount, false);
            view.setUint32(2, idxBytes.length, false);
            const payload = concatBytes([header, idxBytes, rle]);
            candidates.push({ data: payload, method: 'bwr', tag: 'bwt+mtf+rle' });
            if (typeof CompressionStream !== 'undefined') {
                const deflated = await deflateBytes(payload);
                if (deflated && deflated.length < payload.length) {
                    candidates.push({ data: deflated, method: 'bwrd', tag: 'bwt+mtf+rle+deflate' });
                }
            }
        }
        if (onProgress) onProgress(70);

        if (isText) {
            try {
                const adv = await packTextAdvanced(bytes, function(p) {
                    if (onProgress) onProgress(70 + Math.round(p * 0.28));
                });
                if (adv) candidates.push(adv);
            } catch(e) {}
        }
        if (onProgress) onProgress(95);

        let best = candidates[0];
        for (const c of candidates) {
            if (c.data.length < best.data.length) best = c;
        }

        if (onProgress) onProgress(100);

        return {
            data: best.data,
            method: best.method,
            tag: best.tag,
            originalSize: originalSize
        };
    }

    function smoothDownsample(bytes, factor) {
        if (factor <= 1) return bytes.slice();
        const n = bytes.length;
        const outLen = Math.ceil(n / factor);
        const out = new Uint8Array(outLen);
        for (let i = 0, j = 0; i < n; i += factor, j++) {
            out[j] = bytes[i];
        }
        return out;
    }

    async function packDownsample(bytes, targetSize, onProgress) {
        if (bytes.length === 0) return null;
        const factors = [2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256];

        for (let fi = 0; fi < factors.length; fi++) {
            const f = factors[fi];
            const sampled = smoothDownsample(bytes, f);

            const head = new Uint8Array(6);
            const hv = new DataView(head.buffer);
            hv.setUint32(0, bytes.length, false);
            hv.setUint16(4, f, false);

            const payload = concatBytes([head, sampled]);
            const deflated = typeof CompressionStream !== 'undefined'
                ? await deflateBytes(payload)
                : null;

            const finalData = deflated && deflated.length < payload.length ? deflated : payload;
            const usedDeflate = !!(deflated && deflated.length < payload.length);

            if (onProgress) {
                onProgress(Math.min(95, Math.round(((fi + 1) / factors.length) * 100)));
            }

            if (finalData.length <= targetSize) {
                if (onProgress) onProgress(100);
                return {
                    data: finalData,
                    method: usedDeflate ? 'dsd' : 'ds',
                    tag: 'downsample x' + f,
                    originalSize: bytes.length
                };
            }

            if (fi === factors.length - 1) {
                if (onProgress) onProgress(100);
                return {
                    data: finalData,
                    method: usedDeflate ? 'dsd' : 'ds',
                    tag: 'downsample x' + f,
                    originalSize: bytes.length
                };
            }
        }
        return null;
    }

    self.onmessage = async function(e) {
        const msg = e.data || {};
        const id = msg.id;
        const op = msg.op || 'pack';

        if (op === 'pack') {
            const bytes = msg.bytes;
            const isText = !!msg.isText;
            const targetSize = typeof msg.targetSize === 'number' ? msg.targetSize : 1100000;
            if (!bytes || !(bytes instanceof Uint8Array)) {
                self.postMessage({ id: id, ok: false, error: 'Нет данных' });
                return;
            }
            if (bytes.length === 0) {
                self.postMessage({ id: id, ok: false, error: 'Пустой файл' });
                return;
            }
            try {
                const result = await packLossless(bytes, isText, function(p) {
                    self.postMessage({ id: id, progress: p });
                });
                const finalLen = result.data.length;
                if (finalLen <= targetSize) {
                    const buf = result.data.buffer;
                    self.postMessage({
                        id: id,
                        ok: true,
                        method: result.method,
                        tag: result.tag,
                        data: buf,
                        byteLength: finalLen,
                        originalSize: result.originalSize
                    }, [buf]);
                    return;
                }
                self.postMessage({ id: id, progress: 99, stage: 'downsample' });
                const ds = await packDownsample(bytes, targetSize, function(p) {
                    self.postMessage({ id: id, progress: p, stage: 'downsample' });
                });
                if (!ds) {
                    self.postMessage({ id: id, ok: false, error: 'Не удалось ужать' });
                    return;
                }
                const buf2 = ds.data.buffer;
                self.postMessage({
                    id: id,
                    ok: true,
                    method: ds.method,
                    tag: ds.tag,
                    data: buf2,
                    byteLength: ds.data.length,
                    originalSize: ds.originalSize
                }, [buf2]);
            } catch(err) {
                self.postMessage({ id: id, ok: false, error: String(err && err.message || err) });
            }
            return;
        }

        if (op === 'packLosslessOnly') {
            const bytes = msg.bytes;
            const isText = !!msg.isText;
            if (!bytes || !(bytes instanceof Uint8Array)) {
                self.postMessage({ id: id, ok: false, error: 'Нет данных' });
                return;
            }
            if (bytes.length === 0) {
                self.postMessage({ id: id, ok: false, error: 'Пустой файл' });
                return;
            }
            try {
                const result = await packLossless(bytes, isText, function(p) {
                    self.postMessage({ id: id, progress: p });
                });
                const buf = result.data.buffer;
                self.postMessage({
                    id: id,
                    ok: true,
                    method: result.method,
                    tag: result.tag,
                    data: buf,
                    byteLength: result.data.length,
                    originalSize: result.originalSize
                }, [buf]);
            } catch(err) {
                self.postMessage({ id: id, ok: false, error: String(err && err.message || err) });
            }
            return;
        }

        self.postMessage({ id: id, ok: false, error: 'Неизвестная операция' });
    };
})();
    `;

    let isOpen = false;
    let mode = 'menu';
    let workerInstance = null;
    let workerUrl = null;
    let workerTaskId = 0;
    let workerCallbacks = {};

    function log() {
        try { console.log.apply(console, ['[Cooop]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    function getWorker() {
        if (workerInstance) return workerInstance;
        try {
            const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
            workerUrl = URL.createObjectURL(blob);
            workerInstance = new Worker(workerUrl);
            workerInstance.onmessage = function(e) {
                const msg = e.data || {};
                const cb = workerCallbacks[msg.id];
                if (!cb) return;
                if (typeof msg.progress === 'number') {
                    if (cb.onProgress) {
                        try { cb.onProgress(msg.progress, msg.stage); } catch(err) {}
                    }
                    return;
                }
                delete workerCallbacks[msg.id];
                if (msg.ok) {
                    cb.resolve({
                        data: new Uint8Array(msg.data),
                        method: msg.method,
                        tag: msg.tag,
                        originalSize: msg.originalSize
                    });
                } else {
                    cb.reject(new Error(msg.error || 'worker error'));
                }
            };
            workerInstance.onerror = function(err) {
                log('worker error', err && err.message);
                const reason = (err && err.message) ? err.message : 'worker failure';
                const ids = Object.keys(workerCallbacks);
                ids.forEach(function(k) {
                    try { workerCallbacks[k].reject(new Error(reason)); } catch(e) {}
                    delete workerCallbacks[k];
                });
                try { workerInstance.terminate(); } catch(e) {}
                try { URL.revokeObjectURL(workerUrl); } catch(e) {}
                workerInstance = null;
                workerUrl = null;
            };
        } catch(e) {
            log('worker create error', e);
            workerInstance = null;
            workerUrl = null;
        }
        return workerInstance;
    }

    function packInWorker(bytes, isText, onProgress, targetSize) {
        return new Promise(function(resolve, reject) {
            const w = getWorker();
            if (!w) {
                reject(new Error('Воркер недоступен в этом браузере'));
                return;
            }
            const id = ++workerTaskId;
            workerCallbacks[id] = { resolve: resolve, reject: reject, onProgress: onProgress };
            const copy = new Uint8Array(bytes.length);
            copy.set(bytes);
            try {
                w.postMessage({ id: id, op: 'pack', bytes: copy, isText: !!isText, targetSize: targetSize || 1100000 }, [copy.buffer]);
            } catch(e) {
                delete workerCallbacks[id];
                reject(new Error('Не удалось передать данные в воркер'));
            }
        });
    }

    function packLosslessInWorker(bytes, isText, onProgress) {
        return new Promise(function(resolve, reject) {
            const w = getWorker();
            if (!w) {
                reject(new Error('Воркер недоступен в этом браузере'));
                return;
            }
            const id = ++workerTaskId;
            workerCallbacks[id] = { resolve: resolve, reject: reject, onProgress: onProgress };
            const copy = new Uint8Array(bytes.length);
            copy.set(bytes);
            try {
                w.postMessage({ id: id, op: 'packLosslessOnly', bytes: copy, isText: !!isText }, [copy.buffer]);
            } catch(e) {
                delete workerCallbacks[id];
                reject(new Error('Не удалось передать данные в воркер'));
            }
        });
    }

    function selectAllInField(field) {
        if (!field) return;
        try {
            field.focus();
            field.setSelectionRange(0, field.value.length);
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

    function detectKind(bytes, mime) {
        if (bytes.length >= 4) {
            if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image';
            if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image';
            if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image';
            if (bytes[0] === 0x42 && bytes[1] === 0x4D) return 'image';
            if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
                if (bytes.length >= 12) {
                    const fmt = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
                    if (fmt === 'WEBP') return 'image';
                    if (fmt === 'WAVE') return 'audio';
                    if (fmt === 'AVI ') return 'video';
                }
                return 'audio';
            }
            if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'audio';
            if (bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) return 'audio';
            if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'audio';
            if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'binary';
            if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) return 'binary';
            if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) return 'video';
        }
        if (mime) {
            if (mime.indexOf('image/') === 0) return 'image';
            if (mime.indexOf('audio/') === 0) return 'audio';
            if (mime.indexOf('video/') === 0) return 'video';
            if (mime.indexOf('text/') === 0) return 'text';
            if (mime.indexOf('application/json') === 0) return 'text';
            if (mime.indexOf('application/xml') === 0) return 'text';
        }
        const textSample = Math.min(bytes.length, 1024);
        let printable = 0;
        for (let i = 0; i < textSample; i++) {
            const b = bytes[i];
            if (b === 9 || b === 10 || b === 13) { printable++; continue; }
            if (b >= 32 && b < 127) printable++;
            else if (b >= 0xC0) printable++;
        }
        if (textSample > 0 && printable / textSample > 0.90) return 'text';
        return 'binary';
    }

    function extOf(name) {
        if (!name) return '';
        const i = name.lastIndexOf('.');
        if (i === -1) return '';
        return name.substring(i + 1).toLowerCase();
    }

    function extKind(ext) {
        if (!ext) return null;
        if (['png','jpg','jpeg','gif','bmp','webp','tiff','tif','ico','avif'].indexOf(ext) !== -1) return 'image';
        if (['mp3','wav','ogg','flac','aac','m4a','opus','oga'].indexOf(ext) !== -1) return 'audio';
        if (['mp4','webm','mov','avi','mkv','ogv','m4v'].indexOf(ext) !== -1) return 'video';
        if (['txt','json','xml','html','htm','css','js','md','log','csv','yml','yaml','ini','conf','ts','jsx','tsx','py','rb','php','java','c','cpp','h','hpp','sh','bat','svg','vue','scss','less','sql','rs','go','swift','kt','dart'].indexOf(ext) !== -1) return 'text';
        return null;
    }

    function bytesToBlobUrl(bytes, mime) {
        const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
        return URL.createObjectURL(blob);
    }

    function loadImageFromUrl(url) {
        return new Promise(function(resolve, reject) {
            const img = new Image();
            img.onload = function() { resolve(img); };
            img.onerror = function() { reject(new Error('image load failed')); };
            img.src = url;
        });
    }

    async function estimateImage(bytes, mime) {
        let url = null;
        try {
            url = bytesToBlobUrl(bytes, mime);
            const img = await loadImageFromUrl(url);
            const srcW = img.width;
            const srcH = img.height;
            const targetMax = 1600;
            const scale = Math.min(1, targetMax / Math.max(srcW, srcH));
            const targetW = Math.max(1, Math.round(srcW * scale));
            const targetH = Math.max(1, Math.round(srcH * scale));
            const quality = Math.round(scale * 0.8 * 100);
            try { URL.revokeObjectURL(url); } catch(e) {}
            return {
                kind: 'image',
                lossless: false,
                qualityPercent: Math.min(80, quality),
                detail: 'JPEG q=0.8, ' + srcW + '×' + srcH + ' → ' + targetW + '×' + targetH,
                lossDescription: 'Изображение перекодируется в JPEG с качеством 80% и уменьшается до ' + targetW + '×' + targetH + ' пикселей.'
            };
        } catch(e) {
            if (url) { try { URL.revokeObjectURL(url); } catch(e2) {} }
            return null;
        }
    }

    async function estimateAudio(bytes) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        let ctx = null;
        try {
            ctx = new AC();
            const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            const audioBuffer = await new Promise(function(resolve, reject) {
                const p = ctx.decodeAudioData(arrayBuffer, resolve, reject);
                if (p && typeof p.then === 'function') p.then(resolve).catch(reject);
            });
            const srcRate = audioBuffer.sampleRate;
            const srcCh = audioBuffer.numberOfChannels;
            const duration = audioBuffer.duration;
            const targetRate = 22050;
            const rateFactor = Math.min(1, targetRate / srcRate);
            const quality = Math.round(rateFactor * 0.8 * 100);
            try { ctx.close(); } catch(e) {}
            return {
                kind: 'audio',
                lossless: false,
                qualityPercent: Math.min(80, quality),
                detail: 'WAV mono ' + targetRate + ' Hz из ' + srcRate + ' Hz ' + (srcCh > 1 ? 'стерео' : 'моно') + ', ' + duration.toFixed(1) + ' с',
                lossDescription: 'Аудио сводится в моно, частота понижается до ' + targetRate + ' Hz. Длительность ' + duration.toFixed(1) + ' с сохраняется.'
            };
        } catch(e) {
            if (ctx) { try { ctx.close(); } catch(e2) {} }
            return null;
        }
    }

    async function estimateVideo(bytes, mime) {
        let url = null;
        try {
            url = bytesToBlobUrl(bytes, mime);
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.preload = 'metadata';
            video.src = url;
            await new Promise(function(resolve, reject) {
                const onLoaded = function() { resolve(); };
                const onError = function() { reject(new Error('video load failed')); };
                video.addEventListener('loadedmetadata', onLoaded, { once: true });
                video.addEventListener('error', onError, { once: true });
                setTimeout(function() { reject(new Error('timeout')); }, 8000);
            });
            const srcW = video.videoWidth || 640;
            const srcH = video.videoHeight || 360;
            const dur = isFinite(video.duration) ? video.duration : 60;
            const maxDur = Math.min(60, dur);
            const targetW = Math.min(640, srcW);
            const targetH = Math.min(360, srcH);
            const resFactor = Math.min(1, targetW / srcW);
            const quality = Math.round(resFactor * 0.8 * 100);
            try { URL.revokeObjectURL(url); } catch(e) {}
            return {
                kind: 'video',
                lossless: false,
                qualityPercent: Math.min(80, quality),
                detail: 'WebM ' + targetW + '×' + targetH + ' 500 kbps, до ' + maxDur.toFixed(0) + ' с',
                lossDescription: 'Видео перекодируется в WebM VP8, разрешение ' + targetW + '×' + targetH + ', bitrate около 500 kbps, длительность до ' + maxDur.toFixed(0) + ' с.'
            };
        } catch(e) {
            if (url) { try { URL.revokeObjectURL(url); } catch(e2) {} }
            return null;
        }
    }

    function estimateText() {
        return {
            kind: 'text',
            lossless: true,
            qualityPercent: 100,
            detail: 'Word-токенизация + BWT + MTF + RLE + Deflate',
            lossDescription: 'Текст сжимается без потери содержимого.'
        };
    }

    function estimateBinary() {
        return {
            kind: 'binary',
            lossless: true,
            qualityPercent: 100,
            detail: 'BWT + Deflate; при неудаче — адаптивный downsampling',
            lossDescription: 'Бинарный файл сначала пытается сжаться без потери качества. Если не влезает в ссылку — применяется прореживание байтов (потеря точности).'
        };
    }

    async function estimateQuality(bytes, fileName, mime) {
        const ext = extOf(fileName);
        let kind = detectKind(bytes, mime);
        const byExt = extKind(ext);
        if (byExt === 'image' || byExt === 'audio' || byExt === 'video' || byExt === 'text') {
            kind = byExt;
        }
        if (kind === 'text') return estimateText();
        if (kind === 'image') {
            const est = await estimateImage(bytes, mime);
            if (est) return est;
            return estimateBinary();
        }
        if (kind === 'audio') {
            const est = await estimateAudio(bytes);
            if (est) return est;
            return estimateBinary();
        }
        if (kind === 'video') {
            const est = await estimateVideo(bytes, mime);
            if (est) return est;
            return estimateBinary();
        }
        return estimateBinary();
    }

    async function compressImage(bytes, mime) {
        let url = null;
        try {
            url = bytesToBlobUrl(bytes, mime);
            const img = await loadImageFromUrl(url);
            let maxSide = 1600;
            const quality = 0.8;
            let resultBytes = null;
            let resultW = 0;
            let resultH = 0;
            for (let attempt = 0; attempt < 8; attempt++) {
                const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                const commaIdx = dataUrl.indexOf(',');
                const b64 = dataUrl.substring(commaIdx + 1);
                const bin = atob(b64);
                const arr = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                resultBytes = arr;
                resultW = w;
                resultH = h;
                if (arr.length <= MAX_LINK_SIZE * 0.75) break;
                maxSide = Math.max(640, Math.round(maxSide * 0.85));
            }
            try { URL.revokeObjectURL(url); } catch(e) {}
            if (!resultBytes) return null;
            const packed = await packLosslessInWorker(resultBytes, false);
            return {
                data: packed.data,
                method: 'ij',
                tag: 'jpeg-lossy',
                meta: 'JPEG q=0.8 ' + resultW + 'x' + resultH
            };
        } catch(e) {
            log('compressImage error', e);
            if (url) { try { URL.revokeObjectURL(url); } catch(e2) {} }
            return null;
        }
    }

    async function decodeAudioFromBytes(bytes) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        const ctx = new AC();
        try {
            const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            const audioBuffer = await new Promise(function(resolve, reject) {
                const p = ctx.decodeAudioData(arrayBuffer, resolve, reject);
                if (p && typeof p.then === 'function') p.then(resolve).catch(reject);
            });
            return { audioBuffer: audioBuffer, ctx: ctx };
        } catch(e) {
            try { ctx.close(); } catch(e2) {}
            return null;
        }
    }

    function encodeWavMono(audioBuffer, targetRate) {
        const srcLen = audioBuffer.length;
        const srcRate = audioBuffer.sampleRate;
        const channels = audioBuffer.numberOfChannels;
        const ratio = srcRate / targetRate;
        const outLen = Math.max(1, Math.floor(srcLen / ratio));
        const left = audioBuffer.getChannelData(0);
        const right = channels > 1 ? audioBuffer.getChannelData(1) : null;
        const samples = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
            const srcPos = i * ratio;
            const i0 = Math.floor(srcPos);
            const i1 = Math.min(srcLen - 1, i0 + 1);
            const frac = srcPos - i0;
            let v;
            if (right) {
                const l = left[i0] * (1 - frac) + left[i1] * frac;
                const r = right[i0] * (1 - frac) + right[i1] * frac;
                v = (l + r) * 0.5;
            } else {
                v = left[i0] * (1 - frac) + left[i1] * frac;
            }
            if (v > 1) v = 1;
            if (v < -1) v = -1;
            samples[i] = Math.round(v * 32767);
        }
        const dataSize = samples.length * 2;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);
        function writeStr(off, s) {
            for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
        }
        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, targetRate, true);
        view.setUint32(28, targetRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, dataSize, true);
        let off = 44;
        for (let i = 0; i < samples.length; i++) {
            view.setInt16(off, samples[i], true);
            off += 2;
        }
        return new Uint8Array(buffer);
    }

    async function compressAudio(bytes) {
        let ctxRef = null;
        try {
            const decoded = await decodeAudioFromBytes(bytes);
            if (!decoded) return null;
            ctxRef = decoded.ctx;
            const audioBuffer = decoded.audioBuffer;
            const rates = [22050, 16000, 11025, 8000];
            let bestBytes = null;
            let bestRate = 0;
            for (const rate of rates) {
                const wav = encodeWavMono(audioBuffer, rate);
                const packed = await packLosslessInWorker(wav, false);
                if (!bestBytes || packed.data.length < bestBytes.length) {
                    bestBytes = packed.data;
                    bestRate = rate;
                }
                if (packed.data.length <= MAX_LINK_SIZE * 0.75) {
                    bestBytes = packed.data;
                    bestRate = rate;
                    break;
                }
            }
            try { ctxRef.close(); } catch(e) {}
            if (!bestBytes) return null;
            return {
                data: bestBytes,
                method: 'aw',
                tag: 'wav-lossy',
                meta: 'WAV mono ' + bestRate + ' Hz'
            };
        } catch(e) {
            log('compressAudio error', e);
            if (ctxRef) { try { ctxRef.close(); } catch(e2) {} }
            return null;
        }
    }

    async function compressVideo(bytes, mime, onProgress) {
        if (typeof MediaRecorder === 'undefined') return null;
        let videoUrl = null;
        try {
            videoUrl = bytesToBlobUrl(bytes, mime);
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.preload = 'auto';
            video.src = videoUrl;
            await new Promise(function(resolve, reject) {
                const onLoaded = function() { resolve(); };
                const onError = function() { reject(new Error('video load failed')); };
                video.addEventListener('loadedmetadata', onLoaded, { once: true });
                video.addEventListener('error', onError, { once: true });
                setTimeout(function() { reject(new Error('video load timeout')); }, 10000);
            });
            const sourceW = video.videoWidth || 640;
            const sourceH = video.videoHeight || 360;
            const sourceDur = isFinite(video.duration) ? video.duration : 60;

            const configs = [
                { w: 480, h: 270, br: 300, dur: 45 },
                { w: 360, h: 200, br: 220, dur: 35 },
                { w: 320, h: 180, br: 150, dur: 25 },
                { w: 240, h: 135, br: 100, dur: 20 }
            ];

            let bestResult = null;

            for (const cfg of configs) {
                const scale = Math.min(1, cfg.w / sourceW, cfg.h / sourceH);
                const w = Math.max(2, Math.round(sourceW * scale / 2) * 2);
                const h = Math.max(2, Math.round(sourceH * scale / 2) * 2);
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                const stream = canvas.captureStream(20);
                let rec;
                try {
                    const opts = { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: cfg.br * 1000 };
                    rec = new MediaRecorder(stream, opts);
                } catch(e) {
                    try {
                        rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
                    } catch(e2) {
                        return null;
                    }
                }
                const chunks = [];
                rec.ondataavailable = function(e) {
                    if (e.data && e.data.size > 0) chunks.push(e.data);
                };
                const stoppedPromise = new Promise(function(resolve) {
                    rec.onstop = function() { resolve(); };
                });
                rec.start(250);
                const maxDur = Math.min(cfg.dur, sourceDur);
                const fps = 20;
                const frameDelay = 1000 / fps;
                const totalFrames = Math.max(1, Math.floor(maxDur * fps));
                video.currentTime = 0;
                await new Promise(function(r) { setTimeout(r, 80); });
                for (let f = 0; f < totalFrames; f++) {
                    const targetTime = (f / fps);
                    if (targetTime > maxDur) break;
                    await new Promise(function(resolve) {
                        const onSeek = function() {
                            video.removeEventListener('seeked', onSeek);
                            resolve();
                        };
                        video.addEventListener('seeked', onSeek, { once: true });
                        try { video.currentTime = targetTime; } catch(e) { resolve(); }
                        setTimeout(resolve, 90);
                    });
                    ctx.drawImage(video, 0, 0, w, h);
                    try { stream.getVideoTracks()[0].requestFrame(); } catch(e) {}
                    await new Promise(function(r) { setTimeout(r, frameDelay); });
                    if (onProgress && f % 5 === 0) {
                        onProgress(Math.round((f / totalFrames) * 100));
                    }
                    const currentSize = chunks.reduce(function(a, c) { return a + c.size; }, 0);
                    if (currentSize > MAX_LINK_SIZE * 0.85) break;
                }
                await new Promise(function(r) { setTimeout(r, 200); });
                try { rec.stop(); } catch(e) {}
                try { stream.getTracks().forEach(function(t) { t.stop(); }); } catch(e) {}
                await stoppedPromise;
                const blob = new Blob(chunks, { type: 'video/webm' });
                const arrayBuffer = await blob.arrayBuffer();
                const resultBytes = new Uint8Array(arrayBuffer);
                const packed = await packLosslessInWorker(resultBytes, false);
                if (!bestResult || packed.data.length < bestResult.data.length) {
                    bestResult = {
                        data: packed.data,
                        method: 'vw',
                        tag: 'webm-lossy',
                        meta: 'WebM ' + w + 'x' + h + ' ' + cfg.br + 'kbps'
                    };
                }
                if (packed.data.length <= MAX_LINK_SIZE * 0.75) break;
            }
            try { URL.revokeObjectURL(videoUrl); } catch(e) {}
            return bestResult;
        } catch(e) {
            log('compressVideo error', e);
            if (videoUrl) { try { URL.revokeObjectURL(videoUrl); } catch(e2) {} }
            return null;
        }
    }

    async function packFile(bytes, fileName, mime, onProgress) {
        const ext = extOf(fileName);
        let kind = detectKind(bytes, mime);
        const byExt = extKind(ext);
        if (byExt === 'image' || byExt === 'audio' || byExt === 'video' || byExt === 'text') {
            kind = byExt;
        }
        const targetSize = Math.floor(MAX_LINK_SIZE * 0.73);

        if (kind === 'text') {
            return await packInWorker(bytes, true, onProgress, targetSize);
        }

        if (kind === 'image') {
            const lossy = await compressImage(bytes, mime);
            if (lossy) {
                if (lossy.data.length <= targetSize) return lossy;
                const lossless = await packInWorker(bytes, false, onProgress, targetSize);
                if (lossless.data.length <= lossy.data.length) return lossless;
                return lossy;
            }
            return await packInWorker(bytes, false, onProgress, targetSize);
        }

        if (kind === 'audio') {
            const lossy = await compressAudio(bytes);
            if (lossy) {
                if (lossy.data.length <= targetSize) return lossy;
                const lossless = await packInWorker(bytes, false, onProgress, targetSize);
                if (lossless.data.length <= lossy.data.length) return lossless;
                return lossy;
            }
            return await packInWorker(bytes, false, onProgress, targetSize);
        }

        if (kind === 'video') {
            const lossy = await compressVideo(bytes, mime, onProgress);
            if (lossy) {
                if (lossy.data.length <= targetSize) return lossy;
                const lossless = await packInWorker(bytes, false, onProgress, targetSize);
                if (lossless.data.length <= lossy.data.length) return lossless;
                return lossy;
            }
            return await packInWorker(bytes, false, onProgress, targetSize);
        }

        return await packInWorker(bytes, false, onProgress, targetSize);
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
            const packed = await packFile(bytes, fileData.name, fileData.type || 'application/octet-stream');
            const link = buildLink(fileData.name, fileData.type || 'application/octet-stream', packed);
            if (link.length > HARD_LINK_LIMIT) {
                return null;
            }
            return link;
        } catch(e) {
            log('shareFile error', e);
            return null;
        }
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    function showQualityModal(fileName, fileSize, estimate) {
        return new Promise(function(resolve) {
            if (!document.getElementById('cooopQualityStyles')) {
                const st = document.createElement('style');
                st.id = 'cooopQualityStyles';
                st.textContent = `
                    @keyframes cooopQIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes cooopQOut { from { opacity: 1; } to { opacity: 0; } }
                    @keyframes cooopQZoomIn {
                        from { opacity: 0; transform: scale(0.94); }
                        to { opacity: 1; transform: scale(1); }
                    }
                `;
                document.head.appendChild(st);
            }

            const overlay = document.createElement('div');
            overlay.id = 'cooopQualityOverlay';
            overlay.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.6);
                -webkit-backdrop-filter: blur(10px);
                backdrop-filter: blur(10px);
                z-index: 100002;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                box-sizing: border-box;
                animation: cooopQIn 0.25s ease forwards;
                font-family: ${FONT_MAIN};
            `;

            const modal = document.createElement('div');
            modal.style.cssText = `
                background: var(--bg-primary);
                color: var(--text-primary);
                width: 100%;
                max-width: 480px;
                border: 2px solid var(--border-color);
                padding: 0;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                animation: cooopQZoomIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                padding: 16px 20px;
                background: var(--header-bg);
                color: var(--header-text);
                border-bottom: 2px solid var(--border-color);
                font-size: 17px;
                font-weight: 700;
                letter-spacing: 0.4px;
            `;
            header.textContent = estimate.lossless ? 'Сжатие без потери качества' : 'Предпросмотр качества';
            modal.appendChild(header);

            const body = document.createElement('div');
            body.style.cssText = `
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 14px;
                font-size: 14px;
                line-height: 1.5;
            `;

            const fileRow = document.createElement('div');
            fileRow.style.cssText = 'font-size: 14px; word-break: break-all;';
            fileRow.innerHTML = '<b style="color:var(--text-muted);font-weight:600;">Файл:</b> ' +
                escapeHtml(fileName) + ' <span style="color:var(--text-muted);">(' + formatSize(fileSize) + ')</span>';
            body.appendChild(fileRow);

            const qualityWrap = document.createElement('div');
            qualityWrap.style.cssText = `
                padding: 16px;
                background: var(--bg-secondary);
                border: 2px solid var(--border-color);
                display: flex;
                flex-direction: column;
                gap: 10px;
            `;

            const qualityLabel = document.createElement('div');
            qualityLabel.style.cssText = 'font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: var(--text-muted); font-weight: 700;';
            qualityLabel.textContent = 'Качество от изначального';
            qualityWrap.appendChild(qualityLabel);

            const qualityValue = document.createElement('div');
            qualityValue.style.cssText = 'font-size: 38px; font-weight: 700; line-height: 1; letter-spacing: -1px;';
            qualityValue.textContent = estimate.qualityPercent + '%';
            if (estimate.lossless) qualityValue.style.color = '#2e7d32';
            else if (estimate.qualityPercent >= 60) qualityValue.style.color = '#cc8800';
            else qualityValue.style.color = 'var(--accent)';
            qualityWrap.appendChild(qualityValue);

            const bar = document.createElement('div');
            bar.style.cssText = 'width: 100%; height: 8px; background: var(--border-color); overflow: hidden;';
            const barFill = document.createElement('div');
            barFill.style.cssText = 'height: 100%; width: 0%; background: ' +
                (estimate.lossless ? '#2e7d32' : (estimate.qualityPercent >= 60 ? '#cc8800' : 'var(--accent)')) +
                '; transition: width 0.4s ease;';
            bar.appendChild(barFill);
            qualityWrap.appendChild(bar);

            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    barFill.style.width = estimate.qualityPercent + '%';
                });
            });

            body.appendChild(qualityWrap);

            const detailRow = document.createElement('div');
            detailRow.style.cssText = 'font-size: 13px; color: var(--text-secondary); line-height: 1.6;';
            detailRow.innerHTML = '<b style="color:var(--text-primary);font-weight:700;">Метод:</b> ' +
                escapeHtml(estimate.detail);
            body.appendChild(detailRow);

            const lossRow = document.createElement('div');
            lossRow.style.cssText = 'font-size: 13px; line-height: 1.6; padding: 12px 14px; border-left: 3px solid ' +
                (estimate.lossless ? '#2e7d32' : 'var(--accent)') + '; background: var(--bg-hover);';
            lossRow.textContent = estimate.lossDescription;
            body.appendChild(lossRow);

            if (!estimate.lossless) {
                const warn = document.createElement('div');
                warn.style.cssText = 'font-size: 12px; color: var(--accent); line-height: 1.5;';
                warn.textContent = 'Это необратимо: получатель увидит именно это качество.';
                body.appendChild(warn);
            }

            modal.appendChild(body);

            const actions = document.createElement('div');
            actions.style.cssText = `
                display: flex;
                gap: 10px;
                padding: 14px 20px 20px;
                border-top: 2px solid var(--border-color);
                background: var(--bg-secondary);
                flex-wrap: wrap;
            `;

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Отмена';
            cancelBtn.style.cssText = `
                flex: 1;
                min-width: 120px;
                padding: 12px 20px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary);
                color: var(--text-primary);
                cursor: pointer;
                font-family: inherit;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.2s;
            `;
            cancelBtn.addEventListener('mouseenter', function() {
                cancelBtn.style.borderColor = 'var(--accent)';
                cancelBtn.style.color = 'var(--accent)';
            });
            cancelBtn.addEventListener('mouseleave', function() {
                cancelBtn.style.borderColor = 'var(--border-color)';
                cancelBtn.style.color = 'var(--text-primary)';
            });
            cancelBtn.addEventListener('click', function() { close(false); });
            actions.appendChild(cancelBtn);

            const okBtn = document.createElement('button');
            okBtn.textContent = estimate.lossless ? 'Сжать' : 'Сжать с потерей';
            okBtn.style.cssText = `
                flex: 1.4;
                min-width: 160px;
                padding: 12px 20px;
                border: 2px solid var(--accent);
                background: var(--accent);
                color: var(--text-on-accent);
                cursor: pointer;
                font-family: inherit;
                font-size: 14px;
                font-weight: 700;
                letter-spacing: 0.4px;
                transition: all 0.2s;
            `;
            okBtn.addEventListener('mouseenter', function() {
                okBtn.style.background = 'var(--accent-dark)';
                okBtn.style.borderColor = 'var(--accent-dark)';
            });
            okBtn.addEventListener('mouseleave', function() {
                okBtn.style.background = 'var(--accent)';
                okBtn.style.borderColor = 'var(--accent)';
            });
            okBtn.addEventListener('click', function() { close(true); });
            actions.appendChild(okBtn);

            modal.appendChild(actions);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            function close(result) {
                overlay.style.animation = 'cooopQOut 0.2s ease forwards';
                setTimeout(function() {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 220);
                resolve(result);
            }

            const onKey = function(e) {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', onKey);
                    close(false);
                }
            };
            document.addEventListener('keydown', onKey);
        });
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
        if (window.ShnukCloseAnimation) {
            window.ShnukCloseAnimation(el, 'cooop', function() { el.remove(); });
        } else {
            el.remove();
        }
    }

    function destroy() {
        isOpen = false;
        const el = document.getElementById('cooopApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        if (workerInstance) {
            try { workerInstance.terminate(); } catch(e) {}
            workerInstance = null;
        }
        if (workerUrl) {
            try { URL.revokeObjectURL(workerUrl); } catch(e) {}
            workerUrl = null;
        }
        workerCallbacks = {};
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
        document.getElementById('cooopSendBtn').addEventListener('click', function() { switchScreen('send'); });
        document.getElementById('cooopReceiveBtn').addEventListener('click', function() { switchScreen('receive'); });
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
                <div class="cooop-progress" id="cooopProgress" style="display:none;">
                    <div class="cooop-progress-bar" id="cooopProgressBar"></div>
                </div>
                <div class="cooop-status-msg" id="cooopStatusMsg" style="display:none;"></div>
                <div class="cooop-desc" style="margin-top:12px;">
                    Перед сжатием вы увидите, какое качество останется от оригинала. Лимит файла до сжатия — 30 МБ. Лимит ссылки — 1.5 МБ.
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
        const progressWrap = document.getElementById('cooopProgress');
        const progressBar = document.getElementById('cooopProgressBar');
        const statusMsg = document.getElementById('cooopStatusMsg');

        fileSelect.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async function() {
            if (!this.files || !this.files[0]) return;
            const f = this.files[0];

            statusMsg.style.display = 'none';
            linkSection.style.display = 'none';

            if (f.size > MAX_FILE_SIZE) {
                statusMsg.style.display = 'block';
                statusMsg.textContent = 'Файл ' + formatSize(f.size) + ' — больше лимита ' + formatSize(MAX_FILE_SIZE);
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
            fileSelect.querySelector('.cooop-file-select-icon').textContent = '...';
            fileSelect.querySelector('.cooop-file-select-text').textContent = 'Чтение файла...';

            try {
                const arrayBuffer = await f.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);

                fileSelect.querySelector('.cooop-file-select-text').textContent = 'Оценка качества...';
                const estimate = await estimateQuality(bytes, f.name, f.type || 'application/octet-stream');

                fileSelect.querySelector('.cooop-file-select-icon').textContent = '+';
                fileSelect.querySelector('.cooop-file-select-text').textContent = 'Нажмите, чтобы выбрать файл';

                const confirmed = await showQualityModal(f.name, f.size, estimate);
                if (!confirmed) {
                    fileInfo.style.display = 'none';
                    return;
                }

                fileInfo.style.display = 'block';
                fileInfo.textContent = f.name + ' — ' + formatSize(f.size);
                fileSelect.querySelector('.cooop-file-select-icon').textContent = '...';
                fileSelect.querySelector('.cooop-file-select-text').textContent = 'Сжатие...';

                progressWrap.style.display = 'block';
                progressBar.style.width = '0%';

                const packed = await packFile(bytes, f.name, f.type || 'application/octet-stream', function(p, stage) {
                    progressBar.style.width = Math.min(100, p) + '%';
                    if (stage === 'downsample') {
                        fileSelect.querySelector('.cooop-file-select-text').textContent = 'Прореживание...';
                    }
                });

                progressWrap.style.display = 'none';
                progressBar.style.width = '0%';

                const link = buildLink(f.name, f.type || 'application/octet-stream', packed);

                if (link.length > HARD_LINK_LIMIT) {
                    fileSelect.querySelector('.cooop-file-select-icon').textContent = '!';
                    fileSelect.querySelector('.cooop-file-select-text').textContent = 'Файл слишком большой';
                    fileInfo.style.display = 'none';
                    statusMsg.style.display = 'block';
                    statusMsg.innerHTML =
                        'Файл не удалось сжать до безопасной длины ссылки.<br>' +
                        'Исходный размер: <b>' + formatSize(bytes.length) + '</b><br>' +
                        'После сжатия: <b>' + formatSize(packed.data.length) + '</b> (' + packed.tag + ')<br>' +
                        'Требуется ссылка не больше ' + formatSize(HARD_LINK_LIMIT) + '.';
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Файл слишком большой для ссылки', { type: 'error', duration: 6000 });
                    }
                    return;
                }

                const origSize = bytes.length;
                const packedSize = packed.data.length;
                const linkSize = link.length;
                const ratio = ((1 - packedSize / origSize) * 100).toFixed(1);
                const totalRatio = ((1 - linkSize / origSize) * 100).toFixed(1);

                linkText.value = link;
                linkSection.style.display = 'block';
                linkStats.innerHTML =
                    'Исходно: <b>' + formatSize(origSize) + '</b> • ' +
                    'Качество: <b>' + estimate.qualityPercent + '%</b> • ' +
                    'Метод: <b>' + packed.tag + '</b>' +
                    (packed.meta ? ' • <b>' + packed.meta + '</b>' : '') + '<br>' +
                    'Сжато: <b>' + formatSize(packedSize) + '</b> (−' + ratio + '%)<br>' +
                    'Длина ссылки: <b>' + formatSize(linkSize) + '</b> ' +
                    (linkSize < origSize
                        ? '(меньше оригинала на ' + totalRatio + '%)'
                        : '(больше оригинала на ' + Math.abs(totalRatio) + '%)');

                fileSelect.querySelector('.cooop-file-select-icon').textContent = '✓';
                fileSelect.querySelector('.cooop-file-select-text').textContent = 'Файл сжат';
            } catch(e) {
                log('pack error', e);
                progressWrap.style.display = 'none';
                progressBar.style.width = '0%';
                fileSelect.querySelector('.cooop-file-select-icon').textContent = '+';
                fileSelect.querySelector('.cooop-file-select-text').textContent = 'Нажмите, чтобы выбрать файл';
                fileInfo.style.display = 'none';
                statusMsg.style.display = 'block';
                statusMsg.textContent = 'Ошибка сжатия: ' + (e && e.message ? e.message : 'неизвестная');
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Ошибка сжатия: ' + (e && e.message ? e.message : 'неизвестная'), { type: 'error', duration: 5000 });
                }
            }
        });

        linkText.addEventListener('click', function() { selectAllInField(linkText); });
        linkText.addEventListener('focus', function() { selectAllInField(linkText); });

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

        document.getElementById('cooopSendBack').addEventListener('click', function() { switchScreen('menu'); });
    }

    function renderReceiveScreen(container) {
        container.innerHTML = `
            <div class="cooop-section">
                <div class="cooop-section-title">Вставьте ссылку Cooop</div>
                <div class="cooop-desc">Ссылка должна содержать #cooop=</div>
                <textarea class="cooop-link" id="cooopInputLink" placeholder="Вставьте ссылку сюда..."></textarea>
                <button class="cooop-btn" id="cooopOpenReceiveBtn">ОТКРЫТЬ ССЫЛКУ</button>
                <div class="cooop-desc" style="margin-top:12px;">
                    Ссылка откроется в отдельной странице cooopshare.html,
                    которая распакует и скачает файл.
                </div>
            </div>

            <div class="cooop-back-row">
                <button class="cooop-btn-secondary" id="cooopRecvBack">← Назад</button>
            </div>
        `;

        const input = document.getElementById('cooopInputLink');

        document.getElementById('cooopOpenReceiveBtn').addEventListener('click', function() {
            const link = input.value.trim();
            if (!link) {
                if (window.Win && window.Win.notify) window.Win.notify('Вставьте ссылку', { type: 'error' });
                return;
            }
            const parsed = parseLink(link);
            if (!parsed) {
                if (window.Win && window.Win.notify) window.Win.notify('Неверный формат ссылки', { type: 'error' });
                return;
            }
            window.open(link, '_blank');
        });

        document.getElementById('cooopRecvBack').addEventListener('click', function() { switchScreen('menu'); });
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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
        switchScreen('menu');
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

            .cooop-progress {
                width: 100%;
                height: 6px;
                background: var(--border-color);
                overflow: hidden;
                margin-top: 12px;
            }
            .cooop-progress-bar {
                height: 100%;
                width: 0%;
                background: var(--accent);
                transition: width 0.25s ease;
            }

            .cooop-status-msg {
                margin-top: 12px;
                padding: 12px 14px;
                background: var(--bg-hover);
                border-left: 3px solid var(--accent);
                font-size: 13px;
                color: var(--accent);
                line-height: 1.5;
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

    window.Cooop = {
        destroy: destroy,
        open: openCooop,
        shareFile: shareFile,
        MAX_FILE_SIZE: MAX_FILE_SIZE,
        MAX_LINK_SIZE: MAX_LINK_SIZE
    };
    window.CooopShare = {
        shareFile: shareFile
    };
    window.cooopInit = function() { openCooop(); };

})();