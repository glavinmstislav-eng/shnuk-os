// pc-windows.js
(function() {
    'use strict';

    const FONT_MAIN = "'TTPaplane', monospace";
    const DOCK_HEIGHT = 64;
    const MIN_W = 320;
    const MIN_H = 220;
    const EDGE_MAGNET = 14;

    const CLOSE_DURATION = 180;

    let pcModeActive = false;
    let dockEl = null;
    let windowsArea = null;
    let zCounter = 100100;

    const openWindows = new Map();

    function log() {
        try { console.log.apply(console, ['[PC-Windows]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    function isPC() {
        if (window.ShnukPCMode && typeof window.ShnukPCMode.isPC === 'function') {
            try { return window.ShnukPCMode.isPC(); } catch(e) {}
        }
        if (window.matchMedia) {
            const coarse = window.matchMedia('(pointer: coarse)').matches;
            const hover = window.matchMedia('(hover: hover)').matches;
            const touchPoints = navigator.maxTouchPoints || 0;
            if (!coarse && hover && touchPoints === 0) return true;
        }
        const ua = navigator.userAgent || '';
        if (/Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(ua)) return false;
        if (/Windows|Macintosh|Linux|X11/i.test(ua)) return true;
        return false;
    }

    function isPCModeActive() {
        return pcModeActive;
    }

    function injectStyles() {
        if (document.getElementById('pcWindowsStyles')) return;
        const st = document.createElement('style');
        st.id = 'pcWindowsStyles';
        st.textContent = `
            html.pc-mode #liveBar,
            html.pc-mode #liveBarShade {
                display: none !important;
            }

            html.pc-mode .top-panel {
                display: none !important;
            }

            html.pc-mode .bottom-panel {
                bottom: 0;
                height: 100%;
                top: 0;
                padding-bottom: calc(${DOCK_HEIGHT}px + 40px);
                z-index: 1;
            }
            html.pc-mode .bottom-panel .close-apps {
                display: none !important;
            }
            html.pc-mode .bottom-panel .bottom-blur {
                display: none !important;
            }

            html.pc-mode #pcDock {
                position: fixed;
                left: 0;
                right: 0;
                bottom: 0;
                height: ${DOCK_HEIGHT}px;
                background: transparent;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                padding: 0 12px;
                z-index: 2147483645;
                box-sizing: border-box;
                font-family: ${FONT_MAIN};
                pointer-events: none;
            }

            html.pc-mode #pcWindowsArea {
                position: fixed;
                left: 0;
                right: 0;
                top: 0;
                bottom: ${DOCK_HEIGHT}px;
                z-index: 2147483600;
                pointer-events: none;
            }

            .pc-window {
                position: absolute;
                background: var(--bg-primary);
                border: none;
                box-shadow: 0 6px 24px rgba(0,0,0,0.08);
                display: flex;
                flex-direction: column;
                min-width: ${MIN_W}px;
                min-height: ${MIN_H}px;
                pointer-events: auto;
                overflow: visible;
                box-sizing: border-box;
                font-family: ${FONT_MAIN};
                transition: box-shadow 0.15s ease;
                outline: none;
            }
            .pc-window.active {
                box-shadow: 0 8px 32px rgba(0,0,0,0.12);
            }

            .pc-window.will-minimize {
                transition: transform 0.28s cubic-bezier(0.4, 0, 0.7, 1), opacity 0.28s ease, filter 0.28s ease;
                transform-origin: bottom center;
            }
            .pc-window.will-restore {
                transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease, filter 0.28s ease;
            }
            .pc-window.will-close {
                transition: transform ${CLOSE_DURATION}ms cubic-bezier(0.4, 0, 0.7, 1),
                            opacity ${CLOSE_DURATION}ms cubic-bezier(0.4, 0, 0.7, 1),
                            filter ${CLOSE_DURATION}ms cubic-bezier(0.4, 0, 0.7, 1);
                transform-origin: center center;
                pointer-events: none;
            }

            .pc-window-header {
                display: flex;
                align-items: center;
                height: 32px;
                padding: 0 10px;
                background: var(--header-bg);
                color: var(--header-text);
                border-bottom: 1px solid var(--border-color);
                flex-shrink: 0;
                cursor: move;
                user-select: none;
                -webkit-user-select: none;
                gap: 10px;
                font-family: ${FONT_MAIN};
            }

            .pc-window-buttons {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
            }
            .pc-window-btn {
                width: 14px;
                height: 14px;
                border-radius: 0;
                border: none;
                padding: 0;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                transition: opacity 0.15s ease;
                position: relative;
                font-family: ${FONT_MAIN};
                -webkit-tap-highlight-color: transparent;
                outline: none;
                opacity: 0.55;
            }
            .pc-window-btn:hover {
                opacity: 1;
            }
            .pc-window-btn:active {
                opacity: 0.9;
            }
            .pc-window-btn > svg {
                width: 12px;
                height: 12px;
                display: block;
                stroke: #888888;
                fill: none;
                stroke-width: 1.6;
                stroke-linecap: round;
                stroke-linejoin: round;
            }
            .pc-window-btn:hover > svg {
                stroke: #555555;
            }

            .pc-window-title {
                flex: 1;
                min-width: 0;
                font-size: 12px;
                font-weight: 600;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                padding: 0 4px;
                opacity: 0.75;
            }

            .pc-window-content {
                flex: 1;
                position: relative;
                overflow: hidden;
                background: var(--bg-primary);
                pointer-events: auto;
            }

            .pc-window-content > * {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                right: auto !important;
                bottom: auto !important;
                max-width: none !important;
                max-height: none !important;
                border: none !important;
                margin: 0 !important;
                box-sizing: border-box !important;
                z-index: 0 !important;
                pointer-events: auto !important;
            }

            .pc-window-content .html-app-window {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                padding-top: 0 !important;
                z-index: 0 !important;
                display: flex !important;
                pointer-events: auto !important;
            }

            .pc-window-content .scroll-blur::after,
            .pc-window-content [class*="scroll-blur"]::after {
                display: none !important;
            }

            .pc-window-resize-handle {
                position: absolute;
                z-index: 100;
                background: transparent;
                pointer-events: auto;
            }
            .pc-window-resize-handle.n  { top: -4px; left: 12px; right: 12px; height: 8px; cursor: ns-resize; }
            .pc-window-resize-handle.s  { bottom: -4px; left: 12px; right: 12px; height: 8px; cursor: ns-resize; }
            .pc-window-resize-handle.w  { top: 12px; bottom: 12px; left: -4px; width: 8px; cursor: ew-resize; }
            .pc-window-resize-handle.e  { top: 12px; bottom: 12px; right: -4px; width: 8px; cursor: ew-resize; }
            .pc-window-resize-handle.nw { top: -4px; left: -4px; width: 14px; height: 14px; cursor: nwse-resize; }
            .pc-window-resize-handle.ne { top: -4px; right: -4px; width: 14px; height: 14px; cursor: nesw-resize; }
            .pc-window-resize-handle.sw { bottom: -4px; left: -4px; width: 14px; height: 14px; cursor: nesw-resize; }
            .pc-window-resize-handle.se { bottom: -4px; right: -4px; width: 14px; height: 14px; cursor: nwse-resize; }

            .pc-dock-icon {
                position: relative;
                width: 44px;
                height: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                border: none;
                cursor: pointer;
                transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), margin 0.2s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease, background 0.2s ease;
                overflow: visible;
                box-sizing: border-box;
                font-family: ${FONT_MAIN};
                flex-shrink: 0;
                -webkit-tap-highlight-color: transparent;
                outline: none;
                will-change: transform, margin, opacity;
                pointer-events: auto;
                border-radius: 4px;
            }
            .pc-dock-icon.active {
                opacity: 0.45;
                transform: scale(0.82);
            }
            .pc-dock-icon.active:hover {
                opacity: 0.7;
                transform: scale(1.15) translateY(-8px);
                margin: 0 12px;
            }
            .pc-dock-icon:hover {
                transform: scale(1.35) translateY(-8px);
                margin: 0 12px;
            }
            .pc-dock-icon > img {
                width: 100%;
                height: 100%;
                object-fit: contain;
                pointer-events: none;
            }
            .pc-dock-icon > .pc-dock-fallback {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                font-weight: 700;
                color: var(--accent);
                pointer-events: none;
            }
            .pc-dock-icon::after {
                content: attr(data-title);
                position: absolute;
                top: -28px;
                left: 50%;
                transform: translateX(-50%) translateY(4px);
                background: var(--text-primary);
                color: var(--bg-primary);
                font-size: 10px;
                font-weight: 600;
                padding: 3px 8px;
                white-space: nowrap;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.18s ease, transform 0.18s ease;
                z-index: 2;
                font-family: ${FONT_MAIN};
            }
            .pc-dock-icon:hover::after {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }

            html.pc-mode .pc-window-content .file-close-btn,
            html.pc-mode .pc-window-content #settingsCloseBtn,
            html.pc-mode .pc-window-content .time-close-btn,
            html.pc-mode .pc-window-content .camera-close-header,
            html.pc-mode .pc-window-content #cooopCloseBtn,
            html.pc-mode .pc-window-content #gameCenterCloseBtn,
            html.pc-mode .pc-window-content #recorderCloseBtn,
            html.pc-mode .pc-window-content .coll-close,
            html.pc-mode .pc-window-content #shnukAccountCloseBtn {
                display: none !important;
            }

            html.pc-mode #fileApp,
            html.pc-mode #settingsApp,
            html.pc-mode #timeApp,
            html.pc-mode #cameraApp,
            html.pc-mode #recorderApp,
            html.pc-mode #cooopApp,
            html.pc-mode #gameCenterApp,
            html.pc-mode #myShnukApp,
            html.pc-mode #storeApp,
            html.pc-mode #collApp,
            html.pc-mode #browserApp,
            html.pc-mode #shnukAccountApp,
            html.pc-mode #shnukEvaApp {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                z-index: 0 !important;
                pointer-events: auto !important;
            }
        `;
        document.head.appendChild(st);
    }

    function enablePCMode() {
        if (pcModeActive) return;
        pcModeActive = true;
        injectStyles();
        document.documentElement.classList.add('pc-mode');
        ensureWindowsArea();
        ensureDock();
        log('PC mode enabled');
    }

    function disablePCMode() {
        if (!pcModeActive) return;
        pcModeActive = false;
        document.documentElement.classList.remove('pc-mode');
        if (dockEl && dockEl.parentNode) dockEl.parentNode.removeChild(dockEl);
        if (windowsArea && windowsArea.parentNode) windowsArea.parentNode.removeChild(windowsArea);
        dockEl = null;
        windowsArea = null;
        openWindows.clear();
        log('PC mode disabled');
    }

    function ensureWindowsArea() {
        if (windowsArea && windowsArea.parentNode) return windowsArea;
        windowsArea = document.createElement('div');
        windowsArea.id = 'pcWindowsArea';
        document.body.appendChild(windowsArea);
        return windowsArea;
    }

    function ensureDock() {
        if (dockEl && dockEl.parentNode) return dockEl;
        dockEl = document.createElement('div');
        dockEl.id = 'pcDock';
        document.body.appendChild(dockEl);
        return dockEl;
    }

    function makeWindowButton(kind, handler) {
        const btn = document.createElement('button');
        btn.className = 'pc-window-btn ' + kind;
        btn.type = 'button';
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 10 10');
        if (kind === 'close') {
            const p1 = document.createElementNS(ns, 'line');
            p1.setAttribute('x1', '1'); p1.setAttribute('y1', '1');
            p1.setAttribute('x2', '9'); p1.setAttribute('y2', '9');
            svg.appendChild(p1);
            const p2 = document.createElementNS(ns, 'line');
            p2.setAttribute('x1', '9'); p2.setAttribute('y1', '1');
            p2.setAttribute('x2', '1'); p2.setAttribute('y2', '9');
            svg.appendChild(p2);
        } else if (kind === 'min') {
            const line = document.createElementNS(ns, 'line');
            line.setAttribute('x1', '1'); line.setAttribute('y1', '5');
            line.setAttribute('x2', '9'); line.setAttribute('y2', '5');
            svg.appendChild(line);
        } else if (kind === 'max') {
            const rect = document.createElementNS(ns, 'rect');
            rect.setAttribute('x', '1');
            rect.setAttribute('y', '1');
            rect.setAttribute('width', '8');
            rect.setAttribute('height', '8');
            svg.appendChild(rect);
        }
        btn.appendChild(svg);
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            handler();
        });
        btn.addEventListener('mousedown', function(e) { e.stopPropagation(); });
        btn.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: true });
        return btn;
    }

    function createWindow(appId, appName, icon, appEl) {
        if (!pcModeActive) return null;
        ensureWindowsArea();
        ensureDock();

        const existing = openWindows.get(appId);
        if (existing) {
            if (existing.isMinimized) {
                restoreWindow(existing);
            } else {
                bringToFront(existing);
            }
            return existing;
        }

        const win = document.createElement('div');
        win.className = 'pc-window';
        win.dataset.appId = appId;

        const areaRect = windowsArea.getBoundingClientRect();
        const defaultW = Math.min(720, areaRect.width - 40);
        const defaultH = Math.min(520, areaRect.height - 40);
        const offset = (openWindows.size % 6) * 26;
        const left = Math.max(20, Math.round((areaRect.width - defaultW) / 2) + offset);
        const top = Math.max(20, Math.round((areaRect.height - defaultH) / 2) + offset);

        win.style.left = left + 'px';
        win.style.top = top + 'px';
        win.style.width = defaultW + 'px';
        win.style.height = defaultH + 'px';
        win.style.zIndex = String(++zCounter);

        const header = document.createElement('div');
        header.className = 'pc-window-header';

        const buttons = document.createElement('div');
        buttons.className = 'pc-window-buttons';

        const btnClose = makeWindowButton('close', function() {
            closeWindow(appId);
        });
        const btnMin = makeWindowButton('min', function() {
            minimizeWindow(appId);
        });
        const btnMax = makeWindowButton('max', function() {
            toggleFullscreenWindow(appId);
        });

        buttons.appendChild(btnClose);
        buttons.appendChild(btnMin);
        buttons.appendChild(btnMax);

        const titleEl = document.createElement('div');
        titleEl.className = 'pc-window-title';
        titleEl.textContent = appName || appId;

        header.appendChild(buttons);
        header.appendChild(titleEl);

        const content = document.createElement('div');
        content.className = 'pc-window-content';

        win.appendChild(header);
        win.appendChild(content);

        ['n','s','w','e','nw','ne','sw','se'].forEach(function(dir) {
            const h = document.createElement('div');
            h.className = 'pc-window-resize-handle ' + dir;
            h.dataset.dir = dir;
            win.appendChild(h);
        });

        const state = {
            id: appId,
            appId: appId,
            appName: appName || appId,
            icon: icon || null,
            el: win,
            appEl: appEl || null,
            headerEl: header,
            contentEl: content,
            titleEl: titleEl,
            isMinimized: false,
            isFullscreen: false,
            isClosing: false,
            savedRect: null,
            dockIconEl: null
        };

        openWindows.set(appId, state);

        if (appEl && appEl.parentNode) appEl.parentNode.removeChild(appEl);
        if (appEl) content.appendChild(appEl);
        state.appEl = appEl;

        windowsArea.appendChild(win);

        win.addEventListener('mousedown', function() {
            bringToFront(state);
        }, true);

        header.addEventListener('mousedown', function(e) {
            if (e.target.closest('.pc-window-btn')) return;
            startDrag(e, state);
        });
        header.addEventListener('touchstart', function(e) {
            if (e.target.closest('.pc-window-btn')) return;
            startDrag(e, state);
        }, { passive: false });

        win.querySelectorAll('.pc-window-resize-handle').forEach(function(h) {
            h.addEventListener('mousedown', function(e) {
                e.stopPropagation();
                e.preventDefault();
                startResize(e, state, h.dataset.dir);
            });
            h.addEventListener('touchstart', function(e) {
                e.stopPropagation();
                e.preventDefault();
                startResize(e, state, h.dataset.dir);
            }, { passive: false });
        });

        bringToFront(state);
        updateDockAppearance();
        return state;
    }

    function updateDockAppearance() {
        if (!dockEl) return;
        dockEl.querySelectorAll('.pc-dock-icon').forEach(function(icon) {
            const appId = icon.dataset.appId;
            const state = openWindows.get(appId);
            if (state && !state.isMinimized && !state.isClosing) icon.classList.add('active');
            else icon.classList.remove('active');
        });
    }

    function bringToFront(state) {
        if (!state) return;
        if (state.isClosing) return;
        if (state.isMinimized) {
            restoreWindow(state);
            return;
        }
        openWindows.forEach(function(other) {
            if (other.el) other.el.classList.remove('active');
        });
        state.el.classList.add('active');
        state.el.style.zIndex = String(++zCounter);
        updateDockAppearance();
    }

    function closeWindow(appId) {
        const state = openWindows.get(appId);
        if (!state || state.isClosing) return;

        state.isClosing = true;

        const win = state.el;

        win.style.transformOrigin = 'center center';
        win.classList.add('will-close');

        requestAnimationFrame(function() {
            win.style.transform = 'scale(0.94)';
            win.style.opacity = '0';
            win.style.filter = 'blur(14px)';
        });

        if (state.dockIconEl && state.dockIconEl.parentNode) {
            state.dockIconEl.style.transition = 'opacity ' + CLOSE_DURATION + 'ms ease, transform ' + CLOSE_DURATION + 'ms ease';
            state.dockIconEl.style.opacity = '0';
            state.dockIconEl.style.transform = 'scale(0.5)';
        }

        updateDockAppearance();

        setTimeout(function() {
            const domId = state.appEl ? state.appEl.id : null;
            tryDestroyApp(state.appId, domId, state.appEl);

            if (win.parentNode) win.parentNode.removeChild(win);

            if (state.dockIconEl && state.dockIconEl.parentNode) {
                state.dockIconEl.parentNode.removeChild(state.dockIconEl);
                state.dockIconEl = null;
            }
            openWindows.delete(appId);

            if (window.__notificationOpenedAppId === appId) {
                window.__notificationOpenedAppId = null;
            }

            updateDockAppearance();
        }, CLOSE_DURATION + 20);
    }

    function tryDestroyApp(appId, domId, appEl) {
        const destroyMap = {
            'settingsApp': 'Settings',
            'timeApp': 'Time',
            'fileApp': 'FileApp',
            'cameraApp': 'Camera',
            'recorderApp': 'Recorder',
            'cooopApp': 'Cooop',
            'gameCenterApp': 'GameCenter',
            'myShnukApp': 'MyShnuk',
            'storeApp': 'Store',
            'collApp': 'Collaris',
            'browserApp': 'Browser',
            'shnukAccountApp': 'ShnukAccount'
        };
        if (domId && destroyMap[domId]) {
            const objName = destroyMap[domId];
            if (window[objName] && typeof window[objName].destroy === 'function') {
                try { window[objName].destroy(); } catch(e) {}
            }
        }
        if (appEl && appEl.parentNode) {
            try { appEl.parentNode.removeChild(appEl); } catch(e) {}
        }
    }

    function minimizeWindow(appId) {
        const state = openWindows.get(appId);
        if (!state || state.isMinimized || state.isClosing) return;

        const rect = state.el.getBoundingClientRect();

        state.isMinimized = true;

        let dockIcon = state.dockIconEl;
        if (!dockIcon || !dockIcon.parentNode) {
            dockIcon = createDockIcon(state);
            state.dockIconEl = dockIcon;
            dockEl.appendChild(dockIcon);
        }
        dockIcon.classList.remove('active');

        const targetX = dockIcon.getBoundingClientRect().left + dockIcon.offsetWidth / 2 - (rect.left + rect.width / 2);
        const targetY = dockIcon.getBoundingClientRect().top + dockIcon.offsetHeight / 2 - (rect.top + rect.height / 2);

        state.el.classList.add('will-minimize');
        state.el.style.transformOrigin = 'center center';
        requestAnimationFrame(function() {
            state.el.style.transform = 'translate(' + targetX + 'px, ' + targetY + 'px) scale(0.08)';
            state.el.style.opacity = '0';
            state.el.style.filter = 'blur(14px)';
        });

        setTimeout(function() {
            if (state.el.parentNode) state.el.parentNode.removeChild(state.el);
        }, 300);

        updateDockAppearance();
    }

    function restoreWindow(state) {
        if (!state) return;
        if (state.isClosing) return;
        if (state.isMinimized) {
            ensureWindowsArea();

            if (state.dockIconEl && state.dockIconEl.parentNode) {
                const iconRect = state.dockIconEl.getBoundingClientRect();

                state.el.classList.remove('will-minimize');
                state.el.classList.add('will-restore');
                state.el.style.transform = 'translate(' + (iconRect.left + iconRect.width / 2 - (parseFloat(state.el.style.left) + parseFloat(state.el.style.width) / 2)) + 'px, ' + (iconRect.top + iconRect.height / 2 - (parseFloat(state.el.style.top) + parseFloat(state.el.style.height) / 2)) + 'px) scale(0.08)';
                state.el.style.opacity = '0';
                state.el.style.filter = 'blur(14px)';

                windowsArea.appendChild(state.el);

                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        state.el.style.transform = '';
                        state.el.style.opacity = '1';
                        state.el.style.filter = 'blur(0)';
                        setTimeout(function() {
                            state.el.classList.remove('will-restore');
                            state.el.style.transform = '';
                            state.el.style.opacity = '';
                            state.el.style.filter = '';
                        }, 320);
                    });
                });
            } else {
                windowsArea.appendChild(state.el);
                state.el.style.transform = '';
                state.el.style.opacity = '1';
                state.el.style.filter = 'blur(0)';
            }

            state.isMinimized = false;
            bringToFront(state);
            updateDockAppearance();
            return;
        }

        bringToFront(state);
    }

    function createDockIcon(state) {
        const icon = document.createElement('div');
        icon.className = 'pc-dock-icon';
        icon.dataset.title = state.appName || state.appId;
        icon.dataset.appId = state.appId;

        if (state.icon) {
            const img = document.createElement('img');
            img.src = state.icon;
            img.alt = state.appName || '';
            img.onerror = function() {
                img.style.display = 'none';
                const fb = document.createElement('div');
                fb.className = 'pc-dock-fallback';
                fb.textContent = (state.appName || '?').charAt(0);
                icon.appendChild(fb);
            };
            icon.appendChild(img);
        } else {
            const fb = document.createElement('div');
            fb.className = 'pc-dock-fallback';
            fb.textContent = (state.appName || '?').charAt(0);
            icon.appendChild(fb);
        }

        icon.addEventListener('click', function() {
            const current = openWindows.get(state.appId);
            if (!current || current.isClosing) return;
            if (current.isMinimized) {
                restoreWindow(current);
            } else {
                bringToFront(current);
            }
        });

        return icon;
    }

    function toggleFullscreenWindow(appId) {
        const state = openWindows.get(appId);
        if (!state || state.isClosing) return;

        const areaRect = windowsArea.getBoundingClientRect();
        const el = state.el;

        if (!state.isFullscreen) {
            state.savedRect = {
                left: el.offsetLeft,
                top: el.offsetTop,
                width: el.offsetWidth,
                height: el.offsetHeight
            };
            state.isFullscreen = true;
            el.style.left = '0px';
            el.style.top = '0px';
            el.style.width = areaRect.width + 'px';
            el.style.height = areaRect.height + 'px';
        } else {
            state.isFullscreen = false;
            if (state.savedRect) {
                el.style.left = state.savedRect.left + 'px';
                el.style.top = state.savedRect.top + 'px';
                el.style.width = state.savedRect.width + 'px';
                el.style.height = state.savedRect.height + 'px';
                state.savedRect = null;
            }
        }
    }

    let dragState = null;

    function getPoint(e) {
        if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
        return { x: e.clientX, y: e.clientY };
    }

    function startDrag(e, state) {
        if (state.isFullscreen || state.isClosing) return;
        const p = getPoint(e);
        dragState = {
            state: state,
            startX: p.x,
            startY: p.y,
            startLeft: state.el.offsetLeft,
            startTop: state.el.offsetTop,
            moved: false
        };
        document.addEventListener('mousemove', onDragMove, { passive: false });
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
        document.addEventListener('touchcancel', onDragEnd);
        if (e.cancelable) e.preventDefault();
    }

    function onDragMove(e) {
        if (!dragState) return;
        const p = getPoint(e);
        const dx = p.x - dragState.startX;
        const dy = p.y - dragState.startY;
        if (!dragState.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) dragState.moved = true;
        if (!dragState.moved) return;

        const el = dragState.state.el;
        const areaRect = windowsArea.getBoundingClientRect();
        let newLeft = dragState.startLeft + dx;
        let newTop = dragState.startTop + dy;

        if (Math.abs(newLeft) < EDGE_MAGNET) newLeft = 0;
        if (Math.abs(newTop) < EDGE_MAGNET) newTop = 0;
        const rightEdge = areaRect.width - el.offsetWidth;
        if (Math.abs(newLeft - rightEdge) < EDGE_MAGNET) newLeft = rightEdge;
        const bottomEdge = areaRect.height - el.offsetHeight;
        if (Math.abs(newTop - bottomEdge) < EDGE_MAGNET) newTop = bottomEdge;

        newLeft = Math.max(-el.offsetWidth + 80, Math.min(areaRect.width - 80, newLeft));
        newTop = Math.max(0, Math.min(areaRect.height - 36, newTop));

        el.style.left = newLeft + 'px';
        el.style.top = newTop + 'px';
        if (e.cancelable) e.preventDefault();
    }

    function onDragEnd() {
        dragState = null;
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);
        document.removeEventListener('touchcancel', onDragEnd);
    }

    let resizeState = null;

    function startResize(e, state, dir) {
        if (state.isFullscreen || state.isClosing) return;
        const p = getPoint(e);
        resizeState = {
            state: state,
            dir: dir,
            startX: p.x,
            startY: p.y,
            startLeft: state.el.offsetLeft,
            startTop: state.el.offsetTop,
            startWidth: state.el.offsetWidth,
            startHeight: state.el.offsetHeight
        };
        document.addEventListener('mousemove', onResizeMove, { passive: false });
        document.addEventListener('mouseup', onResizeEnd);
        document.addEventListener('touchmove', onResizeMove, { passive: false });
        document.addEventListener('touchend', onResizeEnd);
        document.addEventListener('touchcancel', onResizeEnd);
        if (e.cancelable) e.preventDefault();
    }

    function onResizeMove(e) {
        if (!resizeState) return;
        const p = getPoint(e);
        const dx = p.x - resizeState.startX;
        const dy = p.y - resizeState.startY;
        const dir = resizeState.dir;
        const el = resizeState.state.el;

        let newLeft = resizeState.startLeft;
        let newTop = resizeState.startTop;
        let newWidth = resizeState.startWidth;
        let newHeight = resizeState.startHeight;

        if (dir.indexOf('e') !== -1) newWidth = resizeState.startWidth + dx;
        if (dir.indexOf('s') !== -1) newHeight = resizeState.startHeight + dy;
        if (dir.indexOf('w') !== -1) {
            newWidth = resizeState.startWidth - dx;
            newLeft = resizeState.startLeft + dx;
        }
        if (dir.indexOf('n') !== -1) {
            newHeight = resizeState.startHeight - dy;
            newTop = resizeState.startTop + dy;
        }

        if (newWidth < MIN_W) {
            if (dir.indexOf('w') !== -1) newLeft = resizeState.startLeft + (resizeState.startWidth - MIN_W);
            newWidth = MIN_W;
        }
        if (newHeight < MIN_H) {
            if (dir.indexOf('n') !== -1) newTop = resizeState.startTop + (resizeState.startHeight - MIN_H);
            newHeight = MIN_H;
        }

        const areaRect = windowsArea.getBoundingClientRect();
        if (newLeft < 0) {
            newWidth += newLeft;
            newLeft = 0;
        }
        if (newTop < 0) {
            newHeight += newTop;
            newTop = 0;
        }
        if (newLeft + newWidth > areaRect.width) newWidth = areaRect.width - newLeft;
        if (newTop + newHeight > areaRect.height) newHeight = areaRect.height - newTop;

        el.style.left = newLeft + 'px';
        el.style.top = newTop + 'px';
        el.style.width = newWidth + 'px';
        el.style.height = newHeight + 'px';
        if (e.cancelable) e.preventDefault();
    }

    function onResizeEnd() {
        resizeState = null;
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeEnd);
        document.removeEventListener('touchmove', onResizeMove);
        document.removeEventListener('touchend', onResizeEnd);
        document.removeEventListener('touchcancel', onResizeEnd);
    }

    const APP_DOM_IDS = {
        'settingsApp': { id: 'settings', name: 'Настройки' },
        'timeApp': { id: 'time', name: 'Часы' },
        'fileApp': { id: 'file', name: 'Файлы' },
        'cameraApp': { id: 'camera', name: 'Камера' },
        'recorderApp': { id: 'recorder', name: 'Звукозапись' },
        'cooopApp': { id: 'cooop', name: 'Cooop' },
        'gameCenterApp': { id: 'gamecenter', name: 'Game Center' },
        'myShnukApp': { id: 'my-shnuk', name: 'My Shnuk' },
        'storeApp': { id: 'store', name: 'Store' },
        'collApp': { id: 'coll', name: 'Collaris' },
        'browserApp': { id: 'browser', name: 'Браузер' },
        'shnukAccountApp': { id: 'shnuk-account', name: 'Shnuk Account' }
    };

    let observer = null;

    function startObserver() {
        if (observer) return;
        observer = new MutationObserver(function(mutations) {
            if (!pcModeActive) return;
            for (const m of mutations) {
                for (const n of m.addedNodes) {
                    if (!n || n.nodeType !== 1) continue;
                    if (n.id && APP_DOM_IDS[n.id]) {
                        wrapAppElement(n);
                    }
                    if (n.classList && n.classList.contains('html-app-window') && n.dataset && n.dataset.appId) {
                        wrapHtmlAppElement(n);
                    }
                    if (n.querySelectorAll) {
                        n.querySelectorAll('[id]').forEach(function(child) {
                            if (child.id && APP_DOM_IDS[child.id]) {
                                wrapAppElement(child);
                            }
                        });
                        n.querySelectorAll('.html-app-window[data-app-id]').forEach(function(child) {
                            wrapHtmlAppElement(child);
                        });
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function wrapAppElement(appEl) {
        if (!pcModeActive) return;
        if (!appEl) return;

        const meta = APP_DOM_IDS[appEl.id];
        if (!meta) return;

        if (appEl.closest('.pc-window-content')) return;

        const appId = meta.id;
        if (openWindows.has(appId)) {
            const existing = openWindows.get(appId);
            if (existing.appEl && existing.appEl.parentNode) {
                existing.appEl.parentNode.removeChild(existing.appEl);
            }
            if (existing.isClosing) return;
            if (existing.isMinimized) restoreWindow(existing);
            else bringToFront(existing);
            return;
        }

        if (appEl.dataset && appEl.dataset.pcWrapped === '1') {
            try { appEl.parentNode.removeChild(appEl); } catch(e) {}
            delete appEl.dataset.pcWrapped;
        }

        const appName = meta.name;
        const icon = findAppIcon(appId);

        appEl.dataset.pcWrapped = '1';
        createWindow(appId, appName, icon, appEl);
    }

    function wrapHtmlAppElement(appEl) {
        if (!pcModeActive) return;
        if (!appEl) return;
        if (appEl.closest('.pc-window-content')) return;

        const appId = appEl.dataset.appId;
        if (!appId) return;

        if (openWindows.has(appId)) {
            const existing = openWindows.get(appId);
            if (existing.appEl && existing.appEl.parentNode) {
                existing.appEl.parentNode.removeChild(existing.appEl);
            }
            if (existing.isClosing) return;
            if (existing.isMinimized) restoreWindow(existing);
            else bringToFront(existing);
            return;
        }

        if (appEl.dataset && appEl.dataset.pcWrapped === '1') {
            try { appEl.parentNode.removeChild(appEl); } catch(e) {}
            delete appEl.dataset.pcWrapped;
        }

        const icon = findAppIcon(appId);
        const appName = findAppName(appId);

        appEl.dataset.pcWrapped = '1';
        createWindow(appId, appName, icon, appEl);
    }

    function findAppIcon(appId) {
        const btn = document.querySelector('.btn[data-id="' + appId + '"] img');
        if (btn && btn.src) return btn.src;
        const icon = document.querySelector('.icon-item[data-app-id="' + appId + '"] img');
        if (icon && icon.src) return icon.src;
        if (window.AppScanner && AppScanner.getCache) {
            const cache = AppScanner.getCache();
            if (Array.isArray(cache)) {
                const found = cache.find(function(a) { return a.id === appId; });
                if (found && found.icon) return found.icon;
            }
        }
        return null;
    }

    function findAppName(appId) {
        if (window.AppScanner && AppScanner.getCache) {
            const cache = AppScanner.getCache();
            if (Array.isArray(cache)) {
                const found = cache.find(function(a) { return a.id === appId; });
                if (found && found.name) return found.name;
            }
        }
        return appId;
    }

    function wrapAllExistingApps() {
        if (!pcModeActive) return;
        Object.keys(APP_DOM_IDS).forEach(function(domId) {
            const el = document.getElementById(domId);
            if (el && !el.closest('.pc-window-content')) wrapAppElement(el);
        });
        document.querySelectorAll('.html-app-window[data-app-id]').forEach(function(el) {
            if (!el.closest('.pc-window-content')) wrapHtmlAppElement(el);
        });
    }

    function activeAppIds() {
        const list = [];
        openWindows.forEach(function(state, appId) {
            list.push(appId);
        });
        return list;
    }

    const SYSTEM_NODE_IDS = [
        'pcWindowsArea', 'pcDock', 'pcModeOverlay', 'osApp', 'osSplash',
        'liveBar', 'liveBarShade', 'filePreview', 'fileEditor',
        'appManagerOverlay', 'installWarningOverlay', 'brightnessOverlay'
    ];

    function shouldRelocateToWindow(node) {
        if (!node || node.nodeType !== 1) return false;
        if (!openWindows.size) return false;
        if (node.classList && node.classList.contains('pc-window')) return false;
        if (node.classList && node.classList.contains('pc-window-content')) return false;
        if (node.closest && node.closest('.pc-window')) return false;
        if (node.id && SYSTEM_NODE_IDS.indexOf(node.id) !== -1) return false;
        if (node.id && node.id.indexOf('pc') === 0) return false;
        return true;
    }

    function getActiveWindowState() {
        let activeWin = null;
        openWindows.forEach(function(state) {
            if (state.el && state.el.classList.contains('active') && !state.isClosing) activeWin = state;
        });
        if (!activeWin) {
            openWindows.forEach(function(state) {
                if (!activeWin && !state.isClosing) activeWin = state;
            });
        }
        return activeWin;
    }

    function relocateToWindow(node) {
        const activeWin = getActiveWindowState();
        if (!activeWin || !activeWin.contentEl) return false;

        const computed = window.getComputedStyle(node);
        const pos = computed.position;
        if (pos !== 'fixed' && pos !== 'absolute') return false;

        if (pos === 'fixed') {
            node.style.position = 'absolute';
        }

        activeWin.contentEl.appendChild(node);
        return true;
    }

    let appendChildPatched = false;

    function patchAppendChild() {
        if (appendChildPatched) return;
        if (!document.body) return;
        appendChildPatched = true;

        const origAppend = Node.prototype.appendChild;
        Node.prototype.appendChild = function(node) {
            if (this === document.body && pcModeActive) {
                try {
                    if (shouldRelocateToWindow(node)) {
                        if (relocateToWindow(node)) {
                            return node;
                        }
                    }
                } catch(e) { log('appendChild patch error', e); }
            }
            return origAppend.call(this, node);
        };
    }

    window.PCWindows = {
        isActive: isPCModeActive,
        enable: enablePCMode,
        disable: disablePCMode,
        wrapAll: wrapAllExistingApps,
        activeAppIds: activeAppIds,
        openWindowsMap: openWindows,
        closeWindow: closeWindow,
        getWindowCountForApp: function(appId) {
            return openWindows.has(appId) ? 1 : 0;
        },
        bringToFront: bringToFront,
        updateDockAppearance: updateDockAppearance
    };

    function bootstrap() {
        if (!isPC()) return;
        enablePCMode();
        startObserver();
        patchAppendChild();
        setTimeout(function() {
            wrapAllExistingApps();
        }, 800);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }

})();