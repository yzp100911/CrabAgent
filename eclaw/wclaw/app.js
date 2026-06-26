// app.js - 入口加载器，按顺序加载拆分模块
(function() {
    // 从自身 script 标签提取版本号用于缓存破解
    var v = '';
    var scripts = document.querySelectorAll('script[src*="app.js"]');
    for (var i = 0; i < scripts.length; i++) {
        var m = scripts[i].src.match(/v=([^&]+)/);
        if (m) { v = '?v=' + m[1]; break; }
    }

    var modules = [
        'app-base.js',
        'app-auth.js',
        'app-main.js',
        'app-anim.js',
        'app-video.js'
    ];

    function loadNext(index) {
        if (index >= modules.length) return;
        var el = document.createElement('script');
        el.src = modules[index] + v;
        el.onload = function() { loadNext(index + 1); };
        el.onerror = function() {
            console.error('[app.js] 加载失败:', modules[index]);
        };
        document.body.appendChild(el);
    }

    loadNext(0);
})();
