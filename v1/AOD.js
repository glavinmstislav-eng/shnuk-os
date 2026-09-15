// AOD.js — Always On Display

(function() {
    'use strict';

    const IDLE_MS = 15000;
    const MOVE_MS = 120000;

    let overlay = null;
    let idleTimer = null;
    let moveTimer = null;
    let clockTimer = null;
    let clockEl = null;
    let isVisible = false;
    let liveBarSnapshot = null;

    function formatClock() {
        const now = new Date();
        return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }

    function ensureOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'aodOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: #000000;
            z-index: 2147483637;
            display: none;
            align-items: center;
            justify-content: center;
            font-family: 'ST-SimpleSquare', monospace;
            color: #ffffff;
            user-select: none;
            -webkit-user-select: none;
            transition: opacity 0.5s ease;
            opacity: 0;
        `;

        clockEl = document.createElement('div');
        clockEl.id = 'aodClock';
        clockEl.style.cssText = `
            position: absolute;
            font-size: clamp(64px, 18vw, 128px);
            font-weight: 200;
            letter-spacing: 6px;
            color: #ffffff;
            transition: top 1.5s cubic-bezier(0.22, 1, 0.36, 1), left 1.5s cubic-bezier(0.22, 1, 0.36, 1);
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
            text-shadow: 0 0 20px rgba(255,255,255,0.2);
        `;

        overlay.appendChild(clockEl);
        document.body.appendChild(overlay);

        overlay.addEventListener('touchstart', onOverlayTouch, { passive: true });
        overlay.addEventListener('click', onOverlayTouch);

        return overlay;
    }

    let lastTapTime = 0;
    function onOverlayTouch() {
        const now = Date.now();
        if (now - lastTapTime < 400) {
            lastTapTime = 0;
            hideAOD();
            requestUnlock();
        } else {
            lastTapTime = now;
        }
    }

    function requestUnlock() {
        if (window.Security && typeof window.Security.hasSecurity === 'function' && window.Security.hasSecurity()) {
            if (!window.Security.isSessionUnlocked || !window.Security.isSessionUnlocked()) {
                try { sessionStorage.removeItem('shnuk_session_unlocked'); } catch(e) {}
                if (window.location && typeof window.location.reload === 'function') {
                    window.location.reload();
                }
            }
        }
    }

    function randomPosition() {
        if (!clockEl) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const padX = 120;
        const padY = 100;
        const x = padX + Math.random() * Math.max(50, w - padX * 2);
        const y = padY + Math.random() * Math.max(50, h - padY * 2);
        clockEl.style.left = x + 'px';
        clockEl.style.top = y + 'px';
        clockEl.style.transform = 'translate(-50%, -50%)';
    }

    function updateClock() {
        if (clockEl) clockEl.textContent = formatClock();
    }

    function hideLiveBar() {
        const bar = document.getElementById('liveBar');
        if (bar) {
            liveBarSnapshot = {
                height: bar.style.height,
                background: bar.style.background,
                color: bar.style.color,
                pointerEvents: bar.style.pointerEvents,
                display: bar.style.display
            };
            bar.style.display = 'none';
        }
        const quick = document.getElementById('quickPanel');
        if (quick) quick.style.display = 'none';
        const quickBackdrop = document.getElementById('quickPanelBackdrop');
        if (quickBackdrop) quickBackdrop.style.display = 'none';
    }

    function restoreLiveBar() {
        const bar = document.getElementById('liveBar');
        if (bar) {
            bar.style.display = liveBarSnapshot && liveBarSnapshot.display !== '' ? liveBarSnapshot.display : '';
            if (!liveBarSnapshot || !liveBarSnapshot.display) bar.style.display = '';
        }
        const quick = document.getElementById('quickPanel');
        if (quick) quick.style.display = '';
        const quickBackdrop = document.getElementById('quickPanelBackdrop');
        if (quickBackdrop) quickBackdrop.style.display = '';
        liveBarSnapshot = null;
    }

    function showAOD() {
        ensureOverlay();
        if (isVisible) return;
        isVisible = true;

        hideLiveBar();
        updateClock();
        randomPosition();

        overlay.style.display = 'flex';
        requestAnimationFrame(function() { overlay.style.opacity = '1'; });

        if (moveTimer) clearInterval(moveTimer);
        moveTimer = setInterval(function() {
            if (isVisible) randomPosition();
        }, MOVE_MS);

        if (clockTimer) clearInterval(clockTimer);
        clockTimer = setInterval(function() {
            if (isVisible) updateClock();
        }, 1000);
    }

    function hideAOD() {
        if (!isVisible) return;
        isVisible = false;
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(function() {
                if (overlay && !isVisible) overlay.style.display = 'none';
            }, 400);
        }
        restoreLiveBar();
        if (moveTimer) { clearInterval(moveTimer); moveTimer = null; }
        if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    }

    function resetIdle() {
        if (idleTimer) clearTimeout(idleTimer);
        if (isVisible) hideAOD();
        idleTimer = setTimeout(function() {
            showAOD();
        }, IDLE_MS);
    }

    function init() {
        ensureOverlay();
        updateClock();
        ['touchstart', 'touchmove', 'mousedown', 'mousemove', 'keydown', 'wheel', 'scroll', 'click']
            .forEach(function(ev) {
                document.addEventListener(ev, resetIdle, { passive: true });
            });
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                if (idleTimer) clearTimeout(idleTimer);
            } else {
                resetIdle();
            }
        });
        resetIdle();
    }

    function destroy() {
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        if (moveTimer) { clearInterval(moveTimer); moveTimer = null; }
        if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
        clockEl = null;
    }

    window.AOD = {
        init: init,
        destroy: destroy,
        show: showAOD,
        hide: hideAOD,
        resetIdle: resetIdle
    };

})();