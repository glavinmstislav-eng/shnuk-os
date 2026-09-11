// l.js — Библиотека анимаций с размытием для Shnuk OS

(function() {
    'use strict';

    console.log('[L] Загрузка библиотеки анимаций...');

    // ============================================
    // 1. CSS-СТИЛИ ДЛЯ АНИМАЦИЙ
    // ============================================
    const styles = `
        /* ===== ОСНОВНЫЕ АНИМАЦИИ РАЗМЫТИЯ ===== */
        
        @keyframes lBlurIn {
            0% { 
                opacity: 0;
                filter: blur(20px);
                transform: scale(0.95);
            }
            100% { 
                opacity: 1;
                filter: blur(0);
                transform: scale(1);
            }
        }

        @keyframes lBlurOut {
            0% { 
                opacity: 1;
                filter: blur(0);
                transform: scale(1);
            }
            100% { 
                opacity: 0;
                filter: blur(20px);
                transform: scale(0.95);
            }
        }

        @keyframes lBlurSlideUp {
            0% { 
                opacity: 0;
                filter: blur(15px);
                transform: translateY(30px);
            }
            100% { 
                opacity: 1;
                filter: blur(0);
                transform: translateY(0);
            }
        }

        @keyframes lBlurSlideDown {
            0% { 
                opacity: 1;
                filter: blur(0);
                transform: translateY(0);
            }
            100% { 
                opacity: 0;
                filter: blur(15px);
                transform: translateY(30px);
            }
        }

        @keyframes lBlurSlideLeft {
            0% { 
                opacity: 0;
                filter: blur(15px);
                transform: translateX(30px);
            }
            100% { 
                opacity: 1;
                filter: blur(0);
                transform: translateX(0);
            }
        }

        @keyframes lBlurSlideRight {
            0% { 
                opacity: 1;
                filter: blur(0);
                transform: translateX(0);
            }
            100% { 
                opacity: 0;
                filter: blur(15px);
                transform: translateX(30px);
            }
        }

        @keyframes lBlurZoomIn {
            0% { 
                opacity: 0;
                filter: blur(25px);
                transform: scale(0.7);
            }
            60% {
                filter: blur(5px);
            }
            100% { 
                opacity: 1;
                filter: blur(0);
                transform: scale(1);
            }
        }

        @keyframes lBlurZoomOut {
            0% { 
                opacity: 1;
                filter: blur(0);
                transform: scale(1);
            }
            40% {
                filter: blur(5px);
            }
            100% { 
                opacity: 0;
                filter: blur(25px);
                transform: scale(0.7);
            }
        }

        @keyframes lBlurPulse {
            0%, 100% { 
                filter: blur(0);
                transform: scale(1);
            }
            50% { 
                filter: blur(4px);
                transform: scale(1.05);
            }
        }

        @keyframes lBlurFadeIn {
            0% { 
                opacity: 0;
                filter: blur(10px);
            }
            100% { 
                opacity: 1;
                filter: blur(0);
            }
        }

        @keyframes lBlurFadeOut {
            0% { 
                opacity: 1;
                filter: blur(0);
            }
            100% { 
                opacity: 0;
                filter: blur(10px);
            }
        }

        /* ===== АНИМАЦИИ ДЛЯ МОДАЛЬНЫХ ОКОН ===== */
        
        @keyframes lModalOpen {
            0% { 
                opacity: 0;
                filter: blur(30px);
                transform: scale(0.8) translateY(40px);
            }
            50% {
                filter: blur(8px);
            }
            100% { 
                opacity: 1;
                filter: blur(0);
                transform: scale(1) translateY(0);
            }
        }

        @keyframes lModalClose {
            0% { 
                opacity: 1;
                filter: blur(0);
                transform: scale(1) translateY(0);
            }
            40% {
                filter: blur(8px);
            }
            100% { 
                opacity: 0;
                filter: blur(30px);
                transform: scale(0.8) translateY(40px);
            }
        }

        /* ===== АНИМАЦИИ ДЛЯ ИКОНОК ===== */
        
        @keyframes lIconLaunch {
            0% { 
                filter: blur(0);
                transform: scale(1);
            }
            30% { 
                filter: blur(2px);
                transform: scale(0.9);
            }
            60% { 
                filter: blur(8px);
                transform: scale(1.3);
            }
            100% { 
                filter: blur(15px);
                transform: scale(2);
                opacity: 0;
            }
        }

        @keyframes lIconLanding {
            0% { 
                filter: blur(15px);
                transform: scale(2);
                opacity: 0;
            }
            40% { 
                filter: blur(8px);
                transform: scale(1.3);
                opacity: 1;
            }
            70% { 
                filter: blur(2px);
                transform: scale(0.9);
            }
            100% { 
                filter: blur(0);
                transform: scale(1);
                opacity: 1;
            }
        }

        /* ===== АНИМАЦИИ ДЛЯ ПАНЕЛЕЙ ===== */
        
        @keyframes lPanelSlideUp {
            0% { 
                opacity: 0;
                filter: blur(15px);
                transform: translateY(100%);
            }
            100% { 
                opacity: 1;
                filter: blur(0);
                transform: translateY(0);
            }
        }

        @keyframes lPanelSlideDown {
            0% { 
                opacity: 1;
                filter: blur(0);
                transform: translateY(0);
            }
            100% { 
                opacity: 0;
                filter: blur(15px);
                transform: translateY(100%);
            }
        }

        /* ===== УТИЛИТЫ ===== */
        
        .l-blur-in {
            animation: lBlurIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        
        .l-blur-out {
            animation: lBlurOut 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        
        .l-blur-slide-up {
            animation: lBlurSlideUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        
        .l-blur-slide-down {
            animation: lBlurSlideDown 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        
        .l-blur-slide-left {
            animation: lBlurSlideLeft 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        
        .l-blur-slide-right {
            animation: lBlurSlideRight 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        
        .l-blur-zoom-in {
            animation: lBlurZoomIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        
        .l-blur-zoom-out {
            animation: lBlurZoomOut 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        
        .l-blur-pulse {
            animation: lBlurPulse 2s ease-in-out infinite;
        }
        
        .l-blur-fade-in {
            animation: lBlurFadeIn 0.4s ease forwards;
        }
        
        .l-blur-fade-out {
            animation: lBlurFadeOut 0.4s ease forwards;
        }
        
        .l-modal-open {
            animation: lModalOpen 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        
        .l-modal-close {
            animation: lModalClose 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        
        .l-icon-launch {
            animation: lIconLaunch 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        
        .l-icon-landing {
            animation: lIconLanding 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        
        .l-panel-slide-up {
            animation: lPanelSlideUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        
        .l-panel-slide-down {
            animation: lPanelSlideDown 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        /* ===== BACKDROP С РАЗМЫТИЕМ ===== */
        
        .l-backdrop-blur {
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            background: rgba(0, 0, 0, 0.4);
        }

        .l-backdrop-blur-light {
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            background: rgba(0, 0, 0, 0.2);
        }

        /* ===== ПЛАВНЫЕ ПЕРЕХОДЫ ===== */
        
        .l-smooth {
            transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
        }
        
        .l-smooth-fast {
            transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
        }
        
        .l-smooth-slow {
            transition: all 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }

        /* ===== ЭФФЕКТЫ ПРИ НАВЕДЕНИИ ===== */
        
        .l-hover-blur {
            transition: filter 0.3s ease, transform 0.3s ease;
        }
        
        .l-hover-blur:hover {
            filter: blur(1px);
            transform: scale(1.02);
        }
        
        .l-hover-lift {
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        .l-hover-lift:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
        }

        /* ===== ЭФФЕКТЫ НАЖАТИЯ ===== */
        
        .l-press {
            transition: transform 0.1s ease, filter 0.1s ease;
        }
        
        .l-press:active {
            transform: scale(0.96);
            filter: blur(0.5px);
        }
    `;

    // ============================================
    // 2. ВНЕДРЕНИЕ СТИЛЕЙ
    // ============================================
    function injectStyles() {
        if (document.getElementById('l-styles')) return;
        const style = document.createElement('style');
        style.id = 'l-styles';
        style.textContent = styles;
        document.head.appendChild(style);
        console.log('[L] Стили анимаций внедрены');
    }

    // ============================================
    // 3. API АНИМАЦИЙ
    // ============================================
    const L = {
        /**
         * Анимировать элемент с размытием
         * @param {HTMLElement} el - элемент
         * @param {string} animation - название анимации ('in', 'out', 'slideUp', 'slideDown', 'zoomIn', 'zoomOut', 'fadeIn', 'fadeOut')
         * @param {number} duration - длительность в мс
         * @returns {Promise} - промис завершения
         */
        animate(el, animation = 'in', duration = 500) {
            return new Promise((resolve) => {
                if (!el) { resolve(); return; }

                const classMap = {
                    'in': 'l-blur-in',
                    'out': 'l-blur-out',
                    'slideUp': 'l-blur-slide-up',
                    'slideDown': 'l-blur-slide-down',
                    'slideLeft': 'l-blur-slide-left',
                    'slideRight': 'l-blur-slide-right',
                    'zoomIn': 'l-blur-zoom-in',
                    'zoomOut': 'l-blur-zoom-out',
                    'fadeIn': 'l-blur-fade-in',
                    'fadeOut': 'l-blur-fade-out',
                    'modalOpen': 'l-modal-open',
                    'modalClose': 'l-modal-close',
                    'iconLaunch': 'l-icon-launch',
                    'iconLanding': 'l-icon-landing',
                    'panelSlideUp': 'l-panel-slide-up',
                    'panelSlideDown': 'l-panel-slide-down'
                };

                const className = classMap[animation] || classMap['in'];

                // Удаляем все классы анимаций
                el.classList.forEach(cls => {
                    if (cls.startsWith('l-blur-') || cls.startsWith('l-modal-') || 
                        cls.startsWith('l-icon-') || cls.startsWith('l-panel-')) {
                        el.classList.remove(cls);
                    }
                });

                // Добавляем класс анимации
                el.classList.add(className);

                // Форсируем reflow
                void el.offsetWidth;

                // Устанавливаем длительность через inline-стиль
                el.style.animationDuration = duration + 'ms';

                setTimeout(() => {
                    el.classList.remove(className);
                    el.style.animationDuration = '';
                    resolve();
                }, duration);
            });
        },

        /**
         * Показать элемент с анимацией размытия
         */
        show(el, animation = 'in', duration = 500) {
            if (!el) return Promise.resolve();
            el.style.display = 'block';
            el.style.opacity = '0';
            return L.animate(el, animation, duration).then(() => {
                el.style.opacity = '1';
            });
        },

        /**
         * Скрыть элемент с анимацией размытия
         */
        hide(el, animation = 'out', duration = 400) {
            if (!el) return Promise.resolve();
            return L.animate(el, animation, duration).then(() => {
                el.style.display = 'none';
                el.style.opacity = '';
            });
        },

        /**
         * Создать модальное окно с размытием фона
         */
        createModal(options = {}) {
            const {
                title = '',
                content = '',
                buttons = [],
                closable = true,
                onClose = null,
                width = '400px'
            } = options;

            // Backdrop
            const backdrop = document.createElement('div');
            backdrop.className = 'l-modal-backdrop';
            backdrop.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 999998;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.3s ease;
                backdrop-filter: blur(0px);
                -webkit-backdrop-filter: blur(0px);
                background: rgba(0, 0, 0, 0);
            `;

            // Modal
            const modal = document.createElement('div');
            modal.className = 'l-modal';
            modal.style.cssText = `
                background: #ffffff;
                padding: 30px 24px 24px;
                min-width: ${width};
                max-width: 90%;
                font-family: 'ST-SimpleSquare', monospace;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                transform: scale(0.9);
                opacity: 0;
                transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
                border: 2px solid #1a1a1a;
            `;

            if (title) {
                const titleEl = document.createElement('div');
                titleEl.className = 'l-modal-title';
                titleEl.style.cssText = `
                    font-size: 18px;
                    font-weight: 600;
                    color: #1a1a1a;
                    margin-bottom: 16px;
                    text-align: center;
                    letter-spacing: -0.3px;
                `;
                titleEl.textContent = title;
                modal.appendChild(titleEl);
            }

            if (content) {
                const contentEl = document.createElement('div');
                contentEl.className = 'l-modal-content';
                contentEl.style.cssText = `
                    margin-bottom: 20px;
                    color: #333;
                    font-size: 14px;
                    line-height: 1.5;
                `;
                if (typeof content === 'string') {
                    contentEl.innerHTML = content;
                } else {
                    contentEl.appendChild(content);
                }
                modal.appendChild(contentEl);
            }

            if (buttons.length > 0) {
                const buttonsEl = document.createElement('div');
                buttonsEl.className = 'l-modal-buttons';
                buttonsEl.style.cssText = `
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                    flex-wrap: wrap;
                `;

                buttons.forEach(btn => {
                    const button = document.createElement('button');
                    button.textContent = btn.text || 'OK';
                    button.style.cssText = `
                        padding: 10px 24px;
                        border: 2px solid ${btn.primary ? '#cc0000' : '#e0e0e0'};
                        background: ${btn.primary ? '#cc0000' : 'none'};
                        color: ${btn.primary ? '#ffffff' : '#333'};
                        cursor: pointer;
                        font-family: 'ST-SimpleSquare', monospace;
                        font-size: 14px;
                        transition: all 0.2s ease;
                    `;
                    button.addEventListener('mouseenter', () => {
                        if (btn.primary) {
                            button.style.background = '#990000';
                        } else {
                            button.style.background = '#f0f0f0';
                        }
                    });
                    button.addEventListener('mouseleave', () => {
                        if (btn.primary) {
                            button.style.background = '#cc0000';
                        } else {
                            button.style.background = 'none';
                        }
                    });
                    button.addEventListener('click', () => {
                        if (btn.onClick) btn.onClick();
                        if (btn.close !== false) {
                            closeModal();
                        }
                    });
                    buttonsEl.appendChild(button);
                });

                modal.appendChild(buttonsEl);
            }

            backdrop.appendChild(modal);
            document.body.appendChild(backdrop);

            // Форсируем reflow
            void backdrop.offsetWidth;

            // Анимация появления с размытием
            requestAnimationFrame(() => {
                backdrop.style.opacity = '1';
                backdrop.style.backdropFilter = 'blur(20px)';
                backdrop.style.webkitBackdropFilter = 'blur(20px)';
                backdrop.style.background = 'rgba(0, 0, 0, 0.4)';
                modal.style.transform = 'scale(1)';
                modal.style.opacity = '1';
            });

            // Функция закрытия
            function closeModal() {
                backdrop.style.opacity = '0';
                backdrop.style.backdropFilter = 'blur(0px)';
                backdrop.style.webkitBackdropFilter = 'blur(0px)';
                backdrop.style.background = 'rgba(0, 0, 0, 0)';
                modal.style.transform = 'scale(0.9)';
                modal.style.opacity = '0';
                
                setTimeout(() => {
                    backdrop.remove();
                    if (onClose) onClose();
                }, 400);
            }

            // Закрытие по клику на backdrop
            if (closable) {
                backdrop.addEventListener('click', (e) => {
                    if (e.target === backdrop) {
                        closeModal();
                    }
                });

                // Закрытие по ESC
                const onEsc = (e) => {
                    if (e.key === 'Escape') {
                        closeModal();
                        document.removeEventListener('keydown', onEsc);
                    }
                };
                document.addEventListener('keydown', onEsc);
            }

            return {
                element: modal,
                backdrop: backdrop,
                close: closeModal
            };
        },

        /**
         * Показать уведомление с размытием
         */
        notify(message, options = {}) {
            const {
                duration = 3000,
                type = 'info',
                position = 'bottom'
            } = options;

            const colors = {
                info: '#333333',
                success: '#4CAF50',
                error: '#cc0000',
                warning: '#ff9800'
            };

            const notification = document.createElement('div');
            notification.className = 'l-notification';
            notification.style.cssText = `
                position: fixed;
                ${position === 'bottom' ? 'bottom: 30px' : 'top: 30px'};
                left: 50%;
                transform: translateX(-50%) translateY(${position === 'bottom' ? '20px' : '-20px'});
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
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
            `;
            notification.textContent = message;
            document.body.appendChild(notification);

            // Анимация появления
            requestAnimationFrame(() => {
                notification.style.opacity = '1';
                notification.style.filter = 'blur(0)';
                notification.style.transform = 'translateX(-50%) translateY(0)';
            });

            // Анимация исчезновения
            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.filter = 'blur(10px)';
                notification.style.transform = `translateX(-50%) translateY(${position === 'bottom' ? '20px' : '-20px'})`;
                setTimeout(() => notification.remove(), 400);
            }, duration);

            return notification;
        },

        /**
         * Переход между двумя элементами с размытием
         */
        transition(fromEl, toEl, options = {}) {
            const {
                duration = 500,
                fromAnimation = 'blurOut',
                toAnimation = 'blurIn'
            } = options;

            return new Promise(async (resolve) => {
                // Скрываем fromEl
                if (fromEl) {
                    await L.animate(fromEl, 'fadeOut', duration / 2);
                    fromEl.style.display = 'none';
                }

                // Показываем toEl
                if (toEl) {
                    toEl.style.display = 'block';
                    toEl.style.opacity = '0';
                    await L.animate(toEl, 'fadeIn', duration / 2);
                    toEl.style.opacity = '1';
                }

                resolve();
            });
        },

        /**
         * Пульсация элемента с размытием
         */
        pulse(el, options = {}) {
            const { duration = 2000, repeat = Infinity } = options;
            if (!el) return;
            el.classList.add('l-blur-pulse');
            el.style.animationDuration = duration + 'ms';
            el.style.animationIterationCount = repeat === Infinity ? 'infinite' : repeat;
            return () => {
                el.classList.remove('l-blur-pulse');
                el.style.animationDuration = '';
                el.style.animationIterationCount = '';
            };
        },

        /**
         * Утилита: добавить размытие к элементу с анимацией
         */
        blurIn(el, duration = 500) {
            if (!el) return Promise.resolve();
            el.style.filter = 'blur(20px)';
            el.style.opacity = '0';
            el.style.transition = `filter ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
            
            void el.offsetWidth;
            
            return new Promise((resolve) => {
                requestAnimationFrame(() => {
                    el.style.filter = 'blur(0)';
                    el.style.opacity = '1';
                    setTimeout(resolve, duration);
                });
            });
        },

        blurOut(el, duration = 400) {
            if (!el) return Promise.resolve();
            el.style.transition = `filter ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
            
            return new Promise((resolve) => {
                requestAnimationFrame(() => {
                    el.style.filter = 'blur(20px)';
                    el.style.opacity = '0';
                    setTimeout(resolve, duration);
                });
            });
        },

        /**
         * Размыть фон (backdrop-filter)
         */
        blurBackdrop(el, amount = 20, duration = 300) {
            if (!el) return Promise.resolve();
            el.style.transition = `backdrop-filter ${duration}ms ease, -webkit-backdrop-filter ${duration}ms ease`;
            
            return new Promise((resolve) => {
                requestAnimationFrame(() => {
                    el.style.backdropFilter = `blur(${amount}px)`;
                    el.style.webkitBackdropFilter = `blur(${amount}px)`;
                    setTimeout(resolve, duration);
                });
            });
        },

        /**
         * Убрать размытие фона
         */
        unblurBackdrop(el, duration = 300) {
            if (!el) return Promise.resolve();
            el.style.transition = `backdrop-filter ${duration}ms ease, -webkit-backdrop-filter ${duration}ms ease`;
            
            return new Promise((resolve) => {
                requestAnimationFrame(() => {
                    el.style.backdropFilter = 'blur(0px)';
                    el.style.webkitBackdropFilter = 'blur(0px)';
                    setTimeout(resolve, duration);
                });
            });
        }
    };

    // ============================================
    // 4. АВТОМАТИЧЕСКОЕ ПРИМЕНЕНИЕ
    // ============================================
    function autoApply() {
        // Применяем плавные переходы к кнопкам
        document.querySelectorAll('.btn, .icon-item, .file-item, button').forEach(el => {
            if (!el.classList.contains('l-smooth-fast')) {
                el.classList.add('l-smooth-fast');
            }
        });
        
        console.log('[L] Автоматические анимации применены');
    }

    // ============================================
    // 5. ЭКСПОРТ И ИНИЦИАЛИЗАЦИЯ
    // ============================================
    
    // Внедряем стили
    injectStyles();

    // Экспортируем API
    window.L = L;
    window.LBlur = L; // Альтернативное название

    // Автоприменение после загрузки DOM
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(autoApply, 100);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(autoApply, 100);
        });
    }

    console.log('[L] ✅ Библиотека анимаций с размытием загружена');
    console.log('[L] Доступные методы:');
    console.log('  L.animate(el, animation, duration)');
    console.log('  L.show(el, animation, duration)');
    console.log('  L.hide(el, animation, duration)');
    console.log('  L.createModal({title, content, buttons})');
    console.log('  L.notify(message, {duration, type})');
    console.log('  L.transition(fromEl, toEl)');
    console.log('  L.pulse(el, {duration})');
    console.log('  L.blurIn(el, duration)');
    console.log('  L.blurOut(el, duration)');
    console.log('  L.blurBackdrop(el, amount)');
    console.log('  L.unblurBackdrop(el)');

})();