// system-v.js — определение устройства Shnuk OS

(function() {
    'use strict';

    const DEVICE_KEY = 'shnuk_device';

    // Допустимые устройства
    const DEVICES = {
        'blaze2': {
            id: 'blaze2',
            name: 'Shnuk 2 Blaze',
            description: 'Флагман, вашему телефону уже больше недели! Он у вас уже не маленький :)',
            image: 'blaze2.png',
            supportUntil: '2026-12-20T00:00:00'
        },
        'blaze3': {
            id: 'blaze3',
            name: 'Shnuk 3 Blaze',
            description: 'Ультра флагман, новинка! Вы обладаете новейшим устройством, вы заплатили за него не зря!',
            image: 'blaze3.png',
            supportUntil: '2026-12-30T00:00:00'
        },
        'base2': {
            id: 'base2',
            name: 'Shnuk 2',
            description: 'Неплохой вариант, брат :)',
            image: 'base2.png',
            supportUntil: '2026-11-20T00:00:00'
        },
        'base3': {
            id: 'base3',
            name: 'Shnuk 3',
            description: 'А ты знаешь толк в Шнюках!',
            image: 'base3.png',
            supportUntil: '2026-11-30T00:00:00'
        }
    };

    function getDeviceId() {
        try {
            const saved = localStorage.getItem(DEVICE_KEY);
            if (saved && DEVICES[saved]) return saved;
        } catch(e) {}
        return 'base3';
    }

    function setDeviceId(id) {
        if (!id || !DEVICES[id]) return false;
        try {
            localStorage.setItem(DEVICE_KEY, id);
            return true;
        } catch(e) {
            return false;
        }
    }

    function getDevice() {
        return DEVICES[getDeviceId()];
    }

    function getAllDevices() {
        return Object.keys(DEVICES).map(function(k) { return DEVICES[k]; });
    }

    window.SystemV = {
        getDeviceId: getDeviceId,
        setDeviceId: setDeviceId,
        getDevice: getDevice,
        getAllDevices: getAllDevices,
        DEVICES: DEVICES
    };

})();