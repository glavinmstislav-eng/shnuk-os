// system-v.js — определение модели устройства Shnuk

(function() {
    'use strict';

    if (window.SystemV) return;

    const STORAGE_KEY = 'shnuk_device_model';
    const PARAM_KEY = 'model';

    const MODELS = {
        blaze2: {
            id: 'blaze2',
            name: 'Shnuk 2 Blaze',
            description: 'Флагман, вашему телефону уже больше недели! Он у вас уже не маленький :)',
            supportUntil: '2026-12-20T00:00:00',
            image: 'blaze2.png'
        },
        blaze3: {
            id: 'blaze3',
            name: 'Shnuk 3 Blaze',
            description: 'Ультра флагман, новинка! Вы обладаете новейшим устройством, вы заплатили за него не зря!',
            supportUntil: '2026-12-30T00:00:00',
            image: 'blaze3.png'
        },
        base2: {
            id: 'base2',
            name: 'Shnuk 2',
            description: 'Неплохой вариант, брат :)',
            supportUntil: '2026-11-20T00:00:00',
            image: 'base2.png'
        },
        base3: {
            id: 'base3',
            name: 'Shnuk 3',
            description: 'А ты знаешь толк в Шнюках!',
            supportUntil: '2026-11-30T00:00:00',
            image: 'base3.png'
        }
    };

    const MODEL_IDS = ['blaze2', 'blaze3', 'base2', 'base3'];

    function readStored() {
        try {
            const v = localStorage.getItem(STORAGE_KEY);
            if (v && MODELS[v]) return v;
        } catch(e) {}
        return null;
    }

    function writeStored(id) {
        try { localStorage.setItem(STORAGE_KEY, id); } catch(e) {}
    }

    function readFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search);
            const v = params.get(PARAM_KEY);
            if (v && MODELS[v]) return v;
        } catch(e) {}
        return null;
    }

    function pickRandom() {
        return MODEL_IDS[Math.floor(Math.random() * MODEL_IDS.length)];
    }

    function detect() {
        const fromUrl = readFromUrl();
        if (fromUrl) {
            writeStored(fromUrl);
            return fromUrl;
        }
        const stored = readStored();
        if (stored) return stored;
        const rand = pickRandom();
        writeStored(rand);
        return rand;
    }

    function getModelId() {
        const stored = readStored();
        if (stored) return stored;
        return detect();
    }

    function getModel() {
        const id = getModelId();
        return MODELS[id] || MODELS.blaze2;
    }

    function getModelById(id) {
        return MODELS[id] || null;
    }

    function setModel(id) {
        if (!MODELS[id]) return false;
        writeStored(id);
        window.dispatchEvent(new CustomEvent('shnuk:device-changed', { detail: { model: id } }));
        return true;
    }

    function reset() {
        try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
    }

    function init() {
        const fromUrl = readFromUrl();
        if (fromUrl) {
            writeStored(fromUrl);
        } else if (!readStored()) {
            const rand = pickRandom();
            writeStored(rand);
        }
    }

    window.SystemV = {
        init: init,
        getModel: getModel,
        getModelId: getModelId,
        getModelById: getModelById,
        setModel: setModel,
        reset: reset,
        MODELS: MODELS,
        MODEL_IDS: MODEL_IDS,
        STORAGE_KEY: STORAGE_KEY
    };

    init();

})();