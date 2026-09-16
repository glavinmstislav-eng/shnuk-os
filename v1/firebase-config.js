// firebase-config.js

(function() {
    'use strict';

    const FIREBASE_VERSION = '10.12.2';

    const firebaseConfig = {
        apiKey: "AIzaSyDAZ15bLluLSs54kL_hJoadThI2nyuFmwA",
        authDomain: "shnuk-os.firebaseapp.com",
        projectId: "shnuk-os",
        storageBucket: "shnuk-os.firebasestorage.app",
        messagingSenderId: "805283898561",
        appId: "1:805283898561:web:2d4c441de1df3a12502040",
        measurementId: "G-LD7ZQDS93V"
    };

    window.__firebaseConfig = firebaseConfig;
    window.__firebaseVersion = FIREBASE_VERSION;

    window.__firebaseReady = (async function() {
        try {
            const base = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/';
            const bootstrap = document.createElement('script');
            bootstrap.type = 'module';
            bootstrap.textContent = `
                import { initializeApp } from '${base}firebase-app.js';
                import {
                    getAuth,
                    setPersistence,
                    browserLocalPersistence,
                    onAuthStateChanged,
                    createUserWithEmailAndPassword,
                    signInWithEmailAndPassword,
                    signOut as fbSignOut,
                    sendEmailVerification,
                    sendPasswordResetEmail
                } from '${base}firebase-auth.js';
                import {
                    getFirestore,
                    doc,
                    setDoc,
                    getDoc,
                    updateDoc,
                    deleteDoc,
                    collection,
                    query,
                    where,
                    getDocs,
                    onSnapshot,
                    serverTimestamp
                } from '${base}firebase-firestore.js';

                const cfg = window.__firebaseConfig;
                const app = initializeApp(cfg);

                let analytics = null;
                try {
                    const mod = await import('${base}firebase-analytics.js');
                    analytics = mod.getAnalytics(app);
                } catch(e) {}

                const auth = getAuth(app);
                const db = getFirestore(app);

                try {
                    await setPersistence(auth, browserLocalPersistence);
                } catch(e) {}

                window.firebaseApp = app;
                window.firebaseAuth = auth;
                window.firebaseDb = db;
                window.firebaseAnalytics = analytics;

                window.firebaseAuthApi = {
                    onAuthStateChanged,
                    createUserWithEmailAndPassword,
                    signInWithEmailAndPassword,
                    signOut: fbSignOut,
                    sendEmailVerification,
                    sendPasswordResetEmail
                };

                window.firebaseSDK = {
                    doc, setDoc, getDoc, updateDoc, deleteDoc,
                    collection, query, where, getDocs,
                    onSnapshot,
                    serverTimestamp
                };

                window.__firebaseAuthReady = new Promise(function(resolve) {
                    const unsub = onAuthStateChanged(auth, function(user) {
                        window.__firebaseCurrentUser = user;
                        unsub();
                        resolve(user);
                    }, function() {
                        window.__firebaseCurrentUser = null;
                        resolve(null);
                    });
                });

                window.dispatchEvent(new CustomEvent('firebase:ready'));
            `;
            document.head.appendChild(bootstrap);

            await new Promise(function(resolve) {
                if (window.firebaseSDK) { resolve(); return; }
                window.addEventListener('firebase:ready', resolve, { once: true });
                setTimeout(resolve, 8000);
            });

            if (window.__firebaseAuthReady) {
                try { await window.__firebaseAuthReady; } catch(e) {}
            }

            return !!(window.firebaseAuth && window.firebaseDb && window.firebaseSDK);
        } catch(e) {
            console.error('[Firebase] init error:', e);
            return false;
        }
    })();

})();