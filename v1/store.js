// store.js

(function() {
    'use strict';

    let isOpen = false;
    let currentTab = 'catalog';
    let loadedCatalog = [];
    let htmlCache = {};

    const INSTALLED_KEY = 'shnuk_installed_apps';

    const CATALOG_ITEMS = [
        {
            id: 'shnuk-site-store',
            name: 'Shnuk Company Site',
            description: 'Официальный сайт',
            author: 'Shnuk Team',
            version: '1.0.0',
            icon: null,
            htmlFile: 'site-store.html',
            isUrl: true,
            url: 'https://glavinmstislav-eng.github.io/shnuk/'
        },
        {
            id: 'shnuk-projects-store',
            name: 'Shnuk Projects',
            description: 'Проекты',
            author: 'Shnuk Team',
            version: '1.0.0',
            icon: null,
            htmlFile: 'projects-store.html',
            isUrl: true,
            url: 'https://glavinmstislav-eng.github.io/shnuk-projects/'
        }
    ];

    function loadFile(filename) {
        return new Promise(function(resolve) {
            if (htmlCache[filename]) {
                resolve(htmlCache[filename]);
                return;
            }
            fetch(filename)
                .then(function(response) {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.text();
                })
                .then(function(content) {
                    htmlCache[filename] = content;
                    resolve(content);
                })
                .catch(function(err) {
                    resolve('');
                });
        });
    }

    function loadCatalog() {
        return Promise.all(
            CATALOG_ITEMS.map(function(item) {
                if (item.isUrl) {
                    return Promise.resolve(Object.assign({}, item, {
                        content: '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0}html,body{width:100%;height:100vh;overflow:hidden}iframe{width:100%;height:100%;border:none;display:block}</style></head><body><iframe src="' + item.url + '" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation"></iframe></body></html>'
                    }));
                }
                
                return loadFile(item.htmlFile).then(function(content) {
                    return Object.assign({}, item, { content: content });
                });
            })
        ).then(function(items) {
            loadedCatalog = items;
            return items;
        });
    }

    function getInstalledApps() {
        try {
            const saved = localStorage.getItem(INSTALLED_KEY);
            if (!saved) return [];
            const parsed = JSON.parse(saved);
            return Array.isArray(parsed) ? parsed : [];
        } catch(e) {
            return [];
        }
    }

    function isInstalled(appId) {
        return getInstalledApps().some(a => a.id === appId);
    }

    function refreshAppMenu() {
        if (typeof window.refreshApps === 'function') {
            window.refreshApps();
        } else if (typeof window.rescanApps === 'function') {
            window.rescanApps();
        } else if (typeof AppScanner !== 'undefined' && AppScanner.rescan) {
            AppScanner.rescan();
        }
    }

    function installApp(appData) {
        try {
            const installed = getInstalledApps();
            const existing = installed.findIndex(a => a.id === appData.id);

            const appRecord = {
                id: appData.id,
                name: appData.name,
                description: appData.description || '',
                author: appData.author || '',
                version: appData.version || '1.0.0',
                icon: appData.icon || null,
                html: appData.content || appData.html,
                installedAt: new Date().toISOString()
            };

            if (existing !== -1) {
                installed[existing] = appRecord;
            } else {
                installed.push(appRecord);
            }

            localStorage.setItem(INSTALLED_KEY, JSON.stringify(installed));

            if (typeof AppScanner !== 'undefined' && AppScanner.rescan) {
                AppScanner.rescan().then(function() {
                    refreshAppMenu();
                });
            } else {
                refreshAppMenu();
            }

            return true;
        } catch(e) {
            return false;
        }
    }

    function uninstallApp(appId) {
        try {
            let installed = getInstalledApps();
            installed = installed.filter(a => a.id !== appId);
            localStorage.setItem(INSTALLED_KEY, JSON.stringify(installed));
            
            if (typeof AppScanner !== 'undefined' && AppScanner.rescan) {
                AppScanner.rescan().then(function() {
                    refreshAppMenu();
                });
            } else {
                refreshAppMenu();
            }

            return true;
        } catch(e) {
            return false;
        }
    }

    function openStore() {
        if (isOpen) {
            const existing = document.getElementById('storeApp');
            if (existing) { 
                existing.style.display = 'flex'; 
                return; 
            }
        }
        createUI();
    }

    function closeStore() {
        isOpen = false;
        const el = document.getElementById('storeApp');
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => {
                el.style.display = 'none';
                el.style.opacity = '1';
            }, 300);
        }
        refreshAppMenu();
    }

    function destroy() {
        isOpen = false;
        const el = document.getElementById('storeApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function createUI() {
        if (document.getElementById('storeApp')) {
            document.getElementById('storeApp').style.display = 'flex';
            return;
        }

        isOpen = true;

        const app = document.createElement('div');
        app.id = 'storeApp';
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
            animation: storeFadeIn 0.3s ease forwards;
        `;

        if (!document.getElementById('storeStyles')) {
            const style = document.createElement('style');
            style.id = 'storeStyles';
            style.textContent = `
                @keyframes storeFadeIn { from { opacity: 0; } to { opacity: 1; } }
                
                .store-header {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 16px 24px; background: #f5f5f5;
                    border-bottom: 2px solid #e0e0e0; flex-shrink: 0;
                }
                .store-header h1 { font-size: 20px; font-weight: 600; margin: 0; }
                .store-header button {
                    background: none; border: 2px solid #cc0000; color: #cc0000;
                    font-size: 18px; padding: 4px 12px; cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                }
                .store-header button:hover { background: #cc0000; color: #fff; }

                .store-tabs {
                    display: flex; background: #f5f5f5;
                    border-bottom: 2px solid #e0e0e0; flex-shrink: 0;
                }
                .store-tabs button {
                    flex: 1; padding: 14px 16px; background: none; border: none;
                    border-bottom: 3px solid transparent; cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace; font-size: 14px;
                    color: #888;
                }
                .store-tabs button.active { color: #cc0000; border-bottom-color: #cc0000; }

                .store-content {
                    flex: 1; overflow-y: auto; padding: 20px 24px;
                }
                .store-content::-webkit-scrollbar { width: 6px; }
                .store-content::-webkit-scrollbar-thumb { background: #ccc; }

                .store-section-title {
                    font-size: 13px; font-weight: 600; color: #888;
                    text-transform: uppercase; letter-spacing: 0.8px;
                    margin-bottom: 16px;
                }

                .app-card {
                    background: #f5f5f5; padding: 20px; margin-bottom: 16px;
                    display: flex; gap: 16px; align-items: flex-start;
                    border: 2px solid transparent; transition: all 0.2s;
                }
                .app-card:hover { border-color: #cc0000; background: #fff; }
                .app-card .app-icon {
                    width: 64px; height: 64px; background: #cc0000; color: #fff;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 28px; font-weight: 700; flex-shrink: 0;
                }
                .app-card .app-icon.site { background: #4488ff; }
                .app-card .app-info { flex: 1; min-width: 0; }
                .app-card .app-name { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
                .app-card .app-desc { font-size: 13px; color: #888; margin-bottom: 8px; }
                .app-card .app-meta { font-size: 11px; color: #aaa; }
                .app-card .app-actions { flex-shrink: 0; }
                .app-card .app-actions button {
                    padding: 8px 20px; border: 2px solid #cc0000;
                    background: #cc0000; color: #fff; cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace; font-size: 13px;
                }
                .app-card .app-actions button:hover { background: #990000; }
                .app-card .app-actions button.installed {
                    background: none; color: #4CAF50; border-color: #4CAF50;
                }
                .app-card .app-actions button.installed:hover {
                    background: #4CAF50; color: #fff;
                }
                .app-card .app-actions button.delete-btn {
                    background: none; color: #cc0000; border-color: #cc0000;
                }
                .app-card .app-actions button.delete-btn:hover {
                    background: #cc0000; color: #fff;
                }

                .upload-zone {
                    border: 3px dashed #ddd; padding: 60px 20px;
                    text-align: center; cursor: pointer;
                    background: #fafafa; margin-bottom: 20px;
                }
                .upload-zone:hover { border-color: #cc0000; background: #fff5f5; }
                .upload-zone .title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
                .upload-zone .subtitle { font-size: 13px; color: #999; }
                .upload-zone input[type="file"] { display: none; }

                .html-input-zone { background: #f5f5f5; padding: 20px; margin-bottom: 20px; }
                .html-input-zone textarea {
                    width: 100%; min-height: 200px; padding: 12px;
                    border: 2px solid #e0e0e0; font-family: monospace;
                    font-size: 12px; outline: none; resize: vertical;
                    box-sizing: border-box; background: #fff;
                }
                .html-input-zone textarea:focus { border-color: #cc0000; }
                .html-input-zone .field-row { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
                .html-input-zone .field { flex: 1; min-width: 150px; }
                .html-input-zone label {
                    display: block; font-size: 12px; font-weight: 600;
                    color: #666; margin-bottom: 6px;
                }
                .html-input-zone input[type="text"] {
                    width: 100%; padding: 10px 12px; border: 2px solid #e0e0e0;
                    font-family: 'ST-SimpleSquare', monospace; font-size: 14px;
                    outline: none; box-sizing: border-box; background: #fff;
                }
                .html-input-zone input[type="text"]:focus { border-color: #cc0000; }
                .html-input-zone .install-btn {
                    padding: 12px 32px; background: #cc0000; color: #fff;
                    border: none; cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace; font-size: 15px;
                    font-weight: 600; margin-top: 12px;
                }
                .html-input-zone .install-btn:hover { background: #990000; }

                .empty-message {
                    text-align: center; padding: 60px 20px;
                    color: #bbb; font-size: 14px;
                }

                @media (max-width: 500px) {
                    .store-header { padding: 12px 16px; }
                    .store-header h1 { font-size: 16px; }
                    .store-content { padding: 12px 16px; }
                    .app-card { padding: 14px; gap: 12px; }
                    .app-card .app-icon { width: 48px; height: 48px; font-size: 22px; }
                    .app-card .app-name { font-size: 14px; }
                    .app-card .app-desc { font-size: 12px; }
                    .app-card .app-actions button { font-size: 11px; padding: 6px 14px; }
                }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'store-header';
        header.innerHTML = `<h1>Store</h1><button id="storeCloseBtn">✕</button>`;

        const tabs = document.createElement('div');
        tabs.className = 'store-tabs';
        tabs.innerHTML = `
            <button class="active" data-tab="catalog">Каталог</button>
            <button data-tab="install">Установить</button>
            <button data-tab="installed">Мои приложения</button>
        `;

        const content = document.createElement('div');
        content.className = 'store-content';
        content.id = 'storeContent';

        app.appendChild(header);
        app.appendChild(tabs);
        app.appendChild(content);
        document.body.appendChild(app);

        document.getElementById('storeCloseBtn').addEventListener('click', closeStore);
        
        tabs.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', function() {
                tabs.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentTab = this.dataset.tab;
                renderTab(currentTab);
            });
        });

        if (loadedCatalog.length === 0) {
            const loading = document.createElement('div');
            loading.className = 'empty-message';
            loading.textContent = 'Загрузка';
            content.appendChild(loading);

            loadCatalog().then(function() {
                renderTab('catalog');
            });
        } else {
            renderTab('catalog');
        }
    }

    function renderTab(tab) {
        const content = document.getElementById('storeContent');
        if (!content) return;
        content.innerHTML = '';

        if (tab === 'catalog') renderCatalog(content);
        else if (tab === 'install') renderInstall(content);
        else if (tab === 'installed') renderInstalled(content);
    }

    function renderCatalog(container) {
        if (loadedCatalog.length === 0) {
            const loading = document.createElement('div');
            loading.className = 'empty-message';
            loading.textContent = 'Загрузка';
            container.appendChild(loading);
            loadCatalog().then(function() {
                container.innerHTML = '';
                renderCatalog(container);
            });
            return;
        }

        const title = document.createElement('div');
        title.className = 'store-section-title';
        title.textContent = 'Доступные приложения';
        container.appendChild(title);

        loadedCatalog.forEach(app => {
            const card = document.createElement('div');
            card.className = 'app-card';
            const installed = isInstalled(app.id);

            const iconClass = app.isUrl ? 'app-icon site' : 'app-icon';
            const iconChar = app.isUrl ? 'W' : app.name.charAt(0);

            card.innerHTML = `
                <div class="${iconClass}">${iconChar}</div>
                <div class="app-info">
                    <div class="app-name">${app.name}</div>
                    <div class="app-desc">${app.description}</div>
                    <div class="app-meta">${app.author} • v${app.version}${app.isUrl ? ' • Сайт' : ''}</div>
                </div>
                <div class="app-actions">
                    <button class="${installed ? 'installed' : ''}">
                        ${installed ? 'Установлено' : 'Установить'}
                    </button>
                </div>
            `;

            card.querySelector('button').addEventListener('click', function() {
                if (isInstalled(app.id)) {
                    if (window.Win) {
                        Win.confirm('Удалить приложение?', {
                            title: 'Удаление',
                            okText: 'Удалить',
                            danger: true
                        }).then(function(ok) {
                            if (ok) {
                                uninstallApp(app.id);
                                renderTab('catalog');
                            }
                        });
                    }
                } else {
                    if (installApp(app)) {
                        renderTab('catalog');
                    }
                }
            });

            container.appendChild(card);
        });
    }

    function renderInstall(container) {
        const title = document.createElement('div');
        title.className = 'store-section-title';
        title.textContent = 'Установить HTML приложение';
        container.appendChild(title);

        const uploadZone = document.createElement('div');
        uploadZone.className = 'upload-zone';
        uploadZone.innerHTML = `
            <div class="title">Выберите HTML файл</div>
            <div class="subtitle">или перетащите сюда</div>
            <input type="file" id="htmlFileInput" accept=".html,.htm,text/html" />
        `;
        container.appendChild(uploadZone);

        const inputZone = document.createElement('div');
        inputZone.className = 'html-input-zone';
        inputZone.innerHTML = `
            <div class="store-section-title" style="margin-top:0;">Или вставьте HTML код</div>
            <div class="field-row">
                <div class="field">
                    <label>Название</label>
                    <input type="text" id="htmlAppName" placeholder="" />
                </div>
                <div class="field">
                    <label>Автор</label>
                    <input type="text" id="htmlAppAuthor" placeholder="" />
                </div>
                <div class="field">
                    <label>Версия</label>
                    <input type="text" id="htmlAppVersion" placeholder="1.0.0" />
                </div>
            </div>
            <div class="field" style="margin-bottom:12px;">
                <label>Описание</label>
                <input type="text" id="htmlAppDesc" placeholder="" />
            </div>
            <div>
                <label>HTML код</label>
                <textarea id="htmlCodeInput" placeholder=""></textarea>
            </div>
            <button class="install-btn" id="htmlInstallBtn">Установить</button>
        `;
        container.appendChild(inputZone);

        const fileInput = document.getElementById('htmlFileInput');
        
        uploadZone.addEventListener('click', () => fileInput.click());
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = '#cc0000';
        });
        uploadZone.addEventListener('dragleave', () => uploadZone.style.borderColor = '#ddd');
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = '#ddd';
            const file = e.dataTransfer.files[0];
            if (file) loadHtmlFileFromUser(file);
        });
        fileInput.addEventListener('change', function() {
            if (this.files[0]) loadHtmlFileFromUser(this.files[0]);
        });

        function loadHtmlFileFromUser(file) {
            if (!file.name.match(/\.(html?|htm)$/i) && !file.type.includes('html')) {
                return;
            }
            const reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById('htmlCodeInput').value = e.target.result;
                if (!document.getElementById('htmlAppName').value) {
                    document.getElementById('htmlAppName').value = file.name.replace(/\.(html?|htm)$/i, '');
                }
            };
            reader.readAsText(file);
        }

        document.getElementById('htmlInstallBtn').addEventListener('click', function() {
            const name = document.getElementById('htmlAppName').value.trim();
            const html = document.getElementById('htmlCodeInput').value.trim();
            const author = document.getElementById('htmlAppAuthor').value.trim() || '';
            const version = document.getElementById('htmlAppVersion').value.trim() || '1.0.0';
            const description = document.getElementById('htmlAppDesc').value.trim() || '';

            if (!name) return;
            if (!html) return;

            const appId = 'html_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();

            const appData = {
                id: appId,
                name: name,
                description: description,
                author: author,
                version: version,
                icon: null,
                content: html
            };

            if (installApp(appData)) {
                document.getElementById('htmlAppName').value = '';
                document.getElementById('htmlAppAuthor').value = '';
                document.getElementById('htmlAppVersion').value = '';
                document.getElementById('htmlAppDesc').value = '';
                document.getElementById('htmlCodeInput').value = '';
                
                setTimeout(() => {
                    const tabs = document.querySelectorAll('.store-tabs button');
                    tabs.forEach(b => b.classList.remove('active'));
                    tabs[2].classList.add('active');
                    currentTab = 'installed';
                    renderTab('installed');
                }, 300);
            }
        });
    }

    function renderInstalled(container) {
        const installed = getInstalledApps();

        if (installed.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-message';
            empty.textContent = 'Нет установленных приложений';
            container.appendChild(empty);
            return;
        }

        const title = document.createElement('div');
        title.className = 'store-section-title';
        title.textContent = 'Установленные ' + installed.length;
        container.appendChild(title);

        installed.forEach(app => {
            const card = document.createElement('div');
            card.className = 'app-card';

            card.innerHTML = `
                <div class="app-icon">${app.name.charAt(0)}</div>
                <div class="app-info">
                    <div class="app-name">${app.name}</div>
                    <div class="app-desc">${app.description || ''}</div>
                    <div class="app-meta">${app.author || ''} • v${app.version || '1.0.0'}</div>
                </div>
                <div class="app-actions">
                    <button class="delete-btn">Удалить</button>
                </div>
            `;

            card.querySelector('.delete-btn').addEventListener('click', function() {
                if (window.Win) {
                    Win.confirm('Удалить приложение?', {
                        title: 'Удаление',
                        okText: 'Удалить',
                        danger: true
                    }).then(function(ok) {
                        if (ok) {
                            uninstallApp(app.id);
                            renderTab('installed');
                        }
                    });
                }
            });

            container.appendChild(card);
        });
    }

    window.storeInit = function() {
        openStore();
    };

    window.Store = {
        open: openStore,
        close: closeStore,
        install: installApp,
        uninstall: uninstallApp,
        getInstalled: getInstalledApps,
        isInstalled: isInstalled,
        catalog: CATALOG_ITEMS,
        refresh: refreshAppMenu,
        destroy: destroy
    };

    setTimeout(() => loadCatalog(), 500);

})();