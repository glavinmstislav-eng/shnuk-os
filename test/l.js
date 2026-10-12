// l.js

(function() {
    'use strict';

    const styles = `
        @keyframes lBlurIn {
            0% { opacity: 0; filter: blur(20px); transform: scale(0.95); }
            100% { opacity: 1; filter: blur(0); transform: scale(1); }
        }
        @keyframes lBlurOut {
            0% { opacity: 1; filter: blur(0); transform: scale(1); }
            100% { opacity: 0; filter: blur(20px); transform: scale(0.95); }
        }
        @keyframes lBlurFadeIn {
            0% { opacity: 0; filter: blur(10px); }
            100% { opacity: 1; filter: blur(0); }
        }
        @keyframes lBlurFadeOut {
            0% { opacity: 1; filter: blur(0); }
            100% { opacity: 0; filter: blur(10px); }
        }
        .l-blur-in { animation: lBlurIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        .l-blur-out { animation: lBlurOut 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        .l-blur-fade-in { animation: lBlurFadeIn 0.4s ease forwards; }
        .l-blur-fade-out { animation: lBlurFadeOut 0.4s ease forwards; }
    `;

    function injectStyles() {
        if (document.getElementById('l-styles')) return;
        const style = document.createElement('style');
        style.id = 'l-styles';
        style.textContent = styles;
        document.head.appendChild(style);
    }

    const audioCache = {};
    let soundEnabled = true;

    function playSound(name) {
        if (!soundEnabled) return;
        if (!name) return;
        try {
            let audio = audioCache[name];
            if (!audio) {
                audio = new Audio(name);
                audio.preload = 'auto';
                audio.volume = 0.7;
                audioCache[name] = audio;
            }
            try { audio.currentTime = 0; } catch(e) {}
            const p = audio.play();
            if (p && typeof p.catch === 'function') p.catch(function() {});
        } catch(e) {}
    }

    function setSoundEnabled(on) { soundEnabled = !!on; }
    function isSoundEnabled() { return soundEnabled; }

    const L = {
        blurIn(el, duration) {
            if (!el) return Promise.resolve();
            duration = duration || 500;
            el.style.transition = `filter ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
            el.style.filter = 'blur(20px)';
            el.style.opacity = '0';
            return new Promise((resolve) => {
                requestAnimationFrame(() => {
                    el.style.filter = 'blur(0)';
                    el.style.opacity = '1';
                    setTimeout(resolve, duration);
                });
            });
        },
        blurOut(el, duration) {
            if (!el) return Promise.resolve();
            duration = duration || 400;
            el.style.transition = `filter ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
            return new Promise((resolve) => {
                requestAnimationFrame(() => {
                    el.style.filter = 'blur(20px)';
                    el.style.opacity = '0';
                    setTimeout(resolve, duration);
                });
            });
        },
        blurBackdrop(el, amount, duration) {
            if (!el) return Promise.resolve();
            amount = amount || 20;
            duration = duration || 300;
            el.style.transition = `backdrop-filter ${duration}ms ease, -webkit-backdrop-filter ${duration}ms ease`;
            return new Promise((resolve) => {
                requestAnimationFrame(() => {
                    el.style.backdropFilter = `blur(${amount}px)`;
                    el.style.webkitBackdropFilter = `blur(${amount}px)`;
                    setTimeout(resolve, duration);
                });
            });
        },
        unblurBackdrop(el, duration) {
            if (!el) return Promise.resolve();
            duration = duration || 300;
            el.style.transition = `backdrop-filter ${duration}ms ease, -webkit-backdrop-filter ${duration}ms ease`;
            return new Promise((resolve) => {
                requestAnimationFrame(() => {
                    el.style.backdropFilter = 'blur(0px)';
                    el.style.webkitBackdropFilter = 'blur(0px)';
                    setTimeout(resolve, duration);
                });
            });
        },
        playSound: playSound,
        setSoundEnabled: setSoundEnabled,
        isSoundEnabled: isSoundEnabled,
        notify: function(message, options) {
            if (window.Win && window.Win.notify) {
                return window.Win.notify(message, options);
            }
            return null;
        }
    };

    injectStyles();

    window.L = L;
    window.LBlur = L;
    window.playSound = playSound;

})();