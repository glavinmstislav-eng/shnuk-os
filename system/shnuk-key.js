// shnuk-key.js
(function() {
    'use strict';

    const FONT_MAIN = "'TTPaplane', monospace";
    const LAYOUT_RU = [
        ['й','ц','у','к','е','н','г','ш','щ','з','х','ъ'],
        ['ф','ы','в','а','п','р','о','л','д','ж','э'],
        ['я','ч','с','м','и','т','ь','б','ю','ё']
    ];
    const LAYOUT_EN = [
        ['q','w','e','r','t','y','u','i','o','p'],
        ['a','s','d','f','g','h','j','k','l'],
        ['z','x','c','v','b','n','m']
    ];
    const NUMS = ['1','2','3','4','5','6','7','8','9','0','-','='];
    const SYMS = ['!','@','#','$','%','^','&','*','(',')','_','+'];
    const SYMS2 = ['[',']','{','}',';',':','"',"'",',','.','/','\\','<','>','?','|','~','`'];

    let root = null;
    let isOpen = false;
    let currentInput = null;
    let currentLang = 'ru';
    let isShift = false;
    let isCaps = false;
    let isSymbols = false;
    let isSymbols2 = false;
    let activePointerId = null;
    let longPressTimer = null;

    const pressedKeys = new Set();
    const repeatTimers = new Map();

    function ensureRoot() {
        if (root && root.parentNode) return;
        root = document.createElement('div');
        root.id = 'shnukKeyRoot';
        root.style.cssText = `
            position: fixed;
            left: 0; right: 0;
            bottom: 0;
            z-index: 2147483600;
            background: var(--bg-primary, #ffffff);
            color: var(--text-primary, #1a1a1a);
            font-family: ${FONT_MAIN};
            border-top: 2px solid var(--border-color, #e0e0e0);
            transform: translateY(100%);
            transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
            display: flex;
            flex-direction: column;
            user-select: none;
            -webkit-user-select: none;
            touch-action: none;
            box-shadow: 0 -8px 30px rgba(0,0,0,0.12);
            padding-bottom: env(safe-area-inset-bottom, 0);
        `;
        document.body.appendChild(root);
        render();
    }

    function render() {
        if (!root) return;
        root.innerHTML = '';

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 10px;
            background: var(--bg-secondary, #f5f5f5);
            border-bottom: 1px solid var(--border-color, #e0e0e0);
            gap: 8px;
        `;

        const leftActions = document.createElement('div');
        leftActions.style.cssText = 'display:flex;gap:6px;align-items:center;';

        leftActions.appendChild(makeMiniBtn('RU', currentLang === 'ru', function() {
            currentLang = 'ru';
            isShift = false;
            render();
        }));
        leftActions.appendChild(makeMiniBtn('EN', currentLang === 'en', function() {
            currentLang = 'en';
            isShift = false;
            render();
        }));
        header.appendChild(leftActions);

        const rightActions = document.createElement('div');
        rightActions.style.cssText = 'display:flex;gap:6px;align-items:center;';

        rightActions.appendChild(makeMiniBtn('↓', false, function() {
            hide();
        }));
        header.appendChild(rightActions);

        root.appendChild(header);

        const rows = document.createElement('div');
        rows.style.cssText = 'padding: 8px 6px 12px;';

        if (isSymbols2) {
            rows.appendChild(makeRow(SYMS2.slice(0, 8)));
            rows.appendChild(makeRow(SYMS2.slice(8, 16)));
            rows.appendChild(makeRow(SYMS2.slice(16), 'shift2'));
        } else if (isSymbols) {
            rows.appendChild(makeRow(SYMS));
            rows.appendChild(makeRow(NUMS));
        } else {
            const layout = currentLang === 'ru' ? LAYOUT_RU : LAYOUT_EN;
            layout.forEach(function(row, idx) {
                const r = makeRow(row, idx === 0 ? 'nums' : null);
                rows.appendChild(r);
            });
            if (currentLang === 'en') {
                rows.appendChild(makeRow([',', '.', '?', '!', "'", '"'], null));
            } else {
                rows.appendChild(makeRow([',', '.', '?', '!', '-', '"'], null));
            }
        }

        const bottom = document.createElement('div');
        bottom.style.cssText = `
            display:flex;
            gap:6px;
            padding: 0 6px 12px;
            align-items:stretch;
        `;

        bottom.appendChild(makeWideBtn(isShift ? '⇧ ON' : '⇧', isShift, function() {
            isShift = !isShift;
            render();
        }));

        bottom.appendChild(makeWideBtn(isSymbols || isSymbols2 ? 'ABC' : '123', isSymbols || isSymbols2, function() {
            if (isSymbols2) { isSymbols2 = false; isSymbols = false; }
            else if (isSymbols) { isSymbols = false; isSymbols2 = true; }
            else { isSymbols = true; isSymbols2 = false; }
            render();
        }));

        bottom.appendChild(makeWideBtn('␣', false, function() {
            typeChar(' ');
        }, 3));

        bottom.appendChild(makeWideBtn('⌫', false, function() {
            backspace();
        }, 1.2, true));

        bottom.appendChild(makeWideBtn('↵', false, function() {
            typeChar('\n');
        }, 1.2, true));

        root.appendChild(rows);
        root.appendChild(bottom);

        const extra = document.createElement('div');
        extra.style.cssText = 'display:flex;gap:6px;padding:0 6px 12px;';
        extra.appendChild(makeWideBtn('CLEAR', false, function() {
            if (currentInput) {
                currentInput.value = '';
                currentInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, 1));
        extra.appendChild(makeWideBtn('DONE', false, function() { hide(); }, 1));
        root.appendChild(extra);
    }

    function makeMiniBtn(label, active, handler) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.cssText = `
            padding: 4px 10px;
            border: 2px solid ${active ? 'var(--accent, #cc0000)' : 'var(--border-color, #e0e0e0)'};
            background: ${active ? 'var(--accent, #cc0000)' : 'var(--bg-primary, #ffffff)'};
            color: ${active ? 'var(--text-on-accent, #ffffff)' : 'var(--text-primary, #1a1a1a)'};
            cursor:pointer;
            font-family:${FONT_MAIN};
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.5px;
            transition: background 0.15s, border-color 0.15s, color 0.15s;
        `;
        b.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            handler();
        });
        b.addEventListener('pointerdown', function(e) {
            e.stopPropagation();
        });
        return b;
    }

    function makeRow(keys, mode) {
        const row = document.createElement('div');
        row.style.cssText = `
            display:flex;
            gap: 5px;
            justify-content:center;
            margin-bottom: 6px;
            padding: 0 2px;
        `;

        if (mode === 'nums') {
            const numsRow = document.createElement('div');
            numsRow.style.cssText = 'display:flex;gap:5px;justify-content:center;margin-bottom:6px;padding:0 2px;';
            NUMS.forEach(function(k) {
                numsRow.appendChild(makeKey(k, false));
            });
            row.appendChild(numsRow);
            row.style.flexDirection = 'column';
        }

        keys.forEach(function(k) {
            row.appendChild(makeKey(k, false));
        });

        return row;
    }

    function makeKey(label, isWide) {
        const k = document.createElement('button');
        k.type = 'button';
        k.textContent = label;
        k.dataset.key = label;
        k.style.cssText = `
            flex: ${isWide ? 3 : 1} 1 0;
            min-width: 0;
            height: 52px;
            border: 2px solid var(--border-color, #e0e0e0);
            background: var(--bg-primary, #ffffff);
            color: var(--text-primary, #1a1a1a);
            font-family: ${FONT_MAIN};
            font-size: 20px;
            font-weight: 600;
            cursor: pointer;
            touch-action: none;
            display:flex;
            align-items:center;
            justify-content:center;
            padding: 0;
            transition: background 0.08s, color 0.08s, border-color 0.08s;
            -webkit-tap-highlight-color: transparent;
            outline:none;
        `;
        if (isWide) k.style.height = '48px';

        function press() {
            if (k.dataset.pressed === '1') return;
            k.dataset.pressed = '1';
            k.style.background = 'var(--accent, #cc0000)';
            k.style.color = 'var(--text-on-accent, #ffffff)';
            k.style.borderColor = 'var(--accent, #cc0000)';
            let ch = label;
            if (isShift) {
                ch = ch.toUpperCase();
                if (!isCaps) { isShift = false; setTimeout(render, 120); }
            } else if (isCaps && /[a-zа-яё]/i.test(ch)) {
                ch = ch.toUpperCase();
            }
            typeChar(ch);

            if (!repeatTimers.has(k)) {
                const t = setTimeout(function() {
                    const iv = setInterval(function() {
                        let c = label;
                        if (isCaps) c = c.toUpperCase();
                        typeChar(c);
                    }, 60);
                    repeatTimers.set(k, iv);
                }, 500);
                repeatTimers.set(k, t);
            }
        }

        function release() {
            if (k.dataset.pressed !== '1') return;
            k.dataset.pressed = '0';
            k.style.background = 'var(--bg-primary, #ffffff)';
            k.style.color = 'var(--text-primary, #1a1a1a)';
            k.style.borderColor = 'var(--border-color, #e0e0e0)';

            if (repeatTimers.has(k)) {
                const t = repeatTimers.get(k);
                clearTimeout(t);
                clearInterval(t);
                repeatTimers.delete(k);
            }
        }

        k.addEventListener('pointerdown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            activePointerId = e.pointerId;
            try { k.setPointerCapture(e.pointerId); } catch(err) {}
            press();
        });
        k.addEventListener('pointerup', function(e) {
            e.preventDefault();
            release();
        });
        k.addEventListener('pointercancel', release);
        k.addEventListener('pointerleave', release);
        k.addEventListener('contextmenu', function(e) { e.preventDefault(); });

        return k;
    }

    function makeWideBtn(label, active, handler, flex, danger) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.cssText = `
            flex: ${flex || 1} 1 0;
            height: 48px;
            border: 2px solid ${danger ? 'var(--accent, #cc0000)' : 'var(--border-color, #e0e0e0)'};
            background: ${active ? 'var(--accent, #cc0000)' : 'var(--bg-secondary, #f5f5f5)'};
            color: ${active ? 'var(--text-on-accent, #ffffff)' : (danger ? 'var(--accent, #cc0000)' : 'var(--text-primary, #1a1a1a)')};
            font-family: ${FONT_MAIN};
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            display:flex;
            align-items:center;
            justify-content:center;
            padding: 0;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
            outline:none;
        `;
        b.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            handler();
        });
        b.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
        return b;
    }

    function typeChar(ch) {
        if (!currentInput) return;
        const start = currentInput.selectionStart ?? currentInput.value.length;
        const end = currentInput.selectionEnd ?? currentInput.value.length;
        const v = currentInput.value;
        currentInput.value = v.slice(0, start) + ch + v.slice(end);
        const pos = start + ch.length;
        try { currentInput.setSelectionRange(pos, pos); } catch(e) {}
        currentInput.dispatchEvent(new Event('input', { bubbles: true }));
        currentInput.dispatchEvent(new KeyboardEvent('keyup', { key: ch }));
    }

    function backspace() {
        if (!currentInput) return;
        const start = currentInput.selectionStart ?? currentInput.value.length;
        const end = currentInput.selectionEnd ?? currentInput.value.length;
        const v = currentInput.value;
        if (start === end && start > 0) {
            currentInput.value = v.slice(0, start - 1) + v.slice(start);
            try { currentInput.setSelectionRange(start - 1, start - 1); } catch(e) {}
        } else {
            currentInput.value = v.slice(0, start) + v.slice(end);
            try { currentInput.setSelectionRange(start, start); } catch(e) {}
        }
        currentInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function attachTo(input) {
        if (!input || input.dataset.shkeyBound === '1') return;
        input.dataset.shkeyBound = '1';

        input.addEventListener('focus', function() {
            currentInput = input;
            show();
        });
        input.addEventListener('blur', function() {
            if (currentInput === input) {
                setTimeout(function() {
                    if (document.activeElement !== input) {
                        hide();
                    }
                }, 150);
            }
        });
    }

    function attachAll(scope) {
        const root = scope || document;
        root.querySelectorAll('input, textarea').forEach(attachTo);
    }

    function show() {
        ensureRoot();
        isOpen = true;
        root.style.transform = 'translateY(0)';
        document.documentElement.style.setProperty('--shkey-h', root.offsetHeight + 'px');
        window.dispatchEvent(new CustomEvent('shnuk:keyboard-opened', { detail: { height: root.offsetHeight } }));
    }

    function hide() {
        if (!root) return;
        isOpen = false;
        root.style.transform = 'translateY(100%)';
        document.documentElement.style.setProperty('--shkey-h', '0px');
        window.dispatchEvent(new CustomEvent('shnuk:keyboard-closed'));
    }

    function isVisible() { return isOpen; }

    const mo = new MutationObserver(function(muts) {
        for (const m of muts) {
            for (const n of m.addedNodes) {
                if (n && n.nodeType === 1) {
                    if (n.matches && n.matches('input, textarea')) attachTo(n);
                    if (n.querySelectorAll) attachAll(n);
                }
            }
        }
    });

    function startObserver() {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', startObserver);
            return;
        }
        mo.observe(document.body, { childList: true, subtree: true });
        attachAll();
    }

    window.ShnukKey = {
        attach: attachTo,
        attachAll: attachAll,
        show: show,
        hide: hide,
        isVisible: isVisible,
        setLang: function(l) { currentLang = (l === 'en') ? 'en' : 'ru'; render(); },
        getLang: function() { return currentLang; }
    };

    startObserver();

})();