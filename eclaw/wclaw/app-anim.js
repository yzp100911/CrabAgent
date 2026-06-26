(function() {
    const canvas = document.getElementById('particles-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let mouseX = 0, mouseY = 0;
    let animationId;
    let heartCx = 0, heartCy = 0, heartScale = 0;

    const heartOutlinePoints = [];
    function generateHeartOutline() {
        heartOutlinePoints.length = 0;
        const numPoints = 100;
        for (let i = 0; i < numPoints; i++) {
            const t = (i / numPoints) * Math.PI * 2;
            const x = 16 * Math.pow(Math.sin(t), 3);
            const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
            heartOutlinePoints.push({x, y});
        }
    }
    generateHeartOutline();

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function isDarkMode() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 3 + 1;
            this.speedX = (Math.random() - 0.5) * 2;
            this.speedY = (Math.random() - 0.5) * 2;
            const hue = Math.random() * 60 + 200;
            const saturation = isDarkMode() ? 80 : 70;
            const lightness = isDarkMode() ? 60 : 50;
            this.color = `hsla(${hue}, ${saturation}%, ${lightness}%, ${Math.random() * 0.5 + 0.5})`;
            this.glowColor = `hsla(${hue}, ${saturation}%, ${lightness + 20}%, 0.8)`;
        }

        update() {
            let speedMultiplier = 1;
            let minDistance = Infinity;

            if (heartScale > 0) {
                for (let i = 0; i < heartOutlinePoints.length; i++) {
                    const pt = heartOutlinePoints[i];
                    const hx = heartCx + pt.x * heartScale;
                    const hy = heartCy + pt.y * heartScale;
                    const dist = Math.hypot(this.x - hx, this.y - hy);
                    if (dist < minDistance) {
                        minDistance = dist;
                    }
                }

                if (minDistance < 100) {
                    // 将减速范围扩大到 100 像素
                    const ratio = minDistance / 100;
                    // 使用二次方曲线（ratio * ratio），让粒子靠近轮廓时迅速减速，最低速度降至 2%
                    speedMultiplier = 0.02 + (ratio * ratio) * 0.98;
                }
            }

            this.x += this.speedX * speedMultiplier;
            this.y += this.speedY * speedMultiplier;

            const distMouse = Math.hypot(this.x - mouseX, this.y - mouseY);
            if (distMouse < 150) {
                const angle = Math.atan2(mouseY - this.y, mouseX - this.x);
                const force = (150 - distMouse) / 150;
                this.x -= Math.cos(angle) * force * 2;
                this.y -= Math.sin(angle) * force * 2;
            }

            if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
            if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.shadowBlur = 15;
            ctx.shadowColor = this.glowColor;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    function drawLines() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dist = Math.hypot(particles[i].x - particles[j].x, particles[i].y - particles[j].y);
                if (dist < 120) {
                    const opacity = (1 - dist / 120) * 0.5;
                    const isDark = isDarkMode();
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = isDark 
                        ? `rgba(100, 180, 255, ${opacity})`
                        : `rgba(0, 122, 255, ${opacity})`;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
        }
    }

    function drawConnectionsToMouse() {
        for (let i = 0; i < particles.length; i++) {
            const dist = Math.hypot(particles[i].x - mouseX, particles[i].y - mouseY);
            if (dist < 200) {
                const opacity = (1 - dist / 200) * 0.8;
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(mouseX, mouseY);
                ctx.strokeStyle = `rgba(120, 200, 255, ${opacity})`;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        }
    }

    function drawGradientBackground() {
        const isDark = isDarkMode();
        const gradient = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, 0,
            canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 2
        );
        if (isDark) {
            gradient.addColorStop(0, '#1e243b');
            gradient.addColorStop(1, '#0b0e17');
        } else {
            gradient.addColorStop(0, '#f4f7ff');
            gradient.addColorStop(1, '#e6efff');
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function init() {
        resize();
        particles = [];
        // 恢复爱心轮廓（背景）粒子的数量，保持不变
        const numParticles = Math.min(Math.floor((canvas.width * canvas.height) / 10000), 135);
        for (let i = 0; i < numParticles; i++) {
            particles.push(new Particle());
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGradientBackground();
        drawLines();

        const hc = document.getElementById('heart-canvas');
        if (hc && hc.offsetParent) {
            const rect = hc.getBoundingClientRect();
            heartCx = rect.left + rect.width / 2;
            heartCy = rect.top + rect.height / 2;
            heartScale = Math.min(rect.width, rect.height) / 45;
        } else {
            heartScale = 0;
        }
        
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        
        drawConnectionsToMouse();
        animationId = requestAnimationFrame(animate);
    }

    window.addEventListener('resize', () => {
        resize();
        init();
    });

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        init();
    });

    init();
    animate();
})();

(function() {
    const canvas = document.getElementById('heart-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let width = 0, height = 0;
    let hueOffset = 0;

    function resize() {
        const rect = canvas.parentElement.getBoundingClientRect();
        width = canvas.width = rect.width;
        height = canvas.height = rect.height;
    }

    window.addEventListener('resize', resize);
    resize();

    class HeartParticle {
        constructor() {
            this.reset(true);
        }

        reset(initial = false) {
            const t = Math.random() * Math.PI * 2;
            // 爱心数学公式
            const x = 16 * Math.pow(Math.sin(t), 3);
            const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));

            // 放大比例，让心形完整显示在屏幕中心区域
            const scale = Math.min(width, height) / 45; 
            
            // 目标位置（爱心轮廓上的位置），增加偏移让心形有厚度和内部填充
            // 大幅减少内部填充的比例，让更多的粒子集中在轮廓上
            const isInner = Math.random() > 0.95; // 仅 5% 的粒子填充在爱心内部（之前是15%）
            let finalScale = scale;
            if (isInner) {
                finalScale = scale * Math.sqrt(Math.random());
            } else {
                // 进一步收紧轮廓厚度，让轮廓显得更清晰且密集
                finalScale = scale * (0.98 + Math.random() * 0.04); 
            }
            
            this.targetX = x * finalScale;
            this.targetY = y * finalScale;
            
            this.life = initial ? Math.random() : 1; 
            this.decay = Math.random() * 0.002 + 0.0008; // 寿命衰减减半，大幅降低汇聚速度
            
            // 初始随机位置（在全屏大范围散开，准备汇聚）
            const spawnRadius = Math.max(width, height) * (0.5 + Math.random() * 0.5);
            const spawnAngle = Math.random() * Math.PI * 2;
            this.startX = Math.cos(spawnAngle) * spawnRadius;
            this.startY = Math.sin(spawnAngle) * spawnRadius;
            
            // 随机颜色
            this.baseHue = Math.random() * 360; 
        }

        update() {
            this.life -= this.decay;
            if (this.life <= 0) {
                this.reset();
            }
        }

        draw() {
            // progress 从 0 到 1，表示汇聚进度
            const progress = 1 - this.life;
            // 使用三次缓出函数（Cubic ease-out），让汇聚在末端更自然地减速停留
            const ease = 1 - Math.pow(1 - progress, 3);
            
            // 当前位置：从 startX/Y 平滑移动到 targetX/Y
            const currentX = this.startX * (1 - ease) + this.targetX * ease;
            const currentY = this.startY * (1 - ease) + this.targetY * ease;

            // 越往中间粒子越小（整体缩小为一半，原来是 life*4，现在减半）
            const size = Math.max(0.3, this.life * 2 + Math.random() * 0.5);

            // 越往中间越亮 (lightness 增加)
            const lightness = 50 + progress * 30; // 50% 到 80%
            
            // 透明度：出生和消亡时平滑过渡
            let alpha = this.life > 0.9 ? (1 - this.life) * 10 : (this.life < 0.1 ? this.life * 10 : 1);
            alpha = Math.min(1, Math.max(0, alpha));

            // 色相有轻微变化
            const hue = (this.baseHue + hueOffset) % 360;

            ctx.beginPath();
            ctx.arc(currentX, currentY, size, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${hue}, 100%, ${lightness}%, ${alpha})`;
            
            // 发光效果，越往中间发光越强，流光溢彩
            ctx.shadowBlur = 5 + progress * 15; 
            ctx.shadowColor = `hsla(${hue}, 100%, 70%, ${alpha})`;
            ctx.fill();
            ctx.shadowBlur = 0; // 重置
        }
    }

    // 减少聊天界面中那些汇聚粒子的数量（再减少30%）
    for (let i = 0; i < 800; i++) {
        particles.push(new HeartParticle());
    }

    function animateHeart() {
        requestAnimationFrame(animateHeart);
        
        // 在手机端（屏幕宽度小于 768px 时）暂停爱心粒子的渲染，节省 CPU 和电量
        if (window.innerWidth <= 768) {
            return;
        }

        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.globalCompositeOperation = 'lighter'; // 叠加发光

        particles.forEach(p => {
            p.update();
            p.draw();
        });

        ctx.restore();
        hueOffset += 0.2; // 缓慢改变整体色调
    }

    animateHeart();
})();

(function() {
    const mascot = document.getElementById('login-mascot');
    const pupils = document.querySelectorAll('.mascot-pupil');
    const face = document.querySelector('.mascot-face');
    if (!mascot || !pupils.length) return;

    const loginInputs = document.querySelectorAll('.login-card input');
    
    function lookAt(targetX, targetY) {
        let avgX = 0;
        let avgY = 0;

        pupils.forEach(pupil => {
            const eye = pupil.parentElement;
            const eyeRect = eye.getBoundingClientRect();
            const eyeX = eyeRect.left + eyeRect.width / 2;
            const eyeY = eyeRect.top + eyeRect.height / 2;
            
            const angle = Math.atan2(targetY - eyeY, targetX - eyeX);
            const distance = Math.min(5, Math.hypot(targetX - eyeX, targetY - eyeY) / 30);
            
            const x = Math.cos(angle) * distance;
            const y = Math.sin(angle) * distance;
            
            pupil.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
            avgX += x;
            avgY += y;
        });

        if (face) {
            face.style.transform = `translate(${avgX / pupils.length * 1.5}px, ${avgY / pupils.length * 1.5}px)`;
        }
    }

    function lookAtElement(element) {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const inputX = rect.left + rect.width / 2;
        const inputY = rect.top + rect.height / 2;
        lookAt(inputX, inputY);
    }

    let isFocused = false;
    let currentFocusedElement = null;

    document.addEventListener('mousemove', (e) => {
        if (mascot.classList.contains('hide-face')) return; // 捂脸时不跟随鼠标
        if (isFocused && currentFocusedElement) {
            // 如果焦点在输入框，优先看输入框
            lookAtElement(currentFocusedElement);
        } else {
            // 否则看鼠标
            lookAt(e.clientX, e.clientY);
        }
    });

    function resetEyes() {
        if (!isFocused) {
            pupils.forEach(pupil => {
                pupil.style.transform = `translate(-50%, -50%)`;
            });
            if (face) {
                face.style.transform = `translate(0px, 0px)`;
            }
        }
    }

    loginInputs.forEach(input => {
        input.addEventListener('focus', (e) => {
            isFocused = true;
            currentFocusedElement = e.target;
            if (e.target.type === 'password' || e.target.id.toLowerCase().includes('password') || e.target.id.toLowerCase().includes('pwd')) {
                mascot.classList.add('hide-face');
            } else {
                mascot.classList.remove('hide-face');
                lookAtElement(e.target);
            }
        });
        
        input.addEventListener('input', (e) => {
            if (e.target.type !== 'password' && !e.target.id.toLowerCase().includes('password') && !e.target.id.toLowerCase().includes('pwd')) {
                lookAtElement(e.target);
            }
        });

        input.addEventListener('blur', (e) => {
            isFocused = false;
            currentFocusedElement = null;
            if (e.target.type === 'password' || e.target.id.toLowerCase().includes('password') || e.target.id.toLowerCase().includes('pwd')) {
                mascot.classList.remove('hide-face');
            }
            // blur 时如果鼠标还在屏幕上，mousemove 会接管，不需要在这里强制 reset
        });
    });
})();
