    var currentBackend = 'xcrab';
    localStorage.setItem('wclaw_backend', 'xcrab');

    // ====== 幻觉拦截：检测 AI 是否在10秒内调用工具 ======
    // 从 localStorage 恢复上次的勾选状态
    try {
        window._hallucinationGuard = localStorage.getItem('wclaw_hallucination_guard') === '1';
    } catch (e) { window._hallucinationGuard = false; }
    window._hallucinationGuardTimer = null;
    window._hallucinationGuardCountdown = null;
    window._hallucinationGuardAiMsgId = null;
    window._hallucinationGuardFired = false;
    window._hallucinationGuardDeadline = 0;

    // 切换两个 checkbox 的勾选状态并持久化
    window.toggleHallucinationGuard = function(checked) {
        window._hallucinationGuard = !!checked;
        try { localStorage.setItem('wclaw_hallucination_guard', checked ? '1' : '0'); } catch (e) {}
        var ids = ['hallucination-guard-pc', 'hallucination-guard-mobile'];
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el && el.checked !== checked) el.checked = checked;
            var lab = el && el.closest('.hallucination-guard-label');
            if (lab) {
                if (checked) lab.classList.add('hallucination-guard-active');
                else lab.classList.remove('hallucination-guard-active');
            }
        }
        // 关闭勾选时立刻取消可能存在的计时器
        if (!checked) window._cancelHallucinationGuard();
        if (typeof showAlert === 'function') {
            showAlert(checked ? 'success' : 'info', checked ? '幻觉拦截已开启：AI 响应后 10 秒内未调用工具将自动停止' : '幻觉拦截已关闭');
        }
    };

    // 初始化两个 checkbox 的勾选状态（DOM ready 后）
    function _initHallucinationGuardUi() {
        var ids = ['hallucination-guard-pc', 'hallucination-guard-mobile'];
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (!el) continue;
            el.checked = window._hallucinationGuard;
            var lab = el.closest('.hallucination-guard-label');
            if (lab && window._hallucinationGuard) lab.classList.add('hallucination-guard-active');
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _initHallucinationGuardUi);
    } else {
        _initHallucinationGuardUi();
    }

    // ★★★ v4 修复：严格按需求 —— "只要前端接收到 AI 的消息，就马上开始计时（启动）"
    //               10 秒到点时检查最新消息气泡内是否有 .tool-calls-block 元素：
    //                 · 有工具调用记录 → 取消计时器，不拦截（AI 确实在干活，不算幻觉）
    //                 · 没有工具调用记录 → 触发 stopCommand（疑似 AI 幻觉）
    //               ★ 关键：收到 AI 消息只是"启动"计时器，**启动后不重置**（即使后续
    //                 又收到 stream/stream_reset/tool_call/tool_progress/tool_result 事件），
    //                 只有等 10 秒到点后（且没有工具调用记录）才会拦截。
    //               这样可以确保：
    //                 1) AI 持续输出纯文字（无 tool_call）→ 10 秒到点时气泡内没有 .tool-calls-block → 拦
    //                 2) AI 调了工具但卡住不再发任何东西 → 10 秒到点时气泡内有 .tool-calls-block → 不拦（避免误判）
    //                 3) AI 调了工具后开始输出文字 → 10 秒到点时气泡内已有 .tool-calls-block → 不拦
    function _onAiMessageReceived(msgId) {
        if (!window._hallucinationGuard) return;
        // ★ 如果已经有计时器在跑，不管是不是同一个 msgId，**直接 return**（不重置）
        //  需求原文："只要前端接收到 AI 的消息，就马上开始计时" —— 已经在计时就不需要再启动
        if (window._hallucinationGuardTimer) {
            return;
        }
        // 启动 10 秒计时器（启动后不重置！）
        window._hallucinationGuardAiMsgId = msgId;
        window._hallucinationGuardFired = false;
        window._hallucinationGuardTimer = setTimeout(_hallucinationGuardTick, 10000);
        console.log('[幻觉拦截] 收到 AI 消息，启动 10 秒计时器 msgId=' + msgId);
    }

    // 兼容旧名：tool_call 事件仍会调用 _onHallucinationGuardToolCall
    // （和 _onAiMessageReceived 行为一致 —— 已有计时器就不动，没有就启动）
    function _onHallucinationGuardToolCall() {
        if (!window._hallucinationGuard) return;
        if (window._hallucinationGuardTimer) {
            return;  // 已有计时器在跑，不重置
        }
        _onAiMessageReceived(window._hallucinationGuardAiMsgId);
    }

    // 兼容旧名：很多地方还在调用 _startHallucinationGuard，重定向到 _onAiMessageReceived
    function _startHallucinationGuard(msgId) {
        _onAiMessageReceived(msgId);
    }

    // 10 秒到点：检查最新 AI 消息气泡内是否有 .tool-calls-block 元素
    function _hallucinationGuardTick() {
        if (!window._hallucinationGuard) return;
        if (window._hallucinationGuardFired) return;
        window._hallucinationGuardFired = true;
        window._hallucinationGuardTimer = null;

        // 找到最新的 AI 消息气泡
        var msgId = window._hallucinationGuardAiMsgId;
        var bubble = null;
        if (msgId) {
            var replyId = msgId.startsWith('reply-') ? msgId : 'reply-' + msgId;
            bubble = document.getElementById(replyId);
        }
        // 兜底：取聊天容器内最后一个 [id^="reply-"] 元素
        if (!bubble) {
            var chatBox = document.getElementById('chat-box');
            if (chatBox) {
                var allReplies = chatBox.querySelectorAll('[id^="reply-"]');
                if (allReplies.length > 0) bubble = allReplies[allReplies.length - 1];
            }
        }

        // ★ 核心检查：消息气泡内是否已经有 .tool-calls-block 元素
        var hasToolCall = false;
        if (bubble) {
            if (bubble.querySelector('.tool-calls-block')) {
                hasToolCall = true;
            }
        }

        if (hasToolCall) {
            // 气泡内已有工具调用记录 → AI 确实调用过工具，**不拦截**（不是幻觉）
            console.log('[幻觉拦截] 10 秒到点：消息气泡内已有 .tool-calls-block（AI 调用过工具），不拦截 (msgId=' + msgId + ')');
            // 任务交给后续事件处理（result/done 会取消本轮上下文；下轮 stream/stream_reset 会启动新计时器）
            return;
        }
        // 气泡内没有工具调用记录 → 疑似 AI 幻觉 → 触发停止
        console.warn('[幻觉拦截] 10 秒到点检测：消息气泡内无 .tool-calls-block 工具调用记录，疑似 AI 幻觉，触发停止 (msgId=' + msgId + ')');
        try {
            if (typeof showAlert === 'function') {
                showAlert('error', '检测到ai未调用任何工具，疑似ai幻觉，已中止任务！');
            } else {
                alert('检测到ai未调用任何工具，疑似ai幻觉，已中止任务！');
            }
        } catch (e) {}
        // 调用前端的停止逻辑（传入 true 告诉 stopCommand 这是幻觉拦截触发的，不要再弹"已发送停止指令"覆盖刚才的提示）
        try { stopCommand(true); } catch (e) { console.error('[幻觉拦截] stopCommand 调用失败:', e); }
    }


    // 取消计时器（用于任务结束/出错/手动停止时）
    function _cancelHallucinationGuard() {
        if (window._hallucinationGuardTimer) {
            clearTimeout(window._hallucinationGuardTimer);
            window._hallucinationGuardTimer = null;
        }
        window._hallucinationGuardAiMsgId = null;
        window._hallucinationGuardFired = false;
        window._hallucinationGuardDeadline = 0;
    }
    window._cancelHallucinationGuard = _cancelHallucinationGuard;

    // 标志位：用户是否正在查看内容（点击展开按钮后停止自动滚动）
    var _autoScrollDisabled = false;

    // 页面关闭/刷新前，将正在流式的消息保存到 localStorage
    window.addEventListener('beforeunload', function() {
        if (!sessionExecutionStates) return;
        Object.keys(sessionExecutionStates).forEach(function(sid) {
            const st = sessionExecutionStates[sid];
            if (!st || !st.msgId || !st.accumulatedOutput) return;
            if (!currentUser) return;
            const msgId = st.msgId.startsWith('reply-') ? st.msgId : 'reply-' + st.msgId;
            const key = 'wclaw_history_' + currentUser + '_' + sid;
            try {
                let history = JSON.parse(localStorage.getItem(key) || '[]');
                const idx = history.findIndex(m => m.id === msgId);
                const entry = {
                    id: msgId, role: 'ai',
                    content: st.accumulatedOutput,
                    status: 'streaming',
                    timestamp: Date.now(),
                    backend: st.currentBackend || currentBackend,
                    toolCalls: st._toolCalls || []
                };
                if (idx !== -1) {
                    history[idx].content = st.accumulatedOutput;
                    history[idx].toolCalls = st._toolCalls || [];
                } else {
                    history.push(entry);
                }
                localStorage.setItem(key, JSON.stringify(history));
            } catch(e) {}
        });
    });

    // 会话聊天容器缓存：每个会话一个独立容器，切换时隐藏/显示而非销毁
    var _chatContainers = {};

    // 获取指定会话的聊天容器（不存在则返回 null）
    function _getChatContainer(sessionId) {
        return _chatContainers[sessionId || currentSessionId] || null;
    }

    // 诊断：AndroidSMS 接口检测
    (function() {
        if (typeof window !== 'undefined') {
            var hasSms = !!(window.AndroidSMS && window.AndroidSMS.sendSMS);
            console.log('[SMS-DIAG] app-main.js v4 loaded, AndroidSMS.sendSMS available:', hasSms);
        }
    })();

    // SMS 触发检测：提取 @内容@手机号@SMS_go 格式并调用 Android 短信接口
    function trySendSMS(text) {
        if (typeof window === 'undefined' || !window.AndroidSMS || !window.AndroidSMS.sendSMS) return false;
        if (window._smsSent) return false;  // 第一层：内存去重

        var match = text.match(/@([^\n@]+)@(\+?\d{10,15})@SMS_go/);
        if (match) {
            var phone = match[2];
            var msg = match[1].trim();

            // 第二层：sessionStorage 去重（防止 WebView 页面重载导致 _smsSent 丢失）
            try {
                var dedupKey = 'sms_sent_' + phone + '_' + msg;
                if (sessionStorage.getItem(dedupKey)) {
                    console.log('[SMS] sessionStorage 去重拦截');
                    window._smsSent = true;
                    return false;
                }
                sessionStorage.setItem(dedupKey, '1');
                // 30 秒后自动过期，允许同号码同内容重新发送
                setTimeout(function() { sessionStorage.removeItem(dedupKey); }, 3000);
            } catch(e) {}

            try {
                window.AndroidSMS.sendSMS(phone, msg);
                window._smsSent = true;
                console.log('[SMS] 已发送至', phone);
                return true;
            } catch(e) {
                console.error('[SMS] 发送失败:', e);
            }
        }
        return false;
    }

    if (currentToken && currentUser) {
        showApp();
        connectNotificationSSE();
        fetchInitialExecStatus();
        updateTTSButton();
        updateNotifyButton();
        loadToolInfo();
    }
    var sidebarHidden = false;

    function updateHeaderBackend() {
        // 更新头部标题
        const headerLabel = document.getElementById('header-backend-label');
        if (headerLabel) headerLabel.textContent = 'xCrab';

        // 更新头部图标
        const headerIcon = document.getElementById('header-icon');
        const headerIconXcrab = document.getElementById('header-icon-xcrab');
        if (headerIcon) headerIcon.style.display = 'none';
        if (headerIconXcrab) headerIconXcrab.style.display = 'inline';

        // 更新输入框旁的切换按钮
        const agentLabel = document.querySelector('.btn-toggle-agent .agent-label');
        if (agentLabel) agentLabel.textContent = 'xCrab';

        // 更新下拉菜单里的切换按钮
        const toggleLabel = document.querySelector('.toggle-agent-label');
        if (toggleLabel) toggleLabel.textContent = ' xCrab';
        const dropdownIcon = document.getElementById('dropdown-icon');
        const dropdownIconXcrab = document.getElementById('dropdown-icon-xcrab');
        if (dropdownIcon) dropdownIcon.style.display = 'none';
        if (dropdownIconXcrab) dropdownIconXcrab.style.display = 'inline';
    }

    // 获取并显示当前大模型
    async function fetchCurrentModel() {
        if (!currentToken) return;
        try {
            // 先检查用户是否有启用的自定义模型
            const customRes = await fetch(host + '/api/custom_model', {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const customData = await customRes.json();
            const badge = document.getElementById('current-model-badge');
            const activeModelEl = document.getElementById('current-active-model');
            // 查找已启用的自定义模型
            var enabledCustom = null;
            if (customData.code === 200 && Array.isArray(customData.data)) {
                enabledCustom = customData.data.find(function(item) { return item.enabled; });
            }
            if (enabledCustom) {
                // 用户有启用的自定义模型，显示自定义模型简称 + UD后缀
                const customDisplayMap = { 'deepseek': 'DS', 'minimax': 'MM', 'mimo': 'MIMO' };
                const displayName = customDisplayMap[enabledCustom.provider] || enabledCustom.model_name;
                if (badge) badge.textContent = displayName + '-UD';
                if (activeModelEl) activeModelEl.textContent = '当前: ' + enabledCustom.model_name + ' (自定义)';
                return;
            }
            // 没有自定义模型，显示系统默认模型
            const apiEndpoint = currentBackend === 'xcrab' ? '/api/xcrab/current_model' : '/api/current_model';
            const res = await fetch(host + apiEndpoint, {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200) {
                if (badge) {
                    const displayMap = { 'deepseek-v4-flash[1M]': 'DS', 'MiniMax-M3': 'MM', 'mimo-v2.5-pro[1M]': 'MIMO' };
                    badge.textContent = displayMap[data.data.name] || data.data.name;
                }
                if (activeModelEl) activeModelEl.textContent = '当前: ' + data.data.name;
            }
        } catch (e) {
            console.error('获取当前模型失败:', e);
        }
    }
    if (document.readyState === 'complete') {
        updateHeaderBackend();
    } else {
        window.addEventListener('load', updateHeaderBackend);
    }

    function toggleBackend() {
        showToast('info', '当前仅支持 xCrab 后端');
    }

    // 移动端消息操作按钮下拉菜单切换
    function toggleMsgActions(btn) {
        // 获取下拉菜单引用（首次查找 nextElementSibling，之后缓存）
        let dropdown = btn._dropdown;
        if (!dropdown) {
            dropdown = btn.nextElementSibling;
            if (!dropdown || !dropdown.classList.contains('msg-actions-dropdown')) return;
            btn._dropdown = dropdown;
        }

        // 关闭其他已打开的下拉菜单，将其移回原位
        document.querySelectorAll('.msg-actions-dropdown.open').forEach(d => {
            if (d !== dropdown) {
                d.classList.remove('open');
                if (d._originalParent) { d._originalParent.appendChild(d); d._originalParent = null; }
            }
        });
        document.querySelectorAll('.msg-actions-backdrop').forEach(el => el.remove());

        if (dropdown.classList.contains('open')) {
            dropdown.classList.remove('open');
            if (dropdown._originalParent) { dropdown._originalParent.appendChild(dropdown); dropdown._originalParent = null; }
        } else {
            // 移到 body 以脱离 msg-row 的 animation 层叠上下文
            dropdown._originalParent = dropdown.parentNode;
            document.body.appendChild(dropdown);
            dropdown.classList.add('open');
            // 点击子按钮后自动关闭菜单
            dropdown.addEventListener('click', function handler(e) {
                if (e.target.closest('.msg-action-item')) {
                    dropdown.classList.remove('open');
                    if (dropdown._originalParent) { dropdown._originalParent.appendChild(dropdown); dropdown._originalParent = null; }
                    document.querySelectorAll('.msg-actions-backdrop').forEach(el => el.remove());
                    dropdown.removeEventListener('click', handler);
                }
            });
            // 添加半透明遮罩
            const backdrop = document.createElement('div');
            backdrop.className = 'msg-actions-backdrop';
            backdrop.addEventListener('click', function() {
                dropdown.classList.remove('open');
                if (dropdown._originalParent) { dropdown._originalParent.appendChild(dropdown); dropdown._originalParent = null; }
                backdrop.remove();
            });
            document.body.appendChild(backdrop);
        }
    }

    function toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (window.innerWidth > 768) {
            sidebar.classList.toggle('hidden');
        } else {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('open');
        }
    }

    function closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    }

    function toggleSidebarDesktop() {
        const sidebar = document.getElementById('sidebar');
        const toggleIcon = document.getElementById('sidebar-toggle-icon');
        
        sidebarHidden = !sidebarHidden;
        
        if (sidebarHidden) {
            sidebar.classList.add('hidden');
            toggleIcon.classList.remove('fa-chevron-left');
            toggleIcon.classList.add('fa-chevron-right');
        } else {
            sidebar.classList.remove('hidden');
            toggleIcon.classList.remove('fa-chevron-right');
            toggleIcon.classList.add('fa-chevron-left');
        }
    }

    function loadSessions() {
        if (!currentUser) return;
        const sessionsKey = 'wclaw_sessions_' + currentUser;
        sessions = JSON.parse(localStorage.getItem(sessionsKey) || '[]');
        
        // Migration: check if old history exists
        const oldHistoryKey = 'wclaw_history_' + currentUser;
        const oldHistory = localStorage.getItem(oldHistoryKey);
        if (oldHistory && sessions.length === 0) {
            const defaultSessionId = 'session_default';
            sessions.push({
                id: defaultSessionId,
                title: '默认对话',
                timestamp: Date.now()
            });
            localStorage.setItem('wclaw_history_' + currentUser + '_' + defaultSessionId, oldHistory);
            localStorage.removeItem(oldHistoryKey);
        }
        
        if (sessions.length === 0) {
            createNewSession(true);
        } else {
            currentSessionId = localStorage.getItem('wclaw_current_session_' + currentUser) || sessions[0].id;
            if (!sessions.find(s => s.id === currentSessionId)) {
                currentSessionId = sessions[0].id;
            }
            // 恢复当前会话的平台
            const curSession = sessions.find(s => s.id === currentSessionId);
            if (curSession && curSession.backend) {
                currentBackend = curSession.backend;
                localStorage.setItem('wclaw_backend', currentBackend);
                updateHeaderBackend();
            }
            renderSessionList();
            loadHistory();
            // 根据当前会话的状态设置发送按钮
            updateSendBtnBySessionState();
        }
    }

    function saveSessions() {
        if (!currentUser) return;
        const key = 'wclaw_sessions_' + currentUser;
        localStorage.setItem(key, JSON.stringify(sessions));
        localStorage.setItem('wclaw_current_session_' + currentUser, currentSessionId);
    }

    // 缺陷9：从服务端同步会话列表（多设备场景）
    async function syncSessionsFromServer() {
        if (!currentToken || !currentUser) return;
        try {
            const res = await fetch(host + '/api/xcrab/sessions', {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code !== 200 || !data.data) return;

            const serverSessions = data.data;
            const localIds = new Set(sessions.map(s => s.id));
            let changed = false;

            for (const ss of serverSessions) {
                if (!localIds.has(ss.session_id)) {
                    sessions.push({
                        id: ss.session_id,
                        title: '同步会话',
                        timestamp: ss.last_active,
                        backend: 'xcrab'
                    });
                    changed = true;
                }
            }

            if (changed) {
                saveSessions();
                renderSessionList();
            }
        } catch (e) {
            console.warn('[sync] 会话同步失败:', e.message);
        }
    }

    // 通知服务器和 cclaw 有新会话
    async function notifyNewSession(sessionId, title) {
        if (!currentToken) return;
        try {
            await fetch(host + '/api/new_session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ sessionId, title }),
                signal: AbortSignal.timeout(10000)
            });
        } catch (e) {
            console.error('通知服务器新会话失败:', e);
        }
    }

    function createNewSession(render = true, title = '新对话') {
        const newSession = {
            id: 'session_' + Date.now(),
            title: title,
            timestamp: Date.now(),
            backend: currentBackend
        };
        sessions.unshift(newSession);
        currentSessionId = newSession.id;

        // 初始化新会话的执行状态
        const sessionState = getSessionState(currentSessionId);
        sessionState.isExecuting = false;
        sessionState.msgId = null;

        saveSessions();
        if (render) {
            renderSessionList();
            loadHistory();
            // 根据新会话的状态设置发送按钮
            updateSendBtnBySessionState();
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        }

        // 主动通知服务器和 cclaw 有新会话，提前建立 session 上下文
        notifyNewSession(newSession.id, newSession.title);
    }

    function switchSession(id) {
        if (id === currentSessionId) return;

        const oldSessionId = currentSessionId;

        // 保持旧会话的SSE连接，消息会根据sessionId正确路由
        // 不关闭SSE连接，让AI回复继续接收

        // === 切换前：将旧会话的流式消息刷新到 localStorage ===
        // 流式内容通过 2 秒节流定时器保存，切换时可能尚未触发，
        // 导致切回时消息丢失。此处强制刷新。
        if (oldSessionId && currentUser) {
            const oldState = getSessionState(oldSessionId);
            if (oldState && oldState.isExecuting && oldState.msgId) {
                // 无论 _lsSaveTimer 是否存在，都强制刷新到 localStorage
                if (oldState._lsSaveTimer) {
                    clearTimeout(oldState._lsSaveTimer);
                    oldState._lsSaveTimer = null;
                }
                const accumulated = oldState.accumulatedOutput || '';
                if (accumulated) {
                    const replyMsgId = oldState.msgId.startsWith('reply-') ? oldState.msgId : 'reply-' + oldState.msgId;
                    const key = 'wclaw_history_' + currentUser + '_' + oldSessionId;
                    try {
                        let history = JSON.parse(localStorage.getItem(key) || '[]');
                        let existingIdx = history.findIndex(m => m.id === replyMsgId);
                        if (existingIdx !== -1) {
                            history[existingIdx].content = accumulated;
                            history[existingIdx].status = 'streaming';
                            history[existingIdx].toolCalls = oldState._toolCalls || [];
                        } else {
                            history.push({
                                id: replyMsgId, role: 'ai',
                                content: accumulated,
                                status: 'streaming', timestamp: Date.now(),
                                backend: oldState.currentBackend || currentBackend,
                                toolCalls: oldState._toolCalls || []
                            });
                        }
                        localStorage.setItem(key, JSON.stringify(history));
                    } catch (e) {}
                }
            }
        }

        // 保存当前平台到旧会话
        const oldSession = sessions.find(s => s.id === oldSessionId);
        if (oldSession) {
            oldSession.backend = currentBackend;
        }

        // 切换会话
        currentSessionId = id;

        // 恢复新会话的平台
        const newSession = sessions.find(s => s.id === id);
        if (newSession && newSession.backend) {
            currentBackend = newSession.backend;
            localStorage.setItem('wclaw_backend', currentBackend);
            updateHeaderBackend();
        }

        saveSessions();
        renderSessionList();

        // === 隐藏旧会话容器，显示新会话容器 ===
        // 不销毁 DOM，让后台会话的 SSE 继续更新消息气泡
        const box = document.getElementById('chat-box');
        // 隐藏旧会话容器
        if (oldSessionId && _chatContainers[oldSessionId]) {
            _chatContainers[oldSessionId].style.display = 'none';
        }
        // 显示或创建新会话容器
        if (_chatContainers[id]) {
            _chatContainers[id].style.display = '';
            setTimeout(scrollToBottom, 100);
        } else {
            loadHistory();
        }

        // 根据新会话的状态设置按钮和状态栏
        updateSendBtnBySessionState();

        // 如果是移动端，关闭侧边栏
        if (window.innerWidth <= 768) {
            closeSidebar();
        }
    }

    function deleteSession(event, id) {
        event.stopPropagation();
        if (!confirm('确定删除此对话吗？')) return;

        const session = sessions.find(s => s.id === id);
        sessions = sessions.filter(s => s.id !== id);
        localStorage.removeItem('wclaw_history_' + currentUser + '_' + id);

        // 清除该会话的 DOM 容器
        if (_chatContainers[id]) {
            _chatContainers[id].remove();
            delete _chatContainers[id];
        }

        // 同步删除服务端会话记录（防止刷新后还原）
        if (session && session.backend === 'xcrab' && currentToken) {
            fetch(host + '/api/xcrab/sessions/' + encodeURIComponent(id), {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + currentToken }
            }).catch(e => console.warn('[delete] 服务端会话删除失败:', e.message));
        }

        if (sessions.length === 0) {
            createNewSession(true);
            return;
        } else if (currentSessionId === id) {
            currentSessionId = sessions[0].id;
        }
        saveSessions();
        renderSessionList();
        loadHistory();
        // 根据当前会话的状态设置发送按钮
        updateSendBtnBySessionState();
    }

    function renderSessionList() {
        const listEl = document.getElementById('session-list');
        listEl.innerHTML = sessions.map(s => `
            <div class="session-item ${s.id === currentSessionId ? 'active' : ''}" onclick="onSessionItemClick('${s.id}', event)">
                <input type="checkbox" class="session-batch-checkbox" value="${s.id}" onchange="updateSessionBatchCount()" ${isSessionBatchMode ? '' : 'style="display:none"'}>
                <i class="fa-regular fa-message"></i>
                <div class="session-title">${escapeHtml(s.title)}</div>
                <i class="fa-solid fa-xmark btn-delete-session" onclick="deleteSession(event, '${s.id}')" title="删除"></i>
            </div>
        `).join('');
    }

    function onSessionItemClick(id, event) {
        if (isSessionBatchMode) {
            // 如果直接点的是勾选框，让它自己处理，不重复翻转
            if (event.target && event.target.classList.contains('session-batch-checkbox')) {
                return;
            }
            const cb = event.currentTarget.querySelector('.session-batch-checkbox');
            if (cb) {
                cb.checked = !cb.checked;
                updateSessionBatchCount();
            }
            return;
        }
        switchSession(id);
    }

    function startExecutionTimer(sessionId) {
        const statusBar = document.getElementById('status-bar');
        let timerEl = document.getElementById('status-timer');
        const sessionState = getSessionState(sessionId);

        console.log('[startExecutionTimer] 被调用，sessionId:', sessionId, 'currentSessionId:', currentSessionId);

        // 清理该会话之前的计时器
        if (sessionState.executionTimer) {
            clearInterval(sessionState.executionTimer);
            sessionState.executionTimer = null;
        }

        sessionState.executionSeconds = 0;
        sessionState.executionStartTime = Date.now(); // 记录开始时间

        // 只有当目标会话是当前活动会话时才显示状态栏和重置计时器显示
        if (sessionId === currentSessionId) {
            if (statusBar) {
                const statusTextEl = statusBar.querySelector('.status-text');
                if (statusTextEl) {
                    statusTextEl.innerHTML = `正在执行任务... <span id="status-timer">00:00</span>`;
                    // innerHTML 重新创建了 span，重新获取引用
                    timerEl = document.getElementById('status-timer');
                }
                statusBar.style.display = 'flex';
            }
        }

        // 使用基于时间戳的方式更新计时器，解决后台暂停问题
        function updateTimer() {
            if (!sessionState.executionStartTime) return;

            // 计算经过的秒数（基于实际时间差，即使在后台也能正确计算）
            const elapsed = Math.floor((Date.now() - sessionState.executionStartTime) / 1000);
            sessionState.executionSeconds = elapsed;

            const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const s = String(elapsed % 60).padStart(2, '0');
            // 只在目标会话是当前活动会话时才更新显示
            if (sessionId === currentSessionId && timerEl) {
                timerEl.innerText = `${m}:${s}`;
            }
        }

        // 立即执行一次更新
        updateTimer();

        // 每100ms更新一次计时器（使用时间戳计算，即使后台暂停也能恢复正确时间）
        sessionState.executionTimer = setInterval(updateTimer, 100);
    }
    
    function stopExecutionTimer(sessionId) {
        const statusBar = document.getElementById('status-bar');
        const timerEl = document.getElementById('status-timer');
        const sessionState = getSessionState(sessionId);

        console.log('[stopExecutionTimer] 被调用，sessionId:', sessionId, 'currentSessionId:', currentSessionId);

        if (sessionState.executionTimer) {
            clearInterval(sessionState.executionTimer);
            sessionState.executionTimer = null;
        }

        sessionState.executionStartTime = null; // 清除开始时间

        // 只有当目标会话是当前活动会话，且远程也没有在执行时，才隐藏状态栏
        if (sessionId === currentSessionId && !(currentSessionId in remoteExecutingSessions)) {
            if (statusBar) statusBar.style.display = 'none';
            if (timerEl) timerEl.innerText = '00:00';
        }
    }

    async function stopCommand(fromHallucination) {
        // 幻觉拦截：用户点击停止时取消可能挂起的 10 秒计时器
        try { _cancelHallucinationGuard(); } catch (e) {}
        // 记录本次停止是否由幻觉拦截触发，供 _stopCommandInner 判断是否弹"已发送停止指令"
        window._stopFromHallucination = !!fromHallucination;
        // 防重复点击保护
        if (window._stopCommandRunning) return;
        window._stopCommandRunning = true;
        try {
            await _stopCommandInner();
        } finally {
            window._stopCommandRunning = false;
            window._stopFromHallucination = false;
        }
    }

    async function _stopCommandInner() {
        const sessionState = getSessionState(currentSessionId);
        // 标记为用户主动停止，防止 SSE onerror 覆盖停止消息
        sessionState.stoppedByUser = true;

        if (sessionState.eventSource) {
            sessionState.eventSource.close();
            sessionState.eventSource = null;
        }
        if (sessionState.reconnectTimer) {
            clearTimeout(sessionState.reconnectTimer);
            sessionState.reconnectTimer = null;
        }
        if (sessionState._pollInterval) {
            clearInterval(sessionState._pollInterval);
            sessionState._pollInterval = null;
        }
        // 清理流式渲染状态（RAF + 包装器 + localStorage 节流定时器）
        if (sessionState._streamRaf) { sessionState._streamRaf = false; }
        if (sessionState._lsSaveTimer) { clearTimeout(sessionState._lsSaveTimer); sessionState._lsSaveTimer = null; }
        sessionState.reconnectAttempts = 0;
        // 隐藏工具状态条
        var _toolBar = document.getElementById('xcrab-tool-bar');
        if (_toolBar) { _toolBar.classList.remove('fade-in'); _toolBar.style.display = 'none'; }

        if (sessionState.msgId) {
            // msgId 可能不带 reply- 前缀（startSSE 覆盖导致），确保正确查找
            const replyId = sessionState.msgId.startsWith('reply-') ? sessionState.msgId : 'reply-' + sessionState.msgId;
            const actualId = sessionState.msgId.startsWith('reply-') ? sessionState.msgId.replace('reply-', '') : sessionState.msgId;
            let replyEl = document.getElementById(replyId);
            if (replyEl) {
                replyEl._streamWrapper = null; // 清理流式渲染包装器引用
                // 使用 accumulatedOutput（保留 <think> 标签），而非 innerText（已丢失标签）
                let currentText = (sessionState.accumulatedOutput || replyEl.innerText).replace(/执行中\.*$/, '').replace(/等待接收端响应\.*$/, '').trim();
                // 补全未闭合的 <think> 标签：避免停止时最后一段思考过程未输出 </think>
                const openCnt = (currentText.match(/<think>/g) || []).length;
                const closeCnt = (currentText.match(/<\/think>/g) || []).length;
                if (openCnt > closeCnt) {
                    currentText += '\n</think>';
                }
                // 复位思考块为折叠状态（done 事件会自动复位，但停止时不走 done 事件）
                window.__thinkExpanded = false;
                if (currentText) {
                    updateHistoryResult(actualId, { stdout: currentText + '\n\n[已手动停止]' });
                } else {
                    updateHistoryError(actualId, '[已手动停止]');
                }
            }
            sessionState.msgId = null;
        }

        try {
            const stopEndpoint = currentBackend === 'xcrab' ? '/api/xcrab/stop' : '/api/stop';
            const resp = await fetch(host + stopEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ sessionId: currentSessionId }),
                signal: AbortSignal.timeout(10000)
            });
            const data = await resp.json().catch(() => ({}));
            // 幻觉拦截场景下：_hallucinationGuardTick 已经弹过"检测到ai未调用任何工具..."的提示了，
            // 这里不要再弹"已发送停止指令"覆盖它（无论成功/失败/异常，都不弹）
            if (!window._stopFromHallucination) {
                if (resp.ok) {
                    showAlert('success', data.message || '已发送停止指令');
                } else {
                    showAlert('error', data.message || '停止失败 (' + resp.status + ')');
                }
            } else {
                if (!resp.ok) {
                    console.warn('[幻觉拦截] 停止请求失败 (status=' + resp.status + '):', data.message);
                }
            }
        } catch(e) {
            if (!window._stopFromHallucination) {
                showAlert('error', e.name === 'TimeoutError' ? '停止请求超时' : '停止失败: ' + e.message);
            } else {
                console.warn('[幻觉拦截] 停止请求异常:', e);
            }
        }

        // 标记此会话为用户主动停止，防止远程轮询重新添加
        if (!window._userStoppedSessions) window._userStoppedSessions = new Set();
        window._userStoppedSessions.add(currentSessionId);

        // 清理当前会话的远程执行状态，立即恢复 UI
        if (currentSessionId in remoteExecutingSessions) {
            delete remoteExecutingSessions[currentSessionId];
        }
        // 强制恢复按钮和状态栏
        resetSendBtn();

        // 清除 xCrab 卡顿警告条
        var _stallWarn = document.getElementById('xcrab-stall-warning');
        if (_stallWarn) _stallWarn.remove();
    }

    async function addFavorite(iconEl, msgId, encodedText) {
        const text = decodeURIComponent(encodedText);
        try {
            const res = await fetch(host + '/api/favorites/toggle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ msg_id: msgId, content: text }),
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200) {
                if (data.data.action === 'added') {
                    iconEl.classList.add('active');
                    iconEl.style.color = '#FF9500';
                } else {
                    iconEl.classList.remove('active');
                    iconEl.style.color = '';
                }
            } else if (data.code === 401) {
                logout();
                showAlert('error', '登录已过期，请重新登录');
            } else {
                showAlert('error', data.message || '操作失败');
            }
        } catch(e) {
            showAlert('error', '网络错误');
        }
    }

    async function openFavorites() {
        try {
            const res = await fetch(host + '/api/favorites', {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200) {
                const listEl = document.getElementById('favorites-list');
                if (data.data.length === 0) {
                    listEl.innerHTML = '<div style="color:var(--text-sub);text-align:center;padding:20px;">暂无收藏</div>';
                } else {
                    listEl.innerHTML = data.data.map(item => `
                        <div class="favorite-item" id="fav-item-${item.msg_id}">
                            <div class="favorite-time">
                                <span>${new Date(item.created_at).toLocaleString('zh-CN')}</span>
                                <i class="fa-solid fa-trash btn-unfav" title="取消收藏" onclick="removeFavorite('${item.msg_id}')"></i>
                            </div>
                            <div>${renderMessageContent(item.content)}</div>
                        </div>
                    `).join('');
                }
                document.getElementById('favorites-modal').style.display = 'flex';
            } else if (data.code === 401) {
                logout();
                showAlert('error', '登录已过期，请重新登录');
            }
        } catch (e) {
            showAlert('error', '获取收藏失败');
        }
    }

    async function removeFavorite(msgId) {
        if (!confirm('确定要取消收藏吗？')) return;
        try {
            const res = await fetch(host + '/api/favorites/toggle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ msg_id: msgId, content: '' }),
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200) {
                const el = document.getElementById(`fav-item-${msgId}`);
                if (el) el.remove();

                // 同步取消主界面上的高亮星号
                const starIcon = document.getElementById(`star-${msgId}`);
                if (starIcon) {
                    starIcon.classList.remove('active');
                    starIcon.style.color = '';
                }

                // 检查是否空了
                const listEl = document.getElementById('favorites-list');
                if (listEl.children.length === 0) {
                    listEl.innerHTML = '<div style="color:var(--text-sub);text-align:center;padding:20px;">暂无收藏</div>';
                }
            } else if (data.code === 401) {
                logout();
                showAlert('error', '登录已过期，请重新登录');
            } else {
                showAlert('error', data.message || '取消失败');
            }
        } catch(e) {
            showAlert('error', '网络错误');
        }
    }

    function copyText(iconEl, encodedText) {
        let text = decodeURIComponent(encodedText);
        try {
            const obj = JSON.parse(text);
            if (obj.type === 'image' || obj.type === 'file') {
                let copyContent = '';
                if (obj.text) {
                    copyContent = obj.text + '\n\n';
                }
                copyContent += host + obj.url;
                text = copyContent;
            }
        } catch(e) {}

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                const oldClass = iconEl.className;
                iconEl.className = 'fa-solid fa-check';
                iconEl.style.color = '#34C759';
                setTimeout(() => {
                    iconEl.className = oldClass;
                    iconEl.style.color = '';
                }, 2000);
            }).catch(err => {
                showAlert('error', '复制失败');
            });
        } else {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            textArea.style.top = "-999999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                const oldClass = iconEl.className;
                iconEl.className = 'fa-solid fa-check';
                iconEl.style.color = '#34C759';
                setTimeout(() => {
                    iconEl.className = oldClass;
                    iconEl.style.color = '';
                }, 2000);
            } catch (err) {
                showAlert('error', '复制失败');
            }
            document.body.removeChild(textArea);
        }
    }

    // 分享功能
    function shareMessage(iconEl, encodedText) {
        let text = decodeURIComponent(encodedText);
        try {
            const obj = JSON.parse(text);
            if (obj.type === 'image' || obj.type === 'file') {
                text = host + obj.url;
            }
        } catch(e) {}

        // 优先使用Android原生分享接口
        if (window.AndroidShare && window.AndroidShare.shareText) {
            window.AndroidShare.shareText('分享AI回复', text);
        } else if (navigator.share) {
            // fallback: 使用原生分享API（网页端）
            navigator.share({
                title: '分享AI回复',
                text: text
            }).catch(err => {
                console.error('分享失败:', err);
            });
        } else {
            // fallback: 复制到剪贴板
            navigator.clipboard.writeText(text).then(() => {
                showToast('success', '已复制到剪贴板，请手动分享');
            }).catch(() => {
                showToast('info', '当前浏览器不支持分享');
            });
        }
    }

    // 选中文本后确认复制功能
    var selectionTimeout = null;
    var lastSelectedText = '';
    
    document.addEventListener('selectionchange', function() {
        const selection = window.getSelection();
        const selectedText = selection ? selection.toString().trim() : '';

        // 只处理消息气泡内的文本选择
        if (selection && selection.anchorNode) {
            var bubbleEl = selection.anchorNode.parentElement;
            while (bubbleEl && !bubbleEl.classList.contains("msg-bubble")) {
                bubbleEl = bubbleEl.parentElement;
            }
            if (!bubbleEl) return;
        } else {
            return;
        }

        // 清除之前的定时器
        if (selectionTimeout) {
            clearTimeout(selectionTimeout);
        }

        // 如果有选中的文本且长度合理
        if (selectedText.length > 0 && selectedText.length <= 500) {
            lastSelectedText = selectedText;
            // 2秒后显示确认复制提示（等用户完成选文）
            selectionTimeout = setTimeout(function() {
                // 显示自定义复制确认弹窗（避免使用 confirm() 导致丢失用户手势）
                const displayText = selectedText.length > 100 ? selectedText.substring(0, 100) + '...' : selectedText;
                document.getElementById('copy-preview').innerText = '"' + displayText + '"';
                document.getElementById('copy-modal').style.display = 'flex';
                // 存储待复制文本
                document.getElementById('copy-modal').dataset.text = selectedText;
            }, 1500);
        }
    });

    // 复制弹窗：取消
    function closeCopyModal() {
        document.getElementById('copy-modal').style.display = 'none';
    }

    // 复制弹窗：确认复制
    function confirmCopy() {
        const text = document.getElementById('copy-modal').dataset.text;
        document.getElementById('copy-modal').style.display = 'none';
        if (!text) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                showAlert('success', '复制成功！');
            }).catch(err => {
                console.error('复制失败:', err);
                showAlert('error', '复制失败');
            });
        } else {
            // fallback方法
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            textArea.style.top = "-999999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                showAlert('success', '复制成功！');
            } catch (err) {
                console.error('复制失败:', err);
                showAlert('error', '复制失败');
            }
            document.body.removeChild(textArea);
        }
    }

    // 选中文本后引用
    function quoteSelectedText() {
        const text = document.getElementById('copy-modal').dataset.text;
        document.getElementById('copy-modal').style.display = 'none';
        if (!text) return;

        // 清除已有的引用指示器
        const existingIndicator = document.querySelector('.quote-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        quotedMessage = { msgId: 'selected-' + Date.now(), content: text, role: 'selected' };

        const quoteLabel = '引用文本';
        const quoteIndicator = document.createElement('div');
        quoteIndicator.className = 'quote-indicator';
        quoteIndicator.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px; flex: 1; overflow: hidden;">
                <span class="quote-label">${quoteLabel}:</span>
                <span class="quote-content">${escapeHtml(text.substring(0, 100))}${text.length > 100 ? '...' : ''}</span>
            </div>
            <i class="fa-solid fa-xmark btn-close-quote" title="清除引用" onclick="clearQuote()"></i>
        `;

        const inputArea = document.querySelector('.input-area');
        inputArea.insertBefore(quoteIndicator, inputArea.firstChild);

        document.getElementById('command').focus();
    }

    var quotedMessage = null;

    function clearQuote() {
        quotedMessage = null;
        const existingIndicator = document.querySelector('.quote-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
    }

    function quoteMessage(msgId, encodedContent, role) {
        let content = decodeURIComponent(encodedContent);
        try {
            const obj = JSON.parse(content);
            if (obj.type === 'image') {
                content = '[图片] ' + obj.name;
            } else if (obj.type === 'file') {
                content = '[文件] ' + obj.name + (obj.text ? ' - ' + obj.text : '');
            }
        } catch(e) {}
        
        // 引用时过滤掉思考过程 <think>...】（循环移除，处理嵌套标签）
        var _prevQ;
        do { _prevQ = content; content = content.replace(/<think>[\s\S]*?<\/think>/gi, ''); } while (content !== _prevQ);
        content = content.trim();
        // 引用时去掉末尾的 " Exit"
        if (content.endsWith(' Exit')) {
            content = content.slice(0, -5).trim();
        }
        
        const inputBox = document.getElementById('command');
        
        if (quotedMessage && quotedMessage.msgId === msgId) {
            clearQuote();
            inputBox.focus();
            return;
        }
        
        quotedMessage = { msgId, content, role };
        
        const existingIndicator = document.querySelector('.quote-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        const quoteLabel = role === 'user' ? '引用自己' : '引用 AI';
        const quoteIndicator = document.createElement('div');
        quoteIndicator.className = 'quote-indicator';
        quoteIndicator.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px; flex: 1; overflow: hidden; cursor: pointer;" onclick="scrollToMessage('${msgId}')">
                <span class="quote-label">${quoteLabel}:</span>
                <span class="quote-content">${escapeHtml(content.substring(0, 100))}${content.length > 100 ? '...' : ''}</span>
            </div>
            <i class="fa-solid fa-xmark btn-close-quote" title="清除引用" onclick="clearQuote()"></i>
        `;
        
        const inputArea = document.querySelector('.input-area');
        inputArea.insertBefore(quoteIndicator, inputArea.firstChild);
        
        inputBox.focus();
    }

    async function submitFeedback() {
        const text = document.getElementById('feedback-text').value.trim();
        if (!text) return showAlert('error', '请输入反馈内容');
        
        try {
            const res = await fetch(host + '/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ content: text }),
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200) {
                showAlert('success', '反馈提交成功，感谢您的建议！');
                document.getElementById('feedback-modal').style.display = 'none';
                document.getElementById('feedback-text').value = '';
            } else {
                showAlert('error', data.message || '提交失败');
            }
        } catch (e) {
            showAlert('error', '网络错误，请稍后再试');
        }
    }

    // 全局变量用于存储待发送的文件
    var pendingFile = null;
    var yoloEnabled = true;       // YOLO26检测+大模型回答（默认勾选）
    var minimaxVisionEnabled = false;  // MiniMax 视觉工具（默认不勾选）

    async function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // 文件大小限制判断（前端初步校验）
        const isImage = file.type.startsWith('image/');
        const maxSize = isImage ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
        if (file.size > maxSize) {
            showAlert('error', isImage ? '图片大小不能超过10MB' : '文件大小不能超过50MB');
            event.target.value = '';
            return;
        }

        // 保存待发送的文件
        pendingFile = file;
        
        // 在输入框上方显示文件预览
        let previewArea = document.getElementById('file-preview-area');
        if (!previewArea) {
            previewArea = document.createElement('div');
            previewArea.id = 'file-preview-area';
            previewArea.style.cssText = 'padding: 8px 16px; background: var(--bg); border-top: 1px solid var(--border); display: flex; align-items: center; gap: 10px; flex-wrap: wrap;';
            const inputArea = document.querySelector('.input-area');
            inputArea.parentNode.insertBefore(previewArea, inputArea);
        }
        
        const isImg = file.type.startsWith('image/');
        let previewHtml = '';
        if (isImg) {
            const url = URL.createObjectURL(file);
            previewHtml = `<div style="position: relative; display: inline-block;">
                <img src="${url}" style="height: 60px; border-radius: 6px; border: 1px solid var(--border);">
                <i class="fa-solid fa-circle-xmark" style="position: absolute; top: -6px; right: -6px; color: var(--danger); cursor: pointer; background: white; border-radius: 50%;" onclick="clearPendingFile()"></i>
            </div>`;
        } else {
            previewHtml = `<div style="position: relative; display: inline-flex; align-items: center; gap: 6px; background: var(--card-bg); padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); font-size: 13px;">
                <i class="fa-solid fa-file-lines"></i>
                <span style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(file.name)}</span>
                <i class="fa-solid fa-circle-xmark" style="position: absolute; top: -6px; right: -6px; color: var(--danger); cursor: pointer; background: white; border-radius: 50%;" onclick="clearPendingFile()"></i>
            </div>`;
        }
        
        previewArea.innerHTML = previewHtml;

        // 添加 YOLO26 和 MiniMax 独立开关（仅图片显示该选项）
        if (isImg) {
            var toggleRow = document.getElementById('yolo-toggle-row');
            if (!toggleRow) {
                var toggleDiv = document.createElement('div');
                toggleDiv.id = 'yolo-toggle-row';
                toggleDiv.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:4px;font-size:12px;';
                toggleDiv.innerHTML = [
                    '<label style="cursor:pointer;color:var(--text-sub);display:flex;align-items:center;gap:3px;">',
                    '<input type="checkbox" id="yolo-toggle" checked> YOLO26检测+大模型回答',
                    '</label>',
                    '<label style="cursor:pointer;color:var(--text-sub);display:flex;align-items:center;gap:3px;">',
                    '<input type="checkbox" id="minimax-toggle"> MiniMax 视觉工具',
                    '</label>'
                ].join('');
                previewArea.appendChild(toggleDiv);
                document.getElementById('yolo-toggle').addEventListener('change', function(e) {
                    yoloEnabled = e.target.checked;
                });
                document.getElementById('minimax-toggle').addEventListener('change', function(e) {
                    minimaxVisionEnabled = e.target.checked;
                });
                yoloEnabled = true;
                minimaxVisionEnabled = false;
            }
        } else {
            // 非图片文件，关闭分析选项
            yoloEnabled = false;
            minimaxVisionEnabled = false;
            var toggleRow = document.getElementById('yolo-toggle-row');
            if (toggleRow) toggleRow.remove();
        }

        event.target.value = ''; // 重置 input 方便下次选同一个文件
        
        // 自动聚焦输入框
        document.getElementById('command').focus();
    }

    function clearPendingFile() {
        pendingFile = null;
        const previewArea = document.getElementById('file-preview-area');
        if (previewArea) {
            previewArea.remove();
        }
    }

    function saveToLocalHistory(msg, sessionId) {
        const targetSessionId = sessionId || currentSessionId;
        if (!currentUser || !targetSessionId) return;
        const key = 'wclaw_history_' + currentUser + '_' + targetSessionId;
        let history = JSON.parse(localStorage.getItem(key) || '[]');
        // 防止重复：如果同 id 的消息已存在，则不再次添加
        if (msg.id && history.some(m => m.id === msg.id)) return;
        history.push(msg);
        // Keep last 100 messages to prevent storage overflow
        if (history.length > 100) history = history.slice(history.length - 100);
        localStorage.setItem(key, JSON.stringify(history));

        // 如果是存入当前会话，才更新会话标题和侧边栏
        if (targetSessionId === currentSessionId) {
            const session = sessions.find(s => s.id === currentSessionId);
            if (session && session.title === '新对话' && msg.role === 'user') {
                let contentStr = msg.content;
                try {
                    const obj = JSON.parse(contentStr);
                    if (obj.type === 'image' || obj.type === 'file') {
                        session.title = `[文件] ${obj.name}`;
                    } else {
                        session.title = contentStr.substring(0, 15) + (contentStr.length > 15 ? '...' : '');
                    }
                } catch(e) {
                    session.title = contentStr.substring(0, 15) + (contentStr.length > 15 ? '...' : '');
                }
                saveSessions();
                renderSessionList();
            }
        }
    }

    function updateLocalHistory(msgId, updates) {
        if (!currentUser || !currentSessionId) return;
        const key = 'wclaw_history_' + currentUser + '_' + currentSessionId;
        let history = JSON.parse(localStorage.getItem(key) || '[]');
        const idx = history.findIndex(m => m.id === msgId);
        if (idx > -1) {
            history[idx] = { ...history[idx], ...updates };
            localStorage.setItem(key, JSON.stringify(history));
        }
    }

    function removeLocalHistory(msgIds) {
        if (!currentUser || !currentSessionId) return;
        const key = 'wclaw_history_' + currentUser + '_' + currentSessionId;
        let history = JSON.parse(localStorage.getItem(key) || '[]');
        history = history.filter(m => !msgIds.includes(m.id));
        localStorage.setItem(key, JSON.stringify(history));
    }

    function clearLocalHistory() {
        if (!currentUser || !currentSessionId) return;
        localStorage.removeItem('wclaw_history_' + currentUser + '_' + currentSessionId);
    }

    // ====== 工具调用渲染（全局，供 loadHistory 和 SSE 共用）======
    var TOOL_INFO = {
        get_time:       { c: '基础工具', d: '获取当前日期和时间', icon: '🕐', color: '#4CAF50', alias: '获取时间' },
        calculate:      { c: '基础工具', d: '执行数学计算', icon: '🔢', color: '#4CAF50', alias: '数学计算' },
        weather:        { c: '基础工具', d: '获取城市实时天气', icon: '🌤️', color: '#4CAF50', alias: '天气查询' },
        web_search:     { c: '基础工具', d: '互联网搜索最新信息', icon: '🔍', color: '#2196F3', alias: '网络搜索' },
        web_fetch:      { c: '基础工具', d: '获取任意 URL 的内容', icon: '🌐', color: '#2196F3', alias: '网页获取' },
        read_file:      { c: '文件操作', d: '读取文件内容', icon: '📄', color: '#FF9800', alias: '读取文件' },
        write_file:     { c: '文件操作', d: '创建/覆盖文件', icon: '✏️', color: '#FF9800', alias: '写入文件' },
        append_file:    { c: '文件操作', d: '追加内容到文件', icon: '📝', color: '#FF9800', alias: '追加文件' },
        list_files:     { c: '文件操作', d: '列出目录内容', icon: '📁', color: '#FF9800', alias: '列出文件' },
        run_command:    { c: '文件操作', d: '执行 shell 命令', icon: '💻', color: '#FF9800', alias: '运行命令' },
        remember:       { c: '记忆系统', d: '记住信息（键值对存储）', icon: '🧠', color: '#9C27B0', alias: '记住信息' },
        recall:         { c: '记忆系统', d: '搜索历史记忆', icon: '🔮', color: '#9C27B0', alias: '回忆记忆' },
        forget:         { c: '记忆系统', d: '删除记忆', icon: '🗑️', color: '#9C27B0', alias: '删除记忆' },
        read_skill:     { c: '技能管理', d: '加载技能的完整指令', icon: '📖', color: '#E91E63', alias: '加载技能' },
        search_skills:  { c: '技能管理', d: '从 ClawHub 搜索技能', icon: '🔎', color: '#E91E63', alias: '搜索技能' },
        install_skill:  { c: '技能管理', d: '安装新技能', icon: '📦', color: '#E91E63', alias: '安装技能' },
        uninstall_skill: { c: '技能管理', d: '卸载技能', icon: '📤', color: '#E91E63', alias: '卸载技能' },
        configure_skill: { c: '技能管理', d: '查看/修改技能配置', icon: '⚙️', color: '#E91E63', alias: '配置技能' },
        create_plan:    { c: '高级功能', d: '复杂任务自动拆解多步执行', icon: '📋', color: '#607D8B', alias: '创建计划' },
        render_canvas:  { c: '高级功能', d: '生成图表', icon: '📊', color: '#607D8B', alias: '生成图表' },
        switch_workspace: { c: '高级功能', d: '切换角色/人格', icon: '🔄', color: '#607D8B', alias: '切换角色' },
        list_workspaces: { c: '高级功能', d: '列出所有可用角色', icon: '📋', color: '#607D8B', alias: '列出角色' },
    };

    // 保存静态 TOOL_INFO 作为兜底
    var STATIC_TOOL_INFO = JSON.parse(JSON.stringify(TOOL_INFO));
    var toolInfoLoaded = false;
    var toolInfoRetryCount = 0;
    var toolInfoMaxRetries = 3;

    // 从后端动态加载工具列表（后端返回完整元数据）
    async function loadToolInfo() {
        if (toolInfoLoaded) return; // 避免重复加载
        try {
            const res = await fetch(host + '/api/xcrab/tools', {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200 && Array.isArray(data.data)) {
                // 后端返回的工具列表：直接使用后端返回的完整信息
                data.data.forEach(function(t) {
                    TOOL_INFO[t.name] = {
                        c: t.category || '其他工具',
                        d: t.description || t.name,
                        icon: t.icon || '🔧',
                        color: t.color || '#757575',
                        alias: t.alias || t.name
                    };
                });
                // 检查前端有但后端没有的工具（可能是旧工具或前端独有的）
                Object.keys(STATIC_TOOL_INFO).forEach(function(name) {
                    if (!TOOL_INFO[name]) {
                        TOOL_INFO[name] = STATIC_TOOL_INFO[name];
                    }
                });
                toolInfoLoaded = true;
                toolInfoRetryCount = 0; // 重置重试计数
                console.log('[ToolInfo] 工具列表加载成功，共', Object.keys(TOOL_INFO).length, '个工具');
            }
        } catch(e) {
            toolInfoRetryCount++;
            console.warn('[ToolInfo] 加载工具列表失败 (第' + toolInfoRetryCount + '次)，使用静态数据:', e);
            // 加载失败时，确保静态数据可用
            Object.keys(STATIC_TOOL_INFO).forEach(function(name) {
                if (!TOOL_INFO[name]) {
                    TOOL_INFO[name] = STATIC_TOOL_INFO[name];
                }
            });
            // 如果未超过最大重试次数，延迟后重试
            if (toolInfoRetryCount < toolInfoMaxRetries) {
                setTimeout(function() {
                    console.log('[ToolInfo] 尝试重新加载工具列表...');
                    loadToolInfo();
                }, 3000 * toolInfoRetryCount); // 递增延迟
            } else {
                console.warn('[ToolInfo] 已达最大重试次数(' + toolInfoMaxRetries + '次)，停止重试');
            }
        }
    }

    // 获取工具显示信息（支持 MCP 动态工具）
    function getToolInfo(name) {
        // MCP 工具：mcp__serverName__toolName（优先匹配，避免被 TOOL_INFO 中的原始名覆盖）
        if (name && name.startsWith('mcp__')) {
            var parts = name.split('__');
            if (parts.length >= 3) {
                var serverName = parts[1];
                var toolName = parts.slice(2).join('__').replace(/_/g, ' ');
                var cached = TOOL_INFO[name];
                return {
                    c: 'MCP:' + serverName,
                    d: (cached && cached.d && cached.d !== name) ? cached.d : toolName,
                    icon: '🔌',
                    color: '#00BCD4',
                    alias: toolName
                };
            }
        }
        if (TOOL_INFO[name]) return TOOL_INFO[name];
        return { c: '未知工具', d: name, icon: '❓', color: '#9E9E9E', alias: name };
    }

    function renderToolCallItem(tc) {
        var info = getToolInfo(tc.name);
        var stateClass = tc.success === null ? 'running' : (tc.success ? 'success' : 'error');
        var stateIcon = stateClass === 'running' ? '⏳' : (stateClass === 'success' ? '✅' : '❌');
        var toolIcon = info.icon || '🔧';
        var colorStyle = info.color ? 'color:' + info.color + ';' : '';
        var html = '<div class="tool-call-item ' + stateClass + '" data-tool-idx="' + tc.index + '">';
        html += '<div class="tool-call-header">' + stateIcon + ' <span style="' + colorStyle + '">' + toolIcon + '</span> <b>' + escapeHtml(info.alias || tc.name) + '</b></div>';
        html += '<div class="tool-call-meta" title="' + escapeHtml(info.d) + '">[' + escapeHtml(info.c) + '] ' + escapeHtml(info.d) + '</div>';
        if (tc.argsHtml) {
            html += '<details ontoggle="if(this.open) _autoScrollDisabled=true"><summary>参数</summary><pre>' + tc.argsHtml + '</pre></details>';
        }
        if (tc.result) {
            var displayResult = tc.result;
            if (displayResult.length > 1000) {
                displayResult = displayResult.slice(0, 1000) + '...';
            }
            html += '<details ontoggle="if(this.open) _autoScrollDisabled=true"><summary>结果</summary><pre>' + escapeHtml(displayResult) + '</pre></details>';
        }
        html += '</div>';
        return html;
    }

    function renderToolCallsBlock(tools) {
        if (!tools || tools.length === 0) return '';
        var allDone = true;
        var hasError = false;
        for (var ti = 0; ti < tools.length; ti++) {
            if (tools[ti].success === null) allDone = false;
            if (tools[ti].success === false) hasError = true;
        }
        var stateClass = !allDone ? 'state-running' : (hasError ? 'state-error' : 'state-success');
        var icon = !allDone ? '⏳' : (hasError ? '⚠️' : '🔧');
        var summaryText = !allDone
            ? icon + ' 正在调用 ' + tools.length + ' 个工具...'
            : icon + ' 调用了 ' + tools.length + ' 个工具';
        var expanded = localStorage.getItem('tool_block_expanded') === 'true';
        var html = '<details class="tool-calls-block ' + stateClass + '"' + (expanded ? ' open' : '') + ' ontoggle="localStorage.setItem(\'tool_block_expanded\',this.open); if(this.open) _autoScrollDisabled=true">';
        html += '<summary class="tool-calls-summary"><i class="fa-solid fa-chevron-right"></i> ' + summaryText + '</summary>';
        html += '<div class="tool-calls-list">';
        for (var ti = 0; ti < tools.length; ti++) {
            html += renderToolCallItem(tools[ti]);
        }
        html += '</div></details>';
        return html;
    }

    // 统一生成 AI 消息操作按钮 HTML（适配移动端聚合按钮）
    function buildAiActionsHtml(msgId, safeContent, favClass, favStyle, extraPlayBtnId) {
        const isMobile = window.innerWidth <= 768;
        const playBtnId = extraPlayBtnId || ('play-btn-' + msgId);

        if (isMobile) {
            return `
                <span class="msg-actions-wrapper">
                    <button class="msg-actions-toggle" onclick="toggleMsgActions(this)">
                        <i class="fa-solid fa-ellipsis"></i>
                    </button>
                    <div class="msg-actions-dropdown">
                        <div class="msg-action-item" id="menu-play-${msgId}" onclick="event.stopPropagation(); handlePlayClick('${msgId}', '${safeContent}', document.getElementById('${playBtnId}'))">
                            <i class="fa-solid fa-play"></i> 播放语音
                        </div>
                        <div class="msg-action-item" onclick="quoteMessage('${msgId}', '${safeContent}', 'ai')">
                            <i class="fa-solid fa-quote-left"></i> 引用
                        </div>
                        <div class="msg-action-item" onclick="copyText(this, '${safeContent}')">
                            <i class="fa-regular fa-copy"></i> 复制
                        </div>
                        <div class="msg-action-item ${favClass || ''}" id="star-${msgId}" onclick="addFavorite(this, '${msgId}', '${safeContent}')">
                            <i class="fa-regular fa-star"></i> 收藏
                        </div>
                        <div class="msg-action-item" onclick="regenerateMessage('${msgId}')">
                            <i class="fa-solid fa-rotate-right"></i> 重新生成
                        </div>
                        <div class="msg-action-item" onclick="branchFromMessage('${msgId}')">
                            <i class="fa-solid fa-code-branch"></i> 分支
                        </div>
                        <div class="msg-action-item msg-action-delete" onclick="deleteMessage('${msgId}')">
                            <i class="fa-regular fa-trash-can"></i> 删除
                        </div>
                    </div>
                </span>
            `;
        } else {
            return `
                <img id="${playBtnId}" class="btn-action" src="icon/play.png" title="播放语音" style="cursor:pointer; display:inline;" onclick="handlePlayClick('${msgId}', '${safeContent}', this)">
                <i class="fa-solid fa-quote-left btn-action quote-btn" title="引用" onclick="quoteMessage('${msgId}', '${safeContent}', 'ai')"></i>
                <i class="fa-regular fa-copy btn-action" title="复制" onclick="copyText(this, '${safeContent}')"></i>
                <i id="star-${msgId}" class="fa-regular fa-star btn-action ${favClass || ''}" style="${favStyle || ''}" title="收藏" onclick="addFavorite(this, '${msgId}', '${safeContent}')"></i>
                <i class="fa-regular fa-trash-can btn-action" title="删除" onclick="deleteMessage('${msgId}')"></i>
                <i class="fa-solid fa-rotate-right btn-action" title="重新生成" onclick="regenerateMessage('${msgId}')"></i>
                <i class="fa-solid fa-code-branch btn-action" title="分支" onclick="branchFromMessage('${msgId}')"></i>
            `;
        }
    }

    // 统一生成用户消息操作按钮 HTML（适配移动端聚合按钮）
    function buildUserActionsHtml(msgId, safeContent, favClass, favStyle) {
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            return `
                <span class="msg-actions-wrapper">
                    <button class="msg-actions-toggle" onclick="toggleMsgActions(this)">
                        <i class="fa-solid fa-ellipsis"></i>
                    </button>
                    <div class="msg-actions-dropdown">
                        <div class="msg-action-item" onclick="quoteMessage('${msgId}', '${safeContent}', 'user')">
                            <i class="fa-solid fa-quote-left"></i> 引用
                        </div>
                        <div class="msg-action-item" onclick="copyText(this, '${safeContent}')">
                            <i class="fa-regular fa-copy"></i> 复制
                        </div>
                        <div class="msg-action-item ${favClass || ''}" id="star-${msgId}" onclick="addFavorite(this, '${msgId}', '${safeContent}')">
                            <i class="fa-regular fa-star"></i> 收藏
                        </div>
                        <div class="msg-action-item" onclick="editMessage('${msgId}')">
                            <i class="fa-solid fa-pen-to-square"></i> 编辑
                        </div>
                        <div class="msg-action-item" onclick="branchFromMessage('${msgId}')">
                            <i class="fa-solid fa-code-branch"></i> 分支
                        </div>
                        <div class="msg-action-item msg-action-delete" onclick="deleteMessage('${msgId}')">
                            <i class="fa-regular fa-trash-can"></i> 删除
                        </div>
                    </div>
                </span>
            `;
        } else {
            return `
                <i class="fa-solid fa-quote-left btn-action quote-btn" title="引用" onclick="quoteMessage('${msgId}', '${safeContent}', 'user')"></i>
                <i class="fa-regular fa-copy btn-action" title="复制" onclick="copyText(this, '${safeContent}')"></i>
                <i id="star-${msgId}" class="fa-regular fa-star btn-action ${favClass || ''}" style="${favStyle || ''}" title="收藏" onclick="addFavorite(this, '${msgId}', '${safeContent}')"></i>
                <i class="fa-regular fa-trash-can btn-action" title="删除" onclick="deleteMessage('${msgId}')"></i>
                <i class="fa-solid fa-pen-to-square btn-action" title="编辑" onclick="editMessage('${msgId}')"></i>
                <i class="fa-solid fa-code-branch btn-action" title="分支" onclick="branchFromMessage('${msgId}')"></i>
            `;
        }
    }

    async function loadHistory() {
        if (!currentUser || !currentSessionId) return;
        const key = 'wclaw_history_' + currentUser + '_' + currentSessionId;
        let localHistory = JSON.parse(localStorage.getItem(key) || '[]');

        // Fetch favorites just to mark them in UI
        let favoritesMap = {};
        try {
            const res = await fetch(host + '/api/favorites', {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200) {
                data.data.forEach(f => favoritesMap[f.msg_id] = true);
            }
        } catch (e) {}

        const box = document.getElementById('chat-box');

        // === 创建当前会话的独立容器 ===
        // 如果已有缓存容器（不应走到这里，但防御性处理），先移除
        if (_chatContainers[currentSessionId]) {
            _chatContainers[currentSessionId].remove();
            delete _chatContainers[currentSessionId];
        }
        // 隐藏其他会话容器
        Object.keys(_chatContainers).forEach(function(sid) {
            if (_chatContainers[sid]) _chatContainers[sid].style.display = 'none';
        });
        // 创建新容器
        var sessionContainer = document.createElement('div');
        sessionContainer.id = 'session-chat-' + currentSessionId;
        sessionContainer.className = 'session-chat-container';
        box.appendChild(sessionContainer);
        _chatContainers[currentSessionId] = sessionContainer;

        // sessionContainer.innerHTML = `
        //      <div class="msg-row ai" id="welcome-msg">
        //         <div class="msg-bubble"></div>
        //     </div>`;
        
        localHistory.forEach(msg => {
            const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
            const date = new Date(msg.timestamp).toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-');
            const fullTime = `${date} ${time}`;
            const safeContent = encodeURIComponent(msg.content).replace(/'/g, "%27");
            const isFav = favoritesMap[msg.id] ? true : false;
            const favClass = isFav ? 'active' : '';
            const favStyle = isFav ? 'color: #FF9500;' : '';
            const execTimeDisplay = msg.executionSeconds ? (() => {
                const m = String(Math.floor(msg.executionSeconds / 60)).padStart(2, '0');
                const s = String(msg.executionSeconds % 60).padStart(2, '0');
                return `<span class="exec-time">⏱ ${m}:${s}</span>`;
            })() : '';
            
            const checkboxHtml = `<input type="checkbox" class="batch-checkbox" value="${msg.id}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">`;
            
            if (msg.role === 'user') {
                sessionContainer.insertAdjacentHTML('beforeend', `
                    <div class="msg-row user" id="row-${msg.id}" style="flex-direction: row; align-items: center; justify-content: flex-end; width: 100%;">
                        <div class="msg-wrapper user">
                            <div class="msg-bubble">${renderMessageContent(msg.content, true)}</div>
                            <div class="msg-time">${fullTime} ${buildUserActionsHtml(msg.id, safeContent, favClass, favStyle)}
                            </div>
                        </div>
                        ${checkboxHtml}
                    </div>
                `);
            } else {
                const errorClass = msg.status === 'error' ? 'error' : '';
                const safeContent = encodeURIComponent(msg.content).replace(/'/g, "%27");
                const streamingIndicator = msg.status === 'streaming' ? '<span class="loading-dots"></span>' : '';
                const historyBackend = msg.backend || 'xcrab';
                const historyBadge = historyBackend === 'cron' ? '定时' : 'xCrab';
                // 恢复工具调用折叠块
                const toolCallsHtml = (msg.toolCalls && msg.toolCalls.length > 0) ? renderToolCallsBlock(msg.toolCalls) : '';

                const actionsHtml = buildAiActionsHtml(msg.id, safeContent, favClass, favStyle);

                sessionContainer.insertAdjacentHTML('beforeend', `
                    <div class="msg-row ai ${errorClass}" id="row-${msg.id}" style="flex-direction: row; align-items: center; justify-content: flex-start; width: 100%;">
                        ${checkboxHtml}
                        <div class="msg-wrapper ai">
                            <div class="msg-bubble">${toolCallsHtml}${renderMessageContent(msg.content, false)}${streamingIndicator}</div>
                            <div class="msg-time"><span class="backend-badge ${historyBackend}">${historyBadge}</span>${fullTime} ${execTimeDisplay}
                                ${actionsHtml}
                            </div>
                        </div>
                    </div>
                `);
            }
        });

        setTimeout(scrollToBottom, 100);

        // 渲染历史消息中的 Mermaid 图表
        document.querySelectorAll('.msg-bubble').forEach(function(bubble) {
            renderMermaidBlocks(bubble);
        });
    }

    var isBatchMode = false;

    function toggleBatchDelete() {
        isBatchMode = !isBatchMode;
        const bar = document.getElementById('batch-delete-bar');
        const checkboxes = document.querySelectorAll('.batch-checkbox');
        const btnBatch = document.getElementById('btn-batch-delete');
        
        if (isBatchMode) {
            bar.style.display = 'flex';
            btnBatch.style.background = 'rgba(10, 132, 255, 0.2)';
            checkboxes.forEach(cb => {
                cb.style.display = 'block';
                cb.checked = false;
            });
            updateBatchCount();
        } else {
            bar.style.display = 'none';
            btnBatch.style.background = '';
            checkboxes.forEach(cb => cb.style.display = 'none');
        }
    }

    function updateBatchCount() {
        const count = document.querySelectorAll('.batch-checkbox:checked').length;
        document.getElementById('batch-count').innerText = count;
    }

    function executeBatchDelete() {
        const checked = document.querySelectorAll('.batch-checkbox:checked');
        if (checked.length === 0) {
            return showAlert('error', '请先选择要删除的记录');
        }
        if (confirm('是否删除？')) {
            const idsToDelete = Array.from(checked).map(cb => cb.value);
            removeLocalHistory(idsToDelete);
            idsToDelete.forEach(id => {
                const el = document.getElementById(`row-${id}`);
                if (el) el.remove();
            });
            toggleBatchDelete(); // 退出批量模式
        }
    }

    // ===== 批量删除会话 =====
    function toggleBatchSessionDelete() {
        isSessionBatchMode = !isSessionBatchMode;
        const bar = document.getElementById('batch-session-bar');
        const btnBatch = document.getElementById('btn-batch-session');
        const checkboxes = document.querySelectorAll('.session-batch-checkbox');

        if (isSessionBatchMode) {
            bar.style.display = 'flex';
            btnBatch.style.background = 'rgba(10, 132, 255, 0.2)';
            checkboxes.forEach(cb => {
                cb.style.display = 'block';
                cb.checked = false;
            });
            updateSessionBatchCount();
            var selectAllBtn = document.getElementById('btn-select-all-sessions');
            if (selectAllBtn) selectAllBtn.innerText = '全选';
        } else {
            bar.style.display = 'none';
            btnBatch.style.background = '';
            checkboxes.forEach(cb => cb.style.display = 'none');
        }
    }

    function updateSessionBatchCount() {
        const count = document.querySelectorAll('.session-batch-checkbox:checked').length;
        document.getElementById('session-batch-count').innerText = count;
    }

    function selectAllSessions() {
        const checkboxes = document.querySelectorAll('.session-batch-checkbox');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !allChecked);
        updateSessionBatchCount();
        // 更新全选按钮文字
        document.getElementById('btn-select-all-sessions').innerText = allChecked ? '全选' : '取消全选';
    }

    function executeBatchSessionDelete() {
        const checked = document.querySelectorAll('.session-batch-checkbox:checked');
        if (checked.length === 0) {
            return showAlert('error', '请先选择要删除的会话');
        }
        if (confirm('确定删除选中的 ' + checked.length + ' 个对话吗？\n对应的聊天记录也会一并删除。')) {
            const idsToDelete = Array.from(checked).map(cb => cb.value);

            // 收集需要同步删除的服务端会话
            const serverDeleteIds = [];
            idsToDelete.forEach(id => {
                const session = sessions.find(s => s.id === id);
                if (session && session.backend === 'xcrab') serverDeleteIds.push(id);
                sessions = sessions.filter(s => s.id !== id);
                localStorage.removeItem('wclaw_history_' + currentUser + '_' + id);
                // 清除该会话的 DOM 容器
                if (_chatContainers[id]) {
                    _chatContainers[id].remove();
                    delete _chatContainers[id];
                }
            });

            // 同步删除服务端会话记录（防止刷新后还原）
            if (currentToken && serverDeleteIds.length > 0) {
                serverDeleteIds.forEach(id => {
                    fetch(host + '/api/xcrab/sessions/' + encodeURIComponent(id), {
                        method: 'DELETE',
                        headers: { 'Authorization': 'Bearer ' + currentToken }
                    }).catch(e => console.warn('[batch-delete] 服务端会话删除失败:', e.message));
                });
            }

            if (sessions.length === 0) {
                createNewSession(true);
            } else if (idsToDelete.includes(currentSessionId)) {
                currentSessionId = sessions[0].id;
                loadHistory();
            }
            saveSessions();
            renderSessionList();
            updateSendBtnBySessionState();
            toggleBatchSessionDelete(); // 退出批量模式
        }
    }

    // ===== 记忆管理面板 =====
    var _memoryCache = [];
    var _memoryTab = 'all';
    var _selectedMemoryKeys = new Set();

    async function openMemoryPanel() {
        document.getElementById('memory-modal').style.display = 'flex';
        document.getElementById('memory-search-input').value = '';
        _memoryTab = 'all';
        updateMemoryTabStyle();
        await loadMemories();
    }

    function closeMemoryPanel() {
        document.getElementById('memory-modal').style.display = 'none';
    }

    async function loadMemories(query) {
        const listEl = document.getElementById('memory-list');
        listEl.innerHTML = '<div style="text-align:center;color:var(--text-sub);padding:20px;">加载中...</div>';
        try {
            let url;
            if (query && _memoryTab !== 'recycle') {
                url = host + '/api/xcrab/memories/search?q=' + encodeURIComponent(query) + '&limit=50';
            } else if (_memoryTab === 'recycle') {
                url = host + '/api/xcrab/memories/recycle';
            } else {
                url = host + '/api/xcrab/memories';
            }
            const res = await fetch(url, {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            let items = data.data || [];

            if (_memoryTab === 'recycle') {
                // 回收站前端搜索过滤
                if (query) {
                    const q = query.toLowerCase();
                    items = items.filter(item => {
                        const memories = JSON.parse(item.memories_json || '[]');
                        return memories.some(m =>
                            (m.key && m.key.toLowerCase().includes(q)) ||
                            (m.value && m.value.toLowerCase().includes(q))
                        );
                    });
                }
                renderRecycleBin(items, query);
                return;
            }

            // 按 tab 过滤
            if (_memoryTab !== 'all') {
                items = items.filter(m => m.level === _memoryTab);
            }
            _memoryCache = items;
            renderMemoryList(items, query);
        } catch (e) {
            listEl.innerHTML = '<div style="text-align:center;color:var(--danger);padding:20px;">加载失败: ' + e.message + '</div>';
        }
    }

    function renderMemoryList(items, query) {
        const listEl = document.getElementById('memory-list');
        if (items.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:var(--text-sub);padding:20px;">暂无记忆</div>';
            return;
        }
        _selectedMemoryKeys.clear();
        let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        html += '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-sub);">';
        html += '<input type="checkbox" id="memory-select-all" onchange="toggleSelectAllMemories(this.checked)">';
        html += '<span>全选</span>';
        html += '</label>';
        html += '<div style="display:flex;gap:8px;">';
        html += '<button onclick="batchDeleteMemories()" id="btn-batch-delete" style="background:var(--danger);color:white;border:none;padding:6px 12px;border-radius:var(--radius-sm);cursor:pointer;font-size:12px;display:none;">批量删除 (<span id="selected-count">0</span>)</button>';
        html += '<button onclick="clearAllMemories()" style="background:var(--danger);color:white;border:none;padding:6px 12px;border-radius:var(--radius-sm);cursor:pointer;font-size:12px;">一键清空</button>';
        html += '</div>';
        html += '</div>';
        html += items.map(m => {
            const levelBadge = m.level === 'long' ? '<span style="background:rgba(255,149,0,0.15);color:#FF9500;padding:1px 6px;border-radius:4px;font-size:11px;">长期</span>'
                : m.level === 'short' ? '<span style="background:rgba(142,142,147,0.15);color:#8E8E93;padding:1px 6px;border-radius:4px;font-size:11px;">短期</span>'
                : '<span style="background:rgba(10,132,255,0.15);color:var(--primary);padding:1px 6px;border-radius:4px;font-size:11px;">中期</span>';
            const catBadge = m.category ? `<span style="background:var(--input-bg);padding:1px 6px;border-radius:4px;font-size:11px;color:var(--text-sub);">${m.category}</span>` : '';
            const valuePreview = (m.value || '').length > 80 ? m.value.slice(0, 80) + '...' : (m.value || '');
            const createdTime = m.created_at ? new Date(m.created_at).toLocaleString('zh-CN') : '';
            const keyHtml = query ? highlightText(escapeHtml(m.key), query) : escapeHtml(m.key);
            const valueHtml = query ? highlightText(escapeHtml(valuePreview), query) : escapeHtml(valuePreview);
            return `<div style="padding:10px 12px;border-bottom:1px solid var(--border-light);display:flex;align-items:flex-start;gap:10px;">
                <input type="checkbox" class="memory-checkbox" data-key="${escapeHtml(m.key)}" onchange="toggleMemorySelect('${escapeHtml(m.key)}', this.checked)" style="margin-top:4px;flex-shrink:0;">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:14px;font-weight:500;margin-bottom:4px;word-break:break-all;">${keyHtml}</div>
                    <div style="font-size:13px;color:var(--text-sub);word-break:break-all;">${valueHtml}</div>
                    <div style="margin-top:4px;display:flex;gap:6px;align-items:center;">${levelBadge} ${catBadge}${createdTime ? '<span style="font-size:11px;color:var(--text-sub);margin-left:2px;">' + createdTime + '</span>' : ''}</div>
                </div>
                <div style="display:flex;gap:4px;flex-shrink:0;">
                    <button onclick="editMemory('${escapeHtml(m.key)}')" style="background:none;border:none;color:var(--primary);cursor:pointer;padding:4px;" title="编辑"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteMemoryByKey('${escapeHtml(m.key)}')" style="background:none;border:none;color:var(--danger);cursor:pointer;padding:4px;" title="删除"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>`;
        }).join('');
        listEl.innerHTML = html;
    }

    function highlightText(text, query) {
        if (!query) return text;
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'gi');
        return text.replace(regex, '<mark style="background:rgba(255,214,0,0.3);padding:0 2px;border-radius:2px;">$1</mark>');
    }

    function renderRecycleBin(items, query) {
        const listEl = document.getElementById('memory-list');
        if (items.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:var(--text-sub);padding:20px;">' + (query ? '未找到匹配的记录' : '回收站为空') + '</div>';
            return;
        }
        let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        html += '<span style="font-size:13px;color:var(--text-sub);">' + items.length + ' 条记录</span>';
        html += '<button onclick="clearAllRecycleBin()" style="background:var(--danger);color:white;border:none;padding:6px 12px;border-radius:var(--radius-sm);cursor:pointer;font-size:12px;">全部清空</button>';
        html += '</div>';
        html += items.map(item => {
            const memories = JSON.parse(item.memories_json || '[]');
            const date = new Date(item.decayed_at).toLocaleString('zh-CN');
            const keys = memories.map(m => m.key).join(', ');
            const keysHtml = query ? highlightText(escapeHtml(keys), query) : escapeHtml(keys);
            const valuesPreview = memories.map(m => m.value || '').join(' | ');
            const truncatedValues = valuesPreview.length > 120 ? valuesPreview.slice(0, 120) + '...' : valuesPreview;
            const valuesHtml = truncatedValues ? (query ? highlightText(escapeHtml(truncatedValues), query) : escapeHtml(truncatedValues)) : '';
            return `<div style="padding:10px 12px;border-bottom:1px solid var(--border-light);display:flex;align-items:center;gap:10px;">
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;color:var(--text-sub);">🕐 ${date}</div>
                    <div style="font-size:13px;margin-top:4px;font-weight:500;">${memories.length} 条: ${keysHtml}</div>
                    ${valuesHtml ? '<div style="font-size:12px;color:var(--text-sub);margin-top:2px;word-break:break-all;">' + valuesHtml + '</div>' : ''}
                </div>
                <button onclick="restoreMemory(${item.id})" style="background:var(--primary);color:white;border:none;padding:6px 12px;border-radius:var(--radius-sm);cursor:pointer;font-size:12px;">恢复</button>
                <button onclick="deleteRecycleItem(${item.id})" style="background:var(--danger);color:white;border:none;padding:6px 12px;border-radius:var(--radius-sm);cursor:pointer;font-size:12px;">删除</button>
            </div>`;
        }).join('');
        listEl.innerHTML = html;
    }

    function searchMemories() {
        const q = document.getElementById('memory-search-input').value.trim();
        if (q) {
            loadMemories(q);
        } else {
            loadMemories();
        }
    }

    function switchMemoryTab(tab) {
        _memoryTab = tab;
        updateMemoryTabStyle();
        document.getElementById('memory-search-input').value = '';
        loadMemories();
    }

    function updateMemoryTabStyle() {
        ['all', 'long', 'mid', 'short', 'recycle'].forEach(t => {
            const btn = document.getElementById('mem-tab-' + t);
            if (btn) {
                btn.style.background = t === _memoryTab ? 'var(--primary)' : '';
                btn.style.color = t === _memoryTab ? 'white' : '';
            }
        });
    }

    function openAddMemory() {
        document.getElementById('memory-edit-title').textContent = '添加记忆';
        document.getElementById('memory-edit-original-key').value = '';
        document.getElementById('memory-edit-key').value = '';
        document.getElementById('memory-edit-key').disabled = false;
        document.getElementById('memory-edit-value').value = '';
        document.getElementById('memory-edit-category').value = 'general';
        document.getElementById('memory-edit-level').value = 'mid';
        document.getElementById('memory-edit-modal').style.display = 'flex';
    }

    function editMemory(key) {
        const m = _memoryCache.find(x => x.key === key);
        if (!m) return;
        document.getElementById('memory-edit-title').textContent = '编辑记忆';
        document.getElementById('memory-edit-original-key').value = key;
        document.getElementById('memory-edit-key').value = key;
        document.getElementById('memory-edit-key').disabled = true;
        document.getElementById('memory-edit-value').value = m.value || '';
        document.getElementById('memory-edit-category').value = m.category || 'general';
        document.getElementById('memory-edit-level').value = m.level || 'mid';
        document.getElementById('memory-edit-modal').style.display = 'flex';
    }

    async function saveMemoryEdit() {
        const originalKey = document.getElementById('memory-edit-original-key').value;
        const key = document.getElementById('memory-edit-key').value.trim();
        const value = document.getElementById('memory-edit-value').value.trim();
        const category = document.getElementById('memory-edit-category').value;
        const level = document.getElementById('memory-edit-level').value;

        if (!key || !value) {
            return showAlert('error', 'key 和 value 不能为空');
        }

        // 如果是编辑已有记忆，先删除旧的
        if (originalKey && originalKey !== key) {
            await fetch(host + '/api/xcrab/memories/' + encodeURIComponent(originalKey), {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + currentToken }
            });
        }

        try {
            const res = await fetch(host + '/api/xcrab/memories', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ key, value, category, level })
            });
            const data = await res.json();
            if (data.code === 200) {
                document.getElementById('memory-edit-modal').style.display = 'none';
                showAlert('success', originalKey ? '记忆已更新' : '记忆已添加');
                loadMemories();
            } else {
                showAlert('error', data.reason || data.message || '保存失败');
            }
        } catch (e) {
            showAlert('error', '网络错误: ' + e.message);
        }
    }

    async function deleteMemoryByKey(key) {
        if (!confirm('确定删除记忆 "' + key + '"？')) return;
        try {
            await fetch(host + '/api/xcrab/memories/' + encodeURIComponent(key), {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + currentToken }
            });
            showAlert('success', '已删除');
            loadMemories();
        } catch (e) {
            showAlert('error', '删除失败: ' + e.message);
        }
    }

    async function restoreMemory(logId) {
        try {
            const res = await fetch(host + '/api/xcrab/memories/recycle/' + logId + '/restore', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + currentToken }
            });
            const data = await res.json();
            if (data.code === 200) {
                showAlert('success', '已恢复: ' + data.restored);
                loadMemories();
            } else {
                showAlert('error', data.reason || '恢复失败');
            }
        } catch (e) {
            showAlert('error', '恢复失败: ' + e.message);
        }
    }

    async function deleteRecycleItem(logId) {
        if (!confirm('确定要永久删除这条记录吗？')) return;
        try {
            const res = await fetch(host + '/api/xcrab/memories/recycle/' + logId, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + currentToken }
            });
            const data = await res.json();
            if (data.code === 200) {
                showAlert('success', '已删除');
                loadMemories();
            } else {
                showAlert('error', data.reason || '删除失败');
            }
        } catch (e) {
            showAlert('error', '删除失败: ' + e.message);
        }
    }

    async function clearAllRecycleBin() {
        if (!confirm('确定要清空回收站所有记录吗？此操作不可恢复！')) return;
        try {
            const res = await fetch(host + '/api/xcrab/memories/recycle', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + currentToken }
            });
            const data = await res.json();
            if (data.code === 200) {
                showAlert('success', '回收站已清空');
                loadMemories();
            } else {
                showAlert('error', data.reason || '清空失败');
            }
        } catch (e) {
            showAlert('error', '清空失败: ' + e.message);
        }
    }

    function toggleMemorySelect(key, checked) {
        if (checked) {
            _selectedMemoryKeys.add(key);
        } else {
            _selectedMemoryKeys.delete(key);
        }
        updateBatchDeleteBtn();
    }

    function toggleSelectAllMemories(checked) {
        const checkboxes = document.querySelectorAll('.memory-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = checked;
            const key = cb.dataset.key;
            if (checked) {
                _selectedMemoryKeys.add(key);
            } else {
                _selectedMemoryKeys.delete(key);
            }
        });
        updateBatchDeleteBtn();
    }

    function updateBatchDeleteBtn() {
        const btn = document.getElementById('btn-batch-delete');
        const countEl = document.getElementById('selected-count');
        if (btn && countEl) {
            const count = _selectedMemoryKeys.size;
            countEl.textContent = count;
            btn.style.display = count > 0 ? 'block' : 'none';
        }
    }

    async function batchDeleteMemories() {
        const keys = Array.from(_selectedMemoryKeys);
        if (keys.length === 0) return;
        if (!confirm(`确定要删除选中的 ${keys.length} 条记忆吗？`)) return;
        try {
            const res = await fetch(host + '/api/xcrab/memories/batch-delete', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + currentToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ keys })
            });
            const data = await res.json();
            if (data.code === 200) {
                showAlert('success', data.message || '已删除');
                _selectedMemoryKeys.clear();
                loadMemories();
            } else {
                showAlert('error', data.message || '删除失败');
            }
        } catch (e) {
            showAlert('error', '删除失败: ' + e.message);
        }
    }

    async function clearAllMemories() {
        const levelText = _memoryTab === 'all' ? '所有' : (_memoryTab === 'long' ? '长期' : (_memoryTab === 'mid' ? '中期' : '短期'));
        if (!confirm(`确定要清空${levelText}记忆吗？此操作不可恢复！`)) return;
        try {
            const levelParam = _memoryTab !== 'all' ? `?level=${_memoryTab}` : '';
            const res = await fetch(host + '/api/xcrab/memories' + levelParam, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + currentToken }
            });
            const data = await res.json();
            if (data.code === 200) {
                showAlert('success', data.message || '已清空');
                _selectedMemoryKeys.clear();
                loadMemories();
            } else {
                showAlert('error', data.message || '清空失败');
            }
        } catch (e) {
            showAlert('error', '清空失败: ' + e.message);
        }
    }

    // 使记忆管理函数可被 HTML onclick 调用
    window.openMemoryPanel = openMemoryPanel;
    window.closeMemoryPanel = closeMemoryPanel;
    window.searchMemories = searchMemories;
    window.switchMemoryTab = switchMemoryTab;
    window.openAddMemory = openAddMemory;
    window.saveMemoryEdit = saveMemoryEdit;
    window.editMemory = editMemory;
    window.deleteMemoryByKey = deleteMemoryByKey;
    window.restoreMemory = restoreMemory;
    window.deleteRecycleItem = deleteRecycleItem;
    window.clearAllRecycleBin = clearAllRecycleBin;
    window.toggleMemorySelect = toggleMemorySelect;
    window.toggleSelectAllMemories = toggleSelectAllMemories;
    window.batchDeleteMemories = batchDeleteMemories;
    window.clearAllMemories = clearAllMemories;
    window.syncSessionsFromServer = syncSessionsFromServer;
    window.toggleMsgActions = toggleMsgActions;

    // ========== 提示词管理 ==========
    let _promptsData = { identity: '', soul: '', user: '', heartbeat: '' };
    let _currentPromptTab = 'identity';

    const _promptTabDescs = {
        identity: '定义 AI 的身份（名字、性格、类型）',
        soul: '定义 AI 的核心行为准则和价值观',
        user: '记录用户的个人信息（姓名、偏好等）',
        heartbeat: '定义定期任务和状态跟踪',
    };

    async function openPromptsModal() {
        document.getElementById('prompts-modal').style.display = 'flex';
        _currentPromptTab = 'identity';
        try {
            const res = await fetch(host + '/api/xcrab/workspace/prompts', {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000),
            });
            const data = await res.json();
            if (data.code === 200) {
                _promptsData = data.data;
                renderPromptTab();
            } else {
                showAlert('error', data.message || '加载失败');
            }
        } catch (e) {
            showAlert('error', '网络错误');
        }
    }

    function switchPromptTab(tab) {
        // 保存当前 tab 的编辑内容
        _promptsData[_currentPromptTab] = document.getElementById('prompts-editor').value;
        _currentPromptTab = tab;
        renderPromptTab();
    }

    function renderPromptTab() {
        const tabs = ['identity', 'soul', 'user', 'heartbeat'];
        for (const t of tabs) {
            const btn = document.getElementById('prompt-tab-' + t);
            if (t === _currentPromptTab) {
                btn.className = 'btn-confirm';
            } else {
                btn.className = 'btn-cancel';
            }
        }
        document.getElementById('prompt-tab-desc').textContent = _promptTabDescs[_currentPromptTab] || '';
        document.getElementById('prompts-editor').value = _promptsData[_currentPromptTab] || '';
    }

    async function savePrompts() {
        _promptsData[_currentPromptTab] = document.getElementById('prompts-editor').value;
        try {
            const res = await fetch(host + '/api/xcrab/workspace/prompts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken,
                },
                body: JSON.stringify(_promptsData),
                signal: AbortSignal.timeout(10000),
            });
            const data = await res.json();
            if (data.code === 200) {
                showAlert('success', '提示词已保存');
            } else {
                showAlert('error', data.message || '保存失败');
            }
        } catch (e) {
            showAlert('error', '网络错误');
        }
    }

    function closePromptsModal() {
        document.getElementById('prompts-modal').style.display = 'none';
    }

    window.openPromptsModal = openPromptsModal;
    window.switchPromptTab = switchPromptTab;
    window.savePrompts = savePrompts;
    window.closePromptsModal = closePromptsModal;

    function deleteMessage(msgId) {
        if (confirm('是否删除？')) {
            removeLocalHistory([msgId]);
            const el = document.getElementById(`row-${msgId}`);
            if (el) el.remove();
        }
    }

    function clearAllHistory() {
        if (confirm('是否清空当前聊天记录？')) {
            clearLocalHistory();
            // 清除当前会话的容器
            if (_chatContainers[currentSessionId]) {
                _chatContainers[currentSessionId].innerHTML = `
                    <div class="msg-row ai" id="welcome-msg">
                        <div class="msg-bubble">欢迎来到硅基生命，终端引擎启动中，请输入指令：</div>
                    </div>`;
            }
            // 重置当前会话标题并更新侧边栏
            const session = sessions.find(s => s.id === currentSessionId);
            if (session) {
                session.title = '新对话';
                saveSessions();
                renderSessionList();
            }
        }
    }

    // ====== 消息搜索/高亮 ======
    var _searchResults = [];
    var _searchIndex = -1;

    function toggleSearch() {
        var bar = document.getElementById('search-bar');
        if (bar.style.display === 'none') {
            bar.style.display = 'flex';
            document.getElementById('search-input').focus();
        } else {
            clearSearch();
        }
    }

    function performSearch(query) {
        clearHighlights();
        _searchResults = [];
        _searchIndex = -1;
        document.getElementById('search-count').textContent = '';
        if (!query || query.trim().length < 1) return;

        var q = query.trim().toLowerCase();
        var rows = document.querySelectorAll('#chat-box .msg-row');
        rows.forEach(function(row) {
            var bubble = row.querySelector('.msg-bubble');
            if (!bubble) return;
            var text = bubble.textContent || '';
            if (text.toLowerCase().indexOf(q) !== -1) {
                _searchResults.push(row.id);
                highlightInElement(bubble, q);
            }
        });

        if (_searchResults.length > 0) {
            _searchIndex = 0;
            updateSearchIndicator();
            scrollToSearchResult();
        } else {
            document.getElementById('search-count').textContent = '无结果';
        }
    }

    function highlightInElement(element, query) {
        var walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);

        nodes.forEach(function(node) {
            var lower = node.nodeValue.toLowerCase();
            var idx = lower.indexOf(query);
            if (idx === -1) return;

            var frag = document.createDocumentFragment();
            var lastIdx = 0;
            while (idx !== -1) {
                if (idx > lastIdx) frag.appendChild(document.createTextNode(node.nodeValue.slice(lastIdx, idx)));
                var mark = document.createElement('mark');
                mark.className = 'search-highlight';
                mark.textContent = node.nodeValue.slice(idx, idx + query.length);
                frag.appendChild(mark);
                lastIdx = idx + query.length;
                idx = lower.indexOf(query, lastIdx);
            }
            if (lastIdx < node.nodeValue.length) frag.appendChild(document.createTextNode(node.nodeValue.slice(lastIdx)));
            node.parentNode.replaceChild(frag, node);
        });
    }

    function clearHighlights() {
        document.querySelectorAll('mark.search-highlight').forEach(function(mark) {
            var parent = mark.parentNode;
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        });
    }

    function navigateSearchResult(direction) {
        if (_searchResults.length === 0) return;
        // 移除当前高亮激活状态
        if (_searchIndex >= 0 && _searchIndex < _searchResults.length) {
            var prev = document.getElementById(_searchResults[_searchIndex]);
            if (prev) prev.classList.remove('search-active');
        }
        _searchIndex = (_searchIndex + direction + _searchResults.length) % _searchResults.length;
        updateSearchIndicator();
        scrollToSearchResult();
    }

    function updateSearchIndicator() {
        document.getElementById('search-count').textContent = (_searchIndex + 1) + '/' + _searchResults.length;
    }

    function scrollToSearchResult() {
        if (_searchIndex < 0 || _searchIndex >= _searchResults.length) return;
        var el = document.getElementById(_searchResults[_searchIndex]);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('search-active');
        }
    }

    function clearSearch() {
        clearHighlights();
        _searchResults = [];
        _searchIndex = -1;
        document.getElementById('search-input').value = '';
        document.getElementById('search-count').textContent = '';
        document.getElementById('search-bar').style.display = 'none';
        document.querySelectorAll('.msg-row.search-active').forEach(function(el) {
            el.classList.remove('search-active');
        });
    }
    window.toggleSearch = toggleSearch;
    window.performSearch = performSearch;
    window.navigateSearchResult = navigateSearchResult;
    window.clearSearch = clearSearch;

    // ====== 消息重新生成 ======
    function regenerateMessage(aiMsgId) {
        var key = 'wclaw_history_' + currentUser + '_' + currentSessionId;
        var history = JSON.parse(localStorage.getItem(key) || '[]');
        var aiIdx = history.findIndex(function(m) { return m.id === aiMsgId; });
        if (aiIdx === -1) return;

        // 向前找最近的用户消息
        var userIdx = -1;
        for (var i = aiIdx - 1; i >= 0; i--) {
            if (history[i].role === 'user') { userIdx = i; break; }
        }
        if (userIdx === -1) { showToast('error', '未找到对应的用户消息'); return; }

        var userMsg = history[userIdx];
        var userContent = userMsg.content;
        // 解析 text_with_quote 获取原始文本
        try {
            var obj = JSON.parse(userContent);
            if (obj.type === 'text_with_quote') userContent = obj.text;
        } catch(e) {}

        // 删除 AI 消息
        removeLocalHistory([aiMsgId]);
        var aiEl = document.getElementById('row-' + aiMsgId);
        if (aiEl) aiEl.remove();

        // 切换主发送按钮为停止按钮（修复编辑重发后浮动按钮状态不同步的 bug）
        var _sendBtn = document.getElementById('send-btn');
        var _stopBtn = document.getElementById('stop-btn');
        if (_sendBtn && _stopBtn) {
            _sendBtn.disabled = true;
            _sendBtn.style.display = 'none';
            _stopBtn.style.display = 'flex';
        }
        // 标记会话进入执行状态（让执行计时和工具栏状态正确启动，与 sendCommand() 一致）
        var _sessionState = getSessionState(currentSessionId);
        if (window._userStoppedSessions) window._userStoppedSessions.delete(currentSessionId);
        _sessionState.isExecuting = true;
        if (typeof updateRemoteToolbarStatus === 'function') updateRemoteToolbarStatus(true);

// 重新发送
        sendTextCommand(userContent);
    }
    window.regenerateMessage = regenerateMessage;

    // ====== 消息编辑重发 ======
    function editMessage(msgId) {
        var row = document.getElementById('row-' + msgId);
        if (!row) return;
        var bubble = row.querySelector('.msg-bubble');
        if (!bubble) return;

        // 读取原始内容
        var key = 'wclaw_history_' + currentUser + '_' + currentSessionId;
        var history = JSON.parse(localStorage.getItem(key) || '[]');
        var msg = history.find(function(m) { return m.id === msgId; });
        if (!msg) return;
        var originalText = msg.content;
        try {
            var obj = JSON.parse(originalText);
            if (obj.type === 'text_with_quote') originalText = obj.text;
        } catch(e) {}

        // 移动端：复用 mobile-input 弹窗，体验与点击输入框一致
        if (isMobile()) {
            _editingMsgId = msgId;
            var cmdInput = document.getElementById('command');
            if (cmdInput) cmdInput.value = originalText;
            showMobileInput();
            return;
        }

        // 桌面端：原地编辑（保留原行为）
        // 替换 bubble 为 textarea
        var textarea = document.createElement('textarea');
        textarea.className = 'edit-textarea';
        textarea.value = originalText;
        textarea.rows = Math.min(Math.max(originalText.split('\n').length, 2), 8);
        bubble.style.display = 'none';
        bubble.parentNode.insertBefore(textarea, bubble.nextSibling);

        // 替换操作栏
        var timeRow = row.querySelector('.msg-time');
        if (timeRow) timeRow.style.display = 'none';
        var editBar = document.createElement('div');
        editBar.className = 'edit-bar';
        editBar.innerHTML = '<button class="btn-edit-confirm" onclick="confirmEdit(\'' + msgId + '\')"><i class="fa-solid fa-check"></i> 发送</button>' +
            '<button class="btn-edit-cancel" onclick="cancelEdit(\'' + msgId + '\')"><i class="fa-solid fa-xmark"></i> 取消</button>';
        bubble.parentNode.appendChild(editBar);

        textarea.focus();
        textarea.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') cancelEdit(msgId);
            if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); confirmEdit(msgId); }
        });
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });
    }
    window.editMessage = editMessage;

    function cancelEdit(msgId) {
        var row = document.getElementById('row-' + msgId);
        if (!row) return;
        var bubble = row.querySelector('.msg-bubble');
        if (bubble) bubble.style.display = '';
        var textarea = row.querySelector('.edit-textarea');
        if (textarea) textarea.remove();
        var editBar = row.querySelector('.edit-bar');
        if (editBar) editBar.remove();
        var timeRow = row.querySelector('.msg-time');
        if (timeRow) timeRow.style.display = '';
    }
    window.cancelEdit = cancelEdit;

    function confirmEdit(msgId, providedText) {
        var row = document.getElementById('row-' + msgId);
        if (!row) return;
        var newText;
        if (typeof providedText === 'string') {
            // 移动端走 mobile-input 弹窗流程，文本从弹窗传入
            newText = providedText.trim();
        } else {
            // 桌面端原地编辑流程，从 DOM textarea 读取
            var textarea = row.querySelector('.edit-textarea');
            if (!textarea) return;
            newText = textarea.value.trim();
        }
        if (!newText) { showToast('error', '消息不能为空'); return; }

        // 删除该消息及之后的所有消息（DOM 和 localStorage）
        var key = 'wclaw_history_' + currentUser + '_' + currentSessionId;
        var history = JSON.parse(localStorage.getItem(key) || '[]');
        var msgIdx = history.findIndex(function(m) { return m.id === msgId; });

        var idsToDelete = [];
        if (msgIdx !== -1) {
            for (var i = msgIdx; i < history.length; i++) {
                idsToDelete.push(history[i].id);
            }
        }
        if (idsToDelete.length > 0) {
            removeLocalHistory(idsToDelete);
            idsToDelete.forEach(function(id) {
                var el = document.getElementById('row-' + id);
                if (el) el.remove();
            });
        }

        // 切换主发送按钮为停止按钮（修复编辑重发后浮动按钮状态不同步的 bug）
        var _sendBtn = document.getElementById('send-btn');
        var _stopBtn = document.getElementById('stop-btn');
        if (_sendBtn && _stopBtn) {
            _sendBtn.disabled = true;
            _sendBtn.style.display = 'none';
            _stopBtn.style.display = 'flex';
        }
        // 标记会话进入执行状态（让执行计时和工具栏状态正确启动，与 sendCommand() 一致）
        var _sessionState = getSessionState(currentSessionId);
        if (window._userStoppedSessions) window._userStoppedSessions.delete(currentSessionId);
        _sessionState.isExecuting = true;
        if (typeof updateRemoteToolbarStatus === 'function') updateRemoteToolbarStatus(true);

// 重新发送（sendTextCommand 会创建新的消息 DOM 和 localStorage 记录）
        sendTextCommand(newText);
    }
    window.confirmEdit = confirmEdit;

    // ====== 消息分叉/分支 ======
    function branchFromMessage(msgId) {
        var key = 'wclaw_history_' + currentUser + '_' + currentSessionId;
        var history = JSON.parse(localStorage.getItem(key) || '[]');
        var msgIdx = history.findIndex(function(m) { return m.id === msgId; });
        if (msgIdx === -1) { showToast('error', '未找到消息'); return; }

        // 获取被分支消息的内容
        var branchMsg = history[msgIdx];
        var branchContent = (branchMsg.content || '').replace(/\s+/g, ' ').trim();

        // 基于分支点消息内容生成会话标题（按 codePoint 截取，避免切到代理对）
        var codePoints = Array.from(branchContent);
        var snippet = codePoints.slice(0, 20).join('');
        var branchTitle = snippet
            ? '分支自：' + snippet + (codePoints.length > 20 ? '…' : '')
            : '新对话';

        // 创建新会话（带分支标题，会同步通知到服务端）
        createNewSession(true, branchTitle);

        // 设置引用状态（不复制消息到新会话历史）
        var role = branchMsg.role || 'user';
        quotedMessage = { msgId: msgId, content: branchContent, role: role };

        // 创建引用指示器
        var existingIndicator = document.querySelector('.quote-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        var quoteLabel = role === 'user' ? '引用自己' : '引用 AI';
        var quoteIndicator = document.createElement('div');
        quoteIndicator.className = 'quote-indicator';
        quoteIndicator.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px; flex: 1; overflow: hidden;">
                <span class="quote-label">${quoteLabel}:</span>
                <span class="quote-content">${escapeHtml(branchContent.substring(0, 100))}${branchContent.length > 100 ? '...' : ''}</span>
            </div>
            <i class="fa-solid fa-xmark btn-close-quote" title="清除引用" onclick="clearQuote()"></i>
        `;
        var inputArea = document.querySelector('.input-area');
        inputArea.insertBefore(quoteIndicator, inputArea.firstChild);

        showToast('success', '已创建分支会话');
        document.getElementById('command').focus();
    }
    window.branchFromMessage = branchFromMessage;

    function logout() {
        // 清理所有会话的执行状态
        Object.keys(sessionExecutionStates).forEach(sessionId => {
            cleanupSessionState(sessionId);
        });
        sessionExecutionStates = {};
        
        if (executionTimer) {
            clearInterval(executionTimer);
            executionTimer = null;
        }
        heartbeatFailures = 0;
        hideNotice();

        localStorage.removeItem('wclaw_token');
        localStorage.removeItem('wclaw_user');
        currentToken = null;
        currentUser = null;
        currentSessionId = null;
        sessions = [];
        document.getElementById('login-area').style.display = 'flex';
        document.getElementById('app-area').style.display = 'none';
        document.getElementById('connection-error-banner').style.display = 'none';
        
        document.getElementById('chat-box').innerHTML = `
            <div class="msg-row ai">
                <div class="msg-bubble">欢迎来到硅基生命，终端引擎启动中，请输入指令：</div>
            </div>`;
        _chatContainers = {};
    }

    function handleKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const cmdInput = document.getElementById('command');
            if (cmdInput.value.trim()) {
                sendCommand();
            }
        }
    }

    function autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }

    function organizeMsgTime() {
        if (window.innerWidth > 768) return;
        document.querySelectorAll('.msg-time').forEach(function(el) {
            if (el.querySelector('.msg-actions') || el.querySelector('.msg-actions-wrapper')) return;
            var timeWrapper = document.createElement('span');
            timeWrapper.className = 'msg-time-text';
            var actionWrapper = document.createElement('span');
            actionWrapper.className = 'msg-actions';
            var nodes = Array.from(el.childNodes);
            nodes.forEach(function(node) {
                if (node.nodeType === 1 && node.classList.contains('btn-action')) {
                    actionWrapper.appendChild(node);
                } else {
                    timeWrapper.appendChild(node);
                }
            });
            if (timeWrapper.childNodes.length > 0) el.appendChild(timeWrapper);
            if (actionWrapper.childNodes.length > 0) el.appendChild(actionWrapper);
        });
    }

    function scrollToBottom() {
        const chatBox = document.getElementById('chat-box');
        chatBox.scrollTop = chatBox.scrollHeight;
        organizeMsgTime();
    }

    function scrollToTop() {
        const chatBox = document.getElementById('chat-box');
        chatBox.scrollTop = 0;
    }

    // 滚动按钮显示/隐藏控制
    function setupScrollButtons() {
        const chatBox = document.getElementById('chat-box');
        const scrollBtns = document.getElementById('scroll-buttons');
        if (!chatBox || !scrollBtns) return;

        function updateScrollButtons() {
            const isNearTop = chatBox.scrollTop < 50;
            const isNearBottom = chatBox.scrollTop + chatBox.clientHeight >= chatBox.scrollHeight - 50;
            const hasScroll = chatBox.scrollHeight > chatBox.clientHeight;

            if (hasScroll) {
                scrollBtns.style.display = 'flex';
                const btnTop = scrollBtns.querySelector('button:last-child');
                const btnBottom = scrollBtns.querySelector('button:first-child');
                btnTop.style.opacity = isNearTop ? '0.3' : '1';
                btnTop.style.pointerEvents = isNearTop ? 'none' : 'auto';
                btnBottom.style.opacity = isNearBottom ? '0.3' : '1';
                btnBottom.style.pointerEvents = isNearBottom ? 'none' : 'auto';
            } else {
                scrollBtns.style.display = 'none';
            }
        }

        chatBox.addEventListener('scroll', function() {
            updateScrollButtons();
            // 当用户手动滚动回底部时，恢复自动滚动
            var isNearBottom = chatBox.scrollTop + chatBox.clientHeight >= chatBox.scrollHeight - 100;
            if (isNearBottom) {
                _autoScrollDisabled = false;
            }
        });
        updateScrollButtons();
    }

    // 滚动按钮长按切换左右侧
    function setupJumpScrollButtons() {
        const container = document.getElementById('scroll-buttons');
        if (!container) return;

        // 加载保存的位置
        const saved = localStorage.getItem('scrollBtnPos');
        if (saved) {
            try {
                const pos = JSON.parse(saved);
                if (pos.side === 'left') {
                    container.style.left = pos.left || '16px';
                    container.style.right = 'auto';
                } else {
                    container.style.right = pos.right || '16px';
                    container.style.left = 'auto';
                }
                container.style.bottom = pos.bottom || '180px';
            } catch (e) {}
        }

        let timer = null;

        function onPointerDown(e) {
            timer = setTimeout(() => {
                const isOnLeft = container.style.left && container.style.left !== 'auto' && container.style.left !== '';
                if (isOnLeft) {
                    // 跳到右侧
                    container.style.right = '16px';
                    container.style.left = 'auto';
                } else {
                    // 跳到左侧
                    container.style.left = '16px';
                    container.style.right = 'auto';
                }
                // 保存位置
                const pos = {
                    bottom: container.style.bottom || '180px',
                    side: isOnLeft ? 'right' : 'left'
                };
                if (pos.side === 'left') {
                    pos.left = container.style.left;
                } else {
                    pos.right = container.style.right;
                }
                localStorage.setItem('scrollBtnPos', JSON.stringify(pos));
                // 阻止长按后按钮的 onclick 触发
                const prevent = (ce) => {
                    ce.stopPropagation();
                    ce.preventDefault();
                    container.removeEventListener('click', prevent, true);
                };
                container.addEventListener('click', prevent, true);
                e.preventDefault();
            }, 300);
        }

        function onPointerMove(e) {
            if (!timer) return;
            clearTimeout(timer);
            timer = null;
        }

        function onPointerUp() {
            clearTimeout(timer);
            timer = null;
        }

        container.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
    }

    // 页面加载时初始化滚动按钮
    (function() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                setTimeout(setupScrollButtons, 500);
                setTimeout(setupJumpScrollButtons, 500);
            });
        } else {
            setTimeout(setupScrollButtons, 500);
            setTimeout(setupJumpScrollButtons, 500);
        }
    })();

    function resetSendBtn(sessionId) {
        const targetSessionId = sessionId || currentSessionId;
        const sessionState = getSessionState(targetSessionId);
        console.log(`[DEBUG resetSendBtn] sessionId: ${sessionId}, targetSessionId: ${targetSessionId}, isExecuting: ${sessionState.isExecuting}, hasEventSource: ${!!sessionState.eventSource}, msgId: ${sessionState.msgId}, new Error().stack`);

        sessionState.isExecuting = false;

        if (targetSessionId === currentSessionId) {
            // 如果远程还在执行当前会话，保持执行状态的 UI
            if (targetSessionId in remoteExecutingSessions) {
                updateSendBtnBySessionState();
                stopExecutionTimer(targetSessionId);
                return;
            }

            const btn = document.getElementById('send-btn');
            const stopBtn = document.getElementById('stop-btn');
            btn.disabled = false;
            btn.style.display = 'flex';
            stopBtn.style.display = 'none';
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        }
        
        stopExecutionTimer(targetSessionId);
    }

    // 根据当前会话状态设置按钮状态（同时考虑本地执行和远程执行）
    function updateSendBtnBySessionState() {
        const sessionState = getSessionState(currentSessionId);
        const btn = document.getElementById('send-btn');
        const stopBtn = document.getElementById('stop-btn');
        const statusBar = document.getElementById('status-bar');
        const timerEl = document.getElementById('status-timer');

        // 检查当前会话是否在远程执行列表中
        const isThisSessionRemote =
            currentSessionId in remoteExecutingSessions &&
            remoteExecutingSessions[currentSessionId] &&
            remoteExecutingSessions[currentSessionId].since;

        const isExecuting = sessionState.isExecuting || !!isThisSessionRemote;

        if (isExecuting) {
            btn.disabled = true;
            btn.style.display = 'none';
            stopBtn.style.display = 'flex';
            if (statusBar) statusBar.style.display = 'flex';

            if (sessionState.isExecuting) {
                // 本地执行：使用会话自己的计时
                const m = String(Math.floor(sessionState.executionSeconds / 60)).padStart(2, '0');
                const s = String(sessionState.executionSeconds % 60).padStart(2, '0');
                if (timerEl) timerEl.innerText = `${m}:${s}`;
            } else if (isThisSessionRemote) {
                // 远程执行：使用本地记录的 since 时间计算
                const elapsed = Math.floor((Date.now() - remoteExecutingSessions[currentSessionId].since) / 1000);
                const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
                const s = String(elapsed % 60).padStart(2, '0');
                if (timerEl) timerEl.innerText = `${m}:${s}`;
            }
        } else {
            btn.disabled = false;
            btn.style.display = 'flex';
            stopBtn.style.display = 'none';
            stopExecutionTimer(currentSessionId);
        }
    }

    // 更新顶部工具栏的"执行中/空闲"状态（已移除）
    function updateRemoteToolbarStatus(executing) {
        // no-op
    }

    async function sendCommand() {
        const cmdInput = document.getElementById('command');
        const cmd = cmdInput.value.trim();
        window._smsSent = false;  // 重置 SMS 防重复标记

        // 检测 SMS 触发标记 (内容@手机号@SMS_go)，手动输入也会触发发送
        trySendSMS(cmd);

        // 处理 /new 命令：开启新话题（不携带任何历史记录）
        if (cmd === '/new') {
            createNewSession();
            cmdInput.value = '';
            cmdInput.style.height = 'auto';
            return;
        }

        // 如果没有输入文字，且没有待发送文件，则返回
        if (!cmd && !pendingFile) return;

        const btn = document.getElementById('send-btn');
        const stopBtn = document.getElementById('stop-btn');
        if (btn.disabled) return;

        // 设置当前会话的执行状态（清除之前的停止标记，使远程轮询正常工作）
        const sessionState = getSessionState(currentSessionId);
        if (window._userStoppedSessions) window._userStoppedSessions.delete(currentSessionId);
        sessionState.isExecuting = true;
        // 清除之前的工具状态条
        var _toolBar = document.getElementById('xcrab-tool-bar');
        if (_toolBar) { _toolBar.classList.remove('fade-in'); _toolBar.style.display = 'none'; }
        // 立即更新工具栏状态，不依赖 SSE 通知
        updateRemoteToolbarStatus(true);
        
        btn.disabled = true;
        btn.style.display = 'none';
        stopBtn.style.display = 'flex';
        
        // 如果有文件，走上传加文字接口；如果只有文字，走纯文字接口
        if (pendingFile) {
            await sendFileWithCommand(cmd);
        } else {
            await sendTextCommand(cmd);
        }
    }

    async function sendTextCommand(cmd) {
        const cmdInput = document.getElementById('command');
        const msgId = 'msg-' + Date.now();
        
        // 保存当前的 sessionId，防止切换会话时消息路由错误
        const activeSessionId = currentSessionId;
        console.log(`[sendTextCommand] msgId: ${msgId}, activeSessionId: ${activeSessionId}, currentSessionId: ${currentSessionId}`);
        
        let quoteContent = null;
        let quoteRole = null;
        if (quotedMessage) {
            quoteContent = quotedMessage.content;
            quoteRole = quotedMessage.role;
            quotedMessage = null;
            const existingIndicator = document.querySelector('.quote-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }
        }

        const displayCmd = cmd;
        finalCmd = quoteContent ? `引用消息："${quoteContent}"\n\n${cmd}` : cmd;

        const container = _getChatContainer(activeSessionId) || document.getElementById('chat-box');
        const time = new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        const date = new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-');
        const fullTime = `${date} ${time}`;
        const safeDisplayCmd = encodeURIComponent(displayCmd).replace(/'/g, "%27");
        const quoteLabel = quoteRole === 'ai' ? '引用 AI' : quoteRole === 'user' ? '引用自己' : '引用文本';
        const quoteHtml = quoteContent ? `<div class="msg-quote"><div class="msg-quote-label">${quoteLabel}:</div><div class="msg-quote-content">${escapeHtml(quoteContent.substring(0, 100))}${quoteContent.length > 100 ? '...' : ''}</div></div>` : '';

        saveToLocalHistory({
            id: msgId,
            role: 'user',
            content: quoteContent ? JSON.stringify({type: 'text_with_quote', text: displayCmd, quote: quoteContent, quoteRole: quoteRole, quoteMsgId: (quotedMessage && quotedMessage.msgId) || ''}) : displayCmd,
            timestamp: Date.now()
        }, activeSessionId);

        container.insertAdjacentHTML('beforeend', `
            <div class="msg-row user" id="row-${msgId}" style="flex-direction: row; align-items: center; justify-content: flex-end; width: 100%;">
                <div class="msg-wrapper user">
                    <div class="msg-bubble">${quoteHtml}${escapeHtml(displayCmd)}</div>
                    <div class="msg-time">${fullTime} ${buildUserActionsHtml(msgId, safeDisplayCmd)}
                    </div>
                </div>
                <input type="checkbox" class="batch-checkbox" value="${msgId}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">
            </div>
        `);

        const replyMsgId = `reply-${msgId}`;
        const backendBadge = 'xCrab';
        container.insertAdjacentHTML('beforeend', `
            <div class="msg-row ai" id="row-${replyMsgId}" style="flex-direction: row; align-items: center; justify-content: flex-start; width: 100%;">
                <input type="checkbox" class="batch-checkbox" value="${replyMsgId}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">
                <div class="msg-wrapper ai">
                    <div class="msg-bubble" id="${replyMsgId}">执行中<span class="loading-dots"></span></div>
                    <div class="msg-time" id="time-row-${replyMsgId}">
                        <span class="backend-badge ${currentBackend}">${backendBadge}</span>
                        <img id="play-btn-${replyMsgId}" class="btn-action" src="icon/play.png" title="播放语音" style="cursor:pointer; display:none;">
                    </div>
                </div>
            </div>
        `);
        
        const sessionState = getSessionState(activeSessionId);
        sessionState.msgId = replyMsgId;
        sessionState.currentBackend = currentBackend;

        scrollToBottom();
        
        // 重置输入框高度和内容
        cmdInput.value = '';
        cmdInput.style.height = 'auto';
        
            // 优化：先建立 SSE 连接，再发送命令
        // 这样可以避免服务端收到 cclaw 消息时网页端还没建立连接的问题
        startSSE(msgId, activeSessionId);

        // 如果当前是 xCrab 后端，加载历史消息作为上下文
        let historyMessages = null;
        if (currentBackend === 'xcrab' && currentUser) {
            const historyKey = 'wclaw_history_' + currentUser + '_' + activeSessionId;
            try {
                const stored = localStorage.getItem(historyKey);
                if (stored) {
                    const allHistory = JSON.parse(stored);
                    // 取最近 20 条非当前消息的历史作为上下文
                    const recentHistory = allHistory.filter(m => m.id !== msgId).slice(-20);
                    historyMessages = recentHistory.map(m => {
                        let content = typeof m.content === 'string' ? m.content : '';
                        // 过滤 AI 消息中的思考标签和 Exit 后缀，避免传给 xCrab 干扰后续推理
                        if (m.role === 'ai') {
                            content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                            content = content.replace(/\s*Exit\s*$/, '');
                        }
                        return {
                            role: m.role === 'ai' ? 'assistant' : m.role,
                            content: content
                        };
                    }).filter(m => m.content);
                }
            } catch(e) {
                console.warn('[xcrab] 读取历史消息失败:', e);
            }
        }

        const MAX_RETRIES = 2;
        let lastError = null;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const apiEndpoint = currentBackend === 'xcrab' ? '/api/xcrab/send' : '/api/command';
                const requestBody = { command: finalCmd, sessionId: activeSessionId, backend: currentBackend };
                if (currentBackend === 'xcrab' && historyMessages) {
                    requestBody.messages = historyMessages;
                }
                const res = await fetch(host + apiEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + currentToken
                    },
                    body: JSON.stringify(requestBody),
                    signal: AbortSignal.timeout(30000)
                });
                const data = await res.json();

                if (data.code !== 200) {
                    if (data.code === 401) {
                        logout();
                        showAlert('error', '登录已过期，请重新登录');
                    } else {
                        updateHistoryError(msgId, data.message || '发送失败');
                    }
                    const sessionState = getSessionState(activeSessionId);
                    if (sessionState.eventSource) {
                        sessionState.eventSource.close();
                        sessionState.eventSource = null;
                    }
                    resetSendBtn(activeSessionId);
                    updateRemoteToolbarStatus(false);
                }
                lastError = null;
                break; // 成功，退出重试循环
            } catch (e) {
                lastError = e;
                if (attempt < MAX_RETRIES) {
                    console.warn(`[sendTextCommand] 第 ${attempt + 1} 次请求失败，${(attempt + 1) * 1000}ms 后重试:`, e.message);
                    await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
                }
            }
        }
        if (lastError) {
            updateHistoryError(msgId, '网络连接失败，请检查服务器');
            const sessionState = getSessionState(activeSessionId);
            if (sessionState.eventSource) {
                sessionState.eventSource.close();
                sessionState.eventSource = null;
            }
            resetSendBtn(activeSessionId);
            updateRemoteToolbarStatus(false);
        }
    }

    async function sendFileWithCommand(cmd) {
        const cmdInput = document.getElementById('command');
        const file = pendingFile;
        const msgId = 'msg-' + Date.now();
        const box = document.getElementById('chat-box');
        
        // 保存当前的 sessionId，防止切换会话时消息路由错误
        const activeSessionId = currentSessionId;
        const sessionState = getSessionState(activeSessionId);
        sessionState.msgId = `reply-${msgId}`;
        sessionState.currentBackend = currentBackend;
        
        let quoteContent = null;
        let quoteRole = null;
        if (quotedMessage) {
            quoteContent = quotedMessage.content;
            quoteRole = quotedMessage.role;
            quotedMessage = null;
            const existingIndicator = document.querySelector('.quote-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }
        }
        
        const displayText = cmd;
        let finalCmd = quoteContent ? `引用消息："${quoteContent}"

${cmd}` : cmd;
        const quoteLabel = quoteRole === 'ai' ? '引用 AI' : quoteRole === 'user' ? '引用自己' : '引用文本';
        const quoteHtml = quoteContent ? `<div class="msg-quote"><div class="msg-quote-label">${quoteLabel}:</div><div class="msg-quote-content">${escapeHtml(quoteContent.substring(0, 100))}${quoteContent.length > 100 ? '...' : ''}</div></div>` : '';
        const time = new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        const date = new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-');
        const fullTime = `${date} ${time}`;
        
        // 界面上展示：[文件] + 用户可能输入的文字（不显示提示词）
        let displayHtml = '';
        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            displayHtml = `<img src="${url}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px; display: block;" />`;
        } else {
            displayHtml = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <i class="fa-solid fa-file-lines" style="font-size: 24px;"></i>
                                <span style="font-weight: 500;">${escapeHtml(file.name)}</span>
                           </div>`;
        }
        if (displayText) {
            displayHtml += `<div>${escapeHtml(displayText)}</div>`;
        }
        
        const safeUploadContent = encodeURIComponent(displayText || file.name).replace(/'/g, "%27");
        const fileContainer = _getChatContainer(activeSessionId) || document.getElementById('chat-box');
        fileContainer.insertAdjacentHTML('beforeend', `
            <div class="msg-row user" id="row-${msgId}" style="flex-direction: row; align-items: center; justify-content: flex-end; width: 100%;">
                <div class="msg-wrapper user">
                    <div class="msg-bubble">${quoteHtml}${displayHtml}<br><span id="upload-hint-${msgId}" style="font-size:12px; color:var(--text-sub);">上传中 <span class="loading-dots"></span></span></div>
                    <div class="msg-time">${fullTime}
                        <i class="fa-regular fa-copy btn-action" title="复制" onclick="copyText(this, '${safeUploadContent}')"></i>
                    </div>
                </div>
                <input type="checkbox" class="batch-checkbox" value="${msgId}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">
            </div>
        `);
        scrollToBottom();

        // 重置输入区
        cmdInput.value = '';
        cmdInput.style.height = 'auto';
        clearPendingFile();

        const formData = new FormData();
        formData.append('file', file);
        if (finalCmd) formData.append('command', finalCmd);
        if (activeSessionId) formData.append('sessionId', activeSessionId);
        formData.append('backend', currentBackend);

        try {
            // YOLO26+AI 分析模式：调用 /api/yolo_analyze
            const isYoloMode = yoloEnabled && file.type.startsWith('image/') && currentBackend === 'xcrab';
            const uploadApi = isYoloMode ? '/api/yolo_analyze' : '/api/upload_with_command';
            if (isYoloMode) formData.append('allowVision', String(minimaxVisionEnabled));

            // 使用 XMLHttpRequest 支持上传进度回调
            const data = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', host + uploadApi);
                xhr.setRequestHeader('Authorization', 'Bearer ' + currentToken);
                xhr.timeout = 60000;

                xhr.upload.onprogress = function(e) {
                    if (e.lengthComputable) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        const sizeMB = (e.loaded / 1024 / 1024).toFixed(1);
                        const totalMB = (e.total / 1024 / 1024).toFixed(1);
                        const uploadHint = document.getElementById('upload-hint-' + msgId);
                        if (uploadHint) {
                            uploadHint.innerText = `上传中 ${sizeMB}/${totalMB}MB (${pct}%)`;
                        }
                    }
                };

                xhr.onload = function() {
                    try { resolve(JSON.parse(xhr.responseText)); }
                    catch(err) { reject(new Error('响应解析失败')); }
                };
                xhr.onerror = function() { reject(new Error('网络错误')); };
                xhr.ontimeout = function() { reject(new Error('上传超时')); };
                xhr.send(formData);
            });
            
            if (data.code === 200) {
                // YOLO 分析模式：在文字前添加检测摘要
                var yoloSuffix = '';
                if (isYoloMode && data.data.yolo) {
                    var yolo = data.data.yolo;
                    if (yolo.total_count > 0) {
                        var clsParts = [];
                        for (var cls in yolo.class_counts) {
                            clsParts.push(cls + '×' + yolo.class_counts[cls]);
                        }
                        yoloSuffix = '[YOLO26: ' + yolo.total_count + ' 个物体' + (clsParts.length ? ', ' + clsParts.join(', ') : '') + ']';
                    } else {
                        yoloSuffix = '[YOLO26: 未检测到物体]';
                    }
                }
                var finalDisplayText = yoloSuffix ? (displayText ? yoloSuffix + ' ' + displayText : yoloSuffix) : displayText;

                // 上传成功，更新消息气泡内容（转为标准 JSON 存储格式，以兼容历史记录渲染）
                const row = document.getElementById(`row-${msgId}`);
                if (row) {
                    const displayContent = finalDisplayText ? JSON.stringify({type: data.data.isImage ? 'image' : 'file', url: data.data.url, name: data.data.name, size: file.size, text: finalDisplayText}) : JSON.stringify({type: data.data.isImage ? 'image' : 'file', url: data.data.url, name: data.data.name, size: file.size});
                    const safeDisplayContent = encodeURIComponent(displayContent).replace(/'/g, "%27");

                    row.innerHTML = `
                        <div class="msg-wrapper user">
                            <div class="msg-bubble">${renderMessageContent(displayContent)}</div>
                            <div class="msg-time">${fullTime} ${buildUserActionsHtml(msgId, safeDisplayContent)}
                            </div>
                        </div>
                        <input type="checkbox" class="batch-checkbox" value="${msgId}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">
                    `;
                    
                    saveToLocalHistory({
                        id: msgId,
                        role: 'user',
                        content: displayContent,
                        timestamp: Date.now()
                    });
                }
                
                // 等待电脑端回复
                const replyMsgId = `reply-${msgId}`;
                const fileBackendBadge = 'xCrab';
                var loadingText = isYoloMode ? 'AI 正在分析图片（YOLO26检测完成）<span class="loading-dots"></span>' : '等待接收端响应 <span class="loading-dots"></span>';
                fileContainer.insertAdjacentHTML('beforeend', `
                    <div class="msg-row ai" id="row-${replyMsgId}" style="flex-direction: row; align-items: center; justify-content: flex-start; width: 100%;">
                        <input type="checkbox" class="batch-checkbox" value="${replyMsgId}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">
                        <div class="msg-wrapper ai">
                            <div class="msg-bubble" id="${replyMsgId}">${loadingText}</div>
                            <div class="msg-time" id="time-row-${replyMsgId}">
                                <span class="backend-badge ${currentBackend}">${fileBackendBadge}</span>
                            </div>
                        </div>
                    </div>
                `);
                const fileSessionState = getSessionState(activeSessionId);
                fileSessionState.msgId = replyMsgId;
                scrollToBottom();
                startSSE(msgId, activeSessionId);
            } else if (data.code === 401) {
                logout();
                showAlert('error', '登录已过期，请重新登录');
                document.getElementById(`row-${msgId}`).remove();
                resetSendBtn(activeSessionId);
                updateRemoteToolbarStatus(false);
            } else {
                showAlert('error', data.message || '发送失败');
                document.getElementById(`row-${msgId}`).remove();
                resetSendBtn(activeSessionId);
                updateRemoteToolbarStatus(false);
            }
        } catch (e) {
            showAlert('error', '网络连接失败，请检查服务器');
            document.getElementById(`row-${msgId}`).remove();
            resetSendBtn(activeSessionId);
            updateRemoteToolbarStatus(false);
        }
    }

    // 持久化通知 SSE 连接（页面打开期间一直保持，接收定时任务消息、执行状态变更等）
    function connectNotificationSSE() {
        if (!currentToken) return;
        if (window._notificationEventSource) {
            window._notificationEventSource.close();
        }
        if (!window._notifSseFailures) window._notifSseFailures = 0;
        const url = host + '/api/notification_sse?token=' + encodeURIComponent(currentToken);
        const es = new EventSource(url);
        window._notificationEventSource = es;

        es.onopen = function() {
            if (window._notifSseFailures > 0) {
                console.log('[通知SSE] 重连成功');
                hideNotice();
            }
            window._notifSseFailures = 0;
        };

        // 处理命名事件：执行状态变更（exec_status）
        es.addEventListener('status', function(e) {
            try {
                const d = JSON.parse(e.data);
                if (d.type === 'exec_status') {
                    console.log('[通知SSE] 执行状态变更:', d.executing ? '执行中' : '空闲');
                    // 更新远程执行状态
                    const sessionList = d.sessions || [];
                    if (d.executing && sessionList.length > 0) {
                        for (const s of sessionList) {
                            // 跳过用户主动停止的会话，防止重新被标记为执行中
                            if (window._userStoppedSessions && window._userStoppedSessions.has(s.sessionId)) continue;
                            remoteExecutingSessions[s.sessionId] = { since: d.timestamp || Date.now() };
                        }
                    } else if (!d.executing) {
                        // 所有会话执行结束
                        for (const sid in remoteExecutingSessions) {
                            delete remoteExecutingSessions[sid];
                        }
                    }
                    // 更新状态栏
                    const statusBar = document.getElementById('status-bar');
                    if (statusBar && currentSessionId) {
                        if (d.executing && currentSessionId in remoteExecutingSessions) {
                            statusBar.style.display = 'flex';
                            const statusText = statusBar.querySelector('.status-text');
                            if (statusText) {
                                statusText.innerHTML = '📡 远程执行中... <span id="status-timer">00:00</span>';
                            }
                        } else if (!d.executing && !(currentSessionId in remoteExecutingSessions)) {
                            statusBar.style.display = 'none';
                        }
                    }
                } else if (d.type === 'cclaw_offline') {
                    console.warn('[通知SSE] 执行端离线:', d.message);
                    // 如果当前有正在执行的会话，显示离线通知
                    if (currentSessionId && sessionExecutionStates[currentSessionId] && sessionExecutionStates[currentSessionId].isExecuting) {
                        showToast('⚠️ ' + d.message);
                    }
                    // 更新工具栏状态
                    updateRemoteToolbarStatus(false);
                }
            } catch(err) {
                console.error('[通知SSE] 状态事件解析失败:', err);
            }
        });

        // 处理未命名事件（旧版兼容：cron_message）
        es.onmessage = function(ev) {
            try {
                var d = JSON.parse(ev.data);
                if (d.type === 'cron_message') {
                    showToast('📌 ' + d.message);
                    // 保存到历史记录（刷新后不消失）
                    var cronId = 'cron-' + Date.now();
                    saveToLocalHistory({
                        id: cronId,
                        role: 'ai',
                        content: '📌 ' + d.message,
                        timestamp: Date.now(),
                        backend: 'cron'
                    });
                    // 同时添加到聊天气泡
                    var cronContainer = _getChatContainer() || document.getElementById('chat-box');
                    if (cronContainer) {
                        var timeStr = new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
                        cronContainer.insertAdjacentHTML('beforeend', [
                            '<div class="msg-row ai" id="row-' + cronId + '">',
                            '<input type="checkbox" class="batch-checkbox" value="' + cronId + '" style="display:none;">',
                            '<div class="msg-wrapper ai">',
                            '<div class="msg-bubble">📌 ' + escapeHtml(d.message) + '</div>',
                            '<div class="msg-time"><span class="backend-badge cron">定时</span> ' + timeStr + '</div>',
                            '</div></div>'
                        ].join(''));
                        scrollToBottom();
                    }
                }
            } catch(e) {}
        };

        es.onerror = function() {
            window._notifSseFailures = (window._notifSseFailures || 0) + 1;
            console.warn(`[通知SSE] 连接断开 (${window._notifSseFailures} 次)`);

            if (window._notifSseFailures >= 5) {
                // 达到最大重连次数，关闭连接并弹出提示
                console.warn('[通知SSE] 达到最大重连次数，关闭连接');
                es.close();
                window._notificationEventSource = null;
                showAlert('error', '连接已断开，已终止任务！');

                // 恢复状态栏为空闲
                var _sb3 = document.getElementById('status-bar');
                if (_sb3) {
                    _sb3.style.display = 'none';
                    var _st3 = _sb3.querySelector('.status-text');
                    if (_st3) _st3.innerHTML = '空闲';
                }

                // 如果有正在执行的任务，重置UI
                if (document.getElementById('stop-btn').style.display === 'flex') {
                    resetSendBtn();
                    const sessionState = getSessionState(currentSessionId);
                    if (sessionState.eventSource) {
                        sessionState.eventSource.close();
                        sessionState.eventSource = null;
                    }
                    if (sessionState.msgId) {
                        updateHistoryError(sessionState.msgId.replace('reply-', ''), '连接已断开，已终止任务！');
                        sessionState.msgId = null;
                    }
                }
            }
        };
    }

    // 页面加载时获取初始执行状态，用于恢复断开的 SSE 连接
    async function fetchInitialExecStatus() {
        if (!currentToken) return;
        try {
            const res = await fetch(host + '/api/cclaw_exec_status', {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const resp = await res.json();
            if (resp.code === 200 && resp.data && resp.data.executing) {
                const activeSessions = resp.data.sessions || [];
                console.log('[执行恢复] 检测到页面加载时有正在执行的任务:', activeSessions);

                for (const s of activeSessions) {
                    remoteExecutingSessions[s.sessionId] = { since: s.startTime || Date.now() };
                }

                if (currentSessionId && remoteExecutingSessions[currentSessionId]) {
                    const sessionState = getSessionState(currentSessionId);
                    sessionState.isExecuting = true;
                    sessionState.stoppedByUser = false;
                    showNotice('检测到执行端正在运行任务，完成后会自动显示结果');
                    updateRemoteToolbarStatus(true);
                }
            }
        } catch(e) {
            console.error('[执行恢复] 获取状态失败:', e);
        }
    }

    // 简单的 Toast 提示
    function showToast(text) {
        var el = document.createElement('div');
        el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 20px;border-radius:8px;z-index:9999;font-size:14px;max-width:80%;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.3);';
        el.textContent = text;
        document.body.appendChild(el);
        setTimeout(function() { el.remove(); }, 4000);
    }

    function startSSE(msgId, targetSessionId, reconnectAttempt = 0) {
        // 使用传入的 sessionId 或当前会话的 ID
        const sessionId = targetSessionId || currentSessionId;
        console.log(`[startSSE] msgId: ${msgId}, targetSessionId: ${targetSessionId}, sessionId: ${sessionId}, currentSessionId: ${currentSessionId}`);
        const sessionState = getSessionState(sessionId);

        // 消息级闭包变量：避免 sessionState.accumulatedOutput 被新消息的 startSSE 清空后，
        // 旧消息的 done 处理器读到空值导致内容被覆盖
        const localAccumulated = { value: '' };
        // stream_reset 时的基础内容长度：后续 stream 事件只替换"新增"部分，
        // 保留 reset 之前已累积的思考过程，防止被新建模阶段的内容覆盖
        let _baseLen = 0;
        
        // 清理之前的 SSE 连接
        if (sessionState.eventSource) sessionState.eventSource.close();
        if (sessionState.reconnectTimer) clearTimeout(sessionState.reconnectTimer);

        // 重置所有状态标志，防止上一次执行的状态影响新的 SSE 连接
        sessionState.sseCompleted = false;
        sessionState.stoppedByUser = false;
        sessionState.processedResults.clear();

        // 代际标记：每次新建 SSE 连接递增，旧连接的 handler 自动失效
        // 解决新旧连接同时接收广播事件导致内容覆盖的问题
        const thisGeneration = (sessionState._sseGeneration || 0) + 1;
        sessionState._sseGeneration = thisGeneration;

        // 记录当前正在等待的消息ID
        sessionState.msgId = msgId;

        try {
            startExecutionTimer(sessionId);
        } catch (e) {
            console.error('[startSSE] startExecutionTimer 失败，继续创建 SSE:', e.message);
        }

        const sseUrl = `${host}/api/stream_result?token=${currentToken}&sessionId=${encodeURIComponent(sessionId)}`;
        console.log(`[startSSE] 创建 SSE 连接: ${sseUrl}, generation: ${thisGeneration}`);
        sessionState.eventSource = new EventSource(sseUrl);

        // 初次连接时清空输出缓存；重连时保留已有的部分结果
        if (reconnectAttempt === 0) {
            sessionState.accumulatedOutput = '';
            localAccumulated.value = '';
        } else {
            // 重连时从 sessionState 恢复已有的部分结果到本地闭包
            localAccumulated.value = sessionState.accumulatedOutput || '';
        }
        if (!sessionState._toolCalls) sessionState._toolCalls = [];
        sessionState.streamSavedMsgId = `reply-${msgId}`;

        // 重连成功时清除断开连接提示
        sessionState.eventSource.onopen = function() {
            if (reconnectAttempt > 0) {
                console.log('[SSE] 重连成功, sessionId:', sessionId);
                // 清除消息气泡中的重连提示
                const replyId = sessionState.msgId ? (sessionState.msgId.startsWith('reply-') ? sessionState.msgId : 'reply-' + sessionState.msgId) : null;
                if (replyId) {
                    const replyEl = document.getElementById(replyId);
                    if (replyEl) {
                        const hint = replyEl.querySelector('.reconnecting-hint');
                        if (hint) hint.remove();
                    }
                }
                // 恢复状态栏为正常执行状态
                const statusBar = document.getElementById('status-bar');
                if (statusBar) {
                    statusBar.style.display = 'flex';
                    const statusText = statusBar.querySelector('.status-text');
                    if (statusText) {
                        statusText.innerHTML = '正在执行任务... <span id="status-timer">' + (function() {
                            const s = sessionState.executionSeconds || 0;
                            return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
                        })() + '</span>';
                    }
                }
                // 清除连接错误横幅
                const banner = document.getElementById('connection-error-banner');
                if (banner) banner.style.display = 'none';
                // 清除状态轮询（如果有）
                if (sessionState._pollInterval) {
                    clearInterval(sessionState._pollInterval);
                    sessionState._pollInterval = null;
                }
            }
        };

        sessionState.eventSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                const dataSessionId = data.sessionId || 'default';
                const effectiveSessionId = (data.data && data.data._sessionId) || dataSessionId;
                // 严格路由：只有 _sessionId 匹配才处理
                if (effectiveSessionId !== sessionId) {
                    console.log(`忽略来自其他会话的消息: effective=${effectiveSessionId} vs sessionId=${sessionId}`);
                    return;
                }

                // 代际检查：忽略旧 SSE 连接的事件，防止新旧连接同时处理导致内容覆盖
                if (thisGeneration !== sessionState._sseGeneration) {
                    console.log(`[SSE] 忽略旧连接事件: thisGeneration=${thisGeneration}, current=${sessionState._sseGeneration}, type=${data.type}`);
                    return;
                }

                // 收到有效数据时恢复状态栏显示
                function resetXcrabIdle() {
                    var _sb = document.getElementById('status-bar');
                    if (_sb) {
                        var _st = _sb.querySelector('.status-text');
                        if (_st && (_st.innerHTML.indexOf('无响应') !== -1)) {
                            _st.innerHTML = '正在执行任务... <span id="status-timer">...</span>';
                        }
                    }
                }

                // ====== 工具调用折叠块渲染（使用全局函数）======
                // renderToolCallItem 和 renderToolCallsBlock 已在全局定义

                // 解析工具参数为 HTML
                function _parseToolArgsHtml(argsStr) {
                    if (!argsStr) return '';
                    try {
                        var parsed = JSON.parse(argsStr);
                        var parts = [];
                        for (var k in parsed) {
                            var v = String(parsed[k]);
                            if (v.length > 1000) v = v.slice(0, 1000) + '...';
                            parts.push(escapeHtml(k) + ': ' + escapeHtml(v));
                        }
                        return parts.join('\n');
                    } catch (e) { return ''; }
                }

                // 更新消息气泡内的工具折叠块
                function _updateMsgToolBlock() {
                    var tools = sessionState._toolCalls;
                    if (!tools || tools.length === 0) return;
                    var _replyId = 'reply-' + msgId;
                    var _replyEl = document.getElementById(_replyId);
                    if (!_replyEl) return;
                    var _block = _replyEl.querySelector('.tool-calls-block');
                    if (_block) {
                        // 只更新内部内容，保留展开状态和 pre 滚动位置
                        var _listEl = _block.querySelector('.tool-calls-list');
                        if (_listEl) {
                            // 保存展开状态
                            var _openStates = [];
                            var _allDetails = _listEl.querySelectorAll('details');
                            for (var di = 0; di < _allDetails.length; di++) {
                                _openStates.push(_allDetails[di].open);
                            }

                            // 保存被用户滚动过的 pre 标签位置（上下+左右）
                            var _preScrollMap = {};
                            var _allPres = _listEl.querySelectorAll('details pre');
                            for (var pi = 0; pi < _allPres.length; pi++) {
                                if (_allPres[pi].scrollTop > 0 || _allPres[pi].scrollLeft > 0) {
                                    _preScrollMap[pi] = { top: _allPres[pi].scrollTop, left: _allPres[pi].scrollLeft };
                                }
                            }

                            // 更新工具列表内容
                            var _itemsHtml = '';
                            for (var ti = 0; ti < tools.length; ti++) {
                                _itemsHtml += renderToolCallItem(tools[ti]);
                            }
                            _listEl.innerHTML = _itemsHtml;

                            // 恢复展开状态
                            var _newDetails = _listEl.querySelectorAll('details');
                            for (var di = 0; di < _newDetails.length && di < _openStates.length; di++) {
                                _newDetails[di].open = _openStates[di];
                            }

                            // 恢复之前被用户滚动过的 pre 标签位置
                            var _newPres = _listEl.querySelectorAll('details pre');
                            for (var pi in _preScrollMap) {
                                if (_newPres[pi]) {
                                    _newPres[pi].scrollTop = _preScrollMap[pi].top;
                                    _newPres[pi].scrollLeft = _preScrollMap[pi].left;
                                }
                            }
                        }

                        // 更新状态图标和文本
                        var allDone = true;
                        var hasError = false;
                        for (var ti = 0; ti < tools.length; ti++) {
                            if (tools[ti].success === null) allDone = false;
                            if (tools[ti].success === false) hasError = true;
                        }
                        var stateClass = !allDone ? 'state-running' : (hasError ? 'state-error' : 'state-success');
                        _block.className = 'tool-calls-block ' + stateClass;

                        var summaryEl = _block.querySelector('.tool-calls-summary');
                        if (summaryEl) {
                            var icon = !allDone ? '⏳' : (hasError ? '⚠️' : '🔧');
                            var summaryText = !allDone
                                ? icon + ' 正在调用 ' + tools.length + ' 个工具...'
                                : icon + ' 调用了 ' + tools.length + ' 个工具';
                            summaryEl.innerHTML = '<i class="fa-solid fa-chevron-right"></i> ' + summaryText;
                        }
                    } else {
                        // 插入到消息内容之前
                        var _html = renderToolCallsBlock(tools);
                        var _stream = _replyEl.querySelector('.msg-stream-content');
                        if (_stream) {
                            _stream.insertAdjacentHTML('beforebegin', _html);
                        } else {
                            _replyEl.insertAdjacentHTML('afterbegin', _html);
                        }
                    }
                }

                // 更新底部工具栏（实时状态）
                function _updateToolBar(tc) {
                    var _toolBar = document.getElementById('xcrab-tool-bar');
                    var _toolInner = document.getElementById('xcrab-tool-bar-inner');
                    if (!_toolBar || !_toolInner) return;
                    _toolBar.style.display = 'block';
                    _toolBar.classList.remove('fade-in');
                    void _toolBar.offsetWidth;
                    _toolBar.classList.add('fade-in');
                    var stateClass = tc.success === null ? 'state-running' : (tc.success ? 'state-done' : 'state-error');
                    _toolInner.className = 'xcrab-tool-bar-inner ' + stateClass;
                    var stateIcon = tc.success === null ? '⏳' : (tc.success ? '✅' : '❌');
                    var _info = getToolInfo(tc.name);
                    var toolIcon = _info.icon || '🔧';
                    var colorStyle = _info.color ? 'color:' + _info.color + ';' : '';
                    var _lines = [];
                    _lines.push('<div style="display:flex;align-items:center;gap:6px;">' +
                        '<span style="flex-shrink:0;">' + stateIcon + '</span> <span style="' + colorStyle + '">' + toolIcon + '</span> <b>' + escapeHtml(_info.alias || tc.name) + '</b>' +
                    '</div>');
                    _lines.push('<div style="font-size:12px;line-height:1.6;padding-left:24px;" title="' + escapeHtml(_info.d) + '">' +
                        '<span style="color:#bf360c;">[' + escapeHtml(_info.c) + ']</span> ' +
                        '<span style="color:#8d3a00;">' + escapeHtml(_info.d) + '</span>' +
                    '</div>');
                    _toolInner.innerHTML = _lines.join('');
                }

                if (data.type === 'stream') {
                    resetXcrabIdle();
                    // 用户已手动停止或会话已完成，忽略后续流式数据避免覆盖
                    if (sessionState.stoppedByUser || sessionState.sseCompleted) {
                        _cancelHallucinationGuard();
                        return;
                    }
                    // 幻觉拦截：从接收到 AI 第一条消息开始启动 10 秒计时器
                    try { _startHallucinationGuard(msgId); } catch (e) { console.error('[幻觉拦截] 启动失败:', e); }
                    let text = stripAnsi(data.data.text);
                    // 服务端已累积全量文本（xcrabSessions 累积 + 转发），这里直接替换而非追加
                    // stream_reset 时 _baseLen 保留前序内容，新文本追加在后面
                    if (_baseLen > 0) {
                        localAccumulated.value = localAccumulated.value.substring(0, _baseLen) + '\n\n' + text;
                    } else {
                        localAccumulated.value = text;
                    }
                    // 同步写入 sessionState 以支持重连时恢复
                    sessionState.accumulatedOutput = localAccumulated.value;

                    const replyMsgId = `reply-${msgId}`;
                    const currentReplyEl = document.getElementById(replyMsgId);

                    trySendSMS(localAccumulated.value);

                    // === RAF 节流渲染：合并同一帧内的多次 stream 事件 ===
                    if (currentReplyEl) {
                        // 首次 stream：初始化内容包装器 + 分离 loading-dots
                        if (!currentReplyEl._streamWrapper) {
                            // 保留已有的工具折叠块（tool_call 可能先于 stream 到达）
                            var _existingToolBlock = currentReplyEl.querySelector('.tool-calls-block');
                            var _toolBlockHtml = _existingToolBlock ? _existingToolBlock.outerHTML : '';
                            currentReplyEl.innerHTML = _toolBlockHtml + '<div class="msg-stream-content"></div><span class="loading-dots"></span>';
                            currentReplyEl._streamWrapper = currentReplyEl.querySelector('.msg-stream-content');
                            // 事件委托：代码块复制按钮
                            currentReplyEl.addEventListener('click', function(ev) {
                                var cb = ev.target.closest('.code-copy-btn');
                                if (cb) { ev.stopPropagation(); copyCodeBlock(cb); }
                            });
                        }
                        // 标记内容已变化，RAF 回调在下一帧统一渲染
                        if (!sessionState._streamRaf) {
                            sessionState._streamRaf = true;
                            requestAnimationFrame(function() {
                                sessionState._streamRaf = false;
                                // 如果 done/result 已处理，跳过本次空转渲染
                                if (sessionState._streamRafCancelled) {
                                    sessionState._streamRafCancelled = false;
                                    return;
                                }
                                var el = document.getElementById(replyMsgId);
                                if (el && el._streamWrapper) {
                                    var newHtml = renderMessageContent(localAccumulated.value, true, true);
                                    if (el._streamWrapper._lastHtml !== newHtml) {
                                        el._streamWrapper._lastHtml = newHtml;
                                        el._streamWrapper.innerHTML = newHtml;
                                    }
                                    // 只在用户已经在底部附近且未禁用自动滚动时才滚动
                                    if (!_autoScrollDisabled) {
                                        var chatBox = document.getElementById('chat-box');
                                        var isNearBottom = chatBox.scrollTop + chatBox.clientHeight >= chatBox.scrollHeight - 100;
                                        if (isNearBottom) {
                                            scrollToBottom();
                                        }
                                    }
                                }
                            });
                        }
                    }

                    // 长连接模式下不自动结束会话，等待 done/result 事件或网络错误

                    // 节流保存到 localStorage（每 2 秒最多写一次）
                    if (!sessionState._lsSaveTimer) {
                        sessionState._lsSaveTimer = setTimeout(function() {
                            sessionState._lsSaveTimer = null;
                            const key = 'wclaw_history_' + currentUser + '_' + sessionId;
                            try {
                                let history = JSON.parse(localStorage.getItem(key) || '[]');
                                let existingIdx = history.findIndex(m => m.id === replyMsgId);
                                if (existingIdx === -1) {
                                    history.push({
                                        id: replyMsgId, role: 'ai',
                                        content: localAccumulated.value,
                                        status: 'streaming', timestamp: Date.now(),
                                        backend: sessionState.currentBackend || currentBackend,
                                        toolCalls: sessionState._toolCalls || []
                                    });
                                } else {
                                    history[existingIdx].content = localAccumulated.value;
                                    history[existingIdx].status = 'streaming';
                                    // 始终保存工具调用数据（包括空数组），防止断线时丢失
                                    history[existingIdx].toolCalls = sessionState._toolCalls || [];
                                }
                                localStorage.setItem(key, JSON.stringify(history));
                            } catch(e) {}
                        }, 2000);
                    }

                } else if (data.type === 'stream_reset') {
                    // xCrab 进入新的 thinking 阶段。服务端累积文本已重置。
                    // 渲染层 renderTextPipeline 独立处理 think 块，无需在此预提取
                    resetXcrabIdle();
                    _baseLen = localAccumulated.value.length;
                    // 幻觉拦截 v4：新一轮思考阶段。
                    //   v4 规则：收到 AI 任何消息就尝试启动 10 秒计时器（已有计时器则跳过）。
                    //   stream_reset 时 _hallucinationGuardTimer 通常已被上一轮的 result/done 清空，
                    //   这里是关键触发点；如果上一轮没正常结束（异常），这里也会启动新计时器。
                    try { _startHallucinationGuard(msgId); } catch (e) { console.error('[幻觉拦截] 启动失败:', e); }

                } else if (data.type === 'tool_call') {
                    resetXcrabIdle();
                    // 幻觉拦截 v4：检测到 AI 调用工具，标记 tool-calls-block 元素即将被插入。
                    //   行为等同 _onAiMessageReceived —— 已有计时器就跳过，没有就启动。
                    //   10 秒到点时 _hallucinationGuardTick 会发现气泡内已有 .tool-calls-block，**不拦截**。
                    try { _onHallucinationGuardToolCall(); } catch (e) { console.error('[幻觉拦截] 启动失败:', e); }
                    var _tcName = data.data && data.data.name;
                    var _tcIdx = data.data && data.data.index != null ? data.data.index : 0;
                    var _tcTotal = data.data && data.data.total || 1;
                    var _tcArgs = data.data && data.data.args;
                    // 移除 loading dots
                    var _replyId = 'reply-' + msgId;
                    var _rowEl = document.getElementById('row-' + _replyId);
                    if (_rowEl) { var _dots = _rowEl.querySelector('.loading-dots'); if (_dots) _dots.remove(); }
                    if (!sessionState._toolCalls) sessionState._toolCalls = [];
                    // 防止重连导致重复添加（按 name+index 去重，但已完成的工具不视为重复）
                    var _dup = false;
                    for (var di = 0; di < sessionState._toolCalls.length; di++) {
                        if (sessionState._toolCalls[di].name === _tcName && sessionState._toolCalls[di].index === _tcIdx && sessionState._toolCalls[di].success === null) { _dup = true; break; }
                    }
                    var _newEntry = null;
                    if (!_dup) {
                        _newEntry = {
                            name: _tcName,
                            index: _tcIdx,
                            total: _tcTotal,
                            argsHtml: _parseToolArgsHtml(_tcArgs),
                            success: null,
                            result: null,
                            durationMs: null
                        };
                        sessionState._toolCalls.push(_newEntry);
                    }
                    // 更新底部工具栏（用已有或新建的条目）
                    var _barEntry = _dup ? sessionState._toolCalls[di] : _newEntry;
                    _updateToolBar(_barEntry);
                    // 更新消息气泡内的折叠块
                    _updateMsgToolBlock();

                } else if (data.type === 'tool_progress') {
                    resetXcrabIdle();
                    // 保持底部工具栏可见（防止空闲超时隐藏）
                    // 幻觉拦截 v4：工具执行进度触发 _onAiMessageReceived。
                    //   按 v4 规则，已有计时器在跑就直接 return（不重置）。
                    //   10 秒到点时气泡内已有 .tool-calls-block，**不拦截**（AI 确实在干活）。
                    try { _onAiMessageReceived(msgId); } catch (e) { console.error('[幻觉拦截] tool_progress 启动失败:', e); }

                } else if (data.type === 'tool_result') {
                    resetXcrabIdle();
                    // 幻觉拦截 v4：工具返回结果触发 _onAiMessageReceived。
                    //   按 v4 规则，已有计时器在跑就直接 return（不重置）。
                    //   10 秒到点时气泡内已有 .tool-calls-block，**不拦截**（AI 确实在干活）。
                    try { _onAiMessageReceived(msgId); } catch (e) { console.error('[幻觉拦截] tool_result 启动失败:', e); }
                    var _rsName = data.data && data.data.name;
                    var _rsIdx = data.data && data.data.index != null ? data.data.index : -1;
                    var _rsSuccess = data.data && data.data.success !== false;
                    var _rsResult = data.data && data.data.result || '';
                    var _rsDur = data.data && data.data.durationMs || 0;
                    if (!sessionState._toolCalls) sessionState._toolCalls = [];
                    // 优先匹配正在执行中的同 index 条目，其次按 name+未完成匹配（从后向前找，避免并发同名工具匹配到错误条目）
                    var _rsTools = sessionState._toolCalls;
                    var _rsEntry = null;
                    for (var ri = _rsTools.length - 1; ri >= 0; ri--) {
                        if (_rsTools[ri].index === _rsIdx && _rsTools[ri].name === _rsName && _rsTools[ri].success === null) { _rsEntry = _rsTools[ri]; break; }
                    }
                    if (!_rsEntry) {
                        for (var ri = _rsTools.length - 1; ri >= 0; ri--) {
                            if (_rsTools[ri].name === _rsName && _rsTools[ri].success === null) { _rsEntry = _rsTools[ri]; break; }
                        }
                    }
                    if (_rsEntry) {
                        _rsEntry.success = _rsSuccess;
                        _rsEntry.result = _rsResult;
                        _rsEntry.durationMs = _rsDur;
                    } else {
                        console.warn('[tool_result] 未匹配到工具条目! name=' + _rsName + ' idx=' + _rsIdx);
                    }
                    // 更新底部工具栏
                    if (_rsEntry) _updateToolBar(_rsEntry);
                    // 更新消息气泡内的折叠块
                    _updateMsgToolBlock();
                } else if (data.type === 'result') {
                    console.log('[SSE] 收到 result 事件，准备停止执行计时器');
                    try { _cancelHallucinationGuard(); } catch (e) {}
                    if (sessionState.processedResults.has(msgId)) {
                        console.log(`[SSE] 忽略已处理的 result: ${msgId}`);
                        return;
                    }
                    sessionState.processedResults.add(msgId);

                    if (sessionState.reconnectTimer) clearTimeout(sessionState.reconnectTimer);
                    sessionState.reconnectAttempts = 0;
                    const outputText = (data.data && data.data.stdout) ? data.data.stdout : '';

                    const replyMsgId = `reply-${msgId}`;
                    const resultContent = stripAnsi(outputText).trim() || '执行完成 (无输出)';
                    const finalContent = resultContent + ' Exit';
                    saveToLocalHistory({
                        id: replyMsgId,
                        role: 'ai',
                        content: finalContent,
                        status: 'success',
                        timestamp: Date.now(),
                        executionSeconds: sessionState.executionSeconds,
                        backend: sessionState.currentBackend || currentBackend
                    }, sessionId);

                    // 清理流式渲染状态（RAF + 包装器 + localStorage 节流定时器）
                    sessionState._streamRafCancelled = true;
                    if (sessionState._streamRaf) { sessionState._streamRaf = false; }
                    if (sessionState._lsSaveTimer) { clearTimeout(sessionState._lsSaveTimer); sessionState._lsSaveTimer = null; }
                    var _replyEl = document.getElementById(replyMsgId);
                    if (_replyEl) { _replyEl._streamWrapper = null; }

                    updateHistoryResult(msgId, data.data);

                    // AI回复完成
                    stopExecutionTimer(sessionId);
                    showExecutionTime(msgId, sessionId);
                    console.log(`[DEBUG SSE result] sessionId: ${sessionId}, msgId: ${msgId}, will NOT resetSendBtn, isExecuting: ${sessionState.isExecuting}, hasEventSource: ${!!sessionState.eventSource}`);

                    if (sessionState.doneTimeout) {
                        clearTimeout(sessionState.doneTimeout);
                        sessionState.doneTimeout = null;
                    }
                } else if (data.type === 'timeout_warning') {
                    // ====== 工具超时确认弹窗 ======
                    resetXcrabIdle();
                    var _twData = data.data || {};
                    var _twConfirmId = _twData.confirmId;
                    var _twToolName = _twData.toolName || '未知工具';
                    var _twElapsed = _twData.elapsedSec || 0;

                    // 移除已有弹窗（防止重复）
                    var _oldOverlay = document.getElementById('timeout-modal-overlay');
                    if (_oldOverlay) _oldOverlay.remove();

                    // 创建弹窗
                    var _overlay = document.createElement('div');
                    _overlay.id = 'timeout-modal-overlay';
                    _overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:10000;display:flex;align-items:center;justify-content:center;';

                    var _box = document.createElement('div');
                    _box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);font-family:"Microsoft YaHei",sans-serif;';

                    // 标题
                    var _title = document.createElement('h3');
                    _title.style.cssText = 'margin:0 0 8px 0;font-size:16px;color:#333;';
                    _title.textContent = '⏳ 工具执行超时';

                    // 消息
                    var _msg = document.createElement('p');
                    _msg.style.cssText = 'margin:0 0 4px 0;color:#666;font-size:14px;line-height:1.5;';
                    _msg.textContent = '工具 "' + _twToolName + '" 已执行 ' + _twElapsed + ' 秒，是否继续等待？';

                    // 倒计时提示
                    var _timerHint = document.createElement('p');
                    _timerHint.id = 'timeout-modal-timer';
                    _timerHint.style.cssText = 'margin:0 0 20px 0;font-size:12px;color:#999;';
                    _timerHint.textContent = '将在 2 分钟后自动终止';

                    // 按钮容器
                    var _btnRow = document.createElement('div');
                    _btnRow.style.cssText = 'display:flex;gap:12px;justify-content:flex-end;';

                    // 终止按钮
                    var _btnCancel = document.createElement('button');
                    _btnCancel.textContent = '终止';
                    _btnCancel.style.cssText = 'padding:8px 20px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;color:#333;font-size:14px;';
                    _btnCancel.onclick = function() {
                        fetch(host + '/api/tools/timeout-response', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
                            body: JSON.stringify({ confirmId: _twConfirmId, action: 'cancel' })
                        }).catch(function(){});
                        _overlay.remove();
                    };

                    // 继续等待按钮
                    var _btnExtend = document.createElement('button');
                    _btnExtend.textContent = '继续等待';
                    _btnExtend.style.cssText = 'padding:8px 20px;border:none;border-radius:6px;background:#4CAF50;cursor:pointer;color:#fff;font-size:14px;font-weight:500;';
                    _btnExtend.onclick = function() {
                        fetch(host + '/api/tools/timeout-response', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
                            body: JSON.stringify({ confirmId: _twConfirmId, action: 'extend' })
                        }).catch(function(){});
                        _overlay.remove();
                    };

                    _btnRow.appendChild(_btnCancel);
                    _btnRow.appendChild(_btnExtend);
                    _box.appendChild(_title);
                    _box.appendChild(_msg);
                    _box.appendChild(_timerHint);
                    _box.appendChild(_btnRow);
                    _overlay.appendChild(_box);
                    document.body.appendChild(_overlay);

                    // 2 分钟后自动终止
                    var _autoCancelStart = Date.now();
                    var _autoCancelTimer = setTimeout(function _autoCancel() {
                        var _stillOpen = document.getElementById('timeout-modal-overlay');
                        if (_stillOpen) {
                            fetch(host + '/api/tools/timeout-response', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
                                body: JSON.stringify({ confirmId: _twConfirmId, action: 'cancel' })
                            }).catch(function(){});
                            _stillOpen.remove();
                        }
                    }, 120000);
                    // 更新倒计时显示（每 30 秒更新一次）
                    var _countdownInterval = setInterval(function() {
                        var _hint = document.getElementById('timeout-modal-timer');
                        if (!_hint) { clearInterval(_countdownInterval); return; }
                        var _elapsedSec = (Date.now() - _autoCancelStart) / 1000;
                        var _remainingSec = Math.max(0, 120 - _elapsedSec);
                        if (_remainingSec <= 0) { clearInterval(_countdownInterval); return; }
                        var _min = Math.ceil(_remainingSec / 60);
                        _hint.textContent = '将在 ' + _min + ' 分钟后自动终止';
                    }, 30000);
                    // 在按钮点击时清理定时器
                    var _origCancel = _btnCancel.onclick;
                    _btnCancel.onclick = function() {
                        clearTimeout(_autoCancelTimer);
                        clearInterval(_countdownInterval);
                        _origCancel();
                    };
                    var _origExtend = _btnExtend.onclick;
                    _btnExtend.onclick = function() {
                        clearTimeout(_autoCancelTimer);
                        clearInterval(_countdownInterval);
                        _origExtend();
                    };
                } else if (data.type === 'error') {
                    try { _cancelHallucinationGuard(); } catch (e) {}
                    console.error('[SSE] 错误事件:', data.message || data.data);
                    // 在聊天区域显示错误消息
                    var errMsg = data.message || 'AI 服务返回错误';
                    // 检测常见错误类型，给出更友好的提示
                    if (errMsg.includes('rate_limit') || errMsg.includes('usage limit')) {
                        errMsg = '该模型 API 用量已达上限，请稍后再试或切换模型';
                    } else if (errMsg.includes('401') || errMsg.includes('unauthorized') || errMsg.includes('invalid_api_key')) {
                        errMsg = 'API Key 无效或已过期，请检查自定义模型配置';
                    } else if (errMsg.includes('429')) {
                        errMsg = '请求过于频繁，请稍后再试';
                    } else if (errMsg.includes('timeout') || errMsg.includes('超时')) {
                        errMsg = 'AI 服务响应超时，请稍后再试';
                    } else if (errMsg.includes('network') || errMsg.includes('网络')) {
                        errMsg = '无法连接到 AI 服务，请检查网络或 API 地址';
                    } else if (errMsg.includes('server_error') || errMsg.includes('unknown error') || (errMsg.includes('500') && errMsg.includes('API'))) {
                        errMsg = '检测到是 AI 厂商服务端异常，请稍等片刻或更换模型';
                    }
                    // 在消息区域显示错误
                    updateHistoryError(msgId, errMsg);
                    showAlert('error', errMsg);
                    // 清理状态
                    if (sessionId in remoteExecutingSessions) {
                        delete remoteExecutingSessions[sessionId];
                    }
                    resetSendBtn(sessionId);
                    var _statusBar = document.getElementById('status-bar');
                    if (_statusBar) _statusBar.style.display = 'none';
                    updateRemoteToolbarStatus(false);
                } else if (data.type === 'done') {
                    try { _cancelHallucinationGuard(); } catch (e) {}
                    // 用户已手动停止，忽略 done 事件避免覆盖停止标记
                    if (sessionState.stoppedByUser) { sessionState.sseCompleted = true; return; }
                    console.log(`[DEBUG SSE done] sessionId: ${sessionId}, msgId: ${msgId}, sessionState.msgId: ${sessionState.msgId}, isExecuting: ${sessionState.isExecuting}, hasEventSource: ${!!sessionState.eventSource}`);
                    if (sessionState.doneTimeout) {
                        clearTimeout(sessionState.doneTimeout);
                        sessionState.doneTimeout = null;
                    }
                    console.log(`[SSE] 收到 done 事件，会话 ${sessionId} 真正完成`);
                    if (sessionState.reconnectTimer) clearTimeout(sessionState.reconnectTimer);
                    sessionState.reconnectAttempts = 0;
                    sessionState.sseCompleted = true;
                    if (sessionState._pollInterval) {
                        clearInterval(sessionState._pollInterval);
                        sessionState._pollInterval = null;
                    }
                    // 不关闭 SSE 连接 — 保持长连，防止频繁重连
                    // 服务端会在所有客户端断开 30 分钟后自动清理
                    sessionState.msgId = null;
                    // SSE done 代表执行真正结束，清理远程执行标记，防止状态栏重新弹出
                    if (sessionId in remoteExecutingSessions) {
                        delete remoteExecutingSessions[sessionId];
                    }
                    resetSendBtn(sessionId);
                    // 清除卡顿警告横幅（空闲检测定时器虽已清除，但横幅可能已在前端显示）
                    var _stallWarn = document.getElementById('xcrab-stall-warning');
                    if (_stallWarn) _stallWarn.remove();
                    // 隐藏状态栏
                    var _statusBar = document.getElementById('status-bar');
                    if (_statusBar) _statusBar.style.display = 'none';
                    // 隐藏工具状态条
                    var _toolBar = document.getElementById('xcrab-tool-bar');
                    if (_toolBar) { _toolBar.classList.remove('fade-in'); _toolBar.style.display = 'none'; }
                    updateRemoteToolbarStatus(false);
                    showExecutionTime(msgId, sessionId);

                    // 检测 SMS 触发标记（Android App 发送短信）
                    // 读取消息级闭包变量，避免被新消息的 startSSE 清空后读到空值导致内容被覆盖
                    const accumulated = localAccumulated.value || '';

                    // 移除 loading 指示器并更新本地历史为完整内容
                    const replyMsgId = `reply-${msgId}`;
                    const replyEl = document.getElementById(replyMsgId);

                    // 检测 SMS 触发标记 (内容@手机号@SMS_go)
                    trySendSMS(accumulated);

                    // 将工具执行日志包裹在 <think> 标签中，前端自动折叠
                    function wrapToolSections(text) {
                        if (!text || typeof text !== 'string') return text;
                        // 如果文本已包含 <think> 块，不再嵌套包裹（避免多层 think 导致渲染异常）
                        if (/<think>/i.test(text)) return text;
                        // 精确匹配工具日志行首标记（要求 emoji 后紧跟工具类关键词，避免误配正文中的同名 emoji）
                        var markerRegex = /(?:^|\n)(?=(?:[⚙️📦⏱✅❌].{0,10}(?:调用|执行|加载|卸载|配置|第\d+个工具|运行|处理|搜索|读取|写入|追加|列出|记住|回忆|删除记忆|切换|生成|创建计划))|(?:── 第\s*\d+\s*步))/g;
                        var lastIdx = -1;
                        var m;
                        while ((m = markerRegex.exec(text)) !== null) {
                            lastIdx = m.index;
                        }
                        if (lastIdx < 0) return text;
                        var searchFrom = lastIdx === 0 ? 0 : lastIdx + 1;
                        var nl = text.indexOf('\n', searchFrom);
                        var split = nl >= 0 ? nl + 1 : text.length;
                        var think = text.substring(0, split).trim();
                        var rest = text.substring(split).trim();
                        if (!think) return text;
                        return rest ? '<think>\n' + think + '\n</think>\n\n' + rest : '<think>\n' + think + '\n</think>';
                    }

                    // 回答完毕，复位思考块为折叠状态
                    window.__thinkExpanded = false;
                    var rawText = (stripAnsi(accumulated).trim() || '执行完成 (无输出)');
                    var wrappedText = wrapToolSections(rawText);
                    var displayText = wrappedText + ' Exit';
                    var finalText = rawText + ' Exit';
                    // 清理流式渲染状态（RAF + 包装器 + localStorage 节流定时器）
                    sessionState._streamRafCancelled = true;
                    if (sessionState._streamRaf) { sessionState._streamRaf = false; }
                    if (sessionState._lsSaveTimer) { clearTimeout(sessionState._lsSaveTimer); sessionState._lsSaveTimer = null; }
                    var _tools = sessionState._toolCalls;

                    // ★ 先保存到 localStorage（确保即使后续 DOM 操作失败，聊天记录也不丢失）
                    if (currentUser && sessionId) {
                        const key = 'wclaw_history_' + currentUser + '_' + sessionId;
                        try {
                            let history = JSON.parse(localStorage.getItem(key) || '[]');
                            const existingIdx = history.findIndex(m => m.id === replyMsgId);
                            if (existingIdx !== -1) {
                                if (history[existingIdx].content && history[existingIdx].content.includes('[已手动停止]')) {
                                    history[existingIdx].executionSeconds = sessionState.executionSeconds;
                                } else {
                                    history[existingIdx].content = displayText;
                                    history[existingIdx].status = 'success';
                                    history[existingIdx].executionSeconds = sessionState.executionSeconds;
                                    history[existingIdx].backend = sessionState.currentBackend || currentBackend;
                                    if (_tools && _tools.length > 0) {
                                        history[existingIdx].toolCalls = _tools;
                                    }
                                }
                            } else {
                                history.push({
                                    id: replyMsgId,
                                    role: 'ai',
                                    content: displayText,
                                    status: 'success',
                                    timestamp: Date.now(),
                                    executionSeconds: sessionState.executionSeconds,
                                    backend: sessionState.currentBackend || currentBackend,
                                    toolCalls: _tools || []
                                });
                            }
                            localStorage.setItem(key, JSON.stringify(history));
                        } catch(e) {}
                    }

                    if (replyEl) {
                        replyEl._streamWrapper = null; // 清理包装器引用
                        var _streamContent = replyEl.querySelector('.msg-stream-content');
                        var _doneFinalHtml = renderMessageContent(wrappedText, false);
                        if (_streamContent) {
                            // 始终用最终内容渲染，避免 RAF 已执行但内容不完整的竞态问题
                            _streamContent.innerHTML = _doneFinalHtml;
                            // 工具折叠块插在容器前
                            if (_tools && _tools.length > 0 && !replyEl.querySelector('.tool-calls-block')) {
                                _streamContent.insertAdjacentHTML('beforebegin', renderToolCallsBlock(_tools));
                            }
                            var _dots = replyEl.querySelector('.loading-dots');
                            if (_dots) _dots.remove();
                        } else {
                            if (_tools && _tools.length > 0) {
                                _doneFinalHtml = renderToolCallsBlock(_tools) + _doneFinalHtml;
                            }
                            replyEl.innerHTML = _doneFinalHtml;
                        }
                        // 流式渲染完成后，渲染 Mermaid 图表
                        renderMermaidBlocks(replyEl);
                    }
                    // 清理工具收集数组
                    sessionState._toolCalls = [];

                    // 添加操作按钮（适配移动端聚合按钮）
                    const doneTime = new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
                    const doneDate = new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-');
                    const doneFullTime = `${doneDate} ${doneTime}`;
                    const doneSafeContent = encodeURIComponent(finalText).replace(/'/g, '%27');
                    const doneBackendLabel = 'xCrab';
                    const doneBackendBadge = sessionState.currentBackend || currentBackend;
                    const doneActionsHtml = buildAiActionsHtml(replyMsgId, doneSafeContent);
                    const doneTimeRow = document.querySelector('#row-' + replyMsgId + ' .msg-time');
                    if (doneTimeRow) {
                        doneTimeRow.innerHTML = `<span class=\"backend-badge ${doneBackendBadge}\">${doneBackendLabel}</span>${doneFullTime} ${doneActionsHtml}`;
                        // 恢复计时器（showExecutionTime 在前面已追加 exec-time，但被 innerHTML 覆盖）
                        const doneElapsed = sessionState.executionSeconds || 0;
                        if (doneElapsed > 0) {
                            const doneM = String(Math.floor(doneElapsed / 60)).padStart(2, '0');
                            const doneS = String(doneElapsed % 60).padStart(2, '0');
                            doneTimeRow.innerHTML += ` <span class=\"exec-time\">⏱ ${doneM}:${doneS}</span>`;
                        }
                    }

                    // 自动播放：触发播放按钮点击
                    if (ttsAutoPlayEnabled && finalText && replyEl) {
                        setTimeout(function() {
                            var playBtn = document.getElementById('play-btn-' + replyMsgId);
                            if (playBtn) playBtn.click();
                        }, 300);
                    }
                } else if (data.type === 'heartbeat') {
                    // 空闲心跳：显示距离上次收到 xCrab 数据的时间
                    // 如果会话已结束，忽略心跳避免覆盖 done 的清理
                    if (!sessionState.isExecuting) return;
                    var _statusBarH = document.getElementById('status-bar');
                    if (_statusBarH && data.idleSeconds) {
                        _statusBarH.style.display = 'flex';
                        var _statusTextH = _statusBarH.querySelector('.status-text');
                        if (_statusTextH) {
                            _statusTextH.innerHTML = '⏳ xCrab 思考中（无响应 ' + data.idleSeconds + 's）<span id="status-timer">...</span>';
                        }
                    }
                } else if (data.type === 'stall_warning') {
                    // 卡顿警告：在页面顶部显示黄色警告条
                    var _warnEl = document.getElementById('xcrab-stall-warning');
                    if (!_warnEl) {
                        _warnEl = document.createElement('div');
                        _warnEl.id = 'xcrab-stall-warning';
                        _warnEl.style.cssText = 'position:fixed;top:60px;left:0;right:0;z-index:1000;background:#fff3cd;color:#856404;text-align:center;padding:8px 16px;font-size:13px;border-bottom:1px solid #ffeeba;';
                        document.body.insertBefore(_warnEl, document.body.firstChild);
                    }
                    _warnEl.innerHTML = '⚠️ ' + escapeHtml(data.message || 'xCrab 可能卡顿');
                } else if (data.type === 'stall_resolved') {
                    // 卡顿恢复：移除警告，状态栏恢复正常
                    var _warnElR = document.getElementById('xcrab-stall-warning');
                    if (_warnElR) _warnElR.remove();
                    var _statusBarR = document.getElementById('status-bar');
                    if (_statusBarR) {
                        var _statusTextR = _statusBarR.querySelector('.status-text');
                        if (_statusTextR) {
                            _statusTextR.innerHTML = '正在执行任务... <span id="status-timer">00:00</span>';
                        }
                    }
                }
            } catch(e) {
                console.error('SSE消息解析失败:', e);
            }
        };

        // 在消息气泡中显示"连接断开，正在重连..."，同时保持原有内容
        function showReconnectingBubble(replyMsgId, attemptNum) {
            const el = document.getElementById(replyMsgId);
            if (!el) return;
            let qualityHint = '';
            if (attemptNum >= 10) {
                qualityHint = ' <span style="color:#e74c3c;">网络质量极差</span>';
            } else if (attemptNum >= 5) {
                qualityHint = ' <span style="color:#f39c12;">网络不稳定</span>';
            }
            // 如果已经有累计输出，在底部追加状态信息
            const existingContent = sessionState.accumulatedOutput;
            if (existingContent) {
                // 已有内容时，只在底部显示小提示
                let reconnectingHint = el.querySelector('.reconnecting-hint');
                if (!reconnectingHint) {
                    reconnectingHint = document.createElement('div');
                    reconnectingHint.className = 'reconnecting-hint';
                    reconnectingHint.style.cssText = 'margin-top:8px;padding:4px 8px;background:#fff3cd;border-radius:4px;font-size:12px;color:#856404;text-align:center;';
                    el.appendChild(reconnectingHint);
                }
                reconnectingHint.innerHTML = '🔄 连接断开，正在重连... (第' + attemptNum + '次)' + qualityHint;
            } else {
                // 无内容时直接替换
                el.innerHTML = '连接断开，正在重连中<span class="loading-dots"></span>' + qualityHint;
            }
        }

        sessionState.eventSource.onerror = function() {
            console.log(`[DEBUG SSE onerror] sessionId: ${sessionId}, msgId: ${sessionState.msgId}, reconnectAttempt: ${reconnectAttempt}, generation: ${thisGeneration}, currentGen: ${sessionState._sseGeneration}, stoppedByUser: ${sessionState.stoppedByUser}, sseCompleted: ${sessionState.sseCompleted}`);

            // 代际检查：旧连接的 onerror 不应触发重连
            if (thisGeneration !== sessionState._sseGeneration) {
                console.log(`[SSE] 忽略旧连接 onerror: thisGeneration=${thisGeneration}, current=${sessionState._sseGeneration}`);
                return;
            }

            if (sessionState.doneTimeout) {
                clearTimeout(sessionState.doneTimeout);
                sessionState.doneTimeout = null;
            }

            // 用户主动停止，不触发重连
            if (sessionState.stoppedByUser) {
                if (sessionState.eventSource) {
                    sessionState.eventSource.close();
                    sessionState.eventSource = null;
                }
                sessionState.stoppedByUser = false;
                return;
            }

            // SSE 已正常完成（收到 done），不触发重连
            if (sessionState.sseCompleted) {
                if (sessionState.eventSource) {
                    sessionState.eventSource.close();
                    sessionState.eventSource = null;
                }
                sessionState.sseCompleted = false;
                return;
            }

            if (sessionState.msgId) {
                // 有活跃消息：关闭旧连接，手动控制重连
                if (sessionState.eventSource) {
                    sessionState.eventSource.close();
                    sessionState.eventSource = null;
                }
                // ===== 有限重连（最多5次，每次间隔5秒） =====
                const attemptNum = reconnectAttempt + 1;
                const MAX_SSE_RECONNECT_ATTEMPTS = 5;

                if (attemptNum > MAX_SSE_RECONNECT_ATTEMPTS) {
                    console.log(`会话 ${sessionId} SSE 连接断开，已达到最大重连次数 ${MAX_SSE_RECONNECT_ATTEMPTS}，停止重连`);
                    // 恢复状态栏为空闲状态
                    var _sBar2 = document.getElementById('status-bar');
                    if (_sBar2) {
                        _sBar2.style.display = 'none';
                        var _sText2 = _sBar2.querySelector('.status-text');
                        if (_sText2) _sText2.innerHTML = '空闲';
                    }
                    // 清理重连定时器
                    sessionState.reconnectAttempts = 0;
                    if (sessionState.reconnectTimer) {
                        clearTimeout(sessionState.reconnectTimer);
                        sessionState.reconnectTimer = null;
                    }
                    showAlert('error', '连接已断开，已终止任务！');
                    resetSendBtn();
                    if (sessionState.msgId) {
                        updateHistoryError(sessionState.msgId.replace('reply-', ''), '连接已断开，已终止任务！');
                        sessionState.msgId = null;
                    }
                    return;
                }

                const delay = 5000;
                console.log(`会话 ${sessionId} SSE 连接断开，${delay/1000}秒后尝试第 ${attemptNum}/${MAX_SSE_RECONNECT_ATTEMPTS} 次重连`);

                // 在消息气泡中显示重连状态
                const replyMsgId = sessionState.msgId.startsWith('reply-') ? sessionState.msgId : 'reply-' + sessionState.msgId;
                showReconnectingBubble(replyMsgId, attemptNum);

                // 同时更新状态栏
                const statusBar = document.getElementById('status-bar');
                if (statusBar) {
                    statusBar.style.display = 'flex';
                    const statusText = statusBar.querySelector('.status-text');
                    if (statusText) {
                        let qualityHint = '';
                        if (attemptNum >= 10) {
                            qualityHint = ' <span style="color:#e74c3c;">（网络质量极差）</span>';
                        } else if (attemptNum >= 5) {
                            qualityHint = ' <span style="color:#f39c12;">（网络不稳定）</span>';
                        }
                        statusText.innerHTML = '🔄 连接断开，正在重连 <span id="status-timer">' + attemptNum + '次</span>' + qualityHint;
                    }
                }

                // 启动状态轮询：在重连期间定期检查服务端执行状态
                let pollIntervalId = null;
                if (attemptNum <= 3) {
                    // 前 3 次重连不轮询（等待短时恢复）
                } else {
                    // 第 4 次起开始轮询，检测执行端是否还在线
                    if (!sessionState._pollInterval) {
                        sessionState._pollInterval = setInterval(function() {
                            if (sessionState.sseCompleted || sessionState.stoppedByUser) {
                                clearInterval(sessionState._pollInterval);
                                sessionState._pollInterval = null;
                                return;
                            }
                            // 使用 fetch 检查会话执行状态
                            fetch(host + '/api/session_exec_status?sessionId=' + encodeURIComponent(sessionId), {
                                headers: { 'Authorization': 'Bearer ' + currentToken },
                                signal: AbortSignal.timeout(5000)
                            }).then(function(r) { return r.json(); }).then(function(resp) {
                                if (resp.code === 200 && resp.data) {
                                    // 如果 cclaw 已离线且不再执行，结束等待
                                    if (!resp.data.isExecuting && !resp.data.cclawOnline) {
                                        console.log('[SSE 轮询] cclaw 已离线且执行结束');
                                        clearInterval(sessionState._pollInterval);
                                        sessionState._pollInterval = null;
                                        // 不自动结束，让重连确认最终状态
                                    }
                                    // 更新状态栏显示
                                    var sBar = document.getElementById('status-bar');
                                    if (sBar) {
                                        var sText = sBar.querySelector('.status-text');
                                        if (sText && sText.innerHTML.indexOf('重连') !== -1) {
                                            var hint = '';
                                            if (!resp.data.cclawOnline) hint = '（执行端离线）';
                                            else if (resp.data.isExecuting) hint = '（任务执行中）';
                                            else if (resp.data.isStale) hint = '（任务可能卡死）';
                                            sText.innerHTML = '🔄 正在重连' + hint + ' <span id="status-timer">' + attemptNum + '次</span>';
                                        }
                                    }
                                }
                            }).catch(function() {});
                        }, 5000);
                    }
                }

                sessionState.reconnectTimer = setTimeout(function() {
                    // 清除轮询定时器（会在下一次重连时重新创建）
                    if (sessionState._pollInterval) {
                        clearInterval(sessionState._pollInterval);
                        sessionState._pollInterval = null;
                    }
                    // 不重置 accumulatedOutput，保留已收到的内容
                    startSSE(msgId, sessionId, reconnectAttempt + 1);
                }, delay);
            } else {
                // 没有 msgId（空闲状态断线），不弹横幅，让浏览器 EventSource 自动重连
                // EventSource 内置了指数退避重连机制
                if (reconnectAttempt === 0) {
                    console.log(`[SSE] 空闲连接断开，EventSource 将自动重连`);
                }
            }
        };
    }

    function addHistory(cmd, msgId, sessionId) {
        const addContainer = _getChatContainer(sessionId) || document.getElementById('chat-box');
        const time = new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        const date = new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-');
        const fullTime = `${date} ${time}`;
        const safeCmd = encodeURIComponent(cmd).replace(/'/g, "%27");

        saveToLocalHistory({
            id: msgId,
            role: 'user',
            content: cmd,
            timestamp: Date.now()
        }, sessionId);

        // 用户消息
        addContainer.insertAdjacentHTML('beforeend', `
            <div class="msg-row user" id="row-${msgId}" style="flex-direction: row; align-items: center; justify-content: flex-end; width: 100%;">
                <div class="msg-wrapper user">
                    <div class="msg-bubble">${escapeHtml(cmd)}</div>
                    <div class="msg-time">${fullTime}
                        <i class="fa-solid fa-quote-left btn-action quote-btn" title="引用" onclick="quoteMessage('${msgId}', '${safeCmd}', 'user')"></i>
                        <i class="fa-regular fa-copy btn-action" title="复制" onclick="copyText(this, '${safeCmd}')"></i>
                        <i id="star-${msgId}" class="fa-regular fa-star btn-action" title="收藏" onclick="addFavorite(this, '${msgId}', '${safeCmd}')"></i>
                        <i class="fa-regular fa-trash-can btn-action" title="删除" onclick="deleteMessage('${msgId}')"></i>
                        <i class="fa-solid fa-pen-to-square btn-action" title="编辑" onclick="editMessage('${msgId}')"></i>
                        <i class="fa-solid fa-code-branch btn-action" title="分支" onclick="branchFromMessage('${msgId}')"></i>
                    </div>
                </div>
                <input type="checkbox" class="batch-checkbox" value="${msgId}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">
            </div>
        `);

        // AI 占位消息
        const replyMsgId = `reply-${msgId}`;
        const backendBadge = 'xCrab';
        addContainer.insertAdjacentHTML('beforeend', `
            <div class="msg-row ai" id="row-${replyMsgId}" style="flex-direction: row; align-items: center; justify-content: flex-start; width: 100%;">
                <input type="checkbox" class="batch-checkbox" value="${replyMsgId}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">
                <div class="msg-wrapper ai">
                    <div class="msg-bubble" id="${replyMsgId}">执行中<span class="loading-dots"></span></div>
                    <div class="msg-time" id="time-row-${replyMsgId}">
                        <span class="backend-badge ${currentBackend}">${backendBadge}</span>
                        <img id="play-btn-${replyMsgId}" class="btn-action" src="icon/play.png" title="播放语音" style="cursor:pointer; display:none;">
                    </div>
                </div>
            </div>
        `);
        
        // 更新会话状态，使用传入的 sessionId
        const sessionState = getSessionState(sessionId);
        sessionState.msgId = replyMsgId;
        
        scrollToBottom();
    }

    function updateHistoryResult(msgId, resultData) {
        const replyMsgId = `reply-${msgId}`;
        const replyEl = document.getElementById(replyMsgId);
        const rowEl = document.getElementById(`row-${replyMsgId}`);
        if (!replyEl) return;

        let output = resultData.stdout || '';
        let error = resultData.stderr || '';

        output = stripAnsi(output);
        error = stripAnsi(error);

        let finalContent = '';
        let status = 'success';
        if (error) {
            rowEl.classList.add('error');
            finalContent = error;
            status = 'error';
        } else {
            // 检测 SMS 触发标记 (内容@手机号@SMS_go)
            trySendSMS(output);
            finalContent = (output.trim() || '执行完成 (无输出)') + ' Exit';
        }

        // 保留已有的工具调用折叠块
        var _existingToolBlock = replyEl.querySelector('.tool-calls-block');
        var _toolBlockHtml = _existingToolBlock ? _existingToolBlock.outerHTML : '';
        replyEl.innerHTML = _toolBlockHtml + renderMessageContent(finalContent, false);

        // 非流式渲染完成后，渲染 Mermaid 图表
        renderMermaidBlocks(replyEl);

        // 更新时间戳和操作按钮
        const time = new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        const date = new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-');
        const fullTime = `${date} ${time}`;
        const safeContent = encodeURIComponent(finalContent).replace(/'/g, "%27");
        
        const existingTime = rowEl.querySelector('.msg-time');
        const backendLabel = 'xCrab';
        const backendHtml = `<span class="backend-badge ${currentBackend}">${backendLabel}</span>`;
        const resultActionsHtml = buildAiActionsHtml(replyMsgId, safeContent);
        if (existingTime) {
            existingTime.innerHTML = `${backendHtml}${fullTime} ${resultActionsHtml}`;
        } else {
            replyEl.insertAdjacentHTML('afterend', `<div class="msg-time">${backendHtml}${fullTime} ${resultActionsHtml}</div>`);
        }

        saveToLocalHistory({
            id: replyMsgId,
            role: 'ai',
            content: finalContent,
            status: status,
            timestamp: Date.now(),
            backend: currentBackend
        });
        
        scrollToBottom();
        
        // 自动播放：触发播放按钮点击
        if (ttsAutoPlayEnabled && status === 'success' && finalContent) {
            setTimeout(function() {
                var playBtn = document.getElementById('play-btn-' + replyMsgId);
                if (playBtn) playBtn.click();
            }, 300);
        }

        // AI 回复提醒（震动+铃声），与自动播放独立
        if (status === 'success' && finalContent) {
            triggerNotify();
        }
    }

    function updateHistoryError(msgId, errorMsg) {
        const replyMsgId = msgId.startsWith('reply-') ? msgId : `reply-${msgId}`;
        const replyEl = document.getElementById(replyMsgId);
        const rowEl = document.getElementById(`row-${replyMsgId}`);
        if (replyEl) {
            if (rowEl) rowEl.classList.add('error');
            
            // 如果原本是正常的，移除之前的样式并添加 error 样式
            if (rowEl) rowEl.classList.remove('success');

            replyEl.innerText = errorMsg;

            const time = new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
            const date = new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-');
            const fullTime = `${date} ${time}`;
            const safeContent = encodeURIComponent(errorMsg).replace(/'/g, "%27");
            const existingTime = rowEl ? rowEl.querySelector('.msg-time') : null;
            const errorBackendHtml = `<span class="backend-badge ${currentBackend}">${'xCrab'}</span>`;
            const errorActionsHtml = buildAiActionsHtml(replyMsgId, safeContent);
            if (existingTime) {
                existingTime.innerHTML = `${errorBackendHtml}${fullTime} ${errorActionsHtml}`;
            } else {
                replyEl.insertAdjacentHTML('afterend', `<div class="msg-time">${errorBackendHtml}${fullTime} ${errorActionsHtml}</div>`);
            }

            saveToLocalHistory({
                id: replyMsgId,
                role: 'ai',
                content: errorMsg,
                status: 'error',
                timestamp: Date.now(),
                backend: currentBackend
            });
            
            scrollToBottom();
        }
    }

    function toggleHeaderActions(event) {
        event.stopPropagation();
        const actions = document.getElementById('header-actions');
        actions.classList.toggle('open');
    }

    document.addEventListener('click', function(event) {
        const actions = document.getElementById('header-actions');
        const btnMore = document.querySelector('.btn-more-actions');
        if (actions && actions.classList.contains('open')) {
            if (!actions.contains(event.target) && !btnMore.contains(event.target)) {
                actions.classList.remove('open');
            }
        }
    });

    // ===== 一键切换大模型 =====
    function closeSwitchModel() {
        document.getElementById('switch-model-modal').style.display = 'none';
    }

    function updateModelButtons() {
        var isRestricted = currentPhone !== '18520937520';
        var dsBtn = document.getElementById('btn-model-deepseek');
        var mimoBtn = document.getElementById('btn-model-mimo');
        if (dsBtn) {
            dsBtn.disabled = isRestricted;
            dsBtn.style.opacity = isRestricted ? '0.4' : '1';
            dsBtn.style.pointerEvents = isRestricted ? 'none' : 'auto';
        }
        if (mimoBtn) {
            mimoBtn.disabled = isRestricted;
            mimoBtn.style.opacity = isRestricted ? '0.4' : '1';
            mimoBtn.style.pointerEvents = isRestricted ? 'none' : 'auto';
        }
    }

    async function executeSwitchModel(model) {
        closeSwitchModel();

        // 非授权手机号只允许使用 MiniMax-M3
        if (model !== 'minimax' && currentPhone !== '18520937520') {
            showAlert('error', '您的手机号无权切换至该模型，仅可使用 MiniMax-M3');
            return;
        }

        const modelName = model === 'deepseek' ? 'deepseek-v4-flash[1M]' : model === 'mimo' ? 'mimo-v2.5-pro[1M]' : 'MiniMax-M3';
        if (!confirm(`确定要切换至 ${modelName} 吗？\n\n切换过程中将:\n1. 更新本地配置\n2. 同步到云服务器\n3. 重启云服务器 ${currentBackend === 'xcrab' ? 'xCrab' : 'cclaw'} 服务\n\n请确认操作。`)) return;

        showAlert('info', `正在切换至 ${modelName}，请稍候...`);

        try {
            // xCrab 后端走 xCrab 的切换 API，否则走 cclaw 的
            const apiEndpoint = currentBackend === 'xcrab' ? '/api/xcrab/switch_model' : '/api/switch_model';
            const res = await fetch(host + apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ model }),
                signal: AbortSignal.timeout(30000)
            });
            const data = await res.json();

            if (data.code === 200) {
                // 切换系统模型成功后，禁用自定义模型
                try {
                    await fetch(host + '/api/custom_model/disable', {
                        method: 'PATCH',
                        headers: { 'Authorization': 'Bearer ' + currentToken },
                        signal: AbortSignal.timeout(5000)
                    });
                } catch (e) {
                    // 忽略禁用失败
                }
                showAlert('success', `✅ 已切换至 ${modelName}`);
                fetchCurrentModel();
                if (data.output) console.log(data.output);
            } else {
                showAlert('error', data.message || '切换失败');
                if (data.output) console.log(data.output);
            }
        } catch (e) {
            showAlert('error', '网络错误，切换失败');
        }
    }

    // ===== 自定义模型 =====
    var _customProvider = '';
    var _customModelsMap = {}; // { provider: { model_name, enabled } }
    var _customProviderDefaults = {
        deepseek: { name: 'DeepSeek', url: 'https://api.deepseek.com/anthropic', model: 'deepseek-v4-flash[1M]' },
        mimo:     { name: 'MiMo',     url: 'https://api.xiaomimimo.com/anthropic',     model: 'mimo-v2.5-pro' },
        minimax:  { name: 'MiniMax',  url: 'https://api.minimaxi.com/anthropic',    model: 'MiniMax-M3' },
    };

    function openCustomModel() {
        document.getElementById('custom-model-modal').style.display = 'flex';
        // 重置为步骤1
        document.getElementById('custom-provider-select').style.display = '';
        document.getElementById('custom-model-form').style.display = 'none';
        document.getElementById('custom-model-bottom-actions').style.display = 'none';
        _customProvider = '';
        // 加载所有已有配置
        loadAllCustomModels();
    }

    function closeCustomModel() {
        document.getElementById('custom-model-modal').style.display = 'none';
    }

    // 加载所有 provider 的配置概览
    async function loadAllCustomModels() {
        if (!currentToken) return;
        try {
            const res = await fetch(host + '/api/custom_model', {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            _customModelsMap = {};
            if (data.code === 200 && Array.isArray(data.data)) {
                data.data.forEach(function(item) {
                    _customModelsMap[item.provider] = { model_name: item.model_name, enabled: item.enabled };
                });
            }
            // 更新各 provider 按钮的状态标记
            ['deepseek', 'mimo', 'minimax'].forEach(function(p) {
                var el = document.getElementById('status-' + p);
                if (!el) return;
                var cfg = _customModelsMap[p];
                if (cfg) {
                    el.innerHTML = cfg.enabled
                        ? ' <span style="color:#10B981;">● 已启用</span>'
                        : ' <span style="color:var(--text-sub);">● 已配置</span>';
                } else {
                    el.innerHTML = '';
                }
            });
        } catch (e) {
            // 忽略
        }
    }

    // 更新状态显示（根据当前选中的 provider）
    function updateCustomModelStatus() {
        var statusEl = document.getElementById('custom-model-status');
        if (!statusEl) return;
        if (!_customProvider) {
            statusEl.style.display = 'none';
            return;
        }
        var cfg = _customModelsMap[_customProvider];
        if (!cfg) {
            statusEl.style.display = 'none';
            return;
        }
        var provName = _customProviderDefaults[_customProvider]?.name || _customProvider;
        statusEl.style.display = 'block';
        statusEl.innerHTML = '当前配置: <b>' + provName + '</b> / ' + cfg.model_name
            + (cfg.enabled ? ' <span style="color:#10B981;">● 已启用</span>' : ' <span style="color:var(--text-sub);">○ 未启用</span>')
            + '<div style="margin-top: 8px; display: flex; gap: 8px;">'
            + (cfg.enabled ? '' : '<button onclick="enableCustomModel()" style="flex:1; padding: 6px; border-radius: var(--radius-sm); background: #10B981; color: white; border: none; cursor: pointer; font-size: 12px;">启用</button>')
            + '<button onclick="editCustomModel()" style="flex:1; padding: 6px; border-radius: var(--radius-sm); background: var(--primary); color: white; border: none; cursor: pointer; font-size: 12px;">编辑</button>'
            + '<button onclick="testCustomModel()" style="flex:1; padding: 6px; border-radius: var(--radius-sm); background: #10B981; color: white; border: none; cursor: pointer; font-size: 12px;">测试连通</button>'
            + '<button onclick="deleteCustomModel()" style="flex:1; padding: 6px; border-radius: var(--radius-sm); background: #EF4444; color: white; border: none; cursor: pointer; font-size: 12px;">删除</button>'
            + '</div>';
    }

    // 编辑自定义模型：加载已有配置到表单
    async function editCustomModel() {
        if (!currentToken || !_customProvider) return;
        try {
            const res = await fetch(host + '/api/custom_model?provider=' + _customProvider + '&full=true', {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200 && data.data) {
                var d = data.data;
                var defaults = _customProviderDefaults[d.provider];
                document.getElementById('custom-provider-name').textContent = defaults?.name || d.provider;
                document.getElementById('custom-base-url').value = d.base_url;
                document.getElementById('custom-model-name').value = d.model_name;
                document.getElementById('custom-api-key').value = d.api_key || '';
                document.getElementById('custom-api-key').placeholder = '输入你的 API Key';
            } else {
                // 没有该 provider 的配置，使用默认值
                var defaults = _customProviderDefaults[_customProvider];
                document.getElementById('custom-provider-name').textContent = defaults?.name || _customProvider;
                document.getElementById('custom-base-url').value = defaults?.url || '';
                document.getElementById('custom-model-name').value = defaults?.model || '';
                document.getElementById('custom-api-key').value = '';
                document.getElementById('custom-api-key').placeholder = '输入你的 API Key';
            }
            document.getElementById('custom-provider-select').style.display = 'none';
            document.getElementById('custom-model-form').style.display = '';
        } catch (e) {
            showAlert('error', '加载配置失败');
        }
    }

    // 切换 API Key 显示/隐藏
    function toggleApiKeyVisibility() {
        var input = document.getElementById('custom-api-key');
        var btn = document.getElementById('toggle-api-key-btn');
        if (input.type === 'password') {
            input.type = 'text';
            btn.innerHTML = '&#128064;';
        } else {
            input.type = 'password';
            btn.innerHTML = '&#128065;';
        }
    }

    // 测试自定义模型连通性（测试当前表单输入的配置）
    async function testCustomModel() {
        if (!currentToken) return;
        var apiKey = document.getElementById('custom-api-key').value.trim();
        var baseUrl = document.getElementById('custom-base-url').value.trim();
        var modelName = document.getElementById('custom-model-name').value.trim();
        if (!apiKey) { showAlert('error', '请输入 API Key'); return; }
        if (!baseUrl) { showAlert('error', '请输入请求地址'); return; }
        if (!modelName) { showAlert('error', '请输入模型名称'); return; }
        showAlert('info', '正在测试连通性...');
        try {
            const res = await fetch(host + '/api/custom_model/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ api_key: apiKey, base_url: baseUrl, model_name: modelName, provider: _customProvider }),
                signal: AbortSignal.timeout(15000)
            });
            const data = await res.json();
            if (data.code === 200) {
                showAlert('success', '连通测试成功！模型响应正常');
            } else {
                showAlert('error', '连通测试失败: ' + (data.message || '未知错误'));
            }
        } catch (e) {
            showAlert('error', '测试请求失败: ' + e.message);
        }
    }

    // 启用自定义模型
    async function enableCustomModel() {
        if (!currentToken || !_customProvider) return;
        try {
            var res = await fetch(host + '/api/custom_model/enable', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ provider: _customProvider }),
                signal: AbortSignal.timeout(10000)
            });
            var data = await res.json();
            if (data.code === 200) {
                showAlert('success', '自定义模型已启用');
                closeCustomModel();
                fetchCurrentModel();
            } else {
                showAlert('error', data.message || '启用失败');
            }
        } catch (e) {
            showAlert('error', '网络错误，启用失败');
        }
    }

    // 删除自定义模型
    async function deleteCustomModel() {
        if (!currentToken || !_customProvider) return;
        if (!confirm('确定要删除 ' + (_customProviderDefaults[_customProvider]?.name || _customProvider) + ' 的配置吗？')) return;
        try {
            const res = await fetch(host + '/api/custom_model?provider=' + _customProvider, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200) {
                showAlert('success', '已删除配置');
                closeCustomModel();
                fetchCurrentModel();
            } else {
                showAlert('error', data.message || '删除失败');
            }
        } catch (e) {
            showAlert('error', '删除请求失败: ' + e.message);
        }
    }

    function selectCustomProvider(provider) {
        _customProvider = provider;
        // 更新状态显示
        updateCustomModelStatus();
        var defaults = _customProviderDefaults[provider];
        document.getElementById('custom-provider-name').textContent = defaults.name;
        document.getElementById('custom-base-url').value = defaults.url;
        document.getElementById('custom-model-name').value = defaults.model;
        document.getElementById('custom-api-key').value = '';
        document.getElementById('custom-api-key').placeholder = '输入你的 API Key';
        document.getElementById('custom-provider-select').style.display = 'none';
        document.getElementById('custom-model-form').style.display = '';
    }

    function goBackCustomProvider() {
        document.getElementById('custom-provider-select').style.display = '';
        document.getElementById('custom-model-form').style.display = 'none';
    }

    async function saveCustomModel() {
        var apiKey = document.getElementById('custom-api-key').value.trim();
        var baseUrl = document.getElementById('custom-base-url').value.trim();
        var modelName = document.getElementById('custom-model-name').value.trim();
        if (!apiKey) { showAlert('error', '请输入 API Key'); return; }
        if (!baseUrl) { showAlert('error', '请输入请求地址'); return; }
        if (!modelName) { showAlert('error', '请输入模型名称'); return; }
        try {
            var res = await fetch(host + '/api/custom_model', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ provider: _customProvider, api_key: apiKey, base_url: baseUrl, model_name: modelName, enabled: true }),
                signal: AbortSignal.timeout(10000)
            });
            var data = await res.json();
            if (data.code === 200) {
                showAlert('success', '自定义模型已保存并启用');
                closeCustomModel();
                fetchCurrentModel();
            } else {
                showAlert('error', data.message || '保存失败');
            }
        } catch (e) {
            showAlert('error', '网络错误，保存失败');
        }
    }

    // ===== 移动端浮动输入框（置于页面顶部，避免键盘遮挡） =====
    var _mobileInputActive = false;
    var _editingMsgId = null;  // 移动端编辑模式下的目标消息 ID（null 表示正常输入）

    function isMobile() {
        return window.innerWidth <= 768;
    }

    // 微信 X5 / TBS 内核检测
    // X5 内核对 position:fixed + display:flex 切换瞬间的 textarea focus 有已知 BUG
    function _isWechatX5() {
        try {
            var ua = (navigator.userAgent || '').toLowerCase();
            // 微信浏览器
            if (ua.indexOf('micromessenger') === -1) return false;
            // X5 / TBS 内核标识
            if (ua.indexOf('tbs/') !== -1) return true;
            if (ua.indexOf('qqbrowser') !== -1) return true;
            // 微信内置 WebView 默认就是 X5
            return true;
        } catch (e) { return false; }
    }

    function showMobileInput() {
        if (_mobileInputActive) return;
        _mobileInputActive = true;

        const overlay = document.getElementById('mobile-input-overlay');
        const mobileInput = document.getElementById('mobile-command');
        const cmdInput = document.getElementById('command');
        if (!overlay || !mobileInput) { _mobileInputActive = false; return; }

        // 同步当前输入框的文本
        mobileInput.value = cmdInput ? cmdInput.value : '';

        // ===== 微信 X5 内核 Bug 修复（强化版 v3）=====
        // X5 内核即使把 #command 设为 readonly，IME 输入仍然会路由到底层 #command。
        // 之前用的 readonly+blur 方案无效，X5 会忽略这些属性。
        // 真正的根因：X5 在 textarea 节点存在且非 display:none 时，会维持一个隐藏的 IME 通道绑定到该节点。
        // 修复方案：直接隐藏整个 .input-area（display:none + visibility:hidden），让 X5 完全释放 IME 通道。
        //         同时把 #command 设为不可见、不参与 IME 路由。
        if (cmdInput) {
            try {
                // 找到 #command 所在的 .input-area 容器，整体隐藏（X5 不再为其创建 IME 通道）
                var inputArea = cmdInput.closest('.input-area');
                if (inputArea && !inputArea._origDisplay) {
                    inputArea._origDisplay = inputArea.style.display;
                }
                if (inputArea) {
                    inputArea.style.display = 'none';
                    inputArea.setAttribute('aria-hidden', 'true');
                }

                // 同时隐藏 #command 自身（双保险，万一 .input-area 因为某些 CSS 规则被强制 display）
                if (typeof cmdInput._origDisplay === 'undefined') {
                    cmdInput._origDisplay = cmdInput.style.display;
                }
                cmdInput.style.display = 'none';
                cmdInput.setAttribute('tabindex', '-1');
                cmdInput.setAttribute('aria-hidden', 'true');
                cmdInput.setAttribute('inputmode', 'none');
                cmdInput.readOnly = true;
                cmdInput.setAttribute('aria-disabled', 'true');

                // 主动 blur，让 X5 把焦点彻底交出来（X5 blur 后会重置 IME 通道）
                try { cmdInput.blur(); } catch (e) {}
            } catch (e) { /* 兼容老浏览器 */ }
        }

        // 根据是否处于编辑模式切换标题/图标，给用户清晰反馈
        var titleText = document.getElementById('mobile-input-title-text');
        var titleIcon = document.getElementById('mobile-input-title-icon');
        if (_editingMsgId) {
            if (titleText) titleText.textContent = '编辑消息';
            if (titleIcon) { titleIcon.className = 'fa-solid fa-pen-to-square'; }
        } else {
            if (titleText) titleText.textContent = '输入指令';
            if (titleIcon) { titleIcon.className = 'fa-solid fa-keyboard'; }
        }

        var isX5 = _isWechatX5();

        if (isX5) {
            // ===== 微信 X5 内核专用路径 =====
            // X5 对 display:flex 切换瞬间的 .focus() 不响应，必须先 display:block → 强制 reflow → 等一帧 → 再 flex
            overlay.style.display = 'block';
            void overlay.offsetHeight;  // 强制 reflow，让 X5 完成第一阶段布局
            // 等一帧让 X5 完成渲染管线
            setTimeout(function() {
                overlay.style.display = 'flex';
                void overlay.offsetHeight;
                // X5 必须先模拟点击才能聚焦（直接 focus 在 fixed 容器里会被 X5 合成层丢弃）
                try {
                    mobileInput.click();  // 触发 X5 的可交互标记
                } catch (e) {}
                try {
                    mobileInput.focus();  // 不传 preventScroll，X5 不识别该参数
                } catch (e) {
                    try { mobileInput.focus(); } catch (e2) {}
                }
                // 光标移到末尾
                try {
                    if (mobileInput.value.length > 0) {
                        mobileInput.setSelectionRange(mobileInput.value.length, mobileInput.value.length);
                    }
                } catch (e) {}
            }, 50);
        } else {
            // ===== 其他浏览器（Chrome / Safari / Firefox）原路径 =====
            overlay.style.display = 'flex';
            void overlay.offsetHeight;
        }

        // 通用：解决失焦问题 —— 多次尝试 focus，持续抢回焦点（覆盖键盘弹起等异步流程）
        var focusAttempts = 0;
        var maxAttempts = isX5 ? 30 : 20;  // X5 需要更多次
        var interval = isX5 ? 100 : 150;
        function tryFocus() {
            if (!_mobileInputActive) return;
            focusAttempts++;
            if (document.activeElement !== mobileInput) {
                if (isX5) {
                    // X5 路径：先 click 再 focus
                    try { mobileInput.click(); } catch (e) {}
                }
                try {
                    mobileInput.focus();
                } catch (e) {
                    try { mobileInput.focus(); } catch (e2) {}
                }
                try {
                    if (mobileInput.value.length > 0) {
                        mobileInput.setSelectionRange(mobileInput.value.length, mobileInput.value.length);
                    }
                } catch (e) {}
            }
            if (focusAttempts < maxAttempts) {
                setTimeout(tryFocus, interval);
            }
        }
        // 立即触发第一帧
        requestAnimationFrame(function() {
            tryFocus();
        });
    }

    function closeMobileInput() {
        _mobileInputActive = false;
        const overlay = document.getElementById('mobile-input-overlay');
        if (!overlay) return;

        // 失焦，避免某些浏览器在 display:none 后还残留焦点状态
        const mobileInput = document.getElementById('mobile-command');
        if (mobileInput && document.activeElement === mobileInput) {
            try { mobileInput.blur(); } catch (e) {}
        }

        // 将浮动输入框的文本同步回原输入框
        const cmdInput = document.getElementById('command');
        if (mobileInput && cmdInput) {
            cmdInput.value = mobileInput.value;
            cmdInput.style.height = 'auto';
            // 恢复底层 #command 的原状态（X5 Bug 修复 v3）
            try {
                if (typeof cmdInput._origDisplay !== 'undefined') {
                    cmdInput.style.display = cmdInput._origDisplay;
                } else {
                    cmdInput.style.display = '';
                }
                cmdInput.removeAttribute('tabindex');
                cmdInput.removeAttribute('aria-hidden');
                cmdInput.removeAttribute('inputmode');
                cmdInput.removeAttribute('aria-disabled');
                cmdInput.readOnly = false;

                // 恢复 .input-area 容器
                var inputArea = cmdInput.closest('.input-area');
                if (inputArea) {
                    if (typeof inputArea._origDisplay !== 'undefined') {
                        inputArea.style.display = inputArea._origDisplay;
                    } else {
                        inputArea.style.display = '';
                    }
                    inputArea.removeAttribute('aria-hidden');
                }
            } catch (e) {}
        }
        overlay.style.display = 'none';

        // 用户主动关闭弹窗 = 取消编辑
        _editingMsgId = null;
    }

    async function sendMobileCommand() {
        const overlay = document.getElementById('mobile-input-overlay');
        const mobileInput = document.getElementById('mobile-command');
        const cmdInput = document.getElementById('command');
        if (!mobileInput || !cmdInput) return;

        const newText = mobileInput.value;
        const editingId = _editingMsgId;

        // 失焦，避免某些浏览器在 display:none 后还残留焦点状态
        if (document.activeElement === mobileInput) {
            try { mobileInput.blur(); } catch (e) {}
        }

        // 同步文本到原输入框
        cmdInput.value = newText;
        cmdInput.style.height = 'auto';

        // 恢复底层 #command 的原状态（X5 Bug 修复 v3）
        try {
            if (typeof cmdInput._origDisplay !== 'undefined') {
                cmdInput.style.display = cmdInput._origDisplay;
            } else {
                cmdInput.style.display = '';
            }
            cmdInput.removeAttribute('tabindex');
            cmdInput.removeAttribute('aria-hidden');
            cmdInput.removeAttribute('inputmode');
            cmdInput.removeAttribute('aria-disabled');
            cmdInput.readOnly = false;

            // 恢复 .input-area 容器
            var inputArea = cmdInput.closest('.input-area');
            if (inputArea) {
                if (typeof inputArea._origDisplay !== 'undefined') {
                    inputArea.style.display = inputArea._origDisplay;
                } else {
                    inputArea.style.display = '';
                }
                inputArea.removeAttribute('aria-hidden');
            }
        } catch (e) {}

        _mobileInputActive = false;
        _editingMsgId = null;

        // 关闭浮动输入框
        overlay.style.display = 'none';

        // 编辑模式：走 confirmEdit 流程（删除后续消息并重新发送）
        if (editingId) {
            await confirmEdit(editingId, newText);
            return;
        }

        // 正常模式：调用发送
        await sendCommand();
    }

    // 初始化浮动输入框
    function initMobileInput() {
        var _initialized = false;
        if (_initialized) return;
        _initialized = true;

        const cmdInput = document.getElementById('command');
        if (!cmdInput) return;

        // 用 pointerdown 拦截点击（在 focus 之前触发），阻止原输入框获得焦点弹键盘
        cmdInput.addEventListener('pointerdown', function(e) {
            if (isMobile()) {
                e.preventDefault();
                e.target.blur();
                showMobileInput();
            }
        });

        // 微信 X5 兼容：X5 内核对 pointerdown 支持不稳定，补充 touchstart 触发
        // 用 capture 阶段确保在 cmdInput 自带的 focus 之前拦截
        cmdInput.addEventListener('touchstart', function(e) {
            if (isMobile()) {
                e.preventDefault();
                try { e.target.blur(); } catch (err) {}
                showMobileInput();
            }
        }, { passive: false });

        // 兜底：X5 下有时所有指针事件都不触发，再用 click 兜一次
        cmdInput.addEventListener('click', function(e) {
            if (isMobile() && !_mobileInputActive) {
                e.preventDefault();
                showMobileInput();
            }
        });

        // 移动端输入框文本同步 + 按键处理
        const mobileInput = document.getElementById('mobile-command');
        if (mobileInput) {
            // mobile-command → command（保留原逻辑）
            mobileInput.addEventListener('input', function() {
                var target = document.getElementById('command');
                if (target) {
                    target.value = this.value;
                }
            });

            // ===== 微信 X5 内核 Bug 修复：反向同步 command → mobile-command =====
            // 即使我们把 #command 设为 readonly，X5 仍可能在某些时机把 IME 候选词写入 #command。
            // 这里做一道双保险：监听 #command 的 input 事件，把任何"漏过去"的文本反向同步给 mobile-command，
            // 保证用户在浮动框里永远能看到自己的输入。
            var cmdInput2 = document.getElementById('command');
            if (cmdInput2) {
                cmdInput2.addEventListener('input', function() {
                    // 仅在移动端浮动框激活期间才反向同步，避免误覆盖正常输入
                    if (typeof _mobileInputActive === 'undefined' || !_mobileInputActive) return;
                    var cur = document.getElementById('mobile-command');
                    if (!cur) return;
                    // 如果值不一致（X5 漏过去了），以 #command 的最新值为准并同步
                    if (cur.value !== cmdInput2.value) {
                        cur.value = cmdInput2.value;
                    }
                });
            }

            // 回车发送（Shift+Enter换行）
            mobileInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMobileCommand();
                }
            });
        }

        // 监听发送按钮状态，同步到浮动框的发送按钮
        var sendBtn = document.getElementById('send-btn');
        var mobileSendBtn = document.getElementById('mobile-send-btn');
        if (sendBtn && mobileSendBtn) {
            var sendObserver = new MutationObserver(function() {
                mobileSendBtn.disabled = sendBtn.disabled;
                if (sendBtn.style.display === 'none') {
                    mobileSendBtn.style.display = 'none';
                } else {
                    mobileSendBtn.style.display = '';
                }
            });
            sendObserver.observe(sendBtn, { attributes: true, attributeFilter: ['disabled', 'style'] });
        }

        // 监听停止按钮状态，同步到浮动框的停止按钮
        var stopBtn = document.getElementById('stop-btn');
        var mobileStopBtn = document.getElementById('mobile-stop-btn');
        if (stopBtn && mobileStopBtn) {
            var stopObserver = new MutationObserver(function() {
                mobileStopBtn.style.display = stopBtn.style.display;
            });
            stopObserver.observe(stopBtn, { attributes: true, attributeFilter: ['style'] });
        }
    }

    // DOM 加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileInput);
    } else {
        initMobileInput();
    }

