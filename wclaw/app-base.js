
    // ================= Android WebView 键盘适配 - 终极方案 =================
    (function() {
        // 保存原始高度
        var originalHeight = window.innerHeight;
        var isKeyboardVisible = false;
        
        // 方法1：监听 window resize
        function handleResize() {
            var currentHeight = window.innerHeight;
            var heightDiff = originalHeight - currentHeight;
            
            // 如果高度差超过150px，认为键盘弹起
            if (heightDiff > 150) {
                isKeyboardVisible = true;
                // 键盘弹起时，滚动到底部
                scrollToInput();
            } else if (isKeyboardVisible && heightDiff < 50) {
                isKeyboardVisible = false;
            }
        }
        
        function scrollToInput() {
            var input = document.getElementById('command');
            if (!input) {
                input = document.activeElement;
            }
            
            if (input && (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA')) {
                // 确保输入框聚焦
                input.focus();
                
                // 延迟滚动，等待键盘完全弹出
                setTimeout(function() {
                    // 方法1：scrollIntoView
                    input.scrollIntoView({block: 'end', behavior: 'smooth'});
                    
                    // 方法2：如果上面没效果，手动滚动
                    setTimeout(function() {
                        var rect = input.getBoundingClientRect();
                        if (rect.bottom > window.innerHeight - 100) {
                            var chatBox = document.getElementById('chat-box');
                            if (chatBox) {
                                chatBox.scrollTop = chatBox.scrollHeight;
                            }
                        }
                    }, 200);
                }, 200);
            }
        }
        
        // 监听页面可见性变化，解决后台计时器暂停问题
        let _fetchTimer = null;
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') {
                // 刷新当前模型信息（可能在其他标签页切换了模型）
                if (typeof fetchCurrentModel === 'function') {
                    if (_fetchTimer) clearTimeout(_fetchTimer);
                    _fetchTimer = setTimeout(fetchCurrentModel, 300);
                }
                // 页面重新可见时，立即更新所有活动会话的计时器显示
                if (currentSessionId && sessionExecutionStates[currentSessionId]) {
                    const sessionState = sessionExecutionStates[currentSessionId];
                    if (sessionState.executionTimer && sessionState.executionStartTime) {
                        // 立即更新计时器显示
                        const elapsed = Math.floor((Date.now() - sessionState.executionStartTime) / 1000);
                        sessionState.executionSeconds = elapsed;
                        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
                        const s = String(elapsed % 60).padStart(2, '0');
                        document.getElementById('status-timer').innerText = `${m}:${s}`;
                    }
                }
            }
        });
        
        // 监听 resize
        window.addEventListener('resize', handleResize);
        
        // 方法2：监听 visualViewport（如果支持）
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', function() {
                if (isKeyboardVisible) {
                    scrollToInput();
                }
            });
        }
        
        // 方法3：监听输入框 focus 事件
        document.addEventListener('focusin', function(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                if (isKeyboardVisible) {
                    scrollToInput();
                }
            }
        });
        
        // 方法4：定时检查（如果键盘可见但输入框被遮挡）
        setInterval(function() {
            if (isKeyboardVisible) {
                var input = document.activeElement;
                if (input && (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA')) {
                    var rect = input.getBoundingClientRect();
                    if (rect.bottom > window.innerHeight - 50) {
                        scrollToInput();
                    }
                }
            }
        }, 500);
        
        // 页面加载完成后的初始化
        (function() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() { originalHeight = window.innerHeight; });
            } else {
                originalHeight = window.innerHeight;
            }
        })();
    })();

    // ================= 前端基础安全防护（防小白） =================
    // 1. 禁用鼠标右键菜单
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });
    
    // 2. 禁用 F12, Ctrl+Shift+I (打开开发者工具), Ctrl+U (查看源码), Ctrl+S (保存网页)
    document.addEventListener('keydown', function(e) {
        if (
            e.keyCode === 123 || // F12
            (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) || // Ctrl+Shift+I/J/C
            (e.ctrlKey && (e.keyCode === 85 || e.keyCode === 83)) // Ctrl+U, Ctrl+S
        ) {
            e.preventDefault();
        }
    });
    // ==========================================================
    var currentToken = localStorage.getItem('wclaw_token');
    var currentUser = localStorage.getItem('wclaw_user');
    var currentCanUseCloud = false; // 仅用于信息展示，不影响功能
    var currentPhone = null; // 当前用户手机号
    var savedUser = localStorage.getItem('wclaw_saved_user');
    var savedPwd = localStorage.getItem('wclaw_saved_pwd');
    var deviceToken = localStorage.getItem('wclaw_device_token');
    var lastTrustedUser = localStorage.getItem('wclaw_last_trusted_user');

    var host = window.location.origin;

    function isLocalStorageAvailable() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }
    var ttsAutoPlayEnabled = true; // 默认开启
    var notifyEnabled = true; // 默认开启

    if (isLocalStorageAvailable()) {
        ttsSettings = JSON.parse(localStorage.getItem('wclaw_tts_settings') || '{}');
        ttsAutoPlayEnabled = localStorage.getItem('wclaw_tts_autoplay') !== 'false';
        notifyEnabled = localStorage.getItem('wclaw_notify') !== 'false';
    }
    var currentAudio = null;
    var isPlaying = false;
    var currentPlayingMsgId = null;
    
    function getTTSSettings() {
        if (isLocalStorageAvailable()) {
            ttsSettings = JSON.parse(localStorage.getItem('wclaw_tts_settings') || '{}');
        }
        return ttsSettings;
    }
    
    function openTTSConfig() {
        const configUrl = 'edge-tts-config.html';
        window.open(configUrl, 'Edge TTS配置', 'width=700,height=800');
    }

    // 从服务端加载 TTS 配置并合并到 localStorage
    async function syncTTSSettingsFromServer() {
        if (!currentToken) return;
        try {
            const res = await fetch(host + '/api/tts_config', {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200 && data.data && Object.keys(data.data).length > 0) {
                var local = JSON.parse(localStorage.getItem('wclaw_tts_settings') || '{}');
                // 服务端配置优先
                var merged = Object.assign({}, local, data.data);
                localStorage.setItem('wclaw_tts_settings', JSON.stringify(merged));
                ttsSettings = merged;
                console.log('TTS 配置已从服务端同步');
            }
        } catch (e) {
            console.log('从服务端同步 TTS 配置失败:', e.message);
        }
    }

    // 保存 TTS 配置到服务端
    async function saveTTSSettingsToServer(settings) {
        if (!currentToken) return;
        try {
            await fetch(host + '/api/tts_config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ config: settings }),
                signal: AbortSignal.timeout(10000)
            });
        } catch (e) {
            console.log('TTS 配置同步到服务端失败:', e.message);
        }
    }
    
    async function playWithEdgeTTS(text, msgId) {
        const settings = getTTSSettings();
        
        console.log('TTS 设置:', settings);
        
        // 修复：如果没有 ttsType 字段，默认使用 edge
        if (!settings.enabled || !settings.apiUrl) {
            console.log('TTS 配置未启用或 API 地址为空');
            return false;
        }
        
        // 检查是否是 Edge TTS 或者 ttsType 未定义（旧配置兼容）
        if (settings.ttsType && settings.ttsType !== 'edge') {
            console.log('TTS 类型不是 edge');
            return false;
        }
        
        try {
            const cleanedText = stripAnsi(text).replace(/[#*_`~\[\]]/g, '').trim();
            if (!cleanedText) return true;
            
            const truncatedText = cleanedText.length > 500 ? cleanedText.substring(0, 500) : cleanedText;
            
            console.log('调用 Edge TTS API:', settings.apiUrl);
            
            // 检查协议是否匹配
            const isPageHTTPS = window.location.protocol === 'https:';
            const isAPIHTTPS = settings.apiUrl.startsWith('https://');
            
            if (isPageHTTPS && !isAPIHTTPS) {
                console.warn('⚠️ 混合内容警告：页面是 HTTPS 但 API 是 HTTP，可能被浏览器阻止');
            }
            
            const response = await fetch(`${settings.apiUrl}/tts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: truncatedText,
                    voice: settings.voice || 'zh-CN-XiaoxiaoNeural',
                    rate: settings.rate || '+0%'
                })
            });
            
            console.log('API 响应状态:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Edge TTS API 请求失败:', response.status, errorText);
                return false;
            }
            
            const audioBlob = await response.blob();
            console.log('音频 Blob 大小:', audioBlob.size, '类型:', audioBlob.type);
            
            if (audioBlob.size === 0) {
                console.error('音频 Blob 为空');
                return false;
            }
            
            const audioUrl = URL.createObjectURL(audioBlob);
            
            if (currentAudio) {
                currentAudio.pause();
                if (currentAudio.src) {
                    URL.revokeObjectURL(currentAudio.src);
                }
            }
            
            currentAudio = new Audio(audioUrl);
            currentAudio.preload = 'auto';
            
            // 修复手机浏览器兼容性问题
            // 1. 添加 playsinline 属性（防止 iOS 全屏）
            currentAudio.setAttribute('playsinline', 'true');
            currentAudio.setAttribute('webkit-playsinline', 'true');
            
            // 2. 添加更多调试信息
            currentAudio.onplay = () => {
                console.log('✅ 音频开始播放');
                isPlaying = true;
                updatePlayButtonState(msgId, true);
            };
            
            currentAudio.onplaying = () => {
                console.log('✅ 音频正在播放');
            };
            
            currentAudio.onended = () => {
                console.log('✅ 音频播放结束');
                isPlaying = false;
                currentPlayingMsgId = null;
                updatePlayButtonState(msgId, false);
                URL.revokeObjectURL(audioUrl);
            };
            
            currentAudio.onerror = (e) => {
                console.error('❌ 音频播放错误:', e);
                console.error('❌ 错误详情:', currentAudio.error);
                isPlaying = false;
                currentPlayingMsgId = null;
                updatePlayButtonState(msgId, false);
                URL.revokeObjectURL(audioUrl);
            };
            
            currentAudio.oncanplay = () => {
                console.log('✅ 音频已就绪，可以播放');
            };
            
            console.log('🎵 开始播放音频...');
            
            // 修复：使用 Promise 链式调用，更好地处理错误
            return currentAudio.play()
                .then(() => {
                    console.log('✅ 播放请求成功');
                    return true;
                })
                .catch(error => {
                    console.error('❌ 播放失败:', error);
                    // 检查是否是自动播放被阻止
                    if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
                        console.warn('⚠️ 浏览器阻止了自动播放，需要用户交互');
                    }
                    throw error;
                });
                
        } catch (e) {
            console.error('❌ Edge TTS 播放失败:', e);
            console.error('❌ 错误堆栈:', e.stack);
            return false;
        }
    }
    
    function updateTTSButton() {
        const btn = document.getElementById('btn-tts-autoplay');
        if (btn) {
            if (ttsAutoPlayEnabled) {
                btn.classList.remove('btn-icon-blue');
                btn.classList.add('btn-tts-active');
                btn.innerHTML = '<i class="fa-solid fa-volume-high"></i><span class="btn-text btn-text-grid"><span>自播</span><span>已开</span></span>';
            } else {
                btn.classList.remove('btn-tts-active');
                btn.classList.add('btn-icon-blue');
                btn.innerHTML = '<i class="fa-solid fa-volume-off"></i><span class="btn-text btn-text-grid"><span>自动</span><span>播放</span></span>';
            }
        }
    }

    function toggleTTSAutoPlay(btn) {
        ttsAutoPlayEnabled = !ttsAutoPlayEnabled;
        localStorage.setItem('wclaw_tts_autoplay', ttsAutoPlayEnabled);
        updateTTSButton();
    }

    function updateNotifyButton() {
        const btn = document.getElementById('btn-notify');
        if (btn) {
            if (notifyEnabled) {
                btn.classList.remove('btn-icon-blue');
                btn.classList.add('btn-tts-active');
                btn.innerHTML = '<i class="fa-solid fa-bell"></i><span class="btn-text btn-text-grid"><span>已开</span><span>提醒</span></span>';
            } else {
                btn.classList.remove('btn-tts-active');
                btn.classList.add('btn-icon-blue');
                btn.innerHTML = '<i class="fa-solid fa-bell-slash"></i><span class="btn-text btn-text-grid"><span>回复</span><span>提醒</span></span>';
            }
        }
    }

    function toggleNotify() {
        notifyEnabled = !notifyEnabled;
        localStorage.setItem('wclaw_notify', notifyEnabled);
        updateNotifyButton();
    }

    function triggerNotify() {
        if (!notifyEnabled) return;
        if (window.AndroidNotify) {
            try { window.AndroidNotify.vibrate(); } catch(e) {}
            try { window.AndroidNotify.playSound(); } catch(e) {}
        }
    }

    function stopAudio() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }
        if (window.speechSynthesis) {
            try { speechSynthesis.cancel(); } catch(e) {}
        }
        isPlaying = false;
        currentPlayingMsgId = null;
    }

    function playTextAsSpeech(text, msgId) {
        if (!text || text.trim() === '') return;

        console.log('准备播放语音:', text.substring(0, 50) + '...');

        stopAudio();
        currentPlayingMsgId = msgId;

        const cleanedText = stripAnsi(text).replace(/[#*_`~\[\]]/g, '').trim();
        if (!cleanedText) return;

        const truncatedText = cleanedText.length > 500 ? cleanedText.substring(0, 500) + '...' : cleanedText;

        const settings = getTTSSettings();
        console.log('当前 TTS 配置:', settings);

        if (settings.enabled && settings.apiUrl && (!settings.ttsType || settings.ttsType === 'edge')) {
            console.log('使用 Edge TTS 播放');
            playWithEdgeTTS(cleanedText, msgId).then(success => {
                if (!success) {
                    console.error('Edge TTS 播放失败');
                    isPlaying = false;
                    currentPlayingMsgId = null;
                    updatePlayButtonState(msgId, false);
                }
            }).catch(e => {
                console.error('Edge TTS 异常:', e);
                isPlaying = false;
                currentPlayingMsgId = null;
                updatePlayButtonState(msgId, false);
            });
        } else {
            console.log('未配置 Edge TTS，尝试浏览器 TTS');
            playWithBrowserTTS(truncatedText, msgId);
        }
    }
    
    function playWithBrowserTTS(truncatedText, msgId) {
        // 检查 speechSynthesis 是否可用
        if (!window.speechSynthesis || typeof speechSynthesis === 'undefined') {
            console.error('浏览器不支持 speechSynthesis');
            alert('APP内置浏览器不支持语音合成，请点击右上角 ⋮ 按钮 → "TTS语音" 配置 Edge TTS 服务（APP 和电脑不共用设置）');
            isPlaying = false;
            currentPlayingMsgId = null;
            updatePlayButtonState(msgId, false);
            return;
        }

        try {
            const utterance = new SpeechSynthesisUtterance(truncatedText);
            utterance.lang = 'zh-CN';
            utterance.rate = 2.0;
            utterance.volume = 1;

            function initVoice() {
                try {
                    const voices = speechSynthesis.getVoices();
                    console.log('可用语音:', voices.map(v => `${v.name} (${v.lang})`));

                    let zhVoice = voices.find(v => v.lang.includes('zh-CN') && v.name.includes('Chinese'));
                    if (!zhVoice) zhVoice = voices.find(v => v.lang.includes('zh'));
                    if (!zhVoice) zhVoice = voices.find(v => v.name.toLowerCase().includes('zh'));
                    if (!zhVoice && voices.length > 0) zhVoice = voices[0];

                    if (zhVoice) {
                        utterance.voice = zhVoice;
                        console.log('使用语音:', zhVoice.name);
                    }

                    utterance.onend = function() {
                        isPlaying = false;
                        currentPlayingMsgId = null;
                        updatePlayButtonState(msgId, false);
                    };

                    utterance.onerror = function(e) {
                        console.error('语音播放错误:', e);
                        isPlaying = false;
                        currentPlayingMsgId = null;
                        updatePlayButtonState(msgId, false);
                    };

                    isPlaying = true;
                    updatePlayButtonState(msgId, true);
                    speechSynthesis.speak(utterance);
                } catch (e) {
                    console.error('initVoice 异常:', e);
                    isPlaying = false;
                    currentPlayingMsgId = null;
                    updatePlayButtonState(msgId, false);
                }
            }

            const voices = speechSynthesis.getVoices();
            if (voices.length === 0) {
                console.log('语音列表为空，等待加载...');
                speechSynthesis.onvoiceschanged = function() {
                    speechSynthesis.onvoiceschanged = null;
                    initVoice();
                };
                setTimeout(function() {
                    if (speechSynthesis.getVoices().length === 0) {
                        initVoice();
                    }
                }, 1000);
            } else {
                initVoice();
            }
        } catch (e) {
            console.error('playWithBrowserTTS 异常:', e);
            isPlaying = false;
            currentPlayingMsgId = null;
            updatePlayButtonState(msgId, false);
        }
    }

    function updatePlayButtonState(msgId, playing) {
        const btn = document.getElementById(`play-btn-${msgId}`);
        if (btn) {
            btn.src = playing ? 'icon/stop.png' : 'icon/play.png';
            btn.title = playing ? '停止播放' : '播放语音';
        }
        // 更新移动端菜单项的文本和图标
        const menuItem = document.getElementById(`menu-play-${msgId}`);
        if (menuItem) {
            menuItem.innerHTML = playing
                ? '<i class="fa-solid fa-pause"></i> 暂停播放'
                : '<i class="fa-solid fa-play"></i> 播放语音';
        }
    }

    function handlePlayClick(msgId, text, btnElement) {
        console.log('点击播放按钮，msgId:', msgId);
        console.log('当前播放状态:', { isPlaying, hasCurrentAudio: currentAudio !== null, currentPlayingMsgId });

        // 如果正在播放同一个消息，停止播放
        if (isPlaying && currentPlayingMsgId === msgId) {
            console.log('停止当前播放');
            stopAudio();
            currentPlayingMsgId = null;
            updatePlayButtonState(msgId, false);
            return;
        }

        // 如果正在播放其他消息，先停止
        if (isPlaying) {
            console.log('停止当前播放并开始新的播放');
            const oldMsgId = currentPlayingMsgId;
            stopAudio();
            updatePlayButtonState(oldMsgId, false);
        }

        // 立即显示播放中状态（视觉反馈）
        isPlaying = true;
        currentPlayingMsgId = msgId;
        updatePlayButtonState(msgId, true);

        // 开始播放新消息
        console.log('开始新播放');
        // 播放时过滤掉思考过程 <think>...】（循环移除，处理嵌套标签）
        var cleanText = decodeURIComponent(text);
        var _prevT;
        do { _prevT = cleanText; cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/gi, ''); } while (cleanText !== _prevT);
        cleanText = cleanText.trim();
        playTextAsSpeech(cleanText, msgId);
    }

    // 添加一个全局调试函数，方便在控制台测试
    window.testTTS = function() {
        console.log('=== TTS 调试信息 ===');
        console.log('localStorage 可用:', isLocalStorageAvailable());
        console.log('TTS 设置:', getTTSSettings());
        console.log('页面协议:', window.location.protocol);
        console.log('当前播放状态:', { isPlaying, hasCurrentAudio: currentAudio !== null });

        // 测试播放
        const testText = '你好，这是测试语音';
        const testMsgId = 'test-' + Date.now();
        console.log('测试播放文本:', testText);
        playTextAsSpeech(testText, testMsgId);
    };
    var currentTab = 'login';
    var loginMode = 'password'; // 'password' 或 'sms'

    var currentEventSource = null;
    var currentMsgId = null;
    var sseReconnectAttempts = 0;
    var sseReconnectTimer = null;
    var heartbeatFailures = 0;
    var isReconnecting = false;
    var MAX_SSE_RECONNECT_ATTEMPTS = 5;
    var MAX_HEARTBEAT_FAILURES = 3;
    var HEARTBEAT_INTERVAL = 5000;
    var SSE_RECONNECT_BASE_DELAY = 1000;

    var executionTimer = null;
    var executionSeconds = 0;

    var currentSessionId = null;
    var sessions = [];
    var isSessionBatchMode = false;

    // 会话执行状态管理 - 为每个会话维护独立的执行状态
    var sessionExecutionStates = {};

    // 远程执行状态（按 sessionId 追踪）
    var remoteExecutingSessions = {}; // { sessionId: { since: timestamp } }

    // 为指定会话创建执行状态
    function getSessionState(sessionId) {
        if (!sessionExecutionStates[sessionId]) {
            sessionExecutionStates[sessionId] = {
                isExecuting: false,
                eventSource: null,
                msgId: null,
                reconnectAttempts: 0,
                reconnectTimer: null,
                _pollInterval: null,
                sseCompleted: false,
                stoppedByUser: false,
                processedResults: new Set(),
                executionTimer: null,
                executionSeconds: 0,
                executionStartTime: null,
                accumulatedOutput: '',
                streamSavedMsgId: null
            };
        }
        return sessionExecutionStates[sessionId];
    }

    // 清理指定会话的执行状态
    function cleanupSessionState(sessionId) {
        const state = sessionExecutionStates[sessionId];
        if (state) {
            if (state.eventSource) {
                state.eventSource.close();
                state.eventSource = null;
            }
            if (state.reconnectTimer) {
                clearTimeout(state.reconnectTimer);
                state.reconnectTimer = null;
            }
            if (state._pollInterval) {
                clearInterval(state._pollInterval);
                state._pollInterval = null;
            }
            state.msgId = null;
            state.reconnectAttempts = 0;
            state.sseCompleted = false;
            state.stoppedByUser = false;
            if (state.processedResults) state.processedResults.clear();
            if (state._idleCheckInterval) { clearInterval(state._idleCheckInterval); state._idleCheckInterval = null; }
        }
    }
    // 显示应用顶部横幅通知（非模态，不阻塞操作）
    function showNotice(message) {
        let noticeEl = document.getElementById('app-notice-banner');
        if (!noticeEl) {
            noticeEl = document.createElement('div');
            noticeEl.id = 'app-notice-banner';
            noticeEl.style.cssText = 'display:none; background:#FF9500; color:#fff; text-align:center; padding:8px 16px; font-size:13px; line-height:1.5; position:relative;';
            const appArea = document.getElementById('app-area');
            if (appArea) {
                appArea.insertBefore(noticeEl, appArea.firstChild);
            }
        }
        noticeEl.innerHTML = '<i class="fa-solid fa-info-circle"></i> ' + message;
        noticeEl.style.display = 'block';
    }

    function hideNotice() {
        const noticeEl = document.getElementById('app-notice-banner');
        if (noticeEl) {
            noticeEl.style.display = 'none';
        }
    }

    function showToast(type, message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.className = 'alert ' + type;
        toast.innerText = message;
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 3000);
    }

    function escapeHtml(unsafe) {
        return (unsafe||'').toString()
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
    
    function stripAnsi(str) {
        if (!str) return '';
        // 移除所有 ANSI 转义序列：
        //   \x1B[...    CSI 序列（含私有模式如 \x1B[?25l）
        //   \x1B]...\x07 OSC 序列（操作系统命令，以 BEL 结尾）
        //   \x1B\\.      其他两字符序列（如 \x1B\\c）
        return str.replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '')
                  .replace(/\x1B\].*?\x07/g, '')
                  .replace(/\x1B\\[a-zA-Z]/g, '');
    }


    function showExecutionTime(msgId, sessionId) {
        const timeRow = document.getElementById(`time-row-reply-${msgId}`);
        if (!timeRow) return;
        // 避免重复添加（result 和 done 事件都会触发此函数）
        if (timeRow.querySelector('.exec-time')) return;
        const sessionState = getSessionState(sessionId);
        const elapsed = sessionState.executionSeconds || 0;
        if (elapsed <= 0) return;
        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        timeRow.innerHTML += ` <span class="exec-time">⏱ ${m}:${s}</span>`;
    }
    
    // 自动补全未闭合的 <think> 块（流式输出时可能还没收到 </think>）
    // 只在文本末尾有未闭合的 <think> 标签时才补全，避免流式输出时闪烁
    function autoCloseThinkBlocks(text) {
        // 检查文本末尾是否有未闭合的 <think> 标签
        // 使用 [\s\S]* 而不是 .* 以匹配跨行内容
        var lastOpenTag = text.lastIndexOf('<think>');
        var lastCloseTag = text.lastIndexOf('</think>');

        // 如果最后一个 <think> 在最后一个 </think> 之后，说明有未闭合的标签
        if (lastOpenTag > lastCloseTag) {
            // 只补全一次，而不是根据标签数量补全
            text += '\n</think>';
        }
        return text;
    }

    // 代码块复制按钮
    function copyCodeBlock(btn) {
        var code = btn.getAttribute('data-code')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(function() {
                btn.innerHTML = '<i class="fa-solid fa-check"></i>';
                setTimeout(function() { btn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1500);
            });
        } else {
            var ta = document.createElement('textarea');
            ta.value = code; ta.style.cssText = 'position:fixed;left:-9999px';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); btn.innerHTML = '<i class="fa-solid fa-check"></i>'; setTimeout(function() { btn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1500); } catch(e) {}
            document.body.removeChild(ta);
        }
    }

    function renderMessageContent(content, skipExitTag = false, isStreaming = false) {
        try {
            const obj = JSON.parse(content);
            if (obj.type === 'image') {
                let html = `<img src="${host}${obj.url}" loading="lazy" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px; display: block; cursor: pointer;" onclick="openImagePreview('${host}${obj.url.replace(/'/g, "\\'")}')" />`;
                if (obj.text) {
                    html += `<div style="margin-bottom: 8px;">${escapeHtml(obj.text)}</div>`;
                }
                html += `<a href="javascript:void(0)" onclick="downloadFile('${obj.url.replace(/'/g, "\\'")}', '${escapeHtml(obj.name)}')" style="color: inherit; text-decoration: underline; font-size: 13px;">下载图片 (${(obj.size/1024/1024).toFixed(2)}MB)</a>`;
                return html;
            } else if (obj.type === 'file') {
                let html = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <i class="fa-solid fa-file-lines" style="font-size: 24px;"></i>
                            <span style="font-weight: 500;">${escapeHtml(obj.name)}</span>
                        </div>`;
                if (obj.text) {
                    html += `<div style="margin-bottom: 8px;">${escapeHtml(obj.text)}</div>`;
                }
                html += `<a href="javascript:void(0)" onclick="downloadFile('${obj.url.replace(/'/g, "\\'")}', '${escapeHtml(obj.name)}')" style="color: inherit; text-decoration: underline; font-size: 13px;">下载文件 (${(obj.size/1024/1024).toFixed(2)}MB)</a>`;
                return html;
            }
        } catch(e) {
        }

        // 处理带引用的文本消息（text_with_quote）
        try {
            const obj = JSON.parse(content);
            if (obj.type === 'text_with_quote') {
                const quoteLabel = obj.quoteRole === 'ai' ? '引用 AI' : obj.quoteRole === 'user' ? '引用自己' : '引用文本';
                const qContent = escapeHtml(obj.quote.substring(0, 100)) + (obj.quote.length > 100 ? '...' : '');
                const clickable = obj.quoteMsgId ? ` onclick="scrollToMessage('${obj.quoteMsgId}')" style="cursor:pointer;"` : '';
                const quoteHtml = `<div class="msg-quote"${clickable}><div class="msg-quote-label">${quoteLabel}:</div><div class="msg-quote-content">${qContent}</div></div>`;
                return quoteHtml + renderTextPipeline(obj.text);
            }
        } catch(e) {}

        // 提前提取 Exit 标记（marked 转换 HTML 后再检测会失效）
        const hasExitText = !skipExitTag && content.length > 0 && content.endsWith(' Exit');
        if (hasExitText) {
            content = content.slice(0, -5);
        }

        // 原始流程（不折叠）
        let safeContent = renderTextPipeline(content, isStreaming);

        if (hasExitText) {
            safeContent += ' Exit';
        }

        return safeContent;
    }

    // 检测文本末尾是否有未闭合的代码块（流式渲染时用于延迟高亮）
    function _hasIncompleteCodeBlock(text) {
        var inFence = false;
        var lines = text.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var trimmed = lines[i].trim();
            if (!inFence) {
                if (/^(`{3,})(.*)/.test(trimmed) || /^(~{3,})(.*)/.test(trimmed)) {
                    inFence = true;
                }
            } else {
                if (/^`{3,}\s*$/.test(trimmed) || /^~{3,}\s*$/.test(trimmed)) {
                    inFence = false;
                }
            }
        }
        return inFence;
    }

    function renderTextPipeline(text, isStreaming) {
        // 0. 自动补全未闭合的 <think> 块（流式输出时 </think> 可能还没到达）
        text = autoCloseThinkBlocks(text);

        // 0b. 清理多余的 </think> 标签（流式输出时 autoCloseThinkBlocks 可能已补全，后续收到的 </think> 会多余）
        text = text.replace(/<\/think>\s*<\/think>/gi, '</think>');

        // 0c. 保护 think 块（折叠思考过程）- 栈式解析，将 think 与正文分离
        const thinkBlocks = [];
        const thinkContents = new Set();
        var _segs = []; // 交替: 正文string / think索引number
        var _depth = 0;
        var _thinkBuf = '';
        var _pos = 0;
        var _lastCp = 0;
        var _lower = text.toLowerCase();
        while (_pos < text.length) {
            var _o = _lower.indexOf('<think>', _pos);
            var _c = _lower.indexOf('</think>', _pos);
            if (_o === -1 && _c === -1) {
                if (_depth > 0) { _thinkBuf += text.substring(_lastCp); }
                break; // 剩余文本由兜底逻辑(行879-883)统一处理，避免重复
            }
            if (_c === -1 || (_o !== -1 && _o < _c)) {
                if (_depth === 0) { _segs.push(text.substring(_lastCp, _o)); }
                else { _thinkBuf += text.substring(_lastCp, _o); }
                _depth++;
                if (_depth > 1) { _thinkBuf += '<think>'; }
                _pos = _o + 7; _lastCp = _pos;
            } else {
                if (_depth > 0) {
                    _thinkBuf += text.substring(_lastCp, _c);
                    _depth--;
                    if (_depth === 0) {
                        var _tr = _thinkBuf.trim().replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n');
                        var _uIdx = -1;
                        if (!thinkContents.has(_tr)) {
                            for (var _ex of thinkContents) {
                                if (_tr.includes(_ex) && _ex.length < _tr.length) {
                                    var _ei = thinkBlocks.indexOf(_ex);
                                    if (_ei !== -1) { thinkBlocks[_ei] = _tr; thinkContents.delete(_ex); thinkContents.add(_tr); _uIdx = _ei; break; }
                                }
                            }
                            if (_uIdx === -1) { _uIdx = thinkBlocks.length; thinkBlocks.push(_tr); thinkContents.add(_tr); }
                        }
                        if (_uIdx >= 0) { _segs.push(_uIdx); }
                        _thinkBuf = '';
                    } else {
                        _thinkBuf += '</think>';
                    }
                }
                _pos = _c + 8; _lastCp = _pos;
            }
        }
        if (_depth > 0) {
            var _tr2 = (_thinkBuf + text.substring(_lastCp)).trim().replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n');
            if (_tr2 && !thinkContents.has(_tr2)) { var _i2 = thinkBlocks.length; thinkBlocks.push(_tr2); thinkContents.add(_tr2); _segs.push(_i2); }
        } else if (_lastCp < text.length) {
            _segs.push(text.substring(_lastCp));
        }
        // 用 <!--THINK_N--> 注释标记插入正文中，marked 不会包裹 HTML 注释为 <p>
        var _textParts = [];
        for (var _si = 0; _si < _segs.length; _si++) {
            if (typeof _segs[_si] === 'number') {
                _textParts.push('\n<!--THINK_' + _segs[_si] + '-->\n');
            } else {
                _textParts.push(_segs[_si]);
            }
        }
        text = _textParts.join('');

        // 0d. 兜底：确保 parser 没有遗漏任何 <think> 标签（防止泄漏到 marked 中变成可见文本）
        var _leftoverOpen = (text.match(/<think>/gi) || []).length;
        if (_leftoverOpen > 0) {
            var _leftoverClose = (text.match(/<\/think>/gi) || []).length;
            if (_leftoverOpen === _leftoverClose) {
                // 平衡的标签对 → 用正则提取为 think 块
                text = text.replace(/<think>([\s\S]*?)<\/think>/gi, function(_, _inner) {
                    var _tr = _inner.trim();
                    if (!_tr || thinkContents.has(_tr)) return '';
                    var _i = thinkBlocks.length;
                    thinkBlocks.push(_tr);
                    thinkContents.add(_tr);
                    return '\n<!--THINK_' + _i + '-->\n';
                });
            } else {
                // 不平衡 → 直接移除所有 <think> 标签避免泄漏
                text = text.replace(/<think>/gi, '').replace(/<\/think>/gi, '');
            }
        }

        // 1. 统一换行符，限制最多连续2个换行（段落分隔）
        text = text.replace(/\r\n/g, '\n');
        text = text.replace(/\n{3,}/g, '\n\n');

        // 1. SEND_FILE 标记 → 文件已发送提示卡片
        const sendFileList = [];
        text = text.replace(/\[SEND_FILE:\s*([^\]]+)\]/g, (_match, fileInfo) => {
            const idx = sendFileList.length;
            sendFileList.push(fileInfo.trim());
            return `%%SEND_FILE_${idx}%%`;
        });

        // 2. FILE_READY → 占位符（避免 marked 干扰）
        const fileReadyList = [];
        text = text.replace(/\[FILE_READY:\s*([^|]+)\|\s*([^\]]+)\]/g, (_match, url, name) => {
            const idx = fileReadyList.length;
            fileReadyList.push({ url: url.trim(), name: name.trim() });
            return `%%FILE_READY_${idx}%%`;
        });

        // 2b. LaTeX 公式 → 占位符（避免 marked 干扰）
        const mathBlocks = [];
        // 先保护 fenced code blocks 和 inline code，避免误提取代码中的 $
        const codePlaceholders = [];
        text = text.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (m) => {
            const idx = codePlaceholders.length;
            codePlaceholders.push(m);
            return `%%CODE_PH_${idx}%%`;
        });
        // display math: $$...$$
        text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_match, tex) => {
            const idx = mathBlocks.length;
            mathBlocks.push({ tex: tex.trim(), display: true });
            return `%%MATH_${idx}%%`;
        });
        // inline math: $...$（排除转义 \$ 和空内容）
        text = text.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g, (_match, tex) => {
            const idx = mathBlocks.length;
            mathBlocks.push({ tex: tex.trim(), display: false });
            return `%%MATH_${idx}%%`;
        });
        // 恢复代码占位符（循环替换确保全部恢复，避免相同内容代码块只恢复第一个）
        codePlaceholders.forEach((m, i) => {
            let ph = `%%CODE_PH_${i}%%`;
            while (text.includes(ph)) {
                text = text.replace(ph, function() { return m; });
            }
        });

        // 3. 保护行内代码中的管道符，防止被表格解析器误判为单元格分隔符
        const PIPE_HOLDER = '%%_PIPE_' + Date.now() + '_%%';
        text = text.replace(/(`+)(.+?)\1/g, (match, ticks, content) => {
            if (content.includes('|')) {
                return ticks + content.replace(/\|/g, PIPE_HOLDER) + ticks;
            }
            return match;
        });

        // 4. 修复无头表格（marked 不支持直接以分隔线开头的表格）
        text = fixHeaderlessTables(text);

        // 5. marked 解析 Markdown → HTML
        let html = renderMarkdownSafe(text, isStreaming);

        // 4. 代码高亮已在 _mdRenderer.code 渲染器内完成（通过 window._mdIsStreaming 控制）

        // 4b. Mermaid 图表渲染（流式渲染时跳过，避免不完整代码块反复报错闪烁）
        // mermaid@11 的 render() 是异步的，改用 DOM 操作渲染

        // 5. 恢复 FILE_READY 占位符
        fileReadyList.forEach((item, idx) => {
            const htmlBlock = `<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px; padding: 10px; background: var(--input-bg); border-radius: 8px; border: 1px solid var(--border);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-file-arrow-down" style="font-size: 24px; color: var(--primary);"></i>
                        <span style="font-weight: 500; color: var(--text-main);">${escapeHtml(item.name)}</span>
                    </div>
                    <a href="javascript:void(0)" onclick="downloadFile('${item.url.replace(/'/g, "\\'")}', '${escapeHtml(item.name)}')" style="color: var(--primary); text-decoration: none; font-size: 14px; display: inline-flex; align-items: center; gap: 4px; font-weight: bold; cursor: pointer;">
                        <i class="fa-solid fa-download"></i> 点击下载文件
                    </a>
                </div>`;
            html = html.replace(`%%FILE_READY_${idx}%%`, htmlBlock);
        });

        // 5a. 恢复 SEND_FILE 占位符 → 文件已发送提示
        sendFileList.forEach((fileInfo, idx) => {
            const htmlBlock = `<div style="display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; padding: 6px 12px; background: rgba(52, 199, 89, 0.1); border-radius: 6px; border: 1px solid rgba(52, 199, 89, 0.2); font-size: 13px; color: #34C759;">
                    <i class="fa-solid fa-check-circle"></i>
                    <span>文件已发送: ${escapeHtml(fileInfo)}</span>
                </div>`;
            html = html.replace(`%%SEND_FILE_${idx}%%`, htmlBlock);
        });

        // 5b. 恢复 LaTeX 公式占位符 → KaTeX 渲染（流式渲染时显示原始 LaTeX，流结束后统一渲染）
        if (isStreaming) {
            // 流式阶段：直接显示原始 LaTeX 文本，避免不完整公式反复报错
            mathBlocks.forEach((item, idx) => {
                const raw = item.display ? '$$' + item.tex + '$$' : '$' + item.tex + '$';
                const fallback = item.display
                    ? '<div class="katex-streaming" style="padding:4px 0;font-style:italic;color:var(--text-sub);">' + escapeHtml(raw) + '</div>'
                    : '<span class="katex-streaming" style="font-style:italic;color:var(--text-sub);">' + escapeHtml(raw) + '</span>';
                html = html.replace(`%%MATH_${idx}%%`, fallback);
            });
        } else if (typeof katex !== 'undefined') {
            mathBlocks.forEach((item, idx) => {
                try {
                    const rendered = katex.renderToString(item.tex, {
                        displayMode: item.display,
                        throwOnError: false,
                        trust: true
                    });
                    const wrapper = item.display
                        ? '<div class="katex-display-wrapper">' + rendered + '</div>'
                        : '<span class="katex-inline-wrapper">' + rendered + '</span>';
                    html = html.replace(`%%MATH_${idx}%%`, wrapper);
                } catch (e) {
                    // KaTeX 渲染失败，显示原始 LaTeX 并提示错误
                    console.warn('[katex] 渲染失败:', e.message);
                    const errorMsg = e.message || '语法错误';
                    const fallback = item.display
                        ? '<div class="katex-error" style="padding: 8px 12px; background: rgba(255, 149, 0, 0.08); border: 1px solid rgba(255, 149, 0, 0.2); border-radius: 6px; margin: 8px 0;">'
                            + '<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; color: #FF9500; font-size: 13px;">'
                            + '<i class="fa-solid fa-triangle-exclamation"></i> 公式渲染失败</div>'
                            + '<code style="font-size: 13px;">$$' + escapeHtml(item.tex) + '$$</code>'
                            + '<div style="font-size: 12px; color: var(--text-sub); margin-top: 4px;">' + escapeHtml(errorMsg) + '</div></div>'
                        : '<span class="katex-error" style="padding: 2px 6px; background: rgba(255, 149, 0, 0.08); border: 1px solid rgba(255, 149, 0, 0.2); border-radius: 4px;" title="' + escapeHtml(errorMsg) + '">'
                            + '<code>$' + escapeHtml(item.tex) + '$</code></span>';
                    html = html.replace(`%%MATH_${idx}%%`, fallback);
                }
            });
        } else {
            // KaTeX 未加载，显示原始 LaTeX 并提示
            mathBlocks.forEach((item, idx) => {
                const fallback = item.display
                    ? '<div class="katex-fallback" style="padding: 8px 12px; background: rgba(255, 149, 0, 0.08); border: 1px solid rgba(255, 149, 0, 0.2); border-radius: 6px; margin: 8px 0;">'
                        + '<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; color: #FF9500; font-size: 13px;">'
                        + '<i class="fa-solid fa-info-circle"></i> 公式库未加载，显示原始代码</div>'
                        + '<code style="font-size: 13px;">$$' + escapeHtml(item.tex) + '$$</code></div>'
                    : '<span class="katex-fallback" style="padding: 2px 6px; background: rgba(255, 149, 0, 0.08); border: 1px solid rgba(255, 149, 0, 0.2); border-radius: 4px;" title="公式库未加载">'
                        + '<code>$' + escapeHtml(item.tex) + '$</code></span>';
                html = html.replace(`%%MATH_${idx}%%`, fallback);
            });
        }

        // 6. 恢复 think 块占位符为可折叠 HTML（使用 HTML 注释标记，避免 marked 包裹 <p>）
        const thinkExpanded = window.__thinkExpanded === true;
        for (let idx = thinkBlocks.length - 1; idx >= 0; idx--) {
            const content = thinkBlocks[idx];
            const escaped = escapeHtml(content);
            const htmlBlock = `<div class="think-block${thinkExpanded ? ' open' : ''}">
                    <div class="think-summary" onclick="toggleThinkBlock(this)">
                        <i class="fa-solid fa-chevron-right"></i> 思考过程
                    </div>
                    <div class="think-body">${escaped}</div>
                </div>`;
            html = html.replace(`<!--THINK_${idx}-->`, htmlBlock);
        }
        // 扫尾：清理任何遗落的 think 占位符，替换为空字符串
        html = html.replace(/<!--THINK_\d+-->/g, '');

        // 7. 恢复行内代码中被保护的管道符
        html = html.replace(new RegExp(PIPE_HOLDER.replace(/%/g, '\\%'), 'g'), '|');

        return html;
    }

    // 修复 marked 不支持的"无头表格"（直接以 |---|---| 分隔线开头）
    function fixHeaderlessTables(text) {
        return text.replace(/^(\|[\s\-:|]+\|)\s*$/gm, (match, sepLine, offset) => {
            const before = text.slice(0, offset).trim().split('\n').pop() || '';
            // 如果前一行已是表格行（有 | 且不是分隔线），说明 header 存在
            if (/^\|/.test(before) && !/^\|[\s\-:|]+\|$/.test(before)) {
                return match;
            }
            // 插入空 header 行
            const colCount = match.split('|').length - 2;
            if (colCount < 2) return match;
            return '|' + ' |'.repeat(colCount - 1) + ' |\n' + match;
        });
    }

    // 异步渲染 mermaid 代码块（mermaid@11 的 render() 是异步的）
    function renderMermaidBlocks(container) {
        console.log('[mermaid] renderMermaidBlocks called, container:', container);
        if (typeof mermaid === 'undefined') {
            console.log('[mermaid] mermaid is undefined');
            return;
        }
        // 查找所有 mermaid 代码块的容器（通过 code.language-mermaid 识别）
        var wrappers = container.querySelectorAll('.code-block-wrapper');
        console.log('[mermaid] found wrappers:', wrappers.length);
        if (wrappers.length === 0) return;

        var mermaidIdx = 0;
        wrappers.forEach(function(wrapper) {
            var codeEl = wrapper.querySelector('code.language-mermaid');
            console.log('[mermaid] checking wrapper, has mermaid code:', !!codeEl);
            if (!codeEl) return; // 不是 mermaid 代码块，跳过

            // 从复制按钮获取 data-code 属性（包含原始代码，已HTML转义）
            var copyBtn = wrapper.querySelector('.code-copy-btn');
            var src = '';
            if (copyBtn) {
                var dataCode = copyBtn.getAttribute('data-code') || '';
                console.log('[mermaid] data-code from button:', dataCode.substring(0, 50) + '...');
                // HTML 反转义
                src = dataCode.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#39;/g, "'");
            }
            if (!src) {
                src = codeEl.textContent || '';
                console.log('[mermaid] fallback to textContent:', src.substring(0, 50) + '...');
            }
            if (!src) {
                console.log('[mermaid] no source found, skipping');
                return;
            }

            console.log('[mermaid] rendering with source:', src.substring(0, 100) + '...');
            var id = 'mermaid-' + Date.now() + '-' + (mermaidIdx++);
            try {
                mermaid.render(id, src).then(function(result) {
                    // mermaid@11 返回 { svg: string, bindFunctions?: function }
                    var svgHtml = result.svg || result;
                    // 创建 mermaid 图表容器（带复制按钮）
                    var mermaidDiv = document.createElement('div');
                    mermaidDiv.className = 'mermaid-wrapper';
                    mermaidDiv.innerHTML = svgHtml;
                    // 添加复制按钮（复制原始 mermaid 源码）
                    var btn = document.createElement('button');
                    btn.className = 'code-copy-btn';
                    var encodedSrc = src.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    btn.setAttribute('data-code', encodedSrc);
                    btn.setAttribute('title', '复制源码');
                    btn.innerHTML = '<i class="fa-regular fa-copy"></i>';
                    btn.onclick = function() { copyCodeBlock(this); };
                    mermaidDiv.appendChild(btn);
                    wrapper.parentNode.replaceChild(mermaidDiv, wrapper);
                }).catch(function(e) {
                    console.warn('[mermaid] 渲染失败:', e);
                    var errorMsg = e.message || '未知错误';
                    var lineMatch = errorMsg.match(/line (\d+)/i);
                    var hint = lineMatch ? '（可能在第 ' + lineMatch[1] + ' 行附近）' : '';
                    var errorDiv = document.createElement('div');
                    errorDiv.className = 'mermaid-error';
                    errorDiv.style.cssText = 'padding: 12px; background: rgba(255, 59, 48, 0.08); border: 1px solid rgba(255, 59, 48, 0.2); border-radius: 8px; margin: 8px 0;';
                    errorDiv.innerHTML = '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #FF3B30;">'
                        + '<i class="fa-solid fa-triangle-exclamation"></i>'
                        + '<b>图表渲染失败</b> ' + escapeHtml(hint)
                        + '</div>'
                        + '<div style="font-size: 13px; color: var(--text-sub); margin-bottom: 8px;">错误: ' + escapeHtml(errorMsg) + '</div>'
                        + '<details style="font-size: 13px;"><summary style="cursor: pointer; color: var(--primary);">查看原始代码</summary>'
                        + '<pre style="margin-top: 8px; padding: 8px; background: var(--input-bg); border-radius: 6px; overflow-x: auto;">' + escapeHtml(src) + '</pre>'
                        + '</details>';
                    wrapper.parentNode.replaceChild(errorDiv, wrapper);
                });
            } catch(e) {
                console.warn('[mermaid] 渲染异常:', e);
                var errorDiv = document.createElement('div');
                errorDiv.className = 'mermaid-error';
                errorDiv.textContent = 'Mermaid 渲染异常: ' + e.message;
                wrapper.parentNode.replaceChild(errorDiv, wrapper);
            }
        });
    }
    window.renderMermaidBlocks = renderMermaidBlocks;

    function toggleThinkBlock(el) {
        const block = el.closest('.think-block');
        const isOpen = block.classList.toggle('open');
        window.__thinkExpanded = isOpen;
    }

    // 通过下载接口直接跳转下载（触发 Android WebView DownloadListener / 兼容各端）
    function downloadFile(url, filename) {
        const fileParam = encodeURIComponent(url.split('/').pop());
        const nameParam = encodeURIComponent(filename);
        const downloadUrl = '/api/file/download?file=' + fileParam + '&name=' + nameParam;

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    // 文件预览功能
    function previewFile(url, filename) {
        var overlay = document.createElement('div');
        overlay.className = 'file-preview-overlay';
        overlay.innerHTML = '<div class="file-preview-modal">' +
            '<div class="file-preview-header"><span>' + escapeHtml(filename) + '</span><button class="btn-icon" onclick="this.closest(\'.file-preview-overlay\').remove()"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div class="file-preview-body"><div style="text-align:center;padding:40px;color:var(--text-muted);">加载中...</div></div>' +
            '</div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

        var ext = filename.split('.').pop().toLowerCase();
        var binaryExts = ['pdf','doc','docx','xls','xlsx','ppt','pptx','zip','rar','7z','tar','gz','bz2','exe','msi','dmg','apk','ipa','iso','img','mp3','mp4','avi','mkv','mov','wav','flac','ogg','webm','webp','bmp','tiff','tif','psd','ai','sketch'];
        if (binaryExts.includes(ext)) {
            overlay.querySelector('.file-preview-body').innerHTML = '<div style="text-align:center;padding:40px;">' +
                '<i class="fa-solid fa-file-circle-exclamation" style="font-size:48px;color:var(--text-sub);margin-bottom:16px;display:block;"></i>' +
                '<div style="color:var(--text-main);font-size:15px;margin-bottom:8px;">' + escapeHtml(filename) + '</div>' +
                '<div style="color:var(--text-sub);font-size:13px;margin-bottom:16px;">此文件类型（' + escapeHtml(ext.toUpperCase()) + '）不支持在线预览</div>' +
                '<a href="javascript:void(0)" onclick="downloadFile(\'' + url.replace(/'/g, "\\'") + '\', \'' + escapeHtml(filename) + '\')" style="color:var(--primary);text-decoration:none;font-size:14px;font-weight:bold;">' +
                '<i class="fa-solid fa-download"></i> 下载文件</a></div>';
            return;
        }

        fetch(url).then(function(r) { return r.text(); }).then(function(text) {
            var body = overlay.querySelector('.file-preview-body');
            var ext = filename.split('.').pop().toLowerCase();
            if (ext === 'csv') {
                // CSV → 表格
                var lines = text.split('\n').filter(function(l) { return l.trim(); });
                if (lines.length === 0) { body.innerHTML = '<div style="padding:20px;color:var(--text-muted);">空文件</div>'; return; }
                var tableHtml = '<div class="table-wrapper"><table>';
                lines.forEach(function(line, i) {
                    var cells = line.split(',');
                    tableHtml += '<tr>';
                    cells.forEach(function(c) { tableHtml += (i === 0 ? '<th>' : '<td>') + escapeHtml(c.trim()) + (i === 0 ? '</th>' : '</td>'); });
                    tableHtml += '</tr>';
                });
                tableHtml += '</table></div>';
                body.innerHTML = tableHtml;
            } else {
                // 代码文件 → 语法高亮
                var langMap = {js:'javascript',ts:'typescript',py:'python',rb:'ruby',sh:'bash',yml:'yaml',md:'markdown',kt:'kotlin',rs:'rust',go:'go',java:'java',c:'c',cpp:'cpp',h:'c',cs:'csharp',php:'php',swift:'swift',dart:'dart',sql:'sql',json:'json',xml:'xml',html:'xml',css:'css',toml:'ini',ini:'ini',cfg:'ini',env:'bash',dockerfile:'dockerfile',makefile:'makefile',gitignore:'bash',log:'plaintext',txt:'plaintext'};
                var lang = langMap[ext] || 'plaintext';
                var codeHtml = escapeHtml(text);
                if (typeof hljs !== 'undefined' && hljs.getLanguage(lang)) {
                    try { codeHtml = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value; } catch(e) {}
                } else if (typeof hljs !== 'undefined') {
                    try { codeHtml = hljs.highlightAuto(text).value; } catch(e) {}
                }
                body.innerHTML = '<pre class="md-code" style="margin:0;border:none;max-height:70vh;"><code>' + codeHtml + '</code></pre>';
            }
        }).catch(function() {
            overlay.querySelector('.file-preview-body').innerHTML = '<div style="padding:20px;color:#ff6b6b;">文件加载失败</div>';
        });
    }
    window.previewFile = previewFile;

    // 消息锚点跳转
    function scrollToMessage(msgId) {
        var el = document.getElementById('row-' + msgId);
        if (!el) { showToast('error', '未找到目标消息'); return; }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('msg-highlight');
        setTimeout(function() { el.classList.remove('msg-highlight'); }, 3000);
    }
    window.scrollToMessage = scrollToMessage;

    // --- mermaid 初始化 ---
    if (typeof mermaid !== 'undefined') {
        try {
            mermaid.initialize({
                startOnLoad: false,
                theme: 'dark',
                themeVariables: {
                    primaryColor: '#1a1a2e',
                    primaryTextColor: '#e0e0e0',
                    primaryBorderColor: 'rgba(0, 240, 255, 0.3)',
                    lineColor: 'rgba(0, 240, 255, 0.5)',
                    secondaryColor: '#16213e',
                    tertiaryColor: '#0f3460',
                    background: '#0a0a12',
                    mainBkg: '#1a1a2e',
                    nodeBorder: 'rgba(0, 240, 255, 0.3)',
                    clusterBkg: '#16213e',
                    clusterBorder: 'rgba(0, 240, 255, 0.2)',
                    fontSize: '14px'
                },
                flowchart: { useMaxWidth: true, htmlLabels: true },
                sequence: { useMaxWidth: true },
                gantt: { useMaxWidth: true }
            });
        } catch(e) { console.warn('[mermaid] 初始化失败:', e); }
    }

    // --- marked 自定义渲染器（安全加固 + 增强功能） ---
    var _safeProtocols = { 'http:': 1, 'https:': 1, 'mailto:': 1 };
    var _mdRenderer = new marked.Renderer();
    _mdRenderer.heading = function(t, l) { return '<h'+l+' class="md-h'+l+'">'+t+'</h'+l+'>'; };
    _mdRenderer.blockquote = function(t) { return '<blockquote class="md-blockquote">'+t+'</blockquote>'; };
    _mdRenderer.hr = function() { return '<hr class="md-hr">'; };
    _mdRenderer.code = function(code, lang, escaped) {
        // marked@5.1.2 传入原始文本（escaped=undefined），需自行转义
        var safeCode = escaped ? code : escapeHtml(code);
        // 获取原始文本用于 data-code 和 hljs 高亮
        var rawCode = escaped
            ? code.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#39;/g, "'")
            : code;
        var dataCode = rawCode.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var labelHtml = lang ? '<span class="code-lang-label">'+escapeHtml(lang)+'</span>' : '';
        // 非流式渲染时，在渲染器内直接做语法高亮（避免后处理正则的转义问题）
        var codeHtml = safeCode;
        if (!window._mdIsStreaming && lang !== 'mermaid' && typeof hljs !== 'undefined' && hljs) {
            if (lang && hljs.getLanguage(lang)) {
                try { codeHtml = hljs.highlight(rawCode, { language: lang, ignoreIllegals: true }).value; } catch(e) {}
            } else if (!lang) {
                try { codeHtml = hljs.highlightAuto(rawCode).value; } catch(e) {}
            }
        }
        var lClass = lang === 'mermaid' ? ' class="language-mermaid"' : (lang && hljs && hljs.getLanguage(lang) ? ' class="language-'+lang+'"' : '');
        return '<div class="code-block-wrapper"><pre class="md-code"><code'+lClass+'>'+codeHtml+'</code>'+labelHtml+'</pre><button class="code-copy-btn" data-code="'+dataCode+'" onclick="copyCodeBlock(this)" title="复制代码"><i class="fa-regular fa-copy"></i></button></div>';
    };
    _mdRenderer.codespan = function(t) { return '<code class="md-code-inline">'+t+'</code>'; };
    _mdRenderer.link = function(href, title, text) {
        try { if (!_safeProtocols[new URL(href, location.href).protocol]) href = 'javascript:void(0)'; } catch(e) {}
        var safeHref = escapeHtml(href);
        var tAttr = title ? ' title="'+escapeHtml(title)+'"' : '';
        return '<a href="'+safeHref+'"'+tAttr+' target="_blank" rel="noopener noreferrer">'+text+'</a>';
    };
    _mdRenderer.image = function(href, title, text) {
        var safeHref = escapeHtml(href||''), safeAlt = escapeHtml(text||'');
        return '<span class="img-preview-wrapper"><img src="'+safeHref+'" alt="'+safeAlt+'" data-src="'+safeHref+'" loading="lazy" style="cursor:pointer;max-width:100%;border-radius:8px;margin:10px 0;display:block;" onclick="openImagePreview(this.getAttribute(\'data-src\'))" onerror="this.onerror=null;this.style.display=\'none\';var h=document.createElement(\'div\');h.style.cssText=\'padding:12px;background:var(--input-bg);border-radius:8px;color:var(--text-sub);text-align:center;font-size:13px;margin:8px 0;\';h.innerHTML=\'<i class=\\\'fa-solid fa-image\\\'></i> 图片加载失败\';this.parentNode.replaceChild(h,this);">'+(text?'<span class="img-alt-hint">'+safeAlt+'</span>':'')+'</span>';
    };

    // 自动补全未闭合的代码块（流式输出时 ``` 可能还没收到结束标记）
    function autoCloseCodeBlocks(text) {
        var backtickCount = 0, tildeCount = 0;
        var fenceLang = '';
        var inFence = false;
        var lines = text.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var trimmed = lines[i].trim();
            if (!inFence) {
                var btMatch = trimmed.match(/^(`{3,})(.*)/);
                var tlMatch = trimmed.match(/^(~{3,})(.*)/);
                if (btMatch) {
                    inFence = true; fenceLang = (btMatch[2]||'').trim();
                } else if (tlMatch) {
                    inFence = true; fenceLang = (tlMatch[2]||'').trim();
                }
            } else {
                if (/^`{3,}\s*$/.test(trimmed) || /^~{3,}\s*$/.test(trimmed)) {
                    inFence = false; fenceLang = '';
                }
            }
        }
        if (inFence) return text + '\n```';
        return text;
    }

    function renderMarkdownSafe(text, isStreaming) {
        // CDN 降级：marked 未加载时用简单换行替换
        if (typeof marked === 'undefined') {
            return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
        }

        // 自动补全未闭合的代码块（流式渲染时跳过，避免代码块"补全又打开"闪烁）
        if (!isStreaming) {
            text = autoCloseCodeBlocks(text);
        }

        // 设置全局标记，让渲染器知道是否为流式渲染
        window._mdIsStreaming = !!isStreaming;
        var html = marked.parse(text, {
            breaks: true, gfm: true, headerIds: false, mangle: false,
            renderer: _mdRenderer
        });

        // 对 marked 默认生成但自定义渲染器未覆盖的标签做后处理
        html = html.replace(/<(h[1-3])>(?!.*?class="md-)/g, '<$1 class="md-$1">');
        html = html.replace(/<blockquote(?![\s>]*class)/g, '<blockquote class="md-blockquote"');
        html = html.replace(/<hr\s*\/?>(?!.*?class)/g, '<hr class="md-hr">');

        // 表格：添加横向滚动容器
        html = html.replace(/<table>/g, '<div class="table-wrapper"><table>');
        html = html.replace(/<\/table>/g, '</table></div>');

        // 长单元格展开/折叠（纯文本超过15字符则截断并添加展开按钮）
        html = html.replace(/<td\b([^>]*)>([\s\S]*?)<\/td>/g, function(match, attrs, content) {
            var cleanText = content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
            // 解码 HTML 实体以获取真实文本长度
            var plainText = cleanText.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
            if (plainText.length > 15) {
                var shortText = escapeHtml(plainText.slice(0, 15));
                return '<td'+(attrs ? ' '+attrs : '')+' class="cell-limit"><span class="cell-preview">'+shortText+'</span><span class="cell-full" style="display:none">'+content+'</span> <button class="cell-toggle-btn" onclick="cellToggle(this)">展开 <i class="fa-solid fa-chevron-down"></i></button></td>';
            }
            return match;
        });

        // ___underline___（marked 不原生支持）
        html = html.replace(/___(.+?)___/g, '<u>$1</u>');

        return html;
    }

    function cellToggle(btn) {
        const td = btn.parentElement;
        const preview = td.querySelector('.cell-preview');
        const full = td.querySelector('.cell-full');
        const isExpanded = td.classList.toggle('expanded');
        if (isExpanded) {
            preview.style.display = 'none';
            full.style.display = '';
            btn.innerHTML = '收起 <i class="fa-solid fa-chevron-up"></i>';
        } else {
            preview.style.display = '';
            full.style.display = 'none';
            btn.innerHTML = '展开 <i class="fa-solid fa-chevron-down"></i>';
        }
    }

    // 图片预览放大
    function openImagePreview(src) {
        const overlay = document.getElementById('image-preview-overlay');
        const img = document.getElementById('image-preview-img');
        if (overlay && img) {
            img.src = src;
            overlay.style.display = 'flex';
        }
    }

    function closeImagePreview() {
        const overlay = document.getElementById('image-preview-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    // 建立持久化通知 SSE 连接（独立于 AI 响应 SSE，用于接收系统推送通知）
    function connectNotificationSSE() {
        if (!currentToken) return;

        const url = host + '/api/notification_sse?token=' + encodeURIComponent(currentToken);
        var es = new EventSource(url);

        es.addEventListener('connected', function(e) {
            console.log('[通知SSE] 已连接');
        });

        es.addEventListener('notification', function(e) {
            try {
                var data = JSON.parse(e.data);
                if (data.message) {
                    showNotice(data.message);
                }
            } catch(err) {
                console.error('[通知SSE] 解析错误:', err);
            }
        });

        es.onerror = function() {
            // EventSource 会自动重连，不需要手动处理
        };
    }
