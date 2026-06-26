    function switchLoginMode(mode) {
        loginMode = mode;
        document.getElementById('mode-password').className = mode === 'password' ? 'login-mode-btn active' : 'login-mode-btn';
        document.getElementById('mode-sms').className = mode === 'sms' ? 'login-mode-btn active' : 'login-mode-btn';
        updateLoginUI();
    }

    function updateLoginUI() {
        const u = document.getElementById('username').value;
        const usernameGroup = document.getElementById('username-group');
        const passwordGroup = document.getElementById('password-group');
        const phoneGroup = document.getElementById('phone-group');
        const smsGroup = document.getElementById('sms-group');
        const rememberGroup = document.getElementById('remember-group');
        const loginModeSwitch = document.getElementById('login-mode-switch');

        if (currentTab === 'login') {
            loginModeSwitch.style.display = 'flex';
            rememberGroup.style.display = 'flex';

            if (loginMode === 'sms') {
                // 验证码登录模式：隐藏用户名和密码，显示手机号和验证码
                usernameGroup.style.display = 'none';
                passwordGroup.style.display = 'none';
                phoneGroup.style.display = 'block';
                smsGroup.style.display = 'flex';
            } else {
                // 密码登录模式：只需账号和密码，不需要手机号验证
                usernameGroup.style.display = 'block';
                passwordGroup.style.display = 'block';
                phoneGroup.style.display = 'none';
                smsGroup.style.display = 'none';
            }
        } else {
            // 注册和找回密码模式
            loginModeSwitch.style.display = 'none';
            rememberGroup.style.display = 'none';
            usernameGroup.style.display = 'block';
            passwordGroup.style.display = 'block';
            phoneGroup.style.display = 'block';
            smsGroup.style.display = 'flex';
        }
    }

        async function checkUsername() {
        if (currentTab !== 'register') return;
        const u = document.getElementById('username').value;
        if (!u) return;

        const usernameRegex = /^[a-zA-Z0-9一-龥]{1,7}$/;
        if (!usernameRegex.test(u)) {
            return showAlert('error', '用户名称最多只能是7个字符（支持中文、英文、数字）');
        }

        try {
            const res = await fetch(host + '/api/check_username', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: u }),
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200 && data.exist) {
                showAlert('error', data.message);
            }
        } catch (e) {
            console.error('检测账号失败', e);
        }
    }

    window.onload = function() {
        if (savedUser && savedPwd) {
            document.getElementById('username').value = savedUser;
            document.getElementById('password').value = savedPwd;
            document.getElementById('remember-pwd').checked = true;
        }

        document.getElementById('username').addEventListener('input', updateLoginUI);
        document.getElementById('username').addEventListener('blur', checkUsername);
        updateLoginUI();

        checkNotification();
        startHeartbeat();
        startRemoteStatusPolling();

        // 远程执行计时器：每 100ms 更新一次状态栏时间（仅当当前会话在远程执行列表中）
        setInterval(() => {
            if (currentSessionId in remoteExecutingSessions) {
                const sessionState = getSessionState(currentSessionId);
                if (!sessionState.isExecuting) {
                    // 只更新远程计时，不干扰本地执行的计时器
                    updateSendBtnBySessionState();
                }
            }
        }, 100);
    };

    window.addEventListener('beforeunload', function() {
        try {
            // 修复 sessionStates 未定义 bug：实际变量名是 sessionExecutionStates（在 app-base.js 中定义）
            const _states = (typeof sessionExecutionStates !== 'undefined') ? sessionExecutionStates : {};
            Object.values(_states).forEach(state => {
                if (state && state.eventSource) {
                    state.eventSource.close();
                    state.eventSource = null;
                }
            });
        } catch (e) {
            console.warn('[beforeunload] 清理 sessionStates 失败（不影响关闭）:', e);
        }
    });

    let _networkDisconnected = false;

    async function doHeartbeat() {
        const banner = document.getElementById('connection-error-banner');

        if (!currentToken) return;

        // 网络已判定断开后，不再发送任何心跳请求
        if (_networkDisconnected) return;

        try {
            console.log('[心跳] 发送请求:', host + '/api/client_status');
            const res = await fetch(host + '/api/client_status?t=' + Date.now(), {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(5000)
            });
            console.log('[心跳] 响应状态:', res.status, res.ok);

            if (res.ok) {
                const data = await res.json();
                console.log('[心跳] 响应数据:', data);
                if (data.code === 200) {
                    // 网络恢复，重置状态
                    _networkDisconnected = false;
                    heartbeatFailures = 0;

                    // 更新云端权限状态（仅用于展示信息）
                    if (data.canUseCloud !== undefined) {
                        currentCanUseCloud = data.canUseCloud;
                        var authBtn = document.getElementById('btn-auth-phones');
                        if (authBtn) authBtn.style.display = currentCanUseCloud ? 'flex' : 'none';
                    }
                    if (data.phone !== undefined) {
                        currentPhone = data.phone;
                    }

                    // xCrab 模式 + 已授权用户不需要 cclaw 连接
                    var xcrabAuthorized = data.isAuthorized && currentBackend === 'xcrab';

                    if (data.connected || xcrabAuthorized) {
                        banner.style.display = 'none';
                        document.getElementById('cclaw-warning-modal').style.display = 'none';
                    } else {
                        banner.style.display = 'none';
                        document.getElementById('cclaw-warning-modal').style.display = 'flex';

                        if (document.getElementById('stop-btn').style.display === 'flex') {
                            resetSendBtn();
                            const sessionState = getSessionState(currentSessionId);
                            if (sessionState.eventSource) {
                                sessionState.eventSource.close();
                                sessionState.eventSource = null;
                            }
                            if (sessionState.msgId) {
                                updateHistoryError(sessionState.msgId.replace('reply-', ''), '客户端已断开连接，任务意外终止');
                                sessionState.msgId = null;
                            }
                        }
                    }
                } else if (data.code === 401) {
                    // 登录凭据过期，直接跳转登录页，不显示断开连接横幅
                    currentToken = null;
                    localStorage.removeItem('token');
                    showAlert('error', '登录已过期，请重新登录');
                    setTimeout(() => location.reload(), 1500);
                    return;
                }
            } else {
                // HTTP 错误（非 401），才算心跳失败
                handleHeartbeatFailure(banner);
            }
        } catch (e) {
            // 网络请求失败，才算心跳失败
            handleHeartbeatFailure(banner);
        }
    }

    let _heartbeatTimer = null;

    function startHeartbeat() {
        // 立即执行一次心跳，获取用户信息（如 currentPhone）
        doHeartbeat();
        // 然后定时执行
        _heartbeatTimer = setInterval(doHeartbeat, HEARTBEAT_INTERVAL);
    }

    function handleHeartbeatFailure(banner) {
        heartbeatFailures++;
        console.log(`心跳检测失败 ${heartbeatFailures}/${MAX_HEARTBEAT_FAILURES}`);

        if (heartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
            // 标记网络已断开，阻止后续所有心跳请求
            _networkDisconnected = true;

            // 停止所有轮询定时器，不再继续发送请求
            if (_heartbeatTimer) {
                clearInterval(_heartbeatTimer);
                _heartbeatTimer = null;
            }
            if (_remotePollingTimer) {
                clearInterval(_remotePollingTimer);
                _remotePollingTimer = null;
            }

            console.log('心跳失败达到最大次数，判定网络已断开，已停止所有轮询');

            banner.style.display = 'block';

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

            // 弹出提示
            showAlert('error', '连接已断开，已终止任务！');
            // 不再设置自动恢复重试（避免无限循环请求）
            // 网络恢复后，SSE 重连机制（startSSE）会独立处理恢复
        }
    }

    let _remotePollingTimer = null;

    // 轮询远端 cclaw 执行状态（来自 status-monitor.js → 云端 /api/cclaw_exec_status）
    var _remoteIdleCount = 0; // 连续空闲计数（防抖用）
    function startRemoteStatusPolling() {
        _remotePollingTimer = setInterval(async () => {
            // 网络已断开，不再轮询
            if (_networkDisconnected) return;
            if (!currentToken) return;

            try {
                const res = await fetch(host + '/api/cclaw_exec_status?t=' + Date.now(), {
                    headers: { 'Authorization': 'Bearer ' + currentToken },
                    signal: AbortSignal.timeout(3000)
                });
                if (res.ok) {
                    const body = await res.json();
                    if (body.code === 200 && body.data) {
                        const statusEl = document.getElementById('remote-exec-status');
                        if (!statusEl) return;

                        const { executing, sessions, lastChanged } = body.data;
                        const remoteSessionIds = (sessions || []).map(s => s.sessionId).filter(Boolean);

                        // 更新远程会话列表：新增的会话记录开始时间，已结束的移除
                        const prevRemoteSessions = Object.keys(remoteExecutingSessions);

                        // 新增的远程会话（排除用户主动停止的会话）
                        remoteSessionIds.forEach(sid => {
                            if (!remoteExecutingSessions[sid] && sid !== window._userStoppedSession) {
                                remoteExecutingSessions[sid] = { since: Date.now() };
                            }
                        });

                        // 已结束的远程会话（需连续 2 次空闲才清除，防止单次误报）
                        if (remoteSessionIds.length === 0) {
                            _remoteIdleCount++;
                        } else {
                            _remoteIdleCount = 0;
                        }
                        if (_remoteIdleCount >= 2) {
                            prevRemoteSessions.forEach(sid => {
                                if (!remoteSessionIds.includes(sid)) {
                                    delete remoteExecutingSessions[sid];
                                }
                            });
                        }

                        // 用户主动停止的会话已不在远程列表中，清除标记
                        if (window._userStoppedSession && !remoteSessionIds.includes(window._userStoppedSession)) {
                            window._userStoppedSession = null;
                        }

                        // 判断当前会话是否在远程执行列表中
                        const isThisSessionRemote = currentSessionId in remoteExecutingSessions;

                        // 更新标题栏指示器（只反映当前会话的远程执行状态）
                        const backendName = 'xCrab';
                        if (isThisSessionRemote) {
                            statusEl.className = 'remote-status-executing';
                            statusEl.innerHTML = `<i class="fa-solid fa-cog fa-spin"></i> ${backendName} 执行中`;
                        } else {
                            statusEl.className = 'remote-status-idle';
                            statusEl.innerHTML = '⚪ 空闲';
                        }

                        // 更新当前会话的 UI
                        const sessionState = getSessionState(currentSessionId);
                        if (isThisSessionRemote && !sessionState.isExecuting) {
                            // 当前会话在远程执行中，且本地不认为在执行 → 显示远程执行状态
                            updateSendBtnBySessionState();
                        } else if (!isThisSessionRemote && !sessionState.isExecuting) {
                            // 当前会话不在远程执行中，本地也不在执行 → 恢复空闲状态
                            updateSendBtnBySessionState();
                        } else if (!isThisSessionRemote && sessionState.isExecuting && !sessionState.eventSource && !sessionState.reconnectTimer) {
                            // 远程已空闲但本地仍卡在执行状态，且 SSE 已断开且无重连中
                            // 需要连续多次空闲才强制恢复，防止单次误报导致按钮闪烁
                            if (!sessionState._remoteForceResetCount) sessionState._remoteForceResetCount = 0;
                            sessionState._remoteForceResetCount++;
                            if (sessionState._remoteForceResetCount >= 3) {
                                sessionState.isExecuting = false;
                                sessionState._remoteForceResetCount = 0;
                                updateSendBtnBySessionState();
                            }
                        } else {
                            // 其他情况（正在执行且 SSE 连接中），重置强制重置计数
                            if (sessionState._remoteForceResetCount) sessionState._remoteForceResetCount = 0;
                        }
                        // 如果本地正在执行且 SSE 还在连接中，保持本地状态不变
                    }
                }
            } catch (e) {
                // 静默忽略（网络问题等）
            }
        }, 3000);
    }

    async function checkNotification() {
        try {
            const res = await fetch(host + '/api/notification', {
                headers: currentToken ? { 'Authorization': 'Bearer ' + currentToken } : {},
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200 && data.data) {
                const notification = data.data;
                const isHidden = localStorage.getItem('hide_notification_' + notification.id);
                if (!isHidden) {
                    document.getElementById('notification-content').innerText = notification.content;
                    document.getElementById('notification-modal').style.display = 'flex';
                    document.getElementById('notification-modal').dataset.id = notification.id;
                }
            }
        } catch (e) {
            console.error('获取通知失败', e);
        }
    }

    function closeNotification() {
        document.getElementById('notification-modal').style.display = 'none';
    }

    function hideNotification() {
        const id = document.getElementById('notification-modal').dataset.id;
        if (id) {
            localStorage.setItem('hide_notification_' + id, 'true');
        }
        document.getElementById('notification-modal').style.display = 'none';
    }
    function switchTab(tab) {
        currentTab = tab;
        document.getElementById('tab-login').className = tab === 'login' ? 'tab active' : 'tab';
        document.getElementById('tab-register').className = tab === 'register' ? 'tab active' : 'tab';
        document.getElementById('tab-reset').className = tab === 'reset' ? 'tab active' : 'tab';

        let btnText = '连 接';
        if (tab === 'register') btnText = '注 册';
        if (tab === 'reset') btnText = '重 置 密 码';
        document.getElementById('btn-submit').innerText = btnText;

        if (tab === 'reset') {
            document.getElementById('password').placeholder = '新密码';
        } else {
            document.getElementById('password').placeholder = '密码';
        }

        const usernameHint = document.getElementById('username-hint');
        if (tab === 'register') {
            if (usernameHint) usernameHint.style.display = 'block';
        } else {
            if (usernameHint) usernameHint.style.display = 'none';
        }

        updateLoginUI();
    }

    function showAlert(type, message) {
        const toast = document.getElementById('toast');
        toast.className = 'alert ' + type;
        toast.innerText = message;
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 3000);
    }

    async function sendSms() {
        const phone = document.getElementById('phone').value;
        if (!phone) return showAlert('error', '请输入手机号');

        // 如果是密码登录模式，需要先输入账号来校验
        if (currentTab === 'login' && loginMode === 'password') {
            const u = document.getElementById('username').value;
            if (!u) return showAlert('error', '请输入账号');
            const usernameRegex = /^[a-zA-Z0-9一-龥]{1,7}$/;
            if (!usernameRegex.test(u)) {
                return showAlert('error', '用户名称最多只能是7个字符（支持中文、英文、数字）');
            }
            try {
                const resCheck = await fetch(host + '/api/check_username', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: u }),
                    signal: AbortSignal.timeout(10000)
                });
                const dataCheck = await resCheck.json();
                if (dataCheck.code === 200 && !dataCheck.exist) {
                    return showAlert('error', '该账号未注册，请注册');
                }
            } catch (e) {
                return showAlert('error', '网络错误，无法校验账号');
            }
        }

        // 注册和找回密码模式需要校验账号
        if (currentTab === 'register' || currentTab === 'reset') {
            const u = document.getElementById('username').value;
            if (!u) return showAlert('error', '请输入账号');
            const usernameRegex = /^[a-zA-Z0-9一-龥]{1,7}$/;
            if (!usernameRegex.test(u)) {
                return showAlert('error', '用户名称最多只能是7个字符（支持中文、英文、数字）');
            }
            if (currentTab === 'reset') {
                try {
                    const resCheck = await fetch(host + '/api/check_username', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: u }),
                        signal: AbortSignal.timeout(10000)
                    });
                    const dataCheck = await resCheck.json();
                    if (dataCheck.code === 200 && !dataCheck.exist) {
                        return showAlert('error', '该账号未注册，请注册');
                    }
                } catch (e) {
                    return showAlert('error', '网络错误，无法校验账号');
                }
            }
        }

        const btn = document.getElementById('btn-send-sms');
        btn.disabled = true;
        let count = 60;

        try {
            const res = await fetch(host + '/api/send_sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone }),
                signal: AbortSignal.timeout(15000)
            });
            const data = await res.json();
            if (data.code === 200) {
                showAlert('success', '验证码已发送');
                btn.innerText = `${count}s`;
                const timer = setInterval(() => {
                    count--;
                    btn.innerText = `${count}s`;
                    if (count <= 0) {
                        clearInterval(timer);
                        btn.disabled = false;
                        btn.innerText = '获取验证码';
                    }
                }, 1000);
            } else {
                showAlert('error', data.message || '发送失败');
                btn.disabled = false;
            }
        } catch (e) {
            showAlert('error', '网络错误');
            btn.disabled = false;
        }
    }

    async function submitAuth() {
        const u = document.getElementById('username').value;
        const p = document.getElementById('password').value;
        const phone = document.getElementById('phone').value;
        const code = document.getElementById('sms_code').value;
        const remember = document.getElementById('remember-pwd').checked;

        const isLogin = currentTab === 'login';
        const isReset = currentTab === 'reset';
        const isRegister = currentTab === 'register';

        // 验证码登录模式（仅登录时）
        if (isLogin && loginMode === 'sms') {
            if (!phone) return showAlert('error', '请输入手机号');
            if (!code) return showAlert('error', '请输入验证码');
        } else {
            // 密码登录、注册、找回密码模式
            if (!u) return showAlert('error', '请输入账号');
            if (!isReset && !p) return showAlert('error', '请输入密码');

            const usernameRegex = /^[a-zA-Z0-9一-龥]{1,7}$/;
            if (!usernameRegex.test(u)) {
                return showAlert('error', '用户名称最多只能是7个字符（支持中文、英文、数字）');
            }

            // 注册和找回密码模式需要验证手机号和验证码
            if (!isLogin) {
                const requiresSms = document.getElementById('phone-group').style.display !== 'none';
                if (requiresSms && (!phone || !code)) {
                    return showAlert('error', '请填写完整信息(含验证码)');
                }
            }
        }

        let endpoint = isLogin ? '/api/login' : '/api/register';
        if (isReset) endpoint = '/api/reset_password';

        const btn = document.getElementById('btn-submit');
        btn.disabled = true;
        btn.innerText = '处理中...';

        let payload;
        if (isLogin && loginMode === 'sms') {
            // 仅验证码登录
            payload = { phone, sms_code: code, login_mode: 'sms' };
        } else if (isReset) {
            payload = { username: u, new_password: p, phone, sms_code: code };
        } else {
            payload = { username: u, password: p, phone, sms_code: code };
            if (isLogin && document.getElementById('phone-group').style.display === 'none' && deviceToken) {
                payload.device_token = deviceToken;
            }
        }

        try {
            console.log('[登录] 请求:', host + endpoint, payload);
            const res = await fetch(host + endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(15000)
            });
            const data = await res.json();
            console.log('[登录] 响应:', data);

            if (data.code === 200) {
                if (isReset) {
                    showAlert('success', '密码重置成功，请登录');
                    switchTab('login');
                    document.getElementById('password').value = '';
                    document.getElementById('sms_code').value = '';
                } else if (isRegister) {
                    showAlert('success', '注册成功，请登录');
                    switchTab('login');
                    document.getElementById('sms_code').value = '';
                } else {
                    currentToken = data.data.token;
                    currentUser = data.data.username;
                    currentCanUseCloud = data.data.canUseCloud === true;
                    currentPhone = data.data.phone || null;
                    if (data.data.device_token) {
                        deviceToken = data.data.device_token;
                        localStorage.setItem('wclaw_device_token', deviceToken);
                        lastTrustedUser = u || phone;
                        localStorage.setItem('wclaw_last_trusted_user', lastTrustedUser);
                    }
                    localStorage.setItem('wclaw_token', currentToken);
                    localStorage.setItem('wclaw_user', currentUser);
                    syncTTSSettingsFromServer();

                    if (remember && u && p) {
                        localStorage.setItem('wclaw_saved_user', u);
                        localStorage.setItem('wclaw_saved_pwd', p);
                        savedUser = u;
                        savedPwd = p;
                    } else {
                        localStorage.removeItem('wclaw_saved_user');
                        localStorage.removeItem('wclaw_saved_pwd');
                        savedUser = null;
                        savedPwd = null;
                    }

                    showApp();
                    if (typeof connectNotificationSSE === 'function') connectNotificationSSE();
                    if (typeof updateHeaderBackend === 'function') updateHeaderBackend();
                }
            } else if (data.code === 409 && data.data && data.data.need_select) {
                // 多账号选择
                showAccountSelector(data.data.accounts, phone, code);
            } else {
                if (data.message && data.message.includes('新设备登录')) {
                    document.getElementById('phone-group').style.display = 'block';
                    document.getElementById('sms-group').style.display = 'flex';
                }
                showAlert('error', data.message || '操作失败');
            }
        } catch (e) {
            console.error('[登录] 错误:', e);
            showAlert('error', '网络错误，请稍后再试');
        } finally {
            btn.disabled = false;
            let btnText = '连 接';
            if (currentTab === 'register') btnText = '注 册';
            if (currentTab === 'reset') btnText = '重 置 密 码';
            btn.innerText = btnText;
        }
    }

    function showApp() {
        document.getElementById('login-area').style.display = 'none';
        document.getElementById('app-area').style.display = 'flex';
        loadSessions();
        fetchCurrentModel();
        // 缺陷9：从服务端同步会话（多设备场景）
        if (typeof syncSessionsFromServer === 'function') syncSessionsFromServer();
        // 建立持久化通知 SSE 连接
        connectNotificationSSE();
        // 显示授权按钮（仅 ad1009 可见）
        var authBtn = document.getElementById('btn-auth-phones');
        if (authBtn) authBtn.style.display = currentCanUseCloud ? 'flex' : 'none';
    }

    // ========== 多账号选择 ==========
    var pendingAccounts = [];
    var pendingPhone = '';
    var pendingSmsCode = '';

    function showAccountSelector(accounts, phone, smsCode) {
        pendingAccounts = accounts;
        pendingPhone = phone;
        pendingSmsCode = smsCode;

        var listHtml = accounts.map(function(acc) {
            return '<div class="account-option" onclick="selectAccount(\'' + acc + '\')" style="display:flex;align-items:center;padding:14px 16px;margin:6px 0;background:var(--input-bg);border:2px solid var(--border-light);border-radius:var(--radius-md);cursor:pointer;transition:all 0.2s;">'
                + '<i class="fa-solid fa-user" style="color:var(--primary);margin-right:12px;font-size:18px;"></i>'
                + '<span style="font-size:16px;font-weight:500;color:var(--text-main);">' + acc + '</span>'
                + '</div>';
        }).join('');

        document.getElementById('account-list').innerHTML = listHtml;
        document.getElementById('account-select-modal').style.display = 'flex';
    }

    function selectAccount(username) {
        document.getElementById('account-select-modal').style.display = 'none';
        confirmAccountLogin(username, pendingPhone, pendingSmsCode);
    }

    async function confirmAccountLogin(username, phone, smsCode) {
        var btn = document.getElementById('btn-submit');
        btn.disabled = true;
        btn.innerText = '处理中...';

        try {
            var res = await fetch(host + '/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: phone,
                    sms_code: smsCode,
                    login_mode: 'sms',
                    username: username
                }),
                signal: AbortSignal.timeout(15000)
            });
            var data = await res.json();

            if (data.code === 200) {
                currentToken = data.data.token;
                currentUser = data.data.username;
                currentCanUseCloud = data.data.canUseCloud === true;
                currentPhone = data.data.phone || null;
                if (data.data.device_token) {
                    deviceToken = data.data.device_token;
                    localStorage.setItem('wclaw_device_token', deviceToken);
                    lastTrustedUser = username;
                    localStorage.setItem('wclaw_last_trusted_user', lastTrustedUser);
                }
                localStorage.setItem('wclaw_token', currentToken);
                localStorage.setItem('wclaw_user', currentUser);
                syncTTSSettingsFromServer();

                showApp();
                if (typeof connectNotificationSSE === 'function') connectNotificationSSE();
                if (typeof updateHeaderBackend === 'function') updateHeaderBackend();
            } else {
                showAlert('error', data.message || '登录失败');
            }
        } catch (e) {
            showAlert('error', '网络错误，请稍后再试');
        } finally {
            btn.disabled = false;
            btn.innerText = '连 接';
        }
    }

    // ========== 授权管理 ==========

    async function openAuthPhonesModal() {
        document.getElementById('auth-phones-modal').style.display = 'flex';
        document.getElementById('header-actions').classList.remove('open');
        var listEl = document.getElementById('auth-phones-list');
        listEl.innerHTML = '<div style="text-align:center;padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</div>';

        try {
            var res = await fetch(host + '/api/auth_phones/list', {
                headers: { 'Authorization': 'Bearer ' + currentToken }
            });
            var data = await res.json();
            if (data.code !== 200) {
                listEl.innerHTML = '<div style="text-align:center;color:var(--danger);padding:20px;">加载失败</div>';
                return;
            }

            if (!data.data || data.data.length === 0) {
                listEl.innerHTML = '<div style="text-align:center;color:var(--text-sub);padding:20px;">暂无注册用户</div>';
                return;
            }

            listEl.innerHTML = data.data.map(function(user) {
                var phoneDisplay = user.phone ? escapeHtml(user.phone) : '<span style="color:var(--text-sub)">未绑定</span>';
                var toggleDisabled = !user.phone ? 'disabled' : '';
                var toggleOpacity = !user.phone ? 'opacity:0.4;pointer-events:none;' : '';
                return '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);">'
                    + '<div>'
                    + '<div style="font-weight:500;color:var(--text-main);">' + escapeHtml(user.username) + '</div>'
                    + '<div style="font-size:12px;color:var(--text-sub);">' + phoneDisplay + '</div>'
                    + '</div>'
                    + '<label class="auth-toggle" style="' + toggleOpacity + '">'
                    + '<input type="checkbox" ' + (user.authorized ? 'checked' : '') + ' ' + toggleDisabled
                    + ' onchange="toggleAuthPhone(\'' + escapeHtml(user.phone) + '\', this.checked, this)">'
                    + '<span class="auth-toggle-slider"></span>'
                    + '</label>'
                    + '</div>';
            }).join('');
        } catch (e) {
            listEl.innerHTML = '<div style="text-align:center;color:var(--danger);padding:20px;">网络错误</div>';
        }
    }

    async function toggleAuthPhone(phone, isChecked, checkboxEl) {
        var question = isChecked ? '是否给该手机号授权调用？' : '是否取消授权？';
        var action = isChecked ? '授权' : '取消授权';

        if (!confirm(question)) {
            checkboxEl.checked = !isChecked;
            return;
        }

        try {
            var endpoint = isChecked ? '/api/auth_phones/authorize' : '/api/auth_phones/revoke';
            var res = await fetch(host + endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ phone: phone })
            });
            var data = await res.json();
            if (data.code === 200) {
                showAlert('success', action + '成功');
                openAuthPhonesModal();
            } else {
                showAlert('error', data.message || action + '失败');
                checkboxEl.checked = !isChecked;
            }
        } catch (e) {
            showAlert('error', '网络错误');
            checkboxEl.checked = !isChecked;
        }
    }
