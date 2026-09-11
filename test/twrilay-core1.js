// twirlay-core1.js — Максимально оптимизированное ядро Shnuk OS

(function() {
    'use strict';

    console.log('[Twirlay Core] Загрузка ультраоптимизированного ядра v2.0...');

    // ============================================
    // 1. ТИПЫ ДАННЫХ И КОНСТАНТЫ
    // ============================================
    const CORE_VERSION = '2.0.0';
    const STORAGE_PREFIX = 'shnuk_';
    const DESKTOP_KEY = STORAGE_PREFIX + 'desktop';
    const WIDGET_KEY = STORAGE_PREFIX + 'widget';
    const WALLPAPER_KEY = STORAGE_PREFIX + 'wallpaper';

    // ============================================
    // 2. УЛЬТРАБЫСТРЫЙ DOM ДОСТУП (кэширование)
    // ============================================
    const _domCache = new Map();
    const _queryCache = new Map();

    const $ = (id) => {
        if (_domCache.has(id)) return _domCache.get(id);
        const el = document.getElementById(id);
        if (el) _domCache.set(id, el);
        return el;
    };

    const qs = (selector, context = document) => {
        const key = selector + (context === document ? '' : ':' + context.id);
        if (_queryCache.has(key)) return _queryCache.get(key);
        const el = context.querySelector(selector);
        if (el) _queryCache.set(key, el);
        return el;
    };

    // Пакетное обновление стилей (без перерисовки)
    const batchStyles = (el, styles) => {
        for (const [key, value] of Object.entries(styles)) {
            el.style[key] = value;
        }
    };

    // ============================================
    // 3. ОПТИМИЗИРОВАННОЕ ХРАНИЛИЩЕ
    // ============================================
    const _storageCache = new Map();
    const _storageDirty = new Set();

    const storage = {
        get: (key, def = null) => {
            if (_storageCache.has(key)) return _storageCache.get(key);
            try {
                const data = localStorage.getItem(STORAGE_PREFIX + key);
                const value = data ? JSON.parse(data) : def;
                _storageCache.set(key, value);
                return value;
            } catch { return def; }
        },
        set: (key, value) => {
            try {
                _storageCache.set(key, value);
                _storageDirty.add(key);
                // Асинхронная запись для избегания блокировки
                if (!storage._writeScheduled) {
                    storage._writeScheduled = true;
                    requestAnimationFrame(() => {
                        for (const k of _storageDirty) {
                            if (_storageCache.has(k)) {
                                localStorage.setItem(STORAGE_PREFIX + k, JSON.stringify(_storageCache.get(k)));
                            }
                        }
                        _storageDirty.clear();
                        storage._writeScheduled = false;
                    });
                }
                return true;
            } catch { return false; }
        },
        _writeScheduled: false,
        remove: (key) => {
            _storageCache.delete(key);
            localStorage.removeItem(STORAGE_PREFIX + key);
        },
        // Мгновенная запись (для критических данных)
        setImmediate: (key, value) => {
            try {
                _storageCache.set(key, value);
                localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
                return true;
            } catch { return false; }
        }
    };

    // ============================================
    // 4. УЛЬТРАБЫСТРЫЙ РЕНДЕРИНГ (виртуальный DOM)
    // ============================================
    const _fragmentPool = [];

    function getFragment() {
        return _fragmentPool.pop() || document.createDocumentFragment();
    }

    function recycleFragment(fragment) {
        if (fragment && _fragmentPool.length < 20) {
            while (fragment.firstChild) {
                fragment.removeChild(fragment.firstChild);
            }
            _fragmentPool.push(fragment);
        }
    }

    const render = {
        // Создание элемента с минимальными накладными расходами
        el: (tag, attrs = {}, children = []) => {
            const el = document.createElement(tag);
            if (attrs) {
                for (const [key, value] of Object.entries(attrs)) {
                    if (key === 'style' && typeof value === 'object') {
                        batchStyles(el, value);
                    } else if (key === 'text') {
                        el.textContent = value;
                    } else if (key === 'html') {
                        el.innerHTML = value;
                    } else if (key.startsWith('on')) {
                        el.addEventListener(key.slice(2), value);
                    } else if (key === 'className') {
                        el.className = value;
                    } else {
                        el.setAttribute(key, value);
                    }
                }
            }
            if (children && children.length) {
                for (const child of children) {
                    if (typeof child === 'string') {
                        el.appendChild(document.createTextNode(child));
                    } else if (child) {
                        el.appendChild(child);
                    }
                }
            }
            return el;
        },

        // Быстрая замена содержимого с переиспользованием фрагментов
        replace: (container, newContent) => {
            if (!container) return;
            const fragment = getFragment();
            
            if (Array.isArray(newContent)) {
                for (const item of newContent) {
                    if (item) fragment.appendChild(item);
                }
            } else if (newContent) {
                fragment.appendChild(newContent);
            }

            // Очищаем контейнер с минимальными затратами
            while (container.firstChild) {
                const child = container.firstChild;
                if (child._interval) {
                    clearInterval(child._interval);
                }
                container.removeChild(child);
            }
            
            container.appendChild(fragment);
            recycleFragment(fragment);
        },

        // Очистка с утилизацией
        clear: (container) => {
            if (!container) return;
            while (container.firstChild) {
                const child = container.firstChild;
                if (child._interval) {
                    clearInterval(child._interval);
                }
                container.removeChild(child);
            }
        }
    };

    // ============================================
    // 5. УПРАВЛЕНИЕ ПРИЛОЖЕНИЯМИ (кэширование + предзагрузка)
    // ============================================
    const AppManager = {
        _apps: [],
        _desktop: [],
        _loaded: new Set(),
        _cache: new Map(),
        _loading: new Set(),
        _preloaded: false,

        init: (appList) => {
            AppManager._apps = appList || [];
            // Кэшируем приложения для быстрого доступа
            for (const app of AppManager._apps) {
                AppManager._cache.set(app.id, app);
                // Предзагружаем иконки в память
                if (app.icon) {
                    const img = new Image();
                    img.src = app.icon;
                }
            }
            
            AppManager._desktop = storage.get(DESKTOP_KEY) || [];
            if (AppManager._desktop.length === 0 && AppManager._apps.length > 0) {
                AppManager._desktop = AppManager._apps.slice(0, 4).map(a => a.id);
                storage.setImmediate(DESKTOP_KEY, AppManager._desktop);
            }
            return AppManager;
        },

        get: (id) => AppManager._cache.get(id) || null,
        getAll: () => AppManager._apps,
        getDesktop: () => AppManager._desktop,

        addToDesktop: (id) => {
            if (!AppManager._desktop.includes(id)) {
                AppManager._desktop.push(id);
                storage.setImmediate(DESKTOP_KEY, AppManager._desktop);
                return true;
            }
            return false;
        },

        removeFromDesktop: (id) => {
            const idx = AppManager._desktop.indexOf(id);
            if (idx !== -1) {
                AppManager._desktop.splice(idx, 1);
                storage.setImmediate(DESKTOP_KEY, AppManager._desktop);
                return true;
            }
            return false;
        },

        moveOnDesktop: (fromId, toId) => {
            const fromIdx = AppManager._desktop.indexOf(fromId);
            const toIdx = AppManager._desktop.indexOf(toId);
            if (fromIdx !== -1 && toIdx !== -1) {
                AppManager._desktop.splice(fromIdx, 1);
                AppManager._desktop.splice(toIdx, 0, fromId);
                storage.setImmediate(DESKTOP_KEY, AppManager._desktop);
                return true;
            }
            return false;
        },

        // Мгновенный запуск с предзагрузкой
        launch: (id) => {
            const app = AppManager._cache.get(id);
            if (!app) return false;

            if (AppManager._loaded.has(id)) {
                if (typeof window[app.id + 'Init'] === 'function') {
                    window[app.id + 'Init']();
                }
                return true;
            }

            if (AppManager._loading.has(id)) {
                return true; // Уже загружается
            }

            AppManager._loading.add(id);
            const script = document.createElement('script');
            script.src = app.file;
            script.async = true;
            script.defer = true;
            
            return new Promise((resolve) => {
                script.onload = () => {
                    AppManager._loaded.add(id);
                    AppManager._loading.delete(id);
                    if (typeof window[app.id + 'Init'] === 'function') {
                        window[app.id + 'Init']();
                    }
                    resolve(true);
                };
                script.onerror = () => {
                    AppManager._loading.delete(id);
                    console.warn('[Core] Ошибка загрузки:', app.id);
                    resolve(false);
                };
                document.head.appendChild(script);
            });
        },

        // Фоновая предзагрузка с приоритетом
        preloadAll: () => {
            if (AppManager._preloaded) return;
            AppManager._preloaded = true;

            // Загружаем с приоритетом: сначала рабочий стол, потом остальные
            const priorityApps = AppManager._desktop;
            const otherApps = AppManager._apps.filter(a => !priorityApps.includes(a.id));

            const loadNext = (apps, index = 0) => {
                if (index >= apps.length) return;
                const app = AppManager._cache.get(apps[index]);
                if (app && !AppManager._loaded.has(app.id) && !AppManager._loading.has(app.id)) {
                    const script = document.createElement('script');
                    script.src = app.file;
                    script.async = true;
                    script.defer = true;
                    script.onload = () => {
                        AppManager._loaded.add(app.id);
                        console.log('[Core] Предзагружено:', app.id);
                        loadNext(apps, index + 1);
                    };
                    script.onerror = () => {
                        loadNext(apps, index + 1);
                    };
                    document.head.appendChild(script);
                } else {
                    loadNext(apps, index + 1);
                }
            };

            // Загружаем приоритетные приложения (рабочий стол)
            loadNext(priorityApps, 0);
            // Через небольшую задержку загружаем остальные
            setTimeout(() => loadNext(otherApps, 0), 2000);
        }
    };

    // ============================================
    // 6. УПРАВЛЕНИЕ ВИДЖЕТАМИ (ленивая загрузка)
    // ============================================
    const WidgetManager = {
        _current: null,
        _instance: null,
        _widgets: {},
        _initialized: false,

        register: (id, name, creator) => {
            WidgetManager._widgets[id] = { id, name, create: creator };
        },

        list: () => Object.values(WidgetManager._widgets),

        set: (id) => {
            storage.setImmediate(WIDGET_KEY, id);
            WidgetManager._current = id;
            WidgetManager._apply(id);
        },

        _apply: (id) => {
            if (WidgetManager._instance) {
                if (WidgetManager._instance._interval) {
                    clearInterval(WidgetManager._instance._interval);
                }
                if (WidgetManager._instance._el && WidgetManager._instance._el.parentNode) {
                    WidgetManager._instance._el.parentNode.removeChild(WidgetManager._instance._el);
                }
                WidgetManager._instance = null;
            }

            if (id === 'none' || !WidgetManager._widgets[id]) return;

            const widget = WidgetManager._widgets[id];
            try {
                const result = widget.create();
                if (result && result.element) {
                    let container = document.getElementById('widgetContainer');
                    if (!container) {
                        container = document.createElement('div');
                        container.id = 'widgetContainer';
                        container.style.cssText = `
                            position: absolute;
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
                            pointer-events: none;
                            z-index: 1;
                        `;
                        const panel = document.getElementById('topPanel');
                        if (panel) panel.appendChild(container);
                    }
                    container.appendChild(result.element);
                    WidgetManager._instance = {
                        _el: result.element,
                        _interval: result.interval || null
                    };
                }
            } catch(e) {
                console.error('[Core] Ошибка виджета:', e);
            }
        },

        load: () => {
            if (WidgetManager._initialized) return;
            WidgetManager._initialized = true;
            const saved = storage.get(WIDGET_KEY, 'none');
            WidgetManager._current = saved;
            WidgetManager._apply(saved);
        }
    };

    // ============================================
    // 7. ОПТИМИЗИРОВАННЫЙ РЕНДЕРИНГ ДЕСКТОПА
    // ============================================
    const DesktopRenderer = {
        _container: null,
        _cachedItems: new Map(),
        _dirty: false,

        init: (container) => {
            DesktopRenderer._container = container;
            return DesktopRenderer;
        },

        render: (apps, desktop) => {
            const container = DesktopRenderer._container;
            if (!container) return;

            // Если данные не изменились — пропускаем рендеринг
            const cacheKey = desktop.join(',');
            if (DesktopRenderer._cacheKey === cacheKey && !DesktopRenderer._dirty) {
                return;
            }
            DesktopRenderer._cacheKey = cacheKey;
            DesktopRenderer._dirty = false;

            const fragment = getFragment();

            if (!desktop || desktop.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'color:#888;font-size:14px;text-align:center;width:100%;padding:20px;';
                empty.textContent = 'Нет приложений на рабочем столе';
                fragment.appendChild(empty);
                render.replace(container, fragment);
                return;
            }

            const appMap = new Map();
            for (const app of apps) {
                appMap.set(app.id, app);
            }

            for (const id of desktop) {
                const app = appMap.get(id);
                if (!app) continue;

                let btn = DesktopRenderer._cachedItems.get(id);
                if (!btn) {
                    btn = document.createElement('button');
                    btn.className = 'btn';
                    btn.dataset.id = id;
                    
                    // Стили применяем один раз
                    btn.style.cssText = `
                        width: 80px; height: 80px; background: transparent !important;
                        border: none; cursor: grab; box-shadow: none !important;
                        transition: transform 0.2s ease, opacity 0.2s ease;
                        outline: none; touch-action: none; position: relative;
                        z-index: 1; display: flex; align-items: center;
                        justify-content: center; padding: 0; overflow: hidden;
                        border-radius: 50%;
                    `;

                    const bg = document.createElement('span');
                    bg.className = 'btn-bg visible';
                    bg.style.cssText = `
                        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                        background: #ffffff; opacity: 0.85; z-index: 0;
                        pointer-events: none; border-radius: 50%;
                    `;

                    const img = document.createElement('img');
                    img.src = app.icon || 'default.png';
                    img.alt = app.name;
                    img.style.cssText = 'width:70%;height:70%;object-fit:contain;display:block;z-index:1;position:relative;';

                    btn.appendChild(bg);
                    btn.appendChild(img);
                    DesktopRenderer._cachedItems.set(id, btn);
                }

                // Клонируем для использования в фрагменте (сохраняем обработчики)
                const clone = btn.cloneNode(true);
                clone.addEventListener('click', (e) => {
                    e.stopPropagation();
                    AppManager.launch(id);
                });
                fragment.appendChild(clone);
            }

            render.replace(container, fragment);
            recycleFragment(fragment);
        },

        markDirty: () => {
            DesktopRenderer._dirty = true;
        }
    };

    // ============================================
    // 8. ОПТИМИЗАЦИЯ СКРОЛЛИНГА (акселерация)
    // ============================================
    let _scrollOptimized = false;

    function enableOptimizedScrolling() {
        if (_scrollOptimized) return;
        _scrollOptimized = true;

        // Используем IntersectionObserver для ленивой загрузки контента
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        const el = entry.target;
                        if (el.dataset.lazySrc) {
                            el.src = el.dataset.lazySrc;
                            delete el.dataset.lazySrc;
                        }
                        observer.unobserve(el);
                    }
                }
            }, { rootMargin: '50px' });

            // Наблюдаем за изображениями с lazy-load
            document.querySelectorAll('img[data-lazy]').forEach(img => {
                observer.observe(img);
            });
        }

        // Оптимизация scroll-событий через requestAnimationFrame
        let ticking = false;
        const onScroll = () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const panels = document.querySelectorAll('.bottom-panel, .file-content, .time-content');
                    for (const panel of panels) {
                        // Используем will-change только во время скролла
                        if (panel.scrollTop !== undefined) {
                            panel.style.willChange = 'scroll-position';
                            // Сбрасываем через 100ms после скролла
                            clearTimeout(panel._scrollTimeout);
                            panel._scrollTimeout = setTimeout(() => {
                                panel.style.willChange = 'auto';
                            }, 100);
                        }
                    }
                    ticking = false;
                });
                ticking = true;
            }
        };

        document.addEventListener('scroll', onScroll, { passive: true });
        document.addEventListener('touchmove', onScroll, { passive: true });
    }

    // ============================================
    // 9. ОПТИМИЗАЦИЯ АНИМАЦИЙ (GPU-акселерация)
    // ============================================
    function enableGPUAcceleration() {
        // Добавляем CSS-класс для активации GPU
        const style = document.createElement('style');
        style.textContent = `
            .gpu-accelerated {
                transform: translateZ(0);
                will-change: transform, opacity;
                backface-visibility: hidden;
            }
            .btn, .icon-item, .widget-menu, .app-container {
                transform: translateZ(0);
                backface-visibility: hidden;
            }
        `;
        document.head.appendChild(style);

        // Применяем к существующим элементам
        document.querySelectorAll('.btn, .icon-item, .app-container').forEach(el => {
            if (!el.classList.contains('gpu-accelerated')) {
                el.classList.add('gpu-accelerated');
            }
        });

        // MutationObserver для новых элементов
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) {
                        if (node.matches && node.matches('.btn, .icon-item, .app-container')) {
                            node.classList.add('gpu-accelerated');
                        }
                        // Проверяем дочерние элементы
                        if (node.querySelectorAll) {
                            node.querySelectorAll('.btn, .icon-item, .app-container').forEach(el => {
                                el.classList.add('gpu-accelerated');
                            });
                        }
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ============================================
    // 10. ОПТИМИЗАЦИЯ ПАМЯТИ (сборка мусора)
    // ============================================
    function optimizeMemory() {
        // Периодическая очистка кеша
        setInterval(() => {
            // Очищаем DOM-кеш для несуществующих элементов
            for (const [key, el] of _domCache) {
                if (!document.getElementById(key)) {
                    _domCache.delete(key);
                }
            }
            // Очищаем query-кеш
            for (const [key, el] of _queryCache) {
                if (el && !el.isConnected) {
                    _queryCache.delete(key);
                }
            }
        }, 30000); // Каждые 30 секунд

        // Очистка storage-кеша
        setInterval(() => {
            if (_storageCache.size > 100) {
                // Оставляем только часто используемые ключи
                const keepKeys = ['wallpaper', 'desktop', 'widget', 'files'];
                for (const key of _storageCache.keys()) {
                    if (!keepKeys.includes(key)) {
                        _storageCache.delete(key);
                    }
                }
            }
        }, 60000);
    }

    // ============================================
    // 11. ЭКСПОРТ ЯДРА
    // ============================================
    const Core = {
        version: CORE_VERSION,
        storage: storage,
        render: render,
        AppManager: AppManager,
        WidgetManager: WidgetManager,
        DesktopRenderer: DesktopRenderer,
        $: $,
        qs: qs,
        batchStyles: batchStyles,

        dom: {
            get: (id) => $(id),
            query: (selector, context) => qs(selector, context)
        },

        init: (config = {}) => {
            console.log('[Twirlay Core] Инициализация v' + CORE_VERSION);

            // Регистрируем виджеты
            if (typeof window.createTimeWidget === 'function') {
                WidgetManager.register('analog', 'Часы', window.createTimeWidget);
            }
            if (typeof window.createDigitalTimeWidget === 'function') {
                WidgetManager.register('digital', 'Точные часы', window.createDigitalTimeWidget);
            }

            WidgetManager.load();

            // Включаем оптимизации
            enableOptimizedScrolling();
            enableGPUAcceleration();
            optimizeMemory();

            return Core;
        },

        refreshDesktop: () => {
            const container = document.getElementById('buttonGroup');
            if (container) {
                DesktopRenderer.init(container).render(
                    AppManager.getAll(),
                    AppManager.getDesktop()
                );
            }
        },

        refreshAppMenu: () => {
            const container = document.getElementById('iconGrid');
            if (!container) return;

            const apps = AppManager.getAll();
            const desktop = AppManager.getDesktop();
            const fragment = getFragment();

            if (apps.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'grid-column:1/-1;text-align:center;padding:40px;color:#888;';
                empty.innerHTML = '📭<br>Приложения не найдены';
                fragment.appendChild(empty);
                render.replace(container, fragment);
                return;
            }

            // Оптимизация: используем Map для быстрого поиска
            const desktopSet = new Set(desktop);

            for (const app of apps) {
                const isOnDesktop = desktopSet.has(app.id);
                const div = document.createElement('div');
                div.className = 'icon-item' + (isOnDesktop ? ' in-desktop' : '');
                div.dataset.appId = app.id;
                div.style.cssText = `
                    aspect-ratio:1/1; background:rgba(240,240,240,0.85);
                    display:flex; flex-direction:column; align-items:center;
                    justify-content:center; transition:transform 0.2s ease;
                    cursor:pointer; padding:18px; box-shadow:0 2px 12px rgba(0,0,0,0.08)!important;
                    border:none; outline:none; max-width:80px; max-height:80px;
                    justify-self:center; width:100%; position:relative;
                    border-radius:50%;
                `;

                const img = document.createElement('img');
                img.src = app.icon || 'default.png';
                img.alt = app.name;
                img.style.cssText = 'width:55%;height:55%;object-fit:contain;';

                const label = document.createElement('span');
                label.className = 'icon-label';
                label.style.cssText = 'font-size:9px;color:#333;margin-top:4px;text-align:center;line-height:1.2;font-family:ST-SimpleSquare,monospace;';
                label.textContent = app.name;

                if (isOnDesktop) {
                    const removeBtn = document.createElement('span');
                    removeBtn.className = 'icon-remove-btn';
                    removeBtn.textContent = '✕';
                    removeBtn.style.cssText = `
                        position:absolute; top:-6px; right:-6px; width:22px; height:22px;
                        background:#cc0000; color:#fff; border:2px solid #fff;
                        border-radius:50%; font-size:14px; line-height:18px;
                        text-align:center; cursor:pointer; font-family:ST-SimpleSquare,monospace;
                        display:block;
                    `;
                    removeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (confirm('Удалить приложение "' + app.name + '" с рабочего стола?')) {
                            AppManager.removeFromDesktop(app.id);
                            Core.refreshDesktop();
                            Core.refreshAppMenu();
                        }
                    });
                    div.appendChild(removeBtn);
                } else {
                    const addBtn = document.createElement('span');
                    addBtn.className = 'icon-add-btn';
                    addBtn.textContent = '+';
                    addBtn.style.cssText = `
                        position:absolute; bottom:-8px; right:-8px; width:28px; height:28px;
                        background:#4CAF50; color:#fff; border:2px solid #fff;
                        border-radius:50%; font-size:18px; line-height:24px;
                        text-align:center; cursor:pointer; font-family:ST-SimpleSquare,monospace;
                        display:block;
                    `;
                    addBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        AppManager.addToDesktop(app.id);
                        Core.refreshDesktop();
                        Core.refreshAppMenu();
                    });
                    div.appendChild(addBtn);
                }

                div.appendChild(img);
                div.appendChild(label);

                div.addEventListener('click', () => {
                    AppManager.launch(app.id);
                });

                fragment.appendChild(div);
            }

            render.replace(container, fragment);
            recycleFragment(fragment);
        },

        // Предзагрузка приложений
        preloadApps: () => {
            AppManager.preloadAll();
        },

        // Полная очистка кеша
        clearCache: () => {
            _domCache.clear();
            _queryCache.clear();
            _storageCache.clear();
            _storageDirty.clear();
            DesktopRenderer._cachedItems.clear();
            return Core;
        },

        // Получить статистику
        getStats: () => ({
            domCache: _domCache.size,
            queryCache: _queryCache.size,
            storageCache: _storageCache.size,
            loadedApps: AppManager._loaded.size,
            desktopApps: AppManager._desktop.length,
            totalApps: AppManager._apps.length
        })
    };

    // ============================================
    // 12. ГЛОБАЛЬНЫЙ ЭКСПОРТ
    // ============================================
    window.Twirlay = Core;
    window.Core = Core;

    // Автоматическая оптимизация
    if (document.readyState === 'complete') {
        setTimeout(() => {
            enableOptimizedScrolling();
            enableGPUAcceleration();
        }, 100);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                enableOptimizedScrolling();
                enableGPUAcceleration();
            }, 100);
        });
    }

    console.log('[Twirlay Core] ✅ Загружено v' + CORE_VERSION);

})();