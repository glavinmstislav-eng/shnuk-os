// coll.js — Collaris: визуальный конструктор приложений

(function() {
    'use strict';

    let isOpen = false;
    let appState = null;
    let currentPageId = null;
    let selectedElementId = null;
    let idCounter = 0;
    let activeMobilePanel = 'palette';

    let pendingParentId = null;
    let dragCtx = null;

    const STORAGE_KEY = 'coll_project';
    const COLL_ID = 'collApp';
    const INSTALLED_KEY = 'shnuk_installed_apps';
    const FONT_DEFAULT = "'TTPaplane', monospace";
    const FONT_FILE = 'TT_Paplane_Trial_Regular.ttf';

    const JSZIP_LOCAL = 'jszip.min.js';

    const FONTS = [
        { value: FONT_DEFAULT, label: 'TT Paplane (по умолчанию)' },
        { value: "'Courier New', monospace", label: 'Courier New' },
        { value: "monospace", label: 'Monospace' },
        { value: "Arial, sans-serif", label: 'Arial' },
        { value: "Georgia, serif", label: 'Georgia' },
        { value: "system-ui, sans-serif", label: 'Системный' },
        { value: "'Times New Roman', serif", label: 'Times New Roman' },
        { value: "Verdana, sans-serif", label: 'Verdana' }
    ];

    const NOTIFICATION_TYPES = [
        { value: 'info',    label: 'Обычное' },
        { value: 'success', label: 'Успех' },
        { value: 'warning', label: 'Предупреждение' },
        { value: 'error',   label: 'Ошибка' }
    ];

    function getFont() {
        return (appState && appState.font) || FONT_DEFAULT;
    }

    const ELEMENT_TYPES = [
        { type: 'text',      name: 'Текст',       icon: 'T',  color: '#4488ff', group: 'ui',    defaults: { text: 'Заголовок', size: 'large' } },
        { type: 'paragraph', name: 'Абзац',       icon: '¶',  color: '#4488ff', group: 'ui',    defaults: { text: 'Простой текст.' } },
        { type: 'spacer',    name: 'Отступ',      icon: '↕',  color: '#9E9E9E', group: 'ui',    defaults: { size: '20' } },
        { type: 'image',     name: 'Изображение', icon: 'I',  color: '#8844cc', group: 'ui',    defaults: { src: '', width: '320', align: 'left', alt: '' } },
        { type: 'video',     name: 'Видео',       icon: 'V',  color: '#dd6600', group: 'ui',    defaults: { src: '', width: '420', controls: true, autoplay: false, loop: false, muted: false } },
        { type: 'input',     name: 'Поле ввода',  icon: 'K',  color: '#4CAF50', group: 'ui',    defaults: { placeholder: 'Введите текст', varName: 'input1' } },
        { type: 'output',    name: 'Вывод',       icon: 'O',  color: '#607d8b', group: 'ui',    defaults: { varName: 'input1' } },
        { type: 'slider',    name: 'Ползунок',    icon: 'S',  color: '#00a0a0', group: 'ui',    defaults: { varName: 'slider1', min: '0', max: '100', value: '50', step: '1' } },

        { type: 'onstart',   name: 'При старте',  icon: 'P',  color: '#2e7d32', group: 'logic', defaults: { children: [] } },
        { type: 'ifb',       name: 'Если',        icon: '?',  color: '#3366cc', group: 'logic', defaults: { varName: 'x', op: '==', value: '0', children: [] } },
        { type: 'timerb',    name: 'Таймер',      icon: 'T',  color: '#cc6600', group: 'logic', defaults: { interval: '5', children: [] } },
        { type: 'setvar',    name: 'Установить',  icon: '=',  color: '#aa8800', group: 'logic', defaults: { varName: 'x', value: '0' } },
        { type: 'notifyb',   name: 'Уведомление', icon: '!',  color: '#e91e63', group: 'logic', defaults: { title: 'Заголовок', body: 'Текст уведомления', type: 'info' } },
        { type: 'varb',      name: 'Переменная',  icon: '$',  color: '#7b1fa2', group: 'logic', defaults: { name: 'x', value: '0' } }
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

    function createDefaultProject() {
        const pageId = uid('page');
        return {
            version: 3,
            title: 'Моё приложение',
            font: FONT_DEFAULT,
            pages: [{
                id: pageId,
                name: 'Главная',
                elements: [
                    { id: uid('el'), type: 'text', fields: { text: 'Добро пожаловать!', size: 'large' } },
                    { id: uid('el'), type: 'paragraph', fields: { text: 'Это приложение создано в Collaris.' } }
                ]
            }]
        };
    }

    function saveProject() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                version: 3,
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
                    version: 3,
                    title: parsed.title || 'Моё приложение',
                    font: parsed.font || FONT_DEFAULT,
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

    function findElementById(id, list) {
        if (!appState) return null;
        if (!list) {
            for (const page of appState.pages) {
                const found = findElementById(id, page.elements);
                if (found) return found;
            }
            return null;
        }
        for (const el of list) {
            if (el.id === id) return el;
            if (Array.isArray(el.fields && el.fields.children)) {
                const found = findElementById(id, el.fields.children);
                if (found) return found;
            }
        }
        return null;
    }

    function findElementLocation(id, list, parent) {
        if (!appState) return null;
        if (!list) {
            for (const page of appState.pages) {
                const r = findElementLocation(id, page.elements, null);
                if (r) return r;
            }
            return null;
        }
        for (let i = 0; i < list.length; i++) {
            const el = list[i];
            if (el.id === id) return { list: list, index: i, parent: parent };
            if (Array.isArray(el.fields && el.fields.children)) {
                const r = findElementLocation(id, el.fields.children, el);
                if (r) return r;
            }
        }
        return null;
    }

    function getSelectedElement() {
        if (!selectedElementId) return null;
        return findElementById(selectedElementId);
    }

    function isLogicElement(el) {
        if (!el) return false;
        const def = getElementDef(el.type);
        return def && def.group === 'logic';
    }

    function isContainerElement(el) {
        if (!el) return false;
        return el.type === 'onstart' || el.type === 'ifb' || el.type === 'timerb';
    }

    function extractElement(id) {
        const loc = findElementLocation(id);
        if (!loc) return null;
        return loc.list.splice(loc.index, 1)[0];
    }

    function isDescendantOf(sourceId, targetId) {
        const source = findElementById(sourceId);
        if (!source) return false;
        function walk(el) {
            if (!el) return false;
            if (el.id === targetId) return true;
            if (Array.isArray(el.fields && el.fields.children)) {
                for (const c of el.fields.children) if (walk(c)) return true;
            }
            return false;
        }
        return walk(source);
    }

    function renderPreviewElement(el, isPreviewOnly) {
        const def = getElementDef(el.type);
        if (!def) return document.createElement('div');
        if (def.group === 'logic') return null;

        const f = el.fields || {};
        const font = getFont();

        const wrap = document.createElement('div');
        wrap.className = 'coll-element';
        wrap.dataset.elementId = el.id;
        wrap.style.fontFamily = font;
        wrap.style.display = 'block';
        wrap.style.width = '100%';
        wrap.style.boxSizing = 'border-box';
        wrap.style.minHeight = '1px';
        wrap.style.clear = 'both';

        if (!isPreviewOnly) {
            wrap.style.position = 'relative';
            wrap.style.padding = '10px';
            wrap.style.border = '2px dashed transparent';
            wrap.style.transition = 'border-color 0.15s';
            wrap.style.overflow = 'visible';
            wrap.addEventListener('mouseenter', function() {
                wrap.style.borderColor = 'var(--border-color)';
            });
            wrap.addEventListener('mouseleave', function() {
                if (selectedElementId !== el.id) wrap.style.borderColor = 'transparent';
            });
            if (selectedElementId === el.id) {
                wrap.style.borderColor = 'var(--accent)';
            }

            const badge = document.createElement('div');
            badge.textContent = def.name;
            badge.style.cssText = 'position:absolute;top:-1px;left:-1px;background:' + def.color + ';color:#fff;font-size:9px;padding:2px 6px;letter-spacing:0.5px;z-index:2;font-family:' + FONT_DEFAULT + ';cursor:grab;touch-action:none;user-select:none;';
            wrap.appendChild(badge);
            badge.addEventListener('mousedown', function(e) {
                e.stopPropagation();
                e.preventDefault();
                startUiDrag(e, el.id);
            });
            badge.addEventListener('touchstart', function(e) {
                e.stopPropagation();
                if (e.cancelable) e.preventDefault();
                startUiDrag(e, el.id);
            }, { passive: false });

            const rm = document.createElement('button');
            rm.textContent = '✕';
            rm.title = 'Удалить';
            rm.style.cssText = 'position:absolute;top:-1px;right:-1px;width:22px;height:22px;background:#cc0000;color:#fff;border:none;font-size:11px;cursor:pointer;padding:0;z-index:2;';
            rm.addEventListener('click', function(e) { e.stopPropagation(); removeElement(el.id); });
            wrap.appendChild(rm);

            wrap.addEventListener('click', function(e) {
                e.stopPropagation();
                selectElement(el.id);
            });
        }

        const inner = document.createElement('div');
        inner.style.fontFamily = font;
        inner.style.width = '100%';
        inner.style.boxSizing = 'border-box';
        inner.style.overflow = 'hidden';

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
                h.style.wordBreak = 'break-word';
                h.style.whiteSpace = 'normal';
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
                p.style.wordBreak = 'break-word';
                p.style.whiteSpace = 'pre-wrap';
                inner.appendChild(p);
                break;
            }
            case 'input': {
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = f.placeholder || '';
                input.dataset.varName = f.varName || 'input1';
                input.style.cssText = 'padding:10px 14px;border:2px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-family:' + font + ';font-size:14px;width:100%;max-width:100%;box-sizing:border-box;display:block;';
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
                out.style.cssText = 'padding:10px 14px;background:var(--bg-secondary);border:2px dashed var(--border-color);color:var(--text-muted);font-size:13px;font-family:' + font + ';text-align:center;word-break:break-word;width:100%;box-sizing:border-box;display:block;';
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
                s.style.width = '100%';
                s.style.display = 'block';
                if (!isPreviewOnly) s.style.borderTop = '1px dashed var(--border-color)';
                inner.appendChild(s);
                break;
            }
            case 'image': {
                const imgWrap = document.createElement('div');
                imgWrap.style.cssText = 'display:block; width:100%; box-sizing:border-box;';
                if (f.align === 'center') imgWrap.style.textAlign = 'center';
                else if (f.align === 'right') imgWrap.style.textAlign = 'right';
                const img = document.createElement('img');
                if (f.src) img.src = f.src;
                else {
                    img.alt = 'Нет изображения';
                    img.style.cssText = 'background:var(--bg-secondary);border:2px dashed var(--border-color);width:100%;max-width:240px;height:auto;display:inline-block;';
                }
                img.style.maxWidth = '100%';
                img.style.width = (f.width || '320') + 'px';
                img.style.height = 'auto';
                img.style.display = 'inline-block';
                img.draggable = false;
                imgWrap.appendChild(img);
                if (!isPreviewOnly) {
                    imgWrap.addEventListener('click', function(e) { e.stopPropagation(); selectElement(el.id); });
                }
                inner.appendChild(imgWrap);
                break;
            }
            case 'video': {
                const vidWrap = document.createElement('div');
                vidWrap.style.cssText = 'display:block; width:100%; box-sizing:border-box;';
                if (f.src) {
                    const vid = document.createElement('video');
                    vid.src = f.src;
                    vid.controls = f.controls !== false;
                    vid.autoplay = !!f.autoplay;
                    vid.loop = !!f.loop;
                    vid.muted = !!f.muted;
                    vid.playsInline = true;
                    vid.setAttribute('playsinline', '');
                    vid.style.maxWidth = '100%';
                    vid.style.height = 'auto';
                    vid.style.width = (f.width || '420') + 'px';
                    vid.style.display = 'inline-block';
                    vidWrap.appendChild(vid);
                } else {
                    const ph = document.createElement('div');
                    ph.textContent = '· видео не выбрано ·';
                    ph.style.cssText = 'padding:24px;background:var(--bg-secondary);border:2px dashed var(--border-color);color:var(--text-muted);font-size:13px;text-align:center;width:100%;box-sizing:border-box;';
                    vidWrap.appendChild(ph);
                }
                if (!isPreviewOnly) {
                    vidWrap.addEventListener('click', function(e) { e.stopPropagation(); selectElement(el.id); });
                }
                inner.appendChild(vidWrap);
                break;
            }
            case 'slider': {
                const sWrap = document.createElement('div');
                sWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;width:100%;box-sizing:border-box;';
                const s = document.createElement('input');
                s.type = 'range';
                s.min = f.min || '0';
                s.max = f.max || '100';
                s.value = f.value || '50';
                s.step = f.step || '1';
                s.dataset.varName = f.varName || 'slider1';
                s.style.cssText = 'width:100%;accent-color:#cc0000;display:block;';
                const val = document.createElement('div');
                val.textContent = s.value;
                val.style.cssText = 'font-size:12px;color:var(--text-muted);';
                s.addEventListener('input', function() {
                    val.textContent = this.value;
                    if (isPreviewOnly) updateOutputs(this.dataset.varName, this.value);
                });
                if (!isPreviewOnly) {
                    s.addEventListener('click', function(e) { e.stopPropagation(); });
                    sWrap.addEventListener('click', function(e) { e.stopPropagation(); selectElement(el.id); });
                }
                sWrap.appendChild(s);
                sWrap.appendChild(val);
                inner.appendChild(sWrap);
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
            const node = renderPreviewElement(el, false);
            if (node) canvas.appendChild(node);
        });
    }

    function renderLogicPanel() {
        const panel = document.getElementById('collLogicPanel');
        if (!panel) return;
        panel.innerHTML = '';

        const page = getCurrentPage();
        if (!page) return;

        const logicEls = page.elements.filter(isLogicElement);

        if (logicEls.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'coll-logic-empty';
            empty.textContent = 'Нет логических блоков. Добавьте их из палитры слева — они не отображаются в предпросмотре, только в собранном приложении как поведение.';
            panel.appendChild(empty);
            return;
        }

        logicEls.forEach(function(el) {
            panel.appendChild(renderLogicBlock(el, 0));
        });
    }

    function renderLogicBlock(el, depth) {
        const def = getElementDef(el.type);
        if (!def) return document.createElement('div');
        const f = el.fields || {};

        const wrap = document.createElement('div');
        wrap.className = 'coll-logic-block';
        wrap.dataset.elementId = el.id;
        wrap.style.marginLeft = (depth * 18) + 'px';
        wrap.style.borderLeft = '4px solid ' + def.color;
        if (selectedElementId === el.id) {
            wrap.style.background = 'var(--bg-hover)';
            wrap.style.borderColor = 'var(--accent)';
        }

        const head = document.createElement('div');
        head.className = 'coll-logic-head';
        head.style.background = def.color;
        head.style.cursor = 'grab';
        head.style.touchAction = 'none';
        head.style.userSelect = 'none';

        const title = document.createElement('span');
        title.textContent = def.name;
        title.style.cssText = 'font-size:12px;font-weight:700;color:#fff;letter-spacing:0.4px;pointer-events:none;';
        head.appendChild(title);

        const headActions = document.createElement('div');
        headActions.style.cssText = 'display:flex;gap:4px;';

        const rmBtn = document.createElement('button');
        rmBtn.className = 'coll-logic-btn danger';
        rmBtn.textContent = '✕';
        rmBtn.title = 'Удалить';
        rmBtn.addEventListener('click', function(e) { e.stopPropagation(); removeElement(el.id); });
        headActions.appendChild(rmBtn);

        head.appendChild(headActions);
        wrap.appendChild(head);

        head.addEventListener('mousedown', function(e) {
            if (e.target.closest('button')) return;
            e.stopPropagation();
            e.preventDefault();
            startLogicDrag(e, el.id);
        });
        head.addEventListener('touchstart', function(e) {
            if (e.target.closest('button')) return;
            e.stopPropagation();
            if (e.cancelable) e.preventDefault();
            startLogicDrag(e, el.id);
        }, { passive: false });

        const summary = document.createElement('div');
        summary.className = 'coll-logic-summary';
        summary.textContent = buildLogicSummary(el);
        wrap.appendChild(summary);

        if (isContainerElement(el)) {
            const children = Array.isArray(el.fields.children) ? el.fields.children : [];

            const childrenWrap = document.createElement('div');
            childrenWrap.className = 'coll-logic-children';
            childrenWrap.style.cssText = 'padding: 8px 10px 10px 22px; border-left: 2px dashed ' + def.color + '; margin: 0 10px 10px; display:flex; flex-direction:column; gap:6px;';

            if (children.length === 0) {
                const hint = document.createElement('div');
                hint.textContent = 'Нет дочерних блоков.';
                hint.style.cssText = 'font-size:11px;color:var(--text-muted);';
                childrenWrap.appendChild(hint);
            } else {
                children.forEach(function(child) {
                    childrenWrap.appendChild(renderLogicBlock(child, 0));
                });
            }

            const addBtn = document.createElement('button');
            addBtn.className = 'coll-btn';
            addBtn.style.cssText = 'align-self:flex-start;margin-top:6px;';
            addBtn.textContent = '+ Добавить дочерний блок';
            addBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                selectElement(el.id);
                pendingParentId = el.id;
                if (isMobileLayout()) switchMobilePanel('palette');
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Выберите блок в палитре — он добавится внутрь', { type: 'info', duration: 2500 });
                }
            });
            childrenWrap.appendChild(addBtn);

            wrap.appendChild(childrenWrap);
        }

        wrap.addEventListener('click', function(e) {
            if (e.target.closest('button')) return;
            e.stopPropagation();
            selectElement(el.id);
        });

        return wrap;
    }

    function buildLogicSummary(el) {
        const f = el.fields || {};
        if (el.type === 'onstart') return 'Выполняется один раз при запуске приложения';
        if (el.type === 'ifb') return 'если ' + (f.varName || 'x') + ' ' + (f.op || '==') + ' ' + (f.value || '0');
        if (el.type === 'timerb') return 'каждые ' + (f.interval || '5') + ' сек';
        if (el.type === 'setvar') return (f.varName || 'x') + ' = ' + (f.value || '0');
        if (el.type === 'notifyb') {
            const t = NOTIFICATION_TYPES.find(x => x.value === (f.type || 'info'));
            const typeLabel = t ? t.label : 'Обычное';
            return 'Уведомление [' + typeLabel + ']: ' + (f.title || '');
        }
        if (el.type === 'varb') return 'var ' + (f.name || 'x') + ' = ' + (f.value || '0');
        return '';
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

    function selectElement(id) {
        selectedElementId = id;
        renderPreview();
        renderLogicPanel();
        renderInspector();
        if (isMobileLayout()) {
            const el = getSelectedElement();
            if (isLogicElement(el)) switchMobilePanel('logic');
            else switchMobilePanel('inspector');
        }
    }

    function addElement(type) {
        const def = getElementDef(type);
        if (!def) return;
        const page = getCurrentPage();
        if (!page) return;

        const el = { id: uid('el'), type: type, fields: JSON.parse(JSON.stringify(def.defaults)) };

        if (pendingParentId) {
            const parent = findElementById(pendingParentId);
            if (parent && isContainerElement(parent) && def.group === 'logic') {
                if (!Array.isArray(parent.fields.children)) parent.fields.children = [];
                parent.fields.children.push(el);
                pendingParentId = null;
                selectedElementId = el.id;
                saveProject();
                renderPreview();
                renderLogicPanel();
                renderInspector();
                if (isMobileLayout()) switchMobilePanel('logic');
                return;
            }
            pendingParentId = null;
        }

        page.elements.push(el);
        selectedElementId = el.id;
        saveProject();
        renderPreview();
        renderLogicPanel();
        renderInspector();
        if (isMobileLayout()) {
            if (def.group === 'logic') switchMobilePanel('logic');
            else switchMobilePanel('preview');
        }
    }

    function removeElement(id) {
        const extracted = extractElement(id);
        if (!extracted) return;
        if (selectedElementId === id) selectedElementId = null;
        if (pendingParentId === id) pendingParentId = null;
        saveProject();
        renderPreview();
        renderLogicPanel();
        renderInspector();
    }

    function getDragPoint(e) {
        if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
        return { x: e.clientX, y: e.clientY };
    }

    function startUiDrag(e, elementId) {
        if (dragCtx) return;
        const p = getDragPoint(e);
        dragCtx = {
            kind: 'ui',
            elementId: elementId,
            startX: p.x,
            startY: p.y,
            moved: false,
            targetList: null,
            targetIndex: -1,
            targetParentId: null
        };
        attachDragListeners();
    }

    function startLogicDrag(e, elementId) {
        if (dragCtx) return;
        const p = getDragPoint(e);
        dragCtx = {
            kind: 'logic',
            elementId: elementId,
            startX: p.x,
            startY: p.y,
            moved: false,
            targetList: null,
            targetIndex: -1,
            targetParentId: null
        };
        attachDragListeners();
    }

    function attachDragListeners() {
        document.addEventListener('mousemove', onDragMove, { passive: false });
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
        document.addEventListener('touchcancel', onDragEnd);
    }

    function detachDragListeners() {
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);
        document.removeEventListener('touchcancel', onDragEnd);
    }

    function onDragMove(e) {
        if (!dragCtx) return;
        const p = getDragPoint(e);
        const dx = p.x - dragCtx.startX;
        const dy = p.y - dragCtx.startY;
        if (!dragCtx.moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
            dragCtx.moved = true;
            const src = findElementById(dragCtx.elementId);
            if (src) {
                const node = document.querySelector('[data-element-id="' + dragCtx.elementId + '"]');
                if (node) node.classList.add('dragging');
            }
        }
        if (!dragCtx.moved) return;
        if (e.cancelable) e.preventDefault();

        const target = findDropTarget(p.x, p.y, dragCtx.elementId, dragCtx.kind);
        dragCtx.targetParentId = target ? target.parentId : null;
        dragCtx.targetList = target ? target.list : null;
        dragCtx.targetIndex = target ? target.index : -1;

        document.querySelectorAll('.coll-logic-block.drop-target, .coll-element.drop-target').forEach(function(el) {
            el.classList.remove('drop-target');
        });
        if (target && target.highlightEl) {
            target.highlightEl.classList.add('drop-target');
        }
    }

    function findDropTarget(x, y, sourceId, kind) {
        if (kind === 'ui') {
            const previewFrame = document.getElementById('collPreview');
            if (!previewFrame) return null;
            const rect = previewFrame.getBoundingClientRect();
            if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;

            const page = getCurrentPage();
            if (!page) return null;

            const candidates = [];
            page.elements.forEach(function(el, idx) {
                if (isLogicElement(el)) return;
                const node = previewFrame.querySelector('[data-element-id="' + el.id + '"]');
                if (!node) return;
                const r = node.getBoundingClientRect();
                candidates.push({ el: el, idx: idx, top: r.top, bottom: r.bottom, mid: r.top + r.height / 2 });
            });

            if (candidates.length === 0) {
                return { list: page.elements, index: 0, parentId: null, highlightEl: null };
            }

            const filtered = candidates.filter(c => c.el.id !== sourceId);
            if (filtered.length === 0) {
                return { list: page.elements, index: page.elements.length, parentId: null, highlightEl: null };
            }

            let best = null;
            let bestDist = Infinity;
            filtered.forEach(function(c) {
                const d = Math.abs(y - c.mid);
                if (d < bestDist) { bestDist = d; best = c; }
            });

            if (!best) return { list: page.elements, index: page.elements.length, parentId: null, highlightEl: null };

            const insertAfter = y > best.mid;
            const realIdx = page.elements.indexOf(best.el);
            const finalIdx = insertAfter ? realIdx + 1 : realIdx;

            return {
                list: page.elements,
                index: finalIdx,
                parentId: null,
                highlightEl: previewFrame.querySelector('[data-element-id="' + best.el.id + '"]')
            };
        }

        const blocks = Array.from(document.querySelectorAll('.coll-logic-block'));
        let bestEl = null;
        let bestDist = Infinity;
        blocks.forEach(function(b) {
            if (b.dataset.elementId === sourceId) return;
            if (isDescendantOf(sourceId, b.dataset.elementId)) return;
            const r = b.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const d = Math.abs(x - cx) + Math.abs(y - cy);
            if (d < bestDist) { bestDist = d; bestEl = b; }
        });

        if (!bestEl) return null;
        const targetId = bestEl.dataset.elementId;
        const target = findElementById(targetId);
        if (!target) return null;

        const r = bestEl.getBoundingClientRect();
        if (isContainerElement(target)) {
            const childArea = bestEl.querySelector('.coll-logic-children');
            const isInsideBody = y > r.top + 24;
            if (isInsideBody) {
                if (!Array.isArray(target.fields.children)) target.fields.children = [];
                return {
                    list: target.fields.children,
                    index: target.fields.children.length,
                    parentId: target.id,
                    highlightEl: bestEl
                };
            }
        }

        const loc = findElementLocation(targetId);
        if (!loc) return null;
        const insertAfter = y > r.top + r.height / 2;
        const finalIdx = insertAfter ? loc.index + 1 : loc.index;
        return {
            list: loc.list,
            index: finalIdx,
            parentId: loc.parent ? loc.parent.id : null,
            highlightEl: bestEl
        };
    }

    function onDragEnd(e) {
        if (!dragCtx) return;
        const ctx = dragCtx;
        dragCtx = null;
        detachDragListeners();

        document.querySelectorAll('.dragging').forEach(function(el) { el.classList.remove('dragging'); });
        document.querySelectorAll('.drop-target').forEach(function(el) { el.classList.remove('drop-target'); });

        if (!ctx.moved) return;
        if (!ctx.targetList) return;

        if (ctx.targetParentId && (ctx.targetParentId === ctx.elementId || isDescendantOf(ctx.elementId, ctx.targetParentId))) {
            return;
        }

        const el = extractElement(ctx.elementId);
        if (!el) return;

        let insertIdx = ctx.targetIndex;
        if (insertIdx < 0) insertIdx = 0;
        if (insertIdx > ctx.targetList.length) insertIdx = ctx.targetList.length;
        ctx.targetList.splice(insertIdx, 0, el);

        saveProject();
        renderPreview();
        renderLogicPanel();
        renderInspector();
    }

    function renderInspector() {
        const inspector = document.getElementById('collInspector');
        if (!inspector) return;
        inspector.innerHTML = '';

        const el = getSelectedElement();
        if (!el) {
            inspector.innerHTML = '<div class="coll-inspector-empty">Выберите элемент на превью или логический блок, чтобы отредактировать его свойства.</div>';
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

        switch (el.type) {
            case 'text':
                fieldsContainer.appendChild(makeTextInput('Текст', 'text', el.fields.text || ''));
                fieldsContainer.appendChild(makeSelect('Размер', 'size', el.fields.size || 'large', [
                    { value: 'small', label: 'Маленький' },
                    { value: 'medium', label: 'Средний' },
                    { value: 'large', label: 'Большой' }
                ]));
                break;
            case 'paragraph':
                fieldsContainer.appendChild(makeTextarea('Текст', 'text', el.fields.text || ''));
                break;
            case 'input':
                fieldsContainer.appendChild(makeTextInput('Placeholder', 'placeholder', el.fields.placeholder || ''));
                fieldsContainer.appendChild(makeTextInput('Имя переменной', 'varName', el.fields.varName || 'input1'));
                break;
            case 'output':
                fieldsContainer.appendChild(makeTextInput('Имя переменной', 'varName', el.fields.varName || 'input1'));
                break;
            case 'spacer':
                fieldsContainer.appendChild(makeNumberInput('Высота (px)', 'size', el.fields.size || '20'));
                break;
            case 'image': {
                const pick = document.createElement('div');
                pick.className = 'coll-inspector-row';
                const label = document.createElement('label'); label.textContent = 'Изображение'; pick.appendChild(label);
                const btn = document.createElement('button');
                btn.className = 'coll-btn';
                btn.textContent = el.fields.src ? 'Заменить файл' : 'Выбрать файл';
                btn.addEventListener('click', function() {
                    const inp = document.createElement('input');
                    inp.type = 'file';
                    inp.accept = 'image/*';
                    inp.onchange = function() {
                        if (!this.files || !this.files[0]) return;
                        const file = this.files[0];
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            el.fields.src = e.target.result;
                            saveProject();
                            renderPreview();
                            renderInspector();
                        };
                        reader.readAsDataURL(file);
                    };
                    inp.click();
                });
                pick.appendChild(btn);
                fieldsContainer.appendChild(pick);
                fieldsContainer.appendChild(makeTextInput('Alt', 'alt', el.fields.alt || ''));
                fieldsContainer.appendChild(makeNumberInput('Ширина (px)', 'width', el.fields.width || '320'));
                fieldsContainer.appendChild(makeSelect('Выравнивание', 'align', el.fields.align || 'left', [
                    { value: 'left', label: 'Слева' },
                    { value: 'center', label: 'По центру' },
                    { value: 'right', label: 'Справа' }
                ]));
                break;
            }
            case 'video': {
                const pick = document.createElement('div');
                pick.className = 'coll-inspector-row';
                const label = document.createElement('label'); label.textContent = 'Видео'; pick.appendChild(label);
                const btn = document.createElement('button');
                btn.className = 'coll-btn';
                btn.textContent = el.fields.src ? 'Заменить файл' : 'Выбрать файл';
                btn.addEventListener('click', function() {
                    const inp = document.createElement('input');
                    inp.type = 'file';
                    inp.accept = 'video/*';
                    inp.onchange = function() {
                        if (!this.files || !this.files[0]) return;
                        const file = this.files[0];
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            el.fields.src = e.target.result;
                            saveProject();
                            renderPreview();
                            renderInspector();
                        };
                        reader.readAsDataURL(file);
                    };
                    inp.click();
                });
                pick.appendChild(btn);
                fieldsContainer.appendChild(pick);
                fieldsContainer.appendChild(makeNumberInput('Ширина (px)', 'width', el.fields.width || '420'));
                fieldsContainer.appendChild(makeToggleCheckbox('Управление', 'controls', el.fields.controls !== false));
                fieldsContainer.appendChild(makeToggleCheckbox('Автозапуск', 'autoplay', !!el.fields.autoplay));
                fieldsContainer.appendChild(makeToggleCheckbox('Зациклить', 'loop', !!el.fields.loop));
                fieldsContainer.appendChild(makeToggleCheckbox('Без звука', 'muted', !!el.fields.muted));
                break;
            }
            case 'slider':
                fieldsContainer.appendChild(makeTextInput('Имя переменной', 'varName', el.fields.varName || 'slider1'));
                fieldsContainer.appendChild(makeNumberInput('Мин', 'min', el.fields.min || '0'));
                fieldsContainer.appendChild(makeNumberInput('Макс', 'max', el.fields.max || '100'));
                fieldsContainer.appendChild(makeNumberInput('Значение', 'value', el.fields.value || '50'));
                fieldsContainer.appendChild(makeNumberInput('Шаг', 'step', el.fields.step || '1'));
                break;
            case 'onstart':
                fieldsContainer.appendChild(makeInfoText('Этот блок выполняется один раз при запуске приложения. Добавьте дочерние блоки кнопкой «+ Добавить дочерний блок» в панели логики.'));
                break;
            case 'ifb':
                fieldsContainer.appendChild(makeTextInput('Переменная', 'varName', el.fields.varName || 'x'));
                fieldsContainer.appendChild(makeSelect('Оператор', 'op', el.fields.op || '==', [
                    { value: '==', label: '==' },
                    { value: '!=', label: '!=' },
                    { value: '>',  label: '>' },
                    { value: '<',  label: '<' },
                    { value: '>=', label: '>=' },
                    { value: '<=', label: '<=' }
                ]));
                fieldsContainer.appendChild(makeTextInput('Значение', 'value', el.fields.value || '0'));
                break;
            case 'timerb':
                fieldsContainer.appendChild(makeNumberInput('Интервал (сек)', 'interval', el.fields.interval || '5'));
                break;
            case 'setvar':
                fieldsContainer.appendChild(makeTextInput('Имя переменной', 'varName', el.fields.varName || 'x'));
                fieldsContainer.appendChild(makeTextInput('Значение', 'value', el.fields.value || '0'));
                break;
            case 'notifyb':
                fieldsContainer.appendChild(makeTextInput('Заголовок', 'title', el.fields.title || ''));
                fieldsContainer.appendChild(makeTextarea('Текст', 'body', el.fields.body || ''));
                fieldsContainer.appendChild(makeSelect('Тип уведомления', 'type', el.fields.type || 'info',
                    NOTIFICATION_TYPES.map(function(t) { return { value: t.value, label: t.label }; })
                ));
                break;
            case 'varb':
                fieldsContainer.appendChild(makeTextInput('Имя', 'name', el.fields.name || 'x'));
                fieldsContainer.appendChild(makeTextInput('Значение', 'value', el.fields.value || '0'));
                break;
        }

        inspector.appendChild(fieldsContainer);

        const actions = document.createElement('div');
        actions.className = 'coll-inspector-actions';

        const rmBtn = document.createElement('button');
        rmBtn.className = 'coll-btn danger';
        rmBtn.textContent = '✕ Удалить';
        rmBtn.addEventListener('click', function() { removeElement(el.id); });
        actions.appendChild(rmBtn);

        inspector.appendChild(actions);
    }

    function makeInfoText(text) {
        const wrap = document.createElement('div');
        wrap.className = 'coll-inspector-row';
        const p = document.createElement('div');
        p.textContent = text;
        p.style.cssText = 'font-size:12px;color:var(--text-muted);line-height:1.5;';
        wrap.appendChild(p);
        return wrap;
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
            renderLogicPanel();
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
            renderLogicPanel();
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
            renderLogicPanel();
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
            renderLogicPanel();
        });
        wrap.appendChild(sel);
        return wrap;
    }

    function makeToggleCheckbox(label, key, checked) {
        const wrap = document.createElement('div');
        wrap.className = 'coll-inspector-row';
        const l = document.createElement('label'); l.textContent = label; wrap.appendChild(l);
        const inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = !!checked;
        inp.addEventListener('change', function() {
            const el = getSelectedElement();
            if (!el) return;
            el.fields[key] = this.checked;
            saveProject();
            renderPreview();
            renderLogicPanel();
        });
        wrap.appendChild(inp);
        return wrap;
    }

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
                renderLogicPanel();
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
        renderLogicPanel();
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
        renderLogicPanel();
        renderInspector();
    }

    function loadJSZip() {
        return new Promise(function(resolve) {
            if (typeof JSZip !== 'undefined') { resolve(true); return; }
            const s = document.createElement('script');
            s.src = JSZIP_LOCAL;
            if (window.__SRI && window.__SRI[JSZIP_LOCAL]) {
                s.integrity = window.__SRI[JSZIP_LOCAL];
                s.crossOrigin = 'anonymous';
            }
            s.onload = function() { resolve(true); };
            s.onerror = function() { resolve(false); };
            document.head.appendChild(s);
        });
    }

    function fetchFontAsBytes() {
        return new Promise(function(resolve) {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', FONT_FILE, true);
                xhr.responseType = 'arraybuffer';
                xhr.onload = function() {
                    if (xhr.status === 200 || xhr.status === 0) resolve(xhr.response);
                    else resolve(null);
                };
                xhr.onerror = function() { resolve(null); };
                xhr.send();
            } catch(e) { resolve(null); }
        });
    }

    function dataURLToBytes(dataUrl) {
        if (!dataUrl || dataUrl.indexOf('data:') !== 0) return null;
        const comma = dataUrl.indexOf(',');
        if (comma === -1) return null;
        const header = dataUrl.substring(5, comma);
        const body = dataUrl.substring(comma + 1);
        const isBase64 = /;\s*base64/i.test(header);
        if (!isBase64) {
            try { return new TextEncoder().encode(decodeURIComponent(body)); } catch(e) { return null; }
        }
        try {
            const bin = atob(body);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return arr;
        } catch(e) { return null; }
    }

    function extFromMime(mime, fallback) {
        if (!mime) return fallback || 'bin';
        const m = mime.toLowerCase();
        if (m.indexOf('image/png') === 0) return 'png';
        if (m.indexOf('image/jpeg') === 0) return 'jpg';
        if (m.indexOf('image/gif') === 0) return 'gif';
        if (m.indexOf('image/webp') === 0) return 'webp';
        if (m.indexOf('image/svg') === 0) return 'svg';
        if (m.indexOf('video/mp4') === 0) return 'mp4';
        if (m.indexOf('video/webm') === 0) return 'webm';
        if (m.indexOf('video/quicktime') === 0) return 'mov';
        if (m.indexOf('audio/mpeg') === 0) return 'mp3';
        if (m.indexOf('audio/wav') === 0) return 'wav';
        return fallback || 'bin';
    }

    function extractAssetsFromProject() {
        const resources = [];
        const counters = {};
        function nextName(prefix, ext) {
            counters[prefix] = (counters[prefix] || 0) + 1;
            return prefix + '_' + counters[prefix] + '.' + ext;
        }
        function processFields(fields) {
            if (!fields || typeof fields !== 'object') return;
            if (typeof fields.src === 'string' && fields.src.indexOf('data:') === 0) {
                const comma = fields.src.indexOf(',');
                const header = fields.src.substring(5, comma);
                const mime = (header.split(';')[0] || '').trim();
                const bytes = dataURLToBytes(fields.src);
                if (bytes) {
                    const ext = extFromMime(mime, 'bin');
                    const fname = nextName(fields.varName || 'asset', ext);
                    const path = 'assets/' + fname;
                    resources.push({ path: path, bytes: bytes });
                    fields.src = path;
                }
            }
            if (Array.isArray(fields.children)) {
                fields.children.forEach(function(c) { processFields(c.fields); });
            }
        }
        const cloned = JSON.parse(JSON.stringify(appState.pages));
        cloned.forEach(function(page) {
            page.elements.forEach(function(el) {
                processFields(el.fields);
            });
        });
        return { pages: cloned, resources: resources };
    }

    function buildRuntimeCss(fontFamily) {
        return [
            '* { margin: 0; padding: 0; box-sizing: border-box; }',
            '@font-face {',
            '  font-family: "TTPaplane";',
            '  src: url("assets/' + FONT_FILE + '") format("truetype");',
            '  font-weight: 400;',
            '  font-display: swap;',
            '}',
            'html, body {',
            '  width: 100%; min-height: 100%;',
            '  background: #ffffff;',
            '  color: #1a1a1a;',
            '  font-family: ' + fontFamily + ';',
            '}',
            '#collRoot { max-width: 720px; margin: 0 auto; padding: 32px 20px; overflow: hidden; }',
            '#collRoot * { max-width: 100%; box-sizing: border-box; }',
            '#collRoot > * { display: block; width: 100%; margin-bottom: 8px; }',
            '#collHeader { padding: 16px 24px; background: #f5f5f5; border-bottom: 2px solid #e0e0e0; font-weight: 700; text-align: center; }',
            '.coll-image img, .coll-video video { max-width: 100%; height: auto; display: block; }'
        ].join('\n');
    }

    function buildRuntimeJs(pages) {
        const pagesJson = JSON.stringify(pages);
        return [
            'const __pages = ' + pagesJson + ';',
            'let __currentPage = __pages[0].id;',
            'const __vars = {};',
            'const __timers = [];',
            'const __appToken = (typeof window.__collToken === "string") ? window.__collToken : "";',
            '',
            'function __postToParent(type, data) {',
            '  try {',
            '    window.parent.postMessage({',
            '      __coll: true,',
            '      type: type,',
            '      token: __appToken,',
            '      data: data || {}',
            '    }, "*");',
            '  } catch(e) {}',
            '}',
            '',
            'function __evalCond(varName, op, value) {',
            '  const v = String(__vars[varName] !== undefined ? __vars[varName] : 0);',
            '  const target = String(value);',
            '  const nv = parseFloat(v) || 0;',
            '  const nt = parseFloat(target) || 0;',
            '  switch(op) {',
            '    case "==": return v === target;',
            '    case "!=": return v !== target;',
            '    case ">":  return nv >  nt;',
            '    case "<":  return nv <  nt;',
            '    case ">=": return nv >= nt;',
            '    case "<=": return nv <= nt;',
            '  }',
            '  return false;',
            '}',
            '',
            'function __sendNotification(title, body, type) {',
            '  __postToParent("notify", { title: title || "Уведомление", body: body || "", type: type || "info" });',
            '}',
            '',
            'function __setVar(name, value) {',
            '  __vars[name] = value;',
            '  const outs = document.querySelectorAll("[data-var-name=\\"" + name + "\\"][data-coll-output]");',
            '  outs.forEach(function(o) {',
            '    o.textContent = value;',
            '    o.style.color = "#1a1a1a";',
            '    o.style.borderStyle = "solid";',
            '    o.style.borderColor = "#cc0000";',
            '  });',
            '}',
            '',
            'function __runLogic(el) {',
            '  if (!el || !el.type) return;',
            '  const f = el.fields || {};',
            '  if (el.type === "setvar") {',
            '    __setVar(f.varName || "x", f.value || "0");',
            '  } else if (el.type === "varb") {',
            '    __setVar(f.name || "x", f.value || "0");',
            '  } else if (el.type === "notifyb") {',
            '    __sendNotification(f.title || "Уведомление", f.body || "", f.type || "info");',
            '  } else if (el.type === "ifb") {',
            '    if (__evalCond(f.varName || "x", f.op || "==", f.value || "0")) {',
            '      const kids = Array.isArray(f.children) ? f.children : [];',
            '      kids.forEach(__runLogic);',
            '    }',
            '  } else if (el.type === "timerb") {',
            '    const sec = Math.max(0.5, parseFloat(f.interval || "5") || 5) * 1000;',
            '    const kids = Array.isArray(f.children) ? f.children : [];',
            '    const id = setInterval(function() {',
            '      kids.forEach(__runLogic);',
            '    }, sec);',
            '    __timers.push(id);',
            '  } else if (el.type === "onstart") {',
            '    const kids = Array.isArray(f.children) ? f.children : [];',
            '    kids.forEach(__runLogic);',
            '  }',
            '}',
            '',
            'function __renderElement(el) {',
            '  const f = el.fields || {};',
            '  let node = null;',
            '  if (el.type === "text") {',
            '    node = document.createElement("div");',
            '    node.textContent = f.text || "";',
            '    node.style.fontWeight = "700";',
            '    node.style.fontSize = f.size === "large" ? "24px" : (f.size === "medium" ? "18px" : "14px");',
            '    node.style.margin = "8px 0";',
            '    node.style.wordBreak = "break-word";',
            '    node.style.display = "block";',
            '    node.style.width = "100%";',
            '  } else if (el.type === "paragraph") {',
            '    node = document.createElement("p");',
            '    node.textContent = f.text || "";',
            '    node.style.fontSize = "14px";',
            '    node.style.lineHeight = "1.5";',
            '    node.style.margin = "8px 0";',
            '    node.style.wordBreak = "break-word";',
            '    node.style.whiteSpace = "pre-wrap";',
            '    node.style.display = "block";',
            '    node.style.width = "100%";',
            '  } else if (el.type === "input") {',
            '    node = document.createElement("input");',
            '    node.type = "text";',
            '    node.placeholder = f.placeholder || "";',
            '    node.dataset.varName = f.varName || "input1";',
            '    node.dataset.collInput = "1";',
            '    node.style.cssText = "padding:10px 14px;border:2px solid #e0e0e0;background:#fff;color:#1a1a1a;font-family:inherit;font-size:14px;width:100%;max-width:100%;box-sizing:border-box;margin:8px 0;display:block;";',
            '  } else if (el.type === "output") {',
            '    node = document.createElement("div");',
            '    node.dataset.varName = f.varName || "input1";',
            '    node.dataset.collOutput = "1";',
            '    node.textContent = "· вывод " + (f.varName || "input1") + " ·";',
            '    node.style.cssText = "padding:10px 14px;background:#f5f5f5;border:2px dashed #ccc;color:#888;font-size:13px;text-align:center;margin:8px 0;word-break:break-word;width:100%;box-sizing:border-box;display:block;";',
            '  } else if (el.type === "spacer") {',
            '    node = document.createElement("div");',
            '    node.style.height = (f.size || "20") + "px";',
            '    node.style.width = "100%";',
            '    node.style.display = "block";',
            '  } else if (el.type === "image") {',
            '    const wrap = document.createElement("div");',
            '    wrap.className = "coll-image";',
            '    wrap.style.width = "100%";',
            '    wrap.style.boxSizing = "border-box";',
            '    wrap.style.display = "block";',
            '    wrap.style.textAlign = f.align === "center" ? "center" : (f.align === "right" ? "right" : "left");',
            '    if (f.src) {',
            '      const img = document.createElement("img");',
            '      img.src = f.src;',
            '      img.alt = f.alt || "";',
            '      img.style.width = (f.width || "320") + "px";',
            '      img.style.maxWidth = "100%";',
            '      img.style.height = "auto";',
            '      img.style.display = "inline-block";',
            '      wrap.appendChild(img);',
            '    }',
            '    node = wrap;',
            '  } else if (el.type === "video") {',
            '    if (f.src) {',
            '      const v = document.createElement("video");',
            '      v.src = f.src;',
            '      v.controls = f.controls !== false;',
            '      v.autoplay = !!f.autoplay;',
            '      v.loop = !!f.loop;',
            '      v.muted = !!f.muted;',
            '      v.playsInline = true;',
            '      v.setAttribute("playsinline", "");',
            '      v.style.width = (f.width || "420") + "px";',
            '      v.style.maxWidth = "100%";',
            '      v.style.height = "auto";',
            '      v.className = "coll-video";',
            '      node = v;',
            '    }',
            '  } else if (el.type === "slider") {',
            '    const wrap = document.createElement("div");',
            '    wrap.style.width = "100%";',
            '    wrap.style.boxSizing = "border-box";',
            '    wrap.style.display = "block";',
            '    const s = document.createElement("input");',
            '    s.type = "range";',
            '    s.min = f.min || "0";',
            '    s.max = f.max || "100";',
            '    s.value = f.value || "50";',
            '    s.step = f.step || "1";',
            '    s.dataset.varName = f.varName || "slider1";',
            '    s.style.cssText = "width:100%;accent-color:#cc0000;display:block;";',
            '    const val = document.createElement("div");',
            '    val.textContent = s.value;',
            '    val.style.cssText = "font-size:12px;color:#888;";',
            '    s.addEventListener("input", function() {',
            '      val.textContent = s.value;',
            '      __setVar(s.dataset.varName, s.value);',
            '    });',
            '    wrap.appendChild(s);',
            '    wrap.appendChild(val);',
            '    node = wrap;',
            '  }',
            '  return node;',
            '}',
            '',
            'function __render() {',
            '  const page = __pages.find(p => p.id === __currentPage);',
            '  if (!page) return;',
            '  const root = document.getElementById("collRoot");',
            '  root.innerHTML = "";',
            '  page.elements.forEach(function(el) {',
            '    if (el.type === "onstart" || el.type === "ifb" || el.type === "timerb" || el.type === "setvar" || el.type === "notifyb" || el.type === "varb") return;',
            '    const node = __renderElement(el);',
            '    if (node) root.appendChild(node);',
            '  });',
            '  page.elements.forEach(function(el) {',
            '    if (el.type === "onstart" || el.type === "ifb" || el.type === "timerb" || el.type === "setvar" || el.type === "notifyb" || el.type === "varb") {',
            '      __runLogic(el);',
            '    }',
            '  });',
            '}',
            '',
            'document.addEventListener("DOMContentLoaded", function() { __render(); });'
        ].join('\n');
    }

    async function buildProjectZip() {
        const ok = await loadJSZip();
        if (!ok) throw new Error('Не удалось загрузить JSZip');

        const zip = new JSZip();
        const fontBytes = await fetchFontAsBytes();
        const { pages, resources } = extractAssetsFromProject();

        if (fontBytes) {
            zip.file('assets/' + FONT_FILE, fontBytes);
        }
        resources.forEach(function(r) {
            zip.file(r.path, r.bytes);
        });

        const title = escapeHtml(appState.title || 'Моё приложение');
        const font = getFont();
        const css = buildRuntimeCss(font);
        const js = buildRuntimeJs(pages);

        const html = '<!DOCTYPE html>\n' +
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
        zip.file('index.html', html);

        zip.file('README.txt',
            'Приложение "' + (appState.title || 'Моё приложение') + '"\n' +
            'Собрано в Collaris.\n\n' +
            'Откройте index.html в браузере. Все ресурсы и шрифт — в папке assets.\n');

        return zip.generateAsync({ type: 'blob' });
    }

    function blobToDataURL(blob) {
        return new Promise(function(resolve, reject) {
            const reader = new FileReader();
            reader.onload = function() { resolve(reader.result); };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async function saveToFileManager() {
        try {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Собираю архив...', { type: 'info', duration: 2000 });
            }

            const blob = await buildProjectZip();
            const dataUrl = await blobToDataURL(blob);
            const name = (appState.title || 'collaris_app').replace(/[\\/:*?"<>|]/g, '_') + '_' + Date.now() + '.zip';

            if (!window.SharedFiles) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = name;
                document.body.appendChild(a);
                a.click();
                setTimeout(function() {
                    URL.revokeObjectURL(url);
                    if (a.parentNode) a.parentNode.removeChild(a);
                }, 800);
                return;
            }

            const ok = await window.SharedFiles.add({
                id: 'coll_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
                name: name,
                size: blob.size,
                type: 'application/zip',
                data: dataUrl,
                date: new Date().toISOString(),
                extension: 'zip',
                parentId: null,
                isFolder: false
            });

            if (ok && window.Win && window.Win.notify) {
                window.Win.notify('Сохранено в Файлы: ' + name, { type: 'success', duration: 4000 });
            }
        } catch(e) {
            if (window.Win && window.Win.notify) window.Win.notify('Ошибка: ' + e.message, { type: 'error' });
        }
    }

    function getInstalledApps() {
        try {
            const saved = localStorage.getItem(INSTALLED_KEY);
            if (!saved) return [];
            const parsed = JSON.parse(saved);
            return Array.isArray(parsed) ? parsed : [];
        } catch(e) { return []; }
    }

    function setInstalledApps(apps) {
        try { localStorage.setItem(INSTALLED_KEY, JSON.stringify(apps)); return true; }
        catch(e) { return false; }
    }

    function buildStandaloneHtml() {
        const cloned = JSON.parse(JSON.stringify(appState.pages));
        const title = escapeHtml(appState.title || 'Моё приложение');
        const font = getFont();
        const css = buildRuntimeCss(font);
        const js = buildRuntimeJs(cloned);

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

    function buildInstalledHtml(appId, appName) {
        const cloned = JSON.parse(JSON.stringify(appState.pages));
        const title = escapeHtml(appName || appState.title || 'Моё приложение');
        const font = getFont();
        const css = buildRuntimeCss(font);
        const js = buildRuntimeJs(cloned);

        const prelude =
            '<script>\n' +
            'window.__collAppId = ' + JSON.stringify(appId) + ';\n' +
            'window.__collAppName = ' + JSON.stringify(appName || appState.title || 'Collaris App') + ';\n' +
            'window.__collToken = "";\n' +
            '</script>\n';

        return '<!DOCTYPE html>\n' +
'<html lang="ru">\n' +
'<head>\n' +
'<meta charset="UTF-8" />\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
'<title>' + title + '</title>\n' +
'<style>\n' + css + '\n</style>\n' +
prelude +
'</head>\n' +
'<body>\n' +
'<div id="collHeader">' + title + '</div>\n' +
'<div id="collRoot"></div>\n' +
'<script>\n' + js + '\n</script>\n' +
'</body>\n' +
'</html>';
    }

    async function confirmCollarisInstall(appName) {
        if (typeof window.confirmInstallWarning === 'function') {
            try {
                return await window.confirmInstallWarning({
                    name: appName,
                    source: 'Collaris'
                });
            } catch(e) {
                return false;
            }
        }
        if (window.Win && window.Win.confirm) {
            try {
                return await window.Win.confirm(
                    'Файл может быть опасным. Устанавливайте приложения только из проверенных источников. Продолжить?',
                    { title: 'Внимание', okText: 'Установить', cancelText: 'Отмена', danger: true }
                );
            } catch(e) {
                return false;
            }
        }
        return true;
    }

    async function installAsApp() {
        try {
            const title = (appState.title || 'Collaris App').trim() || 'Collaris App';

            const proceed = await confirmCollarisInstall(title);
            if (!proceed) return;

            const appId = 'collar_' + title.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
            const html = buildInstalledHtml(appId, title);

            let installed = getInstalledApps();
            installed.push({
                id: appId,
                name: title,
                description: 'Приложение, созданное в Collaris',
                author: 'Collaris',
                version: '1.0.0',
                icon: null,
                html: html,
                installedAt: new Date().toISOString()
            });
            setInstalledApps(installed);

            if (typeof AppScanner !== 'undefined' && AppScanner.rescan) {
                AppScanner.rescan().then(function() {
                    if (typeof window.refreshApps === 'function') window.refreshApps();
                    if (window.Win && window.Win.notify) window.Win.notify('Приложение установлено: ' + title, { type: 'success', duration: 4000 });
                });
            } else {
                if (typeof window.refreshApps === 'function') window.refreshApps();
                if (window.Win && window.Win.notify) window.Win.notify('Приложение установлено: ' + title, { type: 'success', duration: 4000 });
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
                        if (window.Win && window.Win.notify) window.Win.notify('Удалено: ' + appName, { type: 'success' });
                    });
                } else {
                    if (typeof window.refreshApps === 'function') window.refreshApps();
                    renderInstalledAppsList();
                    if (window.Win && window.Win.notify) window.Win.notify('Удалено: ' + appName, { type: 'success' });
                }
            } catch(e) {
                if (window.Win && window.Win.notify) window.Win.notify('Ошибка удаления: ' + e.message, { type: 'error' });
            }
        };
        if (window.Win && window.Win.confirm) {
            window.Win.confirm('Удалить приложение "' + appName + '"?', {
                title: 'Удаление', okText: 'Удалить', cancelText: 'Отмена', danger: true
            }).then(function(ok) { if (ok) confirmed(); });
        } else {
            if (confirm('Удалить приложение "' + appName + '"?')) confirmed();
        }
    }

    function reinstallCollarisApp(appId) {
        try {
            let installed = getInstalledApps();
            const idx = installed.findIndex(function(a) { return a.id === appId; });
            if (idx === -1) {
                if (window.Win && window.Win.notify) window.Win.notify('Приложение не найдено', { type: 'error' });
                return;
            }
            const appName = installed[idx].name;
            const html = buildInstalledHtml(appId, appName);
            installed[idx].html = html;
            installed[idx].version = '1.0.0';
            installed[idx].installedAt = new Date().toISOString();
            setInstalledApps(installed);

            if (typeof AppScanner !== 'undefined' && AppScanner.rescan) {
                AppScanner.rescan().then(function() {
                    if (typeof window.refreshApps === 'function') window.refreshApps();
                    renderInstalledAppsList();
                    if (window.Win && window.Win.notify) window.Win.notify('Обновлено: ' + installed[idx].name, { type: 'success' });
                });
            } else {
                if (typeof window.refreshApps === 'function') window.refreshApps();
                renderInstalledAppsList();
                if (window.Win && window.Win.notify) window.Win.notify('Обновлено: ' + installed[idx].name, { type: 'success' });
            }
        } catch(e) {
            if (window.Win && window.Win.notify) window.Win.notify('Ошибка обновления: ' + e.message, { type: 'error' });
        }
    }

    function getCollarisApps() {
        return getInstalledApps().filter(function(a) { return a && a.author === 'Collaris'; });
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
            reinstallBtn.addEventListener('click', function() { reinstallCollarisApp(app.id); });
            actions.appendChild(reinstallBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'coll-btn danger';
            deleteBtn.textContent = 'Удалить';
            deleteBtn.addEventListener('click', function() { uninstallCollarisApp(app.id, app.name); });
            actions.appendChild(deleteBtn);

            card.appendChild(actions);
            list.appendChild(card);
        });
    }

    function openInstalledAppsPanel() {
        let panel = document.getElementById('collInstalledPanel');
        if (panel) { panel.style.display = 'flex'; renderInstalledAppsList(); return; }

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
        closeBtn.addEventListener('click', function() { panel.style.display = 'none'; });
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
                font-family: ${FONT_DEFAULT};
                z-index: 99999;
                display: flex;
                flex-direction: column;
                opacity: 0;
                animation: collFadeIn 0.3s ease forwards;
                overflow: hidden;
            }

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
            .coll-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
            .coll-header h1 { font-size: 15px; font-weight: 700; margin: 0; letter-spacing: 0.4px; white-space: nowrap; }
            .coll-title-input {
                padding: 6px 8px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary);
                color: var(--text-primary);
                font-family: ${FONT_DEFAULT};
                font-size: 12px;
                outline: none;
                min-width: 100px; max-width: 180px; box-sizing: border-box;
            }
            .coll-header-actions { display: flex; gap: 5px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }

            .coll-btn {
                padding: 7px 11px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary);
                color: var(--text-primary);
                cursor: pointer;
                font-family: ${FONT_DEFAULT};
                font-size: 11px;
                font-weight: 600;
                transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
                white-space: nowrap;
            }
            .coll-btn:hover { border-color: var(--accent); color: var(--accent); }
            .coll-btn.primary { background: var(--accent); border-color: var(--accent); color: var(--text-on-accent); }
            .coll-btn.primary:hover { background: var(--accent-dark); color: var(--text-on-accent); border-color: var(--accent-dark); }
            .coll-btn.ghost { background: none; }
            .coll-btn.danger { border-color: var(--accent); color: var(--accent); background: none; }
            .coll-btn.danger:hover { background: var(--accent); color: var(--text-on-accent); }
            .coll-close {
                width: 34px; height: 34px;
                border: 2px solid var(--accent);
                background: none; color: var(--accent);
                cursor: pointer; font-size: 15px; padding: 0; flex-shrink: 0;
            }
            .coll-close:hover { background: var(--accent); color: var(--text-on-accent); }

            .coll-mobile-tabs { display: none; background: var(--bg-secondary); border-bottom: 2px solid var(--border-color); flex-shrink: 0; }
            .coll-mobile-tab {
                flex: 1; padding: 10px; background: none; border: none;
                border-bottom: 3px solid transparent; cursor: pointer;
                font-family: ${FONT_DEFAULT}; font-size: 12px; color: var(--text-muted);
            }
            .coll-mobile-tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 700; }

            .coll-body { flex: 1; display: grid; grid-template-columns: 220px 1fr 300px; min-height: 0; overflow: hidden; }

            .coll-left { background: var(--bg-secondary); border-right: 2px solid var(--border-color); display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
            .coll-panel-title {
                font-size: 10px; color: var(--text-muted); text-transform: uppercase;
                letter-spacing: 1px; font-weight: 700; padding: 10px 12px 6px; flex-shrink: 0;
            }
            .coll-panel-actions { padding: 0 12px 8px; flex-shrink: 0; }
            .coll-panel-actions .coll-btn { width: 100%; }
            .coll-pages-list { padding: 0 12px 12px; flex-shrink: 0; max-height: 160px; overflow-y: auto; }
            .coll-page-item {
                display: flex; align-items: center; gap: 4px;
                padding: 8px 10px; background: var(--bg-primary); border: 2px solid var(--border-color);
                cursor: pointer; font-size: 12px; margin-bottom: 4px;
            }
            .coll-page-item.active { background: var(--accent); border-color: var(--accent); color: var(--text-on-accent); font-weight: 700; }
            .coll-page-item:hover { border-color: var(--accent); }

            .coll-palette { flex: 1; overflow-y: auto; padding: 0 12px 12px; min-height: 0; }
            .coll-palette-group-title { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin: 10px 0 6px; }
            .coll-palette-item {
                display: flex; align-items: center; gap: 8px;
                padding: 8px 10px; margin-bottom: 6px;
                background: var(--bg-primary); border: 2px solid var(--border-color);
                cursor: pointer;
                transition: border-color 0.15s ease;
            }
            .coll-palette-item:hover { border-color: var(--accent); }
            .coll-palette-icon {
                width: 22px; height: 22px;
                display: flex; align-items: center; justify-content: center;
                color: #fff; font-size: 12px; font-weight: 700; flex-shrink: 0;
            }
            .coll-palette-name { font-size: 12px; font-weight: 600; }

            .coll-center {
                background: var(--bg-primary);
                overflow: auto;
                padding: 16px;
                display: flex;
                flex-direction: column;
                align-items: center;
                min-height: 0;
                -webkit-overflow-scrolling: touch;
            }
            .coll-preview-frame {
                width: 100%; max-width: 640px; background: var(--bg-primary);
                border: 3px solid var(--border-color); padding: 20px;
                min-height: 400px; box-sizing: border-box; position: relative;
                overflow: visible;
            }
            .coll-preview-title { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; text-align: center; max-width: 640px; width: 100%; }
            .coll-element {
                position: relative;
                display: block;
                width: 100%;
                box-sizing: border-box;
                min-height: 1px;
                clear: both;
            }
            .coll-element.dragging { opacity: 0.4; }
            .coll-element.drop-target { box-shadow: inset 0 0 0 3px var(--accent); }

            .coll-right { background: var(--bg-secondary); border-left: 2px solid var(--border-color); overflow-y: auto; padding: 12px; min-height: 0; }
            .coll-inspector-empty { color: var(--text-muted); font-size: 12px; text-align: center; padding: 40px 12px; line-height: 1.6; }
            .coll-inspector-title { font-size: 13px; font-weight: 700; color: var(--text-primary); padding: 8px 10px; background: var(--bg-primary); margin-bottom: 12px; }
            .coll-inspector-fields { display: flex; flex-direction: column; gap: 10px; }
            .coll-inspector-row { display: flex; flex-direction: column; gap: 4px; }
            .coll-inspector-row label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
            .coll-inspector-row input,
            .coll-inspector-row textarea,
            .coll-inspector-row select {
                width: 100%; padding: 8px 10px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary); color: var(--text-primary);
                font-family: ${FONT_DEFAULT}; font-size: 12px;
                outline: none; box-sizing: border-box; resize: vertical;
            }
            .coll-inspector-actions { display: flex; flex-direction: column; gap: 6px; margin-top: 16px; padding-top: 12px; border-top: 2px solid var(--border-color); }
            .coll-inspector-actions .coll-btn { width: 100%; text-align: left; }

            .coll-installed-panel { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-primary); z-index: 100; display: flex; flex-direction: column; }
            .coll-installed-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 12px 16px; background: var(--header-bg); border-bottom: 2px solid var(--border-color);
                color: var(--header-text);
            }
            .coll-installed-title { font-size: 15px; font-weight: 700; }
            .coll-installed-list { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
            .coll-installed-empty { color: var(--text-muted); font-size: 13px; text-align: center; padding: 40px 16px; }
            .coll-installed-card { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--bg-secondary); border: 2px solid var(--border-color); }
            .coll-installed-info { flex: 1; min-width: 0; }
            .coll-installed-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; word-break: break-word; }
            .coll-installed-meta { font-size: 11px; color: var(--text-muted); }
            .coll-installed-actions { display: flex; gap: 6px; flex-shrink: 0; }

            .coll-logic-panel {
                width: 100%;
                max-width: 640px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                margin-top: 16px;
            }
            .coll-logic-title {
                font-size: 11px;
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 1px;
                text-align: center;
            }
            .coll-logic-empty {
                font-size: 12px;
                color: var(--text-muted);
                text-align: center;
                padding: 24px 12px;
                border: 2px dashed var(--border-color);
                line-height: 1.5;
            }
            .coll-logic-block {
                background: var(--bg-secondary);
                border: 2px solid var(--border-color);
                cursor: pointer;
                transition: background 0.2s ease, border-color 0.2s ease;
            }
            .coll-logic-block.dragging { opacity: 0.4; }
            .coll-logic-block.drop-target { box-shadow: inset 0 0 0 3px var(--accent); }
            .coll-logic-head {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 10px;
                color: #fff;
            }
            .coll-logic-summary {
                padding: 10px 12px;
                font-size: 12px;
                color: var(--text-primary);
                font-family: ${FONT_DEFAULT};
            }
            .coll-logic-btn {
                width: 22px;
                height: 22px;
                background: rgba(255,255,255,0.2);
                border: none;
                color: #fff;
                cursor: pointer;
                font-size: 10px;
                padding: 0;
                font-family: ${FONT_DEFAULT};
            }
            .coll-logic-btn:hover { background: rgba(255,255,255,0.35); }
            .coll-logic-btn.danger { background: rgba(0,0,0,0.25); }
            .coll-logic-btn.danger:hover { background: rgba(0,0,0,0.5); }

            @media (max-width: 700px) {
                .coll-body {
                    display: block;
                    position: relative;
                    flex: 1;
                    min-height: 0;
                }
                .coll-left, .coll-center, .coll-right {
                    display: none;
                    width: 100%;
                    height: 100%;
                    border: none;
                    position: absolute;
                    top: 0; left: 0;
                    box-sizing: border-box;
                    overflow-y: auto;
                    -webkit-overflow-scrolling: touch;
                }
                .coll-root[data-mobile-panel="palette"] .coll-left { display: flex; flex-direction: column; }
                .coll-root[data-mobile-panel="preview"] .coll-center { display: block; padding: 12px; }
                .coll-root[data-mobile-panel="inspector"] .coll-right { display: block; }
                .coll-root[data-mobile-panel="logic"] .coll-center { display: block; padding: 12px; }
                .coll-mobile-tabs { display: flex; }
                .coll-pages-list { max-height: none; }
                .coll-preview-frame { padding: 12px; min-height: 300px; overflow: visible; }
                .coll-installed-card { flex-direction: column; align-items: stretch; }
                .coll-installed-actions { width: 100%; }
                .coll-installed-actions .coll-btn { flex: 1; }
            }
        `;
        document.head.appendChild(style);
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
            '<button class="coll-btn ghost" id="collSaveBtn">Скачать ZIP</button>' +
            '<button class="coll-btn primary" id="collInstallBtn">Установить</button>' +
            '<button class="coll-close" id="collCloseBtn">✕</button>';

        header.appendChild(titleRow);
        header.appendChild(headerActions);

        const mobileTabs = document.createElement('div');
        mobileTabs.className = 'coll-mobile-tabs';
        mobileTabs.innerHTML =
            '<button class="coll-mobile-tab" data-panel="palette">Элементы</button>' +
            '<button class="coll-mobile-tab" data-panel="preview">Превью</button>' +
            '<button class="coll-mobile-tab" data-panel="logic">Логика</button>' +
            '<button class="coll-mobile-tab" data-panel="inspector">Свойства</button>';
        mobileTabs.querySelectorAll('.coll-mobile-tab').forEach(function(tab) {
            tab.addEventListener('click', function() { switchMobilePanel(this.dataset.panel); });
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

        const groups = [
            { id: 'ui',    title: 'Интерфейс' },
            { id: 'logic', title: 'Логика' }
        ];
        groups.forEach(function(g) {
            const groupTitle = document.createElement('div');
            groupTitle.className = 'coll-palette-group-title';
            groupTitle.textContent = g.title;
            palette.appendChild(groupTitle);
            ELEMENT_TYPES.filter(function(d) { return d.group === g.id; }).forEach(function(def) {
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

        const logicTitle = document.createElement('div');
        logicTitle.className = 'coll-logic-title';
        logicTitle.textContent = 'Логика (не отображается в приложении)';
        centerCol.appendChild(logicTitle);

        const logicPanel = document.createElement('div');
        logicPanel.className = 'coll-logic-panel';
        logicPanel.id = 'collLogicPanel';
        centerCol.appendChild(logicPanel);

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
                pendingParentId = null;
                renderPreview();
                renderLogicPanel();
                renderInspector();
            }
        });

        renderPagesList();
        renderPreview();
        renderLogicPanel();
        renderInspector();
        switchMobilePanel(activeMobilePanel);
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') {
            const panel = document.getElementById('collInstalledPanel');
            if (panel && panel.style.display !== 'none') { panel.style.display = 'none'; return; }
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                document.activeElement.blur();
                return;
            }
            if (pendingParentId) { pendingParentId = null; return; }
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
        pendingParentId = null;
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

    window.Collaris = {
        destroy: destroy,
        open: openCollaris,
        exportZip: buildProjectZip,
        exportHtml: buildStandaloneHtml,
        getInstalledApps: getCollarisApps,
        uninstallApp: uninstallCollarisApp,
        renderInstalledList: renderInstalledAppsList
    };
    window.collInit = function() { openCollaris(); };
    window.collDestroy = destroy;

})();