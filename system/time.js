// time.js — Приложение часы

(function() {
    'use strict';

    let isOpen = false;
    let timerInterval = null;
    let stopwatchInterval = null;
    let clockInterval = null;
    let timerSeconds = 0;
    let timerTotal = 0;
    let stopwatchSeconds = 0;
    let stopwatchRunning = false;
    let timerRunning = false;
    let alarmTime = null;
    let alarmActive = false;
    let alarmTimeout = null;
    let alarmCheckInterval = null;
    let currentMode = 'analog';
    let currentPanel = 'main';

    let threeScene = null;
    let threeCamera = null;
    let threeRenderer = null;
    let threeEarth = null;
    let threeClouds = null;
    let threeAnimationId = null;
    let threeReady = false;
    let threeLoading = false;
    let threeContainer = null;

    function getThemeColors() {
        try {
            const style = getComputedStyle(document.documentElement);
            const bg = style.getPropertyValue('--bg-primary').trim() || '#ffffff';
            const text = style.getPropertyValue('--text-primary').trim() || '#1a1a1a';
            const muted = style.getPropertyValue('--text-muted').trim() || '#888888';
            const accent = style.getPropertyValue('--accent').trim() || '#cc0000';
            const onAccent = style.getPropertyValue('--text-on-accent').trim() || '#ffffff';
            return { bg, text, muted, accent, onAccent };
        } catch(e) {
            return { bg: '#ffffff', text: '#1a1a1a', muted: '#888888', accent: '#cc0000', onAccent: '#ffffff' };
        }
    }

    function isDarkTheme() {
        try {
            const theme = localStorage.getItem('shnuk_theme') || 'day';
            return theme === 'evening' || theme === 'warm-night';
        } catch(e) { return false; }
    }

    function hexToInt(hex) {
        if (!hex) return 0x000000;
        hex = String(hex).replace('#', '').trim();
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const n = parseInt(hex, 16);
        return isNaN(n) ? 0x000000 : n;
    }

    function pushLiveBar() {
        if (!window.LiveBar) return;
        if (stopwatchRunning) {
            window.LiveBar.set({
                type: 'stopwatch', appId: 'time',
                payload: { elapsed: stopwatchSeconds }
            });
        } else if (timerRunning) {
            window.LiveBar.set({
                type: 'timer', appId: 'time',
                payload: { remaining: timerSeconds, total: timerTotal }
            });
        } else if (alarmActive && alarmTime) {
            window.LiveBar.set({
                type: 'alarm', appId: 'time',
                payload: { time: alarmTime }
            });
        } else {
            window.LiveBar.clear();
        }
    }

    function openTime() {
        if (isOpen) {
            const ex = document.getElementById('timeApp');
            if (ex) { ex.style.display = 'flex'; ex.style.opacity = '1'; return; }
        }
        createUI();
    }

    function closeTime() {
        isOpen = false;
        const el = document.getElementById('timeApp');
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1'; }, 300);
        }
        document.removeEventListener('keydown', onKeyDown);
    }

    function destroy() {
        isOpen = false;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (stopwatchInterval) { clearInterval(stopwatchInterval); stopwatchInterval = null; }
        if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
        if (alarmTimeout) { clearTimeout(alarmTimeout); alarmTimeout = null; }
        if (alarmCheckInterval) { clearInterval(alarmCheckInterval); alarmCheckInterval = null; }
        timerRunning = false;
        stopwatchRunning = false;
        alarmActive = false;
        alarmTime = null;
        closeThree();
        document.removeEventListener('keydown', onKeyDown);
        const el = document.getElementById('timeApp');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        if (window.LiveBar) window.LiveBar.clear();
    }

    function closeThree() {
        if (threeAnimationId) {
            cancelAnimationFrame(threeAnimationId);
            threeAnimationId = null;
        }
        if (threeRenderer) {
            threeRenderer.dispose();
            if (threeRenderer.domElement && threeRenderer.domElement.parentNode) {
                threeRenderer.domElement.parentNode.removeChild(threeRenderer.domElement);
            }
            threeRenderer = null;
        }
        window.removeEventListener('resize', onThreeResize);
        if (threeEarth) {
            if (threeEarth.material) {
                if (threeEarth.material.map) threeEarth.material.map.dispose();
                threeEarth.material.dispose();
            }
            threeEarth = null;
        }
        if (threeClouds) {
            if (threeClouds.material) {
                if (threeClouds.material.map) threeClouds.material.map.dispose();
                threeClouds.material.dispose();
            }
            threeClouds = null;
        }
        threeScene = null;
        threeCamera = null;
        threeReady = false;
        threeLoading = false;
    }

    function initThree(container) {
        threeContainer = container;
        if (typeof THREE === 'undefined') {
            if (threeLoading) return;
            threeLoading = true;
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
            script.onload = function() { threeLoading = false; initThreeScene(container); };
            script.onerror = function() { threeLoading = false; };
            document.head.appendChild(script);
            return;
        }
        initThreeScene(container);
    }

    function drawGraticule(ctx, w, h, outlineColor) {
        ctx.strokeStyle = outlineColor;
        ctx.globalAlpha = 0.08;
        ctx.lineWidth = 0.8;

        for (let lon = -180; lon <= 180; lon += 15) {
            const x = (lon + 180) / 360 * w;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }

        for (let lat = -75; lat <= 75; lat += 15) {
            const y = (90 - lat) / 180 * h;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 1.2;
        const eqY = h / 2;
        ctx.beginPath();
        ctx.moveTo(0, eqY);
        ctx.lineTo(w, eqY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.stroke();

        ctx.globalAlpha = 1;
    }

    function createOutlineTexture() {
        const outlineColor = isDarkTheme() ? '#ffffff' : '#000000';

        const canvas = document.createElement('canvas');
        canvas.width = 4096;
        canvas.height = 2048;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        drawGraticule(ctx, canvas.width, canvas.height, outlineColor);

        function lonLatToXY(lon, lat) {
            return [
                (lon + 180) / 360 * canvas.width,
                (90 - lat) / 180 * canvas.height
            ];
        }

        function outline(points, lineWidth) {
            ctx.beginPath();
            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                const xy = lonLatToXY(p[0], p[1]);
                if (i === 0) ctx.moveTo(xy[0], xy[1]);
                else ctx.lineTo(xy[0], xy[1]);
            }
            ctx.closePath();
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = lineWidth || 2.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        function outlineOpen(points, lineWidth) {
            ctx.beginPath();
            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                const xy = lonLatToXY(p[0], p[1]);
                if (i === 0) ctx.moveTo(xy[0], xy[1]);
                else ctx.lineTo(xy[0], xy[1]);
            }
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = lineWidth || 2.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        outline([
            [-17, 15], [-16, 18], [-16, 21], [-17, 24], [-15, 26], [-13, 28],
            [-11, 29], [-9, 30], [-6, 33], [-2, 35], [1, 36], [5, 37],
            [8, 37], [10, 37], [11, 35], [11, 33], [13, 32], [16, 32],
            [20, 32], [24, 32], [28, 31], [32, 31], [34, 29], [35, 27],
            [37, 24], [38, 21], [39, 18], [40, 15], [42, 13], [43, 12],
            [44, 11], [46, 11], [48, 12], [51, 12], [52, 11], [51, 9],
            [50, 8], [48, 7], [46, 5], [44, 4], [42, 3], [41, 0],
            [41, -2], [40, -5], [40, -8], [39, -10], [40, -13], [40, -16],
            [38, -18], [36, -20], [35, -22], [34, -24], [33, -26], [32, -28],
            [31, -30], [30, -31], [28, -33], [26, -34], [24, -34], [22, -34],
            [20, -35], [18, -34], [18, -32], [17, -30], [16, -28], [15, -26],
            [14, -22], [13, -20], [12, -18], [11, -15], [10, -12], [9, -8],
            [9, -5], [10, -2], [9, 1], [9, 4], [7, 4], [5, 4], [3, 4],
            [1, 5], [-2, 5], [-5, 5], [-8, 4], [-11, 4], [-14, 7], [-16, 10]
        ], 3);

        outline([
            [-10, 36], [-9, 38], [-9, 41], [-9, 43], [-8, 44], [-6, 45],
            [-4, 46], [-2, 47], [-1, 48], [1, 49], [2, 51], [4, 52],
            [5, 53], [7, 54], [8, 55], [9, 57], [10, 58], [11, 59],
            [12, 60], [14, 62], [16, 64], [19, 65], [22, 66], [25, 66],
            [28, 67], [30, 68], [33, 69], [36, 69], [38, 70], [41, 70],
            [44, 70], [47, 70], [50, 71], [53, 72], [57, 72], [60, 72],
            [64, 73], [68, 73], [72, 74], [76, 75], [80, 75], [85, 75],
            [90, 76], [95, 77], [100, 77], [105, 76], [110, 75], [115, 74],
            [120, 73], [125, 72], [130, 72], [135, 72], [140, 72], [145, 71],
            [150, 70], [155, 69], [160, 68], [165, 67], [170, 66], [175, 65],
            [180, 65], [180, 60], [175, 60], [170, 60], [165, 60], [160, 60],
            [155, 60], [150, 58], [145, 56], [140, 55], [135, 55], [130, 54],
            [125, 52], [120, 51], [115, 50], [110, 50], [105, 50], [100, 50],
            [95, 50], [90, 50], [85, 50], [80, 50], [75, 50], [70, 50],
            [65, 50], [60, 50], [55, 50], [50, 48], [45, 47], [40, 47],
            [36, 45], [32, 45], [28, 45], [25, 44], [22, 43], [20, 42],
            [18, 42], [16, 42], [14, 42], [12, 44], [10, 43], [8, 43],
            [6, 43], [4, 43], [2, 42], [0, 42], [-2, 41], [-4, 40],
            [-6, 39], [-8, 38]
        ], 3);

        outline([
            [68, 24], [71, 24], [74, 25], [77, 26], [80, 26], [83, 25],
            [86, 24], [88, 23], [90, 22], [92, 21], [94, 21], [95, 20],
            [94, 18], [93, 16], [92, 14], [91, 12], [90, 10], [88, 9],
            [86, 9], [85, 10], [83, 12], [81, 14], [79, 16], [77, 17],
            [75, 17], [74, 16], [73, 14], [72, 12], [71, 10], [70, 8],
            [69, 10], [68, 12], [67, 14], [66, 16], [65, 18], [64, 20],
            [65, 22], [66, 23]
        ], 2.5);

        outline([
            [95, 10], [97, 8], [99, 7], [101, 6], [103, 4], [105, 2],
            [107, 1], [109, 0], [111, -1], [113, -3], [115, -4], [117, -5],
            [119, -6], [121, -7], [123, -7], [125, -7], [127, -6], [129, -5],
            [131, -4], [133, -3], [135, -3], [137, -4], [139, -5], [141, -6],
            [143, -7], [145, -7], [147, -7], [149, -7], [151, -7], [150, -8],
            [148, -8], [146, -8], [144, -8], [142, -8], [140, -8], [138, -7],
            [136, -6], [134, -5], [132, -4], [130, -3], [128, -2], [126, -1],
            [124, 0], [122, 1], [120, 2], [118, 3], [116, 4], [114, 5],
            [112, 6], [110, 7], [108, 8], [106, 9], [104, 10], [102, 10],
            [100, 10], [98, 10]
        ], 2.5);

        outline([
            [113, -22], [113, -20], [114, -18], [116, -17], [118, -16],
            [120, -15], [122, -14], [124, -14], [126, -13], [128, -13],
            [130, -12], [132, -11], [134, -11], [136, -12], [138, -13],
            [140, -14], [142, -15], [144, -16], [146, -17], [148, -18],
            [150, -19], [152, -21], [153, -23], [154, -25], [153, -27],
            [152, -29], [151, -31], [150, -33], [149, -35], [147, -37],
            [145, -38], [143, -38], [141, -38], [139, -37], [137, -36],
            [135, -35], [133, -34], [131, -33], [129, -33], [127, -33],
            [125, -34], [123, -34], [121, -34], [119, -34], [117, -33],
            [115, -32], [114, -30], [113, -28], [113, -26]
        ], 3);

        outline([
            [-168, 65], [-166, 67], [-164, 68], [-162, 69], [-160, 70],
            [-158, 70], [-156, 71], [-154, 71], [-152, 71], [-150, 70],
            [-148, 70], [-146, 70], [-144, 70], [-142, 70], [-140, 70],
            [-138, 69], [-136, 69], [-134, 68], [-132, 68], [-130, 68],
            [-128, 68], [-126, 69], [-124, 69], [-122, 69], [-120, 70],
            [-118, 70], [-116, 70], [-114, 70], [-112, 70], [-110, 70],
            [-108, 69], [-106, 69], [-104, 68], [-102, 68], [-100, 68],
            [-98, 68], [-96, 67], [-94, 66], [-92, 65], [-90, 64],
            [-88, 63], [-86, 62], [-84, 61], [-82, 60], [-80, 59],
            [-78, 58], [-76, 57], [-74, 56], [-72, 55], [-70, 54],
            [-68, 53], [-66, 52], [-64, 51], [-62, 50], [-60, 49],
            [-58, 48], [-56, 47], [-54, 46], [-52, 45], [-54, 44],
            [-56, 44], [-58, 43], [-60, 43], [-62, 42], [-64, 41],
            [-66, 40], [-68, 39], [-70, 38], [-72, 37], [-74, 36],
            [-76, 35], [-78, 34], [-80, 32], [-81, 30], [-82, 28],
            [-83, 26], [-84, 24], [-85, 22], [-86, 21], [-87, 20],
            [-88, 19], [-89, 18], [-90, 18], [-91, 19], [-92, 20],
            [-94, 21], [-96, 22], [-98, 23], [-100, 24], [-102, 26],
            [-104, 27], [-106, 29], [-108, 30], [-110, 32], [-112, 33],
            [-114, 35], [-116, 36], [-118, 37], [-120, 38], [-122, 39],
            [-124, 40], [-126, 42], [-128, 44], [-130, 46], [-132, 48],
            [-134, 50], [-136, 52], [-138, 54], [-140, 56], [-142, 58],
            [-144, 60], [-146, 60], [-148, 60], [-150, 60], [-152, 60],
            [-154, 60], [-156, 60], [-158, 60], [-160, 60], [-162, 62],
            [-164, 63], [-166, 64]
        ], 3);

        outline([
            [-92, 15], [-90, 15], [-88, 16], [-86, 16], [-84, 15],
            [-82, 14], [-80, 12], [-79, 10], [-78, 8], [-77, 8],
            [-78, 9], [-80, 10], [-82, 10], [-84, 11], [-86, 12],
            [-88, 13], [-90, 14]
        ], 2);

        outline([
            [-78, 8], [-77, 9], [-76, 10], [-75, 10], [-74, 11],
            [-73, 11], [-72, 11], [-71, 11], [-70, 12], [-68, 12],
            [-66, 11], [-64, 11], [-62, 11], [-60, 10], [-58, 9],
            [-56, 8], [-54, 7], [-52, 5], [-50, 4], [-48, 2],
            [-46, 0], [-44, -1], [-42, -2], [-40, -3], [-38, -5],
            [-36, -6], [-35, -8], [-36, -10], [-38, -12], [-40, -14],
            [-42, -16], [-44, -18], [-46, -20], [-48, -22], [-50, -24],
            [-52, -26], [-54, -28], [-56, -30], [-58, -32], [-60, -34],
            [-62, -36], [-64, -38], [-66, -40], [-68, -42], [-70, -44],
            [-72, -46], [-73, -48], [-74, -50], [-75, -52], [-74, -54],
            [-73, -55], [-72, -54], [-71, -52], [-70, -50], [-69, -48],
            [-68, -46], [-67, -44], [-66, -42], [-65, -40], [-64, -38],
            [-63, -36], [-62, -34], [-61, -32], [-60, -30], [-59, -28],
            [-58, -26], [-57, -24], [-56, -22], [-55, -20], [-54, -18],
            [-53, -16], [-52, -14], [-51, -12], [-50, -10], [-49, -8],
            [-48, -6], [-47, -4], [-46, -2], [-45, 0], [-44, 2],
            [-46, 3], [-48, 4], [-50, 5], [-52, 6], [-54, 7],
            [-56, 8], [-58, 9], [-60, 10], [-62, 11], [-64, 12],
            [-66, 13], [-68, 14], [-70, 15], [-72, 16], [-74, 17],
            [-76, 18], [-78, 19], [-80, 20], [-82, 21], [-84, 22],
            [-86, 23], [-88, 24], [-90, 25], [-92, 26], [-94, 27],
            [-96, 28], [-98, 29], [-100, 30], [-102, 32], [-104, 34],
            [-106, 36], [-108, 38], [-110, 40], [-112, 42], [-114, 44],
            [-116, 46], [-118, 48], [-120, 50], [-122, 52], [-124, 54],
            [-126, 56], [-128, 58], [-130, 60], [-132, 62], [-134, 64],
            [-136, 66], [-138, 68], [-140, 70], [-142, 72], [-144, 74],
            [-146, 76], [-148, 78], [-150, 80], [-152, 82], [-154, 84],
            [-156, 86], [-158, 88], [-160, 90]
        ], 3);

        outline([
            [-52, 60], [-54, 62], [-56, 64], [-58, 66], [-58, 68],
            [-56, 70], [-54, 72], [-50, 74], [-46, 76], [-42, 78],
            [-38, 80], [-34, 82], [-30, 83], [-26, 83], [-22, 82],
            [-20, 80], [-22, 78], [-26, 76], [-30, 74], [-34, 72],
            [-38, 70], [-42, 68], [-46, 66], [-50, 64], [-52, 62]
        ], 2.5);

        const antPts = [];
        for (let lon = -180; lon <= 180; lon += 5) {
            const wobble = Math.sin(lon * 0.15) * 6 + Math.sin(lon * 0.4) * 3;
            antPts.push([lon, -68 + wobble]);
        }
        outlineOpen(antPts, 2.5);

        outline([
            [43, -12], [44, -14], [45, -16], [46, -18], [47, -20],
            [48, -22], [49, -24], [50, -26], [49, -28], [48, -30],
            [47, -32], [46, -34], [45, -34], [44, -32], [44, -30],
            [43, -28], [43, -26], [42, -24], [42, -22], [42, -20],
            [42, -18], [42, -16], [42, -14], [43, -12]
        ], 2);

        outline([
            [-5, 50], [-6, 51], [-6, 52], [-5, 53], [-4, 54],
            [-3, 55], [-2, 56], [-1, 57], [0, 58], [-1, 59],
            [-2, 59], [-3, 58], [-4, 57], [-5, 56], [-6, 55],
            [-7, 54], [-7, 53], [-8, 52], [-7, 51], [-6, 50]
        ], 2);

        outline([
            [-10, 51], [-10, 52], [-10, 53], [-9, 54], [-8, 55],
            [-7, 55], [-6, 54], [-6, 53], [-7, 52], [-8, 51]
        ], 1.8);

        outline([
            [-24, 64], [-23, 65], [-22, 66], [-20, 66], [-18, 66],
            [-16, 66], [-14, 66], [-13, 65], [-15, 64], [-17, 63],
            [-19, 63], [-21, 63], [-23, 64]
        ], 2);

        outline([
            [129, 32], [130, 33], [131, 34], [133, 35], [135, 36],
            [136, 37], [138, 38], [140, 40], [141, 41], [141, 42],
            [140, 43], [139, 42], [138, 41], [137, 40], [136, 39],
            [135, 38], [134, 37], [133, 36], [131, 35], [130, 34],
            [129, 33]
        ], 2);

        outline([
            [120, 18], [121, 17], [122, 16], [123, 15], [124, 13],
            [125, 12], [126, 11], [126, 10], [125, 9], [124, 8],
            [122, 8], [121, 9], [120, 10], [119, 11], [118, 12],
            [117, 13], [116, 15], [115, 16], [114, 17], [113, 18],
            [112, 18], [111, 18], [112, 17], [114, 16], [116, 15],
            [117, 14], [118, 14], [119, 15], [120, 16]
        ], 2);

        outline([
            [166, -46], [167, -45], [168, -44], [170, -43], [172, -42],
            [174, -41], [175, -40], [176, -39], [177, -38], [178, -37],
            [177, -36], [176, -37], [175, -38], [173, -39], [171, -40],
            [169, -41], [167, -42], [166, -43], [165, -44], [166, -45]
        ], 1.8);

        outline([
            [168, -47], [170, -46], [172, -45], [174, -44], [173, -45],
            [171, -46], [169, -47], [167, -47]
        ], 1.8);

        outline([
            [-85, 22], [-83, 23], [-81, 23], [-79, 23], [-77, 22],
            [-75, 21], [-74, 20], [-76, 20], [-78, 20], [-80, 21],
            [-82, 21], [-84, 21]
        ], 1.5);

        outline([[80, 9], [81, 9], [82, 8], [82, 7], [81, 6], [80, 7], [80, 8]], 1.5);
        outline([[120, 25], [121, 24], [122, 23], [121, 22], [120, 23]], 1.3);
        outline([[32, 35], [33, 35], [34, 35], [33, 34], [32, 35]], 1.3);
        outline([[24, 36], [25, 35], [26, 35], [27, 35], [26, 36], [25, 36]], 1.3);
        outline([[9, 39], [10, 39], [10, 40], [10, 41], [9, 41], [9, 40]], 1.3);
        outline([[9, 42], [10, 42], [10, 43], [9, 43], [8, 42]], 1.3);
        outline([[13, 37], [14, 37], [15, 37], [15, 38], [14, 38], [13, 38]], 1.3);

        const texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 8;
        return texture;
    }

    function createCloudsTexture() {
        const outlineColor = isDarkTheme() ? '#ffffff' : '#000000';
        const rgbMatch = outlineColor === '#ffffff' ? '255,255,255' : '0,0,0';

        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        function spiral(cx, cy, size, turns, lineWidth) {
            ctx.beginPath();
            const steps = 200;
            for (let i = 0; i < steps; i++) {
                const t = i / steps;
                const angle = t * Math.PI * 2 * turns;
                const r = size * t;
                const x = cx + Math.cos(angle) * r;
                const y = cy + Math.sin(angle) * r * 0.55;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = 'rgba(' + rgbMatch + ',0.35)';
            ctx.lineWidth = lineWidth || 1.5;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        for (let i = 0; i < 60; i++) {
            const cx = Math.random() * canvas.width;
            const cy = 50 + Math.random() * (canvas.height - 100);
            const size = 30 + Math.random() * 80;
            const turns = 1.2 + Math.random() * 1.5;
            spiral(cx, cy, size, turns, 1 + Math.random() * 1.5);
        }

        for (let i = 0; i < 400; i++) {
            const x = Math.random() * canvas.width;
            const y = 50 + Math.random() * (canvas.height - 100);
            const len = 20 + Math.random() * 60;
            const angle = Math.random() * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
            ctx.strokeStyle = 'rgba(' + rgbMatch + ',' + (0.1 + Math.random() * 0.25).toFixed(2) + ')';
            ctx.lineWidth = 0.8 + Math.random() * 1.2;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        for (let i = 0; i < 300; i++) {
            const lat = -30 + Math.random() * 60;
            const lon = -180 + Math.random() * 360;
            const x = (lon + 180) / 360 * canvas.width;
            const y = (90 - lat) / 180 * canvas.height;
            const r = 1 + Math.random() * 3;
            ctx.fillStyle = 'rgba(' + rgbMatch + ',' + (0.15 + Math.random() * 0.25).toFixed(2) + ')';
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 8;
        return texture;
    }

    function initThreeScene(container) {
        try {
            closeThree();

            const colors = getThemeColors();
            const bgInt = hexToInt(colors.bg);

            const width = container.clientWidth || window.innerWidth;
            const height = container.clientHeight || window.innerHeight;

            threeScene = new THREE.Scene();
            threeScene.background = new THREE.Color(bgInt);

            threeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
            threeCamera.position.set(0, 0, 3.2);
            threeCamera.lookAt(0, 0, 0);

            threeRenderer = new THREE.WebGLRenderer({ antialias: true });
            threeRenderer.setSize(width, height);
            threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            threeRenderer.setClearColor(bgInt, 1);
            container.appendChild(threeRenderer.domElement);

            const ambient = new THREE.AmbientLight(0xffffff, 1);
            threeScene.add(ambient);

            const earthGeo = new THREE.SphereGeometry(1, 96, 96);
            const earthMat = new THREE.MeshBasicMaterial({
                map: createOutlineTexture(),
                transparent: true,
                depthWrite: false,
                side: THREE.FrontSide
            });
            threeEarth = new THREE.Mesh(earthGeo, earthMat);
            threeEarth.rotation.z = 0.41;
            threeScene.add(threeEarth);

            const cloudGeo = new THREE.SphereGeometry(1.006, 96, 96);
            const cloudMat = new THREE.MeshBasicMaterial({
                map: createCloudsTexture(),
                transparent: true,
                depthWrite: false,
                opacity: 0.9,
                side: THREE.FrontSide
            });
            threeClouds = new THREE.Mesh(cloudGeo, cloudMat);
            threeClouds.rotation.z = 0.41;
            threeScene.add(threeClouds);

            threeReady = true;

            function animate() {
                threeAnimationId = requestAnimationFrame(animate);
                if (threeEarth) threeEarth.rotation.y += 0.0012;
                if (threeClouds) threeClouds.rotation.y += 0.0018;
                if (threeRenderer && threeScene && threeCamera) {
                    threeRenderer.render(threeScene, threeCamera);
                }
            }
            animate();

            window.addEventListener('resize', onThreeResize);

        } catch(e) {
            console.warn('[Time] Three.js ошибка:', e);
        }
    }

    function refreshThreeTheme() {
        if (!threeReady || !threeContainer) return;
        initThreeScene(threeContainer);
    }

    function onThreeResize() {
        if (!threeRenderer || !threeCamera) return;
        const container = document.getElementById('timeBg3D');
        if (!container) return;
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        threeCamera.aspect = width / height;
        threeCamera.updateProjectionMatrix();
        threeRenderer.setSize(width, height);
    }

    function createUI() {
        if (document.getElementById('timeApp')) {
            document.getElementById('timeApp').style.display = 'flex';
            return;
        }
        isOpen = true;

        const app = document.createElement('div');
        app.id = 'timeApp';
        app.style.cssText = `
            position: fixed;
            top: var(--livebar-h, 44px);
            left: 0;
            width: 100%;
            height: calc(100% - var(--livebar-h, 44px));
            background: var(--bg-primary);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            font-family: 'ST-SimpleSquare', monospace;
            color: var(--text-primary);
            opacity: 0;
            animation: timeFadeIn 0.3s ease forwards;
            overflow: hidden;
            transition: background 0.4s ease, color 0.4s ease;
        `;

        if (!document.getElementById('timeStyles')) {
            const style = document.createElement('style');
            style.id = 'timeStyles';
            style.textContent = `
                @keyframes timeFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes timePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
                @keyframes timeMenuIn {
                    from { opacity: 0; filter: blur(20px); transform: translateY(-10px) scale(0.95); }
                    to { opacity: 1; filter: blur(0); transform: translateY(0) scale(1); }
                }
                @keyframes timeMenuOut {
                    from { opacity: 1; filter: blur(0); transform: translateY(0) scale(1); }
                    to { opacity: 0; filter: blur(20px); transform: translateY(-10px) scale(0.95); }
                }

                .time-bg-3d {
                    position: absolute;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    z-index: 0;
                    pointer-events: none;
                    background: var(--bg-primary);
                }
                .time-bg-3d canvas {
                    display: block;
                    width: 100% !important;
                    height: 100% !important;
                    background: var(--bg-primary);
                }

                .time-header {
                    position: relative;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    background: var(--header-bg);
                    border-bottom: 2px solid var(--border-color);
                    flex-shrink: 0;
                    z-index: 10;
                    color: var(--header-text);
                }
                .time-header h1 {
                    font-size: 18px;
                    font-weight: 600;
                    margin: 0;
                    letter-spacing: 0.5px;
                }
                .time-header-actions {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }
                .time-menu-btn {
                    width: 40px;
                    height: 40px;
                    background: var(--bg-primary);
                    border: 2px solid var(--border-color);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-primary);
                    transition: all 0.2s ease;
                    padding: 0;
                    -webkit-tap-highlight-color: transparent;
                }
                .time-menu-btn:hover {
                    border-color: var(--accent);
                    background: var(--bg-hover);
                }
                .time-menu-btn:active { transform: scale(0.94); }
                .time-menu-btn svg { display: block; width: 22px; height: 22px; }
                .time-close-btn {
                    width: 40px;
                    height: 40px;
                    background: var(--accent);
                    border: 2px solid var(--accent);
                    color: var(--text-on-accent);
                    cursor: pointer;
                    font-size: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: 'ST-SimpleSquare', monospace;
                    transition: all 0.2s ease;
                    -webkit-tap-highlight-color: transparent;
                    padding: 0;
                }
                .time-close-btn:hover {
                    background: var(--accent-dark);
                    border-color: var(--accent-dark);
                    color: var(--text-on-accent);
                }
                .time-close-btn:active { transform: scale(0.94); }

                .time-menu-dropdown {
                    position: absolute;
                    top: 68px;
                    right: 20px;
                    background: var(--bg-primary);
                    border: 2px solid var(--border-color);
                    min-width: 220px;
                    z-index: 100;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.15);
                    padding: 8px;
                    animation: timeMenuIn 0.35s cubic-bezier(0.22, 1, 0.36, 1);
                }
                .time-menu-dropdown.closing {
                    animation: timeMenuOut 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                }
                .time-menu-section-title {
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: var(--text-muted);
                    padding: 10px 14px 6px;
                    font-weight: 600;
                }
                .time-menu-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    width: 100%;
                    padding: 11px 14px;
                    background: none;
                    border: none;
                    color: var(--text-primary);
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 14px;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    -webkit-tap-highlight-color: transparent;
                }
                .time-menu-item:hover {
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                }
                .time-menu-item.active {
                    background: var(--accent);
                    color: var(--text-on-accent);
                }
                .time-menu-item.active:hover {
                    background: var(--accent);
                    color: var(--text-on-accent);
                }
                .time-menu-item .mi-icon {
                    width: 18px;
                    height: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    opacity: 0.85;
                }
                .time-menu-item .mi-icon svg { width: 100%; height: 100%; display: block; }

                .time-content {
                    position: relative;
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px 20px 40px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    z-index: 5;
                    box-sizing: border-box;
                    background: transparent;
                }

                .clock-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    max-width: 500px;
                }
                .clock-canvas-wrapper {
                    position: relative;
                    width: 280px;
                    height: 280px;
                    margin: 0 auto;
                }
                .clock-canvas-wrapper canvas {
                    width: 100%;
                    height: 100%;
                    display: block;
                }
                .digital-time {
                    font-size: 72px;
                    font-weight: 700;
                    color: var(--text-primary);
                    letter-spacing: 6px;
                    text-align: center;
                    padding: 20px 0;
                    display: none;
                }
                .digital-time .seconds {
                    font-size: 36px;
                    color: var(--text-muted);
                    letter-spacing: 2px;
                }
                .digital-time .blink {
                    animation: timePulse 1s step-end infinite;
                }
                .date-display {
                    font-size: 15px;
                    color: var(--text-muted);
                    letter-spacing: 2px;
                    margin-top: 12px;
                    text-align: center;
                }

                .time-panel {
                    width: 100%;
                    max-width: 400px;
                    padding: 20px 0;
                    display: none;
                }
                .time-panel.active {
                    display: block;
                }

                .timer-display {
                    font-size: 56px;
                    font-weight: 700;
                    text-align: center;
                    letter-spacing: 4px;
                    padding: 16px 0;
                    color: var(--text-primary);
                }
                .timer-controls {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                    flex-wrap: wrap;
                    margin-top: 12px;
                }
                .timer-controls button {
                    padding: 12px 26px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 14px;
                    transition: all 0.2s ease;
                    min-width: 90px;
                }
                .timer-controls button:hover {
                    background: var(--bg-secondary);
                    border-color: var(--accent);
                }
                .timer-controls button.primary {
                    background: var(--accent);
                    color: var(--text-on-accent);
                    border-color: var(--accent);
                }
                .timer-controls button.primary:hover {
                    background: var(--accent-dark);
                }
                .timer-controls button.danger {
                    border-color: var(--accent);
                    color: var(--accent);
                    background: var(--bg-primary);
                }
                .timer-controls button.danger:hover {
                    background: var(--accent);
                    color: var(--text-on-accent);
                }
                .timer-input {
                    display: flex;
                    gap: 8px;
                    justify-content: center;
                    align-items: center;
                    margin-top: 8px;
                }
                .timer-input input {
                    width: 64px;
                    padding: 10px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-size: 20px;
                    text-align: center;
                    font-family: 'ST-SimpleSquare', monospace;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .timer-input input:focus {
                    border-color: var(--accent);
                }
                .timer-input span {
                    font-size: 18px;
                    color: var(--text-muted);
                }

                .alarm-section {
                    padding: 8px 0;
                }
                .alarm-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 14px 0;
                    border-bottom: 1px solid var(--border-color);
                }
                .alarm-row:last-child { border-bottom: none; }
                .alarm-label {
                    font-size: 13px;
                    color: var(--text-muted);
                    letter-spacing: 0.5px;
                }
                .alarm-time {
                    font-size: 26px;
                    font-weight: 600;
                    color: var(--text-primary);
                    letter-spacing: 2px;
                }
                .alarm-toggle {
                    width: 48px;
                    height: 28px;
                    background: var(--border-color);
                    border: none;
                    border-radius: 14px;
                    cursor: pointer;
                    position: relative;
                    transition: background 0.3s;
                    padding: 0;
                }
                .alarm-toggle.active { background: var(--accent); }
                .alarm-toggle::after {
                    content: '';
                    position: absolute;
                    top: 2px; left: 2px;
                    width: 24px; height: 24px;
                    background: var(--bg-primary);
                    border-radius: 50%;
                    transition: transform 0.3s;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .alarm-toggle.active::after {
                    transform: translateX(20px);
                }
                .alarm-set {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    justify-content: center;
                    margin-top: 16px;
                }
                .alarm-set input {
                    width: 56px;
                    padding: 10px;
                    border: 2px solid var(--border-color);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-size: 18px;
                    text-align: center;
                    font-family: 'ST-SimpleSquare', monospace;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .alarm-set input:focus {
                    border-color: var(--accent);
                }
                .alarm-set span {
                    font-size: 18px;
                    color: var(--text-muted);
                }
                .alarm-set button {
                    padding: 12px 24px;
                    border: 2px solid var(--accent);
                    background: var(--accent);
                    color: var(--text-on-accent);
                    cursor: pointer;
                    font-family: 'ST-SimpleSquare', monospace;
                    font-size: 14px;
                    transition: background 0.2s;
                }
                .alarm-set button:hover {
                    background: var(--accent-dark);
                }
                .alarm-status {
                    margin-top: 16px;
                    font-size: 13px;
                    color: var(--text-muted);
                    text-align: center;
                }

                @media (max-width: 500px) {
                    .time-header { padding: 12px 16px; }
                    .time-header h1 { font-size: 16px; }
                    .time-menu-dropdown { top: 60px; right: 12px; min-width: 200px; }
                    .time-content { padding: 20px 16px 30px; }
                    .clock-canvas-wrapper { width: 220px; height: 220px; }
                    .digital-time { font-size: 48px; letter-spacing: 4px; }
                    .digital-time .seconds { font-size: 24px; }
                    .timer-display { font-size: 42px; }
                    .date-display { font-size: 13px; }
                    .timer-controls button { padding: 10px 18px; font-size: 13px; min-width: 80px; }
                    .timer-input input { width: 54px; font-size: 18px; }
                }
            `;
            document.head.appendChild(style);
        }

        const header = document.createElement('div');
        header.className = 'time-header';
        header.innerHTML = `
            <h1>Часы</h1>
            <div class="time-header-actions">
                <button class="time-menu-btn" id="timeMenuBtn" title="Меню">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="4" y1="7" x2="20" y2="7"/>
                        <line x1="4" y1="12" x2="20" y2="12"/>
                        <line x1="4" y1="17" x2="20" y2="17"/>
                    </svg>
                </button>
                <button class="time-close-btn" id="timeCloseBtn" title="Закрыть">✕</button>
            </div>
        `;

        const bg3d = document.createElement('div');
        bg3d.className = 'time-bg-3d';
        bg3d.id = 'timeBg3D';

        const content = document.createElement('div');
        content.className = 'time-content';

        const clockContainer = document.createElement('div');
        clockContainer.className = 'clock-container';
        clockContainer.id = 'clockContainer';
        clockContainer.innerHTML = `
            <div class="clock-canvas-wrapper"><canvas id="clockCanvas" width="280" height="280"></canvas></div>
            <div class="digital-time" id="digitalTime">
                <span id="digitalHours">00</span><span class="blink">:</span>
                <span id="digitalMinutes">00</span><span class="blink">:</span>
                <span class="seconds" id="digitalSeconds">00</span>
            </div>
            <div class="date-display" id="dateDisplay"></div>
        `;
        content.appendChild(clockContainer);

        const timerPanel = document.createElement('div');
        timerPanel.className = 'time-panel';
        timerPanel.id = 'panelTimer';
        timerPanel.innerHTML = `
            <div class="timer-display" id="timerDisplay">00:00</div>
            <div class="timer-input">
                <input type="number" id="timerMinutes" min="0" max="99" value="1" />
                <span>мин</span>
                <input type="number" id="timerSeconds" min="0" max="59" value="0" />
                <span>сек</span>
            </div>
            <div class="timer-controls">
                <button class="primary" id="timerStartBtn">Старт</button>
                <button id="timerPauseBtn">Пауза</button>
                <button class="danger" id="timerResetBtn">Сброс</button>
            </div>
        `;
        content.appendChild(timerPanel);

        const stopwatchPanel = document.createElement('div');
        stopwatchPanel.className = 'time-panel';
        stopwatchPanel.id = 'panelStopwatch';
        stopwatchPanel.innerHTML = `
            <div class="timer-display" id="stopwatchDisplay">00:00.0</div>
            <div class="timer-controls">
                <button class="primary" id="stopwatchStartBtn">Старт</button>
                <button id="stopwatchPauseBtn">Пауза</button>
                <button class="danger" id="stopwatchResetBtn">Сброс</button>
            </div>
        `;
        content.appendChild(stopwatchPanel);

        const alarmPanel = document.createElement('div');
        alarmPanel.className = 'time-panel';
        alarmPanel.id = 'panelAlarm';
        alarmPanel.innerHTML = `
            <div class="alarm-section">
                <div class="alarm-row">
                    <span class="alarm-label">Будильник</span>
                    <button class="alarm-toggle" id="alarmToggle"></button>
                </div>
                <div class="alarm-row">
                    <span class="alarm-label">Время</span>
                    <span class="alarm-time" id="alarmTimeDisplay">--:--</span>
                </div>
                <div class="alarm-set">
                    <input type="number" id="alarmHour" min="0" max="23" placeholder="ЧЧ" />
                    <span>:</span>
                    <input type="number" id="alarmMinute" min="0" max="59" placeholder="ММ" />
                    <button id="alarmSetBtn">Установить</button>
                </div>
                <div class="alarm-status" id="alarmStatus">Будильник выключен</div>
            </div>
        `;
        content.appendChild(alarmPanel);

        app.appendChild(bg3d);
        app.appendChild(header);
        app.appendChild(content);
        document.body.appendChild(app);

        initThree(bg3d);

        const canvas = document.getElementById('clockCanvas');
        const ctx = canvas.getContext('2d');

        function drawClock() {
            const now = new Date();
            const hours = now.getHours() % 12;
            const minutes = now.getMinutes();
            const seconds = now.getSeconds();
            const w = canvas.width, h = canvas.height;
            const cx = w / 2, cy = h / 2;
            const radius = Math.min(w, h) / 2 - 20;

            const colors = getThemeColors();

            ctx.clearRect(0, 0, w, h);

            ctx.fillStyle = colors.bg;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = colors.text;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.stroke();

            for (let i = 0; i < 60; i++) {
                const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
                const isH = i % 5 === 0;
                const inner = isH ? radius - 20 : radius - 10;
                const outer = radius - 4;
                ctx.strokeStyle = isH ? colors.text : colors.muted;
                ctx.lineWidth = isH ? 2.5 : 1;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
                ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
                ctx.stroke();
            }

            ctx.fillStyle = colors.text;
            ctx.font = 'bold 18px ST-SimpleSquare, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let i = 1; i <= 12; i++) {
                const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
                ctx.fillText(i, cx + Math.cos(a) * (radius - 32), cy + Math.sin(a) * (radius - 32));
            }

            const ha = (hours + minutes / 60) / 12 * Math.PI * 2 - Math.PI / 2;
            ctx.strokeStyle = colors.text;
            ctx.lineWidth = 5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(ha) * (radius * 0.5), cy + Math.sin(ha) * (radius * 0.5));
            ctx.stroke();

            const ma = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
            ctx.strokeStyle = colors.text;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(ma) * (radius * 0.7), cy + Math.sin(ma) * (radius * 0.7));
            ctx.stroke();

            const sa = (seconds / 60) * Math.PI * 2 - Math.PI / 2;
            ctx.strokeStyle = colors.accent;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(sa) * (radius * 0.78), cy + Math.sin(sa) * (radius * 0.78));
            ctx.stroke();

            ctx.fillStyle = colors.accent;
            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = colors.bg;
            ctx.beginPath();
            ctx.arc(cx, cy, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        function updateTime() {
            const now = new Date();
            if (currentMode === 'analog') drawClock();
            document.getElementById('digitalHours').textContent = String(now.getHours()).padStart(2, '0');
            document.getElementById('digitalMinutes').textContent = String(now.getMinutes()).padStart(2, '0');
            document.getElementById('digitalSeconds').textContent = String(now.getSeconds()).padStart(2, '0');
            const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
            const ds = now.toLocaleDateString('ru-RU', opts);
            document.getElementById('dateDisplay').textContent = ds.charAt(0).toUpperCase() + ds.slice(1);
        }

        updateTime();
        clockInterval = setInterval(updateTime, 1000);

        function switchMode(mode) {
            currentMode = mode;
            document.querySelector('.clock-canvas-wrapper').style.display = mode === 'analog' ? 'block' : 'none';
            document.getElementById('digitalTime').style.display = mode === 'digital' ? 'block' : 'none';
            updateMenuActive();
        }

        function switchPanel(id) {
            currentPanel = id;
            document.querySelectorAll('.time-panel').forEach(p => p.classList.remove('active'));
            const p = document.getElementById('panel' + id.charAt(0).toUpperCase() + id.slice(1));
            if (p) p.classList.add('active');
            clockContainer.style.display = id === 'main' ? 'flex' : 'none';
            updateMenuActive();
        }

        let menuDropdown = null;
        let isMenuOpen = false;

        function buildMenu() {
            const items = [
                { id: 'main', label: 'Часы', section: 'Разделы' },
                { id: 'timer', label: 'Таймер', section: null },
                { id: 'stopwatch', label: 'Секундомер', section: null },
                { id: 'alarm', label: 'Будильник', section: null },
                { id: 'analog', label: 'Аналоговые', section: 'Отображение' },
                { id: 'digital', label: 'Цифровые', section: null }
            ];

            menuDropdown = document.createElement('div');
            menuDropdown.className = 'time-menu-dropdown';
            menuDropdown.id = 'timeMenuDropdown';

            const icons = {
                main: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
                timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="9" y1="2" x2="15" y2="2"/></svg>',
                stopwatch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="8"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="9" y1="2" x2="15" y2="2"/><line x1="19" y1="4" x2="21" y2="6"/></svg>',
                alarm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7"/><polyline points="12 9 12 13 15 15"/><path d="M5 3 L2 6"/><path d="M19 3 L22 6"/></svg>',
                analog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="12" x2="12" y2="7"/><line x1="12" y1="12" x2="16" y2="14"/></svg>',
                digital: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="16" y1="10" x2="16" y2="14"/></svg>'
            };

            items.forEach(item => {
                if (item.section) {
                    const t = document.createElement('div');
                    t.className = 'time-menu-section-title';
                    t.textContent = item.section;
                    menuDropdown.appendChild(t);
                }
                const btn = document.createElement('button');
                btn.className = 'time-menu-item';
                btn.dataset.id = item.id;
                btn.innerHTML = `
                    <span class="mi-icon">${icons[item.id] || ''}</span>
                    <span>${item.label}</span>
                `;
                btn.addEventListener('click', function() {
                    const id = this.dataset.id;
                    if (id === 'main' || id === 'timer' || id === 'stopwatch' || id === 'alarm') {
                        switchPanel(id);
                    } else if (id === 'analog' || id === 'digital') {
                        switchMode(id);
                    }
                    closeMenu();
                });
                menuDropdown.appendChild(btn);
            });

            app.appendChild(menuDropdown);
            updateMenuActive();
        }

        function updateMenuActive() {
            if (!menuDropdown) return;
            menuDropdown.querySelectorAll('.time-menu-item').forEach(btn => {
                const id = btn.dataset.id;
                let active = false;
                if (id === currentPanel) active = true;
                if ((id === 'analog' || id === 'digital') && id === currentMode && currentPanel === 'main') active = true;
                btn.classList.toggle('active', active);
            });
        }

        function openMenu() {
            if (isMenuOpen) { closeMenu(); return; }
            isMenuOpen = true;
            if (!menuDropdown) buildMenu();
            menuDropdown.classList.remove('closing');
            menuDropdown.style.display = 'block';
        }

        function closeMenu() {
            if (!isMenuOpen) return;
            isMenuOpen = false;
            if (!menuDropdown) return;
            const m = menuDropdown;
            m.classList.add('closing');
            setTimeout(() => {
                m.style.display = 'none';
                m.classList.remove('closing');
            }, 280);
        }

        document.getElementById('timeMenuBtn').addEventListener('click', function(e) {
            e.stopPropagation();
            openMenu();
        });

        document.addEventListener('click', function(e) {
            if (!isMenuOpen || !menuDropdown) return;
            if (!menuDropdown.contains(e.target) && !e.target.closest('#timeMenuBtn')) {
                closeMenu();
            }
        });

        document.getElementById('timeCloseBtn').addEventListener('click', closeTime);

        function updateTimerDisplay() {
            const m = Math.floor(timerSeconds / 60);
            const s = timerSeconds % 60;
            document.getElementById('timerDisplay').textContent =
                String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        }

        function startTimer() {
            if (timerInterval) return;
            if (timerSeconds === 0) {
                const m = parseInt(document.getElementById('timerMinutes').value) || 0;
                const s = parseInt(document.getElementById('timerSeconds').value) || 0;
                timerSeconds = m * 60 + s;
                timerTotal = timerSeconds;
                if (timerSeconds <= 0) return;
                updateTimerDisplay();
            }
            timerRunning = true;
            timerInterval = setInterval(() => {
                timerSeconds--;
                updateTimerDisplay();
                if (window.LiveBar) window.LiveBar.update({ remaining: timerSeconds });
                if (timerSeconds <= 0) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                    timerRunning = false;
                    timerSeconds = 0;
                    timerTotal = 0;
                    document.getElementById('timerStartBtn').textContent = 'Старт';
                    document.getElementById('timerMinutes').value = 1;
                    document.getElementById('timerSeconds').value = 0;
                    updateTimerDisplay();
                    if (window.LiveBar) window.LiveBar.clear();
                }
            }, 1000);
            document.getElementById('timerStartBtn').textContent = 'Стоп';
            pushLiveBar();
        }

        function pauseTimer() {
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
                timerRunning = false;
                document.getElementById('timerStartBtn').textContent = 'Продолжить';
                if (window.LiveBar) window.LiveBar.clear();
            }
        }

        function resetTimer() {
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
            timerRunning = false;
            timerSeconds = 0;
            timerTotal = 0;
            updateTimerDisplay();
            document.getElementById('timerStartBtn').textContent = 'Старт';
            if (window.LiveBar) window.LiveBar.clear();
        }

        function updateStopwatchDisplay() {
            const m = Math.floor(stopwatchSeconds / 60);
            const s = Math.floor(stopwatchSeconds % 60);
            const t = Math.floor((stopwatchSeconds % 1) * 10);
            document.getElementById('stopwatchDisplay').textContent =
                String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + t;
        }

        function startStopwatch() {
            if (stopwatchInterval) return;
            stopwatchRunning = true;
            stopwatchInterval = setInterval(() => {
                stopwatchSeconds += 0.1;
                updateStopwatchDisplay();
                if (window.LiveBar) window.LiveBar.update({ elapsed: stopwatchSeconds });
            }, 100);
            document.getElementById('stopwatchStartBtn').textContent = 'Стоп';
            pushLiveBar();
        }

        function pauseStopwatch() {
            if (stopwatchInterval) {
                clearInterval(stopwatchInterval);
                stopwatchInterval = null;
                stopwatchRunning = false;
                document.getElementById('stopwatchStartBtn').textContent = 'Продолжить';
                if (window.LiveBar) window.LiveBar.clear();
            }
        }

        function resetStopwatch() {
            if (stopwatchInterval) { clearInterval(stopwatchInterval); stopwatchInterval = null; }
            stopwatchRunning = false;
            stopwatchSeconds = 0;
            updateStopwatchDisplay();
            document.getElementById('stopwatchStartBtn').textContent = 'Старт';
            if (window.LiveBar) window.LiveBar.clear();
        }

        function setAlarm() {
            const h = parseInt(document.getElementById('alarmHour').value);
            const m = parseInt(document.getElementById('alarmMinute').value);
            if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return;
            alarmTime = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
            document.getElementById('alarmTimeDisplay').textContent = alarmTime;
            document.getElementById('alarmStatus').textContent = 'Будильник установлен на ' + alarmTime;
            alarmActive = true;
            document.getElementById('alarmToggle').classList.add('active');
            document.getElementById('alarmSetBtn').textContent = 'Изменить';
            pushLiveBar();
            if (alarmCheckInterval) clearInterval(alarmCheckInterval);
            alarmCheckInterval = setInterval(function() {
                if (!alarmActive || !alarmTime) return;
                const now = new Date();
                const cur = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
                if (cur === alarmTime && now.getSeconds() === 0) triggerAlarm();
            }, 1000);
        }

        function toggleAlarm() {
            alarmActive = !alarmActive;
            document.getElementById('alarmToggle').classList.toggle('active', alarmActive);
            if (alarmActive && alarmTime) {
                document.getElementById('alarmStatus').textContent = 'Будильник включён на ' + alarmTime;
            } else {
                document.getElementById('alarmStatus').textContent = 'Будильник выключен';
            }
            pushLiveBar();
        }

        function triggerAlarm() {
            if (alarmTimeout) return;
            document.getElementById('alarmStatus').textContent = 'Будильник сработал';
            document.getElementById('alarmStatus').style.color = 'var(--accent)';
            try {
                const ac = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ac.createOscillator();
                const g = ac.createGain();
                osc.connect(g);
                g.connect(ac.destination);
                osc.frequency.value = 800;
                osc.type = 'square';
                g.gain.value = 0.3;
                osc.start();
                setTimeout(() => osc.stop(), 3000);
            } catch(e) {}
            alarmTimeout = setTimeout(() => {
                alarmTimeout = null;
                alarmActive = false;
                alarmTime = null;
                document.getElementById('alarmStatus').textContent = 'Будильник выключен';
                document.getElementById('alarmStatus').style.color = 'var(--text-muted)';
                document.getElementById('alarmToggle').classList.remove('active');
                document.getElementById('alarmTimeDisplay').textContent = '--:--';
                document.getElementById('alarmSetBtn').textContent = 'Установить';
                if (alarmCheckInterval) { clearInterval(alarmCheckInterval); alarmCheckInterval = null; }
                if (window.LiveBar) window.LiveBar.clear();
            }, 5000);
        }

        document.getElementById('timerStartBtn').addEventListener('click', startTimer);
        document.getElementById('timerPauseBtn').addEventListener('click', pauseTimer);
        document.getElementById('timerResetBtn').addEventListener('click', resetTimer);
        document.getElementById('stopwatchStartBtn').addEventListener('click', startStopwatch);
        document.getElementById('stopwatchPauseBtn').addEventListener('click', pauseStopwatch);
        document.getElementById('stopwatchResetBtn').addEventListener('click', resetStopwatch);
        document.getElementById('alarmSetBtn').addEventListener('click', setAlarm);
        document.getElementById('alarmToggle').addEventListener('click', toggleAlarm);

        document.addEventListener('keydown', onKeyDown);
        switchMode('analog');
        switchPanel('main');

        window.addEventListener('shnuk:theme-changed', function() {
            if (currentMode === 'analog') drawClock();
            refreshThreeTheme();
        });
    }

    function onKeyDown(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') {
            const menu = document.getElementById('timeMenuDropdown');
            if (menu && menu.style.display === 'block') {
                menu.style.display = 'none';
                return;
            }
            closeTime();
        }
    }

    window.Time = { destroy: destroy };
    window.timeInit = function() { openTime(); };

})();