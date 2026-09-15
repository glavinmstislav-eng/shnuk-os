// onboarding.js — Первоначальное обучение

(function() {
    'use strict';

    const STORAGE_KEY = 'shnuk_onboarding_done';

    let startOverlay = null;
    let tooltip = null;
    let finalCard = null;
    let stepIndex = 0;
    let steps = [];
    let actionListener = null;

    function isDone() {
        try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
        catch(e) { return false; }
    }

    function markDone() {
        try { localStorage.setItem(STORAGE_KEY, 'true'); } catch(e) {}
    }

    function injectStyles() {
        if (document.getElementById('onboardingStyles')) return;
        const style = document.createElement('style');
        style.id = 'onboardingStyles';
        style.textContent = `
            @keyframes obPulse { 0%,100% { transform: translateX(0); } 50% { transform: translateX(8px); } }
            @keyframes obSlideUp {
                from { transform: translateX(-50%) translateY(30px); opacity: 0; filter: blur(10px); }
                to { transform: translateX(-50%) translateY(0); opacity: 1; filter: blur(0); }
            }
            @keyframes obFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes obFadeOut { from { opacity: 1; } to { opacity: 0; } }
            @keyframes obScaleIn {
                from { transform: translate(-50%, -50%) scale(0.9); opacity: 0; filter: blur(20px); }
                to { transform: translate(-50%, -50%) scale(1); opacity: 1; filter: blur(0); }
            }
            @keyframes obTapPulse {
                0%,100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.25); opacity: 0.6; }
            }

            #obStartOverlay {
                position: fixed;
                top: 0; left: 0;
                width: 100%; height: 100%;
                background: #ffffff;
                z-index: 2147483647;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                font-family: 'ST-SimpleSquare', monospace;
                opacity: 0;
                transition: opacity 0.4s ease;
            }
            #obStartOverlay.visible { opacity: 1; }
            #obStartOverlay .ob-logo {
                width: 160px;
                height: 160px;
                object-fit: contain;
                margin-bottom: 60px;
            }
            #obStartOverlay .ob-arrow {
                position: absolute;
                bottom: 80px;
                right: 60px;
                width: 64px;
                height: 64px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                background: #ffffff;
                border: 2px solid #1a1a1a;
                transition: background 0.2s, transform 0.2s;
                animation: obPulse 1.6s ease-in-out infinite;
                -webkit-tap-highlight-color: transparent;
            }
            #obStartOverlay .ob-arrow:hover { background: #f5f5f5; }
            #obStartOverlay .ob-arrow:active { transform: scale(0.94); }
            #obStartOverlay .ob-arrow svg { width: 32px; height: 32px; }

            #obTooltip {
                position: fixed;
                left: 50%;
                bottom: 30px;
                transform: translateX(-50%) translateY(30px);
                width: calc(100% - 32px);
                max-width: 400px;
                background: #141414;
                color: #ffffff;
                border: 2px solid #cc0000;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                padding: 18px 22px;
                z-index: 2147483646;
                font-family: 'ST-SimpleSquare', monospace;
                box-sizing: border-box;
                opacity: 0;
                pointer-events: none;
                isolation: isolate;
            }
            #obTooltip.visible {
                animation: obSlideUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                pointer-events: auto;
            }
            #obTooltip .ob-title {
                font-size: 17px;
                font-weight: 700;
                margin-bottom: 6px;
                color: #ffffff;
            }
            #obTooltip .ob-desc {
                font-size: 13px;
                line-height: 1.5;
                color: #dddddd;
                margin-bottom: 12px;
            }
            #obTooltip .ob-hint {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                color: #ff6666;
                font-weight: 600;
                letter-spacing: 0.5px;
                padding: 6px 12px;
                border: 2px dashed #cc0000;
                background: rgba(204, 0, 0, 0.15);
            }
            #obTooltip .ob-hint .dot {
                width: 8px; height: 8px;
                border-radius: 50%;
                background: #cc0000;
                animation: obTapPulse 1.2s ease-in-out infinite;
                flex-shrink: 0;
            }
            #obTooltip .ob-dots {
                display: flex;
                gap: 6px;
                margin-top: 10px;
                justify-content: center;
            }
            #obTooltip .ob-dot {
                width: 6px; height: 6px;
                border-radius: 50%;
                background: #555;
                transition: background 0.3s, transform 0.3s;
            }
            #obTooltip .ob-dot.active {
                background: #cc0000;
                transform: scale(1.3);
            }
            #obTooltip .ob-skip {
                position: absolute;
                top: 8px; right: 12px;
                background: none;
                border: none;
                cursor: pointer;
                font-size: 11px;
                color: #888;
                font-family: 'ST-SimpleSquare', monospace;
                padding: 4px 8px;
            }
            #obTooltip .ob-skip:hover { color: #cc0000; }

            #obFinalCard {
                position: fixed;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%) scale(0.9);
                width: calc(100% - 40px);
                max-width: 400px;
                background: #ffffff;
                border: 2px solid #cc0000;
                box-shadow: 0 20px 60px rgba(0,0,0,0.35);
                padding: 40px 24px;
                z-index: 2147483646;
                text-align: center;
                font-family: 'ST-SimpleSquare', monospace;
                color: #1a1a1a;
                box-sizing: border-box;
                opacity: 0;
                pointer-events: none;
                isolation: isolate;
            }
            #obFinalCard.visible {
                animation: obScaleIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                pointer-events: auto;
            }
            #obFinalCard .ob-final-title {
                font-size: 26px;
                font-weight: 700;
                margin-bottom: 10px;
            }
            #obFinalCard .ob-final-desc {
                font-size: 14px;
                line-height: 1.6;
                color: #555;
                margin-bottom: 24px;
            }
            #obFinalCard .ob-final-btn {
                padding: 14px 40px;
                border: 2px solid #cc0000;
                background: #cc0000;
                color: #ffffff;
                cursor: pointer;
                font-family: 'ST-SimpleSquare', monospace;
                font-size: 15px;
                font-weight: 600;
                transition: all 0.2s;
                -webkit-tap-highlight-color: transparent;
            }
            #obFinalCard .ob-final-btn:hover { background: #990000; }
            #obFinalCard .ob-final-btn:active { transform: scale(0.96); }
        `;
        document.head.appendChild(style);
    }

    function buildStartOverlay() {
        injectStyles();
        if (startOverlay) return;
        startOverlay = document.createElement('div');
        startOverlay.id = 'obStartOverlay';
        startOverlay.innerHTML = `
            <img src="icoon.png" alt="Shnuk OS" class="ob-logo" onerror="this.style.display='none'" />
            <button class="ob-arrow" id="obStartArrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                </svg>
            </button>
        `;
        document.body.appendChild(startOverlay);

        document.getElementById('obStartArrow').addEventListener('click', function() {
            startOverlay.style.opacity = '0';
            setTimeout(function() {
                if (startOverlay && startOverlay.parentNode) {
                    startOverlay.parentNode.removeChild(startOverlay);
                }
                startOverlay = null;
                startSteps();
            }, 400);
        });

        requestAnimationFrame(function() {
            if (startOverlay) startOverlay.classList.add('visible');
        });
    }

    function buildSteps() {
        steps = [
            {
                id: 'menu',
                title: 'Меню приложений',
                desc: 'Свайпните снизу вверх по рабочему столу, чтобы открыть список всех приложений.',
                hint: 'Свайпните вверх'
            },
            {
                id: 'notif',
                title: 'Шторка уведомлений',
                desc: 'Свайпните сверху вниз по рабочему столу, чтобы открыть шторку быстрых настроек.',
                hint: 'Свайпните вниз'
            },
            {
                id: 'brightness',
                title: 'Яркость',
                desc: 'Ползунок яркости в шторке управляет затемнением экрана. Подвигайте ползунок.',
                hint: 'Подвигайте ползунок'
            },
            {
                id: 'buttons',
                title: 'Быстрые кнопки',
                desc: 'Четыре кнопки в шторке: анонимный режим, оптимизация, настройки, выключение. Нажмите на любую.',
                hint: 'Нажмите на кнопку'
            },
            {
                id: 'livebar',
                title: 'Live Bar',
                desc: 'Верхняя полоса показывает время. Когда работает таймер, секундомер, будильник или запись звука — появится информация. Нажмите на неё, чтобы открыть шторку.',
                hint: 'Нажмите на Live Bar'
            }
        ];
    }

    function ensureTooltip() {
        injectStyles();
        if (tooltip) return tooltip;
        tooltip = document.createElement('div');
        tooltip.id = 'obTooltip';
        document.body.appendChild(tooltip);
        return tooltip;
    }

    function renderTooltip() {
        const step = steps[stepIndex];
        const el = ensureTooltip();
        el.innerHTML = `
            <button class="ob-skip" id="obSkip">Пропустить</button>
            <div class="ob-title">${step.title}</div>
            <div class="ob-desc">${step.desc}</div>
            <div class="ob-hint">
                <span class="dot"></span>
                <span>${step.hint}</span>
            </div>
            <div class="ob-dots">
                ${steps.map((_, i) => `<div class="ob-dot${i === stepIndex ? ' active' : ''}"></div>`).join('')}
            </div>
        `;
        el.classList.remove('visible');
        void el.offsetWidth;
        el.classList.add('visible');

        const skip = el.querySelector('#obSkip');
        if (skip) {
            skip.addEventListener('click', function() {
                skipAll();
            });
        }
    }

    function clearActionListener() {
        if (actionListener) {
            try { actionListener(); } catch(e) {}
            actionListener = null;
        }
    }

    function renderStep() {
        clearActionListener();
        renderTooltip();
        setTimeout(function() {
            attachStepAction(steps[stepIndex].id);
        }, 50);
    }

    function attachStepAction(stepId) {
        if (stepId === 'menu') {
            const check = function() {
                const bp = document.getElementById('bottomPanel');
                if (bp && bp.classList.contains('visible')) {
                    clearActionListener();
                    setTimeout(completeStep, 800);
                    return true;
                }
                return false;
            };
            if (check()) return;
            const obs = new MutationObserver(function() { check(); });
            obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
            actionListener = function() { obs.disconnect(); };

        } else if (stepId === 'notif') {
            const check = function() {
                const bp = document.getElementById('quickPanelBackdrop');
                if (bp && bp.style.opacity === '1') {
                    clearActionListener();
                    setTimeout(completeStep, 800);
                    return true;
                }
                return false;
            };
            if (check()) return;
            const obs = new MutationObserver(function() { check(); });
            obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style'] });
            actionListener = function() { obs.disconnect(); };

        } else if (stepId === 'brightness') {
            const tryAttach = function() {
                const slider = document.getElementById('quickBrightness');
                if (!slider) return false;
                let done = false;
                const onInput = function() {
                    if (done) return;
                    done = true;
                    slider.removeEventListener('input', onInput);
                    actionListener = null;
                    setTimeout(completeStep, 600);
                };
                slider.addEventListener('input', onInput);
                actionListener = function() { slider.removeEventListener('input', onInput); };
                return true;
            };
            if (tryAttach()) return;
            const obs = new MutationObserver(function() {
                if (tryAttach()) obs.disconnect();
            });
            obs.observe(document.body, { childList: true, subtree: true });
            actionListener = function() { obs.disconnect(); };

        } else if (stepId === 'buttons') {
            const handler = function(e) {
                if (e.target.closest && e.target.closest('.quick-btn')) {
                    document.removeEventListener('click', handler, true);
                    actionListener = null;
                    setTimeout(completeStep, 600);
                }
            };
            document.addEventListener('click', handler, true);
            actionListener = function() { document.removeEventListener('click', handler, true); };

        } else if (stepId === 'livebar') {
            const handler = function(e) {
                const bar = e.target.closest && e.target.closest('#liveBar');
                if (!bar) return;
                setTimeout(function() {
                    const panel = document.getElementById('quickPanel');
                    if (panel && panel.style.opacity === '1') {
                        document.removeEventListener('click', handler, true);
                        actionListener = null;
                        setTimeout(completeStep, 800);
                    }
                }, 400);
            };
            document.addEventListener('click', handler, true);
            actionListener = function() { document.removeEventListener('click', handler, true); };
        }
    }

    function completeStep() {
        clearActionListener();
        if (stepIndex >= steps.length - 1) {
            showFinalCard();
            return;
        }
        stepIndex++;
        renderStep();
    }

    function showFinalCard() {
        clearActionListener();
        if (tooltip && tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
        tooltip = null;

        injectStyles();
        finalCard = document.createElement('div');
        finalCard.id = 'obFinalCard';
        finalCard.innerHTML = `
            <div style="width:80px;height:80px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                <svg viewBox="0 0 80 80" fill="none" width="80" height="80">
                    <circle cx="40" cy="40" r="34" stroke="#cc0000" stroke-width="3"/>
                    <path d="M25 40 L35 50 L55 30" stroke="#cc0000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>
            <div class="ob-final-title">Готово!</div>
            <div class="ob-final-desc">Вы освоили основные жесты и элементы системы.</div>
            <button class="ob-final-btn" id="obFinalBtn">Начать работу</button>
        `;
        document.body.appendChild(finalCard);

        requestAnimationFrame(function() {
            if (finalCard) finalCard.classList.add('visible');
        });

        document.getElementById('obFinalBtn').addEventListener('click', finish);
    }

    function skipAll() {
        finish();
    }

    function finish() {
        clearActionListener();
        if (tooltip && tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
        tooltip = null;
        if (finalCard) {
            finalCard.classList.remove('visible');
            setTimeout(function() {
                if (finalCard && finalCard.parentNode) finalCard.parentNode.removeChild(finalCard);
                finalCard = null;
            }, 400);
        }
        if (startOverlay && startOverlay.parentNode) {
            startOverlay.parentNode.removeChild(startOverlay);
            startOverlay = null;
        }
        markDone();
    }

    function startSteps() {
        buildSteps();
        stepIndex = 0;
        renderStep();
    }

    function show() {
        buildStartOverlay();
    }

    window.Onboarding = {
        isDone: isDone,
        show: show,
        reset: function() {
            try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
        }
    };

})();