// downloader-veiw.js — UI для загрузки системы

(function() {
    'use strict';

    console.log('[Downloader-View] Загрузка UI...');

    let overlay = null;
    let progressBar = null;
    let statusText = null;
    let fileList = null;

    // ============================================
    // СОЗДАНИЕ UI
    // ============================================
    function createUI(title, subtitle) {
        if (overlay) removeUI();

        overlay = document.createElement('div');
        overlay.id = 'downloaderOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #0a0a12;
            z-index: 9999999;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            font-family: 'ST-SimpleSquare', monospace;
            color: #ffffff;
            opacity: 0;
            animation: dlFadeIn 0.4s ease forwards;
        `;

        // Стили
        if (!document.getElementById('downloaderStyles')) {
            const style = document.createElement('style');
            style.id = 'downloaderStyles';
            style.textContent = `
                @keyframes dlFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes dlFadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
                @keyframes dlSpin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes dlPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                .dl-logo {
                    font-size: 42px;
                    font-weight: 700;
                    margin-bottom: 8px;
                    letter-spacing: 2px;
                    background: linear-gradient(135deg, #ffffff, #cc0000);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }
                .dl-title {
                    font-size: 20px;
                    font-weight: 600;
                    margin-bottom: 8px;
                    text-align: center;
                }
                .dl-subtitle {
                    font-size: 13px;
                    color: #888;
                    margin-bottom: 40px;
                    text-align: center;
                    max-width: 400px;
                    padding: 0 20px;
                }
                .dl-progress-container {
                    width: 320px;
                    max-width: 80%;
                    margin-bottom: 20px;
                }
                .dl-progress-bg {
                    width: 100%;
                    height: 6px;
                    background: #1a1a2a;
                    overflow: hidden;
                    border: 1px solid #2a2a3a;
                }
                .dl-progress-bar {
                    height: 100%;
                    background: linear-gradient(90deg, #cc0000, #ff4444);
                    width: 0%;
                    transition: width 0.3s ease;
                    box-shadow: 0 0 20px rgba(204, 0, 0, 0.5);
                }
                .dl-progress-info {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 8px;
                    font-size: 12px;
                    color: #888;
                }
                .dl-status {
                    font-size: 14px;
                    color: #aaa;
                    margin-bottom: 24px;
                    text-align: center;
                    min-height: 20px;
                    padding: 0 20px;
                }
                .dl-filelist {
                    width: 400px;
                    max-width: 85%;
                    max-height: 200px;
                    overflow-y: auto;
                    background: #0e0e1a;
                    border: 1px solid #2a2a3a;
                    padding: 12px 16px;
                    font-size: 11px;
                    color: #666;
                    line-height: 1.6;
                }
                .dl-filelist::-webkit-scrollbar {
                    width: 4px;
                }
                .dl-filelist::-webkit-scrollbar-thumb {
                    background: #2a2a3a;
                }
                .dl-file-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 2px 0;
                    transition: color 0.2s;
                }
                .dl-file-item.active {
                    color: #ffffff;
                }
                .dl-file-item.done {
                    color: #4CAF50;
                }
                .dl-file-item.error {
                    color: #cc0000;
                }
                .dl-file-status {
                    font-size: 10px;
                    color: #444;
                }
                .dl-file-item.active .dl-file-status {
                    color: #ffffff;
                }
                .dl-file-item.done .dl-file-status {
                    color: #4CAF50;
                }
                .dl-file-item.error .dl-file-status {
                    color: #cc0000;
                }
                .dl-spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid #1a1a2a;
                    border-top: 3px solid #cc0000;
                    border-radius: 50%;
                    animation: dlSpin 0.8s linear infinite;
                    margin-bottom: 20px;
                }
                .dl-success {
                    font-size: 64px;
                    color: #4CAF50;
                    margin-bottom: 16px;
                    animation: dlPulse 1.5s ease infinite;
                }
                .dl-error-icon {
                    font-size: 64px;
                    color: #cc0000;
                    margin-bottom: 16px;
                }
                .dl-btn {
                    padding: 12px 32px;
                    background: #cc0000;
                    color: #ffffff;
                    border: none;
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 15px;
                    font-weight: 600;
                    margin-top: 16px;
                    transition: all 0.2s;
                }
                .dl-btn:hover {
                    background: #990000;
                    transform: scale(1.02);
                }
                .dl-btn:active {
                    transform: scale(0.98);
                }
            `;
            document.head.appendChild(style);
        }

        // Логотип
        const logo = document.createElement('div');
        logo.className = 'dl-logo';
        logo.textContent = 'SHNUK OS';
        overlay.appendChild(logo);

        // Заголовок
        const titleEl = document.createElement('div');
        titleEl.className = 'dl-title';
        titleEl.textContent = title || 'Загрузка системы';
        overlay.appendChild(titleEl);

        // Подзаголовок
        const subtitleEl = document.createElement('div');
        subtitleEl.className = 'dl-subtitle';
        subtitleEl.textContent = subtitle || 'Пожалуйста, подождите. Идёт загрузка всех данных...';
        overlay.appendChild(subtitleEl);

        // Спиннер
        const spinner = document.createElement('div');
        spinner.className = 'dl-spinner';
        overlay.appendChild(spinner);

        // Прогресс
        const progressContainer = document.createElement('div');
        progressContainer.className = 'dl-progress-container';
        progressContainer.innerHTML = `
            <div class="dl-progress-bg">
                <div class="dl-progress-bar" id="dlProgressBar"></div>
            </div>
            <div class="dl-progress-info">
                <span id="dlProgressText">0 / 0</span>
                <span id="dlProgressPercent">0%</span>
            </div>
        `;
        overlay.appendChild(progressContainer);

        // Статус
        statusText = document.createElement('div');
        statusText.className = 'dl-status';
        statusText.id = 'dlStatus';
        statusText.textContent = 'Инициализация...';
        overlay.appendChild(statusText);

        // Список файлов
        fileList = document.createElement('div');
        fileList.className = 'dl-filelist';
        fileList.id = 'dlFileList';
        overlay.appendChild(fileList);

        // Прогресс бар
        progressBar = overlay.querySelector('#dlProgressBar');

        document.body.appendChild(overlay);

        return overlay;
    }

    // ============================================
    // ОБНОВЛЕНИЕ UI
    // ============================================
    function updateProgress(current, total, currentFile) {
        if (!progressBar) return;
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        progressBar.style.width = percent + '%';

        const progressText = document.getElementById('dlProgressText');
        const progressPercent = document.getElementById('dlProgressPercent');
        
        if (progressText) progressText.textContent = current + ' / ' + total;
        if (progressPercent) progressPercent.textContent = percent + '%';

        if (statusText && currentFile) {
            statusText.textContent = 'Загрузка: ' + currentFile;
        }
    }

    function addFileToLog(filename, status) {
        if (!fileList) return;
        
        // Ищем существующий
        let item = fileList.querySelector(`[data-file="${filename}"]`);
        
        if (!item) {
            item = document.createElement('div');
            item.className = 'dl-file-item';
            item.dataset.file = filename;
            item.innerHTML = `
                <span class="dl-file-name">${filename}</span>
                <span class="dl-file-status">...</span>
            `;
            fileList.appendChild(item);
        }
        
        // Обновляем статус
        item.className = 'dl-file-item ' + status;
        const statusEl = item.querySelector('.dl-file-status');
        if (statusEl) {
            const statusMap = {
                'active': '⏳',
                'done': '✓',
                'error': '✗'
            };
            statusEl.textContent = statusMap[status] || '...';
        }
        
        // Скроллим к последнему
        if (status === 'active') {
            fileList.scrollTop = fileList.scrollHeight;
        }
    }

    function showSuccess() {
        if (!overlay) return;
        
        // Убираем спиннер
        const spinner = overlay.querySelector('.dl-spinner');
        if (spinner) spinner.remove();

        // Убираем прогресс
        const progressContainer = overlay.querySelector('.dl-progress-container');
        if (progressContainer) progressContainer.style.opacity = '0.3';

        // Меняем статус
        if (statusText) {
            statusText.innerHTML = '<span style="font-size: 64px; color: #4CAF50; display: block; margin-bottom: 16px;">✓</span>Система готова к работе!';
            statusText.style.color = '#4CAF50';
            statusText.style.fontSize = '16px';
            statusText.style.fontWeight = '600';
        }
    }

    function showError(message) {
        if (!overlay) return;
        
        const spinner = overlay.querySelector('.dl-spinner');
        if (spinner) spinner.remove();

        if (statusText) {
            statusText.innerHTML = '<span style="font-size: 64px; color: #cc0000; display: block; margin-bottom: 16px;">✗</span>' + (message || 'Ошибка загрузки');
            statusText.style.color = '#cc0000';
        }
    }

    function removeUI() {
        if (overlay) {
            overlay.style.animation = 'dlFadeOut 0.4s ease forwards';
            setTimeout(function() {
                if (overlay && overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
                overlay = null;
                progressBar = null;
                statusText = null;
                fileList = null;
            }, 400);
        }
    }

    // ============================================
    // ЭКСПОРТ
    // ============================================
    window.DownloaderView = {
        show: createUI,
        updateProgress: updateProgress,
        addFileToLog: addFileToLog,
        showSuccess: showSuccess,
        showError: showError,
        hide: removeUI
    };

    console.log('[Downloader-View] ✅ Готов');

})();