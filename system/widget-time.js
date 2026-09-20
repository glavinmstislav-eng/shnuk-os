// widget-time.js

(function() {
    'use strict';

    function createTimeWidget() {
        const container = document.createElement('div');
        container.id = 'timeWidget';
        container.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: clamp(200px, 35vw, 320px);
            height: clamp(200px, 35vw, 320px);
            pointer-events: none;
            z-index: 2;
        `;

        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 320;
        canvas.style.cssText = 'width:100%;height:100%;display:block;';
        container.appendChild(canvas);

        const ctx = canvas.getContext('2d');

        function drawClock() {
            const now = new Date();
            const hours = now.getHours() % 12;
            const minutes = now.getMinutes();
            const seconds = now.getSeconds();

            const cx = 160;
            const cy = 160;
            const radius = 135;

            ctx.clearRect(0, 0, 320, 320);

            const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
            gradient.addColorStop(0, 'rgba(255,255,255,0.15)');
            gradient.addColorStop(0.5, 'rgba(255,255,255,0.08)');
            gradient.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, radius - 8, 0, Math.PI * 2);
            ctx.stroke();

            for (let i = 0; i < 60; i++) {
                const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
                const isHour = i % 5 === 0;
                const innerRadius = isHour ? radius - 25 : radius - 15;
                const outerRadius = radius - 6;
                ctx.strokeStyle = isHour ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)';
                ctx.lineWidth = isHour ? 3 : 1.5;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(angle) * innerRadius, cy + Math.sin(angle) * innerRadius);
                ctx.lineTo(cx + Math.cos(angle) * outerRadius, cy + Math.sin(angle) * outerRadius);
                ctx.stroke();
            }

            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = 'bold 22px ST-SimpleSquare, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (let i = 1; i <= 12; i++) {
                const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
                const x = cx + Math.cos(angle) * (radius - 40);
                const y = cy + Math.sin(angle) * (radius - 40);
                ctx.fillText(i, x, y);
            }

            const hourAngle = (hours + minutes / 60) / 12 * Math.PI * 2 - Math.PI / 2;
            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = 12;
            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(hourAngle) * (radius * 0.5), cy + Math.sin(hourAngle) * (radius * 0.5));
            ctx.stroke();

            const minAngle = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = 10;
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(minAngle) * (radius * 0.7), cy + Math.sin(minAngle) * (radius * 0.7));
            ctx.stroke();

            const secAngle = (seconds / 60) * Math.PI * 2 - Math.PI / 2;
            ctx.shadowColor = 'rgba(204,0,0,0.5)';
            ctx.shadowBlur = 15;
            ctx.strokeStyle = 'rgba(204,0,0,0.9)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(secAngle) * (radius * 0.75), cy + Math.sin(secAngle) * (radius * 0.75));
            ctx.stroke();

            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = 12;
            ctx.fillStyle = 'rgba(204,0,0,0.9)';
            ctx.beginPath();
            ctx.arc(cx, cy, 8, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.arc(cx, cy, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(204,0,0,0.5)';
            ctx.beginPath();
            ctx.arc(cx, cy - radius + 12, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        drawClock();
        const interval = setInterval(drawClock, 1000);

        return { 
            element: container, 
            interval: interval,
            draw: drawClock
        };
    }

    window.createTimeWidget = createTimeWidget;

})();