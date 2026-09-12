// security.js

(function() {
    'use strict';

    const SECURITY_KEY = 'shnuk_security';
    const SESSION_KEY = 'shnuk_session_unlocked';

    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    function simpleEncrypt(text, key) {
        let result = '';
        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            result += String.fromCharCode(charCode);
        }
        return btoa(unescape(encodeURIComponent(result)));
    }

    function simpleDecrypt(encoded, key) {
        try {
            const decoded = decodeURIComponent(escape(atob(encoded)));
            let result = '';
            for (let i = 0; i < decoded.length; i++) {
                const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
                result += String.fromCharCode(charCode);
            }
            return result;
        } catch(e) {
            return null;
        }
    }

    function getSecurity() {
        try {
            const saved = localStorage.getItem(SECURITY_KEY);
            if (!saved) return null;
            return JSON.parse(saved);
        } catch(e) {
            return null;
        }
    }

    function setSecurity(data) {
        try {
            localStorage.setItem(SECURITY_KEY, JSON.stringify(data));
            return true;
        } catch(e) {
            return false;
        }
    }

    function hasPassword() {
        const sec = getSecurity();
        return sec && sec.type === 'password';
    }

    function hasPattern() {
        const sec = getSecurity();
        return sec && sec.type === 'pattern';
    }

    function hasSecurity() {
        return hasPassword() || hasPattern();
    }

    function setPassword(password) {
        const hash = simpleHash(password + '_shnuk_salt_2024');
        const encrypted = simpleEncrypt(password, hash);
        return setSecurity({
            type: 'password',
            hash: hash,
            data: encrypted,
            created: Date.now()
        });
    }

    function checkPassword(password) {
        const sec = getSecurity();
        if (!sec || sec.type !== 'password') return false;
        const hash = simpleHash(password + '_shnuk_salt_2024');
        return hash === sec.hash;
    }

    function setPattern(pattern) {
        if (!pattern || pattern.length < 4) return false;
        const patternStr = pattern.join('-');
        const hash = simpleHash(patternStr + '_shnuk_salt_2024');
        const encrypted = simpleEncrypt(patternStr, hash);
        return setSecurity({
            type: 'pattern',
            hash: hash,
            data: encrypted,
            created: Date.now()
        });
    }

    function checkPattern(pattern) {
        const sec = getSecurity();
        if (!sec || sec.type !== 'pattern') return false;
        const patternStr = pattern.join('-');
        const hash = simpleHash(patternStr + '_shnuk_salt_2024');
        return hash === sec.hash;
    }

    function removeSecurity() {
        try {
            localStorage.removeItem(SECURITY_KEY);
            localStorage.removeItem(SESSION_KEY);
            return true;
        } catch(e) {
            return false;
        }
    }

    function isSessionUnlocked() {
        try {
            return sessionStorage.getItem(SESSION_KEY) === 'true';
        } catch(e) {
            return false;
        }
    }

    function setSessionUnlocked() {
        try {
            sessionStorage.setItem(SESSION_KEY, 'true');
        } catch(e) {}
    }

    function clearSession() {
        try {
            sessionStorage.removeItem(SESSION_KEY);
        } catch(e) {}
    }

    // Экран блокировки
    function showLockScreen(callback) {
        const overlay = document.createElement('div');
        overlay.id = 'lockScreenOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #000000;
            z-index: 99999999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: 'ST-SimpleSquare', monospace;
            color: #ffffff;
            animation: lockFadeIn 0.5s ease;
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes lockFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes lockShake {
                0%, 100% { transform: translateX(0); }
                20% { transform: translateX(-10px); }
                40% { transform: translateX(10px); }
                60% { transform: translateX(-8px); }
                80% { transform: translateX(8px); }
            }
            @keyframes lockFadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
            .lock-shake { animation: lockShake 0.4s ease; }
            .lock-fade-out { animation: lockFadeOut 0.4s ease forwards; }
        `;
        document.head.appendChild(style);

        const sec = getSecurity();

        if (sec.type === 'password') {
            const title = document.createElement('div');
            title.style.cssText = 'font-size: 24px; margin-bottom: 40px; letter-spacing: 2px;';
            title.textContent = 'Введите пароль';
            overlay.appendChild(title);

            const input = document.createElement('input');
            input.type = 'password';
            input.style.cssText = `
                width: 300px;
                max-width: 80%;
                padding: 16px;
                background: #111111;
                border: 2px solid #333333;
                color: #ffffff;
                font-size: 20px;
                font-family: 'ST-SimpleSquare', monospace;
                text-align: center;
                outline: none;
                letter-spacing: 4px;
            `;
            input.addEventListener('focus', () => { input.style.borderColor = '#ffffff'; });
            input.addEventListener('blur', () => { input.style.borderColor = '#333333'; });
            overlay.appendChild(input);

            const submitBtn = document.createElement('button');
            submitBtn.style.cssText = `
                margin-top: 20px;
                padding: 14px 48px;
                background: #ffffff;
                color: #000000;
                border: none;
                font-family: 'ST-SimpleSquare', monospace;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                letter-spacing: 2px;
            `;
            submitBtn.textContent = 'Войти';
            overlay.appendChild(submitBtn);

            const error = document.createElement('div');
            error.style.cssText = 'margin-top: 20px; font-size: 14px; color: #ff4444; min-height: 20px; letter-spacing: 1px;';
            overlay.appendChild(error);

            function tryUnlock() {
                const pwd = input.value;
                if (!pwd) return;
                
                if (checkPassword(pwd)) {
                    setSessionUnlocked();
                    overlay.classList.add('lock-fade-out');
                    setTimeout(function() {
                        overlay.remove();
                        style.remove();
                        if (callback) callback(true);
                    }, 400);
                } else {
                    error.textContent = 'Неверный пароль';
                    overlay.classList.add('lock-shake');
                    input.value = '';
                    setTimeout(() => overlay.classList.remove('lock-shake'), 400);
                }
            }

            submitBtn.addEventListener('click', tryUnlock);
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') tryUnlock();
            });

            setTimeout(() => input.focus(), 300);

        } else if (sec.type === 'pattern') {
            const title = document.createElement('div');
            title.style.cssText = 'font-size: 24px; margin-bottom: 20px; letter-spacing: 2px;';
            title.textContent = 'Нарисуйте ключ';
            overlay.appendChild(title);

            const subtitle = document.createElement('div');
            subtitle.style.cssText = 'font-size: 12px; color: #666; margin-bottom: 30px; letter-spacing: 1px; min-height: 20px;';
            subtitle.textContent = '';
            overlay.appendChild(subtitle);

            const canvas = document.createElement('canvas');
            const canvasSize = 300;
            canvas.width = canvasSize;
            canvas.height = canvasSize;
            canvas.style.cssText = 'background: #000000; touch-action: none;';
            overlay.appendChild(canvas);

            const ctx = canvas.getContext('2d');
            const dots = [];
            const dotRadius = 12;
            const gridSize = 3;
            const cellSize = canvasSize / gridSize;

            for (let i = 0; i < gridSize; i++) {
                for (let j = 0; j < gridSize; j++) {
                    dots.push({
                        x: cellSize * (j + 0.5),
                        y: cellSize * (i + 0.5),
                        id: i * gridSize + j,
                        used: false
                    });
                }
            }

            let selectedPattern = [];
            let isDrawing = false;
            let currentMouse = null;

            function drawGrid() {
                ctx.clearRect(0, 0, canvasSize, canvasSize);
                
                for (const dot of dots) {
                    if (dot.used) {
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
                        ctx.fill();
                        
                        ctx.fillStyle = '#000000';
                        ctx.beginPath();
                        ctx.arc(dot.x, dot.y, dotRadius * 0.4, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        ctx.strokeStyle = '#333333';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }

                if (selectedPattern.length > 1) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 4;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    
                    for (let i = 0; i < selectedPattern.length; i++) {
                        const dot = dots.find(d => d.id === selectedPattern[i]);
                        if (dot) {
                            if (i === 0) {
                                ctx.moveTo(dot.x, dot.y);
                            } else {
                                ctx.lineTo(dot.x, dot.y);
                            }
                        }
                    }
                    ctx.stroke();
                }

                if (isDrawing && currentMouse && selectedPattern.length > 0) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 4;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    const lastDot = dots.find(d => d.id === selectedPattern[selectedPattern.length - 1]);
                    if (lastDot) {
                        ctx.moveTo(lastDot.x, lastDot.y);
                        ctx.lineTo(currentMouse.x, currentMouse.y);
                    }
                    ctx.stroke();
                }
            }

            function getMousePos(e) {
                const rect = canvas.getBoundingClientRect();
                const touch = e.touches ? e.touches[0] : e;
                return {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top
                };
            }

            function findDot(pos) {
                for (const dot of dots) {
                    const dx = dot.x - pos.x;
                    const dy = dot.y - pos.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < dotRadius * 2.5) {
                        return dot;
                    }
                }
                return null;
            }

            function startDrawing(e) {
                e.preventDefault();
                isDrawing = true;
                currentMouse = getMousePos(e);
                
                const dot = findDot(currentMouse);
                if (dot && !dot.used) {
                    dot.used = true;
                    selectedPattern.push(dot.id);
                    subtitle.textContent = selectedPattern.length + ' точек';
                    drawGrid();
                }
            }

            function continueDrawing(e) {
                if (!isDrawing) return;
                e.preventDefault();
                currentMouse = getMousePos(e);
                
                const dot = findDot(currentMouse);
                if (dot && !dot.used) {
                    dot.used = true;
                    selectedPattern.push(dot.id);
                    subtitle.textContent = selectedPattern.length + ' точек';
                }
                drawGrid();
            }

            function endDrawing(e) {
                if (!isDrawing) return;
                isDrawing = false;
                currentMouse = null;
                drawGrid();

                if (selectedPattern.length >= 4) {
                    setTimeout(function() {
                        if (checkPattern(selectedPattern)) {
                            setSessionUnlocked();
                            overlay.classList.add('lock-fade-out');
                            setTimeout(function() {
                                overlay.remove();
                                style.remove();
                                if (callback) callback(true);
                            }, 400);
                        } else {
                            subtitle.textContent = 'Неверный ключ';
                            subtitle.style.color = '#ff4444';
                            overlay.classList.add('lock-shake');
                            setTimeout(function() {
                                overlay.classList.remove('lock-shake');
                                selectedPattern = [];
                                for (const dot of dots) dot.used = false;
                                subtitle.textContent = '';
                                subtitle.style.color = '#666';
                                drawGrid();
                            }, 400);
                        }
                    }, 200);
                } else {
                    setTimeout(function() {
                        selectedPattern = [];
                        for (const dot of dots) dot.used = false;
                        subtitle.textContent = '';
                        drawGrid();
                    }, 200);
                }
            }

            canvas.addEventListener('mousedown', startDrawing);
            canvas.addEventListener('mousemove', continueDrawing);
            canvas.addEventListener('mouseup', endDrawing);
            canvas.addEventListener('mouseleave', endDrawing);
            canvas.addEventListener('touchstart', startDrawing, { passive: false });
            canvas.addEventListener('touchmove', continueDrawing, { passive: false });
            canvas.addEventListener('touchend', endDrawing);

            drawGrid();
        }

        document.body.appendChild(overlay);
    }

    window.Security = {
        hasSecurity: hasSecurity,
        hasPassword: hasPassword,
        hasPattern: hasPattern,
        setPassword: setPassword,
        setPattern: setPattern,
        checkPassword: checkPassword,
        checkPattern: checkPattern,
        removeSecurity: removeSecurity,
        isSessionUnlocked: isSessionUnlocked,
        setSessionUnlocked: setSessionUnlocked,
        clearSession: clearSession,
        showLockScreen: showLockScreen,
        hash: simpleHash,
        encrypt: simpleEncrypt,
        decrypt: simpleDecrypt
    };

})();