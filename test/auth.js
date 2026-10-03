// auth.js

(function() {
    'use strict';

    const USER_KEY = 'shnuk_user';

    let currentUser = null;
    let ready = false;
    let anonInitPromise = null;

    function readStored() {
        try {
            const raw = localStorage.getItem(USER_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && parsed.uid) return parsed;
            return null;
        } catch(e) { return null; }
    }

    function writeStored(user) {
        try {
            if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
            else localStorage.removeItem(USER_KEY);
        } catch(e) {}
    }

    function getUser() { return currentUser; }
    function isLoggedIn() { return !!currentUser; }
    function isAnonymous() { return !!(currentUser && currentUser.isAnonymous); }

    async function waitForFirebase() {
        if (window.__firebaseReady) {
            try { await window.__firebaseReady; } catch(e) {}
        }
    }

    async function waitForAuthResolve() {
        if (window.__firebaseAuthReady) {
            try { await window.__firebaseAuthReady; } catch(e) {}
        }
    }

    // Профиль из Firebase User
    function profileFromUser(user) {
        if (!user) return null;
        return {
            uid: user.uid,
            email: user.email || null,
            isAnonymous: !!user.isAnonymous,
            emailVerified: !!user.emailVerified,
            createdAt: (user.metadata && user.metadata.creationTime) || new Date().toISOString()
        };
    }

    // Запись профиля в Firestore (коллекция users)
    async function writeUserProfile(profile) {
        if (!profile || !window.firebaseDb || !window.firebaseSDK) return;
        try {
            const { doc, setDoc, serverTimestamp } = window.firebaseSDK;
            await setDoc(doc(window.firebaseDb, 'users', profile.uid), {
                uid: profile.uid,
                email: profile.email || null,
                isAnonymous: !!profile.isAnonymous,
                createdAt: profile.createdAt,
                updatedAt: serverTimestamp()
            }, { merge: true });
        } catch(e) {
            console.warn('[Auth] users write:', e);
        }
    }

    // Анонимный вход (создаёт пользователя, если его нет)
    async function ensureAnonymous() {
        if (anonInitPromise) return anonInitPromise;

        anonInitPromise = (async function() {
            await waitForFirebase();
            await waitForAuthResolve();

            if (!window.firebaseAuth || !window.firebaseAuthApi) {
                throw new Error('Firebase не готов');
            }

            // Если уже есть текущий пользователь (в т.ч. анонимный из localStorage)
            if (window.firebaseAuth.currentUser) {
                const profile = profileFromUser(window.firebaseAuth.currentUser);
                currentUser = profile;
                writeStored(profile);
                return profile;
            }

            // Пытаемся войти анонимно
            try {
                const cred = await window.firebaseAuthApi.signInAnonymously(window.firebaseAuth);
                const user = cred.user;
                try { await user.getIdToken(true); } catch(e) {}

                const profile = profileFromUser(user);
                currentUser = profile;
                writeStored(profile);
                await writeUserProfile(profile);
                return profile;
            } catch(e) {
                console.warn('[Auth] signInAnonymously error:', e);
                // Если анонимный вход запрещён в правилах/настройках — не рушим систему
                currentUser = null;
                writeStored(null);
                return null;
            }
        })();

        return anonInitPromise;
    }

    // Привязка email к анонимному аккаунту (если понадобится)
    async function linkEmail(email, password) {
        await waitForFirebase();
        if (!window.firebaseAuth || !window.firebaseAuth.currentUser) throw new Error('Нет пользователя');
        const user = window.firebaseAuth.currentUser;
        if (!user.isAnonymous) throw new Error('Аккаунт уже не анонимный');
        if (!window.firebaseAuthApi || !window.firebaseAuthApi.EmailAuthProvider) {
            throw new Error('EmailAuthProvider недоступен');
        }
        const credential = window.firebaseAuthApi.EmailAuthProvider.credential(email, password);
        const result = await window.firebaseAuthApi.linkWithCredential(user, credential);
        const profile = profileFromUser(result.user);
        currentUser = profile;
        writeStored(profile);
        await writeUserProfile(profile);
        return profile;
    }

    // Вход по email (если пользователь уже привязывал email раньше)
    async function signIn(email, password) {
        await waitForFirebase();
        if (!window.firebaseAuth || !window.firebaseAuthApi) throw new Error('Firebase не готов');
        const cred = await window.firebaseAuthApi.signInWithEmailAndPassword(window.firebaseAuth, email, password);
        const user = cred.user;
        try { await user.getIdToken(true); } catch(e) {}
        const profile = profileFromUser(user);
        currentUser = profile;
        writeStored(profile);
        await writeUserProfile(profile);
        return profile;
    }

    // Выход. После выхода автоматически создаётся новый анонимный пользователь
    async function signOut() {
        await waitForFirebase();
        if (window.firebaseAuth && window.firebaseAuthApi) {
            try { await window.firebaseAuthApi.signOut(window.firebaseAuth); } catch(e) {}
        }
        currentUser = null;
        writeStored(null);
        anonInitPromise = null;
        // Сразу логинимся заново анонимно
        try { await ensureAnonymous(); } catch(e) {}
    }

    async function sendReset(email) {
        await waitForFirebase();
        if (!window.firebaseAuth || !window.firebaseAuthApi) throw new Error('Firebase не готов');
        await window.firebaseAuthApi.sendPasswordResetEmail(window.firebaseAuth, email);
    }

    function init() {
        const stored = readStored();
        if (stored) currentUser = stored;
        ready = true;

        // Слушаем изменения состояния
        (async function() {
            await waitForFirebase();
            if (!window.firebaseAuth || !window.firebaseAuthApi) return;

            window.firebaseAuthApi.onAuthStateChanged(window.firebaseAuth, function(user) {
                if (user) {
                    const profile = profileFromUser(user);
                    currentUser = profile;
                    writeStored(profile);
                } else {
                    currentUser = null;
                    writeStored(null);
                    // Автоматически создаём нового анонимного
                    anonInitPromise = null;
                    ensureAnonymous().catch(function() {});
                }
            });
        })();
    }

    window.Auth = {
        init: init,
        isReady: function() { return ready; },
        getUser: getUser,
        isLoggedIn: isLoggedIn,
        isAnonymous: isAnonymous,
        ensureAnonymous: ensureAnonymous,
        linkEmail: linkEmail,
        signIn: signIn,
        signOut: signOut,
        sendReset: sendReset,
        waitForFirebase: waitForFirebase,
        waitForAuthResolve: waitForAuthResolve
    };

})();