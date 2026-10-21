// shnuk-key-app.js
(function() {
    'use strict';

    const FONT_MAIN = "'TTPaplane', monospace";

    let isOpen = false;

    function openKeyApp() {
        if (isOpen) {
            const ex = document.getElementById('shnukKeyApp');
            if (ex) { ex.style.display = 'flex'; return; }
        }

        const app = document.createElement('div');
        app.id = 'shnukKeyApp';
        app.style.cssText = `
            position: fixed;
            top: var(--livebar-h, 44px);
            left: 0;
            width: 100%;
            height: calc(100% - var(--livebar-h, 44px));
            background: var(--bg-primary);
            color: var(--text-primary);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            font-family: ${FONT_MAIN};
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display:flex;
            justify-content:space-between;
            align-items:center;
            padding: 16px 20px;
            background: var(--header-bg);
            color: var(--header-text);
            border-bottom: 2px solid var(--border-color);
            flex-shrink: 0;
        `;
        header.innerHTML = '<h1 style="font-size:20px;font-weight:700;margin:0;">Shnuk Key</h1>';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: var(--bg-primary);
            border: 2px solid var(--accent);
            color: var(--accent);
            font-size: 18px;
            padding: 4px 12px;
            cursor: pointer;
            font-family: inherit;
        `;
        closeBtn.addEventListener('click', closeKeyApp);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.style.cssText = 'flex:1;padding:24px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;';

        const info = document.createElement('div');
        info.style.cssText = 'font-size:14px;color:var(--text-muted);line-height:1.5;';
        info.textContent = 'Экранная клавиатура Shnuk Key. Появляется автоматически при фокусе на любом поле ввода в системе. Поддерживает русский и английский, цифры, символы, регистр и автоповтор.';
        body.appendChild(info);

        const demoLabel = document.createElement('div');
        demoLabel.style.cssText = 'font-size:12px;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted);font-weight:700;';
        demoLabel.textContent = 'Проверка ввода';
        body.appendChild(demoLabel);

        const demoInput = document.createElement('input');
        demoInput.type = 'text';
        demoInput.placeholder = 'Коснитесь, чтобы открыть клавиатуру';
        demoInput.style.cssText = `
            padding: 14px 16px;
            border: 2px solid var(--border-color);
            background: var(--bg-secondary);
            color: var(--text-primary);
            font-family: inherit;
            font-size: 16px;
            outline: none;
            box-sizing: border-box;
        `;
        demoInput.addEventListener('focus', function() {
            if (window.ShnukKey) window.ShnukKey.show();
        });
        body.appendChild(demoInput);

        const demoTextarea = document.createElement('textarea');
        demoTextarea.rows = 4;
        demoTextarea.placeholder = 'Многострочный ввод';
        demoTextarea.style.cssText = `
            padding: 14px 16px;
            border: 2px solid var(--border-color);
            background: var(--bg-secondary);
            color: var(--text-primary);
            font-family: inherit;
            font-size: 16px;
            outline: none;
            resize: vertical;
            box-sizing: border-box;
        `;
        demoTextarea.addEventListener('focus', function() {
            if (window.ShnukKey) window.ShnukKey.show();
        });
        body.appendChild(demoTextarea);

        const buttonsRow = document.createElement('div');
        buttonsRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';

        const showBtn = document.createElement('button');
        showBtn.textContent = 'Показать клавиатуру';
        showBtn.style.cssText = `
            padding: 12px 20px;
            border: none;
            background: var(--accent);
            color: var(--text-on-accent);
            font-family: inherit;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
        `;
        showBtn.addEventListener('click', function() {
            if (window.ShnukKey) window.ShnukKey.show();
        });

        const hideBtn = document.createElement('button');
        hideBtn.textContent = 'Скрыть';
        hideBtn.style.cssText = `
            padding: 12px 20px;
            border: 2px solid var(--border-color);
            background: var(--bg-primary);
            color: var(--text-primary);
            font-family: inherit;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
        `;
        hideBtn.addEventListener('click', function() {
            if (window.ShnukKey) window.ShnukKey.hide();
        });

        buttonsRow.appendChild(showBtn);
        buttonsRow.appendChild(hideBtn);
        body.appendChild(buttonsRow);

        app.appendChild(header);
        app.appendChild(body);
        document.body.appendChild(app);

        isOpen = true;
        if (window.ShnukKey) window.ShnukKey.attachAll(app);
    }

    function closeKeyApp() {
        isOpen = false;
        if (window.ShnukKey) window.ShnukKey.hide();
        const el = document.getElementById('shnukKeyApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function destroy() {
        isOpen = false;
        if (window.ShnukKey) window.ShnukKey.hide();
        const el = document.getElementById('shnukKeyApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    window.ShnukKeyApp = { destroy: destroy, open: openKeyApp };
    window.shnukKeyAppInit = function() { openKeyApp(); };
    window.shnukkeyappInit = function() { openKeyApp(); };

})();