// shnuk-account.js
(function() {
    'use strict';

    const PROFILE_KEY = 'shnuk_account_profile';
    const FRIENDS_KEY = 'shnuk_account_friends';
    const FONT_MAIN = "'TTPaplane', monospace";
    const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    let profile = null;
    let friends = [];
    let isOpen = false;

    function log() {
        try { console.log.apply(console, ['[Account]'].concat(Array.prototype.slice.call(arguments))); } catch(e) {}
    }

    function loadProfile() {
        try {
            const raw = localStorage.getItem(PROFILE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.code) {
                    profile = parsed;
                    return;
                }
            }
        } catch(e) {}
        profile = null;
    }

    function saveProfile() {
        try {
            if (profile) {
                localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
            } else {
                localStorage.removeItem(PROFILE_KEY);
            }
        } catch(e) {}
    }

    function loadFriends() {
        try {
            const raw = localStorage.getItem(FRIENDS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    friends = parsed;
                    return;
                }
            }
        } catch(e) {}
        friends = [];
    }

    function saveFriends() {
        try {
            localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
        } catch(e) {}
    }

    function generateCode() {
        let out = '';
        const arr = new Uint8Array(8);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(arr);
        } else {
            for (let i = 0; i < 8; i++) arr[i] = Math.floor(Math.random() * 256);
        }
        for (let i = 0; i < 8; i++) {
            out += CODE_ALPHABET[arr[i] % CODE_ALPHABET.length];
        }
        return out;
    }

    function createDefaultProfile() {
        return {
            code: generateCode(),
            name: '',
            avatar: null,
            type: 'personal',
            created: Date.now()
        };
    }

    function ensureProfile() {
        loadProfile();
        loadFriends();
        if (!profile) {
            profile = createDefaultProfile();
            saveProfile();
        }
    }

    function getProfile() { return profile; }
    function getCode() { return profile ? profile.code : ''; }
    function getName() { return profile ? profile.name : ''; }
    function getAvatar() { return profile ? profile.avatar : null; }
    function getType() { return profile ? profile.type : 'personal'; }
    function getFriends() { return friends.slice(); }

    function isFriend(code) {
        if (!code) return false;
        return friends.some(function(f) { return f.code === code; });
    }

    function getFriendByCode(code) {
        if (!code) return null;
        return friends.find(function(f) { return f.code === code; }) || null;
    }

    function addFriend(friend) {
        if (!friend || !friend.code) return false;
        if (friend.code === getCode()) return false;
        if (isFriend(friend.code)) return false;
        friends.push({
            code: friend.code,
            name: friend.name || 'Друг',
            avatar: friend.avatar || null,
            added: Date.now()
        });
        saveFriends();
        dispatchChange();
        return true;
    }

    function removeFriend(code) {
        const before = friends.length;
        friends = friends.filter(function(f) { return f.code !== code; });
        if (friends.length !== before) {
            saveFriends();
            dispatchChange();
            return true;
        }
        return false;
    }

    function setName(name) {
        if (!profile) return;
        profile.name = String(name || '').slice(0, 40);
        saveProfile();
        dispatchChange();
    }

    function setAvatar(dataUrl) {
        if (!profile) return;
        profile.avatar = dataUrl || null;
        saveProfile();
        dispatchChange();
    }

    function setType(type) {
        if (!profile) return;
        profile.type = (type === 'other') ? 'other' : 'personal';
        saveProfile();
        dispatchChange();
    }

    function dispatchChange() {
        try {
            window.dispatchEvent(new CustomEvent('shnuk:account-changed', {
                detail: {
                    profile: profile ? Object.assign({}, profile) : null,
                    friends: friends.slice()
                }
            }));
        } catch(e) {}
    }

    function compressAvatar(file) {
        return new Promise(function(resolve, reject) {
            if (!file) { reject(new Error('Нет файла')); return; }
            const reader = new FileReader();
            reader.onload = function() {
                const img = new Image();
                img.onload = function() {
                    const targetSize = 500;
                    const canvas = document.createElement('canvas');
                    canvas.width = targetSize;
                    canvas.height = targetSize;
                    const ctx = canvas.getContext('2d');

                    const srcW = img.width;
                    const srcH = img.height;
                    const srcMin = Math.min(srcW, srcH);
                    const sx = (srcW - srcMin) / 2;
                    const sy = (srcH - srcMin) / 2;
                    ctx.drawImage(img, sx, sy, srcMin, srcMin, 0, 0, targetSize, targetSize);

                    let quality = 0.85;
                    let dataUrl = canvas.toDataURL('image/jpeg', quality);
                    while (dataUrl.length > 200 * 1024 && quality > 0.4) {
                        quality -= 0.1;
                        dataUrl = canvas.toDataURL('image/jpeg', quality);
                    }
                    resolve(dataUrl);
                };
                img.onerror = function() { reject(new Error('Не удалось открыть изображение')); };
                img.src = reader.result;
            };
            reader.onerror = function() { reject(new Error('Не удалось прочитать файл')); };
            reader.readAsDataURL(file);
        });
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    function renderInto(container) {
        if (!container) return;
        ensureProfile();
        container.innerHTML = '';

        const p = profile;

        const wrap = document.createElement('div');
        wrap.className = 'shnuk-account-wrap';

        const profileSection = document.createElement('div');
        profileSection.className = 'shnuk-account-section';

        const avatarRow = document.createElement('div');
        avatarRow.className = 'shnuk-account-avatar-row';

        const avatarWrap = document.createElement('div');
        avatarWrap.className = 'shnuk-account-avatar';
        if (p.avatar) {
            const img = document.createElement('img');
            img.src = p.avatar;
            avatarWrap.appendChild(img);
        } else {
            const placeholder = document.createElement('span');
            placeholder.textContent = (p.name && p.name.charAt(0).toUpperCase()) || '?';
            avatarWrap.appendChild(placeholder);
        }

        const changeAvatarBtn = document.createElement('button');
        changeAvatarBtn.className = 'shnuk-account-avatar-btn';
        changeAvatarBtn.textContent = p.avatar ? 'Сменить' : 'Загрузить';
        changeAvatarBtn.addEventListener('click', function() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async function() {
                if (!this.files || !this.files[0]) return;
                try {
                    const dataUrl = await compressAvatar(this.files[0]);
                    setAvatar(dataUrl);
                    renderInto(container);
                } catch(e) {
                    if (window.Win && window.Win.notify) {
                        window.Win.notify('Ошибка: ' + e.message, { type: 'error' });
                    }
                }
            };
            input.click();
        });

        if (p.avatar) {
            const removeAvatarBtn = document.createElement('button');
            removeAvatarBtn.className = 'shnuk-account-avatar-btn secondary';
            removeAvatarBtn.textContent = 'Удалить';
            removeAvatarBtn.addEventListener('click', function() {
                setAvatar(null);
                renderInto(container);
            });
            avatarWrap.appendChild(changeAvatarBtn);
            avatarWrap.appendChild(removeAvatarBtn);
        } else {
            avatarWrap.appendChild(changeAvatarBtn);
        }

        avatarRow.appendChild(avatarWrap);
        profileSection.appendChild(avatarRow);

        const nameField = document.createElement('div');
        nameField.className = 'shnuk-account-field';
        nameField.innerHTML = '<label>Имя</label>';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = p.name || '';
        nameInput.maxLength = 40;
        nameInput.placeholder = 'Введите имя';
        nameInput.addEventListener('input', function() {
            setName(this.value);
        });
        nameField.appendChild(nameInput);
        profileSection.appendChild(nameField);

        const codeField = document.createElement('div');
        codeField.className = 'shnuk-account-field';
        codeField.innerHTML = '<label>Код аккаунта</label>';
        const codeRow = document.createElement('div');
        codeRow.className = 'shnuk-account-code-row';
        const codeDisplay = document.createElement('div');
        codeDisplay.className = 'shnuk-account-code';
        codeDisplay.textContent = p.code;
        const copyBtn = document.createElement('button');
        copyBtn.className = 'shnuk-account-btn secondary';
        copyBtn.textContent = 'Копировать';
        copyBtn.addEventListener('click', async function() {
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(p.code);
                } else {
                    const tmp = document.createElement('textarea');
                    tmp.value = p.code;
                    document.body.appendChild(tmp);
                    tmp.select();
                    document.execCommand('copy');
                    document.body.removeChild(tmp);
                }
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Код скопирован', { type: 'success' });
                }
            } catch(e) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Не удалось скопировать', { type: 'error' });
                }
            }
        });
        codeRow.appendChild(codeDisplay);
        codeRow.appendChild(copyBtn);
        codeField.appendChild(codeRow);
        profileSection.appendChild(codeField);

        const typeField = document.createElement('div');
        typeField.className = 'shnuk-account-field';
        typeField.innerHTML = '<label>Тип аккаунта</label>';
        const typeRow = document.createElement('div');
        typeRow.className = 'shnuk-account-type-row';

        const personalBtn = document.createElement('button');
        personalBtn.className = 'shnuk-account-type-btn' + (p.type === 'personal' ? ' active' : '');
        personalBtn.innerHTML = '<span class="shnuk-account-type-title">Личный</span><span class="shnuk-account-type-desc">Обычный аккаунт</span>';
        personalBtn.addEventListener('click', function() {
            setType('personal');
            renderInto(container);
        });

        const otherBtn = document.createElement('button');
        otherBtn.className = 'shnuk-account-type-btn' + (p.type === 'other' ? ' active' : '');
        otherBtn.innerHTML = '<span class="shnuk-account-type-title">Другой</span><span class="shnuk-account-type-desc">Дополнительные приложения</span>';
        otherBtn.addEventListener('click', function() {
            setType('other');
            renderInto(container);
        });

        typeRow.appendChild(personalBtn);
        typeRow.appendChild(otherBtn);
        typeField.appendChild(typeRow);
        profileSection.appendChild(typeField);

        wrap.appendChild(profileSection);

        const friendsSection = document.createElement('div');
        friendsSection.className = 'shnuk-account-section';

        const friendsTitle = document.createElement('div');
        friendsTitle.className = 'shnuk-account-section-title';
        friendsTitle.textContent = 'Друзья Shnuk';
        friendsSection.appendChild(friendsTitle);

        const addRow = document.createElement('div');
        addRow.className = 'shnuk-account-add-row';
        const friendInput = document.createElement('input');
        friendInput.type = 'text';
        friendInput.placeholder = 'Код друга (8 символов)';
        friendInput.maxLength = 8;
        friendInput.className = 'shnuk-account-friend-input';
        const addBtn = document.createElement('button');
        addBtn.className = 'shnuk-account-btn';
        addBtn.textContent = 'Добавить';
        addBtn.addEventListener('click', function() {
            const code = (friendInput.value || '').trim().toUpperCase();
            if (code.length !== 8) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Код должен быть из 8 символов', { type: 'error' });
                }
                return;
            }
            if (code === p.code) {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Это ваш код', { type: 'error' });
                }
                return;
            }
            const ok = addFriend({ code: code, name: code });
            if (ok) {
                friendInput.value = '';
                renderInto(container);
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Друг добавлен', { type: 'success' });
                }
            } else {
                if (window.Win && window.Win.notify) {
                    window.Win.notify('Уже в списке', { type: 'info' });
                }
            }
        });
        addRow.appendChild(friendInput);
        addRow.appendChild(addBtn);
        friendsSection.appendChild(addRow);

        if (friends.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'shnuk-account-empty';
            empty.textContent = 'Пока нет друзей. Добавьте по коду.';
            friendsSection.appendChild(empty);
        } else {
            const list = document.createElement('div');
            list.className = 'shnuk-account-friends-list';
            friends.forEach(function(f) {
                const row = document.createElement('div');
                row.className = 'shnuk-account-friend-row';

                const avatar = document.createElement('div');
                avatar.className = 'shnuk-account-friend-avatar';
                if (f.avatar) {
                    const img = document.createElement('img');
                    img.src = f.avatar;
                    avatar.appendChild(img);
                } else {
                    avatar.textContent = (f.name && f.name.charAt(0).toUpperCase()) || f.code.charAt(0);
                }
                row.appendChild(avatar);

                const info = document.createElement('div');
                info.className = 'shnuk-account-friend-info';
                const nameEl = document.createElement('div');
                nameEl.className = 'shnuk-account-friend-name';
                nameEl.textContent = f.name || 'Друг';
                info.appendChild(nameEl);
                const codeEl = document.createElement('div');
                codeEl.className = 'shnuk-account-friend-code';
                codeEl.textContent = f.code;
                info.appendChild(codeEl);
                row.appendChild(info);

                const removeBtn = document.createElement('button');
                removeBtn.className = 'shnuk-account-btn danger';
                removeBtn.textContent = '✕';
                removeBtn.addEventListener('click', function() {
                    removeFriend(f.code);
                    renderInto(container);
                });
                row.appendChild(removeBtn);

                list.appendChild(row);
            });
            friendsSection.appendChild(list);
        }

        wrap.appendChild(friendsSection);

        container.appendChild(wrap);
    }

    function openModal() {
        if (isOpen) {
            const ex = document.getElementById('shnukAccountApp');
            if (ex) { ex.style.display = 'flex'; return; }
        }

        injectStyles();

        const root = document.createElement('div');
        root.id = 'shnukAccountApp';
        root.style.cssText = `
            position: fixed;
            top: var(--livebar-h, 44px);
            left: 0;
            width: 100%;
            height: calc(100% - var(--livebar-h, 44px));
            background: var(--bg-primary);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            font-family: ${FONT_MAIN};
            color: var(--text-primary);
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.className = 'shnuk-account-header';
        header.innerHTML = `
            <h1>Shnuk Account</h1>
            <div class="shnuk-account-header-actions">
                <button id="shnukAccountCloseBtn">✕</button>
            </div>
        `;

        const content = document.createElement('div');
        content.className = 'shnuk-account-content scroll-blur';
        content.id = 'shnukAccountContent';

        root.appendChild(header);
        root.appendChild(content);
        document.body.appendChild(root);

        document.getElementById('shnukAccountCloseBtn').addEventListener('click', function() {
            closeModal();
        });

        isOpen = true;
        renderInto(content);
    }

    function closeModal() {
        isOpen = false;
        const el = document.getElementById('shnukAccountApp');
        if (el && el.parentNode) {
            el.parentNode.removeChild(el);
        }
    }

    function open() {
        openModal();
    }

    function close() {
        closeModal();
    }

    function injectStyles() {
        if (document.getElementById('shnukAccountStyles')) return;
        const style = document.createElement('style');
        style.id = 'shnukAccountStyles';
        style.textContent = `
            #shnukAccountApp, #shnukAccountApp *,
            .shnuk-account-wrap, .shnuk-account-wrap * {
                font-family: ${FONT_MAIN} !important;
            }

            .scroll-blur {
                position: relative;
                isolation: isolate;
            }
            .scroll-blur::after {
                content: '';
                position: fixed;
                left: 0;
                right: 0;
                bottom: 0;
                height: 80px;
                pointer-events: none;
                z-index: 20;
                -webkit-backdrop-filter: blur(12px);
                backdrop-filter: blur(12px);
                -webkit-mask-image: linear-gradient(to top, #000 0%, #000 40%, transparent 100%);
                mask-image: linear-gradient(to top, #000 0%, #000 40%, transparent 100%);
            }

            .shnuk-account-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                background: var(--header-bg);
                border-bottom: 2px solid var(--border-color);
                flex-shrink: 0;
                color: var(--header-text);
            }
            .shnuk-account-header h1 {
                font-size: 20px;
                font-weight: 600;
                margin: 0;
            }
            .shnuk-account-header-actions button {
                background: var(--bg-primary);
                border: 2px solid var(--accent);
                color: var(--accent);
                font-size: 18px;
                padding: 4px 12px;
                cursor: pointer;
                font-family: inherit;
                transition: all 0.2s ease;
            }
            .shnuk-account-header-actions button:hover {
                background: var(--accent);
                color: var(--text-on-accent);
            }

            .shnuk-account-content {
                flex: 1;
                overflow-y: auto;
                padding: 24px;
            }

            .shnuk-account-wrap {
                max-width: 640px;
                margin: 0 auto;
                display: flex;
                flex-direction: column;
                gap: 20px;
            }

            .shnuk-account-section {
                background: var(--bg-secondary);
                border: 2px solid var(--border-color);
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .shnuk-account-section-title {
                font-size: 15px;
                font-weight: 700;
                color: var(--text-primary);
            }

            .shnuk-account-avatar-row {
                display: flex;
                justify-content: center;
            }
            .shnuk-account-avatar {
                width: 120px;
                height: 120px;
                border-radius: 50%;
                background: var(--bg-primary);
                border: 3px solid var(--border-color);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                position: relative;
                font-size: 48px;
                font-weight: 700;
                color: var(--accent);
                gap: 6px;
            }
            .shnuk-account-avatar img {
                position: absolute;
                top: 0; left: 0;
                width: 100%; height: 100%;
                object-fit: cover;
            }
            .shnuk-account-avatar span {
                z-index: 0;
            }
            .shnuk-account-avatar-btn {
                position: relative;
                z-index: 2;
                padding: 4px 10px;
                font-size: 11px;
                font-weight: 600;
                background: var(--accent);
                color: var(--text-on-accent);
                border: none;
                cursor: pointer;
                font-family: inherit;
                transition: background 0.2s;
            }
            .shnuk-account-avatar-btn.secondary {
                background: var(--bg-primary);
                color: var(--text-primary);
                border: 2px solid var(--border-color);
            }
            .shnuk-account-avatar-btn:hover {
                background: var(--accent-dark);
                color: var(--text-on-accent);
            }

            .shnuk-account-field {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .shnuk-account-field label {
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.6px;
                color: var(--text-muted);
                font-weight: 700;
            }
            .shnuk-account-field input,
            .shnuk-account-friend-input {
                padding: 12px 14px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary);
                color: var(--text-primary);
                font-family: inherit;
                font-size: 14px;
                outline: none;
                box-sizing: border-box;
                transition: border-color 0.2s;
            }
            .shnuk-account-field input:focus,
            .shnuk-account-friend-input:focus {
                border-color: var(--accent);
            }

            .shnuk-account-code-row {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            .shnuk-account-code {
                flex: 1;
                padding: 12px 14px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary);
                color: var(--text-primary);
                font-family: 'Courier New', monospace;
                font-size: 22px;
                font-weight: 700;
                letter-spacing: 4px;
                text-align: center;
            }

            .shnuk-account-type-row {
                display: flex;
                gap: 10px;
            }
            .shnuk-account-type-btn {
                flex: 1;
                padding: 16px 14px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary);
                color: var(--text-primary);
                cursor: pointer;
                font-family: inherit;
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: 4px;
                transition: all 0.2s;
                text-align: left;
            }
            .shnuk-account-type-btn.active {
                border-color: var(--accent);
                background: var(--bg-hover);
            }
            .shnuk-account-type-title {
                font-size: 15px;
                font-weight: 700;
            }
            .shnuk-account-type-desc {
                font-size: 12px;
                color: var(--text-muted);
            }

            .shnuk-account-add-row {
                display: flex;
                gap: 10px;
            }
            .shnuk-account-friend-input {
                flex: 1;
                text-transform: uppercase;
                letter-spacing: 2px;
                font-family: 'Courier New', monospace;
                font-size: 16px;
            }

            .shnuk-account-btn {
                padding: 12px 20px;
                border: none;
                background: var(--accent);
                color: var(--text-on-accent);
                cursor: pointer;
                font-family: inherit;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.5px;
                transition: background 0.2s;
            }
            .shnuk-account-btn:hover {
                background: var(--accent-dark);
            }
            .shnuk-account-btn.secondary {
                background: var(--bg-primary);
                color: var(--text-primary);
                border: 2px solid var(--border-color);
            }
            .shnuk-account-btn.secondary:hover {
                background: var(--bg-hover);
            }
            .shnuk-account-btn.danger {
                background: none;
                color: var(--accent);
                border: 2px solid var(--accent);
                padding: 8px 14px;
            }
            .shnuk-account-btn.danger:hover {
                background: var(--accent);
                color: var(--text-on-accent);
            }

            .shnuk-account-empty {
                font-size: 13px;
                color: var(--text-muted);
                text-align: center;
                padding: 20px;
            }

            .shnuk-account-friends-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .shnuk-account-friend-row {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                background: var(--bg-primary);
                border: 2px solid var(--border-color);
            }
            .shnuk-account-friend-avatar {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: var(--bg-secondary);
                border: 2px solid var(--border-color);
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                flex-shrink: 0;
                font-size: 20px;
                font-weight: 700;
                color: var(--accent);
            }
            .shnuk-account-friend-avatar img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .shnuk-account-friend-info {
                flex: 1;
                min-width: 0;
            }
            .shnuk-account-friend-name {
                font-size: 15px;
                font-weight: 700;
                color: var(--text-primary);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .shnuk-account-friend-code {
                font-size: 12px;
                color: var(--text-muted);
                font-family: 'Courier New', monospace;
                letter-spacing: 1px;
            }

            @media (max-width: 500px) {
                .shnuk-account-content { padding: 16px; }
                .shnuk-account-section { padding: 16px; }
                .shnuk-account-avatar { width: 96px; height: 96px; font-size: 36px; }
                .shnuk-account-code { font-size: 18px; letter-spacing: 3px; }
                .shnuk-account-type-row { flex-direction: column; }
            }
        `;
        document.head.appendChild(style);
    }

    function getInitial() {
        if (!profile) return '?';
        if (profile.avatar) return null;
        if (profile.name) return profile.name.charAt(0).toUpperCase();
        return '?';
    }

    window.ShnukAccount = {
        getProfile: getProfile,
        getCode: getCode,
        getName: getName,
        getAvatar: getAvatar,
        getType: getType,
        getFriends: getFriends,
        isFriend: isFriend,
        getFriendByCode: getFriendByCode,
        addFriend: addFriend,
        removeFriend: removeFriend,
        setName: setName,
        setAvatar: setAvatar,
        setType: setType,
        open: open,
        close: close,
        renderInto: renderInto,
        getInitial: getInitial,
        ensure: ensureProfile
    };

    ensureProfile();

})();