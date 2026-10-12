// cooop-worker.js
(function() {
    'use strict';

    const BWT_BLOCK = 64 * 1024;

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
            const cmp = function(a, b) {
                if (rank[a] !== rank[b]) return rank[a] - rank[b];
                const ra = a + k < n ? rank[a + k] : -1;
                const rb = b + k < n ? rank[b + k] : -1;
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

    function applyBWT(bytes, onProgress) {
        if (bytes.length < 32) return null;
        const blocks = [];
        const indices = [];
        const blockCount = Math.ceil(bytes.length / BWT_BLOCK);
        for (let off = 0, bi = 0; off < bytes.length; off += BWT_BLOCK, bi++) {
            const end = Math.min(off + BWT_BLOCK, bytes.length);
            const block = bytes.subarray(off, end);
            try {
                const res = bwtTransform(block);
                blocks.push(res.data);
                indices.push(res.index);
            } catch(e) {
                return null;
            }
            if (onProgress && (bi % 4 === 0 || bi === blockCount - 1)) {
                onProgress(Math.round(((bi + 1) / blockCount) * 70));
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

    async function packLossless(bytes, onProgress) {
        const originalSize = bytes.length;
        const candidates = [];

        candidates.push({ data: bytes.slice(), method: 'n', tag: 'raw' });
        if (onProgress) onProgress(5);

        const rleOnly = rleEncode(bytes);
        if (rleOnly.length < bytes.length) {
            candidates.push({ data: rleOnly, method: 'r', tag: 'rle' });
        }
        if (onProgress) onProgress(10);

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

        const bwtRes = applyBWT(bytes, function(p) {
            if (onProgress) onProgress(20 + Math.round(p * 0.6));
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

    self.onmessage = async function(e) {
        const msg = e.data || {};
        const id = msg.id;
        const bytes = msg.bytes;

        if (!bytes || !(bytes instanceof Uint8Array)) {
            self.postMessage({ id: id, ok: false, error: 'no bytes' });
            return;
        }

        try {
            const result = await packLossless(bytes, function(p) {
                self.postMessage({ id: id, progress: p });
            });
            self.postMessage({
                id: id,
                ok: true,
                method: result.method,
                tag: result.tag,
                data: result.data.buffer,
                byteLength: result.data.length,
                originalSize: result.originalSize
            }, [result.data.buffer]);
        } catch(err) {
            self.postMessage({ id: id, ok: false, error: String(err && err.message || err) });
        }
    };
})();