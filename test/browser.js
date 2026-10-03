// browser.js

(function() {
    'use strict';

    let isOpen = false;
    let history = [];
    let historyIndex = -1;
    let iframe = null;
    let urlInput = null;

    function openBrowser() {
        if (isOpen) {
            const ex = document.getElementById('browserApp');
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }
        createUI();
    }

    function closeBrowser() {
        isOpen = false;
        const el = document.getElementById('browserApp');
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1'; }, 300);
        }
        document.removeEventListener('keydown', onKeyDown);
    }

    function destroy() {
        isOpen = false;
        if (iframe) iframe.src = 'about:blank';
        document.removeEventListener('keydown', onKeyDown);
        const el = document.getElementById('browserApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function normalizeUrl(input) {
        if (!input) return '';
        let url = input.trim();
        if (!url) return '';
        if (!/^https?:\/\//i.test(url)) {
            if (/^[\w-]+(\.[\w-]+)+/.test(url)) {
                url = 'https://' + url;
            } else {
                url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
            }
        }
        return url;
    }

    function navigate(input) {
        const url = normalizeUrl(input);
        if (!url) return;
        if (iframe) iframe.src = url;
        if (urlInput) urlInput.value = url;
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        history.push(url);
        historyIndex = history.length - 1;
        updateNavButtons();
    }

    function goBack() {
        if (historyIndex > 0) {
            historyIndex--;
            const url = history[historyIndex];
            if (iframe) iframe.src = url;
            if (urlInput) urlInput.value = url;
            updateNavButtons();
        }
    }

    function goForward() {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            const url = history[historyIndex];
            if (iframe) iframe.src = url;
            if (urlInput) urlInput.value = url;
            updateNavButtons();
        }
    }

    function refresh() {
        if (historyIndex >= 0 && iframe) {
            iframe.src = history[historyIndex];
        }
    }

    function updateNavButtons() {
        const back = document.getElementById('browserBack');
        const fwd = document.getElementById('browserForward');
        if (back) back.style.opacity = historyIndex > 0 ? '1' : '0.3';
        if (fwd) fwd.style.opacity = historyIndex < history.length - 1 ? '1' : '0.3';
    }

    function createUI() {
        if (document.getElementById('browserApp')) {
            document.getElementById('browserApp').style.display = 'flex';
            return;
        }
        isOpen = true;

        const app = document.createElement('div');
        app.id = 'browserApp';
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
            animation: browserFadeIn 0.3s ease forwards;
        `;

        if (!document.getElementById('browserStyles')) {
            const style = document.createElement('style');
            style.id = 'browserStyles';
            style.textContent = `
                @keyframes browserFadeIn { from { opacity: 0; } to { opacity: 1; } }
                .browser-header {
                    display: flex; align-items: center; gap: 8px;
                    padding: 12px 16px; background: #f5f5f5;
                    border-bottom: 2px solid #e0e0e0; flex-shrink: 0;
                }
                .browser-nav-btn {
                    width: 36px; height: 36px;
                    background: #ffffff; border: 2px solid #e0e0e0;
                    cursor: pointer; display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0; transition: all 0.2s;
                    color: #333;
                }
                .browser-nav-btn:hover { border-color: #cc0000; background: #fff5f5; }
                .browser-nav-btn:active { transform: scale(0.94); }
                .browser-nav-btn svg { width: 18px; height: 18px; }
                .browser-url {
                    flex: 1; padding: 10px 14px;
                    border: 2px solid #e0e0e0; background: #ffffff;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 14px; outline: none;
                    min-width: 0;
                    box-sizing: border-box;
                }
                .browser-url:focus { border-color: #cc0000; }
                .browser-go {
                    padding: 10px 20px; border: 2px solid #cc0000;
                    background: #cc0000; color: #ffffff;
                    cursor: pointer; font-family: 'ST-SimpleSquare', monospace;
                    font-size: 14px; font-weight: 600;
                    transition: background 0.2s;
                    flex-shrink: 0;
                }
                .browser-go:hover { background: #990000; }
                .browser-close {
                    width: 36px; height: 36px;
                    background: #cc0000; color: #ffffff;
                    border: none; cursor: pointer;
                    font-size: 20px; flex-shrink: 0;
                    display: flex; align-items: center; justify-content: center;
                }
                .browser-close:hover { background: #990000; }
                .browser-view { flex: 1; position: relative; background: #ffffff; }
                .browser-view iframe {
                    width: 100%; height: 100%; border: none; display: block;
                    background: #ffffff;
                }
                .browser-view .browser-empty {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    color: #888; font-size: 14px; pointer-events: none;
                }
                .browser-view .browser-empty svg { width: 80px; height: 80px; margin-bottom: 20px; opacity: 0.3; }
                @media (max-width: 500px) {
                    .browser-header { padding: 8px 10px; gap: 6px; }
                    .browser-nav-btn { width: 32px; height: 32px; }
                    .browser-url { padding: 8px 10px; font-size: 12px; }
                    .browser-go { padding: 8px 14px; font-size: 12px; }
                    .browser-close { width: 32px; height: 32px; font-size: 18px; }
                }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'browser-header';
        header.innerHTML = `
            <button class="browser-nav-btn" id="browserBack" title="Назад">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                </svg>
            </button>
            <button class="browser-nav-btn" id="browserForward" title="Вперёд">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                </svg>
            </button>
            <button class="browser-nav-btn" id="browserRefresh" title="Обновить">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 4 23 10 17 10"/>
                    <polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
            </button>
            <input type="text" class="browser-url" id="browserUrl" placeholder="Введите адрес или поисковый запрос" />
            <button class="browser-go" id="browserGo">Перейти</button>
            <button class="browser-close" id="browserClose" title="Закрыть">✕</button>
        `;

        const view = document.createElement('div');
        view.className = 'browser-view';
        view.innerHTML = `
            <iframe id="browserFrame"
                allow="accelerometer; autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; geolocation; gyroscope; microphone; camera; midi; payment; usb; xr-spatial-tracking"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-storage-access-by-user-activation allow-top-navigation allow-top-navigation-by-user-activation allow-presentation"></iframe>
            <div class="browser-empty" id="browserEmpty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                <div>Введите адрес сайта или поисковый запрос</div>
            </div>
        `;

        app.appendChild(header);
        app.appendChild(view);
        document.body.appendChild(app);

        iframe = document.getElementById('browserFrame');
        urlInput = document.getElementById('browserUrl');

        iframe.addEventListener('load', function() {
            const empty = document.getElementById('browserEmpty');
            if (empty && iframe.src && iframe.src !== 'about:blank') {
                empty.style.display = 'none';
            }
        });

        document.getElementById('browserBack').addEventListener('click', goBack);
        document.getElementById('browserForward').addEventListener('click', goForward);
        document.getElementById('browserRefresh').addEventListener('click', refresh);
        document.getElementById('browserGo').addEventListener('click', function() {
            navigate(urlInput.value);
        });
        document.getElementById('browserClose').addEventListener('click', closeBrowser);

        urlInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') navigate(this.value);
        });

        document.addEventListener('keydown', onKeyDown);
        updateNavButtons();
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') closeBrowser();
    }

    window.Browser = {
        destroy: destroy,
        navigate: navigate
    };
    window.browserInit = function() { openBrowser(); };

})();