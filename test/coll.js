// coll.js — Collaris: визуальный конструктор приложений (страницы + кнопки + логика)

(function() {
    'use strict';

    let isOpen = false;
    let appState = null;
    let currentPageId = null;
    let selectedElementId = null;
    let idCounter = 0;
    let activeMobilePanel = 'palette';

    const STORAGE_KEY = 'coll_project';
    const COLL_ID = 'collApp';
    const INSTALLED_KEY = 'shnuk_installed_apps';

    // ============================================
    // ШРИФТЫ
    // ============================================
    const FONTS = [
        { value: "'ST-SimpleSquare', monospace", label: 'Shnuk (по умолчанию)' },
        { value: "'Courier New', monospace", label: 'Courier New' },
        { value: "monospace", label: 'Monospace' },
        { value: "Arial, sans-serif", label: 'Arial' },
        { value: "Georgia, serif", label: 'Georgia' },
        { value: "system-ui, sans-serif", label: 'Системный' },
        { value: "'Times New Roman', serif", label: 'Times New Roman' },
        { value: "Verdana, sans-serif", label: 'Verdana' }
    ];

    function getFont() {
        return (appState && appState.font) || "'ST-SimpleSquare', monospace";
    }

    // ============================================
    // ДОСТУПНЫЕ ЭЛЕМЕНТЫ
    // ============================================
    const ELEMENT_TYPES = [
        { type: 'text',      name: 'Текст',     icon: 'T',  color: '#4488ff', defaults: { text: 'Заголовок', size: 'large' } },
        { type: 'paragraph', name: 'Абзац',     icon: '¶',  color: '#4488ff', defaults: { text: 'Простой текст.' } },
        { type: 'button',    name: 'Кнопка',    icon: '▭',  color: '#cc0000', defaults: { text: 'Нажми меня', action: 'message', actionValue: 'Привет!' } },
        { type: 'input',     name: 'Поле ввода', icon: '⌨', color: '#4CAF50', defaults: { placeholder: 'Введите текст', varName: 'input1' } },
        { type: 'output',    name: 'Вывод',     icon: '▤',  color: '#607d8b', defaults: { varName: 'input1' } },
        { type: 'spacer',    name: 'Отступ',    icon: '↕',  color: '#9E9E9E', defaults: { size: '20' } }
    ];

    function getElementDef(type) { return ELEMENT_TYPES.find(e => e.type === type) || null; }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    function uid(prefix) {
        return (prefix || 'el') + '_' + (++idCounter) + '_' + Math.random().toString(36).substr(2, 5);
    }

    // ============================================
    // ПРОЕКТ
    // ============================================
    function createDefaultProject() {
        const pageId = uid('page');
        return {
            version: 1,
            title: 'Моё приложение',
            font: "'ST-SimpleSquare', monospace",
            pages: [{
                id: pageId,
                name: 'Главная',
                elements: [
                    { id: uid('el'), type: 'text', fields: { text: 'Добро пожаловать!', size: 'large' } },
                    { id: uid('el'), type: 'paragraph', fields: { text: 'Это приложение создано в Collaris.' } },
                    { id: uid('el'), type: 'button', fields: { text: 'Нажми меня', action: 'message', actionValue: 'Привет из Collaris!' } }
                ]
            }]
        };
    }

    function saveProject() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                version: 1,
                title: appState.title,
                font: appState.font,
                pages: appState.pages,
                counter: idCounter
            }));
        } catch(e) {}
    }

    function loadProject() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.pages) && parsed.pages.length > 0) {
                return {
                    version: 1,
                    title: parsed.title || 'Моё приложение',
                    font: parsed.font || "'ST-SimpleSquare', monospace",
                    pages: parsed.pages,
                    counter: parsed.counter || 0
                };
            }
        } catch(e) {}
        return null;
    }

    function getCurrentPage() {
        if (!appState) return null;
        return appState.pages.find(p => p.id === currentPageId) || null;
    }

    function getSelectedElement() {
        if (!appState || !selectedElementId) return null;
        const page = getCurrentPage();
        if (!page) return null;
        return page.elements.find(e => e.id === selectedElementId) || null;
    }

    // ============================================
    // ПРЕВЬЮ
    // ============================================
    function renderPreviewElement(el, isPreviewOnly) {
        const def = getElementDef(el.type);
        if (!def) return document.createElement('div');
        const f = el.fields || {};
        const font = getFont();

        const wrap = document.createElement('div');
        wrap.className = 'coll-element';
        wrap.dataset.elementId = el.id;
        wrap.style.fontFamily = font;

        if (!isPreviewOnly) {
            wrap.style.position = 'relative';
            wrap.style.padding = '10px';
            wrap.style.border = '2px dashed transparent';
            wrap.style.transition = 'border-color 0.15s';
            wrap.addEventListener('mouseenter', function() {
                wrap.style.borderColor = 'var(--border-color)';
            });
            wrap.addEventListener('mouseleave', function() {
                if (selectedElementId !== el.id) wrap.style.borderColor = 'transparent';
            });
            if (selectedElementId === el.id) {
                wrap.style.borderColor = 'var(--accent)';
                wrap.style.background = 'var(--bg-hover)';
            }

            const badge = document.createElement('div');
            badge.textContent = def.name;
            badge.style.cssText = 'position:absolute;top:-1px;left:-1px;background:' + def.color + ';color:#fff;font-size:9px;padding:2px 6px;letter-spacing:0.5px;z-index:2;';
            wrap.appendChild(badge);

            const rm = document.createElement('button');
            rm.textContent = '✕';
            rm.title = 'Удалить';
            rm.style.cssText = 'position:absolute;top:-1px;right:-1px;width:22px;height:22px;background:#cc0000;color:#fff;border:none;font-size:11px;cursor:pointer;padding:0;z-index:2;';
            rm.addEventListener('click', function(e) { e.stopPropagation(); removeElement(el.id); });
            wrap.appendChild(rm);

            const up = document.createElement('button');
            up.textContent = '▲';
            up.title = 'Вверх';
            up.style.cssText = 'position:absolute;bottom:-1px;right:24px;width:22px;height:22px;background:#333;color:#fff;border:none;font-size:10px;cursor:pointer;padding:0;z-index:2;';
            up.addEventListener('click', function(e) { e.stopPropagation(); moveElement(el.id, -1); });
            wrap.appendChild(up);

            const dn = document.createElement('button');
            dn.textContent = '▼';
            dn.title = 'Вниз';
            dn.style.cssText = 'position:absolute;bottom:-1px;right:-1px;width:22px;height:22px;background:#333;color:#fff;border:none;font-size:10px;cursor:pointer;padding:0;z-index:2;';
            dn.addEventListener('click', function(e) { e.stopPropagation(); moveElement(el.id, +1); });
            wrap.appendChild(dn);

            wrap.addEventListener('click', function(e) {
                e.stopPropagation();
                selectElement(el.id);
            });
        }

        const inner = document.createElement('div');
        inner.style.fontFamily = font;

        switch (el.type) {
            case 'text': {
                const h = document.createElement('div');
                h.textContent = f.text || 'Текст';
                h.style.fontWeight = '700';
                h.style.fontFamily = font;
                if (f.size === 'large') h.style.fontSize = '24px';
                else if (f.size === 'medium') h.style.fontSize = '18px';
                else h.style.fontSize = '14px';
                h.style.margin = '4px 0';
                h.style.color = 'var(--text-primary)';
                inner.appendChild(h);
                break;
            }
            case 'paragraph': {
                const p = document.createElement('div');
                p.textContent = f.text || 'Абзац';
                p.style.fontSize = '14px';
                p.style.fontFamily = font;
                p.style.lineHeight = '1.5';
                p.style.margin = '4px 0';
                p.style.color = 'var(--text-primary)';
                inner.appendChild(p);
                break;
            }
            case 'button': {
                const btn = document.createElement('button');
                btn.textContent = f.text || 'Кнопка';
                btn.style.cssText = 'padding:10px 22px;background:#cc0000;color:#fff;border:2px solid #cc0000;font-family:' + font + ';font-size:14px;font-weight:600;cursor:pointer;';
                if (isPreviewOnly) {
                    btn.addEventListener('click', function() { runButtonAction(el); });
                } else {
                    btn.addEventListener('click', function(e) { e.stopPropagation(); selectElement(el.id); });
                }
                inner.appendChild(btn);
                break;
            }
            case 'input': {
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = f.placeholder || '';
                input.dataset.varName = f.varName || 'input1';
                input.style.cssText = 'padding:10px 14px;border:2px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-family:' + font + ';font-size:14px;width:100%;max-width:320px;box-sizing:border-box;';
                if (!isPreviewOnly) {
                    input.addEventListener('click', function(e) { e.stopPropagation(); selectElement(el.id); });
                } else {
                    input.dataset.collInput = '1';
                }
                inner.appendChild(input);
                break;
            }
            case 'output': {
                const out = document.createElement('div');
                out.dataset.varName = f.varName || 'input1';
                out.textContent = '· вывод ' + (f.varName || 'input1') + ' ·';
                out.style.cssText = 'padding:10px 14px;background:var(--bg-secondary);border:2px dashed var(--border-color);color:var(--text-muted);font-size:13px;font-family:' + font + ';text-align:center;';
                if (!isPreviewOnly) {
                    out.addEventListener('click', function(e) { e.stopPropagation(); selectElement(el.id); });
                } else {
                    out.dataset.collOutput = '1';
                }
                inner.appendChild(out);
                break;
            }
            case 'spacer': {
                const s = document.createElement('div');
                s.style.height = (f.size || '20') + 'px';
                s.style.background = 'transparent';
                if (!isPreviewOnly) s.style.borderTop = '1px dashed var(--border-color)';
                inner.appendChild(s);
                break;
            }
        }

        wrap.appendChild(inner);
        return wrap;
    }

    function renderPreview() {
        const canvas = document.getElementById('collPreview');
        if (!canvas) return;
        canvas.innerHTML = '';

        const page = getCurrentPage();
        if (!page) return;

        page.elements.forEach(function(el) {
            canvas.appendChild(renderPreviewElement(el, false));
        });
    }

    // ============================================
    // ЛОГИКА КНОПОК
    // ============================================
    function runButtonAction(el) {
        const f = el.fields || {};
        const action = f.action || 'message';
        const val = f.actionValue || '';

        if (action === 'message') {
            if (window.Win && window.Win.notify) window.Win.notify(val, { type: 'info' });
            else alert(val);
        } else if (action === 'goto') {
            const page = appState.pages.find(p => p.name === val || p.id === val);
            if (page) {
                currentPageId = page.id;
                renderPreview();
                renderPagesList();
            } else {
                if (window.Win && window.Win.notify) window.Win.notify('Страница не найдена: ' + val, { type: 'error' });
            }
        } else if (action === 'setvar') {
            const parts = val.split('=');
            if (parts.length === 2) updateOutputs(parts[0].trim(), parts[1].trim());
        } else if (action === 'readinput') {
            const input = document.querySelector('[data-var-name="' + val + '"][data-coll-input]');
            if (input) updateOutputs(val, input.value);
        }
    }

    function updateOutputs(varName, value) {
        const outputs = document.querySelectorAll('[data-var-name="' + varName + '"][data-coll-output]');
        outputs.forEach(function(o) {
            o.textContent = value;
            o.style.color = 'var(--text-primary)';
            o.style.borderStyle = 'solid';
            o.style.borderColor = 'var(--accent)';
        });
    }

    // ============================================
    // ОПЕРАЦИИ С ЭЛЕМЕНТАМИ
    // ============================================
    function selectElement(id) {
        selectedElementId = id;
        renderPreview();
        renderInspector();
        if (isMobileLayout()) switchMobilePanel('inspector');
    }

    function addElement(type) {
        const def = getElementDef(type);
        if (!def) return;
        const page = getCurrentPage();
        if (!page) return;
        const el = { id: uid('el'), type: type, fields: Object.assign({}, def.defaults) };
        page.elements.push(el);
        selectedElementId = el.id;
        saveProject();
        renderPreview();
        renderInspector();
        if (isMobileLayout()) switchMobilePanel('preview');
    }

    function removeElement(id) {
        const page = getCurrentPage();
        if (!page) return;
        page.elements = page.elements.filter(e => e.id !== id);
        if (selectedElementId === id) selectedElementId = null;
        saveProject();
        renderPreview();
        renderInspector();
    }

    function moveElement(id, direction) {
        const page = getCurrentPage();
        if (!page) return;
        const idx = page.elements.findIndex(e => e.id === id);
        if (idx === -1) return;
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= page.elements.length) return;
        const tmp = page.elements[idx];
        page.elements[idx] = page.elements[newIdx];
        page.elements[newIdx] = tmp;
        saveProject();
        renderPreview();
    }

    // ============================================
    // ИНСПЕКТОР
    // ============================================
    function renderInspector() {
        const inspector = document.getElementById('collInspector');
        if (!inspector) return;
        inspector.innerHTML = '';

        const el = getSelectedElement();
        if (!el) {
            inspector.innerHTML = '<div class="coll-inspector-empty">Выберите элемент на превью, чтобы отредактировать его свойства.</div>';
            return;
        }

        const def = getElementDef(el.type);
        if (!def) return;

        const title = document.createElement('div');
        title.className = 'coll-inspector-title';
        title.textContent = def.name;
        title.style.borderLeft = '4px solid ' + def.color;
        inspector.appendChild(title);

        const fieldsContainer = document.createElement('div');
        fieldsContainer.className = 'coll-inspector-fields';

        if (el.type === 'text') {
            fieldsContainer.appendChild(makeTextInput('Текст', 'text', el.fields.text || ''));
            fieldsContainer.appendChild(makeSelect('Размер', 'size', el.fields.size || 'large', [
                { value: 'small', label: 'Маленький' },
                { value: 'medium', label: 'Средний' },
                { value: 'large', label: 'Большой' }
            ]));
        } else if (el.type === 'paragraph') {
            fieldsContainer.appendChild(makeTextarea('Текст', 'text', el.fields.text || ''));
        } else if (el.type === 'button') {
            fieldsContainer.appendChild(makeTextInput('Текст', 'text', el.fields.text || ''));
            fieldsContainer.appendChild(makeSelect('Действие', 'action', el.fields.action || 'message', [
                { value: 'message', label: 'Показать сообщение' },
                { value: 'goto', label: 'Перейти на страницу' },
                { value: 'readinput', label: 'Прочитать поле и вывести' },
                { value: 'setvar', label: 'Установить переменную' }
            ]));

            const action = el.fields.action || 'message';
            if (action === 'message') {
                fieldsContainer.appendChild(makeTextInput('Сообщение', 'actionValue', el.fields.actionValue || ''));
            } else if (action === 'goto') {
                const pages = appState.pages.map(p => ({ value: p.name, label: p.name }));
                fieldsContainer.appendChild(makeSelect('Страница', 'actionValue', el.fields.actionValue || '', pages));
            } else if (action === 'readinput') {
                fieldsContainer.appendChild(makeTextInput('Имя поля (varName)', 'actionValue', el.fields.actionValue || 'input1'));
            } else if (action === 'setvar') {
                fieldsContainer.appendChild(makeTextInput('Выражение (имя=значение)', 'actionValue', el.fields.actionValue || 'x=5'));
            }
        } else if (el.type === 'input') {
            fieldsContainer.appendChild(makeTextInput('Placeholder', 'placeholder', el.fields.placeholder || ''));
            fieldsContainer.appendChild(makeTextInput('Имя переменной', 'varName', el.fields.varName || 'input1'));
        } else if (el.type === 'output') {
            fieldsContainer.appendChild(makeTextInput('Имя переменной', 'varName', el.fields.varName || 'input1'));
        } else if (el.type === 'spacer') {
            fieldsContainer.appendChild(makeNumberInput('Высота (px)', 'size', el.fields.size || '20'));
        }

        inspector.appendChild(fieldsContainer);

        const actions = document.createElement('div');
        actions.className = 'coll-inspector-actions';

        const upBtn = document.createElement('button');
        upBtn.className = 'coll-btn';
        upBtn.textContent = '▲ Вверх';
        upBtn.addEventListener('click', function() { moveElement(el.id, -1); });
        actions.appendChild(upBtn);

        const dnBtn = document.createElement('button');
        dnBtn.className = 'coll-btn';
        dnBtn.textContent = '▼ Вниз';
        dnBtn.addEventListener('click', function() { moveElement(el.id, +1); });
        actions.appendChild(dnBtn);

        const rmBtn = document.createElement('button');
        rmBtn.className = 'coll-btn danger';
        rmBtn.textContent = '✕ Удалить';
        rmBtn.addEventListener('click', function() { removeElement(el.id); });
        actions.appendChild(rmBtn);

        inspector.appendChild(actions);
    }

    function makeTextInput(label, key, value) {
        const wrap = document.createElement('div');
        wrap.className = 'coll-inspector-row';
        const l = document.createElement('label'); l.textContent = label; wrap.appendChild(l);
        const input = document.createElement('input');
        input.type = 'text'; input.value = value;
        input.addEventListener('input', function() {
            const el = getSelectedElement();
            if (!el) return;
            el.fields[key] = this.value;
            saveProject();
            renderPreview();
        });
        wrap.appendChild(input);
        return wrap;
    }

    function makeTextarea(label, key, value) {
        const wrap = document.createElement('div');
        wrap.className = 'coll-inspector-row';
        const l = document.createElement('label'); l.textContent = label; wrap.appendChild(l);
        const input = document.createElement('textarea');
        input.value = value; input.rows = 3;
        input.addEventListener('input', function() {
            const el = getSelectedElement();
            if (!el) return;
            el.fields[key] = this.value;
            saveProject();
            renderPreview();
        });
        wrap.appendChild(input);
        return wrap;
    }

    function makeNumberInput(label, key, value) {
        const wrap = document.createElement('div');
        wrap.className = 'coll-inspector-row';
        const l = document.createElement('label'); l.textContent = label; wrap.appendChild(l);
        const input = document.createElement('input');
        input.type = 'number'; input.value = value;
        input.addEventListener('input', function() {
            const el = getSelectedElement();
            if (!el) return;
            el.fields[key] = this.value;
            saveProject();
            renderPreview();
        });
        wrap.appendChild(input);
        return wrap;
    }

    function makeSelect(label, key, value, options) {
        const wrap = document.createElement('div');
        wrap.className = 'coll-inspector-row';
        const l = document.createElement('label'); l.textContent = label; wrap.appendChild(l);
        const sel = document.createElement('select');
        options.forEach(function(o) {
            const opt = document.createElement('option');
            opt.value = o.value; opt.textContent = o.label;
            sel.appendChild(opt);
        });
        sel.value = value;
        sel.addEventListener('change', function() {
            const el = getSelectedElement();
            if (!el) return;
            el.fields[key] = this.value;
            saveProject();
            renderInspector();
            renderPreview();
        });
        wrap.appendChild(sel);
        return wrap;
    }

    // ============================================
    // СТРАНИЦЫ
    // ============================================
    function renderPagesList() {
        const list = document.getElementById('collPagesList');
        if (!list) return;
        list.innerHTML = '';

        appState.pages.forEach(function(p) {
            const item = document.createElement('div');
            item.className = 'coll-page-item' + (p.id === currentPageId ? ' active' : '');

            const name = document.createElement('span');
            name.textContent = p.name;
            name.style.flex = '1';
            name.style.minWidth = '0';
            name.style.overflow = 'hidden';
            name.style.textOverflow = 'ellipsis';
            name.style.whiteSpace = 'nowrap';
            item.appendChild(name);

            const rn = document.createElement('button');
            rn.textContent = '✎';
            rn.style.cssText = 'background:none;border:none;color:inherit;cursor:pointer;font-size:12px;padding:0 4px;';
            rn.addEventListener('click', function(e) { e.stopPropagation(); renamePage(p.id); });
            item.appendChild(rn);

            if (appState.pages.length > 1) {
                const rm = document.createElement('button');
                rm.textContent = '✕';
                rm.style.cssText = 'background:none;border:none;color:#cc0000;cursor:pointer;font-size:12px;padding:0 4px;';
                rm.addEventListener('click', function(e) { e.stopPropagation(); deletePage(p.id); });
                item.appendChild(rm);
            }

            item.addEventListener('click', function() {
                currentPageId = p.id;
                selectedElementId = null;
                saveProject();
                renderPagesList();
                renderPreview();
                renderInspector();
            });

            list.appendChild(item);
        });
    }

    function createPage() {
        let name = 'Страница ' + (appState.pages.length + 1);
        if (window.Win && window.Win.prompt) {
            window.Win.prompt('Название страницы', name, { title: 'Новая страница', okText: 'Создать' }).then(function(res) {
                if (res === null || res === undefined) return;
                name = (res || '').trim() || name;
                doCreatePage(name);
            });
        } else {
            const res = prompt('Название страницы', name);
            if (res === null) return;
            name = (res || '').trim() || name;
            doCreatePage(name);
        }
    }

    function doCreatePage(name) {
        const page = { id: uid('page'), name: name, elements: [] };
        appState.pages.push(page);
        currentPageId = page.id;
        selectedElementId = null;
        saveProject();
        renderPagesList();
        renderPreview();
        renderInspector();
    }

    function renamePage(id) {
        const page = appState.pages.find(p => p.id === id);
        if (!page) return;
        if (window.Win && window.Win.prompt) {
            window.Win.prompt('Новое название', page.name, { title: 'Переименовать', okText: 'Сохранить' }).then(function(res) {
                if (res === null || res === undefined) return;
                const newName = (res || '').trim();
                if (newName) { page.name = newName; saveProject(); renderPagesList(); }
            });
        } else {
            const res = prompt('Новое название', page.name);
            if (res === null) return;
            const newName = (res || '').trim();
            if (newName) { page.name = newName; saveProject(); renderPagesList(); }
        }
    }

    function deletePage(id) {
        if (appState.pages.length <= 1) return;
        if (!confirm('Удалить страницу?')) return;
        appState.pages = appState.pages.filter(p => p.id !== id);
        if (currentPageId === id) currentPageId = appState.pages[0].id;
        selectedElementId = null;
        saveProject();
        renderPagesList();
        renderPreview();
        renderInspector();
    }

    // ============================================
    // ГЕНЕРАЦИЯ HTML
    // ============================================
    function buildHtmlOutput() {
        const title = escapeHtml(appState.title || 'Моё приложение');
        const font = getFont();
        const pagesJson = JSON.stringify(appState.pages);

        const js = [
            'const __pages = ' + pagesJson + ';',
            'let __currentPage = __pages[0].id;',
            'const __vars = {};',
            '',
            'function __render() {',
            '  const page = __pages.find(p => p.id === __currentPage);',
            '  if (!page) return;',
            '  const root = document.getElementById("collRoot");',
            '  root.innerHTML = "";',
            '  page.elements.forEach(function(el) {',
            '    const f = el.fields || {};',
            '    let node = null;',
            '    if (el.type === "text") {',
            '      node = document.createElement("div");',
            '      node.textContent = f.text || "";',
            '      node.style.fontWeight = "700";',
            '      node.style.fontSize = f.size === "large" ? "24px" : (f.size === "medium" ? "18px" : "14px");',
            '      node.style.margin = "8px 0";',
            '    } else if (el.type === "paragraph") {',
            '      node = document.createElement("p");',
            '      node.textContent = f.text || "";',
            '      node.style.fontSize = "14px";',
            '      node.style.lineHeight = "1.5";',
            '      node.style.margin = "8px 0";',
            '    } else if (el.type === "button") {',
            '      node = document.createElement("button");',
            '      node.textContent = f.text || "Кнопка";',
            '      node.style.cssText = "padding:10px 22px;background:#cc0000;color:#fff;border:2px solid #cc0000;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;margin:8px 0;";',
            '      node.addEventListener("click", (function(fields){ return function(){ __runAction(fields); }; })(f));',
            '    } else if (el.type === "input") {',
            '      node = document.createElement("input");',
            '      node.type = "text";',
            '      node.placeholder = f.placeholder || "";',
            '      node.dataset.varName = f.varName || "input1";',
            '      node.style.cssText = "padding:10px 14px;border:2px solid #e0e0e0;background:#fff;color:#1a1a1a;font-family:inherit;font-size:14px;width:100%;max-width:320px;box-sizing:border-box;margin:8px 0;";',
            '    } else if (el.type === "output") {',
            '      node = document.createElement("div");',
            '      node.dataset.varName = f.varName || "input1";',
            '      node.dataset.collOutput = "1";',
            '      node.textContent = "· вывод " + (f.varName || "input1") + " ·";',
            '      node.style.cssText = "padding:10px 14px;background:#f5f5f5;border:2px dashed #ccc;color:#888;font-size:13px;text-align:center;margin:8px 0;";',
            '    } else if (el.type === "spacer") {',
            '      node = document.createElement("div");',
            '      node.style.height = (f.size || "20") + "px";',
            '    }',
            '    if (node) root.appendChild(node);',
            '  });',
            '}',
            '',
            'function __runAction(f) {',
            '  const action = f.action || "message";',
            '  const val = f.actionValue || "";',
            '  if (action === "message") {',
            '    alert(val);',
            '  } else if (action === "goto") {',
            '    const target = __pages.find(p => p.name === val || p.id === val);',
            '    if (target) { __currentPage = target.id; __render(); }',
            '  } else if (action === "readinput") {',
            '    const inp = document.querySelector("[data-var-name=\\"" + val + "\\"]");',
            '    if (inp) __setOutput(val, inp.value);',
            '  } else if (action === "setvar") {',
            '    const parts = val.split("=");',
            '    if (parts.length === 2) __setOutput(parts[0].trim(), parts[1].trim());',
            '  }',
            '}',
            '',
            'function __setOutput(name, value) {',
            '  const outs = document.querySelectorAll("[data-var-name=\\"" + name + "\\"][data-coll-output]");',
            '  outs.forEach(function(o) {',
            '    o.textContent = value;',
            '    o.style.color = "#1a1a1a";',
            '    o.style.borderStyle = "solid";',
            '    o.style.borderColor = "#cc0000";',
            '  });',
            '}',
            '',
            'document.addEventListener("DOMContentLoaded", function() { __render(); });'
        ].join('\n');

        const css = [
            '* { margin: 0; padding: 0; box-sizing: border-box; }',
            'html, body {',
            '  width: 100%; min-height: 100%;',
            '  background: #ffffff;',
            '  color: #1a1a1a;',
            '  font-family: ' + font + ';',
            '}',
            '#collRoot {',
            '  max-width: 720px;',
            '  margin: 0 auto;',
            '  padding: 32px 20px;',
            '}',
            '#collHeader {',
            '  padding: 16px 24px;',
            '  background: #f5f5f5;',
            '  border-bottom: 2px solid #e0e0e0;',
            '  font-weight: 700;',
            '  font-size: 16px;',
            '  text-align: center;',
            '  font-family: ' + font + ';',
            '}'
        ].join('\n');

        return '<!DOCTYPE html>\n' +
'<html lang="ru">\n' +
'<head>\n' +
'<meta charset="UTF-8" />\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
'<title>' + title + '</title>\n' +
'<style>\n' + css + '\n</style>\n' +
'</head>\n' +
'<body>\n' +
'<div id="collHeader">' + title + '</div>\n' +
'<div id="collRoot"></div>\n' +
'<script>\n' + js + '\n</script>\n' +
'</body>\n' +
'</html>';
    }

    // ============================================
    // СОХРАНЕНИЕ В ФАЙЛОВЫЙ МЕНЕДЖЕР
    // ============================================
    async function saveToFileManager() {
        try {
            if (!window.SharedFiles) {
                if (window.Win && window.Win.notify) window.Win.notify('Файловый менеджер недоступен', { type: 'error' });
                return;
            }

            const html = buildHtmlOutput();
            const name = (appState.title || 'collaris_app').replace(/[\\/:*?"<>|]/g, '_') + '.html';
            const encoder = new TextEncoder();
            const bytes = encoder.encode(html);
            let binary = '';
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            const dataUrl = 'data:text/html;charset=utf-8;base64,' + btoa(binary);

            const ok = await window.SharedFiles.add({
                id: 'coll_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
                name: name,
                size: bytes.length,
                type: 'text/html',
                data: dataUrl,
                date: new Date().toISOString(),
                extension: 'html',
                parentId: null,
                isFolder: false
            });

            if (ok) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Сохранено в Файлы: ' + name, { type: 'success', duration: 4000 });
                }
            } else {
                if (window.Win && window.Win.notify) window.Win.notify('Не удалось сохранить', { type: 'error' });
            }
        } catch(e) {
            if (window.Win && window.Win.notify) window.Win.notify('Ошибка: ' + e.message, { type: 'error' });
        }
    }

    // ============================================
    // УСТАНОВКА В МЕНЮ ПРИЛОЖЕНИЙ
    // ============================================
    function getInstalledApps() {
        try {
            const saved = localStorage.getItem(INSTALLED_KEY);
            if (!saved) return [];
            const parsed = JSON.parse(saved);
            return Array.isArray(parsed) ? parsed : [];
        } catch(e) {
            return [];
        }
    }

    function setInstalledApps(apps) {
        try {
            localStorage.setItem(INSTALLED_KEY, JSON.stringify(apps));
            return true;
        } catch(e) {
            return false;
        }
    }

    function installAsApp() {
        try {
            const html = buildHtmlOutput();
            const title = (appState.title || 'Collaris App').trim() || 'Collaris App';
            const appId = 'collar_' + title.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();

            let installed = getInstalledApps();

            const appRecord = {
                id: appId,
                name: title,
                description: 'Приложение, созданное в Collaris',
                author: 'Collaris',
                version: '1.0.0',
                icon: null,
                html: html,
                installedAt: new Date().toISOString()
            };

            installed.push(appRecord);
            setInstalledApps(installed);

            if (typeof AppScanner !== 'undefined' && AppScanner.rescan) {
                AppScanner.rescan().then(function() {
                    if (typeof window.refreshApps === 'function') window.refreshApps();
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Приложение установлено: ' + title, { type: 'success', duration: 4000 });
                    }
                });
            } else {
                if (typeof window.refreshApps === 'function') window.refreshApps();
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Приложение установлено: ' + title, { type: 'success', duration: 4000 });
                }
            }
        } catch(e) {
            if (window.Win && window.Win.notify) window.Win.notify('Ошибка установки: ' + e.message, { type: 'error' });
        }
    }

    function uninstallCollarisApp(appId, appName) {
        const confirmed = function() {
            try {
                let installed = getInstalledApps();
                installed = installed.filter(function(a) { return a.id !== appId; });
                setInstalledApps(installed);

                if (typeof AppScanner !== 'undefined' && AppScanner.rescan) {
                    AppScanner.rescan().then(function() {
                        if (typeof window.refreshApps === 'function') window.refreshApps();
                        renderInstalledAppsList();
                        if (window.Win && window.Win.notify) {
                            window.Win.notify('Удалено: ' + appName, { type: 'success' });
                        }
                    });
                } else {
                    if (typeof window.refreshApps === 'function') window.refreshApps();
                    renderInstalledAppsList();
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Удалено: ' + appName, { type: 'success' });
                    }
                }
            } catch(e) {
                if (window.Win && window.Win.notify) window.Win.notify('Ошибка удаления: ' + e.message, { type: 'error' });
            }
        };

        if (window.Win && window.Win.confirm) {
            window.Win.confirm('Удалить приложение "' + appName + '"?', {
                title: 'Удаление',
                okText: 'Удалить',
                cancelText: 'Отмена',
                danger: true
            }).then(function(ok) {
                if (ok) confirmed();
            });
        } else {
            if (confirm('Удалить приложение "' + appName + '"?')) confirmed();
        }
    }

    function reinstallCollarisApp(appId) {
        try {
            const html = buildHtmlOutput();
            let installed = getInstalledApps();
            const idx = installed.findIndex(function(a) { return a.id === appId; });
            if (idx === -1) {
                if (window.Win && window.Win.notify) window.Win.notify('Приложение не найдено', { type: 'error' });
                return;
            }
            installed[idx].html = html;
            installed[idx].version = '1.0.0';
            installed[idx].installedAt = new Date().toISOString();
            setInstalledApps(installed);

            if (typeof AppScanner !== 'undefined' && AppScanner.rescan) {
                AppScanner.rescan().then(function() {
                    if (typeof window.refreshApps === 'function') window.refreshApps();
                    renderInstalledAppsList();
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Обновлено: ' + installed[idx].name, { type: 'success' });
                    }
                });
            } else {
                if (typeof window.refreshApps === 'function') window.refreshApps();
                renderInstalledAppsList();
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Обновлено: ' + installed[idx].name, { type: 'success' });
                }
            }
        } catch(e) {
            if (window.Win && window.Win.notify) window.Win.notify('Ошибка обновления: ' + e.message, { type: 'error' });
        }
    }

    // ============================================
    // ПАНЕЛЬ УСТАНОВЛЕННЫХ ПРИЛОЖЕНИЙ
    // ============================================
    function getCollarisApps() {
        const installed = getInstalledApps();
        return installed.filter(function(a) {
            return a && a.author === 'Collaris';
        });
    }

    function renderInstalledAppsList() {
        const list = document.getElementById('collInstalledList');
        if (!list) return;

        const apps = getCollarisApps();

        if (apps.length === 0) {
            list.innerHTML = '<div class="coll-installed-empty">Пока нет приложений, установленных через Collaris.</div>';
            return;
        }

        list.innerHTML = '';

        apps.forEach(function(app) {
            const card = document.createElement('div');
            card.className = 'coll-installed-card';

            const info = document.createElement('div');
            info.className = 'coll-installed-info';

            const nameEl = document.createElement('div');
            nameEl.className = 'coll-installed-name';
            nameEl.textContent = app.name || 'Без названия';
            info.appendChild(nameEl);

            const metaEl = document.createElement('div');
            metaEl.className = 'coll-installed-meta';
            const dateStr = app.installedAt ? new Date(app.installedAt).toLocaleString('ru-RU') : '';
            metaEl.textContent = (app.version ? 'v' + app.version : '') + (dateStr ? ' • ' + dateStr : '');
            info.appendChild(metaEl);

            card.appendChild(info);

            const actions = document.createElement('div');
            actions.className = 'coll-installed-actions';

            const reinstallBtn = document.createElement('button');
            reinstallBtn.className = 'coll-btn';
            reinstallBtn.textContent = 'Обновить';
            reinstallBtn.title = 'Заменить HTML приложения текущим проектом';
            reinstallBtn.addEventListener('click', function() {
                reinstallCollarisApp(app.id);
            });
            actions.appendChild(reinstallBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'coll-btn danger';
            deleteBtn.textContent = 'Удалить';
            deleteBtn.addEventListener('click', function() {
                uninstallCollarisApp(app.id, app.name);
            });
            actions.appendChild(deleteBtn);

            card.appendChild(actions);
            list.appendChild(card);
        });
    }

    function openInstalledAppsPanel() {
        let panel = document.getElementById('collInstalledPanel');
        if (panel) {
            panel.style.display = 'flex';
            renderInstalledAppsList();
            return;
        }

        panel = document.createElement('div');
        panel.id = 'collInstalledPanel';
        panel.className = 'coll-installed-panel';

        const header = document.createElement('div');
        header.className = 'coll-installed-header';

        const title = document.createElement('div');
        title.className = 'coll-installed-title';
        title.textContent = 'Мои приложения (Collaris)';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'coll-close';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', function() {
            panel.style.display = 'none';
        });
        header.appendChild(closeBtn);

        panel.appendChild(header);

        const list = document.createElement('div');
        list.id = 'collInstalledList';
        list.className = 'coll-installed-list';
        panel.appendChild(list);

        const root = document.getElementById(COLL_ID);
        if (root) root.appendChild(panel);

        renderInstalledAppsList();
    }

    // ============================================
    // МОБИЛЬНАЯ АДАПТАЦИЯ
    // ============================================
    function isMobileLayout() {
        return window.matchMedia('(max-width: 700px)').matches;
    }

    function switchMobilePanel(panel) {
        activeMobilePanel = panel;
        const root = document.getElementById(COLL_ID);
        if (!root) return;
        root.setAttribute('data-mobile-panel', panel);
        const tabs = root.querySelectorAll('.coll-mobile-tab');
        tabs.forEach(function(t) {
            t.classList.toggle('active', t.dataset.panel === panel);
        });
    }

    // ============================================
    // UI
    // ============================================
    function injectStyles() {
        if (document.getElementById('collStyles')) return;
        const style = document.createElement('style');
        style.id = 'collStyles';
        style.textContent = `
            @keyframes collFadeIn { from { opacity: 0; } to { opacity: 1; } }

            .coll-root {
                position: fixed;
                top: var(--livebar-h, 44px);
                left: 0;
                width: 100%;
                height: calc(100% - var(--livebar-h, 44px));
                background: var(--bg-primary);
                color: var(--text-primary);
                font-family: 'ST-SimpleSquare', monospace;
                z-index: 99999;
                display: flex;
                flex-direction: column;
                opacity: 0;
                animation: collFadeIn 0.3s ease forwards;
                overflow: hidden;
                transition: background 0.4s ease, color 0.4s ease;
            }

            /* === Header === */
            .coll-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 10px;
                background: var(--header-bg);
                border-bottom: 2px solid var(--border-color);
                flex-shrink: 0;
                gap: 8px;
                color: var(--header-text);
                flex-wrap: wrap;
            }
            .coll-title-row {
                display: flex;
                align-items: center;
                gap: 8px;
                min-width: 0;
                flex: 1;
            }
            .coll-header h1 {
                font-size: 15px;
                font-weight: 700;
                margin: 0;
                letter-spacing: 0.4px;
                white-space: nowrap;
            }
            .coll-title-input {
                padding: 6px 8px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary);
                color: var(--text-primary);
                font-family: 'ST-SimpleSquare', monospace;
                font-size: 12px;
                outline: none;
                min-width: 100px;
                max-width: 180px;
                box-sizing: border-box;
            }
            .coll-title-input:focus { border-color: var(--accent); }

            .coll-header-actions {
                display: flex;
                gap: 5px;
                align-items: center;
                flex-shrink: 0;
                flex-wrap: wrap;
            }

            .coll-btn {
                padding: 7px 11px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary);
                color: var(--text-primary);
                cursor: pointer;
                font-family: 'ST-SimpleSquare', monospace;
                font-size: 11px;
                font-weight: 600;
                transition: all 0.15s ease;
                -webkit-tap-highlight-color: transparent;
                white-space: nowrap;
            }
            .coll-btn:hover { border-color: var(--accent); color: var(--accent); }
            .coll-btn.primary {
                background: var(--accent);
                border-color: var(--accent);
                color: var(--text-on-accent);
            }
            .coll-btn.primary:hover { background: var(--accent-dark); color: var(--text-on-accent); }
            .coll-btn.ghost { background: none; }
            .coll-btn.danger {
                border-color: var(--accent);
                color: var(--accent);
                background: none;
            }
            .coll-btn.danger:hover { background: var(--accent); color: var(--text-on-accent); }
            .coll-close {
                width: 34px;
                height: 34px;
                border: 2px solid var(--accent);
                background: none;
                color: var(--accent);
                cursor: pointer;
                font-size: 15px;
                font-family: 'ST-SimpleSquare', monospace;
                transition: all 0.2s ease;
                padding: 0;
                flex-shrink: 0;
            }
            .coll-close:hover { background: var(--accent); color: var(--text-on-accent); }

            /* === Mobile tabs === */
            .coll-mobile-tabs {
                display: none;
                background: var(--bg-secondary);
                border-bottom: 2px solid var(--border-color);
                flex-shrink: 0;
            }
            .coll-mobile-tab {
                flex: 1;
                padding: 10px;
                background: none;
                border: none;
                border-bottom: 3px solid transparent;
                cursor: pointer;
                font-family: 'ST-SimpleSquare', monospace;
                font-size: 12px;
                color: var(--text-muted);
                transition: all 0.2s;
                -webkit-tap-highlight-color: transparent;
            }
            .coll-mobile-tab.active {
                color: var(--accent);
                border-bottom-color: var(--accent);
                font-weight: 700;
            }

            /* === Body === */
            .coll-body {
                flex: 1;
                display: grid;
                grid-template-columns: 200px 1fr 260px;
                min-height: 0;
                overflow: hidden;
            }

            /* === Left column === */
            .coll-left {
                background: var(--bg-secondary);
                border-right: 2px solid var(--border-color);
                display: flex;
                flex-direction: column;
                min-height: 0;
                overflow: hidden;
            }
            .coll-panel-title {
                font-size: 10px;
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 1px;
                font-weight: 700;
                padding: 10px 12px 6px;
                flex-shrink: 0;
            }
            .coll-panel-actions {
                padding: 0 12px 8px;
                flex-shrink: 0;
            }
            .coll-panel-actions .coll-btn {
                width: 100%;
                font-size: 11px;
                padding: 6px 10px;
            }
            .coll-pages-list {
                padding: 0 12px 12px;
                flex-shrink: 0;
                max-height: 200px;
                overflow-y: auto;
            }
            .coll-page-item {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 8px 10px;
                background: var(--bg-primary);
                border: 2px solid var(--border-color);
                cursor: pointer;
                font-size: 12px;
                margin-bottom: 4px;
                transition: all 0.15s ease;
                color: var(--text-primary);
            }
            .coll-page-item:hover { border-color: var(--accent); }
            .coll-page-item.active {
                background: var(--accent);
                border-color: var(--accent);
                color: var(--text-on-accent);
                font-weight: 700;
            }

            .coll-palette {
                flex: 1;
                overflow-y: auto;
                padding: 0 12px 12px;
                min-height: 0;
            }
            .coll-palette-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 10px;
                margin-bottom: 6px;
                background: var(--bg-primary);
                border: 2px solid var(--border-color);
                cursor: pointer;
                transition: all 0.15s ease;
                user-select: none;
                -webkit-tap-highlight-color: transparent;
                color: var(--text-primary);
            }
            .coll-palette-item:hover { border-color: var(--accent); transform: translateX(2px); }
            .coll-palette-item:active { transform: scale(0.97); }
            .coll-palette-icon {
                width: 22px;
                height: 22px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #fff;
                font-size: 12px;
                font-weight: 700;
                flex-shrink: 0;
            }
            .coll-palette-name { font-size: 12px; font-weight: 600; }

            /* === Center === */
            .coll-center {
                background: var(--bg-primary);
                overflow: auto;
                padding: 16px;
                display: flex;
                flex-direction: column;
                align-items: center;
                min-height: 0;
            }
            .coll-preview-frame {
                width: 100%;
                max-width: 640px;
                background: var(--bg-primary);
                border: 3px solid var(--border-color);
                padding: 20px;
                min-height: 400px;
                box-sizing: border-box;
                position: relative;
            }
            .coll-preview-title {
                font-size: 11px;
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 1px;
                margin-bottom: 10px;
                text-align: center;
                max-width: 640px;
                width: 100%;
            }
            .coll-element {
                position: relative;
                transition: border-color 0.15s;
            }

            /* === Right === */
            .coll-right {
                background: var(--bg-secondary);
                border-left: 2px solid var(--border-color);
                overflow-y: auto;
                padding: 12px;
                min-height: 0;
            }
            .coll-inspector-empty {
                color: var(--text-muted);
                font-size: 12px;
                text-align: center;
                padding: 40px 12px;
                line-height: 1.6;
            }
            .coll-inspector-title {
                font-size: 13px;
                font-weight: 700;
                color: var(--text-primary);
                padding: 8px 10px;
                background: var(--bg-primary);
                margin-bottom: 12px;
                letter-spacing: 0.4px;
            }
            .coll-inspector-fields {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .coll-inspector-row {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .coll-inspector-row label {
                font-size: 10px;
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-weight: 600;
            }
            .coll-inspector-row input,
            .coll-inspector-row textarea,
            .coll-inspector-row select {
                width: 100%;
                padding: 8px 10px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary);
                color: var(--text-primary);
                font-family: 'ST-SimpleSquare', monospace;
                font-size: 12px;
                outline: none;
                box-sizing: border-box;
                resize: vertical;
            }
            .coll-inspector-row input:focus,
            .coll-inspector-row textarea:focus,
            .coll-inspector-row select:focus {
                border-color: var(--accent);
            }
            .coll-inspector-actions {
                display: flex;
                flex-direction: column;
                gap: 6px;
                margin-top: 16px;
                padding-top: 12px;
                border-top: 2px solid var(--border-color);
            }
            .coll-inspector-actions .coll-btn {
                width: 100%;
                text-align: left;
            }
            .coll-font-section {
                margin-bottom: 12px;
                padding-bottom: 12px;
                border-bottom: 2px solid var(--border-color);
            }

            /* === Installed apps panel === */
            .coll-installed-panel {
                position: absolute;
                top: 0; left: 0;
                width: 100%; height: 100%;
                background: var(--bg-primary);
                z-index: 100;
                display: flex;
                flex-direction: column;
                animation: collFadeIn 0.25s ease;
            }
            .coll-installed-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                background: var(--header-bg);
                border-bottom: 2px solid var(--border-color);
                flex-shrink: 0;
                color: var(--header-text);
            }
            .coll-installed-title {
                font-size: 15px;
                font-weight: 700;
                letter-spacing: 0.4px;
            }
            .coll-installed-list {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .coll-installed-empty {
                color: var(--text-muted);
                font-size: 13px;
                text-align: center;
                padding: 40px 16px;
                line-height: 1.6;
            }
            .coll-installed-card {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 14px;
                background: var(--bg-secondary);
                border: 2px solid var(--border-color);
                transition: all 0.15s ease;
            }
            .coll-installed-card:hover {
                border-color: var(--accent);
            }
            .coll-installed-info {
                flex: 1;
                min-width: 0;
            }
            .coll-installed-name {
                font-size: 14px;
                font-weight: 600;
                color: var(--text-primary);
                margin-bottom: 4px;
                word-break: break-word;
            }
            .coll-installed-meta {
                font-size: 11px;
                color: var(--text-muted);
            }
            .coll-installed-actions {
                display: flex;
                gap: 6px;
                flex-shrink: 0;
            }

            /* === Mobile layout === */
            @media (max-width: 700px) {
                .coll-header { padding: 6px 8px; gap: 6px; }
                .coll-header h1 { font-size: 13px; }
                .coll-title-input { font-size: 11px; padding: 5px 6px; min-width: 80px; max-width: 130px; }
                .coll-btn { font-size: 10px; padding: 6px 8px; }
                .coll-close { width: 30px; height: 30px; font-size: 13px; }

                .coll-mobile-tabs { display: flex; }

                .coll-body {
                    display: block;
                    position: relative;
                }
                .coll-left,
                .coll-center,
                .coll-right {
                    display: none;
                    width: 100%;
                    height: 100%;
                    border: none;
                    position: absolute;
                    top: 0; left: 0;
                    box-sizing: border-box;
                }
                .coll-root[data-mobile-panel="palette"] .coll-left { display: flex; }
                .coll-root[data-mobile-panel="preview"] .coll-center { display: flex; }
                .coll-root[data-mobile-panel="inspector"] .coll-right { display: block; }

                .coll-pages-list { max-height: none; }
                .coll-preview-frame { padding: 14px; min-height: 300px; }

                .coll-element > button {
                    width: 26px !important;
                    height: 26px !important;
                    font-size: 12px !important;
                }

                .coll-installed-card {
                    flex-direction: column;
                    align-items: stretch;
                }
                .coll-installed-actions {
                    width: 100%;
                }
                .coll-installed-actions .coll-btn {
                    flex: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function renderFontSelector() {
        const inspector = document.getElementById('collInspector');
        if (!inspector) return;

        const section = document.createElement('div');
        section.className = 'coll-font-section';

        const title = document.createElement('div');
        title.className = 'coll-inspector-title';
        title.textContent = 'Шрифт приложения';
        title.style.borderLeft = '4px solid var(--accent)';
        section.appendChild(title);

        const row = document.createElement('div');
        row.className = 'coll-inspector-row';
        const sel = document.createElement('select');
        FONTS.forEach(function(f) {
            const opt = document.createElement('option');
            opt.value = f.value;
            opt.textContent = f.label;
            opt.style.fontFamily = f.value;
            sel.appendChild(opt);
        });
        sel.value = getFont();
        sel.addEventListener('change', function() {
            appState.font = this.value;
            saveProject();
            renderPreview();
        });
        row.appendChild(sel);
        section.appendChild(row);

        inspector.appendChild(section);
    }

    function createUI() {
        if (document.getElementById(COLL_ID)) {
            document.getElementById(COLL_ID).style.display = 'flex';
            return;
        }

        injectStyles();

        const root = document.createElement('div');
        root.className = 'coll-root';
        root.id = COLL_ID;
        root.setAttribute('data-mobile-panel', activeMobilePanel);

        const header = document.createElement('div');
        header.className = 'coll-header';

        const titleRow = document.createElement('div');
        titleRow.className = 'coll-title-row';
        const h1 = document.createElement('h1');
        h1.textContent = 'Collaris';
        titleRow.appendChild(h1);

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'coll-title-input';
        titleInput.value = appState.title || 'Моё приложение';
        titleInput.title = 'Название приложения';
        titleInput.addEventListener('input', function() {
            appState.title = this.value;
            saveProject();
        });
        titleRow.appendChild(titleInput);

        const headerActions = document.createElement('div');
        headerActions.className = 'coll-header-actions';
        headerActions.innerHTML =
            '<button class="coll-btn ghost" id="collInstalledBtn">Мои приложения</button>' +
            '<button class="coll-btn ghost" id="collSaveBtn">Сохранить в Файлы</button>' +
            '<button class="coll-btn primary" id="collInstallBtn">Установить</button>' +
            '<button class="coll-close" id="collCloseBtn">✕</button>';

        header.appendChild(titleRow);
        header.appendChild(headerActions);

        const mobileTabs = document.createElement('div');
        mobileTabs.className = 'coll-mobile-tabs';
        mobileTabs.innerHTML =
            '<button class="coll-mobile-tab" data-panel="palette">Элементы</button>' +
            '<button class="coll-mobile-tab" data-panel="preview">Превью</button>' +
            '<button class="coll-mobile-tab" data-panel="inspector">Свойства</button>';
        mobileTabs.querySelectorAll('.coll-mobile-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                switchMobilePanel(this.dataset.panel);
            });
        });

        const body = document.createElement('div');
        body.className = 'coll-body';

        const leftCol = document.createElement('div');
        leftCol.className = 'coll-left';

        const pagesTitle = document.createElement('div');
        pagesTitle.className = 'coll-panel-title';
        pagesTitle.textContent = 'Страницы';
        leftCol.appendChild(pagesTitle);

        const pagesActions = document.createElement('div');
        pagesActions.className = 'coll-panel-actions';
        const newPageBtn = document.createElement('button');
        newPageBtn.className = 'coll-btn primary';
        newPageBtn.textContent = '+ Новая страница';
        newPageBtn.addEventListener('click', createPage);
        pagesActions.appendChild(newPageBtn);
        leftCol.appendChild(pagesActions);

        const pagesList = document.createElement('div');
        pagesList.className = 'coll-pages-list';
        pagesList.id = 'collPagesList';
        leftCol.appendChild(pagesList);

        const paletteTitle = document.createElement('div');
        paletteTitle.className = 'coll-panel-title';
        paletteTitle.textContent = 'Элементы';
        leftCol.appendChild(paletteTitle);

        const palette = document.createElement('div');
        palette.className = 'coll-palette';
        ELEMENT_TYPES.forEach(function(def) {
            const item = document.createElement('div');
            item.className = 'coll-palette-item';
            const icon = document.createElement('span');
            icon.className = 'coll-palette-icon';
            icon.textContent = def.icon;
            icon.style.background = def.color;
            item.appendChild(icon);
            const name = document.createElement('span');
            name.className = 'coll-palette-name';
            name.textContent = def.name;
            item.appendChild(name);
            item.addEventListener('click', function() { addElement(def.type); });
            palette.appendChild(item);
        });
        leftCol.appendChild(palette);

        const centerCol = document.createElement('div');
        centerCol.className = 'coll-center';
        const previewTitle = document.createElement('div');
        previewTitle.className = 'coll-preview-title';
        previewTitle.textContent = 'Превью приложения';
        centerCol.appendChild(previewTitle);

        const previewFrame = document.createElement('div');
        previewFrame.className = 'coll-preview-frame';
        previewFrame.id = 'collPreview';
        centerCol.appendChild(previewFrame);

        const rightCol = document.createElement('div');
        rightCol.className = 'coll-right';
        rightCol.id = 'collInspector';

        body.appendChild(leftCol);
        body.appendChild(centerCol);
        body.appendChild(rightCol);

        root.appendChild(header);
        root.appendChild(mobileTabs);
        root.appendChild(body);
        document.body.appendChild(root);

        isOpen = true;

        document.getElementById('collCloseBtn').addEventListener('click', closeCollaris);
        document.getElementById('collSaveBtn').addEventListener('click', saveToFileManager);
        document.getElementById('collInstallBtn').addEventListener('click', installAsApp);
        document.getElementById('collInstalledBtn').addEventListener('click', openInstalledAppsPanel);

        document.addEventListener('keydown', onKeyDown);

        previewFrame.addEventListener('click', function(e) {
            if (e.target === previewFrame) {
                selectedElementId = null;
                renderPreview();
                renderInspector();
            }
        });

        renderPagesList();
        renderPreview();
        renderInspector();
        switchMobilePanel(activeMobilePanel);
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') {
            const panel = document.getElementById('collInstalledPanel');
            if (panel && panel.style.display !== 'none') {
                panel.style.display = 'none';
                return;
            }
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                document.activeElement.blur();
                return;
            }
            closeCollaris();
        }
    }

    function openCollaris() {
        if (isOpen) {
            const el = document.getElementById(COLL_ID);
            if (el) { el.style.display = 'flex'; el.style.opacity = '1'; return; }
        }

        const loaded = loadProject();
        appState = loaded || createDefaultProject();
        idCounter = appState.counter || 0;
        currentPageId = appState.pages[0].id;
        selectedElementId = null;

        createUI();
    }

    function closeCollaris() {
        isOpen = false;
        document.removeEventListener('keydown', onKeyDown);
        const el = document.getElementById(COLL_ID);
        if (!el) return;
        saveProject();
        if (window.ShnukCloseAnimation) {
            window.ShnukCloseAnimation(el, 'coll', function() { el.remove(); });
        } else {
            el.style.opacity = '0';
            setTimeout(function() {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, 180);
        }
    }

    function destroy() {
        isOpen = false;
        document.removeEventListener('keydown', onKeyDown);
        const el = document.getElementById(COLL_ID);
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    // ============================================
    // PUBLIC API
    // ============================================
    window.Collaris = {
        destroy: destroy,
        open: openCollaris,
        exportHtml: buildHtmlOutput,
        getInstalledApps: getCollarisApps,
        uninstallApp: uninstallCollarisApp,
        renderInstalledList: renderInstalledAppsList
    };
    window.collInit = function() { openCollaris(); };
    window.collDestroy = destroy;

})();