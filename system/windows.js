// windows.js

(function() {
    'use strict';

    let activeWindow = null;
    let zIndex = 100000;

    function createWindow(options) {
        options = options || {};

        const {
            title = '',
            message = '',
            type = 'alert',
            buttons = [],
            inputDefault = '',
            inputPlaceholder = '',
            closable = true,
            onClose = null,
            width = '400px'
        } = options;

        if (activeWindow) {
            closeWindow(activeWindow, true);
        }

        const backdrop = document.createElement('div');
        backdrop.className = 'win-backdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0);
            backdrop-filter: blur(0px);
            -webkit-backdrop-filter: blur(0px);
            z-index: ${zIndex++};
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.4s cubic-bezier(0.22, 1, 0.36, 1), backdrop-filter 0.4s cubic-bezier(0.22, 1, 0.36, 1);
            padding: 20px;
            box-sizing: border-box;
        `;

        const win = document.createElement('div');
        win.className = 'win-window';
        win.style.cssText = `
            background: var(--bg-primary, #ffffff);
            color: var(--text-primary, #1a1a1a);
            width: ${width};
            max-width: 100%;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            font-family: 'ST-SimpleSquare', monospace;
            opacity: 0;
            filter: blur(20px);
            transform: translate(-50%, -50%) scale(0.9);
            position: fixed;
            top: 50%;
            left: 50%;
            transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 18px;
            background: var(--header-bg, #f5f5f5);
            color: var(--header-text, #1a1a1a);
            border-bottom: 2px solid var(--border-color, #1a1a1a);
            flex-shrink: 0;
        `;
        header.innerHTML = `
            <div style="font-size: 15px; font-weight: 600; letter-spacing: 0.3px;">${title}</div>
            ${closable ? '<button class="win-close" style="background:none;border:2px solid var(--accent, #cc0000);color:var(--accent, #cc0000);font-size:14px;padding:2px 10px;cursor:pointer;font-family:inherit;transition:all 0.2s;line-height:1;">✕</button>' : ''}
        `;
        win.appendChild(header);

        const content = document.createElement('div');
        content.style.cssText = `
            padding: 24px 20px;
            flex: 1;
            overflow-y: auto;
            font-size: 14px;
            line-height: 1.5;
            color: var(--text-secondary, #333);
        `;

        if (type === 'prompt') {
            content.innerHTML = message ? `<div style="margin-bottom: 14px;">${message}</div>` : '';
            
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'win-input';
            input.value = inputDefault;
            input.placeholder = inputPlaceholder;
            input.style.cssText = `
                width: 100%;
                padding: 12px 14px;
                border: 2px solid var(--border-color, #e0e0e0);
                font-family: 'ST-SimpleSquare', monospace;
                font-size: 14px;
                outline: none;
                box-sizing: border-box;
                background: var(--bg-primary, #fff);
                color: var(--text-primary, #1a1a1a);
                transition: border-color 0.2s;
            `;
            input.addEventListener('focus', () => { input.style.borderColor = 'var(--accent, #cc0000)'; });
            input.addEventListener('blur', () => { input.style.borderColor = 'var(--border-color, #e0e0e0)'; });
            content.appendChild(input);
            win._input = input;
        } else if (type === 'custom') {
            if (typeof message === 'string') {
                content.innerHTML = message;
            } else if (message instanceof HTMLElement) {
                content.appendChild(message);
            }
        } else {
            content.textContent = message;
        }

        win.appendChild(content);

        if (buttons.length > 0) {
            const buttonsEl = document.createElement('div');
            buttonsEl.style.cssText = `
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                padding: 14px 18px;
                border-top: 2px solid var(--border-color, #f0f0f0);
                background: var(--bg-secondary, #fafafa);
                flex-shrink: 0;
                flex-wrap: wrap;
            `;

            buttons.forEach(btn => {
                const button = document.createElement('button');
                button.textContent = btn.text || 'OK';
                const isPrimary = btn.primary !== false;
                const isDanger = btn.danger === true;
                const isSecondary = btn.secondary === true;
                
                let bg = 'var(--bg-primary, #ffffff)';
                let color = 'var(--text-primary, #1a1a1a)';
                let borderColor = 'var(--border-color, #e0e0e0)';

                if (isPrimary && !isDanger && !isSecondary) {
                    bg = 'var(--accent, #cc0000)';
                    color = '#ffffff';
                    borderColor = 'var(--accent, #cc0000)';
                }
                if (isDanger) {
                    bg = 'var(--accent, #cc0000)';
                    color = '#ffffff';
                    borderColor = 'var(--accent, #cc0000)';
                }

                button.style.cssText = `
                    padding: 10px 24px;
                    border: 2px solid ${borderColor};
                    background: ${bg};
                    color: ${color};
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 13px;
                    font-weight: 600;
                    transition: all 0.2s;
                    white-space: nowrap;
                `;

                button.addEventListener('mouseenter', () => {
                    if (isPrimary && !isDanger && !isSecondary) button.style.background = 'var(--accent-dark, #990000)';
                    else if (isDanger) button.style.background = 'var(--accent-dark, #8b0000)';
                    else if (isSecondary) button.style.background = 'var(--bg-tertiary, #f0f0f0)';
                });
                button.addEventListener('mouseleave', () => {
                    button.style.background = bg;
                });

                button.addEventListener('click', () => {
                    let result = true;
                    
                    if (btn.onClick) {
                        const res = btn.onClick(win._input ? win._input.value : null);
                        if (res === false) return;
                    }
                    
                    closeWindow(win, false, btn.value, win._input ? win._input.value : null);
                });

                buttonsEl.appendChild(button);
            });

            win.appendChild(buttonsEl);
        }

        backdrop.appendChild(win);
        document.body.appendChild(backdrop);

        requestAnimationFrame(() => {
            backdrop.style.background = 'rgba(0, 0, 0, 0.5)';
            backdrop.style.backdropFilter = 'blur(15px)';
            backdrop.style.webkitBackdropFilter = 'blur(15px)';
            
            win.style.opacity = '1';
            win.style.filter = 'blur(0)';
            win.style.transform = 'translate(-50%, -50%) scale(1)';
        });

        if (win._input) {
            setTimeout(() => win._input.focus(), 400);
        }

        const closeBtn = header.querySelector('.win-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                closeWindow(win, false, null, win._input ? win._input.value : null);
            });
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.background = 'var(--accent, #cc0000)';
                closeBtn.style.color = '#ffffff';
            });
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.background = 'none';
                closeBtn.style.color = 'var(--accent, #cc0000)';
            });
        }

        if (closable) {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) {
                    closeWindow(win, false, null, win._input ? win._input.value : null);
                }
            });
        }

        const onEsc = (e) => {
            if (e.key === 'Escape' && closable) {
                closeWindow(win, false, null, win._input ? win._input.value : null);
                document.removeEventListener('keydown', onEsc);
            }
        };
        document.addEventListener('keydown', onEsc);

        if (type === 'prompt' && win._input) {
            win._input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const okBtn = buttonsEl && buttonsEl.querySelector('button');
                    if (okBtn) okBtn.click();
                }
            });
        }

        win._backdrop = backdrop;
        win._onClose = onClose;
        win._escHandler = onEsc;
        activeWindow = win;

        return win;
    }

    function closeWindow(win, silent, value, inputValue) {
        if (!win) return;

        const backdrop = win._backdrop;
        if (!backdrop || !backdrop.parentNode) return;

        if (win._escHandler) {
            document.removeEventListener('keydown', win._escHandler);
        }

        backdrop.style.background = 'rgba(0, 0, 0, 0)';
        backdrop.style.backdropFilter = 'blur(0px)';
        backdrop.style.webkitBackdropFilter = 'blur(0px)';
        
        win.style.opacity = '0';
        win.style.filter = 'blur(20px)';
        win.style.transform = 'translate(-50%, -50%) scale(0.9)';

        setTimeout(() => {
            if (backdrop.parentNode) backdrop.remove();
            if (activeWindow === win) activeWindow = null;
            
            if (!silent && win._onClose) {
                win._onClose(value, inputValue);
            }
        }, 400);
    }

    function alert(message, options) {
        options = options || {};
        return new Promise(function(resolve) {
            createWindow({
                title: options.title || '',
                message: message,
                type: 'alert',
                closable: true,
                buttons: [
                    {
                        text: options.okText || 'OK',
                        primary: true,
                        onClick: () => {
                            resolve(true);
                        }
                    }
                ],
                onClose: () => {
                    resolve(true);
                }
            });
        });
    }

    function confirm(message, options) {
        options = options || {};
        return new Promise(function(resolve) {
            createWindow({
                title: options.title || '',
                message: message,
                type: 'confirm',
                closable: options.closable !== false,
                buttons: [
                    {
                        text: options.cancelText || 'Отмена',
                        secondary: true,
                        onClick: () => {
                            resolve(false);
                        }
                    },
                    {
                        text: options.okText || 'OK',
                        primary: !options.danger,
                        danger: options.danger,
                        onClick: () => {
                            resolve(true);
                        }
                    }
                ],
                onClose: (value) => {
                    if (value === null) resolve(false);
                }
            });
        });
    }

    function prompt(message, defaultValue, options) {
        options = options || {};
        defaultValue = defaultValue || '';
        return new Promise(function(resolve) {
            createWindow({
                title: options.title || '',
                message: message,
                type: 'prompt',
                inputDefault: defaultValue,
                inputPlaceholder: options.placeholder || '',
                closable: options.closable !== false,
                buttons: [
                    {
                        text: options.cancelText || 'Отмена',
                        secondary: true,
                        onClick: () => {
                            resolve(null);
                        }
                    },
                    {
                        text: options.okText || 'OK',
                        primary: true,
                        onClick: (inputValue) => {
                            resolve(inputValue);
                        }
                    }
                ],
                onClose: (value, inputValue) => {
                    if (value === null) resolve(null);
                    else if (value !== undefined) resolve(inputValue);
                }
            });
        });
    }

    function notify(message, options) {
        options = options || {};
        const duration = options.duration || 3000;
        const type = options.type || 'info';

        const colors = {
            info: 'var(--text-primary, #1a1a1a)',
            success: '#4CAF50',
            error: 'var(--accent, #cc0000)',
            warning: '#ff9800'
        };

        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            padding: 14px 28px;
            background: ${colors[type] || colors.info};
            color: #ffffff;
            font-family: 'ST-SimpleSquare', monospace;
            font-size: 14px;
            z-index: 999999;
            opacity: 0;
            filter: blur(10px);
            transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
            pointer-events: none;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            max-width: 90%;
            text-align: center;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.filter = 'blur(0)';
            notification.style.transform = 'translateX(-50%) translateY(0)';
        });

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.filter = 'blur(10px)';
            notification.style.transform = 'translateX(-50%) translateY(-20px)';
            setTimeout(() => notification.remove(), 400);
        }, duration);

        return notification;
    }

    window.Win = {
        alert: alert,
        confirm: confirm,
        prompt: prompt,
        notify: notify,
        create: createWindow,
        close: closeWindow,
        closeAll: function() {
            if (activeWindow) {
                closeWindow(activeWindow, true);
            }
        }
    };

    window.win = window.Win;

})();