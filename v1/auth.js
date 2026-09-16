// auth.js

(function() {
    'use strict';

    const USER_KEY = 'shnuk_user';

    let currentUser = null;
    let ready = false;

    function readStored() {
        try {
            const raw = localStorage.getItem(USER_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && parsed.uid && parsed.email) return parsed;
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

    async function waitForFirebase() {
        if (window.__firebaseReady) {
            try { await window.__firebaseReady; } catch(e) {}
        }
    }

    async function waitForAuthResolve() {
        if (window.__firebaseAuthReady) {
            try { await window.__firebaseAuthReady; } catch(e) {}
        }
        if (window.firebaseAuth) {
            let tries = 0;
            while (!window.firebaseAuth.currentUser && tries < 30) {
                tries++;
                await new Promise(function(r) { setTimeout(r, 100); });
            }
        }
    }

    async function ensureFreshToken() {
        await waitForFirebase();
        if (!window.firebaseAuth || !window.firebaseAuth.currentUser) return false;
        try {
            await window.firebaseAuth.currentUser.getIdToken(true);
            return true;
        } catch(e) {
            return false;
        }
    }

    async function signUp(email, password) {
        await waitForFirebase();
        if (!window.firebaseAuth || !window.firebaseAuthApi) throw new Error('Firebase не готов');

        const cred = await window.firebaseAuthApi.createUserWithEmailAndPassword(window.firebaseAuth, email, password);
        const user = cred.user;
        try { await user.getIdToken(true); } catch(e) {}

        const profile = {
            uid: user.uid,
            email: user.email,
            createdAt: new Date().toISOString()
        };
        currentUser = profile;
        writeStored(profile);

        try {
            if (window.firebaseDb && window.firebaseSDK) {
                const { doc, setDoc, serverTimestamp } = window.firebaseSDK;
                await setDoc(doc(window.firebaseDb, 'users', user.uid), {
                    uid: user.uid,
                    email: user.email,
                    createdAt: profile.createdAt,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }
        } catch(e) {
            console.warn('[Auth] users write:', e);
        }

        try { await window.firebaseAuthApi.sendEmailVerification(user); } catch(e) {}
        return profile;
    }

    async function signIn(email, password) {
        await waitForFirebase();
        if (!window.firebaseAuth || !window.firebaseAuthApi) throw new Error('Firebase не готов');

        const cred = await window.firebaseAuthApi.signInWithEmailAndPassword(window.firebaseAuth, email, password);
        const user = cred.user;
        try { await user.getIdToken(true); } catch(e) {}

        const profile = {
            uid: user.uid,
            email: user.email,
            createdAt: new Date().toISOString()
        };
        currentUser = profile;
        writeStored(profile);
        return profile;
    }

    async function signOut() {
        await waitForFirebase();
        if (window.firebaseAuth && window.firebaseAuthApi) {
            try { await window.firebaseAuthApi.signOut(window.firebaseAuth); } catch(e) {}
        }
        currentUser = null;
        writeStored(null);
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

        (async function() {
            await waitForFirebase();
            if (!window.firebaseAuth || !window.firebaseAuthApi) return;
            window.firebaseAuthApi.onAuthStateChanged(window.firebaseAuth, function(user) {
                if (user) {
                    const profile = {
                        uid: user.uid,
                        email: user.email,
                        emailVerified: user.emailVerified,
                        createdAt: (user.metadata && user.metadata.creationTime) || new Date().toISOString()
                    };
                    currentUser = profile;
                    writeStored(profile);
                } else {
                    currentUser = null;
                    writeStored(null);
                }
            });
        })();
    }

    window.Auth = {
        init: init,
        isReady: function() { return ready; },
        getUser: getUser,
        isLoggedIn: isLoggedIn,
        signUp: signUp,
        signIn: signIn,
        signOut: signOut,
        sendReset: sendReset,
        waitForFirebase: waitForFirebase,
        waitForAuthResolve: waitForAuthResolve,
        ensureFreshToken: ensureFreshToken
    };

})();