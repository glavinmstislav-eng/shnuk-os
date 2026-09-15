// actions.js — Shnuk Actions

(function() {
    'use strict';

    const STORAGE_KEY = 'shnuk_actions';
    const WIDGET_KEY = 'shnuk_actions_widget';
    const ICONS = ['⚡', '📷', '⚙', '📁', '🎙', '🌐', '🔒', '▶', '⏹', '🎨', '🖼', '🔊', '☀', '🌙', '🚀', '⭐'];

    let isOpen = false;
    let actions = [];
    let widgetEnabled = false;

    function loadActions() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) actions = parsed;
            } else {
                actions = [];
            }
        } catch(e) { actions = []; }
    }

    function saveActions() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(actions)); } catch(e) {}
    }

    function loadWidget() {
        try { widgetEnabled = localStorage.getItem(WIDGET_KEY) === 'true'; } catch(e) { widgetEnabled = false; }
    }

    function saveWidget() {
        try { localStorage.setItem(WIDGET_KEY, widgetEnabled ? 'true' : 'false'); } catch(e) {}
    }

    function launchApp(appId, initName, callback) {
        if (typeof window[initName] === 'function') {
            window[initName]();
            if (callback) setTimeout(callback, 700);
            return;
        }
        const existing = document.querySelector('script[data-shnuk-app="' + appId + '"]');
        if (existing) {
            setTimeout(function() {
                if (typeof window[initName] === 'function') {
                    window[initName]();
                    if (callback) setTimeout(callback, 700);
                }
            }, 400);
            return;
        }
        const script = document.createElement('script');
        script.src = appId + '.js?t=' + Date.now();
        script.async = false;
        script.dataset.shnukApp = appId;
        script.onload = function() {
            if (typeof window[initName] === 'function') {
                window[initName]();
                if (callback) setTimeout(callback, 700);
            }
        };
        script.onerror = function() {
            if (window.Win && window.Win.notify) {
                window.Win.notify('Не удалось загрузить ' + appId, { type: 'error' });
            }
        };
        document.head.appendChild(script);
    }

    function runAction(action) {
        if (!action || !action.type) return;
        try {
            const payload = action.payload || {};

            if (action.type === 'camera.open') {
                launchApp('camera', 'cameraInit', null);
                return;
            }

            if (action.type === 'recorder.open') {
                launchApp('recorder', 'recorderInit', null);
                return;
            }

            if (action.type === 'settings.open') {
                launchApp('settings', 'settingsInit', null);
                return;
            }

            if (action.type === 'settings.section') {
                launchApp('settings', 'settingsInit', function() {
                    if (window.Settings && typeof window.Settings.openSection === 'function') {
                        window.Settings.openSection(payload.section);
                    }
                });
                return;
            }

            if (action.type === 'settings.wallpaper') {
                launchApp('settings', 'settingsInit', function() {
                    if (window.Settings && typeof window.Settings.selectWallpaper === 'function') {
                        window.Settings.selectWallpaper(payload.id);
                    }
                });
                return;
            }

            if (action.type === 'files.open') {
                launchApp('file', 'fileInit', null);
                return;
            }

            if (action.type === 'browser.open') {
                const url = (payload.url || '').trim();
                if (!url) return;
                let finalUrl = url;
                if (!/^https?:\/\//i.test(finalUrl)) {
                    if (/^[\w-]+(\.[\w-]+)+/.test(finalUrl)) {
                        finalUrl = 'https://' + finalUrl;
                    } else {
                        finalUrl = 'https://www.google.com/search?q=' + encodeURIComponent(finalUrl);
                    }
                }
                try {
                    window.open(finalUrl, '_blank', 'noopener,noreferrer');
                } catch(e) {}
                return;
            }

            if (action.type === 'system.lock') {
                if (window.Security && typeof window.Security.hasSecurity === 'function' && window.Security.hasSecurity()) {
                    try { sessionStorage.removeItem('shnuk_session_unlocked'); } catch(e) {}
                    if (window.AOD && typeof window.AOD.hide === 'function') window.AOD.hide();
                    window.location.reload();
                } else {
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Защита не установлена', { type: 'info' });
                    }
                }
                return;
            }
        } catch(e) {}
    }

    function createUI() {
        if (document.getElementById('actionsApp')) {
            document.getElementById('actionsApp').style.display = 'flex';
            return;
        }
        isOpen = true;
        loadActions();
        loadWidget();

        const app = document.createElement('div');
        app.id = 'actionsApp';
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
            animation: actionsFadeIn 0.3s ease forwards;
        `;

        if (!document.getElementById('actionsStyles')) {
            const style = document.createElement('style');
            style.id = 'actionsStyles';
            style.textContent = `
                @keyframes actionsFadeIn { from { opacity: 0; } to { opacity: 1; } }
                .actions-header { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; background:#f5f5f5; border-bottom:2px solid #e0e0e0; flex-shrink:0; }
                .actions-header h1 { font-size:20px; font-weight:600; margin:0; }
                .actions-header-actions { display:flex; gap:8px; align-items:center; }
                .actions-header-actions button { background:none; border:2px solid #e0e0e0; color:#333; padding:6px 14px; cursor:pointer; font-family:'ST-SimpleSquare',monospace; font-size:13px; transition:all 0.2s; }
                .actions-header-actions button:hover { border-color:#cc0000; }
                .actions-header-actions button.active { background:#cc0000; color:#fff; border-color:#cc0000; }
                .actions-header-actions .close-btn { border-color:#cc0000; color:#cc0000; font-size:18px; padding:2px 10px; }
                .actions-header-actions .close-btn:hover { background:#cc0000; color:#fff; }
                .actions-content { flex:1; overflow-y:auto; padding:20px; }
                .actions-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(100px, 1fr)); gap:12px; }
                .action-tile {
                    background:#f5f5f5; border:2px solid transparent;
                    padding:14px 8px; text-align:center; cursor:pointer;
                    transition:all 0.2s; position:relative; display:flex; flex-direction:column;
                    align-items:center; justify-content:center; min-height:100px;
                }
                .action-tile:hover { border-color:#cc0000; background:#fff; }
                .action-tile:active { transform:scale(0.95); }
                .action-tile .a-icon { font-size:32px; line-height:1; margin-bottom:8px; }
                .action-tile .a-name { font-size:11px; color:#333; line-height:1.2; word-break:break-word; }
                .action-tile .a-del {
                    position:absolute; top:-8px; right:-8px;
                    width:24px; height:24px; border-radius:50%;
                    background:#cc0000; color:#fff; border:2px solid #fff;
                    font-size:14px; line-height:20px; text-align:center;
                    cursor:pointer; opacity:0; transition:opacity 0.2s;
                }
                .action-tile:hover .a-del { opacity:1; }
                .actions-section-title { font-size:13px; font-weight:600; color:#888; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:12px; margin-top:20px; }
                .actions-empty { text-align:center; padding:60px 20px; color:#bbb; font-size:14px; }
                .action-editor { background:#fff; padding:24px; max-width:520px; margin:0 auto; }
                .action-editor .field { margin-bottom:16px; }
                .action-editor label { display:block; font-size:12px; font-weight:600; color:#666; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px; }
                .action-editor input[type="text"], .action-editor input[type="url"], .action-editor select {
                    width:100%; padding:10px 12px; border:2px solid #e0e0e0;
                    font-family:'ST-SimpleSquare',monospace; font-size:14px;
                    outline:none; box-sizing:border-box; background:#fff; color:#1a1a1a;
                }
                .action-editor input:focus, .action-editor select:focus { border-color:#cc0000; }
                .icon-picker { display:grid; grid-template-columns:repeat(8, 1fr); gap:6px; }
                .icon-picker button { padding:8px; font-size:20px; background:#f5f5f5; border:2px solid transparent; cursor:pointer; }
                .icon-picker button.selected { border-color:#cc0000; background:#fff5f5; }
                .action-editor .save-btn { padding:12px 32px; background:#cc0000; color:#fff; border:none; cursor:pointer; font-family:'ST-SimpleSquare',monospace; font-size:15px; font-weight:600; }
                .action-editor .save-btn:hover { background:#990000; }
                .action-editor .cancel-btn { padding:12px 24px; background:none; border:2px solid #e0e0e0; color:#666; cursor:pointer; font-family:'ST-SimpleSquare',monospace; font-size:14px; margin-left:8px; }
                .actions-widget {
                    position: fixed;
                    top: calc(var(--livebar-h, 44px) + 10px);
                    right: 10px;
                    width: 64px;
                    background: rgba(255,255,255,0.95);
                    border: 2px solid #1a1a1a;
                    padding: 6px;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    z-index: 6;
                    font-family: 'ST-SimpleSquare', monospace;
                    pointer-events: auto;
                    max-height: 60vh;
                    overflow-y: auto;
                }
                .actions-widget button {
                    width: 100%; aspect-ratio: 1/1;
                    background: #fff; border: 1px solid #e0e0e0;
                    font-size: 20px; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.15s; padding: 0;
                }
                .actions-widget button:hover { background: #fff5f5; border-color: #cc0000; }
                .actions-widget button:active { transform: scale(0.9); }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'actions-header';
        header.innerHTML = `
            <h1>Shnuk Actions</h1>
            <div class="actions-header-actions">
                <button id="actionsAddBtn">+ Создать</button>
                <button id="actionsWidgetToggle">Виджет</button>
                <button class="close-btn" id="actionsCloseBtn">✕</button>
            </div>
        `;

        const content = document.createElement('div');
        content.className = 'actions-content';
        content.id = 'actionsContent';

        app.appendChild(header);
        app.appendChild(content);
        document.body.appendChild(app);

        document.getElementById('actionsCloseBtn').addEventListener('click', closeActions);
        document.getElementById('actionsAddBtn').addEventListener('click', function() {
            renderEditor(null);
        });
        const widgetBtn = document.getElementById('actionsWidgetToggle');
        if (widgetEnabled) widgetBtn.classList.add('active');
        widgetBtn.addEventListener('click', function() {
            widgetEnabled = !widgetEnabled;
            saveWidget();
            this.classList.toggle('active', widgetEnabled);
            updateWidget();
        });

        renderList();
        updateWidget();
    }

    function renderList() {
        const content = document.getElementById('actionsContent');
        if (!content) return;

        content.innerHTML = `
            <div class="actions-section-title">Мои действия (${actions.length})</div>
            <div class="actions-grid" id="actionsGrid"></div>
        `;

        const grid = document.getElementById('actionsGrid');
        if (actions.length === 0) {
            grid.innerHTML = '<div class="actions-empty" style="grid-column:1/-1;">Нет действий. Нажмите «+ Создать».</div>';
            return;
        }

        actions.forEach(a => {
            const tile = document.createElement('div');
            tile.className = 'action-tile';
            tile.innerHTML = `
                <div class="a-icon">${a.icon || '⚡'}</div>
                <div class="a-name">${a.name}</div>
                <button class="a-del" title="Удалить">✕</button>
            `;
            tile.addEventListener('click', function(e) {
                if (e.target.classList.contains('a-del')) return;
                runAction(a);
            });
            tile.querySelector('.a-del').addEventListener('click', function(e) {
                e.stopPropagation();
                if (confirm('Удалить действие "' + a.name + '"?')) {
                    actions = actions.filter(x => x.id !== a.id);
                    saveActions();
                    renderList();
                    updateWidget();
                }
            });
            grid.appendChild(tile);
        });
    }

    function renderEditor(editId) {
        const content = document.getElementById('actionsContent');
        if (!content) return;

        const editing = editId ? actions.find(a => a.id === editId) : null;
        const current = editing || { name: '', icon: '⚡', type: 'camera.open', payload: {} };

        const types = [
            { value: 'camera.open', label: 'Камера: открыть' },
            { value: 'settings.open', label: 'Настройки: открыть' },
            { value: 'settings.section', label: 'Настройки: открыть раздел' },
            { value: 'settings.wallpaper', label: 'Настройки: выбрать обои' },
            { value: 'files.open', label: 'Файлы: открыть менеджер' },
            { value: 'recorder.open', label: 'Диктофон: открыть' },
            { value: 'browser.open', label: 'Открыть сайт в новой вкладке' },
            { value: 'system.lock', label: 'Заблокировать экран' }
        ];

        content.innerHTML = `
            <div class="action-editor">
                <div class="field">
                    <label>Название</label>
                    <input type="text" id="aeName" value="${current.name || ''}" placeholder="Например: Сайт" />
                </div>
                <div class="field">
                    <label>Иконка</label>
                    <div class="icon-picker" id="aeIcons"></div>
                </div>
                <div class="field">
                    <label>Действие</label>
                    <select id="aeType">
                        ${types.map(t => `<option value="${t.value}" ${t.value === current.type ? 'selected' : ''}>${t.label}</option>`).join('')}
                    </select>
                </div>
                <div class="field" id="aeSectionField" style="display:none;">
                    <label>Раздел</label>
                    <select id="aeSection">
                        <option value="wallpaper">Обои</option>
                        <option value="security">Безопасность</option>
                        <option value="system">Система</option>
                    </select>
                </div>
                <div class="field" id="aeWallpaperField" style="display:none;">
                    <label>Обои (id)</label>
                    <input type="text" id="aeWallpaperId" placeholder="wall1 / wall2 / wall3" value="${(current.payload && current.payload.id) || ''}" />
                </div>
                <div class="field" id="aeUrlField" style="display:none;">
                    <label>Ссылка</label>
                    <input type="url" id="aeUrl" placeholder="https://example.com" value="${(current.payload && current.payload.url) || ''}" />
                </div>
                <div>
                    <button class="save-btn" id="aeSave">Сохранить</button>
                    <button class="cancel-btn" id="aeCancel">Отмена</button>
                </div>
            </div>
        `;

        const iconPicker = document.getElementById('aeIcons');
        ICONS.forEach(ic => {
            const b = document.createElement('button');
            b.textContent = ic;
            if (ic === current.icon) b.classList.add('selected');
            b.addEventListener('click', function() {
                iconPicker.querySelectorAll('button').forEach(x => x.classList.remove('selected'));
                this.classList.add('selected');
            });
            iconPicker.appendChild(b);
        });

        const typeSelect = document.getElementById('aeType');
        const sectionField = document.getElementById('aeSectionField');
        const wallpaperField = document.getElementById('aeWallpaperField');
        const urlField = document.getElementById('aeUrlField');

        function updateFields() {
            const v = typeSelect.value;
            sectionField.style.display = v === 'settings.section' ? 'block' : 'none';
            wallpaperField.style.display = v === 'settings.wallpaper' ? 'block' : 'none';
            urlField.style.display = v === 'browser.open' ? 'block' : 'none';
        }
        typeSelect.addEventListener('change', updateFields);
        updateFields();

        if (current.payload && current.payload.section) {
            document.getElementById('aeSection').value = current.payload.section;
        }

        document.getElementById('aeCancel').addEventListener('click', function() {
            renderList();
        });

        document.getElementById('aeSave').addEventListener('click', function() {
            const name = document.getElementById('aeName').value.trim();
            if (!name) { alert('Введите название'); return; }

            const selectedIcon = iconPicker.querySelector('button.selected');
            const icon = selectedIcon ? selectedIcon.textContent : '⚡';
            const type = typeSelect.value;

            const payload = {};
            if (type === 'settings.section') payload.section = document.getElementById('aeSection').value;
            if (type === 'settings.wallpaper') payload.id = document.getElementById('aeWallpaperId').value.trim();
            if (type === 'browser.open') payload.url = document.getElementById('aeUrl').value.trim();

            if (editing) {
                const idx = actions.findIndex(a => a.id === editing.id);
                if (idx !== -1) actions[idx] = { id: editing.id, name, icon, type, payload };
            } else {
                actions.push({
                    id: 'a_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                    name, icon, type, payload
                });
            }

            saveActions();
            renderList();
            updateWidget();
        });
    }

    function updateWidget() {
        let widget = document.getElementById('actionsWidget');
        if (!widgetEnabled || actions.length === 0) {
            if (widget) widget.remove();
            return;
        }
        if (!widget) {
            widget = document.createElement('div');
            widget.id = 'actionsWidget';
            widget.className = 'actions-widget';
            document.body.appendChild(widget);
        }
        widget.innerHTML = '';
        actions.forEach(a => {
            const b = document.createElement('button');
            b.textContent = a.icon || '⚡';
            b.title = a.name;
            b.addEventListener('click', function(e) {
                e.stopPropagation();
                runAction(a);
            });
            widget.appendChild(b);
        });
    }

    function closeActions() {
        isOpen = false;
        const el = document.getElementById('actionsApp');
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => {
                el.style.display = 'none';
                el.style.opacity = '1';
            }, 300);
        }
    }

    function destroy() {
        isOpen = false;
        const el = document.getElementById('actionsApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    window.Actions = {
        destroy: destroy,
        run: runAction,
        list: function() { return actions; }
    };
    window.actionsInit = function() { createUI(); };

})();