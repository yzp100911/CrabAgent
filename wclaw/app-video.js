// app-video.js — 视频实时 YOLO26 识别面板 v3（优化版）
(function() {
    'use strict';

    var detectRunning = false;
    var isPaused = false;        // 暂停检测循环
    var detectTimer = null;
    var videoStream = null;
    var lastFrameTime = 0;
    var trackHistory = {};
    var _captureCanvas = null;   // 离屏 canvas，复用避免每帧 GC
    var enabledClasses = null;   // null=全部启用，Set=仅选中类别
    var allKnownClasses = [];    // 所有出现过的类别（用于显示禁用的 chip）

    // ======================== 标注样式系统 ========================
    var currentAnnoStyle = 'box';   // box | corner | ellipse | circle | dot
    var ANNO_STYLES = ['box', 'corner', 'ellipse', 'circle', 'dot'];
    var ANNO_STYLE_NAMES = { box: '框', corner: '角', ellipse: '椭圆', circle: '圆', dot: '点' };

    // ======================== 置信度过滤 ========================
    var currentConfidence = 25;  // 1-100

    // ======================== 模型 & 跟踪控制 ========================
    var currentModelType = 'det';  // det | seg | pose
    var currentNms = 50;          // 1-99
    var enableTracking = true;
    var enableSmoothing = true;
    var isCalibrating = false;
    var calPt1 = { x: 0, y: 0 };
    var calPt2 = { x: 0, y: 0 };
    var draggingMarker = null;  // 'A' | 'B' | null
    var pixelToMeter = 0.05;   // 默认值，启动时从服务端获取
    var CAL_MARKER_RADIUS = 18; // + 标记的点击检测半径

    // ======================== 动态统计值（避免被 updateStats 覆盖）========================
    var _videoRes = '';
    var _lastLatency = '';

    // ======================== 文件视频模式 ========================
    var isFileMode = false;

    // ======================== 模式系统 ========================
    var currentMode = 'normal';   // normal | heatmap | zones | line | dwell

    // ======================== Heatmap ========================
    var heatmapOffscreen = null;
    var HEATMAP_RADIUS = 30;
    var HEATMAP_DECAY = 0.04;
    var heatmapStyle = 'fire'; // fire | ocean | rainbow | ice | gray

    // ======================== 区域计数 ========================
    var zones = [];
    var isDrawingZone = false;
    var drawingZonePts = [];
    var zoneColors = [
        'rgba(255,56,56,0.20)', 'rgba(59,142,255,0.20)', 'rgba(72,199,116,0.20)',
        'rgba(174,95,255,0.20)', 'rgba(255,157,0,0.20)', 'rgba(0,206,209,0.20)'
    ];
    var zoneStrokes = ['#FF3838','#3B8EFF','#48C774','#AE5FFF','#FF9D00','#00CED1'];
    var ZONE_CLOSE_RADIUS = 25;

    // ======================== 越线计数 ========================
    var crossLine = null;       // {x1, y1, x2, y2}
    var isDrawingLine = false;
    var lineFirstPt = null;
    var objCrossSide = {};      // {tracker_id: 'A'|'B'}
    var crossA2B = 0;
    var crossB2A = 0;

    // ======================== 停留时间 ========================
    var objZoneEntry = {};      // key: 'zoneIdx_trackerId' => timestamp
    var zoneCurrentDwell = {};  // key: 'zoneIdx_trackerId' => accumulated ms

    // ======================== 工具函数 ========================
    function colorByIndex(i) {
        var colors = ['#FF3838','#FF9D00','#FFD726','#48C774','#3B8EFF','#AE5FFF','#FF66A5','#00D2FF','#7CFF7C','#FF5050'];
        return colors[i % colors.length];
    }

    // 点-多边形碰撞检测（射线法）
    function pointInPolygon(px, py, pts) {
        var inside = false;
        for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            var xi = pts[i].x, yi = pts[i].y;
            var xj = pts[j].x, yj = pts[j].y;
            if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }

    // 点到点的距离
    function dist(x1, y1, x2, y2) {
        return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
    }

    // 判断点在线的哪一侧（叉积法）
    function lineSide(px, py, x1, y1, x2, y2) {
        return (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1) >= 0 ? 'A' : 'B';
    }

    // 从鼠标/触摸事件获取画布坐标
    function getCanvasCoord(e) {
        var canvas = document.getElementById('vd-overlay');
        if (!canvas || !canvas.width || !canvas.height) return null;
        var rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        var cx = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
        var cy = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
        if (cx == null) return null;
        // 检查是否在画布范围内
        if (cx < rect.left || cx > rect.right || cy < rect.top || cy > rect.bottom) return null;
        return {
            x: Math.round((cx - rect.left) * (canvas.width / rect.width)),
            y: Math.round((cy - rect.top) * (canvas.height / rect.height))
        };
    }

    // ======================== 注入右上角菜单按钮 ========================
    function injectButton() {
        if (document.getElementById('btn-video-detect')) return;
        var menu = document.getElementById('header-actions');
        if (!menu) { setTimeout(injectButton, 500); return; }
        var btn = document.createElement('button');
        btn.id = 'btn-video-detect';
        btn.className = 'btn-icon btn-icon-blue';
        btn.innerHTML = '<i class="fa-solid fa-video"></i><span class="btn-text btn-text-grid"><span>视频</span><span>识别</span></span>';
        btn.title = '视频识别';
        btn.onclick = function(e) {
            e.stopPropagation();
            var actions = document.getElementById('header-actions');
            if (actions) actions.classList.remove('open');
            openVideoDetect();
        };
        var searchBtn = document.getElementById('btn-search');
        if (searchBtn && searchBtn.nextSibling) {
            menu.insertBefore(btn, searchBtn.nextSibling);
        } else {
            menu.appendChild(btn);
        }
    }

    // ======================== 打开面板 ========================
    window.openVideoDetect = function() {
        if (detectRunning) return;
        if (!window.currentToken) { showAlert && showAlert('error', '请先登录'); return; }
        if (window.currentBackend !== 'xcrab') { showAlert && showAlert('error', '请先切换到 xCrab 后端'); return; }

        var panel = document.createElement('div');
        panel.id = 'vd-panel';
        panel.innerHTML = [
            '<div id="vd-backdrop"></div>',
            '<div id="vd-container">',
            '  <div id="vd-header"><span>📷 实时视频识别</span><span id="vd-model-tag" class="vd-model-tag">加载中…</span><button id="vd-close-btn" onclick="closeVideoDetect()"><i class="fa-solid fa-xmark"></i></button></div>',
            '  <div id="vd-toolbar">',
            '    <button class="vd-tool vd-tool-active" data-mode="normal">🎯 检测</button>',
            '    <button class="vd-tool" data-mode="heatmap">🔥 热力</button>',
            '    <button class="vd-tool" data-mode="zones">📐 区域</button>',
            '    <button class="vd-tool" data-mode="line">📏 越线</button>',
            '    <button class="vd-tool" data-mode="dwell">⏱ 停留</button>',
            '    <button id="vd-pause-btn" class="vd-tool" title="暂停/继续检测">⏸ 暂停</button>',
            '    <button id="vd-calibrate-btn" class="vd-tool" title="速度校准">📏 校准</button>',
            // '    <button id="vd-fullscreen-btn" class="vd-tool" style="margin-left:auto;" title="全屏">⛶ 全屏</button>',
            '  </div>',
            '  <div id="vd-anno-row">',
            '    <span class="vd-anno-label">样式</span>',
            '    <button class="vd-anno-btn vd-anno-active" data-style="box">框</button>',
            '    <button class="vd-anno-btn" data-style="corner">角</button>',
            '    <button class="vd-anno-btn" data-style="ellipse">椭圆</button>',
            '    <button class="vd-anno-btn" data-style="circle">圆</button>',
            '    <button class="vd-anno-btn" data-style="dot">点</button>',
            '  </div>',
            '  <div id="vd-model-row">',
            '    <span class="vd-anno-label">模型</span>',
            '    <button class="vd-model-btn vd-model-active" data-model="det">检测</button>',
            '    <button class="vd-model-btn" data-model="seg">分割</button>',
            '    <button class="vd-model-btn" data-model="pose">姿态</button>',
            '    <span style="flex:1"></span>',
            '    <label class="vd-toggle-label" title="ByteTrack 跟踪">',
            '      <input type="checkbox" id="vd-track-toggle" checked>',
            '      <span class="vd-toggle-slider"></span>',
            '    </label>',
            '    <span class="vd-anno-label" style="margin-left:2px">跟踪</span>',
            '    <label class="vd-toggle-label" title="轨迹平滑" style="margin-left:8px">',
            '      <input type="checkbox" id="vd-smooth-toggle" checked>',
            '      <span class="vd-toggle-slider"></span>',
            '    </label>',
            '    <span class="vd-anno-label" style="margin-left:2px">平滑</span>',
            '  </div>',
            '  <div id="vd-conf-row">',
            '    <span class="vd-conf-label">置信度</span>',
            '    <input type="range" id="vd-conf-slider" min="1" max="100" value="25">',
            '    <span id="vd-conf-val" class="vd-conf-val">25%</span>',
            '    <span class="vd-conf-label" style="margin-left:10px">NMS</span>',
            '    <input type="range" id="vd-nms-slider" min="1" max="99" value="50">',
            '    <span id="vd-nms-val" class="vd-conf-val">50%</span>',
            '  </div>',
            '  <div id="vd-filter-row">',
            '    <span class="vd-anno-label">过滤</span>',
            '    <div id="vd-class-filter"></div>',
            '  </div>',
            '  <div id="vd-heatmap-row" style="display:none">',
            '    <span class="vd-anno-label">热力</span>',
            '    <button class="vd-heatmap-btn vd-heatmap-active" data-heat="fire">火焰</button>',
            '    <button class="vd-heatmap-btn" data-heat="ocean">海洋</button>',
            '    <button class="vd-heatmap-btn" data-heat="rainbow">彩虹</button>',
            '    <button class="vd-heatmap-btn" data-heat="ice">冰蓝</button>',
            '    <button class="vd-heatmap-btn" data-heat="gray">灰度</button>',
            '  </div>',
            '  <div id="vd-record-row">',
            '    <button id="vd-cam-btn" class="vd-file-btn" title="切换回摄像头" style="display:none">📷 摄像头</button>',
            '  </div>',
            '  <div id="vd-body">',
            '    <div id="vd-video-wrap">',
            '      <video id="vd-video" autoplay playsinline muted></video>',
            '      <canvas id="vd-overlay"></canvas>',
            '      <div id="vd-status">正在启动摄像头...</div>',
            '      <div id="vd-hint"></div>',
            '    </div>',
            '    <div id="vd-stats">',
            '      <div id="vd-stats-body"></div>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(panel);
        injectStyles();
        bindToolbarEvents();
        bindAnnoStyleEvents();
        bindConfSliderEvents();
        bindModelEvents();
        bindHeatmapEvents();
        bindRecordEvents();
        bindFullscreenEvent();
        bindPauseEvent();
        fetchCalibration();
        fetchCurrentModel();

        detectRunning = true;
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640, max: 1280 }, height: { ideal: 480, max: 720 } } })
            .then(function(stream) {
                videoStream = stream;
                var video = document.getElementById('vd-video');
                video.srcObject = stream;
                video.onloadedmetadata = function() {
                    var wrap = document.getElementById('vd-video-wrap');
                    var overlay = document.getElementById('vd-overlay');
                    overlay.width = video.videoWidth;
                    overlay.height = video.videoHeight;
                    _videoRes = video.videoWidth + '×' + video.videoHeight;
                    updateStats({});
                    document.getElementById('vd-status').style.display = 'none';
                    startDetectionLoop();
                };
            })
            .catch(function(err) {
                document.getElementById('vd-status').textContent = '❌ 无法打开摄像头: ' + err.message;
                detectRunning = false;
            });
    };

    // ======================== 关闭面板 ========================
    window.closeVideoDetect = function() {
        detectRunning = false;
        // 退出全屏
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            var exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) exit.call(document);
        }
        if (detectTimer) { clearTimeout(detectTimer); detectTimer = null; }
        if (videoStream) { videoStream.getTracks().forEach(function(t){t.stop()}); videoStream = null; }
        // 停止录制（已移除）
        // 释放文件视频 URL
        var video = document.getElementById('vd-video');
        if (video && video.src && isFileMode) {
            URL.revokeObjectURL(video.src);
            video.src = '';
        }
        isFileMode = false;
        var panel = document.getElementById('vd-panel');
        if (panel) panel.remove();
        trackHistory = {};
        _captureCanvas = null;
        isPaused = false;
        enabledClasses = null;
        allKnownClasses = [];
        lastFrameTime = 0;
        if (isCalibrating) exitCalibration();
        // 重置所有增强功能状态
        heatmapOffscreen = null;
        zones = []; isDrawingZone = false; drawingZonePts = [];
        crossLine = null; isDrawingLine = false; lineFirstPt = null; objCrossSide = {};
        crossA2B = 0; crossB2A = 0;
        objZoneEntry = {}; zoneCurrentDwell = {};
    };

    // ======================== 标注样式事件绑定 ========================
    function bindAnnoStyleEvents() {
        document.querySelectorAll('.vd-anno-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var style = this.getAttribute('data-style');
                if (style === currentAnnoStyle) return;
                document.querySelectorAll('.vd-anno-btn').forEach(function(b){b.classList.remove('vd-anno-active')});
                this.classList.add('vd-anno-active');
                currentAnnoStyle = style;
            });
        });
    }

    // ======================== 置信度 & NMS 滑块 ========================
    function bindConfSliderEvents() {
        var slider = document.getElementById('vd-conf-slider');
        if (!slider) return;
        slider.addEventListener('input', function() {
            currentConfidence = parseInt(this.value);
            var valEl = document.getElementById('vd-conf-val');
            if (valEl) valEl.textContent = currentConfidence + '%';
        });
        var nms = document.getElementById('vd-nms-slider');
        if (!nms) return;
        nms.addEventListener('input', function() {
            currentNms = parseInt(this.value);
            var valEl = document.getElementById('vd-nms-val');
            if (valEl) valEl.textContent = currentNms + '%';
        });
    }

    // ======================== 模型选择 & 跟踪开关 ========================
    function bindModelEvents() {
        document.querySelectorAll('.vd-model-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var model = this.getAttribute('data-model');
                if (model === currentModelType) return;
                var tag = document.getElementById('vd-model-tag');
                if (tag) { tag.textContent = '切换中…'; tag.style.color = '#FFD726'; }
                // 同步到服务端
                var xhr = new XMLHttpRequest();
                xhr.open('POST', window.host + '/api/yolo_switch_model', true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.setRequestHeader('Authorization', 'Bearer ' + window.currentToken);
                xhr.onload = function() {
                    try {
                        var resp = JSON.parse(xhr.responseText);
                        if (resp.status === 'ok' || resp.code === 200) {
                            document.querySelectorAll('.vd-model-btn').forEach(function(b){b.classList.remove('vd-model-active')});
                            btn.classList.add('vd-model-active');
                            currentModelType = model;
                            fetchCurrentModel();
                        } else {
                            if (tag) { tag.textContent = resp.error || '切换失败'; tag.style.color = '#ff5757'; }
                        }
                    } catch(e) {
                        if (tag) { tag.textContent = '切换失败'; tag.style.color = '#ff5757'; }
                    }
                };
                xhr.onerror = function() {
                    if (tag) { tag.textContent = '网络错误'; tag.style.color = '#ff5757'; }
                };
                xhr.send(JSON.stringify({ model_type: model }));
            });
        });
        var trackToggle = document.getElementById('vd-track-toggle');
        if (trackToggle) {
            trackToggle.addEventListener('change', function() {
                enableTracking = this.checked;
            });
        }
        var smoothToggle = document.getElementById('vd-smooth-toggle');
        if (smoothToggle) {
            smoothToggle.addEventListener('change', function() {
                enableSmoothing = this.checked;
            });
        }
    }

    // ======================== 热力图样式 ========================
    function bindHeatmapEvents() {
        document.querySelectorAll('.vd-heatmap-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var style = this.getAttribute('data-heat');
                if (style === heatmapStyle) return;
                document.querySelectorAll('.vd-heatmap-btn').forEach(function(b){b.classList.remove('vd-heatmap-active')});
                this.classList.add('vd-heatmap-active');
                heatmapStyle = style;
                // 切换样式时清空离屏画布，重新生成
                heatmapOffscreen = null;
            });
        });
    }

    // ======================== 视频文件模式 ========================
    function showCamBtn() {
        var camBtn = document.getElementById('vd-cam-btn');
        var fileBtn = document.getElementById('vd-video-file-btn');
        if (camBtn) camBtn.style.display = isFileMode ? 'inline-block' : 'none';
        if (fileBtn) fileBtn.style.display = isFileMode ? 'none' : 'inline-block';
    }

    function switchToCamera() {
        if (!isFileMode) return;
        isFileMode = false;
        var video = document.getElementById('vd-video');
        if (video && video.src) { URL.revokeObjectURL(video.src); video.src = ''; }
        showCamBtn();
        // 重新打开摄像头
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } })
            .then(function(stream) {
                videoStream = stream;
                video.srcObject = stream;
                video.onloadedmetadata = function() {
                    var overlay = document.getElementById('vd-overlay');
                    overlay.width = video.videoWidth;
                    overlay.height = video.videoHeight;
                    _videoRes = video.videoWidth + '×' + video.videoHeight;
                    var status = document.getElementById('vd-status');
                    if (status) status.style.display = 'none';
                };
            })
            .catch(function(err) {
                var status = document.getElementById('vd-status');
                if (status) { status.textContent = '❌ 无法打开摄像头: ' + err.message; status.style.display = 'block'; }
            });
    }

    // ======================== 速度校准（拖拽 + 标记）========================
    function fetchCalibration() {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', window.host + '/api/calibrate', true);
        xhr.onload = function() {
            try {
                var resp = JSON.parse(xhr.responseText);
                if (resp.code === 200 && resp.data && resp.data.pixel_to_meter) {
                    pixelToMeter = resp.data.pixel_to_meter;
                }
            } catch(e) {}
        };
        xhr.send();
    }

    // ======================== 当前模型信息 ========================
    function fetchCurrentModel() {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', window.host + '/api/yolo_current_model', true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + window.currentToken);
        xhr.onload = function() {
            var tag = document.getElementById('vd-model-tag');
            if (!tag) return;
            try {
                var resp = JSON.parse(xhr.responseText);
                if (resp.code === 200 && resp.data) {
                    var d = resp.data;
                    var models = d.models || {};
                    var detPath = (models.det && models.det.path) || '';
                    // 显示: YOLO26s · 检测
                    var sizeMatch = detPath.match(/yolo(\d+)(\w)\.pt/);
                    var sizeLabel = sizeMatch ? ('YOLO' + sizeMatch[1] + sizeMatch[2]) : 'YOLO';
                    var taskMap = { det: '检测', seg: '分割', pose: '姿态' };
                    var taskLabel = taskMap[d.current_type] || d.current_type || '';
                    tag.textContent = sizeLabel + ' · ' + taskLabel;
                    tag.style.color = '#00ff88';
                } else {
                    tag.textContent = 'YOLO 离线';
                    tag.style.color = '#ff5757';
                }
            } catch(e) {
                tag.textContent = '模型加载失败';
                tag.style.color = '#ff5757';
            }
        };
        xhr.onerror = function() {
            var tag = document.getElementById('vd-model-tag');
            if (tag) { tag.textContent = '网络错误'; tag.style.color = '#ff5757'; }
        };
        xhr.send();
    }

    function sendCalibration(ratio) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', window.host + '/api/calibrate', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = function() { updateStats({}); };
        xhr.send(JSON.stringify({ pixel_to_meter: ratio }));
    }

    function enterCalibration() {
        var overlay = document.getElementById('vd-overlay');
        if (!overlay || !overlay.width) return;
        // 初始化两个标记在画面 1/4 和 3/4 处
        calPt1.x = Math.round(overlay.width * 0.25);
        calPt1.y = Math.round(overlay.height * 0.5);
        calPt2.x = Math.round(overlay.width * 0.75);
        calPt2.y = Math.round(overlay.height * 0.5);
        isCalibrating = true;
        draggingMarker = null;

        var wrap = document.getElementById('vd-video-wrap');
        if (!wrap) return;

        // 移除旧的校准事件
        if (wrap._calEvts) {
            wrap._calEvts.forEach(function(h) { wrap.removeEventListener(h.type, h.fn); });
        }

        // 绑定拖拽事件
        function onDown(e) {
            if (!isCalibrating) return;
            var pt = getCanvasCoord(e);
            if (!pt) return;
            var d1 = dist(pt.x, pt.y, calPt1.x, calPt1.y);
            var d2 = dist(pt.x, pt.y, calPt2.x, calPt2.y);
            var thr = CAL_MARKER_RADIUS;
            if (d1 < thr) draggingMarker = 'A';
            else if (d2 < thr) draggingMarker = 'B';
        }
        function onMove(e) {
            if (!isCalibrating || !draggingMarker) return;
            e.preventDefault && e.preventDefault();
            var pt = getCanvasCoord(e);
            if (!pt) return;
            if (draggingMarker === 'A') { calPt1.x = pt.x; calPt1.y = pt.y; }
            else { calPt2.x = pt.x; calPt2.y = pt.y; }
        }
        function onUp() { draggingMarker = null; }

        wrap._calEvts = [
            { type: 'mousedown', fn: onDown },
            { type: 'mousemove', fn: onMove },
            { type: 'mouseup', fn: onUp },
            { type: 'mouseleave', fn: onUp },
            { type: 'touchstart', fn: onDown },
            { type: 'touchmove', fn: onMove },
            { type: 'touchend', fn: onUp },
            { type: 'touchcancel', fn: onUp }
        ];
        wrap._calEvts.forEach(function(h) { wrap.addEventListener(h.type, h.fn); });
        wrap.style.cursor = 'default';

        var hint = document.getElementById('vd-hint');
        if (hint) {
            hint.textContent = '拖动 + 标记调整参考线，再次点击「📏 校准」确认';
            hint.style.display = 'block';
        }
        var btn = document.getElementById('vd-calibrate-btn');
        if (btn) btn.classList.add('vd-tool-active');
    }

    function exitCalibration() {
        isCalibrating = false;
        draggingMarker = null;
        // 移除拖拽事件
        var wrap = document.getElementById('vd-video-wrap');
        if (wrap && wrap._calEvts) {
            wrap._calEvts.forEach(function(h) { wrap.removeEventListener(h.type, h.fn); });
            wrap._calEvts = null;
        }
        var hint = document.getElementById('vd-hint');
        if (hint) hint.style.display = 'none';
        var btn = document.getElementById('vd-calibrate-btn');
        if (btn) btn.classList.remove('vd-tool-active');
    }

    function confirmCalibration() {
        if (!isCalibrating) return;
        var distPx = Math.sqrt(Math.pow(calPt2.x - calPt1.x, 2) + Math.pow(calPt2.y - calPt1.y, 2));
        if (distPx < 5) { return; }
        var realDist = prompt('两点之间的实际距离是多少米？\n(像素距离: ' + Math.round(distPx) + 'px)', '1');
        if (realDist === null || realDist === '') return;
        realDist = parseFloat(realDist);
        if (isNaN(realDist) || realDist <= 0) return;
        pixelToMeter = realDist / distPx;
        sendCalibration(pixelToMeter);
        exitCalibration();
    }

    function drawCalibration(ctx) {
        if (!isCalibrating) return;
        ctx.save();
        var mx = (calPt1.x + calPt2.x) / 2;
        var my = (calPt1.y + calPt2.y) / 2;
        var distPx = Math.sqrt(Math.pow(calPt2.x - calPt1.x, 2) + Math.pow(calPt2.y - calPt1.y, 2));

        // 虚线连接线
        ctx.strokeStyle = '#FFD726';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(calPt1.x, calPt1.y);
        ctx.lineTo(calPt2.x, calPt2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // 距离标注
        ctx.font = 'bold 13px sans-serif';
        var txt = Math.round(distPx) + 'px' + (distPx > 0 ? ' (拖动 + 调整)' : '');
        var tw = ctx.measureText(txt).width;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(mx - tw/2 - 6, my - 14, tw + 12, 26);
        ctx.fillStyle = '#FFD726';
        ctx.fillText(txt, mx - tw/2, my + 5);

        // 两个 + 标记（十字线）
        [calPt1, calPt2].forEach(function(p, i) {
            var cx = p.x, cy = p.y;
            var s = 10;  // + 的半长
            var r = CAL_MARKER_RADIUS;

            // 外圈光晕（拖拽时高亮）
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            var isActive = (draggingMarker === (i === 0 ? 'A' : 'B'));
            ctx.fillStyle = isActive ? 'rgba(255,215,38,0.2)' : 'rgba(255,215,38,0.08)';
            ctx.fill();

            // + 十字
            ctx.strokeStyle = '#FFD726';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy);
            ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s);
            ctx.stroke();

            // 白色外描边
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx - s - 2, cy); ctx.lineTo(cx + s + 2, cy);
            ctx.moveTo(cx, cy - s - 2); ctx.lineTo(cx, cy + s + 2);
            ctx.stroke();
        });

        ctx.restore();
    }

    function startFileVideo(file) {
        // 停止摄像头
        if (videoStream) {
            videoStream.getTracks().forEach(function(t){t.stop()});
            videoStream = null;
        }
        isFileMode = true;
        showCamBtn();
        var video = document.getElementById('vd-video');
        var url = URL.createObjectURL(file);
        video.src = url;
        video.muted = false;
        video.loop = false;
        video.onloadedmetadata = function() {
            var wrap = document.getElementById('vd-video-wrap');
            var overlay = document.getElementById('vd-overlay');
            overlay.width = video.videoWidth;
            overlay.height = video.videoHeight;
            var resEl = document.getElementById('vd-resolution');
            if (resEl) resEl.textContent = video.videoWidth + '×' + video.videoHeight;
            updateStats({});
            document.getElementById('vd-status').style.display = 'none';
            video.play();
            startDetectionLoop();
        };
    }

    // ======================== 事件绑定 ========================
    function bindRecordEvents() {
        // 返回摄像头（文件视频模式用，保留备用）
        var camBtn = document.getElementById('vd-cam-btn');
        if (camBtn) {
            camBtn.addEventListener('click', function() { switchToCamera(); });
        }
    }

    function bindPauseEvent() {
        var btn = document.getElementById('vd-pause-btn');
        if (!btn) return;
        // 校准按钮（toolbar 中）
        var calBtn = document.getElementById('vd-calibrate-btn');
        if (calBtn) {
            calBtn.addEventListener('click', function() {
                if (!isCalibrating) { enterCalibration(); }
                else { confirmCalibration(); }
            });
        }
        btn.addEventListener('click', function() {
            isPaused = !isPaused;
            btn.textContent = isPaused ? '▶ 继续' : '⏸ 暂停';
            btn.classList.toggle('vd-tool-active', isPaused);
            var status = document.getElementById('vd-status');
            if (status) {
                if (isPaused) {
                    status.textContent = '⏸ 检测已暂停';
                    status.style.display = 'block';
                } else {
                    status.style.display = 'none';
                }
            }
        });
    }

    // ======================== 工具栏事件绑定 ========================
    function bindToolbarEvents() {
        document.querySelectorAll('.vd-tool').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var mode = this.getAttribute('data-mode');
                if (mode === currentMode) return;
                // 切换激活状态
                document.querySelectorAll('.vd-tool').forEach(function(b){b.classList.remove('vd-tool-active')});
                this.classList.add('vd-tool-active');
                currentMode = mode;
                // 清除提示
                document.getElementById('vd-hint').textContent = '';
                document.getElementById('vd-hint').style.display = 'none';
                // 退出时取消未完成的绘制
                if (mode !== 'zones') { isDrawingZone = false; drawingZonePts = []; }
                if (mode !== 'line') { isDrawingLine = false; lineFirstPt = null; }
                // 显示/隐藏热力图样式行
                var hmRow = document.getElementById('vd-heatmap-row');
                if (hmRow) hmRow.style.display = mode === 'heatmap' ? '' : 'none';
                // 重新绑定画布交互
                bindCanvasEvents();
                updateStats({});
            });
        });
    }

    function bindCanvasEvents() {
        var wrap = document.getElementById('vd-video-wrap');
        if (!wrap) return;
        // 用自定义属性存储事件处理器引用，以便移除
        if (wrap._evtHandlers) {
            wrap._evtHandlers.forEach(function(h) { wrap.removeEventListener(h.type, h.fn); });
            wrap._evtHandlers = null;
        }

        wrap.style.cursor = 'default';

        var handlers = [];
        if (currentMode === 'zones') {
            wrap.style.cursor = 'crosshair';
            var click = { type: 'click', fn: onZoneCanvasClick };
            var ctx = { type: 'contextmenu', fn: function(e){e.preventDefault();cancelDrawing();} };
            handlers = [click, ctx];
        } else if (currentMode === 'line') {
            wrap.style.cursor = 'crosshair';
            var click2 = { type: 'click', fn: onLineCanvasClick };
            var ctx2 = { type: 'contextmenu', fn: function(e){e.preventDefault();cancelDrawing();} };
            handlers = [click2, ctx2];
        }
        handlers.forEach(function(h) { wrap.addEventListener(h.type, h.fn); });
        wrap._evtHandlers = handlers;
    }

    function cancelDrawing() {
        if (currentMode === 'zones') { isDrawingZone = false; drawingZonePts = []; }
        if (currentMode === 'line') { isDrawingLine = false; lineFirstPt = null; }
        document.getElementById('vd-hint').style.display = 'none';
    }

    // ======================== 区域绘制 ========================
    function onZoneCanvasClick(e) {
        var pt = getCanvasCoord(e);
        if (!pt) return;
        var hint = document.getElementById('vd-hint');

        if (!isDrawingZone) {
            // 开始绘制新区域
            isDrawingZone = true;
            drawingZonePts = [pt];
            hint.textContent = '点击添加顶点，点击起点闭合区域 | 右键取消';
            hint.style.display = 'block';
            return;
        }

        // 检查是否点击到起点（闭合区域）
        var first = drawingZonePts[0];
        if (drawingZonePts.length >= 3 && dist(pt.x, pt.y, first.x, first.y) < ZONE_CLOSE_RADIUS) {
            // 闭合区域，创建zone
            zones.push({
                points: drawingZonePts.slice(),
                name: '区域' + (zones.length + 1),
                color: zoneColors[zones.length % zoneColors.length],
                stroke: zoneStrokes[zones.length % zoneStrokes.length],
                counts: {}
            });
            isDrawingZone = false;
            drawingZonePts = [];
            hint.style.display = 'none';
            updateStats({});
            return;
        }

        drawingZonePts.push(pt);
    }

    // ======================== 越线绘制 ========================
    function onLineCanvasClick(e) {
        var pt = getCanvasCoord(e);
        if (!pt) return;
        var hint = document.getElementById('vd-hint');

        if (!isDrawingLine) {
            // 第一点
            isDrawingLine = true;
            lineFirstPt = pt;
            hint.textContent = '再次点击设置终点 | 右键取消';
            hint.style.display = 'block';
            return;
        }

        // 第二点 -> 完成
        crossLine = { x1: lineFirstPt.x, y1: lineFirstPt.y, x2: pt.x, y2: pt.y };
        isDrawingLine = false;
        lineFirstPt = null;
        objCrossSide = {};
        hint.style.display = 'none';
        updateStats({});
    }

    // ======================== 检测循环 ========================
    // 目标帧率：YOLO26 在云服务器 GPU ~30ms/帧，可设 15 FPS；CPU 上设 8 FPS
    var TARGET_FPS = 15;
    var FRAME_INTERVAL = Math.round(1000 / TARGET_FPS);

    function startDetectionLoop() {
        if (!detectRunning) return;
        if (isPaused) { detectTimer = setTimeout(startDetectionLoop, 200); return; }
        var video = document.getElementById('vd-video');
        if (!video || !video.videoWidth) { detectTimer = setTimeout(startDetectionLoop, 500); return; }

        var t0 = Date.now();
        captureAndDetect().then(function() {
            var elapsed = Date.now() - t0;
            // 动态间隔：保持目标帧率
            var delay = Math.max(20, FRAME_INTERVAL - elapsed);
            var fpsEl = document.getElementById('vd-fps');
            if (fpsEl) fpsEl.textContent = (1000 / (elapsed + delay)).toFixed(1);
            if (detectRunning) detectTimer = setTimeout(startDetectionLoop, delay);
        }).catch(function() {
            if (detectRunning) detectTimer = setTimeout(startDetectionLoop, 1500);
        });
    }

    // ======================== 捕获 & 检测 ========================
    function captureAndDetect() {
        return new Promise(function(resolve, reject) {
            var video = document.getElementById('vd-video');
            if (!video || !video.videoWidth) return reject('no video');
            // 复用离屏 canvas，避免每帧 GC
            if (!_captureCanvas || _captureCanvas.width !== video.videoWidth || _captureCanvas.height !== video.videoHeight) {
                _captureCanvas = document.createElement('canvas');
                _captureCanvas.width = video.videoWidth;
                _captureCanvas.height = video.videoHeight;
            }
            var ctx = _captureCanvas.getContext('2d');
            ctx.drawImage(video, 0, 0);
            _captureCanvas.toBlob(function(blob) {
                if (!blob) return reject('no blob');
                var fd = new FormData();
                fd.append('frame', blob, 'frame.jpg');
                fd.append('model_type', currentModelType);
                fd.append('conf', (currentConfidence / 100).toFixed(2));
                fd.append('nms', (currentNms / 100).toFixed(2));
                fd.append('tracking', enableTracking ? '1' : '0');
                fd.append('smoothing', enableSmoothing ? '1' : '0');
                var st = Date.now();
                var xhr = new XMLHttpRequest();
                xhr.open('POST', window.host + '/api/yolo_live', true);
                xhr.setRequestHeader('Authorization', 'Bearer ' + window.currentToken);
                xhr.timeout = 8000;  // 网络差时不要一直挂着
                xhr.onload = function() {
                    _lastLatency = (Date.now() - st) + 'ms';
                    try {
                        var resp = JSON.parse(xhr.responseText);
                        if (resp.code === 200) {
                            processDetections(resp.data);
                        } else {
                            clearOverlay();
                        }
                    } catch(e) { clearOverlay(); }
                    resolve();
                };
                xhr.onerror = function() { clearOverlay(); resolve(); };
                xhr.ontimeout = function() { clearOverlay(); resolve(); };
                xhr.send(fd);
            }, 'image/jpeg', 0.7);
        });
    }

    // ======================== 类别过滤器 ========================
    function updateClassFilter(data) {
        var container = document.getElementById('vd-class-filter');
        if (!container || !data || !data.class_counts) return;
        var classes = Object.keys(data.class_counts);
        if (classes.length === 0) return;

        // 首次检测到物体时，初始化全部启用
        if (enabledClasses === null) {
            enabledClasses = new Set(classes);
        }

        // 添加新出现的类别到已知列表和启用集合
        classes.forEach(function(cls) {
            if (allKnownClasses.indexOf(cls) === -1) allKnownClasses.push(cls);
            enabledClasses.add(cls);
        });
        allKnownClasses.sort();

        var totalKnown = allKnownClasses.length;
        var html = '<button class="vd-filter-chip' + (enabledClasses.size >= totalKnown ? ' vd-filter-all-active' : '') + '" onclick="resetClassFilter()">全部</button>';
        allKnownClasses.forEach(function(cls) {
            var active = enabledClasses.has(cls);
            var count = (data.class_counts[cls] || 0);
            var color = getClassColor(cls);
            html += '<button class="vd-filter-chip' + (active ? ' vd-filter-active' : '') + '" data-class="' + cls + '" style="' + (active ? 'border-color:' + color : 'opacity:0.5') + '">'
                + '<span class="vd-filter-dot" style="background:' + color + '"></span>' + cls
                + (count > 0 ? ' <span class="vd-filter-count">' + count + '</span>' : '')
                + '</button>';
        });
        container.innerHTML = html;

        // 绑定点击事件
        container.querySelectorAll('.vd-filter-chip[data-class]').forEach(function(chip) {
            chip.addEventListener('click', function() {
                var cls = this.getAttribute('data-class');
                if (enabledClasses.has(cls)) {
                    enabledClasses.delete(cls);
                } else {
                    enabledClasses.add(cls);
                }
                updateClassFilter(data);
            });
        });
    }

    // ======================== 核心处理 ========================
    function processDetections(data) {
        var overlay = document.getElementById('vd-overlay');
        if (!overlay) return;
        var ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        if (!data || !data.objects) { updateStats(data); return; }

        var now = Date.now();
        var objs = data.objects || [];

        // 0. 类别过滤
        if (enabledClasses && enabledClasses.size > 0) {
            objs = objs.filter(function(obj) { return enabledClasses.has(obj.class); });
        }

        // 1. 更新轨迹历史（附带类名，用于轨迹颜色按类名固定）
        objs.forEach(function(obj) {
            if (obj.tracker_id === undefined) return;
            var xyxy = obj.xyxy;
            if (!xyxy || xyxy.length < 4) return;
            var cx = (xyxy[0] + xyxy[2]) / 2, cy = (xyxy[1] + xyxy[3]) / 2;
            var tid = obj.tracker_id;
            if (!trackHistory[tid]) trackHistory[tid] = [];
            trackHistory[tid].push({ cx: cx, cy: cy, time: now, cls: obj.class || 'unknown' });
        });

        // 2. 清理过期轨迹（保留 8 秒轨迹用于渐变尾迹）
        Object.keys(trackHistory).forEach(function(tid) {
            trackHistory[tid] = trackHistory[tid].filter(function(p) { return now - p.time < 8000; });
            if (trackHistory[tid].length === 0) delete trackHistory[tid];
        });

        // 3. 更新区域计数（各区域内当前物体数）
        zones.forEach(function(zone) {
            zone.counts = {};
            var counted = {};
            objs.forEach(function(obj) {
                var xyxy = obj.xyxy;
                if (!xyxy || xyxy.length < 4) return;
                var cx = (xyxy[0] + xyxy[2]) / 2, cy = (xyxy[1] + xyxy[3]) / 2;
                if (pointInPolygon(cx, cy, zone.points)) {
                    var key = obj.tracker_id !== undefined ? obj.tracker_id : obj.class + '_' + xyxy.join();
                    if (!counted[key]) {
                        counted[key] = true;
                        var cls = obj.class || 'unknown';
                        zone.counts[cls] = (zone.counts[cls] || 0) + 1;
                    }
                }
            });
        });

        // 4. 绘制基础（轨迹线 + 检测框）
        drawTrajectories(ctx, overlay.width, overlay.height);
        drawBoundingBoxes(ctx, objs, overlay.width);

        // 5. 模式特定绘制
        if (currentMode === 'heatmap') {
            drawHeatmap(ctx, objs, overlay.width, overlay.height);
        } else if (currentMode === 'zones') {
            drawZones(ctx);
        } else if (currentMode === 'line') {
            drawCrossLine(ctx);
        } else if (currentMode === 'dwell') {
            drawZones(ctx);
            updateDwellTime(objs, now);
        }

        // 校准线（始终绘制）
        drawCalibration(ctx);

        // 6. 越线检测（始终运行，以便任何时候都在统计）
        if (crossLine) {
            detectLineCrossing(objs);
        }

        // 7. 更新统计和类别过滤
        updateClassFilter(data);
        updateStats(data);
    }

    // ======================== 轨迹绘制（渐变尾迹，参照 Supervision TraceAnnotator）========================
    function drawTrajectories(ctx, cw, ch) {
        Object.keys(trackHistory).forEach(function(tid) {
            var pts = trackHistory[tid];
            if (pts.length < 2) return;
            var cls = pts[pts.length - 1].cls || 'unknown';
            var color = getClassColor(cls);

            // 分段绘制，从旧到新：透明度渐增 + 线宽渐增
            var total = pts.length;
            for (var i = 0; i < total - 1; i++) {
                var t = i / (total - 1);   // 0→1 从旧到新
                var alpha = 0.08 + t * 0.55;
                var width = 1 + t * 3;
                ctx.beginPath();
                ctx.moveTo(pts[i].cx, pts[i].cy);
                ctx.lineTo(pts[i + 1].cx, pts[i + 1].cy);
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                ctx.globalAlpha = alpha;
                ctx.stroke();
            }

            // 轨迹点（旧点小透明，新点大实心）
            pts.forEach(function(p, i) {
                var t = i / (total - 1);
                ctx.beginPath();
                ctx.arc(p.cx, p.cy, 1 + t * 2.5, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.1 + t * 0.5;
                ctx.fill();
            });

            ctx.globalAlpha = 1;
        });
    }

    // ======================== 多种标注样式绘制 ========================

    // 框标注（原样式）
    function drawBoxAnnotation(ctx, obj, color, cw, idx) {
        var xyxy = obj.xyxy;
        var x1 = xyxy[0], y1 = xyxy[1], x2 = xyxy[2], y2 = xyxy[3];
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, Math.min(4, cw / 200));
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }

    // 角标框标注（仅绘制四角，参照 Supervision BoxCornerAnnotator）
    function drawCornerAnnotation(ctx, obj, color, cw, idx) {
        var xyxy = obj.xyxy;
        var x1 = xyxy[0], y1 = xyxy[1], x2 = xyxy[2], y2 = xyxy[3];
        var w = x2 - x1, h = y2 - y1;
        var cl = Math.max(8, Math.min(w, h) * 0.25);
        var lw = Math.max(2, Math.min(4, cw / 200));
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        // 左上
        ctx.beginPath(); ctx.moveTo(x1, y1 + cl); ctx.lineTo(x1, y1); ctx.lineTo(x1 + cl, y1); ctx.stroke();
        // 右上
        ctx.beginPath(); ctx.moveTo(x2 - cl, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + cl); ctx.stroke();
        // 右下
        ctx.beginPath(); ctx.moveTo(x2, y2 - cl); ctx.lineTo(x2, y2); ctx.lineTo(x2 - cl, y2); ctx.stroke();
        // 左下
        ctx.beginPath(); ctx.moveTo(x1 + cl, y2); ctx.lineTo(x1, y2); ctx.lineTo(x1, y2 - cl); ctx.stroke();
    }

    // 椭圆标注（参照 Supervision EllipseAnnotator，适合行人）
    function drawEllipseAnnotation(ctx, obj, color, cw, idx) {
        var xyxy = obj.xyxy;
        var cx = (xyxy[0] + xyxy[2]) / 2;
        var bottom = xyxy[3];
        var rx = (xyxy[2] - xyxy[0]) / 2;
        var ry = rx * 0.55;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, Math.min(3, cw / 250));
        ctx.beginPath();
        ctx.ellipse(cx, bottom - ry * 0.3, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    // 圆标注（参照 Supervision CircleAnnotator）
    function drawCircleAnnotation(ctx, obj, color, cw, idx) {
        var xyxy = obj.xyxy;
        var cx = (xyxy[0] + xyxy[2]) / 2;
        var cy = (xyxy[1] + xyxy[3]) / 2;
        var r = Math.max(xyxy[2] - xyxy[0], xyxy[3] - xyxy[1]) * 0.45;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, Math.min(3, cw / 250));
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
    }

    // 点标注（参照 Supervision DotAnnotator）
    function drawDotAnnotation(ctx, obj, color, cw, idx) {
        var xyxy = obj.xyxy;
        var cx = (xyxy[0] + xyxy[2]) / 2;
        var cy = (xyxy[1] + xyxy[3]) / 2;
        var r = Math.max(3, Math.min(6, cw / 150));
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // 标注样式调度表
    var ANNO_DRAW_FUNCS = {
        box: drawBoxAnnotation,
        corner: drawCornerAnnotation,
        ellipse: drawEllipseAnnotation,
        circle: drawCircleAnnotation,
        dot: drawDotAnnotation
    };

    // 统一的 Label 绘制（所有样式共享）
    function drawLabel(ctx, obj, color, cw, idx) {
        var xyxy = obj.xyxy;
        var x1 = xyxy[0], y1 = xyxy[1];
        var label = obj.class + ' ' + Math.round(obj.confidence * 100) + '%';
        if (obj.tracker_id !== undefined) label = '#' + obj.tracker_id + ' ' + label;
        if (obj.occluded) label += ' ⛔';
        if (obj.truncated) label += ' ✂';
        // 显示速度
        if (obj.speed_kmh && obj.speed_kmh > 0) {
            label += ' ' + obj.speed_kmh + 'km/h';
        }
        ctx.font = 'bold ' + Math.max(12, Math.min(16, cw / 40)) + 'px sans-serif';
        var tw = ctx.measureText(label).width;
        ctx.fillStyle = color;
        ctx.fillRect(x1, y1 - 24, tw + 10, 24);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x1 + 5, y1 - 7);
    }

    // ======================== 检测框主调度 ========================
    function drawBoundingBoxes(ctx, objs, cw) {
        var drawFn = ANNO_DRAW_FUNCS[currentAnnoStyle] || drawBoxAnnotation;
        objs.forEach(function(obj, idx) {
            var xyxy = obj.xyxy;
            if (!xyxy || xyxy.length < 4) return;
            var color = getClassColor(obj.class || 'unknown');
            // 1. 分割掩码（在框下方）
            if (obj.mask && obj.mask.length >= 6) {
                drawMask(ctx, obj.mask, color);
            }
            // 2. 检测标注
            drawFn(ctx, obj, color, cw, idx);
            drawLabel(ctx, obj, color, cw, idx);
            // 3. 姿态关键点（在框上方）
            if (obj.keypoints && obj.keypoints.length >= 5) {
                drawPoseKeypoints(ctx, obj.keypoints);
            }
        });
    }

    // ======================== 热力图（多色彩映射）=======================
    var HEATMAP_COLORS = {
        fire: [
            [0, 'rgba(0,0,0,0)'],
            [0.3, 'rgba(255,50,0,0.7)'],
            [0.6, 'rgba(255,200,0,0.4)'],
            [1, 'rgba(255,255,200,0)']
        ],
        ocean: [
            [0, 'rgba(0,0,0,0)'],
            [0.3, 'rgba(0,0,180,0.7)'],
            [0.6, 'rgba(0,180,200,0.4)'],
            [1, 'rgba(100,255,180,0)']
        ],
        rainbow: [
            [0, 'rgba(100,0,200,0.7)'],
            [0.25, 'rgba(0,0,255,0.6)'],
            [0.5, 'rgba(0,200,0,0.4)'],
            [0.75, 'rgba(255,200,0,0.3)'],
            [1, 'rgba(255,50,0,0)']
        ],
        ice: [
            [0, 'rgba(0,0,0,0)'],
            [0.3, 'rgba(0,50,120,0.7)'],
            [0.7, 'rgba(0,180,255,0.4)'],
            [1, 'rgba(220,240,255,0)']
        ],
        gray: [
            [0, 'rgba(0,0,0,0)'],
            [0.3, 'rgba(60,60,60,0.5)'],
            [0.7, 'rgba(160,160,160,0.3)'],
            [1, 'rgba(255,255,255,0)']
        ]
    };

    function drawHeatmap(ctx, objs, w, h) {
        if (!heatmapOffscreen || heatmapOffscreen.width !== w || heatmapOffscreen.height !== h) {
            heatmapOffscreen = document.createElement('canvas');
            heatmapOffscreen.width = w;
            heatmapOffscreen.height = h;
        }
        var hctx = heatmapOffscreen.getContext('2d');

        // 衰减
        hctx.fillStyle = 'rgba(0,0,0,' + HEATMAP_DECAY + ')';
        hctx.fillRect(0, 0, w, h);

        var stops = HEATMAP_COLORS[heatmapStyle] || HEATMAP_COLORS.fire;

        objs.forEach(function(obj) {
            var xyxy = obj.xyxy;
            if (!xyxy || xyxy.length < 4) return;
            var cx = (xyxy[0] + xyxy[2]) / 2, cy = (xyxy[1] + xyxy[3]) / 2;
            var grad = hctx.createRadialGradient(cx, cy, 0, cx, cy, HEATMAP_RADIUS);
            for (var si = 0; si < stops.length; si++) {
                grad.addColorStop(stops[si][0], stops[si][1]);
            }
            hctx.fillStyle = grad;
            hctx.beginPath();
            hctx.arc(cx, cy, HEATMAP_RADIUS, 0, Math.PI * 2);
            hctx.fill();
        });

        // 合成到主画布
        ctx.drawImage(heatmapOffscreen, 0, 0);

        // 热力图样式名称
        var styleNames = { fire: '火焰', ocean: '海洋', rainbow: '彩虹', ice: '冰蓝', gray: '灰度' };
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '13px sans-serif';
        ctx.fillText('■ 热力图·' + (styleNames[heatmapStyle] || heatmapStyle), 10, 20);
    }

    // ======================== 分割掩码绘制（多边形）=======================
    var MASK_ALPHA = 0.35;

    function drawMask(ctx, maskPoints, color) {
        if (!maskPoints || maskPoints.length < 6) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(maskPoints[0], maskPoints[1]);
        for (var mi = 2; mi < maskPoints.length; mi += 2) {
            ctx.lineTo(maskPoints[mi], maskPoints[mi + 1]);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = MASK_ALPHA;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.restore();
    }

    // ======================== 姿态关键点绘制（COCO 17点）=======================
    var POSE_SKELETON = [
        [0,1],[0,2],[1,3],[2,4],
        [5,6],[5,7],[7,9],[6,8],[8,10],
        [5,11],[6,12],[11,12],
        [11,13],[13,15],[12,14],[14,16]
    ];
    var POSE_COLORS = [
        '#FF3838','#FF9D00','#FFD726','#48C774','#3B8EFF',
        '#AE5FFF','#FF66A5','#00D2FF','#7CFF7C','#FF5050',
        '#FFD700','#00CED1','#FF1493','#32CD32','#FF6347',
        '#1E90FF','#FF00FF'
    ];

    function drawPoseKeypoints(ctx, keypoints) {
        if (!keypoints || keypoints.length < 5) return;
        ctx.save();
        POSE_SKELETON.forEach(function(conn) {
            var kp1 = keypoints[conn[0]];
            var kp2 = keypoints[conn[1]];
            if (!kp1 || !kp2) return;
            if (kp1.confidence < 0.3 || kp2.confidence < 0.3) return;
            ctx.beginPath();
            ctx.moveTo(kp1.x, kp1.y);
            ctx.lineTo(kp2.x, kp2.y);
            ctx.strokeStyle = '#FFD726';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.7;
            ctx.stroke();
        });
        keypoints.forEach(function(kp, kpi) {
            if (kp.confidence < 0.3) return;
            ctx.beginPath();
            ctx.arc(kp.x, kp.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = POSE_COLORS[kpi % POSE_COLORS.length];
            ctx.globalAlpha = 0.9;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.6;
            ctx.stroke();
        });
        ctx.restore();
    }

    // ======================== 区域绘制 ========================
    function drawZones(ctx) {
        // 画已保存的区域
        zones.forEach(function(zone, idx) {
            var pts = zone.points;
            if (pts.length < 3) return;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
            ctx.fillStyle = zone.color;
            ctx.fill();
            ctx.strokeStyle = zone.stroke;
            ctx.lineWidth = 2;
            ctx.stroke();

            // 区域名称 + 计数
            var cx = pts.reduce(function(s,p){return s+p.x},0) / pts.length;
            var cy = pts.reduce(function(s,p){return s+p.y},0) / pts.length;
            ctx.font = 'bold 14px sans-serif';
            var count = zone.counts ? Object.values(zone.counts).reduce(function(a,b){return a+b}, 0) : 0;
            var text = zone.name + ': ' + count;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(cx - 35, cy - 12, 70, 24);
            ctx.fillStyle = '#fff';
            ctx.fillText(text, cx - 30, cy + 5);
        });

        // 画正在绘制的区域
        if (isDrawingZone && drawingZonePts.length > 0) {
            var pts = drawingZonePts;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.strokeStyle = '#FFD726';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            // 顶点
            pts.forEach(function(p) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#FFD726';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.stroke();
            });
        }
    }

    // ======================== 越线绘制 ========================
    function drawCrossLine(ctx) {
        if (!crossLine) {
            // 画第一点（如果正在画线）
            if (isDrawingLine && lineFirstPt) {
                ctx.beginPath();
                ctx.arc(lineFirstPt.x, lineFirstPt.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = '#FFD726';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.fillStyle = '#fff';
                ctx.font = '13px sans-serif';
                ctx.fillText('起点', lineFirstPt.x + 12, lineFirstPt.y + 5);
            }
            return;
        }

        var cl = crossLine;
        ctx.beginPath();
        ctx.moveTo(cl.x1, cl.y1);
        ctx.lineTo(cl.x2, cl.y2);
        ctx.strokeStyle = '#FFD726';
        ctx.lineWidth = 3;
        ctx.stroke();

        // 端点
        [cl, {x1:cl.x2, y1:cl.y2, x2:cl.x1, y2:cl.y1}].forEach(function(p, i) {
            ctx.beginPath();
            ctx.arc(p.x1, p.y1, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#FFD726';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(i === 0 ? 'A' : 'B', p.x1 + (i===0?-16:6), p.y1 + (i===0?-10:18));
        });

        // 方向标注
        var mx = (cl.x1 + cl.x2) / 2, my = (cl.y1 + cl.y2) / 2;
        var totalCross = crossA2B + crossB2A;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(mx - 40, my - 12, 80, 24);
        ctx.fillStyle = '#FFD726';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('越线: ' + totalCross, mx - 35, my + 5);

        // 统计：方向箭头
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '11px sans-serif';
        ctx.fillText('A→B:' + crossA2B + '  B→A:' + crossB2A, mx - 35, my + 20);
    }

    // ======================== 越线检测 ========================
    function detectLineCrossing(objs) {
        if (!crossLine) return;
        var cl = crossLine;
        objs.forEach(function(obj) {
            if (obj.tracker_id === undefined) return;
            var xyxy = obj.xyxy;
            if (!xyxy || xyxy.length < 4) return;
            var cx = (xyxy[0] + xyxy[2]) / 2, cy = (xyxy[1] + xyxy[3]) / 2;
            var side = lineSide(cx, cy, cl.x1, cl.y1, cl.x2, cl.y2);
            var tid = obj.tracker_id;

            if (objCrossSide[tid] !== undefined && objCrossSide[tid] !== side) {
                if (objCrossSide[tid] === 'A' && side === 'B') crossA2B++;
                else if (objCrossSide[tid] === 'B' && side === 'A') crossB2A++;
            }
            objCrossSide[tid] = side;
        });
    }

    // ======================== 停留时间更新 ========================
    function updateDwellTime(objs, now) {
        if (zones.length === 0) return;

        // 当前帧所有在区域内的物体
        var inZoneThisFrame = {}; // 'zoneIdx_trackerId': true

        zones.forEach(function(zone, zi) {
            objs.forEach(function(obj) {
                if (obj.tracker_id === undefined) return;
                var xyxy = obj.xyxy;
                if (!xyxy || xyxy.length < 4) return;
                var cx = (xyxy[0] + xyxy[2]) / 2, cy = (xyxy[1] + xyxy[3]) / 2;
                if (pointInPolygon(cx, cy, zone.points)) {
                    var key = zi + '_' + obj.tracker_id;
                    inZoneThisFrame[key] = true;
                    if (!objZoneEntry[key]) {
                        objZoneEntry[key] = now; // 刚进入
                    }
                }
            });
        });

        // 更新累计时间
        Object.keys(objZoneEntry).forEach(function(key) {
            var zi = parseInt(key.split('_')[0]);
            if (inZoneThisFrame[key]) {
                if (!zoneCurrentDwell[key]) zoneCurrentDwell[key] = 0;
                zoneCurrentDwell[key] = now - objZoneEntry[key];
            } else {
                // 物体离开了区域
                delete objZoneEntry[key];
                delete zoneCurrentDwell[key];
            }
        });
    }

    // ======================== 清除画布 ========================
    function clearOverlay() {
        var overlay = document.getElementById('vd-overlay');
        if (overlay) {
            var ctx = overlay.getContext('2d');
            ctx.clearRect(0, 0, overlay.width, overlay.height);
            // 保留模式特定元素
            if (currentMode === 'zones') drawZones(ctx);
            else if (currentMode === 'line') drawCrossLine(ctx);
            else if (currentMode === 'dwell') drawZones(ctx);
            drawCalibration(ctx);
        }
    }

    // ======================== 统计面板 ========================
    function getModeIcon(mode) {
        var icons = { normal: '🎯', heatmap: '🔥', zones: '📐', line: '📏', dwell: '⏱' };
        return icons[mode] || '🎯';
    }

    function getModeLabel(mode) {
        var labels = { normal: '检测', heatmap: '热力', zones: '区域', line: '越线', dwell: '停留' };
        return labels[mode] || '检测';
    }

    function updateStats(data) {
        var body = document.getElementById('vd-stats-body');
        if (!body) return;

        var html = '<div class="vd-stats-header">' + getModeIcon(currentMode) + ' ' + getModeLabel(currentMode) + '统计</div>';

        if (currentMode === 'normal') {
            html += buildNormalStats(data);
        } else if (currentMode === 'heatmap') {
            html += buildNormalStats(data);
        } else if (currentMode === 'zones') {
            html += buildZoneStats(data);
        } else if (currentMode === 'line') {
            html += buildLineStats(data);
        } else if (currentMode === 'dwell') {
            html += buildDwellStats(data);
        }

        body.innerHTML = html;
        // 恢复被 updateStats 重建覆盖的动态值
        if (_videoRes) {
            var re = document.getElementById('vd-resolution');
            if (re) re.textContent = _videoRes;
        }
        if (_lastLatency) {
            var le = document.getElementById('vd-latency');
            if (le) le.textContent = _lastLatency;
        }
    }

    function getClassColor(name) {
        var colors = ['#0a84ff','#48C774','#FF9D00','#FF3838','#AE5FFF','#FFD726','#FF66A5','#00CED1','#7CFF7C','#FF5050'];
        var hash = 0;
        for (var i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
        return colors[Math.abs(hash) % colors.length];
    }

    function buildNormalStats(data) {
        var h = '';
        // 总数（醒目大数字）
        var total = (data && data.total_count) || 0;
        h += '<div class="vd-stat-total"><span class="vd-num">' + total + '</span><span class="vd-label">当前检测物体</span></div>';

        // 类别分布
        if (data && data.class_counts && Object.keys(data.class_counts).length > 0) {
            h += '<div class="vd-stats-divider"></div>';
            var entries = Object.entries(data.class_counts).sort(function(a,b){return b[1]-a[1]});
            entries.forEach(function(e) {
                var color = getClassColor(e[0]);
                h += '<div class="vd-stat-row vd-class-item">'
                    + '<span class="vd-class-name"><span class="vd-class-dot" style="background:' + color + '"></span>' + e[0] + '</span>'
                    + '<span class="vd-num">' + e[1] + '</span></div>';
            });
        }

        // 校准值
        h += '<div class="vd-stat-row" style="font-size:11px;padding:2px 10px;"><span>校准</span><span class="vd-num" style="font-size:11px;">1px = ' + pixelToMeter.toFixed(5) + 'm</span></div>';

        // 最快物体速度
        if (data && data.speed && data.speed.max_speed_obj) {
            h += '<div class="vd-stats-divider"></div>';
            var so = data.speed.max_speed_obj;
            h += '<div class="vd-stat-row vd-class-item">'
                + '<span class="vd-class-name"><span class="vd-class-dot" style="background:#FF3838"></span>最快: ' + so.class + ' #' + so.tracker_id + '</span>'
                + '<span class="vd-num vd-num-danger">' + so.speed_kmh + ' km/h</span></div>';
        }

        // 系统指标网格
        h += '<div class="vd-stats-divider"></div>';
        h += '<div class="vd-stats-grid">';
        h += '<div class="vd-stat-row"><span>延时</span><span class="vd-num" id="vd-latency">—</span></div>';
        h += '<div class="vd-stat-row"><span>分辨率</span><span class="vd-num" id="vd-resolution">—</span></div>';
        h += '<div class="vd-stat-row"><span>帧率</span><span class="vd-num" id="vd-fps">0</span></div>';
        h += '</div>';

        return h;
    }

    function buildZoneStats(data) {
        var h = '';
        // 总数
        var total = (data && data.total_count) || 0;
        h += '<div class="vd-stat-total"><span class="vd-num">' + total + '</span><span class="vd-label">检测物体</span></div>';

        h += '<div class="vd-stats-divider"></div>';

        if (zones.length === 0 && !isDrawingZone) {
            h += '<div style="color:var(--text-sub,#888);padding:12px 8px;font-size:12px;text-align:center;">点击画面绘制区域顶点<br/>点击起点闭合区域</div>';
        } else {
            zones.forEach(function(zone, idx) {
                var totalZone = zone.counts ? Object.values(zone.counts).reduce(function(a,b){return a+b}, 0) : 0;
                h += '<div class="vd-stat-row vd-class-item">'
                    + '<span class="vd-class-name"><span class="vd-class-dot" style="background:' + zone.stroke + '"></span>' + zone.name + '</span>'
                    + '<span class="vd-num">' + totalZone + '</span></div>';
            });
            h += '<div style="margin-top:8px;"><button class="vd-zone-add-btn" onclick="addNewZone()">+ 新建区域</button></div>';
        }

        if (isDrawingZone) {
            h += '<div style="color:#FFD726;font-size:11px;padding:6px 8px;text-align:center;background:rgba(255,215,38,0.08);border-radius:4px;margin-top:4px;">绘制中... ' + drawingZonePts.length + ' 顶点</div>';
        }
        return h;
    }

    function buildLineStats(data) {
        var h = '';
        // 总数
        var total = (data && data.total_count) || 0;
        h += '<div class="vd-stat-total"><span class="vd-num">' + total + '</span><span class="vd-label">检测物体</span></div>';
        h += '<div class="vd-stats-divider"></div>';

        if (!crossLine && !isDrawingLine) {
            h += '<div style="color:var(--text-sub,#888);padding:12px 8px;font-size:12px;text-align:center;">点击画面设置越线<br/>起点和终点</div>';
        } else {
            h += '<div class="vd-stat-row"><span>A → B</span><span class="vd-num vd-num-success">' + crossA2B + '</span></div>';
            h += '<div class="vd-stat-row"><span>B → A</span><span class="vd-num vd-num-danger">' + crossB2A + '</span></div>';
            h += '<div class="vd-stats-divider"></div>';
            h += '<div class="vd-stat-row" style="font-weight:600;"><span>总计越线</span><span class="vd-num vd-num-warn">' + (crossA2B + crossB2A) + '</span></div>';
            h += '<div style="margin-top:8px;"><button class="vd-zone-add-btn" onclick="resetCrossLine()">重置统计</button></div>';
        }

        if (isDrawingLine) {
            h += '<div style="color:#FFD726;font-size:11px;padding:6px 8px;text-align:center;background:rgba(255,215,38,0.08);border-radius:4px;margin-top:4px;">'
                + (lineFirstPt ? '已选起点，点击画面设置终点' : '点击画面设置起点') + '</div>';
        }
        return h;
    }

    function buildDwellStats(data) {
        var h = '';
        if (zones.length === 0) {
            h += '<div style="color:var(--text-sub,#888);padding:12px 8px;font-size:12px;text-align:center;">请先在「区域」模式<br/>绘制检测区域</div>';
            h += '<div class="vd-stats-divider"></div>';
            h += buildNormalStats(data);
            return h;
        }

        zones.forEach(function(zone, zi) {
            h += '<div class="vd-stat-row vd-class-item" style="margin-top:4px;">'
                + '<span class="vd-class-name"><span class="vd-class-dot" style="background:' + zone.stroke + '"></span>' + zone.name + '</span>'
                + '<span class="vd-num">停留</span></div>';

            var hasAny = false;
            Object.keys(zoneCurrentDwell).forEach(function(key) {
                var parts = key.split('_');
                if (parseInt(parts[0]) === zi) {
                    hasAny = true;
                    var tid = parts[1];
                    var secs = Math.floor(zoneCurrentDwell[key] / 1000);
                    var display = secs >= 60 ? Math.floor(secs/60) + 'm' + (secs%60) + 's' : secs + 's';
                    h += '<div class="vd-stat-row" style="padding:3px 10px 3px 24px;font-size:12px;"><span>#' + tid + '</span><span class="vd-num">' + display + '</span></div>';
                }
            });
            if (!hasAny) {
                h += '<div style="color:var(--text-sub,#888);font-size:11px;padding:4px 10px 6px 24px;">无物体停留</div>';
            }
        });

        if (data) {
            h += '<div class="vd-stats-divider"></div>';
            h += buildNormalStats(data);
        }
        return h;
    }

    // 全局暴露给按钮 onclick
    window.resetClassFilter = function() {
        enabledClasses = null; // 重置为全部启用
        // 立即更新 UI：激活所有 chip
        var container = document.getElementById('vd-class-filter');
        if (container) {
            container.querySelectorAll('.vd-filter-chip').forEach(function(chip) {
                chip.classList.add('vd-filter-active');
                chip.classList.add('vd-filter-all-active');
                chip.style.opacity = '';
            });
        }
    };

    window.addNewZone = function() {
        if (currentMode !== 'zones') {
            document.querySelector('.vd-tool[data-mode="zones"]').click();
        }
        var hint = document.getElementById('vd-hint');
        hint.textContent = '点击画面添加顶点，点击起点闭合区域';
        hint.style.display = 'block';
    };

    // ======================== 全屏功能 ========================
    function toggleFullscreen() {
        var wrap = document.getElementById('vd-video-wrap');
        if (!wrap) return;
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            var fs = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
            if (fs) { fs.call(wrap); }
        } else {
            var exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) { exit.call(document); }
            // 清理全屏残留的 inline 样式
            wrap.style.width = '';
            wrap.style.height = '';
            wrap.style.maxWidth = '';
            wrap.style.maxHeight = '';
        }
    }

    function updateFullscreenBtn() {
        var btn = document.getElementById('vd-fullscreen-btn');
        if (!btn) return;
        var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        btn.textContent = isFs ? '⛶ 退出' : '⛶ 全屏';
        btn.classList.toggle('vd-tool-active', isFs);
        var stats = document.getElementById('vd-stats');
        if (!stats) return;
        if (isFs) {
            stats.style.display = 'none';
        } else {
            // 退出全屏后等待布局稳定再恢复统计面板
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    stats.style.display = '';
                });
            });
        }
    }

    // 监听全屏变化事件
    document.addEventListener('fullscreenchange', updateFullscreenBtn);
    document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);

    // 绑定全屏事件（按钮 + 双击）
    function bindFullscreenEvent() {
        var btn = document.getElementById('vd-fullscreen-btn');
        if (btn) btn.addEventListener('click', toggleFullscreen);
        var wrap = document.getElementById('vd-video-wrap');
        if (wrap) wrap.addEventListener('dblclick', toggleFullscreen);
    }

    window.resetCrossLine = function() {
        crossA2B = 0;
        crossB2A = 0;
        objCrossSide = {};
        updateStats({});
    };

    // ======================== 样式 ========================
    function injectStyles() {
        if (document.getElementById('vd-styles')) return;
        var style = document.createElement('style');
        style.id = 'vd-styles';
        style.textContent = [
            '#vd-backdrop{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:9998}',
            '#vd-container{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:90vw;max-width:1000px;height:80vh;background:var(--card-bg,#1c1c1e);border-radius:16px;z-index:9999;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.5)}',
            '#vd-header{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;font-size:16px;font-weight:600;border-bottom:1px solid var(--border,#333)}',
            '#vd-close-btn{background:none;border:none;color:var(--text,#fff);font-size:20px;cursor:pointer;padding:4px 8px;border-radius:6px}',
            '#vd-close-btn:hover{background:rgba(255,255,255,0.1)}',
            '.vd-model-tag{font-size:12px;color:#00ff88;background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.3);padding:2px 8px;border-radius:10px;margin-left:10px;white-space:nowrap}',

            '#vd-toolbar{display:flex;gap:4px;padding:8px 20px;border-bottom:1px solid var(--border,#333);overflow-x:auto;-webkit-overflow-scrolling:touch}',

            '#vd-anno-row{display:flex;align-items:center;gap:4px;padding:4px 20px;border-bottom:1px solid var(--border,#333);background:rgba(255,255,255,0.03)}',
            '.vd-anno-label{font-size:12px;color:var(--text-sub,#888);margin-right:4px;white-space:nowrap}',
            '.vd-anno-btn{padding:3px 8px;border:1px solid var(--border,#333);border-radius:4px;background:transparent;color:var(--text,#aaa);font-size:12px;cursor:pointer;transition:all 0.15s;user-select:none}',
            '.vd-anno-btn:hover{background:rgba(255,255,255,0.08);color:#fff}',
            '.vd-anno-btn.vd-anno-active{background:var(--accent,#0a84ff);border-color:var(--accent,#0a84ff);color:#fff}',

            '#vd-model-row{display:flex;align-items:center;gap:4px;padding:4px 20px;border-bottom:1px solid var(--border,#333);background:rgba(255,255,255,0.03)}',
            '.vd-model-btn{padding:3px 8px;border:1px solid var(--border,#333);border-radius:4px;background:transparent;color:var(--text,#aaa);font-size:12px;cursor:pointer;transition:all 0.15s;user-select:none}',
            '.vd-model-btn:hover{background:rgba(255,255,255,0.08);color:#fff}',
            '.vd-model-btn.vd-model-active{background:var(--accent,#0a84ff);border-color:var(--accent,#0a84ff);color:#fff}',
            '/* 跟踪开关 */',
            '.vd-toggle-label{position:relative;display:inline-block;width:30px;height:16px;cursor:pointer}',
            '.vd-toggle-label input{opacity:0;width:0;height:0}',
            '.vd-toggle-slider{position:absolute;top:0;left:0;right:0;bottom:0;background:var(--border,#555);border-radius:16px;transition:0.3s}',
            '.vd-toggle-slider:before{position:absolute;content:"";height:12px;width:12px;left:2px;bottom:2px;background:#fff;border-radius:50%;transition:0.3s}',
            '.vd-toggle-label input:checked+.vd-toggle-slider{background:var(--accent,#0a84ff)}',
            '.vd-toggle-label input:checked+.vd-toggle-slider:before{transform:translateX(14px)}',
            '#vd-conf-row{display:flex;align-items:center;gap:8px;padding:4px 20px;border-bottom:1px solid var(--border,#333);background:rgba(255,255,255,0.02)}',
            '#vd-heatmap-row{display:flex;align-items:center;gap:4px;padding:4px 20px;border-bottom:1px solid var(--border,#333);background:rgba(255,255,255,0.03)}',
            '.vd-heatmap-btn{padding:3px 8px;border:1px solid var(--border,#333);border-radius:4px;background:transparent;color:var(--text,#aaa);font-size:12px;cursor:pointer;transition:all 0.15s;user-select:none}',
            '.vd-heatmap-btn:hover{background:rgba(255,255,255,0.08);color:#fff}',
            '.vd-heatmap-btn.vd-heatmap-active{background:var(--accent,#0a84ff);border-color:var(--accent,#0a84ff);color:#fff}',
            '.vd-conf-label{font-size:12px;color:var(--text-sub,#888);white-space:nowrap;min-width:38px}',
            '#vd-conf-slider{flex:1;height:4px;-webkit-appearance:none;appearance:none;background:var(--border,#444);border-radius:2px;outline:none;cursor:pointer}',
            '#vd-conf-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;border-radius:50%;background:var(--accent,#0a84ff);cursor:pointer;border:none}',
            '#vd-conf-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:var(--accent,#0a84ff);cursor:pointer;border:none}',
            '.vd-conf-val{font-size:12px;color:var(--accent,#0a84ff);font-weight:600;min-width:32px;text-align:right}',

            '#vd-filter-row{display:flex;align-items:center;gap:4px;padding:4px 20px;border-bottom:1px solid var(--border,#333);background:rgba(255,255,255,0.02);overflow-x:auto;-webkit-overflow-scrolling:touch}',
            '#vd-filter-row::-webkit-scrollbar{height:0}',
            '#vd-class-filter{display:flex;gap:4px;flex-wrap:nowrap;align-items:center}',
            '.vd-filter-chip{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border:1px solid var(--border,#444);border-radius:10px;background:transparent;color:var(--text-sub,#888);font-size:11px;cursor:pointer;transition:all 0.15s;white-space:nowrap;user-select:none;flex-shrink:0}',
            '.vd-filter-chip:hover{background:rgba(255,255,255,0.06)}',
            '.vd-filter-chip.vd-filter-active{color:var(--text,#ddd);background:rgba(255,255,255,0.08)}',
            '.vd-filter-chip.vd-filter-all-active{color:#fff;background:var(--accent,#0a84ff);border-color:var(--accent,#0a84ff)}',
            '.vd-filter-dot{display:inline-block;width:6px;height:6px;border-radius:50%;flex-shrink:0}',
            '.vd-filter-count{font-size:10px;opacity:0.7}',

            '.vd-file-btn{padding:3px 10px;border:1px solid var(--border,#333);border-radius:4px;background:transparent;color:var(--text,#aaa);font-size:12px;cursor:pointer;transition:all 0.15s;user-select:none;white-space:nowrap}',
            '.vd-file-btn:hover{background:rgba(255,255,255,0.08);color:#fff}',

            '#vd-toolbar::-webkit-scrollbar{height:0}',
            '.vd-tool{flex-shrink:0;padding:6px 14px;border:1px solid var(--border,#333);border-radius:8px;background:transparent;color:var(--text,#ccc);font-size:13px;cursor:pointer;transition:all 0.2s;user-select:none;white-space:nowrap}',
            '.vd-tool:hover{background:rgba(255,255,255,0.08)}',
            '.vd-tool-active{background:var(--accent,#0a84ff);border-color:var(--accent,#0a84ff);color:#fff}',
            '.vd-tool-active:hover{background:var(--accent,#0a84ff);opacity:0.9}',

            '#vd-body{flex:1;display:flex;overflow:hidden}',
            '#vd-video-wrap{flex:1;position:relative;display:flex;align-items:center;justify-content:center;background:#000;overflow:hidden}',
            '#vd-video-wrap:fullscreen{width:100vw;height:100vh;background:#000;padding:0}',
            '#vd-video-wrap:-webkit-full-screen{width:100vw;height:100vh;background:#000;padding:0}',
            '#vd-video{max-width:100%;max-height:100%;object-fit:contain;display:block}',
            '#vd-overlay{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);max-width:100%;max-height:100%;pointer-events:none}',
            '#vd-status{position:absolute;color:#fff;font-size:14px;padding:12px 20px;background:rgba(0,0,0,0.7);border-radius:8px}',
            '#vd-hint{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);color:#FFD726;font-size:13px;padding:8px 16px;background:rgba(0,0,0,0.75);border-radius:8px;display:none;white-space:nowrap;pointer-events:none;z-index:10}',

            '#vd-stats{width:250px;min-width:250px;padding:12px 14px;overflow-y:auto;overflow-x:hidden;border-left:1px solid var(--border,#333);font-size:13px;display:flex;flex-direction:column;box-sizing:border-box}',
            '.vd-stats-header{font-weight:600;font-size:13px;padding-bottom:8px;margin-bottom:6px;border-bottom:1px solid var(--border,#333);color:var(--text,#ddd);display:flex;align-items:center;gap:6px;overflow:hidden;box-sizing:border-box}',
            '.vd-stats-header::before{content:"";display:inline-block;width:3px;height:14px;background:var(--accent,#0a84ff);border-radius:2px;flex-shrink:0}',

            '.vd-stat-total{text-align:center;padding:10px 0 8px;overflow:hidden;box-sizing:border-box}',
            '.vd-stat-total .vd-num{font-size:28px;font-weight:700;display:block;line-height:1.2;overflow:hidden;text-overflow:ellipsis}',
            '.vd-stat-total .vd-label{font-size:11px;color:var(--text-sub,#888);display:block;margin-top:2px}',

            '.vd-stat-row{display:flex;justify-content:space-between;align-items:center;padding:5px 10px;font-size:13px;border-radius:6px;margin:1px 0;transition:background 0.12s;overflow:hidden;width:100%;box-sizing:border-box}',
            '.vd-stat-row > span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1 1 0}',
            '.vd-stat-row > span:last-child{flex-shrink:0;margin-left:8px;white-space:nowrap;max-width:100%}',
            '.vd-stat-row:hover{background:rgba(255,255,255,0.04)}',

            '.vd-class-item{padding:5px 10px 5px 10px;border-left:none;margin:1px 0;background:rgba(255,255,255,0.025);display:flex;justify-content:space-between;align-items:center;overflow:hidden;width:100%;box-sizing:border-box}',
            '.vd-class-item .vd-class-dot{display:inline-block;width:8px;height:8px;border-radius:3px;margin-right:8px;flex-shrink:0}',
            '.vd-class-item .vd-class-name{display:flex;align-items:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1 1 0}',
            '.vd-class-item .vd-num{flex-shrink:0;margin-left:8px;max-width:50%}',

            '.vd-num{font-weight:600;color:var(--accent,#0a84ff);font-variant-numeric:tabular-nums}',
            '.vd-num-success{color:#48C774}',
            '.vd-num-warn{color:#FFD726}',
            '.vd-num-danger{color:#FF3838}',

            '.vd-stats-divider{height:1px;background:var(--border,#333);margin:8px 0}',

            '.vd-stats-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;padding:2px 0;width:100%}',
            '.vd-stats-grid .vd-stat-row{flex-direction:column;align-items:center;text-align:center;padding:8px 6px;gap:4px;width:auto;overflow:hidden}',
            '.vd-stats-grid .vd-stat-row .vd-num{font-size:16px;font-weight:700;overflow:hidden;text-overflow:ellipsis;max-width:100%}',
            '.vd-stats-grid .vd-stat-row > span:first-child{font-size:11px;color:var(--text-sub,#888);overflow:hidden;text-overflow:ellipsis;max-width:100%;flex:none;white-space:nowrap}',
            '.vd-stats-grid .vd-stat-row > span:last-child{flex:none;margin-left:0}',

            '.vd-zone-add-btn{padding:6px 12px;border:1px dashed var(--accent,#0a84ff);border-radius:6px;background:transparent;color:var(--accent,#0a84ff);font-size:12px;cursor:pointer;width:100%}',
            '.vd-zone-add-btn:hover{background:rgba(10,132,255,0.1)}',



            '@media(max-width:600px){',
            '#vd-container{width:100vw;height:100vh;border-radius:0;max-width:none}',
            '#vd-body{flex-direction:column}',
            '#vd-video-wrap{flex:1;min-height:0}',
            '#vd-stats{width:100%;min-width:auto;max-height:42vh;border-left:none;border-top:1px solid var(--border,#333);padding:8px 12px}',
            '#vd-header{padding:10px 14px;font-size:14px}',
            '.vd-model-tag{font-size:11px;padding:1px 6px}',
            '#vd-toolbar{padding:6px 10px;gap:3px;flex-wrap:nowrap}',
            '.vd-tool{font-size:11px;padding:5px 8px;border-radius:6px;min-height:32px}',
            '#vd-anno-row{padding:4px 10px;gap:3px;flex-wrap:nowrap}',
            '#vd-model-row{padding:4px 10px;gap:3px;flex-wrap:nowrap}',
            '#vd-conf-row{padding:4px 10px;gap:4px;flex-wrap:wrap}',
            '#vd-filter-row{padding:4px 10px;gap:3px}',
            '#vd-heatmap-row{padding:4px 10px;gap:3px}',
            '.vd-filter-chip{font-size:10px;padding:2px 6px}',
            '.vd-anno-label{font-size:11px}',
            '.vd-anno-btn{font-size:11px;padding:2px 6px}',
            '.vd-model-btn{font-size:11px;padding:2px 6px}',
            '.vd-toggle-label{width:28px;height:15px}',
            '.vd-toggle-slider:before{height:11px;width:11px;left:2px;bottom:2px}',
            '.vd-toggle-label input:checked+.vd-toggle-slider:before{transform:translateX(13px)}',
            '#vd-conf-slider{min-width:60px}',

            '.vd-stat-total{padding:6px 0}',
            '.vd-stat-total .vd-num{font-size:22px}',

            '.vd-stat-row{padding:4px 8px;font-size:12px;border-radius:4px}',
            '.vd-stat-row:hover{background:transparent}',
            '.vd-class-item{padding:4px 8px;font-size:12px}',
            '.vd-class-item .vd-class-dot{width:7px;height:7px;margin-right:6px}',

            '.vd-stats-grid{gap:3px}',
            '.vd-stats-grid .vd-stat-row{padding:6px 4px}',
            '.vd-stats-grid .vd-stat-row .vd-num{font-size:14px}',

            '.vd-num{font-size:13px}',
            '#vd-stats .vd-stats-header{font-size:12px;padding-bottom:6px;margin-bottom:4px}',
            '.vd-file-btn{font-size:11px;padding:2px 8px}',

            '@media(max-height:600px){',
            '#vd-body{flex-direction:row}',
            '#vd-video-wrap{flex:1;min-width:0}',
            '#vd-stats{width:200px;min-width:200px;max-height:none;border-left:1px solid var(--border,#333);border-top:none;padding:8px 10px}',
            '}',
            '}'
        ].join('');
        document.head.appendChild(style);
    }

    // ======================== 初始化 ========================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(injectButton, 1000); });
    } else {
        setTimeout(injectButton, 1000);
    }
})();
