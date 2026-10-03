// cheese-chess.js — Cheese Chess (шахматы: белые — мыши, чёрные — сыр)

(function() {
    'use strict';

    let container = null;
    let boardEl = null;
    let statusEl = null;
    let resetBtn = null;

    let board = [];
    let selected = null;
    let turn = 'white';
    let gameStatus = 'playing';
    let aiTimer = null;
    let thinking = false;

    // ============================================
    // SVG СПРАЙТЫ (без изменений)
    // ============================================

    function svgWrap(inner) {
        return `<svg viewBox="0 0 32 32" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="display:block;">${inner}</svg>`;
    }

    function mouseBody(extra) {
        return `
            <ellipse cx="16" cy="20" rx="9" ry="7" fill="#e8e8e8" stroke="#333" stroke-width="1.5"/>
            <circle cx="10" cy="9" r="3.8" fill="#e8e8e8" stroke="#333" stroke-width="1.3"/>
            <circle cx="22" cy="9" r="3.8" fill="#e8e8e8" stroke="#333" stroke-width="1.3"/>
            <circle cx="10" cy="9" r="1.7" fill="#ffaaaa"/>
            <circle cx="22" cy="9" r="1.7" fill="#ffaaaa"/>
            <circle cx="13" cy="19" r="1" fill="#000"/>
            <circle cx="19" cy="19" r="1" fill="#000"/>
            <ellipse cx="16" cy="22" rx="1.8" ry="1.1" fill="#ff9999"/>
            <line x1="16" y1="23" x2="16" y2="24" stroke="#333" stroke-width="0.7"/>
            <line x1="16" y1="24" x2="14" y2="25" stroke="#333" stroke-width="0.6"/>
            <line x1="16" y1="24" x2="18" y2="25" stroke="#333" stroke-width="0.6"/>
            ${extra || ''}
        `;
    }

    function cheeseBody(extra) {
        return `
            <path d="M4 26 L4 12 Q4 7 9 7 L27 7 Q29 7 29 12 L29 26 Z"
                  fill="#ffd966" stroke="#8b6914" stroke-width="1.5" stroke-linejoin="round"/>
            <circle cx="10" cy="14" r="1.7" fill="#8b6914"/>
            <circle cx="21" cy="17" r="1.4" fill="#8b6914"/>
            <circle cx="13" cy="22" r="1.2" fill="#8b6914"/>
            <circle cx="24" cy="11" r="1" fill="#8b6914"/>
            <circle cx="17" cy="24" r="0.9" fill="#8b6914"/>
            ${extra || ''}
        `;
    }

    function mouseKingSVG() {
        const crown = `<path d="M11 5 L13 1 L15 4 L16 0 L17 4 L19 1 L21 5 Z" fill="#cc9900" stroke="#333" stroke-width="1"/>
        <circle cx="13" cy="1" r="0.9" fill="#ff0000"/><circle cx="16" cy="0" r="0.9" fill="#ff0000"/><circle cx="19" cy="1" r="0.9" fill="#ff0000"/>`;
        return svgWrap(mouseBody(crown));
    }
    function mouseQueenSVG() {
        const crown = `<path d="M10 5 L11.5 1.5 L13.5 4 L16 0 L18.5 4 L20.5 1.5 L22 5 Z" fill="#e6b800" stroke="#333" stroke-width="1"/>
        <circle cx="11.5" cy="1.5" r="0.8" fill="#00aaff"/><circle cx="16" cy="0" r="0.9" fill="#00aaff"/><circle cx="20.5" cy="1.5" r="0.8" fill="#00aaff"/>`;
        return svgWrap(mouseBody(crown));
    }
    function mouseRookSVG() {
        const tower = `<rect x="10" y="1" width="12" height="6" fill="#c0c0c0" stroke="#333" stroke-width="1.2"/>
        <rect x="10" y="1" width="3" height="2" fill="#c0c0c0" stroke="#333" stroke-width="1"/>
        <rect x="14.5" y="1" width="3" height="2" fill="#c0c0c0" stroke="#333" stroke-width="1"/>
        <rect x="19" y="1" width="3" height="2" fill="#c0c0c0" stroke="#333" stroke-width="1"/>`;
        return svgWrap(mouseBody(tower));
    }
    function mouseBishopSVG() {
        const hat = `<path d="M11 6 Q11 0 16 -1 Q21 0 21 6 Z" fill="#d0e8ff" stroke="#333" stroke-width="1.2"/>
        <circle cx="16" cy="-1" r="1.2" fill="#3366cc"/><line x1="11" y1="6" x2="21" y2="6" stroke="#333" stroke-width="1"/>`;
        return svgWrap(mouseBody(hat));
    }
    function mouseKnightSVG() {
        const mane = `<path d="M11 5 Q12 2 14 3 Q15 1 16 3 Q17 1 18 3 Q20 2 21 5" fill="none" stroke="#333" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="14" cy="3" r="0.5" fill="#333"/><circle cx="16" cy="2" r="0.5" fill="#333"/><circle cx="18" cy="3" r="0.5" fill="#333"/>`;
        return svgWrap(mouseBody(mane));
    }
    function mousePawnSVG() {
        const spot = `<circle cx="16" cy="18" r="2" fill="#c0c0c0" stroke="#333" stroke-width="0.8"/>`;
        return svgWrap(mouseBody(spot));
    }

    function cheeseKingSVG() {
        const crown = `<path d="M9 8 L11 3 L13 6 L16 2 L19 6 L21 3 L23 8 Z" fill="#cc9900" stroke="#8b6914" stroke-width="1"/>
        <circle cx="11" cy="3" r="0.9" fill="#ff0000"/><circle cx="16" cy="2" r="0.9" fill="#ff0000"/><circle cx="21" cy="3" r="0.9" fill="#ff0000"/>`;
        return svgWrap(cheeseBody(crown));
    }
    function cheeseQueenSVG() {
        const crown = `<path d="M8 8 L9.5 4 L11.5 6.5 L14 3 L18 3 L20.5 6.5 L22.5 4 L24 8 Z" fill="#e6b800" stroke="#8b6914" stroke-width="1"/>
        <circle cx="9.5" cy="4" r="0.8" fill="#00aaff"/><circle cx="14" cy="3" r="0.8" fill="#00aaff"/><circle cx="18" cy="3" r="0.8" fill="#00aaff"/><circle cx="22.5" cy="4" r="0.8" fill="#00aaff"/>`;
        return svgWrap(cheeseBody(crown));
    }
    function cheeseRookSVG() {
        const tower = `<rect x="9" y="3" width="14" height="5" fill="#c0a060" stroke="#8b6914" stroke-width="1.2"/>
        <rect x="9" y="3" width="3" height="2" fill="#c0a060" stroke="#8b6914" stroke-width="1"/>
        <rect x="14" y="3" width="4" height="2" fill="#c0a060" stroke="#8b6914" stroke-width="1"/>
        <rect x="20" y="3" width="3" height="2" fill="#c0a060" stroke="#8b6914" stroke-width="1"/>`;
        return svgWrap(cheeseBody(tower));
    }
    function cheeseBishopSVG() {
        const hat = `<path d="M10 8 Q10 2 16 1 Q22 2 22 8 Z" fill="#d0e8ff" stroke="#8b6914" stroke-width="1.2"/>
        <circle cx="16" cy="1" r="1.2" fill="#3366cc"/><line x1="10" y1="8" x2="22" y2="8" stroke="#8b6914" stroke-width="1"/>`;
        return svgWrap(cheeseBody(hat));
    }
    function cheeseKnightSVG() {
        const mane = `<path d="M10 7 Q11 3 13 5 Q14 3 15.5 5 Q17 3 18 5 Q20 4 22 7" fill="none" stroke="#8b6914" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="13" cy="5" r="0.5" fill="#8b6914"/><circle cx="15.5" cy="4" r="0.5" fill="#8b6914"/><circle cx="18" cy="5" r="0.5" fill="#8b6914"/>`;
        return svgWrap(cheeseBody(mane));
    }
    function cheesePawnSVG() {
        const spot = `<circle cx="16" cy="17" r="2" fill="#8b6914" stroke="#5a4510" stroke-width="0.8"/>`;
        return svgWrap(cheeseBody(spot));
    }

    function getPieceSVG(piece) {
        if (!piece) return '';
        if (piece.color === 'white') {
            switch (piece.type) {
                case 'K': return mouseKingSVG();
                case 'Q': return mouseQueenSVG();
                case 'R': return mouseRookSVG();
                case 'B': return mouseBishopSVG();
                case 'N': return mouseKnightSVG();
                case 'P': return mousePawnSVG();
            }
        } else {
            switch (piece.type) {
                case 'K': return cheeseKingSVG();
                case 'Q': return cheeseQueenSVG();
                case 'R': return cheeseRookSVG();
                case 'B': return cheeseBishopSVG();
                case 'N': return cheeseKnightSVG();
                case 'P': return cheesePawnSVG();
            }
        }
        return '';
    }

    // ============================================
    // ЯДРО ШАХМАТ
    // ============================================

    function initialBoard() {
        const b = [];
        for (let r = 0; r < 8; r++) b.push(new Array(8).fill(null));
        const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
        for (let c = 0; c < 8; c++) {
            b[0][c] = { color: 'black', type: back[c] };
            b[1][c] = { color: 'black', type: 'P' };
            b[6][c] = { color: 'white', type: 'P' };
            b[7][c] = { color: 'white', type: back[c] };
        }
        return b;
    }

    function cloneBoard(b) {
        const nb = [];
        for (let r = 0; r < 8; r++) {
            nb.push(new Array(8).fill(null));
            for (let c = 0; c < 8; c++) {
                if (b[r][c]) nb[r][c] = { color: b[r][c].color, type: b[r][c].type };
            }
        }
        return nb;
    }

    function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

    function pseudoMoves(b, fr, fc, color) {
        const piece = b[fr][fc];
        if (!piece || piece.color !== color) return [];
        const moves = [];
        const dr = (r, c) => {
            if (!inBounds(r, c)) return;
            const t = b[r][c];
            if (t && t.color === color) return;
            moves.push({ fr, fc, tr: r, tc: c });
        };

        switch (piece.type) {
            case 'P': {
                const dir = piece.color === 'white' ? -1 : 1;
                const startRow = piece.color === 'white' ? 6 : 1;
                const nr = fr + dir;
                if (inBounds(nr, fc) && !b[nr][fc]) {
                    moves.push({ fr, fc, tr: nr, tc: fc });
                    const nr2 = fr + 2 * dir;
                    if (fr === startRow && inBounds(nr2, fc) && !b[nr2][fc]) {
                        moves.push({ fr, fc, tr: nr2, tc: fc });
                    }
                }
                for (const dc2 of [-1, 1]) {
                    const cr = fr + dir, cc = fc + dc2;
                    if (inBounds(cr, cc)) {
                        const t = b[cr][cc];
                        if (t && t.color !== color) moves.push({ fr, fc, tr: cr, tc: cc });
                    }
                }
                break;
            }
            case 'N': {
                const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
                for (const [dr2, dc2] of offsets) dr(fr + dr2, fc + dc2);
                break;
            }
            case 'B': {
                for (const [dr2, dc2] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
                    let r = fr + dr2, c = fc + dc2;
                    while (inBounds(r, c)) {
                        const t = b[r][c];
                        if (!t) moves.push({ fr, fc, tr: r, tc: c });
                        else { if (t.color !== color) moves.push({ fr, fc, tr: r, tc: c }); break; }
                        r += dr2; c += dc2;
                    }
                }
                break;
            }
            case 'R': {
                for (const [dr2, dc2] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                    let r = fr + dr2, c = fc + dc2;
                    while (inBounds(r, c)) {
                        const t = b[r][c];
                        if (!t) moves.push({ fr, fc, tr: r, tc: c });
                        else { if (t.color !== color) moves.push({ fr, fc, tr: r, tc: c }); break; }
                        r += dr2; c += dc2;
                    }
                }
                break;
            }
            case 'Q': {
                for (const [dr2, dc2] of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]) {
                    let r = fr + dr2, c = fc + dc2;
                    while (inBounds(r, c)) {
                        const t = b[r][c];
                        if (!t) moves.push({ fr, fc, tr: r, tc: c });
                        else { if (t.color !== color) moves.push({ fr, fc, tr: r, tc: c }); break; }
                        r += dr2; c += dc2;
                    }
                }
                break;
            }
            case 'K': {
                for (const [dr2, dc2] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
                    dr(fr + dr2, fc + dc2);
                }
                break;
            }
        }
        return moves;
    }

    function findKing(b, color) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = b[r][c];
                if (p && p.color === color && p.type === 'K') return { r, c };
            }
        }
        return null;
    }

    function isSquareAttacked(b, r, c, byColor) {
        // Атака пешек
        const pawnDir = byColor === 'white' ? 1 : -1;
        for (const dc of [-1, 1]) {
            const pr = r + pawnDir, pc = c + dc;
            if (inBounds(pr, pc)) {
                const p = b[pr][pc];
                if (p && p.color === byColor && p.type === 'P') return true;
            }
        }
        // Кони
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc)) {
                const p = b[nr][nc];
                if (p && p.color === byColor && p.type === 'N') return true;
            }
        }
        // Диагональные (слон, ферзь)
        for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
            let nr = r + dr, nc = c + dc;
            while (inBounds(nr, nc)) {
                const p = b[nr][nc];
                if (p) {
                    if (p.color === byColor && (p.type === 'B' || p.type === 'Q')) return true;
                    break;
                }
                nr += dr; nc += dc;
            }
        }
        // Прямые (ладья, ферзь)
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            let nr = r + dr, nc = c + dc;
            while (inBounds(nr, nc)) {
                const p = b[nr][nc];
                if (p) {
                    if (p.color === byColor && (p.type === 'R' || p.type === 'Q')) return true;
                    break;
                }
                nr += dr; nc += dc;
            }
        }
        // Король
        for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc)) {
                const p = b[nr][nc];
                if (p && p.color === byColor && p.type === 'K') return true;
            }
        }
        return false;
    }

    function inCheck(b, color) {
        const k = findKing(b, color);
        if (!k) return false;
        const opp = color === 'white' ? 'black' : 'white';
        return isSquareAttacked(b, k.r, k.c, opp);
    }

    // Полный список легальных ходов (не оставляющих короля под шахом)
    function legalMoves(b, color) {
        const all = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = b[r][c];
                if (!p || p.color !== color) continue;
                const moves = pseudoMoves(b, r, c, color);
                for (const m of moves) {
                    const captured = b[m.tr][m.tc];
                    b[m.tr][m.tc] = p;
                    b[m.fr][m.fc] = null;
                    const stillCheck = inCheck(b, color);
                    b[m.fr][m.fc] = p;
                    b[m.tr][m.tc] = captured;
                    if (!stillCheck) all.push(m);
                }
            }
        }
        return all;
    }

    function applyMove(b, m) {
        const piece = b[m.fr][m.fc];
        const captured = b[m.tr][m.tc];
        b[m.tr][m.tc] = piece;
        b[m.fr][m.fc] = null;
        // Превращение
        if (piece.type === 'P') {
            if (piece.color === 'white' && m.tr === 0) b[m.tr][m.tc] = { color: 'white', type: 'Q' };
            else if (piece.color === 'black' && m.tr === 7) b[m.tr][m.tc] = { color: 'black', type: 'Q' };
        }
        return captured;
    }

    function undoMove(b, m, captured) {
        const piece = b[m.tr][m.tc];
        b[m.fr][m.fc] = piece;
        b[m.tr][m.tc] = captured;
    }

    // ============================================
    // ОЦЕНКА
    // ============================================

    const VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

    // Piece-square tables (для чёрных — зеркалим)
    const PST = {
        P: [
            [0,0,0,0,0,0,0,0],
            [50,50,50,50,50,50,50,50],
            [10,10,20,30,30,20,10,10],
            [5,5,10,25,25,10,5,5],
            [0,0,0,20,20,0,0,0],
            [5,-5,-10,0,0,-10,-5,5],
            [5,10,10,-20,-20,10,10,5],
            [0,0,0,0,0,0,0,0]
        ],
        N: [
            [-50,-40,-30,-30,-30,-30,-40,-50],
            [-40,-20,0,0,0,0,-20,-40],
            [-30,0,10,15,15,10,0,-30],
            [-30,5,15,20,20,15,5,-30],
            [-30,0,15,20,20,15,0,-30],
            [-30,5,10,15,15,10,5,-30],
            [-40,-20,0,5,5,0,-20,-40],
            [-50,-40,-30,-30,-30,-30,-40,-50]
        ],
        B: [
            [-20,-10,-10,-10,-10,-10,-10,-20],
            [-10,0,0,0,0,0,0,-10],
            [-10,0,5,10,10,5,0,-10],
            [-10,5,5,10,10,5,5,-10],
            [-10,0,10,10,10,10,0,-10],
            [-10,10,10,10,10,10,10,-10],
            [-10,5,0,0,0,0,5,-10],
            [-20,-10,-10,-10,-10,-10,-10,-20]
        ],
        R: [
            [0,0,0,0,0,0,0,0],
            [5,10,10,10,10,10,10,5],
            [-5,0,0,0,0,0,0,-5],
            [-5,0,0,0,0,0,0,-5],
            [-5,0,0,0,0,0,0,-5],
            [-5,0,0,0,0,0,0,-5],
            [-5,0,0,0,0,0,0,-5],
            [0,0,0,5,5,0,0,0]
        ],
        Q: [
            [-20,-10,-10,-5,-5,-10,-10,-20],
            [-10,0,0,0,0,0,0,-10],
            [-10,0,5,5,5,5,0,-10],
            [-5,0,5,5,5,5,0,-5],
            [0,0,5,5,5,5,0,-5],
            [-10,5,5,5,5,5,0,-10],
            [-10,0,5,0,0,0,0,-10],
            [-20,-10,-10,-5,-5,-10,-10,-20]
        ],
        K: [
            [-30,-40,-40,-50,-50,-40,-40,-30],
            [-30,-40,-40,-50,-50,-40,-40,-30],
            [-30,-40,-40,-50,-50,-40,-40,-30],
            [-30,-40,-40,-50,-50,-40,-40,-30],
            [-20,-30,-30,-40,-40,-30,-30,-20],
            [-10,-20,-20,-20,-20,-20,-20,-10],
            [20,20,0,0,0,0,20,20],
            [20,30,10,0,0,10,30,20]
        ]
    };

    function evaluate(b) {
        // Оценка с точки зрения ЧЁРНЫХ (AI). Чем больше — тем лучше для чёрных.
        let score = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = b[r][c];
                if (!p) continue;
                const table = PST[p.type];
                let posValue = 0;
                if (table) {
                    // Для белых PST читается "сверху вниз" (r=0 это 8-я горизонталь)
                    // Для чёрных — зеркалим
                    const pr = p.color === 'white' ? r : 7 - r;
                    posValue = table[pr][c];
                }
                const value = VALUES[p.type] + posValue;
                if (p.color === 'black') score += value;
                else score -= value;
            }
        }
        return score;
    }

    // ============================================
    // МИНИМАКС С АЛЬФА-БЕТА
    // ============================================

    let nodesVisited = 0;
    let timeLimitExceeded = false;
    let startTime = 0;
    const TIME_LIMIT = 900; // мс

    function checkTime() {
        nodesVisited++;
        if ((nodesVisited & 1023) === 0) {
            if (performance.now() - startTime > TIME_LIMIT) {
                timeLimitExceeded = true;
            }
        }
        return timeLimitExceeded;
    }

    function minimax(b, depth, alpha, beta, maximizing) {
        if (checkTime()) return 0;

        const color = maximizing ? 'black' : 'white';
        const moves = legalMoves(b, color);

        if (moves.length === 0) {
            if (inCheck(b, color)) {
                // Мат
                return maximizing ? -100000 + (10 - depth) : 100000 - (10 - depth);
            }
            return 0; // пат
        }

        if (depth === 0) {
            return evaluate(b);
        }

        // Сортируем ходы: сначала взятия ценных фигур
        moves.sort((a, b2) => {
            const va = b[a.tr][a.tc] ? VALUES[b[a.tr][a.tc].type] : 0;
            const vb = b[b2.tr][b2.tc] ? VALUES[b[b2.tr][b2.tc].type] : 0;
            return vb - va;
        });

        if (maximizing) {
            let maxEval = -Infinity;
            for (const m of moves) {
                const cap = applyMove(b, m);
                const ev = minimax(b, depth - 1, alpha, beta, false);
                undoMove(b, m, cap);
                if (timeLimitExceeded) return maxEval;
                if (ev > maxEval) maxEval = ev;
                if (ev > alpha) alpha = ev;
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (const m of moves) {
                const cap = applyMove(b, m);
                const ev = minimax(b, depth - 1, alpha, beta, true);
                undoMove(b, m, cap);
                if (timeLimitExceeded) return minEval;
                if (ev < minEval) minEval = ev;
                if (ev < beta) beta = ev;
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    function findBestMove(b) {
        const moves = legalMoves(b, 'black');
        if (moves.length === 0) return null;

        nodesVisited = 0;
        timeLimitExceeded = false;
        startTime = performance.now();

        // Итеративное углубление от 1 до 4
        let bestMove = moves[0];
        let bestScore = -Infinity;

        for (let depth = 1; depth <= 4; depth++) {
            let localBest = null;
            let localScore = -Infinity;
            let alpha = -Infinity;
            const beta = Infinity;

            // Сортируем ходы, чтобы лучший ход с прошлой итерации шёл первым
            const ordered = moves.slice();
            if (bestMove) {
                const idx = ordered.findIndex(m => m.fr === bestMove.fr && m.fc === bestMove.fc && m.tr === bestMove.tr && m.tc === bestMove.tc);
                if (idx > 0) {
                    const [bm] = ordered.splice(idx, 1);
                    ordered.unshift(bm);
                }
            }

            for (const m of ordered) {
                const cap = applyMove(b, m);
                const ev = minimax(b, depth - 1, alpha, beta, false);
                undoMove(b, m, cap);
                if (timeLimitExceeded) break;
                if (ev > localScore) {
                    localScore = ev;
                    localBest = m;
                }
                if (ev > alpha) alpha = ev;
            }

            if (localBest && !timeLimitExceeded) {
                bestMove = localBest;
                bestScore = localScore;
            }
            if (timeLimitExceeded) break;
            if (bestScore > 90000) break; // нашли мат — не ищем дальше
        }

        return bestMove;
    }

    // ============================================
    // UI
    // ============================================

    function buildUI() {
        container.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: #f5e6c8;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px 20px;
            box-sizing: border-box;
            font-family: 'ST-SimpleSquare', monospace;
            color: #1a1a1a;
            overflow: auto;
        `;

        const title = document.createElement('div');
        title.textContent = 'CHEESE CHESS';
        title.style.cssText = `
            font-size: 22px;
            font-weight: 700;
            letter-spacing: 3px;
            color: #8b4513;
            margin-bottom: 14px;
        `;

        statusEl = document.createElement('div');
        statusEl.style.cssText = `
            font-size: 14px;
            margin-bottom: 12px;
            min-height: 20px;
            color: #333;
            text-align: center;
        `;
        statusEl.textContent = 'Ход: мыши';

        boardEl = document.createElement('div');
        boardEl.style.cssText = `
            display: grid;
            grid-template-columns: repeat(8, minmax(32px, 56px));
            grid-template-rows: repeat(8, minmax(32px, 56px));
            border: 3px solid #8b4513;
            background: #8b4513;
            gap: 1px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        `;

        const controls = document.createElement('div');
        controls.style.cssText = `
            display: flex;
            gap: 10px;
            margin-top: 16px;
        `;

        resetBtn = document.createElement('button');
        resetBtn.textContent = 'НОВАЯ ПАРТИЯ';
        resetBtn.style.cssText = `
            padding: 10px 22px;
            background: #8b4513;
            color: #fff;
            border: 2px solid #000;
            cursor: pointer;
            font-family: inherit;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 1px;
        `;
        resetBtn.addEventListener('click', resetGame);

        controls.appendChild(resetBtn);

        wrap.appendChild(title);
        wrap.appendChild(statusEl);
        wrap.appendChild(boardEl);
        wrap.appendChild(controls);
        container.appendChild(wrap);
    }

    function resetGame() {
        board = initialBoard();
        selected = null;
        turn = 'white';
        gameStatus = 'playing';
        thinking = false;
        if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
        statusEl.textContent = 'Ход: мыши';
        statusEl.style.color = '#333';
        renderBoard();
    }

    function renderBoard() {
        boardEl.innerHTML = '';
        const legal = (turn === 'white' && gameStatus === 'playing') ? legalMoves(board, 'white') : [];

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const sq = document.createElement('div');
                const isLight = (r + c) % 2 === 0;
                sq.style.cssText = `
                    background: ${isLight ? '#fff5e0' : '#d2a679'};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    position: relative;
                    user-select: none;
                    transition: background 0.15s ease;
                    padding: 3px;
                    box-sizing: border-box;
                `;
                const piece = board[r][c];
                if (piece) sq.innerHTML = getPieceSVG(piece);

                if (selected && selected.r === r && selected.c === c) {
                    sq.style.background = '#ffe680';
                }
                if (selected && legal.some(m => m.fr === selected.r && m.fc === selected.c && m.tr === r && m.tc === c)) {
                    sq.style.boxShadow = 'inset 0 0 0 3px #cc0000';
                }
                sq.addEventListener('click', function() { onSquareClick(r, c); });
                boardEl.appendChild(sq);
            }
        }
    }

    function onSquareClick(r, c) {
        if (gameStatus !== 'playing') return;
        if (turn !== 'white' || thinking) return;

        if (selected) {
            const legal = legalMoves(board, 'white');
            const move = legal.find(m => m.fr === selected.r && m.fc === selected.c && m.tr === r && m.tc === c);
            if (move) {
                const cap = applyMove(board, move);
                selected = null;
                renderBoard();

                if (cap && cap.type === 'K') {
                    gameStatus = 'white-win';
                    statusEl.textContent = 'Победа мышей!';
                    statusEl.style.color = '#006600';
                    return;
                }

                turn = 'black';
                statusEl.textContent = 'Сыр думает...';
                thinking = true;
                if (aiTimer) clearTimeout(aiTimer);
                aiTimer = setTimeout(aiMove, 100);
                return;
            }
        }
        const piece = board[r][c];
        if (piece && piece.color === 'white') {
            selected = { r, c };
        } else {
            selected = null;
        }
        renderBoard();
    }

    function aiMove() {
        if (gameStatus !== 'playing') { thinking = false; return; }

        const best = findBestMove(board);
        thinking = false;

        if (!best) {
            // У чёрных нет ходов — либо мат, либо пат
            if (inCheck(board, 'black')) {
                gameStatus = 'white-win';
                statusEl.textContent = 'Мат! Победа мышей!';
                statusEl.style.color = '#006600';
            } else {
                gameStatus = 'stalemate';
                statusEl.textContent = 'Пат. Ничья.';
                statusEl.style.color = '#333';
            }
            renderBoard();
            return;
        }

        const cap = applyMove(board, best);
        renderBoard();

        if (cap && cap.type === 'K') {
            gameStatus = 'black-win';
            statusEl.textContent = 'Победа сыра!';
            statusEl.style.color = '#8b4513';
            return;
        }

        turn = 'white';

        // Проверяем, есть ли у белых ходы
        const whiteMoves = legalMoves(board, 'white');
        if (whiteMoves.length === 0) {
            if (inCheck(board, 'white')) {
                gameStatus = 'black-win';
                statusEl.textContent = 'Мат! Победа сыра!';
                statusEl.style.color = '#8b4513';
            } else {
                gameStatus = 'stalemate';
                statusEl.textContent = 'Пат. Ничья.';
                statusEl.style.color = '#333';
            }
            renderBoard();
            return;
        }

        if (inCheck(board, 'white')) {
            statusEl.textContent = 'Шах! Ваш ход.';
            statusEl.style.color = '#cc0000';
        } else {
            statusEl.textContent = 'Ход: мыши';
            statusEl.style.color = '#333';
        }
    }

    function init() {
        container = document.getElementById('gameCenterGameContainer');
        if (!container) return;
        buildUI();
        resetGame();
    }

    function destroy() {
        if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
        thinking = false;
        if (container) container.innerHTML = '';
        container = null;
    }

    window.cheeseChessInit = init;
    window.CheeseChess = { destroy: destroy, init: init };

})();