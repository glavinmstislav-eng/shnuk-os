// lockscreen.js — Shnuk OS экран блокировки

(function() {
    'use strict';

    const LOCK_ID = 'shnukLockScreen';
    const WALLPAPER_KEY = 'shnuk_lockscreen_wallpaper';
    const FONT_MAIN = "'TTPaplane', monospace";

    let overlay = null;
    let clockInterval = null;
    let wallpaperCanvas = null;
    let wallpaperCtx = null;
    let brightnessMap = null;
    let mapW = 0, mapH = 0;
    let onUnlockCallback = null;
    let isUnlocking = false;
    let currentImage = null;

    // ============================================
    // РАБОТА С ОБОЯМИ
    // ============================================

    function loadWallpaper() {
        try {
            return localStorage.getItem(WALLPAPER_KEY);
        } catch(e) {
            return null;
        }
    }

    function saveWallpaper(dataUrl) {
        try {
            localStorage.setItem(WALLPAPER_KEY, dataUrl);
            return true;
        } catch(e) {
            return false;
        }
    }

    function clearWallpaper() {
        try {
            localStorage.removeItem(WALLPAPER_KEY);
        } catch(e) {}
    }

    // ============================================
    // АНАЛИЗ ЯРКОСТИ ДЛЯ ЭФФЕКТА ОГИБАНИЯ
    // ============================================

    // Строим карту яркости фонового изображения. Каждый пиксель
    // карты — средняя яркость блока 20x20 из обоев, растянутого на экран.
    function buildBrightnessMap(img) {
        try {
            if (!img || !img.complete || !img.naturalWidth) return;
            const step = 20;
            mapW = Math.ceil(window.innerWidth / step);
            mapH = Math.ceil(window.innerHeight / step);

            if (!wallpaperCanvas) {
                wallpaperCanvas = document.createElement('canvas');
                wallpaperCtx = wallpaperCanvas.getContext('2d');
            }
            wallpaperCanvas.width = mapW;
            wallpaperCanvas.height = mapH;

            // Рисуем обои, растянутые на весь экран, в маленький canvas.
            // Так мы получаем средние значения для каждой ячейки.
            wallpaperCtx.drawImage(img, 0, 0, mapW, mapH);

            const data = wallpaperCtx.getImageData(0, 0, mapW, mapH).data;
            const map = new Float32Array(mapW * mapH);
            for (let i = 0; i < mapW * mapH; i++) {
                const r = data[i * 4];
                const g = data[i * 4 + 1];
                const b = data[i * 4 + 2];
                // Воспринимаемая яркость (формула из sRGB)
                map[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            }
            brightnessMap = map;
        } catch(e) {
            brightnessMap = null;
        }
    }

    // Получить яркость под заданной прямоугольной областью экрана
    function getBrightnessInRect(x, y, w, h) {
        if (!brightnessMap) return 0.5;
        try {
            const step = 20;
            const x1 = Math.max(0, Math.floor(x / step));
            const y1 = Math.max(0, Math.floor(y / step));
            const x2 = Math.min(mapW - 1, Math.ceil((x + w) / step));
            const y2 = Math.min(mapH - 1, Math.ceil((y + h) / step));

            let sum = 0;
            let count = 0;
            for (let gy = y1; gy <= y2; gy++) {
                for (let gx = x1; gx <= x2; gx++) {
                    sum += brightnessMap[gy * mapW + gx];
                    count++;
                }
            }
            return count > 0 ? sum / count : 0.5;
        } catch(e) {
            return 0.5;
        }
    }

    // Цвет текста под яркостью: 0 — тёмный, 1 — светлый
    function getTextColorForBrightness(b) {
        return b > 0.55 ? '#1a1a1a' : '#ffffff';
    }

    // Цвет тени: обычно противоположный цвету текста
    function getShadowColorForBrightness(b) {
        return b > 0.55 ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)';
    }

    // ============================================
    // ЧАСЫ
    // ============================================

    function pad2(n) {
        return n < 10 ? '0' + n : '' + n;
    }

    function formatDateRu(d) {
        const days = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
        const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()];
    }

    // Создать строчку из символов с индивидуальной адаптацией по яркости
    function renderAdaptiveLine(text, opts) {
        const line = document.createElement('div');
        line.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            gap: ${opts.gap || 0}px;
            font-weight: ${opts.weight || 700};
            font-size: ${opts.size || 96}px;
            letter-spacing: ${opts.letterSpacing || '4px'};
            line-height: 1;
            font-family: ${FONT_MAIN};
            transition: color 0.15s ease, text-shadow 0.15s ease;
        `;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            const span = document.createElement('span');
            span.textContent = ch === ' ' ? '\u00A0' : ch;
            span.style.cssText = `
                display: inline-block;
                font-family: ${FONT_MAIN};
                transition: color 0.15s ease, text-shadow 0.15s ease;
            `;
            line.appendChild(span);
        }
        return line;
    }

    // Обновить цвета для каждой буквы в строке по её позиции на экране
    function updateLineAdaptive(line) {
        const rect = line.getBoundingClientRect();
        const spans = line.querySelectorAll('span');
        if (spans.length === 0) return;

        const lineH = rect.height || 100;
        // Для каждой буквы считаем её позицию и берём яркость под ней
        spans.forEach((span) => {
            const sr = span.getBoundingClientRect();
            const b = getBrightnessInRect(sr.left, sr.top, sr.width, sr.height);
            const textColor = getTextColorForBrightness(b);
            const shadow = getShadowColorForBrightness(b);
            span.style.color = textColor;
            // Многослойная тень даёт эффект «огибания» элемента фона
            span.style.textShadow =
                `0 0 8px ${shadow}, 0 0 16px ${shadow}, 0 0 24px ${shadow}`;
        });
    }

    function updateClock() {
        if (!overlay) return;
        const now = new Date();
        const hours = pad2(now.getHours());
        const minutes = pad2(now.getMinutes());
        const date = formatDateRu(now);

        const hoursEl = overlay.querySelector('#lsHours');
        const minutesEl = overlay.querySelector('#lsMinutes');
        const dateEl = overlay.querySelector('#lsDate');

        if (hoursEl) updateDigits(hoursEl, hours);
        if (minutesEl) updateDigits(minutesEl, minutes);
        if (dateEl) {
            const r = dateEl.getBoundingClientRect();
            const b = getBrightnessInRect(r.left, r.top, r.width, r.height);
            dateEl.style.color = getTextColorForBrightness(b);
            const shadow = getShadowColorForBrightness(b);
            dateEl.style.textShadow = `0 0 8px ${shadow}, 0 0 16px ${shadow}`;
        }
    }

    // Обновить цифры в строке — заменить содержимое, если количество изменилось
    function updateDigits(line, text) {
        const spans = line.querySelectorAll('span');
        if (spans.length !== text.length) {
            line.innerHTML = '';
            for (let i = 0; i < text.length; i++) {
                const span = document.createElement('span');
                span.textContent = text[i];
                line.appendChild(span);
            }
        } else {
            for (let i = 0; i < text.length; i++) {
                if (spans[i].textContent !== text[i]) {
                    spans[i].textContent = text[i];
                }
            }
        }
        updateLineAdaptive(line);
    }

    // ============================================
    // РАЗБЛОКИРОВКА
    // ============================================

    function unlock() {
        if (isUnlocking) return;
        isUnlocking = true;

        if (clockInterval) {
            clearInterval(clockInterval);
            clockInterval = null;
        }

        if (overlay) {
            overlay.style.transition = 'opacity 0.35s ease, transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), filter 0.35s ease';
            overlay.style.opacity = '0';
            overlay.style.transform = 'translateY(-20px) scale(0.98)';
            overlay.style.filter = 'blur(20px)';
        }

        setTimeout(function() {
            if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
            overlay = null;
            isUnlocking = false;
            if (onUnlockCallback) {
                const cb = onUnlockCallback;
                onUnlockCallback = null;
                cb();
            }
        }, 380);
    }

    // ============================================
    // UI
    // ============================================

    function injectStyles() {
        if (document.getElementById('lockScreenStyles')) return;
        const style = document.createElement('style');
        style.id = 'lockScreenStyles';
        style.textContent = `
            @keyframes lsFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            #${LOCK_ID} {
                position: fixed;
                top: 0; left: 0;
                width: 100%; height: 100%;
                background: #1a1a1a;
                z-index: 2147483647;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                font-family: ${FONT_MAIN};
                color: #ffffff;
                overflow: hidden;
                opacity: 0;
                animation: lsFadeIn 0.4s ease forwards;
                user-select: none;
                -webkit-user-select: none;
                -webkit-tap-highlight-color: transparent;
                touch-action: none;
            }

            #${LOCK_ID} .ls-wallpaper {
                position: absolute;
                top: 0; left: 0;
                width: 100%; height: 100%;
                background-size: cover;
                background-position: center;
                background-repeat: no-repeat;
                z-index: 0;
                pointer-events: none;
            }

            #${LOCK_ID} .ls-content {
                position: relative;
                z-index: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100%;
                padding: 40px 20px;
                box-sizing: border-box;
                pointer-events: none;
            }

            #${LOCK_ID} .ls-clock {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 12px;
                transform: scaleY(1.35);
                transform-origin: center center;
            }

            #${LOCK_ID} .ls-time-line {
                display: flex;
                justify-content: center;
                align-items: center;
                font-weight: 700;
                line-height: 1;
                letter-spacing: 8px;
                font-family: ${FONT_MAIN};
            }

            #${LOCK_ID} .ls-time-line.hours {
                font-size: clamp(72px, 22vw, 180px);
            }

            #${LOCK_ID} .ls-time-line.minutes {
                font-size: clamp(72px, 22vw, 180px);
            }

            #${LOCK_ID} .ls-time-line span {
                display: inline-block;
                font-family: ${FONT_MAIN};
                transition: color 0.15s ease, text-shadow 0.15s ease;
            }

            #${LOCK_ID} .ls-date {
                margin-top: 26px;
                font-size: clamp(12px, 3vw, 18px);
                letter-spacing: 2px;
                text-transform: lowercase;
                font-family: ${FONT_MAIN};
                text-align: center;
                transition: color 0.15s ease, text-shadow 0.15s ease;
            }

            #${LOCK_ID} .ls-hint {
                position: absolute;
                bottom: 150px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 12px;
                letter-spacing: 2px;
                color: rgba(255,255,255,0.55);
                text-transform: uppercase;
                animation: lsFadeIn 0.4s ease 0.4s both;
                pointer-events: none;
            }

            #${LOCK_ID} .ls-controls {
                position: absolute;
                bottom: 40px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                gap: 12px;
                pointer-events: auto;
                z-index: 2;
                flex-wrap: wrap;
                justify-content: center;
                padding: 0 16px;
                box-sizing: border-box;
            }

            #${LOCK_ID} .ls-btn {
                padding: 14px 28px;
                border: 2px solid rgba(255,255,255,0.6);
                background: rgba(0,0,0,0.35);
                color: #ffffff;
                font-family: ${FONT_MAIN};
                font-size: 14px;
                font-weight: 700;
                letter-spacing: 1px;
                cursor: pointer;
                transition: all 0.2s ease;
                -webkit-tap-highlight-color: transparent;
                touch-action: manipulation;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
            }

            #${LOCK_ID} .ls-btn:hover {
                background: rgba(0,0,0,0.55);
                border-color: rgba(255,255,255,0.9);
            }

            #${LOCK_ID} .ls-btn:active {
                transform: scale(0.96);
            }

            #${LOCK_ID} .ls-btn.primary {
                background: #cc0000;
                border-color: #cc0000;
                color: #ffffff;
            }

            #${LOCK_ID} .ls-btn.primary:hover {
                background: #990000;
                border-color: #990000;
            }

            @media (max-width: 500px) {
                #${LOCK_ID} .ls-clock { transform: scaleY(1.2); }
                #${LOCK_ID} .ls-time-line.hours,
                #${LOCK_ID} .ls-time-line.minutes { letter-spacing: 4px; }
                #${LOCK_ID} .ls-hint { bottom: 130px; font-size: 11px; }
                #${LOCK_ID} .ls-btn { padding: 12px 20px; font-size: 12px; }
            }
        `;
        document.head.appendChild(style);
    }

    function createUI() {
        injectStyles();

        if (overlay) {
            overlay.remove();
            overlay = null;
        }

        overlay = document.createElement('div');
        overlay.id = LOCK_ID;

        const wallpaper = document.createElement('div');
        wallpaper.className = 'ls-wallpaper';
        wallpaper.id = 'lsWallpaper';

        const content = document.createElement('div');
        content.className = 'ls-content';

        const clock = document.createElement('div');
        clock.className = 'ls-clock';

        const hoursLine = document.createElement('div');
        hoursLine.className = 'ls-time-line hours';
        hoursLine.id = 'lsHours';

        const minutesLine = document.createElement('div');
        minutesLine.className = 'ls-time-line minutes';
        minutesLine.id = 'lsMinutes';

        clock.appendChild(hoursLine);
        clock.appendChild(minutesLine);

        const dateEl = document.createElement('div');
        dateEl.className = 'ls-date';
        dateEl.id = 'lsDate';

        content.appendChild(clock);
        content.appendChild(dateEl);

        const hint = document.createElement('div');
        hint.className = 'ls-hint';
        hint.textContent = 'Свайпните вверх для разблокировки';

        const controls = document.createElement('div');
        controls.className = 'ls-controls';

        const wallpaperBtn = document.createElement('button');
        wallpaperBtn.className = 'ls-btn';
        wallpaperBtn.textContent = 'ОБОИ';
        wallpaperBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            openWallpaperPicker();
        });

        const unlockBtn = document.createElement('button');
        unlockBtn.className = 'ls-btn primary';
        unlockBtn.textContent = 'РАЗБЛОКИРОВАТЬ';
        unlockBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            unlock();
        });

        controls.appendChild(wallpaperBtn);
        controls.appendChild(unlockBtn);

        overlay.appendChild(wallpaper);
        overlay.appendChild(content);
        overlay.appendChild(hint);
        overlay.appendChild(controls);

        document.body.appendChild(overlay);

        // Применяем сохранённые обои
        const savedWall = loadWallpaper();
        if (savedWall) {
            applyWallpaper(savedWall);
        }

        // Обработчики свайпа и тапа
        let touchStartY = 0;
        let touchStartX = 0;
        let touchStartTime = 0;
        let isTouching = false;

        overlay.addEventListener('touchstart', function(e) {
            if (e.target.closest('.ls-btn')) return;
            const t = e.touches[0];
            touchStartY = t.clientY;
            touchStartX = t.clientX;
            touchStartTime = Date.now();
            isTouching = true;
        }, { passive: true });

        overlay.addEventListener('touchmove', function(e) {
            if (!isTouching) return;
            if (e.target.closest('.ls-btn')) return;
            const t = e.touches[0];
            const dy = t.clientY - touchStartY;
            const dx = t.clientX - touchStartX;
            // Свайп вверх — блокируем дефолт, чтобы не скроллить
            if (dy < -10 && Math.abs(dy) > Math.abs(dx)) {
                if (e.cancelable) e.preventDefault();
            }
        }, { passive: false });

        overlay.addEventListener('touchend', function(e) {
            if (!isTouching) return;
            isTouching = false;
            if (e.target.closest('.ls-btn')) return;
            const t = e.changedTouches[0];
            const dy = t.clientY - touchStartY;
            const dx = t.clientX - touchStartX;
            const dt = Date.now() - touchStartTime;

            // Свайп вверх
            if (dy < -60 && Math.abs(dy) > Math.abs(dx)) {
                unlock();
                return;
            }
            // Тап
            if (dt < 300 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
                unlock();
            }
        }, { passive: true });

        // Для десктопа — мышь
        let mouseStartY = 0;
        let mouseStartTime = 0;
        let isMouseDown = false;

        overlay.addEventListener('mousedown', function(e) {
            if (e.target.closest('.ls-btn')) return;
            mouseStartY = e.clientY;
            mouseStartTime = Date.now();
            isMouseDown = true;
        });

        overlay.addEventListener('mouseup', function(e) {
            if (!isMouseDown) return;
            isMouseDown = false;
            if (e.target.closest('.ls-btn')) return;
            const dy = e.clientY - mouseStartY;
            const dt = Date.now() - mouseStartTime;
            if (dy < -60) {
                unlock();
                return;
            }
            if (dt < 300 && Math.abs(dy) < 10) {
                unlock();
            }
        });

        window.addEventListener('resize', onResize);

        // Первый рендер и запуск обновления
        updateClock();
        if (clockInterval) clearInterval(clockInterval);
        clockInterval = setInterval(updateClock, 1000);
    }

    function onResize() {
        // При смене размера экрана пересчитываем карту яркости,
        // если обои загружены
        if (currentImage) {
            buildBrightnessMap(currentImage);
            updateClock();
        }
    }

    // ============================================
    // ОБОИ
    // ============================================

    function applyWallpaper(dataUrl) {
        const wallpaper = document.getElementById('lsWallpaper');
        if (wallpaper) {
            wallpaper.style.backgroundImage = 'url(\'' + dataUrl + '\')';
        }

        // Загружаем изображение для построения карты яркости
        const img = new Image();
        img.onload = function() {
            currentImage = img;
            buildBrightnessMap(img);
            updateClock();
        };
        img.onerror = function() {
            currentImage = null;
            brightnessMap = null;
        };
        img.src = dataUrl;
    }

    function openWallpaperPicker() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';

        input.onchange = function() {
            if (!this.files || !this.files[0]) return;
            const file = this.files[0];
            if (!file.type.startsWith('image/')) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                const dataUrl = e.target.result;
                if (!dataUrl) return;
                if (saveWallpaper(dataUrl)) {
                    applyWallpaper(dataUrl);
                }
            };
            reader.readAsDataURL(file);
        };

        document.body.appendChild(input);
        input.click();
        setTimeout(function() {
            if (input.parentNode) input.parentNode.removeChild(input);
        }, 1000);
    }

    // ============================================
    // API
    // ============================================

    function show(callback) {
        if (overlay) return;
        onUnlockCallback = callback || null;
        isUnlocking = false;
        createUI();
    }

    function hide() {
        unlock();
    }

    function destroy() {
        if (clockInterval) {
            clearInterval(clockInterval);
            clockInterval = null;
        }
        window.removeEventListener('resize', onResize);
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
    }

    window.LockScreen = {
        show: show,
        hide: hide,
        destroy: destroy,
        setWallpaper: applyWallpaper,
        clearWallpaper: function() {
            clearWallpaper();
            const wallpaper = document.getElementById('lsWallpaper');
            if (wallpaper) wallpaper.style.backgroundImage = '';
            currentImage = null;
            brightnessMap = null;
            updateClock();
        },
        isVisible: function() { return !!overlay; }
    };

})();